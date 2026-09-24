# Module magistral

## 1. Identité

| Champ | Valeur |
|-------|--------|
| id | `magistral` |
| label | Préparations / Magistrales |
| dossier | `src/modules/magistral/` |

## 2. Taskbar

| Élément | Valeur |
|---------|--------|
| Feature id | `magistral` (toutes vues) |
| Vues | `magistral_creation`, `magistral_devis`, `magistral_rappel`, `magistral_dispenser`, `magistral_renouvellement`, `magistral` |
| Composants | `Magistral.jsx` + `MagistralCreate`, `MagistralDevis`, `MagistralRappel`, `MagistralDispenser`, `MagistralRenouvellement` ; shared forms |

## 3. Dashboard

| Élément | Valeur |
|---------|--------|
| Page ids | `magistral_suivi` (+ alias `magistral`), `magistral_creation`, `magistral_devis`, `magistral_rappel`, `magistral_dispenser`, `magistral_renouvellement` |
| Composants | `MagistralManager`, `MagistralSettingsPanel` ; écrans métier via `Magistral` comptoir |
| `canAccess` | feature `magistral` ; défaut false pharmacien/préparateur ; settings → `parametres` |

## 4. Services

| Fichier | Rôle |
|---------|------|
| `magistralService.js` | Dossiers ST, workflow, mails, storage, sync tâches |
| `magistralParams.js` | Champs création / templates |
| `magistralPrint.js` | Impression fiches |

## 5. Logs

| category | action(s) |
|----------|-----------|
| `settings` | `save_magistral_settings` |
| `magistral` (via `logSoftFail`) | `upload_ordonnance`, `copy_ordonnance`, `copy_ordonnance_fallback`, `sync_tasks`, `purge_storage` |
| `mail` | envois ST / patient |

## 6. Tâches

| Source | Types |
|--------|-------|
| Catalogue (`preparations`) | `magistral_devis`, `magistral_a_controler`, `magistral_a_rappeler`, `magistral_a_dispenser`, `magistral_non_conforme` |
| Créés | `syncMagistralWorkflowTasks` selon statut |
| `taskActions.js` | toutes → **dashboard** (pages devis / rappel / dispenser / suivi) |

## 7. SQL

| Table | Notes | RLS / autre |
|-------|-------|-------------|
| `magistral_settings` | prestataire ST, tarifs, creation_champs | |
| `magistral_orders` | statuts workflow (devis → dispense/clôture…) | |
| Storage | bucket `magistral-ordonnances` | staff |
| Migration | `027_magistral_refonte.sql` | |

---

## 8. Fonctions exportées (services)

_Inventaire issu du code (2026-09-23). Colonnes Log / Tâches = état actuel, pas la cible._

### `services/magistralParams.js`

| Fonction | Rôle (résumé) | Args principaux | Tables / RPC | Tâches ? | Log ? |
|----------|---------------|-----------------|--------------|----------|-------|
| `getCreationChamp` | Lecture / recherche | `settings, code` | — | non | non |
| `listCreationFieldsForEtape` | Lecture / recherche | `settings, etapeId` | — | non | non |
| `buildDefaultCreationChamps` | Helper pur / formatage | `—` | — | non | non |
| `normalizeCreationChamps` | Helper pur / formatage | `uiMap` | — | non | non |
| `isFieldActive` | Helper pur / formatage | `settings, code` | — | non | non |
| `isFieldRequired` | Helper pur / formatage | `settings, code` | — | non | non |
| `validateCreationForm` | Mise à jour / action métier | `form, settings, { asDraft = false, ordonnanceFile = null,…` | — | non | non |
| `getMailTemplate` | Lecture / recherche | `settings, key` | — | non | non |
| `buildMailContext` | Helper pur / formatage | `order, settings, extra = {}` | — | non | non |
| `renderPlaceholders` | Helper pur / formatage | `text, ctx` | — | non | non |
| `renderMailTemplate` | Helper pur / formatage | `settings, key, order, extra = {}` | — | non | non |

Autres exports (constantes / ré-exports) : `CREATION_ETAPES`, `CREATION_FIELD_DEFS`, `MAIL_PLACEHOLDERS`, `MAIL_TEMPLATE_KEYS`, `DEFAULT_MAIL_TEMPLATES`.

