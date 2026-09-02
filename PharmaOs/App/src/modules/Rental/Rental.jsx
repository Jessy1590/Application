import React, { useState, useEffect } from 'react';
import { useAuth } from '../../core/AuthContext';
import { BedDouble, Save, CheckCircle2, Play, RotateCcw } from 'lucide-react';
import {
  ASSET_TYPES, SOURCE_TYPES, STATUT_LABELS,
  fetchAvailableAssets, fetchOpenContracts, fetchPendingReception,
  createLocation, startPendingLocation, returnRental,
} from '../../services/rentalService.js';

const Field = ({ label, children, hint }) => (
  <div>
    <label className="block text-xs font-semibold text-slate-700 mb-1">{label}</label>
    {children}
    {hint && <p className="text-[11px] text-slate-500 mt-0.5">{hint}</p>}
  </div>
);

const emptyForm = {
  source_type: 'stock_pharma',
  asset_id: '',
  asset_type_requested: 'lit',
  patient_nom: '',
  patient_prenom: '',
  patient_dob: '',
  caution_type: 'cheque',
  caution_montant: '',
  coverage_checked: false,
  prescription_scanned: false,
  prescription_valid_until: '',
  numero_serie: '',
  notes: '',
};

export default function Rental() {
  const { user } = useAuth();
  const [tab, setTab] = useState('nouvelle');
  const [assets, setAssets] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [startForm, setStartForm] = useState({ contract_id: '', numero_serie: '', asset_id: '' });
  const [retour, setRetour] = useState({
    contract_id: '', etat: 'bon', ordonnance_a_jour: true, facturation_validee: false,
    caution_restituee: true, caution_encaissee: false, attente_nouvelle_ordo: false,
    desinfection_faite: false, retour_prestataire: false, prescription_scanned: false, notes: '',
  });

  const load = async () => {
    try {
      setAssets(await fetchAvailableAssets());
      setContracts(await fetchOpenContracts());
      setPending(await fetchPendingReception());
    } catch (e) { setErr(e.message); }
  };
  useEffect(() => { load(); }, []);

  const selectedAsset = assets.find((a) => a.id === form.asset_id);
  const needsCoverage = selectedAsset?.requires_coverage_check
    || ['tens', 'aerosol', 'fauteuil_roulant'].includes(form.asset_type_requested);
  const activeContracts = contracts.filter((c) => c.statut === 'en_cours');
  const selectedReturn = activeContracts.find((c) => c.id === retour.contract_id);
  const returnSource = selectedReturn?.source_type
    || (selectedReturn?.rental_assets?.origine === 'prestataire' ? 'stock_presta' : 'stock_pharma');

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.prescription_scanned) {
      setErr('Cochez que l\'ordonnance est scannée dans le dossier patient.');
      return;
    }
    if (needsCoverage && !form.coverage_checked) {
      setErr('Vérifiez la prise en charge (mutuelle / ALD) pour ce type de matériel.');
      return;
    }
    setLoading(true); setErr(''); setMsg('');
    try {
      const c = await createLocation(user.id, {
        ...form,
        caution_montant: form.caution_montant ? Number(form.caution_montant) : null,
      });
      setMsg(
        c.statut === 'attente_reception' || c.statut === 'demande'
          ? 'Location créée — en attente réception produit. Utilisez « Démarrer location » au retour / livraison.'
          : 'Location démarrée.',
      );
      setForm(emptyForm);
      load();
    } catch (e2) { setErr(e2.message); }
    finally { setLoading(false); }
  };

  const handleStart = async (e) => {
    e.preventDefault();
    setLoading(true); setErr(''); setMsg('');
    try {
      await startPendingLocation(user.id, startForm.contract_id, startForm);
      setMsg('Location démarrée (date de début = aujourd\'hui).');
      setStartForm({ contract_id: '', numero_serie: '', asset_id: '' });
      load();
      setTab('retour');
    } catch (e2) { setErr(e2.message); }
    finally { setLoading(false); }
  };

  const handleReturn = async (e) => {
    e.preventDefault();
    setLoading(true); setErr(''); setMsg('');
    try {
      await returnRental(user.id, retour.contract_id, retour);
      setMsg('Retour enregistré.');
      setRetour({
        contract_id: '', etat: 'bon', ordonnance_a_jour: true, facturation_validee: false,
        caution_restituee: true, caution_encaissee: false, attente_nouvelle_ordo: false,
        desinfection_faite: false, retour_prestataire: false, prescription_scanned: false, notes: '',
      });
      load();
    } catch (e2) { setErr(e2.message); }
    finally { setLoading(false); }
  };

  const typeLabel = (t) => ASSET_TYPES.find((x) => x.value === t)?.label || t;
  const isOrder = form.source_type === 'commande';
  const blockCautionReturn = retour.etat !== 'bon' || !retour.ordonnance_a_jour;

  return (
    <div className="w-full h-full flex flex-col bg-slate-50 text-slate-800">
      <div className="flex border-b bg-white">
        {[
          { id: 'nouvelle', label: 'Nouvelle location' },
          { id: 'demarrer', label: 'Démarrer location' },
          { id: 'retour', label: 'Retour' },
        ].map((t) => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)}
            className={`flex-1 py-3 text-sm font-semibold ${tab === t.id ? 'border-b-2 border-cyan-600 text-cyan-700' : 'text-slate-500'}`}>
            {t.label}
            {t.id === 'demarrer' && pending.length > 0 ? ` (${pending.length})` : ''}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-6 max-w-xl">
        <h2 className="text-xl font-bold mb-1 flex items-center gap-2"><BedDouble className="text-cyan-600" /> Location de matériel</h2>
        <p className="text-xs text-slate-500 mb-4">Comptoir : créer, démarrer après réception, ou enregistrer un retour.</p>
        {msg && <div className="mb-3 p-3 bg-emerald-50 text-emerald-700 rounded-lg flex items-center gap-2 text-sm"><CheckCircle2 size={16} /> {msg}</div>}
        {err && <div className="mb-3 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{err}</div>}

        {tab === 'nouvelle' && (
          <form onSubmit={handleCreate} className="space-y-4 text-sm">
            <fieldset className="border rounded-lg p-3 space-y-3">
              <legend className="font-bold px-1">Provenance du matériel</legend>
              <Field label="Choix *" hint="Commande → statut « En attente réception produit »">
                <select required value={form.source_type} onChange={(e) => setForm({ ...form, source_type: e.target.value, asset_id: '' })} className="w-full p-2 border rounded-lg">
                  {SOURCE_TYPES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </Field>
              {!isOrder ? (
                <Field label="Appareil disponible *">
                  <select required value={form.asset_id} onChange={(e) => setForm({ ...form, asset_id: e.target.value })} className="w-full p-2 border rounded-lg">
                    <option value="">— Sélectionner —</option>
                    {assets.map((a) => (
                      <option key={a.id} value={a.id}>
                        {typeLabel(a.asset_type)} — {a.numero_interne || a.label || a.id.slice(0, 6)}
                        {a.origine === 'prestataire' ? ' (présta)' : ' (pharma)'}
                      </option>
                    ))}
                  </select>
                </Field>
              ) : (
                <Field label="Type de matériel à commander *">
                  <select required value={form.asset_type_requested} onChange={(e) => setForm({ ...form, asset_type_requested: e.target.value })} className="w-full p-2 border rounded-lg">
                    {ASSET_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </Field>
              )}
              {!isOrder && (
                <Field label="N° série (si connu)">
                  <input value={form.numero_serie} onChange={(e) => setForm({ ...form, numero_serie: e.target.value })} className="w-full p-2 border rounded-lg" />
                </Field>
              )}
            </fieldset>

            <fieldset className="border rounded-lg p-3 space-y-3">
              <legend className="font-bold px-1">Patient</legend>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Nom *"><input required value={form.patient_nom} onChange={(e) => setForm({ ...form, patient_nom: e.target.value })} className="w-full p-2 border rounded-lg" /></Field>
                <Field label="Prénom *"><input required value={form.patient_prenom} onChange={(e) => setForm({ ...form, patient_prenom: e.target.value })} className="w-full p-2 border rounded-lg" /></Field>
              </div>
              <Field label="Date de naissance">
                <input type="date" value={form.patient_dob} onChange={(e) => setForm({ ...form, patient_dob: e.target.value })} className="w-full p-2 border rounded-lg" />
              </Field>
            </fieldset>

            <fieldset className="border rounded-lg p-3 space-y-3">
              <legend className="font-bold px-1">Ordonnance & caution</legend>
              <label className="flex items-center gap-2 font-medium">
                <input type="checkbox" checked={form.prescription_scanned} onChange={(e) => setForm({ ...form, prescription_scanned: e.target.checked })} />
                Ordonnance scannée dans le dossier patient *
              </label>
              <Field label="Ordonnance valable jusqu'au">
                <input type="date" value={form.prescription_valid_until} onChange={(e) => setForm({ ...form, prescription_valid_until: e.target.value })} className="w-full p-2 border rounded-lg" />
              </Field>
              {needsCoverage && (
                <label className="flex items-center gap-2 text-amber-800">
                  <input type="checkbox" checked={form.coverage_checked} onChange={(e) => setForm({ ...form, coverage_checked: e.target.checked })} />
                  Prise en charge vérifiée (mutuelle / ALD) *
                </label>
              )}
              <div className="grid grid-cols-2 gap-3">
                <Field label="Type de caution">
                  <select value={form.caution_type} onChange={(e) => setForm({ ...form, caution_type: e.target.value })} className="w-full p-2 border rounded-lg">
                    <option value="cheque">Chèque</option>
                    <option value="carte">Carte</option>
                  </select>
                </Field>
                <Field label="Montant caution (€)">
                  <input type="number" step="0.01" value={form.caution_montant} onChange={(e) => setForm({ ...form, caution_montant: e.target.value })} className="w-full p-2 border rounded-lg" />
                </Field>
              </div>
              <Field label="Notes">
                <textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="w-full p-2 border rounded-lg" />
              </Field>
            </fieldset>

            <button type="submit" disabled={loading} className="w-full bg-cyan-600 text-white font-bold py-3 rounded-lg flex justify-center gap-2">
              <Save size={18} /> {isOrder ? 'Enregistrer (attente réception)' : 'Démarrer la location'}
            </button>
          </form>
        )}

        {tab === 'demarrer' && (
          <form onSubmit={handleStart} className="space-y-4 text-sm">
            <p className="text-xs text-slate-600 bg-cyan-50 border border-cyan-100 p-3 rounded-lg">
              Pour les contrats « En attente réception produit » : patient revient ou livraison reçue → date de début = aujourd&apos;hui + n° de série.
            </p>
            <Field label="Contrat en attente *">
              <select required value={startForm.contract_id} onChange={(e) => setStartForm({ ...startForm, contract_id: e.target.value })} className="w-full p-2 border rounded-lg">
                <option value="">— Sélectionner —</option>
                {pending.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.patient_prenom} {c.patient_nom} — {typeLabel(c.asset_type_requested || c.rental_assets?.asset_type)} ({STATUT_LABELS[c.statut]})
                  </option>
                ))}
              </select>
            </Field>
            {pending.length === 0 && <p className="text-sm text-slate-500">Aucun contrat en attente de réception.</p>}
            <Field label="N° de série du produit *" hint="Obligatoire pour démarrer">
              <input required value={startForm.numero_serie} onChange={(e) => setStartForm({ ...startForm, numero_serie: e.target.value })} className="w-full p-2 border rounded-lg" />
            </Field>
            <Field label="Lier un appareil du parc (optionnel)">
              <select value={startForm.asset_id} onChange={(e) => setStartForm({ ...startForm, asset_id: e.target.value })} className="w-full p-2 border rounded-lg">
                <option value="">— Sans liaison parc —</option>
                {assets.map((a) => (
                  <option key={a.id} value={a.id}>{typeLabel(a.asset_type)} — {a.numero_interne || a.label}</option>
                ))}
              </select>
            </Field>
            <button type="submit" disabled={loading || pending.length === 0} className="w-full bg-cyan-600 text-white font-bold py-3 rounded-lg flex justify-center gap-2">
              <Play size={18} /> Démarrer la location
            </button>
          </form>
        )}

        {tab === 'retour' && (
          <form onSubmit={handleReturn} className="space-y-4 text-sm">
            <Field label="Location en cours *">
              <select required value={retour.contract_id} onChange={(e) => setRetour({ ...retour, contract_id: e.target.value })} className="w-full p-2 border rounded-lg">
                <option value="">— Sélectionner —</option>
                {activeContracts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.patient_prenom} {c.patient_nom} — {c.rental_assets ? typeLabel(c.rental_assets.asset_type) : typeLabel(c.asset_type_requested)}
                    {c.numero_serie ? ` / S/N ${c.numero_serie}` : ''}
                  </option>
                ))}
              </select>
            </Field>

            <fieldset className="border rounded-lg p-3 space-y-3">
              <legend className="font-bold px-1">État & ordonnance</legend>
              <Field label="État du matériel au retour *">
                <select value={retour.etat} onChange={(e) => setRetour({ ...retour, etat: e.target.value })} className="w-full p-2 border rounded-lg">
                  <option value="bon">Bon état</option>
                  <option value="mauvais">Mauvais état</option>
                  <option value="abime">Abîmé</option>
                </select>
              </Field>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={retour.ordonnance_a_jour} onChange={(e) => setRetour({ ...retour, ordonnance_a_jour: e.target.checked })} />
                Ordonnance à jour (durée de location cohérente) *
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={retour.prescription_scanned} onChange={(e) => setRetour({ ...retour, prescription_scanned: e.target.checked })} />
                Ordonnance présente / scannée dans le dossier
              </label>
              <label className="flex items-center gap-2 font-medium">
                <input type="checkbox" checked={retour.facturation_validee} onChange={(e) => setRetour({ ...retour, facturation_validee: e.target.checked })} />
                Facturation validée / effectuée *
              </label>
            </fieldset>

            <fieldset className="border rounded-lg p-3 space-y-3">
              <legend className="font-bold px-1">Caution</legend>
              {blockCautionReturn && (
                <p className="text-xs text-amber-800 bg-amber-50 p-2 rounded">
                  État mauvais ou ordonnance non à jour : caution non restituée. Indiquez une attente d&apos;ordonnance ou l&apos;encaissement.
                </p>
              )}
              <label className="flex items-center gap-2">
                <input type="checkbox" disabled={blockCautionReturn} checked={!blockCautionReturn && retour.caution_restituee} onChange={(e) => setRetour({ ...retour, caution_restituee: e.target.checked })} />
                Caution restituée au patient
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={retour.attente_nouvelle_ordo} onChange={(e) => setRetour({ ...retour, attente_nouvelle_ordo: e.target.checked })} />
                En attente nouvelle ordonnance (caution retenue)
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={retour.caution_encaissee} onChange={(e) => setRetour({ ...retour, caution_encaissee: e.target.checked })} />
                Caution encaissée
              </label>
            </fieldset>

            {selectedReturn && (
              <fieldset className="border rounded-lg p-3 space-y-3">
                <legend className="font-bold px-1">
                  {returnSource === 'stock_presta' ? 'Retour prestataire' : 'Désinfection (stock pharmacie)'}
                </legend>
                {returnSource === 'stock_pharma' ? (
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={retour.desinfection_faite} onChange={(e) => setRetour({ ...retour, desinfection_faite: e.target.checked })} />
                    Matériel désinfecté — prêt à remettre en stock *
                  </label>
                ) : (
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={retour.retour_prestataire} onChange={(e) => setRetour({ ...retour, retour_prestataire: e.target.checked })} />
                    Matériel retourné au prestataire — location stoppée *
                  </label>
                )}
              </fieldset>
            )}

            <Field label="Notes de retour">
              <textarea rows={2} value={retour.notes} onChange={(e) => setRetour({ ...retour, notes: e.target.value })} className="w-full p-2 border rounded-lg" />
            </Field>

            <button type="submit" disabled={loading} className="w-full bg-cyan-600 text-white font-bold py-3 rounded-lg flex justify-center gap-2">
              <RotateCcw size={18} /> Valider le retour
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
