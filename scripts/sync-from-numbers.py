#!/usr/bin/env python3
"""
sync-from-numbers.py

Reads "2025-26 renewals" and "property info" sheets directly from the
Numbers file on Google Drive and upserts everything into Supabase.

Sensitive columns are never read:
  - col 21 (Door Codes)
  - col 26 (Lock Box and Key Number)

Usage:
  python3 scripts/sync-from-numbers.py
"""

import os, re, sys, json, datetime, requests
from pathlib import Path
from numbers_parser import Document

# ─── Config ───────────────────────────────────────────────────────────────────

NUMBERS_FILE = "/Volumes/One Touch/The_Team_Google_Drive Sync/2025-2026 Renewals_Dashboard.numbers"

SHEET_RENEWALS  = "2025-26 renewals"
SHEET_PROP_INFO = "property info"

# Load .env from project root
env_path = Path(__file__).parent.parent / ".env"
env = {}
for line in env_path.read_text().splitlines():
    line = line.strip()
    if line and not line.startswith("#") and "=" in line:
        k, _, v = line.partition("=")
        env[k.strip()] = v.strip()

SUPABASE_URL = env.get("SUPABASE_URL", "")
SUPABASE_KEY = env.get("SUPABASE_SERVICE_KEY", "")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("ERROR: Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env")
    sys.exit(1)

HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates,return=minimal",
}

# ─── Supabase helpers ──────────────────────────────────────────────────────────

def sb_upsert(table, rows, on_conflict="address"):
    if not rows:
        return
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    params = {"on_conflict": on_conflict}
    r = requests.post(url, headers=HEADERS, params=params, json=rows)
    if r.status_code not in (200, 201):
        print(f"  ERROR upserting {table}: {r.status_code} {r.text[:200]}")
        sys.exit(1)

def sb_delete_in(table, column, ids):
    if not ids:
        return
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    id_list = ",".join(f'"{i}"' if isinstance(i, str) else str(i) for i in ids)
    r = requests.delete(url, headers=HEADERS, params={column: f"in.({id_list})"})
    if r.status_code not in (200, 204):
        print(f"  ERROR deleting from {table}: {r.status_code} {r.text[:200]}")

def sb_select(table, columns="*"):
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    r = requests.get(url, headers={**HEADERS, "Prefer": "return=representation"},
                     params={"select": columns})
    if r.status_code != 200:
        print(f"  ERROR fetching {table}: {r.status_code} {r.text[:200]}")
        sys.exit(1)
    return r.json()

def sb_insert(table, rows):
    if not rows:
        return
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    r = requests.post(url, headers={**HEADERS, "Prefer": "resolution=ignore-duplicates,return=minimal"},
                      json=rows)
    if r.status_code not in (200, 201):
        print(f"  ERROR inserting {table}: {r.status_code} {r.text[:200]}")
        sys.exit(1)

# ─── Data helpers ──────────────────────────────────────────────────────────────

def cell_str(cell):
    """Return cell value as a clean string."""
    v = cell.value
    if v is None:
        return ""
    if isinstance(v, datetime.datetime):
        return v.date().isoformat()        # → "2026-07-31"
    if isinstance(v, datetime.date):
        return v.isoformat()
    s = str(v).strip()
    return "" if re.match(r'^[—–\-]+$', s) else s

def yn(cell):
    return cell_str(cell).lower() == "yes"

def parse_date(cell):
    s = cell_str(cell)
    if not s:
        return None
    # Already ISO from Numbers datetime: "2026-07-31"
    if re.match(r'^\d{4}-\d{2}-\d{2}$', s):
        return s
    # Fallback MM/DD/YY or MM/DD/YYYY
    parts = s.split("/")
    if len(parts) == 3:
        m, d, y = (int(p) for p in parts)
        year = 2000 + y if y < 100 else y
        return f"{year}-{m:02d}-{d:02d}"
    return None

def parse_beds(cell):
    s = cell_str(cell)
    if not s:
        return None
    # Numbers stores numeric values as floats: "2.0" → "2"
    try:
        f = float(s)
        return str(int(f)) if f == int(f) else s
    except ValueError:
        return s  # e.g. "Studio", "1, with an office"

# ─── Load Numbers file ─────────────────────────────────────────────────────────

if not Path(NUMBERS_FILE).exists():
    print(f"ERROR: Numbers file not found at:\n  {NUMBERS_FILE}")
    print("Is the external drive / Google Drive volume mounted?")
    sys.exit(1)

print(f"Reading: {Path(NUMBERS_FILE).name}")
doc = Document(NUMBERS_FILE)

sheets_by_name = {s.name: s for s in doc.sheets}
if SHEET_RENEWALS not in sheets_by_name:
    print(f"ERROR: Sheet '{SHEET_RENEWALS}' not found. Available: {list(sheets_by_name)}")
    sys.exit(1)
if SHEET_PROP_INFO not in sheets_by_name:
    print(f"ERROR: Sheet '{SHEET_PROP_INFO}' not found. Available: {list(sheets_by_name)}")
    sys.exit(1)

# ─── Parse "property info" ─────────────────────────────────────────────────────
# Col indices (0-based):
#  0=Property  1=Beds  2=Baths  6=Town  7=Type  8=SqFt  10=Utilities
#  11=Freeze   18=Pets  22=Owner  23=Portfolio  24=Area  25=Notes
#  21=DoorCodes (SKIP)  26=LockBox (SKIP)

prop_rows = list(sheets_by_name[SHEET_PROP_INFO].tables[0].iter_rows())
prop_info = {}  # address → dict

