/** Liste les parts 034 pour application MCP (stdout = noms). */
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
const dir = join('sql', '034_parts');
const files = (await readdir(dir)).filter((f) => f.startsWith('part_')).sort();
for (const f of files) console.log(join(dir, f));
