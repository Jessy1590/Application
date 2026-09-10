import React from 'react';
import { PERIME_FORM_DEFAULTS } from '../services/perimesService.js';

/**
 * Formulaire de déclaration périmé.
 * Code CIP = code produit (un seul champ, synchronisé en base sur code + cip).
 */
export default function PerimeForm({ form, onChange, requireCore = true }) {
  const set = (key) => (e) => {
    const value = e.target.value;
    onChange({ [key]: value });
  };
  const setCip = (e) => {
    const value = e.target.value;
    // Code CIP = code produit
    onChange({ cip: value, code: value });
  };
  const input = 'w-full p-2 border border-slate-300 rounded-lg bg-slate-50 focus:ring-2 focus:ring-orange-500';

  return (
    <div className="space-y-3 text-sm">
      <div>
        <label className="block font-semibold mb-1">Nom du produit *</label>
        <input
          required={requireCore}
          value={form.medicament || ''}
          onChange={set('medicament')}
          className={input}
          placeholder="Dénomination"
        />
      </div>
      <div>
        <label className="block font-semibold mb-1">Code CIP (code produit) *</label>
        <input
          required={requireCore}
          value={form.cip || form.code || ''}
          onChange={setCip}
          className={input}
          placeholder="Code CIP / code produit"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block font-semibold mb-1">Lot *</label>
          <input
            required={requireCore}
            value={form.lot || ''}
            onChange={set('lot')}
            className={input}
          />
        </div>
        <div>
          <label className="block font-semibold mb-1">Quantité *</label>
          <input
            type="number"
            min="1"
            required={requireCore}
            value={form.quantite ?? PERIME_FORM_DEFAULTS.quantite}
            onChange={set('quantite')}
            className={input}
          />
        </div>
      </div>
      <div>
        <label className="block font-semibold mb-1">Date de péremption *</label>
        <input
          type="date"
          required={requireCore}
          value={form.date_peremption || ''}
          onChange={set('date_peremption')}
          className={input}
        />
        <p className="text-xs text-slate-500 mt-1">Dans les 12 mois glissants uniquement.</p>
      </div>
      <div>
        <label className="block font-semibold mb-1">Notes</label>
        <input
          value={form.notes || ''}
          onChange={set('notes')}
          className={input}
          placeholder="Optionnel"
        />
      </div>
    </div>
  );
}
