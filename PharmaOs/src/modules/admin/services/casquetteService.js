import { supabase } from '../../../shared/supabaseClient.js';
import { logEvent } from '../../../shared/logService.js';

export async function fetchCasquettes({ activeOnly = false } = {}) {
  let q = supabase.from('casquettes').select('*').order('label');
  if (activeOnly) q = q.eq('active', true);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function fetchCasquetteFeatures(casquetteId = null) {
  let q = supabase.from('casquette_features').select('*');
  if (casquetteId) q = q.eq('casquette_id', casquetteId);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function fetchAllProfileCasquettes() {
  const { data, error } = await supabase
    .from('profile_casquettes')
    .select('profile_id, casquette_id');
  if (error) throw error;
  return data || [];
}

/**
 * Grants effectifs pour un user : { grants: [{surface, feature_id}], slugs: string[] }
 */
export async function fetchMyCasquetteGrants(profileId) {
  if (!profileId) return { grants: [], slugs: [] };

  const { data: links, error: linkErr } = await supabase
    .from('profile_casquettes')
    .select('casquette_id')
    .eq('profile_id', profileId);
  if (linkErr) throw linkErr;
  const ids = (links || []).map((l) => l.casquette_id).filter(Boolean);
  if (!ids.length) return { grants: [], slugs: [] };

  const { data: caps, error: capErr } = await supabase
    .from('casquettes')
    .select('id, slug, active')
    .in('id', ids)
    .eq('active', true);
  if (capErr) throw capErr;

  const activeIds = (caps || []).map((c) => c.id);
  const slugs = (caps || []).map((c) => c.slug).filter(Boolean);
  if (!activeIds.length) return { grants: [], slugs: [] };

  const { data: feats, error: featErr } = await supabase
    .from('casquette_features')
    .select('surface, feature_id')
    .in('casquette_id', activeIds);
  if (featErr) throw featErr;

  return { grants: feats || [], slugs };
}

export async function createCasquette({ slug, label, description }, userId) {
  const clean = String(slug || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_');
  if (!clean) throw new Error('Slug invalide');
  const { data, error } = await supabase
    .from('casquettes')
    .insert([{
      slug: clean,
      label: label || clean,
      description: description || null,
      updated_by: userId || null,
    }])
    .select()
    .single();
  if (error) throw error;
  logEvent({
    category: 'access',
    action: 'create_casquette',
    entity: 'casquettes',
    entityId: data.id,
    message: `Casquette créée : ${data.slug}`,
    flush: true,
  });
  return data;
}

export async function updateCasquette(id, patch, userId) {
  const { data, error } = await supabase
    .from('casquettes')
    .update({
      ...patch,
      updated_by: userId || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  logEvent({
    category: 'access',
    action: 'update_casquette',
    entity: 'casquettes',
    entityId: id,
    message: `Casquette mise à jour : ${data.slug || id}`,
    details: { keys: Object.keys(patch || {}) },
    flush: true,
  });
  return data;
}

export async function setCasquetteFeatures(casquetteId, featureRows, userId) {
  const { error: delErr } = await supabase
    .from('casquette_features')
    .delete()
    .eq('casquette_id', casquetteId);
  if (delErr) throw delErr;

  if (featureRows?.length) {
    const { error: insErr } = await supabase.from('casquette_features').insert(
      featureRows.map((r) => ({
        casquette_id: casquetteId,
        surface: r.surface,
        feature_id: r.feature_id,
      })),
    );
    if (insErr) throw insErr;
  }

  await supabase
    .from('casquettes')
    .update({ updated_by: userId || null, updated_at: new Date().toISOString() })
    .eq('id', casquetteId);

  logEvent({
    category: 'access',
    action: 'set_casquette_features',
    entity: 'casquettes',
    entityId: casquetteId,
    message: `Features casquette mises à jour (${featureRows?.length || 0})`,
    flush: true,
  });
}

export async function setProfileCasquettes(profileId, casquetteIds, actorName) {
  const { error: delErr } = await supabase
    .from('profile_casquettes')
    .delete()
    .eq('profile_id', profileId);
  if (delErr) throw delErr;

  if (casquetteIds?.length) {
    const { error: insErr } = await supabase.from('profile_casquettes').insert(
      casquetteIds.map((casquette_id) => ({ profile_id: profileId, casquette_id })),
    );
    if (insErr) throw insErr;
  }

  logEvent({
    category: 'access',
    action: 'set_profile_casquettes',
    entity: 'profile_casquettes',
    entityId: profileId,
    message: `${actorName || 'Admin'} a mis à jour les casquettes`,
    details: { profileId, casquetteIds },
    flush: true,
  });
}
