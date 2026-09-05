import React from 'react';

const PROBLEMES = [
  '1- Contre-indication/Non-conformité',
  '2- Problème de posologie',
  '3- Interaction Médicamenteuse',
  '4- Effet indésirable',
  '5- Oubli de prescription',
  '6- Médicament non reçu (Rupture/Inobservance)',
  '7- Prescription d\'un médicament non justifié',
  '8- Redondance',
  '9- Prescription non conforme',
  '10- Monitorage à suivre',
  '11- Pharmacodépendance',
];

const INTERVENTIONS = [
  '1. Adaptation posologique',
  '2. Choix de la voie d\'administration',
  '3. Amélioration de la méthode de dispensation',
  '4. Suivi thérapeutique',
  '5. Ajout (prescription nouvelle)',
  '6. Changement de médicament',
  '7. Arrêt ou refus de délivrer',
];

const TRANSMISSIONS = [
  'Oralement',
  'Appel téléphonique',
  'Papier',
  'Voie électronique sécurisée',
  'Texto/Messagerie instantanée',
];

const AVIS = [
  { value: 'Accepte', label: 'Accepté' },
  { value: 'Refuse', label: 'Refusé' },
  { value: 'Non joignable', label: 'Non joignable' },
  { value: 'Non contacte', label: 'Non contacté' },
];

const DEVENIRS = [
  '1. Acceptée par le prescripteur',
  '2. Non acceptée sans motif',
  '3. Non acceptée avec motif',
  '4. Refus délivrance avec appel',
  '5. Refus délivrance sans appel',
  '6. Acceptation patient (sans appel doc)',
  '7. Non acceptation patient',
];

export const IP_FORM_DEFAULTS = {
  patient_initiales: '',
  patient_age: '',
  patient_sexe: 'M',
  medecin_id: '',
  medecin_nom_libre: '',
  medicament_en_cause: '',
  probleme_identifie: PROBLEMES[0],
  type_intervention: INTERVENTIONS[0],
  avis_prescripteur: 'Non contacte',
  devenir_intervention: DEVENIRS[0],
  mode_transmission: 'Appel téléphonique',
  commentaires: '',
};

/**
 * Formulaire Act-IP partagé comptoir / dashboard.
 * @param {boolean} requireCore — champs obligatoires pour une validation complète
 */
export default function IpForm({
  form,
  onChange,
  doctors = [],
  requireCore = true,
  addDoctorNote,
  setAddDoctorNote,
  doctorNoteText,
  setDoctorNoteText,
}) {
  const set = (key) => (e) => onChange({ [key]: e.target.value });
  const input = 'w-full p-2 border rounded-lg focus:ring-2 focus:ring-indigo-500';

  return (
    <div className="space-y-5 text-sm">
      <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
        <h3 className="font-bold text-slate-700 mb-3 border-b pb-2">1. Patient</h3>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block font-semibold mb-1">Initiales</label>
            <input
              type="text"
              required={requireCore}
              maxLength={4}
              placeholder="Ex: DUJE"
              value={form.patient_initiales || ''}
              onChange={(e) => onChange({ patient_initiales: e.target.value.toUpperCase() })}
              className={`${input} uppercase`}
            />
          </div>
          <div>
            <label className="block font-semibold mb-1">Âge</label>
            <input
              type="number"
              placeholder="Ex: 67"
              value={form.patient_age || ''}
              onChange={set('patient_age')}
              className={input}
            />
          </div>
          <div>
            <label className="block font-semibold mb-1">Sexe</label>
            <select value={form.patient_sexe || 'M'} onChange={set('patient_sexe')} className={input}>
              <option value="M">M</option>
              <option value="F">F</option>
            </select>
          </div>
        </div>
      </div>

      <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
        <h3 className="font-bold text-slate-700 mb-3 border-b pb-2">2. Prescripteur</h3>
        <div className="grid grid-cols-2 gap-4 mb-3">
          <div>
            <label className="block font-semibold mb-1">Depuis l&apos;annuaire</label>
            <select value={form.medecin_id || ''} onChange={set('medecin_id')} className={input}>
              <option value="">— Autre médecin (texte libre) —</option>
              {doctors.map((doc) => (
                <option key={doc.id} value={doc.id}>Dr. {doc.nom} {doc.prenom}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block font-semibold mb-1">Ou saisie manuelle</label>
            <input
              type="text"
              placeholder="Nom du médecin"
              disabled={!!form.medecin_id}
              value={form.medecin_nom_libre || ''}
              onChange={set('medecin_nom_libre')}
              className={`${input} disabled:bg-slate-200`}
            />
          </div>
        </div>
        {form.medecin_id && setAddDoctorNote && (
          <div className="bg-indigo-50 p-3 rounded-lg border border-indigo-100">
            <label className="flex items-center gap-2 cursor-pointer font-medium text-indigo-900 mb-2">
              <input
                type="checkbox"
                checked={!!addDoctorNote}
                onChange={(e) => setAddDoctorNote(e.target.checked)}
                className="rounded text-indigo-600"
              />
              Ajouter une note de rupture/changement dans le dossier du médecin
            </label>
            {addDoctorNote && (
              <input
                type="text"
                value={doctorNoteText}
                onChange={(e) => setDoctorNoteText(e.target.value)}
                className="w-full p-2 border border-indigo-200 rounded text-xs"
                placeholder="Ex: Colchimax → Colchicine le 03/09/26"
              />
            )}
          </div>
        )}
      </div>

      <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
        <h3 className="font-bold text-slate-700 mb-3 border-b pb-2">3. Problème et intervention (SFPC)</h3>
        <div className="mb-4">
          <label className="block font-semibold mb-1">Médicament en cause</label>
          <input
            type="text"
            required={requireCore}
            placeholder="Ex: Doliprane 1000 mg"
            value={form.medicament_en_cause || ''}
            onChange={set('medicament_en_cause')}
            className={input}
          />
        </div>
        <div className="mb-4">
          <label className="block font-semibold mb-1">Identification du problème</label>
          <select value={form.probleme_identifie} onChange={set('probleme_identifie')} className={input}>
            {PROBLEMES.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block font-semibold mb-1">Intervention</label>
          <select value={form.type_intervention} onChange={set('type_intervention')} className={input}>
            {INTERVENTIONS.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
        <h3 className="font-bold text-slate-700 mb-3 border-b pb-2">4. Résultat &amp; transmission</h3>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block font-semibold mb-1">Transmission</label>
            <select value={form.mode_transmission} onChange={set('mode_transmission')} className={input}>
              {TRANSMISSIONS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block font-semibold mb-1">Avis du prescripteur</label>
            <select value={form.avis_prescripteur} onChange={set('avis_prescripteur')} className={input}>
              {AVIS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>
          <div className="col-span-2">
            <label className="block font-semibold mb-1">Devenir de l&apos;intervention</label>
            <select value={form.devenir_intervention} onChange={set('devenir_intervention')} className={input}>
              {DEVENIRS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="block font-semibold mb-1">Détail du contexte</label>
          <textarea
            rows={3}
            placeholder="Notes, contexte de l’appel…"
            value={form.commentaires || ''}
            onChange={set('commentaires')}
            className={input}
          />
        </div>
      </div>
    </div>
  );
}
