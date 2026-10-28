-- =============================================================================
-- Ops 079 — Phase 4 Cardio DEUST : jeux de validation par leçon
-- Projet : kpjflntnotftpzffjbud
-- Parcours : cardiovasculaires_deust_2a
-- Source : AUDIT_CARDIO_DEUST_PHASE0.md §2+§3 (VALIDÉ)
--
-- - Fix mismatch pathologie_du_globule_rouge (critères JP-CVS2 → JP-HZDNM)
-- - Critères m_dicaments_du_gr : JP-UNTF8 + JP-MHSUM
-- - Créer jeux absents (cv_definitions, cv_idm, cv_arythmies, cv_ic,
--   cv_arterite, cv_veines, cv_urgences)
-- - Recentrer JP-CVH5 (associations) ; enrichir banques (faits cours uniquement)
-- - mode_asso dans configuration_json : les_deux / asso_separe / asso_direct
-- - pathologie_du_globule_blanc : SKIP
-- Idempotent (upsert modeles_jeu par code_unique ; blocs par modele_id).
-- =============================================================================

CREATE OR REPLACE FUNCTION jeupharma.ops_079_set_criteres(
  p_parcours uuid,
  p_lecon text,
  p_codes text[],
  p_pct int
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_mid uuid;
  v_jeux jsonb := '[]'::jsonb;
  c text;
  v_modele uuid;
BEGIN
  SELECT id INTO v_mid FROM jeupharma.modules_cours
  WHERE parcours_id = p_parcours AND code = p_lecon AND NOT coalesce(est_groupe, false);
  IF v_mid IS NULL THEN
    RAISE EXCEPTION 'leçon % introuvable pour critères', p_lecon;
  END IF;

  FOREACH c IN ARRAY p_codes LOOP
    SELECT id INTO v_modele FROM jeupharma.modeles_jeu WHERE code_unique = c;
    IF v_modele IS NULL THEN
      RAISE EXCEPTION 'modèle % manquant pour critères %', c, p_lecon;
    END IF;
    v_jeux := v_jeux || jsonb_build_array(jsonb_build_object(
      'modele_id', v_modele,
      'score_min_pct', p_pct
    ));
  END LOOP;

  UPDATE jeupharma.modules_cours SET
    criteres_json = jsonb_build_object(
      'lecture', true,
      'logique', 'et',
      'jeux', v_jeux
    ),
    contenu_maj_at = now(),
    updated_at = now()
  WHERE id = v_mid;
END;
$$;

DO $$
DECLARE
  pid uuid;
  mid uuid;
  v_modele uuid;
  v_bloc uuid;
  v_cfg jsonb;
  v_lecon text;
  v_code text;
  v_type text;
  v_titre text;
  v_pct int;
  v_mods text[];
  v_mod_ids uuid[];
  i int;
  def record;
BEGIN
  SELECT id INTO pid FROM jeupharma.parcours_apprentissage
  WHERE code = 'cardiovasculaires_deust_2a';
  IF pid IS NULL THEN
    RAISE EXCEPTION 'parcours cardiovasculaires_deust_2a manquant';
  END IF;

  -- -------------------------------------------------------------------------
  -- Table temporaire des jeux à upsert
  -- -------------------------------------------------------------------------
  CREATE TEMP TABLE _079_jeux (
    code text PRIMARY KEY,
    type_jeu text NOT NULL,
    titre text NOT NULL,
    lecon text NOT NULL,
    mods text[] NOT NULL,
    pct int NOT NULL DEFAULT 70,
    req boolean NOT NULL DEFAULT true,
    cfg jsonb NOT NULL
  ) ON COMMIT DROP;

  -- ===== EXISTANTS À AMÉLIORER =====

  -- JP-HZDNM : garder classement ; mode_asso les_deux (fer+folique) ;
  -- ascorbate+fer = asso_separe (métadonnée + items déjà séparés dans zones)
  INSERT INTO _079_jeux(code, type_jeu, titre, lecon, mods, pct, req, cfg)
  SELECT 'JP-HZDNM', mj.type_jeu, 'Pathologie GR — Classement anémies',
         'pathologie_du_globule_rouge', ARRAY['pathologie_du_globule_rouge'], 70, true,
         coalesce(mj.configuration_json, '{}'::jsonb)
           || jsonb_build_object(
                'parcours_code', 'cardiovasculaires_deust_2a',
                'mode_asso', 'les_deux',
                'mode_asso_detail', jsonb_build_object(
                  'Sels ferreux + acide folique', 'les_deux',
                  'Acide ascorbique + sulfate ferreux', 'asso_separe'
                ),
                'consigne', coalesce(mj.configuration_json->>'consigne',
                  'Classez chaque médicament dans la catégorie d''anémie / usage du cours')
              )
  FROM jeupharma.modeles_jeu mj WHERE mj.code_unique = 'JP-HZDNM';

  -- JP-UNTF8 classement antiagrégants / anticoagulants
  INSERT INTO _079_jeux(code, type_jeu, titre, lecon, mods, pct, req, cfg)
  SELECT 'JP-UNTF8', mj.type_jeu, 'Médicaments plaquettes — Classement classes',
         'm_dicaments_du_gr', ARRAY['m_dicaments_du_gr'], 70, true,
         coalesce(mj.configuration_json, '{}'::jsonb)
           || jsonb_build_object(
                'parcours_code', 'cardiovasculaires_deust_2a',
                'mode_asso', 'les_deux',
                'mode_asso_detail', jsonb_build_object(
                  'Clopidogrel + aspirine', 'les_deux'
                )
              )
  FROM jeupharma.modeles_jeu mj WHERE mj.code_unique = 'JP-UNTF8';

  -- JP-MHSUM quiz : banques manuelles ancrées cours + mode_asso
  INSERT INTO _079_jeux(code, type_jeu, titre, lecon, mods, pct, req, cfg)
  SELECT 'JP-MHSUM', 'quiz', 'Médicaments plaquettes — Quiz mécanismes',
         'm_dicaments_du_gr', ARRAY['m_dicaments_du_gr'], 70, true,
         (coalesce(mj.configuration_json, '{}'::jsonb)
           - 'questions_manuelles')
           || jsonb_build_object(
                'parcours_code', 'cardiovasculaires_deust_2a',
                'nb_auto_max', 4,
                'nb_questions', 8,
                'nb_propositions', 3,
                'mode_asso', 'les_deux',
                'mode_asso_detail', jsonb_build_object(
                  'Clopidogrel + aspirine', 'les_deux'
                ),
                'questions_manuelles', $q$
                [
                  {"id":"mhsum-q01","question":"Les anti-coagulants oraux directs de la famille des -xaban agissent en bloquant…","propositions":["un facteur activé (facteur Xa)","la vitamine K","les récepteurs P2Y12"],"correct":"un facteur activé (facteur Xa)"},
                  {"id":"mhsum-q02","question":"La famille des -gatran bloque principalement…","propositions":["le facteur IIa (thrombine)","le TXA2","le facteur VII"],"correct":"le facteur IIa (thrombine)"},
                  {"id":"mhsum-q03","question":"Les salicylés exercent un effet anti-agrégant surtout en inhibant…","propositions":["les cyclooxygénases (COX)","le facteur Xa","l’INR"],"correct":"les cyclooxygénases (COX)"},
                  {"id":"mhsum-q04","question":"La famille « -grel- » agit en bloquant le récepteur…","propositions":["P2Y12","HMG-CoA","AT1"],"correct":"P2Y12"},
                  {"id":"mhsum-q05","question":"DuoPlavin / clopidogrel + aspirine associe…","propositions":["un anti-P2Y12 et un inhibiteur de COX","deux AVK","une HBPM et un AOD"],"correct":"un anti-P2Y12 et un inhibiteur de COX"},
                  {"id":"mhsum-q06","question":"Sous AVK, la cible d’INR usuelle citée dans le cours est…","propositions":["entre 2 et 3","entre 0,8 et 1,2","supérieure à 5"],"correct":"entre 2 et 3"},
                  {"id":"mhsum-q07","question":"Le relais héparine → AVK se poursuit jusqu’à…","propositions":["INR cible 2–3 obtenu à 2 reprises (24/48 h)","la première prise d’AVK seule","un TCA normalisé une seule fois"],"correct":"INR cible 2–3 obtenu à 2 reprises (24/48 h)"},
                  {"id":"mhsum-q08","question":"Dans DuoPlavin, le composant « aspirine » correspond à…","propositions":["l’acide acétylsalicylique","la warfarine","le fondaparinux"],"correct":"l’acide acétylsalicylique"}
                ]
                $q$::jsonb
              )
  FROM jeupharma.modeles_jeu mj WHERE mj.code_unique = 'JP-MHSUM';

  -- JP-CSANG / JP-PPLAQ / JP-CVC1 / HTA : activer + scores 70 ; enrichir légèrement
  INSERT INTO _079_jeux(code, type_jeu, titre, lecon, mods, pct, req, cfg)
  SELECT 'JP-CSANG', 'quiz', mj.titre, 'rappel_sang', ARRAY['rappel_sang'], 70, true,
         coalesce(mj.configuration_json, '{}'::jsonb)
           || jsonb_build_object('parcours_code', 'cardiovasculaires_deust_2a', 'nb_questions', 5)
  FROM jeupharma.modeles_jeu mj WHERE mj.code_unique = 'JP-CSANG';

  INSERT INTO _079_jeux(code, type_jeu, titre, lecon, mods, pct, req, cfg)
  SELECT 'JP-PPLAQ', 'quiz', mj.titre, 'pathologie_plaquettes', ARRAY['pathologie_plaquettes'], 70, true,
         coalesce(mj.configuration_json, '{}'::jsonb)
           || jsonb_build_object('parcours_code', 'cardiovasculaires_deust_2a', 'nb_questions', 5)
  FROM jeupharma.modeles_jeu mj WHERE mj.code_unique = 'JP-PPLAQ';

  INSERT INTO _079_jeux(code, type_jeu, titre, lecon, mods, pct, req, cfg)
  SELECT 'JP-CVC1', 'quiz', 'Angor — Quiz crise vs traitement de fond',
         'cv_angor', ARRAY['cv_angor'], 70, true,
         jsonb_build_object(
           'parcours_code', 'cardiovasculaires_deust_2a',
           'champs', jsonb_build_array('indications','classe_pharmacologique','precautions_emploi'),
           'champs_interroges', jsonb_build_array('indications','classe_pharmacologique','precautions_emploi'),
           'nb_auto_max', 3,
           'nb_questions', 8,
           'nb_propositions', 3,
           'questions_manuelles', $q$
           [
             {"id":"cvc1-q01","question":"L’ivabradine (Procoralan®) agit principalement au niveau du…","propositions":["nœud sinusal","récepteur P2Y12","facteur Xa"],"correct":"nœud sinusal"},
             {"id":"cvc1-q02","question":"Les dérivés nitrés d’action rapide (voie sublinguale) sont surtout un traitement…","propositions":["de crise","au long cours exclusif sans autre classe","anticoagulant"],"correct":"de crise"},
             {"id":"cvc1-q03","question":"La molécule de Corvasal® citée dans le cours est…","propositions":["la molsidomine","l’amiodarone","la digoxine"],"correct":"la molsidomine"},
             {"id":"cvc1-q04","question":"Ikorel® contient…","propositions":["du nicorandil","de la warfarine","du furosémide"],"correct":"du nicorandil"},
             {"id":"cvc1-q05","question":"Contre-indication majeure des dérivés nitrés citée dans le cours :","propositions":["hypotension sévère","hyperkaliémie isolée","drépanocytose"],"correct":"hypotension sévère"}
           ]
           $q$::jsonb
         )
  FROM jeupharma.modeles_jeu mj WHERE mj.code_unique = 'JP-CVC1';

  INSERT INTO _079_jeux(code, type_jeu, titre, lecon, mods, pct, req, cfg)
  SELECT 'JP-CVH1', mj.type_jeu, mj.titre, 'hta_rappel_pa', ARRAY['hta_rappel_pa'], 70, true,
         coalesce(mj.configuration_json, '{}'::jsonb)
           || jsonb_build_object(
                'parcours_code', 'cardiovasculaires_deust_2a',
                'nb_auto_max', 0,
                'questions_manuelles', coalesce(mj.configuration_json->'questions_manuelles', '[]'::jsonb)
                  || $q$[{"id":"cvh1-qpa","question":"La pression sanguine est le produit du volume d’éjection systolique, de la fréquence cardiaque et de…","propositions":["la résistance périphérique","l’albuminémie","le VGM"],"correct":"la résistance périphérique"}]$q$::jsonb
              )
  FROM jeupharma.modeles_jeu mj WHERE mj.code_unique = 'JP-CVH1';

  INSERT INTO _079_jeux(code, type_jeu, titre, lecon, mods, pct, req, cfg)
  SELECT 'JP-CVH2', mj.type_jeu, 'RAA — Tableau à trous (IEC / sartans / physio)',
         'hta_raa', ARRAY['hta_raa'], 70, true,
         coalesce(mj.configuration_json, '{}'::jsonb)
           || jsonb_build_object('parcours_code', 'cardiovasculaires_deust_2a')
  FROM jeupharma.modeles_jeu mj WHERE mj.code_unique = 'JP-CVH2';

  INSERT INTO _079_jeux(code, type_jeu, titre, lecon, mods, pct, req, cfg)
  SELECT 'JP-CVH3', mj.type_jeu, mj.titre, 'hta_clinique', ARRAY['hta_clinique'], 70, true,
         coalesce(mj.configuration_json, '{}'::jsonb)
           || jsonb_build_object('parcours_code', 'cardiovasculaires_deust_2a')
  FROM jeupharma.modeles_jeu mj WHERE mj.code_unique = 'JP-CVH3';

  INSERT INTO _079_jeux(code, type_jeu, titre, lecon, mods, pct, req, cfg)
  SELECT 'JP-CVH4', mj.type_jeu, mj.titre, 'hta_classes', ARRAY['hta_classes'], 70, true,
         (coalesce(mj.configuration_json, '{}'::jsonb))
           || jsonb_build_object(
                'parcours_code', 'cardiovasculaires_deust_2a',
                'nb_auto_max', 4,
                'nb_questions', 10,
                'questions_manuelles', $q$
                [
                  {"id":"cvh4-q01","question":"Quel effet secondaire typique des IEC est cité dans le cours ?","propositions":["toux sèche persistante","photosensibilisation cornéenne","vision colorée en jaune"],"correct":"toux sèche persistante"}
                ]
                $q$::jsonb
              )
  FROM jeupharma.modeles_jeu mj WHERE mj.code_unique = 'JP-CVH4';

  -- JP-CVH5 recentré associations (plus « révision finale »)
  INSERT INTO _079_jeux(code, type_jeu, titre, lecon, mods, pct, req, cfg)
  VALUES (
    'JP-CVH5', 'quiz',
    'Associations HTA — Composition et dispensation',
    'hta_associations', ARRAY['hta_associations'], 70, true,
    jsonb_build_object(
      'parcours_code', 'cardiovasculaires_deust_2a',
      'mode_asso', 'les_deux',
      'nb_auto_max', 0,
      'nb_questions', 10,
      'nb_propositions', 3,
      'champs', '[]'::jsonb,
      'champs_interroges', '[]'::jsonb,
      'questions_manuelles', $q$
      [
        {"id":"cvh5-q01","question":"Coaprovel® associe irbésartan et…","propositions":["hydrochlorothiazide","amlodipine","bisoprolol"],"correct":"hydrochlorothiazide"},
        {"id":"cvh5-q02","question":"Lodoz® / Wytens® associe…","propositions":["bisoprolol et hydrochlorothiazide","valsartan et amlodipine","périndopril et indapamide"],"correct":"bisoprolol et hydrochlorothiazide"},
        {"id":"cvh5-q03","question":"Exforge® associe valsartan et…","propositions":["amlodipine","hydrochlorothiazide","chlortalidone"],"correct":"amlodipine"},
        {"id":"cvh5-q04","question":"Coveram® associe…","propositions":["périndopril et amlodipine","aténolol et nifédipine","spironolactone et altizide"],"correct":"périndopril et amlodipine"},
        {"id":"cvh5-q05","question":"Preterax / Bipreterax associe périndopril et…","propositions":["indapamide","amlodipine","furosémide"],"correct":"indapamide"},
        {"id":"cvh5-q06","question":"Dans le schéma du cours, l’association ARA II + IEC est…","propositions":["non retenue","recommandée en première intention","réservée aux β-bloquants"],"correct":"non retenue"},
        {"id":"cvh5-q07","question":"Tarka® associe…","propositions":["vérapamil et trandolapril","irbésartan et HCT","félodipine et métoprolol"],"correct":"vérapamil et trandolapril"},
        {"id":"cvh5-q08","question":"Natrixam® associe…","propositions":["amlodipine et indapamide","timolol, amiloride et HCT","losartan et HCT"],"correct":"amlodipine et indapamide"},
        {"id":"cvh5-q09","question":"Hypotension orthostatique (consensus cité) : chute de PAS ≥ …","propositions":["20 mmHg","5 mmHg","50 mmHg"],"correct":"20 mmHg"},
        {"id":"cvh5-q10","question":"Dans Lodoz, le composant diurétique est…","propositions":["l’hydrochlorothiazide","l’amlodipine","le périndopril"],"correct":"l’hydrochlorothiazide"},
        {"id":"cvh5-q11","question":"Captea® / Ecazide® associe captopril et…","propositions":["hydrochlorothiazide","nifédipine","spironolactone"],"correct":"hydrochlorothiazide"},
        {"id":"cvh5-q12","question":"Twynsta® associe telmisartan et…","propositions":["amlodipine","indapamide","aténolol"],"correct":"amlodipine"}
      ]
      $q$::jsonb
    )
  );

  -- ===== NOUVEAUX JEUX =====

  -- cv_definitions — appariement artère ↔ complication
  INSERT INTO _079_jeux(code, type_jeu, titre, lecon, mods, pct, req, cfg)
  VALUES (
    'JP-CVDF1', 'appariement',
    'Athérome — Appariement artère / complication',
    'cv_definitions', ARRAY['cv_definitions'], 70, true,
    jsonb_build_object(
      'parcours_code', 'cardiovasculaires_deust_2a',
      'consigne', 'Reliez chaque territoire artériel à la complication / manifestation du cours',
      'gauche', $g$
      [
        {"id":"g-car","label":"Artères carotides","source":"manuel"},
        {"id":"g-cor","label":"Artères coronaires","source":"manuel"},
        {"id":"g-mi","label":"Artères des membres inférieurs","source":"manuel"},
        {"id":"g-athero","label":"Athérosclérose","source":"manuel"},
        {"id":"g-arterio","label":"Artériosclérose (général)","source":"manuel"}
      ]
      $g$::jsonb,
      'droite', $d$
      [
        {"id":"d-avc","label":"AIT / AVC (céphalées, vertiges)","source":"manuel"},
        {"id":"d-idm","label":"Angor et IDM","source":"manuel"},
        {"id":"d-aomi","label":"AOMI (douleurs, instabilité à la marche)","source":"manuel"},
        {"id":"d-plaque","label":"Plaques d’athérome de l’intima","source":"manuel"},
        {"id":"d-scler","label":"Durcissement / perte d’élasticité (± HTA essentielle)","source":"manuel"}
      ]
      $d$::jsonb,
      'paires', $p$
      [
        {"gauche_id":"g-car","droite_id":"d-avc"},
        {"gauche_id":"g-cor","droite_id":"d-idm"},
        {"gauche_id":"g-mi","droite_id":"d-aomi"},
        {"gauche_id":"g-athero","droite_id":"d-plaque"},
        {"gauche_id":"g-arterio","droite_id":"d-scler"}
      ]
      $p$::jsonb
    )
  );

  -- cv_idm — classement BASIC (ordonnance fragile : classes pharma non alignées)
  INSERT INTO _079_jeux(code, type_jeu, titre, lecon, mods, pct, req, cfg)
  VALUES (
    'JP-CVIDM', 'classement',
    'IDM — Classement ordonnance de sortie BASIC',
    'cv_idm', ARRAY['cv_idm'], 70, true,
    jsonb_build_object(
      'parcours_code', 'cardiovasculaires_deust_2a',
      'consigne', 'Classez chaque molécule / item dans la lettre BASIC du cours (sortie post-IDM)',
      'items', $i$
      [
        {"id":"i-biso","label":"Bisoprolol","source":"matrice","entite":"matrice","entite_id":"e7e28f00-089d-4994-b9aa-8b20b02e955d"},
        {"id":"i-aas","label":"Acide acétylsalicylique","source":"matrice","entite":"matrice","entite_id":"de52a954-d5c1-434a-ab55-df2d6af685d3"},
        {"id":"i-ator","label":"Atorvastatine","source":"matrice","entite":"matrice","entite_id":"05a1ca48-bc52-4fa8-9aad-afb7b8cd8106"},
        {"id":"i-rami","label":"Ramipril","source":"matrice","entite":"matrice","entite_id":"ba7873d4-c9c4-4cc8-b554-bc67858abdd2"},
        {"id":"i-ena","label":"Enalapril","source":"matrice","entite":"matrice","entite_id":"310b4ade-e272-43e4-9eba-a98717417853"},
        {"id":"i-peri","label":"Perindopril","source":"matrice","entite":"matrice","entite_id":"54b0220a-c292-4fc8-b891-d36aabf546da"},
        {"id":"i-cap","label":"Captopril","source":"matrice","entite":"matrice","entite_id":"24606e62-43c9-430d-9420-c17cfd41fcf3"},
        {"id":"i-lisi","label":"Lisinopril","source":"matrice","entite":"matrice","entite_id":"580b6957-f458-4e12-953a-460eb570c6eb"},
        {"id":"i-ctrl","label":"Contrôle des facteurs de risque (tabac, HTA, diabète…)","source":"manuel"}
      ]
      $i$::jsonb,
      'zones', $z$
      [
        {"id":"z-b","label":"B — Bêtabloquant","source":"manuel","item_ids":["i-biso"]},
        {"id":"z-a","label":"A — Anti-agrégant plaquettaire","source":"manuel","item_ids":["i-aas"]},
        {"id":"z-s","label":"S — Statine","source":"manuel","item_ids":["i-ator"]},
        {"id":"z-i","label":"I — IEC","source":"manuel","item_ids":["i-rami","i-ena","i-peri","i-cap","i-lisi"]},
        {"id":"z-c","label":"C — Contrôle des facteurs de risque","source":"manuel","item_ids":["i-ctrl"]}
      ]
      $z$::jsonb
    )
  );

  -- cv_arythmies — appariement Vaughan-Williams
  INSERT INTO _079_jeux(code, type_jeu, titre, lecon, mods, pct, req, cfg)
  VALUES (
    'JP-CVVW1', 'appariement',
    'Arythmies — Appariement Vaughan-Williams',
    'cv_arythmies', ARRAY['cv_arythmies'], 70, true,
    jsonb_build_object(
      'parcours_code', 'cardiovasculaires_deust_2a',
      'consigne', 'Reliez chaque anti-arythmique du cours à sa classe de Vaughan-Williams',
      'gauche', $g$
      [
        {"id":"g-hq","label":"Hydroquinidine (Serecor®)","source":"matrice","entite":"matrice","entite_id":"926ffb57-18e1-49e1-99ee-25134635ca09"},
        {"id":"g-dis","label":"Disopyramide (Rythmodan®)","source":"matrice","entite":"matrice","entite_id":"cfa2225f-6403-4f61-8b1e-2fad485e2454"},
        {"id":"g-fle","label":"Flécaïnide (Flécaïne®)","source":"matrice","entite":"matrice","entite_id":"127f367d-29f2-44ce-8a9e-a74e82234a4f"},
        {"id":"g-pro","label":"Propafénone (Rythmol®)","source":"matrice","entite":"matrice","entite_id":"f82535b5-77aa-422c-bb62-859871caf1ba"},
        {"id":"g-ami","label":"Amiodarone (Cordarone®)","source":"matrice","entite":"matrice","entite_id":"658e58fc-f6af-4869-ba8a-ad9aeb30ce30"},
        {"id":"g-sot","label":"Sotalol (Sotalex®)","source":"matrice","entite":"matrice","entite_id":"3d7303ca-9fe0-4fae-b138-9cdead53f4e7"},
        {"id":"g-ver","label":"Vérapamil (Isoptine®)","source":"matrice","entite":"matrice","entite_id":"49d55f27-4be4-43a2-a422-a15f3aa64df5"},
        {"id":"g-dil","label":"Diltiazem (Tildiem®)","source":"matrice","entite":"matrice","entite_id":"410b703a-131b-4074-9b38-40d43e41b282"}
      ]
      $g$::jsonb,
      'droite', $d$
      [
        {"id":"d-c1-hq","label":"Classe 1 — inhibiteurs Na+","source":"manuel"},
        {"id":"d-c1-dis","label":"Classe 1 — inhibiteurs Na+","source":"manuel"},
        {"id":"d-c1-fle","label":"Classe 1 — inhibiteurs Na+","source":"manuel"},
        {"id":"d-c1-pro","label":"Classe 1 — inhibiteurs Na+","source":"manuel"},
        {"id":"d-c3-ami","label":"Classe 3 — inhibiteurs K+","source":"manuel"},
        {"id":"d-c3-sot","label":"Classe 3 — inhibiteurs K+ (sotalol aussi classe 2)","source":"manuel"},
        {"id":"d-c4-ver","label":"Classe 4 — inhibiteurs calciques","source":"manuel"},
        {"id":"d-c4-dil","label":"Classe 4 — inhibiteurs calciques","source":"manuel"}
      ]
      $d$::jsonb,
      'paires', $p$
      [
        {"gauche_id":"g-hq","droite_id":"d-c1-hq"},
        {"gauche_id":"g-dis","droite_id":"d-c1-dis"},
        {"gauche_id":"g-fle","droite_id":"d-c1-fle"},
        {"gauche_id":"g-pro","droite_id":"d-c1-pro"},
        {"gauche_id":"g-ami","droite_id":"d-c3-ami"},
        {"gauche_id":"g-sot","droite_id":"d-c3-sot"},
        {"gauche_id":"g-ver","droite_id":"d-c4-ver"},
        {"gauche_id":"g-dil","droite_id":"d-c4-dil"}
      ]
      $p$::jsonb
    )
  );

  -- cv_ic — classement rôle IC + mode_asso ARNI
  INSERT INTO _079_jeux(code, type_jeu, titre, lecon, mods, pct, req, cfg)
  VALUES (
    'JP-CVIC1', 'classement',
    'Insuffisance cardiaque — Classement classes / rôles',
    'cv_ic', ARRAY['cv_ic'], 70, true,
    jsonb_build_object(
      'parcours_code', 'cardiovasculaires_deust_2a',
      'mode_asso', 'asso_direct',
      'mode_asso_detail', jsonb_build_object(
        'Sacubitril + valsartan', 'asso_direct',
        'Valsartan', 'asso_separe'
      ),
      'consigne', 'Classez chaque molécule dans le rôle / classe du cours (IC)',
      'items', $i$
      [
        {"id":"i-fosi","label":"Fosinopril","source":"matrice","entite":"matrice","entite_id":"0528bb96-0abc-4a19-8abc-94adf3d5fe22"},
        {"id":"i-los","label":"Losartan","source":"matrice","entite":"matrice","entite_id":"88a0f4b5-e292-49ca-8097-2be5396912a2"},
        {"id":"i-val","label":"Valsartan","source":"matrice","entite":"matrice","entite_id":"0130eef2-c8af-4d30-9370-5e61b8215d0d"},
        {"id":"i-can","label":"Candésartan","source":"matrice","entite":"matrice","entite_id":"896e80c2-39b4-44bd-aa72-789d9773ba32"},
        {"id":"i-arn","label":"Sacubitril + valsartan (Entresto®)","source":"matrice","entite":"matrice","entite_id":"0415e982-3813-4b5c-8534-e93933343ce8"},
        {"id":"i-furo","label":"Furosémide","source":"matrice","entite":"matrice","entite_id":"09105fdb-e045-441b-81d4-f5df4ccab0f8"},
        {"id":"i-spi","label":"Spironolactone","source":"matrice","entite":"matrice","entite_id":"8dc7d201-d3a1-4a16-a116-37ab4f0b1fa6"},
        {"id":"i-epl","label":"Éplérénone","source":"matrice","entite":"matrice","entite_id":"3e959294-a112-4b57-8cdc-ff7479bbe8a1"},
        {"id":"i-dig","label":"Digoxine","source":"matrice","entite":"matrice","entite_id":"7967614d-17db-4996-ae5c-44184c883f73"},
        {"id":"i-dapa","label":"Dapagliflozine","source":"matrice","entite":"matrice","entite_id":"c2ae6d77-b733-4f1e-9bf2-567055e7e9b8"}
      ]
      $i$::jsonb,
      'zones', $z$
      [
        {"id":"z-iec","label":"IEC (réduction résistances)","source":"manuel","item_ids":["i-fosi"]},
        {"id":"z-ara","label":"ARA 2","source":"manuel","item_ids":["i-los","i-val","i-can"]},
        {"id":"z-arni","label":"ARNI (ARA2 + inhibiteur néprilysine)","source":"manuel","item_ids":["i-arn"]},
        {"id":"z-anse","label":"Diurétique de l’anse","source":"manuel","item_ids":["i-furo"]},
        {"id":"z-aldo","label":"Antagoniste de l’aldostérone","source":"manuel","item_ids":["i-spi","i-epl"]},
        {"id":"z-dig","label":"Digitalique (3 R)","source":"manuel","item_ids":["i-dig"]},
        {"id":"z-sglt","label":"Inhibiteur SGLT-2 (cardioprotecteur)","source":"manuel","item_ids":["i-dapa"]}
      ]
      $z$::jsonb
    )
  );

  -- cv_arterite — quiz
  INSERT INTO _079_jeux(code, type_jeu, titre, lecon, mods, pct, req, cfg)
  VALUES (
    'JP-CVART', 'quiz',
    'Artérite — Quiz AOMI et vasodilatateurs',
    'cv_arterite', ARRAY['cv_arterite'], 70, true,
    jsonb_build_object(
      'parcours_code', 'cardiovasculaires_deust_2a',
      'nb_auto_max', 0,
      'nb_questions', 6,
      'nb_propositions', 3,
      'champs', '[]'::jsonb,
      'questions_manuelles', $q$
      [
        {"id":"cvart-q01","question":"L’artérite entraîne une diminution de l’apport sanguin par dysfonctionnement des…","propositions":["artères","veines uniquement","lymphatiques seuls"],"correct":"artères"},
        {"id":"cvart-q02","question":"L’AOMI correspond surtout à un rétrécissement des artères qui irriguent…","propositions":["les membres inférieurs","le foie","les méninges"],"correct":"les membres inférieurs"},
        {"id":"cvart-q03","question":"L’origine la plus fréquente de l’AOMI selon le cours est…","propositions":["athéromateuse","infectieuse virale","traumatique isolée"],"correct":"athéromateuse"},
        {"id":"cvart-q04","question":"Praxilène® contient…","propositions":["du naftidrofuryl","de la diosmine","de l’adrénaline"],"correct":"du naftidrofuryl"},
        {"id":"cvart-q05","question":"Le traitement de fond de l’AOMI cible aussi la prévention CV avec…","propositions":["antiagrégants, statines, antihypertenseurs","uniquement des laxatifs","uniquement des veinotoniques oraux"],"correct":"antiagrégants, statines, antihypertenseurs"},
        {"id":"cvart-q06","question":"Parmi les vasodilatateurs périphériques cités : naftidrofuryl, trimétazidine et…","propositions":["piribédil","warfarine","digoxine"],"correct":"piribédil"}
      ]
      $q$::jsonb
    )
  );

  -- cv_veines — appariement prise en charge
  INSERT INTO _079_jeux(code, type_jeu, titre, lecon, mods, pct, req, cfg)
  VALUES (
    'JP-CVVEI', 'appariement',
    'Veines — Appariement symptômes / prise en charge',
    'cv_veines', ARRAY['cv_veines'], 70, true,
    jsonb_build_object(
      'parcours_code', 'cardiovasculaires_deust_2a',
      'consigne', 'Reliez chaque élément du cours à son correspondant',
      'gauche', $g$
      [
        {"id":"g-base","label":"Traitement de base de l’insuffisance veineuse","source":"manuel"},
        {"id":"g-sclero","label":"Sclérothérapie","source":"manuel"},
        {"id":"g-veino","label":"Veinotoniques (Daflon®, Ginkor®…)","source":"manuel"},
        {"id":"g-stade6","label":"Ulcères veineux","source":"manuel"},
        {"id":"g-hemo","label":"Crise hémorroïdaire","source":"manuel"}
      ]
      $g$::jsonb,
      'droite', $d$
      [
        {"id":"d-cont","label":"Contention veineuse (pression dégressive)","source":"manuel"},
        {"id":"d-inj","label":"Injection de sclérosants (Trombovar®…)","source":"manuel"},
        {"id":"d-sym","label":"Jambes lourdes / signes fonctionnels (± hémorroïdes)","source":"manuel"},
        {"id":"d-stade","label":"6e stade d’évolution cité","source":"manuel"},
        {"id":"d-loc","label":"Veinotoniques + traitements locaux (± corticoïdes…)","source":"manuel"}
      ]
      $d$::jsonb,
      'paires', $p$
      [
        {"gauche_id":"g-base","droite_id":"d-cont"},
        {"gauche_id":"g-sclero","droite_id":"d-inj"},
        {"gauche_id":"g-veino","droite_id":"d-sym"},
        {"gauche_id":"g-stade6","droite_id":"d-stade"},
        {"gauche_id":"g-hemo","droite_id":"d-loc"}
      ]
      $p$::jsonb
    )
  );

  -- cv_urgences — quiz
  INSERT INTO _079_jeux(code, type_jeu, titre, lecon, mods, pct, req, cfg)
  VALUES (
    'JP-CVURG', 'quiz',
    'Urgences CV — Quiz OAP et adrénaline',
    'cv_urgences', ARRAY['cv_urgences'], 70, true,
    jsonb_build_object(
      'parcours_code', 'cardiovasculaires_deust_2a',
      'nb_auto_max', 0,
      'nb_questions', 5,
      'nb_propositions', 3,
      'champs', '[]'::jsonb,
      'questions_manuelles', $q$
      [
        {"id":"cvurg-q01","question":"L’OAP correspond à du liquide plasmatique au niveau des…","propositions":["alvéoles pulmonaires","veines hémorroïdaires","articulations"],"correct":"alvéoles pulmonaires"},
        {"id":"cvurg-q02","question":"Parmi les indications citées pour l’adrénaline dans le cours : arrêt cardiaque et…","propositions":["choc anaphylactique","anémie ferriprive","ulcère veineux"],"correct":"choc anaphylactique"},
        {"id":"cvurg-q03","question":"Les médicaments d’urgence cités appartiennent notamment à la classe pharmacologique des…","propositions":["sympathomimétiques injectables","veinotoniques oraux","AVK"],"correct":"sympathomimétiques injectables"},
        {"id":"cvurg-q04","question":"Anapen® / Jext® sont cités pour une administration…","propositions":["IM (choc anaphylactique)","orale quotidienne au long cours","sublinguale d’angor"],"correct":"IM (choc anaphylactique)"},
        {"id":"cvurg-q05","question":"Signe clinique d’OAP cité : toux quinteuse avec…","propositions":["mousse rosée","expectoration purulente seule","hémoptysie d’origine veineuse"],"correct":"mousse rosée"}
      ]
      $q$::jsonb
    )
  );

  -- -------------------------------------------------------------------------
  -- Upsert modeles + blocs + critères
  -- -------------------------------------------------------------------------
  FOR def IN
    SELECT * FROM _079_jeux ORDER BY code
  LOOP
    v_code := def.code;
    v_type := def.type_jeu;
    v_titre := def.titre;
    v_lecon := def.lecon;
    v_pct := def.pct;
    v_cfg := def.cfg;
    v_mods := def.mods;

    v_mod_ids := '{}'::uuid[];
    FOR i IN 1 .. coalesce(array_length(v_mods, 1), 0) LOOP
      SELECT id INTO mid FROM jeupharma.modules_cours
      WHERE parcours_id = pid AND code = v_mods[i] AND NOT coalesce(est_groupe, false);
      IF mid IS NULL THEN
        RAISE EXCEPTION 'leçon pool % introuvable pour %', v_mods[i], v_code;
      END IF;
      v_mod_ids := array_append(v_mod_ids, mid);
    END LOOP;

    SELECT id INTO mid FROM jeupharma.modules_cours
    WHERE parcours_id = pid AND code = v_lecon AND NOT coalesce(est_groupe, false);
    IF mid IS NULL THEN
      RAISE EXCEPTION 'leçon cible % introuvable', v_lecon;
    END IF;

    INSERT INTO jeupharma.modeles_jeu (
      code_unique, type_jeu, titre, parcours_id, module_ids, mode,
      configuration_json, en_pause, actif
    ) VALUES (
      v_code, v_type, v_titre, pid, v_mod_ids, 'entrainement',
      v_cfg, false, true
    )
    ON CONFLICT (code_unique) DO UPDATE SET
      type_jeu = EXCLUDED.type_jeu,
      titre = EXCLUDED.titre,
      parcours_id = EXCLUDED.parcours_id,
      module_ids = EXCLUDED.module_ids,
      configuration_json = EXCLUDED.configuration_json,
      en_pause = false,
      actif = true,
      updated_at = now()
    RETURNING id INTO v_modele;

    SELECT id INTO v_bloc FROM jeupharma.module_blocs
    WHERE module_id = mid
      AND type_bloc = 'jeu'
      AND (
        payload_json->>'modele_id' = v_modele::text
        OR payload_json->>'code_unique' = v_code
      )
    LIMIT 1;

    IF v_bloc IS NULL THEN
      INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
      VALUES (
        mid, 999, 'jeu', v_titre,
        jsonb_build_object(
          'modele_id', v_modele,
          'code_unique', v_code,
          'libelle_cta', 'Jouer',
          'type_jeu', v_type
        ),
        true
      );
    ELSE
      UPDATE jeupharma.module_blocs SET
        titre = v_titre,
        ordre = GREATEST(ordre, 900),
        payload_json = coalesce(payload_json, '{}'::jsonb) || jsonb_build_object(
          'modele_id', v_modele,
          'code_unique', v_code,
          'libelle_cta', 'Jouer',
          'type_jeu', v_type
        ),
        visible = true,
        updated_at = now()
      WHERE id = v_bloc;
    END IF;
  END LOOP;

  -- -------------------------------------------------------------------------
  -- Critères leçon (lecture + jeux score_min ~70)
  -- -------------------------------------------------------------------------
  -- pathologie_du_globule_rouge → JP-HZDNM (fix mismatch JP-CVS2)
  PERFORM jeupharma.ops_079_set_criteres(pid, 'pathologie_du_globule_rouge', ARRAY['JP-HZDNM'], 70);
  PERFORM jeupharma.ops_079_set_criteres(pid, 'rappel_sang', ARRAY['JP-CSANG'], 70);
  PERFORM jeupharma.ops_079_set_criteres(pid, 'pathologie_plaquettes', ARRAY['JP-PPLAQ'], 70);
  PERFORM jeupharma.ops_079_set_criteres(pid, 'm_dicaments_du_gr', ARRAY['JP-UNTF8','JP-MHSUM'], 70);
  PERFORM jeupharma.ops_079_set_criteres(pid, 'cv_definitions', ARRAY['JP-CVDF1'], 70);
  PERFORM jeupharma.ops_079_set_criteres(pid, 'cv_angor', ARRAY['JP-CVC1'], 70);
  PERFORM jeupharma.ops_079_set_criteres(pid, 'cv_idm', ARRAY['JP-CVIDM'], 70);
  PERFORM jeupharma.ops_079_set_criteres(pid, 'cv_arythmies', ARRAY['JP-CVVW1'], 70);
  PERFORM jeupharma.ops_079_set_criteres(pid, 'cv_ic', ARRAY['JP-CVIC1'], 70);
  PERFORM jeupharma.ops_079_set_criteres(pid, 'cv_arterite', ARRAY['JP-CVART'], 70);
  PERFORM jeupharma.ops_079_set_criteres(pid, 'cv_veines', ARRAY['JP-CVVEI'], 70);
  PERFORM jeupharma.ops_079_set_criteres(pid, 'cv_urgences', ARRAY['JP-CVURG'], 70);
  PERFORM jeupharma.ops_079_set_criteres(pid, 'hta_rappel_pa', ARRAY['JP-CVH1'], 70);
  PERFORM jeupharma.ops_079_set_criteres(pid, 'hta_raa', ARRAY['JP-CVH2'], 70);
  PERFORM jeupharma.ops_079_set_criteres(pid, 'hta_clinique', ARRAY['JP-CVH3'], 70);
  PERFORM jeupharma.ops_079_set_criteres(pid, 'hta_classes', ARRAY['JP-CVH4'], 70);
  PERFORM jeupharma.ops_079_set_criteres(pid, 'hta_associations', ARRAY['JP-CVH5'], 70);

  -- pathologie_du_globule_blanc : SKIP (garder jeux [])
  UPDATE jeupharma.modules_cours SET
    criteres_json = jsonb_build_object('lecture', true, 'logique', 'et', 'jeux', '[]'::jsonb),
    updated_at = now()
  WHERE parcours_id = pid AND code = 'pathologie_du_globule_blanc';

  -- Archiver soft les anciens modèles 032 orphelins non utilisés comme critères
  UPDATE jeupharma.modeles_jeu SET
    actif = false,
    en_pause = true,
    updated_at = now()
  WHERE parcours_id = pid
    AND code_unique IN (
      'JP-CVS1','JP-CVS2','JP-CVS3','JP-CVS4','JP-CVS5','JP-CVSO1',
      'JP-CVC2','JP-CVC3','JP-CVC4','JP-CVC5','JP-CVC6'
    );
END;
$$;

DROP FUNCTION IF EXISTS jeupharma.ops_079_set_criteres(uuid, text, text[], int);
