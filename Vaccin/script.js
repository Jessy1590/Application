// --- CONFIGURATION ---
const cfg = window.SUPABASE_CONFIG;
if (!cfg?.url || !cfg?.anonKey) throw new Error('SUPABASE_CONFIG manquant');

const sbAuth = supabase.createClient(cfg.url, cfg.anonKey, { db: { schema: 'portail' } });
const sbVaccin = supabase.createClient(cfg.url, cfg.anonKey, { db: { schema: 'autres' } });
const TABLE_NAME = 'vaccins';

const FAMILIES = [
  { id: '', label: 'Toutes' },
  { id: 'dtp', label: 'DTP / Hib / Hexa' },
  { id: 'hep', label: 'Hépatites' },
  { id: 'men', label: 'Méningocoques' },
  { id: 'pneumo', label: 'Pneumocoque' },
  { id: 'ror', label: 'ROR / Varicelle / Zona' },
  { id: 'saison', label: 'Grippe / Covid / VRS' },
  { id: 'voyage', label: 'Voyage / tropicaux' },
  { id: 'autre', label: 'Autres' }
];

const DEFAULT_SITUATIONS =
  "Officine : Faisable en pharmacie (pharmacien)\n" +
  "Obligatoire : Vaccination obligatoire\n" +
  "Immunodéprimé : Patients immunodéprimés\n" +
  "VIH : Personnes vivant avec le VIH\n" +
  "Grossesse : Femmes enceintes\n" +
  "Voyage : Voyageurs / zones d'endémie\n" +
  "Professionnel : Exposition professionnelle\n" +
  "Cocooning : Entourage du nourrisson\n" +
  "Senior : 65 ans et plus\n" +
  "Hors reco : Hors recommandations / hors affichage courant";

const DEFAULT_LEGEND =
  "Années révolues = années terminées (ex. 24 ans révolus = jusqu'à la veille du 25e anniversaire). " +
  "Sources : Calendrier vaccinal 2026 + Vaccination Info Service. " +
  "Officine : badge uniquement pour vaccins du calendrier réalisables en routine par un pharmacien formé " +
  "(≥11 ans ; grippe ≥11 ans ; Covid ≥5 ans) — liste blanche stricte. " +
  "Hors reco : fiches masquées par défaut (voyageurs hors calendrier général, monovalents obsolètes / transition). " +
  "Revaxis arrêté → rappels adultes en dTcaP.";

/**
 * Liste blanche Officine (arrêté 8 août 2023 modifié) :
 * pharmacien d'officine formé, pharmacie agréée, droit commun calendrier.
 * Pas de badge pour centres agréés, circuits particuliers, primo &lt; 11 ans, etc.
 */
const OFFICINE_WHITELIST = [
  {
    re: /^dipht[eé]rie\s*\/\s*t[eé]tanos\s*\/\s*coqueluche\s*\/\s*poliomy[eé]lite$/i,
    label: 'Officine (≥11 ans)',
    detail: 'dTcaP / DTCaP ados-adultes : prescription + administration calendrier (≥ 11 ans). Vivants atténués : pas de prescription si immunodéprimé.'
  },
  {
    re: /^h[eé]patite\s*b$/i,
    label: 'Officine (≥11 ans)',
    detail: 'Hépatite B monovalent ado/adulte ≥ 11 ans (Engerix® B20…). Primo nourrisson via hexa = hors âge officine.'
  },
  {
    re: /^h[eé]patite\s*a$/i,
    label: 'Officine (≥11 ans)',
    detail: 'Hépatite A ≥ 11 ans selon indication (voyageurs / risques).'
  },
  {
    re: /^h[eé]patite\s*a\s*&\s*h[eé]patite\s*b$/i,
    label: 'Officine (≥16 ans)',
    detail: 'Twinrix® Adulte (≥ 16 ans) — calendrier / indications combinées HAV+HBV.'
  },
  {
    re: /^grippe/i,
    label: 'Officine (≥11 ans)',
    detail: 'Grippe : prescription + administration dès 11 ans (cible ou non).'
  },
  {
    re: /^covid/i,
    label: 'Officine (≥5 ans)',
    detail: 'Covid-19 : prescription + administration dès 5 ans (cible ou non).'
  },
  {
    re: /^m[eé]ningocoque\s*a,\s*c,\s*y,\s*w$/i,
    label: 'Officine (≥11 ans)',
    detail: 'Méningo ACWY : dose ado 11-14 ans / rattrapage 15-24 ans. Schéma nourrisson obligatoire = hors âge officine.'
  },
  {
    re: /^m[eé]ningocoque\s*b$/i,
    label: 'Officine (≥11 ans)',
    detail: 'Méningo B : Trumenba® / Bexsero® pour ados-adultes (≥ 10-11 ans selon AMM). Primo nourrisson = hors âge officine.'
  },
  {
    re: /papillomavirus|\bhpv\b/i,
    label: 'Officine (≥11 ans)',
    detail: 'HPV 11-14 ans + rattrapage jusqu’à 26 ans révolus.'
  },
  {
    re: /^pneumocoque$/i,
    label: 'Officine (≥18 ans)',
    detail: 'Pneumocoque adultes (≥ 18 ans à risque / ≥ 65 ans : VPC20 / Capvaxive®). Primo nourrisson = hors âge officine.'
  },
  {
    re: /rougeole|oreillons|rub[eé]ole/i,
    label: 'Officine (≥11 ans)',
    detail: 'ROR rattrapage ≥ 11 ans (nés ≥ 1980, 2 doses). Vivant atténué : pas de prescription si immunodéprimé / grossesse.'
  },
  {
    re: /^varicelle$/i,
    label: 'Officine (≥11 ans)',
    detail: 'Varicelle cibles ≥ 11 ans (ados, femmes en âge de procréer, pros…). Vivant atténué : pas de prescription si immunodéprimé / grossesse.'
  },
  {
    re: /^zona$/i,
    label: 'Officine (≥18 ans)',
    detail: 'Shingrix® : ≥ 65 ans immuno-compétents ; immunodéprimés ≥ 18 ans.'
  },
  {
    re: /syncytial|\bvrs\b/i,
    label: 'Officine (≥11 ans)',
    detail: 'Vaccins VRS (Abrysvo® grossesse 32-36 SA ; Abrysvo® / Arexvy® / mRESVIA® seniors). Beyfortus® / Synagis® (anticorps) ≠ badge officine vaccin calendrier.'
  },
  {
    re: /enc[eé]phalite\s*[aà]\s*tiques/i,
    label: 'Officine (≥11 ans)',
    detail: 'Encéphalite à tiques : recommandation calendrier pour exposés / pros en zone d’endémie (≥ 11 ans).'
  }
];
const VIS_BASE = 'https://professionnels.vaccination-info-service.fr/Maladies-et-leurs-vaccins';

