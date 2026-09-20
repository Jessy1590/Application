import React, { useState, useEffect, useCallback } from 'react';
import { Settings, Info } from 'lucide-react';
import {
  ensureSettings,
  updateSettings,
  CREATION_ETAPES,
  CREATION_FIELD_DEFS,
  getCreationChamp,
  normalizeCreationChamps,
  buildDefaultCreationChamps,
} from '../services/magistralService.js';

const Field = ({ label, children, hint }) => (
  <div>
    <label className="block text-xs font-semibold text-slate-700 mb-1">{label}</label>
    {children}
    {hint && <p className="text-[11px] text-slate-500 mt-0.5">{hint}</p>}
  </div>
);

const inputCls = 'w-full p-2 border rounded-lg bg-white';
const TABS = [
  { id: 'general', label: 'Prestataire' },
  { id: 'tarif', label: 'Tarif' },
  { id: 'creation', label: 'Création dossier' },
];

function settingsToForm(s) {
  if (!s) return {};
  const champs = { ...buildDefaultCreationChamps(), ...(s.creation_champs || {}) };
  return {
    ...s,
    provider_forms_text: Array.isArray(s.provider_forms) ? s.provider_forms.join(', ') : '',
    creation_champs: champs,
  };
}

function InfoBanner({ children }) {
  return (
    <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-950">
      <p className="font-semibold flex items-center gap-1.5 text-sky-900 mb-1">
        <Info size={16} /> Information
      </p>
      <div className="text-xs leading-relaxed space-y-1">{children}</div>
    </div>
  );
}

