import React, { useState, useEffect } from 'react';
import { ArrowLeft, ShieldAlert, Edit2, Save, X, Filter, Clock } from 'lucide-react';
import { useAuth } from '../../../core/AuthContext.jsx';
import {
  fetchQualityEvents,
  updateQualityEvent,
  completePendingQualityTask,
  cancelPendingQualityTask,
} from '../services/qualityService.js';

const TYPE_LABELS = {
  erreur_delivrance: 'Erreur de délivrance',
  presqu_erreur: 'Presqu\'erreur',
  reclamation_patient: 'Réclamation patient',
  probleme_fournisseur: 'Problème fournisseur',
};

const STATUS_OPTIONS = ['en_attente', 'ouvert', 'en_analyse', 'cloture', 'annule'];
const CAPA_STATUS = ['en_attente', 'en_cours', 'termine'];

const STATUS_LABELS = {
  en_attente: 'En attente',
  ouvert: 'Ouvert',
  en_analyse: 'En analyse',
  cloture: 'Clôturé',
  annule: 'Annulé',
};

export default function QualityManager({ onNavigate }) {
  const { user, profile } = useAuth();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [editing, setEditing] = useState(null);

  const loadData = async () => {
    setLoading(true);
    try {
      setEvents(await fetchQualityEvents());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const filtered = events.filter((e) => filter === 'all' || e.status === filter);

  const handleSave = async () => {
    const previous = events.find((e) => e.id === editing.id);
    const { id, status, capa_action, capa_status } = editing;
    const updates = { status, capa_action, capa_status };
    if (status === 'cloture') {
      updates.resolved_at = new Date().toISOString();
    }
    await updateQualityEvent(id, updates);
    if (previous?.status === 'en_attente' && status === 'ouvert') {
      await completePendingQualityTask(id, profile?.display_name || user?.email);
    }
    if (previous?.status === 'en_attente' && status === 'annule') {
      await cancelPendingQualityTask(id, profile?.display_name || user?.email);
    }
    setEditing(null);
    loadData();
  };

  const severityBadge = (s) => {
    if (s === 'critique') return 'bg-red-100 text-red-700';
    if (s === 'majeure') return 'bg-amber-100 text-amber-700';
    return 'bg-slate-100 text-slate-600';
  };

  if (loading) return <div className="p-8 text-slate-500">Chargement...</div>;

  return (
    <div className="p-8 max-w-7xl mx-auto w-full">
      <button onClick={() => onNavigate('dashboard')} className="flex items-center gap-2 text-slate-500 hover:text-rose-600 mb-6 text-sm font-medium">
        <ArrowLeft size={16} /> Retour au Dashboard
      </button>

      <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2 mb-6">
        <ShieldAlert className="text-rose-600" /> Non-conformités & CAPA
      </h1>

      <div className="mb-4 flex items-center gap-3">
        <Filter size={16} className="text-slate-400" />
        <select value={filter} onChange={(e) => setFilter(e.target.value)} className="p-2 border rounded-lg text-sm">
          <option value="all">Tous les statuts</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{STATUS_LABELS[s] || s}</option>
          ))}
        </select>
        <span className="text-sm text-slate-400 ml-auto">{filtered.length} événement(s)</span>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 border-b text-slate-600">
            <tr>
              <th className="p-4">Date</th>
              <th className="p-4">Type / Gravité</th>
              <th className="p-4">Description</th>
              <th className="p-4">Statut / CAPA</th>
              <th className="p-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((ev) => (
              <tr key={ev.id} className="hover:bg-slate-50">
                <td className="p-4 align-top">
                  <div className="font-medium">{new Date(ev.created_at).toLocaleDateString('fr-FR')}</div>
                  <div className="text-xs text-slate-400">{ev.author_name}</div>
                </td>
                <td className="p-4 align-top">
                  <div className="font-medium">{TYPE_LABELS[ev.type] || ev.type}</div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${severityBadge(ev.severity)}`}>{ev.severity}</span>
                </td>
                <td className="p-4 align-top max-w-xs">
                  <p className="text-slate-700">{ev.data?.description}</p>
                  {ev.data?.immediate_action && <p className="text-xs text-emerald-700 mt-1">Action : {ev.data.immediate_action}</p>}
                </td>
                <td className="p-4 align-top">
                  <span className={`text-xs px-2 py-1 rounded inline-flex items-center gap-1 ${
                    ev.status === 'en_attente' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100'
                  }`}>
                    {ev.status === 'en_attente' && <Clock size={12} />}
                    {STATUS_LABELS[ev.status] || ev.status}
                  </span>
                  {ev.capa_action && <p className="text-xs text-slate-500 mt-1">CAPA : {ev.capa_action}</p>}
                </td>
                <td className="p-4 align-top text-right">
                  <button onClick={() => setEditing({ ...ev })} className="p-1.5 border rounded hover:bg-slate-50">
                    <Edit2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={5} className="p-8 text-center text-slate-500">Aucun événement.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6">
            <h2 className="font-bold text-lg mb-4">Analyse & CAPA</h2>
            <p className="text-sm text-slate-600 mb-4 bg-slate-50 p-3 rounded">{editing.data?.description}</p>
            <div className="space-y-3 text-sm">
              <div>
                <label className="block font-semibold mb-1">Statut</label>
                <select value={editing.status} onChange={(e) => setEditing({ ...editing, status: e.target.value })} className="w-full p-2 border rounded-lg">
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>{STATUS_LABELS[s] || s}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-semibold mb-1">Action corrective / préventive (CAPA)</label>
                <textarea
                  rows={3}
                  value={editing.capa_action || ''}
                  onChange={(e) => setEditing({ ...editing, capa_action: e.target.value })}
                  className="w-full p-2 border rounded-lg"
                  placeholder="Mesures à mettre en place..."
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">Statut CAPA</label>
                <select value={editing.capa_status || 'en_attente'} onChange={(e) => setEditing({ ...editing, capa_status: e.target.value })} className="w-full p-2 border rounded-lg">
                  {CAPA_STATUS.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-2 mt-6">
              <button onClick={() => setEditing(null)} className="flex-1 p-2 border rounded-lg hover:bg-slate-50 flex items-center justify-center gap-1">
                <X size={16} /> Fermer
              </button>
              <button onClick={handleSave} className="flex-1 p-2 bg-rose-600 text-white rounded-lg hover:bg-rose-700 flex items-center justify-center gap-1">
                <Save size={16} /> Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
