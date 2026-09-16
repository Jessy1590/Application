import React, { useState, useEffect, useCallback } from 'react';
import { Droplets, Download, Printer, Pencil, Save, X } from 'lucide-react';
import {
  fetchPslUnits,
  fetchPslMovements,
  exportPslRegisterCsv,
  printMdsRegistry,
  updatePslUnit,
  updatePslMovement,
} from '../services/pslService.js';
import { useRealtimeRefresh } from '../../../shared/useRealtimeRefresh.js';
import MedicamentFields from '../../../shared/MedicamentFields.jsx';

export default function PslManager() {
  const [units, setUnits] = useState([]);
  const [movements, setMovements] = useState([]);
  const [editUnit, setEditUnit] = useState(null);
  const [editMov, setEditMov] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setUnits(await fetchPslUnits());
    setMovements(await fetchPslMovements(500));
  }, []);

  useEffect(() => {
    load().catch((e) => alert(e.message));
  }, [load]);
  useRealtimeRefresh(load, { tables: ['psl_units', 'psl_movements'] });

  const stock = units.filter((u) => u.statut === 'en_stock');
  const deliv = movements.filter((m) => m.movement_type === 'delivrance');

  const saveUnit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await updatePslUnit(editUnit.id, editUnit);
      setEditUnit(null);
      await load();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const saveMov = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await updatePslMovement(editMov.id, editMov);
      setEditMov(null);
      await load();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Droplets className="text-rose-600" /> Registre MDS</h1>
          <p className="text-sm text-slate-500">Médicaments dérivés du sang — registre spécial ARS</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => printMdsRegistry(movements)} className="flex items-center gap-2 px-3 py-2 bg-rose-600 text-white rounded-lg text-sm font-medium">
            <Printer size={16} /> Imprimer registre ARS
          </button>
          <button type="button" onClick={() => exportPslRegisterCsv(movements)} className="flex items-center gap-2 px-3 py-2 border rounded-lg text-sm font-medium">
            <Download size={16} /> Export CSV
          </button>
        </div>
      </div>

      <h2 className="font-semibold">Stock ({stock.length})</h2>
      <div className="bg-white rounded-xl border overflow-x-auto">
        <table className="w-full text-sm text-left min-w-[800px]">
          <thead className="bg-slate-50 border-b">
            <tr>
              <th className="p-3">Dénomination</th>
              <th className="p-3">Code CIP</th>
              <th className="p-3">N° unité</th>
              <th className="p-3">Lot</th>
              <th className="p-3">Péremption</th>
              <th className="p-3">Fournisseur</th>
              <th className="p-3 w-10" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {stock.map((u) => (
              <tr key={u.id}>
                <td className="p-3">{u.denomination || '—'}</td>
                <td className="p-3">{u.code_produit}</td>
                <td className="p-3 font-mono">{u.numero_unite}</td>
                <td className="p-3">{u.lot || '—'}</td>
                <td className="p-3">{u.date_peremption || '—'}</td>
                <td className="p-3">{u.fournisseur || '—'}</td>
                <td className="p-3">
                  <button type="button" onClick={() => setEditUnit({ ...u })} className="p-1 text-slate-400 hover:text-rose-700" title="Modifier">
                    <Pencil size={14} />
                  </button>
                </td>
              </tr>
            ))}
            {stock.length === 0 && (
              <tr><td colSpan={7} className="p-6 text-center text-slate-500">Aucun stock</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <h2 className="font-semibold">Registre des délivrances ({deliv.length})</h2>
      <div className="bg-white rounded-xl border overflow-x-auto">
        <table className="w-full text-sm text-left min-w-[1400px]">
          <thead className="bg-slate-50 border-b">
            <tr>
              <th className="p-3">N°</th>
              <th className="p-3">Date</th>
              <th className="p-3">Prescripteur</th>
              <th className="p-3">Patient</th>
              <th className="p-3">Médicament</th>
              <th className="p-3">Lot / N° unité</th>
              <th className="p-3">CIP</th>
              <th className="p-3">Qté</th>
              <th className="p-3">Traçabilité</th>
              <th className="p-3 w-10" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {deliv.map((m) => (
              <tr key={m.id}>
                <td className="p-3 font-bold">{m.registry_number ?? '—'}</td>
                <td className="p-3 whitespace-nowrap">{m.date_delivrance || new Date(m.created_at).toLocaleDateString('fr-FR')}</td>
                <td className="p-3">
                  <div>{m.prescripteur_nom || '—'}</div>
                  {m.prescripteur_adresse && <div className="text-xs text-slate-500">{m.prescripteur_adresse}</div>}
                </td>
                <td className="p-3">
                  <div>{m.patient_nom} {m.patient_prenom}</div>
                  {m.patient_adresse && <div className="text-xs text-slate-500">{m.patient_adresse}</div>}
                  {m.patient_dob && <div className="text-xs text-slate-500">Né(e) {m.patient_dob}</div>}
                </td>
                <td className="p-3">{m.denomination || m.psl_units?.denomination || m.psl_units?.code_produit}</td>
                <td className="p-3 text-xs">
                  Lot {m.psl_units?.lot || '—'}
                  <br />
                  N° {m.psl_units?.numero_unite || '—'}
                </td>
                <td className="p-3 text-xs font-mono">{m.psl_units?.code_produit || '—'}</td>
                <td className="p-3">{m.quantite ?? 1}</td>
                <td className="p-3 text-[10px] font-mono max-w-[160px] truncate" title={m.etiquette_tracabilite || m.datamatrix_raw || ''}>
                  {(m.etiquette_tracabilite || m.datamatrix_raw || m.psl_units?.datamatrix_raw || '—').slice(0, 40)}
                </td>
                <td className="p-3">
                  <button type="button" onClick={() => setEditMov({ ...m })} className="p-1 text-slate-400 hover:text-rose-700" title="Modifier">
                    <Pencil size={14} />
                  </button>
                </td>
              </tr>
            ))}
            {deliv.length === 0 && (
              <tr><td colSpan={10} className="p-6 text-center text-slate-500">Aucune délivrance</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {editUnit && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <form onSubmit={saveUnit} className="bg-white rounded-xl p-6 max-w-md w-full space-y-3">
            <h3 className="font-bold">Modifier l&apos;unité stock</h3>
            <MedicamentFields
              mode="name+cip"
              medicament={editUnit.denomination || ''}
              cip={editUnit.code_produit || ''}
              cipRequired
              medicamentLabel="Dénomination"
              cipLabel="Code CIP"
              labelClassName="block text-xs font-semibold mb-1"
              inputClassName="w-full p-2 border rounded-lg text-sm"
              onChange={(patch) => setEditUnit((prev) => ({
                ...prev,
                ...(patch.medicament != null ? { denomination: patch.medicament } : {}),
                ...(patch.cip != null ? { code_produit: patch.cip } : {}),
              }))}
            />
            {[
              ['numero_unite', 'N° unité'],
              ['lot', 'Lot'],
              ['fournisseur', 'Fournisseur'],
            ].map(([key, label]) => (
              <div key={key}>
                <label className="block text-xs font-semibold mb-1">{label}</label>
                <input
                  value={editUnit[key] || ''}
                  onChange={(e) => setEditUnit({ ...editUnit, [key]: e.target.value })}
                  className="w-full p-2 border rounded-lg text-sm"
                  required={key === 'numero_unite'}
                />
              </div>
            ))}
            <div>
              <label className="block text-xs font-semibold mb-1">Péremption</label>
              <input type="date" value={editUnit.date_peremption || ''} onChange={(e) => setEditUnit({ ...editUnit, date_peremption: e.target.value })} className="w-full p-2 border rounded-lg text-sm" />
            </div>
            <div className="flex gap-2 pt-2">
              <button type="submit" disabled={saving} className="flex-1 bg-rose-600 text-white py-2 rounded-lg font-semibold flex justify-center gap-2"><Save size={16} /> Enregistrer</button>
              <button type="button" onClick={() => setEditUnit(null)} className="px-4 border rounded-lg"><X size={16} /></button>
            </div>
          </form>
        </div>
      )}

      {editMov && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <form onSubmit={saveMov} className="bg-white rounded-xl p-6 max-w-lg w-full space-y-3 max-h-[90vh] overflow-y-auto">
            <h3 className="font-bold">Modifier la délivrance N° {editMov.registry_number ?? '—'}</h3>
            <div>
              <label className="block text-xs font-semibold mb-1">Date délivrance</label>
              <input type="date" value={editMov.date_delivrance || ''} onChange={(e) => setEditMov({ ...editMov, date_delivrance: e.target.value })} className="w-full p-2 border rounded-lg text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-semibold mb-1">Prescripteur</label>
                <input value={editMov.prescripteur_nom || ''} onChange={(e) => setEditMov({ ...editMov, prescripteur_nom: e.target.value })} className="w-full p-2 border rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Adresse presc.</label>
                <input value={editMov.prescripteur_adresse || ''} onChange={(e) => setEditMov({ ...editMov, prescripteur_adresse: e.target.value })} className="w-full p-2 border rounded-lg text-sm" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-semibold mb-1">Patient nom</label>
                <input value={editMov.patient_nom || ''} onChange={(e) => setEditMov({ ...editMov, patient_nom: e.target.value })} className="w-full p-2 border rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Prénom</label>
                <input value={editMov.patient_prenom || ''} onChange={(e) => setEditMov({ ...editMov, patient_prenom: e.target.value })} className="w-full p-2 border rounded-lg text-sm" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Adresse patient</label>
              <input value={editMov.patient_adresse || ''} onChange={(e) => setEditMov({ ...editMov, patient_adresse: e.target.value })} className="w-full p-2 border rounded-lg text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-semibold mb-1">Naissance</label>
                <input type="date" value={editMov.patient_dob || ''} onChange={(e) => setEditMov({ ...editMov, patient_dob: e.target.value })} className="w-full p-2 border rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Quantité</label>
                <input type="number" min={1} value={editMov.quantite ?? 1} onChange={(e) => setEditMov({ ...editMov, quantite: e.target.value })} className="w-full p-2 border rounded-lg text-sm" />
              </div>
            </div>
            <MedicamentFields
              mode="name-only"
              medicament={editMov.denomination || ''}
              medicamentLabel="Médicament"
              labelClassName="block text-xs font-semibold mb-1"
              inputClassName="w-full p-2 border rounded-lg text-sm"
              onChange={(patch) => {
                if (patch.medicament != null) {
                  setEditMov((prev) => ({ ...prev, denomination: patch.medicament }));
                }
              }}
            />
            <div>
              <label className="block text-xs font-semibold mb-1">Traçabilité</label>
              <textarea rows={2} value={editMov.etiquette_tracabilite || ''} onChange={(e) => setEditMov({ ...editMov, etiquette_tracabilite: e.target.value })} className="w-full p-2 border rounded-lg text-sm font-mono text-xs" />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Notes</label>
              <textarea rows={2} value={editMov.notes || ''} onChange={(e) => setEditMov({ ...editMov, notes: e.target.value })} className="w-full p-2 border rounded-lg text-sm" />
            </div>
            <div className="flex gap-2 pt-2">
              <button type="submit" disabled={saving} className="flex-1 bg-rose-600 text-white py-2 rounded-lg font-semibold flex justify-center gap-2"><Save size={16} /> Enregistrer</button>
              <button type="button" onClick={() => setEditMov(null)} className="px-4 border rounded-lg"><X size={16} /></button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
