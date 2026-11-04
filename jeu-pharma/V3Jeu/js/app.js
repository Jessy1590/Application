/* Wizard visuel V3 — mémoire seulement, pas d’enregistrement. */
(function () {
  const D = window.V3Data;
  const STEPS = ['Molécules', 'Jeu', 'Paramètres', 'Perso', 'Lancer'];
  const TYPES = [
    ['quiz', 'Quiz'],
    ['trous', 'Trous'],
    ['fiche', 'Fiche'],
    ['ordonnance', 'Ordonnance'],
    ['classement', 'Classement'],
    ['appariement', 'Appariement'],
  ];
  const NOM = Object.fromEntries(TYPES);
  const CHAMPS = [
    ['dci', 'DCI'],
    ['nom_commercial', 'Noms'],
    ['secteur_therapeutique', 'Secteur'],
    ['classe_therapeutique', 'Classe théra.'],
    ['classe_pharmacologique', 'Classe pharma.'],
    ['detail_pharmacologie', 'Détail'],
    ['posologie_generale', 'Posologie'],
    ['grossesse_allaitement', 'Grossesse'],
    ['indications', 'Indications'],
    ['contre_indications', 'CI'],
    ['effets_indesirables', 'EI'],
    ['precautions_emploi', 'Précautions'],
    ['interactions', 'Interactions'],
    ['surveillances', 'Surveillances'],
    ['voies_administration', 'Voies'],
    ['conditions_prescription_delivrance', 'CPD'],
    ['conseils_delivrance', 'Conseils'],
  ];
  const IDENTITY = { dci: 1, nom_commercial: 1 };

  function champMap(fn) {
    const o = {};
    CHAMPS.forEach(([c]) => { o[c] = fn(c); });
    return o;
  }

  const state = {
    open: false,
    step: 1,
    maxStep: 1,
    phase: 'wizard',
    mode: 'lecon',
    q: '',
    pick: null,
    hits: [],
    selection: [],
    lessons: [],
    blocks: [],
    catalogError: '',
    mols: [],
    molsKey: '',
    game: { type: 'quiz', nom: 'Quiz', leconId: '', leconLabel: '', starMin: 1, starMax: 5 },
    nomTouched: false,
    quiz: {
      style: 'manuel',
      nbQuestions: 5,
      nbManuelles: 3,
      nbAuto: 2,
      nbPropositions: 4,
      sens: 'mol_vers_valeur',
      difficulte: 1,
      champs: champMap(() => true),
      questions: [],
    },
    trous: {
      composition: 'auto',
      lignesMode: 'aleatoire',
      nbLignes: 5,
      taux: 40,
      colonnes: champMap((c) => (IDENTITY[c] ? 'visible' : 'trouable')),
      manuel: {},
      grille: {},
    },
    fiche: {
      composition: 'auto',
      fichesMode: 'aleatoire',
      nbFiches: 3,
      seuil: 8,
      nbNotes: 3,
      champs: champMap((c) => (IDENTITY[c] ? 'visible' : 'restituer')),
      slots: [],
    },
    ordo: {
      associations: false,
      champs: champMap((c) => !IDENTITY[c] && ['indications', 'contre_indications', 'effets_indesirables', 'posologie_generale'].includes(c)),
      besoins: [],
    },
    classement: { consigne: '', zones: [], assign: {} },
    appariement: { consigne: '', pairs: {} },
    play: null,
    leconHits: [],
    ordoHit: null,
  };

  let searchToken = 0;
  let renderToken = 0;
  let searchTimer = 0;

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }
  function uid() { return Math.random().toString(36).slice(2, 9); }
  function num(v, a, b) {
    let n = Number(v);
    if (!Number.isFinite(n)) n = a;
    return Math.min(b, Math.max(a, n));
  }
  function norm(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function human(e) {
    const m = (e && (e.message || e.error_description)) || String(e || '');
    if (/jwt|session|permission|401|42501|pgrst301|row-level/i.test(m)) return 'Connexion requise';
    return m || 'Erreur';
  }
  function champLabel(code) {
    const f = CHAMPS.find((c) => c[0] === code);
    return f ? f[1] : code;
  }
  function texts(v) {
    if (v == null || v === '') return [];
    if (typeof v === 'string') return [v];
    if (Array.isArray(v)) {
      return v.map((x) => (typeof x === 'string' ? x : (x && x.valeur) || '')).filter(Boolean);
    }
    return [];
  }
  function chipKey(s) { return s.kind + ':' + s.id; }
  function tip(title) {
    return ' <span title="' + esc(title) + '" aria-label="' + esc(title) + '">?</span>';
  }

  function navHtml() {
    const prev = state.step > 1 ? '<button type="button" data-act="prev">Retour</button>' : '';
    const next = state.step < 5
      ? '<button type="button" class="primary" data-act="next">Suivant</button>'
      : '<button type="button" class="primary" data-act="launch">Essayer</button>';
    const inner = state.step === 1 ? next : (prev + next);
    return '<div class="nav top">' + inner + '</div>';
  }
  function navBottom() {
    return navHtml().replace('class="nav top"', 'class="nav bottom"');
  }

  function paintStepper() {
    const ol = document.getElementById('stepper');
    ol.innerHTML = STEPS.map((label, i) => {
      const n = i + 1;
      const on = n === state.step && state.phase === 'wizard' ? ' is-on' : '';
      return '<li><button type="button" class="' + on.trim() + '" data-act="goto" data-step="' + n + '">'
        + '<span class="n">' + n + '</span>' + esc(label) + '</button></li>';
    }).join('');
  }

  async function render() {
    const token = ++renderToken;
    paintStepper();
    const host = document.getElementById('step');
    let html = '';
    try {
      if (state.phase === 'play') html = playHtml();
      else if (state.step === 1) html = stepSel();
      else if (state.step === 2) html = stepJeu();
      else if (state.step === 3) html = await stepParams();
      else if (state.step === 4) html = await stepPerso();
      else html = stepLancer();
    } catch (e) {
      html = '<div class="step-main"><p class="muted">' + esc(human(e)) + '</p></div>';
    }
    if (token !== renderToken) return;
    host.innerHTML = html;
    if (state.phase === 'wizard' && state.step === 1) void runSearch();
  }

  function stepSel() {
    const modes = [['lecon', 'Leçon'], ['bloc', 'Bloc molécule'], ['molecule', 'Individuelle']];
    return navHtml() + '<div class="step-main">'
      + '<div class="modes">' + modes.map(([k, lab]) => (
        '<button type="button" data-act="mode" data-mode="' + k + '"' + (state.mode === k ? ' class="is-on"' : '') + '>' + lab + '</button>'
      )).join('') + '</div>'
      + '<div class="row">'
      + '<input id="q" value="' + esc(state.q) + '" placeholder="Chercher" aria-label="Chercher">'
      + '<button type="button" data-act="add">Ajouter</button></div>'
      + '<div class="hits" id="hits"></div>'
      + (state.catalogError ? '<p class="muted">' + esc(state.catalogError) + '</p>' : '')
      + '<div class="chips" id="chips">' + chipsHtml() + '</div>'
      + '</div>' + navBottom();
  }

  function chipsHtml() {
    if (!state.selection.length) return '<p class="muted">—</p>';
    return state.selection.map((s) => (
      '<span class="chip chip-' + s.kind + '">' + esc(s.label)
      + '<button type="button" data-act="rm" data-key="' + esc(chipKey(s)) + '" aria-label="Retirer">×</button></span>'
    )).join('');
  }

  function stepJeu() {
    const stars = (name, val) => {
      let o = '';
      for (let i = 1; i <= 5; i += 1) o += '<option value="' + i + '"' + (Number(val) === i ? ' selected' : '') + '>★' + i + '</option>';
      return '<select data-bind="' + name + '" aria-label="' + name + '">' + o + '</select>';
    };
    return navHtml() + '<div class="step-main">'
      + '<label class="field"><span>Type</span><select data-bind="type">'
      + TYPES.map(([k, lab]) => '<option value="' + k + '"' + (state.game.type === k ? ' selected' : '') + '>' + lab + '</option>').join('')
      + '</select></label>'
      + '<label class="field"><span>Nom</span><input data-bind="nom" value="' + esc(state.game.nom) + '" maxlength="80"></label>'
      + '<div class="field"><span>Liaison leçon</span>'
      + '<input id="leconQ" placeholder="Chercher une leçon" aria-label="Liaison leçon">'
      + '<div class="hits" id="leconHits"></div>'
      + (state.game.leconLabel ? '<p class="muted">' + esc(state.game.leconLabel) + '</p>' : '')
      + '</div>'
      + '<div class="field"><span>Visibilité</span><div class="split"><label class="field"><span>De</span>'
      + stars('starMin', state.game.starMin) + '</label><label class="field"><span>À</span>'
      + stars('starMax', state.game.starMax) + '</label></div></div>'
      + '</div>' + navBottom();
  }

  async function stepParams() {
    const t = state.game.type;
    let body = '';
    if (t === 'quiz') body = quizParams();
    else if (t === 'trous') body = trousParams(await ensureMols());
    else if (t === 'fiche') body = ficheParams(await ensureMols());
    else if (t === 'ordonnance') body = ordoParams();
    else body = consigneParams(t);
    return navHtml() + '<div class="step-main">' + body + '</div>' + navBottom();
  }

  function quizParams() {
    const q = state.quiz;
    const radio = (val, lab) => '<label class="line"><input type="radio" name="style" data-bind="style" value="' + val + '"'
      + (q.style === val ? ' checked' : '') + '>' + lab + '</label>';
    const champBoxes = CHAMPS.map(([c, lab]) => (
      '<label class="line"><input type="checkbox" data-bind="qchamp" data-champ="' + c + '"'
      + (q.champs[c] ? ' checked' : '') + '>' + esc(lab) + '</label>'
    )).join('');
    return '<div class="modes">' + radio('manuel', 'Manuel') + radio('auto', 'Auto') + radio('mixte', 'Mixte') + '</div>'
      + '<div class="split">'
      + '<label class="field" id="nbQ"' + (q.style === 'mixte' ? ' hidden' : '') + '><span>Questions</span>'
      + '<input type="number" min="1" max="50" data-bind="nbQuestions" value="' + q.nbQuestions + '"></label>'
      + '<label class="field" id="nbMan"' + (q.style !== 'mixte' ? ' hidden' : '') + '><span>Manuelles</span>'
      + '<input type="number" min="0" max="50" data-bind="nbManuelles" value="' + q.nbManuelles + '"></label>'
      + '<label class="field" id="nbAuto"' + (q.style !== 'mixte' ? ' hidden' : '') + '><span>Auto</span>'
      + '<input type="number" min="0" max="50" data-bind="nbAuto" value="' + q.nbAuto + '"></label>'
      + '<label class="field"><span>Propositions</span>'
      + '<input type="number" min="2" max="6" data-bind="nbPropositions" value="' + q.nbPropositions + '"></label>'
      + '</div>'
      + '<div id="quizAuto"' + (q.style === 'manuel' ? ' hidden' : '') + '>'
      + '<div class="split">'
      + '<label class="field"><span>Sens' + tip('Molécule vers valeur, valeur vers molécule, ou les deux') + '</span>'
      + '<select data-bind="sens">'
      + '<option value="mol_vers_valeur"' + (q.sens === 'mol_vers_valeur' ? ' selected' : '') + '>Molécule → valeur</option>'
      + '<option value="valeur_vers_mol"' + (q.sens === 'valeur_vers_mol' ? ' selected' : '') + '>Valeur → molécule</option>'
      + '<option value="les_deux"' + (q.sens === 'les_deux' ? ' selected' : '') + '>Les deux</option>'
      + '</select></label>'
      + '<label class="field"><span>Difficulté' + tip('Plafond de similarité : < 20 %, < 50 %, < 80 %') + '</span>'
      + '<select data-bind="diff">'
      + '<option value="1"' + (q.difficulte === 1 ? ' selected' : '') + '>Niveau 1</option>'
      + '<option value="2"' + (q.difficulte === 2 ? ' selected' : '') + '>Niveau 2</option>'
      + '<option value="3"' + (q.difficulte === 3 ? ' selected' : '') + '>Niveau 3</option>'
      + '</select></label></div>'
      + '<div class="checks">' + champBoxes + '</div>'
      + '<button type="button" data-act="tirage">Tester un tirage</button>'
      + '<div id="tirage"></div></div>';
  }

  function trousParams(mols) {
    const t = state.trous;
    const cols = CHAMPS.map(([c, lab]) => (
      '<label class="field"><span>' + esc(lab) + '</span><select data-bind="tcol" data-champ="' + c + '">'
      + '<option value="visible"' + (t.colonnes[c] === 'visible' ? ' selected' : '') + '>Visible</option>'
      + '<option value="trouable"' + (t.colonnes[c] === 'trouable' ? ' selected' : '') + '>Trouable</option>'
      + '</select></label>'
    )).join('');
    const manuel = t.composition === 'auto' && t.lignesMode === 'manuel'
      ? '<div class="checks">' + (mols.length ? mols.map((m) => (
        '<label class="line"><input type="checkbox" data-bind="tman" data-id="' + esc(m.id) + '"'
        + (t.manuel[m.id] ? ' checked' : '') + '>' + esc(m.dci || m.nom || m.id) + '</label>'
      )).join('') : '<p class="muted">—</p>') + '</div>'
      : '';
    return '<div class="split">'
      + '<label class="field"><span>Composition' + tip('Auto : trous tirés. Grille : cases choisies.') + '</span>'
      + '<select data-bind="tcomp"><option value="auto"' + (t.composition === 'auto' ? ' selected' : '') + '>Auto</option>'
      + '<option value="grille"' + (t.composition === 'grille' ? ' selected' : '') + '>Grille</option></select></label>'
      + '<label class="field" id="tMode"' + (t.composition === 'grille' ? ' hidden' : '') + '><span>Lignes</span>'
      + '<select data-bind="tlines"><option value="aleatoire"' + (t.lignesMode === 'aleatoire' ? ' selected' : '') + '>Aléatoire</option>'
      + '<option value="groupe"' + (t.lignesMode === 'groupe' ? ' selected' : '') + '>Groupe</option>'
      + '<option value="manuel"' + (t.lignesMode === 'manuel' ? ' selected' : '') + '>Manuel</option></select></label>'
      + '<label class="field" id="tNb"' + (t.composition === 'grille' || t.lignesMode !== 'aleatoire' ? ' hidden' : '') + '><span>N</span>'
      + '<input type="number" min="1" max="40" data-bind="nbLignes" value="' + t.nbLignes + '"></label>'
      + '<label class="field" id="tTaux"' + (t.composition !== 'auto' ? ' hidden' : '') + '><span>% trous</span>'
      + '<input type="number" min="0" max="100" step="5" data-bind="taux" value="' + t.taux + '"></label>'
      + '</div>' + manuel + '<div class="split">' + cols + '</div>';
  }

  function ficheParams(mols) {
    const f = state.fiche;
    const showEx = f.composition === 'auto' && f.fichesMode !== 'groupe';
    const champs = CHAMPS.map(([c, lab]) => (
      '<label class="field"><span>' + esc(lab) + '</span><select data-bind="fchamp" data-champ="' + c + '">'
      + '<option value="visible"' + (f.champs[c] === 'visible' ? ' selected' : '') + '>Visible</option>'
      + '<option value="restituer"' + (f.champs[c] === 'restituer' ? ' selected' : '') + '>À restituer</option>'
      + '</select></label>'
    )).join('');
    const slots = f.composition !== 'manuel' ? '' : (
      '<div id="slots">' + f.slots.map((s) => slotRow(s)).join('') + '</div>'
      + '<div class="row"><button type="button" data-act="slot" data-mode="aleatoire">+ Aléatoire</button>'
      + '<button type="button" data-act="slot" data-mode="fixe">+ Fixe</button></div>'
      + '<div id="slotSearch" hidden><input id="slotQ" placeholder="Molécule" aria-label="Molécule fixe"><div class="hits" id="slotHits"></div></div>'
    );
    return '<div class="split">'
      + '<label class="field"><span>Composition</span><select data-bind="fcomp">'
      + '<option value="auto"' + (f.composition === 'auto' ? ' selected' : '') + '>Auto</option>'
      + '<option value="manuel"' + (f.composition === 'manuel' ? ' selected' : '') + '>Manuel</option></select></label>'
      + '<label class="field" id="fMode"' + (f.composition === 'manuel' ? ' hidden' : '') + '><span>Fiches</span><select data-bind="fmode">'
      + '<option value="aleatoire"' + (f.fichesMode === 'aleatoire' ? ' selected' : '') + '>Aléatoire</option>'
      + '<option value="groupe"' + (f.fichesMode === 'groupe' ? ' selected' : '') + '>Groupe</option></select></label>'
      + '<label class="field" id="fNb"' + (f.composition === 'manuel' || f.fichesMode === 'groupe' ? ' hidden' : '') + '><span>N</span>'
      + '<input type="number" min="1" max="20" data-bind="nbFiches" value="' + f.nbFiches + '"></label>'
      + '<label class="field" id="fSeuil"' + (showEx ? '' : ' hidden') + '><span>Seuil' + tip('Note /10. Exclusion auto seulement.') + '</span>'
      + '<input type="number" min="1" max="10" data-bind="seuil" value="' + f.seuil + '"></label>'
      + '<label class="field" id="fNotes"' + (showEx ? '' : ' hidden') + '><span>Notes ≥ seuil</span>'
      + '<input type="number" min="1" max="10" data-bind="nbNotes" value="' + f.nbNotes + '"></label>'
      + '</div>' + slots + '<div class="split">' + champs + '</div>'
      + (mols ? '' : '');
  }

  function slotRow(s) {
    const lab = s.mode === 'fixe' ? (s.label || 'Fixe') : 'Aléatoire';
    return '<div class="line"><span>' + esc(lab) + '</span>'
      + '<button type="button" data-act="rm-slot" data-id="' + esc(s.id) + '">×</button></div>';
  }

  function ordoParams() {
    const o = state.ordo;
    const champs = CHAMPS.filter(([c]) => !IDENTITY[c]).map(([c, lab]) => (
      '<label class="line"><input type="checkbox" data-bind="ochamp" data-champ="' + c + '"'
      + (o.champs[c] ? ' checked' : '') + '>' + esc(lab) + '</label>'
    )).join('');
    const srcOpts = '<option value="*">Sélection</option>' + state.selection.map((s) => (
      '<option value="' + esc(chipKey(s)) + '">' + esc(s.label) + '</option>'
    )).join('');
    const lines = o.besoins.map((b) => (
      '<div class="line"><span>' + esc(besoinLabel(b)) + '</span>'
      + (b.mode === 'aleatoire'
        ? '<select data-bind="osrc" data-id="' + esc(b.id) + '">' + srcOpts.replace(
          'value="' + esc(b.sourceKey || '*') + '"',
          'value="' + esc(b.sourceKey || '*') + '" selected',
        ) + '</select>'
        : '')
      + '<button type="button" data-act="rm-besoin" data-id="' + esc(b.id) + '">×</button></div>'
    )).join('');
    return '<label class="line"><input type="checkbox" data-bind="assoc"' + (o.associations ? ' checked' : '')
      + '>Associations possibles' + tip('Jamais forcé. Une ligne asso compte 2 molécules.') + '</label>'
      + '<div class="checks">' + champs + '</div>'
      + '<div id="besoins">' + (lines || '<p class="muted">—</p>') + '</div>'
      + '<div class="row"><button type="button" data-act="besoin" data-mode="aleatoire">+ Aléatoire</button>'
      + '<button type="button" data-act="besoin" data-mode="manuel">+ Molécule</button>'
      + '<button type="button" data-act="besoin" data-mode="asso">+ Association</button></div>'
      + '<div id="besoinSearch" hidden><input id="besoinQ" placeholder="Chercher" aria-label="Besoin fixe"><div class="hits" id="besoinHits"></div></div>';
  }

  function besoinLabel(b) {
    if (b.mode === 'aleatoire') return 'Aléatoire';
    if (b.mode === 'asso') return 'Asso · ' + (b.label || '—');
    return b.label || 'Molécule';
  }

  function consigneParams(type) {
    const key = type === 'classement' ? 'classement' : 'appariement';
    return '<label class="field"><span>Consigne</span><input data-bind="consigne" data-kind="' + key
      + '" maxlength="300" value="' + esc(state[key].consigne) + '"></label>';
  }

  async function stepPerso() {
    const t = state.game.type;
    let body = '';
    if (t === 'quiz') body = quizEditor();
    else if (t === 'trous') body = await trousPreview();
    else if (t === 'fiche') body = await fichePreview();
    else if (t === 'ordonnance') body = await ordoPreview();
    else if (t === 'classement') body = await classementPair();
    else body = await appariementPair();
    return navHtml() + '<div class="step-main">' + body + '</div>' + navBottom();
  }

  function quizEditor() {
    const cards = state.quiz.questions.map((q) => (
      '<article class="q-card" data-qid="' + esc(q.id) + '">'
      + '<textarea data-f="enonce" data-qid="' + esc(q.id) + '" placeholder="Énoncé">' + esc(q.enonce) + '</textarea>'
      + q.props.map((p) => (
        '<div class="row"><label class="line"><input type="radio" name="ok-' + esc(q.id) + '" data-f="ok" data-qid="'
        + esc(q.id) + '" data-pid="' + esc(p.id) + '"' + (p.ok ? ' checked' : '') + '></label>'
        + '<input data-f="prop" data-qid="' + esc(q.id) + '" data-pid="' + esc(p.id) + '" value="' + esc(p.text) + '">'
        + '<button type="button" data-act="rm-prop" data-qid="' + esc(q.id) + '" data-pid="' + esc(p.id) + '">×</button></div>'
      )).join('')
      + '<div class="row"><button type="button" data-act="add-prop" data-qid="' + esc(q.id) + '">+ Réponse</button>'
      + '<button type="button" data-act="rm-q" data-qid="' + esc(q.id) + '">Supprimer</button></div></article>'
    )).join('');
    const note = state.quiz.style === 'auto' ? '<p class="muted">Questions générées au lancement.</p>' : '';
    return note + '<div id="questions">' + cards + '</div>'
      + (state.quiz.style === 'auto' ? '' : '<button type="button" data-act="add-q">+ Question</button>');
  }

  function molName(m) { return m.dci || m.nom || '—'; }

  function rowsForTrous(mols) {
    const t = state.trous;
    if (t.composition === 'grille' || t.lignesMode === 'groupe') return mols;
    if (t.lignesMode === 'manuel') return mols.filter((m) => t.manuel[m.id]);
    return shuffle(mols).slice(0, num(t.nbLignes, 1, 40));
  }

  function holeableCols() {
    return CHAMPS.map(([c]) => c).filter((c) => state.trous.colonnes[c] === 'trouable');
  }

  function cellIsHole(molId, champ, rowIndex) {
    const t = state.trous;
    if (t.composition === 'grille') {
      const v = t.grille[molId + '|' + champ];
      if (v) return v === 'trou';
      return t.colonnes[champ] === 'trouable';
    }
    if (t.colonnes[champ] !== 'trouable') return false;
    const cols = holeableCols();
    if (!cols.length) return false;
    const nHoles = Math.round(cols.length * (num(t.taux, 0, 100) / 100));
    const start = rowIndex % cols.length;
    for (let i = 0; i < nHoles; i += 1) {
      if (cols[(start + i) % cols.length] === champ) return true;
    }
    return false;
  }

  async function trousPreview() {
    const mols = rowsForTrous(await ensureMols());
    if (!mols.length) return '<p class="muted">—</p>';
    const head = '<tr><th>Molécule</th>' + CHAMPS.map(([, lab]) => '<th>' + esc(lab) + '</th>').join('') + '</tr>';
    const body = mols.map((m, ri) => {
      const cells = CHAMPS.map(([c]) => {
        const vals = (m.fields && m.fields[c]) || [];
        const hole = cellIsHole(m.id, c, ri);
        const shown = hole ? '???' : (vals.join(' · ') || '·');
        return '<td class="' + (hole ? 'is-hole' : '') + '" data-act="cell" data-mol="' + esc(m.id)
          + '" data-champ="' + c + '">' + esc(shown) + '</td>';
      }).join('');
      return '<tr><th>' + esc(molName(m)) + '</th>' + cells + '</tr>';
    }).join('');
    return '<table><thead>' + head + '</thead><tbody>' + body + '</tbody></table>';
  }

  async function fichePreview() {
    const mols = await ficheMols(await ensureMols());
    const m = mols[0];
    if (!m) return '<p class="muted">—</p>';
    const lines = CHAMPS.map(([c, lab]) => {
      const vals = (m.fields[c] || []).join(' · ') || '—';
      const hide = state.fiche.champs[c] === 'restituer';
      return '<p><strong>' + esc(lab) + '</strong> · ' + esc(hide ? '???' : vals) + '</p>';
    }).join('');
    return '<article class="card"><h2>' + esc(molName(m)) + '</h2>' + lines
      + '<p class="muted">' + mols.length + '</p></article>';
  }

  async function ficheMols(mols) {
    const f = state.fiche;
    if (f.composition === 'manuel') {
      return f.slots.map((s) => {
        if (s.mode === 'fixe' && s.matriceId) return mols.find((m) => m.id === s.matriceId) || { id: s.matriceId, dci: s.label, nom: '', fields: {} };
        return shuffle(mols)[0] || null;
      }).filter(Boolean);
    }
    if (f.fichesMode === 'groupe') return mols;
    return shuffle(mols).slice(0, num(f.nbFiches, 1, 20));
  }

  async function ordoPreview() {
    const mols = await ensureMols();
    const lines = drawOrdo(mols);
    if (!lines.length) return '<p class="muted">—</p>';
    let vigilance = '';
    if (state.ordo.associations) {
      const sep = lines.filter((l) => l.mode !== 'asso').map((l) => l.matriceId);
      const tipAsso = await vigilanceAsso(sep, lines);
      if (tipAsso) vigilance = '<p class="muted">Observance : ' + esc(tipAsso) + '</p>';
    }
    return '<ol>' + lines.map((l) => (
      '<li><strong>' + esc(l.label) + '</strong>'
      + (l.sub ? '<div class="muted">' + esc(l.sub) + '</div>' : '')
      + (l.mode === 'asso' ? '<div class="muted">2 molécules</div>' : '')
      + '</li>'
    )).join('') + '</ol>' + vigilance;
  }

  function drawOrdo(mols) {
    return state.ordo.besoins.map((b) => {
      if (b.mode === 'aleatoire') {
        const pool = molsInSource(b.sourceKey, mols);
        const m = shuffle(pool)[0];
        return m ? { mode: 'aleatoire', matriceId: m.id, label: molName(m), sub: m.nom || '' } : { mode: 'aleatoire', label: '—' };
      }
      return { mode: b.mode, matriceId: b.matriceId, label: b.label || '—', sub: b.sub || '' };
    });
  }

  function molsInSource(key, mols) {
    if (!key || key === '*') return mols;
    const i = key.indexOf(':');
    const kind = key.slice(0, i);
    const id = key.slice(i + 1);
    if (kind === 'molecule') return mols.filter((m) => m.id === id);
    if (kind === 'bloc') return mols.filter((m) => (m.blocIds || []).includes(id));
    if (kind === 'lecon') return mols.filter((m) => (m.lessonIds || []).includes(id));
    return mols;
  }

  async function vigilanceAsso(separates, lines) {
    if (lines.some((l) => l.mode === 'asso')) return '';
    const rows = await D.assosTouchant(separates);
    const by = {};
    rows.forEach((r) => {
      if (!separates.includes(r.composant_matrice_id)) return;
      (by[r.matrice_id] = by[r.matrice_id] || new Set()).add(r.composant_matrice_id);
    });
    const id = Object.keys(by).find((k) => by[k].size >= 2);
    if (!id) return '';
    const fiches = await D.fiches([id]);
    const row = fiches[0];
    return row ? ((row.dci || row.nom_commercial || 'association')) : '';
  }

  async function classementPair() {
    const mols = await ensureMols();
    const zones = state.classement.zones;
    const opts = '<option value="">—</option>' + zones.map((z) => '<option value="' + esc(z.id) + '">' + esc(z.label) + '</option>').join('');
    const rows = mols.map((m) => {
      const cur = state.classement.assign[m.id] || '';
      const select = opts.replace('value="' + esc(cur) + '"', 'value="' + esc(cur) + '" selected');
      return '<div class="line"><span>' + esc(molName(m)) + '</span><select data-bind="assign" data-id="' + esc(m.id) + '">' + select + '</select></div>';
    }).join('');
    const zlist = zones.map((z) => (
      '<span class="chip chip-bloc">' + esc(z.label)
      + '<button type="button" data-act="rm-zone" data-id="' + esc(z.id) + '">×</button></span>'
    )).join('');
    return '<div class="row"><input id="zoneName" placeholder="Zone" aria-label="Zone">'
      + '<button type="button" data-act="add-zone">Ajouter</button></div>'
      + '<div class="chips">' + zlist + '</div>' + (rows || '<p class="muted">—</p>');
  }

  async function appariementPair() {
    const mols = await ensureMols();
    const rows = mols.map((m) => (
      '<div class="line"><span>' + esc(molName(m)) + '</span>'
      + '<input data-bind="partner" data-id="' + esc(m.id) + '" value="' + esc(state.appariement.pairs[m.id] || '') + '"></div>'
    )).join('');
    return '<div class="row"><button type="button" data-act="proposer">Proposer</button></div>'
      + (rows || '<p class="muted">—</p>');
  }

  function stepLancer() {
    const n = state.selection.length;
    return navHtml() + '<div class="step-main"><p>' + esc(state.game.nom || NOM[state.game.type])
      + ' · ' + esc(NOM[state.game.type] || '') + ' · ' + n + '</p></div>' + navBottom();
  }

  async function ensureMols() {
    const key = state.selection.map(chipKey).join('|');
    if (state.molsKey === key && state.mols.length) return state.mols;
    const ids = new Set();
    const lessonIds = [];
    const blocOf = {};
    state.selection.forEach((s) => {
      if (s.kind === 'molecule') ids.add(s.id);
      if (s.kind === 'lecon') lessonIds.push(s.id);
      if (s.kind === 'bloc') (s.matriceIds || []).forEach((id) => {
        ids.add(id);
        (blocOf[id] = blocOf[id] || []).push(s.id);
      });
    });
    const lessonOf = {};
    if (lessonIds.length) {
      const blocs = await D.blocsOfLessons(lessonIds);
      blocs.forEach((b) => {
        D.matriceIdsFromPayload(b.payload_json).forEach((id) => {
          ids.add(id);
          (lessonOf[id] = lessonOf[id] || []).push(b.module_id);
        });
      });
    }
    const rows = await D.fiches(Array.from(ids));
    const extra = {};
    if (state.ordo.besoins.some((b) => b.matriceId)) {
      const more = await D.fiches(state.ordo.besoins.map((b) => b.matriceId).filter(Boolean));
      more.forEach((r) => { extra[r.id] = r; });
    }
    state.fiche.slots.forEach((s) => { if (s.matriceId) ids.add(s.matriceId); });
    const slotRows = await D.fiches(state.fiche.slots.map((s) => s.matriceId).filter((id) => id && !rows.some((r) => r.id === id)));
    slotRows.forEach((r) => { extra[r.id] = r; });
    const all = rows.concat(Object.values(extra).filter((r) => !rows.some((x) => x.id === r.id)));
    state.mols = all.map((r) => ({
      id: r.id,
      dci: r.dci || '',
      nom: r.nom_commercial || D.noms(r.noms_commerciaux),
      fields: Object.fromEntries(CHAMPS.map(([c]) => [c, fieldOf(r, c)])),
      lessonIds: lessonOf[r.id] || [],
      blocIds: blocOf[r.id] || [],
    }));
    state.molsKey = key;
    return state.mols;
  }

  function fieldOf(row, code) {
    if (code === 'dci') return row.dci ? [row.dci] : [];
    if (code === 'nom_commercial') {
      const many = texts(row.noms_commerciaux);
      if (many.length) return many;
      return row.nom_commercial ? [row.nom_commercial] : [];
    }
    return texts(row[code]);
  }

  function jaccard(a, b) {
    const A = new Set(norm(a).split(' ').filter((w) => w.length > 2));
    const B = new Set(norm(b).split(' ').filter((w) => w.length > 2));
    if (!A.size || !B.size) return norm(a) === norm(b) ? 1 : 0;
    let inter = 0;
    A.forEach((x) => { if (B.has(x)) inter += 1; });
    return inter / (A.size + B.size - inter);
  }
  function tooClose(a, b, level) {
    const na = norm(a);
    const nb = norm(b);
    if (!na || !nb) return true;
    if (na === nb || na.includes(nb) || nb.includes(na)) return true;
    const cap = level >= 3 ? 0.8 : level === 2 ? 0.5 : 0.2;
    return jaccard(a, b) >= cap;
  }

  function buildAuto(mols, n) {
    const q = state.quiz;
    const champs = CHAMPS.map(([c]) => c).filter((c) => q.champs[c]);
    const k = num(q.nbPropositions, 2, 6);
    const out = [];
    shuffle(mols).forEach((mol) => {
      if (out.length >= n) return;
      const sens = q.sens === 'les_deux'
        ? (Math.random() < 0.5 ? 'mol_vers_valeur' : 'valeur_vers_mol')
        : q.sens;
      const item = sens === 'valeur_vers_mol'
        ? qVersMol(mol, mols, champs, k, q.difficulte)
        : qVersValeur(mol, mols, champs, k, q.difficulte);
      if (item) out.push(item);
    });
    return out;
  }

  function qVersValeur(mol, mols, champs, k, level) {
    for (const c of shuffle(champs)) {
      const vals = (mol.fields[c] || []).slice();
      if (!vals.length) continue;
      const answer = vals[0];
      const pool = [];
      mols.forEach((o) => {
        if (o.id === mol.id) return;
        (o.fields[c] || []).forEach((v) => {
          if (!tooClose(v, answer, level) && pool.every((p) => !tooClose(p, v, level))) pool.push(v);
        });
      });
      if (pool.length < k - 1) continue;
      const props = shuffle([answer].concat(pool.slice(0, k - 1))).map((text) => ({ text, ok: text === answer }));
      return { enonce: molName(mol) + ' — ' + champLabel(c), props };
    }
    return null;
  }

  function qVersMol(mol, mols, champs, k, level) {
    const name = molName(mol);
    const others = mols.filter((o) => o.id !== mol.id && !tooClose(molName(o), name, level));
    if (others.length < k - 1) return null;
    for (const c of shuffle(champs)) {
      const vals = mol.fields[c] || [];
      if (!vals.length) continue;
      const props = shuffle([mol].concat(others.slice(0, k - 1))).map((m) => ({ text: molName(m), ok: m.id === mol.id }));
      return { enonce: champLabel(c) + ' : ' + vals[0], props };
    }
    return null;
  }

  function manualSample(n) {
    const bank = state.quiz.questions.filter((q) => q.enonce.trim() && q.props.filter((p) => p.text.trim()).length >= 2 && q.props.some((p) => p.ok));
    const take = Math.min(bank.length, n);
    return shuffle(bank).slice(0, take).map((q) => ({
      enonce: q.enonce,
      props: q.props.filter((p) => p.text.trim()).map((p) => ({ text: p.text, ok: !!p.ok })),
    }));
  }

  async function launch() {
    const mols = await ensureMols();
    const t = state.game.type;
    if (t === 'quiz') {
      const style = state.quiz.style;
      let items = [];
      if (style === 'manuel') items = manualSample(state.quiz.nbQuestions);
      else if (style === 'auto') items = buildAuto(mols, state.quiz.nbQuestions);
      else items = shuffle(manualSample(state.quiz.nbManuelles).concat(buildAuto(mols, state.quiz.nbAuto)));
      state.play = { type: 'quiz', items, i: 0, score: 0, locked: false };
    } else if (t === 'trous') {
      const rows = rowsForTrous(mols);
      const units = [];
      rows.forEach((m, ri) => {
        CHAMPS.forEach(([c]) => {
          if (!cellIsHole(m.id, c, ri)) return;
          const vals = m.fields[c] && m.fields[c].length ? m.fields[c] : ['—'];
          vals.forEach((v, vi) => units.push({ key: m.id + '|' + c + '|' + vi, label: molName(m), champ: champLabel(c), attendu: v, saisie: '', note: null }));
        });
      });
      state.play = { type: 'trous', mode: null, rows, units, revealed: false, score: '' };
    } else if (t === 'fiche') {
      state.play = { type: 'fiche', mode: null, cards: await ficheMols(mols), i: 0, revealed: false, notes: [] };
    } else if (t === 'ordonnance') {
      const lines = drawOrdo(mols);
      const champs = CHAMPS.filter(([c]) => state.ordo.champs[c]);
      const enriched = [];
      for (const l of lines) {
        const mol = mols.find((m) => m.id === l.matriceId);
        let comps = [];
        if (l.mode === 'asso' && l.matriceId) {
          const links = await D.composants([l.matriceId]);
          const ids = links.map((x) => x.composant_matrice_id);
          const rows = await D.fiches(ids);
          comps = rows.map((r) => r.dci || r.nom_commercial).filter(Boolean);
        }
        enriched.push({
          label: l.label,
          sub: l.sub,
          mode: l.mode,
          comps,
          champs: champs.map(([c, lab]) => ({ lab, attendu: mol && mol.fields[c] ? mol.fields[c].join(' · ') : '—' })),
        });
      }
      state.play = { type: 'ordonnance', mode: null, lines: enriched, revealed: false, assoc: state.ordo.associations };
    } else if (t === 'classement') {
      state.play = {
        type: 'classement',
        picked: null,
        items: mols.map((m) => ({ id: m.id, label: molName(m), zoneId: null })),
        zones: state.classement.zones.map((z) => ({ id: z.id, label: z.label })),
        key: Object.assign({}, state.classement.assign),
        done: false,
        score: null,
      };
    } else {
      const rights = [];
      const seen = new Set();
      mols.forEach((m) => {
        const p = (state.appariement.pairs[m.id] || '').trim();
        if (p && !seen.has(p)) { seen.add(p); rights.push({ id: p, label: p }); }
      });
      state.play = {
        type: 'appariement',
        picked: null,
        left: mols.map((m) => ({ id: m.id, label: molName(m), partner: '' })),
        right: shuffle(rights),
        key: Object.assign({}, state.appariement.pairs),
        done: false,
        score: null,
      };
    }
    state.phase = 'play';
    await render();
  }

  function playHtml() {
    const p = state.play;
    const back = '<div class="nav top"><button type="button" data-act="leave">Retour</button></div>';
    if (!p) return back;
    if (p.type === 'quiz') return back + quizPlay(p);
    if (p.type === 'trous') return back + trousPlay(p);
    if (p.type === 'fiche') return back + fichePlay(p);
    if (p.type === 'ordonnance') return back + ordoPlay(p);
    if (p.type === 'classement') return back + classPlay(p);
    return back + appPlay(p);
  }

  function quizPlay(p) {
    if (!p.items.length) return '<div class="step-main"><p class="muted">—</p></div>';
    if (p.i >= p.items.length) {
      return '<div class="step-main"><p>' + p.score + ' / ' + p.items.length + '</p></div>';
    }
    const q = p.items[p.i];
    return '<div class="step-main"><p class="muted">' + (p.i + 1) + ' / ' + p.items.length + '</p><h2>'
      + esc(q.enonce) + '</h2>'
      + q.props.map((prop, j) => (
        '<button type="button" class="prop" data-act="prop" data-j="' + j + '">' + esc(prop.text) + '</button>'
      )).join('')
      + (p.locked ? '<button type="button" data-act="qnext">Suivant</button>' : '')
      + '</div>';
  }

  function modeChoice(type) {
    return '<div class="row"><button type="button" data-act="pmode" data-mode="rapide">Rapide</button>'
      + '<button type="button" data-act="pmode" data-mode="detaille">Détaillé</button></div>';
  }

  function trousPlay(p) {
    if (!p.mode) return '<div class="step-main">' + modeChoice() + '</div>';
    const table = '<table><tbody>' + p.rows.map((m) => {
      const units = p.units.filter((u) => u.key.startsWith(m.id + '|'));
      return '<tr><th>' + esc(molName(m)) + '</th><td>' + units.map((u) => {
        if (p.mode === 'rapide') {
          return '<div>' + esc(u.champ) + ' · ' + (p.revealed ? esc(u.attendu) : '???') + '</div>';
        }
        return '<div class="row"><span>' + esc(u.champ) + '</span>'
          + (p.revealed
            ? '<span>' + esc(u.saisie || '—') + ' / ' + esc(u.attendu) + '</span>'
              + [0, 0.5, 1].map((n) => (
                '<label class="line"><input type="radio" name="n-' + esc(u.key) + '" data-act="note" data-key="'
                + esc(u.key) + '" data-n="' + n + '"' + (u.note === n ? ' checked' : '') + '>' + String(n).replace('.', ',') + '</label>'
              )).join('')
            : '<input data-bind="saisie" data-key="' + esc(u.key) + '" value="' + esc(u.saisie) + '">')
          + '</div>';
      }).join('') + '</td></tr>';
    }).join('') + '</tbody></table>';
    const foot = p.mode === 'rapide'
      ? (p.revealed
        ? '<label class="field"><span>/10</span><input type="number" min="0" max="10" step="0.5" data-bind="score10" value="' + esc(p.score) + '"></label>'
        : '<button type="button" data-act="reveal">Révéler</button>')
      : (p.revealed ? '' : '<button type="button" data-act="reveal">Valider</button>');
    return '<div class="step-main">' + table + foot + '</div>';
  }

  function fichePlay(p) {
    if (!p.mode) return '<div class="step-main">' + modeChoice() + '</div>';
    const m = p.cards[p.i];
    if (!m) return '<div class="step-main"><p class="muted">—</p></div>';
    const lines = CHAMPS.map(([c, lab]) => {
      const vals = ((m.fields && m.fields[c]) || []).join(' · ') || '—';
      const hide = state.fiche.champs[c] === 'restituer';
      if (!hide) return '<p><strong>' + esc(lab) + '</strong> · ' + esc(vals) + '</p>';
      if (p.mode === 'rapide') return '<p><strong>' + esc(lab) + '</strong> · ' + (p.revealed ? esc(vals) : '???') + '</p>';
      return '<label class="field"><span>' + esc(lab) + '</span>'
        + (p.revealed ? '<span>' + esc(vals) + '</span>' : '<input data-bind="fsaisie" data-champ="' + c + '">')
        + '</label>';
    }).join('');
    const restitue = CHAMPS.filter(([c]) => state.fiche.champs[c] === 'restituer');
    const foot = !p.revealed
      ? '<button type="button" data-act="reveal">Révéler</button>'
      : (p.mode === 'detaille'
        ? restitue.map(([c, lab]) => (
          '<div class="row"><span>' + esc(lab) + '</span>'
          + [0, 0.5, 1].map((n) => (
            '<label class="line"><input type="radio" name="fn-' + c + '" data-fnote="' + c + '" value="' + n + '">'
            + String(n).replace('.', ',') + '</label>'
          )).join('') + '</div>'
        )).join('') + '<button type="button" data-act="fnext">Suivant</button>'
        : '<label class="field"><span>/10</span><input type="number" min="0" max="10" step="0.5" id="fnote" value="0"></label>'
          + '<button type="button" data-act="fnext">Suivant</button>');
    return '<div class="step-main"><p class="muted">' + (p.i + 1) + ' / ' + p.cards.length + '</p><h2>'
      + esc(molName(m)) + '</h2>' + lines + foot + '</div>';
  }

  function ordoPlay(p) {
    if (!p.mode) return '<div class="step-main">' + modeChoice() + '</div>';
    const lis = p.lines.map((l, i) => (
      '<li><strong>' + (i + 1) + '. ' + esc(l.label) + '</strong>'
      + (l.sub ? '<div class="muted">' + esc(l.sub) + '</div>' : '')
      + (l.comps && l.comps.length ? '<div class="muted">' + esc(l.comps.join(' + ')) + ' · 2 molécules</div>' : '')
      + l.champs.map((c) => '<div>' + esc(c.lab) + ' · ' + (p.revealed || p.mode === 'detaille' && p.revealed ? esc(c.attendu) : (p.mode === 'rapide' ? '???' : '<input aria-label="' + esc(c.lab) + '">')) + '</div>').join('')
      + '</li>'
    )).join('');
    const foot = p.revealed
      ? '<p class="muted">' + (p.assoc ? 'Vigilance interactions' : '') + '</p>'
      : '<button type="button" data-act="reveal">Révéler</button>';
    return '<div class="step-main"><ol>' + lis + '</ol>' + foot + '</div>';
  }

  function classPlay(p) {
    const pile = p.items.filter((it) => !it.zoneId).map((it) => (
      '<button type="button" class="item' + (p.picked === it.id ? ' is-on' : '') + '" data-act="pick-item" data-id="' + esc(it.id) + '">' + esc(it.label) + '</button>'
    )).join('') || '<p class="muted">—</p>';
    const zones = p.zones.map((z) => {
      const inside = p.items.filter((it) => it.zoneId === z.id).map((it) => (
        '<button type="button" class="item" data-act="unplace" data-id="' + esc(it.id) + '">' + esc(it.label) + '</button>'
      )).join('');
      return '<div class="zone" data-act="drop" data-id="' + esc(z.id) + '"><strong>' + esc(z.label) + '</strong>' + inside + '</div>';
    }).join('') || '<p class="muted">—</p>';
    const score = p.score == null ? '' : '<p>' + p.score + '</p>';
    return '<div class="step-main"><p>' + esc(state.classement.consigne) + '</p>'
      + '<div class="play-side"><div class="pile">' + pile + '</div><div class="zone-grid">' + zones + '</div></div>'
      + '<button type="button" data-act="score-class">Score</button>' + score + '</div>';
  }

  function appPlay(p) {
    const left = p.left.map((it) => (
      '<button type="button" class="item' + (p.picked === it.id ? ' is-on' : '') + '" data-act="pick-left" data-id="' + esc(it.id) + '">'
      + esc(it.label) + (it.partner ? ' → ' + esc(it.partner) : '') + '</button>'
    )).join('');
    const right = p.right.map((it) => (
      '<button type="button" class="item" data-act="pick-right" data-id="' + esc(it.id) + '">' + esc(it.label) + '</button>'
    )).join('') || '<p class="muted">—</p>';
    const score = p.score == null ? '' : '<p>' + p.score + '</p>';
    return '<div class="step-main"><p>' + esc(state.appariement.consigne) + '</p>'
      + '<div class="cols-2"><div>' + left + '</div><div>' + right + '</div></div>'
      + '<button type="button" data-act="score-app">Score</button>' + score + '</div>';
  }

  async function runSearch() {
    const box = document.getElementById('hits');
    if (!box) return;
    const token = ++searchToken;
    const q = state.q.trim();
    try {
      let hits = [];
      const n = norm(q);
      if (state.mode === 'lecon') {
        hits = state.lessons.filter((l) => !n || norm(l.label + ' ' + l.sub).includes(n)).slice(0, 12);
      } else if (state.mode === 'bloc') {
        hits = state.blocks.filter((b) => !n || norm(b.label + ' ' + b.sub).includes(n)).slice(0, 12);
      } else if (q.length >= 2) {
        hits = await D.searchMolecules(q);
      }
      if (token !== searchToken) return;
      if (state.catalogError && state.mode !== 'molecule') {
        box.innerHTML = '<p class="muted">' + esc(state.catalogError) + '</p>';
        return;
      }
      state.hits = hits;
      box.innerHTML = hits.length
        ? hits.map((h) => '<button type="button" class="hit' + (state.pick && state.pick.id === h.id && state.pick.kind === h.kind ? ' is-on' : '')
          + '" data-act="pick" data-kind="' + h.kind + '" data-id="' + esc(h.id) + '">' + esc(h.label)
          + (h.sub ? '<small>' + esc(h.sub) + '</small>' : '') + '</button>').join('')
        : '<p class="muted">—</p>';
    } catch (e) {
      if (token !== searchToken) return;
      box.innerHTML = '<p class="muted">' + esc(human(e)) + '</p>';
    }
  }

  function paintChips() {
    const box = document.getElementById('chips');
    if (box) box.innerHTML = chipsHtml();
    state.molsKey = '';
  }

  function syncQuizDom() {
    const st = state.quiz.style;
    const set = (id, on) => { const el = document.getElementById(id); if (el) el.hidden = !on; };
    set('nbQ', st !== 'mixte');
    set('nbMan', st === 'mixte');
    set('nbAuto', st === 'mixte');
    set('quizAuto', st !== 'manuel');
  }

  function go(step) {
    state.phase = 'wizard';
    state.step = step;
    state.maxStep = Math.max(state.maxStep, step);
    void render();
  }

  function onClick(ev) {
    const t = ev.target.closest('[data-act]');
    if (!t || !document.getElementById('step').contains(t) && !document.getElementById('stepper').contains(t)) return;
    const act = t.getAttribute('data-act');
    if (act === 'goto') {
      const n = Number(t.getAttribute('data-step'));
      if (n <= state.maxStep) go(n);
      return;
    }
    if (act === 'prev') { go(Math.max(1, state.step - 1)); return; }
    if (act === 'next') { go(Math.min(5, state.step + 1)); return; }
    if (act === 'mode') {
      state.mode = t.getAttribute('data-mode');
      state.pick = null;
      document.querySelectorAll('[data-act="mode"]').forEach((b) => b.classList.toggle('is-on', b === t));
      void runSearch();
      return;
    }
    if (act === 'pick') {
      state.pick = state.hits.find((h) => h.id === t.getAttribute('data-id') && h.kind === t.getAttribute('data-kind')) || null;
      document.querySelectorAll('#hits .hit').forEach((b) => b.classList.toggle('is-on', b === t));
      return;
    }
    if (act === 'add') {
      if (!state.pick) return;
      if (!state.selection.some((s) => s.kind === state.pick.kind && s.id === state.pick.id)) {
        state.selection.push({
          kind: state.pick.kind,
          id: state.pick.id,
          label: state.pick.label,
          sub: state.pick.sub || '',
          matriceIds: state.pick.matriceIds || [],
        });
        paintChips();
      }
      return;
    }
    if (act === 'rm') {
      const key = t.getAttribute('data-key');
      state.selection = state.selection.filter((s) => chipKey(s) !== key);
      paintChips();
      return;
    }
    if (act === 'tirage') {
      void (async () => {
        const mols = await ensureMols();
        const item = buildAuto(mols, 1)[0];
        const box = document.getElementById('tirage');
        if (!box) return;
        box.innerHTML = item
          ? '<article class="card"><h3>' + esc(item.enonce) + '</h3>' + item.props.map((p) => '<p>' + esc(p.text) + '</p>').join('') + '</article>'
          : '<p class="muted">—</p>';
      })();
      return;
    }
    if (act === 'add-q') {
      state.quiz.questions.push({ id: uid(), enonce: '', props: [{ id: uid(), text: '', ok: true }, { id: uid(), text: '', ok: false }] });
      void render();
      return;
    }
    if (act === 'rm-q') {
      state.quiz.questions = state.quiz.questions.filter((q) => q.id !== t.getAttribute('data-qid'));
      void render();
      return;
    }
    if (act === 'add-prop') {
      const q = state.quiz.questions.find((x) => x.id === t.getAttribute('data-qid'));
      if (q && q.props.length < 6) q.props.push({ id: uid(), text: '', ok: false });
      void render();
      return;
    }
    if (act === 'rm-prop') {
      const q = state.quiz.questions.find((x) => x.id === t.getAttribute('data-qid'));
      if (q && q.props.length > 2) q.props = q.props.filter((p) => p.id !== t.getAttribute('data-pid'));
      void render();
      return;
    }
    if (act === 'slot') {
      const mode = t.getAttribute('data-mode');
      if (mode === 'fixe') {
        const box = document.getElementById('slotSearch');
        if (box) box.hidden = false;
        state.slotMode = 'fixe';
      } else {
        state.fiche.slots.push({ id: uid(), mode: 'aleatoire' });
        void render();
      }
      return;
    }
    if (act === 'rm-slot') {
      state.fiche.slots = state.fiche.slots.filter((s) => s.id !== t.getAttribute('data-id'));
      void render();
      return;
    }
    if (act === 'slot-hit') {
      state.fiche.slots.push({
        id: uid(), mode: 'fixe', matriceId: t.getAttribute('data-id'), label: t.getAttribute('data-label'),
      });
      state.molsKey = '';
      void render();
      return;
    }
    if (act === 'besoin') {
      const mode = t.getAttribute('data-mode');
      if (mode === 'aleatoire') {
        state.ordo.besoins.push({ id: uid(), mode, sourceKey: '*' });
        void render();
      } else {
        state.besoinMode = mode;
        const box = document.getElementById('besoinSearch');
        if (box) box.hidden = false;
      }
      return;
    }
    if (act === 'besoin-hit') {
      state.ordo.besoins.push({
        id: uid(),
        mode: state.besoinMode || 'manuel',
        matriceId: t.getAttribute('data-id'),
        label: t.getAttribute('data-label'),
      });
      state.molsKey = '';
      void render();
      return;
    }
    if (act === 'rm-besoin') {
      state.ordo.besoins = state.ordo.besoins.filter((b) => b.id !== t.getAttribute('data-id'));
      void render();
      return;
    }
    if (act === 'add-zone') {
      const input = document.getElementById('zoneName');
      const label = (input && input.value || '').trim();
      if (!label) return;
      state.classement.zones.push({ id: uid(), label });
      input.value = '';
      void render();
      return;
    }
    if (act === 'rm-zone') {
      const id = t.getAttribute('data-id');
      state.classement.zones = state.classement.zones.filter((z) => z.id !== id);
      void render();
      return;
    }
    if (act === 'proposer') {
      void (async () => {
        const mols = await ensureMols();
        mols.forEach((m) => {
          if ((state.appariement.pairs[m.id] || '').trim()) return;
          const ind = (m.fields.indications || [])[0] || (m.fields.classe_therapeutique || [])[0] || '';
          if (ind) state.appariement.pairs[m.id] = ind;
        });
        void render();
      })();
      return;
    }
    if (act === 'lecon-hit') {
      state.game.leconId = t.getAttribute('data-id');
      state.game.leconLabel = t.getAttribute('data-label');
      const lab = document.querySelector('#step .field .muted');
      if (lab) lab.textContent = state.game.leconLabel;
      else void render();
      return;
    }
    if (act === 'launch') { void launch(); return; }
    if (act === 'leave') { state.phase = 'wizard'; state.step = 5; void render(); return; }
    if (act === 'cell' && state.trous.composition === 'grille') {
      const k = t.getAttribute('data-mol') + '|' + t.getAttribute('data-champ');
      const hole = t.classList.contains('is-hole');
      state.trous.grille[k] = hole ? 'visible' : 'trou';
      t.classList.toggle('is-hole', !hole);
      t.textContent = hole ? '·' : '???';
      return;
    }
    if (act === 'prop' && state.play && !state.play.locked) {
      const j = Number(t.getAttribute('data-j'));
      const q = state.play.items[state.play.i];
      const ok = !!(q && q.props[j] && q.props[j].ok);
      state.play.locked = true;
      if (ok) state.play.score += 1;
      document.querySelectorAll('[data-act="prop"]').forEach((b, idx) => {
        if (q.props[idx] && q.props[idx].ok) b.classList.add('is-ok');
        else if (idx === j) b.classList.add('is-bad');
      });
      const host = t.parentElement;
      if (host && !host.querySelector('[data-act="qnext"]')) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.setAttribute('data-act', 'qnext');
        btn.textContent = 'Suivant';
        host.appendChild(btn);
      }
      return;
    }
    if (act === 'qnext' && state.play) {
      state.play.i += 1;
      state.play.locked = false;
      void render();
      return;
    }
    if (act === 'pmode' && state.play) {
      state.play.mode = t.getAttribute('data-mode');
      void render();
      return;
    }
    if (act === 'reveal' && state.play) {
      state.play.revealed = true;
      void render();
      return;
    }
    if (act === 'note' && state.play) {
      const u = state.play.units.find((x) => x.key === t.getAttribute('data-key'));
      if (u) u.note = Number(t.getAttribute('data-n'));
      return;
    }
    if (act === 'fnext' && state.play) {
      if (state.play.mode === 'detaille') {
        let sum = 0;
        document.querySelectorAll('[data-fnote]:checked').forEach((el) => { sum += Number(el.value); });
        state.play.notes.push(sum);
      } else {
        const input = document.getElementById('fnote');
        state.play.notes.push(input ? Number(input.value) : 0);
      }
      state.play.i += 1;
      state.play.revealed = false;
      if (state.play.i >= state.play.cards.length) {
        const sum = state.play.notes.reduce((a, b) => a + b, 0);
        const label = state.play.mode === 'rapide'
          ? (sum / state.play.notes.length).toFixed(1) + ' / 10'
          : String(sum);
        document.getElementById('step').innerHTML = '<div class="nav top"><button type="button" data-act="leave">Retour</button></div>'
          + '<div class="step-main"><p>' + (state.play.notes.length ? label : '—') + '</p></div>';
        return;
      }
      void render();
      return;
    }
    if (act === 'pick-item' && state.play) { state.play.picked = t.getAttribute('data-id'); void render(); return; }
    if (act === 'drop' && state.play && state.play.picked) {
      const it = state.play.items.find((x) => x.id === state.play.picked);
      if (it) it.zoneId = t.getAttribute('data-id');
      state.play.picked = null;
      void render();
      return;
    }
    if (act === 'unplace' && state.play) {
      const it = state.play.items.find((x) => x.id === t.getAttribute('data-id'));
      if (it) it.zoneId = null;
      void render();
      return;
    }
    if (act === 'score-class' && state.play) {
      const items = state.play.items;
      const ok = items.filter((it) => it.zoneId && it.zoneId === state.play.key[it.id]).length;
      state.play.score = ok + ' / ' + items.length;
      void render();
      return;
    }
    if (act === 'pick-left' && state.play) { state.play.picked = t.getAttribute('data-id'); void render(); return; }
    if (act === 'pick-right' && state.play && state.play.picked) {
      const it = state.play.left.find((x) => x.id === state.play.picked);
      if (it) it.partner = t.getAttribute('data-id');
      state.play.picked = null;
      void render();
      return;
    }
    if (act === 'score-app' && state.play) {
      const ok = state.play.left.filter((it) => it.partner && norm(it.partner) === norm(state.play.key[it.id] || '')).length;
      state.play.score = ok + ' / ' + state.play.left.length;
      void render();
      return;
    }
  }

  function onInput(ev) {
    const el = ev.target;
    if (el.id === 'q') {
      state.q = el.value;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => { void runSearch(); }, 200);
      return;
    }
    if (el.id === 'leconQ') {
      const n = norm(el.value);
      const hits = state.lessons.filter((l) => !n || norm(l.label + ' ' + l.sub).includes(n)).slice(0, 12);
      const box = document.getElementById('leconHits');
      if (box) {
        box.innerHTML = hits.map((h) => '<button type="button" class="hit" data-act="lecon-hit" data-id="'
          + esc(h.id) + '" data-label="' + esc(h.label) + '">' + esc(h.label) + '</button>').join('');
      }
      return;
    }
    if (el.id === 'slotQ' || el.id === 'besoinQ') {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => { void remoteHits(el); }, 200);
      return;
    }
    const b = el.dataset.bind;
    if (b === 'nom') { state.game.nom = el.value; state.nomTouched = true; }
    if (b === 'nbQuestions') state.quiz.nbQuestions = num(el.value, 1, 50);
    if (b === 'nbManuelles') state.quiz.nbManuelles = num(el.value, 0, 50);
    if (b === 'nbAuto') state.quiz.nbAuto = num(el.value, 0, 50);
    if (b === 'nbPropositions') state.quiz.nbPropositions = num(el.value, 2, 6);
    if (b === 'nbLignes') state.trous.nbLignes = num(el.value, 1, 40);
    if (b === 'taux') state.trous.taux = num(el.value, 0, 100);
    if (b === 'nbFiches') state.fiche.nbFiches = num(el.value, 1, 20);
    if (b === 'seuil') state.fiche.seuil = num(el.value, 1, 10);
    if (b === 'nbNotes') state.fiche.nbNotes = num(el.value, 1, 10);
    if (b === 'consigne') state[el.dataset.kind].consigne = el.value;
    if (b === 'partner') state.appariement.pairs[el.dataset.id] = el.value;
    if (b === 'saisie' && state.play) {
      const u = state.play.units.find((x) => x.key === el.dataset.key);
      if (u) u.saisie = el.value;
    }
    if (b === 'score10' && state.play) state.play.score = el.value;
    if (el.dataset.f === 'enonce') {
      const q = state.quiz.questions.find((x) => x.id === el.dataset.qid);
      if (q) q.enonce = el.value;
    }
    if (el.dataset.f === 'prop') {
      const q = state.quiz.questions.find((x) => x.id === el.dataset.qid);
      const p = q && q.props.find((x) => x.id === el.dataset.pid);
      if (p) p.text = el.value;
    }
  }

  async function remoteHits(el) {
    const box = document.getElementById(el.id === 'slotQ' ? 'slotHits' : 'besoinHits');
    if (!box) return;
    try {
      const hits = el.value.trim().length < 2 ? [] : await D.searchMolecules(el.value.trim());
      const act = el.id === 'slotQ' ? 'slot-hit' : 'besoin-hit';
      box.innerHTML = hits.map((h) => '<button type="button" class="hit" data-act="' + act + '" data-id="'
        + esc(h.id) + '" data-label="' + esc(h.label) + '">' + esc(h.label) + '</button>').join('') || '<p class="muted">—</p>';
    } catch (e) {
      box.innerHTML = '<p class="muted">' + esc(human(e)) + '</p>';
    }
  }

  function onChange(ev) {
    const el = ev.target;
    const b = el.dataset.bind;
    if (b === 'type') {
      state.game.type = el.value;
      if (!state.nomTouched || Object.values(NOM).includes(state.game.nom)) {
        state.game.nom = NOM[el.value] || 'Jeu';
        state.nomTouched = false;
        const nom = document.querySelector('[data-bind="nom"]');
        if (nom) nom.value = state.game.nom;
      }
    }
    if (b === 'starMin' || b === 'starMax') {
      state.game[b] = num(el.value, 1, 5);
      if (state.game.starMin > state.game.starMax) {
        const other = b === 'starMin' ? 'starMax' : 'starMin';
        state.game[other] = state.game[b];
        const sel = document.querySelector('[data-bind="' + other + '"]');
        if (sel) sel.value = String(state.game[other]);
      }
    }
    if (b === 'style') { state.quiz.style = el.value; syncQuizDom(); }
    if (b === 'sens') state.quiz.sens = el.value;
    if (b === 'diff') state.quiz.difficulte = num(el.value, 1, 3);
    if (b === 'qchamp') state.quiz.champs[el.dataset.champ] = el.checked;
    if (b === 'tcomp') { state.trous.composition = el.value; void render(); }
    if (b === 'tlines') { state.trous.lignesMode = el.value; void render(); }
    if (b === 'tcol') state.trous.colonnes[el.dataset.champ] = el.value;
    if (b === 'tman') state.trous.manuel[el.dataset.id] = el.checked;
    if (b === 'fcomp' || b === 'fmode') {
      if (b === 'fcomp') state.fiche.composition = el.value;
      else state.fiche.fichesMode = el.value;
      void render();
    }
    if (b === 'fchamp') state.fiche.champs[el.dataset.champ] = el.value;
    if (b === 'ochamp') state.ordo.champs[el.dataset.champ] = el.checked;
    if (b === 'assoc') state.ordo.associations = el.checked;
    if (b === 'osrc') {
      const row = state.ordo.besoins.find((x) => x.id === el.dataset.id);
      if (row) row.sourceKey = el.value;
    }
    if (b === 'assign') state.classement.assign[el.dataset.id] = el.value;
    if (el.dataset.f === 'ok') {
      const q = state.quiz.questions.find((x) => x.id === el.dataset.qid);
      if (q) q.props.forEach((p) => { p.ok = p.id === el.dataset.pid; });
    }
  }

  async function loadCatalog() {
    try {
      const [lessons, blocks] = await Promise.all([D.lessons(), D.blocks()]);
      state.lessons = lessons;
      state.blocks = blocks;
      state.catalogError = '';
    } catch (e) {
      state.catalogError = human(e);
    }
    if (state.open && state.step === 1 && state.phase === 'wizard') void runSearch();
  }

  function setSession(session) {
    const form = document.getElementById('auth');
    const who = document.getElementById('who');
    const out = document.getElementById('btnOut');
    const email = session && session.user && session.user.email;
    form.hidden = !!email;
    out.hidden = !email;
    who.hidden = !email;
    who.textContent = email || '';
    if (email) void loadCatalog();
  }

  function bootAuth() {
    const sb = D.client();
    sb.auth.getSession().then(({ data }) => setSession(data.session)).catch((e) => {
      state.catalogError = human(e);
    });
    sb.auth.onAuthStateChange((_e, session) => setSession(session));
    document.getElementById('auth').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const email = document.getElementById('email').value.trim();
      const password = document.getElementById('pass').value;
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) state.catalogError = human(error);
      if (state.open) void render();
    });
    document.getElementById('btnOut').addEventListener('click', () => { void sb.auth.signOut(); });
  }

  document.getElementById('btnOpen').addEventListener('click', () => {
    state.open = true;
    document.getElementById('sheet').hidden = false;
    if (!state.lessons.length && !state.catalogError) void loadCatalog();
    void render();
  });
  document.getElementById('btnClose').addEventListener('click', () => {
    state.open = false;
    document.getElementById('sheet').hidden = true;
  });
  document.getElementById('sheet').addEventListener('click', (ev) => {
    if (ev.target.id === 'sheet') {
      state.open = false;
      ev.target.hidden = true;
    }
  });
  document.getElementById('step').addEventListener('click', onClick);
  document.getElementById('stepper').addEventListener('click', onClick);
  document.getElementById('step').addEventListener('input', onInput);
  document.getElementById('step').addEventListener('change', onChange);

  try { bootAuth(); } catch (e) { state.catalogError = human(e); }
})();
