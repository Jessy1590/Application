import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pill, Search, RefreshCw, Loader2 } from 'lucide-react';
import {
  fetchBdmStats,
  searchProducts,
  suggestBdm,
  triggerBdpmSync,
  SUGGEST_KIND_LABELS,
} from '../services/bdmService.js';

function useDebounced(value, ms = 280) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export default function BdmExplorer() {
  const [stats, setStats] = useState(null);
  const [searchQ, setSearchQ] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState('');

  const [autoQ, setAutoQ] = useState('');
  const debouncedAuto = useDebounced(autoQ, 250);
  const [suggestions, setSuggestions] = useState([]);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestErr, setSuggestErr] = useState('');
  const boxRef = useRef(null);

  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');
  const [loadErr, setLoadErr] = useState('');

  const reloadStats = useCallback(async () => {
    try {
      setLoadErr('');
      setStats(await fetchBdmStats());
    } catch (e) {
      setLoadErr(e.message || String(e));
    }
  }, []);

  useEffect(() => { reloadStats(); }, [reloadStats]);

  useEffect(() => {
    const onDoc = (e) => {
      if (!boxRef.current?.contains(e.target)) setSuggestOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (debouncedAuto.trim().length < 2) {
        setSuggestions([]);
        return;
      }
      try {
        setSuggestErr('');
        const rows = await suggestBdm(debouncedAuto, 24);
        if (!cancelled) {
          setSuggestions(rows);
          setSuggestOpen(true);
        }
      } catch (e) {
        if (!cancelled) setSuggestErr(e.message || String(e));
      }
    })();
    return () => { cancelled = true; };
  }, [debouncedAuto]);

  const runSearch = async (e) => {
    e?.preventDefault?.();
    const q = searchQ.trim();
    if (q.length < 2) {
      setSearchErr('Saisissez au moins 2 caractères (ou un CIP 7/13).');
      return;
    }
    setSearching(true);
    setSearchErr('');
    try {
      setResults(await searchProducts(q, 80));
    } catch (err) {
      setSearchErr(err.message || String(err));
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  const onPickSuggestion = (s) => {
    setSuggestOpen(false);
    const next = s.cip13 || s.label || '';
    setAutoQ(s.label || '');
    setSearchQ(next);
    setTimeout(() => {
      searchProducts(next, 80).then(setResults).catch((err) => setSearchErr(err.message));
    }, 0);
  };

  const onSync = async () => {
    setSyncing(true);
    setSyncMsg('');
    try {
      const data = await triggerBdpmSync();
      setSyncMsg(
        `Sync OK — ${JSON.stringify(data?.rows_loaded || {})}`
      );
      await reloadStats();
    } catch (e) {
      setSyncMsg(e.message || String(e));
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="max-w-5xl">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800 flex items-center gap-2">
            <Pill className="text-teal-600" size={26} />
            BDPM — test
          </h1>
          <p className="text-sm text-slate-500 mt-1 max-w-xl">
            Référentiel médicaments (schéma <code className="text-xs bg-slate-100 px-1 rounded">bdm</code>)
            depuis la{' '}
            <a
              className="text-teal-700 underline"
              href="https://base-donnees-publique.medicaments.gouv.fr/telechargement"
              target="_blank"
              rel="noreferrer"
            >
              Base de données publique des médicaments
            </a>
            . Données non altérées — Licence Ouverte.
          </p>
        </div>
        <button
          type="button"
          onClick={onSync}
          disabled={syncing}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-teal-700 text-white text-sm hover:bg-teal-800 disabled:opacity-60"
        >
          {syncing ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
          Synchroniser BDPM
        </button>
      </div>

      {loadErr && (
        <p className="mb-4 text-sm text-rose-600 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2">
          {loadErr}
        </p>
      )}
      {syncMsg && (
        <p className="mb-4 text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 break-all">
          {syncMsg}
        </p>
      )}

      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-8">
          {[
            ['Spécialités', stats.specialites],
            ['Présentations', stats.presentations],
            ['Compositions', stats.compositions],
            ['Génériques', stats.generiques],
            ['DCI / molécules', stats.molecules],
          ].map(([label, n]) => (
            <div key={label} className="rounded-xl border border-slate-200 bg-white px-3 py-3">
              <p className="text-xs text-slate-500">{label}</p>
              <p className="text-xl font-semibold text-slate-800 tabular-nums">{n.toLocaleString('fr-FR')}</p>
            </div>
          ))}
        </div>
      )}

      {/* Autocomplétion */}
      <section className="mb-8 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-800 mb-1">Autocomplétion</h2>
        <p className="text-xs text-slate-500 mb-3">
          DCI / substance, groupe générique, nom commercial (spécialité), CIP.
        </p>
        <div className="relative" ref={boxRef}>
          <input
            type="search"
            value={autoQ}
            onChange={(e) => { setAutoQ(e.target.value); setSuggestOpen(true); }}
            onFocus={() => suggestions.length && setSuggestOpen(true)}
            placeholder="Ex. api, apixaban, eliquis, 34009…"
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/40"
            autoComplete="off"
          />
          {suggestErr && <p className="text-xs text-rose-600 mt-1">{suggestErr}</p>}
          {suggestOpen && suggestions.length > 0 && (
            <ul className="absolute z-20 mt-1 w-full max-h-72 overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg text-sm">
              {suggestions.map((s, i) => (
                <li key={`${s.kind}-${s.label}-${s.cis || s.cip13 || s.identifiant_groupe || i}`}>
                  <button
                    type="button"
                    className="w-full text-left px-3 py-2 hover:bg-teal-50 flex flex-col gap-0.5 border-b border-slate-50 last:border-0"
                    onClick={() => onPickSuggestion(s)}
                  >
                    <span className="font-medium text-slate-800">{s.label}</span>
                    <span className="text-xs text-slate-500">
                      {SUGGEST_KIND_LABELS[s.kind] || s.kind}
                      {s.subtitle ? ` — ${s.subtitle}` : ''}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Recherche formulaire */}
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-800 mb-1">Recherche produits</h2>
        <p className="text-xs text-slate-500 mb-3">
          Saisissez une info (CIP, nom commercial, DCI…) — liste des produits correspondants.
        </p>
        <form onSubmit={runSearch} className="flex flex-wrap gap-2 mb-4">
          <input
            type="search"
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            placeholder="CIP, dénomination, molécule…"
            className="flex-1 min-w-[220px] border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/40"
          />
          <button
            type="submit"
            disabled={searching}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 text-white text-sm hover:bg-slate-900 disabled:opacity-60"
          >
            {searching ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
            Chercher
          </button>
        </form>
        {searchErr && <p className="text-sm text-rose-600 mb-3">{searchErr}</p>}

        {results.length === 0 && !searching && !searchErr && (
          <p className="text-sm text-slate-400">Aucun résultat pour l’instant.</p>
        )}

        <ul className="divide-y divide-slate-100">
          {results.map((r) => (
            <li key={`${r.cis}-${r.cip13 || ''}-${r.denomination}`} className="py-3">
              <p className="font-medium text-slate-800">{r.denomination}</p>
              <p className="text-xs text-slate-500 mt-0.5">
                CIS {r.cis}
                {r.cip13 ? ` · CIP13 ${r.cip13}` : ''}
                {r.cip7 ? ` · CIP7 ${r.cip7}` : ''}
                {r.forme_pharmaceutique ? ` · ${r.forme_pharmaceutique}` : ''}
                {r.match_reason ? ` · match: ${r.match_reason}` : ''}
              </p>
              {r.substances && (
                <p className="text-xs text-teal-800 mt-1">DCI : {r.substances}</p>
              )}
              {r.groupe_generique && (
                <p className="text-xs text-slate-600 mt-0.5">Groupe : {r.groupe_generique}</p>
              )}
              {r.presentation_libelle && (
                <p className="text-xs text-slate-500 mt-0.5">{r.presentation_libelle}</p>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
