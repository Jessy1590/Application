import React, { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Plus, Trash2, Printer, Settings } from 'lucide-react';
import {
  DAY_LABELS,
  WEEK_PATTERN_LABELS,
  JOB_TITLE_LABELS,
  labelJobTitle,
  weekMeta,
  mondayOfISOWeek,
  sundayOfISOWeek,
  specialWeeksForMonday,
  mondaysInDateRange,
  effectiveSchedulesForDate,
  createScheduleSlots,
  upsertWorkSchedule,
  deactivateWorkSchedule,
  createSpecialWeek,
  deleteSpecialWeek,
  saveMinStaff,
  normalizeMinStaff,
  isStaffingShortage,
  staffingShortageDetails,
  DEFAULT_MIN_STAFF,
  updateProfileJobTitle,
  colorForUser,
  PLANNING_HOUR_START,
  PLANNING_HOUR_END,
  PLANNING_SLOT_MIN,
  minutesToTime,
  timeToMinutes,
  snapMinutes,
} from '../services/hrService.js';

const DAYS = [1, 2, 3, 4, 5, 6, 0];
const CELL_H = 96;

function shiftWeek(dateStr, deltaWeeks) {
  const d = new Date(`${mondayOfISOWeek(dateStr)}T12:00:00`);
  d.setDate(d.getDate() + deltaWeeks * 7);
  return d.toISOString().slice(0, 10);
}

function dateForDow(monday, dow) {
  const d = new Date(`${monday}T12:00:00`);
  d.setDate(d.getDate() + (dow === 0 ? 6 : dow - 1));
  return d.toISOString().slice(0, 10);
}

function yToMinutes(clientY, top) {
  const rel = clientY - top;
  const span = (PLANNING_HOUR_END - PLANNING_HOUR_START) * 60;
  const fromStart = PLANNING_HOUR_START * 60 + (rel / CELL_H) * span;
  return snapMinutes(Math.min(PLANNING_HOUR_END * 60, Math.max(PLANNING_HOUR_START * 60, fromStart)));
}

function blockStyle(startTime, endTime) {
  const span = (PLANNING_HOUR_END - PLANNING_HOUR_START) * 60;
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  const top = ((start - PLANNING_HOUR_START * 60) / span) * 100;
  const height = Math.max(8, ((end - start) / span) * 100);
  return { top: `${top}%`, height: `${height}%` };
}

