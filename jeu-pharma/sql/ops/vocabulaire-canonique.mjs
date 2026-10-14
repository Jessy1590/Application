/**
 * Vocabulaire unique partagé — matching synonymes / abréviations avant findOrCreate.
 *
 * Règle stricte reprise référentiel :
 * 1. Normaliser (minuscules, accents, ponctuation, pluriels courants).
 * 2. Étendre abréviations (HTA, IC, FA, AVK, AOD, IEC, ARA2…).
 * 3. Chercher un libellé équivalent déjà en base → réutiliser son UUID.
 * 4. Sinon créer UNE seule entité canonique pédagogique.
 *
 * Usage :
 *   import { normaliserCle, cleCanonique, VocabulaireIndex } from './vocabulaire-canonique.mjs';
 */

/** Abréviations / synonymes → libellé canonique pédagogique (clé déjà normalisée). */
export const SYNONYMES_CANONIQUES = {
  // —— Indications / cliniques ——
  hta: 'hypertension arterielle',
  hypertension: 'hypertension arterielle',
  'hypertension essentielle': 'hypertension arterielle',
  'hypertension arterielle essentielle': 'hypertension arterielle',
  'traitement de l hypertension': 'hypertension arterielle',
  'traitement de l hypertension arterielle': 'hypertension arterielle',
  'traitement de l hypertension arterielle essentielle': 'hypertension arterielle',
  ic: 'insuffisance cardiaque',
  'insuffisance cardiaque congestive': 'insuffisance cardiaque',
  'ic congestive': 'insuffisance cardiaque',
  fa: 'fibrillation auriculaire',
  'fibrillation atriale': 'fibrillation auriculaire',
  'flutter auriculaire': 'flutter auriculaire',
  avc: 'accident vasculaire cerebral',
  'accident vasculaire cerebral': 'accident vasculaire cerebral',
  tvp: 'thrombose veineuse profonde',
  ep: 'embolie pulmonaire',
  'embolie pulmonaire': 'embolie pulmonaire',
  sca: 'syndrome coronarien aigu',
  idm: 'infarctus du myocarde',
  'infarctus du myocarde': 'infarctus du myocarde',
  angor: 'angor',
  'angine de poitrine': 'angor',
  aomi: 'arteriopathie obliterante des membres inferieurs',

  // —— Classes thérapeutiques ——
  anticoagulant: 'anticoagulant',
  anticoagulants: 'anticoagulant',
  'anticoagulation': 'anticoagulant',
  antiagregant: 'antiagregant plaquettaire',
  antiagregeants: 'antiagregant plaquettaire',
  'antiagregant plaquettaire': 'antiagregant plaquettaire',
  'antiagregeants plaquettaires': 'antiagregant plaquettaire',
  betabloquant: 'betabloquant',
  betabloquants: 'betabloquant',
  'beta bloquant': 'betabloquant',
  'beta bloquants': 'betabloquant',
  'beta-bloquant': 'betabloquant',
  'beta-bloquants': 'betabloquant',
  diuretique: 'diuretique',
  diuretiques: 'diuretique',
  antihypertenseur: 'antihypertenseur',
  antihypertenseurs: 'antihypertenseur',
  hypolipemiant: 'hypolipemiant',
  hypolipemiants: 'hypolipemiant',
  statine: 'statine',
  statines: 'statine',
  vasodilatateur: 'vasodilatateur',
  vasodilatateurs: 'vasodilatateur',
  antiarythmique: 'antiarythmique',
  antiarythmiques: 'antiarythmique',
  thrombolytique: 'thrombolytique',
  thrombolytiques: 'thrombolytique',

  // —— Classes pharmacologiques ——
  iec: 'inhibiteur de l enzyme de conversion',
  'inhibiteurs de l enzyme de conversion': 'inhibiteur de l enzyme de conversion',
  'inhibiteur de lenzyme de conversion': 'inhibiteur de l enzyme de conversion',
  ara2: 'antagoniste des recepteurs de l angiotensine ii',
  sartan: 'antagoniste des recepteurs de l angiotensine ii',
  sartans: 'antagoniste des recepteurs de l angiotensine ii',
  arb: 'antagoniste des recepteurs de l angiotensine ii',
  avk: 'antivitamine k',
  'anti vitamine k': 'antivitamine k',
  'antivitamines k': 'antivitamine k',
  aod: 'anticoagulant oral direct',
  'anticoagulants oraux directs': 'anticoagulant oral direct',
  doac: 'anticoagulant oral direct',
  hbpm: 'heparine de bas poids moleculaire',
  'heparines de bas poids moleculaire': 'heparine de bas poids moleculaire',
  'inhibiteur facteur xa': 'inhibiteur du facteur xa',
  'inhibiteurs facteur xa': 'inhibiteur du facteur xa',
  'inhibiteurs du facteur xa': 'inhibiteur du facteur xa',
  'inhibiteurs directs du facteur xa': 'inhibiteur du facteur xa',
  'anti xa': 'inhibiteur du facteur xa',
  'inhibiteur de la thrombine': 'inhibiteur direct de la thrombine',
  'inhibiteurs directs de la thrombine': 'inhibiteur direct de la thrombine',
  'calcium bloqueur': 'inhibiteur calcique',
  'inhibiteurs calciques': 'inhibiteur calcique',
  'antagoniste calcique': 'inhibiteur calcique',
  'antagonistes calciques': 'inhibiteur calcique',
  'diuretique thiazidique': 'diuretique thiazidique',
  'diuretiques thiazidiques': 'diuretique thiazidique',
  'diuretique de l anse': 'diuretique de l anse',
  'diuretiques de l anse': 'diuretique de l anse',
  'diuretique epargneur de potassium': 'diuretique epargneur de potassium',
  'diuretiques epargneurs de potassium': 'diuretique epargneur de potassium',
  'antagoniste de l aldosterone': 'antagoniste mineralocorticoides',
  'antagonistes de l aldosterone': 'antagoniste mineralocorticoides',
  'anti mineralocorticoide': 'antagoniste mineralocorticoides',
  'inhibiteur de la hmg coa reductase': 'inhibiteur de la hmg-coa reductase',
  'inhibiteurs de la hmg coa reductase': 'inhibiteur de la hmg-coa reductase',

  // —— Secteurs ——
  cardiovasculaire: 'cardiovasculaire',
  'systeme cardiovasculaire': 'cardiovasculaire',
  cardio: 'cardiovasculaire',
  hematologie: 'hematologie',
  'sang et organes hematopoietiques': 'hematologie',
};

