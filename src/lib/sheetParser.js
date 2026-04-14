/**
 * Parses raw Google Sheets rows into the unit objects the dashboard expects.
 *
 * Sheet 1 (renewals): one row per RESIDENT — multiple rows share a Property address.
 * Sheet 2 (property info): one row per PROPERTY — joined for beds, utilities, etc.
 */

// ─── Column indices for Sheet 1 ─────────────────────────────────────────────
const S1 = {
  PROPERTY: 0,
  RESIDENT: 1,
  EMAIL: 2,
  PHONE: 3,
  LEASE_END: 4,
  MOVE_OUT: 5,
  STATUS: 6,
  LEASE_SIGNED: 7,
  DEPOSIT_PAID: 8,
  NOTES: 9,
  NEXT_RESIDENT: 10,
  NEXT_EMAIL: 11,
  NEXT_PHONE: 12,
  NEXT_MOVE_IN: 13,
  NEXT_LEASE_END: 14,
  TURNOVER_NOTES: 15,
  FREEZE_WARNING: 16,
  OWNER: 17,
  AREA: 18,
};

// ─── Column indices for Sheet 2 ─────────────────────────────────────────────
const S2 = {
  PROPERTY: 0,
  BEDS: 1,
  BATHS: 2,
  WASHER: 3,
  DRYER: 4,
  DISHWASHER: 5,
  TOWN: 6,
  PROPERTY_TYPE: 7,
  SQFT: 8,
  GAS: 9,
  UTILITIES: 10,
  FREEZE_WARNING: 11,
  SUMP_PUMP: 12,
  BREAKER_BOX: 13,
  WATER_HEATER: 14,
  AC_TYPE: 15,
  HEAT_TYPE: 16,
  PETS_ALLOWED: 17,
  YEAR_BUILT: 18,
  OWNER: 19,
  SHEET_NOTES: 21,
  AREA: 24,
};

// ─── Helpers ────────────────────────────────────────────────────────────────
function yn(val) {
  return (val || '').toString().trim().toLowerCase() === 'yes';
}

function clean(val) {
  if (!val) return '';
  const s = val.toString().trim();
  // Treat dashes-only as blank (used for Airbnb placeholder emails)
  return /^[—–-]+$/.test(s) ? '' : s;
}

function isAirbnb(row) {
  return (row[S1.RESIDENT] || '').toString().trim().toLowerCase() === 'airbnb';
}

function isMonthToMonth(row) {
  return (row[S1.STATUS] || '').toString().trim().toLowerCase() === 'month to month';
}

// ─── Group derivation ───────────────────────────────────────────────────────
export function deriveGroup(residents, nextResidents) {
  if (residents.length === 0) return 'unknown';

  const statuses = residents.map(r => r.status);

  // Month-to-month is its own category
  if (statuses.some(s => s === 'month to month')) return 'month_to_month';

  const allLeaving  = statuses.every(s => s === 'leaving');
  const allRenewing = statuses.every(s => s === 'renewing');
  const hasLeaving  = statuses.some(s => s === 'leaving');
  const hasRenewing = statuses.some(s => s === 'renewing');

  if (allLeaving) {
    return nextResidents.length > 0 ? 'turnover_rented' : 'full_turnover';
  }

  if (allRenewing) {
    const allSigned = residents.every(r => r.leaseSigned);
    return allSigned ? 'renewed' : 'renewing';
  }

  if (hasLeaving && hasRenewing) {
    const renewingSigned = residents
      .filter(r => r.status === 'renewing')
      .every(r => r.leaseSigned);
    return renewingSigned ? 'partial_turn_leased' : 'partial_turn';
  }

  // Mix of unknown + renewing, or all unknown
  if (hasRenewing) return 'renewing';
  return 'unknown';
}

// ─── Derive a human-readable substate ───────────────────────────────────────
function deriveSubstate(group, residents, nextResidents) {
  switch (group) {
    case 'full_turnover':
      return 'Needs to be Rented';
    case 'turnover_rented':
      return nextResidents.every(r => r.name) ? 'New tenant found, lease in progress' : 'Needs to be Rented';
    case 'renewed':
      return 'Renewal signed';
    case 'renewing': {
      const anySigned = residents.some(r => r.status === 'renewing' && r.leaseSigned);
      return anySigned ? 'Renewal lease sent, not all signed' : 'Interested, lease not yet sent';
    }
    case 'partial_turn':
      return 'Partial turn - some staying, some leaving';
    case 'partial_turn_leased':
      return 'Partial turn - lease side done';
    case 'unknown':
      return 'Waiting to hear back';
    case 'month_to_month':
      return 'Month-to-month';
    default:
      return '';
  }
}

