#!/usr/bin/env node
/**
 * Retry local intelligent des skips référentiel.
 * - Résout CIS (allowlist + marques + search_products via Edge apply / fetch ANSM)
 * - RCP : HTML ANSM AmmAnnexe, sinon EPAR PDF (unpdf local)
 * - Applique via Edge apply_one (Gemini + ops_entite_find_or_create)
 *
 * Usage : node sql/ops/retry_skips_local.mjs [input.json] [report_suffix]
 * Prérequis : unpdf installé (npm i unpdf --no-save déjà fait)
 * Ex. : node sql/ops/retry_skips_local.mjs retry_skips_input_r2_tech.json r2_tech
 */
import { readFile, writeFile, appendFile } from 'node:fs/promises';
import { join, dirname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractText, getDocumentProxy } from 'unpdf';

const __dir = dirname(fileURLToPath(import.meta.url));
const EDGE = 'https://kpjflntnotftpzffjbud.supabase.co/functions/v1/jeupharma-regen-referentiel';
const BDM = 'https://kpjflntnotftpzffjbud.supabase.co/rest/v1/rpc/search_products';
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtwamZsbnRub3RmdHB6ZmZqYnVkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYyODg0MjMsImV4cCI6MjEwMTg2NDQyM30.mTjm86Thn6VUOAAJRWCsGMcR0Ip-qEP08fJdwUvKKEo';
const OPS = 'jp-regen-20261014-vocab-canonique';
const MAX_RCP = 90_000;
const inputArg = process.argv[2];
const reportSuffix = process.argv[3] || '';
const SKIPS_FILE = inputArg
  ? (isAbsolute(inputArg) ? inputArg : join(__dir, inputArg))
  : join(__dir, 'retry_skips_input.json');
const REPORT = join(__dir, reportSuffix ? `retry_skips_local_report_${reportSuffix}.json` : 'retry_skips_local_report.json');
const NDJSON = join(__dir, reportSuffix ? `retry_skips_local_progress_${reportSuffix}.ndjson` : 'retry_skips_local_progress.ndjson');

const CIS_ALLOW = {
  'sels ferreux': '61879666',
  'sels ferreux + acide folique': '64875192',
  'heparinate de sodium': '64395923',
  'heparinate de calcium': '69636132',
  'immunoglobulines anti-d': '62468162',
  'isosorbide dinitrate': '60172339',
  apixaban: '61902218',
  rivaroxaban: '64206365',
  sotalol: '62519799',
  ivabradine: '60549911',
  dapagliflozine: '67456363',
  'ginkgo biloba': '60287373',
  idarucizumab: '63555182',
  tenecteplase: '65088998',
  filgrastim: '61823354',
  'darbepoetine alfa': '66066271',
  'epoetine alfa': '67610861',
  'epoetine beta': '66823618',
  'sacubitril + valsartan': '65122144',
  'clopidogrel + aspirine': '61952274',
  'perindopril + amlodipine': '60657997',
  'bisoprolol + hydrochlorothiazide': '67460027',
  'valsartan + hydrochlorothiazide': '67481950',
  'losartan + hydrochlorothiazide': '65214977',
  'irbesartan + hydrochlorothiazide': '61547030',
  'candesartan + hydrochlorothiazide': '66950291',
  'olmesartan + hydrochlorothiazide': '66838901',
  'telmisartan + hydrochlorothiazide': '60570229',
  'ramipril + hydrochlorothiazide': '67103203',
  'enalapril + hydrochlorothiazide': '69155138',
  'lisinopril + hydrochlorothiazide': '66434780',
  'amlodipine + atorvastatine': '65364681',
  'valsartan + amlodipine': '60058008',
  'olmesartan + amlodipine': '67023718',
  'telmisartan + amlodipine': '67700337',
  'enalapril + lercanidipine': '69974066',
  'amlodipine + indapamide': '60345218',
  'verapamil + trandolapril': '62404028',
  'atenolol + chlortalidone': '62980497',
  'felodipine + metoprolol': '61950444',
  'amiloride + hydrochlorothiazide': '68045361',
  'spironolactone + altizide': '69724251',
  'triamterene + hydrochlorothiazide': '63870751',
  'benazepril + hydrochlorothiazide': '61591226',
  'captopril + hydrochlorothiazide': '60214350',
  'fosinopril + hydrochlorothiazide': '67017829',
  'quinapril + hydrochlorothiazide': '62927128',
  'timolol + amiloride + hydrochlorothiazide': '64343809',
};

