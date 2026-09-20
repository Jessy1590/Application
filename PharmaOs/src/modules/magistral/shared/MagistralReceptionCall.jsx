import React, { useState } from 'react';
import { Phone, CheckSquare, ArrowLeft } from 'lucide-react';
import {
  RECEPTION_CHECKLIST_KEYS,
  APPEL_RESULTAT_LABELS,
  calcMagistralPrice,
  saveReceptionControl,
  recordPatientCall,
} from '../services/magistralService.js';

const Field = ({ label, children, hint }) => (
  <div>
    <label className="block text-xs font-semibold text-slate-700 mb-1">{label}</label>
    {children}
    {hint && <p className="text-[11px] text-slate-500 mt-0.5">{hint}</p>}
  </div>
);

const YES_RESULTS = [
  ['disponible_pharmacie', 'Disponible en pharmacie (informé)'],
  ['vient_chercher', 'Vient chercher'],
  ['message_repondeur', 'Message sur le répondeur'],
  ['raccroche', 'Raccroché'],
  ['mauvais_numero', 'Mauvais numéro'],
  ['autre_raison', 'Autres'],
];

/** Résultats qui orientent par défaut vers « à dispenser ». */
const DISPENSE_DEFAULT_RESULTS = new Set(['disponible_pharmacie', 'vient_chercher']);

const NO_REASONS = [
  ['pas_de_numero', 'Pas de numéro'],
  ['autre_raison', 'Autre raison'],
];

/**
 * Réception en 2 phases : checklist BPP 7.12 puis flux appel patient (type Location Contact).
 * Fin d’appel : choix explicite « Mettre à rappeler » ou « À dispenser ».
 */
