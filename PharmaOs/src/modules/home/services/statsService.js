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
