# SQL — module perimes

## Tables
- `PharmaOs.perimes` — déclaration DLC (12 mois glissants) + décision admin
- `PharmaOs.perime_emplacements` — paramètres emplacements (dashboard admin)

### Colonnes perimes (principales)
`medicament`, `code`, `cip`, `lot`, `date_peremption`, `quantite`, `status`, `decision_due_at`,
`mise_en_avant` + dates + `emplacement` + `montant` + `message`,
`promo` + dates + `emplacement` + `montant` + `message`,
`challenge_*` + `challenge_message`,
`mea_task_id`, `promo_task_id`, `challenge_task_id`, `decision_task_id`

### Statuts
`declare` | `a_decider` | `valorise` | `laisser_perimer` | `litige` | `association` | `clos`

## Flux tâches
- Décision anticipée possible dès `declare`
- À J−3 mois : tâches équipe `perime_mea` / `perime_promo` / `perime_challenge`
- Scan via `ensureAllPerimeTasks` (dashboard)

## Migrations
- `014_perimes_workflow.sql`
- `015_perimes_emplacements_execution.sql`
