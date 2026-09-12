/* Phie Evreux — app mobile */
const cfg = window.SUPABASE_CONFIG;
if (!cfg?.url || !cfg?.anonKey) throw new Error('SUPABASE_CONFIG manquant');

const sb = supabase.createClient(cfg.url, cfg.anonKey, { db: { schema: 'autres' } });
const TABLE = 'phie_evreux';

const el = (id) => document.getElementById(id);
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const state = {
  all: [],
  commentQueue: [],
  callQueue: [],
  commentIndex: 0,
  callIndex: 0,
  callStep: 'ask_call',
  editingId: null,
  draft: {},
};

const APPEL_STATUT_LABELS = {
  a_appeler: 'À appeler',
  a_rappeler: 'À rappeler',
  termine: 'Terminé',
  PERTE: 'PERTE',
};

const APPEL_RESULTAT_LABELS = {
  ramene_semaine: 'Ramène appareil dans la semaine',
  ordo_mail: 'Envoie ordonnance par mail',
  ordo_mail_a_faire: 'Envoie ordonnance par mail — À faire',
  message_repondeur: 'Message sur le répondeur',
  raccroche: 'Raccroché',
  mauvais_numero: 'Mauvais numéro',
  pas_de_numero: 'Pas de numéro',
  autre_raison: 'Autre raison',
  message_laisse: 'Message laissé',
};

/* Résultats pour lesquels le patient rend l’appareil ou fournit l’ordonnance :
   le statut PERTE n’a alors aucun sens. */
const RESULTATS_SANS_PERTE = new Set(['ramene_semaine', 'ordo_mail', 'ordo_mail_a_faire']);

const TYPES_BASE = ['Lit', 'Tire lait', 'Aérosol'];
const TYPES_STORAGE_KEY = 'phie_evreux_types';
const TYPE_AUTRE = '__autre__';

function toast(msg, type = 'ok') {
  const t = el('toast');
  t.hidden = false;
  t.className = `toast ${type}`;
  t.textContent = msg;
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { t.hidden = true; }, 2800);
}

function todayFr() {
  return new Date().toLocaleDateString('fr-FR');
}

