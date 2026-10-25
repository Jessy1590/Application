
INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT m.id, 1, 'recommandation', 'Suite du traitement de fond',
  jsonb_build_object(
    'corps_html', '<p>En complément des dérivés nitrés, bêtabloquants et inhibiteurs calciques, le support présente d’autres anti-angoreux : molsidomine, nicorandil et ivabradine.</p>',
    'references', (jsonb_build_array(
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
      ))),
    'lien_label', '', 'lien_href', '', 'lien_module_id', '', 'lien_parcours_id', '',
    'seed_key', '075:liaison:v2_med_autres_angoreux:1'
  ),
  true
FROM jeupharma.modules_cours m
JOIN jeupharma.parcours_apprentissage p ON p.id = m.parcours_id
WHERE p.code = 'cardiovasculaires_v2' AND m.code = 'v2_med_autres_angoreux';


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT m.id, 1, 'recommandation', 'Lien avec l’IDM',
  jsonb_build_object(
    'corps_html', '<p>Après la physiopathologie de l’infarctus, cette leçon reprend le traitement du post-infarctus (prévention des facteurs de risque, ordonnance type BASIC) et les conseils hygiéno-diététiques déjà associés à l’angor et à l’IDM.</p>',
    'references', (jsonb_build_array(
      jsonb_build_object(
        'label', 'Infarctus du myocarde — physiopathologie',
        'module_id', (SELECT id FROM jeupharma.modules_cours WHERE parcours_id = p.id AND code = 'v2_cv_idm' AND NOT est_groupe),
        'parcours_id', p.id,
        'target_kind', 'lecon',
        'href', '',
        'bloc_id', ''
      )) || jsonb_build_array(
      jsonb_build_object(
        'label', 'Angor — physiopathologie',
        'module_id', (SELECT id FROM jeupharma.modules_cours WHERE parcours_id = p.id AND code = 'v2_cv_angor' AND NOT est_groupe),
        'parcours_id', p.id,
        'target_kind', 'lecon',
        'href', '',
        'bloc_id', ''
      ))),
    'lien_label', '', 'lien_href', '', 'lien_module_id', '', 'lien_parcours_id', '',
    'seed_key', '075:liaison:v2_med_post_idm:1'
  ),
  true
FROM jeupharma.modules_cours m
JOIN jeupharma.parcours_apprentissage p ON p.id = m.parcours_id
WHERE p.code = 'cardiovasculaires_v2' AND m.code = 'v2_med_post_idm';


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT m.id, 1, 'recommandation', 'Lien avec les arythmies',
  jsonb_build_object(
    'corps_html', '<p>Les troubles du rythme et le principe des antiarythmiques ont été présentés en physiopathologie. Cette leçon détaille la classe 1 (mécanismes, effets indésirables, contre-indications).</p>',
    'references', (jsonb_build_array(
      jsonb_build_object(
        'label', 'Arythmies — physiopathologie',
        'module_id', (SELECT id FROM jeupharma.modules_cours WHERE parcours_id = p.id AND code = 'v2_cv_arythmies' AND NOT est_groupe),
        'parcours_id', p.id,
        'target_kind', 'lecon',
        'href', '',
        'bloc_id', ''
      ))),
    'lien_label', '', 'lien_href', '', 'lien_module_id', '', 'lien_parcours_id', '',
    'seed_key', '075:liaison:v2_med_antiarythmiques_c1:1'
  ),
  true
FROM jeupharma.modules_cours m
JOIN jeupharma.parcours_apprentissage p ON p.id = m.parcours_id
WHERE p.code = 'cardiovasculaires_v2' AND m.code = 'v2_med_antiarythmiques_c1';


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT m.id, 1, 'recommandation', 'Suite des antiarythmiques',
  jsonb_build_object(
    'corps_html', '<p>Après la classe 1, le support détaille la classe 3 (dont l’amiodarone). Les classes 2 et 4 correspondent aux bêtabloquants et inhibiteurs calciques déjà vus.</p>',
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
        'label', 'Inhibiteurs calciques (classe 4)',
        'module_id', (SELECT id FROM jeupharma.modules_cours WHERE parcours_id = p.id AND code = 'v2_med_inca' AND NOT est_groupe),
        'parcours_id', p.id,
        'target_kind', 'lecon',
        'href', '',
        'bloc_id', ''
      )) || jsonb_build_array(
      jsonb_build_object(
        'label', 'Arythmies — physiopathologie',
        'module_id', (SELECT id FROM jeupharma.modules_cours WHERE parcours_id = p.id AND code = 'v2_cv_arythmies' AND NOT est_groupe),
        'parcours_id', p.id,
        'target_kind', 'lecon',
        'href', '',
        'bloc_id', ''
      ))),
    'lien_label', '', 'lien_href', '', 'lien_module_id', '', 'lien_parcours_id', '',
    'seed_key', '075:liaison:v2_med_antiarythmiques_c3:1'
  ),
  true
