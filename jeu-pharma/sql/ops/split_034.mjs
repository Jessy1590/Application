import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const src = join('sql', '034_rcp_matrice_cardio_deust.sql');
const text = await readFile(src, 'utf8');
const iDo = text.indexOf('DO $mig$');
const iEnd = text.indexOf('END\n$mig$;');
const head = text.slice(0, iDo);
const body = text.slice(text.indexOf('BEGIN', iDo) + 'BEGIN'.length, iEnd).trim();
const tail = text.slice(iEnd + 'END\n$mig$;'.length);

const chunks = body.split(/\n(?=  -- )/).filter(Boolean);
const parts = [];
let cur = '';
for (const c of chunks) {
  if ((cur + c).length > 45000 && cur) {
    parts.push(cur);
    cur = c;
  } else cur += (cur ? '\n' : '') + c;
}
if (cur) parts.push(cur);

await mkdir('sql/034_parts', { recursive: true });
for (let i = 0; i < parts.length; i++) {
  const isFirst = i === 0;
  const isLast = i === parts.length - 1;
  const sql =
    head +
    'DO $mig$\nDECLARE\n  m uuid;\nBEGIN\n' +
    parts[i] +
    '\nEND\n$mig$;\n' +
    (isLast ? tail : '');
  await writeFile(join('sql', '034_parts', `part_${i + 1}.sql`), sql, 'utf8');
  console.log('part', i + 1, sql.length);
}
