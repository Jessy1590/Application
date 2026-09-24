import React, { useState, useEffect, useCallback } from 'react';
import { Lock, Save, CheckCircle2, History, PauseCircle } from 'lucide-react';
import { useAuth } from '../../../core/AuthContext.jsx';
import { closeModuleWindow, openModuleWindow } from '../../../shared/windowService.js';
import { useRealtimeRefresh } from '../../../shared/useRealtimeRefresh.js';
import StupefiantReceptionForm, { EMPTY_RECEPTION_FORM } from '../shared/StupefiantReceptionForm.jsx';
import {
  declareReception,
  finalizeHeldReception,
  fetchMyReleves,
  fetchLivreurs,
  STUPEFIANT_STATUS_LABELS,
} from '../services/stupefiantService.js';

export default function StupefiantReception() {
  const { user, profile, canAccess } = useAuth();
  const [form, setForm] = useState({ ...EMPTY_RECEPTION_FORM });
  const [blFile, setBlFile] = useState(null);
  const [livreurs, setLivreurs] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [resumeId, setResumeId] = useState(null);

  const openDirectory = useCallback(() => {
    if (canAccess('taskbar', 'directory')) {
      openModuleWindow('directory');
    }
  }, [canAccess]);

  const load = useCallback(async () => {
    if (!user?.id) return;
    const [livs, hist] = await Promise.all([
      fetchLivreurs(),
      fetchMyReleves(user.id),
    ]);
    setLivreurs(livs);
    setHistory(hist);
  }, [user?.id]);

  useEffect(() => { load().catch((e) => setErrorMsg(e.message)); }, [load]);
  useRealtimeRefresh(load, { tables: ['stupefiant_releves', 'directory_contacts'], enabled: !!user?.id });

  const afterOk = async (msg) => {
    setSuccessMsg(msg);
    setForm({ ...EMPTY_RECEPTION_FORM });
    setBlFile(null);
    setResumeId(null);
    await load();
    setTimeout(() => closeModuleWindow(), 1100);
  };

  const handleSubmit = async (e, { hold = false } = {}) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      if (resumeId) {
        if (hold) throw new Error('Déjà en attente — finalisez le comptage ou annulez.');
        const result = await finalizeHeldReception(resumeId, form, user.id, blFile);
        if (result.outcome === 'ras') {
          await afterOk('Finalisé — armoire = LGO (RAS).');
        } else {
          await afterOk('Écart détecté — tâche envoyée au pharmacien.');
        }
        return;
      }

      const result = await declareReception(user.id, form, blFile, { hold });
      if (result.outcome === 'en_attente') {
        await afterOk('Réception mise en attente.');
      } else if (result.outcome === 'ras') {
        await afterOk('Réception OK — armoire = LGO (RAS).');
      } else {
        await afterOk('Écart détecté — tâche envoyée au pharmacien.');
      }
    } catch (err) {
      setErrorMsg(err.message || 'Erreur.');
    } finally {
      setLoading(false);
    }
  };

  const resumeHeld = (h) => {
    setResumeId(h.id);
    setForm({
      ...EMPTY_RECEPTION_FORM,
      medicament: h.medicament || '',
      cip: h.cip || '',
      produit_hors_bdm: !!h.produit_hors_bdm,
      nb_boites_recues: h.nb_boites_recues ?? '',
      livreur_id: h.livreur_id || '',
      is_du: !!h.is_du,
      du_patient_label: h.du_patient_label || '',
      du_unites_promisees: h.du_unites_promisees ?? '',
      armoire_boites: h.armoire_boites ?? '',
      armoire_unites: h.armoire_unites ?? '',
      stock_visuel_boites: h.stock_visuel_boites ?? h.armoire_boites ?? '',
      stock_visuel_unites: h.stock_visuel_unites ?? h.armoire_unites ?? '',
      stock_lgo_boites: h.stock_lgo_boites ?? '',
      stock_lgo_unites: h.stock_lgo_unites ?? '',
      bl_numero: h.bl_numero || '',
    });
    setBlFile(null);
    setSuccessMsg('');
    setErrorMsg('');
  };

  return (
    <div className="w-full h-full flex bg-slate-50 text-slate-800">
      <div className="w-1/2 bg-white border-r border-slate-200 p-8 overflow-y-auto">
        <h2 className="text-2xl font-bold mb-2 flex items-center gap-2">
          <Lock className="text-rose-600" /> Réception stupéfiants
        </h2>
        <p className="text-sm text-slate-500 mb-6">
          {resumeId
            ? 'Reprise d’une réception en attente — complétez le comptage armoire / LGO.'
            : 'Enregistre la réception, compte l’armoire (après le dû si besoin) et compare au LGO. Ou mettez en attente pour finir plus tard.'}
        </p>

        {successMsg && (
          <div className="mb-4 p-3 bg-emerald-50 text-emerald-700 rounded-lg flex items-center gap-2 border border-emerald-200">
            <CheckCircle2 size={18} /> {successMsg}
          </div>
        )}
        {errorMsg && <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{errorMsg}</div>}

        <form onSubmit={(e) => handleSubmit(e, { hold: false })} className="space-y-4">
          <StupefiantReceptionForm
            form={form}
            onChange={(p) => setForm((prev) => ({ ...prev, ...p }))}
            livreurs={livreurs}
            operatorName={profile?.display_name || user?.email || ''}
            blFile={blFile}
            onBlFile={setBlFile}
            onOpenDirectory={canAccess('taskbar', 'directory') ? openDirectory : null}
            showCountFields
          />
          <div className="flex flex-col gap-2">
            <button
              type="submit"
              disabled={loading || livreurs.length === 0}
              className="w-full bg-rose-600 hover:bg-rose-700 text-white font-bold py-3 rounded-lg flex justify-center gap-2 disabled:opacity-60"
            >
              <Save size={18} />
              {loading ? 'Envoi…' : (resumeId ? 'Finaliser comptage' : 'Valider réception + comptage')}
            </button>
            {!resumeId && (
              <button
                type="button"
                disabled={loading || livreurs.length === 0}
                onClick={(e) => handleSubmit(e, { hold: true })}
                className="w-full border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 font-semibold py-3 rounded-lg flex justify-center gap-2 disabled:opacity-60"
              >
                <PauseCircle size={18} /> Mettre en attente
              </button>
            )}
            {resumeId && (
              <button
                type="button"
                disabled={loading}
                onClick={() => {
                  setResumeId(null);
                  setForm({ ...EMPTY_RECEPTION_FORM });
                  setBlFile(null);
                }}
                className="w-full border text-slate-600 py-2 rounded-lg text-sm"
              >
                Annuler la reprise
              </button>
            )}
          </div>
        </form>
      </div>

      <div className="w-1/2 bg-slate-100 p-8 overflow-y-auto">
        <h3 className="font-bold mb-4 flex items-center gap-2">
          <History size={18} /> Mes réceptions
        </h3>
        {history.length === 0 ? (
          <p className="text-slate-500 text-sm">Aucune réception.</p>
        ) : history.map((h) => (
          <div key={h.id} className="bg-white p-4 rounded-lg border mb-3 text-sm">
            <div className="flex justify-between gap-2">
              <span className="font-bold">{h.medicament}</span>
              <span className="text-xs bg-slate-100 px-2 py-0.5 rounded shrink-0">
                {STUPEFIANT_STATUS_LABELS[h.status] || h.status}
              </span>
            </div>
            <p className="text-slate-600 mt-1">
              {h.nb_boites_recues} boîte(s)
              {h.livreur_label && h.livreur_label !== '—' ? ` · ${h.livreur_label}` : ''}
              {h.bl_numero ? ` — BL ${h.bl_numero}` : ''}
              {h.is_du ? ' — dû' : ''}
            </p>
            <p className="text-xs text-slate-400 mt-2">
              {new Date(h.created_at).toLocaleString('fr-FR')}
            </p>
            {h.status === 'en_attente' && (
              <button
                type="button"
                onClick={() => resumeHeld(h)}
                className="mt-2 text-xs font-semibold text-amber-800 underline"
              >
                Reprendre →
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
