#!/usr/bin/env node
/**
 * Reprise référentiel — régénération IA + vocabulaire unique partagé.
 *
 * Pour CHAQUE champ proposé par l’IA :
 *  1. VocabulaireIndex.resolve() (synonymes / abréviations / fuzzy)
 *  2. Réutilise l’UUID existant si équivalent
 *  3. Sinon crée UNE entité au libellé canonique (jamais de doublon HTA/Hypertension…)
 *
 * Prérequis env :
 *   GEMINI_API_KEY          — serveur uniquement (jamais commit)
 *   SUPABASE_URL            — https://kpjflntnotftpzffjbud.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY — écriture jeupharma (ops)
 *   ou SUPABASE_ANON_KEY + session admin (non couvert ici)
 *
 * Usage :
 *   node sql/ops/regen_referentiel_ia.mjs --dry-run --limit=5
 *   node sql/ops/regen_referentiel_ia.mjs --batch=20 --offset=0
 *   node sql/ops/regen_referentiel_ia.mjs --worst-first --limit=30
 *
 * Sortie : sql/ops/regen_referentiel_report.json (+ .ndjson progressif)
 */
import { writeFile, appendFile, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  VocabulaireIndex,
  libelleCanonique,
  valeurAPersister,
  cleCanonique,
} from './vocabulaire-canonique.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, '..', '..');
const REPORT = join(__dir, 'regen_referentiel_report.json');
const NDJSON = join(__dir, 'regen_referentiel_progress.ndjson');

const PROJECT_URL = process.env.SUPABASE_URL || 'https://kpjflntnotftpzffjbud.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const GEMINI_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
const MODEL = process.env.GEMINI_IA_MODEL || process.env.GEMINI_OCR_MODEL || 'gemini-3.8-flash';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    return m ? [m[1], m[2] == null ? true : m[2]] : [a, true];
  }),
);
const DRY = !!args['dry-run'];
const LIMIT = Number(args.limit || 0) || 0;
const OFFSET = Number(args.offset || 0) || 0;
const BATCH = Number(args.batch || 0) || 0;
const WORST = !!args['worst-first'];

const MULTI_CAPS = {
  nom_commercial: 8,
  secteur_therapeutique: 4,
  classe_therapeutique: 4,
  classe_pharmacologique: 4,
  voies_administration: 6,
  indications: 8,
  contre_indications: 8,
  effets_indesirables: 8,
  precautions_emploi: 8,
  interactions: 8,
  surveillances: 6,
  conditions_prescription_delivrance: 6,
  conseils_delivrance: 8,
};

const CHAMP_META = {
  nom_commercial: { table: 'noms_commerciaux', card: 'N', liaison: 'matrice_noms_commerciaux', fk: 'nom_commercial_id' },
  dci: { table: 'dcis', card: 1, col: 'dci_id' },
  secteur_therapeutique: { table: 'secteurs_therapeutiques', card: 'N', liaison: 'matrice_secteurs_therapeutiques', fk: 'secteur_therapeutique_id', col: 'secteur_therapeutique_id' },
  classe_therapeutique: { table: 'classes_therapeutiques', card: 'N', liaison: 'matrice_classes_therapeutiques', fk: 'classe_therapeutique_id', col: 'classe_therapeutique_id' },
  classe_pharmacologique: { table: 'classes_pharmacologiques', card: 'N', liaison: 'matrice_classes_pharmacologiques', fk: 'classe_pharmacologique_id', col: 'classe_pharmacologique_id' },
  detail_pharmacologie: { table: 'details_pharmacologie', card: 1, col: 'detail_pharmacologie_id' },
  posologie_generale: { table: 'posologies_generales', card: 1, col: 'posologie_generale_id' },
  grossesse_allaitement: { table: 'grossesse_allaitement', card: 1, col: 'grossesse_allaitement_id' },
  indications: { table: 'indications', card: 'N', liaison: 'matrice_indications', fk: 'indication_id' },
  contre_indications: { table: 'contre_indications', card: 'N', liaison: 'matrice_contre_indications', fk: 'contre_indication_id' },
  effets_indesirables: { table: 'effets_indesirables', card: 'N', liaison: 'matrice_effets_indesirables', fk: 'effet_indesirable_id' },
  precautions_emploi: { table: 'precautions_emploi', card: 'N', liaison: 'matrice_precautions_emploi', fk: 'precaution_emploi_id' },
  interactions: { table: 'interactions', card: 'N', liaison: 'matrice_interactions', fk: 'interaction_id' },
  surveillances: { table: 'surveillances', card: 'N', liaison: 'matrice_surveillances', fk: 'surveillance_id' },
  voies_administration: { table: 'voies_administration', card: 'N', liaison: 'matrice_voies_administration', fk: 'voie_administration_id' },
  conditions_prescription_delivrance: { table: 'conditions_prescription_delivrance', card: 'N', liaison: 'matrice_conditions_prescription_delivrance', fk: 'condition_prescription_delivrance_id' },
  conseils_delivrance: { table: 'conseils_delivrance', card: 'N', liaison: 'matrice_conseils_delivrance', fk: 'conseil_delivrance_id' },
};

