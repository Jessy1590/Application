-- =============================================================================
-- 035 : Blocs contenu (texte, photo, vidéo, conseil, molécule) — CardioVasculaires Deust 2A
-- Idempotent : seed_key 035:* ; ne supprime pas les blocs type jeu (032).
-- Photos : bucket jeupharma-lecons (paths modules/<uuid>/<slug>.jpg).
-- Généré par sql/ops/build_035_blocs.mjs
-- =============================================================================

DELETE FROM jeupharma.module_blocs mb
USING jeupharma.modules_cours mc, jeupharma.parcours_apprentissage pa
WHERE mb.module_id = mc.id
  AND mc.parcours_id = pa.id
  AND pa.code = 'cardiovasculaires_deust_2a'
  AND NOT mc.est_groupe
  AND mb.type_bloc <> 'jeu'
  AND coalesce(mb.payload_json->>'seed_key', '') LIKE '035:%';


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 10, 'texte', 'Éléments figurés et globules rouges', '{"html":"<p>Les <strong>globules rouges</strong> transportent l’O₂ via l’hémoglobine. Durée de vie ≈ <strong>120 jours</strong>. Un GR mature est dépourvu de noyau.</p><p><strong>Érythropoïèse</strong> : hémocytoblaste → proérythroblaste → érythroblaste → réticulocyte (1–2 j) → hématie mâure.</p><p>Les <strong>plaquettes</strong> interviennent dans l’hémostase primaire ; durée de vie ≈ <strong>7 jours</strong>.</p>","seed_key":"035:sang_rappel:intro"}'::jsonb, true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'sang_rappel' AND NOT mc.est_groupe;


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 20, 'texte', 'Fer et absorption', '{"html":"<p>Le <strong>fer</strong> n’est pas synthétisé par l’organisme : il provient de l’alimentation. Le fer animal est en général mieux absorbé que le fer végétal.</p><ul><li>La <strong>vitamine C</strong> augmente l’absorption (agrumes, kiwi, poivron…).</li><li>Le <strong>thé</strong> et le <strong>café</strong> la diminuent (tanins).</li></ul>","seed_key":"035:sang_rappel:fer"}'::jsonb, true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'sang_rappel' AND NOT mc.est_groupe;


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 30, 'texte', 'Cas de comptoir — ordonnances', '{"html":"<p>Repérez sur les ordonnances (ci-dessous) les <strong>classes</strong> présentes (ex. fer, vitamine B12, vitamine D, IPP/antiacide…), leur <strong>indication probable</strong> et les <strong>conseils de dispensation</strong> à associer.</p><p><em>Questions guidées — pas de corrigé unique imposé dans le texte : validez votre analyse avec le jeu de la leçon.</em></p><p>Ressources vidéo du support : chaîne <a href=\"https://www.youtube.com/@lecoursdebio\" target=\"_blank\" rel=\"noopener\">Le cours de bio</a> (érythropoïèse, hémostase).</p>","seed_key":"035:sang_rappel:cas-ordo"}'::jsonb, true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'sang_rappel' AND NOT mc.est_groupe;


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 40, 'video', 'Érythropoïèse (complément)', '{"url":"https://www.youtube.com/watch?v=zeKTU_cZY64","seed_key":"035:sang_rappel:vid-erythro"}'::jsonb, true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'sang_rappel' AND NOT mc.est_groupe;


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 50, 'video', 'Mesure et rappels vasculaires (complément)', '{"url":"https://www.youtube.com/watch?v=SbG23nc_U_4","seed_key":"035:sang_rappel:vid-hemostase"}'::jsonb, true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'sang_rappel' AND NOT mc.est_groupe;


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 60, 'photo', NULL, '{"path":"modules/e9adf9b0-090e-4d11-bfb4-ce6d01066cf3/hemostase-primaire.jpg","alt":"Hémostase primaire — quatre temps","legende":"Hémostase primaire — quatre temps","seed_key":"035:sang_rappel:photo-hemostase-primaire"}'::jsonb, true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'sang_rappel' AND NOT mc.est_groupe;


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 70, 'photo', NULL, '{"path":"modules/e9adf9b0-090e-4d11-bfb4-ce6d01066cf3/cascade-coagulation.jpg","alt":"Cascade de coagulation (hémostase secondaire)","legende":"Cascade de coagulation (hémostase secondaire)","seed_key":"035:sang_rappel:photo-cascade-coagulation"}'::jsonb, true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'sang_rappel' AND NOT mc.est_groupe;


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 80, 'photo', NULL, '{"path":"modules/e9adf9b0-090e-4d11-bfb4-ce6d01066cf3/composition-sang.jpg","alt":"Composition du sang","legende":"Composition du sang","seed_key":"035:sang_rappel:photo-composition-sang"}'::jsonb, true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'sang_rappel' AND NOT mc.est_groupe;


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 90, 'photo', NULL, '{"path":"modules/e9adf9b0-090e-4d11-bfb4-ce6d01066cf3/hematopoiese.jpg","alt":"Hématopoïèse","legende":"Hématopoïèse","seed_key":"035:sang_rappel:photo-hematopoiese"}'::jsonb, true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'sang_rappel' AND NOT mc.est_groupe;


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 100, 'photo', NULL, '{"path":"modules/e9adf9b0-090e-4d11-bfb4-ce6d01066cf3/erythropoiese.jpg","alt":"Étapes de l’érythropoïèse","legende":"Étapes de l’érythropoïèse","seed_key":"035:sang_rappel:photo-erythropoiese"}'::jsonb, true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'sang_rappel' AND NOT mc.est_groupe;


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 110, 'photo', NULL, '{"path":"modules/e9adf9b0-090e-4d11-bfb4-ce6d01066cf3/hemoglobine.jpg","alt":"Hémoglobine et transport de l’O₂","legende":"Hémoglobine et transport de l’O₂","seed_key":"035:sang_rappel:photo-hemoglobine"}'::jsonb, true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'sang_rappel' AND NOT mc.est_groupe;


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 120, 'photo', NULL, '{"path":"modules/e9adf9b0-090e-4d11-bfb4-ce6d01066cf3/breche-vasculaire.jpg","alt":"Brèche vasculaire","legende":"Brèche vasculaire","seed_key":"035:sang_rappel:photo-breche-vasculaire"}'::jsonb, true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'sang_rappel' AND NOT mc.est_groupe;


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 130, 'photo', NULL, '{"path":"modules/e9adf9b0-090e-4d11-bfb4-ce6d01066cf3/ordonnance-1.jpg","alt":"Ordonnance — cas comptoir (données masquées)","legende":"Ordonnance — cas comptoir (données masquées)","seed_key":"035:sang_rappel:photo-ordonnance-1"}'::jsonb, true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'sang_rappel' AND NOT mc.est_groupe;


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 140, 'photo', NULL, '{"path":"modules/e9adf9b0-090e-4d11-bfb4-ce6d01066cf3/ordonnance-2.jpg","alt":"Ordonnance — cas comptoir (données masquées)","legende":"Ordonnance — cas comptoir (données masquées)","seed_key":"035:sang_rappel:photo-ordonnance-2"}'::jsonb, true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'sang_rappel' AND NOT mc.est_groupe;


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 150, 'conseil', NULL, '{"pathologie":"Brèche vasculaire","corps_html":"<p>L’hémostase <strong>primaire</strong> forme un clou plaquettaire <strong>fragile</strong>. Il doit être renforcé par la <strong>coagulation</strong> (hémostase secondaire) pour stabiliser le clot.</p>","seed_key":"035:sang_rappel:conseil-breche"}'::jsonb, true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'sang_rappel' AND NOT mc.est_groupe;


