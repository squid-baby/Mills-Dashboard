/**
 * Netlify Function: GET /api/get-units
 *
 * Fetches units with full resident data from Supabase and returns
 * dashboard-ready unit objects with derived status groups.
 *
 * Required env vars:
 *   SUPABASE_URL         - Supabase project URL
 *   SUPABASE_SERVICE_KEY - Supabase service role key
 */

import { createClient } from '@supabase/supabase-js';

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
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const { data, error } = await supabase
      .from('units')
      .select(`
        id, address, beds, baths, area, owner_name, utilities,
        property_type, sq_ft, freeze_warning, pets_allowed, year_built,
        town, washer, dryer, dishwasher, gas, sump_pump, breaker_box,
        ac_type, heat_type, sheet_notes,
        door_code, lockbox_code, alarm_code, key_location,
        stove, stove_replaced, stove_warranty,
        washer_replaced, washer_warranty, dryer_replaced, dryer_warranty,
        dishwasher_replaced, dishwasher_warranty, fridge_replaced, fridge_warranty,
        hvac_last_service, water_heater_location, water_heater_type, water_heater_last_service,
        water_shutoff, filter_size, filter_size_2, internet_provider,
        toilet_flapper_style, toilet_seat_style,
        outlet_standard_color,
        paint_interior, paint_trim, paint_brand, paint_last_done,
        unit_notes, portfolio, lead_paint,
        residents ( name, email, phone, status, lease_end, move_out_date, lease_signed, deposit_paid, notes ),
        next_residents ( name, email, phone, move_in_date )
      `)
      .order('address');

    if (error) throw new Error(error.message);

    const units = data.map((row, i) => buildUnit(row, i + 1));

    console.log(`[get-units] OK — ${units.length} units from Supabase | ${Date.now() - t0}ms`);

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

// ─── Transform a Supabase row into dashboard shape ───────────────────────────