### `services/magistralPrint.js`

| Fonction | Rôle (résumé) | Args principaux | Tables / RPC | Tâches ? | Log ? |
|----------|---------------|-----------------|--------------|----------|-------|
| `buildFicheDemandeHtml` | Helper pur / formatage | `order, settings` | — | non | non |
| `buildFeuilleSuiviHtml` | Helper pur / formatage | `order, settings` | — | non | non |
| `printFicheDemande` | Fonction exportée | `order, settings` | — | non | non |
| `printFeuilleSuivi` | Fonction exportée | `order, settings` | — | non | non |
| `printListeDossiers` | Fonction exportée | `orders` | — | non | non |

### `services/magistralService.js`

| Fonction | Rôle (résumé) | Args principaux | Tables / RPC | Tâches ? | Log ? |
|----------|---------------|-----------------|--------------|----------|-------|
| `calcMagistralPrice` | Helper pur / formatage | `settings, prixHtNet, tvaRate, portOverride = null` | — | non | non |
| `maskPatient` | Helper pur / formatage | `nom, prenom` | — | non | non |
| `fetchSettings` | Lecture / recherche — tables: magistral_settings | `—` | magistral_settings | non | non |
| `ensureSettings` | Idempotent : crée si absent — tables: magistral_settings | `seed = {}` | magistral_settings | non | non |
| `updateSettings` | Mise à jour / action métier — tables: magistral_settings | `payload, id` | magistral_settings | non | oui (`settings`) |
| `uploadMagistralFile` | Fichier / signature — tables: magistral-ordonnances | `orderId, file, kind = 'ordonnance'` | magistral-ordonnances | non | non |
| `sendTransactionalEmail` | Envoi / déclenchement | `to, subject, html, meta = {}` | — | non | non |
| `buildOrderHtml` | Helper pur / formatage | `order, settings, title` | — | non | non |
| `sendProviderEmail` | Envoi / déclenchement | `order, settings, subjectKey, subjectFallback` | — | non | non |
| `createMagistralOrder` | Création / enregistrement — tables: magistral_orders | `userId, form, { asDraft = false, ordonnanceFile = null } …` | magistral_orders | non | non |
| `searchOrdersForRenewal` | Lecture / recherche — tables: magistral_orders, magistral-ordonnances | `query, { limit = 40 } = {}` | magistral_orders, magistral-ordonnances | non | non |
| `renewMagistralOrder` | Fonction exportée — tables: magistral_orders | `userId, sourceOrderId` | magistral_orders | non | non |
| `updateOrder` | Mise à jour / action métier (+ crée tâche) — tables: magistral_orders | `id, payload` | magistral_orders | oui | non |
| `deleteOrder` | Mise à jour / action métier — tables: magistral-ordonnances, magistral_orders | `id` | magistral-ordonnances, magistral_orders | non | non |
| `saveOrderFromForm` | Création / enregistrement | `orderId, form, { sendEmail: doSend = false, userId = null…` | — | non | non |
| `fetchMyOrders` | Lecture / recherche — tables: magistral_orders | `userId, { limit = 50 } = {}` | magistral_orders | non | non |
| `fetchOrders` | Lecture / recherche — tables: magistral_orders | `{ statut = null, limit = 200 } = {}` | magistral_orders | non | non |
| `fetchOrderById` | Lecture / recherche — tables: magistral_orders | `id` | magistral_orders | non | non |
| `countAlerts` | Lecture / recherche — tables: magistral_orders | `—` | magistral_orders | non | non |
| `validateAnalyse` | Mise à jour / action métier | `orderId, userId` | — | non | non |
| `submitDraftToProvider` | Création / enregistrement | `orderId, userId` | — | non | non |
| `validateDevis` | Mise à jour / action métier | `orderId, { launchOrder = true, sendEmail: doSend = true, …` | — | non | non |
| `recordProviderQuote` | Envoi / déclenchement | `orderId, userId, { prixHt, tvaRate = 5.5, note = null } = {}` | — | non | non |
| `hasProviderQuote` | Helper pur / formatage | `order` | — | non | non |
| `markInTransit` | Mise à jour / action métier | `orderId, userId, providerRef = null` | — | non | non |
| `markArrived` | Mise à jour / action métier | `orderId, userId` | — | non | non |
| `saveReceptionControl` | Création / enregistrement | `orderId, userId, payload` | — | non | non |
| `recordPatientCall` | Envoi / déclenchement | `orderId, userId, attempt` | — | non | non |
| `markOrderReceived` | Mise à jour / action métier | `orderId, prixHtNet, tvaRate, notifyPatient = false` | — | non | non |
| `receiveOrder` | Mise à jour / action métier | `orderId, prixHtNet, opts = {}` | — | non | non |
| `dispenseOrder` | Mise à jour / action métier | `orderId, userId, { ordonnancier_number, conseil_note = nu…` | — | non | non |
| `closeOrder` | Mise à jour / action métier | `orderId, reason = '', userId = null` | — | non | non |
| `reopenNonConforme` | Mise à jour / action métier | `orderId, userId` | — | non | non |
| `orderToForm` | Helper pur / formatage | `order, settings = null` | — | non | non |
| `formFromSettings` | Fonction exportée | `settings` | — | non | non |
| `saveOrderEdit` | Création / enregistrement | `orderId, formData, opts = {}` | — | non | non |
| `orderToAdminDraft` | Helper pur / formatage | `order, settings = null` | — | non | non |
| `saveOrderAdmin` | Création / enregistrement | `orderId, draft, opts = {}` | — | non | non |

