# État actuel du projet (STATE)



## Phase foundation + shell (fait)

- Legacy préservé dans `Application/PharmaOs-legacy/` (copie complète App + Dashboard + .cursor).

- Nouveau monorepo `PharmaOs/` : Vite + React 18 + Tailwind + Electron + electron-builder (NSIS/portable).

- Points d’entrée : `index.html`, `module.html`, `dashboard.html`.

- Auth unifiée : session + `display_name` + `role` (`portail.profiles` : pharmacien / administrateur / préparateur / désactivé).

- IPC : `setMode`, `openModule`, `openDashboard` ; isolation Electron OK.

- Shell : Login + Taskbar (bouton Dashboard selon matrice d’accès) + DashboardShell (nav + Administration : logs, bugs, accès).



## Lots modules (fait — 2026-09-03)

- Principal, qualité, métier, admin (home + hr) — UI + services + sql.

## Refonte RH (fait — 2026-09-10)

- Migration `016_hr_workflow` : `hr_absences.statut` (+ revue), `hr_schedule_changes.change_type`.
- Dashboard `HrManager` : planning grille, validation absences, retards, présence, récap corrigé.
- Comptoir taskbar `#hr` : mon planning, retard, demande absence, mes demandes.
- Tâche admin `hr_absence_demande` → bouton « Ouvrir RH dashboard ».



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

## Rôles, casquettes, dashboard, tâches (2026-09-20)

- Rôles portail : `pharmacien`, `administrateur`, `préparateur`, `désactivé` (legacy `admin` / `équipe` / `member` / `gestionnaire` → préparateur).
- **Casquettes** : tables `casquettes` / `casquette_features` / `profile_casquettes` ; `canAccess` = matrice `role_access` OU grants casquette.
- Sous-rôle Location Phie `gestionnaire` = métier UI Location, **distinct** du rôle portail (supprimé).
- Widgets accueil : `role_dashboard_widgets` + catalogue `dashboardWidgets.js`.
- Tâches : `task_role_rules` + `resolveAssigneeIds` / `ensureTaskEscalations` ; TasksManager = mes tâches sauf administrateur (vue équipe).
- Migrations `028`–`032`.

## Rôles, logs, bugs (2026-09-19)

- Matrice `PharmaOs.role_access` : pages dashboard et missions taskbar masquables par rôle (onglet Administration → Accès & rôles).
- Journal `PharmaOs.app_logs` : UI/auth/fenêtres côté client + trigger SQL sur INSERT/UPDATE/DELETE métier.
- Bugs en table `PharmaOs.bugs` (date, nom, information, statut nouveau/en_cours/modifié/impossible) à la place des fichiers `bug/*.md`.
- Migrations `024_roles_logs_bugs` + `025_roles_logs_harden`.

## Notes

- Le rename OS `PharmaOs` → `PharmaOs-legacy` a échoué (dossier verrouillé par Cursor) : legacy = **copie** robocopy, puis contenu actuel reconstruit in-place.

- Créer `.env` à la racine (copier `.env.example` ou `PharmaOs-legacy/App/.env`) avant `npm run electron:dev`.

- Aucun `.from()` dans les composants des modules qualité — logique BDD dans `services/`.

- Live : DEFAULT `magistral_orders.statut` aligné sur `devis` (migration `027_magistral_refonte`) ; statuts élargis (brouillon…cloture, dont `a_rappeler`) ; bucket Storage `magistral-ordonnances`.

- Magistrales v2 : formulaire partagé Annexe I + téléphone obligatoire ; réception BPP 7.12 + appel patient ; feuille de suivi A4 ; alertes home dashboard.

- Magistrales taskbar (2026-09-20) : groupe **Prépa.** comme Location — 4 boutons `magistral_creation` / `magistral_devis` / `magistral_rappel` / `magistral_dispenser` (feature unique `magistral`). Accès via matrice ou casquette `magistral`.

- Magistrales dashboard (2026-09-20) : sous-groupe nav **Préparations** — `magistral_suivi` / `magistral_creation` / `magistral_devis` / `magistral_rappel` / `magistral_dispenser` / `magistral_parametres` (alias legacy `magistral` → suivi). Plus d’onglets internes dans `MagistralManager`.


