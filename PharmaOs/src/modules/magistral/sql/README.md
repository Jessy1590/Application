# SQL — module Magistrales (`magistral`)

Schéma `PharmaOs`. Donneur d’ordre sous-traitant à un prestataire unique (settings).

## Tables

| Table | Rôle |
|-------|------|
| `magistral_settings` | Pharmacie DO, prestataire ST (ARS/contrat), tarif, templates mail |
| `magistral_orders` | Dossiers : analyse → devis → commande → réception/appel → dispensation |

### Statuts (`magistral_orders.statut`)

`brouillon` · `analyse_ok` · `devis` · `commande` · `en_transit` · `a_controler` · `receptionne` · `a_rappeler` · `non_conforme` · `refuse` · `dispense` · `cloture`

DEFAULT : `devis`.

**File dispensation :** `receptionne` = dossier prêt à dispenser (UI « À dispenser »). Atteint après appel patient abouti (`recordPatientCall` statut `termine`, ex. disponible / vient chercher). `a_rappeler` reste dans le module Rappel.

### Colonnes clés

**settings** : `provider_*` / `contract_*` / `provider_forms` / `provider_delai_jours` / `frais_port` / `coefficient` / `tva_rate` / `creation_champs` (actif/obligatoire) / `docs_retention_days`  
Identité pharmacie : `PharmaOs.app_settings` clé `pharmacy` (Paramètres → Général), fusionnée à la lecture (colonnes `pharmacy_*` legacy en fallback).  
Templates mail : `PharmaOs.app_settings` clé `mail_templates` (Paramètres → Templates mail), avec fallback legacy `magistral_settings.mail_templates`.


**orders** : `formule`, `forme`, `quantite`, `patient_initiales`, `patient_phone`, `patient_email`, `patient_call` (journal appel), `form_data`, `ordonnance_path`, traçabilité ST (`provider_ref`, `provider_lot`, dates, `liberation_*`), réception (`reception_checklist`, prix), dispensation (`ordonnancier_number`, `dispensed_*`), `status_history`

## Storage

Bucket privé `magistral-ordonnances` (PDF / images) — policies staff via `is_pharma_staff()`.

## Edge Function

`send-transactional-email` — rôles canoniques + legacy.

## Migration

`027_magistral_refonte.sql`