function buildUnit(row, id) {
  const residents = (row.residents || []).map(r => ({
    name:        r.name || '',
    email:       r.email || '',
    phone:       r.phone || '',
    status:      (r.status || '').toLowerCase(),
    leaseEnd:    formatDate(r.lease_end || ''),
    moveOutDate: formatDate(r.move_out_date || ''),
    leaseSigned: !!r.lease_signed,
    depositPaid: !!r.deposit_paid,
    notes:       r.notes || '',
  }));

  const nextResidents = (row.next_residents || []).map(r => ({
    name:      r.name || '',
    email:     r.email || '',
    phone:     r.phone || '',
    moveInDate: formatDate(r.move_in_date || ''),
  }));

  const leaseEnd    = residents[0]?.leaseEnd || '';
  const moveOutDate = residents.map(r => r.moveOutDate).find(v => v) || '';
  const moveInDate  = nextResidents.map(r => r.moveInDate).find(v => v) || '';
  const notes       = [...new Set(residents.map(r => r.notes).filter(Boolean))].join('; ');
  const group       = deriveGroup(residents, nextResidents);
  const substate    = deriveSubstate(group, residents, nextResidents);
  const hasNonLeaving = residents.some(r => r.status !== 'leaving');
  const allSigned   = residents.length > 0 && residents.every(r => (hasNonLeaving && r.status === 'leaving') || r.leaseSigned);
  const allDeposit  = residents.length > 0 && residents.every(r => (hasNonLeaving && r.status === 'leaving') || r.depositPaid);

  return {
    id,
    address:      row.address || '',
    leaseEnd,
    moveOutDate,
    moveInDate,
    beds:         row.beds ? parseInt(row.beds, 10) || row.beds : 0,
    baths:        row.baths || '',
    owner:        row.owner_name || '',
    area:         row.area || '',
    group,
    substate,
    notes,
    turnoverNotes: '',
    utilities:    row.utilities || '',
    residents:    residents.map(({ notes: _n, ...r }) => r),
    nextResidents,
    allSigned,
    allDeposit,
    propertyInfo: {
      propertyType:  row.property_type || '',
      sqft:          row.sq_ft || '',
      yearBuilt:     row.year_built || '',
      town:          row.town || '',
      // Mirrored from get-property-info (source: gsheet) so Tile / other
      // components can read them without an extra per-unit fetch.
      washer:        !!row.washer,
      dryer:         !!row.dryer,
      dishwasher:    !!row.dishwasher,
      gas:           !!row.gas,
      freeze_warning: !!row.freeze_warning,
      sump_pump:     !!row.sump_pump,
      breaker_box:   row.breaker_box || '',
      ac_type:       row.ac_type || '',
      heat_type:     row.heat_type || '',
      pets_allowed:  row.pets_allowed || '',
      // Access (cached from Neo property-info-clean)
      door_code:     row.door_code || '',
      lockbox_code:  row.lockbox_code || '',
      alarm_code:    row.alarm_code || '',
      key_location:  row.key_location || '',
      // Appliance models + service records
      stove:                    row.stove || '',
      stove_replaced:           row.stove_replaced || '',
      stove_warranty:           row.stove_warranty || '',
      washer_replaced:          row.washer_replaced || '',
      washer_warranty:          row.washer_warranty || '',
      dryer_replaced:           row.dryer_replaced || '',
      dryer_warranty:           row.dryer_warranty || '',
      dishwasher_replaced:      row.dishwasher_replaced || '',
      dishwasher_warranty:      row.dishwasher_warranty || '',
      fridge_replaced:          row.fridge_replaced || '',
      fridge_warranty:          row.fridge_warranty || '',
      // HVAC + water heater
      hvac_last_service:         row.hvac_last_service || '',
      water_heater_location:     row.water_heater_location || '',
      water_heater_type:         row.water_heater_type || '',
      water_heater_last_service: row.water_heater_last_service || '',
      water_shutoff:             row.water_shutoff || '',
      // Filters / connectivity
      filter_size:        row.filter_size || '',
      filter_size_2:      row.filter_size_2 || '',
      internet_provider:  row.internet_provider || '',
      // Plumbing
      toilet_flapper_style: row.toilet_flapper_style || '',
      toilet_seat_style:    row.toilet_seat_style || '',
      // Standards
      outlet_standard_color: row.outlet_standard_color || '',
      // Paint
      paint_interior:   row.paint_interior || '',
      paint_trim:       row.paint_trim || '',
      paint_brand:      row.paint_brand || '',
      paint_last_done:  row.paint_last_done || '',
      // Misc
      unit_notes:  row.unit_notes || '',
      portfolio:   row.portfolio || '',
      lead_paint:  row.lead_paint || '',
    },
  };
}

// ─── Format ISO date (2026-07-31) → M/D/YY ──────────────────────────────────

function formatDate(val) {
  if (!val) return '';
  const str = val.toString().trim();
  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(str)) return str;
  const match = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const [, y, m, d] = match;
    return `${parseInt(m)}/${parseInt(d)}/${y.slice(2)}`;
  }
  return str;
}

// ─── Group + substate derivation ─────────────────────────────────────────────

function deriveGroup(residents, nextResidents) {
  if (residents.length === 0) return 'unknown';
  const statuses = residents.map(r => r.status);
  if (statuses.some(s => s === 'month to month')) return 'month_to_month';
  const allLeaving  = statuses.every(s => s === 'leaving');
  const allRenewing = statuses.every(s => s === 'renewing');
  const hasLeaving  = statuses.some(s => s === 'leaving');
  const hasRenewing = statuses.some(s => s === 'renewing');
  if (allLeaving)  return nextResidents.length > 0 ? 'turnover_rented' : 'full_turnover';
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
    case 'full_turnover':       return 'Needs to be Rented';
    case 'turnover_rented':     return nextResidents.every(r => r.name) ? 'New tenant found, lease in progress' : 'Needs to be Rented';
    case 'renewed':             return 'Renewal signed';
    case 'renewing':            return residents.some(r => r.status === 'renewing' && r.leaseSigned) ? 'Renewal lease sent, not all signed' : 'Interested, lease not yet sent';
    case 'partial_turn':        return 'Partial turn - some staying, some leaving';
    case 'partial_turn_leased': return 'Partial turn - lease side done';
    case 'unknown':             return 'Waiting to hear back';
    case 'month_to_month':      return 'Month-to-month';
    default:                    return '';
  }
}
