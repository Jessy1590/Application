# SQL — module Location (`rental`)

Schéma `PharmaOs`. Colonnes documentées d’après les services unifiés (aucune colonne inventée). Agrégation migrations : phase `sql`.

## Tables

| Table | Rôle |
|-------|------|
| `rental_assets` | Parc matériel |
| `rental_contracts` | Contrats de location |
| `rental_events` | Journal (sortie / retour / note) |

### Enums / contraintes métier (code)

- `rental_assets.status` : `disponible` \| `loue` \| `maintenance` \| `retire`
- `rental_assets.asset_type` : `lit` \| `tens` \| `aerosol` \| `balance_bebe` \| `tensiometre` \| `fauteuil_roulant` \| `autre`
- `rental_contracts.statut` : `demande` \| `attente_reception` \| `en_cours` \| `retourne`
- `rental_contracts.source_type` : `stock_pharma` \| `stock_presta` \| `commande`
- `rental_contracts.billing_status` : `en_attente` \| `facture` \| `partiel`
- `rental_events.event_type` : `note` \| `sortie` \| `retour`

### Colonnes utilisées (services)

**rental_assets** : `id`, `asset_type`, `label`, `origine`, `numero_interne`, `numero_serie_prestataire`, `status`, `requires_coverage_check`, `updated_at`

**rental_contracts** : `id`, `asset_id`, `asset_type_requested`, `source_type`, `patient_nom`, `patient_prenom`, `patient_dob`, `prescription_scanned`, `prescription_valid_until`, `caution_type`, `caution_montant`, `coverage_checked`, `numero_serie`, `checklist_iso`, `statut`, `date_sortie`, `date_retour`, `caution_restituee`, `caution_encaissee`, `retour_etat`, `ordonnance_a_jour`, `desinfection_faite`, `retour_prestataire`, `billing_weeks`, `billing_status`, `billing_notes`, `created_by`, `notes`, `updated_at`, `created_at`

**rental_events** : `contract_id`, `event_type`, `user_id`, `payload`, `created_at`

## RLS

À documenter / versionner en phase `sql` (aligné policies existantes projet Supabase). Lecture/écriture authentifiée ; admin pour gestion parc.
