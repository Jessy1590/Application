# Module stock

## 1. Identité

| Champ | Valeur |
|-------|--------|
| id | `stock` |
| label | Erreur de stock / Stock |
| dossier | `src/modules/stock/` |

## 2. Taskbar

| Élément | Valeur |
|---------|--------|
| Feature id | `stock` |
| Vue | `#stock` → `StockError.jsx` |
| Composant | `comptoir/StockError.jsx` |

## 3. Dashboard

| Élément | Valeur |
|---------|--------|
| Page id | `stock` |
| Composant | `dashboard/StockErrorManager.jsx` |
| `canAccess` | `canAccess(..., 'stock')` |

## 4. Services

| Fichier | Rôle |
|---------|------|
| `stockService.js` | Déclaration erreur, décision admin, recomptage, résultats |

## 5. Logs

Aucun `logEvent`.

## 6. Tâches

| Source | Types |
|--------|-------|
| Catalogue (`stock`) | `stock_error`, `stock_recompte`, `stock_recompte_result` |
| Créés | `declareStockError`, workflow recomptage |
| `taskActions.js` | `stock_error` / `stock_recompte_result` → dashboard ; `stock_recompte` → close |

## 7. SQL

| Table | Colonnes / enums | RLS |
|-------|------------------|-----|
| `stock_errors` | quantités, `status` ouvert/recompter/erreur_commande/cloture, `admin_decision`, `task_id` | INSERT/SELECT own ; UPDATE admin |

---

## 8. Fonctions exportées (services)

_Inventaire issu du code (2026-09-23). Colonnes Log / Tâches = état actuel, pas la cible._

### `services/stockService.js`

| Fonction | Rôle (résumé) | Args principaux | Tables / RPC | Tâches ? | Log ? |
|----------|---------------|-----------------|--------------|----------|-------|
| `declareStockError` | Création / enregistrement — tables: tasks, task_assignments, stock_errors | `userId, payload` | tasks, task_assignments, stock_errors | non | non |
| `fetchMyStockErrors` | Lecture / recherche — tables: stock_errors | `userId` | stock_errors | non | non |
| `fetchStockErrors` | Lecture / recherche — tables: stock_errors, profiles | `{ status, decision } = {}` | stock_errors, profiles | non | non |
| `resolveStockError` | Mise à jour / action métier — tables: stock_errors, tasks, task_assignments | `id, decision, adminNotes, adminUserId` | stock_errors, tasks, task_assignments | non | non |
| `submitRecountResult` | Création / enregistrement — tables: stock_errors, task_assignments, tasks | `{ stockErrorId, taskId, quantiteFinale, note, userId, dis…` | stock_errors, task_assignments, tasks | non | non |
| `closeStockErrorAfterRecount` | Mise à jour / action métier — tables: stock_errors, tasks, task_assignments | `id, adminNotes, adminUserId` | stock_errors, tasks, task_assignments | non | non |

Autres exports (constantes / ré-exports) : `STOCK_STATUS_LABELS`.

## 9. Handlers / actions UI

### `comptoir/StockError.jsx`

| Action / label (repère) | Handler | Appels service (détectés près du handler) | Feedback |
|-------------------------|---------|-------------------------------------------|----------|
| — | `handleSubmit` | `setErrorMsg`, `setSuccessMsg`, `declareStockError`, `setTimeout` | erreur UI, succès / feedback |

### `dashboard/StockErrorManager.jsx`

| Action / label (repère) | Handler | Appels service (détectés près du handler) | Feedback |
|-------------------------|---------|-------------------------------------------|----------|
| — | `handleDecision` | `resolveStockError`, `closeStockErrorAfterRecount` | erreur UI |
| — | `handleClose` | `closeStockErrorAfterRecount` | erreur UI |

## 10. Formulaires & données

### Déclaration erreur stock (`comptoir/StockError.jsx`)

| Champ | Label UI | Type | Requis | Notes |
|-------|----------|------|--------|-------|
| medicament / cip | Médicament / CIP | text | médicament oui | MedicamentFields name+cip |
| quantite_theorique | Qté théorique | number | non | — |
| quantite_constatee | Qté officielle / constatée | number | non | — |
| description | Description | textarea | non | — |

**Save** : `declareStockError` → `stock_errors` + tâches `stock_error` (et suite recomptage côté dashboard).
**Edit** : pas de reprise formulaire comptoir ; historique `fetchMyStockErrors` (médicament, qtés, status, created_at).


## 11. Données affichées

| Source (fonction / requête) | Colonnes / usage UI |
|-----------------------------|---------------------|
| `stockService.js::fetchMyStockErrors` | tables/RPC : stock_errors |
| `stockService.js::fetchStockErrors` | tables/RPC : stock_errors, profiles |

## 12. Gap logs / tasks (propositions)

_Propositions uniquement — ne pas implémenter depuis cette checklist sans validation produit._

### Logs probablement manquants

- [ ] `stockService.js::declareStockError` — mutation sans `logEvent` (tables: tasks, task_assignments, stock_errors)
- [ ] `stockService.js::resolveStockError` — mutation sans `logEvent` (tables: stock_errors, tasks, task_assignments)
- [ ] `stockService.js::submitRecountResult` — mutation sans `logEvent` (tables: stock_errors, task_assignments, tasks)
- [ ] `stockService.js::closeStockErrorAfterRecount` — mutation sans `logEvent` (tables: stock_errors, tasks, task_assignments)

### Tâches — manques / câblage à vérifier

- [ ] Module sans création de tâche détectée — confirmer si des événements métier devraient en produire.

