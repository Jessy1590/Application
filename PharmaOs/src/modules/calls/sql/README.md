# SQL — module calls



## Table

- `PharmaOs.call_logs`

  - `type` : `recu` | `envoye` (Appel reçu / Appel envoyé)

  - `motif` : `intervention_pharmaceutique` | `commande_labo` | `reclamation_patient` | `reception_du` | `litige_fournisseur` | `autre`

  - `statut_traitement` : `resolu` | `a_rappeler` | `attente_pharmacien` | `cloture` | `brouillon` | `annule`

    - `brouillon` : saisie mise en attente (tâche `appel_brouillon`)

    - `cloture` et `notes_appel` : pharmacien (dashboard) uniquement

  - `user_id`, `contact_id`, `contact_nom`, `numero`, `duree_secondes`, `created_at`



## Migration live

`supabase/migrations/007_call_logs_communication_enums.sql` (remap des anciennes valeurs in/out/missed, etc.)

`supabase/migrations/010_call_logs_motif_litige_fournisseur.sql` (ajout motif `litige_fournisseur`)

`supabase/migrations/013_calls_quality_pending_annule.sql` (`brouillon` + `annule`)



## RLS

- Isolation user : INSERT/SELECT `user_id = auth.uid()`

- Admin : SELECT + UPDATE transverses (Dashboard CallTracking)

