# Jeu Pharma

App pédagogique par **parcours thématiques**. Auth portail (`SITE_ID`), schéma Supabase `jeupharma`.

## Principe

1. **Référentiel** : connaissances atomiques (`connaissances`).
2. **Modif parcours** (studio) : chapitres / leçons / blocs (texte, vidéo, molécule, conseil, jeu) + publication **valeur par valeur**.
3. **Accès** : le joueur demande un parcours ; l’admin accorde.
4. **Résolveur** : lecture joueur via RPC `v2_*` uniquement.
5. **Jeux** : Quiz, Trous, Fiche aléatoire, Ordonnance (`modeles_jeu`).

## Entrées joueur

| URL | Rôle |
|-----|------|
| `index.html` | Hub (4 tuiles) |
| `parcours.html` | Parcours disponibles / demande d’accès |
| `espace.html` | Arbre du parcours accepté → leçons |
| `lecon.html` | Lecteur de blocs |
| `mon-espace.html` | Scores / progression |
| `catalogue.html` | Catalogue résolu |
| `jeux/` | Jeux des parcours acceptés |

## Admin (desktop)

| URL | Rôle |
|-----|------|
| `admin/parcours.html` | Modif parcours (studio constructeur) |
| `admin/acces-parcours.html` | File d’attente des demandes |
| `admin/referentiel.html` | **Référentiel** : toutes les fiches (recherche, filtres, édition, BDPM, validation) — remplace Catalogue / Référentiel / Sources / Import RCP |
| `admin/jeux.html` | Scores (jeu / parcours / personne) + pause, relance, archivage des jeux |

`admin/catalogue.html` / `admin/fiche.html?id=` redirigent vers le Référentiel.

Le dossier `legacy-v1/` a été **supprimé**. Sources / Import RCP / CSV admin ne font plus partie de l’app.

## SQL

`sql/019` … `037` (parcours V2, Cardio DEUST, purge jeux V1). `018` non appliqué sans décision explicite. Backups manuels : `backups/jeupharma-*`.
