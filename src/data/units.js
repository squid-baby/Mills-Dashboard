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

// Light mode palette — pastels with accessible dark text (all ≥ 4.5:1 contrast)
export const GC_LIGHT = {
  renewed:             { label: "Renewed",              color: "#0d7a50", bg: "#bdfde6", text: "#065238", icon: "✓" },
  renewing:            { label: "Renewing",             color: "#4a6b00", bg: "#f4fdbd", text: "#354d00", icon: "↻" },
  partial_turn:        { label: "Partial Turn",         color: "#3d2db5", bg: "#c6bdfd", text: "#2a1d80", icon: "◐" },
  partial_turn_leased: { label: "Partial (Lease Done)", color: "#5140c0", bg: "#ddd6fe", text: "#3b2e90", icon: "◑" },
  unknown:             { label: "Unknown",              color: "#4a4a58", bg: "#e8e9ec", text: "#383845", icon: "?" },
  full_turnover:       { label: "Full Turnover",        color: "#9e1a52", bg: "#fdbdd4", text: "#7a1040", icon: "⟳" },
  turnover_rented:     { label: "Turnover (Rented)",    color: "#7a4800", bg: "#fddb82", text: "#5e3700", icon: "★" },
  month_to_month:      { label: "Month-to-Month",       color: "#4a4a58", bg: "#ebebee", text: "#383845", icon: "∞" },
};

export const getGC = (theme) => theme === 'light' ? GC_LIGHT : GC;

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
