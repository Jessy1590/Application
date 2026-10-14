-- =============================================================================
-- 034 : RCP BDPM condensé → matrice_medicaments (Cardio DEUST 2A)
-- Généré par sql/ops/cardio_rcp_matrice_gen.mjs — NE PAS éditer à la main.
-- Matrice / référentiel uniquement ; publications DEUST = source cours (035).
-- EI : fréquents ou rares graves. Idempotent (jp_fill sans doublon).
-- =============================================================================

CREATE OR REPLACE FUNCTION pg_temp.jp_ent(p_table text, p_valeur text)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_id uuid; v_norm text := jeupharma.normaliser_valeur(p_valeur);
BEGIN
  EXECUTE format('SELECT id FROM jeupharma.%I WHERE valeur_norm = $1 AND actif LIMIT 1', p_table) INTO v_id USING v_norm;
  IF v_id IS NULL THEN
    EXECUTE format('INSERT INTO jeupharma.%I (valeur, valeur_norm) VALUES ($1, $2) RETURNING id', p_table) INTO v_id USING p_valeur, v_norm;
  END IF;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.jp_fill(p_matrice uuid, p_champ text, p_vals text[])
RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_tbl text; v_jt text; v_fk text; v_id uuid; i int;
BEGIN
  SELECT t.ent, t.jt, t.fk INTO v_tbl, v_jt, v_fk FROM (VALUES
    ('secteurs','secteurs_therapeutiques','matrice_secteurs_therapeutiques','secteur_therapeutique_id'),
    ('ct','classes_therapeutiques','matrice_classes_therapeutiques','classe_therapeutique_id'),
    ('cp','classes_pharmacologiques','matrice_classes_pharmacologiques','classe_pharmacologique_id'),
    ('ind','indications','matrice_indications','indication_id'),
    ('ci','contre_indications','matrice_contre_indications','contre_indication_id'),
    ('ei','effets_indesirables','matrice_effets_indesirables','effet_indesirable_id'),
    ('pre','precautions_emploi','matrice_precautions_emploi','precaution_emploi_id'),
    ('inter','interactions','matrice_interactions','interaction_id'),
    ('surv','surveillances','matrice_surveillances','surveillance_id'),
    ('noms','noms_commerciaux','matrice_noms_commerciaux','nom_commercial_id')
  ) AS t(champ, ent, jt, fk) WHERE t.champ = p_champ;
  IF v_tbl IS NULL THEN RAISE EXCEPTION 'champ inconnu %', p_champ; END IF;
  IF p_vals IS NULL THEN RETURN; END IF;
  FOR i IN 1 .. coalesce(array_length(p_vals, 1), 0) LOOP
    v_id := pg_temp.jp_ent(v_tbl, p_vals[i]);
    EXECUTE format(
      'INSERT INTO jeupharma.%I (matrice_id, %I, ordre) SELECT $1, $2, $3 WHERE NOT EXISTS (SELECT 1 FROM jeupharma.%I WHERE matrice_id = $1 AND %I = $2)',
      v_jt, v_fk, v_jt, v_fk) USING p_matrice, v_id, i - 1;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.jp_matrice_by_norm(p_norm text)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_m uuid;
