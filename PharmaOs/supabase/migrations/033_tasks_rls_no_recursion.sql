-- =============================================================================
-- 033 — Corrige la récursion RLS tasks ↔ task_assignments (032)
-- Les policies SELECT se référenciaient mutuellement via EXISTS → erreur
-- « infinite recursion detected in policy for relation "task_assignments" ».
-- Helpers SECURITY DEFINER + nettoyage des policies legacy permissives.
-- =============================================================================

CREATE OR REPLACE FUNCTION "PharmaOs".is_task_assignee(p_task_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = "PharmaOs", pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM "PharmaOs".task_assignments ta
    WHERE ta.task_id = p_task_id
      AND ta.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION "PharmaOs".is_task_creator(p_task_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = "PharmaOs", pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM "PharmaOs".tasks t
    WHERE t.id = p_task_id
      AND t.created_by = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION "PharmaOs".is_task_assignee(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION "PharmaOs".is_task_creator(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "PharmaOs".is_task_assignee(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION "PharmaOs".is_task_creator(uuid) TO authenticated;

-- --- tasks SELECT ---
DROP POLICY IF EXISTS "tasks_select_own_or_admin" ON "PharmaOs".tasks;
DROP POLICY IF EXISTS "Lecture de toutes les tâches" ON "PharmaOs".tasks;
DROP POLICY IF EXISTS "Tasks Access" ON "PharmaOs".tasks;
DROP POLICY IF EXISTS "tasks_select_authenticated" ON "PharmaOs".tasks;

CREATE POLICY "tasks_select_own_or_admin" ON "PharmaOs".tasks
  FOR SELECT TO authenticated
  USING (
    "PharmaOs".is_app_administrateur()
    OR "PharmaOs".is_pharma_admin()
    OR created_by = auth.uid()
    OR "PharmaOs".is_task_assignee(id)
  );

-- --- task_assignments SELECT ---
DROP POLICY IF EXISTS "task_assignments_select_own_or_admin" ON "PharmaOs".task_assignments;
DROP POLICY IF EXISTS "Lecture des assignations" ON "PharmaOs".task_assignments;
DROP POLICY IF EXISTS "Assignments Access" ON "PharmaOs".task_assignments;
DROP POLICY IF EXISTS "task_assignments_select_authenticated" ON "PharmaOs".task_assignments;

CREATE POLICY "task_assignments_select_own_or_admin" ON "PharmaOs".task_assignments
  FOR SELECT TO authenticated
  USING (
    "PharmaOs".is_app_administrateur()
    OR "PharmaOs".is_pharma_admin()
    OR user_id = auth.uid()
    OR "PharmaOs".is_task_creator(task_id)
  );
