-- =============================================================================
-- 005 — qualité / contrôles / docs / périmés / stock
-- DDL aligné projet Supabase live kpjflntnotftpzffjbud (2026-09-03)
-- Rôles canoniques app : admin | équipe (member = legacy CHECK seulement)
-- Source module : src/modules/quality/sql/
-- Source module : src/modules/controls/sql/
-- Source module : src/modules/documents/sql/
-- Source module : src/modules/perimes/sql/
-- Source module : src/modules/stock/sql/
-- =============================================================================

-- >>> src/modules/quality/sql :: PharmaOs.quality_events
CREATE TABLE IF NOT EXISTS "PharmaOs".quality_events (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  type text NOT NULL,
  data jsonb,
  created_at timestamptz DEFAULT now() NOT NULL,
  status text DEFAULT 'ouvert'::text NOT NULL,
  severity text DEFAULT 'mineure'::text NOT NULL,
  capa_action text,
  capa_status text DEFAULT 'en_attente'::text,
  resolved_at timestamptz,
  resolved_by uuid,
  FOREIGN KEY (resolved_by) REFERENCES auth.users(id),
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  PRIMARY KEY ("id")
);

-- >>> src/modules/controls/sql :: PharmaOs.daily_controls
CREATE TABLE IF NOT EXISTS "PharmaOs".daily_controls (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  control_type text NOT NULL,
  shift text,
  value numeric,
  is_compliant boolean DEFAULT true NOT NULL,
  details jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  FOREIGN KEY (user_id) REFERENCES auth.users(id),
  PRIMARY KEY ("id")
);

-- >>> src/modules/controls/sql :: PharmaOs.equipment_calibrations
CREATE TABLE IF NOT EXISTS "PharmaOs".equipment_calibrations (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  equipment_name text DEFAULT 'Balance'::text NOT NULL,
  calibration_end_date date NOT NULL,
  next_visit_date date,
  notes text,
  last_task_id uuid,
  created_by uuid,
  updated_at timestamptz DEFAULT now() NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  FOREIGN KEY (created_by) REFERENCES auth.users(id),
  PRIMARY KEY ("id")
);

-- >>> src/modules/documents/sql :: PharmaOs.documents
CREATE TABLE IF NOT EXISTS "PharmaOs".documents (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  title text NOT NULL,
  content text DEFAULT ''::text NOT NULL,
  version text DEFAULT '1.0'::text NOT NULL,
  category text DEFAULT 'procedure'::text NOT NULL,
  requires_signature boolean DEFAULT true NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  created_by uuid,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  FOREIGN KEY (created_by) REFERENCES auth.users(id),
  PRIMARY KEY ("id")
);

-- >>> src/modules/documents/sql :: PharmaOs.document_signatures
CREATE TABLE IF NOT EXISTS "PharmaOs".document_signatures (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  document_id uuid NOT NULL,
  user_id uuid NOT NULL,
  document_version text NOT NULL,
  signed_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE (document_id, user_id, document_version),
  FOREIGN KEY (document_id) REFERENCES "PharmaOs".documents(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES auth.users(id),
  PRIMARY KEY ("id")
);

-- >>> src/modules/perimes/sql :: PharmaOs.perimes
CREATE TABLE IF NOT EXISTS "PharmaOs".perimes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  medicament text NOT NULL,
  cip text,
  lot text,
  date_peremption date NOT NULL,
  quantite integer DEFAULT 1 NOT NULL,
  source text DEFAULT 'reception'::text NOT NULL,
  status text DEFAULT 'actif'::text NOT NULL,
  notes text,
  created_by uuid,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  FOREIGN KEY (created_by) REFERENCES auth.users(id),
  PRIMARY KEY ("id")
);

-- >>> src/modules/stock/sql :: PharmaOs.stock_errors
CREATE TABLE IF NOT EXISTS "PharmaOs".stock_errors (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  medicament text NOT NULL,
  cip text,
  quantite_theorique integer,
  quantite_constatee integer,
  description text,
  status text DEFAULT 'ouvert'::text NOT NULL,
  admin_decision text,
  admin_notes text,
  task_id uuid,
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL,
  FOREIGN KEY (resolved_by) REFERENCES auth.users(id),
  FOREIGN KEY (user_id) REFERENCES auth.users(id),
  PRIMARY KEY ("id")
);

