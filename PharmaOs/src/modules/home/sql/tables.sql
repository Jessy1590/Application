-- =============================================================================
-- Tables — module home (télémétrie taskbar uniquement)
-- advice_events supprimée (jamais branchée UI)
-- =============================================================================
-- --- PharmaOs.taskbar_logs ---
CREATE TABLE IF NOT EXISTS "PharmaOs".taskbar_logs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  action text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  CHECK ((action = ANY (ARRAY['collapse'::text, 'expand'::text, 'login'::text]))),
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  PRIMARY KEY ("id")
);
