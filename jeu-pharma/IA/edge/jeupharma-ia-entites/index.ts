/**
 * Jeu Pharma — IA référentiel : propositions de nettoyage d’entités (JSON).
 * Secret : GEMINI_API_KEY (serveur uniquement).
 * Modèle : GEMINI_IA_MODEL > GEMINI_OCR_MODEL > 'gemini-3.8-flash'.
 * Accès : admin métier = portail.profiles.role === 'admin'.
 * Aucune écriture BDD — suggestions seulement ; validation humaine côté client.
 * Schéma : voir IA/README.md § entités.
 *
 * Un seul appel modèle sur la liste complète (pas de lots / chunking).
 * Réponse compacte : uniquement les actions utiles (rename/merge/delete) ;
 * les ids omis sont traités comme noop côté serveur.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MODEL = Deno.env.get('GEMINI_IA_MODEL') || Deno.env.get('GEMINI_OCR_MODEL') || 'gemini-3.8-flash';
const THINKING = Deno.env.get('GEMINI_IA_THINKING') || 'low';
const MAX_INSTRUCTION = 4_000;
/** Garde-fou anti-abus ; tables actuelles ≪ 3 000. Pas de découpage IA en deçà. */
const MAX_ITEMS = 10_000;
const VALEUR_MAX = 220;
const ACTIONS = new Set(['keep', 'rename', 'merge', 'delete', 'noop']);

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
  return { ok: true, userId: user.id };
}

const SYSTEM_PROMPT = `Tu es un assistant de curation pour Jeu Pharma (référentiel pédagogique pharmacie).
On te donne une TABLE d’entités (id + valeur) COMPLÈTE et une CONSIGNE admin.
Tu analyses TOUTE la liste d’un seul tenant (doublons transverses, fusions, normalisations).

Réponds UNIQUEMENT par un JSON valide (pas de markdown) :
{
  "version": 1,
  "propositions": [
    {
      "id": "uuid-existant",
      "action": "rename|merge|delete",
      "new_valeur": "libellé proposé si rename",
      "merge_into_id": "uuid cible si merge",
      "reason": "justification courte"
    }
  ],
  "avertissements": ["limites éventuelles"]
}

Compactage (obligatoire) :
- N’inclus dans propositions QUE les actions utiles : rename, merge, delete.
- Omets keep/noop (le serveur les déduit pour les ids absents).
- Un objet max par id ; pas d’id inventé.

Actions :
- rename : nouveau libellé dans new_valeur (orthographe, casse, normalisation) — ne change PAS l’identité
- merge : doublon → fusionner vers merge_into_id (un id de la liste fournie, différent de id)
- delete : proposition de suppression (soft-delete) — à utiliser avec parcimonie

Règles :
1. Tu vois la liste entière : raisonne globalement (même graphie, synonymes pédagogiques, doublons).
2. merge_into_id DOIT être un uuid présent dans la liste (pas inventé).
3. Pas d’invention clinique : uniquement les libellés fournis + la consigne.
4. Français, pas d’emoji. reason ≤ 160 car.
5. Si la consigne est floue, préfère ne rien proposer plutôt que delete.
6. Pour une fusion A→B, mets action=merge sur A uniquement (pas sur B).
7. new_valeur seulement si action=rename ; merge_into_id seulement si action=merge.`;

const str = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);

function parseJsonResponse(raw: string) {
  let text = String(raw || '').trim();
  if (text.startsWith('```')) text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  return JSON.parse(text);
}

type Item = { id: string; valeur: string };

function parseItems(raw: unknown): Item[] {
  if (!Array.isArray(raw)) return [];
  const out: Item[] = [];
  const seen = new Set<string>();
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const id = str((row as { id?: unknown }).id, 64);
    const valeur = str((row as { valeur?: unknown }).valeur, VALEUR_MAX);
    if (!id || !valeur) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ id, valeur });
  }
  return out;
}

function buildUserText(p: { table: string; instruction: string; items: Item[] }) {
  const catalog = p.items.map((x) => ({ id: x.id, valeur: x.valeur }));
  return [
    `Table : ${p.table}`,
    `Consigne admin : ${p.instruction}`,
    `Liste complète à analyser (${catalog.length} éléments) — un seul passage, pas de lots :`,
    JSON.stringify(catalog),
    'Retourne le JSON compact (propositions utiles uniquement : rename / merge / delete).',
  ].join('\n');
}

type Prop = {
  id: string;
  action: string;
  new_valeur?: string;
  merge_into_id?: string;
  reason?: string;
};

