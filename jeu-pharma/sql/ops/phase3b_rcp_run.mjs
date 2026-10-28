#!/usr/bin/env node
/**
 * Phase 3b — densités faibles + assos 1 composant (Cardio DEUST).
 * Sources ONLY : base-donnees-publique.medicaments.gouv.fr puis ema.europa.eu
 * Apply : Edge jeupharma-regen-referentiel apply_one (réutilise entités).
 * Monos manquants : créer SEULEMENT si RCP mono FR/EMA — sinon skip documenté.
 *
 * Usage : node sql/ops/phase3b_rcp_run.mjs [--only=desirudine,idarucizumab]
 */
import { writeFile, appendFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractText, getDocumentProxy } from 'unpdf';

const __dir = dirname(fileURLToPath(import.meta.url));
const EDGE = 'https://kpjflntnotftpzffjbud.supabase.co/functions/v1/jeupharma-regen-referentiel';
const BDM = 'https://kpjflntnotftpzffjbud.supabase.co/rest/v1/rpc/search_products';
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtwamZsbnRub3RmdHB6ZmZqYnVkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYyODg0MjMsImV4cCI6MjEwMTg2NDQyM30.mTjm86Thn6VUOAAJRWCsGMcR0Ip-qEP08fJdwUvKKEo';
const OPS = 'jp-regen-20261014-vocab-canonique';
const MAX_RCP = 90_000;
const ALLOWED_HOST =
  /^(https?:\/\/)?(base-donnees-publique\.medicaments\.gouv\.fr|www\.ema\.europa\.eu|ema\.europa\.eu)/i;

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

const JOURNAL_JSON = join(__dir, 'phase3b_rcp_journal.json');
const JOURNAL_MD = join(__dir, 'phase3b_rcp_journal.md');
const NDJSON = join(__dir, 'phase3b_rcp_progress.ndjson');

