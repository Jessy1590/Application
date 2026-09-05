# SQL — module MDS / PSL (`psl`)

Schéma `PharmaOs`. Colonnes d’après `pslService.js` unifié.

## Tables

| Table | Rôle |
|-------|------|
| `psl_units` | Unités MDS en stock / délivrées |
| `psl_movements` | Registre réception / délivrance |

### Enums

- `psl_units.statut` : `en_stock` \| `delivre`
- `psl_movements.movement_type` : `reception` \| `delivrance`

### Colonnes utilisées

**psl_units** : `id`, `code_produit`, `numero_unite`, `denomination`, `date_peremption`, `fournisseur`, `lot`, `gtin`, `datamatrix_raw`, `statut`, `created_by`, `updated_at`, `created_at`

**psl_movements** : `id`, `unit_id`, `movement_type`, `user_id`, `notes`, `datamatrix_raw`, `denomination`, `quantite`, `prescripteur_nom`, `prescripteur_adresse`, `patient_nom`, `patient_prenom`, `patient_adresse`, `patient_dob`, `patient_initiales`, `patient_ipp`, `date_delivrance`, `etiquette_tracabilite`, `registry_number`, `created_at`

## RLS

Phase `sql`. Registre sensible (conservation longue durée) — ne pas inventer de colonnes ici.
