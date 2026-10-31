Object.assign(BH, {
    // --- AUJOURD'HUI ---
    renderToday() {
      const viewDate = this.todayMonth || new Date();
      const now = new Date();
      const dim = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0).getDate();
      const mKey = this.monthKey(viewDate);
      const curKey = this.monthKey(now);
      const isCurrentMonth = mKey === curKey;
      const refDay = isCurrentMonth ? now.getDate() : dim + 1; // mois passé : tout non validé = « en retard »

      const monthLbl = document.getElementById('bh-today-month-label');
      if (monthLbl) {
        const name = viewDate.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
        monthLbl.innerHTML = name
          + (isCurrentMonth
            ? ''
            : ' <span style="font-size:11px;font-weight:600;color:var(--ink-faint);text-transform:none;">(passé)</span>');
      }
      const nextBtn = document.querySelector('#view-today .bh-today-month-nav button:last-child');
      if (nextBtn) {
        nextBtn.disabled = isCurrentMonth;
        nextBtn.style.opacity = isCurrentMonth ? '0.35' : '1';
      }

      let totalDue = 0, totalPaid = 0;
      let paidExpHtml = '', paidIncHtml = '';
      const late = [], today = [], soonExp = [], soonInc = [];

      // Dépenses exceptionnelles déjà enregistrées sur le mois affiché
      this.listExceptionalExpenses(null, mKey).forEach(exc => {
        const acc = this.state.accounts.find(a => a.id === exc.account_id);
        if (!acc) return;
        totalPaid += Number(exc.amount) || 0;
        paidExpHtml += `
          <div class="bh-due" style="display:flex; justify-content:space-between; align-items:center; gap:10px;">
            <div style="min-width:0;">
               <div class="bh-due-desc" style="color:var(--ink-faint); text-decoration:line-through;">${this.esc(exc.description)}</div>
               <div class="bh-due-meta">${this.esc(acc.name)} · Exceptionnelle${exc.category ? ' · ' + this.esc(exc.category) : ''}${exc.date ? ' · ' + this.fmtDate(exc.date) : ''}</div>
            </div>
            <div style="display:flex; align-items:center; gap:8px; flex-shrink:0;">
              <div class="num" style="color:var(--sage);">${this.fmt(exc.amount)}</div>
              <button class="bh-btn bh-btn-ghost" style="padding:7px 10px; font-size:12px;" title="Supprimer cette dépense exceptionnelle" onclick="BH.deleteExceptionalExpense('${exc.id}', '${acc.id}', '${mKey}')">Annuler</button>
            </div>
          </div>`;
      });

      const todayExpenses = [
        ...(this.state.expenses || []).filter(e => this.isActiveInMonth(e, mKey)),
        ...this.listOutboundApportDues({ mKey })
      ];
      todayExpenses.forEach(exp => {
        const acc = this.state.accounts.find(a => a.id === exp.account_id);
        if(!acc) return;
        if (exp.is_wallet) return;
        const paidRec = this.state.months[acc.id + '_' + mKey]?.[exp.id];
        const expiredCls = this.isExpired(exp) ? ' bh-expired' : '';

        if (paidRec) {
          totalPaid += Number(paidRec.amount);
          paidExpHtml += `
            <div class="bh-due${expiredCls}" style="display:flex; justify-content:space-between; align-items:center; gap:10px;">
              <div style="min-width:0;">
                 <div class="bh-due-desc" style="color:var(--ink-faint); text-decoration:line-through;">${this.esc(exp.description)}</div>
                 <div class="bh-due-meta">${this.esc(acc.name)}${exp.is_apport ? ' · Apport' : ''}${this.isExpired(exp) ? ' · ⚠️ Expirée le '+this.fmtDate(exp.end_date) : ''}</div>
              </div>
              <div style="display:flex; align-items:center; gap:8px; flex-shrink:0;">
                <div class="num" style="color:var(--sage);">${this.fmt(paidRec.amount)}</div>
                <button class="bh-btn bh-btn-ghost" style="padding:7px 10px; font-size:12px;" title="Annuler la validation" onclick="BH.unmarkPaid('${exp.id}', '${acc.id}', '${mKey}')">Annuler</button>
              </div>
            </div>`;
        } else {
          totalDue += Number(exp.amount);
          const diff = Math.min(Number(exp.day) || 1, dim) - refDay;
          const item = { kind: 'expense', exp, acc, diff };
          if (!isCurrentMonth) late.push(item);
          else if (diff < 0) late.push(item);
          else if (diff === 0) today.push(item);
          else soonExp.push(item);
        }
      });

      this.state.incomes.forEach(inc => {
        if (Number(inc.amount) <= 0) return;
        const acc = this.state.accounts.find(a => a.id === inc.account_id);
        if (!acc) return;
        const paidRec = this.state.monthsIncomes?.[acc.id + '_' + mKey]?.[inc.id];
        if (paidRec) {
          paidIncHtml += `
            <div class="bh-due" style="display:flex; justify-content:space-between; align-items:center; gap:10px;">
              <div style="min-width:0;">
                 <div class="bh-due-desc" style="color:var(--ink-faint); text-decoration:line-through;">${this.esc(inc.description)}</div>
                 <div class="bh-due-meta">${this.esc(acc.name)}</div>
              </div>
              <div style="display:flex; align-items:center; gap:8px; flex-shrink:0;">
                <div class="num" style="color:var(--sage);">${this.fmt(paidRec.amount)}</div>
                <button class="bh-btn bh-btn-ghost" style="padding:7px 10px; font-size:12px;" title="Annuler l'encaissement" onclick="BH.unmarkIncome('${inc.id}', '${acc.id}', '${mKey}')">Annuler</button>
              </div>
            </div>`;
        } else {
          const diff = Math.min(Number(inc.day) || 1, dim) - refDay;
          const item = { kind: 'income', inc, acc, diff };
          if (!isCurrentMonth) late.push(item);
          else if (diff < 0) late.push(item);
          else if (diff === 0) today.push(item);
          else soonInc.push(item);
        }
      });

      late.sort((a,b)=>a.diff-b.diff);
      today.sort((a,b)=>a.diff-b.diff);
      soonExp.sort((a,b)=>a.diff-b.diff);
      soonInc.sort((a,b)=>a.diff-b.diff);

      const dueItemHtml = (item) => {
        if (item.kind === 'income') {
          const { inc, acc, diff } = item;
          const cls = !isCurrentMonth ? 'bh-pill-late' : (diff < 0 ? 'bh-pill-late' : (diff === 0 ? 'bh-pill-today' : 'bh-pill-soon'));
          const lbl = !isCurrentMonth
            ? 'Non encaissé'
            : (diff < 0 ? `En retard de ${-diff} j` : (diff === 0 ? "Aujourd'hui" : `Dans ${diff} j`));
          return `
            <div class="bh-due">
              <div class="bh-due-top">
                <div>
                  <div class="bh-due-desc">${this.esc(inc.description)}</div>
                  <div class="bh-due-meta">
                    <span class="bh-pill ${cls}">${lbl}</span>
                    <span class="bh-pill" style="background:var(--sage-pale); color:var(--sage-deep);">Revenu</span>
                    <span class="bh-pill bh-pill-account">${this.esc(acc.name)}</span>
                    ${inc.income_type === 'remboursement' ? `<span class="bh-pill" style="background:var(--gold-pale); color:var(--gold);">Remboursement</span>` : ''}
                  </div>
                </div>
                <div class="bh-due-amount num" style="color:var(--sage-deep);">+${this.fmt(inc.amount)}</div>
              </div>
              <div class="bh-due-actions">
                <button class="bh-btn bh-btn-primary" onclick="BH.markIncome('${inc.id}', ${inc.amount}, '${acc.id}', '${mKey}')">Encaisser ${this.fmt(inc.amount)}</button>
                <button class="bh-btn bh-btn-ghost" onclick="BH.openDifferentAmount('${inc.id}', '${acc.id}', 'income')">Montant différent</button>
              </div>
            </div>`;
        }
        const { exp, acc, diff } = item;
        const cls = !isCurrentMonth ? 'bh-pill-late' : (diff < 0 ? 'bh-pill-late' : (diff === 0 ? 'bh-pill-today' : 'bh-pill-soon'));
        const lbl = !isCurrentMonth
          ? 'Non validé'
          : (diff < 0 ? `En retard de ${-diff} j` : (diff === 0 ? "Aujourd'hui" : `Dans ${diff} j`));
        const expiredCls = this.isExpired(exp) ? ' bh-expired' : '';
        const selected = !!(this.groupSelect && this.groupSelect[exp.id]);
        return `
          <div class="bh-due${expiredCls}${selected ? ' selected' : ''}">
            <div class="bh-due-top">
              <div style="display:flex; gap:10px; min-width:0; flex:1;">
                <button type="button" class="bh-due-check" onclick="BH.toggleGroupSelect('${exp.id}','${acc.id}')" aria-label="Sélectionner pour validation groupée" title="Sélectionner pour valider ensemble">${selected ? '✓' : ''}</button>
                <div style="min-width:0;">
                  <div class="bh-due-desc">${this.esc(exp.description)}</div>
                  <div class="bh-due-meta">
                    <span class="bh-pill ${cls}">${lbl}</span>
                    ${exp.is_apport ? `<span class="bh-pill" style="background:var(--sage-pale); color:var(--sage-deep);">Apport</span>` : ''}
                    <span class="bh-pill bh-pill-account">${this.esc(acc.name)}</span>
                    ${this.isExpired(exp) ? `<span class="bh-pill" style="background:var(--clay-pale); color:var(--clay);">⚠️ Expirée le ${this.fmtDate(exp.end_date)}</span>` : ''}
                  </div>
                </div>
              </div>
              <div class="bh-due-amount num">${this.fmt(exp.amount)}</div>
            </div>
            <div class="bh-due-actions">
              <button class="bh-btn bh-btn-primary" onclick="BH.markPaid('${exp.id}', ${exp.amount}, '${acc.id}', '${mKey}')">Valider ${this.fmt(exp.amount)}</button>
              <button class="bh-btn bh-btn-ghost" onclick="BH.openDifferentAmount('${exp.id}', '${acc.id}')">Montant différent</button>
            </div>
          </div>`;
      };

      const section = (label, items) => {
        if (!items.length) return '';
        return `<div class="bh-section-label"><span>${label}</span><span class="bh-section-count">${items.length}</span></div>`
          + items.map(dueItemHtml).join('');
      };

      let dueHtml = isCurrentMonth
        ? (section('En retard', late)
          + section("Aujourd'hui", today)
          + section('Dépenses à venir', soonExp)
          + section('Revenus à venir', soonInc))
        : (section('Non validées', late.filter(i => i.kind === 'expense'))
          + section('Non encaissés', late.filter(i => i.kind === 'income')));

      // Portefeuilles (budgets enveloppe avec dépenses internes multiples)
      const wallets = this.state.expenses.filter(e => this.isWalletVisibleInMonth(e, mKey)).map(exp => {
        const acc = this.state.accounts.find(a => a.id === exp.account_id);
        if (!acc) return null;
        const txs = this.getWalletTx(acc.id, exp.id, mKey);
        // Solde enveloppe : crédits d'apports externes inclus
        const spent = this.walletSpent(acc.id, exp.id, mKey);
        // Stats haut de page : seules les sorties du compte propriétaire
        const ownSpent = this.walletOwnSpent(acc.id, exp.id, mKey);
        totalDue += Math.max(0, Number(exp.amount) - spent);
        totalPaid += Math.max(0, Math.min(ownSpent, Number(exp.amount)));
        return { exp, acc, txs, spent };
      }).filter(Boolean);

      document.getElementById('bh-wallets-section').innerHTML = wallets.length
        ? `<div class="bh-section-label">Portefeuilles</div>` + wallets.map(w => this.walletCardHtml(w, mKey)).join('')
        : '';

      document.getElementById('bh-stat-remaining').textContent = this.fmt(totalDue);
      document.getElementById('bh-stat-paid').textContent = this.fmt(totalPaid);
      document.getElementById('bh-due-section').innerHTML = dueHtml || '<div class="bh-empty">' + (isCurrentMonth ? 'Tout est à jour !' : 'Rien à afficher pour ce mois.') + '</div>';
      document.getElementById('bh-paid-list').innerHTML = paidExpHtml || '<div style="text-align:center;font-size:12px;color:var(--ink-faint);">Rien validé</div>';
      const paidIncEl = document.getElementById('bh-paid-incomes-list');
      if (paidIncEl) paidIncEl.innerHTML = paidIncHtml || '<div style="text-align:center;font-size:12px;color:var(--ink-faint);">Rien encaissé</div>';
      this.pruneGroupSelect(mKey);
      this.renderGroupBar();
    },

    fmtDate(d) {
      if (!d) return '';
      return new Date(d + 'T00:00:00').toLocaleDateString('fr-FR');
    },

    walletTxDateLabel(t) {
      if (t?.date) {
        const d = new Date(t.date + 'T00:00:00');
        if (!isNaN(d.getTime())) return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
      }
      return 'le ' + (t?.day ?? '?');
    },

    walletTxKindPill(t) {
      if (t?.from_account_id || t?.kind === 'apport') {
        const src = this.state.accounts.find(a => a.id === t.from_account_id);
        return `<span class="bh-pill" style="background:var(--sage-pale); color:var(--sage-deep); font-size:10px;">Apport${src ? ' · ' + this.esc(src.name) : ''}</span>`;
      }
      if (Number(t?.amount) < 0 || t?.kind === 'refund') {
        return `<span class="bh-pill" style="background:var(--gold-pale); color:var(--gold); font-size:10px;">Remboursement</span>`;
      }
      return '';
    },

    walletCardHtml({ exp, acc, txs, spent }, mKeyOpt) {
      const mKey = mKeyOpt || this.todayViewKey();
      const remaining = Number(exp.amount) - spent;
      const pct = Math.max(0, Math.min(100, (spent / Number(exp.amount)) * 100 || 0));
      const expanded = !!(this.walletExpanded && this.walletExpanded[exp.id]);
      const usable = this.isWalletUsable(exp);
      const expiredCls = this.isExpired(exp) ? ' bh-expired' : '';
      const sortedTxs = txs.slice().sort((a,b)=>Number(b.day)-Number(a.day));
      const [y, m] = mKey.split('-').map(Number);
      const lastDay = new Date(y, m, 0).getDate();
      const monthStart = mKey + '-01';
      const monthEnd = mKey + '-' + String(lastDay).padStart(2, '0');
      const defaultDate = mKey === this.monthKey(new Date())
        ? this._todayISO()
        : monthStart;
      const otherAccOpts = this.state.accounts
        .filter(a => a.id !== acc.id)
        .map(a => `<option value="${a.id}">${this.esc(a.name)}</option>`)
        .join('');
      return `<div class="bh-card${expiredCls}" style="margin-bottom:10px; padding:14px;${!usable ? ' opacity:0.72;' : ''}">
        <div style="display:flex; justify-content:space-between; align-items:center; cursor:pointer; gap:10px;" onclick="BH.toggleWalletExpand('${exp.id}')">
          <div style="min-width:0;">
            <div style="font-weight:700; font-size:14px;">👛 ${this.esc(exp.description)}${!usable ? ' <span class="bh-pill" style="background:var(--line); color:var(--ink-faint); font-size:10px; font-weight:600;">Désactivé</span>' : ''}</div>
            <div style="font-size:11px; color:var(--ink-faint);">${this.esc(acc.name)}${exp.category ? ' · '+this.esc(exp.category) : ''}${this.isExpired(exp) ? ` · ⚠️ Expirée le ${this.fmtDate(exp.end_date)}` : ''}${!usable ? ' · historique seul' : ''}</div>
          </div>
          <div style="text-align:right; flex-shrink:0;">
            <div class="num" style="font-weight:700; color:${remaining>=0?'var(--sage-deep)':'var(--clay)'};">${this.fmt(remaining)}</div>
            <div style="font-size:10px; color:var(--ink-faint);">restant sur ${this.fmt(exp.amount)}</div>
          </div>
        </div>
        <div class="bh-progress-track" style="margin-top:10px;"><div class="bh-progress-fill" style="width:${pct}%;${spent>Number(exp.amount)?'background:var(--clay);':''}"></div></div>
        ${expanded ? `
          <div style="margin-top:12px; border-top:1px dashed var(--line); padding-top:10px;">
            ${sortedTxs.length ? sortedTxs.map(t => `
              <div style="display:flex; justify-content:space-between; align-items:center; font-size:13px; padding:5px 0;">
                <span>${this.esc(t.description)} <span style="color:var(--ink-faint);">· ${this.walletTxDateLabel(t)}</span> ${this.walletTxKindPill(t)}</span>
                <span style="display:flex; align-items:center; gap:8px;">
                  <span class="num" style="color:${Number(t.amount) < 0 ? 'var(--sage-deep)' : 'inherit'};">${Number(t.amount) < 0 ? '+' + this.fmt(Math.abs(Number(t.amount))) : this.fmt(t.amount)}</span>
                  ${usable ? `<button class="bh-order-btn" style="width:20px; height:20px; border-radius:6px; font-size:11px;" onclick="event.stopPropagation(); BH.deleteWalletTx('${exp.id}','${acc.id}','${t.id}','${mKey}')" title="Supprimer">✕</button>` : ''}
                </span>
              </div>`).join('') : '<div style="font-size:12px; color:var(--ink-faint); padding:6px 0;">Aucune dépense saisie ce mois-ci.</div>'}
            ${usable ? `
            <div style="display:flex; flex-direction:column; gap:8px; margin-top:10px;" onclick="event.stopPropagation()">
              <div style="display:flex; gap:6px;">
                <input type="text" id="wtx-desc-${exp.id}" class="bh-input" style="margin:0; flex:2;" placeholder="Ex: Leclerc / remboursement / apport">
                <input type="number" id="wtx-amount-${exp.id}" class="bh-input" style="margin:0; flex:1; min-width:70px;" placeholder="+/- €" step="0.01">
                <button class="bh-btn bh-btn-primary" style="padding:0 14px;" onclick="BH.addWalletTx('${exp.id}','${acc.id}','${mKey}')">+</button>
              </div>
              <div style="display:flex; gap:6px; flex-wrap:wrap;">
                <input type="date" id="wtx-date-${exp.id}" class="bh-input" style="margin:0; flex:1; min-width:140px;" value="${defaultDate}" min="${monthStart}" max="${monthEnd}">
                <select id="wtx-from-${exp.id}" class="bh-input" style="margin:0; flex:1.2; min-width:140px;">
                  <option value="">Compte source : aucun</option>
                  ${otherAccOpts}
                </select>
              </div>
            </div>
            <p style="font-size:11px; color:var(--ink-faint); margin:6px 0 0;">Négatif = remboursement. Compte source = apport depuis un autre compte (ex. Swile → ce portefeuille).</p>
            ` : '<p style="font-size:11px; color:var(--ink-faint); margin:8px 0 0;">Portefeuille désactivé — consultation de l\'historique uniquement.</p>'}
          </div>
        ` : ''}
      </div>`;
    },

    // Revenu "personnel" estimé d'un membre = somme des revenus enregistrés sur SON compte principal
    memberRevenue(userId, mainAccountId) {
      if (!mainAccountId) return 0;
      return this.state.incomes.filter(i => i.account_id === mainAccountId)
        .reduce((s, i) => s + Number(i.amount), 0);
    },

    // Un compte est considéré "épargne" si son nom contient "épargne"/"epargne"
    isSavingsAccount(acc) {
      return !!(acc && /(é|e)pargne/i.test(acc.name || ''));
    },

    // ID synthétique d'un apport mensuel (validé comme une dépense sur le compte principal)
    apportExpenseId(targetAccId) {
      return 'apport_' + targetAccId;
    },
    isApportExpenseId(id) {
      return typeof id === 'string' && id.startsWith('apport_');
    },
    // Apports configurés → dépenses virtuelles à valider le 1er du mois (compte principal)
    listOutboundApportDues(opts = {}) {
      const mainAccId = this.state.profile?.main_account_id;
      if (!mainAccId) return [];
      const mode = opts.mode || 'theorique';
      const mKey = opts.mKey || this.monthKey(new Date());
      const dues = [];
      // Réutilise la même logique de montant que outboundContributionsBreakdown, compte par compte
      const curKey = this.monthKey(new Date());
      this.state.accounts.forEach(acc => {
        if (acc.id === mainAccId) return;
        const mems = this.state.members.filter(m => m.account_id === acc.id);
        const myMem = mems.find(m => m.user_id === this.user.id);
        if (!myMem) return;

        const cMode = myMem.contribution_mode || 'fixed';
        const target = Number(myMem.contribution_target) || 0;

        // Fixe : toujours afficher la cible (même sans snapshot théorique du mois)
        // Effectif validé : préférer le montant réellement versé ce mois-ci
        const paidRec = this.state.months[mainAccId + '_' + mKey]?.[this.apportExpenseId(acc.id)];
        if (paidRec && opts.preferPaid !== false) {
          const paidAmt = Number(paidRec.amount) || 0;
          if (paidAmt > 0 || cMode === 'fixed') {
            dues.push({
              id: this.apportExpenseId(acc.id),
              is_apport: true,
              is_wallet: false,
              account_id: mainAccId,
              target_account_id: acc.id,
              description: 'Apport → ' + (acc.name || 'Compte'),
              amount: Math.round((paidAmt || target) * 100) / 100,
              day: 1,
              category: 'Apport',
              contribution_mode: cMode,
              paid: true
            });
            return;
          }
        }

        if (cMode === 'fixed') {
          if (!(target > 0)) return;
          dues.push({
            id: this.apportExpenseId(acc.id),
            is_apport: true,
            is_wallet: false,
            account_id: mainAccId,
            target_account_id: acc.id,
            description: 'Apport → ' + (acc.name || 'Compte'),
            amount: Math.round(target * 100) / 100,
            day: 1,
            category: 'Apport',
            contribution_mode: cMode
          });
          return;
        }

        let tExp = 0, accTInc = 0;
        if (mode === 'theorique' && mKey !== curKey) {
          const snap = this.state.theoreticalMonths?.[acc.id + '_' + mKey];
          if (!snap || !Object.keys(snap).length) return;
          tExp = Object.values(snap).reduce((s, r) => s + (Number(r.amount) || 0), 0);
          accTInc = this.theoreticalIncomeTotalForAccount(acc.id, mKey);
        } else if (mode === 'effective') {
          this.state.expenses.forEach(e => {
            if (e.account_id !== acc.id) return;
            if (!this.isActiveInMonth(e, mKey)) return;
            if (!this.isExpenseActive(e) && !e.is_wallet) return;
            tExp += this.expenseAmountForStats(e, mKey, 'effective');
          });
          tExp += this.exceptionalAmountForAccount(acc.id, mKey);
          this.state.incomes.forEach(i => {
            if (i.account_id !== acc.id) return;
            accTInc += this.effectiveIncomeAmount(i, mKey);
          });
        } else {
          this.state.expenses.forEach(e => {
            if (e.account_id !== acc.id) return;
            if (!this.isActiveInMonth(e, mKey)) return;
            if (!this.isExpenseActive(e)) return;
            tExp += Number(e.amount) || 0;
          });
          accTInc = this.theoreticalIncomeTotalForAccount(acc.id, mKey);
        }

        const netExp = Math.max(0, tExp - accTInc);
        let amt = 0;
        if (cMode === 'prorata') {
          amt = (this.computeFairShares(acc, mems, tExp, accTInc))[this.user.id] || 0;
        } else if (cMode === 'percent') {
          amt = netExp * target / 100;
        }
        if (!(amt > 0)) return;
        dues.push({
          id: this.apportExpenseId(acc.id),
          is_apport: true,
          is_wallet: false,
          account_id: mainAccId,
          target_account_id: acc.id,
          description: 'Apport → ' + (acc.name || 'Compte'),
          amount: Math.round(amt * 100) / 100,
          day: 1,
          category: 'Apport',
          contribution_mode: cMode
        });
      });
      return dues;
    },
    findExpenseLike(expId, mKeyOpt) {
      const real = (this.state.expenses || []).find(e => e.id === expId);
      if (real) return real;
      if (this.isApportExpenseId(expId)) {
        const mKey = mKeyOpt || this.todayViewKey();
        return this.listOutboundApportDues({ mKey }).find(a => a.id === expId) || null;
      }
      return null;
    },

    // Ventile les apports du user courant vers les autres comptes : total / hors-épargne / épargne uniquement
    // opts.mode = 'theorique' (défaut) | 'effective'
    // opts.mKey = mois (défaut = mois courant) — en effective, basé sur dépenses/revenus validés
    outboundContributionsBreakdown(mainAccId, opts = {}) {
      let nonSavings = 0, savings = 0;
      if (!mainAccId) return { total: 0, nonSavings: 0, savings: 0 };
      const mode = opts.mode || 'theorique';
      const mKey = opts.mKey || this.monthKey(new Date());
      const curKey = this.monthKey(new Date());
      this.state.accounts.forEach(acc => {
        if (acc.id === mainAccId) return;
        const mems = this.state.members.filter(m => m.account_id === acc.id);
        const myMem = mems.find(m => m.user_id === this.user.id);
        if (!myMem) return;

        let tExp = 0, accTInc = 0;
        if (mode === 'theorique' && mKey !== curKey) {
          const snap = this.state.theoreticalMonths?.[acc.id + '_' + mKey];
          if (!snap || !Object.keys(snap).length) return; // pas d'historique → ignore
          tExp = Object.values(snap).reduce((s, r) => s + (Number(r.amount) || 0), 0);
          accTInc = this.theoreticalIncomeTotalForAccount(acc.id, mKey);
        } else if (mode === 'effective') {
          this.state.expenses.forEach(e => {
            if (e.account_id !== acc.id) return;
            if (!this.isActiveInMonth(e, mKey)) return;
            if (!this.isExpenseActive(e) && !e.is_wallet) return;
            tExp += this.expenseAmountForStats(e, mKey, 'effective');
          });
          tExp += this.exceptionalAmountForAccount(acc.id, mKey);
          this.state.incomes.forEach(i => {
            if (i.account_id !== acc.id) return;
            accTInc += this.effectiveIncomeAmount(i, mKey);
          });
        } else {
          this.state.expenses.forEach(e => {
            if (e.account_id !== acc.id) return;
            if (!this.isActiveInMonth(e, mKey)) return;
            if (!this.isExpenseActive(e)) return;
            tExp += Number(e.amount) || 0;
          });
          accTInc = this.theoreticalIncomeTotalForAccount(acc.id, mKey);
        }

        const netExp = Math.max(0, tExp - accTInc);
        const cMode = myMem.contribution_mode || 'fixed';
        let amt = 0;
        // Effectif : si l'apport a été validé dans Aujourd'hui, utiliser le montant réellement versé
        const paidApport = mode === 'effective'
          ? this.state.months[mainAccId + '_' + mKey]?.[this.apportExpenseId(acc.id)]
          : null;
        if (paidApport) {
          amt = Number(paidApport.amount) || 0;
        } else if (cMode === 'prorata') {
          amt = (this.computeFairShares(acc, mems, tExp, accTInc))[this.user.id] || 0;
        } else if (cMode === 'percent') {
          amt = netExp * (Number(myMem.contribution_target) || 0) / 100;
        } else {
          // Fixe : en théorique = cible ; en effectif (non validé) = min(cible, net validé)
          // pour ne pas compter tout l'apport en début de mois si rien n'est encore passé
          const target = Number(myMem.contribution_target) || 0;
          amt = mode === 'effective' ? Math.min(target, netExp) : target;
        }
        if (amt <= 0) return;
        if (this.isSavingsAccount(acc)) savings += amt; else nonSavings += amt;
      });
      return { total: nonSavings + savings, nonSavings, savings };
    },
});
