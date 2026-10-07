# État Jeu Pharma (handoff)

Dernière mise à jour : 2026-10-07 — **build applicatif complet** (passe de cohérence).

## Périmètre
App pédagogique vanilla sous `jeu-pharma/`. Schéma Supabase **`jeupharma`**. Auth portail (`protect.js` + `site_access`). Contenu = cours physiques / CSV ; **pas** de BDPM ni d’IA en v1.

## SITE_ID
- UUID portail : **`REPLACE_WITH_PORTAIL_SITE_UUID`** (valeur actuelle dans `js/supabase.js` — à remplacer).
- Coller le **même** UUID réel (`portail.sites.id`) dans :
  1. `js/supabase.js` → `SITE_ID` (placeholder textuel `REPLACE_WITH_PORTAIL_SITE_UUID`)
  2. ce fichier
  3. `sql/001_jeupharma_init.sql` → `has_jeupharma_access()` (placeholder UUID `00000000-0000-0000-0000-000000000000`)
- Les deux placeholders JS/SQL sont volontaires (formats différents) ; après création du site portail, **un seul UUID réel** partout.
- URL Pages : `https://jessy1590.github.io/Application/jeu-pharma/`
- Pas de carte hardcodée dans le `index.html` racine du monorepo — la tuile vient de `portail.sites`.

## Build code (livré)
- [x] `.cursor/` (rules architecture, security, design, conventions + ce STATE).
- [x] SQL init fichier `sql/001_jeupharma_init.sql` (apply dashboard = manuel).
- [x] Socle : hub, tokens CSS, dual client, FAB Accueil/Bug, toasts, JpLogs/JpBugs.
- [x] Admin catalogue (médicaments, entités, CSV, fusion, historique).
- [x] Catalogue lecture (fiches `publie`).
- [x] Quiz (RPC snapshot, entraînement/évaluation, print iframe, suivi joueur).
- [x] Tableaux à trous (admin + jouer).
- [x] Admin suivi Chart.js (`admin/suivi.html` + `charts-admin.js`).
- [x] Admin logs + bugs.
- [x] Constantes `CHAMP_CODES` / `ENTITY_TABLES` / niveaux alignées SQL + pages admin.
- [x] Checklist portail dans `README.md` + `supabase/SETUP.md` §3.

## Manuel restant (ops — pas code)
- [ ] Exposer le schéma `jeupharma` (Dashboard → Exposed schemas) — `supabase/SETUP.md` §3.
- [ ] Appliquer `sql/001_jeupharma_init.sql` (ne pas réappliquer sans vérifier l’état).
- [ ] Créer le site portail **Jeu Pharma** (URL Pages ci-dessus).
- [ ] Coller l’UUID dans `js/supabase.js`, ce STATE, et `has_jeupharma_access()` (même UUID).
- [ ] Attribuer `site_access` aux joueurs (admins portail passent le gate sans ligne).

## Ne pas
- Inventer UI / flux / IA hors demande.
- Utiliser `service_role` côté client.
- Importer `PhieEvreux/shared/*` (bugs/logs isolés dans `jeupharma`).
- Réutiliser Edge OCR/Gemini du monorepo sans demande explicite.
- Alourdir le hub joueur avec Chart.js.
- Hardcoder une carte Jeu Pharma dans le HTML portail racine.
- Impression via `window.open` (iframe same-document uniquement).

## Règles Cursor
- `rules/architecture.mdc`, `security.mdc` (alwaysApply)
- `rules/design.mdc`, `rules/conventions.mdc` (globs)
