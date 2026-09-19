-- =============================================================================
-- Import phieevreux.location_* → "PharmaOs".location_*
-- Exécuté via MCP execute_sql (2026-09-19) — IDs préservés, idempotent ON CONFLICT.
-- Source intacte : phieevreux n’est PAS modifié.
-- =============================================================================
-- Prérequis : tables + RLS PharmaOs déjà appliqués (tables.sql / rls.sql).
-- Volumes source (réf.) :
--   patients 17 | dossiers 13 | appareils 13 | prolongations 38 | contacts 26
--   champs_creation 20 | templates 4 | regles 3 | prestataires 1 | parametres 8
--   suivi_lignes 0
-- =============================================================================

BEGIN;

-- Remplace les seeds PharmaOs (3 clés) par le jeu phieevreux (8 clés métier).
DELETE FROM "PharmaOs".location_parametres;

INSERT INTO "PharmaOs".location_patients
SELECT * FROM phieevreux.location_patients
ON CONFLICT (id) DO NOTHING;

INSERT INTO "PharmaOs".location_prestataires
SELECT * FROM phieevreux.location_prestataires
ON CONFLICT (id) DO NOTHING;

INSERT INTO "PharmaOs".location_templates_contact
SELECT * FROM phieevreux.location_templates_contact
ON CONFLICT (id) DO NOTHING;

INSERT INTO "PharmaOs".location_parametres
SELECT * FROM phieevreux.location_parametres
ON CONFLICT (id) DO NOTHING;

INSERT INTO "PharmaOs".location_champs_creation
SELECT * FROM phieevreux.location_champs_creation
ON CONFLICT (id) DO NOTHING;

INSERT INTO "PharmaOs".location_dossiers
SELECT * FROM phieevreux.location_dossiers
ON CONFLICT (id) DO NOTHING;

INSERT INTO "PharmaOs".location_appareils
SELECT * FROM phieevreux.location_appareils
ON CONFLICT (id) DO NOTHING;

INSERT INTO "PharmaOs".location_prolongations
SELECT * FROM phieevreux.location_prolongations
ON CONFLICT (id) DO NOTHING;

INSERT INTO "PharmaOs".location_contacts
SELECT * FROM phieevreux.location_contacts
ON CONFLICT (id) DO NOTHING;

INSERT INTO "PharmaOs".location_suivi_lignes
SELECT * FROM phieevreux.location_suivi_lignes
ON CONFLICT (id) DO NOTHING;

INSERT INTO "PharmaOs".location_regles
SELECT * FROM phieevreux.location_regles
ON CONFLICT (id) DO NOTHING;

COMMIT;

-- Vérif post-import (à lancer séparément) :
-- SELECT table_name,
--   (SELECT count(*) FROM phieevreux.location_patients) ...
