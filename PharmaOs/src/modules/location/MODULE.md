# Module location

## 1. Identité

| Champ | Valeur |
|-------|--------|
| id | `location` |
| label | Location |
| dossier | `src/modules/location/` |

## 2. Taskbar

| Élément | Valeur |
|---------|--------|
| Feature id | `location` (toutes vues) |
| Vues | `location_creation`, `location_prolongation`, `location_cloture`, `location_contact`, `location` |
| Composant | `comptoir/Location.jsx` (+ UI Phie `phie/`, `shared/LocationPhieMount.jsx`) |

## 3. Dashboard

| Élément | Valeur |
|---------|--------|
| Page ids | `location_suivi`, `location_creation`, `location_prolongation`, `location_cloture`, `location_contact`, `location_facture`, `location_parc`, `location_transcription` (alias `location` → suivi) |
| Composants | `LocationManager`, `LocationTranscription`, réutilise `Location` comptoir pour création/prol./clôture |
| `canAccess` | feature unique `location` ; défaut false pour pharmacien/préparateur (casquettes / admin) ; paramètres → admin `parametres` |

## 4. Services

| Fichier | Rôle |
|---------|------|
| `locationService.js` | Données dossiers / parc / contact / audit |
| `locationRules.js` | Moteur règles / alertes contact |
| `locationAccess.js` | Compat sous-rôle Phie `gestionnaire` (≠ portail) |
| `locationGlobals.js` / `locationPrint.js` | Globals IIFE Phie / impression |

## 5. Logs

| category | action(s) |
|----------|-----------|
| `location` | `dossier_create`, `dossier_update`, `dossier_cloture`, `dossier_delete`, `appareil_change`, `prolongation_add`, `contact_upsert` (+ actions dynamiques via `audit`) |
| `mail` | envois transactionnels location |

## 6. Tâches

| Source | Types |
|--------|-------|
| Catalogue (`location`) | `location_a_rappeler`, `location_attente_suite` |
| Créés | workflow contact / suite métier |
| `taskActions.js` | → dashboard `location_contact` / `location_suivi` |

## 7. SQL

Tables `location_*` (voir `sql/README.md`) : patients, dossiers, appareils, prolongations, contacts, suivi_lignes, prestataires, parametres, regles, templates_contact, champs_creation. Enums statut dossier / type appareil / phase contact documentés dans le README. Legacy `rental_*` retiré (041).

---

## 8. Fonctions exportées (services)

_Inventaire issu du code (2026-09-23). Colonnes Log / Tâches = état actuel, pas la cible._

### `services/locationAccess.js`

| Fonction | Rôle (résumé) | Args principaux | Tables / RPC | Tâches ? | Log ? |
|----------|---------------|-----------------|--------------|----------|-------|
| `cloneDefaults` | Fonction exportée | `—` | — | non | non |
| `normalize` | Helper pur / formatage | `—` | — | non | non |
| `isLocked` | Helper pur / formatage | `—` | — | non | non |
| `isEditableFeature` | Helper pur / formatage | `—` | — | non | non |
| `can` | Fonction exportée | `—` | — | non | non |
| `resolveRoleFromPortail` | Mise à jour / action métier | `portailRole, opts = {}` | — | non | non |
| `resolveRole` | Mise à jour / action métier | `snap` | — | non | non |
| `loadMatrix` | Lecture / recherche | `—` | — | non | non |
| `invalidate` | Helper pur / formatage | `—` | — | non | non |
| `featureForModule` | Fonction exportée | `moduleName` | — | non | non |
| `featureForView` | Fonction exportée | `view` | — | non | non |
| `canAccessLocation` | Fonction exportée | `role, _feature = null, overrides = [], casquetteGrants = []` | — | non | non |
| `canAccessLocationView` | Fonction exportée | `role, _view, overrides = [], casquetteGrants = []` | — | non | non |

Autres exports (constantes / ré-exports) : `PARAM_KEY`, `ROLES`, `FEATURES`, `DEFAULTS`, `MODULE_FEATURE`, `LocationAccessApi`.

### `services/locationGlobals.js`

| Fonction | Rôle (résumé) | Args principaux | Tables / RPC | Tâches ? | Log ? |
|----------|---------------|-----------------|--------------|----------|-------|
| `ensureLocationGlobals` | Idempotent : crée si absent | `—` | — | non | non |

### `services/locationPrint.js`

Exports (const/helpers) : printFiche, printTableau, printContactList, buildFicheHtml, buildSuiviEventRows

### `services/locationRules.js`

