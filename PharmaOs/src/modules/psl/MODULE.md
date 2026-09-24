# Module psl

## 1. Identité

| Champ | Valeur |
|-------|--------|
| id | `psl` |
| label | MDS (médicaments statut particulier) |
| dossier | `src/modules/psl/` |

## 2. Taskbar

| Élément | Valeur |
|---------|--------|
| Feature id | `psl` |
| Vues | `psl_reception`, `psl_delivrance` (alias `psl` → délivrance) |
| Composant | `comptoir/Psl.jsx` |

## 3. Dashboard

| Élément | Valeur |
|---------|--------|
| Page id | `psl` |
| Composant | `dashboard/PslManager.jsx` |
| `canAccess` | `canAccess(..., 'psl')` |

## 4. Services

| Fichier | Rôle |
|---------|------|
| `pslService.js` | Réception / délivrance unités, registre, export CSV / impression |

## 5. Logs

Aucun `logEvent`.

## 6. Tâches

Aucune.

## 7. SQL

| Table | Colonnes / enums | RLS |
|-------|------------------|-----|
| `psl_units` | code, unité, dénomination, péremption, lot, `statut` en_stock/delivre | phase sql |
| `psl_movements` | `movement_type` reception/delivrance + patient / registre | |
| Séquence | `mds_registry_seq` + trigger numéro registre | GRANT USAGE authenticated |

Migration `020_mds_registry_seq_grants.sql`.

---

## 8. Fonctions exportées (services)

_Inventaire issu du code (2026-09-23). Colonnes Log / Tâches = état actuel, pas la cible._

### `services/pslService.js`

| Fonction | Rôle (résumé) | Args principaux | Tables / RPC | Tâches ? | Log ? |
|----------|---------------|-----------------|--------------|----------|-------|
| `parseDatamatrix` | Helper pur / formatage | `raw` | — | non | non |
| `receivePslUnit` | Mise à jour / action métier — tables: psl_units, psl_movements | `userId, payload` | psl_units, psl_movements | non | non |
| `deliverPslUnit` | Fonction exportée — tables: psl_units, psl_movements | `userId, unitId, payload` | psl_units, psl_movements | non | non |
| `updatePslUnit` | Mise à jour / action métier — tables: psl_units | `id, payload` | psl_units | non | non |
| `updatePslMovement` | Mise à jour / action métier — tables: psl_movements | `id, payload` | psl_movements | non | non |
| `fetchStockUnits` | Lecture / recherche — tables: psl_units | `—` | psl_units | non | non |
| `fetchDeliveryHistory` | Lecture / recherche — tables: psl_movements | `limit = 50` | psl_movements | non | non |
| `fetchPslUnits` | Lecture / recherche — tables: psl_units | `{ statut } = {}` | psl_units | non | non |
| `fetchPslMovements` | Lecture / recherche — tables: psl_movements | `limit = 200` | psl_movements | non | non |
| `fetchMdsDeliveries` | Lecture / recherche — tables: psl_movements | `—` | psl_movements | non | non |
| `printMdsRegistry` | Fonction exportée | `movements, pharmacyName = 'Pharmacie'` | — | non | non |
| `exportPslRegisterCsv` | Export fichier | `movements` | — | non | non |

## 9. Handlers / actions UI

### `comptoir/Psl.jsx`

| Action / label (repère) | Handler | Appels service (détectés près du handler) | Feedback |
|-------------------------|---------|-------------------------------------------|----------|
| — | `handleRecv` | `setErr`, `receivePslUnit`, `setRecv`, `setDeliv` | erreur UI, succès / feedback |
| — | `handleDeliv` | `setErr`, `setDeliv` | erreur UI, succès / feedback |

## 10. Formulaires & données

### Réception (`comptoir/Psl.jsx` mode reception)

| Champ | Usage |
|-------|-------|
| code_produit, numero_unite, denomination (défaut Rophylac), date_peremption, fournisseur, lot, quantite_reception | `receivePslUnit` |

### Délivrance (mode delivrance)

| Champ | Usage |
|-------|-------|
| unit_id, prescripteur_nom/adresse, patient_nom/prenom/adresse/dob, quantite, notes | `deliverPslUnit` |

**Load** : `fetchStockUnits`, `fetchDeliveryHistory`.


## 11. Données affichées

| Source (fonction / requête) | Colonnes / usage UI |
|-----------------------------|---------------------|
| `pslService.js::fetchStockUnits` | tables/RPC : psl_units |
| `pslService.js::fetchDeliveryHistory` | tables/RPC : psl_movements |
| `pslService.js::fetchPslUnits` | tables/RPC : psl_units |
| `pslService.js::fetchPslMovements` | tables/RPC : psl_movements |
| `pslService.js::fetchMdsDeliveries` | tables/RPC : psl_movements |

## 12. Gap logs / tasks (propositions)

_Propositions uniquement — ne pas implémenter depuis cette checklist sans validation produit._

### Logs probablement manquants

- [ ] `pslService.js::receivePslUnit` — mutation sans `logEvent` (tables: psl_units, psl_movements)
- [ ] `pslService.js::updatePslUnit` — mutation sans `logEvent` (tables: psl_units)
- [ ] `pslService.js::updatePslMovement` — mutation sans `logEvent` (tables: psl_movements)

### Tâches — manques / câblage à vérifier

- [ ] Module sans création de tâche détectée — confirmer si des événements métier devraient en produire.

