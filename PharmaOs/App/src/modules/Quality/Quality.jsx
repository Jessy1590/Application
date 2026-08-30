import React, { useState, useEffect } from 'react';
import { useAuth } from '../../core/AuthContext';
import { ShieldAlert, Save, History, CheckCircle2, AlertTriangle } from 'lucide-react';
import {
  QUALITY_TYPES,
  SEVERITY_LEVELS,
  insertQualityEvent,
  fetchMyQualityEvents,
} from '../../services/qualityService.js';

const STATUS_LABELS = {
  ouvert: 'Ouvert',
  en_analyse: 'En analyse',
  cloture: 'Clôturé',
};

export default function Quality() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [history, setHistory] = useState([]);
  const [form, setForm] = useState({
    type: 'presqu_erreur',
    severity: 'mineure',
    description: '',
    immediateAction: '',
    location: '',
    medicament: '',
  });

  useEffect(() => { loadHistory(); }, [user?.id]);

  const loadHistory = async () => {
    if (!user?.id) return;
    const { data } = await fetchMyQualityEvents(user.id);
    if (data) setHistory(data);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const { error } = await insertQualityEvent(user.id, form);
      if (error) throw error;
      setSuccessMsg('Non-conformité déclarée.');
      setForm({ type: 'presqu_erreur', severity: 'mineure', description: '', immediateAction: '', location: '', medicament: '' });
      loadHistory();
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err) {
      setErrorMsg(err.message || 'Erreur lors de la déclaration.');
    } finally {
      setLoading(false);
    }
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

        {successMsg && (
          <div className="mb-4 p-3 bg-emerald-50 text-emerald-700 rounded-lg flex items-center gap-2 border border-emerald-200">
            <CheckCircle2 size={20} /> {successMsg}
          </div>
        )}
        {errorMsg && (
          <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg border border-red-200 text-sm">{errorMsg}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold mb-1">Type d'événement</label>
              <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} className="w-full p-2 border rounded-lg">
                {QUALITY_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block font-semibold mb-1">Gravité</label>
              <select value={form.severity} onChange={e => setForm({ ...form, severity: e.target.value })} className="w-full p-2 border rounded-lg">
                {SEVERITY_LEVELS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block font-semibold mb-1">Description *</label>
            <textarea required rows={4} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
              className="w-full p-2 border rounded-lg" placeholder="Décrivez les faits observés..." />
          </div>

          <div>
            <label className="block font-semibold mb-1">Action immédiate prise</label>
            <input type="text" value={form.immediateAction} onChange={e => setForm({ ...form, immediateAction: e.target.value })}
              className="w-full p-2 border rounded-lg" placeholder="Ex: Patient rappelé, produit isolé..." />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold mb-1">Lieu / Zone</label>
              <input type="text" value={form.location} onChange={e => setForm({ ...form, location: e.target.value })}
                className="w-full p-2 border rounded-lg" placeholder="Comptoir, frigo..." />
            </div>
            <div>
              <label className="block font-semibold mb-1">Médicament concerné</label>
              <input type="text" value={form.medicament} onChange={e => setForm({ ...form, medicament: e.target.value })}
                className="w-full p-2 border rounded-lg" />
            </div>
          </div>

          <button type="submit" disabled={loading} className="w-full bg-rose-600 hover:bg-rose-700 text-white font-bold py-3 rounded-lg flex justify-center gap-2">
            <Save size={18} /> {loading ? 'Enregistrement...' : 'Déclarer'}
          </button>
        </form>
      </div>

      <div className="w-1/2 bg-slate-100 p-8 overflow-y-auto">
        <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
          <History className="text-slate-500" /> Mes déclarations récentes
        </h3>
        <div className="space-y-3">
          {history.length === 0 ? (
            <p className="text-slate-500 text-sm">Aucune déclaration.</p>
          ) : history.map(ev => (
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
  );
}
