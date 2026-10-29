-- =============================================================================
-- 087 : Prérequis multi-leçons (ET) + lien « leçon suivante » personnalisable
-- Projet : kpjflntnotftpzffjbud
--
-- - modules_cours.prerequis_module_ids uuid[] : 0..N prérequis (tous validés)
-- - modules_cours.prerequis_module_id : conservé = 1er élément (compat)
-- - modules_cours.module_suivant_id : bouton « Leçon suivante » (sinon ordre officiel)
-- - Overrides ★ : criteres_json.niveaux["N"].prerequis_module_ids[]
-- =============================================================================

ALTER TABLE jeupharma.modules_cours
  ADD COLUMN IF NOT EXISTS prerequis_module_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];

ALTER TABLE jeupharma.modules_cours
  ADD COLUMN IF NOT EXISTS module_suivant_id uuid
    REFERENCES jeupharma.modules_cours(id) ON DELETE SET NULL;

COMMENT ON COLUMN jeupharma.modules_cours.prerequis_module_ids IS
  'Prérequis de déblocage (ET) : la leçon s’ouvre quand TOUTES ces leçons/chapitres sont validés.';
COMMENT ON COLUMN jeupharma.modules_cours.module_suivant_id IS
  'Cible du bouton « Leçon suivante » ; NULL = feuille suivante dans l’ordre officiel.';

-- Backfill depuis le scalaire legacy
UPDATE jeupharma.modules_cours
SET prerequis_module_ids = ARRAY[prerequis_module_id]
WHERE prerequis_module_id IS NOT NULL
  AND (prerequis_module_ids IS NULL OR cardinality(prerequis_module_ids) = 0);

CREATE INDEX IF NOT EXISTS modules_cours_prerequis_ids_gin
  ON jeupharma.modules_cours USING gin (prerequis_module_ids);

CREATE INDEX IF NOT EXISTS modules_cours_module_suivant_idx
  ON jeupharma.modules_cours (module_suivant_id)
  WHERE module_suivant_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Helper : normaliser un jsonb → uuid[]
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION jeupharma.v2__uuids_from_jsonb(p jsonb)
RETURNS uuid[]
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  out uuid[] := ARRAY[]::uuid[];
  elem text;
  u uuid;
