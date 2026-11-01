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

    showResteInfo(accId) {
      const info = this.resteInfo && this.resteInfo[accId];
      if (!info) return;
      const dateFr = new Date(info.resteDate + 'T00:00:00').toLocaleDateString('fr-FR');
      let rows;
      if (info.isMain) {
        rows = `
          <div class="bh-info-row"><span>Revenus (compte principal)</span><span class="num">${this.fmt(info.tInc)}</span></div>
          <div class="bh-info-row"><span>− Dépenses à date (jour ≤ ${dateFr})</span><span class="num">${this.fmt(info.expsToDate)}</span></div>
          <div class="bh-info-row"><span>− Apports versés vers les autres comptes</span><span class="num">${this.fmt(info.totalOutboundContributions)}</span></div>
          ${(info.walletApportsOut > 0) ? `<div class="bh-info-row"><span>− Apports vers des portefeuilles</span><span class="num">${this.fmt(info.walletApportsOut)}</span></div>` : ''}
          <div class="bh-info-row"><span>= Reste à date</span><span class="num">${this.fmt(info.resteEnDate)}</span></div>`;
      } else {
        rows = `
          <div class="bh-info-row"><span>Apports reçus (montant plein du mois, tous membres)</span><span class="num">${this.fmt(info.totalApportsRecus)}</span></div>
          <div class="bh-info-row"><span>+ Revenus propres au compte (remboursements, rendement…)</span><span class="num">${this.fmt(info.tInc)}</span></div>
          <div class="bh-info-row"><span>− Dépenses à date (jour ≤ ${dateFr})</span><span class="num">${this.fmt(info.expsToDate)}</span></div>
          ${(info.walletApportsOut > 0) ? `<div class="bh-info-row"><span>− Apports vers des portefeuilles</span><span class="num">${this.fmt(info.walletApportsOut)}</span></div>` : ''}
          <div class="bh-info-row"><span>= Reste à date</span><span class="num">${this.fmt(info.resteEnDate)}</span></div>`;
      }
      rows += `<div style="font-size:11.5px; color:var(--ink-faint); margin-top:12px;">Déjà réglé ce mois-ci (informatif, non inclus dans le calcul ci-dessus) : ${this.fmt(info.paidSum)}${info.hasWallet ? '<br>👛 Les portefeuilles sont inclus : "dépenses à date" et "déjà réglé" ne comptent que les sorties de ce compte (remboursements inclus). Un apport reçu depuis un autre compte crédite l’enveloppe mais est déduit du compte source.' : ''}</div>`;
      this.openInfo(`${info.accName} — détail`, rows);
    },

    showIncomesList(accId) {
      const info = this.acctIncomesList && this.acctIncomesList[accId];
      if (!info || !info.incs.length) {
        this.openInfo('Revenus / Remboursements', `<div style="font-size:13px; color:var(--ink-soft);">Aucun revenu saisi pour ce compte.</div>`);
        return;
      }
      const rows = info.incs.map(i => `
        <div class="bh-info-row">
          <span>${this.esc(i.description || 'Revenu')}</span>
          <span class="num">${this.fmt(Number(i.amount))}</span>
        </div>`).join('');
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
      orderedAccounts.forEach((acc, accIdx) => {
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
        incs.forEach(i => { tInc += Number(i.amount); });
        // Dépenses exceptionnelles : comptées dans le déjà réglé (effectif), pas dans le budget théorique
        const exceptionalPaid = this.exceptionalAmountForAccount(acc.id, mKey);
        paidSum += exceptionalPaid;

        const isMain = acc.id === mainAccId;
        // Apports mensuels validés (dépenses virtuelles jour 1) comptent dans "Déjà réglé"
        if (isMain) {
          this.listOutboundApportDues().forEach(ap => {
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

        // Camembert : catégories de dépenses de ce compte (hors enveloppes désactivées)
        const catTotals = {};
        exps.forEach(e => {
          if (!this.isExpenseActive(e)) return;
          const c = e.category || 'Autre';
          catTotals[c] = (catTotals[c]||0) + Number(e.amount);
        });
        const catItemsAcc = Object.entries(catTotals).map(([label,value])=>({label,value}));
        if (catItemsAcc.length) {
          chartsHtml += `<div style="border-top:1px dashed var(--line); margin-top:12px; padding-top:12px;">
            <div class="chart-title" style="margin-bottom:8px;">Dépenses par catégorie</div>
            ${this.pieChart(catItemsAcc, { size:120, centerSub:'Dépenses' })}
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
                chartsHtml += `<div style="border-top:1px dashed var(--line); margin-top:12px; padding-top:12px;">
                  <div class="chart-title" style="margin-bottom:8px;">Part de chacun</div>
                  ${this.pieChart(shareItems, { size:120, centerSub:'Part / mois' })}
                </div>`;
              }
            }

            // Affichage Compte Partagé avec Apport
            const myMem = mems.find(m => m.user_id === this.user.id);
            if (myMem) {
                const myMode = myMem.contribution_mode || 'fixed';
                const myContrib = Number(myMem.contribution_target) || 0;
                
                // Calcul des avances par le membre courant
                const mesAvances = exps.filter(e => e.payer_id === this.user.id).reduce((s,e)=> s+Number(e.amount), 0);
                const myShares = this.computeFairShares(acc, mems, tExp, tInc);
                const myFairShare = myShares[this.user.id] || 0;
                const resteAVirer = Math.max(0, myFairShare - mesAvances);
                
                contribHtml = `
                <div style="border-top:1px dashed var(--line); margin-top:12px; padding-top:12px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                        <span style="font-size:12px; font-weight:600;">Mon mode de répartition</span>
                        <select style="width:auto; margin:0;" onchange="BH.saveContributionMode('${acc.id}', this.value)">
                          <option value="fixed" ${myMode==='fixed'?'selected':''}>Montant fixe (€)</option>
                          <option value="percent" ${myMode==='percent'?'selected':''}>Pourcentage (%)</option>
                          <option value="prorata" ${myMode==='prorata'?'selected':''}>Prorata des revenus</option>
                        </select>
                    </div>
                    ${myMode === 'prorata' ? `
                      <div style="font-size:12px; color:var(--ink-soft);">Part calculée automatiquement selon les revenus déclarés sur chaque compte principal.</div>
                      <div style="display:flex; justify-content:space-between; font-size:13px; font-weight:600; margin-top:6px;"><span>Ma part ce mois-ci</span><span class="num">${this.fmt(myFairShare)}</span></div>
                    ` : `
                    <div style="display:flex; justify-content:space-between; font-size:12px; font-weight:600;">
                        <span>Mon apport mensuel (Cible)</span>
                        <span class="num">${myMode==='percent' ? myContrib + ' %' : this.fmt(myContrib)}</span>
                    </div>
                    <div class="contrib-input-wrap">
                        <input type="range" min="0" max="${myMode==='percent' ? 100 : Math.round(tExp*1.1)||100}" step="${myMode==='percent'?1:5}" value="${myContrib}" style="flex:1;" 
                               onchange="BH.saveContribution('${acc.id}', this.value)">
                        <input type="number" value="${myContrib}" onchange="BH.saveContribution('${acc.id}', this.value)">
                    </div>`}
                    ${mesAvances > 0 ? `<div style="font-size:11px; color:var(--gold); margin-top:6px; font-weight:600;">J'ai avancé avec ma carte : ${this.fmt(mesAvances)} (Reste à virer : ${this.fmt(resteAVirer)})</div>` : ''}
                </div>`;
            }
        }

        // "Reste en date du" : simulation apports reçus (ou versés, pour le compte principal) - dépenses effectives à date
        const resteDate = this.getResteDate(acc.id);
        const selDay = Number((resteDate.split('-')[2]) || 31);
        const expsToDate = exps.reduce((s,e) => {
          if (e.is_wallet) {
            // Hors apports externes : ils sont déduits du compte source via walletApportsOut
            return s + this.getWalletTx(acc.id, e.id, mKey)
              .filter(t => Number(t.day) <= selDay && !this.isExternalWalletApport(t))
              .reduce((a,t)=>a+(Number(t.amount)||0), 0);
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
          accName: acc.name, isMain, resteDate, paidSum, expsToDate, resteEnDate,
          tInc, totalOutboundContributions, totalApportsRecus, hasWallet, walletApportsOut
        };
        const resteEnDateColor = resteEnDate >= 0 ? 'var(--sage-deep)' : 'var(--clay)';
        const resteEnDateHtml = `<div class="bh-reste-date">
          <div class="bh-reste-date-row">
            <span style="font-size:12px; font-weight:600;">Reste en date du <button class="bh-info-btn" onclick="BH.showResteInfo('${acc.id}')" title="Détail du calcul">?</button></span>
            <input type="date" class="bh-input bh-reste-date-input" value="${resteDate}" onchange="BH.setResteDate('${acc.id}', this.value)">
          </div>
          <div class="bh-mini-metrics bh-mini-metrics-3">
            <div class="bh-mini" style="cursor:pointer;" onclick="BH.showResteInfo('${acc.id}')" title="Voir le détail"><div class="bh-mini-label">Déjà réglé</div><div class="bh-mini-value num">${this.fmt(paidSum)}</div></div>
            <div class="bh-mini" style="cursor:pointer;" onclick="BH.showResteInfo('${acc.id}')" title="Voir le détail"><div class="bh-mini-label">Dépenses à date</div><div class="bh-mini-value num">${this.fmt(expsToDate)}</div></div>
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
          <div class="bh-progress-track"><div class="bh-progress-fill" style="width:${Math.min(100, (paidSum/tExp)*100 || 0)}%"></div></div>
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
      document.getElementById('bh-accounts-list').innerHTML = html || `<div class="bh-empty">Aucun compte</div>`;
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
});