| Fonction | Rôle (résumé) | Args principaux | Tables / RPC | Tâches ? | Log ? |
|----------|---------------|-----------------|--------------|----------|-------|
| `parseJson` | Helper pur / formatage | `v, fallback` | — | non | non |
| `addDuration` | Création / enregistrement | `dateStr, duree, unite` | — | non | non |
| `daysBetween` | Helper pur / formatage | `a, b` | — | non | non |
| `todayISO` | Helper pur / formatage | `—` | — | non | non |
| `templateMotifFor` | Helper pur / formatage | `motif` | — | non | non |
| `isGenericContactMotif` | Helper pur / formatage | `motif` | — | non | non |
| `pickContactMotif` | Helper pur / formatage | `reasons` | — | non | non |
| `resolveLgo` | Mise à jour / action métier | `ctx, reasons, params` | — | non | non |
| `formatDateFr` | Helper pur / formatage | `iso` | — | non | non |
| `interpolate` | Helper pur / formatage | `text, vars` | — | non | non |
| `varsFromConditions` | Helper pur / formatage | `cond, extra` | — | non | non |
| `typeLabel` | Helper pur / formatage | `type` | — | non | non |
| `isFactureParPrestataire` | Helper pur / formatage | `ctx` | — | non | non |
| `evaluate` | Helper pur / formatage | `ctx, rules, params` | — | non | non |
| `listRules` | Lecture / recherche — tables: location_regles | `client` | location_regles | non | non |
| `upsertRule` | Création / enregistrement — tables: location_regles | `clientOrRow, maybeRow` | location_regles | non | non |
| `deleteRule` | Mise à jour / action métier — tables: location_regles | `clientOrId, maybeId` | location_regles | non | non |

Autres exports (constantes / ré-exports) : `TYPE_LABELS`, `MOTIF_TO_TEMPLATE`.


### `services/locationService.js`

_API exposée via `export { … }` (fonctions définies dans une IIFE). Inventaire des `async function` :_

| Fonction | Rôle | Args | Tables | Tâches ? | Log (`audit`/`logEvent`) ? |
|----------|------|------|--------|----------|------------------------------|
| `loadParams` | Charge paramètres (cache) | `—` | location_parametres | non | non |
| `setParam` | Upsert paramètre + audit | `cle, valeur, userId` | location_parametres | non | non |
| `loadRules` | Charge règles contact | `force` | — | non | non |
| `listPrestataires` | Liste prestataires | `actifsOnly` | location_prestataires | non | non |
| `searchPatients` | Recherche patients | `q` | location_patients | non | non |
| `createPatient` | Crée patient | `row` | location_patients | non | non |
| `updatePatient` | MAJ patient | `id, row` | location_patients | non | non |
| `listDossiers` | Liste dossiers filtrés | `filters = {}` | location_dossiers | non | non |
| `getDossier` | Dossier par id (+ enrich) | `id` | location_dossiers | non | non |
| `insertDossierRow` | Insert dossier (interne) | `dossierRow` | location_dossiers | non | non |
| `rollbackCreateDossierComplet` | Rollback création (interne) | `dossierId, patientId, patientWasNew` | location_patients | non | non |
| `createDossierComplet` | Création dossier+appareil+audit | `payload, userId, opts = {}` | location_patients, location_appareils, location_prolongations | non | oui |
| `updateDossierComplet` | MAJ dossier complet+audit | `dossierId, payload, userId, opts = {}` | location_appareils, location_prolongations | non | oui |
| `updateAppareil` | MAJ appareil | `id, row` | location_appareils | non | non |
| `updateDossier` | MAJ dossier | `id, row` | location_dossiers | non | non |
| `cloturerDossier` | Clôture dossier+audit | `id, answers` | — | non | oui |
| `deleteDossier` | Suppression dossier+audit | `id` | location_dossiers | non | oui |
| `changerAppareil` | Change appareil+audit | `dossierId, newApp, userId` | location_appareils | non | oui |
| `addProlongation` | Ajoute prolongation+audit | `dossierId, row, userId` | location_prolongations | non | oui |
| `recalcProlongationChain` | Recalcule prolongations | `dossierId` | location_prolongations | non | non |
| `updateProlongation` | MAJ prolongation | `id, row` | location_prolongations | non | non |
| `deleteProlongation` | Supprime prolongation | `id` | location_prolongations | non | non |
| `listTemplates` | Liste templates contact | `—` | location_templates_contact | non | non |
| `findTemplateByMotif` | Template par motif | `typeAppareil, templateMotif` | — | non | non |
| `findTemplateById` | Template par id | `id` | location_templates_contact | non | non |
| `sendContactProblemEmail` | Email contact + logMailEvent | `dossier, contact = null, { to, note, resultat } = {}` | — | non | non |
| `listChampsCreation` | Champs création | `typeAppareil, actifsOnly` | location_champs_creation | non | non |
| `upsertChampCreation` | Upsert champ création | `row` | location_champs_creation | non | non |
| `deleteChampCreation` | Delete champ création | `id` | location_champs_creation | non | non |
| `upsertTemplate` | Upsert template | `row` | location_templates_contact | non | non |
| `deleteTemplate` | Delete template | `id` | location_templates_contact | non | non |
| `upsertPrestataire` | Upsert prestataire | `row` | location_prestataires | non | non |
| `deletePrestataire` | Delete prestataire | `id` | location_prestataires | non | non |
| `syncLocationContactTasks` | Sync tâches location_* | `contact` | — | oui | non |
| `fetchOpenContactsRaw` | SELECT contacts ouverts (interne) | `—` | location_contacts | non | non |
| `fetchOutcomeContactsRaw` | SELECT contacts outcome (interne) | `—` | location_contacts | non | non |
| `listOpenContacts` | Contacts ouverts UI | `—` | — | non | non |
| `listOutcomeContacts` | Contacts attente suite UI | `—` | — | non | non |
| `upsertContact` | Upsert contact + tâches + audit | `row` | location_contacts | non | oui |
| `archiveDossierContactSiblings` | Archive contacts siblings | `dossierId, keepId` | location_contacts | non | non |
| `invalidateDossierCommentaire` | Invalide commentaire | `dossierId, contacts` | — | non | non |
| `cancelOpenContactsForDossier` | Annule contacts ouverts | `dossierId` | location_contacts | non | non |
| `syncContactQueue` | Génère/maj file contact selon règles | `userId` | — | non | non |
| `listParcPrestataire` | Parc prestataire | `prestataireId` | — | non | non |
| `listParcPharmacie` | Parc pharmacie | `—` | — | non | non |