FROM jeupharma.modules_cours m
JOIN jeupharma.parcours_apprentissage p ON p.id = m.parcours_id
WHERE p.code = 'cardiovasculaires_v2' AND m.code = 'v2_med_antiarythmiques_c3';


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT m.id, 1, 'recommandation', 'Lien avec l’insuffisance cardiaque et le RAA',
  jsonb_build_object(
    'corps_html', '<p>Les IEC sont présentés dans le traitement de l’insuffisance cardiaque. Leur action s’appuie sur le système rénine-angiotensine-aldostérone vu en physiopathologie ; ils figurent aussi parmi les antihypertenseurs.</p>',
    'references', (jsonb_build_array(
      jsonb_build_object(
        'label', 'Insuffisance cardiaque — physiopathologie',
        'module_id', (SELECT id FROM jeupharma.modules_cours WHERE parcours_id = p.id AND code = 'v2_cv_ic' AND NOT est_groupe),
        'parcours_id', p.id,
        'target_kind', 'lecon',
        'href', '',
        'bloc_id', ''
      )) || jsonb_build_array(
      jsonb_build_object(
        'label', 'Système rénine-angiotensine-aldostérone',
        'module_id', (SELECT id FROM jeupharma.modules_cours WHERE parcours_id = p.id AND code = 'v2_hta_raa' AND NOT est_groupe),
        'parcours_id', p.id,
        'target_kind', 'lecon',
        'href', '',
        'bloc_id', ''
      )) || jsonb_build_array(
      jsonb_build_object(
        'label', 'Antihypertenseurs par classe',
        'module_id', (SELECT id FROM jeupharma.modules_cours WHERE parcours_id = p.id AND code = 'v2_med_hta_classes' AND NOT est_groupe),
        'parcours_id', p.id,
        'target_kind', 'lecon',
        'href', '',
        'bloc_id', ''
      ))),
    'lien_label', '', 'lien_href', '', 'lien_module_id', '', 'lien_parcours_id', '',
    'seed_key', '075:liaison:v2_med_iec:1'
  ),
  true
FROM jeupharma.modules_cours m
JOIN jeupharma.parcours_apprentissage p ON p.id = m.parcours_id
WHERE p.code = 'cardiovasculaires_v2' AND m.code = 'v2_med_iec';


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT m.id, 1, 'recommandation', 'Suite du blocage du RAA',
  jsonb_build_object(
    'corps_html', '<p>Les ARA 2 (sartans) bloquent les récepteurs de l’angiotensine II. Comme les IEC, ils interviennent dans l’insuffisance cardiaque et l’hypertension, en lien avec le système RAA.</p>',
    'references', (jsonb_build_array(
      jsonb_build_object(
        'label', 'IEC',
        'module_id', (SELECT id FROM jeupharma.modules_cours WHERE parcours_id = p.id AND code = 'v2_med_iec' AND NOT est_groupe),
        'parcours_id', p.id,
        'target_kind', 'lecon',
        'href', '',
        'bloc_id', ''
      )) || jsonb_build_array(
      jsonb_build_object(
        'label', 'Insuffisance cardiaque — physiopathologie',
        'module_id', (SELECT id FROM jeupharma.modules_cours WHERE parcours_id = p.id AND code = 'v2_cv_ic' AND NOT est_groupe),
        'parcours_id', p.id,
        'target_kind', 'lecon',
        'href', '',
        'bloc_id', ''
      )) || jsonb_build_array(
      jsonb_build_object(
        'label', 'Système rénine-angiotensine-aldostérone',
        'module_id', (SELECT id FROM jeupharma.modules_cours WHERE parcours_id = p.id AND code = 'v2_hta_raa' AND NOT est_groupe),
        'parcours_id', p.id,
        'target_kind', 'lecon',
        'href', '',
        'bloc_id', ''
      ))),
    'lien_label', '', 'lien_href', '', 'lien_module_id', '', 'lien_parcours_id', '',
    'seed_key', '075:liaison:v2_med_ara2:1'
  ),
  true
