/**
 * inspectionItems.js — bidirectional mapping between the legacy `items` blob
 * (used by TurnoverTab.jsx) and normalized `inspection_items` rows.
 *
 * Used by:
 *   - netlify/functions/save-inspection.js  (write side: items → rows)
 *   - scripts/migrate-inspections-sheet-to-supabase.mjs  (write side, with phantom filtering)
 *
 * Phase 1A only writes inspection_items; reads continue to use items_json
 * stored on the inspections row. Phase 1C will switch reads over and drop
 * items_json entirely.
 *
 * Item shape conventions:
 *   { category, item_type, payload }
 *   - category: 'blinds' | 'bulbs' | 'stove_parts' | 'toilet_seats' | 'outlets'
 *               | 'detectors' | 'keys' | 'paint' | 'condition' | 'custom'
 *   - item_type: 'purchase' (orderable goods) | 'work' (tasks done on-site)
 *   - payload: jsonb, fields specific to the category
 */

// ─── Phantom-default seeds ───────────────────────────────────────────────────
//
// TurnoverTab seeds these arrays with one default row each on mount. If an
// inspector saves without touching them, the seed gets persisted as a "phantom"
// row. These constants document the seed shapes so we can detect + skip them
// during backfill (rule #5: phantom-default detection lives as a pure function
// you can read in isolation).

const PHANTOM_SEEDS = {
  blinds:       [{ width: '23"', drop: '36"', qty: 1 }],
  bulbs:        [{ type: 'A19 E26 (standard)', temp: '2700K (warm)', qty: 1 }],
  stove_parts:  [{ type: 'Drip pan — 6" small', brand: '', qty: 1 }],
  toilet_seats: [{ shape: 'Round', qty: 1 }],
  outlets:      [{ type: 'Single outlet', color: 'White', gang: '1-gang', qty: 1 }],
};

/**
 * isPhantomRow — pure function. Returns true if `row` is structurally identical
 * to the seeded default for `category`. Categories not seeded (paint, condition,
 * detectors, keys, custom) always return false — those rows are user-entered.
 */
export function isPhantomRow(row, category) {
  const seeds = PHANTOM_SEEDS[category];
  if (!seeds) return false;
  if (!row || typeof row !== 'object') return false;
  return seeds.some(seed => {
    const seedKeys = Object.keys(seed);
    if (seedKeys.length !== Object.keys(row).length) return false;
    return seedKeys.every(k => row[k] === seed[k]);
  });
}

// ─── Items blob → inspection_items rows ──────────────────────────────────────

/**
 * itemsToRows — flatten a TurnoverTab `items` blob into normalized rows.
 *
 * @param {object} items   — the legacy blob from TurnoverTab state
 * @param {string} address — unit_address (denormalized onto each row)
 * @param {object} opts
 * @param {boolean} opts.skipPhantoms — backfill passes true; live save passes false
 * @returns {Array<{category, item_type, payload, unit_address}>}
 */
export function itemsToRows(items, address, { skipPhantoms = false } = {}) {
  const rows = [];
  if (!items || typeof items !== 'object') return rows;

  const pushArray = (arr, category, itemType) => {
    if (!Array.isArray(arr)) return;
    for (const entry of arr) {
      if (!entry || typeof entry !== 'object') continue;
      if (skipPhantoms && isPhantomRow(entry, category)) continue;
      rows.push({
        unit_address: address,
        category,
        item_type: itemType,
        payload: entry,
      });
    }
  };

  pushArray(items.blinds,       'blinds',       'purchase');
  pushArray(items.bulbs,        'bulbs',        'purchase');
  pushArray(items.stoveParts,   'stove_parts',  'purchase');
  pushArray(items.toiletSeats,  'toilet_seats', 'purchase');
  pushArray(items.outlets,      'outlets',      'purchase');
  pushArray(items.keys,         'keys',         'purchase');
  pushArray(items.customItems,  'custom',       'purchase');
  pushArray(items.paintRows,    'paint',        'work');

  // detectors is a single object, not an array
  if (items.detectors && typeof items.detectors === 'object' && Number(items.detectors.qty) > 0) {
    rows.push({
      unit_address: address,
      category: 'detectors',
      item_type: 'purchase',
      payload: items.detectors,
    });
  }

  // conditions is a flat object keyed by item label; flatten to one row per item
  // that actually carries a condition or a note (skip untouched entries)
  if (items.conditions && typeof items.conditions === 'object') {
    for (const [label, val] of Object.entries(items.conditions)) {
      if (!val || typeof val !== 'object') continue;
      const condition = val.condition || null;
      const notes = val.notes || '';
      if (!condition && !notes.trim()) continue;
      rows.push({
        unit_address: address,
        category: 'condition',
        item_type: 'work',
        payload: { item: label, condition, notes },
      });
    }
  }

  return rows;
}
