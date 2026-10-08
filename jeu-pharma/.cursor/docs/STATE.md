# État Jeu Pharma (handoff)

Dernière mise à jour : 2026-10-08 — Priorité 1 E2E (partiel : auth bloquée) ; legacy/snapshots + Priorité 2–4 livrés en worktree.

## Périmètre
App pédagogique vanilla sous `jeu-pharma/`. Schéma Supabase **`jeupharma`**. Auth portail (`protect.js` + `site_access`). Contenu = cours physiques / CSV. BDPM **lecture seule** (`schéma bdm`, RPC `search_products`) pour préremplir nom(s)/DCI — pas de sync destructive ni d’IA en v1.

## SITE_ID
- UUID portail : **`d4fc7fd0-944b-4594-9ba2-e1e2035aeddc`**
- Aligné dans : `js/supabase.js` → `SITE_ID` ; ce fichier ; `sql/001_jeupharma_init.sql` → `has_jeupharma_access()` (remote + local).
- URL Pages : `https://jessy1590.github.io/Application/jeu-pharma/`
- Pas de carte hardcodée dans le `index.html` racine du monorepo — la tuile vient de `portail.sites`.

## Modèle médicament (depuis 002)
- **1 `matrice_medicaments` = 1 DCI** (`dci_id` ; index unique partiel hors `archive`).
- **N noms commerciaux** via `jeupharma.matrice_noms_commerciaux` (plus de colonne `nom_commercial_id`).
- Champs pédagogiques (secteur, classes, indications, CI, EI…) partagés sur la fiche DCI.
- Secteur + classes théra / pharma : plusieurs par fiche (`matrice_secteurs_therapeutiques`, `matrice_classes_*`). La FK `*_id` = ordre 0.
- Vue `v_medicaments_complet` : `noms_commerciaux[]` + `nom_commercial` = 1er nom (compat / déprécié). `secteur_therapeutique` / `classe_therapeutique` / `classe_pharmacologique` = jsonb[].
- Save / CSV / BDPM : fusion par DCI (append noms, soft-archive doublons).

### Règles DCI / noms (catalogue RCP)
- DCI = INN / RCP (pas classe, pas labo). Exception pédagogique : fers mono sous `Sels ferreux`.
- Plusieurs spécialités / génériques = plusieurs noms sur la **même** fiche.
- `… Biogaran` = nom commercial, jamais une DCI ni une fiche séparée.
- Fusion sel → INN courte (`Clopidogrel`, `Bisoprolol`).
- Associations (`Clopidogrel + aspirine`, `Sels ferreux + acide folique`, etc.) = fiche distincte.
- Pas d’invention clinique : structure + libellés seulement.

## Ops remote (projet `kpjflntnotftpzffjbud`)
- [x] Schéma `jeupharma` créé.
- [x] Exposition Data API / PostgREST : `jeupharma` dans `authenticator.pgrst.db_schemas`.
- [x] SQL init `001` appliqué (helpers, tables, vue, RPC quiz/fusion, RLS).
- [x] `has_jeupharma_access()` = `d4fc7fd0-944b-4594-9ba2-e1e2035aeddc`.
- [x] Migration **`002_dci_centrique`** (MCP `jeupharma_002*` + update RPC) :
  - liaison `matrice_noms_commerciaux` + RLS
  - merge 34 groupes DCI doublons → **42** fiches soft-archivées
  - drop `nom_commercial_id`
  - index `matrice_medicaments_dci_unique_actif`
  - vue + `_valeur_champ_matrice` / `generer_et_geler_quiz` / `fusionner_entites`
- [x] Vérif post-`002` : **179** non-archive (**160** avec DCI uniques + **19** sans DCI), **0** groupe DCI dupliqué actif.
- [x] Migration **`004_catalogue_cleanup_rcp`** (MCP `catalogue_cleanup_rcp`, fichier `sql/004_catalogue_cleanup_rcp.sql`) :
  - ASA : DCI `Acide acétylsalicylique` + merge Aspegic / Kardegic / Aspirine Protect
  - Fers : 7 mono → `Sels ferreux` ; Tardyféron B9 → `Sels ferreux + acide folique`
  - Fusion `Bésilate de clopidogrel` → `Clopidogrel` ; `Fumarate de bisoprolol` → `Bisoprolol` (DCI sels soft-désactivées)
  - Biogaran = noms sur DCI (Clopidogrel / Ramipril / Rivaroxaban)
  - Soft-archive : Calcarea fluor, Hamamelis composé, Vipera redi, Aetoxisclérol, Sclérémo, Trombovar, Resitune
  - Eau oxygénée → DCI `Peroxyde d'hydrogène` ; Digoxine : nom redondant retiré, Hémigoxine conservé
