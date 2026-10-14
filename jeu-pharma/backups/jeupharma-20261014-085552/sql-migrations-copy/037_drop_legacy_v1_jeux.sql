-- 037 : Purge stack jeux legacy V1 (hors modeles_jeu / tentatives_jeu / scores_fiche_aleatoire)
-- Prérequis : backup manuel jeupharma effectué.
-- Ne touche PAS aux tables référentiel / parcours V2.

BEGIN;

-- Réponses / parties quiz & trous V1
DROP TABLE IF EXISTS jeupharma.quizz_reponses_utilisateur CASCADE;
DROP TABLE IF EXISTS jeupharma.quizz CASCADE;
DROP TABLE IF EXISTS jeupharma.parties_reponses_utilisateur CASCADE;
DROP TABLE IF EXISTS jeupharma.parties_tableau_trous CASCADE;

-- RPC quiz V1 (remplacées par modeles_jeu + tentatives_jeu côté app)
DROP FUNCTION IF EXISTS jeupharma.soumettre_quiz(uuid, jsonb);
DROP FUNCTION IF EXISTS jeupharma.soumettre_quiz(uuid, json);
DROP FUNCTION IF EXISTS jeupharma.generer_et_geler_quiz(uuid);
DROP FUNCTION IF EXISTS jeupharma.ouvrir_quiz(uuid);
DROP FUNCTION IF EXISTS jeupharma.v2_backfill_connaissances_from_v1();

-- Variantes éventuelles de signatures
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'jeupharma'
      AND p.proname IN (
        'soumettre_quiz',
        'generer_et_geler_quiz',
        'ouvrir_quiz',
        'v2_backfill_connaissances_from_v1'
      )
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;

COMMIT;
