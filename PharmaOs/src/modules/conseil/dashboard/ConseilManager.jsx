import React, { useCallback, useEffect, useState } from 'react';
import { BookOpen, Plus, Power, Pencil, X } from 'lucide-react';
import { useAuth } from '../../../core/AuthContext.jsx';
import MedicamentFields from '../../../shared/MedicamentFields.jsx';
import {
  fetchConseils,
  createConseil,
  updateConseil,
  setConseilActive,
  fetchConseilEvents,
  fetchTeamProfiles,
} from '../services/conseilService.js';

const TARGET_LABELS = {
  substance: 'Substance / DCI',
  specialite: 'Spécialité',
  presentation: 'Présentation / CIP',
};

const emptyForm = () => ({
  id: null,
  target_type: '',
  cis: null,
  cip13: null,
  code_substance: null,
  label_snapshot: '',
  message: '',
  is_active: true,
  medicament: '',
  cip: '',
});

function mapSuggestionToTarget(s) {
  if (!s) return null;
  const label = (s.label || s.denomination || '').trim();
  if (s.kind === 'dci' || s.code_substance) {
    return {
      target_type: 'substance',
      code_substance: s.code_substance || null,
      cis: null,
      cip13: null,
      label_snapshot: label,
      medicament: label,
      cip: '',
    };
  }
  if (s.kind === 'produit' || s.cip13 || s.cip7) {
    const cip = String(s.cip13 || s.cip7 || '').trim();
    return {
      target_type: 'presentation',
      cip13: s.cip13 || cip || null,
      cis: s.cis || null,
      code_substance: null,
      label_snapshot: label,
      medicament: label,
      cip,
    };
  }
  if (s.kind === 'specialite' || s.cis) {
    return {
      target_type: 'specialite',
      cis: s.cis || null,
      cip13: null,
      code_substance: null,
      label_snapshot: label,
      medicament: label,
      cip: '',
    };
  }
  return null;
}

