import React, { useState } from 'react';
import { KeyRound, Mail, UserRound, ShieldCheck } from 'lucide-react';
import {
  changePassword,
  requestEmailChange,
  confirmEmailChangeOtp,
  updateDisplayName,
  validatePassword,
  requestReauthentication,
} from '../services/accountService.js';

const inputCls =
  'w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-sm outline-none focus:ring-1 focus:ring-sky-500';
const labelCls = 'block text-xs font-semibold text-slate-700 mb-1';

function Field({ label, hint, children }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      {children}
      {hint ? <p className="text-[11px] text-slate-500 mt-0.5">{hint}</p> : null}
    </div>
  );
}

function Banner({ kind, children }) {
  if (!children) return null;
  const cls = kind === 'ok'
    ? 'text-sm text-emerald-700 bg-emerald-50 p-2 rounded'
    : 'text-sm text-red-700 bg-red-50 p-2 rounded';
  return <p className={cls}>{children}</p>;
}

/** Formulaire changement de mot de passe (session active). */
export function ChangePasswordForm({
  requireCurrent = true,
  clearTempFlag = false,
  title = 'Mot de passe',
  onSuccess = null,
}) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [nonce, setNonce] = useState('');
  const [needNonce, setNeedNonce] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    setMsg('');
    const weak = validatePassword(password);
    if (weak) {
      setErr(weak);
      return;
    }
    if (password !== confirm) {
      setErr('Les deux mots de passe ne correspondent pas.');
      return;
    }
    setBusy(true);
    try {
      await changePassword({
        newPassword: password,
        currentPassword: requireCurrent ? currentPassword : null,
        nonce: needNonce ? nonce : null,
        clearTempFlag,
      });
      setMsg('Mot de passe mis à jour.');
      setCurrentPassword('');
      setPassword('');
      setConfirm('');
      setNonce('');
      setNeedNonce(false);
      onSuccess?.();
    } catch (ex) {
      const m = ex.message || 'Échec.';
      if (/reauth|nonce|recent/i.test(m) && !needNonce) {
        setNeedNonce(true);
        try {
          await requestReauthentication();
          setErr('Un code de confirmation a été envoyé par e-mail. Saisissez-le ci-dessous.');
        } catch (re) {
          setErr(re.message || m);
        }
      } else {
        setErr(m);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
      <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
        <KeyRound size={16} /> {title}
      </h3>
      <Banner kind="ok">{msg}</Banner>
      <Banner kind="err">{err}</Banner>
      {requireCurrent && (
        <Field label="Mot de passe actuel">
          <input
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className={inputCls}
            required
            placeholder="Mot de passe actuel"
          />
        </Field>
      )}
      <Field label="Nouveau mot de passe" hint="Au moins 8 caractères (règles Auth Supabase du projet).">
        <input
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputCls}
          required
          minLength={8}
          placeholder="Nouveau mot de passe"
        />
      </Field>
      <Field label="Confirmer le nouveau mot de passe">
        <input
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className={inputCls}
          required
          minLength={8}
          placeholder="Confirmation"
        />
      </Field>
      {needNonce && (
        <Field label="Code de vérification (e-mail)" hint="Reçu via le template reauthentication Supabase.">
          <input
            type="text"
            inputMode="numeric"
            value={nonce}
            onChange={(e) => setNonce(e.target.value)}
            className={inputCls}
            required
            placeholder="Code à 6 chiffres"
          />
        </Field>
      )}
      <button
        type="submit"
        disabled={busy}
        className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-sm font-medium"
      >
        {busy ? 'Enregistrement…' : 'Enregistrer le mot de passe'}
      </button>
    </form>
  );
}

/** Changement d’e-mail + confirmation OTP. */
export function ChangeEmailForm({ currentEmail = '', onSuccess = null }) {
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [step, setStep] = useState('request');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const request = async (e) => {
    e.preventDefault();
    setErr('');
    setMsg('');
    setBusy(true);
    try {
      await requestEmailChange(email);
      setStep('confirm');
      setMsg(
        'Un e-mail de confirmation a été envoyé (nouveau et/ou ancien adresse selon la config Auth). Saisissez le code OTP reçu.',
      );
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  };

  const confirm = async (e) => {
    e.preventDefault();
    setErr('');
    setMsg('');
    setBusy(true);
    try {
      await confirmEmailChangeOtp({ email, token });
      setMsg('E-mail mis à jour.');
      setToken('');
      setStep('request');
      onSuccess?.(email);
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={step === 'request' ? request : confirm}
      className="bg-white border border-slate-200 rounded-xl p-4 space-y-3"
    >
      <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
        <Mail size={16} /> Adresse e-mail
      </h3>
      <p className="text-xs text-slate-500">
        Adresse actuelle : <span className="font-medium text-slate-700">{currentEmail || '—'}</span>
      </p>
      <Banner kind="ok">{msg}</Banner>
      <Banner kind="err">{err}</Banner>
      <Field label="Nouvel e-mail">
        <input
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputCls}
          required
          disabled={step === 'confirm'}
          placeholder="nouveau@exemple.fr"
        />
      </Field>
      {step === 'confirm' && (
        <Field
          label="Code de confirmation"
          hint="Code à 6 chiffres du mail « Confirm your new email address » (template email_change)."
        >
          <input
            type="text"
            inputMode="numeric"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            className={inputCls}
            required
            placeholder="Code OTP"
          />
        </Field>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={busy}
          className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-sm font-medium"
        >
          {busy
            ? '…'
            : step === 'request'
              ? 'Demander le changement'
              : 'Confirmer le nouvel e-mail'}
        </button>
        {step === 'confirm' && (
          <button
            type="button"
            onClick={() => { setStep('request'); setToken(''); setMsg(''); setErr(''); }}
            className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm text-slate-600 hover:bg-slate-50"
          >
            Annuler
          </button>
        )}
      </div>
    </form>
  );
}

/** Nom affiché (portail.profiles). */
export function DisplayNameForm({ initialName = '', userId, onSuccess = null }) {
  const [name, setName] = useState(initialName || '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    setMsg('');
    setBusy(true);
    try {
      const row = await updateDisplayName(userId, name);
      setMsg('Nom affiché enregistré.');
      onSuccess?.(row);
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
      <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
        <UserRound size={16} /> Nom affiché
      </h3>
      <Banner kind="ok">{msg}</Banner>
      <Banner kind="err">{err}</Banner>
      <Field label="Nom">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputCls}
          required
          placeholder="Prénom Nom"
        />
      </Field>
      <button
        type="submit"
        disabled={busy}
        className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-sm font-medium"
      >
        {busy ? '…' : 'Enregistrer'}
      </button>
    </form>
  );
}

/** Overlay obligatoire après connexion avec mot de passe temporaire. */
export function ForcePasswordChangeGate({ onDone }) {
  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/80 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-3">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-900">
          <p className="font-semibold flex items-center gap-2 mb-1">
            <ShieldCheck size={16} /> Mot de passe temporaire
          </p>
          <p>
            Votre compte a été créé avec un mot de passe provisoire. Choisissez un mot de passe
            personnel pour continuer.
          </p>
        </div>
        <ChangePasswordForm
          requireCurrent={false}
          clearTempFlag
          title="Définir mon mot de passe"
          onSuccess={onDone}
        />
      </div>
    </div>
  );
}
