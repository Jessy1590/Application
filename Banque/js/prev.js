// Prévisionnel : aperçu local d'un mois. Aucune écriture Supabase.
Object.assign(BH, {
  prevPane: 'saisie',
  prevAddOpen: false,
  prevCatAccount: '',

  prevEnsure() {
    if (this.prevStore) return this.prevStore;
    try {
      this.prevStore = JSON.parse(localStorage.getItem('bh-previsionnel') || '{}') || {};
    } catch (e) {
      this.prevStore = {};
    }
    if (!this.prevStore.byMonth) this.prevStore.byMonth = {};
    return this.prevStore;
  },
  prevSave() {
    const store = this.prevEnsure();
    store.month = this.prevMonthKey();
    try { localStorage.setItem('bh-previsionnel', JSON.stringify(store)); } catch (e) { /* quota */ }
  },
  prevDate() {
    if (!this.prevMonth) {
      const stored = this.prevEnsure().month;
      if (stored && /^\d{4}-\d{2}$/.test(stored)) {
        const [y, m] = stored.split('-').map(Number);
        this.prevMonth = new Date(y, m - 1, 1);
      } else {
        const n = new Date();
        this.prevMonth = new Date(n.getFullYear(), n.getMonth(), 1);
      }
    }
    return this.prevMonth;
  },
  prevMonthKey() { return this.monthKey(this.prevDate()); },
  prevMonthLabel() {
    return this.prevDate().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  },
  prevBucket() {
    const store = this.prevEnsure();
    const key = this.prevMonthKey();
    if (!store.byMonth[key]) store.byMonth[key] = { amounts: {}, extras: [] };
    if (!store.byMonth[key].amounts) store.byMonth[key].amounts = {};
    if (!store.byMonth[key].extras) store.byMonth[key].extras = [];
    return store.byMonth[key];
  },
  prevInvalidate() { this._prevCache = null; },

  prevShiftMonth(delta) {
    const d = this.prevDate();
    this.prevMonth = new Date(d.getFullYear(), d.getMonth() + delta, 1);
    this.prevInvalidate();
    this.prevSave();
    this.renderPrev();
  },
  switchPrevPane(pane) {
    this.prevPane = pane === 'comptes' || pane === 'stats' ? pane : 'saisie';
    this.renderPrev();
  },

  // Lignes du mois : budget théorique, terminées à 0, plus les saisies locales.
  prevLines() {
    if (this._prevCache) return this._prevCache;
    const mKey = this.prevMonthKey();
    const bucket = this.prevBucket();
    const amounts = bucket.amounts || {};
    const lines = [];
    (this.state.expenses || []).forEach(exp => {
      if (!this.isExpenseActive(exp)) return;
      const ended = !this.isActiveInMonth(exp, mKey);
      const base = ended ? 0 : (Number(exp.amount) || 0);
      const key = 'e:' + exp.id;
      const has = Object.prototype.hasOwnProperty.call(amounts, key);
      const amount = has ? (Number(amounts[key]) || 0) : base;
      lines.push({
        key, kind: 'expense', accountId: exp.account_id, id: exp.id,
        description: exp.description || '', category: exp.category || '',
        day: exp.day, amount, base, ended, extra: false,
        isWallet: !!exp.is_wallet, payerId: exp.payer_id || null
      });
    });
    (this.state.incomes || []).forEach(inc => {
      const base = Number(inc.amount) || 0;
      const key = 'i:' + inc.id;
      const has = Object.prototype.hasOwnProperty.call(amounts, key);
      const amount = has ? (Number(amounts[key]) || 0) : base;
      lines.push({
        key, kind: 'income', accountId: inc.account_id, id: inc.id,
        description: inc.description || '', category: inc.income_type === 'remboursement' ? 'Remboursement' : '',
        day: inc.day, amount, base, ended: false, extra: false,
        isWallet: false, payerId: null, incomeType: inc.income_type || ''
      });
    });
    (bucket.extras || []).forEach(ex => {
      lines.push({
        key: 'x:' + ex.id, kind: ex.kind === 'income' ? 'income' : 'expense',
        accountId: ex.accountId, id: ex.id,
        description: ex.description || '', category: ex.category || '',
        day: null, amount: Number(ex.amount) || 0, base: null, ended: false, extra: true,
        isWallet: false, payerId: null
      });
    });
    this._prevCache = lines;
    return lines;
  },
  prevAccountLines(accId, kind) {
    return this.prevLines().filter(l => l.accountId === accId && (!kind || l.kind === kind));
  },
  prevSum(accId, kind) {
    return this.prevAccountLines(accId, kind).reduce((s, l) => s + (Number(l.amount) || 0), 0);
  },

  prevMemberRevenue(mainAccountId) {
    if (!mainAccountId) return 0;
    const known = (this.state.accounts || []).some(a => a.id === mainAccountId);
    if (!known) return 0;
    return this.prevSum(mainAccountId, 'income');
  },
  prevFairShares(acc, mems, tExp, tInc) {
    const netExp = Math.max(0, (Number(tExp) || 0) - (Number(tInc) || 0));
    const shares = {};
    const anyProrata = mems.some(m => (m.contribution_mode || 'fixed') === 'prorata');
    if (anyProrata) {
      const revenues = mems.map(m => {
        const mainId = m.profiles?.main_account_id;
        if (mainId && (this.state.accounts || []).some(a => a.id === mainId)) return this.prevMemberRevenue(mainId);
        return this.memberRevenue(m.user_id, mainId);
      });
      const totalRev = revenues.reduce((a, b) => a + b, 0);
      mems.forEach((m, idx) => {
        shares[m.user_id] = totalRev > 0 ? netExp * (revenues[idx] / totalRev) : netExp / mems.length;
      });
    } else {
      mems.forEach(m => {
        const mode = m.contribution_mode || 'fixed';
        shares[m.user_id] = mode === 'percent'
          ? netExp * (Number(m.contribution_target) || 0) / 100
          : (Number(m.contribution_target) || 0);
      });
    }
    return shares;
  },
  prevSettlements(acc, mems, tExp, tInc, exps) {
    const shares = this.prevFairShares(acc, mems, tExp, tInc);
    const balances = mems.map(m => {
      const avances = exps.filter(e => e.payer_id === m.user_id).reduce((s, e) => s + Number(e.amount), 0);
      return { name: m.profiles?.display_name || 'Membre', balance: avances - (shares[m.user_id] || 0) };
    });
    const creditors = balances.filter(b => b.balance > 0.5).sort((a, b) => b.balance - a.balance).map(b => ({ ...b }));
    const debtors = balances.filter(b => b.balance < -0.5).sort((a, b) => a.balance - b.balance).map(b => ({ ...b }));
    const txs = [];
    let i = 0, j = 0;
    while (i < debtors.length && j < creditors.length) {
      const amt = Math.min(-debtors[i].balance, creditors[j].balance);
      if (amt > 0.5) txs.push({ from: debtors[i].name, to: creditors[j].name, amount: amt });
      debtors[i].balance += amt;
      creditors[j].balance -= amt;
      if (Math.abs(debtors[i].balance) < 0.5) i++;
      if (Math.abs(creditors[j].balance) < 0.5) j++;
    }
    return txs;
  },
  prevMyApport(acc, mems, tExp, tInc) {
    if (!this.user) return 0;
    const myMem = mems.find(m => m.user_id === this.user.id);
    if (!myMem) return 0;
    const mode = myMem.contribution_mode || 'fixed';
    const net = Math.max(0, tExp - tInc);
    if (mode === 'prorata') return this.prevFairShares(acc, mems, tExp, tInc)[this.user.id] || 0;
    if (mode === 'percent') return net * (Number(myMem.contribution_target) || 0) / 100;
    return Number(myMem.contribution_target) || 0;
  },
  prevOutboundTotal(mainId) {
    if (!mainId) return 0;
    let total = 0;
    (this.state.accounts || []).forEach(acc => {
      if (acc.id === mainId) return;
      const mems = (this.state.members || []).filter(m => m.account_id === acc.id);
      if (!mems.some(m => m.user_id === this.user?.id)) return;
      total += this.prevMyApport(acc, mems, this.prevSum(acc.id, 'expense'), this.prevSum(acc.id, 'income'));
    });
    return total;
  },

  prevSetAmount(key, raw) {
    const n = Number(String(raw).replace(',', '.'));
    if (!isFinite(n) || n < 0) return;
    const rounded = Math.round(n * 100) / 100;
    const bucket = this.prevBucket();
    if (String(key).startsWith('x:')) {
      const id = String(key).slice(2);
      const ex = (bucket.extras || []).find(e => e.id === id);
      if (ex) ex.amount = rounded;
    } else {
      const line = this.prevLines().find(l => l.key === key);
      const base = line ? line.base : null;
      if (base != null && Math.abs(rounded - base) < 0.001) delete bucket.amounts[key];
      else bucket.amounts[key] = rounded;
    }
    this.prevInvalidate();
    this.prevSave();
    const input = document.querySelector('#view-prev input[data-prev-key="' + CSS.escape(key) + '"]');
    if (input) {
      const line = this.prevLines().find(l => l.key === key);
      const edited = !!(line && line.base != null && Math.abs(line.amount - line.base) >= 0.001);
      input.classList.toggle('is-edited', edited);
      input.classList.toggle('is-added', !!(line && line.extra));
      const row = input.closest('.bh-prev-line');
      if (row) {
        row.classList.toggle('is-edited', edited);
        row.classList.toggle('is-added', !!(line && line.extra));
      }
    }
  },
  prevRemoveExtra(id) {
    const bucket = this.prevBucket();
    bucket.extras = (bucket.extras || []).filter(e => e.id !== id);
    this.prevInvalidate();
    this.prevSave();
    this.renderPrev();
  },
  prevToggleAdd(force) {
    this.prevAddOpen = typeof force === 'boolean' ? force : !this.prevAddOpen;
    this.renderPrev();
  },
  prevAddLine() {
    const accId = document.getElementById('prev-add-account')?.value || '';
    const kind = document.getElementById('prev-add-kind')?.value === 'income' ? 'income' : 'expense';
    const description = (document.getElementById('prev-add-desc')?.value || '').trim();
    const category = (document.getElementById('prev-add-cat')?.value || '').trim();
    const amount = Number(String(document.getElementById('prev-add-amount')?.value || '').replace(',', '.'));
    if (!accId || !description || !isFinite(amount) || amount < 0) return;
    const bucket = this.prevBucket();
    bucket.extras.push({
      id: (crypto.randomUUID ? crypto.randomUUID() : ('x' + Date.now())),
      accountId: accId, kind, description, category, amount: Math.round(amount * 100) / 100
    });
    this.prevAddOpen = false;
    this.prevInvalidate();
    this.prevSave();
    this.renderPrev();
  },
  prevResetMonth() {
    const label = this.prevMonthLabel();
    if (!window.confirm('Effacer les modifications de ' + label + ' sur cet appareil ?')) return;
    const store = this.prevEnsure();
    delete store.byMonth[this.prevMonthKey()];
    this.prevInvalidate();
    this.prevSave();
    this.renderPrev();
  },

  prevLineMeta(line) {
    const bits = [];
    if (line.isWallet) bits.push('Portefeuille');
    if (line.category) bits.push(line.category);
    if (line.day) bits.push('le ' + line.day);
    if (line.ended) bits.push('Terminée');
    return bits.join(' · ');
  },
  prevLineHtml(line) {
    const edited = line.base != null && Math.abs(line.amount - line.base) >= 0.001;
    const added = !!line.extra;
    const title = (line.isWallet ? '👛 ' : '') + (line.description || (line.kind === 'income' ? 'Revenu' : 'Dépense'));
    const before = added ? '—' : this.fmt(line.base);
    const del = added
      ? `<button type="button" class="bh-icon-btn" onclick="BH.prevRemoveExtra('${this.esc(line.id)}')" aria-label="Retirer la saisie ajoutée">✕</button>`
      : '<span></span>';
    const state = added ? ' is-added' : (edited ? ' is-edited' : '');
    return `<div class="bh-prev-line${state}">
      <div>
        <div class="bh-prev-line-title">${this.esc(title)}</div>
        <div class="bh-prev-line-meta">${this.esc(this.prevLineMeta(line)) || '—'}</div>
      </div>
      <div class="bh-prev-before num">${before}</div>
      <input class="bh-prev-amt${state}" type="number" min="0" step="0.01" inputmode="decimal"
        data-prev-key="${this.esc(line.key)}" value="${line.amount}"
        onchange="BH.prevSetAmount('${this.esc(line.key)}', this.value)" aria-label="${this.esc(title)}">
      ${del}
    </div>`;
  },

  renderPrevSaisie() {
    const accounts = this.getOrderedAccounts();
    const cats = [...new Set(this.prevLines().map(l => l.category).filter(Boolean))].sort();
    const addBtn = `<div class="bh-prev-head">
      <div>
        <p class="bh-prev-note">Avant = montant théorique du mois. Actuel = valeur utilisée pour les comptes et les statistiques. Rien n'est enregistré dans le budget.</p>
        <div class="bh-prev-legend" style="margin-top:8px;">
          <span class="is-edited"><i></i>Modifié</span>
          <span class="is-added"><i></i>Ajouté</span>
        </div>
      </div>
      <div style="display:flex; gap:8px; flex-wrap:wrap;">
        <button type="button" class="bh-btn bh-btn-ghost" onclick="BH.prevResetMonth()">Réinitialiser</button>
        <button type="button" class="bh-btn bh-btn-primary" onclick="BH.prevToggleAdd()">${this.prevAddOpen ? 'Fermer' : 'Ajouter une saisie'}</button>
      </div>
    </div>`;
    let add = '';
    if (this.prevAddOpen) {
      const opts = accounts.map(a => `<option value="${this.esc(a.id)}">${this.esc(a.name)}</option>`).join('');
      add = `<div class="bh-card bh-prev-add">
        <div><label class="bh-field-label" for="prev-add-account">Compte</label><select id="prev-add-account" class="bh-input">${opts}</select></div>
        <div><label class="bh-field-label" for="prev-add-kind">Type</label>
          <select id="prev-add-kind" class="bh-input"><option value="expense">Dépense</option><option value="income">Revenu</option></select></div>
        <div><label class="bh-field-label" for="prev-add-desc">Nom</label><input id="prev-add-desc" class="bh-input" type="text" maxlength="120"></div>
        <div><label class="bh-field-label" for="prev-add-cat">Catégorie</label><input id="prev-add-cat" class="bh-input" type="text" list="prev-cat-list" maxlength="80"></div>
        <div><label class="bh-field-label" for="prev-add-amount">Montant</label><input id="prev-add-amount" class="bh-input" type="number" min="0" step="0.01" inputmode="decimal" value="0"></div>
        <button type="button" class="bh-btn bh-btn-primary" onclick="BH.prevAddLine()">Ajouter</button>
        <datalist id="prev-cat-list">${cats.map(c => `<option value="${this.esc(c)}"></option>`).join('')}</datalist>
      </div>`;
    }
    const blocks = accounts.map(acc => {
      const exps = this.prevAccountLines(acc.id, 'expense').slice().sort((a, b) => (Number(a.day) || 99) - (Number(b.day) || 99));
      const incs = this.prevAccountLines(acc.id, 'income');
      const head = `<div class="bh-prev-cols"><span></span><span>Avant</span><span>Actuel</span><span></span></div>`;
      const expHtml = exps.length ? head + exps.map(l => this.prevLineHtml(l)).join('') : '<div class="bh-prev-line-meta" style="padding:8px 12px;">Aucune dépense.</div>';
      const incHtml = incs.length ? head + incs.map(l => this.prevLineHtml(l)).join('') : '<div class="bh-prev-line-meta" style="padding:8px 12px;">Aucun revenu.</div>';
      return `<div class="bh-card">
        <div class="bh-prev-acc-name">${this.esc(acc.name)}</div>
        <div class="bh-section-label">Dépenses</div>
        ${expHtml}
        <div class="bh-section-label" style="margin-top:16px;">Revenus</div>
        ${incHtml}
      </div>`;
    }).join('');
    return addBtn + add + (blocks || '<div class="bh-empty">Aucun compte</div>');
  },

  prevShowLines(accId, kind) {
    const acc = (this.state.accounts || []).find(a => a.id === accId);
    const lines = this.prevAccountLines(accId, kind);
    const title = (acc ? acc.name : 'Compte') + (kind === 'income' ? ' — revenus' : kind === 'expense' ? ' — dépenses' : '');
    const rows = lines.map(l => `<div class="bh-info-row"><span>${this.esc(l.description || (l.kind === 'income' ? 'Revenu' : 'Dépense'))}${l.category ? ' <span style="color:var(--ink-faint);font-weight:400;">(' + this.esc(l.category) + ')</span>' : ''}</span><span class="num">${this.fmt(l.amount)}</span></div>`).join('')
      || '<div style="font-size:13px;color:var(--ink-soft);">Aucune ligne.</div>';
    const total = lines.reduce((s, l) => s + l.amount, 0);
    this.openInfo(title, rows + `<div class="bh-info-row"><span>Total</span><span class="num">${this.fmt(total)}</span></div>`);
  },

  renderPrevComptes() {
    const mainId = this.state.profile?.main_account_id;
    const outbound = this.prevOutboundTotal(mainId);
    const accounts = this.getOrderedAccounts();
    const intro = `<p class="bh-prev-note">Vue théorique de ${this.esc(this.prevMonthLabel())}, calculée uniquement avec les montants de l'étape Saisie.</p>`;
    const html = accounts.map(acc => {
      const mems = (this.state.members || []).filter(m => m.account_id === acc.id);
      const isMain = acc.id === mainId;
      const tExp = this.prevSum(acc.id, 'expense');
      const tInc = this.prevSum(acc.id, 'income');
      const shares = mems.length ? this.prevFairShares(acc, mems, tExp, tInc) : {};
      const totalAllocated = Object.values(shares).reduce((a, b) => a + Number(b || 0), 0);
      const myApport = isMain ? outbound : this.prevMyApport(acc, mems, tExp, tInc);
      const reste = isMain ? (tInc - tExp - outbound) : (totalAllocated + tInc - tExp);
      const theoIn = isMain ? tInc : (totalAllocated + tInc);
      const theoOut = isMain ? (tExp + outbound) : tExp;
      const pool = Math.max(0, theoIn);
      const spent = Math.max(0, theoOut);
      let expW = 0, restW = 0;
      if (pool <= 0 || spent >= pool) expW = (spent > 0 || pool > 0) ? 100 : 0;
      else { expW = spent / pool * 100; restW = 100 - expW; }
      const delta = theoIn - theoOut;
      const cell = (label, value, click, extra) => `<button type="button" class="bh-acct-cell${extra || ''}" onclick="${click}"><span class="bh-acct-cell-label">${label}</span><span class="bh-acct-cell-value num">${value}</span></button>`;
      const ok = reste > 0;
      let alertHtml = '';
      let settleHtml = '';
      let chartsHtml = '';
      const exps = this.prevAccountLines(acc.id, 'expense').filter(l => l.amount > 0);
      const catTotals = {};
      exps.forEach(l => {
        const c = l.category || 'Autre';
        catTotals[c] = (catTotals[c] || 0) + l.amount;
      });
      const catItems = Object.entries(catTotals).map(([label, value]) => ({ label, value }));
      if (catItems.length) {
        chartsHtml += `<div class="bh-acct-chart-block"><div class="chart-title">Dépenses par catégorie</div>${this.pieChart(catItems, { size: 120, centerSub: 'Dépenses' })}</div>`;
      }
      if (!isMain && mems.length) {
        const couvert = totalAllocated + tInc;
        if (tExp > 0 && couvert < tExp - 0.5) {
          alertHtml = `<div style="background:var(--clay-pale); color:var(--clay); border-radius:10px; padding:10px 12px; font-size:12.5px; font-weight:600; margin-bottom:10px;">Financement insuffisant : il manque ${this.fmt(tExp - couvert)}/mois.</div>`;
        } else if (tExp > 0 && couvert > tExp + 0.5) {
          alertHtml = `<div style="background:var(--sage-pale); color:var(--sage-deep); border-radius:10px; padding:10px 12px; font-size:12.5px; font-weight:600; margin-bottom:10px;">Financement excédentaire : ${this.fmt(couvert - tExp)}/mois.</div>`;
        }
        if (mems.length > 1) {
          const fakeExps = exps.map(l => ({ payer_id: l.payerId, amount: l.amount }));
          const txs = this.prevSettlements(acc, mems, tExp, tInc, fakeExps);
          if (txs.length) {
            settleHtml = `<div style="border-top:1px dashed var(--line); margin-top:12px; padding-top:12px;">
              <div style="font-size:12px; font-weight:700; color:var(--ink-soft); text-transform:uppercase; letter-spacing:0.04em; margin-bottom:8px;">Qui doit quoi</div>
              ${txs.map(t => `<div style="display:flex; justify-content:space-between; font-size:13px; padding:4px 0;"><span>${this.esc(t.from)} → ${this.esc(t.to)}</span><span class="num" style="color:var(--amber);">${this.fmt(t.amount)}</span></div>`).join('')}
            </div>`;
          }
          const shareItems = mems.map(m => ({ label: m.profiles?.display_name || 'Membre', value: shares[m.user_id] || 0 }));
          if (tInc > 0) shareItems.push({ label: 'Revenus du compte', value: tInc });
          chartsHtml += `<div class="bh-acct-chart-block"><div class="chart-title">Part de chacun</div>${this.pieChart(shareItems, { size: 120, centerSub: 'Part / mois' })}</div>`;
        }
      }
      const apportLabel = isMain ? 'Apports versés' : 'Apport';
      return `<div class="bh-card bh-acct-card">
        <div class="bh-acct-head"><div class="bh-acct-name">${this.esc(acc.name)}${isMain ? ' <span class="bh-acct-star" title="Compte principal">⭐</span>' : ''}</div></div>
        ${alertHtml}
        <button type="button" class="bh-split-btn" onclick="BH.prevShowLines('${acc.id}')">
          <div class="bh-split theo${delta < 0 ? ' neg' : ''}"><span class="exp" style="width:${expW}%"></span><span class="rest" style="width:${restW}%"></span></div>
          <div class="bh-split-legend">
            <span><i class="dot exp"></i> Dépenses théoriques ${this.fmt(theoOut)}</span>
            <span><i class="dot rest"></i> ${delta < 0 ? 'Dépassement' : 'Revenu restant'} ${this.fmt(delta)}</span>
          </div>
        </button>
        <div class="bh-acct-kicker">Théorique</div>
        <div class="bh-acct-cells">
          ${cell('Dépenses théoriques', this.fmt(tExp), `BH.prevShowLines('${acc.id}','expense')`)}
          ${cell('Revenus / remb.', this.fmt(tInc), `BH.prevShowLines('${acc.id}','income')`)}
          <div class="bh-acct-cell is-static"><span class="bh-acct-cell-label">${apportLabel}</span><span class="bh-acct-cell-value num">${this.fmt(myApport)}</span></div>
          ${cell(ok ? 'Excédent financier' : 'Risque financier', this.fmt(reste), `BH.prevShowLines('${acc.id}')`, ok ? ' ok' : ' risk')}
        </div>
        ${settleHtml}
        ${chartsHtml}
      </div>`;
    }).join('');
    return intro + `<div class="bh-acct-pair">${html || '<div class="bh-empty">Aucun compte</div>'}</div>`;
  },

  prevPersonalStats() {
    const mainId = this.state.profile?.main_account_id;
    const empty = { revenus: 0, depenses: 0, epargne: 0, capacite: 0, tauxEpargne: null, mensualites: 0, plafond: 0, marge: 0, tauxDette: null, lines: [] };
    if (!mainId) return empty;
    const lines = this.prevAccountLines(mainId, 'expense');
    const revenus = this.prevSum(mainId, 'income');
    const depensesToutes = lines.reduce((s, l) => s + l.amount, 0);
    const epargne = lines.filter(l => this.isEpargneExpense(l)).reduce((s, l) => s + l.amount, 0);
    const outbound = this.prevOutboundTotal(mainId);
    const capacite = revenus - depensesToutes - outbound + epargne;
    const credits = lines.filter(l => l.amount > 0 && this.isPersonalCreditExpense({
      is_wallet: l.isWallet, active: true, category: l.category, description: l.description
    }));
    const mensualites = credits.reduce((s, l) => s + l.amount, 0);
    const plafond = revenus * 0.35;
    return {
      revenus, depenses: depensesToutes, epargne, outbound, capacite,
      tauxEpargne: revenus > 0 ? (capacite / revenus) * 100 : null,
      mensualites, plafond, marge: Math.max(0, plafond - mensualites),
      tauxDette: revenus > 0 ? (mensualites / revenus) * 100 : null,
      credits
    };
  },
  prevShowEpargne() {
    const s = this.prevPersonalStats();
    if (!this.state.profile?.main_account_id) {
      this.openInfo('Capacité d\'épargne', '<div style="font-size:13px;color:var(--ink-soft);">Définissez votre compte principal dans les Réglages.</div>');
      return;
    }
    this.openInfo('Prévisionnel — épargne', `
      <div class="bh-info-row"><span>Revenus</span><span class="num">${this.fmt(s.revenus)}</span></div>
      <div class="bh-info-row"><span>− Dépenses</span><span class="num">${this.fmt(s.depenses)}</span></div>
      <div class="bh-info-row"><span>− Apports vers les autres comptes</span><span class="num">${this.fmt(s.outbound || 0)}</span></div>
      <div class="bh-info-row"><span>+ Déjà catégorisé épargne</span><span class="num">${this.fmt(s.epargne)}</span></div>
      <div class="bh-info-row"><span>= Capacité d'épargne</span><span class="num">${this.fmt(s.capacite)}</span></div>
      <div style="font-size:11.5px;color:var(--ink-faint);margin-top:12px;">Mois ${this.esc(this.prevMonthLabel())}. Montants de l'étape Saisie uniquement.</div>`);
  },
  prevShowDette() {
    const s = this.prevPersonalStats();
    if (!this.state.profile?.main_account_id) {
      this.openInfo('Capacité d\'endettement', '<div style="font-size:13px;color:var(--ink-soft);">Définissez votre compte principal dans les Réglages.</div>');
      return;
    }
    const rows = (s.credits || []).map(l => `<div class="bh-info-row"><span>${this.esc(l.description || l.category || 'Crédit')}</span><span class="num">${this.fmt(l.amount)}</span></div>`).join('');
    this.openInfo('Prévisionnel — endettement', `
      <div class="bh-info-row"><span>Revenus</span><span class="num">${this.fmt(s.revenus)}</span></div>
      <div class="bh-info-row"><span>Plafond 35 %</span><span class="num">${this.fmt(s.plafond)}</span></div>
      <div class="bh-info-row"><span>− Mensualités</span><span class="num">${this.fmt(s.mensualites)}</span></div>
      ${rows}
      <div class="bh-info-row"><span>= Marge</span><span class="num">${this.fmt(s.marge)}</span></div>
      <div style="font-size:11.5px;color:var(--ink-faint);margin-top:12px;">Même repérage que les statistiques (crédit dans la catégorie, autres libellés dans le nom). Mois ${this.esc(this.prevMonthLabel())}.</div>`);
  },

  renderPrevStats() {
    const s = this.prevPersonalStats();
    const mainId = this.state.profile?.main_account_id;
    const depasse = s.tauxDette != null && s.tauxDette > 35;
    const salary = [];
    (this.state.accounts || []).forEach(acc => {
      if (acc.id === mainId) return;
      const mems = (this.state.members || []).filter(m => m.account_id === acc.id);
      const amt = this.prevMyApport(acc, mems, this.prevSum(acc.id, 'expense'), this.prevSum(acc.id, 'income'));
      if (amt > 0) salary.push({ label: acc.name, value: amt });
    });
    const accFilter = this.prevCatAccount || '';
    const totals = {};
    this.prevLines().forEach(l => {
      if (l.kind !== 'expense' || l.amount <= 0) return;
      if (accFilter && l.accountId !== accFilter) return;
      const c = l.category || 'Autre';
      totals[c] = (totals[c] || 0) + l.amount;
    });
    const catItems = Object.entries(totals).map(([label, value]) => ({ label, value }));
    const opts = [{ id: '', name: 'Tous les comptes' }].concat(this.getOrderedAccounts()).map(a =>
      `<option value="${this.esc(a.id)}"${a.id === accFilter ? ' selected' : ''}>${this.esc(a.name)}</option>`
    ).join('');
    let revenus = 0, depenses = 0, epargne = 0;
    this.prevLines().forEach(l => {
      if (l.kind === 'income') revenus += l.amount;
      else if (this.isEpargneExpense(l)) epargne += l.amount;
      else depenses += l.amount;
    });
    const capacite = Math.max(0, revenus - depenses);
    const epargneTxt = s.tauxEpargne != null
      ? `Taux d'épargne : ${s.tauxEpargne.toFixed(1)} % du revenu`
      : "Taux d'épargne : —";
    const detteTxt = s.tauxDette != null
      ? `Taux d'endettement : ${s.tauxDette.toFixed(1)} % · mensualités ${this.fmt(s.mensualites)}`
      : "Taux d'endettement : —";
    return `<p class="bh-prev-note">${this.esc(this.prevMonthLabel())} — statistiques générales sur les montants saisis, sans les validations du mois réel.</p>
      <div class="bh-stats-hero">
        <div class="bh-card bh-stats-kpi">
          <div class="bh-stats-kpi-label">Capacité d'épargne (Mensuelle) <button class="bh-info-btn" onclick="BH.prevShowEpargne()" title="Détail">?</button></div>
          <div class="num">${mainId ? this.fmt(s.capacite) : '—'}</div>
          <div class="bh-stats-kpi-sub">${epargneTxt}</div>
        </div>
        <div class="bh-card bh-stats-kpi">
          <div class="bh-stats-kpi-label">Capacité d'endettement (Mensuelle) <button class="bh-info-btn" onclick="BH.prevShowDette()" title="Détail">?</button></div>
          <div class="num" style="color:${depasse ? 'var(--clay)' : 'var(--sage-deep)'}">${mainId ? this.fmt(s.marge) : '—'}</div>
          <div class="bh-stats-kpi-sub">${detteTxt}</div>
        </div>
      </div>
      <div class="bh-stats-grid">
        <div class="bh-stats-col">
          <div class="bh-section-label">Répartition de mon salaire</div>
          <div class="bh-card">
            <div class="chart-title">Vers mes comptes partagés</div>
            <div id="prev-chart-salary">${salary.length ? this.pieChart(salary, { centerSub: 'Apports / mois' }) : '<div class="chart-empty">Aucun apport vers un compte partagé.</div>'}</div>
          </div>
        </div>
        <div class="bh-stats-col">
          <div class="bh-section-label">Dépenses par catégorie</div>
          <div class="bh-card">
            <div class="chart-head">
              <div class="chart-title">Répartition</div>
              <select class="bh-input" style="margin:0; width:auto; min-width:160px;" onchange="BH.prevCatAccount=this.value; BH.renderPrev()">${opts}</select>
            </div>
            <div id="prev-chart-cat">${catItems.length ? this.pieChart(catItems, { centerSub: 'Dépenses' }) : '<div class="chart-empty">Aucune dépense sur ce filtre.</div>'}</div>
          </div>
        </div>
        <div class="bh-stats-col" style="grid-column:1 / -1;">
          <div class="bh-section-label">Revenus, dépenses et épargne</div>
          <div class="bh-card">
            <div class="bh-info-row"><span>Revenus</span><span class="num">${this.fmt(revenus)}</span></div>
            <div class="bh-info-row"><span>Dépenses (hors épargne)</span><span class="num">${this.fmt(depenses)}</span></div>
            <div class="bh-info-row"><span>Épargne</span><span class="num">${this.fmt(epargne)}</span></div>
            <div class="bh-info-row"><span>Capacité (revenus − dépenses)</span><span class="num">${this.fmt(capacite)}</span></div>
          </div>
        </div>
      </div>`;
  },

  renderPrev() {
    const root = document.getElementById('view-prev');
    if (!root || !this.state || !this.state.accounts) return;
    this.prevInvalidate();
    this.prevLines();
    const monthLabel = document.getElementById('prev-month-label');
    if (monthLabel) monthLabel.textContent = this.prevMonthLabel();
    root.querySelectorAll('.bh-prev-nav button').forEach(b => {
      b.classList.toggle('active', b.dataset.prevPane === this.prevPane);
    });
    const panes = { saisie: 'prev-pane-saisie', comptes: 'prev-pane-comptes', stats: 'prev-pane-stats' };
    Object.entries(panes).forEach(([name, id]) => {
      const el = document.getElementById(id);
      if (!el) return;
      const on = name === this.prevPane;
      el.classList.toggle('active', on);
      if (on) {
        el.innerHTML = name === 'saisie' ? this.renderPrevSaisie()
          : name === 'comptes' ? this.renderPrevComptes()
          : this.renderPrevStats();
      }
    });
  }
});
