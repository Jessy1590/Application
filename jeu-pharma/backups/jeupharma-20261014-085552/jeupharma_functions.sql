-- Backup jeupharma functions
CREATE OR REPLACE FUNCTION jeupharma._distracteurs_champ(p_champ text, p_exclure_id uuid, p_secteur_id uuid, p_niveau text, p_limit integer)
 RETURNS TABLE(entite_id uuid, valeur text)
 LANGUAGE plpgsql
 STABLE
AS $function$
BEGIN
  RETURN QUERY
  WITH candidats AS (
    SELECT v.entite_id, v.valeur, 1 AS prio
    FROM jeupharma.matrice_medicaments m
    CROSS JOIN LATERAL jeupharma._valeur_champ_matrice(m.id, p_champ, p_niveau) v
    WHERE m.statut = 'publie'
      AND (p_secteur_id IS NULL OR m.secteur_therapeutique_id = p_secteur_id)
      AND v.entite_id IS DISTINCT FROM p_exclure_id
    UNION ALL
    SELECT v.entite_id, v.valeur, 2 AS prio
    FROM jeupharma.matrice_medicaments m
    CROSS JOIN LATERAL jeupharma._valeur_champ_matrice(m.id, p_champ, p_niveau) v
    WHERE m.statut = 'publie'
      AND p_secteur_id IS NOT NULL
      AND m.secteur_therapeutique_id IS DISTINCT FROM p_secteur_id
      AND v.entite_id IS DISTINCT FROM p_exclure_id
  ),
  distincts AS (
    SELECT DISTINCT ON (c.entite_id) c.entite_id, c.valeur, c.prio
    FROM candidats c
    ORDER BY c.entite_id, c.prio
  )
  SELECT d.entite_id, d.valeur
  FROM distincts d
  ORDER BY d.prio, random()
  LIMIT greatest(p_limit, 0);
END;
$function$
;

