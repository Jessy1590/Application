-- Drop unused PharmaOs tables only (controls module removed; rental superseded by location).
-- Does not touch phieevreux / portail / public / valorisation / bdm.

DROP TABLE IF EXISTS "PharmaOs".rental_events CASCADE;
DROP TABLE IF EXISTS "PharmaOs".rental_contracts CASCADE;
DROP TABLE IF EXISTS "PharmaOs".rental_assets CASCADE;
DROP TABLE IF EXISTS "PharmaOs".daily_controls CASCADE;
DROP TABLE IF EXISTS "PharmaOs".equipment_calibrations CASCADE;
