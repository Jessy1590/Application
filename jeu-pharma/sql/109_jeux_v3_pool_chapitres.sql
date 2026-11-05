-- 109 : Jeux V3 — pool sélecteur : chapitres (groupes) persistés + expansion en leçons.
-- Aligné sur le distant (sel_taille / set_pool / jeu_charger) + chapitre_ids uniquement.

-- Compte aussi chapitre_ids (besoin d'ordonnance / sel vide).
CREATE OR REPLACE FUNCTION jeupharma.jeu__sel_taille(p_sel jsonb)
RETURNS int LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(sum(CASE WHEN jsonb_typeof(v) = 'array' THEN jsonb_array_length(v) ELSE 0 END), 0)::int
  FROM (
    SELECT p_sel->'module_ids' UNION ALL SELECT p_sel->'bloc_ids' UNION ALL SELECT p_sel->'matrice_ids'
    UNION ALL SELECT p_sel->'chapitre_ids' UNION ALL SELECT p_sel->'entite_ids'
    UNION ALL SELECT p_sel->'filtres'->'secteur' UNION ALL SELECT p_sel->'filtres'->'classe_ther'
    UNION ALL SELECT p_sel->'filtres'->'classe_pharma'
    UNION ALL SELECT p_sel->'filtres'->'__chapitre_ids'
  ) s(v);
$$;

CREATE OR REPLACE FUNCTION jeupharma.jeu__set_pool(
  p_jeu uuid,
  p_pool jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
DECLARE
  mode text;
  filtres jsonb;
  chap jsonb;
BEGIN
  IF p_pool IS NULL OR p_pool = '{}'::jsonb THEN
    DELETE FROM jeupharma.jeux_pool WHERE jeu_id = p_jeu;
    DELETE FROM jeupharma.jeux_pool_modules WHERE jeu_id = p_jeu;
    DELETE FROM jeupharma.jeux_pool_blocs WHERE jeu_id = p_jeu;
    DELETE FROM jeupharma.jeux_pool_molecules WHERE jeu_id = p_jeu;
    RETURN;
  END IF;

  mode := coalesce(nullif(p_pool->>'mode', ''), 'selection');
  filtres := coalesce(p_pool->'filtres', '{}'::jsonb);
  IF jsonb_typeof(filtres) <> 'object' THEN filtres := '{}'::jsonb; END IF;

  chap := CASE
    WHEN jsonb_typeof(p_pool->'chapitre_ids') = 'array' THEN p_pool->'chapitre_ids'
    WHEN jsonb_typeof(filtres->'__chapitre_ids') = 'array' THEN filtres->'__chapitre_ids'
    ELSE '[]'::jsonb
  END;
  filtres := jsonb_set(filtres, '{__chapitre_ids}', chap, true);

  INSERT INTO jeupharma.jeux_pool (jeu_id, mode, filtres_json)
  VALUES (p_jeu, mode, filtres)
  ON CONFLICT (jeu_id) DO UPDATE SET
    mode = EXCLUDED.mode,
    filtres_json = EXCLUDED.filtres_json;

  DELETE FROM jeupharma.jeux_pool_modules WHERE jeu_id = p_jeu;
  DELETE FROM jeupharma.jeux_pool_blocs WHERE jeu_id = p_jeu;
  DELETE FROM jeupharma.jeux_pool_molecules WHERE jeu_id = p_jeu;

  IF jsonb_typeof(p_pool->'module_ids') = 'array' THEN
    INSERT INTO jeupharma.jeux_pool_modules (jeu_id, module_id)
    SELECT p_jeu, x::uuid
    FROM jsonb_array_elements_text(p_pool->'module_ids') x
    WHERE nullif(x, '') IS NOT NULL
    ON CONFLICT DO NOTHING;
  END IF;

  IF jsonb_typeof(chap) = 'array' THEN
    INSERT INTO jeupharma.jeux_pool_modules (jeu_id, module_id)
    SELECT DISTINCT p_jeu, leaf.id
    FROM jsonb_array_elements_text(chap) chap_row(x)
    JOIN LATERAL (
      WITH RECURSIVE tree AS (
        SELECT m.id, m.est_groupe, m.parent_id
        FROM jeupharma.modules_cours m
        WHERE m.id = nullif(chap_row.x, '')::uuid
        UNION ALL
        SELECT c.id, c.est_groupe, c.parent_id
        FROM jeupharma.modules_cours c
        JOIN tree t ON c.parent_id = t.id
      )
      SELECT id FROM tree WHERE coalesce(est_groupe, false) = false
    ) leaf ON true
    ON CONFLICT DO NOTHING;
  END IF;

  IF jsonb_typeof(p_pool->'bloc_ids') = 'array' THEN
    INSERT INTO jeupharma.jeux_pool_blocs (jeu_id, bloc_id)
    SELECT p_jeu, x::uuid
    FROM jsonb_array_elements_text(p_pool->'bloc_ids') x
    WHERE nullif(x, '') IS NOT NULL
    ON CONFLICT DO NOTHING;
  END IF;

  IF jsonb_typeof(p_pool->'matrice_ids') = 'array' THEN
    INSERT INTO jeupharma.jeux_pool_molecules (jeu_id, matrice_id)
    SELECT p_jeu, x::uuid
    FROM jsonb_array_elements_text(p_pool->'matrice_ids') x
    WHERE nullif(x, '') IS NOT NULL
    ON CONFLICT DO NOTHING;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION jeupharma.jeu_charger(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
DECLARE
  j jeupharma.jeux%ROWTYPE;
  pool jsonb := '{}'::jsonb;
  lab boolean := false;
BEGIN
  IF auth.uid() IS NULL OR NOT jeupharma.has_jeupharma_access() THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  SELECT * INTO j FROM jeupharma.jeux
  WHERE code_unique = upper(trim(p_code));
  IF NOT FOUND THEN RAISE EXCEPTION 'Jeu introuvable'; END IF;

  IF j.statut = 'pause' AND NOT jeupharma.is_portail_admin() THEN
    RAISE EXCEPTION 'Ce jeu est en pause';
  END IF;
  IF j.statut = 'archive' AND NOT jeupharma.is_portail_admin() THEN
    RAISE EXCEPTION 'Jeu archivé';
  END IF;
  IF j.statut <> 'actif' AND NOT jeupharma.is_portail_admin() THEN
    RAISE EXCEPTION 'Jeu indisponible';
  END IF;

  IF j.parcours_id IS NOT NULL THEN
    SELECT est_laboratoire INTO lab FROM jeupharma.parcours_apprentissage WHERE id = j.parcours_id;
    IF lab AND NOT jeupharma.is_portail_admin() THEN
      RAISE EXCEPTION 'Réservé admin';
    END IF;
  END IF;

  SELECT jsonb_build_object(
    'mode', p.mode,
    'module_ids', coalesce((
      SELECT jsonb_agg(m.module_id::text)
      FROM jeupharma.jeux_pool_modules m
      WHERE m.jeu_id = j.id
    ), '[]'::jsonb),
    'bloc_ids', coalesce((
      SELECT jsonb_agg(b.bloc_id::text)
      FROM jeupharma.jeux_pool_blocs b
      WHERE b.jeu_id = j.id
    ), '[]'::jsonb),
    'matrice_ids', coalesce((
      SELECT jsonb_agg(mol.matrice_id::text)
      FROM jeupharma.jeux_pool_molecules mol
      WHERE mol.jeu_id = j.id
    ), '[]'::jsonb),
    'chapitre_ids', coalesce(p.filtres_json->'__chapitre_ids', '[]'::jsonb),
    'filtres', coalesce(p.filtres_json, '{}'::jsonb) - '__chapitre_ids'
  ) INTO pool
  FROM jeupharma.jeux_pool p
  WHERE p.jeu_id = j.id;

  RETURN jsonb_build_object(
    'id', j.id,
    'code_unique', j.code_unique,
    'famille_code', j.famille_code,
    'revision', j.revision,
    'type_jeu', j.type_jeu,
    'titre', j.titre,
    'parcours_id', j.parcours_id,
    'module_ids', to_jsonb(j.module_ids),
    'niveau_min', j.niveau_min,
    'niveau_max', j.niveau_max,
    'statut', j.statut,
    'pool', coalesce(pool, '{}'::jsonb),
    'est_laboratoire', coalesce(lab, false)
  );
END;
$$;

REVOKE ALL ON FUNCTION jeupharma.jeu__sel_taille(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION jeupharma.jeu__set_pool(uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION jeupharma.jeu_charger(text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION jeupharma.jeu_charger(text) TO authenticated;
