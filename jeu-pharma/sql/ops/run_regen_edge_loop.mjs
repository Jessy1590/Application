#!/usr/bin/env node
/**
 * Boucle d’appel Edge jeupharma-regen-referentiel (lots).
 * Usage : node sql/ops/run_regen_edge_loop.mjs
 */
import { appendFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const URL = 'https://kpjflntnotftpzffjbud.supabase.co/functions/v1/jeupharma-regen-referentiel';
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtwamZsbnRub3RmdHB6ZmZqYnVkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYyODg0MjMsImV4cCI6MjEwMTg2NDQyM30.mTjm86Thn6VUOAAJRWCsGMcR0Ip-qEP08fJdwUvKKEo';
const OPS = 'jp-regen-20261014-vocab-canonique';
const LIMIT = Number(process.env.REGEN_LIMIT || 4);
const MAX_ROUNDS = Number(process.env.REGEN_MAX_ROUNDS || 60);
const REPORT = join(__dir, 'regen_edge_loop_report.json');
const NDJSON = join(__dir, 'regen_edge_loop_progress.ndjson');

const summary = {
  started_at: new Date().toISOString(),
  rounds: [],
  totals: { ok: 0, errors: 0, skip: 0 },
};

async function oneRound(round) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 200_000);
  try {
    const res = await fetch(URL, {
      method: 'POST',
      headers: {
        apikey: ANON,
        Authorization: `Bearer ${ANON}`,
        'x-jeupharma-ops': OPS,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ limit: LIMIT, worst_first: true }),
      signal: ctrl.signal,
    });
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`Non-JSON HTTP ${res.status}: ${text.slice(0, 300)}`);
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${JSON.stringify(data).slice(0, 400)}`);
    return data;
  } finally {
    clearTimeout(t);
  }
}

for (let round = 1; round <= MAX_ROUNDS; round++) {
  console.log(`--- round ${round}/${MAX_ROUNDS} limit=${LIMIT} ---`);
  let data;
  try {
    data = await oneRound(round);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('ROUND FAIL', msg);
    summary.rounds.push({ round, error: msg });
    await appendFile(NDJSON, JSON.stringify({ round, error: msg }) + '\n');
    // pause puis retente
    await new Promise((r) => setTimeout(r, 5000));
    continue;
  }

  const okN = (data.ok || []).length;
  const errN = (data.errors || []).length;
  summary.totals.ok += okN;
  summary.totals.errors += errN;
  summary.totals.skip += (data.errors || []).filter((e) => e.status === 'skip').length;
  summary.rounds.push({
    round,
    processed: data.processed,
    remaining: data.remaining,
    done: data.done,
    ok: (data.ok || []).map((x) => x.dci),
    errors: (data.errors || []).map((x) => ({ dci: x.dci, error: x.error, status: x.status })),
  });
  await appendFile(NDJSON, JSON.stringify({ round, ...data, at: new Date().toISOString() }) + '\n');
  console.log(JSON.stringify({
    processed: data.processed,
    remaining: data.remaining,
    ok: okN,
    errors: errN,
    sample_ok: (data.ok || []).map((x) => x.dci).slice(0, 5),
    sample_err: (data.errors || []).map((x) => `${x.dci}:${x.error}`).slice(0, 3),
  }));

  if (data.done || data.processed === 0) {
    console.log('DONE');
    break;
  }
  await new Promise((r) => setTimeout(r, 1500));
}

summary.finished_at = new Date().toISOString();
await writeFile(REPORT, JSON.stringify(summary, null, 2), 'utf8');
console.log('Report', REPORT, summary.totals);
