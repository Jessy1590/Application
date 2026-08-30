import { supabase } from './supabaseClient';

export async function fetchCashClosures({ from, to } = {}) {
  let q = supabase.from('cash_closures').select('*').order('closure_date', { ascending: false });
  if (from) q = q.gte('closure_date', from);
  if (to) q = q.lte('closure_date', to);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export function calcEcart(c) {
  return (Number(c.fond_reel) || 0) - (Number(c.fond_logiciel) || 0);
}

/** Export CSV comptable mensuel — colonnes fixes */
export function exportMonthlyCsv(closures, yearMonth) {
  const header = [
    'Date', 'Auteur', 'Fond réel', 'Fond logiciel', 'Écart',
    'CB', 'Argent lieu sûr', 'Nb chèques', 'Montant chèques',
    'Garde', 'Sortie particulière', 'Montant sortie', 'Motif sortie', 'Notes',
  ];
  const rows = closures.map((c) => [
    c.closure_date,
    c.author_name || '',
    c.fond_reel,
    c.fond_logiciel,
    calcEcart(c),
    c.montant_cb,
    c.argent_lieu_sur,
    c.nb_cheques,
    c.montant_cheques,
    c.garde ? 'Oui' : 'Non',
    c.sortie_particuliere ? 'Oui' : 'Non',
    c.sortie_montant || 0,
    (c.sortie_motif || '').replace(/"/g, '""'),
    (c.notes || '').replace(/"/g, '""'),
  ]);
  const csv = [header, ...rows].map((r) => r.map((c) => `"${c}"`).join(';')).join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `clotures_caisse_${yearMonth}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
