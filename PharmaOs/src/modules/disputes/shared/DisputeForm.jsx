import React from 'react';
import { DISPUTE_TYPES } from '../services/disputeService.js';

/**
 * Formulaire litige partagé (comptoir + dashboard).
 * Props: form, onChange(patch), partners, compact?
 */
export default function DisputeForm({ form, onChange, partners = [], compact = false }) {
  const set = (key) => (e) => onChange({ [key]: e.target.value });
  const inp = 'w-full p-2 border rounded-lg';

  return (
    <div className={`space-y-3 text-sm ${compact ? '' : ''}`}>
      <div>
        <label className="block font-semibold mb-1">Type *</label>
        <select required value={form.dispute_type} onChange={set('dispute_type')} className={inp}>
          {DISPUTE_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="block font-semibold mb-1">Fournisseur (annuaire)</label>
        <select value={form.fournisseur_id || ''} onChange={set('fournisseur_id')} className={inp}>
          <option value="">— Libre / saisir nom —</option>
          {partners.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nom}{p.prenom ? ` — ${p.prenom}` : ''}
            </option>
          ))}
        </select>
      </div>
      {!form.fournisseur_id && (
        <div>
          <label className="block font-semibold mb-1">Nom fournisseur</label>
          <input value={form.fournisseur_nom || ''} onChange={set('fournisseur_nom')} className={inp} placeholder="Laboratoire / grossiste…" />
        </div>
      )}
      <div>
        <label className="block font-semibold mb-1">Montant (€)</label>
        <input type="number" step="0.01" value={form.montant ?? ''} onChange={set('montant')} className={inp} />
      </div>
      <div>
        <label className="block font-semibold mb-1">Description *</label>
        <textarea required rows={compact ? 3 : 3} value={form.description || ''} onChange={set('description')} className={inp} />
      </div>
      <div>
        <label className="block font-semibold mb-1">Pièces / liens</label>
        <textarea rows={2} value={form.pieces || ''} onChange={set('pieces')} className={inp} placeholder="N° facture, URL…" />
      </div>
      {(form.perime_id || form.lot_alert_id || form.stock_error_id || form._origin) && (
        <p className="text-xs text-slate-500 bg-slate-50 border rounded-lg px-3 py-2">
          Origine : {form._origin
            || (form.perime_id && 'Périmé')
            || (form.lot_alert_id && 'Alerte lot')
            || (form.stock_error_id && 'Erreur stock')
            || 'Saisie manuelle'}
          {' — '}les champs liés à l’origine restent éditables ci-dessus.
        </p>
      )}
    </div>
  );
}
