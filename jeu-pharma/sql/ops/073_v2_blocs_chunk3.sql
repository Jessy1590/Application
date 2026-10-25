
INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT m.id, 500, 'recommandation', 'Médicaments utilisables dans les thromboses',
  jsonb_build_object(
    'corps_html', '<p>Selon le terrain (artériel ou veineux), on utilise des antiagrégants et/ou des anticoagulants.</p>',
    'references', (jsonb_build_array(
      jsonb_build_object(
        'label', 'Antiagrégants plaquettaires',
        'module_id', (SELECT id FROM jeupharma.modules_cours WHERE parcours_id = p.id AND code = 'v2_med_antiagregants' AND NOT est_groupe),
        'parcours_id', p.id,
        'target_kind', 'lecon',
        'href', '',
        'bloc_id', ''
      )) || jsonb_build_array(
      jsonb_build_object(
        'label', 'Héparines',
        'module_id', (SELECT id FROM jeupharma.modules_cours WHERE parcours_id = p.id AND code = 'v2_med_heparines' AND NOT est_groupe),
        'parcours_id', p.id,
        'target_kind', 'lecon',
        'href', '',
        'bloc_id', ''
      )) || jsonb_build_array(
      jsonb_build_object(
        'label', 'Anticoagulants oraux directs',
        'module_id', (SELECT id FROM jeupharma.modules_cours WHERE parcours_id = p.id AND code = 'v2_med_aod' AND NOT est_groupe),
        'parcours_id', p.id,
        'target_kind', 'lecon',
        'href', '',
        'bloc_id', ''
      )) || jsonb_build_array(
      jsonb_build_object(
        'label', 'Antivitamines K',
        'module_id', (SELECT id FROM jeupharma.modules_cours WHERE parcours_id = p.id AND code = 'v2_med_avk' AND NOT est_groupe),
        'parcours_id', p.id,
        'target_kind', 'lecon',
        'href', '',
        'bloc_id', ''
      ))),
    'lien_label', '', 'lien_href', '', 'lien_module_id', '', 'lien_parcours_id', '',
    'seed_key', '073:v2:reco:v2_sang_thromboses:500'
  ),
  true
FROM jeupharma.modules_cours m
JOIN jeupharma.parcours_apprentissage p ON p.id = m.parcours_id
WHERE p.code = 'cardiovasculaires_v2' AND m.code = 'v2_sang_thromboses';


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT m.id, 500, 'recommandation', 'Médicaments utilisables (hémostatiques)',
  jsonb_build_object(
    'corps_html', '<p>Les hémostatiques locaux et généraux (dont l’acide tranéxamique) sont détaillés dans la leçon dédiée.</p>',
    'references', (jsonb_build_array(
      jsonb_build_object(
        'label', 'Hémostatiques',
        'module_id', (SELECT id FROM jeupharma.modules_cours WHERE parcours_id = p.id AND code = 'v2_med_hemostatiques' AND NOT est_groupe),
        'parcours_id', p.id,
        'target_kind', 'lecon',
        'href', '',
        'bloc_id', ''
      ))),
    'lien_label', '', 'lien_href', '', 'lien_module_id', '', 'lien_parcours_id', '',
    'seed_key', '073:v2:reco:v2_sang_hemophilies:500'
  ),
  true
