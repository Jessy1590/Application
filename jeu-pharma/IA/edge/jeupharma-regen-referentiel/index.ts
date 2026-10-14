/**
 * Ops — régénération batch référentiel (RCP ANSM/EPAR → Gemini → entités canoniques).
 * Secret Gemini : GEMINI_API_KEY (Edge). Écriture : SERVICE_ROLE.
 * Auth : header x-jeupharma-ops = REGEN_OPS_TOKEN (ou token campagne) OU JWT service_role.
 * Body : { limit?: 1-8, worst_first?: bool, retry_skips?: bool }
 * Ne pas exposer côté navigateur joueur.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
// Pas d'unpdf ici : extraction EPAR PDF trop lourde pour le worker Edge → script local.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-jeupharma-ops',
};

const MODEL = Deno.env.get('GEMINI_IA_MODEL') || Deno.env.get('GEMINI_OCR_MODEL') || 'gemini-3.8-flash';
const OPS_TOKEN = String(Deno.env.get('REGEN_OPS_TOKEN') || '').trim();
const CAMPAIGN_OPS = 'jp-regen-20261014-vocab-canonique';
const MAX_RCP = 90_000;

/** CIS connus (orale / usuelle) — dci normalisée sans accents */
const CIS_ALLOW: Record<string, string> = {
  'sels ferreux': '61879666',
  'sels ferreux + acide folique': '64875192',
  'heparinate de sodium': '64395923',
  'heparinate de calcium': '69636132',
  'immunoglobulines anti-d': '62468162',
  'isosorbide dinitrate': '60172339',
  apixaban: '61902218',
  rivaroxaban: '64206365',
  sotalol: '62519799', // SOTALEX — RCP ANSM complet (Arrow souvent vide)
  ivabradine: '60549911',
  dapagliflozine: '67456363',
  'ginkgo biloba': '60287373', // TANAKAN (pas homéo Boiron)
  idarucizumab: '63555182',
  'tenecteplase': '65088998',
  'ténectéplase': '65088998',
  filgrastim: '61823354',
  'darbepoetine alfa': '66066271',
  'darbépoétine alfa': '66066271',
  'epoetine alfa': '67610861',
  'epoétine alfa': '67610861',
  'epoetine beta': '66823618',
  'epoétine bêta': '66823618',
  'sacubitril + valsartan': '65122144',
  'clopidogrel + aspirine': '61952274',
  'perindopril + amlodipine': '60657997',
  'périndopril + amlodipine': '60657997',
  'bisoprolol + hydrochlorothiazide': '67460027',
  'valsartan + hydrochlorothiazide': '67481950',
  'losartan + hydrochlorothiazide': '65214977',
  'irbesartan + hydrochlorothiazide': '61547030',
  'irbésartan + hydrochlorothiazide': '61547030',
  'candesartan + hydrochlorothiazide': '66950291',
  'candésartan + hydrochlorothiazide': '66950291',
  'olmesartan + hydrochlorothiazide': '66838901',
  'olmésartan + hydrochlorothiazide': '66838901',
  'telmisartan + hydrochlorothiazide': '60570229',
  'ramipril + hydrochlorothiazide': '67103203',
  'enalapril + hydrochlorothiazide': '69155138',
  'énalapril + hydrochlorothiazide': '69155138',
  'lisinopril + hydrochlorothiazide': '66434780',
  'amlodipine + atorvastatine': '65364681',
  'valsartan + amlodipine': '60058008',
  'olmesartan + amlodipine': '67023718',
  'olmésartan + amlodipine': '67023718',
  'telmisartan + amlodipine': '67700337',
  'enalapril + lercanidipine': '69974066',
  'énalapril + lercanidipine': '69974066',
  'amlodipine + indapamide': '60345218',
  'verapamil + trandolapril': '62404028',
  'vérapamil + trandolapril': '62404028',
  'atenolol + chlortalidone': '62980497',
  'aténolol + chlortalidone': '62980497',
  'felodipine + metoprolol': '61950444',
  'félodipine + métoprolol': '61950444',
  'amiloride + hydrochlorothiazide': '68045361',
  'spironolactone + altizide': '69724251',
  'triamterene + hydrochlorothiazide': '63870751',
  'triamtérène + hydrochlorothiazide': '63870751',
  'benazepril + hydrochlorothiazide': '61591226',
  'bénazépril + hydrochlorothiazide': '61591226',
  'captopril + hydrochlorothiazide': '60214350',
  'fosinopril + hydrochlorothiazide': '67017829',
  'quinapril + hydrochlorothiazide': '62927128',
  'timolol + amiloride + hydrochlorothiazide': '64343809',
};

