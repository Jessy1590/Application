# État actuel du projet (STATE)

## Phase foundation + shell (fait)

- Legacy préservé dans `Application/PharmaOs-legacy/`.
- Monorepo `PharmaOs/` : Vite + React 18 + Tailwind + Electron + electron-builder.
- Entrées : `index.html`, `module.html`, `dashboard.html`, `bug.html`.
- Auth : `portail.profiles` — `pharmacien` | `administrateur` | `préparateur` | `désactivé` + casquettes + `must_change_password`.
- Shell : Login (connexion / oubli MDP / invitation OTP) + Taskbar (Dashboard si `canAccess`, Mon compte) + DashboardShell + inbox.

## Modules (fait)

Principal, qualité, métier, admin, RH, magistrales, location (Phie), conseil, BDPM, stupéfiants, **inbox** (À traiter / mes saisies).

Ancien module **`rental/` retiré** (tables droppées migration `041`) — remplacé par `location/`.

## Compte Auth (fait — 2026-09-20)

Interfaces branchées sur Auth Supabase (anon client + Edge admin) :

| Flux | UI | API |
|------|----|-----|
| Changer MDP / e-mail / nom | Dashboard `compte`, module `#compte`, taskbar icône UserCog | `updateUser`, `verifyOtp` (`email_change`) |
| Mot de passe oublié | Login → OTP + nouveau MDP | `resetPasswordForEmail` → `verifyOtp` (`recovery`) |
| Réponse invitation | Login → « J’ai reçu une invitation » | `verifyOtp` (`invite`) + `updateUser` |
| Compte MDP temporaire | Accès & rôles → Nouveau compte | Edge `invite-user` mode `temp_password` |
| Invitation e-mail | Même panneau | Edge `invite-user` mode `invite_email` |
| Gate MDP forcé | Overlay `ForcePasswordChangeGate` (taskbar / module / dashboard) | flag `must_change_password` |

Fichiers clés :
- `src/modules/admin/services/accountService.js`
- `src/modules/admin/shared/AccountForms.jsx`
- `src/modules/admin/dashboard/AccountManager.jsx`, `InviteUserPanel.jsx`
- `src/shell/Login.jsx` ; feature dashboard `compte` (toujours si accès dashboard)

Edge Function live : `invite-user` (repo `supabase/functions/invite-user/`, projet `kpjflntnotftpzffjbud`).
Templates Auth : pour Electron, préférer OTP `{{ .Token }}` dans recovery / invite / email_change.

## Audit sécu / hygiene (2026-09-20)

- Migration `040` : REVOKE `anon`/`authenticated` sur RPC BDPM destructives.
- Migration `041` : drop `daily_controls`, `equipment_calibrations`, `rental_*`.
- Migration `042` : UPDATE own saisies non clôturées + admin policies via `is_pharma_admin`.
- Migration `043` : `portail.profiles.must_change_password` + UI compte Auth.
- Edge Function `invite-user` : rôles canoniques + modes `temp_password` | `invite_email` (pas de flag dans `app_metadata` — non clearable côté user).
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
