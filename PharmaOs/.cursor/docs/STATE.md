# État actuel du projet (STATE)

## Phase foundation + shell (fait)

- Legacy préservé dans `Application/PharmaOs-legacy/`.
- Monorepo `PharmaOs/` : Vite + React 18 + Tailwind + Electron + electron-builder.
- Entrées : `index.html`, `module.html`, `dashboard.html`, `bug.html`.
- Auth : `portail.profiles` — `pharmacien` | `administrateur` | `préparateur` | `désactivé` + casquettes.
- Shell : Login + Taskbar (Dashboard si `canAccess`) + DashboardShell + inbox.

## Modules (fait)

Principal, qualité, métier, admin, RH, magistrales, location (Phie), conseil, BDPM, stupéfiants, **inbox** (À traiter / mes saisies).

Ancien module **`rental/` retiré** (tables droppées migration `041`) — remplacé par `location/`.

## Compte Auth (Portail Application — pas PharmaOS)

Les interfaces compte (MDP / e-mail / invitation / recovery OTP / suppression) vivent sur le **Portail** :
`Application/index.html` + `shared/portail-auth.js` + Edge `invite-user` / `delete-user`.

PharmaOS consomme la même Auth Supabase mais **ne gère pas** la création / modification de compte dans son UI Electron.

## Audit sécu / hygiene (2026-09-20)

- Migration `040` : REVOKE `anon`/`authenticated` sur RPC BDPM destructives.
- Migration `041` : drop `daily_controls`, `equipment_calibrations`, `rental_*`.
- Migration `042` : UPDATE own saisies non clôturées + admin policies via `is_pharma_admin`.
- Migration `043` : `portail.profiles.must_change_password` (utilisé par le Portail Application).
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

- Migrations repo : `001` … `043` (voir `supabase/migrations/README.md`).
- Source de vérité : agrégat `supabase/migrations/` ; miroirs `src/modules/*/sql/` (certains modules README-only : admin, conseil, inbox).
- Live projet `kpjflntnotftpzffjbud` — schemas dédiés ; autres apps cohabitent (`phieevreux`, etc.) — ne pas toucher hors `PharmaOs` (+ REVOKE `bdm`).

## Packaging

- electron-builder NSIS + portable ; `CSC_IDENTITY_AUTO_DISCOVERY=false`.

## Notes

- Créer `.env` à la racine avant `npm run electron:dev`.
- Aucun `.from()` dans les composants après migration — logique dans `services/`.
- Magistrales / Location : accès via matrice ou casquettes (défaut off pour pharmacien/préparateur sauf admin).
