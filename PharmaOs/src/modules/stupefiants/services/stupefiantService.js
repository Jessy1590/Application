import { supabase } from '../../../shared/supabaseClient.js';
import { resolveAssigneeIds } from '../../tasks/services/taskService.js';

export const STUPEFIANT_STATUS_LABELS = Object.freeze({
  en_attente: 'En attente',
  a_verifier: 'À vérifier (pharmacien)',
  recompter: 'Recomptage',
  ras: 'RAS',
  ras_recompte: 'RAS après recomptage',
  analyse: 'Analyse en cours',
  corrige_compris: 'Stock corrigé (compris)',
  corrige_sans: 'Stock corrigé (sans cause)',
  erreur_reception: 'Erreur de réception',
});

export const LIVREUR_TYPE_LABELS = Object.freeze({
  grossiste: 'Grossiste',
  generiqueur: 'Génériqueur',
  plateforme: 'Plateforme',
});

export const CLOSED_STATUSES = new Set([
  'ras', 'ras_recompte', 'corrige_compris', 'corrige_sans', 'erreur_reception',
]);

function toInt(v, fallback = null) {
  if (v === '' || v == null) return fallback;
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? fallback : n;
}

function stocksEqual(aBoites, aUnites, bBoites, bUnites) {
  return Number(aBoites ?? 0) === Number(bBoites ?? 0)
    && Number(aUnites ?? 0) === Number(bUnites ?? 0);
}

async function enrichWithProfiles(rows) {
  const userIds = [...new Set(
    rows.flatMap((r) => [
      r.created_by,
      r.verified_by,
      r.responsable_erreur_id,
    ].filter(Boolean)),
  )];
  let profilesMap = {};
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .schema('portail')
      .from('profiles')
      .select('id, display_name')
      .in('id', userIds);
    profiles?.forEach((p) => { profilesMap[p.id] = p.display_name; });
  }
  return rows.map((r) => ({
    ...r,
    author_name: profilesMap[r.created_by] || 'Inconnu',
    verifier_name: r.verified_by ? (profilesMap[r.verified_by] || 'Pharmacien') : null,
    responsable_name: r.responsable_erreur_label
      || (r.responsable_erreur_id ? (profilesMap[r.responsable_erreur_id] || '—') : null),
  }));
}

async function completeTask(taskId, commentaire) {
  if (!taskId) return;
  await supabase
    .from('task_assignments')
    .update({
      statut: 'terminee',
      commentaire: commentaire || null,
      completed_at: new Date().toISOString(),
    })
    .eq('task_id', taskId)
    .eq('statut', 'en_cours');
}

async function createCategoryTask(category, titre, details, createdBy) {
  let assignees = await resolveAssigneeIds(category);
  if (!assignees.length) assignees = [createdBy];
  const { data: task, error } = await supabase
    .from('tasks')
    .insert([{ titre, description: JSON.stringify(details), created_by: createdBy }])
    .select()
    .single();
  if (error) throw new Error(error.message);
  const { error: assignError } = await supabase.from('task_assignments').insert(
    assignees.map((uid) => ({ task_id: task.id, user_id: uid, statut: 'en_cours' })),
  );
  if (assignError) throw new Error(assignError.message);
  return task;
}

// —— Livreurs ——

export async function fetchLivreurs({ actifsOnly = false } = {}) {
  let q = supabase
    .from('stupefiant_livreurs')
    .select('*')
    .order('sort_order', { ascending: true });
  if (actifsOnly) q = q.eq('actif', true);
  const { data, error } = await q;
  if (error) throw new Error(error.message || 'Impossible de charger les livreurs.');
  const rows = data || [];
  return [...rows].sort((a, b) => {
    const so = (a.sort_order ?? 0) - (b.sort_order ?? 0);
    if (so !== 0) return so;
    return String(a.label || '').localeCompare(String(b.label || ''), 'fr');
  });
}

export async function createLivreur({ label, type = 'grossiste', sort_order = 0 }) {
  const clean = String(label || '').trim();
  if (!clean) throw new Error('Nom du livreur obligatoire.');
  const allowed = ['grossiste', 'generiqueur', 'plateforme'];
  const t = allowed.includes(type) ? type : 'grossiste';
  const { data, error } = await supabase
    .from('stupefiant_livreurs')
    .insert([{
      label: clean,
      type: t,
      sort_order: toInt(sort_order, 0) ?? 0,
      actif: true,
    }])
    .select()
    .single();
  if (error) throw new Error(error.message || 'Échec ajout livreur (droits ou schéma).');
  return data;
}

