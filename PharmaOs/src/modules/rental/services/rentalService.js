import { supabase } from '../../../shared/supabaseClient.js';

export const ASSET_TYPES = [
  { value: 'lit', label: 'Lit' },
  { value: 'tens', label: 'TENS' },
  { value: 'aerosol', label: 'Aérosol' },
  { value: 'balance_bebe', label: 'Balance bébé' },
  { value: 'tensiometre', label: 'Tensiomètre' },
  { value: 'fauteuil_roulant', label: 'Fauteuil roulant' },
  { value: 'autre', label: 'Autre' },
];

export const SOURCE_TYPES = [
  { value: 'stock_pharma', label: 'Stock pharmacie (perso pharma)' },
  { value: 'stock_presta', label: 'Stock dépôt / prestataire' },
  { value: 'commande', label: 'Commander le produit' },
];

export const STATUT_LABELS = {
  attente_reception: 'En attente réception produit',
  en_cours: 'Location démarrée',
  retourne: 'Retournée',
  demande: 'En attente réception produit', // legacy
};

// —— Comptoir ——

export async function fetchAvailableAssets() {
  const { data, error } = await supabase
    .from('rental_assets')
    .select('*')
    .eq('status', 'disponible')
    .order('asset_type');
  if (error) throw new Error(error.message);
  return data || [];
}

export async function fetchOpenContracts() {
  const { data, error } = await supabase
    .from('rental_contracts')
    .select('*, rental_assets(*)')
    .in('statut', ['attente_reception', 'en_cours', 'demande'])
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
}

export async function fetchPendingReception() {
  const { data, error } = await supabase
    .from('rental_contracts')
    .select('*, rental_assets(*)')
    .in('statut', ['attente_reception', 'demande'])
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
}

/**
 * Nouvelle location — questionnaire complet.
 * stock_pharma / stock_presta → en_cours
 * commande → attente_reception
 */
export async function createLocation(userId, payload) {
  const source = payload.source_type;
  if (!['stock_pharma', 'stock_presta', 'commande'].includes(source)) {
    throw new Error('Choisissez la provenance du matériel.');
  }

  const isOrder = source === 'commande';
  if (!isOrder && !payload.asset_id) {
    throw new Error('Sélectionnez un appareil disponible en stock.');
  }

  const row = {
    asset_id: isOrder ? null : payload.asset_id,
    asset_type_requested: payload.asset_type_requested || null,
    source_type: source,
    patient_nom: payload.patient_nom,
    patient_prenom: payload.patient_prenom,
    patient_dob: payload.patient_dob || null,
    prescription_scanned: !!payload.prescription_scanned,
    prescription_valid_until: payload.prescription_valid_until || null,
    caution_type: payload.caution_type || null,
    caution_montant: payload.caution_montant ?? null,
    coverage_checked: !!payload.coverage_checked,
    numero_serie: payload.numero_serie || null,
    checklist_iso: {},
    statut: isOrder ? 'attente_reception' : 'en_cours',
    date_sortie: isOrder ? null : new Date().toISOString(),
    created_by: userId,
    notes: payload.notes || null,
  };

  let { data: contract, error } = await supabase
    .from('rental_contracts')
    .insert([row])
    .select()
    .single();

  // Compat si migration 009 pas encore appliquée
  if (error && isOrder) {
    const msg = error.message || '';
    if (/statut|check|attente_reception/i.test(msg)) row.statut = 'demande';
    if (/date_sortie|null/i.test(msg)) row.date_sortie = new Date().toISOString();
    if (/source_type|numero_serie|column/i.test(msg)) {
      delete row.source_type;
      delete row.numero_serie;
    }
    ({ data: contract, error } = await supabase.from('rental_contracts').insert([row]).select().single());
  }
  if (error) throw new Error(error.message);

  if (!isOrder && payload.asset_id) {
    const { error: aErr } = await supabase
      .from('rental_assets')
      .update({ status: 'loue', updated_at: new Date().toISOString() })
      .eq('id', payload.asset_id);
    if (aErr) throw new Error(aErr.message);
  }

  await supabase.from('rental_events').insert([{
    contract_id: contract.id,
    event_type: isOrder ? 'note' : 'sortie',
    user_id: userId,
    payload: { source_type: source, phase: isOrder ? 'attente_reception' : 'demarre' },
  }]);

  return contract;
}

