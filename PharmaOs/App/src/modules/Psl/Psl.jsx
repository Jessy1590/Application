import React, { useState, useEffect } from 'react';
import { useAuth } from '../../core/AuthContext';
import { Droplets, Save, CheckCircle2 } from 'lucide-react';
import { receivePslUnit, deliverPslUnit, fetchStockUnits } from '../../services/pslService.js';

export default function Psl() {
  const { user } = useAuth();
  const [tab, setTab] = useState('reception');
  const [stock, setStock] = useState([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [recv, setRecv] = useState({
    code_produit: '', numero_unite: '', groupe_abo: '', rh: '', date_peremption: '', fournisseur: '',
  });
  const [deliv, setDeliv] = useState({ unit_id: '', patient_initiales: '', patient_ipp: '', notes: '' });

  const load = async () => {
    try { setStock(await fetchStockUnits()); } catch (e) { setErr(e.message); }
  };
  useEffect(() => { load(); }, []);

  const handleRecv = async (e) => {
    e.preventDefault();
    setLoading(true); setErr(''); setMsg('');
    try {
      await receivePslUnit(user.id, recv);
      setMsg('Réception enregistrée.');
      setRecv({ code_produit: '', numero_unite: '', groupe_abo: '', rh: '', date_peremption: '', fournisseur: '' });
      load();
    } catch (e2) { setErr(e2.message); }
    finally { setLoading(false); }
  };

  const handleDeliv = async (e) => {
    e.preventDefault();
    setLoading(true); setErr(''); setMsg('');
    try {
      await deliverPslUnit(user.id, deliv.unit_id, deliv);
      setMsg('Délivrance enregistrée.');
      setDeliv({ unit_id: '', patient_initiales: '', patient_ipp: '', notes: '' });
      load();
    } catch (e2) { setErr(e2.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="w-full h-full flex flex-col bg-slate-50 text-slate-800">
      <div className="flex border-b bg-white">
        <button type="button" onClick={() => setTab('reception')} className={`flex-1 py-3 text-sm font-semibold ${tab === 'reception' ? 'border-b-2 border-rose-600 text-rose-700' : 'text-slate-500'}`}>Réception</button>
        <button type="button" onClick={() => setTab('delivrance')} className={`flex-1 py-3 text-sm font-semibold ${tab === 'delivrance' ? 'border-b-2 border-rose-600 text-rose-700' : 'text-slate-500'}`}>Délivrance</button>
      </div>
      <div className="flex-1 overflow-y-auto p-6 max-w-lg">
        <h2 className="text-xl font-bold mb-4 flex items-center gap-2"><Droplets className="text-rose-600" /> Traçabilité PSL</h2>
        {msg && <div className="mb-3 p-3 bg-emerald-50 text-emerald-700 rounded-lg text-sm flex gap-2"><CheckCircle2 size={16} /> {msg}</div>}
        {err && <div className="mb-3 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{err}</div>}

        {tab === 'reception' && (
          <form onSubmit={handleRecv} className="space-y-3 text-sm">
            <div><label className="block font-semibold mb-1">Code produit *</label>
              <input required value={recv.code_produit} onChange={(e) => setRecv({ ...recv, code_produit: e.target.value })} className="w-full p-2 border rounded-lg" /></div>
            <div><label className="block font-semibold mb-1">N° unité *</label>
              <input required value={recv.numero_unite} onChange={(e) => setRecv({ ...recv, numero_unite: e.target.value })} className="w-full p-2 border rounded-lg" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block font-semibold mb-1">Groupe ABO</label>
                <input value={recv.groupe_abo} onChange={(e) => setRecv({ ...recv, groupe_abo: e.target.value })} className="w-full p-2 border rounded-lg" placeholder="A/B/AB/O" /></div>
              <div><label className="block font-semibold mb-1">Rh</label>
                <input value={recv.rh} onChange={(e) => setRecv({ ...recv, rh: e.target.value })} className="w-full p-2 border rounded-lg" placeholder="+ / -" /></div>
            </div>
            <div><label className="block font-semibold mb-1">Péremption</label>
              <input type="date" value={recv.date_peremption} onChange={(e) => setRecv({ ...recv, date_peremption: e.target.value })} className="w-full p-2 border rounded-lg" /></div>
            <div><label className="block font-semibold mb-1">Fournisseur</label>
              <input value={recv.fournisseur} onChange={(e) => setRecv({ ...recv, fournisseur: e.target.value })} className="w-full p-2 border rounded-lg" /></div>
            <button type="submit" disabled={loading} className="w-full bg-rose-600 hover:bg-rose-700 text-white font-bold py-3 rounded-lg flex justify-center gap-2">
              <Save size={18} /> {loading ? '...' : 'Enregistrer réception'}
            </button>
          </form>
        )}

        {tab === 'delivrance' && (
          <form onSubmit={handleDeliv} className="space-y-3 text-sm">
            <div>
              <label className="block font-semibold mb-1">Unité en stock *</label>
              <select required value={deliv.unit_id} onChange={(e) => setDeliv({ ...deliv, unit_id: e.target.value })} className="w-full p-2 border rounded-lg">
                <option value="">—</option>
                {stock.map((u) => (
                  <option key={u.id} value={u.id}>{u.code_produit} / {u.numero_unite} ({u.groupe_abo}{u.rh})</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block font-semibold mb-1">Initiales patient</label>
                <input value={deliv.patient_initiales} onChange={(e) => setDeliv({ ...deliv, patient_initiales: e.target.value })} className="w-full p-2 border rounded-lg" /></div>
              <div><label className="block font-semibold mb-1">IPP interne</label>
                <input value={deliv.patient_ipp} onChange={(e) => setDeliv({ ...deliv, patient_ipp: e.target.value })} className="w-full p-2 border rounded-lg" /></div>
            </div>
            <button type="submit" disabled={loading} className="w-full bg-rose-600 hover:bg-rose-700 text-white font-bold py-3 rounded-lg flex justify-center gap-2">
              <Save size={18} /> {loading ? '...' : 'Valider délivrance'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
