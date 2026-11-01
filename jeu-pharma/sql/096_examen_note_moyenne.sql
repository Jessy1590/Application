-- 096 : examen = une note (moyenne pondérée du passage, puis moyenne de tous les passages).
-- Les jeux n’ont plus chacun un seuil. `poids` pondère la note du passage.
-- `note_min_pct` (0–100) est le seuil de la moyenne des passages pour valider la leçon.

CREATE OR REPLACE FUNCTION jeupharma.v2__critere_plat(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  out jsonb := '{}'::jsonb;
  arr jsonb := '[]'::jsonb;
  e jsonb;
  pct numeric;
  poids numeric;
  mid uuid;
  lecs uuid[];
BEGIN
  IF p IS NULL OR jsonb_typeof(p) <> 'object' THEN
    RETURN '{}'::jsonb;
  END IF;
  IF jsonb_typeof(p->'lecture') = 'boolean' THEN
    out := out || jsonb_build_object('lecture', p->'lecture');
  END IF;
  IF jsonb_typeof(p->'examen') = 'boolean' THEN
    out := out || jsonb_build_object('examen', p->'examen');
  END IF;
  IF p->>'logique' IN ('et', 'ou') THEN
    out := out || jsonb_build_object('logique', p->>'logique');
  END IF;
  IF p->>'progression_min_pct' IS NOT NULL AND p->>'progression_min_pct' <> '' THEN
    BEGIN
      out := out || jsonb_build_object(
        'progression_min_pct',
        least(100, greatest(0, round((p->>'progression_min_pct')::numeric)))
      );
    EXCEPTION WHEN others THEN
      NULL;
    END;
  END IF;
  IF p->>'note_min_pct' IS NOT NULL AND p->>'note_min_pct' <> '' THEN
    BEGIN
      out := out || jsonb_build_object(
        'note_min_pct',
        least(100, greatest(0, round((p->>'note_min_pct')::numeric)))
      );
    EXCEPTION WHEN others THEN
      NULL;
    END;
  END IF;
  IF jsonb_typeof(p->'jeux') = 'array' THEN
    FOR e IN SELECT value FROM jsonb_array_elements(p->'jeux') LOOP
      BEGIN
        mid := (e->>'modele_id')::uuid;
      EXCEPTION WHEN others THEN
        CONTINUE;
      END;
      IF mid IS NULL THEN CONTINUE; END IF;
      pct := 0;
      IF e->>'score_min_pct' IS NOT NULL AND e->>'score_min_pct' <> '' THEN
        BEGIN
          pct := least(100, greatest(0, round((e->>'score_min_pct')::numeric)));
        EXCEPTION WHEN others THEN
          pct := 0;
        END;
      END IF;
      poids := 1;
      IF e->>'poids' IS NOT NULL AND e->>'poids' <> '' THEN
        BEGIN
          poids := (e->>'poids')::numeric;
        EXCEPTION WHEN others THEN
          poids := 1;
        END;
      END IF;
      IF poids IS NULL OR poids <= 0 THEN poids := 1; END IF;
      arr := arr || jsonb_build_array(jsonb_build_object(
        'modele_id', mid,
        'score_min_pct', pct,
        'poids', poids
      ));
    END LOOP;
    out := out || jsonb_build_object('jeux', arr);
  END IF;
  IF jsonb_exists(p, 'lecons_lecture_ids') THEN
    lecs := jeupharma.v2__uuids_from_jsonb(p->'lecons_lecture_ids');
    out := out || jsonb_build_object('lecons_lecture_ids', to_jsonb(coalesce(lecs, ARRAY[]::uuid[])));
  END IF;
  RETURN out;
END;
$$;

CREATE OR REPLACE FUNCTION jeupharma.v2_module_detail(p_user uuid, p_module uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'jeupharma', 'portail', 'pg_temp'
AS $$
DECLARE
  m jeupharma.modules_cours%ROWTYPE;
  pm jeupharma.progression_modules%ROWTYPE;
  crit jsonb;
  logique text;
  jx jsonb;
  lx jsonb;
  n_j int;
  k_j int;
  n_l int;
  k_l int;
  somme numeric;
  max_part numeric;
  lecture_req boolean;
  n int;
  k int;
  part_lect numeric;
  valide boolean;
  pct numeric;
  nb int := 0;
  nbv int := 0;
  sum_pct numeric := 0;
  leaf record;
  dl jsonb;
  jeux_ok boolean;
  lecs_ok boolean;
  v_niv int;
  exam_on boolean := false;
  exam_moy numeric;
  exam_n int := 0;
  note_min numeric := 0;
BEGIN
  SELECT * INTO m FROM jeupharma.modules_cours WHERE id = p_module;
  IF NOT FOUND THEN RETURN NULL; END IF;

  v_niv := jeupharma.v2__niveau_inscrit(p_user, m.parcours_id);
  crit := jeupharma.v2__criteres_pour_niveau(coalesce(m.criteres_json, '{}'::jsonb), v_niv);
  logique := CASE WHEN crit->>'logique' = 'ou' THEN 'ou' ELSE 'et' END;
  jx := jeupharma.v2__criteres_jeux(p_user, crit);
  n_j := (jx->>'n')::int;
  k_j := (jx->>'ok')::int;
  somme := (jx->>'somme')::numeric;
  max_part := (jx->>'max_part')::numeric;
  lx := jeupharma.v2__criteres_lecons_lecture(p_user, crit, p_module);
  n_l := (lx->>'n')::int;
  k_l := (lx->>'ok')::int;
  exam_on := coalesce((crit->>'examen')::boolean, false);

  IF exam_on AND NOT m.est_groupe THEN
    SELECT round(avg(pe.note_pct), 1), count(*)::int
      INTO exam_moy, exam_n
    FROM jeupharma.passages_examen pe
    WHERE pe.user_id = p_user
      AND pe.module_id = p_module
      AND pe.termine_at IS NOT NULL;
    note_min := 0;
    IF crit->>'note_min_pct' IS NOT NULL AND crit->>'note_min_pct' <> '' THEN
      BEGIN
        note_min := least(100, greatest(0, round((crit->>'note_min_pct')::numeric)));
      EXCEPTION WHEN others THEN
        note_min := 0;
      END;
    END IF;
    -- Un seul critère : la moyenne des passages, pas une note par jeu.
    n_j := 1;
    k_j := CASE WHEN exam_n > 0 AND coalesce(exam_moy, 0) >= note_min THEN 1 ELSE 0 END;
    somme := CASE WHEN exam_n > 0 THEN least(1, coalesce(exam_moy, 0) / 100.0) ELSE 0 END;
    max_part := somme;
  END IF;

  IF m.est_groupe THEN
    FOR leaf IN
      WITH RECURSIVE sub AS (
        SELECT c.id, c.est_groupe, c.publie FROM jeupharma.modules_cours c WHERE c.parent_id = p_module
        UNION
        SELECT c.id, c.est_groupe, c.publie
        FROM jeupharma.modules_cours c JOIN sub ON c.parent_id = sub.id
      )
      SELECT sub.id FROM sub WHERE sub.publie AND NOT sub.est_groupe
    LOOP
      IF v_niv > 0 AND NOT jeupharma.v2__module_dans_niveau(leaf.id, v_niv) THEN
        CONTINUE;
      END IF;
      dl := jeupharma.v2_module_detail(p_user, leaf.id);
      nb := nb + 1;
      sum_pct := sum_pct + coalesce((dl->>'pct')::numeric, 0);
      IF (dl->>'valide')::boolean THEN nbv := nbv + 1; END IF;
    END LOOP;
    jeux_ok := n_j = 0 OR (CASE WHEN logique = 'ou' THEN k_j >= 1 ELSE k_j = n_j END);
    lecs_ok := n_l = 0 OR (CASE WHEN logique = 'ou' THEN k_l >= 1 ELSE k_l = n_l END);
    valide := (nb = 0 OR nbv = nb) AND jeux_ok AND lecs_ok;
    pct := CASE
      WHEN valide THEN 100
      WHEN nb = 0 THEN 0
      ELSE round(sum_pct / nb)
    END;
    RETURN jsonb_build_object(
      'est_groupe', true,
      'valide', valide,
      'pct', pct,
      'nb_lecons', nb,
      'nb_valides', nbv,
      'jeux', jx->'liste',
      'lecons_lecture', lx->'liste',
      'logique', logique,
      'niveau_parcours', NULLIF(v_niv, 0)
    );
  END IF;

  SELECT * INTO pm FROM jeupharma.progression_modules WHERE user_id = p_user AND module_id = p_module;

  lecture_req := CASE
    WHEN jsonb_typeof(crit->'lecture') = 'boolean' THEN (crit->>'lecture')::boolean
    ELSE true
  END;
  n := (CASE WHEN lecture_req THEN 1 ELSE 0 END) + n_j + n_l;
  k := (CASE WHEN lecture_req AND pm.lu_at IS NOT NULL THEN 1 ELSE 0 END) + k_j + k_l;
  valide := n = 0 OR (CASE WHEN logique = 'ou' THEN k >= 1 ELSE k = n END);
  part_lect := CASE WHEN pm.lu_at IS NOT NULL THEN 1 ELSE coalesce(pm.lecture_pct, 0) / 100.0 END;

  IF valide THEN
    pct := 100;
  ELSIF logique = 'ou' THEN
    pct := round(100 * greatest(
      CASE WHEN lecture_req THEN part_lect ELSE 0 END,
      max_part,
      CASE WHEN n_l > 0 THEN k_l::numeric / n_l ELSE 0 END
    ));
  ELSE
    pct := round(100 * (
      (CASE WHEN lecture_req THEN part_lect ELSE 0 END) + somme + k_l::numeric
    ) / NULLIF(n, 0));
  END IF;

  RETURN jsonb_build_object(
    'est_groupe', false,
    'lecture_requise', lecture_req,
    'lu', pm.lu_at IS NOT NULL,
    'lecture_pct', coalesce(pm.lecture_pct, 0),
    'jeux', CASE WHEN exam_on THEN '[]'::jsonb ELSE jx->'liste' END,
    'lecons_lecture', lx->'liste',
    'logique', logique,
    'valide', valide,
    'pct', coalesce(pct, 0),
    'niveau_parcours', NULLIF(v_niv, 0),
    'examen', exam_on,
    'moyenne_pct', exam_moy,
    'passages', exam_n,
    'note_min_pct', CASE WHEN exam_on THEN note_min ELSE NULL END
  );
END;
$$;

-- Examen DEUST : poids 1, plus de seuil par jeu. La moyenne des passages valide dès qu’un passage existe.
UPDATE jeupharma.modules_cours
SET criteres_json = jsonb_set(
  jsonb_set(
    criteres_json,
    '{note_min_pct}',
    '0'::jsonb,
    true
  ),
  '{jeux}',
  (
    SELECT coalesce(jsonb_agg(
      (j - 'score_min_pct' - 'poids')
      || jsonb_build_object('score_min_pct', 0, 'poids', coalesce((j->>'poids')::numeric, 1))
    ), '[]'::jsonb)
    FROM jsonb_array_elements(coalesce(criteres_json->'jeux', '[]'::jsonb)) j
  ),
  true
)
WHERE code = 'examen_destination_des_deust'
  AND coalesce((criteres_json->>'examen')::boolean, false);

-- Quiz : paramètre « questions manuelles uniquement ».
UPDATE jeupharma.modeles_jeu
SET configuration_json = configuration_json || jsonb_build_object('manuel_seul', true, 'nb_auto_max', 0)
WHERE type_jeu = 'quiz'
  AND coalesce(configuration_json->>'nb_auto_max', '') = '0';

-- Questions : le sujet (classe, molécule, situation) est dans l’énoncé. Les réponses ne changent pas.
WITH map(id, nouveau) AS (
  VALUES
    ('cvaap-q04', 'Effet indésirable majeur des antiagrégants plaquettaires cité dans le cours…'),
    ('exq-JP-CVAAP-4', 'Effet indésirable majeur des antiagrégants plaquettaires cité dans le cours…'),
    ('cvaap-q05', 'Contre-indication des antiagrégants plaquettaires citée dans le cours…'),
    ('exq-JP-CVAAP-5', 'Contre-indication des antiagrégants plaquettaires citée dans le cours…'),
    ('cvaod-q05', 'Contre-indication des anticoagulants oraux directs (AOD) citée dans le cours…'),
    ('cvaap-q07', 'Indication des antiagrégants plaquettaires citée dans le cours…'),
    ('exq-JP-CVAAP-7', 'Indication des antiagrégants plaquettaires citée dans le cours…'),
    ('cvaap-q08', 'Conseil du cours pour un patient sous antiagrégant plaquettaire, en cas de troubles inattendus…'),
    ('exq-JP-CVAAP-8', 'Conseil du cours pour un patient sous antiagrégant plaquettaire, en cas de troubles inattendus…'),
    ('cval1-q02', 'Effet des alpha-1-bloquants sur la pression artérielle cité dans le cours…'),
    ('exq-JP-CVAL1-2', 'Effet des alpha-1-bloquants sur la pression artérielle cité dans le cours…'),
    ('cval1-q05', 'Autre effet indésirable rare des alpha-1-bloquants cité dans le cours…'),
    ('exq-JP-CVAL1-5', 'Autre effet indésirable rare des alpha-1-bloquants cité dans le cours…'),
    ('cval1-q08', 'Interaction médicamenteuse des alpha-1-bloquants citée dans le cours…'),
    ('exq-JP-CVAL1-8', 'Interaction médicamenteuse des alpha-1-bloquants citée dans le cours…'),
    ('cvaod-q06', 'Autre contre-indication des anticoagulants oraux directs (AOD) citée dans le cours…'),
    ('exq-JP-CVAOD-6', 'Autre contre-indication des anticoagulants oraux directs (AOD) citée dans le cours…'),
    ('cvaod-q08', 'Selon le cours, le suivi des anticoagulants oraux directs (AOD) porte surtout sur…'),
    ('exq-JP-CVAOD-8', 'Selon le cours, le suivi des anticoagulants oraux directs (AOD) porte surtout sur…'),
    ('cvas1-q03', 'Autre association fixe d’antihypertenseurs citée dans la leçon…'),
    ('exq-JP-CVAS1-3', 'Autre association fixe d’antihypertenseurs citée dans la leçon…'),
    ('cvas1-q07', 'À la dispensation d’une association d’antihypertenseurs, la leçon demande d’être attentif…'),
    ('exq-JP-CVAS1-7', 'À la dispensation d’une association d’antihypertenseurs, la leçon demande d’être attentif…'),
    ('cvas1-q08', 'Signal d’effet iatrogène des antihypertenseurs cité dans la leçon (source AFSSAPS)…'),
    ('exq-JP-CVAS1-8', 'Signal d’effet iatrogène des antihypertenseurs cité dans la leçon (source AFSSAPS)…'),
    ('cvas1-q09', 'Sous antihypertenseur, la leçon demande de diminuer…'),
    ('exq-JP-CVAS1-9', 'Sous antihypertenseur, la leçon demande de diminuer…'),
    ('cvas1-q10', 'Conseil écrit pour un antihypertenseur : ne pas arrêter brutalement le traitement, à cause…'),
    ('exq-JP-CVAS1-10', 'Conseil écrit pour un antihypertenseur : ne pas arrêter brutalement le traitement, à cause…'),
    ('cvas1-q11', 'Autres conseils écrits de la leçon sur les associations d’antihypertenseurs…'),
    ('exq-JP-CVAS1-11', 'Autres conseils écrits de la leçon sur les associations d’antihypertenseurs…'),
    ('cvas1-q13', 'Le seuil d’hypotension orthostatique décrit dans la leçon se mesure…'),
    ('exq-JP-CVAS1-13', 'Le seuil d’hypotension orthostatique décrit dans la leçon se mesure…'),
    ('cvas1-q14', 'La leçon sur les antihypertenseurs présente l’hypotension orthostatique comme…'),
    ('exq-JP-CVAS1-14', 'La leçon sur les antihypertenseurs présente l’hypotension orthostatique comme…'),
    ('cvas1-q15', 'Sous antihypertenseur, la chute peut être due, selon la leçon, à…'),
    ('exq-JP-CVAS1-15', 'Sous antihypertenseur, la chute peut être due, selon la leçon, à…'),
    ('cvas1-q16', '« Fatiguée depuis le début d’un antihypertenseur » est interprété dans la leçon comme…'),
    ('exq-JP-CVAS1-16', '« Fatiguée depuis le début d’un antihypertenseur » est interprété dans la leçon comme…'),
    ('cvas1-q17', 'Des vertiges lors des changements de position sous antihypertenseur orientent, dans la leçon, vers…'),
    ('exq-JP-CVAS1-17', 'Des vertiges lors des changements de position sous antihypertenseur orientent, dans la leçon, vers…'),
    ('cvas1-q18', 'Des courbatures sous antihypertenseur sont interprétées dans la leçon comme…'),
    ('exq-JP-CVAS1-18', 'Des courbatures sous antihypertenseur sont interprétées dans la leçon comme…'),
    ('cvbb1-q07', 'Parmi les contre-indications des bêtabloquants citées dans le cours, on trouve…'),
    ('exq-JP-CVBB1-7', 'Parmi les contre-indications des bêtabloquants citées dans le cours, on trouve…'),
    ('cvbb1-q08', 'Conseil absolu du cours concernant l’arrêt des bêtabloquants…'),
    ('exq-JP-CVBB1-8', 'Conseil absolu du cours concernant l’arrêt des bêtabloquants…'),
    ('cvbb1-q10', 'Parmi les indications des bêtabloquants (hors HTA) citées dans le cours, on trouve…'),
    ('exq-JP-CVBB1-10', 'Parmi les indications des bêtabloquants (hors HTA) citées dans le cours, on trouve…'),
    ('cvhep-q06', 'Précautions d’emploi des héparines : le bilan préalable comprend notamment…'),
    ('exq-JP-CVHEP-6', 'Précautions d’emploi des héparines : le bilan préalable comprend notamment…'),
    ('cvhep-q08', 'Contre-indication des héparines citée dans le cours (hors insuffisance rénale)…'),
    ('exq-JP-CVHEP-8', 'Contre-indication des héparines citée dans le cours (hors insuffisance rénale)…'),
    ('cvin1-q08', 'Parmi les contre-indications des inhibiteurs calciques citées dans le cours…'),
    ('exq-JP-CVIN1-8', 'Parmi les contre-indications des inhibiteurs calciques citées dans le cours…'),
    ('cvin1-q09', 'Autre contre-indication des inhibiteurs calciques citée dans le cours…'),
    ('exq-JP-CVIN1-9', 'Autre contre-indication des inhibiteurs calciques citée dans le cours…'),
    ('exq-gap-idm-04', 'En cas de crise d’infarctus du myocarde, le cours dit d’appeler…'),
    ('exq-gap-vei-04', 'Produits sclérosants de l’insuffisance veineuse cités dans le cours…'),
    ('cvavk-q05', 'Sous AVK, si l’INR est trop bas…'),
    ('exq-JP-CVAVK-5', 'Sous AVK, si l’INR est trop bas…'),
    ('cvavk-q06', 'Sous AVK, si l’INR est trop élevé…'),
    ('exq-JP-CVAVK-6', 'Sous AVK, si l’INR est trop élevé…'),
    ('cvavk-q08', 'Sous AVK, la surveillance de l’INR jusqu’à la zone thérapeutique…'),
    ('exq-JP-CVAVK-8', 'Sous AVK, la surveillance de l’INR jusqu’à la zone thérapeutique…')
)
UPDATE jeupharma.modeles_jeu mj
SET configuration_json = jsonb_set(
  mj.configuration_json,
  '{questions_manuelles}',
  (
    SELECT coalesce(jsonb_agg(
      CASE WHEN map.nouveau IS NOT NULL
        THEN jsonb_set(q.elem, '{question}', to_jsonb(map.nouveau))
        ELSE q.elem
      END
      ORDER BY q.ord
    ), '[]'::jsonb)
    FROM jsonb_array_elements(mj.configuration_json->'questions_manuelles') WITH ORDINALITY AS q(elem, ord)
    LEFT JOIN map ON map.id = q.elem->>'id'
  )
)
WHERE mj.type_jeu = 'quiz'
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(mj.configuration_json->'questions_manuelles') e
    JOIN map ON map.id = e->>'id'
  );

-- Second passage : énoncés encore sans sujet (classe, situation ou molécule).
WITH map(id, nouveau) AS (
  VALUES
    ('cvas1-q02', 'Parmi les associations fixes d’antihypertenseurs citées dans la leçon, on trouve…'),
    ('exq-JP-CVAS1-2', 'Parmi les associations fixes d’antihypertenseurs citées dans la leçon, on trouve…'),
    ('jpmnd04-q04', 'Parmi les facteurs de risque du diabète de type 2 cités dans le cours figurent :'),
    ('jpmnd04-q05', 'Pour le diabète de type 2, le cours cite :'),
    ('jpmnd05-q05', 'Quelle mesure de prévention est recommandée dans le cours sur la surveillance du diabétique ?'),
    ('jpmnd13-q03', 'Parmi les contre-indications des inhibiteurs des alpha-glucosidases citées figurent :'),
    ('jpmnd13-q04', 'Les effets indésirables des inhibiteurs des alpha-glucosidases cités sont :'),
    ('jpmnd13-q05', 'Une précaution des inhibiteurs des alpha-glucosidases citée est :'),
    ('jpmnd15-q04', 'Parmi les signes évocateurs d’hypoglycémie, on retrouve :'),
    ('dyseze-q05', 'Parmi les effets indésirables de l’ézétimibe, le support cite…'),
    ('jpmnd10-q02', 'L’effet des sulfamides hypoglycémiants cité porte :'),
    ('jpmnd10-q05', 'Une association contre-indiquée des sulfamides hypoglycémiants citée est :'),
    ('dyspcs-q04', 'La contre-indication des anticorps anti-PCSK9 citée est…'),
    ('dyspcs-q05', 'Les effets indésirables des anticorps anti-PCSK9 cités comprennent…'),
    ('dysom3-q03', 'L’effet des acides oméga-3 cité dans le support est…'),
    ('jpmnd14-q05', 'Un effet indésirable des gliflozines cité sur la diapositive est :'),
    ('jpmnd11-q05', 'Une interaction contre-indiquée des glinides citée est :'),
    ('dysfib-q02', 'Le mode d’action des fibrates, noté dans le support, est…'),
    ('jpmnd03-q02', 'Concernant la fréquence et le début du diabète de type 1, le cours indique :'),
    ('dysglp-q03', 'L’effet cité des analogues du GLP-1 porte sur…')
)
UPDATE jeupharma.modeles_jeu mj
SET configuration_json = jsonb_set(
  mj.configuration_json,
  '{questions_manuelles}',
  (
    SELECT coalesce(jsonb_agg(
      CASE WHEN map.nouveau IS NOT NULL
        THEN jsonb_set(q.elem, '{question}', to_jsonb(map.nouveau))
        ELSE q.elem
      END
      ORDER BY q.ord
    ), '[]'::jsonb)
    FROM jsonb_array_elements(mj.configuration_json->'questions_manuelles') WITH ORDINALITY AS q(elem, ord)
    LEFT JOIN map ON map.id = q.elem->>'id'
  )
)
WHERE mj.type_jeu = 'quiz'
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(mj.configuration_json->'questions_manuelles') e
    JOIN map ON map.id = e->>'id'
  );
