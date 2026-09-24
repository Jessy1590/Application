/**
 * Auth compte — Portail Application (clé anon uniquement).
 */
(function (global) {
  const MIN_LEN = 8;
  /** Aligné sur les symboles acceptés côté politique mots de passe du projet. */
  const SYMBOL_RE = /[!@#$%^&*()_+\-=[\]{};'\\:"|<>?,./`~]/;

  const PASSWORD_HINT =
    'Au moins 8 caractères, avec une minuscule, une majuscule, un chiffre et un symbole.';

  function validatePassword(password) {
    const p = String(password || '');
    if (p.length < MIN_LEN) {
      return 'Le mot de passe doit contenir au moins 8 caractères.';
    }
    if (!/[a-z]/.test(p)) {
      return 'Ajoutez au moins une lettre minuscule.';
    }
    if (!/[A-Z]/.test(p)) {
      return 'Ajoutez au moins une lettre majuscule.';
    }
    if (!/[0-9]/.test(p)) {
      return 'Ajoutez au moins un chiffre.';
    }
    if (!SYMBOL_RE.test(p)) {
      return 'Ajoutez au moins un symbole (ex. ! @ # $ %).';
    }
    return null;
  }

  function mustChangePassword(user, profile) {
    if (profile?.must_change_password === true) return true;
    if (user?.user_metadata?.must_change_password === true) return true;
    return false;
  }

  async function changePassword(sb, { newPassword, clearTempFlag = false } = {}) {
    const weak = validatePassword(newPassword);
    if (weak) throw new Error(weak);
    const payload = { password: newPassword };
    if (clearTempFlag) payload.data = { must_change_password: false };
    const { data, error } = await sb.auth.updateUser(payload);
    if (error) throw error;
    if (clearTempFlag && data?.user?.id) {
      try {
        await sb.from('profiles').update({ must_change_password: false }).eq('id', data.user.id);
      } catch { /* colonne absente OK */ }
    }
    return data;
  }

  async function requestEmailChange(sb, newEmail) {
    const email = String(newEmail || '').trim().toLowerCase();
    if (!email.includes('@')) throw new Error('E-mail invalide.');
    const { data, error } = await sb.auth.updateUser({ email });
    if (error) throw error;
    return data;
  }

  async function confirmEmailChangeOtp(sb, { email, token }) {
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

  async function requestPasswordReset(sb, email) {
    const addr = String(email || '').trim().toLowerCase();
    if (!addr.includes('@')) throw new Error('E-mail invalide.');
    const { data, error } = await sb.auth.resetPasswordForEmail(addr);
    if (error) throw error;
    return data;
  }

  async function verifyOtpThenSetPassword(sb, { email, token, type, newPassword }) {
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
      } catch { /* ignore */ }
    }
    return data;
  }

  async function updateDisplayName(sb, userId, displayName) {
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
    return data;
  }

  global.PortailAuth = {
    PASSWORD_HINT,
    validatePassword,
    mustChangePassword,
    changePassword,
    requestEmailChange,
    confirmEmailChangeOtp,
    requestPasswordReset,
    verifyOtpThenSetPassword,
    updateDisplayName,
  };
})(window);
