/**
 * turnoverOptions.js — option arrays for the Turnover tab + Worklist.
 *
 * To add/remove options, edit the array — no other code changes needed.
 *
 * Sourced from the original Nathan-style HTML form. CONDITION_GROUPS drives
 * both the Edit form's grouped condition assessments and the Overview's
 * Tasks-by-section grouping.
 */

// To add/remove options, edit this array — no other code changes needed.
export const BLIND_HEIGHTS = ['42"', '64"'];

// To add/remove options, edit this array — no other code changes needed.
export const BULB_TYPES = ['A19 E26 (standard)', 'A15 E26 (appliance)', 'B11 E12 (candelabra)', 'BR30 (flood)', 'PAR38 (outdoor)', 'GU10 (track)', 'T8 fluorescent', 'Other'];

// To add/remove options, edit this array — no other code changes needed.
export const BULB_TEMPS = ['2700K (warm)', '3000K', '4000K (cool)', '5000K (daylight)'];

// To add/remove options, edit this array — no other code changes needed.
export const STOVE_TYPES = ['Drip pan — 6" small', 'Drip pan — 8" large', 'Cast iron grate', 'Burner coil — small', 'Burner coil — large'];

// To add/remove options, edit this array — no other code changes needed.
export const BOWL_SHAPES = ['Round', 'Elongated'];

// To add/remove options, edit this array — no other code changes needed.
export const OUTLET_TYPES = ['Single outlet', 'Duplex outlet', 'GFCI outlet', 'Single switch', 'Double switch', 'Triple switch', 'Decora outlet', 'Decora switch', 'USB outlet', 'Blank plate'];

// To add/remove options, edit this array — no other code changes needed.
// Mirrors `outlet_standard_color` options in src/config/propertyOptions.js — keep aligned.
export const OUTLET_COLORS = ['White', 'Ivory', 'Almond', 'Light almond', 'Gray'];

// To add/remove options, edit this array — no other code changes needed.
export const OUTLET_GANGS = ['1-gang', '2-gang', '3-gang', '4-gang'];

// To add/remove options, edit this array — no other code changes needed.
export const DETECTOR_TYPES = ['Smoke only', 'CO only', 'Combo'];

// To add/remove options, edit this array — no other code changes needed.
export const KEY_TYPES = ['Door key', 'Mailbox key', 'Fob', 'Garage clicker', 'Storage key'];

// To add/remove options, edit this array — no other code changes needed.
export const PAINT_LOCATIONS = ['Living room', 'Dining room', 'Kitchen', 'Primary bedroom', 'Bedroom 2', 'Bedroom 3', 'Bathroom', 'Hallway', 'Stairwell', 'Laundry room', 'Entryway / foyer', 'All rooms', 'Other'];

// To add/remove options, edit this array — no other code changes needed.
export const PAINT_COLORS = ['White', 'Asiago', 'Other'];

// To add/remove options, edit this array — no other code changes needed.
export const PAINT_FINISHES = ['Semi-gloss', 'Eggshell', 'Matte'];

// To add/remove sections or items, edit this array — no other code changes needed.
// Drives both the Edit form's condition-assessment grouping and the Overview Tasks-by-section grouping.
export const CONDITION_GROUPS = [
  { section: 'Walls & ceilings',         items: ['Ceilings', 'Trim & baseboards'] },
  { section: 'Flooring',                 items: ['Hardwood / LVP', 'Tile', 'Carpet', 'Thresholds & transitions'] },
  { section: 'Doors',                    items: ['Interior doors', 'Exterior doors', 'Closet doors & tracks', 'Door weatherstripping', 'Sliding door & track'] },
  { section: 'Door & cabinet hardware',  items: ['Interior door knobs / levers', 'Deadbolts & exterior locks', 'Cabinet doors & hinges', 'Cabinet knobs & pulls', 'Drawer slides'] },
  { section: 'Kitchen',                  items: ['Cabinets (boxes & finish)', 'Countertops', 'Sink & faucet', 'Stove / range', 'Range hood & filter', 'Microwave', 'Refrigerator', 'Dishwasher'] },
  { section: 'Bathroom(s)',              items: ['Vanity & cabinet', 'Sink & faucet', 'Toilet', 'Tub / shower surround', 'Shower door / rod', 'Exhaust fan', 'Caulk & grout'] },
  { section: 'Lighting & electrical',    items: ['Ceiling fixtures', 'Ceiling fan(s)', 'Recessed lights', 'Under-cabinet lights', 'GFCI outlets (kitchen / bath)'] },
  { section: 'HVAC & utilities',         items: ['Thermostat', 'HVAC unit / air handler', 'Supply & return vents', 'Water heater', 'Washer hookup', 'Dryer hookup / vent'] },
  { section: 'Windows',                  items: ['Window sashes & glass', 'Window screens', 'Window locks & hardware'] },
  { section: 'Exterior / common',        items: ['Exterior sconces / porch light', 'Mailbox', 'Hose bib', 'Exterior outlets (GFCI)', 'Deck / porch / patio', 'Steps & railing', 'Parking area / carport', 'Shed / storage'] },
];

