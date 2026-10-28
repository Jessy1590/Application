#!/usr/bin/env node
/**
 * Phase 3 Cardio DEUST — RCP référentiel (sources allowlist UNIQUEMENT).
 * - Fetch : base-donnees-publique.medicaments.gouv.fr (ANSM HTML) puis EPAR PDF EMA si lien sur la page
 * - Apply : Edge jeupharma-regen-referentiel apply_one (réutilise entités)
 * - Ne crée PAS de mono sans CIS officiel
 *
 * Usage :
 *   node sql/ops/phase3_rcp_cardio_deust.mjs
 *   node sql/ops/phase3_rcp_cardio_deust.mjs phase3_rcp_input.json
 */
import { readFile, writeFile, appendFile } from 'node:fs/promises';
import { join, dirname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractText, getDocumentProxy } from 'unpdf';

const __dir = dirname(fileURLToPath(import.meta.url));
const EDGE = 'https://kpjflntnotftpzffjbud.supabase.co/functions/v1/jeupharma-regen-referentiel';
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtwamZsbnRub3RmdHB6ZmZqYnVkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYyODg0MjMsImV4cCI6MjEwMTg2NDQyM30.mTjm86Thn6VUOAAJRWCsGMcR0Ip-qEP08fJdwUvKKEo';
const OPS = 'jp-regen-20261014-vocab-canonique';
const MAX_RCP = 90_000;
const ALLOWED_HOST = /^(https?:\/\/)?(base-donnees-publique\.medicaments\.gouv\.fr|www\.ema\.europa\.eu|ema\.europa\.eu)/i;

const inputArg = process.argv[2];
const INPUT = inputArg
  ? (isAbsolute(inputArg) ? inputArg : join(__dir, inputArg))
  : join(__dir, 'phase3_rcp_input.json');
const JOURNAL_JSON = join(__dir, 'phase3_rcp_journal.json');
const JOURNAL_MD = join(__dir, 'phase3_rcp_journal.md');
const NDJSON = join(__dir, 'phase3_rcp_progress.ndjson');