-- Molécule sang_rappel : matrice_ids depuis publications de la leçon
INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 160, 'molecule', 'Molécules du programme',
  jsonb_build_object(
    'seed_key', '035:sang_rappel:molecule-lot',
    'matrice_ids', coalesce((
      SELECT jsonb_agg(sub.m ORDER BY sub.m)
      FROM (
        SELECT DISTINCT c.matrice_id AS m
        FROM jeupharma.publications_connaissances pc
        JOIN jeupharma.connaissances c ON c.id = pc.connaissance_id
        WHERE pc.module_id = mc.id AND pc.actif
      ) sub
    ), '[]'::jsonb),
    'matrice_id', (
      SELECT sub.m FROM (
        SELECT DISTINCT c.matrice_id AS m
        FROM jeupharma.publications_connaissances pc
        JOIN jeupharma.connaissances c ON c.id = pc.connaissance_id
        WHERE pc.module_id = mc.id AND pc.actif
      ) sub ORDER BY sub.m LIMIT 1
    )
  ),
  true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'sang_rappel' AND NOT mc.est_groupe;


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 10, 'texte', 'Définition et classifications', '{"html":"<p><strong>Anémie</strong> : Hb &lt; 13 g/100 mL (H) ou &lt; 12 g/100 mL (F).</p><p>Classifications : <strong>cause</strong> (centrale vs périphérique) et <strong>morphologie</strong> (VGM, CCMH) — microcytaire / normocytaire / macrocytaire.</p><p>Signes cliniques : fatigue, pâleur, dyspnée d’effort, tachycardie…</p>","seed_key":"035:sang_anemies:def"}'::jsonb, true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'sang_anemies' AND NOT mc.est_groupe;


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 20, 'texte', 'Types principaux (support)', '{"html":"<p><strong>Ferriprive</strong>, <strong>macrocytaire</strong> (B9/B12, Biermer), <strong>hypo/aplasique</strong>, <strong>hémolytiques</strong> (drépanocytose, thalassémie, allo-immunisation Rh — le slide distingue parfois « liée à X » : retenir la transmission récessive classique et le rôle de <strong>Rhophylac</strong> en prévention).</p><p><strong>Intervalle de 2 h</strong> entre fer et quinolones, tétracyclines, topiques gastriques, hormones thyroïdiennes.</p>","seed_key":"035:sang_anemies:types"}'::jsonb, true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'sang_anemies' AND NOT mc.est_groupe;


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 30, 'photo', NULL, '{"path":"modules/fc7d0e3c-f2b9-42de-a253-5b4f3f7aa95c/frottis.jpg","alt":"frottis","legende":"frottis","seed_key":"035:sang_anemies:photo-frottis"}'::jsonb, true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'sang_anemies' AND NOT mc.est_groupe;


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 40, 'photo', NULL, '{"path":"modules/fc7d0e3c-f2b9-42de-a253-5b4f3f7aa95c/anemie-symptomes.jpg","alt":"anemie symptomes","legende":"anemie symptomes","seed_key":"035:sang_anemies:photo-anemie-symptomes"}'::jsonb, true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'sang_anemies' AND NOT mc.est_groupe;


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 50, 'photo', NULL, '{"path":"modules/fc7d0e3c-f2b9-42de-a253-5b4f3f7aa95c/drepanocytose.jpg","alt":"drepanocytose","legende":"drepanocytose","seed_key":"035:sang_anemies:photo-drepanocytose"}'::jsonb, true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'sang_anemies' AND NOT mc.est_groupe;


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 60, 'photo', NULL, '{"path":"modules/fc7d0e3c-f2b9-42de-a253-5b4f3f7aa95c/maladie-hemolytique-rh.jpg","alt":"maladie hemolytique rh","legende":"maladie hemolytique rh","seed_key":"035:sang_anemies:photo-maladie-hemolytique-rh"}'::jsonb, true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'sang_anemies' AND NOT mc.est_groupe;


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 70, 'photo', NULL, '{"path":"modules/fc7d0e3c-f2b9-42de-a253-5b4f3f7aa95c/immunisation-rh.jpg","alt":"immunisation rh","legende":"immunisation rh","seed_key":"035:sang_anemies:photo-immunisation-rh"}'::jsonb, true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'sang_anemies' AND NOT mc.est_groupe;


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 80, 'conseil', NULL, '{"pathologie":"Anémie ferriprive","corps_html":"<p>Conseiller la prise de fer loin du thé/café ; associer vitamine C si pertinent ; respecter les intervalles avec d’autres médicaments.</p><p>Les <strong>culots</strong> ne sont pas des fiches médicament dans ce parcours — information transmise en conseil/texte.</p>","seed_key":"035:sang_anemies:conseil-fer"}'::jsonb, true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'sang_anemies' AND NOT mc.est_groupe;


-- Molécule sang_anemies : matrice_ids depuis publications de la leçon
INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 90, 'molecule', 'Molécules du programme',
  jsonb_build_object(
    'seed_key', '035:sang_anemies:molecule-lot',
    'matrice_ids', coalesce((
      SELECT jsonb_agg(sub.m ORDER BY sub.m)
      FROM (
        SELECT DISTINCT c.matrice_id AS m
        FROM jeupharma.publications_connaissances pc
        JOIN jeupharma.connaissances c ON c.id = pc.connaissance_id
        WHERE pc.module_id = mc.id AND pc.actif
      ) sub
    ), '[]'::jsonb),
    'matrice_id', (
      SELECT sub.m FROM (
        SELECT DISTINCT c.matrice_id AS m
        FROM jeupharma.publications_connaissances pc
        JOIN jeupharma.connaissances c ON c.id = pc.connaissance_id
        WHERE pc.module_id = mc.id AND pc.actif
      ) sub ORDER BY sub.m LIMIT 1
    )
  ),
  true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'sang_anemies' AND NOT mc.est_groupe;


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 10, 'texte', 'Thromboses', '{"html":"<p><strong>TVP</strong>, <strong>EP</strong>, thrombose artérielle (coronaire, AVC/AIT). Les antiagrégants limitent l’agrégation plaquettaire.</p><p><strong>Indications</strong> : IDM, FA, pontage, AVC/AIT selon protocoles.</p><p>Mécanisme : inhibition <strong>COX</strong> → ↓ thromboxane A₂ (TXA₂).</p><p><strong>Chirurgie</strong> : arrêt des antiagrégants ≈ <strong>7 jours</strong> avant intervention (selon avis médical).</p>","seed_key":"035:sang_antiagregants:thrombose"}'::jsonb, true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'sang_antiagregants' AND NOT mc.est_groupe;


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 20, 'photo', NULL, '{"path":"modules/578a6b03-19f6-4825-b703-b7fbe2a879e9/thrombose.jpg","alt":"thrombose","legende":"thrombose","seed_key":"035:sang_antiagregants:photo-thrombose"}'::jsonb, true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'sang_antiagregants' AND NOT mc.est_groupe;


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 30, 'photo', NULL, '{"path":"modules/578a6b03-19f6-4825-b703-b7fbe2a879e9/embolie-pulmonaire.jpg","alt":"embolie pulmonaire","legende":"embolie pulmonaire","seed_key":"035:sang_antiagregants:photo-embolie-pulmonaire"}'::jsonb, true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'sang_antiagregants' AND NOT mc.est_groupe;


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 40, 'photo', NULL, '{"path":"modules/578a6b03-19f6-4825-b703-b7fbe2a879e9/avc-ischemique.jpg","alt":"avc ischemique","legende":"avc ischemique","seed_key":"035:sang_antiagregants:photo-avc-ischemique"}'::jsonb, true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'sang_antiagregants' AND NOT mc.est_groupe;


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 50, 'photo', NULL, '{"path":"modules/578a6b03-19f6-4825-b703-b7fbe2a879e9/thrombus-coronaire.jpg","alt":"thrombus coronaire","legende":"thrombus coronaire","seed_key":"035:sang_antiagregants:photo-thrombus-coronaire"}'::jsonb, true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'sang_antiagregants' AND NOT mc.est_groupe;


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 60, 'photo', NULL, '{"path":"modules/578a6b03-19f6-4825-b703-b7fbe2a879e9/fibrillation-auriculaire.jpg","alt":"fibrillation auriculaire","legende":"fibrillation auriculaire","seed_key":"035:sang_antiagregants:photo-fibrillation-auriculaire"}'::jsonb, true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'sang_antiagregants' AND NOT mc.est_groupe;


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 70, 'photo', NULL, '{"path":"modules/578a6b03-19f6-4825-b703-b7fbe2a879e9/cox-thromboxane.jpg","alt":"cox thromboxane","legende":"cox thromboxane","seed_key":"035:sang_antiagregants:photo-cox-thromboxane"}'::jsonb, true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'sang_antiagregants' AND NOT mc.est_groupe;


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 80, 'photo', NULL, '{"path":"modules/578a6b03-19f6-4825-b703-b7fbe2a879e9/cox1-cox2.jpg","alt":"cox1 cox2","legende":"cox1 cox2","seed_key":"035:sang_antiagregants:photo-cox1-cox2"}'::jsonb, true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'sang_antiagregants' AND NOT mc.est_groupe;


