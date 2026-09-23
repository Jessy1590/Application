# Inbox — À traiter & mes saisies

Pas de tables dédiées. Agrège `tasks` / `task_assignments`, `call_logs`, `act_ip_logs`, `quality_events`, `stock_errors`.

- **Comptoir** : hub « À traiter » + filtres chips (pas de Mes saisies).
- **Dashboard** : « À traiter » et « Mes saisies » séparés.
- RLS autocorrection : migration `042_mes_saisies_rls_own_update.sql`.
- Préférences UI : migration `045_user_preferences.sql` (module `prefs/`).