Autres exports (constantes / ré-exports) : `MAGISTRAL_STATUTS`, `JUSTIFS`, `APPEL_RESULTAT_LABELS`, `RECEPTION_CHECKLIST_KEYS`, `EMPTY_FORM`, `CREATION_ETAPES`, `CREATION_FIELD_DEFS`, `MAIL_PLACEHOLDERS`, `MAIL_TEMPLATE_KEYS`, `DEFAULT_MAIL_TEMPLATES`, `getCreationChamp`, `listCreationFieldsForEtape`, `buildDefaultCreationChamps`, `normalizeCreationChamps`, `isFieldActive`, `isFieldRequired`, `validateCreationForm`, `getMailTemplate`, `renderMailTemplate`, `buildMailContext`.

## 9. Handlers / actions UI

### `comptoir/MagistralCreate.jsx`

| Action / label (repère) | Handler | Appels service (détectés près du handler) | Feedback |
|-------------------------|---------|-------------------------------------------|----------|
| — | `handleCreate` | `setErr`, `createMagistralOrder`, `setOrdoFile`, `setWizardStep`, `setTimeout`, `closeModuleWindow` | erreur UI, succès / feedback, ferme module |

### `dashboard/MagistralManager.jsx`

| Action / label (repère) | Handler | Appels service (détectés près du handler) | Feedback |
|-------------------------|---------|-------------------------------------------|----------|
| — | `handleAdminSave` | `setAdminSaving`, `setErr`, `saveOrderAdmin`, `cancelAdminMode` | erreur UI, succès / feedback |
| — | `handleDeleteOrder` | `setErr`, `deleteOrder`, `setSelectedId`, `setRecvMode`, `cancelAdminMode` | erreur UI, succès / feedback |

Libellés boutons repérés dans le JSX : « Modifier le dossier (formulaire) ».

### `shared/MagistralReceptionCall.jsx`

| Action / label (repère) | Handler | Appels service (détectés près du handler) | Feedback |
|-------------------------|---------|-------------------------------------------|----------|
| — | `handleControlOk` | `setErr`, `saveReceptionControl`, `setPhase` | erreur UI |
| — | `handleControlNc` | `setErr`, `saveReceptionControl` | erreur UI |

Libellés boutons repérés dans le JSX : « Annuler ».

## 10. Formulaires & données

### MagistralOrderForm / EMPTY_FORM (`magistralService.EMPTY_FORM`)

Blocs :

