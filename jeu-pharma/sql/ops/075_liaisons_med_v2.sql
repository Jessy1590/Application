
DELETE FROM jeupharma.module_blocs b
USING jeupharma.modules_cours m, jeupharma.parcours_apprentissage p
WHERE b.module_id = m.id AND m.parcours_id = p.id AND p.code = 'cardiovasculaires_v2'
  AND coalesce(b.payload_json->>'seed_key','') LIKE '075:liaison:%';


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT m.id, 1, 'recommandation', 'Lien avec les anémies',
  jsonb_build_object(
    'corps_html', '<p>Les anémies (définition, causes, signes) ont été vues en physiopathologie. Cette leçon détaille les médicaments utilisables pour remonter les réserves (fer, vitamines B9/B12) et les érythropoïétines évoquées dans les anémies hypoplasiques ou aplasiques.</p>',
    'references', (jsonb_build_array(
      jsonb_build_object(
        'label', 'Anémies (physiopathologie)',
        'module_id', (SELECT id FROM jeupharma.modules_cours WHERE parcours_id = p.id AND code = 'v2_sang_anemies' AND NOT est_groupe),
        'parcours_id', p.id,
        'target_kind', 'lecon',
        'href', '',
        'bloc_id', ''
      ))),
    'lien_label', '', 'lien_href', '', 'lien_module_id', '', 'lien_parcours_id', '',
    'seed_key', '075:liaison:v2_med_anemies:1'
  ),
  true
FROM jeupharma.modules_cours m
JOIN jeupharma.parcours_apprentissage p ON p.id = m.parcours_id
WHERE p.code = 'cardiovasculaires_v2' AND m.code = 'v2_med_anemies';


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT m.id, 1, 'recommandation', 'Lien avec l’hémostase et les thromboses',
  jsonb_build_object(
    'corps_html', '<p>L’hémostase primaire forme un clou plaquettaire. Les antiagrégants agissent à ce niveau pour éviter l’agrégation plaquettaire, notamment dans le cadre des thromboses artérielles vues précédemment.</p>',
    'references', (jsonb_build_array(
      jsonb_build_object(
        'label', 'Hémostase',
        'module_id', (SELECT id FROM jeupharma.modules_cours WHERE parcours_id = p.id AND code = 'v2_sang_hemostase' AND NOT est_groupe),
        'parcours_id', p.id,
        'target_kind', 'lecon',
        'href', '',
        'bloc_id', ''
      )) || jsonb_build_array(
      jsonb_build_object(
        'label', 'Thromboses',
        'module_id', (SELECT id FROM jeupharma.modules_cours WHERE parcours_id = p.id AND code = 'v2_sang_thromboses' AND NOT est_groupe),
        'parcours_id', p.id,
        'target_kind', 'lecon',
        'href', '',
        'bloc_id', ''
      ))),
    'lien_label', '', 'lien_href', '', 'lien_module_id', '', 'lien_parcours_id', '',
    'seed_key', '075:liaison:v2_med_antiagregants:1'
  ),
  true
FROM jeupharma.modules_cours m
JOIN jeupharma.parcours_apprentissage p ON p.id = m.parcours_id
WHERE p.code = 'cardiovasculaires_v2' AND m.code = 'v2_med_antiagregants';


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT m.id, 1, 'recommandation', 'Lien avec la coagulation',
  jsonb_build_object(
    'corps_html', '<p>Après les antiagrégants (hémostase primaire), les héparines agissent sur la coagulation (hémostase secondaire), utile dans les thromboses veineuses et situations thrombo-emboliques déjà présentées.</p>',
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
        'label', 'Thromboses',
        'module_id', (SELECT id FROM jeupharma.modules_cours WHERE parcours_id = p.id AND code = 'v2_sang_thromboses' AND NOT est_groupe),
        'parcours_id', p.id,
        'target_kind', 'lecon',
        'href', '',
        'bloc_id', ''
      )) || jsonb_build_array(
      jsonb_build_object(
        'label', 'Hémostase',
        'module_id', (SELECT id FROM jeupharma.modules_cours WHERE parcours_id = p.id AND code = 'v2_sang_hemostase' AND NOT est_groupe),
        'parcours_id', p.id,
        'target_kind', 'lecon',
        'href', '',
        'bloc_id', ''
      ))),
    'lien_label', '', 'lien_href', '', 'lien_module_id', '', 'lien_parcours_id', '',
    'seed_key', '075:liaison:v2_med_heparines:1'
  ),
  true
