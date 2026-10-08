# État Jeu Pharma (handoff)

Dernière mise à jour : 2026-10-08 — `016` configuration pédagogique centralisée par niveau + suppression staging ATC.

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
- [x] Migration **`007_niveau_hospitalier`** (MCP + fichier `sql/007_niveau_hospitalier.sql`) :
  - Seed `jeupharma.niveaux` code `hospitalier` (ordre 7) + `JpConstants.NIVEAUX`
  - Données : matrices `hospitalier=true` → `niveaux_connus = ['hospitalier']` sur DCI + noms commerciaux liés (6 DCI / 6 noms)
  - Bool `matrice.hospitalier` **conservé** : dérivé au save si DCI/noms portent le niveau hospitalier (exclusif)
  - `generer_et_geler_quiz` : pool = hospitaliers **ssi** `niveau_cible = 'hospitalier'` ; sinon exclus
  - UI : case « Hospitalier (pharmacien) » retirée ; contrôle = niveaux DCI / noms (Hosp exclusif)
  - Filtre client : `visiblePourNiveau` → visible seulement si niveau `hospitalier` (plus le hack pharmacien)
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
  - Pas de fusion sémantique (« AVC » vs « AVC ischémique ») — uniquement panneau Fusion / scanner doublons exacts
- [x] Migration **`014_fiche_validee`** (MCP + `sql/014_fiche_validee.sql`) :
  - `matrice_medicaments.fiche_validee boolean NOT NULL DEFAULT false` + colonne exposée dans `v_medicaments_complet`
  - Admin catalogue : bouton **Valider fiches** (file des fiches non validées du filtre courant) → **Validé** (écrit en base) ou **Modifier** (ouvre l’éditeur, reprend la file au fermeture)
  - Filtre toolbar « À valider / Validées » + badge tableau ; **Remettre à 0** remet `fiche_validee=false` sur les fiches du filtre actuel
  - Toute sauvegarde éditeur remet `fiche_validee` à `false` ; API `JpMedicaments.setFicheValidee` / `resetFicheValidee`
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
- **Actifs** : noms commerciaux, DCI, secteur, classes théra/pharma, détail pharmacologie, indications, CI, EI, précautions, interactions, surveillances (+ statut et booléen fiche hospitalière).
- Disponibilité par niveau : panneau admin centralisé (taxonomies + champs), sans `niveaux_connus` sur chaque valeur.
- **Legacy masqués** (tables/données conservées) : posologie générale, grossesse & allaitement, voies d’administration — absents UI admin/joueur, CSV modèle, cases quiz/trous ; `JpMedicaments.save` ne touche plus ces FK/jonctions.
- **Picker fiche** : chips multi `{ id, valeur }` + recherche ; « Créer … » seulement si pas de match exact `valeur_norm` ; singuliers id forcé (`data-entity-id`) + Effacer ; save priorise les ids.
- **Filtre Paramètres → Lié à** : type d’entité + sélection entité → fiches via jonction / FK (`JpMedicaments.lieAEntite`).
- **CSV** : en-têtes champs actifs ; dry-run refuse colonnes inconnues, ignore legacy si présentes ; import `findOrCreate` inchangé.
- **Fusion** : RPC inchangé + scanner « doublons exacts valeur_norm » (garder le plus lié).

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

## Création quiz (refonte admin)
- UI : `admin/jeux.html` panneau Quiz — **4 étapes** (Médicaments → Paramètres → Questions → Titre) ; **pas d’aperçu grille** (liste de questions éditable à l’étape 3).
- Étape 1 : niveau (filtre fiches hospitalières via `visiblePourNiveau` — niveau `hospitalier` uniquement) ; filtres multi (secteurs + classes théra/pharma + texte) — **OR intra-filtre, AND inter-filtres** (même logique que trous) ; coches médicaments = pool QCM.
- Étape 2 : champs interrogés + nb questions + nb propositions.
- Étape 3 : « Générer les questions » ; par question : **Supprimer** / **Régénérer** ; « Ajouter une question » (même contraintes filtres/champs). Génération **client** (`JpQuizz.genererQuestions` / `genererUneQuestion`) — distracteurs priorité même secteur puis pool.
- Création = **exactement la liste affichée** via `JpQuizz.createWithSnapshot` (insert `snapshot_questions`, **zéro** appel `generer_et_geler_quiz`).
- `configuration_json` : `champs_interroges`, `nb_questions` (= longueur snapshot), `nb_propositions`, `distracteurs`, `filtres` ; `secteur_therapeutique_id` = seul secteur coché s’il y en a exactement un (sinon null).
- RPC `generer_et_geler_quiz` conservée (legacy / `createAndGenerate` / `regenerer`) — ne gère ni filtres multi ni régénération unitaire.
- Fichiers : `admin/jeux.html`, `js/admin-jeux.js`, `js/quizz.js`, `css/app.css` ; docs STATE + architecture.

## Création tableau à trous (refonte admin)
- UI : `admin/jeux.html` panneau Trous — **4 étapes** (Lignes → Colonnes → Trous → Titre) + **aperçu** auto-refresh (bouton Masquer / Afficher l’aperçu, UI only) ; plus de « Prévisualiser » ni select Aléatoire/Manuel exclusif.
- Étape 1 : niveau (filtre fiches hospitalières via `visiblePourNiveau` — niveau `hospitalier` uniquement) ; filtres multi (secteurs + classes théra/pharma + texte) — **OR intra-filtre, AND inter-filtres** ; interrupteur « Une ligne par nom commercial » + retouche noms par fiche ; max lignes + « Tirer les lignes au hasard » (tirage figé jusqu’au re-clic).
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
- Filtre : `JpMedicaments.visiblePourNiveau` + `JpProfil.getNiveauCode()` (joueur, pas le bypass admin du catalogue).
- RLS : select soi ou `is_portail_admin()` ; insert soi + `has_jeupharma_access()`.
- **Suivi** : scores dans Mon espace (`espace.html`) + admin suivi Chart.js (`charts-admin.js`) — type « Fiche aléatoire », libellé DCI · noms, note /10.
- Fichiers : `fiche-aleatoire/index.html`, `js/fiche-aleatoire.js`, `espace.html`, `admin/suivi.html`, `js/charts-admin.js`, `index.html`, `sql/008_scores_fiche_aleatoire.sql`.

## Manuel restant (ops — pas code)
- [ ] Attribuer `site_access` aux joueurs (admins portail passent le gate sans ligne).
- [ ] (Optionnel) Regénérer les snapshots quiz / grilles trous créés **avant** les merges (matrice_id archivés éventuels dans JSON).

## Ne pas
- Inventer UI / flux / IA hors demande.
- Utiliser `service_role` côté client.
- Importer `PhieEvreux/shared/*`.
- Réappliquer `001` / `002` / `004` / `005` / `007` / `008` sans vérifier l’état remote.
- Confondre le niveau pédagogique `hospitalier` (ou l’ancien bool) avec `portail.profiles.role` ou le niveau `pharmacien`.
- Impression via `window.open`.

## Règles Cursor
- `rules/architecture.mdc`, `security.mdc` (alwaysApply)
- `rules/design.mdc`, `rules/conventions.mdc` (globs)