export default function MagistralReceptionCall({
  order,
  settings,
  userId,
  onDone,
  onCancel,
}) {
  const hasChecklistDone = RECEPTION_CHECKLIST_KEYS.every((k) => order?.reception_checklist?.[k.key]);
  const [phase, setPhase] = useState(hasChecklistDone ? 'call' : 'control');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const [checklist, setChecklist] = useState(() => {
    const c = { ...(order?.reception_checklist || {}) };
    RECEPTION_CHECKLIST_KEYS.forEach((k) => { if (c[k.key] == null) c[k.key] = false; });
    return c;
  });
  const [prixHt, setPrixHt] = useState(order?.prix_ht_net != null ? String(order.prix_ht_net) : '');
  const [tva, setTva] = useState(order?.tva_rate != null ? String(order.tva_rate) : String(settings?.tva_rate ?? '5.5'));
  const [portEx, setPortEx] = useState('');
  const [providerLot, setProviderLot] = useState(order?.provider_lot || '');
  const [providerOrdo, setProviderOrdo] = useState(order?.provider_ordonnancier || '');
  const [providerRef, setProviderRef] = useState(order?.provider_ref || '');
  const [dateFab, setDateFab] = useState(order?.date_fabrication || '');
  const [datePer, setDatePer] = useState(order?.date_peremption || '');
  const [liberationFile, setLiberationFile] = useState(null);
  const [ncReason, setNcReason] = useState('');

  // Call flow
  const [callStep, setCallStep] = useState('ask_call');
  const [note, setNote] = useState('');
  const [pendingResultat, setPendingResultat] = useState(null);
  const [pendingDidCall, setPendingDidCall] = useState(true);
  const [preferDispense, setPreferDispense] = useState(true);
  const [notifyEmail, setNotifyEmail] = useState(!!order?.patient_email);

  const previewTtc = prixHt && settings
    ? calcMagistralPrice(settings, Number(prixHt), Number(tva), portEx !== '' ? Number(portEx) : null)
    : null;

  const toggleCheck = (key) => setChecklist((c) => ({ ...c, [key]: !c[key] }));

  const handleControlOk = async () => {
    setLoading(true); setErr('');
    try {
      const updated = await saveReceptionControl(order.id, userId, {
        checklist,
        prixHtNet: Number(prixHt),
        tvaRate: Number(tva),
        portOverride: portEx !== '' ? Number(portEx) : null,
        provider_lot: providerLot,
        provider_ordonnancier: providerOrdo,
        provider_ref: providerRef,
        date_fabrication: dateFab || null,
        date_peremption: datePer || null,
        liberationFile,
        nc: false,
      });
      setPhase('call');
      onDone?.(updated, { stay: true });
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleControlNc = async () => {
    if (!ncReason.trim()) {
      setErr('Précisez le motif de non-conformité.');
      return;
    }
    setLoading(true); setErr('');
    try {
      const updated = await saveReceptionControl(order.id, userId, {
        checklist,
        prixHtNet: prixHt !== '' ? Number(prixHt) : null,
        tvaRate: tva !== '' ? Number(tva) : null,
        provider_lot: providerLot,
        provider_ordonnancier: providerOrdo,
        provider_ref: providerRef,
        date_fabrication: dateFab || null,
        date_peremption: datePer || null,
        liberationFile,
        nc: true,
        nc_reason: ncReason.trim(),
      });
      onDone?.(updated);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  const finishCall = async ({ did_call, resultat, statut }) => {
    setLoading(true); setErr('');
    try {
      const updated = await recordPatientCall(order.id, userId, {
        did_call,
        resultat,
        statut,
        note: note.trim() || null,
        notifyEmail: notifyEmail && statut === 'termine',
      });
      onDone?.(updated);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  /** Étape finale : choisir à rappeler vs à dispenser. */
  const goDecide = (resultat, did_call) => {
    setPendingResultat(resultat);
    setPendingDidCall(did_call);
    setPreferDispense(DISPENSE_DEFAULT_RESULTS.has(resultat));
    setCallStep('call_decide');
  };

  const phone = order.patient_phone || order.form_data?.patient?.phone || '—';
  const dob = order.form_data?.patient?.dob || '—';
  const allChecked = RECEPTION_CHECKLIST_KEYS.every((k) => checklist[k.key]);

  return (
    <div className="space-y-4 text-sm">
      {err && <div className="p-2 bg-red-50 text-red-700 rounded-lg text-xs">{err}</div>}

      <div className="bg-fuchsia-50 border border-fuchsia-200 rounded-xl p-4 text-center">
        <p className="text-xs text-fuchsia-700 font-semibold uppercase tracking-wide">Patient à appeler</p>
        <p className="text-3xl font-bold text-fuchsia-900 tracking-wide mt-1">{phone}</p>
        <p className="text-sm text-slate-600 mt-1">
          {order.patient_initiales || '—'} · Né(e) le {dob}
        </p>
        <a href={`tel:${phone.replace(/\s/g, '')}`} className="inline-flex items-center gap-1 mt-2 text-fuchsia-700 text-xs font-semibold hover:underline">
          <Phone size={14} /> Appeler
        </a>
      </div>

      {phase === 'control' && (
        <div className="space-y-3 bg-white border rounded-xl p-4">
          <h4 className="font-bold flex items-center gap-2 text-fuchsia-800">
            <CheckSquare size={16} /> Phase A — Contrôle physique (BPP 7.12)
          </h4>
          <div className="space-y-1.5">
            {RECEPTION_CHECKLIST_KEYS.map((k) => (
              <label key={k.key} className="flex items-start gap-2 text-xs">
                <input type="checkbox" checked={!!checklist[k.key]} onChange={() => toggleCheck(k.key)} className="mt-0.5" />
                {k.label}
              </label>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Prix HT net (€) *">
              <input type="number" step="0.01" value={prixHt} onChange={(e) => setPrixHt(e.target.value)} className="w-full p-2 border rounded-lg" placeholder="Montant ST" />
            </Field>
            <Field label="TVA (%) *">
              <input type="number" step="0.01" value={tva} onChange={(e) => setTva(e.target.value)} className="w-full p-2 border rounded-lg" placeholder="5.5" />
            </Field>
            <Field label="Port exceptionnel (€)" hint="Sinon frais port des paramètres">
              <input type="number" step="0.01" value={portEx} onChange={(e) => setPortEx(e.target.value)} className="w-full p-2 border rounded-lg" placeholder="Optionnel" />
            </Field>
            <Field label="Réf. commande ST">
              <input value={providerRef} onChange={(e) => setProviderRef(e.target.value)} className="w-full p-2 border rounded-lg" placeholder="N° devis/commande ST" />
            </Field>
            <Field label="Lot ST *">
              <input value={providerLot} onChange={(e) => setProviderLot(e.target.value)} className="w-full p-2 border rounded-lg" placeholder="N° lot" />
            </Field>
            <Field label="N° ordonnancier ST">
              <input value={providerOrdo} onChange={(e) => setProviderOrdo(e.target.value)} className="w-full p-2 border rounded-lg" placeholder="N° ST" />
            </Field>
            <Field label="Date fabrication">
              <input type="date" value={dateFab} onChange={(e) => setDateFab(e.target.value)} className="w-full p-2 border rounded-lg" />
            </Field>
            <Field label="Date péremption">
              <input type="date" value={datePer} onChange={(e) => setDatePer(e.target.value)} className="w-full p-2 border rounded-lg" />
            </Field>
          </div>
          {previewTtc != null && (
            <p className="text-xs text-fuchsia-700">Prix TTC estimé : <strong>{previewTtc} €</strong></p>
          )}
          <Field label="Certificat de libération (fichier)">
            <input type="file" accept="application/pdf,image/*" onChange={(e) => setLiberationFile(e.target.files?.[0] || null)} className="w-full text-xs" />
          </Field>
          <div className="flex flex-col gap-2 pt-2">
            <button
              type="button"
              disabled={loading || !allChecked || prixHt === '' || tva === '' || !providerLot}
              onClick={handleControlOk}
              className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg"
            >
              Contrôle OK → Appel patient
            </button>
            <Field label="Motif non-conformité (si écart)">
              <input value={ncReason} onChange={(e) => setNcReason(e.target.value)} className="w-full p-2 border rounded-lg" placeholder="Décrire l’écart…" />
            </Field>
            <button
              type="button"
              disabled={loading}
              onClick={handleControlNc}
              className="w-full bg-red-100 text-red-800 font-semibold py-2 rounded-lg"
            >
              Déclarer non conforme + mail ST
            </button>
          </div>
        </div>
      )}

      {phase === 'call' && (
        <div className="space-y-3 bg-white border rounded-xl p-4">
          <h4 className="font-bold flex items-center gap-2 text-fuchsia-800">
            <Phone size={16} /> Phase B — Appel patient
          </h4>

          {callStep === 'ask_call' && (
            <div className="space-y-3">
              <p className="text-sm font-medium">Avez-vous appelé / joint le patient ?</p>
              <div className="flex flex-col gap-2">
                <button type="button" onClick={() => setCallStep('call_yes')} className="bg-fuchsia-600 text-white py-2.5 rounded-lg font-semibold">Oui — saisir le résultat</button>
                <button type="button" onClick={() => setCallStep('call_no')} className="bg-slate-100 py-2.5 rounded-lg font-semibold">Non</button>
              </div>
              <div className="border-t pt-3 space-y-2">
                <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Suite du dossier</p>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => finishCall({ did_call: false, resultat: 'autre_raison', statut: 'a_rappeler' })}
                  className="w-full bg-amber-50 text-amber-900 py-2.5 rounded-lg font-semibold border border-amber-200"
                >
                  Mettre à rappeler
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => finishCall({ did_call: false, resultat: 'disponible_pharmacie', statut: 'termine' })}
                  className="w-full bg-emerald-600 text-white py-2.5 rounded-lg font-semibold"
                >
                  À dispenser
                </button>
              </div>
            </div>
          )}

          {callStep === 'call_yes' && (
            <div className="space-y-2">
              <button type="button" onClick={() => setCallStep('ask_call')} className="text-xs text-slate-500 flex items-center gap-1"><ArrowLeft size={12} /> Retour</button>
              <p className="text-sm font-medium">Résultat de l’appel</p>
              {YES_RESULTS.map(([code, label]) => (
                <button
                  key={code}
                  type="button"
                  className="w-full text-left px-3 py-2 rounded-lg border hover:bg-fuchsia-50 text-sm"
                  onClick={() => {
                    if (code === 'autre_raison') {
                      setPendingDidCall(true);
                      setCallStep('call_yes_autre');
                      return;
                    }
                    goDecide(code, true);
                  }}
                >
                  {label}
                </button>
              ))}
              <Field label="Note">
                <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} className="w-full p-2 border rounded-lg" placeholder="Ton, précisions…" />
              </Field>
            </div>
          )}

          {callStep === 'call_yes_autre' && (
            <div className="space-y-2">
              <button type="button" onClick={() => setCallStep('call_yes')} className="text-xs text-slate-500 flex items-center gap-1"><ArrowLeft size={12} /> Retour</button>
              <p className="text-sm font-medium">Autre — préciser puis choisir la suite</p>
              <Field label="Note *">
                <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} className="w-full p-2 border rounded-lg" placeholder="Préciser…" />
              </Field>
              <button
                type="button"
                disabled={loading || !note.trim()}
                onClick={() => goDecide('autre_raison', true)}
                className="w-full bg-fuchsia-600 text-white py-2 rounded-lg font-semibold disabled:opacity-50"
              >
                Continuer → suite du dossier
              </button>
            </div>
          )}

          {callStep === 'call_decide' && (
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => setCallStep(pendingResultat === 'autre_raison' ? 'call_yes_autre' : 'call_yes')}
                className="text-xs text-slate-500 flex items-center gap-1"
              >
                <ArrowLeft size={12} /> Retour
              </button>
              <p className="text-sm font-medium">Suite du dossier</p>
              {pendingResultat && (
                <p className="text-xs text-slate-500">
                  Résultat : {APPEL_RESULTAT_LABELS[pendingResultat] || pendingResultat}
                  {preferDispense ? ' — orientation : à dispenser' : ' — orientation : à rappeler'}
                </p>
              )}
              <Field label="Note">
                <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} className="w-full p-2 border rounded-lg" placeholder="Optionnel…" />
              </Field>
              <button
                type="button"
                disabled={loading}
                onClick={() => finishCall({
                  did_call: pendingDidCall,
                  resultat: pendingResultat,
                  statut: 'a_rappeler',
                })}
                className={`w-full py-2.5 rounded-lg font-semibold border ${
                  !preferDispense
                    ? 'bg-amber-500 text-white border-amber-600'
                    : 'bg-amber-50 text-amber-900 border-amber-200'
                }`}
              >
                Mettre à rappeler
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => finishCall({
                  did_call: pendingDidCall,
                  resultat: pendingResultat,
                  statut: 'termine',
                })}
                className={`w-full py-2.5 rounded-lg font-semibold ${
                  preferDispense
                    ? 'bg-emerald-600 text-white'
                    : 'bg-emerald-50 text-emerald-900 border border-emerald-200'
                }`}
              >
                À dispenser
              </button>
            </div>
          )}

          {callStep === 'call_no' && (
            <div className="space-y-2">
              <button type="button" onClick={() => setCallStep('ask_call')} className="text-xs text-slate-500 flex items-center gap-1"><ArrowLeft size={12} /> Retour</button>
              <p className="text-sm font-medium">Pourquoi n’avez-vous pas appelé ?</p>
              {NO_REASONS.map(([code, label]) => (
                <button
                  key={code}
                  type="button"
                  className="w-full text-left px-3 py-2 rounded-lg border hover:bg-slate-50 text-sm"
                  onClick={() => {
                    if (code === 'autre_raison') {
                      setCallStep('call_no_autre');
                      return;
                    }
                    goDecide(code, false);
                  }}
                >
                  {label}
                </button>
              ))}
              <Field label="Note">
                <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} className="w-full p-2 border rounded-lg" />
              </Field>
            </div>
          )}

          {callStep === 'call_no_autre' && (
            <div className="space-y-2">
              <button type="button" onClick={() => setCallStep('call_no')} className="text-xs text-slate-500 flex items-center gap-1"><ArrowLeft size={12} /> Retour</button>
              <Field label="Motif *">
                <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} className="w-full p-2 border rounded-lg" placeholder="Préciser…" />
              </Field>
              <button
                type="button"
                disabled={loading || !note.trim()}
                onClick={() => goDecide('autre_raison', false)}
                className="w-full bg-fuchsia-600 text-white py-2 rounded-lg font-semibold disabled:opacity-50"
              >
                Continuer → suite du dossier
              </button>
            </div>
          )}

          {order.patient_email && (
            <label className="flex items-center gap-2 text-xs pt-2 border-t">
              <input type="checkbox" checked={notifyEmail} onChange={(e) => setNotifyEmail(e.target.checked)} />
              Envoyer aussi un e-mail « disponible » si passage à dispenser ({order.patient_email})
            </label>
          )}

          {Array.isArray(order.patient_call?.attempts) && order.patient_call.attempts.length > 0 && (
            <div className="text-[11px] text-slate-500 border-t pt-2 space-y-1">
              <p className="font-semibold">Journal</p>
              {order.patient_call.attempts.map((a, i) => (
                <p key={i}>
                  {new Date(a.at).toLocaleString('fr-FR')} — {APPEL_RESULTAT_LABELS[a.resultat] || a.resultat || '—'} ({a.statut === 'termine' ? 'à dispenser' : 'à rappeler'})
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {onCancel && (
        <button type="button" onClick={onCancel} className="text-xs text-slate-500 underline">Annuler</button>
      )}
    </div>
  );
}
