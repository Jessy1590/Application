# État Jeu Pharma (handoff)

Dernière mise à jour : 2026-10-08 — niveau pédagogique `hospitalier` (`007`) remplace la case bool UI ; bool matrice sync ; `005` legacy.

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
- Vue `v_medicaments_complet` : `noms_commerciaux[]` + `nom_commercial` = 1er nom (compat / déprécié).
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
- [x] Notes **`006_catalogue_champs_actifs_notes.sql`** (pas de DDL) + audit dédup remote (2026-10-07) :
  - **0** groupe actif en doublon exact `valeur_norm` (tables entités actives) — index unique `_valeur_norm_actif_uidx` respecté ; aucune fusion RPC nécessaire
  - Pas de fusion sémantique (« AVC » vs « AVC ischémique ») — uniquement panneau Fusion / scanner doublons exacts

## Catalogue — champs actifs & entités liées
- Flag `actif` sur `JpConstants.CHAMP_CODES` + `champsActifs()` / `isChampActif()`.
- **Actifs** : noms commerciaux, DCI, secteur, classes théra/pharma, détail pharmacologie, indications, CI, EI, précautions, interactions, surveillances (+ statut, niveaux dont `hospitalier` exclusif DCI/noms).
- **Legacy masqués** (tables/données conservées) : posologie générale, grossesse & allaitement, voies d’administration — absents UI admin/joueur, CSV modèle, cases quiz/trous ; `JpMedicaments.save` ne touche plus ces FK/jonctions.
- **Picker fiche** : chips multi `{ id, valeur }` + recherche ; « Créer … » seulement si pas de match exact `valeur_norm` ; singuliers id forcé (`data-entity-id`) + Effacer ; save priorise les ids.
- **Filtre Paramètres → Lié à** : type d’entité + sélection entité → fiches via jonction / FK (`JpMedicaments.lieAEntite`).
- **CSV** : en-têtes champs actifs ; dry-run refuse colonnes inconnues, ignore legacy si présentes ; import `findOrCreate` inchangé.
- **Fusion** : RPC inchangé + scanner « doublons exacts valeur_norm » (garder le plus lié).

## Build code (livré)
- [x] `.cursor/` (rules + STATE).
- [x] SQL `sql/001` … `007_niveau_hospitalier.sql`.
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

## Manuel restant (ops — pas code)
- [ ] Attribuer `site_access` aux joueurs (admins portail passent le gate sans ligne).
- [ ] (Optionnel) Regénérer les snapshots quiz / grilles trous créés **avant** les merges (matrice_id archivés éventuels dans JSON).

## Ne pas
- Inventer UI / flux / IA hors demande.
- Utiliser `service_role` côté client.
- Importer `PhieEvreux/shared/*`.
- Réappliquer `001` / `002` / `004` / `005` / `007` sans vérifier l’état remote.
- Confondre le niveau pédagogique `hospitalier` (ou l’ancien bool) avec `portail.profiles.role` ou le niveau `pharmacien`.
- Impression via `window.open`.

## Règles Cursor
- `rules/architecture.mdc`, `security.mdc` (alwaysApply)
- `rules/design.mdc`, `rules/conventions.mdc` (globs)
