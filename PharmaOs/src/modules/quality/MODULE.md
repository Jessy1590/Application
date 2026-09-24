# Module quality

## 1. Identité

| Champ | Valeur |
|-------|--------|
| id | `quality` |
| label | Qualité |
| dossier | `src/modules/quality/` |

## 2. Taskbar

| Élément | Valeur |
|---------|--------|
| Feature id | `quality` |
| Vue | `#quality` → `Quality.jsx` |
| Composant | `comptoir/Quality.jsx` |

## 3. Dashboard

| Élément | Valeur |
|---------|--------|
| Page id | `quality` |
| Composant | `dashboard/QualityManager.jsx` |
| `canAccess` | `canAccess(..., 'quality')` |

## 4. Services

| Fichier | Rôle |
|---------|------|
| `qualityService.js` | NC / CAPA, brouillons, tâches `nc_brouillon` |

## 5. Logs

Aucun `logEvent`.

## 6. Tâches

| Source | Types |
|--------|-------|
| Catalogue (`qualite`) | `nc_brouillon` |
| Créés | tâche brouillon NC |
| `taskActions.js` | **resume** vue `quality` (`qualityId`) |

## 7. SQL

| Table | Colonnes / enums | RLS |
|-------|------------------|-----|
| `quality_events` | `type`, `severity`, `status`, `data` jsonb, CAPA | INSERT/SELECT own ; admin dashboard |

Migration `013` (brouillon/annule).

---

## 8. Fonctions exportées (services)

_Inventaire issu du code (2026-09-23). Colonnes Log / Tâches = état actuel, pas la cible._

### `services/qualityService.js`

| Fonction | Rôle (résumé) | Args principaux | Tables / RPC | Tâches ? | Log ? |
|----------|---------------|-----------------|--------------|----------|-------|
| `qualityFormHasContent` | Fonction exportée | `form` | — | non | non |
| `qualityRowToForm` | Fonction exportée | `row` | — | non | non |
| `insertQualityEvent` | Création / enregistrement — tables: quality_events | `userId, payload, status = 'ouvert'` | quality_events | non | non |
| `insertQualityEventReturning` | Création / enregistrement — tables: quality_events | `userId, payload, status = 'ouvert'` | quality_events | non | non |
| `updateQualityEventFull` | Mise à jour / action métier — tables: quality_events | `id, payload, status` | quality_events | non | non |
| `fetchMyQualityEvents` | Lecture / recherche — tables: quality_events | `userId, limit = 10` | quality_events | non | non |
| `fetchPendingQualityEvents` | Lecture / recherche — tables: quality_events | `userId` | quality_events | non | non |
| `fetchQualityById` | Lecture / recherche — tables: quality_events | `id` | quality_events | non | non |
| `cancelQualityEvent` | Mise à jour / action métier | `id` | — | non | non |
| `createPendingQualityTask` | Création / enregistrement (+ crée tâche) — tables: tasks | `row, createdBy` | tasks | oui | non |
| `completePendingQualityTask` | Mise à jour / action métier | `qualityId, displayName` | — | non | non |
| `cancelPendingQualityTask` | Mise à jour / action métier — tables: profiles | `qualityId, displayName` | profiles | non | non |
| `fetchQualityEvents` | Lecture / recherche — tables: quality_events | `—` | quality_events | non | non |
| `updateQualityEvent` | Mise à jour / action métier — tables: quality_events | `id, updates` | quality_events | non | non |
| `fetchQualityStats` | Lecture / recherche | `—` | — | non | non |

Autres exports (constantes / ré-exports) : `QUALITY_TYPES`, `SEVERITY_LEVELS`, `QUALITY_FORM_DEFAULTS`.

## 9. Handlers / actions UI

### `comptoir/Quality.jsx`

