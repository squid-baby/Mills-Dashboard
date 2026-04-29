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
export const BLIND_WIDTHS = ['23"', '24"', '27"', '29"', '30"', '31"', '34"', '35"', '36"', '46"', '48"', '58"', '60"', '64"', 'Custom'];

// To add/remove options, edit this array — no other code changes needed.
export const BLIND_DROPS = ['36"', '42"', '48"', '54"', '60"', '64"', '72"', '84"'];

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