function eachDateInMonth(year, month) {
  const last = new Date(year, month, 0).getDate();
  const dates = [];
  for (let d = 1; d <= last; d += 1) {
    dates.push(`${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  }
  return dates;
}

function printMonthPlanning({ year, month, profiles, schedules, minStaff }) {
  const dates = eachDateInMonth(year, month);
  const monthLabel = new Date(year, month - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  const thresholds = normalizeMinStaff(minStaff);

  const dayBlocks = dates.map((dateStr) => {
    const dow = new Date(`${dateStr}T12:00:00`).getDay();
    const pharmacy = effectiveSchedulesForDate(schedules, null, dateStr);
    const counts = { preparateur: 0, pharmacien: 0, autre: 0 };
    const people = (profiles || []).map((p) => {
      const slots = effectiveSchedulesForDate(schedules, p.id, dateStr, { fallbackPharmacy: false });
      if (slots.length) {
        const job = p.job_title || 'autre';
        counts[job] = (counts[job] || 0) + 1;
      }
      return { name: p.display_name, job: labelJobTitle(p.job_title), slots };
    }).filter((p) => p.slots.length);
    const total = people.length;
    const open = pharmacy.length > 0 || total > 0;
    const shortage = open && isStaffingShortage(counts, thresholds);
    const byJob = staffingShortageDetails(counts, thresholds);
    return { dateStr, dow, pharmacy, people, total, open, shortage, counts, byJob };
  });

  const rowsHtml = dayBlocks.map((d) => {
    const pharm = d.pharmacy.map((s) => `${String(s.start_time).slice(0, 5)}–${String(s.end_time).slice(0, 5)}`).join(', ') || '—';
    const people = d.people.length
      ? d.people.map((p) => {
        const hours = p.slots.map((s) => `${String(s.start_time).slice(0, 5)}–${String(s.end_time).slice(0, 5)}`).join(', ');
        return `<div><strong>${p.name}</strong> <span style="color:#64748b">(${p.job})</span> — ${hours}</div>`;
      }).join('')
      : '<em>Personne</em>';
    const bg = d.shortage ? 'background:#fee2e2;' : '';
    const eff = `P${d.counts.preparateur}${d.byJob.preparateur ? '!' : ''} · Ph${d.counts.pharmacien}${d.byJob.pharmacien ? '!' : ''} · A${d.counts.autre}${d.byJob.autre ? '!' : ''}`;
    return `<tr style="${bg}">
      <td style="padding:8px;border:1px solid #cbd5e1;vertical-align:top;white-space:nowrap">
        ${DAY_LABELS[d.dow]} ${d.dateStr}
        ${d.shortage ? '<br/><span style="color:#b91c1c;font-weight:700">Sous-effectif</span>' : ''}
      </td>
      <td style="padding:8px;border:1px solid #cbd5e1;vertical-align:top">${pharm}</td>
      <td style="padding:8px;border:1px solid #cbd5e1;vertical-align:top">${people}</td>
      <td style="padding:8px;border:1px solid #cbd5e1;text-align:center;font-weight:700">${d.open ? eff : '—'}</td>
    </tr>`;
  }).join('');

  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"/>
    <title>Planning ${monthLabel}</title>
    <style>
      body { font-family: system-ui, sans-serif; color: #0f172a; padding: 24px; }
      h1 { font-size: 20px; margin: 0 0 4px; }
      .meta { color: #64748b; font-size: 12px; margin-bottom: 16px; }
      table { width: 100%; border-collapse: collapse; font-size: 12px; }
      th { background: #f1f5f9; text-align: left; padding: 8px; border: 1px solid #cbd5e1; }
      @media print { body { padding: 0; } }
    </style></head><body>
    <h1>Planning mensuel — ${monthLabel}</h1>
    <p class="meta">Seuils minimums : P≥${thresholds.preparateur} · Ph≥${thresholds.pharmacien} · A≥${thresholds.autre} (0 = ignoré) · PharmaOS</p>
    <table>
      <thead><tr>
        <th>Jour</th><th>Ouverture</th><th>Équipe</th><th>Effectif</th>
      </tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>
    <script>window.onload=function(){window.print();}</script>
    </body></html>`;

  const w = window.open('', '_blank', 'noopener,noreferrer,width=1000,height=800');
  if (!w) return false;
  w.document.write(html);
  w.document.close();
  return true;
}

export default function HrPlanningCalendar({
  mode = 'view',
  userId,
  profiles,
  schedules,
  specialWeeks,
  weekDate,
  onWeekDateChange,
  onReload,
  onFlash,
  onError,
  minStaff = DEFAULT_MIN_STAFF,
  onMinStaffChange,
}) {
  const readOnly = mode === 'view';
  const meta = weekMeta(weekDate);
  const monday = meta.monday;
  const sunday = sundayOfISOWeek(monday);
  const covering = specialWeeksForMonday(specialWeeks, monday);

  const [jobFilters, setJobFilters] = useState(['preparateur', 'pharmacien', 'autre']);
  const [personFilter, setPersonFilter] = useState('all');
  const [drag, setDrag] = useState(null);
  const [modal, setModal] = useState(null);
  const [saving, setSaving] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [minDraft, setMinDraft] = useState(() => normalizeMinStaff(minStaff));
  const [swForm, setSwForm] = useState({
    label: '',
    week_start: monday,
    week_end: sunday,
    note: '',
  });
  const cellRefs = useRef({});

  useEffect(() => {
    setMinDraft(normalizeMinStaff(minStaff));
  }, [minStaff]);

  /** Seuils live dans les réglages, sinon valeur enregistrée */
  const effectiveMin = normalizeMinStaff(!readOnly && settingsOpen ? minDraft : minStaff);

  const visiblePeople = useMemo(() => {
    let list = (profiles || []).filter((p) => jobFilters.includes(p.job_title || 'autre'));
    if (personFilter !== 'all') list = list.filter((p) => p.id === personFilter);
    return list;
  }, [profiles, jobFilters, personFilter]);

  const rows = useMemo(() => [
    { key: 'pharmacy', user_id: null, label: 'Ouverture pharmacie', job_title: null, isPharmacy: true },
    ...visiblePeople.map((p) => ({
      key: p.id,
      user_id: p.id,
      label: p.display_name,
      job_title: p.job_title || 'autre',
      isPharmacy: false,
    })),
  ], [visiblePeople]);

  const slotsFor = useCallback((userIdRow, dow) => {
    const dateStr = dateForDow(monday, dow);
    if (userIdRow == null) {
      return effectiveSchedulesForDate(schedules, null, dateStr);
    }
    return effectiveSchedulesForDate(schedules, userIdRow, dateStr, { fallbackPharmacy: false });
  }, [monday, schedules]);

  const staffingByDay = useMemo(() => {
    const byDay = {};
    DAYS.forEach((dow) => {
      const dateStr = dateForDow(monday, dow);
      const counts = { preparateur: 0, pharmacien: 0, autre: 0, total: 0, open: false, shortage: false };
      const pharmacy = effectiveSchedulesForDate(schedules, null, dateStr);
      (profiles || []).forEach((p) => {
        const slots = effectiveSchedulesForDate(schedules, p.id, dateStr, { fallbackPharmacy: false });
        if (slots.length) {
          const job = p.job_title || 'autre';
          counts[job] = (counts[job] || 0) + 1;
          counts.total += 1;
        }
      });
      counts.open = pharmacy.length > 0 || counts.total > 0;
      counts.byJob = staffingShortageDetails(counts, effectiveMin);
      counts.shortage = counts.open && isStaffingShortage(counts, effectiveMin);
      byDay[dow] = counts;
    });
    return byDay;
  }, [monday, schedules, profiles, effectiveMin]);

  const toggleJob = (job) => {
    setJobFilters((prev) => {
      if (prev.includes(job)) {
        const next = prev.filter((j) => j !== job);
        return next.length ? next : prev;
      }
      return [...prev, job];
    });
  };

  const handlePrintMonth = () => {
    const y = Number(monday.slice(0, 4));
    const m = Number(monday.slice(5, 7));
    const ok = printMonthPlanning({ year: y, month: m, profiles, schedules, minStaff });
    if (!ok) onError?.('Autorisez les pop-ups pour imprimer.');
  };

  const saveSettings = async () => {
    try {
      const n = await saveMinStaff(minDraft);
      onMinStaffChange?.(n);
      onFlash?.(`Seuils min. : P≥${n.preparateur} · Ph≥${n.pharmacien} · A≥${n.autre}`);
      setSettingsOpen(false);
    } catch (e) {
      onError?.(e.message);
    }
  };

  const openCreateModal = (userIdRow, dow, startMin, endMin) => {
    let a = Math.min(startMin, endMin);
    let b = Math.max(startMin, endMin);
    if (b - a < PLANNING_SLOT_MIN) b = a + 60;
    setModal({
      mode: 'create',
      id: null,
      user_id: userIdRow || '',
      days: [dow],
      start_time: minutesToTime(a),
      end_time: minutesToTime(b),
      label: '',
      week_pattern: 'all',
      scope: covering.length ? 'special' : 'recurring',
      special_week_id: covering[0]?.id || '',
    });
  };

  const openEditModal = (slot) => {
    if (readOnly) return;
    setModal({
      mode: 'edit',
      id: slot.id,
      user_id: slot.user_id || '',
      days: [slot.day_of_week],
      start_time: String(slot.start_time).slice(0, 5),
      end_time: String(slot.end_time).slice(0, 5),
      label: slot.label || '',
      week_pattern: slot.week_pattern || 'all',
      scope: slot.exception_week_start || slot.special_week_id ? 'special' : 'recurring',
      special_week_id: slot.special_week_id || '',
      exception_week_start: slot.exception_week_start || '',
    });
  };

  const onPointerDown = (rowKey, userIdRow, dow, e) => {
    if (readOnly || e.button !== 0) return;
    if (e.target.closest('[data-slot]')) return;
    const el = cellRefs.current[`${rowKey}-${dow}`];
    if (!el) return;
    const top = el.getBoundingClientRect().top;
    const startMin = yToMinutes(e.clientY, top);
    setDrag({ rowKey, userIdRow, dow, startMin, endMin: startMin + 60, top });
    e.preventDefault();
  };

  const onPointerMove = (e) => {
    if (!drag) return;
    setDrag((d) => (d ? { ...d, endMin: yToMinutes(e.clientY, d.top) } : null));
  };

  const onPointerUp = () => {
    if (!drag) return;
    const { userIdRow, dow, startMin, endMin } = drag;
    setDrag(null);
    openCreateModal(userIdRow, dow, startMin, endMin);
  };

  const toggleDay = (dow) => {
    setModal((m) => {
      if (!m || m.mode === 'edit') return m;
      const has = m.days.includes(dow);
      const days = has ? m.days.filter((d) => d !== dow) : [...m.days, dow];
      return { ...m, days: days.length ? days : [dow] };
    });
  };

  const saveModal = async () => {
    if (!modal) return;
    if (timeToMinutes(modal.end_time) <= timeToMinutes(modal.start_time)) {
      onError('La fin doit être après le début.');
      return;
    }
    setSaving(true);
    try {
      if (modal.mode === 'edit') {
        let exceptionMonday = null;
        let specialId = null;
        if (modal.scope === 'special') {
          const sw = specialWeeks.find((s) => s.id === modal.special_week_id);
          if (sw) {
            exceptionMonday = mondayOfISOWeek(sw.week_start);
            specialId = sw.id;
          } else if (modal.exception_week_start) {
            exceptionMonday = mondayOfISOWeek(modal.exception_week_start);
          } else {
            exceptionMonday = monday;
          }
        }
        await upsertWorkSchedule({
          user_id: modal.user_id || null,
          day_of_week: modal.days[0],
          start_time: modal.start_time,
          end_time: modal.end_time,
          label: modal.label || null,
          week_pattern: modal.scope === 'special' ? 'all' : modal.week_pattern,
          exception_week_start: exceptionMonday,
          special_week_id: specialId,
        }, modal.id);
        onFlash('Créneau modifié');
      } else {
        let exceptionMondays = [];
        let specialId = null;
        if (modal.scope === 'special') {
          const sw = specialWeeks.find((s) => s.id === modal.special_week_id);
          if (sw) {
            exceptionMondays = mondaysInDateRange(sw.week_start, sw.week_end);
            specialId = sw.id;
          } else {
            exceptionMondays = [monday];
          }
        }
        await createScheduleSlots({
          user_id: modal.user_id || null,
          daysOfWeek: modal.days,
          start_time: modal.start_time,
          end_time: modal.end_time,
          label: modal.label || null,
          week_pattern: modal.scope === 'special' ? 'all' : modal.week_pattern,
          exceptionMondays,
          special_week_id: specialId,
        });
        onFlash('Créneau(x) enregistré(s)');
      }
      setModal(null);
      await onReload();
    } catch (e) {
      onError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const removeSlot = async () => {
    if (!modal?.id) return;
    setSaving(true);
    try {
      await deactivateWorkSchedule(modal.id);
      onFlash('Créneau désactivé');
      setModal(null);
      await onReload();
    } catch (e) {
      onError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const addSpecialWeek = async (e) => {
    e.preventDefault();
    if (!swForm.label.trim()) {
      onError('Nommez la semaine spéciale.');
      return;
    }
    try {
      const row = await createSpecialWeek(userId, swForm);
      onFlash(`Semaine « ${row.label} » créée`);
      setSwForm({ label: '', week_start: monday, week_end: sunday, note: '' });
      await onReload();
    } catch (err) {
      onError(err.message);
    }
  };

  return (
    <div
      className="space-y-4"
      onMouseMove={onPointerMove}
      onMouseUp={onPointerUp}
      onMouseLeave={() => drag && setDrag(null)}
    >
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => onWeekDateChange(shiftWeek(weekDate, -1))} className="p-2 border rounded-lg hover:bg-slate-50">
            <ChevronLeft size={18} />
          </button>
          <button type="button" onClick={() => onWeekDateChange(new Date().toISOString().slice(0, 10))} className="px-3 py-2 border rounded-lg text-xs font-semibold hover:bg-slate-50">
            Aujourd&apos;hui
          </button>
          <button type="button" onClick={() => onWeekDateChange(shiftWeek(weekDate, 1))} className="p-2 border rounded-lg hover:bg-slate-50">
            <ChevronRight size={18} />
          </button>
        </div>
        <input type="date" value={weekDate} onChange={(e) => onWeekDateChange(e.target.value)} className="p-2 border rounded-lg text-sm" />
        <div className="text-sm">
          <span className="font-semibold">{monday} → {sunday}</span>
          <span className="text-slate-500 ml-2">ISO {meta.weekNumber} · {meta.parityLabel}</span>
        </div>
        {covering.length > 0 ? (
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-100 text-amber-900 border border-amber-200">
            Spéciale : {covering.map((c) => c.label).join(', ')}
          </span>
        ) : (
          <span className="text-xs px-2.5 py-1 rounded-full bg-slate-100 text-slate-600">Récurrent</span>
        )}
        {readOnly && (
          <span className="text-xs px-2 py-1 rounded bg-sky-50 text-sky-800 border border-sky-100">Lecture seule</span>
        )}

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={handlePrintMonth}
            className="inline-flex items-center gap-1.5 px-3 py-2 border rounded-lg text-xs font-semibold hover:bg-slate-50"
            title="Imprimer le mois complet"
          >
            <Printer size={14} /> Imprimer le mois
          </button>
          {!readOnly && (
            <button
              type="button"
              onClick={() => setSettingsOpen((v) => !v)}
              className={`p-2 border rounded-lg hover:bg-slate-50 ${settingsOpen ? 'bg-slate-100' : ''}`}
              title="Paramètres : seuils & équipe"
            >
              <Settings size={16} />
            </button>
          )}
        </div>
      </div>

      {!readOnly && settingsOpen && (
        <div className="bg-white border rounded-xl p-4 space-y-5 text-sm shadow-sm">
          <div className="space-y-3">
            <p className="text-xs font-semibold text-slate-700">Seuils d&apos;effectif par métier</p>
            <p className="text-xs text-slate-500">
              Rouge uniquement si le seuil du métier n&apos;est pas atteint (effectif &lt; seuil). 0 = pas de contrôle. Mis à jour en direct.
            </p>
            <div className="flex flex-wrap gap-4 items-end">
              {Object.entries(JOB_TITLE_LABELS).map(([k, v]) => (
                <div key={k}>
                  <label className="block text-xs font-semibold mb-1">{v}</label>
                  <input
                    type="number"
                    min={0}
                    value={minDraft[k] ?? 0}
                    onChange={(e) => setMinDraft({
                      ...normalizeMinStaff(minDraft),
                      [k]: Math.max(0, Number(e.target.value) || 0),
                    })}
                    className="w-20 p-2 border rounded-lg"
                  />
                </div>
              ))}
              <button type="button" onClick={saveSettings} className="px-4 py-2 bg-slate-900 text-white rounded-lg text-xs font-semibold">
                Enregistrer les seuils
              </button>
            </div>
          </div>

          <div className="border-t pt-4 space-y-3">
            <p className="text-xs font-semibold text-slate-700">Équipe — sous-types PharmaOS</p>
            <p className="text-xs text-slate-500">
              Préparateur, pharmacien ou autre personnel — utilisé pour les filtres, la présence et les seuils.
            </p>
            <div className="border rounded-lg overflow-hidden max-h-64 overflow-y-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 border-b sticky top-0">
                  <tr>
                    <th className="p-2.5">Collaborateur</th>
                    <th className="p-2.5">Rôle accès</th>
                    <th className="p-2.5">Métier</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {profiles.map((p) => (
                    <tr key={p.id}>
                      <td className="p-2.5 font-medium">{p.display_name}</td>
                      <td className="p-2.5 text-slate-500 text-xs">{p.role}</td>
                      <td className="p-2.5">
                        <select
                          value={p.job_title || 'autre'}
                          onChange={async (e) => {
                            try {
                              await updateProfileJobTitle(p.id, e.target.value);
                              onFlash?.(`Métier mis à jour : ${labelJobTitle(e.target.value)}`);
                              await onReload?.();
                            } catch (e2) {
                              onError?.(e2.message);
                            }
                          }}
                          className="p-1.5 border rounded-lg text-sm"
                        >
                          {Object.entries(JOB_TITLE_LABELS).map(([k, v]) => (
                            <option key={k} value={k}>{v}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2 items-center text-sm">
        <span className="text-xs font-semibold text-slate-500 uppercase">Filtres</span>
        {Object.entries(JOB_TITLE_LABELS).map(([k, v]) => (
          <button
            key={k}
            type="button"
            onClick={() => toggleJob(k)}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold border ${
              jobFilters.includes(k) ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600'
            }`}
          >
            {v}
          </button>
        ))}
        <select
          value={personFilter}
          onChange={(e) => setPersonFilter(e.target.value)}
          className="ml-auto p-2 border rounded-lg text-sm"
        >
          <option value="all">Toutes les personnes</option>
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.display_name} ({labelJobTitle(p.job_title)})
            </option>
          ))}
        </select>
      </div>

      {!readOnly && (
        <p className="text-xs text-slate-500">
          Glissez pour créer un créneau. P / Ph / A en rouge seulement si le seuil n&apos;est pas atteint (min P{effectiveMin.preparateur} · Ph{effectiveMin.pharmacien} · A{effectiveMin.autre}).
        </p>
      )}

      <div className="bg-white rounded-xl border overflow-x-auto">
        <div className="min-w-[900px]">
          <div
            className="grid border-b bg-slate-50 sticky top-0 z-10"
            style={{ gridTemplateColumns: `160px repeat(7, minmax(100px, 1fr))` }}
          >
            <div className="p-2 text-xs font-semibold text-slate-500">Collaborateur</div>
            {DAYS.map((dow) => {
              const d = dateForDow(monday, dow);
              const isToday = d === new Date().toISOString().slice(0, 10);
              const st = staffingByDay[dow] || {};
              const shortage = !!st.shortage;
              return (
                <div
                  key={dow}
                  className={`p-2 text-center text-sm font-semibold border-l ${
                    shortage
                      ? 'bg-rose-100 text-rose-900 border-rose-200'
                      : isToday
                        ? 'bg-indigo-50 text-indigo-800'
                        : ''
                  }`}
                  title={
                    shortage
                      ? `Sous-effectif — P ${st.preparateur}/${effectiveMin.preparateur} · Ph ${st.pharmacien}/${effectiveMin.pharmacien} · A ${st.autre}/${effectiveMin.autre}`
                      : `OK — P${st.preparateur} · Ph${st.pharmacien} · A${st.autre}`
                  }
                >
                  {DAY_LABELS[dow]}
                  <div className="text-[10px] font-normal opacity-70">{d.slice(5)}</div>
                  <div className="text-[9px] font-semibold mt-0.5 flex justify-center gap-1 flex-wrap">
                    <span className={st.byJob?.preparateur ? 'text-rose-700' : 'text-slate-500'}>P{st.preparateur || 0}</span>
                    <span className="text-slate-400">·</span>
                    <span className={st.byJob?.pharmacien ? 'text-rose-700' : 'text-slate-500'}>Ph{st.pharmacien || 0}</span>
                    <span className="text-slate-400">·</span>
                    <span className={st.byJob?.autre ? 'text-rose-700' : 'text-slate-500'}>A{st.autre || 0}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {rows.map((row) => {
            const color = colorForUser(row.user_id, profiles);
            return (
              <div
                key={row.key}
                className={`grid border-b ${row.isPharmacy ? 'bg-slate-50/80' : 'bg-white'}`}
                style={{ gridTemplateColumns: `160px repeat(7, minmax(100px, 1fr))` }}
              >
                <div className="p-2 text-sm border-r flex flex-col justify-center">
                  <span className={`font-semibold truncate ${row.isPharmacy ? 'text-slate-600' : ''}`}>{row.label}</span>
                  {row.job_title && (
                    <span className="text-[10px] text-slate-500">{labelJobTitle(row.job_title)}</span>
                  )}
                  {row.isPharmacy && (
                    <span className="text-[10px] text-slate-400">Fond d&apos;ouverture</span>
                  )}
                </div>
                {DAYS.map((dow) => {
                  const dateStr = dateForDow(monday, dow);
                  const pharmacySlots = effectiveSchedulesForDate(schedules, null, dateStr);
                  const slots = slotsFor(row.user_id, dow);
                  const cellKey = `${row.key}-${dow}`;
                  const dayShort = staffingByDay[dow]?.shortage;
                  return (
                    <div
                      key={dow}
                      ref={(el) => { cellRefs.current[cellKey] = el; }}
                      className={`relative border-l ${readOnly ? '' : 'cursor-crosshair'} ${dayShort ? 'bg-rose-50/40' : ''}`}
                      style={{ height: CELL_H }}
                      onMouseDown={(e) => onPointerDown(row.key, row.user_id, dow, e)}
                    >
                      {pharmacySlots.map((s) => (
                        <div
                          key={`bg-${s.id}`}
                          className="absolute left-0 right-0 bg-slate-200/70 pointer-events-none"
                          style={blockStyle(s.start_time, s.end_time)}
                        />
                      ))}

                      {slots.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          data-slot
                          disabled={readOnly && !row.isPharmacy}
                          title={`${String(s.start_time).slice(0, 5)}–${String(s.end_time).slice(0, 5)}`}
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            openEditModal(s);
                          }}
                          className={`absolute left-0.5 right-0.5 rounded border px-0.5 overflow-hidden z-[1] text-left ${
                            row.isPharmacy
                              ? 'bg-slate-400/50 border-slate-500 text-slate-800'
                              : `${color.soft} hover:brightness-95`
                          } ${readOnly ? 'cursor-default' : 'cursor-pointer'}`}
                          style={blockStyle(s.start_time, s.end_time)}
                        >
                          <span className="text-[9px] font-bold leading-none block">
                            {String(s.start_time).slice(0, 5)}–{String(s.end_time).slice(0, 5)}
                          </span>
                        </button>
                      ))}

                      {drag && drag.rowKey === row.key && drag.dow === dow && (
                        <div
                          className="absolute left-0.5 right-0.5 rounded bg-indigo-400/40 border border-indigo-500 pointer-events-none z-[2]"
                          style={blockStyle(
                            minutesToTime(Math.min(drag.startMin, drag.endMin)),
                            minutesToTime(Math.max(drag.startMin, drag.endMin)),
                          )}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      <p className="text-xs text-slate-500">
        Bandes grises = ouverture. Rouge seulement si un seuil métier n&apos;est pas atteint.
      </p>

      {!readOnly && (
        <div className="bg-amber-50/60 border border-amber-200 rounded-xl p-4 space-y-3">
          <h3 className="font-semibold text-sm text-amber-950 flex items-center gap-2">
            <Plus size={16} /> Semaines spéciales
          </h3>
          <form onSubmit={addSpecialWeek} className="grid sm:grid-cols-4 gap-2 text-sm items-end">
            <div>
              <label className="block text-xs font-semibold mb-1">Nom *</label>
              <input value={swForm.label} onChange={(e) => setSwForm({ ...swForm, label: e.target.value })} className="w-full p-2 border rounded-lg bg-white" placeholder="Noël 2026" />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Du</label>
              <input type="date" required value={swForm.week_start} onChange={(e) => setSwForm({ ...swForm, week_start: e.target.value })} className="w-full p-2 border rounded-lg bg-white" />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Au</label>
              <input type="date" required value={swForm.week_end} onChange={(e) => setSwForm({ ...swForm, week_end: e.target.value })} className="w-full p-2 border rounded-lg bg-white" />
            </div>
            <button type="submit" className="bg-amber-700 text-white py-2 rounded-lg font-semibold text-sm">Enregistrer</button>
          </form>
          {specialWeeks.length > 0 && (
            <ul className="divide-y border rounded-lg bg-white text-sm">
              {specialWeeks.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2 px-3 py-2">
                  <button type="button" className="text-left flex-1 hover:text-indigo-700" onClick={() => onWeekDateChange(s.week_start)}>
                    <span className="font-medium">{s.label}</span>
                    <span className="text-xs text-slate-500 ml-2">{s.week_start} → {s.week_end}</span>
                  </button>
                  <button
                    type="button"
                    className="text-red-600 p-1"
                    onClick={async () => {
                      if (!window.confirm(`Supprimer « ${s.label} » ?`)) return;
                      try {
                        await deleteSpecialWeek(s.id);
                        onFlash('Supprimée');
                        await onReload();
                      } catch (err) {
                        onError(err.message);
                      }
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {modal && !readOnly && (
        <div className="fixed inset-0 bg-slate-900/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-5 space-y-3 text-sm">
            <h3 className="font-bold text-lg">{modal.mode === 'edit' ? 'Modifier le créneau' : 'Nouveau créneau'}</h3>
            <div>
              <label className="block text-xs font-semibold mb-1">Collaborateur</label>
              <select value={modal.user_id} onChange={(e) => setModal({ ...modal, user_id: e.target.value })} className="w-full p-2 border rounded-lg">
                <option value="">Ouverture pharmacie</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>{p.display_name} — {labelJobTitle(p.job_title)}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-semibold mb-1">Début</label>
                <input type="time" value={modal.start_time} onChange={(e) => setModal({ ...modal, start_time: e.target.value })} className="w-full p-2 border rounded-lg" />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Fin</label>
                <input type="time" value={modal.end_time} onChange={(e) => setModal({ ...modal, end_time: e.target.value })} className="w-full p-2 border rounded-lg" />
              </div>
            </div>
            {modal.mode === 'create' && (
              <div>
                <label className="block text-xs font-semibold mb-1">Jours</label>
                <div className="flex flex-wrap gap-1">
                  {DAYS.map((dow) => (
                    <button
                      key={dow}
                      type="button"
                      onClick={() => toggleDay(dow)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold border ${
                        modal.days.includes(dow) ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white'
                      }`}
                    >
                      {DAY_LABELS[dow]}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="flex gap-2">
              <button type="button" onClick={() => setModal({ ...modal, scope: 'recurring' })} className={`flex-1 py-2 rounded-lg text-xs font-semibold border ${modal.scope === 'recurring' ? 'bg-indigo-600 text-white border-indigo-600' : ''}`}>Récurrence</button>
              <button type="button" onClick={() => setModal({ ...modal, scope: 'special', special_week_id: modal.special_week_id || covering[0]?.id || specialWeeks[0]?.id || '' })} className={`flex-1 py-2 rounded-lg text-xs font-semibold border ${modal.scope === 'special' ? 'bg-amber-600 text-white border-amber-600' : ''}`}>Semaine spéciale</button>
            </div>
            {modal.scope === 'recurring' ? (
              <select value={modal.week_pattern} onChange={(e) => setModal({ ...modal, week_pattern: e.target.value })} className="w-full p-2 border rounded-lg">
                {Object.entries(WEEK_PATTERN_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            ) : (
              <select value={modal.special_week_id} onChange={(e) => setModal({ ...modal, special_week_id: e.target.value })} className="w-full p-2 border rounded-lg">
                <option value="">Choisir…</option>
                {specialWeeks.map((s) => <option key={s.id} value={s.id}>{s.label} ({s.week_start} → {s.week_end})</option>)}
              </select>
            )}
            <input value={modal.label} onChange={(e) => setModal({ ...modal, label: e.target.value })} className="w-full p-2 border rounded-lg" placeholder="Libellé optionnel" />
            <div className="flex gap-2 pt-2">
              <button type="button" onClick={() => setModal(null)} className="px-3 py-2 border rounded-lg">Annuler</button>
              {modal.mode === 'edit' && (
                <button type="button" disabled={saving} onClick={removeSlot} className="px-3 py-2 text-red-600 border border-red-200 rounded-lg">Désactiver</button>
              )}
              <button type="button" disabled={saving} onClick={saveModal} className="flex-1 bg-indigo-600 text-white py-2 rounded-lg font-semibold">Enregistrer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
