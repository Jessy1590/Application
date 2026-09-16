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

  /** Lignes « Suivi matériel » depuis les événements dossier (pas location_suivi_lignes). */
  function buildSuiviEventRows(dossier) {
    const rows = [];
    const prolongations = (dossier.prolongations || []).slice().sort((a, b) =>
      String(a.date_ordo || a.created_at || '').localeCompare(String(b.date_ordo || b.created_at || ''))
    );
    prolongations.forEach((pr, idx) => {
      const duree = [pr.duree, pr.unite].filter((x) => x != null && x !== '').join(' ');
      const label =
        (idx === 0 ? 'Ordonnance initiale' : 'Prolongation') +
        (duree ? ` · ${duree}` : '') +
        (pr.date_fin ? ` → fin ${pr.date_fin}` : '') +
        (pr.notes ? ` · ${pr.notes}` : '');
      rows.push({ date: pr.date_ordo || null, libelle: label });
    });

    const appareils = (dossier.appareils || []).slice().sort((a, b) =>
      String(a.date_debut || a.created_at || '').localeCompare(String(b.date_debut || b.created_at || ''))
    );
    appareils.forEach((ap, idx) => {
      if (idx === 0) return; // premier = mise en service, pas un changement
      const typeTxt = R().typeLabel(ap.type_appareil) + (ap.type_libelle ? ` (${ap.type_libelle})` : '');
      const num = ap.numero_pharmacie || ap.matricule || '—';
      rows.push({
        date: ap.date_debut || ap.created_at?.slice?.(0, 10) || null,
        libelle: `Changement d'appareil · ${typeTxt} · n° ${num}`,
      });
    });

    if (dossier.appareil_rendu) {
      rows.push({
        date: null,
        libelle: "Rendu d'appareil",
      });
    }
    if (dossier.caution_rendue) {
      rows.push({
        date: dossier.caution_rendue_le || null,
        libelle:
          'Caution rendue' +
          (dossier.caution_rendue_op ? ` · OP ${dossier.caution_rendue_op}` : ''),
      });
    }
    if (dossier.statut === 'cloture' || dossier.date_cloture) {
      rows.push({
        date: dossier.date_cloture || null,
        libelle: 'Clôture du dossier' + (dossier.cloture_op ? ` · OP ${dossier.cloture_op}` : ''),
      });
    }

    const contacts = (dossier.contacts || []).slice().sort((a, b) =>
      String(a.contacted_at || a.created_at || '').localeCompare(
        String(b.contacted_at || b.created_at || '')
      )
    );
    contacts.forEach((c) => {
      const when = (c.contacted_at || c.updated_at || c.created_at || '').slice(0, 10) || null;
      const st = CONTACT_STATUT_LABELS[c.statut] || c.statut || '';
      const parts = [
        'Appel / contact',
        c.motif || '',
        st,
        c.resultat || '',
        c.commentaire || '',
      ].filter(Boolean);
      rows.push({ date: when, libelle: parts.join(' · ') });
    });

    rows.sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
    return rows;
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

  function buildFicheHtml(dossier) {
    const p = dossier.patient || {};
    const a = dossier.appareil_actif || {};
    const tels = (p.telephones || []).join(' · ');
    const mails = (p.mails || []).join(' · ');
    const prolong = (dossier.prolongations || [])[0];
    const dateFin = dossier.date_fin || '';
    const typeTxt =
      R().typeLabel(a.type_appareil) + (a.type_libelle ? ` (${a.type_libelle})` : '');

    const appareilExtra = [];
    if (a.source === 'prestataire') {
      appareilExtra.push(
        line('Matricule', a.matricule),
        line('Obtention', a.mode_obtention),
        line('Livraison', a.livraison)
      );
    } else {
      appareilExtra.push(
        line('N° pharmacie', a.numero_pharmacie),
        line('Désinfection', a.desinfection ? 'Oui' : 'Non')
      );
    }
    if (a.type_appareil === 'pese_bebe') {
      appareilExtra.push(
        line('Régler d’avance', a.pese_bebe_regler_avance ? 'Oui' : 'Non'),
        line('Période', a.pese_bebe_periode)
      );
    }
    if (a.type_appareil === 'tire_lait') {
      appareilExtra.push(line('Date accouchement', a.date_accouchement));
    }

    const headerBlock = `<section class="print-zone print-top">
  <div class="print-banner">
    <span><strong>OP</strong> ${esc(dossier.code_op || '')}</span>
    <span><strong>Caution</strong> ${esc(cautionLabel(dossier.caution))}</span>
    <span><strong>Début</strong> ${esc(dossier.date_debut || '')}</span>
    <span><strong>Fin prévue</strong> ${esc(dateFin || '')}</span>
  </div>
  <div class="print-cols">
    <div class="print-col">
      <h2>Patient</h2>
      ${[
        line('Nom / Prénom', [p.nom, p.prenom].filter(Boolean).join(' ')),
        line('Date de naissance', p.date_naissance),
        line('Adresse', p.adresse),
        line('Téléphone(s)', tels),
        line('Mail(s)', mails),
      ].join('')}
    </div>
    <div class="print-col">
      <h2>Appareil</h2>
      ${[
        line('Type', typeTxt),
        line('Source', a.source === 'prestataire' ? 'Prestataire' : 'Parc pharmacie'),
        ...appareilExtra,
        line(
          'Ordo initial / durée',
          prolong ? `${prolong.date_ordo || '—'} · ${prolong.duree} ${prolong.unite}` : ''
        ),
      ].join('')}
    </div>
  </div>
  <div class="print-attention"><strong>Attention</strong><pre>${esc(a.encart_texte || '')}</pre></div>
  <p class="print-note">Joindre copie d’ordonnance.</p>
</section>`;

    const datePh = '<span class="print-date-ph">   /    /       </span>';
    const statutCell = '<td class="col-statut">□</td>';
    const emptySuiviRow = `<tr class="print-row-fill"><td class="col-date">${datePh}</td><td class="col-lib">&nbsp;</td>${statutCell}</tr>`;
    const eventRows = buildSuiviEventRows(dossier);
    const suiviFilled = eventRows
      .map((s) => {
        const dateCell = s.date ? esc(s.date) : datePh;
        return `<tr><td class="col-date">${dateCell}</td><td class="col-lib">${esc(s.libelle || '')}</td>${statutCell}</tr>`;
      })
      .join('');
    const padCount = Math.max(0, 18 - eventRows.length);
    const suiviRows = suiviFilled + emptySuiviRow.repeat(padCount);
    const suiviBlock = `<section class="print-zone print-suivi"><h2>Suivi matériel</h2>
      <table class="print-table print-table-suivi"><thead><tr>
        <th class="col-date">Date</th>
        <th class="col-lib">prolongation / rendu d'appareil / changement d'appareil ?</th>
        <th class="col-statut">Statut</th>
      </tr></thead><tbody>${suiviRows}</tbody></table>
    </section>`;

    function clotureHand(label, dateVal, parVal) {
      const lePart = dateVal ? esc(dateVal) : '__________';
      const parPart = parVal ? esc(parVal) : '___________';
      return `<div class="print-cloture-line">${esc(label)} le ${lePart} par ${parPart}</div>`;
    }
    const clotureBlock = `<section class="print-zone print-cloture"><h2>Clôture</h2>${[
      clotureHand('Appareil rendu', null, null),
      clotureHand(
        'Caution rendue',
        dossier.caution_rendue && dossier.caution_rendue_le ? dossier.caution_rendue_le : null,
        dossier.caution_rendue_op || null
      ),
      clotureHand(
        'Dossier clôturé',
        dossier.statut === 'cloture' && dossier.date_cloture ? dossier.date_cloture : null,
        dossier.cloture_op || null
      ),
    ].join('')}</section>`;

    return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Fiche location</title>
<style>
  html,body{height:100%}
  body{font-family:Georgia,serif;color:#111;margin:8px;font-size:10.5px;line-height:1.25;display:flex;flex-direction:column;min-height:100vh;box-sizing:border-box}
  h1{font-size:14px;margin:0 0 2px;flex-shrink:0}
  .print-meta{color:#555;margin:0 0 6px;font-size:9px;flex-shrink:0}
  .print-zone{border:1px solid #222;padding:5px 7px;margin-bottom:6px}
  .print-top{flex-shrink:0;page-break-inside:avoid}
  .print-zone h2,.print-col h2{margin:0 0 3px;font-size:10px;text-transform:uppercase;letter-spacing:.04em}
  .print-banner{display:flex;flex-wrap:wrap;gap:4px 14px;margin-bottom:5px;padding-bottom:4px;border-bottom:1px solid #222;font-size:10.5px}
  .print-cols{display:grid;grid-template-columns:1fr 1fr;gap:6px 10px;margin-bottom:4px}
  .print-line{display:flex;gap:6px;border-bottom:1px dotted #bbb;padding:1px 0;min-height:14px}
  .print-label{width:118px;flex-shrink:0;color:#444}
  .print-val{flex:1}
  .print-attention{margin-top:4px;border:1.5px solid #c00;padding:4px 6px;min-height:28px;color:#900}
  .print-attention strong{color:#c00}
  .print-attention pre{margin:2px 0 0;white-space:pre-wrap;font:inherit;color:#111}
  .print-note{font-style:italic;margin:3px 0 0;color:#333;font-size:9.5px}
  .print-blank{border-bottom:1px solid #ddd;height:16px;margin:2px 0}
  .print-suivi{flex:1 1 auto;display:flex;flex-direction:column;min-height:0;page-break-inside:auto}
  .print-suivi .print-table-suivi{flex:1 1 auto;width:100%;height:100%}
  .print-table{width:100%;border-collapse:collapse;font-size:10px}
  .print-table th,.print-table td{border:1px solid #999;padding:4px 4px;text-align:left;vertical-align:middle}
  .print-table-suivi th,.print-table-suivi td{height:22px;padding:5px 4px}
  .print-table-suivi tbody tr.print-row-fill td{height:26px}
  .print-table th{background:#f3f3f3;font-size:9px}
  .print-table .col-date{width:4.2em;max-width:4.8em;white-space:pre;font-variant-numeric:tabular-nums}
  .print-table .col-statut{width:2.6em;text-align:center;font-size:12px}
  .print-table .col-lib{width:auto}
  .print-date-ph{white-space:pre;letter-spacing:.02em;color:#666}
  .print-cloture{flex-shrink:0;margin-top:auto;page-break-inside:avoid}
  .print-cloture-line{padding:6px 0;min-height:22px;line-height:1.7;border-bottom:1px dotted #bbb}
  .print-cloture-line:last-child{border-bottom:none}
  @media print{
    body{margin:5mm;min-height:100vh}
    .print-suivi{flex:1 1 auto}
  }
</style></head><body>
  <h1>Fiche location — Phie Evreux</h1>
  <p class="print-meta">Imprimé le ${esc(new Date().toLocaleString('fr-FR'))}</p>
  ${headerBlock}${suiviBlock}${clotureBlock}
</body></html>`;
  }

  function printFiche(dossier) {
    if (!dossier) {
      alert('Aucune fiche à imprimer.');
      return;
    }
    printHtml(buildFicheHtml(dossier));
  }

  function printTableau(dossiers) {
    const rows = (dossiers || [])
      .map((d) => {
        const p = d.patient || {};
        const a = d.appareil_actif || {};
        return `<tr>
          <td>${esc(p.nom)}</td><td>${esc(p.prenom)}</td>
          <td>${esc(R().typeLabel(a.type_appareil))}</td>
          <td>${esc(d.date_debut)}</td><td>${esc(d.date_fin)}</td>
          <td>${esc(d.statut)}</td><td>${esc(d.code_op)}</td>
          <td>${esc(d.qui_facture)}</td>
        </tr>`;
      })
      .join('');
    printHtml(`<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Tableau locations</title>
<style>
  body{font-family:system-ui,sans-serif;font-size:11px;margin:12px}
  table{width:100%;border-collapse:collapse}
  th,td{border:1px solid #333;padding:4px 6px;text-align:left}
  th{background:#eee}
</style></head><body>
  <h1>Tableau général — locations</h1>
  <table><thead><tr>
    <th>Nom</th><th>Prénom</th><th>Type</th><th>Début</th><th>Fin</th><th>Statut</th><th>OP</th><th>Facture</th>
  </tr></thead><tbody>${rows}</tbody></table>
</body></html>`);
  }

  function printContactList(items) {
    const rows = (items || [])
      .map((it) => {
        const d = it.dossier || {};
        const p = d.patient || {};
        const tels = (p.telephones || []).join(', ');
        const phase = it.phase === 'appel' ? 'Appel' : 'Commentaire';
        return `<tr>
          <td>${esc(phase)}</td>
          <td>${esc(p.nom)} ${esc(p.prenom)}</td>
          <td>${esc(tels)}</td>
          <td>${esc(R().typeLabel(d.appareil_actif?.type_appareil))}</td>
          <td>${esc(it.motif)}</td>
          <td>${esc(it.commentaire)}</td>
          <td>${esc(d.date_fin)}</td>
        </tr>`;
      })
      .join('');
    printHtml(`<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Patients à contacter</title>
<style>
  body{font-family:system-ui,sans-serif;font-size:11px;margin:12px}
  table{width:100%;border-collapse:collapse}
  th,td{border:1px solid #333;padding:4px 6px;text-align:left;vertical-align:top}
  th{background:#eee}
  .consigne{margin:8px 0 16px;padding:8px;border:1px solid #999}
</style></head><body>
  <h1>Liste patients à contacter</h1>
  <div class="consigne"><strong>Consignes comptoir :</strong> phase Commentaire (compte patient), puis Appel — noter le résultat, prolonger ou organiser le rendu.</div>
  <table><thead><tr>
    <th>Phase</th><th>Patient</th><th>Tél.</th><th>Type</th><th>Motif</th><th>Commentaire / consignes</th><th>Fin</th>
  </tr></thead><tbody>${rows}</tbody></table>
</body></html>`);
  }

  global.LocationPrint = { printFiche, printTableau, printContactList, buildFicheHtml };
})(window);
