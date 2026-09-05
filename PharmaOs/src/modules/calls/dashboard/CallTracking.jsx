import React, { useState, useEffect, useMemo } from 'react';
import {
  fetchCallLogsWithProfiles,
  submitCallLog,
  updateCallLog,
  saveCallPending,
  cancelPendingCallTask,
  completePendingCallTask,
  labelCallType,
  labelCallMotif,
  labelCallStatut,
  CALL_MOTIFS,
  CALL_STATUTS_COMPTOIR,
  CALL_STATUT_CLOTURE,
  CALL_FORM_DEFAULTS,
} from '../services/callService.js';
import CallForm from '../shared/CallForm.jsx';
import { useAuth } from '../../../core/AuthContext.jsx';
import { Phone, Filter, ArrowLeft, Edit2, Save, X, Plus, CheckCircle, Clock } from 'lucide-react';

const EMPTY = { ...CALL_FORM_DEFAULTS };

function formatDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.toLocaleDateString('fr-FR')} ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
}

function toDayKey(iso) {
  if (!iso) return '';
  return new Date(iso).toISOString().slice(0, 10);
}

export default function CallTracking({ onNavigate }) {
  const { user, profile } = useAuth();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [motifFilter, setMotifFilter] = useState('all');
  const [personFilter, setPersonFilter] = useState('all');
  const [dayFilter, setDayFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [newForm, setNewForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ statut_traitement: '', notes_appel: '' });

  const loadData = async () => {
    try {
      setLogs(await fetchCallLogsWithProfiles());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const people = useMemo(() => {
    const map = new Map();
    logs.forEach((log) => {
      const id = log.user_id;
      const name = log.profile?.display_name || 'Inconnu';
      if (id && !map.has(id)) map.set(id, name);
    });
    return [...map.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  }, [logs]);

  const handleCreate = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await submitCallLog(newForm, user.id);
      setShowForm(false);
      setNewForm(EMPTY);
      await loadData();
    } catch (err) {
      alert(err.message || 'Erreur lors de la création.');
    } finally {
      setSaving(false);
    }
  };

  const handlePendingCreate = async () => {
    setSaving(true);
    try {
      await saveCallPending(newForm, user.id);
      setShowForm(false);
      setNewForm(EMPTY);
      await loadData();
    } catch (err) {
      alert(err.message || 'Erreur lors de la sauvegarde.');
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async (id) => {
    const previous = logs.find((l) => l.id === id);
    await updateCallLog(id, {
      statut_traitement: editForm.statut_traitement,
      notes_appel: editForm.notes_appel,
    });
    if (previous?.statut_traitement === 'brouillon' && editForm.statut_traitement !== 'brouillon' && editForm.statut_traitement !== 'annule') {
      await completePendingCallTask(id, profile?.display_name || user?.email);
    }
    if (previous?.statut_traitement === 'brouillon' && editForm.statut_traitement === 'annule') {
      await cancelPendingCallTask(id, profile?.display_name || user?.email);
    }
    setEditingId(null);
    loadData();
  };

  const filteredLogs = logs.filter((log) => {
    const matchStatus = statusFilter === 'all' || log.statut_traitement === statusFilter;
    const matchMotif = motifFilter === 'all' || log.motif === motifFilter;
    const matchPerson = personFilter === 'all' || log.user_id === personFilter;
    const matchDay = !dayFilter || toDayKey(log.created_at) === dayFilter;
    return matchStatus && matchMotif && matchPerson && matchDay;
  });

  if (loading) return <div className="p-8 text-slate-500">Chargement...</div>;

  return (
    <div className="p-8 max-w-7xl mx-auto w-full">
      <button
        type="button"
        onClick={() => onNavigate('dashboard')}
        className="flex items-center gap-2 text-slate-500 hover:text-blue-600 mb-6 text-sm font-medium"
      >
        <ArrowLeft size={16} /> Retour au Dashboard
      </button>

      <div className="mb-6 flex justify-between items-center">
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <Phone className="text-emerald-600" /> Registre des appels
        </h1>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 flex items-center gap-2"
        >
          <Plus size={18} /> Nouvel appel
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm mb-6 space-y-4">
          <CallForm
            form={newForm}
            onChange={(patch) => setNewForm((prev) => ({ ...prev, ...patch }))}
            showNotes
            showCloture
          />
          <div className="flex flex-col gap-2">
            <div className="flex gap-3">
              <button
                type="button"
                disabled={saving}
                onClick={handlePendingCreate}
                className="flex-1 bg-amber-100 text-amber-800 font-bold py-2.5 rounded-lg flex items-center justify-center gap-2 disabled:opacity-60"
              >
                <Clock size={16} /> Mettre en attente
              </button>
              <button type="submit" disabled={saving} className="flex-1 bg-emerald-600 text-white font-bold py-2.5 rounded-lg disabled:opacity-60">
                {saving ? 'Enregistrement…' : 'Valider l’appel'}
              </button>
            </div>
            <button
              type="button"
              disabled={saving}
              onClick={() => { setShowForm(false); setNewForm(EMPTY); }}
              className="w-full border border-slate-300 text-slate-600 font-semibold py-2 rounded-lg"
            >
              Annuler
            </button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center gap-3 flex-wrap">
          <Filter size={16} className="text-slate-500" />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="text-sm border-slate-300 rounded-lg p-2 bg-white">
            <option value="all">Tous les statuts</option>
            {CALL_STATUTS_COMPTOIR.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
            <option value="brouillon">En attente (saisie)</option>
            <option value={CALL_STATUT_CLOTURE.value}>{CALL_STATUT_CLOTURE.label}</option>
            <option value="annule">Annulé</option>
          </select>
          <select value={motifFilter} onChange={(e) => setMotifFilter(e.target.value)} className="text-sm border-slate-300 rounded-lg p-2 bg-white">
            <option value="all">Tous les motifs</option>
            {CALL_MOTIFS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
          <select value={personFilter} onChange={(e) => setPersonFilter(e.target.value)} className="text-sm border-slate-300 rounded-lg p-2 bg-white">
            <option value="all">Toutes les personnes</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <input
            type="date"
            value={dayFilter}
            onChange={(e) => setDayFilter(e.target.value)}
            className="text-sm border-slate-300 rounded-lg p-2 bg-white"
            title="Filtrer par jour"
          />
          {dayFilter && (
            <button type="button" onClick={() => setDayFilter('')} className="text-xs text-slate-500 underline">
              Effacer le jour
            </button>
          )}
          <span className="text-xs text-slate-400 ml-auto">{filteredLogs.length} appel(s)</span>
        </div>

        <table className="w-full text-left text-sm">
          <thead className="bg-white border-b border-slate-200 text-slate-600">
            <tr>
              <th className="p-4 font-medium">Date & heure</th>
              <th className="p-4 font-medium">Déclarant</th>
              <th className="p-4 font-medium">Contact</th>
              <th className="p-4 font-medium">Type / Motif</th>
              <th className="p-4 font-medium">Statut & note</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredLogs.map((log) => {
              const isEditing = editingId === log.id;
              return (
                <tr key={log.id} className={isEditing ? 'bg-blue-50/50' : 'hover:bg-slate-50'}>
                  <td className="p-4 align-top whitespace-nowrap font-medium text-slate-800">
                    {formatDateTime(log.created_at)}
                  </td>
                  <td className="p-4 align-top text-slate-700">
                    {log.profile?.display_name || 'Inconnu'}
                  </td>
                  <td className="p-4 align-top">
                    <div className="font-medium text-slate-800">{log.contact_nom || 'Inconnu'}</div>
                    <div className="text-xs text-slate-500">{log.numero}</div>
                  </td>
                  <td className="p-4 align-top">
                    <div>{labelCallType(log.type)}</div>
                    <div className="text-xs text-slate-500">{labelCallMotif(log.motif)}</div>
                  </td>
                  <td className="p-4 align-top">
                    {isEditing ? (
                      <div className="flex gap-2 items-start">
                        <div className="flex-1 space-y-2">
                          <select
                            value={editForm.statut_traitement}
                            onChange={(e) => setEditForm({ ...editForm, statut_traitement: e.target.value })}
                            className="w-full p-1.5 text-sm border rounded-md"
                          >
                            {CALL_STATUTS_COMPTOIR.map((s) => (
                              <option key={s.value} value={s.value}>{s.label}</option>
                            ))}
                            <option value="brouillon">En attente (saisie)</option>
                            <option value="cloture">Clôturé</option>
                            <option value="annule">Annulé</option>
                          </select>
                          <textarea
                            rows={2}
                            placeholder="Note pharmacien…"
                            value={editForm.notes_appel}
                            onChange={(e) => setEditForm({ ...editForm, notes_appel: e.target.value })}
                            className="w-full p-2 text-sm border rounded-md"
                          />
                        </div>
                        <button type="button" onClick={() => handleSave(log.id)} className="p-1.5 bg-emerald-100 text-emerald-700 rounded" title="Enregistrer">
                          <Save size={16} />
                        </button>
                        <button type="button" onClick={() => setEditingId(null)} className="p-1.5 bg-slate-200 rounded" title="Annuler">
                          <X size={16} />
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-3 items-start">
                        <div className="flex-1">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                            log.statut_traitement === 'cloture' ? 'bg-emerald-100 text-emerald-700'
                              : log.statut_traitement === 'attente_pharmacien' || log.statut_traitement === 'brouillon'
                                ? 'bg-amber-100 text-amber-700'
                                : log.statut_traitement === 'annule'
                                  ? 'bg-slate-200 text-slate-500'
                                  : 'bg-slate-100 text-slate-700'
                          }`}>
                            {log.statut_traitement === 'cloture' && <CheckCircle size={12} />}
                            {log.statut_traitement === 'brouillon' && <Clock size={12} />}
                            {labelCallStatut(log.statut_traitement)}
                          </span>
                          <p className="mt-2 text-slate-600 text-xs whitespace-pre-wrap">
                            {log.notes_appel || <span className="text-slate-400 italic">Aucune note pharmacien</span>}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(log.id);
                            setEditForm({
                              statut_traitement: log.statut_traitement || 'resolu',
                              notes_appel: log.notes_appel || '',
                            });
                          }}
                          className="p-1.5 bg-white border border-slate-200 text-slate-500 rounded hover:bg-blue-50"
                          title="Clôturer / modifier la note"
                        >
                          <Edit2 size={16} />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
            {filteredLogs.length === 0 && (
              <tr><td colSpan="5" className="p-8 text-center text-slate-500">Aucun appel ne correspond.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
