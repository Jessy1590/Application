import React, { useState, useEffect, useCallback } from 'react';
import { Settings } from 'lucide-react';
import { ensureSettings, updateSettings } from '../services/magistralService.js';

const Field = ({ label, children, hint }) => (
  <div>
    <label className="block text-xs font-semibold text-slate-700 mb-1">{label}</label>
    {children}
    {hint && <p className="text-[11px] text-slate-500 mt-0.5">{hint}</p>}
  </div>
);

function settingsToForm(s) {
  if (!s) return {};
  return {
    ...s,
    provider_forms_text: Array.isArray(s.provider_forms) ? s.provider_forms.join(', ') : '',
    mail_devis: s.mail_templates?.devis || '',
    mail_commande: s.mail_templates?.commande || '',
    mail_nc: s.mail_templates?.non_conforme || '',
    mail_dispo: s.mail_templates?.disponible_patient || '',
    mail_relance: s.mail_templates?.relance || '',
  };
}

/** Formulaire paramètres magistrales (donneur d’ordre, ST, tarif, mails). */
export default function MagistralSettingsPanel() {
  const [settings, setSettings] = useState(null);
  const [setForm, setSetForm] = useState({});
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    const s = await ensureSettings();
    setSettings(s);
    setSetForm(settingsToForm(s));
  }, []);

  useEffect(() => {
    load().catch((e) => setErr(e.message));
  }, [load]);

  const saveParams = async (e) => {
    e.preventDefault();
    setErr('');
    setMsg('');
    try {
      const forms = (setForm.provider_forms_text || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      await updateSettings({
        pharmacy_name: setForm.pharmacy_name,
        pharmacy_address: setForm.pharmacy_address,
        pharmacy_email: setForm.pharmacy_email,
        pharmacy_interlocuteur: setForm.pharmacy_interlocuteur,
        provider_name: setForm.provider_name,
        provider_email: setForm.provider_email,
        provider_ars_auth: setForm.provider_ars_auth,
        contract_ref: setForm.contract_ref,
        contract_valid_until: setForm.contract_valid_until || null,
        provider_forms: forms,
        provider_delai_jours: Number(setForm.provider_delai_jours) || 5,
        frais_port: Number(setForm.frais_port) || 0,
        coefficient: Number(setForm.coefficient) || 1,
        tva_rate: Number(setForm.tva_rate) || 5.5,
        docs_retention_days: Number(setForm.docs_retention_days) || 365,
        mail_templates: {
          devis: setForm.mail_devis || '',
          commande: setForm.mail_commande || '',
          non_conforme: setForm.mail_nc || '',
          disponible_patient: setForm.mail_dispo || '',
          relance: setForm.mail_relance || '',
        },
      }, settings.id);
      setMsg('Paramètres enregistrés');
      await load();
    } catch (ex) {
      setErr(ex.message);
    }
  };

  if (!settings && !err) {
    return <p className="text-sm text-slate-500">Chargement des paramètres…</p>;
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">Donneur d’ordre → sous-traitant unique · BPP §7</p>
      {msg && <p className="text-sm text-emerald-700 bg-emerald-50 p-2 rounded">{msg}</p>}
      {err && <p className="text-sm text-red-700 bg-red-50 p-2 rounded">{err}</p>}

      <form onSubmit={saveParams} className="bg-white p-5 rounded-xl border grid md:grid-cols-2 gap-3 text-sm max-w-4xl">
        <h2 className="md:col-span-2 font-semibold flex items-center gap-2">
          <Settings size={18} /> Pharmacie donneur d’ordre
        </h2>
        <Field label="Nom pharmacie">
          <input value={setForm.pharmacy_name || ''} onChange={(e) => setSetForm({ ...setForm, pharmacy_name: e.target.value })} className="w-full p-2 border rounded-lg" placeholder="Nom" />
        </Field>
        <Field label="Adresse">
          <input value={setForm.pharmacy_address || ''} onChange={(e) => setSetForm({ ...setForm, pharmacy_address: e.target.value })} className="w-full p-2 border rounded-lg" placeholder="Adresse" />
        </Field>
        <Field label="E-mail">
          <input type="email" value={setForm.pharmacy_email || ''} onChange={(e) => setSetForm({ ...setForm, pharmacy_email: e.target.value })} className="w-full p-2 border rounded-lg" placeholder="contact@" />
        </Field>
        <Field label="Interlocuteur">
          <input value={setForm.pharmacy_interlocuteur || ''} onChange={(e) => setSetForm({ ...setForm, pharmacy_interlocuteur: e.target.value })} className="w-full p-2 border rounded-lg" placeholder="Nom" />
        </Field>

        <h2 className="md:col-span-2 font-semibold mt-2">Prestataire sous-traitant</h2>
        <Field label="Nom prestataire">
          <input value={setForm.provider_name || ''} onChange={(e) => setSetForm({ ...setForm, provider_name: e.target.value })} className="w-full p-2 border rounded-lg" placeholder="Officine ST" />
        </Field>
        <Field label="E-mail prestataire">
          <input type="email" value={setForm.provider_email || ''} onChange={(e) => setSetForm({ ...setForm, provider_email: e.target.value })} className="w-full p-2 border rounded-lg" placeholder="st@" />
        </Field>
        <Field label="N° autorisation ARS">
          <input value={setForm.provider_ars_auth || ''} onChange={(e) => setSetForm({ ...setForm, provider_ars_auth: e.target.value })} className="w-full p-2 border rounded-lg" placeholder="Autorisation" />
        </Field>
        <Field label="Réf. contrat">
          <input value={setForm.contract_ref || ''} onChange={(e) => setSetForm({ ...setForm, contract_ref: e.target.value })} className="w-full p-2 border rounded-lg" placeholder="Contrat" />
        </Field>
        <Field label="Contrat valide jusqu’au">
          <input type="date" value={setForm.contract_valid_until || ''} onChange={(e) => setSetForm({ ...setForm, contract_valid_until: e.target.value })} className="w-full p-2 border rounded-lg" />
        </Field>
        <Field label="Délai indicatif (jours)">
          <input type="number" value={setForm.provider_delai_jours ?? 5} onChange={(e) => setSetForm({ ...setForm, provider_delai_jours: e.target.value })} className="w-full p-2 border rounded-lg" />
        </Field>
        <Field label="Formes couvertes" hint="Séparées par des virgules">
          <input value={setForm.provider_forms_text || ''} onChange={(e) => setSetForm({ ...setForm, provider_forms_text: e.target.value })} className="w-full p-2 border rounded-lg" placeholder="gélules, pommades…" />
        </Field>

        <h2 className="md:col-span-2 font-semibold mt-2">Tarif</h2>
        <Field label="Frais de port (€)">
          <input type="number" step="0.01" value={setForm.frais_port ?? ''} onChange={(e) => setSetForm({ ...setForm, frais_port: e.target.value })} className="w-full p-2 border rounded-lg" />
        </Field>
        <Field label="Coefficient">
          <input type="number" step="0.0001" value={setForm.coefficient ?? ''} onChange={(e) => setSetForm({ ...setForm, coefficient: e.target.value })} className="w-full p-2 border rounded-lg" />
        </Field>
        <Field label="TVA défaut (%)">
          <input type="number" step="0.01" value={setForm.tva_rate ?? ''} onChange={(e) => setSetForm({ ...setForm, tva_rate: e.target.value })} className="w-full p-2 border rounded-lg" />
        </Field>
        <Field label="Rétention docs (jours)">
          <input type="number" value={setForm.docs_retention_days ?? 365} onChange={(e) => setSetForm({ ...setForm, docs_retention_days: e.target.value })} className="w-full p-2 border rounded-lg" />
        </Field>

        <h2 className="md:col-span-2 font-semibold mt-2">Objets des e-mails (templates)</h2>
        <Field label="Devis ST">
          <input value={setForm.mail_devis || ''} onChange={(e) => setSetForm({ ...setForm, mail_devis: e.target.value })} className="w-full p-2 border rounded-lg" placeholder="Demande de devis…" />
        </Field>
        <Field label="Commande ST">
          <input value={setForm.mail_commande || ''} onChange={(e) => setSetForm({ ...setForm, mail_commande: e.target.value })} className="w-full p-2 border rounded-lg" placeholder="Commande…" />
        </Field>
        <Field label="Non-conformité">
          <input value={setForm.mail_nc || ''} onChange={(e) => setSetForm({ ...setForm, mail_nc: e.target.value })} className="w-full p-2 border rounded-lg" placeholder="NC…" />
        </Field>
        <Field label="Disponible patient">
          <input value={setForm.mail_dispo || ''} onChange={(e) => setSetForm({ ...setForm, mail_dispo: e.target.value })} className="w-full p-2 border rounded-lg" placeholder="Disponible…" />
        </Field>
        <Field label="Relance">
          <input value={setForm.mail_relance || ''} onChange={(e) => setSetForm({ ...setForm, mail_relance: e.target.value })} className="w-full p-2 border rounded-lg" placeholder="Relance…" />
        </Field>

        <button type="submit" className="md:col-span-2 bg-fuchsia-600 text-white py-2 rounded-lg font-semibold">
          Enregistrer les paramètres
        </button>
      </form>
    </div>
  );
}
