# SQL — module tasks

## Tables
- `PharmaOs.tasks` — `id`, `titre`, `description` (json texte), `created_by`, `created_at`
- `PharmaOs.task_assignments` — `id`, `task_id`, `user_id`, `statut` (`en_cours` | `terminee`), `commentaire`, `completed_at`, `completion_time_seconds`

## RLS
- SELECT tasks : admin OR créateur OR assigné (`is_task_assignee` SECURITY DEFINER — pas d’EXISTS croisé)
- SELECT assignments : admin OR soi OR créateur tâche (`is_task_creator`)
- INSERT tasks : `created_by = auth.uid()`
- INSERT assignments : `is_pharma_staff()`
- UPDATE tasks : créateur OR admin
- UPDATE assignment : own OR admin
- Voir `032_tasks_rls_scope.sql` + `033_tasks_rls_no_recursion.sql`

## Fichiers stubs
- `tables.sql` — DDL documentaire (non appliqué ici ; agrégation phase sql)
- `rls.sql` — policies documentaires