/** Paramètres Magistrales — général / tarif / création (mails → Paramètres → Templates mail). */
export default function MagistralSettingsPanel() {
  const [settings, setSettings] = useState(null);
  const [setForm, setSetForm] = useState({});
  const [tab, setTab] = useState('general');
  const [creationEtape, setCreationEtape] = useState('demande');
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

  const patchChamp = (code, patch) => {
    setSetForm((f) => {
      const prev = f.creation_champs?.[code] || getCreationChamp({ creation_champs: f.creation_champs }, code);
      const next = { ...prev, ...patch };
      if (patch.actif === false) next.obligatoire = false;
      if (patch.obligatoire && next.actif === false) next.actif = true;
      return {
        ...f,
        creation_champs: { ...f.creation_champs, [code]: { actif: next.actif !== false, obligatoire: !!next.obligatoire } },
      };
    });
  };

  const saveParams = async (e) => {
    e?.preventDefault?.();
    setErr('');
    setMsg('');
    try {
      const forms = (setForm.provider_forms_text || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      await updateSettings({
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
        internal_prep_enabled: !!setForm.internal_prep_enabled,
        creation_champs: normalizeCreationChamps(setForm.creation_champs),
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

  const etapeFields = CREATION_FIELD_DEFS.filter((f) => f.etape === creationEtape);

  return (
    <div className="space-y-4 max-w-4xl">
      <p className="text-sm text-slate-500">
        Sous-traitant &amp; création — identité pharmacie dans Paramètres → Général
      </p>
      {msg && <p className="text-sm text-emerald-700 bg-emerald-50 p-2 rounded">{msg}</p>}
      {err && <p className="text-sm text-red-700 bg-red-50 p-2 rounded">{err}</p>}

      <div className="flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${
              tab === t.id ? 'bg-fuchsia-600 text-white border-fuchsia-600' : 'bg-white text-slate-700 hover:border-fuchsia-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'general' && (
        <form onSubmit={saveParams} className="bg-white p-5 rounded-xl border grid md:grid-cols-2 gap-3 text-sm">
          <h2 className="md:col-span-2 font-semibold flex items-center gap-2">
            <Settings size={18} /> Prestataire sous-traitant
          </h2>
          <Field label="Nom prestataire">
            <input value={setForm.provider_name || ''} onChange={(e) => setSetForm({ ...setForm, provider_name: e.target.value })} className={inputCls} />
          </Field>
          <Field label="E-mail prestataire">
            <input type="email" value={setForm.provider_email || ''} onChange={(e) => setSetForm({ ...setForm, provider_email: e.target.value })} className={inputCls} />
          </Field>
          <Field label="N° autorisation ARS">
            <input value={setForm.provider_ars_auth || ''} onChange={(e) => setSetForm({ ...setForm, provider_ars_auth: e.target.value })} className={inputCls} />
          </Field>
          <Field label="Réf. contrat">
            <input value={setForm.contract_ref || ''} onChange={(e) => setSetForm({ ...setForm, contract_ref: e.target.value })} className={inputCls} />
          </Field>
          <Field label="Contrat valide jusqu’au">
            <input type="date" value={setForm.contract_valid_until || ''} onChange={(e) => setSetForm({ ...setForm, contract_valid_until: e.target.value })} className={inputCls} />
          </Field>
          <Field label="Délai indicatif (jours)">
            <input type="number" value={setForm.provider_delai_jours ?? 5} onChange={(e) => setSetForm({ ...setForm, provider_delai_jours: e.target.value })} className={inputCls} />
          </Field>
          <Field label="Formes couvertes" hint="Séparées par des virgules">
            <input value={setForm.provider_forms_text || ''} onChange={(e) => setSetForm({ ...setForm, provider_forms_text: e.target.value })} className={inputCls} placeholder="gélules, pommades…" />
          </Field>
          <label className="md:col-span-2 flex items-center gap-2 text-xs">
            <input type="checkbox" checked={!!setForm.internal_prep_enabled} onChange={(e) => setSetForm({ ...setForm, internal_prep_enabled: e.target.checked })} />
            Autoriser la préparation interne (rare)
          </label>
          <button type="submit" className="md:col-span-2 bg-fuchsia-600 text-white py-2 rounded-lg font-semibold">Enregistrer</button>
        </form>
      )}

      {tab === 'tarif' && (
        <form onSubmit={saveParams} className="bg-white p-5 rounded-xl border grid md:grid-cols-2 gap-3 text-sm">
          <Field label="Frais de port (€)">
            <input type="number" step="0.01" value={setForm.frais_port ?? ''} onChange={(e) => setSetForm({ ...setForm, frais_port: e.target.value })} className={inputCls} />
          </Field>
          <Field label="Coefficient">
            <input type="number" step="0.0001" value={setForm.coefficient ?? ''} onChange={(e) => setSetForm({ ...setForm, coefficient: e.target.value })} className={inputCls} />
          </Field>
          <Field label="TVA défaut (%)">
            <input type="number" step="0.01" value={setForm.tva_rate ?? ''} onChange={(e) => setSetForm({ ...setForm, tva_rate: e.target.value })} className={inputCls} />
          </Field>
          <Field label="Rétention docs (jours)">
            <input type="number" value={setForm.docs_retention_days ?? 365} onChange={(e) => setSetForm({ ...setForm, docs_retention_days: e.target.value })} className={inputCls} />
          </Field>
          <button type="submit" className="md:col-span-2 bg-fuchsia-600 text-white py-2 rounded-lg font-semibold">Enregistrer</button>
        </form>
      )}

      {tab === 'creation' && (
        <div className="bg-white p-5 rounded-xl border space-y-4 text-sm">
          <InfoBanner>
            <p>Cochez <strong>Actif</strong> pour afficher le champ à la création, <strong>Obligatoire</strong> pour bloquer l’envoi s’il est vide (hors brouillon).</p>
          </InfoBanner>
          <div className="flex flex-wrap gap-1.5">
            {CREATION_ETAPES.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => setCreationEtape(e.id)}
                className={`px-3 py-1 rounded-full text-xs font-semibold border ${
                  creationEtape === e.id ? 'bg-fuchsia-100 border-fuchsia-400 text-fuchsia-900' : 'bg-slate-50 border-slate-200'
                }`}
              >
                {e.label}
              </button>
            ))}
          </div>
          <div className="overflow-x-auto border rounded-lg">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b">
                <tr>
                  <th className="p-2 font-semibold">Champ</th>
                  <th className="p-2 font-semibold w-20 text-center">Actif</th>
                  <th className="p-2 font-semibold w-28 text-center">Obligatoire</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {etapeFields.map((f) => {
                  const rule = getCreationChamp({ creation_champs: setForm.creation_champs }, f.code);
                  return (
                    <tr key={f.code}>
                      <td className="p-2">{f.label}</td>
                      <td className="p-2 text-center">
                        <input
                          type="checkbox"
                          checked={rule.actif}
                          onChange={(e) => patchChamp(f.code, { actif: e.target.checked })}
                        />
                      </td>
                      <td className="p-2 text-center">
                        <input
                          type="checkbox"
                          checked={rule.obligatoire}
                          disabled={!rule.actif}
                          onChange={(e) => patchChamp(f.code, { obligatoire: e.target.checked })}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <button type="button" onClick={saveParams} className="w-full bg-fuchsia-600 text-white py-2 rounded-lg font-semibold">
            Enregistrer les champs
          </button>
        </div>
      )}
    </div>
  );
}
