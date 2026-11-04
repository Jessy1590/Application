-- =============================================================================
-- 103 : Jeux V3 — besoin d’ordonnance : association_id + filtre non vide
-- Lab uniquement. Ne touche pas modeles_jeu.
-- =============================================================================

ALTER TABLE jeupharma.jeux_ordonnance_besoins
  ADD COLUMN IF NOT EXISTS association_id uuid
    REFERENCES jeupharma.matrice_medicaments(id) ON DELETE SET NULL;

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
      SELECT 1
      FROM jsonb_array_elements(p_cfg->'besoins') b
      WHERE coalesce(b->>'mode', 'aleatoire') = 'aleatoire'
        AND (
          coalesce(jsonb_array_length(CASE WHEN jsonb_typeof(b->'filtre_json'->'module_ids') = 'array'
            THEN b->'filtre_json'->'module_ids' ELSE '[]'::jsonb END), 0)
          + coalesce(jsonb_array_length(CASE WHEN jsonb_typeof(b->'filtre_json'->'bloc_ids') = 'array'
            THEN b->'filtre_json'->'bloc_ids' ELSE '[]'::jsonb END), 0)
          + coalesce(jsonb_array_length(CASE WHEN jsonb_typeof(b->'filtre_json'->'matrice_ids') = 'array'
            THEN b->'filtre_json'->'matrice_ids' ELSE '[]'::jsonb END), 0)
          + coalesce(jsonb_array_length(CASE WHEN jsonb_typeof(b->'filtre_json'->'entite_ids') = 'array'
            THEN b->'filtre_json'->'entite_ids' ELSE '[]'::jsonb END), 0)
        ) = 0
    ) THEN
      RAISE EXCEPTION 'Filtre de besoin vide';
    END IF;
    IF EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p_cfg->'besoins') b
      WHERE coalesce(b->>'mode', 'aleatoire') = 'manuel'
        AND nullif(b->>'matrice_id', '') IS NULL
        AND nullif(b->>'association_id', '') IS NULL
    ) THEN
      RAISE EXCEPTION 'Besoin manuel sans cible';
    END IF;
    INSERT INTO jeupharma.jeux_ordonnance_besoins (
      jeu_id, ordre, mode, matrice_id, association_id, filtre_json
    )
    SELECT
      p_jeu,
      coalesce((b->>'ordre')::int, ord::int),
      coalesce(b->>'mode', 'aleatoire'),
      NULLIF(b->>'matrice_id', '')::uuid,
      NULLIF(b->>'association_id', '')::uuid,
      coalesce(b->'filtre_json', '{}'::jsonb)
    FROM jsonb_array_elements(p_cfg->'besoins') WITH ORDINALITY AS t(b, ord);
  END IF;
END; $$;

