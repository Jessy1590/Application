# SQL — module quality

## Tables
- `PharmaOs.quality_events` — non-conformités & CAPA

### Colonnes utilisées (code)
`id`, `user_id`, `type`, `status`, `severity`, `data` (jsonb), `capa_action`, `capa_status`, `resolved_at`, `created_at`

### Enums
- `type` : `erreur_delivrance` | `presqu_erreur` | `reclamation_patient` | `probleme_fournisseur`
- `severity` : `mineure` | `majeure` | `critique`
- `status` : `ouvert` | `en_attente` | `en_analyse` | `cloture` | `annule`
  - `en_attente` : saisie mise en attente (tâche `nc_brouillon`)
- `capa_status` : `en_attente` | `en_cours` | `termine`

## Migration live
`supabase/migrations/013_calls_quality_pending_annule.sql`

## RLS (rappel SECURITY legacy)
- INSERT / SELECT perso : `user_id = auth.uid()`
- SELECT / UPDATE admin Dashboard : policy admin

## Fichiers stubs
- `tables.sql`, `rls.sql` — DDL/policies documentaires (agrégation phase sql)
