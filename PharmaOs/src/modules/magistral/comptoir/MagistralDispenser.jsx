import React, { useState, useEffect, useCallback } from 'react';
import { CheckCircle2, Printer } from 'lucide-react';
import { useAuth } from '../../../core/AuthContext.jsx';
import { closeModuleWindow } from '../../../shared/windowService.js';
import {
  MAGISTRAL_STATUTS,
  ensureSettings,
  fetchOrders,
  dispenseOrder,
  closeOrder,
} from '../services/magistralService.js';
import { printFeuilleSuivi } from '../services/magistralPrint.js';

/** Comptoir — dispensation (n° ordonnancier + feuille de suivi). */
export default function MagistralDispenser() {
  const { user } = useAuth();
  const [settings, setSettings] = useState(null);
  const [orders, setOrders] = useState([]);
  const [dispOrder, setDispOrder] = useState(null);
  const [ordoNum, setOrdoNum] = useState('');
  const [conseil, setConseil] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    try {
      setSettings(await ensureSettings());
      const rows = await fetchOrders({ statut: ['receptionne', 'dispense'] });
      // Prêts à dispenser en tête
      rows.sort((a, b) => {
        if (a.statut === b.statut) return 0;
        if (a.statut === 'receptionne') return -1;
        if (b.statut === 'receptionne') return 1;
        return 0;
      });
      setOrders(rows);
    } catch (e) {
      setErr(e.message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="w-full h-full flex flex-col bg-slate-50 text-slate-800">
      <div className="px-4 py-3 bg-white border-b shrink-0">
        <h1 className="text-sm font-bold text-fuchsia-900">Dispenser</h1>
        <p className="text-xs text-slate-500 mt-0.5">Dossiers à dispenser · ordonnancier DO + feuille de suivi</p>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {msg && <div className="mb-3 p-3 bg-emerald-50 text-emerald-700 rounded-lg text-sm flex gap-2"><CheckCircle2 size={16} /> {msg}</div>}
        {err && <div className="mb-3 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{err}</div>}

        <div className="max-w-xl mx-auto space-y-3">
          {!dispOrder ? (
            <>
              {orders.length === 0 && <p className="text-sm text-slate-500">Aucun dossier prêt à dispenser.</p>}
              {orders.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => {
                    setDispOrder(o);
                    setOrdoNum(o.ordonnancier_number || '');
                    setConseil('');
                    setMsg('');
                    setErr('');
                  }}
                  className="w-full text-left bg-white border rounded-xl p-3 hover:border-fuchsia-300"
                >
                  <div className="flex justify-between">
                    <span className="font-semibold">{o.patient_initiales}</span>
                    <span className={`text-[10px] px-2 rounded ${
                      o.statut === 'receptionne' ? 'bg-emerald-100 text-emerald-800 font-semibold' : 'bg-slate-100'
                    }`}>{MAGISTRAL_STATUTS[o.statut]}</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">{o.prix_calcule != null ? `${o.prix_calcule} € TTC` : '—'}</p>
                </button>
              ))}
            </>
          ) : (
            <div className="bg-white border rounded-xl p-4 space-y-3 text-sm">
              <h3 className="font-bold">{dispOrder.patient_initiales} — dispensation</h3>
              <p className="text-xs text-slate-500 line-clamp-3">{dispOrder.formule}</p>
              <div>
                <label className="block text-xs font-semibold mb-1">N° ordonnancier donneur d’ordre *</label>
                <input value={ordoNum} onChange={(e) => setOrdoNum(e.target.value)} className="w-full p-2 border rounded-lg" placeholder="N° ordonnancier" />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Conseil patient (optionnel)</label>
                <textarea rows={2} value={conseil} onChange={(e) => setConseil(e.target.value)} className="w-full p-2 border rounded-lg" />
              </div>
              <button
                type="button"
                onClick={() => printFeuilleSuivi(dispOrder, settings)}
                className="w-full border border-fuchsia-300 text-fuchsia-800 py-2 rounded-lg flex justify-center gap-2 font-semibold"
              >
                <Printer size={16} /> Imprimer feuille de suivi
              </button>
              <button
                type="button"
                disabled={loading || !ordoNum.trim()}
                onClick={async () => {
                  setLoading(true); setErr('');
                  try {
                    let o = dispOrder;
                    if (dispOrder.statut === 'receptionne') {
                      o = await dispenseOrder(dispOrder.id, user.id, {
                        ordonnancier_number: ordoNum,
                        conseil_note: conseil,
                      });
                    }
                    o = await closeOrder(o.id, 'Dispensé', user.id);
                    // Impression après save : n° ordonnancier, dispensed_at/by, clôture sur la feuille
                    printFeuilleSuivi(o, settings);
                    setMsg('Dossier dispensé et clôturé. Feuille de suivi ouverte — collez l’étiquette ST.');
                    setDispOrder(null);
                    await load();
                    setTimeout(() => closeModuleWindow(), 800);
                  } catch (e) { setErr(e.message); }
                  finally { setLoading(false); }
                }}
                className="w-full bg-emerald-600 text-white py-2.5 rounded-lg font-semibold disabled:opacity-50"
              >
                Dispenser, imprimer &amp; clôturer
              </button>
              <button type="button" onClick={() => setDispOrder(null)} className="text-xs text-slate-500 underline">Retour</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
