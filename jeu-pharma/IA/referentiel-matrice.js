/**
 * Wizard IA référentiel — BDM → RCP (Edge jeupharma-ia-matrice) → revue entités → JpMedicaments.save.
 * Aucune écriture Supabase tant que l’admin n’a pas validé « Créer la fiche ».
 *
 *   JpReferentielIA.open({ onSaved(row) })
 */
(function (global) {
  const SECTION_DEFS = [
    {
      id: 'identite',
      titre: 'Identité',
      codes: ['nom_commercial', 'dci'],
    },
    {
      id: 'classes',
      titre: 'Classification',
      codes: ['secteur_therapeutique', 'classe_therapeutique', 'classe_pharmacologique'],
    },
    {
      id: 'pharma',
      titre: 'Pharmacologie & administration',
      codes: ['detail_pharmacologie', 'posologie_generale', 'voies_administration'],
    },
    {
      id: 'clinique',
      titre: 'Clinique',
      codes: ['indications', 'contre_indications', 'effets_indesirables', 'precautions_emploi'],
    },
    {
      id: 'delivrance',
      titre: 'Délivrance',
      codes: ['conditions_prescription_delivrance', 'conseils_delivrance'],
    },
    {
      id: 'suivi',
      titre: 'Interactions & suivi',
      codes: ['interactions', 'surveillances', 'grossesse_allaitement'],
    },
  ];

  function esc(s) {
    return global.JpUi ? global.JpUi.escapeHtml(String(s ?? '')) : String(s ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function champMeta(code) {
    return (global.JpConstants?.CHAMP_CODES || []).find((c) => c.code === code) || null;
  }

  function champsWizard() {
    return (typeof global.JpConstants?.champsActifs === 'function'
      ? global.JpConstants.champsActifs()
      : (global.JpConstants?.CHAMP_CODES || []).filter((c) => c.actif !== false));
  }

  function brandFromDenom(denom) {
    const s = String(denom || '').trim();
    if (!s) return '';
    const m = s.match(/^([A-Za-zÀ-ÿ0-9'’\-]+)/);
    return (m ? m[1] : s).slice(0, 80);
  }

  /* ——— Matching entités ——— */

  /**
   * @returns {Promise<{ statut: 'existant'|'proche'|'nouveau', id?: string, valeur: string, suggestions: object[] }>}
   */
  async function matchItem(table, valeur) {
    const v = String(valeur || '').trim();
    if (!v) return null;
    const E = global.JpEntites;
    const exact = await E.findActiveByValeur(table, v);
    if (exact) {
      return { statut: 'existant', id: exact.id, valeur: exact.valeur || v, suggestions: [] };
    }
    const suggestions = await E.list(table, { q: v.slice(0, 60), actif: true, limit: 8 });
    const proches = (suggestions || []).filter((s) => {
      const a = E.normaliser(s.valeur);
      const b = E.normaliser(v);
      return a && b && (a.includes(b) || b.includes(a) || a.slice(0, 8) === b.slice(0, 8));
    }).slice(0, 5);
    if (proches.length) {
      return { statut: 'proche', valeur: v, suggestions: proches };
    }
    return { statut: 'nouveau', valeur: v, suggestions: (suggestions || []).slice(0, 5) };
  }

  function newItemKey(code) {
    return code + ':' + Math.random().toString(36).slice(2, 9);
  }

  function emptyItem(code, valeur) {
    return {
      key: newItemKey(code),
      statut: 'nouveau',
      id: '',
      valeur: String(valeur || ''),
      suggestions: [],
      kept: true,
      originalValeur: String(valeur || ''),
    };
  }

  async function buildReviewState(iaChamps) {
    const state = { lines: [] }; // { code, card, libelle, items: [...] }
    for (const c of champsWizard()) {
      const raw = iaChamps?.[c.code];
      const values = c.card === 1
        ? (raw ? [String(raw)] : [])
        : (Array.isArray(raw) ? raw.map(String) : (raw ? [String(raw)] : []));
      const items = [];
      for (const val of values) {
        const m = await matchItem(c.table, val);
        if (!m) continue;
        items.push({
          key: newItemKey(c.code),
          statut: m.statut,
          id: m.id || '',
          valeur: m.valeur,
          suggestions: m.suggestions || [],
          kept: true,
          originalValeur: m.valeur,
        });
      }
      // Toujours une ligne par champ actif (même vide) pour pouvoir ajouter / restaurer
      state.lines.push({ code: c.code, card: c.card, libelle: c.libelle, table: c.table, items });
    }
    return state;
  }

  function splitValeur(valeur) {
    const s = String(valeur || '').trim();
    if (!s) return [];
    const parts = s.split(/\n+|;\s+|\s+[•·]\s+/).map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2) return parts;
    const slash = s.split(/\s+\/\s+/).map((p) => p.trim()).filter(Boolean);
    return slash.length >= 2 ? slash : [s];
  }

  function collectSavePayload(review) {
    const singular = {};
    const multi = {};
    for (const line of review.lines) {
      const kept = line.items.filter((it) => it.kept && String(it.valeur || '').trim());
      if (!kept.length) continue;
      if (line.card === 1) {
        const it = kept[0];
        singular[line.code] = it.id ? { id: it.id, valeur: it.valeur } : { valeur: it.valeur };
      } else {
        multi[line.code] = kept.map((it) => (it.id ? { id: it.id, valeur: it.valeur } : { valeur: it.valeur }));
      }
    }
    return {
      statut: 'brouillon',
      fiche_validee: false,
      singular,
      multi,
    };
  }

  /* ——— Wizard UI ——— */

  function open(opts) {
    opts = opts || {};
    const G = global.JpIaGemini;
    if (!G || !global.JpBdm || !global.JpMedicaments || !global.JpEntites) {
      global.JpToast?.warn?.('Modules IA / BDM manquants');
      return;
    }

    const backdrop = document.createElement('div');
    backdrop.className = 'jp-modal-backdrop jp-ia-backdrop jp-ia-matrice-backdrop';
    backdrop.setAttribute('role', 'dialog');
    backdrop.setAttribute('aria-modal', 'true');
    backdrop.innerHTML = ''
      + '<div class="jp-modal jp-ia-modal jp-ia-matrice-modal">'
      + '<h2>IA — fiche depuis un RCP</h2>'
      + '<p class="jp-ia-lead">Recherche BDPM → condensation du RCP officiel (ANSM, EMA en secours) → revue champ par champ. '
      + 'Aucune écriture tant que vous n’avez pas validé.</p>'
      + '<nav class="jp-ia-steps" aria-label="Étapes">'
      + '<button type="button" class="jp-ia-step is-active" data-step="1">1. Choisir</button>'
      + '<button type="button" class="jp-ia-step" data-step="2" disabled>2. Générer</button>'
      + '<button type="button" class="jp-ia-step" data-step="3" disabled>3. Revue</button>'
      + '</nav>'
      + '<div class="jp-ia-panel" data-panel="1">'
      + '<div class="jp-field"><label for="iaMatQ">Recherche molécule (BDPM)</label>'
      + '<input type="search" id="iaMatQ" autocomplete="off" placeholder="DCI, spécialité, CIP…"></div>'
      + '<div id="iaMatResults" class="jp-ia-bdm-results" hidden role="listbox"></div>'
      + '<div id="iaMatPick" class="jp-ia-pick" hidden></div>'
      + '</div>'
      + '<div class="jp-ia-panel" data-panel="2" hidden>'
      + '<div id="iaMatGenInfo" class="jp-ia-gen-info"></div>'
      + '<div class="jp-field" id="iaMatManualWrap" hidden>'
      + '<label for="iaMatRcp">Coller le RCP (secours)</label>'
      + '<textarea id="iaMatRcp" rows="8" maxlength="' + G.RCP_MAX_CHARS + '" '
      + 'placeholder="Rubriques 4.1 à 4.8 et 5.1…"></textarea></div>'
      + '<div class="jp-ia-status" id="iaMatStatus" role="status" aria-live="polite" hidden></div>'
      + '</div>'
      + '<div class="jp-ia-panel" data-panel="3" hidden>'
      + '<div id="iaMatReview" class="jp-ia-review"></div>'
      + '<p class="jp-field-hint">Hospitalier / complexe : flags purgés (041) — non proposés. Fiche créée en brouillon, à valider ensuite.</p>'
      + '</div>'
      + '<div class="jp-modal-actions">'
      + '<button type="button" class="jp-btn jp-btn-ghost" id="iaMatCancel">Fermer</button>'
      + '<button type="button" class="jp-btn jp-btn-ghost" id="iaMatBack" hidden>Retour</button>'
      + '<button type="button" class="jp-btn jp-btn-primary" id="iaMatNext" disabled>Continuer</button>'
      + '</div></div>';
    document.body.appendChild(backdrop);

    const $ = (id) => backdrop.querySelector('#' + id);
    const statusEl = $('iaMatStatus');
    let step = 1;
    let busy = false;
    let closed = false;
    let timer = null;
    let searchReq = 0;
    let searchRows = [];
    let pick = null; // { cis, dci, noms, contexte_bdm, row }
    let review = null;
    let existingMatriceId = null;

    function close() {
      closed = true;
      clearInterval(timer);
      document.removeEventListener('keydown', onKey);
      backdrop.remove();
    }
    function onKey(e) {
      if (e.key === 'Escape' && !busy) close();
    }
    document.addEventListener('keydown', onKey);
    $('iaMatCancel').addEventListener('click', () => { if (!busy) close(); });
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop && !busy) close(); });

    function setStatus(msg, kind) {
      statusEl.hidden = !msg;
      statusEl.className = 'jp-ia-status' + (kind ? ' is-' + kind : '');
      statusEl.textContent = msg || '';
    }

    function setStep(n) {
      step = n;
      backdrop.querySelectorAll('.jp-ia-panel').forEach((p) => {
        p.hidden = Number(p.getAttribute('data-panel')) !== n;
      });
      backdrop.querySelectorAll('.jp-ia-step').forEach((btn) => {
        const s = Number(btn.getAttribute('data-step'));
        btn.classList.toggle('is-active', s === n);
        btn.disabled = s > n && !(s === 2 && pick) && !(s === 3 && review);
      });
      $('iaMatBack').hidden = n === 1;
      const next = $('iaMatNext');
      if (n === 1) {
        next.textContent = 'Continuer';
        next.disabled = !pick;
        next.hidden = false;
      } else if (n === 2) {
        next.textContent = 'Générer';
        next.disabled = false;
        next.hidden = false;
      } else {
        next.textContent = 'Créer la fiche';
        next.disabled = !canSave();
        next.hidden = false;
      }
    }

    function canSave() {
      if (!review) return false;
      const dciLine = review.lines.find((l) => l.code === 'dci');
      const dciOk = dciLine && dciLine.items.some((it) => it.kept && String(it.valeur || '').trim());
      return !!dciOk;
    }

    /* Step 1 — search */
    function renderResults(rows) {
      searchRows = rows || [];
      const host = $('iaMatResults');
      if (!searchRows.length) {
        host.innerHTML = '<p class="jp-ia-bdm-empty">Aucun résultat</p>';
        host.hidden = false;
        return;
      }
      host.innerHTML = searchRows.map((r, i) => {
        const subs = String(r.substances || '—');
        const nSub = subs.split(', ').filter(Boolean).length;
        const badge = nSub > 1 ? '<span class="jp-ia-badge jp-ia-badge-warn">multi</span>' : '<span class="jp-ia-badge jp-ia-badge-ok">mono</span>';
        return '<button type="button" class="jp-ia-bdm-item" role="option" data-idx="' + i + '">'
          + '<span class="jp-ia-bdm-name">' + esc(r.denomination || '—') + ' ' + badge + '</span>'
          + '<span class="jp-ia-bdm-meta">' + esc(subs) + '</span>'
          + '<span class="jp-ia-bdm-forme">' + esc(r.forme_pharmaceutique || '') + ' · CIS ' + esc(r.cis || '') + '</span>'
          + '</button>';
      }).join('');
      host.hidden = false;
    }

    async function selectRow(row) {
      const parseSubs = global.JpBdm.parseSubstancesList || ((s) => String(s || '').split(', ').map((x) => x.trim()).filter(Boolean));
      const formatDci = global.JpBdm.formatCombinedDci
        || ((list) => parseSubs(list).join(' + '));
      const pre = global.JpBdm.pickToPrefill(row);
      let detail = null;
      try {
        detail = row.cis ? await global.JpBdm.getSpecialite(row.cis) : null;
      } catch (_) { /* détail optionnel */ }

      const substancesList = (detail?.substances_list?.length
        ? detail.substances_list
        : (pre.substances_list || parseSubs(row.substances)))
        .map((s) => (global.JpBdm.pedagogLabel ? global.JpBdm.pedagogLabel(s) : s));
      const dci = pre.dci || formatDci(substancesList) || '';
      const nom = brandFromDenom(pre.nom_commercial || row.denomination);
      const multi = substancesList.length > 1
        || (detail && detail.mono_substance === false)
        || pre.mono_substance === false;

      let agg = null;
      if (dci && !multi && typeof global.JpBdm.listByDci === 'function') {
        try {
          agg = await global.JpBdm.listByDci(dci, 40);
        } catch (_) { /* agrégation optionnelle */ }
      }

      const cisPick = typeof global.JpBdm.pickCisForFiche === 'function'
        ? global.JpBdm.pickCisForFiche(row, searchRows)
        : {
          cis: (agg?.recommended?.cis) || row.cis || detail?.cis || '',
          mono_rcp: !multi,
          warn: multi
            ? 'Association multi-substances : le RCP sera celui de cette spécialité.'
            : '',
        };

      const noms = [...new Set([
        ...(nom ? [nom] : []),
        ...((agg && agg.noms) || []),
      ])].slice(0, 12);

      const contexte_bdm = agg?.contexte_bdm
        ? {
          ...agg.contexte_bdm,
          denomination: row.denomination || agg.contexte_bdm.denomination || '',
          forme_pharmaceutique: row.forme_pharmaceutique
            || detail?.forme_pharmaceutique
            || agg.contexte_bdm.forme_pharmaceutique || '',
          etat_commercialisation: row.etat_commercialisation
            || detail?.etat_commercialisation
            || agg.contexte_bdm.etat_commercialisation || '',
          numero_autorisation_europeenne: detail?.numero_autorisation_europeenne
            || agg.contexte_bdm.numero_autorisation_europeenne || '',
          substances: substancesList.join(', ') || dci,
          substances_list: substancesList,
          association: false,
        }
        : {
          denomination: row.denomination || detail?.denomination || '',
          forme_pharmaceutique: row.forme_pharmaceutique || detail?.forme_pharmaceutique || '',
          voies_administration: detail?.voies_administration || '',
          etat_commercialisation: row.etat_commercialisation || detail?.etat_commercialisation || '',
          numero_autorisation_europeenne: detail?.numero_autorisation_europeenne || '',
          substances: substancesList.join(', ') || '',
          substances_list: substancesList,
          association: multi,
          cis_list: cisPick.cis ? [String(cisPick.cis)] : [],
          resume_formes: multi
            ? 'Association multi-substances (1 CIS spécialité pour le RCP)'
            : '',
        };

      const cisPrincipal = cisPick.cis || (agg?.recommended?.cis) || row.cis || detail?.cis || '';
      pick = {
        cis: cisPrincipal,
        dci,
        noms,
        substances_list: substancesList,
        multi,
        cis_warn: cisPick.warn || '',
        row,
        detail,
        agg,
        contexte_bdm,
      };
      const host = $('iaMatPick');
      const formesHint = (agg?.formes || []).slice(0, 6).join(', ');
      const substHtml = substancesList.length
        ? '<ul class="jp-ia-subst-list">'
          + substancesList.map((s) => '<li>' + esc(s) + '</li>').join('')
          + '</ul>'
        : '';
      host.innerHTML = '<p><strong>Sélection</strong> — ' + esc(dci || 'DCI ?')
        + (multi ? ' <span class="jp-ia-badge jp-ia-badge-warn">asso</span>' : '')
        + (noms.length ? ' · ' + esc(noms.slice(0, 3).join(', ')) : '')
        + ' · CIS RCP ' + esc(pick.cis || '—') + '</p>'
        + (multi
          ? '<p class="jp-ia-warn-inline">' + esc(pick.cis_warn
            || 'Association multi-substances : DCI = libellé combiné (1 fiche).')
            + '</p>'
            + '<p class="jp-field-hint">Substances BDM :</p>' + substHtml
          : '')
        + (agg && !multi
          ? '<p class="jp-field-hint">1 fiche pour toutes les formes : ' + esc(agg.resume || '')
            + (formesHint ? ' — ' + esc(formesHint) : '')
            + '. Annoter (forme) si une info est spécifique.</p>'
          : (!multi
            ? '<p class="jp-field-hint">' + esc(pick.contexte_bdm.forme_pharmaceutique || '')
              + (pick.contexte_bdm.voies_administration ? ' · ' + esc(pick.contexte_bdm.voies_administration) : '')
              + '</p>'
            : '<p class="jp-field-hint">' + esc(pick.contexte_bdm.forme_pharmaceutique || '')
              + (pick.contexte_bdm.voies_administration ? ' · ' + esc(pick.contexte_bdm.voies_administration) : '')
              + '</p>'));
      host.hidden = false;
      $('iaMatNext').disabled = !pick.dci;
    }

    $('iaMatQ').addEventListener('input', () => {
      clearTimeout(global.__jpIaMatT);
      const q = $('iaMatQ').value.trim();
      if (q.length < 2) {
        $('iaMatResults').hidden = true;
        return;
      }
      global.__jpIaMatT = setTimeout(async () => {
        const req = ++searchReq;
        try {
          const rows = await global.JpBdm.searchProducts(q, 25);
          if (req !== searchReq) return;
          const recommended = global.JpBdm.pickRecommendedCis(rows, q);
          if (recommended) {
            const rest = rows.filter((r) => r.cis !== recommended.cis);
            renderResults([recommended].concat(rest));
          } else {
            renderResults(rows);
          }
        } catch (e) {
          if (req === searchReq) global.JpToast?.fromError?.(e);
        }
      }, 280);
    });

    $('iaMatResults').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-idx]');
      if (!btn) return;
      const row = searchRows[Number(btn.getAttribute('data-idx'))];
      if (row) void selectRow(row);
    });

    /* Step 2 — generate */
    function renderGenInfo() {
      if (!pick) return;
      const nFormes = pick.agg?.formes?.length || 0;
      const subst = (pick.substances_list || []).map(esc).join(' · ');
      $('iaMatGenInfo').innerHTML = '<p>DCI <strong>' + esc(pick.dci) + '</strong>'
        + (pick.multi ? ' <span class="jp-ia-badge jp-ia-badge-warn">asso</span>' : '')
        + (pick.cis ? ' · CIS <strong>' + esc(pick.cis) + '</strong>' : '')
        + (nFormes > 1 ? ' · <strong>' + nFormes + ' formes</strong> BDM' : '')
        + '</p>'
        + (pick.multi && subst
          ? '<p class="jp-field-hint">Substances : ' + subst + '</p>'
          : '')
        + (pick.cis_warn ? '<p class="jp-ia-warn-inline">' + esc(pick.cis_warn) + '</p>' : '')
        + '<p class="jp-field-hint">Fetch ANSM (extrait public) + Meddispar CPD (best-effort) puis condensation Gemini. '
        + (pick.multi
          ? 'Association : la DCI fournie est le libellé combiné (ne pas la réduire à une seule substance). '
          : 'Une fiche pour toutes les formes ; annoter (forme) si besoin. ')
        + 'Si le RCP manque, collez-le ci-dessous.</p>';
    }

    async function runGenerate() {
      if (!pick || busy) return;
      busy = true;
      $('iaMatNext').disabled = true;
      $('iaMatBack').disabled = true;
      $('iaMatCancel').disabled = true;
      $('iaMatManualWrap').hidden = true;
      setStatus('Récupération RCP + condensation IA…', 'busy');
      const started = Date.now();
      clearInterval(timer);
      timer = setInterval(() => {
        setStatus('Analyse IA… ' + Math.round((Date.now() - started) / 1000) + ' s', 'busy');
      }, 1000);

      try {
        const body = {
          dci: pick.dci,
          cis: pick.cis || undefined,
          noms_commerciaux: pick.noms,
          substances: pick.substances_list || [],
          contexte_bdm: pick.contexte_bdm,
        };
        const manual = $('iaMatRcp').value.trim();
        if (manual) body.rcp_text = manual;

        const ia = await G.invoke(G.FN_MATRICE, body);
        clearInterval(timer);
        if (closed) return;

        if (ia.need_manual_rcp) {
          $('iaMatManualWrap').hidden = false;
          const warns = (ia.avertissements || []).slice(0, 6);
          setStatus(
            (warns[0] || 'RCP introuvable — collez le texte puis recliquez Générer.'),
            'error',
          );
          if (warns.length > 1) {
            setStatus(warns.join(' · '), 'error');
          }
          return;
        }

        const champs = ia.champs || {};
        if (!champs.dci) champs.dci = pick.dci;
        if (!champs.nom_commercial?.length && pick.noms.length) {
          champs.nom_commercial = pick.noms.slice();
        }
        if (!champs.voies_administration?.length && pick.contexte_bdm.voies_administration) {
          const voies = String(pick.contexte_bdm.voies_administration)
            .split(/[,;\/]+/).map((s) => s.trim()).filter(Boolean);
          if (voies.length) champs.voies_administration = voies.slice(0, 6);
        }

        setStatus('Matching des entités existantes…', 'busy');
        review = await buildReviewState(champs);
        review.meta = {
          source: ia.source,
          cis: ia.cis || pick.cis,
          rcp_url: ia.rcp_url,
          avertissements: ia.avertissements || [],
          model: ia.model,
        };

        // DCI déjà en fiche ?
        existingMatriceId = null;
        try {
          const dciEnt = await global.JpEntites.findActiveByValeur('dcis', pick.dci);
          if (dciEnt?.id) {
            const existing = await global.JpMedicaments.findByDciId(dciEnt.id);
            if (existing?.id) existingMatriceId = existing.id;
          }
        } catch (_) { /* ignore */ }

        renderReview();
        setStatus('', '');
        setStep(3);
        void global.JpLogs?.action?.('referentiel_ia_matrice', {
          dci: pick.dci,
          cis: pick.cis,
          source: ia.source,
          model: ia.model || null,
        });
      } catch (e) {
        clearInterval(timer);
        if (!closed) {
          setStatus((e && e.message) || 'Erreur IA', 'error');
          $('iaMatManualWrap').hidden = false;
        }
      } finally {
        busy = false;
        if (!closed) {
          $('iaMatNext').disabled = step === 3 ? !canSave() : false;
          $('iaMatBack').disabled = false;
          $('iaMatCancel').disabled = false;
        }
      }
    }

    /* Step 3 — review */
    function badgeHtml(statut) {
      if (statut === 'existant') return '<span class="jp-ia-badge jp-ia-badge-ok">Existant</span>';
      if (statut === 'proche') return '<span class="jp-ia-badge jp-ia-badge-warn">Proche</span>';
      return '<span class="jp-ia-badge jp-ia-badge-new">Nouveau</span>';
    }

    function renderReview() {
      const host = $('iaMatReview');
      if (!review) {
        host.innerHTML = '<p class="jp-muted">Rien à revoir.</p>';
        return;
      }
      const meta = review.meta || {};
      let html = '<div class="jp-ia-review-meta">'
        + '<p>Source RCP : <strong>' + esc(meta.source || '—') + '</strong>'
        + (meta.cis ? ' · CIS ' + esc(meta.cis) : '')
        + (meta.rcp_url ? ' · <a href="' + esc(meta.rcp_url) + '" target="_blank" rel="noopener">ouvrir</a>' : '')
        + '</p>'
        + (existingMatriceId
          ? '<p class="jp-ia-warn-inline">DCI déjà en fiche — la sauvegarde enrichira la fiche existante (fusion).</p>'
          : '')
        + ((meta.avertissements || []).length
          ? '<ul class="jp-ia-warns">' + meta.avertissements.slice(0, 8).map((w) => '<li>' + esc(w) + '</li>').join('') + '</ul>'
          : '')
        + '</div>';

      for (const sec of SECTION_DEFS) {
        const lines = review.lines.filter((l) => sec.codes.includes(l.code));
        if (!lines.length) continue;
        html += '<section class="jp-ia-review-sec"><h3>' + esc(sec.titre) + '</h3>';
        for (const line of lines) {
          html += '<div class="jp-ia-review-field" data-code="' + esc(line.code) + '">'
            + '<h4>' + esc(line.libelle) + '</h4>';
          if (!line.items.length) {
            html += '<p class="jp-field-hint">Aucune suggestion — ajoutez une ligne.</p>';
          }
          for (const it of line.items) {
            html += '<div class="jp-ia-chip' + (it.kept ? '' : ' is-dropped') + '" data-key="' + esc(it.key) + '">'
              + '<label class="jp-ia-chip-keep"><input type="checkbox" data-act="keep"'
              + (it.kept ? ' checked' : '') + '> ' + badgeHtml(it.statut) + '</label>'
              + '<input type="text" class="jp-ia-chip-val" data-act="edit" value="' + esc(it.valeur) + '">'
              + (it.id ? '<span class="jp-field-hint">id ' + esc(String(it.id).slice(0, 8)) + '…</span>' : '')
              + (it.suggestions.length
                ? '<div class="jp-ia-sugs">' + it.suggestions.map((s) =>
                  '<button type="button" class="jp-link-btn" data-act="reuse" data-id="' + esc(s.id)
                  + '" data-val="' + esc(s.valeur) + '">Réutiliser « ' + esc(s.valeur) + ' »</button>').join(' ')
                + '</div>'
                : '')
              + '<div class="jp-ia-chip-actions">'
              + (it.kept
                ? '<button type="button" class="jp-link-btn" data-act="drop">Retirer</button>'
                : '<button type="button" class="jp-link-btn" data-act="restore">Restaurer</button>')
              + (it.kept && String(it.valeur || '').trim()
                ? '<button type="button" class="jp-link-btn" data-act="split">Découper</button>'
                : '')
              + (it.kept
                ? '<button type="button" class="jp-link-btn" data-act="rematch">Re-matcher</button>'
                : '')
              + '</div></div>';
          }
          if (line.card === 'N' || !line.items.some((it) => it.kept)) {
            html += '<button type="button" class="jp-link-btn" data-act="add-line" data-code="'
              + esc(line.code) + '">+ Ajouter une ligne</button>';
          }
          html += '</div>';
        }
        html += '</section>';
      }
      // Champs hors sections connues
      const known = new Set(SECTION_DEFS.flatMap((s) => s.codes));
      const orphan = review.lines.filter((l) => !known.has(l.code) && l.items.length);
      if (orphan.length) {
        html += '<section class="jp-ia-review-sec"><h3>Autres</h3>';
        for (const line of orphan) {
          html += '<div class="jp-ia-review-field" data-code="' + esc(line.code) + '">'
            + '<h4>' + esc(line.libelle) + '</h4>';
          for (const it of line.items) {
            html += '<div class="jp-ia-chip' + (it.kept ? '' : ' is-dropped') + '" data-key="' + esc(it.key) + '">'
              + badgeHtml(it.statut)
              + '<input type="text" class="jp-ia-chip-val" data-act="edit" value="' + esc(it.valeur) + '">'
              + '</div>';
          }
          html += '</div>';
        }
        html += '</section>';
      }
      host.innerHTML = html;
      $('iaMatNext').disabled = !canSave();
    }

    function findItem(key) {
      if (!review || !key) return null;
      for (const line of review.lines) {
        const item = line.items.find((it) => it.key === key);
        if (item) return { line, item };
      }
      return null;
    }

    async function rematchItem(line, item) {
      const m = await matchItem(line.table, item.valeur);
      if (!m) {
        item.statut = 'nouveau';
        item.id = '';
        item.suggestions = [];
        return;
      }
      item.statut = m.statut;
      item.id = m.id || '';
      item.valeur = m.valeur || item.valeur;
      item.suggestions = m.suggestions || [];
    }

    $('iaMatReview').addEventListener('click', (e) => {
      const act = e.target.getAttribute('data-act') || e.target.closest('[data-act]')?.getAttribute('data-act');
      if (!act || !review) return;

      if (act === 'add-line') {
        const code = e.target.getAttribute('data-code')
          || e.target.closest('[data-code]')?.getAttribute('data-code');
        const line = review.lines.find((l) => l.code === code);
        if (!line) return;
        if (line.card === 1) {
          line.items = line.items.filter((it) => it.kept);
          if (line.items.some((it) => it.kept)) return;
          line.items.push(emptyItem(code, ''));
        } else {
          line.items.push(emptyItem(code, ''));
        }
        renderReview();
        return;
      }

      const chip = e.target.closest('.jp-ia-chip');
      if (!chip) return;
      const found = findItem(chip.getAttribute('data-key'));
      if (!found) return;
      const { line, item } = found;

      if (act === 'drop') {
        item.kept = false;
        renderReview();
        return;
      }
      if (act === 'restore') {
        item.kept = true;
        renderReview();
        return;
      }
      if (act === 'reuse') {
        const btn = e.target.closest('[data-act="reuse"]');
        item.id = btn.getAttribute('data-id') || '';
        item.valeur = btn.getAttribute('data-val') || item.valeur;
        item.statut = 'existant';
        item.suggestions = [];
        item.kept = true;
        renderReview();
        return;
      }
      if (act === 'split') {
        const parts = splitValeur(item.valeur);
        if (parts.length < 2) {
          global.JpToast?.warn?.('Rien à découper (utilisez ; ou retours ligne)');
          return;
        }
        const idx = line.items.indexOf(item);
        const neu = parts.map((p, i) => {
          if (i === 0) {
            item.valeur = p;
            item.id = '';
            item.statut = 'nouveau';
            item.suggestions = [];
            item.kept = true;
            return null;
          }
          return emptyItem(line.code, p);
        }).filter(Boolean);
        line.items.splice(idx + 1, 0, ...neu);
        void (async () => {
          for (const it of [item, ...neu]) await rematchItem(line, it);
          renderReview();
        })();
        return;
      }
      if (act === 'rematch') {
        void (async () => {
          await rematchItem(line, item);
          renderReview();
        })();
      }
    });

    $('iaMatReview').addEventListener('change', (e) => {
      if (e.target.getAttribute('data-act') !== 'keep') return;
      const chip = e.target.closest('.jp-ia-chip');
      if (!chip || !review) return;
      const found = findItem(chip.getAttribute('data-key'));
      if (!found) return;
      found.item.kept = !!e.target.checked;
      $('iaMatNext').disabled = !canSave();
      chip.classList.toggle('is-dropped', !found.item.kept);
    });

    let rematchTimer = null;
    $('iaMatReview').addEventListener('input', (e) => {
      if (e.target.getAttribute('data-act') !== 'edit') return;
      const chip = e.target.closest('.jp-ia-chip');
      if (!chip || !review) return;
      const found = findItem(chip.getAttribute('data-key'));
      if (!found) return;
      const { line, item } = found;
      item.valeur = e.target.value;
      item.id = '';
      if (item.statut === 'existant') item.statut = 'nouveau';
      $('iaMatNext').disabled = !canSave();
      clearTimeout(rematchTimer);
      rematchTimer = setTimeout(() => {
        void (async () => {
          await rematchItem(line, item);
          // Mise à jour légère badge / suggestions sans perdre le focus
          const badge = chip.querySelector('.jp-ia-badge');
          if (badge) {
            badge.outerHTML = badgeHtml(item.statut);
          }
          let sugs = chip.querySelector('.jp-ia-sugs');
          if (item.suggestions.length) {
            const htmlS = '<div class="jp-ia-sugs">' + item.suggestions.map((s) =>
              '<button type="button" class="jp-link-btn" data-act="reuse" data-id="' + esc(s.id)
              + '" data-val="' + esc(s.valeur) + '">Réutiliser « ' + esc(s.valeur) + ' »</button>').join(' ')
              + '</div>';
            if (sugs) sugs.outerHTML = htmlS;
            else {
              const actions = chip.querySelector('.jp-ia-chip-actions');
              if (actions) actions.insertAdjacentHTML('beforebegin', htmlS);
              else chip.insertAdjacentHTML('beforeend', htmlS);
            }
          } else if (sugs) {
            sugs.remove();
          }
        })();
      }, 450);
    });

    async function runSave() {
      if (!review || busy || !canSave()) return;
      busy = true;
      $('iaMatNext').disabled = true;
      try {
        const payload = collectSavePayload(review);
        const saved = await global.JpMedicaments.save(payload, existingMatriceId || null);
        global.JpToast?.ok?.(existingMatriceId ? 'Fiche enrichie (brouillon)' : 'Fiche créée (brouillon)');
        void global.JpLogs?.action?.('referentiel_ia_matrice_save', {
          id: saved?.id,
          merge: !!existingMatriceId,
          dci: payload.singular?.dci?.valeur || pick?.dci,
        });
        close();
        if (typeof opts.onSaved === 'function') await opts.onSaved(saved);
      } catch (e) {
        global.JpToast?.fromError?.(e);
        void global.JpLogs?.error?.('referentiel_ia_matrice_save', { message: e?.message });
      } finally {
        busy = false;
        if (!closed) $('iaMatNext').disabled = !canSave();
      }
    }

    $('iaMatBack').addEventListener('click', () => {
      if (busy) return;
      if (step === 3) setStep(2);
      else if (step === 2) setStep(1);
    });

    $('iaMatNext').addEventListener('click', () => {
      if (busy) return;
      if (step === 1) {
        if (!pick?.dci) return;
        renderGenInfo();
        setStep(2);
      } else if (step === 2) {
        void runGenerate();
      } else if (step === 3) {
        void runSave();
      }
    });

    setStep(1);
    setTimeout(() => $('iaMatQ').focus(), 0);
  }

  global.JpReferentielIA = { open, matchItem, buildReviewState, collectSavePayload };
})(window);
