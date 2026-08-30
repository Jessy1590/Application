import React, { useState, useEffect } from 'react';
import { ArrowLeft, BedDouble, AlertTriangle } from 'lucide-react';
import { ASSET_TYPES, fetchAssets, upsertAsset, fetchContracts, fetchOverdueContracts } from '../services/rentalService';

export default function RentalManager({ onNavigate }) {
  const [assets, setAssets] = useState([]);
  const [open, setOpen] = useState([]);
  const [overdue, setOverdue] = useState([]);
  const [form, setForm] = useState({
    asset_type: 'lit', label: '', origine: 'interne', numero_interne: '', numero_serie_prestataire: '', status: 'disponible',
  });
  const [msg, setMsg] = useState('');

  const load = async () => {
    setAssets(await fetchAssets());
    setOpen(await fetchContracts({ statut: 'en_cours' }));
    setOverdue(await fetchOverdueContracts(30));
  };
  useEffect(() => { load().catch((e) => alert(e.message)); }, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    await upsertAsset(form);
    setMsg('Appareil ajouté au parc.');
    setForm({ asset_type: 'lit', label: '', origine: 'interne', numero_interne: '', numero_serie_prestataire: '', status: 'disponible' });
    load();
  };

  const typeLabel = (t) => ASSET_TYPES.find((x) => x.value === t)?.label || t;

  return (
    <div className="p-8 max-w-6xl mx-auto w-full">
      <button type="button" onClick={() => onNavigate('dashboard')} className="flex items-center gap-2 text-slate-500 hover:text-cyan-600 mb-6 text-sm font-medium">
        <ArrowLeft size={16} /> Retour
      </button>
      <h1 className="text-2xl font-bold flex items-center gap-2 mb-2"><BedDouble className="text-cyan-600" /> Location — Parc & contrats ISO</h1>
      <p className="text-sm text-slate-500 mb-6">Parc matériel, contrats ouverts, alertes non rentrés.</p>

      {overdue.length > 0 && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl">
          <p className="font-semibold text-amber-800 flex items-center gap-2"><AlertTriangle size={18} /> {overdue.length} contrat(s) ouverts &gt; 30 jours</p>
          <ul className="mt-2 text-sm text-amber-900">
            {overdue.map((c) => (
              <li key={c.id}>{c.patient_prenom} {c.patient_nom} — {typeLabel(c.rental_assets?.asset_type)} depuis {new Date(c.date_sortie).toLocaleDateString('fr-FR')}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-6 mb-8">
        <form onSubmit={handleAdd} className="bg-white p-5 rounded-xl border space-y-3 text-sm">
          <h2 className="font-semibold">Ajouter un appareil</h2>
          {msg && <p className="text-emerald-600 text-xs">{msg}</p>}
          <select value={form.asset_type} onChange={(e) => setForm({ ...form, asset_type: e.target.value })} className="w-full p-2 border rounded-lg">
            {ASSET_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <input placeholder="Libellé" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} className="w-full p-2 border rounded-lg" />
          <select value={form.origine} onChange={(e) => setForm({ ...form, origine: e.target.value })} className="w-full p-2 border rounded-lg">
            <option value="interne">Interne</option>
            <option value="prestataire">Prestataire</option>
          </select>
          <input placeholder="N° interne" value={form.numero_interne} onChange={(e) => setForm({ ...form, numero_interne: e.target.value })} className="w-full p-2 border rounded-lg" />
          <input placeholder="N° série prestataire" value={form.numero_serie_prestataire} onChange={(e) => setForm({ ...form, numero_serie_prestataire: e.target.value })} className="w-full p-2 border rounded-lg" />
          <button type="submit" className="w-full bg-cyan-600 text-white py-2 rounded-lg font-semibold">Ajouter au parc</button>
        </form>

        <div className="bg-white rounded-xl border overflow-hidden">
          <h2 className="font-semibold p-4 border-b">Parc ({assets.length})</h2>
          <div className="max-h-80 overflow-y-auto divide-y text-sm">
            {assets.map((a) => (
              <div key={a.id} className="p-3 flex justify-between">
                <span>{typeLabel(a.asset_type)} — {a.numero_interne || a.numero_serie_prestataire || a.label || '—'}</span>
                <span className="text-xs bg-slate-100 px-2 py-0.5 rounded capitalize">{a.status}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <h2 className="font-semibold mb-3">Contrats ouverts ({open.length})</h2>
      <div className="bg-white rounded-xl border overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-50 border-b"><tr>
            <th className="p-3">Patient</th><th className="p-3">Appareil</th><th className="p-3">Sortie</th><th className="p-3">Caution</th>
          </tr></thead>
          <tbody className="divide-y">
            {open.map((c) => (
              <tr key={c.id}>
                <td className="p-3">{c.patient_prenom} {c.patient_nom}</td>
                <td className="p-3">{typeLabel(c.rental_assets?.asset_type)}</td>
                <td className="p-3">{new Date(c.date_sortie).toLocaleDateString('fr-FR')}</td>
                <td className="p-3">{c.caution_type || '—'} {c.caution_montant != null ? `${c.caution_montant}€` : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
