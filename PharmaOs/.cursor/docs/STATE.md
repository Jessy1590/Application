# 📍 État actuel du projet (STATE)

## Fonctionnalités actives et structurelles
- **Setup Electron + Vite (App) :** `npm run electron:dev` — HMR React/Tailwind, fenêtre always-on-top, modes login / expanded (60px) / reduced (20px).
- **Sécurité Contextuelle (Preload) :** `preload.cjs` + isolation ; IPC modes fenêtre + fenêtre module unique (`module.html`).
- **Multi-Windows :** principale = Taskbar authentifiée ; satellite = Directory, Calls, IP, Tasks, QuickAction commande/facturation.
- **Fondation React App :**
  - Pas de router URL : `App.jsx` affiche Login **ou** Taskbar selon `AuthContext`.
  - Auth : `signInWithPassword` + `portail.profiles.display_name` (initiales, logout).
  - Module Dashboard Electron : **vide** (`Dashboard.jsx` → `null`). Pas de modules Quality / Advice (placeholders Phase 2).
- **Fondation React Dashboard :** SPA Vite 5174, navigation `onNavigate(page, params)`. Accès **admin uniquement**. Pages : stats, appels (filtre + édition statut/notes), agenda (calendrier + récurrence), tâches (CRUD, clôture globale, temps), Act-IP (édition + JSON), annuaire (CRUD). Cartes Advice (et Quality non montée) = **mocks**.
- **Couche Données :** clients `schema: 'PharmaOs'` ; profils via `.schema('portail')`. Tables utilisées en prod UI : `directory_contacts`, `call_logs`, `act_ip_logs`, `tasks`, `task_assignments`, `agenda_events`, `taskbar_logs`. Stubs non branchés : `quality_events`, `advice_events`. Pas de `schema.sql` dans le repo.
- **Services transverses App :** `windowService.js` (IPC). Realtime badge tâches. QuickAction aligne types agenda Dashboard (`commande_med`, `facturation`).
- **Écarts connus (ne pas « corriger » au passage sans demande) :** requêtes Supabase encore dans plusieurs modules App (pas seulement `src/services/`) ; `directoryService` App peu utilisé par Directory.jsx ; fallback anon hardcodé App ; import `modules/Ip/Ip.jsx` vs dossier `IP/` (OK Windows) ; rôles `équipe` vs commentaire Auth Dashboard `member`.

## Prochaines étapes de développement (TODO)
*(À compléter selon vos besoins métiers)*
- [ ] Brancher Quality / Advice (App + stats Dashboard, retirer mocks `getMockQualityStats` / `getMockAdviceStats`).
- [ ] Retirer le fallback de clés dans `App/src/services/supabaseClient.js` ; n’utiliser que `.env`.
- [ ] Aligner RLS admin avec les UPDATE/DELETE Dashboard (IP, clôture globale tâches, agenda) et documenter le résultat dans `SECURITY.md`.
- [ ] Extraire les `.from()` des modules App vers `src/services/` (règle `convention.mdc`).
- [ ] Décider du rôle équipe (`équipe` vs `member`) et filtrer QuickAction (aujourd’hui : tous les profiles).
- [ ] Utiliser ou supprimer `App/src/modules/Dashboard` et `QualityStatsCard` non monté.
