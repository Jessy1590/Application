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
  -- piretanide (CIS 62715965, scored)
  m := pg_temp.jp_matrice_by_norm('piretanide');
  PERFORM pg_temp.jp_detail_set(m, 'Classe pharmacothérapeutique : diurétiques de l’anse, code ATC : C03CA03.');
  PERFORM pg_temp.jp_fill(m, 'ind', ARRAY['Traitement de l''hypertension artérielle.']);
  PERFORM pg_temp.jp_fill(m, 'ci', ARRAY['Hypersensibilité à la substance active ou à l’un des excipients mentionnés à la rubrique 6.1.', 'Troubles hydro-électrolytiques (hyponatrémie sévère, hypokaliémie sévère),', 'Hypovolémie,', 'Déshydratation,', 'Etat pré-comateux et comateux associés à une encéphalopathie hépatique,', 'Insuffisance rénale sévère (clairance de la créatinine inférieure à 20 ml/min) ou insuffisance rénale avec anurie/oligoanurie,', 'Obstruction des voies urinaires,', 'Hypersensibilité aux sulfamides,', 'Allaitement.', 'En l’absence de données, le pirétanide est contre-indiqué chez l’enfant de moins de 15 ans ainsi que chez la femme enceinte.']);
  PERFORM pg_temp.jp_fill(m, 'pre', ARRAY['Mises en garde spéciales', 'Une surveillance étroite est particulièrement nécessaire chez les patients présentant :', 'Une hypotension,', 'Un diabète avéré ou latent (surveillance régulière de la glycémie),', 'Une goutte (surveillance régulière de l’uricémie),', 'Une obstruction partielle des voies urinaires (ex : hypertrophie prostatique, hydronéphrose, sténose urétrale),', 'Une cirrhose du foie avec insuffisance rénale,', 'Une hypoprotéinémie par exemple en cas de syndrome néphrotique,', 'Une sclérose cérébrale et/ou coronaire avancée,', 'Une altération de la perfusion cérébro-vasculaire,', 'Une maladie coronarienne.', 'La prise accidentelle de pirétanide peut entraîner une hypovolémie avec déshydratation (voir surdosage).']);
  PERFORM pg_temp.jp_fill(m, 'inter', ARRAY['Hypokaliémiants', 'L’hypokaliémie est un facteur favorisant l’apparition de troubles du rythme cardiaque (torsades de pointes notamment) et augmentant la toxicité de certains médicaments, par exemple la digoxine.', 'De ce fait, les médicaments qui peuvent entraîner une hypokaliémie sont impliqués dans un grand nombre d’interactions.', 'Il s’agit des diurétiques hypokaliémiants, seuls ou associés, des laxatifs stimulants, des glucocorticoïdes, du tétracosactide et de l’amphotéricine B (voie IV).', 'Hyponatrémiants', 'Certains médicaments sont plus fréquemment impliqués dans la survenue d’une hyponatrémie.', 'Ce sont les diurétiques, la desmopressine, les antidépresseurs inhibant la recapture de la sérotonine, la carbamazépine et l’oxcarbazépine.', 'L’association de ces médicaments majore le risque d’hyponatrémie.', 'Médicaments ototoxiques', 'L''utilisation conjointe de médicaments ayant une ototoxicité augmente le risque d’atteinte cochléo-vestibulaire.', 'Si une telle association est nécessaire, il convient de renforcer la surveillance de la fonction auditive.', 'Les médicaments concernés sont, notamment, les glycopeptides tels que vancomycine et teicoplanine, les aminosides, les organoplatines et les diurétiques de l’anse.']);
  PERFORM pg_temp.jp_fill(m, 'ei', ARRAY['Les effets indésirables du pirétanide sont listés ci-dessous.', 'Leur fréquence est indéterminée.', 'Affections hématologiques et du système lymphatique', 'thrombopénie, leucopénie, hémoconcentration', 'Troubles du métabolisme et de la nutrition', 'Affections du système nerveux']);
  PERFORM pg_temp.jp_fill(m, 'surv', ARRAY['Une surveillance étroite est particulièrement nécessaire chez les patients présentant :', 'Un diabète avéré ou latent (surveillance régulière de la glycémie),', 'Une goutte (surveillance régulière de l’uricémie),', 'La prise accidentelle de pirétanide peut entraîner une hypovolémie avec déshydratation (voir surdosage).']);
  -- bumetanide (CIS 68232635, scored)
  m := pg_temp.jp_matrice_by_norm('bumetanide');
  PERFORM pg_temp.jp_detail_set(m, 'Classe pharmacothérapeutique : DIURETIQUE DE L''ANSE, code ATC : C03CA02 (C : Système cardiovasculaire).');
  PERFORM pg_temp.jp_fill(m, 'ind', ARRAY['Oedèmes d’origine rénale et hépatique, chez l’adulte.', 'insuffisance cardiaque, chez l’adulte.', 'Pour l’utilisation chez la femme enceinte : (voir rubrique 4.6)']);
  PERFORM pg_temp.jp_fill(m, 'ci', ARRAY['Ce médicament ne doit pas être utilisé dans les cas suivants :', 'Hypersensibilité à la substance active ou à l’un des excipients mentionnés à la rubrique 6.1.', 'Déplétions électrolytiques sévères.', 'Anurie persistante.', 'Encéphalopathie hépatique, y compris coma.']);
  PERFORM pg_temp.jp_fill(m, 'pre', ARRAY['Mises en garde spéciales', 'Les patients doivent être informés des signes et symptômes du SSJ et du syndrome de Lyell et être étroitement surveillés à cet égard.', 'En cas d’apparition de signes et de symptômes évoquant l’une de ces réactions, la prise de bumétanide doit être interrompue et un traitement de remplacement doit être envisagé.', 'Si le patient a présenté une réaction grave au bumétanide telle que le SSJ ou un Lyell, le traitement ne doit plus jamais être administré à ce patient.', 'En cas d’administration du bumétanide chez des patients souffrant d''une atteinte hépatique sévère, la prudence est recommandée.', 'Chez des patients présentant une hypotension, le bumétanide doit être utilisé avec prudence.', 'Précautions d''emploi', 'Un déséquilibre hydroélectrolytique peut survenir (voir rubrique 4.8) et un traitement compensatoire doit être initié le cas échéant.', 'Un dosage régulier de la kaliémie doit être pratiqué.', 'Comme avec les autres diurétiques, le bumétanide peut entrainer une augmentation du taux d’acide urique dans le sang.', 'Chez les patients atteints d’un diabète sucré avéré ou latent, un dosage régulier de la glycémie et de la glycosurie doit être pratiqué.', 'Des cas d’hypomagnésémie ont été rapportés chez les patients traités par un inhibiteur de la pompe à protons.']);
  PERFORM pg_temp.jp_fill(m, 'inter', ARRAY['Associations faisant l''objet de précautions d’emploi', '+ Lithium', 'Le bumétanide diminue la clairance du lithium entraînant une augmentation des taux de lithium dans le sang, par conséquent un traitement concomitant nécessite une surveillance stricte des taux de lithium dans le sang.', 'Une diminution des doses de lithium peut être nécessaire.', '+Glucosides digitaliques', 'L’hypokaliémie augmente la sensibilité aux glucosides digitaliques, ce qui peut provoquer une toxicité digitalique (nausées, vomissements et arythmies).', 'La kaliémie doit être contrôlée régulièrement et les signes d’une toxicité digitalique doivent être recherchés.', 'Une supplémentation en potassium et une réduction de la dose de glucoside digitalique doivent être envisagées le cas échéant.', '+ Inhibiteurs neuromusculaires non-dépolarisants', 'L’hypokaliémie augmente la sensibilité aux inhibiteurs neuromusculaires non-dépolarisants.', '+ Anti-arythmiques', 'Un contrôle régulier des taux d’électrolytes doit être pratiqué chez ces patients et les symptômes d’une arythmie doivent être recherchés.']);
  PERFORM pg_temp.jp_fill(m, 'ei', ARRAY['Des réactions cutanées graves (SCAR), dont le syndrome de Stevens-Johnson (SSJ) et le syndrome de Lyell, ont été signalées en lien avec le bumétanide (voir rubrique 4.4).', 'Très fréquent (≥1/10)', 'Fréquent (≥1/100 et', 'Peu fréquent (≥1/1 000 et', 'Rare (≥1/10 000 et']);
  PERFORM pg_temp.jp_fill(m, 'surv', ARRAY['Les patients doivent être informés des signes et symptômes du SSJ et du syndrome de Lyell et être étroitement surveillés à cet égard.', 'Un dosage régulier de la kaliémie doit être pratiqué.', 'Chez les patients atteints d’un diabète sucré avéré ou latent, un dosage régulier de la glycémie et de la glycosurie doit être pratiqué.']);
  -- hydrochlorothiazide (CIS 64740636, scored)
  m := pg_temp.jp_matrice_by_norm('hydrochlorothiazide');
  PERFORM pg_temp.jp_detail_set(m, 'Classe pharmacothérapeutique : diurétiques du segment cortical de dilution, code ATC : C03AA03');
  PERFORM pg_temp.jp_fill(m, 'ind', ARRAY['HYDROCHLOROTHIAZIDE ARROW 12,5 mg, comprimé sécable est indiqué chez les adultes dans le traitement des pathologies suivantes :', 'Œdèmes d''origine cardiaque ou rénale.', 'Œdèmes d''origine hépatique, le plus souvent en association avec un diurétique épargneur de potassium.', 'Hypertension artérielle.']);
  PERFORM pg_temp.jp_fill(m, 'ci', ARRAY['hypersensibilité à la substance active ou à l’un des excipients mentionnés à la rubrique 6.1 ;', 'anurie ;', 'insuffisance rénale sévère (clairance de la créatinine inférieure à 30 ml/min).']);
  PERFORM pg_temp.jp_fill(m, 'pre', ARRAY['Cancer de la peau non mélanome', 'Les actions photosensibilisantes de l’HCTZ pourraient constituer un mécanisme possible du CPNM.', 'Les patients prenant de l’HCTZ doivent être informés du risque de CPNM et être invités à vérifier régulièrement leur peau pour détecter toute nouvelle lésion et à signaler rapidement toute lésion cutanée suspecte.', 'Les lésions cutanées suspectes doivent être examinées rapidement, y compris éventuellement par un examen histologique des biopsies.', 'L''utilisation d’HCTZ peut également devoir être reconsidérée chez les patients ayant déjà présenté un CPNM (voir aussi rubrique 4.8).', 'Toxicité respiratoire aiguë', 'De très rares cas graves de toxicité respiratoire aiguë, notamment de syndrome de détresse respiratoire aiguë (SDRA), ont été rapportés après la prise d’hydrochlorothiazide.', 'L’œdème pulmonaire se développe généralement quelques minutes à quelques heures après la prise d’hydrochlorothiazide.', 'Au début, les symptômes comportent dyspnée, fièvre, détérioration pulmonaire et hypotension.', 'Si un diagnostic de SDRA est suspecté, HYDROCHLOROTHIAZIDE ARROW doit être retiré et un traitement approprié doit être administré.', 'L’hydrochlorothiazide ne doit pas être administré à des patients ayant déjà présenté un SDRA à la suite d’une prise d’hydrochlorothiazide.', 'Mises en garde spéciales']);
  PERFORM pg_temp.jp_fill(m, 'inter', ARRAY['L’administration concomitante d’HYDROCHLOROTHIAZIDE ARROW avec les médicaments suivants peut entraîner des interactions.', 'Médicaments hypokaliémiants', 'L’hypokaliémie est un facteur favorisant l’apparition de troubles du rythme cardiaque (torsades de pointes, notamment) et augmentant la toxicité de certains médicaments, par exemple la digoxine.', 'De ce fait, les médicaments qui peuvent entraîner une hypokaliémie sont impliqués dans un grand nombre d’interactions.', 'Il s’agit des diurétiques hypokaliémiants, seuls ou associés, des laxatifs stimulants, des glucocorticoïdes, du tétracosactide et de l’amphotéricine B (voie IV).', 'Médicaments hyponatrémiants', 'Certains médicaments sont plus fréquemment impliqués dans la survenue d’une hyponatrémie.', 'Ce sont les diurétiques, la desmopressine, les antidépresseurs inhibant la recapture de la sérotonine, la carbamazépine et l’oxcarbazépine.', 'L’association de ces médicaments majore le risque d’hyponatrémie.', 'Associations déconseillées', '+ Lithium', 'Augmentation de la lithémie avec signes de surdosage en lithium, comme lors d’un régime désodé (diminution de l’excrétion rénale du lithium).']);
  PERFORM pg_temp.jp_fill(m, 'ei', ARRAY['Les évènements indésirables (Tableau 1) sont classés par fréquence, en commençant par les plus fréquents selon la convention suivante : très fréquent (> 1/10) ; fréquent (> 1/100, 1/1000, 1/10 000,', 'Tumeurs bénignes, malignes et non précisées (y compris kystes et polypes)', 'Thrombocytopénie (parfois avec purpura)', 'Insuffisance médullaire, anémie hémolytique, leucopénie, agranulocytose', 'Aplasie médullaire']);
  -- indapamide (CIS 60342439, scored)
  m := pg_temp.jp_matrice_by_norm('indapamide');
  PERFORM pg_temp.jp_detail_set(m, 'DIURETIQUE DU SEGMENT CORTICAL DE DILUTION, code ATC : C03 BA 11 (C : système cardiovasculaire)');
  PERFORM pg_temp.jp_fill(m, 'ind', ARRAY['INDAPAMIDE ARROW 1,5 mg est indiqué dans l’hypertension artérielle essentielle chez l’adulte.']);
  PERFORM pg_temp.jp_fill(m, 'ci', ARRAY['Hypersensibilité à la substance active, aux autres sulfamides ou à l’un des excipients mentionnés à la rubrique 6.1.', 'Insuffisance rénale sévère.', 'Encéphalopathie hépatique ou insuffisance hépatique sévère.', 'Hypokaliémie.']);
  PERFORM pg_temp.jp_fill(m, 'pre', ARRAY['Mises en garde spéciales', 'En cas d’atteinte hépatique, les diurétiques apparentés aux thiazidiques peuvent induire, particulièrement en cas de déséquilibre électrolytique, une encéphalopathie hépatique pouvant évoluer vers un coma hépatique.', 'Dans ce cas, l’administration du diurétique doit être immédiatement interrompue.', 'Photosensibilité', 'Des cas de réactions de photosensibilité ont été rapportés avec les diurétiques thiazidiques et apparentés (voir rubrique 4.8).', 'Si une réaction de photosensibilité apparaît durant le traitement, il est recommandé d’arrêter le traitement.', 'Si une nouvelle administration du diurétique s’avère nécessaire, il est recommandé de proteger les parties du corps exposées au soleil ou à la lumière UV.', 'Excipients', 'Ce médicament contient du lactose.', 'Les patients présentant une intolérance au galactose, un déficit total en lactase ou un syndrome de malabsorption du glucose et du galactose (maladies héréditaires rares) ne doivent pas prendre ce médicament.', 'Précautions d’emploi', 'Equilibre hydroélectrolytique :']);
  PERFORM pg_temp.jp_fill(m, 'inter', ARRAY['Associations déconseillées', 'Augmentation de la lithiémie avec signes de surdosage, comme lors d''un régime désodé (diminution de l''excrétion urinaire du lithium).', 'Cependant, si l''usage des diurétiques est nécessaire, une surveillance stricte de la lithiémie et une adaptation de la posologie sont requises.', 'Associations faisant l''objet de précautions d’emploi', 'Médicaments pouvant induire des torsades de pointes tels que, sans s’y limiter :', 'Antiarythmiques de la classe Ia (ex : quinidine, hydroquinidine, disopyramide)', 'Antiarythmiques de la classe III (ex : amiodarone, sotalol, dofetilide, ibutilide, brétylium)', 'Quelques antipsychotiques :', 'Phénothiazines (ex : chlorpromazine, cyamemazine, lévomepromazine, thioridazine, trifluoperazine),', 'Benzamides (ex : amisulpiride, sulpiride, sultopride,tiapride),', 'Butyrophénones (ex : dropéridol, halopéridol)', 'Autres antipsychotiques (ex : pimozide),']);
  PERFORM pg_temp.jp_fill(m, 'ei', ARRAY['Très fréquent (≥ 1/10) ; fréquent (≥ 1/100,', 'Agranulocytose']);
  -- cicletanine (CIS 64828545, scored)
  m := pg_temp.jp_matrice_by_norm('cicletanine');
  PERFORM pg_temp.jp_detail_set(m, 'Classe pharmacothérapeutique : diurétique du segment cortical de dilution, code ATC : C03BX03.');
  PERFORM pg_temp.jp_fill(m, 'ind', ARRAY['Hypertension artérielle chez les adultes.']);
  PERFORM pg_temp.jp_fill(m, 'ci', ARRAY['Hypersensibilité à la substance active ou à l’un des excipients mentionnés à la rubrique 6.1.', 'Insuffisance rénale et hépatique sévères.', 'Encéphalopathie hépatique']);
  PERFORM pg_temp.jp_fill(m, 'pre', ARRAY['Mise en garde spéciales', 'En cas d''insuffisance hépatique, les diurétiques peuvent provoquer une encéphalopathie hépatique.', 'Dans ce cas, l''administration de CICLETANINE BIOGARAN doit être immédiatement interrompue.', 'Des réactions de photosensibilité ont été rapportées lors de l''utilisation de CICLETANINE BIOGARAN (voir rubrique 4.8).', 'En cas de survenue de réaction de photosensibilité sous traitement, il est recommandé d''interrompre le traitement.', 'Si une réadministration du traitement est indispensable il est recommandé de protéger les zones exposées au soleil ou aux UV artificiels.', 'Épanchement choroïdien, myopie aiguë et glaucome aigu secondaire à angle fermé', 'Les sulfonamides ou leurs dérivés peuvent provoquer une réaction idiosyncratique qui peut conduire à un épanchement choroïdien avec anomalie du champ visuel, à une myopie transitoire et à un glaucome aigu à angle fermé.', 'Ce médicament contient du lactose.', 'Les patients présentant une intolérance au galactose, un déficit total en lactase ou un syndrome de malabsorption du glucose et du galactose (maladies héréditaires rares) ne doivent pas prendre ce médicament.', 'Précautions d''emploi', 'Equilibre hydroélectrolytique :']);
  PERFORM pg_temp.jp_fill(m, 'inter', ARRAY['Associations déconseillées', 'Augmentation de la lithémie avec signes de surdosage, en lithium, comme lors d''un régime désodé (diminution de l''excrétion urinaire du lithium).', 'Si l’association ne peut être évitée, surveillance stricte de la lithémie et adaptation de la posologie du lithium.', 'Médicaments non antiarythmiques donnant des torsades de pointes (astémizole, bépridil, érythromycine IV, halofantrine, pentamidine, sultopride, terfénadine, vincamine)', 'Torsades de pointes (l''hypokaliémie est un facteur favorisant, de même que la bradycardie et un espace QT long préexistant).', 'Utiliser des substances ne présentant pas l''inconvénient d''entraîner des torsades de pointes en cas d''hypokaliémie.', 'Associations faisant l''objet de précautions d’emploi', 'Acide acétylsalicylique', 'Par ailleurs, réduction de l''effet antihypertenseur.', 'Hydrater le malade et surveiller la fonction rénale en début de traitement.', 'Anti-inflammatoires non stéroïdiens', 'Insuffisance rénale aiguë chez le malade à risque (sujet âgé et/ou déshydraté) par diminution de la filtration glomérulaire (inhibition des prostaglandines vasodilatatrices due aux anti-inflammatoires non stéroïdiens).']);
  PERFORM pg_temp.jp_fill(m, 'ei', ARRAY['Les effets indésirables les plus fréquents (> 3%) rapportés lors des études contrôlées par placebo ou par un comparateur sont : perte de poids, asthénie, céphalées, polyurie et hypokaliémie.', 'Les effets indésirables sont présentés selon les catégories de fréquence suivantes : fréquent (≥ 1/100 à Tableau 1 : effets indésirables', 'Peu fréquent']);
  -- amiloride (CIS 63371015, scored)
  m := pg_temp.jp_matrice_by_norm('amiloride');
  PERFORM pg_temp.jp_detail_set(m, 'Classe pharmacothérapeutique : AUTRES DIURETIQUES EPARGNEURS POTASSIQUES, code ATC : C03DB01.');
  PERFORM pg_temp.jp_fill(m, 'ind', ARRAY['Œdèmes d''origine cardiaque', 'Ascite et œdèmes des cirrhotiques', 'MODAMIDE est essentiellement indiqué en association avec les thiazidiques ou d''autres diurétiques hypokaliémiants.', 'Hypertension artérielle', 'MODAMIDE est utilisé comme thérapeutique adjuvante permettant de prévenir la déplétion potassique chez les malades qui reçoivent des thiazidiques ou d''autres diurétiques antihypertenseurs en traitement prolongé.']);
  PERFORM pg_temp.jp_fill(m, 'ci', ARRAY['Ce médicament ne doit jamais être utilisé en cas de :', 'Hyperkaliémie :', 'Le chlorhydrate d''amiloride ne doit pas être utilisé lorsque la kaliémie est élevée (supérieure à 5,5 mmol/litre).', 'En association aux autres diurétiques hyperkaliémiants et sels de potassium (sauf s''il existe une hypokaliémie) (voir rubrique 4.5) :', 'Insuffisance rénale :', 'En cas d''insuffisance rénale, la rétention de potassium est majorée par l''adjonction d''un antikaliurétique et peut évoluer rapidement vers l''hyperkaliémie.', 'Hypersensibilité à la substance active ou à l’un des excipients mentionnés à la rubrique 6.1.']);
  PERFORM pg_temp.jp_fill(m, 'pre', ARRAY['Ce médicament contient du lactose.', 'Il est contre-indiqué chez les patients présentant une intolérance au galactose, un déficit en lactase de Lapp ou un syndrome de malabsorption du glucose ou du galactose (maladies héréditaires rares).', 'Ce médicament peut provoquer des réactions allergiques.', 'Hyperkaliémie', 'Toute prescription d''un médicament agissant sur le système rénine-angiotensine-aldostérone est susceptible de provoquer une hyperkaliémie.', 'Avant d''envisager une association de plusieurs médicaments bloquant le système rénine-angiotensine-aldostérone, il faut évaluer soigneusement le rapport bénéfice/risque et l''existence d''alternatives éventuelles.', 'Les principaux facteurs de risque d''hyperkaliémie à prendre en considération sont :', 'diabète, altération de la fonction rénale, âge (> 70 ans) ;', 'association avec un ou plusieurs autres médicaments bloquant le système rénine-angiotensine-aldostérone et/ou d''autres médicaments hyperkaliémiants et/ou de suppléments potassiques.', 'Le suivi des patients, et notamment des patients à risque, devra comporter un ionogramme sanguin, avec en particulier un contrôle de la kaliémie, de la natrémie, et de la fonction rénale :', 'avant l''instauration du traitement puis une semaine à 15 jours après,', 'de même (avant et après) chaque augmentation de dose ou modification de traitement,']);
  PERFORM pg_temp.jp_fill(m, 'inter', ARRAY['L''association de ces médicaments majore le risque d''hyperkaliémie.', 'Pour connaître les risques et les niveaux de contrainte spécifiques aux médicaments hyperkaliémiants, il convient de se reporter aux interactions propres à chaque substance.', 'Toutefois, certaines substances, comme le triméthoprime, ne font pas l''objet d''interactions spécifiques au regard de ce risque.', 'Néanmoins, ils peuvent agir comme facteurs favorisants lorsqu''ils sont associés à d''autres médicaments déjà mentionnés dans ce chapeau.', 'Associations contre-indiquées', '+ Autres diurétiques épargneurs de potassium (seuls ou associés) (amiloride, canréonate de potassium, triamtérène)', 'Hyperkaliémie potentiellement létale notamment chez l''insuffisant rénal (addition des effets hyperkaliémiants).', '+ Sels de potassium', 'Hyperkaliémie potentiellement létale en particulier chez l''insuffisant rénal (addition des effets hyperkaliémiants).', 'Associations déconseillées', '+ Ciclosporine, tacrolimus', 'Hyperkaliémie potentiellement létale, notamment chez l''insuffisant rénal (addition des effets hyperkaliémants).']);
  PERFORM pg_temp.jp_fill(m, 'ei', ARRAY['Troubles gastro-intestinaux :', 'Anorexie, nausées, vomissement, douleurs ou ballonnements abdominaux, constipation et diarrhée ont été rapportés.', 'Manifestations en rapport avec la diurèse :', 'Sécheresse de la bouche et soif, paresthésie, vertiges, faiblesse générale, fatigabilité, crampes musculaires et hypotension orthostatique ont été observés.', 'Risque d''hyperkaliémie, d''encéphalopathie, d''hyponatrémie.', 'Autres effets secondaires :']);
  PERFORM pg_temp.jp_fill(m, 'surv', ARRAY['Hyperkaliémie', 'Toute prescription d''un médicament agissant sur le système rénine-angiotensine-aldostérone est susceptible de provoquer une hyperkaliémie.', 'Les principaux facteurs de risque d''hyperkaliémie à prendre en considération sont :', 'diabète, altération de la fonction rénale, âge (> 70 ans) ;', 'association avec un ou plusieurs autres médicaments bloquant le système rénine-angiotensine-aldostérone et/ou d''autres médicaments hyperkaliémiants et/ou de suppléments potassiques.']);
  -- urapidil (CIS 68140336, scored)
  m := pg_temp.jp_matrice_by_norm('urapidil');
  PERFORM pg_temp.jp_detail_set(m, 'Classe pharmacothérapeutique : Antihypertenseur, adrenolytique à action périphérique/Alpha Bloquant, code ATC : C02CA06.');
  PERFORM pg_temp.jp_fill(m, 'ind', ARRAY['Hypertension artérielle.']);
  PERFORM pg_temp.jp_fill(m, 'ci', ARRAY['Hypersensibilité à la substance active ou à l’un des excipients mentionnés à la rubrique 6.1.']);
  PERFORM pg_temp.jp_fill(m, 'pre', ARRAY['Chez le sujet âgé (cf. rubrique 4.2).', 'Chez les patients atteints d’insuffisance rénale modérée à sévère (voir rubrique 4.2).', 'En cas d’atteinte sévère de la fonction hépatique, il est recommandé de diminuer les doses en particulier pour un traitement de longue durée.', 'Les patients présentant une intolérance au fructose, un syndrome de malabsorption du glucose et du galactose ou un déficit en sucrase/isomaltase (maladies héréditaires rares) ne doivent pas prendre ce médicament.', 'Population pédiatrique', 'En l’absence de données disponibles, ne pas utiliser chez l’enfant.']);
  PERFORM pg_temp.jp_fill(m, 'inter', ARRAY['Associations déconseillées', '+ Alpha-bloquants à visée urologique', 'Majoration de l’effet hypotenseur.', 'Risque d’hypotension orthostatique sévère.', 'Associations faisant l''objet de précautions d’emploi', '+ Baclofène : Majoration du risque d’hypotension, notamment orthostatique.', 'Surveillance de la pression artérielle et adaptation posologique de l’antihypertenseur si nécessaire.', '+ Inhibiteurs de la phosphodiesterase de type 5 (sildénafil, tadalafil, vardénafil) : Risque d’hypotension orthostatique, notamment chez le sujet âgé.', 'Débuter le traitement aux posologies minimales recommandées et adapter progressivement les doses si besoin.', 'Associations à prendre en compte', '+ Amifostine : Majoration de l’hypotension notamment orthostatique.', '+ Antidépresseurs imipraminiques : Majoration du risque d’hypotension, notamment orthostatique.']);
  PERFORM pg_temp.jp_fill(m, 'ei', ARRAY['Troubles cardiovasculaires : peu fréquents : palpitations, tachycardie.', 'Troubles digestifs : fréquents : nausées.', 'Troubles cutanés : très rares : hypersensibilité telle que prurit, érythème et éruption cutanée, Fréquence indéterminée : angio-œdème, urticaire.', 'Troubles du système nerveux central : fréquents : vertiges, céphalées.']);
  PERFORM pg_temp.jp_fill(m, 'surv', ARRAY['En cas d’atteinte sévère de la fonction hépatique, il est recommandé de diminuer les doses en particulier pour un traitement de longue durée.']);
  -- prazosine (CIS 69537839, scored)
  m := pg_temp.jp_matrice_by_norm('prazosine');
  PERFORM pg_temp.jp_detail_set(m, 'Classe pharmacothérapeutique : alpha-1 bloquant vasodilatateur, code ATC : C02CA01.');
  PERFORM pg_temp.jp_fill(m, 'ind', ARRAY['Hypertension artérielle.']);
  PERFORM pg_temp.jp_fill(m, 'ci', ARRAY['Hypersensibilité à la substance active, aux quinazolines ou à l’un des excipients mentionnés à la rubrique 6.1.']);
  PERFORM pg_temp.jp_fill(m, 'pre', ARRAY['Mises en garde spéciales', 'Pour exercer son plein effet antihypertenseur, le comprimé de prazosine à libération prolongée nécessite un temps de transit gastro-intestinal normal.', 'En cas de temps de transit raccourci, le profil pharmacocinétique et pharmacodynamique peut être altéré, diminuant l''efficacité antihypertensive.', 'Une hypotension orthostatique, de degrés de sévérité variables, peut occasionnellement se produire.', 'Une attention particulière sera exercée chez les patients présentant des vertiges ou des malaises.', 'L''effet antihypertenseur de la prazosine peut être majoré par l''association à un diurétique, à un vasodilatateur ou à un autre antihypertenseur (voir rubrique 4.5).', 'Afin de minimiser le risque de développer une hypotension orthostatique, le patient devra être stabilisé par le traitement alpha-bloquant avant de débuter l''administration d''inhibiteurs de la 5-phosphodiestérase.', 'Des cas isolés ont également été rapportés avec d''autres α-1 bloquants et la possibilité d''un effet de classe ne peut pas être exclue.', 'Pathologie digestive', 'Une réduction marquée du temps de rétention digestive d''ALPRESS peut influencer le profil pharmacocinétique et donc l''efficacité clinique du médicament.', 'Comme avec toute forme de comprimé osmotique, la prudence est recommandée chez les patients présentant une sténose gastro-intestinale sévère (pathologique ou iatrogène).', 'De rares cas de syndrome obstructif ont été rapportés chez des patients présentant une sténose connue à la suite de l''ingestion d''un autre principe actif sous cette même forme.']);
  PERFORM pg_temp.jp_fill(m, 'inter', ARRAY['Associations déconseillées', '+ Antihypertenseurs alpha-bloquants', 'Majoration de l''effet hypotenseur.', 'Risque d''hypotension orthostatique sévère.', '+ Alpha-bloquants à visée urologique', 'Associations à prendre en compte', '+ Antihypertenseurs sauf alpha-bloquants', 'Risque d''hypotension orthostatique majoré.', '+ Anesthésiques généraux', 'En cas d''utilisation d''anesthésiques généraux, tenir compte d''une majoration des effets sur la pression artérielle.', '+ Dapoxétine', 'Risque de majoration des effets indésirables, notamment à type de vertiges ou de syncopes']);
  PERFORM pg_temp.jp_fill(m, 'ei', ARRAY['Les effets indésirables suivants peuvent survenir et doivent faire l''objet d''une surveillance attentive :', 'Troubles généraux et anomalies au site d''administration : asthénie, malaise, sueurs', 'Affections de la peau et du tissu sous-cutané : réactions allergiques, éruption cutanée de type telle que prurit, urticaire', 'Affections gastro-intestinales : nausées, vomissements, constipation, diarrhée, épigastralgies, bouche sèche', 'Affections de la sphère ORL et ophtalmiques : congestion nasale ou oculaire, épistaxis', 'Affections de rein et des voies urinaires : priapisme, pollakiurie, incontinence urinaire']);
  -- doxazosine (CIS 65525280, scored)
  m := pg_temp.jp_matrice_by_norm('doxazosine');
  PERFORM pg_temp.jp_detail_set(m, 'Classe pharmacothérapeutique : Anti-adrénergiques à action périphérique et médicaments utilisés dans l''hypertrophie bénigne de la prostate ; alpha-bloquants, Code ATC : C02CA04.');
  PERFORM pg_temp.jp_fill(m, 'ind', ARRAY['Hypertension essentielle.', 'Traitement symptomatique de l''hyperplasie bénigne de la prostate.']);
  PERFORM pg_temp.jp_fill(m, 'ci', ARRAY['Doxazosine est contre-indiqué chez :', 'Les patients souffrant d’hypersensibilité à la substance active, à d’autres quinazolines (par exemple prazosine et terazosine, ou à l''un des excipients mentionnés à la rubrique 6.1.', 'Les patients avec des antécédents d''hypotension orthostatique.', 'Les patients souffrant d’hyperplasie bénigne de la prostate associée à une rétention au niveau du haut appareil urinaire, une infection urinaire chronique ou une lithiase vésicale.', 'Les patients avec des antécédents d''occlusion gastro-intestinale ou œsophagienne, ou de réduction de tout degré du diamètre de la lumière du tube digestif.', 'Durant l’allaitement (voir rubrique 4.6)1.', 'Les patients souffrant d’hypotension2.', '1Dans l''indication d''hypertension uniquement.', '2Dans l''indication d''hyperplasie bénigne de la prostate uniquement.', 'La doxazosine est contre-indiquée en monothérapie chez les patients présentant une incontinence par engorgement ou une anurie avec ou sans insuffisance rénale évolutive.']);
  PERFORM pg_temp.jp_fill(m, 'pre', ARRAY['Informations à communiquer aux patients :', 'Les patients doivent être informés que les comprimés de doxazosine doivent être avalés entiers et ne doivent pas être croqués, divisés ou écrasés.', 'La substance active de DOXAZOSINE ARROW LP 8 mg, comprimé à libération prolongée est entourée d''un enrobage inerte et non absorbable conçu pour contrôler la libération du médicament sur une période prolongée.', 'Après le transit dans l''appareil digestif, l''enveloppe vide du comprimé est excrétée.', 'Les patients doivent être informés qu''ils ne doivent pas s''inquiéter s''ils observent occasionnellement dans leurs selles un reliquat ressemblant à un comprimé.', 'Un temps de transit anormalement court dans l''appareil digestif (par exemple après une résection chirurgicale) peut entraîner une absorption incomplète.', 'Etant donné la longue demi-vie de la doxazosine, la pertinence clinique de ce phénomène n''est pas connue.', 'Instauration du traitement :', 'Il est donc prudent de surveiller la pression artérielle en début de traitement pour minimiser le risque potentiel d''effets orthostatiques.', 'Les patients doivent être avertis qu''ils doivent éviter les situations susceptibles d''entraîner une blessure en cas de survenue d''étourdissements ou de faiblesse au début du traitement par la doxazosine.', 'Priapisme', 'Des cas d’érections prolongées et de priapisme ont été rapportés avec des médicaments alpha-1 bloquants, dont la doxazosine, après leur mise sur le marché.']);
  PERFORM pg_temp.jp_fill(m, 'inter', ARRAY['L''administration concomitante de doxazosine avec les inhibiteurs de la PDE-5 (par exemple sildénafil, tadalafil, verdénafil) peut entraîner une hypotension symptomatique chez certains patients (voir rubrique 4.4).', 'La majeure partie (98 %) de la doxazosine plasmatique se lie aux protéines.', 'Les données des études in vitro sur du plasma humain indiquent que la doxazosine n''a pas d''effet sur la liaison aux protéines de la digoxine, de la warfarine, de la phénytoïne ou de l''indométacine.', 'Cependant, il n''existe pas de données obtenues à partir d''études d''interactions formelles.', 'La doxazosine potentialise l''action hypotensive des autres alpha-bloquants et des autres agents antihypertenseurs.', 'Il a été observé une augmentation de 10 % de l''ASC moyenne de la doxazosine, sans modifications statistiquement significatives de la Cmax et de la demi-vie moyennes de la doxazosine.']);
  PERFORM pg_temp.jp_fill(m, 'ei', ARRAY['Très fréquent : ≥1/10', 'Fréquent : ≥ 1/100 à', 'Peu fréquent : ≥ 1/1 000 à', 'Rare : ≥ 1/10 000 à']);
  PERFORM pg_temp.jp_fill(m, 'surv', ARRAY['La substance active de DOXAZOSINE ARROW LP 8 mg, comprimé à libération prolongée est entourée d''un enrobage inerte et non absorbable conçu pour contrôler la libération du médicament sur une période prolongée.', 'Il est donc prudent de surveiller la pression artérielle en début de traitement pour minimiser le risque potentiel d''effets orthostatiques.']);
  -- minoxidil (CIS 67395654, scored)
  m := pg_temp.jp_matrice_by_norm('minoxidil');
  PERFORM pg_temp.jp_detail_set(m, 'Classe pharmacothérapeutique : Antihypertenseur, médicament agissant sur le muscle lisse artériolaire, code ATC : C02DC01.');
  PERFORM pg_temp.jp_fill(m, 'ind', ARRAY['Les indications thérapeutiques sont limitées à :', 'Hypertension artérielle sévère après échec d’une thérapeutique antihypertensive associant au moins deux antihypertenseurs dont un diurétique.']);
  PERFORM pg_temp.jp_fill(m, 'ci', ARRAY['Hypertension artérielle pulmonaire secondaire à un rétrécissement mitral.', 'Infarctus du myocarde récent.', 'Phéochromocytome : stimulation de la sécrétion de catécholamines de la tumeur du fait de son action antihypertensive.', 'Hypersensibilité à la substance active ou à l’un des excipients mentionnés à la rubrique 6.1.']);
  PERFORM pg_temp.jp_fill(m, 'pre', ARRAY['Mises en garde', 'LONOTEN ne doit pas être prescrit en première intention.', 'LONOTEN ne se substitue pas aux traitements antérieurs : il est prescrit en association (voir rubriques 4.2 et 4.5).', 'Le traitement par LONOTEN doit être institué sous surveillance médicale spécialisée rigoureuse.', 'Un traitement diurétique, isolé ou associé à un régime sans sel strict est donc nécessaire chez les patients recevant minoxidil.', 'L’échec de ces mesures peut nécessiter l’arrêt temporaire de LONOTEN.', 'Les poids du patient et l’équilibre hydro-électrolytique doivent être surveillés pour détecter d’éventuels signes de rétention hydrique.', 'Insuffisance rénale : le médicament doit être administré en veillant particulièrement à maintenir l’équilibre hydro-électrolytique chez les patients présentant une insuffisance rénale mais non dialysés.', 'Une diminution des doses peut être nécessaire chez les insuffisants rénaux ou dialysés (voir rubrique 4.2).', 'Infarctus du myocarde : Les patients ayant des antécédents d’infarctus du myocarde ne doivent être traités par LONOTEN qu’une fois la stabilisation de l’état post-infarctus établie.', 'Tachycardie : LONOTEN est un vasodilatateur et peut induire une tachycardie réflexe et potentiellement une angine de poitrine chez les patients à risque.', 'L’association d’un bêtabloquant ou d’un autre inhibiteur du système nerveux sympathique est recommandée pour diminuer ou éviter ces modifications.']);
  PERFORM pg_temp.jp_fill(m, 'inter', ARRAY['Associations recommandées', '+ Diurétiques', 'LONOTEN doit être associé à une dose diurétique suffisante pour maintenir l’équilibre hydrosodé.', '+ Inhibiteur du système nerveux sympathique', 'Un agent bloquant du système nerveux sympathique sera prescrit en association avec LONOTEN afin de limiter une accélération de la fréquence cardiaque.', 'Le composé de choix sera un bétabloquant à une dose équivalente chez l’adulte à 80-160 mg par jour de propanolol.', 'En cas de contre-indications aux bêta-bloquants, on pourra prescrire de la α-méthyl-dopa ou de la clonidine, en débutant l’administration au moins 24 heures avant celle de LONOTEN.', 'Associations déconseillées', '+ Médicaments sympatholytiques tels que la guanéthidine', 'LONOTEN ne doit pas être associé à la guanéthidine ni, d’une façon générale, à tous les autres antihypertenseurs vasodilatateurs (risque d’hypotension sévère et/ou d’hypotension orthostatique).', 'Si possible, l’administration de guanéthidine doit être arrêtée bien avant d’initier le traitement par minoxidil.', 'Si cela s’avère impossible, il convient de mettre en route le traitement par minoxidil à l’hôpital et de surveiller de très près le patient pour détecter des signes d’hypotension orthostatique.']);
  PERFORM pg_temp.jp_fill(m, 'ei', ARRAY['Très fréquent', 'Fréquent', 'fréquent', '≥ 1/1000', '≥ 1/10000']);
  PERFORM pg_temp.jp_fill(m, 'surv', ARRAY['Le traitement par LONOTEN doit être institué sous surveillance médicale spécialisée rigoureuse.', 'Les poids du patient et l’équilibre hydro-électrolytique doivent être surveillés pour détecter d’éventuels signes de rétention hydrique.']);
  -- rilmenidine (CIS 67541600, scored)
  m := pg_temp.jp_matrice_by_norm('rilmenidine');
  PERFORM pg_temp.jp_detail_set(m, 'Classe pharmacothérapeutique : antihypertenseur, adrénolytique à action centrale, agoniste des récepteurs à l’imidazoline, Code ATC : C02AC06.');
  PERFORM pg_temp.jp_fill(m, 'ind', ARRAY['Hypertension artérielle.']);
  PERFORM pg_temp.jp_fill(m, 'ci', ARRAY['Hypersensibilité à la substance active ou à l’un des excipients mentionnés à la rubrique 6.1.', 'Etats dépressifs graves.', 'Insuffisance rénale sévère (clairance de la créatinine < 15 ml/min).']);
  PERFORM pg_temp.jp_fill(m, 'pre', ARRAY['Ne jamais interrompre brutalement le traitement, mais diminuer progressivement la posologie.', 'Le suivi de la fréquence cardiaque, particulièrement dans les 4 premières semaines de traitement, est recommandé chez de tels patients.', 'La prise d''alcool est déconseillée pendant le traitement (voir rubrique 4.5).', 'L’association avec les bêta-bloquants utilisés dans le traitement de l’insuffisance cardiaque est déconseillée (voir rubrique 4.5).', 'En raison d’une possibilité de survenue d’hypotension orthostatique, les patients âgés doivent être informés du risque accru de chute.', 'L’association avec l’oxybate de sodium est déconseillée (voir rubrique 4.5).', 'Excipients', 'Ce médicament contient du lactose.', 'Les patients présentant une intolérance au galactose, un déficit total en lactase ou un syndrome de malabsorption du glucose et du galactose (maladies héréditaires rares) ne doivent pas prendre ce médicament.', 'Ce médicament contient moins de 1 mmol (23 mg) de sodium par comprimé, c’est-à-dire qu’il est essentiellement « sans sodium ».']);
  PERFORM pg_temp.jp_fill(m, 'inter', ARRAY['Associations déconseillées (voir rubrique 4.4)', 'Alcool (boisson ou excipients)', 'Majoration par l''alcool de l''effet sédatif de ces substances.', 'L''altération de la vigilance peut rendre dangereuses la conduite de véhicules et l''utilisation de machines.', 'Eviter la prise de boissons alcoolisées et de médicaments contenant de l''alcool.', 'Bêta-bloquants utilisés dans l''insuffisance cardiaque', 'Diminution centrale du tonus sympathique et effet vasodilatateur des antihypertenseurs centraux, préjudiciables en cas d''insuffisance cardiaque traitée par bêta-bloquant et vasodilatateur.', 'Sodium (oxybate de)', 'Majoration de la dépression centrale.', 'Associations faisant l''objet de précautions d’emploi', 'Bêta-bloquants (sauf esmolol)', 'Augmentation importante de la pression artérielle en cas d''arrêt brutal du traitement par l''antihypertenseur central.']);
  PERFORM pg_temp.jp_fill(m, 'ei', ARRAY['Les effets indésirables ou évènements suivants ont été rapportés et listés selon les fréquences suivantes : Très fréquent: (≥1/10), Fréquent (≥1/100,', 'Fréquent']);
  -- methyldopa (CIS 60578560, scored)
  m := pg_temp.jp_matrice_by_norm('methyldopa');
  PERFORM pg_temp.jp_detail_set(m, 'Classe pharmacothérapeutique : ANTI-HYPERTENSEUR/SYMPATHOLYTIQUE D''ACTION CENTRALE, code ATC : C02AB02-système cardio-vasculaire.');
  PERFORM pg_temp.jp_fill(m, 'ind', ARRAY['Hypertension artérielle modérée ou sévère.']);
  PERFORM pg_temp.jp_fill(m, 'ci', ARRAY['Ce médicament NE DOIT PAS ETRE UTILISE dans les cas suivants :', 'état dépressif grave,', 'antécédents d''hépatite médicamenteuse ou de troubles hépatiques associés à la méthyldopa,', 'maladie hépatique évolutive telle qu’hépatite aiguë et chronique ou cirrhose,', 'hypersensibilité à la substance active ou à l''un des excipients mentionnés à la rubrique 6.1,', 'anémie hémolytique,', 'tumeur sécrétant des catécholamines comme un phéochromocytome ou un paragangliome,', 'porphyrie', 'Ce médicament est généralement déconseillé en cas d''association à l''alcool et aux médicaments contenant de l''alcool']);
  PERFORM pg_temp.jp_fill(m, 'pre', ARRAY['Contrôle du bilan hématologique', 'Une anémie hémolytique acquise a rarement été rapportée en association avec un traitement par la méthyldopa.', 'Devant des symptômes évoquant une anémie, la mesure de l''hémoglobine et/ou de l''hématocrite doit être effectuée.', 'En cas d''anémie, les examens biologiques appropriés doivent être faits afin de déterminer l''existence d''une hémolyse.', 'Une anémie hémolytique est une indication à l''arrêt du traitement.', 'L''arrêt de la méthyldopa ou l''instauration d''une corticothérapie entraîne habituellement une rémission rapide de l''anémie.', 'Cependant, des décès ont été rapportés.', 'La fréquence d''un test de Coombs positif chez les malades sous méthyldopa au long cours est de 10 à 20 %.', 'Il est peu probable de l''observer lors d''une administration continue s''il ne se développe pas dans les 12 premiers mois.', 'La pratique d''un test de Coombs direct peut être utile à titre systématique pour détecter une auto-immunisation latente.', 'Elle est indispensable en cas d''anémie pour confirmer le mécanisme auto-immun de l''hémolyse.', 'Ce phénomène est dose-dépendant : l''incidence la plus basse est observée chez les patients recevant une dose inférieure ou égale à 1 g/jour de méthyldopa.']);
  PERFORM pg_temp.jp_fill(m, 'inter', ARRAY['Associations déconseillées', '+ Alcool', 'Majoration par l''alcool de l''effet sédatif de ces substances.', 'L''altération de la vigilance peut rendre dangereuses la conduite de véhicules et l''utilisation de machines.', 'Eviter la prise de boissons alcoolisées et de médicaments contenant de l''alcool.', 'Associations faisant l''objet de précautions d’emploi', '+ Baclofène', 'Majoration de l''effet antihypertenseur.', 'Surveillance de la tension artérielle et adaptation posologique de l''antihypertenseur si nécessaire.', '+ Lithium', 'Augmentation de la lithémie pouvant atteindre des valeurs toxiques avec signes de surdosage en lithium.', 'Surveillance clinique et adaptation de la posologie du lithium.']);
  PERFORM pg_temp.jp_fill(m, 'ei', ARRAY['Très fréquent (≥ 1/10)', 'Fréquent (≥ 1/100, Peu fréquent (≥ 1/1 000, Rare (≥ 1/10 000, Très rare (Fréquence indéterminée (ne peut être estimée sur la base de données disponibles)', 'Fréquence indéterminée : Anémie hémolytique, aplasie médullaire, leucopénie, granulocytopénie, thrombocytopénie, hyperéosinophilie.']);
  PERFORM pg_temp.jp_fill(m, 'surv', ARRAY['Contrôle du bilan hématologique']);
  -- moxonidine (CIS 60993898, scored)
  m := pg_temp.jp_matrice_by_norm('moxonidine');
  PERFORM pg_temp.jp_detail_set(m, 'Classe pharmacothérapeutique : ANTIHYPERTENSEUR D''ACTION CENTRALE, code ATC : C02AC05.');
  PERFORM pg_temp.jp_fill(m, 'ind', ARRAY['Hypertension artérielle.']);
  PERFORM pg_temp.jp_fill(m, 'ci', ARRAY['Ce médicament est contre-indiqué chez les patients présentant :', 'une hypersensibilité connue à la substance active ou à l’un des excipients.', 'une dysfonction sinusale.', 'une bradycardie (fréquence cardiaque au repos', 'un bloc auriculo-ventriculaire du 2ème et 3ème degré.', 'une insuffisance cardiaque.']);
  PERFORM pg_temp.jp_fill(m, 'pre', ARRAY['Lors de la surveillance après la mise sur le marché, des cas de blocs auriculo-ventriculaires de différents degrés ont été rapportés chez des patients traités par la moxonidine.', 'D’après ces cas, le rôle causal de la moxonidine dans le retard de la conduction auriculo-ventriculaire ne peut pas être complètement exclu.', 'Par conséquent, il est recommandé de traiter avec prudence les patients prédisposés au développement d’un bloc auriculo-ventriculaire.', 'Une attention particulière devra être exercée lors de l’utilisation de la moxonidine chez les patients présentant un bloc auriculo-ventriculaire du 1er degré, afin d’éviter une bradycardie.', 'La moxonidine ne doit pas être utilisée chez les patients présentant un bloc auriculo-ventriculaire de degré plus élevé (voir rubrique 4.3).', 'En l’absence d’expérience clinique documentée, la moxonidine n’est pas recommandée en cas de dépression.', 'La moxonidine devra être utilisée avec précaution chez les patients présentant une insuffisance coronarienne sévère ou un angor instable en raison de l’expérience limitée dans cette population.', 'La moxonidine étant principalement éliminée par le rein, une attention particulière est recommandée lors de l’administration chez des patients présentant une insuffisance rénale.', 'Chez ces patients, une adaptation posologique est recommandée, notamment en début de traitement.', 'La posologie initiale journalière est de 0,2 mg.', 'A ce jour, aucun effet-rebond n’a été observé sur la pression artérielle après arrêt du traitement par la moxonidine.', 'Cependant, il ne faut pas interrompre brutalement le traitement, mais diminuer progressivement la posologie sur une période de 2 semaines.']);
  PERFORM pg_temp.jp_fill(m, 'inter', ARRAY['Associations déconseillées', '+ Alcool', 'Majoration par l''alcool de l''effet sédatif de ces substances.', 'L''altération de la vigilance peut rendre dangereuses la conduite de véhicules et l''utilisation de machines.', 'Eviter la prise de boissons alcoolisées et de médicaments contenant de l''alcool.', '+ Béta-bloquant dans l’insuffisance cardiaque', 'Diminution centrale du tonus sympathique et effet vasodilatateur des antihypertenseurs centraux, préjudiciables en cas d’insuffisance cardiaque traitée par béta-bloquant et vasodilatateur.', 'Associations faisant l''objet de précautions d’emploi', '+ Baclofène', 'Majoration du risque hypotenseur ; surveillance de la pression artérielle et adaptation de la posologie si nécessaire.', '+ Béta-bloquant (sauf esmolol)', 'Augmentation importante de la pression artérielle en cas d’arrêt brutal du traitement par l’antihypertenseur central.']);
  PERFORM pg_temp.jp_fill(m, 'ei', ARRAY['Très fréquents >1/10', 'Fréquents >1/100,', 'Peu fréquents', '>1/1000,']);
  PERFORM pg_temp.jp_fill(m, 'surv', ARRAY['Lors de la surveillance après la mise sur le marché, des cas de blocs auriculo-ventriculaires de différents degrés ont été rapportés chez des patients traités par la moxonidine.']);
  -- clonidine (CIS 68678872, scored)
  m := pg_temp.jp_matrice_by_norm('clonidine');
  PERFORM pg_temp.jp_detail_set(m, 'Classe pharmacothérapeutique : ANTIHYPERTENSEUR – ADRENOLYTIQUES A ACTION CENTRALE – AGONISTES DES RECEPTEURS A L’IMIDAZOLINE, code ATC : C02AC01.');
  PERFORM pg_temp.jp_fill(m, 'ind', ARRAY['Hypertension artérielle.']);
  PERFORM pg_temp.jp_fill(m, 'ci', ARRAY['Hypersensibilité à la substance active ou à l’un des excipients mentionnés à la rubrique 6.1.', 'Brady-arythmie sévère due à une maladie du nœud sinusal ou à un bloc auriculo-ventriculaire du deuxième ou du troisième degré.', 'Etat dépressif.']);
  PERFORM pg_temp.jp_fill(m, 'pre', ARRAY['Mises en garde spéciales', 'Il faut prévenir les patients de ne pas arrêter le traitement sans avis médical.', 'Lors de l’arrêt d’un traitement par CATAPRESSAN, la dose doit être réduite progressivement sur 2 à 4 jours.', 'S’il est nécessaire d’interrompre un traitement de longue durée associant un bêtabloquant et la clonidine, il faut d’abord arrêter progressivement le traitement bêtabloquant, puis la clonidine.', 'La reprise orale de la thérapeutique à la posologie antérieure met fin aux poussées hypertensives.', 'Ce médicament contient du lactose.', 'Son utilisation est déconseillée chez les patients présentant une intolérance au galactose, un déficit en lactase de lapp ou un syndrome de malabsorption du glucose ou du galactose (maladies héréditaires rares).', 'La clonidine ne doit pas être utilisée chez les enfants et les adolescents compte tenu de l’insuffisance de données de sécurité et d’efficacité.', 'L’utilisation de la clonidine dans cette association n’est donc pas recommandée.', 'Précautions d’emploi', 'Comme pour tout produit éliminé en majeure partie par voie urinaire, la posologie de CATAPRESSAN sera adaptée chez les insuffisants rénaux.', 'Chez le sujet âgé ou en cas d''athérosclérose, la baisse de la tension artérielle ne doit être ni trop importante ni trop rapide ; en conséquence, l’instauration de la posologie sera progressive et prudente.']);
  PERFORM pg_temp.jp_fill(m, 'inter', ARRAY['De nombreux médicaments peuvent entraîner une bradycardie.', 'Les substances ayant la faculté de bloquer les récepteurs alpha2 telles que la phentolamine peuvent inhiber de manière dose-dépendante les effets de la clonidine sur les récepteurs alpha2.', 'Il faut prendre en compte le fait que de nombreux médicaments ou substances peuvent additionner leurs effets dépresseurs du système nerveux central et contribuer à diminuer la vigilance.', 'Associations déconseillées', '+ Antidépresseurs imipraminiques', 'Décrit pour désipramine, imipramine : inhibition de l''effet antihypertenseur de la clonidine (antagonisme au niveau des récepteurs adrénergiques).', '+ Béta-bloquants dans l’insuffisance cardiaque', 'Diminution centrale du tonus sympathique et effet vasodilatateur des antihypertenseurs centraux, préjudiciables en cas d''insuffisance cardiaque traitée par bêta-bloquant et vasodilatateur.', '+ Consommation d’alcool', 'Majoration par l''alcool de l''effet sédatif de ces substances.', 'L''altération de la vigilance peut rendre dangereuses la conduite de véhicules et l''utilisation de machines.', 'Eviter la prise de boissons alcoolisées et de médicaments contenant de l''alcool.']);
  PERFORM pg_temp.jp_fill(m, 'ei', ARRAY['Très fréquent (³ 1/10) ; fréquent (³ 1/100, ³ 1/1000, ³ 1/10 000,', 'Fréquent : Dépression, troubles du sommeil.', 'Peu fréquent : Cauchemars, hallucinations.']);
  -- benazepril (CIS 63559394, scored)
  m := pg_temp.jp_matrice_by_norm('benazepril');
  PERFORM pg_temp.jp_detail_set(m, 'Classe pharmacothérapeutique : INHIBITEURS DE L''ENZYME DE CONVERSION (IEC) NON ASSOCIES.');
  PERFORM pg_temp.jp_fill(m, 'ind', ARRAY['Hypertension artérielle.', 'Ralentissement de la progression de l''insuffisance rénale chez les patients atteints d''une néphropathie glomérulaire avec hypertension et protéinurie et ayant une clairance de la créatinine entre 30 et 60 ml/mn.', 'Le risque de survenue d''hyperkaliémie chez ces patients doit être pris en compte, une surveillance adaptée est indispensable.']);
  PERFORM pg_temp.jp_fill(m, 'ci', ARRAY['Ce médicament ne doit jamais être utilisé en cas de', 'Hypersensibilité au bénazépril,', 'Antécédent d''angio-œdème (œdème de Quincke) lié ou non à la prise d''un inhibiteur de l''enzyme de conversion,', 'Au 2ème et 3ème trimestre de la grossesse (voir rubriques 4.4 et 4.6).', 'En cas d''occlusion intestinale, en raison de la présence d''huile de ricin.', 'Utilisation concomitante avec un traitement par sacubitril / valsartan CIBACENE ne doit pas être débuté moins de 36 heures après la dernière dose de sacubitril/valsartan (voir également rubriques 4.4 et 4.6).', 'Ce médicament est généralement déconseillé en cas de :', 'Associations avec l’aliskiren, les diurétiques épargneurs de potassium, les sels de potassium, l’estramustine et le lithium (voir rubrique 4.5),', 'Sténose bilatérale de l''artère rénale ou sur rein fonctionnellement unique,', 'Hyperkaliémie.']);
  PERFORM pg_temp.jp_fill(m, 'pre', ARRAY['Mises en garde spéciales', 'Ce médicament contient du lactose.', 'Les patients présentant une intolérance au galactose, un déficit en lactase ou un syndrome de malabsorption du glucose ou du galactose (maladies héréditaires rares) ne doivent pas prendre ce médicament.', 'Double blocage du système rénine-angiotensine-aldostérone (SRAA)', 'En conséquence, le double blocage du SRAA par l’association d’IEC, d’ARA II ou d’aliskiren n’est pas recommandé (voir rubriques 4.5 et 5.1).', 'Les IEC et les ARA II ne doivent pas être associés chez les patients atteints d’une néphropathie diabétique.', 'Risque de neutropénie/agranulocytose sur terrain immunodéprimé', 'Des inhibiteurs de l''enzyme de conversion ont exceptionnellement entraîné une agranulocytose et/ou une dépression médullaire lorsqu''ils étaient administrés:', 'à doses élevées,', 'chez des patients insuffisants rénaux associant des maladies de système (collagénoses telles que lupus érythémateux disséminé ou sclérodermie), avec un traitement immunosuppresseur et/ou potentiellement leucopéniant.', 'Le strict respect des posologies préconisées semble constituer la meilleure prévention de la survenue de ces événements.', 'Toutefois, si un inhibiteur de l''enzyme de conversion doit être administré chez ce type de patients, le rapport bénéfice/risque sera soigneusement mesuré.']);
  PERFORM pg_temp.jp_fill(m, 'inter', ARRAY['La survenue d''une hyperkaliémie peut dépendre de l''existence de facteurs de risque associés.', 'Associations contre-indiquées', '+ Médicaments augmentant le risque d’angio-œdème', 'L’utilisation concomitante d’IEC avec l’association sacubitril/valsartan est contre-indiquée en raison du risque accru d’angio-œdème (voir rubriques 4.3 et 4.4).', 'L’utilisation concomitante d’IEC avec le racécadotril, les inhibiteurs de mTOR (p. ex. sirolimus, évérolimus, temsirolimus) et la vildagliptine peut entraîner un risque accru d’angio-œdème (voir rubrique 4.4).', 'Chez le patient diabétique ou insuffisant rénal (DFG+ Aliskiren', 'Risque d’hyperkaliémie, d’insuffisance rénale, d’augmentation de la morbi-mortalité cardio-vasculaire.', 'Associations déconseillées', '+ Aliskiren', '+ Diurétiques épargneurs de potassium, suppléments potassiques ou substituts de sel contenant du potassium', 'Bien que la kaliémie demeure habituellement dans les limites de la normale, une hyperkaliémie peut survenir chez certains patients traités par bénazépril.', 'Par conséquent, l’association du bénazépril avec les médicaments susmentionnés n’est pas recommandée.']);
  PERFORM pg_temp.jp_fill(m, 'ei', ARRAY['Très rare: anémie hémolytique, thrombocytopénie', 'Fréquence inconnue: agranulocytose/neutropénie (voir la rubrique 4.4).', 'Fréquence inconnue: réactions anaphylactoïdes (voir la rubrique 4.4)', 'Fréquent: céphalées, étourdissements']);
  -- quinapril (CIS 62927128, scored)
  m := pg_temp.jp_matrice_by_norm('quinapril');
  PERFORM pg_temp.jp_detail_set(m, 'Classe pharmacothérapeutique : INHIBITEUR DE L''ENZYME DE CONVERSION DE L''ANGIOTENSINE, code ATC : C09AA06 (système cardiovasculaire)');
  PERFORM pg_temp.jp_fill(m, 'ind', ARRAY['Hypertension artérielle.', 'Insuffisance cardiaque congestive.']);
  PERFORM pg_temp.jp_fill(m, 'ci', ARRAY['Ce médicament ne doit jamais être utilisé :', 'au cours des 2ème et 3ème trimestres de grossesse (voir rubriques 4.4 et 4.6),', 'en cas d’hypersensibilité à la substance active ou à l''un des excipients mentionnés à la rubrique 6.1,', 'en cas d’antécédent d''angio-œdème (œdème de Quincke) lié à la prise d''un inhibiteur de l''enzyme de conversion de l''angiotensine,', 'en association avec sacubitril/valsartan à cause d’une augmentation du risque d’angio-œdème,', 'en association avec racécadotril, en cas d''antécédents d''angio-œdème sous inhibiteurs de l’enzyme de conversion (voir rubrique 4.5),', 'chez les patients souffrant d’angio-œdème neurotique idiopathique ou héréditaire,', 'chez les patients atteints d’obstruction dynamique à l’éjection du ventricule gauche,']);
  PERFORM pg_temp.jp_fill(m, 'pre', ARRAY['Mises en garde spéciales', 'Le quinapril doit être utilisé avec prudence chez les patients souffrant de sténose aortique.', 'En conséquence, le double blocage du SRAA par l’association d’IEC, d’ARA II ou d’aliskiren n’est pas recommandé (voir rubriques 4.5 et 5.1).', 'Les IEC et les ARA II ne doivent pas être associés chez les patients atteints d’une néphropathie diabétique.', 'Les médecins devront préciser aux patients l’importance de rapporter immédiatement tout signe d’infection (mal de gorge, fièvre) qui pourrait être un signe de neutropénie (voir section 4.5).', 'Une agranulocytose a rarement été rapportée pendant le traitement par le quinapril.', 'Comme pour les autres inhibiteurs de l’enzyme de conversion, un suivi des globules blancs doit être envisagé chez les patients atteints de collagénose vasculaire et/ou d’une maladie rénale.', 'Angio-œdème (œdème de Quincke) : un angio-œdème chez les patients traités par un inhibiteur de l''enzyme de conversion.', 'Lorsque l''œdème n''intéresse que la face et les lèvres, l''évolution est en général régressive sans traitement, bien que les antihistaminiques aient été utilisés pour soulager les symptômes.', 'La prescription d''un inhibiteur de l''enzyme de conversion ne doit plus être envisagée par la suite chez ces patients (voir rubrique 4.3).', 'L''angio-œdème associé à un œdème laryngé peut être fatal.', 'Lorsqu''il y a atteinte de la langue, de la glotte ou du larynx, pouvant entraîner une obstruction des voies aériennes, une solution d''adrénaline sous-cutanée à 1/1 000 (0,3 ml à 0,5 ml), doit être administrée rapidement.']);
  PERFORM pg_temp.jp_fill(m, 'inter', ARRAY['HYPERKALIÉMIANTS', 'L’association de ces médicaments majore le risque d’hyperkaliémie.', 'Pour connaître les risques et les niveaux de contrainte spécifiques aux médicaments hyperkaliémiants, il convient de se reporter aux interactions propres à chaque substance.', 'Toutefois, certaines substances, comme le triméthoprime, ne font pas l’objet d’interactions spécifiques au regard de ce risque.', 'Néanmoins, ils peuvent agir comme facteurs favorisants lorsqu’ils sont associés à d’autres médicaments déjà mentionnés dans ce chapeau.', 'Associations contre-indiquées', '+ Aliskiren (chez le patient diabétique ou insuffisant rénal [TFG 2])', 'Risque d’hyperkaliémie, d’insuffisance rénale, d’augmentation de la morbi-mortalité cardiovasculaire.', '+ Racécadotril (en cas d''antécédents d''angio-œdème sous IEC)', 'Risque de majoration des effets indésirables à type d''œdème angioneurotique (angio-œdème).', '+ Sacubitril', 'Augmentation du risque d’angio-œdème.']);
  PERFORM pg_temp.jp_fill(m, 'ei', ARRAY['Agranulocytose, anémie hémolytique, neutropénie, thrombocytopénie', 'Réaction anaphylactoïde', 'Fréquent']);
  -- trandolapril (CIS 68510337, scored)
  m := pg_temp.jp_matrice_by_norm('trandolapril');
  PERFORM pg_temp.jp_detail_set(m, 'Classe pharmacothérapeutique : INHIBITEUR DE L’ENZYME DE CONVERSION (IEC) NON ASSOCIE, code ATC : C09AA10.');
  PERFORM pg_temp.jp_fill(m, 'ind', ARRAY['Hypertension artérielle.', 'o réduction de la mortalité totale,', 'o réduction de l''évolution vers l''insuffisance sévère ou réfractaire.', 'Le traitement d''un groupe de 876 patients durant 24 à 50 mois a permis d''éviter le décès de 65 patients (soit 7,4%) (voir étude TRACE rubrique 5.1).']);
  PERFORM pg_temp.jp_fill(m, 'ci', ARRAY['Ce médicament ne doit jamais être utilisé dans les cas suivants :', 'Antécédent d’hypersensibilité au trandolapril, à l''un des excipients ou à un autre inhibiteur de l’enzyme de conversion.', 'Antécédent d''angio-œdème (œdème de Quincke) lié à la prise d''un inhibiteur de l''enzyme de conversion et/ou angio-oedème héréditaire ou idiopathique.', '2ème et 3ème trimestres de la grossesse (voir rubriques 4.4 et 4.6).', 'Utilisation concomitante avec un traitement par sacubitril/valsartan.', 'ODRIK ne doit pas être débuté moins de 36 heures après la dernière dose de sacubitril/valsartan (voir également rubriques 4.4 et 4.5).']);
  PERFORM pg_temp.jp_fill(m, 'pre', ARRAY['Hypotension', 'De rares cas d''hypotension ont été observés chez des patients présentant une hypertension non compliquée.', 'La déplétion hydrosodée doit être corrigée avant d''administrer un inhibiteur de l''enzyme de conversion et une dose initiale plus faible doit être envisagée.', 'Si une hypotension se développe, le patient doit être placé en position allongée.', 'Un remplissage volémique par une solution saline administrée par voie intraveineuse peut être nécessaire.', 'Sténose aortique ou mitrale / cardiomyopathie hypertrophique', 'Le trandolapril ne doit pas être utilisé chez les patients avec une sténose aortique ou une obstruction hémodynamique.', 'Insuffisance rénale', 'Chez ces malades et chez ceux atteints de néphropathie glomérulaire, le risque d’hyperkaliémie doit être pris en compte.', 'La pratique médicale normale comprend un contrôle périodique du potassium et de la créatinine (voir rubrique 4.2).', 'Une protéinurie peut apparaître, notamment chez les patients avec une insuffisance rénale ou prenant des doses relativement élevées d’IEC.', 'Double blocage du système rénine-angiotensine-aldostérone (SRAA)']);
  PERFORM pg_temp.jp_fill(m, 'inter', ARRAY['Médicaments hyperkaliémiants', 'L''association de ces médicaments majore le risque d''hyperkaliémie.', 'Pour connaître les risques et les niveaux de contrainte spécifiques aux médicaments hyperkaliémiants, il convient de se reporter aux interactions propres à chaque substance.', 'Toutefois, certaines substances, comme le triméthoprime, ne font pas l''objet d''interactions spécifiques au regard de ce risque.', 'Néanmoins, ils peuvent agir comme facteurs favorisants lorsqu''ils sont associés à d''autres médicaments déjà mentionnés dans ce chapeau.', 'Quatre-vingt sujets (80%) de cette étude ont reçu des diurétiques (voir aussi rubrique 4.4).', 'Associations contre-indiquées', '+ Aliskiren chez le patient diabétique ou insuffisant rénal (DFGRisque d’hyperkaliémie, d’insuffisance rénale, d’augmentation de la morbi-mortalité cardio-vasculaire.', '+ Médicaments augmentant le risque d’angio-œdème', 'L’utilisation concomitante d’IEC avec l’association sacubitril/valsartan est contre-indiquée en raison du risque accru d’angio-oedème (voir rubriques 4.3 et 4.4).', 'L’utilisation concomitante d’IEC avec le racécadotril, les inhibiteurs de mTOR (p. ex. sirolimus, évérolimus, temsirolimus) et la vildagliptine peut entraîner un risque accru d’angio-œdème (voir rubrique 4.4).', '+ AINS chez le patient insuffisant cardiaque']);
  PERFORM pg_temp.jp_fill(m, 'ei', ARRAY['La convention suivante est utilisée pour les fréquences : Très fréquents : ≥1/10, fréquents : ≥1/100 et', 'Fréquent', 'Peu fréquent']);
  PERFORM pg_temp.jp_fill(m, 'surv', ARRAY['Chez ces malades et chez ceux atteints de néphropathie glomérulaire, le risque d’hyperkaliémie doit être pris en compte.', 'La pratique médicale normale comprend un contrôle périodique du potassium et de la créatinine (voir rubrique 4.2).']);
  -- zofenopril (CIS 60780754, scored)
  m := pg_temp.jp_matrice_by_norm('zofenopril');
  PERFORM pg_temp.jp_detail_set(m, 'Classe pharmacothérapeutique : inhibiteurs de conversion de l''angiotensine, Code ATC : C09AA15 : système cardiovasculaire.');
  PERFORM pg_temp.jp_fill(m, 'ind', ARRAY['Hypertension', 'ZOFENIL est indiqué dans le traitement de l''hypertension artérielle légère à modérée.', 'Infarctus du myocarde en phase aiguë']);
  PERFORM pg_temp.jp_fill(m, 'ci', ARRAY['Hypersensibilité au zofénopril ou à tout autre IEC, ou à l''un des excipients mentionnés à la rubrique 6.1.', 'Antécédents d''angio-œdème (œdème de Quincke) lié à la prise d''un IEC.', 'Utilisation concomitante avec un traitement par sacubitril/valsartan.', 'Le traitement par ZOFENIL ne doit pas être débuté moins de 36 heures après la dernière dose de sacubitril/valsartan (voir également rubriques 4.4 et 4.5).', 'Angio-œdème héréditaire/idiopathique.', 'Insuffisance hépatique sévère.', 'Deuxième et troisième trimestre de la grossesse (voir rubriques 4.4 et 4.6).', 'Femme en période d''activité génitale sans contraception efficace.', 'Sténose bilatérale de l''artère rénale ou sténose unilatérale dans le cadre d''un rein unique.']);
  PERFORM pg_temp.jp_fill(m, 'pre', ARRAY['Hypotension :', 'Chez les patients ayant une insuffisance cardiaque, avec ou sans insuffisance rénale associée, une hypotension symptomatique a été observée.', 'Chez les patients à risque élevé d''hypotension symptomatique, le traitement devra démarrer sous surveillance médicale de préférence à l''hôpital avec des doses faibles et une adaptation posologique prudente.', 'Si possible, le traitement diurétique sera interrompu temporairement quand le traitement par ZOFENIL est instauré.', 'Si une hypotension se produit, le patient doit être placé en position couchée.', 'La compensation volumique par voie intraveineuse avec un soluté isotonique de chlorure de sodium peut être nécessaire.', 'L''apparition d''une hypotension après la dose initiale ne doit pas exclure ultérieurement une adaptation posologique prudente.', 'Chez certains patients insuffisants cardiaques ayant une pression artérielle normale ou basse, une diminution supplémentaire de la pression artérielle systémique peut se produire avec ZOFENIL.', 'Cet effet est attendu et ne justifie normalement pas l''arrêt du traitement.', 'Si l''hypotension devient symptomatique, une diminution de la dose ou l''arrêt du traitement par ZOFENIL peut s''avérer nécessaire.', 'Hypotension dans l''infarctus aigu du myocarde :', 'Le traitement par ZOFENIL chez les patients présentant un infarctus du myocarde en phase aiguë peut contribuer à une hypotension sévère.']);
  PERFORM pg_temp.jp_fill(m, 'inter', ARRAY['+ Médicaments augmentant le risque d’angio-œdème.', 'L’utilisation concomitante d’IEC avec l’association sacubitril/valsartan est contre-indiquée en raison du risque accru d’angio-œdème (voir rubriques 4.3 et 4.4).', 'L’utilisation concomitante d’IEC avec le racécadotril, les inhibiteurs de mTOR (p. ex. sirolimus, évérolimus, temsirolimus) et la vildagliptine peut entraîner un risque accru d’angio-oedème (voir rubrique 4.4).', 'Associations déconseillées', '+ Diurétiques hyperkaliémiants, suppléments potassiques, substituts de sel contenant du potassium ou autres substances augmentant la kaliémie', 'Bien que la kaliémie demeure habituellement dans les limites de la normale, une hyperkaliémie peut survenir chez certains patients traités par zofenopril.', 'Par conséquent, l’association du zofenopril avec les médicaments susmentionnés n’est pas recommandée.', 'Si une utilisation concomitante est indiquée, elle doit se faire avec précaution et être accompagnée d’une surveillance fréquente de la kaliémie.', '+ Inhibiteurs de l’enzyme de conversion, antagonistes des récepteurs de l’angiotensine II ou aliskiren', 'Associations faisant l''objet de précautions d’emploi', '+ Diurétiques (thiazides ou diurétiques de l''anse)', 'Le traitement par de hautes doses de diurétiques peut conduire à une déplétion volumique et un risque d''hypotension à l''instauration du traitement par zofénopril (voir rubrique 4.4).']);
  PERFORM pg_temp.jp_fill(m, 'ei', ARRAY['Ils sont listés par système classe/organe et ordre de fréquence comme suit : très fréquent (≥1/10), fréquent (≥1/100 à', 'Fréquent']);
  PERFORM pg_temp.jp_fill(m, 'surv', ARRAY['Chez les patients à risque élevé d''hypotension symptomatique, le traitement devra démarrer sous surveillance médicale de préférence à l''hôpital avec des doses faibles et une adaptation posologique prudente.']);
  -- irbesartan (CIS 61605035, scored)
  m := pg_temp.jp_matrice_by_norm('irbesartan');
  PERFORM pg_temp.jp_detail_set(m, 'Classe pharmacothérapeutique : Antagonistes des récepteurs de l’angiotensine II, code ATC : C09C A04.');
  PERFORM pg_temp.jp_fill(m, 'ind', ARRAY['IRBESARTAN ACCORD est indiqué chez l’adulte dans le traitement de l’hypertension artérielle essentielle.', 'Il est également indiqué dans le traitement de l’atteinte rénale chez les patients adultes hypertendus diabétiques de type 2, dans le cadre de la prise en charge par un médicament antihypertenseur (voir rubrique 5.1).', 'IRBESARTAN ACCORD peut être utilisé seul ou en association avec d’autres agents antihypertenseurs (voir rubrique 4.3, 4.4, 4.5 et 5.1).']);
  PERFORM pg_temp.jp_fill(m, 'ci', ARRAY['Hypersensibilité à la substance active ou à l’un des excipients mentionnés à la rubrique 6.1.', 'Deuxième et troisième trimestres de la grossesse (voir rubriques 4.4 et 4.6).']);
  PERFORM pg_temp.jp_fill(m, 'pre', ARRAY['Ces anomalies doivent être corrigées avant l’administration d’IRBESARTAN ACCORD.', 'Bien que cela n’ait pas été documenté avec IRBESARTAN ACCORD, un phénomène similaire est à prévoir avec les antagonistes des récepteurs de l’angiotensine II.', 'Aucune expérience n’est disponible concernant l’utilisation d’IRBESARTAN ACCORD chez les patients ayant eu une transplantation rénale récente.', 'En particulier, ils sont apparus moins favorables chez les femmes et chez les patients non-blancs (voir rubrique 5.1).', 'En conséquence, le double blocage du SRAA par l’association d’IEC, ARA II ou d’aliskiren n’est pas recommandé (voir rubriques 4.5 et 5.1).', 'Les IEC et les ARA II ne doivent pas être associés chez les patients atteints d’une néphropathie diabétique.', 'Un contrôle rapproché du potassium sérique chez les patients à risque est recommandé (voir rubrique 4.5).', 'Hypoglycémie : IRBESARTAN ACCORD peut induire une hypoglycémie, en particulier chez les patients diabétiques.', 'Lithium : l’association du lithium et d’IRBESARTAN ACCORD est déconseillée (voir rubrique 4.5).', 'Hyperaldostéronisme primaire : les patients avec hyperaldostéronisme primaire ne répondent généralement pas aux médicaments antihypertenseurs agissant par l’intermédiaire de l’inhibition du système rénine-angiotensine.', 'En conséquence, l’utilisation d’IRBESARTAN ACCORD n’est pas recommandée.', 'Grossesse : Les inhibiteurs des récepteurs de l’angiotensine II (ARAII) ne doivent pas être débutés au cours de la grossesse.']);
  PERFORM pg_temp.jp_fill(m, 'inter', ARRAY['Diurétiques et autres antihypertenseurs : d’autres agents antihypertenseurs peuvent augmenter les effets hypotenseurs de l’irbésartan.', 'Cependant, irbésartan a été associé sans problème à d’autres antihypertenseurs, tels que des bêtabloquants, des antagonistes calciques à longue durée d’action et des diurétiques thiazidiques.', 'Un traitement antérieur par des diurétiques à une dose élevée peut provoquer une hypovolémie et un risque d’hypotension lorsqu’un traitement par IRBESARTAN ACCORD est mis en route (voir rubrique 4.4).', 'Lithium :des augmentations réversibles des concentrations sériques et de la toxicité du lithium ont été rapportées avec les inhibiteurs de l’enzyme de conversion.', 'A ce jour, des effets similaires ont été très rarement rapportés avec l’irbésartan.', 'Par conséquent, cette association est déconseillée (voir rubrique 4.4).', 'Si l’association se révèle nécessaire, une surveillance stricte de la lithémie est recommandée.', 'L’association devra être administrée avec prudence, en particulier chez les personnes âgées.', 'Les patients devront être correctement hydratés, et une surveillance de la fonction rénale devra être envisagée après l’initiation de l’association thérapeutique, puis périodiquement.', 'Répaglinide : l''irbésartan a le potentiel d''inhiber l''OATP1B1.', 'Dans une autre étude aucune interaction pharmacocinétique pertinente n''a été rapportée lorsque les deux médicaments étaient administrés conjointement.', 'Par conséquent, une adaptation de dose du traitement antidiabétique tel que le répaglinide peut être nécessaire (voir rubrique 4.4).']);
  PERFORM pg_temp.jp_fill(m, 'ei', ARRAY['Les interruptions de traitement dues aux événements indésirables d’ordre clinique ou biologique étaient moins fréquentes chez les patients traités par irbésartan (3,3 %) que chez les patients sous pla', 'Fréquence indéterminée : anémie, thrombocytopénie', 'Fréquence indéterminée : réactions d’hypersensibilité, telles que angio-œdème, rash, urticaire, réaction anaphylactique, choc anaphylactique']);
  PERFORM pg_temp.jp_fill(m, 'surv', ARRAY['Un contrôle rapproché du potassium sérique chez les patients à risque est recommandé (voir rubrique 4.5).']);
  -- telmisartan (CIS 66219710, scored)
  m := pg_temp.jp_matrice_by_norm('telmisartan');
  PERFORM pg_temp.jp_detail_set(m, 'Classe pharmacothérapeutique : antagonistes des récepteurs de l’angiotensine II (ARA II), code ATC : C09CA07.');
  PERFORM pg_temp.jp_fill(m, 'ind', ARRAY['Hypertension', 'Traitement de l’hypertension artérielle essentielle chez l’adulte.', 'Prévention cardiovasculaire', 'Réduction de la morbidité cardiovasculaire chez les adultes présentant :', 'une maladie cardiovasculaire athérothrombotique connue (antécédents de coronaropathie, d’accident vasculaire cérébral, ou d’artériopathie périphérique) ou ;', 'un diabète de type 2 avec une atteinte d’organe cible documentée.']);
  PERFORM pg_temp.jp_fill(m, 'ci', ARRAY['Hypersensibilité à la substance active ou à l’un des excipients mentionnés à la rubrique 6.1.', '2ème et 3ème trimestres de la grossesse (voir rubriques 4.4 et 4.6).', 'Obstruction biliaire.', 'Insuffisance hépatique sévère.']);
  PERFORM pg_temp.jp_fill(m, 'pre', ARRAY['Grossesse', 'Les antagonistes des récepteurs de l’angiotensine II (ARA II) ne doivent pas être débutés au cours de la grossesse.', 'En cas de diagnostic de grossesse, le traitement par ARA II doit être arrêté immédiatement et, si nécessaire, un traitement alternatif sera débuté (voir rubriques 4.3 et 4.6).', 'Insuffisance hépatique', 'La clairance hépatique du telmisartan est susceptible d’être réduite chez ces patients.', 'TELMISARTAN ARROW doit être administré avec précaution chez les patients atteints d’insuffisance hépatique légère à modérée.', 'Hypertension rénovasculaire', 'Insuffisance rénale et transplantation rénale', 'En cas d’administration de TELMISARTAN ARROW à des patients atteints d’insuffisance rénale, une surveillance régulière de la kaliémie et du taux de créatinine sérique est recommandée.', 'Aucune donnée n’est disponible sur l’utilisation de TELMISARTAN ARROW chez des patients ayant subi une transplantation rénale récente.', 'Le telmisartan n’est pas éliminé du sang par hémofiltration et n’est pas dialysable.', 'Patients présentant une hypovolémie et/ou une déplétion sodée']);
  PERFORM pg_temp.jp_fill(m, 'inter', ARRAY['Digoxine', 'Lors de l’administration concomitante de telmisartan et de digoxine, une augmentation médiane de la concentration plasmatique maximale (49 %) et minimale (20 %) en digoxine a été observée.', 'Surveiller les taux de digoxine lors de l’initiation, de l’ajustement ou de l’arrêt du telmisartan afin de les maintenir dans la fourchette thérapeutique.', 'Comme pour les autres médicaments agissant sur le système rénine-angiotensine-aldostérone, le telmisartan peut entraîner une hyperkaliémie (voir rubrique 4.4).', 'L’apparition d’une hyperkaliémie dépend des facteurs de risque associés.', 'Les associations médicamenteuses mentionnées ci-dessus augmentent le risque.', 'Le risque est particulièrement élevé pour les associations avec les diurétiques d’épargne potassique et lors d’association avec les sels de régime contenant du potassium.', 'L’association avec les IEC ou les AINS, par exemple, présente un risque moins important si les précautions d’utilisation sont strictement suivies.', 'Associations déconseillées', 'Diurétiques d’épargne potassique et traitements de supplémentation potassique', 'Les antagonistes des récepteurs de l’angiotensine II comme le telmisartan atténuent la perte potassique induite par les diurétiques.', 'Si l’association ne peut être évitée en raison d’une hypokaliémie documentée, leur utilisation doit être prudente et le potassium sérique devra être surveillé fréquemment.']);
  PERFORM pg_temp.jp_fill(m, 'ei', ARRAY['Très fréquent (≥ 1/10) ; fréquent (≥ 1/100, Au sein de chaque groupe de fréquence, les effets indésirables sont présentés suivant un ordre décroissant de gravité.', 'Peu fréquent :']);
  PERFORM pg_temp.jp_fill(m, 'surv', ARRAY['En cas d’administration de TELMISARTAN ARROW à des patients atteints d’insuffisance rénale, une surveillance régulière de la kaliémie et du taux de créatinine sérique est recommandée.']);
  -- olmesartan (CIS 62597926, scored)
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
      ('dabigatran etexilate'),
      ('warfarine'),
      ('acenocoumarol'),
      ('fluindione'),
      ('alteplase'),
      ('phytomenadione'),
      ('acide tranexamique'),
      ('peroxyde d''hydrogene'),
      ('trinitrine'),
      ('molsidomine'),
      ('nicorandil'),
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
      ('digoxine'),
      ('furosemide'),
      ('spironolactone'),
      ('eplerenone'),
      ('naftidrofuryl'),
      ('trimetazidine'),
      ('piribedil'),
      ('fraction flavonoique'),
      ('diosmine'),
      ('troxerutine'),
      ('naftazone'),
      ('adrenaline'),
      ('acebutolol'),
      ('atenolol'),
      ('celiprolol'),
      ('betaxolol'),
      ('pindolol'),
      ('nadolol'),
      ('labetalol'),
      ('tertatolol'),
      ('piretanide'),
      ('bumetanide'),
      ('hydrochlorothiazide'),
      ('indapamide'),
      ('cicletanine'),
      ('amiloride'),
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
      ('olmesartan')
    ) AS l(dci_norm)
  );

