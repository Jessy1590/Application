import { supabase } from '../../../shared/supabaseClient.js';
import { CANONICAL_ROLES, canonicalRole, isDisabledRole, DISABLED_ROLE } from '../../../core/roles.js';
import { logEvent } from '../../../shared/logService.js';

export async function fetchRoleAccess() {
  const { data, error } = await supabase.from('role_access').select('*');
  if (error) throw error;
  return data || [];
}

export async function upsertRoleAccess(role, surface, featureId, allowed, userId) {
  const canon = canonicalRole(role);
  if (isDisabledRole(canon)) {
    throw new Error('Le rôle Désactivé n’a aucun accès — la matrice ne s’applique pas.');
  }
  const { data, error } = await supabase
    .from('role_access')
    .upsert(
      {
        role: canon,
        surface,
        feature_id: featureId,
        allowed: !!allowed,
        updated_by: userId || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'role,surface,feature_id' },
    )
    .select()
    .single();
  if (error) throw error;

  logEvent({
    category: 'access',
    action: allowed ? 'grant' : 'revoke',
    entity: 'role_access',
    entityId: `${canon}:${surface}:${featureId}`,
    message: `${allowed ? 'Autoriser' : 'Retirer'} ${canon} / ${surface} / ${featureId}`,
    details: { role: canon, surface, feature_id: featureId, allowed: !!allowed },
    flush: true,
  });

  return data;
}

export async function fetchAllProfiles() {
  const { data, error } = await supabase
    .schema('portail')
    .from('profiles')
    .select('id, email, display_name, role, job_title, created_at')
    .order('display_name');
  if (error) throw error;
  return data || [];
}

export async function updateProfileRole(profileId, role, actorName, { actorId } = {}) {
  if (!CANONICAL_ROLES.includes(role)) throw new Error('Rôle invalide');
  if (role === DISABLED_ROLE && actorId && profileId === actorId) {
    throw new Error('Vous ne pouvez pas désactiver votre propre compte.');
  }
  const { data, error } = await supabase
    .schema('portail')
    .from('profiles')
    .update({ role })
    .eq('id', profileId)
    .select('id, display_name, role')
    .single();
  if (error) throw error;

  logEvent({
    category: 'access',
    action: 'change_role',
    entity: 'portail.profiles',
    entityId: profileId,
    message: `${actorName || 'Admin'} a défini le rôle ${role} pour ${data.display_name}`,
    details: { role, profileId },
    flush: true,
  });

  return data;
}
