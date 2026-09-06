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
  listMode: 'recent',
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
  message_repondeur: 'Message sur le répondeur',
  raccroche: 'Raccroché',
  mauvais_numero: 'Mauvais numéro',
  pas_de_numero: 'Pas de numéro',
  autre_raison: 'Autre raison',
  message_laisse: 'Message laissé',
};

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
  row.innerHTML = `
    <input type="tel" class="phone-input" inputmode="tel" placeholder="06 12 34 56 78" value="${escapeHtml(value)}">
    <button type="button" class="icon-btn phone-remove" aria-label="Retirer">✕</button>
  `;
  $('.phone-remove', row).onclick = () => {
    row.remove();
    if (!listEl.children.length) addPhoneRow(listEl);
  };
  listEl.appendChild(row);
}

function resetPhones(listEl, values = ['']) {
  listEl.innerHTML = '';
  (values.length ? values : ['']).forEach((v) => addPhoneRow(listEl, v));
}

function appendJournal(row, line) {
  const prev = (row.journal || '').trim();
  return prev ? `${prev}\n${line}` : line;
}

function suiviPrint(row) {
  const parts = [];
  if (row.journal) parts.push(row.journal);
  if (row.appel_resultat) parts.push(`Résultat: ${APPEL_RESULTAT_LABELS[row.appel_resultat] || row.appel_resultat}`);
  if (row.appel_motif) parts.push(`Motif: ${row.appel_motif}`);
  if (row.mail_envoye) parts.push('Mail: envoyé');
  else if (row.mail_demande) parts.push('Mail: demandé');
  if (row.dossier_bloque) parts.push('Dossier bloqué');
  return parts.join(' | ');
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
  const { data, error } = await sb.from(TABLE).select('*').order('created_at', { ascending: false });
  if (error) { toast(error.message, 'error'); return; }

  state.all = data || [];
  state.commentQueue = state.all.filter((r) => r.commentaire_statut !== 'ECRIS');
  state.callQueue = state.all.filter(inCallQueue);

  if (state.commentIndex >= state.commentQueue.length) state.commentIndex = 0;
  if (state.callIndex >= state.callQueue.length) {
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
el('addPhoneBtn').addEventListener('click', () => addPhoneRow(el('phonesList')));
bindDateMasks();

el('newForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const dateNaissance = parseFrDate(fd.get('date_naissance'));
  const dateOrdo = parseFrDate(fd.get('date_ordonnance'));
  if (!dateNaissance) { toast('Date de naissance invalide', 'error'); return; }
  if (!dateOrdo) { toast('Date d’ordonnance invalide', 'error'); return; }

  const payload = {
    nom: String(fd.get('nom') || '').trim().toUpperCase(),
    prenom: String(fd.get('prenom') || '').trim(),
    date_naissance: dateNaissance,
    type_location: fd.get('type_location'),
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
  e.target.querySelector('input[value="Lit"]').checked = true;
  resetPhones(el('phonesList'), ['']);
  toast('Fiche créée');
  await refresh();
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
  el('commentsHint').textContent =
    `${state.commentIndex + 1} / ${state.commentQueue.length} — glissez pour passer`;
}

el('cardAddPhoneBtn').addEventListener('click', () => addPhoneRow(el('cardPhonesList')));
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
  };
  if (mailAlready) {
    patch.mail_envoye = true;
    patch.mail_demande = true;
    patch.journal = appendJournal(row, `${todayFr()} — Mail déjà envoyé (module comptes)`);
  }

  const { error } = await sb.from(TABLE).update(patch).eq('id', row.id);
  if (error) { toast(error.message, 'error'); return; }

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

bindSwipe(el('swipeCard'), {
  canDrag: () => !!currentComment(),
  onSkip: () => {
    state.commentIndex = (state.commentIndex + 1) % Math.max(state.commentQueue.length, 1);
    renderCommentCard();
  },
});

/* ---------- Module 3 ---------- */
function currentCall() {
  return state.callQueue[state.callIndex] || null;
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
    (row.appel_statut === 'a_rappeler' ? ' · À rappeler' : '');

  const journal = el('callJournal');
  if (row.journal) {
    journal.classList.remove('hidden');
    journal.textContent = row.journal;
  } else {
    journal.classList.add('hidden');
    journal.textContent = '';
  }

  renderCallPhones(row);
  el('callsHint').textContent =
    `${state.callIndex + 1} / ${state.callQueue.length} — glissez pour un autre appel`;

  const steps = el('callSteps');
  steps.innerHTML = '';
  const go = (step) => { state.callStep = step; renderCallFlow(); };

  if (state.callStep === 'ask_call') {
    steps.appendChild(stepCard('Avez-vous appelé / joint le patient ?', [
      ['Oui — appel fait', () => { state.draft = {}; go('call_yes_comment'); }],
      ['Non — pas d’appel', () => { state.draft = {}; go('call_no'); }],
    ]));
  }

  if (state.callStep === 'call_yes_comment') {
    const wrap = document.createElement('div');
    wrap.className = 'step-card';
    wrap.innerHTML = `
      <h3>Commentaire d’appel (optionnel)</h3>
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
    ];
    choices.forEach(([label, code]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn secondary';
      b.textContent = label;
      b.onclick = () => {
        state.draft.note = el('callYesNote').value.trim();
        state.draft.resultat = code;
        handleCallYes(row);
      };
      grid.appendChild(b);
    });
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
    const hasMail = !!(row.email_patient || state.draft.email);
    steps.appendChild(stepCard(
      hasMail
        ? `Un mail est disponible (${row.email_patient || state.draft.email}). Envoyer ?`
        : 'Avez-vous un mail pour ce patient ?',
      hasMail
        ? [
            ['Oui — préparer l’envoi', () => go('mail_compose')],
            ['Non — pas d’envoi', () => handleNoMail(row)],
          ]
        : [
            ['Oui — j’ai une adresse', () => go('mail_compose')],
            ['Non — pas de mail disponible', () => handleNoMail(row)],
          ],
      () => {
        state.callStep = state.draft.backAfterMail || 'ask_call';
        renderCallFlow();
      }
    ));
  }

  if (state.callStep === 'mail_compose') {
    const wrap = document.createElement('div');
    wrap.className = 'step-card';
    wrap.innerHTML = `
      <h3>Envoi du mail</h3>
      <label class="inline-field">Email
        <input id="mailTo" type="email" value="${escapeHtml(row.email_patient || state.draft.email || '')}">
      </label>
      <label class="inline-field">Commentaire mail (optionnel)
        <textarea id="mailNote" rows="2" placeholder="Précision sur l’envoi…">${escapeHtml(state.draft.mailNote || '')}</textarea>
      </label>
      <div class="choice-grid"></div>
    `;
    const grid = $('.choice-grid', wrap);
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'btn ghost';
    back.textContent = 'Retour';
    back.onclick = () => go('ask_mail');
    const send = document.createElement('button');
    send.type = 'button';
    send.className = 'btn primary';
    send.textContent = 'Ouvrir Mail & enregistrer';
    send.onclick = async () => {
      const email = el('mailTo').value.trim();
      if (!email) { toast('Email requis', 'error'); return; }
      const mailNote = el('mailNote').value.trim();
      const subject = encodeURIComponent(`Location ${row.type_location} — ${fullName(row)}`);
      const body = encodeURIComponent(
        `Bonjour,\n\nConcernant la location (${row.type_location}) de ${fullName(row)}` +
        ` (né(e) le ${fmtDate(row.date_naissance)}).\n` +
        `Date d'ordonnance souhaitée : ${fmtDate(row.date_ordonnance)}.\n\n` +
        `${mailNote ? mailNote + '\n\n' : ''}` +
        `${row.commentaire ? 'Note fiche : ' + row.commentaire + '\n\n' : ''}` +
        `Cordialement,\nPharmacie`
      );
      window.location.href = `mailto:${encodeURIComponent(email)}?subject=${subject}&body=${body}`;
      await applyCallUpdate(row, buildMailPatch(row, email, mailNote));
    };
    grid.append(back, send);
    steps.appendChild(wrap);
  }
}

