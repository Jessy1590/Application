# Module calls

## 1. Identité

| Champ | Valeur |
|-------|--------|
| id | `call` (taskbar) / `calls` (dashboard) |
| label | Appels |
| dossier | `src/modules/calls/` |

## 2. Taskbar

| Élément | Valeur |
|---------|--------|
| Feature id | `call` |
| Vue `module-main` | `#call` → `Calls.jsx` |
| Composants | `comptoir/Calls.jsx`, `shared/CallForm.jsx` |

## 3. Dashboard

| Élément | Valeur |
|---------|--------|
| Page id | `calls` |
| Composant | `dashboard/CallTracking.jsx` |
| `canAccess` | taskbar `call` ; dashboard `calls` |

## 4. Services

| Fichier | Rôle |
|---------|------|
| `callService.js` | CRUD `call_logs`, enums, tâches brouillon / attente pharmacien |

## 5. Logs

Aucun `logEvent` dédié. Table métier journal : `PharmaOs.call_logs`.

## 6. Tâches

| Source | Types |
|--------|-------|
| Catalogue (`communication`) | `appel_attente_pharmacien`, `appel_brouillon` |
| Créés | `callService` → ces deux types |
| `taskActions.js` | les deux → **resume** vue `call` (`callId`) |

## 7. SQL

| Table | Colonnes / enums clés | RLS |
|-------|----------------------|-----|
| `call_logs` | `type` recu/envoye ; `motif` ; `statut_traitement` resolu/a_rappeler/attente_pharmacien/cloture/brouillon/annule ; `user_id`, contact, notes | INSERT/SELECT own ; admin SELECT/UPDATE dashboard |

Migrations : `007`, `010`, `013`.

---

## 8. Fonctions exportées (services)

_Inventaire issu du code (2026-09-23). Colonnes Log / Tâches = état actuel, pas la cible._

### `services/callService.js`

| Fonction | Rôle (résumé) | Args principaux | Tables / RPC | Tâches ? | Log ? |
|----------|---------------|-----------------|--------------|----------|-------|
| `motifsForContactType` | Fonction exportée | `contactType` | — | non | non |
| `labelCallType` | Helper pur / formatage | `value` | — | non | non |
| `labelCallMotif` | Helper pur / formatage | `value` | — | non | non |
| `labelCallStatut` | Helper pur / formatage | `value` | — | non | non |
| `isIpMotif` | Helper pur / formatage | `motif` | — | non | non |
| `isQualityMotif` | Helper pur / formatage | `motif` | — | non | non |
| `isDisputeMotif` | Helper pur / formatage | `motif` | — | non | non |
| `callFormHasContent` | Fonction exportée | `form` | — | non | non |
| `callRowToForm` | Fonction exportée | `row` | — | non | non |
| `fetchRecentCallLogs` | Lecture / recherche — tables: call_logs | `limit = 10` | call_logs | non | non |
| `fetchPendingCalls` | Lecture / recherche — tables: call_logs | `userId` | call_logs | non | non |
| `fetchCallById` | Lecture / recherche — tables: call_logs | `id` | call_logs | non | non |
| `insertCallLog` | Création / enregistrement — tables: call_logs | `payload` | call_logs | non | non |
| `insertCallLogReturning` | Création / enregistrement | `payload` | — | non | non |
| `fetchCallLogs` | Lecture / recherche — tables: call_logs | `—` | call_logs | non | non |
| `fetchCallLogsWithProfiles` | Lecture / recherche — tables: profiles | `—` | profiles | non | non |
| `updateCallLog` | Mise à jour / action métier — tables: call_logs | `id, updates` | call_logs | non | non |
| `cancelCall` | Passe statut annule | `id` | — | non | non |
| `createPharmacistCallTask` | Crée tâche appel_attente_pharmacien | `callRow, createdBy` | — | oui | non |
| `createPendingCallTask` | Crée tâche appel_brouillon | `row, createdBy` | tasks | oui | non |
| `completePendingCallTask` | Clôture tâche brouillon liée à l’appel | `callId, displayName` | — | non | non |
| `cancelPendingCallTask` | Annule tâche brouillon liée | `callId, displayName` | — | non | non |
| `submitCallLog` | Valide un appel (insert/update) + tâches associées selon statut | `form, userId, { editingId = null, completeDraftTask = fal…` | — | non | non |
| `saveCallPending` | Sauvegarde brouillon + tâche appel_brouillon | `form, userId, editingId = null` | — | non | non |

