-- =============================================================================
-- 020 — MDS : séquence registre + grants (fix permission denied)
-- =============================================================================
-- Erreur observée côté client :
--   permission denied for sequence mds_registry_seq
-- Le trigger BEFORE INSERT sur psl_movements appelle nextval() ;
-- authenticated n'avait pas USAGE sur la séquence.
-- SECURITY DEFINER sur la fonction + GRANT USAGE sécurise le flux délivrance.

CREATE SEQUENCE IF NOT EXISTS "PharmaOs".mds_registry_seq;

CREATE OR REPLACE FUNCTION "PharmaOs".assign_mds_registry_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = "PharmaOs", public
AS $function$
BEGIN
  IF NEW.movement_type = 'delivrance' AND NEW.registry_number IS NULL THEN
    NEW.registry_number := nextval('"PharmaOs".mds_registry_seq');
    IF NEW.date_delivrance IS NULL THEN
      NEW.date_delivrance := CURRENT_DATE;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_mds_registry_number ON "PharmaOs".psl_movements;
CREATE TRIGGER trg_mds_registry_number
  BEFORE INSERT ON "PharmaOs".psl_movements
  FOR EACH ROW
  EXECUTE FUNCTION "PharmaOs".assign_mds_registry_number();

GRANT USAGE, SELECT ON SEQUENCE "PharmaOs".mds_registry_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE "PharmaOs".mds_registry_seq TO anon;
GRANT USAGE, SELECT ON SEQUENCE "PharmaOs".mds_registry_seq TO service_role;
