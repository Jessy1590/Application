# Module bdm

## 1. Identité

| Champ | Valeur |
|-------|--------|
| id | `bdm` |
| label | BDPM |
| dossier | `src/modules/bdm/` |

## 2. Taskbar

| Élément | Valeur |
|---------|--------|
| Feature / vues / comptoir | — (dashboard-only) |

## 3. Dashboard

| Élément | Valeur |
|---------|--------|
| Page id | `bdm` |
| Composant | `dashboard/BdmExplorer.jsx` |
| `canAccess` | `canAccess('dashboard', 'bdm')` |

## 4. Services

| Fichier | Rôle |
|---------|------|
| `bdmService.js` | Recherche / stats schéma `bdm` ; déclenche sync Edge `sync-bdpm` |

## 5. Logs

Aucun `logEvent` dans le module.

## 6. Tâches

Aucune entrée catalogue / création / action.

## 7. SQL

Pas de `sql/README.md` (stub `tables.sql` pointe migration `021_bdm_schema.sql`). Schéma **`bdm`** (pas `PharmaOs`).

| Table | Notes |
|-------|-------|
| `bdm.specialites` | CIS, dénomination, forme, voies, AMM… |
| `bdm.presentations` | CIP / présentation |
| `bdm.compositions` | composition |
| `bdm.generiques` | génériques |
| `bdm.molecules` | molécules |
| `bdm.sync_meta` / `bdm.sync_runs` | sync |

RPC destructives sync : **service_role / Edge uniquement** (pas anon).

---

## 8. Fonctions exportées (services)

_Inventaire issu du code (2026-09-23). Colonnes Log / Tâches = état actuel, pas la cible._

### `services/bdmService.js`

| Fonction | Rôle (résumé) | Args principaux | Tables / RPC | Tâches ? | Log ? |
|----------|---------------|-----------------|--------------|----------|-------|
| `fetchBdmStats` | Lecture / recherche — tables: specialites, presentations, compositions, generiques, molecules, sync_meta | `—` | specialites, presentations, compositions, generiques, molecules, sync_meta | non | non |
| `searchProducts` | Lecture / recherche | `query, limit = 50` | rpc:search_products | non | non |
| `suggestBdm` | Lecture / recherche | `query, limit = 20` | rpc:suggest | non | non |
| `getByCip` | Lecture / recherche | `cip` | rpc:get_by_cip | non | non |
| `triggerBdpmSync` | Envoi / déclenchement | `—` | — | non | non |

Autres exports (constantes / ré-exports) : `SUGGEST_KIND_LABELS`.

## 9. Handlers / actions UI

## 10. Formulaires & données

Pas de formulaire d’écriture métier. UI explorateur :

| Contrôle | Service |
|----------|---------|
| Recherche / suggest | `searchProducts`, `suggestBdm` (RPC) |
| Fiche CIP | `getByCip` |
| Bouton sync | `triggerBdpmSync` → Edge `sync-bdpm` |

Lecture seule schéma `bdm` côté anon.


## 11. Données affichées

| Source (fonction / requête) | Colonnes / usage UI |
|-----------------------------|---------------------|
| `bdmService.js::fetchBdmStats` | tables/RPC : specialites, presentations, compositions, generiques, molecules, sync_meta |
| `bdmService.js::searchProducts` | tables/RPC : search_products |
| `bdmService.js::suggestBdm` | tables/RPC : suggest |
| `bdmService.js::getByCip` | tables/RPC : get_by_cip |

## 12. Gap logs / tasks (propositions)

_Propositions uniquement — ne pas implémenter depuis cette checklist sans validation produit._

### Logs probablement manquants

- [ ] `bdmService.js::triggerBdpmSync` — mutation sans `logEvent` (tables: —)

### Tâches — manques / câblage à vérifier

- [ ] Module sans création de tâche détectée — confirmer si des événements métier devraient en produire.