const SYSTEM_PROMPT = `Tu es un assistant pédagogique pour Jeu Pharma (formation pharmacie d'officine / DEUST).
On te donne des rubriques extraites d'un RCP officiel (ANSM).
Tu condenses en libellés pédagogiques pour UNE fiche médicament (1 DCI = 1 fiche).

Réponds UNIQUEMENT par un JSON valide (pas de markdown) :
{
  "version": 1,
  "champs": {
    "nom_commercial": ["…"],
    "dci": "…",
    "secteur_therapeutique": ["Cardiovasculaire"],
    "classe_therapeutique": ["Anticoagulant"],
    "classe_pharmacologique": ["INHIBITEURS facteur Xa"],
    "detail_pharmacologie": "…",
    "posologie_generale": "…",
    "grossesse_allaitement": "…",
    "voies_administration": ["orale"],
    "indications": ["Hypertension artérielle"],
    "contre_indications": ["…"],
    "effets_indesirables": ["…"],
    "precautions_emploi": ["…"],
    "interactions": ["…"],
    "surveillances": ["…"],
    "conditions_prescription_delivrance": ["…"],
    "conseils_delivrance": ["…"]
  },
  "avertissements": []
}

VOCABULAIRE UNIQUE (obligatoire) :
- Toujours le même libellé canonique pour une notion : « Hypertension artérielle » (pas HTA, pas Hypertension seule).
- « Insuffisance cardiaque » (pas IC), « Fibrillation auriculaire » (pas FA).
- Classes : « Anticoagulant » (singulier), « Bêtabloquant », « Antiagrégant plaquettaire ».
- Pharma : « Inhibiteur de l'enzyme de conversion », « Antagoniste des récepteurs de l'angiotensine II », « Antivitamine K », « Anticoagulant oral direct », « Inhibiteur du facteur Xa ».
- Secteur : « Cardiovasculaire ».

Règles :
1. Fidélité stricte au RCP. Aucun fait inventé.
2. Condensation pédagogique : multi ~60–80 car. (max ~160) ; détail jusqu’à ~500.
3. EI : fréquents OU rares graves uniquement.
4. Multi-formes : annoter (comprimé)/(IV) si spécifique.
5. Caps : ≤ 8 items / champ multi.
6. Français, pas d'emoji.`;

