/**
 * Jeu Pharma — IA studio / Preview : texte·PDF → blocs, ou mode `modifier` → nœuds structurels.
 * Secret : GEMINI_API_KEY (déjà utilisé par `ocr-map-fields`).
 * Modèle : GEMINI_IA_MODEL > GEMINI_OCR_MODEL (réutilise la config existante) > 'gemini-3.8-flash'.
 * Raisonnement : GEMINI_IA_THINKING (défaut 'low').
 * Accès : admin métier uniquement = portail.profiles.role === 'admin'.
 * Prompt système : jeupharma.ia_config.blocs_system si présent, sinon constante ;
 *   suffixe PROGRESSION_SUFFIX toujours append (non éditable).
 * Schéma de sortie : voir IA/README.md.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MODEL = Deno.env.get('GEMINI_IA_MODEL') || Deno.env.get('GEMINI_OCR_MODEL') || 'gemini-3.8-flash';
const THINKING = Deno.env.get('GEMINI_IA_THINKING') || 'low';
const MAX_TEXT = 80_000; // caractères
const MAX_PDF_B64 = 14_000_000; // ≈ 10 Mo de PDF
const MAX_INSTRUCTION = 20_000;
const MAX_BLOCS = 40;
const MAX_NODES = 80;
const TYPES = ['texte', 'conseil', 'recommandation', 'video', 'photo', 'molecule'];
const KINDS = ['chapitre', 'lecon', 'section', 'bloc'];
const ACTIONS = ['create', 'update', 'delete', 'keep'];

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function assertAdmin(authHeader: string) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !anonKey) return { ok: false, status: 500, error: 'Config Supabase manquante' };

  const portail = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    db: { schema: 'portail' },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: { user }, error } = await portail.auth.getUser();
  if (error || !user) return { ok: false, status: 401, error: 'Session invalide' };

  const { data: profile } = await portail.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (profile?.role !== 'admin') return { ok: false, status: 403, error: 'IA réservée aux administrateurs' };
  return { ok: true, userId: user.id, authHeader, supabaseUrl, anonKey };
}

const SYSTEM_PROMPT = `Tu es un assistant pédagogique pour une application de formation en pharmacie d'officine (Jeu Pharma, DEUST / apprentis).
On te donne le contenu brut d'une leçon (texte collé ou PDF exporté d'un PowerPoint / Google Docs). Tu le restructures en BLOCS de leçon.

Réponds UNIQUEMENT par un JSON valide (pas de markdown) :
{
  "version": 1,
  "resume_lecon": "1-2 phrases (optionnel)",
  "blocs": [ ... ],
  "avertissements": ["limites, passages illisibles, éléments à compléter"]
}

Types de blocs autorisés (champ "type") :
- "texte"   : { "type":"texte", "titre":"", "html":"<h2>…</h2><p>…</p><ul><li>…</li></ul>" }
- "conseil" : { "type":"conseil", "titre":"", "pathologie":"Ex. Anémie ferriprive", "corps_html":"<ul><li>conseil officinal…</li></ul>" } — conseils / points de vigilance au comptoir, présents dans le cours.
- "recommandation" : { "type":"recommandation", "titre":"", "corps_html":"<p>À retenir…</p>", "lien_label":"", "lien_href":"", "lien_bloc_index": null } — synthèse « à retenir » / rappel. lien_bloc_index = index (0 = premier bloc de TA liste) d'un bloc de cette leçon à pointer, sinon null. lien_href uniquement une URL https présente dans la source, sinon "".
- "photo"    : { "type":"photo", "titre":"", "url":"", "alt":"description de l'image", "legende":"" } — pour chaque schéma / figure / image importante du support. "url" UNIQUEMENT si une URL https d'image figure dans la source ; sinon "" (l'admin ajoutera l'image). Décris dans "alt" ce que l'image devrait montrer.
- "video"    : { "type":"video", "titre":"", "url":"https://…" } — UNIQUEMENT si une URL YouTube / Vimeo / .mp4 figure dans la source.
- "molecule": { "type":"molecule", "titre":"", "dci":["…"] } — UNIQUEMENT avec des DCI présentes mot pour mot dans la liste "molecules_lecon" fournie. N'invente jamais de molécule. Si la liste est vide, aucun bloc molecule.
Jamais de bloc "jeu".

Règles :
1. Fidélité : n'utilise QUE le contenu fourni. N'ajoute aucune donnée clinique, posologie, valeur ou molécule absente de la source. Si un passage est illisible ou ambigu, ignore-le et signale-le dans "avertissements".
2. Découpe logique : un bloc "texte" par grande section (titre h2, sous-titres h3, listes). Pas de bloc géant : vise des blocs lisibles (≈ 80 à 400 mots). Conserve les définitions, mécanismes, classes, listes de signes, valeurs de référence présents.
3. HTML limité à : p, h2, h3, ul, ol, li, strong, em, u, br. Aucun style, lien, image ni script dans le HTML.
4. Langue : français, vocabulaire de la source. Pas d'emoji.
5. Ordre : suis l'ordre du support. Les blocs "recommandation" / "conseil" viennent après la section qu'ils concernent.
6. Évite les doublons avec "blocs_existants" (titres déjà présents dans la leçon).
7. "titre" : court (≤ 80 caractères), facultatif pour "texte" (peut être "").
8. Maximum ${MAX_BLOCS} blocs.`;

/** Suffixe non éditable — toujours append au prompt système. */
const PROGRESSION_SUFFIX = `
## Progression pédagogique (obligatoire)
Les niveaux d'accès parcours sont ★1 à ★5 :
- ★1 = DEUST Préparateur (débutant)
- ★5 = pharmacien confirmé
(les niveaux intermédiaires ★2–★4 progressent entre ces deux pôles).
Quand tu proposes du contenu textuel, fournis une Base et des variantes distinctes dans variantes{"1","2","3","4","5"} si la consigne / le niveau le demande ; sinon omets les clés inutiles.
N'invente rien : utilise uniquement le contexte, la consigne et les sources fournies. Aucune donnée clinique, posologie ou molécule absente du matériau.
Tu peux proposer de créer, modifier ou supprimer des chapitres, sections, leçons et blocs (actions create / update / delete / keep).`;

