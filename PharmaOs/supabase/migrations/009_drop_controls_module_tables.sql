-- =============================================================================
-- 009 — Suppression module Contrôles qualité (controls)
-- Tables dédiées uniquement : daily_controls, equipment_calibrations
-- Ne touche PAS quality_events / module quality.
-- CASCADE retire RLS policies + grants associés.
-- =============================================================================

DROP TABLE IF EXISTS "PharmaOs".equipment_calibrations CASCADE;
DROP TABLE IF EXISTS "PharmaOs".daily_controls CASCADE;
