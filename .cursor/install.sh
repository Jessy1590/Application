#!/usr/bin/env bash
# Idempotent repository bootstrap for the Cloud Agent environment.
# Prepares the two Vite/React apps (PharmaOS App + Dashboard) and the
# Python dependencies used by the Avions desktop game.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

# tkinter is a Python stdlib module but ships as a separate OS package on Debian/Ubuntu.
# Avions/main.py imports it, so make sure it is available.
if ! python3 -c "import tkinter" >/dev/null 2>&1; then
  sudo apt-get update -qq
  sudo apt-get install -y -qq python3-tk
fi

# Python packages required by Avions/main.py (requests ships in the base image).
python3 -m pip install --quiet --disable-pip-version-check pillow requests

# Node dependencies for the two Vite/React front-ends.
( cd PharmaOs/App && npm ci )
( cd PharmaOs/Dashboard && npm ci )

# The Dashboard's Supabase client has no in-code fallback, so without these
# variables createClient() throws at import time and the app renders a blank
# page. The App client already ships public fallback values. Seed a local .env
# for the Dashboard (only if none exists, so real credentials/secrets win) using
# the same *public* anon key + project URL already committed in protect.js and
# the App's supabaseClient.js. These are publishable client-side values, not
# secrets. Provide VITE_SUPABASE_* as environment secrets to override.
dashboard_env="PharmaOs/Dashboard/.env"
if [ ! -f "$dashboard_env" ]; then
  cat > "$dashboard_env" <<'EOF'
VITE_SUPABASE_URL=https://kpjflntnotftpzffjbud.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtwamZsbnRub3RmdHB6ZmZqYnVkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYyODg0MjMsImV4cCI6MjEwMTg2NDQyM30.mTjm86Thn6VUOAAJRWCsGMcR0Ip-qEP08fJdwUvKKEo
EOF
  echo "install.sh: wrote default $dashboard_env (public anon key)."
fi

echo "install.sh: dependencies ready."
