/**
 * Jeu Pharma — IA référentiel : RCP officiel → fiche matrice condensée (JSON).
 * Secret : GEMINI_API_KEY (serveur uniquement).
 * Modèle : GEMINI_IA_MODEL > GEMINI_OCR_MODEL > 'gemini-3.8-flash'.
 * Accès : admin métier = portail.profiles.role === 'admin'.
 * Sources RCP : ANSM (CIS) d’abord, EMA (nº EU) en secours, collage manuel UI.
 * Schéma : voir IA/README.md § matrice.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MODEL = Deno.env.get('GEMINI_IA_MODEL') || Deno.env.get('GEMINI_OCR_MODEL') || 'gemini-3.8-flash';
const THINKING = Deno.env.get('GEMINI_IA_THINKING') || 'low';
const MAX_RCP = 100_000;
const SECTIONS = ['4.1', '4.2', '4.3', '4.4', '4.5', '4.6', '4.8', '5.1'] as const;
const SECTION_LABELS: Record<(typeof SECTIONS)[number], string> = {
  '4.1': 'Indications thérapeutiques',
  '4.2': 'Posologie et mode d’administration',
  '4.3': 'Contre-indications',
  '4.4': 'Mises en garde spéciales et précautions d’emploi',
  '4.5': 'Interactions avec d’autres médicaments',
  '4.6': 'Fertilité, grossesse et allaitement',
  '4.8': 'Effets indésirables',
  '5.1': 'Propriétés pharmacodynamiques',
};

const MULTI_CAPS: Record<string, number> = {
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
const MULTI_MAXLEN: Record<string, number> = {
  nom_commercial: 80,
  secteur_therapeutique: 100,
  classe_therapeutique: 120,
  classe_pharmacologique: 120,
  voies_administration: 40,
  indications: 160,
  contre_indications: 160,
  effets_indesirables: 160,
  precautions_emploi: 180,
  interactions: 180,
  surveillances: 140,
  conditions_prescription_delivrance: 160,
  conseils_delivrance: 180,
};
const SINGULAR_MAXLEN: Record<string, number> = {
  dci: 120,
  detail_pharmacologie: 520,
  posologie_generale: 220,
  grossesse_allaitement: 220,
};

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

const SYSTEM_PROMPT = `Tu es un assistant pédagogique pour Jeu Pharma (formation pharmacie d'officine / DEUST).
On te donne des rubriques extraites d'un RCP officiel (ANSM ou EMA, ou collage admin), éventuellement un extrait Meddispar (CPD) et un résumé multi-formes BDM.
Tu condenses en libellés pédagogiques pour UNE fiche médicament (1 DCI = 1 fiche).

Réponds UNIQUEMENT par un JSON valide (pas de markdown) :
{
  "version": 1,
  "champs": {
    "nom_commercial": ["…"],
    "dci": "…",
    "secteur_therapeutique": ["…"],
    "classe_therapeutique": ["…"],
    "classe_pharmacologique": ["…"],
    "detail_pharmacologie": "…",
    "posologie_generale": "…",
    "grossesse_allaitement": "…",
    "voies_administration": ["orale", "IV"],
    "indications": ["…"],
    "contre_indications": ["…"],
    "effets_indesirables": ["…"],
    "precautions_emploi": ["…"],
    "interactions": ["…"],
    "surveillances": ["…"],
    "conditions_prescription_delivrance": ["…"],
    "conseils_delivrance": ["…"]
  },
  "avertissements": ["limites, rubriques absentes, multi-formes…"]
}

Mapping rubriques → champs :
- 4.1 → indications
- 4.2 → posologie_generale (1 libellé synthétique adulte) + voies ; conseils_delivrance si consignes patient / modalités d’emploi utiles à l’officine
- 4.3 → contre_indications
- 4.4 → precautions_emploi (+ surveillances explicites) ; conseils_delivrance si conseils patient clairs
- 4.5 → interactions
- 4.6 → grossesse_allaitement (1 libellé)
- 4.8 → effets_indesirables : UNIQUEMENT fréquents OU rares mais graves
- 5.1 → detail_pharmacologie : détail COMPLET mais pédagogique (mécanisme, cible, famille ; jusqu’à ~500 car. si utile)
- conditions_prescription_delivrance (CPD) : depuis Meddispar si fourni, sinon indices RCP (liste I/II, stupéfiants, prescription initiale hospitalière, renouvellement, etc.). Ne pas inventer.
- conseils_delivrance : conseils officinaux concrets (prise, oubli, alimentation, surveillance patient) issus du RCP — pas de slogans.
- voies_administration : libellés courts (orale, IV, IM, SC, cutanée…) depuis 4.2 / BDM
- secteur / classes : déduire du RCP + style ATC pédagogique (voir few-shot). Omettre si incertain.
- nom_commercial / dci : reprendre le contexte (ne pas inventer de marques)

Mapping ATC pédagogique (few-shot Apixaban — style cible, ne pas recopier hors RCP) :
- secteur_therapeutique : "Cardiovasculaire"
- classe_therapeutique : "Anticoagulant"
- classe_pharmacologique : "INHIBITEURS facteur Xa"
- detail_pharmacologie : "INHIBITEURS DIRECTS DU FACTEUR Xa" (ou formulation plus complète si le RCP le permet)

Classe pharmacologique condensée (few-shot Lamictal / lamotrigine — style) :
- classe_pharmacologique courte type "Antiépileptique" / mécanisme condensé ; détail_pharmacologie porte le détail plus long.

Multi-formes (1 fiche) :
- Une seule fiche pour toutes les formes BDM fournies.
- Si une info ne vaut que pour une forme / voie, annoter le libellé : "(comprimé)", "(crème)", "(oral)", "(IV)", etc.
- Sinon libellé commun sans annotation.

Exemples de condensation clinique (Digoxine — style, ne pas recopier hors RCP) :
- indication : "Insuffisance cardiaque avec dysfonction systolique"
- CI : "Bloc AV du 2e ou 3e degré non appareillé"
- EI : "Troubles du rythme (surdosage)"

Règles :
1. Fidélité stricte au texte fourni (RCP + Meddispar). Aucun fait clinique inventé.
2. Condensation pédagogique : multi ~60–80 car. (max ~160–180) ; détail_pharmacologie plus riche autorisé.
3. Caps : ≤ 8 items / champ multi (≤ 6 CPD) ; 1 détail ; 1 posologie ; 1 grossesse.
4. Français, pas d'emoji, pas de markdown dans les libellés.
5. Omettre un champ plutôt que d’inventer.`;

function decodeHtml(s: string) {
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

function cleanHtml(html: string) {
  return decodeHtml(
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

function extractAnsmSections(html: string) {
  const parts = html.split(/<p class="AmmAnnexeTitre[12]"/i).slice(1);
  const out: Record<string, string> = {};
  for (const p of parts) {
    const m = p.match(/<span id=['"]([0-9]\.[0-9]*)\.?_/);
    if (!m) continue;
    const num = m[1];
    const body = p.replace(/^[^>]*>/, '');
    if (!out[num]) out[num] = body;
  }
  return out;
}

function stripSectionTitle(text: string) {
  return text.replace(/^\d\.\d\.?\s*[^\n]*\n/, '').trim();
}

async function fetchAnsmRcp(cis: string) {
  const url = `https://base-donnees-publique.medicaments.gouv.fr/medicament/${encodeURIComponent(cis)}/extrait`;
  let html = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'JeuPharma-IA/1.0 (admin pédagogique; lecture RCP publique)' },
    });
    if (!res.ok) throw new Error(`ANSM HTTP ${res.status}`);
    html = await res.text();
    if (/AmmAnnexeTitre/i.test(html) && html.length > 20_000) break;
    await new Promise((r) => setTimeout(r, 700 * (attempt + 1)));
  }
  const raw = extractAnsmSections(html);
  const sections: Record<string, string> = {};
  let total = 0;
  for (const num of SECTIONS) {
    const cleaned = raw[num] ? stripSectionTitle(cleanHtml(raw[num])) : '';
    sections[num] = cleaned.slice(0, 18_000);
    total += sections[num].length;
  }
  return { url, sections, total };
}

/** Secours EMA : page HTML publique du Community Register / EMA (best-effort). */
async function fetchEmaRcp(euNumber: string, dci: string) {
  const eu = String(euNumber || '').trim();
  const warnings: string[] = [];
  if (!eu) return { url: '', text: '', warnings };

  // Page produit EMA parfois indexée par nº EU (HTML, pas PDF).
  const searchUrl = `https://www.ema.europa.eu/en/search?search_api_fulltext=${encodeURIComponent(eu)}`;
  try {
    const res = await fetch(searchUrl, {
      headers: { 'User-Agent': 'JeuPharma-IA/1.0 (admin pédagogique; lecture RCP publique)' },
      redirect: 'follow',
    });
    if (!res.ok) {
      warnings.push(`EMA recherche HTTP ${res.status}`);
      return { url: searchUrl, text: '', warnings };
    }
    const html = await res.text();
    const text = cleanHtml(html).slice(0, MAX_RCP);
    // Filtre grossier : garder si le texte évoque la molécule / EPAR
    const hint = (dci || eu).toLowerCase().slice(0, 40);
    if (text.length < 800 || (hint && !text.toLowerCase().includes(hint.split(' ')[0]))) {
      warnings.push('EMA : page trouvée mais contenu RCP insuffisant — collage manuel recommandé');
      return { url: searchUrl, text: '', warnings };
    }
    return { url: searchUrl, text, warnings: ['Source EMA (secours) — vérifier les libellés'] };
  } catch (e) {
    warnings.push(`EMA inaccessible : ${e instanceof Error ? e.message : String(e)}`);
    return { url: searchUrl, text: '', warnings };
  }
}

