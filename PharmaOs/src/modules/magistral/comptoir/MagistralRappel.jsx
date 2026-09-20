import React, { useState, useEffect, useCallback } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { useAuth } from '../../../core/AuthContext.jsx';
import { closeModuleWindow } from '../../../shared/windowService.js';
import MagistralReceptionCall from '../shared/MagistralReceptionCall.jsx';
import {
  MAGISTRAL_STATUTS,
  ensureSettings,
  fetchOrders,
  markArrived,
  markInTransit,
} from '../services/magistralService.js';

/**
 * Comptoir — réception physique (BPP 7.12) puis rappel patient.
 * Un seul parcours lean : transit/arrivé → checklist + prix → appel (MagistralReceptionCall).
 */
export default function MagistralRappel() {
  const { user } = useAuth();
  const [settings, setSettings] = useState(null);
  const [orders, setOrders] = useState([]);
  const [recvOrder, setRecvOrder] = useState(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    try {
      setSettings(await ensureSettings());
      setOrders(await fetchOrders({
        statut: ['commande', 'en_transit', 'a_controler', 'a_rappeler'],
      }));
    } catch (e) {
      setErr(e.message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="w-full h-full flex flex-col bg-slate-50 text-slate-800">
      <div className="px-4 py-3 bg-white border-b shrink-0">
        <h1 className="text-sm font-bold text-fuchsia-900">Rappel patient / réception</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Contrôle BPP à la réception, puis appel patient (disponibilité)
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {msg && <div className="mb-3 p-3 bg-emerald-50 text-emerald-700 rounded-lg text-sm flex gap-2"><CheckCircle2 size={16} /> {msg}</div>}
        {err && <div className="mb-3 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{err}</div>}

        <div className="max-w-xl mx-auto">
          {!recvOrder ? (
            <div className="space-y-2">
              {orders.length === 0 && <p className="text-sm text-slate-500">Aucun dossier à réceptionner ou rappeler.</p>}
              {orders.map((o) => (
                <div key={o.id} className="bg-white border rounded-xl p-3 flex justify-between items-center gap-2">
                  <div>
                    <p className="font-semibold text-sm">{o.patient_initiales} · {o.patient_phone || 'pas de tél.'}</p>
                    <p className="text-[11px] text-slate-500">{MAGISTRAL_STATUTS[o.statut]} — {o.formule?.slice(0, 60)}</p>
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    {o.statut === 'commande' && (
                      <>
                        <button type="button" className="text-[10px] px-2 py-1 bg-slate-100 rounded" onClick={async () => { await markInTransit(o.id, user.id); load(); }}>En transit</button>
                        <button type="button" className="text-[10px] px-2 py-1 bg-amber-100 rounded" onClick={async () => { await markArrived(o.id, user.id); load(); }}>Arrivé</button>
                      </>
                    )}
                    {o.statut === 'en_transit' && (
                      <button type="button" className="text-[10px] px-2 py-1 bg-amber-100 rounded" onClick={async () => { await markArrived(o.id, user.id); load(); }}>Arrivé</button>
                    )}
                    <button
                      type="button"
                      className="text-xs px-3 py-1.5 bg-fuchsia-600 text-white rounded-lg font-semibold"
                      onClick={() => { setRecvOrder(o); setMsg(''); setErr(''); }}
                    >
                      {['a_rappeler', 'a_controler'].includes(o.statut) || o.reception_checklist
                        ? 'Contrôler / appeler'
                        : 'Réceptionner'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <MagistralReceptionCall
              order={recvOrder}
              settings={settings}
              userId={user.id}
              onCancel={() => setRecvOrder(null)}
              onDone={async (updated, opts) => {
                if (opts?.stay) {
                  setRecvOrder(updated);
                  return;
                }
                setMsg(
                  updated.statut === 'receptionne'
                    ? 'Dossier à dispenser — disponible dans Dispenser.'
                    : `Dossier → ${MAGISTRAL_STATUTS[updated.statut] || updated.statut}`,
                );
                setRecvOrder(null);
                await load();
                if (updated.statut === 'receptionne') {
                  setTimeout(() => closeModuleWindow(), 800);
                }
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
