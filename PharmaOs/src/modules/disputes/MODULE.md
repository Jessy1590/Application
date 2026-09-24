# Module disputes

## 1. Identité

| Champ | Valeur |
|-------|--------|
| id | `disputes` |
| label | Litiges |
| dossier | `src/modules/disputes/` |

## 2. Taskbar

| Élément | Valeur |
|---------|--------|
| Feature id | `disputes` |
| Vue | `#disputes` → `Disputes.jsx` |
| Composants | `comptoir/Disputes.jsx`, `shared/DisputeForm.jsx` |

## 3. Dashboard

| Élément | Valeur |
|---------|--------|
| Page id | `disputes` |
| Composant | `dashboard/DisputesManager.jsx` |
| `canAccess` | `canAccess(..., 'disputes')` |

## 4. Services

| Fichier | Rôle |
|---------|------|
| `disputeService.js` | CRUD litiges, brouillons, liens stock/perimes/lot |

## 5. Logs

Aucun `logEvent`.

## 6. Tâches

| Source | Types |
|--------|-------|
| Catalogue (`qualite`) | `litige_brouillon` |
| Créés | `createPendingDisputeTask` |
| `taskActions.js` | **resume** vue `disputes` (`disputeId`) |

## 7. SQL

| Table | Colonnes / enums | RLS |
|-------|------------------|-----|
| `supplier_disputes` | `dispute_type`, `statut`, fournisseur, montant, liens `lot_alert_id` / `stock_error_id` / `perime_id` | phase sql |
| Lecture | `directory_contacts` (partenaires) | — |

---

## 8. Fonctions exportées (services)

_Inventaire issu du code (2026-09-23). Colonnes Log / Tâches = état actuel, pas la cible._

### `services/disputeService.js`

| Fonction | Rôle (résumé) | Args principaux | Tables / RPC | Tâches ? | Log ? |
|----------|---------------|-----------------|--------------|----------|-------|
| `disputeFormHasContent` | Fonction exportée | `form` | — | non | non |
| `disputeRowToForm` | Fonction exportée | `row` | — | non | non |
| `createDispute` | Création / enregistrement — tables: supplier_disputes | `userId, payload, statut = 'ouvert'` | supplier_disputes | non | non |
| `updateDispute` | Mise à jour / action métier — tables: supplier_disputes | `id, payload, statut` | supplier_disputes | non | non |
| `fetchMyDisputes` | Lecture / recherche — tables: supplier_disputes | `userId` | supplier_disputes | non | non |
| `fetchPendingDisputes` | Lecture / recherche — tables: supplier_disputes | `userId` | supplier_disputes | non | non |
| `fetchDisputeById` | Lecture / recherche — tables: supplier_disputes | `id` | supplier_disputes | non | non |
| `cancelDispute` | Mise à jour / action métier | `id` | — | non | non |
| `createPendingDisputeTask` | Création / enregistrement (+ crée tâche) — tables: tasks | `row, createdBy` | tasks | oui | non |
| `completePendingDisputeTask` | Mise à jour / action métier | `disputeId, displayName` | — | non | non |
| `cancelPendingDisputeTask` | Mise à jour / action métier | `disputeId, displayName` | — | non | non |
| `fetchCommercialPartners` | Lecture / recherche — tables: directory_contacts | `—` | directory_contacts | non | non |
| `fetchDisputes` | Lecture / recherche — tables: supplier_disputes | `{ statut } = {}` | supplier_disputes | non | non |
| `updateDisputeStatus` | Mise à jour / action métier — tables: supplier_disputes | `id, statut` | supplier_disputes | non | non |
| `createDisputeFromLotAlert` | Création / enregistrement — tables: supplier_disputes | `userId, alert, returnLocation` | supplier_disputes | non | non |

Autres exports (constantes / ré-exports) : `DISPUTE_TYPES`, `DISPUTE_FORM_DEFAULTS`.

## 9. Handlers / actions UI

### `comptoir/Disputes.jsx`

