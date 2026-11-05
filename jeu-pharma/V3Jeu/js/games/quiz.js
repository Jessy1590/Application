/* Quiz V3 — manuel / auto / mixte. */
(function (global) {
  const U = global.V3UI;
  const C = global.V3Champs;
  const h = U && U.h;

  const STYLES = ['manuel', 'auto', 'mixte'];
  const SENS = ['mol_vers_valeur', 'valeur_vers_mol', 'les_deux'];
  const STOP = {
    de: 1, du: 1, des: 1, la: 1, le: 1, les: 1, un: 1, une: 1, et: 1, ou: 1,
    a: 1, au: 1, aux: 1, en: 1, d: 1, l: 1, par: 1, pour: 1, avec: 1, sans: 1,
    chez: 1, sur: 1, sous: 1, dans: 1, the: 1, of: 1,
  };

  function clamp(n, min, max, def) {
    const v = Number(n);
    if (!Number.isFinite(v)) return def;
    return Math.min(max, Math.max(min, Math.round(v)));
  }

  function uid() {
    return 'q' + Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
  }

  function shuffle(arr) {
    const a = (arr || []).slice();
    for (let i = a.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = a[i];
      a[i] = a[j];
      a[j] = t;
    }
    return a;
  }

  function sample(arr, n) {
    const sh = shuffle(arr);
    const k = Math.max(0, Number(n) || 0);
    return sh.slice(0, Math.min(k, sh.length));
  }

  function normQuiz(s) {
    return String(s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function tokens(s) {
    return normQuiz(s).split(' ').filter(Boolean);
  }

  function jaccard(a, b) {
    const A = tokens(a);
    const B = tokens(b);
    if (!A.length || !B.length) return 0;
    const setB = {};
    B.forEach(function (t) { setB[t] = true; });
    let inter = 0;
    const seen = {};
    A.forEach(function (t) {
      if (setB[t] && !seen[t]) {
        inter += 1;
        seen[t] = true;
      }
    });
    const union = {};
    A.concat(B).forEach(function (t) { union[t] = true; });
    return inter / Object.keys(union).length;
  }

  function teteClinique(a, b) {
    const A = tokens(a).filter(function (t) { return !STOP[t]; });
    const B = tokens(b).filter(function (t) { return !STOP[t]; });
    if (!A.length || !B.length) return false;
    if (A[0] !== B[0]) return false;
    return A.join(' ') !== B.join(' ');
  }

  function similarite(a, b) {
    const na = normQuiz(a);
    const nb = normQuiz(b);
    if (!na || !nb) return 0;
    if (na === nb) return 1;
    let s = jaccard(na, nb);
    if (na.length >= 4 && nb.length >= 4 && (na.indexOf(nb) >= 0 || nb.indexOf(na) >= 0)) {
      s = Math.max(s, 0.8);
    }
    if (teteClinique(na, nb)) s = Math.max(s, 0.75);
    return s;
  }

  function plafondDiff(n) {
    const d = clamp(n, 1, 3, 1);
    if (d === 1) return 0.2;
    if (d === 2) return 0.5;
    return 0.8;
  }

  function acceptableDistracteur(cand, bonne, deja, plafond) {
    const vs = similarite(cand, bonne);
    if (vs > 0.8 || vs >= plafond) return false;
    for (let i = 0; i < (deja || []).length; i += 1) {
      const d = similarite(cand, deja[i]);
      if (d > 0.8 || d >= plafond) return false;
    }
    return true;
  }

  function uniqueNorm(list) {
    const seen = {};
    const out = [];
    (list || []).forEach(function (t) {
      const n = normQuiz(t);
      if (!n || seen[n]) return;
      seen[n] = true;
      out.push(t);
    });
    return out;
  }

  function champMeta(code) {
    if (!C) return { code: code, label: code, court: code, identite: false };
    for (let i = 0; i < C.list.length; i += 1) {
      if (C.list[i].code === code) return C.list[i];
    }
    return { code: code, label: code, court: code, identite: false };
  }

  function champLabel(code) {
    return champMeta(code).label || code;
  }

  function champCourt(code) {
    const m = champMeta(code);
    return m.court || m.label || code;
  }

  function vals(mol, code) {
    if (C && C.valeurs) return C.valeurs(mol, code);
    if (!mol || !mol.valeurs) return [];
    const v = mol.valeurs[code];
    return Array.isArray(v) ? v.slice() : [];
  }

  function hasVal(mol, code, texte) {
    const n = normQuiz(texte);
    return vals(mol, code).some(function (x) { return normQuiz(x) === n; });
  }

  function champsPedago(mols) {
    const out = [];
    const list = (C && C.list) || [];
    list.forEach(function (c) {
      if (c.identite) return;
      const ok = (mols || []).some(function (m) { return vals(m, c.code).length > 0; });
      if (ok) out.push(c.code);
    });
    return out;
  }

  function countChamp(mols, code) {
    return (mols || []).filter(function (m) { return vals(m, code).length > 0; }).length;
  }

  function champsActifs(cfg, mols) {
    const present = champsPedago(mols);
    const raw = (cfg && cfg.champs) || [];
    if (!raw.length) return present;
    const set = {};
    present.forEach(function (c) { set[c] = true; });
    return raw.filter(function (c) { return set[c]; });
  }

  function sensList(sens) {
    if (sens === 'valeur_vers_mol') return ['valeur_vers_mol'];
    if (sens === 'les_deux') return ['mol_vers_valeur', 'valeur_vers_mol'];
    return ['mol_vers_valeur'];
  }

  function nomsOf(mol) {
    return ((mol && mol.noms) || []).filter(Boolean);
  }

  function pickDistractors(cands, bonne, need, plafond) {
    const pool = shuffle(uniqueNorm(cands).filter(function (t) {
      return normQuiz(t) && normQuiz(t) !== normQuiz(bonne);
    }));
    const out = [];
    for (let i = 0; i < pool.length && out.length < need; i += 1) {
      if (acceptableDistracteur(pool[i], bonne, out, plafond)) out.push(pool[i]);
    }
    return out;
  }

  function qAutoMol(mol, code, valeur, dist, nbProp) {
    const props = shuffle(
      [{ texte: valeur, est_correcte: true }].concat(
        dist.map(function (t) { return { texte: t, est_correcte: false }; })
      )
    ).slice(0, nbProp);
    return {
      id: uid(),
      source: 'auto',
      sens: 'mol_vers_valeur',
      champ_code: code,
      dci: mol.dci || '',
      noms: nomsOf(mol),
      enonce: champLabel(code) + ' · ' + (mol.dci || ''),
      titre: mol.dci || champLabel(code),
      legende: nomsOf(mol).join(' · '),
      propositions: props,
    };
  }

  function qAutoVal(mol, code, valeur, dist, nbProp) {
    const props = shuffle(
      [{ texte: mol.dci, est_correcte: true }].concat(
        dist.map(function (t) { return { texte: t, est_correcte: false }; })
      )
    ).slice(0, nbProp);
    return {
      id: uid(),
      source: 'auto',
      sens: 'valeur_vers_mol',
      champ_code: code,
      dci: '',
      noms: [],
      enonce: champLabel(code) + ' : ' + valeur,
      titre: valeur,
      legende: '',
      propositions: props,
    };
  }

  function tryMolVersValeur(mol, code, mols, need, plafond, nbProp) {
    const own = uniqueNorm(vals(mol, code));
    if (!own.length) return null;
    const ownN = {};
    own.forEach(function (t) { ownN[normQuiz(t)] = true; });
    const pool = [];
    (mols || []).forEach(function (o) {
      if (o.id === mol.id) return;
      vals(o, code).forEach(function (t) {
        if (!ownN[normQuiz(t)]) pool.push(t);
      });
    });
    const ordered = shuffle(own);
    for (let i = 0; i < ordered.length; i += 1) {
      const bonne = ordered[i];
      const dist = pickDistractors(pool, bonne, need, plafond);
      if (dist.length >= need) return qAutoMol(mol, code, bonne, dist, nbProp);
    }
    return null;
  }

  function tryValeurVersMol(mol, code, valeur, mols, need, plafond, nbProp) {
    if (!mol.dci) return null;
    const dcis = [];
    (mols || []).forEach(function (o) {
      if (o.id === mol.id) return;
      if (!o.dci) return;
      if (hasVal(o, code, valeur)) return;
      dcis.push(o.dci);
    });
    const dist = pickDistractors(dcis, mol.dci, need, plafond);
    if (dist.length < need) return null;
    return qAutoVal(mol, code, valeur, dist, nbProp);
  }

  function genererAuto(mols, cfg, target) {
    const list = mols || [];
    const nWant = Math.max(0, Number(target) || 0);
    const questions = [];
    let sautees = 0;
    if (!nWant || !list.length) return { questions: questions, sautees: sautees };
    const nbProp = clamp(cfg.nb_propositions, 2, 6, 4);
    const need = nbProp - 1;
    const plaf = plafondDiff(cfg.difficulte);
    const champs = champsActifs(cfg, list);
    const sens = sensList(cfg.sens);
    if (!champs.length) return { questions: questions, sautees: sautees };

    const cands = [];
    list.forEach(function (mol) {
      champs.forEach(function (code) {
        const v = uniqueNorm(vals(mol, code));
        if (!v.length) return;
        if (sens.indexOf('mol_vers_valeur') >= 0) {
          cands.push({ sens: 'mol_vers_valeur', mol: mol, code: code });
        }
        if (sens.indexOf('valeur_vers_mol') >= 0) {
          v.forEach(function (val) {
            cands.push({ sens: 'valeur_vers_mol', mol: mol, code: code, valeur: val });
          });
        }
      });
    });

    const used = {};
    shuffle(cands).forEach(function (c) {
      if (questions.length >= nWant) return;
      const key = c.sens === 'mol_vers_valeur'
        ? 'm|' + c.mol.id + '|' + c.code
        : 'v|' + c.code + '|' + normQuiz(c.valeur);
      if (used[key]) return;
      used[key] = true;
      const q = c.sens === 'mol_vers_valeur'
        ? tryMolVersValeur(c.mol, c.code, list, need, plaf, nbProp)
        : tryValeurVersMol(c.mol, c.code, c.valeur, list, need, plaf, nbProp);
      if (q) questions.push(q);
      else sautees += 1;
    });
    return { questions: questions, sautees: sautees };
  }

  function emptyProp(correct) {
    return { id: uid(), texte: '', est_correcte: !!correct };
  }

  function emptyQuestion(nbProp) {
    const n = clamp(nbProp, 2, 6, 4);
    const props = [];
    for (let i = 0; i < n; i += 1) props.push(emptyProp(i === 0));
    return { id: uid(), enonce: '', propositions: props };
  }

  function normProp(p, correct) {
    if (typeof p === 'string') {
      const t = p;
      return { id: uid(), texte: t, est_correcte: correct != null && t === correct };
    }
    return {
      id: (p && p.id) || uid(),
      texte: (p && p.texte) || '',
      est_correcte: !!(p && p.est_correcte),
    };
  }

  function normQuestion(q) {
    q = q || {};
    const correct = q.correct;
    let props = Array.isArray(q.propositions) ? q.propositions.map(function (p) {
      return normProp(p, correct);
    }) : [];
    if (correct && props.length && !props.some(function (p) { return p.est_correcte; })) {
      props.forEach(function (p) { p.est_correcte = p.texte === correct; });
    }
    if (props.length < 2) {
      while (props.length < 2) props.push(emptyProp(props.length === 0));
    }
    return {
      id: q.id || uid(),
      enonce: q.enonce || q.question || '',
      propositions: props,
    };
  }

  function questionOk(q) {
    if (!q || !String(q.enonce || '').trim()) return false;
    const props = (q.propositions || []).filter(function (p) { return String(p.texte || '').trim(); });
    if (props.length < 2) return false;
    return props.some(function (p) { return p.est_correcte; });
  }

  function playFromManuel(q) {
    const props = shuffle(
      (q.propositions || [])
        .filter(function (p) { return String(p.texte || '').trim(); })
        .map(function (p) {
          return { texte: String(p.texte).trim(), est_correcte: !!p.est_correcte };
        })
    );
    const enonce = String(q.enonce || '').trim();
    return {
      id: q.id || uid(),
      source: 'manuel',
      champ_code: null,
      dci: '',
      noms: [],
      enonce: enonce,
      titre: enonce,
      legende: '',
      propositions: props,
    };
  }

  function tirerQuestions(cfg, mols) {
    const style = cfg.style;
    let manuelles = [];
    let auto = { questions: [], sautees: 0 };
    if (style === 'manuel' || style === 'mixte') {
      const bank = (cfg.questions || []).filter(questionOk);
      const n = style === 'mixte' ? cfg.nb_manuelles : cfg.nb_questions;
      manuelles = sample(bank, n).map(playFromManuel);
    }
    if (style === 'auto' || style === 'mixte') {
      const n = style === 'mixte' ? cfg.nb_auto : cfg.nb_questions;
      auto = genererAuto(mols || [], cfg, n);
    }
    return {
      questions: shuffle(manuelles.concat(auto.questions)),
      sautees: auto.sautees,
    };
  }

  function snapshotOf(questions) {
    return {
      questions: (questions || []).map(function (q) {
        const correct = (q.propositions || []).filter(function (p) { return p.est_correcte; })[0];
        return {
          id: q.id,
          enonce: q.enonce || q.titre || '',
          champ_code: q.champ_code || null,
          dci: q.dci || '',
          noms: q.noms || [],
          titre: q.titre || '',
          legende: q.legende || '',
          propositions: (q.propositions || []).map(function (p) {
            return { texte: p.texte, est_correcte: !!p.est_correcte };
          }),
          correct: correct ? correct.texte : '',
        };
      }),
    };
  }

  function defaults() {
    return {
      style: 'manuel',
      nb_questions: 10,
      nb_manuelles: 5,
      nb_auto: 5,
      nb_propositions: 4,
      sens: 'mol_vers_valeur',
      difficulte: 1,
      champs: [],
      questions: [],
      openId: null,
    };
  }

  function ensure(cfg) {
    const d = defaults();
    if (!cfg || typeof cfg !== 'object') return d;
    Object.keys(d).forEach(function (k) {
      if (cfg[k] == null) cfg[k] = d[k];
    });
    cfg.style = STYLES.indexOf(cfg.style) >= 0 ? cfg.style : 'manuel';
    cfg.sens = SENS.indexOf(cfg.sens) >= 0 ? cfg.sens : 'mol_vers_valeur';
    cfg.nb_questions = clamp(cfg.nb_questions, 1, 50, 10);
    cfg.nb_manuelles = clamp(cfg.nb_manuelles, 0, 50, 5);
    cfg.nb_auto = clamp(cfg.nb_auto, 0, 50, 5);
    cfg.nb_propositions = clamp(cfg.nb_propositions, 2, 6, 4);
    cfg.difficulte = clamp(cfg.difficulte, 1, 3, 1);
    if (!Array.isArray(cfg.champs)) cfg.champs = [];
    if (!Array.isArray(cfg.questions)) cfg.questions = [];
    cfg.questions = cfg.questions.map(normQuestion);
    return cfg;
  }

  function fromConfig(raw) {
    if (!raw || typeof raw !== 'object') return defaults();
    return ensure({
      style: raw.style,
      nb_questions: raw.nb_questions,
      nb_manuelles: raw.nb_manuelles,
      nb_auto: raw.nb_auto,
      nb_propositions: raw.nb_propositions,
      sens: raw.sens_auto || raw.sens,
      difficulte: raw.difficulte,
      champs: Array.isArray(raw.champs) ? raw.champs.filter(Boolean) : [],
      questions: Array.isArray(raw.questions) ? raw.questions : [],
      openId: null,
    });
  }

  function payload(ctx) {
    const c = ensure(ctx.cfg);
    return {
      quiz: {
        style: c.style,
        nb_questions: c.nb_questions,
        nb_manuelles: c.nb_manuelles,
        nb_auto: c.nb_auto,
        nb_propositions: c.nb_propositions,
        sens_auto: c.sens,
        difficulte: c.difficulte,
        champs: (c.champs || []).filter(Boolean),
        questions: (c.questions || []).map(function (q) {
          return {
            enonce: String(q.enonce || '').trim(),
            propositions: (q.propositions || [])
              .map(function (p) {
                return {
                  texte: String(p.texte || '').trim(),
                  est_correcte: !!p.est_correcte,
                };
              })
              .filter(function (p) { return p.texte; }),
          };
        }),
      },
    };
  }

  function validate(ctx) {
    const c = ensure(ctx.cfg);
    const msgs = [];
    const style = c.style;
    if (style === 'manuel' || style === 'mixte') {
      const bank = c.questions || [];
      if (style === 'manuel' && !bank.length) msgs.push('Banque vide');
      if (style === 'mixte' && c.nb_manuelles > 0 && !bank.length) msgs.push('Banque vide');
      bank.forEach(function (q, i) {
        const n = i + 1;
        if (!String(q.enonce || '').trim()) msgs.push('Question ' + n + ' : énoncé vide');
        const props = (q.propositions || []).filter(function (p) {
          return String(p.texte || '').trim();
        });
        if (props.length < 2) msgs.push('Question ' + n + ' : moins de 2 propositions');
        else if (!props.some(function (p) { return p.est_correcte; })) {
          msgs.push('Question ' + n + ' : pas de bonne réponse');
        }
      });
    }
    if (style === 'mixte' && (c.nb_manuelles + c.nb_auto) < 1) msgs.push('Total 0');
    if (style === 'auto' || style === 'mixte') {
      if (ctx._quizMols && !ctx._quizMols.length) msgs.push('Pool vide');
      const mols = ctx._quizMols || [];
      if (c._champsTouche && !(c.champs || []).length) msgs.push('Aucun champ');
      else if (mols.length && !champsActifs(c, mols).length) msgs.push('Aucun champ');
    }
    return msgs;
  }

  function goStep1() {
    const btn = document.querySelector('.v3-stepper li:first-child button');
    if (btn) btn.click();
  }

  function autosize(ta) {
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.max(40, ta.scrollHeight) + 'px';
  }

  function iconBtn(lab, title, onClick) {
    return h('button', {
      type: 'button',
      class: 'v3-btn v3-btn-ghost v3-quiz-ico',
      title: title,
      'aria-label': title,
      onClick: onClick,
    }, lab);
  }

  function bonneTexte(q) {
    const p = (q.propositions || []).filter(function (x) { return x.est_correcte; })[0];
    return p ? p.texte : '';
  }

  function renderQuestionView(q, opts) {
    opts = opts || {};
    const kids = [];
    if (q.champ_code) {
      kids.push(h('span', { class: 'v3-quiz-badge' }, champCourt(q.champ_code)));
    }
    kids.push(h('h2', null, q.titre || q.enonce || '—'));
    if (q.legende) kids.push(h('p', { class: 'v3-quiz-noms' }, q.legende));
    const props = h('div', { class: 'v3-props' });
    (q.propositions || []).forEach(function (p, i) {
      const cls = ['v3-prop'];
      if (opts.reveal) {
        if (p.est_correcte) cls.push('is-ok');
        if (opts.choix === p.texte && !p.est_correcte) cls.push('is-bad');
      } else if (opts.choix === p.texte) cls.push('is-on');
      props.appendChild(h('button', {
        type: 'button',
        class: cls.join(' '),
        disabled: !!opts.disabled,
        dataset: { i: String(i) },
        onClick: opts.onPick ? function () { opts.onPick(i); } : undefined,
      }, p.texte || '—'));
    });
    kids.push(props);
    return h('div', { class: 'v3-play-q v3-quiz-q' }, kids);
  }

  function paintTirage(host, pack) {
    const qs = pack.questions || [];
    if (!qs.length) {
      host.replaceChildren(U.empty('Aucun tirage'), pack.sautees
        ? h('p', { class: 'v3-muted' }, pack.sautees + ' sautée' + (pack.sautees > 1 ? 's' : ''))
        : null);
      return;
    }
    const ol = h('ol', { class: 'v3-quiz-tirage' });
    qs.forEach(function (q) {
      const props = h('div', { class: 'v3-quiz-tirage-props' });
      (q.propositions || []).forEach(function (p) {
        props.appendChild(h('span', {
          class: p.est_correcte ? 'v3-quiz-tirage-ok' : '',
        }, (p.est_correcte ? '✓ ' : '') + (p.texte || '—')));
      });
      ol.appendChild(h('li', null,
        h('div', null, q.enonce || q.titre || '—'),
        props
      ));
    });
    const meta = h('p', { class: 'v3-muted' },
      qs.length + ' question' + (qs.length > 1 ? 's' : '')
      + (pack.sautees ? ' · ' + pack.sautees + ' sautée' + (pack.sautees > 1 ? 's' : '') : '')
    );
    host.replaceChildren(meta, ol);
  }

  function runTest(ctx, host) {
    host.replaceChildren(U.empty('…'));
    ctx.mols().then(function (mols) {
      ctx._quizMols = mols;
      ctx.changed();
      const cfg = ensure(ctx.cfg);
      const n = cfg.style === 'mixte' ? cfg.nb_auto : cfg.nb_questions;
      paintTirage(host, genererAuto(mols, cfg, n));
    }).catch(function (e) {
      host.replaceChildren(U.empty(e.message || 'Erreur'));
    });
  }

  function params(el, ctx) {
    const cfg = ensure(ctx.cfg);
    const rowNbQ = U.field('Questions', U.number(cfg.nb_questions, {
      min: 1, max: 50, label: 'Questions',
      onChange: function (v) { cfg.nb_questions = v; ctx.changed(); },
    }));
    const totalEl = h('span', { class: 'v3-quiz-total' });
    function paintTotal() {
      totalEl.textContent = 'Total ' + (cfg.nb_manuelles + cfg.nb_auto);
    }
    paintTotal();
    const rowMixte = U.field('Mixte', h('div', { class: 'v3-row v3-quiz-mixte' },
      U.field('Manuelles', U.number(cfg.nb_manuelles, {
        min: 0, max: 50, label: 'Manuelles',
        onChange: function (v) { cfg.nb_manuelles = v; paintTotal(); ctx.changed(); },
      })),
      U.field('Auto', U.number(cfg.nb_auto, {
        min: 0, max: 50, label: 'Auto',
        onChange: function (v) { cfg.nb_auto = v; paintTotal(); ctx.changed(); },
      })),
      totalEl
    ), { col: true });

    const autoBox = h('div', { class: 'v3-quiz-auto' });
    const poolMsg = h('div', { class: 'v3-quiz-pool' });
    const autoFields = h('div', { class: 'v3-stack' });
    const champsHost = h('div');
    const testHost = h('div', { class: 'v3-quiz-test' });

    autoFields.append(
      U.field('Sens', U.segmented([
        { value: 'mol_vers_valeur', label: 'Molécule → valeur' },
        { value: 'valeur_vers_mol', label: 'Valeur → molécule' },
        { value: 'les_deux', label: 'Les deux' },
      ], cfg.sens, function (v) { cfg.sens = v; ctx.changed(); }), {
        tip: 'Direction des questions auto.',
      }),
      U.field('Difficulté', U.segmented([
        { value: 1, label: 'Niveau 1', tip: 'Plafond de similarité des distracteurs < 20 %.' },
        { value: 2, label: 'Niveau 2', tip: 'Plafond de similarité des distracteurs < 50 %.' },
        { value: 3, label: 'Niveau 3', tip: 'Plafond de similarité des distracteurs < 80 %.' },
      ], cfg.difficulte, function (v) {
        cfg.difficulte = Number(v);
        ctx.changed();
      })),
      U.field('Champs', champsHost, {
        col: true,
        tip: 'Hors identité. Défaut : tous présents.',
      }),
      U.button('Tester un tirage', {
        onClick: function () { runTest(ctx, testHost); },
      }),
      testHost
    );
    autoBox.append(poolMsg, autoFields);

    function syncStyle() {
      const s = cfg.style;
      rowNbQ.hidden = s === 'mixte';
      rowMixte.hidden = s !== 'mixte';
      autoBox.hidden = s === 'manuel';
    }

    let poolAsked = false;
    function ensurePool() {
      if (cfg.style === 'manuel' || poolAsked) return;
      poolAsked = true;
      poolMsg.replaceChildren(U.empty('…'));
      ctx.mols().then(paintPool).catch(function (e) {
        poolMsg.replaceChildren(U.empty(e.message || 'Erreur'));
      });
    }

    function paintChamps(mols) {
      const present = champsPedago(mols);
      if (!present.length) {
        champsHost.replaceChildren(U.empty('Aucun champ'));
        return;
      }
      const selected = (cfg.champs && cfg.champs.length) ? cfg.champs : present;
      const wrap = h('div', { class: 'v3-checks' });
      present.forEach(function (code) {
        const n = countChamp(mols, code);
        const on = selected.indexOf(code) >= 0;
        const box = h('input', { type: 'checkbox', checked: on, dataset: { code: code } });
        box.addEventListener('change', function () {
          cfg._champsTouche = true;
          cfg.champs = present.filter(function (c) {
            const elc = wrap.querySelector('[data-code="' + c + '"]');
            return elc && elc.checked;
          });
          ctx.changed();
        });
        wrap.appendChild(h('label', { class: 'v3-check' },
          box,
          h('span', null, champLabel(code)),
          h('span', { class: 'v3-quiz-n' }, String(n))
        ));
      });
      champsHost.replaceChildren(wrap);
    }

    function paintPool(mols) {
      ctx._quizMols = mols;
      if (!mols.length) {
        poolMsg.hidden = false;
        autoFields.hidden = true;
        poolMsg.replaceChildren(
          h('p', { class: 'v3-empty' }, 'Pool vide'),
          U.button('Étape 1', { variant: 'ghost', onClick: goStep1 })
        );
        ctx.changed();
        return;
      }
      poolMsg.hidden = true;
      autoFields.hidden = false;
      poolMsg.replaceChildren();
      paintChamps(mols);
      ctx.changed();
    }

    el.replaceChildren(
      U.field('Style', U.segmented([
        { value: 'manuel', label: 'Manuel', tip: 'Banque saisie.' },
        { value: 'auto', label: 'Auto', tip: 'Régénéré à chaque partie.' },
        { value: 'mixte', label: 'Mixte', tip: 'Banque + tirage.' },
      ], cfg.style, function (v) {
        cfg.style = v;
        syncStyle();
        ensurePool();
        ctx.changed();
      })),
      rowNbQ,
      rowMixte,
      U.field('Propositions', U.number(cfg.nb_propositions, {
        min: 2, max: 6, label: 'Propositions',
        onChange: function (v) { cfg.nb_propositions = v; ctx.changed(); },
      }), { tip: '2 à 6.' }),
      autoBox
    );
    syncStyle();
    ensurePool();
  }

  function perso(el, ctx) {
    const cfg = ensure(ctx.cfg);
    if (cfg.style === 'auto') {
      const host = h('div', { class: 'v3-quiz-test' });
      el.replaceChildren(
        U.button('Tester un tirage', { onClick: function () { runTest(ctx, host); } }),
        host
      );
      runTest(ctx, host);
      return;
    }

    const listEl = h('div', { class: 'v3-quiz-list' });
    const previewEl = h('div', { class: 'v3-quiz-preview' });

    function previewOf(q) {
      if (!q) {
        previewEl.replaceChildren(U.empty('—'));
        return;
      }
      previewEl.replaceChildren(renderQuestionView(playFromManuel(q), { disabled: true }));
    }

    function findQ(id) {
      return cfg.questions.filter(function (q) { return q.id === id; })[0] || null;
    }

    function paintHeaderBits(row, q) {
      const n = (q.propositions || []).filter(function (p) { return String(p.texte || '').trim(); }).length;
      const ok = (q.propositions || []).some(function (p) {
        return p.est_correcte && String(p.texte || '').trim();
      });
      row.querySelector('.v3-quiz-snip').textContent = (q.enonce || '').trim() || 'Sans énoncé';
      row.querySelector('.v3-quiz-meta').textContent = n + ' prop.' + (ok ? ' ✓' : '');
    }

    function paintProps(body, q) {
      const host = body.querySelector('.v3-quiz-props');
      host.replaceChildren();
      (q.propositions || []).forEach(function (p, pi) {
        const radio = h('input', {
          type: 'radio',
          name: 'v3-quiz-bonne-' + q.id,
          checked: !!p.est_correcte,
          'aria-label': 'Bonne réponse',
        });
        radio.addEventListener('change', function () {
          q.propositions.forEach(function (x, j) { x.est_correcte = j === pi; });
          ctx.changed();
          previewOf(q);
          const row = listEl.querySelector('[data-qid="' + q.id + '"]');
          if (row) paintHeaderBits(row, q);
        });
        const input = h('input', {
          type: 'text',
          class: 'v3-ctrl',
          value: p.texte,
          'aria-label': 'Proposition ' + (pi + 1),
        });
        input.addEventListener('input', function () {
          p.texte = input.value;
          ctx.changed();
          previewOf(q);
          const row = listEl.querySelector('[data-qid="' + q.id + '"]');
          if (row) paintHeaderBits(row, q);
        });
        input.addEventListener('keydown', function (ev) {
          if (ev.key !== 'Enter') return;
          ev.preventDefault();
          if (q.propositions.length >= 6) return;
          q.propositions.push(emptyProp(false));
          ctx.changed();
          paintProps(body, q);
          const inputs = body.querySelectorAll('.v3-quiz-prop-row input[type="text"]');
          const last = inputs[inputs.length - 1];
          if (last) last.focus();
        });
        const del = iconBtn('×', 'Retirer', function () {
          if (q.propositions.length <= 2) return;
          q.propositions.splice(pi, 1);
          ctx.changed();
          paintProps(body, q);
          previewOf(q);
        });
        del.disabled = q.propositions.length <= 2;
        host.appendChild(h('div', { class: 'v3-quiz-prop-row' }, radio, input, del));
      });
    }

    function openEditor(row, q) {
      const ta = h('textarea', {
        class: 'v3-quiz-enonce',
        'aria-label': 'Énoncé',
        rows: 2,
      });
      ta.value = q.enonce || '';
      ta.addEventListener('input', function () {
        q.enonce = ta.value;
        autosize(ta);
        ctx.changed();
        previewOf(q);
        paintHeaderBits(row, q);
      });
      const propsHost = h('div', { class: 'v3-quiz-props' });
      const add = U.button('+ Proposition', {
        variant: 'ghost',
        onClick: function () {
          if (q.propositions.length >= 6) return;
          q.propositions.push(emptyProp(false));
          ctx.changed();
          paintProps(body, q);
          const inputs = body.querySelectorAll('.v3-quiz-prop-row input[type="text"]');
          const last = inputs[inputs.length - 1];
          if (last) last.focus();
        },
      });
      const body = h('div', { class: 'v3-quiz-card' },
        U.field('Énoncé', ta, { col: true }),
        propsHost,
        add
      );
      row.appendChild(body);
      paintProps(body, q);
      autosize(ta);
      previewOf(q);
      if (cfg._focusEnonce) {
        cfg._focusEnonce = false;
        ta.focus();
      }
    }

    function paintList() {
      listEl.replaceChildren();
      if (!cfg.questions.length) {
        listEl.appendChild(U.empty('Banque vide'));
        previewOf(null);
        return;
      }
      cfg.questions.forEach(function (q, i) {
        const open = cfg.openId === q.id;
        const snip = h('span', { class: 'v3-quiz-snip' });
        const meta = h('span', { class: 'v3-quiz-meta' });
        const head = h('div', { class: 'v3-quiz-head' },
          h('div', { class: 'v3-quiz-head-txt' }, snip, meta),
          h('div', { class: 'v3-quiz-acts' },
            U.button(open ? 'Fermer' : 'Modifier', {
              variant: 'ghost',
              onClick: function () {
                cfg.openId = open ? null : q.id;
                ctx.changed();
                paintList();
              },
            }),
            U.button('Dupliquer', {
              variant: 'ghost',
              onClick: function () {
              const copy = normQuestion({
                enonce: q.enonce,
                propositions: (q.propositions || []).map(function (p) {
                  return { texte: p.texte, est_correcte: p.est_correcte };
                }),
              });
              cfg.questions.splice(i + 1, 0, copy);
              cfg.openId = copy.id;
              cfg._focusEnonce = true;
              ctx.changed();
              paintList();
            }}),
            U.button('Supprimer', {
              variant: 'ghost',
              onClick: function () {
              U.confirm('Supprimer ?').then(function (ok) {
                if (!ok) return;
                cfg.questions.splice(i, 1);
                if (cfg.openId === q.id) cfg.openId = null;
                ctx.changed();
                paintList();
              });
            }}),
            iconBtn('↑', 'Monter', function () {
              if (i === 0) return;
              const t = cfg.questions[i - 1];
              cfg.questions[i - 1] = cfg.questions[i];
              cfg.questions[i] = t;
              ctx.changed();
              paintList();
            }),
            iconBtn('↓', 'Descendre', function () {
              if (i >= cfg.questions.length - 1) return;
              const t = cfg.questions[i + 1];
              cfg.questions[i + 1] = cfg.questions[i];
              cfg.questions[i] = t;
              ctx.changed();
              paintList();
            })
          )
        );
        const row = h('div', {
          class: 'v3-quiz-item' + (open ? ' is-open' : ''),
          dataset: { qid: q.id },
        }, head);
        paintHeaderBits(row, q);
        listEl.appendChild(row);
        if (open) openEditor(row, q);
      });
      previewOf(findQ(cfg.openId));
    }

    function addQuestion(q) {
      cfg.questions.push(q);
      cfg.openId = q.id;
      cfg._focusEnonce = true;
      ctx.changed();
      paintList();
    }

    const bar = h('div', { class: 'v3-row' },
      U.button('+ Question', {
        variant: 'primary',
        onClick: function () { addQuestion(emptyQuestion(cfg.nb_propositions)); },
      }),
      U.button('Depuis une molécule', {
        variant: 'ghost',
        onClick: function () {
          ctx.mols().then(function (mols) {
            ctx._quizMols = mols;
            const pack = genererAuto(mols, cfg, 1);
            const src = pack.questions[0];
            if (!src) {
              U.toast('Aucun tirage', 'err');
              return;
            }
            addQuestion(normQuestion({
              enonce: src.enonce,
              propositions: src.propositions,
            }));
          }).catch(function (e) {
            U.toast(e.message || 'Erreur', 'err');
          });
        },
      })
    );

    el.replaceChildren(
      bar,
      h('div', { class: 'v3-quiz-perso' }, listEl, previewEl)
    );
    paintList();
  }

  function recapFailed(questions, answers) {
    const ul = h('ul', { class: 'v3-quiz-recap' });
    let n = 0;
    questions.forEach(function (q, i) {
      const a = answers[i];
      if (!a || a.ok) return;
      n += 1;
      ul.appendChild(h('li', null,
        h('div', null, q.enonce || q.titre || '—'),
        h('div', { class: 'v3-muted' }, 'Bonne réponse : ' + (a.correct || '—'))
      ));
    });
    if (!n) return U.empty('Tout juste');
    return ul;
  }

  function runPlay(el, questions, session, tentativeId) {
    let idx = 0;
    const answers = [];
    const progress = h('p', { class: 'v3-play-progress' });
    const qHost = h('div');
    const fb = h('p', { class: 'v3-quiz-fb', hidden: true });
    const acts = h('div', { class: 'v3-actions' });
    const root = h('div', { class: 'v3-quiz-play', tabindex: '0' }, progress, qHost, fb, acts);
    el.replaceChildren(root);

    let answered = false;
    let choix = null;
    let keyHandler = null;

    function current() {
      return questions[idx];
    }

    function stripKeys() {
      if (keyHandler) {
        document.removeEventListener('keydown', keyHandler);
        keyHandler = null;
      }
    }

    function finish() {
      stripKeys();
      const details = answers.map(function (a, i) {
        return {
          id: questions[i].id,
          ok: a.ok,
          reponse: a.choix,
          correct: a.correct,
        };
      });
      const obtenu = details.filter(function (d) { return d.ok; }).length;
      el.replaceChildren(
        h('div', { class: 'v3-quiz-end' },
          recapFailed(questions, answers)
        )
      );
      if (!session.reel) {
        session.fin({ obtenu: obtenu, max: questions.length, details: details });
        return;
      }
      const reponses = {};
      answers.forEach(function (a, i) { reponses[questions[i].id] = a.choix || ''; });
      session.rpc('jeu_soumettre_quiz', {
        p_tentative_id: tentativeId,
        p_reponses: reponses,
      }).then(function (res) {
        session.fin({
          obtenu: Number(res.score_obtenu),
          max: Number(res.score_max),
          details: res.details || details,
        });
      }).catch(function (e) {
        U.toast(e.message || 'Erreur', 'err');
        session.fin({ obtenu: obtenu, max: questions.length, details: details });
      });
    }

    function paint() {
      const q = current();
      if (!q) { finish(); return; }
      answered = false;
      choix = null;
      progress.textContent = (idx + 1) + ' / ' + questions.length;
      fb.hidden = true;
      fb.textContent = '';
      fb.className = 'v3-quiz-fb';
      acts.replaceChildren();
      qHost.replaceChildren(renderQuestionView(q, {
        onPick: function (i) { pick(i); },
      }));
    }

    function pick(i) {
      if (answered) return;
      const q = current();
      const p = (q.propositions || [])[i];
      if (!p) return;
      answered = true;
      choix = p.texte;
      const correct = bonneTexte(q);
      const ok = normQuiz(choix) === normQuiz(correct);
      answers.push({ choix: choix, ok: ok, correct: correct });
      fb.hidden = false;
      fb.textContent = ok ? 'Juste' : 'Faux';
      fb.className = 'v3-quiz-fb ' + (ok ? 'is-ok' : 'is-bad');
      qHost.replaceChildren(renderQuestionView(q, {
        disabled: true,
        reveal: true,
        choix: choix,
      }));
      acts.replaceChildren(U.button('Suivant', {
        variant: 'primary',
        onClick: next,
      }));
    }

    function next() {
      if (!answered) return;
      idx += 1;
      if (idx >= questions.length) finish();
      else paint();
    }

    keyHandler = function (ev) {
      if (!el.isConnected) { stripKeys(); return; }
      const tag = ev.target && ev.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (ev.key === 'Enter' && answered) {
        ev.preventDefault();
        next();
        return;
      }
      const n = ev.key >= '1' && ev.key <= '6' ? Number(ev.key) : 0;
      if (n) pick(n - 1);
    };
    document.addEventListener('keydown', keyHandler);
    paint();
  }

  function play(el, ctx, session) {
    const cfg = ensure(ctx.cfg);
    el.replaceChildren(U.empty('…'));
    const needPool = cfg.style === 'auto' || cfg.style === 'mixte';
    const pMols = needPool ? ctx.mols() : Promise.resolve([]);
    pMols.then(function (mols) {
      ctx._quizMols = mols;
      ctx.changed();
      const pack = tirerQuestions(cfg, mols);
      if (!pack.questions.length) {
        el.replaceChildren(U.empty('Aucune question'));
        return;
      }
      const snap = snapshotOf(pack.questions);
      if (!session.reel) {
        runPlay(el, pack.questions, session, null);
        return;
      }
      session.rpc('jeu_demarrer_quiz', {
        p_jeu_id: session.jeu.id,
        p_snapshot: snap,
        p_contexte: 'classique',
        p_passage_id: null,
      }).then(function (res) {
        runPlay(el, pack.questions, session, res && res.tentative_id);
      }).catch(function (e) {
        el.replaceChildren(U.empty(e.message || 'Erreur'));
      });
    }).catch(function (e) {
      el.replaceChildren(U.empty(e.message || 'Erreur'));
    });
  }

  const pures = {
    normQuiz: normQuiz,
    similarite: similarite,
    plafondDiff: plafondDiff,
    acceptableDistracteur: acceptableDistracteur,
    genererAuto: genererAuto,
    tirerQuestions: tirerQuestions,
    questionOk: questionOk,
    snapshotOf: snapshotOf,
    fromConfig: fromConfig,
    defaults: defaults,
  };

  if (global.V3Games) {
    global.V3Games.register('quiz', {
      label: 'Quiz',
      tip: 'QCM, une bonne réponse.',
      pool: true,
      defaults: defaults,
      fromConfig: fromConfig,
      params: params,
      perso: perso,
      play: play,
      validate: validate,
      payload: payload,
    });
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = pures;
})(typeof window !== 'undefined' ? window : globalThis);
