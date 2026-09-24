# Module directory

## 1. Identité

| Champ | Valeur |
|-------|--------|
| id | `directory` |
| label | Annuaire |
| dossier | `src/modules/directory/` |

## 2. Taskbar

| Élément | Valeur |
|---------|--------|
| Feature id | `directory` |
| Vue | `#directory` → `Directory.jsx` |
| Composant | `comptoir/Directory.jsx` |

## 3. Dashboard

| Élément | Valeur |
|---------|--------|
| Page id | `directory` |
| Composants | `DirectoryManager.jsx`, `DirectoryForm.jsx` |
| `canAccess` | `canAccess('taskbar'|'dashboard', 'directory')` |

## 4. Services

| Fichier | Rôle |
|---------|------|
| `directoryService.js` | CRUD `directory_contacts` (PS / partenaires) |

## 5. Logs

Aucun `logEvent`.

## 6. Tâches

Aucune.

## 7. SQL

| Table | Colonnes clés | RLS |
|-------|---------------|-----|
| `directory_contacts` | `type` health_professional / commercial_partner ; `partenaire_type` / `partenaire_type_autre` (partenaires) ; identité, téléphones, mails, franco, switch_rupture… | ALL authenticated |

Migration `049_directory_partenaire_type.sql` : colonnes + CHECK + backfill seed labo/grossiste.
Migration `051_stupefiants_livreur_directory.sql` : stupéfiants utilisent ces partenaires (`grossiste` / `generiqueur` / `plateforme`) comme livreurs.

---

## 8. Fonctions exportées (services)

_Inventaire issu du code (2026-09-23). Colonnes Log / Tâches = état actuel, pas la cible._

### `services/directoryService.js`

| Fonction | Rôle (résumé) | Args principaux | Tables / RPC | Tâches ? | Log ? |
|----------|---------------|-----------------|--------------|----------|-------|
| `fetchContacts` | Lecture / recherche — tables: directory_contacts | `—` | directory_contacts | non | non |
| `fetchContactsSafe` | Lecture / recherche — tables: directory_contacts | `—` | directory_contacts | non | non |
| `fetchHealthProfessionals` | Lecture / recherche — tables: directory_contacts | `—` | directory_contacts | non | non |
| `fetchContactById` | Lecture / recherche — tables: directory_contacts | `id` | directory_contacts | non | non |
| `labelPartenaireType` | Libellé UI type partenaire | `partenaireType, partenaireTypeAutre?` | — | non | non |
| `sanitizeContactPayload` | Normalise payload (nulls / champs conditionnels) | `contactData` | — | non | non |
| `insertContact` | Création / enregistrement — tables: directory_contacts | `contactData` | directory_contacts | non | non |
| `updateContact` | Mise à jour / action métier — tables: directory_contacts | `id, contactData` | directory_contacts | non | non |
| `updateContactSwitchRupture` | Mise à jour / action métier — tables: directory_contacts | `id, switch_rupture` | directory_contacts | non | non |
| `deleteContact` | Mise à jour / action métier — tables: directory_contacts | `id` | directory_contacts | non | non |

## 9. Handlers / actions UI

### `comptoir/Directory.jsx`

| Action / label (repère) | Handler | Appels service (détectés près du handler) | Feedback |
|-------------------------|---------|-------------------------------------------|----------|
| — | `handleCall` | `openModuleWindow`, `setExpandedId` | — |

### `dashboard/DirectoryForm.jsx`

| Action / label (repère) | Handler | Appels service (détectés près du handler) | Feedback |
|-------------------------|---------|-------------------------------------------|----------|
| — | `handleChange` | `setFormData`, `updateContact`, `insertContact`, `setTimeout` | succès / feedback |
| — | `handleSubmit` | `updateContact`, `insertContact`, `setTimeout` | succès / feedback |

### `dashboard/DirectoryManager.jsx`

| Action / label (repère) | Handler | Appels service (détectés près du handler) | Feedback |
|-------------------------|---------|-------------------------------------------|----------|
| — | `handleEditClick` | `setEditingContact`, `setShowForm`, `deleteContact`, `setExpandedId` | erreur UI |
| — | `handleDeleteClick` | `deleteContact`, `setExpandedId` | erreur UI |

## 10. Formulaires & données

### DirectoryForm (`dashboard/DirectoryForm.jsx`)

Champs (name HTML) : `type`, `partenaire_type`, `partenaire_type_autre`, `nom`, `prenom`, `specialite`, `telephone`, `mail_mssante`, `telephone_prive`, `mail_prive`, `infos_contact`, `switch_rupture`, `commentaires`, `site_web`, `tel_service_client`, `email_service_client`, `mode_commande`, `franco`, `remise_commande`.

Types contact : `health_professional` | `commercial_partner` → table `directory_contacts`.

Type partenaire (uniquement si `commercial_partner`) :
| Valeur | Label UI |
|--------|----------|
| `laboratoire` | Laboratoire |
| `grossiste` | Grossiste |
| `plateforme` | Plateforme |
| `generiqueur` | Génériqueur |
| `autre` | Autres (+ champ libre `partenaire_type_autre` obligatoire) |

Où saisir : **Dashboard → Annuaire → Nouveau contact / Modifier** (`DirectoryForm`), section « Identité partenaire ». Le comptoir (`Directory.jsx`) est en lecture seule (affichage + filtres par type partenaire).

**Save** : `insertContact` / `updateContact` (via `sanitizeContactPayload`) ; switch rupture : `updateContactSwitchRupture`.
**Load** : `fetchContactById` / `fetchContacts`.


## 11. Données affichées

| Source (fonction / requête) | Colonnes / usage UI |
|-----------------------------|---------------------|
| `directoryService.js::fetchContacts` | tables/RPC : directory_contacts (dont `partenaire_type`) |
| `directoryService.js::fetchContactsSafe` | tables/RPC : directory_contacts |
| `directoryService.js::fetchHealthProfessionals` | tables/RPC : directory_contacts |
| `directoryService.js::fetchContactById` | tables/RPC : directory_contacts |

## 12. Gap logs / tasks (propositions)

_Propositions uniquement — ne pas implémenter depuis cette checklist sans validation produit._

### Logs probablement manquants

- [ ] `directoryService.js::insertContact` — mutation sans `logEvent` (tables: directory_contacts)
- [ ] `directoryService.js::updateContact` — mutation sans `logEvent` (tables: directory_contacts)
- [ ] `directoryService.js::updateContactSwitchRupture` — mutation sans `logEvent` (tables: directory_contacts)
- [ ] `directoryService.js::deleteContact` — mutation sans `logEvent` (tables: directory_contacts)

### Tâches — manques / câblage à vérifier

- [ ] Module sans création de tâche détectée — confirmer si des événements métier devraient en produire.