/**
 * Prompt dédié Preview « modifier » — éditeur pédagogique, PAS le générateur PDF.
 * Réponse = ARBRE imbriqué (chapitre → leçons → sections → blocs).
 */
const MODIFIER_SYSTEM = `Tu es un éditeur pédagogique pour Jeu Pharma (formation pharmacie d'officine, DEUST / apprentis).
On te donne le CONTENU ACTUEL d'une leçon ou d'un CHAPITRE (toutes ses leçons), plus une instruction.
Ton rôle : produire l'état souhaité du cours, bien ordonné — pas inventer un nouveau cours hors matériau.

## Architecture (OBLIGATOIRE)
La hiérarchie est TOUJOURS :
  parcours > chapitre > leçon > (section?) > blocs
- Un chapitre contient des leçons (jamais des blocs directement).
- Une leçon contient des sections et/ou des blocs.
- Une section contient des blocs.
- Les blocs d'une leçon sont TOUJOURS listés DANS cette leçon (enfants), jamais avant le nœud leçon.

## Ordre pédagogique dans une leçon (guide, adaptable au sujet)
1. Physiologie / définitions / rappels
2. Pathologie / clinique / mécanismes
3. Médicaments / classes / posologies (si le sujet le demande)
4. Conseils de délivrance / vigilance comptoir
5. « À retenir » / synthèse
Les ★ ajoutent du détail (★1 plus simple, ★5 plus riche) sans casser cet ordre.

## Règles d'édition
1. Keep-first : si inchangé, action "keep" + même ref_id. update ciblé ; create si nouveau (ref_id null).
2. SUPPRESSION = OMISSION : ne mentionne PAS un élément à supprimer (pas d'action delete). Le client déduit les absents.
3. Pour tout élément existant conservé/modifié : reprends EXACTEMENT son ref_id.
4. HTML propre : uniquement p,h2,h3,ul,ol,li,strong,em,u,br. Titres courts. Une idée par bloc.
5. Fidélité : aucune invention clinique hors contenu actuel + instruction + sources jointes.
6. Si la cible est un chapitre : traite TOUTES les leçons du chapitre (pas seulement la première).
7. Maximum ${MAX_NODES} éléments au total. Signale les limites dans avertissements.

## Jeux (OBLIGATOIRE)
- Tout bloc existant payload.type = "jeu" DOIT réapparaître (keep ou update) avec le MÊME ref_id.
- Tu peux le repositionner (ordre / leçon parente) pour qu'il soit au bon endroit pédagogique (souvent après le contenu de la leçon).
- Conserve modele_id, code_unique, type_jeu du payload. Ne crée PAS de nouveau jeu sans modele_id existant.
- Ne supprime JAMAIS un jeu (ne l'omets pas).

## Photos / images
- Blocs photo existants : keep/update avec le même ref_id ; conserve path et url ; tu peux améliorer titre, alt, legende.
- Repositionne selon l'utilité (schéma près de la notion illustrée).
- Depuis le PDF/texte joint : tu peux CRÉER des blocs photo si une URL https d'image figure dans la source, ou avec url="" + alt/titre descriptifs (l'admin complétera le fichier).
- N'invente pas d'URL. Ne supprime une photo que si elle est clairement hors sujet / doublon inutile.

## Format de réponse (JSON uniquement, pas de markdown)
{
  "version": 2,
  "arbre": {
    "kind": "chapitre|lecon",
    "ref_id": "uuid ou null",
    "action": "keep|update|create",
    "titre": "",
    "ordre": 0,
    "niveaux": { "min": 1, "max": 5 },
    "payload": {},
    "variantes": {},
    "enfants": [
      {
        "kind": "lecon",
        "ref_id": "…",
        "action": "keep|update|create",
        "titre": "",
        "ordre": 0,
        "payload": { "resume": "…" },
        "enfants": [
          {
            "kind": "section|bloc",
            "ref_id": "…",
            "action": "keep|update|create",
            "titre": "",
            "ordre": 10,
            "payload": { "type": "texte", "html": "…" },
            "enfants": []
          }
        ]
      }
    ]
  },
  "avertissements": []
}
- Si la cible est une seule leçon, "arbre.kind" = "lecon" (sans chapitre parent obligatoire).
- kind "bloc" : payload.type ∈ texte|conseil|recommandation|photo|video|molecule|jeu.
- jeu : { "type":"jeu", "modele_id":"…", "code_unique":"JP-…", "type_jeu":"quiz|…" } — uniquement keep/update d'un ref_id existant.
- photo : { "type":"photo", "path":"…", "url":"https://… ou vide", "alt":"…", "legende":"…" }.
- Ordre des tableaux "enfants" = ordre d'affichage final.`;

