import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../core/AuthContext';
import { Droplets, Save, CheckCircle2, Scan, History } from 'lucide-react';
import {
  receivePslUnit, deliverPslUnit, fetchStockUnits, fetchDeliveryHistory, parseDatamatrix,
} from '../../services/pslService.js';

const Field = ({ label, children, hint }) => (
  <div>
    <label className="block text-xs font-semibold text-slate-700 mb-1">{label}</label>
    {children}
    {hint && <p className="text-[11px] text-slate-500 mt-0.5">{hint}</p>}
  </div>
);

export default function Psl() {
  const { user } = useAuth();
  const [tab, setTab] = useState('delivrance');
  const [stock, setStock] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const scanRef = useRef(null);
  const [scanBuf, setScanBuf] = useState('');
  const [recv, setRecv] = useState({
    code_produit: '', numero_unite: '', denomination: 'Rophylac',
    date_peremption: '', fournisseur: '', lot: '', datamatrix_raw: '', quantite_reception: '1',
  });
  const [deliv, setDeliv] = useState({
    unit_id: '', prescripteur_nom: '', prescripteur_adresse: '',
    patient_nom: '', patient_prenom: '', patient_adresse: '', patient_dob: '',
    quantite: '1', etiquette_tracabilite: '', datamatrix_raw: '', notes: '',
  });

  const load = async () => {
    try {
      setStock(await fetchStockUnits());
      setHistory(await fetchDeliveryHistory(30));
    } catch (e) { setErr(e.message); }
  };
  useEffect(() => { load(); }, []);

  const applyScan = (raw, target) => {
    const p = parseDatamatrix(raw);
    if (target === 'recv') {
      setRecv((r) => ({
        ...r,
        datamatrix_raw: raw,
        code_produit: p.code_produit || r.code_produit,
        numero_unite: p.numero_unite || r.numero_unite,
        lot: p.lot || r.lot,
        date_peremption: p.date_peremption || r.date_peremption,
        denomination: r.denomination || 'Rophylac',
      }));
    } else {
      setDeliv((d) => ({ ...d, datamatrix_raw: raw, etiquette_tracabilite: raw }));
      const match = stock.find((u) => u.numero_unite === p.numero_unite || u.datamatrix_raw === raw);
      if (match) setDeliv((d) => ({ ...d, unit_id: match.id }));
    }
    setMsg('Datamatrix enregistré (chaîne complète).');
  };

  const handleScanKey = (e, target) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (scanBuf.trim()) applyScan(scanBuf.trim(), target);
      setScanBuf('');
    }
  };

  const handleRecv = async (e) => {
    e.preventDefault();
    setLoading(true); setErr(''); setMsg('');
    try {
      await receivePslUnit(user.id, recv);
      setMsg('Réception enregistrée (stock + mouvement).');
      setRecv({
        code_produit: '', numero_unite: '', denomination: 'Rophylac',
        date_peremption: '', fournisseur: '', lot: '', datamatrix_raw: '', quantite_reception: '1',
      });
      load();
    } catch (e2) { setErr(e2.message); }
    finally { setLoading(false); }
  };

  const handleDeliv = async (e) => {
    e.preventDefault();
    setLoading(true); setErr(''); setMsg('');
    try {
      await deliverPslUnit(user.id, deliv.unit_id, {
        ...deliv,
        quantite: Number(deliv.quantite),
      });
      setMsg('Délivrance enregistrée au registre MDS.');
      setDeliv({
        unit_id: '', prescripteur_nom: '', prescripteur_adresse: '',
        patient_nom: '', patient_prenom: '', patient_adresse: '', patient_dob: '',
        quantite: '1', etiquette_tracabilite: '', datamatrix_raw: '', notes: '',
      });
      load();
      setTab('historique');
    } catch (e2) { setErr(e2.message); }
    finally { setLoading(false); }
  };

  const hasDm = !!(recv.datamatrix_raw && recv.datamatrix_raw.trim());

  return (
    <div className="w-full h-full flex flex-col bg-slate-50 text-slate-800">
      <div className="flex border-b bg-white">
        {[
          { id: 'reception', label: 'Réception' },
          { id: 'delivrance', label: 'Délivrance comptoir' },
          { id: 'historique', label: 'Historique' },
        ].map((t) => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)}
            className={`flex-1 py-3 text-sm font-semibold ${tab === t.id ? 'border-b-2 border-rose-600 text-rose-700' : 'text-slate-500'}`}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto p-6 max-w-2xl">
        <h2 className="text-xl font-bold mb-1 flex items-center gap-2"><Droplets className="text-rose-600" /> MDS — Médicaments dérivés du sang</h2>
        <p className="text-xs text-slate-500 mb-4">Biper la boîte ou saisir manuellement. Pas de groupe ABO / Rh (non pertinent pour Rophylac / MDS).</p>
        {msg && <div className="mb-3 p-3 bg-emerald-50 text-emerald-700 rounded-lg text-sm flex gap-2"><CheckCircle2 size={16} /> {msg}</div>}
        {err && <div className="mb-3 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{err}</div>}

        {tab !== 'historique' && (
          <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-lg">
            <label className="flex items-center gap-2 text-sm font-semibold text-rose-800 mb-1"><Scan size={16} /> Scan datamatrix (chaîne complète)</label>
            <input ref={scanRef} value={scanBuf} onChange={(e) => setScanBuf(e.target.value)}
              onKeyDown={(e) => handleScanKey(e, tab === 'reception' ? 'recv' : 'deliv')}
              placeholder="Biper ici puis Entrée…" className="w-full p-2 border rounded-lg font-mono text-xs" autoFocus />
          </div>
        )}

        {tab === 'reception' && (
          <form onSubmit={handleRecv} className="space-y-3 text-sm">
            <fieldset className="border rounded-lg p-3 space-y-3">
              <legend className="font-bold px-1">Produit reçu</legend>
              <Field label="Dénomination *">
                <input required value={recv.denomination} onChange={(e) => setRecv({ ...recv, denomination: e.target.value })} className="w-full p-2 border rounded-lg" placeholder="Ex. Rophylac 300 µg" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Code CIP / produit *" hint={hasDm ? 'Prérempli depuis le datamatrix' : 'Obligatoire sans datamatrix'}>
                  <input required value={recv.code_produit} onChange={(e) => setRecv({ ...recv, code_produit: e.target.value })} className="w-full p-2 border rounded-lg" />
                </Field>
                <Field label="N° unité / série">
                  <input value={recv.numero_unite} onChange={(e) => setRecv({ ...recv, numero_unite: e.target.value })} className="w-full p-2 border rounded-lg" />
                </Field>
              </div>
              {!hasDm && (
                <p className="text-xs text-amber-700 bg-amber-50 p-2 rounded">Sans datamatrix : lot, péremption, dosage (dans dénomination) et CIP sont requis.</p>
              )}
              <div className="grid grid-cols-2 gap-3">
                <Field label={`Lot ${!hasDm ? '*' : ''}`}>
                  <input required={!hasDm} value={recv.lot} onChange={(e) => setRecv({ ...recv, lot: e.target.value })} className="w-full p-2 border rounded-lg" />
                </Field>
                <Field label={`Date de péremption ${!hasDm ? '*' : ''}`}>
                  <input type="date" required={!hasDm} value={recv.date_peremption} onChange={(e) => setRecv({ ...recv, date_peremption: e.target.value })} className="w-full p-2 border rounded-lg" />
                </Field>
              </div>
              <Field label="Fournisseur">
                <input value={recv.fournisseur} onChange={(e) => setRecv({ ...recv, fournisseur: e.target.value })} className="w-full p-2 border rounded-lg" />
              </Field>
              <Field label="Datamatrix brut (chaîne)">
                <textarea rows={2} value={recv.datamatrix_raw} onChange={(e) => setRecv({ ...recv, datamatrix_raw: e.target.value })} className="w-full p-2 border rounded-lg font-mono text-xs" placeholder="Collé automatiquement au scan" />
              </Field>
            </fieldset>
            <button type="submit" disabled={loading} className="w-full bg-rose-600 text-white font-bold py-3 rounded-lg flex justify-center gap-2"><Save size={18} /> Enregistrer réception</button>
          </form>
        )}

        {tab === 'delivrance' && (
          <form onSubmit={handleDeliv} className="space-y-3 text-sm">
            <Field label="Unité en stock *">
              <select required value={deliv.unit_id} onChange={(e) => setDeliv({ ...deliv, unit_id: e.target.value })} className="w-full p-2 border rounded-lg">
                <option value="">— Choisir une unité —</option>
                {stock.map((u) => (
                  <option key={u.id} value={u.id}>{u.denomination || u.code_produit} / {u.numero_unite} {u.lot ? `(lot ${u.lot})` : ''}</option>
                ))}
              </select>
            </Field>
            <fieldset className="border rounded-lg p-3 space-y-2">
              <legend className="font-bold px-1">Prescripteur</legend>
              <Field label="Nom du prescripteur *">
                <input required value={deliv.prescripteur_nom} onChange={(e) => setDeliv({ ...deliv, prescripteur_nom: e.target.value })} className="w-full p-2 border rounded-lg" />
              </Field>
              <Field label="Adresse du prescripteur">
                <input value={deliv.prescripteur_adresse} onChange={(e) => setDeliv({ ...deliv, prescripteur_adresse: e.target.value })} className="w-full p-2 border rounded-lg" />
              </Field>
            </fieldset>
            <fieldset className="border rounded-lg p-3 space-y-2">
              <legend className="font-bold px-1">Patient</legend>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Nom *"><input required value={deliv.patient_nom} onChange={(e) => setDeliv({ ...deliv, patient_nom: e.target.value })} className="w-full p-2 border rounded-lg" /></Field>
                <Field label="Prénom *"><input required value={deliv.patient_prenom} onChange={(e) => setDeliv({ ...deliv, patient_prenom: e.target.value })} className="w-full p-2 border rounded-lg" /></Field>
              </div>
              <Field label="Adresse patient">
                <input value={deliv.patient_adresse} onChange={(e) => setDeliv({ ...deliv, patient_adresse: e.target.value })} className="w-full p-2 border rounded-lg" />
              </Field>
              <Field label="Date de naissance *">
                <input required type="date" value={deliv.patient_dob} onChange={(e) => setDeliv({ ...deliv, patient_dob: e.target.value })} className="w-full p-2 border rounded-lg" />
              </Field>
            </fieldset>
            <Field label="Nombre d'unités entières délivrées *" hint="Entier uniquement (ex. 1, 2…)">
              <input type="number" min={1} step={1} required value={deliv.quantite} onChange={(e) => setDeliv({ ...deliv, quantite: e.target.value })} className="w-full p-2 border rounded-lg" />
            </Field>
            <Field label="Étiquette / datamatrix de traçabilité">
              <textarea rows={2} value={deliv.etiquette_tracabilite} onChange={(e) => setDeliv({ ...deliv, etiquette_tracabilite: e.target.value })} className="w-full p-2 border rounded-lg font-mono text-xs" />
            </Field>
            <Field label="Notes">
              <textarea rows={2} value={deliv.notes} onChange={(e) => setDeliv({ ...deliv, notes: e.target.value })} className="w-full p-2 border rounded-lg" />
            </Field>
            <button type="submit" disabled={loading} className="w-full bg-rose-600 text-white font-bold py-3 rounded-lg flex justify-center gap-2"><Save size={18} /> Valider délivrance (registre)</button>
          </form>
        )}

        {tab === 'historique' && (
          <div className="space-y-2">
            <h3 className="font-semibold flex items-center gap-2 text-sm"><History size={16} /> Délivrances récentes ({history.length})</h3>
            {history.length === 0 && <p className="text-sm text-slate-500">Aucune délivrance au registre. Si une unité est marquée délivrée sans ligne ici, exécutez la migration 009 (backfill).</p>}
            {history.map((m) => (
              <div key={m.id} className="bg-white border rounded-lg p-3 text-sm">
                <div className="flex justify-between gap-2">
                  <span className="font-bold">N° {m.registry_number ?? '—'}</span>
                  <span className="text-xs text-slate-500">{m.date_delivrance || new Date(m.created_at).toLocaleDateString('fr-FR')}</span>
                </div>
                <p>{m.patient_prenom} {m.patient_nom} — {m.denomination || m.psl_units?.denomination || m.psl_units?.code_produit}</p>
                <p className="text-xs text-slate-500">Qté : {m.quantite ?? 1} — Prescripteur : {m.prescripteur_nom || '—'}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
