import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../../core/AuthContext.jsx';
import { ShieldAlert, Save, History, CheckCircle2, AlertTriangle, Clock, X, Play } from 'lucide-react';
import {
  QUALITY_TYPES,
  SEVERITY_LEVELS,
  QUALITY_FORM_DEFAULTS,
  insertQualityEventReturning,
  updateQualityEventFull,
  fetchMyQualityEvents,
  fetchPendingQualityEvents,
  qualityFormHasContent,
  qualityRowToForm,
  cancelQualityEvent,
  createPendingQualityTask,
  completePendingQualityTask,
  cancelPendingQualityTask,
} from '../services/qualityService.js';
import {
  closeModuleWindow,
  setModuleBeforeCloseHandler,
} from '../../../shared/windowService.js';

const STATUS_LABELS = {
  ouvert: 'Ouvert',
  en_attente: 'En attente',
  en_analyse: 'En analyse',
  cloture: 'Clôturé',
  annule: 'Annulé',
};

function buildDescriptionFromCall(prefill) {
  return [
    prefill.contact_nom && `Contact : ${prefill.contact_nom}`,
    prefill.numero && `Tél. : ${prefill.numero}`,
    'Motif : réclamation patient (depuis l’appel)',
    prefill.notes_appel && `\n${prefill.notes_appel}`,
  ].filter(Boolean).join('\n').trim();
}

