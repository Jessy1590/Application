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
          'Ordo / durée',
          prolong ? `${prolong.date_ordo || '—'} · ${prolong.duree} ${prolong.unite}` : ''
        ),
      ].join('')}
    </div>
  </div>
  <div class="print-attention"><strong>Attention</strong><pre>${esc(a.encart_texte || '')}</pre></div>
  <p class="print-note">Joindre copie d’ordonnance.</p>
</section>`;

    const suiviList = dossier.suivi || [];
    const emptySuiviRow = '<tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>';
    const suiviFilled = suiviList
      .map(
        (s) =>
          `<tr><td>${esc(s.date_ligne || '')}</td><td>${esc(s.libelle || '')}</td><td>${esc(s.details || '')}</td></tr>`
      )
      .join('');
    const padCount = Math.max(0, 10 - suiviList.length);
    const suiviRows = suiviFilled + emptySuiviRow.repeat(padCount);
    const suiviBlock = zone(
      'Suivi matériel',
      `<table class="print-table"><thead><tr><th>Date</th><th>Libellé</th><th>Détails</th></tr></thead><tbody>${suiviRows}</tbody></table>`
    );

    const clotureLines = [
      line('Appareil rendu', dossier.appareil_rendu ? 'Oui' : ''),
      line(
        'Caution rendue',
        dossier.caution_rendue
          ? `Oui${dossier.caution_rendue_le ? ' le ' + dossier.caution_rendue_le : ''}`
          : ''
      ),
    ];
    if (dossier.caution_rendue_op) {
      clotureLines.push(line('OP caution rendue', dossier.caution_rendue_op));
    }
    clotureLines.push(
      line(
        'Dossier clôturé',
        dossier.statut === 'cloture'
          ? `Oui${dossier.date_cloture ? ' le ' + dossier.date_cloture : ''}`
          : ''
      )
    );
    if (dossier.cloture_op) {
      clotureLines.push(line('OP clôture', dossier.cloture_op));
    }
    const clotureBlock = zone('Clôture', clotureLines.join(''));

    return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Fiche location</title>
<style>
  body{font-family:Georgia,serif;color:#111;margin:8px;font-size:10.5px;line-height:1.25}
  h1{font-size:14px;margin:0 0 2px}
  .print-meta{color:#555;margin:0 0 6px;font-size:9px}
  .print-zone{border:1px solid #222;padding:5px 7px;margin-bottom:6px;page-break-inside:avoid}
  .print-zone h2,.print-col h2{margin:0 0 3px;font-size:10px;text-transform:uppercase;letter-spacing:.04em}
  .print-banner{display:flex;flex-wrap:wrap;gap:4px 14px;margin-bottom:5px;padding-bottom:4px;border-bottom:1px solid #222;font-size:10.5px}
  .print-cols{display:grid;grid-template-columns:1fr 1fr;gap:6px 10px;margin-bottom:4px}
  .print-line{display:flex;gap:6px;border-bottom:1px dotted #bbb;padding:1px 0;min-height:14px}
  .print-label{width:108px;flex-shrink:0;color:#444}
  .print-val{flex:1}
  .print-attention{margin-top:4px;border:1.5px solid #c00;padding:4px 6px;min-height:28px;color:#900}
  .print-attention strong{color:#c00}
  .print-attention pre{margin:2px 0 0;white-space:pre-wrap;font:inherit;color:#111}
  .print-note{font-style:italic;margin:3px 0 0;color:#333;font-size:9.5px}
  .print-blank{border-bottom:1px solid #ddd;height:16px;margin:2px 0}
  .print-table{width:100%;border-collapse:collapse;font-size:10px}
  .print-table th,.print-table td{border:1px solid #999;padding:2px 4px;text-align:left;height:16px}
  .print-table th{background:#f3f3f3;font-size:9.5px}
  @media print{body{margin:5mm}}
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
        return `<tr>
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
  <div class="consigne"><strong>Consignes comptoir :</strong> vérifier commentaire prérempli, appeler, noter le résultat, prolonger ou organiser le rendu.</div>
  <table><thead><tr>
    <th>Patient</th><th>Tél.</th><th>Type</th><th>Motif</th><th>Commentaire / consignes</th><th>Fin</th>
  </tr></thead><tbody>${rows}</tbody></table>
</body></html>`);
  }

  global.LocationPrint = { printFiche, printTableau, printContactList, buildFicheHtml };
})(window);
