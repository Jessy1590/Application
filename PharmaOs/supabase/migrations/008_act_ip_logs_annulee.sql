-- =============================================================================
-- Migration — act_ip_logs : statut Annulee (annulation IP)
-- =============================================================================

ALTER TABLE "PharmaOs".act_ip_logs DROP CONSTRAINT IF EXISTS act_ip_logs_statut_ip_check;

ALTER TABLE "PharmaOs".act_ip_logs
  ADD CONSTRAINT act_ip_logs_statut_ip_check
  CHECK (statut_ip = ANY (ARRAY[
    'En attente'::text,
    'Cloturee'::text,
    'Déclaré'::text,
    'Annulee'::text
  ]));
