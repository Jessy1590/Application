# SQL — module ip (Act-IP)

## Table
- `PharmaOs.act_ip_logs`
  - Patient : `patient_initiales`, `patient_age`, `patient_sexe`
  - Prescripteur : `medecin_id` (FK directory), `medecin_nom`
  - SFPC : `medicament_en_cause`, `probleme_identifie`, `type_intervention`, `avis_prescripteur`, `devenir_intervention`, `mode_transmission`
  - `statut_ip` : `Cloturee` | `En attente` | `Déclaré` | `Annulee`
  - `commentaires`, `user_id`, `created_at`

## RLS
- Isolation user sur INSERT/SELECT ; admin SELECT/UPDATE Dashboard
