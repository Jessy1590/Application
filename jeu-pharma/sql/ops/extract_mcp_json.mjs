import fs from 'fs';

const [,, inPath, outPath, mode = 'json'] = process.argv;
if (!inPath || !outPath) {
  console.error('Usage: node extract_mcp_json.mjs <mcp-out.txt> <out> [json|functions]');
  process.exit(1);
}

const raw = fs.readFileSync(inPath, 'utf8');
let text = raw;
try {
  const outer = JSON.parse(raw);
  if (typeof outer.result === 'string') text = outer.result;
} catch {
  /* raw text */
}

const m = text.match(/<untrusted-data-[^>]+>([\s\S]*?)<\/untrusted-data-[^>]+>/);
if (!m) {
  console.error('No untrusted-data block');
  process.exit(2);
}
let inner = m[1].trim();
const start = inner.indexOf('[');
const end = inner.lastIndexOf(']');
if (start < 0 || end < 0) {
  console.error('No JSON array');
  process.exit(3);
}
inner = inner.slice(start, end + 1);
const rows = JSON.parse(inner);

if (mode === 'functions') {
  const parts = rows.map((r) => (r.def || '') + ';\n\n').filter(Boolean);
  fs.writeFileSync(outPath, `-- Backup jeupharma functions\n${parts.join('')}`);
} else {
  fs.writeFileSync(outPath, JSON.stringify(rows, null, 0));
}
console.log('OK', mode, outPath, fs.statSync(outPath).size, 'rows', rows.length);
