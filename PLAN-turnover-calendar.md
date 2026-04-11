# Turnover Calendar Feature — Implementation Plan

## Context

During turnover season (May-August), Mills Rentals turns over up to 20 units in 5 days. Today the schedule lives on a whiteboard/paper. Nathan, Amanda, and Andrea plan the schedule, then Nathan calls crew to tell them where to go. The dashboard already has move-out dates, turnover notes, and unit status — but no way to visualize or plan the work calendar.

This feature adds a swimlane-style calendar view to the existing dashboard. Each day splits into AM (8-12) and PM (12-5). Work appears as color-coded bars spanning half-day slots. Three zoom levels: Month (overview), Week (primary), Day (detailed).

**User decisions captured:**
- Free text for crew names (no preset list)
- 6 task types: Move-out, Paint, Repair, Clean, Finalize, Move-in
- Auto-populate move-out dates from existing `leaseEnd` data
- Move-in dates entered manually
- This is both a planning tool and a display
- All crew have smartphones — mobile access matters

## Build custom, not a library

The AM/PM swimlane layout doesn't match any calendar library's model (they optimize for hour-based time grids). The app uses all inline styles with zero CSS frameworks — a library would fight the existing patterns. The half-day granularity (2 slots per day) makes layout math trivial. Build custom.

---

## Phase A: Data Model

### New Supabase tables (add to `supabase/schema.sql`)

**`calendar_tasks`**
```sql
create table if not exists calendar_tasks (
  id           uuid primary key default uuid_generate_v4(),
  unit_id      uuid not null references units(id) on delete cascade,
  task_type    text not null check (task_type in ('move_out','paint','repair','clean','finalize','move_in')),
  start_date   date not null,
  start_slot   text not null check (start_slot in ('am','pm')),
  end_date     date not null,
  end_slot     text not null check (end_slot in ('am','pm')),
  crew         text default '',       -- free text: "Fernando, Lalo + Eric"
  notes        text,
  status       text default 'planned' check (status in ('planned','in_progress','done')),
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);
```

Key: `crew` is free text, not FKs. Matches user preference for speed — just type names. `start_date`+`start_slot` / `end_date`+`end_slot` pairs model the half-day granularity exactly.

**Add `move_in_date` to `next_residents`:**
```sql
alter table next_residents add column move_in_date date;
```

**Indexes + RLS + trigger** — follow existing patterns in schema.sql.

### New file: `src/data/calendar.js`

Task type color config (mirrors the `GC` pattern in `src/data/units.js`):

| Task Type | Color | BG |
|-----------|-------|----|
| move_out  | #f97316 (orange) | #431407 |
| paint     | #3b82f6 (blue) | #172554 |
| repair    | #ef4444 (red) | #3b1010 |
| clean     | #22c55e (green) | #052e16 |
| finalize  | #a78bfa (purple) | #2e1065 |
| move_in   | #fbbf24 (yellow) | #422006 |

Plus slot math helpers: `slotsInRange(startDate, startSlot, endDate, endSlot)`, `slotToColumn(date, slot, weekStart)`, `dateFromColumn(col, weekStart)`.

---

## Phase B: API Layer

### 3 new Netlify Functions (in `netlify/functions/`)

**`get-calendar-tasks.js`** — GET `/api/get-calendar-tasks?start=2026-05-25&end=2026-06-07`
- Query `calendar_tasks` where date range overlaps the requested window
- Join unit address for display (or let client join from existing units state)
- Return JSON array

**`save-calendar-task.js`** — POST `/api/save-calendar-task`
- Upsert: if `id` present -> update, else -> insert
- Validate task_type, slots, date ordering
- Return saved task with generated ID

**`delete-calendar-task.js`** — POST `/api/delete-calendar-task`
- Accept `{ id }`, delete, return `{ success: true }`

All use Supabase service_role key server-side, matching existing `get-units.js` pattern.

---

## Phase C: View Switching in App.jsx

**Modify `src/App.jsx`:**

Add state:
```js
const [view, setView] = useState('dashboard'); // 'dashboard' | 'calendar'
const [calendarTasks, setCalendarTasks] = useState([]);
```

Conditional render:
```jsx
{view === 'dashboard' ? (
  // existing header + grid + detail panel code
) : (
  <CalendarView
    units={units}
    tasks={calendarTasks}
    setTasks={setCalendarTasks}
    onBack={() => setView('dashboard')}
    onViewUnit={(id) => { setView('dashboard'); setSelectedId(id); }}
  />
)}
```

Add calendar button to dashboard header (top-right, next to search):
```jsx
<button onClick={() => setView('calendar')} style={/* pill style */}>
  Calendar
</button>
```

---

## Phase D: Calendar UI Components

### New files under `src/components/calendar/`

**`CalendarView.jsx`** — Container
- Internal state: `zoom` (month/week/day), `focusDate`, `selectedTaskId`, `showCreateModal`
- Fetches tasks for visible date range via `useEffect` on mount / nav changes
- Renders CalendarHeader + the active zoom view + TaskDetailPanel overlay

**`CalendarHeader.jsx`** — Top bar
- Prev/Next navigation arrows
- Date range label ("May 26 - Jun 1, 2026")
- Zoom toggle: Month | Week | Day (3 pill buttons)
- "+ Add Task" button
- "Dashboard" button (top-right, calls `onBack`)

