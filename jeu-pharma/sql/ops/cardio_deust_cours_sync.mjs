#!/usr/bin/env node
/** Génère sql/036_sync_connaissances_cours_deust.sql (filtre corpus cours-extract). */
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'sql', '036_sync_connaissances_cours_deust.sql');
const COURS_DIR = join(ROOT, '.cursor', 'docs', 'cours-extract');

const STRUCT = new Set(['dci', 'nom_commercial', 'secteur_therapeutique', 'classe_therapeutique', 'classe_pharmacologique', 'detail_pharmacologie']);
const ABBREVS = ['ih', 'ir', 'hta', 'idm', 'fa', 'avc', 'ait', 'aomi', 'oap', 'sca', 'basic', 'tvp', 'ep', 'g&a', 'hbpm', 'avk', 'inr', 'hemorragie', 'hemorragies', 'hyperkaliemie', 'thrombopenie', 'asthme'];

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9+&/\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function corpus() {
  let t = '';
  for (const f of await readdir(COURS_DIR)) {
    if (f.endsWith('.txt')) t += await readFile(join(COURS_DIR, f), 'utf8');
  }
  return norm(t);
}

async function cfg() {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error('SUPABASE_URL / SUPABASE_ANON_KEY');
  return { url, anonKey };
}

async function jget(url, key, path) {
  const r = await fetch(`${url}/rest/v1/${path}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Accept-Profile': 'jeupharma' },
  });
  if (!r.ok) throw new Error(`${path} ${r.status}`);
  return r.json();
}

function keep(corp, drug, row) {
  const t = norm(row.texte);
  if (!t) return false;
  if (STRUCT.has(row.champ_code)) {
    if (row.champ_code === 'dci' || row.champ_code === 'nom_commercial') return true;
    if (row.champ_code === 'detail_pharmacologie') return t.length <= 140;
    const dn = norm(drug.valeur);
    if (!corp.includes(dn.split(' ')[0])) return false;
    return t.length <= 90 || corp.includes(t.slice(0, 30));
  }
  if (t.length <= 36 && ABBREVS.some((a) => t.includes(a))) return true;
  if (corp.includes(t)) return true;
  if (t.length >= 10 && corp.includes(t.slice(0, 22))) return true;
  return false;
}

async function main() {
  const { url, anonKey } = await cfg();
  const corp = await corpus();
  const lots = await readFile(join(ROOT, 'sql', '033_pubs_molecules_cardio_deust.sql'), 'utf8');
  const block = lots.split('INSERT INTO _lots_cv')[1]?.split('DO $mig$')[0] || '';
  const norms = [...new Set([...block.matchAll(/\('[^']+',\s*'([^']+)'/g)].map((m) => m[1]))];

  const drugs = [];
  for (const n of norms) {
    const d = await jget(url, anonKey, `dcis?valeur_norm=eq.${encodeURIComponent(n)}&select=id,valeur,valeur_norm`);
    if (!d[0]) continue;
    const m = await jget(url, anonKey, `matrice_medicaments?dci_id=eq.${d[0].id}&statut=eq.publie&select=id`);
    if (m[0]) drugs.push({ id: m[0].id, valeur: d[0].valeur, norm: d[0].valeur_norm });
  }

  const migr = (await jget(url, anonKey, 'sources_contenu?code=eq.migration_v1_matrice&select=id'))[0]?.id;
  const kept = [];
  for (let i = 0; i < drugs.length; i += 10) {
    const ids = drugs.slice(i, i + 10).map((d) => d.id);
    const rows = await jget(
      url,
      anonKey,
      `connaissances?matrice_id=in.(${ids.join(',')})&source_id=eq.${migr}&statut=eq.valide&select=matrice_id,champ_code,entite_id,texte,texte_norm,ordre`,
    );
    for (const row of rows) {
      const drug = drugs.find((d) => d.id === row.matrice_id);
      if (keep(corp, drug, row)) kept.push(row);
    }
  }

  console.log('Retenu', kept.length, 'connaissances cours');

  const vals = kept
    .map((r) => {
      const e = r.entite_id ? `'${r.entite_id}'::uuid` : 'NULL::uuid';
      return `('${r.matrice_id}'::uuid,'${r.champ_code}',${e},'${String(r.texte).replace(/'/g, "''")}','${String(r.texte_norm).replace(/'/g, "''")}',${r.ordre ?? 0})`;
    })
    .join(',\n');

  const sql = `-- =============================================================================
-- 036 : Connaissances visibles DEUST (source cours) — filtre corpus cours-extract
-- Généré par sql/ops/cardio_deust_cours_sync.mjs (${kept.length} lignes)
-- =============================================================================

INSERT INTO jeupharma.versions_source (source_id, version_label, statut, notes)
SELECT s.id, 'deust-corpus-2026-10', 'valide', 'Connaissances cours filtrées (pas de surplus RCP matrice).'
FROM jeupharma.sources_contenu s WHERE s.code = 'cours_cardio_deust_2a'
ON CONFLICT (source_id, version_label) DO NOTHING;

DO $mig$
DECLARE v_src uuid; v_ver uuid; n int;
BEGIN
  SELECT id INTO v_src FROM jeupharma.sources_contenu WHERE code = 'cours_cardio_deust_2a';
  SELECT id INTO v_ver FROM jeupharma.versions_source WHERE source_id = v_src AND version_label = 'deust-corpus-2026-10';

  INSERT INTO jeupharma.connaissances (matrice_id, champ_code, entite_id, texte, texte_norm, statut, source_id, version_source_id, ordre)
  SELECT v.matrice_id, v.champ_code, v.entite_id, v.texte, v.texte_norm, 'valide', v_src, v_ver, v.ordre
  FROM (VALUES
${vals}
  ) AS v(matrice_id, champ_code, entite_id, texte, texte_norm, ordre)
  ON CONFLICT (matrice_id, champ_code, entite_key) WHERE statut <> 'retire'
  DO UPDATE SET texte = EXCLUDED.texte, texte_norm = EXCLUDED.texte_norm,
                source_id = v_src, version_source_id = v_ver, statut = 'valide';
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE '036 : connaissances cours upsert=%', n;
END
$mig$;
`;
  await writeFile(OUT, sql, 'utf8');
  console.log('Wrote', OUT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
