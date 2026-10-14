# Backup manuel schéma `jeupharma`

- **Date** : 2026-10-14
- **Projet Supabase** : `kpjflntnotftpzffjbud`
- **Périmètre** : schéma Postgres `jeupharma` uniquement (pas `portail`, `bdm`, `auth`)

## Contenu

| Fichier | Description |
|---------|-------------|
| `sql-migrations-copy/` | Copie des migrations locales `sql/*.sql` au moment du backup |
| `jeupharma_functions.sql` | Définitions des fonctions du schéma (snapshot) |
| `data/columns.json` | Colonnes `information_schema` |
| `data/core_pedagogie.json` | Parcours, modules, blocs, jeux, inscriptions, progression, tentatives, sources, row_counts |
| `data/pubs_deust.json` | Publications du parcours Cardio DEUST |
| `data/matrice_medicaments.json` | Fiches `matrice_medicaments` |

## Notes

- `supabase db dump --linked` nécessite Docker Desktop (indisponible ici) → backup logique via SQL/MCP.
- Après ce backup, migration **`037_drop_legacy_v1_jeux`** a été appliquée (tables quiz/trous V1 + RPC associées).
- Pour un dump physique complet ultérieur : installer Docker puis `supabase db dump --linked -s jeupharma -f …` (+ `--data-only`).
