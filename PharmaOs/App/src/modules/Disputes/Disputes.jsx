import React, { useState, useEffect } from 'react';
import { useAuth } from '../../core/AuthContext';
import { Scale, Save, CheckCircle2, History } from 'lucide-react';
import { DISPUTE_TYPES, createDispute, fetchMyDisputes, fetchCommercialPartners } from '../../services/disputeService.js';

export default function Disputes() {
  const { user } = useAuth();
  const [partners, setPartners] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [form, setForm] = useState({
    dispute_type: 'commande', fournisseur_id: '', fournisseur_nom: '', montant: '', description: '', pieces: '',
  });

  const load = async () => {
    if (!user?.id) return;
    try {
      setPartners(await fetchCommercialPartners());
      setHistory(await fetchMyDisputes(user.id));
    } catch (e) { setErr(e.message); }
  };
  useEffect(() => { load(); }, [user?.id]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true); setErr(''); setMsg('');
    try {
      const partner = partners.find((p) => p.id === form.fournisseur_id);
      await createDispute(user.id, {
        ...form,
        fournisseur_nom: form.fournisseur_nom || partner?.nom || null,
        montant: form.montant ? Number(form.montant) : null,
      });
      setMsg('Litige déclaré.');
      setForm({ dispute_type: 'commande', fournisseur_id: '', fournisseur_nom: '', montant: '', description: '', pieces: '' });
      load();
    } catch (e2) { setErr(e2.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="w-full h-full flex bg-slate-50 text-slate-800">
      <div className="w-1/2 bg-white border-r p-6 overflow-y-auto">
        <h2 className="text-xl font-bold mb-2 flex items-center gap-2"><Scale className="text-amber-600" /> Litige fournisseur</h2>
        <p className="text-sm text-slate-500 mb-4">Déclaration rapide (commande, facture, périmé, challenge…).</p>
        {msg && <div className="mb-3 p-3 bg-emerald-50 text-emerald-700 rounded-lg flex gap-2 text-sm"><CheckCircle2 size={16} /> {msg}</div>}
        {err && <div className="mb-3 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{err}</div>}
        <form onSubmit={handleSubmit} className="space-y-3 text-sm">
          <div>
            <label className="block font-semibold mb-1">Type *</label>
            <select required value={form.dispute_type} onChange={(e) => setForm({ ...form, dispute_type: e.target.value })} className="w-full p-2 border rounded-lg">
              {DISPUTE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block font-semibold mb-1">Fournisseur (annuaire)</label>
            <select value={form.fournisseur_id} onChange={(e) => setForm({ ...form, fournisseur_id: e.target.value })} className="w-full p-2 border rounded-lg">
              <option value="">— Libre / saisir nom —</option>
              {partners.map((p) => <option key={p.id} value={p.id}>{p.nom}{p.prenom ? ` — ${p.prenom}` : ''}</option>)}
            </select>
          </div>
          {!form.fournisseur_id && (
            <div>
              <label className="block font-semibold mb-1">Nom fournisseur</label>
              <input value={form.fournisseur_nom} onChange={(e) => setForm({ ...form, fournisseur_nom: e.target.value })} className="w-full p-2 border rounded-lg" />
            </div>
          )}
          <div>
            <label className="block font-semibold mb-1">Montant (€)</label>
            <input type="number" step="0.01" value={form.montant} onChange={(e) => setForm({ ...form, montant: e.target.value })} className="w-full p-2 border rounded-lg" />
          </div>
          <div>
            <label className="block font-semibold mb-1">Description *</label>
            <textarea required rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full p-2 border rounded-lg" />
          </div>
          <div>
            <label className="block font-semibold mb-1">Pièces / liens</label>
            <textarea rows={2} value={form.pieces} onChange={(e) => setForm({ ...form, pieces: e.target.value })} className="w-full p-2 border rounded-lg" placeholder="N° facture, URL…" />
          </div>
          <button type="submit" disabled={loading} className="w-full bg-amber-600 hover:bg-amber-700 text-white font-bold py-3 rounded-lg flex justify-center gap-2">
            <Save size={18} /> {loading ? 'Envoi...' : 'Déclarer le litige'}
          </button>
        </form>
      </div>
      <div className="w-1/2 p-6 overflow-y-auto">
        <h3 className="font-bold mb-4 flex items-center gap-2"><History size={18} /> Mes litiges</h3>
        {history.length === 0 ? <p className="text-slate-500 text-sm">Aucun litige.</p> : history.map((h) => (
          <div key={h.id} className="bg-white p-4 rounded-lg border mb-3 text-sm">
            <div className="flex justify-between">
              <span className="font-bold">{DISPUTE_TYPES.find((t) => t.value === h.dispute_type)?.label || h.dispute_type}</span>
              <span className="text-xs bg-slate-100 px-2 py-0.5 rounded capitalize">{h.statut}</span>
            </div>
            <p className="text-slate-600 mt-1">{h.fournisseur_nom || '—'}</p>
            {h.montant != null && <p className="text-xs text-slate-500">{h.montant} €</p>}
            <p className="text-xs text-slate-400 mt-2">{new Date(h.created_at).toLocaleString('fr-FR')}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
