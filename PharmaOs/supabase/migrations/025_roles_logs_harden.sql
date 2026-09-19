-- =============================================================================
-- 025 — durcissement helpers rôles / triggers logs
-- =============================================================================

CREATE OR REPLACE FUNCTION portail.canonical_role(p_role text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = portail, pg_temp
AS $$
  SELECT CASE
    WHEN p_role = 'admin' THEN 'administrateur'
    WHEN p_role IN ('équipe', 'member') THEN 'préparateur'
    WHEN p_role IN ('pharmacien', 'administrateur', 'gestionnaire', 'préparateur') THEN p_role
    ELSE 'préparateur'
  END;
$$;

CREATE OR REPLACE FUNCTION "PharmaOs".set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_temp
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION portail.canonical_role(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION portail.canonical_role(text) TO authenticated, anon;

REVOKE ALL ON FUNCTION portail.prevent_self_role_escalation() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION portail.prevent_self_role_escalation() TO authenticated;

REVOKE ALL ON FUNCTION "PharmaOs".log_row_mutation() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION "PharmaOs".log_row_mutation() TO authenticated;

REVOKE ALL ON FUNCTION "PharmaOs".set_updated_at() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION "PharmaOs".set_updated_at() TO authenticated;
