-- Mes saisies : étendre règle B (048) à toutes les fiches utilisateur.
-- Règle B : créateur + created_at < 72h + non clôturé/annulé + (updated_by IS NULL OR = auth.uid())
-- Les policies staff/admin existantes (ALL / update_staff) restent ; own UPDATE documente + autorise le chemin Mes saisies.

-- Helper déjà créé en 048 — s’assurer qu’il existe.
CREATE OR REPLACE FUNCTION "PharmaOs".set_updated_at_and_by()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_temp
AS $$
BEGIN
  NEW.updated_at = now();
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION "PharmaOs".set_updated_at_and_by() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION "PharmaOs".set_updated_at_and_by() TO authenticated;

-- =============================================================================
-- Colonnes updated_at / updated_by
-- =============================================================================

ALTER TABLE "PharmaOs".supplier_disputes
  ADD COLUMN IF NOT EXISTS updated_by uuid;
ALTER TABLE "PharmaOs".supplier_disputes
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now() NOT NULL;

ALTER TABLE "PharmaOs".perimes
  ADD COLUMN IF NOT EXISTS updated_by uuid;
ALTER TABLE "PharmaOs".perimes
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now() NOT NULL;

ALTER TABLE "PharmaOs".magistral_orders
  ADD COLUMN IF NOT EXISTS updated_by uuid;
ALTER TABLE "PharmaOs".magistral_orders
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now() NOT NULL;

ALTER TABLE "PharmaOs".location_dossiers
  ADD COLUMN IF NOT EXISTS updated_by uuid;
ALTER TABLE "PharmaOs".location_dossiers
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now() NOT NULL;

ALTER TABLE "PharmaOs".location_contacts
  ADD COLUMN IF NOT EXISTS updated_by uuid;
ALTER TABLE "PharmaOs".location_contacts
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now() NOT NULL;

ALTER TABLE "PharmaOs".hr_absences
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now() NOT NULL,
  ADD COLUMN IF NOT EXISTS updated_by uuid;

ALTER TABLE "PharmaOs".hr_schedule_changes
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now() NOT NULL,
  ADD COLUMN IF NOT EXISTS updated_by uuid;

ALTER TABLE "PharmaOs".cash_closures
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now() NOT NULL,
  ADD COLUMN IF NOT EXISTS updated_by uuid;

ALTER TABLE "PharmaOs".stupefiant_releves
  ADD COLUMN IF NOT EXISTS updated_by uuid;
ALTER TABLE "PharmaOs".stupefiant_releves
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now() NOT NULL;

ALTER TABLE "PharmaOs".psl_units
  ADD COLUMN IF NOT EXISTS updated_by uuid;
ALTER TABLE "PharmaOs".psl_units
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now() NOT NULL;

ALTER TABLE "PharmaOs".psl_movements
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now() NOT NULL,
  ADD COLUMN IF NOT EXISTS updated_by uuid;

ALTER TABLE "PharmaOs".documents
  ADD COLUMN IF NOT EXISTS updated_by uuid;
ALTER TABLE "PharmaOs".documents
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now() NOT NULL;

ALTER TABLE "PharmaOs".conseils
  ADD COLUMN IF NOT EXISTS updated_by uuid;
ALTER TABLE "PharmaOs".conseils
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now() NOT NULL;