-- Molécule sang_antiagregants : matrice_ids depuis publications de la leçon
INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 90, 'molecule', 'Molécules du programme',
  jsonb_build_object(
    'seed_key', '035:sang_antiagregants:molecule-lot',
    'matrice_ids', coalesce((
      SELECT jsonb_agg(sub.m ORDER BY sub.m)
      FROM (
        SELECT DISTINCT c.matrice_id AS m
        FROM jeupharma.publications_connaissances pc
        JOIN jeupharma.connaissances c ON c.id = pc.connaissance_id
        WHERE pc.module_id = mc.id AND pc.actif
      ) sub
    ), '[]'::jsonb),
    'matrice_id', (
      SELECT sub.m FROM (
        SELECT DISTINCT c.matrice_id AS m
        FROM jeupharma.publications_connaissances pc
        JOIN jeupharma.connaissances c ON c.id = pc.connaissance_id
        WHERE pc.module_id = mc.id AND pc.actif
      ) sub ORDER BY sub.m LIMIT 1
    )
  ),
  true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'sang_antiagregants' AND NOT mc.est_groupe;


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 10, 'texte', 'Anticoagulants et thrombolytiques', '{"html":"<p><strong>HNF / HBPM</strong>, fondaparinux, <strong>AOD</strong>, <strong>AVK</strong>, hirudines.</p><p>Relais héparine → AVK ; <strong>INR</strong> cible souvent 2–3.</p><p>Antidote dabigatran : <strong>idarucizumab (Praxbind)</strong>.</p><p><strong>Thrombolytiques</strong> : délais IDM &lt; 6 h, AVC &lt; 3 h (urgences hospitalières).</p>","seed_key":"035:sang_anticoagulants:classes"}'::jsonb, true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'sang_anticoagulants' AND NOT mc.est_groupe;


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 20, 'photo', NULL, '{"path":"modules/9c921bad-b792-4399-90c1-5d1b0eb7186c/sites-action-cascade.jpg","alt":"sites action cascade","legende":"sites action cascade","seed_key":"035:sang_anticoagulants:photo-sites-action-cascade"}'::jsonb, true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'sang_anticoagulants' AND NOT mc.est_groupe;


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 30, 'photo', NULL, '{"path":"modules/9c921bad-b792-4399-90c1-5d1b0eb7186c/heparines-hnf-hbpm.jpg","alt":"heparines hnf hbpm","legende":"heparines hnf hbpm","seed_key":"035:sang_anticoagulants:photo-heparines-hnf-hbpm"}'::jsonb, true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'sang_anticoagulants' AND NOT mc.est_groupe;


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 40, 'photo', NULL, '{"path":"modules/9c921bad-b792-4399-90c1-5d1b0eb7186c/anti-iia-anti-xa.jpg","alt":"anti iia anti xa","legende":"anti iia anti xa","seed_key":"035:sang_anticoagulants:photo-anti-iia-anti-xa"}'::jsonb, true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'sang_anticoagulants' AND NOT mc.est_groupe;


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 50, 'photo', NULL, '{"path":"modules/9c921bad-b792-4399-90c1-5d1b0eb7186c/posologies-hbpm.jpg","alt":"posologies hbpm","legende":"posologies hbpm","seed_key":"035:sang_anticoagulants:photo-posologies-hbpm"}'::jsonb, true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'sang_anticoagulants' AND NOT mc.est_groupe;


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 60, 'photo', NULL, '{"path":"modules/9c921bad-b792-4399-90c1-5d1b0eb7186c/mecanisme-aod.jpg","alt":"mecanisme aod","legende":"mecanisme aod","seed_key":"035:sang_anticoagulants:photo-mecanisme-aod"}'::jsonb, true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'sang_anticoagulants' AND NOT mc.est_groupe;


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 70, 'photo', NULL, '{"path":"modules/9c921bad-b792-4399-90c1-5d1b0eb7186c/tableau-aod.jpg","alt":"tableau aod","legende":"tableau aod","seed_key":"035:sang_anticoagulants:photo-tableau-aod"}'::jsonb, true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'sang_anticoagulants' AND NOT mc.est_groupe;


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 80, 'photo', NULL, '{"path":"modules/9c921bad-b792-4399-90c1-5d1b0eb7186c/mecanisme-avk.jpg","alt":"mecanisme avk","legende":"mecanisme avk","seed_key":"035:sang_anticoagulants:photo-mecanisme-avk"}'::jsonb, true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'sang_anticoagulants' AND NOT mc.est_groupe;


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 90, 'photo', NULL, '{"path":"modules/9c921bad-b792-4399-90c1-5d1b0eb7186c/relais-heparine-avk.jpg","alt":"relais heparine avk","legende":"relais heparine avk","seed_key":"035:sang_anticoagulants:photo-relais-heparine-avk"}'::jsonb, true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'sang_anticoagulants' AND NOT mc.est_groupe;


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 100, 'photo', NULL, '{"path":"modules/9c921bad-b792-4399-90c1-5d1b0eb7186c/inr-zone.jpg","alt":"inr zone","legende":"inr zone","seed_key":"035:sang_anticoagulants:photo-inr-zone"}'::jsonb, true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'sang_anticoagulants' AND NOT mc.est_groupe;


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 110, 'photo', NULL, '{"path":"modules/9c921bad-b792-4399-90c1-5d1b0eb7186c/hirudine.jpg","alt":"hirudine","legende":"hirudine","seed_key":"035:sang_anticoagulants:photo-hirudine"}'::jsonb, true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'sang_anticoagulants' AND NOT mc.est_groupe;