INSERT INTO jeupharma.sources_contenu (code, libelle, type_source, description)
VALUES (
  'rcp_bdpm_cardio_deust',
  'RCP BDPM condensé — Cardio DEUST 2A',
  'rcp',
  'Enrichissement matrice 034 : rubriques 4.x / 5.1 BDPM (EI fréquents ou graves). Non publié sur le parcours DEUST.'
)
ON CONFLICT (code) DO NOTHING;

INSERT INTO jeupharma.versions_source (source_id, version_label, statut, notes)
SELECT s.id, 'bdpm-2026-10', 'valide', 'Généré par cardio_rcp_matrice_gen.mjs'
FROM jeupharma.sources_contenu s WHERE s.code = 'rcp_bdpm_cardio_deust'
ON CONFLICT (source_id, version_label) DO NOTHING;

DO $mirror$
DECLARE
  src uuid; ver uuid; r record;
BEGIN
  SELECT s.id, v.id INTO src, ver
  FROM jeupharma.sources_contenu s
  JOIN jeupharma.versions_source v ON v.source_id = s.id AND v.version_label = 'bdpm-2026-10'
  WHERE s.code = 'rcp_bdpm_cardio_deust';

  INSERT INTO jeupharma.connaissances (matrice_id, champ_code, entite_id, texte, texte_norm, statut, source_id, version_source_id, ordre)
  SELECT m.id, 'dci', d.id, d.valeur, d.valeur_norm, 'valide', src, ver, 0
  FROM jeupharma.matrice_medicaments m
  JOIN jeupharma.dcis d ON d.id = m.dci_id AND d.actif
  WHERE m.statut = 'publie'
    AND d.valeur_norm IN (SELECT l.dci_norm FROM (VALUES
      ('sels ferreux'),
      ('acide ascorbique'),
      ('colecalciferol'),
      ('cyanocobalamine'),
      ('acide folique'),
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
      ('dabigatran etexilate'),
      ('warfarine'),
      ('acenocoumarol'),
      ('fluindione'),
      ('alteplase'),
      ('phytomenadione'),
      ('acide tranexamique'),
      ('peroxyde d''hydrogene'),
      ('trinitrine'),
      ('molsidomine'),
      ('nicorandil'),
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
      ('digoxine'),
      ('furosemide'),
      ('spironolactone'),
      ('eplerenone'),
      ('naftidrofuryl'),
      ('trimetazidine'),
      ('piribedil'),
      ('fraction flavonoique'),
      ('diosmine'),
      ('troxerutine'),
      ('naftazone'),
      ('adrenaline'),
      ('acebutolol'),
      ('atenolol'),
      ('celiprolol'),
      ('betaxolol'),
      ('pindolol'),
      ('nadolol'),
      ('labetalol'),
      ('tertatolol'),
      ('piretanide'),
      ('bumetanide'),
      ('hydrochlorothiazide'),
      ('indapamide'),
      ('cicletanine'),
      ('amiloride'),
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
      ('olmesartan')
    ) AS l(dci_norm))
  ON CONFLICT (matrice_id, champ_code, entite_key) WHERE statut <> 'retire' DO NOTHING;

  INSERT INTO jeupharma.connaissances (matrice_id, champ_code, entite_id, texte, texte_norm, statut, source_id, version_source_id, ordre)
  SELECT m.id, 'detail_pharmacologie', e.id, e.valeur, e.valeur_norm, 'valide', src, ver, 0
  FROM jeupharma.matrice_medicaments m
  JOIN jeupharma.details_pharmacologie e ON e.id = m.detail_pharmacologie_id AND e.actif
  JOIN jeupharma.dcis d ON d.id = m.dci_id
  WHERE m.statut = 'publie'
    AND d.valeur_norm IN (SELECT l.dci_norm FROM (VALUES
      ('sels ferreux'),
      ('acide ascorbique'),
      ('colecalciferol'),
      ('cyanocobalamine'),
      ('acide folique'),
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
      ('dabigatran etexilate'),
      ('warfarine'),
      ('acenocoumarol'),
      ('fluindione'),
      ('alteplase'),
      ('phytomenadione'),
      ('acide tranexamique'),
      ('peroxyde d''hydrogene'),
      ('trinitrine'),
      ('molsidomine'),
      ('nicorandil'),
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
      ('digoxine'),
      ('furosemide'),
      ('spironolactone'),
      ('eplerenone'),
      ('naftidrofuryl'),
      ('trimetazidine'),
      ('piribedil'),
      ('fraction flavonoique'),
      ('diosmine'),
      ('troxerutine'),
      ('naftazone'),
      ('adrenaline'),
      ('acebutolol'),
      ('atenolol'),
      ('celiprolol'),
      ('betaxolol'),
      ('pindolol'),
      ('nadolol'),
      ('labetalol'),
      ('tertatolol'),
      ('piretanide'),
      ('bumetanide'),
      ('hydrochlorothiazide'),
      ('indapamide'),
      ('cicletanine'),
      ('amiloride'),
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
      ('olmesartan')
    ) AS l(dci_norm))
  ON CONFLICT (matrice_id, champ_code, entite_key) WHERE statut <> 'retire' DO NOTHING;

  FOR r IN SELECT * FROM (VALUES
    ('nom_commercial',         'matrice_noms_commerciaux',            'nom_commercial_id',         'noms_commerciaux'),
    ('secteur_therapeutique',  'matrice_secteurs_therapeutiques',     'secteur_therapeutique_id',  'secteurs_therapeutiques'),
    ('classe_therapeutique',   'matrice_classes_therapeutiques',      'classe_therapeutique_id',   'classes_therapeutiques'),
    ('classe_pharmacologique', 'matrice_classes_pharmacologiques',    'classe_pharmacologique_id', 'classes_pharmacologiques'),
    ('indications',            'matrice_indications',                 'indication_id',             'indications'),
    ('contre_indications',     'matrice_contre_indications',          'contre_indication_id',      'contre_indications'),
    ('effets_indesirables',    'matrice_effets_indesirables',         'effet_indesirable_id',      'effets_indesirables'),
    ('precautions_emploi',     'matrice_precautions_emploi',          'precaution_emploi_id',      'precautions_emploi'),
    ('interactions',           'matrice_interactions',                'interaction_id',            'interactions'),
    ('surveillances',          'matrice_surveillances',               'surveillance_id',           'surveillances')
  ) AS t(champ, jt, fk, ent)
  LOOP
    EXECUTE format($q$
      INSERT INTO jeupharma.connaissances
        (matrice_id, champ_code, entite_id, texte, texte_norm, statut, source_id, version_source_id, ordre)
      SELECT m.id, %L, e.id, e.valeur, e.valeur_norm, 'valide', $1, $2, j.ordre
      FROM jeupharma.matrice_medicaments m
      JOIN jeupharma.dcis d ON d.id = m.dci_id
      JOIN jeupharma.%I j ON j.matrice_id = m.id
      JOIN jeupharma.%I e ON e.id = j.%I AND e.actif
      WHERE m.statut = 'publie'
        AND d.valeur_norm IN (SELECT l.dci_norm FROM (VALUES
      ('sels ferreux'),
      ('acide ascorbique'),
      ('colecalciferol'),
      ('cyanocobalamine'),
      ('acide folique'),
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
      ('dabigatran etexilate'),
      ('warfarine'),
      ('acenocoumarol'),
      ('fluindione'),
      ('alteplase'),
      ('phytomenadione'),
      ('acide tranexamique'),
      ('peroxyde d''hydrogene'),
      ('trinitrine'),
      ('molsidomine'),
      ('nicorandil'),
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
      ('digoxine'),
      ('furosemide'),
      ('spironolactone'),
      ('eplerenone'),
      ('naftidrofuryl'),
      ('trimetazidine'),
      ('piribedil'),
      ('fraction flavonoique'),
      ('diosmine'),
      ('troxerutine'),
      ('naftazone'),
      ('adrenaline'),
      ('acebutolol'),
      ('atenolol'),
      ('celiprolol'),
      ('betaxolol'),
      ('pindolol'),
      ('nadolol'),
      ('labetalol'),
      ('tertatolol'),
      ('piretanide'),
      ('bumetanide'),
      ('hydrochlorothiazide'),
      ('indapamide'),
      ('cicletanine'),
      ('amiloride'),
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
      ('olmesartan')
        ) AS l(dci_norm))
      ON CONFLICT (matrice_id, champ_code, entite_key) WHERE statut <> 'retire' DO NOTHING
    $q$, r.champ, r.jt, r.ent, r.fk) USING src, ver;
  END LOOP;
END
$mirror$;
