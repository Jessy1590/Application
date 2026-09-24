-- Types d'appareil dynamiques (catalogue location_parametres.types_appareil)
-- Remplace les CHECK whitelist (aerosol, tire_lait, …) par texte non vide
-- Appliqué via Supabase — migration location_type_appareil_check_dynamique

ALTER TABLE phieevreux.location_champs_creation
  DROP CONSTRAINT IF EXISTS location_champs_creation_type_appareil_check;

ALTER TABLE phieevreux.location_champs_creation
  ADD CONSTRAINT location_champs_creation_type_appareil_check
  CHECK (length(trim(type_appareil)) > 0);

ALTER TABLE phieevreux.location_appareils
  DROP CONSTRAINT IF EXISTS location_appareils_type_check;

ALTER TABLE phieevreux.location_appareils
  ADD CONSTRAINT location_appareils_type_check
  CHECK (length(trim(type_appareil)) > 0);

ALTER TABLE phieevreux.location_regles
  DROP CONSTRAINT IF EXISTS location_regles_type_check;

ALTER TABLE phieevreux.location_regles
  ADD CONSTRAINT location_regles_type_check
  CHECK ((type_appareil IS NULL) OR (length(trim(type_appareil)) > 0));

ALTER TABLE phieevreux.location_templates_contact
  DROP CONSTRAINT IF EXISTS location_templates_type_check;

ALTER TABLE phieevreux.location_templates_contact
  ADD CONSTRAINT location_templates_type_check
  CHECK ((type_appareil IS NULL) OR (length(trim(type_appareil)) > 0));
