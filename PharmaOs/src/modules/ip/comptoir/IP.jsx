import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../../core/AuthContext.jsx';
import {
  fetchRecentIpLogs,
  fetchPendingIps,
  fetchHealthProfessionals,
  appendDoctorSwitchNote,
  insertIpLogReturning,
  createPendingIpTask,
  buildIpPayload,
  ipFormHasContent,
  ipRowToForm,
  updateIp,
  cancelIp,
  completePendingIpTask,
  cancelPendingIpTask,
} from '../services/ipService.js';
import IpForm, { IP_FORM_DEFAULTS } from '../shared/IpForm.jsx';
import {
  closeModuleWindow,
  setModuleBeforeCloseHandler,
} from '../../../shared/windowService.js';
import { Activity, Save, History, CheckCircle2, Clock, X, Play } from 'lucide-react';

function initialsFromContactName(name) {
  if (!name) return '';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0].slice(0, 2) + parts[1].slice(0, 2)).toUpperCase().slice(0, 4);
  return name.slice(0, 2).toUpperCase();
}

export default function Ip({ data: prefill }) {
  const { user, profile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [history, setHistory] = useState([]);
  const [pendingList, setPendingList] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [addDoctorNote, setAddDoctorNote] = useState(false);
  const [doctorNoteText, setDoctorNoteText] = useState(`… → … le ${new Date().toLocaleDateString('fr-FR')}`);
  const [formData, setFormData] = useState(IP_FORM_DEFAULTS);
  const [editingId, setEditingId] = useState(null);
  const [skipAutoPending, setSkipAutoPending] = useState(false);

  const formRef = useRef(formData);
  const editingIdRef = useRef(editingId);
  const doctorsRef = useRef(doctors);
  const skipRef = useRef(skipAutoPending);
  const userRef = useRef(user);
  const addNoteRef = useRef({ addDoctorNote, doctorNoteText });

  useEffect(() => { formRef.current = formData; }, [formData]);
  useEffect(() => { editingIdRef.current = editingId; }, [editingId]);
  useEffect(() => { doctorsRef.current = doctors; }, [doctors]);
  useEffect(() => { skipRef.current = skipAutoPending; }, [skipAutoPending]);
  useEffect(() => { userRef.current = user; }, [user]);
  useEffect(() => { addNoteRef.current = { addDoctorNote, doctorNoteText }; }, [addDoctorNote, doctorNoteText]);

  const loadLists = useCallback(async () => {
    const [hist, pend] = await Promise.all([
      fetchRecentIpLogs(15),
      fetchPendingIps(user?.id),
    ]);
    if (!hist.error) setHistory((hist.data || []).filter((r) => r.statut_ip !== 'Annulee'));
    if (!pend.error) setPendingList(pend.data || []);
  }, [user?.id]);

  useEffect(() => {
    loadLists();
    fetchHealthProfessionals().then(({ data, error }) => {
      if (!error && data) setDoctors(data);
    });
  }, [loadLists]);

  useEffect(() => {
    if (!prefill?.fromCall) return;
    setFormData((prev) => {
      const doctorMatch = prefill.contact_id
        && doctors.some((d) => d.id === prefill.contact_id);
      return {
        ...prev,
        patient_initiales: doctorMatch
          ? prev.patient_initiales
          : (initialsFromContactName(prefill.contact_nom) || prev.patient_initiales),
        medecin_id: doctorMatch ? prefill.contact_id : prev.medecin_id,
        medecin_nom_libre: doctorMatch
          ? ''
          : prev.medecin_nom_libre,
        commentaires: [
          prefill.contact_nom && `Interlocuteur : ${prefill.contact_nom}`,
          prefill.numero && `Tél. : ${prefill.numero}`,
          'Motif : intervention pharmaceutique (depuis l’appel)',
        ].filter(Boolean).join('\n'),
        mode_transmission: 'Appel téléphonique',
      };
    });
  }, [prefill, doctors]);

  const autoSavePending = useCallback(async () => {
    if (skipRef.current) return;
    const form = formRef.current;
    if (!ipFormHasContent(form) || !userRef.current?.id) return;
    if (editingIdRef.current) {
      const payload = buildIpPayload(form, userRef.current.id, doctorsRef.current, 'En attente');
      const { user_id, ...updates } = payload;
      await updateIp(editingIdRef.current, updates);
      return;
    }
    const row = await insertIpLogReturning(
      buildIpPayload(form, userRef.current.id, doctorsRef.current, 'En attente'),
    );
    await createPendingIpTask(row, userRef.current.id);
  }, []);

  useEffect(() => {
    setModuleBeforeCloseHandler(autoSavePending);
    return () => setModuleBeforeCloseHandler(null);
  }, [autoSavePending]);

  const resetForm = () => {
    setFormData(IP_FORM_DEFAULTS);
    setEditingId(null);
    setAddDoctorNote(false);
  };

  const persistNew = async (statutIp, { createTask }) => {
    if (!user?.id) throw new Error('Utilisateur non authentifié.');
    const payload = buildIpPayload(formData, user.id, doctors, statutIp);
    const row = await insertIpLogReturning(payload);
    const { addDoctorNote: addN, doctorNoteText: noteT } = addNoteRef.current;
    if (addN && formData.medecin_id) {
      await appendDoctorSwitchNote(formData.medecin_id, doctors, noteT);
    }
    if (createTask) await createPendingIpTask(row, user.id);
    return row;
  };

  const handleValidate = async (e) => {
    e?.preventDefault?.();
    setLoading(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      if (editingId) {
        const payload = buildIpPayload(formData, user.id, doctors, 'Cloturee');
        const { user_id, ...updates } = payload;
        await updateIp(editingId, updates);
        await completePendingIpTask(editingId, profile?.display_name);
      } else {
        await persistNew('Cloturee', { createTask: false });
      }
      setSkipAutoPending(true);
      setSuccessMsg('IP enregistrée.');
      resetForm();
      await loadLists();
      setTimeout(() => closeModuleWindow(), 800);
    } catch (err) {
      setErrorMsg(err.message || "Erreur d'insertion.");
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
        const payload = buildIpPayload(formData, user.id, doctors, 'En attente');
        const { user_id, ...updates } = payload;
        await updateIp(editingId, updates);
      } else {
        await persistNew('En attente', { createTask: true });
      }
      setSkipAutoPending(true);
      setSuccessMsg('IP sauvegardée en attente.');
      resetForm();
      await loadLists();
      setTimeout(() => closeModuleWindow(), 800);
    } catch (err) {
      setErrorMsg(err.message || "Erreur d'insertion.");
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      if (editingId) {
        await cancelIp(editingId);
        await cancelPendingIpTask(editingId, profile?.display_name);
      }
      setSkipAutoPending(true);
      resetForm();
      setSuccessMsg(editingId ? 'IP annulée.' : 'Saisie annulée.');
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
    setFormData(ipRowToForm(row));
    setSuccessMsg('');
    setErrorMsg('');
  };

  return (
    <div className="w-full h-full flex bg-slate-50 text-slate-800">
      <div className="w-1/2 bg-white border-r border-slate-200 p-8 overflow-y-auto">
        <h2 className="text-2xl font-bold mb-2 flex items-center gap-2 text-slate-800">
          <Activity className="text-indigo-600" /> Saisie Act-IP
        </h2>
        {prefill?.fromCall && !editingId && (
          <p className="text-sm text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2 mb-4">
            Pré-rempli depuis l’appel {prefill.contact_nom || prefill.numero || ''}.
          </p>
        )}
        {editingId && (
          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mb-4">
            Finalisation d’une IP en attente.
          </p>
        )}

        {successMsg && (
          <div className="mb-4 p-3 bg-emerald-50 text-emerald-700 rounded-lg flex items-center gap-2 border border-emerald-200">
            <CheckCircle2 size={20} /> {successMsg}
          </div>
        )}
        {errorMsg && (
          <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg border border-red-200 text-sm">Erreur : {errorMsg}</div>
        )}

        <form onSubmit={handleValidate} className="space-y-4">
          <IpForm
            form={formData}
            onChange={(patch) => setFormData((prev) => ({ ...prev, ...patch }))}
            doctors={doctors}
            requireCore
            addDoctorNote={addDoctorNote}
            setAddDoctorNote={setAddDoctorNote}
            doctorNoteText={doctorNoteText}
            setDoctorNoteText={setDoctorNoteText}
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
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl flex justify-center gap-2 shadow-md disabled:opacity-70"
              >
                <Save size={18} /> Valider l’IP
              </button>
            </div>
            <button
              type="button"
              disabled={loading}
              onClick={handleCancel}
              className="w-full border border-slate-300 text-slate-600 hover:bg-slate-100 font-semibold py-2.5 rounded-xl flex justify-center gap-2 disabled:opacity-70"
            >
              <X size={18} /> Annuler l’IP
            </button>
          </div>
        </form>
      </div>

      <div className="w-1/2 bg-slate-100 p-8 overflow-y-auto space-y-8">
        <div>
          <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-amber-800">
            <Clock className="text-amber-600" /> IP en attente
          </h3>
          <div className="space-y-3">
            {pendingList.length === 0 ? (
              <p className="text-sm text-slate-500">Aucune IP en attente.</p>
            ) : (
              pendingList.map((log) => (
                <div key={log.id} className="bg-white p-4 rounded-lg border border-amber-200 shadow-sm text-sm">
                  <div className="flex justify-between items-start mb-2">
                    <span className="font-bold">{log.patient_initiales || '—'} ({log.patient_age || '?'} ans)</span>
                    <span className="text-xs text-slate-500">
                      {new Date(log.created_at).toLocaleString('fr-FR')}
                    </span>
                  </div>
                  <p className="text-slate-700">Dr. {log.directory_contacts?.nom || log.medecin_nom || '—'}</p>
                  <p className="text-slate-600 mt-1">{log.medicament_en_cause || 'Médicament non renseigné'}</p>
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
          <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-slate-700">
            <History className="text-slate-500" /> Historique récent
          </h3>
          <div className="space-y-3">
            {history.filter((h) => h.statut_ip !== 'En attente').slice(0, 8).map((log) => (
              <div key={log.id} className="bg-white p-4 rounded-lg border shadow-sm text-sm">
                <div className="flex justify-between items-start mb-2">
                  <span className="font-bold">{log.patient_initiales} ({log.patient_age || '?'} ans)</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                    log.statut_ip === 'Cloturee' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600'
                  }`}>
                    {log.statut_ip}
                  </span>
                </div>
                <p className="font-medium text-slate-800">
                  Dr. {log.directory_contacts?.nom || log.medecin_nom || 'Non renseigné'}
                </p>
                <p className="text-slate-600 mt-1"><span className="font-semibold">Traitement :</span> {log.medicament_en_cause}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
