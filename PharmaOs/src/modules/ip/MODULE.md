# Module ip

## 1. Identité

| Champ | Valeur |
|-------|--------|
| id | `ip` |
| label | Act-IP |
| dossier | `src/modules/ip/` |

## 2. Taskbar

| Élément | Valeur |
|---------|--------|
| Feature id | `ip` |
| Vue | `#ip` → `IP.jsx` |
| Composants | `comptoir/IP.jsx`, `shared/IpForm.jsx` |

## 3. Dashboard

| Élément | Valeur |
|---------|--------|
| Page id | `ip` |
| Composant | `dashboard/IpManagement.jsx` |
| `canAccess` | `canAccess(..., 'ip')` |

## 4. Services

| Fichier | Rôle |
|---------|------|
| `ipService.js` | CRUD `act_ip_logs`, brouillons, tâches `ip_brouillon` |

## 5. Logs

Aucun `logEvent`. Table métier : `act_ip_logs`.

## 6. Tâches

| Source | Types |
|--------|-------|
| Catalogue (`communication`) | `ip_brouillon` |
| Créés | `createPendingIpTask` |
| `taskActions.js` | **resume** vue `ip` (`ipId`) |

## 7. SQL

| Table | Colonnes clés | RLS |
|-------|---------------|-----|
| `act_ip_logs` | patient, médecin, champs SFPC, `statut_ip` (Cloturee / En attente / Déclaré / Annulee) | INSERT/SELECT own ; admin dashboard |

---

## 8. Fonctions exportées (services)

_Inventaire issu du code (2026-09-23). Colonnes Log / Tâches = état actuel, pas la cible._

### `services/ipService.js`

| Fonction | Rôle (résumé) | Args principaux | Tables / RPC | Tâches ? | Log ? |
|----------|---------------|-----------------|--------------|----------|-------|
| `fetchRecentIpLogs` | Lecture / recherche — tables: act_ip_logs | `limit = 10` | act_ip_logs | non | non |
| `insertIpLog` | Création / enregistrement — tables: act_ip_logs | `payload` | act_ip_logs | non | non |
| `appendDoctorSwitchNote` | Fonction exportée | `medecinId, doctors, noteText` | — | non | non |
| `fetchIps` | Lecture / recherche — tables: act_ip_logs | `—` | act_ip_logs | non | non |
| `updateIp` | Mise à jour / action métier — tables: act_ip_logs | `id, updates` | act_ip_logs | non | non |
| `fetchIpsWithProfiles` | Lecture / recherche — tables: act_ip_logs, profiles | `—` | act_ip_logs, profiles | non | non |
| `insertIpLogReturning` | Création / enregistrement — tables: act_ip_logs | `payload` | act_ip_logs | non | non |
| `createPendingIpTask` | Création / enregistrement (+ crée tâche) | `ipRow, createdBy` | — | oui | non |
| `fetchPendingIps` | Lecture / recherche — tables: act_ip_logs | `userId = null` | act_ip_logs | non | non |
| `fetchIpById` | Lecture / recherche — tables: act_ip_logs | `id` | act_ip_logs | non | non |
| `cancelIp` | Mise à jour / action métier | `ipId` | — | non | non |
| `completePendingIpTask` | Mise à jour / action métier — tables: tasks | `ipId, displayName` | tasks | non | non |
| `cancelPendingIpTask` | Mise à jour / action métier — tables: tasks | `ipId, displayName` | tasks | non | non |
| `ipFormHasContent` | Fonction exportée | `form` | — | non | non |
| `ipRowToForm` | Fonction exportée | `row` | — | non | non |
| `buildIpPayload` | Helper pur / formatage | `form, userId, doctors, statutIp` | — | non | non |

Autres exports (constantes / ré-exports) : `fetchHealthProfessionals`.

## 9. Handlers / actions UI

### `comptoir/IP.jsx`

