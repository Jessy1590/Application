import React, { useState, useEffect } from 'react';
import { ArrowLeft, Package, Send } from 'lucide-react';
import { useAuth } from '../core/AuthContext';
import { fetchPerimes, updatePerimeStatus, createMonthlyPerimesTask } from '../services/perimesService';

const STATUS_COLORS = {
  actif: 'bg-orange-100 text-orange-800',
  mis_en_avant: 'bg-amber-100 text-amber-800',
  promo: 'bg-emerald-100 text-emerald-800',
  retire: 'bg-slate-100 text-slate-600',
};

export default function PerimesManager({ onNavigate }) {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState('soon');
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      setItems(await fetchPerimes());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const in3Months = () => {
    const today = new Date();
    const end = new Date();
    end.setMonth(end.getMonth() + 3);
    return items.filter(p => {
      if (p.status !== 'actif') return false;
      const d = new Date(p.date_peremption);
      return d >= today && d <= end;
    });
  };

  const displayed = filter === 'soon' ? in3Months()
    : filter === 'all' ? items
    : items.filter(p => p.status === filter);

  const launchMonthlyTask = async () => {
    setMsg('');
    try {
      const { count } = await createMonthlyPerimesTask(user.id);
      setMsg(`Tâche créée pour l'équipe (${count} produit(s) à traiter).`);
    } catch (e) {
      alert(e.message);
    }
  };

  if (loading) return <div className="p-8 text-slate-500">Chargement...</div>;

  return (
    <div className="p-8 max-w-7xl mx-auto w-full">
      <button onClick={() => onNavigate('dashboard')} className="flex items-center gap-2 text-slate-500 hover:text-orange-600 mb-6 text-sm font-medium">
        <ArrowLeft size={16} /> Retour
      </button>

      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2"><Package className="text-orange-600" /> Gestionnaire de périmés</h1>
        <button onClick={launchMonthlyTask} className="bg-orange-600 text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2 hover:bg-orange-700">
          <Send size={16} /> Tâche mensuelle équipe
        </button>
      </div>

      {msg && <p className="mb-4 text-sm text-emerald-700 bg-emerald-50 p-3 rounded-lg">{msg}</p>}

      <div className="flex gap-2 mb-4">
        {[
          { id: 'soon', label: 'À 3 mois (actifs)' },
          { id: 'all', label: 'Tous' },
          { id: 'mis_en_avant', label: 'En avant' },
          { id: 'promo', label: 'Promo' },
          { id: 'retire', label: 'Retirés' },
        ].map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)}
            className={`px-3 py-1.5 rounded-lg text-sm ${filter === f.id ? 'bg-slate-800 text-white' : 'bg-white border text-slate-600'}`}>
            {f.label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 border-b">
            <tr>
              <th className="p-4">Médicament</th>
              <th className="p-4">Péremption</th>
              <th className="p-4">Qté</th>
              <th className="p-4">Source</th>
              <th className="p-4">Statut</th>
              <th className="p-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {displayed.map(p => (
              <tr key={p.id} className="hover:bg-slate-50">
                <td className="p-4 font-medium">{p.medicament} {p.lot && <span className="text-xs text-slate-400">Lot {p.lot}</span>}</td>
                <td className="p-4">{new Date(p.date_peremption).toLocaleDateString('fr-FR')}</td>
                <td className="p-4">{p.quantite}</td>
                <td className="p-4 capitalize">{p.source}</td>
                <td className="p-4"><span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[p.status]}`}>{p.status}</span></td>
                <td className="p-4 text-right space-x-1">
                  {p.status === 'actif' && (
                    <>
                      <button onClick={() => updatePerimeStatus(p.id, 'mis_en_avant').then(load)} className="text-xs px-2 py-1 bg-amber-50 rounded">En avant</button>
                      <button onClick={() => updatePerimeStatus(p.id, 'promo').then(load)} className="text-xs px-2 py-1 bg-emerald-50 rounded">Promo</button>
                    </>
                  )}
                  <button onClick={() => updatePerimeStatus(p.id, 'retire').then(load)} className="text-xs px-2 py-1 bg-slate-100 rounded">Retirer</button>
                </td>
              </tr>
            ))}
            {displayed.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-slate-500">Aucun produit.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
