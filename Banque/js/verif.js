Object.assign(BH, {
    // --- VÉRIFICATION RELEVÉ BANCAIRE ---
    verifIgnoredKey() {
      return 'bh-verif-ignored-' + (this.user?.id || 'anon');
    },
    loadVerifIgnored() {
      try { return new Set(JSON.parse(localStorage.getItem(this.verifIgnoredKey()) || '[]')); }
      catch { return new Set(); }
    },
    saveVerifIgnored(set) {
      localStorage.setItem(this.verifIgnoredKey(), JSON.stringify([...set]));
    },
    verifBaseFingerprint(op) {
      return [op.date || '', Number(op.amount).toFixed(2), (op.label || '').slice(0, 60).toLowerCase()].join('|');
    },
    // Opérations identiques le même jour : la 1re garde l’empreinte historique, les suivantes reçoivent #2, #3…
    assignVerifFingerprints(ops) {
      const seen = new Map();
      (ops || []).forEach(o => {
        const base = this.verifBaseFingerprint(o);
        const n = (seen.get(base) || 0) + 1;
        seen.set(base, n);
        o.fp = n === 1 ? base : base + '#' + n;
      });
      return ops;
    },
    verifFingerprint(op) {
      return op?.fp || this.verifBaseFingerprint(op || {});
    },
    verifLinkKey(kind, id) {
      const k = String(kind || '');
      const v = String(id ?? '');
      if (k === 'expense' || k === 'apport' || k === 'exceptional') return 'e:' + v;
      if (k === 'income' || k === 'refund') return 'i:' + v;
      if (k === 'wallet') return 'w:' + v;
      return k + ':' + v;
    },
    verifRowLinkKey(v) {
      if (!v || v.status === 'ignored' || !v.linked_kind || v.linked_id == null) return null;
      if (v.linked_kind === 'wallet') {
        return this.verifLinkKey('wallet', v.meta?.tx_id || v.meta?.wallet_tx_id || v.linked_id);
      }
      return this.verifLinkKey(v.linked_kind, v.linked_id);
    },
    isManualVerifRow(v) {
      return !!(v?.meta?.manual || v?.meta?.app_only);
    },
    getBankVerifsForMonth(mKey) {
      return (this.state.bankVerifications || []).filter(v => v.month_key === mKey);
    },
    bankVerifByFingerprint(mKey) {
      const map = new Map();
      this.getBankVerifsForMonth(mKey).forEach(v => { if (v.fingerprint) map.set(v.fingerprint, v); });
      return map;
    },
    verifiedLinkedSets(mKey) {
      const expense = new Set();
      const income = new Set();
      const refund = new Set();
      const wallet = new Set();
      const manual = new Set();
      this.getBankVerifsForMonth(mKey).forEach(v => {
        if (v.status === 'ignored') return;
        if (this.isManualVerifRow(v)) {
          const mk = this.verifRowLinkKey(v);
          if (mk) manual.add(mk);
        }
        const id = v.linked_id != null ? String(v.linked_id) : '';
        if ((v.linked_kind === 'expense' || v.linked_kind === 'apport') && id) expense.add(id);
        if (v.linked_kind === 'income' && id) income.add(id);
        if (v.linked_kind === 'wallet' && id) wallet.add(id);
        if (v.linked_kind === 'refund' && id) {
          refund.add(id);
          income.add(id);
        }
        const refundOf = v.meta && v.meta.refund_of;
        if (refundOf) expense.add(String(refundOf));
        const walletTx = v.meta && (v.meta.tx_id || v.meta.wallet_tx_id);
        if (walletTx) wallet.add(String(walletTx));
      });
      return { expense, income, refund, wallet, manual };
    },
    walletVerifLink(m) {
      // Mouvement portefeuille : linked_id = id de la transaction, meta.exp_id = enveloppe
      const txId = m?.kind === 'wallet' ? m.id : null;
      const expId = m?.expId || (m?.kind === 'wallet-budget' ? m.id : null);
      return {
        kind: 'wallet',
        id: txId || expId,
        accId: m?.accId,
        score: m?.score,
        meta: {
          exp_id: expId || null,
          tx_id: txId && txId !== 'new' ? txId : null
        }
      };
    },
    verifiedExpenseIds(mKey) {
      return this.verifiedLinkedSets(mKey).expense;
    },
    isExpenseVerified(expId, mKey) {
      return this.verifiedExpenseIds(mKey).has(String(expId));
    },
    isIncomeRefund(inc, mKey) {
      if (!inc) return false;
      if (inc.income_type === 'remboursement' || /^remb\.?\s/i.test(inc.description || '')) return true;
      const paid = this.state.monthsIncomes?.[inc.account_id + '_' + mKey]?.[inc.id];
      return !!(paid && paid.refund_of);
    },
    // Remboursement créé depuis le relevé : ponctuel, sauf s'il est encaissé ce mois-ci.
    verifIncomeBelongsToMonth(inc, mKey) {
      if (!inc) return false;
      const paid = !!(this.state.monthsIncomes?.[inc.account_id + '_' + mKey] || {})[inc.id];
      const typedRefund = inc.income_type === 'remboursement' || /^remb\.?\s/i.test(inc.description || '');
      if (!typedRefund) return true;
      if (paid) return true;
      const created = String(inc.created_at || '').slice(0, 7);
      if (!/^\d{4}-\d{2}$/.test(created)) return true;
      return created === mKey;
    },
    patchLocalBankVerif(row) {
      this._localMutAt = Date.now();
      const list = (this.state.bankVerifications || []).slice();
      const i = list.findIndex(v =>
        v.user_id === row.user_id && v.month_key === row.month_key && v.fingerprint === row.fingerprint
      );
      if (i >= 0) list[i] = { ...list[i], ...row };
      else list.push(row);
      this.state.bankVerifications = list;
    },
    removeLocalBankVerif(mKey, fingerprint) {
      this._localMutAt = Date.now();
      this.state.bankVerifications = (this.state.bankVerifications || []).filter(v =>
        !(v.month_key === mKey && v.fingerprint === fingerprint)
      );
    },
    // --- VÉRIF : noyau persistance (bank_verifications + validations du mois) ---
    verifMonthKey(op) {
      return this.verif.mKey || (op?.date || '').slice(0, 7) || this.monthKey(new Date());
    },
    buildBankVerifRow(op, status, link) {
      return {
        user_id: this.user.id,
        month_key: this.verifMonthKey(op),
        bank_account_id: this.verif.accId || null,
        bank_date: op.date || null,
        bank_label: (op.label || '').slice(0, 200),
        bank_amount: Number(op.amount) || 0,
        fingerprint: this.verifFingerprint(op),
        status,
        linked_kind: link?.kind || null,
        linked_id: link?.id != null ? String(link.id) : null,
        linked_account_id: link?.accId || null,
        bank_source: this.verif.bankDetected || this.verif.bank || null,
        file_name: this.verif.fileName || null,
        meta: {
          ...(link?.meta || {}),
          label_raw: op.labelRaw || op.label || '',
          match_score: link?.score != null ? link.score : null
        },
        updated_at: new Date().toISOString()
      };
    },
    // Envoi brut (lève une erreur) : à utiliser dans runVerif / withRetry
    async sendBankVerifRows(rows) {
      if (!rows.length) return [];
      const { data, error } = await supabaseApp.from('bank_verifications')
        .upsert(rows, { onConflict: 'user_id,month_key,fingerprint' })
        .select('*');
      if (error) throw error;
      (data || []).forEach(r => this.patchLocalBankVerif(r));
      return data || [];
    },
    async deleteBankVerifRow(mKey, fingerprint) {
      const { error } = await supabaseApp.from('bank_verifications')
        .delete()
        .eq('user_id', this.user.id)
        .eq('month_key', mKey)
        .eq('fingerprint', fingerprint);
      if (error) throw error;
      this.removeLocalBankVerif(mKey, fingerprint);
    },
    isVerifPayableKind(kind) {
      return kind === 'expense' || kind === 'apport' || kind === 'income' || kind === 'refund';
    },
    verifPaidRecord(kind, id, accId, mKey) {
      const key = accId + '_' + mKey;
      return (kind === 'income' || kind === 'refund')
        ? (this.state.monthsIncomes?.[key] || {})[id] || null
        : (this.state.months?.[key] || {})[id] || null;
    },
    async verifWritePaid(kind, id, accId, mKey, amount) {
      if (!this.isVerifPayableKind(kind)) return;
      await this.setPaid(kind, id, accId, mKey, amount);
      if ((kind === 'apport' || this.isApportExpenseId(id)) && typeof this.noteOwnApportReceived === 'function') {
        await this.noteOwnApportReceived(id, mKey, amount);
      }
    },
    async verifRemovePaid(kind, id, accId, mKey) {
      if (!this.isVerifPayableKind(kind)) return;
      await this.clearPaid(kind, id, accId, mKey);
      if ((kind === 'apport' || this.isApportExpenseId(id)) && typeof this.clearOwnApportReceived === 'function') {
        await this.clearOwnApportReceived(id, mKey);
      }
    },

    // Lie une ligne banque à une saisie (valide la saisie si demandé). Lève une erreur en cas d’échec.
    async verifCommitLink(op, match, { markPaid = false, paidAmount = null } = {}) {
      const mKey = this.verifMonthKey(op);
      const m = { ...match };
      const payKey = m.payMonth || mKey;
      if (markPaid && this.isVerifPayableKind(m.kind) && !m.exceptional) {
        const amt = paidAmount != null ? Number(paidAmount) : Math.abs(Number(op.amount));
        await this.verifWritePaid(m.kind, m.id, m.accId, payKey, amt);
        m.amount = amt;
        m.paid = true;
      }
      const status = m.kind === 'wallet' ? 'wallet' : (m.kind === 'refund' ? 'refund' : 'matched');
      const base = m.kind === 'wallet'
        ? this.walletVerifLink(m)
        : { kind: m.kind, id: m.id, accId: m.accId, meta: m.refundOf ? { refund_of: m.refundOf } : {} };
      base.score = m.score != null ? m.score : 100;
      base.meta = { ...(base.meta || {}), budget_label: m.label || '' };
      if (m.payMonth && m.payMonth !== mKey) {
        base.meta.pay_month = m.payMonth;
        base.meta.timing = m.payMonth > mKey ? 'anticipe' : 'rattrapage';
      }
      await this.sendBankVerifRows([this.buildBankVerifRow(op, status, base)]);
      op.match = { ...m, fromDb: true, paid: m.kind === 'wallet' ? true : !!m.paid };
      op.matchOptions = null;
      op.matchCleared = false;
      op.ignored = false;
      op.savedStatus = status;
      return true;
    },

    // Vérification manuelle (saisie validée sans ligne de relevé correspondante)
    manualVerifFingerprint(kind, id) {
      return 'manual|' + this.verifLinkKey(kind, id);
    },
    async markManualVerified({ kind, id, accId, mKey, amount, label }) {
      const linkKind = kind === 'exceptional' ? 'expense' : kind;
      const monthKey = mKey || this.verif.mKey || this.monthKey(new Date());
      const row = {
        user_id: this.user.id,
        month_key: monthKey,
        bank_account_id: accId || null,
        bank_date: null,
        bank_label: String(label || 'Vérifié manuellement').slice(0, 200),
        bank_amount: Number(amount) || 0,
        fingerprint: this.manualVerifFingerprint(linkKind, id),
        status: linkKind === 'wallet' ? 'wallet' : (linkKind === 'refund' ? 'refund' : 'matched'),
        linked_kind: linkKind,
        linked_id: String(id),
        linked_account_id: accId || null,
        bank_source: null,
        file_name: null,
        meta: { manual: true, match_score: 100, budget_label: label || '' },
        updated_at: new Date().toISOString()
      };
      await this.sendBankVerifRows([row]);
    },
    async unmarkManualVerified(kind, id, mKey) {
      const linkKind = kind === 'exceptional' ? 'expense' : kind;
      const monthKey = mKey || this.verif.mKey || this.monthKey(new Date());
      const key = this.verifLinkKey(linkKind, id);
      const rows = this.getBankVerifsForMonth(monthKey)
        .filter(v => this.isManualVerifRow(v) && this.verifRowLinkKey(v) === key);
      for (const v of rows) await this.deleteBankVerifRow(monthKey, v.fingerprint);
    },
    confirmManualVerify(kind, id, accId, amount, label) {
      const mKey = this.verif.mKey || this.monthKey(new Date());
      if (!confirm(`Voulez-vous valider ce montant comme vérifié ?\n\n${label || 'Saisie'} · ${this.fmt(amount)}`)) return;
      this.runVerif('vérification manuelle', async () => {
        await this.markManualVerified({ kind, id, accId, mKey, amount, label });
        toast('Marqué comme vérifié');
        return true;
      });
    },
    confirmManualUnverify(kind, id) {
      if (!confirm('Retirer la vérification manuelle de cette saisie ?')) return;
      this.runVerif('retrait vérification', async () => {
        await this.unmarkManualVerified(kind, id);
        toast('Vérification retirée');
        return true;
      });
    },

    // Exécute une action Vérif : une seule à la fois, erreurs gérées, un seul rafraîchissement
    async runVerif(label, fn) {
      if (this._verifBusy) { toast('Opération en cours…'); return null; }
      this._verifBusy = true;
      document.body.classList.add('bh-verif-busy');
      try {
        return await withRetry(fn, label);
      } finally {
        this._verifBusy = false;
        document.body.classList.remove('bh-verif-busy');
        this.refreshVerifUi();
      }
    },
    refreshVerifUi() {
      if (this._verifUiRaf) return;
      this._verifUiRaf = requestAnimationFrame(() => {
        this._verifUiRaf = null;
        if (this.activeTab !== 'verif') return;
        if (this.verif.pane === 'status') this.renderVerifStatus();
        else this.renderVerifTable();
        this.refreshVerifGapsSheet();
      });
    },

    // Supprime tous les rapprochements pointant vers un élément budget (linked_kind + linked_id)
    async deleteBankVerificationsForLink(kind, id) {
      if (!this.user?.id || !kind || id == null || id === '') return;
      const linkedId = String(id);
      const kinds = kind === 'expense' ? ['expense', 'apport']
        : kind === 'income' ? ['income', 'refund']
        : kind === 'wallet' ? ['wallet']
        : [kind];
      await withRetry(async () => {
        for (const k of kinds) {
          const { error } = await supabaseApp.from('bank_verifications')
            .delete()
            .eq('user_id', this.user.id)
            .eq('linked_kind', k)
            .eq('linked_id', linkedId);
          if (error) throw error;
        }
        return true;
      }, 'nettoyage rapprochements');
      this.state.bankVerifications = (this.state.bankVerifications || []).filter(v => {
        if (String(v.linked_id) !== linkedId) {
          // tx portefeuille parfois aussi référencée dans meta
          if (kind === 'wallet' && v.meta) {
            const metaTx = v.meta.tx_id || v.meta.wallet_tx_id;
            if (metaTx != null && String(metaTx) === linkedId) return false;
          }
          return true;
        }
        return !kinds.includes(v.linked_kind);
      });
    },
    async deleteBankVerificationsForLinkMonth(kind, id, mKey) {
      if (!this.user?.id || !kind || id == null || id === '' || !mKey) return;
      const linkedId = String(id);
      const kinds = kind === 'expense' ? ['expense', 'apport']
        : kind === 'income' ? ['income', 'refund']
        : [kind];
      await withRetry(async () => {
        for (const k of kinds) {
          const { error } = await supabaseApp.from('bank_verifications')
            .delete()
            .eq('user_id', this.user.id)
            .eq('linked_kind', k)
            .eq('linked_id', linkedId)
            .eq('month_key', mKey);
          if (error) throw error;
        }
        return true;
      }, 'nettoyage rapprochement du mois');
      this.state.bankVerifications = (this.state.bankVerifications || []).filter(v => {
        if (String(v.month_key || '') !== mKey) return true;
        if (String(v.linked_id) !== linkedId) return true;
        return !kinds.includes(v.linked_kind);
      });
    },

    // Purge manuelle : uniquement bank_verifications de l'utilisateur courant, mois trop anciens
    async purgeOldBankVerifications() {
      if (!this.user?.id) return;
      const raw = document.getElementById('purge-verif-months')?.value;
      const months = Math.max(1, Math.min(120, parseInt(raw, 10) || 12));
      const d = new Date();
      d.setMonth(d.getMonth() - months);
      const cutoff = this.monthKey(d);
      const ok = confirm(
        `Supprimer les rapprochements bancaires de plus de ${months} mois ?\n\n` +
        `Seules les lignes bank_verifications antérieures à ${cutoff} seront effacées.\n` +
        `Aucune autre donnée (dépenses, revenus, comptes…) ne sera touchée.`
      );
      if (!ok) return;
      await withRetry(async () => {
        const { data, error } = await supabaseApp.from('bank_verifications')
          .delete()
          .eq('user_id', this.user.id)
          .lt('month_key', cutoff)
          .select('id');
        if (error) throw error;
        const n = (data || []).length;
        this.state.bankVerifications = (this.state.bankVerifications || [])
          .filter(v => !(String(v.month_key || '') < cutoff));
        toast(n === 0
          ? 'Aucun vieux rapprochement à supprimer'
          : (n === 1 ? '1 rapprochement supprimé' : `${n} rapprochements supprimés`));
        return true;
      }, 'purge rapprochements');
    },
    listBudgetStatusRows(mKey, accId) {
      if (!mKey) return [];
      const sets = this.verifiedLinkedSets(mKey);
      const accIds = accId
        ? [accId]
        : this.getOrderedAccounts().map(a => a.id);
      const accName = (id) => (this.state.accounts.find(a => a.id === id) || {}).name || '';
      const rows = [];

      (this.state.expenses || []).forEach(e => {
        if (e.is_wallet || !this.isActiveInMonth(e, mKey) || !this.isExpenseActive(e)) return;
        const card = this.isMyCardAdvance(e);
        const showAcc = card ? this.state.profile?.main_account_id : e.account_id;
        if (!showAcc || !accIds.includes(showAcc)) return;
        const paid = !!(this.state.months[showAcc + '_' + mKey] || {})[e.id]
          || !!(this.state.months[e.account_id + '_' + mKey] || {})[e.id];
        rows.push({
          kind: 'expense',
          group: 'Dépenses',
          id: e.id,
          label: card ? (e.description + ' · carte') : e.description,
          amount: this.budgetAmountOf(e.account_id, e.id, mKey, e.amount),
          day: Number(e.day) || 1,
          category: e.category || '',
          accId: showAcc,
          accName: accName(showAcc),
          paid,
          verified: sets.expense.has(String(e.id))
        });
      });

      (this.state.expenses || []).forEach(e => {
        if (!accIds.includes(e.account_id) || !e.is_wallet || !this.isActiveInMonth(e, mKey)) return;
        // Historique txs même si enveloppe désactivée
        this.getWalletTx(e.account_id, e.id, mKey).forEach(t => {
          if (this.isExternalWalletApport(t)) return;
          const txId = String(t.id);
          const day = Number(t.day) || 1;
          const amt = Number(t.amount) || 0;
          rows.push({
            kind: 'wallet',
            group: 'Portefeuille',
            id: txId,
            label: `${e.description} · ${t.description || 'Mouvement'}`,
            amount: Math.abs(amt),
            day,
            category: e.category || '',
            accId: e.account_id,
            accName: accName(e.account_id),
            paid: true,
            verified: sets.wallet.has(txId),
            walletExpId: e.id,
            walletSign: amt < 0 ? 'refund' : 'expense'
          });
        });
      });

      (this.state.incomes || []).forEach(i => {
        if (!accIds.includes(i.account_id) || !this.verifIncomeBelongsToMonth(i, mKey)) return;
        const isRefund = this.isIncomeRefund(i, mKey);
        const paid = !!(this.state.monthsIncomes?.[i.account_id + '_' + mKey] || {})[i.id];
        const verified = isRefund
          ? (sets.refund.has(String(i.id)) || sets.income.has(String(i.id)))
          : sets.income.has(String(i.id));
        rows.push({
          kind: isRefund ? 'refund' : 'income',
          group: isRefund ? 'Remboursements' : 'Revenus',
          id: i.id,
          label: i.description,
          amount: this.incomeBudgetAmountOf(i.account_id, i.id, mKey, i.amount),
          day: Number(i.day) || 1,
          category: '',
          accId: i.account_id,
          accName: accName(i.account_id),
          paid,
          verified
        });
      });

      // Apports mensuels (dépenses virtuelles sur le compte principal)
      this.listOutboundApportDues({ mKey }).forEach(ap => {
        if (!accIds.includes(ap.account_id)) return;
        const paid = !!(this.state.months[ap.account_id + '_' + mKey] || {})[ap.id];
        rows.push({
          kind: 'apport',
          group: 'Apports',
          id: ap.id,
          label: ap.description,
          amount: Number(ap.amount),
          day: Number(ap.day) || 1,
          category: 'Apport',
          accId: ap.account_id,
          accName: accName(ap.account_id),
          paid,
          verified: sets.expense.has(String(ap.id))
        });
      });

      accIds.forEach(accId => {
        const snap = this.state.theoreticalMonths?.[accId + '_' + mKey] || {};
        Object.keys(snap).forEach(id => {
          if (rows.some(r => (r.kind === 'expense' || r.kind === 'apport') && String(r.id) === String(id))) return;
          const row = snap[id];
          if (!row || row.is_wallet) return;
          if ((this.state.expenses || []).some(e => e.id === id && e.account_id === accId && this.isExpenseActive(e) && this.isActiveInMonth(e, mKey))) return;
          rows.push({
            kind: 'expense',
            group: 'Dépenses',
            id,
            label: row.description || 'Dépense',
            amount: Number(row.amount) || 0,
            day: Number(row.day) || 1,
            category: row.category || '',
            accId,
            accName: accName(accId),
            paid: !!(this.state.months[accId + '_' + mKey] || {})[id],
            verified: sets.expense.has(String(id))
          });
        });
        const incSnap = this.state.theoreticalIncomesMonths?.[accId + '_' + mKey] || {};
        Object.keys(incSnap).forEach(id => {
          if (rows.some(r => (r.kind === 'income' || r.kind === 'refund') && String(r.id) === String(id))) return;
          const row = incSnap[id];
          if (!row) return;
          if ((this.state.incomes || []).some(i => i.id === id && i.account_id === accId)) return;
          rows.push({
            kind: 'income',
            group: 'Revenus',
            id,
            label: row.description || 'Revenu',
            amount: Number(row.amount) || 0,
            day: Number(row.day) || 1,
            category: '',
            accId,
            accName: accName(accId),
            paid: !!(this.state.monthsIncomes?.[accId + '_' + mKey] || {})[id],
            verified: sets.income.has(String(id))
          });
        });
      });

      this.listExceptionalExpenses(null, mKey).forEach(exc => {
        if (!accIds.includes(exc.account_id)) return;
        rows.push({
          kind: 'exceptional',
          group: 'Exceptionnelles',
          id: exc.id,
          label: exc.description,
          amount: Number(exc.amount) || 0,
          day: Number(exc.day) || 1,
          category: exc.category || '',
          accId: exc.account_id,
          accName: accName(exc.account_id),
          paid: true,
          verified: sets.expense.has(String(exc.id))
        });
      });

      rows.forEach(r => { r.manual = r.verified && sets.manual.has(this.verifLinkKey(r.kind, r.id)); });
      const order = { Dépenses: 0, Apports: 1, Portefeuille: 2, Revenus: 3, Remboursements: 4, Exceptionnelles: 5 };
      return rows.sort((a, b) =>
        (order[a.group] - order[b.group]) ||
        a.day - b.day ||
        a.label.localeCompare(b.label, 'fr')
      );
    },
    switchVerifPane(pane) {
      this.verif.pane = pane === 'status' ? 'status' : 'releve';
      document.querySelectorAll('.bh-verif-subnav button').forEach(b => {
        b.classList.toggle('active', b.dataset.verifPane === this.verif.pane);
      });
      const releve = document.getElementById('verif-pane-releve');
      const status = document.getElementById('verif-pane-status');
      if (releve) releve.classList.toggle('active', this.verif.pane === 'releve');
      if (status) status.classList.toggle('active', this.verif.pane === 'status');
      if (this.verif.pane === 'status') this.renderVerifStatus();
      else this.renderVerifTable();
    },
    setVerifListFilter(filter) {
      const next = filter || 'all';
      if (next === 'unverified') {
        this.verif.statusFilter = this.verif.statusFilter === 'ko' && this.verif.pane === 'status' ? 'all' : 'ko';
        this.switchVerifPane('status');
        return;
      }
      this.verif.listFilter = this.verif.listFilter === next ? 'all' : next;
      if (this.verif.pane !== 'releve') this.switchVerifPane('releve');
      else this.renderVerifTable();
    },
    setVerifStatusFilter(filter) {
      const next = filter || 'all';
      this.verif.statusFilter = this.verif.statusFilter === next ? 'all' : next;
      this.renderVerifStatus();
    },
    onVerifScoreFilterChange() {
      const sel = document.getElementById('verif-score-filter');
      this.verif.scoreFilter = sel ? sel.value : '';
      this.renderVerifTable();
    },
    verifOpPassesFilters(op) {
      const listFilter = this.verif.listFilter || 'all';
      const scoreFilter = this.verif.scoreFilter || '';
      const score = op.match ? Number(op.match.score) || 0 : 0;
      const isMatched = !op.ignored && op.match && score >= 70;
      const isPending = !op.ignored && !isMatched;

      if (listFilter === 'matched' && !isMatched) return false;
      if (listFilter === 'pending' && !isPending) return false;

      if (scoreFilter === 'none') {
        if (op.ignored || (op.match && score > 0)) return false;
      } else if (scoreFilter) {
        const min = Number(scoreFilter);
        if (!op.match || score < min) return false;
      }
      return true;
    },
    syncVerifFilterUi() {
      const listFilter = this.verif.listFilter || 'all';
      const map = {
        all: 'verif-stat-card-all',
        matched: 'verif-stat-card-matched',
        pending: 'verif-stat-card-pending'
      };
      Object.keys(map).forEach(key => {
        const el = document.getElementById(map[key]);
        if (el) el.classList.toggle('active', listFilter === key);
      });
      const unv = document.getElementById('verif-stat-card-unverified');
      if (unv) unv.classList.toggle('active', this.verif.pane === 'status' && this.verif.statusFilter === 'ko');

      const statusFilter = this.verif.statusFilter || 'all';
      const sMap = {
        all: 'verif-status-card-all',
        ok: 'verif-status-card-ok',
        ko: 'verif-status-card-ko'
      };
      Object.keys(sMap).forEach(key => {
        const el = document.getElementById(sMap[key]);
        if (el) el.classList.toggle('active', statusFilter === key);
      });

      const scoreSel = document.getElementById('verif-score-filter');
      if (scoreSel && scoreSel.value !== (this.verif.scoreFilter || '')) {
        scoreSel.value = this.verif.scoreFilter || '';
      }
    },
    renderVerifStatus() {
      const listEl = document.getElementById('verif-status-list');
      if (!listEl) return;
      const mKey = this.verif.mKey || document.getElementById('verif-month')?.value || this.monthKey(new Date());
      const accId = this.verif.accId || document.getElementById('verif-account')?.value || '';
      const rows = this.listBudgetStatusRows(mKey, accId || null);
      const ok = rows.filter(r => r.verified).length;
      const ko = rows.length - ok;
      const elT = document.getElementById('verif-status-total');
      const elOk = document.getElementById('verif-status-ok');
      const elKo = document.getElementById('verif-status-ko');
      const elUn = document.getElementById('verif-stat-unverified');
      if (elT) elT.textContent = String(rows.length);
      if (elOk) elOk.textContent = String(ok);
      if (elKo) elKo.textContent = String(ko);
      if (elUn) elUn.textContent = String(ko);
      this.syncVerifFilterUi();

      const statusFilter = this.verif.statusFilter || 'all';
      const visible = rows.filter(r => {
        if (statusFilter === 'ok') return r.verified;
        if (statusFilter === 'ko') return !r.verified;
        return true;
      });

      if (!rows.length) {
        listEl.innerHTML = '<div class="bh-verif-status-empty">Aucune dépense, revenu ou remboursement sur ce compte / mois.</div>';
        return;
      }
      if (!visible.length) {
        listEl.innerHTML = '<div class="bh-verif-status-empty">Aucune saisie pour ce filtre.</div>';
        return;
      }

      let html = '';
      let lastGroup = '';
      visible.forEach(r => {
        if (r.group !== lastGroup) {
          lastGroup = r.group;
          html += `<div class="bh-verif-status-group">${this.esc(r.group)}</div>`;
        }
        const state = r.verified ? 'ok' : 'ko';
        const badge = r.verified ? (r.manual ? 'Vérifié (manuel)' : 'Vérifié') : 'Non vérifié';
        const paidLbl = r.kind === 'wallet'
          ? (r.walletSign === 'refund' ? 'crédit enveloppe' : 'dépense enveloppe')
          : (r.kind === 'expense' || r.kind === 'apport' || r.kind === 'exceptional'
            ? (r.paid ? 'payé' : 'non payé')
            : (r.paid ? 'encaissé' : 'non encaissé'));
        const isIn = r.kind === 'income' || r.kind === 'refund';
        const args = `'${r.kind}','${this.esc(String(r.id))}','${r.accId}',${Number(r.amount) || 0}`;
        let validateBtn = '';
        if (r.manual) {
          validateBtn = `<button type="button" class="bh-btn bh-btn-ghost" title="Retirer la vérification manuelle" onclick="event.stopPropagation(); BH.confirmManualUnverify('${r.kind}','${this.esc(String(r.id))}')">Retirer</button>`;
        } else if (!r.verified && !r.paid && this.isVerifPayableKind(r.kind)) {
          validateBtn = `<button type="button" class="bh-btn bh-btn-primary" title="${isIn ? 'Encaisser' : 'Valider'} ce mois-ci et marquer vérifié" onclick="event.stopPropagation(); BH.validateVerifStatusRow(${args})">${isIn ? 'Encaisser' : 'Valider'}</button>`;
        } else if (!r.verified) {
          validateBtn = `<button type="button" class="bh-btn bh-btn-primary" title="Déjà saisi : confirmer comme vérifié" onclick="event.stopPropagation(); BH.verifyVerifStatusRow(${args})">Vérifier</button>`;
        }
        html += `
          <div class="bh-verif-status-row ${state}">
            <div style="min-width:0;">
              <div><span class="bh-verif-acc-tag">${this.esc(r.accName)}</span><strong>${this.esc(r.label)}</strong></div>
              <div class="meta">Jour ${r.day}${r.category ? ' · ' + this.esc(r.category) : ''} · ${paidLbl}</div>
            </div>
            <div class="bh-verif-status-actions">
              ${validateBtn}
              <span class="bh-verif-status-badge">${badge}</span>
              <span class="num">${this.fmt(r.amount)}</span>
            </div>
          </div>`;
      });
      listEl.innerHTML = html;
    },
    validateVerifStatusRow(kind, id, accId, amount) {
      if (!id || !accId) return;
      if (!(kind === 'expense' || kind === 'apport' || kind === 'income' || kind === 'refund')) return;
      const daKind = (kind === 'income' || kind === 'refund') ? 'income' : 'expense';
      const mKey = this.verif.mKey || document.getElementById('verif-month')?.value || this.monthKey(new Date());
      this.openDifferentAmount(id, accId, daKind, {
        amount: Math.abs(Number(amount) || 0),
        mKey,
        linkKind: kind,
        markVerified: true,
        title: (kind === 'income' || kind === 'refund') ? 'Encaisser et vérifier' : 'Valider et vérifier'
      });
    },
    verifyVerifStatusRow(kind, id, accId, amount) {
      const row = this.listBudgetStatusRows(this.verif.mKey || this.monthKey(new Date()), null)
        .find(r => r.kind === kind && String(r.id) === String(id));
      this.confirmManualVerify(kind, id, accId, row?.amount ?? amount, row?.label || '');
    },
    renderUnverifiedExpenses() {
      // Compteur du panneau Relevé + rafraîchit la vue Vérification si ouverte
      const mKey = this.verif.mKey || document.getElementById('verif-month')?.value || this.monthKey(new Date());
      const accId = this.verif.accId || document.getElementById('verif-account')?.value || '';
      const rows = this.listBudgetStatusRows(mKey, accId || null);
      const ko = rows.filter(r => !r.verified).length;
      const elUn = document.getElementById('verif-stat-unverified');
      if (elUn) elUn.textContent = String(ko);
      if (this.verif.pane === 'status') this.renderVerifStatus();
    },
    async saveVerifBatch() {
      const ops = this.verif.ops || [];
      if (!ops.length) {
        toast('Importe d’abord un relevé à enregistrer.');
        return;
      }
      const mKey = this.verif.mKey || this.monthKey(new Date());
      const rows = [];
      const applied = [];
      const paidByAcc = new Map(); // accId → { exp: {id: amount}, inc: {id: amount} }
      const isSavedLink = (op) => op.savedStatus === 'matched' || op.savedStatus === 'wallet' || op.savedStatus === 'refund';

      ops.forEach(op => {
        if (op.ignored) {
          if (op.savedStatus !== 'ignored') {
            rows.push(this.buildBankVerifRow(op, 'ignored', null));
            applied.push({ op, status: 'ignored' });
          }
          return;
        }
        const m = op.match;
        if (!m || Number(m.score) < 70 || isSavedLink(op)) return;
        let status;
        let link;
        if (m.kind === 'wallet') {
          // Uniquement les txs déjà présentes (wallet-budget créerait une nouvelle tx)
          if (!m.id || m.id === 'new') return;
          status = 'wallet';
          link = this.walletVerifLink(m);
        } else if (this.isVerifPayableKind(m.kind)) {
          status = m.kind === 'refund' ? 'refund' : 'matched';
          link = { kind: m.kind, id: m.id, accId: m.accId, meta: m.refundOf ? { refund_of: m.refundOf } : {} };
          if (!m.paid && !m.exceptional && m.accId) {
            if (!paidByAcc.has(m.accId)) paidByAcc.set(m.accId, { exp: {}, inc: {} });
            const bucket = (m.kind === 'income' || m.kind === 'refund') ? 'inc' : 'exp';
            paidByAcc.get(m.accId)[bucket][m.id] = Math.abs(Number(op.amount));
          }
        } else {
          return;
        }
        link.score = m.score;
        link.meta = { ...(link.meta || {}), budget_label: m.label || '' };
        rows.push(this.buildBankVerifRow(op, status, link));
        applied.push({ op, status, m });
      });

      let saved = 0;
      if (rows.length) {
        const ok = await this.runVerif('enregistrement du relevé', async () => {
          const asEntries = (m) => Object.fromEntries(Object.entries(m).map(([id, amount]) => [id, { amount }]));
          for (const [accId, b] of paidByAcc) {
            await this.setPaidMany('expense', accId, mKey, asEntries(b.exp));
            await this.setPaidMany('income', accId, mKey, asEntries(b.inc));
            if (typeof this.noteOwnApportReceived === 'function') {
              for (const [id, amount] of Object.entries(b.exp)) {
                if (this.isApportExpenseId(id)) await this.noteOwnApportReceived(id, mKey, amount);
              }
            }
          }
          await this.sendBankVerifRows(rows);
          applied.forEach(({ op, status, m }) => {
            op.savedStatus = status;
            if (!m) return;
            const keepAmount = m.kind === 'wallet' || m.paid || m.exceptional;
            op.match = { ...m, fromDb: true, paid: true, amount: keepAmount ? m.amount : Math.abs(Number(op.amount)) };
          });
          return true;
        });
        if (!ok) return;
        saved = rows.length;
      }

      const gaps = this.collectVerifGaps();
      const gapCount = gaps.appGaps.length + gaps.bankGaps.length;
      if (!gapCount) {
        toast(saved
          ? saved + ' ligne(s) enregistrée(s) · tout est rapproché'
          : 'Tout est rapproché');
        return;
      }
      if (saved) toast(saved + ' ligne(s) enregistrée(s) · ' + gapCount + ' écart(s) à trancher');
      else toast(gapCount + ' écart(s) à trancher');
      this.openVerifGapsSheet(gaps);
    },

    // --- Écarts budget ↔ relevé (après Enregistrer) ---
    verifAppGapIgnoredKey(mKey) {
      return 'bh-verif-app-gap-ignored-' + (this.user?.id || 'anon') + '-' + (mKey || '');
    },
    loadVerifAppGapIgnored(mKey) {
      try { return new Set(JSON.parse(localStorage.getItem(this.verifAppGapIgnoredKey(mKey)) || '[]')); }
      catch { return new Set(); }
    },
    saveVerifAppGapIgnored(mKey, set) {
      localStorage.setItem(this.verifAppGapIgnoredKey(mKey), JSON.stringify([...set]));
    },
    appGapKey(kind, id) {
      return String(kind || '') + ':' + String(id || '');
    },
    isVerifOpSolidLinked(op) {
      if (!op || op.ignored || op.savedStatus === 'ignored') return false;
      if (op.savedStatus === 'matched' || op.savedStatus === 'wallet' || op.savedStatus === 'refund') return true;
      const m = op.match;
      if (!m || m.kind === 'wallet-budget') return false;
      const score = Number(m.score) || 0;
      if (score < 70) return false;
      if (m.kind === 'wallet' && (!m.id || m.id === 'new')) return false;
      return !!(m.fromDb || op.savedStatus);
    },
    collectVerifGaps() {
      const mKey = this.verif.mKey || document.getElementById('verif-month')?.value || this.monthKey(new Date());
      const accId = this.verif.accId || document.getElementById('verif-account')?.value || '';
      const ignoredApp = this.loadVerifAppGapIgnored(mKey);

      const appGaps = [];
      this.listBudgetStatusRows(mKey, accId || null).forEach(r => {
        if (r.verified) return;
        const key = this.appGapKey(r.kind, r.id);
        if (ignoredApp.has(key)) return;
        appGaps.push({
          side: 'app',
          kind: r.kind,
          group: r.group,
          id: r.id,
          label: r.label,
          amount: Number(r.amount) || 0,
          day: r.day,
          category: r.category || '',
          accId: r.accId,
          accName: r.accName,
          paid: !!r.paid,
          walletExpId: r.walletExpId || null
        });
      });

      const bankGaps = (this.verif.ops || [])
        .filter(op => !this.isVerifOpSolidLinked(op) && !op.ignored && op.savedStatus !== 'ignored')
        .map(op => ({
          side: 'bank',
          opId: op.id,
          date: op.date || '',
          label: op.label || '',
          amount: Number(op.amount) || 0,
          score: op.match ? (Number(op.match.score) || 0) : 0,
          matchLabel: op.match ? (op.match.label || '') : '',
          weakMatch: !!(op.match && (Number(op.match.score) || 0) > 0 && (Number(op.match.score) || 0) < 70)
        }));

      return { mKey, accId, appGaps, bankGaps };
    },
    presentOverlay(id) {
      const el = document.getElementById(id);
      if (!el) return;
      document.body.appendChild(el);
      el.classList.add('open', 'front');
      const field = el.querySelector('input, select, textarea');
      if (field) requestAnimationFrame(() => { try { field.focus({ preventScroll: true }); } catch (e) {} });
    },
    openVerifGapsSheet(gapsOpt) {
      this.verif.gapLinkApp = null;
      const gaps = gapsOpt || this.collectVerifGaps();
      this.renderVerifGapsSheet(gaps);
      document.getElementById('bh-verif-gaps-overlay')?.classList.add('open');
    },
    closeVerifGapsSheet() {
      document.getElementById('bh-verif-gaps-overlay')?.classList.remove('open');
      this.verif.gapLinkApp = null;
    },
    isVerifGapsSheetOpen() {
      return !!document.getElementById('bh-verif-gaps-overlay')?.classList.contains('open');
    },
    refreshVerifGapsSheet() {
      if (!this.isVerifGapsSheetOpen()) return;
      const gaps = this.collectVerifGaps();
      if (!gaps.appGaps.length && !gaps.bankGaps.length && !this.verif.gapLinkApp) {
        this.closeVerifGapsSheet();
        toast('Tout est rapproché');
        return;
      }
      this.renderVerifGapsSheet(gaps);
    },
    renderVerifGapsSheet(gapsOpt) {
      const body = document.getElementById('verif-gaps-body');
      const title = document.getElementById('verif-gaps-title');
      const desc = document.getElementById('verif-gaps-desc');
      if (!body) return;
      const gaps = gapsOpt || this.collectVerifGaps();
      const gapLink = this.verif.gapLinkApp;

      // Mode « Lier » depuis une saisie app → choisir une ligne banque
      if (gapLink) {
        if (title) title.textContent = 'Lier à une ligne du relevé';
        if (desc) {
          desc.textContent = `Choisis la ligne banque qui correspond à « ${gapLink.label || 'cette saisie'} » (${this.fmt(gapLink.amount)}).`;
        }
        const pending = (this.verif.ops || []).filter(op =>
          !this.isVerifOpSolidLinked(op) && !op.ignored && op.savedStatus !== 'ignored'
        );
        body.innerHTML = `
          <button type="button" class="bh-btn bh-btn-ghost bh-btn-block" style="margin-bottom:10px;" onclick="BH.cancelVerifGapLinkApp()">← Retour aux écarts</button>
          ${pending.length ? pending.map(op => {
            const dateLbl = op.date ? new Date(op.date + 'T00:00:00').toLocaleDateString('fr-FR') : '—';
            const amtColor = Number(op.amount) < 0 ? 'var(--clay)' : 'var(--sage-deep)';
            return `<div class="bh-verif-gaps-row bank" style="cursor:pointer;" onclick="BH.confirmVerifGapLinkApp('${op.id}')">
              <div style="min-width:0;">
                <div><strong>${this.esc(op.label || '—')}</strong></div>
                <div class="meta">${dateLbl}${op.match ? ' · suggestion : ' + this.esc(op.match.label || '') : ''}</div>
              </div>
              <div class="num" style="color:${amtColor}; flex-shrink:0;">${this.fmt(op.amount)}</div>
            </div>`;
          }).join('') : '<div class="bh-verif-gaps-empty">Aucune ligne banque libre à lier. Oublie d’abord une ligne, ou importe un autre relevé.</div>'}`;
        return;
      }

      const nApp = gaps.appGaps.length;
      const nBank = gaps.bankGaps.length;
      if (title) title.textContent = 'Écarts de rapprochement';
      if (desc) {
        desc.textContent = nApp || nBank
          ? `Encore ${nApp} saisie(s) hors relevé et ${nBank} ligne(s) banque hors appli. Oublier · Lier · Vérifier / Exceptionnelle / Saisie.`
          : 'Tout est rapproché pour ce mois.';
      }

      const kindFr = {
        expense: 'Dépense', apport: 'Apport', income: 'Revenu', refund: 'Remboursement',
        wallet: 'Portefeuille', exceptional: 'Exceptionnelle'
      };

      const appHtml = nApp
        ? gaps.appGaps.map(g => {
          const kid = this.esc(g.kind);
          const id = this.esc(g.id);
          const acc = this.esc(g.accId || '');
          return `<div class="bh-verif-gaps-row app">
            <div class="bh-verif-gaps-main">
              <div><span class="bh-verif-acc-tag">${this.esc(g.accName || '')}</span><strong>${this.esc(g.label)}</strong></div>
              <div class="meta">${kindFr[g.kind] || g.kind}${g.paid ? ' · saisi' : ' · non saisi'} · jour ${g.day || '—'}${g.category ? ' · ' + this.esc(g.category) : ''}</div>
            </div>
            <span class="num">${this.fmt(g.amount)}</span>
            <div class="bh-verif-gap-actions">
              <button type="button" class="bh-btn bh-btn-ghost" title="Ne plus proposer cet écart" onclick="event.stopPropagation(); BH.ignoreVerifAppGap('${kid}','${id}')">Oublier</button>
              <button type="button" class="bh-btn bh-btn-outline" title="Rattacher une ligne du relevé" onclick="event.stopPropagation(); BH.startVerifGapLinkApp('${kid}','${id}','${acc}')">Lier</button>
              <button type="button" class="bh-btn bh-btn-primary" title="${g.paid ? 'Déjà saisi : confirmer comme vérifié' : 'Valider le montant et marquer vérifié'}" onclick="event.stopPropagation(); BH.saisieVerifAppGap('${kid}','${id}','${acc}',${Number(g.amount) || 0})">${g.paid ? 'Vérifier' : 'Valider'}</button>
            </div>
          </div>`;
        }).join('')
        : '<div class="bh-verif-gaps-empty">Aucune saisie orpheline — tout le budget du mois est couvert par le relevé (ou oublié).</div>';

      const bankHtml = nBank
        ? gaps.bankGaps.map(g => {
          const dateLbl = g.date ? new Date(g.date + 'T00:00:00').toLocaleDateString('fr-FR') : '—';
          const amtColor = g.amount < 0 ? 'var(--clay)' : 'var(--sage-deep)';
          const weak = g.weakMatch ? ` · score faible ${g.score}%` : '';
          const excBtn = Number(g.amount) < 0
            ? `<button type="button" class="bh-btn bh-btn-outline" title="Enregistrer cette sortie comme dépense exceptionnelle (ponctuelle) et la lier à cette ligne" onclick="event.stopPropagation(); BH.saisieVerifBankGap('${g.opId}')">Exceptionnelle</button>`
            : '';
          return `<div class="bh-verif-gaps-row bank">
            <div class="bh-verif-gaps-main">
              <div><strong>${this.esc(g.label)}</strong></div>
              <div class="meta">${dateLbl}${weak}${g.matchLabel ? ' · ' + this.esc(g.matchLabel) : ''}</div>
            </div>
            <span class="num" style="color:${amtColor};">${this.fmt(g.amount)}</span>
            <div class="bh-verif-gap-actions">
              <button type="button" class="bh-btn bh-btn-ghost" title="Ignorer cette ligne banque" onclick="event.stopPropagation(); BH.ignoreVerifBankGap('${g.opId}')">Oublier</button>
              <button type="button" class="bh-btn bh-btn-outline" title="Lier à une saisie existante" onclick="event.stopPropagation(); BH.linkVerifBankGap('${g.opId}')">Lier</button>
              ${excBtn}
              <button type="button" class="bh-btn bh-btn-primary" title="Créer une dépense ou un revenu durable prérempli" onclick="event.stopPropagation(); BH.verifAddAsEntry('${g.opId}')">Saisie</button>
            </div>
          </div>`;
        }).join('')
        : '<div class="bh-verif-gaps-empty">Aucune ligne banque orpheline — tout le relevé est lié ou oublié.</div>';

      body.innerHTML = `
        <div class="bh-verif-gaps-section">
          <h4>Sur l’appli, pas dans le relevé <span class="cnt">${nApp}</span></h4>
          ${appHtml}
        </div>
        <div class="bh-verif-gaps-section">
          <h4>Sur le relevé, pas dans l’appli <span class="cnt">${nBank}</span></h4>
          ${bankHtml}
        </div>`;
    },
    ignoreVerifAppGap(kind, id) {
      const mKey = this.verif.mKey || this.monthKey(new Date());
      const set = this.loadVerifAppGapIgnored(mKey);
      set.add(this.appGapKey(kind, id));
      this.saveVerifAppGapIgnored(mKey, set);
      toast('Écart oublié');
      this.refreshVerifGapsSheet();
    },
    startVerifGapLinkApp(kind, id, accId) {
      const gaps = this.collectVerifGaps();
      const g = gaps.appGaps.find(x => x.kind === kind && String(x.id) === String(id))
        || this.listBudgetStatusRows(gaps.mKey, gaps.accId || null)
          .find(x => x.kind === kind && String(x.id) === String(id));
      const exc = kind === 'exceptional'
        ? this.listExceptionalExpenses(null, gaps.mKey).find(e => String(e.id) === String(id))
        : null;
      this.verif.gapLinkApp = {
        kind,
        id,
        accId: accId || g?.accId || exc?.account_id || this.verif.accId,
        label: g?.label || exc?.description || '',
        amount: g?.amount ?? exc?.amount ?? 0,
        walletExpId: g?.walletExpId || null
      };
      this.renderVerifGapsSheet(gaps);
    },
    cancelVerifGapLinkApp() {
      this.verif.gapLinkApp = null;
      this.refreshVerifGapsSheet();
    },
    async confirmVerifGapLinkApp(opId) {
      const link = this.verif.gapLinkApp;
      const op = this.findVerifOp(opId);
      if (!link || !op) return;
      const kind = link.kind;
      const id = link.id;
      const accId = link.accId || this.verif.accId;
      const accName = (this.state.accounts.find(a => a.id === accId) || {}).name || '';
      this.verif.gapLinkApp = null;

      let match;
      if (kind === 'expense' || kind === 'apport' || kind === 'income' || kind === 'refund') {
        match = {
          kind, id, accId, accName,
          label: link.label || (kind === 'apport' ? 'Apport' : (kind === 'expense' ? 'Dépense' : 'Revenu')),
          score: 100
        };
      } else if (kind === 'wallet') {
        const exp = (this.state.expenses || []).find(e => String(e.id) === String(link.walletExpId || ''));
        const rawLabel = link.label || op.label || '';
        const txLabel = rawLabel.includes(' · ') ? rawLabel.split(' · ').slice(1).join(' · ') : rawLabel;
        match = {
          kind: 'wallet', id, expId: link.walletExpId || null, accId, accName,
          label: rawLabel,
          walletName: exp?.description || (rawLabel.includes(' · ') ? rawLabel.split(' · ')[0] : ''),
          txLabel: txLabel || op.label,
          category: exp?.category || '',
          day: op.date ? Number(String(op.date).slice(8, 10)) : null,
          amount: this.verifEnvelopeAmount(op.amount), paid: true, score: 100
        };
      } else if (kind === 'exceptional') {
        match = {
          kind: 'expense', id, accId, accName, exceptional: true,
          label: link.label || 'Dépense exceptionnelle',
          amount: Math.abs(Number(link.amount) || Number(op.amount)), paid: true, score: 100
        };
      } else {
        toast('Type de saisie non géré pour la liaison.');
        this.refreshVerifGapsSheet();
        return;
      }
      const ok = await this.runVerif('liaison', async () => {
        await this.verifCommitLink(op, match, { markPaid: true });
        return true;
      });
      if (ok) toast('Liaison enregistrée');
    },
    saisieVerifAppGap(kind, id, accId, amount) {
      const mKey = this.verif.mKey || this.monthKey(new Date());
      const gap = this.collectVerifGaps().appGaps.find(g => g.kind === kind && String(g.id) === String(id));
      // Déjà saisi / validé : il ne reste qu’à confirmer la vérification
      if (kind === 'exceptional' || kind === 'wallet' || gap?.paid) {
        this.confirmManualVerify(kind, id, accId, gap?.amount ?? amount, gap?.label || '');
        return;
      }
      if (kind === 'expense' || kind === 'apport' || kind === 'income' || kind === 'refund') {
        const daKind = (kind === 'income' || kind === 'refund') ? 'income' : 'expense';
        this.openDifferentAmount(id, accId, daKind, {
          amount: Math.abs(Number(amount) || 0),
          mKey,
          linkKind: kind,
          markVerified: true,
          title: (kind === 'income' || kind === 'refund') ? 'Encaisser et vérifier' : 'Valider et vérifier'
        });
        return;
      }
      toast('Action non disponible pour ce type.');
    },
    async ignoreVerifBankGap(opId) {
      await this.ignoreVerifOp(opId);
    },
    linkVerifBankGap(opId) {
      // Laisse la sheet écarts ouverte en fond ; le flux Lier… existant s’occupe de la liaison
      this.openVerifLink(opId);
    },
    saisieVerifBankGap(opId) {
      const op = this.findVerifOp(opId);
      if (!op) return;
      if (Number(op.amount) < 0) {
        // Sortie ponctuelle → dépense exceptionnelle préremplie
        this.openExceptionalSheet({
          desc: op.label || '',
          amount: Math.abs(Number(op.amount)),
          date: op.date || null,
          accId: this.verif.accId || '',
          mKey: this.verif.mKey || (op.date || '').slice(0, 7),
          pendingOpId: opId
        });
      } else {
        this.verifAddAsEntry(opId);
      }
    },
    parseAmountFR(raw) {
      if (raw == null) return NaN;
      let s = String(raw).replace(/\s|\u00a0/g, '').replace(/€|EUR/gi, '').replace(/−/g, '-');
      if (/,\d{1,2}$/.test(s) && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
      else if (s.includes(',')) s = s.replace(',', '.');
      return Number(s);
    },
    parseDateFR(raw) {
      const s = String(raw || '').trim();
      // ISO / Revolut : 2026-09-02 10:02:51 ou 2026-09-02T10:02:51
      const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T].*)?$/);
      if (iso) return iso[1] + '-' + iso[2] + '-' + iso[3];
      const m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/);
      if (!m) return null;
      let y = Number(m[3]);
      if (y < 100) y += 2000;
      const day = Number(m[1]), month = Number(m[2]);
      if (month < 1 || month > 12 || day < 1 || day > 31) return null;
      // Éviter toISOString() (décale d’un jour selon le fuseau)
      return y + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0');
    },
    bankLabel(code) {
      return ({ ca: 'Crédit Agricole', cic: 'CIC', revolut: 'Revolut', auto: 'Auto' })[code] || code || '—';
    },
    onVerifBankChange() {
      const sel = document.getElementById('verif-bank');
      this.verif.bank = sel ? sel.value : 'auto';
      localStorage.setItem('bh-verif-bank', this.verif.bank);
    },
    normalizeLabel(s) {
      return String(s || '').toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, ' ').trim();
    },
    labelSimilarity(a, b) {
      const ta = new Set(this.normalizeLabel(a).split(' ').filter(w => w.length > 2));
      const tb = new Set(this.normalizeLabel(b).split(' ').filter(w => w.length > 2));
      if (!ta.size || !tb.size) return 0;
      let inter = 0;
      ta.forEach(w => { if (tb.has(w)) inter++; });
      return inter / Math.max(ta.size, tb.size);
    },

    async readCsvText(file) {
      const buf = await file.arrayBuffer();
      const asUtf8 = new TextDecoder('utf-8').decode(buf);
      let as1252 = asUtf8;
      try { as1252 = new TextDecoder('windows-1252').decode(buf); } catch (_) {}
      // Export CA : préambule + en-tête plus bas ; scorer un extrait, pas seulement la 1re ligne
      const score = (t) => {
        const sample = t.slice(0, 4000);
        let s = 0;
        if (/Débit|Libellé|Crédit|État|Début|début|opération/.test(sample)) s += 5;
        if (/Date de valeur|Date d'opération|Date valeur/i.test(sample)) s += 2;
        if (/Débit euros|Crédit euros/i.test(sample)) s += 3;
        if (/Téléchargement du|Liste des opérations/i.test(sample)) s += 2;
        if (/DÃ©bit|LibellÃ©|CrÃ©dit|Ã‰tat|dÃ©but|DÃ©but|opÃ©ration/.test(sample)) s -= 5;
        if (/D.bit|Libell.|Cr.dit/.test(sample) && !/Débit|Libellé|Crédit/.test(sample)) s -= 2;
        if (/\uFFFD/.test(sample)) s -= 3;
        return s;
      };
      return score(as1252) >= score(asUtf8) ? as1252 : asUtf8;
    },

    cleanBankLabel(label) {
      const raw = String(label || '');
      const lines = raw.split(/\r?\n/).map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean);

      // Export Crédit Agricole récent : type sur la 1re ligne, détail en dessous
      if (lines.length >= 2) {
        const kind = lines[0];
        const detail = lines[1];
        const last = lines[lines.length - 1];

        if (/^paiement par carte$/i.test(kind)) {
          // "X9937 RELAIS MALBROUCK NAS 24/10 - TotalEnergies"
          let m = detail.match(/\s-\s+(.+)$/);
          if (m && m[1].trim().length >= 2) return m[1].trim().slice(0, 80);
          m = detail.match(/^X\d{3,5}\s+(.+?)(?:\s+\d{1,2}\/\d{2})?\s*$/i);
          if (m) return m[1].replace(/\s+/g, ' ').trim().slice(0, 80);
          return detail.slice(0, 80);
        }

        if (/^pr[eé]l[eè]vement$/i.test(kind)) {
          if (/paypal/i.test(detail)) return 'PayPal';
          if (/\bMAIF\b/i.test(detail)) return 'MAIF';
          if (/PACIFICA|ASSURANCE HABITATION/i.test(detail)) return 'Assurance habitation';
          if (/FRAIS CARTE/i.test(detail)) {
            const m = detail.match(/-\s*(.+)$/);
            return ('Frais carte ' + (m ? m[1] : detail)).replace(/\s+/g, ' ').trim().slice(0, 80);
          }
          // "Secours Catholique - Siege - …" / "Offre Compte à composer"
          let m = detail.match(/^(.+?)\s+-\s+/);
          if (m) {
            let name = m[1].replace(/^\d+\s+/, '').trim();
            if (name.length >= 3 && name.length <= 50 && !/^\d+$/.test(name) && !/^CA NORD/i.test(name)) {
              return name.slice(0, 80);
            }
          }
          return detail
            .replace(/\s+(?:FR|LU|DE)\d{2}ZZZ.*$/i, '')
            .replace(/\s+\d{10,}.*$/, '')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 80);
        }

        if (/^virement en votre faveur$/i.test(kind)) {
          if (/paypal/i.test(detail)) return 'PayPal';
          let m = detail.match(/^VIR INST de\s+(.+?)(?:\s+-\s+(.+))?$/i);
          if (m) {
            if (lines.length >= 3 && last.length >= 3 && last.length <= 70) return last.slice(0, 80);
            if (m[2]) return m[2].replace(/\s+/g, ' ').trim().slice(0, 80);
            return ('Virement ' + m[1]).replace(/\s+/g, ' ').trim().slice(0, 80);
          }
          // Motif court en dernière ligne (ex. "Remboursement coiffeur", "Monnaie", "Pizza")
          if (lines.length >= 3 && last.length >= 3 && last.length <= 60 && !/^DE M\./i.test(last) && !/paypal/i.test(last)) {
            return last.slice(0, 80);
          }
          m = detail.match(/^DE\s+(.+)/i);
          if (m) return ('Virement ' + m[1].replace(/\s+/g, ' ').trim()).slice(0, 80);
          return detail.replace(/\s+M\.?\s*OU\s*MME.*$/i, '').replace(/\s+/g, ' ').trim().slice(0, 80);
        }

        if (/^virement [eé]mis$/i.test(kind)) {
          let m = detail.match(/^VIR INST vers\s+(.+)/i);
          if (m) return ('Virement ' + m[1]).replace(/\s+/g, ' ').trim().slice(0, 80);
          m = detail.match(/^WEB\s+(.+?)(?:\s+-\s+(.+))?$/i);
          if (m) {
            if (m[2]) return m[2].replace(/\s+/g, ' ').trim().slice(0, 80);
            if (lines.length >= 3 && last.length >= 3 && last.length <= 70) return last.slice(0, 80);
            return ('Virement ' + m[1]).replace(/\s+/g, ' ').trim().slice(0, 80);
          }
          return detail.slice(0, 80);
        }

        if (/^ch[eè]que\s+emis$/i.test(kind)) {
          return ('Chèque ' + (detail || '')).replace(/\s+/g, ' ').trim().slice(0, 60);
        }
      }

      let s = raw.replace(/\s+/g, ' ').trim();
      // Ancien format CA / CIC : PAIEMENT CB 1010 GUICHAINVILLE 27 CARREFOUR CARTE 2489… → CARREFOUR
      let m = s.match(/^PAIEMENT CB\s+\d{3,4}\s+(.+?)\s+CARTE\s+\d+/i);
      if (m) {
        let mid = m[1].trim();
        mid = mid.replace(/^[A-ZÀ-Ü][A-ZÀ-Ü\s\-']+?\s+\d{2}\s+/i, '');
        mid = mid.replace(/^(LUXEMBOURG|AMSTERDAM|BRUXELLES|LONDON|DUBLIN|BERLIN|MADRID|ROME)\s+/i, '');
        mid = mid.replace(/^(GUICHAINVILLE|BERNAY|PARIS|LYON|LILLE|NANTES|TOULOUSE|ROUEN|EVREUX)\s+/i, '');
        if (mid.length >= 3) return mid.slice(0, 80);
      }
      m = s.match(/^PRLV SEPA\s+(.+?)(?:\s+PRELEVEMENT|\s+\d{6,}|$)/i);
      if (m) return m[1].replace(/\s+/g, ' ').trim().slice(0, 80);
      m = s.match(/^VIR INST(?:ANTANE)?\s+(?:WERO\s+)?(.+?)(?:\s+ENVOYE|\s+NOTPROVID|\s+\d{10,}|$)/i);
      if (m) return ('Virement ' + m[1]).replace(/\s+/g, ' ').trim().slice(0, 80);
      if (/^ECH PRET\b/i.test(s)) return s.slice(0, 60);
      return s.slice(0, 180);
    },

    splitCsvRows(text) {
      // Parse CSV entier (libellés CA multi-lignes entre guillemets) + saute le préambule
      const src = String(text || '').replace(/^\uFEFF/, '');
      if (!src.trim()) return { header: [], rows: [], sep: ';', data: [] };
      const sep = (src.match(/;/g) || []).length >= (src.match(/,/g) || []).length ? ';' : ',';
      const rows = [];
      let row = [], cur = '', q = false;
      for (let i = 0; i < src.length; i++) {
        const c = src[i];
        if (c === '"') {
          if (q && src[i + 1] === '"') { cur += '"'; i++; continue; }
          q = !q;
          continue;
        }
        if (c === sep && !q) { row.push(cur.trim()); cur = ''; continue; }
        if ((c === '\n' || c === '\r') && !q) {
          if (c === '\r' && src[i + 1] === '\n') i++;
          row.push(cur.trim());
          cur = '';
          if (row.some(x => x)) rows.push(row);
          row = [];
          continue;
        }
        cur += c;
      }
      row.push(cur.trim());
      if (row.some(x => x)) rows.push(row);

      const normCell = (h) => String(h || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
      let headerIdx = 0;
      for (let i = 0; i < Math.min(rows.length, 50); i++) {
        const cells = rows[i].map(normCell).filter(Boolean);
        if (cells.length < 3) continue;
        const hasDate = cells.some(h => /^date/.test(h) || /date d.?operation/.test(h));
        const hasLabel = cells.some(h => /libell|label|desc|motif|communication/.test(h));
        const hasMoney = cells.some(h => /debit|credit|montant|amount/.test(h));
        if (hasDate && hasMoney && (hasLabel || cells.length >= 4)) {
          headerIdx = i;
          break;
        }
      }
      const headerRow = rows[headerIdx] || [];
      const header = headerRow.map(normCell);
      const data = rows.slice(headerIdx + 1);
      return { header, rows: rows.slice(headerIdx), sep, data };
    },
    findCsvCol(header, ...preds) {
      for (const pred of preds) {
        const i = header.findIndex(pred);
        if (i >= 0) return i;
      }
      return -1;
    },
    cellAmount(raw) {
      if (raw == null || String(raw).trim() === '') return null;
      const n = this.parseAmountFR(raw);
      return Number.isFinite(n) && n !== 0 ? n : null;
    },
    looksLikeRevolutCsv(header) {
      const h = header.join('|');
      // EN : Started Date, Completed Date, Amount, State
      // FR : Date de début, Date de fin, Montant, État
      if (/started date|completed date|date de debut|date de fin/.test(h) && /description/.test(h) && /amount|montant/.test(h)) return true;
      return header.includes('type') && header.includes('description')
        && (header.includes('amount') || header.includes('montant'))
        && (header.includes('state') || header.includes('etat'));
    },
    detectBankFormat(header, preferred) {
      const revolut = this.looksLikeRevolutCsv(header);
      if (revolut) return 'revolut';
      if (preferred && preferred !== 'auto') return preferred;
      // CIC : Date d'opération + Montant (une colonne) ; pas de Débit/Crédit séparés
      const hasOpDate = header.some(x => /date d.?operation|date operation/.test(x));
      const hasMontant = header.some(x => /^montant$/.test(x));
      const hasDebit = header.some(x => /^debit(?:\s+euros)?$/.test(x) || /d.?bit/.test(x));
      const hasCredit = header.some(x => /^credit(?:\s+euros)?$/.test(x) || /cr.?dit/.test(x));
      const hasDebitEuros = header.some(x => /debit\s+euros/.test(x));
      if (hasDebitEuros && hasCredit) return 'ca';
      if ((hasOpDate || (hasMontant && !hasDebit)) && hasMontant && !hasDebit) return 'cic';
      // Crédit Agricole : Date d'opération ; Date valeur ; Libellé ; Débit euros ; Crédit euros
      if (hasDebit && hasCredit) return 'ca';
      if (header[0] === 'date' && hasDebit) return 'ca';
      return 'ca'; // défaut FR courant
    },

    parseBankCsv(text, preferredBank) {
      const { header, data } = this.splitCsvRows(text);
      if (!header.length) return { ops: [], bank: 'auto' };
      const bank = this.detectBankFormat(header, preferredBank);
      let ops = [];
      if (bank === 'revolut') ops = this.parseCsvRevolut(header, data);
      else if (bank === 'cic') ops = this.parseCsvCic(header, data);
      else ops = this.parseCsvCreditAgricole(header, data);
      return { ops, bank };
    },

    parseCsvCreditAgricole(header, data) {
      // Export CA (2025+) :
      // Date d'opération;Date valeur;Libellé;Débit euros;Crédit euros;
      // + préambule « Téléchargement du… / Liste des opérations… » (ignoré par splitCsvRows)
      // + libellés multi-lignes entre guillemets (type puis détail)
      // Ancien format possible : Date;Date de valeur;Débit;Crédit;Libellé;Solde
      let idx = {
        date: this.findCsvCol(header,
          h => /date d.?operation|date operation/.test(h),
          h => h === 'date',
          h => h.startsWith('date') && !/valeur/.test(h),
          h => /date/.test(h)),
        label: this.findCsvCol(header, h => /libell|label|desc|motif|communication/.test(h)),
        debit: this.findCsvCol(header,
          h => /^debit(?:\s+euros)?$/.test(h),
          h => /d.?bit|sortie/.test(h)),
        credit: this.findCsvCol(header,
          h => /^credit(?:\s+euros)?$/.test(h),
          h => /cr.?dit|entree/.test(h))
      };
      if (header.length >= 5 && header[0] === 'date' && (idx.debit < 0 || idx.credit < 0 || idx.label < 0)) {
        idx = { date: 0, debit: idx.debit >= 0 ? idx.debit : 2, credit: idx.credit >= 0 ? idx.credit : 3, label: idx.label >= 0 ? idx.label : 4 };
      }
      // Variante CA : Date ; Date valeur ; Libellé ; Débit ; Crédit (libellé en col 2)
      if (idx.label >= 0 && idx.debit >= 0 && idx.label === idx.debit) {
        idx.label = this.findCsvCol(header, h => /libell|label|desc|motif/.test(h) && !/debit|credit|date/.test(h));
      }
      const ops = [];
      data.forEach((cols, i) => {
        if (!cols.length || cols.every(c => !c)) return;
        // Ignorer lignes non opération (solde, totaux, 2e en-tête recopié)
        const dateRaw = idx.date >= 0 ? cols[idx.date] : '';
        if (!/^\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}$/.test(String(dateRaw || '').trim())
          && !/^\d{4}-\d{2}-\d{2}/.test(String(dateRaw || '').trim())) return;
        const date = this.parseDateFR(dateRaw);
        const label = idx.label >= 0 ? cols[idx.label] : '';
        const d = idx.debit >= 0 ? this.cellAmount(cols[idx.debit]) : null;
        const c = idx.credit >= 0 ? this.cellAmount(cols[idx.credit]) : null;
        let amount = NaN;
        if (d != null && c == null) amount = -Math.abs(d);
        else if (c != null && d == null) amount = Math.abs(c);
        else if (d != null && c != null) amount = Math.abs(c) - Math.abs(d);
        if (!date || !Number.isFinite(amount) || amount === 0) return;
        const labelRaw = String(label || '').replace(/\s+/g, ' ').trim().slice(0, 180);
        ops.push({ id: 'csv-' + i, date, label: this.cleanBankLabel(label), labelRaw, amount });
      });
      return ops;
    },

    parseCsvCic(header, data) {
      // Date d'opération,Date de valeur,Montant,Libellé,Solde
      // Convention CIC export : montant positif = débit (sortie), négatif = crédit (entrée) → on inverse
      // Variante possible : colonnes Débit/Crédit comme le CA
      const hasDebit = header.some(x => /^debit$/.test(x) || /d.?bit/.test(x));
      const hasCredit = header.some(x => /^credit$/.test(x) || /cr.?dit/.test(x));
      if (hasDebit && hasCredit) return this.parseCsvCreditAgricole(header, data);

      const idx = {
        date: this.findCsvCol(header,
          h => /date d.?operation|date operation/.test(h),
          h => h === 'date',
          h => h.startsWith('date') && !/valeur/.test(h),
          h => /date/.test(h)),
        label: this.findCsvCol(header, h => /libell|label|desc|motif|communication/.test(h)),
        amount: this.findCsvCol(header, h => /^montant$/.test(h), h => /montant|amount/.test(h) && !/solde/.test(h))
      };
      const ops = [];
      data.forEach((cols, i) => {
        if (!cols.length || cols.every(c => !c)) return;
        const date = idx.date >= 0 ? this.parseDateFR(cols[idx.date]) : null;
        const label = idx.label >= 0 ? cols[idx.label] : '';
        const raw = idx.amount >= 0 ? this.cellAmount(cols[idx.amount]) : null;
        if (!date || raw == null) return;
        const amount = -raw; // invert CIC sign → convention app (sortie -, entrée +)
        if (!Number.isFinite(amount) || amount === 0) return;
        ops.push({ id: 'csv-' + i, date, label: this.cleanBankLabel(label), labelRaw: String(label || '').slice(0, 180), amount });
      });
      return ops;
    },

    parseCsvRevolut(header, data) {
      // EN : Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance
      // FR : Type,Produit,Date de début,Date de fin,Description,Montant,Frais,Devise,État,Solde
      const idx = {
        completed: this.findCsvCol(header, h => /completed date|date de fin/.test(h)),
        started: this.findCsvCol(header, h => /started date|date de debut/.test(h)),
        date: this.findCsvCol(header, h => h === 'date'),
        label: this.findCsvCol(header, h => /description|libell|label/.test(h)),
        amount: this.findCsvCol(header, h => h === 'amount' || h === 'montant'),
        fee: this.findCsvCol(header, h => h === 'fee' || h === 'frais'),
        state: this.findCsvCol(header, h => h === 'state' || h === 'etat' || h === 'statut'),
        currency: this.findCsvCol(header, h => h === 'currency' || h === 'devise'),
        type: this.findCsvCol(header, h => h === 'type')
      };
      const normState = (raw) => String(raw || '')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toUpperCase().trim();
      const ops = [];
      data.forEach((cols, i) => {
        if (!cols.length || cols.every(c => !c)) return;
        const state = idx.state >= 0 ? normState(cols[idx.state]) : 'COMPLETED';
        if (state && !/COMPLETED|COMPLETE|REUSSI|SUCCESS|TERMINE/.test(state)) return;
        const cur = idx.currency >= 0 ? String(cols[idx.currency] || '').trim().toUpperCase() : '';
        if (cur && cur !== 'EUR') return;
        const dateRaw = (idx.completed >= 0 && cols[idx.completed]) || (idx.started >= 0 && cols[idx.started]) || (idx.date >= 0 && cols[idx.date]) || '';
        const date = this.parseDateFR(dateRaw);
        const label = idx.label >= 0 ? cols[idx.label] : '';
        let amount = idx.amount >= 0 ? this.cellAmount(cols[idx.amount]) : null;
        // Fee Revolut souvent séparée (négative ou positive) — on l’ajoute au montant si absente du Amount
        if (idx.fee >= 0) {
          const fee = this.cellAmount(cols[idx.fee]);
          if (fee != null && amount != null && Math.abs(fee) > 0) {
            // Fee sortante : toujours négative pour le solde
            amount = amount - Math.abs(fee);
          }
        }
        if (!date || amount == null) return;
        const type = idx.type >= 0 ? cols[idx.type] : '';
        let clean = this.cleanBankLabel(label);
        if (type && !/card payment|transfer|topup/i.test(type)) {
          // garder le type utile (ex. ATM)
        }
        ops.push({ id: 'csv-' + i, date, label: clean || String(type || 'Mouvement'), labelRaw: String(label || '').slice(0, 180), amount });
      });
      return ops;
    },

    parseBankPdfText(text) {
      const lines = text.split(/\r?\n/).map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
      const ops = [];
      const dateRe = /^(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4})\b/;
      const amountRe = /([-+−]?\s*\d{1,3}(?:[\s\u00a0.]\d{3})*[.,]\d{2})\s*(?:€|EUR)?\s*$/i;
      lines.forEach((line, i) => {
        const dm = line.match(dateRe);
        const am = line.match(amountRe);
        if (!dm || !am) return;
        const date = this.parseDateFR(dm[1]);
        let amount = this.parseAmountFR(am[1]);
        if (!date || !Number.isFinite(amount) || amount === 0) return;
        let label = line.slice(dm[0].length, am.index).replace(/\s+/g, ' ').trim();
        // 2e date (valeur) souvent présente
        label = label.replace(/^\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}\s*/, '').trim();
        if (!label || label.length < 2) label = 'Mouvement';
        // Si le montant n'a pas de signe et le contexte dit débit, on garde tel quel :
        // l'utilisateur choisit le compte ; on affichera débit/crédit via le signe si présent.
        ops.push({ id: 'pdf-' + i, date, label: label.slice(0, 180), amount });
      });
      return ops;
    },

    revolutMonthIndex(token) {
      const t = String(token || '').toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/\./g, '');
      const aliases = {
        janvier: 0, jan: 0, january: 0,
        fevrier: 1, fev: 1, feb: 1, february: 1,
        mars: 2, mar: 2, march: 2,
        avril: 3, avr: 3, apr: 3, april: 3,
        mai: 4, may: 4,
        juin: 5, jun: 5, june: 5,
        juillet: 6, juil: 6, jul: 6, july: 6,
        aout: 7, aou: 7, aug: 7, august: 7,
        septembre: 8, sept: 8, sep: 8, september: 8,
        octobre: 9, oct: 9, october: 9,
        novembre: 10, nov: 10, november: 10,
        decembre: 11, dec: 11, december: 11
      };
      return Object.prototype.hasOwnProperty.call(aliases, t) ? aliases[t] : -1;
    },
    parseRevolutDisplayDate(raw) {
      const s = String(raw || '').replace(/\s+/g, ' ').trim();
      if (!s) return null;
      if (/^\d{4}-\d{2}-\d{2}/.test(s) || /^\d{1,2}[\/.\-]\d{1,2}[\/.\-]/.test(s)) {
        return this.parseDateFR(s);
      }
      let m = s.match(/^(\d{1,2})\s+([A-Za-zÀ-ÿ.]+)\s+(\d{4})$/);
      if (m) {
        const month = this.revolutMonthIndex(m[2]);
        const day = Number(m[1]);
        const year = Number(m[3]);
        if (month >= 0 && day >= 1 && day <= 31) {
          return year + '-' + String(month + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0');
        }
      }
      m = s.match(/^([A-Za-zÀ-ÿ.]+)\s+(\d{1,2}),?\s+(\d{4})$/);
      if (m) {
        const month = this.revolutMonthIndex(m[1]);
        const day = Number(m[2]);
        const year = Number(m[3]);
        if (month >= 0 && day >= 1 && day <= 31) {
          return year + '-' + String(month + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0');
        }
      }
      return null;
    },
    firstPdfAmount(raw) {
      const m = String(raw || '').match(/[-+−]?\s*\d{1,3}(?:[\s\u00a0\u202f.]\d{3})*[.,]\d{2}/);
      if (!m) return null;
      const n = this.parseAmountFR(m[0]);
      return Number.isFinite(n) ? Math.abs(n) : null;
    },
    clusterPdfRows(items) {
      const sorted = items.slice().sort((a, b) => (a.page - b.page) || (b.y - a.y) || (a.x - b.x));
      const rows = [];
      sorted.forEach(it => {
        const last = rows[rows.length - 1];
        if (last && last.page === it.page && Math.abs(last.y - it.y) <= 2) last.items.push(it);
        else rows.push({ page: it.page, y: it.y, items: [it] });
      });
      rows.forEach(r => r.items.sort((a, b) => a.x - b.x));
      return rows;
    },
    parseRevolutPdfItems(items) {
      const rows = this.clusterPdfRows(items);
      let currency = '';
      let cols = null;
      const ops = [];
      const norm = (s) => this.normalizeLabel(s);
      rows.forEach(row => {
        const joined = norm(row.items.map(it => it.str).join(' '));
        const cur = joined.match(/\ben (eur|gbp|usd|chf)\b/);
        if (cur) currency = cur[1].toUpperCase();
        if (row.items.some(it => norm(it.str) === 'date de debut') || /\ben attente\b/.test(joined)) {
          cols = null;
          return;
        }
        const dateH = row.items.find(it => norm(it.str) === 'date');
        const outH = row.items.find(it => /^(argent sortant|money out)$/.test(norm(it.str)));
        const inH = row.items.find(it => /^(argent entrant|money in)$/.test(norm(it.str)));
        const descH = row.items.find(it => norm(it.str) === 'description');
        const balH = row.items.find(it => /^(solde|balance)$/.test(norm(it.str)));
        if (dateH && outH) {
          cols = {
            date: dateH.x,
            desc: descH ? descH.x : dateH.x + 80,
            out: outH.x,
            inn: inH ? inH.x : outH.x + 80,
            bal: balH ? balH.x : (inH ? inH.x + 110 : outH.x + 180)
          };
          return;
        }
        if (!cols || (currency && currency !== 'EUR')) return;
        const bounds = [
          ['date', cols.date],
          ['desc', cols.desc],
          ['out', cols.out],
          ['in', cols.inn],
          ['bal', cols.bal]
        ].sort((a, b) => a[1] - b[1]);
        const band = (x) => {
          for (let i = 0; i < bounds.length; i++) {
            const midRight = i < bounds.length - 1 ? (bounds[i][1] + bounds[i + 1][1]) / 2 : Infinity;
            if (x < midRight) return bounds[i][0];
          }
          return bounds[bounds.length - 1][0];
        };
        const buckets = { date: [], desc: [], out: [], in: [], bal: [] };
        row.items.forEach(it => buckets[band(it.x)].push(it.str));
        const date = this.parseRevolutDisplayDate(buckets.date.join(' ').trim());
        if (!date) return;
        const label = buckets.desc.join(' ').replace(/\s+/g, ' ').trim();
        const outAmt = this.firstPdfAmount(buckets.out.join(' '));
        const inAmt = this.firstPdfAmount(buckets.in.join(' '));
        if (outAmt == null && inAmt == null) return;
        const amount = (inAmt || 0) - (outAmt || 0);
        if (!amount) return;
        ops.push({
          id: 'pdf-' + row.page + '-' + ops.length,
          date,
          label: this.cleanBankLabel(label) || 'Mouvement',
          labelRaw: label.slice(0, 180),
          amount
        });
      });
      return ops;
    },

    async extractPdfItems(file) {
      if (!window.pdfjsLib) throw new Error('PDF.js non chargé');
      const buf = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
      const items = [];
      for (let p = 1; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p);
        const content = await page.getTextContent();
        content.items.forEach(item => {
          const str = item.str || '';
          if (!str.trim()) return;
          items.push({
            str,
            x: item.transform ? item.transform[4] : 0,
            y: item.transform ? item.transform[5] : 0,
            page: p
          });
        });
      }
      return items;
    },
    pdfItemsToText(items) {
      return this.clusterPdfRows(items).map(r => r.items.map(it => it.str).join(' ')).join('\n');
    },

    formatMonthKey(mKey) {
      const [y, m] = String(mKey || '').split('-').map(Number);
      if (!y || !m) return mKey || '';
      const label = new Date(y, m - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
      return label.charAt(0).toUpperCase() + label.slice(1);
    },
    countOpsByMonth(ops) {
      const months = {};
      (ops || []).forEach(o => {
        const k = (o.date || '').slice(0, 7);
        if (k) months[k] = (months[k] || 0) + 1;
      });
      return months;
    },
    openVerifMonthPick(months) {
      const list = document.getElementById('verif-month-pick-list');
      const desc = document.getElementById('verif-month-pick-desc');
      const current = document.getElementById('verif-month')?.value || this.verif.mKey;
      const entries = Object.entries(months).sort((a, b) => b[0].localeCompare(a[0]));
      const total = entries.reduce((s, [, n]) => s + n, 0);
      if (desc) {
        desc.textContent = 'Ce relevé contient ' + total + ' opérations sur ' + entries.length
          + ' mois. Choisis celui à prendre en compte.';
      }
      if (list) {
        list.innerHTML = entries.map(([k, n]) => {
          const active = k === current;
          return `<button type="button" class="bh-btn ${active ? 'bh-btn-primary' : 'bh-btn-outline'} bh-btn-block" style="margin-bottom:8px; display:flex; justify-content:space-between; align-items:center; gap:12px;" onclick="BH.applyVerifMonthSelection('${k}')">`
            + `<span>${this.esc(this.formatMonthKey(k))}</span>`
            + `<span style="opacity:.75; font-size:12.5px; white-space:nowrap;">${n} op.</span>`
            + `</button>`;
        }).join('');
      }
      document.getElementById('bh-verif-month-overlay')?.classList.add('open');
    },
    closeVerifMonthPick() {
      document.getElementById('bh-verif-month-overlay')?.classList.remove('open');
    },
    cancelVerifMonthPick() {
      this.closeVerifMonthPick();
      this.verif.allOps = [];
      this.verif.ops = [];
      this.verif.fileName = '';
      const dropTitle = document.getElementById('verif-drop-title');
      if (dropTitle) dropTitle.textContent = 'Déposer un relevé PDF ou CSV';
      const dropSub = document.getElementById('verif-drop-sub');
      if (dropSub) dropSub.textContent = 'Ou PDF. Traitement local — rien n’est envoyé ailleurs.';
      this.renderVerifTable();
    },
    applyVerifMonthSelection(mKey) {
      if (!mKey) return;
      this.syncVerifMonthUi(mKey);
      this._verifMonthHandled = mKey;
      this.closeVerifMonthPick();
      this.finishVerifImport(mKey);
    },
    finishVerifImport(mKey, opts = {}) {
      const ops = this.verif.allOps || [];
      if (!ops.length) return;
      const mSel = mKey || document.getElementById('verif-month')?.value || this.verif.mKey || this.monthKey(new Date());
      this.syncVerifMonthUi(mSel);
      this._verifMonthHandled = mSel;
      const filtered = ops.filter(o => (o.date || '').slice(0, 7) === mSel);
      // Si le mois choisi n’a aucune ligne, on garde ce mois (liste vide) — pas de repli « tout le fichier »
      const useOps = filtered;
      const dbByFp = this.bankVerifByFingerprint(mSel);
      this.verif.ops = useOps.map(o => {
        const fp = this.verifFingerprint(o);
        const saved = dbByFp.get(fp);
        return {
          ...o,
          ignored: saved?.status === 'ignored',
          savedStatus: saved?.status || null,
          match: null,
          matchCleared: false
        };
      });
      const bankName = this.bankLabel(this.verif.bankDetected);
      const dropTitle = document.getElementById('verif-drop-title');
      if (dropTitle) {
        dropTitle.textContent = (this.verif.fileName || 'Relevé')
          + ' · ' + this.verif.ops.length + ' lignes'
          + ' · ' + this.formatMonthKey(mSel);
      }
      const dropSub = document.getElementById('verif-drop-sub');
      if (dropSub) dropSub.textContent = 'Format détecté : ' + bankName;
      this.rematchVerif();
      this.renderUnverifiedExpenses();
      if (!opts.quiet) {
        toast(this.verif.ops.length
          ? (this.verif.ops.length + ' opérations · ' + this.formatMonthKey(mSel) + ' · ' + bankName)
          : ('Aucune ligne banque pour ' + this.formatMonthKey(mSel)));
      }
    },
    async onVerifFile(file) {
      if (!file) return;
      const dropTitle = document.getElementById('verif-drop-title');
      try {
        if (dropTitle) dropTitle.textContent = 'Lecture de ' + file.name + '…';
        let ops = [];
        const name = (file.name || '').toLowerCase();
        if (name.endsWith('.csv') || name.endsWith('.txt') || file.type.includes('csv') || file.type === 'text/plain') {
          const preferred = document.getElementById('verif-bank')?.value || this.verif.bank || 'auto';
          const parsed = this.parseBankCsv(await this.readCsvText(file), preferred);
          ops = parsed.ops || [];
          this.verif.bankDetected = parsed.bank || '';
        } else {
          const items = await this.extractPdfItems(file);
          const revolutOps = this.parseRevolutPdfItems(items);
          if (revolutOps.length) {
            ops = revolutOps;
            this.verif.bankDetected = 'revolut';
          } else {
            const text = this.pdfItemsToText(items);
            ops = this.parseBankPdfText(text);
            if (!ops.length) {
              ops = this.parseBankPdfText(text.replace(/(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4})/g, '\n$1'));
            }
            this.verif.bankDetected = '';
          }
        }
        if (!ops.length) {
          toast('Aucune opération détectée. Essaie un export CSV de ta banque (plus fiable).');
          if (dropTitle) dropTitle.textContent = 'Déposer un relevé PDF ou CSV';
          return;
        }
        this.assignVerifFingerprints(ops);
        this.verif.allOps = ops;
        this.verif.fileName = file.name;
        const months = this.countOpsByMonth(ops);
        const monthKeys = Object.keys(months);
        if (monthKeys.length > 1) {
          if (dropTitle) dropTitle.textContent = file.name + ' · ' + ops.length + ' lignes · choix du mois…';
          this.openVerifMonthPick(months);
          return;
        }
        // Un seul mois dans le fichier → on l’applique (sans popup)
        this.applyVerifMonthSelection(monthKeys[0]);
      } catch (e) {
        console.error(e);
        toast('Impossible de lire le fichier : ' + (e.message || e));
        if (dropTitle) dropTitle.textContent = 'Déposer un relevé PDF ou CSV';
      } finally {
        const input = document.getElementById('verif-file');
        if (input) input.value = '';
      }
    },
    onVerifDrop(e) {
      e.preventDefault();
      e.currentTarget.classList.remove('drag');
      const file = e.dataTransfer?.files?.[0];
      if (file) this.onVerifFile(file);
    },
    onVerifAccountChange() {
      this.verif.accId = document.getElementById('verif-account').value;
      if ((this.verif.ops || []).length) this.rematchVerif();
      else this.renderUnverifiedExpenses();
      if (this.verif.pane === 'status') this.renderVerifStatus();
    },
    syncVerifMonthUi(mKey) {
      const key = mKey || this.verif.mKey || this.monthKey(new Date());
      this.verif.mKey = key;
      const monthInp = document.getElementById('verif-month');
      if (monthInp) monthInp.value = key;
      const label = document.getElementById('bh-verif-month-label');
      if (label) {
        const isCurrent = key === this.monthKey(new Date());
        label.innerHTML = this.esc(this.formatMonthKey(key))
          + (isCurrent
            ? ''
            : ' <span style="font-size:11px;font-weight:600;color:var(--ink-faint);text-transform:none;">(passé)</span>');
      }
      const nextBtn = document.getElementById('bh-verif-month-next');
      if (nextBtn) {
        const atCurrent = key >= this.monthKey(new Date());
        nextBtn.disabled = atCurrent;
        nextBtn.style.opacity = atCurrent ? '0.35' : '1';
      }
    },
    shiftVerifMonth(delta) {
      const curKey = this.verif.mKey || document.getElementById('verif-month')?.value || this.monthKey(new Date());
      const [y, m] = curKey.split('-').map(Number);
      const next = new Date(y, m - 1 + delta, 1);
      const nextKey = this.monthKey(next);
      if (nextKey > this.monthKey(new Date())) return;
      this.onVerifMonthChange(nextKey);
    },
    onVerifMonthChange(forcedKey) {
      const monthInp = document.getElementById('verif-month');
      const mKey = (forcedKey || monthInp?.value || this.verif.mKey || '').trim();
      if (!mKey) return;
      if (this.verif.mKey === mKey && this._verifMonthHandled === mKey && !forcedKey) {
        if (this.verif.pane === 'status') this.renderVerifStatus();
        return;
      }
      this._verifMonthHandled = mKey;
      this.syncVerifMonthUi(mKey);

      // Le relevé en mémoire suit le mois, même depuis l’onglet Vérification
      if (this.verif.allOps?.length) {
        this.finishVerifImport(mKey, { quiet: true });
      } else if (this.verif.ops.length) {
        this.rematchVerif();
      } else {
        this.renderVerifTable();
      }
      if (this.verif.pane === 'status') this.renderVerifStatus();
    },

    buildVerifCandidates(accIdOrNull, mKey) {
      const accIds = accIdOrNull
        ? [accIdOrNull]
        : this.getOrderedAccounts().map(a => a.id);
      const list = [];
      const dim = (() => {
        const [y, m] = mKey.split('-').map(Number);
        return new Date(y, m, 0).getDate();
      })();
      const accName = (id) => (this.state.accounts.find(a => a.id === id) || {}).name || '';

      accIds.forEach(accId => {
        const paidMap = this.state.months[accId + '_' + mKey] || {};
        const paidInc = this.state.monthsIncomes?.[accId + '_' + mKey] || {};

        (this.state.expenses || []).filter(e => e.account_id === accId && !e.is_wallet).forEach(e => {
          if (!this.isActiveInMonth(e, mKey) || !this.isExpenseActive(e)) return;
          if (this.isMyCardAdvance(e)) return;
          const day = Math.min(Number(e.day) || 1, dim);
          const date = `${mKey}-${String(day).padStart(2, '0')}`;
          const paidRec = paidMap[e.id];
          const budgetAmount = this.budgetAmountOf(accId, e.id, mKey, e.amount);
          const paidAmount = paidRec != null ? Number(paidRec.amount) : null;
          list.push({
            kind: 'expense', id: e.id, accId, accName: accName(accId),
            label: e.description,
            amount: (paidAmount != null && Number.isFinite(paidAmount)) ? paidAmount : budgetAmount,
            budgetAmount,
            day,
            date, paid: !!paidRec, category: e.category || ''
          });
        });
        if (accId === this.state.profile?.main_account_id) {
          (this.state.expenses || []).filter(e => this.isMyCardAdvance(e)).forEach(e => {
            if (!this.isActiveInMonth(e, mKey) || !this.isExpenseActive(e)) return;
            const day = Math.min(Number(e.day) || 1, dim);
            const date = `${mKey}-${String(day).padStart(2, '0')}`;
            const paidRec = paidMap[e.id] || (this.state.months[e.account_id + '_' + mKey] || {})[e.id];
            const budgetAmount = this.budgetAmountOf(e.account_id, e.id, mKey, e.amount);
            const paidAmount = paidRec != null ? Number(paidRec.amount) : null;
            const origin = (this.state.accounts.find(a => a.id === e.account_id) || {}).name || '';
            list.push({
              kind: 'expense', id: e.id, accId, accName: accName(accId),
              label: e.description + (origin ? ' · carte ' + origin : ' · carte'),
              amount: (paidAmount != null && Number.isFinite(paidAmount)) ? paidAmount : budgetAmount,
              budgetAmount,
              day,
              date, paid: !!paidRec, category: e.category || ''
            });
          });
        }
        (this.state.incomes || []).filter(i => i.account_id === accId && this.verifIncomeBelongsToMonth(i, mKey)).forEach(i => {
          const day = Math.min(Number(i.day) || 1, dim);
          const date = `${mKey}-${String(day).padStart(2, '0')}`;
          const paidRec = paidInc[i.id];
          const budgetAmount = this.incomeBudgetAmountOf(accId, i.id, mKey, i.amount);
          const paidAmount = paidRec != null ? Number(paidRec.amount) : null;
          list.push({
            kind: 'income', id: i.id, accId, accName: accName(accId),
            label: i.description,
            amount: (paidAmount != null && Number.isFinite(paidAmount)) ? paidAmount : budgetAmount,
            budgetAmount,
            day,
            date, paid: !!paidRec, category: ''
          });
        });
        (this.state.expenses || []).filter(e => e.account_id === accId && e.is_wallet).forEach(e => {
          // Txs historiques toujours proposables au matching (même enveloppe désactivée)
          this.getWalletTx(accId, e.id, mKey).forEach(t => {
            if (this.isExternalWalletApport(t)) return;
            const day = Number(t.day) || 1;
            const date = t.date || `${mKey}-${String(day).padStart(2, '0')}`;
            list.push({
              kind: 'wallet', id: t.id, expId: e.id, accId, accName: accName(accId),
              label: `${e.description} · ${t.description || 'Mouvement'}`,
              walletName: e.description || '',
              txLabel: t.description || 'Mouvement',
              amount: Number(t.amount), budgetAmount: Number(t.amount), day,
              date, paid: true, category: e.category || ''
            });
          });
          // Nouvelle saisie sur enveloppe : uniquement si active
          if (!this.isWalletUsable(e)) return;
          list.push({
            kind: 'wallet-budget', id: e.id, accId, accName: accName(accId),
            label: '👛 ' + e.description,
            walletName: e.description || '',
            amount: Number(e.amount), budgetAmount: Number(e.amount), day: 1,
            date: `${mKey}-01`, paid: false, category: e.category || ''
          });
        });
      });

      // Apports mensuels → candidats de matching (virements sortants)
      this.listOutboundApportDues({ mKey }).forEach(ap => {
        if (!accIds.includes(ap.account_id)) return;
        const paidMap = this.state.months[ap.account_id + '_' + mKey] || {};
        const paidRec = paidMap[ap.id];
        const budgetAmount = Number(ap.amount);
        const paidAmount = paidRec != null ? Number(paidRec.amount) : null;
        const day = Math.min(Number(ap.day) || 1, dim);
        list.push({
          kind: 'apport',
          id: ap.id,
          accId: ap.account_id,
          accName: accName(ap.account_id),
          label: ap.description,
          amount: (paidAmount != null && Number.isFinite(paidAmount)) ? paidAmount : budgetAmount,
          budgetAmount,
          day,
          date: `${mKey}-${String(day).padStart(2, '0')}`,
          paid: !!paidRec || !!ap.paid,
          category: 'Apport',
          is_apport: true,
          target_account_id: ap.target_account_id || null
        });
      });
      return list;
    },

    scoreVerifMatch(op, cand) {
      // Banque : sorties souvent négatives ; budget dépenses positives
      const bankAbs = Math.abs(Number(op.amount));
      const candAbs = Math.abs(Number(cand.amount));
      const amountDiff = Math.abs(bankAbs - candAbs);
      if (amountDiff > 0.05 && amountDiff / Math.max(bankAbs, 1) > 0.02) return 0;
      let score = 55;
      if (amountDiff <= 0.02) score += 20;
      else score += 10;

      const signBank = Number(op.amount) >= 0 ? 1 : -1;
      const expectIncome = cand.kind === 'income' || (cand.kind === 'wallet' && Number(cand.amount) < 0);
      // Apport = sortie (comme une dépense)
      if ((signBank > 0 && expectIncome) || (signBank < 0 && !expectIncome) || cand.kind === 'wallet-budget') score += 8;
      else if (cand.kind !== 'wallet') score -= 15;
      if (cand.kind === 'apport' && signBank < 0) score += 6;

      if (op.date && cand.date) {
        const d1 = new Date(op.date + 'T00:00:00');
        const d2 = new Date(cand.date + 'T00:00:00');
        const days = Math.abs((d1 - d2) / 86400000);
        if (days <= 1) score += 18;
        else if (days <= 3) score += 12;
        else if (days <= 7) score += 6;
        else if (days > 14 && cand.kind !== 'wallet-budget') score -= 10;
      }
      const sim = this.labelSimilarity(op.label, cand.label);
      score += Math.round(sim * 25);
      if (cand.paid && (cand.kind === 'expense' || cand.kind === 'apport' || cand.kind === 'income')) score += 4;
      // Léger bonus si même compte que le relevé
      if (cand.accId && this.verif.accId && cand.accId === this.verif.accId) score += 5;
      else if (cand.accId && this.verif.accId && cand.accId !== this.verif.accId) score -= 3;
      return Math.min(100, Math.max(0, score));
    },

    // Écart de score (points) sous lequel plusieurs propositions sont considérées « à égalité »
    VERIF_SCORE_TIE_WINDOW: 5,

    rematchVerif() {
      const accId = this.verif.accId || document.getElementById('verif-account')?.value;
      const mKey = this.verif.mKey || document.getElementById('verif-month')?.value || this.monthKey(new Date());
      this.verif.accId = accId;
      this.verif.mKey = mKey;
      if (!this.verif.ops.length) {
        this.renderVerifTable();
        this.renderUnverifiedExpenses();
        return;
      }

      const dbByFp = this.bankVerifByFingerprint(mKey);
      // Cherche sur tous les comptes (ex. crédit CIC ↔ dépense compte joint)
      const candidates = this.buildVerifCandidates(null, mKey);
      const candKey = (c) => c.kind === 'wallet-budget' ? null : this.verifLinkKey(c.kind, c.id);

      // Saisies déjà rattachées en base à une ligne banque (clé → empreinte)
      const dbTaken = new Map();
      this.getBankVerifsForMonth(mKey).forEach(v => {
        if (this.isManualVerifRow(v)) return;
        const k = this.verifRowLinkKey(v);
        if (k) dbTaken.set(k, v.fingerprint);
      });
      const takenByOther = (c, fp) => {
        const k = candKey(c);
        return !!k && dbTaken.has(k) && dbTaken.get(k) !== fp;
      };

      // 1) Liens enregistrés : prioritaires
      const pending = [];
      this.verif.ops.forEach(op => {
        const fp = this.verifFingerprint(op);
        const saved = dbByFp.get(fp);
        op.savedStatus = saved?.status || null;
        op.ignored = saved ? saved.status === 'ignored' : !!op.ignored;
        op.matchOptions = null;
        if (op.ignored) { op.match = null; return; }
        if (saved && saved.linked_kind && saved.linked_id) {
          op.matchCleared = false;
          op.match = this.verifMatchFromSaved(saved, candidates, op);
          return;
        }
        if (op.matchCleared) { op.match = null; return; }
        pending.push(op);
      });

      // 2) Suggestions : meilleur score d’abord, une saisie ne sert qu’une fois
      const scored = [];
      const byOp = new Map();
      pending.forEach(op => {
        const fp = this.verifFingerprint(op);
        const list = [];
        candidates.forEach(c => {
          if (takenByOther(c, fp)) return;
          const score = this.scoreVerifMatch(op, c);
          if (score < 55) return;
          scored.push({ op, cand: c, score });
          list.push({ ...c, score });
        });
        byOp.set(op.id, list.sort((a, b) => b.score - a.score));
      });
      scored.sort((a, b) => b.score - a.score);
      const usedBy = new Map();
      const assigned = new Map();
      scored.forEach(({ op, cand, score }) => {
        if (assigned.has(op.id)) return;
        const k = candKey(cand);
        if (k && usedBy.has(k)) return;
        if (k) usedBy.set(k, op.id);
        assigned.set(op.id, { ...cand, score });
      });

      const tieWin = this.VERIF_SCORE_TIE_WINDOW;
      pending.forEach(op => {
        const best = assigned.get(op.id) || null;
        op.match = best;
        if (!best) return;
        const near = (byOp.get(op.id) || []).filter(o => {
          if (best.score - o.score > tieWin) return false;
          const k = candKey(o);
          return !k || !usedBy.has(k) || usedBy.get(k) === op.id;
        });
        op.matchOptions = near.length > 1 ? near : null;
      });
      this.renderVerifTable();
    },
    // Reconstruit l’affichage d’un lien enregistré (même si la saisie n’est plus candidate)
    verifMatchFromSaved(saved, candidates, op) {
      const lk = saved.linked_kind;
      const lid = String(saved.linked_id);
      const savedTxId = saved.meta?.tx_id || saved.meta?.wallet_tx_id || null;
      const linked = candidates.find(c => {
        if (lk === 'wallet') {
          return c.kind === 'wallet' &&
            ((savedTxId && String(c.id) === String(savedTxId)) || String(c.id) === lid);
        }
        if (String(c.id) !== lid) return false;
        return c.kind === lk ||
          (lk === 'refund' && c.kind === 'income') ||
          (lk === 'expense' && c.kind === 'apport');
      });
      const base = { score: 100, fromDb: true };
      if (linked) {
        return {
          ...linked, ...base,
          kind: lk === 'refund' ? 'refund' : linked.kind,
          refundOf: saved.meta?.refund_of || linked.refundOf || null,
          paid: linked.kind === 'wallet' ? true : !!linked.paid
        };
      }
      const accId = saved.linked_account_id || null;
      const accName = (this.state.accounts.find(a => a.id === accId) || {}).name || '';
      const exc = lk === 'expense'
        ? this.listExceptionalExpenses(null, saved.month_key).find(e => String(e.id) === lid)
        : null;
      if (exc) {
        return {
          ...base, kind: 'expense', id: exc.id, accId: exc.account_id || accId,
          accName: accName || (this.state.accounts.find(a => a.id === exc.account_id) || {}).name || '',
          label: exc.description, category: exc.category || '', day: exc.day,
          amount: Number(exc.amount) || 0, paid: true, exceptional: true
        };
      }
      // Saisie supprimée / hors période : garder le lien visible
      const paidRec = this.isVerifPayableKind(lk) ? this.verifPaidRecord(lk, lid, accId, saved.month_key) : null;
      return {
        ...base, kind: lk, id: lid, accId, accName,
        label: saved.meta?.budget_label || 'Saisie liée',
        amount: paidRec ? Number(paidRec.amount) : Math.abs(Number(op.amount)),
        paid: lk === 'wallet' ? true : !!paidRec,
        refundOf: saved.meta?.refund_of || null
      };
    },

    renderVerif() {
      const accSel = document.getElementById('verif-account');
      const monthInp = document.getElementById('verif-month');
      const bankSel = document.getElementById('verif-bank');
      if (!accSel || !monthInp) return;
      const prevAcc = this.verif.accId || accSel.value;
      const ordered = this.getOrderedAccounts();
      accSel.innerHTML = ordered.map(a => `<option value="${a.id}">${this.esc(a.name)}</option>`).join('');
      const pick = ordered.some(a => a.id === prevAcc) ? prevAcc : (this.state.profile?.main_account_id || ordered[0]?.id || '');
      if (pick) accSel.value = pick;
      this.verif.accId = accSel.value;
      const mKey = this.verif.mKey || monthInp.value || this.monthKey(new Date());
      this.syncVerifMonthUi(mKey);
      this._verifMonthHandled = mKey;
      if (bankSel) {
        const saved = localStorage.getItem('bh-verif-bank') || this.verif.bank || 'auto';
        bankSel.value = saved;
        this.verif.bank = saved;
      }
      this.switchVerifPane(this.verif.pane || 'releve');
    },

    verifEnvelopeAmount(bankAmount) {
      const n = Number(bankAmount) || 0;
      if (n < 0) return Math.abs(n);
      if (n > 0) return -Math.abs(n);
      return 0;
    },

    verifMatchFacts(m) {
      if (!m) return null;
      const accounts = this.state.accounts || [];
      const expenses = this.state.expenses || [];
      const incomes = this.state.incomes || [];
      const accById = (id) => (accounts.find(a => a.id === id) || {}).name || '';
      const expById = (id) => expenses.find(e => String(e.id) === String(id)) || null;

      const accName = m.accName || accById(m.accId);
      let walletName = m.walletName || '';
      let subject = String(m.txLabel || m.label || '').replace(/^👛\s*/, '');
      let category = m.category || '';
      let day = m.day != null && m.day !== ''
        ? Number(m.day)
        : (m.date ? Number(String(m.date).slice(8, 10)) || null : null);
      if (!Number.isFinite(day) || day <= 0) day = null;
      let budgetAmt = m.budgetAmount != null ? Number(m.budgetAmount) : null;
      let targetName = '';

      if (m.kind === 'wallet' || m.kind === 'wallet-budget') {
        const expId = m.expId || (m.kind === 'wallet-budget' ? m.id : null);
        const exp = expId ? expById(expId) : null;
        if (exp) {
          walletName = walletName || exp.description || '';
          if (!category) category = exp.category || '';
        }
        if (!walletName && String(m.label || '').includes(' · ')) {
          walletName = String(m.label).split(' · ')[0].replace(/^👛\s*/, '');
        }
        if (m.kind === 'wallet') {
          if (m.txLabel) subject = m.txLabel;
          else if (String(m.label || '').includes(' · ')) subject = String(m.label).split(' · ').slice(1).join(' · ');
          else subject = subject || 'Mouvement';
        } else {
          subject = walletName || subject || 'Portefeuille';
          day = null;
        }
      } else if (m.kind === 'expense') {
        const exp = expById(m.id);
        if (exp) {
          if (!subject) subject = exp.description || '';
          if (!category) category = exp.category || '';
          if (!day) day = Number(exp.day) || null;
          if (budgetAmt == null || !Number.isFinite(budgetAmt)) budgetAmt = Number(exp.amount);
        }
      } else if (m.kind === 'income' || m.kind === 'refund') {
        const inc = incomes.find(i => String(i.id) === String(m.id));
        if (inc) {
          if (!subject) subject = inc.description || '';
          if (!day) day = Number(inc.day) || null;
          if (budgetAmt == null || !Number.isFinite(budgetAmt)) budgetAmt = Number(inc.amount);
        }
      } else if (m.kind === 'apport') {
        if (category === 'Apport') category = '';
        if (m.target_account_id) targetName = accById(m.target_account_id);
        if (this.verif?.mKey && (!subject || !day || budgetAmt == null || !targetName)) {
          const ap = this.listOutboundApportDues({ mKey: this.verif.mKey }).find(a => String(a.id) === String(m.id));
          if (ap) {
            if (!subject) subject = ap.description || '';
            if (!day) day = Number(ap.day) || null;
            if (budgetAmt == null || !Number.isFinite(budgetAmt)) budgetAmt = Number(ap.amount);
            if (!targetName && ap.target_account_id) targetName = accById(ap.target_account_id);
          }
        }
      }

      const isRefund = m.kind === 'refund' || /^remb\.?\s/i.test(subject);
      let kindLabel = '';
      if (m.kind === 'wallet') kindLabel = Number(m.amount) < 0 ? 'Remboursement' : 'Dépense';
      else if (m.kind === 'wallet-budget') kindLabel = 'Enveloppe';
      else if (m.kind === 'apport') kindLabel = 'Apport';
      else if (isRefund) kindLabel = 'Remboursement';
      else if (m.kind === 'income') kindLabel = 'Revenu';
      else if (m.kind === 'expense') kindLabel = 'Dépense';
      else kindLabel = m.kind || '';

      if (category && kindLabel && category.toLowerCase() === kindLabel.toLowerCase()) category = '';

      let status = '';
      if (m.kind === 'wallet') status = 'saisi';
      else if (m.kind === 'wallet-budget') status = 'à rattacher';
      else if (m.paid && (m.kind === 'income' || isRefund)) status = 'encaissé';
      else if (m.paid) status = 'validé';
      else status = 'prévu';

      const shownAmt = Number(m.amount);
      let budgetHint = '';
      if (m.paid && budgetAmt != null && Number.isFinite(budgetAmt) && Number.isFinite(shownAmt) && Math.abs(budgetAmt - shownAmt) > 0.009) {
        budgetHint = 'budget ' + this.fmt(budgetAmt);
      }

      const showWallet = m.kind === 'wallet' && !!walletName && walletName !== subject;
      return {
        accName,
        subject: subject || '—',
        walletPill: showWallet ? walletName : '',
        logoOnSubject: m.kind === 'wallet-budget' || (m.kind === 'wallet' && !!walletName && !showWallet),
        category,
        day,
        kindLabel,
        status,
        targetName,
        amountHtml: this.fmt(Number.isFinite(shownAmt) ? shownAmt : 0),
        budgetHint,
        linked: !!m.fromDb
      };
    },

    renderVerifTable() {
      const tbody = document.getElementById('verif-tbody');
      if (!tbody) return;
      const ops = this.verif.ops || [];
      let matched = 0, pending = 0;
      ops.forEach(o => {
        if (o.ignored) return;
        if (o.match && o.match.score >= 70) matched++;
        else pending++;
      });
      const elB = document.getElementById('verif-stat-bank');
      const elT = document.getElementById('verif-stat-total');
      const elM = document.getElementById('verif-stat-matched');
      const elP = document.getElementById('verif-stat-pending');
      if (elB) elB.textContent = this.bankLabel(this.verif.bankDetected) || '—';
      if (elT) elT.textContent = String(ops.length);
      if (elM) elM.textContent = String(matched);
      if (elP) elP.textContent = String(pending);
      this.renderUnverifiedExpenses();
      this.syncVerifFilterUi();

      if (!ops.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="bh-verif-empty">Importe un relevé pour comparer avec tes saisies.</td></tr>';
        return;
      }

      const formatVerifMatchBody = (m, scoreHtml) => {
        const f = this.verifMatchFacts(m);
        if (!f) return '';
        const acc = f.accName
          ? `<span class="bh-verif-acc-tag">${this.esc(f.accName)}</span>`
          : '';
        const origin = f.linked
          ? '<span class="bh-verif-origin linked">Lié</span>'
          : '<span class="bh-verif-origin detected">Détecté</span>';
        const subject = f.logoOnSubject
          ? `<strong class="bh-verif-wallet">👛 ${this.esc(f.subject)}</strong>`
          : `<strong>${this.esc(f.subject)}</strong>`;
        const wallet = f.walletPill
          ? `<span class="bh-verif-wallet">👛 ${this.esc(f.walletPill)}</span>`
          : '';
        const score = scoreHtml ? `<span class="alt-score">${scoreHtml}</span>` : '';
        const bits = [];
        const add = (html) => { if (html) bits.push(html); };
        add(`<span class="num">${f.amountHtml}</span>`);
        if (f.day) add('le ' + f.day);
        if (f.category) add(this.esc(f.category));
        if (f.kindLabel) add(this.esc(f.kindLabel));
        if (f.status) add(this.esc(f.status));
        if (f.targetName) add('vers ' + this.esc(f.targetName));
        if (f.budgetHint) add(this.esc(f.budgetHint));
        return `<div class="bh-verif-match">
          <div class="bh-verif-match-l1">${acc}${origin}${subject}${wallet}${score}</div>
          <div class="bh-verif-match-l2">${bits.join('<span class="sep">·</span>')}</div>
        </div>`;
      };
      const formatVerifMatchDest = (m) => formatVerifMatchBody(m, '');
      const formatVerifMatchOptions = (op) => {
        const opts = op.matchOptions || [];
        if (opts.length < 2) return formatVerifMatchDest(op.match);
        const cur = op.match;
        return `<div class="bh-verif-match-alts">
          <div class="bh-verif-alts-hint">Plusieurs propositions proches — choisis :</div>
          ${opts.map(m => {
            const selected = cur && cur.kind === m.kind && String(cur.id) === String(m.id);
            const sc = Math.min(100, Number(m.score) || 0);
            return `<button type="button" class="bh-verif-alt${selected ? ' selected' : ''}"
              title="Utiliser cette proposition"
              onclick="BH.pickVerifMatchOption('${op.id}','${m.kind}','${String(m.id).replace(/\\/g,'\\\\').replace(/'/g,"\\'")}')">
              ${formatVerifMatchBody(m, sc + '&nbsp;%')}
            </button>`;
          }).join('')}
        </div>`;
      };

      const visible = ops.filter(op => this.verifOpPassesFilters(op));
      if (!visible.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="bh-verif-empty">Aucune ligne pour ce filtre.</td></tr>';
        return;
      }

      tbody.innerHTML = visible.slice().sort((a,b) => (a.date || '').localeCompare(b.date || '')).map(op => {
        const score = op.match ? Number(op.match.score) || 0 : 0;
        const cls = op.ignored ? 'ignored' : (op.match && score >= 70 ? 'matched' : '');
        const amtColor = op.amount < 0 ? 'var(--clay)' : 'var(--sage-deep)';
        const dateLbl = op.date ? new Date(op.date + 'T00:00:00').toLocaleDateString('fr-FR') : '—';
        let matchHtml = '<span style="color:var(--ink-faint);">Non trouvé</span>';
        if (op.ignored) matchHtml = '<span style="color:var(--ink-faint);">Oublié</span>';
        else if (op.matchOptions && op.matchOptions.length > 1) matchHtml = formatVerifMatchOptions(op);
        else if (op.match) matchHtml = formatVerifMatchDest(op.match);
        const multiNear = !!(op.matchOptions && op.matchOptions.length > 1);
        const scoreCls = !op.match || op.ignored ? 'lo' : (score >= 70 ? 'hi' : (score >= 55 ? 'mid' : 'lo'));
        const scoreHtml = op.ignored
          ? '—'
          : (op.match
            ? (multiNear ? `${score}&nbsp;% <span style="font-weight:500;font-size:10px;color:var(--ink-faint);">(${op.matchOptions.length})</span>` : `${score}&nbsp;%`)
            : '—');
        const savedLink = this.isVerifOpSavedLink(op);
        const canValidate = op.match && !op.match.exceptional && this.isVerifPayableKind(op.match.kind);
        const already = !!(op.match && op.match.paid);
        const validateBtn = canValidate
          ? `<button type="button" class="bh-btn ${already ? 'bh-btn-done' : 'bh-btn-primary'}" title="${already ? 'Déjà validé — rouvrir pour ajuster le montant (ponctuel / durable)' : 'Choisir le montant et ponctuel / durable'}" onclick="BH.applyVerifMatch('${op.id}')">${already ? 'Déjà validé' : 'Valider'}</button>`
          : '';
        // Portefeuille : déjà dedans (vert pâle) / enveloppe suggérée (vert) / sinon ouvrir le choix
        let walletBtn = '';
        if (op.match && op.match.kind === 'wallet' && savedLink) {
          walletBtn = `<span class="bh-btn bh-btn-done" title="Mouvement portefeuille lié et vérifié">👛 Vérifié</span>`;
        } else if (op.match && op.match.kind === 'wallet') {
          walletBtn = `<button type="button" class="bh-btn bh-btn-done" title="Confirmer que ce mouvement est déjà dans le portefeuille" onclick="BH.confirmExistingWalletVerif('${op.id}')">Dans portefeuille</button>`;
        } else if (op.match && op.match.kind === 'wallet-budget') {
          walletBtn = `<button type="button" class="bh-btn bh-btn-primary" title="Ajouter ce montant dans l’enveloppe suggérée" onclick="BH.applyVerifWalletMatch('${op.id}')">+ Portefeuille</button>`;
        } else {
          walletBtn = `<button type="button" class="bh-btn bh-btn-outline" title="Ajouter ce montant dans un portefeuille (enveloppe)" onclick="BH.openVerifWallet('${op.id}')">👛</button>`;
        }
        const refundBtn = Number(op.amount) > 0
          ? `<button type="button" class="bh-btn bh-btn-outline" title="Créer un remboursement lié à une dépense déjà saisie (ex. frais bancaires remboursés)" onclick="BH.openVerifRefund('${op.id}')">Rembours.</button>`
          : '';
        const exceptionalBtn = Number(op.amount) < 0 && !savedLink
          ? `<button type="button" class="bh-btn bh-btn-outline" title="Enregistrer cette sortie comme dépense exceptionnelle (ponctuelle) et la lier à cette ligne" onclick="BH.saisieVerifBankGap('${op.id}')">Exceptionnelle</button>`
          : '';
        const unlinkBtn = !op.match ? ''
          : savedLink
            ? `<button type="button" class="bh-btn bh-btn-ghost" title="Supprimer le lien enregistré (et éventuellement la validation)" onclick="BH.unlinkVerifOp('${op.id}')">Délier</button>`
            : `<button type="button" class="bh-btn bh-btn-ghost" title="Retirer cette suggestion" onclick="BH.clearVerifMatch('${op.id}')">Délier</button>`;
        const actions = op.ignored
          ? `<button type="button" class="bh-btn bh-btn-ghost" title="Remettre cette ligne dans la liste à traiter" onclick="BH.unignoreVerifOp('${op.id}')">Réafficher</button>`
          : `<div class="bh-verif-actions">
              ${validateBtn}
              <button type="button" class="bh-btn bh-btn-outline" title="Rattacher une saisie de ce compte, pour août" onclick="BH.openVerifLink('${op.id}')">Lier</button>
              <button type="button" class="bh-btn bh-btn-outline" title="Rattacher une saisie d’un autre compte" onclick="BH.openVerifLink('${op.id}','compte')">Autre compte</button>
              <button type="button" class="bh-btn bh-btn-outline" title="Rattacher une saisie d’un mois passé ou à venir" onclick="BH.openVerifLink('${op.id}','mois')">Autre mois</button>
              ${unlinkBtn}
              ${refundBtn}
              ${exceptionalBtn}
              <button type="button" class="bh-btn bh-btn-outline" title="Créer une nouvelle dépense ou un nouveau revenu prérempli" onclick="BH.verifAddAsEntry('${op.id}')">+ Saisie</button>
              ${walletBtn}
              <button type="button" class="bh-btn bh-btn-ghost" title="Ignorer ce mouvement (frais, doublon, hors budget…)" onclick="BH.ignoreVerifOp('${op.id}')">Oublier</button>
            </div>`;
        return `<tr class="${cls}">
          <td>${dateLbl}</td>
          <td title="${this.esc(op.labelRaw || op.label)}">${this.esc(op.label)}</td>
          <td class="num" style="text-align:right;color:${amtColor};">${this.fmt(op.amount)}</td>
          <td class="num bh-verif-score-cell ${scoreCls}" style="text-align:right;">${scoreHtml}</td>
          <td>${matchHtml}</td>
          <td>${actions}</td>
        </tr>`;
      }).join('');
    },

    showVerifActionsHelp() {
      this.openInfo('Actions de vérification', `
        <div style="font-size:13px; line-height:1.45; color:var(--ink);">
          <p style="margin:0 0 12px;"><strong>Valider / Déjà validé</strong> — Ouvre le même formulaire qu’Aujourd’hui : montant réel + ponctuel (ce mois) ou durable (montant habituel). Vert pâle = déjà fait ce mois-ci.</p>
          <p style="margin:0 0 12px;"><strong>Lien budget</strong> — Compte, Détecté (suggestion) ou Lié (déjà rattaché), libellé, portefeuille avec 👛, montant, jour et catégorie. Si le montant validé diffère du budget, le budget est rappelé. Si plusieurs propositions ont un score proche (±5 pts), elles sont listées : clique pour choisir.</p>
          <p style="margin:0 0 12px;"><strong>Lier</strong> — Saisie de ce compte, pour le mois du relevé. Le lien valide le paiement et l’enregistre.</p>
          <p style="margin:0 0 12px;"><strong>Autre compte</strong> — Saisie d’un autre compte, même mois (dépense couple, apport, revenu). Le paiement s’écrit sur ce compte.</p>
          <p style="margin:0 0 12px;"><strong>Autre mois</strong> — Rattrapage (mois passé) ou Anticipé (mois à venir). Le paiement s’écrit sur ce mois-là, le rapprochement reste sur le relevé.</p>
          <p style="margin:0 0 12px;"><strong>Délier</strong> — Sur une suggestion : la retire. Sur un lien enregistré : supprime le lien, et propose d’annuler aussi la validation du mois.</p>
          <p style="margin:0 0 12px;"><strong>Rembours.</strong> — Pour un crédit banque : crée un revenu lié à une dépense existante, avec date de fin optionnelle (frais remboursés jusqu’à un mois).</p>
          <p style="margin:0 0 12px;"><strong>+ Saisie</strong> — Crée une nouvelle dépense ou un revenu (formulaire prérempli). À l’enregistrement, elle est validée et liée à la ligne du relevé.</p>
          <p style="margin:0 0 12px;"><strong>Exceptionnelle</strong> — Sur une sortie pas encore liée : ouvre une dépense exceptionnelle préremplie, liée à cette ligne à l’enregistrement.</p>
          <p style="margin:0 0 12px;"><strong>+ Portefeuille / Dans portefeuille</strong> — Ajoute dans une enveloppe, ou confirme qu’un mouvement déjà saisi est vérifié. « 👛 Vérifié » = lien enregistré.</p>
          <p style="margin:0 0 12px;"><strong>Oublier</strong> — Ignore la ligne (enregistré en base). Sur une ligne déjà liée, propose d’annuler aussi la validation.</p>
          <p style="margin:0 0 12px;"><strong>Réafficher</strong> — Remet une ligne oubliée dans la liste.</p>
          <p style="margin:0 0 12px;"><strong>Vérifier</strong> (onglet Statut et écarts) — Pour une saisie déjà validée sans ligne de relevé : une confirmation la marque « Vérifié (manuel) ». « Retirer » annule ce marquage.</p>
          <p style="margin:0;"><strong>Enregistrer</strong> — Valide et lie en une fois toutes les correspondances solides (≥ 70 %) et les lignes oubliées, puis ouvre le récap des écarts. Si tout colle : message « tout est rapproché ».</p>
        </div>
      `);
    },

    findVerifOp(opId) {
      return (this.verif.ops || []).find(o => o.id === opId);
    },
    pickVerifMatchOption(opId, kind, id) {
      const op = this.findVerifOp(opId);
      if (!op?.matchOptions?.length) return;
      const chosen = op.matchOptions.find(m => m.kind === kind && String(m.id) === String(id));
      if (!chosen) return;
      op.matchCleared = false;
      op.match = { ...chosen };
      this.refreshVerifUi();
    },
    clearVerifMatch(opId) {
      const op = this.findVerifOp(opId);
      if (!op?.match) return;
      if (this.isVerifOpSavedLink(op)) { this.unlinkVerifOp(opId); return; }
      op.match = null;
      op.matchOptions = null;
      op.matchCleared = true;
      this.refreshVerifUi();
      toast('Suggestion retirée');
    },
    isVerifOpSavedLink(op) {
      return !!op && (op.savedStatus === 'matched' || op.savedStatus === 'wallet' || op.savedStatus === 'refund');
    },
    // Demande s’il faut aussi annuler la validation du mois (null = abandon)
    askUndoPaid(op, action) {
      const m = op?.match;
      const undoable = m && m.paid && !m.exceptional && this.isVerifPayableKind(m.kind);
      if (!confirm(`${action} le lien avec « ${m?.label || 'la saisie'} » ?`)) return null;
      if (!undoable) return false;
      return confirm(`Annuler aussi la validation de « ${m.label || 'la saisie'} » pour ce mois ?\n\nOK = remettre en non payé · Annuler = garder validé`);
    },
    async unlinkVerifOp(opId) {
      const op = this.findVerifOp(opId);
      if (!op?.match) return;
      const undoPaid = this.askUndoPaid(op, 'Supprimer');
      if (undoPaid === null) return;
      const m = op.match;
      const ok = await this.runVerif('suppression du lien', async () => {
        await this.deleteBankVerifRow(this.verifMonthKey(op), this.verifFingerprint(op));
        if (undoPaid) await this.verifRemovePaid(m.kind, m.id, m.accId, this.verifMonthKey(op));
        op.match = null;
        op.matchOptions = null;
        op.matchCleared = true;
        op.savedStatus = null;
        return true;
      });
      if (ok) toast(undoPaid ? 'Lien supprimé et validation annulée' : 'Lien supprimé');
    },
    async ignoreVerifOp(opId) {
      const op = this.findVerifOp(opId);
      if (!op) return;
      let undoPaid = false;
      if (op.match && this.isVerifOpSavedLink(op)) {
        undoPaid = this.askUndoPaid(op, 'Oublier cette ligne et supprimer');
        if (undoPaid === null) return;
      }
      const m = op.match;
      const ok = await this.runVerif('oubli de la ligne', async () => {
        if (undoPaid && m) await this.verifRemovePaid(m.kind, m.id, m.accId, this.verifMonthKey(op));
        await this.sendBankVerifRows([this.buildBankVerifRow(op, 'ignored', null)]);
        op.ignored = true;
        op.match = null;
        op.matchOptions = null;
        op.matchCleared = false;
        op.savedStatus = 'ignored';
        return true;
      });
      if (ok) toast('Ligne oubliée');
    },
    async unignoreVerifOp(opId) {
      const op = this.findVerifOp(opId);
      if (!op) return;
      const ok = await this.runVerif('réaffichage', async () => {
        await this.deleteBankVerifRow(this.verifMonthKey(op), this.verifFingerprint(op));
        op.ignored = false;
        op.savedStatus = null;
        return true;
      });
      if (!ok) return;
      const set = this.loadVerifIgnored();
      if (set.delete(this.verifFingerprint(op))) this.saveVerifIgnored(set);
      this.rematchVerif();
    },
    async clearVerifIgnored() {
      const ignoredOps = (this.verif.ops || []).filter(o => o.ignored || o.savedStatus === 'ignored');
      const ok = await this.runVerif('réaffichage des oubliés', async () => {
        for (const o of ignoredOps) {
          await this.deleteBankVerifRow(this.verifMonthKey(o), this.verifFingerprint(o));
          o.ignored = false;
          o.savedStatus = null;
        }
        return true;
      });
      if (!ok) return;
      this.saveVerifIgnored(new Set());
      this.rematchVerif();
      toast('Oubliés réaffichés');
    },

    applyVerifMatch(opId) {
      const op = this.findVerifOp(opId);
      if (!op?.match) return;
      const m = op.match;
      if (!(m.kind === 'expense' || m.kind === 'apport' || m.kind === 'income' || m.kind === 'refund')) return;
      const daKind = (m.kind === 'income' || m.kind === 'refund') ? 'income' : 'expense';
      const mKey = this.verif.mKey || document.getElementById('verif-month')?.value || this.monthKey(new Date());
      this.openDifferentAmount(m.id, m.accId, daKind, {
        amount: Math.abs(Number(op.amount)),
        mKey,
        opId: op.id,
        linkKind: m.kind,
        score: m.score,
        title: m.paid ? 'Ajuster la validation' : 'Valider depuis le relevé'
      });
    },

    async applyVerifWalletMatch(opId) {
      const op = this.findVerifOp(opId);
      if (!op?.match || op.match.kind !== 'wallet-budget') {
        this.openVerifWallet(opId);
        return;
      }
      await this.verifLinkToWallet(op, op.match.id, op.match.accId);
    },
    async confirmExistingWalletVerif(opId) {
      const op = this.findVerifOp(opId);
      if (!op?.match || op.match.kind !== 'wallet' || !op.match.id || op.match.id === 'new') {
        this.openVerifWallet(opId);
        return;
      }
      const ok = await this.runVerif('vérification portefeuille', async () => {
        await this.verifCommitLink(op, { ...op.match, paid: true });
        return true;
      });
      if (ok) toast('Mouvement portefeuille vérifié');
    },

    shiftMonthKey(mKey, delta) {
      const [y, m] = String(mKey || this.monthKey(new Date())).split('-').map(Number);
      return this.monthKey(new Date(y, m - 1 + delta, 1));
    },
    guessVerifMonthSide(op) {
      const base = this.verif.mKey || this.monthKey(new Date());
      const accId = this.verif.accId || null;
      const scoreAt = (mKey) => {
        let best = 0;
        this.buildVerifCandidates(accId, mKey).forEach(c => {
          if (c.kind === 'wallet' || c.kind === 'wallet-budget') return;
          best = Math.max(best, this.scoreVerifMatchForLink(op, c));
        });
        return best;
      };
      const past = scoreAt(this.shiftMonthKey(base, -1));
      const next = scoreAt(this.shiftMonthKey(base, 1));
      if (next >= 40 && next > past) return 'anticipe';
      return 'retard';
    },
    setVerifLinkMonthSide(side, skipRefresh) {
      const base = this.verif.mKey || this.monthKey(new Date());
      const next = side === 'anticipe';
      this.verif.linkMonthSide = next ? 'anticipe' : 'retard';
      this.verif.linkPayMonth = this.shiftMonthKey(base, next ? 1 : -1);
      document.querySelectorAll('#verif-link-month-modes [data-month-side]').forEach(btn => {
        const on = btn.getAttribute('data-month-side') === this.verif.linkMonthSide;
        btn.classList.toggle('bh-btn-primary', on);
        btn.classList.toggle('bh-btn-outline', !on);
      });
      const desc = document.getElementById('verif-link-desc');
      const op = this.findVerifOp(this.verif.linkOpId);
      if (desc && op) {
        const when = next ? 'anticipé' : 'rattrapage';
        desc.textContent = `${op.date || ''} · ${op.label} · ${this.fmt(op.amount)} · paiement sur ${this.formatMonthKey(this.verif.linkPayMonth)} (${when})`;
      }
      if (!skipRefresh) this.refreshVerifLinkList();
    },
    openVerifLink(opId, mode) {
      const op = this.findVerifOp(opId);
      if (!op) return;
      const linkMode = mode === 'compte' || mode === 'mois' ? mode : 'lien';
      const statementAcc = this.verif.accId || document.getElementById('verif-account')?.value || '';
      const ordered = this.getOrderedAccounts();
      const others = ordered.filter(a => a.id !== statementAcc);
      if (linkMode === 'compte' && !others.length) {
        toast('Aucun autre compte.');
        return;
      }
      this.verif.linkOpId = opId;
      this.verif.linkMode = linkMode;
      const isOut = Number(op.amount) < 0;
      const looksApport = /apport|virement\s*[ée]mis|vir\s*inst|vers\s/i.test(op.label || '');
      this.verif.linkKindFilter = (linkMode === 'lien' && isOut && looksApport) ? 'apport' : '';
      const title = document.getElementById('verif-link-title');
      const monthBox = document.getElementById('verif-link-month-modes');
      const accSel = document.getElementById('verif-link-account');
      const mKey = this.verif.mKey || this.monthKey(new Date());
      if (title) {
        title.textContent = linkMode === 'compte'
          ? 'Autre compte'
          : (linkMode === 'mois' ? 'Rattrapage ou anticipé' : 'Lier à une saisie');
      }
      if (monthBox) monthBox.style.display = linkMode === 'mois' ? 'flex' : 'none';
      if (linkMode === 'compte') {
        accSel.innerHTML = others.map(a => `<option value="${a.id}">${this.esc(a.name)}</option>`).join('');
        accSel.disabled = false;
        this.verif.linkPayMonth = mKey;
      } else if (linkMode === 'mois') {
        const current = ordered.find(a => a.id === statementAcc);
        accSel.innerHTML = current
          ? `<option value="${current.id}">${this.esc(current.name)}</option>`
          : ordered.map(a => `<option value="${a.id}">${this.esc(a.name)}</option>`).join('');
        if (statementAcc) accSel.value = statementAcc;
        accSel.disabled = true;
        this.setVerifLinkMonthSide(this.guessVerifMonthSide(op), true);
      } else {
        const current = ordered.find(a => a.id === statementAcc);
        const pool = current ? [current] : ordered;
        accSel.innerHTML = pool.map(a => `<option value="${a.id}">${this.esc(a.name)}</option>`).join('');
        if (statementAcc) accSel.value = statementAcc;
        accSel.disabled = false;
        this.verif.linkPayMonth = mKey;
        const mainId = this.state.profile?.main_account_id || '';
        if (this.verif.linkKindFilter === 'apport' && mainId) accSel.value = mainId;
      }
      document.getElementById('verif-link-desc').textContent = linkMode === 'mois'
        ? document.getElementById('verif-link-desc').textContent
        : `${op.date || ''} · ${op.label} · ${this.fmt(op.amount)}`;
      const search = document.getElementById('verif-link-search');
      if (search) search.value = '';
      this.syncVerifLinkKindUi();
      this.refreshVerifLinkList();
      this.presentOverlay('bh-verif-link-overlay');
    },
    setVerifLinkKind(kind) {
      this.verif.linkKindFilter = kind || '';
      this.syncVerifLinkKindUi();
      if (kind === 'apport' && this.verif.linkMode !== 'mois') {
        const mainId = this.state.profile?.main_account_id || '';
        const accSel = document.getElementById('verif-link-account');
        if (accSel && mainId && !accSel.disabled) accSel.value = mainId;
      }
      this.refreshVerifLinkList();
    },
    syncVerifLinkKindUi() {
      const cur = this.verif.linkKindFilter || '';
      document.querySelectorAll('#verif-link-kind-filters [data-link-kind]').forEach(btn => {
        const k = btn.getAttribute('data-link-kind') || '';
        const active = k === cur;
        btn.classList.toggle('bh-btn-primary', active);
        btn.classList.toggle('bh-btn-outline', !active);
      });
    },
    scoreVerifMatchForLink(op, cand) {
      // Score souple pour la liaison manuelle : on n’exclut pas si le montant diffère
      const hard = this.scoreVerifMatch(op, cand);
      if (hard > 0) return hard;
      const bankAbs = Math.abs(Number(op.amount));
      const candAbs = Math.abs(Number(cand.amount));
      const amountDiff = Math.abs(bankAbs - candAbs);
      const ratio = amountDiff / Math.max(bankAbs, candAbs, 1);
      let score = Math.max(5, Math.round(45 - ratio * 45));
      score += Math.round(this.labelSimilarity(op.label, cand.label) * 30);
      const signBank = Number(op.amount) >= 0 ? 1 : -1;
      const expectOut = cand.kind === 'expense' || cand.kind === 'apport'
        || cand.kind === 'wallet-budget'
        || (cand.kind === 'wallet' && Number(cand.amount) >= 0);
      if ((signBank < 0 && expectOut) || (signBank > 0 && !expectOut)) score += 8;
      if (cand.kind === 'apport' && signBank < 0) score += 10;
      return Math.max(1, Math.min(100, score));
    },
    // Candidat déjà lié en BDD (bank_verifications) ou associé à une autre ligne du relevé en cours
    isVerifCandidateAlreadyLinked(cand, mKey, excludeOpId) {
      if (!cand || cand.kind === 'wallet-budget') return false; // enveloppe réutilisable (nouvelles txs)
      const id = String(cand.id);
      const sets = this.verifiedLinkedSets(mKey);
      if (cand.kind === 'expense' || cand.kind === 'apport') {
        if (sets.expense.has(id)) return true;
      } else if (cand.kind === 'income') {
        if (sets.income.has(id)) return true;
      } else if (cand.kind === 'wallet') {
        if (sets.wallet.has(id)) return true;
      }
      const ops = this.verif.ops || [];
      for (let i = 0; i < ops.length; i++) {
        const other = ops[i];
        if (!other || other.ignored || !other.match) continue;
        if (excludeOpId && other.id === excludeOpId) continue;
        const m = other.match;
        if (!m || m.kind === 'wallet-budget') continue;
        if (String(m.id) !== id) continue;
        if (m.kind === cand.kind) return true;
        // Même id dépense / apport selon le matching
        if ((cand.kind === 'expense' || cand.kind === 'apport') &&
            (m.kind === 'expense' || m.kind === 'apport')) return true;
      }
      return false;
    },
    refreshVerifLinkList() {
      const op = this.findVerifOp(this.verif.linkOpId);
      const list = document.getElementById('verif-link-list');
      if (!op || !list) return;
      const accFilter = document.getElementById('verif-link-account')?.value || '';
      const q = (document.getElementById('verif-link-search')?.value || '').trim().toLowerCase();
      const kindFilter = this.verif.linkKindFilter || '';
      const statementKey = this.verif.mKey || this.monthKey(new Date());
      const mKey = this.verif.linkPayMonth || statementKey;
      const linkMode = this.verif.linkMode || 'lien';
      let cands = this.buildVerifCandidates(accFilter || null, mKey)
        .filter(c => c.kind !== 'wallet' && c.kind !== 'wallet-budget')
        .filter(c => !this.isVerifCandidateAlreadyLinked(c, mKey, this.verif.linkOpId))
        .filter(c => mKey === statementKey || !this.isVerifCandidateAlreadyLinked(c, statementKey, this.verif.linkOpId));
      if (linkMode === 'compte') {
        const statementAcc = this.verif.accId || '';
        cands = cands.filter(c => c.accId !== statementAcc);
      }
      cands = cands
        .map(c => ({ ...c, score: this.scoreVerifMatchForLink(op, c) }))
        .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label, 'fr'));

      if (kindFilter === 'expense') {
        cands = cands.filter(c => c.kind === 'expense');
      } else if (kindFilter === 'wallet') {
        cands = cands.filter(c => c.kind === 'wallet' || c.kind === 'wallet-budget');
      } else if (kindFilter === 'income') {
        cands = cands.filter(c => c.kind === 'income');
      } else if (kindFilter === 'apport') {
        cands = cands.filter(c => c.kind === 'apport');
      }

      if (q) {
        cands = cands.filter(c =>
          [c.label, c.accName, c.kind, c.category, String(c.amount)].join(' ').toLowerCase().includes(q)
        );
      }

      const kindFr = { expense: 'Dépense', apport: 'Apport', income: 'Revenu', wallet: 'Portefeuille', 'wallet-budget': 'Enveloppe' };
      const limit = kindFilter ? 100 : 60;
      list.innerHTML = cands.length
        ? cands.slice(0, limit).map(c => `
          <div class="bh-manage-row" style="cursor:pointer;" onclick="BH.confirmVerifLink('${c.kind}','${c.id}','${c.expId || ''}','${c.accId}')">
            <div>
              <div style="font-weight:600;font-size:13.5px;"><span class="bh-verif-acc-tag">${this.esc(c.accName || '')}</span>${this.esc(c.label)}</div>
              <div style="font-size:11px;color:var(--ink-faint);">${kindFr[c.kind] || c.kind}${c.paid ? ' · déjà traité' : ''} · ${this.fmt(c.amount)} · score ${c.score}%</div>
            </div>
            <div class="num">${this.fmt(c.amount)}</div>
          </div>`).join('')
        : `<div class="bh-empty">${kindFilter === 'apport'
            ? 'Aucun apport non lié (compte principal + contribution vers un compte partagé).'
            : 'Aucune saisie non liée pour ce mois.'}</div>`;
    },
    closeVerifLink() {
      document.getElementById('bh-verif-link-overlay').classList.remove('open', 'front');
      const accSel = document.getElementById('verif-link-account');
      if (accSel) accSel.disabled = false;
      this.verif.linkOpId = null;
      this.verif.linkMode = 'lien';
      this.verif.linkPayMonth = null;
    },
    async confirmVerifLink(kind, id, expId, accIdParam) {
      const op = this.findVerifOp(this.verif.linkOpId);
      if (!op) return;
      const payMonth = this.verif.linkPayMonth || null;
      const accId = accIdParam || this.verif.accId;
      const accName = (this.state.accounts.find(a => a.id === accId) || {}).name || '';
      const mKey = this.verifMonthKey(op);
      this.closeVerifLink();
      if (kind === 'wallet-budget') {
        await this.verifLinkToWallet(op, id, accId);
        return;
      }
      let match;
      if (kind === 'expense' || kind === 'apport') {
        const exp = kind === 'apport'
          ? this.listOutboundApportDues({ mKey: payMonth || mKey }).find(a => a.id === id)
          : this.state.expenses.find(e => e.id === id);
        match = {
          kind, id, accId, accName,
          label: exp?.description || (kind === 'apport' ? 'Apport' : 'Dépense'),
          category: kind === 'expense' ? (exp?.category || '') : '',
          day: exp?.day,
          budgetAmount: exp?.amount != null ? Number(exp.amount) : null,
          target_account_id: exp?.target_account_id || null,
          score: 100
        };
      } else if (kind === 'income') {
        const inc = this.state.incomes.find(e => e.id === id);
        match = {
          kind, id, accId, accName,
          label: inc?.description || 'Revenu',
          day: inc?.day,
          budgetAmount: inc?.amount != null ? Number(inc.amount) : null,
          score: 100
        };
      } else if (kind === 'wallet') {
        match = this.walletVerifMatch(op, id, expId || null, accId);
      } else {
        return;
      }
      const statementKey = this.verifMonthKey(op);
      if (payMonth && payMonth !== statementKey) match.payMonth = payMonth;
      const ok = await this.runVerif('liaison', async () => {
        await this.verifCommitLink(op, match, { markPaid: true });
        return true;
      });
      if (!ok) return;
      if (match.payMonth && match.payMonth > statementKey) toast('Lié sur ' + this.formatMonthKey(match.payMonth) + ' (anticipé)');
      else if (match.payMonth && match.payMonth < statementKey) toast('Lié sur ' + this.formatMonthKey(match.payMonth) + ' (rattrapage)');
      else toast(kind === 'wallet' ? 'Mouvement portefeuille lié' : 'Lié et validé');
    },

    openVerifRefund(opId) {
      const op = this.findVerifOp(opId);
      if (!op || !(Number(op.amount) > 0)) {
        toast('Le remboursement s’applique aux crédits (montants positifs).');
        return;
      }
      this.verif.refundOpId = opId;
      document.getElementById('verif-refund-desc').textContent =
        `${op.date} · ${op.label} · ${this.fmt(op.amount)}`;
      const ordered = this.getOrderedAccounts();
      const accOpts = ordered.map(a => `<option value="${a.id}">${this.esc(a.name)}</option>`).join('');
      const expAcc = document.getElementById('verif-refund-account');
      const incAcc = document.getElementById('verif-refund-income-account');
      expAcc.innerHTML = accOpts;
      incAcc.innerHTML = accOpts;
      // Dépense souvent sur un autre compte ; crédit reçu sur le compte du relevé
      expAcc.value = ordered[0]?.id || '';
      incAcc.value = this.verif.accId || ordered[0]?.id || '';
      const until = document.getElementById('verif-refund-until');
      const untilMonth = document.getElementById('verif-refund-until-month');
      if (until) until.checked = false;
      document.getElementById('verif-refund-until-wrap').style.display = 'none';
      if (untilMonth) untilMonth.value = this.verif.mKey || this.monthKey(new Date());
      this.refreshVerifRefundExpenses();
      this.presentOverlay('bh-verif-refund-overlay');
    },
    refreshVerifRefundExpenses() {
      const accId = document.getElementById('verif-refund-account')?.value;
      const sel = document.getElementById('verif-refund-expense');
      if (!sel) return;
      const mKey = this.verif.mKey || this.monthKey(new Date());
      const exps = (this.state.expenses || [])
        .filter(e => e.account_id === accId && !e.is_wallet && this.isActiveInMonth(e, mKey))
        .slice()
        .sort((a, b) => Math.abs(Number(a.amount) - Math.abs(Number(this.findVerifOp(this.verif.refundOpId)?.amount) || 0))
          - Math.abs(Number(b.amount) - Math.abs(Number(this.findVerifOp(this.verif.refundOpId)?.amount) || 0)));
      sel.innerHTML = exps.length
        ? exps.map(e => `<option value="${e.id}">${this.esc(e.description)} · ${this.fmt(e.amount)}${e.category ? ' · ' + this.esc(e.category) : ''}</option>`).join('')
        : '<option value="">Aucune dépense sur ce compte</option>';
    },
    closeVerifRefund() {
      document.getElementById('bh-verif-refund-overlay').classList.remove('open', 'front');
      this.verif.refundOpId = null;
    },
    async confirmVerifRefund() {
      const op = this.findVerifOp(this.verif.refundOpId);
      const expId = document.getElementById('verif-refund-expense')?.value;
      const expAccId = document.getElementById('verif-refund-account')?.value;
      const incAccId = document.getElementById('verif-refund-income-account')?.value;
      if (!op || !expId || !incAccId) { toast('Choisis une dépense et un compte.'); return; }
      const exp = this.state.expenses.find(e => e.id === expId);
      if (!exp) { toast('Dépense introuvable.'); return; }
      const amount = Math.abs(Number(op.amount));
      const day = op.date ? Number(op.date.slice(8, 10)) : (Number(exp.day) || 1);
      const mKey = this.verif.mKey || this.monthKey(new Date());
      const untilOn = document.getElementById('verif-refund-until')?.checked;
      const untilMonth = document.getElementById('verif-refund-until-month')?.value || mKey;
      const endDate = untilOn
        ? (() => {
            const [y, m] = untilMonth.split('-').map(Number);
            const last = new Date(y, m, 0).getDate();
            return untilMonth + '-' + String(last).padStart(2, '0');
          })()
        : null;

      this.closeVerifRefund();
      await withRetry(async () => {
        // 1) Date de fin sur la dépense remboursée (frais qui s'arrêtent)
        if (endDate) {
          const { error } = await supabaseApp.from('expenses').update({ end_date: endDate }).eq('id', expId);
          if (error) throw error;
        }
        // 2) Revenu de remboursement sur le compte qui reçoit le crédit
        const desc = 'Remb. ' + (exp.description || op.label);
        const existing = (this.state.incomes || []).find(i =>
          i.account_id === incAccId &&
          i.description === desc &&
          Math.abs(Number(i.amount) - amount) < 0.02
        );
        let incomeId = existing?.id;
        if (!incomeId) {
          const res = await supabaseApp.from('incomes').insert([{
            account_id: incAccId,
            description: desc,
            amount,
            day,
            income_type: 'remboursement'
          }]).select('id').single();
          if (res.error) throw res.error;
          incomeId = res.data.id;
        }
        // 3) Encaisser ce mois
        await this.setPaid('refund', incomeId, incAccId, mKey, amount, { refund_of: expId });

        const accName = (this.state.accounts.find(a => a.id === incAccId) || {}).name || '';
        await this.sendBankVerifRows([this.buildBankVerifRow(op, 'refund', {
          kind: 'refund', id: incomeId, accId: incAccId, score: 100,
          meta: { refund_of: expId, expense_account_id: expAccId, budget_label: desc }
        })]);
        op.match = {
          kind: 'refund', id: incomeId, accId: incAccId, accName,
          label: desc, category: exp.category || '', day,
          amount, paid: true, score: 100, fromDb: true, refundOf: expId
        };
        op.matchOptions = null;
        op.matchCleared = false;
        op.ignored = false;
        op.savedStatus = 'refund';
        toast(endDate
          ? `Remboursement enregistré · dépense jusqu’au ${this.fmtDate(endDate)}`
          : 'Remboursement enregistré et encaissé');
        this.fetchData();
      }, 'remboursement depuis relevé');
      this.renderVerifTable();
    },

    verifAddAsEntry(opId) {
      const op = this.findVerifOp(opId);
      if (!op) return;
      const isIncome = Number(op.amount) > 0;
      this.openAddSheet();
      this.verif.pendingEntryOpId = opId;
      document.getElementById('f-type').value = isIncome ? 'income' : 'expense';
      this.updateSheetForm();
      document.getElementById('f-desc').value = op.label;
      document.getElementById('f-amount').value = Math.abs(Number(op.amount)).toFixed(2);
      if (op.date) {
        const day = Number(op.date.slice(8, 10));
        document.getElementById('f-day').value = day;
      }
      this.populateSheetSelects(this.verif.accId, '');
      toast('Formulaire prérempli — enregistre pour créer et valider la saisie');
    },

    openVerifWallet(opId) {
      const op = this.findVerifOp(opId);
      if (!op) return;
      this.verif.walletOpId = opId;
      document.getElementById('verif-wallet-desc').textContent =
        `${op.date} · ${op.label} · ${this.fmt(op.amount)}`;
      const ordered = this.getOrderedAccounts();
      const accSel = document.getElementById('verif-wallet-account');
      accSel.innerHTML = ordered.map(a => `<option value="${a.id}">${this.esc(a.name)}</option>`).join('');
      accSel.value = this.verif.accId || ordered[0]?.id || '';
      this.refreshVerifWalletSelect();
      if (!document.getElementById('verif-wallet-select').options.length) {
        toast('Aucun portefeuille sur ce compte — change de compte');
      }
      this.presentOverlay('bh-verif-wallet-overlay');
    },
    refreshVerifWalletSelect() {
      const accId = document.getElementById('verif-wallet-account')?.value;
      const sel = document.getElementById('verif-wallet-select');
      if (!sel) return;
      const wallets = (this.state.expenses || []).filter(e => e.account_id === accId && this.isWalletUsable(e));
      sel.innerHTML = wallets.length
        ? wallets.map(w => `<option value="${w.id}">${this.esc(w.description)} (${this.fmt(w.amount)})</option>`).join('')
        : '<option value="">Aucun portefeuille actif</option>';
    },
    closeVerifWallet() {
      document.getElementById('bh-verif-wallet-overlay').classList.remove('open', 'front');
      this.verif.walletOpId = null;
    },
    async confirmVerifWallet() {
      const op = this.findVerifOp(this.verif.walletOpId);
      const expId = document.getElementById('verif-wallet-select')?.value;
      const accId = document.getElementById('verif-wallet-account')?.value || this.verif.accId;
      if (!op || !expId) return;
      this.closeVerifWallet();
      await this.verifLinkToWallet(op, expId, accId);
    },

    // Ajoute la ligne banque comme mouvement d’enveloppe. Écriture brute (lève une erreur) : appeler dans runVerif.
    async addWalletTxFromVerif(expId, accId, op) {
      const exp = (this.state.expenses || []).find(e => e.id === expId);
      if (!this.isWalletUsable(exp)) {
        toast('Ce portefeuille est désactivé : impossible d\'y rattacher une opération.');
        return null;
      }
      // Même mois que les validations / rapprochements du relevé
      const writeKey = this.verifMonthKey(op);
      let amount = Number(op.amount);
      // Dans les portefeuilles, sortie = positif
      if (amount < 0) amount = Math.abs(amount);
      else if (amount > 0) {
        // crédit banque → remboursement dans l'enveloppe
        amount = -Math.abs(amount);
      }
      return this.appendWalletTx(accId, writeKey, expId, {
        description: op.label,
        amount,
        day: op.date ? Number(op.date.slice(8, 10)) : 1,
        date: op.date,
        kind: amount < 0 ? 'refund' : 'expense'
      });
    },
    walletVerifMatch(op, txId, walletId, accId) {
      const exp = (this.state.expenses || []).find(e => String(e.id) === String(walletId));
      return {
        kind: 'wallet', id: txId, expId: walletId || null, accId,
        accName: (this.state.accounts.find(a => a.id === accId) || {}).name || '',
        label: exp ? `${exp.description} · ${op.label || 'Mouvement'}` : (op.label || 'Mouvement'),
        walletName: exp?.description || '',
        txLabel: op.label || 'Mouvement',
        category: exp?.category || '',
        day: op.date ? Number(op.date.slice(8, 10)) : null,
        amount: this.verifEnvelopeAmount(op.amount), paid: true, score: 100
      };
    },
    // Crée le mouvement dans l’enveloppe puis enregistre le rapprochement
    async verifLinkToWallet(op, walletId, accId) {
      return this.runVerif('ajout portefeuille', async () => {
        const txId = await this.addWalletTxFromVerif(walletId, accId, op);
        if (!txId) return false;
        await this.verifCommitLink(op, this.walletVerifMatch(op, txId, walletId, accId));
        toast('Ajouté au portefeuille et vérifié');
        this.render();
        return true;
      });
    },
});