async function loadSystemPromptBase(authHeader: string, supabaseUrl: string, anonKey: string): Promise<string> {
  try {
    const jeu = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      db: { schema: 'jeupharma' },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data, error } = await jeu.from('ia_config').select('valeur').eq('cle', 'blocs_system').maybeSingle();
    if (!error && data?.valeur && String(data.valeur).trim()) {
      return String(data.valeur).trim();
    }
  } catch (e) {
    console.warn('ia_config.blocs_system indisponible, constante utilisée', e);
  }
  return SYSTEM_PROMPT;
}

const MODIFIER_PROGRESSION = `
## Progression pédagogique (★)
Les niveaux d'accès parcours sont ★1 à ★5 (★1 = DEUST débutant, ★5 = pharmacien confirmé).
Quand tu enrichis le contenu, fournis une Base et des variantes distinctes dans variantes{"1"…"5"} si utile ; sinon omets les clés inutiles.
N'invente rien hors contenu actuel + instruction + sources. Les ★ ajoutent du détail sans casser l'ordre physiologie → pathologie → médicaments → conseils.`;

function buildSystemPrompt(base: string, mode: string) {
  // Mode modifier : prompt éditeur dédié (pas le générateur PDF).
  if (mode === 'modifier') {
    return `${MODIFIER_SYSTEM.trim()}\n${MODIFIER_PROGRESSION}`;
  }
  return `${base.trim()}\n${PROGRESSION_SUFFIX}`;
}

function buildUserText(p: Record<string, unknown>) {
  const ctx = (p.context && typeof p.context === 'object' ? p.context : {}) as Record<string, unknown>;
  const mols = Array.isArray(ctx.molecules) ? ctx.molecules.map((m) => String(m)).slice(0, 80) : [];
  const exist = Array.isArray(ctx.blocs_existants) ? ctx.blocs_existants.slice(0, 60) : [];
  return [
    `Leçon : ${String(ctx.titre || '(sans titre)').slice(0, 200)}`,
    ctx.resume ? `Résumé existant : ${String(ctx.resume).slice(0, 500)}` : '',
    `molecules_lecon : ${JSON.stringify(mols)}`,
    `blocs_existants : ${JSON.stringify(exist)}`,
    '',
    typeof p.text === 'string' && p.text.trim()
      ? `--- CONTENU TEXTE ---\n${String(p.text).slice(0, MAX_TEXT)}`
      : '',
    p.pdfBase64 ? `Le PDF joint${p.pdfName ? ` (« ${String(p.pdfName).slice(0, 120)} »)` : ''} est le support de cours à structurer.` : '',
    'Retourne le JSON demandé.',
  ].filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n');
}

/** Budget caractères mode modifier — sommaire lisible prioritaire. */
const MAX_MODIFIER_READABLE = 120_000;
const MAX_MODIFIER_IDS = 40_000;
const MAX_MODIFIER_META = 6_000;
const MAX_MODIFIER_REFS = 20_000;