/** Fiches VIS détectées depuis les valences d'une ligne (une fiche par pathologie). */
const PATHO_VIS = [
  { re: /tuberculose|\bbcg\b/i, label: 'Tuberculose', slug: 'Tuberculose' },
  { re: /dipht[eé]rie/i, label: 'Diphtérie', slug: 'Diphterie' },
  { re: /t[eé]tanos/i, label: 'Tétanos', slug: 'Tetanos' },
  { re: /coqueluche/i, label: 'Coqueluche', slug: 'Coqueluche' },
  { re: /poliomy[eé]lite/i, label: 'Poliomyélite', slug: 'Poliomyelite' },
  { re: /haemophilus|hib\b/i, label: 'Haemophilus b', slug: 'Infections-invasives-a-Haemophilus-influenzae-b' },
  { re: /h[eé]patite\s*a\s*[&et]+\s*h[eé]patite\s*b|h[eé]patite\s*a\s*&\s*h[eé]patite\s*b/i, label: null, slug: null, multi: [
    { label: 'Hépatite A', slug: 'Hepatite-A' },
    { label: 'Hépatite B', slug: 'Hepatite-B' }
  ]},
  { re: /h[eé]patite\s*a\b(?!\s*[&et])/i, label: 'Hépatite A', slug: 'Hepatite-A' },
  { re: /h[eé]patite\s*b\b/i, label: 'Hépatite B', slug: 'Hepatite-B' },
  { re: /m[eé]ningocoque/i, label: 'Méningocoques', slug: 'Infections-invasives-a-meningocoques' },
  { re: /pneumocoque/i, label: 'Pneumocoque', slug: 'Infections-a-pneumocoques' },
  { re: /papillomavirus|\bhpv\b/i, label: 'HPV', slug: 'Infections-a-papillomavirus-humain-HPV' },
  { re: /rougeole|oreillons|rub[eé]ole/i, label: null, slug: null, multi: [
    { label: 'Rougeole', slug: 'Rougeole' },
    { label: 'Oreillons', slug: 'Oreillons' },
    { label: 'Rubéole', slug: 'Rubeole' }
  ]},
  { re: /varicelle/i, label: 'Varicelle', slug: 'Varicelle' },
  { re: /\bzona\b/i, label: 'Zona', slug: 'Zona' },
  { re: /grippe/i, label: 'Grippe', slug: 'Grippe-saisonniere' },
  { re: /covid/i, label: 'COVID-19', slug: 'COVID-19' },
  { re: /\bvrs\b|syncytial|bronchiolite/i, label: 'VRS', slug: 'Bronchiolites-et-infections-respiratoires-dues-aux-virus-respiratoires-syncitiaux-VRS' },
  { re: /rotavirus/i, label: 'Rotavirus', slug: 'Gastro-enterite-a-rotavirus' },
  { re: /fi[eè]vre jaune/i, label: 'Fièvre jaune', slug: 'Fievre-jaune' },
  { re: /dengue/i, label: 'Dengue', slug: 'Dengue' },
  { re: /chikungunya/i, label: 'Chikungunya', slug: 'Chikungunya' },
  { re: /mpox|variole/i, label: 'Mpox', slug: 'Mpox-Variole-du-singe' },
  { re: /rage/i, label: 'Rage', slug: 'Rage' },
  { re: /leptospirose/i, label: 'Leptospirose', slug: 'Leptospirose' },
  { re: /enc[eé]phalite\s*[aà]\s*tiques/i, label: 'Encéphalite à tiques', slug: 'Encephalite-a-tiques' },
  { re: /enc[eé]phalite\s*japonaise/i, label: 'Encéphalite japonaise', slug: 'Encephalite-japonaise' },
  { re: /typho[iï]de/i, label: 'Typhoïde', slug: 'Fievre-typhoide' },
  { re: /chol[eé]ra/i, label: 'Choléra', slug: 'Cholera' }
];

