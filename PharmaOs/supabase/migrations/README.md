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
27. `034_magistral_creation_champs.sql` — `magistral_settings.creation_champs` (champs actifs/obligatoires création)
28. `035_task_role_rules_catalog.sql` — seeds catégories tâches Magistrales / Location / Caisse / étalonnage
29. `036_app_logs_triggers_sync.sql` — triggers `app_logs` sur tables post-024
30. `037_stupefiants.sql` — livreurs / relevés / storage BL / seeds tâches
31. `038_stupefiants_erreur_reception.sql` — statut `erreur_reception`
32. `039_stupefiants_en_attente.sql` — statut `en_attente` ; `bl_numero` nullable
33. `040_bdm_revoke_dangerous_rpc_anon.sql` — REVOKE truncate/bulk BDPM pour anon/authenticated
34. `041_drop_phantom_controls_and_rental.sql` — drop controls + `rental_*`
35. `042_mes_saisies_rls_own_update.sql` — UPDATE own saisies + admin policies `is_pharma_admin`
36. `043_profiles_must_change_password.sql` — flag MDP temporaire sur `portail.profiles`
37. `044_portail_service_role_schema_usage.sql` — GRANT schema portail à service_role + is_admin legacy `admin`

Source de vérité : `supabase/migrations/` (agrégat live). Miroirs `src/modules/<domaine>/sql/` (certains README-only : admin, conseil, inbox).

Edge Functions (hors migrations SQL) : `sync-bdpm`, `invite-user`, `delete-user` (voir `.cursor/docs/SECURITY.md` § Auth).

Inventaire : tables métier `PharmaOs` + `portail` + `bdm`. Voir `.cursor/docs/SECURITY.md`.

Hors scope PharmaOs : Banque / Valorisation / Vaccin / Fromage ; schemas `phieevreux` / `public` finance (ne pas dropper depuis ce repo).
