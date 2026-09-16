-- =============================================================================
-- 022 — Module Conseil : conseils + traçabilité accepte/refuse
-- =============================================================================

CREATE TABLE IF NOT EXISTS "PharmaOs".conseils (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  target_type text NOT NULL,
  cis text,
  cip13 text,
  code_substance text,
  label_snapshot text,
  message text NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  created_by uuid,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CHECK (target_type = ANY (ARRAY['substance'::text, 'specialite'::text, 'presentation'::text])),
  FOREIGN KEY (created_by) REFERENCES portail.profiles(id) ON DELETE SET NULL,
  PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS conseils_cip13_idx ON "PharmaOs".conseils (cip13);
CREATE INDEX IF NOT EXISTS conseils_cis_idx ON "PharmaOs".conseils (cis);
CREATE INDEX IF NOT EXISTS conseils_code_substance_idx ON "PharmaOs".conseils (code_substance);
CREATE INDEX IF NOT EXISTS conseils_is_active_idx ON "PharmaOs".conseils (is_active);

CREATE TABLE IF NOT EXISTS "PharmaOs".conseil_events (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  conseil_id uuid NOT NULL,
  user_id uuid NOT NULL,
  status text NOT NULL,
  matched_text text,
  source text,
  created_at timestamptz DEFAULT now() NOT NULL,
  CHECK (status = ANY (ARRAY['accepte'::text, 'refuse'::text])),
  CHECK (
    (source IS NULL)
    OR (source = ANY (ARRAY['focused_text'::text, 'clipboard'::text, 'manual'::text, 'winpharma'::text]))
  ),
  FOREIGN KEY (conseil_id) REFERENCES "PharmaOs".conseils(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS conseil_events_conseil_id_idx ON "PharmaOs".conseil_events (conseil_id);
CREATE INDEX IF NOT EXISTS conseil_events_user_id_idx ON "PharmaOs".conseil_events (user_id);
CREATE INDEX IF NOT EXISTS conseil_events_created_at_idx ON "PharmaOs".conseil_events (created_at DESC);

-- conseils : lecture + CRUD staff (taskbar cache + dashboard admin)
ALTER TABLE "PharmaOs".conseils ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON "PharmaOs".conseils TO authenticated;

DROP POLICY IF EXISTS "conseils_staff_all" ON "PharmaOs".conseils;
CREATE POLICY "conseils_staff_all" ON "PharmaOs".conseils
  FOR ALL TO authenticated
  USING ("PharmaOs".is_pharma_staff())
  WITH CHECK ("PharmaOs".is_pharma_staff());

-- conseil_events : insert own ; select own + admin
ALTER TABLE "PharmaOs".conseil_events ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON "PharmaOs".conseil_events TO authenticated;

DROP POLICY IF EXISTS "conseil_events_insert_own" ON "PharmaOs".conseil_events;
CREATE POLICY "conseil_events_insert_own" ON "PharmaOs".conseil_events
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "conseil_events_select_own" ON "PharmaOs".conseil_events;
CREATE POLICY "conseil_events_select_own" ON "PharmaOs".conseil_events
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "conseil_events_admin_select" ON "PharmaOs".conseil_events;
CREATE POLICY "conseil_events_admin_select" ON "PharmaOs".conseil_events
  FOR SELECT TO authenticated
  USING ("PharmaOs".is_pharma_admin());
