/**
 * Helpers d'affichage / catégorisation des tâches (comptoir + dashboard).
 */

export function parseTaskDetails(desc) {
  if (desc == null || desc === '') return { _plain: true, text: '' };
  try {
    const parsed = JSON.parse(desc);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed;
    }
    return { _plain: true, text: String(parsed) };
  } catch {
    return { _plain: true, text: String(desc) };
  }
}

export function isPlainTaskDetails(details) {
  return !!details?._plain || (
    !details?.type
    && !details?.medicament
    && details?.facture === undefined
    && !details?.nom
    && !details?.lot
  );
}

/**
 * Catégories pour filtres / regroupement.
 * @returns {'commande'|'facturation'|'retrait_lot'|'stock'|'perimes'|'ip'|'appel'|'etalonnage'|'autre'|'libre'}
 */
export function getTaskCategory(description, titre = '') {
  const d = parseTaskDetails(description);
  if (d.type === 'retrait_lot') return 'retrait_lot';
  if (d.type === 'stock_error' || d.type === 'stock_recompte') return 'stock';
  if (d.type === 'perimes_mensuel') return 'perimes';
  if (d.type === 'perime_decision') return 'perime_decision';
  if (d.type === 'perime_challenge') return 'perime_challenge';
  if (d.type === 'perime_mea') return 'perime_mea';
  if (d.type === 'perime_promo') return 'perime_promo';
  if (d.type === 'ip_brouillon') return 'ip';
  if (d.type === 'litige_brouillon') return 'litige';
  if (d.type === 'appel_brouillon') return 'appel_brouillon';
  if (d.type === 'nc_brouillon') return 'nc';
  if (d.type === 'appel_attente_pharmacien') return 'appel';
  if (d.type === 'etalonnage_rdv') return 'etalonnage';
  if (titre.startsWith('Commande') || (d.medicament && !d.lot && !d.type)) return 'commande';
  if (titre.startsWith('Facturation') || d.facture !== undefined) return 'facturation';
  if (isPlainTaskDetails(d)) return 'libre';
  return 'autre';
}

export const TASK_CATEGORY_LABELS = {
  all: 'Tous les types',
  libre: 'Tâches libres',
  commande: 'Commandes',
  facturation: 'Facturations',
  retrait_lot: 'Retrait de lot',
  stock: 'Stock',
  perimes: 'Périmés (legacy)',
  perime_decision: 'Périmé à décider',
  perime_challenge: 'Challenge périmé',
  perime_mea: 'Mise en avant',
  perime_promo: 'Promotion',
  ip: 'IP à finaliser',
  litige: 'Litiges à finaliser',
  appel_brouillon: 'Appels à finaliser',
  nc: 'NC à finaliser',
  appel: 'Appels pharmacien',
  etalonnage: 'Étalonnage',
  autre: 'Autres',
};

export function plainTaskText(description) {
  const d = parseTaskDetails(description);
  if (d._plain) return d.text || '';
  if (typeof description === 'string' && isPlainTaskDetails(d)) return description;
  return '';
}