for row in prop_rows[1:]:   # skip header
    addr = cell_str(row[0])
    if not addr:
        continue
    prop_info[addr] = {
        "address":       addr,
        "beds":          parse_beds(row[1]),
        "baths":         float(cell_str(row[2])) if cell_str(row[2]) else None,
        "property_type": cell_str(row[7]),
        "sq_ft":         int(float(cell_str(row[8]))) if cell_str(row[8]) else None,
        "utilities":     cell_str(row[10]),
        "freeze_warning": yn(row[11]),
        "pets_allowed":  cell_str(row[18]),
        "owner_name":    cell_str(row[22]),
        "area":          cell_str(row[24]),
        # cols 21 (door codes) and 26 (lock box) deliberately not read
    }

print(f"  property info: {len(prop_info)} properties")

# ─── Parse "2025-26 renewals" ──────────────────────────────────────────────────
# Col indices (0-based):
#  0=Property  1=Resident  2=Email  3=LeaseEnd  4=Status
#  5=LeaseSigned  6=DepositPaid  7=Notes
#  8=NextResident  9=NextEmail  10=NextPhone  11=NextLeaseEnd
#  14=Owner  15=Area

renewal_rows = list(sheets_by_name[SHEET_RENEWALS].tables[0].iter_rows())
groups = {}  # address → list of raw rows

for row in renewal_rows[1:]:   # skip header
    addr = cell_str(row[0])
    if not addr:
        continue
    resident = cell_str(row[1])
    if resident.lower() == "airbnb":
        continue
    if addr not in groups:
        groups[addr] = []
    groups[addr].append(row)

print(f"  renewals: {len(groups)} properties, "
      f"{sum(len(v) for v in groups.values())} resident rows")

# ─── Build unit upsert rows ───────────────────────────────────────────────────

unit_upserts = []
for addr, rows in groups.items():
    info = prop_info.get(addr, {})
    owner = next((cell_str(r[14]) for r in rows if cell_str(r[14])), "") or info.get("owner_name", "")
    area  = next((cell_str(r[15]) for r in rows if cell_str(r[15])), "") or info.get("area", "")
    unit_upserts.append({
        "address":       addr,
        "beds":          info.get("beds"),
        "baths":         info.get("baths"),
        "area":          area,
        "owner_name":    owner,
        "utilities":     info.get("utilities", ""),
        "property_type": info.get("property_type", ""),
        "sq_ft":         info.get("sq_ft"),
        "freeze_warning": info.get("freeze_warning", False),
        "pets_allowed":  info.get("pets_allowed", ""),
    })

# Properties in property info with no current residents
for addr, info in prop_info.items():
    if addr not in groups:
        unit_upserts.append({
            "address":       addr,
            "beds":          info.get("beds"),
            "baths":         info.get("baths"),
            "area":          info.get("area", ""),
            "owner_name":    info.get("owner_name", ""),
            "utilities":     info.get("utilities", ""),
            "property_type": info.get("property_type", ""),
            "sq_ft":         info.get("sq_ft"),
            "freeze_warning": info.get("freeze_warning", False),
            "pets_allowed":  info.get("pets_allowed", ""),
        })

# ─── Upsert units ─────────────────────────────────────────────────────────────
print(f"\nUpserting {len(unit_upserts)} units...")
sb_upsert("units", unit_upserts, on_conflict="address")
print(f"  ✓ {len(unit_upserts)} units")

# ─── Fetch unit ID map ────────────────────────────────────────────────────────
unit_data = sb_select("units", "id,address")
unit_id_map = {u["address"]: u["id"] for u in unit_data}

# ─── Clear + reinsert residents for synced addresses ─────────────────────────
synced_ids = [unit_id_map[a] for a in groups if a in unit_id_map]
print(f"Clearing residents for {len(synced_ids)} units...")
sb_delete_in("residents",      "unit_id", synced_ids)
sb_delete_in("next_residents", "unit_id", synced_ids)

# ─── Build resident rows ──────────────────────────────────────────────────────
resident_rows      = []
next_resident_rows = []

for addr, rows in groups.items():
    unit_id = unit_id_map.get(addr)
    if not unit_id:
        print(f"  ⚠ No unit ID for: {addr}")
        continue

    seen_next = set()
    for row in rows:
        name = cell_str(row[1])
        if not name:
            continue

        resident_rows.append({
            "unit_id":     unit_id,
            "name":        name,
            "email":       cell_str(row[2]),
            "lease_end":   parse_date(row[3]),
            "status":      cell_str(row[4]).lower() or "unknown",
            "lease_signed": yn(row[5]),
            "deposit_paid": yn(row[6]),
            "notes":       cell_str(row[7]),
        })

        next_name  = cell_str(row[8])
        next_email = cell_str(row[9])
        if next_name:
            key = next_email or next_name
            if key not in seen_next:
                seen_next.add(key)
                next_resident_rows.append({
                    "unit_id": unit_id,
                    "name":    next_name,
                    "email":   next_email,
                    "phone":   cell_str(row[10]),
                })

print(f"Inserting {len(resident_rows)} residents...")
sb_insert("residents", resident_rows)
print(f"  ✓ {len(resident_rows)} residents")

if next_resident_rows:
    print(f"Inserting {len(next_resident_rows)} next residents...")
    sb_insert("next_residents", next_resident_rows)
    print(f"  ✓ {len(next_resident_rows)} next residents")

# ─── Log the sync ─────────────────────────────────────────────────────────────
sb_insert("sync_log", [{
    "source":              "numbers",
    "status":              "success",
    "units_upserted":      len(unit_upserts),
    "residents_upserted":  len(resident_rows),
}])

print("\n✅ Sync complete.")