const SEARCH_ALIASES = {
  'sels ferreux': ['tardyferon', 'sulfate ferreux'],
  'sels ferreux + acide folique': ['tardyferon b9'],
  'heparinate de calcium': ['calciparine', 'heparine calcique'],
  'heparinate de sodium': ['heparine sodique'],
  'immunoglobulines anti-d': ['rhophylac'],
  'isosorbide dinitrate': ['isocard', 'risordan'],
  'sacubitril + valsartan': ['entresto'],
  'clopidogrel + aspirine': ['duoplavin'],
  'perindopril + amlodipine': ['coveram'],
  'bisoprolol + hydrochlorothiazide': ['lodoz'],
  'valsartan + hydrochlorothiazide': ['cotareg'],
  'losartan + hydrochlorothiazide': ['fortzaar'],
  'irbesartan + hydrochlorothiazide': ['coaprovel'],
  'candesartan + hydrochlorothiazide': ['atacand plus'],
  'olmesartan + hydrochlorothiazide': ['coolmetec'],
  'telmisartan + hydrochlorothiazide': ['micardisplus'],
  'ramipril + hydrochlorothiazide': ['triatec'],
  'enalapril + hydrochlorothiazide': ['co-renitec'],
  'lisinopril + hydrochlorothiazide': ['zestoretic'],
  'amlodipine + atorvastatine': ['caduet'],
  'valsartan + amlodipine': ['exforge'],
  'olmesartan + amlodipine': ['sevikar'],
  'telmisartan + amlodipine': ['twynsta'],
  'enalapril + lercanidipine': ['zanextra'],
  'amlodipine + indapamide': ['natrixam'],
  'verapamil + trandolapril': ['tarka'],
  'atenolol + chlortalidone': ['tenoretic'],
  'felodipine + metoprolol': ['logimax'],
  'amiloride + hydrochlorothiazide': ['moduretic'],
  'spironolactone + altizide': ['aldactazine'],
  'triamterene + hydrochlorothiazide': ['prestol'],
  'benazepril + hydrochlorothiazide': ['cibadrex'],
  'captopril + hydrochlorothiazide': ['captea'],
  'fosinopril + hydrochlorothiazide': ['foziretic'],
  'quinapril + hydrochlorothiazide': ['acuitel'],
  'zofenopril + hydrochlorothiazide': ['zofenil'],
  'timolol + amiloride + hydrochlorothiazide': ['moducren'],
  sotalol: ['sotalex'],
  'ginkgo biloba': ['tanakan'],
  apixaban: ['eliquis'],
  rivaroxaban: ['xarelto', 'rivaroxaban'],
  idarucizumab: ['praxbind'],
  tenecteplase: ['metalyse'],
  filgrastim: ['accofil', 'neupogen'],
  'darbepoetine alfa': ['aranesp'],
  'epoetine alfa': ['binocrit'],
  'epoetine beta': ['neorecormon'],
  ivabradine: ['procoralan', 'ivabradine'],
  dapagliflozine: ['forxiga'],
};

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

function scoreHit(h, parts) {
  let score = 0;
  const denom = String(h.denomination || '').toLowerCase();
  const subst = String(h.substances || '').toLowerCase();
  const forme = String(h.forme_pharmaceutique || '').toLowerCase();
  const etat = String(h.etat_commercialisation || '').toLowerCase();
  const blob = `${denom} ${subst} ${forme}`;
  if (etat.includes('commercialis')) score += 15;
  if (/comprim|gelule|capsule|orale|buvable/.test(blob)) score += 25;
  if (/inject|perfus|hom[eé]opath|boiron|lehning|dilution/.test(blob)) score -= 30;
  for (const p of parts) {
    if (p.length >= 3 && (subst.includes(p) || denom.includes(p))) score += 20;
  }
  if (parts.length >= 2) {
    if (parts.every((p) => subst.includes(p) || denom.includes(p))) score += 30;
  }
  return score;
}

async function pickCisList(dci) {
  const nk = normKey(dci);
  const out = [];
  const seen = new Set();
  const push = (cis, score, via) => {
    const c = String(cis || '').replace(/\D/g, '');
    if (!c || seen.has(c)) return;
    seen.add(c);
    out.push({ cis: c, score, via });
  };
  if (CIS_ALLOW[nk]) push(CIS_ALLOW[nk], 200, 'allow');
  const parts = nk.split(/\s*\+\s*/).map((p) => p.trim()).filter(Boolean);
  const queries = new Set([dci, nk.replace(/\+/g, ' '), ...(SEARCH_ALIASES[nk] || [])]);
  if (parts.length >= 2) {
    queries.add(parts.join(' '));
    queries.add(parts[0]);
  }
  for (const q of queries) {
    if (!q || q.length < 2) continue;
    const hits = await searchProducts(q, 10);
    for (const h of hits) push(h.cis, scoreHit(h, parts), `q:${q}`);
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, 6);
}

