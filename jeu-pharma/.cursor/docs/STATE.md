# État Jeu Pharma (handoff)

Dernière mise à jour : 2026-10-07 — refonte création tableau à trous (4 étapes + aperçu fidèle + `ligne_id`) ; hospitalier (`005`) + catalogue RCP (`004`) + score manuel ; modèle DCI-centrique (`002`) inchangé.

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
  - `matrice_medicaments.hospitalier boolean NOT NULL DEFAULT false` (pas de seed — admin coche)
  - vue `v_medicaments_complet.hospitalier`
  - `generer_et_geler_quiz` : exclut hospitalier si `niveau_cible <> 'pharmacien'`
  - Filtre client : catalogue joueur + trous (`JpMedicaments.visiblePourNiveau`) ; admin catalogue voit tout + case à cocher

## Build code (livré)
- [x] `.cursor/` (rules + STATE).
- [x] SQL `sql/001` … `005_hospitalier.sql`.
- [x] Socle hub / CSS / dual client / FAB / toasts / logs / bugs.
- [x] Admin + catalogue + quiz + trous + CSV + BDPM + profil + suivi charts.
- [x] Refactor DCI-centrique surfaces : `constants`, `medicaments`, `csv`, `bdm`, `trous`, `admin/catalogue`, `catalogue`, `admin/trous`, architecture.
- [x] Admin contenu unifié : `admin/catalogue.html` (table + création/édition en modal `.jp-catalogue-fiche-modal` + import + fusion + niveaux) ; redirects depuis medicaments / import-export / fusion / entites. Filtre **Incomplètes** dans Paramètres → Filtres (global = noms/DCI/secteur ; ou champ ciblé via `jpIncompletChamp`).
- [x] Admin jeux unifié : `admin/jeux.html` (« Création jeu ») — onglets **Historique** | Quiz | Tableau à trous ; Historique = liste filtrée (en cours / terminés / archivés) ; Quiz/Trous = création seule (même structure CSS `.jp-quiz-admin-*`) ; redirects `quizz.html` / `trous.html` → `?type=`.
- [x] Trous jouer — flux score manuel (voir section ci-dessous).
- [x] Refonte création tableau à trous (voir section ci-dessous) — **pas de migration Supabase**.

## Création tableau à trous (refonte admin)
- UI : `admin/jeux.html` panneau Trous — **4 étapes** (Lignes → Colonnes → Trous → Titre) + **aperçu permanent** auto-refresh ; plus de « Prévisualiser » ni select Aléatoire/Manuel exclusif.
- Étape 1 : niveau (filtre hospitalier via `visiblePourNiveau`) ; filtres multi (secteurs + classes théra/pharma + texte) — **OR intra-filtre, AND inter-filtres** ; interrupteur « Une ligne par nom commercial » + retouche noms par fiche ; max lignes + « Tirer les lignes au hasard » (tirage figé jusqu’au re-clic).
- Étape 3 : densité + « Tirer les trous au hasard » + clic case + « Effacer les trous ».
- Création = **exactement la grille affichée** (zéro re-tirage) via `buildSnapshot({ lignes, colonnes, trous })`.
- Snapshot : chaque ligne a `ligne_id` (`matriceId` ou `matriceId:nomCommercialId`) + `label` + `matrice_id` (+ `nom_commercial_id` si applicable).
- `configuration_json` : `colonnes`, `densite`, `max_lignes`, `par_nom`, `filtres`.
- Compat parties anciennes : `JpTrous.ligneKey` / jouer / score / `evaluer` / `listerTrous` — repli sur `matrice_id` si pas de `ligne_id`.
- Fichiers : `admin/jeux.html`, `js/admin-jeux.js`, `js/trous.js`, `trous/jouer.html`, `css/app.css`.

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
- Réappliquer `001` / `002` / `004` / `005` sans vérifier l’état remote.
- Confondre `hospitalier` / niveau pédagogique `pharmacien` avec `portail.profiles.role`.
- Impression via `window.open`.

## Règles Cursor
- `rules/architecture.mdc`, `security.mdc` (alwaysApply)
- `rules/design.mdc`, `rules/conventions.mdc` (globs)