- [x] Vérif post-`004` : **162** `publie` / **59** `archive` ; **0** sans `dci_id` actif ; **0** DCI multi-matrices actives.
- [x] Migration **`005_hospitalier`** (MCP `jeupharma_005_hospitalier`, fichier `sql/005_hospitalier.sql`) :
  - `matrice_medicaments.hospitalier boolean NOT NULL DEFAULT false` (legacy — sync depuis niveau)
  - vue `v_medicaments_complet.hospitalier`
  - RPC / filtre initialement liés au niveau `pharmacien` → remplacés par `007`
- [x] Migration historique **`007_niveau_hospitalier`** (MCP + fichier `sql/007_niveau_hospitalier.sql`, comportement remplacé par `017`) :
  - Seed DB legacy `jeupharma.niveaux` code `hospitalier` (ordre 7), désormais absent de `JpConstants.NIVEAUX`
  - Données : matrices `hospitalier=true` → `niveaux_connus = ['hospitalier']` sur DCI + noms commerciaux liés (6 DCI / 6 noms)
  - Bool `matrice.hospitalier` **conservé** : dérivé au save si DCI/noms portent le niveau hospitalier (exclusif)
  - ancien `generer_et_geler_quiz` : pool hospitalier dédié, remplacé par la règle pharmacien de `017`
  - UI : case « Hospitalier (pharmacien) » retirée ; contrôle = niveaux DCI / noms (Hosp exclusif)
  - ancien filtre client hospitalier exclusif, remplacé par `hospitalier OR complexe` réservé à `pharmacien`
- [x] Migration **`008_scores_fiche_aleatoire`** (MCP + fichier `sql/008_scores_fiche_aleatoire.sql`) :
  - Table `jeupharma.scores_fiche_aleatoire` : `utilisateur_id`, `matrice_id`, `score_obtenu` (sans défaut), `score_max` défaut 10, `created_at`
  - RLS : select soi ou `is_portail_admin()` ; insert soi + `has_jeupharma_access()`
  - Contrainte : note entière 0–10 ; 11 et omission de `score_obtenu` refusés
- [x] Migration **`010_classes_m2m`** (MCP + `sql/010_classes_m2m.sql`) :
  - jonctions `matrice_classes_therapeutiques` / `matrice_classes_pharmacologiques` (modèle `matrice_indications`) + RLS
  - migration de la FK existante en ordre 0 ; trigger : la FK reste la classe d’ordre minimum
  - vue : `classe_therapeutique` et `classe_pharmacologique` = jsonb `[{id,valeur,ordre,niveaux_connus}]` ; `*_id` et `*_niveaux` = 1er rang
  - `_valeur_champ_matrice` tire une classe au hasard dans la jonction ; `fusionner_entites` réécrit les jonctions
  - UI : `card: 'N'` (chips), filtres catalogue / jeux sur tous les ids
- [x] Import cours **`011_cours_sang_cv_hta.sql`** (MCP, idempotent) — voir section dédiée. Pas de fiche DCI créée.
- [x] Migration **`012_atc_secteurs_classes`** (MCP `jeupharma_012_atc_*`, fichier `sql/012_atc_secteurs_classes.sql`) :
  - jonction `matrice_secteurs_therapeutiques` + trigger sync FK ; secteurs renommés Sang→B, Cardiovasculaire→C
  - staging DCI→ATC + libellés ; mapping appliqué aux fiches `publie` (remplace secteurs/CT/CP)
  - décisions : dapagliflozine A+C ; piribedil N ; filgrastim/Ig/idarucizumab/BB/anti-angoreux suivent ATC ; associations multi-ATC
  - vue : `secteur_therapeutique` = jsonb[] ; UI `card: 'N'` + filtres `idsOf`
  - vérif : Furosémide C/C03/C03C ; Dapagliflozine A+C ; Piribedil N ; Bisoprolol C07 ; **0** `publie` hors staging
