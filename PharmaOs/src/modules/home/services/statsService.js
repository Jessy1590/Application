import { supabase } from '../../../shared/supabaseClient.js';
import { STAFF_ROLES } from '../../../core/roles.js';

/** Utilisation Taskbar (7 j) — lecture `taskbar_logs` + `portail.profiles`. */
export async function fetchTaskbarUsageStats(days = 7) {
  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const { data: logs, error: logsError } = await supabase
      .from('taskbar_logs')
      .select('*')
      .gte('created_at', startDate.toISOString())
      .order('created_at', { ascending: true });

    if (logsError) throw logsError;

    const uniqueUserIds = [...new Set((logs || []).map((log) => log.user_id))];
    const profilesMap = {};

    if (uniqueUserIds.length > 0) {
      const { data: profiles, error: profilesError } = await supabase
        .schema('portail')
        .from('profiles')
        .select('id, display_name')
        .in('id', uniqueUserIds);

      if (!profilesError && profiles) {
        profiles.forEach((p) => {
          profilesMap[p.id] = p.display_name || 'Utilisateur inconnu';
        });
      }
    }

    const dailyStats = {};
    const usersSet = new Set();
    const userLastState = {};

    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
      dailyStats[dateStr] = { date: dateStr };
    }

    (logs || []).forEach((log) => {
      const logDate = new Date(log.created_at);
      const dateStr = logDate.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
      const userName = profilesMap[log.user_id] || log.user_id.substring(0, 6);
      usersSet.add(userName);

      if (!dailyStats[dateStr]) dailyStats[dateStr] = { date: dateStr };
      if (!dailyStats[dateStr][userName]) dailyStats[dateStr][userName] = 0;

      const detailsKey = `${userName}_details`;
      if (!dailyStats[dateStr][detailsKey]) {
        dailyStats[dateStr][detailsKey] = {
          expandCount: 0,
          collapseCount: 0,
          loginCount: 0,
          totalExpandTimeMs: 0,
          totalCollapseTimeMs: 0,
        };
      }

      const details = dailyStats[dateStr][detailsKey];
      const timeMs = logDate.getTime();

      if (log.action === 'login') {
        details.loginCount += 1;
      } else if (log.action === 'expand') {
        if (!userLastState[userName] || userLastState[userName].action !== 'expand') {
          dailyStats[dateStr][userName] += 1;
          details.expandCount += 1;
          if (userLastState[userName] && userLastState[userName].action === 'collapse') {
            details.totalCollapseTimeMs += timeMs - userLastState[userName].time;
          }
        }
      } else if (log.action === 'collapse') {
        if (!userLastState[userName] || userLastState[userName].action !== 'collapse') {
          details.collapseCount += 1;
          if (userLastState[userName] && userLastState[userName].action === 'expand') {
            details.totalExpandTimeMs += timeMs - userLastState[userName].time;
          }
        }
      }

      if (log.action !== 'login') {
        userLastState[userName] = { action: log.action, time: timeMs };
      }
    });

    const chartData = Object.values(dailyStats).map((day) => {
      const newDay = { ...day };
      Array.from(usersSet).forEach((userName) => {
        const detailsKey = `${userName}_details`;
        if (newDay[detailsKey]) {
          const d = newDay[detailsKey];
          d.avgExpandSec = d.expandCount > 0
            ? Math.round(d.totalExpandTimeMs / d.expandCount / 1000)
            : 0;
          d.avgCollapseSec = d.collapseCount > 0
            ? Math.round(d.totalCollapseTimeMs / d.collapseCount / 1000)
            : 0;
        }
      });
      return newDay;
    });

    return { chartData, users: Array.from(usersSet), error: null };
  } catch (error) {
    console.error('Erreur stats taskbar:', error);
    return { chartData: [], users: [], error };
  }
}

export function getMockAdviceStats() {
  return { conseilsDonnes: 58, ventesAssociees: 21, tauxTransformation: 36 };
}

function topN(counter, n = 5) {
  return Object.entries(counter)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([label, count]) => ({ label, count }));
}

