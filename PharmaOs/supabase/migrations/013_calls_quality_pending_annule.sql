-- =============================================================================
-- call_logs : brouillon (mise en attente de saisie) + annule
-- quality_events : status en_attente + annule (flux comme IP / litiges)
-- =============================================================================

ALTER TABLE "PharmaOs".call_logs DROP CONSTRAINT IF EXISTS call_logs_statut_traitement_check;

ALTER TABLE "PharmaOs".call_logs
  ADD CONSTRAINT call_logs_statut_traitement_check
  CHECK (statut_traitement = ANY (ARRAY[
    'resolu'::text,
    'a_rappeler'::text,
    'attente_pharmacien'::text,
    'cloture'::text,
    'brouillon'::text,
    'annule'::text
  ]));

-- quality_events.status n'a pas de CHECK historique ; on documente les valeurs
COMMENT ON COLUMN "PharmaOs".quality_events.status IS
  'ouvert | en_attente | en_analyse | cloture | annule';