/** Libellés d’affichage canoniques (clé norm → libellé UI). */
export const LIBELLES_CANONIQUES = {
  'hypertension arterielle': 'Hypertension artérielle',
  'insuffisance cardiaque': 'Insuffisance cardiaque',
  'fibrillation auriculaire': 'Fibrillation auriculaire',
  'flutter auriculaire': 'Flutter auriculaire',
  'accident vasculaire cerebral': 'Accident vasculaire cérébral',
  'thrombose veineuse profonde': 'Thrombose veineuse profonde',
  'embolie pulmonaire': 'Embolie pulmonaire',
  'syndrome coronarien aigu': 'Syndrome coronarien aigu',
  'infarctus du myocarde': 'Infarctus du myocarde',
  angor: 'Angor',
  'arteriopathie obliterante des membres inferieurs': 'Artériopathie oblitérante des membres inférieurs',
  anticoagulant: 'Anticoagulant',
  'antiagregant plaquettaire': 'Antiagrégant plaquettaire',
  betabloquant: 'Bêtabloquant',
  diuretique: 'Diurétique',
  antihypertenseur: 'Antihypertenseur',
  hypolipemiant: 'Hypolipémiant',
  statine: 'Statine',
  vasodilatateur: 'Vasodilatateur',
  antiarythmique: 'Antiarythmique',
  thrombolytique: 'Thrombolytique',
  'inhibiteur de l enzyme de conversion': 'Inhibiteur de l’enzyme de conversion',
  'antagoniste des recepteurs de l angiotensine ii': 'Antagoniste des récepteurs de l’angiotensine II',
  'antivitamine k': 'Antivitamine K',
  'anticoagulant oral direct': 'Anticoagulant oral direct',
  'heparine de bas poids moleculaire': 'Héparine de bas poids moléculaire',
  'inhibiteur du facteur xa': 'Inhibiteur du facteur Xa',
  'inhibiteur direct de la thrombine': 'Inhibiteur direct de la thrombine',
  'inhibiteur calcique': 'Inhibiteur calcique',
  'diuretique thiazidique': 'Diurétique thiazidique',
  'diuretique de l anse': 'Diurétique de l’anse',
  'diuretique epargneur de potassium': 'Diurétique épargneur de potassium',
  'antagoniste mineralocorticoides': 'Antagoniste des minéralocorticoïdes',
  'inhibiteur de la hmg-coa reductase': 'Inhibiteur de la HMG-CoA réductase',
  cardiovasculaire: 'Cardiovasculaire',
  hematologie: 'Hématologie',
};

const STOP_PREFIXES = [
  /^traitement (de |d |des |du )?/,
  /^prevention (de |d |des |du )?/,
  /^indique[e]? (dans |pour |en )?/,
  /^indique[e]?s? (dans |pour )?/,
  /^-+\s*/,
];

/**
 * Normalisation alignée sur jeupharma.normaliser_valeur + nettoyage pédagogique.
 */