function nodeBodyText(n: Record<string, unknown>): string {
  const payload = (n.payload && typeof n.payload === 'object' && !Array.isArray(n.payload))
    ? n.payload as Record<string, unknown>
    : {};
  const parts: string[] = [];
  if (payload.resume != null) parts.push(String(payload.resume));
  if (payload.html != null) parts.push(String(payload.html));
  if (payload.corps_html != null) parts.push(String(payload.corps_html));
  if (payload.pathologie != null) parts.push('Pathologie : ' + String(payload.pathologie));
  if (Array.isArray(payload.dci) && payload.dci.length) parts.push('DCI : ' + payload.dci.join(', '));
  if (payload.type != null && n.kind === 'bloc') parts.push('(type=' + String(payload.type) + ')');
  if (payload.type === 'jeu') {
    if (payload.code_unique) parts.push('code=' + String(payload.code_unique));
    if (payload.modele_id) parts.push('modele_id=' + String(payload.modele_id));
    if (payload.type_jeu) parts.push('type_jeu=' + String(payload.type_jeu));
  }
  if (payload.type === 'photo') {
    if (payload.path) parts.push('path=' + String(payload.path).slice(0, 80));
    if (payload.url) parts.push('url=' + String(payload.url).slice(0, 120));
    if (payload.alt) parts.push('alt=' + String(payload.alt).slice(0, 120));
  }
  const variantes = (n.variantes && typeof n.variantes === 'object' && !Array.isArray(n.variantes))
    ? n.variantes as Record<string, unknown>
    : {};
  const vKeys = Object.keys(variantes).filter((k) => variantes[k] != null);
  if (vKeys.length) parts.push('Variantes ★ présentes : ' + vKeys.join(', '));
  return parts.join('\n').trim();
}

/** Texte structuré hiérarchique (chapitre → leçon → blocs) pour l’éditeur. */
function formatNodesReadable(nodes: unknown[]): string {
  const list = nodes.filter((n) => n && typeof n === 'object') as Record<string, unknown>[];
  const lines: string[] = [
    '## Architecture actuelle (respecte cette hiérarchie dans ta réponse arbre)',
    'chapitre > leçon > section? > blocs — les blocs d’une leçon sont TOUJOURS sous cette leçon.',
    '',
  ];
  let currentLecon: string | null = null;
  list.forEach((n, i) => {
    const kind = String(n.kind || 'bloc');
    const type = (n.payload && typeof n.payload === 'object' && (n.payload as Record<string, unknown>).type)
      ? String((n.payload as Record<string, unknown>).type)
      : kind;
    const titre = String(n.titre || '(sans titre)');
    const ref = n.ref_id != null ? String(n.ref_id) : 'null';
    const parent = n.parent_ref != null ? String(n.parent_ref) : 'null';
    const ordre = n.ordre != null ? String(n.ordre) : String(i);
    if (kind === 'chapitre') {
      lines.push(`# CHAPITRE « ${titre} » ref_id=${ref} ordre=${ordre}`);
      currentLecon = null;
    } else if (kind === 'lecon') {
      lines.push(`## LEÇON « ${titre} » ref_id=${ref} parent=${parent} ordre=${ordre}`);
      currentLecon = ref;
    } else if (kind === 'section') {
      lines.push(`### SECTION « ${titre} » ref_id=${ref} parent_lecon=${parent} ordre=${ordre}`);
    } else {
      lines.push(`#### BLOC [${type}] « ${titre} » ref_id=${ref} parent_lecon=${parent || currentLecon} ordre=${ordre}`);
    }
    const body = nodeBodyText(n);
    if (body) lines.push(body);
    lines.push('');
  });
  return lines.join('\n').slice(0, MAX_MODIFIER_READABLE);
}

/** Annexe machine : ids + actions pour ne pas perdre les ref_id. */
function formatNodesIdIndex(nodes: unknown[]): string {
  const list = nodes.filter((n) => n && typeof n === 'object') as Record<string, unknown>[];
  const compact = list.map((n, i) => ({
    i: i + 1,
    temp_id: n.temp_id || null,
    kind: n.kind || null,
    ref_id: n.ref_id ?? null,
    parent_ref: n.parent_ref ?? null,
    ordre: n.ordre ?? i,
    titre: String(n.titre || '').slice(0, 80),
    type: (n.payload && typeof n.payload === 'object'
      ? (n.payload as Record<string, unknown>).type
      : null) || null,
  }));
  return JSON.stringify(compact).slice(0, MAX_MODIFIER_IDS);
}

