import { supabase } from '../../../shared/supabaseClient.js';
import { ACCESS_ROLES, canonicalRole } from '../../../core/roles.js';
import { logEvent } from '../../../shared/logService.js';

const MIN_PASSWORD_LENGTH = 8;

function authError(error, fallback = 'Opération impossible.') {
  const msg = error?.message || fallback;
  const err = new Error(msg);
  err.code = error?.code || error?.status || null;
  err.raw = error;
  return err;
}

export function validatePassword(password) {
  const p = String(password || '');
  if (p.length < MIN_PASSWORD_LENGTH) {
    return `Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères.`;
  }
  return null;
}

export function mustChangePasswordFromUser(user, profile = null) {
  if (profile?.must_change_password === true) return true;
  if (user?.user_metadata?.must_change_password === true) return true;
  return false;
}

/** Met à jour le flag profil (RLS update own). */
export async function setMustChangePasswordFlag(userId, value) {
  if (!userId) return;
  const { error } = await supabase
    .schema('portail')
    .from('profiles')
    .update({ must_change_password: !!value })
    .eq('id', userId);
  if (error) throw authError(error);
}

export async function syncProfileEmail(userId, email) {
  if (!userId || !email) return;
  const { error } = await supabase
    .schema('portail')
    .from('profiles')
    .update({ email })
    .eq('id', userId);
  if (error) throw authError(error);
}

export async function updateDisplayName(userId, displayName) {
  const name = String(displayName || '').trim();
  if (!name) throw new Error('Le nom affiché est requis.');
  const { data, error } = await supabase
    .schema('portail')
    .from('profiles')
    .update({ display_name: name })
    .eq('id', userId)
    .select('id, display_name, email, role, must_change_password')
    .single();
  if (error) throw authError(error);
  await supabase.auth.updateUser({ data: { display_name: name } });
  return data;
}

/**
 * Changement de mot de passe (session active).
 * Doc : https://supabase.com/docs/reference/javascript/auth-updateuser
 * + password-security (current_password / nonce si activés côté projet).
 */
export async function changePassword({
  newPassword,
  currentPassword = null,
  nonce = null,
  clearTempFlag = false,
} = {}) {
  const weak = validatePassword(newPassword);
  if (weak) throw new Error(weak);

  const payload = { password: newPassword };
  if (currentPassword) payload.current_password = currentPassword;
  if (nonce) payload.nonce = String(nonce);
  if (clearTempFlag) {
    payload.data = { must_change_password: false };
  }

  const { data, error } = await supabase.auth.updateUser(payload);
  if (error) throw authError(error);

  if (clearTempFlag && data?.user?.id) {
    try {
      await setMustChangePasswordFlag(data.user.id, false);
    } catch {
      /* profil flag optionnel si colonne absente temporairement */
    }
  }

  logEvent({
    category: 'auth',
    action: 'password_change',
    message: clearTempFlag
      ? 'Mot de passe temporaire remplacé'
      : 'Mot de passe modifié',
    flush: true,
  });

  return data;
}

/**
 * Demande de changement d’e-mail — envoie le mail email_change (lien ou OTP).
 * Doc : updateUser({ email }) + template email_change.
 */
export async function requestEmailChange(newEmail) {
  const email = String(newEmail || '').trim().toLowerCase();
  if (!email || !email.includes('@')) throw new Error('E-mail invalide.');

  const { data, error } = await supabase.auth.updateUser({ email });
  if (error) throw authError(error);
  return data;
}

/**
 * Confirme le nouvel e-mail avec le code OTP du mail « Confirm your new email ».
 * Doc : verifyOtp type email_change.
 */
export async function confirmEmailChangeOtp({ email, token }) {
  const { data, error } = await supabase.auth.verifyOtp({
    email: String(email || '').trim().toLowerCase(),
    token: String(token || '').trim(),
    type: 'email_change',
  });
  if (error) throw authError(error);
  const user = data?.user || data?.session?.user;
  if (user?.id && user?.email) {
    await syncProfileEmail(user.id, user.email);
  }
  logEvent({
    category: 'auth',
    action: 'email_change',
    message: 'E-mail confirmé',
    details: { email: user?.email },
    flush: true,
  });
  return data;
}

