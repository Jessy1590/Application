import React from 'react';
import {
  JUSTIFS,
  isFieldActive,
  isFieldRequired,
} from '../services/magistralService.js';

const Field = ({ label, children, hint, required, tip }) => (
  <div>
    <label className="block text-xs font-semibold text-slate-700 mb-1">
      <span className="inline-flex items-center gap-1">
        {label}{required ? ' *' : ''}
        {tip && (
          <span className="relative inline-flex group/tip">
            <button
              type="button"
              className="inline-flex items-center justify-center w-4 h-4 rounded-full border border-slate-400 text-[10px] font-bold text-slate-600 bg-white hover:bg-fuchsia-50 hover:border-fuchsia-400 hover:text-fuchsia-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-400"
              aria-label="Aide"
            >
              ?
            </button>
            <span
              role="tooltip"
              className="pointer-events-none absolute left-1/2 bottom-full z-20 mb-1.5 w-64 -translate-x-1/2 rounded-lg bg-slate-800 px-2.5 py-2 text-[11px] font-normal leading-snug text-white opacity-0 shadow-lg transition-opacity group-hover/tip:opacity-100 group-focus-within/tip:opacity-100"
            >
              {tip}
            </span>
          </span>
        )}
      </span>
    </label>
    {children}
    {hint && <p className="text-[11px] text-slate-500 mt-0.5">{hint}</p>}
  </div>
);

const RISQUE_CAT_TIP = (
  <>
    Classification indicative (Annexe III des BPP) selon substance, voie, forme et opérations :
    <br />
    <strong>Cat. 1</strong> — risque faible (exigences de base).
    <br />
    <strong>Cat. 2</strong> — risque moyen (vigilance renforcée).
    <br />
    <strong>Cat. 3</strong> — risque élevé (conditions et contrôles les plus stricts ; ex. stériles / dangereuses).
    <br />
    En sous-traitance, sert surtout à documenter l’analyse ; le ST applique ses propres BPP.
  </>
);

const inputCls = 'w-full p-2 border border-slate-300 rounded-lg bg-slate-50 focus:ring-2 focus:ring-fuchsia-500 focus:border-fuchsia-500';

