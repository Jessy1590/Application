-- =============================================================================
-- 029 — casquettes extensibles (catalogue + features + attribution profil)
-- =============================================================================

CREATE TABLE IF NOT EXISTS "PharmaOs".casquettes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  slug text NOT NULL,
  label text NOT NULL,
  description text,
  active boolean DEFAULT true NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  updated_by uuid,
  UNIQUE (slug),
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS "PharmaOs".casquette_features (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  casquette_id uuid NOT NULL REFERENCES "PharmaOs".casquettes(id) ON DELETE CASCADE,
  surface text NOT NULL,
  feature_id text NOT NULL,
  CHECK (surface = ANY (ARRAY['taskbar'::text, 'dashboard'::text])),
  UNIQUE (casquette_id, surface, feature_id),
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS "PharmaOs".profile_casquettes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  profile_id uuid NOT NULL REFERENCES portail.profiles(id) ON DELETE CASCADE,
  casquette_id uuid NOT NULL REFERENCES "PharmaOs".casquettes(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE (profile_id, casquette_id),
  PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS casquette_features_casquette_idx
  ON "PharmaOs".casquette_features (casquette_id);
CREATE INDEX IF NOT EXISTS profile_casquettes_profile_idx
  ON "PharmaOs".profile_casquettes (profile_id);

DROP TRIGGER IF EXISTS trg_casquettes_updated_at ON "PharmaOs".casquettes;
CREATE TRIGGER trg_casquettes_updated_at
  BEFORE UPDATE ON "PharmaOs".casquettes
  FOR EACH ROW
  EXECUTE FUNCTION "PharmaOs".set_updated_at();

ALTER TABLE "PharmaOs".casquettes ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PharmaOs".casquette_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PharmaOs".profile_casquettes ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON "PharmaOs".casquettes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON "PharmaOs".casquette_features TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON "PharmaOs".profile_casquettes TO authenticated;

DROP POLICY IF EXISTS "casquettes_select_staff" ON "PharmaOs".casquettes;
CREATE POLICY "casquettes_select_staff" ON "PharmaOs".casquettes
  FOR SELECT TO authenticated
  USING ("PharmaOs".is_pharma_staff());

DROP POLICY IF EXISTS "casquettes_admin_manage" ON "PharmaOs".casquettes;
CREATE POLICY "casquettes_admin_manage" ON "PharmaOs".casquettes
  FOR ALL TO authenticated
  USING ("PharmaOs".is_app_administrateur())
  WITH CHECK ("PharmaOs".is_app_administrateur());

DROP POLICY IF EXISTS "casquette_features_select_staff" ON "PharmaOs".casquette_features;
CREATE POLICY "casquette_features_select_staff" ON "PharmaOs".casquette_features
  FOR SELECT TO authenticated
  USING ("PharmaOs".is_pharma_staff());

DROP POLICY IF EXISTS "casquette_features_admin_manage" ON "PharmaOs".casquette_features;
CREATE POLICY "casquette_features_admin_manage" ON "PharmaOs".casquette_features
  FOR ALL TO authenticated
  USING ("PharmaOs".is_app_administrateur())
  WITH CHECK ("PharmaOs".is_app_administrateur());

DROP POLICY IF EXISTS "profile_casquettes_select_staff" ON "PharmaOs".profile_casquettes;
CREATE POLICY "profile_casquettes_select_staff" ON "PharmaOs".profile_casquettes
  FOR SELECT TO authenticated
  USING ("PharmaOs".is_pharma_staff());

DROP POLICY IF EXISTS "profile_casquettes_admin_manage" ON "PharmaOs".profile_casquettes;
CREATE POLICY "profile_casquettes_admin_manage" ON "PharmaOs".profile_casquettes
  FOR ALL TO authenticated
  USING ("PharmaOs".is_app_administrateur())
  WITH CHECK ("PharmaOs".is_app_administrateur());

-- Seeds v1
INSERT INTO "PharmaOs".casquettes (slug, label, description)
VALUES
  ('location', 'Location', 'Accès module Location (taskbar + dashboard)'),
  ('magistral', 'Magistrales', 'Accès module Magistrales (taskbar + dashboard)')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO "PharmaOs".casquette_features (casquette_id, surface, feature_id)
SELECT c.id, s.surface, s.feature_id
FROM "PharmaOs".casquettes c
CROSS JOIN (VALUES
  ('location', 'taskbar', 'location'),
  ('location', 'dashboard', 'location'),
  ('magistral', 'taskbar', 'magistral'),
  ('magistral', 'dashboard', 'magistral')
) AS s(slug, surface, feature_id)
WHERE c.slug = s.slug
ON CONFLICT (casquette_id, surface, feature_id) DO NOTHING;

-- Ex-gestionnaires : casquettes location + magistral
INSERT INTO "PharmaOs".profile_casquettes (profile_id, casquette_id)
SELECT m.profile_id, c.id
FROM "PharmaOs"._migration_ex_gestionnaire m
CROSS JOIN "PharmaOs".casquettes c
WHERE c.slug IN ('location', 'magistral') AND c.active
ON CONFLICT (profile_id, casquette_id) DO NOTHING;

DROP TABLE IF EXISTS "PharmaOs"._migration_ex_gestionnaire;

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE "PharmaOs".casquettes;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE "PharmaOs".casquette_features;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE "PharmaOs".profile_casquettes;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;
