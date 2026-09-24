# Module perimes

## 1. Identité

| Champ | Valeur |
|-------|--------|
| id | `perimes` (+ `perimes_vitrine` taskbar) |
| label | Périmés / MEA-Promo-Challenge |
| dossier | `src/modules/perimes/` |

## 2. Taskbar

| Élément | Valeur |
|---------|--------|
| Feature ids | `perimes`, `perimes_vitrine` |
| Vues | `#perimes` → `Perimes.jsx` ; `#perimes_vitrine` → `PerimesVitrine.jsx` |
| Composants | + `shared/PerimeForm.jsx` |

## 3. Dashboard

| Élément | Valeur |
|---------|--------|
| Page id | `perimes` |
| Composants | `PerimesManager`, `PerimesEmplacementsSettings` |
| `canAccess` | `perimes` (+ settings module) ; vitrine = taskbar only |

## 4. Services

| Fichier | Rôle |
|---------|------|
| `perimesService.js` | Déclarations, décisions, MEA/promo/challenge, emplacements, tâches |

## 5. Logs

Aucun `logEvent`.

## 6. Tâches

| Source | Types |
|--------|-------|
| Catalogue (`perimes`) | `perime_decision`, `perime_mea`, `perime_promo`, `perime_challenge` |
| Créés | déclaration / `ensureAllPerimeTasks` |
| Legacy actions | `perimes_mensuel` → dashboard (plus de créations) |
| `taskActions.js` | decision → dashboard ; mea/promo/challenge → close inline |

## 7. SQL

| Table | Colonnes / statuts | Migrations |
|-------|-------------------|------------|
| `perimes` | DLC, décision, flags MEA/promo/challenge + task ids ; status declare…clos | `014`, `015` |
| `perime_emplacements` | paramètres emplacements | |

---

## 8. Fonctions exportées (services)

_Inventaire issu du code (2026-09-23). Colonnes Log / Tâches = état actuel, pas la cible._

### `services/perimesService.js`

| Fonction | Rôle (résumé) | Args principaux | Tables / RPC | Tâches ? | Log ? |
|----------|---------------|-----------------|--------------|----------|-------|
| `validatePerimeHorizon` | Mise à jour / action métier | `datePeremption` | — | non | non |
| `fetchEmplacements` | Lecture / recherche — tables: perime_emplacements | `{ actifsOnly = false } = {}` | perime_emplacements | non | non |
| `createEmplacement` | Création / enregistrement — tables: perime_emplacements | `label` | perime_emplacements | non | non |
| `updateEmplacement` | Mise à jour / action métier — tables: perime_emplacements | `id, updates` | perime_emplacements | non | non |
| `deleteEmplacement` | Mise à jour / action métier — tables: perime_emplacements | `id` | perime_emplacements | non | non |
| `fetchPerimes` | Lecture / recherche — tables: perimes | `—` | perimes | non | non |
| `fetchVisiblePerimes` | Lecture / recherche — tables: perimes | `—` | perimes | non | non |
| `fetchTodayActions` | Lecture / recherche — tables: perimes | `—` | perimes | non | non |
| `splitTracking` | Helper pur / formatage | `items` | — | non | non |
| `createPerimeDecisionTask` | Création / enregistrement (+ crée tâche) — tables: perimes | `perime, createdBy` | perimes | oui | non |
| `createPerimeChallengeTask` | Création / enregistrement (+ crée tâche) — tables: perimes | `perime, createdBy` | perimes | oui | non |
| `ensurePerimeExecutionTasks` | Idempotent : crée si absent — tables: perimes | `createdBy` | perimes | non | non |
| `insertPerime` | Création / enregistrement — tables: perimes | `userId, form` | perimes | non | non |
| `ensurePerimeDecisionTasks` | Idempotent : crée si absent — tables: perimes | `createdBy` | perimes | non | non |
| `ensureAllPerimeTasks` | Idempotent : crée si absent | `createdBy` | — | non | non |
| `completePerimeDecisionTask` | Mise à jour / action métier — tables: perimes, tasks | `perimeId, displayName` | perimes, tasks | non | non |
| `applyValorisation` | Mise à jour / action métier — tables: perimes | `id, options, userId, displayName` | perimes | non | non |
| `applyLaisserPerimer` | Mise à jour / action métier — tables: perimes | `id, destination, userId, displayName, notes` | perimes | non | non |
| `linkDisputeFromPerime` | Mise à jour / action métier — tables: supplier_disputes, perimes | `perime, userId` | supplier_disputes, perimes | non | non |
| `attachDisputeToPerime` | Mise à jour / action métier — tables: perimes | `perimeId, disputeId` | perimes | non | non |
| `markAssociation` | Mise à jour / action métier | `id, notes, userId, displayName` | — | non | non |
| `updatePerimeStatus` | Mise à jour / action métier — tables: perimes | `id, status` | perimes | non | non |

