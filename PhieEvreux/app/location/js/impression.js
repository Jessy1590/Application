/**
 * Impression fiche Location — nouvelle mise en page (encarts).
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
    if (c === 'cheque_150') return 'Chèque 150 €';
    if (c === 'especes') return 'Espèces';
    if (c === 'autre') return 'Autre';
    return c || '—';
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

  function buildFicheHtml(dossier) {
    const p = dossier.patient || {};
    const a = dossier.appareil_actif || {};
    const tels = (p.telephones || []).join(' · ');
    const mails = (p.mails || []).join(' · ');
    const prolong = (dossier.prolongations || [])[0];
    const dateFin = dossier.date_fin || '';

    const patientBlock = zone(
      'Patient & personnel',
      [
        line('Nom', p.nom),
        line('Prénom', p.prenom),
        line('Date de naissance', p.date_naissance),
        line('Adresse', p.adresse),
        line('Téléphone(s)', tels),
        line('Mail(s)', mails),
        line('Code OP', dossier.code_op),
        line('Caution', cautionLabel(dossier.caution)),
        line('Qui facture', dossier.qui_facture),
        line('Date début', dossier.date_debut),
      ].join('')
    );

    const appareilBlock = zone(
      'Appareil',
      [
        line('Type', R().typeLabel(a.type_appareil) + (a.type_libelle ? ` (${a.type_libelle})` : '')),
        line('Source', a.source),
        line('Matricule', a.matricule),
        line('N° pharmacie', a.numero_pharmacie),
        line('Obtention', a.mode_obtention),
        line('Livraison', a.livraison),
        line('Désinfection', a.desinfection ? 'Oui' : 'Non'),
        line('Ordo / durée', prolong ? `${prolong.date_ordo || '—'} · ${prolong.duree} ${prolong.unite}` : ''),
        line('Fin prévue', dateFin),
        `<div class="print-encart"><strong>Encart</strong><pre>${esc(a.encart_texte || '')}</pre></div>`,
        '<p class="print-note">Joindre copie d’ordonnance.</p>',
      ].join('')
    );

    const suiviRows = (dossier.suivi || [])
      .map(
        (s) =>
          `<tr><td>${esc(s.date_ligne || '')}</td><td>${esc(s.libelle || '')}</td><td>${esc(s.details || '')}</td></tr>`
      )
      .join('');
    const suiviBlock = zone(
      'Suivi matériel',
      `<table class="print-table"><thead><tr><th>Date</th><th>Libellé</th><th>Détails</th></tr></thead><tbody>${
        suiviRows || '<tr><td colspan="3">&nbsp;</td></tr><tr><td colspan="3">&nbsp;</td></tr><tr><td colspan="3">&nbsp;</td></tr>'
      }</tbody></table>${blankLines(suiviRows ? 1 : 0)}`
    );

    const clotureBlock = zone(
      'Clôture',
      [
        line('Appareil rendu', dossier.appareil_rendu ? 'Oui' : ''),
        line('Caution rendue', dossier.caution_rendue ? `Oui${dossier.caution_rendue_le ? ' le ' + dossier.caution_rendue_le : ''}` : ''),
        line('OP caution rendue', dossier.caution_rendue_op || ''),
        line('Dossier clôturé', dossier.statut === 'cloture' ? `Oui${dossier.date_cloture ? ' le ' + dossier.date_cloture : ''}` : ''),
        line('OP clôture', dossier.cloture_op || ''),
        blankLines(3),
      ].join('')
    );

    return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Fiche location</title>
<style>
  body{font-family:Georgia,serif;color:#111;margin:16px;font-size:12px}
  h1{font-size:18px;margin:0 0 4px}
  .print-meta{color:#555;margin-bottom:16px}
  .print-zone{border:1px solid #222;padding:10px 12px;margin-bottom:12px;page-break-inside:avoid}
  .print-zone h2{margin:0 0 8px;font-size:13px;text-transform:uppercase;letter-spacing:.06em}
  .print-line{display:flex;gap:8px;border-bottom:1px dotted #ccc;padding:3px 0;min-height:18px}
  .print-label{width:140px;flex-shrink:0;color:#444}
  .print-val{flex:1}
  .print-encart{margin-top:8px;border:1px dashed #666;padding:8px;min-height:48px}
  .print-encart pre{margin:4px 0 0;white-space:pre-wrap;font:inherit}
  .print-note{font-style:italic;margin:8px 0 0;color:#333}
  .print-blank{border-bottom:1px solid #ddd;height:22px;margin:4px 0}
  .print-table{width:100%;border-collapse:collapse}
  .print-table th,.print-table td{border:1px solid #999;padding:4px 6px;text-align:left}
  @media print{body{margin:8mm}}
</style></head><body>
  <h1>Fiche location — Phie Evreux</h1>
  <p class="print-meta">Imprimé le ${esc(new Date().toLocaleString('fr-FR'))}</p>
  ${patientBlock}${appareilBlock}${suiviBlock}${clotureBlock}
</body></html>`;
  }

  function printFiche(dossier) {
    const html = buildFicheHtml(dossier);
    const w = window.open('', '_blank', 'noopener,noreferrer,width=900,height=1000');
    if (!w) {
      alert('Autorisez les pop-ups pour imprimer.');
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => {
      try { w.print(); } catch (_) { /* ignore */ }
    }, 250);
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
    const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Tableau locations</title>
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
</body></html>`;
    const w = window.open('', '_blank', 'noopener,noreferrer,width=1100,height=800');
    if (!w) return alert('Autorisez les pop-ups pour imprimer.');
    w.document.open();
    w.document.write(html);
    w.document.close();
    setTimeout(() => { try { w.print(); } catch (_) {} }, 250);
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
    const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Patients à contacter</title>
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
</body></html>`;
    const w = window.open('', '_blank', 'noopener,noreferrer,width=1100,height=800');
    if (!w) return alert('Autorisez les pop-ups pour imprimer.');
    w.document.open();
    w.document.write(html);
    w.document.close();
    setTimeout(() => { try { w.print(); } catch (_) {} }, 250);
  }

  global.LocationPrint = { printFiche, printTableau, printContactList, buildFicheHtml };
})(window);
