import { supabase } from './supabaseClient';

/**
 * Alertes urgentes — colonnes alignées sur les services existants.
 * Les erreurs (colonne absente, RLS…) sont ignorées silencieusement pour éviter le spam console.
 */
async function safeCount(label, queryFn) {
  try {
    const { count, error } = await queryFn();
    if (error) return null;
    return count || 0;
  } catch {
    return null;
  }
}

async function safeSelect(queryFn) {
  try {
    const { data, error } = await queryFn();
    if (error) return [];
    return data || [];
  } catch {
    return [];
  }
}

export async function fetchUrgentAlerts() {
  const alerts = [];

  // call_logs utilise statut_traitement (pas statut)
  const callsCount = await safeCount('calls', () =>
    supabase
      .from('call_logs')
      .select('*', { count: 'exact', head: true })
      .eq('statut_traitement', 'a_rappeler'),
  );
  if (callsCount > 0) {
    alerts.push({
      type: 'calls',
      label: `${callsCount} appel(s) à rappeler`,
      page: 'calls',
      params: { status: 'a_rappeler' },
      severity: 'high',
    });
  }

  // Pas de colonne urgent sur tasks — on lit le JSON description (stock / alertes lot)
  const tasks = await safeSelect(() =>
    supabase
      .from('tasks')
      .select('id, titre, description, task_assignments(statut)')
      .order('created_at', { ascending: false })
      .limit(40),
  );
  tasks.forEach((t) => {
    let urgent = false;
    try {
      const parsed = typeof t.description === 'string' ? JSON.parse(t.description) : t.description;
      urgent = !!parsed?.urgent;
    } catch {
      urgent = /urgent|ERREUR STOCK|retrait/i.test(t.titre || '');
    }
    const open = (t.task_assignments || []).some((a) => a.statut === 'en_cours');
    if (urgent && open) {
      alerts.push({
        type: 'task',
        label: `Tâche urgente : ${t.titre}`,
        page: 'tasks',
        severity: 'high',
      });
    }
  });

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const rentalCount = await safeCount('rental', () =>
    supabase
      .from('rental_contracts')
      .select('*', { count: 'exact', head: true })
      .eq('statut', 'en_cours')
      .lt('date_sortie', cutoff.toISOString()),
  );
  if (rentalCount > 0) {
    alerts.push({
      type: 'rental',
      label: `${rentalCount} location(s) non rentrée(s) > 30j`,
      page: 'rental',
      severity: 'medium',
    });
  }

  // stock_errors utilise status (pas statut), valeur ouverte = 'ouvert'
  const stockCount = await safeCount('stock', () =>
    supabase
      .from('stock_errors')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'ouvert'),
  );
  if (stockCount > 0) {
    alerts.push({
      type: 'stock',
      label: `${stockCount} erreur(s) stock en attente`,
      page: 'stock',
      severity: 'high',
    });
  }

  const magistralCount = await safeCount('magistral', () =>
    supabase
      .from('magistral_orders')
      .select('*', { count: 'exact', head: true })
      .eq('statut', 'devis'),
  );
  if (magistralCount > 0) {
    alerts.push({
      type: 'magistral',
      label: `${magistralCount} devis magistral(aux) à traiter`,
      page: 'magistral',
      severity: 'medium',
    });
  }

  return alerts;
}
