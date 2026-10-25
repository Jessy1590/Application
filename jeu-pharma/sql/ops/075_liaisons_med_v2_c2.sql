
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
