# Sécurité — Electron & Supabase

## 1. Electron
- `contextIsolation: true`, `nodeIntegration: false` sur taskbar, module et dashboard.
- Preload (`electron/preload.cjs`) expose uniquement `window.electronAPI`.
- IPC allowlist :
  - `window:setMode` → `login` | `expanded` | `reduced`
  - `window:openModule`
  - `window:openDashboard`
  - `window:setIgnoreMouseEvents`
- Le renderer ne doit jamais importer `fs` / `path` / `electron`.

## 2. Clés & schémas
- Uniquement la clé **anon** (`VITE_SUPABASE_*`). Jamais `service_role` côté client.
- Schémas exposés PostgREST : `PharmaOs`, `portail`.
- Pas de fallback de clés hardcodé.
- Migrations versionnées : `supabase/migrations/` (agrégat) ; source de vérité par domaine : `src/modules/*/sql/`.

## 3. Rôles (canoniques)
- Source : `portail.profiles.role` — valeurs **`admin`** | **`équipe`**.
- Ne **pas** utiliser `member` dans le code ni les nouvelles écritures (valeur legacy encore tolérée par le CHECK SQL live pour compat).
- Helpers RLS : `portail.is_admin()`, `"PharmaOs".is_pharma_admin()`, `"PharmaOs".is_pharma_staff()` (`admin` ∪ `équipe`).
- UI Dashboard : `role === 'admin'` (bouton Taskbar + gate DashboardShell).
- Ne pas lire les rôles dans `user_metadata`.
- Un changement de rôle n’est effectif qu’après rechargement de session (pas dans le JWT par défaut).

## 4. Modèle RLS admin vs utilisateur

### Isolation personnelle (logs / événements nominatifs)
Tables : `taskbar_logs`, `call_logs`, `act_ip_logs`, `quality_events`.

| Verb | Utilisateur (`équipe`) | Admin |
|------|------------------------|-------|
| INSERT | `user_id = auth.uid()` | idem |
| SELECT | ses lignes seulement | **toutes** (`is_pharma_admin()`) |
| UPDATE | selon table (souvent own) | souvent autorisé (ex. `call_logs`, `act_ip_logs`, `quality_events`) |

Conséquence UI : historique Appels / IP en fenêtre module = **user connecté** ; Dashboard admin s’appuie sur les policies admin.

### Tables partagées équipe
`directory_contacts`, `agenda_events` : `ALL` pour `authenticated` (données d’équipe, pas personnelles).  
Modules métier collaboratifs (location, magistrales, PSL, caisse, lots, litiges, RH, contrôles, docs, périmés…) : `ALL` via `is_pharma_staff()`.

### Tâches — modèle mixte + clôture globale
- **SELECT** `tasks` / `task_assignments` : tout utilisateur authentifié.
- **INSERT** `tasks` : `created_by = auth.uid()` ; **INSERT** assignations : authentifié (QuickAction assigne les ids de `portail.profiles`).
- **UPDATE** `tasks` : créateur **ou** admin (`tasks_admin_all`).
- **UPDATE** `task_assignments` :
  - titulaire : `user_id = auth.uid()` ;
  - **admin** : `task_assignments_admin_update` pour `completeTaskGlobal` / `uncompleteTaskGlobal` (UPDATE de **toutes** les lignes d’un `task_id`).
- Realtime Taskbar : filtre `user_id=eq.<uid>` sur `task_assignments` — rester cohérent avec la RLS.

### Stock / signatures (exemples mixtes)
- `stock_errors` : INSERT own ; SELECT équipe ; UPDATE admin.
- `document_signatures` : INSERT own ; SELECT staff.

### Portail
- `profiles` : SELECT authentifié (nécessaire QuickAction / RH) ; INSERT/UPDATE self (+ admin update).
- `sites` / `site_access` / `access_requests` : lecture restreinte + gestion admin.

### Pièges Postgres RLS
- Un **UPDATE** nécessite aussi un **SELECT** sur la ligne (sinon 0 rows silencieux).
- Ne pas élargir les policies « au hasard » : coller au besoin produit (surtout clôture globale tâches).

## 5. Inventaire tables (31 + portail)
Voir audit legacy / `DOCS_ET_AUDIT_OFFICINE.md` : tables métier `PharmaOs` + `app_settings` ; portail : `profiles`, `sites`, `site_access`, `access_requests`.  
Tables legacy `advice_events` / `magistral_providers` / `magistral_price_rules` **supprimées** (migration `011`).

## 6. Dashboard équipe
- Vision hors v1 : `DASHBOARD_EQUIPE.md` — **aucun écran** Dashboard pour le rôle `équipe`.
