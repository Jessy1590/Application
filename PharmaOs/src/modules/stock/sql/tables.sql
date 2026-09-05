-- =============================================================================
-- Tables — module stock
-- DDL aligné projet Supabase live kpjflntnotftpzffjbud (2026-09-03)
-- Rôles canoniques app : admin | équipe (member = legacy CHECK seulement)
-- Source module : src/modules/stock/sql/tables.sql
-- =============================================================================
-- --- PharmaOs.stock_errors ---
CREATE TABLE IF NOT EXISTS "PharmaOs".stock_errors (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  medicament text NOT NULL,
  cip text,
  quantite_theorique integer,
  quantite_constatee integer,
  description text,
  status text DEFAULT 'ouvert'::text NOT NULL,
  admin_decision text,
  admin_notes text,
  task_id uuid,
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL,
  FOREIGN KEY (resolved_by) REFERENCES auth.users(id),
  FOREIGN KEY (user_id) REFERENCES auth.users(id),
  PRIMARY KEY ("id")
);
