import React, { useState, useRef, useEffect } from 'react';
import { CheckCircle2, RefreshCw, Search } from 'lucide-react';
import { useAuth } from '../../../core/AuthContext.jsx';
import { closeModuleWindow } from '../../../shared/windowService.js';
import {
  MAGISTRAL_STATUTS,
  searchOrdersForRenewal,
  renewMagistralOrder,
} from '../services/magistralService.js';

function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('fr-FR');
  } catch {
    return '—';
  }
}

/** Comptoir — renouvellement d’une préparation magistrale passée. */
export default function MagistralRenouvellement() {
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [selected, setSelected] = useState(null);
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [warn, setWarn] = useState('');
  const [err, setErr] = useState('');
  const debounceRef = useRef(null);

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  const runSearch = (value) => {
    setQuery(value);
    setSelected(null);
    setMsg('');
    setWarn('');
    setErr('');
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = value.trim();
    if (q.length < 1) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        setResults(await searchOrdersForRenewal(q));
      } catch (e) {
        setErr(e.message);
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 280);
  };

  const fd = selected?.form_data || {};
  const dem = fd.demande || {};
  const pat = fd.patient || {};

  return (
    <div className="w-full h-full flex flex-col bg-slate-50 text-slate-800">
      <div className="px-4 py-3 bg-white border-b shrink-0">
        <h1 className="text-sm font-bold text-fuchsia-900">Renouvellement</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Rechercher un dossier passé, prévisualiser, puis renouveler (envoi ST)
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {msg && (
          <div className="mb-3 p-3 bg-emerald-50 text-emerald-700 rounded-lg text-sm flex gap-2">
            <CheckCircle2 size={16} className="shrink-0 mt-0.5" /> {msg}
          </div>
        )}
        {warn && (
          <div className="mb-3 p-3 bg-amber-50 text-amber-800 rounded-lg text-sm">{warn}</div>
        )}
        {err && <div className="mb-3 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{err}</div>}

        <div className="max-w-xl mx-auto space-y-3">
          {!selected ? (
            <>
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => runSearch(e.target.value)}
                  placeholder="Initiales, n° dossier, n° ST, formule, nom…"
                  className="w-full pl-9 pr-3 py-2.5 border rounded-xl bg-white text-sm"
                  autoFocus
                />
              </div>
              {searching && <p className="text-xs text-slate-400">Recherche…</p>}
              {!searching && query.trim() && results.length === 0 && (
                <p className="text-sm text-slate-500">Aucun dossier trouvé.</p>
              )}
              {results.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => {
                    setSelected(o);
                    setMsg('');
                    setWarn('');
                    setErr('');
                  }}
                  className="w-full text-left bg-white border rounded-xl p-3 hover:border-fuchsia-300"
                >
                  <div className="flex justify-between gap-2">
                    <span className="font-semibold text-sm">
                      {o.patient_initiales || '—'} · #{o.id.slice(0, 8)}
                    </span>
                    <span className="text-[10px] bg-slate-100 px-2 rounded shrink-0">
                      {MAGISTRAL_STATUTS[o.statut] || o.statut}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1 line-clamp-2">{o.formule || '—'}</p>
                  <p className="text-[10px] text-slate-400 mt-1">
                    {formatDate(o.created_at)}
                    {o.provider_ref ? ` · ST ${o.provider_ref}` : ''}
                    {o.provider_ordonnancier ? ` · ord. ${o.provider_ordonnancier}` : ''}
                  </p>
                </button>
              ))}
            </>
          ) : (
            <div className="bg-white border rounded-xl p-4 space-y-3 text-sm">
              <h3 className="font-bold">
                {selected.patient_initiales || '—'} — #{selected.id.slice(0, 8)}
              </h3>
              <dl className="grid grid-cols-[7rem_1fr] gap-x-2 gap-y-1 text-xs">
                <dt className="text-slate-500">Statut</dt>
                <dd>{MAGISTRAL_STATUTS[selected.statut] || selected.statut}</dd>
                <dt className="text-slate-500">Patient</dt>
                <dd>
                  {(pat.prenom || '') + (pat.nom || '') || selected.patient_initiales || '—'}
                  {selected.patient_phone ? ` · ${selected.patient_phone}` : ''}
                </dd>
                <dt className="text-slate-500">Forme / qté</dt>
                <dd>
                  {dem.forme || selected.forme || '—'} · {dem.quantite ?? selected.quantite ?? '—'}
                </dd>
                <dt className="text-slate-500">Formule</dt>
                <dd className="whitespace-pre-wrap line-clamp-6">{selected.formule || dem.formule || '—'}</dd>
                <dt className="text-slate-500">Ordonnance</dt>
                <dd>{selected.ordonnance_path ? 'Oui (sera dupliquée)' : 'Absente'}</dd>
                <dt className="text-slate-500">Nature</dt>
                <dd>Commande (attente réception)</dd>
              </dl>

              <button
                type="button"
                disabled={loading}
                onClick={async () => {
                  setLoading(true);
                  setErr('');
                  setWarn('');
                  try {
                    const { order, ordonnanceWarning } = await renewMagistralOrder(user.id, selected.id);
                    setMsg(`Commande renouvelée #${order.id.slice(0, 8)} — attente réception`);
                    if (ordonnanceWarning) setWarn(ordonnanceWarning);
                    setSelected(null);
                    setResults([]);
                    setQuery('');
                    setTimeout(() => closeModuleWindow(), 900);
                  } catch (e) {
                    setErr(e.message);
                  } finally {
                    setLoading(false);
                  }
                }}
                className="w-full bg-fuchsia-600 text-white py-2.5 rounded-lg font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <RefreshCw size={16} /> {loading ? 'Renouvellement…' : 'Renouveler'}
              </button>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="text-xs text-slate-500 underline"
              >
                Retour à la recherche
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
