# SQL — module Litiges (`disputes`)

Schéma `PharmaOs`. Colonnes d’après `disputeService.js` unifié.

## Tables

| Table | Rôle |
|-------|------|
| `supplier_disputes` | Litiges fournisseurs |
| `directory_contacts` | Lecture partenaires (`type = commercial_partner`) — module directory |

### Enums

- `dispute_type` : `commande` \| `facturation` \| `perimes` \| `challenge` \| `retrait_lot` \| `autre`
- `statut` : `ouvert` \| `en_attente` \| `en_cours` \| `clos` \| `annule`

### Colonnes utilisées

**supplier_disputes** : `id`, `dispute_type`, `fournisseur_id`, `fournisseur_nom`, `montant`, `description`, `pieces`, `lot_alert_id`, `stock_error_id`, `perime_id`, `statut`, `created_by`, `closed_at`, `updated_at`, `created_at`

## RLS

Phase `sql`.
