import React, { useState, useEffect } from 'react';
import { ArrowLeft, ClipboardCheck, AlertTriangle, Thermometer, Scale, Save } from 'lucide-react';
import { useAuth } from '../core/AuthContext';
import {
  fetchDailyControls,
  fetchControlsStats,
  fetchEquipments,
  upsertEquipment,
} from '../services/controlsService';

const TYPE_LABELS = {
  temperature_frigo: 'Frigo',
  temperature_frigo_a: 'Frigo A (ancien)',
  temperature_frigo_b: 'Frigo B (ancien)',
  menage_officine: 'Ménage',
  controle_stupefiants: 'Stupéfiants',
};

export default function ControlsManager({ onNavigate }) {
  const { user } = useAuth();
  const [controls, setControls] = useState([]);
  const [stats, setStats] = useState(null);
  const [equipments, setEquipments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(7);
  const [eqForm, setEqForm] = useState({
    id: null, equipment_name: 'Balance', calibration_end_date: '', next_visit_date: '', notes: '', createRdvTask: true,
  });
  const [eqMsg, setEqMsg] = useState('');

  useEffect(() => { loadData(); }, [days]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [ctrls, st, eqs] = await Promise.all([
        fetchDailyControls(days),
        fetchControlsStats(),
        fetchEquipments(),
      ]);
      setControls(ctrls);
      setStats(st);
      setEquipments(eqs);
      if (eqs[0]) {
        setEqForm(f => ({
          ...f,
          id: eqs[0].id,
          equipment_name: eqs[0].equipment_name,
          calibration_end_date: eqs[0].calibration_end_date,
          next_visit_date: eqs[0].next_visit_date || '',
          notes: eqs[0].notes || '',
        }));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const saveEquipment = async (e) => {
    e.preventDefault();
    setEqMsg('');
    try {
      await upsertEquipment(eqForm, user.id);
      setEqMsg(eqForm.createRdvTask && eqForm.next_visit_date
        ? 'Étalonnage enregistré + tâche RDV créée pour les admins.'
        : 'Étalonnage enregistré.');
      loadData();
    } catch (err) {
      alert(err.message);
    }
  };

  if (loading) return <div className="p-8 text-slate-500">Chargement...</div>;

  return (
    <div className="p-8 max-w-7xl mx-auto w-full">
      <button onClick={() => onNavigate('dashboard')} className="flex items-center gap-2 text-slate-500 hover:text-teal-600 mb-6 text-sm font-medium">
        <ArrowLeft size={16} /> Retour au Dashboard
      </button>

      <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2 mb-6">
        <ClipboardCheck className="text-teal-600" /> Contrôles & Équipements
      </h1>

      {/* Balance / étalonnage */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 mb-6">
        <h2 className="font-bold flex items-center gap-2 mb-4"><Scale className="text-slate-600" /> Étalonnage balance (annuel)</h2>
        {eqMsg && <p className="text-sm text-emerald-700 mb-3">{eqMsg}</p>}
        <form onSubmit={saveEquipment} className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
          <div>
            <label className="block font-semibold mb-1">Équipement</label>
            <input value={eqForm.equipment_name} onChange={e => setEqForm({ ...eqForm, equipment_name: e.target.value })} className="w-full p-2 border rounded-lg" />
          </div>
          <div>
            <label className="block font-semibold mb-1">Fin de validité *</label>
            <input type="date" required value={eqForm.calibration_end_date} onChange={e => setEqForm({ ...eqForm, calibration_end_date: e.target.value })} className="w-full p-2 border rounded-lg" />
          </div>
          <div>
            <label className="block font-semibold mb-1">Prochaine visite</label>
            <input type="date" value={eqForm.next_visit_date} onChange={e => setEqForm({ ...eqForm, next_visit_date: e.target.value })} className="w-full p-2 border rounded-lg" />
          </div>
          <div className="flex flex-col justify-end gap-2">
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={eqForm.createRdvTask} onChange={e => setEqForm({ ...eqForm, createRdvTask: e.target.checked })} />
              Créer tâche RDV pour l'admin
            </label>
            <button type="submit" className="bg-teal-600 text-white px-4 py-2 rounded-lg flex items-center justify-center gap-1 hover:bg-teal-700">
              <Save size={16} /> Enregistrer
            </button>
          </div>
        </form>
        {equipments.length > 0 && (
          <div className="mt-4 text-xs text-slate-500 space-y-1">
            {equipments.map(eq => (
              <p key={eq.id}>{eq.equipment_name} — validité jusqu'au {new Date(eq.calibration_end_date).toLocaleDateString('fr-FR')}
                {eq.next_visit_date && ` — visite prévue le ${new Date(eq.next_visit_date).toLocaleDateString('fr-FR')}`}
              </p>
            ))}
          </div>
        )}
      </div>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white p-4 rounded-xl border"><p className="text-xs text-slate-500">Cette semaine</p><p className="text-2xl font-bold">{stats.weekTotal}</p></div>
          <div className="bg-white p-4 rounded-xl border"><p className="text-xs text-slate-500">Aujourd'hui</p><p className="text-2xl font-bold">{stats.todayTotal}</p></div>
          <div className="bg-white p-4 rounded-xl border"><p className="text-xs text-slate-500">Non conformes (7j)</p><p className="text-2xl font-bold text-red-600">{stats.nonCompliant}</p></div>
          <div className={`p-4 rounded-xl border ${stats.missingTempMorning ? 'bg-amber-50 border-amber-200' : 'bg-white'}`}>
            <p className="text-xs text-slate-500 flex items-center gap-1"><Thermometer size={12} /> Temp. frigo matin</p>
            <p className="text-sm font-bold">{stats.missingTempMorning ? 'Manquante !' : 'OK'}</p>
          </div>
        </div>
      )}

      <div className="mb-4">
        <select value={days} onChange={e => setDays(Number(e.target.value))} className="p-2 border rounded-lg text-sm">
          <option value={7}>7 derniers jours</option>
          <option value={30}>30 derniers jours</option>
        </select>
      </div>

      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 border-b text-slate-600">
            <tr>
              <th className="p-4">Date</th>
              <th className="p-4">Contrôle</th>
              <th className="p-4">Valeur</th>
              <th className="p-4">Conformité</th>
              <th className="p-4">Par</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {controls.map(c => (
              <tr key={c.id} className={!c.is_compliant ? 'bg-red-50/30' : ''}>
                <td className="p-4">{new Date(c.created_at).toLocaleString('fr-FR')}</td>
                <td className="p-4 font-medium">{TYPE_LABELS[c.control_type] || c.control_type} {c.shift && `(${c.shift})`}</td>
                <td className="p-4">{c.value != null ? `${c.value}°C` : '—'}</td>
                <td className="p-4">
                  {c.is_compliant ? <span className="text-emerald-700 text-xs font-bold">Conforme</span>
                    : <span className="text-red-700 text-xs font-bold flex items-center gap-1"><AlertTriangle size={12} /> Non conforme</span>}
                </td>
                <td className="p-4 text-slate-500">{c.author_name}</td>
              </tr>
            ))}
            {controls.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-slate-500">Aucun contrôle.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
