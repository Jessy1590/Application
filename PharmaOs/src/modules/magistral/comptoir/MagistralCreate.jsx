import React, { useState, useEffect, useCallback } from 'react';
import { Save, CheckCircle2, ChevronRight, ChevronLeft } from 'lucide-react';
import { useAuth } from '../../../core/AuthContext.jsx';
import { closeModuleWindow } from '../../../shared/windowService.js';
import MagistralOrderForm from '../shared/MagistralOrderForm.jsx';
import {
  ensureSettings,
  formFromSettings,
  createMagistralOrder,
} from '../services/magistralService.js';

const WIZARD = [
  { id: 'analyse', label: 'Analyse' },
  { id: 'demande', label: 'Demande' },
  { id: 'patient', label: 'Patient' },
  { id: 'pieces', label: 'Pièces' },
];

/** Comptoir — nouvelle demande / commande ST (wizard lean). */
export default function MagistralCreate() {
  const { user } = useAuth();
  const [settings, setSettings] = useState(null);
  const [form, setForm] = useState(formFromSettings(null));
  const [wizardStep, setWizardStep] = useState(0);
  const [ordoFile, setOrdoFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const mergeForm = (patch) => setForm((f) => ({ ...f, ...patch }));

  const load = useCallback(async () => {
    try {
      const s = await ensureSettings();
      setSettings(s);
      setForm((f) => (f.pharmacie?.nom ? f : formFromSettings(s)));
    } catch (e) {
      setErr(e.message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (asDraft) => {
    setLoading(true); setErr(''); setMsg('');
    try {
      if (!asDraft) {
        if (!(form.patient?.phone || '').trim()) throw new Error('Téléphone patient obligatoire.');
        if (form.analyse?.decision === 'st' && !form.analyse?.dose_posologie_ok) {
          throw new Error('Cochez la vérification dose/posologie.');
        }
      }
      await createMagistralOrder(user.id, form, { asDraft, ordonnanceFile: ordoFile });
      setMsg(asDraft ? 'Brouillon enregistré.' : 'Demande envoyée au sous-traitant (si e-mail configuré).');
      setForm(formFromSettings(settings));
      setOrdoFile(null);
      setWizardStep(0);
      if (!asDraft) setTimeout(() => closeModuleWindow(), 800);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full h-full flex flex-col bg-slate-50 text-slate-800">
      <div className="px-4 py-3 bg-white border-b shrink-0">
        <h1 className="text-sm font-bold text-fuchsia-900">Commander — préparation magistrale</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Prestataire : {settings?.provider_name || '—'} ({settings?.provider_email || 'non configuré'})
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {msg && <div className="mb-3 p-3 bg-emerald-50 text-emerald-700 rounded-lg text-sm flex gap-2"><CheckCircle2 size={16} /> {msg}</div>}
        {err && <div className="mb-3 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{err}</div>}

        <div className="max-w-2xl mx-auto space-y-3">
          <div className="flex gap-1 mb-2">
            {WIZARD.map((s, i) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setWizardStep(i)}
                className={`flex-1 text-[11px] py-1.5 rounded-lg font-semibold ${
                  i === wizardStep ? 'bg-fuchsia-100 text-fuchsia-900' : i < wizardStep ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-500'
                }`}
              >
                {i + 1}. {s.label}
              </button>
            ))}
          </div>
          <MagistralOrderForm
            form={form}
            onChange={mergeForm}
            step={WIZARD[wizardStep].id}
            showInternalPrep={!!settings?.internal_prep_enabled}
            ordonnanceFile={ordoFile}
            onOrdonnanceChange={setOrdoFile}
          />
          <div className="flex gap-2 pt-2">
            {wizardStep > 0 && (
              <button type="button" onClick={() => setWizardStep((s) => s - 1)} className="px-3 py-2 rounded-lg border text-sm flex items-center gap-1">
                <ChevronLeft size={14} /> Retour
              </button>
            )}
            {wizardStep < WIZARD.length - 1 ? (
              <button type="button" onClick={() => setWizardStep((s) => s + 1)} className="flex-1 bg-fuchsia-600 text-white py-2.5 rounded-lg font-semibold flex justify-center items-center gap-1">
                Suivant <ChevronRight size={14} />
              </button>
            ) : (
              <>
                <button type="button" disabled={loading} onClick={() => handleCreate(true)} className="px-3 py-2 rounded-lg border text-sm">
                  Mise en attente
                </button>
                <button type="button" disabled={loading} onClick={() => handleCreate(false)} className="flex-1 bg-fuchsia-600 text-white py-2.5 rounded-lg font-semibold flex justify-center items-center gap-1">
                  <Save size={16} /> {loading ? 'Envoi…' : 'Envoyer au ST'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
