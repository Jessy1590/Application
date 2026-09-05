# SQL — module Magistrales (`magistral`)

Schéma `PharmaOs`. Colonnes d’après `magistralService.js` unifié.

## Tables

| Table | Rôle |
|-------|------|
| `magistral_settings` | Paramétrage pharmacie / prestataire / tarif |
| `magistral_orders` | Devis / commandes / réceptions |

### Enums

- `magistral_orders.statut` : `devis` \| `commande` \| `receptionne` \| `cloture`

### Colonnes utilisées

**magistral_settings** : `id`, `frais_port`, `coefficient`, `provider_email`, `pharmacy_name`, `pharmacy_address`, `pharmacy_email`, `pharmacy_interlocuteur`, `updated_at`

**magistral_orders** : `id`, `formule`, `patient_initiales`, `form_data`, `patient_email`, `ordonnance_path`, `preparation_interne`, `statut`, `created_by`, `notes`, `email_sent_at`, `prix_ht_net`, `tva_rate`, `prix_calcule`, `received_at`, `closed_at`, `closed_reason`, `updated_at`, `created_at`

## Edge Function

- `send-transactional-email` (envoi prestataire / patient)

## RLS

Phase `sql` — policies existantes projet Supabase.
