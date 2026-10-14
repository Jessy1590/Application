/**
 * Jeu Pharma — IA studio : texte / PDF de cours -> blocs de leçon (JSON).
 * Secret : GEMINI_API_KEY (déjà utilisé par `ocr-map-fields`).
 * Modèle : GEMINI_IA_MODEL > GEMINI_OCR_MODEL (réutilise la config existante) > 'gemini-3.8-flash'.
 * Raisonnement : GEMINI_IA_THINKING (défaut 'low').
 * Accès : admin métier uniquement = portail.profiles.role === 'admin'.
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
const MAX_BLOCS = 40;
const TYPES = ['texte', 'conseil', 'recommandation', 'video', 'photo', 'molecule'];

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

async function callGemini(p: Record<string, unknown>) {
  const apiKey = String(Deno.env.get('GEMINI_API_KEY') || Deno.env.get('GOOGLE_API_KEY') || '').trim();
  if (!apiKey) throw new Error('Secret GEMINI_API_KEY manquant');

  const parts: unknown[] = [{ text: buildUserText(p) }];
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
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
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
    const hasText = typeof payload.text === 'string' && payload.text.trim().length > 0;
    const hasPdf = typeof payload.pdfBase64 === 'string' && payload.pdfBase64.length > 0;
    if (!hasText && !hasPdf) return json(400, { error: 'Texte ou PDF requis' });
    if (hasText && payload.text.length > MAX_TEXT) {
      return json(413, { error: `Texte trop long (${MAX_TEXT} caractères maximum)` });
    }
    if (hasPdf && payload.pdfBase64.length > MAX_PDF_B64) {
      return json(413, { error: 'PDF trop lourd (10 Mo maximum)' });
    }

    const mols = Array.isArray(payload.context?.molecules) ? payload.context.molecules.map((m: unknown) => String(m)) : [];
    const { parsed, usage } = await callGemini(payload);
    const result = normalize(parsed, mols);
    return json(200, { ...result, model: MODEL, usage });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e || 'Erreur IA');
    console.error('jeupharma-ia-blocs', msg);
    return json(500, { error: msg });
  }
});