async function handleCallYes(row) {
  const code = state.draft.resultat;
  const note = state.draft.note || '';
  const date = todayFr();

  if (code === 'ramene_semaine') {
    const line = `${date} — Appel OK : ramène l’appareil dans la semaine` + (note ? ` (${note})` : '');
    await applyCallUpdate(row, {
      appel_fait: true,
      appel_resultat: code,
      appel_statut: 'termine',
      journal: appendJournal(row, line),
    });
    return;
  }

  if (code === 'ordo_mail') {
    state.draft.backAfterMail = 'call_yes_comment';
    state.draft.afterMail = 'termine_ordo';
    state.callStep = 'ask_mail';
    renderCallFlow();
    return;
  }

  // message / raccroche / mauvais numéro → mail puis (sauf mauvais) rester à rappeler
  if (code === 'message_repondeur') {
    state.draft.recallLine = `${date} — Déjà appelé le ${date} et laissé message sur le répondeur` + (note ? ` (${note})` : '');
    state.draft.afterMail = 'rappeler';
  } else if (code === 'raccroche') {
    state.draft.recallLine = `${date} — Déjà appelé le ${date} : a raccroché` + (note ? ` (${note})` : '');
    state.draft.afterMail = 'rappeler';
  } else if (code === 'mauvais_numero') {
    state.draft.recallLine = `${date} — Mauvais numéro` + (note ? ` (${note})` : '');
    state.draft.afterMail = 'mauvais_numero';
  }

  state.draft.backAfterMail = 'call_yes_comment';
  state.callStep = 'ask_mail';
  renderCallFlow();
}