-- Molécule sang_anticoagulants : matrice_ids depuis publications de la leçon
INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 120, 'molecule', 'Molécules du programme',
  jsonb_build_object(
    'seed_key', '035:sang_anticoagulants:molecule-lot',
    'matrice_ids', coalesce((
      SELECT jsonb_agg(sub.m ORDER BY sub.m)
      FROM (
        SELECT DISTINCT c.matrice_id AS m
        FROM jeupharma.publications_connaissances pc
        JOIN jeupharma.connaissances c ON c.id = pc.connaissance_id
        WHERE pc.module_id = mc.id AND pc.actif
      ) sub
    ), '[]'::jsonb),
    'matrice_id', (
      SELECT sub.m FROM (
        SELECT DISTINCT c.matrice_id AS m
        FROM jeupharma.publications_connaissances pc
        JOIN jeupharma.connaissances c ON c.id = pc.connaissance_id
        WHERE pc.module_id = mc.id AND pc.actif
      ) sub ORDER BY sub.m LIMIT 1
    )
  ),
  true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'sang_anticoagulants' AND NOT mc.est_groupe;


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 10, 'texte', 'Hémophilies et hémostatiques', '{"html":"<p><strong>Hémophilie A</strong> (facteur VIII) et <strong>B</strong> (facteur IX) ; thrombopénie ; hémostatiques locaux et général.</p><p>Facteurs VIII/IX : pas de spécialités nommées dans les supports → rappel textuel uniquement.</p><p><strong>Phytoménadione</strong>, <strong>acide tranéxamique</strong> ; eau oxygénée 10 vol., alginate de calcium en conseil.</p>","seed_key":"035:sang_hemophilies:hemophilie"}'::jsonb, true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'sang_hemophilies' AND NOT mc.est_groupe;


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 20, 'photo', NULL, '{"path":"modules/a72226d0-b374-4821-a8c3-1cdad8420982/hemophilie-transmission.jpg","alt":"hemophilie transmission","legende":"hemophilie transmission","seed_key":"035:sang_hemophilies:photo-hemophilie-transmission"}'::jsonb, true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'sang_hemophilies' AND NOT mc.est_groupe;


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 30, 'photo', NULL, '{"path":"modules/a72226d0-b374-4821-a8c3-1cdad8420982/purpura.jpg","alt":"purpura","legende":"purpura","seed_key":"035:sang_hemophilies:photo-purpura"}'::jsonb, true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'sang_hemophilies' AND NOT mc.est_groupe;


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 40, 'conseil', NULL, '{"pathologie":"Petite plaie — conseils","corps_html":"<p>Eau oxygénée 10 vol., pansements (alginate…) selon contexte ; orienter si saignement abondant ou hémophilie connue.</p>","seed_key":"035:sang_hemophilies:conseil-local"}'::jsonb, true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'sang_hemophilies' AND NOT mc.est_groupe;


-- Molécule sang_hemophilies : matrice_ids depuis publications de la leçon
INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 50, 'molecule', 'Molécules du programme',
  jsonb_build_object(
    'seed_key', '035:sang_hemophilies:molecule-lot',
    'matrice_ids', coalesce((
      SELECT jsonb_agg(sub.m ORDER BY sub.m)
      FROM (
        SELECT DISTINCT c.matrice_id AS m
        FROM jeupharma.publications_connaissances pc
        JOIN jeupharma.connaissances c ON c.id = pc.connaissance_id
        WHERE pc.module_id = mc.id AND pc.actif
      ) sub
    ), '[]'::jsonb),
    'matrice_id', (
      SELECT sub.m FROM (
        SELECT DISTINCT c.matrice_id AS m
        FROM jeupharma.publications_connaissances pc
        JOIN jeupharma.connaissances c ON c.id = pc.connaissance_id
        WHERE pc.module_id = mc.id AND pc.actif
      ) sub ORDER BY sub.m LIMIT 1
    )
  ),
  true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'sang_hemophilies' AND NOT mc.est_groupe;


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 10, 'texte', 'Artériosclérose et athérosclérose', '{"html":"<p><strong>Artériosclérose</strong> : lésions dégénératives des artères → perte d’élasticité (HTA « essentielle », anévrismes).</p><p><strong>Athérosclérose</strong> : plaques lipidiques dans l’intima → sténose, ralentissement du flux, inflammation, thromboses.</p><p><strong>Complications</strong> : angor, AIT, AOMI, IDM, AVC. <em>Aucune nouvelle molécule</em> sur cette leçon — lecture des schémas.</p>","seed_key":"035:cv_definitions:atherome"}'::jsonb, true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'cv_definitions' AND NOT mc.est_groupe;


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 20, 'photo', NULL, '{"path":"modules/e9e30d64-3829-466c-8ccc-bfb0064adf06/arteres-anevrisme.jpg","alt":"arteres anevrisme","legende":"arteres anevrisme","seed_key":"035:cv_definitions:photo-arteres-anevrisme"}'::jsonb, true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'cv_definitions' AND NOT mc.est_groupe;


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 30, 'photo', NULL, '{"path":"modules/e9e30d64-3829-466c-8ccc-bfb0064adf06/plaque-atherome.jpg","alt":"plaque atherome","legende":"plaque atherome","seed_key":"035:cv_definitions:photo-plaque-atherome"}'::jsonb, true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'cv_definitions' AND NOT mc.est_groupe;


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 40, 'photo', NULL, '{"path":"modules/e9e30d64-3829-466c-8ccc-bfb0064adf06/atherosclerose-symptomes.jpg","alt":"atherosclerose symptomes","legende":"atherosclerose symptomes","seed_key":"035:cv_definitions:photo-atherosclerose-symptomes"}'::jsonb, true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'cv_definitions' AND NOT mc.est_groupe;


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 10, 'texte', 'Angor', '{"html":"<p>Angor <strong>stable</strong> ; le support mentionne aussi « instable ou Prinzmetal » — deux entités souvent confondues.</p><p>Anti-angoreux : dérivés nitrés (spray SL, patchs 8–12 h off), molsidomine, nicorandil, ivabradine ; INCA et bêtabloquants cités pour l’angor.</p>","seed_key":"035:cv_angor:angor"}'::jsonb, true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'cv_angor' AND NOT mc.est_groupe;


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 20, 'video', 'Spray sublingual — rappel d’emploi (stub)', '{"url":"https://www.youtube.com/watch?v=ah601yBXPS8","seed_key":"035:cv_angor:vid-natispray"}'::jsonb, true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'cv_angor' AND NOT mc.est_groupe;


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 30, 'photo', NULL, '{"path":"modules/5eb80f08-844a-4816-90d7-3e7071897d4b/maladie-coronarienne.jpg","alt":"maladie coronarienne","legende":"maladie coronarienne","seed_key":"035:cv_angor:photo-maladie-coronarienne"}'::jsonb, true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'cv_angor' AND NOT mc.est_groupe;


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 40, 'photo', NULL, '{"path":"modules/5eb80f08-844a-4816-90d7-3e7071897d4b/angor-effort.jpg","alt":"angor effort","legende":"angor effort","seed_key":"035:cv_angor:photo-angor-effort"}'::jsonb, true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'cv_angor' AND NOT mc.est_groupe;


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 50, 'photo', NULL, '{"path":"modules/5eb80f08-844a-4816-90d7-3e7071897d4b/natispray.jpg","alt":"natispray","legende":"natispray","seed_key":"035:cv_angor:photo-natispray"}'::jsonb, true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'cv_angor' AND NOT mc.est_groupe;


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 60, 'photo', NULL, '{"path":"modules/5eb80f08-844a-4816-90d7-3e7071897d4b/douleur-angineuse.jpg","alt":"douleur angineuse","legende":"douleur angineuse","seed_key":"035:cv_angor:photo-douleur-angineuse"}'::jsonb, true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'cv_angor' AND NOT mc.est_groupe;


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 70, 'photo', NULL, '{"path":"modules/5eb80f08-844a-4816-90d7-3e7071897d4b/betabloquants.jpg","alt":"betabloquants","legende":"betabloquants","seed_key":"035:cv_angor:photo-betabloquants"}'::jsonb, true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'cv_angor' AND NOT mc.est_groupe;


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 80, 'conseil', NULL, '{"pathologie":"Crise d’angor","corps_html":"<p><strong>Trinitrine</strong> : en général <strong>2 pulvérisations</strong>, puis rappeler la conduite à tenir si persistance (≤ 15 min) — orienter vers les urgences si douleur prolongée.</p>","seed_key":"035:cv_angor:conseil-crise"}'::jsonb, true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'cv_angor' AND NOT mc.est_groupe;