function key() {
  if (!SERVICE_KEY && !ANON_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY ou SUPABASE_ANON_KEY requis');
  return SERVICE_KEY || ANON_KEY;
}

async function sb(path, { method = 'GET', body, schema = 'jeupharma' } = {}) {
  const res = await fetch(`${PROJECT_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: key(),
      Authorization: `Bearer ${key()}`,
      'Content-Type': 'application/json',
      Prefer: method === 'POST' ? 'return=representation' : 'return=minimal',
      'Accept-Profile': schema,
      'Content-Profile': schema,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`PostgREST ${method} ${path}: ${res.status} ${t.slice(0, 400)}`);
  }
  if (res.status === 204) return null;
  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('json')) return null;
  return res.json();
}

async function rpc(fn, args) {
  const res = await fetch(`${PROJECT_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      apikey: key(),
      Authorization: `Bearer ${key()}`,
      'Content-Type': 'application/json',
      'Accept-Profile': 'jeupharma',
      'Content-Profile': 'jeupharma',
    },
    body: JSON.stringify(args),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`RPC ${fn}: ${res.status} ${t.slice(0, 400)}`);
  }
  return res.json();
}

function decodeHtml(s) {
  return s
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function cleanHtml(html) {
  return decodeHtml(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<\/(p|div|tr|li|h\d)>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

function extractAnsmSections(html) {
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

async function fetchAnsmRcp(cis) {
  const url = `https://base-donnees-publique.medicaments.gouv.fr/medicament/${encodeURIComponent(cis)}/extrait`;
  let html = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'JeuPharma-IA-batch/1.0 (ops pédagogique)' },
    });
    if (!res.ok) throw new Error(`ANSM HTTP ${res.status}`);
    html = await res.text();
    if (/AmmAnnexeTitre/i.test(html) && html.length > 20_000) break;
    await new Promise((r) => setTimeout(r, 700 * (attempt + 1)));
  }
  const raw = extractAnsmSections(html);
  const SECTIONS = ['4.1', '4.2', '4.3', '4.4', '4.5', '4.6', '4.8', '5.1'];
  const labels = {
    '4.1': 'Indications',
    '4.2': 'Posologie',
    '4.3': 'CI',
    '4.4': 'Précautions',
    '4.5': 'Interactions',
    '4.6': 'Grossesse',
    '4.8': 'EI',
    '5.1': 'Pharmacodynamie',
  };
  const parts = [];
  let total = 0;
  for (const num of SECTIONS) {
    if (!raw[num]) continue;
    const cleaned = cleanHtml(raw[num]).replace(/^\d\.\d\.?\s*[^\n]*\n/, '').slice(0, 18_000);
    total += cleaned.length;
    parts.push(`## ${num} ${labels[num]}\n${cleaned}`);
  }
  return { url, text: parts.join('\n\n').slice(0, 100_000), total };
}

async function callGemini(userText) {
  if (!GEMINI_KEY) throw new Error('GEMINI_API_KEY manquant (serveur uniquement)');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:generateContent`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_KEY },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: 'user', parts: [{ text: userText }] }],
      generationConfig: {
        temperature: 0.15,
        responseMimeType: 'application/json',
        maxOutputTokens: 8192,
      },
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}: ${JSON.stringify(body).slice(0, 300)}`);
  let raw = body.candidates?.[0]?.content?.parts?.map((x) => x.text || '').join('') || '';
  if (!raw) throw new Error('Gemini réponse vide');
  if (raw.startsWith('```')) raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  return JSON.parse(raw);
}

async function searchBdmCis(dci) {
  const res = await fetch(`${PROJECT_URL}/rest/v1/rpc/search_products`, {
    method: 'POST',
    headers: {
      apikey: key(),
      Authorization: `Bearer ${key()}`,
      'Content-Type': 'application/json',
      'Accept-Profile': 'bdm',
      'Content-Profile': 'bdm',
    },
    body: JSON.stringify({ q: dci, lim: 15 }),
  });
  if (!res.ok) return [];
  return (await res.json()) || [];
}

function pickCis(hits, dci) {
  if (!hits?.length) return null;
  const dciN = cleCanonique(dci);
  const scored = hits.map((h) => {
    let score = 0;
    const denom = String(h.denomination || h.nom || '').toLowerCase();
    const subst = String(h.substances || h.substance || '').toLowerCase();
    if (subst.includes(dciN.split(' ')[0])) score += 50;
    if (/comprim|gelule|capsule|orale/i.test(denom + ' ' + (h.forme || ''))) score += 20;
    if (/inject|perfus|solut/i.test(denom)) score -= 10;
    return { cis: String(h.cis || h.code_cis || '').replace(/\D/g, ''), score, h };
  }).filter((x) => x.cis);
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.cis || null;
}

