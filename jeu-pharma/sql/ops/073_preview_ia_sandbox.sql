-- Sandbox Preview IA — parcours de test (contenu volontairement imparfait).
-- Projet : kpjflntnotftpzffjbud
-- Usage : admin/preview-parcours.html?parcours=<id>&module=<lecon_sale_id>
-- Presets à tester : Nettoyer, Réorganiser, Enrichir ★.

INSERT INTO jeupharma.parcours_apprentissage (code, libelle, description, mode_contenu, actif, ordre)
VALUES (
  'preview_ia_sandbox',
  'Sandbox Preview IA',
  'Parcours de test pour Demande IA / Preview. Contenu volontairement sale. Ne pas ouvrir aux joueurs.',
  'publications',
  false,
  900
)
ON CONFLICT (code) DO UPDATE SET
  libelle = EXCLUDED.libelle,
  description = EXCLUDED.description,
  actif = false,
  updated_at = now();
