import React, { useState, useEffect, useCallback } from 'react';
import { Users, Clock, ArrowLeft, Check, X, Printer } from 'lucide-react';
import { useAuth } from '../../../core/AuthContext.jsx';
import {
  DAY_LABELS,
  ABSENCE_TYPE_LABELS,
  CHANGE_TYPE_LABELS,
  JOB_TITLE_LABELS,
  labelAbsenceType,
  labelAbsenceStatut,
  labelChangeType,
  labelJobTitle,
  fetchTeamProfiles,
  fetchWorkSchedules,
  fetchAbsences,
  createAbsence,
  reviewAbsence,
  deleteAbsence,
  fetchPresenceForDay,
  fetchMonthlyHoursRecap,
  fetchMonthDailyPresence,
  fetchScheduleChanges,
  createScheduleChange,
  reviewScheduleChange,
  deleteScheduleChange,
  fetchMinStaff,
  DEFAULT_MIN_STAFF,
  fetchSpecialWeeks,
} from '../services/hrService.js';
import HrPlanningCalendar from './HrPlanningCalendar.jsx';

const emptyAbs = { user_id: '', absence_type: 'conge', date_debut: '', date_fin: '', motif: '' };
const emptyChg = {
  user_id: '', change_type: 'retard', date_debut: '', heure_prevue: '', heure_arrivee: '',
  heure_debut: '', heure_fin: '', commentaire: '',
};

