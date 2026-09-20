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
  const base = 'id, email, display_name, role, job_title, created_at';
  let { data, error } = await supabase
    .schema('portail')
    .from('profiles')
    .select(`${base}, must_change_password`)
    .order('display_name');
  if (error && /must_change_password/i.test(error.message || '')) {
    ({ data, error } = await supabase
      .schema('portail')
      .from('profiles')
      .select(base)
      .order('display_name'));
  }
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

export async function fetchRoleDashboardWidgets() {
  const { data, error } = await supabase.from('role_dashboard_widgets').select('*');
  if (error) throw error;
  return data || [];
}

export async function upsertRoleDashboardWidget(role, widgetId, visible, userId) {
  const canon = canonicalRole(role);
  if (isDisabledRole(canon)) {
    throw new Error('Le rôle Désactivé n’a aucun widget — la matrice ne s’applique pas.');
  }
  const { data, error } = await supabase
    .from('role_dashboard_widgets')
    .upsert(
      {
        role: canon,
        widget_id: widgetId,
        visible: !!visible,
        updated_by: userId || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'role,widget_id' },
    )
    .select()
    .single();
  if (error) throw error;

  logEvent({
    category: 'access',
    action: visible ? 'show_widget' : 'hide_widget',
    entity: 'role_dashboard_widgets',
    entityId: `${canon}:${widgetId}`,
    message: `${visible ? 'Afficher' : 'Masquer'} widget ${widgetId} pour ${canon}`,
    flush: true,
  });

  return data;
}

export async function fetchTaskRoleRules() {
  const { data, error } = await supabase.from('task_role_rules').select('*');
  if (error) throw error;
  return data || [];
}

export async function upsertTaskRoleRule(category, role, mode, delayHours, userId) {
  const canon = canonicalRole(role);
  if (isDisabledRole(canon)) {
    throw new Error('Le rôle Désactivé n’a pas de règle d’assignation.');
  }
  const payload = {
    category,
    role: canon,
    mode: mode || 'never',
    delay_hours: mode === 'after_delay' ? Number(delayHours) || 24 : null,
    updated_by: userId || null,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase
    .from('task_role_rules')
    .upsert(payload, { onConflict: 'category,role' })
    .select()
    .single();
  if (error) throw error;

  logEvent({
    category: 'access',
    action: 'set_task_rule',
    entity: 'task_role_rules',
    entityId: `${category}:${canon}`,
    message: `Règle tâche ${category} / ${canon} → ${mode}`,
    details: payload,
    flush: true,
  });

  return data;
}
