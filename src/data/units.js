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

// ─── Seed data (fallback when no Google Sheets connection) ──────────────────
export const SEED_UNITS = seedUnits;
