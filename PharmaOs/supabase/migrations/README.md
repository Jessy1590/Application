# Migrations PharmaOs

Ordre :

1. `001_portail_profiles_site_access.sql`
2. `002_pharmaos_helpers_rls.sql`
3. `003_pharmaos_tasks_logs.sql`
4. `004_pharmaos_directory_agenda_calls_ip.sql`
5. `005_pharmaos_quality_controls_docs_stock.sql`
6. `006_pharmaos_modules_metier.sql`
7. `007_call_logs_communication_enums.sql` — nouveaux enums appels (Communication)
8. `008_act_ip_logs_annulee.sql` — statut `Annulee` sur Act-IP
9. `009_drop_controls_module_tables.sql` — drop `daily_controls` + `equipment_calibrations` (module controls retiré)
10. `010_call_logs_motif_litige_fournisseur.sql` — motif `litige_fournisseur`
11. `011_drop_unused_advice_magistral_tables.sql` — drop `advice_events`, `magistral_providers`, `magistral_price_rules` (+ colonnes FK sur `magistral_orders`)

Source de vérité : `src/modules/<domaine>/sql/`. Agrégat ici avec en-têtes `-- >>> module`.

Inventaire : tables métier PharmaOs + 4 portail (+ helpers). Voir `.cursor/docs/SECURITY.md`.

Hors scope : Banque / Valorisation / Vaccin / Fromage (`Application/supabase/SETUP.md`).
