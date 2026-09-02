import React, { useState, useEffect } from 'react';
import { Droplets, Download, Printer } from 'lucide-react';
import { fetchPslUnits, fetchPslMovements, exportPslRegisterCsv, printMdsRegistry } from '../services/pslService';

export default function PslManager() {
  const [units, setUnits] = useState([]);
  const [movements, setMovements] = useState([]);

  useEffect(() => {
    (async () => {
      setUnits(await fetchPslUnits());
      setMovements(await fetchPslMovements(500));
    })().catch((e) => alert(e.message));
  }, []);

  const stock = units.filter((u) => u.statut === 'en_stock');
  const deliv = movements.filter((m) => m.movement_type === 'delivrance');

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
        <table className="w-full text-sm text-left min-w-[600px]">
          <thead className="bg-slate-50 border-b"><tr>
            <th className="p-3">Dénomination</th><th className="p-3">Code</th><th className="p-3">N° unité</th><th className="p-3">Lot</th><th className="p-3">Péremption</th>
          </tr></thead>
          <tbody className="divide-y">
            {stock.map((u) => (
              <tr key={u.id}>
                <td className="p-3">{u.denomination || '—'}</td>
                <td className="p-3">{u.code_produit}</td>
                <td className="p-3 font-mono">{u.numero_unite}</td>
                <td className="p-3">{u.lot || '—'}</td>
                <td className="p-3">{u.date_peremption || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="font-semibold">Registre des délivrances ({deliv.length})</h2>
      <div className="bg-white rounded-xl border overflow-x-auto">
        <table className="w-full text-sm text-left min-w-[900px]">
          <thead className="bg-slate-50 border-b"><tr>
            <th className="p-3">N°</th><th className="p-3">Date</th><th className="p-3">Prescripteur</th><th className="p-3">Patient</th><th className="p-3">Médicament</th><th className="p-3">Qté</th>
          </tr></thead>
          <tbody className="divide-y">
            {deliv.map((m) => (
              <tr key={m.id}>
                <td className="p-3 font-bold">{m.registry_number ?? '—'}</td>
                <td className="p-3">{m.date_delivrance || new Date(m.created_at).toLocaleDateString('fr-FR')}</td>
                <td className="p-3">{m.prescripteur_nom || '—'}</td>
                <td className="p-3">{m.patient_nom} {m.patient_prenom}</td>
                <td className="p-3">{m.denomination || m.psl_units?.code_produit}</td>
                <td className="p-3">{m.quantite ?? 1}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