| Bloc | Champs clés | Notes |
|------|-------------|-------|
| pharmacie | nom, adresse, email, interlocuteur | souvent prérempli settings |
| demande | nature (`commande`…), historique, prescripteur, date_ordo, voie_admin, forme, quantite, posologie, duree, formule | — |
| patient | nom, prenom, dob, type_prep (`ad`…), poids, allergies, deglutition, grossesse_allaitement, phone | — |
| analyse | dose_posologie_ok, contre_indications, interactions, justifications[], mention_ameli, risque_cat, decision (`st`…), commentaires | JUSTIFS catalogue |
| patient_email | email | — |
| preparation_interne | bool | — |
| ordonnanceFile | fichier | upload `uploadMagistralFile` |

**Save** : `createMagistralOrder` / `saveOrderFromForm` / renouvellement `renewMagistralOrder`.
**Workflow** : devis → contrôle → rappel → dispense (`validateDevis`, `saveReceptionControl`, `recordPatientCall`, `dispenseOrder`…) + tâches `magistral_*`.


## 11. Données affichées

| Source (fonction / requête) | Colonnes / usage UI |
|-----------------------------|---------------------|
| `magistralParams.js::getCreationChamp` | tables/RPC : — |
| `magistralParams.js::listCreationFieldsForEtape` | tables/RPC : — |
| `magistralParams.js::getMailTemplate` | tables/RPC : — |
| `magistralService.js::fetchSettings` | tables/RPC : magistral_settings |
| `magistralService.js::searchOrdersForRenewal` | tables/RPC : magistral_orders, magistral-ordonnances |
| `magistralService.js::fetchMyOrders` | tables/RPC : magistral_orders |
| `magistralService.js::fetchOrders` | tables/RPC : magistral_orders |
| `magistralService.js::fetchOrderById` | tables/RPC : magistral_orders |
| `magistralService.js::countAlerts` | tables/RPC : magistral_orders |

## 12. Gap logs / tasks (propositions)

_Propositions uniquement — ne pas implémenter depuis cette checklist sans validation produit._

### Logs probablement manquants

- [ ] `magistralParams.js::validateCreationForm` — mutation sans `logEvent` (tables: —)
- [ ] `magistralService.js::uploadMagistralFile` — mutation sans `logEvent` (tables: magistral-ordonnances)
- [ ] `magistralService.js::sendTransactionalEmail` — mutation sans `logEvent` (tables: —)
- [ ] `magistralService.js::sendProviderEmail` — mutation sans `logEvent` (tables: —)
- [ ] `magistralService.js::createMagistralOrder` — mutation sans `logEvent` (tables: magistral_orders)
- [ ] `magistralService.js::renewMagistralOrder` — mutation sans `logEvent` (tables: magistral_orders)
- [ ] `magistralService.js::updateOrder` — mutation sans `logEvent` (tables: magistral_orders)
- [ ] `magistralService.js::deleteOrder` — mutation sans `logEvent` (tables: magistral-ordonnances, magistral_orders)
- [ ] `magistralService.js::saveOrderFromForm` — mutation sans `logEvent` (tables: —)
- [ ] `magistralService.js::validateAnalyse` — mutation sans `logEvent` (tables: —)
- [ ] `magistralService.js::submitDraftToProvider` — mutation sans `logEvent` (tables: —)
- [ ] `magistralService.js::validateDevis` — mutation sans `logEvent` (tables: —)
- [ ] `magistralService.js::markInTransit` — mutation sans `logEvent` (tables: —)
- [ ] `magistralService.js::markArrived` — mutation sans `logEvent` (tables: —)
- [ ] `magistralService.js::saveReceptionControl` — mutation sans `logEvent` (tables: —)
- [ ] `magistralService.js::markOrderReceived` — mutation sans `logEvent` (tables: —)
- [ ] `magistralService.js::receiveOrder` — mutation sans `logEvent` (tables: —)
- [ ] `magistralService.js::dispenseOrder` — mutation sans `logEvent` (tables: —)
- [ ] `magistralService.js::closeOrder` — mutation sans `logEvent` (tables: —)
- [ ] `magistralService.js::saveOrderEdit` — mutation sans `logEvent` (tables: —)
- [ ] `magistralService.js::saveOrderAdmin` — mutation sans `logEvent` (tables: —)

### Tâches — manques / câblage à vérifier

Créations détectées : `magistralService.js::updateOrder`. Vérifier alignement catalogue `taskCatalog.js` + actions `taskActions.js`.

