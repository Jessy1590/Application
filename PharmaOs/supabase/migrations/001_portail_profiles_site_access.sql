-- =============================================================================
-- 001 — portail.profiles + sites / accès
-- DDL aligné projet Supabase live kpjflntnotftpzffjbud (2026-09-03)
-- Rôles canoniques app : admin | équipe (member = legacy CHECK seulement)
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS portail;
GRANT USAGE ON SCHEMA portail TO authenticated, anon;

CREATE OR REPLACE FUNCTION portail.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = portail
AS $$
  SELECT EXISTS (
    SELECT 1 FROM portail.profiles WHERE id = auth.uid() AND role = 'admin'
  );
$$;
REVOKE ALL ON FUNCTION portail.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION portail.is_admin() TO authenticated;

-- >>> portail.profiles (DEFAULT role = équipe — canonique app)
CREATE TABLE IF NOT EXISTS portail.profiles (
  id uuid NOT NULL,
  email text,
  display_name text,
  role text DEFAULT 'équipe'::text NOT NULL,
  created_at timestamptz DEFAULT now(),
  CHECK ((role = ANY (ARRAY['admin'::text, 'équipe'::text, 'member'::text]))),
  FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE,
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS portail.sites (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  description text,
  url text NOT NULL,
  icon text DEFAULT '🔗'::text,
  color text DEFAULT '#4FD1C5'::text,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS portail.site_access (
  user_id uuid NOT NULL,
  site_id uuid NOT NULL,
  granted_at timestamptz DEFAULT now(),
  FOREIGN KEY (site_id) REFERENCES portail.sites(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES portail.profiles(id) ON DELETE CASCADE,
  PRIMARY KEY ("user_id", "site_id")
);

CREATE TABLE IF NOT EXISTS portail.access_requests (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  site_id uuid NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL,
  requested_at timestamptz DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid,
  CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text]))),
  FOREIGN KEY (reviewed_by) REFERENCES portail.profiles(id),
  FOREIGN KEY (site_id) REFERENCES portail.sites(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES portail.profiles(id) ON DELETE CASCADE,
  PRIMARY KEY ("id")
);

ALTER TABLE portail.profiles ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON portail.profiles TO authenticated;
ALTER TABLE portail.sites ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON portail.sites TO authenticated;
ALTER TABLE portail.site_access ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON portail.site_access TO authenticated;
ALTER TABLE portail.access_requests ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON portail.access_requests TO authenticated;

DROP POLICY IF EXISTS "profiles_select_authenticated" ON portail.profiles;
CREATE POLICY "profiles_select_authenticated" ON portail.profiles
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "profiles_insert_own" ON portail.profiles;
CREATE POLICY "profiles_insert_own" ON portail.profiles
  FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "profiles_update_own" ON portail.profiles;
CREATE POLICY "profiles_update_own" ON portail.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid() OR portail.is_admin())
  WITH CHECK (id = auth.uid() OR portail.is_admin());


DROP POLICY IF EXISTS "sites_select_authenticated" ON portail.sites;
CREATE POLICY "sites_select_authenticated" ON portail.sites
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "sites_admin_all" ON portail.sites;
CREATE POLICY "sites_admin_all" ON portail.sites
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM portail.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM portail.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));


DROP POLICY IF EXISTS "site_access_select_own_or_admin" ON portail.site_access;
CREATE POLICY "site_access_select_own_or_admin" ON portail.site_access
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM portail.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

DROP POLICY IF EXISTS "site_access_admin_manage" ON portail.site_access;
CREATE POLICY "site_access_admin_manage" ON portail.site_access
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM portail.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM portail.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));


DROP POLICY IF EXISTS "access_requests_select_own_or_admin" ON portail.access_requests;
CREATE POLICY "access_requests_select_own_or_admin" ON portail.access_requests
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM portail.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

DROP POLICY IF EXISTS "access_requests_insert_own" ON portail.access_requests;
CREATE POLICY "access_requests_insert_own" ON portail.access_requests
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "access_requests_admin_manage" ON portail.access_requests;
CREATE POLICY "access_requests_admin_manage" ON portail.access_requests
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM portail.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM portail.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

