// ─── Task type config ───────────────────────────────────────────────────────

// Dark mode colors
export const TASK_COLORS = {
  move_out:  { label: 'Move Out',  color: '#f97316', bg: '#431407', text: '#fed7aa' },
  paint:     { label: 'Paint',     color: '#3b82f6', bg: '#172554', text: '#bfdbfe' },
  repair:    { label: 'Repair',    color: '#ef4444', bg: '#3b1010', text: '#fecaca' },
  clean:     { label: 'Clean',     color: '#14b8a6', bg: '#042f2e', text: '#99f6e4' },
  finalize:  { label: 'Finalize',  color: '#fbbf24', bg: '#422006', text: '#fde68a' },
  move_in:   { label: 'Move In',   color: '#22c55e', bg: '#052e16', text: '#bbf7d0' },
};

// Light mode colors
export const TASK_COLORS_LIGHT = {
  move_out:  { label: 'Move Out',  color: '#ea580c', bg: '#ffedd5', text: '#7c2d12' },
  paint:     { label: 'Paint',     color: '#2563eb', bg: '#dbeafe', text: '#1e3a8a' },
  repair:    { label: 'Repair',    color: '#dc2626', bg: '#fee2e2', text: '#7f1d1d' },
  clean:     { label: 'Clean',     color: '#0d9488', bg: '#ccfbf1', text: '#134e4a' },
  finalize:  { label: 'Finalize',  color: '#d97706', bg: '#fef3c7', text: '#78350f' },
  move_in:   { label: 'Move In',   color: '#16a34a', bg: '#dcfce7', text: '#14532d' },
};

export const getTaskColors = (theme) => theme === 'light' ? TASK_COLORS_LIGHT : TASK_COLORS;

export const TASK_TYPES = ['move_out', 'paint', 'repair', 'clean', 'finalize', 'move_in'];

export const STATUS_LABELS = {
  planned: 'Planned',
  in_progress: 'In Progress',
  done: 'Done',
};

// ─── Day names ──────────────────────────────────────────────────────────────

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_NAMES_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// ─── Date / slot helpers ────────────────────────────────────────────────────

/** Get Monday of the week containing `date` */
export function weekStart(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day; // shift to Monday
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Get all 7 days of the week starting from `monday` */
export function weekDays(monday) {
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    days.push(d);
  }
  return days;
}

/** Format a date as "Mon (5/26)" */
export function fmtDaySlot(date, slot) {
  const d = new Date(date);
  const day = DAY_NAMES[d.getDay()];
  const m = d.getMonth() + 1;
  const dd = d.getDate();
  return `${day} (${m}/${dd}) ${slot.toUpperCase()}`;
}

/** Format a date as "Mon 5/26" (for column headers) */
export function fmtDay(date) {
  const d = new Date(date);
  return `${DAY_NAMES[d.getDay()]} ${d.getMonth() + 1}/${d.getDate()}`;
}

/** Format date range label for header: "May 26 – Jun 1, 2026" */
export function fmtWeekRange(monday) {
  const sun = new Date(monday);
  sun.setDate(monday.getDate() + 6);
  const mStart = monday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const mEnd = sun.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${mStart} – ${mEnd}, ${sun.getFullYear()}`;
}

/** ISO date string "YYYY-MM-DD" from Date */
export function toISO(date) {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

/** Parse "YYYY-MM-DD" to Date (local time) */
export function parseISO(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// ─── Month helpers ─────────────────────────────────────────────────────────

/** Format date as "May 2026" */
export function fmtMonthYear(date) {
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

/** Format date as "Friday, May 29" */
export function fmtFullDay(date) {
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

/**
 * Build a 6×7 grid of dates for a month calendar (Mon-start).
 * Returns an array of 42 Date objects.
 */
export function monthGrid(year, month) {
  const first = new Date(year, month, 1);
  // Day of week for the 1st (shift so Mon=0)
  let startDay = first.getDay() - 1;
  if (startDay < 0) startDay = 6; // Sun → 6

  const grid = [];
  const base = new Date(year, month, 1 - startDay);
  for (let i = 0; i < 42; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    grid.push(d);
  }
  return grid;
}

// ─── Slot ↔ column math ────────────────────────────────────────────────────

/**
 * Convert a date + slot to a 0-based column index relative to a week start (Monday).
 * Mon AM = 0, Mon PM = 1, Tue AM = 2, ... Sun PM = 13.
 * Returns -1 if the date is outside the week.
 */
export function slotToCol(date, slot, mondayStart) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const ms = mondayStart.getTime();
  const diff = Math.round((d.getTime() - ms) / 86400000);
  if (diff < 0 || diff > 6) return -1;
  return diff * 2 + (slot === 'pm' ? 1 : 0);
}

/**
 * Given a task and a week's Monday, return { startCol, span } for rendering.
 * Clamps to the visible week (0–13). Returns null if task doesn't overlap the week.
 */
export function taskBarLayout(task, mondayStart) {
  const weekEnd = new Date(mondayStart);
  weekEnd.setDate(weekEnd.getDate() + 6);

  const tStart = parseISO(task.start_date);
  const tEnd = parseISO(task.end_date);

  // No overlap check
  if (tEnd < mondayStart || tStart > weekEnd) return null;

  // Clamp start/end to this week
  const clampedStart = tStart < mondayStart ? mondayStart : tStart;
  const clampedStartSlot = tStart < mondayStart ? 'am' : task.start_slot;
  const clampedEnd = tEnd > weekEnd ? weekEnd : tEnd;
  const clampedEndSlot = tEnd > weekEnd ? 'pm' : task.end_slot;

  const startCol = slotToCol(clampedStart, clampedStartSlot, mondayStart);
  const endCol = slotToCol(clampedEnd, clampedEndSlot, mondayStart);

  if (startCol < 0 || endCol < 0) return null;

  return { startCol, span: endCol - startCol + 1 };
}

/**
 * Assign vertical lanes to tasks to avoid visual overlap.
 * Returns a Map<taskId, laneIndex>.
 */
export function assignLanes(tasks, mondayStart) {
  const layouts = tasks
    .map(t => ({ task: t, layout: taskBarLayout(t, mondayStart) }))
    .filter(t => t.layout)
    .sort((a, b) => a.layout.startCol - b.layout.startCol || b.layout.span - a.layout.span);

  const lanes = []; // each lane = array of { endCol }
  const result = new Map();

  for (const { task, layout } of layouts) {
    let placed = false;
    for (let i = 0; i < lanes.length; i++) {
      const lastEnd = lanes[i][lanes[i].length - 1].endCol;
      if (layout.startCol > lastEnd) {
        lanes[i].push({ endCol: layout.startCol + layout.span - 1 });
        result.set(task.id, i);
        placed = true;
        break;
      }
    }
    if (!placed) {
      lanes.push([{ endCol: layout.startCol + layout.span - 1 }]);
      result.set(task.id, lanes.length - 1);
    }
  }

  return result;
}

// ─── Turnover-eligible groups ───────────────────────────────────────────────

export const TURNOVER_GROUPS = new Set([
  'full_turnover',
  'turnover_rented',
  'partial_turn',
  'partial_turn_leased',
]);
