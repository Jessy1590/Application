-- =============================================================================
-- 024 — rôles canoniques, logs applicatifs, bugs, matrice d'accès
-- Rôles : pharmacien | administrateur | gestionnaire | préparateur
-- Legacy conservé : admin | équipe | member
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Helpers rôles
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION portail.canonical_role(p_role text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_role = 'admin' THEN 'administrateur'
    WHEN p_role IN ('équipe', 'member') THEN 'préparateur'
    WHEN p_role IN ('pharmacien', 'administrateur', 'gestionnaire', 'préparateur') THEN p_role
    ELSE 'préparateur'
  END;
$$;

REVOKE ALL ON FUNCTION portail.canonical_role(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION portail.canonical_role(text) TO authenticated, anon;

CREATE OR REPLACE FUNCTION portail.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = portail, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM portail.profiles
    WHERE id = auth.uid()
      AND portail.canonical_role(role) IN ('administrateur', 'pharmacien')
  );
$$;

CREATE OR REPLACE FUNCTION portail.is_app_administrateur()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = portail, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM portail.profiles
    WHERE id = auth.uid()
      AND portail.canonical_role(role) = 'administrateur'
  );
$$;

REVOKE ALL ON FUNCTION portail.is_app_administrateur() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION portail.is_app_administrateur() TO authenticated;

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
      AND portail.canonical_role(p.role) IN ('administrateur', 'pharmacien', 'gestionnaire')
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
      AND portail.canonical_role(p.role) IN ('administrateur', 'pharmacien', 'gestionnaire', 'préparateur')
  );
$$;

CREATE OR REPLACE FUNCTION "PharmaOs".is_app_administrateur()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = portail, pg_temp
AS $$
  SELECT portail.is_app_administrateur();
$$;

CREATE OR REPLACE FUNCTION "PharmaOs".can_view_admin_logs()
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

REVOKE ALL ON FUNCTION "PharmaOs".is_app_administrateur() FROM PUBLIC;
REVOKE ALL ON FUNCTION "PharmaOs".can_view_admin_logs() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "PharmaOs".is_app_administrateur() TO authenticated;
GRANT EXECUTE ON FUNCTION "PharmaOs".can_view_admin_logs() TO authenticated;

-- CHECK rôle élargi
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
  ALTER COLUMN role SET DEFAULT 'préparateur';

ALTER TABLE portail.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role = ANY (ARRAY[
    'admin'::text, 'équipe'::text, 'member'::text,
    'pharmacien'::text, 'administrateur'::text, 'gestionnaire'::text, 'préparateur'::text
  ]));

-- Empêche l'auto-promotion de rôle
CREATE OR REPLACE FUNCTION portail.prevent_self_role_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = portail, pg_temp
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF NOT portail.is_app_administrateur() THEN
      RAISE EXCEPTION 'Seul un administrateur peut modifier le rôle';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_self_role_escalation ON portail.profiles;
CREATE TRIGGER trg_prevent_self_role_escalation
  BEFORE UPDATE ON portail.profiles
  FOR EACH ROW
  EXECUTE FUNCTION portail.prevent_self_role_escalation();

-- Policies portail : s'appuyer sur is_admin() (pharmacien + administrateur)
DROP POLICY IF EXISTS "sites_admin_all" ON portail.sites;
CREATE POLICY "sites_admin_all" ON portail.sites
  FOR ALL TO authenticated
  USING (portail.is_admin())
  WITH CHECK (portail.is_admin());

DROP POLICY IF EXISTS "site_access_select_own_or_admin" ON portail.site_access;
CREATE POLICY "site_access_select_own_or_admin" ON portail.site_access
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR portail.is_admin());

DROP POLICY IF EXISTS "site_access_admin_manage" ON portail.site_access;
CREATE POLICY "site_access_admin_manage" ON portail.site_access
  FOR ALL TO authenticated
  USING (portail.is_admin())
  WITH CHECK (portail.is_admin());

DROP POLICY IF EXISTS "access_requests_select_own_or_admin" ON portail.access_requests;
CREATE POLICY "access_requests_select_own_or_admin" ON portail.access_requests
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR portail.is_admin());

DROP POLICY IF EXISTS "access_requests_admin_manage" ON portail.access_requests;
CREATE POLICY "access_requests_admin_manage" ON portail.access_requests
  FOR ALL TO authenticated
  USING (portail.is_admin())
  WITH CHECK (portail.is_admin());

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "PharmaOs".app_logs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  user_id uuid,
  user_name text,
  user_role text,
  surface text,
  category text NOT NULL,
  action text NOT NULL,
  entity text,
  entity_id text,
  level text DEFAULT 'info' NOT NULL,
  message text,
  details jsonb DEFAULT '{}'::jsonb NOT NULL,
  source text DEFAULT 'client' NOT NULL,
  CHECK (level = ANY (ARRAY['debug'::text, 'info'::text, 'warn'::text, 'error'::text])),
  CHECK (source = ANY (ARRAY['client'::text, 'trigger'::text, 'system'::text])),
  PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS app_logs_created_at_idx ON "PharmaOs".app_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS app_logs_user_id_idx ON "PharmaOs".app_logs (user_id);
CREATE INDEX IF NOT EXISTS app_logs_category_idx ON "PharmaOs".app_logs (category);
CREATE INDEX IF NOT EXISTS app_logs_level_idx ON "PharmaOs".app_logs (level);

CREATE TABLE IF NOT EXISTS "PharmaOs".bugs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  user_name text NOT NULL,
  information text NOT NULL,
  statut text DEFAULT 'nouveau' NOT NULL,
  updated_by uuid,
  updated_by_name text,
  CHECK (statut = ANY (ARRAY['nouveau'::text, 'en_cours'::text, 'modifié'::text, 'impossible'::text])),
  PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS bugs_created_at_idx ON "PharmaOs".bugs (created_at DESC);