async function handleCallNo(row) {
  const date = todayFr();
  const reason = state.draft.noReason;
  const note = state.draft.note || '';

  if (reason === 'autre_raison') {
    const line = `${date} — Pas appelé : ${note}`;
    await applyCallUpdate(row, {
      appel_fait: false,
      appel_resultat: 'autre_raison',
      appel_motif: note,
      appel_statut: 'a_rappeler',
      journal: appendJournal(row, line),
    });
    return;
  }

  // pas de numéro → mail
  state.draft.recallLine = `${date} — Pas de numéro` + (note ? ` (${note})` : '');
  state.draft.afterMail = 'pas_de_numero';
  state.draft.backAfterMail = 'call_no_comment';
  state.callStep = 'ask_mail';
  renderCallFlow();
}

function buildMailPatch(row, email, mailNote) {
  const date = todayFr();
  const after = state.draft.afterMail;
  const baseLine = state.draft.recallLine || `${date} — Suivi appel`;
  const mailLine = `${date} — Mail envoyé à ${email}` + (mailNote ? ` : ${mailNote}` : '');
  let journal = appendJournal(row, baseLine);
  journal = appendJournal({ journal }, mailLine);

  const patch = {
    email_patient: email,
    mail_demande: true,
    mail_envoye: true,
    journal,
    appel_resultat: state.draft.resultat || state.draft.noReason || row.appel_resultat,
    appel_motif: state.draft.note || row.appel_motif,
  };

  if (after === 'termine_ordo') {
    patch.appel_fait = true;
    patch.appel_resultat = 'ordo_mail';
    patch.appel_statut = 'termine';
    const note = state.draft.note ? ` (${state.draft.note})` : '';
    patch.journal = appendJournal(row, `${date} — Appel OK : envoie l’ordonnance par mail${note}\n${mailLine}`);
  } else if (after === 'rappeler') {
    patch.appel_fait = true;
    patch.appel_statut = 'a_rappeler';
  } else if (after === 'mauvais_numero' || after === 'pas_de_numero') {
    patch.appel_fait = after === 'mauvais_numero';
    patch.appel_statut = 'termine'; // contacté par mail
  }

  return patch;
}

