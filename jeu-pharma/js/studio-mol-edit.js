/**
 * Édition molécule / association / mini-groupe depuis le bloc studio.
 * Fiche : liste d’éléments par champ — colorés si visibles en leçon (payload.valeurs),
 * clic = bascule affichage, double-clic = modifier, × = retirer, + = ajouter.
 */
(function (global) {
  function esc(s) { return global.JpUi.escapeHtml(String(s ?? '')); }
  function sb() { return global.JpApp.sbJeu(); }
  function MED() { return global.JpMedicaments; }
  function ENT() { return global.JpEntites; }
  function TA() { return global.JpTypeahead; }

  var CLICK_DELAY_MS = 280;

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

  function itemsOfChamp(row, ch) {
    if (!row || !ch) return [];
    if (ch.card === 1) {
      const eid = row[ch.fk];
      const label = row[ch.code] || '';
      return eid && label ? [{ id: eid, label }] : (eid ? [{ id: eid, label: '—' }] : []);
    }
    return multiOf(row, ch.code);
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
    let clickTimer = null;

    function panelEl() {
      return ctx.host;
    }

    function clearClickTimer() {
      if (clickTimer) {
        clearTimeout(clickTimer);
        clickTimer = null;
      }
    }

    function close() {
      clearClickTimer();
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
      clearClickTimer();
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

    function swapVisible(matriceId, oldCid, newCid, wasOn) {
      if (!wasOn) return;
      if (oldCid) setVisible(matriceId, oldCid, false);
      if (newCid) setVisible(matriceId, newCid, true);
    }

    function cidFor(connRows, champCode, entiteId) {
      const hit = (connRows || []).find((r) => (
        r && r.champ_code === champCode && String(r.entite_id) === String(entiteId)
      ));
      return hit?.connaissance_id || null;
    }

    function mountEntiteCombo(host, table, initial, extra) {
      const o = extra || {};
      const c = TA().combo(host, {
        search: TA().entiteSource(table, { limit: 12, allowCreate: true }),
        minChars: 1,
        placeholder: o.placeholder || 'Rechercher…',
        ariaLabel: o.ariaLabel || 'Entité',
        initial: initial || null,
        clearOnPick: !!o.clearOnPick,
        onCreate: onCreateEntite(table),
        onPick: o.onPick,
        onChange: o.onChange,
      });
      ctrls.push(c);
      return c;
    }

    async function syncClassFk(matriceId, ch, entityIds) {
      if (!ch.fk || (ch.code !== 'classe_therapeutique' && ch.code !== 'classe_pharmacologique')) return;
      const { error } = await sb().from('matrice_medicaments')
        .update({ [ch.fk]: entityIds[0] || null, fiche_validee: false })
        .eq('id', matriceId);
      if (error) throw error;
    }

    async function setSingularEntity(matriceId, ch, entityId) {
      if (!ch.fk) throw new Error('Champ singulier invalide');
      const { error } = await sb().from('matrice_medicaments')
        .update({ [ch.fk]: entityId || null, fiche_validee: false })
        .eq('id', matriceId);
      if (error) throw error;
    }

    async function touchFiche(matriceId) {
      const { error } = await sb().from('matrice_medicaments')
        .update({ fiche_validee: false })
        .eq('id', matriceId);
      if (error) throw error;
    }

    async function writeMultiIds(matriceId, ch, ids) {
      const uniq = [];
      const seen = new Set();
      (ids || []).forEach((id) => {
        const s = String(id);
        if (!s || seen.has(s)) return;
        seen.add(s);
        uniq.push(id);
      });
      await MED().replaceLiaisons(matriceId, ch, uniq);
      if (ch.fk && (ch.code === 'classe_therapeutique' || ch.code === 'classe_pharmacologique')) {
        await syncClassFk(matriceId, ch, uniq);
      } else {
        await touchFiche(matriceId);
      }
    }

    async function openFiche(matriceId) {
      mode = 'fiche';
      activeMatriceId = matriceId;
      const el = openShell('Fiche molécule', '<p class="jp-mol-panel-hint">Chargement…</p>', '');
      if (!el) return;

      let row;
      let comps = [];
      let connRows = [];

      try {
        row = await MED().getById(matriceId);
        if (!row) throw new Error('Fiche introuvable');
        if (String(row.dci || '').includes(' + ')) {
          comps = await MED().listComposants(matriceId);
        }
        connRows = await listConnaissances(matriceId);
      } catch (e) {
        global.JpToast?.fromError?.(e);
        close();
        return;
      }

      function titleOf() {
        return (row.dci || 'Fiche') + (comps.length ? ' (asso)' : '');
      }

      function footHtml() {
        return '<a class="jp-btn jp-btn-ghost" href="' + esc(ctx.referentielHref(matriceId))
          + '" target="_blank" rel="noopener noreferrer">Ouvrir le référentiel</a>';
      }

      function paint() {
        clearClickTimer();
        // Ne garder que les typeaheads d’ajout / édition en cours → on les détruit tous au repaint.
        destroyCtrls(ctrls);

        let body = '<p class="jp-mol-panel-hint">'
          + 'Clic = affichage leçon · Double-clic = modifier · × = retirer de la fiche'
          + '</p>';
        if (comps.length) {
          body += '<p class="jp-mol-panel-hint">Association · composants : '
            + esc(comps.map((c) => c.dci || '—').join(' · ')) + '</p>';
        }
        body += '<div class="jp-mol-panel-fields" data-mol-fields></div>';
        openShell(titleOf(), body, footHtml());

        const fieldsBox = panelEl().querySelector('[data-mol-fields]');
        if (!fieldsBox) return;
        const champs = champsActifs();
        const vis = visibleSet(matriceId);

        champs.forEach((ch) => {
          const items = itemsOfChamp(row, ch);
          const canRemove = ch.code !== 'dci';
          const canAdd = ch.card === 'N' || items.length === 0;

          const sec = document.createElement('div');
          sec.className = 'jp-mol-panel-field';
          sec.setAttribute('data-mol-champ', ch.code);

          let head = '<div class="jp-mol-field-head">'
            + '<label>' + esc(ch.libelle) + '</label>';
          if (canAdd) {
            head += '<button type="button" class="jp-mol-add-btn" data-mol-add="'
              + esc(ch.code) + '" title="Ajouter" aria-label="Ajouter">+</button>';
          }
          head += '</div>';
          sec.innerHTML = head
            + '<div class="jp-mol-panel-vals" data-mol-vals="' + esc(ch.code) + '"></div>'
            + '<div class="jp-mol-add-row" data-mol-add-row="' + esc(ch.code) + '" hidden></div>';

          const valsBox = sec.querySelector('[data-mol-vals]');
          if (!items.length) {
            valsBox.innerHTML = '<p class="jp-mol-empty">Aucun élément</p>';
          } else {
            items.forEach((it) => {
              const cid = cidFor(connRows, ch.code, it.id);
              const on = cid && vis.has(String(cid));
              const item = document.createElement('div');
              item.className = 'jp-mol-item' + (on ? ' is-on' : '');
              item.setAttribute('data-entite-id', String(it.id));
              item.setAttribute('data-champ', ch.code);
              if (cid) item.setAttribute('data-cid', String(cid));
              item.setAttribute('tabindex', '0');
              item.setAttribute('role', 'button');
              item.setAttribute('aria-pressed', on ? 'true' : 'false');
              item.title = on
                ? 'Visible en leçon — clic pour masquer · double-clic pour modifier'
                : 'Masqué en leçon — clic pour afficher · double-clic pour modifier';
              item.innerHTML = '<span class="jp-mol-item-label">' + esc(it.label || '—') + '</span>'
                + (canRemove
                  ? '<button type="button" class="jp-mol-item-rm" data-mol-rm title="Retirer" aria-label="Retirer">×</button>'
                  : '');
              valsBox.appendChild(item);
            });
          }

          fieldsBox.appendChild(sec);
        });

        bindFieldInteractions(fieldsBox);
      }

      function bindFieldInteractions(fieldsBox) {
        fieldsBox.querySelectorAll('.jp-mol-item').forEach((itemEl) => {
          itemEl.addEventListener('click', (ev) => {
            if (ev.target.closest('[data-mol-rm]')) return;
            if (ev.detail > 1) return;
            clearClickTimer();
            const champ = itemEl.getAttribute('data-champ');
            const entiteId = itemEl.getAttribute('data-entite-id');
            clickTimer = setTimeout(() => {
              clickTimer = null;
              void toggleItemVisibility(champ, entiteId, itemEl);
            }, CLICK_DELAY_MS);
          });
          itemEl.addEventListener('dblclick', (ev) => {
            ev.preventDefault();
            clearClickTimer();
            if (ev.target.closest('[data-mol-rm]')) return;
            const champ = itemEl.getAttribute('data-champ');
            const entiteId = itemEl.getAttribute('data-entite-id');
            startEditItem(itemEl, champ, entiteId);
          });
          itemEl.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter' || ev.key === ' ') {
              ev.preventDefault();
              void toggleItemVisibility(
                itemEl.getAttribute('data-champ'),
                itemEl.getAttribute('data-entite-id'),
                itemEl
              );
            }
          });
        });

        fieldsBox.querySelectorAll('[data-mol-rm]').forEach((btn) => {
          btn.addEventListener('click', (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            clearClickTimer();
            const itemEl = btn.closest('.jp-mol-item');
            if (!itemEl) return;
            void removeItem(
              itemEl.getAttribute('data-champ'),
              itemEl.getAttribute('data-entite-id'),
              itemEl.querySelector('.jp-mol-item-label')?.textContent || ''
            );
          });
        });

        fieldsBox.querySelectorAll('[data-mol-add]').forEach((btn) => {
          btn.addEventListener('click', () => {
            clearClickTimer();
            const code = btn.getAttribute('data-mol-add');
            openAddRow(code);
          });
        });
      }

      async function ensureCid(champCode, entiteId) {
        let cid = cidFor(connRows, champCode, entiteId);
        if (cid) return cid;
        try {
          connRows = await listConnaissances(matriceId);
        } catch (e) {
          global.JpToast?.fromError?.(e);
          return null;
        }
        return cidFor(connRows, champCode, entiteId);
      }

      async function toggleItemVisibility(champCode, entiteId, itemEl) {
        const cid = await ensureCid(champCode, entiteId);
        if (!cid) {
          global.JpToast?.warn?.('Connaissance introuvable pour cet élément');
          return;
        }
        const on = visibleSet(matriceId).has(String(cid));
        setVisible(matriceId, cid, !on);
        if (itemEl?.isConnected) {
          itemEl.classList.toggle('is-on', !on);
          itemEl.setAttribute('aria-pressed', !on ? 'true' : 'false');
          itemEl.setAttribute('data-cid', String(cid));
          itemEl.title = !on
            ? 'Visible en leçon — clic pour masquer · double-clic pour modifier'
            : 'Masqué en leçon — clic pour afficher · double-clic pour modifier';
        }
      }

      function closeTransientEditors(exceptAddRow) {
        destroyCtrls(ctrls);
        panelEl().querySelectorAll('[data-mol-add-row]').forEach((r) => {
          if (exceptAddRow && r === exceptAddRow) return;
          r.hidden = true;
          r.innerHTML = '';
        });
        panelEl().querySelectorAll('.jp-mol-item.is-editing').forEach((el) => {
          el.classList.remove('is-editing');
          const lab = el.querySelector('.jp-mol-item-label');
          if (lab) lab.hidden = false;
          el.querySelector('[data-mol-edit-host]')?.remove();
        });
      }

      function openAddRow(champCode) {
        const ch = champsActifs().find((c) => c.code === champCode);
        const rowHost = panelEl().querySelector('[data-mol-add-row="' + champCode + '"]');
        if (!ch || !rowHost) return;
        closeTransientEditors(rowHost);

        rowHost.hidden = false;
        rowHost.innerHTML = '<div data-mol-add-ta></div>'
          + '<button type="button" class="jp-btn jp-btn-ghost jp-mol-add-cancel" data-mol-add-cancel>Annuler</button>';
        const taHost = rowHost.querySelector('[data-mol-add-ta]');
        const combo = mountEntiteCombo(taHost, ch.table, null, {
          placeholder: 'Ajouter…',
          ariaLabel: 'Ajouter ' + ch.libelle,
          clearOnPick: true,
          onPick: (it) => {
            rowHost.hidden = true;
            rowHost.innerHTML = '';
            void addItem(ch, it);
          },
        });
        rowHost.querySelector('[data-mol-add-cancel]')?.addEventListener('click', () => {
          closeTransientEditors();
        });
        setTimeout(() => combo.focus?.(), 30);
      }

      function startEditItem(itemEl, champCode, entiteId) {
        const ch = champsActifs().find((c) => c.code === champCode);
        if (!ch || !itemEl) return;
        closeTransientEditors();

        itemEl.classList.add('is-editing');
        const labelEl = itemEl.querySelector('.jp-mol-item-label');
        if (labelEl) labelEl.hidden = true;
        const host = document.createElement('div');
        host.className = 'jp-mol-edit-host';
        host.setAttribute('data-mol-edit-host', '');
        itemEl.insertBefore(host, itemEl.querySelector('[data-mol-rm]') || null);

        const initialLabel = labelEl?.textContent || '';
        const combo = mountEntiteCombo(host, ch.table, { id: entiteId, label: initialLabel }, {
          placeholder: 'Modifier…',
          ariaLabel: 'Modifier ' + ch.libelle,
          onPick: (it) => {
            void replaceItem(ch, entiteId, it);
          },
        });
        setTimeout(() => {
          combo.focus?.();
          combo.input?.addEventListener('keydown', (ev) => {
            if (ev.key === 'Escape') {
              ev.preventDefault();
              paint();
            }
          });
        }, 30);
      }

      async function addItem(ch, it) {
        if (!it?.id) return;
        try {
          if (ch.card === 1) {
            if (ch.code === 'dci') {
              const saved = await MED().save({
                statut: row.statut || 'brouillon',
                singular: { dci: { id: it.id } },
                multi: {},
              }, matriceId);
              activeMatriceId = saved.id;
              matriceId = saved.id;
              row = saved;
              if (String(row.dci || '').includes(' + ')) {
                comps = await MED().listComposants(matriceId);
              } else comps = [];
            } else {
              await setSingularEntity(matriceId, ch, it.id);
            }
          } else {
            const cur = itemsOfChamp(row, ch).map((x) => x.id);
            if (cur.some((id) => String(id) === String(it.id))) {
              global.JpToast?.warn?.('Déjà présent');
              return;
            }
            await writeMultiIds(matriceId, ch, cur.concat([it.id]));
          }
          row = await MED().getById(matriceId);
          connRows = await listConnaissances(matriceId);
          const newCid = cidFor(connRows, ch.code, it.id);
          if (newCid) setVisible(matriceId, newCid, true);
          ctx.addMatriceToBloc?.({
            id: row.id,
            label: row.dci || it.label,
            sub: MED().formatNoms?.(row) || '',
          });
          paint();
          global.JpToast?.ok?.('Élément ajouté');
        } catch (e) {
          global.JpToast?.fromError?.(e);
        }
      }

      async function replaceItem(ch, oldId, it) {
        if (!it?.id) return;
        if (String(it.id) === String(oldId)) {
          paint();
          return;
        }
        const oldCid = cidFor(connRows, ch.code, oldId);
        const wasOn = oldCid && visibleSet(matriceId).has(String(oldCid));
        try {
          if (ch.card === 1) {
            if (ch.code === 'dci') {
              const saved = await MED().save({
                statut: row.statut || 'brouillon',
                singular: { dci: { id: it.id } },
                multi: {},
              }, matriceId);
              activeMatriceId = saved.id;
              matriceId = saved.id;
              row = saved;
              if (String(row.dci || '').includes(' + ')) {
                comps = await MED().listComposants(matriceId);
              } else comps = [];
            } else {
              await setSingularEntity(matriceId, ch, it.id);
              row = await MED().getById(matriceId);
            }
          } else {
            const cur = itemsOfChamp(row, ch).map((x) => x.id);
            const next = cur.map((id) => (String(id) === String(oldId) ? it.id : id));
            await writeMultiIds(matriceId, ch, next);
            row = await MED().getById(matriceId);
          }
          connRows = await listConnaissances(matriceId);
          const newCid = cidFor(connRows, ch.code, it.id);
          swapVisible(matriceId, oldCid, newCid, wasOn);
          ctx.addMatriceToBloc?.({
            id: row.id,
            label: row.dci || it.label,
            sub: MED().formatNoms?.(row) || '',
          });
          paint();
          global.JpToast?.ok?.('Élément modifié');
        } catch (e) {
          global.JpToast?.fromError?.(e);
          paint();
        }
      }

      async function removeItem(champCode, entiteId, label) {
        const ch = champsActifs().find((c) => c.code === champCode);
        if (!ch || ch.code === 'dci') return;
        const msg = 'Retirer « ' + (label || 'cet élément') + ' » de la fiche ?';
        if (!global.confirm(msg)) return;
        const oldCid = cidFor(connRows, champCode, entiteId);
        try {
          if (ch.card === 1) {
            await setSingularEntity(matriceId, ch, null);
          } else {
            const next = itemsOfChamp(row, ch)
              .map((x) => x.id)
              .filter((id) => String(id) !== String(entiteId));
            await writeMultiIds(matriceId, ch, next);
          }
          if (oldCid) setVisible(matriceId, oldCid, false);
          row = await MED().getById(matriceId);
          connRows = await listConnaissances(matriceId);
          ctx.addMatriceToBloc?.({
            id: row.id,
            label: row.dci || '—',
            sub: MED().formatNoms?.(row) || '',
          });
          paint();
          global.JpToast?.ok?.('Élément retiré');
        } catch (e) {
          global.JpToast?.fromError?.(e);
        }
      }

      paint();
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

    /**
     * Groupe : même langage visuel (éléments colorés = présents sur les fiches sélectionnées
     * n’est pas dispo sans chargement lourd) — on garde Ajouter/Retirer, avec typeahead discret.
     */
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
        + ' fiches — saisir une entité puis Ajouter / Retirer sur toutes. '
        + 'Sur une fiche seule : clic = affichage leçon.</p>';
      multiChamps.forEach((ch) => {
        body += '<div class="jp-mol-panel-field" data-grp-champ="' + esc(ch.code) + '">'
          + '<div class="jp-mol-field-head"><label>' + esc(ch.libelle) + '</label></div>'
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
        if (remove) {
          const ok = global.confirm(
            'Retirer « ' + (it.label || 'cet élément') + ' » des ' + ids.length + ' fiches ?'
          );
          if (!ok) return;
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
                .update({ [ch.fk]: cur[0] || null, fiche_validee: false }).eq('id', mid);
            }
          }
          if (!remove) {
            for (const mid of ids) {
              const rows = await listConnaissances(mid);
              const hit = rows.find((r) => r.champ_code === code && String(r.entite_id) === String(it.id));
              if (hit?.connaissance_id) setVisible(mid, hit.connaissance_id, true);
            }
          } else {
            for (const mid of ids) {
              const rows = await listConnaissances(mid);
              const hit = rows.find((r) => r.champ_code === code && String(r.entite_id) === String(it.id));
              if (hit?.connaissance_id) setVisible(mid, hit.connaissance_id, false);
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
