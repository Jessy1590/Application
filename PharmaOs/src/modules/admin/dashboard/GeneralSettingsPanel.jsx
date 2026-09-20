import React, { useCallback, useEffect, useState } from 'react';
import { Building2 } from 'lucide-react';
import {
  EMPTY_PHARMACY,
  getPharmacySettingsForEdit,
  savePharmacySettings,
} from '../services/pharmacySettingsService.js';
import StupefiantsLivreursSettings from '../../stupefiants/dashboard/StupefiantsLivreursSettings.jsx';

const inputCls = 'w-full p-2 border rounded-lg bg-white';

const Field = ({ label, children, hint }) => (
  <div>
    <label className="block text-xs font-semibold text-slate-700 mb-1">{label}</label>
    {children}
    {hint && <p className="text-[11px] text-slate-500 mt-0.5">{hint}</p>}
  </div>
);

/** Paramètres → Général : identité pharmacie + livreurs partagés. */
export default function GeneralSettingsPanel() {
  const [form, setForm] = useState({ ...EMPTY_PHARMACY });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    const data = await getPharmacySettingsForEdit();
    setForm(data);
  }, []);

  useEffect(() => {
    setLoading(true);
    load()
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, [load]);

  const save = async (e) => {
    e?.preventDefault?.();
    setErr('');
    setMsg('');
    setSaving(true);
    try {
      await savePharmacySettings(form);
      setMsg('Informations pharmacie enregistrées — utilisées par tous les modules');
      await load();
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-slate-500">Chargement…</p>;
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <p className="text-sm text-slate-500">
        Identité de l’officine et référentiels partagés (livreurs / grossistes…).
      </p>
      {msg && <p className="text-sm text-emerald-700 bg-emerald-50 p-2 rounded">{msg}</p>}
      {err && <p className="text-sm text-red-700 bg-red-50 p-2 rounded">{err}</p>}

      <form onSubmit={save} className="bg-white p-5 rounded-xl border grid md:grid-cols-2 gap-3 text-sm">
        <h2 className="md:col-span-2 font-semibold flex items-center gap-2 text-slate-800">
          <Building2 size={18} /> Pharmacie
        </h2>
        <Field label="Nom">
          <input
            value={form.name || ''}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className={inputCls}
            placeholder="Pharmacie Dupont"
          />
        </Field>
        <Field label="Interlocuteur">
          <input
            value={form.interlocuteur || ''}
            onChange={(e) => setForm({ ...form, interlocuteur: e.target.value })}
            className={inputCls}
            placeholder="Nom du pharmacien"
          />
        </Field>
        <div className="md:col-span-2">
          <Field label="Adresse" hint="Une ligne ou plusieurs">
            <input
              value={form.address || ''}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              className={inputCls}
              placeholder="12 rue de la République, 27000 Évreux"
            />
          </Field>
        </div>
        <Field label="E-mail">
          <input
            type="email"
            value={form.email || ''}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className={inputCls}
            placeholder="contact@pharmacie.fr"
          />
        </Field>
        <Field label="Téléphone">
          <input
            type="tel"
            value={form.phone || ''}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            className={inputCls}
            placeholder="02 00 00 00 00"
          />
        </Field>
        <button
          type="submit"
          disabled={saving}
          className="md:col-span-2 bg-slate-800 text-white py-2 rounded-lg font-semibold disabled:opacity-60"
        >
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </form>

      <StupefiantsLivreursSettings />
    </div>
  );
}
