/**
 * Graphiques admin suivi — Chart.js (chargé uniquement sur admin/suivi.html).
 * Sources : quizz_reponses_utilisateur + parties_reponses_utilisateur.
 */
(function (global) {
  const ACCENT = '#0F6B5C';
  const ACCENT_TROUS = '#3D6B8A';
  const MUTED = '#4a5c56';
  const GRID = 'rgba(20, 32, 28, 0.08)';

  const instances = {};

  function dayKey(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  }

  function formatDay(key) {
    const [y, m, d] = key.split('-');
    return `${d}/${m}`;
  }

  function pct(obtenu, max) {
    const m = Number(max);
    if (!m || m <= 0) return null;
    return (Number(obtenu) / m) * 100;
  }

  function destroyAll() {
    Object.keys(instances).forEach((k) => {
      try {
        instances[k]?.destroy?.();
      } catch (_) { /* ignore */ }
      instances[k] = null;
    });
  }

  function periodSince(period) {
    const p = String(period || '30');
    if (p === 'all') return null;
    const days = Number(p);
    if (!Number.isFinite(days) || days < 1) return null;
    return new Date(Date.now() - days * 86400000).toISOString();
  }

  async function loadItems(kind) {
    const sb = global.JpApp.sbJeu();
    const table = kind === 'trous' ? 'parties_tableau_trous' : 'quizz';
    let data;
    let error;
    ({ data, error } = await sb
      .from(table)
      .select('id, titre, code_unique, secteur_therapeutique_id, secteurs_therapeutiques(valeur)')
      .order('titre', { ascending: true }));
    if (error) {
      ({ data, error } = await sb
        .from(table)
        .select('id, titre, code_unique, secteur_therapeutique_id')
        .order('titre', { ascending: true }));
      if (error) throw error;
    }
    return (data || []).map((q) => ({
      id: q.id,
      kind,
      titre: q.titre,
      code: q.code_unique,
      secteurId: q.secteur_therapeutique_id || null,
      secteurLabel: q.secteurs_therapeutiques?.valeur || 'Sans secteur',
    }));
  }

  async function loadQuizResponses(opts) {
    const sb = global.JpApp.sbJeu();
    let q = sb
      .from('quizz_reponses_utilisateur')
      .select('id, quizz_id, utilisateur_id, score_obtenu, score_max, created_at')
      .order('created_at', { ascending: true })
      .limit(3000);
    if (opts.since) q = q.gte('created_at', opts.since);
    if (opts.itemId) q = q.eq('quizz_id', opts.itemId);
    const { data, error } = await q;
    if (error) throw error;
    return (data || []).map((r) => ({
      id: r.id,
      kind: 'quiz',
      item_id: r.quizz_id,
      utilisateur_id: r.utilisateur_id,
      score_obtenu: r.score_obtenu,
      score_max: r.score_max,
      created_at: r.created_at,
    }));
  }

  async function loadTrousResponses(opts) {
    const sb = global.JpApp.sbJeu();
    let q = sb
      .from('parties_reponses_utilisateur')
      .select('id, partie_id, utilisateur_id, score_obtenu, score_max, created_at')
      .order('created_at', { ascending: true })
      .limit(3000);
    if (opts.since) q = q.gte('created_at', opts.since);
    if (opts.itemId) q = q.eq('partie_id', opts.itemId);
    const { data, error } = await q;
    if (error) throw error;
    return (data || []).map((r) => ({
      id: r.id,
      kind: 'trous',
      item_id: r.partie_id,
      utilisateur_id: r.utilisateur_id,
      score_obtenu: r.score_obtenu,
      score_max: r.score_max,
      created_at: r.created_at,
    }));
  }

  function buildScoreSeriesCombined(rows) {
    const quizBuckets = new Map();
    const trousBuckets = new Map();
    rows.forEach((r) => {
      const key = dayKey(r.created_at);
      if (!key) return;
      const p = pct(r.score_obtenu, r.score_max);
      if (p == null) return;
      const buckets = r.kind === 'trous' ? trousBuckets : quizBuckets;
      const b = buckets.get(key) || { sum: 0, n: 0 };
      b.sum += p;
      b.n += 1;
      buckets.set(key, b);
    });
    const labels = [...new Set([...quizBuckets.keys(), ...trousBuckets.keys()])].sort();
    return {
      labels: labels.map(formatDay),
      quiz: labels.map((k) => {
        const b = quizBuckets.get(k);
        return b ? Math.round((b.sum / b.n) * 10) / 10 : null;
      }),
      trous: labels.map((k) => {
        const b = trousBuckets.get(k);
        return b ? Math.round((b.sum / b.n) * 10) / 10 : null;
      }),
      dual: true,
    };
  }

  function buildScoreSeries(rows) {
    const buckets = new Map();
    rows.forEach((r) => {
      const key = dayKey(r.created_at);
      if (!key) return;
      const p = pct(r.score_obtenu, r.score_max);
      if (p == null) return;
      const b = buckets.get(key) || { sum: 0, n: 0 };
      b.sum += p;
      b.n += 1;
      buckets.set(key, b);
    });
    const labels = [...buckets.keys()].sort();
    return {
      labels: labels.map(formatDay),
      values: labels.map((k) => Math.round((buckets.get(k).sum / buckets.get(k).n) * 10) / 10),
      dual: false,
    };
  }

  function itemLabel(meta, id, kind) {
    if (!meta) return (kind === 'trous' ? 'TT' : 'PH') + ' ' + id.slice(0, 8);
    const base = meta.code || meta.titre || id.slice(0, 8);
    if (kind === 'trous') return 'Trous · ' + base;
    if (kind === 'quiz') return 'Quiz · ' + base;
    return base;
  }

  function buildSuccessByItem(rows, itemMap, dualKinds) {
    const buckets = new Map();
    rows.forEach((r) => {
      const p = pct(r.score_obtenu, r.score_max);
      if (p == null) return;
      const key = r.kind + ':' + r.item_id;
      const b = buckets.get(key) || { sum: 0, n: 0, kind: r.kind, item_id: r.item_id };
      b.sum += p;
      b.n += 1;
      buckets.set(key, b);
    });
    const entries = [...buckets.values()]
      .map((b) => {
        const meta = itemMap.get(b.item_id);
        const label = dualKinds
          ? itemLabel(meta, b.item_id, b.kind)
          : (meta ? (meta.code || meta.titre || b.item_id.slice(0, 8)) : b.item_id.slice(0, 8));
        return { label, value: Math.round((b.sum / b.n) * 10) / 10, n: b.n };
      })
      .sort((a, b) => b.value - a.value)
      .slice(0, 12);
    return {
      labels: entries.map((e) => e.label),
      values: entries.map((e) => e.value),
    };
  }

  function buildSuccessBySecteur(rows, itemMap) {
    const buckets = new Map();
    rows.forEach((r) => {
      const p = pct(r.score_obtenu, r.score_max);
      if (p == null) return;
      const meta = itemMap.get(r.item_id);
      const label = meta?.secteurLabel || 'Sans secteur';
      const b = buckets.get(label) || { sum: 0, n: 0 };
      b.sum += p;
      b.n += 1;
      buckets.set(label, b);
    });
    const entries = [...buckets.entries()]
      .map(([label, b]) => ({
        label,
        value: Math.round((b.sum / b.n) * 10) / 10,
      }))
      .sort((a, b) => b.value - a.value);
    return {
      labels: entries.map((e) => e.label),
      values: entries.map((e) => e.value),
    };
  }

  function buildActivityCombined(rows) {
    const quizByDay = new Map();
    const trousByDay = new Map();
    const usersByDay = new Map();
    rows.forEach((r) => {
      const key = dayKey(r.created_at);
      if (!key) return;
      if (r.kind === 'trous') {
        trousByDay.set(key, (trousByDay.get(key) || 0) + 1);
      } else {
        quizByDay.set(key, (quizByDay.get(key) || 0) + 1);
      }
      if (!usersByDay.has(key)) usersByDay.set(key, new Set());
      if (r.utilisateur_id) usersByDay.get(key).add(r.utilisateur_id);
    });
    const labels = [...new Set([...quizByDay.keys(), ...trousByDay.keys()])].sort();
    return {
      labels: labels.map(formatDay),
      quizAttempts: labels.map((k) => quizByDay.get(k) || 0),
      trousAttempts: labels.map((k) => trousByDay.get(k) || 0),
      users: labels.map((k) => usersByDay.get(k)?.size || 0),
      dual: true,
    };
  }

  function buildActivity(rows) {
    const byDay = new Map();
    const usersByDay = new Map();
    rows.forEach((r) => {
      const key = dayKey(r.created_at);
      if (!key) return;
      byDay.set(key, (byDay.get(key) || 0) + 1);
      if (!usersByDay.has(key)) usersByDay.set(key, new Set());
      if (r.utilisateur_id) usersByDay.get(key).add(r.utilisateur_id);
    });
    const labels = [...byDay.keys()].sort();
    return {
      labels: labels.map(formatDay),
      attempts: labels.map((k) => byDay.get(k)),
      users: labels.map((k) => usersByDay.get(k)?.size || 0),
      dual: false,
    };
  }

  function baseOptions(yTitle) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { mode: 'index', intersect: false },
      },
      scales: {
        x: {
          ticks: { color: MUTED, maxRotation: 45, font: { size: 11 } },
          grid: { color: GRID },
        },
        y: {
          beginAtZero: true,
          ticks: { color: MUTED, font: { size: 11 } },
          grid: { color: GRID },
          title: yTitle
            ? { display: true, text: yTitle, color: MUTED, font: { size: 12 } }
            : undefined,
        },
      },
    };
  }

  function renderScore(canvas, series) {
    if (instances.score) instances.score.destroy();
    const datasets = series.dual
      ? [
          {
            label: 'Quiz (%)',
            data: series.quiz,
            borderColor: ACCENT,
            backgroundColor: 'rgba(15, 107, 92, 0.10)',
            fill: false,
            tension: 0.25,
            pointRadius: 3,
            spanGaps: true,
          },
          {
            label: 'Trous (%)',
            data: series.trous,
            borderColor: ACCENT_TROUS,
            backgroundColor: 'rgba(61, 107, 138, 0.10)',
            fill: false,
            tension: 0.25,
            pointRadius: 3,
            spanGaps: true,
          },
        ]
      : [{
          label: 'Score moyen (%)',
          data: series.values,
          borderColor: ACCENT,
          backgroundColor: 'rgba(15, 107, 92, 0.12)',
          fill: true,
          tension: 0.25,
          pointRadius: 3,
        }];
    instances.score = new Chart(canvas, {
      type: 'line',
      data: { labels: series.labels, datasets },
      options: {
        ...baseOptions('%'),
        plugins: {
          legend: { display: !!series.dual, labels: { color: MUTED, boxWidth: 12 } },
          tooltip: { mode: 'index', intersect: false },
        },
        scales: {
          ...baseOptions('%').scales,
          y: { ...baseOptions('%').scales.y, max: 100 },
        },
      },
    });
  }

  function renderSuccess(canvas, series) {
    if (instances.success) instances.success.destroy();
    instances.success = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: series.labels,
        datasets: [{
          label: 'Réussite (%)',
          data: series.values,
          backgroundColor: ACCENT,
          borderRadius: 4,
        }],
      },
      options: {
        ...baseOptions('%'),
        scales: {
          ...baseOptions('%').scales,
          y: { ...baseOptions('%').scales.y, max: 100 },
        },
      },
    });
  }

  function renderActivity(canvas, series) {
    if (instances.activity) instances.activity.destroy();
    const datasets = series.dual
      ? [
          {
            type: 'bar',
            label: 'Quiz',
            data: series.quizAttempts,
            backgroundColor: ACCENT,
            borderRadius: 4,
            stack: 'attempts',
            yAxisID: 'y',
          },
          {
            type: 'bar',
            label: 'Trous',
            data: series.trousAttempts,
            backgroundColor: ACCENT_TROUS,
            borderRadius: 4,
            stack: 'attempts',
            yAxisID: 'y',
          },
          {
            type: 'line',
            label: 'Utilisateurs',
            data: series.users,
            borderColor: MUTED,
            backgroundColor: 'transparent',
            tension: 0.25,
            pointRadius: 2,
            yAxisID: 'y1',
          },
        ]
      : [
          {
            type: 'bar',
            label: 'Tentatives',
            data: series.attempts,
            backgroundColor: ACCENT,
            borderRadius: 4,
            yAxisID: 'y',
          },
          {
            type: 'line',
            label: 'Utilisateurs',
            data: series.users,
            borderColor: MUTED,
            backgroundColor: 'transparent',
            tension: 0.25,
            pointRadius: 2,
            yAxisID: 'y1',
          },
        ];
    instances.activity = new Chart(canvas, {
      type: 'bar',
      data: { labels: series.labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: true, labels: { color: MUTED, boxWidth: 12 } },
          tooltip: { mode: 'index', intersect: false },
        },
        scales: {
          x: {
            stacked: !!series.dual,
            ticks: { color: MUTED, maxRotation: 45, font: { size: 11 } },
            grid: { color: GRID },
          },
          y: {
            stacked: !!series.dual,
            beginAtZero: true,
            position: 'left',
            ticks: { color: MUTED, font: { size: 11 }, precision: 0 },
            grid: { color: GRID },
            title: { display: true, text: 'Tentatives', color: MUTED, font: { size: 12 } },
          },
          y1: {
            beginAtZero: true,
            position: 'right',
            ticks: { color: MUTED, font: { size: 11 }, precision: 0 },
            grid: { drawOnChartArea: false },
            title: { display: true, text: 'Utilisateurs', color: MUTED, font: { size: 12 } },
          },
        },
      },
    });
  }

  function fillItemSelect(els, quizzes, parties, type) {
    const key = type + '|' + quizzes.length + '|' + parties.length;
    if (els.itemEl.dataset.filled === key) return;
    const current = els.itemEl.value;
    let html = '<option value="">Toutes les activités</option>';
    if (type === 'quiz' || type === 'tous') {
      const opts = quizzes.map((q) =>
        `<option value="quiz:${q.id}">${escapeAttr(q.code || '')} — ${escapeAttr(q.titre || '')}</option>`
      ).join('');
      html += type === 'tous'
        ? `<optgroup label="Quiz">${opts}</optgroup>`
        : opts;
    }
    if (type === 'trous' || type === 'tous') {
      const opts = parties.map((p) =>
        `<option value="trous:${p.id}">${escapeAttr(p.code || '')} — ${escapeAttr(p.titre || '')}</option>`
      ).join('');
      html += type === 'tous'
        ? `<optgroup label="Tableau à trous">${opts}</optgroup>`
        : opts;
    }
    els.itemEl.innerHTML = html;
    if ([...els.itemEl.options].some((o) => o.value === current)) {
      els.itemEl.value = current;
    } else {
      els.itemEl.value = '';
    }
    els.itemEl.dataset.filled = key;
  }

  function updateGroupLabels(els, type) {
    const itemOpt = els.groupEl.querySelector('option[value="item"]');
    if (!itemOpt) return;
    if (type === 'quiz') itemOpt.textContent = 'Quiz';
    else if (type === 'trous') itemOpt.textContent = 'Partie';
    else itemOpt.textContent = 'Activité';
  }

  /**
   * @param {{
   *   periodEl: HTMLSelectElement,
   *   typeEl: HTMLSelectElement,
   *   itemEl: HTMLSelectElement,
   *   groupEl: HTMLSelectElement,
   *   canvasScore: HTMLCanvasElement,
   *   canvasSuccess: HTMLCanvasElement,
   *   canvasActivity: HTMLCanvasElement,
   *   emptyEl: HTMLElement,
   *   chartsEl: HTMLElement,
   *   metaEl?: HTMLElement,
   * }} els
   */
  async function refresh(els) {
    const ChartCtor = global.Chart;
    if (!ChartCtor) {
      throw new Error('Chart.js non chargé');
    }

    const since = periodSince(els.periodEl.value);
    const type = els.typeEl?.value || 'tous';
    const rawItem = els.itemEl.value || '';
    let itemKind = null;
    let itemId = null;
    if (rawItem.includes(':')) {
      const [k, id] = rawItem.split(':');
      itemKind = k;
      itemId = id;
    }

    const groupBy = els.groupEl.value === 'secteur' ? 'secteur' : 'item';

    els.emptyEl.hidden = true;
    els.chartsEl.hidden = false;

    const loadQuiz = type === 'tous' || type === 'quiz';
    const loadTrous = type === 'tous' || type === 'trous';

    const quizItemFilter = itemKind === 'quiz' ? itemId : (type === 'quiz' && itemId ? itemId : null);
    const trousItemFilter = itemKind === 'trous' ? itemId : (type === 'trous' && itemId ? itemId : null);

    // Si filtre activité d'un type précis alors que l'autre type est visible : ne charger que le type de l'item
    const wantQuiz = loadQuiz && (!itemKind || itemKind === 'quiz');
    const wantTrous = loadTrous && (!itemKind || itemKind === 'trous');

    const [quizzes, parties, quizRows, trousRows] = await Promise.all([
      loadQuiz ? loadItems('quiz') : Promise.resolve([]),
      loadTrous ? loadItems('trous') : Promise.resolve([]),
      wantQuiz ? loadQuizResponses({ since, itemId: quizItemFilter || (itemKind === 'quiz' ? itemId : null) }) : Promise.resolve([]),
      wantTrous ? loadTrousResponses({ since, itemId: trousItemFilter || (itemKind === 'trous' ? itemId : null) }) : Promise.resolve([]),
    ]);

    fillItemSelect(els, quizzes, parties, type);
    updateGroupLabels(els, type);

    const itemMap = new Map([
      ...quizzes.map((q) => [q.id, q]),
      ...parties.map((p) => [p.id, p]),
    ]);

    const responses = [...quizRows, ...trousRows];

    if (!responses.length) {
      destroyAll();
      els.chartsEl.hidden = true;
      els.emptyEl.hidden = false;
      els.emptyEl.innerHTML =
        '<strong>Aucune donnée</strong><p>Pas de tentatives sur la période filtrée.</p>';
      if (els.metaEl) els.metaEl.textContent = '';
      return;
    }

    if (els.metaEl) {
      const users = new Set(responses.map((r) => r.utilisateur_id).filter(Boolean));
      const nQ = quizRows.length;
      const nT = trousRows.length;
      const parts = [];
      if (nQ) parts.push(`${nQ} quiz`);
      if (nT) parts.push(`${nT} trous`);
      els.metaEl.textContent =
        `${responses.length} tentative${responses.length > 1 ? 's' : ''}`
        + (parts.length ? ` (${parts.join(' · ')})` : '')
        + ` · ${users.size} utilisateur${users.size > 1 ? 's' : ''}`;
    }

    const dualKinds = type === 'tous' && !itemKind;
    const scoreSeries = dualKinds
      ? buildScoreSeriesCombined(responses)
      : buildScoreSeries(responses);
    const successSeries = groupBy === 'secteur'
      ? buildSuccessBySecteur(responses, itemMap)
      : buildSuccessByItem(responses, itemMap, dualKinds || type === 'tous');
    const activitySeries = dualKinds
      ? buildActivityCombined(responses)
      : buildActivity(responses);

    renderScore(els.canvasScore, scoreSeries);
    renderSuccess(els.canvasSuccess, successSeries);
    renderActivity(els.canvasActivity, activitySeries);
  }

  function escapeAttr(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;');
  }

  /**
   * Boot page suivi admin.
   * @param {HTMLElement} root
   */
  function mount(root) {
    if (!root) return;

    const els = {
      periodEl: root.querySelector('#jpSuiviPeriod'),
      typeEl: root.querySelector('#jpSuiviType'),
      itemEl: root.querySelector('#jpSuiviItem') || root.querySelector('#jpSuiviQuiz'),
      groupEl: root.querySelector('#jpSuiviGroup'),
      canvasScore: root.querySelector('#jpChartScore'),
      canvasSuccess: root.querySelector('#jpChartSuccess'),
      canvasActivity: root.querySelector('#jpChartActivity'),
      emptyEl: root.querySelector('#jpSuiviEmpty'),
      chartsEl: root.querySelector('#jpSuiviCharts'),
      metaEl: root.querySelector('#jpSuiviMeta'),
    };

    if (!els.periodEl || !els.canvasScore) return;

    const run = async () => {
      try {
        await refresh(els);
      } catch (err) {
        destroyAll();
        els.chartsEl.hidden = true;
        els.emptyEl.hidden = false;
        els.emptyEl.innerHTML =
          `<strong>Erreur</strong><p>${global.JpUi?.escapeHtml?.(err.message || String(err)) || 'Chargement impossible'}</p>`;
        global.JpToast?.fromError?.(err);
        void global.JpLogs?.error?.('admin_suivi_charts', { message: err.message || String(err) });
      }
    };

    ['change'].forEach((ev) => {
      els.periodEl.addEventListener(ev, run);
      els.typeEl?.addEventListener(ev, () => {
        els.itemEl.dataset.filled = '';
        els.itemEl.value = '';
        void run();
      });
      els.itemEl.addEventListener(ev, run);
      els.groupEl.addEventListener(ev, run);
    });

    void run();
  }

  global.JpChartsAdmin = {
    mount,
    refresh,
    destroyAll,
  };
})(window);