/** Indexes vocabulaire par table — chargés une fois, enrichis au fil des créations. */
async function loadIndexes() {
  /** @type {Record<string, VocabulaireIndex>} */
  const indexes = {};
  const tables = [...new Set(Object.values(CHAMP_META).map((m) => m.table))];
  for (const table of tables) {
    const rows = await sb(`${table}?actif=eq.true&select=id,valeur,valeur_norm&limit=5000`);
    indexes[table] = new VocabulaireIndex(rows || [], { fuzzyMin: 0.92 });
  }
  return indexes;
}

/**
 * Résout une proposition IA → UUID (réutilise canonique si synonyme).
 * @returns {Promise<{ id: string, valeur: string, match: string, created: boolean }|null>}
 */
async function resolveEntite(indexes, table, valeurProposee) {
  const raw = String(valeurProposee || '').trim();
  if (!raw) return null;
  const idx = indexes[table];
  const { entite, match } = idx.resolve(raw);
  if (entite) {
    return { id: entite.id, valeur: entite.valeur, match, created: false };
  }
  const label = libelleCanonique(raw);
  if (DRY) {
    return { id: `dry-${cleCanonique(label)}`, valeur: label, match: 'nouveau', created: true };
  }
  // Préférer RPC ops (alias SQL) si disponible
  try {
    const id = await rpc('ops_entite_find_or_create', { p_table: table, p_valeur: label });
    if (id) {
      const row = { id, valeur: label };
      idx.register(row);
      return { id, valeur: label, match: 'nouveau', created: true };
    }
  } catch {
    // fallback insert REST
  }
  const created = await sb(table, { method: 'POST', body: { valeur: label, actif: true } });
  const row = Array.isArray(created) ? created[0] : created;
  if (!row?.id) throw new Error(`Création échouée ${table}: ${label}`);
  idx.register(row);
  return { id: row.id, valeur: row.valeur || label, match: 'nouveau', created: true };
}

async function replaceLiaisons(matriceId, meta, entityIds) {
  if (DRY) return;
  await sb(`${meta.liaison}?matrice_id=eq.${matriceId}`, { method: 'DELETE' });
  if (!entityIds.length) return;
  const rows = entityIds.map((eid, ordre) => ({
    matrice_id: matriceId,
    [meta.fk]: eid,
    ordre,
  }));
  await sb(meta.liaison, { method: 'POST', body: rows });
}

async function applyFiche(indexes, matriceId, champs) {
  const patch = { fiche_validee: false, updated_at: new Date().toISOString() };
  const stats = { reused: 0, created: 0, matches: [] };

  for (const [code, meta] of Object.entries(CHAMP_META)) {
    const raw = champs?.[code];
    if (raw == null || raw === '') continue;

    if (meta.card === 1) {
      const resolved = await resolveEntite(indexes, meta.table, String(raw));
      if (!resolved) continue;
      if (resolved.created) stats.created += 1;
      else stats.reused += 1;
      stats.matches.push({ code, match: resolved.match, valeur: resolved.valeur });
      if (!DRY) patch[meta.col] = resolved.id;
    } else {
      const arr = Array.isArray(raw) ? raw : [raw];
      const ids = [];
      const seen = new Set();
      const cap = MULTI_CAPS[code] || 8;
      for (const v of arr.slice(0, cap)) {
        const resolved = await resolveEntite(indexes, meta.table, String(v));
        if (!resolved || seen.has(resolved.id)) continue;
        seen.add(resolved.id);
        ids.push(resolved.id);
        if (resolved.created) stats.created += 1;
        else stats.reused += 1;
        stats.matches.push({ code, match: resolved.match, valeur: resolved.valeur });
      }
      await replaceLiaisons(matriceId, meta, ids);
      if (meta.col && ids[0] && !DRY) patch[meta.col] = ids[0];
    }
  }

  if (!DRY && Object.keys(patch).length > 1) {
    await sb(`matrice_medicaments?id=eq.${matriceId}`, { method: 'PATCH', body: patch });
  }
  return stats;
}

