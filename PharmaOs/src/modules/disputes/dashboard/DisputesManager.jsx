import React, { useState, useEffect } from 'react';
import { ArrowLeft, Scale, Clock, X } from 'lucide-react';
import { useAuth } from '../../../core/AuthContext.jsx';
import {
  DISPUTE_TYPES,
  fetchDisputes,
  updateDisputeStatus,
  cancelPendingDisputeTask,
  completePendingDisputeTask,
} from '../services/disputeService.js';

const COLUMNS = [
  { key: 'en_attente', label: 'En attente' },
  { key: 'ouvert', label: 'Ouvert' },
  { key: 'en_cours', label: 'En cours' },
  { key: 'clos', label: 'Clos' },
];

export default function DisputesManager({ onNavigate }) {
  const { user, profile } = useAuth();
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState('');

  const load = async () => setItems(await fetchDisputes());
  useEffect(() => { load().catch((e) => alert(e.message)); }, []);

  const filtered = (filter ? items.filter((i) => i.dispute_type === filter) : items)
    .filter((i) => i.statut !== 'annule');

  const moveStatus = async (d, nextStatut) => {
    const prev = d.statut;
    await updateDisputeStatus(d.id, nextStatut);
    if (prev === 'en_attente' && nextStatut === 'ouvert') {
      await completePendingDisputeTask(d.id, profile?.display_name || user?.email);
    }
    if (prev === 'en_attente' && nextStatut === 'annule') {
      await cancelPendingDisputeTask(d.id, profile?.display_name || user?.email);
    }
    await load();
  };

  return (
    <div className="p-8 max-w-6xl mx-auto w-full">
      <button type="button" onClick={() => onNavigate('dashboard')} className="flex items-center gap-2 text-slate-500 hover:text-amber-600 mb-6 text-sm font-medium">
        <ArrowLeft size={16} /> Retour
      </button>
      <h1 className="text-2xl font-bold flex items-center gap-2 mb-2"><Scale className="text-amber-600" /> Litiges fournisseurs</h1>
      <div className="flex gap-2 mb-6 flex-wrap">
        <button type="button" onClick={() => setFilter('')} className={`px-3 py-1 rounded-lg text-sm ${!filter ? 'bg-amber-600 text-white' : 'bg-white border'}`}>Tous</button>
        {DISPUTE_TYPES.map((t) => (
          <button key={t.value} type="button" onClick={() => setFilter(t.value)} className={`px-3 py-1 rounded-lg text-sm ${filter === t.value ? 'bg-amber-600 text-white' : 'bg-white border'}`}>{t.label}</button>
        ))}
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
        {COLUMNS.map((col) => (
          <div key={col.key} className="bg-slate-50 rounded-xl border p-3 min-h-[200px]">
            <h2 className="font-semibold text-sm mb-3 flex items-center gap-1.5">
              {col.key === 'en_attente' && <Clock size={14} className="text-amber-600" />}
              {col.label} ({filtered.filter((i) => i.statut === col.key).length})
            </h2>
            <div className="space-y-2">
              {filtered.filter((i) => i.statut === col.key).map((d) => (
                <div key={d.id} className={`bg-white p-3 rounded-lg border text-sm shadow-sm ${col.key === 'en_attente' ? 'border-amber-200' : ''}`}>
                  <p className="font-bold">{DISPUTE_TYPES.find((t) => t.value === d.dispute_type)?.label}</p>
                  <p className="text-slate-600">{d.fournisseur_nom || '—'}</p>
                  {d.montant != null && <p className="text-xs">{d.montant} €</p>}
                  <p className="text-xs text-slate-400 mt-1 line-clamp-2">{d.description}</p>
                  <div className="flex gap-1 mt-2 flex-wrap">
                    {col.key === 'en_attente' && (
                      <>
                        <button
                          type="button"
                          onClick={() => moveStatus(d, 'ouvert')}
                          className="text-xs px-2 py-1 bg-amber-100 text-amber-800 rounded"
                        >
                          Valider
                        </button>
                        <button
                          type="button"
                          onClick={() => moveStatus(d, 'annule')}
                          className="text-xs px-2 py-1 bg-slate-100 text-slate-600 rounded flex items-center gap-1"
                        >
                          <X size={12} /> Annuler
                        </button>
                      </>
                    )}
                    {col.key === 'ouvert' && (
                      <button type="button" onClick={() => moveStatus(d, 'en_cours')} className="text-xs px-2 py-1 bg-sky-100 text-sky-700 rounded">En cours</button>
                    )}
                    {(col.key === 'ouvert' || col.key === 'en_cours') && (
                      <button type="button" onClick={() => moveStatus(d, 'clos')} className="text-xs px-2 py-1 bg-emerald-100 text-emerald-700 rounded">Clôturer</button>
                    )}
                    {col.key === 'clos' && (
                      <button type="button" onClick={() => moveStatus(d, 'ouvert')} className="text-xs px-2 py-1 bg-slate-100 rounded">Rouvrir</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
