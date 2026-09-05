-- =============================================================================
-- Drop tables inutilisées (0 usage JS) :
--   advice_events, magistral_providers, magistral_price_rules
-- =============================================================================

ALTER TABLE "PharmaOs".magistral_orders
  DROP CONSTRAINT IF EXISTS magistral_orders_price_rule_id_fkey;
ALTER TABLE "PharmaOs".magistral_orders
  DROP CONSTRAINT IF EXISTS magistral_orders_provider_id_fkey;

ALTER TABLE "PharmaOs".magistral_orders
  DROP COLUMN IF EXISTS price_rule_id;
ALTER TABLE "PharmaOs".magistral_orders
  DROP COLUMN IF EXISTS provider_id;

DROP TABLE IF EXISTS "PharmaOs".advice_events CASCADE;
DROP TABLE IF EXISTS "PharmaOs".magistral_price_rules CASCADE;
DROP TABLE IF EXISTS "PharmaOs".magistral_providers CASCADE;