FROM jeupharma.modules_cours m
JOIN jeupharma.parcours_apprentissage p ON p.id = m.parcours_id
WHERE p.code = 'cardiovasculaires_v2' AND m.code = 'v2_sang_hemophilies';


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT m.id, 500, 'recommandation', 'Médicaments utilisables dans l’angor',
  jsonb_build_object(
    'corps_html', '<p>Le traitement de l’angor se décline en traitement de crise et traitements de fond.</p>',
    'references', (jsonb_build_array(
      jsonb_build_object(
        'label', 'Traitement de crise de l''angor',
        'module_id', (SELECT id FROM jeupharma.modules_cours WHERE parcours_id = p.id AND code = 'v2_med_crise_angor' AND NOT est_groupe),
        'parcours_id', p.id,
        'target_kind', 'lecon',
        'href', '',
        'bloc_id', ''
      )) || jsonb_build_array(
      jsonb_build_object(
        'label', 'Dérivés nitrés',
        'module_id', (SELECT id FROM jeupharma.modules_cours WHERE parcours_id = p.id AND code = 'v2_med_nitrates' AND NOT est_groupe),
        'parcours_id', p.id,
        'target_kind', 'lecon',
        'href', '',
        'bloc_id', ''
      )) || jsonb_build_array(
      jsonb_build_object(
        'label', 'Bêtabloquants',
        'module_id', (SELECT id FROM jeupharma.modules_cours WHERE parcours_id = p.id AND code = 'v2_med_betabloquants' AND NOT est_groupe),
        'parcours_id', p.id,
        'target_kind', 'lecon',
        'href', '',
        'bloc_id', ''
      )) || jsonb_build_array(
      jsonb_build_object(
        'label', 'Inhibiteurs calciques',
        'module_id', (SELECT id FROM jeupharma.modules_cours WHERE parcours_id = p.id AND code = 'v2_med_inca' AND NOT est_groupe),
        'parcours_id', p.id,
        'target_kind', 'lecon',
        'href', '',
        'bloc_id', ''
      )) || jsonb_build_array(
      jsonb_build_object(
        'label', 'Autres anti-angoreux',
        'module_id', (SELECT id FROM jeupharma.modules_cours WHERE parcours_id = p.id AND code = 'v2_med_autres_angoreux' AND NOT est_groupe),
        'parcours_id', p.id,
        'target_kind', 'lecon',
        'href', '',
        'bloc_id', ''
      ))),
    'lien_label', '', 'lien_href', '', 'lien_module_id', '', 'lien_parcours_id', '',
    'seed_key', '073:v2:reco:v2_cv_angor:500'
  ),
  true
FROM jeupharma.modules_cours m
JOIN jeupharma.parcours_apprentissage p ON p.id = m.parcours_id
WHERE p.code = 'cardiovasculaires_v2' AND m.code = 'v2_cv_angor';


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT m.id, 500, 'recommandation', 'Médicaments utilisables après un IDM',
  jsonb_build_object(
    'corps_html', '<p>Le traitement du post-infarctus (prévention, ordonnance type BASIC) est détaillé dans la leçon médicaments dédiée.</p>',
    'references', (jsonb_build_array(
      jsonb_build_object(
        'label', 'Traitement du post-infarctus',
        'module_id', (SELECT id FROM jeupharma.modules_cours WHERE parcours_id = p.id AND code = 'v2_med_post_idm' AND NOT est_groupe),
        'parcours_id', p.id,
        'target_kind', 'lecon',
        'href', '',
        'bloc_id', ''
      ))),
    'lien_label', '', 'lien_href', '', 'lien_module_id', '', 'lien_parcours_id', '',
    'seed_key', '073:v2:reco:v2_cv_idm:500'
  ),
  true
FROM jeupharma.modules_cours m
JOIN jeupharma.parcours_apprentissage p ON p.id = m.parcours_id
WHERE p.code = 'cardiovasculaires_v2' AND m.code = 'v2_cv_idm';


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT m.id, 500, 'recommandation', 'Médicaments utilisables dans les arythmies',
  jsonb_build_object(
    'corps_html', '<p>Les antiarythmiques se classent selon Vaughan-Williams. Les classes 2 et 4 correspondent aux bêtabloquants et aux inhibiteurs calciques déjà vus.</p>',
    'references', (jsonb_build_array(
      jsonb_build_object(
        'label', 'Antiarythmiques de classe 1',
        'module_id', (SELECT id FROM jeupharma.modules_cours WHERE parcours_id = p.id AND code = 'v2_med_antiarythmiques_c1' AND NOT est_groupe),
        'parcours_id', p.id,
        'target_kind', 'lecon',
        'href', '',
        'bloc_id', ''
      )) || jsonb_build_array(
      jsonb_build_object(
        'label', 'Bêtabloquants (classe 2)',
        'module_id', (SELECT id FROM jeupharma.modules_cours WHERE parcours_id = p.id AND code = 'v2_med_betabloquants' AND NOT est_groupe),
        'parcours_id', p.id,
        'target_kind', 'lecon',
        'href', '',
        'bloc_id', ''
      )) || jsonb_build_array(
      jsonb_build_object(
        'label', 'Antiarythmiques de classe 3',
        'module_id', (SELECT id FROM jeupharma.modules_cours WHERE parcours_id = p.id AND code = 'v2_med_antiarythmiques_c3' AND NOT est_groupe),
        'parcours_id', p.id,
        'target_kind', 'lecon',
        'href', '',
        'bloc_id', ''
      )) || jsonb_build_array(
      jsonb_build_object(
        'label', 'Inhibiteurs calciques (classe 4)',
        'module_id', (SELECT id FROM jeupharma.modules_cours WHERE parcours_id = p.id AND code = 'v2_med_inca' AND NOT est_groupe),
        'parcours_id', p.id,
        'target_kind', 'lecon',
        'href', '',
        'bloc_id', ''
      ))),
    'lien_label', '', 'lien_href', '', 'lien_module_id', '', 'lien_parcours_id', '',
    'seed_key', '073:v2:reco:v2_cv_arythmies:500'
  ),
  true
