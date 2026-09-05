-- =============================================================================
-- 003 — tasks / logs
-- DDL aligné projet Supabase live kpjflntnotftpzffjbud (2026-09-03)
-- Rôles canoniques app : admin | équipe (member = legacy CHECK seulement)
-- Source module : src/modules/tasks/sql/
-- Source module : src/modules/home/sql/
-- =============================================================================

-- >>> src/modules/tasks/sql :: PharmaOs.tasks
CREATE TABLE IF NOT EXISTS "PharmaOs".tasks (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  titre text NOT NULL,
  description text,
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  FOREIGN KEY (created_by) REFERENCES portail.profiles(id),
  PRIMARY KEY ("id")
);

-- >>> src/modules/tasks/sql :: PharmaOs.task_assignments
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

-- >>> src/modules/home/sql :: PharmaOs.taskbar_logs
CREATE TABLE IF NOT EXISTS "PharmaOs".taskbar_logs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  action text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  CHECK ((action = ANY (ARRAY['collapse'::text, 'expand'::text, 'login'::text]))),
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  PRIMARY KEY ("id")
);

-- >>> src/modules/home/sql :: PharmaOs.advice_events
CREATE TABLE IF NOT EXISTS "PharmaOs".advice_events (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  type text NOT NULL,
  status text NOT NULL,
  data jsonb,
  created_at timestamptz DEFAULT now() NOT NULL,
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  PRIMARY KEY ("id")
);

ALTER TABLE "PharmaOs".tasks ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON "PharmaOs".tasks TO authenticated;
DROP POLICY IF EXISTS "tasks_select_authenticated" ON "PharmaOs".tasks;
CREATE POLICY "tasks_select_authenticated" ON "PharmaOs".tasks
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "tasks_insert_creator" ON "PharmaOs".tasks;
CREATE POLICY "tasks_insert_creator" ON "PharmaOs".tasks
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "tasks_update_creator" ON "PharmaOs".tasks;
CREATE POLICY "tasks_update_creator" ON "PharmaOs".tasks
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid());

DROP POLICY IF EXISTS "tasks_admin_all" ON "PharmaOs".tasks;
CREATE POLICY "tasks_admin_all" ON "PharmaOs".tasks
  FOR ALL TO authenticated
  USING ("PharmaOs".is_pharma_admin())
  WITH CHECK ("PharmaOs".is_pharma_admin());


ALTER TABLE "PharmaOs".task_assignments ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON "PharmaOs".task_assignments TO authenticated;
DROP POLICY IF EXISTS "task_assignments_select_authenticated" ON "PharmaOs".task_assignments;
CREATE POLICY "task_assignments_select_authenticated" ON "PharmaOs".task_assignments
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "task_assignments_insert_authenticated" ON "PharmaOs".task_assignments;
CREATE POLICY "task_assignments_insert_authenticated" ON "PharmaOs".task_assignments
  FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "task_assignments_update_own" ON "PharmaOs".task_assignments;
CREATE POLICY "task_assignments_update_own" ON "PharmaOs".task_assignments
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "task_assignments_admin_update" ON "PharmaOs".task_assignments;
CREATE POLICY "task_assignments_admin_update" ON "PharmaOs".task_assignments
  FOR UPDATE TO authenticated
  USING ("PharmaOs".is_pharma_admin());


-- Clôture globale (completeTaskGlobal) : UPDATE admin sur TOUTES les assignations d'une task_id

ALTER TABLE "PharmaOs".taskbar_logs ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON "PharmaOs".taskbar_logs TO authenticated;
DROP POLICY IF EXISTS "taskbar_logs_insert_own" ON "PharmaOs".taskbar_logs;
CREATE POLICY "taskbar_logs_insert_own" ON "PharmaOs".taskbar_logs
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "taskbar_logs_select_own" ON "PharmaOs".taskbar_logs;
CREATE POLICY "taskbar_logs_select_own" ON "PharmaOs".taskbar_logs
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "taskbar_logs_admin_select" ON "PharmaOs".taskbar_logs;
CREATE POLICY "taskbar_logs_admin_select" ON "PharmaOs".taskbar_logs
  FOR SELECT TO authenticated
  USING ("PharmaOs".is_pharma_admin());


ALTER TABLE "PharmaOs".advice_events ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON "PharmaOs".advice_events TO authenticated;
DROP POLICY IF EXISTS "advice_events_insert_own" ON "PharmaOs".advice_events;
CREATE POLICY "advice_events_insert_own" ON "PharmaOs".advice_events
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "advice_events_select_own" ON "PharmaOs".advice_events;
CREATE POLICY "advice_events_select_own" ON "PharmaOs".advice_events
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "advice_events_admin_select" ON "PharmaOs".advice_events;
CREATE POLICY "advice_events_admin_select" ON "PharmaOs".advice_events
  FOR SELECT TO authenticated
  USING ("PharmaOs".is_pharma_admin());

