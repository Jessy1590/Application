import React, { useState, useEffect } from 'react';
import { ArrowLeft, PackageX } from 'lucide-react';
import { useAuth } from '../../../core/AuthContext.jsx';
import { fetchStockErrors, resolveStockError } from '../services/stockService.js';

export default function StockErrorManager({ onNavigate }) {
  const { user } = useAuth();
  const [errors, setErrors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState({});

  const load = async () => {
    setLoading(true);
    try {
      setErrors(await fetchStockErrors());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleDecision = async (id, decision) => {
    try {
      await resolveStockError(id, decision, notes[id] || '', user.id);
      load();
    } catch (e) {
      alert(e.message);
    }
  };

  if (loading) return <div className="p-8 text-slate-500">Chargement...</div>;

  const open = errors.filter(e => e.status === 'ouvert');
  const others = errors.filter(e => e.status !== 'ouvert');

  return (
    <div className="p-8 max-w-5xl mx-auto w-full">
      <button onClick={() => onNavigate('dashboard')} className="flex items-center gap-2 text-slate-500 hover:text-violet-600 mb-6 text-sm font-medium">
        <ArrowLeft size={16} /> Retour
      </button>

      <h1 className="text-2xl font-bold flex items-center gap-2 mb-2">
        <PackageX className="text-violet-600" /> Erreurs de stock
      </h1>
      <p className="text-sm text-slate-500 mb-6">Décidez : demander un recomptage à l'équipe, ou valider une erreur temporaire de commande.</p>

      <h2 className="font-semibold mb-3">À traiter ({open.length})</h2>
      <div className="space-y-4 mb-8">
        {open.length === 0 && <p className="text-slate-500 text-sm">Aucune erreur en attente.</p>}
        {open.map(e => (
          <div key={e.id} className="bg-white p-5 rounded-xl border border-violet-100 shadow-sm">
            <div className="flex justify-between mb-2">
              <div>
                <p className="font-bold text-lg">{e.medicament}</p>
                <p className="text-xs text-slate-400">Par {e.author_name} — {new Date(e.created_at).toLocaleString('fr-FR')}</p>
              </div>
              {(e.quantite_theorique != null || e.quantite_constatee != null) && (
                <p className="text-sm">Théo <strong>{e.quantite_theorique ?? '—'}</strong> / Constaté <strong>{e.quantite_constatee ?? '—'}</strong></p>
              )}
            </div>
            {e.description && <p className="text-sm text-slate-600 mb-3">{e.description}</p>}
            <input
              placeholder="Note admin (optionnel)"
              value={notes[e.id] || ''}
              onChange={ev => setNotes({ ...notes, [e.id]: ev.target.value })}
              className="w-full p-2 border rounded-lg text-sm mb-3"
            />
            <div className="flex gap-2">
              <button onClick={() => handleDecision(e.id, 'recompter')} className="flex-1 bg-amber-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-amber-700">
                Demander un recomptage
              </button>
              <button onClick={() => handleDecision(e.id, 'erreur_commande')} className="flex-1 bg-emerald-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-emerald-700">
                Valider erreur de commande
              </button>
            </div>
          </div>
        ))}
      </div>

      <h2 className="font-semibold mb-3">Historique</h2>
      <div className="bg-white rounded-xl border overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-50 border-b">
            <tr>
              <th className="p-3">Date</th>
              <th className="p-3">Médicament</th>
              <th className="p-3">Décision</th>
              <th className="p-3">Par</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {others.map(e => (
              <tr key={e.id}>
                <td className="p-3">{new Date(e.created_at).toLocaleDateString('fr-FR')}</td>
                <td className="p-3 font-medium">{e.medicament}</td>
                <td className="p-3 capitalize">{e.admin_decision?.replace('_', ' ') || e.status}</td>
                <td className="p-3 text-slate-500">{e.author_name}</td>
              </tr>
            ))}
            {others.length === 0 && <tr><td colSpan={4} className="p-6 text-center text-slate-500">Vide</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
