-- =============================================================================
-- RLS — module magistral
-- Policies live : magistral_orders_staff_all, magistral_settings_staff_all
-- (ALL authenticated via PharmaOs.is_pharma_staff())
-- Storage : magistral-ordonnances — SELECT/INSERT/UPDATE/DELETE staff
-- =============================================================================

ALTER TABLE "PharmaOs".magistral_settings ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON "PharmaOs".magistral_settings TO authenticated;
DROP POLICY IF EXISTS "magistral_settings_staff_all" ON "PharmaOs".magistral_settings;
CREATE POLICY "magistral_settings_staff_all" ON "PharmaOs".magistral_settings
  FOR ALL TO authenticated
  USING ("PharmaOs".is_pharma_staff())
  WITH CHECK ("PharmaOs".is_pharma_staff());

ALTER TABLE "PharmaOs".magistral_orders ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON "PharmaOs".magistral_orders TO authenticated;
DROP POLICY IF EXISTS "magistral_orders_staff_all" ON "PharmaOs".magistral_orders;
CREATE POLICY "magistral_orders_staff_all" ON "PharmaOs".magistral_orders
  FOR ALL TO authenticated
  USING ("PharmaOs".is_pharma_staff())
  WITH CHECK ("PharmaOs".is_pharma_staff());