-- Molécule cv_angor : matrice_ids depuis publications de la leçon
INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 90, 'molecule', 'Molécules du programme',
  jsonb_build_object(
    'seed_key', '035:cv_angor:molecule-lot',
    'matrice_ids', coalesce((
      SELECT jsonb_agg(sub.m ORDER BY sub.m)
      FROM (
        SELECT DISTINCT c.matrice_id AS m
        FROM jeupharma.publications_connaissances pc
        JOIN jeupharma.connaissances c ON c.id = pc.connaissance_id
        WHERE pc.module_id = mc.id AND pc.actif
      ) sub
    ), '[]'::jsonb),
    'matrice_id', (
      SELECT sub.m FROM (
        SELECT DISTINCT c.matrice_id AS m
        FROM jeupharma.publications_connaissances pc
        JOIN jeupharma.connaissances c ON c.id = pc.connaissance_id
        WHERE pc.module_id = mc.id AND pc.actif
      ) sub ORDER BY sub.m LIMIT 1
    )
  ),
  true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'cv_angor' AND NOT mc.est_groupe;


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 10, 'texte', 'Syndrome coronarien aigu', '{"html":"<p>Définition, signes, marqueurs biologiques, complications.</p><p><strong>BASIC</strong> post-infarctus : bêtabloquant + antiagrégant + <strong>statine</strong> + IEC + contrôle des FDR.</p>","seed_key":"035:cv_idm:idm"}'::jsonb, true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'cv_idm' AND NOT mc.est_groupe;


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 20, 'video', 'Angioplastie et stent (stub pédagogique)', '{"url":"https://www.youtube.com/watch?v=SGzp9wqeu84","seed_key":"035:cv_idm:vid-stent"}'::jsonb, true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'cv_idm' AND NOT mc.est_groupe;


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 30, 'photo', NULL, '{"path":"modules/96adf329-cad1-4b1b-896e-c9d930d252ba/idm-schema.jpg","alt":"idm schema","legende":"idm schema","seed_key":"035:cv_idm:photo-idm-schema"}'::jsonb, true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'cv_idm' AND NOT mc.est_groupe;


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 40, 'photo', NULL, '{"path":"modules/96adf329-cad1-4b1b-896e-c9d930d252ba/idm-signes.jpg","alt":"idm signes","legende":"idm signes","seed_key":"035:cv_idm:photo-idm-signes"}'::jsonb, true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'cv_idm' AND NOT mc.est_groupe;


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 50, 'photo', NULL, '{"path":"modules/96adf329-cad1-4b1b-896e-c9d930d252ba/progression-plaque.jpg","alt":"progression plaque","legende":"progression plaque","seed_key":"035:cv_idm:photo-progression-plaque"}'::jsonb, true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'cv_idm' AND NOT mc.est_groupe;


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 60, 'photo', NULL, '{"path":"modules/96adf329-cad1-4b1b-896e-c9d930d252ba/stades-atherome.jpg","alt":"stades atherome","legende":"stades atherome","seed_key":"035:cv_idm:photo-stades-atherome"}'::jsonb, true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'cv_idm' AND NOT mc.est_groupe;


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 70, 'photo', NULL, '{"path":"modules/96adf329-cad1-4b1b-896e-c9d930d252ba/pontage-coronarien.jpg","alt":"pontage coronarien","legende":"pontage coronarien","seed_key":"035:cv_idm:photo-pontage-coronarien"}'::jsonb, true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'cv_idm' AND NOT mc.est_groupe;


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 80, 'photo', NULL, '{"path":"modules/96adf329-cad1-4b1b-896e-c9d930d252ba/pontage-schema.jpg","alt":"pontage schema","legende":"pontage schema","seed_key":"035:cv_idm:photo-pontage-schema"}'::jsonb, true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'cv_idm' AND NOT mc.est_groupe;


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 90, 'photo', NULL, '{"path":"modules/96adf329-cad1-4b1b-896e-c9d930d252ba/angioplastie-stent.jpg","alt":"angioplastie stent","legende":"angioplastie stent","seed_key":"035:cv_idm:photo-angioplastie-stent"}'::jsonb, true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'cv_idm' AND NOT mc.est_groupe;


-- Molécule cv_idm : matrice_ids depuis publications de la leçon
INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 100, 'molecule', 'Molécules du programme',
  jsonb_build_object(
    'seed_key', '035:cv_idm:molecule-lot',
    'matrice_ids', coalesce((
      SELECT jsonb_agg(sub.m ORDER BY sub.m)
      FROM (
        SELECT DISTINCT c.matrice_id AS m
        FROM jeupharma.publications_connaissances pc
        JOIN jeupharma.connaissances c ON c.id = pc.connaissance_id
        WHERE pc.module_id = mc.id AND pc.actif
      ) sub
    ), '[]'::jsonb),
    'matrice_id', (
      SELECT sub.m FROM (
        SELECT DISTINCT c.matrice_id AS m
        FROM jeupharma.publications_connaissances pc
        JOIN jeupharma.connaissances c ON c.id = pc.connaissance_id
        WHERE pc.module_id = mc.id AND pc.actif
      ) sub ORDER BY sub.m LIMIT 1
    )
  ),
  true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'cv_idm' AND NOT mc.est_groupe;


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 10, 'texte', 'Arythmies et classes VW', '{"html":"<p>Classification de <strong>Vaughan-Williams</strong> ; BAV ; tachy/brady ; FA ; extrasystoles.</p><p>Antiarythmiques classes I et III du cours ; vérapamil et diltiazem (classe IV) déjà vus.</p>","seed_key":"035:cv_arythmies:vw"}'::jsonb, true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'cv_arythmies' AND NOT mc.est_groupe;


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 20, 'photo', NULL, '{"path":"modules/bbc00500-0686-4c31-893f-acbd71832018/ecg-base.jpg","alt":"ecg base","legende":"ecg base","seed_key":"035:cv_arythmies:photo-ecg-base"}'::jsonb, true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'cv_arythmies' AND NOT mc.est_groupe;


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 30, 'photo', NULL, '{"path":"modules/bbc00500-0686-4c31-893f-acbd71832018/ecg-troubles.jpg","alt":"ecg troubles","legende":"ecg troubles","seed_key":"035:cv_arythmies:photo-ecg-troubles"}'::jsonb, true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'cv_arythmies' AND NOT mc.est_groupe;


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 40, 'photo', NULL, '{"path":"modules/bbc00500-0686-4c31-893f-acbd71832018/potentiel-action.jpg","alt":"potentiel action","legende":"potentiel action","seed_key":"035:cv_arythmies:photo-potentiel-action"}'::jsonb, true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'cv_arythmies' AND NOT mc.est_groupe;


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 50, 'photo', NULL, '{"path":"modules/bbc00500-0686-4c31-893f-acbd71832018/qt-long.jpg","alt":"qt long","legende":"qt long","seed_key":"035:cv_arythmies:photo-qt-long"}'::jsonb, true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'cv_arythmies' AND NOT mc.est_groupe;


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 60, 'photo', NULL, '{"path":"modules/bbc00500-0686-4c31-893f-acbd71832018/torsades-medicaments.jpg","alt":"torsades medicaments","legende":"torsades medicaments","seed_key":"035:cv_arythmies:photo-torsades-medicaments"}'::jsonb, true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'cv_arythmies' AND NOT mc.est_groupe;