export default function ConseilManager() {
  const { user } = useAuth();
  const [tab, setTab] = useState('liste');
  const [conseils, setConseils] = useState([]);
  const [events, setEvents] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({
    status: '',
    userId: '',
    since: '',
    until: '',
  });

  const loadConseils = useCallback(async () => {
    setConseils(await fetchConseils({ includeInactive: true }));
  }, []);

  const loadEvents = useCallback(async () => {
    const since = filters.since ? new Date(`${filters.since}T00:00:00`).toISOString() : null;
    const until = filters.until ? new Date(`${filters.until}T23:59:59`).toISOString() : null;
    setEvents(await fetchConseilEvents({
      status: filters.status || null,
      userId: filters.userId || null,
      since,
      until,
    }));
  }, [filters]);

  useEffect(() => {
    loadConseils().catch((e) => setErr(e.message));
    fetchTeamProfiles().then(setProfiles).catch(() => {});
  }, [loadConseils]);

  useEffect(() => {
    if (tab === 'historique') {
      loadEvents().catch((e) => setErr(e.message));
    }
  }, [tab, loadEvents]);

  const openCreate = () => {
    setForm(emptyForm());
    setErr('');
    setMsg('');
    setTab('form');
  };

  const openEdit = (c) => {
    setForm({
      id: c.id,
      target_type: c.target_type,
      cis: c.cis,
      cip13: c.cip13,
      code_substance: c.code_substance,
      label_snapshot: c.label_snapshot || '',
      message: c.message || '',
      is_active: c.is_active !== false,
      medicament: c.label_snapshot || '',
      cip: c.cip13 || '',
    });
    setErr('');
    setMsg('');
    setTab('form');
  };

  const handleSuggestSelect = (s) => {
    const mapped = mapSuggestionToTarget(s);
    if (!mapped) {
      setErr('Sélectionnez une substance, spécialité ou CIP BDPM.');
      return;
    }
    setForm((prev) => ({ ...prev, ...mapped }));
    setErr('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErr('');
    setMsg('');
    try {
      if (!form.target_type || !form.label_snapshot) {
        throw new Error('Choisissez une cible via l’autocomplétion BDPM.');
      }
      const payload = {
        target_type: form.target_type,
        cis: form.cis,
        cip13: form.cip13,
        code_substance: form.code_substance,
        label_snapshot: form.label_snapshot,
        message: form.message,
        is_active: form.is_active,
      };
      if (form.id) {
        await updateConseil(form.id, payload);
        setMsg('Conseil mis à jour.');
      } else {
        await createConseil(payload, user?.id);
        setMsg('Conseil créé.');
      }
      await loadConseils();
      setTab('liste');
      setForm(emptyForm());
    } catch (ex) {
      setErr(ex.message || 'Erreur enregistrement');
    } finally {
      setLoading(false);
    }
  };

  const profileName = (id) => profiles.find((p) => p.id === id)?.display_name || id?.slice(0, 8) || '—';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2 text-slate-800">
          <BookOpen className="text-rose-600" /> Conseil
        </h1>
        <p className="text-sm text-slate-500">
          Conseils associés à une substance, spécialité ou CIP — affichage live dans la taskbar.
        </p>
      </div>

      {msg && <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 p-2 rounded-lg">{msg}</p>}
      {err && <p className="text-sm text-rose-700 bg-rose-50 border border-rose-100 p-2 rounded-lg">{err}</p>}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setTab('liste')}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === 'liste' ? 'bg-rose-600 text-white' : 'bg-white border'}`}
        >
          Liste
        </button>
        <button
          type="button"
          onClick={() => setTab('historique')}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === 'historique' ? 'bg-rose-600 text-white' : 'bg-white border'}`}
        >
          Historique
        </button>
        <button
          type="button"
          onClick={openCreate}
          className="ml-auto px-4 py-2 rounded-lg text-sm font-medium bg-slate-800 text-white flex items-center gap-1"
        >
          <Plus size={16} /> Nouveau conseil
        </button>
      </div>

      {tab === 'form' && (
        <form onSubmit={handleSubmit} className="bg-white p-5 rounded-xl border border-slate-200 space-y-4 max-w-2xl">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-slate-800">{form.id ? 'Modifier le conseil' : 'Nouveau conseil'}</h2>
            <button type="button" onClick={() => { setTab('liste'); setForm(emptyForm()); }} className="text-slate-400 hover:text-slate-700">
              <X size={18} />
            </button>
          </div>

          <MedicamentFields
            mode="name+cip"
            medicament={form.medicament}
            cip={form.cip}
            required
            medicamentLabel="Cible BDPM (substance / spécialité / CIP)"
            medicamentPlaceholder="Rechercher une DCI, un nom commercial ou un CIP…"
            cipLabel="CIP (si présentation)"
            onChange={(patch) => setForm((prev) => ({
              ...prev,
              ...patch,
              // reset binding si saisie libre sans re-sélection
              ...(patch.medicament !== undefined && patch.medicament !== prev.label_snapshot
                ? { target_type: '', cis: null, cip13: null, code_substance: null, label_snapshot: '' }
                : {}),
            }))}
            onSuggestSelect={handleSuggestSelect}
          />

          {form.target_type && (
            <p className="text-xs text-slate-500">
              Cible : <strong>{TARGET_LABELS[form.target_type] || form.target_type}</strong>
              {' — '}
              {form.label_snapshot}
              {form.cip13 ? ` · CIP ${form.cip13}` : ''}
              {form.cis ? ` · CIS ${form.cis}` : ''}
              {form.code_substance ? ` · substance ${form.code_substance}` : ''}
            </p>
          )}

          <div>
            <label className="block text-sm font-semibold mb-1" htmlFor="conseil-msg">Message affiché en taskbar *</label>
            <textarea
              id="conseil-msg"
              required
              rows={3}
              value={form.message}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
              className="w-full p-2 border border-slate-300 rounded-lg bg-slate-50 focus:ring-2 focus:ring-rose-500"
              placeholder="Ex. Proposer un spray nasal hydratant en association…"
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
            />
            Actif (visible dans le match taskbar)
          </label>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-lg"
          >
            {loading ? 'Enregistrement…' : (form.id ? 'Enregistrer' : 'Créer le conseil')}
          </button>
        </form>
      )}

      {tab === 'liste' && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 border-b">
              <tr>
                <th className="p-3">Cible</th>
                <th className="p-3">Type</th>
                <th className="p-3">Message</th>
                <th className="p-3">Statut</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {conseils.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-slate-400">Aucun conseil — créez-en un.</td>
                </tr>
              )}
              {conseils.map((c) => (
                <tr key={c.id} className={!c.is_active ? 'opacity-60' : ''}>
                  <td className="p-3 font-medium text-slate-800">{c.label_snapshot || '—'}</td>
                  <td className="p-3 text-slate-500">{TARGET_LABELS[c.target_type] || c.target_type}</td>
                  <td className="p-3 text-slate-600 max-w-xs truncate" title={c.message}>{c.message}</td>
                  <td className="p-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${c.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      {c.is_active ? 'Actif' : 'Inactif'}
                    </span>
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-2 justify-end">
                      <button type="button" title="Modifier" onClick={() => openEdit(c)} className="text-slate-500 hover:text-rose-600 p-1">
                        <Pencil size={16} />
                      </button>
                      <button
                        type="button"
                        title={c.is_active ? 'Désactiver' : 'Activer'}
                        onClick={async () => {
                          try {
                            await setConseilActive(c.id, !c.is_active);
                            await loadConseils();
                          } catch (ex) { setErr(ex.message); }
                        }}
                        className={`p-1 ${c.is_active ? 'text-emerald-600' : 'text-slate-400'} hover:opacity-80`}
                      >
                        <Power size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'historique' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3 items-end bg-white p-4 rounded-xl border text-sm">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Statut</label>
              <select
                value={filters.status}
                onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                className="border rounded-lg px-2 py-1.5"
              >
                <option value="">Tous</option>
                <option value="accepte">Accepté</option>
                <option value="refuse">Refusé</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Utilisateur</label>
              <select
                value={filters.userId}
                onChange={(e) => setFilters({ ...filters, userId: e.target.value })}
                className="border rounded-lg px-2 py-1.5 min-w-[160px]"
              >
                <option value="">Tous</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>{p.display_name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Du</label>
              <input type="date" value={filters.since} onChange={(e) => setFilters({ ...filters, since: e.target.value })} className="border rounded-lg px-2 py-1.5" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Au</label>
              <input type="date" value={filters.until} onChange={(e) => setFilters({ ...filters, until: e.target.value })} className="border rounded-lg px-2 py-1.5" />
            </div>
            <button type="button" onClick={() => loadEvents().catch((e) => setErr(e.message))} className="px-3 py-1.5 rounded-lg bg-slate-800 text-white text-xs font-medium">
              Filtrer
            </button>
          </div>

          <div className="bg-white rounded-xl border overflow-hidden">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 border-b">
                <tr>
                  <th className="p-3">Date</th>
                  <th className="p-3">Conseil</th>
                  <th className="p-3">Utilisateur</th>
                  <th className="p-3">Statut</th>
                  <th className="p-3">Source</th>
                  <th className="p-3">Texte matché</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {events.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-slate-400">Aucun événement.</td>
                  </tr>
                )}
                {events.map((ev) => (
                  <tr key={ev.id}>
                    <td className="p-3 whitespace-nowrap">{new Date(ev.created_at).toLocaleString('fr-FR')}</td>
                    <td className="p-3">{ev.conseils?.label_snapshot || ev.conseil_id?.slice(0, 8)}</td>
                    <td className="p-3">{profileName(ev.user_id)}</td>
                    <td className="p-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${ev.status === 'accepte' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                        {ev.status === 'accepte' ? 'Accepté' : 'Refusé'}
                      </span>
                    </td>
                    <td className="p-3 text-slate-500">{ev.source || '—'}</td>
                    <td className="p-3 text-slate-500 max-w-[180px] truncate" title={ev.matched_text || ''}>{ev.matched_text || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
