import React, { useState, useEffect } from 'react';
import { useAuth } from '../../../core/AuthContext.jsx';
import { AlertOctagon, CheckCircle2 } from 'lucide-react';
import { fetchOpenLotAlerts, fetchMyAcks, acknowledgeLotAlert } from '../services/lotAlertService.js';

export default function LotAlerts() {
  const { user } = useAuth();
  const [alerts, setAlerts] = useState([]);
  const [acks, setAcks] = useState({});
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const load = async () => {
    if (!user?.id) return;
    try {
      const [list, myAcks] = await Promise.all([fetchOpenLotAlerts(), fetchMyAcks(user.id)]);
      setAlerts(list);
      const map = {};
      myAcks.forEach((a) => { map[a.alert_id] = a.read_at; });
      setAcks(map);
    } catch (e) { setErr(e.message); }
  };
  useEffect(() => { load(); }, [user?.id]);

  const handleAck = async (alertId) => {
    try {
      await acknowledgeLotAlert(alertId, user.id);
      setMsg('Alerte marquée comme lue.');
      load();
      setTimeout(() => setMsg(''), 2500);
    } catch (e) { setErr(e.message); }
  };

  const unread = alerts.filter((a) => !acks[a.id]);
  const read = alerts.filter((a) => acks[a.id]);

  return (
    <div className="w-full h-full overflow-y-auto bg-slate-50 p-6 text-slate-800">
      <h2 className="text-xl font-bold mb-2 flex items-center gap-2"><AlertOctagon className="text-red-600" /> Alertes retrait de lot</h2>
      <p className="text-sm text-slate-500 mb-4">Toute l&apos;équipe doit valider « Lu » pour chaque alerte.</p>
      {msg && <div className="mb-3 p-3 bg-emerald-50 text-emerald-700 rounded-lg text-sm flex gap-2"><CheckCircle2 size={16} /> {msg}</div>}
      {err && <div className="mb-3 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{err}</div>}

      <h3 className="font-semibold mb-2 text-red-700">À lire ({unread.length})</h3>
      <div className="space-y-3 mb-6">
        {unread.length === 0 && <p className="text-sm text-slate-500">Aucune alerte en attente.</p>}
        {unread.map((a) => (
          <div key={a.id} className="bg-white border border-red-200 rounded-xl p-4">
            <div className="flex justify-between items-start">
              <div>
                <p className="font-bold text-lg">{a.medicament}</p>
                <p className="text-sm text-slate-600">Lot {a.lot} — N° alerte <strong>{a.alert_number}</strong></p>
                {a.laboratoire && <p className="text-xs text-slate-500">{a.laboratoire}</p>}
                {a.motif && <p className="text-sm mt-2">{a.motif}</p>}
              </div>
              <button type="button" onClick={() => handleAck(a.id)} className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-red-700">
                Lu
              </button>
            </div>
          </div>
        ))}
      </div>

      <h3 className="font-semibold mb-2">Déjà lues ({read.length})</h3>
      {read.map((a) => (
        <div key={a.id} className="bg-white border rounded-lg p-3 mb-2 text-sm flex justify-between">
          <span>{a.medicament} — Lot {a.lot} ({a.alert_number})</span>
          <span className="text-emerald-600 text-xs">Lu {new Date(acks[a.id]).toLocaleString('fr-FR')}</span>
        </div>
      ))}
    </div>
  );
}
