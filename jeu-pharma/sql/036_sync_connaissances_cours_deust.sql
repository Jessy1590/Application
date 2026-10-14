-- =============================================================================
-- 036 : Connaissances « cours » pour le parcours DEUST (sans surplus RCP long)
-- Copie depuis migration_v1_matrice uniquement les libellés courts / structurels
-- (alignés supports DEUST + vocabulaire 015). Le RCP condensé reste sur la matrice.
-- =============================================================================

INSERT INTO jeupharma.versions_source (source_id, version_label, statut, notes)
SELECT s.id, 'deust-corpus-2026-10', 'valide', 'Filtre longueur + champs structurels — visibilité DEUST.'
FROM jeupharma.sources_contenu s WHERE s.code = 'cours_cardio_deust_2a'
ON CONFLICT (source_id, version_label) DO NOTHING;

DO $mig$
DECLARE
  v_migr uuid;
  v_cours uuid;
  v_ver uuid;
  n int;
BEGIN
  SELECT id INTO v_migr FROM jeupharma.sources_contenu WHERE code = 'migration_v1_matrice';
  SELECT id INTO v_cours FROM jeupharma.sources_contenu WHERE code = 'cours_cardio_deust_2a';
  SELECT id INTO v_ver FROM jeupharma.versions_source WHERE source_id = v_cours AND version_label = 'deust-corpus-2026-10';

  CREATE TEMP TABLE _plan_dci (dci_norm text PRIMARY KEY) ON COMMIT DROP;
  INSERT INTO _plan_dci (dci_norm) VALUES
    ('sels ferreux'),('acide ascorbique'),('colecalciferol'),('cyanocobalamine'),
    ('acide folique'),('acide folinique'),('epoetine alfa'),('epoetine beta'),('darbepoetine alfa'),('immunoglobulines anti-d'),
    ('sels ferreux + acide folique'),('acide acetylsalicylique'),('clopidogrel'),('prasugrel'),('ticagrelor'),('clopidogrel + aspirine'),('dipyridamole'),
    ('heparinate de sodium'),('heparinate de calcium'),('dalteparine'),('enoxaparine sodique'),('tinzaparine'),('nadroparine'),
    ('danaparoide'),('fondaparinux'),('rivaroxaban'),('apixaban'),('dabigatran etexilate'),('idarucizumab'),
    ('warfarine'),('acenocoumarol'),('fluindione'),('desirudine'),('lepirudine'),
    ('alteplase'),('tenecteplase'),('reteplase'),('streptokinase'),('urokinase'),
    ('phytomenadione'),('acide tranexamique'),('alginate de calcium'),('peroxyde d''hydrogene'),
    ('trinitrine'),('isosorbide dinitrate'),('molsidomine'),('nicorandil'),('ivabradine'),
    ('nifedipine'),('nicardipine'),('nitrendipine'),('isradipine'),('amlodipine'),('felodipine'),('manidipine'),('lercanidipine'),
    ('verapamil'),('diltiazem'),('carvedilol'),('bisoprolol'),('metoprolol'),('nebivolol'),
    ('atorvastatine'),('enalapril'),('ramipril'),('captopril'),('lisinopril'),('perindopril'),
    ('hydroquinidine'),('disopyramide'),('flecainide'),('propafenone'),('amiodarone'),('sotalol'),
    ('fosinopril'),('losartan'),('valsartan'),('candesartan'),('sacubitril + valsartan'),('dapagliflozine'),('digoxine'),
    ('furosemide'),('spironolactone'),('eplerenone'),('naftidrofuryl'),('trimetazidine'),('piribedil'),
    ('fraction flavonoique'),('diosmine'),('ginkgo biloba'),('troxerutine'),('ruscoside'),('naftazone'),('adrenaline'),
    ('acebutolol'),('atenolol'),('celiprolol'),('betaxolol'),('propranolol'),('pindolol'),('nadolol'),('labetalol'),
    ('timolol'),('tertatolol'),('piretanide'),('bumetanide'),('hydrochlorothiazide'),('indapamide'),('cicletanine'),
    ('amiloride'),('triamterene'),('urapidil'),('prazosine'),('doxazosine'),('minoxidil'),('rilmenidine'),
    ('methyldopa'),('moxonidine'),('clonidine'),('benazepril'),('quinapril'),('trandolapril'),('zofenopril'),
    ('irbesartan'),('telmisartan'),('eprosartan'),('olmesartan');

  INSERT INTO _plan_dci (dci_norm)
  SELECT d.valeur_norm
  FROM jeupharma.matrice_medicaments m
  JOIN jeupharma.dcis d ON d.id = m.dci_id
  WHERE m.statut = 'publie' AND d.valeur_norm LIKE '% + %'
  ON CONFLICT DO NOTHING;

  INSERT INTO jeupharma.connaissances (
    matrice_id, champ_code, entite_id, texte, texte_norm, statut, source_id, version_source_id, ordre
  )
  SELECT
    c.matrice_id, c.champ_code, c.entite_id, c.texte, c.texte_norm, 'valide', v_cours, v_ver, c.ordre
  FROM jeupharma.connaissances c
  JOIN jeupharma.matrice_medicaments m ON m.id = c.matrice_id AND m.statut = 'publie'
  JOIN jeupharma.dcis d ON d.id = m.dci_id
  JOIN _plan_dci p ON p.dci_norm = d.valeur_norm
  WHERE c.source_id = v_migr
    AND c.statut = 'valide'
    AND (
      c.champ_code IN ('dci', 'nom_commercial', 'secteur_therapeutique', 'classe_therapeutique', 'classe_pharmacologique')
      OR (c.champ_code = 'detail_pharmacologie' AND char_length(c.texte) <= 140)
      OR (c.champ_code IN ('indications', 'contre_indications', 'effets_indesirables', 'precautions_emploi', 'interactions', 'surveillances')
          AND char_length(c.texte) <= 55)
    )
  ON CONFLICT (matrice_id, champ_code, entite_key) WHERE statut <> 'retire'
  DO UPDATE SET
    texte = EXCLUDED.texte,
    texte_norm = EXCLUDED.texte_norm,
    source_id = v_cours,
    version_source_id = v_ver,
    statut = 'valide';
  GET DIAGNOSTICS n = ROW_COUNT;

  RAISE NOTICE '036 : connaissances cours (filtre court) upsert=%', n;
END
$mig$;
