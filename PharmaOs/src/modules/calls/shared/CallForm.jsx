import React, { useEffect, useMemo } from 'react';
import {
  CALL_TYPES,
  CALL_STATUTS_COMPTOIR,
  CALL_STATUT_CLOTURE,
  motifsForContactType,
} from '../services/callService.js';

/**
 * Formulaire d'appel partagé comptoir / dashboard.
 * @param {boolean} showNotes — notes réservées au pharmacien (dashboard)
 * @param {boolean} showCloture — statut Clôturé réservé au pharmacien
 * @param {string|null} contactType — health_professional | commercial_partner | null
 * @param {Array<{value,label}>|null} allowedMotifs — override explicite de la liste de motifs
 */
export default function CallForm({
  form,
  onChange,
  showNotes = false,
  showCloture = false,
  contactType = null,
  allowedMotifs = null,
}) {
  const set = (key) => (e) => onChange({ [key]: e.target.value });
  const statuts = showCloture
    ? [...CALL_STATUTS_COMPTOIR, CALL_STATUT_CLOTURE]
    : CALL_STATUTS_COMPTOIR;

  const motifOptions = useMemo(() => {
    if (allowedMotifs?.length) return allowedMotifs;
    return motifsForContactType(contactType);
  }, [allowedMotifs, contactType]);

  useEffect(() => {
    const current = form.motif || 'autre';
    if (!motifOptions.some((m) => m.value === current)) {
      const fallback = motifOptions.find((m) => m.value === 'autre') || motifOptions[0];
      if (fallback) onChange({ motif: fallback.value });
    }
    // onChange volontairement omis : callback parent souvent inline
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [motifOptions, form.motif]);

  const input = 'w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500';

  return (
    <div className="space-y-4 text-sm">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block font-semibold text-slate-700 mb-1">Type d&apos;appel</label>
          <select name="type" value={form.type || 'recu'} onChange={set('type')} className={input}>
            {CALL_TYPES.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block font-semibold text-slate-700 mb-1">Numéro</label>
          <input
            type="text"
            required
            placeholder="Ex: 01 23 45 67 89"
            value={form.numero || ''}
            onChange={set('numero')}
            className={input}
          />
        </div>
      </div>

      <div>
        <label className="block font-semibold text-slate-700 mb-1">Interlocuteur</label>
        <input
          type="text"
          placeholder="Patient, Dr, laboratoire…"
          value={form.contact_nom || ''}
          onChange={set('contact_nom')}
          className={input}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block font-semibold text-slate-700 mb-1">Motif</label>
          <select value={form.motif || 'autre'} onChange={set('motif')} className={input}>
            {motifOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block font-semibold text-slate-700 mb-1">Statut</label>
          <select
            value={form.statut_traitement || 'resolu'}
            onChange={set('statut_traitement')}
            className={input}
          >
            {statuts.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      {showNotes && (
        <div>
          <label className="block font-semibold text-slate-700 mb-1">Note pharmacien</label>
          <textarea
            rows={3}
            placeholder="Note de clôture ou suivi (pharmacien uniquement)"
            value={form.notes_appel || ''}
            onChange={set('notes_appel')}
            className={input}
          />
        </div>
      )}
    </div>
  );
}