/** Requêtes search_products alternatives (marque / alias) */
const SEARCH_ALIASES: Record<string, string[]> = {
  'sels ferreux': ['tardyferon', 'sulfate ferreux', 'ascofer'],
  'sels ferreux + acide folique': ['tardyferon b9', 'ferrograd folique'],
  'heparinate de calcium': ['calciparine', 'heparine calcique'],
  'heparinate de sodium': ['heparine sodique'],
  'immunoglobulines anti-d': ['rhophylac'],
  'isosorbide dinitrate': ['isocard', 'risordan'],
  'sacubitril + valsartan': ['entresto'],
  'clopidogrel + aspirine': ['duoplavin', 'clopidogrel/acide acetylsalicylique'],
  'perindopril + amlodipine': ['coveram'],
  'périndopril + amlodipine': ['coveram'],
  'bisoprolol + hydrochlorothiazide': ['lodoz'],
  'valsartan + hydrochlorothiazide': ['cotareg', 'nisisco'],
  'losartan + hydrochlorothiazide': ['fortzaar', 'hyzaar'],
  'irbesartan + hydrochlorothiazide': ['coaprovel'],
  'irbésartan + hydrochlorothiazide': ['coaprovel'],
  'candesartan + hydrochlorothiazide': ['atacand plus', 'kenzen'],
  'candésartan + hydrochlorothiazide': ['atacand plus'],
  'olmesartan + hydrochlorothiazide': ['coolmetec'],
  'olmésartan + hydrochlorothiazide': ['coolmetec'],
  'telmisartan + hydrochlorothiazide': ['micardisplus', 'prismasartan'],
  'ramipril + hydrochlorothiazide': ['triatec', 'cotriatec'],
  'enalapril + hydrochlorothiazide': ['co-renitec'],
  'énalapril + hydrochlorothiazide': ['co-renitec'],
  'lisinopril + hydrochlorothiazide': ['zestoretic'],
  'amlodipine + atorvastatine': ['caduet'],
  'valsartan + amlodipine': ['exforge'],
  'olmesartan + amlodipine': ['sevikar'],
  'olmésartan + amlodipine': ['sevikar'],
  'telmisartan + amlodipine': ['twynsta'],
  'enalapril + lercanidipine': ['zanextra'],
  'énalapril + lercanidipine': ['zanextra'],
  'amlodipine + indapamide': ['natrixam'],
  'verapamil + trandolapril': ['tarka'],
  'vérapamil + trandolapril': ['tarka'],
  'atenolol + chlortalidone': ['tenoretic'],
  'aténolol + chlortalidone': ['tenoretic'],
  'felodipine + metoprolol': ['logimax'],
  'félodipine + métoprolol': ['logimax'],
  'amiloride + hydrochlorothiazide': ['moduretic'],
  'spironolactone + altizide': ['aldactazine'],
  'triamterene + hydrochlorothiazide': ['prestol'],
  'triamtérène + hydrochlorothiazide': ['prestol'],
  'benazepril + hydrochlorothiazide': ['cibadrex'],
  'bénazépril + hydrochlorothiazide': ['cibadrex'],
  'captopril + hydrochlorothiazide': ['captea'],
  'fosinopril + hydrochlorothiazide': ['foziretic'],
  'quinapril + hydrochlorothiazide': ['acuitel'],
  'zofenopril + hydrochlorothiazide': ['zofenil'],
  'zofénopril + hydrochlorothiazide': ['zofenil'],
  'timolol + amiloride + hydrochlorothiazide': ['moducren'],
  sotalol: ['sotalex', 'sotalol'],
  'ginkgo biloba': ['tanakan', 'ginkgo biloba'],
  apixaban: ['eliquis', 'apixaban'],
  rivaroxaban: ['xarelto', 'rivaroxaban'],
  idarucizumab: ['praxbind'],
  'tenecteplase': ['metalyse'],
  'ténectéplase': ['metalyse'],
  filgrastim: ['neupogen', 'accofil', 'zarxio'],
  'darbepoetine alfa': ['aranesp'],
  'darbépoétine alfa': ['aranesp'],
  'epoetine alfa': ['binocrit', 'epoetin'],
  'epoétine alfa': ['binocrit'],
  'epoetine beta': ['neorecormon'],
  'epoétine bêta': ['neorecormon'],
  ivabradine: ['procoralan', 'ivabradine'],
  dapagliflozine: ['forxiga', 'dapagliflozine'],
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

const CHAMP_META: Record<string, { table: string; card: 1 | 'N'; liaison?: string; fk?: string; col?: string }> = {
  nom_commercial: { table: 'noms_commerciaux', card: 'N', liaison: 'matrice_noms_commerciaux', fk: 'nom_commercial_id' },
  secteur_therapeutique: {
    table: 'secteurs_therapeutiques', card: 'N',
    liaison: 'matrice_secteurs_therapeutiques', fk: 'secteur_therapeutique_id', col: 'secteur_therapeutique_id',
  },
  classe_therapeutique: {
    table: 'classes_therapeutiques', card: 'N',
    liaison: 'matrice_classes_therapeutiques', fk: 'classe_therapeutique_id', col: 'classe_therapeutique_id',
  },
  classe_pharmacologique: {
    table: 'classes_pharmacologiques', card: 'N',
    liaison: 'matrice_classes_pharmacologiques', fk: 'classe_pharmacologique_id', col: 'classe_pharmacologique_id',
  },
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
  conditions_prescription_delivrance: {
    table: 'conditions_prescription_delivrance', card: 'N',
    liaison: 'matrice_conditions_prescription_delivrance', fk: 'condition_prescription_delivrance_id',
  },
  conseils_delivrance: {
    table: 'conseils_delivrance', card: 'N',
    liaison: 'matrice_conseils_delivrance', fk: 'conseil_delivrance_id',
  },
};

const SYSTEM_PROMPT = `Tu es un assistant pédagogique Jeu Pharma (officine / DEUST).
Condense un RCP officiel en libellés pédagogiques pour UNE fiche (1 DCI = 1 fiche).
JSON uniquement :
{"version":1,"champs":{"nom_commercial":[],"secteur_therapeutique":["Cardiovasculaire"],"classe_therapeutique":["Anticoagulant"],"classe_pharmacologique":["Inhibiteur du facteur Xa"],"detail_pharmacologie":"…","posologie_generale":"…","grossesse_allaitement":"…","voies_administration":["orale"],"indications":["Hypertension artérielle"],"contre_indications":[],"effets_indesirables":[],"precautions_emploi":[],"interactions":[],"surveillances":[],"conditions_prescription_delivrance":[],"conseils_delivrance":[]},"avertissements":[]}

VOCABULAIRE UNIQUE obligatoire :
- Hypertension artérielle (pas HTA / Hypertension seule)
- Insuffisance cardiaque (pas IC) ; Fibrillation auriculaire (pas FA)
- Anticoagulant / Antiagrégant plaquettaire / Bêtabloquant (singulier)
- Inhibiteur de l'enzyme de conversion ; Antagoniste des récepteurs de l'angiotensine II
- Antivitamine K ; Anticoagulant oral direct ; Inhibiteur du facteur Xa
- Secteur : Cardiovasculaire
Fidélité RCP ; EI fréquents ou rares graves ; multi ≤8 ; ~60-80 car. ; détail ≤500 ; annoter (forme) si besoin.`;

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function assertOps(req: Request) {
  const ops = String(req.headers.get('x-jeupharma-ops') || '').trim();
  if (ops && ((OPS_TOKEN && ops === OPS_TOKEN) || ops === CAMPAIGN_OPS)) return true;
  const auth = req.headers.get('Authorization') || '';
  const m = auth.match(/Bearer\s+(.+)/i);
  if (!m) return false;
  try {
    const payload = JSON.parse(atob(m[1].split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload?.role === 'service_role';
  } catch {
    return false;
  }
}

function str(v: unknown, max: number) {
  return String(v ?? '').trim().slice(0, max);
}

function normKey(s: string) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function uniqStrings(arr: unknown[], maxItems: number, maxLen: number) {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of arr) {
    const v = str(x, maxLen);
    if (!v) continue;
    const k = v.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(v);
    if (out.length >= maxItems) break;
  }
  return out;
}

function decodeHtml(s: string) {
  return s
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'");
}

function cleanHtml(html: string) {
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

function sectionsToText(raw: Record<string, string>) {
  const labels: Record<string, string> = {
    '4.1': 'Indications', '4.2': 'Posologie', '4.3': 'CI', '4.4': 'Précautions',
    '4.5': 'Interactions', '4.6': 'Grossesse', '4.8': 'EI', '5.1': 'Pharmacodynamie',
  };
  const parts: string[] = [];
  let total = 0;
  for (const num of Object.keys(labels)) {
    if (!raw[num]) continue;
    const cleaned = cleanHtml(raw[num]).replace(/^\d\.\d\.?\s*[^\n]*\n/, '').slice(0, 16_000);
    total += cleaned.length;
    parts.push(`## ${num} ${labels[num]}\n${cleaned}`);
  }
  return { text: parts.join('\n\n').slice(0, MAX_RCP), total };
}

function extractEparPdfUrl(html: string): string | null {
  const m = html.match(/href="([^"]*epar[^"]*\.pdf)"/i)
    || html.match(/href="(https:\/\/www\.ema\.europa\.eu[^"]*product-information[^"]*\.pdf)"/i);
  if (!m) return null;
  const u = m[1];
  return u.startsWith('http') ? u : `https://www.ema.europa.eu${u}`;
}

async function fetchAnsmHtml(cis: string): Promise<{ url: string; html: string }> {
  const url = `https://base-donnees-publique.medicaments.gouv.fr/medicament/${encodeURIComponent(cis)}/extrait`;
  let html = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'JeuPharma-regen/1.0 (ops pédagogique)' },
    });
    if (!res.ok) throw new Error(`ANSM HTTP ${res.status}`);
    html = await res.text();
    if (/AmmAnnexeTitre/i.test(html) || /epar.*\.pdf/i.test(html) || html.length > 15_000) break;
    await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
  }
  return { url, html };
}

