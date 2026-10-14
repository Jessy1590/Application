#!/usr/bin/env node
/**
 * Retry intelligent des skips (no_cis / rcp_vide) via Edge jeupharma-regen-referentiel.
 * Usage : node sql/ops/run_retry_skips_loop.mjs
 */
import { appendFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const URL = 'https://kpjflntnotftpzffjbud.supabase.co/functions/v1/jeupharma-regen-referentiel';
const ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtwamZsbnRub3RmdHB6ZmZqYnVkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYyODg0MjMsImV4cCI6MjEwMTg2NDQyM30.mTjm86Thn6VUOAAJRWCsGMcR0Ip-qEP08fJdwUvKKEo';
const OPS = 'jp-regen-20261014-vocab-canonique';
// limit=1 : limit≥2 provoque HTTP 546 WORKER_RESOURCE_LIMIT (ANSM HTML × CIS).
const LIMIT = Number(process.env.REGEN_LIMIT || 1);
const MAX_ROUNDS = Number(process.env.REGEN_MAX_ROUNDS || 80);
const FAIL_BACKOFF_MS = Number(process.env.REGEN_FAIL_BACKOFF_MS || 20_000);
const OK_PAUSE_MS = Number(process.env.REGEN_OK_PAUSE_MS || 3_000);
const REPORT = join(__dir, 'regen_retry_skips_report.json');
const NDJSON = join(__dir, 'regen_retry_skips_progress.ndjson');

const summary = {
  started_at: new Date().toISOString(),
  rounds: [],
  totals: { ok: 0, errors: 0, skip: 0, fail_rounds: 0 },
};

async function oneRound(round) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 280_000);
  try {
    const res = await fetch(URL, {
      method: 'POST',
      headers: {
        apikey: ANON,
        Authorization: `Bearer ${ANON}`,
        'x-jeupharma-ops': OPS,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ limit: LIMIT, retry_skips: true, worst_first: true }),
      signal: ctrl.signal,
    });
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`Non-JSON HTTP ${res.status}: ${text.slice(0, 400)}`);
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${JSON.stringify(data).slice(0, 500)}`);
    return data;
  } finally {
    clearTimeout(t);
  }
}

for (let round = 1; round <= MAX_ROUNDS; round++) {
  // stdout only — console.error + Tee-Object PowerShell => NativeCommandError / exit -1
  console.log(`--- retry round ${round}/${MAX_ROUNDS} limit=${LIMIT} ---`);
  let data;
  try {
    data = await oneRound(round);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log('ROUND FAIL', msg);
    summary.totals.fail_rounds += 1;
    summary.rounds.push({ round, error: msg });
    await appendFile(NDJSON, JSON.stringify({ round, error: msg, at: new Date().toISOString() }) + '\n');
    await new Promise((r) => setTimeout(r, FAIL_BACKOFF_MS));
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
    mode: data.mode,
    ok: (data.ok || []).map((x) => `${x.dci}${x.source ? `@${x.source}` : ''}`),
    errors: (data.errors || []).map((x) => ({ dci: x.dci, error: x.error, status: x.status, cis: x.cis })),
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
  await new Promise((r) => setTimeout(r, OK_PAUSE_MS));
}

summary.finished_at = new Date().toISOString();
await writeFile(REPORT, JSON.stringify(summary, null, 2), 'utf8');
console.log('Report', REPORT, summary.totals);