// ─── Main parser ────────────────────────────────────────────────────────────
export function parseSheets(sheet1Rows, sheet2Rows) {
  // Build property info lookup from Sheet 2
  const propInfo = {};
  for (let i = 1; i < sheet2Rows.length; i++) {
    const row = sheet2Rows[i];
    const addr = clean(row[S2.PROPERTY]);
    if (!addr) continue;
    propInfo[addr] = {
      beds: clean(row[S2.BEDS]),
      baths: clean(row[S2.BATHS]),
      utilities: clean(row[S2.UTILITIES]),
      area: clean(row[S2.AREA]),
      propertyInfo: {
        washer:              yn(row[S2.WASHER]),
        dryer:               yn(row[S2.DRYER]),
        dishwasher:          yn(row[S2.DISHWASHER]),
        town:                clean(row[S2.TOWN]),
        propertyType:        clean(row[S2.PROPERTY_TYPE]),
        sqft:                clean(row[S2.SQFT]),
        gas:                 yn(row[S2.GAS]),
        freezeWarning:       yn(row[S2.FREEZE_WARNING]),
        sumpPump:            yn(row[S2.SUMP_PUMP]),
        breakerBox:          clean(row[S2.BREAKER_BOX]),
        waterHeaterLocation: clean(row[S2.WATER_HEATER]),
        acType:              clean(row[S2.AC_TYPE]),
        heatType:            clean(row[S2.HEAT_TYPE]),
        petsAllowed:         yn(row[S2.PETS_ALLOWED]),
        yearBuilt:           clean(row[S2.YEAR_BUILT]),
        sheetNotes:          clean(row[S2.SHEET_NOTES]),
      },
    };
  }

  // Group Sheet 1 rows by Property address
  const groups = new Map();
  for (let i = 1; i < sheet1Rows.length; i++) {
    const row = sheet1Rows[i];
    const addr = clean(row[S1.PROPERTY]);
    if (!addr) continue;
    if (!groups.has(addr)) groups.set(addr, []);
    groups.get(addr).push(row);
  }

  // Build unit objects
  const units = [];
  let id = 1;

  for (const [address, rows] of groups) {
    // Skip Airbnb-only units
    const nonAirbnb = rows.filter(r => !isAirbnb(r));
    if (nonAirbnb.length === 0) continue;

    // Skip rows with no resident name (placeholder rows), but keep the unit if some rows have names
    const withNames = nonAirbnb.filter(r => clean(r[S1.RESIDENT]));

    // Build residents list
    const residents = withNames.map(r => ({
      name:        clean(r[S1.RESIDENT]),
      email:       clean(r[S1.EMAIL]),
      phone:       clean(r[S1.PHONE]),
      status:      clean(r[S1.STATUS]).toLowerCase(),
      leaseSigned: yn(r[S1.LEASE_SIGNED]),
      depositPaid: yn(r[S1.DEPOSIT_PAID]),
    }));

    // Build next residents (deduplicate by email)
    const seenEmails = new Set();
    const nextResidents = [];
    for (const r of nonAirbnb) {
      const name = clean(r[S1.NEXT_RESIDENT]);
      const email = clean(r[S1.NEXT_EMAIL]);
      if (!name) continue;
      const key = email || name;
      if (seenEmails.has(key)) continue;
      seenEmails.add(key);
      nextResidents.push({
        name,
        email,
        phone: clean(r[S1.NEXT_PHONE]),
      });
    }

    // Grab first non-blank values for unit-level fields
    const first = nonAirbnb[0];
    const leaseEnd = clean(first[S1.LEASE_END]);
    const moveOutDate = nonAirbnb.map(r => clean(r[S1.MOVE_OUT])).find(v => v) || '';
    const moveInDate = nonAirbnb.map(r => clean(r[S1.NEXT_MOVE_IN])).find(v => v) || '';
    const owner = nonAirbnb.map(r => clean(r[S1.OWNER])).find(v => v) || '';
    const area = nonAirbnb.map(r => clean(r[S1.AREA])).find(v => v) || '';

    // Collect unique notes
    const notes = [...new Set(nonAirbnb.map(r => clean(r[S1.NOTES])).filter(Boolean))].join('; ');
    const turnoverNotes = [...new Set(nonAirbnb.map(r => clean(r[S1.TURNOVER_NOTES])).filter(Boolean))].join('; ');

    // Derive group
    const group = deriveGroup(residents, nextResidents);
    const substate = deriveSubstate(group, residents, nextResidents);

    // Join Sheet 2 property info
    const info = propInfo[address] || {};
    const beds = info.beds || '';

    const allSigned = residents.length > 0 && residents.every(r =>
      r.status === 'leaving' || r.leaseSigned
    );
    const allDeposit = residents.length > 0 && residents.every(r =>
      r.status === 'leaving' || r.depositPaid
    );

    units.push({
      id: id++,
      address,
      leaseEnd,
      moveOutDate,
      moveInDate,
      beds: beds ? parseInt(beds, 10) || beds : 0,
      baths: info.baths || '',
      owner,
      area: area || info.area || '',
      group,
      substate,
      notes,
      turnoverNotes,
      utilities: info.utilities || '',
      residents,
      nextResidents,
      allSigned,
      allDeposit,
      propertyInfo: info.propertyInfo || {},
    });
  }

  return units;
}
