-- =============================================================================
-- Ops 090 — SRAA simplifié + tests de connaissance en blocs jeu
-- Parcours : cardiovasculaires_deust_2a
-- Leçons : pression_art_rielle, systeme_raa, hypertension_art_rielle
-- Projet : kpjflntnotftpzffjbud
--
-- 1) Réécrit la leçon Système RAA en enchaînement simple :
--    intro 3 hormones → rénine/angiotensine (poumons, ECA, bradykinines)
--    → rôle angiotensine (dont aldostérone) → rétrocontrôle → schémas → conclusion
--    Contenu repris uniquement des blocs déjà présents.
-- 2) Remplace les QCM / trous texte par des modeles_jeu (bloc type jeu).
-- Idempotent.
-- =============================================================================

DO $$
DECLARE
  pid uuid;
  id_pa uuid;
  id_raa uuid;
  id_hta uuid;
  v_modele uuid;
  v_bloc uuid;
  v_sec uuid;
  def jsonb;
  defs constant jsonb := $json$
  [
    {
      "lecon": "pression_art_rielle",
      "code": "JP-CVH1",
      "type": "quiz",
      "titre": "Physiologie de la PA — Test de connaissances",
      "pct": 70,
      "cfg": {
        "consigne": "Questions sur la physiologie de la pression artérielle",
        "nb_auto_max": 0,
        "nb_questions": 5,
        "nb_propositions": 3,
        "champs": [],
        "champs_interroges": [],
        "questions_manuelles": [
          {
            "id": "cvh1-q01",
            "question": "La pression artérielle est liée à…",
            "propositions": [
              "au débit cardiaque, à la volémie et aux résistances vasculaires",
              "uniquement à la pression atmosphérique",
              "uniquement à l’albuminémie"
            ],
            "correct": "au débit cardiaque, à la volémie et aux résistances vasculaires"
          },
          {
            "id": "cvh1-q02",
            "question": "La pression sanguine est le produit du volume d’éjection systolique, de la fréquence cardiaque et de…",
            "propositions": [
              "la résistance périphérique",
              "l’albuminémie",
              "le VGM"
            ],
            "correct": "la résistance périphérique"
          },
          {
            "id": "cvh1-q03",
            "question": "Les barorécepteurs…",
            "propositions": [
              "détectent les variations de pression artérielle",
              "fabriquent l’angiotensinogène",
              "inactivent la bradykinine"
            ],
            "correct": "détectent les variations de pression artérielle"
          },
          {
            "id": "cvh1-q04",
            "question": "Parmi les vasodilatateurs naturels du cours, on trouve…",
            "propositions": [
              "le monoxyde d’azote, la bradykinine et la prostacycline",
              "l’angiotensine II et l’endothéline",
              "la rénine uniquement"
            ],
            "correct": "le monoxyde d’azote, la bradykinine et la prostacycline"
          },
          {
            "id": "cvh1-q05",
            "question": "Lorsque les muscles des artérioles sont soumis à une substance vasodilatatrice, la pression augmente.",
            "propositions": ["Vrai", "Faux", "Uniquement chez la personne âgée"],
            "correct": "Faux"
          }
        ]
      }
    },
    {
      "lecon": "systeme_raa",
      "code": "JP-CVH2",
      "type": "quiz",
      "titre": "Système RAA — Test de connaissances",
      "pct": 70,
      "cfg": {
        "consigne": "Questions sur le système rénine-angiotensine-aldostérone",
        "nb_auto_max": 0,
        "nb_questions": 5,
        "nb_propositions": 3,
        "champs": [],
        "champs_interroges": [],
        "questions_manuelles": [
          {
            "id": "cvh2-q01",
            "question": "L’angiotensinogène est produit…",
            "propositions": [
              "dans les cellules hépatiques",
              "dans les cellules pulmonaires",
              "dans les cellules surrénaliennes"
            ],
            "correct": "dans les cellules hépatiques"
          },
          {
            "id": "cvh2-q02",
            "question": "Dans les poumons, l’enzyme de conversion transforme…",
            "propositions": [
              "l’angiotensine I en angiotensine II",
              "l’aldostérone en rénine",
              "la bradykinine en angiotensinogène"
            ],
            "correct": "l’angiotensine I en angiotensine II"
          },
          {
            "id": "cvh2-q03",
            "question": "L’angiotensine II provoque surtout…",
            "propositions": [
              "une vasoconstriction puissante et une rétention d’eau",
              "une vasodilatation et une baisse de volémie",
              "une inactivation de la rénine"
            ],
            "correct": "une vasoconstriction puissante et une rétention d’eau"
          },
          {
            "id": "cvh2-q04",
            "question": "L’aldostérone…",
            "propositions": [
              "augmente la rétention de sodium et d’eau (augmente la volémie)",
              "inactive la bradykinine",
              "transforme l’angiotensine I en angiotensine II"
            ],
            "correct": "augmente la rétention de sodium et d’eau (augmente la volémie)"
          },
          {
            "id": "cvh2-q05",
            "question": "La bradykinine favorise la natriurèse et la vasodilatation, donc…",
            "propositions": [
              "fait baisser la pression artérielle",
              "fait monter la pression artérielle",
              "n’a aucun effet sur la pression"
            ],
            "correct": "fait baisser la pression artérielle"
          }
        ]
      }
    },
    {
      "lecon": "hypertension_art_rielle",
      "code": "JP-CVH3",
      "type": "quiz",
      "titre": "Pathologie de l’HTA — Test de connaissances",
      "pct": 70,
      "cfg": {
        "consigne": "Questions sur la pathologie de l’hypertension artérielle",
        "nb_auto_max": 0,
        "nb_questions": 5,
        "nb_propositions": 3,
        "champs": [],
        "champs_interroges": [],
        "questions_manuelles": [
          {
            "id": "cvh3-q01",
            "question": "Au repos, une personne est hypertendue si…",
            "propositions": [
              "PAS ≥ 140 mm Hg et/ou PAD ≥ 90 mm Hg",
              "PAS ≥ 120 mm Hg uniquement",
              "PAD ≥ 80 mm Hg uniquement"
            ],
            "correct": "PAS ≥ 140 mm Hg et/ou PAD ≥ 90 mm Hg"
          },
          {
            "id": "cvh3-q02",
            "question": "L’hypertension artérielle essentielle, ou primaire, est…",
            "propositions": [
              "multifactorielle, sans cause précise",
              "toujours due à la grossesse",
              "toujours due à un médicament vasoconstricteur"
            ],
            "correct": "multifactorielle, sans cause précise"
          },
          {
            "id": "cvh3-q03",
            "question": "Une HTA non traitée…",
            "propositions": [
              "favorise l’athérosclérose et augmente le risque d’AVC, d’insuffisance cardiaque, d’angor et d’AOMI",
              "n’a aucun effet sur les artères",
              "protège le rein et la rétine"
            ],
            "correct": "favorise l’athérosclérose et augmente le risque d’AVC, d’insuffisance cardiaque, d’angor et d’AOMI"
          },
          {
            "id": "cvh3-q04",
            "question": "La tension doit se mesurer…",
            "propositions": [
              "au repos",
              "uniquement après un effort intense",
              "uniquement debout en marche"
            ],
            "correct": "au repos"
          },
          {
            "id": "cvh3-q05",
            "question": "Parmi les organes cibles des complications de l’HTA, on trouve…",
            "propositions": [
              "cerveau, yeux, cœur, reins et jambes",
              "uniquement la peau",
              "uniquement l’estomac"
            ],
            "correct": "cerveau, yeux, cœur, reins et jambes"
          }
        ]
      }
    }
  ]
  $json$::jsonb;
