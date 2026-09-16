import React, { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, PackageX } from 'lucide-react';
import { useAuth } from '../../../core/AuthContext.jsx';
import {
  fetchStockErrors,
  resolveStockError,
  closeStockErrorAfterRecount,
  STOCK_STATUS_LABELS,
} from '../services/stockService.js';
import { useRealtimeRefresh } from '../../../shared/useRealtimeRefresh.js';

const STATUS_FILTERS = [
  { id: 'all', label: 'Toutes' },
  { id: 'ouvert', label: 'Ouvertes' },
  { id: 'recompter', label: 'Recomptage' },
  { id: 'attente_admin', label: 'À corriger' },
  { id: 'erreur_commande', label: 'Err. commande' },
  { id: 'erreur_reception', label: 'Err. réception' },
  { id: 'cloture', label: 'Clôturées' },
];

export default function StockErrorManager({ onNavigate }) {
  const { user } = useAuth();
  const [errors, setErrors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState({});
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setErrors(await fetchStockErrors());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useRealtimeRefresh(load, { tables: ['stock_errors', 'tasks', 'task_assignments'] });

  const handleDecision = async (id, decision) => {
    try {
      await resolveStockError(id, decision, notes[id] || '', user.id);
      load();
    } catch (e) {
      alert(e.message);
    }
  };

  const handleClose = async (id) => {
    try {
      await closeStockErrorAfterRecount(id, notes[id] || '', user.id);
      load();
    } catch (e) {
      alert(e.message);
    }
  };

  if (loading && errors.length === 0) return <div className="p-8 text-slate-500">Chargement...</div>;

  const open = errors.filter((e) => e.status === 'ouvert');
  const pendingAdmin = errors.filter((e) => e.status === 'attente_admin');
  const filtered = errors.filter((e) => {
    if (statusFilter !== 'all' && e.status !== statusFilter) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      return (
        (e.medicament || '').toLowerCase().includes(q)
        || (e.cip || '').toLowerCase().includes(q)
        || (e.author_name || '').toLowerCase().includes(q)
        || (e.description || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="p-8 max-w-5xl mx-auto w-full">
      <button type="button" onClick={() => onNavigate('dashboard')} className="flex items-center gap-2 text-slate-500 hover:text-violet-600 mb-6 text-sm font-medium">
        <ArrowLeft size={16} /> Retour
      </button>

      <h1 className="text-2xl font-bold flex items-center gap-2 mb-2">
        <PackageX className="text-violet-600" /> Erreurs de stock
      </h1>
      <p className="text-sm text-slate-500 mb-6">
        Décidez : recomptage, erreur de commande, ou erreur de réception. Après recomptage, corrigez le stock logiciel puis clôturez.
      </p>

      <h2 className="font-semibold mb-3">À traiter ({open.length})</h2>
      <div className="space-y-4 mb-8">
        {open.length === 0 && <p className="text-slate-500 text-sm">Aucune erreur en attente.</p>}
        {open.map((e) => (
          <div key={e.id} className="bg-white p-5 rounded-xl border border-violet-100 shadow-sm">
            <div className="flex justify-between mb-2 gap-4">
              <div>
                <p className="font-bold text-lg">{e.medicament}</p>
                <p className="text-xs text-slate-400">Par {e.author_name} — {new Date(e.created_at).toLocaleString('fr-FR')}</p>
                {e.cip && <p className="text-xs text-slate-500">CIP {e.cip}</p>}
              </div>
              <div className="text-sm text-right shrink-0">
                <p>Stock théorique (logiciel) : <strong>{e.quantite_theorique ?? '—'}</strong></p>
                <p>Stock officiel / constaté : <strong>{e.quantite_constatee ?? '—'}</strong></p>
              </div>
            </div>
            {e.description && <p className="text-sm text-slate-600 mb-3">{e.description}</p>}
            <input
              placeholder="Note admin (optionnel)"
              value={notes[e.id] || ''}
              onChange={(ev) => setNotes({ ...notes, [e.id]: ev.target.value })}
              className="w-full p-2 border rounded-lg text-sm mb-3"
            />
            <div className="flex gap-2 flex-wrap">
              <button type="button" onClick={() => handleDecision(e.id, 'recompter')} className="flex-1 min-w-[140px] bg-amber-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-amber-700">
                Demander un recomptage
              </button>
              <button type="button" onClick={() => handleDecision(e.id, 'erreur_commande')} className="flex-1 min-w-[140px] bg-emerald-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-emerald-700">
                Erreur de commande
              </button>
              <button type="button" onClick={() => handleDecision(e.id, 'erreur_reception')} className="flex-1 min-w-[140px] bg-rose-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-rose-700">
                Erreur de réception
              </button>
            </div>
          </div>
        ))}
      </div>

      <h2 className="font-semibold mb-3">Après recomptage — corriger le stock ({pendingAdmin.length})</h2>
      <div className="space-y-4 mb-8">
        {pendingAdmin.length === 0 && <p className="text-slate-500 text-sm">Aucun recomptage en attente de correction.</p>}
        {pendingAdmin.map((e) => (
          <div key={e.id} className="bg-white p-5 rounded-xl border border-amber-200 shadow-sm">
            <p className="font-bold text-lg">{e.medicament}</p>
            <p className="text-sm mt-1">
              Théorique initial : <strong>{e.quantite_theorique ?? '—'}</strong>
              {' · '}
              Qté finale recomptée : <strong className="text-violet-700">{e.quantite_constatee ?? '—'}</strong>
            </p>
            {e.admin_notes && <p className="text-xs text-slate-600 mt-2 whitespace-pre-wrap">{e.admin_notes}</p>}
            <p className="text-xs text-amber-800 mt-2 font-medium">Modifiez le stock dans le logiciel métier, puis clôturez.</p>
            <input
              placeholder="Note de clôture (optionnel)"
              value={notes[e.id] || ''}
              onChange={(ev) => setNotes({ ...notes, [e.id]: ev.target.value })}
              className="w-full p-2 border rounded-lg text-sm my-3"
            />
            <button type="button" onClick={() => handleClose(e.id)} className="w-full bg-violet-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-violet-700">
              Stock corrigé — clôturer
            </button>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <h2 className="font-semibold mr-2">Historique complet</h2>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filtrer médicament / CIP / auteur…"
          className="px-3 py-1.5 border rounded-lg text-sm flex-1 min-w-[180px]"
        />
      </div>
      <div className="flex gap-2 mb-4 flex-wrap">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setStatusFilter(f.id)}
            className={`px-3 py-1 rounded-lg text-sm ${statusFilter === f.id ? 'bg-violet-600 text-white' : 'bg-white border'}`}
          >
            {f.label}
          </button>
        ))}
      </div>
      <div className="bg-white rounded-xl border overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-50 border-b">
            <tr>
              <th className="p-3">Date</th>
              <th className="p-3">Médicament</th>
              <th className="p-3">Théo / Final</th>
              <th className="p-3">Statut</th>
              <th className="p-3">Auteur</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.map((e) => (
              <tr key={e.id}>
                <td className="p-3 whitespace-nowrap">{new Date(e.created_at).toLocaleDateString('fr-FR')}</td>
                <td className="p-3 font-medium">
                  {e.medicament}
                  {e.cip && <span className="block text-xs text-slate-400">{e.cip}</span>}
                </td>
                <td className="p-3">{e.quantite_theorique ?? '—'} / {e.quantite_constatee ?? '—'}</td>
                <td className="p-3">{STOCK_STATUS_LABELS[e.status] || e.status}</td>
                <td className="p-3 text-slate-500">{e.author_name}</td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-slate-500">Aucune erreur pour ce filtre</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