| Action / label (repère) | Handler | Appels service (détectés près du handler) | Feedback |
|-------------------------|---------|-------------------------------------------|----------|
| — | `handleValidate` | `setErr`, `buildPayload`, `updateDispute`, `completePendingDisputeTask`, `createDispute`, `attachDisputeToPerime`, `setSkipAutoPending`, `setTimeout` | erreur UI, succès / feedback, ferme module |
| — | `handlePending` | `setErr`, `buildPayload`, `updateDispute`, `createDispute`, `createPendingDisputeTask`, `setSkipAutoPending`, `setTimeout`, `closeModuleWindow`, `cancelDispute` | erreur UI, succès / feedback, ferme module |
| — | `handleCancel` | `setErr`, `cancelDispute`, `cancelPendingDisputeTask`, `setSkipAutoPending`, `setTimeout`, `closeModuleWindow`, `setEditingId` | erreur UI, succès / feedback, ferme module |

### `dashboard/DisputesManager.jsx`

| Action / label (repère) | Handler | Appels service (détectés près du handler) | Feedback |
|-------------------------|---------|-------------------------------------------|----------|
| — | `handleSave` | `setSaving`, `updateDispute`, `createDispute`, `setCreating` | erreur UI |

Libellés boutons repérés dans le JSX : « Valider », « Clôturer », « Annuler ».

## 10. Formulaires & données

### DisputeForm (`shared/DisputeForm.jsx`)

| Champ | Label UI | Type | Requis | Valeurs |
|-------|----------|------|--------|---------|
| dispute_type | Type | select | oui | DISPUTE_TYPES |
| fournisseur_id | Fournisseur (annuaire) | select | non | commercial_partner |
| fournisseur_nom | Nom fournisseur | text | si pas d'id | — |
| montant | Montant (€) | number | non | — |
| description | Description | textarea | oui | — |
| pieces | Pièces / liens | textarea | non | — |
| perime_id / lot_alert_id / stock_error_id | (origine) | uuid | non | liens métier |

**Save** : `createDispute` / `updateDispute` ; pending → `createPendingDisputeTask`.

## 11. Données affichées

| Source (fonction / requête) | Colonnes / usage UI |
|-----------------------------|---------------------|
| `disputeService.js::fetchMyDisputes` | tables/RPC : supplier_disputes |
| `disputeService.js::fetchPendingDisputes` | tables/RPC : supplier_disputes |
| `disputeService.js::fetchDisputeById` | tables/RPC : supplier_disputes |
| `disputeService.js::fetchCommercialPartners` | tables/RPC : directory_contacts |
| `disputeService.js::fetchDisputes` | tables/RPC : supplier_disputes |

## 12. Gap logs / tasks (propositions)

_Propositions uniquement — ne pas implémenter depuis cette checklist sans validation produit._

### Logs probablement manquants

- [ ] `disputeService.js::createDispute` — mutation sans `logEvent` (tables: supplier_disputes)
- [ ] `disputeService.js::updateDispute` — mutation sans `logEvent` (tables: supplier_disputes)
- [ ] `disputeService.js::cancelDispute` — mutation sans `logEvent` (tables: —)
- [ ] `disputeService.js::createPendingDisputeTask` — mutation sans `logEvent` (tables: tasks)
- [ ] `disputeService.js::completePendingDisputeTask` — mutation sans `logEvent` (tables: —)
- [ ] `disputeService.js::cancelPendingDisputeTask` — mutation sans `logEvent` (tables: —)
- [ ] `disputeService.js::updateDisputeStatus` — mutation sans `logEvent` (tables: supplier_disputes)
- [ ] `disputeService.js::createDisputeFromLotAlert` — mutation sans `logEvent` (tables: supplier_disputes)

### Tâches — manques / câblage à vérifier

Créations détectées : `disputeService.js::createPendingDisputeTask`. Vérifier alignement catalogue `taskCatalog.js` + actions `taskActions.js`.

