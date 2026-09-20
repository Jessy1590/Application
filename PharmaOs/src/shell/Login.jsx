import React, { useState } from 'react';
import { useAuth } from '../core/AuthContext.jsx';
import {
  requestPasswordReset,
  verifyOtpThenSetPassword,
  validatePassword,
} from '../modules/admin/services/accountService.js';

const inputCls =
  'px-2 py-1.5 rounded bg-slate-700 text-white text-xs placeholder-slate-400 outline-none focus:ring-1 focus:ring-sky-500';

/**
 * Modes Login :
 * - login : connexion classique
 * - forgot : demande reset (recovery mail)
 * - recovery : OTP recovery + nouveau MDP
 * - invite : OTP invite (réponse d’inscription) + définition MDP
 */
export default function Login() {
  const { signIn, authBlockMessage, reloadProfile } = useAuth();
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const resetMessages = () => {
    setError(null);
    setInfo(null);
  };

  const go = (next) => {
    resetMessages();
    setPassword('');
    setConfirm('');
    setToken('');
    setMode(next);
  };

  const handleLogin = async (event) => {
    event.preventDefault();
    resetMessages();
    setIsSubmitting(true);
    const { error: signInError } = await signIn({ email, password });
    setIsSubmitting(false);
    if (signInError) setError(signInError.message);
  };

  const handleForgotRequest = async (event) => {
    event.preventDefault();
    resetMessages();
    setIsSubmitting(true);
    try {
      await requestPasswordReset(email);
      setInfo(
        'Si un compte existe pour cet e-mail, un message de réinitialisation a été envoyé. Utilisez le code OTP reçu.',
      );
      setMode('recovery');
    } catch (ex) {
      setError(ex.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOtpPassword = async (event, type) => {
    event.preventDefault();
    resetMessages();
    const weak = validatePassword(password);
    if (weak) {
      setError(weak);
      return;
    }
    if (password !== confirm) {
      setError('Les deux mots de passe ne correspondent pas.');
      return;
    }
    setIsSubmitting(true);
    try {
      await verifyOtpThenSetPassword({
        email,
        token,
        type,
        newPassword: password,
      });
      setInfo(
        type === 'invite'
          ? 'Invitation acceptée. Vous êtes connecté.'
          : 'Mot de passe mis à jour. Vous êtes connecté.',
      );
      await reloadProfile?.();
      setMode('login');
      setPassword('');
      setConfirm('');
      setToken('');
    } catch (ex) {
      setError(ex.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const title = {
    login: 'PharmaOS — Connexion',
    forgot: 'Mot de passe oublié',
    recovery: 'Nouveau mot de passe',
    invite: 'Réponse à l’invitation',
  }[mode];

  return (
    <div className="w-full h-full flex items-center justify-center bg-slate-900/95">
      <form
        onSubmit={
          mode === 'login'
            ? handleLogin
            : mode === 'forgot'
              ? handleForgotRequest
              : (e) => handleOtpPassword(e, mode === 'invite' ? 'invite' : 'recovery')
        }
        className="w-80 flex flex-col gap-2 bg-slate-800/90 rounded-lg p-4 shadow-lg"
      >
        <h1 className="text-white text-sm font-semibold mb-1 text-center">{title}</h1>

        {mode === 'forgot' && (
          <p className="text-[11px] text-slate-400 text-center mb-1">
            Un e-mail Auth « Reset password » sera envoyé (lien ou code OTP selon le template projet).
          </p>
        )}
        {mode === 'invite' && (
          <p className="text-[11px] text-slate-400 text-center mb-1">
            Saisissez l’e-mail invité, le code du mail d’invitation, puis votre mot de passe définitif.
          </p>
        )}
        {mode === 'recovery' && (
          <p className="text-[11px] text-slate-400 text-center mb-1">
            Code OTP du mail de réinitialisation + nouveau mot de passe.
          </p>
        )}

        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          autoComplete="username"
          required
          className={inputCls}
        />

        {mode === 'login' && (
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Mot de passe"
            autoComplete="current-password"
            required
            className={inputCls}
          />
        )}

        {(mode === 'recovery' || mode === 'invite') && (
          <>
            <input
              type="text"
              inputMode="numeric"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Code OTP (6 chiffres)"
              required
              className={inputCls}
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Nouveau mot de passe"
              autoComplete="new-password"
              required
              minLength={8}
              className={inputCls}
            />
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Confirmer le mot de passe"
              autoComplete="new-password"
              required
              minLength={8}
              className={inputCls}
            />
          </>
        )}

        {(error || authBlockMessage) && (
          <p className="text-red-400 text-xs text-center">{error || authBlockMessage}</p>
        )}
        {info && <p className="text-emerald-400 text-xs text-center">{info}</p>}

        <button
          type="submit"
          disabled={isSubmitting}
          className="mt-1 px-2 py-1.5 rounded bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-medium transition-colors"
        >
          {isSubmitting
            ? '…'
            : mode === 'login'
              ? 'Se connecter'
              : mode === 'forgot'
                ? 'Envoyer le mail'
                : mode === 'invite'
                  ? 'Accepter l’invitation'
                  : 'Définir le mot de passe'}
        </button>

        <div className="flex flex-col gap-1 mt-1">
          {mode === 'login' && (
            <>
              <button
                type="button"
                onClick={() => go('forgot')}
                className="text-[11px] text-slate-400 hover:text-sky-300"
              >
                Mot de passe oublié ?
              </button>
              <button
                type="button"
                onClick={() => go('invite')}
                className="text-[11px] text-slate-400 hover:text-sky-300"
              >
                J’ai reçu une invitation
              </button>
            </>
          )}
          {mode !== 'login' && (
            <button
              type="button"
              onClick={() => go('login')}
              className="text-[11px] text-slate-400 hover:text-sky-300"
            >
              Retour à la connexion
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
