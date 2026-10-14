import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const src = join(ROOT, 'sql', '034_rcp_matrice_cardio_deust.sql');
const outDir = join(ROOT, 'sql', '034_apply_parts');
mkdirSync(outDir, { recursive: true });

const sql = readFileSync(src, 'utf8');
const migDoIdx = sql.indexOf('DO $mig$');
const migEndMarker = '\nEND\n$mig$;';
const migEndIdx = sql.indexOf(migEndMarker, migDoIdx);
const helpers = sql.slice(0, migDoIdx);
const migOpen = sql.slice(migDoIdx, sql.indexOf('BEGIN\n', migDoIdx) + 'BEGIN\n'.length);
const body = sql.slice(sql.indexOf('BEGIN\n', migDoIdx) + 'BEGIN\n'.length, migEndIdx);
const postMig = sql.slice(migEndIdx + migEndMarker.length);

const chunks = body.split(/\n(?=  -- )/).filter(Boolean);
const maxBytes = 85000;
const parts = [];
let cur = '';

for (const chunk of chunks) {
  const next = cur + chunk;
  if (cur && Buffer.byteLength(next, 'utf8') > maxBytes) {
    parts.push(cur);
    cur = chunk;
  } else {
    cur = next;
  }
}
if (cur) parts.push(cur);

const migClose = '\nEND\n$mig$;\n';

parts.forEach((bodyPart, i) => {
  const isLast = i === parts.length - 1;
  const content =
    helpers +
    migOpen +
    bodyPart +
    migClose +
    (isLast ? postMig : '');

  const name = join(outDir, `part_${String(i + 1).padStart(2, '0')}.sql`);
  writeFileSync(name, content, 'utf8');
  console.log(name, Buffer.byteLength(content, 'utf8'), 'parts', parts.length);
});
