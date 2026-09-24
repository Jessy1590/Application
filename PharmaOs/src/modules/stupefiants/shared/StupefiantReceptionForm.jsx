import React from 'react';
import MedicamentFields from '../../../shared/MedicamentFields.jsx';
import { LIVREUR_TYPE_LABELS, formatLivreurLabel } from '../services/stupefiantService.js';

const inputCls = 'w-full p-2 border border-slate-300 rounded-lg bg-slate-50 focus:ring-2 focus:ring-rose-500';

/**
 * Formulaire réception stupéfiants (comptoir + dashboard).
 * Inclut le 1er comptage armoire + LGO (fait par le réceptionnaire).
 */
export default function StupefiantReceptionForm({
  form,
  onChange,
  livreurs = [],
  operatorName = '',
  blFile = null,
  onBlFile,
  onOpenDirectory = null,
  compact = false,
  showCountFields = true,
  readOnly = false,
}) {
  const patch = (p) => { if (!readOnly) onChange(p); };
  const disabled = !!readOnly;
  const noLivreurs = !livreurs.length;

  return (
    <div className={`space-y-4 text-sm ${compact ? '' : ''}`}>
      <div className="flex items-center gap-2">
        <input
          id="stu-hors-bdm"
          type="checkbox"
          disabled={disabled}
          checked={!!form.produit_hors_bdm}
          onChange={(e) => patch({ produit_hors_bdm: e.target.checked, cip: e.target.checked ? '' : form.cip })}
          className="rounded border-slate-300"
        />
        <label htmlFor="stu-hors-bdm" className="font-medium text-slate-700">
          Produit hors référentiel BDPM (saisie libre)
        </label>
      </div>

      {form.produit_hors_bdm ? (
        <div>
          <label className="block font-semibold mb-1">Médicament *</label>
          <input
            required
            disabled={disabled}
            value={form.medicament || ''}
            onChange={(e) => patch({ medicament: e.target.value })}
            placeholder="Nom du stupéfiant…"
            className={inputCls}
          />
        </div>
      ) : (
        <MedicamentFields
          mode="name+cip"
          medicament={form.medicament || ''}
          cip={form.cip || ''}
          required
          disabled={disabled}
          cipRequired={false}
          medicamentLabel="Médicament *"
          cipLabel="Code CIP"
          medicamentPlaceholder="Nom ou CIP…"
          cipPlaceholder="CIP 7 ou 13"
          inputClassName={inputCls}
          onChange={(p) => patch(p)}
        />
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block font-semibold mb-1">Boîtes reçues *</label>
          <input
            type="number"
            min={0}
            required
            disabled={disabled}
            value={form.nb_boites_recues ?? ''}
            onChange={(e) => patch({ nb_boites_recues: e.target.value })}
            placeholder="Ex. 2"
            className={inputCls}
          />
        </div>
        <div>
          <label className="block font-semibold mb-1">Livreur *</label>
          <select
            required
            disabled={disabled || noLivreurs}
            value={form.livreur_id || ''}
            onChange={(e) => patch({ livreur_id: e.target.value })}
            className={inputCls}
          >
            <option value="">
              {noLivreurs ? 'Aucun partenaire dans l’annuaire…' : 'Choisir…'}
            </option>
            {livreurs.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label} ({l.type_label || LIVREUR_TYPE_LABELS[l.type] || l.type})
              </option>
            ))}
          </select>
          <p className="text-[11px] text-slate-500 mt-1">
            Grossistes, génériqueurs et plateformes de l’annuaire.
            {onOpenDirectory && (
              <>
                {' '}
                <button
                  type="button"
                  onClick={onOpenDirectory}
                  className="text-sky-700 underline font-medium"
                >
                  Ouvrir l’annuaire
                </button>
              </>
            )}
          </p>
          {noLivreurs && (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2 mt-2">
              Ajoutez un partenaire commercial (type grossiste, génériqueur ou plateforme)
              dans l’annuaire pour pouvoir saisir une réception.
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 p-3 rounded-lg bg-rose-50 border border-rose-100">
        <input
          id="stu-is-du"
          type="checkbox"
          disabled={disabled}
          checked={!!form.is_du}
          onChange={(e) => patch({ is_du: e.target.checked })}
          className="rounded border-slate-300"
        />
        <label htmlFor="stu-is-du" className="font-medium text-rose-900">
          Dû / promis patient (ordonnance partielle à compléter)
        </label>
      </div>

      {form.is_du && (
        <div className="space-y-3 p-3 border border-rose-200 rounded-lg bg-white">
          <div>
            <label className="block font-semibold mb-1">Patient / libellé promis</label>
            <input
              disabled={disabled}
              value={form.du_patient_label || ''}
              onChange={(e) => patch({ du_patient_label: e.target.value })}
              placeholder="Ex. Mme Dupont — oxycodone 20 restants"
              className={inputCls}
            />
          </div>
          <div>
            <label className="block font-semibold mb-1">Unités promises (dû)</label>
            <input
              type="number"
              min={0}
              disabled={disabled}
              value={form.du_unites_promisees ?? ''}
              onChange={(e) => patch({ du_unites_promisees: e.target.value })}
              placeholder="Ex. 20"
              className={inputCls}
            />
          </div>
        </div>
      )}

      {showCountFields && (
        <div className="space-y-3 p-3 border border-slate-200 rounded-lg bg-slate-50">
          <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
            1er contrôle — comptage armoire vs LGO
            {form.is_du ? ' (après avoir fait le dû)' : ''}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold mb-1">Armoire — boîtes *</label>
              <input
                type="number"
                min={0}
                required
                disabled={disabled}
                value={form.stock_visuel_boites ?? form.armoire_boites ?? ''}
                onChange={(e) => patch({
                  stock_visuel_boites: e.target.value,
                  armoire_boites: e.target.value,
                })}
                placeholder="0"
                className={inputCls}
              />
            </div>
            <div>
              <label className="block font-semibold mb-1">Armoire — unités *</label>
              <input
                type="number"
                min={0}
                required
                disabled={disabled}
                value={form.stock_visuel_unites ?? form.armoire_unites ?? ''}
                onChange={(e) => patch({
                  stock_visuel_unites: e.target.value,
                  armoire_unites: e.target.value,
                })}
                placeholder="0"
                className={inputCls}
              />
            </div>
            <div>
              <label className="block font-semibold mb-1">LGO — boîtes *</label>
              <input
                type="number"
                min={0}
                required
                disabled={disabled}
                value={form.stock_lgo_boites ?? ''}
                onChange={(e) => patch({ stock_lgo_boites: e.target.value })}
                placeholder="0"
                className={inputCls}
              />
            </div>
            <div>
              <label className="block font-semibold mb-1">LGO — unités *</label>
              <input
                type="number"
                min={0}
                required
                disabled={disabled}
                value={form.stock_lgo_unites ?? ''}
                onChange={(e) => patch({ stock_lgo_unites: e.target.value })}
                placeholder="0"
                className={inputCls}
              />
            </div>
          </div>
        </div>
      )}

      <div>
        <label className="block font-semibold mb-1">N° bon de livraison *</label>
        <input
          required
          disabled={disabled}
          value={form.bl_numero || ''}
          onChange={(e) => patch({ bl_numero: e.target.value })}
          placeholder="N° BL…"
          className={inputCls}
        />
      </div>

      {onBlFile && !readOnly && (
        <div>
          <label className="block font-semibold mb-1">Fichier BL (PDF / photo) *</label>
          <input
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            onChange={(e) => onBlFile(e.target.files?.[0] || null)}
            className="w-full text-sm"
          />
          {blFile && (
            <p className="text-[11px] text-emerald-700 mt-1">Fichier : {blFile.name}</p>
          )}
        </div>
      )}

      {operatorName && (
        <p className="text-xs text-slate-500">
          Opérateur : <span className="font-semibold text-slate-700">{operatorName}</span>
        </p>
      )}
    </div>
  );
}

export const EMPTY_RECEPTION_FORM = {
  medicament: '',
  cip: '',
  produit_hors_bdm: false,
  nb_boites_recues: '',
  livreur_id: '',
  is_du: false,
  du_patient_label: '',
  du_unites_promisees: '',
  armoire_boites: '',
  armoire_unites: '',
  stock_visuel_boites: '',
  stock_visuel_unites: '',
  stock_lgo_boites: '',
  stock_lgo_unites: '',
  bl_numero: '',
};

/** Résumé compact lecture seule (onglet vérification pharmacien). */
export function StupefiantReceptionSummary({ releve, onOpenBl }) {
  if (!releve) return null;
  const liv = releve.livreur_label || formatLivreurLabel(releve);
  return (
    <div className="text-sm bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-1.5">
      <div className="flex justify-between gap-2">
        <span className="font-semibold text-slate-800">{releve.medicament}</span>
        {releve.cip && <span className="text-xs text-slate-500">CIP {releve.cip}</span>}
      </div>
      <p className="text-slate-600">
        {releve.nb_boites_recues} boîte(s) · {liv} · BL {releve.bl_numero}
        {releve.is_du ? ' · dû' : ''}
      </p>
      {releve.is_du && (releve.du_patient_label || releve.du_unites_promisees != null) && (
        <p className="text-xs text-rose-700">
          Promis : {releve.du_patient_label || '—'}
          {releve.du_unites_promisees != null ? ` (${releve.du_unites_promisees} u.)` : ''}
        </p>
      )}
      <p className="text-xs text-slate-600">
        Comptage réceptionnaire — armoire {releve.stock_visuel_boites ?? '—'}/{releve.stock_visuel_unites ?? '—'}
        {' · '}LGO {releve.stock_lgo_boites ?? '—'}/{releve.stock_lgo_unites ?? '—'}
      </p>
      <p className="text-xs text-slate-400">
        Par {releve.author_name || '—'} · {releve.created_at ? new Date(releve.created_at).toLocaleString('fr-FR') : ''}
      </p>
      {releve.bl_path && onOpenBl && (
        <button
          type="button"
          onClick={() => onOpenBl(releve.bl_path)}
          className="text-xs text-sky-700 underline mt-1"
        >
          Voir le BL
        </button>
      )}
    </div>
  );
}
