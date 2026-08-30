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

echo "install.sh: dependencies ready."
