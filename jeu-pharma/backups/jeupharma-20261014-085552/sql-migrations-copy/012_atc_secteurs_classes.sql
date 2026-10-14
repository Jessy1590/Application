-- Jeu Pharma — 012 : alignement secteur / CT / CP sur l'ATC
-- Décisions user : dapagliflozine A+C ; piribedil → N ; filgrastim/Ig/idarucizumab ATC ;
-- BB et anti-angoreux → ATC strict ; associations = plusieurs ATC.
-- Format libellés : « CODE - Libellé » (ex. C03C - Diurétiques de l'anse).

-- =============================================================================
-- 1. Multi-secteurs (jonction + sync FK)
-- =============================================================================

CREATE TABLE IF NOT EXISTS jeupharma.matrice_secteurs_therapeutiques (
  matrice_id uuid NOT NULL REFERENCES jeupharma.matrice_medicaments(id) ON DELETE CASCADE,
  secteur_therapeutique_id uuid NOT NULL REFERENCES jeupharma.secteurs_therapeutiques(id) ON DELETE CASCADE,
  ordre int NOT NULL DEFAULT 0,
  PRIMARY KEY (matrice_id, secteur_therapeutique_id)
);

CREATE INDEX IF NOT EXISTS matrice_secteurs_therapeutiques_secteur_idx
  ON jeupharma.matrice_secteurs_therapeutiques (secteur_therapeutique_id);

INSERT INTO jeupharma.matrice_secteurs_therapeutiques (matrice_id, secteur_therapeutique_id, ordre)
SELECT m.id, m.secteur_therapeutique_id, 0
FROM jeupharma.matrice_medicaments m
WHERE m.secteur_therapeutique_id IS NOT NULL
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION jeupharma.trg_sync_secteur_fk()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  mid uuid;
BEGIN
  mid := COALESCE(NEW.matrice_id, OLD.matrice_id);
  UPDATE jeupharma.matrice_medicaments m
  SET secteur_therapeutique_id = (
    SELECT j.secteur_therapeutique_id
    FROM jeupharma.matrice_secteurs_therapeutiques j
    WHERE j.matrice_id = mid
    ORDER BY j.ordre, j.secteur_therapeutique_id
    LIMIT 1
  )
  WHERE m.id = mid;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_matrice_secteurs_sync ON jeupharma.matrice_secteurs_therapeutiques;
CREATE TRIGGER trg_matrice_secteurs_sync
AFTER INSERT OR UPDATE OR DELETE ON jeupharma.matrice_secteurs_therapeutiques
FOR EACH ROW EXECUTE FUNCTION jeupharma.trg_sync_secteur_fk();

ALTER TABLE jeupharma.matrice_secteurs_therapeutiques ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS matrice_secteurs_select ON jeupharma.matrice_secteurs_therapeutiques;
CREATE POLICY matrice_secteurs_select ON jeupharma.matrice_secteurs_therapeutiques
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS matrice_secteurs_write ON jeupharma.matrice_secteurs_therapeutiques;
CREATE POLICY matrice_secteurs_write ON jeupharma.matrice_secteurs_therapeutiques
  FOR ALL TO authenticated
  USING (portail.is_admin())
  WITH CHECK (portail.is_admin());
GRANT SELECT, INSERT, UPDATE, DELETE ON jeupharma.matrice_secteurs_therapeutiques TO authenticated;
GRANT ALL ON jeupharma.matrice_secteurs_therapeutiques TO service_role;

-- =============================================================================
-- 2. Helpers entités ATC
-- =============================================================================

CREATE OR REPLACE FUNCTION jeupharma.atc_upsert_entite(p_table text, p_valeur text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = jeupharma, public
AS $$
DECLARE
  v_id uuid;
  v_norm text;
BEGIN
  IF p_valeur IS NULL OR btrim(p_valeur) = '' THEN
    RETURN NULL;
  END IF;
  v_norm := jeupharma.normaliser_valeur(p_valeur);
  IF p_table = 'secteurs_therapeutiques' THEN
    SELECT id INTO v_id FROM jeupharma.secteurs_therapeutiques WHERE actif AND valeur_norm = v_norm LIMIT 1;
    IF v_id IS NULL THEN
      INSERT INTO jeupharma.secteurs_therapeutiques (valeur, valeur_norm, niveaux_connus, actif)
      VALUES (p_valeur, v_norm, ARRAY[]::text[], true)
      RETURNING id INTO v_id;
    END IF;
  ELSIF p_table = 'classes_therapeutiques' THEN
    SELECT id INTO v_id FROM jeupharma.classes_therapeutiques WHERE actif AND valeur_norm = v_norm LIMIT 1;
    IF v_id IS NULL THEN
      INSERT INTO jeupharma.classes_therapeutiques (valeur, valeur_norm, niveaux_connus, actif)
      VALUES (p_valeur, v_norm, ARRAY[]::text[], true)
      RETURNING id INTO v_id;
    END IF;
  ELSIF p_table = 'classes_pharmacologiques' THEN
    SELECT id INTO v_id FROM jeupharma.classes_pharmacologiques WHERE actif AND valeur_norm = v_norm LIMIT 1;
    IF v_id IS NULL THEN
      INSERT INTO jeupharma.classes_pharmacologiques (valeur, valeur_norm, niveaux_connus, actif)
      VALUES (p_valeur, v_norm, ARRAY[]::text[], true)
      RETURNING id INTO v_id;
    END IF;
  ELSE
    RAISE EXCEPTION 'table inconnue %', p_table;
  END IF;
  RETURN v_id;
END;
$$;

-- Renommer secteurs existants vers libellés ATC
UPDATE jeupharma.secteurs_therapeutiques
SET valeur = 'B - Sang et organes hématopoïétiques',
    valeur_norm = jeupharma.normaliser_valeur('B - Sang et organes hématopoïétiques')
WHERE valeur_norm = jeupharma.normaliser_valeur('Sang')
   OR valeur = 'Sang';

UPDATE jeupharma.secteurs_therapeutiques
SET valeur = 'C - Système cardiovasculaire',
    valeur_norm = jeupharma.normaliser_valeur('C - Système cardiovasculaire')
WHERE valeur_norm = jeupharma.normaliser_valeur('Cardiovasculaire')
   OR valeur = 'Cardiovasculaire';

SELECT jeupharma.atc_upsert_entite('secteurs_therapeutiques', 'A - Voies digestives et métabolisme');
SELECT jeupharma.atc_upsert_entite('secteurs_therapeutiques', 'J - Anti-infectieux généraux à usage systémique');
SELECT jeupharma.atc_upsert_entite('secteurs_therapeutiques', 'L - Antinéoplasiques et immunomodulateurs');
SELECT jeupharma.atc_upsert_entite('secteurs_therapeutiques', 'N - Système nerveux');
SELECT jeupharma.atc_upsert_entite('secteurs_therapeutiques', 'V - Divers');

-- =============================================================================
-- 3. Table de mapping DCI → codes ATC (secteurs / CT / CP séparés par |)
-- =============================================================================

CREATE TABLE IF NOT EXISTS jeupharma.atc_map_staging (
  dci text PRIMARY KEY,
  secteurs text NOT NULL,
  cts text NOT NULL,
  cps text NOT NULL
);
TRUNCATE jeupharma.atc_map_staging;

INSERT INTO jeupharma.atc_map_staging (dci, secteurs, cts, cps) VALUES
-- Sang / B
('Acénocoumarol', 'B', 'B01', 'B01A'),
('Warfarine', 'B', 'B01', 'B01A'),
('Fluindione', 'B', 'B01', 'B01A'),
('Héparinate de calcium', 'B', 'B01', 'B01A'),
('Héparinate de sodium', 'B', 'B01', 'B01A'),
('Énoxaparine sodique', 'B', 'B01', 'B01A'),
('Nadroparine', 'B', 'B01', 'B01A'),
('Daltéparine', 'B', 'B01', 'B01A'),
('Tinzaparine', 'B', 'B01', 'B01A'),
('Danaparoïde', 'B', 'B01', 'B01A'),
('Fondaparinux', 'B', 'B01', 'B01A'),
('Dabigatran étexilate', 'B', 'B01', 'B01A'),
('Apixaban', 'B', 'B01', 'B01A'),
('Rivaroxaban', 'B', 'B01', 'B01A'),
('Désirudine', 'B', 'B01', 'B01A'),
('Lépirudine', 'B', 'B01', 'B01A'),
('Acide acétylsalicylique', 'B', 'B01', 'B01A'),
('Clopidogrel', 'B', 'B01', 'B01A'),
('Prasugrel', 'B', 'B01', 'B01A'),
('Ticagrélor', 'B', 'B01', 'B01A'),
('Dipyridamole', 'B', 'B01', 'B01A'),
('Clopidogrel + aspirine', 'B', 'B01', 'B01A'),
('Altéplase', 'B', 'B01', 'B01A'),
('Ténectéplase', 'B', 'B01', 'B01A'),
('Rétéplase', 'B', 'B01', 'B01A'),
('Streptokinase', 'B', 'B01', 'B01A'),
('Urokinase', 'B', 'B01', 'B01A'),
('Acide tranéxamique', 'B', 'B02', 'B02A'),
('Phytoménadione', 'B', 'B02', 'B02B'),
('Alginate de calcium', 'B', 'B02', 'B02B'),
('Peroxyde d''hydrogène', 'B', 'B02', 'B02B'),
('Sels ferreux', 'B', 'B03', 'B03A'),
('Sels ferreux + acide folique', 'B', 'B03', 'B03A|B03B'),
('Acide folique', 'B', 'B03', 'B03B'),
('Acide folinique', 'B', 'B03', 'B03B'),
('Cyanocobalamine', 'B', 'B03', 'B03B'),
('Epoétine alfa', 'B', 'B03', 'B03X'),
('Epoétine bêta', 'B', 'B03', 'B03X'),
('Darbépoétine alfa', 'B', 'B03', 'B03X'),
('Idarucizumab', 'V', 'V03', 'V03A'),
('Filgrastim', 'L', 'L03', 'L03A'),
('Immunoglobulines anti-D', 'J', 'J06', 'J06B'),
-- CV / C — digitaliques / antiarythmiques / nitrés
('Digoxine', 'C', 'C01', 'C01A'),
('Disopyramide', 'C', 'C01', 'C01B'),
('Hydroquinidine', 'C', 'C01', 'C01B'),
('Flécaïnide', 'C', 'C01', 'C01B'),
('Propafénone', 'C', 'C01', 'C01B'),
('Amiodarone', 'C', 'C01', 'C01B'),
('Adrénaline', 'C', 'C01', 'C01C'),
('Trinitrine', 'C', 'C01', 'C01D'),
('Isosorbide dinitrate', 'C', 'C01', 'C01D'),
('Molsidomine', 'C', 'C01', 'C01D'),
('Nicorandil', 'C', 'C01', 'C01D'),
('Ivabradine', 'C', 'C01', 'C01E'),
('Trimétazidine', 'C', 'C01', 'C01E'),
-- Antihypertenseurs C02
('Clonidine', 'C', 'C02', 'C02A'),
('Moxonidine', 'C', 'C02', 'C02A'),
('Rilménidine', 'C', 'C02', 'C02A'),
('Méthyldopa', 'C', 'C02', 'C02A'),
('Prazosine', 'C', 'C02', 'C02C'),
('Doxazosine', 'C', 'C02', 'C02C'),
('Urapidil', 'C', 'C02', 'C02C'),
('Minoxidil', 'C', 'C02', 'C02D'),
-- Diurétiques C03
('Hydrochlorothiazide', 'C', 'C03', 'C03A'),
('Indapamide', 'C', 'C03', 'C03B'),
('Ciclétanine', 'C', 'C03', 'C03B'),
('Furosémide', 'C', 'C03', 'C03C'),
('Bumétanide', 'C', 'C03', 'C03C'),
('Pirétanide', 'C', 'C03', 'C03C'),
('Spironolactone', 'C', 'C03', 'C03D'),
('Éplérénone', 'C', 'C03', 'C03D'),
('Amiloride', 'C', 'C03', 'C03D'),
('Amiloride + hydrochlorothiazide', 'C', 'C03', 'C03E'),
('Amiloride + furosémide', 'C', 'C03', 'C03E'),
('Spironolactone + altizide', 'C', 'C03', 'C03E'),
('Triamtérène + hydrochlorothiazide', 'C', 'C03', 'C03E'),
('Triamtérène + méthyclothiazide', 'C', 'C03', 'C03E'),
-- Vasodilatateurs périphériques / veinotoniques
('Naftidrofuryl', 'C', 'C04', 'C04A'),
('Diosmine', 'C', 'C05', 'C05C'),
('Fraction flavonoïque', 'C', 'C05', 'C05C'),
('Troxérutine', 'C', 'C05', 'C05C'),
('Naftazone', 'C', 'C05', 'C05C'),
('Ruscoside', 'C', 'C05', 'C05C'),
('Ginkgo biloba', 'C', 'C04', 'C04A'),
-- Bêtabloquants C07
('Propranolol', 'C', 'C07', 'C07A'),
('Nadolol', 'C', 'C07', 'C07A'),
('Pindolol', 'C', 'C07', 'C07A'),
('Timolol', 'C', 'C07', 'C07A'),
('Tertatolol', 'C', 'C07', 'C07A'),
('Sotalol', 'C', 'C07', 'C07A'),
('Acébutolol', 'C', 'C07', 'C07A'),
('Aténolol', 'C', 'C07', 'C07A'),
('Bétaxolol', 'C', 'C07', 'C07A'),
('Bisoprolol', 'C', 'C07', 'C07A'),
('Céliprolol', 'C', 'C07', 'C07A'),
('Métoprolol', 'C', 'C07', 'C07A'),
('Nébivolol', 'C', 'C07', 'C07A'),
('Labétalol', 'C', 'C07', 'C07A'),
('Carvédilol', 'C', 'C07', 'C07A'),
('Aténolol + chlortalidone', 'C', 'C07', 'C07B'),
('Bisoprolol + hydrochlorothiazide', 'C', 'C07', 'C07B'),
('Métoprolol + chlortalidone', 'C', 'C07', 'C07B'),
('Nébivolol + hydrochlorothiazide', 'C', 'C07', 'C07B'),
('Timolol + amiloride + hydrochlorothiazide', 'C', 'C07', 'C07B'),
('Aténolol + nifédipine', 'C', 'C07', 'C07F'),
('Félodipine + métoprolol', 'C', 'C07', 'C07F'),
-- Inhibiteurs calciques C08
('Amlodipine', 'C', 'C08', 'C08C'),
('Félodipine', 'C', 'C08', 'C08C'),
('Isradipine', 'C', 'C08', 'C08C'),
('Lercanidipine', 'C', 'C08', 'C08C'),
('Manidipine', 'C', 'C08', 'C08C'),
('Nicardipine', 'C', 'C08', 'C08C'),
('Nifédipine', 'C', 'C08', 'C08C'),
('Nitrendipine', 'C', 'C08', 'C08C'),
('Vérapamil', 'C', 'C08', 'C08D'),
('Diltiazem', 'C', 'C08', 'C08D'),
('Amlodipine + atorvastatine', 'C', 'C08|C10', 'C08C|C10A'),
('Amlodipine + indapamide', 'C', 'C08|C03', 'C08C|C03B'),
-- SRA C09
('Captopril', 'C', 'C09', 'C09A'),
('Enalapril', 'C', 'C09', 'C09A'),
('Lisinopril', 'C', 'C09', 'C09A'),
('Perindopril', 'C', 'C09', 'C09A'),
('Ramipril', 'C', 'C09', 'C09A'),
('Quinapril', 'C', 'C09', 'C09A'),
('Fosinopril', 'C', 'C09', 'C09A'),
('Trandolapril', 'C', 'C09', 'C09A'),
('Bénazépril', 'C', 'C09', 'C09A'),
('Zofénopril', 'C', 'C09', 'C09A'),
('Captopril + hydrochlorothiazide', 'C', 'C09', 'C09B'),
('Énalapril + hydrochlorothiazide', 'C', 'C09', 'C09B'),
('Lisinopril + hydrochlorothiazide', 'C', 'C09', 'C09B'),
('Périndopril + indapamide', 'C', 'C09', 'C09B'),
('Ramipril + hydrochlorothiazide', 'C', 'C09', 'C09B'),
('Quinapril + hydrochlorothiazide', 'C', 'C09', 'C09B'),
('Fosinopril + hydrochlorothiazide', 'C', 'C09', 'C09B'),
('Bénazépril + hydrochlorothiazide', 'C', 'C09', 'C09B'),
('Zofénopril + hydrochlorothiazide', 'C', 'C09', 'C09B'),
('Périndopril + amlodipine', 'C', 'C09', 'C09B'),
('Ramipril + amlodipine', 'C', 'C09', 'C09B'),
('Énalapril + lercanidipine', 'C', 'C09', 'C09B'),
('Vérapamil + trandolapril', 'C', 'C09|C08', 'C09B|C08D'),
('Losartan', 'C', 'C09', 'C09C'),
('Valsartan', 'C', 'C09', 'C09C'),
('Irbésartan', 'C', 'C09', 'C09C'),
('Candésartan', 'C', 'C09', 'C09C'),
('Telmisartan', 'C', 'C09', 'C09C'),
('Olmésartan', 'C', 'C09', 'C09C'),
('Éprosartan', 'C', 'C09', 'C09C'),
('Losartan + hydrochlorothiazide', 'C', 'C09', 'C09D'),
('Valsartan + hydrochlorothiazide', 'C', 'C09', 'C09D'),
('Irbésartan + hydrochlorothiazide', 'C', 'C09', 'C09D'),
('Candésartan + hydrochlorothiazide', 'C', 'C09', 'C09D'),
('Telmisartan + hydrochlorothiazide', 'C', 'C09', 'C09D'),
('Olmésartan + hydrochlorothiazide', 'C', 'C09', 'C09D'),
('Valsartan + amlodipine', 'C', 'C09', 'C09D'),
('Irbésartan + amlodipine', 'C', 'C09', 'C09D'),
('Olmésartan + amlodipine', 'C', 'C09', 'C09D'),
('Telmisartan + amlodipine', 'C', 'C09', 'C09D'),
('Sacubitril + valsartan', 'C', 'C09', 'C09D'),
-- Dapagliflozine : secteurs A+C, CT/CP ATC A10
('Dapagliflozine', 'A|C', 'A10', 'A10B'),
-- Piribedil → N
('Piribedil', 'N', 'N04', 'N04B')
ON CONFLICT (dci) DO UPDATE SET secteurs = EXCLUDED.secteurs, cts = EXCLUDED.cts, cps = EXCLUDED.cps;

-- Libellés ATC niveau 1/2/3
CREATE TABLE IF NOT EXISTS jeupharma.atc_labels_staging (
  code text PRIMARY KEY,
  kind text NOT NULL,
  label text NOT NULL
);
TRUNCATE jeupharma.atc_labels_staging;

INSERT INTO jeupharma.atc_labels_staging (code, kind, label) VALUES
('A', 'secteur', 'A - Voies digestives et métabolisme'),
('B', 'secteur', 'B - Sang et organes hématopoïétiques'),
('C', 'secteur', 'C - Système cardiovasculaire'),
('J', 'secteur', 'J - Anti-infectieux généraux à usage systémique'),
('L', 'secteur', 'L - Antinéoplasiques et immunomodulateurs'),
('N', 'secteur', 'N - Système nerveux'),
('V', 'secteur', 'V - Divers'),
('A10', 'ct', 'A10 - Médicaments du diabète'),
('B01', 'ct', 'B01 - Antithrombotiques'),
('B02', 'ct', 'B02 - Antihémorragiques'),
('B03', 'ct', 'B03 - Antianémiques'),
('C01', 'ct', 'C01 - Thérapie cardiaque'),
('C02', 'ct', 'C02 - Antihypertenseurs'),
('C03', 'ct', 'C03 - Diurétiques'),
('C04', 'ct', 'C04 - Vasodilatateurs périphériques'),
('C05', 'ct', 'C05 - Vasoprotecteurs'),
('C07', 'ct', 'C07 - Agents bêtabloquants'),
('C08', 'ct', 'C08 - Inhibiteurs calciques'),
('C09', 'ct', 'C09 - Agents agissant sur le système rénine-angiotensine'),
('C10', 'ct', 'C10 - Agents modifiant les lipides'),
('J06', 'ct', 'J06 - Sérums immuns et immunoglobulines'),
('L03', 'ct', 'L03 - Immunostimulants'),
('N04', 'ct', 'N04 - Antiparkinsoniens'),
('V03', 'ct', 'V03 - Tous les autres produits thérapeutiques'),
('A10B', 'cp', 'A10B - Antidiabétiques, sauf insulines'),
('B01A', 'cp', 'B01A - Antithrombotiques'),
('B02A', 'cp', 'B02A - Antifibrinolytiques'),
('B02B', 'cp', 'B02B - Vitamine K et autres hémostatiques'),
('B03A', 'cp', 'B03A - Préparations à base de fer'),
('B03B', 'cp', 'B03B - Vitamine B12 et acide folique'),
('B03X', 'cp', 'B03X - Autres antianémiques'),
('C01A', 'cp', 'C01A - Glycosides cardiotoniques'),
('C01B', 'cp', 'C01B - Antiarythmiques, classes I et III'),
('C01C', 'cp', 'C01C - Stimulants cardiaques excl. glycosides cardiotoniques'),
('C01D', 'cp', 'C01D - Vasodilatateurs utilisés en cardiologie'),
('C01E', 'cp', 'C01E - Autres préparations cardiaques'),
('C02A', 'cp', 'C02A - Agents antiadrénergiques à action centrale'),
('C02C', 'cp', 'C02C - Agents antiadrénergiques à action périphérique'),
('C02D', 'cp', 'C02D - Agents agissant sur le muscle lisse artériolaire'),
('C03A', 'cp', 'C03A - Thiazidiques, plain'),
('C03B', 'cp', 'C03B - Thiazidiques-like / sulfamides, plain'),
('C03C', 'cp', 'C03C - Diurétiques de l''anse'),
('C03D', 'cp', 'C03D - Diurétiques épargneurs de potassium, plain'),
('C03E', 'cp', 'C03E - Diurétiques et épargneurs de potassium en association'),
('C04A', 'cp', 'C04A - Vasodilatateurs périphériques'),
('C05C', 'cp', 'C05C - Médicaments agissant sur les capillaires'),
('C07A', 'cp', 'C07A - Agents bêtabloquants'),
('C07B', 'cp', 'C07B - Agents bêtabloquants et thiazidiques'),
('C07F', 'cp', 'C07F - Agents bêtabloquants et autres antihypertenseurs'),
('C08C', 'cp', 'C08C - Inhibiteurs calciques sélectifs à effets vasculaires'),
('C08D', 'cp', 'C08D - Inhibiteurs calciques sélectifs à effets cardiaques directs'),
('C09A', 'cp', 'C09A - Inhibiteurs de l''enzyme de conversion (IEC), plain'),
('C09B', 'cp', 'C09B - IEC en association'),
('C09C', 'cp', 'C09C - Antagonistes de l''angiotensine II, plain'),
('C09D', 'cp', 'C09D - Antagonistes de l''angiotensine II en association'),
('C10A', 'cp', 'C10A - Agents modifiant les lipides, plain'),
('J06B', 'cp', 'J06B - Immunoglobulines'),
('L03A', 'cp', 'L03A - Immunostimulants'),
('N04B', 'cp', 'N04B - Agents dopaminergiques'),
('V03A', 'cp', 'V03A - Tous les autres produits thérapeutiques')
ON CONFLICT (code) DO UPDATE SET label = EXCLUDED.label, kind = EXCLUDED.kind;

-- Upsert tous les libellés
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM jeupharma.atc_labels_staging LOOP
    IF r.kind = 'secteur' THEN
      PERFORM jeupharma.atc_upsert_entite('secteurs_therapeutiques', r.label);
    ELSIF r.kind = 'ct' THEN
      PERFORM jeupharma.atc_upsert_entite('classes_therapeutiques', r.label);
    ELSIF r.kind = 'cp' THEN
      PERFORM jeupharma.atc_upsert_entite('classes_pharmacologiques', r.label);
    END IF;
  END LOOP;
END $$;

-- =============================================================================
-- 4. Appliquer le mapping aux fiches publiées (remplace CT/CP/secteurs)
-- =============================================================================

DO $$
DECLARE
  rec record;
  mid uuid;
  atc_code text;
  lbl text;
  eid uuid;
  ord int;
BEGIN
  FOR rec IN
    SELECT m.id AS matrice_id, d.valeur AS dci, am.secteurs, am.cts, am.cps
    FROM jeupharma.matrice_medicaments m
    JOIN jeupharma.dcis d ON d.id = m.dci_id
    JOIN jeupharma.atc_map_staging am ON jeupharma.normaliser_valeur(am.dci) = d.valeur_norm
    WHERE m.statut = 'publie'
  LOOP
    mid := rec.matrice_id;

    DELETE FROM jeupharma.matrice_secteurs_therapeutiques WHERE matrice_id = mid;
    DELETE FROM jeupharma.matrice_classes_therapeutiques WHERE matrice_id = mid;
    DELETE FROM jeupharma.matrice_classes_pharmacologiques WHERE matrice_id = mid;

    ord := 0;
    FOREACH atc_code IN ARRAY string_to_array(rec.secteurs, '|') LOOP
      SELECT l.label INTO lbl FROM jeupharma.atc_labels_staging l WHERE l.code = btrim(atc_code) AND l.kind = 'secteur';
      eid := jeupharma.atc_upsert_entite('secteurs_therapeutiques', lbl);
      INSERT INTO jeupharma.matrice_secteurs_therapeutiques (matrice_id, secteur_therapeutique_id, ordre)
      VALUES (mid, eid, ord)
      ON CONFLICT DO NOTHING;
      ord := ord + 1;
    END LOOP;

    ord := 0;
    FOREACH atc_code IN ARRAY string_to_array(rec.cts, '|') LOOP
      SELECT l.label INTO lbl FROM jeupharma.atc_labels_staging l WHERE l.code = btrim(atc_code) AND l.kind = 'ct';
      eid := jeupharma.atc_upsert_entite('classes_therapeutiques', lbl);
      INSERT INTO jeupharma.matrice_classes_therapeutiques (matrice_id, classe_therapeutique_id, ordre)
      VALUES (mid, eid, ord)
      ON CONFLICT DO NOTHING;
      ord := ord + 1;
    END LOOP;

    ord := 0;
    FOREACH atc_code IN ARRAY string_to_array(rec.cps, '|') LOOP
      SELECT l.label INTO lbl FROM jeupharma.atc_labels_staging l WHERE l.code = btrim(atc_code) AND l.kind = 'cp';
      eid := jeupharma.atc_upsert_entite('classes_pharmacologiques', lbl);
      INSERT INTO jeupharma.matrice_classes_pharmacologiques (matrice_id, classe_pharmacologique_id, ordre)
      VALUES (mid, eid, ord)
      ON CONFLICT DO NOTHING;
      ord := ord + 1;
    END LOOP;

    -- sync FKs (triggers also fire)
    UPDATE jeupharma.matrice_medicaments m SET
      secteur_therapeutique_id = (
        SELECT j.secteur_therapeutique_id FROM jeupharma.matrice_secteurs_therapeutiques j
        WHERE j.matrice_id = mid ORDER BY j.ordre LIMIT 1),
      classe_therapeutique_id = (
        SELECT j.classe_therapeutique_id FROM jeupharma.matrice_classes_therapeutiques j
        WHERE j.matrice_id = mid ORDER BY j.ordre LIMIT 1),
      classe_pharmacologique_id = (
        SELECT j.classe_pharmacologique_id FROM jeupharma.matrice_classes_pharmacologiques j
        WHERE j.matrice_id = mid ORDER BY j.ordre LIMIT 1)
    WHERE m.id = mid;
  END LOOP;
END $$;

-- =============================================================================
-- 5. Vue : secteur en jsonb[]
-- =============================================================================

DROP VIEW IF EXISTS jeupharma.v_medicaments_complet;

CREATE VIEW jeupharma.v_medicaments_complet AS
SELECT
  m.id,
  m.statut,
  m.created_at,
  m.updated_at,
  m.updated_by,
  m.dci_id,
  d.valeur AS dci,
  d.niveaux_connus AS dci_niveaux,
  m.secteur_therapeutique_id,
  COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', s.id, 'valeur', s.valeur, 'ordre', ms.ordre, 'niveaux_connus', s.niveaux_connus
    ) ORDER BY ms.ordre, s.valeur)
    FROM jeupharma.matrice_secteurs_therapeutiques ms
    JOIN jeupharma.secteurs_therapeutiques s ON s.id = ms.secteur_therapeutique_id
    WHERE ms.matrice_id = m.id
  ), '[]'::jsonb) AS secteur_therapeutique,
  (
    SELECT s.niveaux_connus
    FROM jeupharma.matrice_secteurs_therapeutiques ms
    JOIN jeupharma.secteurs_therapeutiques s ON s.id = ms.secteur_therapeutique_id
    WHERE ms.matrice_id = m.id
    ORDER BY ms.ordre, s.valeur
    LIMIT 1
  ) AS secteur_niveaux,
  m.classe_therapeutique_id,
  COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', ct.id, 'valeur', ct.valeur, 'ordre', mct.ordre, 'niveaux_connus', ct.niveaux_connus
    ) ORDER BY mct.ordre, ct.valeur)
    FROM jeupharma.matrice_classes_therapeutiques mct
    JOIN jeupharma.classes_therapeutiques ct ON ct.id = mct.classe_therapeutique_id
    WHERE mct.matrice_id = m.id
  ), '[]'::jsonb) AS classe_therapeutique,
  (
    SELECT ct.niveaux_connus
    FROM jeupharma.matrice_classes_therapeutiques mct
    JOIN jeupharma.classes_therapeutiques ct ON ct.id = mct.classe_therapeutique_id
    WHERE mct.matrice_id = m.id
    ORDER BY mct.ordre, ct.valeur
    LIMIT 1
  ) AS classe_therapeutique_niveaux,
  m.classe_pharmacologique_id,
  COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', cp.id, 'valeur', cp.valeur, 'ordre', mcp.ordre, 'niveaux_connus', cp.niveaux_connus
    ) ORDER BY mcp.ordre, cp.valeur)
    FROM jeupharma.matrice_classes_pharmacologiques mcp
    JOIN jeupharma.classes_pharmacologiques cp ON cp.id = mcp.classe_pharmacologique_id
    WHERE mcp.matrice_id = m.id
  ), '[]'::jsonb) AS classe_pharmacologique,
  (
    SELECT cp.niveaux_connus
    FROM jeupharma.matrice_classes_pharmacologiques mcp
    JOIN jeupharma.classes_pharmacologiques cp ON cp.id = mcp.classe_pharmacologique_id
    WHERE mcp.matrice_id = m.id
    ORDER BY mcp.ordre, cp.valeur
    LIMIT 1
  ) AS classe_pharmacologique_niveaux,
  m.detail_pharmacologie_id,
  dp.valeur AS detail_pharmacologie,
  m.posologie_generale_id,
  pg.valeur AS posologie_generale,
  m.grossesse_allaitement_id,
  ga.valeur AS grossesse_allaitement,
  COALESCE((
    SELECT jsonb_agg(jsonb_build_object('id', nc.id, 'valeur', nc.valeur, 'ordre', mnc.ordre)
      ORDER BY mnc.ordre, nc.valeur)
    FROM jeupharma.matrice_noms_commerciaux mnc
    JOIN jeupharma.noms_commerciaux nc ON nc.id = mnc.nom_commercial_id
    WHERE mnc.matrice_id = m.id
  ), '[]'::jsonb) AS noms_commerciaux,
  (
    SELECT nc.valeur
    FROM jeupharma.matrice_noms_commerciaux mnc
    JOIN jeupharma.noms_commerciaux nc ON nc.id = mnc.nom_commercial_id
    WHERE mnc.matrice_id = m.id
    ORDER BY mnc.ordre, nc.valeur
    LIMIT 1
  ) AS nom_commercial,
  (
    SELECT nc.niveaux_connus
    FROM jeupharma.matrice_noms_commerciaux mnc
    JOIN jeupharma.noms_commerciaux nc ON nc.id = mnc.nom_commercial_id
    WHERE mnc.matrice_id = m.id
    ORDER BY mnc.ordre, nc.valeur
    LIMIT 1
  ) AS nom_commercial_niveaux,
  COALESCE((
    SELECT jsonb_agg(jsonb_build_object('id', i.id, 'valeur', i.valeur, 'ordre', mi.ordre)
      ORDER BY mi.ordre, i.valeur)
    FROM jeupharma.matrice_indications mi
    JOIN jeupharma.indications i ON i.id = mi.indication_id
    WHERE mi.matrice_id = m.id
  ), '[]'::jsonb) AS indications,
  COALESCE((
    SELECT jsonb_agg(jsonb_build_object('id', ci.id, 'valeur', ci.valeur, 'ordre', mci.ordre)
      ORDER BY mci.ordre, ci.valeur)
    FROM jeupharma.matrice_contre_indications mci
    JOIN jeupharma.contre_indications ci ON ci.id = mci.contre_indication_id
    WHERE mci.matrice_id = m.id
  ), '[]'::jsonb) AS contre_indications,
  COALESCE((
    SELECT jsonb_agg(jsonb_build_object('id', ei.id, 'valeur', ei.valeur, 'ordre', mei.ordre)
      ORDER BY mei.ordre, ei.valeur)
    FROM jeupharma.matrice_effets_indesirables mei
    JOIN jeupharma.effets_indesirables ei ON ei.id = mei.effet_indesirable_id
    WHERE mei.matrice_id = m.id
  ), '[]'::jsonb) AS effets_indesirables,
  COALESCE((
    SELECT jsonb_agg(jsonb_build_object('id', pe.id, 'valeur', pe.valeur, 'ordre', mpe.ordre)
      ORDER BY mpe.ordre, pe.valeur)
    FROM jeupharma.matrice_precautions_emploi mpe
    JOIN jeupharma.precautions_emploi pe ON pe.id = mpe.precaution_emploi_id
    WHERE mpe.matrice_id = m.id
  ), '[]'::jsonb) AS precautions_emploi,
  COALESCE((
    SELECT jsonb_agg(jsonb_build_object('id', ix.id, 'valeur', ix.valeur, 'ordre', mix.ordre)
      ORDER BY mix.ordre, ix.valeur)
    FROM jeupharma.matrice_interactions mix
    JOIN jeupharma.interactions ix ON ix.id = mix.interaction_id
    WHERE mix.matrice_id = m.id
  ), '[]'::jsonb) AS interactions,
  COALESCE((
    SELECT jsonb_agg(jsonb_build_object('id', sv.id, 'valeur', sv.valeur, 'ordre', msv.ordre)
      ORDER BY msv.ordre, sv.valeur)
    FROM jeupharma.matrice_surveillances msv
    JOIN jeupharma.surveillances sv ON sv.id = msv.surveillance_id
    WHERE msv.matrice_id = m.id
  ), '[]'::jsonb) AS surveillances,
  COALESCE((
    SELECT jsonb_agg(jsonb_build_object('id', va.id, 'valeur', va.valeur, 'ordre', mva.ordre)
      ORDER BY mva.ordre, va.valeur)
    FROM jeupharma.matrice_voies_administration mva
    JOIN jeupharma.voies_administration va ON va.id = mva.voie_administration_id
    WHERE mva.matrice_id = m.id
  ), '[]'::jsonb) AS voies_administration,
  m.hospitalier
FROM jeupharma.matrice_medicaments m
LEFT JOIN jeupharma.dcis d ON d.id = m.dci_id
LEFT JOIN jeupharma.details_pharmacologie dp ON dp.id = m.detail_pharmacologie_id
LEFT JOIN jeupharma.posologies_generales pg ON pg.id = m.posologie_generale_id
LEFT JOIN jeupharma.grossesse_allaitement ga ON ga.id = m.grossesse_allaitement_id;

COMMENT ON VIEW jeupharma.v_medicaments_complet IS
  'Fiches DCI + agrégats multi. secteur / classes = jsonb[] ATC. FK *_id = ordre 0.';

GRANT SELECT, INSERT, UPDATE, DELETE ON jeupharma.v_medicaments_complet TO anon, authenticated, service_role;
