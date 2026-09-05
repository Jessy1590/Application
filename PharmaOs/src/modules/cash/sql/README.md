# SQL — module Caisse (`cash`)

Schéma `PharmaOs`. Colonnes d’après `cashService.js` unifié.

## Tables

| Table | Rôle |
|-------|------|
| `cash_closures` | Clôtures de caisse journalières |
| `app_settings` | Réglages applicatifs (clé `cash_accountant_email`) — table partagée |

### Colonnes utilisées

**cash_closures** : `id`, `closure_date`, `author_id`, `author_name`, `fond_reel`, `fond_logiciel`, `montant_cb`, `argent_lieu_sur`, `nb_cheques`, `montant_cheques`, `garde`, `sortie_particuliere`, `sortie_montant`, `sortie_motif`, `notes`, `created_at`

**app_settings** (clé utilisée) : `key` = `cash_accountant_email`, `value` jsonb `{ email }`, `updated_at`

## Edge Function

- `send-transactional-email` (rapport mensuel comptable)

## RLS

Phase `sql`.
