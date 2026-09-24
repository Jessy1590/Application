-- Mes saisies : fenêtre 72h + traçabilité updated_at / updated_by (règle B).
-- Remplace le critère « non clôturé seul » de 042 par :
--   créateur + created_at < 72h + non clôturé/annulé + (updated_by IS NULL OR = auth.uid())

-- Helper : pose updated_at + updated_by sur BEFORE UPDATE (réutilise le pattern set_updated_at).
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

-- === Colonnes ===
ALTER TABLE "PharmaOs".call_logs
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now() NOT NULL,
  ADD COLUMN IF NOT EXISTS updated_by uuid;

ALTER TABLE "PharmaOs".act_ip_logs
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now() NOT NULL,
  ADD COLUMN IF NOT EXISTS updated_by uuid;

ALTER TABLE "PharmaOs".quality_events
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now() NOT NULL,
  ADD COLUMN IF NOT EXISTS updated_by uuid;

ALTER TABLE "PharmaOs".stock_errors
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now() NOT NULL,
  ADD COLUMN IF NOT EXISTS updated_by uuid;

-- Backfill : lignes existantes → updated_at = created_at, updated_by null (encore corrigeable).
UPDATE "PharmaOs".call_logs SET updated_at = created_at WHERE updated_by IS NULL;
UPDATE "PharmaOs".act_ip_logs SET updated_at = created_at WHERE updated_by IS NULL;
UPDATE "PharmaOs".quality_events SET updated_at = created_at WHERE updated_by IS NULL;
UPDATE "PharmaOs".stock_errors SET updated_at = created_at WHERE updated_by IS NULL;

-- === Triggers ===
DROP TRIGGER IF EXISTS trg_call_logs_updated_at_by ON "PharmaOs".call_logs;
CREATE TRIGGER trg_call_logs_updated_at_by
  BEFORE UPDATE ON "PharmaOs".call_logs
  FOR EACH ROW EXECUTE FUNCTION "PharmaOs".set_updated_at_and_by();

DROP TRIGGER IF EXISTS trg_act_ip_logs_updated_at_by ON "PharmaOs".act_ip_logs;
CREATE TRIGGER trg_act_ip_logs_updated_at_by
  BEFORE UPDATE ON "PharmaOs".act_ip_logs
  FOR EACH ROW EXECUTE FUNCTION "PharmaOs".set_updated_at_and_by();

DROP TRIGGER IF EXISTS trg_quality_events_updated_at_by ON "PharmaOs".quality_events;
CREATE TRIGGER trg_quality_events_updated_at_by
  BEFORE UPDATE ON "PharmaOs".quality_events
  FOR EACH ROW EXECUTE FUNCTION "PharmaOs".set_updated_at_and_by();

DROP TRIGGER IF EXISTS trg_stock_errors_updated_at_by ON "PharmaOs".stock_errors;
CREATE TRIGGER trg_stock_errors_updated_at_by
  BEFORE UPDATE ON "PharmaOs".stock_errors
  FOR EACH ROW EXECUTE FUNCTION "PharmaOs".set_updated_at_and_by();

-- === RLS own UPDATE (règle B) — admin policies inchangées ===

DROP POLICY IF EXISTS "call_logs_update_own" ON "PharmaOs".call_logs;
CREATE POLICY "call_logs_update_own" ON "PharmaOs".call_logs
  FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    AND created_at > (now() - interval '72 hours')
    AND COALESCE(statut_traitement, '') NOT IN ('cloture', 'annule')
    AND (updated_by IS NULL OR updated_by = auth.uid())
  )
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "act_ip_logs_update_own" ON "PharmaOs".act_ip_logs;
CREATE POLICY "act_ip_logs_update_own" ON "PharmaOs".act_ip_logs
  FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    AND created_at > (now() - interval '72 hours')
    AND COALESCE(statut_ip, '') NOT IN ('Cloturee', 'Annulee')
    AND (updated_by IS NULL OR updated_by = auth.uid())
  )
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "quality_events_update_own" ON "PharmaOs".quality_events;
CREATE POLICY "quality_events_update_own" ON "PharmaOs".quality_events
  FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    AND created_at > (now() - interval '72 hours')
    AND COALESCE(status, '') NOT IN ('cloture', 'annule')
    AND (updated_by IS NULL OR updated_by = auth.uid())
  )
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "stock_errors_update_own" ON "PharmaOs".stock_errors;
CREATE POLICY "stock_errors_update_own" ON "PharmaOs".stock_errors
  FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    AND created_at > (now() - interval '72 hours')
    AND COALESCE(status, '') IN ('ouvert', 'pending', 'en_attente')
    AND (updated_by IS NULL OR updated_by = auth.uid())
  )
  WITH CHECK (user_id = auth.uid());
