import { supabase } from '../../../shared/supabaseClient.js';

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
    supabase.schema('portail').from('profiles').select('id, display_name, job_title, role').in('role', ['admin', 'équipe']),
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
