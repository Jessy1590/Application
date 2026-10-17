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

/** Contrat JSON mode modifier (Preview) — append au prompt quand mode=modifier. */
const MODIFIER_CONTRACT = `
## Mode modifier (Preview)
Tu modifies la structure / le contenu d'un parcours selon la consigne.
Réponds UNIQUEMENT par un JSON valide (pas de markdown) :
{
  "version": 1,
  "nodes": [
    {
      "temp_id": "t1",
      "kind": "chapitre|lecon|section|bloc",
      "ref_id": "uuid existant ou null",
      "parent_ref": "temp_id parent, uuid parent, ou null",
      "action": "create|update|delete|keep",
      "titre": "",
      "niveaux": { "min": 1, "max": 5 },
      "payload": { },
      "variantes": { "1": {}, "2": {}, "3": {}, "4": {}, "5": {} }
    }
  ],
  "avertissements": []
}
- kind "bloc" : payload = objet type studio (type texte|conseil|recommandation|photo|video|molecule + champs). Jamais de jeu.
- variantes : contenus différenciés par ★ ; clés "1"…"5" uniquement. Pour un bloc texte, typiquement { "html":"…" } ; pour conseil { "corps_html":"…", "pathologie":"…" }.
- ref_id null + action create = insertion ; action delete = suppression proposée (payload/variantes peuvent être vides).
- Maximum ${MAX_NODES} nœuds. Ordre = ordre d'affichage souhaité.`;

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

function buildSystemPrompt(base: string, mode: string) {
  let prompt = `${base.trim()}\n${PROGRESSION_SUFFIX}`;
  if (mode === 'modifier') prompt += `\n${MODIFIER_CONTRACT}`;
  return prompt;
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

function buildModifierUserText(p: Record<string, unknown>) {
  const ctx = (p.context && typeof p.context === 'object' ? p.context : {}) as Record<string, unknown>;
  const ctxJson = JSON.stringify(ctx).slice(0, 60_000);
  const cible = p.cible != null ? JSON.stringify(p.cible).slice(0, 8_000) : '';
  const niveau = p.niveau != null ? String(p.niveau).slice(0, 20) : '';
  return [
    'Mode : modifier (Preview parcours)',
    niveau ? `Niveau cible (barre) : ${niveau}` : '',
    cible ? `Cible : ${cible}` : '',
    `Instruction :\n${String(p.instruction || '').slice(0, MAX_INSTRUCTION)}`,
    '',
    `Contexte (arbre / nœuds courants) :\n${ctxJson}`,
    '',
    typeof p.text === 'string' && p.text.trim()
      ? `--- TEXTE COMPLÉMENTAIRE ---\n${String(p.text).slice(0, MAX_TEXT)}`
      : '',
    p.pdfBase64 ? `PDF joint${p.pdfName ? ` (« ${String(p.pdfName).slice(0, 120)} »)` : ''} : support complémentaire.` : '',
    'Retourne le JSON nodes demandé.',
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
  try {
    const s = JSON.stringify(raw);
    if (s.length > 40_000) return JSON.parse(s.slice(0, 40_000));
    return JSON.parse(s) as Record<string, unknown>;
  } catch {
    return {};
  }
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

function normalizeModifier(parsed: any) {
  const warnings: string[] = Array.isArray(parsed?.avertissements)
    ? parsed.avertissements.map((w: unknown) => str(w, 300)).filter(Boolean).slice(0, 20)
    : [];
  const nodes: any[] = [];
  let i = 0;
  for (const n of Array.isArray(parsed?.nodes) ? parsed.nodes : []) {
    if (!n || typeof n !== 'object') continue;
    const kind = str(n.kind, 40);
    const action = str(n.action, 20) || 'update';
    if (!KINDS.includes(kind) || !ACTIONS.includes(action)) continue;
    const niveaux = parseNiveaux(n.niveaux ?? { min: n.niveau_min, max: n.niveau_max });
    const refRaw = n.ref_id == null || n.ref_id === '' ? null : str(n.ref_id, 80);
    const parentRaw = n.parent_ref == null || n.parent_ref === '' ? null : str(n.parent_ref, 80);
    let payload = sanitizePayload(n.payload);
    if (kind === 'bloc' && typeof payload.type === 'string' && payload.type === 'jeu') continue;
    nodes.push({
      temp_id: str(n.temp_id, 80) || `t${i + 1}`,
      kind,
      ref_id: refRaw,
      parent_ref: parentRaw,
      action,
      titre: str(n.titre, 200),
      niveaux,
      niveau_min: niveaux.min,
      niveau_max: niveaux.max,
      payload,
      variantes: sanitizeVariantes(n.variantes),
    });
    i++;
    if (nodes.length >= MAX_NODES) break;
  }
  return { version: 1, nodes, avertissements: warnings };
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
