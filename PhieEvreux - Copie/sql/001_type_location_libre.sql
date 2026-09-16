-- =============================================================================
-- autres.phie_evreux : type_location accepte un type d'appareil libre
--
-- L'app propose « Autres… » pour saisir un type inédit (concentrateur
-- d'oxygène, fauteuil roulant…). Un CHECK figeant la liste historique
-- « Lit / Tire lait / Aérosol » ferait échouer ces enregistrements.
--
-- À exécuter dans le SQL Editor du projet kpjflntnotftpzffjbud.
-- Le nom de la contrainte n'étant pas connu, on supprime tout CHECK de la
-- table portant sur type_location. Rejouable sans effet.
-- =============================================================================

DO $$
DECLARE
  contrainte record;
BEGIN
  FOR contrainte IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'autres'
      AND rel.relname = 'phie_evreux'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%type_location%'
  LOOP
    EXECUTE format('ALTER TABLE autres.phie_evreux DROP CONSTRAINT %I', contrainte.conname);
    RAISE NOTICE 'Contrainte supprimée : %', contrainte.conname;
  END LOOP;
END $$;

-- Contrôle : aucune ligne ne doit plus mentionner type_location
SELECT con.conname, pg_get_constraintdef(con.oid) AS definition
FROM pg_constraint con
JOIN pg_class rel ON rel.oid = con.conrelid
JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
WHERE nsp.nspname = 'autres'
  AND rel.relname = 'phie_evreux'
  AND con.contype = 'c';
