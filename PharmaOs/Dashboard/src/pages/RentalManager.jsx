import React, { useState, useEffect } from 'react';
import { BedDouble, AlertTriangle, Edit2 } from 'lucide-react';
import {
  ASSET_TYPES, SOURCE_TYPES, STATUT_LABELS,
  fetchAssets, upsertAsset, fetchContracts, fetchOverdueContracts,
  updateContract, updateAssetStatus, markBillingWeek, extendPrescription,
} from '../services/rentalService';

function weekKey(d = new Date()) {
  const onejan = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil((((d - onejan) / 86400000) + onejan.getDay() + 1) / 7);
  return `${d.getFullYear()}-S${String(week).padStart(2, '0')}`;
}

const Field = ({ label, children }) => (
  <div>
    <label className="block text-xs font-semibold text-slate-700 mb-1">{label}</label>
    {children}
  </div>
);

export default function RentalManager() {
  const [assets, setAssets] = useState([]);
  const [view, setView] = useState('ouverts');
  const [contracts, setContracts] = useState([]);
  const [overdue, setOverdue] = useState([]);
  const [selected, setSelected] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [form, setForm] = useState({
    asset_type: 'lit', label: '', origine: 'interne',
    numero_interne: '', numero_serie_prestataire: '', status: 'disponible',
  });
  const [msg, setMsg] = useState('');

  const load = async () => {
    setAssets(await fetchAssets());
    const statut = view === 'ouverts' ? 'en_cours'
      : view === 'attente' ? 'attente_reception'
        : view === 'termines' ? 'retourne' : null;
    if (view !== 'parc') setContracts(await fetchContracts({ statut }));
    setOverdue(await fetchOverdueContracts(30));
  };
  useEffect(() => { load().catch((e) => alert(e.message)); }, [view]);

  const typeLabel = (t) => ASSET_TYPES.find((x) => x.value === t)?.label || t;
  const sourceLabel = (s) => SOURCE_TYPES.find((x) => x.value === s)?.label || s || '—';

  const openEdit = (c) => {
    setSelected(c);
    setEditForm({
      patient_nom: c.patient_nom,
      patient_prenom: c.patient_prenom,
      prescription_valid_until: c.prescription_valid_until || '',
      billing_notes: c.billing_notes || '',
      billing_status: c.billing_status || 'en_attente',
      numero_serie: c.numero_serie || '',
      notes: c.notes || '',
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><BedDouble className="text-cyan-600" /> Location — Parc & contrats</h1>
        <p className="text-sm text-slate-500">Suivi des locations démarrées, en attente de réception, facturation et retours</p>
      </div>
      {msg && <p className="text-sm text-emerald-700 bg-emerald-50 p-2 rounded">{msg}</p>}

      {overdue.length > 0 && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
          <p className="font-semibold text-amber-800 flex items-center gap-2"><AlertTriangle size={18} /> {overdue.length} contrat(s) ouverts &gt; 30 jours</p>
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        {[
          { id: 'ouverts', label: 'Locations démarrées' },
          { id: 'attente', label: 'Attente réception' },
          { id: 'termines', label: 'Terminées' },
          { id: 'parc', label: 'Parc matériel' },
        ].map((v) => (
          <button key={v.id} type="button" onClick={() => setView(v.id)} className={`px-4 py-2 rounded-lg text-sm font-medium ${view === v.id ? 'bg-cyan-600 text-white' : 'bg-white border'}`}>{v.label}</button>
        ))}
      </div>

      {view === 'parc' && (
        <div className="grid md:grid-cols-2 gap-6">
          <form onSubmit={async (e) => { e.preventDefault(); await upsertAsset(form); setMsg('Appareil ajouté'); setForm({ asset_type: 'lit', label: '', origine: 'interne', numero_interne: '', numero_serie_prestataire: '', status: 'disponible' }); load(); }} className="bg-white p-5 rounded-xl border space-y-3 text-sm">
            <h2 className="font-semibold">Ajouter un appareil au parc</h2>
            <Field label="Type d'appareil">
              <select value={form.asset_type} onChange={(e) => setForm({ ...form, asset_type: e.target.value })} className="w-full p-2 border rounded-lg">
                {ASSET_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </Field>
            <Field label="Libellé">
              <input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} className="w-full p-2 border rounded-lg" placeholder="Ex. Lit médical n°3" />
            </Field>
            <Field label="Origine">
              <select value={form.origine} onChange={(e) => setForm({ ...form, origine: e.target.value })} className="w-full p-2 border rounded-lg">
                <option value="interne">Stock pharmacie</option>
                <option value="prestataire">Dépôt prestataire</option>
              </select>
            </Field>
            <Field label="N° interne pharmacie">
              <input value={form.numero_interne} onChange={(e) => setForm({ ...form, numero_interne: e.target.value })} className="w-full p-2 border rounded-lg" />
            </Field>
            <Field label="N° série prestataire">
              <input value={form.numero_serie_prestataire} onChange={(e) => setForm({ ...form, numero_serie_prestataire: e.target.value })} className="w-full p-2 border rounded-lg" />
            </Field>
            <button type="submit" className="w-full bg-cyan-600 text-white py-2 rounded-lg font-semibold">Ajouter au parc</button>
          </form>
          <div className="bg-white rounded-xl border divide-y text-sm max-h-96 overflow-y-auto">
            {assets.map((a) => (
              <div key={a.id} className="p-3 flex justify-between items-center gap-2">
                <div>
                  <p className="font-medium">{typeLabel(a.asset_type)} — {a.numero_interne || a.label || '—'}</p>
                  <p className="text-xs text-slate-500">{a.origine === 'prestataire' ? 'Prestataire' : 'Pharmacie'}</p>
                </div>
                <select value={a.status} onChange={async (e) => { await updateAssetStatus(a.id, e.target.value); load(); }} className="text-xs border rounded p-1">
                  <option value="disponible">Disponible</option>
                  <option value="loue">Loué</option>
                  <option value="maintenance">Maintenance / désinfection</option>
                  <option value="retire">Retiré</option>
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      {view !== 'parc' && (
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white rounded-xl border overflow-hidden">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 border-b"><tr>
                <th className="p-3">Patient</th>
                <th className="p-3">Matériel</th>
                <th className="p-3">Source</th>
                <th className="p-3">Début</th>
                <th className="p-3">Statut</th>
                <th className="p-3">Facturation</th>
                <th className="p-3" />
              </tr></thead>
              <tbody className="divide-y">
                {contracts.length === 0 && (
                  <tr><td colSpan={7} className="p-4 text-slate-500">Aucun contrat dans cette vue.</td></tr>
                )}
                {contracts.map((c) => (
                  <tr key={c.id}>
                    <td className="p-3">{c.patient_prenom} {c.patient_nom}</td>
                    <td className="p-3">
                      {c.rental_assets ? typeLabel(c.rental_assets.asset_type) : typeLabel(c.asset_type_requested)}
                      {c.numero_serie ? <span className="block text-xs text-slate-500">S/N {c.numero_serie}</span> : null}
                    </td>
                    <td className="p-3 text-xs">{sourceLabel(c.source_type)}</td>
                    <td className="p-3">{c.date_sortie ? new Date(c.date_sortie).toLocaleDateString('fr-FR') : '—'}</td>
                    <td className="p-3 text-xs">{STATUT_LABELS[c.statut] || c.statut}</td>
                    <td className="p-3 capitalize">{c.billing_status || '—'} {(c.billing_weeks || []).length ? `(${c.billing_weeks.length} sem.)` : ''}</td>
                    <td className="p-3"><button type="button" onClick={() => openEdit(c)} className="text-cyan-700 text-xs flex items-center gap-1"><Edit2 size={14} /> Modifier</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {selected && (
            <div className="bg-white p-4 rounded-xl border space-y-3 text-sm">
              <h3 className="font-bold">Modifier le contrat</h3>
              <p className="text-xs text-slate-500">{STATUT_LABELS[selected.statut]} — {sourceLabel(selected.source_type)}</p>
              <Field label="Nom patient">
                <input value={editForm.patient_nom} onChange={(e) => setEditForm({ ...editForm, patient_nom: e.target.value })} className="w-full p-2 border rounded" />
              </Field>
              <Field label="Prénom patient">
                <input value={editForm.patient_prenom} onChange={(e) => setEditForm({ ...editForm, patient_prenom: e.target.value })} className="w-full p-2 border rounded" />
              </Field>
              <Field label="N° de série">
                <input value={editForm.numero_serie} onChange={(e) => setEditForm({ ...editForm, numero_serie: e.target.value })} className="w-full p-2 border rounded" />
              </Field>
              <Field label="Ordonnance valable jusqu'au">
                <input type="date" value={editForm.prescription_valid_until} onChange={(e) => setEditForm({ ...editForm, prescription_valid_until: e.target.value })} className="w-full p-2 border rounded" />
              </Field>
              <Field label="Statut facturation">
                <select value={editForm.billing_status} onChange={(e) => setEditForm({ ...editForm, billing_status: e.target.value })} className="w-full p-2 border rounded">
                  <option value="en_attente">En attente</option>
                  <option value="facture">Facturé</option>
                  <option value="partiel">Partiel</option>
                </select>
              </Field>
              <Field label="Notes facturation">
                <textarea rows={2} value={editForm.billing_notes} onChange={(e) => setEditForm({ ...editForm, billing_notes: e.target.value })} className="w-full p-2 border rounded" />
              </Field>
              <Field label="Notes générales">
                <textarea rows={2} value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} className="w-full p-2 border rounded" />
              </Field>
              <button type="button" onClick={async () => {
                await updateContract(selected.id, editForm);
                if (editForm.prescription_valid_until) await extendPrescription(selected.id, editForm.prescription_valid_until);
                setMsg('Contrat mis à jour'); load();
              }} className="w-full bg-cyan-600 text-white py-2 rounded-lg">Enregistrer</button>
              {selected.statut === 'en_cours' && (
                <button type="button" onClick={async () => {
                  await markBillingWeek(selected.id, weekKey());
                  setMsg(`Semaine ${weekKey()} marquée facturée`); load();
                }} className="w-full bg-emerald-600 text-white py-2 rounded-lg">Facturation OK — semaine en cours</button>
              )}
              {selected.statut === 'retourne' && (
                <div className="text-xs bg-slate-50 p-2 rounded space-y-1">
                  <p>État retour : {selected.retour_etat || selected.checklist_iso?.etat_retour || '—'}</p>
                  <p>Caution restituée : {selected.caution_restituee ? 'Oui' : 'Non'}</p>
                  <p>Caution encaissée : {selected.caution_encaissee ? 'Oui' : 'Non'}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
