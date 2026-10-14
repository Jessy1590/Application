#!/usr/bin/env node
/**
 * Génère sql/034_rcp_matrice_cardio_deust.sql — enrichissement matrice (RCP BDPM condensé).
 * Ne touche pas aux publications DEUST. Usage :
 *   node sql/ops/cardio_rcp_matrice_gen.mjs
 * Requiert : SUPABASE_URL + SUPABASE_ANON_KEY (env) ou ../shared/supabase-config.js via import dynamique.
 */
import { writeFile, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CIS_ALLOW,
  CIS_DENY,
  SEARCH_QUERY,
  SUBSTANCE_ACCEPT,
  DENOM_REJECT,
  FORME_REJECT,
} from './cardio_rcp_cis_config.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, '..', '..');
const OUT_SQL = join(ROOT, 'sql', '034_rcp_matrice_cardio_deust.sql');
const OUT_REPORT = join(ROOT, 'sql', 'ops', 'cardio_rcp_cis_report.json');

const SECTIONS = ['4.1', '4.3', '4.4', '4.5', '4.8', '5.1'];
const CHAMP_MAP = {
  '4.1': 'ind',
  '4.3': 'ci',
  '4.4': 'pre',
  '4.5': 'inter',
  '4.8': 'ei',
  '5.1': 'detail',
};

const SERIOUS =
  /anaphyl|choc anaphyl|angio.?[oœ]d|syndrome de stevens|n[ée]crose|h[ée]morragie|thrombocytop|agranulocyt|aplasie|h[ée]patite fulmin|insuffisance r[ée]nale aigu|torsades|fibrillation ventriculaire|arr[êe]t cardiaque|maligne|pancr[ée]atite aigu|rhabdomyol|syndrome DRESS|Lyell|Stevens-Johnson|bronchospasme s[ée]v|oedème pulmonaire|embolie pulmonaire/i;
const FREQ =
  /tr[èe]s fr[ée]quent|fr[ée]quent|peu fr[ée]quent|≥\s*1\s*\/\s*10|1\/10|1\s*patient\s*sur\s*10|≥\s*1\s*\/\s*100|1\/100|common|very common|frequent/i;