export default function Quality({ data: prefill }) {
  const { user, profile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [history, setHistory] = useState([]);
  const [pendingList, setPendingList] = useState([]);
  const [form, setForm] = useState(QUALITY_FORM_DEFAULTS);
  const [editingId, setEditingId] = useState(null);
  const [skipAutoPending, setSkipAutoPending] = useState(false);

  const formRef = useRef(form);
  const editingIdRef = useRef(editingId);
  const skipRef = useRef(skipAutoPending);
  const userRef = useRef(user);

  useEffect(() => { formRef.current = form; }, [form]);
  useEffect(() => { editingIdRef.current = editingId; }, [editingId]);
  useEffect(() => { skipRef.current = skipAutoPending; }, [skipAutoPending]);
  useEffect(() => { userRef.current = user; }, [user]);

  const loadLists = useCallback(async () => {
    if (!user?.id) return;
    const [histRes, pend] = await Promise.all([
      fetchMyQualityEvents(user.id),
      fetchPendingQualityEvents(user.id),
    ]);
    if (histRes.data) {
      setHistory(histRes.data.filter((e) => e.status !== 'en_attente'));
    }
    setPendingList(pend || []);
  }, [user?.id]);

  useEffect(() => { loadLists(); }, [loadLists]);

  useEffect(() => {
    if (!prefill?.fromCall) return;
    setForm((prev) => ({
      ...prev,
      type: 'reclamation_patient',
      description: buildDescriptionFromCall(prefill) || prev.description,
      location: prev.location || 'Appel téléphonique',
    }));
  }, [prefill]);

  const autoSavePending = useCallback(async () => {
    if (skipRef.current) return;
    const current = formRef.current;
    if (!qualityFormHasContent(current) || !userRef.current?.id) return;
    if (editingIdRef.current) {
      await updateQualityEventFull(editingIdRef.current, current, 'en_attente');
      return;
    }
    const row = await insertQualityEventReturning(userRef.current.id, current, 'en_attente');
    await createPendingQualityTask(row, userRef.current.id);
  }, []);

  useEffect(() => {
    setModuleBeforeCloseHandler(autoSavePending);
    return () => setModuleBeforeCloseHandler(null);
  }, [autoSavePending]);

  const resetForm = () => {
    setForm(QUALITY_FORM_DEFAULTS);
    setEditingId(null);
  };

  const handleValidate = async (e) => {
    e?.preventDefault?.();
    setLoading(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      if (editingId) {
        await updateQualityEventFull(editingId, form, 'ouvert');
        await completePendingQualityTask(editingId, profile?.display_name);
      } else {
        await insertQualityEventReturning(user.id, form, 'ouvert');
      }
      setSkipAutoPending(true);
      setSuccessMsg('Non-conformité déclarée.');
      resetForm();
      await loadLists();
      setTimeout(() => closeModuleWindow(), 800);
    } catch (err) {
      setErrorMsg(err.message || 'Erreur lors de la déclaration.');
    } finally {
      setLoading(false);
    }
  };

  const handlePending = async () => {
    setLoading(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      if (editingId) {
        await updateQualityEventFull(editingId, form, 'en_attente');
      } else {
        const row = await insertQualityEventReturning(user.id, form, 'en_attente');
        await createPendingQualityTask(row, user.id);
      }
      setSkipAutoPending(true);
      setSuccessMsg('NC sauvegardée en attente.');
      resetForm();
      await loadLists();
      setTimeout(() => closeModuleWindow(), 800);
    } catch (err) {
      setErrorMsg(err.message || 'Erreur lors de l’enregistrement.');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      if (editingId) {
        await cancelQualityEvent(editingId);
        await cancelPendingQualityTask(editingId, profile?.display_name);
      }
      setSkipAutoPending(true);
      resetForm();
      setSuccessMsg(editingId ? 'NC annulée.' : 'Saisie annulée.');
      await loadLists();
      setTimeout(() => closeModuleWindow(), 600);
    } catch (err) {
      setErrorMsg(err.message || 'Erreur annulation.');
    } finally {
      setLoading(false);
    }
  };

  const startFinishPending = (row) => {
    setEditingId(row.id);
    setForm(qualityRowToForm(row));
    setSuccessMsg('');
    setErrorMsg('');
  };

  const severityColor = (s) => {
    if (s === 'critique') return 'bg-red-100 text-red-700';
    if (s === 'majeure') return 'bg-amber-100 text-amber-700';
    return 'bg-slate-100 text-slate-600';
  };

  return (
    <div className="w-full h-full flex bg-slate-50 text-slate-800">
      <div className="w-1/2 bg-white border-r border-slate-200 p-8 overflow-y-auto">
        <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
          <ShieldAlert className="text-rose-600" /> Déclarer une non-conformité
        </h2>

        {prefill?.fromCall && !editingId && (
          <div className="mb-4 p-3 bg-rose-50 text-rose-800 rounded-lg border border-rose-200 text-sm">
            Prérempli depuis l’appel{prefill.contact_nom ? ` — ${prefill.contact_nom}` : ''}.
          </div>
        )}
        {editingId && (
          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mb-4">
            Finalisation d’une NC en attente.
          </p>
        )}

        {successMsg && (
          <div className="mb-4 p-3 bg-emerald-50 text-emerald-700 rounded-lg flex items-center gap-2 border border-emerald-200">
            <CheckCircle2 size={20} /> {successMsg}
          </div>
        )}
        {errorMsg && (
          <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg border border-red-200 text-sm">{errorMsg}</div>
        )}

        <form onSubmit={handleValidate} className="space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold mb-1">Type d'événement</label>
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="w-full p-2 border rounded-lg">
                {QUALITY_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block font-semibold mb-1">Gravité</label>
              <select value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })} className="w-full p-2 border rounded-lg">
                {SEVERITY_LEVELS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block font-semibold mb-1">Description *</label>
            <textarea
              required
              rows={4}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full p-2 border rounded-lg"
              placeholder="Décrivez les faits observés..."
            />
          </div>

          <div>
            <label className="block font-semibold mb-1">Action immédiate prise</label>
            <input
              type="text"
              value={form.immediateAction}
              onChange={(e) => setForm({ ...form, immediateAction: e.target.value })}
              className="w-full p-2 border rounded-lg"
              placeholder="Ex: Patient rappelé, produit isolé..."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold mb-1">Lieu / Zone</label>
              <input
                type="text"
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                className="w-full p-2 border rounded-lg"
                placeholder="Comptoir, frigo..."
              />
            </div>
            <div>
              <label className="block font-semibold mb-1">Médicament concerné</label>
              <input
                type="text"
                value={form.medicament}
                onChange={(e) => setForm({ ...form, medicament: e.target.value })}
                className="w-full p-2 border rounded-lg"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2 pt-1">
            <div className="flex gap-3">
              <button
                type="button"
                disabled={loading}
                onClick={handlePending}
                className="flex-1 bg-amber-100 text-amber-800 hover:bg-amber-200 font-bold py-3 rounded-xl flex justify-center gap-2 disabled:opacity-70"
              >
                <Clock size={18} /> Mettre en attente
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-bold py-3 rounded-xl flex justify-center gap-2 disabled:opacity-70"
              >
                <Save size={18} /> {loading ? 'Enregistrement…' : 'Valider la NC'}
              </button>
            </div>
            <button
              type="button"
              disabled={loading}
              onClick={handleCancel}
              className="w-full border border-slate-300 text-slate-600 hover:bg-slate-100 font-semibold py-2.5 rounded-xl flex justify-center gap-2 disabled:opacity-70"
            >
              <X size={18} /> Annuler la NC
            </button>
          </div>
        </form>
      </div>

      <div className="w-1/2 bg-slate-100 p-8 overflow-y-auto space-y-8">
        <div>
          <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-amber-800">
            <Clock className="text-amber-600" /> NC en attente
          </h3>
          <div className="space-y-3">
            {pendingList.length === 0 ? (
              <p className="text-sm text-slate-500">Aucune NC en attente.</p>
            ) : (
              pendingList.map((ev) => (
                <div key={ev.id} className="bg-white p-4 rounded-lg border border-amber-200 shadow-sm text-sm">
                  <div className="flex justify-between items-start mb-2">
                    <span className="font-bold capitalize">{ev.type?.replace(/_/g, ' ')}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${severityColor(ev.severity)}`}>{ev.severity}</span>
                  </div>
                  <p className="text-slate-600 line-clamp-2">{ev.data?.description || 'Sans description'}</p>
                  <button
                    type="button"
                    onClick={() => startFinishPending(ev)}
                    className="mt-3 w-full bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 rounded-lg flex items-center justify-center gap-2"
                  >
                    <Play size={16} /> Terminer l’attente
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        <div>
          <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
            <History className="text-slate-500" /> Mes déclarations récentes
          </h3>
          <div className="space-y-3">
            {history.length === 0 ? (
              <p className="text-slate-500 text-sm">Aucune déclaration.</p>
            ) : history.map((ev) => (
              <div key={ev.id} className="bg-white p-4 rounded-lg border shadow-sm text-sm">
                <div className="flex justify-between items-start mb-2">
                  <span className="font-bold capitalize">{ev.type?.replace(/_/g, ' ')}</span>
                  <div className="flex gap-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${severityColor(ev.severity)}`}>{ev.severity}</span>
                    <span className="px-2 py-0.5 rounded-full text-xs bg-slate-100">{STATUS_LABELS[ev.status] || ev.status}</span>
                  </div>
                </div>
                <p className="text-slate-600">{ev.data?.description}</p>
                {ev.data?.immediate_action && (
                  <p className="text-xs text-emerald-700 mt-2 flex items-center gap-1">
                    <AlertTriangle size={12} /> Action : {ev.data.immediate_action}
                  </p>
                )}
                <p className="text-xs text-slate-400 mt-2">{new Date(ev.created_at).toLocaleString('fr-FR')}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
