# Archive pré-Next — portail hub statique

Ce dossier conserve une **copie figée** du portail hub tel qu’il existait avant la migration Next.js (App Router).

## Contenu

| Fichier | Rôle |
|---------|------|
| `index.html` | Ancien launcher / login / admin (HTML + JS vanilla à la racine du dépôt) |

## Pourquoi cette archive ?

- **Ne pas servir** en production : le hub live est `app/` (Next.js) à la racine du domaine Vercel.
- Référence de **parité fonctionnelle** pour recréer login, « Mes accès » et admin dans Next (Agent C / maintenance).
- Instantané lisible hors racine ; l’historique git reste la source complète.

## Où trouver l’ancien portail ?

1. **Ici** : `archive/pre-next/index.html` — snapshot figé au moment du scaffold Next.
2. **Historique git** : dernier commit où `index.html` était encore à la racine du dépôt (avant archivage / suppression de la racine).
3. **Hub actuel** : routes Next sous `app/` (remplacent ce fichier pour `/`).

Les apps métier n’ont pas été « archivées » : elles vivent sous `public/` (`/Banque/`, `/Vaccin/`, …). PharmaOs reste dans `PharmaOs/` (Electron).

## Ne pas

- Remettre `index.html` à la racine du dépôt (conflit avec la route `/` Next).
- Déployer ce dossier comme site statique ou l’exposer via `public/`.
- Supprimer sans validation : il documente le comportement pré-migration.
