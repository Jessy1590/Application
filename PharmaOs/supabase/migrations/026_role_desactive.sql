-- =============================================================================
-- 026 — rôle désactivé (aucun accès PharmaOS)
-- =============================================================================

CREATE OR REPLACE FUNCTION portail.canonical_role(p_role text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = portail, pg_temp
AS $$
  SELECT CASE
    WHEN p_role = 'admin' THEN 'administrateur'
    WHEN p_role IN ('équipe', 'member') THEN 'préparateur'
    WHEN p_role IN ('pharmacien', 'administrateur', 'gestionnaire', 'préparateur', 'désactivé') THEN p_role
    ELSE 'préparateur'
  END;
$$;

REVOKE ALL ON FUNCTION portail.canonical_role(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION portail.canonical_role(text) TO authenticated, anon;

DO $$
DECLARE
  cname text;
BEGIN
  FOR cname IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'portail'
      AND rel.relname = 'profiles'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%role%'
  LOOP
    EXECUTE format('ALTER TABLE portail.profiles DROP CONSTRAINT %I', cname);
  END LOOP;
END $$;

ALTER TABLE portail.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role = ANY (ARRAY[
    'admin'::text, 'équipe'::text, 'member'::text,
    'pharmacien'::text, 'administrateur'::text, 'gestionnaire'::text, 'préparateur'::text,
    'désactivé'::text
  ]));
