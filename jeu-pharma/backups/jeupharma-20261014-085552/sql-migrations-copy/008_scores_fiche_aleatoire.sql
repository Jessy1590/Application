-- Jeu Pharma — 008 : scores manuels du module joueur « fiche aléatoire »
-- Projet remote : kpjflntnotftpzffjbud
--
-- Une ligne = une note saisie et validée (pas de 0 automatique).
-- score_max est toujours 10. Exclusion côté client : 3 notes > 8 pour le même utilisateur.
-- Ne pas réappliquer sans vérifier l’état remote.

CREATE TABLE IF NOT EXISTS jeupharma.scores_fiche_aleatoire (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  utilisateur_id uuid NOT NULL REFERENCES portail.profiles(id) ON DELETE CASCADE,
  matrice_id uuid NOT NULL REFERENCES jeupharma.matrice_medicaments(id) ON DELETE CASCADE,
  score_obtenu numeric NOT NULL,
  score_max numeric NOT NULL DEFAULT 10,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT scores_fiche_aleatoire_borne CHECK (
    score_max = 10
    AND score_obtenu >= 0
    AND score_obtenu <= score_max
    AND score_obtenu = trunc(score_obtenu)
  )
);

COMMENT ON TABLE jeupharma.scores_fiche_aleatoire IS
  'Notes manuelles /10 du module fiche aléatoire. Insert après validation uniquement.';

CREATE INDEX IF NOT EXISTS scores_fiche_aleatoire_user_matrice_idx
  ON jeupharma.scores_fiche_aleatoire (utilisateur_id, matrice_id);

ALTER TABLE jeupharma.scores_fiche_aleatoire ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT ON jeupharma.scores_fiche_aleatoire TO authenticated;
GRANT ALL ON jeupharma.scores_fiche_aleatoire TO service_role;

DROP POLICY IF EXISTS scores_fiche_aleatoire_select ON jeupharma.scores_fiche_aleatoire;
CREATE POLICY scores_fiche_aleatoire_select ON jeupharma.scores_fiche_aleatoire
  FOR SELECT TO authenticated
  USING (utilisateur_id = auth.uid() OR jeupharma.is_portail_admin());

DROP POLICY IF EXISTS scores_fiche_aleatoire_insert ON jeupharma.scores_fiche_aleatoire;
CREATE POLICY scores_fiche_aleatoire_insert ON jeupharma.scores_fiche_aleatoire
  FOR INSERT TO authenticated
  WITH CHECK (utilisateur_id = auth.uid() AND jeupharma.has_jeupharma_access());
