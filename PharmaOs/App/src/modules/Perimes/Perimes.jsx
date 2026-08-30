import React, { useState, useEffect } from 'react';
import { useAuth } from '../../core/AuthContext';
import { Package, Save, CheckCircle2, CalendarClock } from 'lucide-react';
import {
  insertPerime,
  fetchPerimesExpiringSoon,
  updatePerimeStatus,
} from '../../services/perimesService.js';

export default function Perimes() {
  const { user } = useAuth();
  const [tab, setTab] = useState('saisie');
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [list, setList] = useState([]);
  const [form, setForm] = useState({
    medicament: '', cip: '', lot: '', date_peremption: '', quantite: 1,
    source: 'reception', notes: '',
  });

  useEffect(() => {
    if (tab === 'liste') loadList();
  }, [tab]);

  const loadList = async () => {
    const { data } = await fetchPerimesExpiringSoon();
    if (data) setList(data);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const { error } = await insertPerime(user.id, form);
      if (error) throw error;
      setSuccessMsg('Produit enregistré.');
      setForm({ medicament: '', cip: '', lot: '', date_peremption: '', quantite: 1, source: 'reception', notes: '' });
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err) {
      setErrorMsg(err.message || 'Erreur.');
    } finally {
      setLoading(false);
    }
  };

  const markStatus = async (id, status) => {
    await updatePerimeStatus(id, status);
    loadList();
  };

  return (
    <div className="w-full h-full flex flex-col bg-slate-50 text-slate-800">
      <div className="px-6 py-4 border-b border-slate-200 bg-white flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-2">
          <Package className="text-orange-600" />
          <h2 className="font-bold text-xl">Gestionnaire de périmés</h2>
        </div>
        <div className="flex bg-slate-100 p-1 rounded-lg">
          <button onClick={() => setTab('saisie')} className={`px-3 py-1.5 rounded-md text-sm font-medium ${tab === 'saisie' ? 'bg-white shadow text-orange-600' : 'text-slate-600'}`}>
            Saisie
          </button>
          <button onClick={() => setTab('liste')} className={`px-3 py-1.5 rounded-md text-sm font-medium ${tab === 'liste' ? 'bg-white shadow text-orange-600' : 'text-slate-600'}`}>
            À 3 mois
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {tab === 'saisie' && (
          <form onSubmit={handleSubmit} className="max-w-xl mx-auto bg-white p-6 rounded-xl border space-y-4 text-sm">
            <p className="text-slate-500 text-xs">À remplir à chaque réception ou inventaire.</p>
            {successMsg && <div className="p-3 bg-emerald-50 text-emerald-700 rounded-lg flex items-center gap-2"><CheckCircle2 size={16} /> {successMsg}</div>}
            {errorMsg && <div className="p-3 bg-red-50 text-red-700 rounded-lg">{errorMsg}</div>}

            <div>
              <label className="block font-semibold mb-1">Source</label>
              <select value={form.source} onChange={e => setForm({ ...form, source: e.target.value })} className="w-full p-2 border rounded-lg">
                <option value="reception">Réception</option>
                <option value="inventaire">Inventaire</option>
              </select>
            </div>
            <div>
              <label className="block font-semibold mb-1">Médicament *</label>
              <input required value={form.medicament} onChange={e => setForm({ ...form, medicament: e.target.value })} className="w-full p-2 border rounded-lg" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold mb-1">CIP</label>
                <input value={form.cip} onChange={e => setForm({ ...form, cip: e.target.value })} className="w-full p-2 border rounded-lg" />
              </div>
              <div>
                <label className="block font-semibold mb-1">Lot</label>
                <input value={form.lot} onChange={e => setForm({ ...form, lot: e.target.value })} className="w-full p-2 border rounded-lg" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold mb-1">Date péremption *</label>
                <input type="date" required value={form.date_peremption} onChange={e => setForm({ ...form, date_peremption: e.target.value })} className="w-full p-2 border rounded-lg" />
              </div>
              <div>
                <label className="block font-semibold mb-1">Quantité</label>
                <input type="number" min="1" value={form.quantite} onChange={e => setForm({ ...form, quantite: e.target.value })} className="w-full p-2 border rounded-lg" />
              </div>
            </div>
            <div>
              <label className="block font-semibold mb-1">Notes</label>
              <input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="w-full p-2 border rounded-lg" />
            </div>
            <button type="submit" disabled={loading} className="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold py-3 rounded-lg flex justify-center gap-2">
              <Save size={18} /> {loading ? '...' : 'Enregistrer'}
            </button>
          </form>
        )}

        {tab === 'liste' && (
          <div className="max-w-3xl mx-auto space-y-3">
            <p className="text-sm text-slate-500 flex items-center gap-2 mb-4">
              <CalendarClock size={16} /> Produits périmant dans les 3 mois — à mettre en avant ou en promo
            </p>
            {list.length === 0 ? (
              <p className="text-center text-slate-500 mt-10">Aucun produit dans cette fenêtre.</p>
            ) : list.map(p => (
              <div key={p.id} className="bg-white p-4 rounded-xl border border-slate-200 flex justify-between items-center">
                <div>
                  <p className="font-bold">{p.medicament} {p.cip && <span className="text-xs font-normal bg-slate-100 px-1.5 rounded">CIP {p.cip}</span>}</p>
                  <p className="text-sm text-slate-600">Péremption : {new Date(p.date_peremption).toLocaleDateString('fr-FR')} — Qté {p.quantite} {p.lot && `— Lot ${p.lot}`}</p>
                  <p className="text-xs text-slate-400 capitalize">{p.source}</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => markStatus(p.id, 'mis_en_avant')} className="px-3 py-1.5 text-xs bg-amber-100 text-amber-800 rounded-lg hover:bg-amber-200">En avant</button>
                  <button onClick={() => markStatus(p.id, 'promo')} className="px-3 py-1.5 text-xs bg-emerald-100 text-emerald-800 rounded-lg hover:bg-emerald-200">Promo</button>
                  <button onClick={() => markStatus(p.id, 'retire')} className="px-3 py-1.5 text-xs bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200">Retiré</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
