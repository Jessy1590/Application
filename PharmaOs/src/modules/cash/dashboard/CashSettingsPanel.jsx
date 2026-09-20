import React, { useState, useEffect } from 'react';
import { Mail } from 'lucide-react';
import { getAccountantEmail, setAccountantEmail } from '../services/cashService.js';

/** Paramètres caisse — e-mail comptable pour envoi des rapports. */
export default function CashSettingsPanel() {
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAccountantEmail()
      .then(setEmail)
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, []);

  const save = async (e) => {
    e.preventDefault();
    setErr('');
    setMsg('');
    try {
      await setAccountantEmail(email.trim());
      setMsg('E-mail comptable enregistré');
    } catch (ex) {
      setErr(ex.message);
    }
  };

  if (loading) {
    return <p className="text-sm text-slate-500">Chargement…</p>;
  }

  return (
    <div className="space-y-3 max-w-lg">
      <p className="text-sm text-slate-500">
        Destinataire des rapports mensuels de clôture (envoi automatique lorsque le domaine e-mail est vérifié).
      </p>
      {msg && <p className="text-sm text-emerald-700 bg-emerald-50 p-2 rounded">{msg}</p>}
      {err && <p className="text-sm text-red-700 bg-red-50 p-2 rounded">{err}</p>}

      <form onSubmit={save} className="bg-white border rounded-xl p-4 space-y-3 text-sm">
        <label className="block">
          <span className="text-xs font-semibold text-slate-700 flex items-center gap-1.5 mb-1">
            <Mail size={14} /> E-mail du comptable
          </span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="comptable@cabinet.fr"
            className="w-full p-2 border rounded-lg"
          />
        </label>
        <button type="submit" className="px-4 py-2 bg-emerald-600 text-white rounded-lg font-semibold">
          Enregistrer
        </button>
      </form>
    </div>
  );
}