async function fetchRcpForCis(cis: string): Promise<{ url: string; text: string; total: number; source: string; epar_url?: string }> {
  const { url, html } = await fetchAnsmHtml(cis);
  const fromHtml = sectionsToText(extractAnsmSections(html));
  if (fromHtml.total >= 80) {
    return { url, text: fromHtml.text, total: fromHtml.total, source: 'ansm_html' };
  }
  const pdfUrl = extractEparPdfUrl(html) || undefined;
  // Edge léger : pas d'extraction PDF ici (worker OOM). Le runner local passe rcp_text.
  return {
    url,
    text: fromHtml.text,
    total: fromHtml.total,
    source: pdfUrl ? 'ansm_epar_link' : 'ansm_vide',
    epar_url: pdfUrl,
  };
}

function sbService(schema: string) {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('SUPABASE_URL / SERVICE_ROLE manquants');
  return createClient(url, key, {
    db: { schema },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function scoreHit(h: Record<string, unknown>, dci: string, parts: string[]) {
  let score = 0;
  const denom = String(h.denomination || '').toLowerCase();
  const subst = String(h.substances || h.substance || '').toLowerCase();
  const forme = String(h.forme_pharmaceutique || h.forme || '').toLowerCase();
  const etat = String(h.etat_commercialisation || '').toLowerCase();
  const blob = `${denom} ${subst} ${forme}`;
  if (etat.includes('commercialis')) score += 15;
  if (/comprim|gelule|capsule|orale|buvable/.test(blob)) score += 25;
  if (/inject|perfus|hom[eé]opath/.test(blob)) score -= 20;
  if (/boiron|lehning|degre de dilution/.test(blob)) score -= 40;
  for (const p of parts) {
    if (p.length < 3) continue;
    if (subst.includes(p) || denom.includes(p)) score += 20;
  }
  const nk = normKey(dci);
  if (nk.includes('+') && parts.length >= 2) {
    const multi = (subst.match(/\+/g) || []).length >= 1 || parts.every((p) => subst.includes(p) || denom.includes(p));
    if (multi) score += 30;
    else score -= 10;
  }
  return score;
}

async function searchBdm(q: string, lim = 12): Promise<Record<string, unknown>[]> {
  const bdm = sbService('bdm');
  const { data, error } = await bdm.rpc('search_products', { q, lim });
  if (error || !data?.length) return [];
  return data as Record<string, unknown>[];
}

async function pickCisCandidates(dci: string): Promise<{ cis: string; score: number; via: string }[]> {
  const nk = normKey(dci);
  const out: { cis: string; score: number; via: string }[] = [];
  const seen = new Set<string>();
  const push = (cis: string, score: number, via: string) => {
    const c = String(cis || '').replace(/\D/g, '');
    if (!c || seen.has(c)) return;
    seen.add(c);
    out.push({ cis: c, score, via });
  };

  if (CIS_ALLOW[nk] || CIS_ALLOW[dci.toLowerCase()]) {
    push(CIS_ALLOW[nk] || CIS_ALLOW[dci.toLowerCase()], 200, 'allow');
  }

  const parts = nk.split(/\s*\+\s*/).map((p) => p.trim()).filter(Boolean);
  const queries = new Set<string>();
  queries.add(dci);
  queries.add(nk.replace(/\+/g, ' '));
  for (const a of SEARCH_ALIASES[nk] || SEARCH_ALIASES[dci.toLowerCase()] || []) queries.add(a);
  if (parts.length >= 2) {
    queries.add(parts.join(' '));
    queries.add(parts[0]);
  } else if (parts[0]) {
    queries.add(parts[0].split(/\s+/)[0]);
  }

  for (const q of queries) {
    if (!q || q.length < 2) continue;
    const hits = await searchBdm(q, 12);
    for (const h of hits) {
      const cis = String(h.cis || '').replace(/\D/g, '');
      if (!cis) continue;
      push(cis, scoreHit(h, dci, parts), `search:${q}`);
    }
  }

  out.sort((a, b) => b.score - a.score);
  return out.slice(0, 8);
}

async function resolveRcp(dci: string): Promise<{
  cis: string | null;
  text: string;
  total: number;
  source: string;
  url: string;
  error?: string;
}> {
  const cands = await pickCisCandidates(dci);
  if (!cands.length) return { cis: null, text: '', total: 0, source: 'none', url: '', error: 'no_cis' };

  for (const c of cands) {
    try {
      const rcp = await fetchRcpForCis(c.cis);
      if (rcp.total >= 80) {
        return { cis: c.cis, text: rcp.text, total: rcp.total, source: rcp.source, url: rcp.url };
      }
    } catch (e) {
      console.error('RCP cis', c.cis, e instanceof Error ? e.message : e);
    }
  }

  const best = cands[0];
  let eparUrl: string | undefined;
  try {
    const probe = await fetchRcpForCis(best.cis);
    eparUrl = probe.epar_url;
  } catch { /* ignore */ }

  return {
    cis: best.cis,
    text: '',
    total: 0,
    source: eparUrl ? 'needs_epar_pdf' : 'none',
    url: eparUrl || '',
    error: 'rcp_vide',
  };
}

async function callGemini(userText: string) {
  const apiKey = String(Deno.env.get('GEMINI_API_KEY') || Deno.env.get('GOOGLE_API_KEY') || '').trim();
  if (!apiKey) throw new Error('GEMINI_API_KEY manquant');
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
      },
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}: ${JSON.stringify(body).slice(0, 280)}`);
  let raw = body.candidates?.[0]?.content?.parts?.map((x: { text?: string }) => x.text || '').join('') || '';
  if (!raw) throw new Error('Gemini vide');
  if (raw.startsWith('```')) raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  return JSON.parse(raw);
}

function normalizeChamps(parsed: Record<string, unknown>, dci: string) {
  const raw = (parsed?.champs && typeof parsed.champs === 'object'
    ? parsed.champs
    : parsed) as Record<string, unknown>;
  const champs: Record<string, unknown> = {};
  for (const code of ['detail_pharmacologie', 'posologie_generale', 'grossesse_allaitement']) {
    const v = str(raw[code], code === 'detail_pharmacologie' ? 520 : 220);
    if (v) champs[code] = v;
  }
  champs.dci = dci;
  for (const [code, cap] of Object.entries(MULTI_CAPS)) {
    const src = Array.isArray(raw[code]) ? raw[code] : (raw[code] != null && raw[code] !== '' ? [raw[code]] : []);
    const items = uniqStrings(src as unknown[], cap, code.includes('secteur') || code.includes('classe') ? 120 : 180);
    if (items.length) champs[code] = items;
  }
  return champs;
}

async function resolveEntite(jeu: ReturnType<typeof sbService>, table: string, valeur: string) {
  const v = String(valeur || '').trim();
  if (!v) return null;
  const { data, error } = await jeu.rpc('ops_entite_find_or_create', { p_table: table, p_valeur: v });
  if (error) throw error;
  return data as string | null;
}

async function replaceLiaisons(
  jeu: ReturnType<typeof sbService>,
  matriceId: string,
  liaison: string,
  fk: string,
  ids: string[],
) {
  await jeu.from(liaison).delete().eq('matrice_id', matriceId);
  if (!ids.length) return;
  const rows = ids.map((id, ordre) => ({ matrice_id: matriceId, [fk]: id, ordre }));
  const { error } = await jeu.from(liaison).insert(rows);
  if (error) throw error;
}

async function applyChamps(
  jeu: ReturnType<typeof sbService>,
  matriceId: string,
  champs: Record<string, unknown>,
) {
  let reused = 0;
  let created = 0;
  const patch: Record<string, unknown> = {
    fiche_validee: false,
    updated_at: new Date().toISOString(),
  };

  for (const [code, meta] of Object.entries(CHAMP_META)) {
    const raw = champs[code];
    if (raw == null || raw === '') continue;
    if (meta.card === 1) {
      const id = await resolveEntite(jeu, meta.table, String(raw));
      if (!id || !meta.col) continue;
      patch[meta.col] = id;
      created += 1;
    } else {
      const arr = Array.isArray(raw) ? raw : [raw];
      const ids: string[] = [];
      const seen = new Set<string>();
      for (const item of arr.slice(0, MULTI_CAPS[code] || 8)) {
        const id = await resolveEntite(jeu, meta.table, String(item));
        if (!id || seen.has(id)) {
          if (id) reused += 1;
          continue;
        }
        seen.add(id);
        ids.push(id);
      }
      if (meta.liaison && meta.fk) await replaceLiaisons(jeu, matriceId, meta.liaison, meta.fk, ids);
      if (meta.col && ids[0]) patch[meta.col] = ids[0];
      reused += ids.length;
    }
  }

  const { error } = await jeu.from('matrice_medicaments').update(patch).eq('id', matriceId);
  if (error) throw error;
  return { reused, created };
}

async function logResult(
  jeu: ReturnType<typeof sbService>,
  row: {
    matrice_id: string;
    dci: string;
    status: string;
    cis?: string | null;
    error?: string | null;
    reused?: number;
    created_n?: number;
  },
) {
  await jeu.from('ops_regen_log').upsert({
    matrice_id: row.matrice_id,
    dci: row.dci,
    status: row.status,
    cis: row.cis || null,
    error: row.error || null,
    reused: row.reused ?? 0,
    created_n: row.created_n ?? 0,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'matrice_id' });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    if (req.method !== 'POST') return json(405, { error: 'POST only' });
    if (!assertOps(req)) return json(403, { error: 'Ops token / service_role requis' });

    const body = await req.json().catch(() => ({}));
    const jeu = sbService('jeupharma');

    // Mode léger : texte RCP déjà extrait (runner local EPAR PDF)
    if (body.apply_one === true) {
      const matriceId = String(body.matrice_id || '').trim();
      const dci = String(body.dci || '').trim();
      const cis = String(body.cis || '').replace(/\D/g, '') || null;
      const rcpText = String(body.rcp_text || '').trim().slice(0, MAX_RCP);
      const source = String(body.source || 'local_rcp').slice(0, 40);
      if (!matriceId || !dci || rcpText.length < 80) {
        return json(400, { error: 'apply_one requiert matrice_id, dci, rcp_text≥80' });
      }
      const userText = [
        `DCI : ${dci}`,
        cis ? `CIS : ${cis}` : '',
        `Source RCP : ${source}`,
        '',
        '--- RCP ---',
        rcpText,
        '',
        'Retourne le JSON (libellés CANONIQUES partagés).',
      ].filter(Boolean).join('\n');
      const parsed = await callGemini(userText);
      const champs = normalizeChamps(parsed, dci);
      const stats = await applyChamps(jeu, matriceId, champs);
      await logResult(jeu, {
        matrice_id: matriceId,
        dci,
        status: 'ok',
        cis,
        reused: stats.reused,
        created_n: stats.created,
      });
      return json(200, {
        ok: [{ matrice_id: matriceId, dci, status: 'ok', cis, source, stats }],
        errors: [],
        mode: 'apply_one',
        model: MODEL,
      });
    }

    const limit = Math.max(1, Math.min(Number(body.limit) || 3, 8));
    const worstFirst = body.worst_first !== false;
    const retrySkips = body.retry_skips === true;

    type Cand = { id: string; dci: string; worst: number };
    const cands: Cand[] = [];

    if (retrySkips) {
      // Uniquement skips « premiers » (pas encore _retried)
      const { data: skips, error: sErr } = await jeu
        .from('ops_regen_log')
        .select('matrice_id, dci, error')
        .eq('status', 'skip')
        .in('error', ['no_cis', 'rcp_vide'])
        .order('error')
        .limit(200);
      if (sErr) throw sErr;
      for (const s of skips || []) {
        cands.push({
          id: s.matrice_id,
          dci: s.dci || '',
          worst: s.error === 'rcp_vide' ? 100 : 50,
        });
      }
    } else {
      const { data: doneRows } = await jeu.from('ops_regen_log').select('matrice_id');
      const done = new Set((doneRows || []).map((r: { matrice_id: string }) => r.matrice_id));
      const { data: mats, error: mErr } = await jeu
        .from('matrice_medicaments')
        .select('id, dci_id')
        .neq('statut', 'archive')
        .limit(500);
      if (mErr) throw mErr;
      const pending = (mats || []).filter((m: { id: string }) => !done.has(m.id));
      for (const m of pending) {
        const { data: dciRow } = await jeu.from('dcis').select('valeur').eq('id', m.dci_id).maybeSingle();
        const dci = dciRow?.valeur || '';
        let worst = 0;
        if (worstFirst) {
          const { data: pre } = await jeu
            .from('matrice_precautions_emploi')
            .select('precaution_emploi_id')
            .eq('matrice_id', m.id);
          worst = (pre || []).length;
        }
        cands.push({ id: m.id, dci, worst });
      }
    }

    if (!cands.length) {
      return json(200, { done: true, processed: 0, remaining: 0, ok: [], errors: [], mode: retrySkips ? 'retry_skips' : 'pending' });
    }

    cands.sort((a, b) => b.worst - a.worst);
    const batch = cands.slice(0, limit);
    const ok: unknown[] = [];
    const errors: unknown[] = [];

    for (const f of batch) {
      const entry: Record<string, unknown> = { matrice_id: f.id, dci: f.dci };
      try {
        const rcp = await resolveRcp(f.dci);
        if (!rcp.cis) {
          const errCode = retrySkips ? 'no_cis_retried' : 'no_cis';
          entry.status = 'skip';
          entry.error = errCode;
          await logResult(jeu, { matrice_id: f.id, dci: f.dci, status: 'skip', error: errCode });
          errors.push(entry);
          continue;
        }
        if (rcp.total < 80) {
          const errCode = retrySkips ? 'rcp_vide_retried' : 'rcp_vide';
          entry.status = 'skip';
          entry.error = errCode;
          entry.cis = rcp.cis;
          entry.source = rcp.source;
          await logResult(jeu, { matrice_id: f.id, dci: f.dci, status: 'skip', cis: rcp.cis, error: errCode });
          errors.push(entry);
          continue;
        }
        const userText = [
          `DCI : ${f.dci}`,
          `CIS : ${rcp.cis}`,
          `Source RCP : ${rcp.source}`,
          '',
          '--- RCP ---',
          rcp.text,
          '',
          'Retourne le JSON (libellés CANONIQUES partagés).',
        ].join('\n');
        const parsed = await callGemini(userText);
        const champs = normalizeChamps(parsed, f.dci);
        const stats = await applyChamps(jeu, f.id, champs);
        entry.status = 'ok';
        entry.cis = rcp.cis;
        entry.source = rcp.source;
        entry.stats = stats;
        await logResult(jeu, {
          matrice_id: f.id,
          dci: f.dci,
          status: 'ok',
          cis: rcp.cis,
          reused: stats.reused,
          created_n: stats.created,
        });
        ok.push(entry);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        entry.status = 'error';
        entry.error = msg.slice(0, 400);
        await logResult(jeu, {
          matrice_id: f.id,
          dci: f.dci,
          status: 'error',
          error: msg.slice(0, 400),
        });
        errors.push(entry);
      }
    }

    const remaining = Math.max(0, cands.length - batch.length);
    return json(200, {
      done: remaining === 0,
      processed: batch.length,
      remaining,
      ok,
      errors,
      model: MODEL,
      mode: retrySkips ? 'retry_skips' : 'pending',
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('jeupharma-regen-referentiel', msg);
    return json(500, { error: msg });
  }
});
