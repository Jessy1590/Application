import React, { useState, useEffect } from 'react';
import { useAuth } from '../../core/AuthContext';
import { PackageX, Save, CheckCircle2, History } from 'lucide-react';
import { declareStockError, fetchMyStockErrors } from '../../services/stockService.js';

const STATUS_LABELS = {
  ouvert: 'En attente admin',
  recompter: 'Recomptage demandé',
  erreur_commande: 'Erreur commande (validée)',
  cloture: 'Clôturé',
};

export default function StockError() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [history, setHistory] = useState([]);
  const [form, setForm] = useState({
    medicament: '', cip: '', quantite_theorique: '', quantite_constatee: '', description: '',
  });

  useEffect(() => { loadHistory(); }, [user?.id]);

  const loadHistory = async () => {
    if (!user?.id) return;
    const { data } = await fetchMyStockErrors(user.id);
    if (data) setHistory(data);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      await declareStockError(user.id, {
        medicament: form.medicament,
        cip: form.cip,
        quantite_theorique: form.quantite_theorique ? parseInt(form.quantite_theorique, 10) : null,
        quantite_constatee: form.quantite_constatee ? parseInt(form.quantite_constatee, 10) : null,
        description: form.description,
      });
      setSuccessMsg('Erreur déclarée — tâche envoyée à l\'admin.');
      setForm({ medicament: '', cip: '', quantite_theorique: '', quantite_constatee: '', description: '' });
      loadHistory();
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err) {
      setErrorMsg(err.message || 'Erreur.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full h-full flex bg-slate-50 text-slate-800">
      <div className="w-1/2 bg-white border-r border-slate-200 p-8 overflow-y-auto">
        <h2 className="text-2xl font-bold mb-2 flex items-center gap-2">
          <PackageX className="text-violet-600" /> Erreur de stock
        </h2>
        <p className="text-sm text-slate-500 mb-6">Déclare un écart. L'admin pourra demander un recomptage ou valider une erreur temporaire de commande.</p>

        {successMsg && (
          <div className="mb-4 p-3 bg-emerald-50 text-emerald-700 rounded-lg flex items-center gap-2 border border-emerald-200">
            <CheckCircle2 size={18} /> {successMsg}
          </div>
        )}
        {errorMsg && <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{errorMsg}</div>}

        <form onSubmit={handleSubmit} className="space-y-4 text-sm">
          <div>
            <label className="block font-semibold mb-1">Médicament *</label>
            <input required value={form.medicament} onChange={e => setForm({ ...form, medicament: e.target.value })} className="w-full p-2 border rounded-lg" />
          </div>
          <div>
            <label className="block font-semibold mb-1">CIP</label>
            <input value={form.cip} onChange={e => setForm({ ...form, cip: e.target.value })} className="w-full p-2 border rounded-lg" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold mb-1">Qté théorique (logiciel)</label>
              <input type="number" value={form.quantite_theorique} onChange={e => setForm({ ...form, quantite_theorique: e.target.value })} className="w-full p-2 border rounded-lg" />
            </div>
            <div>
              <label className="block font-semibold mb-1">Qté constatée</label>
              <input type="number" value={form.quantite_constatee} onChange={e => setForm({ ...form, quantite_constatee: e.target.value })} className="w-full p-2 border rounded-lg" />
            </div>
          </div>
          <div>
            <label className="block font-semibold mb-1">Description</label>
            <textarea rows={3} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
              className="w-full p-2 border rounded-lg" placeholder="Ex: écart après réception, doute sur une commande..." />
          </div>
          <button type="submit" disabled={loading} className="w-full bg-violet-600 hover:bg-violet-700 text-white font-bold py-3 rounded-lg flex justify-center gap-2">
            <Save size={18} /> {loading ? 'Envoi...' : 'Envoyer à l\'admin'}
          </button>
        </form>
      </div>

      <div className="w-1/2 bg-slate-100 p-8 overflow-y-auto">
        <h3 className="font-bold mb-4 flex items-center gap-2"><History size={18} /> Mes déclarations</h3>
        {history.length === 0 ? (
          <p className="text-slate-500 text-sm">Aucune déclaration.</p>
        ) : history.map(h => (
          <div key={h.id} className="bg-white p-4 rounded-lg border mb-3 text-sm">
            <div className="flex justify-between">
              <span className="font-bold">{h.medicament}</span>
              <span className="text-xs bg-slate-100 px-2 py-0.5 rounded">{STATUS_LABELS[h.status] || h.status}</span>
            </div>
            {(h.quantite_theorique != null || h.quantite_constatee != null) && (
              <p className="text-slate-600 mt-1">Théo: {h.quantite_theorique ?? '—'} / Constaté: {h.quantite_constatee ?? '—'}</p>
            )}
            {h.description && <p className="text-slate-500 text-xs mt-1">{h.description}</p>}
            <p className="text-xs text-slate-400 mt-2">{new Date(h.created_at).toLocaleString('fr-FR')}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
