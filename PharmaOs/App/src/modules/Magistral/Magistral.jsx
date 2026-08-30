import React, { useState, useEffect } from 'react';
import { useAuth } from '../../core/AuthContext';
import { FlaskConical, Save, CheckCircle2, Send, PackageCheck } from 'lucide-react';
import {
  fetchProviders, fetchPriceRules, createMagistralOrder, sendMagistralOrder,
  fetchMyOrders, markOrderReceived, calcMagistralPrice,
} from '../../services/magistralService.js';

export default function Magistral() {
  const { user } = useAuth();
  const [providers, setProviders] = useState([]);
  const [rules, setRules] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [form, setForm] = useState({
    provider_id: '', price_rule_id: '', formule: '', patient_initiales: '', quantite: '1', notes: '',
  });

  const load = async () => {
    if (!user?.id) return;
    try {
      setProviders(await fetchProviders());
      setRules(await fetchPriceRules());
      setOrders(await fetchMyOrders(user.id));
    } catch (e) { setErr(e.message); }
  };
  useEffect(() => { load(); }, [user?.id]);

  const rule = rules.find((r) => r.id === form.price_rule_id);
  const prix = calcMagistralPrice(rule, form.quantite);

  const handleCreate = async (e) => {
    e.preventDefault();
    setLoading(true); setErr(''); setMsg('');
    try {
      const order = await createMagistralOrder(user.id, {
        ...form,
        quantite: Number(form.quantite) || 1,
        price_rule: rule,
      });
      const provider = providers.find((p) => p.id === form.provider_id);
      if (provider?.email) {
        const html = `<h2>Préparation magistrale</h2><p>Patient: ${form.patient_initiales || '—'}</p><pre>${form.formule.replace(/</g, '&lt;')}</pre><p>Qté: ${form.quantite} — Prix: ${order.prix_calcule} €</p>`;
        await sendMagistralOrder(order.id, provider.email, html);
        setMsg('Commande créée et e-mail envoyé au prestataire.');
      } else {
        setMsg('Commande enregistrée (brouillon — pas d\'e-mail prestataire).');
      }
      setForm({ provider_id: '', price_rule_id: '', formule: '', patient_initiales: '', quantite: '1', notes: '' });
      load();
    } catch (e2) { setErr(e2.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="w-full h-full flex bg-slate-50 text-slate-800">
      <div className="w-1/2 bg-white border-r p-6 overflow-y-auto">
        <h2 className="text-xl font-bold mb-2 flex items-center gap-2"><FlaskConical className="text-fuchsia-600" /> Préparation magistrale</h2>
        {msg && <div className="mb-3 p-3 bg-emerald-50 text-emerald-700 rounded-lg text-sm flex gap-2"><CheckCircle2 size={16} /> {msg}</div>}
        {err && <div className="mb-3 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{err}</div>}
        <form onSubmit={handleCreate} className="space-y-3 text-sm">
          <div>
            <label className="block font-semibold mb-1">Prestataire</label>
            <select value={form.provider_id} onChange={(e) => setForm({ ...form, provider_id: e.target.value })} className="w-full p-2 border rounded-lg">
              <option value="">—</option>
              {providers.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.email})</option>)}
            </select>
          </div>
          <div>
            <label className="block font-semibold mb-1">Règle tarifaire</label>
            <select value={form.price_rule_id} onChange={(e) => setForm({ ...form, price_rule_id: e.target.value })} className="w-full p-2 border rounded-lg">
              <option value="">—</option>
              {rules.map((r) => <option key={r.id} value={r.id}>{r.name} — base {r.base_price}€ × {r.coefficient}</option>)}
            </select>
            {rule && <p className="text-xs text-fuchsia-700 mt-1">Prix calculé : <strong>{prix} €</strong></p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold mb-1">Initiales patient</label>
              <input value={form.patient_initiales} onChange={(e) => setForm({ ...form, patient_initiales: e.target.value })} className="w-full p-2 border rounded-lg" />
            </div>
            <div>
              <label className="block font-semibold mb-1">Quantité</label>
              <input type="number" step="0.01" value={form.quantite} onChange={(e) => setForm({ ...form, quantite: e.target.value })} className="w-full p-2 border rounded-lg" />
            </div>
          </div>
          <div>
            <label className="block font-semibold mb-1">Formule *</label>
            <textarea required rows={5} value={form.formule} onChange={(e) => setForm({ ...form, formule: e.target.value })} className="w-full p-2 border rounded-lg font-mono text-xs" />
          </div>
          <button type="submit" disabled={loading} className="w-full bg-fuchsia-600 hover:bg-fuchsia-700 text-white font-bold py-3 rounded-lg flex justify-center gap-2">
            <Send size={18} /> {loading ? 'Envoi...' : 'Créer et envoyer'}
          </button>
        </form>
      </div>
      <div className="w-1/2 p-6 overflow-y-auto">
        <h3 className="font-bold mb-4">Mes commandes</h3>
        {orders.map((o) => (
          <div key={o.id} className="bg-white border rounded-lg p-3 mb-3 text-sm">
            <div className="flex justify-between">
              <span className="font-bold">{o.patient_initiales || '—'} — {o.prix_calcule ?? '—'} €</span>
              <span className="text-xs bg-slate-100 px-2 py-0.5 rounded capitalize">{o.statut}</span>
            </div>
            <p className="text-xs text-slate-500 mt-1 line-clamp-2">{o.formule}</p>
            {['envoye', 'en_cours'].includes(o.statut) && (
              <button type="button" onClick={async () => { await markOrderReceived(o.id); load(); }}
                className="mt-2 text-xs flex items-center gap-1 text-emerald-700 hover:underline">
                <PackageCheck size={14} /> Marquer reçu
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
