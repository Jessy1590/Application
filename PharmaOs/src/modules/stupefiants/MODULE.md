# Module stupefiants

## 1. Identité

| Champ | Valeur |
|-------|--------|
| id | `stupefiants` |
| label | Stupéfiants |
| dossier | `src/modules/stupefiants/` |

## 2. Taskbar

| Élément | Valeur |
|---------|--------|
| Feature id | `stupefiants` |
| Vue | `#stupefiants` → `StupefiantReception.jsx` |
| Composants | + `shared/StupefiantReceptionForm.jsx` |

## 3. Dashboard

| Élément | Valeur |
|---------|--------|
| Page id | `stupefiants` |
| Composants | `StupefiantsManager`, `StupefiantsCharts` |
| `canAccess` | `canAccess(..., 'stupefiants')` |

Livreurs : gérés dans l’**annuaire** (partenaires `grossiste` / `generiqueur` / `plateforme`) — plus de panneau paramètres dédié.
Bouton dashboard « Annuaire (livreurs) » → page `directory`. Select réception : hint + CTA ouvrir annuaire si liste vide.

## 4. Services

| Fichier | Rôle |
|---------|------|
| `stupefiantService.js` | Réception, relevés, livreurs (annuaire), BL storage, tâches vérification |

## 5. Logs

Aucun `logEvent`.

## 6. Tâches

| Source | Types |
|--------|-------|
| Catalogue (`stupefiants`) | `stupefiant_verification`, `stupefiant_recompte` (legacy) |
| Créés | écart comptage → `stupefiant_verification` |
| `taskRoutes.js` | les deux → **dashboard** `stupefiants` tab `verifier` |

## 7. SQL

| Table | Notes | Migrations |
|-------|-------|------------|
| `stupefiant_releves` | relevés + `livreur_id` → `directory_contacts` | `037`–`039`, `051` |
| ~~`stupefiant_livreurs`~~ | droppée | `051` |
| Storage | bucket `stupefiants-bl` | |

---

## 8. Fonctions exportées (services)

_Inventaire issu du code (2026-09-23). Colonnes Log / Tâches = état actuel, pas la cible._

### `services/stupefiantService.js`

| Fonction | Rôle (résumé) | Args principaux | Tables / RPC | Tâches ? | Log ? |
|----------|---------------|-----------------|--------------|----------|-------|
| `fetchLivreurs` | Lecture partenaires livreurs (annuaire) | `{ includeId? }` | directory_contacts | non | non |
| `formatLivreurLabel` | Libellé UI livreur depuis join | `releve` | — | non | non |
| `uploadBlFile` | Fichier / signature — tables: stupefiants-bl | `releveId, file` | stupefiants-bl | non | non |
| `getBlSignedUrl` | Lecture / recherche — tables: stupefiants-bl | `blPath, expiresIn = 3600` | stupefiants-bl | non | non |
| `fetchReleves` | Lecture / recherche — tables: stupefiant_releves | `{ status } = {}` | stupefiant_releves | non | non |
| `fetchMyReleves` | Lecture / recherche — tables: stupefiant_releves | `userId` | stupefiant_releves | non | non |
| `fetchReleveById` | Lecture / recherche — tables: stupefiant_releves | `id` | stupefiant_releves | non | non |
| `declareReception` | Création / enregistrement — tables: stupefiant_releves | `userId, payload, blFile, opts = {}` | stupefiant_releves | non | non |
| `finalizeHeldReception` | Mise à jour / action métier — tables: stupefiant_releves | `id, payload, userId, blFile = null` | stupefiant_releves | non | non |
| `updateReleve` | Mise à jour / action métier — tables: stupefiant_releves | `id, patch` | stupefiant_releves | non | non |
| `submitVerification` | Création / enregistrement — tables: stupefiant_releves | `id, payload, adminUserId` | stupefiant_releves | non | non |
| `submitRecount` | Création / enregistrement — tables: stupefiant_releves | `id, payload, adminUserId` | stupefiant_releves | non | non |
| `closeErreurReception` | Mise à jour / action métier — tables: stupefiant_releves | `id, notes, adminUserId` | stupefiant_releves | non | non |
| `submitAnalyse` | Création / enregistrement — tables: stupefiant_releves | `id, payload, adminUserId` | stupefiant_releves | non | non |
| `deleteReleve` | Mise à jour / action métier — tables: stupefiant_releves, stupefiants-bl | `id` | stupefiant_releves, stupefiants-bl | non | non |
| `fetchStupefiantOpsStats` | Lecture / recherche — tables: stupefiant_releves, profiles | `days = 90` | stupefiant_releves, profiles | non | non |
| `fetchStaffProfiles` | Lecture / recherche — tables: profiles | `—` | profiles | non | non |

Autres exports (constantes) : `STUPEFIANT_STATUS_LABELS`, `LIVREUR_PARTENAIRE_TYPES`, `LIVREUR_TYPE_LABELS`, `CLOSED_STATUSES`.