/** Skips documentés (pas de CIS mono FR utilisable / EMA non récupérable en ops) */
const DOCUMENTED_SKIPS = [
  {
    dci: 'Chlortalidone',
    cis: null,
    source: null,
    status: 'skip',
    reason: 'no_cis_mono_fr — uniquement en asso (Tenoretic CIS 62980497) ; pas de création mono sans RCP mono',
    reused: 0,
    created: 0,
  },
  {
    dci: 'Altizide',
    cis: null,
    source: null,
    status: 'skip',
    reason: 'no_cis_mono_fr — uniquement en asso (Aldactazine CIS 69724251)',
    reused: 0,
    created: 0,
  },
  {
    dci: 'Méthyclothiazide',
    cis: null,
    source: null,
    status: 'skip',
    reason: 'no_cis_fr — search_products vide ; Prestol = triamtérène+HCT (pas méthyclothiazide)',
    reused: 0,
    created: 0,
  },
  {
    dci: 'Sacubitril',
    cis: null,
    source: null,
    status: 'skip',
    reason: 'no_cis_mono_fr — uniquement complexe Entresto (sacubitril+valsartan)',
    reused: 0,
    created: 0,
  },
  {
    dci: 'Sulfate ferreux',
    cis: '61879666',
    source: 'proxy_sels_ferreux',
    status: 'skip_create_proxy',
    reason: 'proxy → fiche existante Sels ferreux (Tardyferon CIS 61879666) ; pas de 2e mono',
    reused: 1,
    created: 0,
  },
  {
    dci: 'Aspirine',
    cis: null,
    source: 'proxy_aas',
    status: 'skip_create_proxy',
    reason: 'mapper → Acide acétylsalicylique existant (déjà densifié)',
    reused: 1,
    created: 0,
  },
  {
    dci: 'Désirudine',
    matrice_id: '15dace8a-f7b8-4d7e-b388-8eb9a860fee1',
    cis: null,
    source: null,
    status: 'skip',
    reason: 'manual_absent_bdm — Revasc absent BDM FR ; pas d’invention',
    reused: 0,
    created: 0,
  },
  {
    dci: 'Lépirudine',
    matrice_id: '7fd0485c-b7cb-445d-ac0f-3984eddb245e',
    cis: null,
    source: null,
    status: 'skip',
    reason: 'manual_absent_bdm — Refludan absent BDM FR',
    reused: 0,
    created: 0,
  },
  {
    dci: 'Éprosartan',
    matrice_id: '9a9eb95a-70fd-4871-ae36-c7f69200895c',
    cis: null,
    source: null,
    status: 'skip',
    reason: 'manual_absent_bdm — Teveten absent BDM FR',
    reused: 0,
    created: 0,
  },
  {
    dci: 'Rétéplase',
    matrice_id: '6f8158c7-8836-4a76-a636-9800c119443b',
    cis: null,
    source: null,
    status: 'skip',
    reason: 'manual_absent_bdm — Rapilysin/reteplase absent BDM FR',
    reused: 0,
    created: 0,
  },
  {
    dci: 'Streptokinase',
    matrice_id: '04463bf2-ee7e-4e61-a864-9383bd77524b',
    cis: null,
    source: null,
    status: 'skip',
    reason: 'manual_absent_bdm — Streptase absent BDM FR',
    reused: 0,
    created: 0,
  },
  {
    dci: 'Ruscoside',
    matrice_id: '474ef71c-3530-45fe-82d4-22be995087c4',
    cis: null,
    source: null,
    status: 'skip',
    reason: 'manual_absent_bdm — Cirkan/ruscoside absent ; hits Ruscus = homéopathie (rejeté)',
    reused: 0,
    created: 0,
  },
  {
    dci: 'Alginate de calcium',
    matrice_id: 'c63e3099-8a74-42bf-9b33-efd88ab29da1',
    cis: '63517694',
    source: null,
    status: 'skip',
    reason: 'cis_suspect — CIS alginate/sodium 63517694 ≠ pansement calcique',
    reused: 0,
    created: 0,
  },
  {
    dci: 'Nébivolol + hydrochlorothiazide',
    matrice_id: '43e31250-8f71-4538-be5f-ba4aa4d47d9c',
    cis: '67856966',
    source: null,
    status: 'skip',
    reason: 'cis_suspect + no_asso_cis_fr — 67856966 = nébivolol mono ; search asso HCT vide',
    reused: 0,
    created: 0,
  },
  {
    dci: 'Triamtérène + méthyclothiazide',
    matrice_id: '694ce30c-89bd-47be-9434-acfc2fffa602',
    cis: '63870751',
    source: null,
    status: 'skip',
    reason: 'cis_suspect — 63870751 Prestol = triamtérène+HCT (pas méthyclothiazide) ; pas de spécialité FR méthyclothiazide',
    reused: 0,
    created: 0,
  },
];

