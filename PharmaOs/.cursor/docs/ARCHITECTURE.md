# 🏛️ Architecture & Spécifications — App Desktop + Dashboard

## 1. Stack Technique
Deux applications distinctes, même projet Supabase, schémas exposés **`PharmaOs`** (métier) et **`portail`** (profils / rôles). Jamais `public` pour le métier. Auth = `supabase.auth` (schéma interne).

- **App (`PharmaOs/App/`)** — client lourd pharmacie.
  - **Core Desktop :** Electron 32 (`electron/main.js` ESM, `electron/preload.cjs`). Fenêtre principale frameless, `alwaysOnTop` (`screen-saver`), non redimensionnable, transparente.
  - **Framework UI :** React 18 JSX, Vite 5 (port **5173**, `base: './'`, deux inputs HTML).
  - **Styling :** Tailwind CSS + PostCSS + lucide-react.
  - **BaaS :** `@supabase/supabase-js` v2, client défaut `db.schema: 'PharmaOs'` (`src/services/supabaseClient.js`). Env : `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (fallback hardcodé dans le client App — à ne pas recopier).
- **Dashboard (`PharmaOs/Dashboard/`)** — SPA web titulaire (Vite port **5174**, `base: '/PharmaOS/'` pour GitHub Pages). React 18, Tailwind, lucide-react, recharts, react-big-calendar, date-fns. Client Supabase **sans** fallback de clés ; même schéma défaut `PharmaOs`.

Pas de dossier `supabase/` local ni `schema.sql` versionné dans le repo.

## 2. Carte Mentale du Projet
Séparation stricte **Electron (OS)** vs **React (UI)** côté App ; Dashboard = React pur navigateur.

**Processus Principal (Backend Electron) — App uniquement**
- `electron/main.js` : cycle de vie, une fenêtre principale + une fenêtre module unique réutilisée. IPC :
  - `window:setMode` → `'login' | 'expanded' | 'reduced'` (bounds : login 420×480 centré ; sinon pleine largeur, y=0, h=60 ou 20). Recalc sur `display-metrics-changed`.
  - `window:openModule` → crée ou focus la fenêtre 900×600, charge `module.html#<view>`, ou envoie `module:change-view` si déjà ouverte.
- `electron/preload.cjs` : `contextIsolation: true`, `nodeIntegration: false`. Expose `window.electronAPI` : `setWindowMode`, `openModule`, `onModuleChangeView`.

**Processus de Rendu (Frontend React) — App**
- **Points d’entrée :**
  - `index.html` → `src/main.jsx` → `App.jsx` : auth puis **Taskbar** (pas de dashboard métier dans la fenêtre principale).
  - `module.html` → `src/module-main.jsx` : mini-routeur hash (`#directory|#call|#ip|#tasks|#order|#billing`).
- **Core (`src/core/`)** : `AuthContext.jsx` (session + `portail.profiles.display_name`), `config.js` (`WINDOW_MODES`).
- **Services (`src/services/`)** : `supabaseClient.js`, `windowService.js` (seul pont IPC côté UI), `dbServices.js` (logs taskbar / stubs quality & advice), `directoryService.js` (CRUD partiel ; l’UI Directory requête souvent Supabase en direct).

**Dashboard (navigateur)**
- `src/main.jsx` → `App.jsx` : routeur **état React** (`route.page` + `params`), pas de React Router.
- Gate : `isAuthenticated` → Login ; `isAuthorized` (rôle `admin` dans `portail.profiles`) → pages ; sinon `AccessDenied`.
- **Core :** `src/core/AuthContext.jsx` (`ALLOWED_ROLES = ['admin']`).
- **Pages :** `Dashboard`, `CallTracking`, `AgendaManager`, `TasksManager`, `IpManagement`, `DirectoryManager`, `Login`, `AccessDenied`.
- **Services :** `statsService.js`, `directoryService.js`, `ipService.js`, `agendaTaskService.js`, `supabaseClient.js`. Cibler `portail` via `.schema('portail')`.

