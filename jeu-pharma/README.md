# Jeu Pharma

App pédagogique par **parcours thématiques**. Auth portail (`SITE_ID`), schéma Supabase `jeupharma`.

## Principe

1. **Référentiel** : connaissances atomiques versionnées (`connaissances`).
2. **Parcours / modules** : arborescence thèmes → sous-parcours ; publication explicite.
3. **Résolveur** : lecture joueur uniquement via RPC `v2_*` (pubs des modules débloqués + ancêtres).
4. **Jeux** : Quiz, Tableau à trous, Fiche aléatoire, Ordonnance type (`modeles_jeu` + `tentatives_jeu`).

## Parcours Introduction (démo admin)

Choisissez **Introduction** dans Mon parcours pour tester le flux complet :

1. Thèmes / feuilles publiés (lire une fiche → Sang → révision)  
2. Catalogue résolu limité au corpus intro  
3. Quatre jeux : `JP-INTQ1` (quiz), `JP-INTT1` (trous), `JP-INTF1` (fiche), `JP-INTO1` (ordonnance)

## Arborescence DEUST / etu_3a

- **Sang** → Anémie, Anticoagulation  
- **Cœur** → Angor, IDM, Arythmies, Insuffisance cardiaque  
- **Veine et artère** → Artérite, Insuffisance veineuse  
- **Urgence** → OAP, Traitements des urgences cardiovasculaires  
- **HTA**

## Entrées

| URL | Rôle |
|-----|------|
| `index.html` | Hub (parcours + 4 jeux + admin) |
| `espace.html` | Arborescence + progression |
| `catalogue.html` | Catalogue résolu |
| `jeux/` | Liste / session par type |
| `ordonnances/` | Ordonnance type |
| `admin/` | Sources, référentiel, parcours, jeux, import RCP |
| `legacy-v1/` | Ancienne app (catalogue éditeur, jeux V1) |

## SQL

`sql/019` … `024` (arborescence + démo Introduction). `018` non appliqué sans décision explicite.