- [x] Migration **`013_atc_labels_cp_niveau`** (MCP, strip codes déjà fait + staging CP + DO) :
  - libellés secteur/CT/CP sans préfixe « CODE - » ; CP remplacés par libellés simples (Acénocoumarol → Antivitamines K ; Furosémide → Diurétiques de l'anse) ; extras multi-CP
  - UI : `admin/catalogue.html` + joueur `labelsOf` sur secteur (filtres/tri/recherche/incomplet) — plus de `[object Object]`
- [x] Notes **`006_catalogue_champs_actifs_notes.sql`** (pas de DDL) + audit dédup remote (2026-10-07) :
  - **0** groupe actif en doublon exact `valeur_norm` (tables entités actives) — index unique `_valeur_norm_actif_uidx` respecté ; aucune fusion RPC nécessaire
  - Doublons exacts `valeur_norm` : panneau Fusion / scanner (garder le plus lié)
  - **Quasi-doublons** (Priorité 2) : scanner séparé « inclusion de mots » (ex. « Hypotension » ⊂ « Hypotension orthostatique ») — suggestions uniquement, préremplissage formulaire ; fusion toujours manuelle ; exclus les égalités exactes `valeur_norm`
- [x] Migration **`014_fiche_validee`** (MCP + `sql/014_fiche_validee.sql`) :
  - `matrice_medicaments.fiche_validee boolean NOT NULL DEFAULT false` + colonne exposée dans `v_medicaments_complet`
  - Admin catalogue : bouton **Valider fiches** (file des fiches non validées du filtre courant) → **Validé** (écrit en base) ou **Modifier** (ouvre l’éditeur, reprend la file au fermeture)
  - Filtre toolbar « À valider / Validées » + badge tableau ; **Remettre à 0** remet `fiche_validee=false` sur les fiches du filtre actuel
  - Toute sauvegarde éditeur remet `fiche_validee` à `false` ; API `JpMedicaments.setFicheValidee` / `resetFicheValidee`
  - **Progression validation** (Priorité 2) : compteur « X / N fiches validées » à côté de **Valider fiches**, recalculé sur le filtre tableau courant
- [x] Migration **`015_simplifier_securite_cours`** (MCP + `sql/015_simplifier_securite_cours.sql`) :
  - Indications / CI / EI / précautions / interactions / surveillances : libellés courts isolables (ex. toutes variantes IDM → `IDM` ; angor → `Angor` ; IC ; FA ; SCA ; TVP ; MTEV…)
  - Fusion des doublons après renommage (jonctions réaffectées, anciennes entités soft-désactivées)
  - Source = vocabulaire cours Sang / CV / HTA (extraits ppt) — **pas de RCP** ; précautions longues (Natispray, patchs) raccourcies
- [x] Migration **`016_configuration_niveaux`** (MCP `jeupharma_016_configuration_niveaux` + `jeupharma_016_configuration_niveaux_hardening`, fichier `sql/016_configuration_niveaux.sql`) :
  - configuration centralisée : `niveau_secteurs_therapeutiques`, `niveau_classes_therapeutiques`, `niveau_classes_pharmacologiques`, `niveau_champs`
  - seed depuis l’ancien comportement `niveaux_connus` (tableau vide = disponible à tous) ; 12 champs actifs initialement disponibles pour chaque niveau
  - RLS : lecture `has_jeupharma_access()` ; écriture admin portail ; RPC atomique `enregistrer_configuration_niveau`
  - éditeur catalogue / CSV : aucun contrôle ni colonne de niveaux par valeur ; panneau admin unique par niveau
  - `matrice_medicaments.hospitalier` devient la source de vérité de la fiche hospitalière, distincte du rôle portail
  - quiz / trous / catalogue joueur / fiche aléatoire lisent taxonomies + champs du niveau
  - tables supprimées après contrôle des libellés migrés : `atc_map_staging`, `atc_labels_staging`, `atc_cp_fix_staging`, `atc_cp_extra_staging`
  - tables conservées : `secteurs_therapeutiques`, `classes_therapeutiques`, `classes_pharmacologiques` et leurs trois jonctions `matrice_*`
- [x] Migration **`017_classifications_fiches`** (MCP `jeupharma_017_classifications_fiches` + `jeupharma_017_classifications_fiches_rls`, fichier `sql/017_classifications_fiches.sql`) :
  - ajoute `matrice_medicaments.complexe boolean NOT NULL DEFAULT false` ; conserve `hospitalier` comme source du statut hospitalier
  - expose `hospitalier` + `complexe` dans `v_medicaments_complet` (`security_invoker`)
  - une fiche `hospitalier OR complexe` est visible / générable uniquement pour `profil_apprentissage.niveau_id = 'pharmacien'` ; les fiches ordinaires restent disponibles au pharmacien
  - `_matrice_disponible_niveau` et le générateur quiz legacy appliquent la même règle ; aucun `niveaux_connus` d’entité réintroduit
  - RLS `matrice_medicaments` / `quizz` / `parties_tableau_trous` + RPC `ouvrir_quiz` / `soumettre_quiz` empêchent la lecture et le jeu des contenus pharmacien par les autres profils
  - éditeur admin : deux switches explicites, sauvegardés séparément ; l’admin voit et édite toujours toutes les fiches
- [x] Nettoyage legacy **`niveaux_connus` / `*_niveaux`** (Priorité 1 — UI/JS uniquement) :
  - JSDoc morts retirés (`entites.js` `mergeNiveaux`, `quizz.js` contrôle `*_niveaux`) ; CSS `.jp-niveaux-warn` retiré
  - CSV continue d’ignorer les colonnes `*_niveaux` à l’import (compat anciens fichiers)
  - fichier local **`sql/018_vue_sans_niveaux_entite.sql`** prêt (`DROP VIEW` + `CREATE`, car Postgres refuse de retirer des colonnes via `CREATE OR REPLACE`) — **non appliqué remote** (prudence plan : colonnes vue encore exposées ; tables `niveaux_connus` de toute façon conservées)
- [x] Outil **audit snapshots** (pas de DDL) : `js/snapshots-audit.js` + section Historique dans `admin/jeux.html` ; SQL ops `sql/ops_audit_snapshots_archives.sql`
  - détecte quiz / trous dont le snapshot référence des `matrice_medicaments` en `archive`
  - régénération optionnelle quiz via `JpQuizz.regenerer` / RPC `generer_et_geler_quiz` ; trous = recréer (pas de régénération auto)
  - vérif remote initiale : 1 quiz touché (`PH-HH4X6`, déjà inactif), 0 trous

## Import cours Sang / CV / HTA (2026-10-08)

Sources lues (`ppt/slides/*.xml`, pas d’OCR) :
- `1-1 Rappel SANG AP et Cas de comptoir.pptx` — 34 slides, texte quasi vide (images). Aucune DCI extraite.
- `1-3 Sang PP 25-26 CécileB.pptx` — 79 slides (19 sans texte).
- `2- Appareil CV PP 23-24 Cécile.pptx` — 108 slides (34 sans texte, schémas).
- `5-HTA 2024.pptx` — 92 slides.

Extraits texte : `jeu-pharma/.cursor/docs/cours-extract/`.

### Fiches
- **Créées : 0.** Les DCI des cours (sang, CV, HTA, associations) étaient déjà `publie`.
- **Mises à jour** (fiches existantes, `publie` inchangé) :
  - classes multiples : 15 bêtabloquants du cours + classe pharma « Anti-arythmiques de classe 2 » ; Sotalol aussi bêtabloquant (FK reste classe 3) ; Vérapamil et Diltiazem + classe 4 et classe théra Anti-arythmiques ; Trinitrine + nitrés d’action immédiate ; Dabigatran + inhibiteurs de la thrombine (IIa)
  - précautions cours : dérivés nitrés (hypotension, association aux autres hypotenseurs) ; bêtabloquants « ne jamais interrompre brutalement »
  - indications cours manquantes : Molsidomine (angor) ; Amiodarone (troubles du rythme) ; Sacubitril + valsartan (insuffisance cardiaque) ; Sels ferreux + acide folique (3 indications acide folique du cours)
  - associations : CI, EI, précautions, interactions, surveillances recopiées des monocomposants déjà en base (dédoublonnées). Ex. Bisoprolol + HCT 15 CI / 16 EI ; Entresto 6 CI / 7 EI (valsartan) + indication IC ; fer + B9 : 5 indications, 2 CI, 4 EI. Clopidogrel + aspirine déjà complète, rien de nouveau.
  - nom Bisoce sur Bisoprolol ; détail Adrénaline (IV hôpital vs Anapen/Jext IM officine) ; thrombolytiques du cours en niveau `hospitalier` exclusif (Altéplase déjà, + Ténectéplase, Rétéplase, Streptokinase, Urokinase)
- **RCP (une seule molécule)** : Digoxine, BDPM CIS 67681303, rubriques 4.1 et 4.3. +2 indications (dont « Insuffisance cardiaque » déjà en entité), +4 CI graves. CI cours déjà présentes non dupliquées (BAV, hypokaliémie).
- **Ignorées** (citées, pas de fiche créée) : culots globulaires ; noradrénaline / dopamine (physiologie) ; pseudoéphédrine, réglisse, lithium, floctafénine, dantrolène (conseils / interactions) ; HE cyprès ; homéopathie et sclérosants déjà soft-archivés en `004` ; nom Digoxine® déjà retiré en `004`. Chlortalidone, altizide, méthyclothiazide, atorvastatine, triamtérène : pas de fiche mono. Triamtérène dans Prestole / Isobar : sécurité copiée de l’amiloride (même classe cours « épargneurs potassiques non antialdostérone »), pas du RCP triamtérène.

### Compteurs
- Cours : 3 classes nouvelles (classe 2, classe 4, inhibiteurs thrombine IIa) ; **20** liaisons pharma et **2** liaisons théra en plus de la classe d’ordre 0 (15 bêtabloquants + classe 2, Sotalol aussi bêtabloquant, Vérapamil et Diltiazem + classe 4 et classe théra Anti-arythmiques, Trinitrine + nitrés immédiats, Dabigatran + IIa) ; précautions nitrés et arrêt brutal ; 6 indications posées (molsidomine, amiodarone, entresto, 3 folate sur fer+B9) ; recopies sécurité des associations ; 1 nom (Bisoce) ; 1 détail (adrénaline) ; 4 fiches passées hospitalier.
- RCP : 1 indication nouvelle + 1 liaison indication existante + 4 CI, toutes sur Digoxine.

### Laissé vide (pas de source cours, RCP non extrait)
- Acide folique / folinique : pas de CI ni EI.
- Alginate de calcium, peroxyde d’hydrogène : pas d’indication rédigée dans le texte des slides.
- Rivaroxaban (CI et EI), apixaban (CI), fondaparinux (CI), dapagliflozine (CI et EI), thrombolytiques (CI), amiodarone (interactions), adrénaline (CI et EI) : cours muet ; pages BDPM des produits centralisés renvoient à l’EMA sans le texte des rubriques 4.x. Non complété.
- Partenaires sans fiche mono (chlortalidone, altizide, méthyclothiazide, atorvastatine) : leur part propre n’est pas dans les associations, hors la part amlodipine / amiloride / thiazidique déjà en base.
- Niveaux des fiches existantes non modifiés, sauf les 5 thrombolytiques hospitaliers. Niveaux des entités nouvelles = copie d’une entité sœur déjà en base.

## Catalogue — champs actifs & entités liées
- Flag `actif` sur `JpConstants.CHAMP_CODES` + `champsActifs()` / `isChampActif()`.
- **Actifs** : noms commerciaux, DCI, secteur, classes théra/pharma, détail pharmacologie, indications, CI, EI, précautions, interactions, surveillances (+ statut et booléens fiche hospitalière / complexe).
- Disponibilité par niveau : panneau admin centralisé (taxonomies + champs), sans `niveaux_connus` sur chaque valeur.
- **Legacy masqués** (tables/données conservées) : posologie générale, grossesse & allaitement, voies d’administration — absents UI admin/joueur, CSV modèle, cases quiz/trous ; `JpMedicaments.save` ne touche plus ces FK/jonctions.
- **Picker fiche** : chips multi `{ id, valeur }` + recherche ; « Créer … » seulement si pas de match exact `valeur_norm` ; singuliers id forcé (`data-entity-id`) + Effacer ; save priorise les ids.
- **Filtre Paramètres → Lié à** : type d’entité + sélection entité → fiches via jonction / FK (`JpMedicaments.lieAEntite`).
- **CSV** : en-têtes champs actifs ; dry-run refuse colonnes inconnues, ignore legacy si présentes ; import `findOrCreate` inchangé.
- **Fusion** : RPC inchangé + scanner « doublons exacts valeur_norm » (garder le plus lié) + scanner « quasi-doublons » (inclusion de mots, suggestions / préremplissage formulaire, fusion manuelle).
- **Complétude** (Priorité 2) : panneau admin **Complétude** — pour chaque champ actif, nombre de fiches `publie` vides via `isChampIncomplet` (indépendant du filtre tableau).
- **Progression validation** (Priorité 2) : compteur « X / N fiches validées » à côté de **Valider fiches** (filtre courant).

## Build code (livré)
- [x] `.cursor/` (rules + STATE).
- [x] SQL `sql/001` … `007_niveau_hospitalier.sql`.
- [x] Fiche aléatoire (joueur) : `fiche-aleatoire/index.html`, `js/fiche-aleatoire.js`, `sql/008_scores_fiche_aleatoire.sql`.
- [x] Socle hub / CSS / dual client / FAB / toasts / logs / bugs.
- [x] Admin + catalogue + quiz + trous + CSV + BDPM + profil + suivi charts.
- [x] Refactor DCI-centrique surfaces : `constants`, `medicaments`, `csv`, `bdm`, `trous`, `admin/catalogue`, `catalogue`, `admin/trous`, architecture.
- [x] Admin contenu unifié : `admin/catalogue.html` (table + création/édition en modal `.jp-catalogue-fiche-modal` + import + fusion + niveaux) ; redirects depuis medicaments / import-export / fusion / entites. Filtre **Incomplètes** + filtre **Lié à** (type + entité). Picker chips / id forcé (plus de textareas multi).
- [x] Admin jeux unifié : `admin/jeux.html` (« Création jeu ») — onglets **Historique** | Quiz | Tableau à trous ; Historique = liste filtrée (en cours / terminés / archivés) ; Quiz/Trous = création seule (même structure CSS `.jp-quiz-admin-*`) ; redirects `quizz.html` / `trous.html` → `?type=`.
- [x] Trous jouer — flux score manuel (voir section ci-dessous).
- [x] Refonte création tableau à trous (voir section ci-dessous) — **pas de migration Supabase**.
- [x] Refonte création quiz (voir section ci-dessous) — **pas de migration Supabase** (génération QCM côté client).
- [x] Priorité 4 — QR partage + tableau de bord classe (voir sections ci-dessous) — **pas de migration Supabase**.
- [x] Priorité 3 — points faibles + filtres FA + progression secteur + mobile trous (voir section dédiée) — **pas de migration Supabase**.

## Partage QR (création quiz / trous)
- Sur `admin/jeux.html` après création : bloc résultat affiche le `code_unique`, un **QR code** (canvas) et l’URL absolue de `quiz/jouer.html?code=` ou `trous/jouer.html?code=`.
- Génération **client** via `qrious@4.0.2` (jsDelivr, déjà autorisé CSP `script-src`) ; image canvas / pas d’API QR externe.
- Fichiers : `admin/jeux.html`, `js/admin-jeux.js` (`renderResultQr`), `css/app.css`.

## Tableau de bord classe (admin suivi)
- `admin/suivi.html` : section « Tableau de bord classe » visible **uniquement** quand une activité quiz ou trous est sélectionnée (filtre Activité).
- Agrégats sur la période : **moyenne** (%), nombre de tentatives / utilisateurs ; **questions les plus ratées** (top 15) depuis `details_reponses`.
- Quiz : items `correct` + libellé depuis `snapshot_questions.enonce` (ordre).
- Trous : détail auto (tableau), manuel `case` / `ligne` ; score **général** sans détail → message, pas de faux taux.
- Fichiers : `admin/suivi.html`, `js/charts-admin.js`, `css/app.css`.

## Création quiz (refonte admin)
- UI : `admin/jeux.html` panneau Quiz — **4 étapes** (Médicaments → Paramètres → Questions → Titre) ; **pas d’aperçu grille** (liste de questions éditable à l’étape 3).
- Étape 1 : niveau (les fiches hospitalières ou complexes entrent dans le pool uniquement pour `pharmacien`) ; filtres multi (secteurs + classes théra/pharma + texte) — **OR intra-filtre, AND inter-filtres** (même logique que trous) ; coches médicaments = pool QCM.
- Étape 2 : champs interrogés + nb questions + nb propositions.
- Étape 3 : « Générer les questions » ; par question : **Supprimer** / **Régénérer** ; « Ajouter une question » (même contraintes filtres/champs). Génération **client** (`JpQuizz.genererQuestions` / `genererUneQuestion`) — distracteurs priorité même secteur puis pool.
- Création = **exactement la liste affichée** via `JpQuizz.createWithSnapshot` (insert `snapshot_questions`, **zéro** appel `generer_et_geler_quiz`).
- `configuration_json` : `champs_interroges`, `nb_questions` (= longueur snapshot), `nb_propositions`, `distracteurs`, `filtres` ; `secteur_therapeutique_id` = seul secteur coché s’il y en a exactement un (sinon null).
- RPC `generer_et_geler_quiz` conservée (legacy / `createAndGenerate` / `regenerer`) — ne gère ni filtres multi ni régénération unitaire.
- Fichiers : `admin/jeux.html`, `js/admin-jeux.js`, `js/quizz.js`, `css/app.css` ; docs STATE + architecture.

## Création tableau à trous (refonte admin)
- UI : `admin/jeux.html` panneau Trous — **4 étapes** (Lignes → Colonnes → Trous → Titre) + **aperçu** auto-refresh (bouton Masquer / Afficher l’aperçu, UI only) ; plus de « Prévisualiser » ni select Aléatoire/Manuel exclusif.
- Étape 1 : niveau (les fiches hospitalières ou complexes entrent dans le pool uniquement pour `pharmacien`) ; filtres multi (secteurs + classes théra/pharma + texte) — **OR intra-filtre, AND inter-filtres** ; interrupteur « Une ligne par nom commercial » + retouche noms par fiche ; max lignes + « Tirer les lignes au hasard » (tirage figé jusqu’au re-clic).
- Étape 2 : colonnes + **identité de ligne** (`identite_visible` : `dci` | `noms` | `les_deux` | `au_moins_un`, défaut `au_moins_un`) — cases concernées jamais en trou ; `au_moins_un` empêche noms+DCI tous deux trous sur la même ligne (tirage + clic).
- Étape 3 : densité + « Tirer les trous au hasard » + clic case + « Effacer les trous ».
- Création = **exactement la grille affichée** (zéro re-tirage) via `buildSnapshot({ lignes, colonnes, trous, identite_visible })`.
- Snapshot : `identite_visible` + chaque ligne `ligne_id` / `label` / `matrice_id` (+ `nom_commercial_id`). **Plus de colonne fixe « Médicament »** (identité = colonnes Noms/DCI selon le mode).
- `configuration_json` : `colonnes`, `densite`, `max_lignes`, `par_nom`, `identite_visible`, `filtres`.
- Compat parties anciennes : sans `snapshot.identite_visible` → colonne « Médicament » (= `label`) encore affichée (jouer / imprimer / print). `JpTrous.ligneKey` / score — repli `matrice_id`.
- Fichiers : `admin/jeux.html`, `js/admin-jeux.js`, `js/trous.js`, `js/print.js`, `trous/jouer.html`, `trous/imprimer.html`, `css/app.css`.

## Flux score tableau à trous (`trous/jouer.html`)
- **Imprimer** : grille papier (cases vides) via `JpPrint.trousPrintDocument` + iframe same-document (`JpPrint.printHtml`). Admin création : lien `trous/imprimer.html?code=…` inchangé.
- **Voir la réponse** : affiche le corrigé (`JpTrous.listerTrous` → attendus sous chaque trou). **Aucun score** calculé ni affiché ni enregistré.
- **Indiquer un score** : seul chemin vers un score. Ouvre le modal `.jp-trous-score-modal` (3 modes) ; insert DB **uniquement** après validation.
  1. **Résultat général** — saisie manuelle `score_obtenu` / `score_max`.
  2. **Par ligne** — OK/KO par médicament ayant des trous → total = lignes OK / lignes scorables.
  3. **Par case** — case cochée = bonne réponse → total = cases OK / trous.
- API : `JpTrous.soumettreManuel(partieId, { mode_saisie, score_obtenu, score_max, details })` — pas d’`evaluer()` sur les champs écran. Log `trous_soumettre_manuel`. `soumettre()` (auto-éval saisies) reste exposé mais n’est plus utilisé par jouer.
- Fichiers : `js/trous.js`, `trous/jouer.html`, `css/app.css` (`.jp-trous-score-modal*`).

## Fiche aléatoire (joueur)
- Route : `fiche-aleatoire/index.html` — tuile hub « Fiche aléatoire ». Pas de page ni d’options admin.
- Tirage d’une fiche `publie`. Noms commerciaux + DCI visibles ; autres champs actifs vides jusqu’à **Voir les réponses** (aucun score calculé ni enregistré).
- **Mettre un score** : popup, note entière /10, insert `scores_fiche_aleatoire` seulement après validation. Pas de 0 par défaut.
- **Passer** : fiche suivante, sans score.
- Exclusion : **3 notes > 8/10** (8 ne compte pas) pour l’utilisateur connecté → fiche plus proposée.
- Filtre niveau : `JpNiveaux.filtrerMedicaments` / `visiblePourNiveau` + `JpProfil.getNiveauCode()` (joueur, pas le bypass admin du catalogue).
- **Filtres joueur** (Priorité 3) : secteur + classe thérapeutique + classe pharmacologique — options limitées via `niveau_*` (`JpFicheAleatoire.optionsFiltres` / `filtrerTaxonomie`) ; **Appliquer** retraite le pool puis tire.
- RLS : select soi ou `is_portail_admin()` ; insert soi + `has_jeupharma_access()`.
- **Suivi** : scores dans Mon espace (`espace.html`) + admin suivi Chart.js (`charts-admin.js`) — type « Fiche aléatoire », libellé DCI · noms, note /10.
- Fichiers : `fiche-aleatoire/index.html`, `js/fiche-aleatoire.js`, `espace.html`, `admin/suivi.html`, `js/charts-admin.js`, `index.html`, `sql/008_scores_fiche_aleatoire.sql`.

## Priorité 3 — Expérience joueur
- **Mes points faibles** : agrégation client des échecs déjà stockés — quiz (`details_reponses[].correct === false`), trous (tableau auto ou manuel `ligne`/`case`), fiche aléatoire (note ≤ 8/10). Score trous « général » sans détail par fiche : ignoré. Zéro IA, **pas de migration**.
  - API : `js/points-faibles.js` (`JpPointsFaibles.agreger`, `poolRevision`, `progressionParSecteur`).
  - Session : `points-faibles/index.html` (liste + révision type fiche aléatoire) ; entrée depuis `espace.html`.
- **Progression par secteur** (`espace.html`) : pour le niveau courant, fiches éligibles vs acquises (3 notes > 8/10) groupées par secteur (jonction multi).
- **Mobile** : `css/app.css` — grille `.jp-trous-table` scrollable (`min-width` + `.jp-table-wrap`), modal score en feuille bas / plein écran ≤480px, actions trous en colonne.
- Fichiers : `js/points-faibles.js`, `points-faibles/index.html`, `espace.html`, `fiche-aleatoire/index.html`, `js/fiche-aleatoire.js`, `css/app.css`, architecture.

## Test E2E navigateur authentifié (p1-e2e — 2026-10-08)

### Verdict
**Non abouti en UI authentifiée.** Aucun credential de test dans le repo, STATE, stores agent, ni README. `protect.js` redirige toute surface `jeu-pharma/` non authentifiée vers le portail (`https://jessy1590.github.io/Application/`). Shell local indisponible dans la session agent (pas de serveur file:// alternatif). Pas de modification de code suite à ce test (aucun bug bloquant trivial observé côté chemins critiques).

### Smoke non-auth (navigateur MCP)
- [x] Portail login affiché (`Email` / `Mot de passe` / Se connecter).
- [x] `…/jeu-pharma/` et `…/fiche-aleatoire/` → redirect portail (gate OK).
- [x] Assets Pages : `admin/catalogue.html` et `admin/jeux.html` servis (texte structure visible hors auth via fetch).
- [!] Pages **en retard** sur le worktree P3 : `js/points-faibles.js` → **404** ; `js/fiche-aleatoire.js` déployé **sans** `filtrerTaxonomie` / `optionsFiltres` (présents en local). Re-test UI P3/P4 nécessite commit + déploiement Pages (ou serveur local + session).

### Vérifs SQL remote (projet `kpjflntnotftpzffjbud`) — substitut data
- Publie : **161** ; hospitalier : **10** ; complexe : **0** ; ordinaires : **151**.
- `_matrice_disponible_niveau` : **apprenti** → 151 dispo / **0** hosp / **0** complexe ; **pharmacien** → 161 / 10 hosp / 0 complexe. Aligné client `visiblePourNiveau` + `JpNiveaux.filtrerMedicaments`.
- Config `niveau_*` peuplée : champs 81, secteurs 47, CT 179, CP 808 ; lookup `niveaux` = 7.
- Validation fiches : **0 / 161** validées (compteur UI à exercer une fois auth).
- Quiz en base : **2** ; parties trous : **4** ; DCI hosp ex. Altéplase, Ténectéplase, Urokinase, Idarucizumab…

### Revue code ciblée (worktree) — OK structurel
- Catalogue : boutons Valider fiches, Remettre à 0, compteur `#jpValidationCount`, panneau Complétude, scanner quasi-doublons `#jpFusionScanQuasi`.
- Paramétrage niveau : panneau catalogue + RPC `enregistrer_configuration_niveau` (016).
- Jeux : `renderResultQr` + Historique audit snapshots (`snapshots-audit.js`).
- Fiche aléatoire : `listerEligibles` → `filtrerMedicaments` / `visiblePourNiveau` ; filtres secteur/classe locaux.
- Mon espace : `progressionParSecteur` + lien `points-faibles/`.
- Admin suivi : section « Tableau de bord classe » si activité sélectionnée.
- Mobile CSS : `.jp-trous-table` min-width + scroll ; modal score feuille bas ≤720px / plein ≤480px.

### Non vérifié (besoin session admin + joueur)
Création/modif fiche, Valider / Remettre à 0, Complétude live, scanner UI, enregistrement `niveau_*`, wizard quiz/trous jusqu’au QR, Historique snapshots UI, bascule profil apprenti→pharmacien en FA, filtres FA live, progression / points faibles live, dashboard classe live, smoke responsive trous sur device.

### Pour rejouer l’E2E
1. Fournir un compte portail **admin** (et idéalement un joueur non-admin avec `site_access` Jeu Pharma) — ou se connecter manuellement dans le navigateur MCP.
2. Préférer le **worktree local** (ou Pages à jour) pour P2–P4.
3. Parcourir le périmètre listé dans le plan Priorité 1.

## Manuel restant (ops — pas code)
- [ ] Attribuer `site_access` aux joueurs (admins portail passent le gate sans ligne).
- [ ] (Optionnel) Sur les parties listées par l’audit Historique / `ops_audit_snapshots_archives.sql` : régénérer les quiz ou recréer les trous concernés.
- [ ] Rejouer E2E authentifié (voir section p1-e2e) après credentials + déploiement worktree.

## Ne pas
- Inventer UI / flux / IA hors demande.
- Utiliser `service_role` côté client.
- Importer `PhieEvreux/shared/*`.
- Réappliquer `001` / `002` / `004` / `005` / `007` / `008` sans vérifier l’état remote.
- Utiliser `portail.profiles.role` pour filtrer les classifications hospitalière / complexe : seule la valeur `pharmacien` de `profil_apprentissage` autorise ces fiches côté joueur.
- Impression via `window.open`.

## Règles Cursor
- `rules/architecture.mdc`, `security.mdc` (alwaysApply)
- `rules/design.mdc`, `rules/conventions.mdc` (globs)
