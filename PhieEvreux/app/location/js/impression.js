/**
 * Impression Location — fiche / tableau / contacts.
 * Uniquement via iframe caché dans le document (jamais window.open).
 */
(function (global) {
  const R = () => global.LocationRules;

  function esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function cautionLabel(c) {
    if (!c) return 'Rien';
    if (c === 'cheque_150') return 'Chèque 150 €';
    if (c === 'especes') return 'Espèces';
    if (c === 'autre') return 'Autre';
    return c;
  }

  function zone(title, bodyHtml) {
    return `<section class="print-zone"><h2>${esc(title)}</h2>${bodyHtml}</section>`;
  }

  function line(label, value) {
    return `<div class="print-line"><span class="print-label">${esc(label)}</span><span class="print-val">${esc(value || '') || '&nbsp;'}</span></div>`;
  }

  function blankLines(n) {
    let h = '';
    for (let i = 0; i < n; i++) h += '<div class="print-blank"></div>';
    return h;
  }

  const CONTACT_STATUT_LABELS = {
    a_contacter: 'À contacter',
    en_cours: 'En cours',
    reporte: 'À rappeler',
    contacte: 'Contacté',
    resolu: 'Résolu',
  };

  /** Lignes Suivi fiche A4 : location initiale, prolongations, contacts (résumé), rendu. */
  function buildSuiviEventRows(dossier) {
    const rows = [];
    const resultatLabels = global.LocationContact?.APPEL_RESULTAT_LABELS || {};
    const prolongations = (dossier.prolongations || []).slice().sort((a, b) =>
      String(a.date_ordo || a.created_at || '').localeCompare(String(b.date_ordo || b.created_at || ''))
    );
    prolongations.forEach((pr, idx) => {
      const duree = [pr.duree, pr.unite].filter((x) => x != null && x !== '').join(' ');
      const label =
        (idx === 0 ? 'Location initiale' : `Prolongation ${idx}`) +
        (duree ? ` · ${duree}` : '') +
        (pr.date_fin ? ` → fin ${pr.date_fin}` : '');
      rows.push({ date: pr.date_ordo || null, libelle: label });
    });

    const appareils = (dossier.appareils || []).slice().sort((a, b) =>
      String(a.date_debut || a.created_at || '').localeCompare(String(b.date_debut || b.created_at || ''))
    );
    appareils.forEach((ap, idx) => {
      if (idx === 0) return;
      const typeTxt = R().typeLabel(ap.type_appareil) + (ap.type_libelle ? ` (${ap.type_libelle})` : '');
      const num = ap.numero_pharmacie || ap.matricule || '—';
      rows.push({
        date: ap.date_debut || ap.created_at?.slice?.(0, 10) || null,
        libelle: `Changement d'appareil · ${typeTxt} · n° ${num}`,
      });
    });

    const contacts = (dossier.contacts || []).slice().sort((a, b) =>
      String(a.contacted_at || a.created_at || '').localeCompare(
        String(b.contacted_at || b.created_at || '')
      )
    );
    let contactIdx = 0;
    contacts.forEach((c) => {
      if (c.statut === 'annule') return;
      contactIdx += 1;
      const when = (c.contacted_at || c.updated_at || c.created_at || '').slice(0, 10) || null;
      const res = c.resultat ? resultatLabels[c.resultat] || c.resultat : '';
      const st = CONTACT_STATUT_LABELS[c.statut] || c.statut || '';
      const parts = [`Contact ${contactIdx}`, st, res].filter(Boolean);
      rows.push({ date: when, libelle: parts.join(' · ') });
    });

    if (dossier.appareil_rendu) {
      rows.push({
        date: dossier.appareil_rendu_le || null,
        libelle:
          'Appareil rendu' +
          (dossier.appareil_rendu_op ? ` · OP ${dossier.appareil_rendu_op}` : ''),
      });
    }

    rows.sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
    return rows;
  }

  /** Notes dossier hors lignes journal d’appels datées JJ/MM/AAAA —. */
  function notesInitiales(notes) {
    return String(notes || '')
      .split(/\n+/)
      .map((l) => l.trim())
      .filter((l) => l && !/^\d{2}\/\d{2}\/\d{4}\s*[—\-–]/u.test(l))
      .join('\n');
  }

  function versionCourteFr() {
    const d = new Date();
    return `${d.getDate()}/${d.getMonth() + 1}`;
  }

  function formatDateFrPrint(iso) {
    if (!iso) return '';
    const s = String(iso).slice(0, 10);
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!m) return s;
    return `${m[3]}/${m[2]}/${m[1]}`;
  }

  /** Impression same-document — pas de pop-up, pas d’alerte « Autorisez les pop-ups ». */
  function printHtml(html) {
    const prev = document.getElementById('loc-print-frame');
    if (prev) prev.remove();

    const iframe = document.createElement('iframe');
    iframe.id = 'loc-print-frame';
    iframe.setAttribute('aria-hidden', 'true');
    iframe.setAttribute('title', 'Impression');
    iframe.style.cssText =
      'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none;';
    document.body.appendChild(iframe);

    const win = iframe.contentWindow;
    const doc = iframe.contentDocument || win.document;
    if (!doc || !win) {
      iframe.remove();
      alert('Impression impossible.');
      return;
    }

    doc.open();
    doc.write(html);
    doc.close();

    const cleanup = () => {
      try {
        iframe.remove();
      } catch (_) {
        /* ignore */
      }
    };

    const trigger = () => {
      try {
        win.focus();
        win.print();
      } catch (e) {
        alert('Impression impossible : ' + (e.message || e));
      } finally {
        setTimeout(cleanup, 2000);
      }
    };

    // Laisser le navigateur peindre le document iframe avant print()
    if (doc.readyState === 'complete') {
      setTimeout(trigger, 50);
    } else {
      iframe.onload = () => setTimeout(trigger, 50);
    }
  }

  function resolveAppareilType(dossier) {
    const a = dossier?.appareil_actif;
    if (a?.type_appareil) return a.type_appareil;
    const apps = dossier?.appareils || [];
    const actif = apps.find((x) => x.actif);
    return (actif || apps[0])?.type_appareil || null;
  }

  async function loadAttentionLines(dossier) {
    const type = resolveAppareilType(dossier);
    if (!type || !global.LocationData?.listChampsCreation) return [];
    // Même requête que Création (tous les champs actifs), filtre côté client —
    // plus fiable que .eq(type) + double order selon les versions PostgREST.
    const champs = await LocationData.listChampsCreation(null, true);
    return (champs || [])
      .filter(
        (c) =>
          c.type_appareil === type &&
          String(c.data_type || '').toLowerCase() === 'attention' &&
          String(c.libelle || '').trim()
      )
      .map((c) => String(c.libelle).trim());
  }

  function formatPrintValue(v, dataType) {
    if (v == null || v === '') return '';
    if (dataType === 'oui_non' || typeof v === 'boolean') return v ? 'Oui' : 'Non';
    return String(v);
  }

  function customCreationLines(params, etapeId, extra) {
    const bag = extra && typeof extra === 'object' ? extra : {};
    if (!global.LocationData?.listCreationFieldsForEtape) return [];
    return LocationData.listCreationFieldsForEtape(params, etapeId)
      .filter((f) => f.custom)
      .map((f) => {
        const raw = bag[f.code];
        if (raw == null || raw === '') return null;
        return line(f.label, formatPrintValue(raw));
      })
      .filter(Boolean);
  }

  function specChampLines(champsDef, typeAppareil, extra) {
    const bag = extra && typeof extra === 'object' ? extra : {};
    const typeChamps = (champsDef || []).filter(
      (c) =>
        c.type_appareil === typeAppareil &&
        String(c.data_type || '').toLowerCase() !== 'attention' &&
        c.actif !== false
    );
    return typeChamps
      .map((c) => {
        const raw = bag[c.code];
        if (raw == null || raw === '') return null;
        return line(c.libelle || c.code, formatPrintValue(raw, c.data_type));
      })
      .filter(Boolean);
  }

  /**
   * Fiche papier compacte — 1 page A4, priorité lignes manuscrites de suivi.
   * @param {object} dossier
   * @param {{ attentionLines?: string[] }|string[]} [meta]
   */
  function buildFicheHtml(dossier, meta) {
    const attentionLines = Array.isArray(meta) ? meta : meta?.attentionLines || [];

    const p = dossier.patient || {};
    const a = dossier.appareil_actif || {};
    const tels = (p.telephones || []).join(' · ');
    const mails = (p.mails || []).join(' · ');
    const typeTxt =
      R().typeLabel(a.type_appareil) + (a.type_libelle ? ` (${a.type_libelle})` : '');
    const refApp = a.numero_pharmacie || a.matricule || '—';
    const sourceTxt = a.source === 'prestataire' ? 'Prestataire' : 'Parc pharmacie';

    const prolongs = prolongationsSorted(dossier);
    const init = prolongs[0];
    const ordoTxt = init
      ? [
          init.date_ordo ? `Ordo ${init.date_ordo}` : '',
          init.duree != null ? `${init.duree} ${init.unite || ''}`.trim() : '',
        ]
          .filter(Boolean)
          .join(' · ')
      : '';

    const attentionParts = [];
    (attentionLines || []).forEach((t) => {
      const s = String(t || '').trim();
      if (s) attentionParts.push(s);
    });
    const commentaire = String(a.encart_texte || '').trim();
    if (commentaire) attentionParts.push(commentaire);
    const attentionShort = attentionParts.length
      ? `<div class="print-attention-short"><strong>Attention</strong> ${esc(
          attentionParts.join(' · ')
        )}</div>`
      : '';

    const identite = [p.nom, p.prenom].filter(Boolean).join(' ') || '—';

    const bandeau = `<div class="print-bandeau">${esc(
      [
        `OP ${dossier.code_op || '—'}`,
        `Caution ${cautionLabel(dossier.caution)}`,
        `Début ${dossier.date_debut || '—'}`,
        `Fin ${dossier.date_fin || '—'}`,
        statutLabel(dossier.statut),
      ].join(' · ')
    )}</div>`;

    const patientBlock = `<section class="print-zone print-patient">
  <h2>Patient</h2>
  <div class="print-grid2">
    <div class="print-kv"><span class="print-label">Identité</span><span class="print-val">${esc(identite)}</span></div>
    <div class="print-kv"><span class="print-label">Naissance</span><span class="print-val">${esc(p.date_naissance || '') || '&nbsp;'}</span></div>
    <div class="print-kv"><span class="print-label">Téléphone(s)</span><span class="print-val">${esc(tels) || '&nbsp;'}</span></div>
    <div class="print-kv"><span class="print-label">Mail(s)</span><span class="print-val">${esc(mails) || '&nbsp;'}</span></div>
    <div class="print-kv print-span2"><span class="print-label">Adresse</span><span class="print-val">${esc(p.adresse || '') || '&nbsp;'}</span></div>
  </div>
</section>`;

    const locParts = [
      typeTxt || '—',
      sourceTxt,
      `mat./n° ${refApp}`,
      `Qui facture ${quiFactureLabel(dossier.qui_facture)}`,
      ordoTxt,
    ].filter(Boolean);
    const locBlock = `<section class="print-zone print-loc">
  <h2>Location / appareil</h2>
  <div class="print-loc-recap">${esc(locParts.join(' · '))}</div>
  ${attentionShort}
</section>`;

    // Priorité aux lignes manuscrites : ≥ 10, viser 12–14 ; 0–3 événements max.
    const BLANK_ROWS = 13;
    const MAX_EVENTS = 3;
    const datePh = '<span class="print-date-ph">   /    /       </span>';
    const checkCell = '<td class="col-check">□</td>';
    const emptySuiviRow = `<tr class="print-row-fill"><td class="col-date">${datePh}</td><td class="col-lib">&nbsp;</td>${checkCell}</tr>`;
    // Si trop d’événements, aucun prérempli (priorité aux lignes manuscrites).
    const allEvents = buildSuiviEventRows(dossier);
    const eventRows = allEvents.length <= MAX_EVENTS ? allEvents : [];
    const suiviFilled = eventRows
      .map((s) => {
        const dateCell = s.date ? esc(s.date) : datePh;
        return `<tr><td class="col-date">${dateCell}</td><td class="col-lib">${esc(s.libelle || '')}</td>${checkCell}</tr>`;
      })
      .join('');
    const suiviBlock = `<section class="print-zone print-suivi">
  <h2>Suivi</h2>
  <table class="print-table print-table-suivi"><thead><tr>
    <th class="col-date">Date</th>
    <th class="col-lib">Libellé</th>
    <th class="col-check">□</th>
  </tr></thead><tbody>${suiviFilled}${emptySuiviRow.repeat(BLANK_ROWS)}</tbody></table>
</section>`;

    function clotureHand(label, dateVal, parVal) {
      const lePart = dateVal ? esc(dateVal) : '__________';
      const parPart = parVal ? esc(parVal) : '___________';
      return `<div class="print-cloture-line">${esc(label)} le ${lePart} par ${parPart}</div>`;
    }
    const clotureLines = [
      clotureHand(
        'Appareil rendu',
        dossier.appareil_rendu && dossier.appareil_rendu_le ? dossier.appareil_rendu_le : null,
        dossier.appareil_rendu_op || null
      ),
      clotureHand(
        'Caution rendue',
        dossier.caution_rendue && dossier.caution_rendue_le ? dossier.caution_rendue_le : null,
        dossier.caution_rendue_op || null
      ),
    ];
    if (dossier.statut === 'cloture' || dossier.date_cloture) {
      clotureLines.push(
        clotureHand(
          'Dossier clôturé',
          dossier.date_cloture || null,
          dossier.cloture_op || null
        )
      );
    }
    const clotureBlock = `<section class="print-zone print-cloture"><h2>Clôture</h2>${clotureLines.join('')}</section>`;

    return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Fiche location</title>
<style>
  @page{size:A4;margin:7mm}
  html,body{margin:0;height:100%}
  body{
    font-family:Georgia,serif;color:#111;font-size:9.5px;line-height:1.2;
    box-sizing:border-box;height:283mm;max-height:283mm;overflow:hidden;
    display:flex;flex-direction:column;padding:0;
  }
  *{box-sizing:border-box}
  h1{font-size:12px;margin:0 0 1px;flex:0 0 auto}
  .print-meta{color:#555;margin:0 0 3px;font-size:7.5px;flex:0 0 auto}
  .print-bandeau{
    flex:0 0 auto;border:1px solid #222;padding:3px 5px;margin-bottom:3px;
    font-size:9px;font-weight:700;letter-spacing:.01em
  }
  .print-zone{border:1px solid #222;padding:3px 5px;margin-bottom:3px;flex:0 0 auto}
  .print-zone h2{margin:0 0 2px;font-size:8.5px;text-transform:uppercase;letter-spacing:.04em}
  .print-grid2{display:grid;grid-template-columns:1fr 1fr;gap:1px 8px}
  .print-kv{display:flex;gap:5px;border-bottom:1px dotted #bbb;padding:1px 0;min-height:12px}
  .print-span2{grid-column:1 / -1}
  .print-label{width:78px;flex-shrink:0;color:#444}
  .print-val{flex:1;min-width:0}
  .print-loc-recap{padding:1px 0}
  .print-attention-short{
    margin-top:2px;border:1px solid #c00;padding:2px 4px;font-size:8.5px;
    white-space:nowrap;overflow:hidden;text-overflow:ellipsis
  }
  .print-attention-short strong{color:#c00;margin-right:4px;text-transform:uppercase;font-size:8px}
  .print-suivi{flex:1 1 auto;min-height:0;display:flex;flex-direction:column;overflow:hidden}
  .print-table{width:100%;border-collapse:collapse;font-size:9px;flex:1}
  .print-table-suivi{height:100%}
  .print-table th,.print-table td{border:1px solid #999;padding:1px 3px;text-align:left;vertical-align:middle}
  .print-table th{background:#f3f3f3;font-size:8px}
  .print-table .col-date{width:4.2em;white-space:pre;font-variant-numeric:tabular-nums}
  .print-table .col-check{width:1.8em;text-align:center}
  .print-table .col-lib{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .print-date-ph{white-space:pre;color:#666}
  .print-cloture{flex:0 0 auto;margin-bottom:0}
  .print-cloture-line{padding:2px 0;border-bottom:1px dotted #bbb}
  .print-cloture-line:last-child{border-bottom:none}
  .print-row-fill td{height:16px}
  @media print{
    body{margin:0;height:283mm;max-height:283mm;overflow:hidden}
  }
</style></head><body>
  <h1>Fiche location — Phie Evreux</h1>
  <p class="print-meta">Imprimé le ${esc(new Date().toLocaleString('fr-FR'))}</p>
  ${bandeau}
  ${patientBlock}
  ${locBlock}
  ${suiviBlock}
  ${clotureBlock}
</body></html>`;
  }

  async function printFiche(dossier) {
    if (!dossier) {
      alert('Aucune fiche à imprimer.');
      return;
    }
    let attentionLines = [];
    try {
      attentionLines = await loadAttentionLines(dossier);
    } catch (_) {
      attentionLines = [];
    }
    printHtml(buildFicheHtml(dossier, { attentionLines }));
  }

  function statutLabel(s) {
    if (s === 'actif') return 'Actif';
    if (s === 'en_attente') return 'En attente';
    if (s === 'cloture') return 'Clôturé';
    if (s === 'annule') return 'Annulé';
    return s || '—';
  }

  function sourceLabel(s) {
    if (s === 'prestataire') return 'Prestataire';
    if (s === 'parc') return 'Parc';
    return s || '—';
  }

  function modeObtentionLabel(m) {
    if (m === 'depot') return 'Dépôt';
    if (m === 'appel') return 'Appel';
    return m || '';
  }

  function livraisonLabel(l) {
    if (l === 'pharmacie') return 'Pharmacie';
    if (l === 'patient') return 'Patient';
    return l || '';
  }

  function quiFactureLabel(q) {
    if (q === 'prestataire') return 'Prestataire';
    if (q === 'pharmacie') return 'Pharmacie';
    return q || '—';
  }

  function joinParts(parts, sep) {
    return (parts || []).map((p) => String(p ?? '').trim()).filter(Boolean).join(sep || ' · ');
  }

  function multilines(parts) {
    return (parts || [])
      .map((p) => String(p ?? '').trim())
      .filter(Boolean)
      .map((p) => esc(p))
      .join('<br>');
  }

  function champsExtraText(extra, champsDef, typeAppareil) {
    if (!extra || typeof extra !== 'object') return '';
    const labelByCode = {};
    (champsDef || [])
      .filter((c) => !typeAppareil || c.type_appareil === typeAppareil)
      .forEach((c) => {
        if (c.code) labelByCode[c.code] = c.libelle || c.code;
      });
    return Object.entries(extra)
      .filter(([, v]) => v != null && v !== '' && v !== false)
      .map(([k, v]) => {
        const lab = labelByCode[k] || k;
        if (v === true) return lab;
        return `${lab}=${v}`;
      })
      .join(' · ');
  }

  function prolongationsSorted(d) {
    return (d.prolongations || []).slice().sort((a, b) =>
      String(a.date_ordo || a.created_at || '').localeCompare(String(b.date_ordo || b.created_at || ''))
    );
  }

  async function printTableau(dossiers) {
    let prestMap = {};
    let champsDef = [];
    try {
      const prests = await LocationData.listPrestataires(false);
      (prests || []).forEach((p) => {
        prestMap[p.id] = p.nom || p.id;
      });
    } catch (_) {
      prestMap = {};
    }
    try {
      if (global.LocationData?.listChampsCreation) {
        champsDef = await LocationData.listChampsCreation(null, true);
      }
    } catch (_) {
      champsDef = [];
    }

    const list = dossiers || [];
    const rows = list
      .map((d) => {
        const p = d.patient || {};
        const a = d.appareil_actif || {};
        const prolongs = prolongationsSorted(d);
        const init = prolongs[0];
        const nbProlong = Math.max(0, prolongs.length - 1);

        const patientCell = multilines([
          joinParts([p.nom, p.prenom], ' '),
          p.date_naissance ? `Né(e) ${p.date_naissance}` : '',
          p.adresse || '',
          (p.telephones || []).length ? `Tél. ${(p.telephones || []).join(', ')}` : '',
          (p.mails || []).length ? `Mail ${(p.mails || []).join(', ')}` : '',
        ]);

        const dossierCell = multilines([
          joinParts([`OP ${d.code_op || '—'}`, `Caution ${cautionLabel(d.caution)}`], ' · '),
          joinParts([statutLabel(d.statut), `Facture ${quiFactureLabel(d.qui_facture)}`], ' · '),
        ]);

        const typeTxt = joinParts([
          R().typeLabel(a.type_appareil),
          a.type_libelle || '',
        ], ' ');
        const refApp =
          a.source === 'prestataire'
            ? joinParts([
                a.matricule ? `Mat. ${a.matricule}` : '',
                a.prestataire_id ? prestMap[a.prestataire_id] || a.prestataire_id : '',
                modeObtentionLabel(a.mode_obtention),
                livraisonLabel(a.livraison),
                a.facturation_prestataire ? 'Fact. prestataire' : '',
              ])
            : joinParts([
                a.numero_pharmacie ? `N° ${a.numero_pharmacie}` : '',
                a.desinfection ? 'Désinfecté' : '',
              ]);
        const appareilCell = multilines([
          joinParts([typeTxt, sourceLabel(a.source)], ' · '),
          refApp,
          a.date_accouchement ? `Accouchement ${a.date_accouchement}` : '',
          a.pese_bebe_regler_avance != null
            ? `Régler avance ${a.pese_bebe_regler_avance ? 'oui' : 'non'}${a.pese_bebe_periode ? ` (${a.pese_bebe_periode})` : ''}`
            : '',
          champsExtraText(a.champs_extra, champsDef, a.type_appareil),
        ]);

        const periodeCell = multilines([
          joinParts([d.date_debut || a.date_debut || '—', '→', d.date_fin || '—'], ' '),
          init
            ? joinParts([
                init.date_ordo ? `Ordo ${init.date_ordo}` : '',
                init.duree != null ? `${init.duree} ${init.unite || ''}` : '',
              ])
            : '',
          nbProlong > 0 ? `${nbProlong} prolongation(s)` : 'Sans prolongation',
        ]);

        const clotureCell = multilines([
          d.appareil_rendu
            ? joinParts([
                'Appareil rendu',
                d.appareil_rendu_le || '',
                d.appareil_rendu_op ? `par ${d.appareil_rendu_op}` : '',
              ])
            : 'Appareil non rendu',
          d.caution_rendue
            ? joinParts([
                'Caution rendue',
                d.caution_rendue_le || '',
                d.caution_rendue_op ? `par ${d.caution_rendue_op}` : '',
              ])
            : '',
          d.statut === 'cloture'
            ? joinParts([
                'Clôturé',
                d.date_cloture || '',
                d.cloture_op ? `par ${d.cloture_op}` : '',
              ])
            : '',
        ]);

        const notesCell = multilines([a.encart_texte || '', d.notes || '']);

        return `<tr>
          <td>${patientCell || '—'}</td>
          <td>${dossierCell || '—'}</td>
          <td>${appareilCell || '—'}</td>
          <td>${periodeCell || '—'}</td>
          <td>${clotureCell || '—'}</td>
          <td>${notesCell || '—'}</td>
        </tr>`;
      })
      .join('');

    printHtml(`<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Tableau locations</title>
<style>
  @page{size:A4 landscape;margin:7mm}
  html,body{margin:0}
  body{font-family:system-ui,Segoe UI,sans-serif;font-size:8px;line-height:1.25;color:#111}
  h1{font-size:12px;margin:0 0 2px}
  .print-meta{margin:0 0 6px;color:#555;font-size:7.5px}
  table{width:100%;border-collapse:collapse;table-layout:fixed}
  th,td{border:1px solid #444;padding:3px 4px;text-align:left;vertical-align:top;overflow-wrap:anywhere;word-break:break-word}
  th{background:#e8e8e8;font-size:7.5px;text-transform:uppercase;letter-spacing:.02em}
  col.c-patient{width:22%}
  col.c-dossier{width:14%}
  col.c-appareil{width:22%}
  col.c-periode{width:14%}
  col.c-cloture{width:16%}
  col.c-notes{width:12%}
  @media print{
    body{print-color-adjust:exact;-webkit-print-color-adjust:exact}
  }
</style></head><body>
  <h1>Tableau des locations — Phie Evreux</h1>
  <p class="print-meta">${list.length} dossier(s) · Imprimé le ${esc(new Date().toLocaleString('fr-FR'))} · Format A4 paysage</p>
  <table>
    <colgroup>
      <col class="c-patient"><col class="c-dossier"><col class="c-appareil">
      <col class="c-periode"><col class="c-cloture"><col class="c-notes">
    </colgroup>
    <thead><tr>
      <th>Patient</th>
      <th>Dossier</th>
      <th>Appareil</th>
      <th>Période</th>
      <th>Clôture</th>
      <th>Notes</th>
    </tr></thead>
    <tbody>${rows || '<tr><td colspan="6">Aucun dossier.</td></tr>'}</tbody>
  </table>
</body></html>`);
  }

  function printContactList(items) {
    const RESULTAT_LABELS = global.LocationContact?.APPEL_RESULTAT_LABELS || {};
    const STATUT_LABELS = global.LocationContact?.APPEL_STATUT_LABELS || {};

    const rows = (items || [])
      .map((it) => {
        const d = it.dossier || {};
        const p = d.patient || {};
        const a = d.appareil_actif || {};
        const tels = (p.telephones || []).join(' · ') || '—';
        const compte = it.commentaire_fait_at || it.phase === 'appel' ? 'ECRIS' : 'com. à faire';
        const statut = STATUT_LABELS[it.statut] || it.statut || '—';
        const resultat = it.resultat
          ? RESULTAT_LABELS[it.resultat] || it.resultat
          : '—';
        const typeTxt =
          R().typeLabel(a.type_appareil) + (a.type_libelle ? ` (${a.type_libelle})` : '');

        const identite = `
          <strong>${esc([p.nom, p.prenom].filter(Boolean).join(' '))}</strong>
          <span>Né(e) le ${esc(p.date_naissance || '—')}</span>
          <span>Tél. : ${esc(tels)}</span>`;
        const location = `
          <strong>${esc(typeTxt || '—')}</strong>
          <span>Début : ${esc(d.date_debut || '—')}</span>
          <span>Fin : ${esc(d.date_fin || '—')}</span>
          <span>Motif : ${esc(it.motif || '—')}</span>`;
        const appel = `
          <strong>${esc(statut)}</strong>
          <span>Résultat : ${esc(resultat)}</span>
          <span>Phase : ${esc(it.phase === 'appel' ? 'Appel' : 'Commentaire')}</span>`;

        return `<tr>
          <td class="print-identity">${identite}</td>
          <td class="print-location">${location}</td>
          <td>${esc(it.commentaire || '')}</td>
          <td>${esc(compte)}</td>
          <td class="print-call">${appel}</td>
          <td class="print-followup">${esc(d.notes || '')}</td>
        </tr>`;
      })
      .join('');

    printHtml(`<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Patients à contacter</title>
<style>
  @page{size:A4 landscape;margin:8mm}
  html,body{margin:0}
  body{font-family:Arial,sans-serif;font-size:9px;line-height:1.25;color:#111}
  h1{font-size:15px;margin:0 0 3px}
  .print-date{margin:0 0 8px;color:#444;font-size:8px}
  table{width:100%;border-collapse:collapse;table-layout:fixed}
  th,td{border:0.5pt solid #8a8a8a;padding:4px 5px;text-align:left;vertical-align:top;line-height:1.25;overflow-wrap:anywhere}
  th{background:#dfe3e6;font-weight:700;font-size:8.5px;text-transform:uppercase}
  tbody tr:nth-child(even) td{background:#f3f4f5}
  th:nth-child(1){width:19%}
  th:nth-child(2){width:12%}
  th:nth-child(3){width:17%}
  th:nth-child(4){width:7%}
  th:nth-child(5){width:18%}
  th:nth-child(6){width:27%}
  .print-identity strong,.print-location strong,.print-call strong{display:block;margin-bottom:2px;font-size:9.5px}
  .print-identity span,.print-location span,.print-call span{display:block;margin-top:1px}
  .print-followup{white-space:pre-wrap}
  @media print{body{print-color-adjust:exact;-webkit-print-color-adjust:exact}}
</style></head><body>
  <h1>Phie Evreux — Locations (Contact)</h1>
  <p class="print-date">Imprimé le ${esc(new Date().toLocaleString('fr-FR'))}</p>
  <table>
    <thead><tr>
      <th>Identité</th>
      <th>Location</th>
      <th>Commentaire</th>
      <th>Statut com.</th>
      <th>Appel</th>
      <th>Suivi</th>
    </tr></thead>
    <tbody>${rows || '<tr><td colspan="6">Aucune ligne</td></tr>'}</tbody>
  </table>
</body></html>`);
  }

  global.LocationPrint = { printFiche, printTableau, printContactList, buildFicheHtml };
})(window);