| Action / label (repère) | Handler | Appels service (détectés près du handler) | Feedback |
|-------------------------|---------|-------------------------------------------|----------|
| — | `handleValidate` | `setErrorMsg`, `setSuccessMsg`, `updateQualityEventFull`, `completePendingQualityTask`, `insertQualityEventReturning`, `setSkipAutoPending`, `setTimeout`, `closeModuleWindow` | erreur UI, succès / feedback, ferme module |
| — | `handlePending` | `setErrorMsg`, `setSuccessMsg`, `updateQualityEventFull`, `insertQualityEventReturning`, `createPendingQualityTask`, `setSkipAutoPending`, `setTimeout`, `closeModuleWindow` | erreur UI, succès / feedback, ferme module |
| — | `handleCancel` | `setErrorMsg`, `cancelQualityEvent`, `cancelPendingQualityTask`, `setSkipAutoPending`, `setSuccessMsg`, `setTimeout`, `closeModuleWindow`, `setEditingId` | erreur UI, succès / feedback, ferme module |

### `dashboard/QualityManager.jsx`

| Action / label (repère) | Handler | Appels service (détectés près du handler) | Feedback |
|-------------------------|---------|-------------------------------------------|----------|
| — | `handleSave` | `updateQualityEvent`, `completePendingQualityTask`, `cancelPendingQualityTask` | — |

## 10. Formulaires & données

### Formulaire NC (intégré `comptoir/Quality.jsx` + dashboard)

| Champ (form) | Label UI | Type | Requis | Valeurs |
|--------------|----------|------|--------|---------|
| type | Type d'événement | select | oui | `QUALITY_TYPES` : erreur_delivrance, presqu_erreur, reclamation_patient, probleme_fournisseur |
| severity | Gravité | select | oui | mineure / majeure / critique |
| description | Description | textarea | oui | — |
| immediateAction | Action immédiate prise | text | non | stocké `data.immediate_action` |
| location | Lieu / Zone | text | non | `data.location` |
| medicament | (MédicamentFields si présent) | text | non | `data.medicament` |

**Save** : `insertQualityEventReturning` / `updateQualityEventFull` ; statut `ouvert` ou brouillon ; pending → `createPendingQualityTask` (`nc_brouillon`).
**Edit/resume** : `qualityRowToForm` + `fetchQualityById`.


## 11. Données affichées

| Source (fonction / requête) | Colonnes / usage UI |
|-----------------------------|---------------------|
| `qualityService.js::fetchMyQualityEvents` | tables/RPC : quality_events |
| `qualityService.js::fetchPendingQualityEvents` | tables/RPC : quality_events |
| `qualityService.js::fetchQualityById` | tables/RPC : quality_events |
| `qualityService.js::fetchQualityEvents` | tables/RPC : quality_events |
| `qualityService.js::fetchQualityStats` | tables/RPC : — |

## 12. Gap logs / tasks (propositions)

_Propositions uniquement — ne pas implémenter depuis cette checklist sans validation produit._

### Logs probablement manquants

- [ ] `qualityService.js::insertQualityEvent` — mutation sans `logEvent` (tables: quality_events)
- [ ] `qualityService.js::insertQualityEventReturning` — mutation sans `logEvent` (tables: quality_events)
- [ ] `qualityService.js::updateQualityEventFull` — mutation sans `logEvent` (tables: quality_events)
- [ ] `qualityService.js::cancelQualityEvent` — mutation sans `logEvent` (tables: —)
- [ ] `qualityService.js::createPendingQualityTask` — mutation sans `logEvent` (tables: tasks)
- [ ] `qualityService.js::completePendingQualityTask` — mutation sans `logEvent` (tables: —)
- [ ] `qualityService.js::cancelPendingQualityTask` — mutation sans `logEvent` (tables: profiles)
- [ ] `qualityService.js::updateQualityEvent` — mutation sans `logEvent` (tables: quality_events)

### Tâches — manques / câblage à vérifier

Créations détectées : `qualityService.js::createPendingQualityTask`. Vérifier alignement catalogue `taskCatalog.js` + actions `taskActions.js`.

