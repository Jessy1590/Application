-- =============================================================================
-- Tables — module cash
-- DDL aligné projet Supabase live kpjflntnotftpzffjbud (2026-09-03)
-- Rôles canoniques app : admin | équipe (member = legacy CHECK seulement)
-- Source module : src/modules/cash/sql/tables.sql
-- =============================================================================
-- --- PharmaOs.cash_closures ---
CREATE TABLE IF NOT EXISTS "PharmaOs".cash_closures (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  closure_date date NOT NULL,
  author_id uuid NOT NULL,
  author_name text,
  fond_reel numeric DEFAULT 0 NOT NULL,
  fond_logiciel numeric DEFAULT 0 NOT NULL,
  montant_cb numeric DEFAULT 0 NOT NULL,
  argent_lieu_sur numeric DEFAULT 0 NOT NULL,
  nb_cheques integer DEFAULT 0 NOT NULL,
  montant_cheques numeric DEFAULT 0 NOT NULL,
  garde boolean DEFAULT false NOT NULL,
  sortie_particuliere boolean DEFAULT false NOT NULL,
  sortie_montant numeric DEFAULT 0,
  sortie_motif text,
  notes text,
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE (closure_date, author_id),
  FOREIGN KEY (author_id) REFERENCES portail.profiles(id) ON DELETE RESTRICT,
  PRIMARY KEY ("id")
);

-- --- PharmaOs.app_settings ---
CREATE TABLE IF NOT EXISTS "PharmaOs".app_settings (
  key text NOT NULL,
  value jsonb DEFAULT '{}'::jsonb NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY ("key")
);