Autres exports (constantes / ré-exports) : `PERIME_FORM_DEFAULTS`, `PERIME_STATUS_LABELS`, `isWithinDecisionWindow`.

## 9. Handlers / actions UI

### `comptoir/Perimes.jsx`

| Action / label (repère) | Handler | Appels service (détectés près du handler) | Feedback |
|-------------------------|---------|-------------------------------------------|----------|
| — | `handleSubmit` | `setErrorMsg`, `setSuccessMsg`, `insertPerime`, `setTimeout`, `closeModuleWindow` | erreur UI, succès / feedback, ferme module |

### `dashboard/PerimesManager.jsx`

| Action / label (repère) | Handler | Appels service (détectés près du handler) | Feedback |
|-------------------------|---------|-------------------------------------------|----------|
| — | `handleValoriser` | `setSaving`, `setErr`, `applyValorisation` | erreur UI, succès / feedback |
| — | `handleAssociation` | `setSaving`, `setErr`, `applyLaisserPerimer`, `setDeciding`, `openModuleWindow` | erreur UI, succès / feedback |
| — | `handleLitige` | `setSaving`, `setErr`, `applyLaisserPerimer`, `setDeciding`, `openModuleWindow` | erreur UI, succès / feedback |

## 10. Formulaires & données

### PerimeForm (`shared/PerimeForm.jsx`)

| Champ | Label UI | Type | Requis | Notes |
|-------|----------|------|--------|-------|
| medicament / cip / code | Nom / Code CIP | text | oui si requireCore | CIP synchronisé sur `code` + `cip` |
| lot | Lot | text | oui | — |
| quantite | Quantité | number min 1 | oui | défaut `PERIME_FORM_DEFAULTS` |
| date_peremption | Date de péremption | date | oui | horizon 12 mois (`validatePerimeHorizon`) |
| notes | Notes | text | non | — |

**Save** : `insertPerime` (+ tâches décision / exécution selon workflow).
**Edit dashboard** : valorisation / laisser périmer / litige via managers (pas le même form bare).


## 11. Données affichées

| Source (fonction / requête) | Colonnes / usage UI |
|-----------------------------|---------------------|
| `perimesService.js::fetchEmplacements` | tables/RPC : perime_emplacements |
| `perimesService.js::fetchPerimes` | tables/RPC : perimes |
| `perimesService.js::fetchVisiblePerimes` | tables/RPC : perimes |
| `perimesService.js::fetchTodayActions` | tables/RPC : perimes |

## 12. Gap logs / tasks (propositions)

_Propositions uniquement — ne pas implémenter depuis cette checklist sans validation produit._

### Logs probablement manquants

- [ ] `perimesService.js::validatePerimeHorizon` — mutation sans `logEvent` (tables: —)
- [ ] `perimesService.js::createEmplacement` — mutation sans `logEvent` (tables: perime_emplacements)
- [ ] `perimesService.js::updateEmplacement` — mutation sans `logEvent` (tables: perime_emplacements)
- [ ] `perimesService.js::deleteEmplacement` — mutation sans `logEvent` (tables: perime_emplacements)
- [ ] `perimesService.js::createPerimeDecisionTask` — mutation sans `logEvent` (tables: perimes)
- [ ] `perimesService.js::createPerimeChallengeTask` — mutation sans `logEvent` (tables: perimes)
- [ ] `perimesService.js::insertPerime` — mutation sans `logEvent` (tables: perimes)
- [ ] `perimesService.js::completePerimeDecisionTask` — mutation sans `logEvent` (tables: perimes, tasks)
- [ ] `perimesService.js::applyValorisation` — mutation sans `logEvent` (tables: perimes)
- [ ] `perimesService.js::applyLaisserPerimer` — mutation sans `logEvent` (tables: perimes)
- [ ] `perimesService.js::linkDisputeFromPerime` — mutation sans `logEvent` (tables: supplier_disputes, perimes)
- [ ] `perimesService.js::attachDisputeToPerime` — mutation sans `logEvent` (tables: perimes)
- [ ] `perimesService.js::markAssociation` — mutation sans `logEvent` (tables: —)
- [ ] `perimesService.js::updatePerimeStatus` — mutation sans `logEvent` (tables: perimes)

### Tâches — manques / câblage à vérifier

Créations détectées : `perimesService.js::createPerimeDecisionTask`, `perimesService.js::createPerimeChallengeTask`. Vérifier alignement catalogue `taskCatalog.js` + actions `taskActions.js`.

