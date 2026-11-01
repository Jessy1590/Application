  // Couche données du mois (schéma banque) : validations, portefeuilles, budget théorique figé.
  // En mémoire l'appli garde le format historique « month_records » (paid_expenses, paid_incomes,
  // wallet_transactions, theoretical_*). En base : une ligne par fait, écrite seulement si elle change,
  // ce qui évite qu'un appareil écrase les saisies d'un autre.
Object.assign(BH, {
    PAGE_SIZE: 1000,
    PAYMENT_FIELDS: ['amount', 'on', 'exceptional', 'description', 'category', 'date', 'day', 'refund_of'],
    WALLET_TX_FIELDS: ['id', 'description', 'amount', 'day', 'date', 'kind'],

    // Supabase limite une réponse à 1000 lignes : on pagine pour tenir sur la durée
    async selectAll(table, build) {
      const out = [];
      for (let from = 0; ; from += this.PAGE_SIZE) {
        let q = supabaseApp.from(table).select('*');
        if (build) q = build(q);
        const { data, error } = await q.range(from, from + this.PAGE_SIZE - 1);
        if (error) throw error;
        out.push(...(data || []));
        if (!data || data.length < this.PAGE_SIZE) return out;
      }
    },

    stableKey(v) {
      if (v === undefined) return 'null';
      if (v === null || typeof v !== 'object') return JSON.stringify(v);
      if (Array.isArray(v)) return '[' + v.map(x => this.stableKey(x)).join(',') + ']';
      return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + this.stableKey(v[k])).join(',') + '}';
    },
    pickExtra(obj, known) {
      const extra = {};
      Object.keys(obj || {}).forEach(k => { if (!known.includes(k) && obj[k] !== undefined) extra[k] = obj[k]; });
      return extra;
    },

    paymentToRec(p) {
      const rec = { ...(p.extra || {}), amount: Number(p.amount), on: p.paid_at };
      if (p.is_exceptional) rec.exceptional = true;
      if (p.description != null) rec.description = p.description;
      if (p.category != null) rec.category = p.category;
      if (p.op_date) rec.date = p.op_date;
      if (p.day != null) rec.day = p.day;
      if (p.refund_of != null) rec.refund_of = p.refund_of;
      return rec;
    },
    recToPayment(accId, mKey, side, itemId, rec) {
      const r = rec || {};
      return {
        account_id: accId,
        month_key: mKey,
        side,
        item_id: String(itemId),
        amount: Number(r.amount) || 0,
        paid_at: r.on || null,
        is_exceptional: !!r.exceptional,
        description: r.description ?? null,
        category: r.category ?? null,
        op_date: r.date || null,
        day: r.day != null && r.day !== '' && Number.isFinite(Number(r.day)) ? Number(r.day) : null,
        refund_of: r.refund_of ?? null,
        extra: this.pickExtra(r, this.PAYMENT_FIELDS)
      };
    },
    walletRowToTx(w) {
      const tx = { ...(w.extra || {}), id: w.id, description: w.description, amount: Number(w.amount) };
      if (w.day != null) tx.day = w.day;
      if (w.op_date) tx.date = w.op_date;
      if (w.kind != null) tx.kind = w.kind;
      return tx;
    },
    txToWalletRow(accId, mKey, walletId, tx, position) {
      const t = tx || {};
      return {
        id: String(t.id),
        account_id: accId,
        month_key: mKey,
        wallet_id: walletId,
        description: t.description ?? null,
        amount: Number(t.amount) || 0,
        day: t.day != null && t.day !== '' && Number.isFinite(Number(t.day)) ? Number(t.day) : null,
        op_date: t.date || null,
        kind: t.kind ?? null,
        position,
        extra: this.pickExtra(t, this.WALLET_TX_FIELDS)
      };
    },

    // Reconstitue les « month_records » à partir des tables banque
    async loadMonthRecords() {
      const [payments, wallet, snaps] = await Promise.all([
        this.selectAll('payments', q => q.order('paid_at')),
        this.selectAll('wallet_transactions', q => q.order('position').order('created_at')),
        this.selectAll('month_snapshots')
      ]);
      const byKey = new Map();
      const rec = (accId, mKey) => {
        const k = accId + '_' + mKey;
        if (!byKey.has(k)) {
          byKey.set(k, {
            account_id: accId, month_key: mKey,
            paid_expenses: {}, paid_incomes: {}, wallet_transactions: {},
            theoretical_expenses: {}, theoretical_incomes: {}
          });
        }
        return byKey.get(k);
      };
      payments.forEach(p => {
        const r = rec(p.account_id, p.month_key);
        (p.side === 'income' ? r.paid_incomes : r.paid_expenses)[p.item_id] = this.paymentToRec(p);
      });
      wallet.forEach(w => {
        const r = rec(w.account_id, w.month_key);
        (r.wallet_transactions[w.wallet_id] = r.wallet_transactions[w.wallet_id] || []).push(this.walletRowToTx(w));
      });
      snaps.forEach(s => {
        const r = rec(s.account_id, s.month_key);
        r.theoretical_expenses = s.theoretical_expenses || {};
        r.theoretical_incomes = s.theoretical_incomes || {};
      });
      return { data: [...byKey.values()], error: null };
    },

    async writePaymentsDiff(accId, mKey, side, prev, next) {
      const upserts = [];
      const deletes = [];
      const now = new Date().toISOString();
      Object.keys(next || {}).forEach(id => {
        const row = this.recToPayment(accId, mKey, side, id, next[id]);
        const old = prev && prev[id] ? this.recToPayment(accId, mKey, side, id, prev[id]) : null;
        if (!old || this.stableKey(old) !== this.stableKey(row)) upserts.push({ ...row, paid_at: row.paid_at || now });
      });
      Object.keys(prev || {}).forEach(id => { if (!next || !(id in next)) deletes.push(String(id)); });
      if (upserts.length) {
        const { error } = await supabaseApp.from('payments')
          .upsert(upserts, { onConflict: 'account_id,month_key,side,item_id' });
        if (error) throw error;
      }
      if (deletes.length) {
        const { error } = await supabaseApp.from('payments').delete()
          .eq('account_id', accId).eq('month_key', mKey).eq('side', side).in('item_id', deletes);
        if (error) throw error;
      }
    },

    flattenWalletBucket(accId, mKey, bucket) {
      const map = new Map();
      Object.entries(bucket || {}).forEach(([walletId, list]) => {
        (Array.isArray(list) ? list : []).forEach((tx, i) => {
          if (tx && tx.id != null) map.set(String(tx.id), this.txToWalletRow(accId, mKey, walletId, tx, i));
        });
      });
      return map;
    },
    async writeWalletDiff(accId, mKey, prev, next) {
      const before = this.flattenWalletBucket(accId, mKey, prev);
      const after = this.flattenWalletBucket(accId, mKey, next);
      const upserts = [];
      after.forEach((row, id) => {
        const old = before.get(id);
        if (!old || this.stableKey(old) !== this.stableKey(row)) upserts.push(row);
      });
      const deletes = [...before.keys()].filter(id => !after.has(id));
      if (upserts.length) {
        const { error } = await supabaseApp.from('wallet_transactions').upsert(upserts, { onConflict: 'id' });
        if (error) throw error;
      }
      if (deletes.length) {
        const { error } = await supabaseApp.from('wallet_transactions').delete()
          .eq('account_id', accId).in('id', deletes);
        if (error) throw error;
      }
    },

    async writeSnapshot(accId, mKey, patch, hasRecord) {
      const key = accId + '_' + mKey;
      const row = { account_id: accId, month_key: mKey };
      if (patch.theoretical_expenses !== undefined) row.theoretical_expenses = patch.theoretical_expenses || {};
      else if (!hasRecord) row.theoretical_expenses = this.state.theoreticalMonths?.[key] || {};
      if (patch.theoretical_incomes !== undefined) row.theoretical_incomes = patch.theoretical_incomes || {};
      else if (!hasRecord) row.theoretical_incomes = this.state.theoreticalIncomesMonths?.[key] || {};
      const { error } = await supabaseApp.from('month_snapshots').upsert(row, { onConflict: 'account_id,month_key' });
      if (error) throw error;
    },

    syncMonthRecordCaches(accId, mKey, updates) {
      const key = accId + '_' + mKey;
      if (!updates) return;
      this._localMutAt = Date.now();
      if (updates.paid_expenses !== undefined) {
        if (!this.state.months) this.state.months = {};
        this.state.months[key] = updates.paid_expenses || {};
      }
      if (updates.paid_incomes !== undefined) {
        if (!this.state.monthsIncomes) this.state.monthsIncomes = {};
        this.state.monthsIncomes[key] = updates.paid_incomes || {};
      }
      if (updates.wallet_transactions !== undefined) {
        if (!this.state.walletTx) this.state.walletTx = {};
        this.state.walletTx[key] = updates.wallet_transactions || {};
      }
      if (updates.theoretical_expenses !== undefined) {
        if (!this.state.theoreticalMonths) this.state.theoreticalMonths = {};
        this.state.theoreticalMonths[key] = updates.theoretical_expenses || {};
      }
      if (updates.theoretical_incomes !== undefined) {
        if (!this.state.theoreticalIncomesMonths) this.state.theoreticalIncomesMonths = {};
        this.state.theoreticalIncomesMonths[key] = updates.theoretical_incomes || {};
      }
    },

    // Point d'écriture unique du mois. patch = colonnes « month_records » complètes à appliquer.
    // Lève une erreur en cas d'échec (à appeler dans withRetry / runVerif).
    async upsertMonthRecord(accId, mKey, patch) {
      const key = accId + '_' + mKey;
      const updates = {};
      ['paid_expenses', 'paid_incomes', 'wallet_transactions', 'theoretical_expenses', 'theoretical_incomes']
        .forEach(k => { if (patch[k] !== undefined) updates[k] = patch[k] || {}; });
      if (!Object.keys(updates).length) return;
      const existing = (this.state.monthRecords || []).find(r => r.account_id === accId && r.month_key === mKey);

      const writes = [];
      if (updates.paid_expenses) writes.push(this.writePaymentsDiff(accId, mKey, 'expense', this.state.months?.[key] || {}, updates.paid_expenses));
      if (updates.paid_incomes) writes.push(this.writePaymentsDiff(accId, mKey, 'income', this.state.monthsIncomes?.[key] || {}, updates.paid_incomes));
      if (updates.wallet_transactions) writes.push(this.writeWalletDiff(accId, mKey, this.state.walletTx?.[key] || {}, updates.wallet_transactions));
      if (updates.theoretical_expenses || updates.theoretical_incomes) writes.push(this.writeSnapshot(accId, mKey, updates, !!existing));
      await Promise.all(writes);

      if (existing) {
        Object.assign(existing, updates);
      } else {
        if (!this.state.monthRecords) this.state.monthRecords = [];
        this.state.monthRecords.push({
          account_id: accId, month_key: mKey,
          paid_expenses: this.state.months?.[key] || {},
          paid_incomes: this.state.monthsIncomes?.[key] || {},
          wallet_transactions: this.state.walletTx?.[key] || {},
          theoretical_expenses: this.state.theoreticalMonths?.[key] || {},
          theoretical_incomes: this.state.theoreticalIncomesMonths?.[key] || {},
          ...updates
        });
      }
      this.syncMonthRecordCaches(accId, mKey, updates);
    },

    // Restauration d'une sauvegarde (format month_records de la V1 ou de la V2)
    async restoreMonthRecords(records) {
      for (const r of records || []) {
        if (!r?.account_id || !r?.month_key) continue;
        await this.upsertMonthRecord(r.account_id, r.month_key, {
          paid_expenses: r.paid_expenses || {},
          paid_incomes: r.paid_incomes || {},
          wallet_transactions: r.wallet_transactions || {},
          theoretical_expenses: r.theoretical_expenses || {},
          theoretical_incomes: r.theoretical_incomes || {}
        });
      }
    },

    // ---------------------------------------------------------------- actions métier communes
    // Écritures « brutes » (lèvent une erreur) : à combiner dans commit() / runVerif().
    paidSide(kind) {
      return (kind === 'income' || kind === 'refund') ? 'income' : 'expense';
    },
    paidMap(side, accId, mKey) {
      const key = accId + '_' + mKey;
      return { ...((side === 'income' ? this.state.monthsIncomes : this.state.months)?.[key] || {}) };
    },
    // entries = { itemId: { amount, ...champs } } ; fusionne avec la validation existante (refund_of, etc.)
    async setPaidMany(side, accId, mKey, entries) {
      const recs = this.paidMap(side, accId, mKey);
      const on = new Date().toISOString();
      let changed = false;
      Object.entries(entries || {}).forEach(([id, fields]) => {
        if (side === 'expense' && recs[id]?.exceptional && !fields.exceptional) return;
        recs[id] = { ...(recs[id] || {}), on, ...fields };
        changed = true;
      });
      if (!changed) return;
      await this.upsertMonthRecord(accId, mKey, side === 'income' ? { paid_incomes: recs } : { paid_expenses: recs });
    },
    async setPaid(kind, id, accId, mKey, amount, fields = {}) {
      if (!accId || id == null) return;
      await this.setPaidMany(this.paidSide(kind), accId, mKey, { [id]: { ...fields, amount: Number(amount) || 0 } });
    },
    async clearPaid(kind, id, accId, mKey, { force = false } = {}) {
      if (!accId || id == null) return;
      const side = this.paidSide(kind);
      const recs = this.paidMap(side, accId, mKey);
      if (!recs[id] || (recs[id].exceptional && !force)) return;
      delete recs[id];
      await this.upsertMonthRecord(accId, mKey, side === 'income' ? { paid_incomes: recs } : { paid_expenses: recs });
    },
    walletList(accId, mKey, walletId) {
      const bucket = this.state.walletTx?.[accId + '_' + mKey] || {};
      return (bucket[walletId] || bucket[String(walletId)] || []).slice();
    },
    // Ajoute un mouvement d'enveloppe ; renvoie null (avec message) si doublon
    async appendWalletTx(accId, mKey, walletId, tx) {
      const list = this.walletList(accId, mKey, walletId);
      if (this.isDuplicateWalletTx(list, tx.description, tx.amount)) {
        toast('Cette transaction existe déjà dans ce portefeuille (même libellé et même montant).');
        return null;
      }
      const row = { id: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now())), ...tx };
      list.push(row);
      const bucket = { ...(this.state.walletTx?.[accId + '_' + mKey] || {}), [walletId]: list };
      await this.upsertMonthRecord(accId, mKey, { wallet_transactions: bucket });
      return row.id;
    },
    async removeWalletTx(accId, mKey, walletId, txId) {
      const list = this.walletList(accId, mKey, walletId).filter(t => t.id !== txId);
      const bucket = { ...(this.state.walletTx?.[accId + '_' + mKey] || {}), [walletId]: list };
      await this.upsertMonthRecord(accId, mKey, { wallet_transactions: bucket });
    },
    async updateWalletTx(accId, mKey, walletId, txId, patch) {
      let found = false;
      const list = this.walletList(accId, mKey, walletId).map(t => {
        if (String(t.id) !== String(txId)) return t;
        found = true;
        return { ...t, ...patch };
      });
      if (!found) throw new Error('Mouvement portefeuille introuvable');
      const bucket = { ...(this.state.walletTx?.[accId + '_' + mKey] || {}), [walletId]: list };
      await this.upsertMonthRecord(accId, mKey, { wallet_transactions: bucket });
    },
    // Action utilisateur : un seul essai/erreur, un seul message, affichage mis à jour depuis le cache local
    async commit(label, fn, okMsg) {
      const res = await withRetry(fn, label);
      if (res === null || res === false) return res;
      if (okMsg) toast(typeof okMsg === 'function' ? okMsg(res) : okMsg);
      this.render();
      return res === undefined ? true : res;
    },

    async ensureProfile() {
      const row = {
        id: this.user.id,
        display_name: this.user.user_metadata?.display_name || (this.user.email || '').split('@')[0] || null
      };
      const { data, error } = await supabaseApp.from('profiles').upsert(row, { onConflict: 'id' }).select('*').maybeSingle();
      if (error) throw error;
      return data || row;
    },

    // Rafraîchit après un changement fait ailleurs (autre appareil / autre membre du compte)
    scheduleRemoteRefresh() {
      clearTimeout(this._remoteRefreshTimer);
      this._remoteRefreshTimer = setTimeout(() => {
        if (Date.now() - (this._localMutAt || 0) < 1500) return;
        this.fetchData();
      }, 800);
    },
});
