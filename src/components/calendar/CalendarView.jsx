import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  weekStart, weekDays, fmtWeekRange, toISO, parseISO,
  getTaskColors, TASK_TYPES, TURNOVER_GROUPS,
  taskBarLayout, assignLanes, fmtDay, fmtDaySlot,
  fmtMonthYear, fmtFullDay, monthGrid,
} from '../../data/calendar';
import TaskCreateModal from './TaskCreateModal';
import PropertyDetailPanel from './PropertyDetailPanel';
import MonthView from './MonthView';
import DayView from './DayView';

const ZOOM_OPTS = ['Month', 'Week', 'Day'];
const BAR_HEIGHT = 32;
const LANE_GAP = 4;
const LANE_TOP_PAD = 4;

export default function CalendarView({ units, theme, themeButton, onBack, onViewUnit }) {
  const [zoom, setZoom] = useState('Week');
  const [focusDate, setFocusDate] = useState(() => weekStart(new Date()));
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [createDefaults, setCreateDefaults] = useState(null);
  const [selectedAddress, setSelectedAddress] = useState(null);
  const [dismissedGhosts, setDismissedGhosts] = useState(new Set());

  const monday = useMemo(() => weekStart(focusDate), [focusDate]);
  const days = useMemo(() => weekDays(monday), [monday]);
  const tc = getTaskColors(theme);

  // Turnover-eligible units
  const turnoverUnits = useMemo(
    () => units.filter(u => TURNOVER_GROUPS.has(u.group)),
    [units]
  );

  // Compute fetch window based on zoom level
  const fetchRange = useMemo(() => {
    if (zoom === 'Month') {
      const grid = monthGrid(focusDate.getFullYear(), focusDate.getMonth());
      return { start: toISO(grid[0]), end: toISO(grid[41]) };
    }
    if (zoom === 'Day') {
      const iso = toISO(focusDate);
      return { start: iso, end: iso };
    }
    return { start: toISO(monday), end: toISO(days[6]) };
  }, [zoom, focusDate, monday, days]);

  // Fetch tasks for visible window
  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/get-calendar-tasks?start=${fetchRange.start}&end=${fetchRange.end}`);
      const data = await res.json();
      setTasks(data.tasks || []);
    } catch {
      // silent — keep current tasks
    } finally {
      setLoading(false);
    }
  }, [fetchRange]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  // Group tasks by address
  const tasksByAddress = useMemo(() => {
    const map = {};
    for (const t of tasks) {
      if (!map[t.unit_address]) map[t.unit_address] = [];
      map[t.unit_address].push(t);
    }
    return map;
  }, [tasks]);

  // Convert M/D/YY → ISO date string
  const dashDateToISO = (d) => {
    if (!d) return '';
    const parts = d.split('/').map(Number);
    if (parts.length !== 3) return '';
    const y = parts[2] < 100 ? 2000 + parts[2] : parts[2];
    const m = String(parts[0]).padStart(2, '0');
    const dd = String(parts[1]).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  };

  // Generate ghost tasks from lease data for units missing real move_out/move_in tasks
  const ghostTasks = useMemo(() => {
    const ghosts = [];
    for (const u of turnoverUnits) {
      const realTasks = tasksByAddress[u.address] || [];
      const hasRealMoveOut = realTasks.some(t => t.task_type === 'move_out');
      const hasRealMoveIn = realTasks.some(t => t.task_type === 'move_in');

      if (!hasRealMoveOut && u.moveOutDate) {
        const iso = dashDateToISO(u.moveOutDate);
        if (iso) {
          ghosts.push({
            id: `ghost-out-${u.address}`,
            unit_address: u.address,
            task_type: 'move_out',
            start_date: iso, start_slot: 'am',
            end_date: iso, end_slot: 'am',
            crew: '', notes: `From lease end ${u.leaseEnd || u.moveOutDate}`,
            status: 'suggested', _ghost: true,
          });
        }
      } else if (!hasRealMoveOut && u.leaseEnd) {
        const iso = dashDateToISO(u.leaseEnd);
        if (iso) {
          ghosts.push({
            id: `ghost-out-${u.address}`,
            unit_address: u.address,
            task_type: 'move_out',
            start_date: iso, start_slot: 'am',
            end_date: iso, end_slot: 'am',
            crew: '', notes: `From lease end ${u.leaseEnd}`,
            status: 'suggested', _ghost: true,
          });
        }
      }

      if (!hasRealMoveIn && u.moveInDate) {
        const iso = dashDateToISO(u.moveInDate);
        if (iso) {
          ghosts.push({
            id: `ghost-in-${u.address}`,
            unit_address: u.address,
            task_type: 'move_in',
            start_date: iso, start_slot: 'am',
            end_date: iso, end_slot: 'am',
            crew: '', notes: `From next resident move-in ${u.moveInDate}`,
            status: 'suggested', _ghost: true,
          });
        }
      }
    }
    return ghosts;
  }, [turnoverUnits, tasksByAddress]);

  // Merge real + ghost tasks by address (excluding dismissed ghosts)
  const allTasksByAddress = useMemo(() => {
    const map = { ...tasksByAddress };
    for (const g of ghostTasks) {
      if (dismissedGhosts.has(g.id)) continue;
      if (!map[g.unit_address]) map[g.unit_address] = [];
      else map[g.unit_address] = [...map[g.unit_address]];
      map[g.unit_address].push(g);
    }
    return map;
  }, [tasksByAddress, ghostTasks, dismissedGhosts]);

  // Units that have tasks or are in turnover (sorted by address)
  const calendarUnits = useMemo(() => {
    const addressSet = new Set([
      ...turnoverUnits.map(u => u.address),
      ...Object.keys(allTasksByAddress),
    ]);
    return [...addressSet].sort().map(addr => {
      const unit = units.find(u => u.address === addr);
      return {
        address: addr,
        beds: unit?.beds || '',
        group: unit?.group || '',
        notes: unit?.notes || '',
        moveOutDate: unit?.moveOutDate || '',
        moveInDate: unit?.moveInDate || '',
        leaseEnd: unit?.leaseEnd || '',
      };
    });
  }, [turnoverUnits, allTasksByAddress, units]);

  // Navigation — adapts to zoom level
  const navigate = (dir) => {
    const d = new Date(focusDate);
    if (zoom === 'Month') {
      d.setMonth(d.getMonth() + dir);
    } else if (zoom === 'Day') {
      d.setDate(d.getDate() + dir);
    } else {
      d.setDate(d.getDate() + dir * 7);
    }
    setFocusDate(d);
  };

  const goToday = () => setFocusDate(new Date());

  // Task CRUD
  const handleSaveTask = async (taskData) => {
    try {
      const res = await fetch('/api/save-calendar-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(taskData),
      });
      const data = await res.json();
      if (data.task) {
        setTasks(prev => {
          const idx = prev.findIndex(t => t.id === data.task.id);
          if (idx >= 0) return prev.map((t, i) => i === idx ? data.task : t);
          return [...prev, data.task];
        });
      }
      return data;
    } catch (err) {
      return { error: err.message };
    }
  };

  const handleDismissGhost = (ghostId) => {
    setDismissedGhosts(prev => new Set(prev).add(ghostId));
  };

  const handleDeleteTask = async (taskId) => {
    try {
      await fetch('/api/delete-calendar-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: taskId }),
      });
      setTasks(prev => prev.filter(t => t.id !== taskId));
    } catch { /* silent */ }
  };

  // Click empty slot → open create modal pre-filled
  const handleSlotClick = (address, date, slot) => {
    setCreateDefaults({
      unit_address: address,
      start_date: toISO(date),
      start_slot: slot,
      end_date: toISO(date),
      end_slot: slot,
    });
    setShowCreate(true);
  };

  // Pill button style helper
  const pillStyle = (active) => ({
    background: active ? 'var(--text-primary)' : 'transparent',
    color: active ? 'var(--bg-root)' : 'var(--text-muted)',
    border: 'none',
    borderRadius: 'var(--radius-sm)',
    padding: '5px 12px',
    fontSize: 12, fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 150ms ease',
    whiteSpace: 'nowrap',
  });

  // Header label per zoom
  const headerLabel = useMemo(() => {
    if (zoom === 'Month') return fmtMonthYear(focusDate);
    if (zoom === 'Day') return fmtFullDay(focusDate);
    return fmtWeekRange(monday);
  }, [zoom, focusDate, monday]);

  // Flatten all tasks for month/day views
  const allTasksFlat = useMemo(() => {
    const result = [];
    for (const arr of Object.values(allTasksByAddress)) {
      result.push(...arr);
    }
    return result;
  }, [allTasksByAddress]);

  // Month view → click day
  const handleMonthDayClick = (date) => {
    setFocusDate(date);
    setZoom('Day');
  };

  // Legend
  const legend = TASK_TYPES.map(t => ({ type: t, color: tc[t].color, label: tc[t].label }));

  return (
    <>
      {/* ── Header (calendar mode) ── */}
      <header style={{
        padding: '0 24px',
        borderBottom: '1px solid var(--border-subtle)',
        position: 'sticky', top: 0,
        background: 'var(--header-glass)',
        backdropFilter: 'blur(16px) saturate(180%)',
        WebkitBackdropFilter: 'blur(16px) saturate(180%)',
        zIndex: 40,
      }}>
        {/* Top row */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '16px 0 12px', gap: 12, flexWrap: 'wrap',
        }}>
          {/* Left: back + date nav */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={onBack} style={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-sm)',
              padding: '5px 12px',
              fontSize: 13, fontWeight: 600,
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
              transition: 'all 150ms ease',
            }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-elevated)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
            >
              <span style={{ fontSize: 16 }}>&larr;</span> Dashboard
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <NavBtn onClick={() => navigate(-1)}>&lsaquo;</NavBtn>
              <span style={{
                fontSize: 15, fontWeight: 700, color: 'var(--text-primary)',
                letterSpacing: '-0.01em', minWidth: 200, textAlign: 'center',
              }}>
                {headerLabel}
              </span>
              <NavBtn onClick={() => navigate(1)}>&rsaquo;</NavBtn>
              <NavBtn onClick={goToday} wide>Today</NavBtn>
            </div>
          </div>

          {/* Right: zoom + add + theme */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              display: 'flex',
              background: 'var(--bg-elevated)',
              borderRadius: 'var(--radius-md)',
              padding: 3,
              border: '1px solid var(--border-subtle)',
            }}>
              {ZOOM_OPTS.map(z => (
                <button
                  key={z}
                  onClick={() => setZoom(z)}
                  style={pillStyle(zoom === z)}
                >
                  {z}
                </button>
              ))}
            </div>

            <button
              onClick={() => { setCreateDefaults(null); setShowCreate(true); }}
              style={{
                background: 'var(--accent)',
                color: '#fff',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                padding: '6px 14px',
                fontSize: 12, fontWeight: 700,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 150ms ease',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--accent-hover)'}
              onMouseLeave={e => e.currentTarget.style.background = 'var(--accent)'}
            >
              + Add Task
            </button>

            {themeButton}
          </div>
        </div>

        {/* Legend row */}
        <div style={{
          display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap',
          paddingBottom: 12,
        }}>
          {legend.map(l => (
            <div key={l.type} style={{
              display: 'flex', alignItems: 'center', gap: 5,
              fontSize: 11, fontWeight: 500, color: 'var(--text-secondary)',
            }}>
              <div style={{ width: 10, height: 10, borderRadius: 3, background: l.color }} />
              {l.label}
            </div>
          ))}
          <div style={{ flex: 1 }} />
          {loading && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Loading...</span>}
          <span style={{
            fontSize: 12, color: 'var(--text-muted)', fontWeight: 500,
            fontVariantNumeric: 'tabular-nums',
          }}>
            {calendarUnits.length} unit{calendarUnits.length !== 1 ? 's' : ''}
          </span>
        </div>
      </header>

      {/* ── View body ── */}
      {zoom === 'Month' && (
        <MonthView
          year={focusDate.getFullYear()}
          month={focusDate.getMonth()}
          allTasks={allTasksFlat}
          theme={theme}
          onDayClick={handleMonthDayClick}
        />
      )}

      {zoom === 'Day' && (
        <DayView
          date={focusDate}
          allTasks={allTasksFlat}
          theme={theme}
          onAddressClick={setSelectedAddress}
        />
      )}

      {zoom === 'Week' && (
        <div style={{ padding: '0 24px 60px', overflowX: 'auto' }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: '180px repeat(14, 1fr)',
            minWidth: 1100,
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-lg)',
            overflow: 'hidden',
            background: 'var(--bg-surface)',
            marginTop: 16,
          }}>
            {/* Day group headers */}
            <div style={colHeaderStyle({ borderRight: '1px solid var(--border-default)' })}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Unit</span>
            </div>
            {days.map((d, i) => (
              <div key={i} style={{
                ...colHeaderStyle(),
                gridColumn: 'span 2',
                borderRight: '1px solid var(--border-subtle)',
                fontSize: 12, fontWeight: 700, color: 'var(--text-primary)',
                background: (d.getDay() === 0 || d.getDay() === 6)
                  ? 'var(--bg-hover)' : 'var(--bg-elevated)',
              }}>
                {fmtDay(d)}
              </div>
            ))}

            {/* AM/PM sub-headers */}
            <div style={colHeaderStyle({
              fontSize: 10, color: 'var(--text-dim)',
              borderRight: '1px solid var(--border-default)',
            })}>
              Address
            </div>
            {days.map((d, i) => (
              ['AM', 'PM'].map((slot, si) => (
                <div key={`${i}-${si}`} style={{
                  ...colHeaderStyle({ fontSize: 10, color: 'var(--text-muted)' }),
                  borderRight: si === 1 ? '1px solid var(--border-subtle)' : undefined,
                  background: (d.getDay() === 0 || d.getDay() === 6)
                    ? 'var(--bg-hover)' : 'var(--bg-elevated)',
                }}>
                  {slot}
                </div>
              ))
            ))}

            {/* Swimlane rows */}
            {calendarUnits.map(unit => {
              const unitTasks = allTasksByAddress[unit.address] || [];
              const lanes = assignLanes(unitTasks, monday);
              const maxLane = Math.max(0, ...lanes.values());
              const rowHeight = Math.max(56, LANE_TOP_PAD + (maxLane + 1) * (BAR_HEIGHT + LANE_GAP) + LANE_GAP);

              return (
                <div key={unit.address} style={{ display: 'contents' }}>
                  {/* Label */}
                  <div
                    style={{
                      borderRight: '1px solid var(--border-default)',
                      borderBottom: '1px solid var(--border-subtle)',
                      padding: '10px 12px',
                      display: 'flex', flexDirection: 'column', justifyContent: 'center',
                      minHeight: rowHeight, cursor: 'pointer',
                    }}
                    onClick={() => setSelectedAddress(unit.address)}
                  >
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.2 }}>
                      {unit.address}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                      {unit.beds ? `${unit.beds} bed` : ''}
                    </div>
                  </div>

                  {/* Slots + task bars */}
                  <div style={{
                    gridColumn: 'span 14',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(14, 1fr)',
                    borderBottom: '1px solid var(--border-subtle)',
                    position: 'relative',
                    minHeight: rowHeight,
                  }}>
                    {/* Background slot cells */}
                    {days.map((d, di) =>
                      ['am', 'pm'].map((slot, si) => (
                        <div
                          key={`${di}-${si}`}
                          onClick={() => handleSlotClick(unit.address, d, slot)}
                          style={{
                            borderRight: si === 1 ? '1px solid var(--border-subtle)' : '1px solid var(--border-subtle)',
                            minHeight: rowHeight,
                            cursor: 'pointer',
                            background: (d.getDay() === 0 || d.getDay() === 6)
                              ? 'rgba(128,128,128,0.04)' : undefined,
                          }}
                          onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                          onMouseLeave={e => {
                            e.currentTarget.style.background = (d.getDay() === 0 || d.getDay() === 6)
                              ? 'rgba(128,128,128,0.04)' : '';
                          }}
                        />
                      ))
                    )}

                    {/* Task bars */}
                    {unitTasks.map(task => {
                      const layout = taskBarLayout(task, monday);
                      if (!layout) return null;
                      const lane = lanes.get(task.id) || 0;
                      const colors = tc[task.task_type] || tc.clean;
                      const pct = (1 / 14) * 100;
                      const isGhost = task._ghost;

                      return (
                        <div
                          key={task.id}
                          onClick={(e) => { e.stopPropagation(); setSelectedAddress(unit.address); }}
                          style={{
                            position: 'absolute',
                            left: `calc(${layout.startCol * pct}% + 2px)`,
                            width: `calc(${layout.span * pct}% - 4px)`,
                            top: LANE_TOP_PAD + lane * (BAR_HEIGHT + LANE_GAP),
                            height: BAR_HEIGHT,
                            borderRadius: 'var(--radius-sm)',
                            background: colors.bg,
                            color: colors.text,
                            border: `1px ${isGhost ? 'dashed' : 'solid'} ${colors.color}33`,
                            opacity: isGhost ? 0.5 : 1,
                            display: 'flex', alignItems: 'center',
                            padding: '0 8px',
                            fontSize: 11, fontWeight: 600,
                            cursor: 'pointer',
                            overflow: 'hidden',
                            whiteSpace: 'nowrap',
                            textOverflow: 'ellipsis',
                            zIndex: 5,
                            transition: 'transform 80ms ease, box-shadow 80ms ease',
                          }}
                          onMouseEnter={e => {
                            e.currentTarget.style.transform = 'translateY(-1px)';
                            e.currentTarget.style.boxShadow = 'var(--shadow-md)';
                            e.currentTarget.style.zIndex = '10';
                          }}
                          onMouseLeave={e => {
                            e.currentTarget.style.transform = '';
                            e.currentTarget.style.boxShadow = '';
                            e.currentTarget.style.zIndex = '5';
                          }}
                        >
                          <span style={{
                            fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                            letterSpacing: '0.04em', opacity: 0.7, marginRight: 6,
                          }}>
                            {colors.label}
                          </span>
                          {task.crew && (
                            <span style={{ opacity: 0.85 }}>{task.crew}</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {/* Empty state */}
            {calendarUnits.length === 0 && (
              <div style={{
                gridColumn: '1 / -1',
                textAlign: 'center', padding: 60,
                color: 'var(--text-muted)', fontSize: 14,
              }}>
                No turnover units for this period.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Create modal ── */}
      {showCreate && (
        <TaskCreateModal
          turnoverUnits={turnoverUnits}
          theme={theme}
          defaults={createDefaults}
          onSave={handleSaveTask}
          onClose={() => setShowCreate(false)}
        />
      )}

      {/* ── Property detail panel ── */}
      {selectedAddress && (
        <PropertyDetailPanel
          address={selectedAddress}
          unit={units.find(u => u.address === selectedAddress)}
          tasks={allTasksByAddress[selectedAddress] || []}
          theme={theme}
          monday={monday}
          onClose={() => setSelectedAddress(null)}
          onSave={handleSaveTask}
          onDelete={handleDeleteTask}
          onDismissGhost={handleDismissGhost}
          onViewUnit={onViewUnit}
        />
      )}
    </>
  );
}

// ── Small helper components ──

function NavBtn({ onClick, children, wide }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-sm)',
        width: wide ? 'auto' : 30, height: 30,
        padding: wide ? '0 10px' : 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', color: 'var(--text-secondary)',
        fontSize: wide ? 11 : 14, fontWeight: wide ? 700 : 400,
        transition: 'all 150ms ease',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-elevated)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
    >
      {children}
    </button>
  );
}

function colHeaderStyle(extra = {}) {
  return {
    background: 'var(--bg-elevated)',
    borderBottom: '1px solid var(--border-default)',
    padding: '10px 6px',
    textAlign: 'center',
    fontSize: 11, fontWeight: 700,
    color: 'var(--text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    ...extra,
  };
}
