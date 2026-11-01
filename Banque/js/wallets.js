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

    // Jauge d'enveloppe : l'échelle dépasse toujours l'allocation, pour voir un dépassement.
    walletGaugeModel(spent, budget) {
      const net = Number(spent) || 0;
      const used = Math.max(0, net);
      const cap = Math.max(0, Number(budget) || 0);
      const scale = Math.max(cap * 1.45, used * 1.08, 1);
      const mark = cap / scale * 100;
      const end = Math.min(100, used / scale * 100);
      const pct = cap > 0 ? (used / cap * 100) : null;
      return {
        mark,
        okW: Math.min(end, mark),
        overW: Math.max(0, end - mark),
        pct,
        remaining: cap - net,
        used,
        over: cap > 0 ? net > cap + 0.004 : used > 0.004
      };
    },
    walletPctLabel(pct) {
      if (pct == null || !Number.isFinite(pct)) return '—';
      return (Math.round(pct * 10) / 10).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' %';
    },
    walletGaugeHtml(model) {
      const mark = model.mark.toFixed(2);
      const over = model.overW > 0.35;
      return `<div class="bh-wgauge" style="--mark:${mark}%">
        <div class="bh-wgauge-track">
          <div class="bh-wgauge-ok${over ? '' : ' is-round'}" style="width:${model.okW.toFixed(2)}%"></div>
          ${over ? `<div class="bh-wgauge-over" style="left:${mark}%;width:${model.overW.toFixed(2)}%"></div>` : ''}
        </div>
        <div class="bh-wgauge-mark" style="left:${mark}%" title="Plafond alloué"></div>
      </div>`;
    },

    accountWalletsHtml(acc, mKey) {
      const wallets = (this.state.expenses || [])
        .filter(e => e.account_id === acc.id && this.isWalletVisibleInMonth(e, mKey))
        .sort((a, b) => String(a.description || '').localeCompare(String(b.description || ''), 'fr'));
      if (!wallets.length) return '';
      const cards = wallets.map(exp => {
        const budget = Number(exp.amount) || 0;
        const spent = this.walletSpent(acc.id, exp.id, mKey);
        const model = this.walletGaugeModel(spent, budget);
        const usable = this.isWalletUsable(exp);
        const editing = this.walletAllocEditId === exp.id && usable;
        const meta = [
          exp.category || '',
          !usable ? 'Désactivé' : '',
          this.isExpired(exp) ? ('Expiré le ' + this.fmtDate(exp.end_date)) : ''
        ].filter(Boolean).join(' · ');
        const restLabel = model.remaining < -0.004 ? 'Dépassé' : 'Restant';
        const restCls = model.over ? ' is-over' : ' is-ok';
        const alloc = editing
          ? `<label class="bh-walloc is-edit">
              <span class="bh-walloc-k">Alloué<span class="bh-walloc-hint">Entrée pour valider</span></span>
              <input id="walloc-${exp.id}" class="bh-walloc-input" type="number" inputmode="decimal" step="0.01" min="0"
                value="${Math.round(budget * 100) / 100}" autocomplete="off" aria-label="Montant alloué"
                onkeydown="BH.onWalletAllocKey(event,'${exp.id}')" onblur="BH.saveWalletAllocation('${exp.id}')">
            </label>`
          : (usable
            ? `<button type="button" class="bh-walloc" onclick="BH.beginWalletAllocEdit('${exp.id}')" title="Modifier l'allocation">
                <span class="bh-walloc-k">Alloué<span class="bh-walloc-hint">Toucher pour modifier</span></span>
                <span class="bh-walloc-v num">${this.fmt(budget)}</span>
              </button>`
            : `<div class="bh-walloc is-static">
                <span class="bh-walloc-k">Alloué</span>
                <span class="bh-walloc-v num">${this.fmt(budget)}</span>
              </div>`);
        return `<article class="bh-wcard${model.over ? ' is-over' : ''}${usable ? '' : ' is-off'}">
          <div class="bh-wcard-top">
            <div class="bh-wcard-name">
              <div class="bh-wcard-title">👛 ${this.esc(exp.description || 'Portefeuille')}</div>
              ${meta ? `<div class="bh-wcard-meta">${this.esc(meta)}</div>` : ''}
            </div>
            <button type="button" class="bh-winfo" onclick="BH.showAccountWalletDetail('${exp.id}')" aria-label="Détail du portefeuille ${this.esc(exp.description || '')}"><span>i</span></button>
          </div>
          ${alloc}
          ${this.walletGaugeHtml(model)}
          <div class="bh-wvals">
            <div class="bh-wval"><span class="k">Utilisé</span><span class="v num">${this.fmt(model.used)}</span></div>
            <div class="bh-wval${restCls}"><span class="k">${restLabel}</span><span class="v num">${this.fmt(Math.abs(model.remaining))}</span></div>
            <div class="bh-wval${model.over ? ' is-over' : ''}"><span class="k">Taux</span><span class="v num">${this.walletPctLabel(model.pct)}</span></div>
          </div>
        </article>`;
      }).join('');
      return `<section class="bh-wpanel">
        <div class="bh-wpanel-label">Portefeuilles <span class="bh-section-count">${wallets.length}</span></div>
        ${cards}
      </section>`;
    },

    beginWalletAllocEdit(expId) {
      const exp = (this.state.expenses || []).find(e => e.id === expId);
      if (!this.isWalletUsable(exp)) return;
      this.walletAllocEditId = expId;
      this.renderComptes();
      requestAnimationFrame(() => {
        const el = document.getElementById('walloc-' + expId);
        if (!el) return;
        el.focus();
        el.select();
      });
    },
    onWalletAllocKey(ev, expId) {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        ev.currentTarget.blur();
      } else if (ev.key === 'Escape') {
        ev.preventDefault();
        this._walletAllocCancel = expId;
        ev.currentTarget.blur();
        if (this.walletAllocEditId === expId) {
          this._walletAllocCancel = null;
          this.walletAllocEditId = null;
          this.renderComptes();
        }
      }
    },
    async saveWalletAllocation(expId) {
      if (this._walletAllocLock) return;
      this._walletAllocLock = true;
      try {
        if (this._walletAllocCancel === expId) {
          this._walletAllocCancel = null;
          this.walletAllocEditId = null;
          this.renderComptes();
          return;
        }
        const input = document.getElementById('walloc-' + expId);
        const exp = (this.state.expenses || []).find(e => e.id === expId && e.is_wallet);
        if (!input || !exp || this.walletAllocEditId !== expId) return;
        const raw = String(input.value || '').trim().replace(',', '.');
        const newAmount = Number(raw);
        if (raw === '' || !Number.isFinite(newAmount) || newAmount < 0) {
          toast('Indique un montant positif ou nul.');
          this.walletAllocEditId = null;
          this.renderComptes();
          return;
        }
        const oldAmount = Number(exp.amount) || 0;
        this.walletAllocEditId = null;
        if (Math.abs(newAmount - oldAmount) < 0.005) {
          this.renderComptes();
          return;
        }
        const saved = await withRetry(async () => {
          const { error } = await supabaseApp.from('expenses').update({ amount: newAmount }).eq('id', expId);
          if (error) throw error;
          exp.amount = newAmount;
          const mKey = this.monthKey(new Date());
          await this.logExpenseChange({
            expenseId: expId,
            accountId: exp.account_id,
            changeType: 'update_amount',
            oldAmount,
            newAmount,
            oldPayload: this.expenseSnapshotRow({ ...exp, amount: oldAmount }),
            newPayload: this.expenseSnapshotRow(exp),
            monthKey: this.comptesMKey ? this.comptesMKey() : mKey
          });
          await this.upsertMonthRecord(exp.account_id, mKey, {
            theoretical_expenses: this.buildTheoreticalSnapshot(exp.account_id, mKey)
          });
          return true;
        }, 'allocation portefeuille');
        if (!saved) {
          await this.fetchData();
          return;
        }
        toast('Allocation du portefeuille mise à jour');
        this.renderComptes();
        await this.fetchData();
      } finally {
        this._walletAllocLock = false;
      }
    },

    showAccountWalletDetail(expId) {
      const exp = (this.state.expenses || []).find(e => e.id === expId && e.is_wallet);
      if (!exp) return;
      const acc = (this.state.accounts || []).find(a => a.id === exp.account_id);
      const mKey = this.comptesMKey();
      const budget = Number(exp.amount) || 0;
      const spent = this.walletSpent(exp.account_id, exp.id, mKey);
      const model = this.walletGaugeModel(spent, budget);
      const txs = this.getWalletTx(exp.account_id, exp.id, mKey)
        .slice()
        .sort((a, b) => Number(b.day) - Number(a.day) || String(b.date || '').localeCompare(String(a.date || '')));
      const restLabel = model.remaining < -0.004 ? 'Dépassé' : 'Restant';
      const lines = txs.length
        ? txs.map(t => {
          const amt = Number(t.amount) || 0;
          const credit = amt < 0 || this.isExternalWalletApport(t);
          const shown = credit ? ('+' + this.fmt(Math.abs(amt))) : this.fmt(amt);
          return `<div class="bh-wallet-tx">
            <span>${this.esc(t.description || 'Mouvement')} <span style="color:var(--ink-faint);">· ${this.walletTxDateLabel(t)}</span> ${this.walletTxKindPill(t)}</span>
            <span class="num" style="color:${credit ? 'var(--sage-deep)' : 'inherit'};">${shown}</span>
          </div>`;
        }).join('')
        : '<div class="bh-wdetail-empty">Aucun mouvement ce mois-ci. L\'enveloppe compte encore pour son montant alloué.</div>';
      const html = `<div class="bh-wdetail">
        <div class="bh-wdetail-sum">
          <div><span class="k">Alloué</span><span class="v num">${this.fmt(budget)}</span></div>
          <div><span class="k">Utilisé</span><span class="v num">${this.fmt(model.used)}</span></div>
          <div class="${model.over ? 'is-over' : 'is-ok'}"><span class="k">${restLabel}</span><span class="v num">${this.fmt(Math.abs(model.remaining))}</span></div>
        </div>
        ${this.walletGaugeHtml(model)}
        <div class="bh-wdetail-rate${model.over ? ' is-over' : ''}">${this.walletPctLabel(model.pct)} de l'allocation${model.over ? ' — au-delà du plafond' : ''}</div>
        <div class="bh-wdetail-list">${lines}</div>
        ${acc ? `<div class="bh-wdetail-foot">${this.esc(acc.name)}${exp.category ? ' · ' + this.esc(exp.category) : ''}</div>` : ''}
      </div>`;
      this.openInfo((exp.description || 'Portefeuille') + ' — détail', html);
    },

});