function buildModifierUserText(p: Record<string, unknown>) {
  const ctx = (p.context && typeof p.context === 'object' ? p.context : {}) as Record<string, unknown>;
  const cibleObj = (p.cible && typeof p.cible === 'object' ? p.cible : {}) as Record<string, unknown>;
  const nodes = Array.isArray(cibleObj.nodes)
    ? cibleObj.nodes
    : (Array.isArray(ctx.nodes) ? ctx.nodes : []);
  const readable = formatNodesReadable(nodes);
  const idIndex = formatNodesIdIndex(nodes);
  const refs = Array.isArray(ctx.references) ? ctx.references : [];
  const refsSummary = refs.map((r) => {
    if (!r || typeof r !== 'object') return null;
    const o = r as Record<string, unknown>;
    const nodesR = Array.isArray(o.nodes) ? o.nodes : [];
    const titles = nodesR
      .filter((n) => n && typeof n === 'object')
      .slice(0, 40)
      .map((n) => String((n as Record<string, unknown>).titre || '').slice(0, 60))
      .filter(Boolean);
    return {
      role: o.role || null,
      label: o.label || null,
      note: o.note || null,
      titres: titles,
    };
  }).filter(Boolean);
  const refsJson = refsSummary.length ? JSON.stringify(refsSummary).slice(0, MAX_MODIFIER_REFS) : '';
  const meta = {
    type: cibleObj.type || null,
    parcours_id: cibleObj.parcours_id || null,
    module_id: cibleObj.module_id || null,
    chapitre: cibleObj.chapitre || ctx.chapitre || null,
    lecon: cibleObj.lecon || ctx.lecon || null,
    titre: ctx.titre || null,
    resume: ctx.resume || null,
    molecules: ctx.molecules || [],
    parcours: ctx.parcours || null,
  };
  const metaJson = JSON.stringify(meta).slice(0, MAX_MODIFIER_META);
  const niveau = p.niveau != null ? String(p.niveau).slice(0, 20) : '';
  return [
    'Mode : éditeur Preview — réponse = ARBRE JSON (chapitre → leçons → sections → blocs).',
    'Si cible = chapitre : inclus TOUTES les leçons. Blocs toujours enfants de leur leçon.',
    'Ordre pédagogique guide : physiologie → pathologie → médicaments → conseils (adaptable).',
    'Omets les éléments à supprimer. Keep-first. NE PAS omettre les blocs jeu ni les photos utiles.',
    'Jeux existants : keep/update + même ref_id ; repositionne dans la bonne leçon. Photos : keep + titres/alt ; create si image dans le document.',
    niveau ? `Niveau cible (barre) : ${niveau}` : '',
    `Métadonnées :\n${metaJson}`,
    `Instruction admin :\n${String(p.instruction || '').slice(0, MAX_INSTRUCTION)}`,
    '',
    `--- CONTENU ACTUEL (${nodes.length} nœuds) ---`,
    readable,
    '',
    '--- INDEX ref_id (à reprendre pour keep/update) ---',
    idIndex,
    '',
    refsJson
      ? `--- RÉFÉRENCES OPTIONNELLES (titres seulement) ---\n${refsJson}`
      : '',
    typeof p.text === 'string' && p.text.trim()
      ? `--- TEXTE COMPLÉMENTAIRE ---\n${String(p.text).slice(0, MAX_TEXT)}`
      : '',
    p.pdfBase64 ? `PDF joint${p.pdfName ? ` (« ${String(p.pdfName).slice(0, 120)} »)` : ''} : support complémentaire.` : '',
    'Retourne { version:2, arbre:{…enfants:[…]}, avertissements:[] }.',
  ].filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n');
}

function parseJsonResponse(raw: string) {
  let text = String(raw || '').trim();
  if (text.startsWith('```')) text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  return JSON.parse(text);
}

const str = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);
const httpsUrl = (v: unknown) => {
  const u = String(v ?? '').trim();
  return /^https:\/\/\S+$/i.test(u) ? u.slice(0, 600) : '';
};

function clampNiveau(n: unknown, fallback: number) {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(5, Math.max(1, Math.round(v)));
}

function parseNiveaux(n: unknown): { min: number; max: number } {
  if (n && typeof n === 'object' && !Array.isArray(n)) {
    const o = n as Record<string, unknown>;
    const min = clampNiveau(o.min ?? o.niveau_min, 1);
    const max = clampNiveau(o.max ?? o.niveau_max, 5);
    return { min: Math.min(min, max), max: Math.max(min, max) };
  }
  if (Array.isArray(n) && n.length >= 2) {
    const min = clampNiveau(n[0], 1);
    const max = clampNiveau(n[1], 5);
    return { min: Math.min(min, max), max: Math.max(min, max) };
  }
  return { min: 1, max: 5 };
}