-- Backfill : lignes existantes → updated_at = created_at, updated_by null (encore corrigeables).
UPDATE "PharmaOs".supplier_disputes SET updated_at = created_at WHERE updated_by IS NULL;
UPDATE "PharmaOs".perimes SET updated_at = created_at WHERE updated_by IS NULL;
UPDATE "PharmaOs".magistral_orders SET updated_at = created_at WHERE updated_by IS NULL;
UPDATE "PharmaOs".location_dossiers SET updated_at = created_at WHERE updated_by IS NULL;
UPDATE "PharmaOs".location_contacts SET updated_at = created_at WHERE updated_by IS NULL;
UPDATE "PharmaOs".hr_absences SET updated_at = created_at WHERE updated_by IS NULL;
UPDATE "PharmaOs".hr_schedule_changes SET updated_at = created_at WHERE updated_by IS NULL;
UPDATE "PharmaOs".cash_closures SET updated_at = created_at WHERE updated_by IS NULL;
UPDATE "PharmaOs".stupefiant_releves SET updated_at = created_at WHERE updated_by IS NULL;
UPDATE "PharmaOs".psl_units SET updated_at = created_at WHERE updated_by IS NULL;
UPDATE "PharmaOs".psl_movements SET updated_at = created_at WHERE updated_by IS NULL;
UPDATE "PharmaOs".documents SET updated_at = COALESCE(updated_at, created_at) WHERE updated_by IS NULL;
UPDATE "PharmaOs".conseils SET updated_at = COALESCE(updated_at, created_at) WHERE updated_by IS NULL;

-- =============================================================================
-- Triggers (remplace set_updated_at seul sur stupéfiants)
-- =============================================================================

DROP TRIGGER IF EXISTS trg_supplier_disputes_updated_at_by ON "PharmaOs".supplier_disputes;
CREATE TRIGGER trg_supplier_disputes_updated_at_by
  BEFORE UPDATE ON "PharmaOs".supplier_disputes
  FOR EACH ROW EXECUTE FUNCTION "PharmaOs".set_updated_at_and_by();

DROP TRIGGER IF EXISTS trg_perimes_updated_at_by ON "PharmaOs".perimes;
CREATE TRIGGER trg_perimes_updated_at_by
  BEFORE UPDATE ON "PharmaOs".perimes
  FOR EACH ROW EXECUTE FUNCTION "PharmaOs".set_updated_at_and_by();

DROP TRIGGER IF EXISTS trg_magistral_orders_updated_at_by ON "PharmaOs".magistral_orders;
CREATE TRIGGER trg_magistral_orders_updated_at_by
  BEFORE UPDATE ON "PharmaOs".magistral_orders
  FOR EACH ROW EXECUTE FUNCTION "PharmaOs".set_updated_at_and_by();

DROP TRIGGER IF EXISTS trg_location_dossiers_updated_at_by ON "PharmaOs".location_dossiers;
CREATE TRIGGER trg_location_dossiers_updated_at_by
  BEFORE UPDATE ON "PharmaOs".location_dossiers
  FOR EACH ROW EXECUTE FUNCTION "PharmaOs".set_updated_at_and_by();

DROP TRIGGER IF EXISTS trg_location_contacts_updated_at_by ON "PharmaOs".location_contacts;
CREATE TRIGGER trg_location_contacts_updated_at_by
  BEFORE UPDATE ON "PharmaOs".location_contacts
  FOR EACH ROW EXECUTE FUNCTION "PharmaOs".set_updated_at_and_by();

DROP TRIGGER IF EXISTS trg_hr_absences_updated_at_by ON "PharmaOs".hr_absences;
CREATE TRIGGER trg_hr_absences_updated_at_by
  BEFORE UPDATE ON "PharmaOs".hr_absences
  FOR EACH ROW EXECUTE FUNCTION "PharmaOs".set_updated_at_and_by();

DROP TRIGGER IF EXISTS trg_hr_schedule_changes_updated_at_by ON "PharmaOs".hr_schedule_changes;
CREATE TRIGGER trg_hr_schedule_changes_updated_at_by
  BEFORE UPDATE ON "PharmaOs".hr_schedule_changes
  FOR EACH ROW EXECUTE FUNCTION "PharmaOs".set_updated_at_and_by();

DROP TRIGGER IF EXISTS trg_cash_closures_updated_at_by ON "PharmaOs".cash_closures;
CREATE TRIGGER trg_cash_closures_updated_at_by
  BEFORE UPDATE ON "PharmaOs".cash_closures
  FOR EACH ROW EXECUTE FUNCTION "PharmaOs".set_updated_at_and_by();

