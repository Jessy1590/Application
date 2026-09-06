/* Phie Evreux — app mobile */
const cfg = window.SUPABASE_CONFIG;
if (!cfg?.url || !cfg?.anonKey) throw new Error('SUPABASE_CONFIG manquant');

const sbAuth = supabase.createClient(cfg.url, cfg.anonKey, { db: { schema: 'portail' } });
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

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso + (String(iso).length <= 10 ? 'T12:00:00' : ''));
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('fr-FR');
}

function fullName(row) {
  return `${(row.nom || '').toUpperCase()} ${row.prenom || ''}`.trim();
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ---------- Navigation ---------- */
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

  const pendingCom = state.commentQueue.length;
  const pendingCall = state.callQueue.length;
  el('queuePill').textContent = `${pendingCom} com. · ${pendingCall} appels`;

  if (el('view-comments').classList.contains('active')) renderCommentCard();
  if (el('view-calls').classList.contains('active')) renderCallFlow();
  if (!el('editSheet').hidden) renderEditList();
}

/* ---------- Module 1 ---------- */
el('newForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const payload = {
    nom: String(fd.get('nom') || '').trim().toUpperCase(),
    prenom: String(fd.get('prenom') || '').trim(),
    date_naissance: fd.get('date_naissance') || null,
    type_location: fd.get('type_location'),
    date_ordonnance: fd.get('date_ordonnance') || null,
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
  toast('Fiche créée');
  await refresh();
  setTab('comments');
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
  el('validateCommentBtn').disabled = true;
  el('commentsHint').textContent =
    `${state.commentIndex + 1} / ${state.commentQueue.length} — glissez pour passer`;
}

el('commentDoneCheck').addEventListener('change', (e) => {
  el('validateCommentBtn').disabled = !e.target.checked;
});

async function validateComment() {
  const row = currentComment();
  if (!row || !el('commentDoneCheck').checked) return;

  const { error } = await sb
    .from(TABLE)
    .update({ commentaire_statut: 'ECRIS' })
    .eq('id', row.id);

  if (error) {
    toast(error.message, 'error');
    return;
  }

  await animateSwipe('right');
  toast('Commentaire ECRIS');
  await refresh();
  renderCommentCard();
}

el('validateCommentBtn').addEventListener('click', validateComment);

function animateSwipe(dir) {
  const card = el('swipeCard');
  return new Promise((resolve) => {
    card.classList.add(dir === 'left' ? 'out-left' : 'out-right');
    setTimeout(resolve, 280);
  });
}

/* swipe gestures */
(() => {
  const card = el('swipeCard');
  let startX = 0;
  let dx = 0;
  let dragging = false;

  card.addEventListener('touchstart', (e) => {
    if (!currentComment()) return;
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
    // swipe sans validation = passer à la suivante (comme Tinder skip)
    await animateSwipe(dx < 0 ? 'left' : 'right');
    state.commentIndex = (state.commentIndex + 1) % Math.max(state.commentQueue.length, 1);
    renderCommentCard();
  });
})();

/* ---------- Module 3 : arbre appels ---------- */
function currentCall() {
  return state.callQueue[state.callIndex] || null;
}

function renderCallFlow() {
  const row = currentCall();
  const empty = el('callsEmpty');
  const flow = el('callFlow');

  if (!row) {
    empty.classList.remove('hidden');
    flow.classList.add('hidden');
    return;
  }

  empty.classList.add('hidden');
  flow.classList.remove('hidden');
  el('callType').textContent = row.type_location;
  el('callName').textContent = fullName(row);
  el('callMeta').textContent =
    `Né(e) ${fmtDate(row.date_naissance)} · Ordo ${fmtDate(row.date_ordonnance)}`;

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
    const card = document.createElement('div');
    card.className = 'step-card';
    card.innerHTML = `
      <h3>Pourquoi pas d’appel / pas joint ?</h3>
      <label style="display:block;margin-bottom:12px;color:var(--muted);font-size:13px">
        Motif
        <textarea id="callMotif" rows="3" style="display:block;width:100%;margin-top:6px;padding:12px;border-radius:12px;border:1px solid var(--line);background:var(--bg-elev);color:var(--text);font:inherit"></textarea>
      </label>
      <div class="choice-grid"></div>
    `;
    const grid = $('.choice-grid', card);
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
    steps.appendChild(card);
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
    const card = document.createElement('div');
    card.className = 'step-card';
    card.innerHTML = `
      <h3>Envoi du mail</h3>
      <p>Saisissez l’adresse, puis ouvrez l’app Mail. Le suivi sera enregistré.</p>
      <label style="display:block;margin-bottom:12px;color:var(--muted);font-size:13px">
        Email patient
        <input id="mailTo" type="email" required value="${escapeHtml(row.email_patient || '')}"
          style="display:block;width:100%;margin-top:6px;padding:12px;border-radius:12px;border:1px solid var(--line);background:var(--bg-elev);color:var(--text);font:inherit;font-size:16px">
      </label>
      <div class="choice-grid"></div>
    `;
    const grid = $('.choice-grid', card);
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
    steps.appendChild(card);
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
  await refresh();
  renderCallFlow();
}

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
    // créées récemment OU touchées par le module appels (appel renseigné / maj récente)
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

function openEditForm(id) {
  const row = state.all.find((r) => r.id === id);
  if (!row) return;
  state.editingId = id;
  const form = el('editForm');
  form.id.value = row.id;
  form.nom.value = row.nom || '';
  form.prenom.value = row.prenom || '';
  form.date_naissance.value = row.date_naissance || '';
  form.type_location.value = row.type_location || 'Lit';
  form.date_ordonnance.value = row.date_ordonnance || '';
  form.commentaire.value = row.commentaire || '';
  form.commentaire_statut.value = row.commentaire_statut || '';
  form.email_patient.value = row.email_patient || '';
  form.dossier_bloque.checked = !!row.dossier_bloque;
  form.mail_envoye.checked = !!row.mail_envoye;
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
  const payload = {
    nom: String(fd.get('nom') || '').trim().toUpperCase(),
    prenom: String(fd.get('prenom') || '').trim(),
    date_naissance: fd.get('date_naissance') || null,
    type_location: fd.get('type_location'),
    date_ordonnance: fd.get('date_ordonnance') || null,
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
  const body = el('printBody');
  el('printDate').textContent = `Imprimé le ${new Date().toLocaleString('fr-FR')}`;
  body.innerHTML = state.all.map((r) => {
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
      <td>${escapeHtml(r.commentaire || '')}</td>
      <td>${escapeHtml(r.commentaire_statut || '')}</td>
      <td>${escapeHtml(appel)}</td>
      <td>${escapeHtml(resultat)}</td>
      <td>${r.mail_envoye ? 'Oui' : (r.mail_demande ? 'Demandé' : '')}</td>
      <td>${r.dossier_bloque ? 'Oui' : ''}</td>
    </tr>`;
  }).join('') || '<tr><td colspan="11">Aucune ligne</td></tr>';

  el('printRoot').hidden = false;
  window.print();
  setTimeout(() => { el('printRoot').hidden = true; }, 500);
});

/* ---------- Boot ---------- */
refresh().catch((err) => toast(err.message || String(err), 'error'));
