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
12. `012`–`015` — litiges / qualité / périmés workflow
13. `016_hr_workflow.sql` — absences `statut` + revue ; `change_type` retards
14. `017`–`019` — RH planning / semaines spéciales / job_title
15. `020_mds_registry_seq_grants.sql` — séquence registre MDS + GRANT (fix permission denied)
16. `021`–`023` — BDPM, conseils, sites
17. `024_roles_logs_bugs.sql` — rôles, `app_logs`, `bugs`, `role_access`
18. `025_roles_logs_harden.sql` — search_path / GRANT helpers
19. `026_role_desactive.sql` — rôle `désactivé`
20. `027_magistral_refonte.sql` — Magistrales : statuts élargis, traçabilité ST/réception/appel, Storage
21. `028_drop_gestionnaire.sql` — suppression rôle portail gestionnaire → préparateur
22. `029_casquettes.sql` — catalogue casquettes + features + attribution
23. `030_role_dashboard_widgets.sql` — widgets accueil par rôle
24. `031_task_role_rules.sql` — matrice assignation tâches
25. `032_tasks_rls_scope.sql` — RLS tasks / assignments (soi vs admin)
26. `033_tasks_rls_no_recursion.sql` — casse la récursion tasks ↔ task_assignments (helpers SECURITY DEFINER)

Source de vérité : `src/modules/<domaine>/sql/`. Agrégat ici avec en-têtes `-- >>> module`.

Inventaire : tables métier PharmaOs + 4 portail (+ helpers). Voir `.cursor/docs/SECURITY.md`.

Hors scope : Banque / Valorisation / Vaccin / Fromage (`Application/supabase/SETUP.md`).
