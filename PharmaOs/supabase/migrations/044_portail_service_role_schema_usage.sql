-- 044 — Edge Functions : accès schema portail + is_admin legacy
-- Corrige « permission denied for schema portail » (service_role sans USAGE).

GRANT USAGE ON SCHEMA portail TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA portail TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA portail TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA portail GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA portail GRANT ALL ON SEQUENCES TO service_role;

-- Portail UI utilise role = 'admin' ; is_admin() ne le reconnaissait pas.
CREATE OR REPLACE FUNCTION portail.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'portail', 'pg_temp'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM portail.profiles
    WHERE id = auth.uid()
      AND (
        role = 'admin'
        OR portail.canonical_role(role) IN ('administrateur', 'pharmacien')
      )
  );
$$;
