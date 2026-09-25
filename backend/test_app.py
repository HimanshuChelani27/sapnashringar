import os
import tempfile
from datetime import date, timedelta

os.environ["GARBA_DATA"] = tempfile.mkdtemp()
os.environ["GARBA_ADMIN_PASSWORD"] = "pw"

import io  # noqa: E402

from fastapi.testclient import TestClient  # noqa: E402
from PIL import Image  # noqa: E402

from app import PHOTOS, app, with_preview  # noqa: E402

c = TestClient(app)
DAY = (date.today() + timedelta(days=5)).isoformat()
_buf = io.BytesIO()
Image.new("RGB", (3000, 2000), "red").save(_buf, "PNG")
PNG = ("pay.png", _buf.getvalue(), "image/png")


def test_full_flow():
    assert c.get("/api/admin/dresses").status_code == 401
    H = {"Authorization": "Bearer " + c.post("/api/admin/login", json={"password": "pw"}).json()["token"]}

    did = c.post("/api/admin/dresses", headers=H, data={
        "code": "D1", "name": "Rani pink", "gender": "women", "rent": 800, "deposit": 1500,
        "jewellery_available": True, "jewellery_price": 300}).json()["id"]
    # photos are shrunk to a 1200px webp + 480px jpg thumbnail
    c.post(f"/api/admin/dresses/{did}/photos", headers=H, files={"photos": PNG})
    photo = c.get(f"/api/dresses/{did}").json()["photos"][0]
    assert Image.open(PHOTOS / photo).size == (1200, 800)
    assert Image.open(PHOTOS / photo.replace(".webp", "_t.jpg")).size == (480, 320)
    assert c.post("/api/bookings", files={"screenshot": ("x.png", b"junk", "image/png")},
                  data={"dress_id": did, "date": DAY, "name": "X", "phone": "9999999999"}).status_code == 400
    page = with_preview("<head></head>", f"dresses/{did}", "https://x.in/")
    assert 'og:title" content="Rani pink' in page and "_t.jpg" in page

    pagdi = c.post("/api/admin/addons", headers=H, data={"name": "Pagdi", "kind": "pagdi", "price": 150}).json()["id"]

    # online booking; client-sent prices are ignored, server computes 800 + 300 + 150
    r = c.post("/api/bookings", files={"screenshot": PNG}, data={
        "dress_id": did, "date": DAY, "name": "Priya", "phone": "+91 98250 12345",
        "with_jewellery": True, "addon_ids": str(pagdi), "rent_total": 1})
    assert r.status_code == 200, r.text
    b = r.json()
    assert (b["rent_total"], b["deposit_total"]) == (1250, 1500)

    # pending holds the night
    assert c.get("/api/dresses", params={"date": DAY}).json()[0]["availability"] == "hold"
    dup = c.post("/api/bookings", files={"screenshot": PNG},
                 data={"dress_id": did, "date": DAY, "name": "X", "phone": "9999999999"})
    assert dup.status_code == 409

    # reject frees it; a shop booking can then take it
    c.patch(f"/api/admin/bookings/{b['id']}", headers=H, json={"status": "rejected"})
    assert c.get("/api/dresses", params={"date": DAY}).json()[0]["availability"] == "free"
    shop = c.post("/api/admin/bookings", headers=H,
                  data={"dress_id": did, "date": DAY, "name": "Komal", "rent_paid_mode": "cash"}).json()
    # re-approving the rejected one now conflicts
    assert c.patch(f"/api/admin/bookings/{b['id']}", headers=H, json={"status": "confirmed"}).status_code == 409

    # deposit lifecycle
    for patch in ({"deposit_collected": True}, {"handed_over": True}, {"returned": True},
                  {"deposit_refunded": True, "deduction": 200}):
        assert c.patch(f"/api/admin/bookings/{shop['id']}", headers=H, json=patch).status_code == 200

    grid = c.get("/api/admin/availability", headers=H, params={"from": DAY, "to": DAY}).json()["grid"]
    assert grid[str(did)][DAY]["state"] == "shop"

    t = c.get("/api/admin/revenue", headers=H, params={"from": DAY, "to": DAY}).json()["totals"]
    assert (t["rent_cash"], t["rent_upi"], t["deposit_in"], t["deposit_out"], t["deductions"], t["deposit_held"]) \
        == (800, 0, 1500, 1300, 200, 0)

    st = c.get("/api/bookings/status", params={"code": b["code"], "phone": "9825012345"}).json()
    assert st["status"] == "rejected"
