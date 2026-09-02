import { supabase } from './supabaseClient';

export async function fetchPslUnits({ statut } = {}) {
  let q = supabase.from('psl_units').select('*').order('created_at', { ascending: false });
  if (statut) q = q.eq('statut', statut);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function fetchPslMovements(limit = 200) {
  const { data, error } = await supabase
    .from('psl_movements')
    .select('*, psl_units(code_produit, numero_unite, denomination, lot, gtin, datamatrix_raw)')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

export async function fetchMdsDeliveries() {
  const { data, error } = await supabase
    .from('psl_movements')
    .select('*, psl_units(code_produit, numero_unite, denomination, lot, gtin, datamatrix_raw)')
    .eq('movement_type', 'delivrance')
    .order('registry_number', { ascending: true, nullsFirst: false });
  if (error) throw error;
  return data || [];
}

/** Registre spécial MDS — impression ARS (sans ABO/Rh) */
export function printMdsRegistry(movements, pharmacyName = 'Pharmacie') {
  const deliv = movements.filter((m) => m.movement_type === 'delivrance');
  const rows = deliv.map((m) => `
    <tr>
      <td>${m.registry_number ?? '—'}</td>
      <td>${m.date_delivrance || new Date(m.created_at).toLocaleDateString('fr-FR')}</td>
      <td>${m.prescripteur_nom || ''}<br><small>${m.prescripteur_adresse || ''}</small></td>
      <td>${m.patient_nom || ''} ${m.patient_prenom || ''}<br><small>${m.patient_adresse || ''}</small><br>${m.patient_dob || ''}</td>
      <td>${m.denomination || m.psl_units?.denomination || m.psl_units?.code_produit || ''}<br>
        <small>Lot : ${m.psl_units?.lot || '—'} — N° : ${m.psl_units?.numero_unite || '—'}</small></td>
      <td>${m.quantite ?? 1}</td>
      <td class="mono">${(m.etiquette_tracabilite || m.datamatrix_raw || m.psl_units?.datamatrix_raw || '').slice(0, 120)}</td>
    </tr>
  `).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Registre MDS</title>
    <style>body{font-family:Arial,sans-serif;font-size:11px;margin:20px}h1{font-size:16px}
    table{width:100%;border-collapse:collapse}th,td{border:1px solid #333;padding:4px;vertical-align:top}
    th{background:#f0f0f0}.mono{font-family:monospace;font-size:9px;word-break:break-all}@media print{button{display:none}}</style></head>
    <body><h1>Registre spécial — Médicaments dérivés du sang</h1>
    <p><strong>${pharmacyName}</strong> — Édition ${new Date().toLocaleDateString('fr-FR')}</p>
    <table><thead><tr>
      <th>N° ordre</th><th>Date délivrance</th><th>Prescripteur</th><th>Patient</th>
      <th>Médicament</th><th>Qté (unités entières)</th><th>Traçabilité (datamatrix)</th>
    </tr></thead><tbody>${rows || '<tr><td colspan="7">Aucune délivrance</td></tr>'}</tbody></table>
    <p style="margin-top:24px">Signature titulaire : _________________________</p>
    <button onclick="window.print()">Imprimer</button></body></html>`;

  const w = window.open('', '_blank');
  w.document.write(html);
  w.document.close();
}

export function exportPslRegisterCsv(movements) {
  const header = ['N° ordre', 'Date délivrance', 'Prescripteur', 'Patient', 'Médicament', 'Qté', 'Code', 'N° unité', 'Lot', 'Traçabilité'];
  const rows = movements.filter((m) => m.movement_type === 'delivrance').map((m) => [
    m.registry_number ?? '',
    m.date_delivrance || new Date(m.created_at).toLocaleDateString('fr-FR'),
    m.prescripteur_nom || '',
    `${m.patient_nom || ''} ${m.patient_prenom || ''}`,
    m.denomination || m.psl_units?.denomination || m.psl_units?.code_produit || '',
    m.quantite ?? 1,
    m.psl_units?.code_produit || '',
    m.psl_units?.numero_unite || '',
    m.psl_units?.lot || '',
    (m.etiquette_tracabilite || m.datamatrix_raw || '').replace(/"/g, '""'),
  ]);
  const csv = [header, ...rows].map((r) => r.map((c) => `"${c}"`).join(';')).join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `registre_mds_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
