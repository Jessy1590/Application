import React, { useState, useEffect, useCallback } from 'react';
import { MapPin } from 'lucide-react';
import {
  fetchEmplacements,
  createEmplacement,
  updateEmplacement,
  deleteEmplacement,
} from '../services/perimesService.js';

/** Gestion des emplacements MEA / promo (paramètres Périmés). */
export default function PerimesEmplacementsSettings() {
  const [emplacements, setEmplacements] = useState([]);
  const [newEmpLabel, setNewEmpLabel] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    setEmplacements(await fetchEmplacements());
  }, []);

  useEffect(() => {
    load().catch((e) => setErr(e.message));
  }, [load]);

  const addEmplacement = async () => {
    if (!newEmpLabel.trim()) return;
    setErr('');
    setMsg('');
    try {
      await createEmplacement(newEmpLabel);
      setNewEmpLabel('');
      setMsg('Emplacement ajouté');
      await load();
    } catch (e) {
      setErr(e.message);
    }
  };

  return (
    <div className="space-y-3 max-w-xl">
      <p className="text-sm text-slate-500">
        Emplacements utilisés pour les mises en avant et promotions périmés.
      </p>
      {msg && <p className="text-sm text-emerald-700 bg-emerald-50 p-2 rounded">{msg}</p>}
      {err && <p className="text-sm text-red-700 bg-red-50 p-2 rounded">{err}</p>}

      <div className="bg-white border rounded-xl p-4">
        <h2 className="font-semibold mb-3 flex items-center gap-2">
          <MapPin size={16} className="text-orange-600" /> Emplacements
        </h2>
        <div className="flex gap-2 mb-3">
          <input
            value={newEmpLabel}
            onChange={(e) => setNewEmpLabel(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addEmplacement(); } }}
            placeholder="Nouvel emplacement"
            className="flex-1 p-2 border rounded-lg text-sm"
          />
          <button type="button" onClick={addEmplacement} className="px-3 py-2 bg-orange-600 text-white rounded-lg text-sm">
            Ajouter
          </button>
        </div>
        <ul className="space-y-2">
          {emplacements.length === 0 && (
            <li className="text-sm text-slate-400">Aucun emplacement.</li>
          )}
          {emplacements.map((e) => (
            <li key={e.id} className="flex items-center gap-2 text-sm">
              <span className={`flex-1 ${e.actif ? '' : 'line-through text-slate-400'}`}>{e.label}</span>
              <button
                type="button"
                onClick={async () => {
                  await updateEmplacement(e.id, { actif: !e.actif });
                  setEmplacements(await fetchEmplacements());
                }}
                className="text-xs px-2 py-1 border rounded"
              >
                {e.actif ? 'Désactiver' : 'Activer'}
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!confirm('Supprimer cet emplacement ?')) return;
                  await deleteEmplacement(e.id);
                  setEmplacements(await fetchEmplacements());
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
