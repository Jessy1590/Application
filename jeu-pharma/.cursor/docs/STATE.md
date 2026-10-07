# État Jeu Pharma (handoff)

Dernière mise à jour : 2026-10-07 — admin **Création jeu** unifié (`jeux.html`) ; modèle DCI-centrique (`002`) inchangé.

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
- [x] Vérif post-migrate : **179** non-archive (**160** avec DCI uniques + **19** sans DCI), **0** groupe DCI dupliqué actif.

## Build code (livré)
- [x] `.cursor/` (rules + STATE).
- [x] SQL `sql/001_jeupharma_init.sql` + `sql/002_dci_centrique.sql`.
- [x] Socle hub / CSS / dual client / FAB / toasts / logs / bugs.
- [x] Admin + catalogue + quiz + trous + CSV + BDPM + profil + suivi charts.
- [x] Refactor DCI-centrique surfaces : `constants`, `medicaments`, `csv`, `bdm`, `trous`, `admin/catalogue`, `catalogue`, `admin/trous`, architecture.
- [x] Admin contenu unifié : `admin/catalogue.html` (table + édition + import + fusion + niveaux) ; redirects depuis medicaments / import-export / fusion / entites.
- [x] Admin jeux unifié : `admin/jeux.html` (« Création jeu ») — quiz + trous, liste Parties actuelles (jouer / imprimer / archiver / scores) ; redirects `quizz.html` / `trous.html` → `?type=`.

## Manuel restant (ops — pas code)
- [ ] Attribuer `site_access` aux joueurs (admins portail passent le gate sans ligne).
- [ ] (Optionnel) Regénérer les snapshots quiz / grilles trous créés **avant** le merge (matrice_id archivés éventuels dans JSON).
- [ ] (Optionnel) Traiter les **19** fiches actives sans `dci_id` (rattacher une DCI ou archiver).

## Ne pas
- Inventer UI / flux / IA hors demande.
- Utiliser `service_role` côté client.
- Importer `PhieEvreux/shared/*`.
- Réappliquer `001` / `002` sans vérifier l’état remote.
- Impression via `window.open`.

## Règles Cursor
- `rules/architecture.mdc`, `security.mdc` (alwaysApply)
- `rules/design.mdc`, `rules/conventions.mdc` (globs)
