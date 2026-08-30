# 🔒 Sécurité — Electron & Supabase

Ce document résume les principes de sécurité appliqués au client lourd, au dashboard web, et à la base distante, en intégrant l’analyse des règles RLS (Row Level Security) déployées sur Supabase.

## 1. Sécurité Electron (Client-side)
- **Context Isolation (`contextIsolation: true`) :** L’application React n’a aucun accès direct à Node.js. Elle doit utiliser exclusivement les ponts déclarés dans `electron/preload.cjs` (`window.electronAPI` uniquement).
- **Node Integration (`nodeIntegration: false`) :** Strictement désactivée sur **les deux** BrowserWindow (principale + module) pour empêcher les failles XSS d’exécuter du code natif.
- **Surface IPC :** canaux allowlistés `window:setMode` (valide `login|expanded|reduced`) et `window:openModule`. Pas d’API Node exposée (pas de `fs`, shell, etc.).
- **Dashboard :** pas d’Electron. Auth email/password ; **autorisation applicative** : `portail.profiles.role === 'admin'` (`ALLOWED_ROLES`). Un compte authentifié non-admin voit `AccessDenied` (ne remplace pas la RLS).
- **Clés :** uniquement la clé **anon** côté clients. Ne jamais embarquer `service_role`. L’App contient un **fallback URL/anon dans `supabaseClient.js`** : ne pas étendre ce pattern ; Dashboard refuse silencieusement si `.env` manquant. Ne pas committer `.env`.
- **Schémas API :** `PharmaOs` et `portail` doivent être dans les Exposed schemas Supabase, sinon 404 PostgREST. Ne pas exposer d’autres schémas.

## 2. Sécurité Base de Données (Supabase RLS)

L’architecture s’appuie fortement sur la vérification de l’état de connexion (`auth.role() = 'authenticated'`) et sur l’appropriation des lignes via l’ID utilisateur (`user_id = auth.uid()`). Les politiques vivent sur le projet distant (pas de `schema.sql` / migrations dans ce repo). Toute décision d’autorisation doit lire **`portail.profiles.role` / `app_metadata`**, jamais `user_metadata`.

### Logs et Événements (Isolation stricte)
Les tables `taskbar_logs`, `quality_events`, `advice_events`, `call_logs` et `act_ip_logs` fonctionnent sur un modèle d’isolation personnelle pour les utilisateurs standards :
- **Insertion :** Un utilisateur ne peut insérer des données que si elles lui sont attribuées (`auth.uid() = user_id`). L’App pose toujours `user_id: user.id` à l’insert (appels, IP, taskbar).
- **Lecture :** Un utilisateur ne voit que ses propres enregistrements (`auth.uid() = user_id`). Conséquence UI : l’historique Appels/IP dans la fenêtre module est **celui du user connecté**, pas l’équipe (le Dashboard admin s’appuie sur les policies admin pour tout voir).
- **Realtime :** la Taskbar s’abonne à `PharmaOs.task_assignments` avec `filter: user_id=eq.<uid>` — la RLS Realtime doit rester cohérente.

### Accès Administrateur Transverse
Pour les besoins de supervision Dashboard, une règle spécifique permet aux administrateurs de contourner cette isolation.
- **Condition :** `EXISTS (SELECT 1 FROM portail.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')`.
- **Application :** Cette règle s’applique en lecture (`SELECT`) sur `taskbar_logs`, `quality_events`, `advice_events` et autorise également la modification (`UPDATE`) sur `call_logs`. Le Dashboard met aussi à jour `act_ip_logs`, `tasks` / `task_assignments` (clôture globale), et supprime des `agenda_events` : **toute policy manquante fera échouer silencieusement ou 0 rows** (UPDATE RLS exige aussi un SELECT). Vérifier les policies avant d’ajouter un nouveau verb CRUD Dashboard.
- **JWT :** le rôle lu dans `profiles` n’est pas dans le JWT par défaut ; un changement de rôle n’est effectif qu’après rechargement de session côté client.

### Tables Ouvertes / Partagées
Certaines tables collaboratives sont librement accessibles à toute personne connectée à l’application :
- **Annuaire et Agenda :** Les tables `directory_contacts` et `agenda_events` sont ouvertes avec tous les privilèges (`ALL`) à n’importe quel utilisateur `authenticated`. L’App met à jour `directory_contacts.switch_rupture` depuis le module IP ; le Dashboard fait CRUD complet annuaire + delete/update agenda (et tâches liées). Traiter ces tables comme **données d’équipe**, pas personnelles.

### Gestion Collaborative des Tâches
Le système de gestion de tâches utilise un modèle RLS mixte pour favoriser la collaboration tout en protégeant les actions de base :
- **Lecture :** Tous les utilisateurs connectés peuvent voir l’ensemble des tâches (`tasks`) et de leurs assignations (`task_assignments`).
- **Création :** Un utilisateur ne peut insérer une nouvelle tâche que si `created_by` = `auth.uid()`. En revanche, n’importe quel utilisateur connecté peut créer une assignation. QuickAction assigne **tous** les ids de `portail.profiles` (pas seulement admin/équipe) — les policies INSERT sur `task_assignments` et SELECT sur `profiles` doivent le permettre.
- **Modification :** La définition d’une tâche ne peut être modifiée (`UPDATE`) que par son créateur (`created_by`). Le statut d’une assignation ne peut être modifié que par l’utilisateur à qui elle a été attribuée (`user_id = auth.uid()`). **Écart Dashboard :** `completeTaskGlobal` / `uncompleteTaskGlobal` font un `UPDATE` sur **toutes** les assignations d’une `task_id` (titulaire). Si la policy UPDATE est strictement `user_id = auth.uid()`, la clôture globale échoue pour les lignes des autres — toute évolution RLS doit coller à ce besoin admin **ou** le code doit être adapté (ne pas élargir RLS « au hasard »).
