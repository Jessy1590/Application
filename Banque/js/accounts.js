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

    showIncomesList(accId) {
      const info = this.acctIncomesList && this.acctIncomesList[accId];
      if (!info || !info.incs.length) {
        this.openInfo('Revenus / Remboursements', `<div style="font-size:13px; color:var(--ink-soft);">Aucun revenu saisi pour ce compte.</div>`);
        return;
      }
      const mKey = this.comptesMKey();
      const paid = this.state.monthsIncomes?.[accId + '_' + mKey] || {};
      const rows = info.incs.map(i => {
        const rec = paid[i.id];
        const tag = rec ? ` <span class="bh-detail-meta">encaissé ${this.fmt(Number(rec.amount) || 0)}</span>` : ' <span class="bh-detail-meta">prévu</span>';
        return `
        <div class="bh-info-row">
          <span>${this.esc(i.description || 'Revenu')}${tag}</span>
          <span class="num">${this.fmt(Number(i.amount))}</span>
        </div>`;
      }).join('');
      const total = info.incs.reduce((s,i)=>s+Number(i.amount),0);
      this.openInfo(`${info.accName} — revenus saisis`, rows + `<div class="bh-info-row" style="margin-top:4px;"><span>Total</span><span class="num">${this.fmt(total)}</span></div>`);
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

    // --- "Reste en date du" : simulation par compte ---
    _todayISO() {
      const t = new Date();
      return t.getFullYear() + '-' + String(t.getMonth()+1).padStart(2,'0') + '-' + String(t.getDate()).padStart(2,'0');
    },
    getResteDay(accId, mKey) {
      if (!this.resteDays) this.resteDays = {};
      const key = accId + '_' + mKey;
      if (this.resteDays[key] == null) {
        const now = new Date();
        const [y, mo] = mKey.split('-').map(Number);
        const last = new Date(y, mo, 0).getDate();
        this.resteDays[key] = mKey === this.monthKey(now) ? Math.min(now.getDate(), last) : last;
      }
      return this.resteDays[key];
    },
    setResteDay(accId, mKey, val) {
      const [y, mo] = String(mKey).split('-').map(Number);
      const last = new Date(y, mo, 0).getDate();
      if (!this.resteDays) this.resteDays = {};
      this.resteDays[accId + '_' + mKey] = Math.max(1, Math.min(last, Number(val) || 1));
      this.renderComptes();
    },
    getResteDate(accId) {
      if (!this.resteDates) this.resteDates = {};
      if (!this.resteDates[accId]) this.resteDates[accId] = this._todayISO();
      return this.resteDates[accId];
    },
    setResteDate(accId, val) {
      if (!this.resteDates) this.resteDates = {};
      this.resteDates[accId] = val;
      this.renderComptes();
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
        incs.forEach(i => { tInc += Number(i.amount) || 0; });
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
            const myMem = mems.find(m => m.user_id === this.user.id);
            if (myMem) {
                const mesAvances = exps.filter(e => e.payer_id === this.user.id).reduce((s,e)=> s+Number(e.amount), 0);
                const myFairShare = shares[this.user.id] || 0;
                const resteAVirer = Math.max(0, myFairShare - mesAvances);
                contribHtml = this.apportEditorHtml(acc, myMem, { myFairShare, mesAvances, resteAVirer, tExp });
            }
        }

        const resteDate = this.getResteDate(acc.id);
        const selDay = Number((String(resteDate).split('-')[2]) || 31);
        const expsToDate = exps.reduce((s, e) => {
          if (e.is_wallet) {
            return s + this.getWalletTx(acc.id, e.id, mKey)
              .filter(t => Number(t.day) <= selDay && !this.isExternalWalletApport(t))
              .reduce((a, t) => a + (Number(t.amount) || 0), 0);
          }
          return Number(e.day) <= selDay ? s + Number(e.amount) : s;
        }, 0) + this.exceptionalAmountForAccount(acc.id, mKey, { maxDay: selDay });
        const walletApportsOut = this.outboundWalletApports(acc.id, mKey, selDay);
        let resteEnDate, totalApportsRecus = 0;
        if (isMain) {
          resteEnDate = tInc - expsToDate - totalOutboundContributions - walletApportsOut;
        } else {
          totalApportsRecus = totalAllocated;
          resteEnDate = totalApportsRecus + tInc - expsToDate - walletApportsOut;
        }
        const hasWallet = exps.some(e => e.is_wallet && this.isExpenseActive(e));
        if (!this.resteInfo) this.resteInfo = {};
        this.resteInfo[acc.id] = {
          accName: acc.name, isMain, resteDate, selDay, mKey, paidSum, expsToDate, resteEnDate,
          tInc, totalOutboundContributions, totalApportsRecus, hasWallet, walletApportsOut
        };
        const resteEnDateColor = resteEnDate >= 0 ? 'var(--sage-deep)' : 'var(--clay)';
        const resteEnDateHtml = `<div class="bh-reste-date">
          <div class="bh-reste-date-row">
            <span style="font-size:12px; font-weight:600;">Reste en date du <button type="button" class="bh-info-btn" onclick="BH.showResteInfo('${acc.id}')" title="Détail du calcul">?</button></span>
            <input type="date" class="bh-input bh-reste-date-input" value="${resteDate}" onchange="BH.setResteDate('${acc.id}', this.value)">
          </div>
          <div class="bh-mini-metrics bh-mini-metrics-3">
            <div class="bh-mini" style="cursor:pointer;" onclick="BH.showPaidDetail('${acc.id}')" title="Voir le détail"><div class="bh-mini-label">Déjà réglé</div><div class="bh-mini-value num">${this.fmt(paidSum)}</div></div>
            <div class="bh-mini" style="cursor:pointer;" onclick="BH.showSpentToDate('${acc.id}')" title="Voir le détail"><div class="bh-mini-label">Dépenses à date</div><div class="bh-mini-value num">${this.fmt(expsToDate)}</div></div>
            <div class="bh-mini" style="cursor:pointer;" onclick="BH.showResteInfo('${acc.id}')" title="Voir le détail"><div class="bh-mini-label">Reste à date</div><div class="bh-mini-value num" style="color:${resteEnDateColor};">${this.fmt(resteEnDate)}</div></div>
          </div>
        </div>`;

        // Stocke la liste des dépenses / revenus saisis pour ce compte (popups au clic sur les cartes du haut)
        if (!this.acctExpensesList) this.acctExpensesList = {};
        this.acctExpensesList[acc.id] = { accName: acc.name, exps: exps.slice().sort((a,b)=>Number(a.day)-Number(b.day)) };
        if (!this.acctIncomesList) this.acctIncomesList = {};
        this.acctIncomesList[acc.id] = { accName: acc.name, incs: incs.slice() };
        if (!this.resteTheoInfo) this.resteTheoInfo = {};
        this.resteTheoInfo[acc.id] = {
          accName: acc.name, isMain, tInc, tExp, totalOutboundContributions, totalAllocated, resteTheorique, hasWallet,
          walletApportsOut: walletApportsOutMonth
        };

        html += `<div class="bh-card bh-acct-card">
          <div class="bh-acct-head">
            <div class="bh-acct-head-left">
              <div class="bh-order-btns">
                <button class="bh-order-btn" onclick="BH.moveAccount('${acc.id}', -1)" ${accIdx===0?'disabled':''} title="Monter">▲</button>
                <button class="bh-order-btn" onclick="BH.moveAccount('${acc.id}', 1)" ${accIdx===orderedAccounts.length-1?'disabled':''} title="Descendre">▼</button>
              </div>
              <div class="bh-acct-name">${this.esc(acc.name)} ${isMain ? '⭐' : ''}</div>
            </div>
          </div>
          ${alertHtml}
          <div class="bh-progress-track"><div class="bh-progress-fill" style="width:${Math.min(100, (paidSum / (tExp || 1)) * 100 || 0)}%"></div></div>
          <div class="bh-mini-metrics bh-mini-metrics-3">
            <div class="bh-mini" style="cursor:pointer;" onclick="BH.showExpensesList('${acc.id}')" title="Voir le détail des dépenses"><div class="bh-mini-label">Dépenses</div><div class="bh-mini-value num">${this.fmt(tExp)}</div></div>
            <div class="bh-mini" style="cursor:pointer;" onclick="BH.showIncomesList('${acc.id}')" title="Voir le détail des revenus"><div class="bh-mini-label">Revenus/Remb.</div><div class="bh-mini-value num">${this.fmt(tInc)}</div></div>
            <div class="bh-mini" style="cursor:pointer;" onclick="BH.showResteTheoInfo('${acc.id}')" title="Voir le détail du calcul"><div class="bh-mini-label">Reste théorique</div><div class="bh-mini-value num" style="color:${resteTheorique >= 0 ? 'var(--sage-deep)' : 'var(--clay)'};">${this.fmt(resteTheorique)}</div></div>
          </div>
          ${contribHtml}
          ${resteEnDateHtml}
          ${settleHtml}
          ${chartsHtml}
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
        ${ctx.mesAvances > 0 ? `<div class="bh-apport-note">J'ai avancé avec ma carte : ${this.fmt(ctx.mesAvances)} (reste à virer : ${this.fmt(ctx.resteAVirer)})</div>` : ''}
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
    showPaidDetail(accId) {
      const mKey = this.comptesMKey();
      const acc = (this.state.accounts || []).find(a => a.id === accId);
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
      if (!rows) rows = `<div style="font-size:13px; color:var(--ink-soft);">Rien de payé sur ce mois.</div>`;
      else rows += this.detailLine('<strong>Total déjà payé</strong>', total);
      this.openInfo((acc ? acc.name : 'Compte') + ' — déjà payé', rows);
    },
    showSpentToDate(accId) {
      const mKey = this.comptesMKey();
      const acc = (this.state.accounts || []).find(a => a.id === accId);
      const info = this.resteInfo && this.resteInfo[accId];
      const selDay = (info && info.selDay) || this.getResteDay(accId, mKey);
      const paidMap = this.state.months[accId + '_' + mKey] || {};
      const exps = (this.state.expenses || []).filter(e => e.account_id === accId);
      let total = 0, rows = '';
      exps.forEach(e => {
        if (e.is_wallet) {
          this.getWalletTx(accId, e.id, mKey)
            .filter(t => Number(t.day) <= selDay && !this.isExternalWalletApport(t))
            .forEach(t => {
              const amt = Number(t.amount) || 0;
              total += amt;
              rows += this.detailLine('👛 ' + this.esc(e.description || 'Portefeuille') + ' · ' + this.esc(t.description || 'Mouvement') + (t.day ? (' · le ' + t.day) : ''), amt);
            });
        } else if (this.isExpenseActive(e) && paidMap[e.id] && Number(e.day) <= selDay) {
          const amt = Number(paidMap[e.id].amount) || 0;
          total += amt;
          rows += this.detailLine(this.esc(e.description || 'Dépense') + ' · le ' + e.day, amt);
        }
      });
      this.listExceptionalExpenses(accId, mKey).filter(e => Number(e.day) <= selDay).forEach(e => {
        const amt = Number(e.amount) || 0;
        total += amt;
        rows += this.detailLine(this.esc(e.description || 'Exceptionnel') + ' · exceptionnel', amt);
      });
      if (accId === this.state.profile?.main_account_id && selDay >= 1) {
        this.listOutboundApportDues({ mKey }).forEach(ap => {
          const rec = paidMap[ap.id];
          if (!rec) return;
          const amt = Number(rec.amount) || 0;
          total += amt;
          rows += this.detailLine(this.esc(ap.description || 'Apport'), amt);
        });
      }
      if (!rows) rows = `<div style="font-size:13px; color:var(--ink-soft);">Aucune dépense à cette date.</div>`;
      else rows += this.detailLine('<strong>Total à date</strong>', total);
      this.openInfo((acc ? acc.name : 'Compte') + ' — dépenses à date', rows);
    },
    showResteDetail(accId) {
      const info = this.resteInfo && this.resteInfo[accId];
      if (!info) return;
      const mKey = info.mKey || this.comptesMKey();
      const selDay = info.selDay || 31;
      const paidMap = this.state.months[accId + '_' + mKey] || {};
      const incPaid = this.state.monthsIncomes?.[accId + '_' + mKey] || {};
      let rows = '';
      (this.state.incomes || []).filter(i => i.account_id === accId && incPaid[i.id] && Number(i.day) <= selDay).forEach(i => {
        rows += this.detailLine('+ ' + this.esc(i.description || 'Revenu'), Number(incPaid[i.id].amount) || 0);
      });
      if (!info.isMain && info.totalApportsRecus) rows += this.detailLine('+ Apport validé reçu', info.totalApportsRecus);
      if (info.isMain) {
        this.listOutboundApportDues({ mKey }).forEach(ap => {
          const rec = paidMap[ap.id];
          if (!rec) return;
          rows += this.detailLine('− ' + this.esc(ap.description || 'Apport'), Number(rec.amount) || 0);
        });
      }
      (this.state.expenses || []).filter(e => e.account_id === accId).forEach(e => {
        if (e.is_wallet) {
          this.getWalletTx(accId, e.id, mKey)
            .filter(t => Number(t.day) <= selDay && !this.isExternalWalletApport(t))
            .forEach(t => {
              rows += this.detailLine('− 👛 ' + this.esc(e.description || 'Portefeuille') + ' · ' + this.esc(t.description || 'Mouvement'), Number(t.amount) || 0);
            });
        } else if (this.isExpenseActive(e) && paidMap[e.id] && Number(e.day) <= selDay) {
          rows += this.detailLine('− ' + this.esc(e.description || 'Dépense') + ' · le ' + e.day, Number(paidMap[e.id].amount) || 0);
        }
      });
      this.listExceptionalExpenses(accId, mKey).filter(e => Number(e.day) <= selDay).forEach(e => {
        rows += this.detailLine('− ' + this.esc(e.description || 'Exceptionnel'), Number(e.amount) || 0);
      });
      if (info.walletApportsOut > 0) {
        rows += this.detailLine('− Apports vers des portefeuilles', info.walletApportsOut);
      }
      rows += this.detailLine('<strong>= Reste au jour ' + selDay + '</strong>', info.resteEnDate);
      this.openInfo(info.accName + ' — reste au jour ' + selDay, rows);
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
