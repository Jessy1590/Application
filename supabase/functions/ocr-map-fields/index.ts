/**
 * Mapping intelligent des champs formulaire Location à partir d’images de dossier.
 * Modèle : gemini-3.8-flash (vision). Secret : GEMINI_API_KEY
 * Accès : admin portail OU equipe.role === administrateur.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SITE_ID = '9dd064a4-13ec-4cc2-9707-29210c3744ce';
const MODEL = Deno.env.get('GEMINI_OCR_MODEL') || 'gemini-3.8-flash';
const MAX_IMAGES = 8;

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function assertAdmin(authHeader) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !anonKey) {
    return { ok: false, status: 500, error: 'Config Supabase manquante' };
  }

  const portail = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    db: { schema: 'portail' },
  });

  const {
    data: { user },
    error: userError,
  } = await portail.auth.getUser();
  if (userError || !user) {
    return { ok: false, status: 401, error: 'Session invalide' };
  }

  const { data: profile } = await portail
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (profile?.role === 'admin') {
    return { ok: true, userId: user.id };
  }

  const apps = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    db: { schema: 'phieevreux' },
  });

  const { data: equipe } = await apps
    .from('equipe')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle();

  if (equipe?.role === 'administrateur') {
    return { ok: true, userId: user.id };
  }

  const { data: access } = await portail
    .from('site_access')
    .select('user_id')
    .eq('user_id', user.id)
    .eq('site_id', SITE_ID)
    .maybeSingle();

  if (!access) {
    return { ok: false, status: 403, error: 'Accès site refusé' };
  }

  return { ok: false, status: 403, error: 'OCR IA réservé aux administrateurs' };
}

function stripDataUrl(b64) {
  return String(b64 || '').replace(/^data:[^;]+;base64,/, '').trim();
}

function buildSystemPrompt() {
  return `Tu es un assistant pharmacie (Location Phie Evreux). Tu lis des photos/scans de dossiers papier (fiche location, bon livraison, ordonnance, bon Orkyn).

Objectif : pour CHAQUE champ fourni, décider s'il y a une valeur fiable à remplir. Réponds UNIQUEMENT en JSON valide :
{"fields":[{"code":"...","value":"...","confidence":0.0}]}

IMPORTANT — schéma dynamique :
- La liste des champs est générée depuis Paramètres Location (catalogue + spécificités appareil). Respecte chaque only_if et chaque enum[].value.
- Si type_appareil=X, remplis tous les champs dont only_if.type_appareil=X (spécificités). Ignore les spécificités des autres types.
- Si source=prestataire / parc, applique les only_if correspondants.
- Enums : value = code exact, jamais le libellé seul.

IMPORTANT — couverture complète :
- Examine TOUTES les images et le texte OCR de chaque page.
- Remplis toutes les sections présentes dans le schéma (Patient → … → Contacts).
- Ne t’arrête pas après le bloc patient.

Règles :
1. N'invente rien. Si doute, omets le champ.
2. IGNORE pharmacie / prestataire comme patient.
3. Cases cochées = sélection active.
4. Dates ISO YYYY-MM-DD.
5. Téléphones FR 0XXXXXXXXX si possible.
6. Booléens true/false.
7. confidence 0–1.`;
}

function buildUserText(payload) {
  const fields = Array.isArray(payload.fields) ? payload.fields : [];
  const prestataires = Array.isArray(payload.prestataires) ? payload.prestataires : [];
  const ocrText = String(payload.ocrText || '').slice(0, 28000);
  const pageCount = Number(payload.pageCount) || 0;
  const workflow = String(payload.workflow || '').trim();

  return [
    pageCount
      ? `Ce dossier comporte ${pageCount} page(s) image. Analyse-les toutes avant de répondre.`
      : 'Analyse toutes les images jointes avant de répondre.',
    '',
    workflow ? `Mode opératoire (à suivre) :\n${workflow}` : '',
    '',
    'Champs à remplir (avec section, enum {value,label}, only_if conditionnel) :',
    JSON.stringify(fields, null, 0),
    '',
    'Prestataires connus (id + nom) — pour prestataire_id si source=prestataire :',
    JSON.stringify(prestataires.map((p) => ({ id: p.id, nom: p.nom })), null, 0),
    '',
    'Texte OCR brut (toutes pages concaténées, peut contenir des erreurs) :',
    ocrText || '(vide)',
    '',
    'Les images suivent, une par une (étiquette Page N). Cases cochées et manuscrit inclus. Retourne le JSON {"fields":[{"code","value","confidence"}]} avec value = code enum quand applicable.',
  ]
    .filter((line, i, arr) => !(line === '' && arr[i - 1] === ''))
    .join('\n');
}

function parseJsonResponse(raw) {
  let text = String(raw || '').trim();
  if (text.startsWith('```')) {
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  }
  return JSON.parse(text);
}

async function callGemini({ imagesBase64, payload }) {
  const apiKey = String(
    Deno.env.get('GEMINI_API_KEY') || Deno.env.get('GOOGLE_API_KEY') || ''
  ).trim();
  if (!apiKey) {
    throw new Error('Secret GEMINI_API_KEY manquant');
  }

  const parts = [{ text: buildUserText(payload) }];
  const imgs = (imagesBase64 || []).slice(0, MAX_IMAGES);
  imgs.forEach((raw, idx) => {
    const b64 = stripDataUrl(raw);
    if (!b64) return;
    parts.push({ text: `\n--- Page ${idx + 1} / ${imgs.length} ---` });
    parts.push({
      inline_data: {
        mime_type: 'image/jpeg',
        data: b64,
      },
    });
  });

  if (parts.length < 2 && !payload.ocrText) {
    throw new Error('Aucune image ni texte OCR fourni');
  }

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:generateContent`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: buildSystemPrompt() }],
      },
      contents: [{ role: 'user', parts }],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: 'application/json',
        thinkingConfig: { thinkingLevel: 'medium' },
      },
    }),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      body.error?.message || body.message || JSON.stringify(body).slice(0, 300);
    throw new Error(`Gemini HTTP ${res.status}: ${msg}`);
  }

  const raw =
    body.candidates?.[0]?.content?.parts
      ?.map((p) => p.text || '')
      .join('') || '{}';

  let parsed;
  try {
    parsed = parseJsonResponse(raw);
  } catch {
    throw new Error('Réponse Gemini non JSON');
  }

  const list = Array.isArray(parsed.fields)
    ? parsed.fields
    : Array.isArray(parsed.mappings)
      ? parsed.mappings
      : [];

  const fields = list
    .filter((f) => f && f.code != null && f.value != null && String(f.value).trim() !== '')
    .map((f) => ({
      code: String(f.code).trim(),
      value: f.value,
      confidence: typeof f.confidence === 'number' ? f.confidence : 0.75,
    }));

  return {
    fields,
    model: MODEL,
    usage: body.usageMetadata || null,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (req.method !== 'POST') {
      return json(405, { error: 'Méthode non autorisée' });
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return json(401, { error: 'Non authentifié' });
    }

    const gate = await assertAdmin(authHeader);
    if (!gate.ok) {
      return json(gate.status, { error: gate.error });
    }

    const payload = await req.json().catch(() => ({}));
    const imagesBase64 = Array.isArray(payload.imagesBase64)
      ? payload.imagesBase64
      : payload.imageBase64
        ? [payload.imageBase64]
        : [];

    const result = await callGemini({
      imagesBase64,
      payload: { ...payload, pageCount: imagesBase64.length },
    });
    return json(200, {
      mappings: result.fields,
      model: result.model,
      usage: result.usage,
      engine: 'gemini-vision',
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e || 'Erreur IA');
    console.error('ocr-map-fields', msg);
    return json(500, { error: msg });
  }
});
