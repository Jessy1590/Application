# Module tasks

## 1. Identité

| Champ | Valeur |
|-------|--------|
| id | `tasks` / hub **À traiter** (alias access `inbox`) |
| label | À traiter |
| dossier | `src/modules/tasks/` |

## 2. Taskbar

| Élément | Valeur |
|---------|--------|
| Feature ids | `inbox` / `tasks` (alias) ; aussi `order`, `billing` (QuickAction) |
| Vues | `#inbox` / `#tasks` → `Tasks.jsx` ; `#order` / `#billing` → `QuickAction.jsx` |
| Composants | `Tasks.jsx`, `QuickAction.jsx`, `shared/PatientOrderForm.jsx` |

## 3. Dashboard

| Élément | Valeur |
|---------|--------|
| Page ids | `inbox` (+ alias `tasks` → `inbox`) → `TasksManager.jsx` |
| `canAccess` | alias inbox↔tasks |

## 4. Services

| Fichier | Rôle |
|---------|------|
| `taskService.js` | CRUD tâches / assignations, règles, QuickAction commande/facturation, compteurs badge |
| Shared | `taskCatalog.js`, `taskActions.js`, `taskDisplay.js` |

## 5. Logs

Aucun `logEvent` dans le module. Shell loggue `ui`/`module_view` à l’ouverture.

## 6. Tâches

| Source | Types |
|--------|-------|
| Catalogue (`taches`) | `commande`, `facturation`, `libre` |
| Catalogue divers | `etalonnage_rdv` (legacy affichage) |
| Créés ici | QuickAction + `createTask` / `createTaskForCategory` ; autres modules créent leurs types |
| `taskActions.js` | registre global close / dashboard / resume pour **tous** les types catalogue |

## 7. SQL

| Table | Colonnes clés | RLS |
|-------|---------------|-----|
| `tasks` | `titre`, `description` (JSON texte), `created_by` | créateur / assigné / admin |
| `task_assignments` | `statut` en_cours/terminee, commentaire, timing | own / admin |
| `task_role_rules` | catégorie × rôle × mode | admin |

Migrations `031`–`033`, `035`.

---

## 8. Fonctions exportées (services)

_Inventaire issu du code (2026-09-23). Colonnes Log / Tâches = état actuel, pas la cible._

### `services/taskService.js`

| Fonction | Rôle (résumé) | Args principaux | Tables / RPC | Tâches ? | Log ? |
|----------|---------------|-----------------|--------------|----------|-------|
| `resolveAssigneeIds` | Mise à jour / action métier — tables: task_role_rules | `category` | task_role_rules | non | non |
| `ensureTaskEscalations` | Idempotent : crée si absent — tables: task_role_rules, tasks, task_assignments | `—` | task_role_rules, tasks, task_assignments, rpc:ensure_task_escalations | non | non |
| `fetchAdminIds` | Lecture / recherche | `—` | — | non | non |
| `fetchAssigneeIds` | Lecture / recherche | `—` | — | non | non |
| `fetchTeamProfiles` | Lecture / recherche — tables: profiles | `—` | profiles | non | non |
| `fetchMyOpenAssignments` | Lecture / recherche — tables: task_assignments | `userId` | task_assignments | non | non |
| `countTodayPendingAssignments` | Lecture / recherche | `userId` | — | non | non |
| `updateTaskDescription` | Mise à jour / action métier — tables: tasks | `taskId, description` | tasks | non | non |
| `completeAssignmentByTaskId` | Mise à jour / action métier — tables: task_assignments | `taskId, commentaire` | task_assignments | non | non |
| `fetchTasks` | Lecture / recherche — tables: tasks, profiles | `—` | tasks, profiles | non | non |
| `fetchMyTasks` | Lecture / recherche — tables: task_assignments, tasks, profiles | `userId` | task_assignments, tasks, profiles | non | non |
| `fetchTasksCompletionMap` | Lecture / recherche — tables: task_assignments | `taskIds` | task_assignments | non | non |
| `createTask` | Création / enregistrement (+ crée tâche) — tables: tasks, task_assignments | `titre, description, userIds, createdBy` | tasks, task_assignments | oui | non |
| `createTaskForCategory` | Création / enregistrement (+ crée tâche) | `category, titre, description, createdBy, extraIds = []` | — | oui | non |
| `findOpenTask` | Fonction exportée — tables: tasks | `matchFn, { limit = 250 } = {}` | tasks | non | non |
| `ensureCategoryTask` | Idempotent : crée si absent (+ crée tâche) | `category, titre, details, createdBy, { extraIds = [], mat…` | — | oui | non |
| `completeCategoryTasks` | Mise à jour / action métier — tables: tasks | `category, matchKey, matchValue, commentaire = 'Clos autom…` | tasks | non | non |
| `completeTaskGlobal` | Mise à jour / action métier — tables: task_assignments | `taskId, commentaire, timeSeconds, completedBy` | task_assignments | non | non |
| `uncompleteTaskGlobal` | Fonction exportée — tables: task_assignments | `taskId` | task_assignments | non | non |
| `updateTask` | Mise à jour / action métier — tables: tasks | `taskId, titre, description` | tasks | non | non |
| `createComptoirQuickAction` | Création / enregistrement (+ crée tâche) — tables: agenda_events | `type, form, userId` | agenda_events | oui | non |