/** Démarrer une location en attente de réception produit */
export async function startPendingLocation(userId, contractId, payload) {
  if (!payload.numero_serie?.trim()) {
    throw new Error('Le numéro de série du produit est obligatoire pour démarrer.');
  }

  const updates = {
    statut: 'en_cours',
    date_sortie: new Date().toISOString(),
    numero_serie: payload.numero_serie.trim(),
    updated_at: new Date().toISOString(),
  };

  if (payload.asset_id) {
    updates.asset_id = payload.asset_id;
  }

  const { data: contract, error } = await supabase
    .from('rental_contracts')
    .update(updates)
    .eq('id', contractId)
    .in('statut', ['attente_reception', 'demande'])
    .select()
    .single();
  if (error) throw new Error(error.message);

  if (payload.asset_id) {
    await supabase
      .from('rental_assets')
      .update({ status: 'loue', updated_at: new Date().toISOString() })
      .eq('id', payload.asset_id);
  }

  await supabase.from('rental_events').insert([{
    contract_id: contractId,
    event_type: 'sortie',
    user_id: userId,
    payload: { numero_serie: payload.numero_serie, demarre_apres_reception: true },
  }]);

  return contract;
}

/**
 * Retour matériel.
 * - État mauvais OU ordonnance pas à jour → caution non restituée
 * - stock_pharma → désinfection obligatoire avant remise dispo
 * - stock_presta → retour prestataire
 */
export async function returnRental(userId, contractId, payload) {
  const { data: existing, error: fetchErr } = await supabase
    .from('rental_contracts')
    .select('*, rental_assets(*)')
    .eq('id', contractId)
    .single();
  if (fetchErr) throw new Error(fetchErr.message);

  const etatMauvais = payload.etat === 'mauvais' || payload.etat === 'abime';
  const ordoOk = !!payload.ordonnance_a_jour;
  const facturationOk = !!payload.facturation_validee;

  if (!facturationOk) {
    throw new Error('Validez que la facturation est effectuée avant de clôturer le retour.');
  }

  let cautionRestituee = !!payload.caution_restituee;
  let cautionEncaissee = !!payload.caution_encaissee;

  if (etatMauvais || !ordoOk) {
    cautionRestituee = false;
    if (!cautionEncaissee && !payload.attente_nouvelle_ordo) {
      throw new Error(
        'État mauvais ou ordonnance non à jour : ne restituez pas la caution. '
        + 'Cochez « En attente nouvelle ordonnance » ou « Caution encaissée ».',
      );
    }
  }

  const source = existing.source_type
    || (existing.rental_assets?.origine === 'prestataire' ? 'stock_presta' : 'stock_pharma');

  if (source === 'stock_pharma' && !payload.desinfection_faite) {
    throw new Error('Stock pharmacie : cochez que le matériel a été désinfecté avant remise en stock.');
  }

  if (source === 'stock_presta' && !payload.retour_prestataire) {
    throw new Error('Stock prestataire : confirmez le retour du matériel au prestataire.');
  }

  const { data: contract, error } = await supabase
    .from('rental_contracts')
    .update({
      statut: 'retourne',
      date_retour: new Date().toISOString(),
      caution_restituee: cautionRestituee,
      caution_encaissee: cautionEncaissee,
      retour_etat: payload.etat || null,
      ordonnance_a_jour: ordoOk,
      desinfection_faite: !!payload.desinfection_faite,
      retour_prestataire: !!payload.retour_prestataire,
      prescription_scanned: !!payload.prescription_scanned,
      checklist_iso: {
        etat_retour: payload.etat,
        desinfection: !!payload.desinfection_faite,
        retour_prestataire: !!payload.retour_prestataire,
        facturation_validee: facturationOk,
        attente_nouvelle_ordo: !!payload.attente_nouvelle_ordo,
      },
      notes: payload.notes || existing.notes,
      updated_at: new Date().toISOString(),
    })
    .eq('id', contractId)
    .select()
    .single();
  if (error) throw new Error(error.message);

  if (contract.asset_id) {
    const nextStatus = source === 'stock_pharma'
      ? (payload.desinfection_faite ? 'disponible' : 'maintenance')
      : 'retire';
    await supabase
      .from('rental_assets')
      .update({ status: nextStatus, updated_at: new Date().toISOString() })
      .eq('id', contract.asset_id);
  }

  await supabase.from('rental_events').insert([{
    contract_id: contractId,
    event_type: 'retour',
    user_id: userId,
    payload: {
      etat: payload.etat,
      caution_restituee: cautionRestituee,
      caution_encaissee: cautionEncaissee,
      source,
    },
  }]);

  return contract;
}

