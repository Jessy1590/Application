/**
 * Graphiques admin suivi — Chart.js (chargé uniquement sur admin/suivi.html).
 * Sources : quizz_reponses_utilisateur (+ métadonnées quizz / secteurs).
 */
(function (global) {
  const ACCENT = '#0F6B5C';
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

  async function loadQuizzes() {
    const sb = global.JpApp.sbJeu();
    let data;
    let error;
    ({ data, error } = await sb
      .from('quizz')
      .select('id, titre, code_unique, secteur_therapeutique_id, secteurs_therapeutiques(valeur)')
      .order('titre', { ascending: true }));
    if (error) {
      ({ data, error } = await sb
        .from('quizz')
        .select('id, titre, code_unique, secteur_therapeutique_id')
        .order('titre', { ascending: true }));
      if (error) throw error;
    }
    return (data || []).map((q) => ({
      id: q.id,
      titre: q.titre,
      code: q.code_unique,
      secteurId: q.secteur_therapeutique_id || null,
      secteurLabel: q.secteurs_therapeutiques?.valeur || 'Sans secteur',
    }));
  }

  async function loadResponses(opts) {
    const sb = global.JpApp.sbJeu();
    let q = sb
      .from('quizz_reponses_utilisateur')
      .select('id, quizz_id, utilisateur_id, score_obtenu, score_max, created_at')
      .order('created_at', { ascending: true })
      .limit(3000);
    if (opts.since) q = q.gte('created_at', opts.since);
    if (opts.quizzId) q = q.eq('quizz_id', opts.quizzId);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
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
    };
  }

  function buildSuccessByQuiz(rows, quizMap) {
    const buckets = new Map();
    rows.forEach((r) => {
      const p = pct(r.score_obtenu, r.score_max);
      if (p == null) return;
      const id = r.quizz_id;
      const b = buckets.get(id) || { sum: 0, n: 0 };
      b.sum += p;
      b.n += 1;
      buckets.set(id, b);
    });
    const entries = [...buckets.entries()]
      .map(([id, b]) => {
        const meta = quizMap.get(id);
        const label = meta
          ? (meta.code || meta.titre || id.slice(0, 8))
          : id.slice(0, 8);
        return { label, value: Math.round((b.sum / b.n) * 10) / 10, n: b.n };
      })
      .sort((a, b) => b.value - a.value)
      .slice(0, 12);
    return {
      labels: entries.map((e) => e.label),
      values: entries.map((e) => e.value),
    };
  }

  function buildSuccessBySecteur(rows, quizMap) {
    const buckets = new Map();
    rows.forEach((r) => {
      const p = pct(r.score_obtenu, r.score_max);
      if (p == null) return;
      const meta = quizMap.get(r.quizz_id);
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
    instances.score = new Chart(canvas, {
      type: 'line',
      data: {
        labels: series.labels,
        datasets: [{
          label: 'Score moyen (%)',
          data: series.values,
          borderColor: ACCENT,
          backgroundColor: 'rgba(15, 107, 92, 0.12)',
          fill: true,
          tension: 0.25,
          pointRadius: 3,
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
    instances.activity = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: series.labels,
        datasets: [
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
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: true, labels: { color: MUTED, boxWidth: 12 } },
          tooltip: { mode: 'index', intersect: false },
        },
        scales: {
          x: {
            ticks: { color: MUTED, maxRotation: 45, font: { size: 11 } },
            grid: { color: GRID },
          },
          y: {
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

  /**
   * @param {{
   *   periodEl: HTMLSelectElement,
   *   quizEl: HTMLSelectElement,
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
    const quizzId = els.quizEl.value || null;
    const groupBy = els.groupEl.value === 'secteur' ? 'secteur' : 'quiz';

    els.emptyEl.hidden = true;
    els.chartsEl.hidden = false;

    const [quizzes, responses] = await Promise.all([
      loadQuizzes(),
      loadResponses({ since, quizzId }),
    ]);

    const quizMap = new Map(quizzes.map((q) => [q.id, q]));

    if (!els.quizEl.dataset.filled) {
      const current = els.quizEl.value;
      els.quizEl.innerHTML = '<option value="">Tous les quiz</option>' +
        quizzes.map((q) =>
          `<option value="${q.id}">${escapeAttr(q.code || '')} — ${escapeAttr(q.titre || '')}</option>`
        ).join('');
      els.quizEl.value = current;
      els.quizEl.dataset.filled = '1';
    }

    if (!responses.length) {
      destroyAll();
      els.chartsEl.hidden = true;
      els.emptyEl.hidden = false;
      els.emptyEl.innerHTML =
        '<strong>Aucune donnée</strong><p>Pas de tentatives quiz sur la période filtrée.</p>';
      if (els.metaEl) els.metaEl.textContent = '';
      return;
    }

    if (els.metaEl) {
      const users = new Set(responses.map((r) => r.utilisateur_id).filter(Boolean));
      els.metaEl.textContent =
        `${responses.length} tentative${responses.length > 1 ? 's' : ''} · ${users.size} utilisateur${users.size > 1 ? 's' : ''}`;
    }

    const scoreSeries = buildScoreSeries(responses);
    const successSeries = groupBy === 'secteur'
      ? buildSuccessBySecteur(responses, quizMap)
      : buildSuccessByQuiz(responses, quizMap);
    const activitySeries = buildActivity(responses);

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
      quizEl: root.querySelector('#jpSuiviQuiz'),
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
      els.quizEl.addEventListener(ev, run);
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
