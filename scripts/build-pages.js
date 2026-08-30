#!/usr/bin/env node
/**
 * Build GitHub Pages artifact into dist/
 * - Copie les fichiers statiques publics
 * - Exclut sources Electron, docs internes, migrations SQL
 * - Injecte SUPABASE_URL / SUPABASE_ANON_KEY si secrets CI présents
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

const EXCLUDE_DIRS = new Set([
  'node_modules', '.git', '.github', 'dist', '.cursor',
  'PharmaOs/App', 'PharmaOs/Dashboard',
]);

const EXCLUDE_FILES = new Set([
  'scripts/build-pages.js',
]);

const EXCLUDE_EXT = new Set(['.sql', '.md', '.mdc']);

function shouldExclude(relPath) {
  const normalized = relPath.replace(/\\/g, '/');
  if (EXCLUDE_FILES.has(normalized)) return true;
  const parts = normalized.split('/');
  if (parts.some(p => EXCLUDE_DIRS.has(p))) return true;
  const ext = path.extname(normalized);
  if (EXCLUDE_EXT.has(ext) && !normalized.endsWith('manifest.webmanifest')) return true;
  return false;
}

function copyRecursive(src, dest, rel = '') {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    if (shouldExclude(rel)) return;
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dest, entry), rel ? `${rel}/${entry}` : entry);
    }
    return;
  }
  if (shouldExclude(rel)) return;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function injectSupabaseConfig() {
  const configPath = path.join(DIST, 'shared', 'supabase-config.js');
  if (!fs.existsSync(configPath)) return;

  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    console.log('[build-pages] Secrets Supabase absents — config locale conservée.');
    return;
  }

  let content = fs.readFileSync(configPath, 'utf8');
  content = content.replace(
    /url:\s*'[^']*'/,
    `url: '${url}'`
  );
  content = content.replace(
    /anonKey:\s*'[^']*'/,
    `anonKey: '${anonKey}'`
  );
  fs.writeFileSync(configPath, content);
  console.log('[build-pages] Config Supabase injectée depuis secrets CI.');
}

if (fs.existsSync(DIST)) fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });

for (const entry of fs.readdirSync(ROOT)) {
  if (entry === 'dist' || entry === 'node_modules' || entry === '.git') continue;
  copyRecursive(path.join(ROOT, entry), path.join(DIST, entry), entry);
}

injectSupabaseConfig();
console.log('[build-pages] Artifact prêt dans dist/');