**`WeekView.jsx`** — Primary working view

```
         | Mon AM | Mon PM | Tue AM | Tue PM | Wed AM | Wed PM | Thu AM | Thu PM | Fri AM | Fri PM |
---------+--------+--------+--------+--------+--------+--------+--------+--------+--------+--------+
131 Pure |        |████████████████████████████|        |        |        |        |        |        |
         |        | paint - Fernando, Nic      |        |        |        |        |        |        |
---------+--------+--------+--------+--------+--------+--------+--------+--------+--------+--------+
115A How |        |        |████████████████████████████████████████████████|        |        |        |
         |        |        | paint - Lalo+Eric                             |        |        |        |
```

- 10-column grid (Mon-Fri, AM/PM each) with sticky left gutter
- TaskBars positioned by calculating column offset + span from task dates/slots
- Bar stacking: sort tasks by start, greedily assign vertical lanes to avoid overlap
- Click empty slot -> open create modal with date/slot pre-filled

**`TaskBar.jsx`** — Single colored horizontal bar
- Color = task type, shows truncated address + crew text
- Click -> open TaskDetailPanel
- Drag (mousedown/touchstart) -> horizontal repositioning across slots

**`MonthView.jsx`** — Overview
- 7-column month grid, each cell shows date + colored dot indicators for tasks
- Cells with move-out dates get an orange marker
- Click a day -> switch to week view centered on that week

**`DayView.jsx`** — Detailed single-day
- Two sections: AM and PM
- Tasks rendered as expanded cards: full address, task type badge, crew, turnover notes preview
- Cards stacked vertically, full width — works great on mobile

**`TaskCreateModal.jsx`** — Overlay for creating tasks
- Unit picker: searchable dropdown filtered to turnover-eligible units
- Task type: 6 colored buttons, one-click select
- Date range: start date + slot, end date + slot
- Crew: free text input
- Notes: optional text field
- "Save" and "Save & Add Another" buttons (rapid planning of 20+ tasks)

**`TaskDetailPanel.jsx`** — Slide-in panel (reuses DetailPanel.jsx pattern)
- Shows unit address (clickable -> jumps to dashboard detail view)
- Displays unit's `turnoverNotes` (read-only, from inspection)
- Editable: task type, date range, crew, task notes, status
- Delete button with confirmation

---

## Phase E: Drag to Reschedule

On WeekView, TaskBar supports horizontal drag:
1. `mousedown`/`touchstart` captures start position + task's current slot range
2. `mousemove`/`touchmove` calculates slot offset, updates bar position in real-time
3. `mouseup`/`touchend` snaps to nearest slot, saves via API
4. Duration preserved — both start and end shift by same offset
5. Touch: 300ms press-hold to initiate drag (vs. tap to open detail)
6. Save failure -> snap back to original position

---

## Phase F: Auto-Population

When calendar view loads, for each unit in turnover status:
- If unit has `leaseEnd` and no `move_out` task exists -> show a ghost/suggested move-out bar on that date
- User can click to confirm (creates real task) or dismiss
- Gives Nathan a starting scaffold: all move-out dates laid out, then add work tasks around them

---

## Phase G: Mobile & Polish

- Day view is the primary mobile interface (cards stacked vertically, no scroll)
- Week view on mobile: horizontal scroll with sticky first column
- TaskCreateModal on mobile: full-screen overlay
- Touch targets: bars minimum 44px tall on mobile
- Cross-link from dashboard DetailPanel: "View in Calendar" button for units with scheduled tasks

---

## Implementation Order (fastest path to value)

| Step | What | Files |
|------|------|-------|
| 1 | Schema + API | `supabase/schema.sql`, `netlify/functions/get-calendar-tasks.js`, `save-calendar-task.js`, `delete-calendar-task.js` |
| 2 | Calendar data config | `src/data/calendar.js` |
| 3 | View switching | `src/App.jsx` (add view state, calendar button, conditional render) |
| 4 | Week view + task bars | `src/components/calendar/CalendarView.jsx`, `CalendarHeader.jsx`, `WeekView.jsx`, `TaskBar.jsx` |
| 5 | Create + edit tasks | `TaskCreateModal.jsx`, `TaskDetailPanel.jsx` |
| 6 | Auto-populate move-outs | Logic in `CalendarView.jsx` |
| 7 | Drag to reschedule | Handlers in `TaskBar.jsx` |
| 8 | Month + Day views | `MonthView.jsx`, `DayView.jsx` |
| 9 | Mobile polish + cross-links | Responsive adjustments, link from `DetailPanel.jsx` |

**Steps 1-5 are the MVP.** Steps 6-9 are enhancements.

---

## Verification

1. `npm run dev` — confirm dashboard still works, calendar button appears in header
2. Click calendar button -> week view renders with column headers
3. Create a task via modal -> bar appears in correct slot with correct color
4. Click bar -> detail panel slides in showing unit's turnover notes
5. Edit task (change date, crew) -> saves and bar moves
6. Drag bar to different slot -> bar repositions, persists
7. Switch to month view -> dots appear on days with tasks
8. Switch to day view -> expanded cards show full details
9. On mobile (or narrow browser): day view stacks vertically, week view scrolls horizontally
10. Navigate dashboard -> calendar -> dashboard roundtrip works cleanly