function buildRcpBundle(sections: Record<string, string>, freeText?: string) {
  const parts: string[] = [];
  for (const num of SECTIONS) {
    const body = sections[num] || '';
    if (!body) continue;
    parts.push(`## ${num} ${SECTION_LABELS[num]}\n${body}`);
  }
  if (freeText && freeText.trim()) {
    parts.push(`## RCP (texte fourni)\n${freeText.trim().slice(0, MAX_RCP)}`);
  }
  return parts.join('\n\n').slice(0, MAX_RCP);
}

const str = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);

function buildUserText(p: {
  dci: string;
  cis?: string;
  noms: string[];
  contexte: Record<string, unknown>;
  rcpText: string;
  source: string;
  meddisparText?: string;
}) {
  const voiesBdm = String(p.contexte.voies_administration || '').trim();
  const forme = String(p.contexte.forme_pharmaceutique || '').trim();
  const formes = Array.isArray(p.contexte.formes)
    ? (p.contexte.formes as unknown[]).map((x) => str(x, 80)).filter(Boolean).slice(0, 20)
    : [];
  const nomsAgg = Array.isArray(p.contexte.noms_commerciaux_bdm)
    ? (p.contexte.noms_commerciaux_bdm as unknown[]).map((x) => str(x, 80)).filter(Boolean).slice(0, 12)
    : p.noms;
  const cisList = Array.isArray(p.contexte.cis_list)
    ? (p.contexte.cis_list as unknown[]).map((x) => str(x, 20)).filter(Boolean).slice(0, 20)
    : [];
  const resumeFormes = String(p.contexte.resume_formes || '').trim();
  return [
    `DCI : ${p.dci.slice(0, 120)}`,
    p.cis ? `CIS principal (RCP) : ${p.cis}` : '',
    cisList.length ? `CIS BDM (toutes formes mono-substance) : ${JSON.stringify(cisList)}` : '',
    nomsAgg.length ? `Noms commerciaux (agrégat BDM) : ${JSON.stringify(nomsAgg)}` : '',
    forme ? `Forme pharmaceutique (CIS principal) : ${forme.slice(0, 120)}` : '',
    formes.length ? `Formes BDM : ${JSON.stringify(formes)}` : '',
    resumeFormes ? `Résumé multi-formes : ${resumeFormes.slice(0, 400)}` : '',
    voiesBdm ? `Voies BDM : ${voiesBdm.slice(0, 200)}` : '',
    `Source RCP : ${p.source}`,
    '',
    'Consignes : 1 DCI = 1 fiche ; annoter (forme) si une info est spécifique à une forme.',
    '',
    '--- RCP ---',
    p.rcpText,
    p.meddisparText
      ? `\n--- Meddispar (CPD, best-effort) ---\n${p.meddisparText.slice(0, 8_000)}`
      : '',
    '',
    'Retourne le JSON demandé (champs condensés).',
  ].filter(Boolean).join('\n');
}