## 3. Découpage Modulaire (`App/src/modules/` + `Dashboard/src/pages/`)
**App — fenêtre principale**
- **Auth :** `Login.jsx` (email/mot de passe).
- **Taskbar :** barre du haut ; collapse/expand + logs `taskbar_logs` (`login`/`expand`/`collapse`) ; badge tâches via Realtime `postgres_changes` sur `PharmaOs.task_assignments` filtrées `user_id`. Ouvre les modules IPC.
- **Dashboard (module) :** coquille vide (`return null`) — non utilisé comme vue principale.

**App — fenêtre module (`module-main.jsx`)**
- **Directory :** lecture `directory_contacts` (onglets `health_professional` | `commercial_partner`), appel → `openModule('call', contact)`.
- **Calls :** insert `call_logs` (ISO 9001 : type in/out/missed, motif, statut, notes) ; historique 10 derniers.
- **IP :** insert `act_ip_logs` (norme SFPC) ; médecins depuis l’annuaire ; option append `switch_rupture` sur le contact.
- **Tasks :** mes `task_assignments` `en_cours` (filtre date JSON dans `tasks.description` ≤ aujourd’hui) ; clôture individuelle.
- **QuickAction :** `order` → `commande_med` (série + tâches) ; `billing` → `facturation`. Crée `tasks` + `task_assignments` (tous les `portail.profiles`) + `agenda_events`. Placeholder pour vues inconnues (Quality/Advice Phase 2).

**Dashboard — pages titulaire**
- Accueil stats (IP, taskbar, appels, tâches ; **Advice/Quality encore mock**). `QualityStatsCard` existe mais n’est pas monté sur l’accueil.
- CRUD annuaire, suivi/édition appels, CRUD tâches (clôture **globale** par `task_id`), agenda (types `commande_med`, `facturation`, `changement_horaire`, récurrence `groupId`), Act-IP (édition + export JSON déclaration).

## 4. Modèle de Données (Supabase)
Schéma métier **`PharmaOs`**. Identités / rôles **`portail.profiles`** (`id` = `auth.users.id`, `display_name`, `role` : code Dashboard = `admin` ; listings équipe = `admin` | `équipe`).

- **Appels & Contacts :** `call_logs` (`user_id`, `type`, `contact_id` FK optionnelle vers `directory_contacts`, `contact_nom`, `numero`, `motif`, `statut_traitement` : `cloture` | `a_rappeler` | `transmis_pharmacien` | `en_attente`, `duree_secondes`, `notes_appel`). Annuaire : `type`, identité, tél pro/privé, MS Santé, conditions commerciales, `switch_rupture`, etc.
- **Interventions Pharmaceutiques :** `act_ip_logs` (`user_id`, patient initiales/âge/sexe, `medecin_id` / `medecin_nom`, `medicament_en_cause`, `probleme_identifie`, `type_intervention`, `avis_prescripteur`, `devenir_intervention`, `mode_transmission`, `statut_ip` : `Cloturee` | `En attente`, `commentaires`).
- **Tâches :** `tasks` (`titre`, `description` texte ou JSON métier, `created_by` → profiles) + `task_assignments` (`task_id`, `user_id`, `statut` `en_cours`|`terminee`, `commentaire`, `completed_at`, `completion_time_seconds`). Suppression tâches : CASCADE attendu sur les assignations.
- **Agenda :** `agenda_events` (`type`, `date_evenement`, `details` jsonb : `groupId`, `taskId`, patient, récurrence, horaires). Lien logique (pas forcément FK) tâche ↔ événement via `details.taskId`.
- **Télémétrie UI :** `taskbar_logs` (`user_id`, `action` : `login` | `expand` | `collapse`, `created_at`).
- **Phase 2 (stubs App + mock Dashboard) :** `quality_events`, `advice_events` — insert prévu dans `dbServices.js`, pas d’UI métier.

## 5. Démarrage des applications npm
Prérequis : Node.js, `npm install` dans **chaque** dossier (`App/` et `Dashboard/`). Fichiers `.env` d’après `.env.example`.

- App Desktop → `cd PharmaOs/App && npm run electron:dev` (Vite 5173 + Electron). Build prod : `npm run build` puis `npm run electron`.
- Dashboard → `cd PharmaOs/Dashboard && npm run dev` (Vite **5174**). Preview : `npm run preview`.
- Téléchargement des plugins : Node.js puis `npm install` dans le dossier de l’app visée.
