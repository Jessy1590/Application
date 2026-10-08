-- 013 : libellés ATC sans codes + classe pharmaco = sous-groupe utile (souvent niveau 4)
-- Ex. Acénocoumarol → Antivitamines K (pas B01A Antithrombotiques)

-- 1. Retirer le préfixe « CODE - » des libellés secteur / CT / CP ATC
UPDATE jeupharma.secteurs_therapeutiques
SET valeur = btrim(regexp_replace(valeur, '^[A-Z][0-9A-Z]*\s*[-–]\s*', '')),
    valeur_norm = jeupharma.normaliser_valeur(btrim(regexp_replace(valeur, '^[A-Z][0-9A-Z]*\s*[-–]\s*', '')))
WHERE valeur ~ '^[A-Z][0-9A-Z]*\s*[-–]\s*';

UPDATE jeupharma.classes_therapeutiques
SET valeur = btrim(regexp_replace(valeur, '^[A-Z][0-9A-Z]*\s*[-–]\s*', '')),
    valeur_norm = jeupharma.normaliser_valeur(btrim(regexp_replace(valeur, '^[A-Z][0-9A-Z]*\s*[-–]\s*', '')))
WHERE valeur ~ '^[A-Z][0-9A-Z]*\s*[-–]\s*';

UPDATE jeupharma.classes_pharmacologiques
SET valeur = btrim(regexp_replace(valeur, '^[A-Z][0-9A-Z]*\s*[-–]\s*', '')),
    valeur_norm = jeupharma.normaliser_valeur(btrim(regexp_replace(valeur, '^[A-Z][0-9A-Z]*\s*[-–]\s*', '')))
WHERE valeur ~ '^[A-Z][0-9A-Z]*\s*[-–]\s*';

-- 2. Libellés CP « simples » (niveau utile)
CREATE TABLE IF NOT EXISTS jeupharma.atc_cp_fix_staging (
  dci text PRIMARY KEY,
  cp_label text NOT NULL
);
TRUNCATE jeupharma.atc_cp_fix_staging;

