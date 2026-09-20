import React, { useState, useEffect, useCallback } from 'react';
import { Truck } from 'lucide-react';
import {
  fetchLivreurs,
  createLivreur,
  updateLivreur,
  deleteLivreur,
  LIVREUR_TYPE_LABELS,
} from '../services/stupefiantService.js';

export default function StupefiantsLivreursSettings() {
  const [livreurs, setLivreurs] = useState([]);
  const [label, setLabel] = useState('');
  const [type, setType] = useState('grossiste');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLivreurs(await fetchLivreurs());
  }, []);

  useEffect(() => {
    load().catch((e) => setErr(e.message || 'Chargement impossible'));
  }, [load]);

  const add = async () => {
    if (!label.trim()) {
      setErr('Saisissez un nom de livreur.');
      return;
    }
    setErr('');
    setMsg('');
    setSaving(true);
    try {
      await createLivreur({ label: label.trim(), type });
      setLabel('');
      setMsg('Livreur ajouté');
      await load();
    } catch (e) {
      setErr(e.message || 'Échec de l’ajout');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3 max-w-xl">
      <p className="text-sm text-slate-500">
        Grossistes, génériqueurs et plateformes (référentiel général — aussi utilisé pour les réceptions stupéfiants).
      </p>
      {msg && <p className="text-sm text-emerald-700 bg-emerald-50 p-2 rounded">{msg}</p>}
      {err && <p className="text-sm text-red-700 bg-red-50 p-2 rounded">{err}</p>}

      <div className="bg-white border rounded-xl p-4">
        <h2 className="font-semibold mb-3 flex items-center gap-2">
          <Truck size={16} className="text-rose-600" /> Livreurs
        </h2>
        <form
          className="flex flex-wrap gap-2 mb-3"
          onSubmit={(e) => { e.preventDefault(); add(); }}
        >
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Nom du livreur"
            className="flex-1 min-w-[140px] p-2 border rounded-lg text-sm"
          />
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="p-2 border rounded-lg text-sm"
          >
            {Object.entries(LIVREUR_TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <button
            type="submit"
            disabled={saving}
            className="px-3 py-2 bg-rose-600 text-white rounded-lg text-sm disabled:opacity-60"
          >
            {saving ? '…' : 'Ajouter'}
          </button>
        </form>
        <ul className="space-y-2">
          {livreurs.length === 0 && (
            <li className="text-sm text-slate-400">Aucun livreur.</li>
          )}
          {livreurs.map((l) => (
            <li key={l.id} className="flex items-center gap-2 text-sm">
              <span className={`flex-1 ${l.actif ? '' : 'line-through text-slate-400'}`}>
                {l.label}
                <span className="text-xs text-slate-400 ml-2">
                  {LIVREUR_TYPE_LABELS[l.type] || l.type}
                </span>
              </span>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await updateLivreur(l.id, { actif: !l.actif });
                    setLivreurs(await fetchLivreurs());
                  } catch (e) {
                    setErr(e.message);
                  }
                }}
                className="text-xs px-2 py-1 border rounded"
              >
                {l.actif ? 'Désactiver' : 'Activer'}
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!confirm('Supprimer ce livreur ?')) return;
                  try {
                    await deleteLivreur(l.id);
                    setLivreurs(await fetchLivreurs());
                  } catch (e) {
                    setErr(e.message);
                  }
                }}
                className="text-xs px-2 py-1 text-red-600 border border-red-200 rounded"
              >
                Suppr.
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