function normalizePropositions(
  parsed: unknown,
  expectedIds: Set<string>,
  allIds: Set<string>,
): { propositions: Prop[]; avertissements: string[] } {
  const root = (parsed && typeof parsed === 'object') ? parsed as Record<string, unknown> : {};
  const warnings: string[] = Array.isArray(root.avertissements)
    ? root.avertissements.map((w) => str(w, 300)).filter(Boolean).slice(0, 20)
    : [];
  const rawList = Array.isArray(root.propositions) ? root.propositions : [];
  const byId = new Map<string, Prop>();

  for (const row of rawList) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const id = str(r.id, 64);
    if (!id || !expectedIds.has(id)) continue;
    let action = str(r.action, 20).toLowerCase();
    if (!ACTIONS.has(action)) action = 'noop';
    if (action === 'keep') action = 'noop';

    const prop: Prop = { id, action, reason: str(r.reason, 160) || undefined };

    if (action === 'rename') {
      const nv = str(r.new_valeur, VALEUR_MAX);
      if (!nv) {
        prop.action = 'noop';
        prop.reason = prop.reason || 'rename sans new_valeur → noop';
      } else {
        prop.new_valeur = nv;
      }
    } else if (action === 'merge') {
      const mid = str(r.merge_into_id, 64);
      if (!mid || mid === id || !allIds.has(mid)) {
        prop.action = 'noop';
        prop.reason = prop.reason || 'merge cible invalide → noop';
      } else {
        prop.merge_into_id = mid;
      }
    }

    byId.set(id, prop);
  }

  // Ids omis par l’IA (réponse compacte) → noop
  for (const id of expectedIds) {
    if (!byId.has(id)) byId.set(id, { id, action: 'noop' });
  }

  return { propositions: [...byId.values()], avertissements: warnings };
}

async function callGemini(userText: string) {
  const apiKey = String(Deno.env.get('GEMINI_API_KEY') || Deno.env.get('GOOGLE_API_KEY') || '').trim();
  if (!apiKey) throw new Error('Secret GEMINI_API_KEY manquant');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:generateContent`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: 'user', parts: [{ text: userText }] }],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: 'application/json',
        maxOutputTokens: 65536,
        thinkingConfig: { thinkingLevel: THINKING },
      },
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = body.error?.message || JSON.stringify(body).slice(0, 300);
    throw new Error(`Gemini HTTP ${res.status}: ${msg}`);
  }
  const finish = body.candidates?.[0]?.finishReason;
  const raw = body.candidates?.[0]?.content?.parts?.map((x: { text?: string }) => x.text || '').join('') || '';
  if (!raw) {
    const why = finish || body.promptFeedback?.blockReason || 'réponse vide';
    throw new Error(`Gemini : aucune réponse (${why})`);
  }
  let parsed;
  try {
    parsed = parseJsonResponse(raw);
  } catch {
    throw new Error(
      finish === 'MAX_TOKENS'
        ? 'Réponse Gemini tronquée (MAX_TOKENS) — réduisez les propositions attendues ou filtrez la liste'
        : 'Réponse Gemini non JSON',
    );
  }
  return { parsed, usage: body.usageMetadata || null, finishReason: finish || null };
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
    const table = str(payload.table, 80);
    const instruction = str(payload.instruction, MAX_INSTRUCTION);
    if (!table) return json(400, { error: 'table requise' });
    if (!instruction) return json(400, { error: 'instruction requise' });
    if (typeof payload.instruction === 'string' && payload.instruction.length > MAX_INSTRUCTION) {
      return json(413, { error: `Instruction trop longue (${MAX_INSTRUCTION} caractères maximum)` });
    }

    if (Array.isArray(payload.items) && payload.items.length > MAX_ITEMS) {
      return json(413, {
        error: `Trop d’éléments (max ${MAX_ITEMS}) — filtrez la liste côté UI`,
      });
    }

    const items = parseItems(payload.items);
    if (!items.length) return json(400, { error: 'items[] requis (id + valeur)' });
    if (items.length > MAX_ITEMS) {
      return json(413, { error: `Trop d’éléments (max ${MAX_ITEMS}) — filtrez la liste côté UI` });
    }

    const allIds = new Set(items.map((x) => x.id));
    const userText = buildUserText({ table, instruction, items });
    const { parsed, usage, finishReason } = await callGemini(userText);
    const avertissements: string[] = [];
    if (finishReason === 'MAX_TOKENS') {
      avertissements.push('Réponse potentiellement tronquée (MAX_TOKENS) — vérifiez les propositions.');
    }

    const norm = normalizePropositions(parsed, allIds, allIds);
    avertissements.push(...norm.avertissements);

    const byId = new Map(norm.propositions.map((p) => [p.id, p]));
    const ordered = items.map((it) => byId.get(it.id) || { id: it.id, action: 'noop' as const });

    return json(200, {
      version: 1,
      table,
      count: ordered.length,
      chunked: false,
      propositions: ordered,
      avertissements: [...new Set(avertissements)].slice(0, 20),
      model: MODEL,
      usage,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e || 'Erreur IA');
    console.error('jeupharma-ia-entites', msg);
    return json(500, { error: msg });
  }
});