INSERT INTO jeupharma.atc_cp_fix_staging (dci, cp_label) VALUES
-- B01
('Acénocoumarol', 'Antivitamines K'),
('Warfarine', 'Antivitamines K'),
('Fluindione', 'Antivitamines K'),
('Héparinate de calcium', 'Héparines'),
('Héparinate de sodium', 'Héparines'),
('Énoxaparine sodique', 'Héparines de bas poids moléculaire'),
('Nadroparine', 'Héparines de bas poids moléculaire'),
('Daltéparine', 'Héparines de bas poids moléculaire'),
('Tinzaparine', 'Héparines de bas poids moléculaire'),
('Danaparoïde', 'Héparinoïdes'),
('Fondaparinux', 'Inhibiteurs du facteur Xa'),
('Dabigatran étexilate', 'Inhibiteurs directs de la thrombine'),
('Apixaban', 'Inhibiteurs du facteur Xa'),
('Rivaroxaban', 'Inhibiteurs du facteur Xa'),
('Désirudine', 'Inhibiteurs directs de la thrombine'),
('Lépirudine', 'Inhibiteurs directs de la thrombine'),
('Acide acétylsalicylique', 'Antiagrégants plaquettaires'),
('Clopidogrel', 'Antiagrégants plaquettaires'),
('Prasugrel', 'Antiagrégants plaquettaires'),
('Ticagrélor', 'Antiagrégants plaquettaires'),
('Dipyridamole', 'Antiagrégants plaquettaires'),
('Clopidogrel + aspirine', 'Antiagrégants plaquettaires'),
('Altéplase', 'Thrombolytiques'),
('Ténectéplase', 'Thrombolytiques'),
('Rétéplase', 'Thrombolytiques'),
('Streptokinase', 'Thrombolytiques'),
('Urokinase', 'Thrombolytiques'),
('Acide tranéxamique', 'Antifibrinolytiques'),
('Phytoménadione', 'Vitamine K'),
('Alginate de calcium', 'Hémostatiques locaux'),
('Peroxyde d''hydrogène', 'Hémostatiques locaux'),
('Sels ferreux', 'Préparation à base de fer'),
('Sels ferreux + acide folique', 'Préparation à base de fer'),
('Acide folique', 'Acide folique et dérivés'),
('Acide folinique', 'Acide folique et dérivés'),
('Cyanocobalamine', 'Vitamine B12'),
('Epoétine alfa', 'Érythropoïétines'),
('Epoétine bêta', 'Érythropoïétines'),
('Darbépoétine alfa', 'Érythropoïétines'),
('Idarucizumab', 'Antidotes'),
('Filgrastim', 'Facteurs de croissance leucocytaire'),
('Immunoglobulines anti-D', 'Immunoglobulines spécifiques'),
-- C01
('Digoxine', 'Glycosides cardiotoniques'),
('Disopyramide', 'Antiarythmiques de classe I'),
('Hydroquinidine', 'Antiarythmiques de classe I'),
('Flécaïnide', 'Antiarythmiques de classe I'),
('Propafénone', 'Antiarythmiques de classe I'),
('Amiodarone', 'Antiarythmiques de classe III'),
('Adrénaline', 'Stimulants cardiaques adrénergiques'),
('Trinitrine', 'Dérivés nitrés'),
('Isosorbide dinitrate', 'Dérivés nitrés'),
('Molsidomine', 'Vasodilatateurs utilisés en cardiologie'),
('Nicorandil', 'Vasodilatateurs utilisés en cardiologie'),
('Ivabradine', 'Autres préparations cardiaques'),
('Trimétazidine', 'Autres préparations cardiaques'),
-- C02
('Clonidine', 'Antihypertenseurs centraux'),
('Moxonidine', 'Antihypertenseurs centraux'),
('Rilménidine', 'Antihypertenseurs centraux'),
('Méthyldopa', 'Antihypertenseurs centraux'),
('Prazosine', 'Alpha-bloquants'),
('Doxazosine', 'Alpha-bloquants'),
('Urapidil', 'Alpha-bloquants'),
('Minoxidil', 'Vasodilatateurs artériolaires'),
-- C03
('Hydrochlorothiazide', 'Diurétiques thiazidiques'),
('Indapamide', 'Diurétiques thiazidiques-like'),
('Ciclétanine', 'Diurétiques thiazidiques-like'),
('Furosémide', 'Diurétiques de l''anse'),
('Bumétanide', 'Diurétiques de l''anse'),
('Pirétanide', 'Diurétiques de l''anse'),
('Spironolactone', 'Antagonistes de l''aldostérone'),
('Éplérénone', 'Antagonistes de l''aldostérone'),
('Amiloride', 'Diurétiques épargneurs de potassium'),
('Amiloride + hydrochlorothiazide', 'Associations de diurétiques'),
('Amiloride + furosémide', 'Associations de diurétiques'),
('Spironolactone + altizide', 'Associations de diurétiques'),
('Triamtérène + hydrochlorothiazide', 'Associations de diurétiques'),
('Triamtérène + méthyclothiazide', 'Associations de diurétiques'),
-- C04 / C05
('Naftidrofuryl', 'Vasodilatateurs périphériques'),
('Ginkgo biloba', 'Vasodilatateurs périphériques'),
('Diosmine', 'Veinotoniques / bioflavonoïdes'),
('Fraction flavonoïque', 'Veinotoniques / bioflavonoïdes'),
('Troxérutine', 'Veinotoniques / bioflavonoïdes'),
('Naftazone', 'Veinotoniques / bioflavonoïdes'),
('Ruscoside', 'Veinotoniques / bioflavonoïdes'),
-- C07
('Propranolol', 'Bêtabloquants non sélectifs'),
('Nadolol', 'Bêtabloquants non sélectifs'),
('Pindolol', 'Bêtabloquants non sélectifs'),
('Timolol', 'Bêtabloquants non sélectifs'),
('Tertatolol', 'Bêtabloquants non sélectifs'),
('Sotalol', 'Bêtabloquants non sélectifs'),
('Acébutolol', 'Bêtabloquants sélectifs'),
('Aténolol', 'Bêtabloquants sélectifs'),
('Bétaxolol', 'Bêtabloquants sélectifs'),
('Bisoprolol', 'Bêtabloquants sélectifs'),
('Céliprolol', 'Bêtabloquants sélectifs'),
('Métoprolol', 'Bêtabloquants sélectifs'),
('Nébivolol', 'Bêtabloquants sélectifs'),
('Labétalol', 'Alpha- et bêtabloquants'),
('Carvédilol', 'Alpha- et bêtabloquants'),
('Aténolol + chlortalidone', 'Bêtabloquants et diurétiques'),
('Bisoprolol + hydrochlorothiazide', 'Bêtabloquants et diurétiques'),
('Métoprolol + chlortalidone', 'Bêtabloquants et diurétiques'),
('Nébivolol + hydrochlorothiazide', 'Bêtabloquants et diurétiques'),
('Timolol + amiloride + hydrochlorothiazide', 'Bêtabloquants et diurétiques'),
('Aténolol + nifédipine', 'Bêtabloquants et inhibiteurs calciques'),
('Félodipine + métoprolol', 'Bêtabloquants et inhibiteurs calciques'),
-- C08
('Amlodipine', 'Inhibiteurs calciques dihydropyridines'),
('Félodipine', 'Inhibiteurs calciques dihydropyridines'),
('Isradipine', 'Inhibiteurs calciques dihydropyridines'),
('Lercanidipine', 'Inhibiteurs calciques dihydropyridines'),
('Manidipine', 'Inhibiteurs calciques dihydropyridines'),
('Nicardipine', 'Inhibiteurs calciques dihydropyridines'),
('Nifédipine', 'Inhibiteurs calciques dihydropyridines'),
('Nitrendipine', 'Inhibiteurs calciques dihydropyridines'),
('Vérapamil', 'Inhibiteurs calciques non dihydropyridines'),
('Diltiazem', 'Inhibiteurs calciques non dihydropyridines'),
('Amlodipine + atorvastatine', 'Inhibiteurs calciques dihydropyridines'),
('Amlodipine + indapamide', 'Inhibiteurs calciques dihydropyridines'),
-- C09
('Captopril', 'Inhibiteurs de l''enzyme de conversion'),
('Enalapril', 'Inhibiteurs de l''enzyme de conversion'),
('Lisinopril', 'Inhibiteurs de l''enzyme de conversion'),
('Perindopril', 'Inhibiteurs de l''enzyme de conversion'),
('Ramipril', 'Inhibiteurs de l''enzyme de conversion'),
('Quinapril', 'Inhibiteurs de l''enzyme de conversion'),
('Fosinopril', 'Inhibiteurs de l''enzyme de conversion'),
('Trandolapril', 'Inhibiteurs de l''enzyme de conversion'),
('Bénazépril', 'Inhibiteurs de l''enzyme de conversion'),
('Zofénopril', 'Inhibiteurs de l''enzyme de conversion'),
('Captopril + hydrochlorothiazide', 'IEC en association'),
('Énalapril + hydrochlorothiazide', 'IEC en association'),
('Lisinopril + hydrochlorothiazide', 'IEC en association'),
('Périndopril + indapamide', 'IEC en association'),
('Ramipril + hydrochlorothiazide', 'IEC en association'),
('Quinapril + hydrochlorothiazide', 'IEC en association'),
('Fosinopril + hydrochlorothiazide', 'IEC en association'),
('Bénazépril + hydrochlorothiazide', 'IEC en association'),
('Zofénopril + hydrochlorothiazide', 'IEC en association'),
('Périndopril + amlodipine', 'IEC en association'),
('Ramipril + amlodipine', 'IEC en association'),
('Énalapril + lercanidipine', 'IEC en association'),
('Vérapamil + trandolapril', 'IEC en association'),
('Losartan', 'Antagonistes de l''angiotensine II'),
('Valsartan', 'Antagonistes de l''angiotensine II'),
('Irbésartan', 'Antagonistes de l''angiotensine II'),
('Candésartan', 'Antagonistes de l''angiotensine II'),
('Telmisartan', 'Antagonistes de l''angiotensine II'),
('Olmésartan', 'Antagonistes de l''angiotensine II'),
('Éprosartan', 'Antagonistes de l''angiotensine II'),
('Losartan + hydrochlorothiazide', 'Antagonistes de l''angiotensine II en association'),
('Valsartan + hydrochlorothiazide', 'Antagonistes de l''angiotensine II en association'),
('Irbésartan + hydrochlorothiazide', 'Antagonistes de l''angiotensine II en association'),
('Candésartan + hydrochlorothiazide', 'Antagonistes de l''angiotensine II en association'),
('Telmisartan + hydrochlorothiazide', 'Antagonistes de l''angiotensine II en association'),
('Olmésartan + hydrochlorothiazide', 'Antagonistes de l''angiotensine II en association'),
('Valsartan + amlodipine', 'Antagonistes de l''angiotensine II en association'),
('Irbésartan + amlodipine', 'Antagonistes de l''angiotensine II en association'),
('Olmésartan + amlodipine', 'Antagonistes de l''angiotensine II en association'),
('Telmisartan + amlodipine', 'Antagonistes de l''angiotensine II en association'),
('Sacubitril + valsartan', 'Inhibiteurs de l''angiotensine et de la néprilysine'),
('Dapagliflozine', 'Inhibiteurs du SGLT2'),
('Piribedil', 'Agonistes dopaminergiques')
ON CONFLICT (dci) DO UPDATE SET cp_label = EXCLUDED.cp_label;