function sanitizePayload(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const src = raw as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  const type = str(src.type, 40);
  if (type) out.type = type;
  if (src.html != null) out.html = str(src.html, 20_000);
  if (src.corps_html != null) out.corps_html = str(src.corps_html, 12_000);
  if (src.pathologie != null) out.pathologie = str(src.pathologie, 160);
  if (src.resume != null) out.resume = str(src.resume, 2000);
  if (src.alt != null) out.alt = str(src.alt, 300);
  if (src.legende != null) out.legende = str(src.legende, 300);
  if (src.url != null) out.url = httpsUrl(src.url) || str(src.url, 600);
  if (src.path != null) out.path = str(src.path, 400);
  if (src.lien_label != null) out.lien_label = str(src.lien_label, 120);
  if (src.lien_href != null) out.lien_href = httpsUrl(src.lien_href);
  if (Array.isArray(src.dci)) {
    out.dci = src.dci.map((d) => str(d, 120)).filter(Boolean).slice(0, 20);
  }
  if (Array.isArray(src.matrice_ids)) {
    out.matrice_ids = src.matrice_ids.map((d) => str(d, 80)).filter(Boolean).slice(0, 20);
  }
  if (src.matrice_id != null) out.matrice_id = str(src.matrice_id, 80);
  if (src.modele_id != null) out.modele_id = str(src.modele_id, 80);
  if (src.code_unique != null) out.code_unique = str(src.code_unique, 40);
  if (src.type_jeu != null) out.type_jeu = str(src.type_jeu, 40);
  if (src.mode != null) out.mode = str(src.mode, 40);
  if (src.valeurs && typeof src.valeurs === 'object' && !Array.isArray(src.valeurs)) {
    try {
      const vs = JSON.stringify(src.valeurs);
      if (vs.length <= 8000) out.valeurs = JSON.parse(vs);
    } catch { /* ignore */ }
  }
  if (Array.isArray(src.references)) {
    out.references = src.references.slice(0, 20);
  }
  // Conserver d’autres clés scalaires courtes (sans gonfler)
  for (const k of Object.keys(src)) {
    if (out[k] != null) continue;
    const v = src[k];
    if (typeof v === 'string') out[k] = str(v, 2000);
    else if (typeof v === 'number' || typeof v === 'boolean') out[k] = v;
  }
  return out;
}

function sanitizeVariantes(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const src = raw as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of ['1', '2', '3', '4', '5']) {
    if (src[k] == null) continue;
    if (typeof src[k] === 'object' && !Array.isArray(src[k])) {
      out[k] = sanitizePayload(src[k]);
    } else if (typeof src[k] === 'string') {
      out[k] = { html: str(src[k], 20000) };
    }
  }
  return out;
}

/** Normalisation défensive (types autorisés, tailles, URLs https). Le client re-sanitise le HTML. */
function normalize(parsed: any, allowedDci: string[]) {
  const dciSet = new Set(allowedDci.map((d) => d.toLowerCase()));
  const warnings: string[] = Array.isArray(parsed?.avertissements)
    ? parsed.avertissements.map((w: unknown) => str(w, 300)).filter(Boolean).slice(0, 20)
    : [];
  const out: any[] = [];
  for (const b of Array.isArray(parsed?.blocs) ? parsed.blocs : []) {
    if (!b || typeof b.type !== 'string' || !TYPES.includes(b.type)) continue;
    const titre = str(b.titre, 120);
    if (b.type === 'texte') {
      const html = str(b.html, 20000);
      if (html) out.push({ type: 'texte', titre, html });
    } else if (b.type === 'conseil') {
      const corps_html = str(b.corps_html, 12000);
      if (corps_html) out.push({ type: 'conseil', titre, pathologie: str(b.pathologie, 160), corps_html });
    } else if (b.type === 'recommandation') {
      const corps_html = str(b.corps_html, 8000);
      if (!corps_html) continue;
      const idx = Number.isInteger(b.lien_bloc_index) ? b.lien_bloc_index : null;
      out.push({
        type: 'recommandation', titre, corps_html,
        lien_label: str(b.lien_label, 120), lien_href: httpsUrl(b.lien_href), lien_bloc_index: idx,
      });
    } else if (b.type === 'photo') {
      out.push({ type: 'photo', titre, url: httpsUrl(b.url), alt: str(b.alt, 300), legende: str(b.legende, 300) });
    } else if (b.type === 'video') {
      const url = httpsUrl(b.url);
      if (url) out.push({ type: 'video', titre, url });
    } else if (b.type === 'molecule') {
      const dci = (Array.isArray(b.dci) ? b.dci : [])
        .map((d: unknown) => str(d, 120))
        .filter((d: string) => d && dciSet.has(d.toLowerCase()));
      if (dci.length) out.push({ type: 'molecule', titre, dci });
    }
    if (out.length >= MAX_BLOCS) break;
  }
  return { version: 1, resume_lecon: str(parsed?.resume_lecon, 500), blocs: out, avertissements: warnings };
}