FROM jeupharma.modules_cours m
JOIN jeupharma.parcours_apprentissage p ON p.id = m.parcours_id
WHERE p.code = 'cardiovasculaires_v2' AND m.code = 'v2_med_heparines';


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT m.id, 1, 'recommandation', 'Suite des anticoagulants',
  jsonb_build_object(
    'corps_html', '<p>Comme les héparines, les anticoagulants oraux directs bloquent un facteur activé de la coagulation. Ils s’inscrivent dans la prise en charge des thromboses et de la prévention thrombo-embolique.</p>',
    'references', (jsonb_build_array(
      jsonb_build_object(
        'label', 'Héparines',
        'module_id', (SELECT id FROM jeupharma.modules_cours WHERE parcours_id = p.id AND code = 'v2_med_heparines' AND NOT est_groupe),
        'parcours_id', p.id,
        'target_kind', 'lecon',
        'href', '',
        'bloc_id', ''
      )) || jsonb_build_array(
      jsonb_build_object(
        'label', 'Thromboses',
        'module_id', (SELECT id FROM jeupharma.modules_cours WHERE parcours_id = p.id AND code = 'v2_sang_thromboses' AND NOT est_groupe),
        'parcours_id', p.id,
        'target_kind', 'lecon',
        'href', '',
        'bloc_id', ''
      ))),
    'lien_label', '', 'lien_href', '', 'lien_module_id', '', 'lien_parcours_id', '',
    'seed_key', '075:liaison:v2_med_aod:1'
  ),
  true
FROM jeupharma.modules_cours m
JOIN jeupharma.parcours_apprentissage p ON p.id = m.parcours_id
WHERE p.code = 'cardiovasculaires_v2' AND m.code = 'v2_med_aod';


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT m.id, 1, 'recommandation', 'Suite des anticoagulants',
  jsonb_build_object(
    'corps_html', '<p>Les antivitamines K agissent autrement sur la coagulation (tous les facteurs vitamine K-dépendants) et nécessitent la surveillance de l’INR. Un relais héparine–AVK est possible, comme indiqué dans cette leçon.</p>',
    'references', (jsonb_build_array(
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
        'label', 'Thromboses',
        'module_id', (SELECT id FROM jeupharma.modules_cours WHERE parcours_id = p.id AND code = 'v2_sang_thromboses' AND NOT est_groupe),
        'parcours_id', p.id,
        'target_kind', 'lecon',
        'href', '',
        'bloc_id', ''
      ))),
    'lien_label', '', 'lien_href', '', 'lien_module_id', '', 'lien_parcours_id', '',
    'seed_key', '075:liaison:v2_med_avk:1'
  ),
  true
FROM jeupharma.modules_cours m
JOIN jeupharma.parcours_apprentissage p ON p.id = m.parcours_id
WHERE p.code = 'cardiovasculaires_v2' AND m.code = 'v2_med_avk';


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT m.id, 1, 'recommandation', 'Lien avec les saignements',
  jsonb_build_object(
    'corps_html', '<p>À l’opposé des anticoagulants, les hémostatiques sont utilisés en cas de saignements (règles abondantes, etc.), dans le prolongement des pathologies évoquées avec les hémophilies et la thrombopénie.</p>',
    'references', (jsonb_build_array(
      jsonb_build_object(
        'label', 'Hémophilies et thrombopénie',
        'module_id', (SELECT id FROM jeupharma.modules_cours WHERE parcours_id = p.id AND code = 'v2_sang_hemophilies' AND NOT est_groupe),
        'parcours_id', p.id,
        'target_kind', 'lecon',
        'href', '',
        'bloc_id', ''
      ))),
    'lien_label', '', 'lien_href', '', 'lien_module_id', '', 'lien_parcours_id', '',
    'seed_key', '075:liaison:v2_med_hemostatiques:1'
  ),
  true
FROM jeupharma.modules_cours m
JOIN jeupharma.parcours_apprentissage p ON p.id = m.parcours_id
WHERE p.code = 'cardiovasculaires_v2' AND m.code = 'v2_med_hemostatiques';


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT m.id, 1, 'recommandation', 'Lien avec l’angor',
  jsonb_build_object(
    'corps_html', '<p>L’angor (définition, types, symptômes) a été vu en physiopathologie. Cette leçon reprend le traitement de crise (spray sublingual) présenté dans le support.</p>',
    'references', (jsonb_build_array(
      jsonb_build_object(
        'label', 'Angor — physiopathologie',
        'module_id', (SELECT id FROM jeupharma.modules_cours WHERE parcours_id = p.id AND code = 'v2_cv_angor' AND NOT est_groupe),
        'parcours_id', p.id,
        'target_kind', 'lecon',
        'href', '',
        'bloc_id', ''
      ))),
    'lien_label', '', 'lien_href', '', 'lien_module_id', '', 'lien_parcours_id', '',
    'seed_key', '075:liaison:v2_med_crise_angor:1'
  ),
  true
