-- =============================================================================
-- Attache trg_app_log_mutation aux tables PharmaOs / portail qui n’en ont pas.
-- Tables créées après 024 (casquettes, role_dashboard_widgets, task_role_rules…)
-- n’avaient pas le trigger de journalisation.
-- Idempotent : ne DROP pas les triggers déjà en place (évite deadlocks).
-- =============================================================================

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
      AND c.relname NOT LIKE '\_migration%' ESCAPE '\'
      AND NOT EXISTS (
        SELECT 1
        FROM pg_trigger t
        WHERE t.tgrelid = c.oid
          AND t.tgname = 'trg_app_log_mutation'
          AND NOT t.tgisinternal
      )
  LOOP
    EXECUTE format(
      'CREATE TRIGGER trg_app_log_mutation
       AFTER INSERT OR UPDATE OR DELETE ON %I.%I
       FOR EACH ROW EXECUTE FUNCTION "PharmaOs".log_row_mutation()',
      r.sch, r.tbl
    );
  END LOOP;
END $$;
