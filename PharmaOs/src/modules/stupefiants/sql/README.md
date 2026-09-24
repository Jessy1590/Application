# Module stupéfiants

Contrôle hors LGO : réception → **1er comptage armoire/LGO par le réceptionnaire** → RAS ou tâche pharmacien.

Accès UI : `canAccess('taskbar'|'dashboard', 'stupefiants')` (matrice Accès & rôles + casquettes).

## Tables

- `PharmaOs.stupefiant_releves` — relevés réception + workflow pharmacien
  - `livreur_id` → `directory_contacts` (partenaires `grossiste` | `generiqueur` | `plateforme`)
- ~~`stupefiant_livreurs`~~ — droppée (`051`) ; référentiel = annuaire

## Statuts

`en_attente` | `a_verifier` | `recompter` | `ras` | `ras_recompte` | `analyse` | `corrige_compris` | `corrige_sans` | `erreur_reception`

`bl_numero` : nullable (039).

## Tâches

- `stupefiant_verification` — écart après comptage réceptionnaire → dashboard onglet Vérifier

## Storage

Bucket `stupefiants-bl` (PDF / images BL).

## Migrations

`037_stupefiants.sql`, `038_stupefiants_erreur_reception.sql`, `039_stupefiants_en_attente.sql`, `051_stupefiants_livreur_directory.sql`