// --- ETAT ---
let currentData = [];
let filteredData = [];
let settingsId = null;
let isAdmin = false;
let sortCol = 'pathologie';
let sortAsc = true;
let activeFamily = '';
let showHorsReco = false;
let quillDetails = null;
let quillRattrapage = null;
let editingId = null;

const el = id => document.getElementById(id);

/** Quill ne doit pas être créé tant que le panneau admin est display:none. */
function ensureQuill() {
  if (quillDetails && quillRattrapage) return;
  const opts = {
    theme: 'snow',
    modules: {
      toolbar: [
        ['bold', 'italic', 'underline'],
        [{ list: 'ordered' }, { list: 'bullet' }],
        ['link'],
        ['clean']
      ]
    }
  };
  if (!quillDetails) quillDetails = new Quill('#f_details', opts);
  if (!quillRattrapage) quillRattrapage = new Quill('#f_rattrapage', opts);
}

function setQuillHtml(quill, html) {
  if (!quill) return;
  const safe = html && String(html).trim() ? html : '';
  try {
    quill.setContents([]);
    if (safe) quill.clipboard.dangerouslyPasteHTML(safe);
  } catch (_) {
    quill.root.innerHTML = safe || '<p><br></p>';
  }
}

function getQuillHtml(quill) {
  if (!quill) return '';
  const html = (quill.root.innerHTML || '').trim();
  if (!html || html === '<p><br></p>' || html === '<p></p>') return '';
  return quill.root.innerHTML;
}

function normalizeHexColor(value, fallback = '#7F8C8D') {
  const v = (value || '').trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(v)) return v;
  if (/^#[0-9A-Fa-f]{3}$/.test(v)) {
    return '#' + v[1] + v[1] + v[2] + v[2] + v[3] + v[3];
  }
  return fallback;
}

async function syncVaccinSession() {
  try {
    const { data: { session } } = await sbAuth.auth.getSession();
    if (session?.access_token && session?.refresh_token) {
      await sbVaccin.auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token
      });
    }
  } catch (err) {
    console.warn('Sync session vaccins:', err);
  }
}

function openAdminPanel() {
  ensureQuill();
  el('adminPanel').classList.add('active');
  document.body.classList.add('admin-active');
}

function closeAdminPanel() {
  el('adminPanel').classList.remove('active');
  document.body.classList.remove('admin-active');
}

function updateAdminFormTitle() {
  const title = el('adminFormTitle');
  const saveBtn = el('saveBtn');
  if (!title || !saveBtn) return;
  if (editingId) {
    title.textContent = 'Modifier cette fiche';
    saveBtn.textContent = 'Enregistrer les modifications';
  } else {
    title.textContent = 'Ajouter une fiche';
    saveBtn.textContent = 'Ajouter';
  }
}

