# Schéma Postgres `banque`

Défini dans `sql/001_schema_banque.sql` (création du schéma uniquement ; **`public` n’est pas modifié** par ces scripts).

## Tables

| Table | Rôle (d’après le SQL) |
|-------|------------------------|
| `schema_version` | Versions de migration appliquées |
| `accounts` | Comptes budget |
| `profiles` | Profils utilisateur |
| `account_members` | Appartenance utilisateur ↔ compte |
| `expenses` | Dépenses récurrentes / structure budget |
| `incomes` | Revenus |
| `payments` | Validations de paiement / encaissement par mois |
| `wallet_transactions` | Mouvements dans une enveloppe portefeuille |
| `month_snapshots` | Instantané JSON du budget théorique par mois |
| `bank_verifications` | Rapprochement relevé bancaire |
| `expense_change_log` | Journal des changements sur les dépenses |
| `history` | Journal général des modifications (alimenté par trigger) |

## Historique

- **`banque.history`** : une ligne par INSERT/UPDATE/DELETE sur les tables suivies.
- **`banque.log_history()`** : fonction trigger ; enregistre `old_row` / `new_row`, `account_id`, etc.
- **`banque.history_restore(p_history_id)`** : annule une entrée d’historique (SECURITY INVOKER, soumis à la RLS).

Tables avec trigger `trg_history` (liste dans `001_schema_banque.sql`) : `accounts`, `profiles`, `account_members`, `expenses`, `incomes`, `payments`, `wallet_transactions`, `month_snapshots`, `bank_verifications`.

## RLS (résumé)

RLS activée sur toutes les tables `banque.*` listées dans `001_schema_banque.sql`.

- Accès aux lignes liées à un compte via **`banque.my_account_ids()`** (membre du compte).
- **`accounts`** : lecture pour les membres ; insert ouvert aux authentifiés ; update/delete selon membership.
- **`profiles`** : visibilité via **`banque.can_see_profile`** ; insert/update limité à son propre `id`.
- **`bank_verifications`** : politique dédiée `bank_verifications_all` (filtre `user_id`).
- **`history`** : lecture filtrée par comptes accessibles ; **`history_restore`** accordée à `authenticated`.

Fonctions utilitaires : `banque.my_account_ids()`, `banque.is_member()`, `banque.can_see_profile()`.

## Import depuis `public` (rejouable)

Script : `sql/002_import_from_public.sql` (lecture seule sur `public`).

```sql
select banque.import_from_public();
select * from banque.import_check();
```

Exécution réservée au rôle service (REVOKE sur `anon` / `authenticated` dans le fichier SQL).

## Temps réel

`sql/003_realtime.sql` ajoute à la publication `supabase_realtime` :  
`accounts`, `account_members`, `expenses`, `incomes`, `payments`, `wallet_transactions`, `month_snapshots`.

## Exposition API (PostgREST)

Le client JS utilise `createClient(..., { db: { schema: 'banque' } })` (`js/core.js`).  
Le schéma `banque` est exposé à l'API via **`pgrst.db_schemas`** sur le rôle `authenticator` (réglage fait hors des fichiers `Banque/sql/`). Si ce réglage est réinitialisé, `banque` doit être rajouté à la liste existante sans retirer les autres schémas.
