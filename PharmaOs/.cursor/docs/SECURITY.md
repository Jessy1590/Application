# 🔒 Sécurité — Electron & Supabase

Ce document résume les principes de sécurité appliqués au client lourd et à la base de données distante, en intégrant l'analyse des règles RLS (Row Level Security) déployées sur Supabase.

## 1. Sécurité Electron (Client-side)
- **Context Isolation (`contextIsolation: true`) :** L'application React n'a aucun accès direct à Node.js. Elle doit utiliser exclusivement les ponts déclarés dans `electron/preload.cjs`.
- **Node Integration (`nodeIntegration: false`) :** Strictement désactivée sur les fenêtres de rendu pour empêcher les failles XSS d'exécuter du code natif sur la machine de l'utilisateur.

## 2. Sécurité Base de Données (Supabase RLS)

L'architecture s'appuie fortement sur la vérification de l'état de connexion (`auth.role() = 'authenticated'`) et sur l'appropriation des lignes via l'ID utilisateur (`user_id = auth.uid()`)[cite: 20].

### Logs et Événements (Isolation stricte)
Les tables `taskbar_logs`, `quality_events`, `advice_events`, `call_logs` et `act_ip_logs` fonctionnent sur un modèle d'isolation personnelle pour les utilisateurs standards[cite: 20] :
- **Insertion :** Un utilisateur ne peut insérer des données que si elles lui sont attribuées (`auth.uid() = user_id`)[cite: 20].
- **Lecture :** Un utilisateur ne voit que ses propres enregistrements (`auth.uid() = user_id`)[cite: 20].

### Accès Administrateur Transverse
Pour les besoins de supervision, une règle spécifique permet aux administrateurs de contourner cette isolation.
- **Condition :** `EXISTS (SELECT 1 FROM portail.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')`[cite: 20].
- **Application :** Cette règle s'applique en lecture (`SELECT`) sur `taskbar_logs`, `quality_events`, `advice_events` et autorise également la modification (`UPDATE`) sur `call_logs`[cite: 20].

### Tables Ouvertes / Partagées
Certaines tables collaboratives sont librement accessibles à toute personne connectée à l'application[cite: 20] :
- **Annuaire et Agenda :** Les tables `directory_contacts` et `agenda_events` sont ouvertes avec tous les privilèges (`ALL`) à n'importe quel utilisateur possédant le rôle `authenticated`[cite: 20].

### Gestion Collaborative des Tâches
Le système de gestion de tâches utilise un modèle RLS mixte pour favoriser la collaboration tout en protégeant les actions de base[cite: 20] :
- **Lecture :** Tous les utilisateurs connectés peuvent voir l'ensemble des tâches (`tasks`) et de leurs assignations (`task_assignments`)[cite: 20].
- **Création :** Un utilisateur ne peut insérer une nouvelle tâche que si le champ `created_by` correspond à son propre identifiant (`auth.uid()`)[cite: 20]. En revanche, n'importe quel utilisateur connecté peut créer une assignation[cite: 20].
- **Modification :** La définition d'une tâche ne peut être modifiée (`UPDATE`) que par son créateur (`created_by`)[cite: 20]. Le statut d'une assignation ne peut être modifié que par l'utilisateur à qui elle a été attribuée (`user_id = auth.uid()`)[cite: 20].