CREATE OR REPLACE FUNCTION jeupharma.jeu_maj(p_jeu_id uuid, p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'jeupharma', 'portail', 'pg_temp' AS $$
DECLARE
  live jeupharma.jeux%ROWTYPE; arch jeupharma.jeux%ROWTYPE; has_t boolean; new_rev int;
BEGIN
  IF NOT jeupharma.is_portail_admin() THEN RAISE EXCEPTION 'Réservé admin portail'; END IF;
  SELECT * INTO live FROM jeupharma.jeux WHERE id = p_jeu_id AND statut <> 'archive';
  IF NOT FOUND THEN RAISE EXCEPTION 'Jeu introuvable'; END IF;
  PERFORM jeupharma.jeu__assert_lab_or_admin(live.parcours_id);
  SELECT EXISTS (SELECT 1 FROM jeupharma.jeux_tentatives WHERE jeu_id = live.id) INTO has_t;
  IF has_t THEN
    INSERT INTO jeupharma.jeux (
      code_unique, famille_code, revision, type_jeu, titre, parcours_id, module_ids, statut, archive_de_jeu_id, created_by
    ) VALUES (
      live.famille_code || '-A' || live.revision, live.famille_code, live.revision,
      live.type_jeu, live.titre, live.parcours_id, live.module_ids, 'archive', live.id, live.created_by
    ) RETURNING * INTO arch;
    INSERT INTO jeupharma.jeux_pool (jeu_id, mode)
    SELECT arch.id, mode FROM jeupharma.jeux_pool WHERE jeu_id = live.id ON CONFLICT DO NOTHING;
    INSERT INTO jeupharma.jeux_pool_modules SELECT arch.id, module_id FROM jeupharma.jeux_pool_modules WHERE jeu_id = live.id;
    INSERT INTO jeupharma.jeux_pool_blocs SELECT arch.id, bloc_id FROM jeupharma.jeux_pool_blocs WHERE jeu_id = live.id;
    INSERT INTO jeupharma.jeux_pool_molecules SELECT arch.id, matrice_id FROM jeupharma.jeux_pool_molecules WHERE jeu_id = live.id;
    IF live.type_jeu = 'quiz' THEN PERFORM jeupharma.jeu__clone_quiz(live.id, arch.id); END IF;
    IF live.type_jeu = 'trous' THEN
      INSERT INTO jeupharma.jeux_trous SELECT arch.id, composition, nb_lignes, lignes_mode, taux_trous, grille_json, now(), now()
      FROM jeupharma.jeux_trous WHERE jeu_id = live.id ON CONFLICT DO NOTHING;
      INSERT INTO jeupharma.jeux_trous_colonnes SELECT arch.id, champ_code, role, ordre FROM jeupharma.jeux_trous_colonnes WHERE jeu_id = live.id;
    ELSIF live.type_jeu = 'fiche_aleatoire' THEN
      INSERT INTO jeupharma.jeux_fiche SELECT arch.id, composition, nb_fiches, fiches_mode, seuil_exclusion, nb_notes_exclusion, now(), now()
      FROM jeupharma.jeux_fiche WHERE jeu_id = live.id ON CONFLICT DO NOTHING;
      INSERT INTO jeupharma.jeux_fiche_champs SELECT arch.id, champ_code, role FROM jeupharma.jeux_fiche_champs WHERE jeu_id = live.id;
      INSERT INTO jeupharma.jeux_fiche_emplacements (jeu_id, ordre, mode, matrice_id)
      SELECT arch.id, ordre, mode, matrice_id FROM jeupharma.jeux_fiche_emplacements WHERE jeu_id = live.id;
    ELSIF live.type_jeu = 'ordonnance' THEN
      INSERT INTO jeupharma.jeux_ordonnance SELECT arch.id, associations_possibles, now(), now() FROM jeupharma.jeux_ordonnance WHERE jeu_id = live.id ON CONFLICT DO NOTHING;
      INSERT INTO jeupharma.jeux_ordonnance_champs SELECT arch.id, champ_code FROM jeupharma.jeux_ordonnance_champs WHERE jeu_id = live.id;
      INSERT INTO jeupharma.jeux_ordonnance_besoins (jeu_id, ordre, mode, matrice_id, association_id, filtre_json)
      SELECT arch.id, ordre, mode, matrice_id, association_id, filtre_json
      FROM jeupharma.jeux_ordonnance_besoins WHERE jeu_id = live.id;
    ELSIF live.type_jeu = 'classement' THEN
      INSERT INTO jeupharma.jeux_classement SELECT arch.id, consigne, items_json, zones_json, now(), now() FROM jeupharma.jeux_classement WHERE jeu_id = live.id ON CONFLICT DO NOTHING;
    ELSIF live.type_jeu = 'appariement' THEN
      INSERT INTO jeupharma.jeux_appariement SELECT arch.id, consigne, gauche_json, droite_json, paires_json, now(), now() FROM jeupharma.jeux_appariement WHERE jeu_id = live.id ON CONFLICT DO NOTHING;
    END IF;
    UPDATE jeupharma.jeux_tentatives SET jeu_id = arch.id WHERE jeu_id = live.id;
    new_rev := live.revision + 1;
  ELSE
    new_rev := live.revision;
  END IF;
  UPDATE jeupharma.jeux SET
    titre = coalesce(nullif(trim(p_payload->>'titre'), ''), titre),
    module_ids = CASE WHEN p_payload ? 'module_ids' THEN
      COALESCE(ARRAY(SELECT jsonb_array_elements_text(p_payload->'module_ids')::uuid), '{}'::uuid[])
    ELSE module_ids END,
    revision = new_rev, updated_at = now()
  WHERE id = live.id RETURNING * INTO live;
  IF p_payload ? 'pool' THEN PERFORM jeupharma.jeu__set_pool(live.id, p_payload->'pool'); END IF;
  PERFORM jeupharma.jeu__apply_type_cfg(live.type_jeu, live.id, p_payload);
  RETURN to_jsonb(live);
END; $$;

CREATE OR REPLACE FUNCTION jeupharma.jeu_type_config(p_jeu_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'jeupharma', 'portail', 'pg_temp' AS $$
DECLARE
  j jeupharma.jeux%ROWTYPE;
  out jsonb := '{}'::jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT jeupharma.has_jeupharma_access() THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  SELECT * INTO j FROM jeupharma.jeux WHERE id = p_jeu_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF j.type_jeu = 'quiz' THEN RETURN jeupharma.jeu_quiz_config(p_jeu_id); END IF;
  IF j.type_jeu = 'trous' THEN
    SELECT jsonb_build_object(
      'composition', t.composition, 'nb_lignes', t.nb_lignes, 'lignes_mode', t.lignes_mode,
      'taux_trous', t.taux_trous, 'grille_json', t.grille_json,
      'colonnes', coalesce((SELECT jsonb_agg(jsonb_build_object('champ_code', c.champ_code, 'role', c.role, 'ordre', c.ordre) ORDER BY c.ordre)
        FROM jeupharma.jeux_trous_colonnes c WHERE c.jeu_id = j.id), '[]'::jsonb)
    ) INTO out FROM jeupharma.jeux_trous t WHERE t.jeu_id = j.id;
  ELSIF j.type_jeu = 'fiche_aleatoire' THEN
    SELECT jsonb_build_object(
      'composition', f.composition, 'nb_fiches', f.nb_fiches, 'fiches_mode', f.fiches_mode,
      'seuil_exclusion', f.seuil_exclusion, 'nb_notes_exclusion', f.nb_notes_exclusion,
      'champs', coalesce((SELECT jsonb_agg(jsonb_build_object('champ_code', c.champ_code, 'role', c.role))
        FROM jeupharma.jeux_fiche_champs c WHERE c.jeu_id = j.id), '[]'::jsonb),
      'emplacements', coalesce((SELECT jsonb_agg(jsonb_build_object('id', e.id, 'ordre', e.ordre, 'mode', e.mode, 'matrice_id', e.matrice_id) ORDER BY e.ordre)
        FROM jeupharma.jeux_fiche_emplacements e WHERE e.jeu_id = j.id), '[]'::jsonb)
    ) INTO out FROM jeupharma.jeux_fiche f WHERE f.jeu_id = j.id;
  ELSIF j.type_jeu = 'ordonnance' THEN
    SELECT jsonb_build_object(
      'associations_possibles', o.associations_possibles,
      'champs', coalesce((SELECT jsonb_agg(champ_code) FROM jeupharma.jeux_ordonnance_champs c WHERE c.jeu_id = j.id), '[]'::jsonb),
      'besoins', coalesce((SELECT jsonb_agg(jsonb_build_object(
          'id', b.id, 'ordre', b.ordre, 'mode', b.mode,
          'matrice_id', b.matrice_id, 'association_id', b.association_id, 'filtre_json', b.filtre_json
        ) ORDER BY b.ordre)
        FROM jeupharma.jeux_ordonnance_besoins b WHERE b.jeu_id = j.id), '[]'::jsonb)
    ) INTO out FROM jeupharma.jeux_ordonnance o WHERE o.jeu_id = j.id;
  ELSIF j.type_jeu = 'classement' THEN
    SELECT jsonb_build_object('consigne', c.consigne, 'items', c.items_json, 'zones', c.zones_json)
    INTO out FROM jeupharma.jeux_classement c WHERE c.jeu_id = j.id;
  ELSIF j.type_jeu = 'appariement' THEN
    SELECT jsonb_build_object('consigne', a.consigne, 'gauche', a.gauche_json, 'droite', a.droite_json, 'paires', a.paires_json)
    INTO out FROM jeupharma.jeux_appariement a WHERE a.jeu_id = j.id;
  END IF;
  RETURN out;
END; $$;

-- Helpers internes : appelés par jeu_creer / jeu_maj (definer). Pas d’EXECUTE anon/authenticated.
REVOKE ALL ON FUNCTION jeupharma.jeu__set_ordonnance(uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION jeupharma.jeu__set_trous(uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION jeupharma.jeu__set_fiche(uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION jeupharma.jeu__set_classement(uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION jeupharma.jeu__set_appariement(uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION jeupharma.jeu__set_quiz(uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION jeupharma.jeu__set_pool(uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION jeupharma.jeu__apply_type_cfg(text, uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION jeupharma.jeu__clone_quiz(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION jeupharma.jeu__assert_lab_or_admin(uuid) FROM PUBLIC, anon, authenticated;