// --- UTILITAIRES ---
function showMessage(msg, isError = false) {
  const container = el('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${isError ? 'error' : 'success'}`;
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

function escapeHtml(unsafe) {
  if (!unsafe) return '';
  return unsafe.toString()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function stripHTML(html) {
  return (html || '').replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim();
}

/** Palette unifiée par famille (design clinique teal/ardoise). */
const FAMILY_COLORS = {
  dtp: '#16A085',
  hep: '#F39C12',
  men: '#E83A5D',
  pneumo: '#C0392B',
  ror: '#9B59B6',
  saison: '#607D8B',
  voyage: '#2980B9'
};

/** Sous-groupes stables de la famille « autre ». */
const AUTRE_SUBGROUP_COLORS = {
  bcg: '#8E44AD',
  hpv: '#E67E22',
  rotavirus: '#607D8B',
  mpox: '#7F8C8D',
  default: '#7F8C8D'
};

function getFamily(patho) {
  const p = (patho || '').toLowerCase();
  if (/diphtérie|tétanos|coqueluche|poliomyélite|haemophilus/.test(p)) return 'dtp';
  if (/hépatite/.test(p)) return 'hep';
  if (/méningocoque/.test(p)) return 'men';
  if (/pneumocoque/.test(p)) return 'pneumo';
  if (/rougeole|oreillons|rubéole|varicelle|zona/.test(p)) return 'ror';
  if (/grippe|covid|vrs|syncytial/.test(p)) return 'saison';
  if (/fièvre jaune|dengue|chikungunya|typhoïde|choléra|encéphalite|rage|leptospirose/.test(p)) return 'voyage';
  return 'autre';
}

function getFallbackColor(patho) {
  if (!patho) return AUTRE_SUBGROUP_COLORS.default;
  const p = patho.toLowerCase();
  if (/bcg|tuberculose/.test(p)) return AUTRE_SUBGROUP_COLORS.bcg;
  if (/papillomavirus|\bhpv\b/.test(p)) return AUTRE_SUBGROUP_COLORS.hpv;
  if (/rotavirus/.test(p)) return AUTRE_SUBGROUP_COLORS.rotavirus;
  if (/mpox|variole/.test(p)) return AUTRE_SUBGROUP_COLORS.mpox;
  const family = getFamily(patho);
  return FAMILY_COLORS[family] || AUTRE_SUBGROUP_COLORS.default;
}

function isHorsReco(v) {
  return v?.hors_reco === true || v?.hors_reco === 'true' || v?.hors_reco === 1;
}

function getPharmacistInfo(v) {
  const p = (v.pathologie || '').trim();
  const hit = OFFICINE_WHITELIST.find(entry => entry.re.test(p));
  if (hit) {
    return { eligible: true, label: hit.label, detail: hit.detail };
  }

  const pl = p.toLowerCase();
  let detail = 'Hors liste blanche officine (calendrier droit commun, pharmacien formé, pharmacie agréée).';
  if (/fi[eè]vre jaune/.test(pl)) detail = 'Centres de vaccination agréés fièvre jaune — pas d’officine de droit commun.';
  else if (/typho[iï]de|chol[eé]ra|enc[eé]phalite japonaise/.test(pl)) detail = 'Vaccin voyageur hors calendrier général officine.';
  else if (/bcg|tuberculose|rotavirus/.test(pl)) detail = 'Schéma nourrisson — hors âge officine (< 11 ans).';
  else if (/haemophilus.*coqueluche|hexavalent|penta|hexa/.test(pl) || (pl.includes('haemophilus') && pl.includes('dipht'))) {
    detail = 'Combiné pédiatrique / nourrisson (< 11 ans).';
  } else if (/^haemophilus influenzae b/.test(pl) || pl === 'poliomyélite') {
    detail = 'Monovalent pédiatrique ou situations particulières — hors routine officine ≥ 11 ans.';
  } else if (/^rage$/.test(pl)) detail = 'Pré-expo pro borderline ; post-expo = centres antirabiques — pas de badge.';
  else if (/leptospirose|dengue|chikungunya|mpox|variole/.test(pl)) {
    detail = 'Indication / circuit particulier — pas de badge officine de droit commun.';
  } else if (/m[eé]ningocoque\s*c/.test(pl)) detail = 'Transition ACWY — monovalent C hors routine officine.';
  else if (/t[eé]tanos \(valence seule\)|dipht[eé]rie \/ t[eé]tanos$|revaxis|dTP/.test(pl)) {
    detail = 'Fiche transition / ATU / informatif — pas de produit officine de routine.';
  }

  return { eligible: false, label: null, detail };
}

function getBadges(v) {
  const t = `${v.pathologie} ${v.vaccins} ${v.calendrier} ${stripHTML(v.details)} ${stripHTML(v.rattrapage)}`.toLowerCase();
  const badges = [];
  if (isHorsReco(v)) badges.push({ k: 'hors-reco', l: 'Hors reco' });
  const pharma = getPharmacistInfo(v);
  if (pharma.eligible && pharma.label) badges.push({ k: 'officine', l: pharma.label });
  if (/\bobligatoire\b/.test(t)) badges.push({ k: 'obl', l: 'Obligatoire' });
  if (/grossesse|aménorrhée|\bsa\b|enceinte|post[- ]?partum/.test(t)) badges.push({ k: 'gross', l: 'Grossesse' });
  if (/65 ans|75 ans|senior/.test(t)) badges.push({ k: 'senior', l: 'Senior' });
  if (/voyage|endémie|départ imminent|zones d.?endémie/.test(t)) badges.push({ k: 'voyage', l: 'Voyage' });
  if (/professionnel|médecine du travail|l\.3111|pros\b|personnel/.test(t)) badges.push({ k: 'pro', l: 'Pro' });
  if (/cocooning|entourage du (nouveau-né|nourrisson)/.test(t)) badges.push({ k: 'coco', l: 'Cocooning' });
  if (/\bvih\b/.test(t)) badges.push({ k: 'vih', l: 'VIH' });
  if (/immunodéprim/.test(t)) badges.push({ k: 'immuno', l: 'Immuno' });
  if (/arrêt|arrêté|n.est plus commercialisé|plus utilisé en recommandation|remplacé par/.test(t)) {
    badges.push({ k: 'stop', l: 'Transition' });
  }
  return badges;
}

function renderBadges(badges) {
  if (!badges.length) return '';
  return `<div class="row-badges">${badges.map(b => `<span class="badge ${b.k}">${escapeHtml(b.l)}</span>`).join('')}</div>`;
}

function getPathoLinks(v) {
  const text = `${v.pathologie || ''} ${v.vaccins || ''}`;
  const seen = new Set();
  const links = [];

  const push = (label, slugOrUrl) => {
    const url = /^https?:\/\//i.test(slugOrUrl) ? slugOrUrl : `${VIS_BASE}/${slugOrUrl}`;
    if (seen.has(url)) return;
    seen.add(url);
    links.push({ label, url });
  };

  for (const entry of PATHO_VIS) {
    if (!entry.re.test(text)) continue;
    if (entry.multi) {
      entry.multi.forEach(m => push(m.label, m.slug));
    } else if (entry.slug) {
      push(entry.label, entry.slug);
    }
  }

  // Liens manuels supplémentaires (une URL par ligne, ou Libellé|URL)
  const raw = (v.lien || '').trim();
  if (raw) {
    raw.split(/\n+/).map(l => l.trim()).filter(Boolean).forEach(line => {
      if (line.includes('|')) {
        const [label, url] = line.split('|').map(s => s.trim());
        if (url) push(label || 'Fiche', url);
      } else if (/^https?:\/\//i.test(line)) {
        const slug = line.split('/').pop() || 'Fiche';
        push(slug.replace(/-/g, ' '), line);
      }
    });
  }

  return links;
}

function renderPathoLinks(links, compact = true) {
  if (!links.length) return '';
  const cls = compact ? 'btn ghost' : 'btn link-btn';
  return links.map(l =>
    `<a href="${escapeHtml(l.url)}" target="_blank" rel="noopener" class="${cls}" onclick="event.stopPropagation();">${escapeHtml(l.label)}</a>`
  ).join('');
}

function printTableOnly() {
  const scrollY = window.scrollY || document.documentElement.scrollTop || 0;
  const printable = filteredData.filter(v => !isHorsReco(v));
  const rowsHtml = printable.length
    ? printable.map(v => {
        const color = v.couleur || getFallbackColor(v.pathologie);
        return `<tr>
      <td style="background-color:${color};color:#fff;font-weight:700;">${escapeHtml(v.pathologie || '')}</td>
      <td>${escapeHtml(v.vaccins || '')}</td>
      <td>${escapeHtml(v.calendrier || '')}</td>
    </tr>`;
      }).join('')
    : '<tr><td colspan="3">Aucune fiche à imprimer (hors reco exclus).</td></tr>';

  const dateTxt = el('lastUpdated')?.textContent || '';
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none;';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow.document;
  doc.open();
  doc.write(`<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Vaccins &amp; valences — impression</title>
<style>
  body{font-family:system-ui,sans-serif;color:#111;margin:12px;font-size:11px;}
  h1{font-size:16px;margin:0 0 4px;}
  .meta{color:#555;margin:0 0 12px;font-size:11px;}
  table{width:100%;border-collapse:collapse;}
  th,td{border:1px solid #bbb;padding:5px 7px;vertical-align:top;text-align:left;}
  th{background:#eee;}
  @page{size:A4 landscape;margin:0.8cm;}
</style></head><body>
<h1>Vaccins &amp; valences — France</h1>
<p class="meta">${escapeHtml(dateTxt)} — hors recommandations exclus</p>
<table>
  <thead><tr><th>Valences / pathologies</th><th>Noms commerciaux</th><th>Schéma &amp; cibles</th></tr></thead>
  <tbody>${rowsHtml}</tbody>
</table>
</body></html>`);
  doc.close();

  const win = iframe.contentWindow;
  const cleanup = () => {
    try { iframe.remove(); } catch (_) {}
    window.scrollTo(0, scrollY);
  };

  win.addEventListener('afterprint', cleanup);
  setTimeout(() => {
    win.focus();
    win.print();
    setTimeout(cleanup, 1500);
  }, 100);
}

function highlight(text, query) {
  const safeText = escapeHtml(text);
  if (!query) return safeText;
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  return safeText.replace(regex, '<mark>$1</mark>');
}

// --- INIT ---
async function init() {
  try {
    await syncVaccinSession();
    const { data: { session } } = await sbAuth.auth.getSession();
    if (session) {
      const { data: profile } = await sbAuth.from('profiles').select('role').eq('id', session.user.id).single();
      if (profile && profile.role === 'admin') {
        isAdmin = true;
        el('toggleAdminBtn').classList.remove('hidden');
        document.body.classList.add('is-admin');
      }
    }
  } catch (_) { /* accès lecture possible */ }

  renderFamilyChips();
  setupEventListeners();
  await loadData();
}

function renderFamilyChips() {
  const host = el('familyChips');
  host.innerHTML = FAMILIES.map(f =>
    `<button type="button" class="chip${f.id === activeFamily ? ' active' : ''}" data-family="${f.id}">${escapeHtml(f.label)}</button>`
  ).join('');
}

function setupEventListeners() {
  el('toggleAdminBtn').addEventListener('click', () => {
    if (el('adminPanel').classList.contains('active')) {
      closeAdminPanel();
    } else {
      openAdminPanel();
      updateAdminFormTitle();
      el('adminPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });

  el('printBtn').addEventListener('click', e => {
    e.preventDefault();
    printTableOnly();
  });
  el('searchInput').addEventListener('input', onSearchInput);
  el('clearSearchBtn').addEventListener('click', () => {
    el('searchInput').value = '';
    el('clearSearchBtn').classList.add('hidden');
    filterTable();
    el('searchInput').focus();
  });
  el('filterParticularity').addEventListener('change', filterTable);
  el('toggleHorsReco')?.addEventListener('change', e => {
    showHorsReco = !!e.target.checked;
    filterTable();
  });
  el('saveSettingsBtn').addEventListener('click', saveSettings);
  el('importFile').addEventListener('change', importData);
  el('exportBtn').addEventListener('click', exportData);
  el('cancelEditBtn').addEventListener('click', resetForm);
  el('addForm').addEventListener('submit', saveEntry);

  el('familyChips').addEventListener('click', e => {
    const btn = e.target.closest('[data-family]');
    if (!btn) return;
    activeFamily = btn.getAttribute('data-family') || '';
    renderFamilyChips();
    filterTable();
  });

  el('vaccineTbody').addEventListener('click', e => {
    const adminEdit = e.target.closest('[data-edit]');
    const adminDel = e.target.closest('[data-delete]');
    const link = e.target.closest('a');
    if (link) {
      e.stopPropagation();
      return;
    }
    if (adminEdit) {
      e.preventDefault();
      e.stopPropagation();
      editEntry(adminEdit.getAttribute('data-edit'));
      return;
    }
    if (adminDel) {
      e.preventDefault();
      e.stopPropagation();
      deleteEntry(adminDel.getAttribute('data-delete'));
      return;
    }
    const row = e.target.closest('tr[data-id]');
    if (row) openModal(row.getAttribute('data-id'));
  });

  el('vaccineTbody').addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    if (e.target.closest('button, a')) return;
    const row = e.target.closest('tr[data-id]');
    if (!row) return;
    e.preventDefault();
    openModal(row.getAttribute('data-id'));
  });

  el('vaccinModal').addEventListener('click', e => {
    if (e.target === el('vaccinModal')) closeModal();
    const editBtn = e.target.closest('[data-modal-edit]');
    if (editBtn) {
      e.preventDefault();
      const id = editBtn.getAttribute('data-modal-edit');
      closeModal();
      editEntry(id);
    }
  });
  el('closeModalBtn').addEventListener('click', closeModal);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && el('vaccinModal').classList.contains('active')) closeModal();
  });

  document.querySelectorAll('th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.getAttribute('data-col');
      if (sortCol === col) sortAsc = !sortAsc;
      else { sortCol = col; sortAsc = true; }
      document.querySelectorAll('th.sortable').forEach(h => h.classList.remove('asc', 'desc'));
      th.classList.add(sortAsc ? 'asc' : 'desc');
      applySortAndRender();
    });
  });
}

