# SQL — module lot-alerts (retrait de lot)

## Tables
- `PharmaOs.lot_alerts` — alertes sanitaires / retraits
- `PharmaOs.lot_alert_acks` — accusés de lecture équipe
- Lie à `tasks`, `task_assignments`, éventuellement `supplier_disputes` (`lot_alert_id`)

### Colonnes utilisées
**lot_alerts** : `id`, `alert_number`, `declarant_id`, `medicament`, `lot`, `laboratoire`, `motif`, `source`, `external_ref`, `requires_return`, `return_location`, `task_id`, `status`, `steps_done`, `reception_validated_at`, `updated_at`, `created_at`  
**lot_alert_acks** : `alert_id`, `user_id`, `read_at` (contrainte unique `alert_id,user_id`)

### Enums
- `status` : `ouvert` | `en_cours` | `clos`
- `source` : `manuel` (défaut)

## RLS
Phase `sql` — lecture équipe ; INSERT admin Dashboard ; upsert acks `user_id = auth.uid()`.

## Fichiers stubs
- `tables.sql`, `rls.sql`