Autres exports (constantes / ré-exports) : `TASK_RULE_CATEGORIES`, `TASK_MODULES`, `taskCategoriesForModule`, `getTaskRuleCategory`.

### `shared/taskActions.js`

| Fonction | Rôle (résumé) | Args principaux | Tables / RPC | Tâches ? | Log ? |
|----------|---------------|-----------------|--------------|----------|-------|
| `getTaskAction` | Lecture / recherche | `detailsOrDesc` | — | non | non |
| `runTaskNavigation` | Fonction exportée | `def, details` | — | non | non |

Autres exports (constantes / ré-exports) : `TASK_ACTIONS`.

### `shared/taskCatalog.js`

| Fonction | Rôle (résumé) | Args principaux | Tables / RPC | Tâches ? | Log ? |
|----------|---------------|-----------------|--------------|----------|-------|
| `taskCategoriesForModule` | Fonction exportée | `moduleId` | — | non | non |
| `getTaskRuleCategory` | Lecture / recherche | `id` | — | non | non |

Autres exports (constantes / ré-exports) : `TASK_MODULES`, `TASK_RULE_CATEGORIES`.

### `shared/taskDisplay.js`

| Fonction | Rôle (résumé) | Args principaux | Tables / RPC | Tâches ? | Log ? |
|----------|---------------|-----------------|--------------|----------|-------|
| `parseTaskDetails` | Helper pur / formatage | `desc` | — | non | non |
| `isPlainTaskDetails` | Helper pur / formatage | `details` | — | non | non |
| `getTaskCategory` | Lecture / recherche | `description, titre = ''` | — | non | non |
| `plainTaskText` | Fonction exportée | `description` | — | non | non |

Autres exports (constantes / ré-exports) : `TASK_CATEGORY_LABELS`.

## 9. Handlers / actions UI

### `comptoir/QuickAction.jsx`

| Action / label (repère) | Handler | Appels service (détectés près du handler) | Feedback |
|-------------------------|---------|-------------------------------------------|----------|
| — | `handleSubmit` | `setSuccessMsg`, `setErrorMsg`, `createComptoirQuickAction`, `setTimeout`, `closeModuleWindow` | erreur UI, succès / feedback, ferme module |

### `comptoir/Tasks.jsx`

| Action / label (repère) | Handler | Appels service (détectés près du handler) | Feedback |
|-------------------------|---------|-------------------------------------------|----------|
| — | `handlePrimaryAction` | `getTaskAction`, `setRetraitModal`, `setRecompteModal`, `completeTask` | erreur UI |
| — | `handleRecompteConfirm` | `submitRecountResult`, `setRecompteModal`, `fetchMyTasks` | erreur UI |
| — | `handleRetraitConfirm` | `completeTask` | erreur UI |

