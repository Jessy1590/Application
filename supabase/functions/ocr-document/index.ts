/**
 * OCR document via Azure Document Intelligence (prebuilt-read).
 * Secrets : AZURE_DI_ENDPOINT, AZURE_DI_KEY
 * Accès : admin portail OU equipe.role === administrateur (PhieEvreux).
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const API_VERSION = '2024-11-30';
const SITE_ID = '9dd064a4-13ec-4cc2-9707-29210c3744ce';
const MAX_POLL_MS = 90_000;
const POLL_INTERVAL_MS = 1200;

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function polygonToBbox(polygon) {
  if (!Array.isArray(polygon) || polygon.length < 8) return null;
  const xs = [];
  const ys = [];
  for (let i = 0; i < polygon.length; i += 2) {
    xs.push(Number(polygon[i]));
    ys.push(Number(polygon[i + 1]));
  }
  return {
    x0: Math.min(...xs),
    y0: Math.min(...ys),
    x1: Math.max(...xs),
    y1: Math.max(...ys),
  };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function normalizeEndpoint(raw) {
  return String(raw || '').trim().replace(/\/+$/, '');
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

  return { ok: false, status: 403, error: 'OCR réservé aux administrateurs' };
}

async function analyzeWithAzure(base64Source) {
  const endpoint = normalizeEndpoint(Deno.env.get('AZURE_DI_ENDPOINT') || '');
  const key = String(Deno.env.get('AZURE_DI_KEY') || '').trim();
  if (!endpoint || !key) {
    throw new Error('Secrets Azure manquants (AZURE_DI_ENDPOINT / AZURE_DI_KEY)');
  }

  const analyzeUrl =
    `${endpoint}/documentintelligence/documentModels/prebuilt-read:analyze` +
    `?api-version=${API_VERSION}&locale=fr-FR`;

  const postRes = await fetch(analyzeUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Ocp-Apim-Subscription-Key': key,
    },
    body: JSON.stringify({ base64Source }),
  });

  if (postRes.status !== 202) {
    const errText = await postRes.text().catch(() => '');
    throw new Error(`Azure analyze HTTP ${postRes.status}: ${errText.slice(0, 300)}`);
  }

  const opLocation =
    postRes.headers.get('Operation-Location') || postRes.headers.get('operation-location');
  if (!opLocation) {
    throw new Error('Azure : Operation-Location manquante');
  }

  const started = Date.now();
  while (Date.now() - started < MAX_POLL_MS) {
    await sleep(POLL_INTERVAL_MS);
    const pollRes = await fetch(opLocation, {
      headers: { 'Ocp-Apim-Subscription-Key': key },
    });
    const body = await pollRes.json().catch(() => ({}));
    if (!pollRes.ok) {
      throw new Error(`Azure poll HTTP ${pollRes.status}`);
    }
    const status = String(body.status || '').toLowerCase();
    if (status === 'succeeded') {
      return body.analyzeResult || body;
    }
    if (status === 'failed') {
      const msg = body.error?.message || JSON.stringify(body.error || body).slice(0, 200);
      throw new Error(`Azure OCR échoué : ${msg}`);
    }
  }
  throw new Error('Azure OCR : délai dépassé');
}

function extractWords(analyzeResult) {
  const content = String(analyzeResult?.content || '').trim();
  const pages = Array.isArray(analyzeResult?.pages) ? analyzeResult.pages : [];
  const page0 = pages[0] || {};
  const width = Number(page0.width) || 0;
  const height = Number(page0.height) || 0;

  const words = [];
  for (const page of pages) {
    for (const w of page.words || []) {
      const text = String(w.content || '').trim();
      if (!text) continue;
      const bbox = polygonToBbox(w.polygon);
      if (!bbox) continue;
      const conf = typeof w.confidence === 'number' ? w.confidence * 100 : 80;
      words.push({ text, bbox, confidence: conf });
    }
  }

  if (!words.length) {
    for (const page of pages) {
      for (const line of page.lines || []) {
        const text = String(line.content || '').trim();
        if (!text) continue;
        const bbox = polygonToBbox(line.polygon);
        if (!bbox) continue;
        words.push({ text, bbox, confidence: 70 });
      }
    }
  }

  return { text: content, words, width, height };
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
    const imageBase64 = String(payload.imageBase64 || payload.base64Source || '').trim();
    if (!imageBase64) {
      return json(400, { error: 'imageBase64 requis' });
    }
    const base64Source = imageBase64.replace(/^data:[^;]+;base64,/, '');

    const analyzeResult = await analyzeWithAzure(base64Source);
    const result = extractWords(analyzeResult);

    return json(200, {
      text: result.text,
      words: result.words,
      width: result.width,
      height: result.height,
      engine: 'azure-read',
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e || 'Erreur OCR');
    console.error('ocr-document', msg);
    return json(500, { error: msg });
  }
});