async function handleNoMail(row) {
  const date = todayFr();
  const after = state.draft.afterMail;
  const baseLine = state.draft.recallLine || `${date} — Suivi`;
  const noMailLine = `${date} — Pas d’envoi de mail (indisponible)`;

  if (after === 'termine_ordo') {
    // voulait ordo par mail mais pas de mail → on demande confirmation / PERTE? User said mauvais/pas numero without mail → PERTE
    // For ordo_mail without mail, treat as need email - go back or PERTE? I'll toast and stay.
    toast('Sans mail, impossible de clôturer « ordonnance par mail »', 'error');
    state.callStep = 'ask_mail';
    renderCallFlow();
    return;
  }

  if (after === 'rappeler') {
    // message / raccroche sans mail → reste à rappeler
    await applyCallUpdate(row, {
      appel_fait: true,
      appel_resultat: state.draft.resultat,
      appel_motif: state.draft.note || null,
      appel_statut: 'a_rappeler',
      mail_demande: false,
      journal: appendJournal(row, `${baseLine}\n${noMailLine}`),
    });
    return;
  }

  if (after === 'mauvais_numero' || after === 'pas_de_numero') {
    await applyCallUpdate(row, {
      appel_fait: after === 'mauvais_numero',
      appel_resultat: after === 'mauvais_numero' ? 'mauvais_numero' : 'pas_de_numero',
      appel_motif: state.draft.note || null,
      appel_statut: 'PERTE',
      dossier_bloque: true,
      mail_demande: false,
      journal: appendJournal(row, `${baseLine}\n${noMailLine}\n${date} — Statut PERTE`),
    });
    return;
  }

  toast('Étape mail inattendue', 'error');
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

bindSwipe(el('callSwipeCard'), {
  canDrag: () => !!currentCall(),
  onSkip: () => {
    state.callStep = 'ask_call';
    state.draft = {};
    state.callIndex = (state.callIndex + 1) % Math.max(state.callQueue.length, 1);
    renderCallFlow();
  },
});

/* ---------- Édition ---------- */
el('fabEdit').addEventListener('click', () => {
  state.listMode = 'recent';
  $$('.sheet-tab').forEach((t) => t.classList.toggle('active', t.dataset.list === 'recent'));
  el('editSheet').hidden = false;
  renderEditList();
});

$$('[data-close-sheet]').forEach((n) => n.addEventListener('click', () => {
  el('editSheet').hidden = true;
}));

$$('.sheet-tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    state.listMode = tab.dataset.list;
    $$('.sheet-tab').forEach((t) => t.classList.toggle('active', t === tab));
    renderEditList();
  });
});

function renderEditList() {
  const list = el('editList');
  let rows = state.all;
  if (state.listMode === 'recent') {
    const weekAgo = Date.now() - 14 * 24 * 3600 * 1000;
    rows = state.all.filter((r) => {
      const updated = new Date(r.updated_at || r.created_at).getTime();
      return updated >= weekAgo || r.commentaire_statut === 'ECRIS' || r.appel_statut !== 'a_appeler';
    });
  }

  if (!rows.length) {
    list.innerHTML = '<p class="muted" style="padding:12px">Aucune fiche.</p>';
    return;
  }

  list.innerHTML = rows.map((r) => {
    const flags = [
      r.commentaire_statut === 'ECRIS' ? 'ECRIS' : 'com. à faire',
      APPEL_STATUT_LABELS[r.appel_statut] || r.appel_statut,
      r.mail_envoye ? 'mail' : null,
    ].filter(Boolean).join(' · ');
    return `<button type="button" class="edit-item" data-id="${r.id}">
      <strong>${escapeHtml(fullName(r))}</strong>
      <span>${escapeHtml(r.type_location)} · ordo ${escapeHtml(fmtDate(r.date_ordonnance))} · ${escapeHtml(flags)}</span>
    </button>`;
  }).join('');

  $$('.edit-item', list).forEach((btn) => {
    btn.addEventListener('click', () => openEditForm(btn.dataset.id));
  });
}

