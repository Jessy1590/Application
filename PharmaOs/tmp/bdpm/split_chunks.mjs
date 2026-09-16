import fs from 'fs';
import path from 'path';

const batchDir = String.raw`c:\Users\chain\Documents\GitHub\Application\PharmaOs\tmp\bdpm\batches`;
const baseChunk = String.raw`c:\Users\chain\Documents\GitHub\Application\PharmaOs\tmp\bdpm\chunks`;
const CHUNK = 80;

const tables = [
  { prefix: 'specialites', rpc: 'bulk_insert_specialites' },
  { prefix: 'presentations', rpc: 'bulk_insert_presentations' },
  { prefix: 'compositions', rpc: 'bulk_insert_compositions' },
  { prefix: 'generiques', rpc: 'bulk_insert_generiques' },
];

for (const { prefix } of tables) {
  const chunkDir = path.join(baseChunk, prefix);
  fs.mkdirSync(chunkDir, { recursive: true });
  for (const f of fs.readdirSync(chunkDir)) fs.unlinkSync(path.join(chunkDir, f));

  let idx = 0;
  const files = fs
    .readdirSync(batchDir)
    .filter((f) => f.startsWith(`${prefix}_`) && f.endsWith('.json'))
    .sort();

  for (const file of files) {
    const arr = JSON.parse(fs.readFileSync(path.join(batchDir, file), 'utf8'));
    for (let i = 0; i < arr.length; i += CHUNK) {
      const slice = arr.slice(i, i + CHUNK);
      const name = `${prefix}_c${String(idx).padStart(4, '0')}.json`;
      fs.writeFileSync(path.join(chunkDir, name), JSON.stringify(slice), 'utf8');
      idx++;
    }
  }

  const sample = fs.readFileSync(path.join(chunkDir, `${prefix}_c0000.json`), 'utf8');
  console.log(prefix, 'chunks:', idx, 'sample_bytes:', Buffer.byteLength(sample));
}
