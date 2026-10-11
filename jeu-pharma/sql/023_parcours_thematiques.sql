-- =============================================================================
-- 023 : Arborescence thématique Sang / Cœur / Veine-artère / Urgence / HTA
-- parent_id + est_groupe sur modules_cours ; héritage pubs ancêtres ; seed.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Colonnes hiérarchie
-- ---------------------------------------------------------------------------

ALTER TABLE jeupharma.modules_cours
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES jeupharma.modules_cours(id) ON DELETE SET NULL;

ALTER TABLE jeupharma.modules_cours
  ADD COLUMN IF NOT EXISTS est_groupe boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS modules_cours_parent_idx
  ON jeupharma.modules_cours (parent_id);

COMMENT ON COLUMN jeupharma.modules_cours.est_groupe IS
  'true = thème / sous-parcours (conteneur) ; false = module jouable (feuille)';

-- ---------------------------------------------------------------------------
-- 2. Helpers : ancêtres + pubs héritées
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION jeupharma.v2_module_ancetres(p_module uuid)
RETURNS TABLE (module_id uuid, profondeur int)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'jeupharma', 'pg_temp'
AS $$
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
$$;

CREATE OR REPLACE FUNCTION jeupharma.v2_modules_scope(p_module_ids uuid[])
RETURNS TABLE (module_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'jeupharma', 'pg_temp'
AS $$
  SELECT DISTINCT a.module_id
  FROM unnest(COALESCE(p_module_ids, '{}'::uuid[])) AS mid
  CROSS JOIN LATERAL jeupharma.v2_module_ancetres(mid) a;
$$;

-- ---------------------------------------------------------------------------
-- 3. Déblocage : feuilles uniquement
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION jeupharma.v2_modules_debloques(
  p_user uuid DEFAULT auth.uid(),
  p_parcours uuid DEFAULT NULL
)
RETURNS TABLE (module_id uuid, ordre int)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
  WITH parcours AS (
    SELECT COALESCE(p_parcours, jeupharma.v2_parcours_actif(p_user)) AS id
  ),
  leaves AS (
    SELECT m.id, m.ordre, m.prerequis_module_id
    FROM jeupharma.modules_cours m
    JOIN parcours p ON p.id = m.parcours_id
    WHERE m.publie AND NOT m.est_groupe
  ),
  prog AS (
    SELECT pm.module_id, pm.statut
    FROM jeupharma.progression_modules pm
    WHERE pm.user_id = p_user
  )
  SELECT m.id, m.ordre
  FROM leaves m
  LEFT JOIN prog g ON g.module_id = m.id
  WHERE
    m.ordre = (SELECT MIN(ordre) FROM leaves)
    OR g.statut IN ('debloque', 'termine')
    OR (
      m.prerequis_module_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM prog g2
        WHERE g2.module_id = m.prerequis_module_id
          AND g2.statut = 'termine'
      )
    )
    OR EXISTS (
      SELECT 1
      FROM leaves prev
      JOIN prog gp ON gp.module_id = prev.id AND gp.statut = 'termine'
      WHERE prev.ordre = (
        SELECT MAX(l2.ordre) FROM leaves l2 WHERE l2.ordre < m.ordre
      )
    );
$$;

-- ---------------------------------------------------------------------------
-- 4. Connaissances visibles : pubs feuille + ancêtres
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
$$;