// To add/remove options, edit this array — no other code changes needed.
export const OVERALL_CONDITIONS = [
  { key: 'up_to_date', label: 'Up to date', desc: 'Move-in ready',      bg: '#EAF3DE', border: '#639922', color: '#3B6D11' },
  { key: 'needs_love', label: 'Needs love', desc: 'Work list exists',   bg: '#FAEEDA', border: '#BA7517', color: '#854F0B' },
  { key: 'at_risk',    label: 'At risk',    desc: 'Deferred piling up', bg: '#FCEBEB', border: '#E24B4A', color: '#A32D2D' },
];

// Helper: which CONDITION_GROUPS section a given item belongs to (by item label).
// Used by Overview to group `condition` rows under their original section.
export function sectionForConditionItem(itemLabel) {
  for (const g of CONDITION_GROUPS) {
    if (g.items.includes(itemLabel)) return g.section;
  }
  return 'Other';
}

// Display label per inspection_items.category.
export const CATEGORY_LABELS = {
  blinds: 'Blinds',
  bulbs: 'Bulbs',
  stove_parts: 'Stove parts',
  toilet_seats: 'Toilet seats',
  outlets: 'Outlets / switches',
  detectors: 'Smoke / CO',
  keys: 'Keys / fobs',
  custom: 'Other',
  paint: 'Paint',
  condition: 'Inspection',
};

// One-line summary of an inspection_items row for the Overview / Worklist UIs.
// Pure function — same input always renders the same string.
export function summarizeRow(row) {
  const p = row.payload || {};
  switch (row.category) {
    case 'blinds':       return `${p.qty || 1}× Blinds ${p.height || p.drop || ''}`;
    case 'bulbs':        return `${p.qty || 1}× ${p.type || 'Bulb'}${p.temp ? ` — ${p.temp}` : ''}`;
    case 'stove_parts':  return `${p.qty || 1}× ${p.type || 'Stove part'}${p.brand ? ` (${p.brand})` : ''}`;
    case 'toilet_seats': return `${p.qty || 1}× Toilet seat — ${p.shape || ''}`;
    case 'outlets':      return `${p.qty || 1}× ${p.type || ''}${p.color ? ` ${p.color}` : ''}${p.gang ? ` ${p.gang}` : ''}`;
    case 'detectors':    return `${p.qty || 1}× ${p.type || 'Detector'}`;
    case 'keys':         return `${p.type || 'Key'} — returned ${p.returned ?? 0}, missing ${p.missing ?? 0}`;
    case 'custom':       return `${p.qty || 1}× ${p.name || '(unnamed)'}${p.spec ? ` — ${p.spec}` : ''}`;
    case 'paint': {
      const color = p.color === 'Other' ? (p.customColor || 'Other') : (p.color || '');
      return `${p.location || ''}${color ? ` — ${color}` : ''}${p.finish ? ` (${p.finish})` : ''}`;
    }
    case 'condition':    return `${p.item || ''}${p.condition ? ` — ${p.condition}` : ''}`;
    default:             return JSON.stringify(p);
  }
}

// Stable shopping-list key — rolls multiple matching rows into one row with summed qty.
// e.g. 3× "Blinds 23\" × 36\"" + 2× "Blinds 23\" × 36\"" → 5× "Blinds 23\" × 36\""
// Returns the same string regardless of qty / address / done state.
export function shoppingKey(row) {
  const p = row.payload || {};
  switch (row.category) {
    case 'blinds':       return `blinds|${p.width || ''}|${p.drop || ''}`;
    case 'bulbs':        return `bulbs|${p.type || ''}|${p.temp || ''}`;
    case 'stove_parts':  return `stove_parts|${p.type || ''}|${p.brand || ''}`;
    case 'toilet_seats': return `toilet_seats|${p.shape || ''}`;
    case 'outlets':      return `outlets|${p.type || ''}|${p.color || ''}|${p.gang || ''}`;
    case 'detectors':    return `detectors|${p.type || ''}`;
    case 'keys':         return `keys|${p.type || ''}`;
    case 'custom':       return `custom|${p.name || ''}|${p.spec || ''}`;
    default:             return `${row.category}|${JSON.stringify(p)}`;
  }
}