BEGIN
  IF p IS NULL THEN
    RETURN out;
  END IF;
  IF jsonb_typeof(p) = 'array' THEN
    FOR elem IN SELECT jsonb_array_elements_text(p)
    LOOP
      IF elem IS NULL OR elem = '' THEN CONTINUE; END IF;
      BEGIN
        u := elem::uuid;
      EXCEPTION WHEN invalid_text_representation THEN
        CONTINUE;
      END;
      IF NOT (u = ANY (out)) THEN
        out := array_append(out, u);
      END IF;
    END LOOP;
  ELSIF jsonb_typeof(p) = 'string' THEN
    BEGIN
      u := nullif(p #>> '{}', '')::uuid;
      IF u IS NOT NULL THEN out := ARRAY[u]; END IF;
    EXCEPTION WHEN others THEN
      NULL;
    END;
  END IF;
  RETURN out;
END;
$$;

REVOKE ALL ON FUNCTION jeupharma.v2__uuids_from_jsonb(jsonb) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- Prérequis effectifs pour un ★ (tableau, éventuellement vide)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION jeupharma.v2__prerequis_modules_pour_niveau(
  p_module uuid,
  p_niv integer
)
RETURNS uuid[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'jeupharma', 'pg_temp'
AS $$
DECLARE
  m jeupharma.modules_cours%ROWTYPE;
  crit jsonb;
  k text;
  ov jsonb;
  ids uuid[];
BEGIN
  SELECT * INTO m FROM jeupharma.modules_cours WHERE id = p_module;
  IF NOT FOUND THEN RETURN ARRAY[]::uuid[]; END IF;
  crit := coalesce(m.criteres_json, '{}'::jsonb);

  IF p_niv IS NOT NULL AND p_niv BETWEEN 1 AND 5 THEN
    k := p_niv::text;
    IF jsonb_typeof(crit->'niveaux') = 'object'
       AND jsonb_typeof(crit->'niveaux'->k) = 'object' THEN
      ov := crit->'niveaux'->k;
      IF ov ? 'prerequis_module_ids' THEN
        RETURN jeupharma.v2__uuids_from_jsonb(ov->'prerequis_module_ids');
      END IF;
      IF ov ? 'prerequis_module_id' THEN
        ids := jeupharma.v2__uuids_from_jsonb(to_jsonb(ov->>'prerequis_module_id'));
        RETURN ids;
      END IF;
    END IF;
  END IF;

  IF crit ? 'prerequis_module_ids' THEN
    RETURN jeupharma.v2__uuids_from_jsonb(crit->'prerequis_module_ids');
  END IF;
  IF crit ? 'prerequis_module_id' THEN
    RETURN jeupharma.v2__uuids_from_jsonb(to_jsonb(crit->>'prerequis_module_id'));
  END IF;

  IF m.prerequis_module_ids IS NOT NULL AND cardinality(m.prerequis_module_ids) > 0 THEN
    RETURN m.prerequis_module_ids;
  END IF;
  IF m.prerequis_module_id IS NOT NULL THEN
    RETURN ARRAY[m.prerequis_module_id];
  END IF;
  RETURN ARRAY[]::uuid[];
END;
$$;

REVOKE ALL ON FUNCTION jeupharma.v2__prerequis_modules_pour_niveau(uuid, int) FROM PUBLIC;

-- Compat : 1er prérequis (anciens appelants)
CREATE OR REPLACE FUNCTION jeupharma.v2__prerequis_module_pour_niveau(
  p_module uuid,
  p_niv integer
)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'jeupharma', 'pg_temp'
AS $$
  SELECT (jeupharma.v2__prerequis_modules_pour_niveau(p_module, p_niv))[1];
$$;

-- ---------------------------------------------------------------------------
-- Clean criteres : arrays prerequis_module_ids (+ singular legacy)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION jeupharma.v2__clean_criteres(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  out jsonb;
  nivs jsonb := '{}'::jsonb;
  k text;
  raw jsonb;
  cleaned jsonb;
  pre uuid;
  pres uuid[];
BEGIN
  IF p IS NULL OR jsonb_typeof(p) <> 'object' THEN
    RETURN '{}'::jsonb;
  END IF;

  out := jeupharma.v2__critere_plat(p);

  IF p ? 'prerequis_module_ids' THEN
    pres := jeupharma.v2__uuids_from_jsonb(p->'prerequis_module_ids');
    out := out || jsonb_build_object('prerequis_module_ids', to_jsonb(pres));
    IF cardinality(pres) > 0 THEN
      out := out || jsonb_build_object('prerequis_module_id', to_jsonb(pres[1]));
    ELSE
      out := out || '{"prerequis_module_id": null}'::jsonb;
    END IF;
  ELSIF p ? 'prerequis_module_id' THEN
    BEGIN
      pre := nullif(p->>'prerequis_module_id', '')::uuid;
      IF pre IS NULL THEN
        out := out || '{"prerequis_module_id": null, "prerequis_module_ids": []}'::jsonb;
      ELSE
        out := out || jsonb_build_object(
          'prerequis_module_id', to_jsonb(pre),
          'prerequis_module_ids', jsonb_build_array(to_jsonb(pre))
        );
      END IF;
    EXCEPTION WHEN others THEN
      out := out || '{"prerequis_module_id": null, "prerequis_module_ids": []}'::jsonb;
    END;
  END IF;

  IF jsonb_typeof(p->'niveaux') = 'object' THEN
    FOR k IN SELECT * FROM jsonb_object_keys(p->'niveaux') LOOP
      IF k !~ '^[1-5]$' THEN CONTINUE; END IF;
      raw := p->'niveaux'->k;
      IF jsonb_typeof(raw) <> 'object' THEN CONTINUE; END IF;
      cleaned := jeupharma.v2__critere_plat(raw);
      IF raw ? 'prerequis_module_ids' THEN
        pres := jeupharma.v2__uuids_from_jsonb(raw->'prerequis_module_ids');
        cleaned := cleaned || jsonb_build_object('prerequis_module_ids', to_jsonb(pres));
        IF cardinality(pres) > 0 THEN
          cleaned := cleaned || jsonb_build_object('prerequis_module_id', to_jsonb(pres[1]));
        ELSE
          cleaned := cleaned || '{"prerequis_module_id": null}'::jsonb;
        END IF;
      ELSIF raw ? 'prerequis_module_id' THEN
        BEGIN
          pre := nullif(raw->>'prerequis_module_id', '')::uuid;
          IF pre IS NULL THEN
            cleaned := cleaned || '{"prerequis_module_id": null, "prerequis_module_ids": []}'::jsonb;
          ELSE
            cleaned := cleaned || jsonb_build_object(
              'prerequis_module_id', to_jsonb(pre),
              'prerequis_module_ids', jsonb_build_array(to_jsonb(pre))
            );
          END IF;
        EXCEPTION WHEN others THEN
          cleaned := cleaned || '{"prerequis_module_id": null, "prerequis_module_ids": []}'::jsonb;
        END;
      END IF;
      IF cleaned <> '{}'::jsonb THEN
        nivs := nivs || jsonb_build_object(k, cleaned);
      END IF;
    END LOOP;
    IF nivs <> '{}'::jsonb THEN
      out := out || jsonb_build_object('niveaux', nivs);
    END IF;
  END IF;

  RETURN out;
END;
$$;

-- ---------------------------------------------------------------------------
-- Déblocage : TOUS les prérequis doivent être validés (ET)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION jeupharma.v2_module_bloque_par(p_user uuid, p_module uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
DECLARE
  v_parcours uuid;
  v_niv int;
  pd jsonb;
  r record;
  pre_ids uuid[];
  pre_id uuid;
  pre_titre text;
BEGIN
  SELECT parcours_id INTO v_parcours FROM jeupharma.modules_cours WHERE id = p_module;
  IF NOT FOUND THEN RETURN NULL; END IF;

  v_niv := jeupharma.v2__niveau_inscrit(p_user, v_parcours);
  IF v_niv < 1 THEN
    RETURN jsonb_build_object('type', 'inscription', 'titre', 'Parcours non accepté');
  END IF;
  IF NOT jeupharma.v2__module_dans_niveau(p_module, v_niv) THEN
    RETURN jsonb_build_object('type', 'niveau', 'titre', 'Hors niveau d’accès', 'niveau', v_niv);
  END IF;

  pd := jeupharma.v2_parcours_detail(p_user, v_parcours);
  IF coalesce((pd->>'verrouille')::boolean, false) THEN
    RETURN pd->'bloque_par';
  END IF;

  FOR r IN
    SELECT a.module_id AS mid, a.profondeur
    FROM jeupharma.v2_module_ancetres(p_module) a
    ORDER BY a.profondeur
  LOOP
    pre_ids := jeupharma.v2__prerequis_modules_pour_niveau(r.mid, v_niv);
    IF pre_ids IS NULL OR cardinality(pre_ids) = 0 THEN
      CONTINUE;
    END IF;

    FOREACH pre_id IN ARRAY pre_ids LOOP
      SELECT titre INTO pre_titre
      FROM jeupharma.modules_cours
      WHERE id = pre_id AND publie;
      IF NOT FOUND THEN CONTINUE; END IF;

      -- Prérequis hors plage ★ du joueur : ignoré
      IF NOT jeupharma.v2__module_dans_niveau(pre_id, v_niv) THEN
        CONTINUE;
      END IF;
      IF NOT jeupharma.v2_module_valide(p_user, pre_id) THEN
        RETURN jsonb_build_object(
          'type', 'module',
          'module_id', pre_id,
          'titre', pre_titre,
          'detail', jeupharma.v2_module_detail(p_user, pre_id),
          'niveau_parcours', v_niv
        );
      END IF;
    END LOOP;
  END LOOP;
  RETURN NULL;
END;
$$;

-- ---------------------------------------------------------------------------
-- Upsert module : arrays + module_suivant_id
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION jeupharma.v2_upsert_module(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
DECLARE
  row jeupharma.modules_cours%ROWTYPE;
  v_id uuid;
  v_code text;
  v_publie boolean;
  plage int[];
  v_pre_ids uuid[];
  v_pre uuid;
  v_suiv uuid;
BEGIN
  IF NOT jeupharma.is_portail_admin() THEN
    RAISE EXCEPTION 'Réservé admin portail';
  END IF;

  v_id := nullif(p_payload->>'id', '')::uuid;
  v_code := lower(trim(both FROM regexp_replace(
    coalesce(p_payload->>'code', p_payload->>'titre'),
    '[^a-zA-Z0-9]+', '_', 'g'
  )));
  v_code := trim(both '_' from v_code);
  plage := jeupharma.v2__clean_plage(
    coalesce((p_payload->>'niveau_min')::int, 1),
    coalesce((p_payload->>'niveau_max')::int, 5)
  );

  IF p_payload ? 'prerequis_module_ids' THEN
    v_pre_ids := jeupharma.v2__uuids_from_jsonb(p_payload->'prerequis_module_ids');
  ELSIF p_payload ? 'prerequis_module_id' THEN
    v_pre := nullif(p_payload->>'prerequis_module_id', '')::uuid;
    v_pre_ids := CASE WHEN v_pre IS NULL THEN ARRAY[]::uuid[] ELSE ARRAY[v_pre] END;
  ELSE
    v_pre_ids := NULL; -- ne pas toucher en update
  END IF;
  IF v_pre_ids IS NOT NULL THEN
    v_pre := CASE WHEN cardinality(v_pre_ids) > 0 THEN v_pre_ids[1] ELSE NULL END;
  END IF;

  IF p_payload ? 'module_suivant_id' THEN
    v_suiv := nullif(p_payload->>'module_suivant_id', '')::uuid;
  ELSE
    v_suiv := NULL; -- sentinel: use separate flag
  END IF;

  IF v_id IS NULL THEN
    v_publie := coalesce((p_payload->>'publie')::boolean, coalesce(p_payload->>'statut', 'publie') = 'publie');
    INSERT INTO jeupharma.modules_cours (
      parcours_id, parent_id, code, titre, resume, objectifs, ordre,
      publie, est_groupe, prerequis_module_id, prerequis_module_ids, module_suivant_id,
      created_by, version_publication,
      icone, couleur_accent, couverture_url, statut, criteres_json, contenu_maj_at,
      niveau_min, niveau_max
    ) VALUES (
      (p_payload->>'parcours_id')::uuid,
      nullif(p_payload->>'parent_id', '')::uuid,
      v_code,
      trim(p_payload->>'titre'),
      coalesce(p_payload->>'resume', ''),
      coalesce(p_payload->>'objectifs', ''),
      coalesce((p_payload->>'ordre')::int, 100),
      v_publie,
      coalesce((p_payload->>'est_groupe')::boolean, false),
      coalesce(v_pre, nullif(p_payload->>'prerequis_module_id', '')::uuid),
      coalesce(v_pre_ids, ARRAY[]::uuid[]),
      CASE WHEN p_payload ? 'module_suivant_id' THEN v_suiv ELSE NULL END,
      auth.uid(),
      1,
      nullif(p_payload->>'icone', ''),
      nullif(p_payload->>'couleur_accent', ''),
      nullif(p_payload->>'couverture_url', ''),
      coalesce(nullif(p_payload->>'statut', ''), 'publie'),
      jeupharma.v2__clean_criteres(p_payload->'criteres_json'),
      now(),
      plage[1], plage[2]
    )
    RETURNING * INTO row;
  ELSE
    UPDATE jeupharma.modules_cours SET
      parent_id = coalesce(nullif(p_payload->>'parent_id', '')::uuid, parent_id),
      titre = coalesce(nullif(trim(p_payload->>'titre'), ''), titre),
      resume = coalesce(p_payload->>'resume', resume),
      objectifs = coalesce(p_payload->>'objectifs', objectifs),
      ordre = coalesce((p_payload->>'ordre')::int, ordre),
      publie = coalesce((p_payload->>'publie')::boolean, publie),
      est_groupe = coalesce((p_payload->>'est_groupe')::boolean, est_groupe),
      prerequis_module_ids = CASE
        WHEN v_pre_ids IS NOT NULL THEN v_pre_ids
        ELSE prerequis_module_ids
      END,
      prerequis_module_id = CASE
        WHEN v_pre_ids IS NOT NULL THEN v_pre
        WHEN p_payload ? 'prerequis_module_id' THEN nullif(p_payload->>'prerequis_module_id', '')::uuid
        ELSE prerequis_module_id
      END,
      module_suivant_id = CASE
        WHEN p_payload ? 'module_suivant_id' THEN v_suiv
        ELSE module_suivant_id
      END,
      icone = CASE WHEN p_payload ? 'icone' THEN nullif(p_payload->>'icone', '') ELSE icone END,
      couleur_accent = CASE WHEN p_payload ? 'couleur_accent' THEN nullif(p_payload->>'couleur_accent', '') ELSE couleur_accent END,
      couverture_url = CASE WHEN p_payload ? 'couverture_url' THEN nullif(p_payload->>'couverture_url', '') ELSE couverture_url END,
      statut = coalesce(nullif(p_payload->>'statut', ''), statut),
      criteres_json = CASE
        WHEN p_payload ? 'criteres_json' THEN jeupharma.v2__clean_criteres(p_payload->'criteres_json')
        ELSE criteres_json
      END,
      niveau_min = CASE
        WHEN p_payload ? 'niveau_min' OR p_payload ? 'niveau_max' THEN
          (jeupharma.v2__clean_plage(
            coalesce((p_payload->>'niveau_min')::int, niveau_min),
            coalesce((p_payload->>'niveau_max')::int, niveau_max)
          ))[1]
        ELSE niveau_min
      END,
      niveau_max = CASE
        WHEN p_payload ? 'niveau_min' OR p_payload ? 'niveau_max' THEN
          (jeupharma.v2__clean_plage(
            coalesce((p_payload->>'niveau_min')::int, niveau_min),
            coalesce((p_payload->>'niveau_max')::int, niveau_max)
          ))[2]
        ELSE niveau_max
      END,
      contenu_maj_at = CASE
        WHEN coalesce((p_payload->>'publie')::boolean, false)
          OR p_payload->>'statut' = 'publie'
          OR p_payload ? 'titre' OR p_payload ? 'resume'
          THEN now()
        ELSE contenu_maj_at
      END,
      updated_at = now()
    WHERE id = v_id
    RETURNING * INTO row;
    IF NOT FOUND THEN RAISE EXCEPTION 'Module introuvable'; END IF;
  END IF;

  IF row.prerequis_module_id IS NOT NULL AND row.prerequis_module_id = row.id THEN
    RAISE EXCEPTION 'Un module ne peut pas être son propre prérequis';
  END IF;
  IF row.id = ANY (coalesce(row.prerequis_module_ids, ARRAY[]::uuid[])) THEN
    RAISE EXCEPTION 'Un module ne peut pas être son propre prérequis';
  END IF;
  IF row.module_suivant_id IS NOT NULL AND row.module_suivant_id = row.id THEN
    RAISE EXCEPTION 'La leçon suivante ne peut pas être elle-même';
  END IF;

  RETURN to_jsonb(row);
END;
$$;

-- ---------------------------------------------------------------------------
-- Progression : exposer module_suivant_id + prerequis_module_ids
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION jeupharma.v2_progression_parcours(p_parcours uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
DECLARE
  uid uuid := auth.uid();
  v_parcours uuid;
  pa jeupharma.parcours_apprentissage%ROWTYPE;
  v_niv int;
BEGIN
  IF uid IS NULL OR NOT jeupharma.has_jeupharma_access() THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;
  v_parcours := COALESCE(p_parcours, jeupharma.v2_parcours_actif(uid));
  IF v_parcours IS NULL THEN
    RETURN jsonb_build_object('parcours_id', null, 'modules', '[]'::jsonb);
  END IF;
  SELECT * INTO pa FROM jeupharma.parcours_apprentissage WHERE id = v_parcours;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('parcours_id', null, 'modules', '[]'::jsonb);
  END IF;

  IF NOT jeupharma.is_portail_admin() AND NOT EXISTS (
    SELECT 1 FROM jeupharma.inscriptions_parcours i
    WHERE i.user_id = uid AND i.parcours_id = v_parcours AND i.statut = 'accepte' AND i.actif
  ) THEN
    RETURN jsonb_build_object('parcours_id', v_parcours, 'modules', '[]'::jsonb);
  END IF;

  v_niv := jeupharma.v2__niveau_inscrit(uid, v_parcours);
  PERFORM jeupharma.v2__sync_progression(uid, v_parcours);

  RETURN jsonb_build_object(
    'parcours_id', v_parcours,
    'niveau_parcours', NULLIF(v_niv, 0),
    'parcours', jsonb_build_object(
      'id', pa.id, 'code', pa.code, 'libelle', pa.libelle,
      'description', pa.description, 'mode_contenu', pa.mode_contenu
    ) || coalesce(jeupharma.v2_parcours_detail(uid, v_parcours), '{}'::jsonb),
    'modules', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', m.id,
          'code', m.code,
          'titre', m.titre,
          'resume', m.resume,
          'objectifs', m.objectifs,
          'ordre', m.ordre,
          'publie', m.publie,
          'est_groupe', m.est_groupe,
          'parent_id', m.parent_id,
          'niveau_min', m.niveau_min,
          'niveau_max', m.niveau_max,
          'maj_at', coalesce(m.contenu_maj_at, m.updated_at),
          'criteres', m.criteres_json,
          'prerequis_module_id', m.prerequis_module_id,
          'prerequis_module_ids', to_jsonb(coalesce(m.prerequis_module_ids, ARRAY[]::uuid[])),
          'module_suivant_id', m.module_suivant_id,
          'detail', det.d,
          'valide', coalesce((det.d->>'valide')::boolean, false),
          'pct', coalesce((det.d->>'pct')::numeric, 0),
          'verrouille', bp.b IS NOT NULL,
          'bloque_par', bp.b,
          'statut', CASE
            WHEN m.est_groupe THEN 'groupe'
            WHEN bp.b IS NOT NULL THEN 'verrouille'
            WHEN coalesce((det.d->>'valide')::boolean, false) THEN 'termine'
            ELSE 'debloque'
          END
        )
        ORDER BY m.ordre
      )
      FROM jeupharma.modules_cours m
      CROSS JOIN LATERAL (SELECT jeupharma.v2_module_detail(uid, m.id) AS d) det
      CROSS JOIN LATERAL (SELECT jeupharma.v2_module_bloque_par(uid, m.id) AS b) bp
      WHERE m.parcours_id = v_parcours
        AND m.publie
        AND (
          jeupharma.is_portail_admin()
          OR v_niv < 1
          OR jeupharma.v2__module_dans_niveau(m.id, v_niv)
        )
    ), '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION jeupharma.v2_module_bloque_par(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION jeupharma.v2_progression_parcours(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION jeupharma.v2_upsert_module(jsonb) TO authenticated;
