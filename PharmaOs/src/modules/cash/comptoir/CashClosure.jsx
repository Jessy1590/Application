import React, { useState, useEffect } from 'react';
import { useAuth } from '../../../core/AuthContext.jsx';
import { Wallet, Save, CheckCircle2, History } from 'lucide-react';
import { submitCashClosure, fetchMyClosures, calcEcart } from '../services/cashService.js';

export default function CashClosure() {
  const { user, profile } = useAuth();
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const today = new Date().toISOString().split('T')[0];
  const [form, setForm] = useState({
    closure_date: today,
    fond_reel: '', fond_logiciel: '', montant_cb: '', argent_lieu_sur: '',
    nb_cheques: '0', montant_cheques: '', garde: false,
    sortie_particuliere: false, sortie_montant: '', sortie_motif: '', notes: '',
  });

  const load = async () => {
    if (!user?.id) return;
    try { setHistory(await fetchMyClosures(user.id)); } catch (e) { setErr(e.message); }
  };
  useEffect(() => { load(); }, [user?.id]);

  const ecart = calcEcart({ fond_reel: form.fond_reel, fond_logiciel: form.fond_logiciel });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true); setErr(''); setMsg('');
    try {
      await submitCashClosure(user.id, profile?.display_name, form);
      setMsg('Clôture enregistrée.');
      setForm({ ...form, fond_reel: '', fond_logiciel: '', montant_cb: '', argent_lieu_sur: '', nb_cheques: '0', montant_cheques: '', garde: false, sortie_particuliere: false, sortie_montant: '', sortie_motif: '', notes: '' });
      load();
    } catch (e2) { setErr(e2.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="w-full h-full flex bg-slate-50 text-slate-800">
      <div className="w-1/2 bg-white border-r p-6 overflow-y-auto">
        <h2 className="text-xl font-bold mb-2 flex items-center gap-2"><Wallet className="text-emerald-600" /> Clôture de caisse</h2>
        <p className="text-sm text-slate-500 mb-4">Une clôture par jour et par auteur.</p>
        {msg && <div className="mb-3 p-3 bg-emerald-50 text-emerald-700 rounded-lg text-sm flex gap-2"><CheckCircle2 size={16} /> {msg}</div>}
        {err && <div className="mb-3 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{err}</div>}
        <form onSubmit={handleSubmit} className="space-y-3 text-sm">
          <div>
            <label className="block font-semibold mb-1">Date *</label>
            <input type="date" required value={form.closure_date} onChange={(e) => setForm({ ...form, closure_date: e.target.value })} className="w-full p-2 border rounded-lg" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block font-semibold mb-1">Fond réel *</label>
              <input type="number" step="0.01" required value={form.fond_reel} onChange={(e) => setForm({ ...form, fond_reel: e.target.value })} className="w-full p-2 border rounded-lg" /></div>
            <div><label className="block font-semibold mb-1">Fond logiciel *</label>
              <input type="number" step="0.01" required value={form.fond_logiciel} onChange={(e) => setForm({ ...form, fond_logiciel: e.target.value })} className="w-full p-2 border rounded-lg" /></div>
          </div>
          <p className={`text-xs font-semibold ${ecart === 0 ? 'text-emerald-600' : 'text-amber-600'}`}>Écart : {ecart.toFixed(2)} €</p>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block font-semibold mb-1">Montant CB</label>
              <input type="number" step="0.01" value={form.montant_cb} onChange={(e) => setForm({ ...form, montant_cb: e.target.value })} className="w-full p-2 border rounded-lg" /></div>
            <div><label className="block font-semibold mb-1">Argent lieu sûr</label>
              <input type="number" step="0.01" value={form.argent_lieu_sur} onChange={(e) => setForm({ ...form, argent_lieu_sur: e.target.value })} className="w-full p-2 border rounded-lg" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block font-semibold mb-1">Nb chèques</label>
              <input type="number" value={form.nb_cheques} onChange={(e) => setForm({ ...form, nb_cheques: e.target.value })} className="w-full p-2 border rounded-lg" /></div>
            <div><label className="block font-semibold mb-1">Montant chèques</label>
              <input type="number" step="0.01" value={form.montant_cheques} onChange={(e) => setForm({ ...form, montant_cheques: e.target.value })} className="w-full p-2 border rounded-lg" /></div>
          </div>
          <label className="flex items-center gap-2"><input type="checkbox" checked={form.garde} onChange={(e) => setForm({ ...form, garde: e.target.checked })} /> Garde</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={form.sortie_particuliere} onChange={(e) => setForm({ ...form, sortie_particuliere: e.target.checked })} /> Sortie particulière</label>
          {form.sortie_particuliere && (
            <div className="grid grid-cols-2 gap-3">
              <input type="number" step="0.01" placeholder="Montant" value={form.sortie_montant} onChange={(e) => setForm({ ...form, sortie_montant: e.target.value })} className="p-2 border rounded-lg" />
              <input placeholder="Motif" value={form.sortie_motif} onChange={(e) => setForm({ ...form, sortie_motif: e.target.value })} className="p-2 border rounded-lg" />
            </div>
          )}
          <textarea rows={2} placeholder="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="w-full p-2 border rounded-lg" />
          <button type="submit" disabled={loading} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-lg flex justify-center gap-2">
            <Save size={18} /> {loading ? '...' : 'Enregistrer la clôture'}
          </button>
        </form>
      </div>
      <div className="w-1/2 p-6 overflow-y-auto">
        <h3 className="font-bold mb-4 flex items-center gap-2"><History size={18} /> Historique</h3>
        {history.map((h) => (
          <div key={h.id} className="bg-white border rounded-lg p-3 mb-2 text-sm">
            <div className="flex justify-between font-semibold">
              <span>{h.closure_date}</span>
              <span className={calcEcart(h) === 0 ? 'text-emerald-600' : 'text-amber-600'}>Écart {calcEcart(h).toFixed(2)} €</span>
            </div>
            <p className="text-xs text-slate-500">Réel {h.fond_reel} / Logiciel {h.fond_logiciel} — CB {h.montant_cb}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
