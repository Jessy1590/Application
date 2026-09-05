# SQL — module directory

## Table
- `PharmaOs.directory_contacts`
  - `type` : `health_professional` | `commercial_partner`
  - Identité : `nom`, `prenom`, `specialite`, `infos_contact`
  - Coordonnées : `telephone`, `telephone_prive`, `mail_mssante`, `mail_prive`, `site_web`
  - Métier : `switch_rupture`, `commentaires`
  - Partenaire : `mode_commande`, `franco`, `remise_commande`, `nom_service_client`, `tel_service_client`, `email_service_client`

## RLS
- Accès `ALL` pour `authenticated` (données d’équipe partagées)