function parseFrDate(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[./\-](\d{1,2})[./\-](\d{2,4})$/);
  if (!m) return null;
  let [, d, mo, y] = m;
  if (y.length === 2) y = `20${y}`;
  const iso = `${y.padStart(4, '0')}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  const dt = new Date(`${iso}T12:00:00`);
  return Number.isNaN(dt.getTime()) ? null : iso;
}

function toFrInput(iso) {
  if (!iso) return '';
  const s = String(iso).slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split('-');
    return `${d}/${m}/${y}`;
  }
  return String(iso);
}

function fmtDate(iso) {
  return iso ? (toFrInput(iso) || String(iso)) : '—';
}

function maskDateInput(input) {
  const digits = input.value.replace(/\D/g, '').slice(0, 8);
  let out = digits;
  if (digits.length > 4) out = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
  else if (digits.length > 2) out = `${digits.slice(0, 2)}/${digits.slice(2)}`;
  input.value = out;
}

function bindDateMasks(root = document) {
  $$('.date-mask', root).forEach((input) => {
    if (input.dataset.maskBound) return;
    input.dataset.maskBound = '1';
    input.addEventListener('input', () => maskDateInput(input));
  });
}

function fullName(row) {
  return `${(row.nom || '').toUpperCase()} ${row.prenom || ''}`.trim();
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function phonesOf(row) {
  const p = row?.telephones;
  return Array.isArray(p) ? p.filter(Boolean) : [];
}

function telHref(num) {
  return `tel:${String(num).replace(/[^\d+]/g, '')}`;
}

function collectPhones(listEl) {
  return $$('.phone-input', listEl).map((i) => i.value.trim()).filter(Boolean);
}

function addPhoneRow(listEl, value = '') {
  const row = document.createElement('div');
  row.className = 'phone-row';
  const input = document.createElement('input');
  input.type = 'tel';
  input.className = 'phone-input';
  input.inputMode = 'tel';
  input.autocomplete = 'off';
  input.placeholder = '06 12 34 56 78';
  input.value = value || '';
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'icon-btn phone-remove';
  remove.setAttribute('aria-label', 'Retirer');
  remove.textContent = '✕';
  remove.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    row.remove();
    if (!listEl.children.length) addPhoneRow(listEl, '');
  };
  row.append(input, remove);
  listEl.appendChild(row);
  return input;
}

function resetPhones(listEl, values = ['']) {
  listEl.innerHTML = '';
  (values.length ? values : ['']).forEach((v) => addPhoneRow(listEl, v));
}

function onAddPhoneClick(listEl) {
  return (e) => {
    e.preventDefault();
    e.stopPropagation();
    const input = addPhoneRow(listEl, '');
    input.value = '';
    input.focus();
  };
}

function appendJournal(row, line) {
  const prev = (row.journal || '').trim();
  return prev ? `${prev}\n${line}` : line;
}

function suiviPrint(row) {
  return row.journal || '';
}

/* ---------- Types d’appareil ---------- */
function normalizeTypeKey(value) {
  return String(value || '')
    .trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function readCustomTypes() {
  try {
    const raw = JSON.parse(localStorage.getItem(TYPES_STORAGE_KEY) || '[]');
    return Array.isArray(raw) ? raw.filter((v) => typeof v === 'string' && v.trim()) : [];
  } catch {
    return [];
  }
}

/** Types de base + types ajoutés localement + types déjà présents en base. */
function knownTypes() {
  const out = [];
  const seen = new Set();
  const push = (value) => {
    const label = String(value || '').trim();
    if (!label) return;
    const key = normalizeTypeKey(label);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(label);
  };
  TYPES_BASE.forEach(push);
  readCustomTypes().forEach(push);
  state.all.forEach((r) => push(r.type_location));
  return out;
}

function addCustomType(label) {
  const clean = String(label || '').trim().replace(/\s+/g, ' ');
  if (!clean) return '';
  const existing = knownTypes().find((t) => normalizeTypeKey(t) === normalizeTypeKey(clean));
  if (existing) return existing;
  try {
    localStorage.setItem(TYPES_STORAGE_KEY, JSON.stringify([...readCustomTypes(), clean]));
  } catch {
    /* stockage indisponible : le type reste utilisable pour cette fiche */
  }
  renderTypeOptions();
  return clean;
}

function typeOptionsHtml(types) {
  return types.map((t) => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('');
}

function renderTypeOptions() {
  const types = knownTypes();

  [el('newType'), el('editType')].forEach((select) => {
    if (!select) return;
    const prev = select.value;
    select.innerHTML = `${typeOptionsHtml(types)}<option value="${TYPE_AUTRE}">Autres…</option>`;
    select.value = prev === TYPE_AUTRE || types.includes(prev) ? prev : (types[0] || '');
  });

  [el('filterType'), el('printType')].forEach((select) => {
    if (!select) return;
    const prev = select.value;
    select.innerHTML = `<option value="">Type — tous</option>${typeOptionsHtml(types)}`;
    select.value = types.includes(prev) ? prev : '';
  });
}

function syncTypeAutre(select, wrap, input) {
  if (!select || !wrap || !input) return;
  const isAutre = select.value === TYPE_AUTRE;
  wrap.classList.toggle('hidden', !isAutre);
  if (!isAutre) input.value = '';
}

function bindTypeAutre(select, wrap, input) {
  if (!select || !wrap || !input) return;
  select.addEventListener('change', () => {
    syncTypeAutre(select, wrap, input);
    if (select.value === TYPE_AUTRE) input.focus();
  });
  syncTypeAutre(select, wrap, input);
}

/** Renvoie le type retenu, en enregistrant d’abord un éventuel nouveau type. */
function resolveTypeChoice(select, input) {
  if (!select) return '';
  if (select.value !== TYPE_AUTRE) return select.value;
  const added = addCustomType(input?.value);
  if (added) select.value = added;
  return added;
}

/* ---------- Navigation ---------- */
function setTab(name) {
  $$('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  $$('.view').forEach((v) => v.classList.toggle('active', v.dataset.view === name));
  if (name === 'comments') renderCommentCard();
  if (name === 'calls') renderCallFlow();
}

$$('.tab').forEach((btn) => btn.addEventListener('click', () => setTab(btn.dataset.tab)));

/* ---------- Data ---------- */
function inCallQueue(r) {
  return r.commentaire_statut === 'ECRIS'
    && (r.appel_statut === 'a_appeler' || r.appel_statut === 'a_rappeler');
}

async function refresh() {
  const prevCallId = currentCall()?.id;
  const { data, error } = await sb.from(TABLE).select('*').order('created_at', { ascending: false });
  if (error) { toast(error.message, 'error'); return; }

  state.all = data || [];
  state.commentQueue = state.all.filter((r) => r.commentaire_statut !== 'ECRIS');
  state.callQueue = state.all.filter(inCallQueue);
  renderTypeOptions();
  el('aiPromptText').value = aiFillPrompt();

  if (state.commentIndex >= state.commentQueue.length) state.commentIndex = 0;

  if (prevCallId) {
    const keepIdx = state.callQueue.findIndex((r) => r.id === prevCallId);
    if (keepIdx >= 0) state.callIndex = keepIdx;
    else {
      state.callIndex = 0;
      state.callStep = 'ask_call';
      state.draft = {};
    }
  } else if (state.callIndex >= state.callQueue.length) {
    state.callIndex = 0;
    state.callStep = 'ask_call';
    state.draft = {};
  }

  el('queuePill').textContent =
    `${state.commentQueue.length} com. · ${state.callQueue.length} appels`;

  if (el('view-comments').classList.contains('active')) renderCommentCard();
  if (el('view-calls').classList.contains('active')) renderCallFlow();
  if (!el('editSheet').hidden) renderEditList();
}

/* ---------- Module 1 ---------- */
resetPhones(el('phonesList'), ['']);
el('addPhoneBtn').addEventListener('click', onAddPhoneClick(el('phonesList')));
bindDateMasks();
renderTypeOptions();
bindTypeAutre(el('newType'), el('newTypeAutreWrap'), el('newTypeAutre'));

el('newForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const dateNaissance = parseFrDate(fd.get('date_naissance'));
  const dateOrdo = parseFrDate(fd.get('date_ordonnance'));
  const typeLocation = resolveTypeChoice(el('newType'), el('newTypeAutre'));
  if (!dateNaissance) { toast('Date de naissance invalide', 'error'); return; }
  if (!dateOrdo) { toast('Date d’ordonnance invalide', 'error'); return; }
  if (!typeLocation) { toast('Indiquez le type d’appareil', 'error'); return; }

  const payload = {
    nom: String(fd.get('nom') || '').trim().toUpperCase(),
    prenom: String(fd.get('prenom') || '').trim(),
    date_naissance: dateNaissance,
    type_location: typeLocation,
    date_ordonnance: dateOrdo,
    telephones: collectPhones(el('phonesList')),
    commentaire: String(fd.get('commentaire') || '').trim() || null,
    appel_statut: 'a_appeler',
  };

  const btn = el('submitFormBtn');
  btn.disabled = true;
  btn.textContent = 'Création…';
  const { error } = await sb.from(TABLE).insert(payload);
  btn.disabled = false;
  btn.textContent = 'Créer la fiche';
  if (error) { toast(error.message, 'error'); return; }

  e.target.reset();
  renderTypeOptions();
  el('newType').value = TYPES_BASE[0];
  syncTypeAutre(el('newType'), el('newTypeAutreWrap'), el('newTypeAutre'));
  resetPhones(el('phonesList'), ['']);
  toast('Fiche créée');
  await refresh();
});

/* ---------- Remplissage Photo → IA (module 1) ---------- */
function aiFillPrompt() {
  const types = knownTypes();
  return `Tu analyses la photo d'une fiche manuscrite de location de matériel (pharmacie).
Extrais uniquement les informations visibles et réponds UNIQUEMENT avec ce format exact, une ligne par champ, sans markdown ni texte autour :

NOM: <nom de famille en majuscules>
PRENOM: <prénom>
DATE_NAISSANCE: <JJ/MM/AAAA>
TYPE_LOCATION: <${types.join(' OU ')}>
DATE_ORDONNANCE: <JJ/MM/AAAA>
TELEPHONES: <numéros séparés par ; >
COMMENTAIRE: <texte libre ou vide>

