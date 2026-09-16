import React, { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, AlertOctagon, Save, Users, Download, ExternalLink } from 'lucide-react';
import { useAuth } from '../../../core/AuthContext.jsx';
import {
  createLotAlert, fetchLotAlerts, fetchAcksForAlert, updateLotAlertSteps, closeLotAlert,
  fetchTeamProfiles, fetchAnsmSecurityAlerts,
} from '../services/lotAlertService.js';
import { useRealtimeRefresh } from '../../../shared/useRealtimeRefresh.js';
import MedicamentFields from '../../../shared/MedicamentFields.jsx';

export default function RetraitLotManager({ onNavigate }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [alerts, setAlerts] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [acksMap, setAcksMap] = useState({});
  const [selected, setSelected] = useState(null);
  const [steps, setSteps] = useState('');
  const [ansmItems, setAnsmItems] = useState([]);
  const [ansmLoading, setAnsmLoading] = useState(false);
  const [ansmErr, setAnsmErr] = useState('');
  const [form, setForm] = useState({
    alert_number: '', laboratoire: '', medicament: '', lot: '', motif: '',
    requires_return: false, return_location: '', source: 'manuel', external_ref: '',
  });

  const load = useCallback(async () => {
    const list = await fetchLotAlerts();
    setAlerts(list);
    setProfiles(await fetchTeamProfiles());
    const map = {};
    await Promise.all(list.filter((a) => a.status !== 'clos').slice(0, 20).map(async (a) => {
      map[a.id] = await fetchAcksForAlert(a.id);
    }));
    setAcksMap(map);
  }, []);

  useEffect(() => { load().catch((e) => console.error(e)); }, [load]);
  useRealtimeRefresh(load, { tables: ['lot_alerts', 'lot_alert_acks'] });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true); setSuccess('');
    try {
      const { dispute } = await createLotAlert(form, user.id);
      setSuccess(dispute
        ? 'Alerte créée, équipe notifiée, litige fournisseur ouvert automatiquement.'
        : 'Alerte créée et assignée à toute l\'équipe.');
      setForm({
        alert_number: '', laboratoire: '', medicament: '', lot: '', motif: '',
        requires_return: false, return_location: '', source: 'manuel', external_ref: '',
      });
      load();
    } catch (err) {
      alert('Erreur : ' + err.message);
    } finally { setLoading(false); }
  };

  const handleSaveSteps = async () => {
    if (!selected) return;
    await updateLotAlertSteps(selected.id, { steps_done: steps, reception_validated: true });
    setSuccess('Démarches enregistrées / réception validée.');
    setSelected(null);
    load();
  };

  const loadAnsm = async () => {
    setAnsmLoading(true);
    setAnsmErr('');
    try {
      const items = await fetchAnsmSecurityAlerts();
      setAnsmItems(items.filter((i) => i.isRappel).concat(items.filter((i) => !i.isRappel)).slice(0, 40));
    } catch (e) {
      setAnsmErr(e.message + ' — saisie manuelle toujours possible.');
    } finally {
      setAnsmLoading(false);
    }
  };

  const applyAnsm = (item) => {
    setForm({
      alert_number: item.alert_number || `ANSM-${Date.now().toString(36).toUpperCase()}`,
      laboratoire: item.laboratoire || '',
      medicament: item.medicament || '',
      lot: item.lot || '',
      motif: item.motif || item.title,
      requires_return: /rappel|retrait/i.test(item.title),
      return_location: '',
      source: 'ansm',
      external_ref: item.link || '',
    });
    setSuccess('Brouillon prérempli depuis ANSM — complétez lot / laboratoire si manquants, puis créez l\'alerte.');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="p-8 max-w-4xl mx-auto w-full">
      <button type="button" onClick={() => onNavigate('dashboard')} className="flex items-center gap-2 text-slate-500 hover:text-red-600 mb-6 text-sm font-medium">
        <ArrowLeft size={16} /> Retour au Dashboard
      </button>

      <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2 mb-2">
        <AlertOctagon className="text-red-600" /> Alerte Sanitaire — Retrait de Lot
      </h1>
      <p className="text-sm text-slate-500 mb-6">N° d&apos;alerte obligatoire, accusés de lecture équipe, démarches, litige auto si renvoi. Import possible depuis le flux RSS ANSM.</p>

      {success && <div className="mb-4 p-3 bg-emerald-50 text-emerald-700 rounded-lg border border-emerald-200 text-sm">{success}</div>}

      <form onSubmit={handleSubmit} className="bg-white p-6 rounded-xl border border-red-200 shadow-sm space-y-4 mb-8">
        <div>
          <label className="block font-semibold mb-1 text-sm">N° d&apos;alerte *</label>
          <input required value={form.alert_number} onChange={(e) => setForm({ ...form, alert_number: e.target.value })} className="w-full p-2 border rounded-lg" placeholder="ANSM / interne" />
        </div>
        <div>
          <label className="block font-semibold mb-1 text-sm">Laboratoire / Émetteur</label>
          <input value={form.laboratoire} onChange={(e) => setForm({ ...form, laboratoire: e.target.value })} className="w-full p-2 border rounded-lg" />
        </div>
        <MedicamentFields
          mode="name-only"
          medicament={form.medicament}
          required
          medicamentLabel="Médicament"
          inputClassName="w-full p-2 border rounded-lg"
          labelClassName="block font-semibold mb-1 text-sm"
          onChange={(patch) => setForm((prev) => ({ ...prev, ...patch }))}
        />
        <div>
          <label className="block font-semibold mb-1 text-sm">N° de lot *</label>
          <input required value={form.lot} onChange={(e) => setForm({ ...form, lot: e.target.value })} className="w-full p-2 border rounded-lg" />
        </div>
        <div>
          <label className="block font-semibold mb-1 text-sm">Motif du retrait</label>
          <textarea required rows={3} value={form.motif} onChange={(e) => setForm({ ...form, motif: e.target.value })} className="w-full p-2 border rounded-lg" />
        </div>
        {form.external_ref && (
          <a href={form.external_ref} target="_blank" rel="noreferrer" className="text-xs text-sky-700 flex items-center gap-1">
            <ExternalLink size={12} /> Source ANSM
          </a>
        )}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.requires_return} onChange={(e) => setForm({ ...form, requires_return: e.target.checked })} />
          Produits à renvoyer (ouvre un litige fournisseur)
        </label>
        {form.requires_return && (
          <input placeholder="Lieu de renvoi" value={form.return_location} onChange={(e) => setForm({ ...form, return_location: e.target.value })} className="w-full p-2 border rounded-lg text-sm" />
        )}
        <button type="submit" disabled={loading} className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-lg flex justify-center gap-2">
          <Save size={18} /> {loading ? 'Création...' : 'Créer l\'alerte et assigner à l\'équipe'}
        </button>
      </form>

      <div className="bg-white border rounded-xl p-4 mb-8">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h2 className="font-semibold text-sm">Importer depuis ANSM (RSS infos sécurité)</h2>
          <button type="button" onClick={loadAnsm} disabled={ansmLoading} className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 text-white rounded-lg text-xs font-medium">
            <Download size={14} /> {ansmLoading ? 'Chargement…' : 'Charger le flux'}
          </button>
        </div>
        <p className="text-xs text-slate-500 mb-3">
          L&apos;ANSM ne publie pas d&apos;API lot structurée : le flux préremplit titre / motif / n° quand détectable. Vérifiez lot et médicament avant création.
        </p>
        {ansmErr && <p className="text-xs text-amber-700 mb-2">{ansmErr}</p>}
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {ansmItems.map((item, idx) => (
            <div key={idx} className="border rounded-lg p-3 text-sm flex justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium line-clamp-2">{item.title}</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {item.pubDate && new Date(item.pubDate).toLocaleDateString('fr-FR')}
                  {item.alert_number ? ` · N° ${item.alert_number}` : ''}
                  {item.isRappel ? ' · rappel/retrait' : ''}
                </p>
              </div>
              <button type="button" onClick={() => applyAnsm(item)} className="shrink-0 text-xs px-2 py-1 bg-red-50 text-red-700 rounded border border-red-100">
                Préremplir
              </button>
            </div>
          ))}
          {ansmItems.length === 0 && !ansmLoading && (
            <p className="text-xs text-slate-400">Cliquez sur « Charger le flux » pour lister les dernières infos ANSM.</p>
          )}
        </div>
      </div>

      <h2 className="font-semibold mb-3">Alertes récentes</h2>
      <div className="space-y-3">
        {alerts.slice(0, 15).map((a) => {
          const acks = acksMap[a.id] || [];
          const ackIds = new Set(acks.map((x) => x.user_id));
          const pending = profiles.filter((p) => !ackIds.has(p.id));
          return (
            <div key={a.id} className="bg-white border rounded-xl p-4 text-sm">
              <div className="flex justify-between">
                <div>
                  <p className="font-bold">{a.medicament} — Lot {a.lot}</p>
                  <p className="text-xs text-slate-500">N° {a.alert_number} · {a.status}{a.requires_return ? ' · renvoi' : ''}{a.source === 'ansm' ? ' · ANSM' : ''}</p>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => { setSelected(a); setSteps(a.steps_done || ''); }} className="text-xs px-2 py-1 bg-slate-100 rounded">Démarches</button>
                  {a.status !== 'clos' && (
                    <button type="button" onClick={async () => { await closeLotAlert(a.id); load(); }} className="text-xs px-2 py-1 bg-emerald-100 text-emerald-700 rounded">Clôturer</button>
                  )}
                </div>
              </div>
              <p className="mt-2 text-xs flex items-center gap-1 text-slate-600">
                <Users size={12} /> Lus : {acks.length}/{profiles.length}
                {pending.length > 0 && <span className="text-amber-600"> — manquent : {pending.map((p) => p.display_name).join(', ')}</span>}
              </p>
            </div>
          );
        })}
      </div>

      {selected && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-lg w-full space-y-3">
            <h3 className="font-bold">Démarches — {selected.alert_number}</h3>
            <textarea rows={5} value={steps} onChange={(e) => setSteps(e.target.value)} className="w-full p-2 border rounded-lg text-sm" placeholder="Quarantaine, affiches, patients contactés…" />
            <div className="flex gap-2">
              <button type="button" onClick={handleSaveSteps} className="flex-1 bg-red-600 text-white py-2 rounded-lg font-semibold">Valider réception + démarches</button>
              <button type="button" onClick={() => setSelected(null)} className="px-4 border rounded-lg">Annuler</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
