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

  /**
   * Valeurs déjà sur les fiches du groupe.
   * Même id d’entité, ou même libellé (assoNorm) → une ligne.
   * Chaque molécule garde ses propres ids pour un retrait ciblé.
   */
  function groupMultiEntries(members, ch) {
    const occ = [];
    (members || []).forEach((m) => {
      multiOf(m.row, ch.code).forEach((it) => {
        const id = it && it.id ? String(it.id) : '';
        const label = String((it && it.label) || '').trim();
        if (!id && !label) return;
        occ.push({
          id: id,
          label: label,
          index: m.index,
          mid: m.id,
          dci: m.dci || '—',
        });
      });
    });
    const parent = occ.map((_, i) => i);
    function find(i) {
      while (parent[i] !== i) {
        parent[i] = parent[parent[i]];
        i = parent[i];
      }
      return i;
    }
    function unite(a, b) {
      let ra = find(a);
      let rb = find(b);
      if (ra === rb) return;
      if (ra < rb) parent[rb] = ra;
      else parent[ra] = rb;
    }
    const byId = new Map();
    const byNorm = new Map();
    occ.forEach((o, i) => {
      if (o.id) {
        if (byId.has(o.id)) unite(i, byId.get(o.id));
        else byId.set(o.id, i);
      }
      const norm = global.JpConstants.assoNorm(o.label);
      if (norm) {
        if (byNorm.has(norm)) unite(i, byNorm.get(norm));
        else byNorm.set(norm, i);
      }
    });
    const order = [];
    const buckets = new Map();
    occ.forEach((o, i) => {
      const root = find(i);
      if (!buckets.has(root)) {
        buckets.set(root, []);
        order.push(root);
      }
      buckets.get(root).push(o);
    });
    return order.map((root) => {
      const list = buckets.get(root);
      let label = '';
      const byIndex = new Map();
      list.forEach((o) => {
        if (o.label.length > label.length) label = o.label;
        let slot = byIndex.get(o.index);
        if (!slot) {
          slot = { index: o.index, mid: o.mid, dci: o.dci, ids: [] };
          byIndex.set(o.index, slot);
        }
        if (o.id && slot.ids.indexOf(o.id) < 0) slot.ids.push(o.id);
      });
      const carriers = Array.from(byIndex.values()).sort((a, b) => a.index - b.index);
      return {
        label: label || '—',
        indexes: carriers.map((c) => c.index),
        carriers: carriers,
      };
    });
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
    let panelSeq = 0;

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
      panelSeq += 1;
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
      setVisibleMany([{ matriceId, connaissanceId, on }]);
    }

    /** Applique plusieurs coches leçon en un seul writeLayer / saveDraft. */
    function setVisibleMany(ops) {
      if (!ops || !ops.length) return;
      const layer = ctx.getLayer();
      ops.forEach((op) => {
        if (!op || !op.matriceId || !op.connaissanceId) return;
        const mid = String(op.matriceId);
        const cid = String(op.connaissanceId);
        const cur = new Set((layer.valeurs[mid] || []).map(String));
        if (op.on) cur.add(cid);
        else cur.delete(cid);
        if (cur.size) layer.valeurs[mid] = Array.from(cur);
        else delete layer.valeurs[mid];
      });
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
        onCreate: o.onCreate || onCreateEntite(table),
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
      panelSeq += 1;
      mode = 'fiche';
      activeMatriceId = matriceId;
      const el = openShell('Fiche molécule', '<p class="jp-mol-panel-hint">Chargement…</p>', '');
      if (!el) return;

      let row;
      let comps = [];
      let connRows = [];
      let compSources = [];

      try {
        row = await MED().getById(matriceId);
        if (!row) throw new Error('Fiche introuvable');
        const listed = await MED().listComposants(matriceId);
        if (listed.length >= 2) comps = listed;
        connRows = await listConnaissances(matriceId);
        if (comps.length >= 2) {
          compSources = (await Promise.all(comps.map(async (c, i) => {
            try {
              const [rowC, conns] = await Promise.all([
                MED().getById(c.id),
                listConnaissances(c.id),
              ]);
              return rowC ? { comp: c, row: rowC, conns, index: i } : null;
            } catch (_) {
              return null;
            }
          }))).filter(Boolean);
        }
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
        const keepScroll = panelEl()?.querySelector('[data-mol-fields]')?.scrollTop || 0;
        // Ne garder que les typeaheads d’ajout / édition en cours → on les détruit tous au repaint.
        destroyCtrls(ctrls);

        let body = '<p class="jp-mol-panel-hint">'
          + (comps.length >= 2
            ? 'Valeurs colorées : amenées par les molécules séparées (en leçon si elles y sont affichées). Le reste se règle ici.'
            : 'Clic = affichage leçon · Double-clic = modifier · × = retirer de la fiche')
          + '</p>';
        if (comps.length >= 2) {
          body += '<div class="jp-mol-asso-legend" role="list">';
          comps.forEach((c, i) => {
            const css = global.JpConstants.assoStyle(global.JpConstants.assoTones([i], comps));
            body += '<span class="jp-mol-asso-pill" role="listitem" style="' + esc(css) + '">'
              + esc(c.dci || 'Composant') + '</span>';
          });
          body += '</div>';
        }
        body += '<div class="jp-mol-panel-fields" data-mol-fields></div>';
        openShell(titleOf(), body, footHtml());

        const fieldsBox = panelEl().querySelector('[data-mol-fields]');
        if (!fieldsBox) return;
        fieldsBox.scrollTop = keepScroll;
        const champs = champsActifs();
        const vis = visibleSet(matriceId);
        const heritageEntries = [];
        compSources.forEach((src) => {
          champs.forEach((ch) => {
            if (ch.code === 'dci' || ch.code === 'nom_commercial') return;
            itemsOfChamp(src.row, ch).forEach((it) => {
              const cid = cidFor(src.conns, ch.code, it.id);
              const on = !!(cid && visibleSet(src.comp.id).has(String(cid)));
              heritageEntries.push({
                champ: ch.code,
                id: it.id,
                label: it.label,
                index: src.index,
                on,
              });
            });
          });
        });
        const heritage = global.JpConstants.groupHeritage(heritageEntries);
        const brought = (code, label) => (heritage[code] || []).some((it) => (
          global.JpConstants.assoNorm(it.label) === global.JpConstants.assoNorm(label)
        ));

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
          const inherited = (comps.length >= 2 && ch.code !== 'dci' && ch.code !== 'nom_commercial')
            ? (heritage[ch.code] || [])
            : [];
          const ownItems = items.filter((it) => !brought(ch.code, it.label));
          if (!inherited.length && !ownItems.length) {
            valsBox.innerHTML = '<p class="jp-mol-empty">Aucun élément</p>';
          } else {
            inherited.forEach((it) => {
              const tones = global.JpConstants.assoTones(it.indexes, comps);
              const names = (it.indexes || []).map((i) => comps[i] && comps[i].dci).filter(Boolean);
              const item = document.createElement('div');
              item.className = 'jp-mol-item jp-mol-heritage' + (it.on ? ' is-on' : '');
              item.style.cssText = global.JpConstants.assoStyle(tones);
              item.title = (names.join(' · ') || 'Molécule séparée')
                + (it.on ? ' — affiché en leçon' : ' — présent sur la fiche, non affiché en leçon');
              item.innerHTML = '<span class="jp-mol-item-label">' + esc(it.label || '—') + '</span>'
                + (it.on ? '<span class="jp-mol-heritage-flag">en leçon</span>' : '');
              valsBox.appendChild(item);
            });
            ownItems.forEach((it) => {
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
        fieldsBox.querySelectorAll('.jp-mol-item:not(.jp-mol-heritage)').forEach((itemEl) => {
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
          // « Créer » en édition = renommer l’entité (guard proche dans JpEntites.update).
          onCreate: async (label) => {
            try {
              const row = await ENT().update(ch.table, entiteId, { valeur: label });
              if (!row?.id) return null;
              return { id: row.id, label: row.valeur || label };
            } catch (e) {
              if (e && (e.code === 'proche' || /trop proche/i.test(String(e.message || '')))) {
                global.JpToast?.warn?.(e.message || 'Libellé trop proche d’un élément existant');
              } else {
                global.JpToast?.fromError?.(e);
              }
              return null;
            }
          },
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
          // Renommage in-place : recharger la fiche pour le nouveau libellé.
          try {
            row = await MED().getById(matriceId);
            connRows = await listConnaissances(matriceId);
            ctx.addMatriceToBloc?.({
              id: row.id,
              label: row.dci || it.label,
              sub: MED().formatNoms?.(row) || '',
            });
            paint();
            global.JpToast?.ok?.('Élément renommé');
          } catch (e) {
            global.JpToast?.fromError?.(e);
            paint();
          }
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
      panelSeq += 1;
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
      panelSeq += 1;
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
            kind: 'asso',
          });
          await openFiche(row.id);
        } catch (e) {
          global.JpToast?.fromError?.(e);
        }
      })());
    }

    /** Groupe : contenu actuel, une couleur par molécule, retrait ciblé, ajout à toutes. */
    function openGroupe(matriceIds) {
      const ids = (matriceIds || []).filter(Boolean);
      if (ids.length < 2) {
        global.JpToast?.warn?.('Cochez au moins 2 molécules');
        return;
      }
      const seq = ++panelSeq;
      mode = 'groupe';
      activeMatriceId = null;
      const multiChamps = champsActifs().filter((c) => c.card === 'N');
      const toneComps = ids.map(() => ({}));
      let busy = false;
      let grpCtrls = {};

      function still() {
        return seq === panelSeq && mode === 'groupe';
      }

      function grpOnCount(ch, g, connByMid) {
        let on = 0;
        (g.carriers || []).forEach((c) => {
          const conns = connByMid[String(c.mid)] || [];
          const vis = visibleSet(c.mid);
          const eids = (c.ids || []).map(String);
          const hit = conns.find((r) => (
            r && r.champ_code === ch.code && eids.indexOf(String(r.entite_id)) >= 0
          ));
          if (hit?.connaissance_id && vis.has(String(hit.connaissance_id))) on += 1;
        });
        return on;
      }

      function render(members, scrollTop, connByMid) {
        grpCtrls = {};
        const body = '<div class="jp-mol-asso-legend" role="list" data-grp-legend></div>'
          + '<p class="jp-mol-panel-hint">Une couleur par molécule. × retire d’une molécule. « Tout le groupe » complète les manquantes. '
          + 'Double-clic sur une valeur = l’afficher en leçon pour toutes les molécules du groupe qui l’ont déjà. Ajouter le met sur toutes.</p>'
          + '<div class="jp-mol-panel-fields" data-grp-fields></div>';
        const el = openShell('Groupe (' + members.length + ')', body, '');
        if (!el || !still()) return;

        const legend = el.querySelector('[data-grp-legend]');
        const fieldsBox = el.querySelector('[data-grp-fields]');
        if (!legend || !fieldsBox) return;
        const connsMap = connByMid || {};

        members.forEach((m) => {
          const pill = document.createElement('span');
          pill.className = 'jp-mol-asso-pill';
          pill.setAttribute('role', 'listitem');
          pill.style.cssText = global.JpConstants.assoStyle([
            global.JpConstants.assoTone({}, m.index),
          ]);
          pill.textContent = m.dci || '—';
          legend.appendChild(pill);
        });

        multiChamps.forEach((ch) => {
          const sec = document.createElement('div');
          sec.className = 'jp-mol-panel-field';
          sec.setAttribute('data-grp-champ', ch.code);

          const head = document.createElement('div');
          head.className = 'jp-mol-field-head';
          const lab = document.createElement('label');
          lab.textContent = ch.libelle;
          head.appendChild(lab);
          sec.appendChild(head);

          const vals = document.createElement('div');
          vals.className = 'jp-mol-panel-vals';
          const groups = groupMultiEntries(members, ch);
          if (!groups.length) {
            const empty = document.createElement('p');
            empty.className = 'jp-mol-empty';
            empty.textContent = 'Aucun élément';
            vals.appendChild(empty);
          } else {
            groups.forEach((g) => {
              const rowEl = document.createElement('div');
              rowEl.className = 'jp-grp-row';
              const nOn = grpOnCount(ch, g, connsMap);
              const nCarriers = (g.carriers || []).length;
              const val = document.createElement('div');
              val.className = 'jp-grp-val' + (nOn > 0 ? ' is-on' : '');
              val.style.cssText = global.JpConstants.assoStyle(
                global.JpConstants.assoTones(g.indexes, toneComps)
              );
              val.textContent = g.label;
              val.tabIndex = 0;
              val.setAttribute('role', 'button');
              const who = g.carriers.map((c) => c.dci).filter(Boolean).join(' · ');
              val.title = (who || 'Molécules')
                + ' — double-clic : afficher en leçon pour celles qui ont cet élément'
                + (nOn ? ' (' + nOn + '/' + nCarriers + ' en leçon)' : '');
              val.addEventListener('dblclick', (ev) => {
                ev.preventDefault();
                void showInLessonForCarriers(ch, g, connsMap);
              });
              rowEl.appendChild(val);

              const rms = document.createElement('div');
              rms.className = 'jp-grp-rms';
              g.carriers.forEach((c) => {
                if (!c.ids.length) return;
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'jp-grp-rm';
                btn.textContent = '×';
                const tone = global.JpConstants.assoTone({}, c.index);
                btn.style.background = tone.bg;
                btn.style.color = tone.fg;
                btn.style.border = '1px solid ' + tone.border;
                const aria = 'Retirer « ' + (g.label || 'cet élément') + ' » de ' + (c.dci || 'cette molécule');
                btn.title = aria;
                btn.setAttribute('aria-label', aria);
                const eids = c.ids.slice();
                const mid = c.mid;
                const dci = c.dci;
                btn.addEventListener('click', () => {
                  void removeFromOne(ch, mid, eids, g.label, dci);
                });
                rms.appendChild(btn);
              });
              if (g.carriers.length < members.length) {
                const allBtn = document.createElement('button');
                allBtn.type = 'button';
                allBtn.className = 'jp-btn jp-btn-ghost jp-grp-all';
                allBtn.textContent = 'Tout le groupe';
                allBtn.title = 'Mettre « ' + (g.label || 'cet élément') + ' » sur toutes les molécules du groupe';
                allBtn.addEventListener('click', () => void extendToGroup(ch, g, members));
                rms.appendChild(allBtn);
              }
              rowEl.appendChild(rms);
              vals.appendChild(rowEl);
            });
          }
          sec.appendChild(vals);

          const ops = document.createElement('div');
          ops.className = 'jp-mol-group-ops';
          const taHost = document.createElement('div');
          taHost.setAttribute('data-grp-ta', ch.code);
          const addBtn = document.createElement('button');
          addBtn.type = 'button';
          addBtn.className = 'jp-btn jp-btn-ghost';
          addBtn.textContent = 'Ajouter';
          addBtn.addEventListener('click', () => void addToAll(ch.code));
          ops.appendChild(taHost);
          ops.appendChild(addBtn);
          sec.appendChild(ops);
          fieldsBox.appendChild(sec);
          grpCtrls[ch.code] = mountEntiteCombo(taHost, ch.table, null);
        });

        if (scrollTop != null) fieldsBox.scrollTop = scrollTop;
      }

      function fieldsScrollTop() {
        return panelEl()?.querySelector('[data-grp-fields]')?.scrollTop || 0;
      }

      async function paint() {
        const keepScroll = fieldsScrollTop();
        let rows;
        let connLists;
        try {
          rows = await Promise.all(ids.map((id) => MED().getById(id)));
          connLists = await Promise.all(ids.map((id) => listConnaissances(id).catch(() => [])));
        } catch (e) {
          if (!still()) return;
          global.JpToast?.fromError?.(e);
          const el = panelEl();
          const hint = el?.querySelector('.jp-mol-panel-hint');
          if (hint && !el.querySelector('[data-grp-fields]')) {
            hint.textContent = 'Impossible de charger les fiches.';
          }
          return;
        }
        if (!still()) return;
        const connByMid = {};
        const members = ids.map((id, index) => {
          const row = rows[index];
          if (!row) return null;
          connByMid[String(id)] = Array.isArray(connLists[index]) ? connLists[index] : [];
          return { id: id, index: index, dci: row.dci || '—', row: row };
        }).filter(Boolean);
        if (members.length < 2) {
          global.JpToast?.warn?.('Impossible de charger le groupe');
          if (still()) close();
          return;
        }
        try {
          render(members, keepScroll, connByMid);
        } catch (e) {
          if (!still()) return;
          global.JpToast?.fromError?.(e);
        }
      }

      /** Double-clic : afficher en leçon pour toutes les molécules du groupe qui ont déjà l’élément. */
      async function showInLessonForCarriers(ch, g, connByMid) {
        if (busy || !ch || !g) return;
        busy = true;
        let added = 0;
        try {
          const ops = [];
          for (const c of (g.carriers || [])) {
            if (!still()) return;
            const eids = (c.ids || []).map(String);
            if (!eids.length) continue;
            let conns = (connByMid && connByMid[String(c.mid)]) || null;
            if (!conns) {
              try { conns = await listConnaissances(c.mid); } catch (_) { conns = []; }
            }
            const hit = (conns || []).find((r) => (
              r && r.champ_code === ch.code && eids.indexOf(String(r.entite_id)) >= 0
            ));
            if (!hit?.connaissance_id) continue;
            if (visibleSet(c.mid).has(String(hit.connaissance_id))) continue;
            ops.push({ matriceId: c.mid, connaissanceId: hit.connaissance_id, on: true });
            added += 1;
          }
          if (!still()) return;
          if (ops.length) setVisibleMany(ops);
          if (still()) {
            if (added) global.JpToast?.ok?.('Affiché sur ' + added + ' molécule' + (added > 1 ? 's' : ''));
            else global.JpToast?.ok?.('Déjà affiché en leçon');
            await paint();
          }
        } catch (e) {
          if (still()) global.JpToast?.fromError?.(e);
        } finally {
          busy = false;
        }
      }

      async function extendToGroup(ch, g, members) {
        if (busy || !ch || !g) return;
        let entId = '';
        for (let i = 0; i < (g.carriers || []).length; i++) {
          const idsC = g.carriers[i].ids || [];
          if (idsC.length) { entId = idsC[0]; break; }
        }
        if (!entId && g.label) {
          try {
            const ent = await ENT().findOrCreate(ch.table, g.label);
            entId = ent?.id || '';
          } catch (e) {
            global.JpToast?.fromError?.(e);
            return;
          }
        }
        if (!entId) {
          global.JpToast?.warn?.('Élément introuvable');
          return;
        }
        busy = true;
        let started = false;
        try {
          started = true;
          const present = new Set((g.carriers || []).map((c) => String(c.mid)));
          for (const m of members) {
            if (!still()) return;
            if (present.has(String(m.id))) continue;
            const row = m.row || await MED().getById(m.id);
            if (!row) continue;
            const cur = multiOf(row, ch.code).map((x) => x.id);
            if (cur.some((id) => String(id) === String(entId))) continue;
            await writeMultiIds(m.id, ch, cur.concat([entId]));
          }
          if (!still()) return;
          for (const m of members) {
            const conns = await listConnaissances(m.id);
            const hit = (conns || []).find((r) => (
              r && r.champ_code === ch.code && String(r.entite_id) === String(entId)
            ));
            if (hit?.connaissance_id) setVisible(m.id, hit.connaissance_id, true);
          }
          if (still()) global.JpToast?.ok?.('Élément étendu au groupe');
        } catch (e) {
          if (still()) global.JpToast?.fromError?.(e);
        } finally {
          try {
            if (started && still()) await paint();
          } catch (e2) {
            if (still()) global.JpToast?.fromError?.(e2);
          }
          busy = false;
        }
      }

      async function addToAll(code) {
        if (busy) return;
        const ch = multiChamps.find((c) => c.code === code);
        const ctrl = grpCtrls[code];
        if (!ch || !ctrl) return;
        busy = true;
        let started = false;
        try {
          let it = ctrl.getItem?.();
          const typed = String(ctrl.input?.value || '').trim();
          if (!it && typed) it = await onCreateEntite(ch.table)(typed);
          if (!still()) return;
          if (!it?.id) {
            global.JpToast?.warn?.('Choisissez une entité');
            return;
          }
          started = true;
          for (const mid of ids) {
            if (!still()) return;
            const row = await MED().getById(mid);
            if (!row) continue;
            const cur = multiOf(row, ch.code).map((x) => x.id);
            if (cur.some((id) => String(id) === String(it.id))) continue;
            await writeMultiIds(mid, ch, cur.concat([it.id]));
          }
          if (!still()) return;
          for (const mid of ids) {
            const conns = await listConnaissances(mid);
            const hit = (conns || []).find((r) => (
              r && r.champ_code === code && String(r.entite_id) === String(it.id)
            ));
            if (hit?.connaissance_id) setVisible(mid, hit.connaissance_id, true);
          }
          if (still()) global.JpToast?.ok?.('Entité ajoutée au groupe');
        } catch (e) {
          if (still()) global.JpToast?.fromError?.(e);
        } finally {
          try {
            if (started && still()) await paint();
          } catch (e2) {
            if (still()) global.JpToast?.fromError?.(e2);
          }
          busy = false;
        }
      }

      async function removeFromOne(ch, mid, entityIds, label, dci) {
        if (busy) return;
        if (!entityIds || !entityIds.length) return;
        const who = dci || 'cette molécule';
        const msg = 'Retirer « ' + (label || 'cet élément') + ' » de ' + who + ' ?';
        if (!global.confirm(msg)) return;
        busy = true;
        let started = false;
        try {
          started = true;
          const row = await MED().getById(mid);
          if (!row) throw new Error('Fiche introuvable');
          if (!still()) return;
          const drop = new Set(entityIds.map(String));
          const next = multiOf(row, ch.code).map((x) => x.id).filter((id) => !drop.has(String(id)));
          const cids = [];
          try {
            const conns = await listConnaissances(mid);
            entityIds.forEach((eid) => {
              const hit = (conns || []).find((r) => (
                r && r.champ_code === ch.code && String(r.entite_id) === String(eid)
              ));
              if (hit?.connaissance_id) cids.push(hit.connaissance_id);
            });
          } catch (_) { /* ignore */ }
          if (!still()) return;
          await writeMultiIds(mid, ch, next);
          cids.forEach((cid) => setVisible(mid, cid, false));
          if (still()) global.JpToast?.ok?.('Retiré de ' + who);
        } catch (e) {
          if (still()) global.JpToast?.fromError?.(e);
        } finally {
          try {
            if (started && still()) await paint();
          } catch (e2) {
            if (still()) global.JpToast?.fromError?.(e2);
          }
          busy = false;
        }
      }

      openShell('Groupe (' + ids.length + ')', '<p class="jp-mol-panel-hint">Chargement…</p>', '');
      void paint();
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