Autres exports (constantes / ré-exports) : `CALL_TYPES`, `CALL_MOTIFS`, `CALL_STATUTS_COMPTOIR`, `CALL_STATUT_CLOTURE`, `CALL_FORM_DEFAULTS`, `buildCallPayload`.

## 9. Handlers / actions UI

### `comptoir/Calls.jsx`

| Action / label (repère) | Handler | Appels service (détectés près du handler) | Feedback |
|-------------------------|---------|-------------------------------------------|----------|
| Valider (submit) | `handleValidate` | `submitCallLog` | succès / erreur ; ferme module |
| « Mettre en attente » | `handlePending` | `saveCallPending` | succès / erreur ; ferme module |
| « Annuler l’appel » | `handleCancel` | `cancelCall`, `cancelPendingCallTask` | succès / erreur ; ferme module |

### `dashboard/CallTracking.jsx`

| Action / label (repère) | Handler | Appels service (détectés près du handler) | Feedback |
|-------------------------|---------|-------------------------------------------|----------|
| Créer (submit) | `handleCreate` | `submitCallLog` / `saveCallPending` | erreur UI |
| « Mettre en attente » | `handlePendingCreate` | `saveCallPending` | erreur UI |
| Enregistrer ligne | `handleSave` | `updateCallLog`, `completePendingCallTask` / `cancelPendingCallTask` | — |

## 10. Formulaires & données

### CallForm (`shared/CallForm.jsx`) — comptoir + dashboard

| Champ | Label UI | Type | Requis | Valeurs |
|-------|----------|------|--------|---------|
| type | Type d'appel | select | oui (défaut) | `recu` | `envoye` |
| numero | Numéro | text | oui | — |
| contact_nom | Interlocuteur | text | non | — |
| contact_id | (annuaire, hors form bare) | uuid | non | directory_contacts |
| motif | Motif | select | oui | selon contactType ; enums convention |
| statut_traitement | Statut | select | oui | comptoir: resolu/a_rappeler/attente_pharmacien ; + `cloture` si showCloture |
| notes_appel | Note pharmacien | textarea | non | visible si showNotes (dashboard pharmacien) |

**Save** : `submitCallLog` / `saveCallPending` → `call_logs` (+ tâches brouillon / attente pharmacien).
**Edit/resume** : `callRowToForm` + `fetchCallById` (taskAction resume `callId`).

## 11. Données affichées

| Source (fonction / requête) | Colonnes / usage UI |
|-----------------------------|---------------------|
| `callService.js::fetchRecentCallLogs` | tables/RPC : call_logs |
| `callService.js::fetchPendingCalls` | tables/RPC : call_logs |
| `callService.js::fetchCallById` | tables/RPC : call_logs |
| `callService.js::fetchCallLogs` | tables/RPC : call_logs |
| `callService.js::fetchCallLogsWithProfiles` | tables/RPC : profiles |

## 12. Gap logs / tasks (propositions)

_Propositions uniquement — ne pas implémenter depuis cette checklist sans validation produit._

### Logs probablement manquants

- [ ] `callService.js::insertCallLog` — mutation sans `logEvent` (tables: call_logs)
- [ ] `callService.js::insertCallLogReturning` — mutation sans `logEvent` (tables: —)
- [ ] `callService.js::updateCallLog` — mutation sans `logEvent` (tables: call_logs)
- [ ] `callService.js::cancelCall` — mutation sans `logEvent` (tables: —)
- [ ] `callService.js::createPharmacistCallTask` — mutation sans `logEvent` (tables: —)
- [ ] `callService.js::createPendingCallTask` — mutation sans `logEvent` (tables: tasks)
- [ ] `callService.js::completePendingCallTask` — mutation sans `logEvent` (tables: —)
- [ ] `callService.js::cancelPendingCallTask` — mutation sans `logEvent` (tables: —)
- [ ] `callService.js::submitCallLog` — mutation sans `logEvent` (tables: —)
- [ ] `callService.js::saveCallPending` — mutation sans `logEvent` (tables: —)

### Tâches — manques / câblage à vérifier

Créations détectées : `callService.js::createPharmacistCallTask`, `callService.js::createPendingCallTask`. Vérifier alignement catalogue `taskCatalog.js` + actions `taskActions.js`.