/**
 * Agrégats transverses pour le tableau de bord : efficacité équipe + problèmes récurrents.
 */
export async function fetchDashboardInsights(days = 30) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceIso = since.toISOString();
  const today = new Date().toISOString().slice(0, 10);

  const [
    profilesRes,
    assignmentsRes,
    ipRes,
    qualityRes,
    stockRes,
    disputesRes,
    absencesRes,
    changesRes,
    taskbarRes,
  ] = await Promise.all([
    supabase.schema('portail').from('profiles').select('id, display_name, job_title, role').in('role', STAFF_ROLES),
    supabase.from('task_assignments').select('user_id, statut, completion_time_seconds, completed_at, tasks(created_at)').gte('completed_at', sinceIso).limit(2000),
    supabase.from('act_ip_logs').select('id, user_id, probleme_identifie, statut, created_at').gte('created_at', sinceIso),
    supabase.from('quality_events').select('id, type, severity, status, created_at').gte('created_at', sinceIso),
    supabase.from('stock_errors').select('id, medicament, status, created_at').gte('created_at', sinceIso),
    supabase.from('supplier_disputes').select('id, dispute_type, statut, created_at').gte('created_at', sinceIso),
    supabase.from('hr_absences').select('id, user_id, statut, date_debut, date_fin, absence_type').or(`date_fin.gte.${today},statut.eq.en_attente`),
    supabase.from('hr_schedule_changes').select('id, user_id, change_type, statut, date_debut, created_at').gte('created_at', sinceIso),
    supabase.from('taskbar_logs').select('user_id, action, created_at').gte('created_at', sinceIso),
  ]);

  // Aussi tâches encore ouvertes (pas forcément completed_at récent)
  const openAssignRes = await supabase
    .from('task_assignments')
    .select('user_id, statut')
    .eq('statut', 'en_cours');

  const profiles = profilesRes.data || [];
  const byUser = {};
  profiles.forEach((p) => {
    byUser[p.id] = {
      id: p.id,
      name: p.display_name,
      job_title: p.job_title || 'autre',
      tasksDone: 0,
      tasksOpen: 0,
      avgTaskMin: null,
      _taskSec: 0,
      _taskN: 0,
      ipCount: 0,
      activeDays: new Set(),
      retards: 0,
    };
  });

  (assignmentsRes.data || []).forEach((a) => {
    const u = byUser[a.user_id];
    if (!u) return;
    if (a.statut === 'terminee') {
      u.tasksDone += 1;
      if (a.completion_time_seconds) {
        u._taskSec += a.completion_time_seconds;
        u._taskN += 1;
      }
    }
  });

  (openAssignRes.data || []).forEach((a) => {
    const u = byUser[a.user_id];
    if (u) u.tasksOpen += 1;
  });

  (ipRes.data || []).forEach((ip) => {
    if (byUser[ip.user_id]) byUser[ip.user_id].ipCount += 1;
  });

  (taskbarRes.data || []).forEach((log) => {
    const u = byUser[log.user_id];
    if (!u) return;
    u.activeDays.add(String(log.created_at).slice(0, 10));
  });

  (changesRes.data || []).forEach((c) => {
    if (c.change_type === 'retard' && byUser[c.user_id]) byUser[c.user_id].retards += 1;
  });

  const staff = Object.values(byUser).map((u) => ({
    id: u.id,
    name: u.name,
    job_title: u.job_title,
    tasksDone: u.tasksDone,
    tasksOpen: u.tasksOpen,
    avgTaskMin: u._taskN ? Math.round(u._taskSec / u._taskN / 60) : null,
    ipCount: u.ipCount,
    activeDays: u.activeDays.size,
    retards: u.retards,
  })).sort((a, b) => (b.tasksDone + b.ipCount) - (a.tasksDone + a.ipCount));

  const ipProblems = {};
  (ipRes.data || []).forEach((ip) => {
    const key = (ip.probleme_identifie || '').trim() || 'Non précisé';
    ipProblems[key] = (ipProblems[key] || 0) + 1;
  });

  const qualityTypes = {};
  (qualityRes.data || []).forEach((q) => {
    const key = q.type || 'autre';
    qualityTypes[key] = (qualityTypes[key] || 0) + 1;
  });

  const stockMeds = {};
  (stockRes.data || []).forEach((s) => {
    const key = s.medicament || 'Inconnu';
    stockMeds[key] = (stockMeds[key] || 0) + 1;
  });

  const disputeTypes = {};
  (disputesRes.data || []).forEach((d) => {
    const key = d.dispute_type || 'autre';
    disputeTypes[key] = (disputeTypes[key] || 0) + 1;
  });

  const absences = absencesRes.data || [];
  const pendingAbs = absences.filter((a) => a.statut === 'en_attente').length;
  const openQuality = (qualityRes.data || []).filter((q) => {
    const st = String(q.status || '').toLowerCase();
    return !['closed', 'cloture', 'clôturé', 'resolu', 'annule', 'annulé'].includes(st);
  }).length;
  const openStock = (stockRes.data || []).filter((s) => {
    const st = String(s.status || '').toLowerCase();
    return !['resolu', 'closed', 'cloture'].includes(st);
  }).length;
  const openDisputes = (disputesRes.data || []).filter((d) => !['resolu', 'cloture', 'annule'].includes(String(d.statut || '').toLowerCase())).length;

  const totals = {
    days,
    ipTotal: (ipRes.data || []).length,
    qualityTotal: (qualityRes.data || []).length,
    stockTotal: (stockRes.data || []).length,
    disputesTotal: (disputesRes.data || []).length,
    pendingAbs,
    openQuality,
    openStock,
    openDisputes,
    retards: (changesRes.data || []).filter((c) => c.change_type === 'retard').length,
  };

  return {
    staff,
    recurring: {
      ip: topN(ipProblems, 6),
      quality: topN(qualityTypes, 5),
      stock: topN(stockMeds, 5),
      disputes: topN(disputeTypes, 5),
    },
    totals,
    error: profilesRes.error || assignmentsRes.error || ipRes.error || null,
  };
}