function onSearchInput() {
  const has = el('searchInput').value.trim().length > 0;
  el('clearSearchBtn').classList.toggle('hidden', !has);
  filterTable();
}

// --- DATA ---
async function loadData() {
  const { data, error } = await sbVaccin.from(TABLE_NAME).select('*');
  if (error) {
    el('vaccineTbody').innerHTML = `<tr><td colspan="3" class="empty-cell">Erreur : ${escapeHtml(error.message)}</td></tr>`;
    return;
  }

  const settingsEntry = data.find(item => item.pathologie === '__PARAMETRES__');

  if (settingsEntry) {
    settingsId = settingsEntry.id;
    el('adminDateInput').value = settingsEntry.calendrier || '';
    el('adminLegendInput').value = settingsEntry.rattrapage || DEFAULT_LEGEND;
    el('adminSituationsInput').value = settingsEntry.details || DEFAULT_SITUATIONS;
    el('legendText').textContent = settingsEntry.rattrapage || DEFAULT_LEGEND;

    if (settingsEntry.calendrier) {
      const dateObj = new Date(settingsEntry.calendrier);
      el('lastUpdated').textContent =
        'Calendrier vaccinal 2026 · mise à jour affichée : ' +
        dateObj.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
    } else {
      autoCalculateDate(data);
    }
    updateFilterSelect(settingsEntry.details || DEFAULT_SITUATIONS);
  } else {
    settingsId = null;
    el('adminLegendInput').value = DEFAULT_LEGEND;
    el('adminSituationsInput').value = DEFAULT_SITUATIONS;
    el('legendText').textContent = DEFAULT_LEGEND;
    updateFilterSelect(DEFAULT_SITUATIONS);
    autoCalculateDate(data);
  }

  currentData = data.filter(item => item.pathologie !== '__PARAMETRES__') || [];
  filterTable();
}

