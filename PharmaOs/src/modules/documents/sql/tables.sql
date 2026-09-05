-- =============================================================================
-- Tables — module documents
-- DDL aligné projet Supabase live kpjflntnotftpzffjbud (2026-09-03)
-- Rôles canoniques app : admin | équipe (member = legacy CHECK seulement)
-- Source module : src/modules/documents/sql/tables.sql
-- =============================================================================
-- --- PharmaOs.documents ---
CREATE TABLE IF NOT EXISTS "PharmaOs".documents (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  title text NOT NULL,
  content text DEFAULT ''::text NOT NULL,
  version text DEFAULT '1.0'::text NOT NULL,
  category text DEFAULT 'procedure'::text NOT NULL,
  requires_signature boolean DEFAULT true NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  created_by uuid,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  FOREIGN KEY (created_by) REFERENCES auth.users(id),
  PRIMARY KEY ("id")
);

-- --- PharmaOs.document_signatures ---
CREATE TABLE IF NOT EXISTS "PharmaOs".document_signatures (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  document_id uuid NOT NULL,
  user_id uuid NOT NULL,
  document_version text NOT NULL,
  signed_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE (document_id, user_id, document_version),
  FOREIGN KEY (document_id) REFERENCES "PharmaOs".documents(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES auth.users(id),
  PRIMARY KEY ("id")
);
