import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ADMIN_ROLES = new Set(['administrateur', 'admin']);
const ALLOWED_ROLES = new Set(['pharmacien', 'administrateur', 'préparateur']);

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function canonicalRole(role) {
  if (!role) return 'préparateur';
  if (role === 'admin') return 'administrateur';
  if (role === 'équipe' || role === 'member' || role === 'gestionnaire') return 'préparateur';
  return role;
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

    const actorRole = canonicalRole(profile?.role);
    if (!profile || !ADMIN_ROLES.has(actorRole)) {
      return json(403, { error: 'Accès réservé aux administrateurs' });
    }

    const body = await req.json();
    const email = String(body.email || '').trim().toLowerCase();
    const display_name = String(body.display_name || '').trim() || email;
    const mode = body.mode === 'invite_email' ? 'invite_email' : 'temp_password';
    const role = canonicalRole(body.role || 'préparateur');
    const password = body.password ? String(body.password) : '';

    if (!email || !email.includes('@')) {
      return json(400, { error: 'email requis' });
    }
    if (!ALLOWED_ROLES.has(role)) {
      return json(400, { error: 'role invalide' });
    }
    if (mode === 'temp_password' && password.length < 8) {
      return json(400, { error: 'password requis (min. 8 caractères)' });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    let userId = null;

    if (mode === 'invite_email') {
      const { data: invited, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
        email,
        {
          data: { display_name, must_change_password: true },
        },
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

    if (userId) {
      const { error: upsertError } = await adminClient
        .schema('portail')
        .from('profiles')
        .upsert({
          id: userId,
          email,
          role,
          display_name,
          must_change_password: true,
        });
      if (upsertError) {
        return json(400, {
          error: `Compte Auth créé mais profil : ${upsertError.message}`,
          user: { id: userId, email },
        });
      }
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
