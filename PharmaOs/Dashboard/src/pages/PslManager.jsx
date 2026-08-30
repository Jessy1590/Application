import React, { useState, useEffect } from 'react';
import { ArrowLeft, Droplets, Download } from 'lucide-react';
import { fetchPslUnits, fetchPslMovements, exportPslRegisterCsv } from '../services/pslService';

export default function PslManager({ onNavigate }) {
  const [units, setUnits] = useState([]);
  const [movements, setMovements] = useState([]);

  useEffect(() => {
    (async () => {
      setUnits(await fetchPslUnits());
      setMovements(await fetchPslMovements());
    })().catch((e) => alert(e.message));
  }, []);

  const stock = units.filter((u) => u.statut === 'en_stock');

  return (
    <div className="p-8 max-w-6xl mx-auto w-full">
      <button type="button" onClick={() => onNavigate('dashboard')} className="flex items-center gap-2 text-slate-500 hover:text-rose-600 mb-6 text-sm font-medium">
        <ArrowLeft size={16} /> Retour
      </button>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2"><Droplets className="text-rose-600" /> Registre PSL</h1>
        <button type="button" onClick={() => exportPslRegisterCsv(movements)} className="flex items-center gap-2 px-3 py-2 bg-rose-600 text-white rounded-lg text-sm font-medium">
          <Download size={16} /> Export CSV audit
        </button>
      </div>

      <h2 className="font-semibold mb-2">Stock actuel ({stock.length})</h2>
      <div className="bg-white rounded-xl border overflow-hidden mb-8">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-50 border-b"><tr>
            <th className="p-3">Code</th><th className="p-3">N° unité</th><th className="p-3">ABO/Rh</th><th className="p-3">Péremption</th><th className="p-3">Fournisseur</th>
          </tr></thead>
          <tbody className="divide-y">
            {stock.map((u) => (
              <tr key={u.id}>
                <td className="p-3">{u.code_produit}</td>
                <td className="p-3 font-mono">{u.numero_unite}</td>
                <td className="p-3">{u.groupe_abo}{u.rh}</td>
                <td className="p-3">{u.date_peremption || '—'}</td>
                <td className="p-3">{u.fournisseur || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="font-semibold mb-2">Mouvements</h2>
      <div className="bg-white rounded-xl border overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-50 border-b"><tr>
            <th className="p-3">Date</th><th className="p-3">Type</th><th className="p-3">Unité</th><th className="p-3">Patient</th>
          </tr></thead>
          <tbody className="divide-y">
            {movements.map((m) => (
              <tr key={m.id}>
                <td className="p-3">{new Date(m.created_at).toLocaleString('fr-FR')}</td>
                <td className="p-3 capitalize">{m.movement_type}</td>
                <td className="p-3 font-mono text-xs">{m.psl_units?.code_produit} / {m.psl_units?.numero_unite}</td>
                <td className="p-3">{m.patient_initiales || '—'} {m.patient_ipp ? `(${m.patient_ipp})` : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
