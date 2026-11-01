Object.assign(BH, {
    // Palette cyclique pour les camemberts
    chartPalette: ['#3E6B57','#B8793A','#AE4B3C','#B7912F','#5A8A73','#D3A15C','#C97564','#8FA396','#28453A','#E0B96B'],
    // Arc-en-ciel : 1 couleur fixe par mois calendaire (jan→déc)
    monthRainbow: [
      '#E53935', // jan — rouge
      '#FB8C00', // fév — orange
      '#FDD835', // mar — jaune
      '#7CB342', // avr — vert clair
      '#00897B', // mai — turquoise
      '#039BE5', // juin — bleu ciel
      '#3949AB', // juil — indigo
      '#8E24AA', // août — violet
      '#D81B60', // sept — magenta
      '#6D4C41', // oct — brun
      '#546E7A', // nov — bleu-gris
      '#43A047'  // déc — vert
    ],
    monthColor(dateOrMonthIndex) {
      const idx = (dateOrMonthIndex instanceof Date)
        ? dateOrMonthIndex.getMonth()
        : Number(dateOrMonthIndex) || 0;
      return this.monthRainbow[((idx % 12) + 12) % 12];
    },

    // Génère un camembert (donut) SVG + légende à partir d'items [{label, value}]
    pieChart(items, opts) {
      opts = opts || {};
      const size = opts.size || 150;
      const filtered = (items || [])
        .map(it => ({ label: it.label, value: Number(it.value) || 0, color: it.color }))
        .filter(it => it.value > 0)
        .sort((a, b) => b.value - a.value);
      if (!filtered.length) return `<div class="chart-empty">Pas encore de données.</div>`;

      const total = filtered.reduce((s, it) => s + it.value, 0);
      if (!(total > 0)) return `<div class="chart-empty">Pas encore de données.</div>`;

      const r = size / 2, cx = size / 2, cy = size / 2, rInner = r * 0.58;
      const holeFill = '#FFFFFF';
      let angle = -Math.PI / 2;
      let paths = '';
      const legendRows = [];

      // Un seul segment : anneau plein (évite les arcs SVG dégénérés)
      if (filtered.length === 1) {
        const it = filtered[0];
        const color = it.color || this.chartPalette[0];
        paths = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}"></circle>
                 <circle cx="${cx}" cy="${cy}" r="${rInner}" fill="${holeFill}"></circle>`;
        legendRows.push(`<div class="chart-legend-row">
          <span class="chart-legend-swatch" style="background:${color};"></span>
          <span class="chart-legend-label">${this.esc(it.label)}</span>
          <span class="chart-legend-value">${this.fmt(it.value)} · 100%</span>
        </div>`);
      } else {
        filtered.forEach((it, idx) => {
          const color = it.color || this.chartPalette[idx % this.chartPalette.length];
          const frac = it.value / total;
          const a0 = angle;
          const a1 = angle + frac * Math.PI * 2;
          angle = a1;
          const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0);
          const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
          const xi0 = cx + rInner * Math.cos(a0), yi0 = cy + rInner * Math.sin(a0);
          const xi1 = cx + rInner * Math.cos(a1), yi1 = cy + rInner * Math.sin(a1);
          const largeArc = (a1 - a0) > Math.PI ? 1 : 0;
          paths += `<path d="M ${x0} ${y0} A ${r} ${r} 0 ${largeArc} 1 ${x1} ${y1} L ${xi1} ${yi1} A ${rInner} ${rInner} 0 ${largeArc} 0 ${xi0} ${yi0} Z" fill="${color}"></path>`;
          const pct = Math.round(frac * 100);
          legendRows.push(`<div class="chart-legend-row">
            <span class="chart-legend-swatch" style="background:${color};"></span>
            <span class="chart-legend-label">${this.esc(it.label)}</span>
            <span class="chart-legend-value">${this.fmt(it.value)} · ${pct}%</span>
          </div>`);
        });
        // Disque central opaque (évite les variables CSS SVG non supportées sur iOS)
        paths += `<circle cx="${cx}" cy="${cy}" r="${rInner}" fill="${holeFill}"></circle>`;
      }

      const centerLabel = opts.centerLabel != null ? String(opts.centerLabel) : this.fmt(total);
      const centerSub = opts.centerSub || '';

      return `<div class="chart-wrap">
        <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img">
          ${paths}
          <text x="${cx}" y="${cy - (centerSub ? 6 : 0)}" text-anchor="middle" font-size="${Math.round(size * 0.095)}" class="chart-center-label">${this.esc(centerLabel)}</text>
          ${centerSub ? `<text x="${cx}" y="${cy + 12}" text-anchor="middle" font-size="9" class="chart-center-sub">${this.esc(centerSub)}</text>` : ''}
        </svg>
        <div class="chart-legend">${legendRows.join('')}</div>
      </div>`;
    },

    toggleBilanMetric(id) {
      if (!this.bilanMetricOpen) this.bilanMetricOpen = {};
      this.bilanMetricOpen[id] = !this.bilanMetricOpen[id];
      const open = !!this.bilanMetricOpen[id];
      const body = document.getElementById('bilan-metric-body-' + id);
      const arrow = document.getElementById('bilan-metric-arrow-' + id);
      if (body) body.style.display = open ? 'block' : 'none';
      if (arrow) arrow.textContent = open ? '▾' : '▸';
    },

    // Filtres stats : comparaison / bilan (partagés) + répartition (indépendants)
    statsFilters: { acc: '', mode: 'effective', range: '1', excludeCurrent: false },
    pieFilters: { month: '', mode: 'effective', acc: '' },
    _statsFilterOpen: null,

    getStatsFilters() {
      const f = this.statsFilters || {};
      return {
        acc: f.acc || '',
        mode: f.mode === 'theorique' ? 'theorique' : 'effective',
        range: ['1', '2', '5', '11'].includes(String(f.range)) ? String(f.range) : '1',
        excludeCurrent: !!f.excludeCurrent
      };
    },

    getPieFilters() {
      const f = this.pieFilters || {};
      const curKey = this.monthKey(new Date());
      const month = f.month || curKey;
      return {
        month,
        mode: f.mode === 'theorique' ? 'theorique' : 'effective',
        acc: f.acc || ''
      };
    },

    last12MonthOptions() {
      const opts = [];
      const now = new Date();
      for (let i = 0; i < 12; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = this.monthKey(d);
        const label = d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
        opts.push({ key, label: label.charAt(0).toUpperCase() + label.slice(1), date: d });
      }
      return opts;
    },

    setStatsFilter(key, value) {
      if (!this.statsFilters) this.statsFilters = { acc: '', mode: 'effective', range: '1', excludeCurrent: false };
      if (key === 'excludeCurrent') this.statsFilters.excludeCurrent = !!value;
      else this.statsFilters[key] = value;
      this.bilanExcludeCurrent = !!this.statsFilters.excludeCurrent;
      this.renderCategoryStats();
    },

    setPieFilter(key, value) {
      if (!this.pieFilters) this.pieFilters = { month: '', mode: 'effective', acc: '' };
      this.pieFilters[key] = value;
      this.renderCategoryStats();
    },

    toggleStatsFilter(which) {
      const panels = ['pie', 'compare', 'bilan'];
      const next = this._statsFilterOpen === which ? null : which;
      this._statsFilterOpen = next;
      panels.forEach(id => {
        const panel = document.getElementById('stats-filter-' + id);
        const btn = document.getElementById('stats-filter-btn-' + id);
        const open = next === id;
        if (panel) panel.classList.toggle('open', open);
        if (btn) {
          btn.classList.toggle('open', open);
          btn.setAttribute('aria-expanded', open ? 'true' : 'false');
        }
      });
    },

    closeStatsFilters() {
      if (!this._statsFilterOpen) return;
      this._statsFilterOpen = null;
      ['pie', 'compare', 'bilan'].forEach(id => {
        const panel = document.getElementById('stats-filter-' + id);
        const btn = document.getElementById('stats-filter-btn-' + id);
        if (panel) panel.classList.remove('open');
        if (btn) {
          btn.classList.remove('open');
          btn.setAttribute('aria-expanded', 'false');
        }
      });
    },

    syncStatsFilterControls() {
      const f = this.getStatsFilters();
      const pf = this.getPieFilters();
      const accHtml = '<option value="">Tous les comptes</option>' +
        (this.state.accounts || []).map(a => `<option value="${a.id}">${this.esc(a.name)}</option>`).join('');

      // Répartition : mois (12) + mode + compte
      const monthSel = document.getElementById('stat-pie-month');
      if (monthSel) {
        const months = this.last12MonthOptions();
        monthSel.innerHTML = months.map(m =>
          `<option value="${m.key}">${this.esc(m.label)}</option>`
        ).join('');
        const valid = months.some(m => m.key === pf.month);
        monthSel.value = valid ? pf.month : months[0].key;
        if (!this.pieFilters) this.pieFilters = {};
        this.pieFilters.month = monthSel.value;
      }
      const pieMode = document.getElementById('stat-pie-mode');
      if (pieMode) pieMode.value = pf.mode;
      const pieAcc = document.getElementById('stat-pie-acc');
      if (pieAcc) {
        pieAcc.innerHTML = accHtml;
        pieAcc.value = (this.state.accounts || []).some(a => a.id === pf.acc) ? pf.acc : '';
        if (pieAcc.value !== pf.acc) {
          if (!this.pieFilters) this.pieFilters = {};
          this.pieFilters.acc = pieAcc.value;
        }
      }

      // Comparaison / bilan (partagés)
      ['compare', 'bilan'].forEach(id => {
        const acc = document.getElementById('stat-cat-acc-' + id);
        if (acc) {
          acc.innerHTML = accHtml;
          acc.value = (this.state.accounts || []).some(a => a.id === f.acc) ? f.acc : '';
          if (acc.value !== f.acc) this.statsFilters.acc = acc.value;
        }
        const mode = document.getElementById('stat-cat-mode-' + id);
        if (mode) mode.value = f.mode;
        const range = document.getElementById('stat-cat-range-' + id);
        if (range) range.value = f.range;
      });
      const exC = document.getElementById('stat-exclude-cur-compare');
      const exB = document.getElementById('stat-exclude-cur-bilan');
      if (exC) exC.checked = f.excludeCurrent;
      if (exB) exB.checked = f.excludeCurrent;
    },

    toggleBilanExcludeCurrent() {
      this.setStatsFilter('excludeCurrent', !this.getStatsFilters().excludeCurrent);
    },

    showBilanMonthInfo(mKey) {
      const r = (this._bilanRows || []).find(x => x.key === mKey);
      if (!r) return;
      const isEff = r.mode === 'effective';
      const planned = (r.apportsSortants || 0) + (r.apportsSortantsEpargne || 0);
      let rows = `
        <div class="bh-info-row"><span>Revenus totaux</span><span class="num">${this.fmt(r.revenus)}</span></div>
        <div class="bh-info-row"><span>Revenus directs</span><span class="num">${this.fmt(r.revenusDirects)}</span></div>
        ${r.apports > 0 ? `<div class="bh-info-row"><span>Apports reçus</span><span class="num">${this.fmt(r.apports)}</span></div>` : ''}
        <div class="bh-info-row"><span>Dépenses${isEff ? ' validées' : ''} (hors épargne)</span><span class="num">${this.fmt(r.depenses)}</span></div>
        <div class="bh-info-row"><span>Déjà épargné (déduit des dépenses)</span><span class="num">${this.fmt(r.epargne)}</span></div>
        ${isEff && planned > 0 ? `<div class="bh-info-row"><span>Apports restants prévus</span><span class="num">${this.fmt(planned)}</span></div>` : ''}
        <div class="bh-info-row"><span>Capacité d'épargne (= revenus − dépenses)</span><span class="num">${this.fmt(r.capacite)}</span></div>`;
      if (r.epargne > 0) {
        const dispo = Math.max(0, r.capacite - r.epargne);
        rows += `<div class="bh-info-row"><span>dont reste disponible</span><span class="num">${this.fmt(dispo)}</span></div>`;
      }
      if (r.isGlobal) {
        rows += `<div style="font-size:11.5px;color:var(--ink-faint);margin-top:12px;line-height:1.45;">Vue tous comptes : somme des revenus et dépenses de chaque compte. Les apports entre comptes ne sont pas ajoutés (évite le double comptage).</div>`;
      } else       if (r.lookingAtMain) {
        rows += `<div style="font-size:11.5px;color:var(--ink-faint);margin-top:12px;line-height:1.45;">Vue capacité perso : compte principal${isEff ? ' + part déjà consommée sur les comptes partagés' : ' + apports versés aux autres comptes'}.</div>`;
        if ((r.avancesCarte || 0) > 0) {
          rows += `<div style="font-size:11.5px;color:var(--ink-faint);margin-top:8px;line-height:1.45;">Dont avancé par carte : ${this.fmt(r.avancesCarte)} (dépense du compte général) et reste à virer : ${this.fmt(r.apportAVirer || 0)}.</div>`;
        }
      }
      if (r.overflow > 0) {
        rows += `<div class="bh-info-row"><span>Dépassement</span><span class="num">${this.fmt(r.overflow)}</span></div>`;
      }
      const longLbl = r.date
        ? r.date.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
        : r.label;
      this.openInfo(`Bilan — ${longLbl}`, rows);
    },
    renderStats() {
       // Capacité d'épargne = reste théorique du compte principal (revenus - toutes dépenses - tous apports)
       //                       + montants déjà mis en épargne, identifiés dans les saisies par la catégorie "Épargne" (compte principal uniquement, cohérent avec les dépenses déduites ci-dessus)
       const epargneStatAccId = this.state.profile?.main_account_id;
       if (epargneStatAccId) {
          const mainAcc = this.state.accounts.find(a => a.id === epargneStatAccId);
          const mainInc = this.state.incomes.filter(i => i.account_id === epargneStatAccId).reduce((s,i)=>s+Number(i.amount),0);
          const mainExpAll = this.state.expenses.filter(e => e.account_id === epargneStatAccId && this.isExpenseActive(e)).reduce((s,e)=>s+Number(e.amount),0);
          const contribsAll = this.outboundContributionsBreakdown(epargneStatAccId).total;
          const walletApportsOut = this.outboundWalletApports(epargneStatAccId, this.monthKey(new Date()));
          const epargneCategorisee = this.state.expenses
             .filter(e => e.account_id === epargneStatAccId && this.isExpenseActive(e) && /(é|e)pargne/i.test(e.category || ''))
             .reduce((s,e)=>s+Number(e.amount),0);
          const capaciteEpargne = mainInc - mainExpAll - contribsAll - walletApportsOut + epargneCategorisee;
          document.getElementById('stat-epargne').textContent = this.fmt(capaciteEpargne);
          const tauxEpargne = mainInc > 0 ? (capaciteEpargne / mainInc) * 100 : null;
          document.getElementById('stat-epargne-rate').textContent = tauxEpargne !== null
             ? `Taux d'épargne : ${tauxEpargne.toFixed(1)} % du revenu`
             : "Taux d'épargne : — (revenus du compte principal non renseignés)";
          this.epargneInfo = {
             mainAccName: mainAcc ? mainAcc.name : '—',
             mainInc, mainExpAll, contribsAll, walletApportsOut, epargneCategorisee, capaciteEpargne, tauxEpargne
          };
       } else {
          document.getElementById('stat-epargne').textContent = '—';
          document.getElementById('stat-epargne-rate').textContent = "Taux d'épargne : —";
          this.epargneInfo = null;
       }

       // Camembert : répartition de mon salaire vers mes comptes partagés
       const mainAccId = this.state.profile?.main_account_id;
       const salaryItems = [];
       this.state.accounts.forEach(acc => {
          if (acc.id === mainAccId) return;
          const mems = this.state.members.filter(m => m.account_id === acc.id);
          const myMem = mems.find(m => m.user_id === this.user.id);
          if (!myMem) return;
          const exps = this.state.expenses.filter(e => e.account_id === acc.id && this.isExpenseActive(e));
          const tExp = exps.reduce((s,e)=>s+Number(e.amount),0);
          const accTInc = this.state.incomes.filter(i => i.account_id === acc.id).reduce((s,i)=>s+Number(i.amount),0);
          const netExp = Math.max(0, tExp - accTInc);
          const mode = myMem.contribution_mode || 'fixed';
          let amt = 0;
          if (mode === 'prorata') {
             amt = (this.computeFairShares(acc, mems, tExp, accTInc))[this.user.id] || 0;
          } else if (mode === 'percent') {
             amt = netExp * (Number(myMem.contribution_target)||0) / 100;
          } else {
             amt = Number(myMem.contribution_target) || 0;
          }
          if (amt > 0) {
             const plan = this.splitApportForAdvances(acc.id, this.monthKey(new Date()), amt);
             if (plan.transfer > 0) salaryItems.push({ label: acc.name + ' · à virer', value: plan.transfer });
             if (plan.advances > 0) salaryItems.push({ label: acc.name + ' · carte', value: plan.advances });
          }
       });
       document.getElementById('chart-salary-split').innerHTML = salaryItems.length
          ? this.pieChart(salaryItems, { centerSub: 'Apports / mois' })
          : `<div class="chart-empty">Aucun apport configuré vers un compte partagé. Réglez vos apports dans l'onglet Comptes.</div>`;

       this.renderCategoryStats();
    },

    // Dépense active sur un mois donné (end_date avant le mois → inactive)
    isActiveInMonth(exp, mKey) {
       if (!exp?.end_date) return true;
       return exp.end_date.slice(0, 7) >= mKey;
    },

    // Soft-flag portefeuille / dépense (active !== false). Défaut true si colonne absente.
    isExpenseActive(exp) {
      return !exp || exp.active !== false;
    },

    // Enveloppe utilisable pour de nouvelles saisies
    isWalletUsable(exp) {
      return !!(exp && exp.is_wallet && this.isExpenseActive(exp));
    },

    // Visible dans AJD : actif, ou désactivé en lecture seule sur un mois passé (historique)
    isWalletVisibleInMonth(exp, mKey) {
      if (!exp?.is_wallet || !this.isActiveInMonth(exp, mKey)) return false;
      if (this.isExpenseActive(exp)) return true;
      return mKey < this.monthKey(new Date());
    },

    // Montant effectif d'une dépense sur un mois (validé, ou txs portefeuille hors apports externes)
    effectiveExpenseAmount(exp, mKey) {
       if (!exp) return 0;
       if (exp.is_wallet) return this.walletOwnSpent(exp.account_id, exp.id, mKey);
       const paid = this.state.months[exp.account_id + '_' + mKey]?.[exp.id];
       if (paid) return Number(paid.amount || 0);
       if (this.isMyCardAdvance(exp)) {
          const mainId = this.state.profile?.main_account_id;
          const onMain = this.state.months[mainId + '_' + mKey]?.[exp.id];
          if (onMain) return Number(onMain.amount || 0);
       }
       return 0;
    },

    // Montant d'une dépense pour les stats (théorique = budget / snapshot ; effectif = validé / txs portefeuille)
    expenseAmountForStats(exp, mKey, mode) {
       if (!exp) return 0;
       if (mode === 'theorique') {
          const curKey = this.monthKey(new Date());
          // Mois passé : préférer le snapshot figé (budget réel de l'époque)
          if (mKey !== curKey) {
             const snap = this.state.theoreticalMonths?.[exp.account_id + '_' + mKey];
             if (snap && Object.keys(snap).length) {
                const row = snap[exp.id];
                return row ? (Number(row.amount) || 0) : 0;
             }
          }
          return Number(exp.amount) || 0;
       }
       // Effectif portefeuille : uniquement l'argent sorti de CE compte
       if (exp.is_wallet) return this.walletOwnSpent(exp.account_id, exp.id, mKey);
       return this.effectiveExpenseAmount(exp, mKey);
    },

    effectiveIncomeAmount(inc, mKey) {
       if (!inc) return 0;
       const paid = this.state.monthsIncomes?.[inc.account_id + '_' + mKey]?.[inc.id];
       return paid ? Number(paid.amount || 0) : 0;
    },

    isEpargneExpense(exp) {
       return !!(exp && /(é|e)pargne/i.test(exp.category || ''));
    },

    // Totaux par catégorie pour un mois (inclut les portefeuilles)
    categoryTotalsForMonth(mKey, { accFilter = '', mode = 'effective' } = {}) {
       // Théorique + mois passé : snapshot figé uniquement (pas de rejeu du budget actuel)
       if (mode === 'theorique') {
          const curKey = this.monthKey(new Date());
          if (mKey !== curKey) {
             return this.categoryTotalsFromTheoreticalSnapshots(mKey, accFilter) || {};
          }
       }
       const totals = {};
       this.state.expenses.forEach(exp => {
          if (accFilter && exp.account_id !== accFilter) return;
          if (!this.isActiveInMonth(exp, mKey)) return;
          // Théorique courant : hors désactivés. Effectif : enveloppes désactivées gardent leur dépensé.
          if (!this.isExpenseActive(exp)) {
             if (mode !== 'effective' || !exp.is_wallet) return;
          }
          const amt = this.expenseAmountForStats(exp, mKey, mode);
          if (amt <= 0) return;
          const cat = exp.category || 'Autre';
          totals[cat] = (totals[cat] || 0) + amt;
       });
       // Carte perso : le débit est sur le compte général, la dépense reste rattachée au compte partagé.
       const mainId = this.state.profile?.main_account_id;
       if (accFilter && accFilter === mainId) {
          this.state.expenses.forEach(exp => {
             if (!this.isMyCardAdvance(exp) || !this.isActiveInMonth(exp, mKey)) return;
             if (!this.isExpenseActive(exp)) return;
             const amt = this.expenseAmountForStats(exp, mKey, mode);
             if (amt <= 0) return;
             const cat = exp.category || 'Autre';
             totals[cat] = (totals[cat] || 0) + amt;
          });
       }
       // Effectif : dépenses exceptionnelles (hors budget récurrent) du mois
       if (mode === 'effective') {
          this.listExceptionalExpenses(accFilter || null, mKey).forEach(exc => {
             const amt = Number(exc.amount) || 0;
             if (amt <= 0) return;
             const cat = exc.category || 'Autre';
             totals[cat] = (totals[cat] || 0) + amt;
          });
       }
       return totals;
    },

    sumCategoryTotals(totals) {
       return Object.values(totals).reduce((s, v) => s + Number(v), 0);
    },

    // Apports entrants sur un compte partagé (= financement si pas / peu de revenus directs)
    inboundContributions(accId) {
       const acc = this.state.accounts.find(a => a.id === accId);
       if (!acc) return 0;
       const mainId = this.state.profile?.main_account_id;
       if (accId === mainId) return 0;
       const mems = this.state.members.filter(m => m.account_id === accId);
       if (!mems.length) return 0;
       const tExp = this.state.expenses.filter(e => e.account_id === accId && this.isExpenseActive(e)).reduce((s,e)=>s+Number(e.amount),0);
       const tInc = this.state.incomes.filter(i => i.account_id === accId).reduce((s,i)=>s+Number(i.amount),0);
       const shares = this.computeFairShares(acc, mems, tExp, tInc);
       return Object.values(shares).reduce((a,b)=>a+Number(b||0),0);
    },

    // Liste des mois [actuel, actuel-1, ... actuel-offset]
    monthKeysBack(offset) {
       const now = new Date();
       const keys = [];
       for (let i = 0; i <= offset; i++) {
          const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
          keys.push({ key: this.monthKey(d), date: d });
       }
       return keys; // index 0 = mois courant
    },

    // Agrégats revenus / dépenses / épargne pour un mois (filtre + mode)
    // - Sans filtre (« Tous les comptes ») : agrégat global de tous les comptes
    //   (sans apports, pour ne pas double-compter les virements internes)
    // - Filtre compte principal : vision capacité perso (+ apports sortants)
    // - Filtre autre compte : dépenses du compte + apports reçus comme financement
    monthIncomeExpenseBreakdown(mKey, { accFilter = '', mode = 'effective' } = {}) {
       const mainId = this.state.profile?.main_account_id;
       const isGlobal = !accFilter;
       const focusIds = isGlobal
          ? this.state.accounts.map(a => a.id)
          : [accFilter];
       const lookingAtMain = !isGlobal && accFilter === mainId;

       let revenusDirects = 0, apports = 0, depenses = 0, epargne = 0;
       let apportsSortants = 0, apportsSortantsEpargne = 0;

       const curKey = this.monthKey(new Date());

       focusIds.forEach(accId => {
          if (mode === 'theorique') {
             const snapInc = (mKey !== curKey)
               ? this.state.theoreticalIncomesMonths?.[accId + '_' + mKey]
               : null;
             if (snapInc && Object.keys(snapInc).length) {
                Object.values(snapInc).forEach(row => {
                   const amt = Number(row.amount) || 0;
                   if (amt > 0) revenusDirects += amt;
                });
             } else {
                this.state.incomes.forEach(inc => {
                   if (inc.account_id !== accId) return;
                   const amt = Number(inc.amount) || 0;
                   if (amt > 0) revenusDirects += amt;
                });
             }
          } else {
             this.state.incomes.forEach(inc => {
                if (inc.account_id !== accId) return;
                const amt = this.effectiveIncomeAmount(inc, mKey);
                if (amt > 0) revenusDirects += amt;
             });
          }

          // Apports reçus : seulement en vue compte partagé filtré (pas en agrégat global)
          if (!isGlobal && accId !== mainId) {
             apports += this.inboundContributions(accId);
          }

          const snap = this.state.theoreticalMonths?.[accId + '_' + mKey];
          if (mode === 'theorique' && mKey !== curKey) {
             if (snap && Object.keys(snap).length) {
                Object.values(snap).forEach(row => {
                   const amt = Number(row.amount) || 0;
                   if (amt <= 0) return;
                   if (/(é|e)pargne/i.test(row.category || '')) epargne += amt;
                   else depenses += amt;
                });
             }
          } else {
             this.state.expenses.forEach(exp => {
                if (exp.account_id !== accId) return;
                if (!this.isActiveInMonth(exp, mKey)) return;
                if (!this.isExpenseActive(exp)) {
                   if (mode !== 'effective' || !exp.is_wallet) return;
                }
                const amt = this.expenseAmountForStats(exp, mKey, mode);
                if (amt <= 0) return;
                if (this.isEpargneExpense(exp)) epargne += amt;
                else depenses += amt;
             });
             // Effectif : dépenses exceptionnelles du mois (hors cadre budgétisé)
             if (mode === 'effective') {
                this.listExceptionalExpenses(accId, mKey).forEach(exc => {
                   const amt = Number(exc.amount) || 0;
                   if (amt <= 0) return;
                   if (/(é|e)pargne/i.test(exc.category || '')) epargne += amt;
                   else depenses += amt;
                });
             }
          }

          // Apports de ce compte vers des portefeuilles d'autres comptes
          // (stockés chez le destinataire : à compter côté source pour ne pas les perdre)
          const wOut = this.outboundWalletApports(accId, mKey);
          if (wOut > 0) depenses += wOut;
       });

       // Apports sortants : vision perso (compte principal filtré uniquement)
       // En agrégat global ils seraient en double avec les dépenses des comptes financés
       if (lookingAtMain && mainId) {
          const effOrTheo = this.outboundContributionsBreakdown(mainId, { mKey, mode });
          if (mode === 'theorique') {
             apportsSortants = effOrTheo.nonSavings;
             apportsSortantsEpargne = effOrTheo.savings;
             depenses += effOrTheo.nonSavings;
             epargne += effOrTheo.savings;
          } else {
             // Effectif : compter la part déjà « consommée » via les validations des autres comptes
             depenses += effOrTheo.nonSavings;
             epargne += effOrTheo.savings;
             // Reste prévu = théorique plein mois − déjà compté
             const theoFull = this.outboundContributionsBreakdown(mainId, { mode: 'theorique' });
             apportsSortants = Math.max(0, theoFull.nonSavings - effOrTheo.nonSavings);
             apportsSortantsEpargne = Math.max(0, theoFull.savings - effOrTheo.savings);
          }
       }

       const revenus = revenusDirects + apports;
       // Capacité = revenus − dépenses courantes : le déjà épargné est sorti des dépenses
       // (il ne réduit pas la capacité, c’est de l’épargne déjà réalisée)
       const capacite = Math.max(0, revenus - depenses);
       const overflow = Math.max(0, depenses - revenus);
       let avancesCarte = 0, apportAVirer = 0;
       if (lookingAtMain && mainId) {
          const split = this.outboundContributionsBreakdown(mainId, { mKey, mode });
          avancesCarte = split.avancesCarte || 0;
          apportAVirer = split.apportAVirer || 0;
       }
       return {
          revenus, revenusDirects, apports, depenses, epargne, capacite, reste: capacite, overflow,
          apportsSortants, apportsSortantsEpargne, avancesCarte, apportAVirer, mode, isGlobal, lookingAtMain
       };
    },

    renderCategoryStats() {
       const now = new Date();
       const curKey = this.monthKey(now);
       const monthLabel = (d) => d.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });

       this.syncStatsFilterControls();
       const f = this.getStatsFilters();
       const pf = this.getPieFilters();
       const mode = f.mode;
       const offset = Math.max(1, Number(f.range) || 1);
       const accFilter = f.acc;
       const excludeCur = !!f.excludeCurrent;
       const opts = { accFilter, mode };

       // 1. Camembert — filtres propres (mois / mode / compte)
       const pieOpts = { accFilter: pf.acc, mode: pf.mode };
       const pieModeLabel = pf.mode === 'theorique' ? 'théoriques' : 'effectives';
       const centerSub = pf.mode === 'theorique' ? 'Budget' : 'Dépensé';
       const pieMonthLbl = (() => {
          const [y, m] = pf.month.split('-').map(Number);
          const d = new Date(y, (m || 1) - 1, 1);
          return d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
       })();
       const cur = this.categoryTotalsForMonth(pf.month, pieOpts);
       const pieEl = document.getElementById('chart-categories');
       const catItems = Object.entries(cur)
          .map(([label, value]) => ({ label, value: Number(value) || 0 }))
          .filter(it => it.value > 0);
       const pieTitle = document.querySelector('#stats-filter-pie')?.closest('.bh-card')?.querySelector('.chart-title');
       if (pieTitle) {
          const nice = pieMonthLbl.charAt(0).toUpperCase() + pieMonthLbl.slice(1);
          pieTitle.textContent = `Répartition — ${nice}`;
       }
       pieEl.innerHTML = catItems.length
          ? this.pieChart(catItems, { centerSub })
          : `<div class="chart-empty">Aucune dépense ${pieModeLabel} en ${this.esc(pieMonthLbl)}${pf.acc ? ' pour ce compte' : ''}.</div>`;

       const histBlock = document.getElementById('stat-history-block');
       if (histBlock) histBlock.style.display = '';

       const modeLabel = mode === 'theorique' ? 'théoriques' : 'effectives';

       // Du plus ancien au plus récent, couleur arc-en-ciel selon le mois calendaire
       const monthsAll = this.monthKeysBack(offset).slice().reverse().map((m) => ({
          ...m,
          label: monthLabel(m.date),
          color: this.monthColor(m.date),
          totals: this.categoryTotalsForMonth(m.key, opts)
       }));
       const months = (excludeCur && monthsAll.length > 1)
          ? monthsAll.filter(m => m.key !== curKey)
          : monthsAll;
       // Tri des catégories : privilégier le mois de la répartition si c'est le courant, sinon totaux du dernier mois affiché
       const sortRef = this.categoryTotalsForMonth(months.length ? months[months.length - 1].key : curKey, opts);
       const allCats = [...new Set(months.flatMap(m => Object.keys(m.totals)))]
          .sort((a, b) => (sortRef[b] || 0) - (sortRef[a] || 0));

       // 2. Comparaison multi-mois : schéma en grille (comme le bilan) par catégorie
       const compEl = document.getElementById('stat-comparison');
       const theoPastEmpty = mode === 'theorique' && months.filter(m => m.key !== curKey).every(m => !this.hasTheoreticalSnapshot(m.key, accFilter));
       if (allCats.length === 0) {
          compEl.innerHTML = `<div style="font-size:12px;color:var(--ink-faint);">Pas assez de données ${modeLabel} pour comparer.${mode === 'theorique' ? ' L’historique se construit au fil des mois.' : ''}</div>`;
       } else if (theoPastEmpty && months.every(m => m.key === curKey)) {
          compEl.innerHTML = `<div style="font-size:12px;color:var(--ink-faint);">Historique théorique en cours de constitution — les mois passés seront figés automatiquement. Comparaison disponible dès le prochain mois.</div>`;
       } else {
          const oldest = months[0];
          const newest = months[months.length - 1];
          const oldestTotal = this.sumCategoryTotals(oldest.totals);
          const newestTotal = this.sumCategoryTotals(newest.totals);
          let deltaTotalHtml = '';
          if (oldestTotal > 0) {
             const delta = Math.round(((newestTotal - oldestTotal) / oldestTotal) * 100);
             const color = delta > 0 ? 'var(--clay)' : (delta < 0 ? 'var(--sage-deep)' : 'var(--ink-faint)');
             deltaTotalHtml = `<span style="font-weight:700; color:${color};">${delta > 0 ? '+' : ''}${delta}%</span>`;
          } else if (newestTotal > 0) {
             deltaTotalHtml = `<span style="font-weight:700; color:var(--amber);">nouveau</span>`;
          }

          const nCols = months.length;
          const excludeHint = excludeCur && monthsAll.length > months.length
             ? `<div style="font-size:11px;color:var(--ink-faint);margin-bottom:6px;">Mois en cours masqué — % sur ${this.esc(oldest.label)} → ${this.esc(newest.label)}</div>`
             : '';
          let html = `
            ${excludeHint}
            <div class="stack-legend" style="margin-bottom:8px;">
              ${months.map(m => `<span><i style="background:${m.color};"></i>${this.esc(m.label)}</span>`).join('')}
            </div>
            <div style="display:flex; justify-content:flex-end; font-size:10px; color:var(--ink-soft); margin-bottom:8px;">
              <span>${this.fmt(newestTotal)} · ${deltaTotalHtml || '—'} vs ${this.esc(oldest.label)}</span>
            </div>
            <div class="cat-compare-grid">`;

          allCats.forEach(cat => {
             const newestAmt = newest.totals[cat] || 0;
             const oldestAmt = oldest.totals[cat] || 0;
             let deltaLabel, color;
             if (oldestAmt === 0 && newestAmt > 0) { deltaLabel = 'nouveau'; color = 'var(--amber)'; }
             else if (oldestAmt === 0 && newestAmt === 0) { deltaLabel = '—'; color = 'var(--ink-faint)'; }
             else {
                const delta = Math.round(((newestAmt - oldestAmt) / oldestAmt) * 100);
                deltaLabel = (delta > 0 ? '+' : '') + delta + '%';
                color = delta > 0 ? 'var(--clay)' : (delta < 0 ? 'var(--sage-deep)' : 'var(--ink-faint)');
             }
             const maxV = Math.max(...months.map(m => m.totals[cat] || 0), 1);
             const cols = months.map(m => {
                const v = m.totals[cat] || 0;
                const h = Math.round((v / maxV) * 56);
                return `<div class="bilan-compose-col">
                  <div class="bilan-compose-bar short" style="height:56px;">
                    ${v > 0 ? `<span class="tip-seg" tabindex="0" data-tip="${this.esc(m.label)} : ${this.fmt(v)}" style="height:${Math.max(h, 3)}px;background:${m.color};"></span>` : ''}
                  </div>
                </div>`;
             }).join('');

             html += `<div class="cat-compare-card">
                <div class="cat-compare-card-head">
                   <span class="name" title="${this.esc(cat)}">${this.esc(cat)}</span>
                   <span style="font-weight:700; color:${color}; font-size:11px; flex-shrink:0;">${deltaLabel}</span>
                </div>
                <div class="bilan-compose" style="grid-template-columns:repeat(${nCols}, minmax(8px, 1fr)); gap:2px;">${cols}</div>
             </div>`;
          });

          html += `</div>
          <div style="display:flex; justify-content:space-between; font-size:12.5px; font-weight:700; padding-top:12px; gap:8px; flex-wrap:wrap;">
             <span>Total</span>
             <span style="display:flex; flex-wrap:wrap; gap:8px;">
               ${months.map(m => `<span class="num" style="color:${m.color}; font-weight:600;">${this.fmt(this.sumCategoryTotals(m.totals))}</span>`).join('')}
             </span>
          </div>`;
          compEl.innerHTML = html;
       }

       // 3. Bilan revenus / dépenses / épargne (comparaison)
       if (theoPastEmpty && mode === 'theorique' && monthsAll.filter(m => m.key !== curKey).every(m => !this.hasTheoreticalSnapshot(m.key, accFilter))) {
          const el = document.getElementById('chart-savings-stack');
          if (el) el.innerHTML = `<div class="chart-empty">Bilan théorique multi-mois disponible dès qu’au moins un mois passé aura un budget figé.</div>`;
       } else {
          this.renderSavingsStackChart(monthsAll, opts);
       }
    },

    renderSavingsStackChart(months, opts) {
       const el = document.getElementById('chart-savings-stack');
       if (!el) return;
       const shortLbl = (d) => d.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });
       const rows = months.map(m => ({
          key: m.key,
          date: m.date,
          color: m.color,
          label: shortLbl(m.date),
          mode: opts.mode,
          ...this.monthIncomeExpenseBreakdown(m.key, opts)
       }));
       this._bilanRows = rows;

       const hasData = rows.some(r => r.revenus > 0 || r.depenses > 0 || r.epargne > 0);
       if (!hasData) {
          el.innerHTML = `<div class="chart-empty">Pas encore de données sur cette période${opts.mode === 'effective' ? " (validez dépenses et revenus dans Aujourd'hui)" : ''}.</div>`;
          return;
       }

       const mainId = this.state.profile?.main_account_id;
       const mainName = (this.state.accounts.find(a => a.id === mainId) || {}).name || 'compte principal';
       const isEff = opts.mode === 'effective';
       const scopeNote = !opts.accFilter
          ? (isEff
             ? `Tous les comptes — effectif : revenus encaissés et dépenses validées (tous comptes). Les apports internes ne sont pas re-comptés.`
             : `Tous les comptes — théorique : budgets de chaque compte. Les apports internes ne sont pas re-comptés.`)
          : (opts.accFilter === mainId
             ? (isEff
                ? `Capacité perso (${this.esc(mainName)}) — effectif : validés + part des comptes partagés déjà consommée. Reste d’apports prévu indiqué à part.`
                : `Capacité perso (${this.esc(mainName)}) — théorique : budget du compte + apports versés aux autres.`)
             : `Compte filtré : apports configurés = revenus si pas de revenus directs.`);

       const hasApports = rows.some(r => r.apports > 0);
       const hasPlanned = isEff && !!opts.accFilter && opts.accFilter === mainId
          && rows.some(r => ((r.apportsSortants || 0) + (r.apportsSortantsEpargne || 0)) > 0);
       const metrics = [
          { key: 'revenus', label: 'Revenus totaux' },
          { key: 'revenusDirects', label: 'Revenus directs' },
          ...(hasApports ? [{ key: 'apports', label: 'Apports reçus' }] : []),
          { key: 'depenses', label: isEff ? 'Dépenses validées (hors épargne)' : 'Dépenses (hors épargne)' },
          { key: 'epargne', label: isEff ? 'Déjà épargné (validé)' : 'Déjà épargné' },
          ...(hasPlanned ? [{ key: '_planned', label: 'Apports restants prévus', faint: true }] : []),
          { key: 'capacite', label: "Capacité d'épargne", emphasize: true }
       ];

       const valOf = (r, key) => {
          if (key === '_planned') return (r.apportsSortants || 0) + (r.apportsSortantsEpargne || 0);
          return Number(r[key]) || 0;
       };

       const excludeCur = !!this.getStatsFilters().excludeCurrent && rows.length > 1;
       // Mois affichés / utilisés pour les % (sans le mois en cours si option active)
       const viewRows = excludeCur ? rows.slice(0, -1) : rows;
       const curRow = excludeCur ? rows[rows.length - 1] : null;

       // Capacité = revenus − dépenses : l'épargne fait partie de la capacité (barre or + vert)
       const maxStack = Math.max(...viewRows.map(r => Math.max(r.revenus, r.depenses + r.capacite, r.depenses + r.epargne)), 1);
       const nCols = viewRows.length;
       const composeCols = viewRows.map(r => {
          const base = Math.max(r.revenus, r.depenses + r.capacite, 0.01);
          const usedH = Math.round((base / maxStack) * 100);
          const depH = Math.round((r.depenses / base) * usedH);
          const epInCap = Math.min(r.epargne, r.capacite);
          const epH = Math.round((epInCap / base) * usedH);
          const resteH = Math.max(0, Math.round((r.capacite / base) * usedH) - epH);
          return `<div class="bilan-compose-col">
            <div class="bilan-compose-bar">
              ${resteH > 0 ? `<span class="tip-seg" tabindex="0" data-tip="Reste dispo : ${this.fmt(Math.max(0, r.capacite - r.epargne))}" style="height:${resteH}px;background:var(--sage);"></span>` : ''}
              ${epH > 0 ? `<span class="tip-seg" tabindex="0" data-tip="Épargné : ${this.fmt(r.epargne)}" style="height:${epH}px;background:var(--gold);"></span>` : ''}
              ${depH > 0 ? `<span class="tip-seg" tabindex="0" data-tip="Dépenses : ${this.fmt(r.depenses)}" style="height:${depH}px;background:var(--clay);"></span>` : ''}
            </div>
            <div class="bilan-compose-lbl">
              <span class="tip-lbl" tabindex="0" data-tip="Revenus : ${this.fmt(r.revenus)} · Capacité : ${this.fmt(r.capacite)}" style="color:${r.color};">${this.esc(r.label)}</span>
              <button type="button" class="bh-info-btn" title="Détail du mois" onclick="event.stopPropagation(); BH.showBilanMonthInfo('${r.key}')">i</button>
            </div>
          </div>`;
       }).join('');

       if (!this.bilanMetricOpen) this.bilanMetricOpen = {};
       const oldest = viewRows[0], newest = viewRows[viewRows.length - 1];

       const metricRows = metrics.map((met, mi) => {
          const id = 'm' + mi;
          const open = !!this.bilanMetricOpen[id];
          const vals = viewRows.map(r => valOf(r, met.key));
          const maxV = Math.max(...vals, 1);
          const o = valOf(oldest, met.key), n = valOf(newest, met.key);

          let dHtml;
          const goodUp = met.key !== 'depenses' && met.key !== '_planned';
          if (o === 0 && n > 0) dHtml = `<span style="font-weight:700;color:var(--amber);">nouveau</span>`;
          else if (o === 0 && n === 0) dHtml = `<span style="color:var(--ink-faint);">—</span>`;
          else {
             const d = Math.round(((n - o) / o) * 100);
             const col = d === 0 ? 'var(--ink-faint)' : (goodUp
                ? (d > 0 ? 'var(--sage-deep)' : 'var(--clay)')
                : (d > 0 ? 'var(--clay)' : 'var(--sage-deep)'));
             dHtml = `<span style="font-weight:700;color:${col};">${d > 0 ? '+' : ''}${d}%</span>`;
          }

          const amountsHtml = viewRows.map(r =>
             `<span class="num" style="color:${r.color}; font-size:10.5px;${met.faint ? 'opacity:0.7;' : ''}">${this.fmt(valOf(r, met.key))}</span>`
          ).join('');
          const miniCols = viewRows.map(r => {
             const v = valOf(r, met.key);
             const h = Math.round((v / maxV) * 40);
             return `<div class="bilan-compose-col">
               <div class="bilan-compose-bar" style="height:44px;max-width:40px;">
                 ${v > 0 ? `<span class="tip-seg" tabindex="0" data-tip="${this.esc(r.label)} : ${this.fmt(v)}" style="height:${Math.max(h, 2)}px;background:${r.color};${met.faint ? 'opacity:0.55;' : ''}"></span>` : ''}
               </div>
             </div>`;
          }).join('');

          return `<div class="bilan-metric">
            <div class="bilan-metric-head" onclick="BH.toggleBilanMetric('${id}')">
              <span class="bilan-metric-label" style="${met.emphasize ? 'color:var(--sage-deep);' : ''}${met.faint ? 'color:var(--ink-faint);font-weight:500;' : ''}">
                <span class="bilan-metric-arrow" id="bilan-metric-arrow-${id}">${open ? '▾' : '▸'}</span>
                ${this.esc(met.label)}
              </span>
              ${dHtml}
            </div>
            <div class="bilan-metric-body" id="bilan-metric-body-${id}" style="display:${open ? 'block' : 'none'};">
              <div class="bilan-metric-vals">${amountsHtml}</div>
              <div class="bilan-compose" style="grid-template-columns:repeat(${nCols}, minmax(28px, 1fr));">${miniCols}</div>
            </div>
          </div>`;
       }).join('');

       const excludeHint = excludeCur && curRow
          ? `<div style="font-size:11px;color:var(--ink-faint);margin-bottom:6px;">Mois en cours masqué (${this.esc(curRow.label)}) — % calculés sur ${this.esc(oldest.label)} → ${this.esc(newest.label)}</div>`
          : '';

       el.innerHTML = `
         <div class="stack-legend">
           <span><i style="background:var(--clay);"></i>Dépenses</span>
           <span><i style="background:var(--gold);"></i>Épargné (dans la capacité)</span>
           <span><i style="background:var(--sage);"></i>Reste dispo</span>
         </div>
         <div style="font-size:11px; color:var(--ink-soft); margin-bottom:6px;">Composition du revenu — capacité = revenus − dépenses · <strong>i</strong> = détail</div>
         <div class="bilan-compose" style="grid-template-columns:repeat(${nCols}, minmax(40px, 1fr));">${composeCols}</div>
         <div class="bilan-detail-head">
           <span style="font-size:11px; color:var(--ink-soft);">Détail par indicateur · Δ ${this.esc(oldest.label)} → ${this.esc(newest.label)}</span>
         </div>
         ${excludeHint}
         ${metricRows}
         <div style="font-size:11px; color:var(--ink-faint); margin-top:10px;">${scopeNote}</div>`;
    },
});
