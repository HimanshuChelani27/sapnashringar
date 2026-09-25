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

## Deploy (sapnashringar.com)

Live site: https://sapnashringar.com/garba/home · admin: /garba/admin

**First time**
1. Buy an Ubuntu 24.04 VPS (1 GB RAM is enough). While creating it, add the public key from `~/.ssh/sapna_deploy.pub`.
2. In GoDaddy DNS, set two **A** records to the server IP: one for `@` and one for `www`.
3. From this folder, run `sh deploy/push.sh root@<server-ip> setup`. This installs everything, turns on HTTPS, backups and the firewall, and prints the admin password.

**Every update**
Commit your changes, then run `sh deploy/push.sh root@<server-ip>`.

- The server keeps data in `/var/lib/sapna` (database, photos, payment screenshots). Updates never touch it.
- Secrets live in `/etc/sapna.env`. To change the admin password, edit that file, then run `systemctl restart garba`.
- Backups run every night into `/var/backups/sapna`, and the last 30 days are kept. Also copy them off the server, for example with rclone to Google Drive.
