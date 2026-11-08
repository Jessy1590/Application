  const cfg = window.SUPABASE_CONFIG;
  if (!cfg?.url || !cfg?.anonKey) {
    fatalError('Configuration manquante', 'Chargez shared/supabase-config.js avant ce script.');
    throw new Error('SUPABASE_CONFIG manquant');
  }

  // Affiche une erreur bloquante visible à l'écran (pas seulement en console)
  function fatalError(title, detail) {
    const show = () => {
      const root = document.getElementById('budget-root');
      if (!root) return;
      root.style.display = 'flex';
      root.innerHTML =
        '<div class="bh-card" style="margin:24px;"><h2 class="bh-title">' + title + '</h2>' +
        '<p style="white-space:pre-wrap;color:var(--clay);">' + detail + '</p></div>';
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', show);
    else show();
  }

  // Le SDK Supabase (CDN) expose son objet global sous le nom "supabase", pas "supabaseApp"
  if (!window.supabase || typeof window.supabase.createClient !== 'function') {
    fatalError('Erreur de chargement',
      'Impossible de charger la librairie Supabase (CDN). ' +
      'Vérifiez votre connexion, désactivez un éventuel bloqueur de scripts, ou videz le cache / désinstallez le service worker (F12 → Application), puis rechargez la page.');
    throw new Error('Supabase SDK non chargé — arrêt du script.');
  }

  // V2 : toutes les données dans le schéma Postgres « banque » (public = V1, jamais écrit par la V2)
  const DB_SCHEMA = 'banque';
  let supabaseApp;
  try {
    supabaseApp = window.supabase.createClient(cfg.url, cfg.anonKey, { db: { schema: DB_SCHEMA } });
  } catch (e) {
    fatalError('Erreur d\'initialisation Supabase', String(e && e.message ? e.message : e));
    throw e;
  }

  function toast(msg, opts) {
    // opts: { retry: fn, duration: ms }
    const t = document.getElementById('bh-toast');
    t.innerHTML = '';
    const span = document.createElement('span');
    span.textContent = msg;
    t.appendChild(span);
    if (opts && opts.retry) {
      const btn = document.createElement('button');
      btn.textContent = 'Réessayer';
      btn.style.cssText = 'margin-left:10px;background:#fff;color:var(--sage-deep);border:none;border-radius:20px;padding:4px 10px;font-weight:700;font-size:12px;cursor:pointer;';
      btn.onclick = () => { t.classList.remove('show'); opts.retry(); };
      t.appendChild(btn);
    }
    t.classList.add('show');
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.remove('show'), opts && opts.retry ? 6000 : 3000);
  }

  // Wrapper générique pour appels réseau : affiche une erreur claire + bouton Réessayer
  // Relance auto une fois après refresh JWT si PGRST303 (horloge iPhone en avance)
  async function withRetry(fn, label, opts) {
    opts = opts || {};
    try {
      return await fn();
    } catch (e) {
      console.error(label, e);
      const detail = (e && (e.message || e.error_description)) ? (e.message || e.error_description) : String(e);
      const codeStr = String((e && (e.code || e.status)) || '');
      const isJwtSkew = /PGRST303|issued at future/i.test(codeStr + ' ' + detail);
      if (isJwtSkew && !opts._jwtRetried) {
        try {
          await supabaseApp.auth.refreshSession();
          return await withRetry(fn, label, { _jwtRetried: true });
        } catch (refreshErr) {
          console.error('refreshSession après PGRST303', refreshErr);
        }
      }
      const code = e && (e.code || e.status) ? ' [' + (e.code || e.status) + ']' : '';
      toast('Erreur (' + (label || 'action') + ')' + code + ' : ' + detail, { retry: () => withRetry(fn, label) });
      return null;
    }
  }

  async function startApp() {
    // Refresh prioritaire : évite un JWT « issued at future » issu du cache local (fréquent sur iPhone)
    let session = null;
    try {
      const { data, error } = await supabaseApp.auth.refreshSession();
      if (!error && data?.session) session = data.session;
    } catch (e) {
      console.warn('refreshSession initial', e);
    }
    if (!session) {
      const { data, error } = await supabaseApp.auth.getSession();
      if (error || !data || !data.session) return;
      session = data.session;
    }
    document.getElementById('budget-root').style.display = 'flex';
    BH.user = session.user;
    BH.init();
  }
  document.addEventListener('DOMContentLoaded', () => {
    startApp();
  });

  const BH = {
    user: null,
    state: { accounts:[], members:[], expenses:[], incomes:[], months:{}, profile:{} },
    activeTab: 'today',
    comptesMonth: new Date(),
    todayMonth: new Date(),
    sheetMode: 'expense',
    sheetEditId: null,
    groupSelect: {}, // expId -> accId
    groupValidateItems: [],
    verif: { ops: [], allOps: [], accId: '', mKey: '', fileName: '', bank: 'auto', bankDetected: '', pane: 'releve', listFilter: 'all', scoreFilter: '', statusFilter: 'all', linkOpId: null, linkKindFilter: '', walletOpId: null, refundOpId: null, gapLinkApp: null },

    async init() {
      await this.fetchData();
      // Si on réduit la fenêtre sous desktop alors qu'on est sur Vérif → retour Aujourd'hui
      window.addEventListener('resize', () => {
        this.syncFab();
        if (this.activeTab === 'verif' && window.matchMedia('(max-width: 959px)').matches) {
          this.switchTab('today');
        }
      });
      
      // Realtime try/catch (Empêche l'erreur de bloquer le Canvas)
      try {
        supabaseApp.channel('banque-db')
          .on('postgres_changes', { event:'*', schema: DB_SCHEMA }, () => this.scheduleRemoteRefresh())
          .subscribe();
      } catch (e) {
        console.log("Realtime désactivé dans cet environnement.");
      }

      // Fermer les panels de filtres stats au clic extérieur
      if (!this._statsFilterDocBound) {
        this._statsFilterDocBound = true;
        document.addEventListener('click', (e) => {
          if (!this._statsFilterOpen) return;
          if (e.target.closest('.chart-filter-wrap')) return;
          this.closeStatsFilters();
        });
      }
    },

    async fetchData() {
      const seq = (this._fetchSeq = (this._fetchSeq || 0) + 1);
      const startedAt = Date.now();
      const result = await withRetry(async () => {
        const wrap = async (p) => ({ data: await p, error: null });
        const [accs, mems, exps, incs, recs, prof, verifs] = await Promise.all([
          supabaseApp.from('accounts').select('*'),
          supabaseApp.from('account_members').select('*, profiles(display_name, main_account_id)'),
          wrap(this.selectAll('expenses')),
          wrap(this.selectAll('incomes')),
          this.loadMonthRecords(),
          supabaseApp.from('profiles').select('*').eq('id', this.user.id).maybeSingle(),
          wrap(this.selectAll('bank_verifications', q => q.eq('user_id', this.user.id)))
        ]);
        [accs, mems, exps, incs, recs, prof, verifs].forEach(r => { if (r.error) throw r.error; });
        if (!prof.data) prof.data = await this.ensureProfile();
        return { accs, mems, exps, incs, recs, prof, verifs };
      }, 'chargement des données');

      if (!result) return; // erreur déjà affichée avec bouton Réessayer
      // Une réponse plus récente est attendue, ou une écriture locale a eu lieu pendant le chargement
      if (seq !== this._fetchSeq) return;
      if ((this._localMutAt || 0) > startedAt) return this.fetchData();

      const { accs, mems, exps, incs, recs, prof, verifs } = result;

      this.state = {
        accounts: accs.data || [],
        members: mems.data || [],
        expenses: exps.data || [],
        incomes: incs.data || [],
        profile: prof.data || {},
        monthRecords: recs.data || [],
        bankVerifications: verifs.data || [],
        months: (recs.data || []).reduce((acc, m) => {
          acc[m.account_id + '_' + m.month_key] = m.paid_expenses || {};
          return acc;
        }, {}),
        monthsIncomes: (recs.data || []).reduce((acc, m) => {
          acc[m.account_id + '_' + m.month_key] = m.paid_incomes || {};
          return acc;
        }, {}),
        walletTx: (recs.data || []).reduce((acc, m) => {
          acc[m.account_id + '_' + m.month_key] = m.wallet_transactions || {};
          return acc;
        }, {}),
        // Snapshots du budget théorique par compte/mois (pour graphiques historiques)
        theoreticalMonths: (recs.data || []).reduce((acc, m) => {
          acc[m.account_id + '_' + m.month_key] = m.theoretical_expenses || {};
          return acc;
        }, {}),
        theoreticalIncomesMonths: (recs.data || []).reduce((acc, m) => {
          acc[m.account_id + '_' + m.month_key] = m.theoretical_incomes || {};
          return acc;
        }, {})
      };

      if (typeof this.reconcileOwnApportReceived === 'function') await this.reconcileOwnApportReceived();
      if (typeof this.reconcileMyMirroredApports === 'function') await this.reconcileMyMirroredApports();
      this.render();
      this.syncFab();
      this.checkDueNotifications();
      // Figé le budget théorique du mois courant (sans bloquer le rendu)
      this.syncCurrentTheoreticalSnapshots();
    },

    monthKey(date) { return date.getFullYear() + '-' + String(date.getMonth()+1).padStart(2,'0'); },
    fmt(n) { return (Math.round((n||0)*100)/100).toLocaleString('fr-FR', {minimumFractionDigits:2}) + ' €'; },
    esc(s) { return String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); },
    switchTab(tab) {
      // Vérif réservé au desktop
      if ((tab === 'verif' || tab === 'prev') && window.matchMedia('(max-width: 959px)').matches) tab = 'today';
      this.activeTab = tab;
      document.querySelectorAll('.bh-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
      document.querySelectorAll('.bh-view').forEach(v => v.classList.remove('active'));
      document.getElementById('view-' + tab).classList.add('active');
      this.syncFab();
      this.render();
    },
    syncFab() {
      const desktop = window.matchMedia('(min-width: 960px)').matches;
      const show = desktop || this.activeTab === 'saisies';
      const fab = document.getElementById('bh-fab');
      if (fab) fab.style.display = show ? 'flex' : 'none';
    },

    shiftMonth(delta) {
      this.comptesMonth = new Date(this.comptesMonth.getFullYear(), this.comptesMonth.getMonth() + delta, 1);
      this.render();
    },
    todayViewKey() {
      return this.monthKey(this.todayMonth || new Date());
    },
    shiftTodayMonth(delta) {
      const next = new Date(this.todayMonth.getFullYear(), this.todayMonth.getMonth() + delta, 1);
      const cur = new Date();
      const curMonthStart = new Date(cur.getFullYear(), cur.getMonth(), 1);
      if (next.getTime() > curMonthStart.getTime()) return; // pas de mois futur
      this.todayMonth = next;
      this.groupSelect = {};
      this.renderToday();
    },

    render() {
      document.getElementById('bh-header-sub').textContent = new Date().toLocaleDateString('fr-FR', {weekday:'long', day:'numeric', month:'long'});
      if(this.activeTab === 'today') this.renderToday();
      else {
        const bar = document.getElementById('bh-group-bar');
        if (bar) { bar.classList.remove('open'); bar.innerHTML = ''; }
        if (this.walletOpenId) this.closeWalletPopup();
      }
      if(this.activeTab === 'comptes') this.renderComptes();
      if(this.activeTab === 'saisies') this.renderSaisies();
      if(this.activeTab === 'stats') this.renderStats();
      if(this.activeTab === 'verif') this.renderVerif();
      if(this.activeTab === 'prev' && typeof this.renderPrev === 'function') this.renderPrev();
    },
  };
