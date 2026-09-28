"""Sapna Garba rental API. Run: uvicorn app:app --reload"""
import csv
import hashlib
import hmac
import html
import io
import os
import re
import secrets
import sqlite3
import time
from contextlib import closing
from datetime import date, datetime
from pathlib import Path

from fastapi import APIRouter, Body, Depends, FastAPI, File, Form, Header, HTTPException, Query, Request, UploadFile
from fastapi.responses import FileResponse, HTMLResponse, RedirectResponse, Response
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.staticfiles import StaticFiles
from PIL import Image, ImageOps
from pillow_heif import register_heif_opener
from pydantic import BaseModel

register_heif_opener()  # iPhone HEIC photos

HERE = Path(__file__).parent
DATA = Path(os.environ.get("GARBA_DATA", HERE / "data"))
DB_PATH = DATA / "garba.db"
PHOTOS = DATA / "photos"      # public: dress / extra photos, UPI QR
PAYMENTS = DATA / "payments"  # private: payment screenshots, admin only
DIST = HERE.parent / "frontend" / "dist"
ADMIN_PASSWORD = os.environ.get("GARBA_ADMIN_PASSWORD", "admin")
SECRET = os.environ.get("GARBA_SECRET", "dev-secret-change-me").encode()

LIVE = "('pending','confirmed','out','returned')"   # statuses that occupy a dress-night
EARNED = "('confirmed','out','returned')"
GENDERS = {"women", "men", "kids", "blouse"}
ADDON_KINDS = {"jewellery", "pagdi", "umbrella", "dupatta", "other"}
IMG_EXT = {".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"}
PHOTO_PX = 1200  # longest side of the dress-page photo; 1600 = more zoom detail, ~2x the KB
MAX_IMG = 25 * 1024 * 1024  # raw iPhone photos; we shrink them on save
SETTING_KEYS = ("upi_id", "whatsapp_number", "shop_address", "pickup_rules", "upi_qr", "navratri_start")


# ---------- db ----------
def db():
    c = sqlite3.connect(DB_PATH)
    c.row_factory = sqlite3.Row
    c.execute("PRAGMA foreign_keys=ON")
    return c


def rows(sql, args=()):
    with closing(db()) as c:
        return [dict(r) for r in c.execute(sql, args)]


def one(sql, args=()):
    r = rows(sql, args)
    return r[0] if r else None


def run(sql, args=()):
    with closing(db()) as c, c:
        return c.execute(sql, args).lastrowid


def init_db():
    for d in (PHOTOS, PAYMENTS):
        d.mkdir(parents=True, exist_ok=True)
    schema = (HERE / "schema.sql").read_text()
    with closing(db()) as c:
        old = c.execute("SELECT sql FROM sqlite_master WHERE name='dresses'").fetchone()
        if old and "'blouse'" not in old[0]:
            migrate_categories(c, schema)
        c.executescript(schema)


def migrate_categories(c, schema):
    """Sept 2026: girls/boys sections dropped (moved to kids), blouse added. SQLite can't alter a CHECK,
    so rebuild the table the way the SQLite docs describe; ids stay the same, so photos/bookings keep pointing right."""
    create = next(s for s in schema.split(";") if "TABLE IF NOT EXISTS dresses (" in s)
    cols = "id, code, name, gender, type, size, description, rent, deposit, jewellery_available, jewellery_price, active"
    c.executescript(f"""
        PRAGMA foreign_keys=OFF;
        BEGIN;
        {create.replace("IF NOT EXISTS dresses (", "dresses_new (")};
        INSERT INTO dresses_new ({cols})
          SELECT {cols.replace("gender", "CASE WHEN gender IN ('girls','boys') THEN 'kids' ELSE gender END")} FROM dresses;
        DROP TABLE dresses;
        ALTER TABLE dresses_new RENAME TO dresses;
        COMMIT;
        PRAGMA foreign_keys=ON;
    """)


init_db()
app = FastAPI(title="Sapna Garba")
app.mount("/uploads", StaticFiles(directory=PHOTOS), name="uploads")
app.add_middleware(GZipMiddleware, minimum_size=1000)


@app.middleware("http")
async def cache_forever(request: Request, call_next):
    # photo and JS/CSS file names never change, so phones can keep them forever
    r = await call_next(request)
    if r.status_code == 200 and request.url.path.startswith(("/uploads/", "/garba/assets/")):
        r.headers["Cache-Control"] = "public, max-age=31536000, immutable"
    return r


