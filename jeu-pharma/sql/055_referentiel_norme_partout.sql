-- 055 : le RÉFÉRENTIEL (matrice) est la seule norme de texte partout.
-- Le parcours / publications_connaissances = masque afficher|masquer (entite_id), rien d’autre.
-- - v2__valeur_referentiel : libellé courant depuis v_medicaments_complet
-- - v2_connaissances_visibles : renvoie ce libellé (plus c.texte figé)
-- - v2_fiche_resolue : toujours v2__fiche_depuis_matrice, filtrée par entités publiées
-- - purge : retire les connaissances valide hors entités liées à la fiche actuelle

-- ---------------------------------------------------------------------------
-- Valeur référentiel pour (matrice, champ, entite)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION jeupharma.v2__valeur_referentiel(
  p_matrice_id uuid,
  p_champ_code text,
  p_entite_id uuid
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'jeupharma', 'pg_temp'
AS $$
DECLARE
  v jeupharma.v_medicaments_complet%ROWTYPE;
  arr jsonb;
  out_txt text;
BEGIN
  IF p_matrice_id IS NULL OR p_champ_code IS NULL OR p_entite_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v FROM jeupharma.v_medicaments_complet WHERE id = p_matrice_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF p_champ_code = 'dci' AND v.dci_id IS NOT DISTINCT FROM p_entite_id THEN
    RETURN nullif(v.dci, '');
  END IF;
  IF p_champ_code = 'detail_pharmacologie' AND v.detail_pharmacologie_id IS NOT DISTINCT FROM p_entite_id THEN
    RETURN nullif(v.detail_pharmacologie, '');
  END IF;
  IF p_champ_code = 'posologie_generale' AND v.posologie_generale_id IS NOT DISTINCT FROM p_entite_id THEN
    RETURN nullif(v.posologie_generale, '');
  END IF;
  IF p_champ_code = 'grossesse_allaitement' AND v.grossesse_allaitement_id IS NOT DISTINCT FROM p_entite_id THEN
    RETURN nullif(v.grossesse_allaitement, '');
  END IF;

  arr := CASE p_champ_code
    WHEN 'nom_commercial' THEN v.noms_commerciaux
    WHEN 'secteur_therapeutique' THEN v.secteur_therapeutique
    WHEN 'classe_therapeutique' THEN v.classe_therapeutique
    WHEN 'classe_pharmacologique' THEN v.classe_pharmacologique
    WHEN 'indications' THEN v.indications
    WHEN 'contre_indications' THEN v.contre_indications
    WHEN 'effets_indesirables' THEN v.effets_indesirables
    WHEN 'precautions_emploi' THEN v.precautions_emploi
    WHEN 'interactions' THEN v.interactions
    WHEN 'surveillances' THEN v.surveillances
    WHEN 'voies_administration' THEN v.voies_administration
    WHEN 'conditions_prescription_delivrance' THEN v.conditions_prescription_delivrance
    WHEN 'conseils_delivrance' THEN v.conseils_delivrance
    ELSE NULL
  END;

  IF arr IS NULL OR jsonb_typeof(arr) <> 'array' THEN
    RETURN NULL;
  END IF;

  SELECT nullif(e->>'valeur', '')
  INTO out_txt
  FROM jsonb_array_elements(arr) e
  WHERE (e->>'id')::uuid = p_entite_id
  LIMIT 1;

  RETURN out_txt;
END;
$$;

REVOKE ALL ON FUNCTION jeupharma.v2__valeur_referentiel(uuid, text, uuid) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- Filtre champs fiche : ne garder que les entite_id publiées (masque parcours)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION jeupharma.v2__filtrer_champs_publies(
  p_champs jsonb,
  p_entite_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'jeupharma', 'pg_temp'
AS $$
DECLARE
  code text;
  items jsonb;
  filtered jsonb;
  outj jsonb := '{}'::jsonb;
BEGIN
  IF p_champs IS NULL OR jsonb_typeof(p_champs) <> 'object' THEN
    RETURN '{}'::jsonb;
  END IF;
  IF p_entite_ids IS NULL OR cardinality(p_entite_ids) = 0 THEN
    RETURN '{}'::jsonb;
  END IF;

  FOR code, items IN SELECT key, value FROM jsonb_each(p_champs)
  LOOP
    SELECT jsonb_agg(e ORDER BY coalesce((e->>'ordre')::int, 0), e->>'valeur')
    INTO filtered
    FROM jsonb_array_elements(items) e
    WHERE (e->>'entite_id')::uuid = ANY (p_entite_ids);

    IF filtered IS NOT NULL AND jsonb_array_length(filtered) > 0 THEN
      outj := outj || jsonb_build_object(code, filtered);
    END IF;
  END LOOP;

  RETURN outj;
END;
$$;

REVOKE ALL ON FUNCTION jeupharma.v2__filtrer_champs_publies(jsonb, uuid[]) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- Visibles : texte = référentiel actuel (plus le texte figé connaissances)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION jeupharma.v2_connaissances_visibles(
  p_user uuid DEFAULT auth.uid(),
  p_parcours uuid DEFAULT NULL,
  p_module_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (
  connaissance_id uuid,
  matrice_id uuid,
  champ_code text,
  entite_id uuid,
  texte text,
  texte_norm text,
  ordre int,
  module_id uuid,
  libelle_pedagogique text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
BEGIN
  IF p_user IS NULL THEN
    RETURN;
  END IF;
  IF NOT jeupharma.has_jeupharma_access() AND NOT jeupharma.is_portail_admin() THEN
    RETURN;
  END IF;

  RETURN QUERY
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
    SELECT d.module_id AS mid, ps.niveau_parcours
    FROM parcours_scope ps
    CROSS JOIN LATERAL jeupharma.v2_modules_debloques(p_user, ps.parcours_id) d
    WHERE p_module_ids IS NULL OR d.module_id = ANY (p_module_ids)
  ),
  admin_requested AS (
    SELECT m.id AS mid,
           COALESCE(
             (
               SELECT i.niveau_parcours
               FROM jeupharma.inscriptions_parcours i
               WHERE i.user_id = p_user
                 AND i.parcours_id = m.parcours_id
                 AND i.statut = 'accepte'
                 AND i.actif
               LIMIT 1
             ),
             1
           ) AS niveau_parcours
    FROM jeupharma.modules_cours m
    WHERE jeupharma.is_portail_admin()
      AND p_module_ids IS NOT NULL
      AND cardinality(p_module_ids) > 0
      AND m.id = ANY (p_module_ids)
      AND (p_parcours IS NULL OR m.parcours_id = p_parcours)
  ),
  combined AS (
    SELECT u.mid, u.niveau_parcours FROM unlocked u
    UNION
    SELECT a.mid, a.niveau_parcours FROM admin_requested a
  ),
  scope AS (
    SELECT DISTINCT s.module_id AS mid, c.niveau_parcours
    FROM combined c
    CROSS JOIN LATERAL jeupharma.v2_module_ancetres(c.mid) s
  ),
  raw AS (
    SELECT
      c.id AS cid,
      c.matrice_id AS mid_mat,
      c.champ_code AS code,
      c.entite_id AS eid,
      jeupharma.v2__valeur_referentiel(c.matrice_id, c.champ_code, c.entite_id) AS val_ref,
      c.texte_norm AS tnorm,
      pub.ordre AS ord,
      pub.module_id AS mid_pub,
      pub.libelle_pedagogique AS lib_ped
    FROM jeupharma.publications_connaissances pub
    JOIN scope sc ON sc.mid = pub.module_id
    JOIN jeupharma.connaissances c ON c.id = pub.connaissance_id AND c.statut = 'valide'
    JOIN jeupharma.matrice_medicaments m ON m.id = c.matrice_id AND m.statut = 'publie'
    WHERE pub.actif
      AND c.entite_id IS NOT NULL
      AND jeupharma.v2__dans_plage(sc.niveau_parcours, pub.niveau_min, pub.niveau_max)
  )
  SELECT
    r.cid,
    r.mid_mat,
    r.code,
    r.eid,
    r.val_ref AS texte,
    r.tnorm,
    r.ord,
    r.mid_pub,
    r.lib_ped
  FROM raw r
  WHERE r.val_ref IS NOT NULL
  ORDER BY r.mid_mat, r.code, r.ord;
END;
$$;

GRANT EXECUTE ON FUNCTION jeupharma.v2_connaissances_visibles(uuid, uuid, uuid[]) TO authenticated;

-- ---------------------------------------------------------------------------
-- Fiche résolue : TOUJOURS matrice ; pubs = masque entite_id uniquement
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
  fiche jsonb;
  pub_ids uuid[];
  champs jsonb;
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

  fiche := jeupharma.v2__fiche_depuis_matrice(p_matrice_id);
  IF fiche IS NULL THEN
    RETURN NULL;
  END IF;

  -- Masque parcours : uniquement les entités cochées (pubs). Pas de texte hors référentiel.
  SELECT coalesce(array_agg(DISTINCT cv.entite_id), ARRAY[]::uuid[])
  INTO pub_ids
  FROM jeupharma.v2_connaissances_visibles(uid, p_parcours, p_module_ids) cv
  WHERE cv.matrice_id = p_matrice_id
    AND cv.entite_id IS NOT NULL;

  champs := jeupharma.v2__filtrer_champs_publies(fiche->'champs', pub_ids);

  RETURN (fiche - 'champs')
    || jsonb_build_object(
      'champs', champs,
      'source', 'matrice'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION jeupharma.v2_fiche_resolue(uuid, uuid, uuid[]) TO authenticated;

-- ---------------------------------------------------------------------------
-- Purge : connaissances valide dont l’entité n’est plus sur la fiche référentiel
-- ---------------------------------------------------------------------------
UPDATE jeupharma.connaissances c
SET statut = 'retire',
    updated_at = now()
WHERE c.statut = 'valide'
  AND c.matrice_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM jeupharma.matrice_medicaments m
    WHERE m.id = c.matrice_id AND m.statut IN ('publie', 'brouillon', 'archive')
  )
  AND (
    c.entite_id IS NULL
    OR jeupharma.v2__valeur_referentiel(c.matrice_id, c.champ_code, c.entite_id) IS NULL
  );
