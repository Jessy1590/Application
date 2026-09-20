/**
 * Impression Magistrales — fiche demande ST + feuille de suivi A4.
 * Pattern iframe same-document via printHtmlDocument.
 */
import { printHtmlDocument } from '../../../shared/printHtml.js';
import {
  MAGISTRAL_STATUTS,
  APPEL_RESULTAT_LABELS,
  RECEPTION_CHECKLIST_KEYS,
  maskPatient,
} from './magistralService.js';

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtDate(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
    return d.toLocaleDateString('fr-FR');
  } catch {
    return String(iso).slice(0, 10);
  }
}

function fmtDateTime(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('fr-FR');
  } catch {
    return String(iso);
  }
}

function line(label, value) {
  return `<div class="print-line"><span class="print-label">${esc(label)}</span><span class="print-val">${esc(value ?? '') || '&nbsp;'}</span></div>`;
}

function zone(title, bodyHtml) {
  return `<section class="print-zone"><h2>${esc(title)}</h2>${bodyHtml}</section>`;
}

const PRINT_CSS = `
  @page { size: A4; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: "Segoe UI", system-ui, sans-serif; font-size: 10.5pt; color: #1e293b; margin: 0; }
  h1 { font-size: 14pt; margin: 0 0 4px; color: #86198f; }
  h2 { font-size: 11pt; margin: 0 0 6px; padding-bottom: 2px; border-bottom: 1px solid #e2e8f0; color: #334155; }
  .print-meta { font-size: 9pt; color: #64748b; margin-bottom: 10px; }
  .print-zone { margin-bottom: 10px; page-break-inside: avoid; }
  .print-line { display: flex; gap: 8px; margin: 2px 0; }
  .print-label { flex: 0 0 160px; color: #64748b; font-size: 9pt; }
  .print-val { flex: 1; }
  .formule { white-space: pre-wrap; font-family: ui-monospace, monospace; font-size: 9.5pt;
    background: #f8fafc; border: 1px solid #e2e8f0; padding: 8px; min-height: 48px; }
  .checklist { list-style: none; padding: 0; margin: 0; }
  .checklist li { margin: 2px 0; }
  .ok::before { content: "☑ "; }
  .ko::before { content: "☐ "; }
  .timeline { font-size: 9pt; }
  .timeline div { margin: 1px 0; }
  .label-zone {
    margin-top: 8px;
    border: 2px dashed #a21caf;
    min-height: 130mm;
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #fdf4ff;
    page-break-inside: avoid;
  }
  .label-zone span { color: #a21caf; font-size: 12pt; font-weight: 600; text-align: center; padding: 12px; }
  .blank-lines { margin-top: 8px; }
  .blank-lines .bl { border-bottom: 1px solid #cbd5e1; height: 22px; margin-bottom: 4px; }
  .header-row { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; }
  @media print {
    .no-print { display: none !important; }
  }
`;