DROP TRIGGER IF EXISTS stupefiant_releves_set_updated_at ON "PharmaOs".stupefiant_releves;
DROP TRIGGER IF EXISTS trg_stupefiant_releves_updated_at_by ON "PharmaOs".stupefiant_releves;
CREATE TRIGGER trg_stupefiant_releves_updated_at_by
  BEFORE UPDATE ON "PharmaOs".stupefiant_releves
  FOR EACH ROW EXECUTE FUNCTION "PharmaOs".set_updated_at_and_by();

DROP TRIGGER IF EXISTS trg_psl_units_updated_at_by ON "PharmaOs".psl_units;
CREATE TRIGGER trg_psl_units_updated_at_by
  BEFORE UPDATE ON "PharmaOs".psl_units
  FOR EACH ROW EXECUTE FUNCTION "PharmaOs".set_updated_at_and_by();

DROP TRIGGER IF EXISTS trg_psl_movements_updated_at_by ON "PharmaOs".psl_movements;
CREATE TRIGGER trg_psl_movements_updated_at_by
  BEFORE UPDATE ON "PharmaOs".psl_movements
  FOR EACH ROW EXECUTE FUNCTION "PharmaOs".set_updated_at_and_by();

DROP TRIGGER IF EXISTS trg_documents_updated_at_by ON "PharmaOs".documents;
CREATE TRIGGER trg_documents_updated_at_by
  BEFORE UPDATE ON "PharmaOs".documents
  FOR EACH ROW EXECUTE FUNCTION "PharmaOs".set_updated_at_and_by();

DROP TRIGGER IF EXISTS trg_conseils_updated_at_by ON "PharmaOs".conseils;
CREATE TRIGGER trg_conseils_updated_at_by
  BEFORE UPDATE ON "PharmaOs".conseils
  FOR EACH ROW EXECUTE FUNCTION "PharmaOs".set_updated_at_and_by();

-- =============================================================================
-- RLS own UPDATE (règle B)
-- =============================================================================

DROP POLICY IF EXISTS "supplier_disputes_update_own" ON "PharmaOs".supplier_disputes;
CREATE POLICY "supplier_disputes_update_own" ON "PharmaOs".supplier_disputes
  FOR UPDATE TO authenticated
  USING (
    created_by = auth.uid()
    AND created_at > (now() - interval '72 hours')
    AND COALESCE(statut, '') NOT IN ('clos', 'annule')
    AND (updated_by IS NULL OR updated_by = auth.uid())
  )
  WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "perimes_update_own" ON "PharmaOs".perimes;
CREATE POLICY "perimes_update_own" ON "PharmaOs".perimes
  FOR UPDATE TO authenticated
  USING (
    created_by = auth.uid()
    AND created_at > (now() - interval '72 hours')
    AND COALESCE(status, '') NOT IN ('clos')
    AND (updated_by IS NULL OR updated_by = auth.uid())
  )
  WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "magistral_orders_update_own" ON "PharmaOs".magistral_orders;
CREATE POLICY "magistral_orders_update_own" ON "PharmaOs".magistral_orders
  FOR UPDATE TO authenticated
  USING (
    created_by = auth.uid()
    AND created_at > (now() - interval '72 hours')
    AND COALESCE(statut, '') NOT IN ('cloture', 'dispense', 'refuse')
    AND (updated_by IS NULL OR updated_by = auth.uid())
  )
  WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "location_dossiers_update_own" ON "PharmaOs".location_dossiers;
CREATE POLICY "location_dossiers_update_own" ON "PharmaOs".location_dossiers
  FOR UPDATE TO authenticated
  USING (
    created_by = auth.uid()
    AND created_at > (now() - interval '72 hours')
    AND COALESCE(statut, '') NOT IN ('cloture', 'annule')
    AND (updated_by IS NULL OR updated_by = auth.uid())
  )
  WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "location_contacts_update_own" ON "PharmaOs".location_contacts;
