import { useMemo } from 'react';
import { monthGrid, toISO, getTaskColors, TASK_TYPES } from '../../data/calendar';

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function MonthView({ year, month, allTasks, theme, onDayClick }) {
  const tc = getTaskColors(theme);
  const grid = useMemo(() => monthGrid(year, month), [year, month]);
  const todayISO = toISO(new Date());

  // Build a map: ISO date → array of task types on that day
  const tasksByDate = useMemo(() => {
    const map = {};
    for (const t of allTasks) {
      // Walk each day the task spans
      const start = new Date(t.start_date + 'T00:00:00');
      const end = new Date(t.end_date + 'T00:00:00');
      const d = new Date(start);
      while (d <= end) {
        const iso = toISO(d);
        if (!map[iso]) map[iso] = [];
        map[iso].push(t);
        d.setDate(d.getDate() + 1);
      }
    }
    return map;
  }, [allTasks]);

  return (
    <div style={{ padding: '16px 24px 60px' }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(7, 1fr)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
        background: 'var(--bg-surface)',
      }}>
        {/* Day-of-week headers */}
        {DAY_LABELS.map(d => (
          <div key={d} style={{
            background: 'var(--bg-elevated)',
            borderBottom: '1px solid var(--border-default)',
            padding: '10px 6px',
            textAlign: 'center',
            fontSize: 11, fontWeight: 700,
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}>
            {d}
          </div>
        ))}

        {/* Date cells */}
        {grid.map((date, i) => {
          const iso = toISO(date);
          const isCurrentMonth = date.getMonth() === month;
          const isToday = iso === todayISO;
          const isWeekend = date.getDay() === 0 || date.getDay() === 6;
          const dayTasks = tasksByDate[iso] || [];

          // Dedupe task types and count per type
          const typeCounts = {};
          for (const t of dayTasks) {
            const key = t.task_type;
            typeCounts[key] = (typeCounts[key] || 0) + 1;
          }
          const hasGhost = dayTasks.some(t => t._ghost);

          return (
            <div
              key={i}
              onClick={() => onDayClick(date)}
              style={{
                minHeight: 90,
                padding: '6px 8px',
                borderRight: (i % 7 !== 6) ? '1px solid var(--border-subtle)' : undefined,
                borderBottom: (i < 35) ? '1px solid var(--border-subtle)' : undefined,
                cursor: 'pointer',
                background: isWeekend ? 'rgba(128,128,128,0.03)' : undefined,
                opacity: isCurrentMonth ? 1 : 0.35,
                transition: 'background 100ms ease',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
              onMouseLeave={e => e.currentTarget.style.background = isWeekend ? 'rgba(128,128,128,0.03)' : ''}
            >
              {/* Date number */}
              <div style={{
                fontSize: 13, fontWeight: isToday ? 800 : 500,
                color: isToday ? 'var(--accent)' : 'var(--text-primary)',
                marginBottom: 4,
                ...(isToday ? {
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 26, height: 26, borderRadius: '50%',
                  background: 'var(--accent)', color: '#fff',
                } : {}),
              }}>
                {date.getDate()}
              </div>

              {/* Task dots / pills */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {TASK_TYPES.filter(t => typeCounts[t]).map(type => {
                  const colors = tc[type];
                  const count = typeCounts[type];
                  return (
                    <div key={type} style={{
                      display: 'flex', alignItems: 'center', gap: 4,
                      padding: '2px 5px',
                      borderRadius: 3,
                      background: colors.bg,
                      fontSize: 9, fontWeight: 700,
                      color: colors.text,
                      textTransform: 'uppercase',
                      letterSpacing: '0.03em',
                      opacity: hasGhost ? 0.6 : 1,
                    }}>
                      <div style={{
                        width: 6, height: 6, borderRadius: '50%',
                        background: colors.color,
                      }} />
                      {colors.label}{count > 1 ? ` (${count})` : ''}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
