-- =============================================================================
-- Migration — call_logs.motif : ajouter litige_fournisseur
-- =============================================================================

ALTER TABLE "PharmaOs".call_logs DROP CONSTRAINT IF EXISTS call_logs_motif_check;

ALTER TABLE "PharmaOs".call_logs
  ADD CONSTRAINT call_logs_motif_check
  CHECK (motif IS NULL OR motif = ANY (ARRAY[
    'intervention_pharmaceutique'::text,
    'commande_labo'::text,
    'reclamation_patient'::text,
    'reception_du'::text,
    'litige_fournisseur'::text,
    'autre'::text
  ]));
