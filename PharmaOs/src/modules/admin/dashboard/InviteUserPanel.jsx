import React, { useState } from 'react';
import { UserPlus, RefreshCw } from 'lucide-react';
import { ACCESS_ROLES, ROLE_LABELS } from '../../../core/roles.js';
import {
  adminCreateOrInviteUser,
  generateTemporaryPassword,
} from '../services/accountService.js';

const inputCls = 'w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-sm';

/**
 * Création compte (mdp temporaire) ou invitation e-mail — Edge Function invite-user.
 */
export default function InviteUserPanel({ onCreated }) {
  const [mode, setMode] = useState('temp_password');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState('préparateur');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [lastTemp, setLastTemp] = useState('');

  const rollPassword = async () => {
    const p = await generateTemporaryPassword(12);
    setPassword(p);
    setLastTemp(p);
  };

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    setMsg('');
    setBusy(true);
    try {
      let pwd = password;
      if (mode === 'temp_password' && !pwd) {
        pwd = await generateTemporaryPassword(12);
        setPassword(pwd);
        setLastTemp(pwd);
      }
      const res = await adminCreateOrInviteUser({
        email,
        password: pwd,
        display_name: displayName,
        role,
        mode,
      });
      if (mode === 'temp_password') {
        setMsg(
          `Compte créé pour ${res?.user?.email || email}. Communiquez le mot de passe temporaire une seule fois, puis demandez un changement à la connexion.`,
        );
        setLastTemp(pwd);
      } else {
        setMsg(
          `Invitation envoyée à ${email}. La personne utilise « J’ai reçu une invitation » sur l’écran de connexion.`,
        );
        setLastTemp('');
      }
      setEmail('');
      setDisplayName('');
      setPassword('');
      onCreated?.(res);
    } catch (ex) {
      setErr(ex.message || 'Échec.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      className="bg-white border border-slate-200 rounded-xl p-4 mb-5 space-y-3"
    >
      <h2 className="font-semibold text-slate-800 text-sm flex items-center gap-2">
        <UserPlus size={16} /> Nouveau compte
      </h2>
      <p className="text-xs text-slate-500">
        Via Edge Function <code className="bg-slate-100 px-1 rounded">invite-user</code>
        {' '}(Auth Admin API). Mot de passe temporaire = connexion immédiate + changement forcé ;
        invitation = mail Auth « Invite user ».
      </p>

      {err && <p className="text-sm text-red-700 bg-red-50 p-2 rounded">{err}</p>}
      {msg && <p className="text-sm text-emerald-700 bg-emerald-50 p-2 rounded">{msg}</p>}
      {lastTemp && mode === 'temp_password' && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 p-2 rounded font-mono break-all">
          Mot de passe temporaire (à transmettre hors bande) : {lastTemp}
        </p>
      )}

      <div className="flex flex-wrap gap-3 text-xs">
        <label className="inline-flex items-center gap-1.5">
          <input
            type="radio"
            name="invite-mode"
            checked={mode === 'temp_password'}
            onChange={() => setMode('temp_password')}
          />
          Mot de passe temporaire
        </label>
        <label className="inline-flex items-center gap-1.5">
          <input
            type="radio"
            name="invite-mode"
            checked={mode === 'invite_email'}
            onChange={() => setMode('invite_email')}
          />
          Invitation par e-mail
        </label>
      </div>

      <div className="grid md:grid-cols-2 gap-3 text-sm">
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">E-mail</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputCls}
            placeholder="collaborateur@exemple.fr"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Nom affiché</label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className={inputCls}
            placeholder="Prénom Nom"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Rôle</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className={inputCls}
          >
            {ACCESS_ROLES.map((r) => (
              <option key={r} value={r}>{ROLE_LABELS[r]}</option>
            ))}
          </select>
        </div>
        {mode === 'temp_password' && (
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Mot de passe temporaire
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`${inputCls} font-mono`}
                placeholder="Généré si vide"
                minLength={8}
                autoComplete="off"
              />
              <button
                type="button"
                title="Générer"
                onClick={rollPassword}
                className="px-2 rounded-lg border border-slate-300 hover:bg-slate-50"
              >
                <RefreshCw size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      <button
        type="submit"
        disabled={busy}
        className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium"
      >
        {busy
          ? '…'
          : mode === 'invite_email'
            ? 'Envoyer l’invitation'
            : 'Créer le compte'}
      </button>
    </form>
  );
}
