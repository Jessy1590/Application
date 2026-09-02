import React, { useState, useEffect } from 'react';
import { Users, Clock } from 'lucide-react';
import { useAuth } from '../core/AuthContext';
import {
  DAY_LABELS, fetchTeamProfiles, fetchWorkSchedules, upsertWorkSchedule, deleteWorkSchedule,
  fetchAbsences, createAbsence, deleteAbsence, fetchPresenceForDay, fetchMonthlyHoursRecap,
  fetchScheduleChanges, createScheduleChange, deleteScheduleChange,
} from '../services/hrService';

export default function HrManager({ onNavigate }) {
  const { user } = useAuth();
  const [tab, setTab] = useState('planning');
  const [profiles, setProfiles] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [absences, setAbsences] = useState([]);
  const [presence, setPresence] = useState({});
  const [recap, setRecap] = useState([]);
  const today = new Date().toISOString().split('T')[0];
  const [presenceDate, setPresenceDate] = useState(today);
  const now = new Date();
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  const [schedForm, setSchedForm] = useState({ user_id: '', day_of_week: 1, start_time: '09:00', end_time: '19:00', label: '' });
  const [absForm, setAbsForm] = useState({ user_id: '', absence_type: 'conge', date_debut: today, date_fin: today, motif: '' });
  const [scheduleChanges, setScheduleChanges] = useState([]);
  const [chgForm, setChgForm] = useState({
    user_id: '', motif: 'Retard / arrivée', date_debut: today,
    heure_prevue: '09:30', heure_arrivee: '', commentaire: '',
  });
  const [msg, setMsg] = useState('');

  const load = async () => {
    setProfiles(await fetchTeamProfiles());
    setSchedules(await fetchWorkSchedules());
    setAbsences(await fetchAbsences());
    setScheduleChanges(await fetchScheduleChanges());
  };
  useEffect(() => { load().catch((e) => alert(e.message)); }, []);
  useEffect(() => {
    fetchPresenceForDay(presenceDate).then(setPresence).catch(console.error);
  }, [presenceDate]);
  useEffect(() => {
    const [y, m] = month.split('-').map(Number);
    fetchMonthlyHoursRecap(y, m).then(setRecap).catch(console.error);
  }, [month]);

  const nameOf = (id) => profiles.find((p) => p.id === id)?.display_name || id?.slice(0, 8) || 'Pharmacie';

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold flex items-center gap-2"><Users className="text-indigo-600" /> RH — Planning équipe</h1>
      {msg && <p className="mb-3 text-sm text-emerald-700 bg-emerald-50 p-2 rounded">{msg}</p>}

      <div className="flex gap-2 mb-6 flex-wrap">
        {[
          { id: 'planning', label: 'Planning' },
          { id: 'absences', label: 'Absences' },
          { id: 'horaires', label: 'Changements d\'horaire' },
          { id: 'presence', label: 'Présence du jour' },
          { id: 'recap', label: 'Récap heures' },
        ].map((t) => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)} className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === t.id ? 'bg-indigo-600 text-white' : 'bg-white border'}`}>{t.label}</button>
        ))}
      </div>

      {tab === 'planning' && (
        <div className="grid md:grid-cols-2 gap-6">
          <form onSubmit={async (e) => {
            e.preventDefault();
            await upsertWorkSchedule({
              user_id: schedForm.user_id || null,
              day_of_week: Number(schedForm.day_of_week),
              start_time: schedForm.start_time,
              end_time: schedForm.end_time,
              label: schedForm.label || null,
              actif: true,
            });
            setMsg('Créneau enregistré'); load();
          }} className="bg-white p-4 rounded-xl border space-y-3 text-sm">
            <p className="text-xs text-slate-500">Laisser « Pharmacie » = horaires d&apos;ouverture globaux de l&apos;officine.</p>
            <div>
              <label className="block text-xs font-semibold mb-1">Collaborateur (ou pharmacie)</label>
              <select value={schedForm.user_id} onChange={(e) => setSchedForm({ ...schedForm, user_id: e.target.value })} className="w-full p-2 border rounded-lg">
                <option value="">Pharmacie (ouverture)</option>
                {profiles.map((p) => <option key={p.id} value={p.id}>{p.display_name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Jour de la semaine</label>
              <select value={schedForm.day_of_week} onChange={(e) => setSchedForm({ ...schedForm, day_of_week: e.target.value })} className="w-full p-2 border rounded-lg">
                {DAY_LABELS.map((l, i) => <option key={l} value={i}>{l}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-semibold mb-1">Heure de début</label>
                <input type="time" value={schedForm.start_time} onChange={(e) => setSchedForm({ ...schedForm, start_time: e.target.value })} className="w-full p-2 border rounded-lg" />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Heure de fin</label>
                <input type="time" value={schedForm.end_time} onChange={(e) => setSchedForm({ ...schedForm, end_time: e.target.value })} className="w-full p-2 border rounded-lg" />
              </div>
            </div>
            <button type="submit" className="w-full bg-indigo-600 text-white py-2 rounded-lg font-semibold">Ajouter le créneau</button>
          </form>
          <div className="bg-white rounded-xl border divide-y text-sm max-h-96 overflow-y-auto">
            {schedules.map((s) => (
              <div key={s.id} className="p-3 flex justify-between items-center">
                <span>{nameOf(s.user_id)} — {DAY_LABELS[s.day_of_week]} {String(s.start_time).slice(0, 5)}–{String(s.end_time).slice(0, 5)}</span>
                <button type="button" onClick={async () => { await deleteWorkSchedule(s.id); load(); }} className="text-xs text-red-600">Suppr.</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'absences' && (
        <div className="grid md:grid-cols-2 gap-6">
          <form onSubmit={async (e) => {
            e.preventDefault();
            await createAbsence(user.id, absForm);
            setMsg('Absence enregistrée'); load();
          }} className="bg-white p-4 rounded-xl border space-y-3 text-sm">
            <div>
              <label className="block text-xs font-semibold mb-1">Collaborateur *</label>
              <select required value={absForm.user_id} onChange={(e) => setAbsForm({ ...absForm, user_id: e.target.value })} className="w-full p-2 border rounded-lg">
                <option value="">Choisir…</option>
                {profiles.map((p) => <option key={p.id} value={p.id}>{p.display_name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Type d&apos;absence</label>
              <select value={absForm.absence_type} onChange={(e) => setAbsForm({ ...absForm, absence_type: e.target.value })} className="w-full p-2 border rounded-lg">
                <option value="conge">Congé</option>
                <option value="absence">Absence</option>
                <option value="maladie">Maladie</option>
                <option value="rtt">RTT</option>
                <option value="formation">Formation</option>
                <option value="autre">Autre</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-semibold mb-1">Date de début</label>
                <input type="date" value={absForm.date_debut} onChange={(e) => setAbsForm({ ...absForm, date_debut: e.target.value })} className="w-full p-2 border rounded-lg" />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Date de fin</label>
                <input type="date" value={absForm.date_fin} onChange={(e) => setAbsForm({ ...absForm, date_fin: e.target.value })} className="w-full p-2 border rounded-lg" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Motif</label>
              <input value={absForm.motif} onChange={(e) => setAbsForm({ ...absForm, motif: e.target.value })} className="w-full p-2 border rounded-lg" placeholder="Optionnel" />
            </div>
            <button type="submit" className="w-full bg-indigo-600 text-white py-2 rounded-lg font-semibold">Enregistrer l&apos;absence</button>
          </form>
          <div className="bg-white rounded-xl border divide-y text-sm max-h-96 overflow-y-auto">
            {absences.map((a) => (
              <div key={a.id} className="p-3 flex justify-between">
                <span>{nameOf(a.user_id)} — {a.absence_type} ({a.date_debut} → {a.date_fin})</span>
                <button type="button" onClick={async () => { await deleteAbsence(a.id); load(); }} className="text-xs text-red-600">Suppr.</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'horaires' && (
        <div className="grid md:grid-cols-2 gap-6">
          <form onSubmit={async (e) => {
            e.preventDefault();
            if (!chgForm.heure_arrivee) { alert('Indiquez l\'heure d\'arrivée réelle.'); return; }
            await createScheduleChange(user.id, chgForm);
            setMsg('Arrivée enregistrée'); load();
            setChgForm({ user_id: '', motif: 'Retard / arrivée', date_debut: today, heure_prevue: '09:30', heure_arrivee: '', commentaire: '' });
          }} className="bg-white p-4 rounded-xl border space-y-3 text-sm">
            <h2 className="font-semibold">Enregistrer une arrivée (ex. retard)</h2>
            <p className="text-xs text-slate-500">
              Cas simple : Romain devait commencer à 9h30, il arrive à 9h50 → on enregistre la personne, la date et l&apos;heure d&apos;arrivée réelle.
              L&apos;heure prévue est optionnelle (contexte). La présence du jour reste aussi visible via la taskbar (onglet Présence).
            </p>
            <div>
              <label className="block text-xs font-semibold mb-1">Collaborateur *</label>
              <select required value={chgForm.user_id} onChange={(e) => setChgForm({ ...chgForm, user_id: e.target.value })} className="w-full p-2 border rounded-lg">
                <option value="">Choisir…</option>
                {profiles.map((p) => <option key={p.id} value={p.id}>{p.display_name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Date *</label>
              <input type="date" required value={chgForm.date_debut} onChange={(e) => setChgForm({ ...chgForm, date_debut: e.target.value })} className="w-full p-2 border rounded-lg" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-semibold mb-1">Heure prévue (optionnel)</label>
                <input type="time" value={chgForm.heure_prevue} onChange={(e) => setChgForm({ ...chgForm, heure_prevue: e.target.value })} className="w-full p-2 border rounded-lg" />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Heure d&apos;arrivée réelle *</label>
                <input type="time" required value={chgForm.heure_arrivee} onChange={(e) => setChgForm({ ...chgForm, heure_arrivee: e.target.value })} className="w-full p-2 border rounded-lg" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Type</label>
              <select value={chgForm.motif} onChange={(e) => setChgForm({ ...chgForm, motif: e.target.value })} className="w-full p-2 border rounded-lg">
                <option>Retard / arrivée</option>
                <option>Départ anticipé</option>
                <option>Congés</option>
                <option>Absence</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Commentaire</label>
              <textarea rows={2} value={chgForm.commentaire} onChange={(e) => setChgForm({ ...chgForm, commentaire: e.target.value })} className="w-full p-2 border rounded-lg" placeholder="Optionnel" />
            </div>
            <button type="submit" className="w-full bg-indigo-600 text-white py-2 rounded-lg font-semibold">Enregistrer l&apos;arrivée</button>
          </form>
          <div className="bg-white rounded-xl border divide-y text-sm max-h-96 overflow-y-auto">
            {scheduleChanges.map((c) => (
              <div key={c.id} className="p-3 flex justify-between gap-2">
                <div>
                  <p className="font-medium">{nameOf(c.user_id)} — {c.motif}</p>
                  <p className="text-xs text-slate-500">
                    {c.date_debut}
                    {c.heure_arrivee ? ` · arrivée ${String(c.heure_arrivee).slice(0, 5)}` : ''}
                    {c.heure_prevue ? ` (prévu ${String(c.heure_prevue).slice(0, 5)})` : (c.heure_debut ? ` (prévu ${String(c.heure_debut).slice(0, 5)})` : '')}
                  </p>
                </div>
                <button type="button" onClick={async () => { await deleteScheduleChange(c.id); load(); }} className="text-xs text-red-600 shrink-0">Suppr.</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'presence' && (
        <div>
          <input type="date" value={presenceDate} onChange={(e) => setPresenceDate(e.target.value)} className="mb-4 p-2 border rounded-lg text-sm" />
          <div className="bg-white rounded-xl border overflow-hidden">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 border-b"><tr>
                <th className="p-3">Collaborateur</th><th className="p-3">Présent</th><th className="p-3">1re activité</th><th className="p-3">Dernière</th>
              </tr></thead>
              <tbody className="divide-y">
                {profiles.map((p) => {
                  const info = presence[p.id];
                  return (
                    <tr key={p.id}>
                      <td className="p-3">{p.display_name}</td>
                      <td className="p-3">{info ? 'Oui' : 'Non'}</td>
                      <td className="p-3">{info ? new Date(info.first).toLocaleTimeString('fr-FR') : '—'}</td>
                      <td className="p-3">{info ? new Date(info.last).toLocaleTimeString('fr-FR') : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-500 mt-2 flex items-center gap-1"><Clock size={12} /> Basé sur taskbar_logs (login / expand / collapse).</p>
        </div>
      )}

      {tab === 'recap' && (
        <div>
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="mb-4 p-2 border rounded-lg text-sm" />
          <div className="bg-white rounded-xl border overflow-hidden">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 border-b"><tr>
                <th className="p-3">Collaborateur</th><th className="p-3">Heures théoriques</th><th className="p-3">Jours pointés</th><th className="p-3">Jours absence</th>
              </tr></thead>
              <tbody className="divide-y">
                {recap.map((r) => (
                  <tr key={r.user_id}>
                    <td className="p-3">{r.display_name}</td>
                    <td className="p-3">{r.theo_hours} h</td>
                    <td className="p-3">{r.present_days}</td>
                    <td className="p-3">{r.absence_days}</td>
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