-- Molécule cv_arythmies : matrice_ids depuis publications de la leçon
INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 70, 'molecule', 'Molécules du programme',
  jsonb_build_object(
    'seed_key', '035:cv_arythmies:molecule-lot',
    'matrice_ids', coalesce((
      SELECT jsonb_agg(sub.m ORDER BY sub.m)
      FROM (
        SELECT DISTINCT c.matrice_id AS m
        FROM jeupharma.publications_connaissances pc
        JOIN jeupharma.connaissances c ON c.id = pc.connaissance_id
        WHERE pc.module_id = mc.id AND pc.actif
      ) sub
    ), '[]'::jsonb),
    'matrice_id', (
      SELECT sub.m FROM (
        SELECT DISTINCT c.matrice_id AS m
        FROM jeupharma.publications_connaissances pc
        JOIN jeupharma.connaissances c ON c.id = pc.connaissance_id
        WHERE pc.module_id = mc.id AND pc.actif
      ) sub ORDER BY sub.m LIMIT 1
    )
  ),
  true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'cv_arythmies' AND NOT mc.est_groupe;


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 10, 'texte', 'Insuffisance cardiaque', '{"html":"<p>Définition, signes cliniques, classes thérapeutiques : bêtabloquants, IEC/ARA II, sacubitril/valsartan, SGLT2, digoxine, diurétiques (renvoi HTA pour furosémide, spironolactone, éplérénone).</p>","seed_key":"035:cv_ic:ic"}'::jsonb, true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'cv_ic' AND NOT mc.est_groupe;


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 20, 'photo', NULL, '{"path":"modules/ed49bf8d-55c6-4756-952a-f927b1ed1e07/pompe-defaillante.jpg","alt":"pompe defaillante","legende":"pompe defaillante","seed_key":"035:cv_ic:photo-pompe-defaillante"}'::jsonb, true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'cv_ic' AND NOT mc.est_groupe;


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 30, 'photo', NULL, '{"path":"modules/ed49bf8d-55c6-4756-952a-f927b1ed1e07/coeur-normal-ic.jpg","alt":"coeur normal ic","legende":"coeur normal ic","seed_key":"035:cv_ic:photo-coeur-normal-ic"}'::jsonb, true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'cv_ic' AND NOT mc.est_groupe;


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 40, 'photo', NULL, '{"path":"modules/ed49bf8d-55c6-4756-952a-f927b1ed1e07/affiche-ic.jpg","alt":"affiche ic","legende":"affiche ic","seed_key":"035:cv_ic:photo-affiche-ic"}'::jsonb, true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'cv_ic' AND NOT mc.est_groupe;


-- Molécule cv_ic : matrice_ids depuis publications de la leçon
INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 50, 'molecule', 'Molécules du programme',
  jsonb_build_object(
    'seed_key', '035:cv_ic:molecule-lot',
    'matrice_ids', coalesce((
      SELECT jsonb_agg(sub.m ORDER BY sub.m)
      FROM (
        SELECT DISTINCT c.matrice_id AS m
        FROM jeupharma.publications_connaissances pc
        JOIN jeupharma.connaissances c ON c.id = pc.connaissance_id
        WHERE pc.module_id = mc.id AND pc.actif
      ) sub
    ), '[]'::jsonb),
    'matrice_id', (
      SELECT sub.m FROM (
        SELECT DISTINCT c.matrice_id AS m
        FROM jeupharma.publications_connaissances pc
        JOIN jeupharma.connaissances c ON c.id = pc.connaissance_id
        WHERE pc.module_id = mc.id AND pc.actif
      ) sub ORDER BY sub.m LIMIT 1
    )
  ),
  true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'cv_ic' AND NOT mc.est_groupe;


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 10, 'texte', 'AOMI et insuffisance veineuse', '{"html":"<p>AOMI ; retour veineux ; <strong>6 stades</strong> ; contention ; hémorroïdes.</p><p>Vasodilatateurs, veinotoniques ; sclérosants (noms commerciaux du cours) ; aromathérapie/homéopathie en conseil texte.</p>","seed_key":"035:cv_veines:veines"}'::jsonb, true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'cv_veines' AND NOT mc.est_groupe;


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 20, 'photo', NULL, '{"path":"modules/a391cd7f-1081-48d3-b106-4e6f0e046eda/aomi-stades.jpg","alt":"aomi stades","legende":"aomi stades","seed_key":"035:cv_veines:photo-aomi-stades"}'::jsonb, true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'cv_veines' AND NOT mc.est_groupe;


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 30, 'photo', NULL, '{"path":"modules/a391cd7f-1081-48d3-b106-4e6f0e046eda/retour-veineux.jpg","alt":"retour veineux","legende":"retour veineux","seed_key":"035:cv_veines:photo-retour-veineux"}'::jsonb, true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'cv_veines' AND NOT mc.est_groupe;


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 40, 'photo', NULL, '{"path":"modules/a391cd7f-1081-48d3-b106-4e6f0e046eda/pompe-musculaire.jpg","alt":"pompe musculaire","legende":"pompe musculaire","seed_key":"035:cv_veines:photo-pompe-musculaire"}'::jsonb, true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'cv_veines' AND NOT mc.est_groupe;


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 50, 'photo', NULL, '{"path":"modules/a391cd7f-1081-48d3-b106-4e6f0e046eda/valvules.jpg","alt":"valvules","legende":"valvules","seed_key":"035:cv_veines:photo-valvules"}'::jsonb, true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'cv_veines' AND NOT mc.est_groupe;


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 60, 'photo', NULL, '{"path":"modules/a391cd7f-1081-48d3-b106-4e6f0e046eda/stade-varicosites.jpg","alt":"stade varicosites","legende":"stade varicosites","seed_key":"035:cv_veines:photo-stade-varicosites"}'::jsonb, true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'cv_veines' AND NOT mc.est_groupe;


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 70, 'photo', NULL, '{"path":"modules/a391cd7f-1081-48d3-b106-4e6f0e046eda/stade-varices.jpg","alt":"stade varices","legende":"stade varices","seed_key":"035:cv_veines:photo-stade-varices"}'::jsonb, true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'cv_veines' AND NOT mc.est_groupe;


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 80, 'photo', NULL, '{"path":"modules/a391cd7f-1081-48d3-b106-4e6f0e046eda/stade-oedeme.jpg","alt":"stade oedeme","legende":"stade oedeme","seed_key":"035:cv_veines:photo-stade-oedeme"}'::jsonb, true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'cv_veines' AND NOT mc.est_groupe;


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 90, 'photo', NULL, '{"path":"modules/a391cd7f-1081-48d3-b106-4e6f0e046eda/stade-trophique.jpg","alt":"stade trophique","legende":"stade trophique","seed_key":"035:cv_veines:photo-stade-trophique"}'::jsonb, true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'cv_veines' AND NOT mc.est_groupe;


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 100, 'photo', NULL, '{"path":"modules/a391cd7f-1081-48d3-b106-4e6f0e046eda/stade-ulcere.jpg","alt":"stade ulcere","legende":"stade ulcere","seed_key":"035:cv_veines:photo-stade-ulcere"}'::jsonb, true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'cv_veines' AND NOT mc.est_groupe;


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 110, 'photo', NULL, '{"path":"modules/a391cd7f-1081-48d3-b106-4e6f0e046eda/echo-doppler.jpg","alt":"echo doppler","legende":"echo doppler","seed_key":"035:cv_veines:photo-echo-doppler"}'::jsonb, true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'cv_veines' AND NOT mc.est_groupe;


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 120, 'photo', NULL, '{"path":"modules/a391cd7f-1081-48d3-b106-4e6f0e046eda/conseils-habitudes.jpg","alt":"conseils habitudes","legende":"conseils habitudes","seed_key":"035:cv_veines:photo-conseils-habitudes"}'::jsonb, true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'cv_veines' AND NOT mc.est_groupe;


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 130, 'photo', NULL, '{"path":"modules/a391cd7f-1081-48d3-b106-4e6f0e046eda/contention-classes.jpg","alt":"contention classes","legende":"contention classes","seed_key":"035:cv_veines:photo-contention-classes"}'::jsonb, true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'cv_veines' AND NOT mc.est_groupe;


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 140, 'photo', NULL, '{"path":"modules/a391cd7f-1081-48d3-b106-4e6f0e046eda/hemorroides.jpg","alt":"hemorroides","legende":"hemorroides","seed_key":"035:cv_veines:photo-hemorroides"}'::jsonb, true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'cv_veines' AND NOT mc.est_groupe;


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 150, 'conseil', NULL, '{"pathologie":"Jambes lourdes","corps_html":"<p>Marche, surélévation, éviter chaleur prolongée ; contention selon stade ; hygiène de vie.</p>","seed_key":"035:cv_veines:conseil-jambes"}'::jsonb, true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'cv_veines' AND NOT mc.est_groupe;


