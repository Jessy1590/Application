import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { suggestBdm, getByCip, SUGGEST_KIND_LABELS } from '../modules/bdm/services/bdmService.js';

const CIP_DIGITS = /^\d{7}$|^\d{13}$/;

function useDebounced(value, ms = 280) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function pickLabel(s) {
  return (s?.label || s?.denomination || s?.subtitle || '').trim();
}

function pickCip(s) {
  return String(s?.cip13 || s?.cip7 || s?.cip || '').trim();
}

function friendlyBdmError(err) {
  const msg = err?.message || String(err || '');
  if (/schema|bdm|PGRST|permission|not find|does not exist|JWT/i.test(msg)) {
    return 'Référentiel BDPM indisponible (schéma bdm). Saisie libre possible.';
  }
  return msg || 'Erreur autocomplétion BDPM.';
}

/**
 * Champs médicament / CIP avec autocomplétion BDPM (suggest + get_by_cip).
 *
 * @param {string} medicament
 * @param {string} [cip]
 * @param {(patch: { medicament?: string, cip?: string }) => void} onChange
 * @param {(suggestion: object) => void} [onSuggestSelect] — suggestion BDPM complète (cis, code_substance, kind…)
 * @param {'name+cip'|'name-only'} [mode='name+cip']
 */