function normKey(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchPdfText(pdfUrl) {
  if (!ALLOWED_HOST.test(pdfUrl)) throw new Error(`URL hors allowlist: ${pdfUrl.slice(0, 80)}`);
  const res = await fetch(pdfUrl, {
    headers: { 'User-Agent': 'JeuPharma-phase3b/1.0' },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`PDF HTTP ${res.status}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  const pdf = await getDocumentProxy(buf);
  const extracted = await extractText(pdf, { mergePages: true });
  let text = String(extracted.text || '');
  const iAnnexe = text.search(
    /R[ÉE]SUM[ÉE] DES CARACT[ÉE]RISTIQUES DU PRODUIT|SUMMARY OF PRODUCT CHARACTERISTICS/i,
  );
  if (iAnnexe >= 0) text = text.slice(iAnnexe);
  const iNotice = text.search(/\nANNEXE III\b|\nB\.\s*NOTICE\b|\nB\.\s*PACKAGE LEAFLET\b/i);
  if (iNotice > 2000) text = text.slice(0, iNotice);
  text = text.replace(/\s+/g, ' ').trim().slice(0, MAX_RCP);
  return { text, total: text.length, url: pdfUrl };
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

/** Jobs Phase 3b */
const JOBS = [
  {
    kind: 'enrich_ema',
    matrice_id: '15dace8a-f7b8-4d7e-b388-8eb9a860fee1',
    dci: 'Désirudine',
    ema_pdf: 'https://www.ema.europa.eu/fr/documents/product-information/revasc-epar-product-information_fr.pdf',
    ema_pdf_fallback: [
      'https://www.ema.europa.eu/en/documents/product-information/revasc-epar-product-information_en.pdf',
    ],
    note: 'Revasc EPAR FR (AMM retirée) — densités CI/EI',
  },
  {
    kind: 'enrich_ema',
    matrice_id: '7fd0485c-b7cb-445d-ac0f-3984eddb245e',
    dci: 'Lépirudine',
    ema_pdf: 'https://www.ema.europa.eu/fr/documents/product-information/refludan-epar-product-information_fr.pdf',
    ema_pdf_fallback: [
      'https://www.ema.europa.eu/en/documents/product-information/refludan-epar-product-information_en.pdf',
    ],
    note: 'Refludan EPAR FR (AMM retirée) — densités CI/EI',
  },
  {
    kind: 'enrich_ema',
    matrice_id: '6f8158c7-8836-4a76-a636-9800c119443b',
    dci: 'Rétéplase',
    ema_pdf: 'https://www.ema.europa.eu/fr/documents/product-information/rapilysin-epar-product-information_fr.pdf',
    ema_pdf_fallback: [
      'https://www.ema.europa.eu/en/documents/product-information/rapilysin-epar-product-information_en.pdf',
    ],
    note: 'Rapilysin EPAR FR (AMM retirée 2024)',
  },
  {
    kind: 'enrich_ema',
    matrice_id: 'a446fae6-94e0-4179-94b8-ecc7cbe0d9f7',
    dci: 'Idarucizumab',
    cis: '63555182',
    ema_pdf: 'https://www.ema.europa.eu/fr/documents/product-information/praxbind-epar-product-information_fr.pdf',
    note: 'Praxbind — re-apply CI (n_ci=0 après phase3)',
  },
  {
    kind: 'try_bdm_then_skip',
    matrice_id: '04463bf2-ee7e-4e61-a864-9383bd77524b',
    dci: 'Streptokinase',
    queries: ['streptokinase', 'streptase'],
    note: 'BDM FR vide ; pas d’EPAR EMA centralisé → skip',
  },
  {
    kind: 'try_bdm_then_skip',
    matrice_id: '474ef71c-3530-45fe-82d4-22be995087c4',
    dci: 'Ruscoside',
    queries: ['cirkan', 'ruscoside', 'ruscus'],
    note: 'Cirkan absent ; hits Ruscus = homéopathie (rejeté)',
    require_mono_substance: true,
    reject_if: (h) => /homeopath|homéopath|pour preparations homeopath/i.test(
      `${h.substances || ''} ${h.denomination || ''}`,
    ),
  },
  // Monos assos — créer seulement si RCP mono
  {
    kind: 'try_create_mono',
    dci: 'Chlortalidone',
    queries: ['chlortalidone', 'hygton', 'hygroton'],
    require_mono_substance: true,
    note: 'Partenaire Aténolol/Métoprolol+chlortalidone ; Tenoretic = asso seulement',
    backfill_assos: [
      { asso_id: 'c9c50626-455d-4837-a3c8-fcba7be16aad', dci_asso: 'Aténolol + chlortalidone', ordre: 1 },
      { asso_id: 'a6aad096-0a5d-4841-a2e4-77dc1ffbad7a', dci_asso: 'Métoprolol + chlortalidone', ordre: 1 },
    ],
  },
  {
    kind: 'try_create_mono',
    dci: 'Altizide',
    queries: ['altizide'],
    require_mono_substance: true,
    note: 'Partenaire Spironolactone+altizide ; Aldactazine = asso seulement',
    backfill_assos: [
      { asso_id: 'c0fd1199-5e18-4edb-b686-4cdfa41330c8', dci_asso: 'Spironolactone + altizide', ordre: 1 },
    ],
  },
  {
    kind: 'try_create_mono',
    dci: 'Méthyclothiazide',
    queries: ['methyclothiazide', 'méthyclothiazide', 'isobar'],
    require_mono_substance: true,
    note: 'Partenaire Triamtérène+méthyclothiazide ; Prestol = triam+HCT (suspect)',
    backfill_assos: [
      { asso_id: '694ce30c-89bd-47be-9434-acfc2fffa602', dci_asso: 'Triamtérène + méthyclothiazide', ordre: 1 },
    ],
  },
  {
    kind: 'try_create_mono',
    dci: 'Sacubitril',
    queries: ['sacubitril'],
    require_mono_substance: true,
    note: 'Partenaire Sacubitril+valsartan ; Entresto = complexe (pas mono). Valsartan déjà lié.',
    reject_if: (h) => /valsartan|complexe/i.test(`${h.substances || ''} ${h.denomination || ''}`),
    backfill_assos: [
      { asso_id: '0415e982-3813-4b5c-8534-e93933343ce8', dci_asso: 'Sacubitril + valsartan', ordre: 0 },
    ],
    confirm_valsartan_link: {
      asso_id: '0415e982-3813-4b5c-8534-e93933343ce8',
      composant_matrice_id: '0130eef2-c8af-4d30-9370-5e61b8215d0d',
      composant_dci: 'Valsartan',
    },
  },
];

const journal = {
  started_at: new Date().toISOString(),
  project: 'kpjflntnotftpzffjbud',
  phase: '3b',
  rule: 'Sources ONLY base-donnees-publique.medicaments.gouv.fr puis ema.europa.eu ; réutiliser entités ; pas d’invention',
  ok: [],
  skip: [],
  errors: [],
  monos: [],
  composants: [],
};

async function logProgress(row) {
  await appendFile(NDJSON, JSON.stringify({ ...row, at: new Date().toISOString() }) + '\n');
}

function shouldRun(job) {
  if (!ONLY.size) return true;
  return ONLY.has(normKey(job.dci)) || ONLY.has(String(job.dci).toLowerCase());
}

async function resolveEma(job) {
  const urls = [job.ema_pdf, ...(job.ema_pdf_fallback || [])].filter(Boolean);
  let lastErr = null;
  for (const url of urls) {
    try {
      const pdf = await fetchPdfText(url);
      if (pdf.total >= 80) {
        return { text: pdf.text, total: pdf.total, source: 'ema_epar_pdf', url, cis: job.cis || null };
      }
    } catch (e) {
      lastErr = e;
    }
  }
  if (lastErr) throw lastErr;
  return null;
}

function isMonoHit(h, job) {
  const subst = String(h.substances || '');
  const parts = subst
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (job.require_mono_substance && parts.length !== 1) return false;
  if (job.reject_if && job.reject_if(h)) return false;
  return true;
}

async function tryBdmRcp(job) {
  for (const q of job.queries || []) {
    const hits = await searchProducts(q, 10);
    for (const h of hits) {
      if (!isMonoHit(h, job)) continue;
      const cis = String(h.cis || '').replace(/\D/g, '');
      if (!cis) continue;
      // Fetch ANSM extrait
      const url = `https://base-donnees-publique.medicaments.gouv.fr/medicament/${cis}/extrait`;
      const res = await fetch(url, { headers: { 'User-Agent': 'JeuPharma-phase3b/1.0' } });
      if (!res.ok) continue;
      const html = await res.text();
      // Prefer EPAR link if HTML sections thin
      const m =
        html.match(/href="([^"]*epar[^"]*\.pdf)"/i) ||
        html.match(/href="(https:\/\/www\.ema\.europa\.eu[^"]*product-information[^"]*\.pdf)"/i);
      if (m) {
        const pdfUrl = m[1].startsWith('http') ? m[1] : `https://www.ema.europa.eu${m[1]}`;
        try {
          const pdf = await fetchPdfText(pdfUrl);
          if (pdf.total >= 80) {
            return { text: pdf.text, total: pdf.total, source: 'epar_pdf', url: pdfUrl, cis, hit: h };
          }
        } catch {
          /* next */
        }
      }
      // crude HTML length check — sections extraction handled by Edge if we pass full cleaned text
      const cleaned = html
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, MAX_RCP);
      if (cleaned.length >= 500 && /contre-indication|indication thérapeutique/i.test(cleaned)) {
        return { text: cleaned, total: cleaned.length, source: 'ansm_html', url, cis, hit: h };
      }
    }
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
    stats: okRow.stats || data.stats || null,
  };
  journal.ok.push(entry);
  await logProgress({ status: 'ok', ...entry });
  console.log('  → OK', rcp.source, 'len', rcp.total, entry.stats || '');
}

