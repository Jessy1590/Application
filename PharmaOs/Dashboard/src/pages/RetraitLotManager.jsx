import React, { useState, useEffect } from 'react';
import { ArrowLeft, AlertOctagon, Save, Users } from 'lucide-react';
import { useAuth } from '../core/AuthContext';
import { createLotAlert, fetchLotAlerts, fetchAcksForAlert, updateLotAlertSteps, closeLotAlert } from '../services/lotAlertService';
import { fetchTeamProfiles } from '../services/hrService';

export default function RetraitLotManager({ onNavigate }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [alerts, setAlerts] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [acksMap, setAcksMap] = useState({});
  const [selected, setSelected] = useState(null);
  const [steps, setSteps] = useState('');
  const [form, setForm] = useState({
    alert_number: '', laboratoire: '', medicament: '', lot: '', motif: '',
    requires_return: false, return_location: '',
  });

  const load = async () => {
    const list = await fetchLotAlerts();
    setAlerts(list);
    setProfiles(await fetchTeamProfiles());
    const map = {};
    await Promise.all(list.filter((a) => a.status !== 'clos').slice(0, 20).map(async (a) => {
      map[a.id] = await fetchAcksForAlert(a.id);
    }));
    setAcksMap(map);
  };

  useEffect(() => { load().catch((e) => console.error(e)); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true); setSuccess('');
    try {
      const { dispute } = await createLotAlert(form, user.id);
      setSuccess(dispute
        ? 'Alerte créée, équipe notifiée, litige fournisseur ouvert automatiquement.'
        : 'Alerte créée et assignée à toute l\'équipe.');
      setForm({ alert_number: '', laboratoire: '', medicament: '', lot: '', motif: '', requires_return: false, return_location: '' });
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

  return (
    <div className="p-8 max-w-4xl mx-auto w-full">
      <button type="button" onClick={() => onNavigate('dashboard')} className="flex items-center gap-2 text-slate-500 hover:text-red-600 mb-6 text-sm font-medium">
        <ArrowLeft size={16} /> Retour au Dashboard
      </button>

      <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2 mb-2">
        <AlertOctagon className="text-red-600" /> Alerte Sanitaire — Retrait de Lot
      </h1>
      <p className="text-sm text-slate-500 mb-6">N° d&apos;alerte obligatoire, accusés de lecture équipe, démarches, litige auto si renvoi.</p>

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
        <div>
          <label className="block font-semibold mb-1 text-sm">Médicament *</label>
          <input required value={form.medicament} onChange={(e) => setForm({ ...form, medicament: e.target.value })} className="w-full p-2 border rounded-lg" />
        </div>
        <div>
          <label className="block font-semibold mb-1 text-sm">N° de lot *</label>
          <input required value={form.lot} onChange={(e) => setForm({ ...form, lot: e.target.value })} className="w-full p-2 border rounded-lg" />
        </div>
        <div>
          <label className="block font-semibold mb-1 text-sm">Motif du retrait</label>
          <textarea required rows={3} value={form.motif} onChange={(e) => setForm({ ...form, motif: e.target.value })} className="w-full p-2 border rounded-lg" />
        </div>
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
                  <p className="text-xs text-slate-500">N° {a.alert_number} · {a.status}{a.requires_return ? ' · renvoi' : ''}</p>
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