/** Backfills composants déjà / à tracer */
const COMPOSANT_BACKFILLS = [
  {
    asso: 'Clopidogrel + aspirine',
    matrice_id: '04061350-4766-4925-9f69-09681a21de92',
    composant_dci: 'Acide acétylsalicylique',
    composant_matrice_id: 'de52a954-d5c1-434a-ab55-df2d6af685d3',
    ordre: 1,
    note: 'aspirine → AAS',
  },
  {
    asso: 'Acide ascorbique + sulfate ferreux',
    matrice_id: 'a19b0c1d-7c86-4b55-b27f-c134be7828db',
    composant_dci: 'Sels ferreux',
    composant_matrice_id: 'd122d669-2f7c-48ed-a517-aa6e4bd765b8',
    ordre: 1,
    note: 'sulfate ferreux → proxy sels ferreux',
  },
];

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
    '4.1': 'Indications', '4.2': 'Posologie', '4.3': 'CI', '4.4': 'Précautions',
    '4.5': 'Interactions', '4.6': 'Grossesse', '4.8': 'EI', '5.1': 'Pharmacodynamie',
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
  if (!ALLOWED_HOST.test(pdfUrl)) throw new Error(`URL hors allowlist: ${pdfUrl.slice(0, 80)}`);
  const res = await fetch(pdfUrl, {
    headers: { 'User-Agent': 'JeuPharma-phase3/1.0' },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`PDF HTTP ${res.status}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  const pdf = await getDocumentProxy(buf);
  const extracted = await extractText(pdf, { mergePages: true });
  let text = String(extracted.text || '');
  const iAnnexe = text.search(/R[ÉE]SUM[ÉE] DES CARACT[ÉE]RISTIQUES DU PRODUIT/i);
  if (iAnnexe >= 0) text = text.slice(iAnnexe);
  const iNotice = text.search(/\nANNEXE III\b|\nB\.\s*NOTICE\b/i);
  if (iNotice > 2000) text = text.slice(0, iNotice);
  text = text.replace(/\s+/g, ' ').trim().slice(0, MAX_RCP);
  return { text, total: text.length, url: pdfUrl };
}

async function fetchRcp(cis) {
  const url = `https://base-donnees-publique.medicaments.gouv.fr/medicament/${cis}/extrait`;
  const res = await fetch(url, { headers: { 'User-Agent': 'JeuPharma-phase3/1.0' } });
  if (!res.ok) throw new Error(`ANSM HTTP ${res.status}`);
  const html = await res.text();
  const fromHtml = sectionsToText(extractAnsmSections(html));
  if (fromHtml.total >= 80) return { ...fromHtml, source: 'ansm_html', url, cis };
  const m = html.match(/href="([^"]*epar[^"]*\.pdf)"/i)
    || html.match(/href="(https:\/\/www\.ema\.europa\.eu[^"]*product-information[^"]*\.pdf)"/i);
  if (m) {
    const pdfUrl = m[1].startsWith('http') ? m[1] : `https://www.ema.europa.eu${m[1]}`;
    if (!ALLOWED_HOST.test(pdfUrl)) throw new Error(`EPAR hors allowlist`);
    const pdf = await fetchPdfText(pdfUrl);
    if (pdf.total >= 80) return { text: pdf.text, total: pdf.total, source: 'epar_pdf', url: pdfUrl, cis };
  }
  return { text: '', total: 0, source: 'vide', url, cis };
}

async function applyOne({ matrice_id, dci, cis, rcp_text, source }) {
  if (!['ansm_html', 'epar_pdf', 'ansm_epar_link'].includes(source) && !String(source).startsWith('ansm')) {
    // allow only official labels
  }
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

const journal = {
  phase: 3,
  title: 'Cardio DEUST — RCP référentiel (allowlist BDPM/EMA)',
  started_at: new Date().toISOString(),
  rules: {
    sources: ['base-donnees-publique.medicaments.gouv.fr', 'ema.europa.eu'],
    no_invention: true,
    ei: 'frequents_ou_rares_graves_si_RCP',
  },
  entries: [],
  composants_backfill: COMPOSANT_BACKFILLS,
  totals: { ok: 0, skip: 0, proxy: 0, error: 0, reused: 0, created: 0 },
};

for (const s of DOCUMENTED_SKIPS) {
  const entry = {
    dci: s.dci,
    matrice_id: s.matrice_id || null,
    cis: s.cis,
    source: s.source,
    reused: s.reused,
    created: s.created,
    status: s.status,
    reason: s.reason,
  };
  journal.entries.push(entry);
  if (s.status === 'skip') journal.totals.skip += 1;
  else if (s.status === 'skip_create_proxy') journal.totals.proxy += 1;
  await appendFile(NDJSON, JSON.stringify({ ...entry, at: new Date().toISOString() }) + '\n');
}

const raw = JSON.parse(await readFile(INPUT, 'utf8'));
const queue = Array.isArray(raw) ? raw : raw.queue || [];
console.log(`Phase 3 enrichissements : ${queue.length} (+ ${DOCUMENTED_SKIPS.length} skips documentés)`);

for (let i = 0; i < queue.length; i++) {
  const row = queue[i];
  const label = `[${i + 1}/${queue.length}] ${row.dci}`;
  console.log(label, row.cis_fixed || '');
  try {
    const cis = String(row.cis_fixed || '').replace(/\D/g, '');
    if (!cis) {
      const entry = {
        dci: row.dci,
        matrice_id: row.matrice_id,
        cis: null,
        source: null,
        reused: 0,
        created: 0,
        status: 'skip',
        reason: 'no_cis_in_input',
      };
      journal.entries.push(entry);
      journal.totals.skip += 1;
      await appendFile(NDJSON, JSON.stringify({ ...entry, at: new Date().toISOString() }) + '\n');
      continue;
    }
    const rcp = await fetchRcp(cis);
    if (rcp.total < 80) {
      const entry = {
        dci: row.dci,
        matrice_id: row.matrice_id,
        cis,
        source: rcp.source,
        reused: 0,
        created: 0,
        status: 'skip',
        reason: `rcp_vide (${rcp.url})`,
        url: rcp.url,
      };
      journal.entries.push(entry);
      journal.totals.skip += 1;
      await appendFile(NDJSON, JSON.stringify({ ...entry, at: new Date().toISOString() }) + '\n');
      console.log('  → SKIP rcp_vide');
      continue;
    }
    console.log(`  → RCP ${rcp.source} len=${rcp.total}`);
    const data = await applyOne({
      matrice_id: row.matrice_id,
      dci: row.dci,
      cis,
      rcp_text: rcp.text,
      source: rcp.source,
    });
    const okRow = (data.ok && data.ok[0]) || {};
    const reused = okRow.stats?.reused ?? okRow.reused ?? 0;
    const created = okRow.stats?.created ?? okRow.created_n ?? 0;
    const entry = {
      dci: row.dci,
      matrice_id: row.matrice_id,
      cis,
      source: rcp.source,
      url: rcp.url,
      reused,
      created,
      status: 'ok',
      note: row.note || null,
      publish_after: !!row.publish_after,
    };
    journal.entries.push(entry);
    journal.totals.ok += 1;
    journal.totals.reused += reused;
    journal.totals.created += created;
    await appendFile(NDJSON, JSON.stringify({ ...entry, at: new Date().toISOString() }) + '\n');
    console.log('  → OK', { reused, created });
    await new Promise((r) => setTimeout(r, 1200));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const entry = {
      dci: row.dci,
      matrice_id: row.matrice_id,
      cis: row.cis_fixed || null,
      source: null,
      reused: 0,
      created: 0,
      status: 'error',
      reason: msg.slice(0, 400),
    };
    journal.entries.push(entry);
    journal.totals.error += 1;
    await appendFile(NDJSON, JSON.stringify({ ...entry, at: new Date().toISOString() }) + '\n');
    console.log('  → ERR', msg.slice(0, 160));
    await new Promise((r) => setTimeout(r, 2000));
  }
}

journal.finished_at = new Date().toISOString();
await writeFile(JOURNAL_JSON, JSON.stringify(journal, null, 2), 'utf8');

const md = [
  '# Phase 3 — Journal RCP Cardio DEUST',
  '',
  `Date : ${journal.finished_at}`,
  `Sources : ${journal.rules.sources.join(' | ')}`,
  '',
  '## Totaux',
  '',
  `| Statut | N |`,
  `|--------|---|`,
  `| OK enrichis | ${journal.totals.ok} |`,
  `| Skip documentés | ${journal.totals.skip} |`,
  `| Proxy (pas de create) | ${journal.totals.proxy} |`,
  `| Erreurs | ${journal.totals.error} |`,
  `| Entités réutilisées | ${journal.totals.reused} |`,
  `| Entités créées | ${journal.totals.created} |`,
  '',
  '## Composants backfill',
  '',
  ...COMPOSANT_BACKFILLS.map(
    (c) => `- **${c.asso}** ← ${c.composant_dci} (\`${c.composant_matrice_id}\`) — ${c.note}`,
  ),
  '',
  '## Entrées',
  '',
  '| DCI | CIS | Source | reused | created | status |',
  '|-----|-----|--------|--------|---------|--------|',
  ...journal.entries.map((e) =>
    `| ${e.dci} | ${e.cis || '—'} | ${e.source || '—'} | ${e.reused ?? 0} | ${e.created ?? 0} | ${e.status}${e.reason ? ` (${e.reason.slice(0, 80)})` : ''} |`,
  ),
  '',
  '## Monos non créés (règle anti-invention)',
  '',
  'Chlortalidone, Altizide, Méthyclothiazide, Sacubitril : **aucun CIS mono FR** → skip ; `matrice_composants` reste à 1 lien pour les assos concernées jusqu’à apparition d’un RCP mono officiel.',
  '',
  '## Hors scope',
  '',
  '- Pas de pubs leçon (Phase 2)',
  '- Pas de jeux (Phase 4)',
  '- Pas de QA E2E (Phase 5)',
  '',
].join('\n');
await writeFile(JOURNAL_MD, md, 'utf8');
console.log('DONE', journal.totals, JOURNAL_JSON);