el('editAddPhoneBtn').addEventListener('click', () => addPhoneRow(el('editPhonesList')));

function openEditForm(id) {
  const row = state.all.find((r) => r.id === id);
  if (!row) return;
  state.editingId = id;
  const form = el('editForm');
  form.id.value = row.id;
  form.nom.value = row.nom || '';
  form.prenom.value = row.prenom || '';
  form.date_naissance.value = toFrInput(row.date_naissance);
  form.type_location.value = row.type_location || 'Lit';
  form.date_ordonnance.value = toFrInput(row.date_ordonnance);
  form.commentaire.value = row.commentaire || '';
  form.commentaire_statut.value = row.commentaire_statut || '';
  form.appel_statut.value = row.appel_statut || 'a_appeler';
  form.journal.value = row.journal || '';
  form.email_patient.value = row.email_patient || '';
  form.mail_envoye.checked = !!row.mail_envoye;
  form.dossier_bloque.checked = !!row.dossier_bloque;
  resetPhones(el('editPhonesList'), phonesOf(row).length ? phonesOf(row) : ['']);
  bindDateMasks(form);
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

  const appelStatut = fd.get('appel_statut');
  const payload = {
    nom: String(fd.get('nom') || '').trim().toUpperCase(),
    prenom: String(fd.get('prenom') || '').trim(),
    date_naissance: dateNaissance,
    type_location: fd.get('type_location'),
    date_ordonnance: dateOrdo,
    telephones: collectPhones(el('editPhonesList')),
    commentaire: String(fd.get('commentaire') || '').trim() || null,
    commentaire_statut: fd.get('commentaire_statut') || null,
    appel_statut: appelStatut,
    journal: String(fd.get('journal') || '').trim() || null,
    email_patient: String(fd.get('email_patient') || '').trim() || null,
    mail_envoye: !!e.target.mail_envoye.checked,
    dossier_bloque: !!e.target.dossier_bloque.checked || appelStatut === 'PERTE',
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
el('fabPrint').addEventListener('click', async () => {
  await refresh();
  el('printDate').textContent = `Imprimé le ${new Date().toLocaleString('fr-FR')}`;
  el('printBody').innerHTML = state.all.map((r) => `<tr>
    <td>${escapeHtml(r.nom)}</td>
    <td>${escapeHtml(r.prenom)}</td>
    <td>${escapeHtml(fmtDate(r.date_naissance))}</td>
    <td>${escapeHtml(r.type_location)}</td>
    <td>${escapeHtml(fmtDate(r.date_ordonnance))}</td>
    <td>${escapeHtml(phonesOf(r).join(', '))}</td>
    <td>${escapeHtml(r.commentaire || '')}</td>
    <td>${escapeHtml(r.commentaire_statut || '')}</td>
    <td>${escapeHtml(APPEL_STATUT_LABELS[r.appel_statut] || r.appel_statut || '')}</td>
    <td>${escapeHtml(suiviPrint(r))}</td>
    <td>${escapeHtml(r.email_patient || '')}</td>
    <td>${r.mail_envoye ? 'Oui' : (r.mail_demande ? 'Demandé' : '')}</td>
  </tr>`).join('') || '<tr><td colspan="12">Aucune ligne</td></tr>';

  el('printRoot').hidden = false;
  window.print();
  setTimeout(() => { el('printRoot').hidden = true; }, 500);
});

refresh().catch((err) => toast(err.message || String(err), 'error'));
