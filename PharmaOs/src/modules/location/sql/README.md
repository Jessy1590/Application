# SQL — module Location



Schéma `PharmaOs`. Port des tables `phieevreux.location_*` (sous-app PhieEvreux).



## À appliquer sur Supabase



1. Exécuter `tables.sql` (DDL + seeds seuils)

2. Exécuter `rls.sql` (RLS + policies `authenticated`)

3. Exécuter `import_from_phieevreux.sql` pour copier les données location existantes



Ou via MCP / SQL Editor : migration `location_pharmaos_tables` puis `location_pharmaos_rls`, puis import.



## Import données (2026-09-19)



- Source : schéma `phieevreux` (inchangé)

- Cible : `"PharmaOs".location_*` — IDs UUID préservés, `ON CONFLICT (id) DO NOTHING`

- Paramètres : seeds PharmaOs remplacés par les 8 clés phieevreux

- Volumes après import : patients 17, dossiers 13, appareils 13, prolongations 38, contacts 26, champs_creation 20, templates 4, règles 3, prestataires 1, paramètres 8, suivi_lignes 0

- Gap colonnes : aucun (schémas alignés)



## Tables



| Table | Rôle |

|-------|------|

| `location_patients` | Patients location |

| `location_dossiers` | Dossiers (actif / en_attente / cloture / annule) |

| `location_appareils` | Appareils liés au dossier |

| `location_prolongations` | Chaîne ordo / date_fin |

| `location_contacts` | File Contact (commentaire → appel) |

| `location_suivi_lignes` | Lignes suivi manuelles (legacy UI) |

| `location_prestataires` | Prestataires |

| `location_parametres` | JSON clé/valeur (seuils, creation_champs, …) — accès via Accès & rôles PharmaOS, pas de sous-matrice |

| `location_regles` | Moteur de règles Contact / alertes |

| `location_templates_contact` | Templates LGO Contact |

| `location_champs_creation` | Champs spécifiques par type d’appareil |



## Enums métier



- `location_dossiers.statut` : `actif` \| `en_attente` \| `cloture` \| `annule`

- `location_appareils.type_appareil` : `aerosol` \| `tire_lait` \| `pese_bebe` \| `tens` \| `fauteuil` \| `autre`

- `location_appareils.source` : `parc` \| `prestataire`

- `location_contacts.phase` : `commentaire` \| `appel`

- `location_contacts.statut` : `a_contacter` \| `en_cours` \| `contacte` \| `reporte` \| `annule` \| `resolu`



## Note legacy



L’ancien module `rental` (`rental_assets` / `rental_contracts` / `rental_events`) a été retiré (code + tables, migration `041`).