-- Molécule cv_veines : matrice_ids depuis publications de la leçon
INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 160, 'molecule', 'Molécules du programme',
  jsonb_build_object(
    'seed_key', '035:cv_veines:molecule-lot',
    'matrice_ids', coalesce((
      SELECT jsonb_agg(sub.m ORDER BY sub.m)
      FROM (
        SELECT DISTINCT c.matrice_id AS m
        FROM jeupharma.publications_connaissances pc
        JOIN jeupharma.connaissances c ON c.id = pc.connaissance_id
        WHERE pc.module_id = mc.id AND pc.actif
      ) sub
    ), '[]'::jsonb),
    'matrice_id', (
      SELECT sub.m FROM (
        SELECT DISTINCT c.matrice_id AS m
        FROM jeupharma.publications_connaissances pc
        JOIN jeupharma.connaissances c ON c.id = pc.connaissance_id
        WHERE pc.module_id = mc.id AND pc.actif
      ) sub ORDER BY sub.m LIMIT 1
    )
  ),
  true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'cv_veines' AND NOT mc.est_groupe;


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 10, 'texte', 'OAP et urgences', '{"html":"<p>OAP : signes d’alerte ; pas de traitement OAP nommé dans le texte du support.</p><p><strong>Anaphylaxie</strong> : adrénaline auto-injectable (Anapen, Jext).</p><p>Orientation <strong>15</strong> en urgence vitale.</p>","seed_key":"035:cv_urgences:oap"}'::jsonb, true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'cv_urgences' AND NOT mc.est_groupe;


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 20, 'photo', NULL, '{"path":"modules/da6b1276-8a88-417b-9438-be0306a72719/circulation.jpg","alt":"circulation","legende":"circulation","seed_key":"035:cv_urgences:photo-circulation"}'::jsonb, true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'cv_urgences' AND NOT mc.est_groupe;


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 30, 'photo', NULL, '{"path":"modules/da6b1276-8a88-417b-9438-be0306a72719/oap.jpg","alt":"oap","legende":"oap","seed_key":"035:cv_urgences:photo-oap"}'::jsonb, true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'cv_urgences' AND NOT mc.est_groupe;


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 40, 'conseil', NULL, '{"pathologie":"Détresse respiratoire aiguë","corps_html":"<p>Appeler le <strong>15</strong> ; ne pas retarder la prise en charge ; position demi-assise si OAP suspecté.</p>","seed_key":"035:cv_urgences:conseil-oap"}'::jsonb, true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'cv_urgences' AND NOT mc.est_groupe;


-- Molécule cv_urgences : matrice_ids depuis publications de la leçon
INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 50, 'molecule', 'Molécules du programme',
  jsonb_build_object(
    'seed_key', '035:cv_urgences:molecule-lot',
    'matrice_ids', coalesce((
      SELECT jsonb_agg(sub.m ORDER BY sub.m)
      FROM (
        SELECT DISTINCT c.matrice_id AS m
        FROM jeupharma.publications_connaissances pc
        JOIN jeupharma.connaissances c ON c.id = pc.connaissance_id
        WHERE pc.module_id = mc.id AND pc.actif
      ) sub
    ), '[]'::jsonb),
    'matrice_id', (
      SELECT sub.m FROM (
        SELECT DISTINCT c.matrice_id AS m
        FROM jeupharma.publications_connaissances pc
        JOIN jeupharma.connaissances c ON c.id = pc.connaissance_id
        WHERE pc.module_id = mc.id AND pc.actif
      ) sub ORDER BY sub.m LIMIT 1
    )
  ),
  true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'cv_urgences' AND NOT mc.est_groupe;


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 10, 'texte', 'Pression artérielle', '{"html":"<p>PA = force du sang sur la paroi artérielle. Déterminants : <strong>VES × FC × résistances</strong> ; élasticité vasculaire.</p><p>Mesure au repos ; repères OMS (optimale, normale, HTA grades 1–3).</p><p>Régulation : SNA, résistances, volémie rénale — <em>RAA détaillé en leçon suivante</em>.</p><p>Barorécepteurs ; vasodilatateurs/vasoconstricteurs endogènes (NO, bradykinine, prostacycline vs catécholamines, angiotensine II, endothéline).</p>","seed_key":"035:hta_rappel_pa:pa"}'::jsonb, true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'hta_rappel_pa' AND NOT mc.est_groupe;


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 20, 'video', 'Mesure de la PA', '{"url":"https://www.youtube.com/watch?v=SbG23nc_U_4","seed_key":"035:hta_rappel_pa:vid-pa"}'::jsonb, true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'hta_rappel_pa' AND NOT mc.est_groupe;


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 30, 'photo', NULL, '{"path":"modules/26f24ecd-7a54-40ed-a97f-f790f12d2cfc/tensiometre.jpg","alt":"tensiometre","legende":"tensiometre","seed_key":"035:hta_rappel_pa:photo-tensiometre"}'::jsonb, true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'hta_rappel_pa' AND NOT mc.est_groupe;


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 40, 'photo', NULL, '{"path":"modules/26f24ecd-7a54-40ed-a97f-f790f12d2cfc/determinants-pa.jpg","alt":"determinants pa","legende":"determinants pa","seed_key":"035:hta_rappel_pa:photo-determinants-pa"}'::jsonb, true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'hta_rappel_pa' AND NOT mc.est_groupe;


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 50, 'photo', NULL, '{"path":"modules/26f24ecd-7a54-40ed-a97f-f790f12d2cfc/regulation-pa.jpg","alt":"regulation pa","legende":"regulation pa","seed_key":"035:hta_rappel_pa:photo-regulation-pa"}'::jsonb, true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'hta_rappel_pa' AND NOT mc.est_groupe;


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 60, 'photo', NULL, '{"path":"modules/26f24ecd-7a54-40ed-a97f-f790f12d2cfc/elasticite-vasculaire.jpg","alt":"elasticite vasculaire","legende":"elasticite vasculaire","seed_key":"035:hta_rappel_pa:photo-elasticite-vasculaire"}'::jsonb, true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'hta_rappel_pa' AND NOT mc.est_groupe;


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 70, 'photo', NULL, '{"path":"modules/26f24ecd-7a54-40ed-a97f-f790f12d2cfc/barorecepteurs.jpg","alt":"barorecepteurs","legende":"barorecepteurs","seed_key":"035:hta_rappel_pa:photo-barorecepteurs"}'::jsonb, true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'hta_rappel_pa' AND NOT mc.est_groupe;


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 80, 'photo', NULL, '{"path":"modules/26f24ecd-7a54-40ed-a97f-f790f12d2cfc/courbe-pression.jpg","alt":"courbe pression","legende":"courbe pression","seed_key":"035:hta_rappel_pa:photo-courbe-pression"}'::jsonb, true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'hta_rappel_pa' AND NOT mc.est_groupe;


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 90, 'photo', NULL, '{"path":"modules/26f24ecd-7a54-40ed-a97f-f790f12d2cfc/mesure-auscultatoire.jpg","alt":"mesure auscultatoire","legende":"mesure auscultatoire","seed_key":"035:hta_rappel_pa:photo-mesure-auscultatoire"}'::jsonb, true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'hta_rappel_pa' AND NOT mc.est_groupe;


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 10, 'texte', 'Système rénine–angiotensine–aldostérone', '{"html":"<p>Rénine (appareil juxtaglomérulaire) → angiotensine I → <strong>ECA</strong> → angiotensine II.</p><p>Effets : sympathique, aldostérone, vasoconstriction, ADH ; rétrocontrôle.</p><p>Exercices RAA (trous/QCM) : réponses via le jeu <strong>JP-CVH2</strong>, pas de spoiler ici.</p>","seed_key":"035:hta_raa:raa"}'::jsonb, true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'hta_raa' AND NOT mc.est_groupe;


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 20, 'photo', NULL, '{"path":"modules/603a0958-684d-41ee-997e-ded72cf1b370/schema-raa.jpg","alt":"Schéma du système rénine–angiotensine–aldostérone","legende":"Schéma du système rénine–angiotensine–aldostérone","seed_key":"035:hta_raa:photo-schema-raa"}'::jsonb, true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'hta_raa' AND NOT mc.est_groupe;


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 30, 'photo', NULL, '{"path":"modules/603a0958-684d-41ee-997e-ded72cf1b370/raa-synthese.jpg","alt":"raa synthese","legende":"raa synthese","seed_key":"035:hta_raa:photo-raa-synthese"}'::jsonb, true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'hta_raa' AND NOT mc.est_groupe;


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 10, 'texte', 'HTA clinique', '{"html":"<p>HTA essentielle vs secondaire ; signes ; complications (organes cibles).</p><p>Hygiène : sel, excitants, réglisse, pseudoéphédrine, corticoïdes…</p><p>Cas patients du support (Me X, M Y, Me Eve, M Hyper) — traités dans le jeu.</p>","seed_key":"035:hta_clinique:clinique"}'::jsonb, true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'hta_clinique' AND NOT mc.est_groupe;


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 20, 'photo', NULL, '{"path":"modules/5a2f6bb1-7901-4b03-b84d-6360916a41fb/complications-organes.jpg","alt":"complications organes","legende":"complications organes","seed_key":"035:hta_clinique:photo-complications-organes"}'::jsonb, true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'hta_clinique' AND NOT mc.est_groupe;


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 30, 'conseil', NULL, '{"pathologie":"HTA — hygiène de vie","corps_html":"<p>Régime hyposodé, activité physique, poids, limiter alcool et excitants ; automesure encadrée.</p>","seed_key":"035:hta_clinique:conseil-hta"}'::jsonb, true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'hta_clinique' AND NOT mc.est_groupe;


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 10, 'texte', 'Antihypertenseurs par classe', '{"html":"<p>Cibles : <strong>FC</strong>, <strong>volémie</strong>, <strong>vasodilatation</strong>.</p><p>BB, INCA, diurétiques, alpha/centraux, IEC, sartans — union stricte du deck HTA (voir schémas et programme molécules).</p>","seed_key":"035:hta_classes:classes"}'::jsonb, true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'hta_classes' AND NOT mc.est_groupe;


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 20, 'photo', NULL, '{"path":"modules/f0382a46-ee1d-4a53-8ef8-fdd8ea17bd6e/raa-ieca.jpg","alt":"raa ieca","legende":"raa ieca","seed_key":"035:hta_classes:photo-raa-ieca"}'::jsonb, true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'hta_classes' AND NOT mc.est_groupe;


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 30, 'photo', NULL, '{"path":"modules/f0382a46-ee1d-4a53-8ef8-fdd8ea17bd6e/raa-ieca-sartans.jpg","alt":"raa ieca sartans","legende":"raa ieca sartans","seed_key":"035:hta_classes:photo-raa-ieca-sartans"}'::jsonb, true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'hta_classes' AND NOT mc.est_groupe;


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 40, 'photo', NULL, '{"path":"modules/f0382a46-ee1d-4a53-8ef8-fdd8ea17bd6e/antihta-centraux.jpg","alt":"antihta centraux","legende":"antihta centraux","seed_key":"035:hta_classes:photo-antihta-centraux"}'::jsonb, true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'hta_classes' AND NOT mc.est_groupe;


