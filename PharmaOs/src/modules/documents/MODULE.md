# Module documents

## 1. Identité

| Champ | Valeur |
|-------|--------|
| id | `documents` |
| label | Documents / GED |
| dossier | `src/modules/documents/` |

## 2. Taskbar

| Élément | Valeur |
|---------|--------|
| Feature id | `documents` |
| Vue | `#documents` → `Documents.jsx` |
| Composant | `comptoir/Documents.jsx` |

## 3. Dashboard

| Élément | Valeur |
|---------|--------|
| Page id | `documents` (nav label GED) |
| Composant | `dashboard/DocumentManager.jsx` |
| `canAccess` | `canAccess(..., 'documents')` |

## 4. Services

| Fichier | Rôle |
|---------|------|
| `documentService.js` | Documents actifs, signatures, CRUD admin |

## 5. Logs

Aucun `logEvent`.

## 6. Tâches

Aucune.

## 7. SQL

| Table | Colonnes clés | RLS |
|-------|---------------|-----|
| `documents` | `title`, `content`, `version`, `category` (procedure/instruction/formulaire), `requires_signature`, `is_active` | lecture équipe actifs ; admin CRUD |
| `document_signatures` | `user_id`, `document_id`, `document_version`, `signed_at` | INSERT own |

---

## 8. Fonctions exportées (services)

_Inventaire issu du code (2026-09-23). Colonnes Log / Tâches = état actuel, pas la cible._

### `services/documentService.js`

| Fonction | Rôle (résumé) | Args principaux | Tables / RPC | Tâches ? | Log ? |
|----------|---------------|-----------------|--------------|----------|-------|
| `fetchActiveDocuments` | Lecture / recherche — tables: documents | `—` | documents | non | non |
| `fetchMySignatures` | Lecture / recherche — tables: document_signatures | `userId` | document_signatures | non | non |
| `signDocument` | Fichier / signature — tables: document_signatures | `userId, documentId, documentVersion` | document_signatures | non | non |
| `fetchDocuments` | Lecture / recherche — tables: documents | `—` | documents | non | non |
| `createDocument` | Création / enregistrement — tables: documents | `doc, userId` | documents | non | non |
| `updateDocument` | Mise à jour / action métier — tables: documents | `id, updates` | documents | non | non |
| `fetchDocumentSignatures` | Lecture / recherche — tables: document_signatures, profiles | `documentId` | document_signatures, profiles | non | non |

## 9. Handlers / actions UI

### `comptoir/Documents.jsx`

| Action / label (repère) | Handler | Appels service (détectés près du handler) | Feedback |
|-------------------------|---------|-------------------------------------------|----------|
| — | `handleSign` | `setSuccessMsg`, `signDocument`, `setTimeout` | succès / feedback |

### `dashboard/DocumentManager.jsx`

| Action / label (repère) | Handler | Appels service (détectés près du handler) | Feedback |
|-------------------------|---------|-------------------------------------------|----------|
| — | `handleSubmit` | `updateDocument`, `createDocument`, `setShowForm`, `setViewSigs`, `fetchDocumentSignatures` | — |

Libellés boutons repérés dans le JSX : « Annuler ».

## 10. Formulaires & données

### Comptoir

Pas de formulaire de création : liste procédures actives + signature.

| Action | Service | Feedback |
|--------|---------|----------|
| Sélection doc | local `setSelected` | affiche contenu |
| Signer | `signDocument(userId, documentId, version)` | « Lu et approuvé » |

### Dashboard

CRUD docs : `createDocument` / `updateDocument` (titre, category, content, version, actif) — lire `DocumentManager.jsx`.


## 11. Données affichées

| Source (fonction / requête) | Colonnes / usage UI |
|-----------------------------|---------------------|
| `documentService.js::fetchActiveDocuments` | tables/RPC : documents |
| `documentService.js::fetchMySignatures` | tables/RPC : document_signatures |
| `documentService.js::fetchDocuments` | tables/RPC : documents |
| `documentService.js::fetchDocumentSignatures` | tables/RPC : document_signatures, profiles |

## 12. Gap logs / tasks (propositions)

_Propositions uniquement — ne pas implémenter depuis cette checklist sans validation produit._

### Logs probablement manquants

- [ ] `documentService.js::signDocument` — mutation sans `logEvent` (tables: document_signatures)
- [ ] `documentService.js::createDocument` — mutation sans `logEvent` (tables: documents)
- [ ] `documentService.js::updateDocument` — mutation sans `logEvent` (tables: documents)

### Tâches — manques / câblage à vérifier

- [ ] Module sans création de tâche détectée — confirmer si des événements métier devraient en produire.

