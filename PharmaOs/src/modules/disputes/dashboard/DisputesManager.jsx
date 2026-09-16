import React, { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Scale, Clock, X, Pencil, Plus, Save } from 'lucide-react';
import { useAuth } from '../../../core/AuthContext.jsx';
import {
  DISPUTE_TYPES,
  DISPUTE_FORM_DEFAULTS,
  fetchDisputes,
  updateDisputeStatus,
  updateDispute,
  createDispute,
  fetchCommercialPartners,
  cancelPendingDisputeTask,
  completePendingDisputeTask,
  disputeRowToForm,
} from '../services/disputeService.js';
import DisputeForm from '../shared/DisputeForm.jsx';
import { useRealtimeRefresh } from '../../../shared/useRealtimeRefresh.js';

const COLUMNS = [
  { key: 'en_attente', label: 'En attente' },
  { key: 'ouvert', label: 'Ouvert' },
  { key: 'en_cours', label: 'En cours' },
  { key: 'clos', label: 'Clos' },
];

function originLabel(d) {
  if (d.perime_id) return 'Depuis un périmé';
  if (d.lot_alert_id) return 'Depuis une alerte lot';
  if (d.stock_error_id) return 'Depuis une erreur stock';
  return 'Saisie manuelle / appel';
}

export default function DisputesManager({ onNavigate }) {
  const { user, profile } = useAuth();
  const [items, setItems] = useState([]);
  const [partners, setPartners] = useState([]);
  const [filter, setFilter] = useState('');
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(DISPUTE_FORM_DEFAULTS);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [list, parts] = await Promise.all([fetchDisputes(), fetchCommercialPartners()]);
    setItems(list);
    setPartners(parts);
  }, []);

  useEffect(() => { load().catch((e) => alert(e.message)); }, [load]);
  useRealtimeRefresh(load, { tables: ['supplier_disputes'] });

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

  const openEdit = (d) => {
    setCreating(false);
    setEditing(d);
    setForm({
      ...disputeRowToForm(d),
      _origin: originLabel(d),
      perime_id: d.perime_id,
      lot_alert_id: d.lot_alert_id,
      stock_error_id: d.stock_error_id,
    });
  };

  const openCreate = () => {
    setEditing(null);
    setCreating(true);
    setForm({ ...DISPUTE_FORM_DEFAULTS, _origin: 'Saisie dashboard' });
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const partner = partners.find((p) => p.id === form.fournisseur_id);
      const payload = {
        ...form,
        fournisseur_nom: form.fournisseur_id
          ? (partner ? `${partner.nom}${partner.prenom ? ` — ${partner.prenom}` : ''}` : form.fournisseur_nom)
          : form.fournisseur_nom,
      };
      if (editing) {
        await updateDispute(editing.id, payload);
      } else {
        await createDispute(user.id, payload, 'ouvert');
      }
      setEditing(null);
      setCreating(false);
      await load();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-8 max-w-6xl mx-auto w-full">
      <button type="button" onClick={() => onNavigate('dashboard')} className="flex items-center gap-2 text-slate-500 hover:text-amber-600 mb-6 text-sm font-medium">
        <ArrowLeft size={16} /> Retour
      </button>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
        <h1 className="text-2xl font-bold flex items-center gap-2"><Scale className="text-amber-600" /> Litiges fournisseurs</h1>
        <button type="button" onClick={openCreate} className="flex items-center gap-2 px-3 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium">
          <Plus size={16} /> Ajouter un litige
        </button>
      </div>
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
                  <div className="flex justify-between gap-2 items-start">
                    <p className="font-bold">{DISPUTE_TYPES.find((t) => t.value === d.dispute_type)?.label}</p>
                    {d.statut !== 'clos' && (
                      <button type="button" onClick={() => openEdit(d)} className="p-1 text-slate-400 hover:text-amber-700" title="Modifier">
                        <Pencil size={14} />
                      </button>
                    )}
                    {d.statut === 'clos' && (
                      <button type="button" onClick={() => openEdit(d)} className="p-1 text-slate-400 hover:text-amber-700" title="Voir / modifier">
                        <Pencil size={14} />
                      </button>
                    )}
                  </div>
                  <p className="text-slate-600">{d.fournisseur_nom || '—'}</p>
                  {d.montant != null && <p className="text-xs">{d.montant} €</p>}
                  <p className="text-[10px] text-slate-400 mt-0.5">{originLabel(d)}</p>
                  <p className="text-xs text-slate-400 mt-1 line-clamp-2">{d.description}</p>
                  <div className="flex gap-1 mt-2 flex-wrap">
                    {col.key === 'en_attente' && (
                      <>
                        <button type="button" onClick={() => moveStatus(d, 'ouvert')} className="text-xs px-2 py-1 bg-amber-100 text-amber-800 rounded">Valider</button>
                        <button type="button" onClick={() => moveStatus(d, 'annule')} className="text-xs px-2 py-1 bg-slate-100 text-slate-600 rounded flex items-center gap-1">
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

      {(editing || creating) && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <form onSubmit={handleSave} className="bg-white rounded-xl p-6 max-w-lg w-full space-y-4 shadow-xl">
            <h3 className="font-bold text-lg flex items-center gap-2">
              <Scale size={18} className="text-amber-600" />
              {editing ? 'Modifier le litige' : 'Nouveau litige fournisseur'}
            </h3>
            <DisputeForm
              form={form}
              onChange={(patch) => setForm((f) => ({ ...f, ...patch }))}
              partners={partners}
              compact
            />
            <div className="flex gap-2">
              <button type="submit" disabled={saving} className="flex-1 bg-amber-600 text-white py-2 rounded-lg font-semibold flex items-center justify-center gap-2">
                <Save size={16} /> {saving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
              <button type="button" onClick={() => { setEditing(null); setCreating(false); }} className="px-4 border rounded-lg">Annuler</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
