/**
 * Jeu Pharma — IA référentiel : propositions de nettoyage d’entités (JSON).
 * Secret : GEMINI_API_KEY (serveur uniquement).
 * Modèle : GEMINI_IA_MODEL > GEMINI_OCR_MODEL > 'gemini-3.8-flash'.
 * Accès : admin métier = portail.profiles.role === 'admin'.
 * Aucune écriture BDD — suggestions seulement ; validation humaine côté client.
 * Schéma : voir IA/README.md § entités.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MODEL = Deno.env.get('GEMINI_IA_MODEL') || Deno.env.get('GEMINI_OCR_MODEL') || 'gemini-3.8-flash';
const THINKING = Deno.env.get('GEMINI_IA_THINKING') || 'low';
const MAX_INSTRUCTION = 4_000;
const MAX_ITEMS = 800;
const CHUNK_SIZE = 200;
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
On te donne une TABLE d’entités (id + valeur) et une CONSIGNE admin.
Tu proposes, pour CHAQUE élément de la liste fournie (chunk), une action.

Réponds UNIQUEMENT par un JSON valide (pas de markdown) :
{
  "version": 1,
  "propositions": [
    {
      "id": "uuid-existant",
      "action": "keep|rename|merge|delete|noop",
      "new_valeur": "libellé proposé si rename",
      "merge_into_id": "uuid cible si merge",
      "reason": "justification courte"
    }
  ],
  "avertissements": ["limites éventuelles"]
}

Actions :
- keep : conserver tel quel (équivalent noop pédagogique)
- rename : nouveau libellé dans new_valeur (orthographe, casse, normalisation) — ne change PAS l’identité
- merge : doublon → fusionner vers merge_into_id (un id de la LISTE COMPLÈTE fournie, différent de id)
- delete : proposition de suppression (soft-delete) — à utiliser avec parcimonie
- noop : rien à faire

Règles :
1. Ne propose QUE sur les ids du chunk demandé. Un objet par id du chunk (pas d’id inventé).
2. merge_into_id DOIT être un uuid présent dans la liste complète (pas inventé).
3. Pas d’invention clinique : tu travailles uniquement sur les libellés fournis + la consigne.
4. Français, pas d’emoji. reason ≤ 160 car.
5. Si la consigne est floue, préfère keep/noop plutôt que delete.
6. Pour une fusion A→B, mets action=merge sur A (pas sur B). B reste keep.
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
    if (out.length >= MAX_ITEMS) break;
  }
  return out;
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

function buildUserText(p: {
  table: string;
  instruction: string;
  all: Item[];
  chunk: Item[];
  chunkIndex: number;
  chunkTotal: number;
}) {
  const catalog = p.all.map((x) => ({ id: x.id, valeur: x.valeur }));
  const chunk = p.chunk.map((x) => ({ id: x.id, valeur: x.valeur }));
  return [
    `Table : ${p.table}`,
    `Consigne admin : ${p.instruction}`,
    `Chunk ${p.chunkIndex + 1}/${p.chunkTotal} — propose une action pour chacun des ${chunk.length} éléments du chunk.`,
    `Liste complète (référence merge_into_id, ${catalog.length} éléments) :`,
    JSON.stringify(catalog),
    `Chunk à traiter (${chunk.length}) :`,
    JSON.stringify(chunk),
    'Retourne le JSON demandé (propositions pour le chunk uniquement).',
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
  chunkIds: Set<string>,
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
    if (!id || !chunkIds.has(id)) continue;
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

  // Compléter les ids du chunk manquants
  for (const id of chunkIds) {
    if (!byId.has(id)) byId.set(id, { id, action: 'noop', reason: 'non proposé par l’IA' });
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
        maxOutputTokens: 16384,
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
    throw new Error('Réponse Gemini non JSON');
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
    const table = str(payload.table, 80);
    const instruction = str(payload.instruction, MAX_INSTRUCTION);
    if (!table) return json(400, { error: 'table requise' });
    if (!instruction) return json(400, { error: 'instruction requise' });
    if (typeof payload.instruction === 'string' && payload.instruction.length > MAX_INSTRUCTION) {
      return json(413, { error: `Instruction trop longue (${MAX_INSTRUCTION} caractères maximum)` });
    }

    const items = parseItems(payload.items);
    if (!items.length) return json(400, { error: 'items[] requis (id + valeur)' });
    if (Array.isArray(payload.items) && payload.items.length > MAX_ITEMS) {
      return json(413, { error: `Trop d’éléments (max ${MAX_ITEMS}) — filtrez la liste ou chunk côté client` });
    }

    const allIds = new Set(items.map((x) => x.id));
    const chunks = chunkArray(items, CHUNK_SIZE);
    const avertissements: string[] = [];
    if (chunks.length > 1) {
      avertissements.push(
        `Liste découpée en ${chunks.length} lots de ≤${CHUNK_SIZE} (référence complète envoyée à chaque lot pour les fusions).`,
      );
    }

    const propositions: Prop[] = [];
    let usageTotal: Record<string, number> | null = null;

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const userText = buildUserText({
        table,
        instruction,
        all: items,
        chunk,
        chunkIndex: i,
        chunkTotal: chunks.length,
      });
      const { parsed, usage } = await callGemini(userText);
      if (usage && typeof usage === 'object') {
        usageTotal = usageTotal || {};
        for (const [k, v] of Object.entries(usage as Record<string, number>)) {
          if (typeof v === 'number') usageTotal[k] = (usageTotal[k] || 0) + v;
        }
      }
      const chunkIds = new Set(chunk.map((x) => x.id));
      const norm = normalizePropositions(parsed, chunkIds, allIds);
      propositions.push(...norm.propositions);
      avertissements.push(...norm.avertissements);
    }

    // Ordre = ordre d’entrée
    const byId = new Map(propositions.map((p) => [p.id, p]));
    const ordered = items.map((it) => byId.get(it.id) || { id: it.id, action: 'noop' as const });

    return json(200, {
      version: 1,
      table,
      count: ordered.length,
      chunked: chunks.length > 1,
      chunk_size: CHUNK_SIZE,
      propositions: ordered,
      avertissements: [...new Set(avertissements)].slice(0, 20),
      model: MODEL,
      usage: usageTotal,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e || 'Erreur IA');
    console.error('jeupharma-ia-entites', msg);
    return json(500, { error: msg });
  }
});
