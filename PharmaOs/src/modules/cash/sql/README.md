# SQL — module Caisse (`cash`)

Schéma `PharmaOs`. Colonnes d’après `cashService.js` unifié.

## Tables

| Table | Rôle |
|-------|------|
| `cash_closures` | Clôtures de caisse journalières |
| `app_settings` | Réglages applicatifs (clé `cash_accountant_email`) — table partagée |

### Colonnes utilisées

**cash_closures** : `id`, `closure_date`, `author_id`, `author_name`, `fond_reel`, `fond_logiciel`, `montant_cb`, `argent_lieu_sur`, `nb_cheques`, `montant_cheques`, `garde`, `sortie_particuliere`, `sortie_montant`, `sortie_motif`, `notes`, `created_at`

**app_settings** (clés utilisées) :
- `pharmacy` → `{ name, address, email, phone, interlocuteur }` — Paramètres → Général
- `cash_accountant_email` → `{ email }`
- `mail_templates` → templates app (`cash.rapport_mensuel`, …) — édités dans Paramètres → Templates mail


## Edge Function

- `send-transactional-email` (rapport mensuel comptable)

## RLS

Phase `sql`.
