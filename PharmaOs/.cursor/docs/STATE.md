# État actuel du projet (STATE)



## Phase foundation + shell (fait)

- Legacy préservé dans `Application/PharmaOs-legacy/` (copie complète App + Dashboard + .cursor).

- Nouveau monorepo `PharmaOs/` : Vite + React 18 + Tailwind + Electron + electron-builder (NSIS/portable).

- Points d’entrée : `index.html`, `module.html`, `dashboard.html`.

- Auth unifiée : session + `display_name` + `role` (`portail.profiles`).

- IPC : `setMode`, `openModule`, `openDashboard` ; isolation Electron OK.

- Shell : Login + Taskbar (bouton Dashboard admin-only) + DashboardShell (nav).



## Lots modules (fait — 2026-09-03)

- Principal, qualité, métier, admin (home + hr) — UI + services + sql.



## Phase SQL (fait — 2026-09-03)

- Inventaire tables services + live Supabase (`kpjflntnotftpzffjbud`) : **29** tables `PharmaOs` + **4** `portail` (après drop module controls).

- Source de vérité : `src/modules/<domaine>/sql/tables.sql` + `rls.sql`.

- Agrégat ordonné : `supabase/migrations/001` … `009` (portail → helpers → core → directory/calls → qualité → métier → enums → drop controls).

- `SECURITY.md` : modèle RLS admin vs user, rôle canonique **`équipe`** (pas `member`), note clôture globale tâches.

- Script régénération : `scripts/generate-sql-from-live.mjs` (+ `supabase/_dumps/constraints.json`).

- Hors scope migrations : Banque / Valorisation / Vaccin / Fromage (restent dans `Application/supabase/SETUP.md`).



## Phase packaging (fait — 2026-09-03)

- electron-builder configuré : NSIS + portable, asar, artefacts nommés (`PharmaOS-<ver>-x64-Setup.exe` / `…-portable.exe`).
- Vite build OK (3 HTML : index, module, dashboard → `dist/`).
- Scripts npm complets : `dev`, `electron:dev`, `build`, `dist`.
- `CSC_IDENTITY_AUTO_DISCOVERY=false` + `signAndEditExecutable: false` (pas de certificat code-signing).
- README.md racine : démarrage, .env, rôles admin/équipe, commandes packaging, pointeur legacy.
- `.env` copié depuis legacy (`.env.example` déjà présent, `.env` gitignored).
- Sortie attendue : `release/PharmaOS-0.1.0-x64-Setup.exe` + `release/PharmaOS-0.1.0-x64-portable.exe`.

## Tout est fait ✓

## Module controls retiré (2026-09-03)

- UI + services `src/modules/controls/` supprimés (Taskbar, nav dashboard, `#controls`).
- Tables live droppées : `PharmaOs.daily_controls`, `PharmaOs.equipment_calibrations` (migration `009`).
- Module `quality` / `quality_events` conservé. Affichage tâches `etalonnage_rdv` conservé (pas de nouvelles créations).

## Notes

- Le rename OS `PharmaOs` → `PharmaOs-legacy` a échoué (dossier verrouillé par Cursor) : legacy = **copie** robocopy, puis contenu actuel reconstruit in-place.

- Créer `.env` à la racine (copier `.env.example` ou `PharmaOs-legacy/App/.env`) avant `npm run electron:dev`.

- Aucun `.from()` dans les composants des modules qualité — logique BDD dans `services/`.

- Live : DEFAULT historique `profiles.role = member` / `magistral_orders.statut = brouillon` ; migrations neuves préfèrent `équipe` / `devis` (CHECK live déjà `devis|commande|…`).