FROM jeupharma.modules_cours m
JOIN jeupharma.parcours_apprentissage p ON p.id = m.parcours_id
WHERE p.code = 'cardiovasculaires_v2' AND m.code = 'v2_cv_arythmies';


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT m.id, 500, 'recommandation', 'Médicaments utilisables dans l’insuffisance cardiaque',
  jsonb_build_object(
    'corps_html', '<p>Plusieurs classes interviennent dans l’insuffisance cardiaque (bêtabloquants, IEC, ARA 2, digitaliques, ARNI, gliflozines…).</p>',
    'references', (jsonb_build_array(
      jsonb_build_object(
        'label', 'Bêtabloquants',
        'module_id', (SELECT id FROM jeupharma.modules_cours WHERE parcours_id = p.id AND code = 'v2_med_betabloquants' AND NOT est_groupe),
        'parcours_id', p.id,
        'target_kind', 'lecon',
        'href', '',
        'bloc_id', ''
      )) || jsonb_build_array(
      jsonb_build_object(
        'label', 'IEC',
        'module_id', (SELECT id FROM jeupharma.modules_cours WHERE parcours_id = p.id AND code = 'v2_med_iec' AND NOT est_groupe),
        'parcours_id', p.id,
        'target_kind', 'lecon',
        'href', '',
        'bloc_id', ''
      )) || jsonb_build_array(
      jsonb_build_object(
        'label', 'ARA 2 (sartans)',
        'module_id', (SELECT id FROM jeupharma.modules_cours WHERE parcours_id = p.id AND code = 'v2_med_ara2' AND NOT est_groupe),
        'parcours_id', p.id,
        'target_kind', 'lecon',
        'href', '',
        'bloc_id', ''
      )) || jsonb_build_array(
      jsonb_build_object(
        'label', 'Cardiotoniques digitaliques',
        'module_id', (SELECT id FROM jeupharma.modules_cours WHERE parcours_id = p.id AND code = 'v2_med_digitaliques' AND NOT est_groupe),
        'parcours_id', p.id,
        'target_kind', 'lecon',
        'href', '',
        'bloc_id', ''
      )) || jsonb_build_array(
      jsonb_build_object(
        'label', 'Autres traitements de l''IC',
        'module_id', (SELECT id FROM jeupharma.modules_cours WHERE parcours_id = p.id AND code = 'v2_med_autres_ic' AND NOT est_groupe),
        'parcours_id', p.id,
        'target_kind', 'lecon',
        'href', '',
        'bloc_id', ''
      ))),
    'lien_label', '', 'lien_href', '', 'lien_module_id', '', 'lien_parcours_id', '',
    'seed_key', '073:v2:reco:v2_cv_ic:500'
  ),
  true
FROM jeupharma.modules_cours m
JOIN jeupharma.parcours_apprentissage p ON p.id = m.parcours_id
WHERE p.code = 'cardiovasculaires_v2' AND m.code = 'v2_cv_ic';


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT m.id, 500, 'recommandation', 'Médicaments utilisables dans l’artérite',
  jsonb_build_object(
    'corps_html', '<p>Les traitements médicamenteux de l’artérite (dont vasodilatateurs) sont détaillés dans la leçon dédiée.</p>',
    'references', (jsonb_build_array(
      jsonb_build_object(
        'label', 'Traitements de l''artérite',
        'module_id', (SELECT id FROM jeupharma.modules_cours WHERE parcours_id = p.id AND code = 'v2_med_arterite' AND NOT est_groupe),
        'parcours_id', p.id,
        'target_kind', 'lecon',
        'href', '',
        'bloc_id', ''
      ))),
    'lien_label', '', 'lien_href', '', 'lien_module_id', '', 'lien_parcours_id', '',
    'seed_key', '073:v2:reco:v2_cv_arterite:500'
  ),
  true
