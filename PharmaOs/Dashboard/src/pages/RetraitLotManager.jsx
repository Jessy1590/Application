import React, { useState } from 'react';
import { ArrowLeft, AlertOctagon, Save } from 'lucide-react';
import { useAuth } from '../core/AuthContext';
import { createRetraitLotTask } from '../services/documentService';

export default function RetraitLotManager({ onNavigate }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [form, setForm] = useState({ laboratoire: '', medicament: '', lot: '', motif: '' });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setSuccess('');
    try {
      await createRetraitLotTask(form, user.id);
      setSuccess('Alerte créée et assignée à toute l\'équipe.');
      setForm({ laboratoire: '', medicament: '', lot: '', motif: '' });
    } catch (err) {
      alert('Erreur : ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-2xl mx-auto w-full">
      <button onClick={() => onNavigate('dashboard')} className="flex items-center gap-2 text-slate-500 hover:text-red-600 mb-6 text-sm font-medium">
        <ArrowLeft size={16} /> Retour au Dashboard
      </button>

      <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2 mb-2">
        <AlertOctagon className="text-red-600" /> Alerte Sanitaire — Retrait de Lot
      </h1>
      <p className="text-sm text-slate-500 mb-6">Génère une tâche urgente assignée à toute l'équipe pour vérification et mise en quarantaine.</p>

      {success && (
        <div className="mb-4 p-3 bg-emerald-50 text-emerald-700 rounded-lg border border-emerald-200 text-sm">{success}</div>
      )}

      <form onSubmit={handleSubmit} className="bg-white p-6 rounded-xl border border-red-200 shadow-sm space-y-4">
        <div>
          <label className="block font-semibold mb-1 text-sm">Laboratoire / Émetteur</label>
          <input required value={form.laboratoire} onChange={e => setForm({ ...form, laboratoire: e.target.value })} className="w-full p-2 border rounded-lg" />
        </div>
        <div>
          <label className="block font-semibold mb-1 text-sm">Médicament *</label>
          <input required value={form.medicament} onChange={e => setForm({ ...form, medicament: e.target.value })} className="w-full p-2 border rounded-lg" />
        </div>
        <div>
          <label className="block font-semibold mb-1 text-sm">N° de lot *</label>
          <input required value={form.lot} onChange={e => setForm({ ...form, lot: e.target.value })} className="w-full p-2 border rounded-lg" />
        </div>
        <div>
          <label className="block font-semibold mb-1 text-sm">Motif du retrait</label>
          <textarea required rows={3} value={form.motif} onChange={e => setForm({ ...form, motif: e.target.value })} className="w-full p-2 border rounded-lg" />
        </div>
        <button type="submit" disabled={loading} className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-lg flex justify-center gap-2">
          <Save size={18} /> {loading ? 'Création...' : 'Créer l\'alerte et assigner à l\'équipe'}
        </button>
      </form>
    </div>
  );
}
