/**
 * columns.js — Centralized Google Sheet ↔ field key mapping
 *
 * HEADER_TO_FIELD: sheet column header → dashboard field key (read direction)
 *   Used by get-property-info.js to parse incoming sheet data.
 *   Multiple header aliases may map to the same field key (for legacy column names).
 *
 * FIELD_TO_HEADER: dashboard field key → canonical sheet column header (write direction)
 *   Used by update-property-info.js to locate the target column when saving.
 *   One canonical header per field key — no aliases.
 */

// ─── Read direction: sheet header → field key ─────────────────────────────────
export const HEADER_TO_FIELD = {
  // Identity
  'Property':                   'address',

  // Access
  'Door Codes':                 'door_code',
  'Door Code':                  'door_code',
  'Lock Box / Key #':           'lockbox_code',
  'Lock Box and Key Number':    'lockbox_code',
  'Lockbox Code':               'lockbox_code',
  'Alarm Code':                 'alarm_code',
  'Key Location':               'key_location',

  // Property attributes (read-only reference — sourced from Numbers Sheet 2 via migration)
  'Bedrooms':                   'beds',
  'Bathrooms':                  'baths',
  'Town':                       'town',
  'Property Type':              'property_type',
  'Sq Ft':                      'sq_ft',
  'Included Utilities':         'utilities',
  'Owner':                      'owner_name',
  'Area':                       'area',

  // Appliances — presence (boolean: YES/NO in sheet)
  'Washer':                     'washer',
  'Dryer':                      'dryer',
  'Dishwasher':                 'dishwasher',
  'Stove':                      'stove',
  'Stove Replaced':             'stove_replaced',
  'Stove Warranty':             'stove_warranty',

  // Appliance service records
  'Washer Replaced':            'washer_replaced',
  'Washer Warranty':            'washer_warranty',
  'Dryer Replaced':             'dryer_replaced',
  'Dryer Warranty':             'dryer_warranty',
  'Dishwasher Replaced':        'dishwasher_replaced',
  'Dishwasher Warranty':        'dishwasher_warranty',
  'Fridge Replaced':            'fridge_replaced',
  'Fridge Warranty':            'fridge_warranty',

  // HVAC & Water Heater
  'AC Type':                    'ac_type',
  'Heat Type':                  'heat_type',
  'HVAC Last Service':          'hvac_last_service',
  'Water Heater Location':      'water_heater_location',
  'Hot water heater':           'water_heater_location',
  'Water Heater Type':          'water_heater_type',
  'Water Heater Last Service':  'water_heater_last_service',

  // Utilities & Maintenance
  'Gas':                        'gas',
  'Freeze Warning':             'freeze_warning',
  'Sump Pump':                  'sump_pump',
  'Breaker Box':                'breaker_box',
  'Water Shutoff':              'water_shutoff',
  'Filter #1':                  'filter_size',
  'Filter #2':                  'filter_size_2',
  'Internet Provider':          'internet_provider',
  'Pets Allowed':               'pets_allowed',
  'Year Built':                 'year_built',

  // Plumbing
  'Toilet Flapper Style':       'toilet_flapper_style',
  'Toilet Seat Style':          'toilet_seat_style',

  // Paint
  'Paint Interior':             'paint_interior',
  'Paint Trim':                 'paint_trim',
  'Paint Brand':                'paint_brand',
  'Paint Last Done':            'paint_last_done',

  // Notes
  'Notes':                      'notes',
  'notes':                      'notes',
  'Sheet Notes':                'sheet_notes',
};

// ─── Write direction: field key → canonical sheet column header ───────────────
export const FIELD_TO_HEADER = {
  // Identity
  'address':                    'Property',

  // Access
  'door_code':                  'Door Code',
  'lockbox_code':               'Lockbox Code',
  'alarm_code':                 'Alarm Code',
  'key_location':               'Key Location',

  // Property attributes
  'beds':                       'Bedrooms',
  'baths':                      'Bathrooms',
  'town':                       'Town',
  'property_type':              'Property Type',
  'sq_ft':                      'Sq Ft',
  'utilities':                  'Included Utilities',
  'owner_name':                 'Owner',
  'area':                       'Area',

  // Appliances — presence
  'washer':                     'Washer',
  'dryer':                      'Dryer',
  'dishwasher':                 'Dishwasher',
  'stove':                      'Stove',
  'stove_replaced':             'Stove Replaced',
  'stove_warranty':             'Stove Warranty',

  // Appliance service records
  'washer_replaced':            'Washer Replaced',
  'washer_warranty':            'Washer Warranty',
  'dryer_replaced':             'Dryer Replaced',
  'dryer_warranty':             'Dryer Warranty',
  'dishwasher_replaced':        'Dishwasher Replaced',
  'dishwasher_warranty':        'Dishwasher Warranty',
  'fridge_replaced':            'Fridge Replaced',
  'fridge_warranty':            'Fridge Warranty',

  // HVAC & Water Heater
  'ac_type':                    'AC Type',
  'heat_type':                  'Heat Type',
  'hvac_last_service':          'HVAC Last Service',
  'water_heater_location':      'Water Heater Location',
  'water_heater_type':          'Water Heater Type',
  'water_heater_last_service':  'Water Heater Last Service',

  // Utilities & Maintenance
  'gas':                        'Gas',
  'freeze_warning':             'Freeze Warning',
  'sump_pump':                  'Sump Pump',
  'breaker_box':                'Breaker Box',
  'water_shutoff':              'Water Shutoff',
  'filter_size':                'Filter #1',
  'filter_size_2':              'Filter #2',
  'internet_provider':          'Internet Provider',
  'pets_allowed':               'Pets Allowed',
  'year_built':                 'Year Built',

  // Plumbing
  'toilet_flapper_style':       'Toilet Flapper Style',
  'toilet_seat_style':          'Toilet Seat Style',

  // Paint
  'paint_interior':             'Paint Interior',
  'paint_trim':                 'Paint Trim',
  'paint_brand':                'Paint Brand',
  'paint_last_done':            'Paint Last Done',

  // Notes
  'notes':                      'Notes',
  'sheet_notes':                'Sheet Notes',
};

// New Google Sheet columns that the migration script must append if not present
export const NEW_SHEET_COLUMNS = [
  'Year Built',
  'Sump Pump',
  'Breaker Box',
  'AC Type',
  'Heat Type',
  'Pets Allowed',
  'Sheet Notes',
];

// ─── Google Sheet tab names (single source of truth) ────────────────────────
export const SHEET_TABS = {
  PROPERTY_INFO: 'property-info-clean',
  HISTORY: 'Property Info History',
  INSPECTIONS: 'Turnover Inspections',
};