/**
 * Mot de passe oublié — envoie recovery (OTP ou lien).
 * Doc : resetPasswordForEmail — ne révèle pas si le compte existe.
 */
export async function requestPasswordReset(email) {
  const addr = String(email || '').trim().toLowerCase();
  if (!addr.includes('@')) throw new Error('E-mail invalide.');
  const { data, error } = await supabase.auth.resetPasswordForEmail(addr);
  if (error) throw authError(error);
  return data;
}

/**
 * Après recovery / invite / signup : vérifie OTP puis définit le mot de passe.
 * Types : recovery | invite | signup | email
 */
export async function verifyOtpThenSetPassword({
  email,
  token,
  type,
  newPassword,
} = {}) {
  const weak = validatePassword(newPassword);
  if (weak) throw new Error(weak);

  const { data: otpData, error: otpError } = await supabase.auth.verifyOtp({
    email: String(email || '').trim().toLowerCase(),
    token: String(token || '').trim(),
    type,
  });
  if (otpError) throw authError(otpError);

  const { data, error } = await supabase.auth.updateUser({
    password: newPassword,
    data: { must_change_password: false },
  });
  if (error) throw authError(error);

  if (data?.user?.id) {
    try {
      await setMustChangePasswordFlag(data.user.id, false);
    } catch {
      /* ignore */
    }
  }

  logEvent({
    category: 'auth',
    action: type === 'invite' ? 'invite_accept' : 'password_recovery',
    message: type === 'invite'
      ? 'Invitation acceptée — mot de passe défini'
      : 'Mot de passe réinitialisé',
    flush: true,
  });

  return { otp: otpData, user: data };
}

/**
 * Déclenche reauthenticate() si le projet exige un nonce pour changer le MDP.
 * Doc : password-security → reauthenticate.
 */
export async function requestReauthentication() {
  const { error } = await supabase.auth.reauthenticate();
  if (error) throw authError(error);
}

/**
 * Admin : crée un compte (mdp temporaire) ou envoie une invitation e-mail.
 * Via Edge Function invite-user (service_role serveur).
 */
export async function adminCreateOrInviteUser({
  email,
  password = null,
  display_name = '',
  role = 'préparateur',
  mode = 'temp_password',
} = {}) {
  const canon = canonicalRole(role);
  if (!ACCESS_ROLES.includes(canon)) {
    throw new Error('Rôle invalide pour un nouveau compte.');
  }
  if (mode === 'temp_password') {
    const weak = validatePassword(password);
    if (weak) throw new Error(weak);
  }

  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) throw new Error('Session expirée — reconnectez-vous.');

  const { data, error } = await supabase.functions.invoke('invite-user', {
    body: {
      email: String(email || '').trim().toLowerCase(),
      password: mode === 'temp_password' ? password : undefined,
      display_name: String(display_name || '').trim() || undefined,
      role: canon,
      mode,
    },
  });

  if (error) {
    let detail = error.message || 'Création impossible.';
    try {
      const body = typeof error.context?.json === 'function'
        ? await error.context.json()
        : data;
      if (body?.error) detail = body.error;
    } catch {
      if (data?.error) detail = data.error;
    }
    throw new Error(detail);
  }
  if (data?.error) throw new Error(data.error);

  logEvent({
    category: 'access',
    action: mode === 'invite_email' ? 'invite_user' : 'create_user',
    entity: 'auth.users',
    entityId: data?.user?.id || null,
    message: mode === 'invite_email'
      ? `Invitation envoyée à ${email}`
      : `Compte créé pour ${email} (mot de passe temporaire)`,
    details: { email, role: canon, mode },
    flush: true,
  });

  return data;
}

export async function generateTemporaryPassword(length = 12) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}
