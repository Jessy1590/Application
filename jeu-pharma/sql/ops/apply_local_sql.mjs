#!/usr/bin/env node
/** Applique un fichier SQL via Supabase Management API (service role dans SUPABASE_ACCESS_TOKEN). */
import { readFile } from 'node:fs/promises';

const file = process.argv[2];
const project = process.argv[3] || 'kpjflntnotftpzffjbud';
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!file || !token) {
  console.error('usage: SUPABASE_ACCESS_TOKEN=... node apply_local_sql.mjs <file.sql> [project_ref]');
  process.exit(1);
}
const query = await readFile(file, 'utf8');
const res = await fetch(`https://api.supabase.com/v1/projects/${project}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query }),
});
const body = await res.text();
console.log(res.status, body.slice(0, 2000));
if (!res.ok) process.exit(1);
