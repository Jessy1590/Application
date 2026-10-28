-- =============================================================================
-- 076 : Suppression du parcours « Cardiovasculaire v2 » (`cardiovasculaires_v2`)
--
-- Même logique que 031 (suppression `introduction` / DEUST démo) :
--   - `modeles_jeu` liés (parcours / module_ids) + blocs « jeu » externes ;
--   - nettoyage `criteres_json.jeux` des parcours/modules restants ;
--   - DELETE `parcours_apprentissage` → CASCADE modules, blocs, pubs,
--     progression, inscriptions ; `profil_apprentissage.parcours_id` → NULL.
-- Idempotent : no-op si le code est déjà absent.
-- Ne touche PAS `cardiovasculaires_deust_2a` ni le référentiel.
-- =============================================================================

DO $$
DECLARE
  v_pids uuid[];
  v_mj uuid[];
  v_mj_txt text[];
BEGIN
  SELECT coalesce(array_agg(id), '{}'::uuid[]) INTO v_pids
  FROM jeupharma.parcours_apprentissage
  WHERE code = 'cardiovasculaires_v2';

  IF cardinality(v_pids) = 0 THEN
    RAISE NOTICE '076: cardiovasculaires_v2 déjà absent';
    RETURN;
  END IF;

  SELECT coalesce(array_agg(id), '{}'::uuid[]) INTO v_mj
  FROM jeupharma.modeles_jeu
  WHERE parcours_id = ANY (v_pids)
     OR module_ids && ARRAY(
          SELECT id FROM jeupharma.modules_cours WHERE parcours_id = ANY (v_pids)
        );
  v_mj_txt := ARRAY(SELECT x::text FROM unnest(v_mj) AS x);

  DELETE FROM jeupharma.module_blocs
  WHERE type_bloc = 'jeu' AND payload_json->>'modele_id' = ANY (v_mj_txt);

  UPDATE jeupharma.parcours_apprentissage p
  SET criteres_json = jsonb_set(
    p.criteres_json, '{jeux}',
    coalesce((
      SELECT jsonb_agg(e) FROM jsonb_array_elements(p.criteres_json->'jeux') AS e
      WHERE NOT ((e->>'modele_id') = ANY (v_mj_txt))
    ), '[]'::jsonb))
  WHERE NOT (p.id = ANY (v_pids))
    AND jsonb_typeof(p.criteres_json->'jeux') = 'array';

  UPDATE jeupharma.modules_cours c
  SET criteres_json = jsonb_set(
    c.criteres_json, '{jeux}',
    coalesce((
      SELECT jsonb_agg(e) FROM jsonb_array_elements(c.criteres_json->'jeux') AS e
      WHERE NOT ((e->>'modele_id') = ANY (v_mj_txt))
    ), '[]'::jsonb))
  WHERE NOT (c.parcours_id = ANY (v_pids))
    AND jsonb_typeof(c.criteres_json->'jeux') = 'array';

  DELETE FROM jeupharma.modeles_jeu WHERE id = ANY (v_mj);

  DELETE FROM jeupharma.parcours_apprentissage WHERE id = ANY (v_pids);

  RAISE NOTICE '076: cardiovasculaires_v2 supprimé (% jeux)', cardinality(v_mj);
END;
$$;