function autoCalculateDate(dataArr) {
  const regularData = dataArr.filter(item => item.pathologie !== '__PARAMETRES__');
  if (regularData.length > 0) {
    const dates = regularData.map(v => new Date(v.created_at || Date.now()));
    const maxDate = new Date(Math.max.apply(null, dates));
    el('lastUpdated').textContent =
      'Dernière mise à jour : ' +
      maxDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  } else {
    el('lastUpdated').textContent = 'Aucune donnée';
  }
}

function updateFilterSelect(situationsText) {
  const select = el('filterParticularity');
  select.innerHTML = '<option value="">Toutes les situations</option>';
  if (!situationsText) return;

  situationsText.split('\n').forEach(line => {
    if (!line.trim()) return;
    const parts = line.split(':');
    const val = parts[0].trim();
    const label = parts.length > 1 ? parts.slice(1).join(':').trim() : val;
    const opt = document.createElement('option');
    opt.value = val;
    opt.textContent = label;
    select.appendChild(opt);
  });
}

// --- FILTER / SORT ---
function filterTable() {
  const query = el('searchInput').value.toLowerCase().trim();
  const particularity = el('filterParticularity').value.toLowerCase();

  filteredData = currentData.filter(v => {
    if (!showHorsReco && isHorsReco(v)) return false;
    if (activeFamily && getFamily(v.pathologie) !== activeFamily) return false;

    const txtPatho = (v.pathologie || '').toLowerCase();
    const txtVaccins = (v.vaccins || '').toLowerCase();
    const txtCal = (v.calendrier || '').toLowerCase();
    const plainDetails = stripHTML(v.details).toLowerCase();
    const plainRattrapage = stripHTML(v.rattrapage).toLowerCase();
    const haystack = `${txtPatho} ${txtVaccins} ${txtCal} ${plainDetails} ${plainRattrapage}`;

    const matchSearch = !query || haystack.includes(query);

    let matchFilter = true;
    if (particularity) {
      if (particularity === 'officine' || particularity.includes('officine') || particularity.includes('pharmacien')) {
        matchFilter = getPharmacistInfo(v).eligible === true;
      } else if (particularity === 'hors reco' || particularity.includes('hors reco')) {
        matchFilter = isHorsReco(v);
      } else {
        matchFilter = haystack.includes(particularity);
      }
    }
    return matchSearch && matchFilter;
  });

  applySortAndRender();
}

