-- =============================================================================
-- supplier_disputes : statuts en_attente + annule (comme flux IP)
-- =============================================================================

ALTER TABLE "PharmaOs".supplier_disputes DROP CONSTRAINT IF EXISTS supplier_disputes_statut_check;

ALTER TABLE "PharmaOs".supplier_disputes
  ADD CONSTRAINT supplier_disputes_statut_check
  CHECK (statut = ANY (ARRAY[
    'ouvert'::text,
    'en_attente'::text,
    'en_cours'::text,
    'clos'::text,
    'annule'::text
  ]));
