Object.assign(BH, {
    // --- EXPORT ---
    csvEscape(v) { const s = String(v==null?'':v); return /[",\n;]/.test(s) ? '"' + s.replace(/"/g,'""') + '"' : s; },

    downloadFile(filename, content, mime) {
       const blob = new Blob([content], { type: mime });
       const url = URL.createObjectURL(blob);
       const a = document.createElement('a');
       a.href = url; a.download = filename;
       document.body.appendChild(a); a.click(); document.body.removeChild(a);
       URL.revokeObjectURL(url);
    },

    walletTxCsvType(t) {
       if (!t) return 'Mouvement portefeuille';
       if (t.kind === 'apport' || t.from_account_id) return 'Apport portefeuille';
       if (t.kind === 'refund' || Number(t.amount) < 0) return 'Remboursement portefeuille';
       return 'Mouvement portefeuille';
    },
    appendWalletTxCsvRows(rows, acc, exp, list, mKey) {
       (list || []).forEach(t => {
          rows.push([
             this.walletTxCsvType(t),
             t.description || '',
             exp?.category || '',
             acc?.name || '',
             t.amount,
             t.day != null ? t.day : '',
             mKey
          ]);
       });
    },
    exportCSV(scope) {
       const rows = [['Type','Description','Catégorie','Compte','Montant (€)','Jour','Mois']];
       const now = new Date();

       if (scope === 'month') {
          const mKey = this.monthKey(now);
          this.state.expenses.forEach(e => {
             const acc = this.state.accounts.find(a=>a.id===e.account_id);
             const type = e.is_wallet ? 'Portefeuille (enveloppe)' : 'Dépense';
             rows.push([type, e.description, e.category||'', acc?.name||'', e.amount, e.day, mKey]);
          });
          this.state.incomes.forEach(i => {
             const acc = this.state.accounts.find(a=>a.id===i.account_id);
             rows.push(['Revenu', i.description, '', acc?.name||'', i.amount, i.day||'', mKey]);
          });
          // Dépenses exceptionnelles (exc_*) du mois
          this.listExceptionalExpenses(null, mKey).forEach(exc => {
             const acc = this.state.accounts.find(a => a.id === exc.account_id);
             rows.push(['Dépense exceptionnelle', exc.description || '', exc.category || '', acc?.name || '', exc.amount, exc.day || '', mKey]);
          });
          // Mouvements portefeuille du mois
          (this.state.expenses || []).filter(e => e.is_wallet).forEach(exp => {
             const acc = this.state.accounts.find(a => a.id === exp.account_id);
             this.appendWalletTxCsvRows(rows, acc, exp, this.getWalletTx(exp.account_id, exp.id, mKey), mKey);
          });
       } else {
          // Année : historique validé (month_records) + exceptionnelles + portefeuilles
          (this.state.monthRecords || []).forEach(rec => {
             const acc = this.state.accounts.find(a=>a.id===rec.account_id);
             Object.entries(rec.paid_expenses || {}).forEach(([expId, p]) => {
                if (this.isExceptionalPaidKey(expId) || p?.exceptional) {
                   rows.push(['Dépense exceptionnelle', p?.description || expId, p?.category || '', acc?.name||'', p.amount, p?.day || '', rec.month_key]);
                   return;
                }
                const exp = this.state.expenses.find(e=>e.id===expId);
                rows.push(['Dépense validée', exp?.description||expId, exp?.category||'', acc?.name||'', p.amount, '', rec.month_key]);
             });
             Object.entries(rec.wallet_transactions || {}).forEach(([expId, raw]) => {
                const list = Array.isArray(raw) ? raw : (raw && Array.isArray(raw.transactions) ? raw.transactions : []);
                if (!list.length) return;
                const exp = this.state.expenses.find(e => e.id === expId || String(e.id) === String(expId));
                this.appendWalletTxCsvRows(rows, acc, exp, list, rec.month_key);
             });
          });
       }

       const csv = rows.map(r => r.map(this.csvEscape).join(';')).join('\n');
       this.downloadFile(`budget_export_${scope}_${this.monthKey(now)}.csv`, '\ufeff' + csv, 'text/csv;charset=utf-8;');
       toast('Export CSV téléchargé');
    },

    monthsBetween(fromKey, toKey) {
       let a = fromKey, b = toKey;
       if (a > b) { const t = a; a = b; b = t; }
       const out = [];
       let [y, m] = a.split('-').map(Number);
       const [y2, m2] = b.split('-').map(Number);
       while (y < y2 || (y === y2 && m <= m2)) {
          const d = new Date(y, m - 1, 1);
          out.push({ key: this.monthKey(d), date: d });
          m += 1;
          if (m > 12) { m = 1; y += 1; }
       }
       return out;
    },
    openExportPDF() {
       const cur = this.monthKey(new Date());
       const fromEl = document.getElementById('pdf-from');
       const toEl = document.getElementById('pdf-to');
       const singleEl = document.getElementById('pdf-month');
       if (singleEl && !singleEl.value) singleEl.value = cur;
       if (toEl && !toEl.value) toEl.value = cur;
       if (fromEl && !fromEl.value) {
          const d = new Date();
          d.setMonth(d.getMonth() - 5);
          fromEl.value = this.monthKey(d);
       }
       const curRadio = document.querySelector('input[name="pdf-period"][value="current"]');
       if (curRadio) curRadio.checked = true;
       this.syncPdfPeriodUi();
       document.getElementById('bh-pdf-overlay')?.classList.add('open');
    },
    closeExportPDF() {
       document.getElementById('bh-pdf-overlay')?.classList.remove('open');
    },
    useInAppReport() {
       const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
       const phone = window.matchMedia('(max-width: 959px)').matches;
       return !!(standalone || phone);
    },
    openReportFrame(html) {
       const overlay = document.getElementById('bh-report-overlay');
       const frame = document.getElementById('bh-report-frame');
       if (!overlay || !frame) { toast('Impossible d’afficher le rapport'); return; }
       if (this._reportUrl) URL.revokeObjectURL(this._reportUrl);
       const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
       this._reportUrl = URL.createObjectURL(blob);
       frame.src = this._reportUrl;
       overlay.classList.add('open');
       document.body.classList.add('bh-report-open');
    },
    closeReportFrame() {
       const overlay = document.getElementById('bh-report-overlay');
       const frame = document.getElementById('bh-report-frame');
       if (overlay) overlay.classList.remove('open');
       if (frame) frame.removeAttribute('src');
       document.body.classList.remove('bh-report-open');
       if (this._reportUrl) {
          URL.revokeObjectURL(this._reportUrl);
          this._reportUrl = null;
       }
    },
    printReportFrame() {
       const frame = document.getElementById('bh-report-frame');
       try {
          frame.contentWindow.focus();
          frame.contentWindow.print();
       } catch (e) {
          toast('Utilise la croix pour revenir à Budget');
       }
    },
    syncPdfPeriodUi() {
       const mode = document.querySelector('input[name="pdf-period"]:checked')?.value || 'current';
       const single = document.getElementById('pdf-month');
       const from = document.getElementById('pdf-from');
       const to = document.getElementById('pdf-to');
       if (single) single.disabled = mode !== 'single';
       if (from) from.disabled = mode !== 'multi';
       if (to) to.disabled = mode !== 'multi';
    },
    confirmExportPDF() {
       const mode = document.querySelector('input[name="pdf-period"]:checked')?.value || 'current';
       const cur = this.monthKey(new Date());
       if (mode === 'current') {
          this.closeExportPDF();
          this.exportPDF({ mode: 'single', mKey: cur });
          return;
       }
       if (mode === 'single') {
          const mKey = document.getElementById('pdf-month')?.value;
          if (!mKey) { toast('Choisis un mois.'); return; }
          this.closeExportPDF();
          this.exportPDF({ mode: 'single', mKey });
          return;
       }
       let fromKey = document.getElementById('pdf-from')?.value;
       let toKey = document.getElementById('pdf-to')?.value;
       if (!fromKey || !toKey) { toast('Indique le début et la fin de la période.'); return; }
       if (fromKey > toKey) { const t = fromKey; fromKey = toKey; toKey = t; }
       const months = this.monthsBetween(fromKey, toKey);
       if (months.length > 24) { toast('Limite : 24 mois maximum.'); return; }
       this.closeExportPDF();
       this.exportPDF({ mode: 'multi', fromKey, toKey, months });
    },
    exportPDF(opts = {}) {
       const now = new Date();
       const mode = opts.mode || 'single';
       const isMulti = mode === 'multi';
       const months = isMulti
          ? (opts.months || this.monthsBetween(opts.fromKey, opts.toKey))
          : null;
       const mKey = isMulti
          ? (months[months.length - 1]?.key || this.monthKey(now))
          : (opts.mKey || this.monthKey(now));
       const [my, mm] = mKey.split('-').map(Number);
       const monthTitle = isMulti
          ? (this.formatMonthKey(opts.fromKey || months[0].key) + ' → ' + this.formatMonthKey(opts.toKey || months[months.length - 1].key))
          : new Date(my, mm - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
       const sage = '#3E6B57', sageDeep = '#28453A', clay = '#AE4B3C', gold = '#B7912F';
       const ink = '#152520', inkSoft = '#5A6B62', line = '#DBE3DD', paper = '#F3F6F3';

       // Agrégats : un mois, ou somme sur la période
       const rangeKeys = isMulti ? months.map(m => m.key) : [mKey];
       const mergeCats = (modeStat) => {
          const acc = {};
          rangeKeys.forEach(k => {
             const cats = this.categoryTotalsForMonth(k, { mode: modeStat });
             Object.entries(cats).forEach(([c, v]) => { acc[c] = (acc[c] || 0) + (Number(v) || 0); });
          });
          return acc;
       };
       const theoCats = mergeCats('theorique');
       const effCats = mergeCats('effective');
       const allCats = [...new Set([...Object.keys(theoCats), ...Object.keys(effCats)])]
          .sort((a, b) => (theoCats[b] || 0) - (theoCats[a] || 0));
       const theoTotal = this.sumCategoryTotals(theoCats);
       const effTotal = this.sumCategoryTotals(effCats);
       const bilan = rangeKeys.reduce((agg, k) => {
          const b = this.monthIncomeExpenseBreakdown(k, { mode: 'effective' });
          agg.revenus += b.revenus;
          agg.revenusDirects += b.revenusDirects;
          agg.apports += b.apports;
          agg.depenses += b.depenses;
          agg.epargne += b.epargne;
          agg.capacite += b.capacite;
          return agg;
       }, { revenus: 0, revenusDirects: 0, apports: 0, depenses: 0, epargne: 0, capacite: 0 });
       const bilanTheo = rangeKeys.reduce((agg, k) => {
          const b = this.monthIncomeExpenseBreakdown(k, { mode: 'theorique' });
          agg.depenses += b.depenses;
          agg.epargne += b.epargne;
          agg.capacite += b.capacite;
          return agg;
       }, { depenses: 0, epargne: 0, capacite: 0 });

       // Barres comparatives catégorie (théorique vs effectif)
       const maxCat = Math.max(...allCats.map(c => Math.max(theoCats[c] || 0, effCats[c] || 0)), 1);
       const catCompareHtml = allCats.length ? allCats.map(cat => {
          const t = theoCats[cat] || 0, e = effCats[cat] || 0;
          const tPct = Math.max(t > 0 ? 2 : 0, (t / maxCat) * 100);
          const ePct = Math.max(e > 0 ? 2 : 0, (e / maxCat) * 100);
          let delta = '—';
          if (t > 0) {
             const d = Math.round(((e - t) / t) * 100);
             delta = (d > 0 ? '+' : '') + d + '%';
          } else if (e > 0) delta = 'nouveau';
          return `<div class="cmp-row">
            <div class="cmp-head"><span class="cmp-name">${this.esc(cat)}</span>
              <span class="cmp-vals"><b style="color:${inkSoft}">${this.fmt(t)}</b> → <b style="color:${sageDeep}">${this.fmt(e)}</b> <em>${delta}</em></span>
            </div>
            <div class="bar-track"><div class="bar-theo" style="width:${tPct}%"></div></div>
            <div class="bar-track"><div class="bar-eff" style="width:${ePct}%"></div></div>
          </div>`;
       }).join('') : '<p class="muted">Aucune catégorie sur la période.</p>';

       // Camemberts (SVG autonomes pour l'impression)
       const pieTheo = this.pieChart(
          Object.entries(theoCats).map(([label, value]) => ({ label, value })),
          { size: 140, centerSub: 'Budget' }
       );
       const pieEff = this.pieChart(
          Object.entries(effCats).map(([label, value]) => ({ label, value })),
          { size: 140, centerSub: 'Dépensé' }
       );

       // Graphiques par compte (dernier mois de la période, ou mois choisi)
       const accountsHtml = this.getOrderedAccounts().map(acc => {
          const theo = this.categoryTotalsForMonth(mKey, { accFilter: acc.id, mode: 'theorique' });
          const eff = this.categoryTotalsForMonth(mKey, { accFilter: acc.id, mode: 'effective' });
          const tTot = this.sumCategoryTotals(theo);
          const eTot = this.sumCategoryTotals(eff);
          if (tTot <= 0 && eTot <= 0) return '';
          const pie = this.pieChart(
             Object.entries(eff).map(([label, value]) => ({ label, value })),
             { size: 110, centerSub: 'Effectif' }
          );
          const cats = [...new Set([...Object.keys(theo), ...Object.keys(eff)])]
             .sort((a, b) => (theo[b] || 0) - (theo[a] || 0));
          const maxA = Math.max(...cats.map(c => Math.max(theo[c] || 0, eff[c] || 0)), 1);
          const rows = cats.map(c => {
             const t = theo[c] || 0, e = eff[c] || 0;
             return `<tr>
               <td>${this.esc(c)}</td>
               <td class="num muted">${this.fmt(t)}</td>
               <td class="num">${this.fmt(e)}</td>
               <td><div class="mini-duo">
                 <span style="width:${(t/maxA)*100}%;background:${inkSoft};opacity:.45"></span>
                 <span style="width:${(e/maxA)*100}%;background:${sage}"></span>
               </div></td>
             </tr>`;
          }).join('');
          return `<section class="card account-card">
            <h3>${this.esc(acc.name)}${isMulti ? ` <span class="muted" style="font-weight:500;font-size:11px;">· ${this.esc(this.formatMonthKey(mKey))}</span>` : ''}</h3>
            <div class="kpi-row">
              <div class="kpi"><span>Théorique</span><strong>${this.fmt(tTot)}</strong></div>
              <div class="kpi accent"><span>Effectif</span><strong>${this.fmt(eTot)}</strong></div>
              <div class="kpi"><span>Écart</span><strong>${this.fmt(eTot - tTot)}</strong></div>
            </div>
            <div class="split">
              <div>${eTot > 0 ? pie : '<p class="muted">Rien de validé</p>'}</div>
              <table class="slim"><thead><tr><th>Catégorie</th><th>Théo.</th><th>Eff.</th><th></th></tr></thead><tbody>${rows}</tbody></table>
            </div>
          </section>`;
       }).join('');

       // Évolution (période choisie, ou 6 mois autour du mois unique)
       const evolMonths = isMulti
          ? months
          : this.monthKeysBack(5).slice().reverse();
       const maxRev = Math.max(...evolMonths.map(m => {
          const b = this.monthIncomeExpenseBreakdown(m.key, { mode: 'effective' });
          return Math.max(b.revenus, b.depenses + b.epargne);
       }), 1);
       const evolHtml = evolMonths.map(m => {
          const b = this.monthIncomeExpenseBreakdown(m.key, { mode: 'effective' });
          const lbl = m.date.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });
          const base = Math.max(b.revenus, b.depenses + b.epargne, 0.01);
          const usedH = Math.round((base / maxRev) * 90);
          const depH = Math.round((b.depenses / base) * usedH);
          const epH = Math.round((b.epargne / base) * usedH);
          const capH = Math.max(0, usedH - depH - epH);
          return `<div class="evol-col">
            <div class="evol-bar">
              ${capH ? `<span style="height:${capH}px;background:${sage}"></span>` : ''}
              ${epH ? `<span style="height:${epH}px;background:${gold}"></span>` : ''}
              ${depH ? `<span style="height:${depH}px;background:${clay}"></span>` : ''}
            </div>
            <div class="evol-lbl">${this.esc(lbl)}</div>
            <div class="evol-amt">${this.fmt(b.revenus)}</div>
          </div>`;
       }).join('');

       const historyTableHtml = isMulti
          ? `<h2>Historique mensuel</h2>
             <div class="card" style="padding:8px 10px;">
               <table>
                 <thead><tr>
                   <th>Mois</th><th style="text-align:right">Revenus</th><th style="text-align:right">Dépenses</th>
                   <th style="text-align:right">Épargné</th><th style="text-align:right">Capacité</th>
                 </tr></thead>
                 <tbody>${months.map(m => {
                    const b = this.monthIncomeExpenseBreakdown(m.key, { mode: 'effective' });
                    return `<tr>
                      <td>${this.esc(this.formatMonthKey(m.key))}</td>
                      <td class="num">${this.fmt(b.revenus)}</td>
                      <td class="num">${this.fmt(b.depenses)}</td>
                      <td class="num">${this.fmt(b.epargne)}</td>
                      <td class="num">${this.fmt(b.capacite)}</td>
                    </tr>`;
                 }).join('')}</tbody>
               </table>
             </div>`
          : '';

       // Apports salaire
       const mainAccId = this.state.profile?.main_account_id;
       const salaryItems = [];
       this.state.accounts.forEach(acc => {
          if (acc.id === mainAccId) return;
          const mems = this.state.members.filter(m => m.account_id === acc.id);
          const myMem = mems.find(m => m.user_id === this.user.id);
          if (!myMem) return;
          const exps = this.state.expenses.filter(e => e.account_id === acc.id);
          const tExp = exps.reduce((s,e)=>s+Number(e.amount),0);
          const accTInc = this.state.incomes.filter(i => i.account_id === acc.id).reduce((s,i)=>s+Number(i.amount),0);
          const netExp = Math.max(0, tExp - accTInc);
          const mode = myMem.contribution_mode || 'fixed';
          let amt = 0;
          if (mode === 'prorata') amt = (this.computeFairShares(acc, mems, tExp, accTInc))[this.user.id] || 0;
          else if (mode === 'percent') amt = netExp * (Number(myMem.contribution_target)||0) / 100;
          else amt = Number(myMem.contribution_target) || 0;
          if (amt > 0) {
             const plan = this.splitApportForAdvances(acc.id, mKey, amt);
             if (plan.transfer > 0) salaryItems.push({ label: acc.name, value: plan.transfer });
          }
       });
       const salaryPie = salaryItems.length
          ? this.pieChart(salaryItems, { size: 130, centerSub: 'Apports' })
          : '<p class="muted">Aucun apport configuré.</p>';

       // Tableau détail dépenses (théo vs eff) — enveloppes + exceptionnelles
       let detailRows = '';
       this.state.expenses.forEach(exp => {
          if (!this.isActiveInMonth(exp, mKey)) return;
          if (!this.isExpenseActive(exp) && !(exp.is_wallet && this.expenseAmountForStats(exp, mKey, 'effective') > 0)) return;
          const acc = this.state.accounts.find(a => a.id === exp.account_id);
          const theo = this.expenseAmountForStats(exp, mKey, 'theorique');
          const eff = this.expenseAmountForStats(exp, mKey, 'effective');
          if (theo <= 0 && eff <= 0) return;
          const pct = theo > 0 ? Math.round((eff / theo) * 100) : (eff > 0 ? '—' : '0');
          detailRows += `<tr>
            <td>${exp.is_wallet ? '👛 ' : ''}${this.esc(exp.description)}</td>
            <td>${this.esc(exp.category || 'Autre')}</td>
            <td>${this.esc(acc?.name || '')}</td>
            <td class="num muted">${this.fmt(theo)}</td>
            <td class="num">${this.fmt(eff)}</td>
            <td class="num">${pct}${typeof pct === 'number' ? ' %' : ''}</td>
          </tr>`;
       });
       // Dépenses exceptionnelles (hors budget récurrent) — effectif uniquement
       this.listExceptionalExpenses(null, mKey).forEach(exc => {
          const acc = this.state.accounts.find(a => a.id === exc.account_id);
          const amt = Number(exc.amount) || 0;
          if (amt <= 0) return;
          detailRows += `<tr>
            <td>⚡ ${this.esc(exc.description || 'Dépense exceptionnelle')}</td>
            <td>${this.esc(exc.category || 'Autre')}</td>
            <td>${this.esc(acc?.name || '')}</td>
            <td class="num muted">—</td>
            <td class="num">${this.fmt(amt)}</td>
            <td class="num">—</td>
          </tr>`;
       });

       // Détail des mouvements portefeuille (liste des txs du mois)
       let walletTxRows = '';
       (this.state.expenses || []).filter(e => e.is_wallet).forEach(exp => {
          if (!this.isActiveInMonth(exp, mKey) && this.walletOwnSpent(exp.account_id, exp.id, mKey) <= 0) return;
          const acc = this.state.accounts.find(a => a.id === exp.account_id);
          this.getWalletTx(exp.account_id, exp.id, mKey).forEach(t => {
             const amt = Number(t.amount) || 0;
             const typeLbl = this.walletTxCsvType(t);
             walletTxRows += `<tr>
               <td>${this.esc(t.description || '')}</td>
               <td>${this.esc(typeLbl)}</td>
               <td>${this.esc(exp.description || '')}</td>
               <td>${this.esc(acc?.name || '')}</td>
               <td class="num">${this.fmt(amt)}</td>
               <td class="num">${t.day != null ? t.day : '—'}</td>
             </tr>`;
          });
       });
       const walletTxSection = walletTxRows
          ? `<h2>Mouvements portefeuille</h2>
             <div class="card" style="padding:8px 10px;">
               <table>
                 <thead><tr><th>Libellé</th><th>Type</th><th>Enveloppe</th><th>Compte</th><th style="text-align:right">Montant</th><th style="text-align:right">Jour</th></tr></thead>
                 <tbody>${walletTxRows}</tbody>
               </table>
             </div>`
          : '';

       const reportHtml = `<!DOCTYPE html><html lang="fr"><head>
         <meta charset="UTF-8">
         <title>Rapport Budget — ${this.esc(monthTitle)}</title>
         <style>
           @page { margin: 14mm; }
           * { box-sizing: border-box; }
           body { margin:0; font-family: Inter, system-ui, sans-serif; color:${ink}; background:#fff; font-size:12px; line-height:1.4; }
           h1 { font-family: 'Space Grotesk', system-ui, sans-serif; font-size:22px; color:${sageDeep}; margin:0 0 4px; }
           h2 { font-family: 'Space Grotesk', system-ui, sans-serif; font-size:15px; color:${sageDeep}; margin:22px 0 10px; border-bottom:2px solid ${line}; padding-bottom:6px; }
           h3 { font-size:13px; margin:0 0 8px; color:${sageDeep}; }
           .sub { color:${inkSoft}; font-size:12px; margin-bottom:16px; }
           .hero { display:grid; grid-template-columns:repeat(4,1fr); gap:10px; margin:14px 0 8px; }
           .hero .box { background:${paper}; border:1px solid ${line}; border-radius:12px; padding:12px; }
           .hero .box span { display:block; font-size:10px; text-transform:uppercase; letter-spacing:.04em; color:${inkSoft}; font-weight:600; }
           .hero .box strong { display:block; font-size:16px; margin-top:4px; font-variant-numeric:tabular-nums; }
           .hero .box.eff strong { color:${sageDeep}; }
           .hero .box.theo strong { color:${inkSoft}; }
           .legend { display:flex; gap:14px; font-size:11px; color:${inkSoft}; margin:8px 0 12px; }
           .legend i { display:inline-block; width:9px; height:9px; border-radius:2px; margin-right:4px; vertical-align:middle; }
           .cmp-row { padding:7px 0; border-bottom:1px solid ${line}; }
           .cmp-head { display:flex; justify-content:space-between; gap:8px; margin-bottom:4px; font-size:12px; }
           .cmp-name { font-weight:600; }
           .cmp-vals { font-variant-numeric:tabular-nums; font-size:11px; }
           .cmp-vals em { font-style:normal; font-weight:700; color:${clay}; margin-left:6px; }
           .bar-track { height:6px; background:${line}; border-radius:3px; overflow:hidden; margin-top:2px; }
           .bar-theo { height:100%; background:${inkSoft}; opacity:.45; border-radius:3px; }
           .bar-eff { height:100%; background:${sage}; border-radius:3px; }
           .charts-2 { display:grid; grid-template-columns:1fr 1fr; gap:16px; align-items:start; }
           .card { background:#fff; border:1px solid ${line}; border-radius:14px; padding:14px; margin-bottom:12px; break-inside:avoid; }
           .kpi-row { display:flex; gap:8px; margin-bottom:10px; }
           .kpi { flex:1; background:${paper}; border-radius:10px; padding:8px; }
           .kpi span { font-size:10px; color:${inkSoft}; text-transform:uppercase; letter-spacing:.03em; }
           .kpi strong { display:block; margin-top:2px; font-size:13px; }
           .kpi.accent strong { color:${sageDeep}; }
           .split { display:grid; grid-template-columns:140px 1fr; gap:12px; align-items:start; }
           table { width:100%; border-collapse:collapse; }
           th, td { padding:5px 6px; border-bottom:1px solid ${line}; text-align:left; font-size:11px; }
           th { color:${inkSoft}; font-weight:600; font-size:10px; text-transform:uppercase; }
           .num { text-align:right; font-variant-numeric:tabular-nums; white-space:nowrap; }
           .muted { color:${inkSoft}; }
           .mini-duo { height:8px; background:${line}; border-radius:4px; overflow:hidden; position:relative; min-width:60px; }
           .mini-duo span { display:block; height:4px; }
           .evol { display:flex; align-items:flex-end; gap:8px; min-height:120px; padding-top:8px; }
           .evol-col { flex:1; text-align:center; }
           .evol-bar { height:90px; display:flex; flex-direction:column; justify-content:flex-end; background:${line}; border-radius:6px 6px 0 0; overflow:hidden; max-width:48px; margin:0 auto; }
           .evol-bar span { display:block; width:100%; }
           .evol-lbl { font-size:10px; color:${inkSoft}; margin-top:4px; }
           .evol-amt { font-size:9px; font-variant-numeric:tabular-nums; color:${inkSoft}; }
           .chart-wrap { display:flex; align-items:center; gap:12px; flex-wrap:wrap; }
           .chart-legend { flex:1; min-width:100px; }
           .chart-legend-row { display:flex; align-items:center; gap:6px; font-size:10px; margin:3px 0; }
           .chart-legend-swatch { width:8px; height:8px; border-radius:2px; flex-shrink:0; }
           .chart-legend-label { flex:1; }
           .chart-legend-value { color:${inkSoft}; font-variant-numeric:tabular-nums; }
           .chart-center-label { font-family:system-ui,sans-serif; font-weight:700; fill:${sageDeep}; }
           .chart-center-sub { fill:${inkSoft}; font-family:system-ui,sans-serif; }
           .chart-empty { color:${inkSoft}; font-size:12px; }
           .footer { margin-top:24px; font-size:10px; color:${inkSoft}; text-align:center; }
           @media print {
             .card { break-inside: avoid; }
             body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
           }
         </style>
       </head><body>
         <h1>Rapport Budget</h1>
         <div class="sub">${this.esc(monthTitle)} · généré le ${now.toLocaleDateString('fr-FR')} · ${isMulti ? 'historique multi-mois' : 'comparaison dépenses théoriques vs effectives'}</div>

         <div class="hero">
           <div class="box theo"><span>Dépenses théoriques${isMulti ? ' (Σ)' : ''}</span><strong>${this.fmt(theoTotal)}</strong></div>
           <div class="box eff"><span>Dépenses effectives${isMulti ? ' (Σ)' : ''}</span><strong>${this.fmt(effTotal)}</strong></div>
           <div class="box"><span>Revenus (effectif${isMulti ? ' Σ' : ''})</span><strong>${this.fmt(bilan.revenus)}</strong></div>
           <div class="box"><span>Capacité${isMulti ? ' (Σ)' : ' restante'}</span><strong style="color:${sageDeep}">${this.fmt(bilan.capacite)}</strong></div>
         </div>

         ${historyTableHtml}

         <h2>Théorique vs effectif — par catégorie${isMulti ? ' (période)' : ''}</h2>
         <div class="legend">
           <span><i style="background:${inkSoft};opacity:.5"></i>Théorique (budget)</span>
           <span><i style="background:${sage}"></i>Effectif (validé / portefeuilles)</span>
         </div>
         <div class="card">${catCompareHtml || '<p class="muted">Pas de données.</p>'}</div>

         <h2>Répartition visuelle</h2>
         <div class="charts-2">
           <div class="card"><h3>Budget théorique</h3>${pieTheo}</div>
           <div class="card"><h3>Dépenses effectives</h3>${pieEff}</div>
         </div>

         <h2>${isMulti ? 'Bilan cumulé' : 'Bilan du mois'}</h2>
         <div class="card">
           <div class="kpi-row">
             <div class="kpi"><span>Revenus directs</span><strong>${this.fmt(bilan.revenusDirects)}</strong></div>
             <div class="kpi"><span>Apports reçus</span><strong>${this.fmt(bilan.apports)}</strong></div>
             <div class="kpi"><span>Déjà épargné</span><strong style="color:${gold}">${this.fmt(bilan.epargne)}</strong></div>
             <div class="kpi accent"><span>Capacité</span><strong>${this.fmt(bilan.capacite)}</strong></div>
           </div>
           <p class="muted" style="margin:0;font-size:11px;">Référence théorique${isMulti ? ' cumulée' : ' du mois'} — dépenses ${this.fmt(bilanTheo.depenses)} · épargne ${this.fmt(bilanTheo.epargne)} · capacité ${this.fmt(bilanTheo.capacite)}</p>
         </div>

         <h2>Évolution (${isMulti ? evolMonths.length + ' mois' : '6 mois'} effectifs)</h2>
         <div class="legend">
           <span><i style="background:${clay}"></i>Dépenses</span>
           <span><i style="background:${gold}"></i>Épargné</span>
           <span><i style="background:${sage}"></i>Capacité</span>
         </div>
         <div class="card"><div class="evol">${evolHtml}</div></div>

         <h2>Répartition du salaire (apports)</h2>
         <div class="card">${salaryPie}</div>

         <h2>Par compte${isMulti ? ' (dernier mois de la période)' : ''}</h2>
         ${accountsHtml || '<p class="muted">Aucun compte avec des dépenses.</p>'}

         ${isMulti ? '' : `<h2>Détail des saisies</h2>
         <div class="card" style="padding:8px 10px;">
           <table>
             <thead><tr><th>Description</th><th>Catégorie</th><th>Compte</th><th style="text-align:right">Théo.</th><th style="text-align:right">Eff.</th><th style="text-align:right">%</th></tr></thead>
             <tbody>${detailRows || '<tr><td colspan="6" class="muted">Aucune dépense</td></tr>'}</tbody>
           </table>
           <p class="muted" style="margin:8px 0 0;font-size:10px;">⚡ = dépense exceptionnelle (effectif uniquement) · 👛 = enveloppe portefeuille (effectif = mouvements sortis du compte)</p>
         </div>
         ${walletTxSection}`}

         <div class="footer">Budget Partagé · Rapport non contractuel · ${this.esc(isMulti ? (opts.fromKey + ' → ' + opts.toKey) : mKey)}</div>
       </body></html>`;
       if (this.useInAppReport()) {
          this.openReportFrame(reportHtml);
          toast('Rapport ouvert. La croix ramène à Budget.');
          return;
       }
       const win = window.open('', '_blank');
       if (!win) { toast('Autorisez les pop-ups pour générer le rapport'); return; }
       win.document.write(reportHtml);
       win.document.close();
       setTimeout(() => { try { win.focus(); win.print(); } catch (e) {} }, 500);
       toast('Rapport prêt à imprimer / enregistrer en PDF');
    },
});
