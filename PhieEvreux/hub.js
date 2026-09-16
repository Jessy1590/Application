/* Hub PhieEvreux — cartes apps + admin Equipe / invite / bugs */
(function () {
  const el = (id) => document.getElementById(id);

  function toast(msg, type = 'ok') {
    const t = el('hubToast');
    t.hidden = false;
    t.className = `hub-toast ${type}`;
    t.textContent = msg;
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => { t.hidden = true; }, 2800);
  }

  function escapeHtml(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  const ROLE_LABELS = {
    administrateur: 'Administrateur',
    gestionnaire: 'Gestionnaire',
    personnel: 'Personnel',
  };

  function setAdminTab(name) {
    document.querySelectorAll('.hub-admin-tab').forEach((b) => {
      b.classList.toggle('active', b.dataset.adminTab === name);
    });
    ['equipe', 'invite', 'bugs'].forEach((pane) => {
      el(`adminPane-${pane}`).hidden = pane !== name;
    });
    if (name === 'equipe') renderEquipe();
  }

  async function resolveDisplayNames(userIds) {
    const map = {};
    if (!userIds.length) return map;
    const portail = PhieEvreuxApps.createPortailClient();
    const { data } = await portail
      .from('profiles')
      .select('id, display_name, email')
      .in('id', userIds);
    (data || []).forEach((p) => {
      map[p.id] = p.display_name || p.email || p.id;
    });
    return map;
  }

  async function renderEquipe() {
    const list = el('hubEquipeList');
    list.innerHTML = '<p class="hub-sub">Chargement…</p>';
    try {
      const members = await PhieEquipe.listMembers();
      const names = await resolveDisplayNames(members.map((m) => m.user_id));
      if (!members.length) {
        list.innerHTML = '<p class="hub-sub">Aucun membre dans l’équipe.</p>';
        return;
      }
      list.innerHTML = members.map((m) => `
        <div class="hub-equipe-row" data-user="${escapeHtml(m.user_id)}">
          <strong>${escapeHtml(names[m.user_id] || m.user_id)}</strong>
          <div class="meta">${escapeHtml(m.user_id)}</div>
          <div class="hub-equipe-actions">
            <select data-role>
              ${['administrateur', 'gestionnaire', 'personnel'].map((r) =>
                `<option value="${r}" ${m.role === r ? 'selected' : ''}>${ROLE_LABELS[r]}</option>`
              ).join('')}
            </select>
            <button type="button" data-remove title="Retirer">Retirer</button>
          </div>
        </div>
      `).join('');

      list.querySelectorAll('[data-role]').forEach((sel) => {
        sel.addEventListener('change', async () => {
          const row = sel.closest('.hub-equipe-row');
          try {
            await PhieEquipe.setRole(row.dataset.user, sel.value);
            toast('Rôle mis à jour');
          } catch (err) {
            toast(err.message || String(err), 'error');
            renderEquipe();
          }
        });
      });

      list.querySelectorAll('[data-remove]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const row = btn.closest('.hub-equipe-row');
          if (!confirm('Retirer ce membre de l’équipe ?')) return;
          try {
            await PhieEquipe.removeMember(row.dataset.user);
            toast('Membre retiré');
            renderEquipe();
          } catch (err) {
            toast(err.message || String(err), 'error');
          }
        });
      });
    } catch (err) {
      list.innerHTML = `<p class="hub-msg error">${escapeHtml(err.message || String(err))}</p>`;
    }
  }

  async function boot() {
    PhieTheme.init();
    PhieFab.mount({ app: 'hub', homeHref: PhieFab.PORTAIL_URL });

    let snap;
    try {
      snap = await PhieEquipe.load();
    } catch (err) {
      toast(err.message || String(err), 'error');
      return;
    }

    const gear = el('hubGearBtn');
    if (snap.isAdmin) {
      gear.hidden = false;
    }

    gear.addEventListener('click', () => {
      el('hubAdminSheet').hidden = false;
      setAdminTab('equipe');
    });

    document.querySelectorAll('[data-close-admin]').forEach((n) => {
      n.addEventListener('click', () => {
        el('hubAdminSheet').hidden = true;
      });
    });

    document.querySelectorAll('.hub-admin-tab').forEach((btn) => {
      btn.addEventListener('click', () => setAdminTab(btn.dataset.adminTab));
    });

    el('hubOpenBugsBtn').addEventListener('click', () => {
      el('hubAdminSheet').hidden = true;
      PhieBugs.open({ app: 'hub' });
      // bascule onglet gestion si admin
      const sheet = document.getElementById('phieBugsSheet');
      if (sheet && PhieEquipe.canManageBugs()) {
        const listTab = sheet.querySelector('[data-phie-bugs-tab="list"]');
        if (listTab) listTab.click();
      }
    });

    el('hubInviteForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const btn = el('hubInviteBtn');
      const msg = el('hubInviteMsg');
      btn.disabled = true;
      btn.textContent = 'Création…';
      msg.hidden = true;
      try {
        await PhieInvite.inviteUser({
          email: fd.get('email'),
          password: fd.get('password'),
          displayName: fd.get('display_name'),
        });
        msg.hidden = false;
        msg.className = 'hub-msg ok';
        msg.textContent = 'Compte créé (accès Phie Evreux, rôle personnel).';
        e.target.reset();
        if (!el('adminPane-equipe').hidden) renderEquipe();
      } catch (err) {
        msg.hidden = false;
        msg.className = 'hub-msg error';
        msg.textContent = err.message || String(err);
      }
      btn.disabled = false;
      btn.textContent = 'Créer le compte';
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
