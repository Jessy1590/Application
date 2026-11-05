-- 106 : Jeux V3 — besoin d'ordonnance aléatoire : un filtre secteur / classe seul suffit.

CREATE OR REPLACE FUNCTION jeupharma.jeu__sel_taille(p_sel jsonb)
RETURNS int LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(sum(CASE WHEN jsonb_typeof(v) = 'array' THEN jsonb_array_length(v) ELSE 0 END), 0)::int
  FROM (
    SELECT p_sel->'module_ids' UNION ALL SELECT p_sel->'bloc_ids' UNION ALL SELECT p_sel->'matrice_ids'
    UNION ALL SELECT p_sel->'entite_ids'
    UNION ALL SELECT p_sel->'filtres'->'secteur' UNION ALL SELECT p_sel->'filtres'->'classe_ther'
    UNION ALL SELECT p_sel->'filtres'->'classe_pharma'
  ) s(v);
$$;

CREATE OR REPLACE FUNCTION jeupharma.jeu__set_ordonnance(p_jeu uuid, p_cfg jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'jeupharma', 'pg_temp' AS $$
BEGIN
  IF NOT jeupharma.is_portail_admin() THEN RAISE EXCEPTION 'Réservé admin portail'; END IF;
  IF p_cfg IS NULL THEN RETURN; END IF;
  INSERT INTO jeupharma.jeux_ordonnance (jeu_id, associations_possibles)
  VALUES (p_jeu, coalesce((p_cfg->>'associations_possibles')::boolean, false))
  ON CONFLICT (jeu_id) DO UPDATE SET
    associations_possibles = EXCLUDED.associations_possibles, updated_at = now();
  DELETE FROM jeupharma.jeux_ordonnance_champs WHERE jeu_id = p_jeu;
  IF jsonb_typeof(p_cfg->'champs') = 'array' THEN
    INSERT INTO jeupharma.jeux_ordonnance_champs (jeu_id, champ_code)
    SELECT p_jeu, x FROM jsonb_array_elements_text(p_cfg->'champs') x
    WHERE nullif(x, '') IS NOT NULL;
  END IF;
  DELETE FROM jeupharma.jeux_ordonnance_besoins WHERE jeu_id = p_jeu;
  IF jsonb_typeof(p_cfg->'besoins') = 'array' THEN
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_cfg->'besoins') b
      WHERE coalesce(b->>'mode', 'aleatoire') = 'aleatoire'
        AND jeupharma.jeu__sel_taille(coalesce(b->'filtre_json', '{}'::jsonb)) = 0
    ) THEN
      RAISE EXCEPTION 'Filtre de besoin vide';
    END IF;
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_cfg->'besoins') b
      WHERE coalesce(b->>'mode', 'aleatoire') = 'manuel'
        AND nullif(b->>'matrice_id', '') IS NULL
        AND nullif(b->>'association_id', '') IS NULL
    ) THEN
      RAISE EXCEPTION 'Besoin manuel sans cible';
    END IF;
    INSERT INTO jeupharma.jeux_ordonnance_besoins (jeu_id, ordre, mode, matrice_id, association_id, filtre_json)
    SELECT p_jeu, coalesce((b->>'ordre')::int, ord::int), coalesce(b->>'mode', 'aleatoire'),
           NULLIF(b->>'matrice_id', '')::uuid, NULLIF(b->>'association_id', '')::uuid,
           coalesce(b->'filtre_json', '{}'::jsonb)
    FROM jsonb_array_elements(p_cfg->'besoins') WITH ORDINALITY AS t(b, ord);
  END IF;
END; $$;

REVOKE ALL ON FUNCTION jeupharma.jeu__sel_taille(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION jeupharma.jeu__set_ordonnance(uuid, jsonb) FROM PUBLIC, anon, authenticated;