function pushNormalizedNode(
  nodes: any[],
  n: any,
  parentRef: string | null,
  warnings: string[],
) {
  if (!n || typeof n !== 'object') return;
  if (nodes.length >= MAX_NODES) return;
  const kind = str(n.kind, 40);
  let action = str(n.action, 20) || 'update';
  // Plus de delete explicite dans le contrat v2 — ignorer si présent
  if (action === 'delete') action = 'keep';
  if (!KINDS.includes(kind) || !ACTIONS.includes(action)) return;
  const niveaux = parseNiveaux(n.niveaux ?? { min: n.niveau_min, max: n.niveau_max });
  const refRaw = n.ref_id == null || n.ref_id === '' ? null : str(n.ref_id, 80);
  const parentRaw = n.parent_ref == null || n.parent_ref === ''
    ? parentRef
    : str(n.parent_ref, 80);
  const payload = sanitizePayload(n.payload);
  // jeu existant (ref_id) autorisé ; create jeu sans modele_id ignoré
  if (kind === 'bloc' && payload.type === 'jeu') {
    const hasModele = !!(payload.modele_id || payload.code_unique);
    if (!refRaw && !hasModele) return;
  }
  const i = nodes.length;
  const ordreNum = Number(n.ordre);
  const tempId = str(n.temp_id, 80) || `t${i + 1}`;
  nodes.push({
    temp_id: tempId,
    kind,
    ref_id: refRaw,
    parent_ref: parentRaw,
    action,
    titre: str(n.titre, 200),
    ordre: Number.isFinite(ordreNum) ? ordreNum : i,
    niveaux,
    niveau_min: niveaux.min,
    niveau_max: niveaux.max,
    payload,
    variantes: sanitizeVariantes(n.variantes),
  });
  const enfants = Array.isArray(n.enfants) ? n.enfants
    : (Array.isArray(n.children) ? n.children
      : (Array.isArray(n.lecons) ? n.lecons
        : (Array.isArray(n.blocs) ? n.blocs : [])));
  const childParent = refRaw || tempId;
  for (const child of enfants) {
    if (nodes.length >= MAX_NODES) {
      warnings.push(`Arbre tronqué à ${MAX_NODES} nœuds.`);
      break;
    }
    pushNormalizedNode(nodes, child, childParent, warnings);
  }
}

function normalizeFlatNodes(rawNodes: any[], warnings: string[]) {
  const nodes: any[] = [];
  let i = 0;
  for (const n of rawNodes) {
    if (!n || typeof n !== 'object') continue;
    const kind = str(n.kind, 40);
    const action = str(n.action, 20) || 'update';
    if (!KINDS.includes(kind) || !ACTIONS.includes(action)) continue;
    const niveaux = parseNiveaux(n.niveaux ?? { min: n.niveau_min, max: n.niveau_max });
    const payload = sanitizePayload(n.payload);
    if (kind === 'bloc' && payload.type === 'jeu') {
      const refOk = n.ref_id != null && n.ref_id !== '';
      const hasModele = !!(payload.modele_id || payload.code_unique);
      if (!refOk && !hasModele) continue;
    }
    const ordreNum = Number(n.ordre);
    nodes.push({
      temp_id: str(n.temp_id, 80) || `t${i + 1}`,
      kind,
      ref_id: n.ref_id == null || n.ref_id === '' ? null : str(n.ref_id, 80),
      parent_ref: n.parent_ref == null || n.parent_ref === '' ? null : str(n.parent_ref, 80),
      action,
      titre: str(n.titre, 200),
      ordre: Number.isFinite(ordreNum) ? ordreNum : i,
      niveaux,
      niveau_min: niveaux.min,
      niveau_max: niveaux.max,
      payload,
      variantes: sanitizeVariantes(n.variantes),
    });
    i++;
    if (nodes.length >= MAX_NODES) {
      warnings.push(`Réponse tronquée à ${MAX_NODES} nœuds.`);
      break;
    }
  }
  return nodes;
}