-- Molécule hta_classes : matrice_ids depuis publications de la leçon
INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 50, 'molecule', 'Molécules du programme',
  jsonb_build_object(
    'seed_key', '035:hta_classes:molecule-lot',
    'matrice_ids', coalesce((
      SELECT jsonb_agg(sub.m ORDER BY sub.m)
      FROM (
        SELECT DISTINCT c.matrice_id AS m
        FROM jeupharma.publications_connaissances pc
        JOIN jeupharma.connaissances c ON c.id = pc.connaissance_id
        WHERE pc.module_id = mc.id AND pc.actif
      ) sub
    ), '[]'::jsonb),
    'matrice_id', (
      SELECT sub.m FROM (
        SELECT DISTINCT c.matrice_id AS m
        FROM jeupharma.publications_connaissances pc
        JOIN jeupharma.connaissances c ON c.id = pc.connaissance_id
        WHERE pc.module_id = mc.id AND pc.actif
      ) sub ORDER BY sub.m LIMIT 1
    )
  ),
  true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'hta_classes' AND NOT mc.est_groupe;


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 10, 'texte', 'Associations fixes et dispensation', '{"html":"<p>Tableau des associations du support (Cibadrex, Coveram, Exforge, Lodoz, Natrixam…).</p><p>Hypotension orthostatique ; grille « Je fais attention / Je conseille / Je surveille ».</p><p>Associations : fiches composants déjà publiés + tableau ci-dessous.</p>","seed_key":"035:hta_associations:assoc"}'::jsonb, true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'hta_associations' AND NOT mc.est_groupe;


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 20, 'photo', NULL, '{"path":"modules/0918cd23-6d0b-47c4-8f61-73c47e6842fb/associations-possibles.jpg","alt":"associations possibles","legende":"associations possibles","seed_key":"035:hta_associations:photo-associations-possibles"}'::jsonb, true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'hta_associations' AND NOT mc.est_groupe;


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 30, 'photo', NULL, '{"path":"modules/0918cd23-6d0b-47c4-8f61-73c47e6842fb/dispensation.jpg","alt":"dispensation","legende":"dispensation","seed_key":"035:hta_associations:photo-dispensation"}'::jsonb, true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'hta_associations' AND NOT mc.est_groupe;


INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 40, 'conseil', NULL, '{"pathologie":"Dispensation antihypertenseurs","corps_html":"<p>Première prise : risque d’hypotension — conseiller de s’asseoir, de se lever lentement ; horaires réguliers ; ne pas arrêter brutalement.</p>","seed_key":"035:hta_associations:conseil-disp"}'::jsonb, true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'hta_associations' AND NOT mc.est_groupe;


-- Molécule hta_associations : matrice_ids depuis publications de la leçon
INSERT INTO jeupharma.module_blocs (module_id, ordre, type_bloc, titre, payload_json, visible)
SELECT mc.id, 50, 'molecule', 'Molécules du programme',
  jsonb_build_object(
    'seed_key', '035:hta_associations:molecule-lot',
    'matrice_ids', coalesce((
      SELECT jsonb_agg(sub.m ORDER BY sub.m)
      FROM (
        SELECT DISTINCT c.matrice_id AS m
        FROM jeupharma.publications_connaissances pc
        JOIN jeupharma.connaissances c ON c.id = pc.connaissance_id
        WHERE pc.module_id = mc.id AND pc.actif
      ) sub
    ), '[]'::jsonb),
    'matrice_id', (
      SELECT sub.m FROM (
        SELECT DISTINCT c.matrice_id AS m
        FROM jeupharma.publications_connaissances pc
        JOIN jeupharma.connaissances c ON c.id = pc.connaissance_id
        WHERE pc.module_id = mc.id AND pc.actif
      ) sub ORDER BY sub.m LIMIT 1
    )
  ),
  true
FROM jeupharma.modules_cours mc
JOIN jeupharma.parcours_apprentissage pa ON pa.id = mc.parcours_id AND pa.code = 'cardiovasculaires_deust_2a'
WHERE mc.code = 'hta_associations' AND NOT mc.est_groupe;


-- Publication leçons pour les joueurs (contenu + critères jeux déjà posés en 032)
UPDATE jeupharma.modules_cours mc
SET publie = true, statut = 'publie', contenu_maj_at = now(), updated_at = now()
FROM jeupharma.parcours_apprentissage pa
WHERE mc.parcours_id = pa.id AND pa.code = 'cardiovasculaires_deust_2a' AND NOT mc.est_groupe;

UPDATE jeupharma.modules_cours mc
SET contenu_maj_at = now(), updated_at = now()
FROM jeupharma.parcours_apprentissage pa
WHERE mc.parcours_id = pa.id AND pa.code = 'cardiovasculaires_deust_2a' AND NOT mc.est_groupe;
