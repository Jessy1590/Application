-- =============================================================================
-- Tables — module quality
-- DDL aligné projet Supabase live kpjflntnotftpzffjbud (2026-09-03)
-- Rôles canoniques app : admin | équipe (member = legacy CHECK seulement)
-- Source module : src/modules/quality/sql/tables.sql
-- =============================================================================
-- --- PharmaOs.quality_events ---
CREATE TABLE IF NOT EXISTS "PharmaOs".quality_events (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  type text NOT NULL,
  data jsonb,
  created_at timestamptz DEFAULT now() NOT NULL,
  status text DEFAULT 'ouvert'::text NOT NULL,
  severity text DEFAULT 'mineure'::text NOT NULL,
  capa_action text,
  capa_status text DEFAULT 'en_attente'::text,
  resolved_at timestamptz,
  resolved_by uuid,
  FOREIGN KEY (resolved_by) REFERENCES auth.users(id),
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  PRIMARY KEY ("id")
);