// —— Dashboard ——

export async function fetchAssets() {
  const { data, error } = await supabase
    .from('rental_assets')
    .select('*')
    .order('asset_type');
  if (error) throw new Error(error.message);
  return data || [];
}

export async function upsertAsset(payload, id = null) {
  const row = {
    ...payload,
    requires_coverage_check: ['tens', 'aerosol', 'fauteuil_roulant'].includes(payload.asset_type)
      ? true
      : !!payload.requires_coverage_check,
    updated_at: new Date().toISOString(),
  };
  if (id) {
    const { data, error } = await supabase.from('rental_assets').update(row).eq('id', id).select().single();
    if (error) throw new Error(error.message);
    return data;
  }
  const { data, error } = await supabase.from('rental_assets').insert([row]).select().single();
  if (error) throw new Error(error.message);
  return data;
}

export async function fetchContracts({ statut } = {}) {
  let q = supabase
    .from('rental_contracts')
    .select('*, rental_assets(*)')
    .order('created_at', { ascending: false });
  if (statut === 'attente_reception') {
    q = q.in('statut', ['attente_reception', 'demande']);
  } else if (statut) {
    q = q.eq('statut', statut);
  }
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data || [];
}

export async function fetchContractEvents(contractId) {
  const { data, error } = await supabase
    .from('rental_events')
    .select('*')
    .eq('contract_id', contractId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
}

export async function updateContract(id, payload) {
  const row = { ...payload, updated_at: new Date().toISOString() };
  const { data, error } = await supabase.from('rental_contracts').update(row).eq('id', id).select('*, rental_assets(*)').single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateAssetStatus(assetId, status) {
  const { data, error } = await supabase.from('rental_assets').update({ status, updated_at: new Date().toISOString() }).eq('id', assetId).select().single();
  if (error) throw new Error(error.message);
  return data;
}

export async function markBillingWeek(contractId, weekKey, ok = true) {
  const { data: c, error: e1 } = await supabase.from('rental_contracts').select('billing_weeks').eq('id', contractId).single();
  if (e1) throw new Error(e1.message);
  const weeks = Array.isArray(c.billing_weeks) ? [...c.billing_weeks] : [];
  if (!weeks.includes(weekKey)) weeks.push(weekKey);
  return updateContract(contractId, { billing_status: ok ? 'facture' : 'en_attente', billing_weeks: weeks });
}

export async function extendPrescription(contractId, validUntil) {
  return updateContract(contractId, { prescription_valid_until: validUntil });
}

export async function fetchOverdueContracts(days = 30) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const { data, error } = await supabase
    .from('rental_contracts')
    .select('*, rental_assets(*)')
    .eq('statut', 'en_cours')
    .lt('date_sortie', cutoff.toISOString());
  if (error) throw new Error(error.message);
  return data || [];
}
