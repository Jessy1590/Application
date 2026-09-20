-- Autocorrection : UPDATE own sur saisies non clôturées.
-- Aligne aussi les policies admin legacy (role = 'admin') sur is_pharma_admin / is_pharma_staff.

-- === call_logs ===
DROP POLICY IF EXISTS "Admins can update call logs" ON "PharmaOs".call_logs;
DROP POLICY IF EXISTS "call_logs_admin_update" ON "PharmaOs".call_logs;
DROP POLICY IF EXISTS "call_logs_admin_select" ON "PharmaOs".call_logs;

CREATE POLICY "call_logs_admin_select" ON "PharmaOs".call_logs
  FOR SELECT TO authenticated
  USING ("PharmaOs".is_pharma_admin());

CREATE POLICY "call_logs_admin_update" ON "PharmaOs".call_logs
  FOR UPDATE TO authenticated
  USING ("PharmaOs".is_pharma_admin())
  WITH CHECK ("PharmaOs".is_pharma_admin());

DROP POLICY IF EXISTS "call_logs_update_own" ON "PharmaOs".call_logs;
CREATE POLICY "call_logs_update_own" ON "PharmaOs".call_logs
  FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    AND COALESCE(statut_traitement, '') NOT IN ('cloture', 'annule')
  )
  WITH CHECK (user_id = auth.uid());

-- === quality_events ===
DROP POLICY IF EXISTS "quality_events_update_admin" ON "PharmaOs".quality_events;
DROP POLICY IF EXISTS "quality_events_admin_select" ON "PharmaOs".quality_events;
DROP POLICY IF EXISTS "quality_events_select_admin" ON "PharmaOs".quality_events;
DROP POLICY IF EXISTS "portail admin view all quality_events" ON "PharmaOs".quality_events;

CREATE POLICY "quality_events_admin_select" ON "PharmaOs".quality_events
  FOR SELECT TO authenticated
  USING ("PharmaOs".is_pharma_admin());

CREATE POLICY "quality_events_update_admin" ON "PharmaOs".quality_events
  FOR UPDATE TO authenticated
  USING ("PharmaOs".is_pharma_admin())
  WITH CHECK ("PharmaOs".is_pharma_admin());

DROP POLICY IF EXISTS "quality_events_update_own" ON "PharmaOs".quality_events;
CREATE POLICY "quality_events_update_own" ON "PharmaOs".quality_events
  FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    AND COALESCE(status, '') NOT IN ('cloture', 'annule')
  )
  WITH CHECK (user_id = auth.uid());

-- === stock_errors ===
DROP POLICY IF EXISTS "stock_errors_update_admin" ON "PharmaOs".stock_errors;
DROP POLICY IF EXISTS "stock_errors_select_team" ON "PharmaOs".stock_errors;

CREATE POLICY "stock_errors_select_team" ON "PharmaOs".stock_errors
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR "PharmaOs".is_pharma_staff());

CREATE POLICY "stock_errors_update_admin" ON "PharmaOs".stock_errors
  FOR UPDATE TO authenticated
  USING ("PharmaOs".is_pharma_admin())
  WITH CHECK ("PharmaOs".is_pharma_admin());

DROP POLICY IF EXISTS "stock_errors_update_own" ON "PharmaOs".stock_errors;
CREATE POLICY "stock_errors_update_own" ON "PharmaOs".stock_errors
  FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    AND COALESCE(status, '') IN ('ouvert', 'pending', 'en_attente')
  )
  WITH CHECK (user_id = auth.uid());
