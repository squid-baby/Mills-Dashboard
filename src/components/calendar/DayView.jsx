import { getTaskColors } from '../../data/calendar';

export default function DayView({ date, allTasks, theme, onAddressClick }) {
  const tc = getTaskColors(theme);
  const iso = dateToISO(date);

  // Filter tasks that overlap this day, split by AM/PM
  const amTasks = [];
  const pmTasks = [];

  for (const t of allTasks) {
    const tStart = t.start_date;
    const tEnd = t.end_date;
    if (tStart > iso || tEnd < iso) continue;

    // Determine which slots this task covers on this day
    const coversAM = (tStart < iso) || (tStart === iso && t.start_slot === 'am');
    const coversPM = (tEnd > iso) || (tEnd === iso && t.end_slot === 'pm')
      || (tStart === iso && t.start_slot === 'pm');

    if (coversAM) amTasks.push(t);
    if (coversPM && !coversAM) pmTasks.push(t);
    else if (coversPM && coversAM) pmTasks.push(t);
  }

  // Dedupe (tasks spanning both slots appear in both)
  const amIds = new Set(amTasks.map(t => t.id));

  return (
    <div style={{ padding: '16px 24px 60px', maxWidth: 700, margin: '0 auto' }}>
      <SlotSection label="AM" tasks={amTasks} tc={tc} onAddressClick={onAddressClick} />
      <SlotSection label="PM" tasks={pmTasks.filter(t => !amIds.has(t.id) || pmTasks.length === pmTasks.filter(t2 => amIds.has(t2.id)).length ? true : true)} tc={tc} onAddressClick={onAddressClick} />

      {amTasks.length === 0 && pmTasks.length === 0 && (
        <div style={{
          textAlign: 'center', padding: 60,
          color: 'var(--text-muted)', fontSize: 14,
        }}>
          No tasks scheduled for this day.
        </div>
      )}
    </div>
  );
}

function SlotSection({ label, tasks, tc, onAddressClick }) {
  if (tasks.length === 0) return null;

  return (
    <div style={{ marginBottom: 24 }}>
      <h3 style={{
        fontSize: 12, fontWeight: 700, color: 'var(--text-muted)',
        textTransform: 'uppercase', letterSpacing: '0.06em',
        marginBottom: 10, paddingBottom: 6,
        borderBottom: '1px solid var(--border-subtle)',
      }}>
        {label}
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {tasks.map(task => {
          const colors = tc[task.task_type] || tc.clean;
          const isGhost = task._ghost;

          return (
            <div
              key={`${label}-${task.id}`}
              onClick={() => onAddressClick(task.unit_address)}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 12,
                padding: '12px 14px',
                background: 'var(--bg-elevated)',
                border: `1px ${isGhost ? 'dashed' : 'solid'} var(--border-default)`,
                borderLeft: `4px solid ${colors.color}`,
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer',
                opacity: isGhost ? 0.6 : 1,
                transition: 'background 100ms ease, transform 80ms ease',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'var(--bg-hover)';
                e.currentTarget.style.transform = 'translateY(-1px)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'var(--bg-elevated)';
                e.currentTarget.style.transform = '';
              }}
            >
              {/* Type badge */}
              <span style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                padding: '3px 8px', borderRadius: 4,
                fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '0.03em', whiteSpace: 'nowrap', minWidth: 56,
                textAlign: 'center',
                background: colors.bg, color: colors.text,
                flexShrink: 0,
              }}>
                {colors.label}
              </span>

              {/* Content */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2 }}>
                  {task.unit_address}
                </div>
                <div style={{ display: 'flex', gap: 12, fontSize: 12, color: 'var(--text-secondary)' }}>
                  {task.crew && <span>{task.crew}</span>}
                  <span style={{ color: 'var(--text-muted)' }}>
                    {isGhost ? 'Suggested' : (task.status === 'in_progress' ? 'In Progress' : task.status === 'done' ? 'Done' : 'Planned')}
                  </span>
                </div>
                {task.notes && (
                  <div style={{
                    marginTop: 4, fontSize: 11, color: 'var(--text-muted)',
                    lineHeight: 1.4, whiteSpace: 'pre-wrap',
                  }}>
                    {task.notes}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function dateToISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
