import { supabase } from '../../../shared/supabaseClient.js';

/**
 * Datamatrix = chaîne complète stockée telle quelle.
 * Parsing optionnel uniquement pour préremplir lot / péremption / CIP si présent.
 */
export function parseDatamatrix(raw) {
  if (!raw) return { datamatrix_raw: null };
  const s = String(raw).replace(/\x1D/g, '').trim();
  const result = {
    datamatrix_raw: raw,
    gtin: null,
    lot: null,
    date_peremption: null,
    numero_unite: null,
    code_produit: null,
  };

  const gtin = s.match(/\(01\)(\d{14})/) || s.match(/01(\d{14})/);
  if (gtin) result.gtin = gtin[1];

  const exp = s.match(/\(17\)(\d{6})/) || s.match(/17(\d{6})/);
  if (exp) {
    const y = `20${exp[1].slice(0, 2)}`;
    const m = exp[1].slice(2, 4);
    const d = exp[1].slice(4, 6);
    result.date_peremption = `${y}-${m}-${d}`;
  }

  const lot = s.match(/\(10\)([^(\x1D]+)/) || s.match(/10([A-Za-z0-9]+)/);
  if (lot) result.lot = lot[1].trim();

  const serial = s.match(/\(21\)([^(\x1D]+)/) || s.match(/21([A-Za-z0-9]+)/);
  if (serial) {
    result.numero_unite = serial[1].trim();
    result.code_produit = result.gtin || serial[1].trim();
  }

  if (!result.code_produit && result.gtin) result.code_produit = result.gtin;
  return result;
}

export async function receivePslUnit(userId, payload) {
  const parsed = payload.datamatrix_raw ? parseDatamatrix(payload.datamatrix_raw) : {};
  const hasDm = !!(payload.datamatrix_raw && String(payload.datamatrix_raw).trim());

  if (!hasDm) {
    if (!payload.lot || !payload.date_peremption || !payload.code_produit || !payload.denomination) {
      throw new Error('Sans datamatrix : renseignez dénomination, code CIP, lot et date de péremption.');
    }
  }

  const row = {
    code_produit: payload.code_produit || parsed.code_produit,
    numero_unite: payload.numero_unite || parsed.numero_unite || payload.lot || `MANUEL-${Date.now()}`,
    denomination: payload.denomination || null,
    date_peremption: payload.date_peremption || parsed.date_peremption || null,
    fournisseur: payload.fournisseur || null,
    lot: payload.lot || parsed.lot || null,
    gtin: parsed.gtin || payload.gtin || null,
    datamatrix_raw: hasDm ? payload.datamatrix_raw : null,
    statut: 'en_stock',
    created_by: userId,
  };

  if (!row.code_produit) throw new Error('Code produit / CIP requis.');

  const { data: unit, error } = await supabase.from('psl_units').insert([row]).select().single();
  if (error) throw new Error(error.message);

  const { error: movErr } = await supabase.from('psl_movements').insert([{
    unit_id: unit.id,
    movement_type: 'reception',
    user_id: userId,
    notes: payload.notes || null,
    datamatrix_raw: row.datamatrix_raw,
    denomination: row.denomination,
    quantite: Number(payload.quantite_reception) || 1,
  }]);
  if (movErr) throw new Error(`Réception unité OK mais mouvement non créé : ${movErr.message}`);

  return unit;
}

export async function deliverPslUnit(userId, unitId, payload) {
  const { data: unit, error } = await supabase
    .from('psl_units')
    .update({ statut: 'delivre', updated_at: new Date().toISOString() })
    .eq('id', unitId)
    .eq('statut', 'en_stock')
    .select()
    .single();
  if (error) throw new Error(error.message);

  const qte = Number(payload.quantite);
  if (!qte || qte < 1 || !Number.isInteger(qte)) {
    throw new Error('Indiquez un nombre entier d\'unités délivrées (≥ 1).');
  }

  const { data: movement, error: movErr } = await supabase.from('psl_movements').insert([{
    unit_id: unitId,
    movement_type: 'delivrance',
    prescripteur_nom: payload.prescripteur_nom || null,
    prescripteur_adresse: payload.prescripteur_adresse || null,
    patient_nom: payload.patient_nom || null,
    patient_prenom: payload.patient_prenom || null,
    patient_adresse: payload.patient_adresse || null,
    patient_dob: payload.patient_dob || null,
    patient_initiales: payload.patient_initiales
      || `${(payload.patient_prenom || '').slice(0, 1)}${(payload.patient_nom || '').slice(0, 1)}`.toUpperCase() || null,
    patient_ipp: payload.patient_ipp || null,
    date_delivrance: payload.date_delivrance || new Date().toISOString().slice(0, 10),
    denomination: payload.denomination || unit.denomination || unit.code_produit,
    quantite: qte,
    etiquette_tracabilite: payload.etiquette_tracabilite || payload.datamatrix_raw || unit.datamatrix_raw || null,
    datamatrix_raw: payload.datamatrix_raw || unit.datamatrix_raw || null,
    user_id: userId,
    notes: payload.notes || null,
  }]).select().single();

  if (movErr) {
    await supabase.from('psl_units').update({ statut: 'en_stock', updated_at: new Date().toISOString() }).eq('id', unitId);
    throw new Error(`Délivrance non enregistrée au registre : ${movErr.message}. Vérifiez que la migration 008 est appliquée.`);
  }

  return { unit, movement };
}

export async function fetchStockUnits() {
  const { data, error } = await supabase
    .from('psl_units')
    .select('*')
    .eq('statut', 'en_stock')
    .order('date_peremption', { ascending: true });
  if (error) throw new Error(error.message);
  return data || [];
}

export async function fetchDeliveryHistory(limit = 50) {
  const { data, error } = await supabase
    .from('psl_movements')
    .select('*, psl_units(code_produit, numero_unite, denomination, lot)')
    .eq('movement_type', 'delivrance')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data || [];
}

export async function fetchPslUnits({ statut } = {}) {
  let q = supabase.from('psl_units').select('*').order('created_at', { ascending: false });
  if (statut) q = q.eq('statut', statut);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data || [];
}

export async function fetchPslMovements(limit = 200) {
  const { data, error } = await supabase
    .from('psl_movements')
    .select('*, psl_units(code_produit, numero_unite, denomination, lot, gtin, datamatrix_raw)')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data || [];
}

export async function fetchMdsDeliveries() {
  const { data, error } = await supabase
    .from('psl_movements')
    .select('*, psl_units(code_produit, numero_unite, denomination, lot, gtin, datamatrix_raw)')
    .eq('movement_type', 'delivrance')
    .order('registry_number', { ascending: true, nullsFirst: false });
  if (error) throw new Error(error.message);
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
