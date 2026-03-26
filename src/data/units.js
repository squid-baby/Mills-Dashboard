import seedUnits from './units-seed.json';

// ─── Status group config ────────────────────────────────────────────────────
export const GC = {
  renewed:             { label: "Renewed",              color: "#22c55e", bg: "#052e16", text: "#bbf7d0", icon: "✓" },
  renewing:            { label: "Renewing",             color: "#4ade80", bg: "#14532d", text: "#bbf7d0", icon: "↻" },
  partial_turn:        { label: "Partial Turn",         color: "#3b82f6", bg: "#172554", text: "#bfdbfe", icon: "◐" },
  partial_turn_leased: { label: "Partial (Lease Done)", color: "#93c5fd", bg: "#1e3a5f", text: "#dbeafe", icon: "◑" },
  unknown:             { label: "Unknown",              color: "#a1a1aa", bg: "#27272a", text: "#d4d4d8", icon: "?" },
  full_turnover:       { label: "Full Turnover",        color: "#f97316", bg: "#431407", text: "#fed7aa", icon: "⟳" },
  turnover_rented:     { label: "Turnover (Rented)",    color: "#a78bfa", bg: "#2e1065", text: "#ddd6fe", icon: "★" },
  month_to_month:      { label: "Month-to-Month",       color: "#78716c", bg: "#1c1917", text: "#d6d3d1", icon: "∞" },
};

// Amanda's priority: turnovers first, unknowns next, renewals last
export const PRIO = [
  'full_turnover',
  'turnover_rented',
  'unknown',
  'partial_turn',
  'partial_turn_leased',
  'renewing',
  'renewed',
  'month_to_month',
];

export const SORT_OPTS = [
  { key: "date",     label: "By Date" },
  { key: "area",     label: "By Area" },
  { key: "owner",    label: "By Owner" },
  { key: "status",   label: "By Status" },
  { key: "priority", label: "By Priority" },
];

// ─── Date helpers ───────────────────────────────────────────────────────────
export function parseDate(d) {
  if (!d) return new Date(2099, 0, 1);
  const p = d.split("/").map(Number);
  return new Date(2000 + (p[2] < 100 ? p[2] : p[2] - 2000), p[0] - 1, p[1]);
}

export function fmtMonth(d) {
  return parseDate(d).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

export function daysUntil(d) {
  return Math.ceil((parseDate(d) - new Date()) / 864e5);
}

// ─── Property Info field definitions ─────────────────────────────────────────
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
    id: 'appliances',
    label: 'Appliances',
    pinned: false,
    source: 'mixed',
    fields: [
      { key: 'washer',               label: 'Washer',               source: 'sheet' },
      { key: 'dryer',                label: 'Dryer',                source: 'sheet' },
      { key: 'dishwasher',           label: 'Dishwasher',           source: 'sheet' },
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
    source: 'mixed',
    fields: [
      { key: 'acType',                    label: 'AC type',                 source: 'sheet' },
      { key: 'heatType',                  label: 'Heat type',               source: 'sheet' },
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
    source: 'mixed',
    fields: [
      { key: 'breakerBox',        label: 'Breaker box',       source: 'sheet' },
      { key: 'water_shutoff',     label: 'Water shutoff',     source: 'gsheet' },
      { key: 'filter_size',        label: 'Filter #1',          source: 'gsheet' },
      { key: 'filter_size_2',      label: 'Filter #2',          source: 'gsheet' },
      { key: 'internet_provider', label: 'Internet provider', source: 'gsheet' },
      { key: 'gas',               label: 'Gas',               source: 'sheet' },
      { key: 'freezeWarning',     label: 'Freeze warning',    source: 'sheet' },
      { key: 'sumpPump',          label: 'Sump pump',         source: 'sheet' },
      { key: 'petsAllowed',       label: 'Pets allowed',      source: 'sheet' },
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
      { key: 'paint_interior',  label: 'Interior color', source: 'gsheet' },
      { key: 'paint_trim',      label: 'Trim color',     source: 'gsheet' },
      { key: 'paint_brand',     label: 'Paint brand',    source: 'gsheet' },
      { key: 'paint_last_done', label: 'Last painted',   source: 'gsheet', type: 'date' },
    ],
  },
];

// ─── Alert / flagging logic ──────────────────────────────────────────────────
export function getAlerts(unit) {
  const alerts = [];
  const days = daysUntil(unit.leaseEnd);
  const now = new Date();
  const leaseDate = parseDate(unit.leaseEnd);
  const leaseYear = leaseDate.getFullYear();
  const isResolved = ['renewed', 'turnover_rented', 'month_to_month'].includes(unit.group);

  // 1. "4+B Unrented" — 4+ bed, past Nov 1 (year before lease ends) or Jan 1 (lease end year)
  if (unit.beds >= 4 && !isResolved) {
    const nov1 = new Date(leaseYear - 1, 10, 1);
    const jan1 = new Date(leaseYear, 0, 1);
    if (now >= nov1) {
      alerts.push({ label: '4+B Unrented', severity: now >= jan1 ? 'critical' : 'warning' });
    }
  }

  // 2. "Needs Attention" — lease ended 30+ days ago and still not resolved
  if (!isResolved && days <= -30) {
    alerts.push({ label: 'Needs Attention', severity: 'warning' });
  }

  // 3. "OVERDUE" — lease ended (or within 30 days) and not resolved
  if (!isResolved && days <= 0 && days > -30) {
    alerts.push({ label: 'OVERDUE', severity: 'critical' });
  }

  // 4. Existing urgent: within 30 days of lease end, not resolved
  if (!isResolved && days > 0 && days <= 30) {
    alerts.push({ label: days + 'd', severity: 'critical' });
  }

  // 5. "60 Day" — within 60 days of lease end, no renewal or new lease
  if (!isResolved && days > 30 && days <= 60) {
    alerts.push({ label: '60 Day', severity: 'warning' });
  }

  return alerts;
}

// ─── Seed data (fallback when no Google Sheets connection) ──────────────────
export const SEED_UNITS = seedUnits;
