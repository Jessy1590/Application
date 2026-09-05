# SQL — module agenda (dashboard-only)

## Table
- `PharmaOs.agenda_events`
  - `type` : `commande_med` | `facturation` | `changement_horaire`
  - `date_evenement` timestamptz/date
  - `details` jsonb (`groupId`, `taskId`, patient, récurrence, etc.)

## Liens
- Création souvent couplée à `tasks` / `task_assignments` (voir `agendaService` + `taskService`)

## RLS
- Accès `ALL` authenticated (données d’équipe)
