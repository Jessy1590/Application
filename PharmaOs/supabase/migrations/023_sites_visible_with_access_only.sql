-- Visibilité portail : carte affichée uniquement si accès validé
ALTER TABLE portail.sites
  ADD COLUMN IF NOT EXISTS visible_with_access_only boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN portail.sites.visible_with_access_only IS
  'Si true, la carte n''apparaît dans Mes accès que pour les utilisateurs ayant site_access (les admins voient toujours tout).';