Règles :
- Si une info est illisible ou absente, laisse la valeur vide après les deux-points.
- TYPE_LOCATION doit être exactement l'une de ces ${types.length} valeurs : ${types.join(', ')}.
- Les dates doivent être au format JJ/MM/AAAA.
- Ne invente rien.`;
}

el('aiPromptText').value = aiFillPrompt();

el('openAiFillBtn').addEventListener('click', () => {
  el('aiPromptText').value = aiFillPrompt();
  el('aiFillSheet').hidden = false;
});

$$('[data-close-ai-fill]').forEach((n) => n.addEventListener('click', () => {
  el('aiFillSheet').hidden = true;
}));

el('copyAiPromptBtn').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(el('aiPromptText').value);
    toast('Prompt copié');
  } catch {
    el('aiPromptText').select();
    document.execCommand('copy');
    toast('Prompt copié');
  }
});

function parseAiFillText(raw) {
  const text = String(raw || '').replace(/\r/g, '');
  const get = (key) => {
    const re = new RegExp(`^\\s*${key}\\s*:\\s*(.*)$`, 'im');
    const m = text.match(re);
    return m ? m[1].trim() : '';
  };

  const typeKey = normalizeTypeKey(get('TYPE_LOCATION'));
  const types = knownTypes();
  let type = types.find((t) => normalizeTypeKey(t) === typeKey) || '';
  if (!type && typeKey) {
    type = types.find((t) => {
      const key = normalizeTypeKey(t);
      return typeKey.includes(key) || key.includes(typeKey);
    }) || '';
  }

  const phonesRaw = get('TELEPHONES') || get('TELEPHONE') || get('TELS');
  const phones = phonesRaw
    .split(/[;,\n|/]+/)
    .map((p) => p.trim())
    .filter(Boolean);

  return {
    nom: get('NOM'),
    prenom: get('PRENOM'),
    date_naissance: get('DATE_NAISSANCE'),
    type_location: type,
    date_ordonnance: get('DATE_ORDONNANCE'),
    telephones: phones,
    commentaire: get('COMMENTAIRE'),
  };
}

el('applyAiFillBtn').addEventListener('click', () => {
  const parsed = parseAiFillText(el('aiPasteText').value);
  if (!parsed.nom && !parsed.prenom && !parsed.date_naissance) {
    toast('Réponse IA illisible — vérifie le format', 'error');
    return;
  }

  const form = el('newForm');
  if (parsed.nom) form.nom.value = parsed.nom.toUpperCase();
  if (parsed.prenom) form.prenom.value = parsed.prenom;
  if (parsed.date_naissance) {
    form.date_naissance.value = parsed.date_naissance.replace(/\D/g, '').length
      ? (() => {
          const input = form.date_naissance;
          input.value = parsed.date_naissance;
          maskDateInput(input);
          return input.value;
        })()
      : parsed.date_naissance;
  }
  if (parsed.date_ordonnance) {
    form.date_ordonnance.value = parsed.date_ordonnance;
    maskDateInput(form.date_ordonnance);
  }
  if (parsed.type_location) {
    el('newType').value = parsed.type_location;
    syncTypeAutre(el('newType'), el('newTypeAutreWrap'), el('newTypeAutre'));
  }
  resetPhones(el('phonesList'), parsed.telephones.length ? parsed.telephones : ['']);
  form.commentaire.value = parsed.commentaire || '';

  el('aiFillSheet').hidden = true;
  toast('Formulaire prérempli — vérifie puis crée la fiche');
});

/* ---------- Module 2 ---------- */
function currentComment() {
  return state.commentQueue[state.commentIndex] || null;
}

function renderCommentCard() {
  const row = currentComment();
  const empty = el('commentsEmpty');
  const stage = el('swipeStage');
  const card = el('swipeCard');

  if (!row) {
    empty.classList.remove('hidden');
    stage.classList.add('hidden');
    el('commentsHint').textContent = '';
    return;
  }

  empty.classList.add('hidden');
  stage.classList.remove('hidden');
  card.classList.remove('out-left', 'out-right');
  card.style.transform = '';
  card.style.opacity = '';

  el('cardType').textContent = row.type_location;
  el('cardName').textContent = fullName(row);
  el('cardBirth').textContent = fmtDate(row.date_naissance);
  el('cardOrdo').textContent = fmtDate(row.date_ordonnance);
  el('cardComment').textContent = row.commentaire || 'Aucun commentaire';
  resetPhones(el('cardPhonesList'), phonesOf(row).length ? phonesOf(row) : ['']);
  el('commentDoneCheck').checked = false;
  el('mailAlreadyCheck').checked = !!row.mail_envoye;
  el('validateCommentBtn').disabled = true;
  el('commentsHint').innerHTML =
    `${state.commentIndex + 1} / ${state.commentQueue.length}<span class="hint-swipe"> — glissez pour passer</span>`;
  el('commentsSkipBtn').classList.toggle('hidden', state.commentQueue.length < 2);
}

el('cardAddPhoneBtn').addEventListener('click', onAddPhoneClick(el('cardPhonesList')));
el('commentDoneCheck').addEventListener('change', (e) => {
  el('validateCommentBtn').disabled = !e.target.checked;
});

async function validateComment() {
  const row = currentComment();
  if (!row || !el('commentDoneCheck').checked) return;

  const mailAlready = el('mailAlreadyCheck').checked;
  const phones = collectPhones(el('cardPhonesList'));
  const patch = {
    commentaire_statut: 'ECRIS',
    telephones: phones,
    mail_envoye: mailAlready,
  };
  if (mailAlready) {
    patch.journal = appendJournal(row, `${todayFr()} — Mail déjà envoyé (module comptes)`);
  }

  const { error } = await sb.from(TABLE).update(patch).eq('id', row.id);
  if (error) { toast(error.message, 'error'); return; }

  // Met à jour le cache local tout de suite (module 3 lira mail_envoye)
  Object.assign(row, patch);

  await animateSwipe(el('swipeCard'), 'right');
  toast(mailAlready ? 'ECRIS + mail noté' : 'Commentaire ECRIS');
  await refresh();
  renderCommentCard();
}

el('validateCommentBtn').addEventListener('click', validateComment);

function animateSwipe(card, dir) {
  return new Promise((resolve) => {
    card.classList.add(dir === 'left' ? 'out-left' : 'out-right');
    setTimeout(resolve, 280);
  });
}

function bindSwipe(card, { canDrag, onSkip }) {
  let startX = 0;
  let dx = 0;
  let dragging = false;

  card.addEventListener('touchstart', (e) => {
    if (!canDrag()) return;
    if (e.target.closest('button, a, input, textarea, label, select')) return;
    dragging = true;
    startX = e.touches[0].clientX;
    dx = 0;
    card.style.transition = 'none';
  }, { passive: true });

  card.addEventListener('touchmove', (e) => {
    if (!dragging) return;
    dx = e.touches[0].clientX - startX;
    card.style.transform = `translateX(${dx}px) rotate(${dx / 28}deg)`;
    card.style.opacity = String(Math.max(0.35, 1 - Math.abs(dx) / 280));
  }, { passive: true });

  card.addEventListener('touchend', async () => {
    if (!dragging) return;
    dragging = false;
    card.style.transition = '';
    if (Math.abs(dx) < 110) {
      card.style.transform = '';
      card.style.opacity = '';
      return;
    }
    await animateSwipe(card, dx < 0 ? 'left' : 'right');
    onSkip();
  });
}

function skipCommentCard() {
  state.commentIndex = (state.commentIndex + 1) % Math.max(state.commentQueue.length, 1);
  renderCommentCard();
}

bindSwipe(el('swipeCard'), {
  canDrag: () => !!currentComment(),
  onSkip: skipCommentCard,
});

el('commentsSkipBtn').addEventListener('click', async () => {
  if (!currentComment() || state.commentQueue.length < 2) return;
  await animateSwipe(el('swipeCard'), 'right');
  skipCommentCard();
});

/* ---------- Module 3 ---------- */
function currentCall() {
  return state.callQueue[state.callIndex] || null;
}

function callJournalPrefix() {
  return state.draft.fromPatientRecall ? 'Rappel par le patient' : 'Appel OK';
}

function syncCallPatientSelect() {
  const select = el('callPatientSelect');
  if (!select) return;
  const rows = state.callQueue;
  const current = currentCall();
  const nextHtml = rows.map((r) =>
    `<option value="${escapeHtml(r.id)}">${escapeHtml(fullName(r))} — ${escapeHtml(r.type_location || '')}</option>`
  ).join('');
  if (select.dataset.queueKey !== rows.map((r) => r.id).join(',')) {
    select.innerHTML = nextHtml;
    select.dataset.queueKey = rows.map((r) => r.id).join(',');
  }
  if (current) select.value = current.id;
}

const callPatientSelectEl = el('callPatientSelect');
if (callPatientSelectEl) {
  callPatientSelectEl.addEventListener('change', () => {
    const id = callPatientSelectEl.value;
    const idx = state.callQueue.findIndex((r) => r.id === id);
    if (idx < 0) return;
    state.callIndex = idx;
    state.callStep = 'ask_call';
    state.draft = {};
    renderCallFlow();
  });
}

function renderCallPhones(row) {
  const box = el('callPhones');
  const phones = phonesOf(row);
  if (!phones.length) {
    box.innerHTML = '<p class="muted tiny">Aucun numéro renseigné</p>';
    return;
  }
  box.innerHTML = phones.map((n) =>
    `<a class="phone-call-btn" href="${telHref(n)}">${escapeHtml(n)}</a>`
  ).join('');
}

function stepCard(title, actions, onBack, extraHtml = '') {
  const card = document.createElement('div');
  card.className = 'step-card';
  card.innerHTML = `<h3>${escapeHtml(title)}</h3>${extraHtml}`;
  const grid = document.createElement('div');
  grid.className = 'choice-grid';
  if (onBack) {
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'btn ghost';
    back.textContent = 'Retour';
    back.onclick = onBack;
    grid.appendChild(back);
  }
  actions.forEach(([label, fn, cls = 'secondary']) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `btn ${cls}`;
    b.textContent = label;
    b.onclick = fn;
    grid.appendChild(b);
  });
  card.appendChild(grid);
  return card;
}

function renderCallFlow() {
  const row = currentCall();
  const empty = el('callsEmpty');
  const stage = el('callSwipeStage');
  const card = el('callSwipeCard');

  if (!row) {
    empty.classList.remove('hidden');
    stage.classList.add('hidden');
    el('callsHint').textContent = '';
    return;
  }

  empty.classList.add('hidden');
  stage.classList.remove('hidden');
  card.classList.remove('out-left', 'out-right');
  card.style.transform = '';
  card.style.opacity = '';

  el('callType').textContent = row.type_location;
  el('callName').textContent = fullName(row);
  el('callMeta').textContent =
    `Né(e) ${fmtDate(row.date_naissance)} · Ordo ${fmtDate(row.date_ordonnance)}` +
    (row.appel_statut === 'a_rappeler' ? ' · À rappeler' : '') +
    (row.mail_envoye ? ' · Mail déjà envoyé' : '');

  const journal = el('callJournal');
  if (row.journal) {
    journal.classList.remove('hidden');
    journal.textContent = row.journal;
  } else {
    journal.classList.add('hidden');
    journal.textContent = '';
  }

  renderCallPhones(row);
  syncCallPatientSelect();
  el('callsHint').innerHTML =
    `${state.callIndex + 1} / ${state.callQueue.length}<span class="hint-swipe"> — glissez pour un autre appel</span>`;
  el('callsSkipBtn').classList.toggle('hidden', state.callQueue.length < 2);

  const steps = el('callSteps');
  steps.innerHTML = '';
  const go = (step) => { state.callStep = step; renderCallFlow(); };

  // Ne jamais réafficher la question mail si déjà envoyé
  if (state.callStep === 'ask_mail' && rowHasMailSent(row)) {
    handleMailYes(row);
    return;
  }

  if (state.callStep === 'ask_call') {
    steps.appendChild(stepCard('Avez-vous appelé / joint le patient ?', [
      ['Oui — appel fait', () => {
        state.draft = { fromPatientRecall: false };
        go('call_yes_comment');
      }],
      ['Rappel du patient', () => {
        state.draft = { fromPatientRecall: true };
        go('call_yes_comment');
      }],
      ['Non — pas d’appel', () => {
        state.draft = {};
        go('call_no');
      }],
    ]));
  }

  if (state.callStep === 'call_yes_comment') {
    const wrap = document.createElement('div');
    wrap.className = 'step-card';
    const heading = state.draft.fromPatientRecall
      ? 'Rappel par le patient — commentaire (optionnel)'
      : 'Commentaire d’appel (optionnel)';
    wrap.innerHTML = `
      <h3>${escapeHtml(heading)}</h3>
      <label class="inline-field">Note
        <textarea id="callYesNote" rows="2" placeholder="Ex. a décroché, ton, etc.">${escapeHtml(state.draft.note || '')}</textarea>
      </label>
      <p class="muted tiny">Puis choisissez le résultat :</p>
      <div class="choice-grid" id="yesResults"></div>
    `;
    const grid = $('#yesResults', wrap);
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'btn ghost';
    back.textContent = 'Retour';
    back.onclick = () => go('ask_call');
    grid.appendChild(back);

    const choices = [
      ['Réponse : je vous ramène l’appareil dans la semaine', 'ramene_semaine'],
      ['Réponse : je vous envoie par mail l’ordonnance', 'ordo_mail'],
      ['Laissé un message sur le répondeur', 'message_repondeur'],
      ['Raccroché', 'raccroche'],
      ['Mauvais numéro', 'mauvais_numero'],
      ['Autres', 'autre_raison'],
    ];
    choices.forEach(([label, code]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn secondary';
      b.textContent = label;
      b.onclick = () => {
        state.draft.note = el('callYesNote').value.trim();
        state.draft.resultat = code;
        if (code === 'autre_raison') {
          go('call_yes_autre');
          return;
        }
        handleCallYes(row);
      };
      grid.appendChild(b);
    });
    steps.appendChild(wrap);
  }

  if (state.callStep === 'call_yes_autre') {
    const wrap = document.createElement('div');
    wrap.className = 'step-card';
    const selectedStatut = state.draft.autreStatut || '';
    wrap.innerHTML = `
      <h3>Autres — ce qui a été dit</h3>
      <label class="inline-field">Texte de l’échange
        <textarea id="callYesAutreNote" rows="3" required placeholder="Obligatoire — ce qui a été dit">${escapeHtml(state.draft.autreNote || state.draft.note || '')}</textarea>
      </label>
      <p class="muted tiny">Puis choisissez le statut :</p>
      <div class="statut-seg" id="autreStatutSeg"></div>
      <div class="choice-grid" id="autreActions"></div>
    `;
    const seg = $('#autreStatutSeg', wrap);
    const statutChoices = [
      ['a_appeler', 'À appeler'],
      ['a_rappeler', 'À rappeler'],
      ['termine', 'Terminé'],
      ['PERTE', 'PERTE'],
    ];
    statutChoices.forEach(([code, label]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `btn ghost${selectedStatut === code ? ' active' : ''}`;
      b.textContent = label;
      b.onclick = () => {
        state.draft.autreNote = el('callYesAutreNote').value.trim();
        state.draft.autreStatut = code;
        go('call_yes_autre');
      };
      seg.appendChild(b);
    });

    const actions = $('#autreActions', wrap);
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'btn ghost';
    back.textContent = 'Retour';
    back.onclick = () => go('call_yes_comment');
    const next = document.createElement('button');
    next.type = 'button';
    next.className = 'btn primary';
    next.textContent = 'Enregistrer';
    next.onclick = () => {
      const note = el('callYesAutreNote').value.trim();
      if (!note) { toast('Indiquez ce qui a été dit', 'error'); return; }
      if (!state.draft.autreStatut) { toast('Choisissez un statut', 'error'); return; }
      state.draft.note = note;
      state.draft.resultat = 'autre_raison';
      handleCallYes(row);
    };
    actions.append(back, next);
    steps.appendChild(wrap);
  }

  if (state.callStep === 'call_no') {
    steps.appendChild(stepCard('Pourquoi pas d’appel ?', [
      ['Pas de numéro', () => {
        state.draft.noReason = 'pas_de_numero';
        go('call_no_comment');
      }],
      ['Autre raison', () => {
        state.draft.noReason = 'autre_raison';
        go('call_no_comment');
      }],
    ], () => go('ask_call')));
  }

  if (state.callStep === 'call_no_comment') {
    const wrap = document.createElement('div');
    wrap.className = 'step-card';
    wrap.innerHTML = `
      <h3>Commentaire</h3>
      <label class="inline-field">Précisez
        <textarea id="callNoNote" rows="3" required placeholder="Obligatoire">${escapeHtml(state.draft.note || '')}</textarea>
      </label>
      <div class="choice-grid"></div>
    `;
    const grid = $('.choice-grid', wrap);
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'btn ghost';
    back.textContent = 'Retour';
    back.onclick = () => go('call_no');
    const next = document.createElement('button');
    next.type = 'button';
    next.className = 'btn primary';
    next.textContent = 'Continuer';
    next.onclick = () => {
      const note = el('callNoNote').value.trim();
      if (!note) { toast('Commentaire requis', 'error'); return; }
      state.draft.note = note;
      handleCallNo(row);
    };
    grid.append(back, next);
    steps.appendChild(wrap);
  }

  if (state.callStep === 'ask_mail') {
    steps.appendChild(stepCard(
      'Adresse mail disponible pour envoyer un mail (depuis le logiciel métier) ?',
      [
        ['Oui — j’envoie un mail', () => handleMailYes(row)],
        ['À faire', () => handleMailAFaire(row)],
        ['Non', () => handleNoMail(row)],
      ],
      () => {
        state.callStep = state.draft.backAfterMail || 'ask_call';
        renderCallFlow();
      }
    ));
  }
}

/** Lecture fraîche de mail_envoye (module 2 → module 3). */
function rowHasMailSent(row) {
  const fresh = state.all.find((r) => r.id === row.id) || row;
  return !!fresh.mail_envoye;
}

/** Si mail déjà coché (module 2), on ne repose pas la question. */
function goMailStepOrSkip(row) {
  if (rowHasMailSent(row)) {
    handleMailYes(row);
    return;
  }
  state.callStep = 'ask_mail';
  renderCallFlow();
}

async function handleCallYes(row) {
  const code = state.draft.resultat;
  const note = state.draft.note || '';
  const date = todayFr();
  const prefix = callJournalPrefix();

  if (code === 'ramene_semaine') {
    const line = `${date} — ${prefix} : ramène l’appareil dans la semaine` + (note ? ` (${note})` : '');
    await applyCallUpdate(row, {
      appel_resultat: code,
      appel_statut: 'termine',
      journal: appendJournal(row, line),
    });
    return;
  }

  if (code === 'autre_raison') {
    const statut = state.draft.autreStatut || 'a_rappeler';
    const statutLabel = APPEL_STATUT_LABELS[statut] || statut;
    const line = `${date} — ${prefix} : autres — ${note} → ${statutLabel}`;
    await applyCallUpdate(row, {
      appel_resultat: 'autre_raison',
      appel_statut: statut,
      journal: appendJournal(row, line),
    });
    return;
  }

  if (code === 'ordo_mail') {
    state.draft.backAfterMail = 'call_yes_comment';
    state.draft.afterMail = 'termine_ordo';
    state.draft.recallLine = `${date} — ${prefix} : envoie l’ordonnance par mail` + (note ? ` (${note})` : '');
    goMailStepOrSkip(row);
    return;
  }

  if (code === 'message_repondeur') {
    state.draft.recallLine = state.draft.fromPatientRecall
      ? `${date} — Rappel par le patient : message sur le répondeur` + (note ? ` (${note})` : '')
      : `${date} — Déjà appelé le ${date} et laissé message sur le répondeur` + (note ? ` (${note})` : '');
    state.draft.afterMail = 'rappeler';
  } else if (code === 'raccroche') {
    state.draft.recallLine = state.draft.fromPatientRecall
      ? `${date} — Rappel par le patient : a raccroché` + (note ? ` (${note})` : '')
      : `${date} — Déjà appelé le ${date} : a raccroché` + (note ? ` (${note})` : '');
    state.draft.afterMail = 'rappeler';
  } else if (code === 'mauvais_numero') {
    state.draft.recallLine = `${date} — ${prefix} : mauvais numéro` + (note ? ` (${note})` : '');
    state.draft.afterMail = 'mauvais_numero';
  }

  state.draft.backAfterMail = 'call_yes_comment';
  goMailStepOrSkip(row);
}

async function handleCallNo(row) {
  const date = todayFr();
  const reason = state.draft.noReason;
  const note = state.draft.note || '';

  if (reason === 'autre_raison') {
    const line = `${date} — Pas appelé : ${note}`;
    await applyCallUpdate(row, {
      appel_resultat: 'autre_raison',
      appel_statut: 'a_rappeler',
      journal: appendJournal(row, line),
    });
    return;
  }

  state.draft.recallLine = `${date} — Pas de numéro` + (note ? ` (${note})` : '');
  state.draft.afterMail = 'pas_de_numero';
  state.draft.backAfterMail = 'call_no_comment';
  goMailStepOrSkip(row);
}

async function handleMailYes(row) {
  const fresh = state.all.find((r) => r.id === row.id) || row;
  const date = todayFr();
  const after = state.draft.afterMail;
  const baseLine = state.draft.recallLine || `${date} — Suivi appel`;
  const already = !!fresh.mail_envoye;
  const mailLine = already
    ? `${date} — Mail déjà envoyé (module comptes / métier)`
    : `${date} — Mail envoyé (logiciel métier)`;

  let journal = appendJournal(fresh, baseLine);
  journal = appendJournal({ journal }, mailLine);

  const patch = {
    mail_envoye: true,
    journal,
    appel_resultat: state.draft.resultat || state.draft.noReason || fresh.appel_resultat,
  };

  if (after === 'termine_ordo') {
    patch.appel_resultat = 'ordo_mail';
    patch.appel_statut = 'termine';
  } else if (after === 'rappeler') {
    patch.appel_resultat = state.draft.resultat || fresh.appel_resultat;
    patch.appel_statut = 'a_rappeler';
  } else if (after === 'mauvais_numero' || after === 'pas_de_numero') {
    patch.appel_resultat = after === 'mauvais_numero' ? 'mauvais_numero' : 'pas_de_numero';
    patch.appel_statut = 'termine';
  }

  await applyCallUpdate(fresh, patch);
}

async function handleMailAFaire(row) {
  if (rowHasMailSent(row)) {
    await handleMailYes(row);
    return;
  }

  const fresh = state.all.find((r) => r.id === row.id) || row;
  const date = todayFr();
  const after = state.draft.afterMail;
  const baseLine = state.draft.recallLine || `${date} — Suivi`;
  const aFaireLine = `${date} — Mail à faire`;

  let journal = appendJournal(fresh, baseLine);
  journal = appendJournal({ journal }, aFaireLine);

  const patch = {
    mail_envoye: false,
    journal,
    appel_statut: 'a_rappeler',
  };

  if (after === 'termine_ordo') {
    patch.appel_resultat = 'ordo_mail_a_faire';
  } else if (after === 'rappeler') {
    patch.appel_resultat = state.draft.resultat || fresh.appel_resultat;
  } else if (after === 'mauvais_numero' || after === 'pas_de_numero') {
    patch.appel_resultat = after === 'mauvais_numero' ? 'mauvais_numero' : 'pas_de_numero';
  } else {
    patch.appel_resultat = state.draft.resultat || state.draft.noReason || fresh.appel_resultat;
  }

  await applyCallUpdate(fresh, patch);
}

async function handleNoMail(row) {
  if (rowHasMailSent(row)) {
    await handleMailYes(row);
    return;
  }

  const fresh = state.all.find((r) => r.id === row.id) || row;
  const date = todayFr();
  const after = state.draft.afterMail;
  const baseLine = state.draft.recallLine || `${date} — Suivi`;
  const noMailLine = `${date} — Pas d’adresse mail / pas d’envoi possible`;

  if (after === 'termine_ordo') {
    await applyCallUpdate(fresh, {
      appel_resultat: 'ordo_mail',
      appel_statut: 'a_rappeler',
      mail_envoye: false,
      journal: appendJournal(fresh, `${baseLine}\n${noMailLine}\n${date} — À rappeler : ordonnance encore attendue`),
    });
    return;
  }

  if (after === 'rappeler') {
    await applyCallUpdate(fresh, {
      appel_resultat: state.draft.resultat,
      appel_statut: 'a_rappeler',
      mail_envoye: false,
      journal: appendJournal(fresh, `${baseLine}\n${noMailLine}`),
    });
    return;
  }

  if (after === 'mauvais_numero' || after === 'pas_de_numero') {
    await applyCallUpdate(fresh, {
      appel_resultat: after === 'mauvais_numero' ? 'mauvais_numero' : 'pas_de_numero',
      appel_statut: 'PERTE',
      mail_envoye: false,
      journal: appendJournal(fresh, `${baseLine}\n${noMailLine}\n${date} — Statut PERTE`),
    });
  }
}

async function applyCallUpdate(row, patch) {
  const { error } = await sb.from(TABLE).update(patch).eq('id', row.id);
  if (error) { toast(error.message, 'error'); return; }
  toast(patch.appel_statut === 'PERTE' ? 'Statut PERTE' : 'Suivi enregistré');
  state.callStep = 'ask_call';
  state.draft = {};
  await animateSwipe(el('callSwipeCard'), 'right');
  await refresh();
  renderCallFlow();
}

function skipCallCard() {
  state.callStep = 'ask_call';
  state.draft = {};
  state.callIndex = (state.callIndex + 1) % Math.max(state.callQueue.length, 1);
  renderCallFlow();
}

bindSwipe(el('callSwipeCard'), {
  canDrag: () => !!currentCall(),
  onSkip: skipCallCard,
});

el('callsSkipBtn').addEventListener('click', async () => {
  if (!currentCall() || state.callQueue.length < 2) return;
  await animateSwipe(el('callSwipeCard'), 'right');
  skipCallCard();
});

/* ---------- Édition ---------- */
const editFilters = {
  search: '',
  statut: '',
  resultat: '',
  mail: '',
  type: '',
};

el('fabEdit').addEventListener('click', () => {
  el('editSheet').hidden = false;
  renderEditList();
});

$$('[data-close-sheet]').forEach((n) => n.addEventListener('click', () => {
  el('editSheet').hidden = true;
}));

['filterSearch', 'filterStatut', 'filterResultat', 'filterMail', 'filterType'].forEach((id) => {
  const node = el(id);
  if (!node) return;
  const evt = id === 'filterSearch' ? 'input' : 'change';
  node.addEventListener(evt, () => {
    editFilters.search = el('filterSearch').value.trim().toLowerCase();
    editFilters.statut = el('filterStatut').value;
    editFilters.resultat = el('filterResultat').value;
    editFilters.mail = el('filterMail').value;
    editFilters.type = el('filterType').value;
    renderEditList();
  });
});

function ordoIso(row) {
  return row.date_ordonnance ? String(row.date_ordonnance).slice(0, 10) : '';
}

function matchesFilters(row, f) {
  if (f.search && !fullName(row).toLowerCase().includes(f.search)) return false;
  if (f.statut && row.appel_statut !== f.statut) return false;
  if (f.resultat === '__none__') {
    if (row.appel_resultat) return false;
  } else if (f.resultat && row.appel_resultat !== f.resultat) return false;
  if (f.mail === 'oui' && !row.mail_envoye) return false;
  if (f.mail === 'non' && row.mail_envoye) return false;
  if (f.type && row.type_location !== f.type) return false;
  if (f.ordoMin && (!ordoIso(row) || ordoIso(row) < f.ordoMin)) return false;
  if (f.ordoMax && (!ordoIso(row) || ordoIso(row) > f.ordoMax)) return false;
  return true;
}

/** Plus récent → plus ancien. */
function sortedRows(rows) {
  return [...rows].sort(
    (a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at)
  );
}

function filteredEditRows() {
  return sortedRows(state.all).filter((r) => matchesFilters(r, editFilters));
}

function renderEditList() {
  const list = el('editList');
  const rows = filteredEditRows();
  const count = el('editCount');
  if (count) count.textContent = `${rows.length} fiche${rows.length > 1 ? 's' : ''}`;

  if (!rows.length) {
    list.innerHTML = '<p class="muted" style="padding:12px">Aucune fiche.</p>';
    return;
  }

  list.innerHTML = rows.map((r) => {
    const statut = APPEL_STATUT_LABELS[r.appel_statut] || r.appel_statut || '—';
    const resultat = r.appel_resultat
      ? (APPEL_RESULTAT_LABELS[r.appel_resultat] || r.appel_resultat)
      : 'Aucun résultat';
    const flags = [
      r.commentaire_statut === 'ECRIS' ? 'ECRIS' : 'com. à faire',
      statut,
      r.mail_envoye ? 'mail envoyé' : null,
    ].filter(Boolean).join(' · ');
    return `<button type="button" class="edit-item" data-id="${r.id}">
      <strong>${escapeHtml(fullName(r))}</strong>
      <span>${escapeHtml(r.type_location)} · ordo ${escapeHtml(fmtDate(r.date_ordonnance))} · ${escapeHtml(flags)}</span>
      <span class="res">Résultat : ${escapeHtml(resultat)}</span>
    </button>`;
  }).join('');

  $$('.edit-item', list).forEach((btn) => {
    btn.addEventListener('click', () => openEditForm(btn.dataset.id));
  });
}

el('editAddPhoneBtn').addEventListener('click', onAddPhoneClick(el('editPhonesList')));
bindTypeAutre(el('editType'), el('editTypeAutreWrap'), el('editTypeAutre'));

function statutIncoherent(resultat, statut) {
  return statut === 'PERTE' && RESULTATS_SANS_PERTE.has(resultat || '');
}

/** À rappeler avant d’affecter un statut : l’option a pu être retirée en
 *  consultant une autre fiche. */
function restaurePerteOption() {
  const statutSelect = el('editAppelStatut');
  if (!statutSelect.querySelector('option[value="PERTE"]')) {
    statutSelect.append(new Option('PERTE', 'PERTE'));
  }
}

/** PERTE n’est proposé qu’avec un résultat qui le justifie. Une option
 *  seulement désactivée reste illisible sur le thème sombre : on la retire. */
function syncEditStatutOptions({ notify = false } = {}) {
  const resultat = el('editAppelResultat').value;
  const statutSelect = el('editAppelStatut');
  if (!RESULTATS_SANS_PERTE.has(resultat)) {
    restaurePerteOption();
    return;
  }

  const perteOption = statutSelect.querySelector('option[value="PERTE"]');
  if (!perteOption) return;

  const etaitPerte = statutSelect.value === 'PERTE';
  perteOption.remove();
  if (etaitPerte) {
    statutSelect.value = 'a_rappeler';
    if (notify) {
      const label = APPEL_RESULTAT_LABELS[resultat] || resultat;
      toast(`PERTE incompatible avec « ${label} » → À rappeler`, 'error');
    }
  }
}

el('editAppelResultat').addEventListener('change', () => syncEditStatutOptions({ notify: true }));

function openEditForm(id) {
  const row = state.all.find((r) => r.id === id);
  if (!row) return;
  state.editingId = id;
  const form = el('editForm');
  form.id.value = row.id;
  form.nom.value = row.nom || '';
  form.prenom.value = row.prenom || '';
  form.date_naissance.value = toFrInput(row.date_naissance);
  renderTypeOptions();
  form.type_location.value = row.type_location || TYPES_BASE[0];
  syncTypeAutre(el('editType'), el('editTypeAutreWrap'), el('editTypeAutre'));
  form.date_ordonnance.value = toFrInput(row.date_ordonnance);
  form.commentaire.value = row.commentaire || '';
  form.commentaire_statut.value = row.commentaire_statut || '';
  restaurePerteOption();
  form.appel_statut.value = row.appel_statut || 'a_appeler';
  form.appel_resultat.value = row.appel_resultat || '';
  form.journal.value = row.journal || '';
  form.mail_envoye.checked = !!row.mail_envoye;
  resetPhones(el('editPhonesList'), phonesOf(row).length ? phonesOf(row) : ['']);
  bindDateMasks(form);
  syncEditStatutOptions({ notify: statutIncoherent(row.appel_resultat, row.appel_statut) });

  const resLabel = row.appel_resultat
    ? (APPEL_RESULTAT_LABELS[row.appel_resultat] || row.appel_resultat)
    : 'Aucun';
  const stLabel = APPEL_STATUT_LABELS[row.appel_statut] || row.appel_statut || '—';
  el('editSummary').innerHTML = `
    <strong>${escapeHtml(fullName(row))}</strong>
    <div class="line">Statut actuel : <b>${escapeHtml(stLabel)}</b></div>
    <div class="line">Dernier résultat : <b>${escapeHtml(resLabel)}</b></div>
    <div class="line">Mail : <b>${row.mail_envoye ? 'envoyé' : 'non'}</b></div>
  `;

  el('editFormSheet').hidden = false;
}

$$('[data-close-edit-form]').forEach((n) => n.addEventListener('click', () => {
  el('editFormSheet').hidden = true;
  state.editingId = null;
}));

el('editForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const id = fd.get('id');
  const dateNaissance = parseFrDate(fd.get('date_naissance'));
  const dateOrdo = parseFrDate(fd.get('date_ordonnance'));
  if (fd.get('date_naissance') && !dateNaissance) {
    toast('Date de naissance invalide', 'error'); return;
  }
  if (fd.get('date_ordonnance') && !dateOrdo) {
    toast('Date d’ordonnance invalide', 'error'); return;
  }

  const typeLocation = resolveTypeChoice(el('editType'), el('editTypeAutre'));
  if (!typeLocation) { toast('Indiquez le type d’appareil', 'error'); return; }

  const appelStatut = fd.get('appel_statut');
  const appelResultat = fd.get('appel_resultat') || null;
  if (statutIncoherent(appelResultat, appelStatut)) {
    const label = APPEL_RESULTAT_LABELS[appelResultat] || appelResultat;
    toast(`PERTE incompatible avec « ${label} »`, 'error');
    return;
  }
  let journal = String(fd.get('journal') || '').trim() || null;

  // Si on remet à rappeler / sans résultat : noter dans le journal
  const prev = state.all.find((r) => r.id === id);
  if (prev && (appelStatut === 'a_rappeler' || appelStatut === 'a_appeler') && !appelResultat && prev.appel_resultat) {
    const line = `${todayFr()} — Relance manuelle : ancien résultat « ${APPEL_RESULTAT_LABELS[prev.appel_resultat] || prev.appel_resultat} » effacé → ${APPEL_STATUT_LABELS[appelStatut]}`;
    journal = appendJournal(prev, line);
  }

  const payload = {
    nom: String(fd.get('nom') || '').trim().toUpperCase(),
    prenom: String(fd.get('prenom') || '').trim(),
    date_naissance: dateNaissance,
    type_location: typeLocation,
    date_ordonnance: dateOrdo,
    telephones: collectPhones(el('editPhonesList')),
    commentaire: String(fd.get('commentaire') || '').trim() || null,
    commentaire_statut: fd.get('commentaire_statut') || null,
    appel_statut: appelStatut,
    appel_resultat: appelResultat,
    journal,
    mail_envoye: !!e.target.mail_envoye.checked,
  };

  const { error } = await sb.from(TABLE).update(payload).eq('id', id);
  if (error) { toast(error.message, 'error'); return; }
  toast('Fiche mise à jour');
  el('editFormSheet').hidden = true;
  await refresh();
  renderEditList();
});

el('deleteFicheBtn').addEventListener('click', async () => {
  const id = state.editingId;
  if (!id || !confirm('Supprimer cette fiche ?')) return;
  const { error } = await sb.from(TABLE).delete().eq('id', id);
  if (error) { toast(error.message, 'error'); return; }
  toast('Fiche supprimée');
  el('editFormSheet').hidden = true;
  await refresh();
  renderEditList();
});

/* ---------- Impression ---------- */
function printIdentite(row) {
  const telephones = phonesOf(row);
  return `
    <strong>${escapeHtml(fullName(row))}</strong>
    <span>Né(e) le ${escapeHtml(fmtDate(row.date_naissance))}</span>
    <span>Tél. : ${escapeHtml(telephones.join(' · ') || '—')}</span>
  `;
}

function printLocation(row) {
  return `
    <strong>${escapeHtml(row.type_location)}</strong>
    <span>Ordonnance : ${escapeHtml(fmtDate(row.date_ordonnance))}</span>
  `;
}

function printAppel(row) {
  const statut = APPEL_STATUT_LABELS[row.appel_statut] || row.appel_statut || '—';
  const resultat = APPEL_RESULTAT_LABELS[row.appel_resultat] || row.appel_resultat || '—';
  return `
    <strong>${escapeHtml(statut)}</strong>
    <span>Résultat : ${escapeHtml(resultat)}</span>
    ${row.mail_envoye ? '<span>Mail : Oui</span>' : ''}
  `;
}

const printFilters = {
  statut: '',
  resultat: '',
  type: '',
  ordoMin: '',
  ordoMax: '',
};

/** Relit les filtres d’impression et signale les dates inutilisables. */
function readPrintFilters() {
  printFilters.statut = el('printStatut').value;
  printFilters.resultat = el('printResultat').value;
  printFilters.type = el('printType').value;

  const minRaw = el('printOrdoMin').value.trim();
  const maxRaw = el('printOrdoMax').value.trim();
  const min = minRaw ? parseFrDate(minRaw) : '';
  const max = maxRaw ? parseFrDate(maxRaw) : '';
  printFilters.ordoMin = min || '';
  printFilters.ordoMax = max || '';

  return {
    dateInvalide: !!((minRaw && !min) || (maxRaw && !max)),
    ordreInverse: !!(min && max && min > max),
  };
}

function filteredPrintRows() {
  return sortedRows(state.all).filter((r) => matchesFilters(r, printFilters));
}

function printFiltersLabel() {
  const parts = [];
  if (printFilters.statut) {
    parts.push(`Statut : ${APPEL_STATUT_LABELS[printFilters.statut] || printFilters.statut}`);
  }
  if (printFilters.resultat === '__none__') parts.push('Résultat : sans résultat');
  else if (printFilters.resultat) {
    parts.push(`Résultat : ${APPEL_RESULTAT_LABELS[printFilters.resultat] || printFilters.resultat}`);
  }
  if (printFilters.type) parts.push(`Type : ${printFilters.type}`);
  if (printFilters.ordoMin && printFilters.ordoMax) {
    parts.push(`Ordonnance du ${fmtDate(printFilters.ordoMin)} au ${fmtDate(printFilters.ordoMax)}`);
  } else if (printFilters.ordoMin) {
    parts.push(`Ordonnance à partir du ${fmtDate(printFilters.ordoMin)}`);
  } else if (printFilters.ordoMax) {
    parts.push(`Ordonnance jusqu’au ${fmtDate(printFilters.ordoMax)}`);
  }
  return parts.length ? `Filtres — ${parts.join(' · ')}` : 'Filtres — aucun (toutes les fiches)';
}

function updatePrintCount() {
  const { dateInvalide, ordreInverse } = readPrintFilters();
  const node = el('printCount');
  if (dateInvalide) { node.textContent = 'Date d’ordonnance invalide (JJ/MM/AAAA)'; return; }
  if (ordreInverse) { node.textContent = 'La date de début est après la date de fin'; return; }
  const n = filteredPrintRows().length;
  node.textContent = `${n} fiche${n > 1 ? 's' : ''} à imprimer`;
}

el('fabPrint').addEventListener('click', async () => {
  el('printSheet').hidden = false;
  updatePrintCount();
  await refresh();
  updatePrintCount();
});

$$('[data-close-print]').forEach((n) => n.addEventListener('click', () => {
  el('printSheet').hidden = true;
}));

['printStatut', 'printResultat', 'printType', 'printOrdoMin', 'printOrdoMax'].forEach((id) => {
  const node = el(id);
  if (!node) return;
  node.addEventListener(id.startsWith('printOrdo') ? 'input' : 'change', updatePrintCount);
});

el('printRunBtn').addEventListener('click', async () => {
  const { dateInvalide, ordreInverse } = readPrintFilters();
  if (dateInvalide) { toast('Date d’ordonnance invalide', 'error'); return; }
  if (ordreInverse) { toast('La date de début est après la date de fin', 'error'); return; }

  await refresh();
  readPrintFilters();
  const rows = filteredPrintRows();
  if (!rows.length) { toast('Aucune fiche pour ces filtres', 'error'); return; }

  el('printDate').textContent = `Imprimé le ${new Date().toLocaleString('fr-FR')}`;
  el('printFilters').textContent = `${printFiltersLabel()} · ${rows.length} fiche${rows.length > 1 ? 's' : ''}`;
  el('printBody').innerHTML = rows.map((r) => `<tr>
    <td class="print-identity">${printIdentite(r)}</td>
    <td class="print-location">${printLocation(r)}</td>
    <td>${escapeHtml(r.commentaire || '')}</td>
    <td>${escapeHtml(r.commentaire_statut || '')}</td>
    <td class="print-call">${printAppel(r)}</td>
    <td class="print-followup">${escapeHtml(suiviPrint(r))}</td>
  </tr>`).join('');

  el('printSheet').hidden = true;
  el('printRoot').hidden = false;
  window.print();
  setTimeout(() => { el('printRoot').hidden = true; }, 500);
});

refresh().catch((err) => toast(err.message || String(err), 'error'));