-- CP supplémentaires pour associations multi (2e classe)
-- Caduet : aussi hypolipémiant ; Natrixam : aussi diurétique thiazidique-like
CREATE TABLE IF NOT EXISTS jeupharma.atc_cp_extra_staging (
  dci text NOT NULL,
  cp_label text NOT NULL,
  ordre int NOT NULL DEFAULT 1,
  PRIMARY KEY (dci, cp_label)
);
TRUNCATE jeupharma.atc_cp_extra_staging;
INSERT INTO jeupharma.atc_cp_extra_staging (dci, cp_label, ordre) VALUES
('Amlodipine + atorvastatine', 'Inhibiteurs de la HMG-CoA réductase', 1),
('Amlodipine + indapamide', 'Diurétiques thiazidiques-like', 1),
('Sels ferreux + acide folique', 'Acide folique et dérivés', 1),
('Vérapamil + trandolapril', 'Inhibiteurs calciques non dihydropyridines', 1)
ON CONFLICT DO NOTHING;

-- 3. Remplacer les CP des fiches mappées
DO $$
DECLARE
  rec record;
  mid uuid;
  eid uuid;
  ex record;
BEGIN
  FOR rec IN
    SELECT m.id AS matrice_id, fix.cp_label
    FROM jeupharma.matrice_medicaments m
    JOIN jeupharma.dcis d ON d.id = m.dci_id
    JOIN jeupharma.atc_cp_fix_staging fix ON jeupharma.normaliser_valeur(fix.dci) = d.valeur_norm
    WHERE m.statut = 'publie'
  LOOP
    mid := rec.matrice_id;
    DELETE FROM jeupharma.matrice_classes_pharmacologiques WHERE matrice_id = mid;
    eid := jeupharma.atc_upsert_entite('classes_pharmacologiques', rec.cp_label);
    INSERT INTO jeupharma.matrice_classes_pharmacologiques (matrice_id, classe_pharmacologique_id, ordre)
    VALUES (mid, eid, 0)
    ON CONFLICT DO NOTHING;

    FOR ex IN
      SELECT e.cp_label, e.ordre
      FROM jeupharma.atc_cp_extra_staging e
      JOIN jeupharma.dcis d2 ON jeupharma.normaliser_valeur(e.dci) = d2.valeur_norm
      JOIN jeupharma.matrice_medicaments m2 ON m2.dci_id = d2.id AND m2.id = mid
    LOOP
      eid := jeupharma.atc_upsert_entite('classes_pharmacologiques', ex.cp_label);
      INSERT INTO jeupharma.matrice_classes_pharmacologiques (matrice_id, classe_pharmacologique_id, ordre)
      VALUES (mid, eid, ex.ordre)
      ON CONFLICT DO NOTHING;
    END LOOP;

    UPDATE jeupharma.matrice_medicaments
    SET classe_pharmacologique_id = (
      SELECT j.classe_pharmacologique_id FROM jeupharma.matrice_classes_pharmacologiques j
      WHERE j.matrice_id = mid ORDER BY j.ordre LIMIT 1
    )
    WHERE id = mid;
  END LOOP;
END $$;

-- 4. CT : retirer codes déjà fait ; s'assurer libellés CT sans code pour les ATC restantes
-- (déjà via UPDATE regexp)

-- Secteurs : fusion éventuelle doublons après rename (valeur_norm collision)
-- Laissé manuel si collision unique index.