async function listFiches() {
  const rows = await sb(
    'matrice_medicaments?statut=neq.archive&select=id,dci_id,fiche_validee,statut&order=updated_at.asc&limit=500',
  );
  const withDci = [];
  for (const m of rows || []) {
    const dci = await sb(`dcis?id=eq.${m.dci_id}&select=id,valeur,valeur_norm`);
    withDci.push({ ...m, dci: dci?.[0]?.valeur || '', dci_norm: dci?.[0]?.valeur_norm || '' });
  }
  if (WORST) {
    // Priorité : fiches avec précautions/interactions les plus longues (approx via count liaisons)
    // Pour simplicité : ordre alphabétique DCI après offset — le scoring worst est fait côté SQL avant.
  }
  return withDci;
}

async function main() {
  console.log(JSON.stringify({
    dry: DRY,
    limit: LIMIT,
    offset: OFFSET,
    batch: BATCH,
    worst: WORST,
    hasGemini: !!GEMINI_KEY,
    hasService: !!SERVICE_KEY,
  }));

  if (!GEMINI_KEY) {
    console.error('GEMINI_API_KEY manquant — arrêt (secret Edge uniquement, à fournir en env ops).');
    process.exit(2);
  }

  const indexes = await loadIndexes();
  let fiches = await listFiches();
  if (OFFSET) fiches = fiches.slice(OFFSET);
  const lim = BATCH || LIMIT || fiches.length;
  fiches = fiches.slice(0, lim);

  const report = { started_at: new Date().toISOString(), ok: [], errors: [], dry: DRY };

  for (const f of fiches) {
    const entry = { matrice_id: f.id, dci: f.dci, at: new Date().toISOString() };
    try {
      const hits = await searchBdmCis(f.dci);
      const cis = pickCis(hits, f.dci);
      if (!cis) {
        entry.error = 'no_cis';
        report.errors.push(entry);
        await appendFile(NDJSON, JSON.stringify(entry) + '\n');
        console.warn('SKIP no CIS', f.dci);
        continue;
      }
      const rcp = await fetchAnsmRcp(cis);
      if (rcp.total < 80) {
        entry.error = 'rcp_vide';
        entry.cis = cis;
        report.errors.push(entry);
        await appendFile(NDJSON, JSON.stringify(entry) + '\n');
        console.warn('SKIP RCP vide', f.dci, cis);
        continue;
      }
      const userText = [
        `DCI : ${f.dci}`,
        `CIS principal : ${cis}`,
        'Type : mono-substance (sauf si DCI contient +)',
        '',
        '--- RCP ---',
        rcp.text,
        '',
        'Retourne le JSON demandé (libellés CANONIQUES partagés).',
      ].join('\n');

      const parsed = await callGemini(userText);
      const champs = parsed?.champs || parsed || {};
      // Imposer DCI existante (ne pas créer de doublon DCI)
      champs.dci = f.dci;

      const stats = await applyFiche(indexes, f.id, champs);
      entry.cis = cis;
      entry.stats = stats;
      entry.ok = true;
      report.ok.push(entry);
      await appendFile(NDJSON, JSON.stringify(entry) + '\n');
      console.log('OK', f.dci, `reused=${stats.reused} created=${stats.created}`);
      await new Promise((r) => setTimeout(r, 1200));
    } catch (e) {
      entry.error = e instanceof Error ? e.message : String(e);
      report.errors.push(entry);
      await appendFile(NDJSON, JSON.stringify(entry) + '\n');
      console.error('ERR', f.dci, entry.error);
    }
  }

  report.finished_at = new Date().toISOString();
  report.counts = { ok: report.ok.length, errors: report.errors.length };
  await writeFile(REPORT, JSON.stringify(report, null, 2), 'utf8');
  console.log('Report →', REPORT, report.counts);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
