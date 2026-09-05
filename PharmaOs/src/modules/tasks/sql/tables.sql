-- =============================================================================
-- Tables — module tasks
-- DDL aligné projet Supabase live kpjflntnotftpzffjbud (2026-09-03)
-- Rôles canoniques app : admin | équipe (member = legacy CHECK seulement)
-- Source module : src/modules/tasks/sql/tables.sql
-- =============================================================================
-- --- PharmaOs.tasks ---
CREATE TABLE IF NOT EXISTS "PharmaOs".tasks (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  titre text NOT NULL,
  description text,
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  FOREIGN KEY (created_by) REFERENCES portail.profiles(id),
  PRIMARY KEY ("id")
);

-- --- PharmaOs.task_assignments ---
CREATE TABLE IF NOT EXISTS "PharmaOs".task_assignments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  task_id uuid,
  user_id uuid,
  statut text DEFAULT 'en_cours'::text,
  completed_at timestamptz,
  completion_time_seconds integer,
  commentaire text,
  CHECK ((statut = ANY (ARRAY['en_cours'::text, 'terminee'::text]))),
  FOREIGN KEY (task_id) REFERENCES "PharmaOs".tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES portail.profiles(id),
  PRIMARY KEY ("id")
);
