/**
 * Édition molécule / association / mini-groupe depuis le bloc studio.
 * Réutilise JpMedicaments + JpTypeahead.entiteSource(allowCreate).
 * Visibilité leçon = payload.valeurs[matrice_id] (connaissance_ids).
 */
(function (global) {
  function esc(s) { return global.JpUi.escapeHtml(String(s ?? '')); }
  function sb() { return global.JpApp.sbJeu(); }
  function MED() { return global.JpMedicaments; }
  function ENT() { return global.JpEntites; }
  function TA() { return global.JpTypeahead; }

  function champsActifs() {
    return (global.JpConstants?.champsActifs?.() || global.JpConstants?.CHAMP_CODES || [])
      .filter((c) => c && c.actif !== false);
  }

  function multiOf(row, code) {
    if (!row) return [];
    if (code === 'nom_commercial') {
      return (row.noms_commerciaux || []).filter((x) => x && x.id)
        .map((x) => ({ id: x.id, label: MED().labelFrom(x) }));
    }
    const arr = Array.isArray(row[code]) ? row[code] : [];
    return arr.filter((x) => x && x.id).map((x) => ({ id: x.id, label: MED().labelFrom(x) }));
  }

  function onCreateEntite(table) {
    return async function (label) {
      const ent = await ENT().findOrCreate(table, label);
      if (!ent?.id) return null;
      return { id: ent.id, label: ent.valeur || label };
    };
  }

  function destroyCtrls(ctrls) {
    (ctrls || []).forEach((c) => {
      try { c?.destroy?.(); } catch (_) { /* ignore */ }
    });
    ctrls.length = 0;
  }

  /**
   * @param {{
   *   host: HTMLElement,
   *   blocId: string,
   *   getLayer: () => { matrice_ids: string[], valeurs: Record<string, string[]> },
   *   writeLayer: (layer) => void,
   *   saveDraft: () => Promise<void>,
   *   addMatriceToBloc: (item: {id,label,sub?}) => void,
   *   moduleId?: string,
   *   referentielHref: (id: string) => string,
   * }} ctx
   */
  function createController(ctx) {
    const ctrls = [];
    let mode = null; // fiche | create | asso | groupe
    let activeMatriceId = null;

    function panelEl() {
      return ctx.host;
    }

    function close() {
      destroyCtrls(ctrls);
      mode = null;
      activeMatriceId = null;
      const el = panelEl();
      if (el) {
        el.hidden = true;
        el.innerHTML = '';
      }
    }

    function openShell(title, bodyHtml, footHtml) {
      destroyCtrls(ctrls);
      const el = panelEl();
      if (!el) return null;
      el.hidden = false;
      el.innerHTML = '<div class="jp-mol-panel-head">'
        + '<h4>' + esc(title) + '</h4>'
        + '<button type="button" class="jp-btn jp-btn-ghost" data-mol-panel-close>Fermer</button>'
        + '</div>'
        + bodyHtml
        + (footHtml ? '<div class="jp-mol-panel-foot">' + footHtml + '</div>' : '');
      el.querySelector('[data-mol-panel-close]')?.addEventListener('click', close);
      return el;
    }

    async function listConnaissances(matriceId) {
      const { data, error } = await sb().rpc('v2_lister_connaissances_matrice', {
        p_matrice_id: matriceId,
        p_module_id: ctx.moduleId || null,
      });
      if (error) throw error;
      return Array.isArray(data) ? data : [];
    }

    function visibleSet(matriceId) {
      const layer = ctx.getLayer();
      return new Set((layer.valeurs?.[matriceId] || []).map(String));
    }

    function setVisible(matriceId, connaissanceId, on) {
      const layer = ctx.getLayer();
      const mid = String(matriceId);
      const cid = String(connaissanceId);
      const cur = new Set((layer.valeurs[mid] || []).map(String));
      if (on) cur.add(cid);
      else cur.delete(cid);
      if (cur.size) layer.valeurs[mid] = Array.from(cur);
      else delete layer.valeurs[mid];
      ctx.writeLayer(layer);
      void ctx.saveDraft();
    }

    function mountEntiteCombo(host, table, initial) {
      const c = TA().combo(host, {
        search: TA().entiteSource(table, { limit: 12, allowCreate: true }),
        minChars: 1,
        placeholder: 'Rechercher…',
        ariaLabel: 'Entité',
        initial: initial || null,
        onCreate: onCreateEntite(table),
      });
      ctrls.push(c);
      return c;
    }

    function mountEntiteChips(host, table, initial) {
      const c = TA().chips(host, {
        search: TA().entiteSource(table, { limit: 12, allowCreate: true }),
        minChars: 1,
        placeholder: 'Ajouter…',
        ariaLabel: 'Ajouter une valeur',
        initial: initial || [],
        onCreate: onCreateEntite(table),
      });
      ctrls.push(c);
      return c;
    }

    function paintVisRows(box, rows, matriceId) {
      const vis = visibleSet(matriceId);
      const byChamp = {};
      (rows || []).forEach((r) => {
        if (!r || r.champ_code === 'dci') return;
        (byChamp[r.champ_code] = byChamp[r.champ_code] || []).push(r);
      });
      const champs = champsActifs();
      let html = '';
      champs.forEach((ch) => {
        const vals = byChamp[ch.code];
        if (!vals || !vals.length) return;
        html += '<div class="jp-mol-panel-field" data-vis-champ="' + esc(ch.code) + '">'
          + '<label>' + esc(ch.libelle) + ' — visible en leçon</label>'
          + '<div class="jp-mol-panel-vals">';
        vals.forEach((v) => {
          const on = vis.has(String(v.connaissance_id));
          html += '<label class="jp-mol-vis">'
            + '<input type="checkbox" data-vis-cid="' + esc(v.connaissance_id) + '"'
            + (on ? ' checked' : '') + '>'
            + '<span>' + esc(v.texte || '—') + '</span>'
            + (on ? '<em>visible</em>' : '')
            + '</label>';
        });
        html += '</div></div>';
      });
      box.innerHTML = html || '<p class="jp-mol-panel-hint">Aucune valeur référentiel pour l’instant.</p>';
      box.querySelectorAll('input[data-vis-cid]').forEach((inp) => {
        inp.addEventListener('change', () => {
          setVisible(matriceId, inp.getAttribute('data-vis-cid'), inp.checked);
          const em = inp.parentElement?.querySelector('em');
          if (inp.checked) {
            if (!em) {
              const tag = document.createElement('em');
              tag.textContent = 'visible';
              inp.parentElement.appendChild(tag);
            }
          } else if (em) em.remove();
        });
      });
    }

    async function openFiche(matriceId) {
      mode = 'fiche';
      activeMatriceId = matriceId;
      const el = openShell('Fiche molécule', '<p class="jp-mol-panel-hint">Chargement…</p>', '');
      if (!el) return;
      let row;
      let comps = [];
      try {
        row = await MED().getById(matriceId);
        if (!row) throw new Error('Fiche introuvable');
        if (String(row.dci || '').includes(' + ')) {
          comps = await MED().listComposants(matriceId);
        }
      } catch (e) {
        global.JpToast?.fromError?.(e);
        close();
        return;
      }

      const champs = champsActifs();
      let fieldsHtml = '<p class="jp-mol-panel-hint">Réutiliser une entité existante ; « Créer » apparaît seulement s’il n’y a aucun résultat.</p>';
      if (comps.length) {
        fieldsHtml += '<p class="jp-mol-panel-hint">Association · composants : '
          + esc(comps.map((c) => c.dci || '—').join(' · ')) + '</p>';
      }
      fieldsHtml += '<div class="jp-mol-panel-fields" data-mol-fields></div>'
        + '<div class="jp-mol-panel-fields" data-mol-vis style="margin-top:0.5rem"></div>';

      const foot = '<a class="jp-btn jp-btn-ghost" href="' + esc(ctx.referentielHref(matriceId))
        + '" target="_blank" rel="noopener noreferrer">Ouvrir le référentiel</a>'
        + '<button type="button" class="jp-btn jp-btn-primary" data-mol-save>Enregistrer la fiche</button>';

      openShell((row.dci || 'Fiche') + (comps.length ? ' (asso)' : ''), fieldsHtml, foot);
      const fieldsBox = panelEl().querySelector('[data-mol-fields]');
      const visBox = panelEl().querySelector('[data-mol-vis]');
      const formCtrls = {};

      champs.forEach((ch) => {
        const wrap = document.createElement('div');
        wrap.className = 'jp-mol-panel-field';
        wrap.innerHTML = '<label>' + esc(ch.libelle) + '</label><div data-ta="' + esc(ch.code) + '"></div>';
        fieldsBox.appendChild(wrap);
        const host = wrap.querySelector('[data-ta]');
        if (ch.card === 1) {
          const eid = row[ch.fk];
          const label = row[ch.code] || '';
          formCtrls[ch.code] = mountEntiteCombo(host, ch.table, eid && label ? { id: eid, label } : null);
        } else {
          formCtrls[ch.code] = mountEntiteChips(host, ch.table, multiOf(row, ch.code));
        }
      });

      async function refreshVis() {
        try {
          const rows = await listConnaissances(matriceId);
          paintVisRows(visBox, rows, matriceId);
        } catch (e) {
          global.JpToast?.fromError?.(e);
        }
      }
      await refreshVis();

      panelEl().querySelector('[data-mol-save]')?.addEventListener('click', () => void (async () => {
        const singular = {};
        const multi = {};
        champs.forEach((ch) => {
          const ctrl = formCtrls[ch.code];
          if (!ctrl) return;
          if (ch.card === 1) {
            const it = ctrl.getItem?.();
            if (it?.id) singular[ch.code] = { id: it.id };
            else if (ctrl.input?.value?.trim()) singular[ch.code] = { valeur: ctrl.input.value.trim() };
          } else {
            multi[ch.code] = (ctrl.getItems?.() || []).map((it) => ({ id: it.id, valeur: it.label }));
          }
        });
        try {
          const saved = await MED().save({
            statut: row.statut || 'brouillon',
            singular,
            multi,
          }, matriceId);
          activeMatriceId = saved.id;
          global.JpToast?.ok?.('Fiche enregistrée');
          ctx.addMatriceToBloc?.({
            id: saved.id,
            label: saved.dci || row.dci,
            sub: MED().formatNoms?.(saved) || '',
          });
          await refreshVis();
        } catch (e) {
          global.JpToast?.fromError?.(e);
        }
      })());
    }

    function openCreate() {
      mode = 'create';
      const body = '<p class="jp-mol-panel-hint">Saisir une DCI. Si elle existe, la fiche s’ouvre ; sinon une nouvelle matrice est créée.</p>'
        + '<div class="jp-mol-panel-field"><label>DCI</label><div data-mol-dci></div></div>';
      const foot = '<button type="button" class="jp-btn jp-btn-primary" data-mol-create>Créer / ouvrir</button>';
      openShell('Nouvelle molécule', body, foot);
      const dciCtrl = mountEntiteCombo(panelEl().querySelector('[data-mol-dci]'), 'dcis', null);
      panelEl().querySelector('[data-mol-create]')?.addEventListener('click', () => void (async () => {
        let it = dciCtrl.getItem?.();
        const typed = String(dciCtrl.input?.value || '').trim();
        if (!it && typed) {
          try {
            it = await onCreateEntite('dcis')(typed);
            if (it) dciCtrl.setItem?.(it, true);
          } catch (e) {
            global.JpToast?.fromError?.(e);
            return;
          }
        }
        if (!it?.id) {
          global.JpToast?.warn?.('Choisissez ou créez une DCI');
          return;
        }
        try {
          let row = await MED().findByDciId(it.id);
          if (!row) {
            row = await MED().save({
              statut: 'brouillon',
              singular: { dci: { id: it.id } },
              multi: {},
            }, null);
            global.JpToast?.ok?.('Molécule créée');
          } else {
            global.JpToast?.ok?.('Fiche existante ouverte');
          }
          ctx.addMatriceToBloc({
            id: row.id,
            label: row.dci || it.label,
            sub: MED().formatNoms?.(row) || '',
          });
          await openFiche(row.id);
        } catch (e) {
          global.JpToast?.fromError?.(e);
        }
      })());
      setTimeout(() => dciCtrl.focus?.(), 40);
    }

    function openAsso() {
      mode = 'asso';
      const body = '<p class="jp-mol-panel-hint">Choisir au moins 2 molécules mono. La DCI combinée « A + B » est réutilisée si elle existe.</p>'
        + '<div class="jp-mol-panel-field"><label>Composants (ordre = libellé)</label>'
        + '<div data-mol-asso-comps></div></div>'
        + '<p class="jp-mol-asso-preview" data-mol-asso-prev></p>';
      const foot = '<button type="button" class="jp-btn jp-btn-primary" data-mol-asso-go>Créer l’association</button>';
      openShell('Nouvelle association', body, foot);
      const prev = panelEl().querySelector('[data-mol-asso-prev]');
      const compsCtrl = TA().chips(panelEl().querySelector('[data-mol-asso-comps]'), {
        search: TA().matriceSource({ limit: 15 }),
        minChars: 1,
        placeholder: 'Ajouter un composant…',
        ariaLabel: 'Composants',
        onChange: (items) => {
          prev.textContent = items.length >= 2
            ? items.map((x) => x.label).join(' + ')
            : 'Au moins 2 composants requis';
        },
      });
      ctrls.push(compsCtrl);

      panelEl().querySelector('[data-mol-asso-go]')?.addEventListener('click', () => void (async () => {
        const items = compsCtrl.getItems?.() || [];
        if (items.length < 2) {
          global.JpToast?.warn?.('Sélectionnez au moins 2 molécules');
          return;
        }
        const dciLabel = items.map((x) => x.label).join(' + ');
        try {
          const dciEnt = await ENT().findOrCreate('dcis', dciLabel);
          if (!dciEnt?.id) throw new Error('DCI association impossible');
          let row = await MED().findByDciId(dciEnt.id);
          if (!row) {
            row = await MED().save({
              statut: 'brouillon',
              singular: { dci: { id: dciEnt.id } },
              multi: {},
            }, null);
          }
          await MED().replaceComposants(row.id, items.map((x) => x.id));
          global.JpToast?.ok?.(row.dci ? 'Association prête' : 'Association créée');
          ctx.addMatriceToBloc({
            id: row.id,
            label: row.dci || dciLabel,
            sub: MED().formatNoms?.(row) || '',
          });
          await openFiche(row.id);
        } catch (e) {
          global.JpToast?.fromError?.(e);
        }
      })());
    }

    function openGroupe(matriceIds) {
      const ids = (matriceIds || []).filter(Boolean);
      if (ids.length < 2) {
        global.JpToast?.warn?.('Cochez au moins 2 molécules');
        return;
      }
      mode = 'groupe';
      activeMatriceId = null;
      const multiChamps = champsActifs().filter((c) => c.card === 'N');
      let body = '<p class="jp-mol-panel-hint">' + ids.length
        + ' fiches sélectionnées — l’entité choisie est ajoutée (ou retirée) sur toutes.</p>';
      multiChamps.forEach((ch) => {
        body += '<div class="jp-mol-panel-field" data-grp-champ="' + esc(ch.code) + '">'
          + '<label>' + esc(ch.libelle) + '</label>'
          + '<div class="jp-mol-group-ops">'
          + '<div data-grp-ta="' + esc(ch.code) + '"></div>'
          + '<button type="button" class="jp-btn jp-btn-ghost" data-grp-add="' + esc(ch.code) + '">Ajouter</button>'
          + '<button type="button" class="jp-btn jp-btn-ghost" data-grp-rm="' + esc(ch.code) + '">Retirer</button>'
          + '</div></div>';
      });
      openShell('Groupe (' + ids.length + ')', body, '');
      const grpCtrls = {};
      multiChamps.forEach((ch) => {
        const host = panelEl().querySelector('[data-grp-ta="' + ch.code + '"]');
        if (!host) return;
        grpCtrls[ch.code] = mountEntiteCombo(host, ch.table, null);
      });

      async function applyGroup(code, remove) {
        const ch = multiChamps.find((c) => c.code === code);
        const ctrl = grpCtrls[code];
        if (!ch || !ctrl) return;
        let it = ctrl.getItem?.();
        const typed = String(ctrl.input?.value || '').trim();
        if (!it && typed) {
          try { it = await onCreateEntite(ch.table)(typed); } catch (e) {
            global.JpToast?.fromError?.(e);
            return;
          }
        }
        if (!it?.id) {
          global.JpToast?.warn?.('Choisissez une entité');
          return;
        }
        try {
          for (const mid of ids) {
            const row = await MED().getById(mid);
            if (!row) continue;
            let cur = multiOf(row, ch.code).map((x) => x.id);
            if (remove) cur = cur.filter((id) => String(id) !== String(it.id));
            else if (!cur.some((id) => String(id) === String(it.id))) cur = cur.concat([it.id]);
            await MED().replaceLiaisons(mid, ch, cur);
            if (ch.fk && (ch.code === 'classe_therapeutique' || ch.code === 'classe_pharmacologique')) {
              await sb().from('matrice_medicaments')
                .update({ [ch.fk]: cur[0] || null }).eq('id', mid);
            }
          }
          // Visibilité optionnelle : cocher sur toutes si connaissance existe
          if (!remove) {
            for (const mid of ids) {
              const rows = await listConnaissances(mid);
              const hit = rows.find((r) => r.champ_code === code && String(r.entite_id) === String(it.id));
              if (hit?.connaissance_id) setVisible(mid, hit.connaissance_id, true);
            }
          }
          global.JpToast?.ok?.(remove ? 'Entité retirée du groupe' : 'Entité ajoutée au groupe');
          ctrl.clear?.(true);
        } catch (e) {
          global.JpToast?.fromError?.(e);
        }
      }

      panelEl().querySelectorAll('[data-grp-add]').forEach((btn) => {
        btn.addEventListener('click', () => void applyGroup(btn.getAttribute('data-grp-add'), false));
      });
      panelEl().querySelectorAll('[data-grp-rm]').forEach((btn) => {
        btn.addEventListener('click', () => void applyGroup(btn.getAttribute('data-grp-rm'), true));
      });
    }

    return {
      close,
      openFiche,
      openCreate,
      openAsso,
      openGroupe,
      getMode: () => mode,
      getActiveMatriceId: () => activeMatriceId,
    };
  }

  global.JpStudioMolEdit = { createController };
})(window);