function normalizeModifier(parsed: any) {
  const warnings: string[] = Array.isArray(parsed?.avertissements)
    ? parsed.avertissements.map((w: unknown) => str(w, 300)).filter(Boolean).slice(0, 20)
    : [];
  let nodes: any[] = [];
  let version = 1;

  if (parsed?.arbre && typeof parsed.arbre === 'object') {
    version = 2;
    pushNormalizedNode(nodes, parsed.arbre, null, warnings);
  } else if (Array.isArray(parsed?.nodes)) {
    nodes = normalizeFlatNodes(parsed.nodes, warnings);
  }

  if (!nodes.length) {
    warnings.push('Aucun nœud exploitable (arbre ou nodes manquant).');
  }
  return { version, nodes, avertissements: warnings };
}

async function callGemini(
  p: Record<string, unknown>,
  systemPrompt: string,
  mode: string,
) {
  const apiKey = String(Deno.env.get('GEMINI_API_KEY') || Deno.env.get('GOOGLE_API_KEY') || '').trim();
  if (!apiKey) throw new Error('Secret GEMINI_API_KEY manquant');

  const userText = mode === 'modifier' ? buildModifierUserText(p) : buildUserText(p);
  const parts: unknown[] = [{ text: userText }];
  if (p.pdfBase64) {
    parts.push({
      inline_data: { mime_type: 'application/pdf', data: String(p.pdfBase64).replace(/^data:[^;]+;base64,/, '').trim() },
    });
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:generateContent`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts }],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: 'application/json',
        maxOutputTokens: 32768,
        thinkingConfig: { thinkingLevel: THINKING },
      },
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = body.error?.message || JSON.stringify(body).slice(0, 300);
    throw new Error(`Gemini HTTP ${res.status}: ${msg}`);
  }
  const raw = body.candidates?.[0]?.content?.parts?.map((x: { text?: string }) => x.text || '').join('') || '';
  if (!raw) {
    const why = body.candidates?.[0]?.finishReason || body.promptFeedback?.blockReason || 'réponse vide';
    throw new Error(`Gemini : aucune réponse (${why})`);
  }
  let parsed;
  try {
    parsed = parseJsonResponse(raw);
  } catch {
    throw new Error('Réponse Gemini non JSON (document trop long ? réessayer avec une partie)');
  }
  return { parsed, usage: body.usageMetadata || null };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    if (req.method !== 'POST') return json(405, { error: 'Méthode non autorisée' });
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json(401, { error: 'Non authentifié' });

    const gate = await assertAdmin(authHeader);
    if (!gate.ok) return json(gate.status as number, { error: gate.error });

    const payload = await req.json().catch(() => ({}));
    const mode = String(payload.mode || '').trim().toLowerCase() === 'modifier' ? 'modifier' : 'generer';

    const hasText = typeof payload.text === 'string' && payload.text.trim().length > 0;
    const hasPdf = typeof payload.pdfBase64 === 'string' && payload.pdfBase64.length > 0;
    const hasInstruction = typeof payload.instruction === 'string' && payload.instruction.trim().length > 0;

    if (mode === 'modifier') {
      if (!hasInstruction && !hasText && !hasPdf) {
        return json(400, { error: 'Instruction (ou texte / PDF) requis en mode modifier' });
      }
      if (hasInstruction && payload.instruction.length > MAX_INSTRUCTION) {
        return json(413, { error: `Instruction trop longue (${MAX_INSTRUCTION} caractères maximum)` });
      }
    } else {
      if (!hasText && !hasPdf) return json(400, { error: 'Texte ou PDF requis' });
    }
    if (hasText && payload.text.length > MAX_TEXT) {
      return json(413, { error: `Texte trop long (${MAX_TEXT} caractères maximum)` });
    }
    if (hasPdf && payload.pdfBase64.length > MAX_PDF_B64) {
      return json(413, { error: 'PDF trop lourd (10 Mo maximum)' });
    }

    const basePrompt = await loadSystemPromptBase(
      gate.authHeader as string,
      gate.supabaseUrl as string,
      gate.anonKey as string,
    );
    const systemPrompt = buildSystemPrompt(basePrompt, mode);
    const { parsed, usage } = await callGemini(payload, systemPrompt, mode);

    if (mode === 'modifier') {
      const result = normalizeModifier(parsed);
      return json(200, { ...result, mode: 'modifier', model: MODEL, usage });
    }

    const mols = Array.isArray(payload.context?.molecules) ? payload.context.molecules.map((m: unknown) => String(m)) : [];
    const result = normalize(parsed, mols);
    return json(200, { ...result, mode: 'generer', model: MODEL, usage });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e || 'Erreur IA');
    console.error('jeupharma-ia-blocs', msg);
    return json(500, { error: msg });
  }
});
