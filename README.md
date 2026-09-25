# Sapna Garba

Navratri dress rental site. Customers pages are at `/garba/home`; admin pages are at `/garba/admin`.

- `backend/`: FastAPI with SQLite, all in `app.py`. Data (the database, photos and payment screenshots) is stored in `GARBA_DATA`.
- `frontend/`: React and Vite. Customer pages are in `shop.jsx`, admin pages in `admin.jsx`, and the English/Hindi text is in `i18n.js`.

## Run locally

```sh
# backend
cd backend
python -m venv .venv
.venv/Scripts/pip install -r requirements.txt      # Linux/Mac: .venv/bin/pip
.venv/Scripts/python -m uvicorn app:app --reload --port 8000

# frontend (second terminal)
cd frontend
npm install
npm run dev          # open http://localhost:5173/garba/home
```

- The admin login is at `/garba/admin/login`. The password comes from `GARBA_ADMIN_PASSWORD`, which defaults to `admin` for local use only.
- On first use, go to **Admin → Settings** and fill in the UPI ID, the QR image, the WhatsApp number, the Navratri first night, and the rules.
- Tests: `.venv/Scripts/pip install pytest httpx && .venv/Scripts/python -m pytest`

## Deploy (Ubuntu VPS, about ₹400–500 a month)

1. Point your domain's A record to the server IP.
2. Install the packages and copy the code:
   ```sh
   sudo apt install -y python3-venv sqlite3 caddy nodejs npm
   sudo useradd -r -m garba && sudo mkdir -p /opt/sapna /var/lib/sapna && sudo chown garba /var/lib/sapna
   # copy this folder to /opt/sapna (git clone or scp)
   cd /opt/sapna/frontend && npm ci && npm run build
   cd /opt/sapna/backend && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
   ```
3. Create the secrets file. **Do not skip this**: the default password is `admin`.
   ```sh
   printf 'GARBA_ADMIN_PASSWORD=%s\nGARBA_SECRET=%s\n' 'your-strong-password' "$(openssl rand -hex 32)" | sudo tee /etc/sapna.env
   sudo chmod 600 /etc/sapna.env
   ```
4. Start the services:
   ```sh
   sudo cp /opt/sapna/deploy/garba.service /etc/systemd/system/ && sudo systemctl enable --now garba
   sudo cp /opt/sapna/deploy/Caddyfile /etc/caddy/Caddyfile   # edit the domain first
   sudo systemctl reload caddy
   ```
5. Set up backups: `sudo crontab -e` and add `30 2 * * * /opt/sapna/deploy/backup.sh`. Then set up rclone to copy the backups off the server.

To update the site later: pull the code, run `npm run build` in `frontend/`, then `sudo systemctl restart garba`.
