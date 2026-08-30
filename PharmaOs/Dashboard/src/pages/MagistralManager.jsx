import React, { useState, useEffect } from 'react';
import { ArrowLeft, FlaskConical, Send, PackageCheck } from 'lucide-react';
import { useAuth } from '../core/AuthContext';
import {
  fetchProviders, upsertProvider, fetchPriceRules, upsertPriceRule,
  fetchOrders, createOrder, sendOrderEmail, markReceived, calcMagistralPrice,
} from '../services/magistralService';

export default function MagistralManager({ onNavigate }) {
  const { user } = useAuth();
  const [tab, setTab] = useState('orders');
  const [providers, setProviders] = useState([]);
  const [rules, setRules] = useState([]);
  const [orders, setOrders] = useState([]);
  const [provForm, setProvForm] = useState({ name: '', email: '', delai_jours: 5 });
  const [ruleForm, setRuleForm] = useState({ name: '', forme: '', base_price: '', coefficient: '1' });
  const [orderForm, setOrderForm] = useState({ provider_id: '', price_rule_id: '', formule: '', patient_initiales: '', quantite: '1' });
  const [msg, setMsg] = useState('');

  const load = async () => {
    setProviders(await fetchProviders());
    setRules(await fetchPriceRules());
    setOrders(await fetchOrders());
  };
  useEffect(() => { load().catch((e) => alert(e.message)); }, []);

  const rule = rules.find((r) => r.id === orderForm.price_rule_id);

  return (
    <div className="p-8 max-w-5xl mx-auto w-full">
      <button type="button" onClick={() => onNavigate('dashboard')} className="flex items-center gap-2 text-slate-500 hover:text-fuchsia-600 mb-6 text-sm font-medium">
        <ArrowLeft size={16} /> Retour
      </button>
      <h1 className="text-2xl font-bold flex items-center gap-2 mb-4"><FlaskConical className="text-fuchsia-600" /> Préparations magistrales</h1>
      {msg && <p className="mb-3 text-sm text-emerald-700 bg-emerald-50 p-2 rounded">{msg}</p>}

      <div className="flex gap-2 mb-6">
        {['orders', 'tarifs', 'prestataires'].map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)} className={`px-4 py-2 rounded-lg text-sm font-medium capitalize ${tab === t ? 'bg-fuchsia-600 text-white' : 'bg-white border'}`}>{t}</button>
        ))}
      </div>

      {tab === 'prestataires' && (
        <div className="grid md:grid-cols-2 gap-6">
          <form onSubmit={async (e) => { e.preventDefault(); await upsertProvider({ ...provForm, delai_jours: Number(provForm.delai_jours) || 5, actif: true }); setMsg('Prestataire enregistré'); setProvForm({ name: '', email: '', delai_jours: 5 }); load(); }} className="bg-white p-4 rounded-xl border space-y-3 text-sm">
            <input required placeholder="Nom" value={provForm.name} onChange={(e) => setProvForm({ ...provForm, name: e.target.value })} className="w-full p-2 border rounded-lg" />
            <input required type="email" placeholder="E-mail" value={provForm.email} onChange={(e) => setProvForm({ ...provForm, email: e.target.value })} className="w-full p-2 border rounded-lg" />
            <input type="number" placeholder="Délai (jours)" value={provForm.delai_jours} onChange={(e) => setProvForm({ ...provForm, delai_jours: e.target.value })} className="w-full p-2 border rounded-lg" />
            <button type="submit" className="w-full bg-fuchsia-600 text-white py-2 rounded-lg font-semibold">Ajouter</button>
          </form>
          <div className="bg-white rounded-xl border divide-y text-sm">{providers.map((p) => (
            <div key={p.id} className="p-3 flex justify-between"><span>{p.name}</span><span className="text-slate-500">{p.email}</span></div>
          ))}</div>
        </div>
      )}

      {tab === 'tarifs' && (
        <div className="grid md:grid-cols-2 gap-6">
          <form onSubmit={async (e) => {
            e.preventDefault();
            await upsertPriceRule({ name: ruleForm.name, forme: ruleForm.forme || null, base_price: Number(ruleForm.base_price) || 0, coefficient: Number(ruleForm.coefficient) || 1, actif: true });
            setMsg('Règle tarifaire enregistrée'); setRuleForm({ name: '', forme: '', base_price: '', coefficient: '1' }); load();
          }} className="bg-white p-4 rounded-xl border space-y-3 text-sm">
            <input required placeholder="Nom règle" value={ruleForm.name} onChange={(e) => setRuleForm({ ...ruleForm, name: e.target.value })} className="w-full p-2 border rounded-lg" />
            <input placeholder="Forme (crème, gélule…)" value={ruleForm.forme} onChange={(e) => setRuleForm({ ...ruleForm, forme: e.target.value })} className="w-full p-2 border rounded-lg" />
            <input type="number" step="0.01" placeholder="Prix de base" value={ruleForm.base_price} onChange={(e) => setRuleForm({ ...ruleForm, base_price: e.target.value })} className="w-full p-2 border rounded-lg" />
            <input type="number" step="0.0001" placeholder="Coefficient" value={ruleForm.coefficient} onChange={(e) => setRuleForm({ ...ruleForm, coefficient: e.target.value })} className="w-full p-2 border rounded-lg" />
            <button type="submit" className="w-full bg-fuchsia-600 text-white py-2 rounded-lg font-semibold">Ajouter règle</button>
          </form>
          <div className="bg-white rounded-xl border divide-y text-sm">{rules.map((r) => (
            <div key={r.id} className="p-3"><span className="font-medium">{r.name}</span> — {r.base_price}€ × {r.coefficient} {r.forme && `(${r.forme})`}</div>
          ))}</div>
        </div>
      )}

      {tab === 'orders' && (
        <div className="space-y-6">
          <form onSubmit={async (e) => {
            e.preventDefault();
            const order = await createOrder(user.id, { ...orderForm, quantite: Number(orderForm.quantite) || 1, price_rule: rule, forme: rule?.forme });
            const provider = providers.find((p) => p.id === orderForm.provider_id);
            if (provider?.email) {
              await sendOrderEmail(order, provider.email);
              setMsg('Commande envoyée par e-mail.');
            } else setMsg('Commande créée (brouillon).');
            setOrderForm({ provider_id: '', price_rule_id: '', formule: '', patient_initiales: '', quantite: '1' });
            load();
          }} className="bg-white p-4 rounded-xl border space-y-3 text-sm">
            <div className="grid md:grid-cols-2 gap-3">
              <select value={orderForm.provider_id} onChange={(e) => setOrderForm({ ...orderForm, provider_id: e.target.value })} className="p-2 border rounded-lg">
                <option value="">Prestataire</option>
                {providers.filter((p) => p.actif !== false).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <select value={orderForm.price_rule_id} onChange={(e) => setOrderForm({ ...orderForm, price_rule_id: e.target.value })} className="p-2 border rounded-lg">
                <option value="">Tarif</option>
                {rules.filter((r) => r.actif !== false).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
            {rule && <p className="text-xs text-fuchsia-700">Prix : {calcMagistralPrice(rule, orderForm.quantite)} €</p>}
            <input placeholder="Initiales patient" value={orderForm.patient_initiales} onChange={(e) => setOrderForm({ ...orderForm, patient_initiales: e.target.value })} className="w-full p-2 border rounded-lg" />
            <textarea required rows={4} placeholder="Formule" value={orderForm.formule} onChange={(e) => setOrderForm({ ...orderForm, formule: e.target.value })} className="w-full p-2 border rounded-lg font-mono text-xs" />
            <button type="submit" className="w-full bg-fuchsia-600 text-white py-2 rounded-lg font-semibold flex justify-center gap-2"><Send size={16} /> Créer / envoyer</button>
          </form>

          <div className="bg-white rounded-xl border overflow-hidden">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 border-b"><tr><th className="p-3">Date</th><th className="p-3">Patient</th><th className="p-3">Prix</th><th className="p-3">Statut</th><th className="p-3" /></tr></thead>
              <tbody className="divide-y">
                {orders.map((o) => (
                  <tr key={o.id}>
                    <td className="p-3">{new Date(o.created_at).toLocaleDateString('fr-FR')}</td>
                    <td className="p-3">{o.patient_initiales || '—'}</td>
                    <td className="p-3">{o.prix_calcule ?? '—'} €</td>
                    <td className="p-3 capitalize">{o.statut}</td>
                    <td className="p-3">
                      {['envoye', 'en_cours'].includes(o.statut) && (
                        <button type="button" onClick={async () => { await markReceived(o.id); load(); }} className="text-emerald-700 text-xs flex items-center gap-1"><PackageCheck size={14} /> Reçu</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