function applySortAndRender() {
  filteredData.sort((a, b) => {
    const valA = (a[sortCol] || '').toLowerCase();
    const valB = (b[sortCol] || '').toLowerCase();
    if (valA < valB) return sortAsc ? -1 : 1;
    if (valA > valB) return sortAsc ? 1 : -1;
    return 0;
  });
  renderTable(filteredData);
}

function renderTable(dataArray) {
  const tbody = el('vaccineTbody');
  const query = el('searchInput').value.trim();
  const visibleBase = showHorsReco ? currentData.length : currentData.filter(v => !isHorsReco(v)).length;
  const horsCount = currentData.filter(isHorsReco).length;

  el('resultCount').textContent =
    dataArray.length === visibleBase
      ? `${visibleBase} fiches${!showHorsReco && horsCount ? ` (${horsCount} hors reco masquées)` : ''}`
      : `${dataArray.length} / ${visibleBase} fiches`;

  if (dataArray.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" class="empty-cell">Aucun vaccin ne correspond à votre recherche.</td></tr>';
    return;
  }

  tbody.innerHTML = dataArray.map(v => {
    const color = v.couleur || getFallbackColor(v.pathologie);
    const badges = getBadges(v);
    const hors = isHorsReco(v);
    return `<tr data-id="${escapeHtml(v.id)}" class="${hors ? 'row-hors-reco' : ''}" tabindex="0" role="button" aria-label="Ouvrir ${escapeHtml(v.pathologie)}">
      <td class="col-patho" style="background-color:${color};">
        ${highlight(v.pathologie, query)}
        ${renderBadges(badges)}
      </td>
      <td class="col-vaccin">${highlight(v.vaccins, query)}</td>
      <td class="col-cal">
        ${highlight(v.calendrier, query)}
        <span class="hint-click no-print">Cliquer pour schéma &amp; rattrapage</span>
        <div class="row-actions no-print">
          ${renderPathoLinks(getPathoLinks(v), true)}
          ${isAdmin ? `
            <span class="inline-admin-btns">
              <button type="button" class="btn admin-btn" data-edit="${escapeHtml(v.id)}">Éditer</button>
              <button type="button" class="btn danger-btn" data-delete="${escapeHtml(v.id)}">Supprimer</button>
            </span>` : ''}
        </div>
      </td>
    </tr>`;
  }).join('');
}

// --- MODAL ---
function openModal(id) {
  const v = currentData.find(item => item.id == id);
  if (!v) return;

  const color = v.couleur || getFallbackColor(v.pathologie);
  el('modalPathologieTag').textContent = v.pathologie;
  el('modalPathologieTag').style.backgroundColor = color;
  el('modalNom').textContent = v.vaccins;
  el('modalCalendrier').textContent = v.calendrier || 'Schéma non renseigné';
  el('modalBadges').innerHTML = renderBadges(getBadges(v));

  const pharma = getPharmacistInfo(v);
  const pharmaBox = el('modalPharma');
  if (pharmaBox) {
    if (pharma.eligible) {
      pharmaBox.className = 'modal-pharma yes';
      pharmaBox.innerHTML = `<strong>${escapeHtml(pharma.label)}</strong> — ${escapeHtml(pharma.detail)}`;
      pharmaBox.hidden = false;
    } else {
      pharmaBox.className = 'modal-pharma no';
      pharmaBox.innerHTML = `<strong>Pas en officine (habitude)</strong> — ${escapeHtml(pharma.detail || 'Hors compétence pharmacien d’officine')}`;
      pharmaBox.hidden = false;
    }
  }

  el('modalDetails').innerHTML = v.details || '<p>Aucune information.</p>';
  el('modalRattrapage').innerHTML = v.rattrapage || '<p>Non spécifié.</p>';
  const pathoLinks = getPathoLinks(v);
  let footerHtml = '';
  if (pathoLinks.length) {
    footerHtml += `<div class="modal-links"><span class="modal-links-label">Fiches pathologie VIS</span><div class="modal-links-list">${renderPathoLinks(pathoLinks, false)}</div></div>`;
  }
  if (isAdmin) {
    footerHtml += `<div class="modal-admin-actions"><button type="button" class="btn admin-btn" data-modal-edit="${escapeHtml(v.id)}">Éditer cette fiche</button></div>`;
  }
  el('modalFooter').innerHTML = footerHtml;

  el('vaccinModal').classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  el('vaccinModal').classList.remove('active');
  document.body.style.overflow = '';
}

