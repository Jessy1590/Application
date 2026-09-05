-- =============================================================================
-- Tables — module agenda
-- DDL aligné projet Supabase live kpjflntnotftpzffjbud (2026-09-03)
-- Rôles canoniques app : admin | équipe (member = legacy CHECK seulement)
-- Source module : src/modules/agenda/sql/tables.sql
-- =============================================================================
-- --- PharmaOs.agenda_events ---
CREATE TABLE IF NOT EXISTS "PharmaOs".agenda_events (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  type text,
  date_evenement timestamptz NOT NULL,
  details jsonb NOT NULL,
  created_at timestamptz DEFAULT now(),
  CHECK ((type = ANY (ARRAY['commande_med'::text, 'facturation'::text, 'changement_horaire'::text]))),
  PRIMARY KEY ("id")
);