FROM jeupharma.modules_cours m
JOIN jeupharma.parcours_apprentissage p ON p.id = m.parcours_id
WHERE p.code = 'cardiovasculaires_v2' AND m.code = 'v2_cv_arterite';


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT m.id, 500, 'recommandation', 'Médicaments / traitements de l’insuffisance veineuse',
  jsonb_build_object(
    'corps_html', '<p>Contention, sclérothérapie et veinotoniques sont détaillés dans la leçon médicaments dédiée.</p>',
    'references', (jsonb_build_array(
      jsonb_build_object(
        'label', 'Traitements de l''insuffisance veineuse',
        'module_id', (SELECT id FROM jeupharma.modules_cours WHERE parcours_id = p.id AND code = 'v2_med_veines' AND NOT est_groupe),
        'parcours_id', p.id,
        'target_kind', 'lecon',
        'href', '',
        'bloc_id', ''
      ))),
    'lien_label', '', 'lien_href', '', 'lien_module_id', '', 'lien_parcours_id', '',
    'seed_key', '073:v2:reco:v2_cv_veines:500'
  ),
  true
FROM jeupharma.modules_cours m
JOIN jeupharma.parcours_apprentissage p ON p.id = m.parcours_id
WHERE p.code = 'cardiovasculaires_v2' AND m.code = 'v2_cv_veines';


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT m.id, 500, 'recommandation', 'Médicaments utilisables dans les crises hémorroïdaires',
  jsonb_build_object(
    'corps_html', '<p>Les traitements (veinotoniques, locaux, etc.) sont détaillés dans la leçon médicaments dédiée.</p>',
    'references', (jsonb_build_array(
      jsonb_build_object(
        'label', 'Traitements des crises hémorroïdaires',
        'module_id', (SELECT id FROM jeupharma.modules_cours WHERE parcours_id = p.id AND code = 'v2_med_hemorroides' AND NOT est_groupe),
        'parcours_id', p.id,
        'target_kind', 'lecon',
        'href', '',
        'bloc_id', ''
      ))),
    'lien_label', '', 'lien_href', '', 'lien_module_id', '', 'lien_parcours_id', '',
    'seed_key', '073:v2:reco:v2_cv_hemorroides:500'
  ),
  true
FROM jeupharma.modules_cours m
JOIN jeupharma.parcours_apprentissage p ON p.id = m.parcours_id
WHERE p.code = 'cardiovasculaires_v2' AND m.code = 'v2_cv_hemorroides';


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT m.id, 500, 'recommandation', 'Médicaments des urgences cardiovasculaires',
  jsonb_build_object(
    'corps_html', '<p>Les médicaments de l’urgence (indications et disponibilités) sont détaillés dans la leçon dédiée.</p>',
    'references', (jsonb_build_array(
      jsonb_build_object(
        'label', 'Médicaments des urgences cardiovasculaires',
        'module_id', (SELECT id FROM jeupharma.modules_cours WHERE parcours_id = p.id AND code = 'v2_med_urgences' AND NOT est_groupe),
        'parcours_id', p.id,
        'target_kind', 'lecon',
        'href', '',
        'bloc_id', ''
      ))),
    'lien_label', '', 'lien_href', '', 'lien_module_id', '', 'lien_parcours_id', '',
    'seed_key', '073:v2:reco:v2_cv_oap:500'
  ),
  true
FROM jeupharma.modules_cours m
JOIN jeupharma.parcours_apprentissage p ON p.id = m.parcours_id
WHERE p.code = 'cardiovasculaires_v2' AND m.code = 'v2_cv_oap';


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT m.id, 500, 'recommandation', 'Médicaments utilisables dans l’HTA',
  jsonb_build_object(
    'corps_html', '<p>Les antihypertenseurs par classe et les associations fixes / dispensation sont détaillés dans les leçons médicaments du cœur.</p>',
    'references', (jsonb_build_array(
      jsonb_build_object(
        'label', 'Antihypertenseurs par classe',
        'module_id', (SELECT id FROM jeupharma.modules_cours WHERE parcours_id = p.id AND code = 'v2_med_hta_classes' AND NOT est_groupe),
        'parcours_id', p.id,
        'target_kind', 'lecon',
        'href', '',
        'bloc_id', ''
      )) || jsonb_build_array(
      jsonb_build_object(
        'label', 'Associations fixes et dispensation',
        'module_id', (SELECT id FROM jeupharma.modules_cours WHERE parcours_id = p.id AND code = 'v2_med_hta_assoc' AND NOT est_groupe),
        'parcours_id', p.id,
        'target_kind', 'lecon',
        'href', '',
        'bloc_id', ''
      ))),
    'lien_label', '', 'lien_href', '', 'lien_module_id', '', 'lien_parcours_id', '',
    'seed_key', '073:v2:reco:v2_hta_clinique:500'
  ),
  true
FROM jeupharma.modules_cours m
JOIN jeupharma.parcours_apprentissage p ON p.id = m.parcours_id
WHERE p.code = 'cardiovasculaires_v2' AND m.code = 'v2_hta_clinique';
