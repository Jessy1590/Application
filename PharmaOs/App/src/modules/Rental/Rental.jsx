import React, { useState, useEffect } from 'react';
import { useAuth } from '../../core/AuthContext';
import { BedDouble, Save, CheckCircle2, RotateCcw } from 'lucide-react';
import {
  ASSET_TYPES, fetchAvailableAssets, fetchOpenContracts, startRental, returnRental,
} from '../../services/rentalService.js';

export default function Rental() {
  const { user } = useAuth();
  const [tab, setTab] = useState('start');
  const [assets, setAssets] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [form, setForm] = useState({
    asset_id: '', patient_nom: '', patient_prenom: '', patient_dob: '',
    caution_type: 'cheque', caution_montant: '', coverage_checked: false,
    etat_sortie: 'bon', notes: '',
  });
  const [retour, setRetour] = useState({ contract_id: '', etat: 'bon', caution_restituee: true, notes: '' });

  const load = async () => {
    try {
      setAssets(await fetchAvailableAssets());
      setContracts(await fetchOpenContracts());
    } catch (e) { setErr(e.message); }
  };
  useEffect(() => { load(); }, []);

  const selected = assets.find((a) => a.id === form.asset_id);
  const needsCoverage = selected?.requires_coverage_check;

  const handleStart = async (e) => {
    e.preventDefault();
    setLoading(true); setErr(''); setMsg('');
    try {
      await startRental(user.id, {
        ...form,
        caution_montant: form.caution_montant ? Number(form.caution_montant) : null,
        checklist_iso: { etat_sortie: form.etat_sortie },
      });
      setMsg('Location démarrée.');
      setForm({ asset_id: '', patient_nom: '', patient_prenom: '', patient_dob: '', caution_type: 'cheque', caution_montant: '', coverage_checked: false, etat_sortie: 'bon', notes: '' });
      load();
    } catch (e2) { setErr(e2.message); }
    finally { setLoading(false); }
  };

  const handleReturn = async (e) => {
    e.preventDefault();
    setLoading(true); setErr(''); setMsg('');
    try {
      await returnRental(user.id, retour.contract_id, {
        etat: retour.etat,
        caution_restituee: retour.caution_restituee,
        checklist_iso: { etat_retour: retour.etat, nettoyage: true },
        notes: retour.notes,
      });
      setMsg('Retour enregistré.');
      setRetour({ contract_id: '', etat: 'bon', caution_restituee: true, notes: '' });
      load();
    } catch (e2) { setErr(e2.message); }
    finally { setLoading(false); }
  };

  const typeLabel = (t) => ASSET_TYPES.find((x) => x.value === t)?.label || t;

  return (
    <div className="w-full h-full flex flex-col bg-slate-50 text-slate-800">
      <div className="flex border-b bg-white">
        <button type="button" onClick={() => setTab('start')} className={`flex-1 py-3 text-sm font-semibold ${tab === 'start' ? 'border-b-2 border-cyan-600 text-cyan-700' : 'text-slate-500'}`}>
          Démarrer location
        </button>
        <button type="button" onClick={() => setTab('return')} className={`flex-1 py-3 text-sm font-semibold ${tab === 'return' ? 'border-b-2 border-cyan-600 text-cyan-700' : 'text-slate-500'}`}>
          Retour matériel
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <h2 className="text-xl font-bold mb-4 flex items-center gap-2"><BedDouble className="text-cyan-600" /> Location de matériel</h2>
        {msg && <div className="mb-3 p-3 bg-emerald-50 text-emerald-700 rounded-lg flex items-center gap-2 text-sm"><CheckCircle2 size={16} /> {msg}</div>}
        {err && <div className="mb-3 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{err}</div>}

        {tab === 'start' && (
          <form onSubmit={handleStart} className="space-y-3 text-sm max-w-lg">
            <div>
              <label className="block font-semibold mb-1">Appareil disponible *</label>
              <select required value={form.asset_id} onChange={(e) => setForm({ ...form, asset_id: e.target.value })} className="w-full p-2 border rounded-lg">
                <option value="">— Choisir —</option>
                {assets.map((a) => (
                  <option key={a.id} value={a.id}>{typeLabel(a.asset_type)} — {a.numero_interne || a.numero_serie_prestataire || a.label || a.id.slice(0, 8)}</option>
                ))}
              </select>
            </div>
            {needsCoverage && (
              <label className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <input type="checkbox" checked={form.coverage_checked} onChange={(e) => setForm({ ...form, coverage_checked: e.target.checked })} required />
                Vérification prise en charge effectuée (TENS / aérosol / fauteuil)
              </label>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold mb-1">Nom patient *</label>
                <input required value={form.patient_nom} onChange={(e) => setForm({ ...form, patient_nom: e.target.value })} className="w-full p-2 border rounded-lg" />
              </div>
              <div>
                <label className="block font-semibold mb-1">Prénom *</label>
                <input required value={form.patient_prenom} onChange={(e) => setForm({ ...form, patient_prenom: e.target.value })} className="w-full p-2 border rounded-lg" />
              </div>
            </div>
            <div>
              <label className="block font-semibold mb-1">Date de naissance</label>
              <input type="date" value={form.patient_dob} onChange={(e) => setForm({ ...form, patient_dob: e.target.value })} className="w-full p-2 border rounded-lg" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold mb-1">Caution</label>
                <select value={form.caution_type} onChange={(e) => setForm({ ...form, caution_type: e.target.value })} className="w-full p-2 border rounded-lg">
                  <option value="cheque">Chèque</option>
                  <option value="carte">Carte</option>
                </select>
              </div>
              <div>
                <label className="block font-semibold mb-1">Montant (€)</label>
                <input type="number" step="0.01" value={form.caution_montant} onChange={(e) => setForm({ ...form, caution_montant: e.target.value })} className="w-full p-2 border rounded-lg" />
              </div>
            </div>
            <div>
              <label className="block font-semibold mb-1">État à la sortie</label>
              <select value={form.etat_sortie} onChange={(e) => setForm({ ...form, etat_sortie: e.target.value })} className="w-full p-2 border rounded-lg">
                <option value="bon">Bon état</option>
                <option value="usage">Traces d&apos;usage</option>
                <option value="defectueux">Défectueux signalé</option>
              </select>
            </div>
            <button type="submit" disabled={loading} className="w-full bg-cyan-600 hover:bg-cyan-700 text-white font-bold py-3 rounded-lg flex justify-center gap-2">
              <Save size={18} /> {loading ? 'Enregistrement...' : 'Démarrer la location'}
            </button>
          </form>
        )}

        {tab === 'return' && (
          <form onSubmit={handleReturn} className="space-y-3 text-sm max-w-lg">
            <div>
              <label className="block font-semibold mb-1">Contrat en cours *</label>
              <select required value={retour.contract_id} onChange={(e) => setRetour({ ...retour, contract_id: e.target.value })} className="w-full p-2 border rounded-lg">
                <option value="">— Choisir —</option>
                {contracts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.patient_prenom} {c.patient_nom} — {typeLabel(c.rental_assets?.asset_type)} ({new Date(c.date_sortie).toLocaleDateString('fr-FR')})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-semibold mb-1">État au retour</label>
              <select value={retour.etat} onChange={(e) => setRetour({ ...retour, etat: e.target.value })} className="w-full p-2 border rounded-lg">
                <option value="bon">Bon état / nettoyé</option>
                <option value="usage">Traces d&apos;usage</option>
                <option value="defectueux">Défectueux</option>
              </select>
            </div>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={retour.caution_restituee} onChange={(e) => setRetour({ ...retour, caution_restituee: e.target.checked })} />
              Caution restituée
            </label>
            <textarea rows={2} placeholder="Notes ISO..." value={retour.notes} onChange={(e) => setRetour({ ...retour, notes: e.target.value })} className="w-full p-2 border rounded-lg" />
            <button type="submit" disabled={loading} className="w-full bg-cyan-600 hover:bg-cyan-700 text-white font-bold py-3 rounded-lg flex justify-center gap-2">
              <RotateCcw size={18} /> {loading ? 'Enregistrement...' : 'Valider le retour'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
