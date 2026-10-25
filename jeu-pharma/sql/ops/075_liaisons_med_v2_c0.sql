
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
