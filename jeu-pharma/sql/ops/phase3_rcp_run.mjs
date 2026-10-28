#!/usr/bin/env node
/**
 * Phase 3 Cardio DEUST — enrichissement RCP référentiel (BDPM/ANSM puis EMA).
 * Sources allowlist only. Skip documenté si pas de CIS/RCP.
 *
 * Usage :
 *   node sql/ops/phase3_rcp_run.mjs
 *   node sql/ops/phase3_rcp_run.mjs --only=idarucizumab,naftazone
 */
import { readFile, writeFile, appendFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractText, getDocumentProxy } from 'unpdf';

const __dir = dirname(fileURLToPath(import.meta.url));
const EDGE = 'https://kpjflntnotftpzffjbud.supabase.co/functions/v1/jeupharma-regen-referentiel';
const BDM = 'https://kpjflntnotftpzffjbud.supabase.co/rest/v1/rpc/search_products';
const REST = 'https://kpjflntnotftpzffjbud.supabase.co/rest/v1';
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtwamZsbnRub3RmdHB6ZmZqYnVkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYyODg0MjMsImV4cCI6MjEwMTg2NDQyM30.mTjm86Thn6VUOAAJRWCsGMcR0Ip-qEP08fJdwUvKKEo';
const OPS = 'jp-regen-20261014-vocab-canonique';
const MAX_RCP = 90_000;

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    return m ? [m[1], m[2] == null ? true : m[2]] : [a, true];
  }),
);
const ONLY = new Set(
  String(args.only || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
);

const JOURNAL_JSON = join(__dir, 'phase3_rcp_journal.json');
const JOURNAL_MD = join(__dir, '..', '..', '.cursor', 'docs', 'PHASE3_RCP_JOURNAL.md');
const NDJSON = join(__dir, 'phase3_rcp_progress.ndjson');

function normKey(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeHtml(s) {
  return s
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'");
}

function cleanHtml(html) {
  return decodeHtml(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<\/(p|div|tr|li|h\d)>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

function extractAnsmSections(html) {
  const parts = html.split(/<p class="AmmAnnexeTitre[12]"/i).slice(1);
  const out = {};
  for (const p of parts) {
    const m = p.match(/<span id=['"]([0-9]\.[0-9]*)\.?_/);
    if (!m) continue;
    if (!out[m[1]]) out[m[1]] = p.replace(/^[^>]*>/, '');
  }
  return out;
}

function sectionsToText(raw) {
  const labels = {
    '4.1': 'Indications',
    '4.2': 'Posologie',
    '4.3': 'CI',
    '4.4': 'Précautions',
    '4.5': 'Interactions',
    '4.6': 'Grossesse',
    '4.8': 'EI',
    '5.1': 'Pharmacodynamie',
  };
  const parts = [];
  let total = 0;
  for (const num of Object.keys(labels)) {
    if (!raw[num]) continue;
    const cleaned = cleanHtml(raw[num]).replace(/^\d\.\d\.?\s*[^\n]*\n/, '').slice(0, 16_000);
    total += cleaned.length;
    parts.push(`## ${num} ${labels[num]}\n${cleaned}`);
  }
  return { text: parts.join('\n\n').slice(0, MAX_RCP), total };
}

async function fetchPdfText(pdfUrl) {
  const res = await fetch(pdfUrl, {
    headers: { 'User-Agent': 'JeuPharma-phase3/1.0' },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`PDF HTTP ${res.status}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  const pdf = await getDocumentProxy(buf);
  const extracted = await extractText(pdf, { mergePages: true });
  let text = String(extracted.text || '');
  const iAnnexe = text.search(/R[ÉE]SUM[ÉE] DES CARACT[ÉE]RISTIQUES DU PRODUIT|SUMMARY OF PRODUCT CHARACTERISTICS/i);
  if (iAnnexe >= 0) text = text.slice(iAnnexe);
  const iNotice = text.search(/\nANNEXE III\b|\nB\.\s*NOTICE\b|\nB\.\s*PACKAGE LEAFLET\b/i);
  if (iNotice > 2000) text = text.slice(0, iNotice);
  text = text.replace(/\s+/g, ' ').trim().slice(0, MAX_RCP);
  return { text, total: text.length, url: pdfUrl };
}

async function fetchAnsmRcp(cis) {
  const url = `https://base-donnees-publique.medicaments.gouv.fr/medicament/${cis}/extrait`;
  const res = await fetch(url, { headers: { 'User-Agent': 'JeuPharma-phase3/1.0' } });
  if (!res.ok) throw new Error(`ANSM HTTP ${res.status}`);
  const html = await res.text();
  const fromHtml = sectionsToText(extractAnsmSections(html));
  if (fromHtml.total >= 80) return { ...fromHtml, source: 'ansm_html', url, cis: String(cis) };
  const m =
    html.match(/href="([^"]*epar[^"]*\.pdf)"/i) ||
    html.match(/href="(https:\/\/www\.ema\.europa\.eu[^"]*product-information[^"]*\.pdf)"/i);
  if (m) {
    const pdfUrl = m[1].startsWith('http') ? m[1] : `https://www.ema.europa.eu${m[1]}`;
    const pdf = await fetchPdfText(pdfUrl);
    if (pdf.total >= 80) return { text: pdf.text, total: pdf.total, source: 'epar_pdf', url: pdfUrl, cis: String(cis) };
  }
  return { text: '', total: 0, source: 'vide', url, cis: String(cis) };
}

async function applyOne({ matrice_id, dci, cis, rcp_text, source }) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 180_000);
  try {
    const res = await fetch(EDGE, {
      method: 'POST',
      headers: {
        apikey: ANON,
        Authorization: `Bearer ${ANON}`,
        'x-jeupharma-ops': OPS,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ apply_one: true, matrice_id, dci, cis, rcp_text, source }),
      signal: ctrl.signal,
    });
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`Non-JSON ${res.status}: ${text.slice(0, 300)}`);
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${JSON.stringify(data).slice(0, 400)}`);
    return data;
  } finally {
    clearTimeout(t);
  }
}

async function searchProducts(q, lim = 8) {
  const res = await fetch(BDM, {
    method: 'POST',
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${ANON}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      'Accept-Profile': 'bdm',
      'Content-Profile': 'bdm',
    },
    body: JSON.stringify({ q, lim }),
  });
  if (!res.ok) return [];
  const data = await res.json().catch(() => []);
  return Array.isArray(data) ? data : [];
}

/** Jobs : enrichissements existants + EMA + monos à créer (si CIS mono) */
const JOBS = [
  // Priorité densités faibles / CIS corrects (phase3_rcp_input.json)
  {
    kind: 'enrich',
    matrice_id: '2db88479-3f2f-4a9c-8a81-805c057278a1',
    dci: 'Amiloride + furosémide',
    cis: '63824615',
    note: 'Logirene — CIS correct (remplace Moduretic cis_suspect)',
  },
  {
    kind: 'enrich',
    matrice_id: 'a446fae6-94e0-4179-94b8-ecc7cbe0d9f7',
    dci: 'Idarucizumab',
    cis: '63555182',
    note: 'Praxbind — densite Ind/CI faible',
  },
  {
    kind: 'enrich',
    matrice_id: '89d61300-8511-4ef8-95af-649d6d349009',
    dci: 'Naftazone',
    cis: '60073451',
    note: 'Etioven — densite faible',
  },
  {
    kind: 'enrich',
    matrice_id: 'b11555be-dc28-43ad-ae54-38b761d9059f',
    dci: 'Folinate de calcium',
    cis: '60666074',
    note: 'FOLINATE AGUETTANT — publier apres RCP',
    publish_after: true,
  },
  // EMA pour skips BDM FR
  {
    kind: 'enrich_ema',
    matrice_id: '15dace8a-f7b8-4d7e-b388-8eb9a860fee1',
    dci: 'Désirudine',
    ema_pdf: 'https://www.ema.europa.eu/en/documents/product-information/revasc-epar-product-information_en.pdf',
    note: 'Revasc EMA (AMM retiree) — EPAR EN',
  },
  {
    kind: 'enrich_ema',
    matrice_id: '7fd0485c-b7cb-445d-ac0f-3984eddb245e',
    dci: 'Lépirudine',
    ema_pdf: 'https://www.ema.europa.eu/en/documents/product-information/refludan-epar-product-information_en.pdf',
    ema_pdf_fallback: [
      'https://www.ema.europa.eu/fr/documents/product-information/refludan-epar-product-information_fr.pdf',
    ],
    note: 'Refludan EMA (AMM retiree) — EPAR EN/FR',
  },
  {
    kind: 'enrich_ema',
    matrice_id: '6f8158c7-8836-4a76-a636-9800c119443b',
    dci: 'Rétéplase',
    ema_pdf: 'https://www.ema.europa.eu/en/documents/product-information/rapilysin-epar-product-information_en.pdf',
    note: 'Rapilysin EMA',
  },
  {
    kind: 'try_bdm_then_skip',
    matrice_id: '04463bf2-ee7e-4e61-a864-9383bd77524b',
    dci: 'Streptokinase',
    queries: ['streptokinase', 'streptase'],
    note: 'Chercher CIS BDM ; sinon skip no_cis',
  },
  {
    kind: 'try_bdm_then_skip',
    matrice_id: '474ef71c-3530-45fe-82d4-22be995087c4',
    dci: 'Ruscoside',
    queries: ['cirkan', 'ruscus', 'ruscoside'],
    note: 'Phyto — CIS mono ruscoside introuvable → skip',
    require_mono_substance: true,
  },
  {
    kind: 'try_bdm_then_skip',
    matrice_id: 'c63e3099-8a74-42bf-9b33-efd88ab29da1',
    dci: 'Alginate de calcium',
    queries: ['algosteril', 'alginate de calcium'],
    note: 'CIS alginate sodium 63517694 suspect — skip si pas mono calcique',
    cis_deny: ['63517694'],
  },
  // Monos composants Phase1 skips — créer SEULEMENT si RCP mono officiel
  {
    kind: 'create_mono_if_rcp',
    matrice_id: 'a3412807-1e7f-4735-8c48-a835f8b509dd',
    dci: 'Sulfate ferreux',
    cis: '61879666',
    note: 'TARDYFERON 50 mg — sulfate ferreux desséché (mono) ; remplace proxy sels ferreux sur asso ascorbate',
    publish_after: true,
    backfill_assos: [
      {
        asso_id: 'a19b0c1d-7c86-4b55-b27f-c134be7828db',
        ordre: 1,
        replace_comp_id: 'd122d669-2f7c-48ed-a517-aa6e4bd765b8',
      },
    ],
  },
  {
    kind: 'skip_documented',
    dci: 'Chlortalidone',
    reason: 'no_cis_mono',
    note: 'BDM FR : uniquement associations (Tenoretic…). Pas de spécialité mono → skip création',
  },
  {
    kind: 'skip_documented',
    dci: 'Altizide',
    reason: 'no_cis_mono',
    note: 'BDM FR : uniquement associations (Aldactazine…). Pas de mono → skip',
  },
  {
    kind: 'skip_documented',
    dci: 'Méthyclothiazide',
    reason: 'no_cis_mono',
    note: 'BDM FR : aucun CIS mono / asso méthyclothiazide commercialisée trouvée → skip',
  },
  {
    kind: 'skip_documented',
    dci: 'Sacubitril',
    reason: 'no_cis_mono',
    note: 'BDM FR : uniquement complexe Entresto (sacubitril+valsartan). Pas de mono → skip',
  },
  {
    kind: 'skip_documented',
    dci: 'Aspirine',
    reason: 'mapped_existing',
    note: 'Mapper vers Acide acétylsalicylique existant (de52a954) — pas de nouvelle DCI',
    mapped_matrice_id: 'de52a954-d5c1-434a-ab55-df2d6af685d3',
  },
  {
    kind: 'skip_documented',
    dci: 'Triamtérène + méthyclothiazide',
    reason: 'cis_suspect',
    note: 'Audit §5.2 CIS 63870751 = Prestol (triam+HCT) — ne pas ré-enrichir sans CIS Isobar/équivalent méthyclothiazide',
    matrice_id: '694ce30c-89bd-47be-9434-acfc2fffa602',
  },
  {
    kind: 'skip_documented',
    dci: 'Nébivolol + hydrochlorothiazide',
    reason: 'cis_suspect_resolved_or_ok',
    note: 'Densités déjà OK (score 18) ; CIS historique suspect nébivolol mono — ne pas forcer re-apply',
    matrice_id: '43e31250-8f71-4538-be5f-ba4aa4d47d9c',
  },
];

const journal = {
  started_at: new Date().toISOString(),
  project: 'kpjflntnotftpzffjbud',
  phase: 3,
  rule: 'Sources ONLY base-donnees-publique.medicaments.gouv.fr puis ema.europa.eu',
  ok: [],
  skip: [],
  errors: [],
  created_monos: [],
  composants_backfill: [],
};

async function logProgress(row) {
  await appendFile(NDJSON, JSON.stringify({ ...row, at: new Date().toISOString() }) + '\n');
}

async function publishMatrice(matriceId) {
  // Via Edge apply ne change pas statut ; on documente — publish via REST needs service role.
  // Tentative PATCH anon (échouera si RLS) — sinon journal « à publier admin ».
  const res = await fetch(`${REST}/matrice_medicaments?id=eq.${matriceId}`, {
    method: 'PATCH',
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${ANON}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
      'Content-Profile': 'jeupharma',
    },
    body: JSON.stringify({ statut: 'publie' }),
  });
  return { ok: res.ok, status: res.status };
}

async function findMatriceByDci(dci) {
  const nk = normKey(dci);
  // RPC search not available ; use Edge apply path only after SQL create.
  // Query via PostgREST with filter on dcis join is awkward — use rpc if any.
  // Fallback: caller provides ids from MCP SQL.
  return null;
}

async function resolveRcpForJob(job) {
  if (job.kind === 'enrich' && job.cis) {
    return fetchAnsmRcp(job.cis);
  }
  if (job.kind === 'enrich_ema' && job.ema_pdf) {
    const urls = [job.ema_pdf, ...(job.ema_pdf_fallback || [])];
    let lastErr = null;
    for (const url of urls) {
      try {
        const pdf = await fetchPdfText(url);
        if (pdf.total >= 80) {
          return {
            text: pdf.text,
            total: pdf.total,
            source: 'ema_epar_pdf',
            url,
            cis: null,
          };
        }
      } catch (e) {
        lastErr = e;
      }
    }
    if (lastErr) throw lastErr;
    return null;
  }
  if (job.kind === 'try_bdm_then_skip' || job.kind === 'create_mono_if_rcp') {
    if (job.cis) return fetchAnsmRcp(job.cis);
    for (const q of job.queries || []) {
      const hits = await searchProducts(q, 10);
      for (const h of hits) {
        const cis = String(h.cis || '').replace(/\D/g, '');
        if (!cis) continue;
        if (job.cis_deny?.includes(cis)) continue;
        const subst = String(h.substances || '').toLowerCase();
        if (job.require_mono_substance) {
          const parts = subst.split(',').map((s) => s.trim()).filter(Boolean);
          if (parts.length !== 1) continue;
        }
        try {
          const rcp = await fetchAnsmRcp(cis);
          if (rcp.total >= 80) return rcp;
        } catch {
          /* next */
        }
      }
    }
    return null;
  }
  return null;
}

async function runEnrich(job, rcp) {
  const data = await applyOne({
    matrice_id: job.matrice_id,
    dci: job.dci,
    cis: rcp.cis || job.cis || null,
    rcp_text: rcp.text,
    source: rcp.source,
  });
  const okRow = (data.ok && data.ok[0]) || {
    dci: job.dci,
    status: 'ok',
    cis: rcp.cis || job.cis,
    source: rcp.source,
  };
  const entry = {
    ...okRow,
    matrice_id: job.matrice_id,
    url: rcp.url,
    note: job.note,
  };
  journal.ok.push(entry);
  await logProgress({ status: 'ok', ...entry });
  if (job.publish_after) {
    const pub = await publishMatrice(job.matrice_id);
    entry.publish = pub;
    if (!pub.ok) {
      journal.skip.push({
        dci: job.dci,
        reason: 'publish_rls',
        note: `RCP OK mais PATCH statut publie HTTP ${pub.status} — publier via MCP/admin`,
        matrice_id: job.matrice_id,
      });
    }
  }
  console.log('  → OK', rcp.source, rcp.cis || '', 'len', rcp.total);
}

function shouldRun(job) {
  if (!ONLY.size) return true;
  return ONLY.has(normKey(job.dci)) || ONLY.has(String(job.dci).toLowerCase());
}

console.log('Phase 3 RCP — démarrage', new Date().toISOString());
console.log('Jobs:', JOBS.length, ONLY.size ? `(only ${[...ONLY]})` : '');

for (let i = 0; i < JOBS.length; i++) {
  const job = JOBS[i];
  if (!shouldRun(job)) continue;
  console.log(`[${i + 1}/${JOBS.length}] ${job.kind} — ${job.dci}`);
  try {
    if (job.kind === 'skip_documented') {
      const s = {
        dci: job.dci,
        reason: job.reason,
        note: job.note,
        matrice_id: job.matrice_id || null,
        mapped_matrice_id: job.mapped_matrice_id || null,
      };
      journal.skip.push(s);
      await logProgress({ status: 'skip', ...s });
      console.log('  → SKIP', job.reason);
      continue;
    }

    if (job.kind === 'create_mono_if_rcp') {
      // Création matrice via SQL MCP hors script (service). Ici : fetch RCP + documenter payload.
      const rcp = await resolveRcpForJob(job);
      if (!rcp || rcp.total < 80) {
        const s = { dci: job.dci, reason: 'rcp_vide_mono', note: job.note, cis: job.cis };
        journal.skip.push(s);
        await logProgress({ status: 'skip', ...s });
        console.log('  → SKIP rcp_vide_mono');
        continue;
      }
      // Si matrice déjà fournie (reprise), enrichir ; sinon stocker pending create
      if (job.matrice_id) {
        await runEnrich(job, rcp);
        journal.created_monos.push({
          dci: job.dci,
          matrice_id: job.matrice_id,
          cis: rcp.cis,
          url: rcp.url,
          source: rcp.source,
          status: 'enriched_existing',
        });
      } else {
        const pending = {
          dci: job.dci,
          cis: rcp.cis,
          url: rcp.url,
          source: rcp.source,
          rcp_len: rcp.total,
          rcp_text: rcp.text,
          backfill_assos: job.backfill_assos || [],
          note: job.note,
          status: 'pending_sql_create',
        };
        journal.created_monos.push({
          dci: job.dci,
          cis: rcp.cis,
          url: rcp.url,
          source: rcp.source,
          rcp_len: rcp.total,
          status: 'pending_sql_create',
          note: job.note,
        });
        await writeFile(
          join(__dir, `phase3_pending_mono_${normKey(job.dci).replace(/\s+/g, '_')}.json`),
          JSON.stringify(pending, null, 2),
          'utf8',
        );
        await logProgress({ status: 'pending_mono', dci: job.dci, cis: rcp.cis, len: rcp.total });
        console.log('  → PENDING mono create cis=', rcp.cis, 'len=', rcp.total);
      }
      await new Promise((r) => setTimeout(r, 800));
      continue;
    }

    const rcp = await resolveRcpForJob(job);
    if (!rcp || rcp.total < 80) {
      const s = {
        dci: job.dci,
        reason: job.kind === 'enrich_ema' ? 'ema_rcp_vide' : 'no_cis_or_rcp_vide',
        note: job.note,
        matrice_id: job.matrice_id,
      };
      journal.skip.push(s);
      await logProgress({ status: 'skip', ...s });
      console.log('  → SKIP', s.reason);
      continue;
    }
    if (!job.matrice_id) {
      journal.errors.push({ dci: job.dci, error: 'matrice_id manquant' });
      continue;
    }
    await runEnrich(job, rcp);
    await new Promise((r) => setTimeout(r, 1200));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    journal.errors.push({ dci: job.dci, error: msg.slice(0, 500) });
    await logProgress({ status: 'error', dci: job.dci, error: msg.slice(0, 500) });
    console.log('  → ERR', msg.slice(0, 160));
    await new Promise((r) => setTimeout(r, 2000));
  }
}

journal.finished_at = new Date().toISOString();
journal.totals = {
  ok: journal.ok.length,
  skip: journal.skip.length,
  errors: journal.errors.length,
  created_monos_pending: journal.created_monos.filter((x) => x.status === 'pending_sql_create').length,
  created_monos_done: journal.created_monos.filter((x) => x.status !== 'pending_sql_create').length,
};

await writeFile(JOURNAL_JSON, JSON.stringify(journal, null, 2), 'utf8');

const md = [
  '# Phase 3 — Journal RCP référentiel Cardio DEUST',
  '',
  `**Date** : ${journal.started_at} → ${journal.finished_at}`,
  `**Projet** : \`${journal.project}\``,
  `**Règle** : ${journal.rule}`,
  '',
  '## Compteurs',
  '',
  `| Statut | Nb |`,
  `|--------|----|`,
  `| OK | ${journal.totals.ok} |`,
  `| Skip documenté | ${journal.totals.skip} |`,
  `| Erreurs | ${journal.totals.errors} |`,
  `| Monos créés / enrichis | ${journal.totals.created_monos_done} |`,
  `| Monos pending SQL | ${journal.totals.created_monos_pending} |`,
  '',
  '## OK',
  '',
  ...(journal.ok.length
    ? journal.ok.map(
        (r) =>
          `- **${r.dci}** — CIS \`${r.cis || '—'}\` — source \`${r.source}\`${r.url ? ` — ${r.url}` : ''}${r.stats ? ` — reused ${r.stats.reused}/created ${r.stats.created}` : ''}`,
      )
    : ['*(aucun)*']),
  '',
  '## Skips documentés',
  '',
  ...(journal.skip.length
    ? journal.skip.map((r) => `- **${r.dci}** — \`${r.reason}\` — ${r.note || ''}`)
    : ['*(aucun)*']),
  '',
  '## Monos',
  '',
  ...(journal.created_monos.length
    ? journal.created_monos.map(
        (r) => `- **${r.dci}** — ${r.status} — CIS \`${r.cis || '—'}\` — ${r.note || ''}`,
      )
    : ['*(aucun)*']),
  '',
  '## Erreurs',
  '',
  ...(journal.errors.length
    ? journal.errors.map((r) => `- **${r.dci}** — ${r.error}`)
    : ['*(aucune)*']),
  '',
  '## Hors scope',
  '',
  '- Pas de publication sur leçons (Phase 2).',
  '- Pas Phase 4/5.',
  '',
];
await mkdir(dirname(JOURNAL_MD), { recursive: true });
await writeFile(JOURNAL_MD, md.join('\n'), 'utf8');

console.log('DONE', journal.totals);
console.log('Journal JSON:', JOURNAL_JSON);
console.log('Journal MD:', JOURNAL_MD);