function decode(s) {
  return s
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

function clean(html) {
  return decode(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<a [^>]*lien-retour-hautdepage[^>]*>[\s\S]*?<\/a>/gi, '')
      .replace(/<\/(p|div|tr|li|h\d)>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/t[dh]>/gi, ' | ')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

function extractRcp(html) {
  const parts = html.split(/<p class="AmmAnnexeTitre[12]"/i).slice(1);
  const out = {};
  for (const p of parts) {
    const m = p.match(/<span id=['"]([0-9]\.[0-9]*)\.?_/);
    if (!m) continue;
    const num = m[1];
    const body = p.replace(/^[^>]*>/, '');
    if (!out[num]) out[num] = body;
  }
  return out;
}

function splitBullets(text) {
  if (!text) return [];
  const t = text.replace(/^\d\.\d\.?\s*[^\n]*\n/, '');
  const parts = t
    .split(/\n|[•·]|(?<=[.;])\s+(?=[A-ZÉÈÀÂÎÔÙÇ])/)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter((s) => s.length >= 8 && s.length <= 220);
  return [...new Set(parts)].slice(0, 12);
}

function filterEi(lines) {
  const kept = [];
  for (const line of lines) {
    const l = line.toLowerCase();
    if (FREQ.test(line) || SERIOUS.test(line)) {
      kept.push(line.slice(0, 200));
      continue;
    }
    if (/syst[èe]me de classe|classe d'effets|fr[ée]quence ind[ée]termin/i.test(line)) continue;
  }
  if (!kept.length && lines.length) {
    return lines.slice(0, 6).map((s) => s.slice(0, 200));
  }
  return [...new Set(kept)].slice(0, 10);
}

function detailOne(text) {
  const lines = splitBullets(text);
  const para = (lines[0] || text.replace(/\s+/g, ' ').trim()).slice(0, 280);
  return para || null;
}

function sqlEscape(s) {
  return s.replace(/'/g, "''");
}

function sqlArray(arr) {
  if (!arr?.length) return 'NULL';
  return `ARRAY[${arr.map((x) => `'${sqlEscape(x)}'`).join(', ')}]`;
}

async function loadSupabaseConfig() {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) {
    return { url: process.env.SUPABASE_URL, anonKey: process.env.SUPABASE_ANON_KEY };
  }
  const cfgPath = join(ROOT, '..', 'shared', 'supabase-config.js');
  const raw = await readFile(cfgPath, 'utf8');
  const url = raw.match(/url:\s*['"]([^'"]+)['"]/)?.[1];
  const anonKey = raw.match(/anonKey:\s*['"]([^'"]+)['"]/)?.[1];
  if (!url || !anonKey) throw new Error('Config Supabase introuvable');
  return { url, anonKey };
}

async function sbRpc(cfg, fn, args) {
  const res = await fetch(`${cfg.url}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      apikey: cfg.anonKey,
      Authorization: `Bearer ${cfg.anonKey}`,
      'Content-Type': 'application/json',
      'Accept-Profile': 'bdm',
      'Content-Profile': 'bdm',
    },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`${fn} HTTP ${res.status}`);
  return res.json();
}

function normVal(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/['’]/g, ' ')
    .replace(/[^a-z0-9+ ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseSubstances(substances) {
  return String(substances || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function substanceMatchesDci(dciNorm, substance) {
  const accepts = SUBSTANCE_ACCEPT[dciNorm];
  const sn = normVal(substance);
  if (accepts?.length) {
    return accepts.some((a) => {
      const an = normVal(a);
      return sn === an || sn.startsWith(`${an} `) || sn.includes(` ${an} `);
    });
  }
  const dn = normVal(dciNorm);
  return (
    sn === dn ||
    sn.endsWith(` ${dn}`) ||
    sn.endsWith(dn) ||
    sn.startsWith(`${dn} `) ||
    sn.includes(` ${dn} `)
  );
}

function rowRejected(row) {
  const cis = String(row.cis || '');
  if (CIS_DENY.has(cis)) return 'denylist';
  const blob = `${row.denomination || ''} ${row.forme_pharmaceutique || ''} ${row.presentation_libelle || ''}`;
  if (DENOM_REJECT.test(blob)) return 'denom';
  if (FORME_REJECT.test(blob)) return 'forme';
  const subs = parseSubstances(row.substances);
  if (subs.length > 1) return 'association';
  return null;
}

function scoreRow(row, dciNorm) {
  let score = 0;
  const subs = parseSubstances(row.substances);
  if (subs.length !== 1) return -999;
  if (!substanceMatchesDci(dciNorm, subs[0])) return -999;

  const etat = String(row.etat_commercialisation || '').toLowerCase();
  if (etat.includes('commercialis')) score += 12;

  const forme = normVal(row.forme_pharmaceutique || row.denomination || '');
  if (/comprime|gelule|capsule|solution buvable|goutte|comprime enrobe|pellicule/.test(forme)) score += 10;
  else if (/injectable.*buvable|intramusculaire|sous cutan/.test(forme)) score += 6;
  else if (/solution injectable|injectable|perfusion/.test(forme)) score -= 4;

  if (/diagnostic|provocation|scintigraph/.test(normVal(row.denomination))) score -= 40;

  const reason = String(row.match_reason || '');
  if (reason === 'dci') score += 4;
  else if (reason === 'specialite') score += 1;

  return score;
}

function sqlUnescape(s) {
  return s.replace(/''/g, "'");
}

async function listDciPlan() {
  const lots = await readFile(join(ROOT, 'sql', '033_pubs_molecules_cardio_deust.sql'), 'utf8');
  const block = lots.split('INSERT INTO _lots_cv')[1]?.split('DO $mig$')[0] || '';
  const norms = [];
  for (const m of block.matchAll(/\('([^']*(?:''[^']*)*)',\s*'([^']*(?:''[^']*)*)'/g)) {
    const dci = sqlUnescape(m[2]);
    if (!dci.includes(' + ')) norms.push(dci);
  }
  return [...new Set(norms)];
}

/**
 * @returns {{ cis: string|null, reason?: string, pick?: object }}
 */
async function resolveCis(cfg, dciNorm) {
  if (CIS_ALLOW[dciNorm]) {
    const forced = CIS_ALLOW[dciNorm];
    if (CIS_DENY.has(forced)) return { cis: null, reason: 'allowlist_denied' };
    return { cis: forced, reason: 'allowlist' };
  }

  const q = (SEARCH_QUERY[dciNorm] || dciNorm).replace(/\s+/g, ' ').slice(0, 80);
  const rows = await sbRpc(cfg, 'search_products', { q, lim: 30 });
  if (!Array.isArray(rows) || !rows.length) return { cis: null, reason: 'no_search_hit' };

  const scored = [];
  for (const r of rows) {
    const reject = rowRejected(r);
    if (reject) continue;
    const score = scoreRow(r, dciNorm);
    if (score >= 8) scored.push({ r, score });
  }
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (!best) return { cis: null, reason: 'no_safe_candidate' };
  return { cis: best.r.cis, reason: 'scored', pick: best.r };
}

async function fetchRcpSections(cis) {
  const url = `https://base-donnees-publique.medicaments.gouv.fr/medicament/${cis}/extrait`;
  let html = '';
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    html = await res.text();
    if (/AmmAnnexeTitre/i.test(html) && html.length > 50000) break;
    await new Promise((r) => setTimeout(r, 900 * (attempt + 1)));
  }
  const secs = extractRcp(html);
  const out = {};
  for (const num of SECTIONS) {
    out[num] = secs[num] ? clean(secs[num]) : '';
  }
  out._cis = cis;
  out._url = url;
  return out;
}

async function main() {
  const cfg = await loadSupabaseConfig();
  const dciNorms = await listDciPlan();
  console.log('DCI mono à traiter:', dciNorms.length);

  const header = `-- =============================================================================
-- 034 : RCP BDPM condensé → matrice_medicaments (Cardio DEUST 2A)
-- Généré par sql/ops/cardio_rcp_matrice_gen.mjs — NE PAS éditer à la main.
-- Matrice / référentiel uniquement ; publications DEUST = source cours (035).
-- EI : fréquents ou rares graves. Idempotent (jp_fill sans doublon).
-- =============================================================================

CREATE OR REPLACE FUNCTION pg_temp.jp_ent(p_table text, p_valeur text)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_id uuid; v_norm text := jeupharma.normaliser_valeur(p_valeur);
BEGIN
  EXECUTE format('SELECT id FROM jeupharma.%I WHERE valeur_norm = $1 AND actif LIMIT 1', p_table) INTO v_id USING v_norm;
  IF v_id IS NULL THEN
    EXECUTE format('INSERT INTO jeupharma.%I (valeur, valeur_norm) VALUES ($1, $2) RETURNING id', p_table) INTO v_id USING p_valeur, v_norm;
  END IF;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.jp_fill(p_matrice uuid, p_champ text, p_vals text[])
RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_tbl text; v_jt text; v_fk text; v_id uuid; i int;
BEGIN
  SELECT t.ent, t.jt, t.fk INTO v_tbl, v_jt, v_fk FROM (VALUES
    ('secteurs','secteurs_therapeutiques','matrice_secteurs_therapeutiques','secteur_therapeutique_id'),
    ('ct','classes_therapeutiques','matrice_classes_therapeutiques','classe_therapeutique_id'),
    ('cp','classes_pharmacologiques','matrice_classes_pharmacologiques','classe_pharmacologique_id'),
    ('ind','indications','matrice_indications','indication_id'),
    ('ci','contre_indications','matrice_contre_indications','contre_indication_id'),
    ('ei','effets_indesirables','matrice_effets_indesirables','effet_indesirable_id'),
    ('pre','precautions_emploi','matrice_precautions_emploi','precaution_emploi_id'),
    ('inter','interactions','matrice_interactions','interaction_id'),
    ('surv','surveillances','matrice_surveillances','surveillance_id'),
    ('noms','noms_commerciaux','matrice_noms_commerciaux','nom_commercial_id')
  ) AS t(champ, ent, jt, fk) WHERE t.champ = p_champ;
  IF v_tbl IS NULL THEN RAISE EXCEPTION 'champ inconnu %', p_champ; END IF;
  IF p_vals IS NULL THEN RETURN; END IF;
  FOR i IN 1 .. coalesce(array_length(p_vals, 1), 0) LOOP
    v_id := pg_temp.jp_ent(v_tbl, p_vals[i]);
    EXECUTE format(
      'INSERT INTO jeupharma.%I (matrice_id, %I, ordre) SELECT $1, $2, $3 WHERE NOT EXISTS (SELECT 1 FROM jeupharma.%I WHERE matrice_id = $1 AND %I = $2)',
      v_jt, v_fk, v_jt, v_fk) USING p_matrice, v_id, i - 1;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.jp_matrice_by_norm(p_norm text)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_m uuid;
BEGIN
  SELECT m.id INTO v_m FROM jeupharma.matrice_medicaments m
  JOIN jeupharma.dcis d ON d.id = m.dci_id
  WHERE d.valeur_norm = jeupharma.normaliser_valeur(p_norm) AND m.statut = 'publie' LIMIT 1;
  IF v_m IS NULL THEN RAISE EXCEPTION 'fiche publie introuvable norm=%', p_norm; END IF;
  RETURN v_m;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.jp_detail_set(p_matrice uuid, p_valeur text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE jeupharma.matrice_medicaments
  SET detail_pharmacologie_id = pg_temp.jp_ent('details_pharmacologie', p_valeur), updated_at = now()
  WHERE id = p_matrice;
END $$;

DO $mig$
DECLARE
  m uuid;
BEGIN
`;

  const blocks = [];
  const processedNorms = [];
  const skipped = [];
  let ok = 0;
  let skip = 0;

  for (const norm of dciNorms) {
    try {
      const resolved = await resolveCis(cfg, norm);
      const cis = resolved.cis;
      if (!cis) {
        console.warn('SKIP', norm, resolved.reason);
        skipped.push({ dci_norm: norm, reason: resolved.reason });
        skip++;
        continue;
      }
      let secs = await fetchRcpSections(cis);
      let contentLen = SECTIONS.reduce((n, k) => n + (secs[k]?.length || 0), 0);
      if (contentLen < 80) {
        await new Promise((r) => setTimeout(r, 2500));
        secs = await fetchRcpSections(cis);
        contentLen = SECTIONS.reduce((n, k) => n + (secs[k]?.length || 0), 0);
      }
      processedNorms.push(norm);
      const ind = splitBullets(secs['4.1']);
      const ci = splitBullets(secs['4.3']);
      const pre = splitBullets(secs['4.4']);
      const inter = splitBullets(secs['4.5']);
      const ei = filterEi(splitBullets(secs['4.8']));
      const det = detailOne(secs['5.1']);
      const surv = pre.filter((p) => /surveill|contr[ôo]le|bilan|dosage|INR|cr[ée]atinine|kali|fonction r[ée]nale|fonction h[ée]patique/i.test(p)).slice(0, 5);

      let chunk = `  -- ${norm} (CIS ${cis}, ${resolved.reason})\n  m := pg_temp.jp_matrice_by_norm('${sqlEscape(norm)}');\n`;
      if (det) chunk += `  PERFORM pg_temp.jp_detail_set(m, '${sqlEscape(det)}');\n`;
      if (ind.length) chunk += `  PERFORM pg_temp.jp_fill(m, 'ind', ${sqlArray(ind)});\n`;
      if (ci.length) chunk += `  PERFORM pg_temp.jp_fill(m, 'ci', ${sqlArray(ci)});\n`;
      if (pre.length) chunk += `  PERFORM pg_temp.jp_fill(m, 'pre', ${sqlArray(pre)});\n`;
      if (inter.length) chunk += `  PERFORM pg_temp.jp_fill(m, 'inter', ${sqlArray(inter)});\n`;
      if (ei.length) chunk += `  PERFORM pg_temp.jp_fill(m, 'ei', ${sqlArray(ei)});\n`;
      if (surv.length) chunk += `  PERFORM pg_temp.jp_fill(m, 'surv', ${sqlArray(surv)});\n`;
      const hasData = det || ind.length || ci.length || pre.length || inter.length || ei.length || surv.length;
      if (hasData) {
        blocks.push(chunk);
        ok++;
        if (ok % 10 === 0) console.log('progress', ok);
      } else {
        console.warn('SKIP empty RCP', norm);
        skipped.push({ dci_norm: norm, reason: 'empty_rcp' });
        processedNorms.pop();
        skip++;
      }
      await new Promise((r) => setTimeout(r, 450));
    } catch (e) {
      console.warn('ERR', norm, e.message);
      skipped.push({ dci_norm: norm, reason: `error:${e.message}` });
      skip++;
    }
  }

  const normsSqlList =
    processedNorms.length > 0
      ? processedNorms.map((n) => `      ('${sqlEscape(n)}')`).join(',\n')
      : "      ('__none__')";

  const footer = `
END
$mig$;

UPDATE jeupharma.matrice_medicaments m
SET fiche_validee = false, updated_at = now()
FROM jeupharma.dcis d
WHERE d.id = m.dci_id AND m.statut = 'publie'
  AND d.valeur_norm IN (
    SELECT DISTINCT l.dci_norm FROM (VALUES
${normsSqlList}
    ) AS l(dci_norm)
  );

INSERT INTO jeupharma.sources_contenu (code, libelle, type_source, description)
VALUES (
  'rcp_bdpm_cardio_deust',
  'RCP BDPM condensé — Cardio DEUST 2A',
  'rcp',
  'Enrichissement matrice 034 : rubriques 4.x / 5.1 BDPM (EI fréquents ou graves). Non publié sur le parcours DEUST.'
)
ON CONFLICT (code) DO NOTHING;

INSERT INTO jeupharma.versions_source (source_id, version_label, statut, notes)
SELECT s.id, 'bdpm-2026-10', 'valide', 'Généré par cardio_rcp_matrice_gen.mjs'
FROM jeupharma.sources_contenu s WHERE s.code = 'rcp_bdpm_cardio_deust'
ON CONFLICT (source_id, version_label) DO NOTHING;

DO $mirror$
DECLARE
  src uuid; ver uuid; r record;
BEGIN
  SELECT s.id, v.id INTO src, ver
  FROM jeupharma.sources_contenu s
  JOIN jeupharma.versions_source v ON v.source_id = s.id AND v.version_label = 'bdpm-2026-10'
  WHERE s.code = 'rcp_bdpm_cardio_deust';

  INSERT INTO jeupharma.connaissances (matrice_id, champ_code, entite_id, texte, texte_norm, statut, source_id, version_source_id, ordre)
  SELECT m.id, 'dci', d.id, d.valeur, d.valeur_norm, 'valide', src, ver, 0
  FROM jeupharma.matrice_medicaments m
  JOIN jeupharma.dcis d ON d.id = m.dci_id AND d.actif
  WHERE m.statut = 'publie'
    AND d.valeur_norm IN (SELECT l.dci_norm FROM (VALUES
${normsSqlList}
    ) AS l(dci_norm))
  ON CONFLICT (matrice_id, champ_code, entite_key) WHERE statut <> 'retire' DO NOTHING;

  INSERT INTO jeupharma.connaissances (matrice_id, champ_code, entite_id, texte, texte_norm, statut, source_id, version_source_id, ordre)
  SELECT m.id, 'detail_pharmacologie', e.id, e.valeur, e.valeur_norm, 'valide', src, ver, 0
  FROM jeupharma.matrice_medicaments m
  JOIN jeupharma.details_pharmacologie e ON e.id = m.detail_pharmacologie_id AND e.actif
  JOIN jeupharma.dcis d ON d.id = m.dci_id
  WHERE m.statut = 'publie'
    AND d.valeur_norm IN (SELECT l.dci_norm FROM (VALUES
${normsSqlList}
    ) AS l(dci_norm))
  ON CONFLICT (matrice_id, champ_code, entite_key) WHERE statut <> 'retire' DO NOTHING;

  FOR r IN SELECT * FROM (VALUES
    ('nom_commercial',         'matrice_noms_commerciaux',            'nom_commercial_id',         'noms_commerciaux'),
    ('secteur_therapeutique',  'matrice_secteurs_therapeutiques',     'secteur_therapeutique_id',  'secteurs_therapeutiques'),
    ('classe_therapeutique',   'matrice_classes_therapeutiques',      'classe_therapeutique_id',   'classes_therapeutiques'),
    ('classe_pharmacologique', 'matrice_classes_pharmacologiques',    'classe_pharmacologique_id', 'classes_pharmacologiques'),
    ('indications',            'matrice_indications',                 'indication_id',             'indications'),
    ('contre_indications',     'matrice_contre_indications',          'contre_indication_id',      'contre_indications'),
    ('effets_indesirables',    'matrice_effets_indesirables',         'effet_indesirable_id',      'effets_indesirables'),
    ('precautions_emploi',     'matrice_precautions_emploi',          'precaution_emploi_id',      'precautions_emploi'),
    ('interactions',           'matrice_interactions',                'interaction_id',            'interactions'),
    ('surveillances',          'matrice_surveillances',               'surveillance_id',           'surveillances')
  ) AS t(champ, jt, fk, ent)
  LOOP
    EXECUTE format($q$
      INSERT INTO jeupharma.connaissances
        (matrice_id, champ_code, entite_id, texte, texte_norm, statut, source_id, version_source_id, ordre)
      SELECT m.id, %L, e.id, e.valeur, e.valeur_norm, 'valide', $1, $2, j.ordre
      FROM jeupharma.matrice_medicaments m
      JOIN jeupharma.dcis d ON d.id = m.dci_id
      JOIN jeupharma.%I j ON j.matrice_id = m.id
      JOIN jeupharma.%I e ON e.id = j.%I AND e.actif
      WHERE m.statut = 'publie'
        AND d.valeur_norm IN (SELECT l.dci_norm FROM (VALUES
${normsSqlList}
        ) AS l(dci_norm))
      ON CONFLICT (matrice_id, champ_code, entite_key) WHERE statut <> 'retire' DO NOTHING
    $q$, r.champ, r.jt, r.ent, r.fk) USING src, ver;
  END LOOP;
END
$mirror$;
`;

  const skipComment =
    skipped.length > 0
      ? `\n-- DCI ignorées (pas de CIS sûr) : ${skipped.map((s) => `${s.dci_norm} (${s.reason})`).join('; ')}\n`
      : '';

  const body = header + skipComment + blocks.join('\n') + footer;
  await writeFile(OUT_SQL, body, 'utf8');
  await writeFile(
    OUT_REPORT,
    JSON.stringify(
      { generated_at: new Date().toISOString(), ok, skip, processed: processedNorms, skipped },
      null,
      2,
    ),
    'utf8',
  );
  console.log(`Wrote ${OUT_SQL} — ok=${ok} skip=${skip}`);
  console.log(`Report ${OUT_REPORT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
