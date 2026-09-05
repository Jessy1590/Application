import React from 'react';

/**
 * Formulaire partagé commande / facturation.
 * Utilisé identiquement par QuickAction (comptoir) et AgendaManager (dashboard).
 *
 * @param {'order'|'billing'} type
 * @param {object} form — état du formulaire
 * @param {(patch: object) => void} onChange — merge partiel
 * @param {boolean} [compact=false] — version modale (dashboard)
 */
export default function PatientOrderForm({ type, form, onChange, compact = false }) {
  const set = (key) => (e) => onChange({ [key]: e.target.value });
  const setUpper = (key) => (e) => onChange({ [key]: e.target.value.toUpperCase() });

  const inputBase = compact
    ? 'w-full p-2 border rounded text-sm'
    : 'w-full p-2 border bg-slate-50 rounded focus:ring-2 focus:ring-sky-500';

  return (
    <div className="space-y-4">
      {/* Bloc identification patient */}
      <div className="bg-slate-100 p-4 rounded-lg border border-slate-200 space-y-3">
        <p className="text-xs font-bold text-slate-500 uppercase">Identification patient</p>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block font-semibold mb-1 text-xs text-slate-600">Initiales nom (2 lett.)</label>
            <input
              type="text" required maxLength={2} placeholder="Ex: DU"
              value={form.nom || ''}
              onChange={setUpper('nom')}
              className="w-full p-2 border bg-white rounded uppercase text-center font-bold text-lg focus:ring-2 focus:ring-sky-500"
            />
          </div>
          <div>
            <label className="block font-semibold mb-1 text-xs text-slate-600">Initiales prénom (2 lett.)</label>
            <input
              type="text" required maxLength={2} placeholder="Ex: JE"
              value={form.prenom || ''}
              onChange={setUpper('prenom')}
              className="w-full p-2 border bg-white rounded uppercase text-center font-bold text-lg focus:ring-2 focus:ring-sky-500"
            />
          </div>
          <div>
            <label className="block font-semibold mb-1 text-xs text-slate-600">Date de naissance</label>
            <input
              type="date" required
              value={form.dob || ''}
              onChange={set('dob')}
              className="w-full p-2 border bg-white rounded focus:ring-2 focus:ring-sky-500 text-sm"
            />
          </div>
        </div>
      </div>

      {/* Médicament ou facture */}
      <div>
        <label className="block font-semibold mb-1 text-sm">
          {type === 'order' ? 'Nom du médicament' : 'N° de facture'}
        </label>
        <input
          type="text" required
          placeholder={type === 'order' ? 'Ex: Doliprane 1000mg' : 'Ex: FA-2026-0042'}
          value={type === 'order' ? (form.medicament || '') : (form.facture || '')}
          onChange={type === 'order' ? set('medicament') : set('facture')}
          className={inputBase}
        />
      </div>

      {/* Champs spécifiques commande */}
      {type === 'order' && (
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block font-semibold mb-1 text-sm">Code CIP</label>
            <input
              type="text" placeholder="Optionnel"
              value={form.cip || ''}
              onChange={set('cip')}
              className={inputBase}
            />
          </div>
          <div>
            <label className="block font-semibold mb-1 text-sm">Récurrence (sem.)</label>
            <input
              type="number" min="1" required
              placeholder="Ex: 4"
              value={form.recurrence_semaines ?? 4}
              onChange={set('recurrence_semaines')}
              className={inputBase}
            />
          </div>
          <div>
            <label className="block font-semibold mb-1 text-sm">Répétitions</label>
            <input
              type="number" min="1" required
              placeholder="Ex: 3"
              value={form.repetitions ?? 3}
              onChange={set('repetitions')}
              className={inputBase}
            />
          </div>
        </div>
      )}

      {/* Date */}
      <div>
        <label className="block font-semibold mb-1 text-sm">
          {type === 'order' ? 'Date de la 1ère commande' : 'Date de facturation'}
        </label>
        <input
          type="date" required
          value={form.date || ''}
          onChange={set('date')}
          className={`${inputBase} font-bold`}
        />
      </div>

      {/* Commentaire */}
      <div>
        <label className="block font-semibold mb-1 text-sm">Commentaire</label>
        <textarea
          rows={compact ? 2 : 3}
          placeholder="Optionnel…"
          value={form.commentaire || ''}
          onChange={set('commentaire')}
          className={inputBase}
        />
      </div>
    </div>
  );
}
