# SQL — module stock (erreurs de stock)

## Tables
- `PharmaOs.stock_errors` — écarts déclarés
- Lie à `tasks` / `task_assignments` (tâche admin / recomptage)

### Colonnes utilisées
`id`, `user_id`, `medicament`, `cip`, `quantite_theorique`, `quantite_constatee`, `description`, `status`, `task_id`, `admin_decision`, `admin_notes`, `resolved_by`, `resolved_at`, `created_at`

### Enums
- `status` : `ouvert` | `recompter` | `erreur_commande` | `cloture`
- `admin_decision` : `recompter` | `erreur_commande`

## RLS
Phase `sql` — INSERT / SELECT perso ; UPDATE admin résolution.

## Fichiers stubs
- `tables.sql`, `rls.sql`
