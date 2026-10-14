import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(dir, '..', '034_rcp_matrice_cardio_deust.sql'), 'utf8');
const headerEnd = src.indexOf('DO $mig$');
const footerStart = src.indexOf('END\n$mig$;');
const header = src.slice(0, headerEnd);
const footer = src.slice(footerStart + 'END\n$mig$;'.length);
const inner = src.slice(src.indexOf('BEGIN', headerEnd) + 'BEGIN'.length, footerStart).trim();
const chunks = inner.split(/\n(?=  -- )/).filter(Boolean);

const wrap = (body) =>
  `${header}DO $mig$\nDECLARE\n  m uuid;\nBEGIN\n${body}\nEND\n$mig$;\n`;

const outDir = join(dir, '..', 'ops', '034_batches');
mkdirSync(outDir, { recursive: true });

const batches = [];
let cur = '';
const max = 78000;
for (const ch of chunks) {
  const add = (cur ? '\n' : '') + ch;
  if (cur.length + add.length > max && cur.length > 0) {
    batches.push(wrap(cur));
    cur = ch;
  } else {
    cur += add;
  }
}
if (cur) batches.push(wrap(cur));
batches[batches.length - 1] += footer;

batches.forEach((b, idx) => {
  writeFileSync(join(outDir, `batch_${String(idx + 1).padStart(2, '0')}.sql`), b, 'utf8');
  console.log(`batch_${idx + 1}: ${b.length} bytes`);
});
