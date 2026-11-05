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

  /** Molécules utilisables en jeu (publications visibles, pas « vide »). */
  function poolMols(mols) {
    return (mols || []).filter(function (m) { return m && !m.vide; });
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
    if (!mol || mol.vide) return [];
    const meta = champMeta(code);
    const identite = meta.identite || code === 'dci' || code === 'nom_commercial';
    if (mol.source === 'complet' && !identite) return [];
    if (C && C.valeurs) return C.valeurs(mol, code);
    if (!mol.valeurs) return [];
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
      type: 'qcu',
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
      type: 'qcu',
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

  function pickDistractorsMulti(cands, bonnes, need, plafond) {
    const ban = {};
    (bonnes || []).forEach(function (t) { ban[normQuiz(t)] = true; });
    const pool = shuffle(uniqueNorm(cands).filter(function (t) { return !ban[normQuiz(t)]; }));
    const out = [];
    for (let i = 0; i < pool.length && out.length < need; i += 1) {
      let ok = true;
      for (let j = 0; j < (bonnes || []).length; j += 1) {
        if (!acceptableDistracteur(pool[i], bonnes[j], out, plafond)) {
          ok = false;
          break;
        }
      }
      if (ok) out.push(pool[i]);
    }
    return out;
  }

  function qAutoMolQcm(mol, code, bonnes, dist, nbProp) {
    const props = shuffle(
      (bonnes || []).map(function (t) { return { texte: t, est_correcte: true }; }).concat(
        (dist || []).map(function (t) { return { texte: t, est_correcte: false }; })
      )
    ).slice(0, nbProp);
    const lab = champLabel(code);
    const dci = mol.dci || '';
    const enonce = lab && dci
      ? 'Quelles sont les ' + lab.toLowerCase() + ' de ' + dci + ' ?'
      : (lab || dci);
    return {
      id: uid(),
      source: 'auto',
      type: 'qcm',
      sens: 'mol_vers_valeur',
      champ_code: code,
      dci: dci,
      noms: nomsOf(mol),
      enonce: enonce,
      titre: dci || lab,
      legende: nomsOf(mol).join(' · '),
      propositions: props,
    };
  }

  function tryMolVersValeurQcm(mol, code, mols, plafond, nbProp) {
    const own = uniqueNorm(vals(mol, code));
    if (own.length < 2) return null;
    const nCorrect = Math.min(own.length, nbProp - 1);
    if (nCorrect < 2) return null;
    const chosen = sample(own, nCorrect);
    const ownN = {};
    own.forEach(function (t) { ownN[normQuiz(t)] = true; });
    const pool = [];
    (mols || []).forEach(function (o) {
      if (o.id === mol.id) return;
      vals(o, code).forEach(function (t) {
        if (!ownN[normQuiz(t)]) pool.push(t);
      });
    });
    const nDist = nbProp - chosen.length;
    if (nDist < 1) return null;
    const dist = pickDistractorsMulti(pool, chosen, nDist, plafond);
    if (dist.length < nDist) return null;
    return qAutoMolQcm(mol, code, chosen, dist, nbProp);
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
    const list = poolMols(mols);
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
      let q = null;
      if (c.sens === 'mol_vers_valeur') {
        if (cfg.auto_qcm) q = tryMolVersValeurQcm(c.mol, c.code, list, plaf, nbProp);
        if (!q) q = tryMolVersValeur(c.mol, c.code, list, need, plaf, nbProp);
      } else {
        q = tryValeurVersMol(c.mol, c.code, c.valeur, list, need, plaf, nbProp);
      }
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
    return { id: uid(), type: 'qcu', enonce: '', propositions: props };
  }

  function countCorrect(q) {
    return (q && q.propositions || []).filter(function (p) {
      return p.est_correcte && String(p.texte || '').trim();
    }).length;
  }

  function questionType(q) {
    if (q && q.type === 'qcm') return 'qcm';
    if (q && q.type === 'qcu') return 'qcu';
    return countCorrect(q) > 1 ? 'qcm' : 'qcu';
  }

  function setQuestionType(q, type) {
    q.type = type === 'qcm' ? 'qcm' : 'qcu';
    if (q.type !== 'qcu') return;
    let keep = false;
    (q.propositions || []).forEach(function (p) {
      if (p.est_correcte && !keep) {
        keep = true;
        return;
      }
      p.est_correcte = false;
    });
    if (!keep && q.propositions && q.propositions[0]) q.propositions[0].est_correcte = true;
  }

  function correctsOf(q) {
    return (q && q.propositions || [])
      .filter(function (p) { return p.est_correcte && String(p.texte || '').trim(); })
      .map(function (p) { return String(p.texte).trim(); });
  }

  function joinSet(list) {
    return uniqueNorm(list).slice().sort(function (a, b) {
      const na = normQuiz(a);
      const nb = normQuiz(b);
      if (na < nb) return -1;
      if (na > nb) return 1;
      return 0;
    }).join(' | ');
  }

  function setsEqual(a, b) {
    return joinSet(a) === joinSet(b);
  }

  function scoreReponse(type, chosen, corrects, mode) {
    if (type !== 'qcm') {
      const c = Array.isArray(chosen) ? chosen[0] : chosen;
      return (corrects || []).indexOf(c) >= 0 ? 1 : 0;
    }
    const pick = Array.isArray(chosen) ? chosen : (chosen ? [chosen] : []);
    if (setsEqual(pick, corrects)) return 1;
    if (mode !== 'detaille') return 0;
    const ban = {};
    corrects.forEach(function (t) { ban[normQuiz(t)] = true; });
    const hit = pick.some(function (t) { return ban[normQuiz(t)]; });
    return hit ? 0.5 : 0;
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
      const parts = String(correct).split(' | ');
      props.forEach(function (p) {
        p.est_correcte = p.texte === correct || parts.indexOf(p.texte) >= 0;
      });
    }
    if (props.length < 2) {
      while (props.length < 2) props.push(emptyProp(props.length === 0));
    }
    const out = {
      id: q.id || uid(),
      type: questionType({ type: q.type, propositions: props }),
      enonce: q.enonce || q.question || '',
      propositions: props,
    };
    if (out.type === 'qcu') setQuestionType(out, 'qcu');
    return out;
  }

  function questionOk(q) {
    if (!q || !String(q.enonce || '').trim()) return false;
    const props = (q.propositions || []).filter(function (p) { return String(p.texte || '').trim(); });
    if (props.length < 2) return false;
    const nOk = countCorrect(q);
    if (questionType(q) === 'qcm') return nOk >= 2;
    return nOk >= 1;
  }

  function playFromManuel(q) {
    const type = questionType(q);
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
      type: type,
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
    const list = poolMols(mols);
    let manuelles = [];
    let auto = { questions: [], sautees: 0 };
    if (style === 'manuel' || style === 'mixte') {
      const bank = (cfg.questions || []).filter(questionOk);
      const n = style === 'mixte' ? cfg.nb_manuelles : cfg.nb_questions;
      manuelles = sample(bank, n).map(playFromManuel);
    }
    if (style === 'auto' || style === 'mixte') {
      const n = style === 'mixte' ? cfg.nb_auto : cfg.nb_questions;
      auto = genererAuto(list, cfg, n);
    }
    return {
      questions: shuffle(manuelles.concat(auto.questions)),
      sautees: auto.sautees,
    };
  }

  function snapshotOf(questions) {
    return {
      questions: (questions || []).map(function (q) {
        const type = questionType(q);
        const corrects = correctsOf(q);
        return {
          id: q.id,
          type: type,
          enonce: q.enonce || q.titre || '',
          champ_code: q.champ_code || null,
          dci: q.dci || '',
          noms: q.noms || [],
          titre: q.titre || '',
          legende: q.legende || '',
          propositions: (q.propositions || []).map(function (p) {
            return { texte: p.texte, est_correcte: !!p.est_correcte };
          }),
          corrects: corrects,
          correct: type === 'qcm' ? joinSet(corrects) : (corrects[0] || ''),
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
      auto_qcm: false,
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
    cfg.auto_qcm = !!cfg.auto_qcm;
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
      auto_qcm: raw.auto_qcm === true,
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
        auto_qcm: !!c.auto_qcm,
        sens_auto: c.sens,
        difficulte: c.difficulte,
        champs: (c.champs || []).filter(Boolean),
        questions: (c.questions || []).map(function (q) {
          return {
            type: questionType(q),
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
        else if (questionType(q) === 'qcm' && countCorrect(q) < 2) {
          msgs.push('Question ' + n + ' : QCM sans 2 bonnes réponses');
        } else if (!props.some(function (p) { return p.est_correcte; })) {
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
    return correctsOf(q).join(' · ');
  }

  function paintTirage(host, pack) {
    const qs = pack.questions || [];
    if (!qs.length) {
      host.replaceChildren.apply(host, [
        U.empty('Aucun tirage'),
        pack.sautees
          ? h('p', { class: 'v3-muted' }, pack.sautees + ' sautée' + (pack.sautees > 1 ? 's' : ''))
          : null,
      ].filter(Boolean));
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
        h('div', { class: 'v3-row' },
          U.badge(questionType(q) === 'qcm' ? 'QCM' : 'QCU'),
          h('span', null, q.enonce || q.titre || '—')
        ),
        props
      ));
    });
    const meta = h('p', { class: 'v3-muted' },
      qs.length + ' question' + (qs.length > 1 ? 's' : '')
      + (pack.sautees ? ' · ' + pack.sautees + ' sautée' + (pack.sautees > 1 ? 's' : '') : '')
    );
    host.replaceChildren(meta, ol);
  }

  function runTiragePreview(ctx, host) {
    host.replaceChildren(U.empty('…'));
    ctx.mols().then(function (mols) {
      const playable = poolMols(mols);
      ctx._quizMols = playable;
      ctx.changed();
      paintTirage(host, tirerQuestions(ensure(ctx.cfg), playable));
    }).catch(function (e) {
      host.replaceChildren(U.empty(e.message || 'Erreur'));
    });
  }

  function params(el, ctx) {
    const cfg = ensure(ctx.cfg);
    const counts = h('div', { class: 'v3-stack' });
    const rowNbQ = U.field('Questions', U.number(cfg.nb_questions, {
      min: 1, max: 50, label: 'Questions',
      onChange: function (v) { cfg.nb_questions = v; ctx.changed(); },
    }), { tip: 'Nombre de questions par partie.' });
    const totalEl = h('p', { class: 'v3-quiz-total' });
    function paintTotal() {
      totalEl.textContent = 'Total ' + (cfg.nb_manuelles + cfg.nb_auto);
    }
    const mixteGrid = U.grid(2,
      U.field('Personnalisées', U.number(cfg.nb_manuelles, {
        min: 0, max: 50, label: 'Personnalisées',
        onChange: function (v) { cfg.nb_manuelles = v; paintTotal(); ctx.changed(); },
      }), { tip: 'Questions tirées dans la banque.' }),
      U.field('Automatiques', U.number(cfg.nb_auto, {
        min: 0, max: 50, label: 'Automatiques',
        onChange: function (v) { cfg.nb_auto = v; paintTotal(); ctx.changed(); },
      }), { tip: 'Questions générées à chaque partie.' })
    );

    const autoCard = U.card('Quiz automatique',
      U.grid(2,
        U.field('Propositions', U.number(cfg.nb_propositions, {
          min: 2, max: 6, label: 'Propositions',
          onChange: function (v) { cfg.nb_propositions = v; ctx.changed(); },
        }), { tip: 'Nombre de réponses proposées (2 à 6).' }),
        U.field('Type', U.segmented([
          { value: 'qcu', label: 'Choix unique', tip: 'Une bonne réponse par question.' },
          { value: 'qcm', label: 'Choix multiples', tip: 'Toutes les valeurs du champ (ex. indications de X).' },
        ], cfg.auto_qcm ? 'qcm' : 'qcu', function (v) {
          cfg.auto_qcm = v === 'qcm';
          ctx.changed();
        }), { tip: 'Forme des questions générées (molécule → valeurs).' })
      )
    );

    function paintCounts() {
      paintTotal();
      if (cfg.style === 'mixte') counts.replaceChildren(mixteGrid, totalEl);
      else counts.replaceChildren(rowNbQ);
    }

    function syncStyle() {
      autoCard.hidden = cfg.style === 'manuel';
      paintCounts();
    }

    el.replaceChildren(
      U.card('Paramètres',
        U.field('Style', (function () {
          const seg = U.segmented([
            { value: 'manuel', label: 'Pool personnalisé', tip: 'Questions saisies dans la banque.' },
            { value: 'auto', label: 'Pool automatique', tip: 'Tirage depuis le pool à chaque partie.' },
            { value: 'mixte', label: 'Mixte', tip: 'Banque personnalisée + questions automatiques.' },
          ], cfg.style, function (v) {
            cfg.style = v;
            syncStyle();
            ctx.changed();
          });
          seg.classList.add('v3-seg-eq');
          return seg;
        })(), { tip: 'Mode de composition du quiz.' }),
        counts
      ),
      autoCard
    );
    syncStyle();
  }

  function mountAutoReglages(root, ctx) {
    const cfg = ensure(ctx.cfg);
    const poolMsg = h('div', { class: 'v3-quiz-pool' });
    const autoFields = h('div', { class: 'v3-stack v3-quiz-auto-fields' });
    const champsHost = h('div', { class: 'v3-quiz-champs-host' });
    autoFields.append(
      U.field('Sens', U.segmented([
        {
          value: 'mol_vers_valeur',
          label: 'Molécule → valeur',
          tip: 'Énoncé = molécule, réponses = valeurs du champ.',
        },
        {
          value: 'valeur_vers_mol',
          label: 'Valeur → molécule',
          tip: 'Énoncé = valeur publiée, réponses = DCI.',
        },
        {
          value: 'les_deux',
          label: 'Les deux',
          tip: 'Mélange des deux sens à chaque tirage.',
        },
      ], cfg.sens, function (v) { cfg.sens = v; ctx.changed(); }), {
        tip: 'Sens des questions générées automatiquement.',
      }),
      U.field('Difficulté', U.segmented([
        { value: 1, label: 'Niveau 1', tip: 'Distracteurs très différents (similarité < 20 %).' },
        { value: 2, label: 'Niveau 2', tip: 'Similarité des distracteurs plafonnée à 50 %.' },
        { value: 3, label: 'Niveau 3', tip: 'Similarité plafonnée à 80 % (plus exigeant).' },
      ], cfg.difficulte, function (v) {
        cfg.difficulte = Number(v);
        ctx.changed();
      }), { tip: 'Exigence sur la proximité des mauvaises réponses.' }),
      U.field('Champs interrogés', champsHost, {
        col: true,
        tip: 'Champs pédagogiques publiés ; défaut = tous ceux du pool.',
      })
    );
    root.appendChild(U.card('Génération automatique', poolMsg, autoFields));

    function paintChamps(mols) {
      const present = champsPedago(mols);
      if (!present.length) {
        champsHost.replaceChildren(U.empty('Aucun champ publié'));
        return;
      }
      const selected = (cfg.champs && cfg.champs.length) ? cfg.champs : present;
      const wrap = h('div', { class: 'v3-checks v3-quiz-champs' });
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
      const playable = poolMols(mols);
      ctx._quizMols = playable;
      if (!playable.length) {
        poolMsg.hidden = false;
        autoFields.hidden = true;
        poolMsg.replaceChildren(
          h('p', { class: 'v3-empty' }, 'Pool vide (aucune publication visible)'),
          U.button('Molécules', { variant: 'ghost', onClick: goStep1 })
        );
        ctx.changed();
        return;
      }
      poolMsg.hidden = true;
      autoFields.hidden = false;
      poolMsg.replaceChildren();
      paintChamps(playable);
      ctx.changed();
    }

    poolMsg.replaceChildren(U.empty('…'));
    ctx.mols().then(paintPool).catch(function (e) {
      poolMsg.replaceChildren(U.empty(e.message || 'Erreur'));
    });
  }

  function questionMetaText(q) {
    const n = (q.propositions || []).filter(function (p) { return String(p.texte || '').trim(); }).length;
    const type = questionType(q);
    const nOk = countCorrect(q);
    const ok = type === 'qcm' ? nOk >= 2 : nOk >= 1;
    return {
      snip: (q.enonce || '').trim() || 'Sans énoncé',
      meta: (type === 'qcm' ? 'QCM' : 'QCU') + ' · ' + n + ' prop.' + (ok ? ' ✓' : ''),
      type: type,
    };
  }

  function paintPropRows(host, q, opts) {
    opts = opts || {};
    const type = questionType(q);
    host.replaceChildren();
    (q.propositions || []).forEach(function (p, pi) {
      const radio = h('input', {
        type: type === 'qcm' ? 'checkbox' : 'radio',
        name: type === 'qcm' ? null : (opts.radioName || ('v3-quiz-bonne-' + q.id)),
        checked: !!p.est_correcte,
        'aria-label': type === 'qcm' ? 'Bonne réponse (plusieurs possibles)' : 'Bonne réponse',
      });
      radio.addEventListener('change', function () {
        if (type === 'qcm') p.est_correcte = radio.checked;
        else q.propositions.forEach(function (x, j) { x.est_correcte = j === pi; });
        if (opts.onDirty) opts.onDirty();
      });
      const input = h('input', {
        type: 'text',
        class: 'v3-ctrl',
        value: p.texte,
        'aria-label': 'Proposition ' + (pi + 1),
      });
      input.addEventListener('input', function () {
        p.texte = input.value;
        if (opts.onDirty) opts.onDirty();
      });
      input.addEventListener('keydown', function (ev) {
        if (ev.key !== 'Enter') return;
        ev.preventDefault();
        if (q.propositions.length >= 6) return;
        q.propositions.push(emptyProp(false));
        paintPropRows(host, q, opts);
        const inputs = host.querySelectorAll('.v3-quiz-prop-row input[type="text"]');
        const last = inputs[inputs.length - 1];
        if (last) last.focus();
      });
      const del = iconBtn('×', 'Retirer', function () {
        if (q.propositions.length <= 2) return;
        q.propositions.splice(pi, 1);
        paintPropRows(host, q, opts);
        if (opts.onDirty) opts.onDirty();
      });
      del.disabled = q.propositions.length <= 2;
      host.appendChild(h('div', { class: 'v3-quiz-prop-row' }, radio, input, del));
    });
  }

  function mountBanque(ctx, cfg) {
    let draft = emptyQuestion(cfg.nb_propositions);
    let draftApi = null;
    let draftTa = null;
    let draftPropsHost = null;
    let draftTypeSeg = null;

    function resetDraftForm() {
      draft = emptyQuestion(cfg.nb_propositions);
      if (draftTa) {
        draftTa.value = '';
        autosize(draftTa);
      }
      if (draftTypeSeg && draftTypeSeg.setValue) draftTypeSeg.setValue('qcu');
      if (draftPropsHost) paintPropRows(draftPropsHost, draft, {
        radioName: 'v3-quiz-draft-bonne',
        onDirty: function () {
          if (draftApi) draftApi.setDraftReady(questionOk(draft));
        },
      });
      if (draftApi) {
        draftApi.clearProps();
        draftApi.setDraftReady(false);
      }
    }

    const ad = U.adder({
      title: 'Ajouter une question',
      propose: true,
      items: function () { return cfg.questions; },
      empty: 'Aucune question',
      draft: function (host, api) {
        draftApi = api;
        draftTa = h('textarea', {
          class: 'v3-quiz-enonce',
          'aria-label': 'Énoncé',
          rows: 2,
        });
        draftTa.addEventListener('input', function () {
          draft.enonce = draftTa.value;
          autosize(draftTa);
          api.setDraftReady(questionOk(draft));
        });
        draftPropsHost = h('div', { class: 'v3-quiz-props' });
        function paintDraftProps() {
          paintPropRows(draftPropsHost, draft, {
            radioName: 'v3-quiz-draft-bonne',
            onDirty: function () { api.setDraftReady(questionOk(draft)); },
          });
        }
        paintDraftProps();
        draftTypeSeg = U.segmented([
          { value: 'qcu', label: 'Choix unique', tip: 'Une bonne réponse.' },
          { value: 'qcm', label: 'Choix multiples', tip: 'Plusieurs bonnes réponses cochables.' },
        ], questionType(draft), function (v) {
          setQuestionType(draft, v);
          paintDraftProps();
          api.setDraftReady(questionOk(draft));
        });
        const tools = h('div', { class: 'v3-quiz-draft-tools' },
          U.button('Proposer depuis les molécules', {
            variant: 'ghost',
            onClick: function () {
              ctx.mols().then(function (mols) {
                const playable = poolMols(mols);
                ctx._quizMols = playable;
                const pack = genererAuto(playable, cfg, 10);
                if (!pack.questions.length) {
                  U.toast('Aucune proposition', 'err');
                  return;
                }
                api.propose(pack.questions.map(function (q) {
                  const sn = (q.enonce || q.titre || '').trim();
                  return {
                    label: sn.length > 72 ? sn.slice(0, 72) + '…' : sn,
                    sub: bonneTexte(q),
                    value: q,
                  };
                }));
              }).catch(function (e) {
                U.toast(e.message || 'Erreur', 'err');
              });
            },
          }),
          U.button('+ Proposition', {
            variant: 'ghost',
            onClick: function () {
              if (draft.propositions.length >= 6) return;
              draft.propositions.push(emptyProp(false));
              paintDraftProps();
            },
          })
        );
        host.appendChild(h('div', { class: 'v3-quiz-draft' },
          U.field('Type', draftTypeSeg, { tip: 'QCU = une réponse · QCM = plusieurs.' }),
          U.field('Énoncé', draftTa, {
            col: true,
            tip: 'Question affichée au joueur.',
          }),
          U.field('Propositions', draftPropsHost, {
            col: true,
            tip: 'Cochez la ou les bonnes réponses (2 à 6).',
          }),
          tools
        ));
        api.setDraftReady(false);
      },
      onAdd: function (picked) {
        if (picked && picked.length) {
          picked.forEach(function (v) {
            cfg.questions.push(normQuestion({
              type: v.type,
              enonce: v.enonce,
              propositions: v.propositions,
            }));
          });
        } else if (questionOk(draft)) {
          cfg.questions.push(normQuestion({
            type: draft.type,
            enonce: draft.enonce,
            propositions: (draft.propositions || []).map(function (p) {
              return { texte: p.texte, est_correcte: p.est_correcte };
            }),
          }));
        }
        resetDraftForm();
      },
      onChange: function () { ctx.changed(); },
      renderItem: function (q, i, api) {
        const open = cfg.openId === q.id;
        const bits = questionMetaText(q);
        const snip = h('span', { class: 'v3-quiz-snip' }, bits.snip);
        const meta = h('span', { class: 'v3-quiz-meta' }, bits.meta);
        const nodes = [
          h('div', { class: 'v3-quiz-head' },
            h('div', { class: 'v3-quiz-head-txt' },
              h('div', { class: 'v3-row' }, U.badge(bits.type === 'qcm' ? 'QCM' : 'QCU'), snip),
              meta
            ),
            h('div', { class: 'v3-quiz-acts' },
              U.button(open ? 'Fermer' : 'Modifier', {
                variant: 'ghost',
                onClick: function () {
                  cfg.openId = open ? null : q.id;
                  api.refresh();
                },
              }),
              U.button('Dupliquer', {
                variant: 'ghost',
                onClick: function () {
                  const copy = normQuestion({
                    type: q.type,
                    enonce: q.enonce,
                    propositions: (q.propositions || []).map(function (p) {
                      return { texte: p.texte, est_correcte: p.est_correcte };
                    }),
                  });
                  cfg.questions.splice(i + 1, 0, copy);
                  cfg.openId = copy.id;
                  api.refresh();
                },
              }),
              U.button('Supprimer', {
                variant: 'ghost',
                onClick: function () {
                  U.confirm('Supprimer ?').then(function (ok) {
                    if (!ok) return;
                    if (cfg.openId === q.id) cfg.openId = null;
                    api.remove(i);
                  });
                },
              }),
              iconBtn('↑', 'Monter', function () { api.move(i, -1); }),
              iconBtn('↓', 'Descendre', function () { api.move(i, 1); })
            )
          ),
        ];
        if (open) {
          const ta = h('textarea', {
            class: 'v3-quiz-enonce',
            'aria-label': 'Énoncé',
            rows: 2,
          });
          ta.value = q.enonce || '';
          ta.addEventListener('input', function () {
            q.enonce = ta.value;
            autosize(ta);
            snip.textContent = questionMetaText(q).snip;
            ctx.changed();
          });
          const propsHost = h('div', { class: 'v3-quiz-props' });
          function dirtyItem() {
            const next = questionMetaText(q);
            meta.textContent = next.meta;
            ctx.changed();
          }
          function paintItemProps() {
            paintPropRows(propsHost, q, { onDirty: dirtyItem });
          }
          const typeSeg = U.segmented([
            { value: 'qcu', label: 'Choix unique', tip: 'Une bonne réponse.' },
            { value: 'qcm', label: 'Choix multiples', tip: 'Plusieurs bonnes réponses cochables.' },
          ], questionType(q), function (v) {
            setQuestionType(q, v);
            paintItemProps();
            dirtyItem();
          });
          const card = h('div', { class: 'v3-quiz-card' },
            U.field('Type', typeSeg, { tip: 'QCU = une réponse · QCM = plusieurs.' }),
            U.field('Énoncé', ta, { col: true }),
            U.field('Propositions', propsHost, {
              col: true,
              tip: 'Cochez la ou les bonnes réponses (2 à 6).',
            }),
            U.button('+ Proposition', {
              variant: 'ghost',
              onClick: function () {
                if (q.propositions.length >= 6) return;
                q.propositions.push(emptyProp(false));
                paintItemProps();
                dirtyItem();
              },
            })
          );
          paintItemProps();
          autosize(ta);
          if (cfg._focusEnonce) {
            cfg._focusEnonce = false;
            ta.focus();
          }
          nodes.push(card);
        }
        return nodes;
      },
    });
    ad.refresh();
    return h('div', { class: 'v3-quiz-banque' }, ad.el);
  }

  function perso(el, ctx) {
    const cfg = ensure(ctx.cfg);
    const wrap = h('div', { class: 'v3-stack v3-quiz-perso-wrap' });
    if (cfg.style === 'auto' || cfg.style === 'mixte') mountAutoReglages(wrap, ctx);
    if (cfg.style === 'manuel' || cfg.style === 'mixte') wrap.appendChild(mountBanque(ctx, cfg));
    el.replaceChildren(wrap);
  }

  function essai(el, ctx) {
    const panel = U.essaiPanel({ title: 'Tirage' });
    el.append(
      U.button('Tester un tirage', {
        variant: 'ghost',
        onClick: function () {
          panel.open();
          runTiragePreview(ctx, panel.body);
        },
      }),
      panel.el
    );
  }

  function toPlayQuestion(q) {
    const t = U.txt || function (v) { return v == null ? '' : String(v); };
    const type = questionType(q);
    const props = (q.propositions || [])
      .map(function (p) {
        return typeof p === 'string' ? t(p) : t(p && p.texte);
      })
      .filter(Boolean);
    let corrects = (q.propositions || [])
      .filter(function (p) { return p && typeof p !== 'string' && p.est_correcte; })
      .map(function (p) { return t(p.texte); })
      .filter(Boolean);
    if (!corrects.length && Array.isArray(q.corrects)) {
      corrects = q.corrects.map(t).filter(Boolean);
    }
    if (!corrects.length && typeof q.correct === 'string' && q.correct) {
      corrects = q.correct.indexOf(' | ') >= 0 ? q.correct.split(' | ') : [q.correct];
    }
    const noms = Array.isArray(q.noms)
      ? q.noms.map(t).filter(Boolean).join(' · ')
      : t(q.legende || q.noms);
    return {
      id: q.id,
      source: q.source || 'manuel',
      type: type,
      matrice_id: q.matrice_id || null,
      champ_code: q.champ_code || null,
      dci: t(q.dci),
      question: t(q.enonce || q.titre || q.question),
      noms: noms,
      propositions: props,
      corrects: corrects,
      correct: type === 'qcm' ? joinSet(corrects) : (corrects[0] || ''),
    };
  }

  function labSet(v) {
    const t = U.txt || function (x) { return x == null ? '' : String(x); };
    if (Array.isArray(v)) return v.map(t).filter(Boolean).join(' · ') || '—';
    if (v && typeof v === 'object') return t(v.texte) || '—';
    return t(v) || '—';
  }

  function paintRecapV2(playQs, answers) {
    const ol = h('ol', { class: 'jp-v2-quiz-recap' });
    playQs.forEach(function (q, i) {
      const a = answers[i] || {};
      const score = a.score != null ? Number(a.score) : (a.ok ? 1 : 0);
      const li = h('li', { class: score === 1 ? 'is-ok' : (score === 0.5 ? 'is-mid' : 'is-ko') });
      li.appendChild(document.createTextNode(q.question || '—'));
      li.appendChild(h('br'));
      li.appendChild(h('span', { class: 'jp-muted' },
        'Votre réponse : ' + labSet(a.choice)
        + (score === 1 ? '' : ' · Correct : ' + labSet(a.correct || q.correct || q.corrects))
      ));
      ol.appendChild(li);
    });
    return h('div', null,
      h('h3', { class: 'jp-v2-recap-title' }, 'Détail des réponses'),
      ol
    );
  }

  function runPlay(el, playQs, session, tentativeId, mode) {
    let idx = 0;
    const answers = [];
    mode = mode === 'detaille' ? 'detaille' : 'rapide';

    function paint() {
      if (idx >= playQs.length) {
        const obtenu = answers.reduce(function (s, a) {
          return s + (Number(a.score) || 0);
        }, 0);
        const details = answers.map(function (a, i) {
          return {
            id: playQs[i].id,
            ok: a.ok,
            score: a.score,
            reponse: a.choice,
            correct: a.correct,
          };
        });
        if (!session.reel) {
          el.replaceChildren(paintRecapV2(playQs, answers));
          session.fin({ obtenu: obtenu, max: playQs.length, details: details });
          return;
        }
        const reponses = {};
        answers.forEach(function (a, i) {
          const pq = playQs[i];
          reponses[pq.id] = pq.type === 'qcm'
            ? (a.choices || []).slice()
            : (a.choice || '');
        });
        el.replaceChildren(U.empty('…'));
        session.rpc('jeu_soumettre_quiz', {
          p_tentative_id: tentativeId,
          p_reponses: { mode: mode, reponses: reponses },
        }).then(function (res) {
          const srv = Array.isArray(res.details) ? res.details : details;
          const recap = playQs.map(function (pq, i) {
            const d = srv[i] || details[i] || {};
            return {
              choice: d.reponse != null ? d.reponse : (answers[i] && answers[i].choice),
              correct: d.correct != null ? d.correct : (answers[i] && answers[i].correct),
              score: d.score != null ? Number(d.score) : (answers[i] && answers[i].score),
              ok: d.ok,
            };
          });
          el.replaceChildren(paintRecapV2(playQs, recap));
          session.fin({
            obtenu: Number(res.score_obtenu),
            max: Number(res.score_max),
            details: srv,
          });
        }).catch(function (e) {
          U.toast(e.message || 'Erreur', 'err');
          el.replaceChildren(paintRecapV2(playQs, answers));
          session.fin({ obtenu: obtenu, max: playQs.length, details: details });
        });
        return;
      }

      const q = playQs[idx];
      const type = q.type === 'qcm' ? 'qcm' : 'qcu';
      const propsEl = h('div', { class: 'jp-v2-props' });
      const act = h('div', { class: 'jp-v2-actions v3-quiz-play-act' });
      const picked = {};

      function pushAnswer(chosen) {
        const list = Array.isArray(chosen) ? chosen : (chosen ? [chosen] : []);
        const score = scoreReponse(type, list, q.corrects || [], mode);
        answers.push({
          choice: type === 'qcm' ? list.slice() : (list[0] || ''),
          choices: list.slice(),
          ok: score === 1,
          score: score,
          correct: type === 'qcm' ? (q.corrects || []) : q.correct,
          champ: q.champ_code,
          matrice_id: q.matrice_id,
          source: q.source || 'auto',
        });
        idx += 1;
        paint();
      }

      q.propositions.forEach(function (p, i) {
        if (type === 'qcm') {
          const box = h('input', { type: 'checkbox', 'aria-label': p });
          box.addEventListener('change', function () { picked[i] = box.checked; });
          propsEl.appendChild(h('label', { class: 'jp-btn jp-btn-ghost jp-v2-prop' }, box, p));
        } else {
          const radio = h('input', {
            type: 'radio',
            name: 'v3-quiz-play-' + (q.id || idx),
            'aria-label': p,
          });
          radio.addEventListener('change', function () { pushAnswer(p); });
          propsEl.appendChild(h('label', { class: 'jp-btn jp-btn-ghost jp-v2-prop' }, radio, p));
        }
      });
      if (type === 'qcm') {
        act.appendChild(h('button', {
          type: 'button',
          class: 'jp-btn jp-btn-primary',
          onClick: function () {
            const list = q.propositions.filter(function (p, i) { return picked[i]; });
            if (!list.length) {
              U.toast('Cochez au moins une réponse', 'err');
              return;
            }
            pushAnswer(list);
          },
        }, 'Valider'));
      }
      el.replaceChildren(
        h('div', null,
          h('p', { class: 'jp-muted' }, 'Question ' + (idx + 1) + ' / ' + playQs.length),
          h('h2', { class: 'jp-title', style: { fontSize: '1.25rem' } }, q.question),
          q.noms ? h('p', { class: 'jp-muted' }, q.noms) : null,
          propsEl,
          act
        )
      );
    }

    paint();
  }

  function play(el, ctx, session) {
    const cfg = ensure(ctx.cfg);
    el.replaceChildren(U.empty('…'));
    const needPool = cfg.style === 'auto' || cfg.style === 'mixte';
    const pMols = needPool ? ctx.mols() : Promise.resolve([]);
    pMols.then(function (mols) {
      const playable = poolMols(mols);
      ctx._quizMols = playable;
      ctx.changed();
      const pack = tirerQuestions(cfg, playable);
      if (!pack.questions.length) {
        el.replaceChildren(U.empty('Aucune question'));
        return;
      }
      const playQs = pack.questions.map(toPlayQuestion);
      const snap = snapshotOf(pack.questions);
      const mode = 'rapide';
      if (!session.reel) {
        runPlay(el, playQs, session, null, mode);
        return;
      }
      session.rpc('jeu_demarrer_quiz', {
        p_jeu_id: session.jeu.id,
        p_snapshot: snap,
        p_contexte: 'classique',
        p_passage_id: null,
      }).then(function (res) {
        runPlay(el, playQs, session, res && res.tentative_id, mode);
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
      tip: 'Choix unique ou multiples.',
      pool: true,
      defaults: defaults,
      fromConfig: fromConfig,
      params: params,
      perso: perso,
      essai: essai,
      play: play,
      validate: validate,
      payload: payload,
    });
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = pures;
})(typeof window !== 'undefined' ? window : globalThis);
