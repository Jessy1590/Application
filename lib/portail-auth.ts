import type { User } from '@supabase/supabase-js';

const MIN_LEN = 8;
const SYMBOL_RE = /[!@#$%^&*()_+\-=[\]{};'\\:"|<>?,./`~]/;

export const PASSWORD_HINT =
  'Au moins 8 caractères, avec une minuscule, une majuscule, un chiffre et un symbole.';

export type PortailProfile = {
  id?: string;
  display_name?: string | null;
  email?: string | null;
  role?: string | null;
  must_change_password?: boolean | null;
};

export function validatePassword(password: string): string | null {
  const p = String(password || '');
  if (p.length < MIN_LEN) return 'Le mot de passe doit contenir au moins 8 caractères.';
  if (!/[a-z]/.test(p)) return 'Ajoutez au moins une lettre minuscule.';
  if (!/[A-Z]/.test(p)) return 'Ajoutez au moins une lettre majuscule.';
  if (!/[0-9]/.test(p)) return 'Ajoutez au moins un chiffre.';
  if (!SYMBOL_RE.test(p)) return 'Ajoutez au moins un symbole (ex. ! @ # $ %).';
  return null;
}

export function mustChangePassword(
  user: User | null | undefined,
  profile: PortailProfile | null | undefined,
): boolean {
  if (profile?.must_change_password === true) return true;
  if (user?.user_metadata?.must_change_password === true) return true;
  return false;
}

/** Client Supabase (schéma portail côté hub). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = { auth: any; from: (table: string) => any };

export async function changePassword(
  sb: Sb,
  { newPassword, clearTempFlag = false }: { newPassword: string; clearTempFlag?: boolean },
) {
  const weak = validatePassword(newPassword);
  if (weak) throw new Error(weak);
  const payload: { password: string; data?: { must_change_password: boolean } } = {
    password: newPassword,
  };
  if (clearTempFlag) payload.data = { must_change_password: false };
  const { data, error } = await sb.auth.updateUser(payload);
  if (error) throw error;
  if (clearTempFlag && data?.user?.id) {
    try {
      await sb.from('profiles').update({ must_change_password: false }).eq('id', data.user.id);
    } catch {
      /* colonne absente OK */
    }
  }
  return data;
}

export async function requestEmailChange(sb: Sb, newEmail: string) {
  const email = String(newEmail || '').trim().toLowerCase();
  if (!email.includes('@')) throw new Error('E-mail invalide.');
  const { data, error } = await sb.auth.updateUser({ email });
  if (error) throw error;
  return data;
}

export async function confirmEmailChangeOtp(
  sb: Sb,
  { email, token }: { email: string; token: string },
) {
  const { data, error } = await sb.auth.verifyOtp({
    email: String(email || '').trim().toLowerCase(),
    token: String(token || '').trim(),
    type: 'email_change',
  });
  if (error) throw error;
  const user = data?.user || data?.session?.user;
  if (user?.id && user?.email) {
    await sb.from('profiles').update({ email: user.email }).eq('id', user.id);
  }
  return data;
}

export async function requestPasswordReset(sb: Sb, email: string) {
  const addr = String(email || '').trim().toLowerCase();
  if (!addr.includes('@')) throw new Error('E-mail invalide.');
  const { data, error } = await sb.auth.resetPasswordForEmail(addr);
  if (error) throw error;
  return data;
}

export async function verifyOtpThenSetPassword(
  sb: Sb,
  {
    email,
    token,
    type,
    newPassword,
  }: {
    email: string;
    token: string;
    type: 'invite' | 'recovery';
    newPassword: string;
  },
) {
  const weak = validatePassword(newPassword);
  if (weak) throw new Error(weak);
  const { error: otpError } = await sb.auth.verifyOtp({
    email: String(email || '').trim().toLowerCase(),
    token: String(token || '').trim(),
    type,
  });
  if (otpError) throw otpError;
  const { data, error } = await sb.auth.updateUser({
    password: newPassword,
    data: { must_change_password: false },
  });
  if (error) throw error;
  if (data?.user?.id) {
    try {
      await sb.from('profiles').update({ must_change_password: false }).eq('id', data.user.id);
    } catch {
      /* ignore */
    }
  }
  return data;
}

export async function updateDisplayName(sb: Sb, userId: string, displayName: string) {
  const name = String(displayName || '').trim();
  if (!name) throw new Error('Le nom affiché est requis.');
  const { data, error } = await sb
    .from('profiles')
    .update({ display_name: name })
    .eq('id', userId)
    .select('id, display_name, email, role, must_change_password')
    .single();
  if (error) throw error;
  await sb.auth.updateUser({ data: { display_name: name } });
  return data as PortailProfile;
}

export function getSupabasePublicEnv() {
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
  };
}
