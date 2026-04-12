import { useState } from 'react';
import { getTaskColors, fmtDaySlot, STATUS_LABELS } from '../../data/calendar';

export default function PropertyDetailPanel({ address, unit, tasks, theme, monday, onClose, onSave, onDelete, onDismissGhost, onViewUnit }) {
  const tc = getTaskColors(theme);
  const [expandedIdx, setExpandedIdx] = useState(null);
  const [editingTask, setEditingTask] = useState(null);

  // Sort tasks by start_date + start_slot
  const sorted = [...tasks].sort((a, b) => {
    if (a.start_date !== b.start_date) return a.start_date < b.start_date ? -1 : 1;
    return a.start_slot === 'am' ? -1 : 1;
  });

  const turnoverNotes = unit?.notes || '';
  const beds = unit?.beds || '';
  const moveOut = unit?.moveOutDate || '';
  const moveIn = unit?.moveInDate || '';

  // Calculate turn window
  let turnWindow = '';
  if (moveOut && moveIn) {
    try {
      const pOut = moveOut.split('/').map(Number);
      const pIn = moveIn.split('/').map(Number);
      const out = new Date(2000 + (pOut[2] < 100 ? pOut[2] : pOut[2] - 2000), pOut[0] - 1, pOut[1]);
      const inn = new Date(2000 + (pIn[2] < 100 ? pIn[2] : pIn[2] - 2000), pIn[0] - 1, pIn[1]);
      turnWindow = Math.ceil((inn - out) / 86400000) + ' days';
    } catch { /* ignore */ }
  }

  const handleSaveEdit = async () => {
    if (!editingTask) return;
    await onSave(editingTask);
    setEditingTask(null);
  };

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
          zIndex: 50,
          animation: 'fadeIn 200ms ease',
        }}
      />

      {/* Panel */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: 420, maxWidth: '90vw',
        background: 'var(--bg-surface)',
        borderLeft: '1px solid var(--border-default)',
        zIndex: 60,
        padding: 24,
        overflowY: 'auto',
        boxShadow: 'var(--shadow-lg)',
        animation: 'slideInRight 300ms cubic-bezier(0.16,1,0.3,1)',
      }}>
        {/* Close button */}
        <button onClick={onClose} style={{
          position: 'absolute', top: 16, right: 16,
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-sm)',
          width: 32, height: 32,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', color: 'var(--text-secondary)',
          fontSize: 16,
        }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-elevated)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
        >
          &times;
        </button>

        {/* Address + meta */}
        <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 2, color: 'var(--text-primary)' }}>
          {address}
        </h2>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
          {[beds && `${beds} bed`, turnWindow && `Turn window: ${turnWindow}`].filter(Boolean).join(' \u2022 ')}
        </div>
        <a
          href="#"
          onClick={e => { e.preventDefault(); onViewUnit(address); }}
          style={{ fontSize: 12, color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}
        >
          View in Dashboard &rarr;
        </a>

        {/* Tasks */}
        <div style={{ marginTop: 20 }}>
          <h3 style={sectionHeader}>Scheduled Tasks</h3>
          {sorted.length === 0 && (
            <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: '12px 0' }}>
              No tasks scheduled. Click "+ Add Task" to get started.
            </div>
          )}
          {sorted.map((task, idx) => {
            const colors = tc[task.task_type] || tc.clean;
            const isExpanded = expandedIdx === idx;
            const isEditing = editingTask?.id === task.id;

            return (
              <div key={task.id}>
                {/* Task row */}
                <div
                  onClick={() => {
                    setExpandedIdx(isExpanded ? null : idx);
                    setEditingTask(null);
                  }}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'auto 1fr auto',
                    gap: 10,
                    alignItems: 'center',
                    padding: '10px 12px',
                    borderRadius: isExpanded ? 'var(--radius-sm) var(--radius-sm) 0 0' : 'var(--radius-sm)',
                    marginBottom: isExpanded ? 0 : 6,
                    border: '1px solid var(--border-subtle)',
                    background: 'var(--bg-elevated)',
                    cursor: 'pointer',
                    transition: 'background 150ms ease',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-elevated)'}
                >
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    padding: '3px 8px', borderRadius: 4,
                    fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                    letterSpacing: '0.03em', whiteSpace: 'nowrap', minWidth: 56,
                    textAlign: 'center',
                    background: colors.bg, color: colors.text,
                  }}>
                    {colors.label}
                  </span>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 500 }}>
                      {fmtDaySlot(task.start_date, task.start_slot)}
                      {(task.start_date !== task.end_date || task.start_slot !== task.end_slot)
                        ? ` \u2192 ${fmtDaySlot(task.end_date, task.end_slot)}`
                        : ''
                      }
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 500, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {task.crew || '\u2014'}
                  </div>
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div style={{
                    padding: '10px 12px',
                    marginBottom: 6,
                    border: '1px solid var(--border-default)',
                    borderTop: 'none',
                    borderRadius: '0 0 var(--radius-sm) var(--radius-sm)',
                    background: 'var(--bg-surface)',
                    animation: 'fadeIn 150ms ease',
                  }}>
                    {isEditing ? (
                      /* Edit mode */
                      <EditForm
                        task={editingTask}
                        tc={tc}
                        onChange={setEditingTask}
                        onSave={handleSaveEdit}
                        onCancel={() => setEditingTask(null)}
                      />
                    ) : (
                      /* View mode */
                      <>
                        <DetailField label="Status" value={task._ghost ? 'Suggested' : (STATUS_LABELS[task.status] || task.status)} />
                        <DetailField label="Crew" value={task.crew || '(unassigned)'} />
                        {task.notes && (
                          <div style={{
                            marginTop: 6, padding: '6px 8px',
                            background: 'var(--bg-elevated)',
                            borderRadius: 4,
                            fontSize: 11, color: 'var(--text-secondary)',
                            lineHeight: 1.4, whiteSpace: 'pre-wrap',
                          }}>
                            {task.notes}
                          </div>
                        )}
                        <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                          {task._ghost ? (
                            <>
                              <button
                                onClick={async () => {
                                  const { _ghost, id, ...real } = task;
                                  await onSave({ ...real, status: 'planned' });
                                }}
                                style={actionBtn('save')}
                              >
                                Confirm
                              </button>
                              <button onClick={() => onDismissGhost(task.id)} style={actionBtn()}>
                                Dismiss
                              </button>
                            </>
                          ) : (
                            <>
                              <button onClick={() => setEditingTask({ ...task })} style={actionBtn()}>
                                Edit
                              </button>
                              <button
                                onClick={() => { if (confirm('Delete this task?')) onDelete(task.id); }}
                                style={actionBtn('delete')}
                              >
                                Delete
                              </button>
                            </>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Turnover info */}
        {turnoverNotes && (
          <div style={{ marginTop: 20 }}>
            <h3 style={sectionHeader}>Turnover Notes</h3>
            <div style={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              padding: '10px 12px',
              fontSize: 12, color: 'var(--text-secondary)',
              lineHeight: 1.5, whiteSpace: 'pre-wrap',
            }}>
              {turnoverNotes}
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
      `}</style>
    </>
  );
}

// ── Inline edit form ──

function EditForm({ task, tc, onChange, onSave, onCancel }) {
  const inputStyle = {
    width: '100%',
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-sm)',
    padding: '6px 10px',
    color: 'var(--text-primary)',
    fontSize: 12, fontFamily: 'inherit',
    outline: 'none',
  };
  const labelStyle = {
    fontSize: 10, fontWeight: 700, color: 'var(--text-muted)',
    textTransform: 'uppercase', marginBottom: 3, display: 'block',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div>
        <label style={labelStyle}>Crew</label>
        <input
          value={task.crew}
          onChange={e => onChange({ ...task, crew: e.target.value })}
          style={inputStyle}
        />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        <div>
          <label style={labelStyle}>Start</label>
          <input type="date" value={task.start_date} onChange={e => onChange({ ...task, start_date: e.target.value })} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Slot</label>
          <select value={task.start_slot} onChange={e => onChange({ ...task, start_slot: e.target.value })} style={inputStyle}>
            <option value="am">AM</option><option value="pm">PM</option>
          </select>
        </div>
        <div>
          <label style={labelStyle}>End</label>
          <input type="date" value={task.end_date} onChange={e => onChange({ ...task, end_date: e.target.value })} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Slot</label>
          <select value={task.end_slot} onChange={e => onChange({ ...task, end_slot: e.target.value })} style={inputStyle}>
            <option value="am">AM</option><option value="pm">PM</option>
          </select>
        </div>
      </div>
      <div>
        <label style={labelStyle}>Status</label>
        <select value={task.status} onChange={e => onChange({ ...task, status: e.target.value })} style={inputStyle}>
          <option value="planned">Planned</option>
          <option value="in_progress">In Progress</option>
          <option value="done">Done</option>
        </select>
      </div>
      <div>
        <label style={labelStyle}>Notes</label>
        <textarea
          value={task.notes || ''}
          onChange={e => onChange({ ...task, notes: e.target.value })}
          style={{ ...inputStyle, resize: 'vertical', minHeight: 40 }}
        />
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={onCancel} style={actionBtn()}>Cancel</button>
        <button onClick={onSave} style={actionBtn('save')}>Save</button>
      </div>
    </div>
  );
}

// ── Helpers ──

function DetailField({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 12 }}>
      <span style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{value}</span>
    </div>
  );
}

const sectionHeader = {
  fontSize: 11, fontWeight: 700, color: 'var(--text-muted)',
  textTransform: 'uppercase', letterSpacing: '0.06em',
  marginBottom: 8,
};

function actionBtn(variant) {
  const base = {
    flex: 1,
    padding: '5px 12px',
    borderRadius: 'var(--radius-sm)',
    fontSize: 11, fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 150ms ease',
  };
  if (variant === 'delete') {
    return { ...base, background: 'rgba(239,68,68,0.12)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' };
  }
  if (variant === 'save') {
    return { ...base, background: 'var(--accent)', color: '#fff', border: 'none' };
  }
  return { ...base, background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border-default)' };
}
