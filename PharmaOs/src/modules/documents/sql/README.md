# SQL — module documents (GED)

## Tables
- `PharmaOs.documents` — procédures / instructions / formulaires
- `PharmaOs.document_signatures` — visas « lu et approuvé »

### Colonnes utilisées
**documents** : `id`, `title`, `content`, `version`, `category`, `requires_signature`, `is_active`, `created_by`, `updated_at`, `created_at`  
**document_signatures** : `id`, `user_id`, `document_id`, `document_version`, `signed_at`

### Enums
- `category` : `procedure` | `instruction` | `formulaire`

## RLS
Phase `sql` — lecture équipe documents actifs ; INSERT signatures `user_id = auth.uid()` ; admin CRUD documents.

## Fichiers stubs
- `tables.sql`, `rls.sql`
