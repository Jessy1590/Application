# État Jeu Pharma (handoff)

Dernière mise à jour : 2026-10-07 — schéma `jeupharma` exposé + SQL init appliqué sur projet `kpjflntnotftpzffjbud`.

## Périmètre
App pédagogique vanilla sous `jeu-pharma/`. Schéma Supabase **`jeupharma`**. Auth portail (`protect.js` + `site_access`). Contenu = cours physiques / CSV ; **pas** de BDPM ni d’IA en v1.

## SITE_ID
- UUID portail : **`d4fc7fd0-944b-4594-9ba2-e1e2035aeddc`**
- Aligné dans : `js/supabase.js` → `SITE_ID` ; ce fichier ; `sql/001_jeupharma_init.sql` → `has_jeupharma_access()` (remote + local).
- URL Pages : `https://jessy1590.github.io/Application/jeu-pharma/`
- Pas de carte hardcodée dans le `index.html` racine du monorepo — la tuile vient de `portail.sites`.

## Ops remote (projet `kpjflntnotftpzffjbud`)
- [x] Schéma `jeupharma` créé.
- [x] Exposition Data API / PostgREST : `jeupharma` ajouté à `authenticator.pgrst.db_schemas` (avec `public, storage, graphql_public, PharmaOs, portail, bdm, autres, valorisation, phieevreux`).
- [x] SQL init appliqué (helpers, tables, vue, RPC quiz/fusion, RLS) via migrations MCP `jeupharma_*`.
- [x] `has_jeupharma_access()` remote utilise `d4fc7fd0-944b-4594-9ba2-e1e2035aeddc` (pas le placeholder `00000000-…`).
- [x] Correctif local `normaliser_valeur` : `WHEN undefined_schema` remplacé (condition PL/pgSQL invalide) par fallback `OTHERS` / `public.unaccent`.

## Build code (livré)
- [x] `.cursor/` (rules architecture, security, design, conventions + ce STATE).
- [x] SQL init fichier `sql/001_jeupharma_init.sql` (**appliqué remote**).
- [x] Socle : hub, tokens CSS, dual client, FAB Accueil/Bug, toasts, JpLogs/JpBugs.
- [x] Admin catalogue (médicaments, entités, CSV, fusion, historique).
- [x] Catalogue lecture (fiches `publie`).
- [x] Quiz (RPC snapshot, entraînement/évaluation, print iframe, suivi joueur).
- [x] Tableaux à trous (admin + jouer).
- [x] Admin suivi Chart.js (`admin/suivi.html` + `charts-admin.js`).
- [x] Admin logs + bugs.
- [x] Constantes `CHAMP_CODES` / `ENTITY_TABLES` / niveaux alignées SQL + pages admin.
- [x] Checklist portail dans `README.md` + `supabase/SETUP.md` §3.
- [x] Profil apprentissage (`profil.html` + `js/profil.js` upsert `niveau_id`) ; préremplissage admin quiz/trous.

## Manuel restant (ops — pas code)
- [ ] Attribuer `site_access` aux joueurs (admins portail passent le gate sans ligne).
- [ ] (Optionnel) Aligner aussi « Exposed schemas » dans le Dashboard UI si l’écran n’affiche pas encore `jeupharma` — la source runtime est déjà `authenticator.pgrst.db_schemas`.

## Ne pas
- Inventer UI / flux / IA hors demande.
- Utiliser `service_role` côté client.
- Importer `PhieEvreux/shared/*` (bugs/logs isolés dans `jeupharma`).
- Réutiliser Edge OCR/Gemini du monorepo sans demande explicite.
- Alourdir le hub joueur avec Chart.js.
- Hardcoder une carte Jeu Pharma dans le HTML portail racine.
- Impression via `window.open` (iframe same-document uniquement).
- Réappliquer `001_jeupharma_init.sql` sans vérifier l’état remote (déjà appliqué).

## Règles Cursor
- `rules/architecture.mdc`, `security.mdc` (alwaysApply)
- `rules/design.mdc`, `rules/conventions.mdc` (globs)