/** Meddispar : page publique best-effort pour CPD (échec soft → collage manuel). */
async function fetchMeddisparCpd(dci: string, cis?: string) {
  const warnings: string[] = [];
  const q = encodeURIComponent((cis || dci || '').trim().slice(0, 80));
  if (!q) return { text: '', url: '', warnings };
  const url = `https://www.meddispar.fr/Medicaments?recherche=${q}`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'JeuPharma-IA/1.0 (admin pédagogique; lecture CPD publique)' },
      redirect: 'follow',
    });
    if (!res.ok) {
      warnings.push(`Meddispar HTTP ${res.status} — CPD à coller / vérifier manuellement`);
      return { text: '', url, warnings };
    }
    const html = await res.text();
    const text = cleanHtml(html).slice(0, 6_000);
    const hint = (dci || '').toLowerCase().slice(0, 30);
    if (text.length < 200 || (hint && !text.toLowerCase().includes(hint.split(' ')[0]))) {
      warnings.push('Meddispar : contenu CPD insuffisant — vérifier manuellement ou coller');
      return { text: '', url, warnings };
    }
    return {
      text,
      url,
      warnings: ['Source Meddispar (best-effort) — vérifier les CPD'],
    };
  } catch (e) {
    warnings.push(`Meddispar inaccessible : ${e instanceof Error ? e.message : String(e)}`);
    return { text: '', url, warnings };
  }
}

