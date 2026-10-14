/**
 * Applique un fichier .sql sur le projet Supabase via l'API Management (service role).
 * Nécessite SUPABASE_ACCESS_TOKEN (PAT) dans l'environnement.
 * Usage: node sql/ops/apply_sql_file.mjs sql/035_blocs_contenu_cardio_deust.sql
 */
import fs from 'fs';

const projectRef = process.env.SUPABASE_PROJECT_REF || 'kpjflntnotftpzffjbud';
const token = process.env.SUPABASE_ACCESS_TOKEN;
const file = process.argv[2];
if (!token) {
  console.error('SUPABASE_ACCESS_TOKEN manquant');
  process.exit(1);
}
if (!file || !fs.existsSync(file)) {
  console.error('Fichier SQL introuvable:', file);
  process.exit(1);
}
const query = fs.readFileSync(file, 'utf8');
const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ query }),
});
const text = await res.text();
if (!res.ok) {
  console.error('HTTP', res.status, text.slice(0, 2000));
  process.exit(1);
}
console.log('OK', text.slice(0, 500));