CREATE POLICY "location_contacts_update_own" ON "PharmaOs".location_contacts
  FOR UPDATE TO authenticated
  USING (
    created_by = auth.uid()
    AND created_at > (now() - interval '72 hours')
    AND COALESCE(statut, '') NOT IN ('resolu', 'annule')
    AND (updated_by IS NULL OR updated_by = auth.uid())
  )
  WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "hr_absences_update_own" ON "PharmaOs".hr_absences;
CREATE POLICY "hr_absences_update_own" ON "PharmaOs".hr_absences
  FOR UPDATE TO authenticated
  USING (
    created_by = auth.uid()
    AND created_at > (now() - interval '72 hours')
    AND COALESCE(statut, '') = 'en_attente'
    AND (updated_by IS NULL OR updated_by = auth.uid())
  )
  WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "hr_schedule_changes_update_own" ON "PharmaOs".hr_schedule_changes;
CREATE POLICY "hr_schedule_changes_update_own" ON "PharmaOs".hr_schedule_changes
  FOR UPDATE TO authenticated
  USING (
    created_by = auth.uid()
    AND created_at > (now() - interval '72 hours')
    AND COALESCE(statut, '') = 'en_attente'
    AND (updated_by IS NULL OR updated_by = auth.uid())
  )
  WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "cash_closures_update_own" ON "PharmaOs".cash_closures;
CREATE POLICY "cash_closures_update_own" ON "PharmaOs".cash_closures
  FOR UPDATE TO authenticated
  USING (
    author_id = auth.uid()
    AND created_at > (now() - interval '72 hours')
    AND (updated_by IS NULL OR updated_by = auth.uid())
  )
  WITH CHECK (author_id = auth.uid());

DROP POLICY IF EXISTS "stupefiant_releves_update_own" ON "PharmaOs".stupefiant_releves;
CREATE POLICY "stupefiant_releves_update_own" ON "PharmaOs".stupefiant_releves
  FOR UPDATE TO authenticated
  USING (
    created_by = auth.uid()
    AND created_at > (now() - interval '72 hours')
    AND COALESCE(status, '') NOT IN (
      'ras', 'ras_recompte', 'corrige_compris', 'corrige_sans', 'erreur_reception'
    )
    AND (updated_by IS NULL OR updated_by = auth.uid())
  )
  WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "psl_units_update_own" ON "PharmaOs".psl_units;
CREATE POLICY "psl_units_update_own" ON "PharmaOs".psl_units
  FOR UPDATE TO authenticated
  USING (
    created_by = auth.uid()
    AND created_at > (now() - interval '72 hours')
    AND COALESCE(statut, '') = 'en_stock'
    AND (updated_by IS NULL OR updated_by = auth.uid())
  )
  WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "psl_movements_update_own" ON "PharmaOs".psl_movements;
CREATE POLICY "psl_movements_update_own" ON "PharmaOs".psl_movements
  FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    AND created_at > (now() - interval '72 hours')
    AND (updated_by IS NULL OR updated_by = auth.uid())
  )
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "documents_update_own" ON "PharmaOs".documents;
CREATE POLICY "documents_update_own" ON "PharmaOs".documents
  FOR UPDATE TO authenticated
  USING (
    created_by = auth.uid()
    AND created_at > (now() - interval '72 hours')
    AND (updated_by IS NULL OR updated_by = auth.uid())
  )
  WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "conseils_update_own" ON "PharmaOs".conseils;
CREATE POLICY "conseils_update_own" ON "PharmaOs".conseils
  FOR UPDATE TO authenticated
  USING (
    created_by = auth.uid()
    AND created_at > (now() - interval '72 hours')
    AND COALESCE(is_active, true) = true
    AND (updated_by IS NULL OR updated_by = auth.uid())
  )
  WITH CHECK (created_by = auth.uid());
