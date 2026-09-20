import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * Suppression d’un compte Auth (admin portail uniquement).
 * Doc : https://supabase.com/docs/reference/javascript/auth-admin-deleteuser
 *
 * Sécurité :
 * - JWT requis + rôle portail `admin` | `administrateur`
 * - Impossible de se supprimer soi-même
 * - Ne touche pas aux données métier hors nettoyage minimal portail (reviewed_by)
 * - Si des FK métier bloquent : erreur claire, pas de cascade destructive inventée
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ADMIN_ROLES = new Set(['admin', 'administrateur']);

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function isAdminRole(role) {
  return ADMIN_ROLES.has(String(role || ''));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json(401, { error: 'Non authentifié' });

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      db: { schema: 'portail' },
    });

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();
    if (userError || !user) return json(401, { error: 'Session invalide' });

    const { data: profile } = await userClient
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || !isAdminRole(profile.role)) {
      return json(403, { error: 'Accès réservé aux administrateurs du portail' });
    }

    const body = await req.json();
    const userId = String(body.user_id || body.userId || '').trim();
    if (!userId) return json(400, { error: 'user_id requis' });

    if (userId === user.id) {
      return json(400, { error: 'Vous ne pouvez pas supprimer votre propre compte.' });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Détache les revues d’accès (FK portail sans ON DELETE) — schéma portail uniquement.
    await adminClient
      .schema('portail')
      .from('access_requests')
      .update({ reviewed_by: null })
      .eq('reviewed_by', userId);

    const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId);
    if (deleteError) {
      const msg = deleteError.message || String(deleteError);
      if (/foreign key|violates|restrict|reference/i.test(msg)) {
        return json(409, {
          error:
            'Suppression impossible : des données métier référencent encore ce compte. Retirez d’abord ses accès / données liées, ou contactez le support.',
          detail: msg,
        });
      }
      return json(400, { error: msg });
    }

    return json(200, { ok: true, user_id: userId });
  } catch (err) {
    return json(500, { error: String(err) });
  }
});