-- ---------------------------------------------------------------------------
-- 5. Progression arborescente
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION jeupharma.v2_progression_parcours(
  p_parcours uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
DECLARE
  uid uuid := auth.uid();
  v_parcours uuid;
BEGIN
  IF uid IS NULL OR NOT jeupharma.has_jeupharma_access() THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;
  v_parcours := COALESCE(p_parcours, jeupharma.v2_parcours_actif(uid));
  IF v_parcours IS NULL THEN
    RETURN jsonb_build_object('parcours_id', null, 'modules', '[]'::jsonb);
  END IF;

  RETURN jsonb_build_object(
    'parcours_id', v_parcours,
    'parcours', (
      SELECT jsonb_build_object('id', pa.id, 'code', pa.code, 'libelle', pa.libelle,
                                'mode_contenu', pa.mode_contenu)
      FROM jeupharma.parcours_apprentissage pa WHERE pa.id = v_parcours
    ),
    'modules', COALESCE((
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
          'statut', CASE
            WHEN m.est_groupe THEN 'groupe'
            WHEN EXISTS (
              SELECT 1 FROM jeupharma.v2_modules_debloques(uid, v_parcours) d
              WHERE d.module_id = m.id
            ) THEN COALESCE(pm.statut, 'debloque')
            ELSE COALESCE(pm.statut, 'verrouille')
          END
        )
        ORDER BY m.ordre
      )
      FROM jeupharma.modules_cours m
      LEFT JOIN jeupharma.progression_modules pm
        ON pm.module_id = m.id AND pm.user_id = uid
      WHERE m.parcours_id = v_parcours AND m.publie
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION jeupharma.v2_module_ancetres(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION jeupharma.v2_modules_scope(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION jeupharma.v2_module_ancetres(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION jeupharma.v2_modules_scope(uuid[]) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. Publier par indications (pour feuilles thématiques)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION jeupharma.v2_publier_module_par_indications(
  p_module_id uuid,
  p_indication_norms text[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
DECLARE
  n int;
BEGIN
  IF NOT jeupharma.is_portail_admin() THEN
    RAISE EXCEPTION 'Réservé admin portail';
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
$$;

CREATE OR REPLACE FUNCTION jeupharma.v2_publier_module_par_classes_ther(
  p_module_id uuid,
  p_classe_norms text[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
DECLARE
  n int;
BEGIN
  IF NOT jeupharma.is_portail_admin() THEN
    RAISE EXCEPTION 'Réservé admin portail';
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
$$;

REVOKE ALL ON FUNCTION jeupharma.v2_publier_module_par_indications(uuid, text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION jeupharma.v2_publier_module_par_classes_ther(uuid, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION jeupharma.v2_publier_module_par_indications(uuid, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION jeupharma.v2_publier_module_par_classes_ther(uuid, text[]) TO authenticated;

-- ---------------------------------------------------------------------------
-- 7. Seed arborescence pour parcours publications (deust_apprenti, etu_3a)
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  pid uuid;
  pcode text;
  id_sang uuid;
  id_coeur uuid;
  id_veine uuid;
  id_urgence uuid;
  id_hta uuid;
  id_anemie uuid;
  id_anticoag uuid;
  id_angor uuid;
  id_idm uuid;
  id_arythmies uuid;
  id_ic uuid;
  id_arterite uuid;
  id_iv uuid;
  id_oap uuid;
  id_urg_cv uuid;
  old_cv uuid;
BEGIN
  FOREACH pcode IN ARRAY ARRAY['deust_apprenti', 'etu_3a'] LOOP
    SELECT id INTO pid FROM jeupharma.parcours_apprentissage WHERE code = pcode;
    IF pid IS NULL THEN
      CONTINUE;
    END IF;

    -- Sang (groupe) — réutilise code sang si présent
    SELECT id INTO id_sang FROM jeupharma.modules_cours
    WHERE parcours_id = pid AND code = 'sang';
    IF id_sang IS NULL THEN
      INSERT INTO jeupharma.modules_cours (
        parcours_id, code, titre, resume, objectifs, ordre, publie, est_groupe, version_publication
      ) VALUES (
        pid, 'sang', 'Sang', 'Sous-parcours sang.', 'Anémie et anticoagulation.', 10, true, true, 1
      ) RETURNING id INTO id_sang;
    ELSE
      UPDATE jeupharma.modules_cours
      SET titre = 'Sang', resume = 'Sous-parcours sang.', objectifs = 'Anémie et anticoagulation.',
          ordre = 10, publie = true, est_groupe = true, parent_id = NULL, updated_at = now()
      WHERE id = id_sang;
    END IF;

    -- Cœur
    SELECT id INTO id_coeur FROM jeupharma.modules_cours
    WHERE parcours_id = pid AND code = 'coeur';
    IF id_coeur IS NULL THEN
      INSERT INTO jeupharma.modules_cours (
        parcours_id, code, titre, resume, objectifs, ordre, publie, est_groupe, version_publication
      ) VALUES (
        pid, 'coeur', 'Cœur', 'Sous-parcours cardiaque.', 'Angor, IDM, arythmies, IC.', 20, true, true, 1
      ) RETURNING id INTO id_coeur;
    ELSE
      UPDATE jeupharma.modules_cours
      SET titre = 'Cœur', ordre = 20, publie = true, est_groupe = true, parent_id = NULL, updated_at = now()
      WHERE id = id_coeur;
    END IF;

    -- Veine et artère
    SELECT id INTO id_veine FROM jeupharma.modules_cours
    WHERE parcours_id = pid AND code = 'veine_artere';
    IF id_veine IS NULL THEN
      INSERT INTO jeupharma.modules_cours (
        parcours_id, code, titre, resume, objectifs, ordre, publie, est_groupe, version_publication
      ) VALUES (
        pid, 'veine_artere', 'Veine et artère', 'Artérite et insuffisance veineuse.', '', 30, true, true, 1
      ) RETURNING id INTO id_veine;
    ELSE
      UPDATE jeupharma.modules_cours
      SET titre = 'Veine et artère', ordre = 30, publie = true, est_groupe = true, parent_id = NULL, updated_at = now()
      WHERE id = id_veine;
    END IF;

    -- Urgence
    SELECT id INTO id_urgence FROM jeupharma.modules_cours
    WHERE parcours_id = pid AND code = 'urgence';
    IF id_urgence IS NULL THEN
      INSERT INTO jeupharma.modules_cours (
        parcours_id, code, titre, resume, objectifs, ordre, publie, est_groupe, version_publication
      ) VALUES (
        pid, 'urgence', 'Urgence', 'OAP et urgences cardiovasculaires.', '', 40, true, true, 1
      ) RETURNING id INTO id_urgence;
    ELSE
      UPDATE jeupharma.modules_cours
      SET titre = 'Urgence', ordre = 40, publie = true, est_groupe = true, parent_id = NULL, updated_at = now()
      WHERE id = id_urgence;
    END IF;

    -- HTA (feuille)
    SELECT id INTO id_hta FROM jeupharma.modules_cours
    WHERE parcours_id = pid AND code = 'hta';
    IF id_hta IS NULL THEN
      INSERT INTO jeupharma.modules_cours (
        parcours_id, code, titre, resume, objectifs, ordre, publie, est_groupe, version_publication
      ) VALUES (
        pid, 'hta', 'HTA', 'Hypertension artérielle.', 'Prise en charge médicamenteuse de l’HTA.', 50, true, false, 1
      ) RETURNING id INTO id_hta;
    ELSE
      UPDATE jeupharma.modules_cours
      SET titre = 'HTA', ordre = 50, publie = true, est_groupe = false, parent_id = NULL, updated_at = now()
      WHERE id = id_hta;
    END IF;

    -- Ancien module cv plat → dépublier (pubs migrées plus bas)
    SELECT id INTO old_cv FROM jeupharma.modules_cours
    WHERE parcours_id = pid AND code = 'cv';
    IF old_cv IS NOT NULL THEN
      UPDATE jeupharma.modules_cours
      SET publie = false, est_groupe = true, updated_at = now()
      WHERE id = old_cv;
    END IF;

    -- Feuilles Sang
    INSERT INTO jeupharma.modules_cours (
      parcours_id, parent_id, code, titre, resume, objectifs, ordre, publie, est_groupe, version_publication
    )
    SELECT pid, id_sang, v.code, v.titre, v.resume, v.objectifs, v.ordre, true, false, 1
    FROM (VALUES
      ('anemie', 'Anémie', 'Anémies et traitements associés.', 'Repérer et accompagner les traitements de l’anémie.', 11),
      ('anticoagulation', 'Anticoagulation', 'Anticoagulants et surveillance.', 'Maîtriser les anticoagulants du parcours.', 12)
    ) AS v(code, titre, resume, objectifs, ordre)
    WHERE NOT EXISTS (
      SELECT 1 FROM jeupharma.modules_cours m
      WHERE m.parcours_id = pid AND m.code = v.code
    );

    UPDATE jeupharma.modules_cours m SET parent_id = id_sang, ordre = 11, publie = true, est_groupe = false
    WHERE m.parcours_id = pid AND m.code = 'anemie';
    UPDATE jeupharma.modules_cours m SET parent_id = id_sang, ordre = 12, publie = true, est_groupe = false
    WHERE m.parcours_id = pid AND m.code = 'anticoagulation';

    -- Feuilles Cœur
    INSERT INTO jeupharma.modules_cours (
      parcours_id, parent_id, code, titre, resume, objectifs, ordre, publie, est_groupe, version_publication
    )
    SELECT pid, id_coeur, v.code, v.titre, v.resume, v.objectifs, v.ordre, true, false, 1
    FROM (VALUES
      ('angor', 'Angor', 'Traitements de l’angor.', '', 21),
      ('idm', 'Infarctus du myocarde', 'IDM et SCA.', '', 22),
      ('arythmies', 'Arythmies', 'Arythmies et anti-arythmiques.', '', 23),
      ('insuffisance_cardiaque', 'Insuffisance cardiaque', 'IC chronique et aiguë.', '', 24)
    ) AS v(code, titre, resume, objectifs, ordre)
    WHERE NOT EXISTS (
      SELECT 1 FROM jeupharma.modules_cours m
      WHERE m.parcours_id = pid AND m.code = v.code
    );

    UPDATE jeupharma.modules_cours SET parent_id = id_coeur, ordre = 21, publie = true, est_groupe = false
    WHERE parcours_id = pid AND code = 'angor';
    UPDATE jeupharma.modules_cours SET parent_id = id_coeur, ordre = 22, publie = true, est_groupe = false
    WHERE parcours_id = pid AND code = 'idm';
    UPDATE jeupharma.modules_cours SET parent_id = id_coeur, ordre = 23, publie = true, est_groupe = false
    WHERE parcours_id = pid AND code = 'arythmies';
    UPDATE jeupharma.modules_cours SET parent_id = id_coeur, ordre = 24, publie = true, est_groupe = false
    WHERE parcours_id = pid AND code = 'insuffisance_cardiaque';

    -- Feuilles Veine / artère
    INSERT INTO jeupharma.modules_cours (
      parcours_id, parent_id, code, titre, resume, objectifs, ordre, publie, est_groupe, version_publication
    )
    SELECT pid, id_veine, v.code, v.titre, v.resume, v.objectifs, v.ordre, true, false, 1
    FROM (VALUES
      ('arterite', 'Artérite', 'Artériopathie et vasodilatation.', '', 31),
      ('insuffisance_veineuse', 'Insuffisance veineuse', 'Insuffisance veineuse et vasoprotecteurs.', '', 32)
    ) AS v(code, titre, resume, objectifs, ordre)
    WHERE NOT EXISTS (
      SELECT 1 FROM jeupharma.modules_cours m
      WHERE m.parcours_id = pid AND m.code = v.code
    );

    UPDATE jeupharma.modules_cours SET parent_id = id_veine, ordre = 31, publie = true, est_groupe = false
    WHERE parcours_id = pid AND code = 'arterite';
    UPDATE jeupharma.modules_cours SET parent_id = id_veine, ordre = 32, publie = true, est_groupe = false
    WHERE parcours_id = pid AND code = 'insuffisance_veineuse';

    -- Feuilles Urgence
    INSERT INTO jeupharma.modules_cours (
      parcours_id, parent_id, code, titre, resume, objectifs, ordre, publie, est_groupe, version_publication
    )
    SELECT pid, id_urgence, v.code, v.titre, v.resume, v.objectifs, v.ordre, true, false, 1
    FROM (VALUES
      ('oap', 'Œdème aigu du poumon (OAP)', 'Prise en charge de l’OAP.', '', 41),
      ('urgences_cv', 'Traitements des urgences cardiovasculaires', 'Urgences cardiovasculaires.', '', 42)
    ) AS v(code, titre, resume, objectifs, ordre)
    WHERE NOT EXISTS (
      SELECT 1 FROM jeupharma.modules_cours m
      WHERE m.parcours_id = pid AND m.code = v.code
    );

    UPDATE jeupharma.modules_cours SET parent_id = id_urgence, ordre = 41, publie = true, est_groupe = false
    WHERE parcours_id = pid AND code = 'oap';
    UPDATE jeupharma.modules_cours SET parent_id = id_urgence, ordre = 42, publie = true, est_groupe = false
    WHERE parcours_id = pid AND code = 'urgences_cv';

    -- Chaîne de prérequis entre feuilles (ordre pédagogique)
    SELECT id INTO id_anemie FROM jeupharma.modules_cours WHERE parcours_id = pid AND code = 'anemie';
    SELECT id INTO id_anticoag FROM jeupharma.modules_cours WHERE parcours_id = pid AND code = 'anticoagulation';
    SELECT id INTO id_angor FROM jeupharma.modules_cours WHERE parcours_id = pid AND code = 'angor';
    SELECT id INTO id_idm FROM jeupharma.modules_cours WHERE parcours_id = pid AND code = 'idm';
    SELECT id INTO id_arythmies FROM jeupharma.modules_cours WHERE parcours_id = pid AND code = 'arythmies';
    SELECT id INTO id_ic FROM jeupharma.modules_cours WHERE parcours_id = pid AND code = 'insuffisance_cardiaque';
    SELECT id INTO id_arterite FROM jeupharma.modules_cours WHERE parcours_id = pid AND code = 'arterite';
    SELECT id INTO id_iv FROM jeupharma.modules_cours WHERE parcours_id = pid AND code = 'insuffisance_veineuse';
    SELECT id INTO id_oap FROM jeupharma.modules_cours WHERE parcours_id = pid AND code = 'oap';
    SELECT id INTO id_urg_cv FROM jeupharma.modules_cours WHERE parcours_id = pid AND code = 'urgences_cv';

    UPDATE jeupharma.modules_cours SET prerequis_module_id = NULL WHERE id = id_anemie;
    UPDATE jeupharma.modules_cours SET prerequis_module_id = id_anemie WHERE id = id_anticoag;
    UPDATE jeupharma.modules_cours SET prerequis_module_id = id_anticoag WHERE id = id_angor;
    UPDATE jeupharma.modules_cours SET prerequis_module_id = id_angor WHERE id = id_idm;
    UPDATE jeupharma.modules_cours SET prerequis_module_id = id_idm WHERE id = id_arythmies;
    UPDATE jeupharma.modules_cours SET prerequis_module_id = id_arythmies WHERE id = id_ic;
    UPDATE jeupharma.modules_cours SET prerequis_module_id = id_ic WHERE id = id_arterite;
    UPDATE jeupharma.modules_cours SET prerequis_module_id = id_arterite WHERE id = id_iv;
    UPDATE jeupharma.modules_cours SET prerequis_module_id = id_iv WHERE id = id_oap;
    UPDATE jeupharma.modules_cours SET prerequis_module_id = id_oap WHERE id = id_urg_cv;
    UPDATE jeupharma.modules_cours SET prerequis_module_id = id_urg_cv WHERE id = id_hta;

    -- Migrer pubs de l'ancien cv vers le groupe Cœur (héritage)
    IF old_cv IS NOT NULL AND pcode = 'deust_apprenti' THEN
      INSERT INTO jeupharma.publications_connaissances (
        module_id, connaissance_id, libelle_pedagogique, ordre, version_publication, publie_par, actif
      )
      SELECT id_coeur, pub.connaissance_id, pub.libelle_pedagogique, pub.ordre,
             pub.version_publication, pub.publie_par, pub.actif
      FROM jeupharma.publications_connaissances pub
      WHERE pub.module_id = old_cv
      ON CONFLICT (module_id, connaissance_id) DO NOTHING;

      -- Copie aussi vers Veine et Urgence pour ne pas perdre le corpus CV
      INSERT INTO jeupharma.publications_connaissances (
        module_id, connaissance_id, libelle_pedagogique, ordre, version_publication, publie_par, actif
      )
      SELECT id_veine, pub.connaissance_id, pub.libelle_pedagogique, pub.ordre,
             pub.version_publication, pub.publie_par, pub.actif
      FROM jeupharma.publications_connaissances pub
      WHERE pub.module_id = old_cv
      ON CONFLICT (module_id, connaissance_id) DO NOTHING;

      INSERT INTO jeupharma.publications_connaissances (
        module_id, connaissance_id, libelle_pedagogique, ordre, version_publication, publie_par, actif
      )
      SELECT id_urgence, pub.connaissance_id, pub.libelle_pedagogique, pub.ordre,
             pub.version_publication, pub.publie_par, pub.actif
      FROM jeupharma.publications_connaissances pub
      WHERE pub.module_id = old_cv
      ON CONFLICT (module_id, connaissance_id) DO NOTHING;

      UPDATE jeupharma.publications_connaissances SET actif = false WHERE module_id = old_cv;
    END IF;
  END LOOP;
END;
$$;

-- Affiner les feuilles deust via indications / classes (inserts directs, hors RPC admin)
DO $$
DECLARE
  pid uuid;
  rec record;
BEGIN
  SELECT id INTO pid FROM jeupharma.parcours_apprentissage WHERE code = 'deust_apprenti';
  IF pid IS NULL THEN RETURN; END IF;

  FOR rec IN
    SELECT * FROM (VALUES
      ('anemie', ARRAY['anemie epo','anemie de biermer','anemie ferriprive','anemie megaloblastique']::text[],
                 ARRAY['anti-anemiques','antianemiques']::text[]),
      ('anticoagulation', ARRAY['mtev','prevention mtev','tvp','fa']::text[],
                 ARRAY['anticoagulants','anticoagulants oraux directs','anticoagulant oraux directe',
                       'antithrombotiques','anti-aggregants plaquettaires','thrombolytiques']::text[]),
      ('angor', ARRAY['angor']::text[], ARRAY['anti-angoreux']::text[]),
      ('idm', ARRAY['idm','sca','thrombolyse idm']::text[], ARRAY[]::text[]),
      ('arythmies', ARRAY['fa']::text[], ARRAY['anti-arythmiques']::text[]),
      ('insuffisance_cardiaque', ARRAY['ic']::text[], ARRAY['cardiotoniques','therapie cardiaque']::text[]),
      ('arterite', ARRAY[]::text[], ARRAY['vasodilatateurs peripheriques']::text[]),
      ('insuffisance_veineuse', ARRAY['insuffisance veineuse','varices et varicosites']::text[],
                 ARRAY['vasoprotecteurs']::text[]),
      ('oap', ARRAY['ic']::text[], ARRAY['diuretiques']::text[]),
      ('urgences_cv', ARRAY['sca','idm','thrombolyse idm']::text[],
                 ARRAY['thrombolytiques','therapie cardiaque']::text[]),
      ('hta', ARRAY['hta','hta grossesse']::text[],
                 ARRAY['antihypertenseurs','agents betabloquants','inhibiteurs calciques',
                       'agents agissant sur le systeme renine-angiotensine','diuretiques']::text[])
    ) AS t(code, ind_norms, classe_norms)
  LOOP
    INSERT INTO jeupharma.publications_connaissances (module_id, connaissance_id, ordre)
    SELECT DISTINCT m.id, c.id, c.ordre
    FROM jeupharma.modules_cours m
    JOIN jeupharma.connaissances c ON c.statut = 'valide'
    JOIN jeupharma.matrice_indications mi ON mi.matrice_id = c.matrice_id
    JOIN jeupharma.indications i ON i.id = mi.indication_id AND i.actif
    WHERE m.parcours_id = pid AND m.code = rec.code
      AND cardinality(rec.ind_norms) > 0
      AND i.valeur_norm = ANY (rec.ind_norms)
    ON CONFLICT (module_id, connaissance_id) DO NOTHING;

    INSERT INTO jeupharma.publications_connaissances (module_id, connaissance_id, ordre)
    SELECT DISTINCT m.id, c.id, c.ordre
    FROM jeupharma.modules_cours m
    JOIN jeupharma.connaissances c ON c.statut = 'valide'
    JOIN jeupharma.matrice_classes_therapeutiques mc ON mc.matrice_id = c.matrice_id
    JOIN jeupharma.classes_therapeutiques ct ON ct.id = mc.classe_therapeutique_id AND ct.actif
    WHERE m.parcours_id = pid AND m.code = rec.code
      AND cardinality(rec.classe_norms) > 0
      AND ct.valeur_norm = ANY (rec.classe_norms)
    ON CONFLICT (module_id, connaissance_id) DO NOTHING;

    UPDATE jeupharma.modules_cours
    SET publie = true, version_publication = version_publication + 1, updated_at = now()
    WHERE parcours_id = pid AND code = rec.code;
  END LOOP;
END;
$$;
