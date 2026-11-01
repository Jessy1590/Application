Object.assign(BH, {
    // --- Historique budget théorique ---
    dueDay(item) {
      const d = Number(item && item.day);
      return d >= 1 && d <= 31 ? d : 1;
    },
    // Jour de prélèvement atteint pour ce mois : le barème déjà figé ne bouge plus.
    barèmeFrozen(item, mKey, now = new Date()) {
      const cur = this.monthKey(now);
      if (!mKey || mKey > cur) return false;
      if (mKey < cur) return true;
      return now.getDate() >= this.dueDay(item);
    },
    holdFrozenBarème(accId, mKey, id, item, kind) {
      if (!accId || id == null || !this.barèmeFrozen(item, mKey)) return;
      const incomes = kind === 'income';
      const bagName = incomes ? 'theoreticalIncomesMonths' : 'theoreticalMonths';
      if (!this.state[bagName]) this.state[bagName] = {};
      const key = accId + '_' + mKey;
      const prev = this.state[bagName][key] || {};
      if (prev[id]) return;
      const row = incomes ? this.incomeSnapshotRow(item) : this.expenseSnapshotRow(item);
      this.state[bagName][key] = { ...prev, [id]: row };
    },
    budgetAmountOf(accId, id, mKey, live) {
      const cur = this.monthKey(new Date());
      const snap = this.state.theoreticalMonths?.[accId + '_' + mKey];
      if (snap && Object.keys(snap).length) {
        const row = snap[id];
        if (row) return Number(row.amount) || 0;
        if (mKey !== cur) return 0;
      }
      return Number(live) || 0;
    },
    incomeBudgetAmountOf(accId, id, mKey, live) {
      const cur = this.monthKey(new Date());
      const snap = this.state.theoreticalIncomesMonths?.[accId + '_' + mKey];
      if (snap && Object.keys(snap).length) {
        const row = snap[id];
        if (row) return Number(row.amount) || 0;
        if (mKey !== cur) return 0;
      }
      return Number(live) || 0;
    },
    expenseSnapshotRow(exp) {
      return {
        amount: Number(exp.amount) || 0,
        category: exp.category || 'Autre',
        description: exp.description || '',
        is_wallet: !!exp.is_wallet,
        day: Number(exp.day) || 1,
        end_date: exp.end_date || null,
        active: exp.active !== false
      };
    },

    buildTheoreticalSnapshot(accId, mKey) {
      const prev = this.state.theoreticalMonths?.[accId + '_' + mKey] || {};
      const snap = {};
      (this.state.expenses || []).forEach(exp => {
        if (exp.account_id !== accId) return;
        if (!this.isActiveInMonth(exp, mKey)) return;
        if (!this.isExpenseActive(exp)) return;
        const row = this.expenseSnapshotRow(exp);
        const old = prev[exp.id];
        if (old && this.barèmeFrozen(exp, mKey)) row.amount = Number(old.amount) || 0;
        snap[exp.id] = row;
      });
      Object.keys(prev).forEach(id => {
        if (snap[id]) return;
        const old = prev[id];
        if (old && this.barèmeFrozen(old, mKey)) snap[id] = old;
      });
      return snap;
    },

    incomeSnapshotRow(inc) {
      return {
        amount: Number(inc.amount) || 0,
        description: inc.description || '',
        day: Number(inc.day) || 1,
        income_type: inc.income_type || null
      };
    },

    buildTheoreticalIncomesSnapshot(accId, mKey) {
      const prev = this.state.theoreticalIncomesMonths?.[accId + '_' + mKey] || {};
      const snap = {};
      (this.state.incomes || []).forEach(inc => {
        if (inc.account_id !== accId) return;
        const row = this.incomeSnapshotRow(inc);
        const old = prev[inc.id];
        if (old && this.barèmeFrozen(inc, mKey)) row.amount = Number(old.amount) || 0;
        snap[inc.id] = row;
      });
      Object.keys(prev).forEach(id => {
        if (snap[id]) return;
        const old = prev[id];
        if (old && this.barèmeFrozen(old, mKey)) snap[id] = old;
      });
      return snap;
    },

    theoreticalSnapFingerprint(snap) {
      const keys = Object.keys(snap || {}).sort();
      return JSON.stringify(keys.map(k => {
        const r = snap[k] || {};
        return [k, Number(r.amount) || 0, r.category || '', !!r.is_wallet, r.end_date || null];
      }));
    },

    theoreticalIncomesSnapFingerprint(snap) {
      const keys = Object.keys(snap || {}).sort();
      return JSON.stringify(keys.map(k => {
        const r = snap[k] || {};
        return [k, Number(r.amount) || 0, r.description || '', Number(r.day) || 1, r.income_type || null];
      }));
    },

    // Total revenus théoriques d'un compte/mois (snapshot historique si présent, sinon revenus actuels)
    theoreticalIncomeTotalForAccount(accId, mKey) {
      const snap = this.state.theoreticalIncomesMonths?.[accId + '_' + mKey];
      if (snap && Object.keys(snap).length) {
        return Object.values(snap).reduce((s, r) => s + (Number(r.amount) || 0), 0);
      }
      if (mKey !== this.monthKey(new Date())) return 0;
      return (this.state.incomes || [])
        .filter(i => i.account_id === accId)
        .reduce((s, i) => s + (Number(i.amount) || 0), 0);
    },

    // Figé / met à jour le snapshot du mois courant pour chaque compte
    async syncCurrentTheoreticalSnapshots() {
      if (this._theoSnapSyncing) return;
      this._theoSnapSyncing = true;
      try {
        const mKey = this.monthKey(new Date());
        for (const acc of (this.state.accounts || [])) {
          const key = acc.id + '_' + mKey;
          const nextExp = this.buildTheoreticalSnapshot(acc.id, mKey);
          const prevExp = this.state.theoreticalMonths?.[key] || {};
          const nextInc = this.buildTheoreticalIncomesSnapshot(acc.id, mKey);
          const prevInc = this.state.theoreticalIncomesMonths?.[key] || {};
          const patch = {};
          if (this.theoreticalSnapFingerprint(prevExp) !== this.theoreticalSnapFingerprint(nextExp)) {
            patch.theoretical_expenses = nextExp;
          }
          if (this.theoreticalIncomesSnapFingerprint(prevInc) !== this.theoreticalIncomesSnapFingerprint(nextInc)) {
            patch.theoretical_incomes = nextInc;
          }
          if (!Object.keys(patch).length) continue;
          await withRetry(async () => {
            await this.upsertMonthRecord(acc.id, mKey, patch);
          }, 'snapshot budget théorique');
        }
      } finally {
        this._theoSnapSyncing = false;
      }
    },

    async logExpenseChange({ expenseId, accountId, changeType, oldAmount, newAmount, oldPayload, newPayload, monthKey }) {
      if (!accountId) return;
      try {
        const { error } = await supabaseApp.from('expense_change_log').insert([{
          expense_id: expenseId || null,
          account_id: accountId,
          change_type: changeType,
          old_amount: oldAmount != null ? Number(oldAmount) : null,
          new_amount: newAmount != null ? Number(newAmount) : null,
          old_payload: oldPayload || null,
          new_payload: newPayload || null,
          month_key: monthKey || this.monthKey(new Date()),
          changed_by: this.user?.id || null
        }]);
        if (error) console.warn('expense_change_log', error);
      } catch (e) {
        console.warn('expense_change_log', e);
      }
    },

    hasTheoreticalSnapshot(mKey, accFilter = '') {
      const ids = accFilter
        ? [accFilter]
        : (this.state.accounts || []).map(a => a.id);
      return ids.some(id => {
        const s = this.state.theoreticalMonths?.[id + '_' + mKey];
        return s && Object.keys(s).length > 0;
      });
    },

    // Totaux catégories depuis les snapshots (mois passés) — null si aucun snapshot
    categoryTotalsFromTheoreticalSnapshots(mKey, accFilter = '') {
      const ids = accFilter
        ? [accFilter]
        : (this.state.accounts || []).map(a => a.id);
      let any = false;
      const totals = {};
      ids.forEach(accId => {
        const snap = this.state.theoreticalMonths?.[accId + '_' + mKey];
        if (!snap || !Object.keys(snap).length) return;
        any = true;
        Object.values(snap).forEach(row => {
          const amt = Number(row.amount) || 0;
          if (amt <= 0) return;
          const cat = row.category || 'Autre';
          totals[cat] = (totals[cat] || 0) + amt;
        });
      });
      return any ? totals : null;
    },

    // --- Dépenses expirées (date de fin dépassée) ---
    isExpired(item) {
      if (!item?.end_date) return false;
      const today = new Date(); today.setHours(0,0,0,0);
      const end = new Date(item.end_date + 'T00:00:00');
      return end < today;
    },

    // --- Dépenses exceptionnelles (ponctuelles hors budget récurrent) ---
    // Stockées dans month_records.paid_expenses sous une clé synthétique `exc_<uuid>`
    // avec métadonnées (description, category, date). Pas d'entrée dans `expenses`.
    isExceptionalPaidKey(id) {
      return typeof id === 'string'
        && /^exc_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    },
    newExceptionalPaidKey() {
      const uuid = (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
          });
      return 'exc_' + uuid;
    },
    listExceptionalExpenses(accFilter, mKey) {
      const out = [];
      const accounts = accFilter
        ? this.state.accounts.filter(a => a.id === accFilter)
        : (this.state.accounts || []);
      accounts.forEach(acc => {
        const paidMap = this.state.months[acc.id + '_' + mKey] || {};
        Object.entries(paidMap).forEach(([id, rec]) => {
          if (!rec || !this.isExceptionalPaidKey(id)) return;
          if (!rec.exceptional && !rec.description) return;
          out.push({
            id,
            account_id: acc.id,
            amount: Number(rec.amount) || 0,
            description: rec.description || 'Dépense exceptionnelle',
            category: (rec.category || '').trim(),
            date: rec.date || null,
            day: Number(rec.day) || (rec.date ? Number(String(rec.date).slice(8, 10)) : 1),
            on: rec.on || null,
            exceptional: true
          });
        });
      });
      return out;
    },
    exceptionalAmountForAccount(accId, mKey, { maxDay = 31 } = {}) {
      return this.listExceptionalExpenses(accId, mKey)
        .filter(e => Number(e.day) <= maxDay)
        .reduce((s, e) => s + (Number(e.amount) || 0), 0);
    },
    openExceptionalSheet(prefs) {
      const p = prefs || {};
      if (this.verif) this.verif.pendingExceptionalOpId = p.pendingOpId || null;
      const mKey = p.mKey || this.todayViewKey();
      const defaultDate = p.date
        || (mKey === this.monthKey(new Date()) ? this._todayISO() : (mKey + '-01'));
      document.getElementById('exc-desc').value = p.desc || '';
      document.getElementById('exc-amount').value = p.amount != null && Number.isFinite(Number(p.amount))
        ? Math.abs(Number(p.amount)).toFixed(2)
        : '';
      document.getElementById('exc-date').value = defaultDate;
      const accSel = document.getElementById('exc-compte');
      const accs = this.state.accounts || [];
      const mainId = this.state.profile?.main_account_id;
      const pick = (p.accId && accs.some(a => a.id === p.accId))
        ? p.accId
        : ((mainId && accs.some(a => a.id === mainId)) ? mainId : (accs[0] && accs[0].id) || '');
      accSel.innerHTML = accs.map(a => `<option value="${a.id}">${this.esc(a.name)}</option>`).join('');
      if (pick) accSel.value = pick;
      const catSel = document.getElementById('exc-cat');
      const cats = [...new Set(this.state.expenses.map(e => e.category).filter(Boolean))].sort();
      catSel.innerHTML =
        `<option value="">— Aucune —</option>` +
        cats.map(c => `<option value="${this.esc(c)}">${this.esc(c)}</option>`).join('') +
        `<option value="__autres__">Autres…</option>`;
      catSel.value = p.category || '';
      document.getElementById('exc-cat-new').value = '';
      document.getElementById('exc-cat-new').style.display = 'none';
      this.presentOverlay('bh-exceptional-overlay');
    },
    closeExceptionalSheet() {
      document.getElementById('bh-exceptional-overlay').classList.remove('open', 'front');
      if (this.verif) this.verif.pendingExceptionalOpId = null;
    },
    onExceptionalCatSelect() {
      const isNew = document.getElementById('exc-cat').value === '__autres__';
      const inp = document.getElementById('exc-cat-new');
      inp.style.display = isNew ? 'block' : 'none';
      if (isNew) inp.focus();
    },
    async saveExceptionalExpense() {
      const desc = (document.getElementById('exc-desc').value || '').trim();
      const rawAmount = document.getElementById('exc-amount').value;
      const amount = Number(rawAmount);
      const dateStr = document.getElementById('exc-date').value;
      const accId = document.getElementById('exc-compte').value;
      const catVal = document.getElementById('exc-cat').value;
      let category = '';
      if (catVal === '__autres__') category = (document.getElementById('exc-cat-new').value || '').trim();
      else if (catVal) category = catVal;

      if (!desc) { toast('Indique un libellé pour la dépense.'); return; }
      if (rawAmount === '' || rawAmount == null || !Number.isFinite(amount) || amount <= 0) {
        toast('Le montant doit être un nombre positif.'); return;
      }
      if (!dateStr) { toast('Indique une date.'); return; }
      const d = new Date(dateStr + 'T00:00:00');
      if (isNaN(d.getTime())) { toast('Date invalide.'); return; }
      if (!accId || !this.state.accounts.some(a => a.id === accId)) {
        toast('Choisis un compte valide.'); return;
      }

      const mKey = this.monthKey(d);
      const day = d.getDate();
      const id = this.newExceptionalPaidKey();
      let recs = { ...(this.state.months[accId + '_' + mKey] || {}) };
      recs[id] = {
        amount,
        on: new Date().toISOString(),
        exceptional: true,
        description: desc,
        category: category || '',
        date: dateStr,
        day
      };

      const pendingOpId = this.verif?.pendingExceptionalOpId || null;

      await withRetry(async () => {
        await this.upsertMonthRecord(accId, mKey, { paid_expenses: recs });
        // Afficher le mois de la dépense si différent du mois AJD courant
        if (this.todayViewKey() !== mKey) {
          this.todayMonth = new Date(d.getFullYear(), d.getMonth(), 1);
        }
        // Depuis l’écran d’écarts : rattacher la ligne banque à cette exceptionnelle
        if (pendingOpId) {
          const op = this.findVerifOp(pendingOpId);
          if (op) {
            await this.verifCommitLink(op, {
              kind: 'expense', id, accId, exceptional: true,
              accName: (this.state.accounts.find(a => a.id === accId) || {}).name || '',
              label: desc, category: category || '', day,
              amount, paid: true, score: 100
            });
          }
          this.verif.pendingExceptionalOpId = null;
        }
        toast(pendingOpId ? 'Dépense exceptionnelle enregistrée et liée' : 'Dépense exceptionnelle enregistrée');
        this.closeExceptionalSheet();
        if (pendingOpId) this.refreshVerifUi();
        this.fetchData();
      }, 'enregistrement dépense exceptionnelle');
    },
    async deleteExceptionalExpense(excId, accId, mKeyOpt) {
      if (!this.isExceptionalPaidKey(excId)) return;
      const mKey = mKeyOpt || this.todayViewKey();
      if (!(this.state.months[accId + '_' + mKey] || {})[excId]) return;
      await this.commit('suppression dépense exceptionnelle', async () => {
        await this.deleteBankVerificationsForLink('expense', excId);
        await this.clearPaid('expense', excId, accId, mKey, { force: true });
      }, 'Dépense exceptionnelle supprimée');
    },

    markPaid(expId, amount, accId, mKeyOpt) {
      const mKey = mKeyOpt || this.todayViewKey();
      return this.commit('validation du paiement', async () => {
        await this.setPaid('expense', expId, accId, mKey, amount);
        if (typeof this.noteOwnApportReceived === 'function') await this.noteOwnApportReceived(expId, mKey, amount);
      }, 'Validé');
    },
    unmarkPaid(expId, accId, mKeyOpt) {
      const mKey = mKeyOpt || this.todayViewKey();
      return this.commit('annulation', async () => {
        await this.clearPaid('expense', expId, accId, mKey);
        if (typeof this.clearOwnApportReceived === 'function') await this.clearOwnApportReceived(expId, mKey);
      }, 'Validation annulée');
    },
    markIncome(incId, amount, accId, mKeyOpt) {
      const mKey = mKeyOpt || this.todayViewKey();
      return this.commit('encaissement du revenu', () => this.setPaid('income', incId, accId, mKey, amount), 'Revenu encaissé');
    },
    unmarkIncome(incId, accId, mKeyOpt) {
      const mKey = mKeyOpt || this.todayViewKey();
      return this.commit('annulation encaissement', () => this.clearPaid('income', incId, accId, mKey), 'Encaissement annulé');
    },

    // --- MONTANT DIFFÉRENT (validation avec un montant divergent) ---
    diffAmount: { expId: null, accId: null, baseAmount: 0, mode: 'temp', kind: 'expense', mKey: null, opId: null, linkKind: null, score: null },

    openDifferentAmount(expId, accId, kind = 'expense', opts = {}) {
      const mKey = opts.mKey || this.todayViewKey();
      const item = kind === 'income'
        ? this.state.incomes.find(i => i.id === expId)
        : this.findExpenseLike(expId, mKey);
      if (!item) return;
      const acc = this.state.accounts.find(a => a.id === accId);
      const isApport = !!item.is_apport || this.isApportExpenseId(expId);
      const prefAmount = (opts.amount != null && Number.isFinite(Number(opts.amount)))
        ? Number(opts.amount)
        : Number(item.amount);
      this.diffAmount = {
        expId, accId,
        baseAmount: Number(item.amount),
        mode: 'temp',
        kind,
        isApport,
        targetAccId: item.target_account_id || null,
        contributionMode: item.contribution_mode || 'fixed',
        mKey,
        opId: opts.opId || null,
        linkKind: opts.linkKind || (isApport ? 'apport' : kind),
        score: opts.score != null ? Number(opts.score) : null,
        markVerified: !!opts.markVerified
      };
      const titleEl = document.querySelector('#bh-diffamount-overlay .bh-sheet-title');
      if (titleEl) titleEl.textContent = opts.title || 'Montant différent';
      document.getElementById('da-desc').textContent =
        `${item.description} — ${acc ? acc.name : ''} · montant habituel ${this.fmt(item.amount)}`;
      document.getElementById('da-amount').value = prefAmount;
      const amountLabel = document.querySelector('#bh-diffamount-overlay .bh-field-label');
      if (amountLabel) {
        amountLabel.textContent = kind === 'income'
          ? 'Montant réellement encaissé (€)'
          : 'Montant réellement prélevé (€) — 0€ accepté';
      }
      const permBtn = document.getElementById('da-mode-perm');
      if (permBtn) {
        // Durable : OK pour apport fixe (met à jour la cible) ; masqué pour % / prorata
        const showPerm = !(isApport && (item.contribution_mode || 'fixed') !== 'fixed');
        permBtn.style.display = showPerm ? '' : 'none';
      }
      this.setDiffAmountMode('temp');
      this.presentOverlay('bh-diffamount-overlay');
    },

    closeDifferentAmount() {
      document.getElementById('bh-diffamount-overlay').classList.remove('open', 'front');
      const permBtn = document.getElementById('da-mode-perm');
      if (permBtn) permBtn.style.display = '';
      const titleEl = document.querySelector('#bh-diffamount-overlay .bh-sheet-title');
      if (titleEl) titleEl.textContent = 'Montant différent';
      this.diffAmount.opId = null;
      this.diffAmount.mKey = null;
      this.diffAmount.linkKind = null;
      this.diffAmount.score = null;
      this.diffAmount.markVerified = false;
    },

    setDiffAmountMode(mode) {
      this.diffAmount.mode = mode;
      document.getElementById('da-mode-temp').classList.toggle('active', mode === 'temp');
      document.getElementById('da-mode-perm').classList.toggle('active', mode === 'perm');
      const kind = this.diffAmount.kind || 'expense';
      const isApport = !!this.diffAmount.isApport;
      const inbound = (this.diffAmount.kind === 'inbound-apport');
      document.getElementById('da-mode-explain').textContent = inbound
        ? "Ponctuel : seul l'apport reçu ce mois-ci change. Le montant prévu ne bouge pas."
        : mode === 'temp'
        ? (kind === 'income'
          ? "Ponctuel : seul ce mois est modifié, le montant habituel reprendra le mois prochain. Utile si le salaire varie ce mois-ci."
          : isApport
            ? "Ponctuel : seul ce mois est modifié, la cible d'apport reprendra le mois prochain."
            : "Ponctuel : seul ce mois est modifié, le montant habituel reprendra le mois prochain. Utile pour vérifier s'il restera assez d'argent sur le compte ce mois-ci.")
        : (kind === 'income'
          ? "Durable : le montant habituel de ce revenu est mis à jour définitivement (tous les mois suivants)."
          : isApport
            ? "Durable : la cible d'apport mensuel est mise à jour définitivement."
            : "Durable : le montant habituel de cette dépense est mis à jour définitivement (tous les mois suivants).");
    },

    async confirmDifferentAmount() {
      const { expId, accId, mode, kind, opId, linkKind, score, markVerified } = this.diffAmount;
      const rawAmount = document.getElementById('da-amount').value;
      if (rawAmount === '' || rawAmount == null) { toast('Indique un montant.'); return; }
      const newAmount = Number(rawAmount);
      if (!Number.isFinite(newAmount)) { toast('Le montant doit être un nombre.'); return; }
      if (kind === 'inbound-apport') {
        if (!(newAmount > 0)) { toast('Le montant doit être un nombre positif.'); return; }
        const sharedAccId = this.diffAmount.accId;
        const payerId = this.diffAmount.payerId;
        const mKeyIn = this.diffAmount.mKey || this.comptesMKey();
        const res = await this.commit(
          'validation de l\'apport reçu',
          () => this.writeInboundApport(sharedAccId, payerId, mKeyIn, newAmount),
          'Apport validé'
        );
        if (res) {
          this.closeDifferentAmount();
          this.showEffInflows(sharedAccId);
        }
        return;
      }
      if (kind === 'income') {
        if (newAmount <= 0) { toast('Le montant doit être un nombre positif.'); return; }
      } else if (newAmount < 0) {
        toast('Le montant de la dépense ne peut pas être négatif (0€ accepté).');
        return;
      }

      await withRetry(async () => {
        const isApport = !!this.diffAmount.isApport || this.isApportExpenseId(expId);
        if (mode === 'perm') {
          if (isApport) {
            const targetAccId = this.diffAmount.targetAccId || (expId.startsWith('apport_') ? expId.slice('apport_'.length) : null);
            if (!targetAccId) throw new Error('Compte cible apport introuvable');
            const { error: e1 } = await supabaseApp.from('account_members')
              .update({ contribution_target: newAmount })
              .eq('account_id', targetAccId)
              .eq('user_id', this.user.id);
            if (e1) throw e1;
          } else {
            const table = kind === 'income' ? 'incomes' : 'expenses';
            const oldExp = kind === 'expense' ? this.state.expenses.find(e => e.id === expId) : null;
            const oldAmount = oldExp ? Number(oldExp.amount) : (kind === 'income' ? Number(this.state.incomes.find(i => i.id === expId)?.amount) : null);
            const { error: e1 } = await supabaseApp.from(table).update({ amount: newAmount }).eq('id', expId);
            if (e1) throw e1;
            const durKey = this.diffAmount.mKey || this.todayViewKey();
            if (kind === 'expense' && oldExp) this.holdFrozenBarème(accId, durKey, expId, oldExp, 'expense');
            if (kind === 'income') {
              const oldInc = this.state.incomes.find(i => i.id === expId);
              if (oldInc) this.holdFrozenBarème(accId, durKey, expId, oldInc, 'income');
            }
            if (kind === 'expense' && oldExp) {
              await this.logExpenseChange({
                expenseId: expId,
                accountId: accId,
                changeType: 'update_amount',
                oldAmount,
                newAmount,
                oldPayload: this.expenseSnapshotRow(oldExp),
                newPayload: this.expenseSnapshotRow({ ...oldExp, amount: newAmount }),
                monthKey: this.monthKey(new Date())
              });
              // Mettre à jour l'état local pour le snapshot immédiat
              oldExp.amount = newAmount;
            }
          }
        }
        const mKey = this.diffAmount.mKey || this.todayViewKey();
        if (kind === 'income') {
          await this.setPaid('income', expId, accId, mKey, newAmount);
          if (mode === 'perm') {
            const localInc = this.state.incomes.find(i => i.id === expId);
            if (localInc) localInc.amount = newAmount;
            await this.upsertMonthRecord(accId, mKey, { theoretical_incomes: this.buildTheoreticalIncomesSnapshot(accId, mKey) });
          }
          toast(mode === 'perm' ? "Montant mis à jour durablement et encaissé" : "Encaissé avec le montant ponctuel");
        } else {
          await this.setPaid('expense', expId, accId, mKey, newAmount);
          if (isApport && typeof this.noteOwnApportReceived === 'function') await this.noteOwnApportReceived(expId, mKey, newAmount);
          if (mode === 'perm' && !isApport) {
            await this.upsertMonthRecord(accId, mKey, { theoretical_expenses: this.buildTheoreticalSnapshot(accId, mKey) });
          }
          toast(mode === 'perm'
            ? (isApport ? "Cible d'apport mise à jour et validée" : "Montant mis à jour durablement et validé")
            : "Validé avec le montant ponctuel");
        }
        // Depuis le relevé Vérif : enregistrer aussi le rapprochement banque ↔ budget
        const lk = linkKind || (isApport ? 'apport' : kind);
        const itemLabel = (kind === 'income'
          ? this.state.incomes.find(i => i.id === expId)?.description
          : this.findExpenseLike(expId, mKey)?.description) || '';
        const fromVerif = !!(opId || markVerified);
        if (opId) {
          const op = this.findVerifOp(opId);
          if (op) {
            const accName = (this.state.accounts.find(a => a.id === accId) || {}).name || '';
            await this.verifCommitLink(op, {
              ...(op.match || {}),
              kind: lk, id: expId, accId, accName,
              label: itemLabel || op.match?.label || '',
              amount: newAmount, paid: true,
              score: score != null ? score : (op.match?.score || 100)
            });
          }
        } else if (markVerified) {
          // Validé manuellement depuis Vérif → compte comme vérifié
          await this.markManualVerified({ kind: lk, id: expId, accId, mKey, amount: newAmount, label: itemLabel });
        }
        this.closeDifferentAmount();
        if (fromVerif) this.refreshVerifUi();
        if (mode === 'perm' || !fromVerif) this.fetchData();
      }, 'montant différent');
    },

    // --- VALIDATION GROUPÉE (plusieurs dépenses, un montant global) ---
    pruneGroupSelect(mKey) {
      if (!this.groupSelect) this.groupSelect = {};
      Object.keys(this.groupSelect).forEach(expId => {
        const accId = this.groupSelect[expId];
        const exp = this.findExpenseLike(expId);
        if (!exp || exp.is_wallet || this.state.months[accId + '_' + mKey]?.[expId]) {
          delete this.groupSelect[expId];
        }
      });
    },

    toggleGroupSelect(expId, accId) {
      if (!this.groupSelect) this.groupSelect = {};
      if (this.groupSelect[expId]) {
        delete this.groupSelect[expId];
      } else {
        const selectedIds = Object.keys(this.groupSelect);
        if (selectedIds.length) {
          const firstAcc = this.groupSelect[selectedIds[0]];
          if (firstAcc !== accId) {
            toast('Regroupe uniquement des dépenses du même compte.');
            return;
          }
        }
        this.groupSelect[expId] = accId;
      }
      this.renderToday();
    },

    clearGroupSelect() {
      this.groupSelect = {};
      this.renderToday();
    },

    getGroupSelection() {
      const items = [];
      Object.entries(this.groupSelect || {}).forEach(([expId, accId]) => {
        const exp = this.findExpenseLike(expId);
        if (!exp || exp.is_wallet) return;
        items.push({ expId, accId, exp, amount: Number(exp.amount) || 0 });
      });
      return items;
    },

    renderGroupBar() {
      const bar = document.getElementById('bh-group-bar');
      if (!bar) return;
      const items = this.getGroupSelection();
      if (!items.length) {
        bar.classList.remove('open');
        bar.innerHTML = '';
        return;
      }
      const planned = items.reduce((s, it) => s + it.amount, 0);
      const canValidate = items.length >= 2;
      bar.classList.add('open');
      bar.innerHTML = `
        <div class="bh-group-bar-info">
          <strong>${items.length} dépense${items.length > 1 ? 's' : ''} sélectionnée${items.length > 1 ? 's' : ''}</strong>
          Prévu ${this.fmt(planned)}${canValidate ? '' : ' · sélectionne au moins 2'}
        </div>
        <button type="button" class="bh-btn bh-btn-ghost" onclick="BH.clearGroupSelect()">Annuler</button>
        <button type="button" class="bh-btn bh-btn-primary" ${canValidate ? '' : 'disabled'} onclick="BH.openGroupValidate()">Valider ensemble</button>`;
    },

    distributeGroupAmounts(items, globalAmount) {
      const n = items.length;
      if (!n) return [];
      const totalCents = Math.round(Number(globalAmount) * 100);
      const plannedSum = items.reduce((s, it) => s + Math.max(0, Number(it.amount) || 0), 0);
      if (plannedSum <= 0) {
        const base = Math.floor(totalCents / n);
        let rem = totalCents - base * n;
        return items.map((it, i) => ({
          expId: it.expId,
          amount: (base + (i < rem ? 1 : 0)) / 100
        }));
      }
      const shares = items.map(it => {
        const planned = Math.max(0, Number(it.amount) || 0);
        const exact = (planned / plannedSum) * totalCents;
        const floor = Math.floor(exact);
        return { expId: it.expId, floor, frac: exact - floor };
      });
      let assigned = shares.reduce((s, x) => s + x.floor, 0);
      let rem = totalCents - assigned;
      shares.sort((a, b) => b.frac - a.frac || a.expId.localeCompare(b.expId));
      for (let i = 0; i < rem; i++) shares[i].floor += 1;
      const byId = Object.fromEntries(shares.map(s => [s.expId, s.floor / 100]));
      return items.map(it => ({ expId: it.expId, amount: byId[it.expId] }));
    },

    openGroupValidate() {
      const items = this.getGroupSelection();
      if (items.length < 2) { toast('Sélectionne au moins 2 dépenses du même compte.'); return; }
      const accId = items[0].accId;
      const acc = this.state.accounts.find(a => a.id === accId);
      const planned = items.reduce((s, it) => s + it.amount, 0);
      this.groupValidateItems = items;
      document.getElementById('gv-desc').textContent =
        `${items.length} dépenses · ${acc ? acc.name : ''} · prévu ${this.fmt(planned)}`;
      document.getElementById('gv-list').innerHTML = items.map(it => `
        <div class="bh-info-row">
          <span>${this.esc(it.exp.description)}</span>
          <span class="num">${this.fmt(it.amount)}</span>
        </div>`).join('');
      document.getElementById('gv-amount').value = (Math.round(planned * 100) / 100).toFixed(2);
      this.refreshGroupValidatePreview();
      document.getElementById('bh-group-overlay').classList.add('open');
    },

    closeGroupValidate() {
      document.getElementById('bh-group-overlay').classList.remove('open');
    },

    refreshGroupValidatePreview() {
      const el = document.getElementById('gv-preview');
      if (!el) return;
      const items = this.groupValidateItems || [];
      const raw = document.getElementById('gv-amount')?.value;
      const amount = Number(raw);
      if (!items.length || raw === '' || !Number.isFinite(amount) || amount < 0) {
        el.innerHTML = '';
        return;
      }
      const dist = this.distributeGroupAmounts(items, amount);
      el.innerHTML = `<div style="font-size:11.5px; font-weight:700; color:var(--ink-faint); text-transform:uppercase; letter-spacing:0.04em; margin-bottom:6px;">Répartition</div>`
        + dist.map(d => {
          const it = items.find(x => x.expId === d.expId);
          return `<div class="bh-info-row"><span>${this.esc(it?.exp?.description || '')}</span><span class="num">${this.fmt(d.amount)}</span></div>`;
        }).join('');
    },

    async confirmGroupValidate() {
      const items = this.groupValidateItems || [];
      if (items.length < 2) { toast('Sélectionne au moins 2 dépenses.'); return; }
      const rawAmount = document.getElementById('gv-amount').value;
      if (rawAmount === '' || rawAmount == null) { toast('Indique un montant global.'); return; }
      const globalAmount = Number(rawAmount);
      if (!Number.isFinite(globalAmount) || globalAmount < 0) {
        toast('Le montant global doit être un nombre ≥ 0.');
        return;
      }
      const accId = items[0].accId;
      if (items.some(it => it.accId !== accId)) {
        toast('Toutes les dépenses doivent appartenir au même compte.');
        return;
      }
      const dist = this.distributeGroupAmounts(items, globalAmount);
      const mKey = this.todayViewKey();
      const entries = {};
      dist.forEach(d => { entries[d.expId] = { amount: d.amount, grouped: true }; });

      await this.commit('validation groupée', async () => {
        await this.setPaidMany('expense', accId, mKey, entries);
        if (typeof this.noteOwnApportReceived === 'function') {
          for (const [id, fields] of Object.entries(entries)) {
            if (this.isApportExpenseId(id)) await this.noteOwnApportReceived(id, mKey, fields.amount);
          }
        }
        this.groupSelect = {};
        this.groupValidateItems = [];
        this.closeGroupValidate();
      }, `${items.length} dépenses validées ensemble (${this.fmt(globalAmount)})`);
    },

    renderSaisies() {
      // Remplir le filtre catégorie (une seule fois par rendu, à partir des catégories existantes)
      const catSel = document.getElementById('bh-filter-cat');
      const cats = [...new Set(this.state.expenses.map(e => e.category).filter(Boolean))].sort();
      const prevVal = catSel.value;
      catSel.innerHTML = '<option value="">Toutes les catégories</option>' + cats.map(c => `<option value="${this.esc(c)}">${this.esc(c)}</option>`).join('');
      catSel.value = cats.includes(prevVal) ? prevVal : '';

      // Remplir le filtre compte
      const accSel = document.getElementById('bh-filter-acc');
      const prevAccVal = accSel.value;
      accSel.innerHTML = '<option value="">Tous les comptes</option>' + this.state.accounts.map(a => `<option value="${a.id}">${this.esc(a.name)}</option>`).join('');
      accSel.value = this.state.accounts.some(a=>a.id===prevAccVal) ? prevAccVal : '';

      const q = (document.getElementById('bh-search').value || '').trim().toLowerCase();
      const catFilter = catSel.value;
      const accFilter = accSel.value;
      const statusFilter = document.getElementById('bh-filter-status').value;

      const matches = (item, acc) => {
        if (catFilter && item.category !== catFilter) return false;
        if (accFilter && item.account_id !== accFilter) return false;
        if (statusFilter === 'expired' && !this.isExpired(item)) return false;
        if (statusFilter === 'active' && (this.isExpired(item) || !this.isExpenseActive(item))) return false;
        if (statusFilter === 'disabled' && this.isExpenseActive(item)) return false;
        if (statusFilter === 'wallet' && !item.is_wallet) return false;
        if (!q) return true;
        const hay = [item.description, item.category, acc?.name, String(item.amount)].filter(Boolean).join(' ').toLowerCase();
        return hay.includes(q);
      };

      const ordered = this.getOrderedAccounts();
      const expByAcc = new Map();
      const incByAcc = new Map();
      ordered.forEach(a => { expByAcc.set(a.id, []); incByAcc.set(a.id, []); });

      this.state.expenses.forEach(i => {
        const acc = this.state.accounts.find(a=>a.id===i.account_id);
        if (!matches(i, acc)) return;
        if (!expByAcc.has(i.account_id)) expByAcc.set(i.account_id, []);
        expByAcc.get(i.account_id).push(i);
      });
      this.state.incomes.forEach(i => {
        const acc = this.state.accounts.find(a=>a.id===i.account_id);
        if (!matches(i, acc)) return;
        if (!incByAcc.has(i.account_id)) incByAcc.set(i.account_id, []);
        incByAcc.get(i.account_id).push(i);
      });

      const rowExpense = (i, acc) => {
        const expiredCls = this.isExpired(i) ? ' bh-expired' : '';
        const disabled = !this.isExpenseActive(i);
        return `<div class="bh-manage-row${expiredCls}" style="${disabled ? 'opacity:0.65;' : ''}" onclick="BH.openEditSheet('expense','${i.id}')">
          <div><div class="bh-manage-row-desc" style="font-weight:600;font-size:14px;">${i.is_wallet ? '👛 ' : ''}${this.esc(i.description)}${disabled ? ' <span class="bh-pill" style="background:var(--line); color:var(--ink-faint); font-size:10px;">Désactivé</span>' : ''}</div><div style="font-size:11px;color:var(--ink-faint);">${i.is_wallet ? (disabled ? 'Portefeuille désactivé' : 'Portefeuille mensuel') : 'Le '+i.day}${i.category ? ' · '+this.esc(i.category) : ''}${this.isExpired(i) ? ' · ⚠️ Expirée le '+this.fmtDate(i.end_date) : ''}</div></div>
          <div class="num">${this.fmt(i.amount)}</div>
        </div>`;
      };
      const rowIncome = (i) => `<div class="bh-manage-row" onclick="BH.openEditSheet('income','${i.id}')">
          <div><div style="font-weight:600;font-size:14px;">${this.esc(i.description)}${i.income_type === 'remboursement' ? ' <span class="bh-pill" style="background:var(--gold-pale); color:var(--gold); font-size:10px;">Remboursement</span>' : ''}</div><div style="font-size:11px;color:var(--ink-faint);">${i.day ? 'Le '+i.day : 'Revenu'}</div></div>
          <div class="num" style="color:var(--sage-deep);">${this.fmt(i.amount)}</div>
        </div>`;

      const buildGroups = (byAcc, rowFn) => {
        let html = '';
        let any = false;
        ordered.forEach(acc => {
          const items = (byAcc.get(acc.id) || []).slice().sort((a,b) => {
            const aOff = this.isExpenseActive(a) ? 0 : 1;
            const bOff = this.isExpenseActive(b) ? 0 : 1;
            if (aOff !== bOff) return aOff - bOff;
            if (!!a.is_wallet !== !!b.is_wallet) return a.is_wallet ? 1 : -1;
            return (Number(a.day)||0) - (Number(b.day)||0);
          });
          if (!items.length) return;
          any = true;
          const total = items.reduce((s,x)=>s+(Number(x.amount)||0), 0);
          html += `<div class="bh-manage-group">
            <div class="bh-manage-group-title"><span>${this.esc(acc.name)}</span><span class="num">${this.fmt(total)} · ${items.length}</span></div>
            ${items.map(i => rowFn(i, acc)).join('')}
          </div>`;
        });
        // Comptes orphelins (plus dans la liste)
        byAcc.forEach((items, accId) => {
          if (ordered.some(a => a.id === accId) || !items.length) return;
          any = true;
          const total = items.reduce((s,x)=>s+(Number(x.amount)||0), 0);
          html += `<div class="bh-manage-group">
            <div class="bh-manage-group-title"><span>Compte inconnu</span><span class="num">${this.fmt(total)}</span></div>
            ${items.map(i => rowFn(i, null)).join('')}
          </div>`;
        });
        return any ? html : '<div class="bh-empty">Rien (ou aucun résultat)</div>';
      };

      document.getElementById('bh-expenses-groups').innerHTML = buildGroups(expByAcc, rowExpense);
      document.getElementById('bh-incomes-groups').innerHTML = buildGroups(incByAcc, rowIncome);
    },
    openAddSheet() {
      this.sheetEditId = null;
      if (this.verif) this.verif.pendingEntryOpId = null;
      document.getElementById('bh-sheet-title').textContent = "Ajouter";
      document.getElementById('f-desc').value = '';
      document.getElementById('f-amount').value = '';
      document.getElementById('f-wallet').checked = false;
      document.getElementById('f-refund').checked = false;
      document.getElementById('f-enddate').value = '';
      const delBtn = document.getElementById('bh-delete-btn');
      delBtn.style.display = 'none';
      delBtn.textContent = 'Supprimer';
      document.getElementById('bh-duplicate-btn').style.display = 'none';
      this.populateSheetSelects();
      this.updateSheetForm();
      this.presentOverlay('bh-sheet-overlay');
    },

    openEditSheet(type, id) {
      this.sheetEditId = id;
      document.getElementById('f-type').value = type;
      const item = (type === 'expense' ? this.state.expenses : this.state.incomes).find(i=>i.id===id);
      if(!item) return;
      
      const acc = this.state.accounts.find(a=>a.id === item.account_id);
      document.getElementById('bh-sheet-title').textContent = "Modifier";
      document.getElementById('f-desc').value = item.description;
      document.getElementById('f-amount').value = item.amount;
      document.getElementById('f-day').value = item.day;
      this.populateSheetSelects(acc ? acc.id : '', type === 'expense' ? (item.category || '') : '');
      if(type==='expense') {
        document.getElementById('f-wallet').checked = !!item.is_wallet;
        document.getElementById('f-enddate').value = item.end_date || '';
        document.getElementById('f-refund').checked = false;
      } else {
        document.getElementById('f-refund').checked = item.income_type === 'remboursement';
      }
      const delBtn = document.getElementById('bh-delete-btn');
      delBtn.style.display = 'flex';
      if (type === 'expense' && item.is_wallet) {
        delBtn.textContent = this.isExpenseActive(item) ? 'Désactiver' : 'Réactiver';
      } else {
        delBtn.textContent = 'Supprimer';
      }
      
      this.updateSheetForm();
      if(type==='expense' && item.payer_id) {
         // Délai pour laisser le checkPayerField s'exécuter
         setTimeout(() => document.getElementById('f-payer').value = item.payer_id, 50);
      }
      document.getElementById('bh-duplicate-btn').style.display = 'flex';
      this.presentOverlay('bh-sheet-overlay');
    },

    // Remplit les listes déroulantes Compte / Catégorie du formulaire saisie
    populateSheetSelects(selectedAccId, selectedCat) {
      const accSel = document.getElementById('f-compte');
      const accs = this.state.accounts;
      const mainId = this.state.profile?.main_account_id;
      const pickAcc = selectedAccId || mainId || (accs[0] && accs[0].id) || '';
      accSel.innerHTML =
        accs.map(a => `<option value="${a.id}">${this.esc(a.name)}</option>`).join('') +
        `<option value="__new__">＋ Nouveau compte</option>`;
      if (pickAcc && accs.some(a => a.id === pickAcc)) accSel.value = pickAcc;
      else if (accs.length) accSel.value = accs[0].id;
      else accSel.value = '__new__';
      document.getElementById('f-compte-new').value = '';
      this.onCompteSelect();

      const catSel = document.getElementById('f-cat');
      const cats = [...new Set(this.state.expenses.map(e => e.category).filter(Boolean))].sort();
      const pickCat = selectedCat && cats.includes(selectedCat) ? selectedCat : (cats[0] || '');
      catSel.innerHTML =
        cats.map(c => `<option value="${this.esc(c)}">${this.esc(c)}</option>`).join('') +
        `<option value="__autres__">Autres…</option>`;
      if (selectedCat && !cats.includes(selectedCat)) {
        // Catégorie orpheline (édition) : l'ajouter temporairement
        catSel.insertAdjacentHTML('afterbegin', `<option value="${this.esc(selectedCat)}">${this.esc(selectedCat)}</option>`);
        catSel.value = selectedCat;
      } else if (pickCat) {
        catSel.value = pickCat;
      } else {
        catSel.value = '__autres__';
      }
      document.getElementById('f-cat-new').value = '';
      this.onCatSelect();
    },

    onCompteSelect() {
      const isNew = document.getElementById('f-compte').value === '__new__';
      const inp = document.getElementById('f-compte-new');
      inp.style.display = isNew ? 'block' : 'none';
      if (isNew) inp.focus();
      this.checkPayerField();
    },

    onCatSelect() {
      const isNew = document.getElementById('f-cat').value === '__autres__';
      const inp = document.getElementById('f-cat-new');
      inp.style.display = isNew ? 'block' : 'none';
      if (isNew) inp.focus();
    },

    async duplicateEntry() {
      if (!this.sheetEditId) return;
      const type = this.sheetMode;
      const table = type === 'expense' ? 'expenses' : 'incomes';
      const source = (type === 'expense' ? this.state.expenses : this.state.incomes).find(i=>i.id===this.sheetEditId);
      if (!source) return;
      const { id, created_at, ...rest } = source;
      rest.description = rest.description + ' (copie)';
      const mKey = this.monthKey(new Date());
      await withRetry(async () => {
        const { data, error } = await supabaseApp.from(table).insert([rest]).select('id').single();
        if (error) throw error;
        if (type === 'expense' && data?.id) {
          const created = { id: data.id, ...rest };
          this.state.expenses.push(created);
          await this.logExpenseChange({
            expenseId: data.id,
            accountId: rest.account_id,
            changeType: 'create',
            oldAmount: null,
            newAmount: Number(rest.amount),
            oldPayload: null,
            newPayload: this.expenseSnapshotRow(created),
            monthKey: mKey
          });
          await this.upsertMonthRecord(rest.account_id, mKey, {
            theoretical_expenses: this.buildTheoreticalSnapshot(rest.account_id, mKey)
          });
        } else if (type === 'income' && data?.id) {
          this.state.incomes.push({ id: data.id, ...rest });
          await this.upsertMonthRecord(rest.account_id, mKey, {
            theoretical_incomes: this.buildTheoreticalIncomesSnapshot(rest.account_id, mKey)
          });
        }
        toast("Entrée dupliquée");
        this.closeSheet();
        this.fetchData();
      }, 'duplication');
    },

    updateSheetForm() {
       const type = document.getElementById('f-type').value;
       this.sheetMode = type;
       document.getElementById('f-cat-wrap').style.display = (type === 'expense') ? 'block' : 'none';
       document.getElementById('f-wallet-wrap').style.display = (type === 'expense') ? 'block' : 'none';
       document.getElementById('f-refund-wrap').style.display = (type === 'income') ? 'flex' : 'none';
       document.getElementById('f-enddate-wrap').style.display = (type === 'expense') ? 'block' : 'none';
       const isWallet = type === 'expense' && document.getElementById('f-wallet').checked;
       document.getElementById('f-day-wrap').style.display = isWallet ? 'none' : 'block';
       document.getElementById('f-amount-hint').textContent = isWallet ? '(budget mensuel)' : '';
       this.checkPayerField();
    },

    checkPayerField() {
      const wrap = document.getElementById('f-payer-wrap');
      if (this.sheetMode !== 'expense') { wrap.style.display = 'none'; return; }
      
      const accVal = document.getElementById('f-compte').value;
      const acc = accVal && accVal !== '__new__'
        ? this.state.accounts.find(a => a.id === accVal)
        : null;
      
      wrap.style.display = 'block'; // Toujours afficher la case dorée pour rassurer l'utilisateur
      const sel = document.getElementById('f-payer');

      if (acc) {
         const mems = this.state.members.filter(m => m.account_id === acc.id);
         if (mems.length > 1) {
            sel.disabled = false;
            sel.innerHTML = `<option value="">Prélevé sur le compte commun (Défaut)</option>` + 
                            mems.map(m => `<option value="${m.user_id}">Avancé par : ${m.profiles?.display_name || 'Membre'}</option>`).join('');
         } else {
            sel.disabled = true;
            sel.innerHTML = `<option value="">Seul sur ce compte (Invitez un membre pour l'avance)</option>`;
         }
      } else {
         sel.disabled = true;
         sel.innerHTML = `<option value="">${accVal === '__new__' ? 'Compte en cours de création' : 'Sélectionnez un compte valide d\'abord'}</option>`;
      }
    },

    closeSheet() {
      document.getElementById('bh-sheet-overlay').classList.remove('open', 'front');
      if (this.verif) this.verif.pendingEntryOpId = null;
    },

    async saveEntry() {
      const type = this.sheetMode;
      const desc = document.getElementById('f-desc').value.trim();
      const amount = Number(document.getElementById('f-amount').value);
      const isWallet = type === 'expense' && document.getElementById('f-wallet').checked;
      const day = isWallet ? 1 : (Number(document.getElementById('f-day').value) || 1);
      const accVal = document.getElementById('f-compte').value;
      const payerId = document.getElementById('f-payer').value;
      const endDate = document.getElementById('f-enddate').value || null;

      // --- Validation des entrées ---
      if (!desc) { toast("Merci d'indiquer une description."); return; }
      if (!amount || isNaN(amount) || amount <= 0) { toast("Le montant doit être un nombre positif."); return; }
      if (!isWallet && (day < 1 || day > 31)) { toast("Le jour doit être compris entre 1 et 31."); return; }

      let accId = null;
      if (accVal === '__new__') {
        const newName = document.getElementById('f-compte-new').value.trim();
        if (!newName) { toast("Indiquez un nom pour le nouveau compte."); return; }
        const dup = this.state.accounts.some(a => a.name.trim().toLowerCase() === newName.toLowerCase());
        if (dup) { toast("Un compte porte déjà ce nom."); return; }
        accId = await this.createAccountInline(newName);
        if (!accId) return;
      } else {
        const acc = this.state.accounts.find(a => a.id === accVal);
        if (!acc) { toast("Compte invalide : choisissez un compte existant."); return; }
        accId = acc.id;
      }

      let category = 'Autre';
      if (type === 'expense') {
        const catVal = document.getElementById('f-cat').value;
        if (catVal === '__autres__') {
          category = document.getElementById('f-cat-new').value.trim() || 'Autre';
        } else {
          category = catVal || 'Autre';
        }
      }

      const payload = {
         account_id: accId, description: desc, amount: amount, day: day
      };
      if(type === 'expense') {
         payload.category = category;
         payload.payer_id = payerId || null;
         payload.is_wallet = isWallet;
         payload.end_date = endDate;
      } else {
         payload.income_type = document.getElementById('f-refund').checked ? 'remboursement' : null;
      }

      const table = type === 'expense' ? 'expenses' : 'incomes';
      const pendingOpId = this.verif?.pendingEntryOpId || null;
      const wasEdit = !!this.sheetEditId;
      const mKey = this.monthKey(new Date());
      const oldExp = (type === 'expense' && this.sheetEditId)
        ? this.state.expenses.find(e => e.id === this.sheetEditId)
        : null;
      const previousAccId = oldExp?.account_id || null;
      
      await withRetry(async () => {
        let error;
        let savedId = this.sheetEditId;
        if (this.sheetEditId) {
           ({ error } = await supabaseApp.from(table).update(payload).eq('id', this.sheetEditId));
        } else {
           const res = await supabaseApp.from(table).insert([payload]).select('id').single();
           error = res.error;
           savedId = res.data?.id;
        }
        if (error) throw error;

        if (type === 'expense') {
          if (oldExp) this.holdFrozenBarème(oldExp.account_id, mKey, savedId, oldExp, 'expense');
          if (oldExp) {
            const amountChanged = Number(oldExp.amount) !== Number(amount);
            const metaChanged = (oldExp.category || '') !== (payload.category || '')
              || !!oldExp.is_wallet !== !!payload.is_wallet
              || (oldExp.description || '') !== desc
              || Number(oldExp.day) !== Number(day)
              || (oldExp.end_date || null) !== (endDate || null)
              || previousAccId !== accId;
            if (amountChanged || metaChanged) {
              await this.logExpenseChange({
                expenseId: savedId,
                accountId: accId,
                changeType: amountChanged ? 'update_amount' : 'update_meta',
                oldAmount: Number(oldExp.amount),
                newAmount: Number(amount),
                oldPayload: this.expenseSnapshotRow(oldExp),
                newPayload: this.expenseSnapshotRow({ ...payload, id: savedId }),
                monthKey: mKey
              });
            }
            Object.assign(oldExp, payload);
          } else if (savedId) {
            const created = { id: savedId, ...payload };
            this.state.expenses.push(created);
            await this.logExpenseChange({
              expenseId: savedId,
              accountId: accId,
              changeType: 'create',
              oldAmount: null,
              newAmount: Number(amount),
              oldPayload: null,
              newPayload: this.expenseSnapshotRow(created),
              monthKey: mKey
            });
          }
          await this.upsertMonthRecord(accId, mKey, {
            theoretical_expenses: this.buildTheoreticalSnapshot(accId, mKey)
          });
          if (previousAccId && previousAccId !== accId) {
            await this.upsertMonthRecord(previousAccId, mKey, {
              theoretical_expenses: this.buildTheoreticalSnapshot(previousAccId, mKey)
            });
          }
        } else if (type === 'income') {
          const oldInc = this.sheetEditId
            ? this.state.incomes.find(i => i.id === this.sheetEditId)
            : null;
          const previousIncAccId = oldInc?.account_id || null;
          if (oldInc) this.holdFrozenBarème(oldInc.account_id, mKey, savedId, oldInc, 'income');
          if (oldInc) Object.assign(oldInc, payload);
          else if (savedId) this.state.incomes.push({ id: savedId, ...payload });
          await this.upsertMonthRecord(accId, mKey, {
            theoretical_incomes: this.buildTheoreticalIncomesSnapshot(accId, mKey)
          });
          if (previousIncAccId && previousIncAccId !== accId) {
            await this.upsertMonthRecord(previousIncAccId, mKey, {
              theoretical_incomes: this.buildTheoreticalIncomesSnapshot(previousIncAccId, mKey)
            });
          }
        }

        // Créée depuis une ligne du relevé : valider + lier à cette ligne
        let linked = false;
        if (pendingOpId && !wasEdit && savedId && !isWallet) {
          linked = await this.linkNewEntryToVerifOp(pendingOpId, type, savedId, accId, amount, desc, category, day);
        }

        toast(linked ? 'Enregistré, validé et lié au relevé' : 'Enregistré');
        this.closeSheet();
        if (linked) this.refreshVerifUi();
        this.fetchData();
      }, 'enregistrement');
    },
    async linkNewEntryToVerifOp(opId, type, entryId, accId, amount, desc, category, day) {
      const op = this.findVerifOp(opId);
      if (!op || !accId) return false;
      const match = {
        kind: type === 'income' ? 'income' : 'expense',
        id: entryId, accId,
        accName: (this.state.accounts.find(a => a.id === accId) || {}).name || '',
        label: desc,
        category: type === 'expense' ? (category || '') : '',
        day,
        budgetAmount: Number(amount),
        score: 100
      };
      await this.verifCommitLink(op, match, { markPaid: true, paidAmount: Math.abs(Number(op.amount)) });
      return true;
    },

    // Création de compte depuis le formulaire saisie (retourne l'id, ou null si échec)
    async createAccountInline(name) {
      const newId = crypto.randomUUID();
      const ok = await withRetry(async () => {
        const { error: e1 } = await supabaseApp.from('accounts').insert([{ id: newId, name: name }]);
        if (e1) throw e1;
        const { error: e2 } = await supabaseApp.from('account_members').insert([{ account_id: newId, user_id: this.user.id, role: 'owner' }]);
        if (e2) throw e2;
        return true;
      }, 'création du compte');
      if (!ok) return null;
      // Mise à jour locale immédiate pour enchaîner sur l'enregistrement de la saisie
      this.state.accounts.push({ id: newId, name });
      this.state.members.push({ account_id: newId, user_id: this.user.id, role: 'owner' });
      return newId;
    },

    async deleteEntry() {
       const table = this.sheetMode === 'expense' ? 'expenses' : 'incomes';
       const mKey = this.monthKey(new Date());
       const oldExp = this.sheetMode === 'expense'
         ? this.state.expenses.find(e => e.id === this.sheetEditId)
         : null;
       const oldInc = this.sheetMode === 'income'
         ? this.state.incomes.find(i => i.id === this.sheetEditId)
         : null;

       // Portefeuille : soft-désactivation (pas de hard delete → pas de txs fantômes)
       if (oldExp?.is_wallet) {
         const activating = !this.isExpenseActive(oldExp);
         const ok = confirm(activating
           ? `Réactiver le portefeuille « ${oldExp.description} » ?`
           : `Désactiver le portefeuille « ${oldExp.description} » ?\n\nL'historique des mouvements est conservé. Il n'apparaîtra plus comme enveloppe active.`);
         if (!ok) return;
         await withRetry(async () => {
           const { error } = await supabaseApp.from('expenses')
             .update({ active: activating })
             .eq('id', oldExp.id);
           if (error) throw error;
           // Pas de cleanup bank_verifications : les wallet_transactions restent (historique + rapprochements valides)
           oldExp.active = activating;
           await this.logExpenseChange({
             expenseId: oldExp.id,
             accountId: oldExp.account_id,
             changeType: 'update_meta',
             oldAmount: Number(oldExp.amount),
             newAmount: Number(oldExp.amount),
             oldPayload: this.expenseSnapshotRow({ ...oldExp, active: !activating }),
             newPayload: this.expenseSnapshotRow(oldExp),
             monthKey: mKey
           });
           await this.upsertMonthRecord(oldExp.account_id, mKey, {
             theoretical_expenses: this.buildTheoreticalSnapshot(oldExp.account_id, mKey)
           });
           toast(activating ? 'Portefeuille réactivé' : 'Portefeuille désactivé');
           this.closeSheet();
           this.fetchData();
         }, activating ? 'réactivation portefeuille' : 'désactivation portefeuille');
         return;
       }

       await withRetry(async () => {
         const frozenExp = oldExp && this.barèmeFrozen(oldExp, mKey);
         const frozenInc = oldInc && this.barèmeFrozen(oldInc, mKey);
         if (oldExp) this.holdFrozenBarème(oldExp.account_id, mKey, oldExp.id, oldExp, 'expense');
         if (oldInc) this.holdFrozenBarème(oldInc.account_id, mKey, oldInc.id, oldInc, 'income');
         if (oldExp && !frozenExp) {
           await this.deleteBankVerificationsForLinkMonth('expense', oldExp.id, mKey);
           await this.clearPaid('expense', oldExp.id, oldExp.account_id, mKey);
         }
         if (oldInc && !frozenInc) {
           await this.deleteBankVerificationsForLinkMonth('income', oldInc.id, mKey);
           await this.clearPaid('income', oldInc.id, oldInc.account_id, mKey);
         }
         const { error } = await supabaseApp.from(table).delete().eq('id', this.sheetEditId);
         if (error) throw error;
         if (oldExp) {
           await this.logExpenseChange({
             expenseId: oldExp.id,
             accountId: oldExp.account_id,
             changeType: 'delete',
             oldAmount: Number(oldExp.amount),
             newAmount: null,
             oldPayload: this.expenseSnapshotRow(oldExp),
             newPayload: null,
             monthKey: mKey
           });
           this.state.expenses = this.state.expenses.filter(e => e.id !== oldExp.id);
           await this.upsertMonthRecord(oldExp.account_id, mKey, {
             theoretical_expenses: this.buildTheoreticalSnapshot(oldExp.account_id, mKey)
           });
         }
         if (oldInc) {
           this.state.incomes = this.state.incomes.filter(i => i.id !== oldInc.id);
           await this.upsertMonthRecord(oldInc.account_id, mKey, {
             theoretical_incomes: this.buildTheoreticalIncomesSnapshot(oldInc.account_id, mKey)
           });
         }
         toast("Supprimé");
         this.closeSheet();
         this.fetchData();
       }, 'suppression');
    },

    async enableNotifications() {
       if (!('Notification' in window)) { toast("Notifications non supportées sur ce navigateur."); return; }
       const perm = await Notification.requestPermission();
       const btn = document.getElementById('bh-notif-btn');
       if (perm === 'granted') {
          btn.textContent = '✅ Rappels activés';
          localStorage.setItem('bh-notif-enabled', '1');
          this.checkDueNotifications();
       } else {
          toast("Permission refusée dans le navigateur.");
       }
    },

    // Vérifie les dépenses proches de l'échéance et déclenche une notification locale (une seule fois par jour/entrée)
    checkDueNotifications() {
       if (!('Notification' in window) || Notification.permission !== 'granted') return;
       const now = new Date();
       const dim = new Date(now.getFullYear(), now.getMonth()+1, 0).getDate();
       const mKey = this.monthKey(now);
       const sentKey = 'bh-notif-sent-' + mKey + '-' + now.getDate();
       const alreadySent = JSON.parse(localStorage.getItem(sentKey) || '[]');
       const newlySent = [...alreadySent];

       this.state.expenses.forEach(exp => {
          if (exp.is_wallet) return; // pas de date d'échéance unique pour un portefeuille
          const acc = this.state.accounts.find(a => a.id === exp.account_id);
          if (!acc) return;
          const paidRec = this.state.months[acc.id + '_' + mKey]?.[exp.id];
          if (paidRec) return; // déjà réglé
          const diff = Math.min(exp.day, dim) - now.getDate();
          if (diff >= 0 && diff <= 2 && !alreadySent.includes(exp.id)) {
             const lbl = diff === 0 ? "aujourd'hui" : `dans ${diff} j`;
             try {
               new Notification('Facture à venir', { body: `${exp.description} (${this.fmt(exp.amount)}) — échéance ${lbl}.`, tag: exp.id });
             } catch(e) { console.log(e); }
             newlySent.push(exp.id);
          }
       });
       localStorage.setItem(sentKey, JSON.stringify(newlySent));
    },
});