FROM jeupharma.modules_cours m
JOIN jeupharma.parcours_apprentissage p ON p.id = m.parcours_id
WHERE p.code = 'cardiovasculaires_v2' AND m.code = 'v2_med_ara2';


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT m.id, 1, 'recommandation', 'Suite des traitements de l’IC',
  jsonb_build_object(
    'corps_html', '<p>Parmi les traitements de l’insuffisance cardiaque, le support détaille aussi les cardiotoniques digitaliques (digoxine).</p>',
    'references', (jsonb_build_array(
      jsonb_build_object(
        'label', 'Insuffisance cardiaque — physiopathologie',
        'module_id', (SELECT id FROM jeupharma.modules_cours WHERE parcours_id = p.id AND code = 'v2_cv_ic' AND NOT est_groupe),
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
      ))),
    'lien_label', '', 'lien_href', '', 'lien_module_id', '', 'lien_parcours_id', '',
    'seed_key', '075:liaison:v2_med_digitaliques:1'
  ),
  true
FROM jeupharma.modules_cours m
JOIN jeupharma.parcours_apprentissage p ON p.id = m.parcours_id
WHERE p.code = 'cardiovasculaires_v2' AND m.code = 'v2_med_digitaliques';


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT m.id, 1, 'recommandation', 'Autres options dans l’IC',
  jsonb_build_object(
    'corps_html', '<p>Le support complète les traitements de l’insuffisance cardiaque par d’autres options : inhibiteur des récepteurs de l’angiotensine et de la néprilysine, et gliflozines (inhibiteurs du SGLT-2).</p>',
    'references', (jsonb_build_array(
      jsonb_build_object(
        'label', 'Insuffisance cardiaque — physiopathologie',
        'module_id', (SELECT id FROM jeupharma.modules_cours WHERE parcours_id = p.id AND code = 'v2_cv_ic' AND NOT est_groupe),
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
      ))),
    'lien_label', '', 'lien_href', '', 'lien_module_id', '', 'lien_parcours_id', '',
    'seed_key', '075:liaison:v2_med_autres_ic:1'
  ),
  true
FROM jeupharma.modules_cours m
JOIN jeupharma.parcours_apprentissage p ON p.id = m.parcours_id
WHERE p.code = 'cardiovasculaires_v2' AND m.code = 'v2_med_autres_ic';


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT m.id, 1, 'recommandation', 'Lien avec l’artérite',
  jsonb_build_object(
    'corps_html', '<p>La définition et les signes de l’artérite ont été vus en physiopathologie. Cette leçon reprend les traitements (dont vasodilatateurs) indiqués dans le support.</p>',
    'references', (jsonb_build_array(
      jsonb_build_object(
        'label', 'Artérite — physiopathologie',
        'module_id', (SELECT id FROM jeupharma.modules_cours WHERE parcours_id = p.id AND code = 'v2_cv_arterite' AND NOT est_groupe),
        'parcours_id', p.id,
        'target_kind', 'lecon',
        'href', '',
        'bloc_id', ''
      ))),
    'lien_label', '', 'lien_href', '', 'lien_module_id', '', 'lien_parcours_id', '',
    'seed_key', '075:liaison:v2_med_arterite:1'
  ),
  true
FROM jeupharma.modules_cours m
JOIN jeupharma.parcours_apprentissage p ON p.id = m.parcours_id
WHERE p.code = 'cardiovasculaires_v2' AND m.code = 'v2_med_arterite';


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT m.id, 1, 'recommandation', 'Lien avec l’insuffisance veineuse',
  jsonb_build_object(
    'corps_html', '<p>Après les mécanismes, stades et conseils hygiéno-diététiques de l’insuffisance veineuse, cette leçon détaille contention, sclérothérapie et veinotoniques.</p>',
    'references', (jsonb_build_array(
      jsonb_build_object(
        'label', 'Insuffisance veineuse — physiopathologie',
        'module_id', (SELECT id FROM jeupharma.modules_cours WHERE parcours_id = p.id AND code = 'v2_cv_veines' AND NOT est_groupe),
        'parcours_id', p.id,
        'target_kind', 'lecon',
        'href', '',
        'bloc_id', ''
      ))),
    'lien_label', '', 'lien_href', '', 'lien_module_id', '', 'lien_parcours_id', '',
    'seed_key', '075:liaison:v2_med_veines:1'
  ),
  true
FROM jeupharma.modules_cours m
JOIN jeupharma.parcours_apprentissage p ON p.id = m.parcours_id
WHERE p.code = 'cardiovasculaires_v2' AND m.code = 'v2_med_veines';
