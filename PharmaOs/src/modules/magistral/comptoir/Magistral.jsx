import React, { useState, useEffect } from 'react';
import { useAuth } from '../../../core/AuthContext.jsx';
import { FlaskConical, Save, CheckCircle2, PackageCheck } from 'lucide-react';
import {
  fetchSettings, createMagistralOrder, fetchMyOrders, markOrderReceived, calcMagistralPrice,
} from '../services/magistralService.js';

const EMPTY_FORM = {
  pharmacie: { nom: '', adresse: '', email: '', interlocuteur: '' },
  demande: { nature: 'devis', historique: 'premiere', prescripteur: '', voie_admin: '', formule: '' },
  patient: { nom: '', prenom: '', dob: '', type_prep: 'ad', allergies: '', deglutition: '', grossesse_allaitement: '' },
  analyse: {
    dose_posologie_ok: true, contre_indications: '', interactions: '',
    justifications: [], commentaires: '',
  },
  patient_email: '',
  preparation_interne: false,
};

const JUSTIFS = [
  'Absence de forme pharmaceutique',
  "Absence d'alternative thérapeutique",
  'Absence de dosage adapté',
  "Rupture de stock d'une spécialité",
  'Autre motif',
];

const STATUT_LABELS = { devis: 'Devis', commande: 'Commandé', receptionne: 'Réceptionné', cloture: 'Clôturé' };

const Field = ({ label, children, hint }) => (
  <div>
    <label className="block text-xs font-semibold text-slate-700 mb-1">{label}</label>
    {children}
    {hint && <p className="text-[11px] text-slate-500 mt-0.5">{hint}</p>}
  </div>
);

