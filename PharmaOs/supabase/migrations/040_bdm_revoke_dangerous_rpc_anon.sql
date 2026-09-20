-- Harden BDPM sync RPCs: revoke PUBLIC/anon/authenticated execute.
-- Edge sync-bdpm uses service_role only.

REVOKE ALL ON FUNCTION bdm.truncate_official_tables() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION bdm.bulk_insert_specialites(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION bdm.bulk_insert_presentations(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION bdm.bulk_insert_compositions(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION bdm.bulk_insert_generiques(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION bdm.rebuild_molecules_from_compositions() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION bdm.truncate_official_tables() TO service_role, postgres;
GRANT EXECUTE ON FUNCTION bdm.bulk_insert_specialites(jsonb) TO service_role, postgres;
GRANT EXECUTE ON FUNCTION bdm.bulk_insert_presentations(jsonb) TO service_role, postgres;
GRANT EXECUTE ON FUNCTION bdm.bulk_insert_compositions(jsonb) TO service_role, postgres;
GRANT EXECUTE ON FUNCTION bdm.bulk_insert_generiques(jsonb) TO service_role, postgres;
GRANT EXECUTE ON FUNCTION bdm.rebuild_molecules_from_compositions() TO service_role, postgres;