BEGIN
  SELECT m.id INTO v_m FROM jeupharma.matrice_medicaments m
  JOIN jeupharma.dcis d ON d.id = m.dci_id
  WHERE d.valeur_norm = jeupharma.normaliser_valeur(p_norm) AND m.statut = 'publie' LIMIT 1;
  IF v_m IS NULL THEN RAISE EXCEPTION 'fiche publie introuvable norm=%', p_norm; END IF;
  RETURN v_m;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.jp_detail_set(p_matrice uuid, p_valeur text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE jeupharma.matrice_medicaments
  SET detail_pharmacologie_id = pg_temp.jp_ent('details_pharmacologie', p_valeur), updated_at = now()
  WHERE id = p_matrice;
END $$;

DO $mig$
DECLARE
  m uuid;
BEGIN
  -- benazepril (CIS 66148697)
  m := pg_temp.jp_matrice_by_norm('benazepril');
  PERFORM pg_temp.jp_detail_set(m, 'Classe pharmacothérapeutique : inhibiteurs de l''enzyme de conversion (IEC) non associés, code ATC : C09AA07.');
  PERFORM pg_temp.jp_fill(m, 'ind', ARRAY['Hypertension artérielle.', 'Ralentissement de la progression de l''insuffisance rénale chez les patients atteints d''une néphropathie glomérulaire avec hypertension et protéinurie et ayant une clairance de la créatinine entre 30 et 60 ml/mn.', 'Le risque de survenue d''hyperkaliémie chez ces patients doit être pris en compte, une surveillance adaptée est indispensable.']);
  PERFORM pg_temp.jp_fill(m, 'ci', ARRAY['Ce médicament ne doit jamais être utilisé en cas de :', 'Hypersensibilité à la substance active ou à l’un des excipients mentionnés à la rubrique 6.1,', 'Antécédent d''angio-œdème (œdème de Quincke) lié ou non à la prise d''un inhibiteur de l''enzyme de conversion,', 'Au 2ème et 3ème trimestre de la grossesse (voir rubriques 4.4 et 4.6),', 'Utilisation concomitante avec un traitement par sacubitril/valsartan.', 'BENAZEPRIL ARROW ne doit pas être débuté moins de 36 heures après la dernière dose de sacubitril/valsartan (voir également rubriques 4.4 et 4.5).', 'Ce médicament est généralement déconseillé en cas de :', 'Associations avec l’aliskiren, les diurétiques épargneurs de potassium, les sels de potassium, l''estramustine et le lithium (voir rubrique 4.5),', 'Sténose bilatérale de l''artère rénale ou sur rein fonctionnellement unique,', 'Hyperkaliémie.']);
  PERFORM pg_temp.jp_fill(m, 'pre', ARRAY['Mises en garde spéciales', 'Double blocage du système rénine-angiotensine-aldostérone (SRAA)', 'En conséquence, le double blocage du SRAA par l’association d’IEC, d’ARA II ou d’aliskiren n’est pas recommandé (voir rubriques 4.5 et 5.1).', 'Les IEC et les ARA II ne doivent pas être associés chez les patients atteints d’une néphropathie diabétique.', 'Réactions anaphylactoïdes', 'Risque de neutropénie/agranulocytose sur terrain immunodéprimé', 'Des inhibiteurs de l''enzyme de conversion ont exceptionnellement entraîné une agranulocytose et/ou une dépression médullaire lorsqu''ils étaient administrés :', 'à doses élevées,', 'chez des patients insuffisants rénaux associant des maladies de système (collagénoses telles que lupus érythémateux disséminé ou sclérodermie), avec un traitement immunosuppresseur et/ou potentiellement leucopéniant.', 'Le strict respect des posologies préconisées semble constituer la meilleure prévention de la survenue de ces événements.', 'Toutefois, si un inhibiteur de l''enzyme de conversion doit être administré chez ce type de patients, le rapport bénéfice/risque sera soigneusement mesuré.', 'Hypersensibilité / Angio-œdème']);
  PERFORM pg_temp.jp_fill(m, 'inter', ARRAY['La survenue d''une hyperkaliémie peut dépendre de l''existence de facteurs de risque associés.', 'Associations contre-indiquées', '+ Médicaments augmentant le risque d’angio-œdème', 'L’utilisation concomitante d’IEC avec l’association sacubitril/valsartan est contre-indiquée en raison du risque accru d’angio-œdème (voir rubriques 4.3 et 4.4).', 'L’utilisation concomitante d’IEC avec le racécadotril, les inhibiteurs de mTOR (p. ex. sirolimus, évérolimus, temsirolimus) et la vildagliptine peut entraîner un risque accru d’angio-œdème (voir rubrique 4.4).', 'Chez le patient diabétique ou insuffisant rénal (DFG', '+ Aliskiren', 'Risque d’hyperkaliémie, d’insuffisance rénale, d’augmentation de la morbi-mortalité cardio-vasculaire.', 'Associations déconseillées', '+ Diurétiques épargneurs de potassium, suppléments potassiques ou substituts de sel contenant du potassium', 'Bien que la kaliémie demeure habituellement dans les limites de la normale, une hyperkaliémie peut survenir chez certains patients traités par bénazépril.', 'Par conséquent, l’association du bénazépril avec les médicaments susmentionnés n’est pas recommandée.']);
  PERFORM pg_temp.jp_fill(m, 'ei', ARRAY['Très rare : anémie hémolytique, thrombocytopénie', 'Fréquence inconnue : agranulocytose/neutropénie (voir la rubrique 4.4)', 'Rare : angio-œdème, œdème de la lèvre, œdème de la face', 'Fréquence inconnue : réactions anaphylactoïdes (voir la rubrique 4.4)', 'Fréquent : céphalées, étourdissements']);

  -- quinapril (CIS 61168571)
  m := pg_temp.jp_matrice_by_norm('quinapril');
  PERFORM pg_temp.jp_detail_set(m, 'Classe pharmacothérapeutique : INHIBITEUR DE L''ENZYME DE CONVERSION DE L’ANGIOTENSINE, code ATC : C09AA06 (système cardiovasculaire).');
  PERFORM pg_temp.jp_fill(m, 'ind', ARRAY['Hypertension artérielle ;', 'insuffisance cardiaque congestive.']);
  PERFORM pg_temp.jp_fill(m, 'ci', ARRAY['Ce médicament ne doit jamais être utilisé :', 'au cours des 2ème et 3ème trimestres de grossesse (voir rubriques 4.4 et 4.6) ;', 'en cas d’hypersensibilité à la substance active ou à l''un des excipients mentionnés à la rubrique 6.1 ;', 'en cas d’antécédent d''angio‑œdème (œdème de Quincke) lié à la prise d''un inhibiteur de l''enzyme de conversion de l''angiotensine ;', 'en association avec sacubitril/valsartan à cause d’une augmentation du risque d’angio-œdème ;', 'en association avec racécadotril, en cas d''antécédents d''angio-œdème sous inhibiteurs de l’enzyme de conversion (voir rubrique 4.5) ;', 'chez les patients souffrant d’angio-œdème neurotique idiopathique ou héréditaire ;', 'chez les patients atteints d’obstruction dynamique à l’éjection du ventricule gauche ;']);
  PERFORM pg_temp.jp_fill(m, 'pre', ARRAY['Mises en garde spéciales', 'Le quinapril doit être utilisé avec prudence chez les patients souffrant de sténose aortique.', 'En conséquence, le double blocage du SRAA par l’association d’IEC, d’ARA II ou d’aliskiren n’est pas recommandé (voir rubriques 4.5 et 5.1).', 'Les IEC et les ARA II ne doivent pas être associés chez les patients atteints d’une néphropathie diabétique.', 'Les médecins devront préciser aux patients l’importance de rapporter immédiatement tout signe d’infection (mal de gorge, fièvre) qui pourrait être un signe de neutropénie (voir rubrique 4.5).', 'Une agranulocytose a rarement été rapportée pendant le traitement par le quinapril.', 'Comme pour les autres inhibiteurs de l’enzyme de conversion, un suivi des globules blancs doit être envisagé chez les patients atteints de collagénose vasculaire et/ou d’une maladie rénale.', 'Angio‑œdème (œdème de Quincke) : un angio‑œdème a été signalé chez les patients traités par un inhibiteur de l''enzyme de conversion.', 'Lorsque l''œdème n''intéresse que la face et les lèvres, l''évolution est en général régressive sans traitement, bien que les antihistaminiques aient été utilisés pour soulager les symptômes.', 'La prescription d''un inhibiteur de l''enzyme de conversion ne doit plus être envisagée par la suite chez ces patients (voir rubrique 4.3).', 'L''angio‑œdème associé à un œdème laryngé peut être fatal.', 'Lorsqu''il y a atteinte de la langue, de la glotte ou du larynx, pouvant entraîner une obstruction des voies aériennes, une solution d''adrénaline sous‑cutanée à 1/1000 (0,3 mL à 0,5 mL), doit être administrée rapidement.']);
  PERFORM pg_temp.jp_fill(m, 'inter', ARRAY['HYPERKALIEMIANTS', 'L’association de ces médicaments majore le risque d’hyperkaliémie.', 'Pour connaître les risques et les niveaux de contrainte spécifiques aux médicaments hyperkaliémiants, il convient de se reporter aux interactions propres à chaque substance.', 'Toutefois, certaines substances, comme le triméthoprime, ne font pas l’objet d’interactions spécifiques au regard de ce risque.', 'Néanmoins, ils peuvent agir comme facteurs favorisants lorsqu’ils sont associés à d’autres médicaments déjà mentionnés dans ce chapeau.', 'Associations contre-indiquées', '+ Aliskiren (chez le patient diabétique ou insuffisant rénal [TFG 2])', 'Risque d’hyperkaliémie, d’insuffisance rénale, d’augmentation de la morbi-mortalité cardio-vasculaire.', '+ Racécadotril (en cas d''antécédents d''angio-œdème sous IEC)', 'Risque de majoration des effets indésirables à type d''œdème angioneurotique (angio-œdème).', '+ Sacubitril', 'Augmentation du risque d’angio-œdème.']);
  PERFORM pg_temp.jp_fill(m, 'ei', ARRAY['Les fréquences sont définies comme suit : très fréquent (≥ 1/10), fréquent (≥ 1/100,', 'Agranulocytose, anémie hémolytique, neutropénie, thrombocytopénie', 'Réaction anaphylactoïde']);

  -- trandolapril (CIS 67937514)
  m := pg_temp.jp_matrice_by_norm('trandolapril');
  PERFORM pg_temp.jp_detail_set(m, 'Classe pharmacothérapeutique : Inhibiteur de l’enzyme de conversion (IEC) non associé, code ATC : C09AA10.');
  PERFORM pg_temp.jp_fill(m, 'ind', ARRAY['Hypertension artérielle ;', 'o réduction de la mortalité totale ;', 'o réduction de l’évolution vers l’insuffisance sévère ou réfractaire.', 'Le traitement d’un groupe de 876 patients durant 24 à 50 mois a permis d’éviter le décès de 65 patients (soit 7,4 %) (voir étude TRACE rubrique 5.1).']);
  PERFORM pg_temp.jp_fill(m, 'ci', ARRAY['Ce médicament ne doit jamais être utilisé dans les cas suivants :', 'hypersensibilité à la substance active, à un autre inhibiteur de l’enzyme de conversion ou à l’un des excipients mentionnés à la rubrique 6.1 ;', 'antécédent d’angio-œdème (œdème de Quincke) lié à la prise d’un inhibiteur de l’enzyme de conversion et/ou angio-œdème héréditaire ou idiopathique ;', '2ème et 3ème trimestres de la grossesse (voir rubriques 4.4 et 4.6) ;', 'utilisation concomitante avec un traitement par sacubitril/valsartan.', 'TRANDOLAPRIL BIOGARAN ne doit pas être débuté moins de 36 heures après la dernière dose de sacubitril / valsartan (voir également rubriques 4.4 et 4.5) ;']);
  PERFORM pg_temp.jp_fill(m, 'pre', ARRAY['Hypotension', 'De rares cas d’hypotension ont été observés chez des patients présentant une hypertension non compliquée.', 'La déplétion hydrosodée doit être corrigée avant d’administrer un inhibiteur de l’enzyme de conversion et une dose initiale plus faible doit être envisagée.', 'Si une hypotension se développe, le patient doit être placé en position allongée.', 'Un remplissage volémique par une solution saline administrée par voie intraveineuse peut être nécessaire.', 'Sténose aortique ou mitrale / Cardiomyopathie hypertrophique', 'Le trandolapril ne doit pas être utilisé chez les patients avec une sténose aortique ou une obstruction hémodynamique.', 'Insuffisance rénale', 'Chez ces malades et chez ceux atteints de néphropathie glomérulaire, le risque d’hyperkaliémie doit être pris en compte.', 'La pratique médicale normale comprend un contrôle périodique du potassium et de la créatinine (voir rubrique 4.2).', 'Une protéinurie peut apparaître, notamment chez les patients avec une insuffisance rénale ou prenant des doses relativement élevées d’IEC.', 'Double blocage du système rénine-angiotensine-aldostérone (SRAA)']);
  PERFORM pg_temp.jp_fill(m, 'inter', ARRAY['Médicaments hyperkaliémiants', 'L’association de ces médicaments majore le risque d’hyperkaliémie.', 'Pour connaître les risques et les niveaux de contrainte spécifiques aux médicaments hyperkaliémiants, il convient de se reporter aux interactions propres à chaque substance.', 'Toutefois, certaines substances, comme le triméthoprime, ne font pas l’objet d’interactions spécifiques au regard de ce risque.', 'Néanmoins, ils peuvent agir comme facteurs favorisants lorsqu’ils sont associés à d’autres médicaments déjà mentionnés dans ce chapitre.', 'Quatre-vingt sujets (80 %) de cette étude ont reçu des diurétiques (voir aussi rubrique 4.4).', 'Associations contre-indiquées', '+ Aliskiren chez le patient diabétique ou insuffisant rénal (DFG 2)', 'Risque d’hyperkaliémie, d’insuffisance rénale, d’augmentation de la morbi‑mortalité cardio-vasculaire.', 'Médicaments augmentant le risque d’angio-œdème', 'L’utilisation concomitante d’IEC avec l’association sacubitril / valsartan est contre-indiquée en raison du risque accru d’angio-œdème (voir rubriques 4.3 et 4.4).', 'L’utilisation concomitante d’IEC avec le racécadotril, les inhibiteurs de mTOR (p. ex. sirolimus, évérolimus, temsirolimus) et la vildagliptine peut entraîner un risque accru d’angio-œdème (voir rubrique 4.4).']);
  PERFORM pg_temp.jp_fill(m, 'ei', ARRAY['La convention suivante est utilisée pour les fréquences : Très fréquents : ≥ 1/10, fréquents : ≥ 1/100 et', 'Fréquent', 'Peu fréquent']);
  PERFORM pg_temp.jp_fill(m, 'surv', ARRAY['Chez ces malades et chez ceux atteints de néphropathie glomérulaire, le risque d’hyperkaliémie doit être pris en compte.', 'La pratique médicale normale comprend un contrôle périodique du potassium et de la créatinine (voir rubrique 4.2).']);

  -- zofenopril (CIS 63243923)
  m := pg_temp.jp_matrice_by_norm('zofenopril');
  PERFORM pg_temp.jp_detail_set(m, 'Classe pharmacothérapeutique : Agents agissant sur le système rénine-angiotensine, inhibiteurs de conversion de l''angiotensine, non associés, code ATC : C09AA15.');
  PERFORM pg_temp.jp_fill(m, 'ind', ARRAY['Hypertension', 'ZOFENOPRIL VIATRIS est indiqué dans le traitement de l''hypertension artérielle légère à modérée.', 'Infarctus du myocarde en phase aiguë']);
  PERFORM pg_temp.jp_fill(m, 'ci', ARRAY['Hypersensibilité à la substance active, à tout autre IEC ou à l’un des excipients mentionnés à la rubrique 6.1.', 'Antécédents d''œdème angioneurotique héréditaire/idiopathique lié à la prise antérieure d''un IEC.', 'Angiœdème héréditaire/idiopathique.', 'Insuffisance hépatique sévère.', 'Deuxième et troisième trimestre de la grossesse (voir rubriques 4.4 et 4.6).', 'Femmes en âge de procréer à moins d’être sous contraception efficace.', 'Sténose bilatérale de l''artère rénale ou sténose unilatérale de l’artère rénale dans le cadre d''un rein unique.', 'Association avec un traitement par sacubitril/valsartan (voir rubriques 4.4 et 4.5).']);
  PERFORM pg_temp.jp_fill(m, 'pre', ARRAY['Hypotension', 'Chez les patients ayant une insuffisance cardiaque, avec ou sans insuffisance rénale associée, une hypotension symptomatique a été observée.', 'Chez les patients à risque élevé d''hypotension symptomatique, le traitement devra démarrer sous surveillance médicale étroite de préférence à l''hôpital avec des doses faibles et une adaptation posologique prudente.', 'Si possible, le traitement diurétique sera interrompu temporairement quand le traitement par ZOFENOPRIL VIATRIS est instauré.', 'Si une hypotension se produit, le patient doit être placé en position couchée.', 'La compensation volumique par voie intraveineuse avec un soluté physiologique ordinaire peut être nécessaire.', 'L''apparition d''une hypotension après la dose initiale ne doit pas exclure ultérieurement une adaptation posologique prudente du médicament après une prise en charge efficace.', 'Chez certains patients insuffisants cardiaques ayant une pression artérielle normale ou basse, une diminution supplémentaire de la pression artérielle systémique peut se produire avec ZOFENOPRIL VIATRIS.', 'Cet effet est attendu et ne justifie normalement pas l''arrêt du traitement.', 'Si l''hypotension devient symptomatique, une diminution de la dose ou l''arrêt du traitement par ZOFENOPRIL VIATRIS peut s''avérer nécessaire.', 'Grossesse', 'Les IEC ne doivent pas être débutés au cours de la grossesse.']);
  PERFORM pg_temp.jp_fill(m, 'inter', ARRAY['Associations déconseillées', '+ Inhibiteurs de la NEP', 'L''association de zofénopril avec le sacubitril/valsartan est contre-indiquée, car l''inhibition concomitante de la néprilysine (NEP) et de l''ECA peut augmenter le risque d''angiœdème.', 'Le sacubitril/valsartan ne doit pas être commencé dans les 36 heures qui suivent la dernière dose du traitement par zofénopril.', 'Le traitement par zofénopril ne doit pas être commencé dans les 36 heures qui suivent la dernière dose de sacubitril/valsartan (voir rubriques 4.3 et 4.4).', 'L’association avec autres inhibiteurs de la NEP (p. ex. racécadotril) et du zofénopril peut également augmenter le risque d''angiœdème (voir rubrique 4.4).', '+ Diurétiques hyperkaliémiants ou suppléments potassiques.', 'Les IEC atténuent la perte de potassium induite par les diurétiques.', 'Si une utilisation concomitante est indiquée en raison d''une hypokaliémie documentée, ils devront être utilisés avec précaution et contrôle fréquent de la kaliémie et de l''ECG (voir rubrique 4.4).', 'Associations faisant l''objet de précautions d’emploi', '+ Diurétiques (thiazides ou diurétiques de l''anse)', 'Un traitement antérieur par de hautes doses de diurétiques peut conduire à une déplétion volumique et un risque d''hypotension à l''instauration du traitement par zofénopril (voir rubrique 4.4).']);
  PERFORM pg_temp.jp_fill(m, 'ei', ARRAY['Très fréquents (≥ 1/10) ; fréquents (≥ 1/100,', 'Fréquent']);
  PERFORM pg_temp.jp_fill(m, 'surv', ARRAY['Chez les patients à risque élevé d''hypotension symptomatique, le traitement devra démarrer sous surveillance médicale étroite de préférence à l''hôpital avec des doses faibles et une adaptation posologique prudente.']);

  -- irbesartan (CIS 61605035)
  m := pg_temp.jp_matrice_by_norm('irbesartan');
  PERFORM pg_temp.jp_detail_set(m, 'Classe pharmacothérapeutique : Antagonistes des récepteurs de l’angiotensine II, code ATC : C09C A04.');
  PERFORM pg_temp.jp_fill(m, 'ind', ARRAY['IRBESARTAN ACCORD est indiqué chez l’adulte dans le traitement de l’hypertension artérielle essentielle.', 'Il est également indiqué dans le traitement de l’atteinte rénale chez les patients adultes hypertendus diabétiques de type 2, dans le cadre de la prise en charge par un médicament antihypertenseur (voir rubrique 5.1).', 'IRBESARTAN ACCORD peut être utilisé seul ou en association avec d’autres agents antihypertenseurs (voir rubrique 4.3, 4.4, 4.5 et 5.1).']);
  PERFORM pg_temp.jp_fill(m, 'ci', ARRAY['Hypersensibilité à la substance active ou à l’un des excipients mentionnés à la rubrique 6.1.', 'Deuxième et troisième trimestres de la grossesse (voir rubriques 4.4 et 4.6).']);
  PERFORM pg_temp.jp_fill(m, 'pre', ARRAY['Ces anomalies doivent être corrigées avant l’administration d’IRBESARTAN ACCORD.', 'Bien que cela n’ait pas été documenté avec IRBESARTAN ACCORD, un phénomène similaire est à prévoir avec les antagonistes des récepteurs de l’angiotensine II.', 'Aucune expérience n’est disponible concernant l’utilisation d’IRBESARTAN ACCORD chez les patients ayant eu une transplantation rénale récente.', 'En particulier, ils sont apparus moins favorables chez les femmes et chez les patients non-blancs (voir rubrique 5.1).', 'En conséquence, le double blocage du SRAA par l’association d’IEC, ARA II ou d’aliskiren n’est pas recommandé (voir rubriques 4.5 et 5.1).', 'Les IEC et les ARA II ne doivent pas être associés chez les patients atteints d’une néphropathie diabétique.', 'Un contrôle rapproché du potassium sérique chez les patients à risque est recommandé (voir rubrique 4.5).', 'Hypoglycémie : IRBESARTAN ACCORD peut induire une hypoglycémie, en particulier chez les patients diabétiques.', 'Lithium : l’association du lithium et d’IRBESARTAN ACCORD est déconseillée (voir rubrique 4.5).', 'Hyperaldostéronisme primaire : les patients avec hyperaldostéronisme primaire ne répondent généralement pas aux médicaments antihypertenseurs agissant par l’intermédiaire de l’inhibition du système rénine-angiotensine.', 'En conséquence, l’utilisation d’IRBESARTAN ACCORD n’est pas recommandée.', 'Grossesse : Les inhibiteurs des récepteurs de l’angiotensine II (ARAII) ne doivent pas être débutés au cours de la grossesse.']);
  PERFORM pg_temp.jp_fill(m, 'inter', ARRAY['Diurétiques et autres antihypertenseurs : d’autres agents antihypertenseurs peuvent augmenter les effets hypotenseurs de l’irbésartan.', 'Cependant, irbésartan a été associé sans problème à d’autres antihypertenseurs, tels que des bêtabloquants, des antagonistes calciques à longue durée d’action et des diurétiques thiazidiques.', 'Un traitement antérieur par des diurétiques à une dose élevée peut provoquer une hypovolémie et un risque d’hypotension lorsqu’un traitement par IRBESARTAN ACCORD est mis en route (voir rubrique 4.4).', 'Lithium :des augmentations réversibles des concentrations sériques et de la toxicité du lithium ont été rapportées avec les inhibiteurs de l’enzyme de conversion.', 'A ce jour, des effets similaires ont été très rarement rapportés avec l’irbésartan.', 'Par conséquent, cette association est déconseillée (voir rubrique 4.4).', 'Si l’association se révèle nécessaire, une surveillance stricte de la lithémie est recommandée.', 'L’association devra être administrée avec prudence, en particulier chez les personnes âgées.', 'Les patients devront être correctement hydratés, et une surveillance de la fonction rénale devra être envisagée après l’initiation de l’association thérapeutique, puis périodiquement.', 'Répaglinide : l''irbésartan a le potentiel d''inhiber l''OATP1B1.', 'Dans une autre étude aucune interaction pharmacocinétique pertinente n''a été rapportée lorsque les deux médicaments étaient administrés conjointement.', 'Par conséquent, une adaptation de dose du traitement antidiabétique tel que le répaglinide peut être nécessaire (voir rubrique 4.4).']);
  PERFORM pg_temp.jp_fill(m, 'ei', ARRAY['Les interruptions de traitement dues aux événements indésirables d’ordre clinique ou biologique étaient moins fréquentes chez les patients traités par irbésartan (3,3 %) que chez les patients sous pla', 'Fréquence indéterminée : anémie, thrombocytopénie', 'Fréquence indéterminée : réactions d’hypersensibilité, telles que angio-œdème, rash, urticaire, réaction anaphylactique, choc anaphylactique']);
  PERFORM pg_temp.jp_fill(m, 'surv', ARRAY['Un contrôle rapproché du potassium sérique chez les patients à risque est recommandé (voir rubrique 4.5).']);

  -- telmisartan (CIS 66219710)
  m := pg_temp.jp_matrice_by_norm('telmisartan');
  PERFORM pg_temp.jp_detail_set(m, 'Classe pharmacothérapeutique : antagonistes des récepteurs de l’angiotensine II (ARA II), code ATC : C09CA07.');
  PERFORM pg_temp.jp_fill(m, 'ind', ARRAY['Hypertension', 'Traitement de l’hypertension artérielle essentielle chez l’adulte.', 'Prévention cardiovasculaire', 'Réduction de la morbidité cardiovasculaire chez les adultes présentant :', 'une maladie cardiovasculaire athérothrombotique connue (antécédents de coronaropathie, d’accident vasculaire cérébral, ou d’artériopathie périphérique) ou ;', 'un diabète de type 2 avec une atteinte d’organe cible documentée.']);
  PERFORM pg_temp.jp_fill(m, 'ci', ARRAY['Hypersensibilité à la substance active ou à l’un des excipients mentionnés à la rubrique 6.1.', '2ème et 3ème trimestres de la grossesse (voir rubriques 4.4 et 4.6).', 'Obstruction biliaire.', 'Insuffisance hépatique sévère.']);
  PERFORM pg_temp.jp_fill(m, 'pre', ARRAY['Grossesse', 'Les antagonistes des récepteurs de l’angiotensine II (ARA II) ne doivent pas être débutés au cours de la grossesse.', 'En cas de diagnostic de grossesse, le traitement par ARA II doit être arrêté immédiatement et, si nécessaire, un traitement alternatif sera débuté (voir rubriques 4.3 et 4.6).', 'Insuffisance hépatique', 'La clairance hépatique du telmisartan est susceptible d’être réduite chez ces patients.', 'TELMISARTAN ARROW doit être administré avec précaution chez les patients atteints d’insuffisance hépatique légère à modérée.', 'Hypertension rénovasculaire', 'Insuffisance rénale et transplantation rénale', 'En cas d’administration de TELMISARTAN ARROW à des patients atteints d’insuffisance rénale, une surveillance régulière de la kaliémie et du taux de créatinine sérique est recommandée.', 'Aucune donnée n’est disponible sur l’utilisation de TELMISARTAN ARROW chez des patients ayant subi une transplantation rénale récente.', 'Le telmisartan n’est pas éliminé du sang par hémofiltration et n’est pas dialysable.', 'Patients présentant une hypovolémie et/ou une déplétion sodée']);
  PERFORM pg_temp.jp_fill(m, 'inter', ARRAY['Digoxine', 'Lors de l’administration concomitante de telmisartan et de digoxine, une augmentation médiane de la concentration plasmatique maximale (49 %) et minimale (20 %) en digoxine a été observée.', 'Surveiller les taux de digoxine lors de l’initiation, de l’ajustement ou de l’arrêt du telmisartan afin de les maintenir dans la fourchette thérapeutique.', 'Comme pour les autres médicaments agissant sur le système rénine-angiotensine-aldostérone, le telmisartan peut entraîner une hyperkaliémie (voir rubrique 4.4).', 'L’apparition d’une hyperkaliémie dépend des facteurs de risque associés.', 'Les associations médicamenteuses mentionnées ci-dessus augmentent le risque.', 'Le risque est particulièrement élevé pour les associations avec les diurétiques d’épargne potassique et lors d’association avec les sels de régime contenant du potassium.', 'L’association avec les IEC ou les AINS, par exemple, présente un risque moins important si les précautions d’utilisation sont strictement suivies.', 'Associations déconseillées', 'Diurétiques d’épargne potassique et traitements de supplémentation potassique', 'Les antagonistes des récepteurs de l’angiotensine II comme le telmisartan atténuent la perte potassique induite par les diurétiques.', 'Si l’association ne peut être évitée en raison d’une hypokaliémie documentée, leur utilisation doit être prudente et le potassium sérique devra être surveillé fréquemment.']);
  PERFORM pg_temp.jp_fill(m, 'ei', ARRAY['Très fréquent (≥ 1/10) ; fréquent (≥ 1/100, Au sein de chaque groupe de fréquence, les effets indésirables sont présentés suivant un ordre décroissant de gravité.', 'Peu fréquent :']);
  PERFORM pg_temp.jp_fill(m, 'surv', ARRAY['En cas d’administration de TELMISARTAN ARROW à des patients atteints d’insuffisance rénale, une surveillance régulière de la kaliémie et du taux de créatinine sérique est recommandée.']);

  -- olmesartan (CIS 62597926)
  m := pg_temp.jp_matrice_by_norm('olmesartan');
  PERFORM pg_temp.jp_detail_set(m, 'Classe pharmacothérapeutique : antagonistes de l''angiotensine II, code ATC: C09CA08');
  PERFORM pg_temp.jp_fill(m, 'ind', ARRAY['Traitement de l''hypertension artérielle essentielle chez l’adulte.', 'Traitement de l’hypertension artérielle chez les enfants et adolescents âgés de 6 à moins de 18 ans.']);
  PERFORM pg_temp.jp_fill(m, 'ci', ARRAY['Hypersensibilité à la substance active ou à l''un des excipients mentionnés à la rubrique 6.1,', '2ème et 3ème trimestres de la grossesse (voir rubriques 4.4 et 4.6),', 'Obstruction biliaire (voir rubrique 5.2),']);
  PERFORM pg_temp.jp_fill(m, 'pre', ARRAY['Hypovolémie', 'Ces anomalies devront être corrigées avant toute administration d''olmésartan médoxomil.', 'Autres affections liées à la stimulation du système rénine-angiotensine-aldostérone', 'La survenue de tels effets ne peut être exclue avec les antagonistes des récepteurs de l''angiotensine II.', 'Hypertension rénovasculaire', 'Insuffisance rénale et transplantation rénale', 'Chez les patients présentant une altération de la fonction rénale traités par l''olmésartan médoxomil, un contrôle périodique de la kaliémie et de la créatininémie est recommandé.', 'L''utilisation d''olmésartan médoxomil est déconseillée chez les patients ayant une insuffisance rénale sévère (clairance de la créatinine voir rubriques 4.2 et 5.2).', 'Hyperkaliémie', 'L''utilisation de médicaments agissant sur le système rénine-angiotensine-aldostérone peut entraîner une hyperkaliémie.', 'Les principaux facteurs de risque à considérer pour l''hyperkaliémie sont :', 'le diabète, l''insuffisance rénale, l''âge (> 70 ans),']);
  PERFORM pg_temp.jp_fill(m, 'inter', ARRAY['Effets d''autres médicaments sur l''olmésartan médoxomil', '+ Autres antihypertenseurs', 'L’effet antihypertenseur de l’olmésartan médoxomil peut être majoré par l’utilisation concomitante d’autres antihypertenseurs.', '+ Inhibiteurs de l’enzyme de conversion, antagonistes des récepteurs de l’angiotensine II et aliskiren', '+ Potassium et diurétiques épargneurs de potassium', '+ Anti-inflammatoires non stéroïdiens (AINS)', 'Une surveillance de la fonction rénale en début de traitement et une hydratation correcte du patient sont recommandées.', 'Cette association peut également diminuer l''effet antihypertenseur des antagonistes des récepteurs de l''angiotensine II et donc en partie leur efficacité.', '+ Colesevelam, agent chélateur des acides biliaires', 'L’administration d’olmésartan médoxomil au moins 4 heures avant l’administration de chlorhydrate de colesevelam diminue le risque d’interaction médicamenteuse.', 'L’administration d’olmésartan médoxomil au moins 4 heures avant la dose de chlorhydrate de colesevelam doit être envisagée (voir rubrique 5.2).', '+ Autres médicaments']);
  PERFORM pg_temp.jp_fill(m, 'ei', ARRAY['Les définitions suivantes ont été utilisées dans le but de classer par ordre de fréquence les effets indésirables : très fréquent (≥1/10), fréquent (≥1/100 à', 'Thrombocytopénie']);
  PERFORM pg_temp.jp_fill(m, 'surv', ARRAY['Chez les patients présentant une altération de la fonction rénale traités par l''olmésartan médoxomil, un contrôle périodique de la kaliémie et de la créatininémie est recommandé.', 'L''utilisation d''olmésartan médoxomil est déconseillée chez les patients ayant une insuffisance rénale sévère (clairance de la créatinine voir rubriques 4.2 et 5.2).', 'Hyperkaliémie', 'L''utilisation de médicaments agissant sur le système rénine-angiotensine-aldostérone peut entraîner une hyperkaliémie.', 'Les principaux facteurs de risque à considérer pour l''hyperkaliémie sont :']);
END
$mig$;


UPDATE jeupharma.matrice_medicaments m
SET fiche_validee = false, updated_at = now()
FROM jeupharma.dcis d
WHERE d.id = m.dci_id AND m.statut = 'publie'
  AND d.valeur_norm IN (
    SELECT DISTINCT l.dci_norm FROM (VALUES
      ('sels ferreux'),
      ('acide ascorbique'),
      ('colecalciferol'),
      ('cyanocobalamine'),
      ('acide folique'),
      ('acide folinique'),
      ('epoetine alfa'),
      ('epoetine beta'),
      ('darbepoetine alfa'),
      ('immunoglobulines anti-d'),
      ('acide acetylsalicylique'),
      ('clopidogrel'),
      ('prasugrel'),
      ('ticagrelor'),
      ('dipyridamole'),
      ('heparinate de sodium'),
      ('heparinate de calcium'),
      ('dalteparine'),
      ('enoxaparine sodique'),
      ('tinzaparine'),
      ('nadroparine'),
      ('danaparoide'),
      ('fondaparinux'),
      ('rivaroxaban'),
      ('apixaban'),
      ('dabigatran etexilate'),
      ('idarucizumab'),
      ('warfarine'),
      ('acenocoumarol'),
      ('fluindione'),
      ('desirudine'),
      ('lepirudine'),
      ('alteplase'),
      ('tenecteplase'),
      ('reteplase'),
      ('streptokinase'),
      ('urokinase'),
      ('phytomenadione'),
      ('acide tranexamique'),
      ('alginate de calcium'),
      ('peroxyde d'),
      ('trinitrine'),
      ('isosorbide dinitrate'),
      ('molsidomine'),
      ('nicorandil'),
      ('ivabradine'),
      ('nifedipine'),
      ('nicardipine'),
      ('nitrendipine'),
      ('isradipine'),
      ('amlodipine'),
      ('felodipine'),
      ('manidipine'),
      ('lercanidipine'),
      ('verapamil'),
      ('diltiazem'),
      ('carvedilol'),
      ('bisoprolol'),
      ('metoprolol'),
      ('nebivolol'),
      ('atorvastatine'),
      ('enalapril'),
      ('ramipril'),
      ('captopril'),
      ('lisinopril'),
      ('perindopril'),
      ('hydroquinidine'),
      ('disopyramide'),
      ('flecainide'),
      ('propafenone'),
      ('amiodarone'),
      ('sotalol'),
      ('fosinopril'),
      ('losartan'),
      ('valsartan'),
      ('candesartan'),
      ('dapagliflozine'),
      ('digoxine'),
      ('furosemide'),
      ('spironolactone'),
      ('eplerenone'),
      ('naftidrofuryl'),
      ('trimetazidine'),
      ('piribedil'),
      ('fraction flavonoique'),
      ('diosmine'),
      ('ginkgo biloba'),
      ('troxerutine'),
      ('ruscoside'),
      ('naftazone'),
      ('adrenaline'),
      ('acebutolol'),
      ('atenolol'),
      ('celiprolol'),
      ('betaxolol'),
      ('propranolol'),
      ('pindolol'),
      ('nadolol'),
      ('labetalol'),
      ('timolol'),
      ('tertatolol'),
      ('piretanide'),
      ('bumetanide'),
      ('hydrochlorothiazide'),
      ('indapamide'),
      ('cicletanine'),
      ('amiloride'),
      ('triamterene'),
      ('urapidil'),
      ('prazosine'),
      ('doxazosine'),
      ('minoxidil'),
      ('rilmenidine'),
      ('methyldopa'),
      ('moxonidine'),
      ('clonidine'),
      ('benazepril'),
      ('quinapril'),
      ('trandolapril'),
      ('zofenopril'),
      ('irbesartan'),
      ('telmisartan'),
      ('eprosartan'),
      ('olmesartan')
    ) AS l(dci_norm)
  );