FROM jeupharma.modules_cours m
JOIN jeupharma.parcours_apprentissage p ON p.id = m.parcours_id
WHERE p.code = 'cardiovasculaires_v2' AND m.code = 'v2_med_crise_angor';


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT m.id, 1, 'recommandation', 'Traitement de fond de l’angor',
  jsonb_build_object(
    'corps_html', '<p>Après le traitement de crise, les dérivés nitrés à action prolongée (trinitrine) font partie du traitement de fond de l’angor.</p>',
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
        'label', 'Angor — physiopathologie',
        'module_id', (SELECT id FROM jeupharma.modules_cours WHERE parcours_id = p.id AND code = 'v2_cv_angor' AND NOT est_groupe),
        'parcours_id', p.id,
        'target_kind', 'lecon',
        'href', '',
        'bloc_id', ''
      ))),
    'lien_label', '', 'lien_href', '', 'lien_module_id', '', 'lien_parcours_id', '',
    'seed_key', '075:liaison:v2_med_nitrates:1'
  ),
  true
FROM jeupharma.modules_cours m
JOIN jeupharma.parcours_apprentissage p ON p.id = m.parcours_id
WHERE p.code = 'cardiovasculaires_v2' AND m.code = 'v2_med_nitrates';


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT m.id, 1, 'recommandation', 'Classe transversale',
  jsonb_build_object(
    'corps_html', '<p>Les bêtabloquants sont détaillés ici dans le cadre de l’angor. Dans le support, cette classe est aussi rappelée comme antiarythmiques de classe 2 et dans l’insuffisance cardiaque ; elle intervient également parmi les antihypertenseurs.</p>',
    'references', (jsonb_build_array(
      jsonb_build_object(
        'label', 'Angor — physiopathologie',
        'module_id', (SELECT id FROM jeupharma.modules_cours WHERE parcours_id = p.id AND code = 'v2_cv_angor' AND NOT est_groupe),
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
        'label', 'Antihypertenseurs par classe',
        'module_id', (SELECT id FROM jeupharma.modules_cours WHERE parcours_id = p.id AND code = 'v2_med_hta_classes' AND NOT est_groupe),
        'parcours_id', p.id,
        'target_kind', 'lecon',
        'href', '',
        'bloc_id', ''
      ))),
    'lien_label', '', 'lien_href', '', 'lien_module_id', '', 'lien_parcours_id', '',
    'seed_key', '075:liaison:v2_med_betabloquants:1'
  ),
  true
