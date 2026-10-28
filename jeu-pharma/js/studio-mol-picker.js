/**
 * Sélecteur molécules / valeurs — mode leçon (legacy pubs) ou mode bloc (payload source).
 */
(function (global) {
  function sb() { return global.JpApp.sbJeu(); }
  function esc(s) { return global.JpUi.escapeHtml(String(s ?? '')); }
  function champLibelle(code) {
    const c = (global.JpConstants?.CHAMP_CODES || []).find((x) => x.code === code);
    return c?.libelle || code;
  }

  async function rpc(name, args) {
    const { data, error } = await sb().rpc(name, args);
    if (error) throw error;
    return data;
  }

  function labelOfMatrice(r) {
    return (r.dci || '') + (r.noms ? ' · ' + r.noms : '');
  }

  const PENCIL = '<svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';

  function referentielEditHref(matriceId) {
    return 'referentiel.html?id=' + encodeURIComponent(matriceId);
  }

  function editFicheLink(matriceId, extraClass) {
    return '<a class="jp-ta-chip-edit' + (extraClass ? ' ' + extraClass : '') + '" href="' + esc(referentielEditHref(matriceId))
      + '" target="_blank" rel="noopener noreferrer" aria-label="Modifier">' + PENCIL + '</a>';
  }

  /** Libellés des fiches déjà en leçon (vue liste légère — pas v_medicaments_complet). */
  async function describeMatrices(ids) {
    if (!ids.length) return [];
    const { data, error } = await sb()
      .from('v_medicaments_liste')
      .select('id, dci, noms_commerciaux')
      .in('id', ids);
    if (error) throw error;
    const byId = {};
    (data || []).forEach((r) => { byId[r.id] = r; });
    return ids.map((id) => {
      const r = byId[id];
      return {
        id,
        dci: r?.dci || id.slice(0, 8),
        noms: r ? global.JpTypeahead.nomsToText(r.noms_commerciaux) : '',
      };
    });
  }

  /**
   * @param {{
   *   moduleId: string,
   *   onApplied?: Function,
   *   mode?: 'lecon'|'bloc',
   *   blocId?: string,
   *   scopeMatriceIds?: string[],
   *   initialValeurs?: Record<string, string[]>,
   *   title?: string,
   *   onApplyValeurs?: Function,
   * }} opts
   */
  async function open(opts) {
    const moduleId = opts.moduleId;
    if (!moduleId) throw new Error('module requis');

    const mode = opts.mode === 'bloc' ? 'bloc' : 'lecon';
    const scopeIds = (opts.scopeMatriceIds || []).filter(Boolean);
    const valeursState = {};
    Object.keys(opts.initialValeurs || {}).forEach((k) => {
      valeursState[k] = new Set((opts.initialValeurs[k] || []).filter(Boolean).map(String));
    });

    const TA = global.JpTypeahead;
    const overlay = document.createElement('div');
    overlay.className = 'jp-studio-overlay';
    overlay.innerHTML = '<div class="jp-studio-sheet jp-mol-sheet">'
      + '<header class="jp-studio-sheet-head">'
      + '<h2>' + esc(opts.title || (mode === 'bloc' ? 'Valeurs affichées' : 'Molécules de la leçon')) + '</h2>'
      + '<button type="button" class="jp-btn jp-btn-ghost" data-close>×</button>'
      + '</header>'
      + (mode === 'bloc'
        ? '<p class="jp-muted jp-mol-scope-hint">Molécules de ce bloc (onglet courant ∪ base). Les cases cochent les valeurs du payload.</p>'
        : '<div class="jp-mol-filters">'
          + '<input id="molQ" type="search" placeholder="Chercher une DCI ou un nom…" autocomplete="off" aria-label="Chercher une molécule">'
          + '<div id="molSecteur"></div>'
          + '<div id="molIndic"></div>'
          + '<div id="molClasseT"></div>'
          + '<div id="molClasseP"></div>'
          + '</div>')
      + '<div class="jp-mol-body">'
      + '<aside class="jp-mol-list" id="molList"></aside>'
      + '<section class="jp-mol-detail" id="molDetail"><p class="jp-muted">Sélectionnez une molécule</p></section>'
      + '</div>'
      + '<footer class="jp-studio-sheet-foot">'
      + '<span id="molSummary" class="jp-muted"></span>'
      + '<button type="button" class="jp-btn jp-btn-ghost" data-close>Fermer</button>'
      + '</footer></div>';

    document.body.appendChild(overlay);

    const selected = new Map(); // matriceId -> { id, label, rows }
    let activeId = null;

    // Précharger matrices déjà publiées (mode leçon) ou scoped (mode bloc)
    const pubByMatrice = {};
    if (mode === 'bloc') {
      scopeIds.forEach((id) => {
        pubByMatrice[id] = new Set([...(valeursState[id] || [])]);
      });
    } else {
      const { data: pubs } = await sb()
        .from('publications_connaissances')
        .select('connaissance_id, connaissances!inner(matrice_id, texte, champ_code)')
        .eq('module_id', moduleId)
        .eq('actif', true);
      (pubs || []).forEach((p) => {
        const mid = p.connaissances?.matrice_id;
        if (!mid) return;
        (pubByMatrice[mid] = pubByMatrice[mid] || new Set()).add(p.connaissance_id);
      });
    }

    function close() {
      overlay.remove();
    }
    overlay.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    const filt = { secteur: null, indic: null, classeT: null, classeP: null };
    let searchSeq = 0;
    let searchTimer = null;

    async function search() {
      const mine = ++searchSeq;
      let list;
      try {
        if (mode === 'bloc') {
          list = await describeMatrices(scopeIds);
        } else {
          const q = overlay.querySelector('#molQ')?.value.trim() || '';
          const hasFilter = !!(q || filt.secteur || filt.indic || filt.classeT || filt.classeP);
          if (!hasFilter) {
            list = await describeMatrices(Object.keys(pubByMatrice).filter((id) => pubByMatrice[id].size));
          } else {
            const rows = await rpc('v2_chercher_matrices', {
              p_q: q || null,
              p_secteur_norm: filt.secteur,
              p_indication_norm: filt.indic,
              p_classe_ther_norm: filt.classeT,
              p_classe_pharma_norm: filt.classeP,
              p_limit: 40,
            });
            list = Array.isArray(rows) ? rows : [];
          }
        }
      } catch (e) {
        if (mine === searchSeq) global.JpToast?.fromError?.(e);
        return;
      }
      if (mine !== searchSeq) return;
      paintList(list, mode === 'bloc' || !!(overlay.querySelector('#molQ')?.value.trim()));
    }

    function scheduleSearch() {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => void search(), 220);
    }

    if (mode !== 'bloc') {
      function mountFilter(sel, table, placeholder, key) {
        TA.combo(overlay.querySelector(sel), {
          search: TA.entiteSource(table),
          minChars: 1,
          placeholder,
          ariaLabel: placeholder,
          onChange: (it) => {
            filt[key] = it ? (it.data?.valeur_norm || null) : null;
            scheduleSearch();
          },
        });
      }
      mountFilter('#molSecteur', 'secteurs_therapeutiques', 'Secteur…', 'secteur');
      mountFilter('#molIndic', 'indications', 'Indication…', 'indic');
      mountFilter('#molClasseT', 'classes_therapeutiques', 'Classe thérapeutique…', 'classeT');
      mountFilter('#molClasseP', 'classes_pharmacologiques', 'Classe pharmacologique…', 'classeP');
    }

    function paintList(rows, hasFilter) {
      const box = overlay.querySelector('#molList');
      const head = '<p class="jp-muted jp-mol-note">'
        + (mode === 'bloc'
          ? rows.length + ' molécule(s) du bloc'
          : (hasFilter ? rows.length + ' résultat(s)' : 'Dans la leçon — tapez ci-dessus pour ajouter'))
        + '</p>';
      box.innerHTML = head + (rows.map((r) => {
        const inProg = pubByMatrice[r.id]?.size > 0 || selected.has(r.id) || (mode === 'bloc');
        const label = labelOfMatrice(r);
        return '<div class="jp-mol-row-wrap' + (r.id === activeId ? ' is-active' : '')
          + (inProg ? ' is-on' : '') + '">'
          + '<button type="button" class="jp-mol-row" data-id="' + r.id + '" data-label="' + esc(label) + '">'
          + '<strong>' + esc(r.dci || '—') + '</strong>'
          + '<span>' + esc(r.noms || '') + '</span>'
          + (mode === 'bloc'
            ? '<em>' + (pubByMatrice[r.id]?.size || 0) + ' val.</em>'
            : (inProg ? '<em>en leçon</em>' : ''))
          + '</button>'
          + editFicheLink(r.id, 'jp-mol-row-edit')
          + '</div>';
      }).join('') || '<p class="jp-muted">' + (mode === 'bloc' ? 'Aucune molécule dans ce bloc' : (hasFilter ? 'Aucun résultat' : 'Aucune molécule dans la leçon')) + '</p>');

      box.querySelectorAll('[data-id]').forEach((btn) => {
        btn.addEventListener('click', () => void selectMol(btn.getAttribute('data-id'), btn.getAttribute('data-label')));
      });
      updateSummary();
    }

    async function selectMol(matriceId, label) {
      activeId = matriceId;
      const detail = overlay.querySelector('#molDetail');
      detail.innerHTML = '<p class="jp-muted">Chargement…</p>';
      const rows = await rpc('v2_lister_connaissances_matrice', {
        p_matrice_id: matriceId,
        p_module_id: moduleId,
      });
      const list = Array.isArray(rows) ? rows : [];

      const dci = list.find((r) => r.champ_code === 'dci')?.texte;
      const niceLabel = dci || label || matriceId;
      selected.set(matriceId, { id: matriceId, label: niceLabel, rows: list });

      const checkedSet = mode === 'bloc'
        ? (valeursState[matriceId] || new Set())
        : new Set((pubByMatrice[matriceId] || []));

      const byChamp = {};
      list.forEach((r) => {
        if (r.champ_code === 'nom_commercial' || r.champ_code === 'dci') return;
        (byChamp[r.champ_code] = byChamp[r.champ_code] || []).push(r);
      });

      const applyLabel = mode === 'bloc' ? 'Enregistrer dans le bloc' : 'Appliquer à la leçon';
      let html = '<div class="jp-mol-detail-head"><div class="jp-mol-detail-title"><h3>' + esc(niceLabel) + '</h3>'
        + editFicheLink(matriceId)
        + '</div><div class="jp-mol-detail-actions">'
        + '<button type="button" class="jp-btn jp-btn-ghost" id="molAllOn">Tout afficher</button>'
        + '<button type="button" class="jp-btn jp-btn-ghost" id="molAllOff">Tout masquer</button>'
        + '<button type="button" class="jp-btn jp-btn-primary" id="molApply">' + esc(applyLabel) + '</button>'
        + '</div></div>';

      Object.keys(byChamp).sort().forEach((code) => {
        const vals = byChamp[code];
        const n = vals.filter((v) => checkedSet.has(String(v.connaissance_id)) || (mode !== 'bloc' && v.publie)).length;
        html += '<div class="jp-mol-champ" data-champ="' + code + '">'
          + '<header><strong>' + esc(champLibelle(code)) + '</strong>'
          + '<span>' + n + '/' + vals.length + '</span>'
          + '<button type="button" class="jp-btn jp-btn-ghost" data-champ-on="' + code + '">Tout</button>'
          + '<button type="button" class="jp-btn jp-btn-ghost" data-champ-off="' + code + '">Rien</button></header>';
        vals.forEach((v) => {
          const on = checkedSet.has(String(v.connaissance_id)) || (mode !== 'bloc' && v.publie);
          html += '<label class="jp-mol-val"><input type="checkbox" data-cid="' + v.connaissance_id + '"'
            + (on ? ' checked' : '') + '> <span>' + esc(v.texte || '—') + '</span></label>';
        });
        html += '</div>';
      });

      detail.innerHTML = html;
      overlay.querySelectorAll('.jp-mol-row-wrap').forEach((wrap) => {
        wrap.classList.toggle('is-active', wrap.querySelector('[data-id]')?.getAttribute('data-id') === matriceId);
      });

      detail.querySelector('#molAllOn')?.addEventListener('click', () => {
        detail.querySelectorAll('input[type=checkbox]').forEach((c) => { c.checked = true; });
      });
      detail.querySelector('#molAllOff')?.addEventListener('click', () => {
        detail.querySelectorAll('input[type=checkbox]').forEach((c) => { c.checked = false; });
      });
      detail.querySelectorAll('[data-champ-on]').forEach((btn) => {
        btn.addEventListener('click', () => {
          btn.closest('.jp-mol-champ')?.querySelectorAll('input').forEach((c) => { c.checked = true; });
        });
      });
      detail.querySelectorAll('[data-champ-off]').forEach((btn) => {
        btn.addEventListener('click', () => {
          btn.closest('.jp-mol-champ')?.querySelectorAll('input').forEach((c) => { c.checked = false; });
        });
      });
      detail.querySelector('#molApply')?.addEventListener('click', () => void applyCurrent(matriceId));
      updateSummary();
    }

    async function applyCurrent(matriceId) {
      const detail = overlay.querySelector('#molDetail');
      const checked = [];
      const unchecked = [];
      detail.querySelectorAll('input[data-cid]').forEach((c) => {
        if (c.checked) checked.push(c.getAttribute('data-cid'));
        else unchecked.push(c.getAttribute('data-cid'));
      });
      try {
        if (mode === 'bloc') {
          valeursState[matriceId] = new Set(checked.map(String));
          pubByMatrice[matriceId] = new Set(checked);
          await opts.onApplyValeurs?.({ matriceId, checked, unchecked });
          global.JpToast?.ok?.('Valeurs enregistrées dans le bloc');
          await selectMol(matriceId, selected.get(matriceId)?.label);
          overlay.querySelectorAll('.jp-mol-row-wrap').forEach((wrap) => {
            const id = wrap.querySelector('[data-id]')?.getAttribute('data-id');
            const em = wrap.querySelector('em');
            if (em && id) em.textContent = (pubByMatrice[id]?.size || 0) + ' val.';
          });
          updateSummary();
          return;
        }

        const { data: allC } = await sb()
          .from('connaissances')
          .select('id')
          .eq('matrice_id', matriceId)
          .eq('statut', 'valide');
        const keep = new Set(checked);
        const orphans = (allC || []).map((c) => c.id).filter((id) => id && !keep.has(id));
        const toDepub = [...new Set([...unchecked, ...orphans])];

        if (checked.length) {
          await rpc('v2_publier_connaissances', {
            p_module_id: moduleId,
            p_connaissance_ids: checked,
          });
          pubByMatrice[matriceId] = new Set(checked);
        } else {
          pubByMatrice[matriceId] = new Set();
        }
        if (toDepub.length) {
          await rpc('v2_depublier_connaissances', {
            p_module_id: moduleId,
            p_connaissance_ids: toDepub,
          });
        }
        global.JpToast?.ok?.('Programme mis à jour');
        await selectMol(matriceId, selected.get(matriceId)?.label);
        opts.onApplied?.({ matriceId, checked, unchecked });
        overlay.querySelectorAll('.jp-mol-row-wrap').forEach((wrap) => {
          const id = wrap.querySelector('[data-id]')?.getAttribute('data-id');
          wrap.classList.toggle('is-on', !!(id && pubByMatrice[id]?.size));
        });
        updateSummary();
      } catch (e) {
        global.JpToast?.fromError?.(e);
      }
    }

    function updateSummary() {
      if (mode === 'bloc') {
        const nMol = scopeIds.length;
        const nVal = Object.values(valeursState).reduce((n, s) => n + s.size, 0);
        overlay.querySelector('#molSummary').textContent = nMol + ' molécule(s) · ' + nVal + ' valeur(s)';
        return;
      }
      const n = Object.values(pubByMatrice).filter((s) => s.size > 0).length;
      overlay.querySelector('#molSummary').textContent = n + ' molécule(s) dans la leçon';
    }

    if (mode !== 'bloc') {
      const molQ = overlay.querySelector('#molQ');
      molQ.addEventListener('input', scheduleSearch);
      molQ.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { clearTimeout(searchTimer); void search(); }
      });
      molQ.focus();
    }

    await search();
    const firstId = mode === 'bloc'
      ? scopeIds[0]
      : Object.keys(pubByMatrice).find((id) => pubByMatrice[id].size);
    if (firstId) await selectMol(firstId, '');
  }

  global.JpStudioMolPicker = { open };
})(window);