| Action / label (repère) | Handler | Appels service (détectés près du handler) | Feedback |
|-------------------------|---------|-------------------------------------------|----------|
| — | `handleValidate` | `setErrorMsg`, `setSuccessMsg`, `buildIpPayload`, `updateIp`, `completePendingIpTask`, `setSkipAutoPending`, `setTimeout`, `closeModuleWindow` | erreur UI, succès / feedback, ferme module |
| — | `handlePending` | `setErrorMsg`, `setSuccessMsg`, `buildIpPayload`, `updateIp`, `setSkipAutoPending`, `setTimeout`, `closeModuleWindow` | erreur UI, succès / feedback, ferme module |
| — | `handleCancel` | `setErrorMsg`, `cancelIp`, `cancelPendingIpTask`, `setSkipAutoPending`, `setSuccessMsg`, `setTimeout`, `closeModuleWindow` | erreur UI, succès / feedback, ferme module |

### `dashboard/IpManagement.jsx`

| Action / label (repère) | Handler | Appels service (détectés près du handler) | Feedback |
|-------------------------|---------|-------------------------------------------|----------|
| — | `handleSaveEdit` | `updateIp`, `completePendingIpTask`, `cancelPendingIpTask`, `setEditingIp`, `setDeclareIp` | erreur UI |
| — | `handleOpenDeclare` | `setDeclareIp`, `setJsonCopied` | — |
| — | `handleCopyJsonAndDeclare` | — (voir corps) | — |

Libellés boutons repérés dans le JSX : « Annuler ».

## 10. Formulaires & données

### IpForm (`shared/IpForm.jsx`)

| Champ | Label UI | Type | Requis (requireCore) | Valeurs |
|-------|----------|------|----------------------|---------|
| patient_initiales | Initiales | text max 4 | oui | UPPER |
| patient_age | Âge | number | oui | — |
| patient_sexe | Sexe | select | oui | M / F |
| medecin_id / medecin_nom_libre | Médecin | select + texte | oui (un des deux) | directory health_professional |
| medicament_en_cause (+ CIP via MedicamentFields) | Médicament | text | oui | — |
| probleme_identifie | Identification du problème | select | oui | liste PROBLEMES (1–11) |
| type_intervention | Intervention | select | oui | INTERVENTIONS 1–7 |
| mode_transmission | Transmission | select | oui | TRANSMISSIONS |
| avis_prescripteur | Avis du prescripteur | select | oui | Accepte/Refuse/Non joignable/Non contacte |
| devenir_intervention | Devenir | select | oui | DEVENIRS 1–7 |
| commentaires | Détail du contexte | textarea | non | — |

**Save** : `insertIpLog` / `insertIpLogReturning` / `updateIp` ; pending → `createPendingIpTask`.
**Edit** : `ipRowToForm` + `fetchIpById`.

## 11. Données affichées

| Source (fonction / requête) | Colonnes / usage UI |
|-----------------------------|---------------------|
| `ipService.js::fetchRecentIpLogs` | tables/RPC : act_ip_logs |
| `ipService.js::fetchIps` | tables/RPC : act_ip_logs |
| `ipService.js::fetchIpsWithProfiles` | tables/RPC : act_ip_logs, profiles |
| `ipService.js::fetchPendingIps` | tables/RPC : act_ip_logs |
| `ipService.js::fetchIpById` | tables/RPC : act_ip_logs |

## 12. Gap logs / tasks (propositions)

_Propositions uniquement — ne pas implémenter depuis cette checklist sans validation produit._

### Logs probablement manquants

- [ ] `ipService.js::insertIpLog` — mutation sans `logEvent` (tables: act_ip_logs)
- [ ] `ipService.js::updateIp` — mutation sans `logEvent` (tables: act_ip_logs)
- [ ] `ipService.js::insertIpLogReturning` — mutation sans `logEvent` (tables: act_ip_logs)
- [ ] `ipService.js::createPendingIpTask` — mutation sans `logEvent` (tables: —)
- [ ] `ipService.js::cancelIp` — mutation sans `logEvent` (tables: —)
- [ ] `ipService.js::completePendingIpTask` — mutation sans `logEvent` (tables: tasks)
- [ ] `ipService.js::cancelPendingIpTask` — mutation sans `logEvent` (tables: tasks)

### Tâches — manques / câblage à vérifier

Créations détectées : `ipService.js::createPendingIpTask`. Vérifier alignement catalogue `taskCatalog.js` + actions `taskActions.js`.

