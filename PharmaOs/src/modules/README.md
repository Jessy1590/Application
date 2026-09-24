# Modules PharmaOS — index

Documentation **config actuelle** (post-unification À traiter). Chaque domaine a un `MODULE.md` qui sert de **source d’audit** (logs + tâches) pour les passes suivantes.

| Domaine | Label | MODULE.md | Surfaces |
|---------|-------|-----------|----------|
| [account](account/MODULE.md) | Mon compte | oui | dashboard |
| [admin](admin/MODULE.md) | Administration | oui | dashboard (logs, bugs, accès, paramètres) |
| [agenda](agenda/MODULE.md) | Agenda | oui | dashboard |
| [bdm](bdm/MODULE.md) | BDPM | oui | dashboard |
| [calls](calls/MODULE.md) | Appels | oui | taskbar + dashboard |
| [cash](cash/MODULE.md) | Caisse | oui | taskbar + dashboard |
| [conseil](conseil/MODULE.md) | Conseil | oui | panel taskbar + dashboard |
| [directory](directory/MODULE.md) | Annuaire | oui | taskbar + dashboard |
| [disputes](disputes/MODULE.md) | Litiges | oui | taskbar + dashboard |
| [documents](documents/MODULE.md) | GED | oui | taskbar + dashboard |
| [home](home/MODULE.md) | Tableau de bord | oui | dashboard (`dashboard`) |
| [hr](hr/MODULE.md) | RH | oui | taskbar + dashboard |
| [inbox](inbox/MODULE.md) | Mes saisies | oui | taskbar (saisies) / dashboard `inbox_saisies` |
| [ip](ip/MODULE.md) | Act-IP | oui | taskbar + dashboard |
| [location](location/MODULE.md) | Location | oui | taskbar + dashboard |
| [lot-alerts](lot-alerts/MODULE.md) | Retrait de lot | oui | taskbar + dashboard |
| [magistral](magistral/MODULE.md) | Préparations | oui | taskbar + dashboard |
| [perimes](perimes/MODULE.md) | Périmés | oui | taskbar + dashboard |
| [prefs](prefs/MODULE.md) | Préférences | oui | service (consommé par Mon compte / Taskbar) |
| [psl](psl/MODULE.md) | MDS | oui | taskbar + dashboard |
| [quality](quality/MODULE.md) | Qualité | oui | taskbar + dashboard |
| [stock](stock/MODULE.md) | Stock | oui | taskbar + dashboard |
| [stupefiants](stupefiants/MODULE.md) | Stupéfiants | oui | taskbar + dashboard |
| [tasks](tasks/MODULE.md) | À traiter | oui | taskbar + dashboard |

## Sources de vérité

- Accès : `src/core/access.js`
- Nav dashboard : `src/shell/navConfig.js` + `DashboardShell.jsx`
- Taskbar : `src/shell/Taskbar.jsx`
- Vues module : `src/module-main.jsx`
- Tâches : `tasks/shared/taskCatalog.js` + `taskActions.js`
- État produit : `.cursor/docs/STATE.md`
- SQL miroir : `src/modules/<domaine>/sql/`

## Notes (glossaire reviewer)

### À traiter vs Mes saisies

Deux **produits distincts**, parfois confondus à cause d’aliases d’accès :

| Concept | Dossier code | Rôle métier | Surfaces UI |
|---------|--------------|-------------|-------------|
| **À traiter** | `tasks/` | File de travail : assignations ouvertes (`tasks` + `task_assignments`). Badge taskbar, reprise / clôture. | Taskbar `#inbox` / `#tasks` → `Tasks.jsx` ; dashboard page `inbox` → `TasksManager` |
| **Mes saisies** | `inbox/` | Autocorrection des **propres** fiches récentes (règle B ~72 h) : appels, IP, qualité, stock. | Dashboard page `inbox_saisies` → `InboxSaisiesManager` ; `Inbox.jsx` mode `saisies` |

**Alias d’accès** : dans `access.js`, `inbox` ↔ `tasks` ouvrent la **même** matrice « hub À traiter ». La page dashboard `inbox_saisies` réutilise la feature `inbox` (pas de clé `role_access` séparée).  
En pratique : le bouton taskbar « À traiter » ouvre le module **`tasks/`**, pas `inbox/Inbox.jsx`.

### Features taskbar `order` / `billing`

Ce ne sont **pas** des modules séparés. Ce sont des raccourcis du groupe Taskbar « Tâches » :

- `order` → ouvre `#order` → `tasks/comptoir/QuickAction.jsx` (création tâche `commande`)
- `billing` → ouvre `#billing` → même composant (création tâche `facturation`)

Formulaire partagé : `tasks/shared/PatientOrderForm.jsx`. Logique : `taskService.createComptoirQuickAction`.

### Conseil — panel taskbar (pas un bouton module)

`conseil` n’a **pas** d’entrée dans `TASKBAR_FEATURES` / pas de vue `#conseil` dans `module-main`.  
Le panneau `ConseilPanel.jsx` est **embarqué** dans `Taskbar.jsx` : il matche le texte de contexte (focused / clipboard) contre les conseils actifs et enregistre des `conseil_events`.  
Le CRUD des conseils se fait uniquement en dashboard (`conseil` → `ConseilManager`).

### Surfaces partielles : `prefs`, `account`, `bdm`

| Domaine | Ce que c’est | Ce que ce n’est pas |
|---------|--------------|---------------------|
| **prefs** | Service + table `user_preferences` (thème, densité, polices, placement taskbar). Consommé par Taskbar et `AccountPage`. | Pas de page nav, pas de feature `canAccess` dédiée, pas de comptoir. |
| **account** | Page dashboard « Mon compte » : profil affiché + édition des prefs via `prefsService`. | Pas de gestion Auth (MDP / e-mail / invite) — c’est le **Portail Application**. Pas de `*Service.js` dédié. |
| **bdm** | Explorateur dashboard lecture seule du schéma `bdm` (BDPM) + déclenchement sync Edge. | Pas de taskbar ; sync destructive réservée service_role / Edge. |

## Comment utiliser ces MODULE.md

Objectif de la **prochaine passe** (à partir de ces fichiers, sans les réécrire à l’aveugle) :

1. **Audit logs** — pour chaque fonction listée dans « Fonctions exportées », décider si un `logEvent` (catégorie / action) manque ; s’appuyer sur la checklist « Gap logs / tasks (propositions) ».
2. **Audit tâches** — vérifier types catalogue (`taskCatalog.js`), créations côté services, et câblage `taskActions.js` (resume / close / dashboard) ; noter les types manquants ou mal branchés.

Méthode suggérée : ouvrir le `MODULE.md` du domaine → section inventaires → cocher / implémenter → mettre à jour les colonnes « Log ? » / « Tâches ? » du même fichier.

Les sections **Gap logs / tasks** sont des **propositions** uniquement : ne pas les traiter comme déjà validées ni comme code à coller.
