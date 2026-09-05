import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../../core/AuthContext.jsx';
import { Package, Save, CheckCircle2, History } from 'lucide-react';
import {
  insertPerime,
  fetchVisiblePerimes,
  PERIME_FORM_DEFAULTS,
  PERIME_STATUS_LABELS,
} from '../services/perimesService.js';
import PerimeForm from '../shared/PerimeForm.jsx';
import { closeModuleWindow } from '../../../shared/windowService.js';

export default function Perimes() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [list, setList] = useState([]);
  const [form, setForm] = useState(PERIME_FORM_DEFAULTS);

  const loadList = useCallback(async () => {
    try {
      setList(await fetchVisiblePerimes());
    } catch (e) {
      setErrorMsg(e.message);
    }
  }, []);

  useEffect(() => { loadList(); }, [loadList]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      await insertPerime(user.id, form);
      setSuccessMsg('Périmé déclaré.');
      setForm(PERIME_FORM_DEFAULTS);
      await loadList();
      setTimeout(() => closeModuleWindow(), 800);
    } catch (err) {
      setErrorMsg(err.message || 'Erreur.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full h-full flex bg-slate-50 text-slate-800">
      <div className="w-1/2 bg-white border-r border-slate-200 p-6 overflow-y-auto">
        <h2 className="text-xl font-bold mb-2 flex items-center gap-2">
          <Package className="text-orange-600" /> Déclarer un périmé
        </h2>
        <p className="text-sm text-slate-500 mb-4">
          Produit périmant dans les 12 mois glissants. La décision (mise en avant / promo / litige) se fait côté admin à J−3 mois.
        </p>

        {successMsg && (
          <div className="mb-3 p-3 bg-emerald-50 text-emerald-700 rounded-lg flex gap-2 text-sm">
            <CheckCircle2 size={16} /> {successMsg}
          </div>
        )}
        {errorMsg && <div className="mb-3 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{errorMsg}</div>}

        <form onSubmit={handleSubmit} className="space-y-4">
          <PerimeForm
            form={form}
            onChange={(patch) => setForm((prev) => ({ ...prev, ...patch }))}
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold py-3 rounded-xl flex justify-center gap-2 disabled:opacity-70"
          >
            <Save size={18} /> {loading ? 'Enregistrement…' : 'Déclarer le périmé'}
          </button>
        </form>
      </div>

      <div className="w-1/2 bg-slate-100 p-6 overflow-y-auto">
        <h3 className="font-bold mb-4 flex items-center gap-2 text-slate-700">
          <History size={18} /> Périmés déclarés
        </h3>
        {list.length === 0 ? (
          <p className="text-slate-500 text-sm">Aucun périmé visible.</p>
        ) : (
          <div className="space-y-3">
            {list.map((p) => (
              <div key={p.id} className="bg-white p-4 rounded-lg border shadow-sm text-sm">
                <div className="flex justify-between items-start gap-2">
                  <span className="font-bold">{p.medicament}</span>
                  <span className="text-xs bg-slate-100 px-2 py-0.5 rounded">
                    {PERIME_STATUS_LABELS[p.status] || p.status}
                  </span>
                </div>
                <p className="text-slate-600 mt-1">
                  {[p.code && `Code ${p.code}`, p.cip && `CIP ${p.cip}`, p.lot && `Lot ${p.lot}`]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  DLC {new Date(p.date_peremption).toLocaleDateString('fr-FR')} — Qté {p.quantite}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