CREATE INDEX IF NOT EXISTS bugs_statut_idx ON "PharmaOs".bugs (statut);

CREATE TABLE IF NOT EXISTS "PharmaOs".role_access (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  role text NOT NULL,
  surface text NOT NULL,
  feature_id text NOT NULL,
  allowed boolean DEFAULT true NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  updated_by uuid,
  CHECK (role = ANY (ARRAY['pharmacien'::text, 'administrateur'::text, 'gestionnaire'::text, 'préparateur'::text])),
  CHECK (surface = ANY (ARRAY['dashboard'::text, 'taskbar'::text])),
  UNIQUE (role, surface, feature_id),
  PRIMARY KEY (id)
);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE "PharmaOs".app_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PharmaOs".bugs ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PharmaOs".role_access ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT ON "PharmaOs".app_logs TO authenticated;
GRANT SELECT, INSERT, UPDATE ON "PharmaOs".bugs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON "PharmaOs".role_access TO authenticated;

DROP POLICY IF EXISTS "app_logs_insert_own" ON "PharmaOs".app_logs;
CREATE POLICY "app_logs_insert_own" ON "PharmaOs".app_logs
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "app_logs_select_admin" ON "PharmaOs".app_logs;
CREATE POLICY "app_logs_select_admin" ON "PharmaOs".app_logs
  FOR SELECT TO authenticated
  USING ("PharmaOs".can_view_admin_logs());

DROP POLICY IF EXISTS "bugs_insert_own" ON "PharmaOs".bugs;
CREATE POLICY "bugs_insert_own" ON "PharmaOs".bugs
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "bugs_select_own_or_admin" ON "PharmaOs".bugs;
CREATE POLICY "bugs_select_own_or_admin" ON "PharmaOs".bugs
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR "PharmaOs".can_view_admin_logs());

DROP POLICY IF EXISTS "bugs_update_admin" ON "PharmaOs".bugs;
CREATE POLICY "bugs_update_admin" ON "PharmaOs".bugs
  FOR UPDATE TO authenticated
  USING ("PharmaOs".can_view_admin_logs())
  WITH CHECK ("PharmaOs".can_view_admin_logs());

DROP POLICY IF EXISTS "role_access_select_staff" ON "PharmaOs".role_access;
CREATE POLICY "role_access_select_staff" ON "PharmaOs".role_access
  FOR SELECT TO authenticated
  USING ("PharmaOs".is_pharma_staff());

DROP POLICY IF EXISTS "role_access_admin_manage" ON "PharmaOs".role_access;
CREATE POLICY "role_access_admin_manage" ON "PharmaOs".role_access
  FOR ALL TO authenticated
  USING ("PharmaOs".is_app_administrateur())
  WITH CHECK ("PharmaOs".is_app_administrateur());

-- ---------------------------------------------------------------------------
-- Trigger journal détaillé (toutes tables métier, hors app_logs)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "PharmaOs".log_row_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = "PharmaOs", portail, pg_temp
AS $$
DECLARE
  uid uuid := auth.uid();
  uname text;
  urole text;
  payload jsonb;
  pk text;
BEGIN
  SELECT p.display_name, p.role INTO uname, urole
  FROM portail.profiles p
  WHERE p.id = uid;

  IF TG_OP = 'DELETE' THEN
    payload := to_jsonb(OLD);
    pk := COALESCE(OLD.id::text, '');
  ELSIF TG_OP = 'UPDATE' THEN
    payload := jsonb_build_object('old', to_jsonb(OLD), 'new', to_jsonb(NEW));
    pk := COALESCE(NEW.id::text, OLD.id::text, '');
  ELSE
    payload := to_jsonb(NEW);
    pk := COALESCE(NEW.id::text, '');
  END IF;

  IF octet_length(payload::text) > 8000 THEN
    payload := jsonb_build_object('truncated', true, 'bytes', octet_length(payload::text));
  END IF;

  INSERT INTO "PharmaOs".app_logs (
    user_id, user_name, user_role, surface, category, action, entity, entity_id,
    level, message, details, source
  ) VALUES (
    uid,
    uname,
    urole,
    'data',
    'data',
    lower(TG_OP),
    TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME,
    NULLIF(pk, ''),
    'info',
    TG_OP || ' sur ' || TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME,
    COALESCE(payload, '{}'::jsonb),
    'trigger'
  );

  RETURN COALESCE(NEW, OLD);
EXCEPTION WHEN OTHERS THEN
  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE ALL ON FUNCTION "PharmaOs".log_row_mutation() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "PharmaOs".log_row_mutation() TO authenticated;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT n.nspname AS sch, c.relname AS tbl
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname IN ('PharmaOs', 'portail')
      AND c.relkind = 'r'
      AND NOT (n.nspname = 'PharmaOs' AND c.relname = 'app_logs')
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_app_log_mutation ON %I.%I', r.sch, r.tbl);
    EXECUTE format(
      'CREATE TRIGGER trg_app_log_mutation
       AFTER INSERT OR UPDATE OR DELETE ON %I.%I
       FOR EACH ROW EXECUTE FUNCTION "PharmaOs".log_row_mutation()',
      r.sch, r.tbl
    );
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION "PharmaOs".set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bugs_updated_at ON "PharmaOs".bugs;
CREATE TRIGGER trg_bugs_updated_at
  BEFORE UPDATE ON "PharmaOs".bugs
  FOR EACH ROW
  EXECUTE FUNCTION "PharmaOs".set_updated_at();

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE "PharmaOs".app_logs;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE "PharmaOs".bugs;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE "PharmaOs".role_access;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;