export default function HrManager({ onNavigate }) {
  const { user } = useAuth();
  const today = new Date().toISOString().split('T')[0];
  const now = new Date();
  const [tab, setTab] = useState('semaine');
  const [profiles, setProfiles] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [absences, setAbsences] = useState([]);
  const [presence, setPresence] = useState([]);
  const [recap, setRecap] = useState([]);
  const [scheduleChanges, setScheduleChanges] = useState([]);
  const [specialWeeks, setSpecialWeeks] = useState([]);
  const [minStaff, setMinStaff] = useState({ ...DEFAULT_MIN_STAFF });
  const [presenceDate, setPresenceDate] = useState(today);
  const [weekDate, setWeekDate] = useState(today);
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  const [absForm, setAbsForm] = useState({ ...emptyAbs, date_debut: today, date_fin: today });
  const [chgForm, setChgForm] = useState({ ...emptyChg, date_debut: today, heure_prevue: '09:30' });
  const [reviewNote, setReviewNote] = useState({});
  const [presenceJobFilter, setPresenceJobFilter] = useState('all');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    const [p, s, a, c, min, sw] = await Promise.all([
      fetchTeamProfiles(),
      fetchWorkSchedules(),
      fetchAbsences(),
      fetchScheduleChanges(),
      fetchMinStaff(),
      fetchSpecialWeeks(),
    ]);
    setProfiles(p);
    setSchedules(s);
    setAbsences(a);
    setScheduleChanges(c);
    setMinStaff(min);
    setSpecialWeeks(sw);
  }, []);

  useEffect(() => {
    load().catch((e) => setErr(e.message));
  }, [load]);

  useEffect(() => {
    fetchPresenceForDay(presenceDate, { schedules, profiles })
      .then(setPresence)
      .catch((e) => console.error(e));
  }, [presenceDate, schedules, profiles]);

  useEffect(() => {
    const [y, m] = month.split('-').map(Number);
    fetchMonthlyHoursRecap(y, m).then(setRecap).catch((e) => console.error(e));
  }, [month]);

  const nameOf = (id) => profiles.find((p) => p.id === id)?.display_name || id?.slice(0, 8) || 'Pharmacie';
  const pendingAbs = absences.filter((a) => a.statut === 'en_attente');
  const otherAbs = absences.filter((a) => a.statut !== 'en_attente');
  const pendingHoraire = scheduleChanges.filter(
    (c) => c.change_type === 'changement_horaire' && c.statut === 'en_attente',
  );
  const otherChanges = scheduleChanges.filter(
    (c) => !(c.change_type === 'changement_horaire' && c.statut === 'en_attente'),
  );

  const flash = (text) => {
    setMsg(text);
    setErr('');
    setTimeout(() => setMsg(''), 3000);
  };

  const tabs = [
    { id: 'semaine', label: 'Semaine' },
    { id: 'modifier', label: 'Modifier planning' },
    { id: 'absences', label: 'Absences' },
    { id: 'horaires', label: 'Horaires / retards' },
    { id: 'presence', label: 'Présence & paie' },
  ];

  const printPayroll = async () => {
    const [y, m] = month.split('-').map(Number);
    try {
      const [people, daily] = await Promise.all([
        fetchMonthlyHoursRecap(y, m),
        fetchMonthDailyPresence(y, m),
      ]);
      const monthLabel = new Date(y, m - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
      const edited = new Date().toLocaleString('fr-FR');

      const summaryRows = people.map((p) => `
        <tr>
          <td>${p.display_name}</td>
          <td>${labelJobTitle(p.job_title)}</td>
          <td style="text-align:right">${p.theo_days}</td>
          <td style="text-align:right">${p.theo_hours} h</td>
          <td style="text-align:right">${p.present_days}</td>
          <td style="text-align:right">${p.absence_days}</td>
          <td style="text-align:right">${p.retards_count}</td>
        </tr>`).join('');

      const detailPeople = people.map((p) => {
        const abs = (p.absences || []).length
          ? p.absences.map((a) => `<li>${labelAbsenceType(a.type)} ${a.debut} → ${a.fin} (${labelAbsenceStatut(a.statut)})${a.motif ? ` — ${a.motif}` : ''}</li>`).join('')
          : '<li>Aucune</li>';
        const chg = (p.changes || []).length
          ? p.changes.map((c) => `<li>${labelChangeType(c.type)} ${c.date}${c.prevue ? ` prévu ${c.prevue}` : ''}${c.arrivee ? ` / réel ${c.arrivee}` : ''}${c.commentaire ? ` — ${c.commentaire}` : ''}</li>`).join('')
          : '<li>Aucun</li>';
        return `<div class="person">
          <h3>${p.display_name} <span class="muted">(${labelJobTitle(p.job_title)})</span></h3>
          <p><strong>Absences / congés</strong></p><ul>${abs}</ul>
          <p><strong>Retards &amp; changements d'horaire</strong></p><ul>${chg}</ul>
        </div>`;
      }).join('');

      const dailyHtml = daily.map((d) => {
        if (!d.rows.length) return '';
        const rows = d.rows.map((r) => `
          <tr>
            <td>${r.display_name}</td>
            <td>${labelJobTitle(r.job_title)}</td>
            <td>${r.planned || '—'}</td>
            <td>${r.absence ? 'Absence' : (r.present ? 'Présent' : 'Absent')}</td>
            <td>${r.arrival ? new Date(r.arrival).toLocaleTimeString('fr-FR') : '—'}</td>
            <td>${r.last ? new Date(r.last).toLocaleTimeString('fr-FR') : '—'}</td>
          </tr>`).join('');
        return `<h4>${DAY_LABELS[d.dow]} ${d.date}</h4>
          <table><thead><tr><th>Nom</th><th>Métier</th><th>Planning</th><th>Statut</th><th>1re activité</th><th>Dernière</th></tr></thead>
          <tbody>${rows}</tbody></table>`;
      }).join('');

      const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"/>
        <title>Paie — ${monthLabel}</title>
        <style>
          body{font-family:system-ui,sans-serif;color:#0f172a;padding:24px;font-size:12px}
          h1{font-size:20px;margin:0 0 4px} h2{font-size:15px;margin:24px 0 8px;border-bottom:1px solid #cbd5e1;padding-bottom:4px}
          h3{font-size:13px;margin:16px 0 6px} h4{font-size:12px;margin:14px 0 4px;color:#334155}
          .meta{color:#64748b;margin-bottom:16px}
          table{width:100%;border-collapse:collapse;margin-bottom:12px}
          th,td{border:1px solid #cbd5e1;padding:6px 8px;text-align:left}
          th{background:#f1f5f9}
          .muted{color:#64748b;font-weight:400}
          ul{margin:4px 0 8px 18px;padding:0}
          .person{page-break-inside:avoid;margin-bottom:12px}
          @media print{body{padding:0} .noprint{display:none}}
        </style></head><body>
        <h1>Récapitulatif RH — ${monthLabel}</h1>
        <p class="meta">Document comptabilité / fiches de paie · Édité le ${edited} · PharmaOS<br/>
        Données indicatives (taskbar + planning) — à croiser avec le système de paie.</p>

        <h2>1. Synthèse mensuelle par collaborateur</h2>
        <table>
          <thead><tr>
            <th>Collaborateur</th><th>Métier</th><th>Jours théo.</th><th>Heures théo.</th>
            <th>Jours présents</th><th>Jours absences</th><th>Retards</th>
          </tr></thead>
          <tbody>${summaryRows}</tbody>
        </table>

        <h2>2. Détail absences &amp; retards (par personne)</h2>
        ${detailPeople}

        <h2>3. Présence jour par jour</h2>
        ${dailyHtml || '<p>Aucune donnée journalière.</p>'}

        <script>window.onload=function(){window.print();}</script>
        </body></html>`;

      const w = window.open('', '_blank', 'noopener,noreferrer,width=1100,height=800');
      if (!w) {
        setErr('Autorisez les pop-ups pour imprimer.');
        return;
      }
      w.document.write(html);
      w.document.close();
    } catch (e) {
      setErr(e.message);
    }
  };

  const calendarProps = {
    userId: user?.id,
    profiles,
    schedules,
    specialWeeks,
    weekDate,
    onWeekDateChange: setWeekDate,
    onReload: load,
    onFlash: flash,
    onError: setErr,
    minStaff,
    onMinStaffChange: setMinStaff,
  };

  return (
    <div className="space-y-6">
      {onNavigate && (
        <button
          type="button"
          onClick={() => onNavigate('dashboard')}
          className="flex items-center gap-2 text-slate-500 hover:text-indigo-600 text-sm font-medium"
        >
          <ArrowLeft size={16} /> Retour
        </button>
      )}
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <Users className="text-indigo-600" /> RH — Planning équipe
      </h1>
      {msg && <p className="text-sm text-emerald-700 bg-emerald-50 p-2 rounded">{msg}</p>}
      {err && <p className="text-sm text-red-700 bg-red-50 p-2 rounded">{err}</p>}

      <div className="flex gap-2 flex-wrap">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === t.id ? 'bg-indigo-600 text-white' : 'bg-white border'}`}
          >
            {t.label}
            {t.id === 'absences' && pendingAbs.length > 0 && (
              <span className="ml-2 text-[10px] bg-amber-500 text-white px-1.5 py-0.5 rounded-full">{pendingAbs.length}</span>
            )}
            {t.id === 'horaires' && pendingHoraire.length > 0 && (
              <span className="ml-2 text-[10px] bg-amber-500 text-white px-1.5 py-0.5 rounded-full">{pendingHoraire.length}</span>
            )}
          </button>
        ))}
      </div>

      {tab === 'semaine' && (
        <div className="space-y-2">
          <p className="text-sm text-slate-600">
            Vue figée de la semaine : ouverture en fond, une ligne par collaborateur, filtres par métier.
          </p>
          <HrPlanningCalendar mode="view" {...calendarProps} />
        </div>
      )}

      {tab === 'modifier' && (
        <div className="space-y-2">
          <p className="text-sm text-slate-600">
            Modifications : glisser pour créer, cliquer pour éditer, semaines spéciales. Roue crantée = seuils d&apos;effectif + métiers de l&apos;équipe.
          </p>
          <HrPlanningCalendar mode="edit" {...calendarProps} />
        </div>
      )}

      {tab === 'absences' && (
        <div className="space-y-6">
          <section>
            <h2 className="font-semibold mb-3 text-amber-800">Demandes en attente ({pendingAbs.length})</h2>
            {pendingAbs.length === 0 ? (
              <p className="text-sm text-slate-500">Aucune demande à valider.</p>
            ) : (
              <div className="bg-white rounded-xl border divide-y text-sm">
                {pendingAbs.map((a) => (
                  <div key={a.id} className="p-3 flex flex-col md:flex-row md:items-center gap-3 justify-between">
                    <div>
                      <p className="font-medium">{nameOf(a.user_id)} — {labelAbsenceType(a.absence_type)}</p>
                      <p className="text-xs text-slate-500">{a.date_debut} → {a.date_fin}{a.motif ? ` · ${a.motif}` : ''}</p>
                      <input
                        className="mt-2 w-full max-w-sm p-1.5 border rounded text-xs"
                        placeholder="Note de revue (envoyée au salarié)"
                        value={reviewNote[a.id] || ''}
                        onChange={(e) => setReviewNote({ ...reviewNote, [a.id]: e.target.value })}
                      />
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await reviewAbsence(a.id, user.id, { statut: 'validee', review_note: reviewNote[a.id] });
                            flash('Absence validée — salarié notifié');
                            await load();
                          } catch (e2) { setErr(e2.message); }
                        }}
                        className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-semibold flex items-center gap-1"
                      >
                        <Check size={14} /> Valider
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await reviewAbsence(a.id, user.id, { statut: 'refusee', review_note: reviewNote[a.id] });
                            flash('Absence refusée — salarié notifié');
                            await load();
                          } catch (e2) { setErr(e2.message); }
                        }}
                        className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-semibold flex items-center gap-1"
                      >
                        <X size={14} /> Refuser
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <div className="grid md:grid-cols-2 gap-6">
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  await createAbsence(user.id, absForm, { mode: 'admin' });
                  flash('Absence enregistrée (validée)');
                  setAbsForm({ ...emptyAbs, date_debut: today, date_fin: today });
                  await load();
                } catch (e2) { setErr(e2.message); }
              }}
              className="bg-white p-4 rounded-xl border space-y-3 text-sm"
            >
              <h2 className="font-semibold">Saisie admin (validée directement)</h2>
              <div>
                <label className="block text-xs font-semibold mb-1">Collaborateur *</label>
                <select required value={absForm.user_id} onChange={(e) => setAbsForm({ ...absForm, user_id: e.target.value })} className="w-full p-2 border rounded-lg">
                  <option value="">Choisir…</option>
                  {profiles.map((p) => <option key={p.id} value={p.id}>{p.display_name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Type</label>
                <select value={absForm.absence_type} onChange={(e) => setAbsForm({ ...absForm, absence_type: e.target.value })} className="w-full p-2 border rounded-lg">
                  {Object.entries(ABSENCE_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold mb-1">Début</label>
                  <input type="date" required value={absForm.date_debut} onChange={(e) => setAbsForm({ ...absForm, date_debut: e.target.value })} className="w-full p-2 border rounded-lg" />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Fin</label>
                  <input type="date" required value={absForm.date_fin} onChange={(e) => setAbsForm({ ...absForm, date_fin: e.target.value })} className="w-full p-2 border rounded-lg" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Motif</label>
                <input value={absForm.motif} onChange={(e) => setAbsForm({ ...absForm, motif: e.target.value })} className="w-full p-2 border rounded-lg" placeholder="Optionnel" />
              </div>
              <button type="submit" className="w-full bg-indigo-600 text-white py-2 rounded-lg font-semibold">Enregistrer</button>
            </form>

            <div className="bg-white rounded-xl border divide-y text-sm max-h-96 overflow-y-auto">
              {otherAbs.length === 0 ? (
                <p className="p-4 text-slate-500">Aucune absence validée / refusée.</p>
              ) : otherAbs.map((a) => (
                <div key={a.id} className="p-3 flex justify-between gap-2">
                  <div>
                    <p className="font-medium">{nameOf(a.user_id)} — {labelAbsenceType(a.absence_type)}</p>
                    <p className="text-xs text-slate-500">
                      {a.date_debut} → {a.date_fin} · {labelAbsenceStatut(a.statut)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!window.confirm('Supprimer cette absence ?')) return;
                      try {
                        await deleteAbsence(a.id);
                        await load();
                      } catch (e2) { setErr(e2.message); }
                    }}
                    className="text-xs text-red-600 shrink-0"
                  >
                    Suppr.
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'horaires' && (
        <div className="space-y-6">
          <section>
            <h2 className="font-semibold mb-3 text-amber-800">Demandes de changement d&apos;horaire ({pendingHoraire.length})</h2>
            {pendingHoraire.length === 0 ? (
              <p className="text-sm text-slate-500">Aucune demande en attente.</p>
            ) : (
              <div className="bg-white rounded-xl border divide-y text-sm">
                {pendingHoraire.map((c) => (
                  <div key={c.id} className="p-3 flex flex-col md:flex-row md:items-center gap-3 justify-between">
                    <div>
                      <p className="font-medium">{nameOf(c.user_id)} — {c.date_debut}</p>
                      <p className="text-xs text-slate-500">
                        {c.heure_debut || c.heure_prevue ? `${String(c.heure_debut || c.heure_prevue).slice(0, 5)}` : '?'}
                        {c.heure_fin ? ` → ${String(c.heure_fin).slice(0, 5)}` : ''}
                        {c.commentaire ? ` · ${c.commentaire}` : ''}
                      </p>
                      <input
                        className="mt-2 w-full max-w-sm p-1.5 border rounded text-xs"
                        placeholder="Note de revue"
                        value={reviewNote[`h-${c.id}`] || ''}
                        onChange={(e) => setReviewNote({ ...reviewNote, [`h-${c.id}`]: e.target.value })}
                      />
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await reviewScheduleChange(c.id, user.id, { statut: 'validee', review_note: reviewNote[`h-${c.id}`] });
                            flash('Horaire accepté — salarié notifié');
                            await load();
                          } catch (e2) { setErr(e2.message); }
                        }}
                        className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-semibold flex items-center gap-1"
                      >
                        <Check size={14} /> Accepter
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await reviewScheduleChange(c.id, user.id, { statut: 'refusee', review_note: reviewNote[`h-${c.id}`] });
                            flash('Horaire refusé — salarié notifié');
                            await load();
                          } catch (e2) { setErr(e2.message); }
                        }}
                        className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-semibold flex items-center gap-1"
                      >
                        <X size={14} /> Refuser
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <div className="grid md:grid-cols-2 gap-6">
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!chgForm.heure_arrivee && chgForm.change_type === 'retard') {
                  setErr('Indiquez l\'heure d\'arrivée réelle.');
                  return;
                }
                try {
                  await createScheduleChange(user.id, chgForm, { mode: 'admin' });
                  flash('Enregistrement effectué');
                  setChgForm({ ...emptyChg, date_debut: today, heure_prevue: '09:30' });
                  await load();
                } catch (e2) { setErr(e2.message); }
              }}
              className="bg-white p-4 rounded-xl border space-y-3 text-sm"
            >
              <h2 className="font-semibold">Enregistrer (admin)</h2>
              <div>
                <label className="block text-xs font-semibold mb-1">Collaborateur *</label>
                <select required value={chgForm.user_id} onChange={(e) => setChgForm({ ...chgForm, user_id: e.target.value })} className="w-full p-2 border rounded-lg">
                  <option value="">Choisir…</option>
                  {profiles.map((p) => <option key={p.id} value={p.id}>{p.display_name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Type</label>
                <select value={chgForm.change_type} onChange={(e) => setChgForm({ ...chgForm, change_type: e.target.value })} className="w-full p-2 border rounded-lg">
                  {Object.entries(CHANGE_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Date *</label>
                <input type="date" required value={chgForm.date_debut} onChange={(e) => setChgForm({ ...chgForm, date_debut: e.target.value })} className="w-full p-2 border rounded-lg" />
              </div>
              {chgForm.change_type === 'changement_horaire' ? (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-semibold mb-1">Début proposé</label>
                    <input type="time" value={chgForm.heure_debut} onChange={(e) => setChgForm({ ...chgForm, heure_debut: e.target.value, heure_prevue: e.target.value })} className="w-full p-2 border rounded-lg" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1">Fin proposée</label>
                    <input type="time" value={chgForm.heure_fin} onChange={(e) => setChgForm({ ...chgForm, heure_fin: e.target.value })} className="w-full p-2 border rounded-lg" />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-semibold mb-1">Heure prévue</label>
                    <input type="time" value={chgForm.heure_prevue} onChange={(e) => setChgForm({ ...chgForm, heure_prevue: e.target.value })} className="w-full p-2 border rounded-lg" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1">Heure réelle</label>
                    <input type="time" value={chgForm.heure_arrivee} onChange={(e) => setChgForm({ ...chgForm, heure_arrivee: e.target.value })} className="w-full p-2 border rounded-lg" />
                  </div>
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold mb-1">Commentaire</label>
                <textarea rows={2} value={chgForm.commentaire} onChange={(e) => setChgForm({ ...chgForm, commentaire: e.target.value })} className="w-full p-2 border rounded-lg" placeholder="Optionnel" />
              </div>
              <button type="submit" className="w-full bg-indigo-600 text-white py-2 rounded-lg font-semibold">Enregistrer</button>
            </form>

            <div className="bg-white rounded-xl border divide-y text-sm max-h-96 overflow-y-auto">
              {otherChanges.length === 0 ? (
                <p className="p-4 text-slate-500">Aucun historique.</p>
              ) : otherChanges.map((c) => (
                <div key={c.id} className="p-3 flex justify-between gap-2">
                  <div>
                    <p className="font-medium">{nameOf(c.user_id)} — {labelChangeType(c.change_type)}</p>
                    <p className="text-xs text-slate-500">
                      {c.date_debut}
                      {c.statut ? ` · ${labelAbsenceStatut(c.statut)}` : ''}
                      {c.heure_arrivee ? ` · réel ${String(c.heure_arrivee).slice(0, 5)}` : ''}
                      {(c.heure_debut || c.heure_prevue) ? ` · ${String(c.heure_debut || c.heure_prevue).slice(0, 5)}` : ''}
                      {c.heure_fin ? `–${String(c.heure_fin).slice(0, 5)}` : ''}
                    </p>
                    {c.commentaire && <p className="text-xs text-slate-400 mt-0.5">{c.commentaire}</p>}
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await deleteScheduleChange(c.id);
                        await load();
                      } catch (e2) { setErr(e2.message); }
                    }}
                    className="text-xs text-red-600 shrink-0"
                  >
                    Suppr.
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'presence' && (
        <div className="space-y-8">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={printPayroll}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-900 text-white rounded-lg text-xs font-semibold hover:bg-slate-800"
            >
              <Printer size={14} /> Imprimer (comptabilité / paie)
            </button>
            <span className="text-xs text-slate-500">
              Export du mois sélectionné : synthèse, absences, retards, présence jour par jour.
            </span>
          </div>

          <section className="space-y-3">
            <h2 className="font-semibold text-slate-800">Présence du jour</h2>
            <div className="flex flex-wrap gap-2 items-center">
              <input type="date" value={presenceDate} onChange={(e) => setPresenceDate(e.target.value)} className="p-2 border rounded-lg text-sm" />
              <select
                value={presenceJobFilter}
                onChange={(e) => setPresenceJobFilter(e.target.value)}
                className="p-2 border rounded-lg text-sm"
              >
                <option value="all">Tous les métiers</option>
                {Object.entries(JOB_TITLE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div className="bg-white rounded-xl border overflow-hidden">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 border-b">
                  <tr>
                    <th className="p-3">Collaborateur</th>
                    <th className="p-3">Métier</th>
                    <th className="p-3">Théorique</th>
                    <th className="p-3">Présent</th>
                    <th className="p-3">1re activité</th>
                    <th className="p-3">Dernière</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {(() => {
                    const rows = presence.filter((r) => presenceJobFilter === 'all' || r.job_title === presenceJobFilter);
                    if (!rows.length) {
                      return <tr><td colSpan={6} className="p-6 text-center text-slate-500">Aucun collaborateur.</td></tr>;
                    }
                    return rows.map((row) => (
                      <tr key={row.user_id} className={!row.present && row.theo_slots?.length ? 'bg-rose-50/40' : ''}>
                        <td className="p-3">{row.display_name}</td>
                        <td className="p-3 text-xs text-slate-600">{labelJobTitle(row.job_title)}</td>
                        <td className="p-3 text-xs text-slate-600">
                          {row.theo_slots?.length
                            ? row.theo_slots.map((s) => `${s.start}–${s.end}`).join(', ')
                            : '—'}
                        </td>
                        <td className="p-3">{row.present ? 'Oui' : 'Non'}</td>
                        <td className="p-3">{row.arrival ? new Date(row.arrival).toLocaleTimeString('fr-FR') : '—'}</td>
                        <td className="p-3">{row.last ? new Date(row.last).toLocaleTimeString('fr-FR') : '—'}</td>
                      </tr>
                    ));
                  })()}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-slate-500 flex items-center gap-1">
              <Clock size={12} /> Arrivée = 1re action login/expand taskbar. Surbrillance = prévu mais absent.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-semibold text-slate-800">Récapitulatif du mois</h2>
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="p-2 border rounded-lg text-sm" />
            <div className="bg-white rounded-xl border overflow-hidden">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 border-b">
                  <tr>
                    <th className="p-3">Collaborateur</th>
                    <th className="p-3">Métier</th>
                    <th className="p-3">Jours théoriques</th>
                    <th className="p-3">Heures théoriques</th>
                    <th className="p-3">Jours présents</th>
                    <th className="p-3">Jours absences</th>
                    <th className="p-3">Retards</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {recap.length === 0 ? (
                    <tr><td colSpan={7} className="p-6 text-center text-slate-500">Aucune donnée.</td></tr>
                  ) : recap.map((r) => (
                    <tr key={r.user_id}>
                      <td className="p-3">{r.display_name}</td>
                      <td className="p-3 text-xs text-slate-600">{labelJobTitle(r.job_title)}</td>
                      <td className="p-3">{r.theo_days}</td>
                      <td className="p-3">{r.theo_hours} h</td>
                      <td className="p-3">{r.present_days}</td>
                      <td className="p-3">{r.absence_days}</td>
                      <td className="p-3">{r.retards_count ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-slate-500">
              Indicatif (taskbar + planning) — l&apos;impression paie reprend absences, retards et détail journalier du mois choisi.
            </p>
          </section>
        </div>
      )}
    </div>
  );
}
