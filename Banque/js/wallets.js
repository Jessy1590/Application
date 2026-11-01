Object.assign(BH, {
    // --- PORTEFEUILLE (dépenses internes multiples pour un budget enveloppe) ---
    getWalletTx(accId, expId, mKey) {
      const key = accId + '_' + (mKey || this.monthKey(new Date()));
      const bucket = this.state.walletTx?.[key];
      if (!bucket || typeof bucket !== 'object') return [];
      const raw = bucket[expId] ?? bucket[String(expId)];
      if (Array.isArray(raw)) return raw;
      if (raw && Array.isArray(raw.transactions)) return raw.transactions;
      return [];
    },
    // Apport financé par un autre compte (crédite le portefeuille sans sortir de l'argent du compte propriétaire)
    isExternalWalletApport(t) {
      return !!(t && (t.from_account_id || t.kind === 'apport'));
    },
    // Somme des txs portefeuille. includeExternalApports=false → ignore les apports d'un autre compte
    // (pour les stats / reste du compte propriétaire). true → solde enveloppe affiché (crédits inclus).
    walletSpent(accId, expId, mKey, opts = {}) {
      const includeExternal = opts.includeExternalApports !== false;
      return this.getWalletTx(accId, expId, mKey).reduce((s, t) => {
        if (!includeExternal && this.isExternalWalletApport(t)) return s;
        return s + (Number(t.amount) || 0);
      }, 0);
    },
    // Dépenses réellement sorties de CE compte (hors apports externes)
    walletOwnSpent(accId, expId, mKey) {
      return this.walletSpent(accId, expId, mKey, { includeExternalApports: false });
    },
    toggleWalletExpand(expId) {
      if (!this.walletExpanded) this.walletExpanded = {};
      this.walletExpanded[expId] = !this.walletExpanded[expId];
      this.renderToday();
    },

    // Apports sortants d'un compte vers des portefeuilles d'autres comptes (stockés en JSONB côté destinataire)
    outboundWalletApports(sourceAccId, mKey, maxDay = 31) {
      let total = 0;
      (this.state.expenses || []).filter(e => e.is_wallet).forEach(exp => {
        this.getWalletTx(exp.account_id, exp.id, mKey).forEach(t => {
          if (t.from_account_id !== sourceAccId) return;
          if (Number(t.day) > maxDay) return;
          total += Math.abs(Number(t.amount) || 0);
        });
      });
      return total;
    },

    // Doublon portefeuille : même libellé + même montant dans la même enveloppe / mois
    isDuplicateWalletTx(list, description, amount) {
      const norm = String(description || '').trim().toLowerCase().replace(/\s+/g, ' ');
      const amt = Number(amount);
      if (!norm || !Number.isFinite(amt)) return false;
      return (list || []).some(t =>
        Math.abs(Number(t.amount) - amt) < 0.005 &&
        String(t.description || '').trim().toLowerCase().replace(/\s+/g, ' ') === norm
      );
    },
    async addWalletTx(expId, accId, mKeyOpt) {
      const exp = (this.state.expenses || []).find(e => e.id === expId);
      if (!this.isWalletUsable(exp)) {
        toast('Ce portefeuille est désactivé : impossible d\'ajouter un mouvement.');
        return;
      }
      const desc = (document.getElementById(`wtx-desc-${expId}`)?.value || '').trim();
      const rawAmount = document.getElementById(`wtx-amount-${expId}`)?.value;
      const mKey = mKeyOpt || this.todayViewKey();
      const dateStr = document.getElementById(`wtx-date-${expId}`)?.value || (mKey === this.monthKey(new Date()) ? this._todayISO() : mKey + '-01');
      const fromAccId = (document.getElementById(`wtx-from-${expId}`)?.value || '').trim();
      let amount = Number(rawAmount);
      if (!desc || rawAmount === '' || rawAmount == null || !Number.isFinite(amount) || amount === 0) {
        toast('Renseigne une description et un montant non nul (négatif pour un remboursement).');
        return;
      }
      if (fromAccId) {
        if (fromAccId === accId) { toast('Choisis un autre compte source pour l\'apport.'); return; }
        if (!this.state.accounts.some(a => a.id === fromAccId)) { toast('Compte source invalide.'); return; }
        if (!(amount > 0)) { toast('Pour un apport, indique un montant positif.'); return; }
        amount = -Math.abs(amount);
      }
      const d = new Date(dateStr + 'T00:00:00');
      if (isNaN(d.getTime())) { toast('Date invalide.'); return; }
      const curKey = this.monthKey(d);
      if (curKey !== mKey) { toast('La date doit être dans le mois affiché.'); return; }
      const kind = fromAccId ? 'apport' : (amount < 0 ? 'refund' : 'expense');
      const tx = { description: desc, amount, day: d.getDate(), date: dateStr, kind };
      if (fromAccId) tx.from_account_id = fromAccId;
      await this.commit('ajout dépense portefeuille',
        () => this.appendWalletTx(accId, mKey, expId, tx),
        kind === 'apport' ? 'Apport ajouté au portefeuille' : (kind === 'refund' ? 'Remboursement ajouté au portefeuille' : 'Dépense ajoutée au portefeuille'));
    },

    deleteWalletTx(expId, accId, txId, mKeyOpt) {
      const mKey = mKeyOpt || this.todayViewKey();
      return this.commit('suppression dépense portefeuille', async () => {
        await this.deleteBankVerificationsForLink('wallet', txId);
        await this.removeWalletTx(accId, mKey, expId, txId);
      }, 'Mouvement retiré du portefeuille');
    },

});
