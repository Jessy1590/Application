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
const MAX_IMAGES = 4;

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

Règles strictes :
1. N'invente rien. Si doute, omets le champ.
2. IGNORE l'identité de la pharmacie (Pharmacie Grand Evreux, SIRET, téléphone pharmacie, en-tête) et IGNORE le prestataire (Orkyn, etc.) comme patient. Le patient = destinataire / NOM PRENOM / ordonnance.
3. Cases cochées (X, croix rouge, case remplie) = sélection active (type d'appareil, ORKYN, chèque caution, électrodes, modèle TENS, etc.).
4. Dates au format ISO YYYY-MM-DD.
5. Téléphones : chiffres, format FR 0XXXXXXXXX si possible.
6. type_appareil : uniquement une des valeurs enum fournies (tens pour neurostimulateur/TENS, tire_lait, aerosol, pese_bebe, fauteuil, autre).
7. caution : cheque_150 si chèque 150€ coché, especes si espèces.
8. source : prestataire si Orkyn/prestataire, parc si n° pharmacie / parc interne.
9. mode_obtention : depot | appel ; livraison : pharmacie | domicile si visible.
10. unite : jours | semaines | mois.
11. prestataire_id : utilise l'id exact de la liste prestataires si tu matchs le nom (ex. Orkyn).
12. Pour les booléens oui/non : true/false.
13. confidence entre 0 et 1.`;
}

function buildUserText(payload) {
  const fields = Array.isArray(payload.fields) ? payload.fields : [];
  const prestataires = Array.isArray(payload.prestataires) ? payload.prestataires : [];
  const ocrText = String(payload.ocrText || '').slice(0, 12000);

  return [
    'Champs à remplir (code + label + type/enum) :',
    JSON.stringify(fields, null, 0),
    '',
    'Prestataires connus (id + nom) :',
    JSON.stringify(prestataires.map((p) => ({ id: p.id, nom: p.nom })), null, 0),
    '',
    'Texte OCR brut (aide, peut contenir des erreurs) :',
    ocrText || '(vide)',
    '',
    'Analyse aussi les images jointes (cases cochées, manuscrit). Retourne le JSON {"fields":[...]}.',
  ].join('\n');
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
  for (const raw of imgs) {
    const b64 = stripDataUrl(raw);
    if (!b64) continue;
    parts.push({
      inline_data: {
        mime_type: 'image/jpeg',
        data: b64,
      },
    });
  }

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
        thinkingConfig: { thinkingLevel: 'low' },
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

    const result = await callGemini({ imagesBase64, payload });
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