async function fetchPdfText(pdfUrl) {
  const res = await fetch(pdfUrl, {
    headers: { 'User-Agent': 'JeuPharma-retry/1.0' },
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
  const res = await fetch(url, { headers: { 'User-Agent': 'JeuPharma-retry/1.0' } });
  if (!res.ok) throw new Error(`ANSM HTTP ${res.status}`);
  const html = await res.text();
  const fromHtml = sectionsToText(extractAnsmSections(html));
  if (fromHtml.total >= 80) return { ...fromHtml, source: 'ansm_html', url, cis };
  const m = html.match(/href="([^"]*epar[^"]*\.pdf)"/i)
    || html.match(/href="(https:\/\/www\.ema\.europa\.eu[^"]*product-information[^"]*\.pdf)"/i);
  if (m) {
    const pdfUrl = m[1].startsWith('http') ? m[1] : `https://www.ema.europa.eu${m[1]}`;
    const pdf = await fetchPdfText(pdfUrl);
    if (pdf.total >= 80) return { text: pdf.text, total: pdf.total, source: 'epar_pdf', url: pdfUrl, cis };
  }
  return { text: '', total: 0, source: 'vide', url, cis };
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

async function markManual(row, reason) {
  // Via apply_one impossible ; on loggue localement. Upsert skip final via Edge retry would need service.
  // On enregistre dans le rapport ; SQL MCP pourra marquer *_manual ensuite.
  return { status: 'manual', dci: row.dci, reason };
}

const summary = {
  started_at: new Date().toISOString(),
  ok: [],
  manual: [],
  errors: [],
};

const raw = JSON.parse(await readFile(SKIPS_FILE, 'utf8'));
const skips = Array.isArray(raw) ? raw : raw.skips || [];
console.log(`Skips à traiter : ${skips.length}`);

for (let i = 0; i < skips.length; i++) {
  const row = skips[i];
  const label = `[${i + 1}/${skips.length}] ${row.dci}`;
  console.log(label, row.error);
  try {
    const cands = await pickCisList(row.dci);
    if (!cands.length) {
      const m = await markManual(row, 'no_cis');
      summary.manual.push(m);
      await appendFile(NDJSON, JSON.stringify({ ...m, at: new Date().toISOString() }) + '\n');
      console.log('  → MANUAL no_cis');
      continue;
    }
    let rcp = null;
    for (const c of cands) {
      try {
        const got = await fetchRcp(c.cis);
        if (got.total >= 80) {
          rcp = got;
          break;
        }
      } catch (e) {
        console.log('  cis fail', c.cis, e.message);
      }
    }
    if (!rcp) {
      const m = await markManual(row, `rcp_vide after ${cands.map((c) => c.cis).join(',')}`);
      summary.manual.push(m);
      await appendFile(NDJSON, JSON.stringify({ ...m, at: new Date().toISOString() }) + '\n');
      console.log('  → MANUAL rcp_vide');
      continue;
    }
    console.log(`  → RCP ${rcp.source} cis=${rcp.cis} len=${rcp.total}`);
    const data = await applyOne({
      matrice_id: row.matrice_id,
      dci: row.dci,
      cis: rcp.cis,
      rcp_text: rcp.text,
      source: rcp.source,
    });
    const okRow = (data.ok && data.ok[0]) || { dci: row.dci, status: 'ok', cis: rcp.cis, source: rcp.source };
    summary.ok.push(okRow);
    await appendFile(NDJSON, JSON.stringify({ ...okRow, at: new Date().toISOString() }) + '\n');
    console.log('  → OK');
    await new Promise((r) => setTimeout(r, 1200));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    summary.errors.push({ dci: row.dci, error: msg.slice(0, 400) });
    await appendFile(NDJSON, JSON.stringify({ dci: row.dci, error: msg, at: new Date().toISOString() }) + '\n');
    console.log('  → ERR', msg.slice(0, 120));
    await new Promise((r) => setTimeout(r, 2000));
  }
}

summary.finished_at = new Date().toISOString();
summary.totals = {
  ok: summary.ok.length,
  manual: summary.manual.length,
  errors: summary.errors.length,
};
await writeFile(REPORT, JSON.stringify(summary, null, 2), 'utf8');
console.log('DONE', summary.totals, REPORT);
