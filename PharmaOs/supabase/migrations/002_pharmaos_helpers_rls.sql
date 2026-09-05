-- =============================================================================
-- 002 — schéma PharmaOs + helpers RLS
-- DDL aligné projet Supabase live kpjflntnotftpzffjbud (2026-09-03)
-- Rôles canoniques app : admin | équipe (member = legacy CHECK seulement)
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS "PharmaOs";
GRANT USAGE ON SCHEMA "PharmaOs" TO authenticated, anon;

CREATE OR REPLACE FUNCTION "PharmaOs".is_pharma_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = portail, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM portail.profiles p
    WHERE p.id = auth.uid() AND p.role = 'admin'
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
      AND p.role IN ('admin', 'équipe')
  );
$$;

REVOKE ALL ON FUNCTION "PharmaOs".is_pharma_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION "PharmaOs".is_pharma_staff() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "PharmaOs".is_pharma_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION "PharmaOs".is_pharma_staff() TO authenticated;