Libellés boutons repérés dans le JSX : « Annuler », « Valider », « Valider recomptage ».

### `dashboard/TasksManager.jsx`

| Action / label (repère) | Handler | Appels service (détectés près du handler) | Feedback |
|-------------------------|---------|-------------------------------------------|----------|
| — | `handleCreate` | `createTask`, `setShowForm`, `setNewTask` | — |
| — | `handleCompleteTask` | `completeTaskGlobal` | — |
| — | `handleUncomplete` | `setEditingTaskId`, `setEditTaskForm`, `updateTask` | — |

## 10. Formulaires & données

### PatientOrderForm (`shared/PatientOrderForm.jsx`) — order & billing

| Champ | Label UI | Type | Requis | Notes |
|-------|----------|------|--------|-------|
| nom | Initiales nom (2 lett.) | text | oui | UPPER max 2 |
| prenom | Initiales prénom (2 lett.) | text | oui | UPPER max 2 |
| dob | Date de naissance | date | oui | — |
| medicament / cip | Médicament / CIP | text | order oui | MedicamentFields mode name+cip |
| facture | N° de facture | text | billing oui | — |
| recurrence_semaines | Récurrence (sem.) | number | order oui | défaut 4 |
| repetitions | Répétitions | number | order | — |
| commentaire | Commentaire | textarea | non | — |

**Save** : `createComptoirQuickAction(type, form, userId)` → tâche `commande` ou `facturation`.
**Agenda** : même formulaire pour événements commande_med / facturation.

## 11. Données affichées

| Source (fonction / requête) | Colonnes / usage UI |
|-----------------------------|---------------------|
| `taskService.js::fetchAdminIds` | tables/RPC : — |
| `taskService.js::fetchAssigneeIds` | tables/RPC : — |
| `taskService.js::fetchTeamProfiles` | tables/RPC : profiles |
| `taskService.js::fetchMyOpenAssignments` | tables/RPC : task_assignments |
| `taskService.js::countTodayPendingAssignments` | tables/RPC : — |
| `taskService.js::fetchTasks` | tables/RPC : tasks, profiles |
| `taskService.js::fetchMyTasks` | tables/RPC : task_assignments, tasks, profiles |
| `taskService.js::fetchTasksCompletionMap` | tables/RPC : task_assignments |
| `taskActions.js::getTaskAction` | tables/RPC : — |
| `taskCatalog.js::getTaskRuleCategory` | tables/RPC : — |
| `taskDisplay.js::getTaskCategory` | tables/RPC : — |

## 12. Gap logs / tasks (propositions)

_Propositions uniquement — ne pas implémenter depuis cette checklist sans validation produit._

### Logs probablement manquants

- [ ] `taskService.js::resolveAssigneeIds` — mutation sans `logEvent` (tables: task_role_rules)
- [ ] `taskService.js::updateTaskDescription` — mutation sans `logEvent` (tables: tasks)
- [ ] `taskService.js::completeAssignmentByTaskId` — mutation sans `logEvent` (tables: task_assignments)
- [ ] `taskService.js::createTask` — mutation sans `logEvent` (tables: tasks, task_assignments)
- [ ] `taskService.js::createTaskForCategory` — mutation sans `logEvent` (tables: —)
- [ ] `taskService.js::completeCategoryTasks` — mutation sans `logEvent` (tables: tasks)
- [ ] `taskService.js::completeTaskGlobal` — mutation sans `logEvent` (tables: task_assignments)
- [ ] `taskService.js::updateTask` — mutation sans `logEvent` (tables: tasks)
- [ ] `taskService.js::createComptoirQuickAction` — mutation sans `logEvent` (tables: agenda_events)

### Tâches — manques / câblage à vérifier

Créations détectées : `taskService.js::createTask`, `taskService.js::createTaskForCategory`, `taskService.js::ensureCategoryTask`, `taskService.js::createComptoirQuickAction`. Vérifier alignement catalogue `taskCatalog.js` + actions `taskActions.js`.

