Object.assign(BH, {
    // --- Popup générique de détail de calcul ---
    openInfo(title, rowsHtml) {
      document.getElementById('bh-info-title').textContent = title;
      document.getElementById('bh-info-body').innerHTML = rowsHtml;
      document.getElementById('bh-info-overlay').classList.add('open');
    },
    closeInfo() { document.getElementById('bh-info-overlay').classList.remove('open'); },

    showEpargneInfo() {
      const info = this.epargneInfo;
      if (!info) {
        this.openInfo('Capacité d\'épargne', `<div style="font-size:13px; color:var(--ink-soft);">Définissez votre compte principal dans les Réglages pour calculer cette valeur.</div>`);
        return;
      }
      const wOut = Number(info.walletApportsOut) || 0;
      const rows = `
        <div class="bh-info-row"><span>Compte principal</span><span>${this.esc(info.mainAccName)}</span></div>
        <div class="bh-info-row"><span>Revenus (compte principal)</span><span class="num">${this.fmt(info.mainInc)}</span></div>
        <div class="bh-info-row"><span>− Dépenses (compte principal, toutes)</span><span class="num">${this.fmt(info.mainExpAll)}</span></div>
        <div class="bh-info-row"><span>− Apports vers les autres comptes</span><span class="num">${this.fmt(info.contribsAll)}</span></div>
        ${wOut > 0 ? `<div class="bh-info-row"><span>− Apports vers des portefeuilles</span><span class="num">${this.fmt(wOut)}</span></div>` : ''}
        <div class="bh-info-row"><span>+ Montants déjà mis en épargne (catégorie "Épargne", compte principal)</span><span class="num">${this.fmt(info.epargneCategorisee)}</span></div>
        <div class="bh-info-row"><span>= Capacité d'épargne</span><span class="num">${this.fmt(info.capaciteEpargne)}</span></div>
        <div class="bh-info-row"><span>Taux d'épargne (capacité / revenus)</span><span class="num">${info.tauxEpargne !== null ? info.tauxEpargne.toFixed(1) + ' %' : '—'}</span></div>
        <div style="font-size:11.5px; color:var(--ink-faint); margin-top:12px; line-height:1.5;">
          Les montants catégorisés "Épargne" dans une saisie (dépense) sont d'abord déduits comme les autres dépenses, puis rajoutés ici : ils représentent de l'argent déjà épargné, pas une dépense perdue.
        </div>`;
      this.openInfo('Capacité d\'épargne — détail', rows);
    },

    showResteInfo(accId) { this.showResteDetail(accId); },

    // Clé `apportRecu_<userId>` : part d'un autre membre notée arrivée ici,
    // dans paid_incomes du mois DU COMPTE PARTAGÉ. Distincte de `apport_<compteCible>`
    // (virement sortant, mois du compte principal de celui qui vire).
    inboundApportId(userId) {
      return 'apportRecu_' + userId;
    },
    inboundApportRecord(accId, userId, mKey) {
      if (!userId) return null;
      return (this.state.monthsIncomes?.[accId + '_' + mKey] || {})[this.inboundApportId(userId)] || null;
    },
    ownOutboundApportRecord(accId, mKey) {
      const mainAccId = this.state.profile?.main_account_id;
      if (!mainAccId || typeof this.apportExpenseId !== 'function') return null;
      return (this.state.months?.[mainAccId + '_' + mKey] || {})[this.apportExpenseId(accId)] || null;
    },
    // Pour soi : la note d'arrivée sur ce compte, sinon le virement sortant — jamais les deux.
    // Pour un autre : seulement la note d'arrivée sur ce compte.
    arrivedApport(accId, userId, mKey) {
      const inbound = this.inboundApportRecord(accId, userId, mKey);
      if (this.user && userId === this.user.id) return inbound || this.ownOutboundApportRecord(accId, mKey);
      return inbound;
    },
    fairSharesForAccount(accId) {
      const acc = (this.state.accounts || []).find(a => a.id === accId);
      const mems = (this.state.members || []).filter(m => m.account_id === accId);
      if (!acc) return { acc: null, mems, shares: {}, isMain: false };
      let tExp = 0, tInc = 0;
      (this.state.expenses || []).forEach(e => {
        if (e.account_id === accId && this.isExpenseActive(e)) tExp += Number(e.amount) || 0;
      });
      (this.state.incomes || []).forEach(i => {
        if (i.account_id === accId) tInc += Number(i.amount) || 0;
      });
      return {
        acc, mems,
        shares: this.computeFairShares(acc, mems, tExp, tInc),
        isMain: accId === this.state.profile?.main_account_id
      };
    },
    memberMainAccountId(userId) {
      const row = (this.state.members || []).find(m => String(m.user_id) === String(userId) && m.profiles && m.profiles.main_account_id);
      return row ? row.profiles.main_account_id : null;
    },
    canWriteAccount(accId) {
      return !!(accId && (this.state.accounts || []).some(a => a.id === accId));
    },
    // L'autre membre ne peut souvent pas écrire sur le compte principal du payeur.
    // On le fait ici si on y a accès ; sinon le payeur recopie la validation à l'ouverture.
    async mirrorPayerOutbound(userId, sharedAccId, mKey, amount) {
      if (!this.user || !userId || String(userId) === String(this.user.id)) return;
      if (typeof this.apportExpenseId !== 'function') return;
      const mainId = this.memberMainAccountId(userId);
      if (!mainId || mainId === sharedAccId || !this.canWriteAccount(mainId)) return;
      const expId = this.apportExpenseId(sharedAccId);
      const existing = (this.state.months?.[mainId + '_' + mKey] || {})[expId];
      if (existing && !existing.mirrored) return;
      const amt = Math.round((Number(amount) || 0) * 100) / 100;
      if (!(amt > 0)) return;
      if (existing && Math.abs((Number(existing.amount) || 0) - amt) < 0.005) return;
      await this.setPaid('expense', expId, mainId, mKey, amt, { mirrored: true });
    },
    async clearMirroredPayerOutbound(userId, sharedAccId, mKey) {
      if (!this.user || !userId || String(userId) === String(this.user.id)) return;
      if (typeof this.apportExpenseId !== 'function') return;
      const mainId = this.memberMainAccountId(userId);
      if (!mainId || !this.canWriteAccount(mainId)) return;
      const expId = this.apportExpenseId(sharedAccId);
      const existing = (this.state.months?.[mainId + '_' + mKey] || {})[expId];
      if (!existing || !existing.mirrored) return;
      await this.clearPaid('expense', expId, mainId, mKey);
    },
    async writeInboundApport(accId, userId, mKey, amount) {
      const amt = Math.round((Number(amount) || 0) * 100) / 100;
      if (!(amt > 0)) return;
      await this.setPaid('income', this.inboundApportId(userId), accId, mKey, amt, { by: this.user.id });
      await this.mirrorPayerOutbound(userId, accId, mKey, amt);
    },
    async clearInboundApportWrite(accId, userId, mKey) {
      await this.clearPaid('income', this.inboundApportId(userId), accId, mKey);
      await this.clearMirroredPayerOutbound(userId, accId, mKey);
    },
    // Ma validation d'apport (Aujourd'hui / Vérif) est aussi notée reçue sur le compte partagé.
    async noteOwnApportReceived(expId, mKey, amount) {
      if (!this.user || typeof this.isApportExpenseId !== 'function' || !this.isApportExpenseId(expId)) return;
      const targetId = expId.slice('apport_'.length);
      if (!/^[0-9a-f-]{36}$/i.test(targetId)) return;
      const amt = Math.round((Number(amount) || 0) * 100) / 100;
      if (!(amt > 0)) return;
      const existing = this.inboundApportRecord(targetId, this.user.id, mKey);
      if (existing && existing.by && String(existing.by) !== String(this.user.id)) return;
      await this.setPaid('income', this.inboundApportId(this.user.id), targetId, mKey, amt, { by: this.user.id });
    },
    // Les validations déjà faites sur mon compte principal (avant la note partagée)
    // sont recopiées sur le compte destinataire, pour que l'autre membre les voie.
    async reconcileOwnApportReceived() {
      if (this._apportNoteRunning || !this.user || typeof this.isApportExpenseId !== 'function') return;
      const mainId = this.state.profile?.main_account_id;
      if (!mainId) return;
      const prefix = mainId + '_';
      const writes = [];
      Object.entries(this.state.months || {}).forEach(([key, map]) => {
        if (!key.startsWith(prefix)) return;
        const mKey = key.slice(prefix.length);
        if (!/^\d{4}-\d{2}$/.test(mKey)) return;
        Object.entries(map || {}).forEach(([id, rec]) => {
          if (!rec || !this.isApportExpenseId(id)) return;
          const targetId = id.slice('apport_'.length);
          if (!/^[0-9a-f-]{36}$/i.test(targetId) || !this.canWriteAccount(targetId)) return;
          const amount = Math.round((Number(rec.amount) || 0) * 100) / 100;
          if (!(amount > 0)) return;
          const existing = this.inboundApportRecord(targetId, this.user.id, mKey);
          if (existing) return;
          writes.push({ targetId, mKey, amount });
        });
      });
      if (!writes.length) return;
      this._apportNoteRunning = true;
      try {
        await this.commit('synchronisation des apports reçus', async () => {
          for (const w of writes) {
            await this.setPaid('income', this.inboundApportId(this.user.id), w.targetId, w.mKey, w.amount, { by: this.user.id });
          }
        });
      } finally {
        this._apportNoteRunning = false;
      }
    },
    async clearOwnApportReceived(expId, mKey) {
      if (!this.user || typeof this.isApportExpenseId !== 'function' || !this.isApportExpenseId(expId)) return;
      const targetId = expId.slice('apport_'.length);
      if (!/^[0-9a-f-]{36}$/i.test(targetId)) return;
      await this.clearPaid('income', this.inboundApportId(this.user.id), targetId, mKey);
    },
    // Recopie sur MON compte principal les apports qu'un autre membre a validés pour moi.
    async reconcileMyMirroredApports() {
      if (this._apportMirrorRunning || !this.user || typeof this.apportExpenseId !== 'function') return;
      const mainId = this.state.profile?.main_account_id;
      if (!this.canWriteAccount(mainId)) return;
      const inboundId = this.inboundApportId(this.user.id);
      const wanted = new Map();
      Object.entries(this.state.monthsIncomes || {}).forEach(([key, map]) => {
        const rec = map && map[inboundId];
        if (!rec) return;
        const cut = key.lastIndexOf('_');
        if (cut < 0) return;
        const accId = key.slice(0, cut);
        const mKey = key.slice(cut + 1);
        if (accId === mainId || !/^\d{4}-\d{2}$/.test(mKey)) return;
        const amount = Math.round((Number(rec.amount) || 0) * 100) / 100;
        if (!(amount > 0)) return;
        wanted.set(key, amount);
      });
      const writes = [];
      wanted.forEach((amount, key) => {
        const cut = key.lastIndexOf('_');
        const accId = key.slice(0, cut);
        const mKey = key.slice(cut + 1);
        const expId = this.apportExpenseId(accId);
        const existing = (this.state.months?.[mainId + '_' + mKey] || {})[expId];
        if (existing && !existing.mirrored) return;
        if (existing && Math.abs((Number(existing.amount) || 0) - amount) < 0.005) return;
        writes.push({ expId, mKey, amount });
      });
      const clears = [];
      const prefix = mainId + '_';
      Object.entries(this.state.months || {}).forEach(([key, map]) => {
        if (!key.startsWith(prefix)) return;
        const mKey = key.slice(prefix.length);
        if (!/^\d{4}-\d{2}$/.test(mKey)) return;
        Object.entries(map || {}).forEach(([id, rec]) => {
          if (!rec || !rec.mirrored || !this.isApportExpenseId(id)) return;
          const target = id.slice('apport_'.length);
          if (!wanted.has(target + '_' + mKey)) clears.push({ expId: id, mKey });
        });
      });
      if (!writes.length && !clears.length) return;
      this._apportMirrorRunning = true;
      try {
        await this.commit('synchronisation des apports', async () => {
          for (const w of writes) await this.setPaid('expense', w.expId, mainId, w.mKey, w.amount, { mirrored: true });
          for (const c of clears) await this.clearPaid('expense', c.expId, mainId, c.mKey);
        });
      } finally {
        this._apportMirrorRunning = false;
      }
    },
    apportValidateHtml(label, amount, mode, accId, userId) {
      const line = this.detailLine(label, amount);
      if (mode !== 'pay' && mode !== 'cancel') return line;
      const aid = this.esc(accId);
      const uid = this.esc(userId);
      const actions = mode === 'pay'
        ? `<button type="button" class="bh-btn bh-btn-primary" onclick="BH.markInboundApport('${aid}','${uid}')">Valider ${this.fmt(amount)}</button>
           <button type="button" class="bh-btn bh-btn-ghost" onclick="BH.openInboundApportAmount('${aid}','${uid}')">Montant différent</button>`
        : `<button type="button" class="bh-btn bh-btn-ghost" onclick="BH.unmarkInboundApport('${aid}','${uid}')">Annuler</button>`;
      return `<div class="bh-apport-validate">${line}<div class="bh-due-actions">${actions}</div></div>`;
    },
    async markInboundApport(accId, userId) {
      if (!this.user || String(userId) === String(this.user.id)) return;
      const { mems, shares, isMain } = this.fairSharesForAccount(accId);
      if (isMain || !mems.some(m => m.user_id === this.user.id) || !mems.some(m => String(m.user_id) === String(userId))) return;
      const share = Math.round((Number(shares[userId]) || 0) * 100) / 100;
      if (!(share > 0)) return;
      const mKey = this.comptesMKey();
      const res = await this.commit(
        'validation de l\'apport reçu',
        () => this.writeInboundApport(accId, userId, mKey, share),
        'Apport validé'
      );
      if (res) this.showEffInflows(accId);
    },
    async unmarkInboundApport(accId, userId) {
      if (!this.user || String(userId) === String(this.user.id)) return;
      const mKey = this.comptesMKey();
      const res = await this.commit(
        'annulation de l\'apport reçu',
        () => this.clearInboundApportWrite(accId, userId, mKey),
        'Validation annulée'
      );
      if (res) this.showEffInflows(accId);
    },
    openInboundApportAmount(accId, userId) {
      if (!this.user || String(userId) === String(this.user.id)) return;
      const { acc, mems, shares, isMain } = this.fairSharesForAccount(accId);
      if (!acc || isMain || !mems.some(m => m.user_id === this.user.id)) return;
      const mem = mems.find(m => String(m.user_id) === String(userId));
      if (!mem) return;
      const share = Math.round((Number(shares[userId]) || 0) * 100) / 100;
      const name = (mem.profiles && mem.profiles.display_name) || 'Membre';
      this.diffAmount = {
        kind: 'inbound-apport',
        expId: this.inboundApportId(userId),
        accId,
        payerId: userId,
        baseAmount: share,
        mode: 'temp',
        isApport: true,
        mKey: this.comptesMKey(),
        opId: null,
        linkKind: null,
        score: null,
        markVerified: false
      };
      const titleEl = document.querySelector('#bh-diffamount-overlay .bh-sheet-title');
      if (titleEl) titleEl.textContent = 'Montant différent';
      const desc = document.getElementById('da-desc');
      if (desc) desc.textContent = `Apport de ${name} — ${acc.name} · prévu ${this.fmt(share)}`;
      const amountEl = document.getElementById('da-amount');
      if (amountEl) amountEl.value = share > 0 ? share : '';
      const amountLabel = document.querySelector('#bh-diffamount-overlay .bh-field-label');
      if (amountLabel) amountLabel.textContent = 'Montant réellement reçu (€)';
      const permBtn = document.getElementById('da-mode-perm');
      if (permBtn) permBtn.style.display = 'none';
      this.setDiffAmountMode('temp');
      this.presentOverlay('bh-diffamount-overlay');
    },

    showIncomesList(accId) {
      const info = this.acctIncomesList && this.acctIncomesList[accId];
      const acc = (this.state.accounts || []).find(a => a.id === accId);
      const accName = (info && info.accName) || (acc && acc.name) || 'Compte';
      const incs = info ? info.incs : (this.state.incomes || []).filter(i => i.account_id === accId);
      const mKey = this.comptesMKey();
      const paid = this.state.monthsIncomes?.[accId + '_' + mKey] || {};
      let rows = '';
      if (incs.length) {
        rows = incs.map(i => {
          const rec = paid[i.id];
          const tag = rec ? ` <span class="bh-detail-meta">encaissé ${this.fmt(Number(rec.amount) || 0)}</span>` : ' <span class="bh-detail-meta">prévu</span>';
          return `
        <div class="bh-info-row">
          <span>${this.esc(i.description || 'Revenu')}${tag}</span>
          <span class="num">${this.fmt(Number(i.amount))}</span>
        </div>`;
        }).join('');
        const total = incs.reduce((s, i) => s + Number(i.amount), 0);
        rows += `<div class="bh-info-row" style="margin-top:4px;"><span>Total</span><span class="num">${this.fmt(total)}</span></div>`;
      }
      if (!rows) {
        this.openInfo('Revenus / Remboursements', `<div style="font-size:13px; color:var(--ink-soft);">Aucun revenu saisi pour ce compte.</div>`);
        return;
      }
      this.openInfo(`${accName} — revenus saisis`, rows);
    },

    showResteTheoInfo(accId) {
      const info = this.resteTheoInfo && this.resteTheoInfo[accId];
      if (!info) return;
      const wOut = Number(info.walletApportsOut) || 0;
      let rows;
      if (info.isMain) {
        rows = `
          <div class="bh-info-row"><span>Revenus (compte principal)</span><span class="num">${this.fmt(info.tInc)}</span></div>
          <div class="bh-info-row"><span>− Dépenses (toutes, budget complet)</span><span class="num">${this.fmt(info.tExp)}</span></div>
          <div class="bh-info-row"><span>− Apports versés vers les autres comptes</span><span class="num">${this.fmt(info.totalOutboundContributions)}</span></div>
          ${wOut > 0 ? `<div class="bh-info-row"><span>− Apports vers des portefeuilles</span><span class="num">${this.fmt(wOut)}</span></div>` : ''}
          <div class="bh-info-row"><span>= Reste théorique</span><span class="num">${this.fmt(info.resteTheorique)}</span></div>`;
      } else {
        rows = `
          <div class="bh-info-row"><span>Apports (montant plein du mois, tous membres)</span><span class="num">${this.fmt(info.totalAllocated)}</span></div>
          <div class="bh-info-row"><span>+ Revenus propres au compte (remboursements, rendement…)</span><span class="num">${this.fmt(info.tInc)}</span></div>
          <div class="bh-info-row"><span>− Dépenses (toutes, budget complet)</span><span class="num">${this.fmt(info.tExp)}</span></div>
          ${wOut > 0 ? `<div class="bh-info-row"><span>− Apports vers des portefeuilles</span><span class="num">${this.fmt(wOut)}</span></div>` : ''}
          <div class="bh-info-row"><span>= Reste théorique</span><span class="num">${this.fmt(info.resteTheorique)}</span></div>`;
      }
      if (info.hasWallet) {
        rows += `<div style="font-size:11.5px; color:var(--ink-faint); margin-top:12px;">👛 Les portefeuilles sont inclus dans "Dépenses" pour leur budget mensuel complet (pas seulement ce qui a déjà été dépensé), comme n'importe quelle autre dépense de ce compte. Un apport reçu depuis un autre compte crédite l'enveloppe sans augmenter le reste de ce compte.</div>`;
      }
      this.openInfo(`${info.accName} — Reste théorique`, rows);
    },

    showExpensesList(accId) {
      const info = this.acctExpensesList && this.acctExpensesList[accId];
      if (!info || !info.exps.length) {
        this.openInfo('Dépenses', `<div style="font-size:13px; color:var(--ink-soft);">Aucune dépense saisie pour ce compte.</div>`);
        return;
      }
      const rows = info.exps.map(e => `
        <div class="bh-info-row"${this.isExpired(e) ? ' style="color:var(--clay);"' : (!this.isExpenseActive(e) ? ' style="opacity:0.65;"' : '')}>
          <span>${e.is_wallet ? '👛 ' : ''}${this.esc(e.description || e.category || 'Dépense')}${!this.isExpenseActive(e) ? ' <span style="font-weight:400;">(désactivé)</span>' : ''}${e.category ? ` <span style="color:var(--ink-faint); font-weight:400;">(${this.esc(e.category)})</span>` : ''}${!e.is_wallet && e.day ? ` <span style="color:var(--ink-faint); font-weight:400;">· le ${e.day}</span>` : ''}${this.isExpired(e) ? ` <span style="font-weight:400;">⚠️ Expirée le ${this.fmtDate(e.end_date)}</span>` : ''}</span>
          <span class="num">${this.fmt(Number(e.amount))}</span>
        </div>`).join('');
      const total = info.exps.filter(e => this.isExpenseActive(e)).reduce((s,e)=>s+Number(e.amount),0);
      this.openInfo(`${info.accName} — dépenses saisies`, rows + `<div class="bh-info-row" style="margin-top:4px;"><span>Total</span><span class="num">${this.fmt(total)}</span></div>`);
    },

    // --- Ordre personnalisé des comptes (persisté dans profiles.account_order) ---
    getOrderedAccounts() {
      const accounts = this.state.accounts.slice();
      const order = this.state.profile?.account_order || [];
      if (order.length) {
        const rank = id => { const i = order.indexOf(id); return i === -1 ? Infinity : i; };
        accounts.sort((a,b) => rank(a.id) - rank(b.id));
      } else {
        // Par défaut : le compte joint en premier
        accounts.sort((a,b) => {
          const aJoint = /joint/i.test(a.name||'') ? 0 : 1;
          const bJoint = /joint/i.test(b.name||'') ? 0 : 1;
          return aJoint - bJoint;
        });
      }
      return accounts;
    },

    async moveAccount(accId, direction) {
      const ordered = this.getOrderedAccounts();
      const ids = ordered.map(a => a.id);
      const i = ids.indexOf(accId);
      const j = i + direction;
      if (i === -1 || j < 0 || j >= ids.length) return;
      [ids[i], ids[j]] = [ids[j], ids[i]];
      this.state.profile.account_order = ids;
      this.renderComptes();
      const { error } = await supabaseApp.from('profiles').update({ account_order: ids }).eq('id', this.user.id);
      if (error) toast("Erreur lors de l'enregistrement de l'ordre des comptes.");
    },

    async deleteAccount(accId, accName) {
      const ok = confirm(`Supprimer définitivement le compte "${accName}" ?\n\nCela supprimera aussi toutes ses dépenses, revenus, membres et son historique de paiements. Cette action est irréversible.`);
      if (!ok) return;
      await withRetry(async () => {
        // Validations, portefeuilles et budgets figés partent avec le compte (cascade) ; tout reste dans banque.history
        let error;
        ({ error } = await supabaseApp.from('expenses').delete().eq('account_id', accId));
        if (error) throw error;
        ({ error } = await supabaseApp.from('incomes').delete().eq('account_id', accId));
        if (error) throw error;
        ({ error } = await supabaseApp.from('account_members').delete().eq('account_id', accId));
        if (error) throw error;
        ({ error } = await supabaseApp.from('accounts').delete().eq('id', accId));
        if (error) throw error;

        // Nettoie les références à ce compte dans le profil (compte principal / ordre personnalisé)
        const profileUpdates = {};
        if (this.state.profile?.main_account_id === accId) profileUpdates.main_account_id = null;
        if (this.state.profile?.account_order?.length) {
          profileUpdates.account_order = this.state.profile.account_order.filter(id => id !== accId);
        }
        if (Object.keys(profileUpdates).length) {
          await supabaseApp.from('profiles').update(profileUpdates).eq('id', this.user.id);
        }

        toast("Compte supprimé");
        this.fetchData();
      }, 'suppression du compte');
    },

    // --- Totaux vérifiés d'un compte (relevé), sans date choisie dans Comptes ---
    _todayISO() {
      const t = new Date();
      return t.getFullYear() + '-' + String(t.getMonth()+1).padStart(2,'0') + '-' + String(t.getDate()).padStart(2,'0');
    },
    accountRealTotals(accId, mKey, maxDay) {
      let exp = 0, inc = 0;
      const seen = new Set();
      const list = this.getBankVerifsForMonth ? this.getBankVerifsForMonth(mKey) : [];
      list.forEach(v => {
        if (!v || v.status === 'ignored') return;
        const key = v.fingerprint || v.id;
        if (seen.has(key)) return;
        const day = v.bank_date ? Number(String(v.bank_date).slice(8, 10)) : 31;
        if (maxDay != null && day > maxDay) return;
        const amt = Math.abs(Number(v.bank_amount) || 0);
        if (!(amt > 0)) return;
        const id = v.linked_id != null ? String(v.linked_id) : '';
        const kind = v.linked_kind;
        let side = '';
        if (kind === 'expense') {
          if ((this.state.expenses || []).some(e => String(e.id) === id && e.account_id === accId)) side = 'exp';
        } else if (kind === 'apport') {
          if (accId === this.state.profile?.main_account_id && id.indexOf('apport_') === 0) side = 'exp';
        } else if (kind === 'income' || kind === 'refund') {
          if ((this.state.incomes || []).some(i => String(i.id) === id && i.account_id === accId)) side = 'inc';
        } else if (kind === 'wallet' || v.status === 'wallet') {
          const txId = (v.meta && (v.meta.tx_id || v.meta.wallet_tx_id)) || id;
          const expId = v.meta && v.meta.exp_id;
          const wallet = (this.state.expenses || []).find(e => e.is_wallet && e.account_id === accId && (
            (expId && String(e.id) === String(expId)) ||
            this.getWalletTx(e.account_id, e.id, mKey).some(t => String(t.id) === String(txId))
          ));
          if (wallet) side = 'exp';
        }
        if (!side) return;
        seen.add(key);
        if (side === 'inc') inc += amt; else exp += amt;
      });
      return { exp, inc };
    },

    // Calcule la part "juste" (fair share) de chaque membre d'un compte partagé selon son mode de répartition
    computeFairShares(acc, mems, tExp, tInc) {
      tInc = Number(tInc) || 0;
      const netExp = Math.max(0, tExp - tInc); // les revenus propres au compte couvrent une partie des dépenses en premier
      const shares = {};
      const anyProrata = mems.some(m => (m.contribution_mode || 'fixed') === 'prorata');

      if (anyProrata) {
        let revenues = mems.map(m => this.memberRevenue(m.user_id, m.profiles?.main_account_id));
        let totalRev = revenues.reduce((a,b)=>a+b, 0);
        mems.forEach((m, idx) => {
          shares[m.user_id] = totalRev > 0 ? netExp * (revenues[idx] / totalRev) : netExp / mems.length;
        });
      } else {
        mems.forEach(m => {
          const mode = m.contribution_mode || 'fixed';
          shares[m.user_id] = mode === 'percent' ? netExp * (Number(m.contribution_target)||0)/100 : (Number(m.contribution_target)||0);
        });
      }
      return shares;
    },

    // Algorithme simple de règlement de dettes (qui doit quoi à qui)
    computeSettlements(acc, mems, tExp, exps, tInc) {
      const shares = this.computeFairShares(acc, mems, tExp, tInc);
      const balances = mems.map(m => {
        const avances = exps.filter(e => e.payer_id === m.user_id).reduce((s,e)=>s+Number(e.amount),0);
        const name = m.profiles?.display_name || 'Membre';
        return { user_id: m.user_id, name, balance: avances - (shares[m.user_id]||0) };
      });

      const creditors = balances.filter(b => b.balance > 0.5).sort((a,b)=>b.balance-a.balance).map(b=>({...b}));
      const debtors = balances.filter(b => b.balance < -0.5).sort((a,b)=>a.balance-b.balance).map(b=>({...b}));
      const txs = [];
      let i=0, j=0;
      while (i < debtors.length && j < creditors.length) {
        const amt = Math.min(-debtors[i].balance, creditors[j].balance);
        if (amt > 0.5) txs.push({ from: debtors[i].name, to: creditors[j].name, amount: amt });
        debtors[i].balance += amt; creditors[j].balance -= amt;
        if (Math.abs(debtors[i].balance) < 0.5) i++;
        if (Math.abs(creditors[j].balance) < 0.5) j++;
      }
      return txs;
    },

    renderComptes() {
      const d = this.comptesMonth;
      document.getElementById('bh-comptes-month-label').textContent = d.toLocaleDateString('fr-FR', {month:'long', year:'numeric'});
      const mKey = this.monthKey(d);

      let html = '';
      
      // 1. Identifier le compte principal et calculer le total des apports sortants (mode fixed/percent/prorata respecté)
      const mainAccId = this.state.profile?.main_account_id;
      const totalOutboundContributions = this.outboundContributionsBreakdown(mainAccId).total;

      // 2. Rendre chaque compte, dans l'ordre choisi par l'utilisateur (compte joint en tête par défaut)
      const orderedAccounts = this.getOrderedAccounts();
      this.ensureComptesResize();
      const step = this.comptesStep();
      const pages = Math.max(1, Math.ceil(orderedAccounts.length / step) || 1);
      this.comptesPage = Math.min(pages - 1, Math.max(0, this.comptesPage || 0));
      const page = this.comptesPage;
      const visibleAccounts = orderedAccounts.slice(page * step, page * step + step);
      visibleAccounts.forEach((acc) => {
        const accIdx = orderedAccounts.findIndex(a => a.id === acc.id);
        const exps = this.state.expenses.filter(e => e.account_id === acc.id);
        const incs = this.state.incomes.filter(i => i.account_id === acc.id);
        const mems = this.state.members.filter(m => m.account_id === acc.id);
        const paidMap = this.state.months[acc.id + '_' + mKey] || {};

        let tExp = 0, tInc = 0, paidSum = 0;
        exps.forEach(e => {
          // Budget théorique : hors enveloppes désactivées
          if (this.isExpenseActive(e)) tExp += Number(e.amount);
          // Déjà réglé portefeuille = sorties de CE compte (historique conservé même si désactivé)
          if (e.is_wallet) paidSum += this.walletOwnSpent(acc.id, e.id, mKey);
          else if (this.isExpenseActive(e) && paidMap[e.id]) paidSum += Number(paidMap[e.id].amount);
        });
        let paidInc = 0, paidRevenus = 0, paidRemb = 0;
        const incPaidMap = this.state.monthsIncomes?.[acc.id + '_' + mKey] || {};
        incs.forEach(i => {
          tInc += Number(i.amount) || 0;
          const rec = incPaidMap[i.id];
          if (!rec) return;
          const amt = Number(rec.amount) || 0;
          paidInc += amt;
          if (i.income_type === 'remboursement') paidRemb += amt;
          else paidRevenus += amt;
        });
        // Dépenses exceptionnelles : comptées dans le déjà réglé (effectif), pas dans le budget théorique
        const exceptionalPaid = this.exceptionalAmountForAccount(acc.id, mKey);
        paidSum += exceptionalPaid;

        const isMain = acc.id === mainAccId;
        // Apports mensuels validés (dépenses virtuelles jour 1) comptent dans "Déjà réglé"
        if (isMain) {
          this.listOutboundApportDues({ mKey }).forEach(ap => {
            const rec = paidMap[ap.id];
            if (rec) paidSum += Number(rec.amount) || 0;
          });
        }
        // Apports de CE compte vers des portefeuilles d'autres comptes
        const walletApportsOutMonth = this.outboundWalletApports(acc.id, mKey);

        // Répartition (apports) et reste théorique — communs à tous les comptes
        const shares = this.computeFairShares(acc, mems, tExp, tInc);
        const totalAllocated = Object.values(shares).reduce((a,b)=>a+b,0);
        const resteTheorique = isMain
          ? (tInc - tExp - totalOutboundContributions - walletApportsOutMonth)
          : (totalAllocated + tInc - tExp - walletApportsOutMonth);
        
        let contribHtml = '';
        let alertHtml = '';
        let settleHtml = '';
        let chartsHtml = '';
        let myMem = null, mesAvances = 0, myFairShare = 0, resteAVirer = 0;

        const catTotals = {};
        exps.forEach(e => {
          if (!this.isExpenseActive(e)) return;
          const c = e.category || 'Autre';
          catTotals[c] = (catTotals[c] || 0) + Number(e.amount);
        });
        const catItemsAcc = Object.entries(catTotals).map(([label, value]) => ({ label, value }));
        if (catItemsAcc.length) {
          chartsHtml += `<div class="bh-acct-chart-block">
            <div class="chart-title">Dépenses par catégorie</div>
            ${this.pieChart(catItemsAcc, { size: 120, centerSub: 'Dépenses' })}
          </div>`;
        }

        if (!isMain) {
            if (mems.length > 0) {
              const couvert = totalAllocated + tInc;
              if (tExp > 0 && couvert < tExp - 0.5) {
                const manque = tExp - couvert;
                alertHtml = `<div style="background:var(--clay-pale); color:var(--clay); border-radius:10px; padding:10px 12px; font-size:12.5px; font-weight:600; margin-bottom:10px; display:flex; gap:8px; align-items:flex-start;">
                  <span>⚠️</span><span>Financement insuffisant : il manque ${this.fmt(manque)}/mois par rapport aux dépenses de ce compte${tInc > 0 ? ' (revenus du compte déjà déduits)' : ''}.</span>
                </div>`;
              } else if (tExp > 0 && couvert > tExp + 0.5) {
                const excedent = couvert - tExp;
                alertHtml = `<div style="background:var(--sage-pale); color:var(--sage-deep); border-radius:10px; padding:10px 12px; font-size:12.5px; font-weight:600; margin-bottom:10px; display:flex; gap:8px; align-items:flex-start;">
                  <span>✓</span><span>Financement excédentaire : ${this.fmt(excedent)}/mois de plus que nécessaire (revenus du compte inclus). Vous pourriez réduire les apports d'autant.</span>
                </div>`;
              }
              if (mems.length > 1) {
                const txs = this.computeSettlements(acc, mems, tExp, exps, tInc);
                if (txs.length) {
                  settleHtml = `<div style="border-top:1px dashed var(--line); margin-top:12px; padding-top:12px;">
                    <div style="font-size:12px; font-weight:700; color:var(--ink-soft); text-transform:uppercase; letter-spacing:0.04em; margin-bottom:8px;">Qui doit quoi</div>
                    ${txs.map(t => `<div style="display:flex; justify-content:space-between; font-size:13px; padding:4px 0;">
                        <span>${this.esc(t.from)} → ${this.esc(t.to)}</span><span class="num" style="color:var(--amber);">${this.fmt(t.amount)}</span>
                      </div>`).join('')}
                  </div>`;
                }
                // Camembert : part de chaque membre dans ce compte partagé (+ revenus du compte s'il y en a)
                const shareItems = mems.map(m => ({
                  label: m.profiles?.display_name || 'Membre',
                  value: shares[m.user_id] || 0
                }));
                if (tInc > 0) shareItems.push({ label: 'Revenus du compte', value: tInc });
                chartsHtml += `<div class="bh-acct-chart-block">
                  <div class="chart-title">Part de chacun</div>
                  ${this.pieChart(shareItems, { size: 120, centerSub: 'Part / mois' })}
                </div>`;
              }
            }

            // Affichage Compte Partagé avec Apport
            myMem = mems.find(m => m.user_id === this.user.id);
            if (myMem) {
                mesAvances = exps.filter(e => e.payer_id === this.user.id).reduce((s,e)=> s+Number(e.amount), 0);
                myFairShare = shares[this.user.id] || 0;
                resteAVirer = Math.max(0, myFairShare - mesAvances);
                contribHtml = this.apportEditorHtml(acc, myMem, { myFairShare, mesAvances, resteAVirer, tExp });
            }
        }

        const hasWallet = exps.some(e => e.is_wallet && this.isExpenseActive(e));
        let upcoming = 0;
        exps.forEach(e => {
          if (!this.isExpenseActive(e)) return;
          if (e.is_wallet) upcoming += Math.max(0, Number(e.amount) - this.walletOwnSpent(acc.id, e.id, mKey));
          else if (!paidMap[e.id]) upcoming += Number(e.amount) || 0;
        });
        const theoIn = isMain ? tInc : (totalAllocated + tInc);
        const theoOut = isMain
          ? (tExp + totalOutboundContributions + walletApportsOutMonth)
          : (tExp + walletApportsOutMonth);
        const apportIn = isMain ? 0 : totalAllocated;
        let apportValide = 0;
        if (!isMain) {
          mems.forEach(m => {
            const rec = this.arrivedApport(acc.id, m.user_id, mKey);
            if (rec) apportValide += Number(rec.amount) || 0;
          });
        }
        let apportReste = 0;
        if (isMain) {
          this.listOutboundApportDues({ mKey }).forEach(ap => {
            if (!paidMap[ap.id]) apportReste += Number(ap.amount) || 0;
          });
        } else {
          apportReste = Math.max(0, apportIn - apportValide);
        }
        const effValide = paidInc + apportValide;
        const resteEffectif = effValide - paidSum;
        if (!this.resteInfo) this.resteInfo = {};
        this.resteInfo[acc.id] = {
          accName: acc.name, isMain, mKey, paidSum, paidInc, apportIn, apportValide, apportReste,
          upcoming, resteEffectif, walletApportsOut: walletApportsOutMonth, hasWallet
        };

        if (!this.acctExpensesList) this.acctExpensesList = {};
        this.acctExpensesList[acc.id] = { accName: acc.name, exps: exps.slice().sort((a,b)=>Number(a.day)-Number(b.day)) };
        if (!this.acctIncomesList) this.acctIncomesList = {};
        this.acctIncomesList[acc.id] = { accName: acc.name, incs: incs.slice() };
        if (!this.resteTheoInfo) this.resteTheoInfo = {};
        this.resteTheoInfo[acc.id] = {
          accName: acc.name, isMain, tInc, tExp, totalOutboundContributions, totalAllocated, resteTheorique, hasWallet,
          walletApportsOut: walletApportsOutMonth
        };
        if (!this.acctView) this.acctView = {};
        this.acctView[acc.id] = {
          accName: acc.name, isMain, theoIn, theoOut, paidInc, paidRevenus, paidRemb, paidSum,
          apportIn, apportValide, apportReste, effValide,
          upcoming, resteTheorique, resteEffectif
        };

        const others = mems.filter(m => m.user_id !== this.user.id);
        const shareBtn = others.length
          ? `<button type="button" class="bh-acct-share" onclick="BH.showAccountMembers('${acc.id}')">Partagé avec ${others.length} personne${others.length > 1 ? 's' : ''}</button>`
          : '';
        const bar = (spent, pool) => {
          const s = Math.max(0, Number(spent) || 0);
          const p = Math.max(0, Number(pool) || 0);
          const delta = p - s;
          if (s <= 0 && p <= 0) return { exp: 0, rest: 0, delta };
          if (p <= 0 || s >= p) return { exp: 100, rest: 0, delta };
          const exp = s / p * 100;
          return { exp, rest: 100 - exp, delta };
        };
        const theoBar = bar(theoOut, theoIn);
        const effPool = paidInc + apportValide;
        const effBar = bar(paidSum, effPool);
        const cell = (label, value, click, extra) => `<button type="button" class="bh-acct-cell${extra || ''}" onclick="${click}"><span class="bh-acct-cell-label">${label}</span><span class="bh-acct-cell-value num">${value}</span></button>`;
        const flag = (amount, click) => {
          const ok = amount > 0;
          return cell(ok ? 'Excédent financier' : 'Risque financier', this.fmt(amount), click, ok ? ' ok' : ' risk');
        };
        let apportCell;
        if (!isMain && myMem) {
          const myMode = myMem.contribution_mode || 'fixed';
          const myContrib = Number(myMem.contribution_target) || 0;
          const shown = myMode === 'prorata' ? this.fmt(myFairShare) : (myMode === 'percent' ? (myContrib + ' %') : this.fmt(myContrib));
          apportCell = cell('Apport', shown, `BH.toggleApportEdit('${acc.id}')`, this.apportEdit === acc.id ? ' active' : '');
        } else if (isMain) {
          apportCell = cell('Apports versés', this.fmt(totalOutboundContributions), `BH.showOutboundApports()`);
        } else {
          apportCell = `<div class="bh-acct-cell is-static"><span class="bh-acct-cell-label">Apport</span><span class="bh-acct-cell-value">—</span></div>`;
        }
        const advanceNote = mesAvances > 0
          ? `<div class="bh-apport-note">J'ai avancé avec ma carte : ${this.fmt(mesAvances)} (reste à virer : ${this.fmt(resteAVirer)})</div>`
          : '';

        html += `<div class="bh-card bh-acct-card">
          <div class="bh-acct-head">
            <div class="bh-acct-head-left">
              <div class="bh-order-btns">
                <button class="bh-order-btn" onclick="BH.moveAccount('${acc.id}', -1)" ${accIdx===0?'disabled':''} title="Monter">▲</button>
                <button class="bh-order-btn" onclick="BH.moveAccount('${acc.id}', 1)" ${accIdx===orderedAccounts.length-1?'disabled':''} title="Descendre">▼</button>
              </div>
              <div class="bh-acct-name">${this.esc(acc.name)}${isMain ? ' <span class="bh-acct-star" title="Compte principal">⭐</span>' : ''}</div>
            </div>
            ${shareBtn}
          </div>
          <button type="button" class="bh-split-btn" onclick="BH.showTheoBar('${acc.id}')">
            <div class="bh-split theo${theoBar.delta < 0 ? ' neg' : ''}"><span class="exp" style="width:${theoBar.exp}%"></span><span class="rest" style="width:${theoBar.rest}%"></span></div>
            <div class="bh-split-legend">
              <span><i class="dot exp"></i> Dépenses théoriques ${this.fmt(theoOut)}</span>
              <span><i class="dot rest"></i> ${theoBar.delta < 0 ? 'Dépassement' : 'Revenu restant'} ${this.fmt(theoBar.delta)}</span>
            </div>
          </button>
          <button type="button" class="bh-split-btn" onclick="BH.showEffBar('${acc.id}')">
            <div class="bh-split eff${effBar.delta < 0 ? ' neg' : ''}">${effBar.delta < 0 && paidSum > 0
              ? `<span class="inc" style="width:${Math.max(0, effPool) / paidSum * 100}%"></span><span class="over" style="width:${(paidSum - Math.max(0, effPool)) / paidSum * 100}%"></span>`
              : `<span class="exp" style="width:${effBar.exp}%"></span><span class="rest" style="width:${effBar.rest}%"></span>`}</div>
            <div class="bh-split-legend">
              <span><i class="dot inc"></i> ${apportValide > 0 ? `Revenus + apport ${this.fmt(effPool)}` : `Revenus validés ${this.fmt(paidInc)}`}</span>
              <span><i class="dot exp"></i> Dépenses validées ${this.fmt(paidSum)}</span>
              <span><i class="dot rest"></i> ${effBar.delta < 0 ? 'Delta' : 'Reste'} ${this.fmt(effBar.delta)}</span>
            </div>
          </button>
          <div class="bh-acct-kicker">Théorique</div>
          <div class="bh-acct-cells">
            ${cell('Dépenses théoriques', this.fmt(tExp), `BH.showTheoExpenses('${acc.id}')`)}
            ${cell('Revenus / remb.', this.fmt(tInc), `BH.showIncomesList('${acc.id}')`)}
            ${apportCell}
            ${flag(resteTheorique, `BH.showResteTheoInfo('${acc.id}')`)}
          </div>
          ${!isMain && myMem && this.apportEdit === acc.id ? contribHtml : ''}
          <div class="bh-acct-kicker">Effectif</div>
          <div class="bh-acct-cells">
            ${cell('Dépenses effectives', this.fmt(paidSum), `BH.showPaidDetail('${acc.id}')`)}
            ${cell('Revenus / apport', this.fmt(effValide), `BH.showEffInflows('${acc.id}')`)}
            ${cell('Dépenses à venir', this.fmt(upcoming), `BH.showUpcoming('${acc.id}')`)}
            ${flag(resteEffectif, `BH.showResteInfo('${acc.id}')`)}
          </div>
          ${advanceNote}
          ${settleHtml}
          ${chartsHtml}
          ${this.accountWalletsHtml(acc, mKey)}
        </div>`;
      });
      const names = visibleAccounts.map(a => this.esc(a.name)).join(' · ');
      const pager = `<div class="bh-acct-pager">
        <button type="button" class="bh-icon-btn" onclick="BH.shiftComptesPage(-1)" ${page <= 0 ? 'disabled' : ''} aria-label="Comptes précédents">&larr;</button>
        <div class="bh-acct-pager-names">${names || 'Aucun compte'}<div class="bh-acct-pager-page">${page + 1} / ${pages}</div></div>
        <button type="button" class="bh-icon-btn" onclick="BH.shiftComptesPage(1)" ${page >= pages - 1 ? 'disabled' : ''} aria-label="Comptes suivants">&rarr;</button>
      </div>`;
      document.getElementById('bh-accounts-list').innerHTML = orderedAccounts.length
        ? pager + `<div class="bh-acct-pair">${html}</div>`
        : `<div class="bh-empty">Aucun compte</div>`;
    },

    async saveContribution(accId, val) {
       const numVal = Number(val) || 0;
       await withRetry(async () => {
         const { error } = await supabaseApp.from('account_members')
           .update({ contribution_target: numVal })
           .eq('account_id', accId).eq('user_id', this.user.id);
         if (error) throw error;
         toast("Apport mis à jour");
         this.fetchData();
       }, 'sauvegarde apport');
    },

    async saveContributionMode(accId, mode) {
       await withRetry(async () => {
         const { error } = await supabaseApp.from('account_members')
           .update({ contribution_mode: mode })
           .eq('account_id', accId).eq('user_id', this.user.id);
         if (error) throw error;
         toast("Mode de répartition mis à jour");
         this.fetchData();
       }, 'sauvegarde mode');
    },

    comptesMKey() { return this.monthKey(this.comptesMonth || new Date()); },
    comptesStep() { return window.matchMedia('(min-width: 960px)').matches ? 2 : 1; },
    shiftComptesPage(dir) {
      this.comptesPage = (this.comptesPage || 0) + dir;
      this.renderComptes();
    },
    ensureComptesResize() {
      if (this._comptesResize) return;
      this._comptesStep = this.comptesStep();
      this._comptesResize = () => {
        if (this.activeTab !== 'comptes') return;
        const step = this.comptesStep();
        if (step === this._comptesStep) return;
        this._comptesStep = step;
        this.renderComptes();
      };
      window.addEventListener('resize', this._comptesResize);
    },
    acctCompareBars(title, theo, eff, real) {
      const series = [
        ['Théorique', theo, 'theo'],
        ['Validé', eff, 'eff'],
        ['Vérifié', real, 'real']
      ];
      const max = Math.max(...series.map(([, v]) => Math.abs(Number(v) || 0)), 0.01);
      const w = (v) => {
        const n = Math.abs(Number(v) || 0);
        return n <= 0 ? 0 : Math.max(4, Math.min(100, n / max * 100));
      };
      return `<div class="bh-acct-compare">
        <div class="bh-acct-compare-title">${title}</div>
        ${series.map(([label, val, cls]) => `<div class="bh-acct-bar-row"><span>${label}</span><span class="num">${this.fmt(val)}</span></div>
        <div class="bh-acct-track"><div class="bh-acct-fill ${cls}" style="width:${w(val)}%"></div></div>`).join('')}
      </div>`;
    },
    detailLine(label, amount) {
      return `<div class="bh-info-row"><span>${label}</span><span class="num">${this.fmt(amount)}</span></div>`;
    },
    detailSub(label, amount) {
      return `<div class="bh-info-row bh-detail-sub"><span>${label}</span><span class="num">${this.fmt(amount)}</span></div>`;
    },
    apportEditorHtml(acc, myMem, ctx) {
      const myMode = myMem.contribution_mode || 'fixed';
      const myContrib = Number(myMem.contribution_target) || 0;
      const open = this.apportEdit === acc.id;
      const modeLabel = myMode === 'percent' ? 'Pourcentage' : (myMode === 'prorata' ? 'Prorata des revenus' : 'Montant fixe');
      const shown = myMode === 'prorata' ? this.fmt(ctx.myFairShare) : (myMode === 'percent' ? myContrib + ' %' : this.fmt(myContrib));
      const max = myMode === 'percent' ? 100 : (Math.round((ctx.tExp || 0) * 1.1) || 100);
      const step = myMode === 'percent' ? 1 : 5;
      return `<div class="bh-apport">
        <div class="bh-apport-locked">
          <div>
            <div class="bh-mini-label">Apport validé</div>
            <div class="bh-apport-value num">${shown}</div>
            <div class="bh-apport-mode">${this.esc(modeLabel)}</div>
          </div>
          <span class="bh-apport-badge">Validé</span>
          <button type="button" class="bh-apport-hist" onclick="BH.showApportHistory('${acc.id}')">Historique</button>
          <button type="button" class="bh-apport-pen" onclick="BH.toggleApportEdit('${acc.id}')" title="${open ? 'Fermer' : 'Modifier'}">${open ? '✕' : '✎'}</button>
        </div>
        <div class="bh-apport-editor${open ? ' open' : ''}">
          <label class="bh-field-label" for="apport-mode-${acc.id}">Mode</label>
          <select id="apport-mode-${acc.id}" class="bh-input" onchange="BH.onApportModePreview('${acc.id}', this.value)">
            <option value="fixed" ${myMode === 'fixed' ? 'selected' : ''}>Montant fixe (€)</option>
            <option value="percent" ${myMode === 'percent' ? 'selected' : ''}>Pourcentage (%)</option>
            <option value="prorata" ${myMode === 'prorata' ? 'selected' : ''}>Prorata des revenus</option>
          </select>
          <div class="contrib-input-wrap" id="apport-amount-${acc.id}" ${myMode === 'prorata' ? 'style="display:none"' : ''}>
            <input type="range" id="apport-range-${acc.id}" min="0" max="${max}" step="${step}" value="${myContrib}" oninput="BH.previewApport('${acc.id}', this.value)">
            <input type="number" id="apport-num-${acc.id}" value="${myContrib}" oninput="BH.previewApport('${acc.id}', this.value)">
          </div>
          <p class="bh-apport-hint">La valeur ne change qu’après Enregistrer. Chaque validation est conservée dans l’historique.</p>
          <div class="bh-apport-actions">
            <button type="button" class="bh-btn bh-btn-ghost" onclick="BH.toggleApportEdit('${acc.id}')">Annuler</button>
            <button type="button" class="bh-btn bh-btn-primary" onclick="BH.commitApport('${acc.id}')">Enregistrer</button>
          </div>
        </div>
      </div>`;
    },
    toggleApportEdit(accId) {
      this.apportEdit = this.apportEdit === accId ? null : accId;
      this.renderComptes();
    },
    previewApport(accId, val) {
      const n = document.getElementById('apport-num-' + accId);
      const r = document.getElementById('apport-range-' + accId);
      if (n && n.value !== String(val)) n.value = val;
      if (r && r.value !== String(val)) r.value = val;
    },
    onApportModePreview(accId, mode) {
      const wrap = document.getElementById('apport-amount-' + accId);
      if (wrap) wrap.style.display = mode === 'prorata' ? 'none' : 'flex';
    },
    async commitApport(accId) {
      const modeEl = document.getElementById('apport-mode-' + accId);
      const numEl = document.getElementById('apport-num-' + accId);
      const mode = modeEl ? modeEl.value : 'fixed';
      const numVal = Number(numEl && numEl.value) || 0;
      const mem = (this.state.members || []).find(m => m.account_id === accId && m.user_id === this.user.id);
      const same = mem && Number(mem.contribution_target) === numVal && (mem.contribution_mode || 'fixed') === mode;
      if (same) {
        this.apportEdit = null;
        this.renderComptes();
        toast('Déjà la valeur validée');
        return;
      }
      await withRetry(async () => {
        const { error } = await supabaseApp.from('account_members')
          .update({ contribution_target: numVal, contribution_mode: mode })
          .eq('account_id', accId).eq('user_id', this.user.id);
        if (error) throw error;
        if (mem) { mem.contribution_target = numVal; mem.contribution_mode = mode; }
        this.apportEdit = null;
        toast('Apport validé');
        this.fetchData();
      }, 'validation de l\'apport');
    },
    async showApportHistory(accId) {
      const acc = (this.state.accounts || []).find(a => a.id === accId);
      const rowId = accId + ':' + this.user.id;
      const { data, error } = await supabaseApp.from('history')
        .select('changed_at, op, old_row, new_row')
        .eq('table_name', 'account_members')
        .eq('row_id', rowId)
        .order('changed_at', { ascending: false })
        .limit(40);
      if (error) { toast('Historique indisponible'); return; }
      const fmtTarget = (row) => {
        if (!row) return '—';
        const mode = row.contribution_mode || 'fixed';
        const n = Number(row.contribution_target);
        const v = Number.isFinite(n) ? n : 0;
        if (mode === 'percent') return v + ' %';
        if (mode === 'prorata') return 'prorata';
        return this.fmt(v);
      };
      const lines = (data || []).filter(h => {
        if (h.op !== 'UPDATE') return true;
        const o = h.old_row || {}, n = h.new_row || {};
        return String(o.contribution_target) !== String(n.contribution_target)
          || (o.contribution_mode || 'fixed') !== (n.contribution_mode || 'fixed');
      });
      const rows = lines.length ? lines.map(h => {
        const when = new Date(h.changed_at).toLocaleString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        const text = h.op === 'INSERT' ? ('Valeur initiale ' + fmtTarget(h.new_row)) : (fmtTarget(h.old_row) + ' → ' + fmtTarget(h.new_row));
        return `<div class="bh-info-row"><span>${when}</span><span>${text}</span></div>`;
      }).join('') : `<div style="font-size:13px; color:var(--ink-soft);">Aucun changement enregistré. La valeur affichée est celle validée.</div>`;
      this.openInfo((acc ? acc.name : 'Compte') + ' — historique de l\'apport', rows);
    },
    showTheoExpenses(accId) {
      const mKey = this.comptesMKey();
      const acc = (this.state.accounts || []).find(a => a.id === accId);
      const exps = (this.state.expenses || []).filter(e => e.account_id === accId && this.isExpenseActive(e))
        .sort((a, b) => Number(a.day) - Number(b.day));
      if (!exps.length) {
        this.openInfo('Dépenses théoriques', `<div style="font-size:13px; color:var(--ink-soft);">Aucune dépense pour ce compte.</div>`);
        return;
      }
      let total = 0, rows = '';
      exps.forEach(e => {
        const amt = Number(e.amount) || 0;
        total += amt;
        const meta = [e.category, !e.is_wallet && e.day ? ('le ' + e.day) : ''].filter(Boolean).join(' · ');
        rows += this.detailLine((e.is_wallet ? '👛 ' : '') + this.esc(e.description || 'Dépense') + (meta ? ` <span class="bh-detail-meta">${this.esc(meta)}</span>` : ''), amt);
        if (e.is_wallet) {
          const txs = this.getWalletTx(accId, e.id, mKey);
          if (!txs.length) rows += `<div class="bh-detail-subnote">Aucun mouvement ce mois-ci. Le budget compte en entier.</div>`;
          txs.forEach(t => {
            const tag = this.isExternalWalletApport(t) ? 'apport reçu · ' : '';
            rows += this.detailSub(tag + this.esc(t.description || 'Mouvement') + (t.day ? (' · le ' + t.day) : ''), Number(t.amount) || 0);
          });
        }
      });
      rows += this.detailLine('<strong>Total théorique</strong>', total);
      this.openInfo((acc ? acc.name : 'Compte') + ' — dépenses théoriques', rows);
    },
    paidExpenseRows(accId) {
      const mKey = this.comptesMKey();
      const exps = (this.state.expenses || []).filter(e => e.account_id === accId);
      const paidMap = this.state.months[accId + '_' + mKey] || {};
      let total = 0, rows = '';
      exps.forEach(e => {
        if (e.is_wallet) {
          this.getWalletTx(accId, e.id, mKey).forEach(t => {
            const amt = Number(t.amount) || 0;
            const label = '👛 ' + this.esc(e.description || 'Portefeuille') + ' · ' + this.esc(t.description || 'Mouvement') + (t.day ? (' · le ' + t.day) : '');
            if (this.isExternalWalletApport(t)) rows += this.detailSub('apport reçu, non déduit · ' + label, amt);
            else { total += amt; rows += this.detailLine(label, amt); }
          });
        } else if (this.isExpenseActive(e) && paidMap[e.id]) {
          const amt = Number(paidMap[e.id].amount) || 0;
          total += amt;
          rows += this.detailLine(this.esc(e.description || 'Dépense') + (e.day ? (' · le ' + e.day) : ''), amt);
        }
      });
      this.listExceptionalExpenses(accId, mKey).forEach(e => {
        const amt = Number(e.amount) || 0;
        total += amt;
        rows += this.detailLine(this.esc(e.description || 'Exceptionnel') + ' · exceptionnel', amt);
      });
      if (accId === this.state.profile?.main_account_id) {
        this.listOutboundApportDues({ mKey }).forEach(ap => {
          const rec = paidMap[ap.id];
          if (!rec) return;
          const amt = Number(rec.amount) || 0;
          total += amt;
          rows += this.detailLine(this.esc(ap.description || 'Apport'), amt);
        });
      }
      return { rows, total };
    },
    showPaidDetail(accId) {
      const acc = (this.state.accounts || []).find(a => a.id === accId);
      const built = this.paidExpenseRows(accId);
      const rows = built.rows
        ? built.rows + this.detailLine('<strong>Total déjà payé</strong>', built.total)
        : `<div style="font-size:13px; color:var(--ink-soft);">Rien de payé sur ce mois.</div>`;
      this.openInfo((acc ? acc.name : 'Compte') + ' — déjà payé', rows);
    },
    showAccountMembers(accId) {
      const acc = (this.state.accounts || []).find(a => a.id === accId);
      const mems = (this.state.members || []).filter(m => m.account_id === accId);
      const rows = mems.length ? mems.map(m => {
        const name = (m.profiles && m.profiles.display_name) || 'Membre';
        const me = m.user_id === this.user.id ? ' · moi' : '';
        return `<div class="bh-info-row"><span>${this.esc(name)}${me}</span></div>`;
      }).join('') : `<div style="font-size:13px; color:var(--ink-soft);">Aucun membre.</div>`;
      this.openInfo((acc ? acc.name : 'Compte') + ' — personnes', rows);
    },
    showTheoBar(accId) {
      const v = this.acctView && this.acctView[accId];
      if (!v) return;
      const delta = v.theoIn - v.theoOut;
      const rows = this.detailLine('Dépenses théoriques', v.theoOut)
        + this.detailLine(v.isMain ? 'Revenus' : 'Revenus + apports', v.theoIn)
        + this.detailLine(delta < 0 ? 'Dépassement' : 'Revenu restant', delta);
      this.openInfo(v.accName + ' — barre théorique', rows);
    },
    showEffBar(accId) {
      const v = this.acctView && this.acctView[accId];
      if (!v) return;
      const mKey = this.comptesMKey();
      const paid = this.state.monthsIncomes?.[accId + '_' + mKey] || {};
      let rows = '';
      (this.state.incomes || []).filter(i => i.account_id === accId && paid[i.id]).forEach(i => {
        const kind = i.income_type === 'remboursement' ? 'Revenu validé · remb.' : 'Revenu validé';
        rows += this.detailLine(kind + ' · ' + this.esc(i.description || 'Revenu'), Number(paid[i.id].amount) || 0);
      });
      if (v.apportValide > 0) rows += this.detailLine('Apport validé', v.apportValide);
      if (!rows) rows = `<div class="bh-info-row"><span>Aucun revenu validé</span><span class="num">${this.fmt(0)}</span></div>`;
      const spent = this.paidExpenseRows(accId);
      rows += spent.rows || `<div class="bh-info-row"><span>Aucune dépense validée</span><span class="num">${this.fmt(0)}</span></div>`;
      const delta = (v.paidInc + (v.apportValide || 0)) - v.paidSum;
      rows += this.detailLine(delta < 0 ? '<strong>Delta</strong>' : '<strong>Reste sur les revenus</strong>', delta);
      this.openInfo(v.accName + ' — barre validée', rows);
    },
    showEffInflows(accId) {
      const v = this.acctView && this.acctView[accId];
      const acc = (this.state.accounts || []).find(a => a.id === accId);
      const mKey = this.comptesMKey();
      const paid = this.state.monthsIncomes?.[accId + '_' + mKey] || {};
      const incs = (this.state.incomes || []).filter(i => i.account_id === accId);
      let validated = '', pending = '', totalOk = 0, totalWait = 0;
      incs.forEach(i => {
        const rec = paid[i.id];
        const kind = i.income_type === 'remboursement' ? 'Remboursement' : 'Revenu';
        const label = kind + ' · ' + this.esc(i.description || 'Revenu');
        if (rec) {
          const amt = Number(rec.amount) || 0;
          totalOk += amt;
          validated += this.detailLine(label, amt);
        } else {
          const amt = Number(i.amount) || 0;
          totalWait += amt;
          pending += this.detailLine(label, amt);
        }
      });
      const shareInfo = this.fairSharesForAccount(accId);
      if (v && !shareInfo.isMain && shareInfo.mems.length > 1) {
        let listedOk = 0, listedWait = 0;
        shareInfo.mems.forEach(m => {
          const share = Number(shareInfo.shares[m.user_id]) || 0;
          const rec = this.arrivedApport(accId, m.user_id, mKey);
          const amtPaid = rec ? (Number(rec.amount) || 0) : 0;
          const name = this.esc((m.profiles && m.profiles.display_name) || 'Membre');
          const mine = !!(this.user && m.user_id === this.user.id);
          const me = mine ? ' · moi' : '';
          const canAct = !mine && /^[0-9a-f-]{36}$/i.test(String(m.user_id)) && /^[0-9a-f-]{36}$/i.test(String(accId));
          const ownHint = mine && !(amtPaid > 0.004) ? ' <span class="bh-detail-meta">à valider dans Aujourd\'hui</span>' : '';
          if (amtPaid > 0.004) {
            listedOk += amtPaid;
            validated += this.apportValidateHtml('Apport · ' + name + me, amtPaid, canAct ? 'cancel' : '', accId, m.user_id);
          } else if (share > 0.004) {
            listedWait += share;
            pending += this.apportValidateHtml('Apport · ' + name + me + ownHint, share, canAct ? 'pay' : '', accId, m.user_id);
          }
        });
        const okGap = (v.apportValide || 0) - listedOk;
        const waitGap = (v.apportReste || 0) - listedWait;
        if (okGap > 0.004) validated += this.detailLine('Apport validé', okGap);
        if (waitGap > 0.004) pending += this.detailLine('Apport pas encore validé', waitGap);
        totalOk += v.apportValide || 0;
        totalWait += v.apportReste || 0;
      } else {
        if (v && v.apportValide > 0) {
          totalOk += v.apportValide;
          validated += this.detailLine('Apport validé', v.apportValide);
        }
        if (v && v.apportReste > 0) {
          totalWait += v.apportReste;
          pending += this.detailLine('Apport pas encore validé', v.apportReste);
        }
      }
      if (!validated) validated = `<div class="bh-info-row"><span>Rien de validé</span><span class="num">${this.fmt(0)}</span></div>`;
      else validated += this.detailLine('<strong>Total validé</strong>', totalOk);
      if (!pending) pending = `<div class="bh-info-row"><span>Rien en attente</span><span class="num">${this.fmt(0)}</span></div>`;
      else pending += this.detailLine('<strong>Total en attente</strong>', totalWait);
      const rows = `<div class="bh-section-label" style="margin-top:0;">Déjà validé</div>${validated}`
        + `<div class="bh-section-label">En attente de validation</div>${pending}`;
      this.openInfo((acc ? acc.name : 'Compte') + ' — revenus et apport', rows);
    },
    showUpcoming(accId) {
      const mKey = this.comptesMKey();
      const acc = (this.state.accounts || []).find(a => a.id === accId);
      const paidMap = this.state.months[accId + '_' + mKey] || {};
      const exps = (this.state.expenses || []).filter(e => e.account_id === accId);
      let total = 0, rows = '';
      exps.forEach(e => {
        if (!this.isExpenseActive(e)) return;
        if (e.is_wallet) {
          const left = Math.max(0, Number(e.amount) - this.walletOwnSpent(accId, e.id, mKey));
          if (left > 0.004) {
            total += left;
            rows += this.detailLine('👛 ' + this.esc(e.description || 'Portefeuille') + ' · pas encore sorti', left);
          }
        } else if (!paidMap[e.id]) {
          const amt = Number(e.amount) || 0;
          total += amt;
          rows += this.detailLine(this.esc(e.description || 'Dépense') + (e.day ? (' · le ' + e.day) : '') + ' · pas encore validé', amt);
        }
      });
      if (!rows) rows = `<div style="font-size:13px; color:var(--ink-soft);">Tout est déjà validé.</div>`;
      else rows += this.detailLine('<strong>Reste à venir</strong>', total);
      this.openInfo((acc ? acc.name : 'Compte') + ' — dépenses à venir', rows);
    },
    showOutboundApports() {
      const mKey = this.comptesMKey();
      const mainId = this.state.profile?.main_account_id;
      let total = 0, rows = '';
      (this.state.accounts || []).forEach(acc => {
        if (acc.id === mainId) return;
        const mems = (this.state.members || []).filter(m => m.account_id === acc.id);
        if (!mems.some(m => m.user_id === this.user.id)) return;
        const exps = (this.state.expenses || []).filter(e => e.account_id === acc.id && this.isExpenseActive(e));
        const incs = (this.state.incomes || []).filter(i => i.account_id === acc.id);
        const tExp = exps.reduce((s, e) => s + (Number(e.amount) || 0), 0);
        const tInc = incs.reduce((s, i) => s + (Number(i.amount) || 0), 0);
        const gross = (this.computeFairShares(acc, mems, tExp, tInc)[this.user.id]) || 0;
        if (!(gross > 0)) return;
        total += gross;
        rows += this.detailLine(this.esc(acc.name), gross);
        const plan = this.splitApportForAdvances(acc.id, mKey, gross);
        if (plan.advances > 0) {
          rows += this.detailSub('à virer', plan.transfer);
        }
      });
      if (!rows) rows = `<div style="font-size:13px; color:var(--ink-soft);">Aucun apport vers un autre compte.</div>`;
      else rows += this.detailLine('<strong>Total</strong>', total);
      this.openInfo('Apports versés', rows);
    },
    showResteDetail(accId) {
      const v = this.acctView && this.acctView[accId];
      if (!v) return;
      const nom = v.resteEffectif > 0 ? 'Excédent financier' : 'Risque financier';
      const rows = this.detailLine('Revenus encaissés', v.paidRevenus)
        + this.detailLine('Remboursements encaissés', v.paidRemb)
        + this.detailLine('Apport validé', v.apportValide)
        + this.detailLine('− Dépenses validées', v.paidSum)
        + this.detailLine('<strong>= ' + nom + '</strong>', v.resteEffectif)
        + `<div style="font-size:11.5px; color:var(--ink-faint); margin-top:14px; line-height:1.45;">Ces deux montants ne sont pas dans le calcul.</div>`
        + this.detailLine('Reste à apporter', v.apportReste)
        + this.detailLine('Reste à dépenser', v.upcoming);
      this.openInfo(v.accName + ' — ' + nom, rows);
    },
    showRealDetail(accId, maxDay) {
      const mKey = this.comptesMKey();
      const acc = (this.state.accounts || []).find(a => a.id === accId);
      const cap = maxDay != null ? Number(maxDay) : null;
      let rows = '', exp = 0, inc = 0;
      const seen = new Set();
      (this.getBankVerifsForMonth ? this.getBankVerifsForMonth(mKey) : []).forEach(v => {
        if (!v || v.status === 'ignored') return;
        const key = v.fingerprint || v.id;
        if (seen.has(key)) return;
        const day = v.bank_date ? Number(String(v.bank_date).slice(8, 10)) : 31;
        if (cap != null && day > cap) return;
        const amt = Math.abs(Number(v.bank_amount) || 0);
        if (!(amt > 0)) return;
        const id = v.linked_id != null ? String(v.linked_id) : '';
        const kind = v.linked_kind;
        let side = '';
        let label = this.esc(v.bank_label || 'Ligne vérifiée');
        if (kind === 'expense') {
          const e = (this.state.expenses || []).find(x => String(x.id) === id && x.account_id === accId);
          if (!e) return;
          side = 'exp';
          label = (e.is_wallet ? '👛 ' : '') + this.esc(e.description || label);
        } else if (kind === 'wallet' || v.status === 'wallet') {
          const txId = (v.meta && (v.meta.tx_id || v.meta.wallet_tx_id)) || id;
          const expId = v.meta && v.meta.exp_id;
          const wallet = (this.state.expenses || []).find(e => e.is_wallet && e.account_id === accId && (
            (expId && String(e.id) === String(expId)) ||
            this.getWalletTx(e.account_id, e.id, mKey).some(t => String(t.id) === String(txId))
          ));
          if (!wallet) return;
          side = 'exp';
          label = '👛 ' + this.esc(wallet.description || 'Portefeuille') + ' · ' + label;
        } else if (kind === 'apport') {
          if (accId !== this.state.profile?.main_account_id) return;
          side = 'exp';
        } else if (kind === 'income' || kind === 'refund') {
          const i = (this.state.incomes || []).find(x => String(x.id) === id && x.account_id === accId);
          if (!i) return;
          side = 'inc';
          label = this.esc(i.description || label);
        } else return;
        seen.add(key);
        if (side === 'inc') inc += amt; else exp += amt;
        rows += this.detailLine((side === 'inc' ? '+ ' : '− ') + label + (day ? ' · le ' + day : ''), amt);
      });
      if (!rows) rows = `<div style="font-size:13px; color:var(--ink-soft);">Aucune ligne vérifiée sur ce mois.</div>`;
      else rows += this.detailLine('<strong>Dépenses vérifiées</strong>', exp) + this.detailLine('<strong>Revenus vérifiés</strong>', inc);
      this.openInfo((acc ? acc.name : 'Compte') + ' — vérifié', rows);
    },
});
