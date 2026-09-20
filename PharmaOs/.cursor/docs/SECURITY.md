# Sécurité — Electron & Supabase

## 1. Electron
- `contextIsolation: true`, `nodeIntegration: false` sur taskbar, module, dashboard et bug.
- Preload (`electron/preload.cjs`) expose uniquement `window.electronAPI`.
- Pont renderer : **`src/shared/windowService.js` uniquement**.
- IPC invoke : `window:setMode`, `window:openModule`, `window:openDashboard`, `window:closeModule`, `window:confirmModuleClose`, `window:setIgnoreMouseEvents`, `window:openBug`, `context:startWatch`, `context:stopWatch`.
- Events : `module:change-view`, `module:before-close`, `dashboard:navigate`, `context:text`.
- `bug:submit` : **retiré** — les bugs passent par `PharmaOs.bugs` / `bugService`.

## 2. Clés & schémas
- Clé **anon** uniquement (`VITE_SUPABASE_*`). Jamais `service_role` côté client (Edge `sync-bdpm`, `invite-user` seulement).
- Schémas exposés PostgREST : `PharmaOs`, `portail`, `bdm`.
- Autres schemas sur le même projet (`phieevreux`, `valorisation`, `public` finance) : legacy / autres apps — **ne pas y toucher** depuis PharmaOs.
- RPC BDPM `truncate` / `bulk_insert_*` / `rebuild_molecules_*` : exécution **révoquée** pour `anon` et `authenticated` (migration `040`) — `service_role` seulement.

## 3. Rôles (canoniques)
- Source : `portail.profiles.role` — `pharmacien` | `administrateur` | `préparateur` | `désactivé`.
- Legacy mappés côté app : `admin` → administrateur ; `équipe` / `member` / `gestionnaire` → préparateur.
- Helpers RLS : `is_pharma_admin()` (pharmacien ∪ administrateur), `is_pharma_staff()`, `is_app_administrateur()`.
- UI : matrice `role_access` + casquettes via `canAccess` — **pas** de gate `role === 'admin'` en dur.
- Ne pas lire les rôles dans `user_metadata`.

## 4. Modèle RLS (résumé)

### Isolation personnelle
Tables : `taskbar_logs`, `call_logs`, `act_ip_logs`, `quality_events`, …

| Verb | Utilisateur | Pharmacien / admin |
|------|-------------|-------------------|
| INSERT | `user_id = auth.uid()` | idem |
| SELECT | ses lignes | toutes (`is_pharma_admin`) |
| UPDATE | own si non clôturé (migration `042`) | admin |

### Tâches
SELECT / UPDATE scopés (créateur, assigné, administrateur) — migrations `032`/`033`.

### Stock
INSERT own ; SELECT staff ; UPDATE own (ouvert) ou admin.

## 5. Auth — compte, invitations, mots de passe

### Flux applicatifs (anon client)
- Changement MDP / e-mail : `supabase.auth.updateUser` (+ `verifyOtp` type `email_change` pour confirmer)
- Oubli MDP : `resetPasswordForEmail` → `verifyOtp` (`recovery`) → `updateUser({ password })`
- Invitation : `verifyOtp` (`invite`) puis définition du MDP
- Flag temporaire : `portail.profiles.must_change_password` (+ miroir `user_metadata.must_change_password`)
  - **Ne pas** stocker ce flag dans `app_metadata` (non modifiable par l’utilisateur)

### Création de comptes (admin)
- Edge Function `invite-user` (`supabase/functions/invite-user/`) — JWT vérifié, acteur `administrateur`
- Modes : `temp_password` (`auth.admin.createUser`) | `invite_email` (`auth.admin.inviteUserByEmail`)
- `service_role` **uniquement** dans l’Edge Function — jamais dans le client Electron

### Templates e-mail Auth (dashboard Supabase)
Pour Electron (pas de deep link fiable) : inclure `{{ .Token }}` (OTP 6 chiffres) dans les templates
`recovery`, `invite`, `email_change` (en plus ou à la place du seul `ConfirmationURL`).

### Mots de passe leakés
Activer **Leaked password protection** (Have I Been Pwned) :
Dashboard Supabase → Authentication → Password / Providers → option dédiée.
**Plan Pro+ requis.** Non activable via SQL ni MCP Auth. À faire manuellement sur le projet `kpjflntnotftpzffjbud`.

## 6. Pont LGO / CIP
Intention : complément LGO (clipboard aujourd’hui ; WinPharma / source CIP plus tard).
**En attente d’infos techniques** — ne pas inventer d’intégration produit.

## 7. Autocorrection / inbox
Module `inbox` (taskbar + dashboard) : file « À traiter » + correction de ses saisies.
Voir `DASHBOARD_EQUIPE.md` (implémenté via `inbox`, plus un dashboard « rôle équipe » séparé).