/**
 * Formulaire partagé — champs actifs/obligatoires selon settings.creation_champs.
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
  settings = null,
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
  const active = (code) => isFieldActive(settings, code);
  const req = (code) => isFieldRequired(settings, code);

  return (
    <div className={`${gap} text-sm`}>
      {show('demande') && (
        <>
          {(active('pharmacy_nom') || active('pharmacy_adresse') || active('pharmacy_email') || active('pharmacy_interlocuteur')) && (
            <fieldset className="border rounded-lg p-3 space-y-2" disabled={readOnly}>
              <legend className="font-bold px-1 text-fuchsia-800">Coordonnées pharmacie</legend>
              {active('pharmacy_nom') && (
                <Field label="Nom de la pharmacie" required={req('pharmacy_nom')}>
                  <input required={req('pharmacy_nom')} placeholder="Nom de l’officine" value={form.pharmacie?.nom || ''} onChange={(e) => patch('pharmacie', 'nom', e.target.value)} className={inputCls} />
                </Field>
              )}
              {active('pharmacy_adresse') && (
                <Field label="Adresse" required={req('pharmacy_adresse')}>
                  <input required={req('pharmacy_adresse')} placeholder="Adresse complète" value={form.pharmacie?.adresse || ''} onChange={(e) => patch('pharmacie', 'adresse', e.target.value)} className={inputCls} />
                </Field>
              )}
              <div className="grid grid-cols-2 gap-2">
                {active('pharmacy_email') && (
                  <Field label="E-mail pharmacie" required={req('pharmacy_email')}>
                    <input required={req('pharmacy_email')} type="email" placeholder="contact@pharmacie.fr" value={form.pharmacie?.email || ''} onChange={(e) => patch('pharmacie', 'email', e.target.value)} className={inputCls} />
                  </Field>
                )}
                {active('pharmacy_interlocuteur') && (
                  <Field label="Interlocuteur" required={req('pharmacy_interlocuteur')}>
                    <input required={req('pharmacy_interlocuteur')} placeholder="Nom du pharmacien" value={form.pharmacie?.interlocuteur || ''} onChange={(e) => patch('pharmacie', 'interlocuteur', e.target.value)} className={inputCls} />
                  </Field>
                )}
              </div>
            </fieldset>
          )}

          <fieldset className="border rounded-lg p-3 space-y-2" disabled={readOnly}>
            <legend className="font-bold px-1 text-fuchsia-800">Demande / prescription</legend>
            <div className="grid grid-cols-2 gap-2">
              {active('demande_nature') && (
                <Field label="Nature" required={req('demande_nature')} hint="Commande = envoi direct ST. Devis = devis ST puis accord patient.">
                  <select required={req('demande_nature')} value={form.demande?.nature || 'commande'} onChange={(e) => patch('demande', 'nature', e.target.value)} className={inputCls}>
                    <option value="commande">Commande (attente réception)</option>
                    <option value="devis">Devis (accord patient après devis ST)</option>
                  </select>
                </Field>
              )}
              {active('demande_historique') && (
                <Field label="Historique" required={req('demande_historique')}>
                  <select required={req('demande_historique')} value={form.demande?.historique || 'premiere'} onChange={(e) => patch('demande', 'historique', e.target.value)} className={inputCls}>
                    <option value="premiere">1ère demande</option>
                    <option value="renouvellement">Renouvellement</option>
                  </select>
                </Field>
              )}
              {active('demande_prescripteur') && (
                <Field label="Prescripteur" required={req('demande_prescripteur')}>
                  <input required={req('demande_prescripteur')} placeholder="Dr …" value={form.demande?.prescripteur || ''} onChange={(e) => patch('demande', 'prescripteur', e.target.value)} className={inputCls} />
                </Field>
              )}
              {active('demande_date_ordo') && (
                <Field label="Date ordonnance" required={req('demande_date_ordo')}>
                  <input required={req('demande_date_ordo')} type="date" value={form.demande?.date_ordo || ''} onChange={(e) => patch('demande', 'date_ordo', e.target.value)} className={inputCls} />
                </Field>
              )}
              {active('demande_voie') && (
                <Field label="Voie d’administration" required={req('demande_voie')}>
                  <input required={req('demande_voie')} placeholder="Ex. orale, cutanée…" value={form.demande?.voie_admin || ''} onChange={(e) => patch('demande', 'voie_admin', e.target.value)} className={inputCls} />
                </Field>
              )}
              {active('demande_forme') && (
                <Field label="Forme" required={req('demande_forme')}>
                  <input required={req('demande_forme')} placeholder="Gélules, pommade…" value={form.demande?.forme || ''} onChange={(e) => patch('demande', 'forme', e.target.value)} className={inputCls} />
                </Field>
              )}
              {active('demande_quantite') && (
                <Field label="Quantité" required={req('demande_quantite')}>
                  <input required={req('demande_quantite')} type="number" step="0.01" min="0" placeholder="1" value={form.demande?.quantite ?? '1'} onChange={(e) => patch('demande', 'quantite', e.target.value)} className={inputCls} />
                </Field>
              )}
              {active('demande_posologie') && (
                <Field label="Posologie" required={req('demande_posologie')}>
                  <input required={req('demande_posologie')} placeholder="Ex. 1 gélule 2×/j" value={form.demande?.posologie || ''} onChange={(e) => patch('demande', 'posologie', e.target.value)} className={inputCls} />
                </Field>
              )}
              {active('demande_duree') && (
                <Field label="Durée" required={req('demande_duree')}>
                  <input required={req('demande_duree')} placeholder="Ex. 30 jours" value={form.demande?.duree || ''} onChange={(e) => patch('demande', 'duree', e.target.value)} className={inputCls} />
                </Field>
              )}
            </div>
            {active('demande_formule') && (
              <Field label="Formule (composition quantitative)" required={req('demande_formule')} hint="Saisie lisible pour le prestataire">
                <textarea required={req('demande_formule')} rows={compact ? 3 : 4} placeholder="Composition…" value={form.demande?.formule || ''} onChange={(e) => patch('demande', 'formule', e.target.value)} className={`${inputCls} font-mono text-xs`} />
              </Field>
            )}
          </fieldset>
        </>
      )}

      {show('patient') && (
        <fieldset className="border rounded-lg p-3 space-y-2" disabled={readOnly}>
          <legend className="font-bold px-1 text-fuchsia-800">Patient (pseudonymisé)</legend>
          <div className="grid grid-cols-3 gap-2">
            {active('patient_nom') && (
              <Field label="Nom (2 lett.)" required={req('patient_nom')}>
                <input required={req('patient_nom')} maxLength={2} placeholder="DU" value={form.patient?.nom || ''} onChange={(e) => patch('patient', 'nom', e.target.value.toUpperCase())} className={`${inputCls} uppercase`} />
              </Field>
            )}
            {active('patient_prenom') && (
              <Field label="Prénom (2 lett.)" required={req('patient_prenom')}>
                <input required={req('patient_prenom')} maxLength={2} placeholder="JE" value={form.patient?.prenom || ''} onChange={(e) => patch('patient', 'prenom', e.target.value.toUpperCase())} className={`${inputCls} uppercase`} />
              </Field>
            )}
            {active('patient_dob') && (
              <Field label="Date de naissance" required={req('patient_dob')}>
                <input required={req('patient_dob')} type="date" value={form.patient?.dob || ''} onChange={(e) => patch('patient', 'dob', e.target.value)} className={inputCls} />
              </Field>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {active('patient_type') && (
              <Field label="Type de préparation" required={req('patient_type')}>
                <select required={req('patient_type')} value={form.patient?.type_prep || 'ad'} onChange={(e) => patch('patient', 'type_prep', e.target.value)} className={inputCls}>
                  <option value="ad">Adulte</option>
                  <option value="ped">Pédiatrique</option>
                  <option value="vet">Vétérinaire</option>
                </select>
              </Field>
            )}
            {active('patient_poids') && (
              <Field label="Poids (kg)" required={req('patient_poids')} hint="Recommandé en pédiatrie">
                <input required={req('patient_poids')} type="number" step="0.1" placeholder="Ex. 12.5" value={form.patient?.poids || ''} onChange={(e) => patch('patient', 'poids', e.target.value)} className={inputCls} />
              </Field>
            )}
            {active('patient_phone') && (
              <Field label="Téléphone patient" required={req('patient_phone')} hint="Affiché à la réception pour l’appel">
                <input required={req('patient_phone')} type="tel" placeholder="06 12 34 56 78" value={form.patient?.phone || ''} onChange={(e) => patch('patient', 'phone', e.target.value)} className={inputCls} />
              </Field>
            )}
            {active('patient_email') && (
              <Field label="E-mail patient" required={req('patient_email')} hint="Notification complémentaire">
                <input required={req('patient_email')} type="email" placeholder="patient@email.fr" value={form.patient_email || ''} onChange={(e) => patch(null, 'patient_email', e.target.value)} className={inputCls} />
              </Field>
            )}
          </div>
          {active('patient_allergies') && (
            <Field label="Antécédents allergiques" required={req('patient_allergies')}>
              <textarea required={req('patient_allergies')} rows={2} placeholder="Allergies connues…" value={form.patient?.allergies || ''} onChange={(e) => patch('patient', 'allergies', e.target.value)} className={inputCls} />
            </Field>
          )}
          {active('patient_deglutition') && (
            <Field label="Problème de déglutition" required={req('patient_deglutition')}>
              <input required={req('patient_deglutition')} placeholder="Oui / Non / Précisions" value={form.patient?.deglutition || ''} onChange={(e) => patch('patient', 'deglutition', e.target.value)} className={inputCls} />
            </Field>
          )}
          {active('patient_grossesse') && (
            <Field label="Grossesse / allaitement" required={req('patient_grossesse')}>
              <input required={req('patient_grossesse')} placeholder="Le cas échéant" value={form.patient?.grossesse_allaitement || ''} onChange={(e) => patch('patient', 'grossesse_allaitement', e.target.value)} className={inputCls} />
            </Field>
          )}
        </fieldset>
      )}

      {show('analyse') && (
        <fieldset className="border rounded-lg p-3 space-y-2" disabled={readOnly}>
          <legend className="font-bold px-1 text-fuchsia-800">Analyse pharmaceutique (Annexe I)</legend>
          {active('analyse_dose') && (
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={!!form.analyse?.dose_posologie_ok} onChange={(e) => patch('analyse', 'dose_posologie_ok', e.target.checked)} />
              Dose(s) prescrite(s) et posologie(s) vérifiées{req('analyse_dose') ? ' *' : ''}
            </label>
          )}
          {active('analyse_ci') && (
            <Field label="Contre-indication(s)" required={req('analyse_ci')}>
              <input required={req('analyse_ci')} placeholder="Aucune / préciser" value={form.analyse?.contre_indications || ''} onChange={(e) => patch('analyse', 'contre_indications', e.target.value)} className={inputCls} />
            </Field>
          )}
          {active('analyse_interactions') && (
            <Field label="Interactions / redondances" required={req('analyse_interactions')}>
              <input required={req('analyse_interactions')} placeholder="Aucune / préciser" value={form.analyse?.interactions || ''} onChange={(e) => patch('analyse', 'interactions', e.target.value)} className={inputCls} />
            </Field>
          )}
          {active('analyse_justifs') && (
            <>
              <p className="text-xs font-semibold">Justification de la préparation{req('analyse_justifs') ? ' *' : ''}</p>
              <div className="space-y-1">
                {JUSTIFS.map((j) => (
                  <label key={j} className="flex items-center gap-2 text-xs">
                    <input type="checkbox" checked={(form.analyse?.justifications || []).includes(j)} onChange={() => toggleJustif(j)} /> {j}
                  </label>
                ))}
              </div>
            </>
          )}
          <div className="grid grid-cols-2 gap-2">
            {active('analyse_ameli') && (
              <Field label="Mention Ameli sur l’ordo ?" required={req('analyse_ameli')}>
                <select required={req('analyse_ameli')} value={form.analyse?.mention_ameli || 'na'} onChange={(e) => patch('analyse', 'mention_ameli', e.target.value)} className={inputCls}>
                  <option value="oui">Oui</option>
                  <option value="non">Non</option>
                  <option value="na">N/A</option>
                </select>
              </Field>
            )}
            {active('analyse_risque') && (
              <Field
                label="Évaluation risque (indicative)"
                required={req('analyse_risque')}
                tip={RISQUE_CAT_TIP}
              >
                <select required={req('analyse_risque')} value={form.analyse?.risque_cat || '1'} onChange={(e) => patch('analyse', 'risque_cat', e.target.value)} className={inputCls}>
                  <option value="1">Catégorie 1 — risque faible</option>
                  <option value="2">Catégorie 2 — risque moyen</option>
                  <option value="3">Catégorie 3 — risque élevé</option>
                </select>
              </Field>
            )}
            {active('analyse_decision') && (
              <Field label="Décision" required={req('analyse_decision')}>
                <select required={req('analyse_decision')} value={form.analyse?.decision || 'st'} onChange={(e) => patch('analyse', 'decision', e.target.value)} className={inputCls}>
                  <option value="st">Réaliser en sous-traitance</option>
                  <option value="refuser">Refuser</option>
                  <option value="prescripteur">Contacter le prescripteur</option>
                </select>
              </Field>
            )}
          </div>
          {active('analyse_commentaires') && (
            <Field label="Commentaires / précisions" required={req('analyse_commentaires')}>
              <textarea required={req('analyse_commentaires')} rows={2} placeholder="Notes d’analyse…" value={form.analyse?.commentaires || ''} onChange={(e) => patch('analyse', 'commentaires', e.target.value)} className={inputCls} />
            </Field>
          )}
        </fieldset>
      )}

      {show('pieces') && (
        <fieldset className="border rounded-lg p-3 space-y-2" disabled={readOnly}>
          <legend className="font-bold px-1 text-fuchsia-800">Pièces jointes</legend>
          {active('ordonnance') && (
            <Field label="Ordonnance (PDF / image)" required={req('ordonnance')} hint="Stockée dans le bucket magistral-ordonnances">
              <input
                type="file"
                required={req('ordonnance') && !ordonnanceFile}
                accept="application/pdf,image/jpeg,image/png,image/webp"
                onChange={(e) => onOrdonnanceChange?.(e.target.files?.[0] || null)}
                className="w-full text-xs"
              />
              {ordonnanceFile && <p className="text-[11px] text-emerald-700 mt-1">Fichier sélectionné : {ordonnanceFile.name}</p>}
            </Field>
          )}
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
