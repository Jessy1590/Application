# État actuel du projet (STATE)

## Phase foundation + shell (fait)

- Legacy préservé dans `Application/PharmaOs-legacy/`.
- Monorepo `PharmaOs/` : Vite + React 18 + Tailwind + Electron + electron-builder.
- Entrées : `index.html`, `module.html`, `dashboard.html`, `bug.html`.
- Auth : `portail.profiles` — `pharmacien` | `administrateur` | `préparateur` | `désactivé` + casquettes.
- Shell : Login + Taskbar (Dashboard si `canAccess`) + DashboardShell + hub « À traiter » (tasks).
- Thèmes CSS : `src/styles/themes.css` via `data-theme` (`clair` | `sombre` | `colore` | `contraste` | `daltonien`).
- Préférences UI : `"PharmaOs".user_preferences` (thème, placement / densité, polices) — page **Mon compte**.
- Polices : `data-font-tb` / `data-font-dash` (`sm` | `md` | `lg`).

## Modules (fait)

Principal, qualité, métier, admin, RH, magistrales, location (Phie), conseil, BDPM, stupéfiants, hub **À traiter** (tasks) + **Mes saisies** (autocorrection 72h).

Ancien module **`rental/` retiré** (tables droppées migration `041`) — remplacé par `location/`.

## Hub À traiter / Mes saisies (2026-09-23)

- **À traiter** = modèle **tasks** (`tasks` + `task_assignments` `en_cours`) : clôture + commentaire, actions typées (close / dashboard / resume via `taskActions.js`).
- **Comptoir** : `#inbox` et `#tasks` → UI Tasks « À traiter » ; badge taskbar `countTodayPendingAssignments` ; plus de hub agrégat Inbox.
- **Dashboard** : nav **À traiter** | **Mes saisies** | **Mon compte** (quotidien) — **pas** de nav séparée « Mes tâches » (`tasks` alias → `inbox`).
- **Mes saisies** = autocorrection règle **B** : créateur + `created_at` &lt; 72h + non clôturé/annulé + (`updated_by` null ou = soi) — migrations `048` + `050` ; UI chips tous modules avec saisies corrigeables.
- Module `inbox/` : Mes saisies seulement (`Inbox.jsx` mode `saisies`) ; stub legacy si `mode=hub`.

## Compte Auth (Portail Application — pas PharmaOS)

Les interfaces compte (MDP / e-mail / invitation / recovery OTP / suppression) vivent sur le **Portail** :
`Application/index.html` + `shared/portail-auth.js` + Edge `invite-user` / `delete-user`.

PharmaOS : login email/MDP existants + boutons deep-link Portail (`VITE_PORTAIL_URL` + IPC `shell:openExternal`).
Pas d’OTP / reset / invite dans Electron.

## Taskbar layout

- Placement : `haut` | `bas` | `gauche` | `droite` | `bas_gauche` | `bas_droite`.
- Densité : `compact` | `normal` | `detaillee` | `empilee` (legacy `auto`→`normal`, `stack`→`empilee`).
- IPC `window:setTaskbarLayout` → `computeBoundsForMode` dans `electron/main.js`.
- Migration `046` : thèmes contraste/daltonien, densités, `font_size_*`.

## Audit sécu / hygiene (2026-09-20+)

- Migration `040` : REVOKE `anon`/`authenticated` sur RPC BDPM destructives.
- Migration `041` : drop `daily_controls`, `equipment_calibrations`, `rental_*`.
- Migration `042` : UPDATE own saisies non clôturées + admin policies via `is_pharma_admin` (renforcé par `048`).
- Migration `048` : Mes saisies 72h — `updated_at` / `updated_by` + RLS règle B (appels / IP / qualité / stock).
- Migration `050` : Mes saisies étendu — même pattern sur litiges, périmés, magistrales, location, RH, caisse, stupéfiants, MDS, documents, conseils.
- Migration `043` : `portail.profiles.must_change_password` (utilisé par le Portail Application).
- Migration `044` : GRANT schema `portail` à `service_role` + `portail.is_admin()` legacy.
- Migration `045` : `"PharmaOs".user_preferences` + RLS own.
- Edge Functions portail : `invite-user`, `delete-user` (admin Auth — hors UI PharmaOS).
- Stupéfiants : gates `canAccess('dashboard','stupefiants')` (matrice Accès/rôles).
- IPC via `windowService` ; compteur tâches taskbar via `taskService.countTodayPendingAssignments`.
- `bug:submit` IPC retiré — bugs via Supabase uniquement.
- Docs README / SECURITY / ARCHITECTURE / DASHBOARD_EQUIPE / STATE alignés rôles canoniques.
- **Leaked password protection** : à activer manuellement (Dashboard Auth, plan Pro+) — non faisable via MCP.
- **Pont CIP / WinPharma** : en attente d’infos techniques.

## Journalisation taskbar (double écriture — volontaire)

`logTaskbarToggle` écrit :
1. `PharmaOs.app_logs` via `logEvent` (journal unifié admin)
2. `PharmaOs.taskbar_logs` (historique toggle login/expand/collapse)

Conserver les deux tant que l’UI Logs / analytics s’appuient dessus.

## Phase SQL

- Migrations repo : `001` … `050` (voir `supabase/migrations/README.md`).
- Source de vérité : agrégat `supabase/migrations/` ; miroirs `src/modules/*/sql/` (prefs, admin, conseil, inbox README-only).
- Live projet `kpjflntnotftpzffjbud` — schemas dédiés ; autres apps cohabitent (`phieevreux`, etc.) — ne pas toucher hors `PharmaOs` (+ REVOKE `bdm`).

## Packaging

- electron-builder NSIS + portable ; `CSC_IDENTITY_AUTO_DISCOVERY=false`.

## Notes

- Créer `.env` à la racine avant `npm run electron:dev` (`VITE_SUPABASE_*`, `VITE_PORTAIL_URL`).
- Aucun `.from()` dans les composants après migration — logique dans `services/`.
- Magistrales / Location : accès via matrice ou casquettes (défaut off pour pharmacien/préparateur sauf admin).
- Skills UX : `.agents/skills/` (hueyexe) + `.cursor/skills/pharmaos-ui/`.
