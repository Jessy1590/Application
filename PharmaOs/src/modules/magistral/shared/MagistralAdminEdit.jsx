import React, { useMemo } from 'react';
import {
  MAGISTRAL_STATUTS,
  APPEL_RESULTAT_LABELS,
  RECEPTION_CHECKLIST_KEYS,
  calcMagistralPrice,
} from '../services/magistralService.js';
import MagistralOrderForm from './MagistralOrderForm.jsx';

const Field = ({ label, children, hint }) => (
  <div>
    <label className="block text-xs font-semibold text-slate-700 mb-1">{label}</label>
    {children}
    {hint && <p className="text-[11px] text-slate-500 mt-0.5">{hint}</p>}
  </div>
);

const inputCls = 'w-full p-2 border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-fuchsia-500 focus:border-fuchsia-500';

/**
 * Formulaire édition admin complète d’un dossier magistral (dashboard Suivi).
 * @param {{ draft: object, onChange: (patch: object) => void, settings?: object, ordonnanceFile?: File|null, liberationFile?: File|null, onOrdonnanceFile?: Function, onLiberationFile?: Function }} props
 */
export default function MagistralAdminEdit({
  draft,
  onChange,
  settings = null,
  ordonnanceFile = null,
  liberationFile = null,
  onOrdonnanceFile = null,
  onLiberationFile = null,
}) {
  const patch = (p) => onChange(p);
  const patchForm = (p) => {
    const nextForm = { ...draft.form, ...p };
    const sync = {};
    if (p.demande) {
      if (p.demande.formule != null) sync.formule = p.demande.formule;
      if (p.demande.forme != null) sync.forme = p.demande.forme;
      if (p.demande.quantite != null) sync.quantite = p.demande.quantite;
    }
    if (p.patient?.phone != null) sync.patient_phone = p.patient.phone;
    if (p.patient_email != null) sync.patient_email = p.patient_email;
    onChange({ form: nextForm, ...sync });
  };

  const previewPrix = useMemo(() => {
    if (!settings || draft.prix_ht_net === '' || draft.prix_ht_net == null) return null;
    const port = draft.port_override !== '' && draft.port_override != null
      ? Number(draft.port_override)
      : null;
    return calcMagistralPrice(settings, Number(draft.prix_ht_net), Number(draft.tva_rate || 0), port);
  }, [settings, draft.prix_ht_net, draft.tva_rate, draft.port_override]);

  const toggleCheck = (key) => {
    patch({
      reception_checklist: {
        ...draft.reception_checklist,
        [key]: !draft.reception_checklist?.[key],
      },
    });
  };

  return (
    <div className="space-y-4 text-sm max-h-[70vh] overflow-y-auto pr-1">
      <fieldset className="border border-amber-200 bg-amber-50/40 rounded-lg p-3 space-y-2">
        <legend className="font-bold px-1 text-amber-900">Statut &amp; identité</legend>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Statut *">
            <select
              value={draft.statut || ''}
              onChange={(e) => patch({ statut: e.target.value })}
              className={inputCls}
            >
              {Object.entries(MAGISTRAL_STATUTS).map(([k, lab]) => (
                <option key={k} value={k}>{lab}</option>
              ))}
            </select>
          </Field>
          <Field label="Initiales patient">
            <input
              value={draft.patient_initiales || ''}
              onChange={(e) => patch({ patient_initiales: e.target.value.toUpperCase() })}
              className={`${inputCls} uppercase`}
              placeholder="Ex. JEDU"
            />
          </Field>
          <Field label="Téléphone">
            <input
              type="tel"
              value={draft.patient_phone || ''}
              onChange={(e) => patch({ patient_phone: e.target.value })}
              className={inputCls}
              placeholder="06…"
            />
          </Field>
          <Field label="E-mail patient">
            <input
              type="email"
              value={draft.patient_email || ''}
              onChange={(e) => patch({ patient_email: e.target.value })}
              className={inputCls}
              placeholder="patient@…"
            />
          </Field>
          <Field label="Formule (colonne)">
            <textarea
              rows={2}
              value={draft.formule || ''}
              onChange={(e) => {
                const formule = e.target.value;
                patch({
                  formule,
                  form: {
                    ...draft.form,
                    demande: { ...draft.form?.demande, formule },
                  },
                });
              }}
              className={`${inputCls} font-mono text-xs`}
            />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Forme">
              <input
                value={draft.forme || ''}
                onChange={(e) => {
                  const forme = e.target.value;
                  patch({
                    forme,
                    form: {
                      ...draft.form,
                      demande: { ...draft.form?.demande, forme },
                    },
                  });
                }}
                className={inputCls}
              />
            </Field>
            <Field label="Quantité">
              <input
                type="number"
                step="0.01"
                value={draft.quantite ?? ''}
                onChange={(e) => {
                  const quantite = e.target.value;
                  patch({
                    quantite,
                    form: {
                      ...draft.form,
                      demande: { ...draft.form?.demande, quantite },
                    },
                  });
                }}
                className={inputCls}
              />
            </Field>
          </div>
        </div>
        <label className="flex items-center gap-2 text-amber-900 text-xs">
          <input
            type="checkbox"
            checked={!!draft.preparation_interne}
            onChange={(e) => patch({ preparation_interne: e.target.checked })}
          />
          Préparation réalisée en interne
        </label>
        <Field label="Notes dossier">
          <textarea rows={2} value={draft.notes || ''} onChange={(e) => patch({ notes: e.target.value })} className={inputCls} placeholder="Notes libres…" />
        </Field>
        <Field label="Motif non-conformité">
          <input value={draft.nc_reason || ''} onChange={(e) => patch({ nc_reason: e.target.value })} className={inputCls} />
        </Field>
      </fieldset>

      <MagistralOrderForm
        form={draft.form}
        onChange={patchForm}
        step="full"
        compact
        showInternalPrep={false}
        settings={settings}
      />

      <fieldset className="border rounded-lg p-3 space-y-2">
        <legend className="font-bold px-1 text-fuchsia-800">Prestataire / traçabilité ST</legend>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Réf. commande ST">
            <input value={draft.provider_ref || ''} onChange={(e) => patch({ provider_ref: e.target.value })} className={inputCls} />
          </Field>
          <Field label="N° ordonnancier ST">
            <input value={draft.provider_ordonnancier || ''} onChange={(e) => patch({ provider_ordonnancier: e.target.value })} className={inputCls} />
          </Field>
          <Field label="Lot ST">
            <input value={draft.provider_lot || ''} onChange={(e) => patch({ provider_lot: e.target.value })} className={inputCls} />
          </Field>
          <Field label="Date fabrication">
            <input type="date" value={draft.date_fabrication || ''} onChange={(e) => patch({ date_fabrication: e.target.value })} className={inputCls} />
          </Field>
          <Field label="Date péremption">
            <input type="date" value={draft.date_peremption || ''} onChange={(e) => patch({ date_peremption: e.target.value })} className={inputCls} />
          </Field>
        </div>
      </fieldset>

      <fieldset className="border rounded-lg p-3 space-y-2">
        <legend className="font-bold px-1 text-fuchsia-800">Réception / prix</legend>
        <div className="space-y-1.5">
          {RECEPTION_CHECKLIST_KEYS.map((k) => (
            <label key={k.key} className="flex items-start gap-2 text-xs">
              <input type="checkbox" checked={!!draft.reception_checklist?.[k.key]} onChange={() => toggleCheck(k.key)} className="mt-0.5" />
              {k.label}
            </label>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Prix HT net (€)">
            <input type="number" step="0.01" value={draft.prix_ht_net ?? ''} onChange={(e) => patch({ prix_ht_net: e.target.value })} className={inputCls} />
          </Field>
          <Field label="TVA (%)">
            <input type="number" step="0.01" value={draft.tva_rate ?? ''} onChange={(e) => patch({ tva_rate: e.target.value })} className={inputCls} />
          </Field>
          <Field label="Port exceptionnel (€)" hint="Utilisé au recalcul du TTC à l’enregistrement">
            <input type="number" step="0.01" value={draft.port_override ?? ''} onChange={(e) => patch({ port_override: e.target.value })} className={inputCls} placeholder="Optionnel" />
          </Field>
          <Field label="Prix TTC calculé" hint={previewPrix != null ? `Aperçu : ${previewPrix} €` : undefined}>
            <input type="number" step="0.01" value={draft.prix_calcule ?? ''} onChange={(e) => patch({ prix_calcule: e.target.value })} className={inputCls} />
          </Field>
        </div>
      </fieldset>

      <fieldset className="border rounded-lg p-3 space-y-2">
        <legend className="font-bold px-1 text-fuchsia-800">Appel patient (résumé)</legend>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Dernier résultat">
            <select
              value={draft.call_last_resultat || ''}
              onChange={(e) => patch({ call_last_resultat: e.target.value })}
              className={inputCls}
            >
              <option value="">—</option>
              {Object.entries(APPEL_RESULTAT_LABELS).map(([k, lab]) => (
                <option key={k} value={k}>{lab}</option>
              ))}
            </select>
          </Field>
          <Field label="Dernier statut appel">
            <select
              value={draft.call_last_statut || ''}
              onChange={(e) => patch({ call_last_statut: e.target.value })}
              className={inputCls}
            >
              <option value="">—</option>
              <option value="termine">Terminé (→ à dispenser)</option>
              <option value="a_rappeler">À rappeler</option>
            </select>
          </Field>
        </div>
        <Field label="Note (dernier appel / admin)">
          <textarea rows={2} value={draft.call_note || ''} onChange={(e) => patch({ call_note: e.target.value })} className={inputCls} />
        </Field>
      </fieldset>

      <fieldset className="border rounded-lg p-3 space-y-2">
        <legend className="font-bold px-1 text-fuchsia-800">Dispensation / clôture</legend>
        <div className="grid grid-cols-2 gap-2">
          <Field label="N° ordonnancier DO">
            <input value={draft.ordonnancier_number || ''} onChange={(e) => patch({ ordonnancier_number: e.target.value })} className={inputCls} />
          </Field>
          <Field label="Dispensé par (user id)">
            <input value={draft.dispensed_by || ''} onChange={(e) => patch({ dispensed_by: e.target.value })} className={inputCls} placeholder="uuid" />
          </Field>
          <Field label="Dispensé le">
            <input type="datetime-local" value={draft.dispensed_at || ''} onChange={(e) => patch({ dispensed_at: e.target.value })} className={inputCls} />
          </Field>
          <Field label="Clôturé le">
            <input type="datetime-local" value={draft.closed_at || ''} onChange={(e) => patch({ closed_at: e.target.value })} className={inputCls} />
          </Field>
          <Field label="Motif clôture">
            <input value={draft.closed_reason || ''} onChange={(e) => patch({ closed_reason: e.target.value })} className={inputCls} />
          </Field>
        </div>
      </fieldset>

      <fieldset className="border rounded-lg p-3 space-y-2">
        <legend className="font-bold px-1 text-fuchsia-800">Fichiers</legend>
        <Field label="Ordonnance" hint={draft.ordonnance_path ? `Chemin : ${draft.ordonnance_path}` : 'Aucun fichier'}>
          <input
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            onChange={(e) => onOrdonnanceFile?.(e.target.files?.[0] || null)}
            className="w-full text-xs"
          />
          {ordonnanceFile && <p className="text-[11px] text-emerald-700 mt-1">Nouveau : {ordonnanceFile.name}</p>}
          {draft.ordonnance_path && (
            <button
              type="button"
              className="text-[11px] text-red-600 underline mt-1"
              onClick={() => { patch({ ordonnance_path: '' }); onOrdonnanceFile?.(null); }}
            >
              Effacer le chemin
            </button>
          )}
        </Field>
        <Field label="Certificat de libération" hint={draft.liberation_path ? `Chemin : ${draft.liberation_path}` : 'Aucun fichier'}>
          <input
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            onChange={(e) => onLiberationFile?.(e.target.files?.[0] || null)}
            className="w-full text-xs"
          />
          {liberationFile && <p className="text-[11px] text-emerald-700 mt-1">Nouveau : {liberationFile.name}</p>}
          {draft.liberation_path && (
            <button
              type="button"
              className="text-[11px] text-red-600 underline mt-1"
              onClick={() => { patch({ liberation_path: '' }); onLiberationFile?.(null); }}
            >
              Effacer le chemin
            </button>
          )}
        </Field>
      </fieldset>
    </div>
  );
}