ALTER TABLE "PharmaOs".quality_events ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON "PharmaOs".quality_events TO authenticated;
DROP POLICY IF EXISTS "quality_events_insert_own" ON "PharmaOs".quality_events;
CREATE POLICY "quality_events_insert_own" ON "PharmaOs".quality_events
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "quality_events_select_own" ON "PharmaOs".quality_events;
CREATE POLICY "quality_events_select_own" ON "PharmaOs".quality_events
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "quality_events_admin_select" ON "PharmaOs".quality_events;
CREATE POLICY "quality_events_admin_select" ON "PharmaOs".quality_events
  FOR SELECT TO authenticated
  USING ("PharmaOs".is_pharma_admin());

DROP POLICY IF EXISTS "quality_events_update_admin" ON "PharmaOs".quality_events;
CREATE POLICY "quality_events_update_admin" ON "PharmaOs".quality_events
  FOR UPDATE TO authenticated
  USING ("PharmaOs".is_pharma_admin())
  WITH CHECK ("PharmaOs".is_pharma_admin());


ALTER TABLE "PharmaOs".daily_controls ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON "PharmaOs".daily_controls TO authenticated;
DROP POLICY IF EXISTS "daily_controls_staff_all" ON "PharmaOs".daily_controls;
CREATE POLICY "daily_controls_staff_all" ON "PharmaOs".daily_controls
  FOR ALL TO authenticated
  USING ("PharmaOs".is_pharma_staff())
  WITH CHECK ("PharmaOs".is_pharma_staff());

ALTER TABLE "PharmaOs".equipment_calibrations ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON "PharmaOs".equipment_calibrations TO authenticated;
DROP POLICY IF EXISTS "equipment_calibrations_staff_all" ON "PharmaOs".equipment_calibrations;
CREATE POLICY "equipment_calibrations_staff_all" ON "PharmaOs".equipment_calibrations
  FOR ALL TO authenticated
  USING ("PharmaOs".is_pharma_staff())
  WITH CHECK ("PharmaOs".is_pharma_staff());

ALTER TABLE "PharmaOs".documents ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON "PharmaOs".documents TO authenticated;
DROP POLICY IF EXISTS "documents_staff_all" ON "PharmaOs".documents;
CREATE POLICY "documents_staff_all" ON "PharmaOs".documents
  FOR ALL TO authenticated
  USING ("PharmaOs".is_pharma_staff())
  WITH CHECK ("PharmaOs".is_pharma_staff());

ALTER TABLE "PharmaOs".perimes ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON "PharmaOs".perimes TO authenticated;
DROP POLICY IF EXISTS "perimes_staff_all" ON "PharmaOs".perimes;
CREATE POLICY "perimes_staff_all" ON "PharmaOs".perimes
  FOR ALL TO authenticated
  USING ("PharmaOs".is_pharma_staff())
  WITH CHECK ("PharmaOs".is_pharma_staff());


ALTER TABLE "PharmaOs".document_signatures ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON "PharmaOs".document_signatures TO authenticated;
DROP POLICY IF EXISTS "document_signatures_select_team" ON "PharmaOs".document_signatures;
CREATE POLICY "document_signatures_select_team" ON "PharmaOs".document_signatures
  FOR SELECT TO authenticated
  USING ("PharmaOs".is_pharma_staff());

DROP POLICY IF EXISTS "document_signatures_insert_own" ON "PharmaOs".document_signatures;
CREATE POLICY "document_signatures_insert_own" ON "PharmaOs".document_signatures
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());


ALTER TABLE "PharmaOs".stock_errors ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON "PharmaOs".stock_errors TO authenticated;
DROP POLICY IF EXISTS "stock_errors_insert_own" ON "PharmaOs".stock_errors;
CREATE POLICY "stock_errors_insert_own" ON "PharmaOs".stock_errors
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "stock_errors_select_team" ON "PharmaOs".stock_errors;
CREATE POLICY "stock_errors_select_team" ON "PharmaOs".stock_errors
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR "PharmaOs".is_pharma_staff());

DROP POLICY IF EXISTS "stock_errors_update_admin" ON "PharmaOs".stock_errors;
CREATE POLICY "stock_errors_update_admin" ON "PharmaOs".stock_errors
  FOR UPDATE TO authenticated
  USING ("PharmaOs".is_pharma_admin())
  WITH CHECK ("PharmaOs".is_pharma_admin());

