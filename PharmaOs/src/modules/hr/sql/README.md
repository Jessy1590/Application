# Module HR — SQL

Tables métier (`PharmaOs`) + lecture `portail.profiles` et `taskbar_logs` (présence, module home).

| Table | Rôle |
|-------|------|
| `work_schedules` | Planning (pharmacie / collab) + `week_pattern` A/B + `exception_week_start` + `special_week_id` |
| `hr_special_weeks` | Semaines nommées (ex. Noël 2026) du … au … |
| `hr_absences` | Congés / absences (workflow `en_attente` → `validee` / `refusee`) |
| `hr_schedule_changes` | Retards / départs / **changement_horaire** (workflow statut) |
| `app_settings` | clé `hr_min_staff` = seuils `{ preparateur, pharmacien, autre }` |

Enums :

- `absence_type` : `conge` \| `absence` \| `maladie` \| `rtt` \| `formation` \| `autre`
- `statut` : `en_attente` \| `validee` \| `refusee`
- `change_type` : `retard` \| `depart_anticipe` \| `autre` \| `changement_horaire`
- `week_pattern` : `all` \| `even` \| `odd`

Migrations : `016_hr_workflow.sql`, `017_hr_planning_extended.sql`, `018_hr_special_weeks.sql`.
