# Module lot-alerts

## 1. Identité

| Champ | Valeur |
|-------|--------|
| id | `lot_alerts` (taskbar) / `retrait_lot` (dashboard) |
| label | Retrait de lot |
| dossier | `src/modules/lot-alerts/` |

## 2. Taskbar

| Élément | Valeur |
|---------|--------|
| Feature id | `lot_alerts` |
| Vue | `#lot_alerts` → `LotAlerts.jsx` |
| Composant | `comptoir/LotAlerts.jsx` |

## 3. Dashboard

| Élément | Valeur |
|---------|--------|
| Page id | `retrait_lot` |
| Composant | `dashboard/RetraitLotManager.jsx` |
| `canAccess` | taskbar `lot_alerts` ; dashboard `retrait_lot` |

## 4. Services

| Fichier | Rôle |
|---------|------|
| `lotAlertService.js` | Alertes, ACK équipe, étapes, tâche `retrait_lot`, lien litige |

## 5. Logs

Aucun `logEvent`.

## 6. Tâches

| Source | Types |
|--------|-------|
| Catalogue (`stock`) | `retrait_lot` |
| Créés | `createRetraitLotTask` |
| `taskActions.js` | **close** mode `retrait_lot` |

## 7. SQL

| Table | Colonnes clés | RLS |
|-------|---------------|-----|
| `lot_alerts` | numéro, médicament, lot, labo, `status`, `steps_done`, `task_id`… | lecture équipe ; INSERT admin |
| `lot_alert_acks` | `alert_id`, `user_id`, `read_at` | upsert own |

---

## 8. Fonctions exportées (services)

_Inventaire issu du code (2026-09-23). Colonnes Log / Tâches = état actuel, pas la cible._

### `services/lotAlertService.js`

| Fonction | Rôle (résumé) | Args principaux | Tables / RPC | Tâches ? | Log ? |
|----------|---------------|-----------------|--------------|----------|-------|
| `fetchTeamProfiles` | Lecture / recherche — tables: profiles, supplier_disputes | `—` | profiles, supplier_disputes | non | non |
| `fetchOpenLotAlerts` | Lecture / recherche — tables: lot_alerts | `—` | lot_alerts | non | non |
| `fetchMyAcks` | Lecture / recherche — tables: lot_alert_acks | `userId` | lot_alert_acks | non | non |
| `acknowledgeLotAlert` | Fonction exportée — tables: lot_alert_acks | `alertId, userId` | lot_alert_acks | non | non |
| `fetchLotAlerts` | Lecture / recherche — tables: lot_alerts | `—` | lot_alerts | non | non |
| `fetchAcksForAlert` | Lecture / recherche — tables: lot_alert_acks | `alertId` | lot_alert_acks | non | non |
| `createLotAlert` | Création / enregistrement — tables: profiles, tasks, task_assignments, lot_alerts | `payload, userId` | profiles, tasks, task_assignments, lot_alerts | non | non |
| `updateLotAlertSteps` | Mise à jour / action métier — tables: lot_alerts | `id, { steps_done, reception_validated }` | lot_alerts | non | non |
| `closeLotAlert` | Mise à jour / action métier — tables: lot_alerts | `id` | lot_alerts | non | non |
| `createRetraitLotTask` | Création / enregistrement | `form, userId` | — | non | non |
| `fetchAnsmSecurityAlerts` | Lecture / recherche | `—` | — | non | non |

## 9. Handlers / actions UI

### `comptoir/LotAlerts.jsx`

| Action / label (repère) | Handler | Appels service (détectés près du handler) | Feedback |
|-------------------------|---------|-------------------------------------------|----------|
| — | `handleAck` | `setTimeout`, `setErr` | erreur UI, succès / feedback |

### `dashboard/RetraitLotManager.jsx`

| Action / label (repère) | Handler | Appels service (détectés près du handler) | Feedback |
|-------------------------|---------|-------------------------------------------|----------|
| — | `handleSubmit` | `setSuccess`, `createLotAlert`, `updateLotAlertSteps` | erreur UI, succès / feedback |
| — | `handleSaveSteps` | `updateLotAlertSteps`, `setSuccess`, `setSelected`, `setAnsmLoading`, `setAnsmErr`, `fetchAnsmSecurityAlerts`, `setAnsmItems` | succès / feedback |

Libellés boutons repérés dans le JSX : « Clôturer », « Valider réception + démarches », « Annuler ».

## 10. Formulaires & données

### Comptoir — pas de formulaire de création

Accusé lecture uniquement : bouton « Lu » → `acknowledgeLotAlert(alertId, userId)`.

Affiché : medicament, lot, alert_number, laboratoire, motif ; ack `read_at`.

### Dashboard — création alerte (`RetraitLotManager`)

Champs typiques via `createLotAlert` / `createRetraitLotTask` : médicament, lot, n° alerte, laboratoire, motif, étapes `steps_done`, `reception_validated`. (Lire le manager pour labels exacts.)

**Save** : `createLotAlert` → `lot_alerts` + tâche `retrait_lot` ; litige possible via `createDisputeFromLotAlert` (module disputes).


## 11. Données affichées

| Source (fonction / requête) | Colonnes / usage UI |
|-----------------------------|---------------------|
| `lotAlertService.js::fetchTeamProfiles` | tables/RPC : profiles, supplier_disputes |
| `lotAlertService.js::fetchOpenLotAlerts` | tables/RPC : lot_alerts |
| `lotAlertService.js::fetchMyAcks` | tables/RPC : lot_alert_acks |
| `lotAlertService.js::fetchLotAlerts` | tables/RPC : lot_alerts |
| `lotAlertService.js::fetchAcksForAlert` | tables/RPC : lot_alert_acks |
| `lotAlertService.js::fetchAnsmSecurityAlerts` | tables/RPC : — |

## 12. Gap logs / tasks (propositions)

_Propositions uniquement — ne pas implémenter depuis cette checklist sans validation produit._

### Logs probablement manquants

- [ ] `lotAlertService.js::createLotAlert` — mutation sans `logEvent` (tables: profiles, tasks, task_assignments, lot_alerts)
- [ ] `lotAlertService.js::updateLotAlertSteps` — mutation sans `logEvent` (tables: lot_alerts)
- [ ] `lotAlertService.js::closeLotAlert` — mutation sans `logEvent` (tables: lot_alerts)
- [ ] `lotAlertService.js::createRetraitLotTask` — mutation sans `logEvent` (tables: —)

### Tâches — manques / câblage à vérifier

- [ ] Module sans création de tâche détectée — confirmer si des événements métier devraient en produire.

