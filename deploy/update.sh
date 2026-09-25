#!/bin/sh
# Build and restart after new code lands in /opt/sapna. Data in /var/lib/sapna is never touched.
set -eu
APP=$(cd "$(dirname "$0")/.." && pwd)
cd "$APP/frontend" && npm ci --no-audit --no-fund && npm run build
cd "$APP/backend"
[ -d .venv ] || python3 -m venv .venv
.venv/bin/pip install -q -r requirements.txt
systemctl restart garba
echo "==> Updated"