BEGIN
  SELECT id INTO pid FROM jeupharma.parcours_apprentissage
  WHERE code = 'cardiovasculaires_deust_2a';
  IF pid IS NULL THEN
    RAISE EXCEPTION '090: parcours cardiovasculaires_deust_2a manquant';
  END IF;

  SELECT id INTO id_pa FROM jeupharma.modules_cours
  WHERE parcours_id = pid AND code = 'pression_art_rielle';
  SELECT id INTO id_raa FROM jeupharma.modules_cours
  WHERE parcours_id = pid AND code = 'systeme_raa';
  SELECT id INTO id_hta FROM jeupharma.modules_cours
  WHERE parcours_id = pid AND code = 'hypertension_art_rielle';

  IF id_pa IS NULL OR id_raa IS NULL OR id_hta IS NULL THEN
    RAISE EXCEPTION '090: une des leçons PA / RAA / HTA est manquante';
  END IF;

  -- ---------------------------------------------------------------------------
  -- 1) Simplifier la leçon Système RAA
  -- ---------------------------------------------------------------------------

  -- Section d’ouverture
  UPDATE jeupharma.module_blocs SET
    module_id = id_raa, ordre = 10, type_bloc = 'section', titre = 'Système RAA',
    payload_json = jsonb_build_object('seed_key', 'reorg-pa-raa-hta:raa:sec'),
    visible = true, updated_at = now()
  WHERE id = '34e23fac-9296-4fc9-b93b-c805daca4d5c';

  -- Phrase d’intro : les 3 hormones sont liées dans le SRAA
  UPDATE jeupharma.module_blocs SET
    module_id = id_raa, ordre = 20, type_bloc = 'texte', titre = NULL,
    payload_json = jsonb_build_object(
      'seed_key', 'reorg-pa-raa-hta:raa:intro',
      'html', '<p>La rénine, l’angiotensine et l’aldostérone sont liées dans un même système : le système rénine-angiotensine-aldostérone (SRAA). Ce système régule la volémie et donc la pression artérielle.</p>'
    ),
    visible = true, updated_at = now()
  WHERE id = '36c1f838-9201-452f-b95c-552bc314738e';

  -- Rénine → angiotensine (enzyme de conversion, poumons, bradykinines)
  UPDATE jeupharma.module_blocs SET
    module_id = id_raa, ordre = 30, type_bloc = 'texte', titre = 'Rénine et angiotensine',
    payload_json = jsonb_build_object(
      'seed_key', 'reorg-pa-raa-hta:raa:renine-angio',
      'html', $h$<p>Le foie produit l’angiotensinogène. Le rein (appareil juxtaglomérulaire) sécrète la rénine, qui transforme l’angiotensinogène en angiotensine I. Dans les poumons, l’enzyme de conversion transforme l’angiotensine I en angiotensine II.</p><p>La même enzyme de conversion (bradykininase II) inactive aussi la bradykinine. Or la bradykinine favorise la natriurèse et la vasodilatation, donc fait baisser la pression artérielle.</p><p>Les IEC (inhibiteurs de l’enzyme de conversion) inhibent l’enzyme de conversion et la bradykininase II.</p>$h$
    ),
    visible = true, updated_at = now()
  WHERE id = '32055212-9b48-471f-a815-e79672694082';

  -- Rôle de l’angiotensine II (dont aldostérone)
  UPDATE jeupharma.module_blocs SET
    module_id = id_raa, ordre = 40, type_bloc = 'texte', titre = 'Rôle de l’angiotensine II',
    payload_json = jsonb_build_object(
      'seed_key', 'reorg-pa-raa-hta:raa:role-angio',
      'html', $h$<p>L’angiotensine II provoque une vasoconstriction puissante et une rétention d’eau :</p><ul><li>par action directe sur les vaisseaux</li><li>par stimulation du centre circulatoire du SNC</li><li>par diminution de la filtration glomérulaire sur le rein</li><li>par déclenchement de la soif et du besoin en sel (hypothalamus)</li><li>par stimulation de la sécrétion d’aldostérone (rétention de sodium et d’eau → augmente la volémie)</li><li>par libération de la vasopressine (ADH) à partir de la posthypophyse (rétention d’eau)</li></ul><p>Résultat : augmentation de la pression artérielle.</p>$h$
    ),
    visible = true, updated_at = now()
  WHERE id = 'a3323679-01eb-4552-8804-99eaf584ae9c';

  -- Rétrocontrôle physiologique
  UPDATE jeupharma.module_blocs SET
    module_id = id_raa, ordre = 50, type_bloc = 'texte', titre = 'Rétrocontrôle physiologique',
    payload_json = jsonb_build_object(
      'seed_key', 'reorg-pa-raa-hta:raa:retrocontrole',
      'html', $h$<p>Lors d’une baisse de la pression artérielle :</p><ul><li>production de rénine</li><li>production d’angiotensine II</li><li>sécrétion d’aldostérone</li><li>vasoconstriction</li><li>rétention hydrosodée</li><li>augmentation de la pression artérielle</li></ul>$h$
    ),
    visible = true, updated_at = now()
  WHERE id = 'cda7c056-5737-42af-b56b-410b7afe5e98';

  -- Schémas
  UPDATE jeupharma.module_blocs SET
    module_id = id_raa, ordre = 60, visible = true, updated_at = now()
  WHERE id = 'e79bf0b6-c85d-4c11-9dec-9a897b0445fa';

  UPDATE jeupharma.module_blocs SET
    module_id = id_raa, ordre = 70, visible = true, updated_at = now()
  WHERE id = 'b9044812-a0f2-4ee6-8545-e2b8a55065aa';

  -- Conclusion
  UPDATE jeupharma.module_blocs SET
    module_id = id_raa, ordre = 80, type_bloc = 'texte', titre = 'Conclusion',
    payload_json = jsonb_build_object(
      'seed_key', 'reorg-pa-raa-hta:raa:conclusion',
      'html', '<p>Le système rénine-angiotensine-aldostérone ramène la pression vers le haut, par vasoconstriction et par rétention d’eau et de sel.</p><p>Lorsque cette pression reste trop élevée dans la durée, les vaisseaux et les organes sont exposés : la leçon suivante décrit la pathologie de l’hypertension artérielle.</p>'
    ),
    visible = true, updated_at = now()
  WHERE id = '357da2d8-6864-44ef-bbe0-d903c94be8cd';

  -- Section test
  UPDATE jeupharma.module_blocs SET
    module_id = id_raa, ordre = 90, type_bloc = 'section', titre = 'Test de connaissances',
    payload_json = jsonb_build_object('seed_key', 'reorg-pa-raa-hta:raa:test-sec'),
    visible = true, updated_at = now()
  WHERE id = '5ba86ac6-8123-4f28-ac91-56145ea46c14';

  -- Blocs RAA devenus redondants / tests texte : suppression
  DELETE FROM jeupharma.module_blocs
  WHERE id IN (
    '31f100e6-0993-43fd-866c-9e47beee4721', -- ancienne section Régulation par le rein
    '3ac45169-cfb6-4f09-9745-fe1a4a2276fb', -- Rénine (fusionné)
    'b042fe1a-61ce-4892-92da-a2b7876029dc', -- Aldostérone et ADH (fusionné)
    'bc7d3201-81ff-46f5-aa49-deb7dfc8f72e', -- texte schéma (fusionné)
    'c2f0ce2f-2d06-4b03-9346-327527063e6c', -- trous texte
    '8d9b9fad-2d70-4635-85d3-5e742992d40e', -- QCM texte
    'e071fa3f-84d6-4361-a39c-f022f04ec737'  -- QCM texte
  );

  -- QCM texte HTA → suppression (remplacés par jeu)
  DELETE FROM jeupharma.module_blocs
  WHERE id IN (
    '4c41b283-c528-4127-b3e8-65a8b675ae0d',
    '83addf11-2b65-4aec-ae73-4860bd196d1b',
    'ebdad0e1-b543-4f9e-9ee7-53204c72d8ae'
  );

  -- QCM texte PA s’il reste
  DELETE FROM jeupharma.module_blocs
  WHERE module_id IN (id_pa, id_raa, id_hta)
    AND type_bloc = 'texte'
    AND (
      titre ILIKE 'QCM%'
      OR payload_json->>'seed_key' IN (
        'hta-rebuild:hta_raa:s26:qcm',
        'hta-rebuild:hta_raa:s27:qcm',
        'hta-rebuild:hta_raa:s28:qcm',
        'hta-rebuild:hta_raa:s19:trous',
        'reorg-pa-raa-hta:hta:qcm-seuil',
        'reorg-pa-raa-hta:hta:qcm-essentielle',
        'reorg-pa-raa-hta:hta:qcm-risque'
      )
    );

  -- Sections test PA / HTA : titre aligné + ordre
  UPDATE jeupharma.module_blocs SET
    titre = 'Test de connaissances', ordre = 900, visible = true, updated_at = now()
  WHERE id = 'acba0641-2f7e-4220-a992-767e2f740020';

  UPDATE jeupharma.module_blocs SET
    titre = 'Test de connaissances', ordre = 900, visible = true, updated_at = now()
  WHERE id = '12856c1c-576b-408f-8062-71b95cc19971';

  UPDATE jeupharma.module_blocs SET
    ordre = 90, titre = 'Test de connaissances', visible = true, updated_at = now()
  WHERE id = '5ba86ac6-8123-4f28-ac91-56145ea46c14';

  -- ---------------------------------------------------------------------------
  -- 2) Créer / lier les quiz JP-CVH1 / H2 / H3 en blocs jeu
  -- ---------------------------------------------------------------------------
  FOR def IN SELECT * FROM jsonb_array_elements(defs) LOOP
    SELECT id INTO v_sec FROM jeupharma.modules_cours
    WHERE parcours_id = pid AND code = def->>'lecon' AND NOT coalesce(est_groupe, false);

    INSERT INTO jeupharma.modeles_jeu (
      code_unique, type_jeu, titre, parcours_id, module_ids, mode,
      configuration_json, en_pause, actif
    ) VALUES (
      def->>'code', def->>'type', def->>'titre', pid, ARRAY[v_sec], 'entrainement',
      coalesce(def->'cfg', '{}'::jsonb)
        || jsonb_build_object('parcours_code', 'cardiovasculaires_deust_2a'),
      false, true
    )
    ON CONFLICT (code_unique) DO UPDATE SET
      type_jeu = EXCLUDED.type_jeu,
      titre = EXCLUDED.titre,
      parcours_id = EXCLUDED.parcours_id,
      module_ids = EXCLUDED.module_ids,
      mode = EXCLUDED.mode,
      configuration_json = EXCLUDED.configuration_json,
      en_pause = false,
      actif = true,
      updated_at = now()
    RETURNING id INTO v_modele;

    SELECT id INTO v_bloc FROM jeupharma.module_blocs
    WHERE module_id = v_sec
      AND type_bloc = 'jeu'
      AND (
        payload_json->>'modele_id' = v_modele::text
        OR payload_json->>'code_unique' = def->>'code'
      )
    LIMIT 1;

    IF v_bloc IS NULL THEN
      INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
      VALUES (
        v_sec, 999, 'jeu', def->>'titre',
        jsonb_build_object(
          'modele_id', v_modele,
          'code_unique', def->>'code',
          'libelle_cta', 'Jouer',
          'type_jeu', def->>'type',
          'seed_key', 'reorg-pa-raa-hta:' || (def->>'lecon') || ':jeu'
        ),
        true
      );
    ELSE
      UPDATE jeupharma.module_blocs SET
        titre = def->>'titre',
        ordre = 999,
        payload_json = coalesce(payload_json, '{}'::jsonb) || jsonb_build_object(
          'modele_id', v_modele,
          'code_unique', def->>'code',
          'libelle_cta', 'Jouer',
          'type_jeu', def->>'type'
        ),
        visible = true,
        updated_at = now()
      WHERE id = v_bloc;
    END IF;

    UPDATE jeupharma.modules_cours SET
      criteres_json = jsonb_build_object(
        'lecture', true,
        'logique', 'et',
        'jeux', jsonb_build_array(jsonb_build_object(
          'modele_id', v_modele,
          'score_min_pct', (def->>'pct')::int
        ))
      ),
      contenu_maj_at = now(),
      updated_at = now()
    WHERE id = v_sec;
  END LOOP;
END;
$$;
