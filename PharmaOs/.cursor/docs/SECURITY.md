# Sécurité — Electron & Supabase

## 1. Electron
- `contextIsolation: true`, `nodeIntegration: false` sur taskbar, module, dashboard et bug.
- Preload (`electron/preload.cjs`) expose uniquement `window.electronAPI`.
- Pont renderer : **`src/shared/windowService.js` uniquement**.
- IPC invoke : `window:setMode`, `window:openModule`, `window:openDashboard`, `window:closeModule`, `window:confirmModuleClose`, `window:setIgnoreMouseEvents`, `window:openBug`, `context:startWatch`, `context:stopWatch`.
- Events : `module:change-view`, `module:before-close`, `dashboard:navigate`, `context:text`.
- `bug:submit` : **retiré** — les bugs passent par `PharmaOs.bugs` / `bugService`.

## 2. Clés & schémas
- Clé **anon** uniquement (`VITE_SUPABASE_*`). Jamais `service_role` côté client (Edge `sync-bdpm` ; Portail : `invite-user` / `delete-user`).
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

## 5. Auth — compte (Portail Application)

La gestion compte (changement MDP / e-mail, invitation, recovery, suppression) est sur le **Portail** :
`Application/index.html` + `shared/portail-auth.js` + Edge `invite-user` / `delete-user`.

PharmaOS n’expose pas d’UI compte ; il utilise la session Auth existante.

Flag optionnel : `portail.profiles.must_change_password` (migration `043`) — gate sur le Portail après création MDP temporaire.

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
