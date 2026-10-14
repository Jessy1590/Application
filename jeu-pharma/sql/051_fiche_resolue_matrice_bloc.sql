-- 051 : v2_fiche_resolue — accès + contenu matrice référentiel via bloc molecule
-- Projet : kpjflntnotftpzffjbud
--
-- Problème :
--   Un bloc molecule avec matrice_ids (ex. Sels ferreux) affichait le carrousel,
--   mais v2_fiche_resolue exigeait des publications_connaissances → fiche vide
--   ou partielle (pubs cours/RCP), alors que l’admin veut la fiche matrice.
--
-- Fix :
--   1) Autoriser si la matrice est liée à un bloc molecule d’une leçon accessible
--      (ou aperçu admin module_ids), pas seulement via pubs.
--   2) Si accès via bloc : construire la fiche depuis v_medicaments_complet
--      (référentiel). Sinon (catalogue / pubs seules) : comportement pubs inchangé.
--   3) Joueur : uniquement blocs visible=true + payload publié.
--      Admin + module_ids : inclut brouillon (_brouillon.payload).

-- ---------------------------------------------------------------------------
-- Extraire les UUID matrices d’un payload molecule (matrice_ids[] | matrice_id)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION jeupharma.v2__matrice_ids_from_payload(
  p_payload jsonb,
  p_include_brouillon boolean DEFAULT false
)
RETURNS uuid[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'jeupharma', 'pg_temp'
AS $$
DECLARE
  src jsonb;
  ids uuid[] := ARRAY[]::uuid[];
  elem text;
BEGIN
  src := coalesce(p_payload, '{}'::jsonb);
  IF p_include_brouillon AND src ? '_brouillon' THEN
    src := (src - '_brouillon')
      || coalesce(src->'_brouillon'->'payload', '{}'::jsonb);
  ELSE
    src := src - '_brouillon';
  END IF;

  IF jsonb_typeof(src->'matrice_ids') = 'array' THEN
    FOR elem IN SELECT jsonb_array_elements_text(src->'matrice_ids')
    LOOP
      IF elem IS NOT NULL AND elem <> '' THEN
        BEGIN
          ids := array_append(ids, elem::uuid);
        EXCEPTION WHEN invalid_text_representation THEN
          NULL;
        END;
      END IF;
    END LOOP;
  ELSIF nullif(src->>'matrice_id', '') IS NOT NULL THEN
    BEGIN
      ids := ARRAY[(src->>'matrice_id')::uuid];
    EXCEPTION WHEN invalid_text_representation THEN
      ids := ARRAY[]::uuid[];
    END;
  END IF;

  RETURN ids;
END;
$$;

REVOKE ALL ON FUNCTION jeupharma.v2__matrice_ids_from_payload(jsonb, boolean) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- La matrice est-elle liée à un bloc molecule d’une leçon dans le scope ?
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION jeupharma.v2__matrice_liee_bloc(
  p_user uuid,
  p_matrice_id uuid,
  p_parcours uuid DEFAULT NULL,
  p_module_ids uuid[] DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
DECLARE
  is_admin boolean := jeupharma.is_portail_admin();
BEGIN
  IF p_user IS NULL OR p_matrice_id IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    WITH parcours_scope AS (
      SELECT i.parcours_id, i.niveau_parcours
      FROM jeupharma.inscriptions_parcours i
      JOIN jeupharma.parcours_apprentissage pa ON pa.id = i.parcours_id AND pa.actif
      WHERE i.user_id = p_user
        AND i.statut = 'accepte'
        AND i.actif
        AND (p_parcours IS NULL OR i.parcours_id = p_parcours)
    ),
    unlocked AS (
      SELECT d.module_id
      FROM parcours_scope ps
      CROSS JOIN LATERAL jeupharma.v2_modules_debloques(p_user, ps.parcours_id) d
      WHERE p_module_ids IS NULL OR d.module_id = ANY (p_module_ids)
    ),
    admin_requested AS (
      SELECT m.id AS module_id
      FROM jeupharma.modules_cours m
      WHERE is_admin
        AND p_module_ids IS NOT NULL
        AND cardinality(p_module_ids) > 0
        AND m.id = ANY (p_module_ids)
        AND (p_parcours IS NULL OR m.parcours_id = p_parcours)
    ),
    scope AS (
      SELECT DISTINCT s.module_id
      FROM (
        SELECT module_id FROM unlocked
        UNION
        SELECT module_id FROM admin_requested
      ) u
      CROSS JOIN LATERAL jeupharma.v2_module_ancetres(u.module_id) s
    )
    SELECT 1
    FROM jeupharma.module_blocs b
    JOIN scope sc ON sc.module_id = b.module_id
    WHERE b.type_bloc = 'molecule'
      AND (is_admin OR b.visible)
      AND p_matrice_id = ANY (
        jeupharma.v2__matrice_ids_from_payload(b.payload_json, is_admin)
      )
  );
END;
$$;

REVOKE ALL ON FUNCTION jeupharma.v2__matrice_liee_bloc(uuid, uuid, uuid, uuid[]) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- Fiche référentiel (même forme que v2_fiche_resolue : base + champs{})
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION jeupharma.v2__items_depuis_jsonb(p_arr jsonb)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'jeupharma', 'pg_temp'
AS $$
  SELECT CASE
    WHEN p_arr IS NULL OR jsonb_typeof(p_arr) <> 'array' OR jsonb_array_length(p_arr) = 0 THEN NULL
    ELSE (
      SELECT jsonb_agg(jsonb_build_object(
        'entite_id', (e->>'id')::uuid,
        'valeur', e->>'valeur',
        'ordre', coalesce((e->>'ordre')::int, 0)
      ) ORDER BY coalesce((e->>'ordre')::int, 0), e->>'valeur')
      FROM jsonb_array_elements(p_arr) e
      WHERE nullif(e->>'valeur', '') IS NOT NULL
    )
  END;
$$;

REVOKE ALL ON FUNCTION jeupharma.v2__items_depuis_jsonb(jsonb) FROM PUBLIC;

CREATE OR REPLACE FUNCTION jeupharma.v2__fiche_depuis_matrice(p_matrice_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'jeupharma', 'pg_temp'
AS $$
DECLARE
  v jeupharma.v_medicaments_complet%ROWTYPE;
  base jsonb;
  champs jsonb := '{}'::jsonb;
  items jsonb;
BEGIN
  SELECT * INTO v
  FROM jeupharma.v_medicaments_complet
  WHERE id = p_matrice_id AND statut = 'publie';

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  base := jsonb_build_object(
    'id', v.id,
    'dci', v.dci,
    'noms_commerciaux', coalesce(v.noms_commerciaux, '[]'::jsonb),
    'source', 'matrice'
  );

  items := jeupharma.v2__items_depuis_jsonb(v.secteur_therapeutique);
  IF items IS NOT NULL THEN champs := champs || jsonb_build_object('secteur_therapeutique', items); END IF;
  items := jeupharma.v2__items_depuis_jsonb(v.classe_therapeutique);
  IF items IS NOT NULL THEN champs := champs || jsonb_build_object('classe_therapeutique', items); END IF;
  items := jeupharma.v2__items_depuis_jsonb(v.classe_pharmacologique);
  IF items IS NOT NULL THEN champs := champs || jsonb_build_object('classe_pharmacologique', items); END IF;
  items := jeupharma.v2__items_depuis_jsonb(v.indications);
  IF items IS NOT NULL THEN champs := champs || jsonb_build_object('indications', items); END IF;
  items := jeupharma.v2__items_depuis_jsonb(v.contre_indications);
  IF items IS NOT NULL THEN champs := champs || jsonb_build_object('contre_indications', items); END IF;
  items := jeupharma.v2__items_depuis_jsonb(v.effets_indesirables);
  IF items IS NOT NULL THEN champs := champs || jsonb_build_object('effets_indesirables', items); END IF;
  items := jeupharma.v2__items_depuis_jsonb(v.precautions_emploi);
  IF items IS NOT NULL THEN champs := champs || jsonb_build_object('precautions_emploi', items); END IF;
  items := jeupharma.v2__items_depuis_jsonb(v.interactions);
  IF items IS NOT NULL THEN champs := champs || jsonb_build_object('interactions', items); END IF;
  items := jeupharma.v2__items_depuis_jsonb(v.surveillances);
  IF items IS NOT NULL THEN champs := champs || jsonb_build_object('surveillances', items); END IF;
  items := jeupharma.v2__items_depuis_jsonb(v.voies_administration);
  IF items IS NOT NULL THEN champs := champs || jsonb_build_object('voies_administration', items); END IF;
  items := jeupharma.v2__items_depuis_jsonb(v.conditions_prescription_delivrance);
  IF items IS NOT NULL THEN champs := champs || jsonb_build_object('conditions_prescription_delivrance', items); END IF;
  items := jeupharma.v2__items_depuis_jsonb(v.conseils_delivrance);
  IF items IS NOT NULL THEN champs := champs || jsonb_build_object('conseils_delivrance', items); END IF;

  IF v.detail_pharmacologie IS NOT NULL AND v.detail_pharmacologie_id IS NOT NULL THEN
    champs := champs || jsonb_build_object('detail_pharmacologie', jsonb_build_array(
      jsonb_build_object('entite_id', v.detail_pharmacologie_id, 'valeur', v.detail_pharmacologie, 'ordre', 0)
    ));
  END IF;
  IF v.posologie_generale IS NOT NULL AND v.posologie_generale_id IS NOT NULL THEN
    champs := champs || jsonb_build_object('posologie_generale', jsonb_build_array(
      jsonb_build_object('entite_id', v.posologie_generale_id, 'valeur', v.posologie_generale, 'ordre', 0)
    ));
  END IF;
  IF v.grossesse_allaitement IS NOT NULL AND v.grossesse_allaitement_id IS NOT NULL THEN
    champs := champs || jsonb_build_object('grossesse_allaitement', jsonb_build_array(
      jsonb_build_object('entite_id', v.grossesse_allaitement_id, 'valeur', v.grossesse_allaitement, 'ordre', 0)
    ));
  END IF;

  RETURN base || jsonb_build_object('champs', champs);
END;
$$;

REVOKE ALL ON FUNCTION jeupharma.v2__fiche_depuis_matrice(uuid) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- v2_fiche_resolue : priorité matrice si liée au bloc ; sinon pubs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION jeupharma.v2_fiche_resolue(
  p_matrice_id uuid,
  p_parcours uuid DEFAULT NULL,
  p_module_ids uuid[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
DECLARE
  uid uuid := auth.uid();
  via_bloc boolean;
  via_pubs boolean;
  base jsonb;
  champs jsonb;
  fiche jsonb;
BEGIN
  IF uid IS NULL OR NOT jeupharma.has_jeupharma_access() THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  via_bloc := jeupharma.v2__matrice_liee_bloc(uid, p_matrice_id, p_parcours, p_module_ids);
  via_pubs := EXISTS (
    SELECT 1 FROM jeupharma.v2_connaissances_visibles(uid, p_parcours, p_module_ids) cv
    WHERE cv.matrice_id = p_matrice_id
  );

  IF NOT via_bloc AND NOT via_pubs THEN
    RETURN NULL;
  END IF;

  -- Leçon / carrousel : fiche référentiel complète
  IF via_bloc THEN
    fiche := jeupharma.v2__fiche_depuis_matrice(p_matrice_id);
    RETURN fiche;
  END IF;

  -- Catalogue / pubs seules
  SELECT jsonb_build_object(
    'id', m.id,
    'dci', d.valeur,
    'noms_commerciaux', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', n.id, 'valeur', n.valeur) ORDER BY mn.ordre)
      FROM jeupharma.matrice_noms_commerciaux mn
      JOIN jeupharma.noms_commerciaux n ON n.id = mn.nom_commercial_id AND n.actif
      WHERE mn.matrice_id = m.id
    ), '[]'::jsonb),
    'source', 'publications'
  )
  INTO base
  FROM jeupharma.matrice_medicaments m
  JOIN jeupharma.dcis d ON d.id = m.dci_id
  WHERE m.id = p_matrice_id AND m.statut = 'publie';

  IF base IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_object_agg(champ_code, items)
  INTO champs
  FROM (
    SELECT cv.champ_code,
           jsonb_agg(
             jsonb_build_object(
               'connaissance_id', cv.connaissance_id,
               'entite_id', cv.entite_id,
               'valeur', cv.texte,
               'ordre', cv.ordre,
               'module_id', cv.module_id
             )
             ORDER BY cv.ordre, cv.texte
           ) AS items
    FROM jeupharma.v2_connaissances_visibles(uid, p_parcours, p_module_ids) cv
    WHERE cv.matrice_id = p_matrice_id
    GROUP BY cv.champ_code
  ) t;

  RETURN base || jsonb_build_object('champs', COALESCE(champs, '{}'::jsonb));
END;
$$;

GRANT EXECUTE ON FUNCTION jeupharma.v2_fiche_resolue(uuid, uuid, uuid[]) TO authenticated;
