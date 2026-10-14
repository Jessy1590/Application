-- 053 : v2_lister_connaissances_matrice = contenu RÉFÉRENTIEL actuel (vue matrice),
-- avec sync/création des connaissances liées aux entités (plus les vieux textes RCP).

CREATE OR REPLACE FUNCTION jeupharma.v2_lister_connaissances_matrice(
  p_matrice_id uuid,
  p_module_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
DECLARE
  v jeupharma.v_medicaments_complet%ROWTYPE;
  src jsonb := '[]'::jsonb;
  outj jsonb := '[]'::jsonb;
  r record;
  cid uuid;
BEGIN
  IF NOT jeupharma.is_portail_admin() THEN
    RAISE EXCEPTION 'Réservé admin portail';
  END IF;
  IF p_matrice_id IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT * INTO v FROM jeupharma.v_medicaments_complet WHERE id = p_matrice_id;
  IF NOT FOUND THEN
    RETURN '[]'::jsonb;
  END IF;

  -- Construire la liste des valeurs référentiel (entite_id + texte)
  IF v.dci_id IS NOT NULL AND coalesce(v.dci, '') <> '' THEN
    src := src || jsonb_build_array(jsonb_build_object(
      'champ_code', 'dci', 'entite_id', v.dci_id, 'texte', v.dci, 'ordre', 0
    ));
  END IF;

  src := src || coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'champ_code', 'nom_commercial',
      'entite_id', (e->>'id')::uuid,
      'texte', e->>'valeur',
      'ordre', coalesce((e->>'ordre')::int, 0)
    ) ORDER BY coalesce((e->>'ordre')::int, 0), e->>'valeur')
    FROM jsonb_array_elements(coalesce(v.noms_commerciaux, '[]'::jsonb)) e
    WHERE coalesce(e->>'valeur', '') <> '' AND e->>'id' IS NOT NULL
  ), '[]'::jsonb);

  src := src || coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'champ_code', x.code,
      'entite_id', (e->>'id')::uuid,
      'texte', e->>'valeur',
      'ordre', coalesce((e->>'ordre')::int, 0)
    ) ORDER BY x.code, coalesce((e->>'ordre')::int, 0), e->>'valeur')
    FROM (VALUES
      ('secteur_therapeutique', v.secteur_therapeutique),
      ('classe_therapeutique', v.classe_therapeutique),
      ('classe_pharmacologique', v.classe_pharmacologique),
      ('indications', v.indications),
      ('contre_indications', v.contre_indications),
      ('effets_indesirables', v.effets_indesirables),
      ('precautions_emploi', v.precautions_emploi),
      ('interactions', v.interactions),
      ('surveillances', v.surveillances),
      ('voies_administration', v.voies_administration),
      ('conditions_prescription_delivrance', v.conditions_prescription_delivrance),
      ('conseils_delivrance', v.conseils_delivrance)
    ) AS x(code, arr)
    CROSS JOIN LATERAL jsonb_array_elements(coalesce(x.arr, '[]'::jsonb)) e
    WHERE coalesce(e->>'valeur', '') <> '' AND e->>'id' IS NOT NULL
  ), '[]'::jsonb);

  IF v.detail_pharmacologie_id IS NOT NULL AND coalesce(v.detail_pharmacologie, '') <> '' THEN
    src := src || jsonb_build_array(jsonb_build_object(
      'champ_code', 'detail_pharmacologie',
      'entite_id', v.detail_pharmacologie_id,
      'texte', v.detail_pharmacologie,
      'ordre', 0
    ));
  END IF;
  IF v.posologie_generale_id IS NOT NULL AND coalesce(v.posologie_generale, '') <> '' THEN
    src := src || jsonb_build_array(jsonb_build_object(
      'champ_code', 'posologie_generale',
      'entite_id', v.posologie_generale_id,
      'texte', v.posologie_generale,
      'ordre', 0
    ));
  END IF;
  IF v.grossesse_allaitement_id IS NOT NULL AND coalesce(v.grossesse_allaitement, '') <> '' THEN
    src := src || jsonb_build_array(jsonb_build_object(
      'champ_code', 'grossesse_allaitement',
      'entite_id', v.grossesse_allaitement_id,
      'texte', v.grossesse_allaitement,
      'ordre', 0
    ));
  END IF;

  FOR r IN
    SELECT
      e->>'champ_code' AS champ_code,
      (e->>'entite_id')::uuid AS entite_id,
      e->>'texte' AS texte,
      coalesce((e->>'ordre')::int, 0) AS ordre
    FROM jsonb_array_elements(src) e
  LOOP
    SELECT c.id INTO cid
    FROM jeupharma.connaissances c
    WHERE c.matrice_id = p_matrice_id
      AND c.champ_code = r.champ_code
      AND c.entite_id = r.entite_id
      AND c.statut = 'valide'
    ORDER BY c.updated_at DESC NULLS LAST
    LIMIT 1;

    IF cid IS NULL THEN
      INSERT INTO jeupharma.connaissances (
        matrice_id, champ_code, entite_id, texte, texte_norm, statut, ordre
      ) VALUES (
        p_matrice_id, r.champ_code, r.entite_id, r.texte,
        jeupharma.normaliser_valeur(r.texte), 'valide', r.ordre
      ) RETURNING id INTO cid;
    ELSE
      UPDATE jeupharma.connaissances
      SET texte = r.texte,
          texte_norm = jeupharma.normaliser_valeur(r.texte),
          ordre = r.ordre,
          updated_at = now()
      WHERE id = cid
        AND (texte IS DISTINCT FROM r.texte OR ordre IS DISTINCT FROM r.ordre);
    END IF;

    outj := outj || jsonb_build_array(jsonb_build_object(
      'connaissance_id', cid,
      'champ_code', r.champ_code,
      'texte', r.texte,
      'entite_id', r.entite_id,
      'ordre', r.ordre,
      'publie', EXISTS (
        SELECT 1 FROM jeupharma.publications_connaissances pc
        WHERE pc.module_id = p_module_id
          AND pc.connaissance_id = cid
          AND pc.actif
      )
    ));
  END LOOP;

  RETURN outj;
END;
$$;

GRANT EXECUTE ON FUNCTION jeupharma.v2_lister_connaissances_matrice(uuid, uuid) TO authenticated;