FROM jeupharma.modules_cours m
JOIN jeupharma.parcours_apprentissage p ON p.id = m.parcours_id
WHERE p.code = 'cardiovasculaires_v2' AND m.code = 'v2_med_betabloquants';


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT m.id, 1, 'recommandation', 'Classe transversale',
  jsonb_build_object(
    'corps_html', '<p>Les inhibiteurs calciques sont présentés ici pour l’angor. Le support les rapproche aussi des antiarythmiques de classe 4 et des antihypertenseurs (action cardiaque ou périphérique).</p>',
    'references', (jsonb_build_array(
      jsonb_build_object(
        'label', 'Angor — physiopathologie',
        'module_id', (SELECT id FROM jeupharma.modules_cours WHERE parcours_id = p.id AND code = 'v2_cv_angor' AND NOT est_groupe),
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
    'seed_key', '075:liaison:v2_med_inca:1'
  ),
  true
FROM jeupharma.modules_cours m
JOIN jeupharma.parcours_apprentissage p ON p.id = m.parcours_id
WHERE p.code = 'cardiovasculaires_v2' AND m.code = 'v2_med_inca';


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


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT m.id, 1, 'recommandation', 'Lien avec les crises hémorroïdaires',
  jsonb_build_object(
    'corps_html', '<p>La physiopathologie des crises hémorroïdaires (définition, symptômes, facteurs favorisants) précède ces traitements (règles hygiéno-diététiques, veinotoniques, traitements locaux).</p>',
    'references', (jsonb_build_array(
      jsonb_build_object(
        'label', 'Crises hémorroïdaires — physiopathologie',
        'module_id', (SELECT id FROM jeupharma.modules_cours WHERE parcours_id = p.id AND code = 'v2_cv_hemorroides' AND NOT est_groupe),
        'parcours_id', p.id,
        'target_kind', 'lecon',
        'href', '',
        'bloc_id', ''
      ))),
    'lien_label', '', 'lien_href', '', 'lien_module_id', '', 'lien_parcours_id', '',
    'seed_key', '075:liaison:v2_med_hemorroides:1'
  ),
  true
FROM jeupharma.modules_cours m
JOIN jeupharma.parcours_apprentissage p ON p.id = m.parcours_id
WHERE p.code = 'cardiovasculaires_v2' AND m.code = 'v2_med_hemorroides';


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT m.id, 1, 'recommandation', 'Lien avec l’OAP',
  jsonb_build_object(
    'corps_html', '<p>Après la physiopathologie de l’œdème aigu du poumon, cette leçon reprend les médicaments de l’urgence cardiovasculaire (indications et disponibilités) du support.</p>',
    'references', (jsonb_build_array(
      jsonb_build_object(
        'label', 'OAP — physiopathologie',
        'module_id', (SELECT id FROM jeupharma.modules_cours WHERE parcours_id = p.id AND code = 'v2_cv_oap' AND NOT est_groupe),
        'parcours_id', p.id,
        'target_kind', 'lecon',
        'href', '',
        'bloc_id', ''
      ))),
    'lien_label', '', 'lien_href', '', 'lien_module_id', '', 'lien_parcours_id', '',
    'seed_key', '075:liaison:v2_med_urgences:1'
  ),
  true
FROM jeupharma.modules_cours m
JOIN jeupharma.parcours_apprentissage p ON p.id = m.parcours_id
WHERE p.code = 'cardiovasculaires_v2' AND m.code = 'v2_med_urgences';


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT m.id, 1, 'recommandation', 'Lien avec l’HTA',
  jsonb_build_object(
    'corps_html', '<p>Le rappel de pression artérielle, le système RAA et l’HTA clinique ont préparé cette leçon. Les antihypertenseurs y sont présentés par cibles d’action et par classes, en cohérence avec les bêtabloquants, inhibiteurs calciques, IEC et ARA 2 déjà croisés.</p>',
    'references', (jsonb_build_array(
      jsonb_build_object(
        'label', 'Rappel pression artérielle',
        'module_id', (SELECT id FROM jeupharma.modules_cours WHERE parcours_id = p.id AND code = 'v2_hta_pa' AND NOT est_groupe),
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
        'label', 'HTA clinique',
        'module_id', (SELECT id FROM jeupharma.modules_cours WHERE parcours_id = p.id AND code = 'v2_hta_clinique' AND NOT est_groupe),
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
        'label', 'IEC',
        'module_id', (SELECT id FROM jeupharma.modules_cours WHERE parcours_id = p.id AND code = 'v2_med_iec' AND NOT est_groupe),
        'parcours_id', p.id,
        'target_kind', 'lecon',
        'href', '',
        'bloc_id', ''
      ))),
    'lien_label', '', 'lien_href', '', 'lien_module_id', '', 'lien_parcours_id', '',
    'seed_key', '075:liaison:v2_med_hta_classes:1'
  ),
  true
FROM jeupharma.modules_cours m
JOIN jeupharma.parcours_apprentissage p ON p.id = m.parcours_id
WHERE p.code = 'cardiovasculaires_v2' AND m.code = 'v2_med_hta_classes';


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT m.id, 1, 'recommandation', 'Suite de la dispensation',
  jsonb_build_object(
    'corps_html', '<p>Après les classes d’antihypertenseurs, le support traite les associations fixes et les points de dispensation (hypotension orthostatique, conseils).</p>',
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
        'label', 'HTA clinique',
        'module_id', (SELECT id FROM jeupharma.modules_cours WHERE parcours_id = p.id AND code = 'v2_hta_clinique' AND NOT est_groupe),
        'parcours_id', p.id,
        'target_kind', 'lecon',
        'href', '',
        'bloc_id', ''
      ))),
    'lien_label', '', 'lien_href', '', 'lien_module_id', '', 'lien_parcours_id', '',
    'seed_key', '075:liaison:v2_med_hta_assoc:1'
  ),
  true
FROM jeupharma.modules_cours m
JOIN jeupharma.parcours_apprentissage p ON p.id = m.parcours_id
WHERE p.code = 'cardiovasculaires_v2' AND m.code = 'v2_med_hta_assoc';
