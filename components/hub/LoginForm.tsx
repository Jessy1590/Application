'use client';

import { FormEvent, useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  PASSWORD_HINT,
  requestPasswordReset,
  verifyOtpThenSetPassword,
} from '@/lib/portail-auth';

type LoginMode = 'login' | 'forgot' | 'recovery' | 'invite';

function LoginFormInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get('next') || '/';

  const [mode, setMode] = useState<LoginMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const h = (typeof window !== 'undefined' ? window.location.hash.replace('#', '') : '') || '';
    if (h === 'mot-de-passe' || h === 'forgot') setMode('forgot');
    else if (h === 'invitation' || h === 'invite') setMode('invite');
  }, []);

  const titles: Record<LoginMode, string> = {
    login: 'Portail',
    forgot: 'Mot de passe oublié',
    recovery: 'Nouveau mot de passe',
    invite: 'Réponse à l’invitation',
  };
  const submitLabels: Record<LoginMode, string> = {
    login: 'Se connecter',
    forgot: 'Envoyer le mail',
    recovery: 'Définir le mot de passe',
    invite: 'Accepter l’invitation',
  };

  function switchMode(m: LoginMode) {
    setMode(m);
    setError(null);
    setInfo(null);
    setPassword('');
    setConfirm('');
    setOtp('');
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    const sb = createClient();
    try {
      if (mode === 'login') {
        const { error: signError } = await sb.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (signError) {
          setError('Identifiants incorrects ou compte inexistant.');
          return;
        }
        router.replace(next.startsWith('/') ? next : '/');
        router.refresh();
        return;
      }

      if (mode === 'forgot') {
        await requestPasswordReset(sb, email);
        setInfo('Si un compte existe, un e-mail a été envoyé. Saisissez le code OTP reçu.');
        setMode('recovery');
        return;
      }

      if (mode === 'recovery' || mode === 'invite') {
        if (password !== confirm) {
          setError('Les deux mots de passe ne correspondent pas.');
          return;
        }
        await verifyOtpThenSetPassword(sb, {
          email,
          token: otp,
          type: mode === 'invite' ? 'invite' : 'recovery',
          newPassword: password,
        });
        setInfo(
          mode === 'invite'
            ? 'Invitation acceptée. Vous êtes connecté.'
            : 'Mot de passe mis à jour. Vous êtes connecté.',
        );
        router.replace('/');
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  const needPassword = mode === 'login' || mode === 'recovery' || mode === 'invite';
  const needOtp = mode === 'recovery' || mode === 'invite';
  const needConfirm = mode === 'recovery' || mode === 'invite';

  return (
    <div className="screen">
      <div className="login-card">
        <p className="eyebrow">Access Console</p>
        <h1>{titles[mode]}</h1>
        <form onSubmit={onSubmit}>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          {needPassword ? (
            <div className="field">
              <div className="field-label-row">
                <label htmlFor="password">
                  {mode === 'recovery' || mode === 'invite' ? 'Nouveau mot de passe' : 'Mot de passe'}
                </label>
                {needConfirm ? (
                  <span className="pwd-tip">
                    <button type="button" aria-label="Exigences du mot de passe">
                      ?
                    </button>
                    <span className="pwd-tip-bubble" role="tooltip">
                      {PASSWORD_HINT}
                    </span>
                  </span>
                ) : null}
              </div>
              <input
                id="password"
                type="password"
                required
                autoComplete={needConfirm ? 'new-password' : 'current-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          ) : null}
          {needOtp ? (
            <div className="field">
              <label htmlFor="otp">Code OTP (e-mail)</label>
              <input
                id="otp"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="6 chiffres"
                required
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
              />
            </div>
          ) : null}
          {needConfirm ? (
            <div className="field">
              <label htmlFor="confirm">Confirmer le mot de passe</label>
              <input
                id="confirm"
                type="password"
                required
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </div>
          ) : null}
          <button type="submit" className="btn full" disabled={loading}>
            {loading ? '…' : submitLabels[mode]}
          </button>
          <p className="auth-error">{error || ''}</p>
          <p className="auth-info">{info || ''}</p>
        </form>
        {mode === 'login' ? (
          <div className="auth-links">
            <button type="button" onClick={() => switchMode('forgot')}>
              Mot de passe oublié ?
            </button>
            <button type="button" onClick={() => switchMode('invite')}>
              J’ai reçu une invitation
            </button>
          </div>
        ) : (
          <div className="auth-links">
            <button type="button" onClick={() => switchMode('login')}>
              Retour à la connexion
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function LoginForm() {
  return (
    <Suspense fallback={<div className="screen">Chargement…</div>}>
      <LoginFormInner />
    </Suspense>
  );
}