function dayKey(iso) {
  return String(iso || '').slice(0, 10);
}

function frDayLabel(isoDate) {
  const [y, m, d] = String(isoDate).split('-');
  if (!y || !m || !d) return isoDate;
  return `${d}/${m}`;
}

function emptyTimeline(days) {
  const map = {};
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    map[key] = {
      date: key,
      label: frDayLabel(key),
      calls: 0,
      ip: 0,
      tasks: 0,
      quality: 0,
      stock: 0,
      disputes: 0,
      magistral: 0,
      conseil: 0,
      location: 0,
      cash: 0,
      hr: 0,
    };
  }
  return map;
}

function bump(counter, key, n = 1) {
  const k = key || 'autre';
  counter[k] = (counter[k] || 0) + n;
}

function toNamedList(counter, n = 8) {
  return Object.entries(counter)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([name, count]) => ({ name, count }));
}

const CALL_MOTIF_LABELS = {
  intervention_pharmaceutique: 'IP',
  commande_labo: 'Commande labo',
  reclamation_patient: 'Réclamation',
  reception_du: 'Réception dû',
  litige_fournisseur: 'Litige fourn.',
  autre: 'Autre',
  information_medicale: 'IP',
  renseignement_patient: 'Autre',
};

const CALL_STATUT_LABELS = {
  resolu: 'Résolu',
  a_rappeler: 'À rappeler',
  attente_pharmacien: 'Attente pharma',
  cloture: 'Clôturé',
  brouillon: 'Brouillon',
  annule: 'Annulé',
};

const QUALITY_TYPE_LABELS = {
  erreur_delivrance: 'Erreur délivrance',
  presqu_erreur: "Presqu'erreur",
  reclamation_patient: 'Réclamation',
  probleme_fournisseur: 'Fournisseur',
};

/**
 * Agrégats riches pour les graphiques du tableau de bord (période glissante).
 */