function parseJsonResponse(raw: string) {
  let text = String(raw || '').trim();
  if (text.startsWith('```')) text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  return JSON.parse(text);
}

function uniqStrings(arr: unknown[], maxItems: number, maxLen: number) {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of arr) {
    const v = str(x, maxLen);
    if (!v) continue;
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
    if (out.length >= maxItems) break;
  }
  return out;
}

// deno-lint-ignore no-explicit-any
function normalize(parsed: any, fallback: { dci: string; noms: string[] }) {
  const warnings: string[] = Array.isArray(parsed?.avertissements)
    ? parsed.avertissements.map((w: unknown) => str(w, 300)).filter(Boolean).slice(0, 20)
    : [];
  const raw = parsed?.champs && typeof parsed.champs === 'object' ? parsed.champs : parsed || {};
  const champs: Record<string, unknown> = {};

  for (const [code, maxLen] of Object.entries(SINGULAR_MAXLEN)) {
    const v = str(raw[code], maxLen);
    if (v) champs[code] = v;
  }
  if (!champs.dci && fallback.dci) champs.dci = str(fallback.dci, SINGULAR_MAXLEN.dci);

  for (const [code, cap] of Object.entries(MULTI_CAPS)) {
    const maxLen = MULTI_MAXLEN[code] || 160;
    const src = Array.isArray(raw[code]) ? raw[code] : (raw[code] != null && raw[code] !== '' ? [raw[code]] : []);
    let items = uniqStrings(src, cap, maxLen);
    if (code === 'nom_commercial' && !items.length && fallback.noms.length) {
      items = uniqStrings(fallback.noms, cap, maxLen);
    }
    if (items.length) champs[code] = items;
  }

  return { version: 1, champs, avertissements: warnings };
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
        temperature: 0.15,
        responseMimeType: 'application/json',
        maxOutputTokens: 8192,
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
    const dci = str(payload.dci, 120);
    if (!dci) return json(400, { error: 'DCI requise' });

    const cis = str(payload.cis, 20).replace(/\D/g, '');
    const noms = Array.isArray(payload.noms_commerciaux)
      ? uniqStrings(payload.noms_commerciaux, 8, 80)
      : [];
    const contexte = (payload.contexte_bdm && typeof payload.contexte_bdm === 'object')
      ? payload.contexte_bdm as Record<string, unknown>
      : {};
    const manualRcp = typeof payload.rcp_text === 'string' ? payload.rcp_text.trim() : '';
    if (manualRcp.length > MAX_RCP) {
      return json(413, { error: `RCP trop long (${MAX_RCP} caractères maximum)` });
    }

    const avertissements: string[] = [];
    let source = 'manuel';
    let rcpUrl = '';
    let rcpText = '';
    const sections: Record<string, string> = {};

    if (manualRcp) {
      source = 'manuel';
      rcpText = buildRcpBundle({}, manualRcp);
    } else if (cis) {
      try {
        const ans = await fetchAnsmRcp(cis);
        Object.assign(sections, ans.sections);
        rcpUrl = ans.url;
        rcpText = buildRcpBundle(sections);
        if (ans.total >= 80) {
          source = 'ansm';
        } else {
          avertissements.push('RCP ANSM vide ou trop court');
        }
      } catch (e) {
        avertissements.push(`ANSM : ${e instanceof Error ? e.message : String(e)}`);
      }
    } else {
      avertissements.push('Aucun CIS fourni pour le fetch ANSM');
    }

    if (source !== 'ansm' && !manualRcp) {
      const eu = str(contexte.numero_autorisation_europeenne || payload.numero_autorisation_europeenne, 40);
      if (eu) {
        const ema = await fetchEmaRcp(eu, dci);
        avertissements.push(...ema.warnings);
        if (ema.text) {
          source = 'ema';
          rcpUrl = ema.url;
          rcpText = buildRcpBundle({}, ema.text);
        }
      }
    }

    if (!rcpText || rcpText.replace(/\s+/g, '').length < 40) {
      return json(200, {
        version: 1,
        need_manual_rcp: true,
        source: null,
        cis: cis || null,
        dci,
        rcp_url: rcpUrl || null,
        champs: {},
        avertissements: [
          ...avertissements,
          'RCP introuvable automatiquement — collez le texte du RCP (rubriques 4.1–4.8 / 5.1) puis relancez.',
        ],
        model: MODEL,
      });
    }

    let meddisparText = '';
    try {
      const md = await fetchMeddisparCpd(dci, cis || undefined);
      avertissements.push(...md.warnings);
      meddisparText = md.text || '';
    } catch (e) {
      avertissements.push(`Meddispar : ${e instanceof Error ? e.message : String(e)}`);
    }

    const userText = buildUserText({
      dci,
      cis: cis || undefined,
      noms,
      contexte,
      rcpText,
      source,
      meddisparText: meddisparText || undefined,
    });
    const { parsed, usage } = await callGemini(userText);
    const result = normalize(parsed, { dci, noms });
    return json(200, {
      ...result,
      avertissements: [...avertissements, ...result.avertissements].slice(0, 20),
      need_manual_rcp: false,
      source,
      cis: cis || null,
      dci,
      rcp_url: rcpUrl || null,
      model: MODEL,
      usage,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e || 'Erreur IA');
    console.error('jeupharma-ia-matrice', msg);
    return json(500, { error: msg });
  }
});