function wrapDoc(title, bodyHtml) {
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"/><title>${esc(title)}</title>
<style>${PRINT_CSS}</style></head><body onload="window.print()">
${bodyHtml}
</body></html>`;
}

export function buildFicheDemandeHtml(order, settings) {
  const fd = order.form_data || {};
  const ph = fd.pharmacie || {};
  const dem = fd.demande || {};
  const pat = fd.patient || {};
  const ana = fd.analyse || {};
  const body = `
    <div class="header-row">
      <div>
        <h1>PharmaOS — Demande préparation magistrale</h1>
        <p class="print-meta">À transmettre au sous-traitant · ${esc(fmtDateTime(new Date().toISOString()))}</p>
      </div>
      <div class="print-meta">#${esc(String(order.id || '').slice(0, 8))}</div>
    </div>
    ${zone('Pharmacie donneur d’ordre', [
      line('Nom', ph.nom || settings?.pharmacy_name),
      line('Adresse', ph.adresse || settings?.pharmacy_address),
      line('E-mail', ph.email || settings?.pharmacy_email),
      line('Interlocuteur', ph.interlocuteur || settings?.pharmacy_interlocuteur),
    ].join(''))}
    ${zone('Prestataire', [
      line('Nom', settings?.provider_name),
      line('E-mail', settings?.provider_email),
      line('Autorisation ARS', settings?.provider_ars_auth),
      line('Contrat', settings?.contract_ref),
    ].join(''))}
    ${zone('Demande', [
      line('Nature', dem.nature),
      line('Historique', dem.historique),
      line('Prescripteur', dem.prescripteur),
      line('Date ordonnance', dem.date_ordo),
      line('Voie', dem.voie_admin),
      line('Forme', dem.forme || order.forme),
      line('Quantité', dem.quantite ?? order.quantite),
      line('Posologie', dem.posologie),
      line('Durée', dem.duree),
    ].join('') + `<div class="formule">${esc(dem.formule || order.formule || '')}</div>`)}
    ${zone('Patient (pseudonymisé)', [
      line('Initiales', order.patient_initiales || maskPatient(pat.nom, pat.prenom)),
      line('Date de naissance', pat.dob),
      line('Type', pat.type_prep),
      line('Poids', pat.poids),
      line('Téléphone', order.patient_phone || pat.phone),
      line('E-mail', order.patient_email),
      line('Allergies', pat.allergies),
      line('Déglutition', pat.deglutition),
      line('Grossesse / allaitement', pat.grossesse_allaitement),
    ].join(''))}
    ${zone('Analyse pharmaceutique (Annexe I)', [
      line('Dose / posologie OK', ana.dose_posologie_ok ? 'Oui' : 'Non'),
      line('Contre-indications', ana.contre_indications),
      line('Interactions', ana.interactions),
      line('Justifications', (ana.justifications || []).join(', ')),
      line('Mention Ameli', ana.mention_ameli),
      line('Risque (indic.)', ana.risque_cat ? `Cat. ${ana.risque_cat}` : ''),
      line('Décision', ana.decision),
      line('Commentaires', ana.commentaires),
      line('Validée le', fmtDateTime(order.analyse_validated_at)),
    ].join(''))}
  `;
  return wrapDoc('Demande magistrale', body);
}

export function buildFeuilleSuiviHtml(order, settings) {
  const fd = order.form_data || {};
  const ph = fd.pharmacie || {};
  const dem = fd.demande || {};
  const pat = fd.patient || {};
  const ana = fd.analyse || {};
  const checklist = order.reception_checklist || {};
  const call = order.patient_call || {};
  const hist = Array.isArray(order.status_history) ? order.status_history : [];

  const checklistHtml = `<ul class="checklist">${RECEPTION_CHECKLIST_KEYS.map((k) => {
    const ok = !!checklist[k.key];
    return `<li class="${ok ? 'ok' : 'ko'}">${esc(k.label)}</li>`;
  }).join('')}</ul>`;

  const timelineHtml = hist.length
    ? `<div class="timeline">${hist.map((h) =>
      `<div>${esc(fmtDateTime(h.at))} — <strong>${esc(MAGISTRAL_STATUTS[h.statut] || h.statut)}</strong>${h.note ? ` · ${esc(h.note)}` : ''}</div>`,
    ).join('')}</div>`
    : `<div class="timeline">
        <div>Création : ${esc(fmtDateTime(order.created_at))}</div>
        ${order.email_sent_at ? `<div>E-mail ST : ${esc(fmtDateTime(order.email_sent_at))}</div>` : ''}
        ${order.received_at ? `<div>Réception : ${esc(fmtDateTime(order.received_at))}</div>` : ''}
        ${order.dispensed_at ? `<div>Dispensation : ${esc(fmtDateTime(order.dispensed_at))}</div>` : ''}
        ${order.closed_at ? `<div>Clôture : ${esc(fmtDateTime(order.closed_at))}</div>` : ''}
      </div>`;

  const attempts = Array.isArray(call.attempts) ? call.attempts : [];
  const callHtml = attempts.length
    ? attempts.map((a) =>
      `<div>${esc(fmtDateTime(a.at))} — ${a.did_call ? 'Appel' : 'Pas d’appel'} · ${esc(APPEL_RESULTAT_LABELS[a.resultat] || a.resultat || '—')} · ${esc(a.statut === 'termine' ? 'À dispenser' : 'À rappeler')}${a.note ? ` · ${esc(a.note)}` : ''}</div>`,
    ).join('')
    : '<p>—</p>';

  const body = `
    <div class="header-row">
      <div>
        <h1>PharmaOS — Feuille de suivi magistrale</h1>
        <p class="print-meta">Impression ${esc(fmtDateTime(new Date().toISOString()))} · Statut : ${esc(MAGISTRAL_STATUTS[order.statut] || order.statut)}</p>
      </div>
      <div class="print-meta">Dossier #${esc(String(order.id || '').slice(0, 8))}</div>
    </div>

    ${zone('1. Pharmacie donneur d’ordre', [
      line('Nom', ph.nom || settings?.pharmacy_name),
      line('Adresse', ph.adresse || settings?.pharmacy_address),
      line('E-mail', ph.email || settings?.pharmacy_email),
      line('Interlocuteur', ph.interlocuteur || settings?.pharmacy_interlocuteur),
    ].join(''))}

    ${zone('2. Prestataire sous-traitant', [
      line('Nom', settings?.provider_name),
      line('E-mail', settings?.provider_email),
      line('Autorisation ARS', settings?.provider_ars_auth),
      line('Réf. commande ST', order.provider_ref),
      line('N° ordonnancier ST', order.provider_ordonnancier),
      line('Lot ST', order.provider_lot),
      line('Date fabrication', order.date_fabrication),
      line('Date péremption', order.date_peremption),
    ].join(''))}

    ${zone('3. Patient & prescription', [
      line('Initiales', order.patient_initiales || maskPatient(pat.nom, pat.prenom)),
      line('Date de naissance', pat.dob),
      line('Type', pat.type_prep),
      line('Téléphone', order.patient_phone || pat.phone),
      line('E-mail', order.patient_email),
      line('Prescripteur', dem.prescripteur),
      line('Date ordo', dem.date_ordo),
      line('Voie', dem.voie_admin),
      line('Forme', dem.forme || order.forme),
      line('Quantité', dem.quantite ?? order.quantite),
      line('Posologie', dem.posologie),
      line('Durée', dem.duree),
    ].join(''))}

    ${zone('4. Formule', `<div class="formule">${esc(dem.formule || order.formule || '')}</div>`)}

    ${zone('5. Analyse pharmaceutique', [
      line('Dose / posologie OK', ana.dose_posologie_ok ? 'Oui' : 'Non'),
      line('Contre-indications', ana.contre_indications),
      line('Interactions', ana.interactions),
      line('Justifications', (ana.justifications || []).join(', ')),
      line('Mention Ameli', ana.mention_ameli),
      line('Risque', ana.risque_cat ? `Cat. ${ana.risque_cat}` : ''),
      line('Décision', ana.decision),
      line('Commentaires', ana.commentaires),
      line('Validée le', fmtDateTime(order.analyse_validated_at)),
    ].join(''))}

    ${zone('6. Timeline des statuts', timelineHtml)}

    ${zone('7. Contrôle réception (BPP 7.12)', checklistHtml + [
      line('Prix HT net', order.prix_ht_net != null ? `${order.prix_ht_net} €` : ''),
      line('TVA', order.tva_rate != null ? `${order.tva_rate} %` : ''),
      line('Prix TTC calculé', order.prix_calcule != null ? `${order.prix_calcule} €` : ''),
      line('Réception le', fmtDateTime(order.received_at)),
      line('Non-conformité', order.nc_reason),
    ].join(''))}

    ${zone('8. Journal appel(s) patient', callHtml)}

    ${zone('9. Dispensation', [
      line('N° ordonnancier DO', order.ordonnancier_number),
      line('Dispensé le', fmtDateTime(order.dispensed_at)),
      line('Dispensé par', order.dispensed_by ? String(order.dispensed_by).slice(0, 8) : ''),
      line('Conseil', fd.dispensation?.conseil_note),
      line('Clôture', fmtDateTime(order.closed_at)),
      line('Motif clôture', order.closed_reason),
    ].join(''))}

    <section class="print-zone">
      <h2>10. Zone collage étiquette prestataire</h2>
      <div class="label-zone"><span>Coller ici l’étiquette du prestataire</span></div>
    </section>

    <section class="print-zone">
      <h2>11. Notes manuscrites / paraphe pharmacien</h2>
      <div class="blank-lines">
        <div class="bl"></div><div class="bl"></div><div class="bl"></div><div class="bl"></div>
      </div>
    </section>
  `;
  return wrapDoc('Feuille de suivi magistrale', body);
}

export function printFicheDemande(order, settings) {
  return printHtmlDocument(buildFicheDemandeHtml(order, settings));
}

export function printFeuilleSuivi(order, settings) {
  return printHtmlDocument(buildFeuilleSuiviHtml(order, settings));
}

export function printListeDossiers(orders) {
  const rows = (orders || []).map((o) =>
    `<tr>
      <td>${esc(fmtDate(o.created_at))}</td>
      <td>${esc(o.patient_initiales || '—')}</td>
      <td>${esc(MAGISTRAL_STATUTS[o.statut] || o.statut)}</td>
      <td>${esc(o.prix_calcule != null ? `${o.prix_calcule} €` : '—')}</td>
      <td>${esc(String(o.id).slice(0, 8))}</td>
    </tr>`,
  ).join('');
  const html = wrapDoc('Liste magistrales', `
    <h1>PharmaOS — Suivi préparations magistrales</h1>
    <p class="print-meta">${esc(fmtDateTime(new Date().toISOString()))} · ${orders?.length || 0} dossier(s)</p>
    <table style="width:100%;border-collapse:collapse;font-size:9.5pt">
      <thead><tr>
        <th style="text-align:left;border-bottom:1px solid #cbd5e1;padding:4px">Date</th>
        <th style="text-align:left;border-bottom:1px solid #cbd5e1;padding:4px">Patient</th>
        <th style="text-align:left;border-bottom:1px solid #cbd5e1;padding:4px">Statut</th>
        <th style="text-align:left;border-bottom:1px solid #cbd5e1;padding:4px">Prix</th>
        <th style="text-align:left;border-bottom:1px solid #cbd5e1;padding:4px">Id</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `);
  return printHtmlDocument(html);
}
