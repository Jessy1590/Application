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
  _motif: '',
};

const APPEL_LABELS = {
  message_laisse: 'Message laissé',
  ramene_semaine: 'Ramène dans la semaine',
  raccroche: 'Raccroché',
  mauvais_numero: 'Mauvais numéro',
};

function toast(msg, type = 'ok') {
  const t = el('toast');
  t.hidden = false;
  t.className = `toast ${type}`;
  t.textContent = msg;
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { t.hidden = true; }, 2800);
}

/** JJ/MM/AAAA (ou variantes) → YYYY-MM-DD pour Postgres date */
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
  if (Number.isNaN(dt.getTime())) return null;
  return iso;
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
  if (!iso) return '—';
  const fr = toFrInput(iso);
  return fr || String(iso);
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
  if (!p) return [];
  return Array.isArray(p) ? p.filter(Boolean) : [];
}

function telHref(num) {
  return `tel:${String(num).replace(/[^\d+]/g, '')}`;
}

function collectPhones(listEl) {
  return $$('.phone-input', listEl)
    .map((i) => i.value.trim())
    .filter(Boolean);
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

/* ---------- Navigation (manuel uniquement) ---------- */
function setTab(name) {
  $$('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  $$('.view').forEach((v) => v.classList.toggle('active', v.dataset.view === name));
  if (name === 'comments') renderCommentCard();
  if (name === 'calls') renderCallFlow();
}

$$('.tab').forEach((btn) => {
  btn.addEventListener('click', () => setTab(btn.dataset.tab));
});

/* ---------- Data ---------- */
async function refresh() {
  const { data, error } = await sb
    .from(TABLE)
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    toast(error.message, 'error');
    return;
  }

  state.all = data || [];
  state.commentQueue = state.all.filter((r) => r.commentaire_statut !== 'ECRIS');
  state.callQueue = state.all.filter((r) => r.appel_fait === null);

  if (state.commentIndex >= state.commentQueue.length) state.commentIndex = 0;
  if (state.callIndex >= state.callQueue.length) {
    state.callIndex = 0;
    state.callStep = 'ask_call';
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

el('newForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);

  const dateNaissance = parseFrDate(fd.get('date_naissance'));
  const dateOrdo = parseFrDate(fd.get('date_ordonnance'));
  if (!dateNaissance) {
    toast('Date de naissance invalide (JJ/MM/AAAA)', 'error');
    return;
  }
  if (!dateOrdo) {
    toast('Date d’ordonnance invalide (JJ/MM/AAAA)', 'error');
    return;
  }

  const payload = {
    nom: String(fd.get('nom') || '').trim().toUpperCase(),
    prenom: String(fd.get('prenom') || '').trim(),
    date_naissance: dateNaissance,
    type_location: fd.get('type_location'),
    date_ordonnance: dateOrdo,
    telephones: collectPhones(el('phonesList')),
    commentaire: String(fd.get('commentaire') || '').trim() || null,
  };

  const btn = el('submitFormBtn');
  btn.disabled = true;
  btn.textContent = 'Création…';
  const { error } = await sb.from(TABLE).insert(payload);
  btn.disabled = false;
  btn.textContent = 'Créer la fiche';

  if (error) {
    toast(error.message, 'error');
    return;
  }

  e.target.reset();
  e.target.querySelector('input[value="Lit"]').checked = true;
  resetPhones(el('phonesList'), ['']);
  toast('Fiche créée — restez sur Nouveau');
  await refresh();
  // Pas de changement d’onglet : enchaîner les saisies
});

/* ---------- Module 2 : cartes ---------- */
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
  el('commentDoneCheck').checked = false;
  el('mailAlreadyCheck').checked = !!row.mail_envoye;
  el('validateCommentBtn').disabled = true;
  el('commentsHint').textContent =
    `${state.commentIndex + 1} / ${state.commentQueue.length} — glissez pour passer`;
}

function syncCommentValidateBtn() {
  el('validateCommentBtn').disabled = !el('commentDoneCheck').checked;
}

el('commentDoneCheck').addEventListener('change', syncCommentValidateBtn);

async function validateComment() {
  const row = currentComment();
  if (!row || !el('commentDoneCheck').checked) return;

  const mailAlready = el('mailAlreadyCheck').checked;
  const patch = { commentaire_statut: 'ECRIS' };
  if (mailAlready) {
    patch.mail_envoye = true;
    patch.mail_demande = true;
  }

  const { error } = await sb.from(TABLE).update(patch).eq('id', row.id);
  if (error) {
    toast(error.message, 'error');
    return;
  }

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
    // Ne pas bloquer les taps sur boutons / liens / inputs
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

/* ---------- Module 3 : appels (Tinder + arbre) ---------- */
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
    `Né(e) ${fmtDate(row.date_naissance)} · Ordo ${fmtDate(row.date_ordonnance)}`;
  renderCallPhones(row);
  el('callsHint').textContent =
    `${state.callIndex + 1} / ${state.callQueue.length} — glissez pour passer à un autre appel`;

  const steps = el('callSteps');
  steps.innerHTML = '';

  if (state.callStep === 'ask_call') {
    steps.appendChild(stepCard('Le patient a-t-il répondu / a-t-il été joint ?', [
      ['Oui — appel abouti', () => { state.callStep = 'call_yes'; renderCallFlow(); }],
      ['Non — pas d’appel / pas joint', () => { state.callStep = 'call_no_why'; renderCallFlow(); }],
    ]));
  }

  if (state.callStep === 'call_yes') {
    steps.appendChild(stepCard('Résultat de l’appel', [
      ['Laissé un message', () => finishCall({ appel_fait: true, appel_resultat: 'message_laisse' })],
      ['Réponse : je vous le ramène dans la semaine', () => finishCall({ appel_fait: true, appel_resultat: 'ramene_semaine' })],
      ['Raccroché', () => finishCall({ appel_fait: true, appel_resultat: 'raccroche' })],
      ['Mauvais numéro', () => finishCall({ appel_fait: true, appel_resultat: 'mauvais_numero' })],
    ], () => { state.callStep = 'ask_call'; renderCallFlow(); }));
  }

  if (state.callStep === 'call_no_why') {
    const step = document.createElement('div');
    step.className = 'step-card';
    step.innerHTML = `
      <h3>Pourquoi pas d’appel / pas joint ?</h3>
      <label class="inline-field">Motif
        <textarea id="callMotif" rows="3">${escapeHtml(state._motif || '')}</textarea>
      </label>
      <div class="choice-grid"></div>
    `;
    const grid = $('.choice-grid', step);
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'btn ghost';
    back.textContent = 'Retour';
    back.onclick = () => { state.callStep = 'ask_call'; renderCallFlow(); };
    const next = document.createElement('button');
    next.type = 'button';
    next.className = 'btn primary';
    next.textContent = 'Continuer';
    next.onclick = () => {
      const motif = el('callMotif').value.trim();
      if (!motif) { toast('Indiquez un motif', 'error'); return; }
      state._motif = motif;
      state.callStep = 'ask_mail';
      renderCallFlow();
    };
    grid.append(back, next);
    steps.appendChild(step);
  }

  if (state.callStep === 'ask_mail') {
    steps.appendChild(stepCard('Peut-on envoyer un mail ?', [
      ['Oui — préparer un mail', () => { state.callStep = 'mail_yes'; renderCallFlow(); }],
      ['Non — dossier bloqué à écrire', () => finishCall({
        appel_fait: false,
        appel_motif: state._motif || null,
        mail_demande: false,
        dossier_bloque: true,
      })],
    ], () => { state.callStep = 'call_no_why'; renderCallFlow(); }));
  }

  if (state.callStep === 'mail_yes') {
    const step = document.createElement('div');
    step.className = 'step-card';
    step.innerHTML = `
      <h3>Envoi du mail</h3>
      <p>Saisissez l’adresse, puis ouvrez l’app Mail.</p>
      <label class="inline-field">Email patient
        <input id="mailTo" type="email" value="${escapeHtml(row.email_patient || '')}">
      </label>
      <div class="choice-grid"></div>
    `;
    const grid = $('.choice-grid', step);
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'btn ghost';
    back.textContent = 'Retour';
    back.onclick = () => { state.callStep = 'ask_mail'; renderCallFlow(); };

    const send = document.createElement('button');
    send.type = 'button';
    send.className = 'btn primary';
    send.textContent = 'Ouvrir Mail & enregistrer';
    send.onclick = async () => {
      const email = el('mailTo').value.trim();
      if (!email) { toast('Email requis', 'error'); return; }
      const subject = encodeURIComponent(`Location ${row.type_location} — ${fullName(row)}`);
      const body = encodeURIComponent(
        `Bonjour,\n\nConcernant la location (${row.type_location}) de ${fullName(row)}` +
        ` (né(e) le ${fmtDate(row.date_naissance)}).\n` +
        `Date d'ordonnance souhaitée : ${fmtDate(row.date_ordonnance)}.\n\n` +
        `${row.commentaire ? 'Note : ' + row.commentaire + '\n\n' : ''}` +
        `Cordialement,\nPharmacie`
      );
      window.location.href = `mailto:${encodeURIComponent(email)}?subject=${subject}&body=${body}`;
      await finishCall({
        appel_fait: false,
        appel_motif: state._motif || null,
        mail_demande: true,
        mail_envoye: true,
        email_patient: email,
        dossier_bloque: false,
      });
    };
    grid.append(back, send);
    steps.appendChild(step);
  }
}

function stepCard(title, actions, onBack) {
  const card = document.createElement('div');
  card.className = 'step-card';
  const h = document.createElement('h3');
  h.textContent = title;
  card.appendChild(h);
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
  actions.forEach(([label, fn]) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn secondary';
    b.textContent = label;
    b.onclick = fn;
    grid.appendChild(b);
  });
  card.appendChild(grid);
  return card;
}

