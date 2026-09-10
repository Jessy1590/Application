import React, { useState, useEffect, useCallback } from 'react';
import { Users, Clock, CalendarOff, ListChecks, CheckCircle2, CalendarClock } from 'lucide-react';
import { useAuth } from '../../../core/AuthContext.jsx';
import { closeModuleWindow } from '../../../shared/windowService.js';
import {
  DAY_LABELS,
  ABSENCE_TYPE_LABELS,
  labelAbsenceType,
  labelAbsenceStatut,
  labelChangeType,
  fetchWorkSchedules,
  fetchAbsences,
  createAbsence,
  createScheduleChange,
  fetchScheduleChanges,
  plannedStartForDay,
  effectiveSchedulesForUser,
  weekMeta,
} from '../services/hrService.js';

const TABS = [
  { id: 'planning', label: 'Mon planning', icon: Users },
  { id: 'retard', label: 'Déclarer un retard', icon: Clock },
  { id: 'horaire', label: 'Changer d\'horaire', icon: CalendarClock },
  { id: 'absence', label: 'Demander une absence', icon: CalendarOff },
  { id: 'demandes', label: 'Mes demandes', icon: ListChecks },
];

export default function Hr() {
  const { user } = useAuth();
  const today = new Date().toISOString().split('T')[0];
  const [tab, setTab] = useState('planning');
  const [schedules, setSchedules] = useState([]);
  const [absences, setAbsences] = useState([]);
  const [changes, setChanges] = useState([]);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  const [retardForm, setRetardForm] = useState({
    date_debut: today,
    heure_prevue: '',
    heure_arrivee: '',
    commentaire: '',
  });
  const [horaireForm, setHoraireForm] = useState({
    date_debut: today,
    heure_debut: '',
    heure_fin: '',
    commentaire: '',
  });
  const [absForm, setAbsForm] = useState({
    absence_type: 'conge',
    date_debut: today,
    date_fin: today,
    motif: '',
  });

  const load = useCallback(async () => {
    if (!user?.id) return;
    const [s, a, c] = await Promise.all([
      fetchWorkSchedules(),
      fetchAbsences({ userId: user.id }),
      fetchScheduleChanges({ userId: user.id }),
    ]);
    setSchedules(s);
    setAbsences(a);
    setChanges(c);
  }, [user?.id]);

  useEffect(() => {
    load().catch((e) => setErr(e.message));
  }, [load]);

  useEffect(() => {
    if (!user?.id || !schedules.length) return;
    const planned = plannedStartForDay(schedules, user.id, retardForm.date_debut);
    setRetardForm((prev) => (prev.heure_prevue ? prev : { ...prev, heure_prevue: planned || '' }));
  }, [user?.id, schedules, retardForm.date_debut]);

  const meta = weekMeta(today);
  const weekDays = [1, 2, 3, 4, 5, 6, 0];

  const afterSuccess = (text) => {
    setMsg(text);
    setErr('');
    setTimeout(() => closeModuleWindow(), 800);
  };

  return (
    <div className="w-full h-full flex flex-col bg-slate-50 text-slate-800">
      <div className="bg-white border-b px-4 py-3">
        <h1 className="text-lg font-bold flex items-center gap-2">
          <Users className="text-indigo-600" size={20} /> RH — Mon espace
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          Semaine ISO {meta.weekNumber} ({meta.parityLabel})
        </p>
        <div className="flex gap-1 mt-3 flex-wrap">
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 ${
                  tab === t.id ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'
                }`}
              >
                <Icon size={14} /> {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {msg && (
          <div className="mb-3 p-3 bg-emerald-50 text-emerald-700 rounded-lg text-sm flex gap-2 items-center">
            <CheckCircle2 size={16} /> {msg}
          </div>
        )}
        {err && <div className="mb-3 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{err}</div>}

        {tab === 'planning' && (
          <div className="space-y-3">
            <p className="text-sm text-slate-500">
              Créneaux de la semaine en cours (A/B et exceptions pris en compte).
            </p>
            {weekDays.map((dow) => {
              const offset = dow === 0 ? 6 : dow - 1;
              const d = new Date(`${meta.monday}T12:00:00`);
              d.setDate(d.getDate() + offset);
              const dateStr = d.toISOString().slice(0, 10);
              const slots = effectiveSchedulesForUser(schedules, user?.id, { dateStr });
              return (
                <div key={dow} className="bg-white border rounded-lg p-3 text-sm flex justify-between gap-2">
                  <span className="font-semibold w-12">{DAY_LABELS[dow]}</span>
                  <div className="flex-1 text-right text-slate-600">
                    {slots.length === 0
                      ? '—'
                      : slots.map((s) => (
                        <span key={s.id} className="ml-2">
                          {String(s.start_time).slice(0, 5)}–{String(s.end_time).slice(0, 5)}
                          {s.label ? ` (${s.label})` : ''}
                        </span>
                      ))}
                  </div>
                </div>
              );
            })}
            <div className="mt-4">
              <h3 className="font-semibold text-sm mb-2">Mes absences récentes</h3>
              {absences.length === 0 ? (
                <p className="text-sm text-slate-500">Aucune absence.</p>
              ) : absences.slice(0, 5).map((a) => (
                <div key={a.id} className="bg-white border rounded-lg p-2 text-sm mb-1 flex justify-between">
                  <span>{labelAbsenceType(a.absence_type)} · {a.date_debut} → {a.date_fin}</span>
                  <span className="text-xs text-slate-500">{labelAbsenceStatut(a.statut)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'retard' && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!user?.id) return;
              if (!retardForm.heure_arrivee) {
                setErr('Indiquez l\'heure d\'arrivée.');
                return;
              }
              setLoading(true);
              setErr('');
              try {
                await createScheduleChange(user.id, {
                  user_id: user.id,
                  change_type: 'retard',
                  date_debut: retardForm.date_debut,
                  heure_prevue: retardForm.heure_prevue || null,
                  heure_arrivee: retardForm.heure_arrivee,
                  commentaire: retardForm.commentaire || null,
                }, { mode: 'equipe' });
                afterSuccess('Retard déclaré.');
              } catch (e2) {
                setErr(e2.message);
              } finally {
                setLoading(false);
              }
            }}
            className="bg-white border rounded-xl p-4 space-y-3 text-sm max-w-md"
          >
            <h2 className="font-semibold">Déclarer un retard</h2>
            <div>
              <label className="block text-xs font-semibold mb-1">Date *</label>
              <input
                type="date"
                required
                value={retardForm.date_debut}
                onChange={(e) => setRetardForm({ ...retardForm, date_debut: e.target.value, heure_prevue: '' })}
                className="w-full p-2 border rounded-lg"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-semibold mb-1">Heure prévue</label>
                <input
                  type="time"
                  value={retardForm.heure_prevue}
                  onChange={(e) => setRetardForm({ ...retardForm, heure_prevue: e.target.value })}
                  className="w-full p-2 border rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Heure d&apos;arrivée *</label>
                <input
                  type="time"
                  required
                  value={retardForm.heure_arrivee}
                  onChange={(e) => setRetardForm({ ...retardForm, heure_arrivee: e.target.value })}
                  className="w-full p-2 border rounded-lg"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Commentaire</label>
              <textarea
                rows={2}
                value={retardForm.commentaire}
                onChange={(e) => setRetardForm({ ...retardForm, commentaire: e.target.value })}
                className="w-full p-2 border rounded-lg"
                placeholder="Optionnel"
              />
            </div>
            <button type="submit" disabled={loading} className="w-full bg-indigo-600 text-white py-2.5 rounded-lg font-semibold">
              {loading ? '…' : 'Envoyer'}
            </button>
          </form>
        )}

        {tab === 'horaire' && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!user?.id) return;
              if (!horaireForm.heure_debut || !horaireForm.heure_fin) {
                setErr('Indiquez les horaires proposés.');
                return;
              }
              setLoading(true);
              setErr('');
              try {
                await createScheduleChange(user.id, {
                  user_id: user.id,
                  change_type: 'changement_horaire',
                  date_debut: horaireForm.date_debut,
                  heure_debut: horaireForm.heure_debut,
                  heure_prevue: horaireForm.heure_debut,
                  heure_fin: horaireForm.heure_fin,
                  commentaire: horaireForm.commentaire || null,
                }, { mode: 'equipe' });
                afterSuccess('Demande envoyée (en attente d\'accord).');
              } catch (e2) {
                setErr(e2.message);
              } finally {
                setLoading(false);
              }
            }}
            className="bg-white border rounded-xl p-4 space-y-3 text-sm max-w-md"
          >
            <h2 className="font-semibold">Demander un changement d&apos;horaire</h2>
            <p className="text-xs text-slate-500">Un administrateur devra donner son accord.</p>
            <div>
              <label className="block text-xs font-semibold mb-1">Date *</label>
              <input
                type="date"
                required
                value={horaireForm.date_debut}
                onChange={(e) => setHoraireForm({ ...horaireForm, date_debut: e.target.value })}
                className="w-full p-2 border rounded-lg"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-semibold mb-1">Début proposé *</label>
                <input
                  type="time"
                  required
                  value={horaireForm.heure_debut}
                  onChange={(e) => setHoraireForm({ ...horaireForm, heure_debut: e.target.value })}
                  className="w-full p-2 border rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Fin proposée *</label>
                <input
                  type="time"
                  required
                  value={horaireForm.heure_fin}
                  onChange={(e) => setHoraireForm({ ...horaireForm, heure_fin: e.target.value })}
                  className="w-full p-2 border rounded-lg"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Motif</label>
              <textarea
                rows={2}
                value={horaireForm.commentaire}
                onChange={(e) => setHoraireForm({ ...horaireForm, commentaire: e.target.value })}
                className="w-full p-2 border rounded-lg"
                placeholder="Optionnel"
              />
            </div>
            <button type="submit" disabled={loading} className="w-full bg-indigo-600 text-white py-2.5 rounded-lg font-semibold">
              {loading ? '…' : 'Demander l\'accord'}
            </button>
          </form>
        )}

        {tab === 'absence' && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!user?.id) return;
              setLoading(true);
              setErr('');
              try {
                await createAbsence(user.id, {
                  user_id: user.id,
                  absence_type: absForm.absence_type,
                  date_debut: absForm.date_debut,
                  date_fin: absForm.date_fin,
                  motif: absForm.motif || null,
                }, { mode: 'equipe' });
                afterSuccess('Demande envoyée (en attente de validation).');
              } catch (e2) {
                setErr(e2.message);
              } finally {
                setLoading(false);
              }
            }}
            className="bg-white border rounded-xl p-4 space-y-3 text-sm max-w-md"
          >
            <h2 className="font-semibold">Demander une absence / anticiper un congé</h2>
            <p className="text-xs text-slate-500">La demande sera validée par un administrateur ; vous recevrez une tâche de réponse.</p>
            <div>
              <label className="block text-xs font-semibold mb-1">Type *</label>
              <select
                value={absForm.absence_type}
                onChange={(e) => setAbsForm({ ...absForm, absence_type: e.target.value })}
                className="w-full p-2 border rounded-lg"
              >
                {Object.entries(ABSENCE_TYPE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-semibold mb-1">Début *</label>
                <input
                  type="date"
                  required
                  value={absForm.date_debut}
                  onChange={(e) => setAbsForm({ ...absForm, date_debut: e.target.value })}
                  className="w-full p-2 border rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Fin *</label>
                <input
                  type="date"
                  required
                  value={absForm.date_fin}
                  onChange={(e) => setAbsForm({ ...absForm, date_fin: e.target.value })}
                  className="w-full p-2 border rounded-lg"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Motif</label>
              <input
                value={absForm.motif}
                onChange={(e) => setAbsForm({ ...absForm, motif: e.target.value })}
                className="w-full p-2 border rounded-lg"
                placeholder="Optionnel"
              />
            </div>
            <button type="submit" disabled={loading} className="w-full bg-indigo-600 text-white py-2.5 rounded-lg font-semibold">
              {loading ? '…' : 'Envoyer la demande'}
            </button>
          </form>
        )}

        {tab === 'demandes' && (
          <div className="space-y-4">
            <section>
              <h3 className="font-semibold text-sm mb-2">Absences</h3>
              {absences.length === 0 ? (
                <p className="text-sm text-slate-500">Aucune demande.</p>
              ) : absences.map((a) => (
                <div key={a.id} className="bg-white border rounded-lg p-3 text-sm mb-2">
                  <div className="flex justify-between gap-2">
                    <span className="font-medium">{labelAbsenceType(a.absence_type)}</span>
                    <span className={`text-xs ${a.statut === 'en_attente' ? 'text-amber-600' : a.statut === 'validee' ? 'text-emerald-600' : 'text-red-600'}`}>
                      {labelAbsenceStatut(a.statut)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">{a.date_debut} → {a.date_fin}</p>
                  {a.motif && <p className="text-xs text-slate-400 mt-0.5">{a.motif}</p>}
                  {a.review_note && <p className="text-xs text-slate-500 mt-1 italic">Note admin : {a.review_note}</p>}
                </div>
              ))}
            </section>
            <section>
              <h3 className="font-semibold text-sm mb-2">Retards &amp; horaires</h3>
              {changes.length === 0 ? (
                <p className="text-sm text-slate-500">Aucune demande.</p>
              ) : changes.map((c) => (
                <div key={c.id} className="bg-white border rounded-lg p-3 text-sm mb-2">
                  <div className="flex justify-between gap-2">
                    <p className="font-medium">{labelChangeType(c.change_type)} — {c.date_debut}</p>
                    {c.statut && (
                      <span className={`text-xs ${c.statut === 'en_attente' ? 'text-amber-600' : c.statut === 'validee' ? 'text-emerald-600' : 'text-red-600'}`}>
                        {labelAbsenceStatut(c.statut)}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500">
                    {c.heure_prevue || c.heure_debut ? `Début ${String(c.heure_debut || c.heure_prevue).slice(0, 5)}` : ''}
                    {c.heure_fin ? ` → ${String(c.heure_fin).slice(0, 5)}` : ''}
                    {c.heure_arrivee ? ` · Arrivée ${String(c.heure_arrivee).slice(0, 5)}` : ''}
                  </p>
                  {c.review_note && <p className="text-xs text-slate-500 mt-1 italic">Note : {c.review_note}</p>}
                </div>
              ))}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
