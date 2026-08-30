import React, { useState, useEffect } from 'react';
import { useAuth } from '../../core/AuthContext';
import { Thermometer, Save, CheckCircle2, AlertTriangle, ClipboardCheck, Scale } from 'lucide-react';
import {
  CONTROL_TYPES,
  SHIFTS,
  insertDailyControl,
  fetchTodayControls,
  fetchEquipmentCalibrations,
} from '../../services/controlsService.js';

export default function Controls() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [todayControls, setTodayControls] = useState([]);
  const [equipments, setEquipments] = useState([]);
  const [form, setForm] = useState({
    controlType: 'temperature_frigo',
    shift: 'matin',
    value: '',
    notes: '',
    isCompliant: true,
  });

  const selectedType = CONTROL_TYPES.find(c => c.value === form.controlType);

  useEffect(() => {
    loadToday();
    loadEquipments();
  }, [user?.id]);

  const loadToday = async () => {
    if (!user?.id) return;
    const { data } = await fetchTodayControls(user.id);
    if (data) setTodayControls(data);
  };

  const loadEquipments = async () => {
    const { data } = await fetchEquipmentCalibrations();
    if (data) setEquipments(data);
  };

  const handleValueChange = (val) => {
    const num = parseFloat(val);
    let compliant = true;
    if (selectedType?.hasValue && !isNaN(num)) {
      compliant = num >= selectedType.min && num <= selectedType.max;
    }
    setForm({ ...form, value: val, isCompliant: compliant });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const { error } = await insertDailyControl(user.id, {
        controlType: form.controlType,
        shift: selectedType?.hasValue ? form.shift : null,
        value: form.value ? parseFloat(form.value) : null,
        isCompliant: form.isCompliant,
        notes: form.notes,
      });
      if (error) throw error;
      setSuccessMsg('Contrôle enregistré.');
      setForm({ ...form, value: '', notes: '', isCompliant: true });
      loadToday();
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err) {
      setErrorMsg(err.message || 'Erreur.');
    } finally {
      setLoading(false);
    }
  };

  const daysUntil = (dateStr) => {
    if (!dateStr) return null;
    return Math.ceil((new Date(dateStr) - new Date()) / (1000 * 60 * 60 * 24));
  };

  return (
    <div className="w-full h-full flex flex-col bg-slate-50 text-slate-800">
      <div className="px-6 py-4 border-b border-slate-200 bg-white flex items-center gap-2 shadow-sm">
        <ClipboardCheck className="text-teal-600" />
        <h2 className="font-bold text-xl">Contrôles Qualité</h2>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="w-1/2 p-6 overflow-y-auto border-r border-slate-200 bg-white">
          {equipments.length > 0 && (
            <div className="mb-6 space-y-2">
              {equipments.map(eq => {
                const days = daysUntil(eq.calibration_end_date);
                const urgent = days !== null && days <= 60;
                return (
                  <div key={eq.id} className={`p-3 rounded-lg border text-sm flex items-start gap-2 ${urgent ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-200'}`}>
                    <Scale size={16} className={urgent ? 'text-amber-600 mt-0.5' : 'text-slate-500 mt-0.5'} />
                    <div>
                      <p className="font-semibold">{eq.equipment_name}</p>
                      <p className="text-xs text-slate-600">Fin validité étalonnage : {new Date(eq.calibration_end_date).toLocaleDateString('fr-FR')}
                        {days !== null && ` (${days > 0 ? `dans ${days} j` : 'EXPIRÉ'})`}
                      </p>
                      {eq.next_visit_date && (
                        <p className="text-xs text-slate-500">Prochaine visite : {new Date(eq.next_visit_date).toLocaleDateString('fr-FR')}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {successMsg && (
            <div className="mb-4 p-3 bg-emerald-50 text-emerald-700 rounded-lg flex items-center gap-2 border border-emerald-200">
              <CheckCircle2 size={18} /> {successMsg}
            </div>
          )}
          {errorMsg && <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{errorMsg}</div>}

          <form onSubmit={handleSubmit} className="space-y-4 text-sm">
            <div>
              <label className="block font-semibold mb-1">Type de contrôle</label>
              <select value={form.controlType} onChange={e => setForm({ ...form, controlType: e.target.value, value: '' })}
                className="w-full p-2 border rounded-lg">
                {CONTROL_TYPES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>

            {selectedType?.hasValue && (
              <>
                <div>
                  <label className="block font-semibold mb-1">Créneau</label>
                  <select value={form.shift} onChange={e => setForm({ ...form, shift: e.target.value })} className="w-full p-2 border rounded-lg">
                    {SHIFTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold mb-1 flex items-center gap-1">
                    <Thermometer size={14} /> Température (°C)
                  </label>
                  <input type="number" step="0.1" required value={form.value} onChange={e => handleValueChange(e.target.value)}
                    className={`w-full p-2 border rounded-lg ${!form.isCompliant && form.value ? 'border-red-400 bg-red-50' : ''}`} />
                  {!form.isCompliant && form.value && (
                    <p className="text-red-600 text-xs mt-1 flex items-center gap-1">
                      <AlertTriangle size={12} /> Hors plage {selectedType.min}°C – {selectedType.max}°C
                    </p>
                  )}
                </div>
              </>
            )}

            {!selectedType?.hasValue && (
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.isCompliant} onChange={e => setForm({ ...form, isCompliant: e.target.checked })} />
                Contrôle conforme
              </label>
            )}

            <div>
              <label className="block font-semibold mb-1">Notes</label>
              <textarea rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
                className="w-full p-2 border rounded-lg" />
            </div>

            <button type="submit" disabled={loading} className="w-full bg-teal-600 hover:bg-teal-700 text-white font-bold py-3 rounded-lg flex justify-center gap-2">
              <Save size={18} /> {loading ? 'Enregistrement...' : 'Valider le contrôle'}
            </button>
          </form>
        </div>

        <div className="w-1/2 p-6 overflow-y-auto bg-slate-100">
          <h3 className="font-bold mb-4">Contrôles du jour</h3>
          {todayControls.length === 0 ? (
            <p className="text-slate-500 text-sm">Aucun contrôle aujourd'hui.</p>
          ) : todayControls.map(c => (
            <div key={c.id} className={`p-3 mb-2 rounded-lg border bg-white ${!c.is_compliant ? 'border-red-200' : 'border-slate-200'}`}>
              <div className="flex justify-between">
                <span className="font-medium text-sm">{CONTROL_TYPES.find(t => t.value === c.control_type)?.label || c.control_type}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${c.is_compliant ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                  {c.is_compliant ? 'Conforme' : 'Non conforme'}
                </span>
              </div>
              {c.value != null && <p className="text-sm text-slate-600 mt-1">{c.value}°C {c.shift && `(${c.shift})`}</p>}
              <p className="text-xs text-slate-400 mt-1">{new Date(c.created_at).toLocaleTimeString('fr-FR')}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
