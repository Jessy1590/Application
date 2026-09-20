import React from 'react';
import { JUSTIFS } from '../services/magistralService.js';

const Field = ({ label, children, hint }) => (
  <div>
    <label className="block text-xs font-semibold text-slate-700 mb-1">{label}</label>
    {children}
    {hint && <p className="text-[11px] text-slate-500 mt-0.5">{hint}</p>}
  </div>
);

const inputCls = 'w-full p-2 border border-slate-300 rounded-lg bg-slate-50 focus:ring-2 focus:ring-fuchsia-500 focus:border-fuchsia-500';

/**
 * Formulaire partagé comptoir / dashboard — Annexe I + téléphone patient obligatoire.
 * @param {'full'|'demande'|'patient'|'analyse'|'pieces'} [step] — filtre wizard ; full = tout
 */
export default function MagistralOrderForm({
  form,
  onChange,
  compact = false,
  step = 'full',
  showInternalPrep = false,
  ordonnanceFile = null,
  onOrdonnanceChange = null,
  readOnly = false,
}) {
  const patch = (section, key, value) => {
    if (readOnly) return;
    if (section == null) onChange({ [key]: value });
    else onChange({ [section]: { ...form[section], [key]: value } });
  };

  const toggleJustif = (j) => {
    if (readOnly) return;
    const cur = form.analyse?.justifications || [];
    patch('analyse', 'justifications', cur.includes(j) ? cur.filter((x) => x !== j) : [...cur, j]);
  };

  const show = (s) => step === 'full' || step === s;
  const gap = compact ? 'space-y-2' : 'space-y-3';

  return (
    <div className={`${gap} text-sm`}>
      {show('demande') && (
        <>
          <fieldset className="border rounded-lg p-3 space-y-2" disabled={readOnly}>
            <legend className="font-bold px-1 text-fuchsia-800">Coordonnées pharmacie</legend>
            <Field label="Nom de la pharmacie *">
              <input required placeholder="Nom de l’officine" value={form.pharmacie?.nom || ''} onChange={(e) => patch('pharmacie', 'nom', e.target.value)} className={inputCls} />
            </Field>
            <Field label="Adresse *">
              <input required placeholder="Adresse complète" value={form.pharmacie?.adresse || ''} onChange={(e) => patch('pharmacie', 'adresse', e.target.value)} className={inputCls} />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="E-mail pharmacie *">
                <input required type="email" placeholder="contact@pharmacie.fr" value={form.pharmacie?.email || ''} onChange={(e) => patch('pharmacie', 'email', e.target.value)} className={inputCls} />
              </Field>
              <Field label="Interlocuteur *">
                <input required placeholder="Nom du pharmacien" value={form.pharmacie?.interlocuteur || ''} onChange={(e) => patch('pharmacie', 'interlocuteur', e.target.value)} className={inputCls} />
              </Field>
            </div>
          </fieldset>

          <fieldset className="border rounded-lg p-3 space-y-2" disabled={readOnly}>
            <legend className="font-bold px-1 text-fuchsia-800">Demande / prescription</legend>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Nature *">
                <select value={form.demande?.nature || 'devis'} onChange={(e) => patch('demande', 'nature', e.target.value)} className={inputCls}>
                  <option value="devis">Devis</option>
                  <option value="commande">Commande</option>
                </select>
              </Field>
              <Field label="Historique *">
                <select value={form.demande?.historique || 'premiere'} onChange={(e) => patch('demande', 'historique', e.target.value)} className={inputCls}>
                  <option value="premiere">1ère demande</option>
                  <option value="renouvellement">Renouvellement</option>
                </select>
              </Field>
              <Field label="Prescripteur *">
                <input required placeholder="Dr …" value={form.demande?.prescripteur || ''} onChange={(e) => patch('demande', 'prescripteur', e.target.value)} className={inputCls} />
              </Field>
              <Field label="Date ordonnance">
                <input type="date" value={form.demande?.date_ordo || ''} onChange={(e) => patch('demande', 'date_ordo', e.target.value)} className={inputCls} />
              </Field>
              <Field label="Voie d’administration *">
                <input required placeholder="Ex. orale, cutanée…" value={form.demande?.voie_admin || ''} onChange={(e) => patch('demande', 'voie_admin', e.target.value)} className={inputCls} />
              </Field>
              <Field label="Forme *">
                <input required placeholder="Gélules, pommade…" value={form.demande?.forme || ''} onChange={(e) => patch('demande', 'forme', e.target.value)} className={inputCls} />
              </Field>
              <Field label="Quantité *">
                <input required type="number" step="0.01" min="0" placeholder="1" value={form.demande?.quantite ?? '1'} onChange={(e) => patch('demande', 'quantite', e.target.value)} className={inputCls} />
              </Field>
              <Field label="Posologie">
                <input placeholder="Ex. 1 gélule 2×/j" value={form.demande?.posologie || ''} onChange={(e) => patch('demande', 'posologie', e.target.value)} className={inputCls} />
              </Field>
              <Field label="Durée">
                <input placeholder="Ex. 30 jours" value={form.demande?.duree || ''} onChange={(e) => patch('demande', 'duree', e.target.value)} className={inputCls} />
              </Field>
            </div>
            <Field label="Formule * (composition quantitative)" hint="Saisie lisible pour le prestataire">
              <textarea required rows={compact ? 3 : 4} placeholder="Composition…" value={form.demande?.formule || ''} onChange={(e) => patch('demande', 'formule', e.target.value)} className={`${inputCls} font-mono text-xs`} />
            </Field>
          </fieldset>
        </>
      )}

      {show('patient') && (
        <fieldset className="border rounded-lg p-3 space-y-2" disabled={readOnly}>
          <legend className="font-bold px-1 text-fuchsia-800">Patient (pseudonymisé)</legend>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Nom (2 lett.) *">
              <input required maxLength={2} placeholder="DU" value={form.patient?.nom || ''} onChange={(e) => patch('patient', 'nom', e.target.value.toUpperCase())} className={`${inputCls} uppercase`} />
            </Field>
            <Field label="Prénom (2 lett.) *">
              <input required maxLength={2} placeholder="JE" value={form.patient?.prenom || ''} onChange={(e) => patch('patient', 'prenom', e.target.value.toUpperCase())} className={`${inputCls} uppercase`} />
            </Field>
            <Field label="Date de naissance *">
              <input required type="date" value={form.patient?.dob || ''} onChange={(e) => patch('patient', 'dob', e.target.value)} className={inputCls} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Type de préparation *">
              <select value={form.patient?.type_prep || 'ad'} onChange={(e) => patch('patient', 'type_prep', e.target.value)} className={inputCls}>
                <option value="ad">Adulte</option>
                <option value="ped">Pédiatrique</option>
                <option value="vet">Vétérinaire</option>
              </select>
            </Field>
            <Field label="Poids (kg)" hint="Recommandé en pédiatrie">
              <input type="number" step="0.1" placeholder="Ex. 12.5" value={form.patient?.poids || ''} onChange={(e) => patch('patient', 'poids', e.target.value)} className={inputCls} />
            </Field>
            <Field label="Téléphone patient *" hint="Obligatoire — affiché à la réception pour l’appel">
              <input required type="tel" placeholder="06 12 34 56 78" value={form.patient?.phone || ''} onChange={(e) => patch('patient', 'phone', e.target.value)} className={inputCls} />
            </Field>
            <Field label="E-mail patient (optionnel)" hint="Notification complémentaire">
              <input type="email" placeholder="patient@email.fr" value={form.patient_email || ''} onChange={(e) => patch(null, 'patient_email', e.target.value)} className={inputCls} />
            </Field>
          </div>
          <Field label="Antécédents allergiques">
            <textarea rows={2} placeholder="Allergies connues…" value={form.patient?.allergies || ''} onChange={(e) => patch('patient', 'allergies', e.target.value)} className={inputCls} />
          </Field>
          <Field label="Problème de déglutition">
            <input placeholder="Oui / Non / Précisions" value={form.patient?.deglutition || ''} onChange={(e) => patch('patient', 'deglutition', e.target.value)} className={inputCls} />
          </Field>
          <Field label="Grossesse / allaitement">
            <input placeholder="Le cas échéant" value={form.patient?.grossesse_allaitement || ''} onChange={(e) => patch('patient', 'grossesse_allaitement', e.target.value)} className={inputCls} />
          </Field>
        </fieldset>
      )}

      {show('analyse') && (
        <fieldset className="border rounded-lg p-3 space-y-2" disabled={readOnly}>
          <legend className="font-bold px-1 text-fuchsia-800">Analyse pharmaceutique (Annexe I)</legend>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={!!form.analyse?.dose_posologie_ok} onChange={(e) => patch('analyse', 'dose_posologie_ok', e.target.checked)} />
            Dose(s) prescrite(s) et posologie(s) vérifiées
          </label>
          <Field label="Contre-indication(s)">
            <input placeholder="Aucune / préciser" value={form.analyse?.contre_indications || ''} onChange={(e) => patch('analyse', 'contre_indications', e.target.value)} className={inputCls} />
          </Field>
          <Field label="Interactions / redondances">
            <input placeholder="Aucune / préciser" value={form.analyse?.interactions || ''} onChange={(e) => patch('analyse', 'interactions', e.target.value)} className={inputCls} />
          </Field>
          <p className="text-xs font-semibold">Justification de la préparation (valeur ajoutée)</p>
          <div className="space-y-1">
            {JUSTIFS.map((j) => (
              <label key={j} className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={(form.analyse?.justifications || []).includes(j)} onChange={() => toggleJustif(j)} /> {j}
              </label>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Mention Ameli sur l’ordo ?" hint="Aide prise en charge — pas de moteur LGO">
              <select value={form.analyse?.mention_ameli || 'na'} onChange={(e) => patch('analyse', 'mention_ameli', e.target.value)} className={inputCls}>
                <option value="oui">Oui</option>
                <option value="non">Non</option>
                <option value="na">N/A</option>
              </select>
            </Field>
            <Field label="Évaluation risque (indicative)" hint="Annexe III BPP — informative">
              <select value={form.analyse?.risque_cat || '1'} onChange={(e) => patch('analyse', 'risque_cat', e.target.value)} className={inputCls}>
                <option value="1">Catégorie 1</option>
                <option value="2">Catégorie 2</option>
                <option value="3">Catégorie 3</option>
              </select>
            </Field>
            <Field label="Décision *">
              <select value={form.analyse?.decision || 'st'} onChange={(e) => patch('analyse', 'decision', e.target.value)} className={inputCls}>
                <option value="st">Réaliser en sous-traitance</option>
                <option value="refuser">Refuser</option>
                <option value="prescripteur">Contacter le prescripteur</option>
              </select>
            </Field>
          </div>
          <Field label="Commentaires / précisions">
            <textarea rows={2} placeholder="Notes d’analyse…" value={form.analyse?.commentaires || ''} onChange={(e) => patch('analyse', 'commentaires', e.target.value)} className={inputCls} />
          </Field>
        </fieldset>
      )}

      {show('pieces') && (
        <fieldset className="border rounded-lg p-3 space-y-2" disabled={readOnly}>
          <legend className="font-bold px-1 text-fuchsia-800">Pièces jointes</legend>
          <Field label="Ordonnance (PDF / image)" hint="Stockée dans le bucket magistral-ordonnances">
            <input
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp"
              onChange={(e) => onOrdonnanceChange?.(e.target.files?.[0] || null)}
              className="w-full text-xs"
            />
            {ordonnanceFile && <p className="text-[11px] text-emerald-700 mt-1">Fichier sélectionné : {ordonnanceFile.name}</p>}
          </Field>
          {showInternalPrep && (
            <label className="flex items-center gap-2 text-amber-800 bg-amber-50 p-2 rounded border border-amber-200">
              <input type="checkbox" checked={!!form.preparation_interne} onChange={(e) => patch(null, 'preparation_interne', e.target.checked)} />
              Préparation réalisée en interne (rare — pas d&apos;e-mail prestataire)
            </label>
          )}
        </fieldset>
      )}
    </div>
  );
}
