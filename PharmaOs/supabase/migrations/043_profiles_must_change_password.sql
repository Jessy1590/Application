-- 043 — flag mot de passe temporaire sur portail.profiles
-- Utilisé après createUser / invite (Edge Function invite-user).

ALTER TABLE portail.profiles
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN portail.profiles.must_change_password IS
  'True tant que l’utilisateur n’a pas remplacé son mot de passe temporaire / invitation.';