export default function Magistral() {
  const { user } = useAuth();
  const [settings, setSettings] = useState(null);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);
  const [recvId, setRecvId] = useState('');
  const [recvHt, setRecvHt] = useState('');
  const [recvTva, setRecvTva] = useState('5.5');
  const [notifyPatient, setNotifyPatient] = useState(false);

  const load = async () => {
    if (!user?.id) return;
    try {
      const s = await fetchSettings();
      setSettings(s);
      if (s) {
        setForm((f) => ({
          ...f,
          pharmacie: {
            nom: s.pharmacy_name || '',
            adresse: s.pharmacy_address || '',
            email: s.pharmacy_email || '',
            interlocuteur: s.pharmacy_interlocuteur || '',
          },
        }));
      }
      setOrders(await fetchMyOrders(user.id));
    } catch (e) { setErr(e.message); }
  };
  useEffect(() => { load(); }, [user?.id]);

  const setPh = (k, v) => setForm({ ...form, pharmacie: { ...form.pharmacie, [k]: v } });
  const setDem = (k, v) => setForm({ ...form, demande: { ...form.demande, [k]: v } });
  const setPat = (k, v) => setForm({ ...form, patient: { ...form.patient, [k]: v } });
  const setAna = (k, v) => setForm({ ...form, analyse: { ...form.analyse, [k]: v } });
  const toggleJustif = (j) => {
    const cur = form.analyse.justifications || [];
    setAna('justifications', cur.includes(j) ? cur.filter((x) => x !== j) : [...cur, j]);
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setLoading(true); setErr(''); setMsg('');
    try {
      await createMagistralOrder(user.id, {
        form_data: {
          ...form,
          patient: {
            ...form.patient,
            nom: form.patient.nom.slice(0, 2),
            prenom: form.patient.prenom.slice(0, 2),
          },
        },
        patient_email: form.patient_email || null,
        preparation_interne: form.preparation_interne,
      });
      setMsg('Demande enregistrée (statut Devis). Le prestataire est prévenu si configuré.');
      setForm({ ...EMPTY_FORM, pharmacie: form.pharmacie });
      load();
    } catch (e2) { setErr(e2.message); }
    finally { setLoading(false); }
  };

  const handleReceive = async () => {
    if (!recvId || !recvHt || recvTva === '') return;
    setLoading(true); setErr('');
    try {
      await markOrderReceived(recvId, Number(recvHt), Number(recvTva), notifyPatient);
      setMsg('Réception enregistrée. Prix TTC calculé avec port + TVA + coefficient.');
      setRecvId(''); setRecvHt(''); setRecvTva('5.5');
      load();
    } catch (e2) { setErr(e2.message); }
    finally { setLoading(false); }
  };

  const previewTtc = recvHt && settings && recvTva !== ''
    ? calcMagistralPrice(settings, Number(recvHt), Number(recvTva))
    : null;

  return (
    <div className="w-full h-full flex bg-slate-50 text-slate-800">
      <div className="w-3/5 bg-white border-r p-6 overflow-y-auto">
        <h2 className="text-xl font-bold mb-2 flex items-center gap-2"><FlaskConical className="text-fuchsia-600" /> Préparation magistrale</h2>
        <p className="text-xs text-slate-500 mb-4">
          Prestataire unique : {settings?.provider_name || '—'} ({settings?.provider_email || 'non configuré'})
          {' — '}Tarif = (HT net + port) × TVA (à la réception) × coefficient
        </p>
        {msg && <div className="mb-3 p-3 bg-emerald-50 text-emerald-700 rounded-lg text-sm flex gap-2"><CheckCircle2 size={16} /> {msg}</div>}
        {err && <div className="mb-3 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{err}</div>}

        <form onSubmit={handleCreate} className="space-y-4 text-sm">
          <fieldset className="border rounded-lg p-3 space-y-2">
            <legend className="font-bold px-1">Coordonnées pharmacie</legend>
            <Field label="Nom de la pharmacie *"><input required value={form.pharmacie.nom} onChange={(e) => setPh('nom', e.target.value)} className="w-full p-2 border rounded" /></Field>
            <Field label="Adresse *"><input required value={form.pharmacie.adresse} onChange={(e) => setPh('adresse', e.target.value)} className="w-full p-2 border rounded" /></Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="E-mail pharmacie *"><input required type="email" value={form.pharmacie.email} onChange={(e) => setPh('email', e.target.value)} className="w-full p-2 border rounded" /></Field>
              <Field label="Interlocuteur *"><input required value={form.pharmacie.interlocuteur} onChange={(e) => setPh('interlocuteur', e.target.value)} className="w-full p-2 border rounded" /></Field>
            </div>
          </fieldset>

          <fieldset className="border rounded-lg p-3 space-y-2">
            <legend className="font-bold px-1">Votre demande</legend>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Nature *">
                <select value={form.demande.nature} onChange={(e) => setDem('nature', e.target.value)} className="w-full p-2 border rounded">
                  <option value="devis">Devis</option><option value="commande">Commande</option>
                </select>
              </Field>
              <Field label="Historique *">
                <select value={form.demande.historique} onChange={(e) => setDem('historique', e.target.value)} className="w-full p-2 border rounded">
                  <option value="premiere">1ère demande</option><option value="renouvellement">Renouvellement</option>
                </select>
              </Field>
              <Field label="Prescripteur *"><input required value={form.demande.prescripteur} onChange={(e) => setDem('prescripteur', e.target.value)} className="w-full p-2 border rounded" /></Field>
              <Field label="Voie d'administration *"><input required value={form.demande.voie_admin} onChange={(e) => setDem('voie_admin', e.target.value)} className="w-full p-2 border rounded" placeholder="Ex. orale, cutanée…" /></Field>
            </div>
            <Field label="Formule * (note d'ordonnance / composition)" hint="Saisie lisible pour le prestataire">
              <textarea required rows={4} value={form.demande.formule} onChange={(e) => setDem('formule', e.target.value)} className="w-full p-2 border rounded font-mono text-xs" />
            </Field>
            <p className="text-xs text-slate-500">Ordonnance originale : scanner / joindre au dossier patient séparément.</p>
          </fieldset>

          <fieldset className="border rounded-lg p-3 space-y-2">
            <legend className="font-bold px-1">Patient (2 premières lettres + date de naissance)</legend>
            <div className="grid grid-cols-3 gap-2">
              <Field label="Nom (2 lett.) *"><input required maxLength={2} value={form.patient.nom} onChange={(e) => setPat('nom', e.target.value.toUpperCase())} className="w-full p-2 border rounded uppercase" /></Field>
              <Field label="Prénom (2 lett.) *"><input required maxLength={2} value={form.patient.prenom} onChange={(e) => setPat('prenom', e.target.value.toUpperCase())} className="w-full p-2 border rounded uppercase" /></Field>
              <Field label="Date de naissance *"><input required type="date" value={form.patient.dob} onChange={(e) => setPat('dob', e.target.value)} className="w-full p-2 border rounded" /></Field>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Type de préparation *">
                <select value={form.patient.type_prep} onChange={(e) => setPat('type_prep', e.target.value)} className="w-full p-2 border rounded">
                  <option value="ad">Adulte</option><option value="ped">Pédiatrique</option><option value="vet">Vétérinaire</option>
                </select>
              </Field>
              <Field label="E-mail patient (optionnel)" hint="Pour notification de disponibilité">
                <input type="email" value={form.patient_email} onChange={(e) => setForm({ ...form, patient_email: e.target.value })} className="w-full p-2 border rounded" />
              </Field>
            </div>
            <Field label="Antécédents allergiques"><textarea rows={2} value={form.patient.allergies} onChange={(e) => setPat('allergies', e.target.value)} className="w-full p-2 border rounded" /></Field>
            <Field label="Problème de déglutition"><input value={form.patient.deglutition} onChange={(e) => setPat('deglutition', e.target.value)} className="w-full p-2 border rounded" /></Field>
            <Field label="Grossesse / allaitement"><input value={form.patient.grossesse_allaitement} onChange={(e) => setPat('grossesse_allaitement', e.target.value)} className="w-full p-2 border rounded" /></Field>
          </fieldset>

          <fieldset className="border rounded-lg p-3 space-y-2">
            <legend className="font-bold px-1">Analyse pharmaceutique</legend>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.analyse.dose_posologie_ok} onChange={(e) => setAna('dose_posologie_ok', e.target.checked)} />
              Dose(s) prescrite(s) et posologie(s) vérifiées
            </label>
            <Field label="Contre-indication(s)"><input value={form.analyse.contre_indications} onChange={(e) => setAna('contre_indications', e.target.value)} className="w-full p-2 border rounded" /></Field>
            <Field label="Interactions / redondances"><input value={form.analyse.interactions} onChange={(e) => setAna('interactions', e.target.value)} className="w-full p-2 border rounded" /></Field>
            <p className="text-xs font-semibold">Justification de la préparation</p>
            <div className="space-y-1">{JUSTIFS.map((j) => (
              <label key={j} className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={(form.analyse.justifications || []).includes(j)} onChange={() => toggleJustif(j)} /> {j}
              </label>
            ))}</div>
            <Field label="Commentaires / précisions"><textarea rows={2} value={form.analyse.commentaires} onChange={(e) => setAna('commentaires', e.target.value)} className="w-full p-2 border rounded" /></Field>
          </fieldset>

          {settings?.internal_prep_enabled && (
            <label className="flex items-center gap-2 text-amber-800 bg-amber-50 p-2 rounded border border-amber-200">
              <input type="checkbox" checked={form.preparation_interne} onChange={(e) => setForm({ ...form, preparation_interne: e.target.checked })} />
              Préparation réalisée en interne (rare — pas d&apos;e-mail prestataire)
            </label>
          )}

          <button type="submit" disabled={loading} className="w-full bg-fuchsia-600 hover:bg-fuchsia-700 text-white font-bold py-3 rounded-lg flex justify-center gap-2">
            <Save size={18} /> {loading ? 'Envoi…' : 'Soumettre la demande (Devis)'}
          </button>
        </form>
      </div>

      <div className="w-2/5 p-6 overflow-y-auto">
        <h3 className="font-bold mb-4">Mes commandes</h3>
        {orders.length === 0 && <p className="text-sm text-slate-500">Aucune commande pour le moment.</p>}
        {orders.map((o) => (
          <div key={o.id} className="bg-white border rounded-lg p-3 mb-3 text-sm">
            <div className="flex justify-between">
              <span className="font-bold">{o.patient_initiales || '—'} {o.prix_calcule != null ? `— ${o.prix_calcule} €` : ''}</span>
              <span className="text-xs bg-slate-100 px-2 py-0.5 rounded">{STATUT_LABELS[o.statut] || o.statut}</span>
            </div>
            <p className="text-xs text-slate-500 mt-1 line-clamp-2">{o.formule}</p>
          </div>
        ))}

        <div className="mt-6 p-4 bg-white border rounded-lg text-sm space-y-2">
          <h4 className="font-bold flex items-center gap-1"><PackageCheck size={16} /> Réceptionner une préparation</h4>
          <Field label="Commande à réceptionner">
            <select value={recvId} onChange={(e) => setRecvId(e.target.value)} className="w-full p-2 border rounded">
              <option value="">— Choisir —</option>
              {orders.filter((o) => o.statut === 'commande').map((o) => (
                <option key={o.id} value={o.id}>{o.patient_initiales} — {new Date(o.created_at).toLocaleDateString('fr-FR')}</option>
              ))}
            </select>
          </Field>
          <Field label="Prix HT net à la réception (€) *" hint="Montant facturé par le prestataire, hors port">
            <input type="number" step="0.01" value={recvHt} onChange={(e) => setRecvHt(e.target.value)} className="w-full p-2 border rounded" />
          </Field>
          <Field label="Taux de TVA (%) *" hint="Saisi pour chaque préparation à la réception">
            <input type="number" step="0.01" required value={recvTva} onChange={(e) => setRecvTva(e.target.value)} className="w-full p-2 border rounded" placeholder="Ex. 5.5" />
          </Field>
          {previewTtc != null && (
            <p className="text-xs text-fuchsia-700">Prix TTC estimé : <strong>{previewTtc} €</strong></p>
          )}
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={notifyPatient} onChange={(e) => setNotifyPatient(e.target.checked)} />
            Prévenir le patient par e-mail (si adresse renseignée)
          </label>
          <button type="button" onClick={handleReceive} disabled={loading || !recvId || !recvHt || recvTva === ''} className="w-full bg-emerald-600 text-white py-2 rounded-lg text-sm font-semibold">Valider réception</button>
        </div>
      </div>
    </div>
  );
}
