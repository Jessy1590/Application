-- =============================================================================
-- 045 : Variante ★ vide → ne pas écraser la base (fallback)
-- =============================================================================

CREATE OR REPLACE FUNCTION jeupharma.v2__texte_html_vide(p_txt text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT coalesce(trim(both FROM regexp_replace(
    coalesce(p_txt, ''),
    '<[^>]*>|&nbsp;|&#160;',
    '',
    'gi'
  )), '') = '';
$$;

CREATE OR REPLACE FUNCTION jeupharma.v2__payload_resolu(p_payload jsonb, p_niveau int)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  base jsonb;
  v jsonb;
  k text;
  merged jsonb;
  val text;
BEGIN
  base := coalesce(p_payload, '{}'::jsonb) - 'variantes' - '_brouillon';
  IF p_niveau IS NULL OR p_niveau < 1 THEN
    RETURN base;
  END IF;
  v := coalesce(p_payload, '{}'::jsonb)->'variantes'->(p_niveau::text);
  IF v IS NULL OR jsonb_typeof(v) <> 'object' THEN
    RETURN base;
  END IF;

  -- Ne fusionner que les clés non vides (sinon la base reste)
  merged := base;
  FOR k IN SELECT jsonb_object_keys(v)
  LOOP
    IF jsonb_typeof(v->k) = 'string' THEN
      val := v->>k;
      IF NOT jeupharma.v2__texte_html_vide(val) THEN
        merged := jsonb_set(merged, ARRAY[k], to_jsonb(val), true);
      END IF;
    ELSIF v->k IS NOT NULL AND jsonb_typeof(v->k) <> 'null' THEN
      merged := jsonb_set(merged, ARRAY[k], v->k, true);
    END IF;
  END LOOP;
  RETURN merged;
END;
$$;

REVOKE ALL ON FUNCTION jeupharma.v2__texte_html_vide(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION jeupharma.v2__texte_html_vide(text) FROM authenticated, anon;
