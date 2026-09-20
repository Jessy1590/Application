-- =============================================================================
-- 032 — RLS tâches : soi vs administrateur
-- SELECT : assigné ou créateur ou administrateur app
-- INSERT assignments : staff (producteurs) ; UPDATE own ou admin
-- NOTE : les EXISTS croisés ci-dessous provoquent une récursion RLS —
-- corrigé par 033_tasks_rls_no_recursion.sql (helpers SECURITY DEFINER).
-- =============================================================================

DROP POLICY IF EXISTS "tasks_select_authenticated" ON "PharmaOs".tasks;
DROP POLICY IF EXISTS "tasks_select_own_or_admin" ON "PharmaOs".tasks;
CREATE POLICY "tasks_select_own_or_admin" ON "PharmaOs".tasks
  FOR SELECT TO authenticated
  USING (
    "PharmaOs".is_app_administrateur()
    OR created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM "PharmaOs".task_assignments ta
      WHERE ta.task_id = tasks.id AND ta.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "tasks_update_creator" ON "PharmaOs".tasks;
DROP POLICY IF EXISTS "tasks_update_creator_or_admin" ON "PharmaOs".tasks;
CREATE POLICY "tasks_update_creator_or_admin" ON "PharmaOs".tasks
  FOR UPDATE TO authenticated
  USING (
    created_by = auth.uid()
    OR "PharmaOs".is_app_administrateur()
    OR "PharmaOs".is_pharma_admin()
  )
  WITH CHECK (
    created_by = auth.uid()
    OR "PharmaOs".is_app_administrateur()
    OR "PharmaOs".is_pharma_admin()
  );

-- Admin all conserve la couverture DELETE / gestion globale
DROP POLICY IF EXISTS "tasks_admin_all" ON "PharmaOs".tasks;
CREATE POLICY "tasks_admin_all" ON "PharmaOs".tasks
  FOR ALL TO authenticated
  USING ("PharmaOs".is_app_administrateur() OR "PharmaOs".is_pharma_admin())
  WITH CHECK ("PharmaOs".is_app_administrateur() OR "PharmaOs".is_pharma_admin());

DROP POLICY IF EXISTS "task_assignments_select_authenticated" ON "PharmaOs".task_assignments;
DROP POLICY IF EXISTS "task_assignments_select_own_or_admin" ON "PharmaOs".task_assignments;
CREATE POLICY "task_assignments_select_own_or_admin" ON "PharmaOs".task_assignments
  FOR SELECT TO authenticated
  USING (
    "PharmaOs".is_app_administrateur()
    OR user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM "PharmaOs".tasks t
      WHERE t.id = task_assignments.task_id AND t.created_by = auth.uid()
    )
    OR "PharmaOs".is_pharma_admin()
  );

DROP POLICY IF EXISTS "task_assignments_insert_authenticated" ON "PharmaOs".task_assignments;
DROP POLICY IF EXISTS "task_assignments_insert_staff" ON "PharmaOs".task_assignments;
CREATE POLICY "task_assignments_insert_staff" ON "PharmaOs".task_assignments
  FOR INSERT TO authenticated
  WITH CHECK ("PharmaOs".is_pharma_staff());

DROP POLICY IF EXISTS "task_assignments_update_own" ON "PharmaOs".task_assignments;
CREATE POLICY "task_assignments_update_own" ON "PharmaOs".task_assignments
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "task_assignments_admin_update" ON "PharmaOs".task_assignments;
CREATE POLICY "task_assignments_admin_update" ON "PharmaOs".task_assignments
  FOR UPDATE TO authenticated
  USING ("PharmaOs".is_app_administrateur() OR "PharmaOs".is_pharma_admin())
  WITH CHECK ("PharmaOs".is_app_administrateur() OR "PharmaOs".is_pharma_admin());

-- Escalade after_delay (bypass RLS lecture pour scanner les tâches ouvertes)
CREATE OR REPLACE FUNCTION "PharmaOs".ensure_task_escalations()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = "PharmaOs", portail, pg_temp
AS $$
DECLARE
  added integer := 0;
  t record;
  r record;
  p record;
  cat text;
  age_hours numeric;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN 0;
  END IF;
  IF NOT "PharmaOs".is_pharma_staff() THEN
    RETURN 0;
  END IF;

  FOR t IN
    SELECT tk.id, tk.titre, tk.description, tk.created_at
    FROM "PharmaOs".tasks tk
    WHERE EXISTS (
      SELECT 1 FROM "PharmaOs".task_assignments ta
      WHERE ta.task_id = tk.id AND ta.statut = 'en_cours'
    )
  LOOP
    BEGIN
      cat := NULLIF(t.description::jsonb ->> 'type', '');
    EXCEPTION WHEN OTHERS THEN
      CONTINUE;
    END;
    IF cat IS NULL THEN
      CONTINUE;
    END IF;

    age_hours := EXTRACT(EPOCH FROM (now() - t.created_at)) / 3600.0;

    FOR r IN
      SELECT role, delay_hours
      FROM "PharmaOs".task_role_rules
      WHERE category = cat
        AND mode = 'after_delay'
        AND delay_hours IS NOT NULL
        AND delay_hours > 0
        AND age_hours >= delay_hours
    LOOP
      FOR p IN
        SELECT id
        FROM portail.profiles
        WHERE portail.canonical_role(role) = r.role
      LOOP
        IF NOT EXISTS (
          SELECT 1 FROM "PharmaOs".task_assignments ta
          WHERE ta.task_id = t.id AND ta.user_id = p.id
        ) THEN
          INSERT INTO "PharmaOs".task_assignments (task_id, user_id, statut)
          VALUES (t.id, p.id, 'en_cours');
          added := added + 1;
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;

  RETURN added;
END;
$$;

REVOKE ALL ON FUNCTION "PharmaOs".ensure_task_escalations() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "PharmaOs".ensure_task_escalations() TO authenticated;