async function finishCall(patch) {
  const row = currentCall();
  if (!row) return;
  const { error } = await sb.from(TABLE).update(patch).eq('id', row.id);
  if (error) {
    toast(error.message, 'error');
    return;
  }
  toast('Suivi d’appel enregistré');
  state.callStep = 'ask_call';
  state._motif = '';
  await animateSwipe(el('callSwipeCard'), 'right');
  await refresh();
  renderCallFlow();
}

bindSwipe(el('callSwipeCard'), {
  canDrag: () => !!currentCall(),
  onSkip: () => {
    state.callStep = 'ask_call';
    state._motif = '';
    state.callIndex = (state.callIndex + 1) % Math.max(state.callQueue.length, 1);
    renderCallFlow();
  },
});

/* ---------- FAB édition ---------- */
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
      return updated >= weekAgo || r.appel_fait !== null || r.commentaire_statut === 'ECRIS';
    });
  }

  if (!rows.length) {
    list.innerHTML = '<p class="muted" style="padding:12px">Aucune fiche.</p>';
    return;
  }

  list.innerHTML = rows.map((r) => {
    const flags = [
      r.commentaire_statut === 'ECRIS' ? 'ECRIS' : 'com. à faire',
      r.appel_fait === null ? 'appel ?' : (r.appel_fait ? APPEL_LABELS[r.appel_resultat] || 'appelé' : 'non joint'),
      r.dossier_bloque ? 'bloqué' : null,
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
  form.email_patient.value = row.email_patient || '';
  form.dossier_bloque.checked = !!row.dossier_bloque;
  form.mail_envoye.checked = !!row.mail_envoye;
  resetPhones(el('editPhonesList'), phonesOf(row).length ? phonesOf(row) : ['']);
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
    toast('Date de naissance invalide (JJ/MM/AAAA)', 'error');
    return;
  }
  if (fd.get('date_ordonnance') && !dateOrdo) {
    toast('Date d’ordonnance invalide (JJ/MM/AAAA)', 'error');
    return;
  }

  const payload = {
    nom: String(fd.get('nom') || '').trim().toUpperCase(),
    prenom: String(fd.get('prenom') || '').trim(),
    date_naissance: dateNaissance,
    type_location: fd.get('type_location'),
    date_ordonnance: dateOrdo,
    telephones: collectPhones(el('editPhonesList')),
    commentaire: String(fd.get('commentaire') || '').trim() || null,
    commentaire_statut: fd.get('commentaire_statut') || null,
    email_patient: String(fd.get('email_patient') || '').trim() || null,
    dossier_bloque: !!e.target.dossier_bloque.checked,
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
el('fabPrint').addEventListener('click', async () => {
  await refresh();
  el('printDate').textContent = `Imprimé le ${new Date().toLocaleString('fr-FR')}`;
  el('printBody').innerHTML = state.all.map((r) => {
    const appel = r.appel_fait === null
      ? '—'
      : (r.appel_fait ? 'Oui' : `Non${r.appel_motif ? ' — ' + r.appel_motif : ''}`);
    const resultat = r.appel_resultat ? (APPEL_LABELS[r.appel_resultat] || r.appel_resultat) : '—';
    return `<tr>
      <td>${escapeHtml(r.nom)}</td>
      <td>${escapeHtml(r.prenom)}</td>
      <td>${escapeHtml(fmtDate(r.date_naissance))}</td>
      <td>${escapeHtml(r.type_location)}</td>
      <td>${escapeHtml(fmtDate(r.date_ordonnance))}</td>
      <td>${escapeHtml(phonesOf(r).join(', '))}</td>
      <td>${escapeHtml(r.commentaire || '')}</td>
      <td>${escapeHtml(r.commentaire_statut || '')}</td>
      <td>${escapeHtml(appel)}</td>
      <td>${escapeHtml(resultat)}</td>
      <td>${r.mail_envoye ? 'Oui' : (r.mail_demande ? 'Demandé' : '')}</td>
      <td>${r.dossier_bloque ? 'Oui' : ''}</td>
    </tr>`;
  }).join('') || '<tr><td colspan="12">Aucune ligne</td></tr>';

  el('printRoot').hidden = false;
  window.print();
  setTimeout(() => { el('printRoot').hidden = true; }, 500);
});

/* ---------- Boot ---------- */
refresh().catch((err) => toast(err.message || String(err), 'error'));
