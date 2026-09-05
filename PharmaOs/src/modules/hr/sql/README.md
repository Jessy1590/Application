# Module HR — SQL

Tables métier (`PharmaOs`) + lecture `portail.profiles` et `taskbar_logs` (présence, module home).

| Table | Rôle |
|-------|------|
| `work_schedules` | Planning théorique (pharmacie ou collaborateur) |
| `hr_absences` | Congés / absences |
| `hr_schedule_changes` | Retards / changements d’horaire |

Enums : `absence_type` (`conge` \| `absence` \| `maladie` \| `rtt` \| `formation` \| `autre`) ; motifs changements d’horaire côté app.

Fichiers : `tables.sql`, `rls.sql` — agrégat `supabase/migrations/006_pharmaos_modules_metier.sql`.
