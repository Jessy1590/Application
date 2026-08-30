# 🏛️ Architecture & Spécifications — App Desktop

## 1. Stack Technique
- **Core Desktop :** Electron (Main process en Node.js, IPC via Preload).
- **Framework UI :** React (JSX) bundlé avec Vite.
- **Styling :** Tailwind CSS + PostCSS.
- **BaaS / BDD :** Supabase (PostgreSQL). Schéma versionné localement dans `supabase/schema.sql`.

## 2. Carte Mentale du Projet
L'architecture sépare strictement le système (Electron) de l'interface (React) selon le modèle "Feature-First".

**Processus Principal (Backend Electron)**
- `electron/main.js` : Gère le cycle de vie de l'application, la création des fenêtres (Main et Modules) et écoute les événements IPC.
- `electron/preload.cjs` : Fait le pont sécurisé (Context Isolation) entre Node.js et React, exposant des API spécifiques à l'objet `window`.

**Processus de Rendu (Frontend React)**
- **Points d'entrée multiples :** 
  - `index.html` → `src/main.jsx` (Application principale, Dashboard, Taskbar).
  - `module.html` → `src/module-main.jsx` (Dédié à l'ouverture de fenêtres enfants légères pour des tâches spécifiques).
- **Core (`src/core/`) :** Contient la configuration globale et la gestion de session via `AuthContext.jsx`.
- **Services (`src/services/`) :** Agnostiques à l'UI, ils gèrent les données (`supabaseClient.js`, `dbServices.js`, `directoryService.js`) et la communication avec l'OS (`windowService.js`).

## 3. Découpage Modulaire (`src/modules/`)
Chaque grande fonctionnalité métier est isolée dans son propre dossier :
- **Auth :** Interfaces de connexion et d'authentification (`Login.jsx`).
- **Dashboard :** Vue principale résumant l'activité.
- **Taskbar :** Barre des tâches ou de navigation interne à l'application.
- **Directory & IP :** Gestion d'un annuaire de contacts et potentiellement d'adressage IP/Réseau.
- **Calls :** Interface liée aux appels (historique, VoIP, ou journal d'appels).
- **Tasks :** Gestion de tâches avec actions rapides (`QuickAction.jsx`).

## 4. Modèle de Données (Supabase)
Le projet s'appuie sur une base de données relationnelle riche pour gérer les activités métier et la télémétrie[cite: 20] :
- **Appels & Contacts :** La table `call_logs` enregistre les appels et est directement liée à `directory_contacts` via la clé étrangère `contact_id`[cite: 20]. L'annuaire stocke des informations complètes (pro/privées, conditions commerciales, etc.)[cite: 20].
- **Interventions Pharmaceutiques (IP) :** La table `act_ip_logs` trace les actes (patient, médecin lié à l'annuaire via `medecin_id`, médicament, intervention, statut)[cite: 20].
- **Gestion de Tâches :** Architecture relationnelle entre la table `tasks` (qui définit la tâche et son créateur via `created_by` pointant vers `profiles`) et la table `task_assignments` (qui gère l'attribution à un `user_id` et le suivi du temps/statut)[cite: 20].
- **Événements Spécifiques :** Des tables dédiées existent pour suivre la qualité (`quality_events`), les conseils donnés (`advice_events`) et les rendez-vous (`agenda_events`)[cite: 20].
- **Télémétrie UI :** La table `taskbar_logs` enregistre de manière granulaire les actions effectuées depuis la barre de tâches de l'application Electron[cite: 20].

## 5. Démarrage des applications npm
- App --> npm run electron:dev
- Dashoard --> npm run dev 