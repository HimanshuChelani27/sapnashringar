CREATE TABLE IF NOT EXISTS dresses (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL,
  gender TEXT NOT NULL CHECK (gender IN ('women','men','kids','blouse')),
  type TEXT NOT NULL DEFAULT '',
  size TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  rent INTEGER NOT NULL CHECK (rent >= 0),
  deposit INTEGER NOT NULL DEFAULT 0 CHECK (deposit >= 0),
  jewellery_available INTEGER NOT NULL DEFAULT 0,
  jewellery_price INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS dress_photos (
  id INTEGER PRIMARY KEY,
  dress_id INTEGER NOT NULL REFERENCES dresses(id),
  path TEXT NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS addons (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'other' CHECK (kind IN ('jewellery','pagdi','umbrella','dupatta','other')),
  description TEXT NOT NULL DEFAULT '',
  photo TEXT NOT NULL DEFAULT '',
  price INTEGER NOT NULL DEFAULT 0 CHECK (price >= 0),
  deposit INTEGER NOT NULL DEFAULT 0 CHECK (deposit >= 0),
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  dress_id INTEGER REFERENCES dresses(id),
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  date TEXT NOT NULL,
  with_jewellery INTEGER NOT NULL DEFAULT 0,
  jewellery_pref TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  rent_total INTEGER NOT NULL,
  deposit_total INTEGER NOT NULL,
  rent_paid_mode TEXT NOT NULL DEFAULT 'upi' CHECK (rent_paid_mode IN ('upi','cash')),
  screenshot TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','confirmed','rejected','out','returned','cancelled')),
  source TEXT NOT NULL DEFAULT 'online' CHECK (source IN ('online','offline')),
  admin_note TEXT NOT NULL DEFAULT '',
  deposit_collected_at TEXT,
  handed_over_at TEXT,
  returned_at TEXT,
  deposit_refunded INTEGER NOT NULL DEFAULT 0,
  deduction INTEGER NOT NULL DEFAULT 0,
  deduction_note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- One dress, one night: the DB refuses a second live booking.
CREATE UNIQUE INDEX IF NOT EXISTS one_booking_per_dress_night
  ON bookings(dress_id, date) WHERE status IN ('pending','confirmed','out','returned');
CREATE INDEX IF NOT EXISTS bookings_date ON bookings(date);

CREATE TABLE IF NOT EXISTS booking_addons (
  booking_id INTEGER NOT NULL REFERENCES bookings(id),
  addon_id INTEGER NOT NULL REFERENCES addons(id),
  price INTEGER NOT NULL,
  deposit INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);