export async function fetchDashboardCharts(days = 30) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceIso = since.toISOString();
  const sinceDate = sinceIso.slice(0, 10);
  const timelineMap = emptyTimeline(days);

  const [
    callsRes,
    ipRes,
    assignRes,
    qualityRes,
    stockRes,
    disputesRes,
    magistralRes,
    conseilRes,
    absencesRes,
    changesRes,
    cashRes,
    locationRes,
  ] = await Promise.all([
    supabase.from('call_logs').select('created_at, type, motif, statut_traitement').gte('created_at', sinceIso).limit(5000),
    supabase.from('act_ip_logs').select('created_at, statut_ip, probleme_identifie, user_id').gte('created_at', sinceIso).limit(5000),
    supabase.from('task_assignments').select('statut, completion_time_seconds, completed_at, user_id, tasks(created_at)').limit(5000),
    supabase.from('quality_events').select('created_at, type, severity, status').gte('created_at', sinceIso).limit(3000),
    supabase.from('stock_errors').select('created_at, status, medicament').gte('created_at', sinceIso).limit(3000),
    supabase.from('supplier_disputes').select('created_at, statut, dispute_type').gte('created_at', sinceIso).limit(3000),
    supabase.from('magistral_orders').select('created_at, statut').gte('created_at', sinceIso).limit(3000),
    supabase.from('conseil_events').select('created_at, status').gte('created_at', sinceIso).limit(3000),
    supabase.from('hr_absences').select('id, user_id, statut, absence_type, date_debut, created_at').gte('created_at', sinceIso).limit(2000),
    supabase.from('hr_schedule_changes').select('created_at, change_type, statut').gte('created_at', sinceIso).limit(2000),
    supabase.from('cash_closures').select('closure_date, fond_reel, fond_logiciel, created_at').gte('closure_date', sinceDate).limit(500),
    supabase.from('location_dossiers').select('created_at, statut').gte('created_at', sinceIso).limit(3000),
  ]);

  const callsByMotif = {};
  const callsByStatut = {};
  const callsByType = {};
  (callsRes.data || []).forEach((r) => {
    const key = dayKey(r.created_at);
    if (timelineMap[key]) timelineMap[key].calls += 1;
    bump(callsByMotif, CALL_MOTIF_LABELS[r.motif] || r.motif || 'Autre');
    bump(callsByStatut, CALL_STATUT_LABELS[r.statut_traitement] || r.statut_traitement || 'Autre');
    const t = r.type === 'envoye' || r.type === 'out' ? 'Envoyés' : 'Reçus';
    bump(callsByType, t);
  });

  const ipByStatut = {};
  const ipByProblem = {};
  (ipRes.data || []).forEach((r) => {
    const key = dayKey(r.created_at);
    if (timelineMap[key]) timelineMap[key].ip += 1;
    bump(ipByStatut, r.statut_ip || 'Non précisé');
    bump(ipByProblem, (r.probleme_identifie || '').trim() || 'Non précisé');
  });

  const tasksByStatut = {};
  let taskSec = 0;
  let taskDoneN = 0;
  let tasksInPeriod = 0;
  (assignRes.data || []).forEach((r) => {
    const eventAt = r.completed_at || r.tasks?.created_at;
    if (!eventAt || eventAt < sinceIso) return;
    tasksInPeriod += 1;
    const key = dayKey(eventAt);
    if (timelineMap[key]) timelineMap[key].tasks += 1;
    bump(tasksByStatut, r.statut === 'terminee' ? 'Terminées' : 'En cours');
    if (r.statut === 'terminee' && r.completion_time_seconds) {
      taskSec += r.completion_time_seconds;
      taskDoneN += 1;
    }
  });

  const qualityByType = {};
  const qualityBySeverity = {};
  const qualityByStatus = {};
  (qualityRes.data || []).forEach((r) => {
    const key = dayKey(r.created_at);
    if (timelineMap[key]) timelineMap[key].quality += 1;
    bump(qualityByType, QUALITY_TYPE_LABELS[r.type] || r.type || 'Autre');
    bump(qualityBySeverity, r.severity || 'mineure');
    bump(qualityByStatus, r.status || 'ouvert');
  });

  const stockByStatus = {};
  const stockByMed = {};
  (stockRes.data || []).forEach((r) => {
    const key = dayKey(r.created_at);
    if (timelineMap[key]) timelineMap[key].stock += 1;
    bump(stockByStatus, r.status || 'ouvert');
    bump(stockByMed, r.medicament || 'Inconnu');
  });

  const disputesByType = {};
  const disputesByStatut = {};
  (disputesRes.data || []).forEach((r) => {
    const key = dayKey(r.created_at);
    if (timelineMap[key]) timelineMap[key].disputes += 1;
    bump(disputesByType, r.dispute_type || 'autre');
    bump(disputesByStatut, r.statut || 'ouvert');
  });

  const magistralByStatut = {};
  (magistralRes.data || []).forEach((r) => {
    const key = dayKey(r.created_at);
    if (timelineMap[key]) timelineMap[key].magistral += 1;
    bump(magistralByStatut, r.statut || 'autre');
  });

  const conseilByStatus = {};
  (conseilRes.data || []).forEach((r) => {
    const key = dayKey(r.created_at);
    if (timelineMap[key]) timelineMap[key].conseil += 1;
    bump(conseilByStatus, r.status === 'accepte' ? 'Acceptés' : r.status === 'refuse' ? 'Refusés' : (r.status || 'Autre'));
  });

  const hrByType = {};
  (absencesRes.data || []).forEach((r) => {
    const key = dayKey(r.created_at || r.date_debut);
    if (timelineMap[key]) timelineMap[key].hr += 1;
    bump(hrByType, r.absence_type || 'absence');
  });
  (changesRes.data || []).forEach((r) => {
    const key = dayKey(r.created_at);
    if (timelineMap[key]) timelineMap[key].hr += 1;
    bump(hrByType, r.change_type || 'changement');
  });

  const cashTimeline = [];
  const cashByDay = {};
  (cashRes.data || []).forEach((r) => {
    const key = r.closure_date || dayKey(r.created_at);
    if (timelineMap[key]) timelineMap[key].cash += 1;
    const ecart = (Number(r.fond_reel) || 0) - (Number(r.fond_logiciel) || 0);
    if (!cashByDay[key]) cashByDay[key] = { date: key, label: frDayLabel(key), closures: 0, ecartSum: 0 };
    cashByDay[key].closures += 1;
    cashByDay[key].ecartSum += ecart;
  });
  Object.values(cashByDay)
    .sort((a, b) => a.date.localeCompare(b.date))
    .forEach((d) => cashTimeline.push({ ...d, ecart: Math.round(d.ecartSum * 100) / 100 }));

  const locationByStatut = {};
  (locationRes.data || []).forEach((r) => {
    const key = dayKey(r.created_at);
    if (timelineMap[key]) timelineMap[key].location += 1;
    bump(locationByStatut, r.statut || 'autre');
  });

  const timeline = Object.values(timelineMap).sort((a, b) => a.date.localeCompare(b.date));

  const moduleCompare = [
    { name: 'Appels', count: (callsRes.data || []).length, module: 'calls' },
    { name: 'Act-IP', count: (ipRes.data || []).length, module: 'ip' },
    { name: 'Tâches', count: tasksInPeriod, module: 'tasks' },
    { name: 'Qualité', count: (qualityRes.data || []).length, module: 'quality' },
    { name: 'Stock', count: (stockRes.data || []).length, module: 'stock' },
    { name: 'Litiges', count: (disputesRes.data || []).length, module: 'disputes' },
    { name: 'Magistrales', count: (magistralRes.data || []).length, module: 'magistral' },
    { name: 'Conseil', count: (conseilRes.data || []).length, module: 'conseil' },
    { name: 'Location', count: (locationRes.data || []).length, module: 'location' },
    { name: 'Caisse', count: (cashRes.data || []).length, module: 'cash' },
    { name: 'RH', count: (absencesRes.data || []).length + (changesRes.data || []).length, module: 'hr' },
  ].sort((a, b) => b.count - a.count);

  const openQuality = (qualityRes.data || []).filter((q) => {
    const st = String(q.status || '').toLowerCase();
    return !['closed', 'cloture', 'clôturé', 'resolu', 'annule', 'annulé'].includes(st);
  }).length;
  const openStock = (stockRes.data || []).filter((s) => {
    const st = String(s.status || '').toLowerCase();
    return !['resolu', 'closed', 'cloture'].includes(st);
  }).length;
  const openDisputes = (disputesRes.data || []).filter((d) => !['resolu', 'cloture', 'annule'].includes(String(d.statut || '').toLowerCase())).length;
  const callsAction = (callsRes.data || []).filter((c) => ['a_rappeler', 'attente_pharmacien', 'transmis_pharmacien'].includes(c.statut_traitement)).length;
  const ipPending = (ipRes.data || []).filter((i) => i.statut_ip === 'En attente').length;
  const tasksOpen = (assignRes.data || []).filter((a) => a.statut === 'en_cours').length;
  const tasksDonePeriod = tasksByStatut['Terminées'] || 0;
  const tasksByStatutChart = [
    { name: 'Terminées', count: tasksDonePeriod },
    { name: 'En cours', count: tasksOpen },
  ].filter((x) => x.count > 0);
  const conseilAcc = (conseilRes.data || []).filter((c) => c.status === 'accepte').length;
  const conseilRef = (conseilRes.data || []).filter((c) => c.status === 'refuse').length;
  const conseilTotal = conseilAcc + conseilRef;

  const kpis = {
    days,
    totalEvents: moduleCompare.reduce((s, m) => s + m.count, 0),
    calls: (callsRes.data || []).length,
    callsAction,
    ip: (ipRes.data || []).length,
    ipPending,
    tasks: tasksInPeriod,
    tasksOpen,
    avgTaskMin: taskDoneN ? Math.round(taskSec / taskDoneN / 60) : null,
    quality: (qualityRes.data || []).length,
    openQuality,
    stock: (stockRes.data || []).length,
    openStock,
    disputes: (disputesRes.data || []).length,
    openDisputes,
    magistral: (magistralRes.data || []).length,
    conseil: conseilTotal,
    conseilTaux: conseilTotal ? Math.round((conseilAcc / conseilTotal) * 100) : null,
    location: (locationRes.data || []).length,
    cash: (cashRes.data || []).length,
    hr: (absencesRes.data || []).length + (changesRes.data || []).length,
    retards: (changesRes.data || []).filter((c) => c.change_type === 'retard').length,
  };

  return {
    days,
    kpis,
    timeline,
    moduleCompare,
    calls: {
      byMotif: toNamedList(callsByMotif),
      byStatut: toNamedList(callsByStatut),
      byType: toNamedList(callsByType),
    },
    ip: {
      byStatut: toNamedList(ipByStatut),
      byProblem: toNamedList(ipByProblem, 6),
    },
    tasks: {
      byStatut: tasksByStatutChart,
      avgTaskMin: kpis.avgTaskMin,
    },
    quality: {
      byType: toNamedList(qualityByType),
      bySeverity: toNamedList(qualityBySeverity),
      byStatus: toNamedList(qualityByStatus),
    },
    stock: {
      byStatus: toNamedList(stockByStatus),
      byMed: toNamedList(stockByMed, 6),
    },
    disputes: {
      byType: toNamedList(disputesByType),
      byStatut: toNamedList(disputesByStatut),
    },
    magistral: {
      byStatut: toNamedList(magistralByStatut),
    },
    conseil: {
      byStatus: toNamedList(conseilByStatus),
      taux: kpis.conseilTaux,
    },
    hr: {
      byType: toNamedList(hrByType),
    },
    location: {
      byStatut: toNamedList(locationByStatut),
    },
    cash: {
      timeline: cashTimeline,
    },
    errors: [
      callsRes.error, ipRes.error, assignRes.error, qualityRes.error,
      stockRes.error, disputesRes.error, magistralRes.error, conseilRes.error,
      absencesRes.error, changesRes.error, cashRes.error, locationRes.error,
    ].filter(Boolean).map((e) => e.message),
  };
}
