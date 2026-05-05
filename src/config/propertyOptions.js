/**
 * propertyOptions.js — schema for the Property tab.
 *
 * To add/remove fields, edit `PROPERTY_INFO_FIELDS` below — no other code
 * changes needed for the tab to render the field. Each new field that should
 * round-trip to the Google Sheet ALSO needs:
 *   1. A `HEADER_TO_FIELD` + `FIELD_TO_HEADER` entry in `src/config/columns.js`.
 *   2. A column header in the `property-info-clean` Google Sheet tab (case-
 *      insensitive match, position-independent).
 *   3. A SQL migration adding the column to Supabase `units` if you want
 *      sync-from-neo to cache it for tile/unit reads.
 *
 * Field shape:
 *   - String: `'door_code'` — falls back to a derived label and `source: 'gsheet'`.
 *   - Object: `{ key, label, source, type?, options?: string[] }`
 *     - `source: 'gsheet'` → live read/write via `/api/get-property-info` + `/api/update-property-info`.
 *     - `type: 'date'` → renders a date input in Edit state.
 *     - `options: [...]` → renders a dropdown in Edit state.
 */

export const PROPERTY_INFO_FIELDS = [
  {
    id: 'access',
    label: 'Access',
    pinned: false,
    source: 'gsheet',
    fields: ['door_code', 'lockbox_code', 'alarm_code', 'key_location'],
    sensitive: ['door_code', 'alarm_code'],
  },
  {
    id: 'specs',
    label: 'Standards',
    pinned: false,
    source: 'gsheet',
    fields: [
      { key: 'outlet_standard_color', label: 'Outlet standard color', source: 'gsheet', options: ['White', 'Ivory', 'Almond', 'Light almond', 'Gray'] },
    ],
  },
  {
    id: 'appliances',
    label: 'Appliances',
    pinned: false,
    source: 'gsheet',
    fields: [
      { key: 'washer',               label: 'Washer',               source: 'gsheet' },
      { key: 'dryer',                label: 'Dryer',                source: 'gsheet' },
      { key: 'dishwasher',           label: 'Dishwasher',           source: 'gsheet' },
      { key: 'stove',                label: 'Stove',                source: 'gsheet' },
      { key: 'stove_replaced',       label: 'Stove replaced',       source: 'gsheet', type: 'date' },
      { key: 'stove_warranty',       label: 'Stove warranty',       source: 'gsheet', options: ['3yr', '5yr', 'none'] },
      { key: 'washer_replaced',      label: 'Washer replaced',      source: 'gsheet', type: 'date' },
      { key: 'washer_warranty',      label: 'Washer warranty',      source: 'gsheet', options: ['3yr', '5yr', 'none'] },
      { key: 'dryer_replaced',       label: 'Dryer replaced',       source: 'gsheet', type: 'date' },
      { key: 'dryer_warranty',       label: 'Dryer warranty',       source: 'gsheet', options: ['3yr', '5yr', 'none'] },
      { key: 'dishwasher_replaced',  label: 'Dishwasher replaced',  source: 'gsheet', type: 'date' },
      { key: 'dishwasher_warranty',  label: 'Dishwasher warranty',  source: 'gsheet', options: ['3yr', '5yr', 'none'] },
      { key: 'fridge_replaced',      label: 'Fridge replaced',      source: 'gsheet', type: 'date' },
      { key: 'fridge_warranty',      label: 'Fridge warranty',      source: 'gsheet', options: ['3yr', '5yr', 'none'] },
    ],
  },
  {
    id: 'hvac_water',
    label: 'HVAC & Water Heater',
    pinned: false,
    source: 'gsheet',
    fields: [
      { key: 'ac_type',                   label: 'AC type',                 source: 'gsheet' },
      { key: 'heat_type',                 label: 'Heat type',               source: 'gsheet' },
      { key: 'hvac_last_service',         label: 'HVAC last service',       source: 'gsheet', type: 'date' },
      { key: 'water_heater_location',     label: 'Water heater location',   source: 'gsheet' },
      { key: 'water_heater_type',         label: 'Water heater type',       source: 'gsheet', options: ['Gas', 'Electric', 'On demand'] },
      { key: 'water_heater_last_service', label: 'Water heater last service', source: 'gsheet', type: 'date' },
    ],
  },
  {
    id: 'utilities',
    label: 'Utilities & Maintenance',
    pinned: false,
    source: 'gsheet',
    fields: [
      { key: 'gas',               label: 'Gas',               source: 'gsheet' },
      { key: 'freeze_warning',    label: 'Freeze warning',    source: 'gsheet' },
      { key: 'sump_pump',         label: 'Sump pump',         source: 'gsheet' },
      { key: 'pets_allowed',      label: 'Pets allowed',      source: 'gsheet' },
      { key: 'year_built',        label: 'Year built',        source: 'gsheet' },
      { key: 'breaker_box',       label: 'Breaker box',       source: 'gsheet' },
      { key: 'water_shutoff',     label: 'Water shutoff',     source: 'gsheet' },
      { key: 'filter_size',       label: 'Filter #1',         source: 'gsheet' },
      { key: 'filter_size_2',     label: 'Filter #2',         source: 'gsheet' },
      { key: 'internet_provider', label: 'Internet provider', source: 'gsheet' },
      { key: 'sheet_notes',       label: 'Property notes',    source: 'gsheet' },
    ],
  },
  {
    id: 'plumbing',
    label: 'Plumbing',
    pinned: false,
    source: 'gsheet',
    fields: [
      { key: 'toilet_flapper_style', label: 'Toilet flapper style', source: 'gsheet' },
      { key: 'toilet_seat_style',    label: 'Toilet seat style',    source: 'gsheet' },
    ],
  },
  {
    id: 'paint',
    label: 'Paint',
    pinned: false,
    source: 'gsheet',
    fields: [
      { key: 'paint_interior',      label: 'Interior color',      source: 'gsheet' },
      { key: 'paint_trim',          label: 'Trim color',          source: 'gsheet' },
      { key: 'paint_exterior',      label: 'Exterior color',      source: 'gsheet' },
      { key: 'paint_trim_exterior', label: 'Exterior trim color', source: 'gsheet' },
      { key: 'paint_brand',         label: 'Paint brand',         source: 'gsheet' },
      { key: 'paint_last_done',     label: 'Last painted',        source: 'gsheet', type: 'date' },
    ],
  },
];
