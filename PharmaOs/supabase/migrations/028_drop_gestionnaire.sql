-- =============================================================================
-- 028 — suppression du rôle portail `gestionnaire`
-- Migration → préparateur ; legacy map `gestionnaire` → `préparateur`
-- NOTE : le sous-rôle métier Location Phie `gestionnaire` reste distinct
--        (voir locationAccess.js / LocationPhieMount)
-- =============================================================================

-- Mémoriser les ex-gestionnaires pour attribution casquettes (029)
CREATE TABLE IF NOT EXISTS "PharmaOs"._migration_ex_gestionnaire (
  profile_id uuid PRIMARY KEY
);

INSERT INTO "PharmaOs"._migration_ex_gestionnaire (profile_id)
SELECT id FROM portail.profiles
WHERE role = 'gestionnaire'
ON CONFLICT DO NOTHING;

UPDATE portail.profiles
SET role = 'préparateur'
WHERE role = 'gestionnaire';

CREATE OR REPLACE FUNCTION portail.canonical_role(p_role text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = portail, pg_temp
AS $$
  SELECT CASE
    WHEN p_role = 'admin' THEN 'administrateur'
    WHEN p_role IN ('équipe', 'member') THEN 'préparateur'
    WHEN p_role = 'gestionnaire' THEN 'préparateur'
    WHEN p_role IN ('pharmacien', 'administrateur', 'préparateur', 'désactivé') THEN p_role
    ELSE 'préparateur'
  END;
$$;

REVOKE ALL ON FUNCTION portail.canonical_role(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION portail.canonical_role(text) TO authenticated, anon;

CREATE OR REPLACE FUNCTION "PharmaOs".is_pharma_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = portail, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM portail.profiles p
    WHERE p.id = auth.uid()
      AND portail.canonical_role(p.role) IN ('administrateur', 'pharmacien')
  );
$$;

CREATE OR REPLACE FUNCTION "PharmaOs".is_pharma_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = portail, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM portail.profiles p
    WHERE p.id = auth.uid()
      AND portail.canonical_role(p.role) IN ('administrateur', 'pharmacien', 'préparateur')
  );
$$;

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
    'pharmacien'::text, 'administrateur'::text, 'préparateur'::text,
    'désactivé'::text
  ]));

DELETE FROM "PharmaOs".role_access WHERE role = 'gestionnaire';

DO $$
DECLARE
  cname text;
BEGIN
  FOR cname IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'PharmaOs'
      AND rel.relname = 'role_access'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%role%'
  LOOP
    EXECUTE format('ALTER TABLE "PharmaOs".role_access DROP CONSTRAINT %I', cname);
  END LOOP;
END $$;

ALTER TABLE "PharmaOs".role_access
  ADD CONSTRAINT role_access_role_check
  CHECK (role = ANY (ARRAY[
    'pharmacien'::text, 'administrateur'::text, 'préparateur'::text
  ]));
