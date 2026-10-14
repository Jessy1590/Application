/**
 * Règles CIS BDPM pour sql/ops/cardio_rcp_matrice_gen.mjs
 * — allowlist : CIS sûr quand la recherche est ambiguë
 * — denylist : produits pièges (multivitamines IV, diagnostic injectable…)
 * — substance accept : DCI plan ≠ libellé substance BDPM (sels ferreux, héparines…)
 */

/** @type {Record<string, string>} dci_norm → CIS fixe */
export const CIS_ALLOW = {
  colecalciferol: '63902334', // ZYMAD 10 000 UI/ml gouttes — mono cholécalciférol (cours)
  cyanocobalamine: '61247741', // VIT B12 GERDA comprimé — mono
  dipyridamole: '60021216', // PERSANTINE 75 mg comprimé — antiagrégant (pas injectable diagnostic)
  'sels ferreux': '61879666', // TARDYFERON 50 mg comprimé
  'heparinate de sodium': '64395923', // héparine sodique courante (aligné ancien tirage validé)
  'heparinate de calcium': '69636132', // CALCIPARINE SC
  'immunoglobulines anti-d': '62468162', // RHOPHYLAC
  clopidogrel: '67971897',
  prasugrel: '61374393',
  ticagrelor: '67382735',
  fondaparinux: '66565534',
  'dabigatran etexilate': '60292648',
  rivaroxaban: '64206365',
  apixaban: '61902218',
  nebivolol: '67856966',
  ivabradine: '60549911',
  dapagliflozine: '67456363',
  "peroxyde d'hydrogene": '63840612',
};

/** CIS à ne jamais retenir (même si score élevé) */
export const CIS_DENY = new Set([
  '61001031', // CERNEVIT
  '67312509', // SOLUVIT
  '68572748', // Persantine injectable diagnostic
  '66407096',
  '63725282',
  '63230395', // alendronate + cholécalciférol
  '66056836', // calcium + D3
  '67512328',
  '69552499', // ZYMADUO + fluor
]);

/** Requête search_products (dci_norm → q) */
export const SEARCH_QUERY = {
  'sels ferreux': 'sulfate ferreux',
  'immunoglobulines anti-d': 'rhophylac',
  'heparinate de sodium': 'heparine sodique',
  'heparinate de calcium': 'calciparine',
  desirudine: 'revasc',
  lepirudine: 'refludan',
  reteplase: 'reteplase',
  streptokinase: 'streptokinase',
  'alginate de calcium': 'algostéril',
  'isosorbide dinitrate': 'isocard',
  ruscoside: 'cirkan',
  eprosartan: 'teveten',
  colecalciferol: 'cholecalciferol',
  cyanocobalamine: 'cyanocobalamine',
  dipyridamole: 'dipyridamole comprimé',
  'alginate de calcium': 'alginate de calcium',
  'isosorbide dinitrate': 'isocard',
  'acide folinique': 'folinate de calcium',
  eprosartan: 'teveten',
  ruscoside: 'cirkan',
  reteplase: 'reteplase',
  streptokinase: 'streptokinase',
  "peroxyde d'hydrogene": 'eau oxygenee',
  ivabradine: 'ivabradine',
  apixaban: 'apixaban',
  rivaroxaban: 'rivaroxaban',
};

/**
 * Substance BDPM (1 seule SA) acceptée pour une DCI plan.
 * @type {Record<string, string[]>}
 */
export const SUBSTANCE_ACCEPT = {
  'sels ferreux': ['sulfate ferreux', 'sels ferreux'],
  'heparinate de sodium': ['heparine sodique', 'heparinate de sodium'],
  'heparinate de calcium': ['heparine calcique', 'heparinate de calcium'],
  'immunoglobulines anti-d': ['immunoglobuline anti-d', 'immunoglobulines anti-d'],
  colecalciferol: ['cholecalciferol', 'colecalciferol', 'colécalciferol'],
  'acide acetylsalicylique': ['acide acetylsalicylique', 'acide acétylsalicylique'],
  "peroxyde d'hydrogene": ['peroxyde d hydrogene', "peroxyde d'hydrogene", 'hydrogene (peroxyde d'],
  ivabradine: ['ivabradine'],
  prasugrel: ['prasugrel'],
  rivaroxaban: ['rivaroxaban'],
  apixaban: ['apixaban'],
  'dabigatran etexilate': ['dabigatran'],
  nebivolol: ['nebivolol'],
  dapagliflozine: ['dapagliflozine'],
};

/** Dénomination / forme rejetées */
export const DENOM_REJECT =
  /\b(diagnostic|usage diagnostique|test de provocation|scintigraph|CERNEVIT|SOLUVIT|ADDITIFS POUR SOLUTIONS INTRAVEINEUSES)\b/i;

export const FORME_REJECT =
  /\b(collyre|collyre|poudre pour solution injectable ou pour perfusion|lyophilisat pour usage parentéral)\b/i;
