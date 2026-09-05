import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../../core/AuthContext.jsx';
import {
  fetchRecentCallLogs,
  fetchPendingCalls,
  submitCallLog,
  saveCallPending,
  cancelCall,
  callFormHasContent,
  callRowToForm,
  cancelPendingCallTask,
  labelCallType,
  labelCallMotif,
  labelCallStatut,
  CALL_FORM_DEFAULTS,
} from '../services/callService.js';
import { fetchContactById } from '../../directory/services/directoryService.js';
import CallForm from '../shared/CallForm.jsx';
import {
  closeModuleWindow,
  openModuleWindow,
  setModuleBeforeCloseHandler,
} from '../../../shared/windowService.js';
import { Phone, Save, History, AlertCircle, CheckCircle2, Clock, X, Play } from 'lucide-react';

export default function Calls({ data: initialContact }) {
  const { user, profile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [history, setHistory] = useState([]);
  const [pendingList, setPendingList] = useState([]);
  const [formData, setFormData] = useState(CALL_FORM_DEFAULTS);
  const [contactType, setContactType] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [skipAutoPending, setSkipAutoPending] = useState(false);

  const formRef = useRef(formData);
  const editingIdRef = useRef(editingId);
  const skipRef = useRef(skipAutoPending);
  const userRef = useRef(user);

  useEffect(() => { formRef.current = formData; }, [formData]);
  useEffect(() => { editingIdRef.current = editingId; }, [editingId]);
  useEffect(() => { skipRef.current = skipAutoPending; }, [skipAutoPending]);
  useEffect(() => { userRef.current = user; }, [user]);

  const loadLists = useCallback(async () => {
    const [hist, pend] = await Promise.all([
      fetchRecentCallLogs(10),
      user?.id ? fetchPendingCalls(user.id) : Promise.resolve([]),
    ]);
    if (!hist.error) {
      setHistory((hist.data || []).filter((r) => r.statut_traitement !== 'brouillon'));
    }
    setPendingList(pend || []);
  }, [user?.id]);

  useEffect(() => {
    let cancelled = false;

    const applyContact = async () => {
      if (!initialContact) {
        setContactType(null);
        loadLists();
        return;
      }

      const type = initialContact.type || null;
      setFormData((prev) => ({
        ...prev,
        contact_id: initialContact.id ?? null,
        contact_nom: `${initialContact.prenom || ''} ${initialContact.nom || ''}`.trim(),
        numero: initialContact.telephone || initialContact.telephone_prive || '',
      }));
      setContactType(type);

      if (!type && initialContact.id) {
        const { data } = await fetchContactById(initialContact.id);
        if (!cancelled && data?.type) setContactType(data.type);
      }

      loadLists();
    };

    applyContact();
    return () => { cancelled = true; };
  }, [initialContact, loadLists]);

  const autoSavePending = useCallback(async () => {
    if (skipRef.current) return;
    const form = formRef.current;
    if (!callFormHasContent(form) || !userRef.current?.id) return;
    await saveCallPending(form, userRef.current.id, editingIdRef.current);
  }, []);

  useEffect(() => {
    setModuleBeforeCloseHandler(autoSavePending);
    return () => setModuleBeforeCloseHandler(null);
  }, [autoSavePending]);

  const resetForm = () => {
    setFormData(CALL_FORM_DEFAULTS);
    setContactType(null);
    setEditingId(null);
  };

  const chainAfterSave = (data, switches) => {
    const savedContactId = data.contact_id || formData.contact_id;
    const savedContactNom = data.contact_nom;
    const savedNumero = data.numero;
    const savedNotes = data.notes_appel || formData.notes_appel;

    if (switches.switchToIp) {
      setTimeout(() => {
        openModuleWindow('ip', {
          fromCall: true,
          call_id: data.id,
          contact_id: savedContactId,
          contact_nom: savedContactNom,
          numero: savedNumero,
          motif: data.motif,
        });
      }, 400);
    } else if (switches.switchToQuality) {
      setTimeout(() => {
        openModuleWindow('quality', {
          fromCall: true,
          call_id: data.id,
          contact_id: savedContactId,
          contact_nom: savedContactNom,
          numero: savedNumero,
          motif: data.motif,
          notes_appel: savedNotes,
          type: data.type,
        });
      }, 400);
    } else if (switches.switchToDispute) {
      setTimeout(() => {
        openModuleWindow('disputes', {
          fromCall: true,
          call_id: data.id,
          contact_id: savedContactId,
          contact_nom: savedContactNom,
          numero: savedNumero,
          motif: data.motif,
          notes_appel: savedNotes,
          type: data.type,
        });
      }, 400);
    } else {
      setTimeout(() => closeModuleWindow(), 800);
    }
  };

  const handleValidate = async (e) => {
    e?.preventDefault?.();
    setLoading(true);
    setSuccessMsg('');
    setErrorMsg('');
    try {
      const result = await submitCallLog(formData, user.id, {
        editingId,
        completeDraftTask: Boolean(editingId),
        displayName: profile?.display_name,
      });
      const chainMsg = result.switchToIp
        ? 'Appel enregistré — ouverture de l’IP…'
        : result.switchToQuality
          ? 'Appel enregistré — ouverture Qualité…'
          : result.switchToDispute
            ? 'Appel enregistré — ouverture Litiges…'
            : 'Appel tracé.';
      setSkipAutoPending(true);
      setSuccessMsg(chainMsg);
      await loadLists();
      const data = result.data;
      resetForm();
      chainAfterSave(data, result);
    } catch (err) {
      setErrorMsg(err.message || 'Erreur lors de l’enregistrement.');
    } finally {
      setLoading(false);
    }
  };

  const handlePending = async () => {
    setLoading(true);
    setSuccessMsg('');
    setErrorMsg('');
    try {
      await saveCallPending(formData, user.id, editingId);
      setSkipAutoPending(true);
      setSuccessMsg('Appel sauvegardé en attente.');
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
        await cancelCall(editingId);
        await cancelPendingCallTask(editingId, profile?.display_name);
      }
      setSkipAutoPending(true);
      resetForm();
      setSuccessMsg(editingId ? 'Appel annulé.' : 'Saisie annulée.');
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
    setFormData(callRowToForm(row));
    setSuccessMsg('');
    setErrorMsg('');
  };

  return (
    <div className="w-full h-full flex bg-slate-50 text-slate-800">
      <div className="w-1/2 bg-white border-r border-slate-200 p-8 overflow-y-auto">
        <h2 className="text-2xl font-bold mb-6 flex items-center gap-2 text-slate-800">
          <Phone className="text-sky-600" /> Tracer un appel
        </h2>

        {editingId && (
          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mb-4">
            Finalisation d’un appel en attente.
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

        <form onSubmit={handleValidate} className="space-y-5">
          <CallForm
            form={formData}
            onChange={(patch) => setFormData((prev) => ({ ...prev, ...patch }))}
            contactType={contactType}
          />
          <div className="flex flex-col gap-2">
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
                className="flex-1 bg-sky-600 hover:bg-sky-700 text-white font-bold py-3 rounded-xl flex justify-center gap-2 disabled:opacity-70"
              >
                <Save size={18} /> {loading ? 'Enregistrement…' : 'Valider l’appel'}
              </button>
            </div>
            <button
              type="button"
              disabled={loading}
              onClick={handleCancel}
              className="w-full border border-slate-300 text-slate-600 hover:bg-slate-100 font-semibold py-2.5 rounded-xl flex justify-center gap-2 disabled:opacity-70"
            >
              <X size={18} /> Annuler l’appel
            </button>
          </div>
        </form>
      </div>

      <div className="w-1/2 bg-slate-100 p-8 overflow-y-auto space-y-8">
        <div>
          <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-amber-800">
            <Clock className="text-amber-600" /> Appels en attente
          </h3>
          <div className="space-y-3">
            {pendingList.length === 0 ? (
              <p className="text-sm text-slate-500">Aucun appel en attente.</p>
            ) : (
              pendingList.map((log) => (
                <div key={log.id} className="bg-white p-4 rounded-lg border border-amber-200 shadow-sm text-sm">
                  <div className="flex justify-between items-start mb-2">
                    <span className="font-bold">{log.contact_nom || 'Inconnu'}</span>
                    <span className="text-xs text-slate-500">
                      {new Date(log.created_at).toLocaleString('fr-FR')}
                    </span>
                  </div>
                  <div className="text-slate-600 flex flex-wrap gap-2">
                    <span>{labelCallType(log.type)}</span>
                    <span className="flex items-center gap-1"><Phone size={14} /> {log.numero}</span>
                    <span className="flex items-center gap-1"><AlertCircle size={14} /> {labelCallMotif(log.motif)}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => startFinishPending(log)}
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
          <h3 className="text-lg font-bold mb-6 flex items-center gap-2 text-slate-700">
            <History className="text-slate-500" /> Derniers appels
          </h3>
          <div className="space-y-3">
            {history.length === 0 ? (
              <p className="text-slate-500 text-sm">Aucun historique récent.</p>
            ) : (
              history.map((log) => (
                <div key={log.id} className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
                  <div className="flex justify-between items-start mb-2">
                    <span className="font-bold text-slate-800">{log.contact_nom || 'Inconnu'}</span>
                    <span className="text-xs px-2 py-1 rounded-full font-medium bg-slate-100 text-slate-700">
                      {labelCallStatut(log.statut_traitement)}
                    </span>
                  </div>
                  <div className="text-sm text-slate-500 flex flex-wrap items-center gap-3">
                    <span>{labelCallType(log.type)}</span>
                    <span className="flex items-center gap-1"><Phone size={14} /> {log.numero}</span>
                    <span className="flex items-center gap-1"><AlertCircle size={14} /> {labelCallMotif(log.motif)}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