# ---------- helpers ----------
def make_token():
    exp = str(int(time.time()) + 7 * 86400)
    return exp + "." + hmac.new(SECRET, exp.encode(), hashlib.sha256).hexdigest()


def token_ok(tok):
    exp, _, sig = (tok or "").partition(".")
    good = hmac.new(SECRET, exp.encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(sig, good) and exp.isdigit() and int(exp) > time.time()


def require_admin(authorization: str = Header("")):
    if not token_ok(authorization.removeprefix("Bearer ")):
        raise HTTPException(401, "Please log in again")


def parse_date(s):
    try:
        return date.fromisoformat(s).isoformat()
    except ValueError:
        raise HTTPException(400, "Date should look like 2026-10-11")


def clean_phone(s):
    d = "".join(ch for ch in s if ch.isdigit())
    if len(d) == 12 and d.startswith("91"):
        d = d[2:]
    if len(d) != 10:
        raise HTTPException(400, "Enter a 10-digit mobile number")
    return d


def parse_ids(s):
    try:
        return sorted({int(x) for x in s.split(",") if x.strip()})
    except ValueError:
        raise HTTPException(400, "Bad extras list")


async def save_image(f: UploadFile, folder: Path, *, size=None, thumb=False) -> str:
    """Shrink every upload: <name>.webp (~150 KB) and, for catalog photos, <name>_t.jpg (~40 KB) for lists
    and WhatsApp link previews. Originals are not kept."""
    ext = Path(f.filename or "").suffix.lower()
    if ext not in IMG_EXT:
        raise HTTPException(400, "Please upload a photo (JPG, PNG, HEIC or WEBP)")
    data = await f.read()
    if len(data) > MAX_IMG:
        raise HTTPException(400, "Image is too big (max 25 MB)")
    try:
        im = ImageOps.exif_transpose(Image.open(io.BytesIO(data))).convert("RGB")  # fixes iPhone rotation
    except Exception:
        raise HTTPException(400, "Could not read this image. Please try another photo.")
    # ponytail: resizing runs on the request thread (~0.3 s/photo); fine for one admin uploading.
    name = secrets.token_hex(12)
    big = im.copy()
    big.thumbnail((size or PHOTO_PX, size or PHOTO_PX))
    big.save(folder / f"{name}.webp", quality=82)
    if thumb:
        im.thumbnail((480, 480))
        im.save(folder / f"{name}_t.jpg", quality=78, optimize=True, progressive=True)
    return name + ".webp"


def thumb_of(path):
    return path.removesuffix(".webp") + "_t.jpg"


def insert(table, fields):
    cols = ",".join(fields)
    return run(f"INSERT INTO {table} ({cols}) VALUES ({','.join('?' * len(fields))})", tuple(fields.values()))


def update(table, id_, fields):
    if fields:
        sets = ",".join(f"{k}=?" for k in fields)
        run(f"UPDATE {table} SET {sets} WHERE id=?", (*fields.values(), id_))


FIRST_PHOTO = "(SELECT path FROM dress_photos p WHERE p.dress_id = {} ORDER BY sort, id LIMIT 1)"
BOOKING_SQL = f"""
SELECT b.*, d.code AS dress_code, d.name AS dress_name, {FIRST_PHOTO.format('b.dress_id')} AS dress_photo,
  (SELECT GROUP_CONCAT(a.name, ', ') FROM booking_addons ba JOIN addons a ON a.id = ba.addon_id
   WHERE ba.booking_id = b.id) AS addons
FROM bookings b LEFT JOIN dresses d ON d.id = b.dress_id"""

TAKEN = "Sorry, this dress was just booked for that date. Please pick another date or dress."


def create_booking(*, dress_id, day, name, phone, with_jewellery, addon_ids, jewellery_pref, notes,
                   screenshot, status, source, rent_paid_mode, rent_override=None, deposit_override=None):
    """Single path for online and shop bookings. Prices come from the DB; only the admin's shop booking
    may override them (negotiated price)."""
    name = name.strip()[:80]
    if not name:
        raise HTTPException(400, "Please enter your name")
    rent = deposit = 0
    if dress_id:
        d = one("SELECT * FROM dresses WHERE id=? AND active=1", (dress_id,))
        if not d:
            raise HTTPException(404, "Dress not found")
        with_jewellery = with_jewellery and bool(d["jewellery_available"])
        rent = d["rent"] + (d["jewellery_price"] if with_jewellery else 0)
        deposit = d["deposit"]
    else:
        with_jewellery = False
    addons = rows(f"SELECT id, price, deposit FROM addons WHERE active=1 AND id IN ({','.join('?' * len(addon_ids))})",
                  addon_ids) if addon_ids else []
    if not dress_id and not addons:
        raise HTTPException(400, "Pick a dress or at least one extra")
    rent += sum(a["price"] for a in addons)
    deposit += sum(a["deposit"] for a in addons)
    rent = rent if rent_override is None else rent_override
    deposit = deposit if deposit_override is None else deposit_override
    code = "SG-" + "".join(secrets.choice("ABCDEFGHJKMNPQRSTUVWXYZ23456789") for _ in range(5))
    try:
        with closing(db()) as c, c:
            bid = c.execute(
                """INSERT INTO bookings (code, dress_id, name, phone, date, with_jewellery, jewellery_pref, notes,
                   rent_total, deposit_total, rent_paid_mode, screenshot, status, source)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (code, dress_id, name, phone, day, int(with_jewellery), jewellery_pref[:200], notes[:500],
                 rent, deposit, rent_paid_mode, screenshot, status, source)).lastrowid
            c.executemany("INSERT INTO booking_addons VALUES (?,?,?,?)",
                          [(bid, a["id"], a["price"], a["deposit"]) for a in addons])
    except sqlite3.IntegrityError:
        if screenshot:
            (PAYMENTS / screenshot).unlink(missing_ok=True)
        raise HTTPException(409, TAKEN)
    return {"id": bid, "code": code, "rent_total": rent, "deposit_total": deposit}


# ---------- public ----------
@app.get("/api/dresses")
def list_dresses(gender: str = "", type: str = "", size: str = "",
                 min_rent: int = Query(0, alias="min"), max_rent: int = Query(10**9, alias="max"),
                 day: str = Query("", alias="date")):
    sql = f"""SELECT d.*, {FIRST_PHOTO.format('d.id')} AS photo, b.status AS bstatus
              FROM dresses d LEFT JOIN bookings b ON b.dress_id = d.id AND b.date = ? AND b.status IN {LIVE}
              WHERE d.active = 1 AND d.rent BETWEEN ? AND ?"""
    args = [parse_date(day) if day else "", min_rent, max_rent]
    for col, val in (("gender", gender), ("type", type), ("size", size)):
        if val:
            sql += f" AND d.{col} = ?"
            args.append(val)
    out = rows(sql + " ORDER BY d.id DESC", args)
    for d in out:
        s = d.pop("bstatus")
        d["availability"] = None if not day else "free" if not s else "hold" if s == "pending" else "booked"
    if day:
        out.sort(key=lambda d: ("free", "hold", "booked").index(d["availability"]))
    return out


@app.get("/api/dresses/{dress_id}")
def get_dress(dress_id: int):
    d = one("SELECT * FROM dresses WHERE id=? AND active=1", (dress_id,))
    if not d:
        raise HTTPException(404, "Dress not found")
    d["photos"] = [r["path"] for r in rows("SELECT path FROM dress_photos WHERE dress_id=? ORDER BY sort, id", (dress_id,))]
    d["dates"] = {r["date"]: "hold" if r["status"] == "pending" else "booked" for r in rows(
        f"SELECT date, status FROM bookings WHERE dress_id=? AND date >= ? AND status IN {LIVE}",
        (dress_id, date.today().isoformat()))}
    return d


@app.get("/api/addons")
def list_addons():
    return rows("SELECT * FROM addons WHERE active=1 ORDER BY kind, id")


@app.get("/api/settings/public")
def public_settings():
    return {r["key"]: r["value"] for r in rows("SELECT * FROM settings")}


@app.post("/api/bookings")
async def book(day: str = Form(..., alias="date"), name: str = Form(...), phone: str = Form(...),
               screenshot: UploadFile = File(...), dress_id: int | None = Form(None),
               with_jewellery: bool = Form(False), addon_ids: str = Form(""),
               jewellery_pref: str = Form(""), notes: str = Form("")):
    day = parse_date(day)
    if day < date.today().isoformat():
        raise HTTPException(400, "That date has already passed")
    phone = clean_phone(phone)
    shot = await save_image(screenshot, PAYMENTS, size=1600)
    return create_booking(dress_id=dress_id, day=day, name=name, phone=phone, with_jewellery=with_jewellery,
                          addon_ids=parse_ids(addon_ids), jewellery_pref=jewellery_pref, notes=notes,
                          screenshot=shot, status="pending", source="online", rent_paid_mode="upi")


@app.get("/api/bookings/status")
def booking_status(code: str, phone: str):
    b = one(BOOKING_SQL + " WHERE b.code=? AND b.phone=?", (code.strip().upper(), clean_phone(phone)))
    if not b:
        raise HTTPException(404, "No booking found. Check the code and phone number.")
    keep = ("code", "date", "status", "dress_name", "dress_photo", "addons", "with_jewellery",
            "jewellery_pref", "rent_total", "deposit_total", "admin_note")
    return {k: b[k] for k in keep}


@app.post("/api/admin/login")
def login(password: str = Body(..., embed=True)):
    if not hmac.compare_digest(password.encode(), ADMIN_PASSWORD.encode()):
        raise HTTPException(401, "Wrong password")
    return {"token": make_token()}


@app.get("/api/admin/payments/{name}")
def payment_screenshot(name: str, token: str = ""):
    # <img src> can't send headers, so the token rides in the query string.
    if not token_ok(token):
        raise HTTPException(401, "Please log in again")
    f = PAYMENTS / Path(name).name
    if not f.is_file():
        raise HTTPException(404, "Not found")
    return FileResponse(f)


# ---------- admin ----------
adm = APIRouter(prefix="/api/admin", dependencies=[Depends(require_admin)])


def dress_form(code: str = Form(""), name: str = Form(...), gender: str = Form(...), type: str = Form(""),
               size: str = Form(""), description: str = Form(""), rent: int = Form(..., ge=0),
               deposit: int = Form(0, ge=0), jewellery_available: bool = Form(False),
               jewellery_price: int = Form(0, ge=0), active: bool = Form(True)):
    if gender not in GENDERS:
        raise HTTPException(400, "Pick who the dress is for")
    return dict(code=code, name=name, gender=gender, type=type, size=size, description=description, rent=rent,
                deposit=deposit, jewellery_available=int(jewellery_available), jewellery_price=jewellery_price,
                active=int(active))


@adm.get("/dresses")
def admin_dresses():
    out = rows("SELECT * FROM dresses ORDER BY active DESC, id DESC")
    photos = rows("SELECT id, dress_id, path FROM dress_photos ORDER BY sort, id")
    for d in out:
        d["photos"] = [p for p in photos if p["dress_id"] == d["id"]]
    return out


@adm.post("/dresses")
async def add_dress(f: dict = Depends(dress_form), photos: list[UploadFile] = File([])):
    did = insert("dresses", f)
    await add_photos(did, photos)
    return {"id": did}


@adm.put("/dresses/{did}")
def edit_dress(did: int, f: dict = Depends(dress_form)):
    update("dresses", did, f)
    return {"ok": True}


@adm.post("/dresses/{did}/photos")
async def add_photos(did: int, photos: list[UploadFile] = File(...)):
    for i, p in enumerate(photos):
        insert("dress_photos", {"dress_id": did, "path": await save_image(p, PHOTOS, thumb=True), "sort": i})
    return {"ok": True}


@adm.delete("/photos/{pid}")
def delete_photo(pid: int):
    p = one("SELECT path FROM dress_photos WHERE id=?", (pid,))
    if p:
        run("DELETE FROM dress_photos WHERE id=?", (pid,))
        (PHOTOS / p["path"]).unlink(missing_ok=True)
        (PHOTOS / thumb_of(p["path"])).unlink(missing_ok=True)
    return {"ok": True}


def addon_form(name: str = Form(...), kind: str = Form("other"), description: str = Form(""),
               price: int = Form(0, ge=0), deposit: int = Form(0, ge=0), active: bool = Form(True)):
    if kind not in ADDON_KINDS:
        raise HTTPException(400, "Unknown extra type")
    return dict(name=name, kind=kind, description=description, price=price, deposit=deposit, active=int(active))


@adm.get("/addons")
def admin_addons():
    return rows("SELECT * FROM addons ORDER BY active DESC, kind, id")


@adm.post("/addons")
async def add_addon(f: dict = Depends(addon_form), photo: UploadFile | None = File(None)):
    if photo and photo.filename:
        f["photo"] = await save_image(photo, PHOTOS, thumb=True)
    return {"id": insert("addons", f)}


@adm.put("/addons/{aid}")
async def edit_addon(aid: int, f: dict = Depends(addon_form), photo: UploadFile | None = File(None)):
    if photo and photo.filename:
        f["photo"] = await save_image(photo, PHOTOS, thumb=True)
    update("addons", aid, f)
    return {"ok": True}


@adm.get("/bookings")
def admin_bookings(status: str = "", day: str = Query("", alias="date")):
    sql, args = BOOKING_SQL + " WHERE 1=1", []
    if status:
        st = status.split(",")
        sql += f" AND b.status IN ({','.join('?' * len(st))})"
        args += st
    if day:
        sql += " AND b.date = ?"
        args.append(parse_date(day))
    return rows(sql + " ORDER BY b.date, b.created_at", args)


@adm.post("/bookings")
async def add_offline_booking(day: str = Form(..., alias="date"), name: str = Form(...), phone: str = Form(""),
                              dress_id: int | None = Form(None), with_jewellery: bool = Form(False),
                              addon_ids: str = Form(""), jewellery_pref: str = Form(""), notes: str = Form(""),
                              rent_paid_mode: str = Form("cash"),
                              rent: int | None = Form(None, ge=0), deposit: int | None = Form(None, ge=0)):
    """Shop booking. rent/deposit are optional: blank = list price, a number = negotiated price."""
    if rent_paid_mode not in ("cash", "upi"):
        raise HTTPException(400, "Paid by cash or UPI?")
    return create_booking(dress_id=dress_id, day=parse_date(day), name=name,
                          phone=clean_phone(phone) if phone.strip() else "", with_jewellery=with_jewellery,
                          addon_ids=parse_ids(addon_ids), jewellery_pref=jewellery_pref, notes=notes,
                          screenshot="", status="confirmed", source="offline", rent_paid_mode=rent_paid_mode,
                          rent_override=rent, deposit_override=deposit)


class BookingPatch(BaseModel):
    status: str | None = None           # approve / reject / cancel
    admin_note: str | None = None
    deposit_collected: bool | None = None
    handed_over: bool | None = None
    returned: bool | None = None
    deposit_refunded: bool | None = None
    deduction: int | None = None
    deduction_note: str | None = None


@adm.patch("/bookings/{bid}")
def patch_booking(bid: int, p: BookingPatch):
    b = one("SELECT * FROM bookings WHERE id=?", (bid,))
    if not b:
        raise HTTPException(404, "Booking not found")
    now = datetime.now().isoformat(timespec="minutes")
    u = {}
    if p.status is not None:
        if p.status not in ("pending", "confirmed", "rejected", "cancelled"):
            raise HTTPException(400, "Unknown status")
        u["status"] = p.status
    if p.handed_over is not None:
        u["handed_over_at"] = now if p.handed_over else None
        u["status"] = "out" if p.handed_over else "confirmed"
    if p.returned is not None:
        u["returned_at"] = now if p.returned else None
        u["status"] = "returned" if p.returned else "out"
    if p.deposit_collected is not None:
        u["deposit_collected_at"] = now if p.deposit_collected else None
    if p.deposit_refunded is not None:
        u["deposit_refunded"] = int(p.deposit_refunded)
    if p.deduction is not None:
        if not 0 <= p.deduction <= b["deposit_total"]:
            raise HTTPException(400, "Deduction can't be more than the deposit")
        u["deduction"] = p.deduction
    for k in ("admin_note", "deduction_note"):
        if getattr(p, k) is not None:
            u[k] = getattr(p, k)[:500]
    try:
        update("bookings", bid, u)
    except sqlite3.IntegrityError:
        raise HTTPException(409, "Another booking already holds this dress for that date")
    return one(BOOKING_SQL + " WHERE b.id=?", (bid,))


@adm.get("/availability")
def availability(start: str = Query(..., alias="from"), end: str = Query(..., alias="to"), gender: str = ""):
    sql, args = f"""SELECT id, code, name, gender, type, size, rent, deposit, jewellery_available, jewellery_price,
                    {FIRST_PHOTO.format('dresses.id')} AS photo FROM dresses WHERE active=1""", []
    if gender:
        sql += " AND gender=?"
        args.append(gender)
    grid = {}
    for c in rows(f"""SELECT id, dress_id, date, status, source, name FROM bookings
                      WHERE date BETWEEN ? AND ? AND dress_id IS NOT NULL AND status IN {LIVE}""",
                  (parse_date(start), parse_date(end))):
        state = "hold" if c["status"] == "pending" else "online" if c["source"] == "online" else "shop"
        grid.setdefault(c["dress_id"], {})[c["date"]] = {"state": state, "booking_id": c["id"], "name": c["name"]}
    return {"dresses": rows(sql + " ORDER BY code, id", args), "grid": grid}


REVENUE_COLS = ("date", "bookings", "rent_upi", "rent_cash", "deposit_in", "deposit_out", "deductions")


@adm.get("/revenue")
def revenue(start: str = Query(..., alias="from"), end: str = Query(..., alias="to"), format: str = "json"):
    # ponytail: grouped by booking date, not the moment cash changed hands; add a payments ledger if that matters.
    days = rows(f"""SELECT date,
        COUNT(CASE WHEN status IN {EARNED} THEN 1 END) AS bookings,
        SUM(CASE WHEN status IN {EARNED} AND rent_paid_mode='upi' THEN rent_total ELSE 0 END) AS rent_upi,
        SUM(CASE WHEN status IN {EARNED} AND rent_paid_mode='cash' THEN rent_total ELSE 0 END) AS rent_cash,
        SUM(CASE WHEN deposit_collected_at IS NOT NULL THEN deposit_total ELSE 0 END) AS deposit_in,
        SUM(CASE WHEN deposit_refunded THEN deposit_total - deduction ELSE 0 END) AS deposit_out,
        SUM(CASE WHEN deposit_refunded THEN deduction ELSE 0 END) AS deductions
        FROM bookings WHERE date BETWEEN ? AND ? GROUP BY date ORDER BY date""",
                (parse_date(start), parse_date(end)))
    totals = {k: sum(d[k] for d in days) for k in REVENUE_COLS[1:]}
    totals["rent"] = totals["rent_upi"] + totals["rent_cash"]
    totals["deposit_held"] = totals["deposit_in"] - totals["deposit_out"] - totals["deductions"]
    if format == "csv":
        buf = io.StringIO()
        w = csv.DictWriter(buf, REVENUE_COLS)
        w.writeheader()
        w.writerows(days)
        return Response(buf.getvalue(), media_type="text/csv",
                        headers={"Content-Disposition": f'attachment; filename="revenue_{start}_{end}.csv"'})
    return {"days": days, "totals": totals}


@adm.put("/settings")
async def save_settings(request: Request):
    form = await request.form()
    for k in SETTING_KEYS:
        v = form.get(k)
        if isinstance(v, str):
            val = v
        elif v is not None and getattr(v, "filename", ""):
            val = await save_image(v, PHOTOS)
        else:
            continue
        run("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", (k, val))
    return public_settings()


app.include_router(adm)


# ---------- React build (production) ----------
@app.get("/")
def root():
    return RedirectResponse("/garba/home")


if DIST.exists():
    @app.get("/garba")
    @app.get("/garba/{rest:path}")
    def spa(request: Request, rest: str = ""):
        f = (DIST / rest).resolve()
        if rest and f.is_file() and DIST.resolve() in f.parents:
            return FileResponse(f)
        return HTMLResponse(with_preview((DIST / "index.html").read_text(encoding="utf8"), rest, str(request.base_url)))


def with_preview(page, rest, base):
    """WhatsApp/Facebook don't run JS, so put the link-preview tags into the HTML on the server."""
    title, desc, image = "Sapna Garba · Navratri dresses on rent",         "Chaniya choli, kediyu and jewellery on rent for Navratri. Check free dates and book online.", ""
    m = re.fullmatch(r"dresses/(\d+)", rest)
    d = m and one(f"SELECT d.*, {FIRST_PHOTO.format('d.id')} AS photo FROM dresses d WHERE id=? AND active=1",
                  (int(m[1]),))
    if d:
        title = f"{d['name']} · ₹{d['rent']}/night | Sapna Garba"
        desc = (d["description"] or desc)[:200]
        image = d["photo"] and f"{base}uploads/{thumb_of(d['photo'])}"
    tags = [("og:title", title), ("og:description", desc), ("og:type", "website"), ("og:site_name", "Sapna Garba")]
    if image:
        tags.append(("og:image", image))
    meta = "".join(f'<meta property="{k}" content="{html.escape(v)}">' for k, v in tags)
    return page.replace("</head>", f'{meta}<meta name="description" content="{html.escape(desc)}"></head>', 1)
