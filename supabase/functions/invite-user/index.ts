import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * Création / invitation compte — Portail Application.
 * Le profil est d’abord créé par le trigger portail.handle_new_user ;
 * on met ensuite à jour rôle / display_name / must_change_password.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ACTOR_ADMIN_ROLES = new Set(['admin', 'administrateur']);

const ALLOWED_ROLES = new Set([
  'admin',
  'member',
  'équipe',
  'pharmacien',
  'administrateur',
  'préparateur',
  'gestionnaire',
  'désactivé',
]);

const SYMBOL_RE = /[!@#$%^&*()_+\-=[\]{};'\\:"|<>?,./`~]/;

function isStrongPassword(password) {
  const p = String(password || '');
  return (
    p.length >= 8
    && /[a-z]/.test(p)
    && /[A-Z]/.test(p)
    && /[0-9]/.test(p)
    && SYMBOL_RE.test(p)
  );
}

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
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

    if (!profile || !ACTOR_ADMIN_ROLES.has(profile.role)) {
      return json(403, { error: 'Accès réservé aux administrateurs' });
    }

    const body = await req.json();
    const email = String(body.email || '').trim().toLowerCase();
    const display_name = String(body.display_name || '').trim() || email;
    const mode = body.mode === 'invite_email' ? 'invite_email' : 'temp_password';
    const role = String(body.role || 'member').trim();
    const password = body.password ? String(body.password) : '';

    if (!email || !email.includes('@')) {
      return json(400, { error: 'E-mail requis' });
    }
    if (!ALLOWED_ROLES.has(role)) {
      return json(400, { error: `Rôle invalide: ${role}` });
    }
    if (mode === 'temp_password' && !isStrongPassword(password)) {
      return json(400, {
        error: 'Le mot de passe doit contenir au moins 8 caractères, une minuscule, une majuscule, un chiffre et un symbole.',
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      db: { schema: 'portail' },
    });

    let userId = null;

    if (mode === 'invite_email') {
      const { data: invited, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
        email,
        { data: { display_name, must_change_password: true } },
      );
      if (inviteError) return json(400, { error: inviteError.message });
      userId = invited.user?.id ?? null;
    } else {
      const { data: created, error: createError } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { display_name, must_change_password: true },
      });
      if (createError) return json(400, { error: createError.message });
      userId = created.user?.id ?? null;
    }

    if (!userId) {
      return json(500, { error: 'Compte créé sans identifiant retourné.' });
    }

    // Le trigger handle_new_user a normalement déjà inséré la ligne : UPDATE du rôle.
    const profilePatch = {
      email,
      role,
      display_name,
      must_change_password: true,
    };

    let { data: updatedRows, error: profileError } = await adminClient
      .from('profiles')
      .update(profilePatch)
      .eq('id', userId)
      .select('id');

    if (profileError && /must_change_password/i.test(profileError.message || '')) {
      delete profilePatch.must_change_password;
      ({ data: updatedRows, error: profileError } = await adminClient
        .from('profiles')
        .update(profilePatch)
        .eq('id', userId)
        .select('id'));
    }

    // Filet de sécurité si le trigger n’a pas créé le profil
    if (!profileError && (!updatedRows || updatedRows.length === 0)) {
      ({ error: profileError } = await adminClient
        .from('profiles')
        .upsert({ id: userId, ...profilePatch }));
    }

    if (profileError) {
      return json(400, {
        error: `Compte créé mais profil incomplet : ${profileError.message}`,
        user: { id: userId, email },
      });
    }

    return json(200, {
      user: { id: userId, email },
      mode,
      must_change_password: true,
    });
  } catch (err) {
    return json(500, { error: String(err) });
  }
});
