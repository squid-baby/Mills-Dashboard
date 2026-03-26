/**
 * Netlify Function: GET /api/get-units
 *
 * Fetches tenant/renewal data from Supabase (unit_full view) and returns
 * dashboard-ready unit objects with derived status groups.
 *
 * Required env vars:
 *   SUPABASE_URL         - Supabase project URL
 *   SUPABASE_SERVICE_KEY  - Supabase service role key
 */

export async function handler() {
  const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ units: [], source: 'none', error: 'Missing Supabase credentials' }),
    };
  }

  const t0 = Date.now();
  try {
    // Fetch all units with nested residents + next_residents from the view
    const res = await fetch(`${SUPABASE_URL}/rest/v1/unit_full?select=*&order=address`, {
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      },
    });

    if (!res.ok) {
      throw new Error(`Supabase returned ${res.status}: ${await res.text()}`);
    }

    const rows = await res.json();
    const units = rows.map((row, i) => buildUnit(row, i + 1));

    console.log(`[get-units] OK — ${units.length} units | ${Date.now() - t0}ms`);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ units, source: 'live', fetchedAt: new Date().toISOString() }),
    };
  } catch (err) {
    console.error(`[get-units] ERROR after ${Date.now() - t0}ms:`, err.message);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ units: [], source: 'error', error: err.message }),
    };
  }
}

// ─── Transform a Supabase unit_full row into dashboard shape ────────────────

function buildUnit(row, id) {
  const rawResidents = row.residents || [];
  const rawNext = row.next_residents || [];

  // Extract unit-level dates from raw data before mapping
  const leaseEnd = rawResidents.length > 0
    ? formatDate(rawResidents[0].leaseEnd || rawResidents[0].lease_end || '')
    : '';
  const moveOutDate = rawResidents.map(r => r.moveOutDate || r.move_out_date || '').find(v => v) || '';
  const moveInDate = rawNext.map(r => r.moveInDate || r.move_in_date || '').find(v => v) || '';

  // Deduplicate residents by email (view can return dupes from joins)
  const seenResidents = new Set();
  const residents = [];
  for (const r of rawResidents) {
    const key = r.email || r.name || r.id;
    if (seenResidents.has(key)) continue;
    seenResidents.add(key);
    residents.push({
      name: r.name || '',
      email: r.email || '',
      phone: r.phone || '',
      status: (r.status || '').toLowerCase(),
      leaseSigned: !!r.leaseSigned,
      depositPaid: !!r.depositPaid,
    });
  }

  // Deduplicate next residents
  const seenNext = new Set();
  const nextResidents = [];
  for (const r of rawNext) {
    const key = r.email || r.name || r.id;
    if (seenNext.has(key)) continue;
    seenNext.add(key);
    nextResidents.push({
      name: r.name || '',
      email: r.email || '',
      phone: r.phone || '',
    });
  }

  // Collect notes from raw data (mapped residents don't have notes field)
  const notes = [...new Set(rawResidents.map(r => r.notes || '').filter(Boolean))].join('; ');
  const turnoverNotes = '';

  const group = deriveGroup(residents, nextResidents);
  const substate = deriveSubstate(group, residents, nextResidents);

  const allSigned = residents.length > 0 && residents.every(r =>
    r.status === 'leaving' || r.leaseSigned
  );
  const allDeposit = residents.length > 0 && residents.every(r =>
    r.status === 'leaving' || r.depositPaid
  );

  return {
    id,
    address: row.address || '',
    leaseEnd,
    moveOutDate: formatDate(moveOutDate),
    moveInDate: formatDate(moveInDate),
    beds: row.beds ? parseInt(row.beds, 10) || row.beds : 0,
    baths: row.baths || '',
    owner: row.owner_name || '',
    area: row.area || '',
    group,
    substate,
    notes,
    turnoverNotes,
    utilities: row.utilities || '',
    residents: residents.map(r => ({
      name: r.name,
      email: r.email,
      phone: r.phone,
      status: r.status,
      leaseSigned: r.leaseSigned,
      depositPaid: r.depositPaid,
    })),
    nextResidents: nextResidents.map(r => ({
      name: r.name,
      email: r.email,
      phone: r.phone,
    })),
    allSigned,
    allDeposit,
    propertyInfo: {
      propertyType: row.property_type || '',
      sqft: row.sq_ft || '',
      freezeWarning: !!row.freeze_warning,
      petsAllowed: row.pets_allowed || '',
      yearBuilt: row.year_built || '',
    },
  };
}

// ─── Format date from ISO (2026-07-31) to M/D/YY ───────────────────────────

function formatDate(val) {
  if (!val) return '';
  const str = val.toString().trim();
  // Already in M/D/YY format
  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(str)) return str;
  // ISO format: 2026-07-31
  const match = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const [, y, m, d] = match;
    return `${parseInt(m)}/${parseInt(d)}/${y.slice(2)}`;
  }
  return str;
}

// ─── Group derivation (same logic as before) ────────────────────────────────

function deriveGroup(residents, nextResidents) {
  if (residents.length === 0) return 'unknown';
  const statuses = residents.map(r => r.status);
  if (statuses.some(s => s === 'month to month')) return 'month_to_month';
  const allLeaving = statuses.every(s => s === 'leaving');
  const allRenewing = statuses.every(s => s === 'renewing');
  const hasLeaving = statuses.some(s => s === 'leaving');
  const hasRenewing = statuses.some(s => s === 'renewing');
  if (allLeaving) return nextResidents.length > 0 ? 'turnover_rented' : 'full_turnover';
  if (allRenewing) return residents.every(r => r.leaseSigned) ? 'renewed' : 'renewing';
  if (hasLeaving && hasRenewing) {
    const renewingSigned = residents.filter(r => r.status === 'renewing').every(r => r.leaseSigned);
    return renewingSigned ? 'partial_turn_leased' : 'partial_turn';
  }
  if (hasRenewing) return 'renewing';
  return 'unknown';
}

function deriveSubstate(group, residents, nextResidents) {
  switch (group) {
    case 'full_turnover': return 'Needs to be listed';
    case 'turnover_rented': return nextResidents.every(r => r.name) ? 'New tenant found, lease in progress' : 'Needs to be listed';
    case 'renewed': return 'Renewal signed';
    case 'renewing': return residents.some(r => r.status === 'renewing' && r.leaseSigned) ? 'Renewal lease sent, not all signed' : 'Interested, lease not yet sent';
    case 'partial_turn': return 'Partial turn - some staying, some leaving';
    case 'partial_turn_leased': return 'Partial turn - lease side done';
    case 'unknown': return 'Waiting to hear back';
    case 'month_to_month': return 'Month-to-month';
    default: return '';
  }
}