export default function MedicamentFields({
  medicament = '',
  cip = '',
  onChange,
  onSuggestSelect,
  mode = 'name+cip',
  required = false,
  cipRequired = false,
  medicamentLabel = 'Médicament',
  cipLabel = 'Code CIP',
  medicamentPlaceholder = 'Nom du médicament…',
  cipPlaceholder = 'CIP 7 ou 13 (optionnel)',
  inputClassName = 'w-full p-2 border border-slate-300 rounded-lg bg-slate-50 focus:ring-2 focus:ring-sky-500',
  labelClassName = 'block font-semibold mb-1',
  className = '',
  disabled = false,
  nameRequiredMark = true,
}) {
  const uid = useId();
  const boxRef = useRef(null);
  const [activeField, setActiveField] = useState(null); // 'name' | 'cip'
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [hint, setHint] = useState('');

  const querySource = activeField === 'cip' ? cip : medicament;
  const debouncedQ = useDebounced(querySource, 280);
  const showCip = mode === 'name+cip';

  useEffect(() => {
    const onDoc = (e) => {
      if (!boxRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const applySuggestion = useCallback((s) => {
    const label = pickLabel(s);
    const nextCip = pickCip(s);
    const patch = {};
    if (label) patch.medicament = label;
    if (showCip && nextCip) patch.cip = nextCip;
    else if (showCip && activeField === 'cip' && !nextCip && label) {
      // keep typed cip if suggestion has no CIP (ex. DCI)
    }
    onChange?.(patch);
    onSuggestSelect?.(s);
    setOpen(false);
    setSuggestions([]);
    setErr('');
    setHint('');
  }, [activeField, onChange, onSuggestSelect, showCip]);

  const resolveCip = useCallback(async (raw) => {
    const value = String(raw || '').trim();
    if (!CIP_DIGITS.test(value)) return;
    try {
      setLoading(true);
      setErr('');
      const rows = await getByCip(value);
      const hit = rows?.[0];
      if (hit) {
        const label = pickLabel(hit) || hit.denomination || '';
        const nextCip = pickCip(hit) || value;
        const suggestion = {
          kind: 'produit',
          label,
          denomination: hit.denomination || label,
          cis: hit.cis || null,
          cip13: hit.cip13 || nextCip,
          cip7: hit.cip7 || null,
          subtitle: hit.presentation_libelle || '',
        };
        onChange?.({
          ...(label ? { medicament: label } : {}),
          cip: nextCip,
        });
        onSuggestSelect?.(suggestion);
        setHint('');
      } else {
        setHint('CIP inconnu dans la BDPM — saisie libre conservée.');
      }
    } catch (e) {
      setErr(friendlyBdmError(e));
    } finally {
      setLoading(false);
    }
  }, [onChange, onSuggestSelect]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const q = (debouncedQ || '').trim();
      if (!activeField || q.length < 2) {
        if (!cancelled) setSuggestions([]);
        return;
      }

      // CIP exact → lookup dédié plutôt que suggest
      if (activeField === 'cip' && CIP_DIGITS.test(q)) {
        try {
          setLoading(true);
          setErr('');
          const rows = await getByCip(q);
          if (cancelled) return;
          const mapped = (rows || []).map((r) => ({
            kind: 'produit',
            label: r.denomination || r.label || q,
            subtitle: [r.cip13 && `CIP13 ${r.cip13}`, r.cip7 && `CIP7 ${r.cip7}`, r.cis && `CIS ${r.cis}`]
              .filter(Boolean)
              .join(' · '),
            cip13: r.cip13,
            cip7: r.cip7,
            cis: r.cis,
            denomination: r.denomination,
          }));
          setSuggestions(mapped);
          setOpen(mapped.length > 0);
        } catch (e) {
          if (!cancelled) {
            setSuggestions([]);
            setErr(friendlyBdmError(e));
          }
        } finally {
          if (!cancelled) setLoading(false);
        }
        return;
      }

      try {
        setLoading(true);
        setErr('');
        const rows = await suggestBdm(q, 20);
        if (cancelled) return;
        setSuggestions(rows || []);
        setOpen((rows || []).length > 0);
      } catch (e) {
        if (!cancelled) {
          setSuggestions([]);
          setErr(friendlyBdmError(e));
          setOpen(false);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [debouncedQ, activeField]);

  const dropdown = open && suggestions.length > 0 && (
    <ul
      className="absolute z-30 mt-1 w-full max-h-60 overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg text-sm"
      role="listbox"
      id={`${uid}-list`}
    >
      {suggestions.map((s, i) => (
        <li key={`${s.kind}-${s.label}-${s.cis || s.cip13 || s.identifiant_groupe || i}`}>
          <button
            type="button"
            role="option"
            className="w-full text-left px-3 py-2 hover:bg-sky-50 flex flex-col gap-0.5 border-b border-slate-50 last:border-0"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => applySuggestion(s)}
          >
            <span className="font-medium text-slate-800">{pickLabel(s)}</span>
            <span className="text-xs text-slate-500">
              {SUGGEST_KIND_LABELS[s.kind] || s.kind}
              {s.subtitle ? ` — ${s.subtitle}` : ''}
              {pickCip(s) ? ` · ${pickCip(s)}` : ''}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );

  const statusLine = (err || hint || (loading && open)) && (
    <p className={`text-xs mt-1 ${err ? 'text-rose-600' : 'text-slate-500'}`}>
      {err || hint || (loading ? 'Recherche BDPM…' : '')}
    </p>
  );

  return (
    <div className={`space-y-3 ${className}`} ref={boxRef}>
      <div className="relative">
        {medicamentLabel && (
          <label className={labelClassName} htmlFor={`${uid}-name`}>
            {medicamentLabel}
            {required && nameRequiredMark ? ' *' : ''}
          </label>
        )}
        <input
          id={`${uid}-name`}
          type="text"
          autoComplete="off"
          disabled={disabled}
          required={required}
          value={medicament}
          placeholder={medicamentPlaceholder}
          className={inputClassName}
          aria-autocomplete="list"
          aria-controls={`${uid}-list`}
          aria-expanded={open && activeField === 'name'}
          onFocus={() => {
            setActiveField('name');
            if (suggestions.length) setOpen(true);
          }}
          onChange={(e) => {
            setActiveField('name');
            setHint('');
            onChange?.({ medicament: e.target.value });
            setOpen(true);
          }}
          onBlur={() => {
            // keep list usable via mousedown preventDefault on options
          }}
        />
        {activeField === 'name' && dropdown}
        {activeField === 'name' && statusLine}
      </div>

      {showCip && (
        <div className="relative">
          {cipLabel && (
            <label className={labelClassName} htmlFor={`${uid}-cip`}>
              {cipLabel}
              {cipRequired && nameRequiredMark ? ' *' : ''}
            </label>
          )}
          <input
            id={`${uid}-cip`}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            disabled={disabled}
            required={cipRequired}
            value={cip}
            placeholder={cipPlaceholder}
            className={inputClassName}
            aria-autocomplete="list"
            aria-controls={`${uid}-list`}
            aria-expanded={open && activeField === 'cip'}
            onFocus={() => {
              setActiveField('cip');
              if (suggestions.length) setOpen(true);
            }}
            onChange={(e) => {
              const value = e.target.value;
              setActiveField('cip');
              setHint('');
              onChange?.({ cip: value });
              setOpen(true);
            }}
            onBlur={(e) => {
              const value = e.target.value.trim();
              if (CIP_DIGITS.test(value)) resolveCip(value);
            }}
          />
          {activeField === 'cip' && dropdown}
          {activeField === 'cip' && statusLine}
        </div>
      )}
    </div>
  );
}
