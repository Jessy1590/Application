import React, { useState, useEffect } from 'react';
import { ArrowLeft, Wallet, Download } from 'lucide-react';
import { fetchCashClosures, calcEcart, exportMonthlyCsv } from '../services/cashService';

export default function CashManager({ onNavigate }) {
  const now = new Date();
  const [yearMonth, setYearMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  const [closures, setClosures] = useState([]);

  useEffect(() => {
    const [y, m] = yearMonth.split('-');
    const from = `${yearMonth}-01`;
    const last = new Date(Number(y), Number(m), 0).getDate();
    const to = `${yearMonth}-${String(last).padStart(2, '0')}`;
    fetchCashClosures({ from, to }).then(setClosures).catch((e) => alert(e.message));
  }, [yearMonth]);

  return (
    <div className="p-8 max-w-5xl mx-auto w-full">
      <button type="button" onClick={() => onNavigate('dashboard')} className="flex items-center gap-2 text-slate-500 hover:text-emerald-600 mb-6 text-sm font-medium">
        <ArrowLeft size={16} /> Retour
      </button>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2"><Wallet className="text-emerald-600" /> Clôtures de caisse</h1>
        <div className="flex items-center gap-2">
          <input type="month" value={yearMonth} onChange={(e) => setYearMonth(e.target.value)} className="p-2 border rounded-lg text-sm" />
          <button type="button" onClick={() => exportMonthlyCsv(closures, yearMonth)} className="flex items-center gap-2 px-3 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium">
            <Download size={16} /> Export mensuel CSV
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-50 border-b">
            <tr>
              <th className="p-3">Date</th><th className="p-3">Auteur</th><th className="p-3">Fond réel</th>
              <th className="p-3">Logiciel</th><th className="p-3">Écart</th><th className="p-3">CB</th><th className="p-3">Garde</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {closures.length === 0 && (
              <tr><td colSpan={7} className="p-4 text-slate-500">Aucune clôture ce mois.</td></tr>
            )}
            {closures.map((c) => (
              <tr key={c.id}>
                <td className="p-3">{c.closure_date}</td>
                <td className="p-3">{c.author_name || '—'}</td>
                <td className="p-3">{c.fond_reel}</td>
                <td className="p-3">{c.fond_logiciel}</td>
                <td className={`p-3 font-semibold ${calcEcart(c) === 0 ? 'text-emerald-600' : 'text-amber-600'}`}>{calcEcart(c).toFixed(2)}</td>
                <td className="p-3">{c.montant_cb}</td>
                <td className="p-3">{c.garde ? 'Oui' : 'Non'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
