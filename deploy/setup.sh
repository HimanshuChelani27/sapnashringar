#!/bin/sh
# One-time setup of a fresh Ubuntu 22.04/24.04 server. Run as root: sh /opt/sapna/deploy/setup.sh
set -eu
APP=$(cd "$(dirname "$0")/.." && pwd)

apt-get update
apt-get install -y python3-venv sqlite3 ufw curl gnupg debian-keyring debian-archive-keyring apt-transport-https

# Caddy (official repo) and Node 20 (to build the frontend)
if ! command -v caddy >/dev/null; then
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update && apt-get install -y caddy
fi
if ! command -v node >/dev/null || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt-get install -y nodejs
fi

id garba >/dev/null 2>&1 || useradd -r -s /usr/sbin/nologin garba
mkdir -p /var/lib/sapna && chown garba /var/lib/sapna

if [ ! -f /etc/sapna.env ]; then
  PW=$(openssl rand -base64 12 | tr -d '/+=')
  printf 'GARBA_ADMIN_PASSWORD=%s\nGARBA_SECRET=%s\n' "$PW" "$(openssl rand -hex 32)" > /etc/sapna.env
  chmod 600 /etc/sapna.env
  echo "==> Admin password: $PW   (stored in /etc/sapna.env)"
fi

cp "$APP/deploy/garba.service" /etc/systemd/system/garba.service
systemctl daemon-reload
systemctl enable garba
sh "$APP/deploy/update.sh"

cp "$APP/deploy/Caddyfile" /etc/caddy/Caddyfile
systemctl reload caddy

chmod +x "$APP/deploy/backup.sh"
(crontab -l 2>/dev/null | grep -v backup.sh || true; echo "30 2 * * * $APP/deploy/backup.sh") | crontab -

ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw --force enable
echo "==> Done. Site: https://sapnashringar.com/garba/home"