export async function updateLivreur(id, patch) {
  const { data, error } = await supabase
    .from('stupefiant_livreurs')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteLivreur(id) {
  const { error } = await supabase.from('stupefiant_livreurs').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// —— Storage BL ——

export async function uploadBlFile(releveId, file) {
  if (!file) throw new Error('Fichier BL manquant.');
  const ext = (file.name || 'file').split('.').pop() || 'bin';
  const path = `${releveId}/bl-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from('stupefiants-bl').upload(path, file, {
    upsert: false,
    contentType: file.type || undefined,
  });
  if (error) throw new Error(error.message);
  return path;
}

export async function getBlSignedUrl(blPath, expiresIn = 3600) {
  if (!blPath) return null;
  const { data, error } = await supabase.storage
    .from('stupefiants-bl')
    .createSignedUrl(blPath, expiresIn);
  if (error) throw new Error(error.message);
  return data?.signedUrl || null;
}

// —— Relevés ——

export async function fetchReleves({ status } = {}) {
  let q = supabase
    .from('stupefiant_releves')
    .select('*, stupefiant_livreurs ( id, label, type )')
    .order('created_at', { ascending: false });
  if (status) q = q.eq('status', status);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return enrichWithProfiles(data || []);
}

export async function fetchMyReleves(userId) {
  const { data, error } = await supabase
    .from('stupefiant_releves')
    .select('*, stupefiant_livreurs ( id, label, type )')
    .eq('created_by', userId)
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) throw new Error(error.message);
  return data || [];
}

export async function fetchReleveById(id) {
  const { data, error } = await supabase
    .from('stupefiant_releves')
    .select('*, stupefiant_livreurs ( id, label, type )')
    .eq('id', id)
    .single();
  if (error) throw new Error(error.message);
  const [enriched] = await enrichWithProfiles([data]);
  return enriched;
}

/**
 * Réception taskbar.
 * @param {{ hold?: boolean }} [opts] — hold=true → statut en_attente (sans tâche, comptage optionnel)
 */
export async function declareReception(userId, payload, blFile, opts = {}) {
  const hold = !!opts.hold;
  const medicament = (payload.medicament || '').trim();
  if (!medicament) throw new Error('Médicament obligatoire.');
  const bl_numero = (payload.bl_numero || '').trim();
  if (!hold && !bl_numero) throw new Error('N° de bon de livraison obligatoire.');
  if (!hold && !blFile) throw new Error('Fichier BL obligatoire (PDF ou photo).');
  const nb = toInt(payload.nb_boites_recues, null);
  if (nb == null || nb < 0) throw new Error('Nombre de boîtes reçues invalide.');
  if (!payload.livreur_id) throw new Error('Livreur obligatoire.');

  const isDu = !!payload.is_du;
  const armoireBoites = toInt(
    payload.armoire_boites ?? payload.stock_visuel_boites,
    null,
  );
  const armoireUnites = toInt(
    payload.armoire_unites ?? payload.stock_visuel_unites,
    null,
  );
  const lgoBoites = toInt(payload.stock_lgo_boites, null);
  const lgoUnites = toInt(payload.stock_lgo_unites, null);

  if (!hold) {
    if ([armoireBoites, armoireUnites, lgoBoites, lgoUnites].some((v) => v == null || v < 0)) {
      throw new Error('Comptage armoire et stock LGO obligatoires (boîtes + unités ≥ 0).');
    }
  }

  const equal = !hold && stocksEqual(armoireBoites, armoireUnites, lgoBoites, lgoUnites);
  const now = new Date().toISOString();
  let status = 'en_attente';
  if (!hold) status = equal ? 'ras' : 'a_verifier';

  const row = {
    medicament,
    cip: (payload.cip || '').trim() || null,
    produit_hors_bdm: !!payload.produit_hors_bdm,
    nb_boites_recues: nb,
    livreur_id: payload.livreur_id,
    is_du: isDu,
    du_patient_label: isDu ? ((payload.du_patient_label || '').trim() || null) : null,
    du_unites_promisees: isDu ? toInt(payload.du_unites_promisees, null) : null,
    armoire_boites: armoireBoites,
    armoire_unites: armoireUnites,
    bl_numero: bl_numero || '',
    created_by: userId,
    status,
    stock_visuel_boites: armoireBoites,
    stock_visuel_unites: armoireUnites,
    stock_lgo_boites: lgoBoites,
    stock_lgo_unites: lgoUnites,
    closed_at: status === 'ras' ? now : null,
  };

  const { data: releve, error } = await supabase
    .from('stupefiant_releves')
    .insert([row])
    .select()
    .single();
  if (error) throw new Error(error.message);

  let bl_path = null;
  if (blFile) {
    try {
      bl_path = await uploadBlFile(releve.id, blFile);
      const { error: upErr } = await supabase
        .from('stupefiant_releves')
        .update({ bl_path })
        .eq('id', releve.id);
      if (upErr) throw new Error(upErr.message);
    } catch (e) {
      await supabase.from('stupefiant_releves').delete().eq('id', releve.id);
      throw e;
    }
  }

  if (hold || equal) {
    const { data: updated, error: linkErr } = await supabase
      .from('stupefiant_releves')
      .update({ bl_path })
      .eq('id', releve.id)
      .select()
      .single();
    if (linkErr) throw new Error(linkErr.message);
    return { releve: updated, task: null, outcome: hold ? 'en_attente' : 'ras' };
  }

  const details = {
    type: 'stupefiant_verification',
    releve_id: releve.id,
    medicament,
    cip: row.cip || '',
    is_du: isDu,
    nb_boites_recues: nb,
    bl_numero,
    stock_visuel_boites: armoireBoites,
    stock_visuel_unites: armoireUnites,
    stock_lgo_boites: lgoBoites,
    stock_lgo_unites: lgoUnites,
    urgent: true,
    date: now.split('T')[0],
    instruction: 'Écart après comptage réceptionnaire — ouvrir le dashboard Stupéfiants → Vérifier (ne pas clôturer ici).',
  };
  const titre = `STUPÉFIANT — vérif ${medicament}${isDu ? ' (dû)' : ''}`;
  const task = await createCategoryTask('stupefiant_verification', titre, details, userId);

  const { data: updated, error: linkErr } = await supabase
    .from('stupefiant_releves')
    .update({ task_id: task.id, bl_path })
    .eq('id', releve.id)
    .select()
    .single();
  if (linkErr) throw new Error(linkErr.message);

  return { releve: updated, task, outcome: 'a_verifier' };
}

/**
 * Finalise un relevé en_attente : comptage armoire + LGO → ras | a_verifier (+ tâche).
 */
export async function finalizeHeldReception(id, payload, userId, blFile = null) {
  const { data: row, error: fetchErr } = await supabase
    .from('stupefiant_releves')
    .select('*')
    .eq('id', id)
    .single();
  if (fetchErr) throw new Error(fetchErr.message);
  if (row.status !== 'en_attente') throw new Error('Ce relevé n’est pas en attente.');

  const bl_numero = String(payload.bl_numero ?? row.bl_numero ?? '').trim();
  if (!bl_numero && !row.bl_path && !blFile) {
    throw new Error('N° BL et fichier BL obligatoires pour finaliser.');
  }

  const armoireBoites = toInt(payload.armoire_boites ?? payload.stock_visuel_boites, null);
  const armoireUnites = toInt(payload.armoire_unites ?? payload.stock_visuel_unites, null);
  const lgoBoites = toInt(payload.stock_lgo_boites, null);
  const lgoUnites = toInt(payload.stock_lgo_unites, null);
  if ([armoireBoites, armoireUnites, lgoBoites, lgoUnites].some((v) => v == null || v < 0)) {
    throw new Error('Comptage armoire et stock LGO obligatoires.');
  }

  let bl_path = row.bl_path;
  if (blFile) bl_path = await uploadBlFile(id, blFile);

  const equal = stocksEqual(armoireBoites, armoireUnites, lgoBoites, lgoUnites);
  const now = new Date().toISOString();

  if (equal) {
    const { data, error } = await supabase.from('stupefiant_releves').update({
      bl_numero: bl_numero || row.bl_numero,
      bl_path,
      armoire_boites: armoireBoites,
      armoire_unites: armoireUnites,
      stock_visuel_boites: armoireBoites,
      stock_visuel_unites: armoireUnites,
      stock_lgo_boites: lgoBoites,
      stock_lgo_unites: lgoUnites,
      status: 'ras',
      closed_at: now,
    }).eq('id', id).select().single();
    if (error) throw new Error(error.message);
    return { releve: data, task: null, outcome: 'ras' };
  }

  const details = {
    type: 'stupefiant_verification',
    releve_id: id,
    medicament: row.medicament,
    cip: row.cip || '',
    is_du: row.is_du,
    nb_boites_recues: row.nb_boites_recues,
    bl_numero: bl_numero || row.bl_numero,
    stock_visuel_boites: armoireBoites,
    stock_visuel_unites: armoireUnites,
    stock_lgo_boites: lgoBoites,
    stock_lgo_unites: lgoUnites,
    urgent: true,
    date: now.split('T')[0],
    instruction: 'Écart après comptage — ouvrir Vérifier (ne pas clôturer la tâche ici).',
  };
  const task = await createCategoryTask(
    'stupefiant_verification',
    `STUPÉFIANT — vérif ${row.medicament}`,
    details,
    userId,
  );

  const { data, error } = await supabase.from('stupefiant_releves').update({
    bl_numero: bl_numero || row.bl_numero,
    bl_path,
    armoire_boites: armoireBoites,
    armoire_unites: armoireUnites,
    stock_visuel_boites: armoireBoites,
    stock_visuel_unites: armoireUnites,
    stock_lgo_boites: lgoBoites,
    stock_lgo_unites: lgoUnites,
    status: 'a_verifier',
    task_id: task.id,
  }).eq('id', id).select().single();
  if (error) throw new Error(error.message);
  return { releve: data, task, outcome: 'a_verifier' };
}

/** Édition complète dashboard. */
export async function updateReleve(id, patch) {
  const allowed = [
    'medicament', 'cip', 'produit_hors_bdm', 'nb_boites_recues', 'livreur_id',
    'is_du', 'du_patient_label', 'du_unites_promisees', 'armoire_boites', 'armoire_unites',
    'bl_numero', 'bl_path', 'status', 'stock_visuel_boites', 'stock_visuel_unites',
    'stock_lgo_boites', 'stock_lgo_unites', 'recompte_boites', 'recompte_unites',
    'commentaire_analyse', 'responsable_erreur_id', 'responsable_erreur_label',
    'stock_corrige_boites', 'stock_corrige_unites', 'notes',
  ];
  const row = {};
  for (const k of allowed) {
    if (Object.prototype.hasOwnProperty.call(patch, k)) row[k] = patch[k];
  }
  const { data, error } = await supabase
    .from('stupefiant_releves')
    .update(row)
    .eq('id', id)
    .select('*, stupefiant_livreurs ( id, label, type )')
    .single();
  if (error) throw new Error(error.message);
  const [enriched] = await enrichWithProfiles([data]);
  return enriched;
}

/**
 * 1er contrôle : stock visuel vs LGO.
 * Égal → ras ; sinon → recompter + tâche.
 */
export async function submitVerification(id, payload, adminUserId) {
  const visuelBoites = toInt(payload.stock_visuel_boites, null);
  const visuelUnites = toInt(payload.stock_visuel_unites, null);
  const lgoBoites = toInt(payload.stock_lgo_boites, null);
  const lgoUnites = toInt(payload.stock_lgo_unites, null);
  if ([visuelBoites, visuelUnites, lgoBoites, lgoUnites].some((v) => v == null || v < 0)) {
    throw new Error('Renseignez stock visuel et stock LGO (boîtes + unités ≥ 0).');
  }

  const { data: row, error: fetchErr } = await supabase
    .from('stupefiant_releves')
    .select('*')
    .eq('id', id)
    .single();
  if (fetchErr) throw new Error(fetchErr.message);
  if (row.status !== 'a_verifier') throw new Error('Ce relevé n’est plus à vérifier.');

  const equal = stocksEqual(visuelBoites, visuelUnites, lgoBoites, lgoUnites);
  const now = new Date().toISOString();

  if (equal) {
    const { data, error } = await supabase.from('stupefiant_releves').update({
      stock_visuel_boites: visuelBoites,
      stock_visuel_unites: visuelUnites,
      stock_lgo_boites: lgoBoites,
      stock_lgo_unites: lgoUnites,
      status: 'ras',
      verified_by: adminUserId,
      verified_at: now,
      closed_at: now,
    }).eq('id', id).select().single();
    if (error) throw new Error(error.message);
    await completeTask(row.task_id, 'RAS — stock visuel = LGO');
    return { releve: data, outcome: 'ras' };
  }

  const task = await createCategoryTask(
    'stupefiant_recompte',
    `STUPÉFIANT — recompte ${row.medicament}`,
    {
      type: 'stupefiant_recompte',
      releve_id: id,
      medicament: row.medicament,
      cip: row.cip || '',
      stock_visuel_boites: visuelBoites,
      stock_visuel_unites: visuelUnites,
      stock_lgo_boites: lgoBoites,
      stock_lgo_unites: lgoUnites,
      urgent: true,
      date: now.split('T')[0],
      instruction: 'Recompter l’armoire (boîtes + unités) et comparer au stock LGO.',
    },
    adminUserId,
  );

  const { data, error } = await supabase.from('stupefiant_releves').update({
    stock_visuel_boites: visuelBoites,
    stock_visuel_unites: visuelUnites,
    stock_lgo_boites: lgoBoites,
    stock_lgo_unites: lgoUnites,
    status: 'recompter',
    verified_by: adminUserId,
    verified_at: now,
    recompte_task_id: task.id,
  }).eq('id', id).select().single();
  if (error) throw new Error(error.message);
  await completeTask(row.task_id, 'Écart détecté — recomptage demandé');
  return { releve: data, outcome: 'recompter', task };
}

/**
 * Contrôle pharmacien (2e compte) après écart réceptionnaire.
 * Accepte status a_verifier (nouveau) ou recompter (legacy).
 */
export async function submitRecount(id, payload, adminUserId) {
  const recompteBoites = toInt(payload.recompte_boites, null);
  const recompteUnites = toInt(payload.recompte_unites, null);
  const lgoBoites = toInt(payload.stock_lgo_boites, null);
  const lgoUnites = toInt(payload.stock_lgo_unites, null);
  if ([recompteBoites, recompteUnites, lgoBoites, lgoUnites].some((v) => v == null || v < 0)) {
    throw new Error('Renseignez le recomptage et le stock LGO (boîtes + unités ≥ 0).');
  }

  const { data: row, error: fetchErr } = await supabase
    .from('stupefiant_releves')
    .select('*')
    .eq('id', id)
    .single();
  if (fetchErr) throw new Error(fetchErr.message);
  if (row.status !== 'a_verifier' && row.status !== 'recompter') {
    throw new Error('Ce relevé n’est pas en attente de vérification pharmacien.');
  }

  const equal = stocksEqual(recompteBoites, recompteUnites, lgoBoites, lgoUnites);
  const now = new Date().toISOString();
  const taskToClose = row.recompte_task_id || row.task_id;

  if (equal) {
    const { data, error } = await supabase.from('stupefiant_releves').update({
      recompte_boites: recompteBoites,
      recompte_unites: recompteUnites,
      stock_lgo_boites: lgoBoites,
      stock_lgo_unites: lgoUnites,
      status: 'ras_recompte',
      verified_by: adminUserId,
      verified_at: now,
      closed_at: now,
    }).eq('id', id).select().single();
    if (error) throw new Error(error.message);
    await completeTask(taskToClose, 'RAS après recomptage pharmacien');
    return { releve: data, outcome: 'ras_recompte' };
  }

  const { data, error } = await supabase.from('stupefiant_releves').update({
    recompte_boites: recompteBoites,
    recompte_unites: recompteUnites,
    stock_lgo_boites: lgoBoites,
    stock_lgo_unites: lgoUnites,
    status: 'analyse',
    verified_by: adminUserId,
    verified_at: now,
  }).eq('id', id).select().single();
  if (error) throw new Error(error.message);
  await completeTask(taskToClose, 'Écart persistant — analyse requise');
  return { releve: data, outcome: 'analyse' };
}

/** Clôture en erreur de réception (permettait l’édition des infos réception). */
export async function closeErreurReception(id, notes, adminUserId) {
  const { data: row, error: fetchErr } = await supabase
    .from('stupefiant_releves')
    .select('*')
    .eq('id', id)
    .single();
  if (fetchErr) throw new Error(fetchErr.message);

  const now = new Date().toISOString();
  const { data, error } = await supabase.from('stupefiant_releves').update({
    status: 'erreur_reception',
    notes: [row.notes, notes].filter(Boolean).join('\n') || null,
    verified_by: adminUserId,
    verified_at: now,
    closed_at: now,
  }).eq('id', id).select().single();
  if (error) throw new Error(error.message);

  await completeTask(row.task_id, `Erreur de réception. ${notes || ''}`);
  await completeTask(row.recompte_task_id, `Erreur de réception. ${notes || ''}`);
  return { releve: data, outcome: 'erreur_reception' };
}

/**
 * Clôture analyse : corrige_compris | corrige_sans.
 */
export async function submitAnalyse(id, payload, adminUserId) {
  const mode = payload.mode; // 'corrige_compris' | 'corrige_sans'
  if (mode !== 'corrige_compris' && mode !== 'corrige_sans') {
    throw new Error('Mode de clôture invalide.');
  }
  const commentaire = (payload.commentaire_analyse || '').trim();
  if (!commentaire) throw new Error('Commentaire d’analyse obligatoire.');

  const { data: row, error: fetchErr } = await supabase
    .from('stupefiant_releves')
    .select('*')
    .eq('id', id)
    .single();
  if (fetchErr) throw new Error(fetchErr.message);
  if (row.status !== 'analyse') throw new Error('Ce relevé n’est pas en analyse.');

  const now = new Date().toISOString();
  const patch = {
    status: mode,
    commentaire_analyse: commentaire,
    verified_by: adminUserId,
    verified_at: now,
    closed_at: now,
    responsable_erreur_id: payload.responsable_erreur_id || null,
    responsable_erreur_label: (payload.responsable_erreur_label || '').trim() || null,
    stock_corrige_boites: toInt(payload.stock_corrige_boites, null),
    stock_corrige_unites: toInt(payload.stock_corrige_unites, null),
  };

  if (mode === 'corrige_compris' && !patch.responsable_erreur_id && !patch.responsable_erreur_label) {
    throw new Error('Indiquez la personne responsable de l’erreur.');
  }

  const { data, error } = await supabase
    .from('stupefiant_releves')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return { releve: data, outcome: mode };
}

export async function deleteReleve(id) {
  const { data: row } = await supabase
    .from('stupefiant_releves')
    .select('bl_path')
    .eq('id', id)
    .maybeSingle();
  if (row?.bl_path) {
    await supabase.storage.from('stupefiants-bl').remove([row.bl_path]);
  }
  const { error } = await supabase.from('stupefiant_releves').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/** Stats widgets : top opérateurs réception + top responsables erreur. */
export async function fetchStupefiantOpsStats(days = 90) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const { data, error } = await supabase
    .from('stupefiant_releves')
    .select('created_by, responsable_erreur_id, responsable_erreur_label, status, created_at')
    .gte('created_at', since.toISOString());
  if (error) throw new Error(error.message);

  const rows = data || [];
  const receptionCounts = {};
  const errorCounts = {};

  for (const r of rows) {
    if (r.created_by) {
      receptionCounts[r.created_by] = (receptionCounts[r.created_by] || 0) + 1;
    }
    if (r.status === 'corrige_compris' || r.status === 'corrige_sans') {
      const key = r.responsable_erreur_id || r.responsable_erreur_label || 'inconnu';
      errorCounts[key] = (errorCounts[key] || 0) + 1;
    }
  }

  const profileIds = [
    ...Object.keys(receptionCounts),
    ...Object.keys(errorCounts).filter((k) => k.length === 36),
  ];
  let profilesMap = {};
  if (profileIds.length) {
    const { data: profiles } = await supabase
      .schema('portail')
      .from('profiles')
      .select('id, display_name')
      .in('id', [...new Set(profileIds)]);
    profiles?.forEach((p) => { profilesMap[p.id] = p.display_name; });
  }

  const receptions = Object.entries(receptionCounts)
    .map(([id, count]) => ({ id, name: profilesMap[id] || 'Inconnu', count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const erreurs = Object.entries(errorCounts)
    .map(([id, count]) => ({
      id,
      name: profilesMap[id] || (id.length === 36 ? 'Inconnu' : id),
      count,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const byStatus = {};
  for (const r of rows) {
    byStatus[r.status] = (byStatus[r.status] || 0) + 1;
  }

  return {
    receptions,
    erreurs,
    byStatus,
    total: rows.length,
    ouverts: rows.filter((r) => !CLOSED_STATUSES.has(r.status)).length,
  };
}

/** Liste profils staff pour select responsable. */
export async function fetchStaffProfiles() {
  const { data, error } = await supabase
    .schema('portail')
    .from('profiles')
    .select('id, display_name, role')
    .order('display_name');
  if (error) throw new Error(error.message);
  return (data || []).filter((p) => {
    const r = (p.role || '').toLowerCase();
    return r !== 'désactivé' && r !== 'desactive';
  });
}
