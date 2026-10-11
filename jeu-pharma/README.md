# Jeu Pharma

App pédagogique par **parcours thématiques**. Auth portail (`SITE_ID`), schéma Supabase `jeupharma`.

## Principe

1. **Référentiel** : connaissances atomiques (`connaissances`).
2. **Studio parcours** : chapitres / leçons / blocs (texte, vidéo, molécule, conseil, jeu) + publication **valeur par valeur**.
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
| `admin/parcours.html` | Studio constructeur |
| `admin/acces-parcours.html` | File d’attente des demandes |
| `admin/catalogue.html` + `fiche.html` | Fiches / BDPM |
| `admin/jeux.html` | Hub jeux transverse |
| `admin/import-export.html` | CSV |

## SQL

`sql/019` … `027` (studio blocs + accès demande/accepte). `018` non appliqué sans décision explicite.
