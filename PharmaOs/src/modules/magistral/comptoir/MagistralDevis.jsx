import React, { useState, useEffect, useCallback } from 'react';
import { CheckCircle2, Send, XCircle } from 'lucide-react';
import { useAuth } from '../../../core/AuthContext.jsx';
import { closeModuleWindow } from '../../../shared/windowService.js';
import {
  MAGISTRAL_STATUTS,
  fetchOrders,
  validateDevis,
} from '../services/magistralService.js';

/** Comptoir — valider ou refuser un devis ST. */
export default function MagistralDevis() {
  const { user } = useAuth();
  const [orders, setOrders] = useState([]);
  const [selected, setSelected] = useState(null);
  const [sendMail, setSendMail] = useState(true);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    try {
      setOrders(await fetchOrders({ statut: ['devis'] }));
    } catch (e) {
      setErr(e.message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const act = async (launchOrder) => {
    if (!selected) return;
    setLoading(true); setErr(''); setMsg('');
    try {
      await validateDevis(selected.id, {
        launchOrder,
        sendEmail: launchOrder ? sendMail : false,
        userId: user.id,
      });
      setMsg(launchOrder ? 'Devis validé → commande lancée.' : 'Devis refusé.');
      setSelected(null);
      await load();
      setTimeout(() => closeModuleWindow(), 800);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full h-full flex flex-col bg-slate-50 text-slate-800">
      <div className="px-4 py-3 bg-white border-b shrink-0">
        <h1 className="text-sm font-bold text-fuchsia-900">Devis — valider ou refuser</h1>
        <p className="text-xs text-slate-500 mt-0.5">Dossiers en attente de décision pharmacie</p>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {msg && <div className="mb-3 p-3 bg-emerald-50 text-emerald-700 rounded-lg text-sm flex gap-2"><CheckCircle2 size={16} /> {msg}</div>}
        {err && <div className="mb-3 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{err}</div>}

        <div className="max-w-xl mx-auto space-y-3">
          {!selected ? (
            <>
              {orders.length === 0 && <p className="text-sm text-slate-500">Aucun devis en attente.</p>}
              {orders.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => { setSelected(o); setMsg(''); setErr(''); }}
                  className="w-full text-left bg-white border rounded-xl p-3 hover:border-fuchsia-300"
                >
                  <div className="flex justify-between gap-2">
                    <span className="font-semibold text-sm">{o.patient_initiales || '—'}</span>
                    <span className="text-[10px] bg-slate-100 px-2 py-0.5 rounded font-semibold">{MAGISTRAL_STATUTS[o.statut]}</span>
                  </div>
                  {o.patient_phone && <p className="text-xs font-mono text-fuchsia-700 mt-1">{o.patient_phone}</p>}
                  <p className="text-xs text-slate-500 mt-1 line-clamp-2">{o.formule}</p>
                  {o.prix_calcule != null && <p className="text-xs text-slate-600 mt-1">{o.prix_calcule} € TTC</p>}
                </button>
              ))}
            </>
          ) : (
            <div className="bg-white border rounded-xl p-4 space-y-3 text-sm">
              <h3 className="font-bold">{selected.patient_initiales}</h3>
              <p className="text-xs text-slate-500 line-clamp-3">{selected.formule}</p>
              {selected.patient_phone && (
                <p className="text-sm font-mono text-fuchsia-800">{selected.patient_phone}</p>
              )}
              {selected.prix_calcule != null && (
                <p className="text-sm">Prix calculé : <strong>{selected.prix_calcule} €</strong></p>
              )}
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={sendMail} onChange={(e) => setSendMail(e.target.checked)} />
                E-mail prestataire à la validation (commande)
              </label>
              <button
                type="button"
                disabled={loading}
                onClick={() => act(true)}
                className="w-full bg-emerald-600 text-white py-2.5 rounded-lg font-semibold flex justify-center items-center gap-1 disabled:opacity-50"
              >
                <Send size={14} /> Valider &amp; commander
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => act(false)}
                className="w-full bg-slate-200 py-2.5 rounded-lg font-semibold flex justify-center items-center gap-1 disabled:opacity-50"
              >
                <XCircle size={14} /> Refuser le devis
              </button>
              <button type="button" onClick={() => setSelected(null)} className="text-xs text-slate-500 underline">
                Retour à la liste
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