Helpers sync aussi exportés : `invalidateCache`, `CREATION_ETAPES`, `CREATION_FIELD_INDEX`, `getCreationChamp`, `listCreationFieldsForEtape`, `isCreationActif`, `isCreationRequired`, `isRequired`, `buildCreationChampsPayload`, `matchesDossierSearch`, `enrichDossier`, `dossierContext`, `contactInterpVars`, `buildLocationMailContext`, `isContactCycleObsolete`, `shouldResetContactToCommentaire`, `isFactureParPrestataire`, `splitList`, `joinList`, `appareilIdentiteParc`, `dossierLiePrestataire`, `sb`.

Wrapper `audit(action, detail)` → `logEvent({ category: 'location', … })`.

## 9. Handlers / actions UI

UI majoritairement **legacy Phie** (`phie/*.js`) montée via `shared/LocationPhieMount.jsx` + shells React.

| Surface | Fichiers | Actions typiques | Service |
|---------|----------|------------------|---------|
| Création | `phie/creation.js`, `fields.js` | Nouveau dossier / patient / appareil | `createDossierComplet`, `createPatient` |
| Prolongation | `phie/prolongation.js` | Ajout / MAJ | `addProlongation`, `updateProlongation` |
| Clôture | `phie/cloture.js` | Clôturer | `cloturerDossier` |
| Contact | `phie/contact.js` | File à rappeler / suite | `upsertContact`, `syncContactQueue` |
| Suivi | `phie/suivi.js` | Liste / recherche | `listDossiers`, `getDossier` |
| Parc | `phie/parc.js` | Parc pharma / prestataire | `listParc*` |
| Facture | `phie/facture.js` | Vue facturation | dossier |
| Admin params | `phie/admin-location.js` | Params / règles / templates | `setParam`, rules, templates |
| Transcription | `phie/transcription*.js` + `dashboard/LocationTranscription.jsx` | OCR / saisie | local + service |
| Feedback | DOM Phie | messages inline | — |

## 10. Formulaires & données

Champs de création **paramétrables** (`location_champs_creation` / `listChampsCreation`) selon type d’appareil — pas un unique React form. Étapes : `CREATION_ETAPES`.

Contact / clôture / prolongation : formulaires DOM Phie (motifs, templates, dates, résultats d’appel) → payloads vers `upsertContact`, `addProlongation`, `cloturerDossier`.

## 11. Données affichées

| Source | Usage |
|--------|-------|
| `listDossiers` / `getDossier` / `enrichDossier` | Suivi, fiches |
| `listOpenContacts` / `listOutcomeContacts` | Files contact |
| `listParcPharmacie` / `listParcPrestataire` | Parc |
| `listPrestataires` / `searchPatients` | Sélections création |
| `loadParams` / `loadRules` / `listTemplates` | Admin / moteur contact |
| `listChampsCreation` | Formulaire création dynamique |

## 12. Gap logs / tasks (propositions)

_Propositions uniquement._

### Logs

- [ ] Vérifier que chaque mutation hors `audit()` (ex. `updatePatient`, `updateProlongation`, `deleteProlongation`, CRUD templates/champs/prestataires) mérite un `audit` ou un `logEvent` dédié.
- [ ] `locationRules.upsertRule` / `deleteRule` sans log.
- [ ] Helpers d’accès (`resolveRole*`) : ne pas logger.

### Tâches

Créations : `syncLocationContactTasks` (`location_a_rappeler`, `location_attente_suite`) via `upsertContact` / file. Vérifier `taskActions.js` → `location_contact` / `location_suivi`.
