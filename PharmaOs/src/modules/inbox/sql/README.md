# Inbox — Mes saisies (autocorrection)

Pas de tables dédiées inbox. **À traiter** = module `tasks/` (`tasks` + `task_assignments`) — plus d’agrégat hub dans ce dossier.

- **Mes saisies** (comptoir compact / dashboard) : `Inbox.jsx` mode `saisies` + `inboxService.js` — chips par module (seulement ceux avec lignes), tri récent, règle B alignée RLS.
- RLS base (own UPDATE non clôturé) : `042_mes_saisies_rls_own_update.sql`.
- **Mes saisies 72h (règle B)** : `048_mes_saisies_72h_updated.sql` puis `050_mes_saisies_all_modules.sql`
  - colonnes `updated_at` / `updated_by` + trigger `set_updated_at_and_by()`
  - own UPDATE si : créateur + `created_at` &lt; 72h + non clôturé/annulé + (`updated_by` null ou = `auth.uid()`)
  - **048** : `call_logs`, `act_ip_logs`, `quality_events`, `stock_errors`
  - **050** : `supplier_disputes`, `perimes`, `magistral_orders`, `location_dossiers`, `location_contacts`, `hr_absences`, `hr_schedule_changes`, `cash_closures`, `stupefiant_releves`, `psl_units`, `psl_movements`, `documents`, `conseils`
- Hors scope Mes saisies : `directory_contacts` / `lot_alerts` / `agenda_events` (pas de colonne propriétaire), tasks (À traiter), config, bdm, portail.
- Préférences UI : migration `045_user_preferences.sql` (module `prefs/`).