CREATE OR REPLACE FUNCTION jeupharma._libelle_champ(p_champ text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT CASE p_champ
    WHEN 'nom_commercial' THEN 'nom commercial'
    WHEN 'dci' THEN 'DCI'
    WHEN 'secteur_therapeutique' THEN 'secteur therapeutique'
    WHEN 'classe_therapeutique' THEN 'classe therapeutique'
    WHEN 'classe_pharmacologique' THEN 'classe pharmacologique'
    WHEN 'detail_pharmacologie' THEN 'detail pharmacologie'
    WHEN 'posologie_generale' THEN 'posologie generale'
    WHEN 'grossesse_allaitement' THEN 'precautions grossesse & allaitement'
    WHEN 'indications' THEN 'indication'
    WHEN 'contre_indications' THEN 'contre-indication'
    WHEN 'effets_indesirables' THEN 'effet indesirable'
    WHEN 'precautions_emploi' THEN 'precaution d''emploi'
    WHEN 'interactions' THEN 'interaction'
    WHEN 'surveillances' THEN 'surveillance'
    WHEN 'voies_administration' THEN 'voie d''administration'
    ELSE p_champ
  END;
$function$
;

CREATE OR REPLACE FUNCTION jeupharma._matrice_disponible_niveau(p_matrice_id uuid, p_niveau text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'jeupharma', 'pg_temp'
AS $function$
  SELECT p_niveau IS NULL OR EXISTS (
    SELECT 1 FROM jeupharma.matrice_medicaments m
    WHERE m.id=p_matrice_id
      AND (p_niveau='pharmacien' OR (m.hospitalier IS NOT TRUE AND m.complexe IS NOT TRUE))
      AND (NOT EXISTS (SELECT 1 FROM jeupharma.matrice_secteurs_therapeutiques j WHERE j.matrice_id=m.id) OR EXISTS (SELECT 1 FROM jeupharma.matrice_secteurs_therapeutiques j JOIN jeupharma.niveau_secteurs_therapeutiques n ON n.secteur_therapeutique_id=j.secteur_therapeutique_id AND n.niveau_id=p_niveau WHERE j.matrice_id=m.id))
      AND (NOT EXISTS (SELECT 1 FROM jeupharma.matrice_classes_therapeutiques j WHERE j.matrice_id=m.id) OR EXISTS (SELECT 1 FROM jeupharma.matrice_classes_therapeutiques j JOIN jeupharma.niveau_classes_therapeutiques n ON n.classe_therapeutique_id=j.classe_therapeutique_id AND n.niveau_id=p_niveau WHERE j.matrice_id=m.id))
      AND (NOT EXISTS (SELECT 1 FROM jeupharma.matrice_classes_pharmacologiques j WHERE j.matrice_id=m.id) OR EXISTS (SELECT 1 FROM jeupharma.matrice_classes_pharmacologiques j JOIN jeupharma.niveau_classes_pharmacologiques n ON n.classe_pharmacologique_id=j.classe_pharmacologique_id AND n.niveau_id=p_niveau WHERE j.matrice_id=m.id))
  )
$function$
;

CREATE OR REPLACE FUNCTION jeupharma._niveau_champ_actif(p_niveau text, p_champ text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'jeupharma', 'pg_temp'
AS $function$ SELECT p_niveau IS NULL OR EXISTS(SELECT 1 FROM jeupharma.niveau_champs WHERE niveau_id=p_niveau AND champ_code=p_champ) $function$
;

CREATE OR REPLACE FUNCTION jeupharma._valeur_champ_matrice(p_matrice_id uuid, p_champ text, p_niveau text)
 RETURNS TABLE(entite_id uuid, valeur text)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'jeupharma', 'pg_temp'
AS $function$ BEGIN IF NOT jeupharma._niveau_champ_actif(p_niveau,p_champ) OR NOT jeupharma._matrice_disponible_niveau(p_matrice_id,p_niveau) THEN RETURN; END IF; CASE p_champ WHEN 'nom_commercial' THEN RETURN QUERY SELECT e.id,e.valeur FROM jeupharma.matrice_noms_commerciaux j JOIN jeupharma.noms_commerciaux e ON e.id=j.nom_commercial_id AND e.actif WHERE j.matrice_id=p_matrice_id ORDER BY random() LIMIT 1; WHEN 'dci' THEN RETURN QUERY SELECT e.id,e.valeur FROM jeupharma.matrice_medicaments m JOIN jeupharma.dcis e ON e.id=m.dci_id AND e.actif WHERE m.id=p_matrice_id; WHEN 'secteur_therapeutique' THEN RETURN QUERY SELECT e.id,e.valeur FROM jeupharma.matrice_secteurs_therapeutiques j JOIN jeupharma.secteurs_therapeutiques e ON e.id=j.secteur_therapeutique_id AND e.actif JOIN jeupharma.niveau_secteurs_therapeutiques n ON n.secteur_therapeutique_id=e.id AND n.niveau_id=p_niveau WHERE j.matrice_id=p_matrice_id ORDER BY random() LIMIT 1; WHEN 'classe_therapeutique' THEN RETURN QUERY SELECT e.id,e.valeur FROM jeupharma.matrice_classes_therapeutiques j JOIN jeupharma.classes_therapeutiques e ON e.id=j.classe_therapeutique_id AND e.actif JOIN jeupharma.niveau_classes_therapeutiques n ON n.classe_therapeutique_id=e.id AND n.niveau_id=p_niveau WHERE j.matrice_id=p_matrice_id ORDER BY random() LIMIT 1; WHEN 'classe_pharmacologique' THEN RETURN QUERY SELECT e.id,e.valeur FROM jeupharma.matrice_classes_pharmacologiques j JOIN jeupharma.classes_pharmacologiques e ON e.id=j.classe_pharmacologique_id AND e.actif JOIN jeupharma.niveau_classes_pharmacologiques n ON n.classe_pharmacologique_id=e.id AND n.niveau_id=p_niveau WHERE j.matrice_id=p_matrice_id ORDER BY random() LIMIT 1; WHEN 'detail_pharmacologie' THEN RETURN QUERY SELECT e.id,e.valeur FROM jeupharma.matrice_medicaments m JOIN jeupharma.details_pharmacologie e ON e.id=m.detail_pharmacologie_id AND e.actif WHERE m.id=p_matrice_id; WHEN 'indications' THEN RETURN QUERY SELECT e.id,e.valeur FROM jeupharma.matrice_indications j JOIN jeupharma.indications e ON e.id=j.indication_id AND e.actif WHERE j.matrice_id=p_matrice_id ORDER BY random() LIMIT 1; WHEN 'contre_indications' THEN RETURN QUERY SELECT e.id,e.valeur FROM jeupharma.matrice_contre_indications j JOIN jeupharma.contre_indications e ON e.id=j.contre_indication_id AND e.actif WHERE j.matrice_id=p_matrice_id ORDER BY random() LIMIT 1; WHEN 'effets_indesirables' THEN RETURN QUERY SELECT e.id,e.valeur FROM jeupharma.matrice_effets_indesirables j JOIN jeupharma.effets_indesirables e ON e.id=j.effet_indesirable_id AND e.actif WHERE j.matrice_id=p_matrice_id ORDER BY random() LIMIT 1; WHEN 'precautions_emploi' THEN RETURN QUERY SELECT e.id,e.valeur FROM jeupharma.matrice_precautions_emploi j JOIN jeupharma.precautions_emploi e ON e.id=j.precaution_emploi_id AND e.actif WHERE j.matrice_id=p_matrice_id ORDER BY random() LIMIT 1; WHEN 'interactions' THEN RETURN QUERY SELECT e.id,e.valeur FROM jeupharma.matrice_interactions j JOIN jeupharma.interactions e ON e.id=j.interaction_id AND e.actif WHERE j.matrice_id=p_matrice_id ORDER BY random() LIMIT 1; WHEN 'surveillances' THEN RETURN QUERY SELECT e.id,e.valeur FROM jeupharma.matrice_surveillances j JOIN jeupharma.surveillances e ON e.id=j.surveillance_id AND e.actif WHERE j.matrice_id=p_matrice_id ORDER BY random() LIMIT 1; ELSE RETURN; END CASE; END; $function$
;

CREATE OR REPLACE FUNCTION jeupharma.atc_strip_entity_codes(p_table text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'jeupharma', 'public'
AS $function$
DECLARE
  r record;
  new_val text;
  new_norm text;
  keep_id uuid;
BEGIN
  IF p_table = 'secteurs_therapeutiques' THEN
    FOR r IN SELECT id, valeur FROM jeupharma.secteurs_therapeutiques WHERE actif AND valeur ~ '^[A-Z][0-9A-Z]*\s*[-–]\s*' LOOP
      new_val := btrim(regexp_replace(r.valeur, '^[A-Z][0-9A-Z]*\s*[-–]\s*', ''));
      new_norm := jeupharma.normaliser_valeur(new_val);
      SELECT id INTO keep_id FROM jeupharma.secteurs_therapeutiques WHERE actif AND valeur_norm = new_norm AND id <> r.id LIMIT 1;
      IF keep_id IS NOT NULL THEN
        UPDATE jeupharma.matrice_medicaments SET secteur_therapeutique_id = keep_id WHERE secteur_therapeutique_id = r.id;
        UPDATE jeupharma.matrice_secteurs_therapeutiques SET secteur_therapeutique_id = keep_id WHERE secteur_therapeutique_id = r.id
          AND NOT EXISTS (SELECT 1 FROM jeupharma.matrice_secteurs_therapeutiques x WHERE x.matrice_id = matrice_secteurs_therapeutiques.matrice_id AND x.secteur_therapeutique_id = keep_id);
        DELETE FROM jeupharma.matrice_secteurs_therapeutiques WHERE secteur_therapeutique_id = r.id;
        UPDATE jeupharma.secteurs_therapeutiques SET actif = false WHERE id = r.id;
      ELSE
        UPDATE jeupharma.secteurs_therapeutiques SET valeur = new_val, valeur_norm = new_norm WHERE id = r.id;
      END IF;
    END LOOP;
  ELSIF p_table = 'classes_therapeutiques' THEN
    FOR r IN SELECT id, valeur FROM jeupharma.classes_therapeutiques WHERE actif AND valeur ~ '^[A-Z][0-9A-Z]*\s*[-–]\s*' LOOP
      new_val := btrim(regexp_replace(r.valeur, '^[A-Z][0-9A-Z]*\s*[-–]\s*', ''));
      new_norm := jeupharma.normaliser_valeur(new_val);
      SELECT id INTO keep_id FROM jeupharma.classes_therapeutiques WHERE actif AND valeur_norm = new_norm AND id <> r.id LIMIT 1;
      IF keep_id IS NOT NULL THEN
        UPDATE jeupharma.matrice_medicaments SET classe_therapeutique_id = keep_id WHERE classe_therapeutique_id = r.id;
        UPDATE jeupharma.matrice_classes_therapeutiques SET classe_therapeutique_id = keep_id WHERE classe_therapeutique_id = r.id
          AND NOT EXISTS (SELECT 1 FROM jeupharma.matrice_classes_therapeutiques x WHERE x.matrice_id = matrice_classes_therapeutiques.matrice_id AND x.classe_therapeutique_id = keep_id);
        DELETE FROM jeupharma.matrice_classes_therapeutiques WHERE classe_therapeutique_id = r.id;
        UPDATE jeupharma.classes_therapeutiques SET actif = false WHERE id = r.id;
      ELSE
        UPDATE jeupharma.classes_therapeutiques SET valeur = new_val, valeur_norm = new_norm WHERE id = r.id;
      END IF;
    END LOOP;
  ELSIF p_table = 'classes_pharmacologiques' THEN
    FOR r IN SELECT id, valeur FROM jeupharma.classes_pharmacologiques WHERE actif AND valeur ~ '^[A-Z][0-9A-Z]*\s*[-–]\s*' LOOP
      new_val := btrim(regexp_replace(r.valeur, '^[A-Z][0-9A-Z]*\s*[-–]\s*', ''));
      new_norm := jeupharma.normaliser_valeur(new_val);
      SELECT id INTO keep_id FROM jeupharma.classes_pharmacologiques WHERE actif AND valeur_norm = new_norm AND id <> r.id LIMIT 1;
      IF keep_id IS NOT NULL THEN
        UPDATE jeupharma.matrice_medicaments SET classe_pharmacologique_id = keep_id WHERE classe_pharmacologique_id = r.id;
        UPDATE jeupharma.matrice_classes_pharmacologiques SET classe_pharmacologique_id = keep_id WHERE classe_pharmacologique_id = r.id
          AND NOT EXISTS (SELECT 1 FROM jeupharma.matrice_classes_pharmacologiques x WHERE x.matrice_id = matrice_classes_pharmacologiques.matrice_id AND x.classe_pharmacologique_id = keep_id);
        DELETE FROM jeupharma.matrice_classes_pharmacologiques WHERE classe_pharmacologique_id = r.id;
        UPDATE jeupharma.classes_pharmacologiques SET actif = false WHERE id = r.id;
      ELSE
        UPDATE jeupharma.classes_pharmacologiques SET valeur = new_val, valeur_norm = new_norm WHERE id = r.id;
      END IF;
    END LOOP;
  END IF;
END;$function$
;

CREATE OR REPLACE FUNCTION jeupharma.enregistrer_configuration_niveau(p_niveau text, p_secteurs uuid[], p_classes_therapeutiques uuid[], p_classes_pharmacologiques uuid[], p_champs text[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $function$ BEGIN IF NOT jeupharma.is_portail_admin() THEN RAISE EXCEPTION 'Réservé admin portail'; END IF; IF NOT EXISTS (SELECT 1 FROM jeupharma.niveaux WHERE code=p_niveau) THEN RAISE EXCEPTION 'Niveau inconnu : %',p_niveau; END IF; DELETE FROM jeupharma.niveau_secteurs_therapeutiques WHERE niveau_id=p_niveau; DELETE FROM jeupharma.niveau_classes_therapeutiques WHERE niveau_id=p_niveau; DELETE FROM jeupharma.niveau_classes_pharmacologiques WHERE niveau_id=p_niveau; DELETE FROM jeupharma.niveau_champs WHERE niveau_id=p_niveau; INSERT INTO jeupharma.niveau_secteurs_therapeutiques SELECT p_niveau,e.id FROM jeupharma.secteurs_therapeutiques e WHERE e.actif AND e.id=ANY(coalesce(p_secteurs,ARRAY[]::uuid[])); INSERT INTO jeupharma.niveau_classes_therapeutiques SELECT p_niveau,e.id FROM jeupharma.classes_therapeutiques e WHERE e.actif AND e.id=ANY(coalesce(p_classes_therapeutiques,ARRAY[]::uuid[])); INSERT INTO jeupharma.niveau_classes_pharmacologiques SELECT p_niveau,e.id FROM jeupharma.classes_pharmacologiques e WHERE e.actif AND e.id=ANY(coalesce(p_classes_pharmacologiques,ARRAY[]::uuid[])); INSERT INTO jeupharma.niveau_champs SELECT p_niveau,x FROM unnest(coalesce(p_champs,ARRAY[]::text[])) x; END; $function$
;

CREATE OR REPLACE FUNCTION jeupharma.fusionner_entites(p_table_name text, p_id_keep uuid, p_id_drop uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $function$
DECLARE
  allowed text[] := ARRAY[
    'noms_commerciaux', 'dcis', 'secteurs_therapeutiques', 'classes_therapeutiques',
    'classes_pharmacologiques', 'details_pharmacologie', 'indications',
    'contre_indications', 'effets_indesirables', 'precautions_emploi',
    'posologies_generales', 'interactions', 'surveillances',
    'grossesse_allaitement', 'voies_administration'
  ];
  niveaux_union text[];
BEGIN
  IF NOT jeupharma.is_portail_admin() THEN
    RAISE EXCEPTION 'Réservé admin portail';
  END IF;
  IF p_id_keep IS NULL OR p_id_drop IS NULL OR p_id_keep = p_id_drop THEN
    RAISE EXCEPTION 'ids invalides';
  END IF;
  IF NOT (p_table_name = ANY (allowed)) THEN
    RAISE EXCEPTION 'table non autorisée: %', p_table_name;
  END IF;

  EXECUTE format(
    'SELECT ARRAY(SELECT DISTINCT unnest(a.niveaux_connus || b.niveaux_connus)
      FROM jeupharma.%1$I a, jeupharma.%1$I b
      WHERE a.id = $1 AND b.id = $2)',
    p_table_name
  ) INTO niveaux_union USING p_id_keep, p_id_drop;

  EXECUTE format(
    'UPDATE jeupharma.%I SET niveaux_connus = $1, updated_at = now() WHERE id = $2',
    p_table_name
  ) USING coalesce(niveaux_union, '{}'::text[]), p_id_keep;

  IF p_table_name = 'noms_commerciaux' THEN
    UPDATE jeupharma.matrice_noms_commerciaux SET nom_commercial_id = p_id_keep
      WHERE nom_commercial_id = p_id_drop
        AND NOT EXISTS (
          SELECT 1 FROM jeupharma.matrice_noms_commerciaux x
          WHERE x.matrice_id = matrice_noms_commerciaux.matrice_id
            AND x.nom_commercial_id = p_id_keep
        );
    DELETE FROM jeupharma.matrice_noms_commerciaux WHERE nom_commercial_id = p_id_drop;
  ELSIF p_table_name = 'dcis' THEN
    UPDATE jeupharma.matrice_medicaments SET dci_id = p_id_keep
      WHERE dci_id = p_id_drop AND statut = 'archive';
    UPDATE jeupharma.matrice_medicaments m
    SET statut = 'archive'
    WHERE m.dci_id = p_id_drop
      AND m.statut <> 'archive'
      AND EXISTS (
        SELECT 1 FROM jeupharma.matrice_medicaments k
        WHERE k.dci_id = p_id_keep AND k.statut <> 'archive'
      );
    UPDATE jeupharma.matrice_medicaments SET dci_id = p_id_keep
      WHERE dci_id = p_id_drop AND statut <> 'archive'
        AND NOT EXISTS (
          SELECT 1 FROM jeupharma.matrice_medicaments k
          WHERE k.dci_id = p_id_keep AND k.statut <> 'archive'
        );
  ELSIF p_table_name = 'secteurs_therapeutiques' THEN
    UPDATE jeupharma.matrice_medicaments SET secteur_therapeutique_id = p_id_keep
      WHERE secteur_therapeutique_id = p_id_drop;
    UPDATE jeupharma.quizz SET secteur_therapeutique_id = p_id_keep
      WHERE secteur_therapeutique_id = p_id_drop;
    UPDATE jeupharma.parties_tableau_trous SET secteur_therapeutique_id = p_id_keep
      WHERE secteur_therapeutique_id = p_id_drop;
  ELSIF p_table_name = 'classes_therapeutiques' THEN
    UPDATE jeupharma.matrice_classes_therapeutiques SET classe_therapeutique_id = p_id_keep
      WHERE classe_therapeutique_id = p_id_drop
        AND NOT EXISTS (
          SELECT 1 FROM jeupharma.matrice_classes_therapeutiques x
          WHERE x.matrice_id = matrice_classes_therapeutiques.matrice_id
            AND x.classe_therapeutique_id = p_id_keep
        );
    DELETE FROM jeupharma.matrice_classes_therapeutiques WHERE classe_therapeutique_id = p_id_drop;
    UPDATE jeupharma.matrice_medicaments SET classe_therapeutique_id = p_id_keep
      WHERE classe_therapeutique_id = p_id_drop;
  ELSIF p_table_name = 'classes_pharmacologiques' THEN
    UPDATE jeupharma.matrice_classes_pharmacologiques SET classe_pharmacologique_id = p_id_keep
      WHERE classe_pharmacologique_id = p_id_drop
        AND NOT EXISTS (
          SELECT 1 FROM jeupharma.matrice_classes_pharmacologiques x
          WHERE x.matrice_id = matrice_classes_pharmacologiques.matrice_id
            AND x.classe_pharmacologique_id = p_id_keep
        );
    DELETE FROM jeupharma.matrice_classes_pharmacologiques WHERE classe_pharmacologique_id = p_id_drop;
    UPDATE jeupharma.matrice_medicaments SET classe_pharmacologique_id = p_id_keep
      WHERE classe_pharmacologique_id = p_id_drop;
  ELSIF p_table_name = 'details_pharmacologie' THEN
    UPDATE jeupharma.matrice_medicaments SET detail_pharmacologie_id = p_id_keep
      WHERE detail_pharmacologie_id = p_id_drop;
  ELSIF p_table_name = 'posologies_generales' THEN
    UPDATE jeupharma.matrice_medicaments SET posologie_generale_id = p_id_keep
      WHERE posologie_generale_id = p_id_drop;
  ELSIF p_table_name = 'grossesse_allaitement' THEN
    UPDATE jeupharma.matrice_medicaments SET grossesse_allaitement_id = p_id_keep
      WHERE grossesse_allaitement_id = p_id_drop;
  ELSIF p_table_name = 'indications' THEN
    UPDATE jeupharma.matrice_indications SET indication_id = p_id_keep
      WHERE indication_id = p_id_drop
        AND NOT EXISTS (
          SELECT 1 FROM jeupharma.matrice_indications x
          WHERE x.matrice_id = matrice_indications.matrice_id AND x.indication_id = p_id_keep
        );
    DELETE FROM jeupharma.matrice_indications WHERE indication_id = p_id_drop;
  ELSIF p_table_name = 'contre_indications' THEN
    UPDATE jeupharma.matrice_contre_indications SET contre_indication_id = p_id_keep
      WHERE contre_indication_id = p_id_drop
        AND NOT EXISTS (
          SELECT 1 FROM jeupharma.matrice_contre_indications x
          WHERE x.matrice_id = matrice_contre_indications.matrice_id
            AND x.contre_indication_id = p_id_keep
        );
    DELETE FROM jeupharma.matrice_contre_indications WHERE contre_indication_id = p_id_drop;
  ELSIF p_table_name = 'effets_indesirables' THEN
    UPDATE jeupharma.matrice_effets_indesirables SET effet_indesirable_id = p_id_keep
      WHERE effet_indesirable_id = p_id_drop
        AND NOT EXISTS (
          SELECT 1 FROM jeupharma.matrice_effets_indesirables x
          WHERE x.matrice_id = matrice_effets_indesirables.matrice_id
            AND x.effet_indesirable_id = p_id_keep
        );
    DELETE FROM jeupharma.matrice_effets_indesirables WHERE effet_indesirable_id = p_id_drop;
  ELSIF p_table_name = 'precautions_emploi' THEN
    UPDATE jeupharma.matrice_precautions_emploi SET precaution_emploi_id = p_id_keep
      WHERE precaution_emploi_id = p_id_drop
        AND NOT EXISTS (
          SELECT 1 FROM jeupharma.matrice_precautions_emploi x
          WHERE x.matrice_id = matrice_precautions_emploi.matrice_id
            AND x.precaution_emploi_id = p_id_keep
        );
    DELETE FROM jeupharma.matrice_precautions_emploi WHERE precaution_emploi_id = p_id_drop;
  ELSIF p_table_name = 'interactions' THEN
    UPDATE jeupharma.matrice_interactions SET interaction_id = p_id_keep
      WHERE interaction_id = p_id_drop
        AND NOT EXISTS (
          SELECT 1 FROM jeupharma.matrice_interactions x
          WHERE x.matrice_id = matrice_interactions.matrice_id AND x.interaction_id = p_id_keep
        );
    DELETE FROM jeupharma.matrice_interactions WHERE interaction_id = p_id_drop;
  ELSIF p_table_name = 'surveillances' THEN
    UPDATE jeupharma.matrice_surveillances SET surveillance_id = p_id_keep
      WHERE surveillance_id = p_id_drop
        AND NOT EXISTS (
          SELECT 1 FROM jeupharma.matrice_surveillances x
          WHERE x.matrice_id = matrice_surveillances.matrice_id AND x.surveillance_id = p_id_keep
        );
    DELETE FROM jeupharma.matrice_surveillances WHERE surveillance_id = p_id_drop;
  ELSIF p_table_name = 'voies_administration' THEN
    UPDATE jeupharma.matrice_voies_administration SET voie_administration_id = p_id_keep
      WHERE voie_administration_id = p_id_drop
        AND NOT EXISTS (
          SELECT 1 FROM jeupharma.matrice_voies_administration x
          WHERE x.matrice_id = matrice_voies_administration.matrice_id
            AND x.voie_administration_id = p_id_keep
        );
    DELETE FROM jeupharma.matrice_voies_administration WHERE voie_administration_id = p_id_drop;
  END IF;

  EXECUTE format(
    'UPDATE jeupharma.%I SET actif = false, updated_at = now() WHERE id = $1',
    p_table_name
  ) USING p_id_drop;
END;
$function$
;

CREATE OR REPLACE FUNCTION jeupharma.generer_et_geler_quiz(p_quizz_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $function$
DECLARE
  q jeupharma.quizz%ROWTYPE;
  cfg jsonb;
  champs text[];
  nb_q int;
  nb_prop int;
  questions jsonb := '[]'::jsonb;
  pool uuid[];
  mid uuid;
  champ text;
  bonne record;
  distracteurs jsonb;
  props jsonb;
  enonce text;
  dci_val text;
  nom_val text;
  i int;
  attempts int;
  has_eval boolean;
BEGIN
  IF NOT jeupharma.is_portail_admin() THEN
    RAISE EXCEPTION 'Réservé admin portail';
  END IF;

  SELECT * INTO q FROM jeupharma.quizz WHERE id = p_quizz_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quiz introuvable';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM jeupharma.quizz_reponses_utilisateur r
    WHERE r.quizz_id = p_quizz_id AND r.mode = 'evaluation'
  ) INTO has_eval;
  IF has_eval THEN
    RAISE EXCEPTION 'Snapshot verrouillé : des réponses évaluation existent déjà';
  END IF;

  cfg := coalesce(q.configuration_json, '{}'::jsonb);
  champs := coalesce(
    ARRAY(SELECT jsonb_array_elements_text(cfg->'champs_interroges')),
    ARRAY['classe_pharmacologique']::text[]
  );
  IF cardinality(champs) IS NULL OR cardinality(champs) = 0 THEN
    champs := ARRAY['classe_pharmacologique'];
  END IF;
  nb_q := coalesce((cfg->>'nb_questions')::int, 10);
  nb_prop := coalesce((cfg->>'nb_propositions')::int, 3);
  IF nb_q < 1 THEN nb_q := 10; END IF;
  IF nb_prop < 2 THEN nb_prop := 3; END IF;

  SELECT coalesce(array_agg(m.id), ARRAY[]::uuid[])
  INTO pool
  FROM jeupharma.matrice_medicaments m
  WHERE m.statut = 'publie'
    AND (q.secteur_therapeutique_id IS NULL OR m.secteur_therapeutique_id = q.secteur_therapeutique_id)
    AND jeupharma._matrice_disponible_niveau(m.id, q.niveau_cible);

  IF coalesce(cardinality(pool), 0) = 0 THEN
    RAISE EXCEPTION 'Pas assez de médicaments publiés dans ce secteur pour % QCM', nb_q;
  END IF;

  i := 0;
  attempts := 0;
  WHILE i < nb_q AND attempts < nb_q * 20 LOOP
    attempts := attempts + 1;
    mid := pool[1 + floor(random() * cardinality(pool))::int];
    champ := champs[1 + floor(random() * cardinality(champs))::int];

    SELECT * INTO bonne FROM jeupharma._valeur_champ_matrice(mid, champ, q.niveau_cible) LIMIT 1;
    IF bonne.entite_id IS NULL THEN
      CONTINUE;
    END IF;

    SELECT d.valeur INTO dci_val
    FROM jeupharma.matrice_medicaments m
    LEFT JOIN jeupharma.dcis d ON d.id = m.dci_id
    WHERE m.id = mid;

    SELECT string_agg(nc.valeur, ', ' ORDER BY mnc.ordre, nc.valeur)
    INTO nom_val
    FROM jeupharma.matrice_noms_commerciaux mnc
    JOIN jeupharma.noms_commerciaux nc ON nc.id = mnc.nom_commercial_id
    WHERE mnc.matrice_id = mid;

    IF champ = 'dci' THEN
      enonce := format('Quelle est la DCI de %s ?', coalesce(nom_val, 'ce médicament'));
    ELSIF champ = 'nom_commercial' THEN
      enonce := format('Quel est le nom commercial de %s ?', coalesce(dci_val, 'cette DCI'));
    ELSE
      enonce := format(
        'Quelle est la %s de %s (%s) ?',
        jeupharma._libelle_champ(champ),
        coalesce(dci_val, '…'),
        coalesce(nom_val, '…')
      );
    END IF;

    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', x.entite_id,
      'valeur', x.valeur,
      'correct', false
    )), '[]'::jsonb)
    INTO distracteurs
    FROM jeupharma._distracteurs_champ(
      champ, bonne.entite_id, q.secteur_therapeutique_id, q.niveau_cible, nb_prop - 1
    ) x;

    IF jsonb_array_length(distracteurs) < (nb_prop - 1) THEN
      CONTINUE;
    END IF;

    props := distracteurs || jsonb_build_array(jsonb_build_object(
      'id', bonne.entite_id,
      'valeur', bonne.valeur,
      'correct', true
    ));

    SELECT jsonb_agg(e.elem ORDER BY random())
    INTO props
    FROM jsonb_array_elements(props) AS e(elem);

    questions := questions || jsonb_build_array(jsonb_build_object(
      'ordre', i + 1,
      'enonce', enonce,
      'matrice_id', mid,
      'champ_code', champ,
      'bonne_reponse_id', bonne.entite_id,
      'propositions', props
    ));
    i := i + 1;
  END LOOP;

  IF i < nb_q THEN
    RAISE EXCEPTION
      'Pas assez de médicaments publiés dans ce secteur pour % QCM (généré: %)',
      nb_q, i;
  END IF;

  UPDATE jeupharma.quizz
  SET snapshot_questions = questions
  WHERE id = p_quizz_id;

  RETURN questions;
END;
$function$
;

CREATE OR REPLACE FUNCTION jeupharma.has_jeupharma_access()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'portail', 'jeupharma', 'pg_temp'
AS $function$
  SELECT
    jeupharma.is_portail_admin()
    OR EXISTS (
      SELECT 1
      FROM portail.site_access sa
      WHERE sa.user_id = auth.uid()
        AND sa.site_id = 'd4fc7fd0-944b-4594-9ba2-e1e2035aeddc'::uuid
    );
$function$
;

CREATE OR REPLACE FUNCTION jeupharma.is_portail_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'portail', 'jeupharma', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM portail.profiles
    WHERE id = auth.uid()
      AND role = 'admin'
  );
$function$
;

CREATE OR REPLACE FUNCTION jeupharma.normaliser_valeur(p_valeur text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
DECLARE
  v text;
BEGIN
  IF p_valeur IS NULL THEN
    RETURN NULL;
  END IF;
  v := lower(trim(both FROM p_valeur));
  v := regexp_replace(normalize(v, NFD), '[\u0300-\u036f]', '', 'g');
  RETURN v;
END;
$function$
;

CREATE OR REPLACE FUNCTION jeupharma.ouvrir_quiz(p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $function$
DECLARE
  q jeupharma.quizz%ROWTYPE;
  out_snap jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT jeupharma.has_jeupharma_access() THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  SELECT * INTO q FROM jeupharma.quizz
  WHERE code_unique = upper(trim(p_code)) AND actif;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quiz introuvable';
  END IF;
  IF q.en_pause THEN
    RAISE EXCEPTION 'Ce quiz est en pause';
  END IF;

  IF q.niveau_cible IN ('pharmacien', 'hospitalier') THEN
    IF NOT EXISTS (
      SELECT 1 FROM jeupharma.profil_apprentissage p
      WHERE p.user_id = auth.uid() AND p.niveau_id = 'pharmacien'
    ) AND NOT jeupharma.is_portail_admin() THEN
      RAISE EXCEPTION 'Ce quiz est réservé au niveau d’apprentissage pharmacien';
    END IF;
  END IF;

  out_snap := coalesce(q.snapshot_questions, '[]'::jsonb);
  IF q.mode = 'evaluation' THEN
    out_snap := (
      SELECT coalesce(jsonb_agg(
        (elem - 'bonne_reponse_id') || jsonb_build_object(
          'propositions', (
            SELECT coalesce(jsonb_agg(p - 'correct'), '[]'::jsonb)
            FROM jsonb_array_elements(coalesce(elem->'propositions', '[]'::jsonb)) p
          )
        )
      ), '[]'::jsonb)
      FROM jsonb_array_elements(out_snap) elem
    );
  END IF;

  RETURN jsonb_build_object(
    'id', q.id,
    'code_unique', q.code_unique,
    'titre', q.titre,
    'mode', q.mode,
    'niveau_cible', q.niveau_cible,
    'secteur_therapeutique_id', q.secteur_therapeutique_id,
    'en_pause', q.en_pause,
    'questions', out_snap
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION jeupharma.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION jeupharma.soumettre_quiz(p_quizz_id uuid, p_reponses jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $function$
DECLARE
  q jeupharma.quizz%ROWTYPE;
  elem jsonb;
  bonne_id uuid;
  choix_id uuid;
  ok boolean;
  score int := 0;
  total int := 0;
  details jsonb := '[]'::jsonb;
  rid uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT jeupharma.has_jeupharma_access() THEN RAISE EXCEPTION 'Acces refuse'; END IF;
  SELECT * INTO q FROM jeupharma.quizz WHERE id = p_quizz_id AND actif;
  IF NOT FOUND THEN RAISE EXCEPTION 'Quiz introuvable'; END IF;
  IF q.niveau_cible IN ('pharmacien', 'hospitalier') AND NOT jeupharma.is_portail_admin() AND NOT EXISTS (SELECT 1 FROM jeupharma.profil_apprentissage p WHERE p.user_id=auth.uid() AND p.niveau_id='pharmacien') THEN RAISE EXCEPTION 'Quiz reserve au niveau pharmacien'; END IF;
  IF q.snapshot_questions IS NULL THEN RAISE EXCEPTION 'Snapshot manquant'; END IF;
  IF q.mode = 'evaluation' AND EXISTS (
    SELECT 1 FROM jeupharma.quizz_reponses_utilisateur r
    WHERE r.quizz_id = p_quizz_id AND r.utilisateur_id = auth.uid() AND r.mode = 'evaluation'
  ) THEN RAISE EXCEPTION 'Tentative evaluation deja enregistree'; END IF;
  FOR elem IN SELECT * FROM jsonb_array_elements(q.snapshot_questions) LOOP
    total := total + 1;
    bonne_id := (elem->>'bonne_reponse_id')::uuid;
    choix_id := NULL;
    SELECT (r->>'proposition_id')::uuid INTO choix_id
    FROM jsonb_array_elements(coalesce(p_reponses, '[]'::jsonb)) r
    WHERE (r->>'ordre')::int = (elem->>'ordre')::int OR r->>'matrice_id' = elem->>'matrice_id'
    LIMIT 1;
    ok := (choix_id IS NOT NULL AND choix_id = bonne_id);
    IF ok THEN score := score + 1; END IF;
    details := details || jsonb_build_array(jsonb_build_object(
      'ordre', elem->'ordre', 'matrice_id', elem->'matrice_id', 'champ_code', elem->'champ_code',
      'proposition_id', choix_id, 'bonne_reponse_id', bonne_id, 'correct', ok
    ));
  END LOOP;
  INSERT INTO jeupharma.quizz_reponses_utilisateur (
    quizz_id, utilisateur_id, mode, score_obtenu, score_max, details_reponses
  ) VALUES (p_quizz_id, auth.uid(), q.mode, score, total, details)
  RETURNING id INTO rid;
  RETURN jsonb_build_object(
    'reponse_id', rid, 'mode', q.mode, 'score_obtenu', score, 'score_max', total, 'details', details
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION jeupharma.trg_audit_row()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'jeupharma', 'pg_temp'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO jeupharma.historique_modifications (
      table_name, record_id, operation, ancien_etat, nouvel_etat, user_id, etat
    ) VALUES (
      TG_TABLE_NAME, NEW.id, 'insert', NULL, to_jsonb(NEW), auth.uid(), 'applique'
    );
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO jeupharma.historique_modifications (
      table_name, record_id, operation, ancien_etat, nouvel_etat, user_id, etat
    ) VALUES (
      TG_TABLE_NAME, NEW.id, 'update', to_jsonb(OLD), to_jsonb(NEW), auth.uid(), 'applique'
    );
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO jeupharma.historique_modifications (
      table_name, record_id, operation, ancien_etat, nouvel_etat, user_id, etat
    ) VALUES (
      TG_TABLE_NAME, OLD.id, 'delete', to_jsonb(OLD), NULL, auth.uid(), 'applique'
    );
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION jeupharma.trg_entite_before_write()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  c text;
BEGIN
  NEW.valeur := trim(both FROM NEW.valeur);
  IF NEW.valeur IS NULL OR length(NEW.valeur) = 0 THEN
    RAISE EXCEPTION 'valeur obligatoire';
  END IF;
  NEW.valeur_norm := jeupharma.normaliser_valeur(NEW.valeur);
  IF NEW.niveaux_connus IS NULL THEN
    NEW.niveaux_connus := '{}'::text[];
  END IF;
  FOREACH c IN ARRAY NEW.niveaux_connus LOOP
    IF NOT EXISTS (SELECT 1 FROM jeupharma.niveaux n WHERE n.code = c) THEN
      RAISE EXCEPTION 'niveau inconnu dans niveaux_connus: %', c;
    END IF;
  END LOOP;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION jeupharma.trg_sync_classe_fk()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  mid uuid;
BEGIN
  mid := COALESCE(NEW.matrice_id, OLD.matrice_id);
  IF TG_TABLE_NAME = 'matrice_classes_therapeutiques' THEN
    UPDATE jeupharma.matrice_medicaments m
    SET classe_therapeutique_id = (
      SELECT j.classe_therapeutique_id
      FROM jeupharma.matrice_classes_therapeutiques j
      WHERE j.matrice_id = mid
      ORDER BY j.ordre, j.classe_therapeutique_id
      LIMIT 1
    )
    WHERE m.id = mid;
  ELSIF TG_TABLE_NAME = 'matrice_classes_pharmacologiques' THEN
    UPDATE jeupharma.matrice_medicaments m
    SET classe_pharmacologique_id = (
      SELECT j.classe_pharmacologique_id
      FROM jeupharma.matrice_classes_pharmacologiques j
      WHERE j.matrice_id = mid
      ORDER BY j.ordre, j.classe_pharmacologique_id
      LIMIT 1
    )
    WHERE m.id = mid;
  END IF;
  RETURN NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION jeupharma.trg_sync_secteur_fk()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE mid uuid;
BEGIN
  mid := COALESCE(NEW.matrice_id, OLD.matrice_id);
  UPDATE jeupharma.matrice_medicaments m
  SET secteur_therapeutique_id = (
    SELECT j.secteur_therapeutique_id FROM jeupharma.matrice_secteurs_therapeutiques j
    WHERE j.matrice_id = mid ORDER BY j.ordre, j.secteur_therapeutique_id LIMIT 1
  ) WHERE m.id = mid;
  RETURN NULL;
END;$function$
;

CREATE OR REPLACE FUNCTION jeupharma.v2__clean_criteres(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
DECLARE out jsonb := '{}'::jsonb; arr jsonb := '[]'::jsonb; e jsonb; pct numeric; mid uuid;
BEGIN
  IF p IS NULL OR jsonb_typeof(p) <> 'object' THEN RETURN '{}'::jsonb; END IF;
  IF jsonb_typeof(p->'lecture') = 'boolean' THEN out := out || jsonb_build_object('lecture', p->'lecture'); END IF;
  IF p->>'logique' IN ('et', 'ou') THEN out := out || jsonb_build_object('logique', p->>'logique'); END IF;
  IF (p->>'progression_min_pct') ~ '^[0-9]+(\.[0-9]+)?$' THEN
    out := out || jsonb_build_object('progression_min_pct', least(100, greatest(0, round((p->>'progression_min_pct')::numeric))));
  END IF;
  IF jsonb_typeof(p->'jeux') = 'array' THEN
    FOR e IN SELECT * FROM jsonb_array_elements(p->'jeux') LOOP
      BEGIN mid := (e->>'modele_id')::uuid; EXCEPTION WHEN others THEN CONTINUE; END;
      IF mid IS NULL THEN CONTINUE; END IF;
      pct := CASE WHEN (e->>'score_min_pct') ~ '^[0-9]+(\.[0-9]+)?$' THEN least(100, greatest(0, round((e->>'score_min_pct')::numeric))) ELSE 0 END;
      arr := arr || jsonb_build_array(jsonb_build_object('modele_id', mid, 'score_min_pct', pct));
    END LOOP;
    out := out || jsonb_build_object('jeux', arr);
  END IF;
  RETURN out;
END; $function$
;

CREATE OR REPLACE FUNCTION jeupharma.v2__criteres_jeux(p_user uuid, p_crit jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'jeupharma', 'pg_temp'
AS $function$
DECLARE e jsonb; mj jeupharma.modeles_jeu%ROWTYPE; best numeric; mn numeric; part numeric; is_ok boolean; liste jsonb := '[]'::jsonb; n int := 0; k int := 0; somme numeric := 0; max_part numeric := 0;
BEGIN
  IF jsonb_typeof(p_crit->'jeux') = 'array' THEN
    FOR e IN SELECT * FROM jsonb_array_elements(p_crit->'jeux') LOOP
      SELECT * INTO mj FROM jeupharma.modeles_jeu WHERE id = (e->>'modele_id')::uuid AND actif;
      IF NOT FOUND THEN CONTINUE; END IF;
      mn := coalesce((e->>'score_min_pct')::numeric, 0);
      best := jeupharma.v2__jeu_meilleur_pct(p_user, mj.id);
      is_ok := best IS NOT NULL AND best >= mn;
      part := CASE WHEN best IS NULL THEN 0 WHEN mn <= 0 THEN 1 ELSE least(1, best / mn) END;
      n := n + 1;
      IF is_ok THEN k := k + 1; END IF;
      somme := somme + part;
      max_part := greatest(max_part, part);
      liste := liste || jsonb_build_array(jsonb_build_object('modele_id', mj.id, 'titre', mj.titre, 'code_unique', mj.code_unique, 'type_jeu', mj.type_jeu, 'score_min_pct', mn, 'meilleur_pct', CASE WHEN best IS NULL THEN NULL ELSE round(best) END, 'fait', best IS NOT NULL, 'ok', is_ok));
    END LOOP;
  END IF;
  RETURN jsonb_build_object('liste', liste, 'n', n, 'ok', k, 'somme', somme, 'max_part', max_part);
END; $function$
;

CREATE OR REPLACE FUNCTION jeupharma.v2__jeu_meilleur_pct(p_user uuid, p_modele uuid)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'jeupharma', 'pg_temp'
AS $function$
  SELECT max(CASE WHEN t.score_max IS NOT NULL AND t.score_max > 0 THEN 100.0 * coalesce(t.score_obtenu, 0) / t.score_max ELSE 100 END)
  FROM jeupharma.tentatives_jeu t WHERE t.utilisateur_id = p_user AND t.modele_id = p_modele AND t.termine_at IS NOT NULL;
$function$
;

CREATE OR REPLACE FUNCTION jeupharma.v2__parcours_stats(p_user uuid, p_parcours uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $function$
DECLARE pa jeupharma.parcours_apprentissage%ROWTYPE; crit jsonb; logique text; min_pct numeric; jx jsonb; n_j int; k_j int; nb int := 0; nbv int := 0; sum_pct numeric := 0; leaf record; dl jsonb; maj timestamptz; pct numeric; prog_ok boolean; jeux_ok boolean;
BEGIN
  SELECT * INTO pa FROM jeupharma.parcours_apprentissage WHERE id = p_parcours;
  IF NOT FOUND THEN RETURN NULL; END IF;
  crit := coalesce(pa.criteres_json, '{}'::jsonb);
  logique := CASE WHEN crit->>'logique' = 'ou' THEN 'ou' ELSE 'et' END;
  min_pct := coalesce((crit->>'progression_min_pct')::numeric, 100);
  jx := jeupharma.v2__criteres_jeux(p_user, crit);
  n_j := (jx->>'n')::int; k_j := (jx->>'ok')::int;
  maj := pa.updated_at;
  FOR leaf IN SELECT c.id, coalesce(c.contenu_maj_at, c.updated_at) AS maj FROM jeupharma.modules_cours c WHERE c.parcours_id = p_parcours AND c.publie AND NOT c.est_groupe
  LOOP
    dl := jeupharma.v2_module_detail(p_user, leaf.id);
    nb := nb + 1;
    sum_pct := sum_pct + coalesce((dl->>'pct')::numeric, 0);
    IF (dl->>'valide')::boolean THEN nbv := nbv + 1; END IF;
    maj := greatest(maj, leaf.maj);
  END LOOP;
  pct := CASE WHEN nb = 0 THEN 0 ELSE round(sum_pct / nb) END;
  prog_ok := nb = 0 OR (CASE WHEN min_pct >= 100 THEN nbv = nb ELSE pct >= min_pct END);
  jeux_ok := n_j = 0 OR (CASE WHEN logique = 'ou' THEN k_j >= 1 ELSE k_j = n_j END);
  RETURN jsonb_build_object('pct', pct, 'nb_lecons', nb, 'nb_valides', nbv, 'valide', prog_ok AND jeux_ok, 'progression_min_pct', min_pct, 'jeux', jx->'liste', 'maj_at', maj);
END; $function$
;

CREATE OR REPLACE FUNCTION jeupharma.v2__sync_progression(p_user uuid, p_parcours uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $function$
DECLARE leaf record;
BEGIN
  FOR leaf IN SELECT c.id FROM jeupharma.modules_cours c WHERE c.parcours_id = p_parcours AND c.publie AND NOT c.est_groupe LOOP
    IF jeupharma.v2_module_valide(p_user, leaf.id) THEN
      INSERT INTO jeupharma.progression_modules (user_id, module_id, statut, debloque_at, termine_at, updated_at)
      VALUES (p_user, leaf.id, 'termine', now(), now(), now())
      ON CONFLICT (user_id, module_id) DO UPDATE SET statut = 'termine', termine_at = coalesce(jeupharma.progression_modules.termine_at, now()), updated_at = now()
        WHERE jeupharma.progression_modules.statut <> 'termine';
    ELSE
      UPDATE jeupharma.progression_modules SET statut = 'debloque', termine_at = NULL, updated_at = now()
      WHERE user_id = p_user AND module_id = leaf.id AND statut = 'termine';
    END IF;
  END LOOP;
END; $function$
;

CREATE OR REPLACE FUNCTION jeupharma.v2_backfill_connaissances_from_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $function$
DECLARE
  src uuid;
  ver uuid;
  n_ins int := 0;
BEGIN
  IF NOT jeupharma.is_portail_admin() THEN
    RAISE EXCEPTION 'Réservé admin portail';
  END IF;

  SELECT id INTO src FROM jeupharma.sources_contenu WHERE code = 'migration_v1_matrice';
  SELECT id INTO ver FROM jeupharma.versions_source WHERE source_id = src AND version_label = 'v1-baseline';

  INSERT INTO jeupharma.connaissances (
    matrice_id, champ_code, entite_id, texte, texte_norm, statut,
    source_id, version_source_id, ordre
  )
  SELECT m.id, 'dci', d.id, d.valeur, d.valeur_norm, 'valide', src, ver, 0
  FROM jeupharma.matrice_medicaments m
  JOIN jeupharma.dcis d ON d.id = m.dci_id AND d.actif
  WHERE m.statut = 'publie'
  ON CONFLICT (matrice_id, champ_code, entite_key) WHERE statut <> 'retire' DO NOTHING;
  GET DIAGNOSTICS n_ins = ROW_COUNT;

  INSERT INTO jeupharma.connaissances (
    matrice_id, champ_code, entite_id, texte, texte_norm, statut,
    source_id, version_source_id, ordre
  )
  SELECT m.id, 'nom_commercial', n.id, n.valeur, n.valeur_norm, 'valide', src, ver, mn.ordre
  FROM jeupharma.matrice_medicaments m
  JOIN jeupharma.matrice_noms_commerciaux mn ON mn.matrice_id = m.id
  JOIN jeupharma.noms_commerciaux n ON n.id = mn.nom_commercial_id AND n.actif
  WHERE m.statut = 'publie'
  ON CONFLICT (matrice_id, champ_code, entite_key) WHERE statut <> 'retire' DO NOTHING;

  INSERT INTO jeupharma.connaissances (
    matrice_id, champ_code, entite_id, texte, texte_norm, statut,
    source_id, version_source_id, ordre
  )
  SELECT m.id, 'secteur_therapeutique', e.id, e.valeur, e.valeur_norm, 'valide', src, ver, j.ordre
  FROM jeupharma.matrice_medicaments m
  JOIN jeupharma.matrice_secteurs_therapeutiques j ON j.matrice_id = m.id
  JOIN jeupharma.secteurs_therapeutiques e ON e.id = j.secteur_therapeutique_id AND e.actif
  WHERE m.statut = 'publie'
  ON CONFLICT (matrice_id, champ_code, entite_key) WHERE statut <> 'retire' DO NOTHING;

  INSERT INTO jeupharma.connaissances (
    matrice_id, champ_code, entite_id, texte, texte_norm, statut,
    source_id, version_source_id, ordre
  )
  SELECT m.id, 'classe_therapeutique', e.id, e.valeur, e.valeur_norm, 'valide', src, ver, j.ordre
  FROM jeupharma.matrice_medicaments m
  JOIN jeupharma.matrice_classes_therapeutiques j ON j.matrice_id = m.id
  JOIN jeupharma.classes_therapeutiques e ON e.id = j.classe_therapeutique_id AND e.actif
  WHERE m.statut = 'publie'
  ON CONFLICT (matrice_id, champ_code, entite_key) WHERE statut <> 'retire' DO NOTHING;

  INSERT INTO jeupharma.connaissances (
    matrice_id, champ_code, entite_id, texte, texte_norm, statut,
    source_id, version_source_id, ordre
  )
  SELECT m.id, 'classe_pharmacologique', e.id, e.valeur, e.valeur_norm, 'valide', src, ver, j.ordre
  FROM jeupharma.matrice_medicaments m
  JOIN jeupharma.matrice_classes_pharmacologiques j ON j.matrice_id = m.id
  JOIN jeupharma.classes_pharmacologiques e ON e.id = j.classe_pharmacologique_id AND e.actif
  WHERE m.statut = 'publie'
  ON CONFLICT (matrice_id, champ_code, entite_key) WHERE statut <> 'retire' DO NOTHING;

  INSERT INTO jeupharma.connaissances (
    matrice_id, champ_code, entite_id, texte, texte_norm, statut,
    source_id, version_source_id, ordre
  )
  SELECT m.id, 'detail_pharmacologie', e.id, e.valeur, e.valeur_norm, 'valide', src, ver, 0
  FROM jeupharma.matrice_medicaments m
  JOIN jeupharma.details_pharmacologie e ON e.id = m.detail_pharmacologie_id AND e.actif
  WHERE m.statut = 'publie' AND m.detail_pharmacologie_id IS NOT NULL
  ON CONFLICT (matrice_id, champ_code, entite_key) WHERE statut <> 'retire' DO NOTHING;

  INSERT INTO jeupharma.connaissances (
    matrice_id, champ_code, entite_id, texte, texte_norm, statut,
    source_id, version_source_id, ordre
  )
  SELECT m.id, 'indications', e.id, e.valeur, e.valeur_norm, 'valide', src, ver, j.ordre
  FROM jeupharma.matrice_medicaments m
  JOIN jeupharma.matrice_indications j ON j.matrice_id = m.id
  JOIN jeupharma.indications e ON e.id = j.indication_id AND e.actif
  WHERE m.statut = 'publie'
  ON CONFLICT (matrice_id, champ_code, entite_key) WHERE statut <> 'retire' DO NOTHING;

  INSERT INTO jeupharma.connaissances (
    matrice_id, champ_code, entite_id, texte, texte_norm, statut,
    source_id, version_source_id, ordre
  )
  SELECT m.id, 'contre_indications', e.id, e.valeur, e.valeur_norm, 'valide', src, ver, j.ordre
  FROM jeupharma.matrice_medicaments m
  JOIN jeupharma.matrice_contre_indications j ON j.matrice_id = m.id
  JOIN jeupharma.contre_indications e ON e.id = j.contre_indication_id AND e.actif
  WHERE m.statut = 'publie'
  ON CONFLICT (matrice_id, champ_code, entite_key) WHERE statut <> 'retire' DO NOTHING;

  INSERT INTO jeupharma.connaissances (
    matrice_id, champ_code, entite_id, texte, texte_norm, statut,
    source_id, version_source_id, ordre
  )
  SELECT m.id, 'effets_indesirables', e.id, e.valeur, e.valeur_norm, 'valide', src, ver, j.ordre
  FROM jeupharma.matrice_medicaments m
  JOIN jeupharma.matrice_effets_indesirables j ON j.matrice_id = m.id
  JOIN jeupharma.effets_indesirables e ON e.id = j.effet_indesirable_id AND e.actif
  WHERE m.statut = 'publie'
  ON CONFLICT (matrice_id, champ_code, entite_key) WHERE statut <> 'retire' DO NOTHING;

  INSERT INTO jeupharma.connaissances (
    matrice_id, champ_code, entite_id, texte, texte_norm, statut,
    source_id, version_source_id, ordre
  )
  SELECT m.id, 'precautions_emploi', e.id, e.valeur, e.valeur_norm, 'valide', src, ver, j.ordre
  FROM jeupharma.matrice_medicaments m
  JOIN jeupharma.matrice_precautions_emploi j ON j.matrice_id = m.id
  JOIN jeupharma.precautions_emploi e ON e.id = j.precaution_emploi_id AND e.actif
  WHERE m.statut = 'publie'
  ON CONFLICT (matrice_id, champ_code, entite_key) WHERE statut <> 'retire' DO NOTHING;

  INSERT INTO jeupharma.connaissances (
    matrice_id, champ_code, entite_id, texte, texte_norm, statut,
    source_id, version_source_id, ordre
  )
  SELECT m.id, 'interactions', e.id, e.valeur, e.valeur_norm, 'valide', src, ver, j.ordre
  FROM jeupharma.matrice_medicaments m
  JOIN jeupharma.matrice_interactions j ON j.matrice_id = m.id
  JOIN jeupharma.interactions e ON e.id = j.interaction_id AND e.actif
  WHERE m.statut = 'publie'
  ON CONFLICT (matrice_id, champ_code, entite_key) WHERE statut <> 'retire' DO NOTHING;

  INSERT INTO jeupharma.connaissances (
    matrice_id, champ_code, entite_id, texte, texte_norm, statut,
    source_id, version_source_id, ordre
  )
  SELECT m.id, 'surveillances', e.id, e.valeur, e.valeur_norm, 'valide', src, ver, j.ordre
  FROM jeupharma.matrice_medicaments m
  JOIN jeupharma.matrice_surveillances j ON j.matrice_id = m.id
  JOIN jeupharma.surveillances e ON e.id = j.surveillance_id AND e.actif
  WHERE m.statut = 'publie'
  ON CONFLICT (matrice_id, champ_code, entite_key) WHERE statut <> 'retire' DO NOTHING;

  RETURN jsonb_build_object(
    'source_id', src,
    'version_source_id', ver,
    'total_connaissances', (SELECT count(*) FROM jeupharma.connaissances WHERE source_id = src)
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION jeupharma.v2_chercher_matrices(p_q text DEFAULT NULL::text, p_secteur_norm text DEFAULT NULL::text, p_indication_norm text DEFAULT NULL::text, p_classe_ther_norm text DEFAULT NULL::text, p_classe_pharma_norm text DEFAULT NULL::text, p_limit integer DEFAULT 40)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $function$
DECLARE
  lim int := GREATEST(1, LEAST(coalesce(p_limit, 40), 100));
BEGIN
  IF NOT jeupharma.is_portail_admin() THEN
    RAISE EXCEPTION 'Réservé admin portail';
  END IF;

  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'id', x.id,
      'dci', x.dci,
      'noms', x.noms,
      'hospitalier', x.hospitalier,
      'complexe', x.complexe
    ))
    FROM (
      SELECT DISTINCT ON (m.id)
        m.id,
        coalesce(dci.valeur, '') AS dci,
        (
          SELECT string_agg(nc.valeur, ', ' ORDER BY mnc.ordre)
          FROM jeupharma.matrice_noms_commerciaux mnc
          JOIN jeupharma.noms_commerciaux nc ON nc.id = mnc.nom_commercial_id AND nc.actif
          WHERE mnc.matrice_id = m.id
        ) AS noms,
        m.hospitalier,
        m.complexe
      FROM jeupharma.matrice_medicaments m
      LEFT JOIN jeupharma.dcis dci ON dci.id = m.dci_id AND dci.actif
      WHERE m.statut IS DISTINCT FROM 'archive'
        AND (
          p_q IS NULL OR trim(p_q) = ''
          OR dci.valeur_norm ILIKE '%' || lower(trim(p_q)) || '%'
          OR EXISTS (
            SELECT 1 FROM jeupharma.matrice_noms_commerciaux mnc
            JOIN jeupharma.noms_commerciaux nc ON nc.id = mnc.nom_commercial_id
            WHERE mnc.matrice_id = m.id AND nc.valeur_norm ILIKE '%' || lower(trim(p_q)) || '%'
          )
        )
        AND (
          p_secteur_norm IS NULL OR trim(p_secteur_norm) = ''
          OR EXISTS (
            SELECT 1 FROM jeupharma.connaissances c
            JOIN jeupharma.secteurs_therapeutiques s ON s.id = c.entite_id
            WHERE c.matrice_id = m.id AND c.champ_code = 'secteur_therapeutique'
              AND c.statut = 'valide' AND s.valeur_norm = lower(trim(p_secteur_norm))
          )
        )
        AND (
          p_indication_norm IS NULL OR trim(p_indication_norm) = ''
          OR EXISTS (
            SELECT 1 FROM jeupharma.connaissances c
            JOIN jeupharma.indications ind ON ind.id = c.entite_id
            WHERE c.matrice_id = m.id AND c.champ_code = 'indications'
              AND c.statut = 'valide' AND ind.valeur_norm = lower(trim(p_indication_norm))
          )
        )
        AND (
          p_classe_ther_norm IS NULL OR trim(p_classe_ther_norm) = ''
          OR EXISTS (
            SELECT 1 FROM jeupharma.connaissances c
            JOIN jeupharma.classes_therapeutiques ct ON ct.id = c.entite_id
            WHERE c.matrice_id = m.id AND c.champ_code = 'classe_therapeutique'
              AND c.statut = 'valide' AND ct.valeur_norm = lower(trim(p_classe_ther_norm))
          )
        )
        AND (
          p_classe_pharma_norm IS NULL OR trim(p_classe_pharma_norm) = ''
          OR EXISTS (
            SELECT 1 FROM jeupharma.connaissances c
            JOIN jeupharma.classes_pharmacologiques cp ON cp.id = c.entite_id
            WHERE c.matrice_id = m.id AND c.champ_code = 'classe_pharmacologique'
              AND c.statut = 'valide' AND cp.valeur_norm = lower(trim(p_classe_pharma_norm))
          )
        )
      ORDER BY m.id
      LIMIT lim
    ) x
  ), '[]'::jsonb);
END;
$function$
;

CREATE OR REPLACE FUNCTION jeupharma.v2_connaissances_visibles(p_user uuid DEFAULT auth.uid(), p_parcours uuid DEFAULT NULL::uuid, p_module_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS TABLE(connaissance_id uuid, matrice_id uuid, champ_code text, entite_id uuid, texte text, texte_norm text, ordre integer, module_id uuid, libelle_pedagogique text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $function$
DECLARE
  v_parcours uuid;
  v_mode text;
BEGIN
  IF p_user IS NULL THEN
    RETURN;
  END IF;
  IF NOT jeupharma.has_jeupharma_access() AND NOT jeupharma.is_portail_admin() THEN
    RETURN;
  END IF;

  v_parcours := COALESCE(p_parcours, jeupharma.v2_parcours_actif(p_user));
  IF v_parcours IS NULL THEN
    RETURN;
  END IF;
  v_mode := jeupharma.v2_mode_contenu(v_parcours);

  IF v_mode = 'referentiel_valide' THEN
    RETURN QUERY
    SELECT c.id, c.matrice_id, c.champ_code, c.entite_id, c.texte, c.texte_norm, c.ordre,
           NULL::uuid, NULL::text
    FROM jeupharma.connaissances c
    JOIN jeupharma.matrice_medicaments m ON m.id = c.matrice_id AND m.statut = 'publie'
    WHERE c.statut = 'valide'
    ORDER BY c.matrice_id, c.champ_code, c.ordre;
    RETURN;
  END IF;

  RETURN QUERY
  WITH unlocked AS (
    SELECT d.module_id
    FROM jeupharma.v2_modules_debloques(p_user, v_parcours) d
    WHERE p_module_ids IS NULL OR d.module_id = ANY (p_module_ids)
  ),
  scope AS (
    SELECT DISTINCT s.module_id
    FROM unlocked u
    CROSS JOIN LATERAL jeupharma.v2_module_ancetres(u.module_id) s
  )
  SELECT c.id, c.matrice_id, c.champ_code, c.entite_id,
         COALESCE(pub.libelle_pedagogique, c.texte) AS texte,
         c.texte_norm, pub.ordre, pub.module_id, pub.libelle_pedagogique
  FROM jeupharma.publications_connaissances pub
  JOIN scope sc ON sc.module_id = pub.module_id
  JOIN jeupharma.connaissances c ON c.id = pub.connaissance_id AND c.statut = 'valide'
  JOIN jeupharma.matrice_medicaments m ON m.id = c.matrice_id AND m.statut = 'publie'
  WHERE pub.actif
  ORDER BY c.matrice_id, c.champ_code, pub.ordre;
END;
$function$
;

CREATE OR REPLACE FUNCTION jeupharma.v2_creer_modele_jeu(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $function$
DECLARE
  code text;
  row jeupharma.modeles_jeu%ROWTYPE;
  attempt int;
BEGIN
  IF NOT jeupharma.is_portail_admin() THEN
    RAISE EXCEPTION 'Réservé admin portail';
  END IF;

  FOR attempt IN 1..8 LOOP
    code := jeupharma.v2_gen_code_jeu();
    BEGIN
      INSERT INTO jeupharma.modeles_jeu (
        code_unique, type_jeu, titre, parcours_id, module_ids, mode,
        configuration_json, snapshot_json, en_pause, actif, created_by
      ) VALUES (
        code,
        p_payload->>'type_jeu',
        trim(p_payload->>'titre'),
        NULLIF(p_payload->>'parcours_id', '')::uuid,
        COALESCE(
          ARRAY(SELECT jsonb_array_elements_text(p_payload->'module_ids')::uuid),
          '{}'::uuid[]
        ),
        COALESCE(p_payload->>'mode', 'entrainement'),
        COALESCE(p_payload->'configuration_json', '{}'::jsonb),
        p_payload->'snapshot_json',
        COALESCE((p_payload->>'en_pause')::boolean, false),
        true,
        auth.uid()
      )
      RETURNING * INTO row;
      RETURN to_jsonb(row);
    EXCEPTION WHEN unique_violation THEN
      CONTINUE;
    END;
  END LOOP;
  RAISE EXCEPTION 'Impossible de générer un code unique';
END;
$function$
;

CREATE OR REPLACE FUNCTION jeupharma.v2_creer_module(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $function$
DECLARE
  row jeupharma.modules_cours%ROWTYPE;
  v_code text;
BEGIN
  IF NOT jeupharma.is_portail_admin() THEN
    RAISE EXCEPTION 'Reserve admin portail';
  END IF;
  v_code := lower(trim(both FROM regexp_replace(
    coalesce(p_payload->>'code', p_payload->>'titre'),
    '[^a-zA-Z0-9]+', '_', 'g'
  )));
  v_code := trim(both '_' FROM v_code);

  INSERT INTO jeupharma.modules_cours (
    parcours_id, parent_id, code, titre, resume, objectifs, ordre,
    publie, est_groupe, prerequis_module_id, created_by, version_publication
  ) VALUES (
    (p_payload->>'parcours_id')::uuid,
    nullif(p_payload->>'parent_id', '')::uuid,
    v_code,
    trim(p_payload->>'titre'),
    coalesce(p_payload->>'resume', ''),
    coalesce(p_payload->>'objectifs', ''),
    coalesce((p_payload->>'ordre')::int, 100),
    coalesce((p_payload->>'publie')::boolean, true),
    coalesce((p_payload->>'est_groupe')::boolean, false),
    nullif(p_payload->>'prerequis_module_id', '')::uuid,
    auth.uid(),
    1
  )
  RETURNING * INTO row;

  RETURN to_jsonb(row);
END;
$function$
;

CREATE OR REPLACE FUNCTION jeupharma.v2_creer_parcours(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $function$
DECLARE
  row jeupharma.parcours_apprentissage%ROWTYPE;
  v_code text;
BEGIN
  IF NOT jeupharma.is_portail_admin() THEN
    RAISE EXCEPTION 'Reserve admin portail';
  END IF;
  v_code := lower(trim(both FROM regexp_replace(
    coalesce(p_payload->>'code', p_payload->>'libelle'),
    '[^a-zA-Z0-9]+', '_', 'g'
  )));
  v_code := trim(both '_' FROM v_code);
  IF v_code = '' THEN RAISE EXCEPTION 'code invalide'; END IF;

  INSERT INTO jeupharma.parcours_apprentissage (
    code, libelle, description, niveau_lie, mode_contenu, ordre, actif, created_by
  ) VALUES (
    v_code,
    trim(p_payload->>'libelle'),
    coalesce(p_payload->>'description', ''),
    nullif(p_payload->>'niveau_lie', ''),
    coalesce(nullif(p_payload->>'mode_contenu', ''), 'publications'),
    coalesce((p_payload->>'ordre')::int, 50),
    coalesce((p_payload->>'actif')::boolean, true),
    auth.uid()
  )
  RETURNING * INTO row;

  RETURN to_jsonb(row);
END;
$function$
;

CREATE OR REPLACE FUNCTION jeupharma.v2_demander_parcours(p_parcours_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $function$
DECLARE
  row jeupharma.inscriptions_parcours%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT jeupharma.has_jeupharma_access() THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM jeupharma.parcours_apprentissage WHERE id = p_parcours_id AND actif
  ) THEN
    RAISE EXCEPTION 'Parcours introuvable';
  END IF;

  INSERT INTO jeupharma.inscriptions_parcours (
    user_id, parcours_id, actif, statut, demande_at, debut_at
  ) VALUES (
    auth.uid(), p_parcours_id, false, 'demande', now(), now()
  )
  ON CONFLICT (user_id, parcours_id) DO UPDATE SET
    statut = CASE
      WHEN jeupharma.inscriptions_parcours.statut = 'accepte' THEN 'accepte'
      WHEN jeupharma.inscriptions_parcours.statut = 'refuse' THEN 'demande'
      ELSE 'demande'
    END,
    actif = CASE
      WHEN jeupharma.inscriptions_parcours.statut = 'accepte' THEN true
      ELSE false
    END,
    demande_at = CASE
      WHEN jeupharma.inscriptions_parcours.statut = 'accepte' THEN jeupharma.inscriptions_parcours.demande_at
      ELSE now()
    END
  RETURNING * INTO row;

  RETURN to_jsonb(row);
END;
$function$
;

CREATE OR REPLACE FUNCTION jeupharma.v2_demarrer_ordonnance(p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $function$
DECLARE
  m jeupharma.modeles_jeu%ROWTYPE;
  cfg jsonb;
  regles jsonb;
  champs text[];
  picked uuid[] := '{}';
  rule jsonb;
  need int;
  class_id uuid;
  class_kind text;
  matrice_fixe uuid;
  candidates uuid[];
  pick uuid;
  snap jsonb := '[]'::jsonb;
  mid uuid;
  fiche jsonb;
  tid uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT jeupharma.has_jeupharma_access() THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  SELECT * INTO m FROM jeupharma.modeles_jeu
  WHERE code_unique = upper(trim(p_code))
    AND type_jeu = 'ordonnance' AND actif;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ordonnance introuvable'; END IF;
  IF m.en_pause THEN RAISE EXCEPTION 'Cette ordonnance est en pause'; END IF;

  cfg := coalesce(m.configuration_json, '{}'::jsonb);
  regles := coalesce(cfg->'regles', '[]'::jsonb);
  champs := coalesce(
    NULLIF(ARRAY(SELECT jsonb_array_elements_text(cfg->'champs')), '{}'::text[]),
    ARRAY['indications', 'contre_indications', 'effets_indesirables']::text[]
  );

  -- Si aucune règle : tirer depuis matrice_ids ou connaissances visibles
  IF jsonb_array_length(regles) = 0 THEN
    IF cfg ? 'matrice_ids'
       AND jsonb_typeof(cfg->'matrice_ids') = 'array'
       AND jsonb_array_length(cfg->'matrice_ids') > 0 THEN
      SELECT coalesce(array_agg(x.id), '{}') INTO picked
      FROM (
        SELECT id FROM (
          SELECT DISTINCT (jsonb_array_elements_text(cfg->'matrice_ids'))::uuid AS id
        ) d
        ORDER BY random()
        LIMIT 3
      ) x;
    ELSE
      SELECT coalesce(array_agg(x.id), '{}') INTO picked
      FROM (
        SELECT id FROM (
          SELECT DISTINCT cv.matrice_id AS id
          FROM jeupharma.v2_connaissances_visibles(auth.uid(), m.parcours_id, m.module_ids) cv
        ) d
        ORDER BY random()
        LIMIT 3
      ) x;
    END IF;
  END IF;

  FOR rule IN SELECT * FROM jsonb_array_elements(regles)
  LOOP
    IF rule->>'type' = 'matrice' THEN
      matrice_fixe := (rule->>'matrice_id')::uuid;
      IF matrice_fixe IS NOT NULL AND NOT (matrice_fixe = ANY (picked)) THEN
        picked := array_append(picked, matrice_fixe);
      END IF;
    ELSIF rule->>'type' IN ('classe_therapeutique', 'classe_pharmacologique') THEN
      class_kind := rule->>'type';
      class_id := (rule->>'classe_id')::uuid;
      need := GREATEST(1, COALESCE((rule->>'nombre')::int, 1));
      IF class_kind = 'classe_therapeutique' THEN
        SELECT coalesce(array_agg(x.id), '{}') INTO candidates
        FROM (
          SELECT id FROM (
            SELECT DISTINCT cv.matrice_id AS id
            FROM jeupharma.v2_connaissances_visibles(auth.uid(), m.parcours_id, m.module_ids) cv
            WHERE cv.champ_code = 'classe_therapeutique'
              AND cv.entite_id = class_id
              AND NOT (cv.matrice_id = ANY (picked))
          ) d
          ORDER BY random()
          LIMIT need
        ) x;
      ELSE
        SELECT coalesce(array_agg(x.id), '{}') INTO candidates
        FROM (
          SELECT id FROM (
            SELECT DISTINCT cv.matrice_id AS id
            FROM jeupharma.v2_connaissances_visibles(auth.uid(), m.parcours_id, m.module_ids) cv
            WHERE cv.champ_code = 'classe_pharmacologique'
              AND cv.entite_id = class_id
              AND NOT (cv.matrice_id = ANY (picked))
          ) d
          ORDER BY random()
          LIMIT need
        ) x;
      END IF;
      IF coalesce(array_length(candidates, 1), 0) < need THEN
        SELECT coalesce(array_agg(x.id), '{}') INTO candidates
        FROM (
          SELECT id FROM (
            SELECT DISTINCT cv.matrice_id AS id
            FROM jeupharma.v2_connaissances_visibles(auth.uid(), m.parcours_id, m.module_ids) cv
            WHERE NOT (cv.matrice_id = ANY (picked))
          ) d
          ORDER BY random()
          LIMIT need
        ) x;
      END IF;
      IF coalesce(array_length(candidates, 1), 0) < need
         AND cfg ? 'matrice_ids'
         AND jsonb_typeof(cfg->'matrice_ids') = 'array'
         AND jsonb_array_length(cfg->'matrice_ids') > 0 THEN
        SELECT coalesce(array_agg(x.id), '{}') INTO candidates
        FROM (
          SELECT id FROM (
            SELECT DISTINCT (jsonb_array_elements_text(cfg->'matrice_ids'))::uuid AS id
          ) d
          WHERE NOT (d.id = ANY (picked))
          ORDER BY random()
          LIMIT need
        ) x;
      END IF;
      IF coalesce(array_length(candidates, 1), 0) < need THEN
        RAISE EXCEPTION 'Pool insuffisant pour la règle % (besoin %, dispo %)',
          class_kind, need, coalesce(array_length(candidates, 1), 0);
      END IF;
      FOREACH pick IN ARRAY candidates LOOP
        picked := array_append(picked, pick);
      END LOOP;
    END IF;
  END LOOP;

  IF coalesce(array_length(picked, 1), 0) = 0 THEN
    RAISE EXCEPTION 'Aucune molécule sélectionnée';
  END IF;

  FOREACH mid IN ARRAY picked LOOP
    fiche := jeupharma.v2_fiche_resolue(mid, m.parcours_id, m.module_ids);
    IF fiche IS NULL THEN
      CONTINUE;
    END IF;
    fiche := fiche || jsonb_build_object(
      'champs', (
        SELECT coalesce(jsonb_object_agg(k, fiche->'champs'->k), '{}'::jsonb)
        FROM unnest(champs) k
        WHERE fiche->'champs' ? k
      )
    );
    snap := snap || jsonb_build_array(fiche);
  END LOOP;

  IF jsonb_array_length(snap) = 0 THEN
    RAISE EXCEPTION 'Aucune fiche résolue pour cette ordonnance';
  END IF;

  INSERT INTO jeupharma.tentatives_jeu (
    modele_id, utilisateur_id, mode, snapshot_json
  ) VALUES (
    m.id, auth.uid(), m.mode,
    jsonb_build_object(
      'type', 'ordonnance',
      'champs', to_jsonb(champs),
      'molecules', snap,
      'meta', jsonb_build_object(
        'parcours_id', m.parcours_id,
        'module_ids', to_jsonb(m.module_ids),
        'modele_code', m.code_unique
      )
    )
  )
  RETURNING id INTO tid;

  RETURN jsonb_build_object(
    'tentative_id', tid,
    'modele_id', m.id,
    'code_unique', m.code_unique,
    'titre', m.titre,
    'mode', m.mode,
    'champs', to_jsonb(champs),
    'molecules', (
      SELECT coalesce(jsonb_agg(
        jsonb_build_object(
          'id', mol->>'id',
          'dci', mol->>'dci',
          'noms_commerciaux', mol->'noms_commerciaux'
        )
      ), '[]'::jsonb)
      FROM jsonb_array_elements(snap) mol
    )
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION jeupharma.v2_depublier_connaissances(p_module_id uuid, p_connaissance_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $function$
DECLARE
  n int;
BEGIN
  IF NOT jeupharma.is_portail_admin() THEN
    RAISE EXCEPTION 'Réservé admin portail';
  END IF;
  UPDATE jeupharma.publications_connaissances
  SET actif = false
  WHERE module_id = p_module_id
    AND connaissance_id = ANY (p_connaissance_ids);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN jsonb_build_object('module_id', p_module_id, 'depubliees', n);
END;
$function$
;

CREATE OR REPLACE FUNCTION jeupharma.v2_enregistrer_lecture(p_module_id uuid, p_pct integer DEFAULT 100)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $function$
DECLARE uid uuid := auth.uid(); m jeupharma.modules_cours%ROWTYPE; v_pct int;
BEGIN
  IF uid IS NULL OR NOT jeupharma.has_jeupharma_access() THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  SELECT * INTO m FROM jeupharma.modules_cours WHERE id = p_module_id;
  IF NOT FOUND OR m.est_groupe OR NOT m.publie THEN RAISE EXCEPTION 'Leçon introuvable'; END IF;
  IF NOT EXISTS (SELECT 1 FROM jeupharma.inscriptions_parcours i WHERE i.user_id = uid AND i.parcours_id = m.parcours_id AND i.statut = 'accepte' AND i.actif) THEN RAISE EXCEPTION 'Parcours non accepté'; END IF;
  IF jeupharma.v2_module_bloque_par(uid, p_module_id) IS NOT NULL THEN RAISE EXCEPTION 'Leçon verrouillée'; END IF;
  v_pct := least(100, greatest(0, coalesce(p_pct, 0)));
  INSERT INTO jeupharma.progression_modules (user_id, module_id, statut, debloque_at, lecture_pct, lu_at, updated_at)
  VALUES (uid, p_module_id, 'debloque', now(), v_pct, CASE WHEN v_pct >= 95 THEN now() END, now())
  ON CONFLICT (user_id, module_id) DO UPDATE SET lecture_pct = greatest(jeupharma.progression_modules.lecture_pct, EXCLUDED.lecture_pct), lu_at = coalesce(jeupharma.progression_modules.lu_at, EXCLUDED.lu_at), debloque_at = coalesce(jeupharma.progression_modules.debloque_at, now()), updated_at = now();
  PERFORM jeupharma.v2__sync_progression(uid, m.parcours_id);
  RETURN jsonb_build_object('detail', jeupharma.v2_module_detail(uid, p_module_id));
END; $function$
;

CREATE OR REPLACE FUNCTION jeupharma.v2_fiche_resolue(p_matrice_id uuid, p_parcours uuid DEFAULT NULL::uuid, p_module_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $function$
DECLARE
  uid uuid := auth.uid();
  base jsonb;
  champs jsonb;
BEGIN
  IF uid IS NULL OR NOT jeupharma.has_jeupharma_access() THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  SELECT jsonb_build_object(
    'id', m.id,
    'dci', d.valeur,
    'hospitalier', m.hospitalier,
    'complexe', m.complexe,
    'noms_commerciaux', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', n.id, 'valeur', n.valeur) ORDER BY mn.ordre)
      FROM jeupharma.matrice_noms_commerciaux mn
      JOIN jeupharma.noms_commerciaux n ON n.id = mn.nom_commercial_id AND n.actif
      WHERE mn.matrice_id = m.id
    ), '[]'::jsonb)
  )
  INTO base
  FROM jeupharma.matrice_medicaments m
  JOIN jeupharma.dcis d ON d.id = m.dci_id
  WHERE m.id = p_matrice_id AND m.statut = 'publie';

  IF base IS NULL THEN
    RETURN NULL;
  END IF;

  -- Si aucune connaissance visible pour cette fiche → inaccessible
  IF NOT EXISTS (
    SELECT 1 FROM jeupharma.v2_connaissances_visibles(uid, p_parcours, p_module_ids) cv
    WHERE cv.matrice_id = p_matrice_id
  ) THEN
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
$function$
;

CREATE OR REPLACE FUNCTION jeupharma.v2_gen_code_jeu()
 RETURNS text
 LANGUAGE plpgsql
AS $function$
DECLARE
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  out text := 'JP-';
  i int;
BEGIN
  FOR i IN 1..5 LOOP
    out := out || substr(chars, 1 + floor(random() * length(chars))::int, 1);
  END LOOP;
  RETURN out;
END;
$function$
;

CREATE OR REPLACE FUNCTION jeupharma.v2_lecon_joueur(p_module_id uuid, p_preview boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $function$
DECLARE m jeupharma.modules_cours%ROWTYPE; uid uuid := auth.uid(); ok boolean; bp jsonb;
BEGIN
  IF uid IS NULL OR NOT jeupharma.has_jeupharma_access() THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  SELECT * INTO m FROM jeupharma.modules_cours WHERE id = p_module_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Leçon introuvable'; END IF;
  IF coalesce(p_preview, false) AND jeupharma.is_portail_admin() THEN
    ok := true;
  ELSE
    ok := m.publie AND NOT m.est_groupe AND EXISTS (SELECT 1 FROM jeupharma.inscriptions_parcours i WHERE i.user_id = uid AND i.parcours_id = m.parcours_id AND i.statut = 'accepte' AND i.actif);
    IF ok THEN bp := jeupharma.v2_module_bloque_par(uid, p_module_id); ok := bp IS NULL; END IF;
  END IF;
  IF NOT ok THEN RAISE EXCEPTION 'Leçon verrouillée'; END IF;
  RETURN jsonb_build_object(
    'module', to_jsonb(m) || jsonb_build_object('maj_at', coalesce(m.contenu_maj_at, m.updated_at)),
    'detail', jeupharma.v2_module_detail(uid, p_module_id),
    'blocs', coalesce((SELECT jsonb_agg(to_jsonb(b) ORDER BY b.ordre, b.created_at) FROM jeupharma.module_blocs b WHERE b.module_id = p_module_id AND b.visible), '[]'::jsonb)
  );
END; $function$
;

CREATE OR REPLACE FUNCTION jeupharma.v2_lister_blocs(p_module_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR (NOT jeupharma.has_jeupharma_access() AND NOT jeupharma.is_portail_admin()) THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;
  RETURN coalesce((
    SELECT jsonb_agg(to_jsonb(b) ORDER BY b.ordre, b.created_at)
    FROM jeupharma.module_blocs b
    WHERE b.module_id = p_module_id
      AND (b.visible OR jeupharma.is_portail_admin())
  ), '[]'::jsonb);
END;
$function$
;

CREATE OR REPLACE FUNCTION jeupharma.v2_lister_connaissances_matrice(p_matrice_id uuid, p_module_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $function$
BEGIN
  IF NOT jeupharma.is_portail_admin() THEN
    RAISE EXCEPTION 'Réservé admin portail';
  END IF;
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'connaissance_id', c.id,
      'champ_code', c.champ_code,
      'texte', c.texte,
      'entite_id', c.entite_id,
      'ordre', c.ordre,
      'publie', EXISTS (
        SELECT 1 FROM jeupharma.publications_connaissances pc
        WHERE pc.module_id = p_module_id
          AND pc.connaissance_id = c.id
          AND pc.actif
      )
    ) ORDER BY c.champ_code, c.ordre, c.texte)
    FROM jeupharma.connaissances c
    WHERE c.matrice_id = p_matrice_id AND c.statut = 'valide'
  ), '[]'::jsonb);
END;
$function$
;

CREATE OR REPLACE FUNCTION jeupharma.v2_lister_demandes_parcours()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $function$
BEGIN
  IF NOT jeupharma.is_portail_admin() THEN
    RAISE EXCEPTION 'Réservé admin portail';
  END IF;
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'id', i.id,
      'user_id', i.user_id,
      'parcours_id', i.parcours_id,
      'statut', i.statut,
      'demande_at', i.demande_at,
      'libelle', pa.libelle,
      'code', pa.code,
      'display_name', coalesce(pr.display_name, pr.email, i.user_id::text)
    ) ORDER BY i.demande_at DESC NULLS LAST)
    FROM jeupharma.inscriptions_parcours i
    JOIN jeupharma.parcours_apprentissage pa ON pa.id = i.parcours_id
    LEFT JOIN portail.profiles pr ON pr.id = i.user_id
    WHERE i.statut = 'demande'
  ), '[]'::jsonb);
END;
$function$
;

CREATE OR REPLACE FUNCTION jeupharma.v2_lister_medicaments(p_parcours uuid DEFAULT NULL::uuid, p_module_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $function$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL OR NOT jeupharma.has_jeupharma_access() THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(row_to_json(x)::jsonb ORDER BY x.dci, x.noms)
    FROM (
      SELECT
        m.id,
        d.valeur AS dci,
        COALESCE((
          SELECT string_agg(n.valeur, ', ' ORDER BY mn.ordre, n.valeur)
          FROM jeupharma.matrice_noms_commerciaux mn
          JOIN jeupharma.noms_commerciaux n ON n.id = mn.nom_commercial_id AND n.actif
          WHERE mn.matrice_id = m.id
        ), '') AS noms,
        m.hospitalier,
        m.complexe,
        count(DISTINCT cv.connaissance_id) AS nb_connaissances
      FROM jeupharma.matrice_medicaments m
      JOIN jeupharma.dcis d ON d.id = m.dci_id
      JOIN (
        SELECT DISTINCT matrice_id, connaissance_id
        FROM jeupharma.v2_connaissances_visibles(uid, p_parcours, p_module_ids)
      ) cv ON cv.matrice_id = m.id
      WHERE m.statut = 'publie'
      GROUP BY m.id, d.valeur, m.hospitalier, m.complexe
    ) x
  ), '[]'::jsonb);
END;
$function$
;

CREATE OR REPLACE FUNCTION jeupharma.v2_lister_mes_inscriptions()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT jeupharma.has_jeupharma_access() THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'id', i.id,
      'parcours_id', i.parcours_id,
      'statut', i.statut,
      'actif', i.actif,
      'demande_at', i.demande_at,
      'code', pa.code,
      'libelle', pa.libelle,
      'description', pa.description,
      'ordre', pa.ordre
    ) ORDER BY pa.ordre)
    FROM jeupharma.inscriptions_parcours i
    JOIN jeupharma.parcours_apprentissage pa ON pa.id = i.parcours_id
    WHERE i.user_id = auth.uid() AND pa.actif
  ), '[]'::jsonb);
END;
$function$
;

CREATE OR REPLACE FUNCTION jeupharma.v2_maj_parcours_criteres(p_parcours_id uuid, p_prerequis_id uuid, p_criteres jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $function$
DECLARE row jeupharma.parcours_apprentissage%ROWTYPE; cyc boolean;
BEGIN
  IF NOT jeupharma.is_portail_admin() THEN RAISE EXCEPTION 'Réservé admin portail'; END IF;
  IF p_prerequis_id IS NOT NULL THEN
    IF p_prerequis_id = p_parcours_id THEN RAISE EXCEPTION 'Un parcours ne peut pas dépendre de lui-même'; END IF;
    WITH RECURSIVE up AS (
      SELECT p.id, p.prerequis_parcours_id FROM jeupharma.parcours_apprentissage p WHERE p.id = p_prerequis_id
      UNION
      SELECT p.id, p.prerequis_parcours_id FROM jeupharma.parcours_apprentissage p JOIN up ON p.id = up.prerequis_parcours_id
    )
    SELECT EXISTS (SELECT 1 FROM up WHERE up.id = p_parcours_id) INTO cyc;
    IF cyc THEN RAISE EXCEPTION 'Prérequis circulaire entre parcours'; END IF;
  END IF;
  UPDATE jeupharma.parcours_apprentissage SET prerequis_parcours_id = p_prerequis_id, criteres_json = jeupharma.v2__clean_criteres(p_criteres), updated_at = now() WHERE id = p_parcours_id RETURNING * INTO row;
  IF NOT FOUND THEN RAISE EXCEPTION 'Parcours introuvable'; END IF;
  RETURN to_jsonb(row);
END; $function$
;

CREATE OR REPLACE FUNCTION jeupharma.v2_mode_contenu(p_parcours uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'jeupharma', 'pg_temp'
AS $function$
  SELECT COALESCE(
    (SELECT mode_contenu FROM jeupharma.parcours_apprentissage WHERE id = p_parcours),
    'publications'
  );
$function$
;

CREATE OR REPLACE FUNCTION jeupharma.v2_module_ancetres(p_module uuid)
 RETURNS TABLE(module_id uuid, profondeur integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'jeupharma', 'pg_temp'
AS $function$
  WITH RECURSIVE climb AS (
    SELECT m.id AS module_id, m.parent_id, 0 AS profondeur
    FROM jeupharma.modules_cours m
    WHERE m.id = p_module
    UNION ALL
    SELECT p.id, p.parent_id, c.profondeur + 1
    FROM jeupharma.modules_cours p
    JOIN climb c ON c.parent_id = p.id
  )
  SELECT climb.module_id, climb.profondeur FROM climb;
$function$
;

CREATE OR REPLACE FUNCTION jeupharma.v2_module_bloque_par(p_user uuid, p_module uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $function$
DECLARE v_parcours uuid; pd jsonb; r record;
BEGIN
  SELECT parcours_id INTO v_parcours FROM jeupharma.modules_cours WHERE id = p_module;
  IF NOT FOUND THEN RETURN NULL; END IF;
  pd := jeupharma.v2_parcours_detail(p_user, v_parcours);
  IF coalesce((pd->>'verrouille')::boolean, false) THEN RETURN pd->'bloque_par'; END IF;
  FOR r IN
    SELECT pre.id AS pre_id, pre.titre AS pre_titre
    FROM jeupharma.v2_module_ancetres(p_module) a
    JOIN jeupharma.modules_cours c ON c.id = a.module_id
    JOIN jeupharma.modules_cours pre ON pre.id = c.prerequis_module_id AND pre.publie
    ORDER BY a.profondeur
  LOOP
    IF NOT jeupharma.v2_module_valide(p_user, r.pre_id) THEN
      RETURN jsonb_build_object('type', 'module', 'module_id', r.pre_id, 'titre', r.pre_titre, 'detail', jeupharma.v2_module_detail(p_user, r.pre_id));
    END IF;
  END LOOP;
  RETURN NULL;
END; $function$
;

CREATE OR REPLACE FUNCTION jeupharma.v2_module_detail(p_user uuid, p_module uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $function$
DECLARE m jeupharma.modules_cours%ROWTYPE; pm jeupharma.progression_modules%ROWTYPE; crit jsonb; logique text; jx jsonb; n_j int; k_j int; somme numeric; max_part numeric; lecture_req boolean; n int; k int; part_lect numeric; valide boolean; pct numeric; nb int := 0; nbv int := 0; sum_pct numeric := 0; leaf record; dl jsonb; jeux_ok boolean;
BEGIN
  SELECT * INTO m FROM jeupharma.modules_cours WHERE id = p_module;
  IF NOT FOUND THEN RETURN NULL; END IF;
  crit := coalesce(m.criteres_json, '{}'::jsonb);
  logique := CASE WHEN crit->>'logique' = 'ou' THEN 'ou' ELSE 'et' END;
  jx := jeupharma.v2__criteres_jeux(p_user, crit);
  n_j := (jx->>'n')::int; k_j := (jx->>'ok')::int; somme := (jx->>'somme')::numeric; max_part := (jx->>'max_part')::numeric;
  IF m.est_groupe THEN
    FOR leaf IN
      WITH RECURSIVE sub AS (
        SELECT c.id, c.est_groupe, c.publie FROM jeupharma.modules_cours c WHERE c.parent_id = p_module
        UNION
        SELECT c.id, c.est_groupe, c.publie FROM jeupharma.modules_cours c JOIN sub ON c.parent_id = sub.id
      )
      SELECT sub.id FROM sub WHERE sub.publie AND NOT sub.est_groupe
    LOOP
      dl := jeupharma.v2_module_detail(p_user, leaf.id);
      nb := nb + 1;
      sum_pct := sum_pct + coalesce((dl->>'pct')::numeric, 0);
      IF (dl->>'valide')::boolean THEN nbv := nbv + 1; END IF;
    END LOOP;
    jeux_ok := n_j = 0 OR (CASE WHEN logique = 'ou' THEN k_j >= 1 ELSE k_j = n_j END);
    valide := (nbv = nb) AND jeux_ok;
    pct := CASE WHEN valide THEN 100 WHEN nb = 0 THEN 0 ELSE round(sum_pct / nb) END;
    RETURN jsonb_build_object('est_groupe', true, 'valide', valide, 'pct', pct, 'nb_lecons', nb, 'nb_valides', nbv, 'jeux', jx->'liste', 'logique', logique);
  END IF;
  SELECT * INTO pm FROM jeupharma.progression_modules WHERE user_id = p_user AND module_id = p_module;
  lecture_req := CASE WHEN jsonb_typeof(crit->'lecture') = 'boolean' THEN (crit->>'lecture')::boolean ELSE true END;
  n := (CASE WHEN lecture_req THEN 1 ELSE 0 END) + n_j;
  k := (CASE WHEN lecture_req AND pm.lu_at IS NOT NULL THEN 1 ELSE 0 END) + k_j;
  valide := n = 0 OR (CASE WHEN logique = 'ou' THEN k >= 1 ELSE k = n END);
  part_lect := CASE WHEN pm.lu_at IS NOT NULL THEN 1 ELSE coalesce(pm.lecture_pct, 0) / 100.0 END;
  IF valide THEN pct := 100;
  ELSIF logique = 'ou' THEN pct := round(100 * greatest(CASE WHEN lecture_req THEN part_lect ELSE 0 END, max_part));
  ELSE pct := round(100 * ((CASE WHEN lecture_req THEN part_lect ELSE 0 END) + somme) / n);
  END IF;
  RETURN jsonb_build_object('est_groupe', false, 'lecture_requise', lecture_req, 'lu', pm.lu_at IS NOT NULL, 'lecture_pct', coalesce(pm.lecture_pct, 0), 'jeux', jx->'liste', 'logique', logique, 'valide', valide, 'pct', pct);
END; $function$
;

CREATE OR REPLACE FUNCTION jeupharma.v2_module_valide(p_user uuid, p_module uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $function$
  SELECT coalesce((jeupharma.v2_module_detail(p_user, p_module)->>'valide')::boolean, true);
$function$
;

CREATE OR REPLACE FUNCTION jeupharma.v2_modules_debloques(p_user uuid DEFAULT auth.uid(), p_parcours uuid DEFAULT NULL::uuid)
 RETURNS TABLE(module_id uuid, ordre integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $function$
  SELECT m.id, m.ordre FROM jeupharma.modules_cours m
  WHERE m.parcours_id = COALESCE(p_parcours, jeupharma.v2_parcours_actif(p_user)) AND m.publie AND NOT m.est_groupe
    AND jeupharma.v2_module_bloque_par(p_user, m.id) IS NULL;
$function$
;

CREATE OR REPLACE FUNCTION jeupharma.v2_modules_scope(p_module_ids uuid[])
 RETURNS TABLE(module_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'jeupharma', 'pg_temp'
AS $function$
  SELECT DISTINCT a.module_id
  FROM unnest(COALESCE(p_module_ids, '{}'::uuid[])) AS mid
  CROSS JOIN LATERAL jeupharma.v2_module_ancetres(mid) a;
$function$
;

CREATE OR REPLACE FUNCTION jeupharma.v2_mon_espace()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $function$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL OR NOT jeupharma.has_jeupharma_access() THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  RETURN jsonb_build_object(
    'inscriptions', coalesce((
      SELECT jsonb_agg(e || jsonb_build_object('pct', CASE WHEN e->>'statut' = 'accepte' THEN det.d->'pct' END, 'nb_lecons', det.d->'nb_lecons', 'nb_valides', det.d->'nb_valides', 'valide', det.d->'valide', 'verrouille', det.d->'verrouille', 'bloque_par', det.d->'bloque_par', 'maj_at', det.d->'maj_at'))
      FROM jsonb_array_elements(jeupharma.v2_lister_mes_inscriptions()) e
      CROSS JOIN LATERAL (SELECT jeupharma.v2_parcours_detail(uid, (e->>'parcours_id')::uuid) AS d) det
    ), '[]'::jsonb),
    'parcours', coalesce((
      SELECT jsonb_agg(jeupharma.v2_progression_parcours(i.parcours_id) ORDER BY pa.ordre)
      FROM jeupharma.inscriptions_parcours i JOIN jeupharma.parcours_apprentissage pa ON pa.id = i.parcours_id AND pa.actif
      WHERE i.user_id = uid AND i.statut = 'accepte' AND i.actif
    ), '[]'::jsonb),
    'scores', coalesce((
      SELECT jsonb_agg(x.o ORDER BY x.ts DESC NULLS LAST)
      FROM (
        SELECT t.termine_at AS ts, jsonb_build_object('id', t.id, 'modele_id', t.modele_id, 'parcours_id', mj.parcours_id, 'titre', mj.titre, 'type_jeu', mj.type_jeu, 'code_unique', mj.code_unique, 'score_obtenu', t.score_obtenu, 'score_max', t.score_max, 'termine_at', t.termine_at) AS o
        FROM jeupharma.tentatives_jeu t JOIN jeupharma.modeles_jeu mj ON mj.id = t.modele_id
        WHERE t.utilisateur_id = uid AND t.termine_at IS NOT NULL
        ORDER BY t.termine_at DESC LIMIT 200
      ) x
    ), '[]'::jsonb),
    'progression', coalesce((
      SELECT jsonb_agg(jsonb_build_object('module_id', pm.module_id, 'statut', pm.statut, 'titre', mc.titre, 'parcours_id', mc.parcours_id, 'lecture_pct', pm.lecture_pct))
      FROM jeupharma.progression_modules pm JOIN jeupharma.modules_cours mc ON mc.id = pm.module_id WHERE pm.user_id = uid
    ), '[]'::jsonb)
  );
END; $function$
;

CREATE OR REPLACE FUNCTION jeupharma.v2_noter_ordonnance(p_tentative_id uuid, p_score_obtenu numeric, p_score_max numeric, p_details jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $function$
DECLARE
  t jeupharma.tentatives_jeu%ROWTYPE;
BEGIN
  SELECT * INTO t FROM jeupharma.tentatives_jeu
  WHERE id = p_tentative_id AND utilisateur_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Tentative introuvable'; END IF;
  IF t.revele_at IS NULL THEN
    RAISE EXCEPTION 'Révélez d’abord les réponses';
  END IF;
  IF p_score_obtenu IS NULL OR p_score_max IS NULL OR p_score_max <= 0 THEN
    RAISE EXCEPTION 'Score invalide';
  END IF;
  IF p_score_obtenu < 0 OR p_score_obtenu > p_score_max THEN
    RAISE EXCEPTION 'Score hors bornes';
  END IF;

  UPDATE jeupharma.tentatives_jeu
  SET score_obtenu = p_score_obtenu,
      score_max = p_score_max,
      details_json = coalesce(p_details, '[]'::jsonb),
      termine_at = now()
  WHERE id = t.id
  RETURNING * INTO t;

  RETURN jsonb_build_object(
    'tentative_id', t.id,
    'score_obtenu', t.score_obtenu,
    'score_max', t.score_max
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION jeupharma.v2_nouveau_tirage_quiz(p_modele_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $function$
DECLARE
  m jeupharma.modeles_jeu%ROWTYPE;
  cfg jsonb;
  nb int;
  champs text[];
  pool uuid[];
  tid uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT jeupharma.has_jeupharma_access() THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  SELECT * INTO m FROM jeupharma.modeles_jeu
  WHERE id = p_modele_id AND type_jeu = 'quiz' AND actif;
  IF NOT FOUND THEN RAISE EXCEPTION 'Quiz introuvable'; END IF;
  IF m.en_pause THEN RAISE EXCEPTION 'Quiz en pause'; END IF;
  IF m.mode = 'evaluation' THEN
    RAISE EXCEPTION 'Nouveau tirage réservé à l’entraînement';
  END IF;

  cfg := coalesce(m.configuration_json, '{}'::jsonb);
  nb := GREATEST(1, COALESCE((cfg->>'nb_questions')::int, 10));
  champs := coalesce(
    NULLIF(ARRAY(SELECT jsonb_array_elements_text(cfg->'champs_interroges')), '{}'::text[]),
    ARRAY['classe_pharmacologique']::text[]
  );

  IF cfg ? 'matrice_ids'
     AND jsonb_typeof(cfg->'matrice_ids') = 'array'
     AND jsonb_array_length(cfg->'matrice_ids') > 0 THEN
    pool := ARRAY(SELECT jsonb_array_elements_text(cfg->'matrice_ids')::uuid);
  ELSE
    SELECT coalesce(array_agg(DISTINCT cv.matrice_id), '{}'::uuid[])
      INTO pool
    FROM jeupharma.v2_connaissances_visibles(auth.uid(), m.parcours_id, m.module_ids) cv;
  END IF;

  IF coalesce(cardinality(pool), 0) = 0 THEN
    RAISE EXCEPTION 'Aucune molécule disponible pour ce quiz (parcours / modules / publications)';
  END IF;

  INSERT INTO jeupharma.tentatives_jeu (
    modele_id, utilisateur_id, mode, snapshot_json
  ) VALUES (
    m.id, auth.uid(), 'entrainement',
    jsonb_build_object(
      'type', 'quiz_tirage',
      'nb_questions', nb,
      'champs_interroges', to_jsonb(champs),
      'matrice_ids', to_jsonb(pool),
      'nb_propositions', COALESCE((cfg->>'nb_propositions')::int, 3),
      'meta', jsonb_build_object('parcours_id', m.parcours_id, 'parent_modele', m.code_unique)
    )
  )
  RETURNING id INTO tid;

  RETURN jsonb_build_object(
    'tentative_id', tid,
    'modele_id', m.id,
    'code_unique', m.code_unique,
    'titre', m.titre,
    'snapshot', (SELECT snapshot_json FROM jeupharma.tentatives_jeu WHERE id = tid)
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION jeupharma.v2_parcours_actif(p_user uuid DEFAULT auth.uid())
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $function$
  SELECT COALESCE(
    (SELECT p.parcours_id
       FROM jeupharma.profil_apprentissage p
       JOIN jeupharma.inscriptions_parcours i
         ON i.user_id = p.user_id
        AND i.parcours_id = p.parcours_id
        AND i.statut = 'accepte'
        AND i.actif
      WHERE p.user_id = p_user AND p.parcours_id IS NOT NULL),
    (SELECT i.parcours_id
       FROM jeupharma.inscriptions_parcours i
       JOIN jeupharma.parcours_apprentissage pa ON pa.id = i.parcours_id AND pa.actif
      WHERE i.user_id = p_user AND i.actif AND i.statut = 'accepte'
      ORDER BY i.debut_at DESC
      LIMIT 1)
  );
$function$
;

CREATE OR REPLACE FUNCTION jeupharma.v2_parcours_detail(p_user uuid, p_parcours uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $function$
DECLARE pa jeupharma.parcours_apprentissage%ROWTYPE; pre jeupharma.parcours_apprentissage%ROWTYPE; st jsonb; pst jsonb; locked boolean := false; bp jsonb := NULL;
BEGIN
  SELECT * INTO pa FROM jeupharma.parcours_apprentissage WHERE id = p_parcours;
  IF NOT FOUND THEN RETURN NULL; END IF;
  st := jeupharma.v2__parcours_stats(p_user, p_parcours);
  IF pa.prerequis_parcours_id IS NOT NULL THEN
    SELECT * INTO pre FROM jeupharma.parcours_apprentissage WHERE id = pa.prerequis_parcours_id AND actif;
    IF FOUND THEN
      pst := jeupharma.v2__parcours_stats(p_user, pre.id);
      IF NOT (pst->>'valide')::boolean THEN
        locked := true;
        bp := jsonb_build_object('type', 'parcours', 'parcours_id', pre.id, 'titre', pre.libelle, 'pct', pst->'pct', 'min_pct', pst->'progression_min_pct', 'jeux', pst->'jeux');
      END IF;
    END IF;
  END IF;
  RETURN st || jsonb_build_object('verrouille', locked, 'bloque_par', bp);
END; $function$
;

CREATE OR REPLACE FUNCTION jeupharma.v2_parcours_liste()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $function$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL OR NOT jeupharma.has_jeupharma_access() THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
        'id', pa.id, 'code', pa.code, 'libelle', pa.libelle, 'description', pa.description, 'ordre', pa.ordre, 'statut', i.statut,
        'maj_at', det.d->'maj_at', 'nb_lecons', det.d->'nb_lecons',
        'verrouille', coalesce((det.d->>'verrouille')::boolean, false), 'bloque_par', det.d->'bloque_par',
        'pct', CASE WHEN i.statut = 'accepte' THEN det.d->'pct' END, 'nb_valides', CASE WHEN i.statut = 'accepte' THEN det.d->'nb_valides' END
      ) ORDER BY pa.ordre)
    FROM jeupharma.parcours_apprentissage pa
    LEFT JOIN jeupharma.inscriptions_parcours i ON i.user_id = uid AND i.parcours_id = pa.id
    CROSS JOIN LATERAL (SELECT jeupharma.v2_parcours_detail(uid, pa.id) AS d) det
    WHERE pa.actif
  ), '[]'::jsonb);
END; $function$
;

CREATE OR REPLACE FUNCTION jeupharma.v2_parcours_verrouille(p_user uuid, p_parcours uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $function$
  SELECT coalesce((jeupharma.v2_parcours_detail(p_user, p_parcours)->>'verrouille')::boolean, false);
$function$
;

CREATE OR REPLACE FUNCTION jeupharma.v2_progression_parcours(p_parcours uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $function$
DECLARE uid uuid := auth.uid(); v_parcours uuid; pa jeupharma.parcours_apprentissage%ROWTYPE;
BEGIN
  IF uid IS NULL OR NOT jeupharma.has_jeupharma_access() THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  v_parcours := COALESCE(p_parcours, jeupharma.v2_parcours_actif(uid));
  IF v_parcours IS NULL THEN RETURN jsonb_build_object('parcours_id', null, 'modules', '[]'::jsonb); END IF;
  SELECT * INTO pa FROM jeupharma.parcours_apprentissage WHERE id = v_parcours;
  IF NOT FOUND THEN RETURN jsonb_build_object('parcours_id', null, 'modules', '[]'::jsonb); END IF;
  IF NOT jeupharma.is_portail_admin() AND NOT EXISTS (SELECT 1 FROM jeupharma.inscriptions_parcours i WHERE i.user_id = uid AND i.parcours_id = v_parcours AND i.statut = 'accepte' AND i.actif) THEN
    RETURN jsonb_build_object('parcours_id', v_parcours, 'modules', '[]'::jsonb);
  END IF;
  PERFORM jeupharma.v2__sync_progression(uid, v_parcours);
  RETURN jsonb_build_object(
    'parcours_id', v_parcours,
    'parcours', jsonb_build_object('id', pa.id, 'code', pa.code, 'libelle', pa.libelle, 'description', pa.description, 'mode_contenu', pa.mode_contenu) || coalesce(jeupharma.v2_parcours_detail(uid, v_parcours), '{}'::jsonb),
    'modules', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'id', m.id, 'code', m.code, 'titre', m.titre, 'resume', m.resume, 'objectifs', m.objectifs, 'ordre', m.ordre, 'publie', m.publie, 'est_groupe', m.est_groupe, 'parent_id', m.parent_id,
          'maj_at', coalesce(m.contenu_maj_at, m.updated_at), 'criteres', m.criteres_json, 'detail', det.d,
          'valide', coalesce((det.d->>'valide')::boolean, false), 'pct', coalesce((det.d->>'pct')::numeric, 0),
          'verrouille', bp.b IS NOT NULL, 'bloque_par', bp.b,
          'statut', CASE WHEN m.est_groupe THEN 'groupe' WHEN bp.b IS NOT NULL THEN 'verrouille' WHEN coalesce((det.d->>'valide')::boolean, false) THEN 'termine' ELSE 'debloque' END
        ) ORDER BY m.ordre)
      FROM jeupharma.modules_cours m
      CROSS JOIN LATERAL (SELECT jeupharma.v2_module_detail(uid, m.id) AS d) det
      CROSS JOIN LATERAL (SELECT jeupharma.v2_module_bloque_par(uid, m.id) AS b) bp
      WHERE m.parcours_id = v_parcours AND m.publie
    ), '[]'::jsonb)
  );
END; $function$
;

CREATE OR REPLACE FUNCTION jeupharma.v2_publier_connaissances(p_module_id uuid, p_connaissance_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $function$
DECLARE
  n int;
  mid uuid;
BEGIN
  IF NOT jeupharma.is_portail_admin() THEN
    RAISE EXCEPTION 'Réservé admin portail';
  END IF;
  IF p_module_id IS NULL OR p_connaissance_ids IS NULL OR cardinality(p_connaissance_ids) = 0 THEN
    RAISE EXCEPTION 'module et connaissances requis';
  END IF;

  -- Forcer identité (nom / dci) des matrices concernées
  INSERT INTO jeupharma.publications_connaissances (module_id, connaissance_id, ordre, publie_par, actif)
  SELECT DISTINCT p_module_id, c_id.id, c_id.ordre, auth.uid(), true
  FROM jeupharma.connaissances c_sel
  JOIN jeupharma.connaissances c_id
    ON c_id.matrice_id = c_sel.matrice_id
   AND c_id.champ_code IN ('nom_commercial', 'dci')
   AND c_id.statut = 'valide'
  WHERE c_sel.id = ANY (p_connaissance_ids)
  ON CONFLICT (module_id, connaissance_id) DO UPDATE SET actif = true, publie_par = auth.uid();

  INSERT INTO jeupharma.publications_connaissances (module_id, connaissance_id, ordre, publie_par, actif)
  SELECT p_module_id, c.id, c.ordre, auth.uid(), true
  FROM jeupharma.connaissances c
  WHERE c.id = ANY (p_connaissance_ids) AND c.statut = 'valide'
  ON CONFLICT (module_id, connaissance_id) DO UPDATE SET actif = true, publie_par = auth.uid();

  GET DIAGNOSTICS n = ROW_COUNT;

  UPDATE jeupharma.modules_cours
  SET publie = true, version_publication = version_publication + 1, updated_at = now()
  WHERE id = p_module_id;

  RETURN jsonb_build_object('module_id', p_module_id, 'upserted', n);
END;
$function$
;

CREATE OR REPLACE FUNCTION jeupharma.v2_publier_module_matrices(p_module_id uuid, p_matrice_ids uuid[], p_champ_codes text[] DEFAULT NULL::text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $function$
DECLARE
  n int;
BEGIN
  IF NOT jeupharma.is_portail_admin() THEN
    RAISE EXCEPTION 'Reserve admin portail';
  END IF;
  IF p_module_id IS NULL OR p_matrice_ids IS NULL OR cardinality(p_matrice_ids) = 0 THEN
    RAISE EXCEPTION 'module et molecules requis';
  END IF;

  INSERT INTO jeupharma.publications_connaissances (module_id, connaissance_id, ordre, publie_par)
  SELECT p_module_id, c.id, c.ordre, auth.uid()
  FROM jeupharma.connaissances c
  WHERE c.statut = 'valide'
    AND c.matrice_id = ANY (p_matrice_ids)
    AND (p_champ_codes IS NULL OR cardinality(p_champ_codes) = 0 OR c.champ_code = ANY (p_champ_codes))
  ON CONFLICT (module_id, connaissance_id) DO NOTHING;

  GET DIAGNOSTICS n = ROW_COUNT;
  UPDATE jeupharma.modules_cours
  SET publie = true, version_publication = version_publication + 1, updated_at = now()
  WHERE id = p_module_id;

  RETURN jsonb_build_object(
    'module_id', p_module_id,
    'inserted', n,
    'matrices', cardinality(p_matrice_ids),
    'champs', COALESCE(p_champ_codes, ARRAY[]::text[])
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION jeupharma.v2_publier_module_par_classes_ther(p_module_id uuid, p_classe_norms text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $function$
DECLARE
  n int;
BEGIN
  IF NOT jeupharma.is_portail_admin() THEN
    RAISE EXCEPTION 'Reserve admin portail';
  END IF;

  INSERT INTO jeupharma.publications_connaissances (module_id, connaissance_id, ordre, publie_par)
  SELECT DISTINCT p_module_id, c.id, c.ordre, auth.uid()
  FROM jeupharma.connaissances c
  JOIN jeupharma.matrice_classes_therapeutiques mc ON mc.matrice_id = c.matrice_id
  JOIN jeupharma.classes_therapeutiques ct ON ct.id = mc.classe_therapeutique_id AND ct.actif
  WHERE c.statut = 'valide'
    AND ct.valeur_norm = ANY (p_classe_norms)
  ON CONFLICT (module_id, connaissance_id) DO NOTHING;

  GET DIAGNOSTICS n = ROW_COUNT;
  UPDATE jeupharma.modules_cours
  SET publie = true, version_publication = version_publication + 1, updated_at = now()
  WHERE id = p_module_id;

  RETURN jsonb_build_object('module_id', p_module_id, 'inserted', n);
END;
$function$
;

CREATE OR REPLACE FUNCTION jeupharma.v2_publier_module_par_indications(p_module_id uuid, p_indication_norms text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $function$
DECLARE
  n int;
BEGIN
  IF NOT jeupharma.is_portail_admin() THEN
    RAISE EXCEPTION 'Reserve admin portail';
  END IF;

  INSERT INTO jeupharma.publications_connaissances (module_id, connaissance_id, ordre, publie_par)
  SELECT DISTINCT p_module_id, c.id, c.ordre, auth.uid()
  FROM jeupharma.connaissances c
  JOIN jeupharma.matrice_indications mi ON mi.matrice_id = c.matrice_id
  JOIN jeupharma.indications i ON i.id = mi.indication_id AND i.actif
  WHERE c.statut = 'valide'
    AND i.valeur_norm = ANY (p_indication_norms)
  ON CONFLICT (module_id, connaissance_id) DO NOTHING;

  GET DIAGNOSTICS n = ROW_COUNT;
  UPDATE jeupharma.modules_cours
  SET publie = true, version_publication = version_publication + 1, updated_at = now()
  WHERE id = p_module_id;

  RETURN jsonb_build_object('module_id', p_module_id, 'inserted', n);
END;
$function$
;

CREATE OR REPLACE FUNCTION jeupharma.v2_publier_module_par_secteur(p_module_id uuid, p_secteur_valeur_norm text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $function$
DECLARE
  n int;
BEGIN
  IF NOT jeupharma.is_portail_admin() THEN
    RAISE EXCEPTION 'Réservé admin portail';
  END IF;

  INSERT INTO jeupharma.publications_connaissances (module_id, connaissance_id, ordre, publie_par)
  SELECT p_module_id, c.id, c.ordre, auth.uid()
  FROM jeupharma.connaissances c
  JOIN jeupharma.matrice_secteurs_therapeutiques ms ON ms.matrice_id = c.matrice_id
  JOIN jeupharma.secteurs_therapeutiques s ON s.id = ms.secteur_therapeutique_id
  WHERE c.statut = 'valide'
    AND s.valeur_norm = p_secteur_valeur_norm
  ON CONFLICT (module_id, connaissance_id) DO NOTHING;

  GET DIAGNOSTICS n = ROW_COUNT;
  UPDATE jeupharma.modules_cours
  SET publie = true, version_publication = version_publication + 1, updated_at = now()
  WHERE id = p_module_id;

  RETURN jsonb_build_object('module_id', p_module_id, 'inserted', n);
END;
$function$
;

CREATE OR REPLACE FUNCTION jeupharma.v2_reorder_blocs(p_module_id uuid, p_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $function$
DECLARE
  i int;
BEGIN
  IF NOT jeupharma.is_portail_admin() THEN
    RAISE EXCEPTION 'Réservé admin portail';
  END IF;
  IF p_ids IS NULL THEN RETURN jsonb_build_object('updated', 0); END IF;
  FOR i IN 1 .. coalesce(array_length(p_ids, 1), 0) LOOP
    UPDATE jeupharma.module_blocs
    SET ordre = i * 10, updated_at = now()
    WHERE id = p_ids[i] AND module_id = p_module_id;
  END LOOP;
  RETURN jsonb_build_object('updated', coalesce(array_length(p_ids, 1), 0));
END;
$function$
;

CREATE OR REPLACE FUNCTION jeupharma.v2_reorder_modules(p_items jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $function$
DECLARE
  item jsonb;
  n int := 0;
BEGIN
  IF NOT jeupharma.is_portail_admin() THEN
    RAISE EXCEPTION 'Réservé admin portail';
  END IF;
  FOR item IN SELECT * FROM jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  LOOP
    UPDATE jeupharma.modules_cours
    SET ordre = coalesce((item->>'ordre')::int, ordre),
        parent_id = CASE WHEN item ? 'parent_id' THEN nullif(item->>'parent_id', '')::uuid ELSE parent_id END,
        updated_at = now()
    WHERE id = (item->>'id')::uuid;
    n := n + 1;
  END LOOP;
  RETURN jsonb_build_object('updated', n);
END;
$function$
;

CREATE OR REPLACE FUNCTION jeupharma.v2_reveler_ordonnance(p_tentative_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $function$
DECLARE
  t jeupharma.tentatives_jeu%ROWTYPE;
BEGIN
  SELECT * INTO t FROM jeupharma.tentatives_jeu
  WHERE id = p_tentative_id AND utilisateur_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Tentative introuvable'; END IF;

  UPDATE jeupharma.tentatives_jeu
  SET revele_at = coalesce(revele_at, now())
  WHERE id = t.id;

  RETURN jsonb_build_object(
    'tentative_id', t.id,
    'molecules', t.snapshot_json->'molecules',
    'champs', t.snapshot_json->'champs'
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION jeupharma.v2_set_pause_jeu(p_modele_id uuid, p_pause boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $function$
DECLARE
  row jeupharma.modeles_jeu%ROWTYPE;
BEGIN
  IF NOT jeupharma.is_portail_admin() THEN
    RAISE EXCEPTION 'Réservé admin portail';
  END IF;
  UPDATE jeupharma.modeles_jeu
  SET en_pause = COALESCE(p_pause, true), updated_at = now()
  WHERE id = p_modele_id
  RETURNING * INTO row;
  IF NOT FOUND THEN RAISE EXCEPTION 'Modèle introuvable'; END IF;
  RETURN jsonb_build_object('id', row.id, 'code_unique', row.code_unique, 'en_pause', row.en_pause);
END;
$function$
;

CREATE OR REPLACE FUNCTION jeupharma.v2_supprimer_bloc(p_bloc_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $function$
BEGIN
  IF NOT jeupharma.is_portail_admin() THEN
    RAISE EXCEPTION 'Réservé admin portail';
  END IF;
  DELETE FROM jeupharma.module_blocs WHERE id = p_bloc_id;
  RETURN jsonb_build_object('id', p_bloc_id, 'deleted', true);
END;
$function$
;

CREATE OR REPLACE FUNCTION jeupharma.v2_supprimer_module(p_module_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $function$
DECLARE
  v_root jeupharma.modules_cours%ROWTYPE;
  v_ids uuid[];
  v_prereq uuid;
  v_arch uuid[] := '{}'::uuid[];
  v_arch_txt text[] := '{}'::text[];
  v_n_modules int := 0;
  v_n_blocs int := 0;
  v_n_jeux_maj int := 0;
  v_n_blocs_jeu int := 0;
BEGIN
  IF NOT jeupharma.is_portail_admin() THEN
    RAISE EXCEPTION 'Réservé admin portail';
  END IF;

  SELECT * INTO v_root FROM jeupharma.modules_cours WHERE id = p_module_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Module introuvable'; END IF;

  -- Sous-arbre (UNION : tolère un éventuel cycle parent_id)
  WITH RECURSIVE sub AS (
    SELECT id FROM jeupharma.modules_cours WHERE id = p_module_id
    UNION
    SELECT c.id FROM jeupharma.modules_cours c JOIN sub s ON c.parent_id = s.id
  )
  SELECT array_agg(id) INTO v_ids FROM sub;
  v_n_modules := cardinality(v_ids);

  SELECT count(*) INTO v_n_blocs FROM jeupharma.module_blocs WHERE module_id = ANY (v_ids);

  -- Prérequis : les éléments extérieurs héritent du prérequis du module supprimé
  v_prereq := v_root.prerequis_module_id;
  IF v_prereq IS NOT NULL AND v_prereq = ANY (v_ids) THEN v_prereq := NULL; END IF;
  UPDATE jeupharma.modules_cours
  SET prerequis_module_id = v_prereq, updated_at = now()
  WHERE prerequis_module_id = ANY (v_ids) AND NOT (id = ANY (v_ids));

  -- Jeux : retrait des modules supprimés du pool ; pool vide => archivage
  WITH touched AS (
    UPDATE jeupharma.modeles_jeu mj
    SET module_ids = ARRAY(SELECT x FROM unnest(mj.module_ids) AS x WHERE NOT (x = ANY (v_ids))),
        updated_at = now()
    WHERE mj.module_ids && v_ids
    RETURNING mj.id, mj.module_ids
  )
  SELECT count(*), coalesce(array_agg(id) FILTER (WHERE cardinality(module_ids) = 0), '{}'::uuid[])
  INTO v_n_jeux_maj, v_arch
  FROM touched;

  IF cardinality(v_arch) > 0 THEN
    v_arch_txt := ARRAY(SELECT x::text FROM unnest(v_arch) AS x);

    UPDATE jeupharma.modeles_jeu SET actif = false, updated_at = now() WHERE id = ANY (v_arch);

    -- Blocs « jeu » d'autres leçons pointant vers un jeu archivé : supprimés
    DELETE FROM jeupharma.module_blocs
    WHERE type_bloc = 'jeu'
      AND payload_json->>'modele_id' = ANY (v_arch_txt)
      AND NOT (module_id = ANY (v_ids));
    GET DIAGNOSTICS v_n_blocs_jeu = ROW_COUNT;

    -- Critères de déblocage : retrait des jeux archivés
    UPDATE jeupharma.modules_cours c
    SET criteres_json = jsonb_set(
      c.criteres_json, '{jeux}',
      coalesce((
        SELECT jsonb_agg(e)
        FROM jsonb_array_elements(c.criteres_json->'jeux') AS e
        WHERE NOT ((e->>'modele_id') = ANY (v_arch_txt))
      ), '[]'::jsonb)
    )
    WHERE jsonb_typeof(c.criteres_json->'jeux') = 'array'
      AND NOT (c.id = ANY (v_ids))
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(c.criteres_json->'jeux') AS e
        WHERE (e->>'modele_id') = ANY (v_arch_txt)
      );

    UPDATE jeupharma.parcours_apprentissage p
    SET criteres_json = jsonb_set(
      p.criteres_json, '{jeux}',
      coalesce((
        SELECT jsonb_agg(e)
        FROM jsonb_array_elements(p.criteres_json->'jeux') AS e
        WHERE NOT ((e->>'modele_id') = ANY (v_arch_txt))
      ), '[]'::jsonb)
    )
    WHERE jsonb_typeof(p.criteres_json->'jeux') = 'array'
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(p.criteres_json->'jeux') AS e
        WHERE (e->>'modele_id') = ANY (v_arch_txt)
      );
  END IF;

  -- Suppression : blocs, publications, progression en cascade
  DELETE FROM jeupharma.modules_cours WHERE id = ANY (v_ids);

  RETURN jsonb_build_object(
    'id', p_module_id,
    'deleted', true,
    'modules', v_n_modules,
    'blocs', v_n_blocs,
    'jeux_modifies', v_n_jeux_maj,
    'jeux_archives', cardinality(v_arch),
    'blocs_jeu_retires', v_n_blocs_jeu
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION jeupharma.v2_traiter_demande_parcours(p_id uuid, p_statut text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $function$
DECLARE
  row jeupharma.inscriptions_parcours%ROWTYPE;
BEGIN
  IF NOT jeupharma.is_portail_admin() THEN
    RAISE EXCEPTION 'Réservé admin portail';
  END IF;
  IF p_statut NOT IN ('accepte', 'refuse') THEN
    RAISE EXCEPTION 'Statut invalide';
  END IF;

  UPDATE jeupharma.inscriptions_parcours
  SET statut = p_statut,
      actif = (p_statut = 'accepte'),
      traite_at = now(),
      traite_par = auth.uid()
  WHERE id = p_id
  RETURNING * INTO row;

  IF NOT FOUND THEN RAISE EXCEPTION 'Demande introuvable'; END IF;

  IF p_statut = 'accepte' THEN
    INSERT INTO jeupharma.profil_apprentissage (user_id, parcours_id, updated_at)
    VALUES (row.user_id, row.parcours_id, now())
    ON CONFLICT (user_id) DO UPDATE SET
      parcours_id = EXCLUDED.parcours_id,
      updated_at = now();
  END IF;

  RETURN to_jsonb(row);
END;
$function$
;

CREATE OR REPLACE FUNCTION jeupharma.v2_upsert_bloc(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $function$
DECLARE
  row jeupharma.module_blocs%ROWTYPE;
  v_id uuid;
BEGIN
  IF NOT jeupharma.is_portail_admin() THEN
    RAISE EXCEPTION 'Réservé admin portail';
  END IF;
  v_id := nullif(p_payload->>'id', '')::uuid;

  IF v_id IS NULL THEN
    INSERT INTO jeupharma.module_blocs (
      module_id, ordre, type_bloc, titre, payload_json, visible
    ) VALUES (
      (p_payload->>'module_id')::uuid,
      coalesce((p_payload->>'ordre')::int, 100),
      p_payload->>'type_bloc',
      nullif(p_payload->>'titre', ''),
      coalesce(p_payload->'payload_json', '{}'::jsonb),
      coalesce((p_payload->>'visible')::boolean, true)
    )
    RETURNING * INTO row;
  ELSE
    UPDATE jeupharma.module_blocs SET
      ordre = coalesce((p_payload->>'ordre')::int, ordre),
      titre = CASE WHEN p_payload ? 'titre' THEN nullif(p_payload->>'titre', '') ELSE titre END,
      payload_json = coalesce(p_payload->'payload_json', payload_json),
      visible = coalesce((p_payload->>'visible')::boolean, visible),
      updated_at = now()
    WHERE id = v_id
    RETURNING * INTO row;
    IF NOT FOUND THEN RAISE EXCEPTION 'Bloc introuvable'; END IF;
  END IF;
  RETURN to_jsonb(row);
END;
$function$
;

CREATE OR REPLACE FUNCTION jeupharma.v2_upsert_module(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $function$
DECLARE row jeupharma.modules_cours%ROWTYPE; v_id uuid; v_code text; v_publie boolean;
BEGIN
  IF NOT jeupharma.is_portail_admin() THEN RAISE EXCEPTION 'Réservé admin portail'; END IF;
  v_id := nullif(p_payload->>'id', '')::uuid;
  v_code := lower(trim(both FROM regexp_replace(coalesce(p_payload->>'code', p_payload->>'titre'), '[^a-zA-Z0-9]+', '_', 'g')));
  v_code := trim(both '_' FROM v_code);
  IF v_id IS NULL THEN
    v_publie := coalesce((p_payload->>'publie')::boolean, coalesce(p_payload->>'statut', 'publie') = 'publie');
    INSERT INTO jeupharma.modules_cours (parcours_id, parent_id, code, titre, resume, objectifs, ordre, publie, est_groupe, prerequis_module_id, created_by, version_publication, icone, couleur_accent, couverture_url, statut, criteres_json, contenu_maj_at)
    VALUES ((p_payload->>'parcours_id')::uuid, nullif(p_payload->>'parent_id', '')::uuid, v_code, trim(p_payload->>'titre'), coalesce(p_payload->>'resume', ''), coalesce(p_payload->>'objectifs', ''), coalesce((p_payload->>'ordre')::int, 100), v_publie, coalesce((p_payload->>'est_groupe')::boolean, false), nullif(p_payload->>'prerequis_module_id', '')::uuid, auth.uid(), 1, nullif(p_payload->>'icone', ''), nullif(p_payload->>'couleur_accent', ''), nullif(p_payload->>'couverture_url', ''), coalesce(nullif(p_payload->>'statut', ''), 'publie'), jeupharma.v2__clean_criteres(p_payload->'criteres_json'), now())
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
      prerequis_module_id = CASE WHEN p_payload ? 'prerequis_module_id' THEN nullif(p_payload->>'prerequis_module_id', '')::uuid ELSE prerequis_module_id END,
      icone = CASE WHEN p_payload ? 'icone' THEN nullif(p_payload->>'icone', '') ELSE icone END,
      couleur_accent = CASE WHEN p_payload ? 'couleur_accent' THEN nullif(p_payload->>'couleur_accent', '') ELSE couleur_accent END,
      couverture_url = CASE WHEN p_payload ? 'couverture_url' THEN nullif(p_payload->>'couverture_url', '') ELSE couverture_url END,
      statut = coalesce(nullif(p_payload->>'statut', ''), statut),
      criteres_json = CASE WHEN p_payload ? 'criteres_json' THEN jeupharma.v2__clean_criteres(p_payload->'criteres_json') ELSE criteres_json END,
      contenu_maj_at = CASE WHEN coalesce((p_payload->>'publie')::boolean, false) OR p_payload->>'statut' = 'publie' OR p_payload ? 'titre' OR p_payload ? 'resume' THEN now() ELSE contenu_maj_at END,
      updated_at = now()
    WHERE id = v_id RETURNING * INTO row;
    IF NOT FOUND THEN RAISE EXCEPTION 'Module introuvable'; END IF;
    IF row.prerequis_module_id IS NOT NULL AND row.prerequis_module_id = row.id THEN RAISE EXCEPTION 'Un module ne peut pas être son propre prérequis'; END IF;
  END IF;
  RETURN to_jsonb(row);
END; $function$
;