console.log('Phase 3b RCP — démarrage', new Date().toISOString());
console.log('Jobs:', JOBS.length, ONLY.size ? `(only ${[...ONLY]})` : '');

for (let i = 0; i < JOBS.length; i++) {
  const job = JOBS[i];
  if (!shouldRun(job)) continue;
  console.log(`[${i + 1}/${JOBS.length}] ${job.kind} — ${job.dci}`);
  try {
    if (job.kind === 'enrich_ema') {
      const rcp = await resolveEma(job);
      if (!rcp || rcp.total < 80) {
        const s = { dci: job.dci, reason: 'ema_rcp_vide', note: job.note, matrice_id: job.matrice_id };
        journal.skip.push(s);
        await logProgress({ status: 'skip', ...s });
        console.log('  → SKIP ema_rcp_vide');
        continue;
      }
      await runEnrich(job, rcp);
      await new Promise((r) => setTimeout(r, 1200));
      continue;
    }

    if (job.kind === 'try_bdm_then_skip') {
      const rcp = await tryBdmRcp(job);
      if (!rcp || rcp.total < 80) {
        const s = {
          dci: job.dci,
          reason: 'no_cis_or_rcp_vide',
          note: job.note,
          matrice_id: job.matrice_id,
        };
        journal.skip.push(s);
        await logProgress({ status: 'skip', ...s });
        console.log('  → SKIP', s.reason);
        continue;
      }
      await runEnrich(job, rcp);
      await new Promise((r) => setTimeout(r, 1200));
      continue;
    }

    if (job.kind === 'try_create_mono') {
      if (job.confirm_valsartan_link) {
        journal.composants.push({
          status: 'already_linked',
          ...job.confirm_valsartan_link,
          note: 'Valsartan déjà en matrice_composants pour Sacubitril+valsartan',
        });
      }
      const rcp = await tryBdmRcp(job);
      if (!rcp || rcp.total < 80) {
        // Also try EMA mono search is out of scope without known PDF URL — skip
        const s = {
          dci: job.dci,
          reason: 'no_cis_mono_fr_ema',
          note: job.note,
          backfill_assos_pending: (job.backfill_assos || []).map((b) => b.dci_asso),
        };
        journal.skip.push(s);
        journal.monos.push({ dci: job.dci, status: 'not_created', reason: s.reason });
        await logProgress({ status: 'skip', ...s });
        console.log('  → SKIP no_cis_mono — pas de création');
        continue;
      }
      // RCP mono trouvé → pending SQL create (service role) + document
      const pending = {
        dci: job.dci,
        cis: rcp.cis,
        url: rcp.url,
        source: rcp.source,
        rcp_len: rcp.total,
        backfill_assos: job.backfill_assos || [],
        note: job.note,
        status: 'pending_sql_create',
      };
      journal.monos.push(pending);
      await writeFile(
        join(__dir, `phase3b_pending_mono_${normKey(job.dci).replace(/\s+/g, '_')}.json`),
        JSON.stringify({ ...pending, rcp_text: rcp.text }, null, 2),
        'utf8',
      );
      await logProgress({ status: 'pending_mono', dci: job.dci, cis: rcp.cis, len: rcp.total });
      console.log('  → PENDING mono create cis=', rcp.cis, 'len=', rcp.total);
      continue;
    }

    journal.errors.push({ dci: job.dci, error: `kind inconnu: ${job.kind}` });
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
  monos_pending: journal.monos.filter((x) => x.status === 'pending_sql_create').length,
  monos_not_created: journal.monos.filter((x) => x.status === 'not_created').length,
};

await writeFile(JOURNAL_JSON, JSON.stringify(journal, null, 2), 'utf8');

const md = [
  '# Phase 3b — Journal RCP densités faibles + assos 1 composant',
  '',
  `**Date** : ${journal.started_at} → ${journal.finished_at}`,
  `**Projet** : \`${journal.project}\``,
  `**Parcours** : \`cardiovasculaires_deust_2a\``,
  `**Règle** : ${journal.rule}`,
  '',
  '## Compteurs',
  '',
  `| Statut | Nb |`,
  `|--------|----|`,
  `| OK enrichis | ${journal.totals.ok} |`,
  `| Skip documentés | ${journal.totals.skip} |`,
  `| Erreurs | ${journal.totals.errors} |`,
  `| Monos pending SQL | ${journal.totals.monos_pending} |`,
  `| Monos non créés | ${journal.totals.monos_not_created} |`,
  '',
  '## OK enrichis (EMA / BDM)',
  '',
  ...(journal.ok.length
    ? journal.ok.map(
        (r) =>
          `- **${r.dci}** — CIS \`${r.cis || '—'}\` — source \`${r.source}\`${r.url ? ` — ${r.url}` : ''}${
            r.stats ? ` — reused ${r.stats.reused}/created ${r.stats.created}` : ''
          }${r.note ? ` — _${r.note}_` : ''}`,
      )
    : ['*(aucun)*']),
  '',
  '## Skips documentés',
  '',
  ...(journal.skip.length
    ? journal.skip.map((r) => `- **${r.dci}** — \`${r.reason}\` — ${r.note || ''}`)
    : ['*(aucun)*']),
  '',
  '## Monos composants assos',
  '',
  ...(journal.monos.length
    ? journal.monos.map(
        (r) =>
          `- **${r.dci}** — ${r.status}${r.cis ? ` — CIS \`${r.cis}\`` : ''}${r.reason ? ` — ${r.reason}` : ''} — ${r.note || ''}`,
      )
    : ['*(aucun)*']),
  '',
  '## Composants (liens)',
  '',
  ...(journal.composants.length
    ? journal.composants.map(
        (r) =>
          `- **${r.composant_dci || r.status}** sur asso \`${r.asso_id}\` — ${r.note || r.status}`,
      )
    : ['*(aucun nouveau — Sacubitril+valsartan : Valsartan déjà lié)*']),
  '',
  '## Erreurs',
  '',
  ...(journal.errors.length
    ? journal.errors.map((r) => `- **${r.dci}** — ${r.error}`)
    : ['*(aucune)*']),
  '',
  '## Hors scope',
  '',
  '- Pas de pubs leçons / UI leçon-player.',
  '- Pas de création mono sans CIS/RCP mono officiel.',
  '',
];
await writeFile(JOURNAL_MD, md.join('\n'), 'utf8');

console.log('DONE', journal.totals);
console.log('Journal:', JOURNAL_MD);
