-- =============================================================================
-- Migration — call_logs (groupe Communication)
-- Nouveaux contrats :
--   type : recu | envoye
--   motif : intervention_pharmaceutique | commande_labo | reclamation_patient | reception_du | autre
--   statut_traitement : resolu | a_rappeler | attente_pharmacien | cloture
--     cloture = pharmacien dashboard uniquement
-- =============================================================================

ALTER TABLE "PharmaOs".call_logs DROP CONSTRAINT IF EXISTS call_logs_type_check;
ALTER TABLE "PharmaOs".call_logs DROP CONSTRAINT IF EXISTS call_logs_motif_check;
ALTER TABLE "PharmaOs".call_logs DROP CONSTRAINT IF EXISTS call_logs_statut_traitement_check;

UPDATE "PharmaOs".call_logs SET type = CASE
  WHEN type IN ('in', 'missed') THEN 'recu'
  WHEN type = 'out' THEN 'envoye'
  ELSE type
END
WHERE type IN ('in', 'out', 'missed');

UPDATE "PharmaOs".call_logs SET motif = CASE
  WHEN motif = 'information_medicale' THEN 'intervention_pharmaceutique'
  WHEN motif = 'renseignement_patient' THEN 'autre'
  ELSE motif
END
WHERE motif IN ('information_medicale', 'renseignement_patient');

UPDATE "PharmaOs".call_logs SET statut_traitement = CASE
  WHEN statut_traitement IN ('transmis_pharmacien', 'en_attente') THEN 'attente_pharmacien'
  ELSE statut_traitement
END
WHERE statut_traitement IN ('transmis_pharmacien', 'en_attente');

ALTER TABLE "PharmaOs".call_logs
  ALTER COLUMN statut_traitement SET DEFAULT 'resolu';

ALTER TABLE "PharmaOs".call_logs
  ADD CONSTRAINT call_logs_type_check
  CHECK (type = ANY (ARRAY['recu'::text, 'envoye'::text]));

ALTER TABLE "PharmaOs".call_logs
  ADD CONSTRAINT call_logs_motif_check
  CHECK (motif IS NULL OR motif = ANY (ARRAY[
    'intervention_pharmaceutique'::text,
    'commande_labo'::text,
    'reclamation_patient'::text,
    'reception_du'::text,
    'autre'::text
  ]));

ALTER TABLE "PharmaOs".call_logs
  ADD CONSTRAINT call_logs_statut_traitement_check
  CHECK (statut_traitement = ANY (ARRAY[
    'resolu'::text,
    'a_rappeler'::text,
    'attente_pharmacien'::text,
    'cloture'::text
  ]));