## 9. Handlers / actions UI

### `comptoir/StupefiantReception.jsx`

| Action / label (repère) | Handler | Appels service (détectés près du handler) | Feedback |
|-------------------------|---------|-------------------------------------------|----------|
| — | `handleSubmit` | `setErrorMsg`, `setSuccessMsg`, `finalizeHeldReception`, `declareReception` | erreur UI, succès / feedback |

### `dashboard/StupefiantsManager.jsx`

| Action / label (repère) | Handler | Appels service | Feedback |
|-------------------------|---------|----------------|----------|
| Clic ligne « Tous les relevés » | `setSelectedId` uniquement (reste sur `liste`) | — | panneau détail dossier |
| Modifier (liste) | `saveListeEdit` | `updateReleve` | msg / err |
| Ouvrir dans Vérifier → | `setMainTab('verifier')` | — | bascule onglet vérif (volontaire) |
| Vérifier (recompte / analyse) | `submitRecount` / `submitAnalyse` / `closeErreurReception` | idem | workflow pharmacien |
| Supprimer (clôturés) | `deleteReleve` | idem | confirm |

## 10. Formulaires & données

### StupefiantReceptionForm (`shared/StupefiantReceptionForm.jsx`)

| Champ | Label UI | Type | Requis | Notes |
|-------|----------|------|--------|-------|
| produit_hors_bdm | Produit hors BDPM | checkbox | non | bascule saisie libre |
| medicament / cip | Médicament / CIP | text | oui | MedicamentFields sauf hors BDPM |
| nb_boites_recues | Boîtes reçues | number | oui | — |
| livreur_id | Livreur | select | oui | `fetchLivreurs` → annuaire |
| du_promis / patient_promis / unites_promises | Dû / promis patient | checkbox + texts | conditionnel | ordonnance partielle |
| armoire_boites / armoire_unites | Armoire boîtes/unités | number | oui si comptage | 1er comptage réceptionnaire |
| lgo_boites / lgo_unites | LGO boîtes/unités | number | oui si comptage | — |
| numero_bl | N° bon de livraison | text | oui | — |
| fichier BL | Fichier BL | file | oui (comptoir) | upload storage |

**Save** : `declareReception` / `finalizeHeldReception` ; écart → tâches `stupefiant_verification`.
**Edit liste dashboard** : `updateReleve` (panneau détail « Tous les relevés », sans bascule onglet).
**Vérif dashboard** : `submitRecount`, `submitAnalyse`, `closeErreurReception`, etc.

## 11. Données affichées

| Source (fonction / requête) | Colonnes / usage UI |
|-----------------------------|---------------------|
| `stupefiantService.js::fetchLivreurs` | directory_contacts (`type=commercial_partner`, `partenaire_type` ∈ grossiste/generiqueur/plateforme) |
| `stupefiantService.js::getBlSignedUrl` | tables/RPC : stupefiants-bl |
| `stupefiantService.js::fetchReleves` | stupefiant_releves + join directory_contacts |
| `stupefiantService.js::fetchMyReleves` | stupefiant_releves + join directory_contacts |
| `stupefiantService.js::fetchReleveById` | stupefiant_releves + join directory_contacts |
| `stupefiantService.js::fetchStupefiantOpsStats` | tables/RPC : stupefiant_releves, profiles |
| `stupefiantService.js::fetchStaffProfiles` | tables/RPC : profiles |

## 12. Gap logs / tasks (propositions)

_Propositions uniquement — ne pas implémenter depuis cette checklist sans validation produit._

### Logs probablement manquants

- [ ] `stupefiantService.js::uploadBlFile` — mutation sans `logEvent` (tables: stupefiants-bl)
- [ ] `stupefiantService.js::declareReception` — mutation sans `logEvent` (tables: stupefiant_releves)
- [ ] `stupefiantService.js::finalizeHeldReception` — mutation sans `logEvent` (tables: stupefiant_releves)
- [ ] `stupefiantService.js::updateReleve` — mutation sans `logEvent` (tables: stupefiant_releves)
- [ ] `stupefiantService.js::submitVerification` — mutation sans `logEvent` (tables: stupefiant_releves)
- [ ] `stupefiantService.js::submitRecount` — mutation sans `logEvent` (tables: stupefiant_releves)
- [ ] `stupefiantService.js::closeErreurReception` — mutation sans `logEvent` (tables: stupefiant_releves)
- [ ] `stupefiantService.js::submitAnalyse` — mutation sans `logEvent` (tables: stupefiant_releves)
- [ ] `stupefiantService.js::deleteReleve` — mutation sans `logEvent` (tables: stupefiant_releves, stupefiants-bl)

### Tâches — manques / câblage à vérifier

- [ ] Module sans création de tâche détectée — confirmer si des événements métier devraient en produire.
