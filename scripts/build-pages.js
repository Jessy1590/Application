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
  if (path.basename(src) === '.DS_Store') return;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function jsString(value) {
  return `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function injectSupabaseConfig() {
  const url = (process.env.SUPABASE_URL || '').trim().replace(/\/$/, '');
  const anonKey = (process.env.SUPABASE_ANON_KEY || '').trim();
  if (!url || !anonKey) {
    console.error('[build-pages] SUPABASE_URL et SUPABASE_ANON_KEY sont requis.');
    process.exit(1);
  }
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url)) {
    console.error('[build-pages] SUPABASE_URL invalide.');
    process.exit(1);
  }

  const configPath = path.join(DIST, 'shared', 'supabase-config.js');
  if (!fs.existsSync(configPath)) {
    console.error('[build-pages] shared/supabase-config.js absent de dist/.');
    process.exit(1);
  }

  const content = [
    'window.SUPABASE_CONFIG = {',
    `  url: ${jsString(url)},`,
    `  anonKey: ${jsString(anonKey)},`,
    '};',
    '',
  ].join('\n');
  fs.writeFileSync(configPath, content);

  const host = url.slice('https://'.length);
  const httpToken = '__SUPABASE_HTTP__';
  const wssToken = '__SUPABASE_WSS__';
  let rewritten = 0;
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.(html|js)$/i.test(entry.name)) continue;
      const raw = fs.readFileSync(full, 'utf8');
      if (!raw.includes(httpToken) && !raw.includes(wssToken)) continue;
      const next = raw.split(httpToken).join(url).split(wssToken).join(`wss://${host}`);
      fs.writeFileSync(full, next);
      rewritten += 1;
    }
  }
  walk(DIST);
  console.log(`[build-pages] Config Supabase injectée (${rewritten} fichier(s) CSP).`);
}

if (fs.existsSync(DIST)) fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });

for (const entry of fs.readdirSync(ROOT)) {
  if (entry === 'dist' || entry === 'node_modules' || entry === '.git') continue;
  copyRecursive(path.join(ROOT, entry), path.join(DIST, entry), entry);
}

injectSupabaseConfig();
console.log('[build-pages] Artifact prêt dans dist/');
