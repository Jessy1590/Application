import React, { useState, useEffect } from 'react';
import { FlaskConical, Send, PackageCheck, XCircle, Settings, Edit2 } from 'lucide-react';
import {
  fetchSettings, updateSettings, fetchOrders, validateDevis, receiveOrder, closeOrder,
  saveOrderEdit, calcMagistralPrice,
} from '../services/magistralService';

const STATUTS = { devis: 'Devis', commande: 'Commandé', receptionne: 'Réceptionné', cloture: 'Clôturé' };

const Field = ({ label, children, hint }) => (
  <div>
    <label className="block text-xs font-semibold text-slate-700 mb-1">{label}</label>
    {children}
    {hint && <p className="text-[11px] text-slate-500 mt-0.5">{hint}</p>}
  </div>
);

export default function MagistralManager() {
  const [tab, setTab] = useState('orders');
  const [settings, setSettings] = useState(null);
  const [orders, setOrders] = useState([]);
  const [selected, setSelected] = useState(null);
  const [editJson, setEditJson] = useState('');
  const [recvHt, setRecvHt] = useState('');
  const [recvTva, setRecvTva] = useState('5.5');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [setForm, setSetForm] = useState({});
  const [sendMailOnValidate, setSendMailOnValidate] = useState(true);

  const load = async () => {
    const s = await fetchSettings();
    setSettings(s);
    setSetForm(s || {});
    setOrders(await fetchOrders());
  };
  useEffect(() => { load().catch((e) => setErr(e.message)); }, []);

  const openEdit = (o) => {
    setSelected(o);
    setEditJson(JSON.stringify(o.form_data || {}, null, 2));
    setRecvHt(o.prix_ht_net != null ? String(o.prix_ht_net) : '');
    setRecvTva(o.tva_rate != null ? String(o.tva_rate) : '5.5');
    setErr('');
  };

  const previewPrice = recvHt && settings && recvTva !== ''
    ? calcMagistralPrice(settings, Number(recvHt), Number(recvTva))
    : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><FlaskConical className="text-fuchsia-600" /> Préparations magistrales</h1>
        <p className="text-sm text-slate-500">Tarif = (HT net réception + frais port) × (1 + TVA à la réception) × coefficient</p>
      </div>
      {msg && <p className="text-sm text-emerald-700 bg-emerald-50 p-2 rounded">{msg}</p>}
      {err && <p className="text-sm text-red-700 bg-red-50 p-2 rounded">{err}</p>}

      <div className="flex gap-2">
        <button type="button" onClick={() => setTab('orders')} className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === 'orders' ? 'bg-fuchsia-600 text-white' : 'bg-white border'}`}>Commandes</button>
        <button type="button" onClick={() => setTab('parametres')} className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === 'parametres' ? 'bg-fuchsia-600 text-white' : 'bg-white border'}`}>Paramètres</button>
      </div>

      {tab === 'parametres' && settings && (
        <form onSubmit={async (e) => {
          e.preventDefault();
          try {
            await updateSettings({
              pharmacy_name: setForm.pharmacy_name, pharmacy_address: setForm.pharmacy_address,
              pharmacy_email: setForm.pharmacy_email, pharmacy_interlocuteur: setForm.pharmacy_interlocuteur,
              provider_name: setForm.provider_name, provider_email: setForm.provider_email,
              frais_port: Number(setForm.frais_port) || 0, coefficient: Number(setForm.coefficient) || 1,
              internal_prep_enabled: !!setForm.internal_prep_enabled,
            }, settings.id);
            setMsg('Paramètres enregistrés'); load();
          } catch (ex) { setErr(ex.message); }
        }} className="bg-white p-5 rounded-xl border grid md:grid-cols-2 gap-3 text-sm max-w-3xl">
          <h2 className="md:col-span-2 font-semibold flex items-center gap-2"><Settings size={18} /> Paramètres globaux</h2>
          <Field label="Nom pharmacie"><input value={setForm.pharmacy_name || ''} onChange={(e) => setSetForm({ ...setForm, pharmacy_name: e.target.value })} className="w-full p-2 border rounded-lg" /></Field>
          <Field label="Adresse pharmacie"><input value={setForm.pharmacy_address || ''} onChange={(e) => setSetForm({ ...setForm, pharmacy_address: e.target.value })} className="w-full p-2 border rounded-lg" /></Field>
          <Field label="E-mail pharmacie"><input type="email" value={setForm.pharmacy_email || ''} onChange={(e) => setSetForm({ ...setForm, pharmacy_email: e.target.value })} className="w-full p-2 border rounded-lg" /></Field>
          <Field label="Interlocuteur"><input value={setForm.pharmacy_interlocuteur || ''} onChange={(e) => setSetForm({ ...setForm, pharmacy_interlocuteur: e.target.value })} className="w-full p-2 border rounded-lg" /></Field>
          <Field label="Nom du prestataire (unique)"><input value={setForm.provider_name || ''} onChange={(e) => setSetForm({ ...setForm, provider_name: e.target.value })} className="w-full p-2 border rounded-lg" /></Field>
          <Field label="E-mail du prestataire"><input type="email" value={setForm.provider_email || ''} onChange={(e) => setSetForm({ ...setForm, provider_email: e.target.value })} className="w-full p-2 border rounded-lg" /></Field>
          <Field label="Frais de port (€)"><input type="number" step="0.01" value={setForm.frais_port ?? ''} onChange={(e) => setSetForm({ ...setForm, frais_port: e.target.value })} className="w-full p-2 border rounded-lg" /></Field>
          <Field label="Coefficient"><input type="number" step="0.0001" value={setForm.coefficient ?? ''} onChange={(e) => setSetForm({ ...setForm, coefficient: e.target.value })} className="w-full p-2 border rounded-lg" /></Field>
          <label className="flex items-center gap-2 md:col-span-2"><input type="checkbox" checked={!!setForm.internal_prep_enabled} onChange={(e) => setSetForm({ ...setForm, internal_prep_enabled: e.target.checked })} /> Autoriser la préparation interne (rare)</label>
          <button type="submit" className="md:col-span-2 bg-fuchsia-600 text-white py-2 rounded-lg font-semibold">Enregistrer les paramètres</button>
        </form>
      )}

      {tab === 'orders' && (
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white rounded-xl border overflow-hidden">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 border-b"><tr>
                <th className="p-3">Date</th><th className="p-3">Patient</th><th className="p-3">Prix TTC</th><th className="p-3">Statut</th><th className="p-3" />
              </tr></thead>
              <tbody className="divide-y">
                {orders.map((o) => (
                  <tr key={o.id} className={selected?.id === o.id ? 'bg-fuchsia-50' : ''}>
                    <td className="p-3">{new Date(o.created_at).toLocaleDateString('fr-FR')}</td>
                    <td className="p-3">{o.patient_initiales || '—'}</td>
                    <td className="p-3">{o.prix_calcule ?? '—'}{o.prix_calcule != null ? ' €' : ''}</td>
                    <td className="p-3">{STATUTS[o.statut] || o.statut}</td>
                    <td className="p-3"><button type="button" onClick={() => openEdit(o)} className="text-fuchsia-700 text-xs flex items-center gap-1"><Edit2 size={14} /> Gérer</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {selected && (
            <div className="bg-white p-4 rounded-xl border space-y-3 text-sm">
              <h3 className="font-bold">Commande {selected.patient_initiales}</h3>
              <p className="text-xs text-slate-500">Statut : {STATUTS[selected.statut]}</p>

              {selected.statut === 'devis' && (
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-xs">
                    <input type="checkbox" checked={sendMailOnValidate} onChange={(e) => setSendMailOnValidate(e.target.checked)} />
                    Envoyer un e-mail au prestataire à la validation
                  </label>
                  <button type="button" onClick={async () => {
                    try {
                      await validateDevis(selected.id, { launchOrder: true, sendEmail: sendMailOnValidate });
                      setMsg('Devis validé → commande'); load(); setSelected(null);
                    } catch (ex) { setErr(ex.message); }
                  }} className="w-full bg-emerald-600 text-white py-2 rounded-lg flex justify-center gap-1"><Send size={14} /> Valider devis & commander</button>
                  <button type="button" onClick={async () => {
                    try {
                      await validateDevis(selected.id, { launchOrder: false });
                      setMsg('Devis refusé — clôturé'); load(); setSelected(null);
                    } catch (ex) { setErr(ex.message); }
                  }} className="w-full bg-slate-200 py-2 rounded-lg flex justify-center gap-1"><XCircle size={14} /> Refuser & clôturer</button>
                </div>
              )}

              {selected.statut === 'commande' && (
                <div className="space-y-2">
                  <Field label="Prix HT net à la réception (€)">
                    <input type="number" step="0.01" value={recvHt} onChange={(e) => setRecvHt(e.target.value)} className="w-full p-2 border rounded" />
                  </Field>
                  <Field label="Taux de TVA (%) *" hint="Saisi pour chaque préparation">
                    <input type="number" step="0.01" value={recvTva} onChange={(e) => setRecvTva(e.target.value)} className="w-full p-2 border rounded" placeholder="Ex. 5.5" />
                  </Field>
                  {previewPrice != null && <p className="text-fuchsia-700 text-xs">Prix TTC calculé : <strong>{previewPrice} €</strong></p>}
                  <button type="button" onClick={async () => {
                    try {
                      await receiveOrder(selected.id, Number(recvHt), { tvaRate: Number(recvTva), notifyPatient: true });
                      setMsg('Réceptionnée'); load(); setSelected(null);
                    } catch (ex) { setErr(ex.message); }
                  }} className="w-full bg-emerald-600 text-white py-2 rounded-lg flex justify-center gap-1"><PackageCheck size={14} /> Réceptionner</button>
                </div>
              )}

              {selected.statut === 'receptionne' && (
                <button type="button" onClick={async () => {
                  try {
                    await closeOrder(selected.id, 'Terminé');
                    setMsg('Clôturée'); load(); setSelected(null);
                  } catch (ex) { setErr(ex.message); }
                }} className="w-full bg-slate-600 text-white py-2 rounded-lg">Clôturer</button>
              )}

              <div>
                <Field label="Modifier les données du formulaire (JSON)" hint="Admin : édition avancée — sauver avec ou sans e-mail prestataire">
                  <textarea rows={8} value={editJson} onChange={(e) => setEditJson(e.target.value)} className="w-full p-2 border rounded font-mono text-xs" />
                </Field>
                <div className="flex gap-2 mt-2">
                  <button type="button" onClick={async () => {
                    try {
                      const fd = JSON.parse(editJson);
                      await saveOrderEdit(selected.id, fd, { sendEmail: false });
                      setMsg('Modifié sans e-mail'); load();
                    } catch (ex) { setErr(ex.message); }
                  }} className="flex-1 bg-slate-100 py-2 rounded text-xs">Sauver sans mail</button>
                  <button type="button" onClick={async () => {
                    try {
                      const fd = JSON.parse(editJson);
                      await saveOrderEdit(selected.id, fd, { sendEmail: true });
                      setMsg('Modifié + mail prestataire'); load();
                    } catch (ex) { setErr(ex.message); }
                  }} className="flex-1 bg-fuchsia-600 text-white py-2 rounded text-xs">Sauver + mail</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