export function normaliserCle(valeur) {
  let s = String(valeur || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’`]/g, ' ')
    .replace(/[.,;:!?()[\]{}«»""]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  for (const re of STOP_PREFIXES) s = s.replace(re, '').trim();
  // Pluriels très courants en fin de mot (classes)
  if (s.endsWith('s') && s.length > 4 && !s.endsWith('us') && !s.endsWith('is') && !s.endsWith('ys')) {
    const stem = s.slice(0, -1);
    if (SYNONYMES_CANONIQUES[stem] || LIBELLES_CANONIQUES[stem]) s = stem;
  }
  return s;
}

/** Résout la clé canonique (après synonymes). */
export function cleCanonique(valeur) {
  const n = normaliserCle(valeur);
  if (!n) return '';
  if (SYNONYMES_CANONIQUES[n]) return SYNONYMES_CANONIQUES[n];
  // Abréviations isolées en début / mot entier déjà couvertes ; tenter sous-chaînes exactes
  return n;
}

/** Libellé d’affichage préféré pour une clé canonique. */
export function libelleCanonique(valeur) {
  const cle = cleCanonique(valeur);
  if (LIBELLES_CANONIQUES[cle]) return LIBELLES_CANONIQUES[cle];
  // Capitaliser proprement le premier caractère du libellé source condensé
  const raw = String(valeur || '').trim().replace(/[.]$/, '');
  if (!raw) return '';
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

/** Similarité Jaccard simple sur tokens (0–1). */
export function similariteTokens(a, b) {
  const ta = new Set(normaliserCle(a).split(' ').filter((t) => t.length > 1));
  const tb = new Set(normaliserCle(b).split(' ').filter((t) => t.length > 1));
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter += 1;
  const union = ta.size + tb.size - inter;
  return union ? inter / union : 0;
}

/**
 * Index en mémoire des entités actives d’une table.
 * @typedef {{ id: string, valeur: string, valeur_norm?: string }} Entite
 */
export class VocabulaireIndex {
  /**
   * @param {Entite[]} rows
   * @param {{ fuzzyMin?: number }} [opts]
   */
  constructor(rows, opts = {}) {
    this.fuzzyMin = opts.fuzzyMin ?? 0.92;
    /** @type {Map<string, Entite>} clé canonique → entité */
    this.byCle = new Map();
    /** @type {Entite[]} */
    this.all = [];
    for (const row of rows || []) {
      if (!row?.id || !row?.valeur) continue;
      this.all.push(row);
      const cle = cleCanonique(row.valeur);
      if (!cle) continue;
      const prev = this.byCle.get(cle);
      // Préférer le libellé canonique officiel, sinon le plus court pédagogique
      if (!prev) {
        this.byCle.set(cle, row);
      } else {
        const prefer =
          LIBELLES_CANONIQUES[cle] &&
          normaliserCle(row.valeur) === cle &&
          normaliserCle(prev.valeur) !== cle;
        const shorter = row.valeur.length < prev.valeur.length - 5;
        if (prefer || (!LIBELLES_CANONIQUES[cle] && shorter && row.valeur.length <= 80)) {
          this.byCle.set(cle, row);
        }
      }
    }
  }

  /**
   * Trouve une entité équivalente sans créer.
   * @returns {{ entite: Entite|null, cle: string, match: 'exact'|'synonyme'|'fuzzy'|'aucun', score?: number }}
   */
  resolve(valeurProposee) {
    const raw = String(valeurProposee || '').trim();
    if (!raw) return { entite: null, cle: '', match: 'aucun' };
    const cle = cleCanonique(raw);

    // 1) Clé canonique exacte
    const byKey = this.byCle.get(cle);
    if (byKey) return { entite: byKey, cle, match: 'synonyme' };

    // 2) Match valeur_norm / normaliserCle direct sur toutes
    for (const e of this.all) {
      if (cleCanonique(e.valeur) === cle || normaliserCle(e.valeur) === cle) {
        return { entite: e, cle, match: 'exact' };
      }
    }

    // 3) Fuzzy (libellés courts seulement — éviter de fusionner des phrases longues)
    if (raw.length <= 90 && cle.length <= 90) {
      let best = null;
      let bestScore = 0;
      for (const e of this.all) {
        if (e.valeur.length > 100) continue;
        const score = similariteTokens(raw, e.valeur);
        if (score > bestScore) {
          bestScore = score;
          best = e;
        }
      }
      if (best && bestScore >= this.fuzzyMin) {
        return { entite: best, cle: cleCanonique(best.valeur), match: 'fuzzy', score: bestScore };
      }
    }

    return { entite: null, cle, match: 'aucun' };
  }

  /**
   * Résout ou enregistre une nouvelle entité locale (après insert DB).
   * @param {Entite} created
   */
  register(created) {
    if (!created?.id || !created?.valeur) return;
    this.all.push(created);
    const cle = cleCanonique(created.valeur);
    if (cle && !this.byCle.has(cle)) this.byCle.set(cle, created);
  }
}

/**
 * Prépare le libellé à persister : canonique UI si connu, sinon proposition IA nettoyée.
 */
export function valeurAPersister(valeurProposee, entiteExistante) {
  if (entiteExistante?.valeur) return entiteExistante.valeur;
  return libelleCanonique(valeurProposee);
}
