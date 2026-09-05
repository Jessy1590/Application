# SQL — module tasks

## Tables
- `PharmaOs.tasks` — `id`, `titre`, `description` (json texte), `created_by`, `created_at`
- `PharmaOs.task_assignments` — `id`, `task_id`, `user_id`, `statut` (`en_cours` | `terminee`), `commentaire`, `completed_at`, `completion_time_seconds`

## RLS (rappel docs SECURITY legacy)
- SELECT tasks / assignments : utilisateurs `authenticated`
- INSERT tasks : `created_by = auth.uid()`
- INSERT assignments : authenticated
- UPDATE tasks : créateur (`created_by`)
- UPDATE assignment (user) : `user_id = auth.uid()`
- UPDATE assignment global (Dashboard admin) : policy admin requise (clôture toutes lignes d’une `task_id`)

## Fichiers stubs
- `tables.sql` — DDL documentaire (non appliqué ici ; agrégation phase sql)
- `rls.sql` — policies documentaires
