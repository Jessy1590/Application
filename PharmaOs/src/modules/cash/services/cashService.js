import { supabase } from '../../../shared/supabaseClient.js';

export async function submitCashClosure(userId, authorName, payload) {
  const { data, error } = await supabase
    .from('cash_closures')
    .insert([{
      closure_date: payload.closure_date || new Date().toISOString().split('T')[0],
      author_id: userId,
      author_name: authorName || null,
      fond_reel: Number(payload.fond_reel) || 0,
      fond_logiciel: Number(payload.fond_logiciel) || 0,
      montant_cb: Number(payload.montant_cb) || 0,
      argent_lieu_sur: Number(payload.argent_lieu_sur) || 0,
      nb_cheques: Number(payload.nb_cheques) || 0,
      montant_cheques: Number(payload.montant_cheques) || 0,
      garde: !!payload.garde,
      sortie_particuliere: !!payload.sortie_particuliere,
      sortie_montant: Number(payload.sortie_montant) || 0,
      sortie_motif: payload.sortie_motif || null,
      notes: payload.notes || null,
    }])
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function fetchMyClosures(userId) {
  const { data, error } = await supabase
    .from('cash_closures')
    .select('*')
    .eq('author_id', userId)
    .order('closure_date', { ascending: false })
    .limit(15);
  if (error) throw new Error(error.message);
  return data || [];
}

export function calcEcart(c) {
  return (Number(c.fond_reel) || 0) - (Number(c.fond_logiciel) || 0);
}

export async function fetchCashClosures({ from, to } = {}) {
  let q = supabase.from('cash_closures').select('*').order('closure_date', { ascending: false });
  if (from) q = q.gte('closure_date', from);
  if (to) q = q.lte('closure_date', to);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data || [];
}

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

export function exportMonthlyPdf(closures, yearMonth) {
  const totalEcart = closures.reduce((s, c) => s + calcEcart(c), 0);
  const totalCb = closures.reduce((s, c) => s + (Number(c.montant_cb) || 0), 0);
  const rows = closures.map((c) => `
    <tr>
      <td>${c.closure_date}</td><td>${c.author_name || ''}</td>
      <td>${Number(c.fond_reel).toFixed(2)}</td><td>${Number(c.fond_logiciel).toFixed(2)}</td>
      <td>${calcEcart(c).toFixed(2)}</td><td>${Number(c.montant_cb).toFixed(2)}</td>
      <td>${c.garde ? 'Oui' : 'Non'}</td>
    </tr>`).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Clôtures ${yearMonth}</title>
    <style>body{font-family:Arial,sans-serif;font-size:12px;margin:24px}h1{font-size:18px}
    table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border:1px solid #ccc;padding:6px;text-align:left}
    th{background:#f5f5f5}.summary{margin-top:16px;padding:12px;background:#f0fdf4;border:1px solid #86efac}
    @media print{button{display:none}}</style></head>
    <body><h1>Rapport général — Clôtures de caisse</h1>
    <p>Période : <strong>${yearMonth}</strong> — Généré le ${new Date().toLocaleDateString('fr-FR')}</p>
    <div class="summary"><strong>Synthèse :</strong> ${closures.length} clôture(s) — Écart total : ${totalEcart.toFixed(2)} € — CB total : ${totalCb.toFixed(2)} €</div>
    <table><thead><tr><th>Date</th><th>Auteur</th><th>Fond réel</th><th>Logiciel</th><th>Écart</th><th>CB</th><th>Garde</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="7">Aucune clôture</td></tr>'}</tbody></table>
    <button onclick="window.print()">Imprimer / PDF</button></body></html>`;

  const w = window.open('', '_blank');
  w.document.write(html);
  w.document.close();
}

export async function getAccountantEmail() {
  const { data, error } = await supabase.from('app_settings').select('value').eq('key', 'cash_accountant_email').maybeSingle();
  if (error) throw new Error(error.message);
  return data?.value?.email || '';
}

export async function setAccountantEmail(email) {
  const { error } = await supabase.from('app_settings').upsert({
    key: 'cash_accountant_email',
    value: { email },
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
}

function extractEmailError(data, error) {
  if (data?.error) {
    const detail = data.detail?.message || data.detail?.error || '';
    return [data.error, detail].filter(Boolean).join(' — ');
  }
  if (error?.context?.json) {
    try {
      const body = typeof error.context.json === 'function' ? null : error.context.json;
      if (body?.error) return body.error;
    } catch { /* ignore */ }
  }
  if (error?.message) {
    if (/non-2xx|FunctionsHttpError/i.test(error.message)) {
      return 'Échec envoi e-mail (serveur). Vérifiez RESEND_API_KEY, SMTP_FROM (domaine vérifié) et l\'adresse destinataire.';
    }
    return error.message;
  }
  return 'Échec envoi e-mail inconnu';
}

export async function emailMonthlyReport(closures, yearMonth, toEmail) {
  const email = (toEmail || '').trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Adresse e-mail du comptable invalide ou vide. Configurez-la ci-dessus.');
  }

  const totalEcart = closures.reduce((s, c) => s + calcEcart(c), 0);
  const html = `
    <h2>Rapport clôtures caisse — ${yearMonth}</h2>
    <p>${closures.length} clôture(s) — Écart total : <strong>${totalEcart.toFixed(2)} €</strong></p>
    <table border="1" cellpadding="4" style="border-collapse:collapse;font-size:12px">
      <tr><th>Date</th><th>Auteur</th><th>Fond réel</th><th>Écart</th><th>CB</th></tr>
      ${closures.map((c) => `<tr><td>${c.closure_date}</td><td>${c.author_name || ''}</td><td>${c.fond_reel}</td><td>${calcEcart(c).toFixed(2)}</td><td>${c.montant_cb}</td></tr>`).join('')}
    </table>
    <p>PharmaOS — export automatique</p>`;

  const { data, error } = await supabase.functions.invoke('send-transactional-email', {
    body: { to: email, subject: `Clôtures caisse ${yearMonth}`, html },
  });

  if (error || data?.error) {
    throw new Error(extractEmailError(data, error));
  }
  return data;
}
