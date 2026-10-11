# Jeu Pharma V2

Application parallèle à la V1. Même auth portail (`SITE_ID`), même schéma Supabase `jeupharma`, **tables et RPC additives**.

## Principe

1. **Référentiel** : connaissances atomiques versionnées (`connaissances`), sourcées.
2. **Parcours / modules** : publication explicite (`publications_connaissances`).
3. **Résolveur** : le joueur ne lit le contenu que via `v2_lister_medicaments` / `v2_fiche_resolue` / `v2_progression_parcours`.
4. **Jeux** : `modeles_jeu` + `tentatives_jeu` (ordonnance type, pause, nouveau tirage).

## Entrées

| URL | Rôle |
|-----|------|
| `v2/index.html` | Hub joueur |
| `v2/espace.html` | Parcours + modules |
| `v2/catalogue.html` | Catalogue résolu |
| `v2/ordonnances/` | Ordonnance type |
| `v2/admin/` | Admin V2 |

## SQL

Voir `sql/019` … `022` et `sql/ops/v2_baseline_compare.sql`. Ne pas appliquer `018` sans décision explicite.
