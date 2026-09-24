# SQL — module directory

## Table
- `PharmaOs.directory_contacts`
  - `type` : `health_professional` | `commercial_partner`
  - Identité : `nom`, `prenom`, `specialite`, `infos_contact`
  - Coordonnées : `telephone`, `telephone_prive`, `mail_mssante`, `mail_prive`, `site_web`
  - Métier : `switch_rupture`, `commentaires`
  - Partenaire : `partenaire_type`, `partenaire_type_autre`, `mode_commande`, `franco`, `remise_commande`, `nom_service_client`, `tel_service_client`, `email_service_client`
  - `partenaire_type` : `laboratoire` | `grossiste` | `plateforme` | `generiqueur` | `autre` (uniquement si `type = commercial_partner`)
  - `partenaire_type_autre` : libellé libre si `partenaire_type = autre`

## Migrations
- `004` — création table + RLS
- `049` — colonnes `partenaire_type` / `partenaire_type_autre` + backfill seed labo/grossiste
- `051` — stupéfiants : `livreur_id` → `directory_contacts` (types grossiste / génériqueur / plateforme)

## RLS
- Accès `ALL` pour `authenticated` (données d’équipe partagées) — inchangé (colonnes couvertes)