// --- ADMIN ---
async function saveEntry(e) {
  e.preventDefault();
  ensureQuill();
  await syncVaccinSession();

  const id = el('editId').value || editingId || '';
  const payload = {
    pathologie: el('f_pathologie').value.trim(),
    vaccins: el('f_vaccins').value.trim(),
    calendrier: el('f_calendrier').value.trim(),
    lien: el('f_lien').value.trim(),
    couleur: normalizeHexColor(el('f_couleur').value, getFallbackColor(el('f_pathologie').value)),
    details: getQuillHtml(quillDetails),
    rattrapage: getQuillHtml(quillRattrapage),
    hors_reco: !!(el('f_hors_reco') && el('f_hors_reco').checked)
  };

  if (!payload.pathologie || !payload.vaccins) {
    showMessage('Pathologie et noms commerciaux sont obligatoires.', true);
    return;
  }

  el('saveBtn').disabled = true;
  el('saveBtn').textContent = 'Enregistrement…';

  let res;
  try {
    if (id) {
      res = await sbVaccin.from(TABLE_NAME).update(payload).eq('id', id).select();
    } else {
      res = await sbVaccin.from(TABLE_NAME).insert([payload]).select();
    }
  } catch (err) {
    el('saveBtn').disabled = false;
    updateAdminFormTitle();
    showMessage(err.message || 'Erreur réseau', true);
    return;
  }

  el('saveBtn').disabled = false;
  updateAdminFormTitle();

  if (res.error) {
    showMessage(res.error.message, true);
    return;
  }
  if (!res.data || res.data.length === 0) {
    showMessage('Aucune ligne enregistrée — vérifiez vos droits admin / connexion.', true);
    return;
  }

  showMessage(id ? 'Fiche mise à jour.' : 'Fiche ajoutée.');
  resetForm();
  await loadData();
}

function editEntry(id) {
  const v = currentData.find(item => String(item.id) === String(id));
  if (!v) {
    showMessage('Fiche introuvable.', true);
    return;
  }

  closeModal();
  openAdminPanel();
  ensureQuill();

  editingId = v.id;
  el('editId').value = v.id;
  el('f_pathologie').value = v.pathologie || '';
  el('f_vaccins').value = v.vaccins || '';
  el('f_calendrier').value = v.calendrier || '';
  el('f_lien').value = v.lien || '';
  el('f_couleur').value = normalizeHexColor(v.couleur, getFallbackColor(v.pathologie));
  if (el('f_hors_reco')) el('f_hors_reco').checked = isHorsReco(v);

  // Laisser le panneau s'afficher avant de peupler Quill (évite éditeur « mort »)
  requestAnimationFrame(() => {
    setQuillHtml(quillDetails, v.details || '');
    setQuillHtml(quillRattrapage, v.rattrapage || '');
  });

  el('cancelEditBtn').classList.remove('hidden');
  updateAdminFormTitle();
  el('adminPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  el('f_pathologie').focus();
}

async function deleteEntry(id) {
  if (!confirm('Supprimer définitivement cette ligne ?')) return;
  await syncVaccinSession();
  const { data, error } = await sbVaccin.from(TABLE_NAME).delete().eq('id', id).select();
  if (error) {
    showMessage(error.message, true);
    return;
  }
  if (!data || data.length === 0) {
    showMessage('Suppression impossible — droits admin / connexion ?', true);
    return;
  }
  showMessage('Ligne supprimée.');
  if (String(editingId) === String(id)) resetForm();
  await loadData();
}

function resetForm() {
  editingId = null;
  el('addForm').reset();
  el('editId').value = '';
  el('f_couleur').value = '#7F8C8D';
  if (el('f_hors_reco')) el('f_hors_reco').checked = false;
  ensureQuill();
  setQuillHtml(quillDetails, '');
  setQuillHtml(quillRattrapage, '');
  el('cancelEditBtn').classList.add('hidden');
  updateAdminFormTitle();
}

async function saveSettings() {
  await syncVaccinSession();
  const payload = {
    pathologie: '__PARAMETRES__',
    vaccins: 'Ligne système - Ne pas supprimer',
    calendrier: el('adminDateInput').value,
    rattrapage: el('adminLegendInput').value,
    details: el('adminSituationsInput').value
  };

  let res;
  if (settingsId) {
    res = await sbVaccin.from(TABLE_NAME).update(payload).eq('id', settingsId).select();
  } else {
    res = await sbVaccin.from(TABLE_NAME).insert([payload]).select();
  }

  if (res.error) {
    showMessage(res.error.message, true);
    return;
  }
  if (!res.data || res.data.length === 0) {
    showMessage('Paramètres non enregistrés — droits admin / connexion ?', true);
    return;
  }
  showMessage('Paramètres enregistrés.');
  await loadData();
}

function exportData() {
  if (currentData.length === 0) return;
  const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(currentData, null, 2));
  const dl = document.createElement('a');
  dl.setAttribute('href', dataStr);
  dl.setAttribute('download', 'vaccins.json');
  dl.click();
}

async function importData(event) {
  const file = event.target.files[0];
  if (!file) return;
  await syncVaccinSession();
  const reader = new FileReader();
  reader.onload = async e => {
    try {
      let imported = JSON.parse(e.target.result);
      if (!Array.isArray(imported)) imported = [imported];
      // Ne pas réinsérer les id / paramètres système tels quels
      const rows = imported
        .filter(r => r && r.pathologie && r.pathologie !== '__PARAMETRES__')
        .map(({ id, created_at, ...rest }) => rest);
      if (!rows.length) throw new Error('Aucune fiche valide dans le fichier');
      const { data, error } = await sbVaccin.from(TABLE_NAME).insert(rows).select();
      if (error) throw error;
      if (!data?.length) throw new Error('Import refusé (droits ?)');
      showMessage(`${data.length} fiche(s) importée(s).`);
      event.target.value = '';
      await loadData();
    } catch (err) {
      showMessage('Erreur d\'import : ' + err.message, true);
    }
  };
  reader.readAsText(file);
}

window.onload = init;
