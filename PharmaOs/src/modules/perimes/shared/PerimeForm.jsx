import React from 'react';
import { PERIME_FORM_DEFAULTS } from '../services/perimesService.js';
import MedicamentFields from '../../../shared/MedicamentFields.jsx';

/**
 * Formulaire de déclaration périmé.
 * Code CIP = code produit (un seul champ, synchronisé en base sur code + cip).
 */
export default function PerimeForm({ form, onChange, requireCore = true }) {
  const set = (key) => (e) => {
    const value = e.target.value;
    onChange({ [key]: value });
  };
  const input = 'w-full p-2 border border-slate-300 rounded-lg bg-slate-50 focus:ring-2 focus:ring-orange-500';

  return (
    <div className="space-y-3 text-sm">
      <MedicamentFields
        mode="name+cip"
        medicament={form.medicament || ''}
        cip={form.cip || form.code || ''}
        required={requireCore}
        cipRequired={requireCore}
        medicamentLabel="Nom du produit"
        cipLabel="Code CIP (code produit)"
        medicamentPlaceholder="Dénomination"
        cipPlaceholder="Code CIP / code produit"
        inputClassName={input}
        onChange={(patch) => {
          const next = { ...patch };
          if (patch.cip != null) next.code = patch.cip;
          onChange(next);
        }}
      />
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
