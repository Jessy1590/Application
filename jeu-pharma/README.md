# Jeu Pharma

App pédagogique vanilla (catalogue, quiz, tableaux à trous) — contenu issu des **cours physiques** (saisie / CSV). Pas de BDPM ni d’IA en v1.

URL Pages : `https://jessy1590.github.io/Application/jeu-pharma/`

## Prérequis

1. Projet Supabase partagé (clé **anon** uniquement côté client — `shared/supabase-config.js`).
2. Auth portail + `protect.js` + `site_access`.

## Checklist mise en service (portail)

À faire **manuellement** (pas de carte hardcodée dans le `index.html` racine du portail) :

| # | Action | Où |
|---|--------|-----|
| 1 | Exposer le schéma `jeupharma` (PostgREST) | Dashboard Supabase → Settings → API → Exposed schemas — voir aussi `supabase/SETUP.md` §3 |
| 2 | Appliquer le SQL init | SQL Editor → `sql/001_jeupharma_init.sql` (ne pas réappliquer sans vérifier) |
| 3 | ~~Créer le site **Jeu Pharma**~~ | Fait — `portail.sites.id` = `d4fc7fd0-944b-4594-9ba2-e1e2035aeddc` |
| 4 | URL du site | `https://jessy1590.github.io/Application/jeu-pharma/` |
| 5 | ~~Coller l’UUID (`portail.sites.id`)~~ | Fait — `js/supabase.js`, `.cursor/docs/STATE.md`, `has_jeupharma_access()` |
| 6 | Accès joueurs | Attribuer `site_access` (admins portail `profiles.role === 'admin'` passent le gate sans ligne) |

Les tuiles portail viennent de `portail.sites` — **ne pas** ajouter une carte en dur dans le HTML racine.

## Socle actuel

Hub, dual client (`sbPortail` / `sbJeu`), FAB Accueil / Bug (insert `bugs`), toasts, design tokens.

Admin (portail admin) : suivi Chart.js (`admin/suivi.html`), logs (`admin/logs.html`), bugs / statuts (`admin/bugs.html`).

## Structure

```
jeu-pharma/
  index.html          # hub
  catalogue.html
  espace.html         # profil + suivi (profil.html / quiz/suivi.html → redirect)
  quiz/  trous/  admin/
  js/                 # supabase, fab, bugs, logs, charts-admin, …
  css/
  sql/001_jeupharma_init.sql
  .cursor/docs/STATE.md
```
