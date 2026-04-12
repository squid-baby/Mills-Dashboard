import { useState } from 'react';
import { getTaskColors, TASK_TYPES } from '../../data/calendar';

export default function TaskCreateModal({ turnoverUnits, theme, defaults, onSave, onClose }) {
  const tc = getTaskColors(theme);

  const [unitAddress, setUnitAddress] = useState(defaults?.unit_address || '');
  const [taskType, setTaskType] = useState('clean');
  const [startDate, setStartDate] = useState(defaults?.start_date || '');
  const [startSlot, setStartSlot] = useState(defaults?.start_slot || 'am');
  const [endDate, setEndDate] = useState(defaults?.end_date || '');
  const [endSlot, setEndSlot] = useState(defaults?.end_slot || 'pm');
  const [crew, setCrew] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  const filteredUnits = turnoverUnits.filter(u =>
    !search || u.address.toLowerCase().includes(search.toLowerCase())
  );

  const doSave = async (keepOpen) => {
    if (!unitAddress || !taskType || !startDate || !endDate) return;
    setSaving(true);
    const result = await onSave({
      unit_address: unitAddress,
      task_type: taskType,
      start_date: startDate,
      start_slot: startSlot,
      end_date: endDate,
      end_slot: endSlot,
      crew, notes,
    });
    setSaving(false);
    if (result?.error) return;

    if (keepOpen) {
      // Reset for next task but keep date context
      setUnitAddress('');
      setTaskType('clean');
      setCrew('');
      setNotes('');
      setSearch('');
    } else {
      onClose();
    }
  };

  const inputStyle = {
    width: '100%',
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-sm)',
    padding: '8px 12px',
    color: 'var(--text-primary)',
    fontSize: 13, fontFamily: 'inherit',
    outline: 'none',
  };

  const labelStyle = {
    display: 'block',
    fontSize: 11, fontWeight: 700, color: 'var(--text-muted)',
    textTransform: 'uppercase', letterSpacing: '0.05em',
    marginBottom: 5,
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.7)',
        backdropFilter: 'blur(6px)',
        zIndex: 70,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: 'fadeIn 200ms ease',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-lg)',
          padding: 28,
          width: 440, maxWidth: '95vw',
          boxShadow: 'var(--shadow-lg)',
          maxHeight: '90vh', overflowY: 'auto',
        }}
      >
        <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 20, color: 'var(--text-primary)' }}>
          New Task
        </h2>

        {/* Unit picker */}
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Unit</label>
          {unitAddress ? (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              ...inputStyle, cursor: 'pointer',
            }} onClick={() => setUnitAddress('')}>
              <span style={{ fontWeight: 600 }}>{unitAddress}</span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>change</span>
            </div>
          ) : (
            <>
              <input
                type="text"
                placeholder="Search units..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={inputStyle}
                autoFocus
              />
              <div style={{
                maxHeight: 150, overflowY: 'auto',
                border: '1px solid var(--border-subtle)',
                borderTop: 'none',
                borderRadius: '0 0 var(--radius-sm) var(--radius-sm)',
              }}>
                {filteredUnits.map(u => (
                  <div
                    key={u.address}
                    onClick={() => { setUnitAddress(u.address); setSearch(''); }}
                    style={{
                      padding: '7px 12px', cursor: 'pointer',
                      fontSize: 13, color: 'var(--text-primary)',
                      borderBottom: '1px solid var(--border-subtle)',
                      transition: 'background 100ms ease',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                    onMouseLeave={e => e.currentTarget.style.background = ''}
                  >
                    {u.address}
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 8 }}>
                      {u.beds ? `${u.beds} bed` : ''}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Task type picker */}
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Task Type</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
            {TASK_TYPES.map(t => {
              const c = tc[t];
              const selected = taskType === t;
              return (
                <button
                  key={t}
                  onClick={() => setTaskType(t)}
                  style={{
                    background: c.bg,
                    color: c.text,
                    border: `2px solid ${selected ? 'var(--text-primary)' : 'transparent'}`,
                    borderRadius: 'var(--radius-sm)',
                    padding: '8px 6px',
                    fontSize: 11, fontWeight: 700,
                    textTransform: 'uppercase',
                    cursor: 'pointer',
                    transition: 'all 150ms ease',
                  }}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Date / slot pickers */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
          <div>
            <label style={labelStyle}>Start Date</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Start Slot</label>
            <select value={startSlot} onChange={e => setStartSlot(e.target.value)} style={inputStyle}>
              <option value="am">AM</option>
              <option value="pm">PM</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>End Date</label>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>End Slot</label>
            <select value={endSlot} onChange={e => setEndSlot(e.target.value)} style={inputStyle}>
              <option value="am">AM</option>
              <option value="pm">PM</option>
            </select>
          </div>
        </div>

        {/* Crew */}
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Crew</label>
          <input
            type="text"
            placeholder="e.g. Fernando, Lalo + Eric"
            value={crew}
            onChange={e => setCrew(e.target.value)}
            style={inputStyle}
          />
        </div>

        {/* Notes */}
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Notes</label>
          <textarea
            placeholder="Optional notes..."
            value={notes}
            onChange={e => setNotes(e.target.value)}
            style={{ ...inputStyle, resize: 'vertical', minHeight: 60 }}
          />
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
          <button onClick={onClose} style={btnStyle('secondary')}>
            Cancel
          </button>
          <button
            onClick={() => doSave(true)}
            disabled={saving || !unitAddress || !startDate || !endDate}
            style={btnStyle('secondary', saving)}
          >
            Save & Add Another
          </button>
          <button
            onClick={() => doSave(false)}
            disabled={saving || !unitAddress || !startDate || !endDate}
            style={btnStyle('primary', saving)}
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

function btnStyle(variant, disabled) {
  const base = {
    flex: 1,
    padding: '9px 16px',
    borderRadius: 'var(--radius-sm)',
    fontSize: 13, fontWeight: 700,
    cursor: disabled ? 'wait' : 'pointer',
    border: 'none',
    transition: 'all 150ms ease',
    opacity: disabled ? 0.5 : 1,
  };
  if (variant === 'primary') {
    return { ...base, background: 'var(--accent)', color: '#fff' };
  }
  return { ...base, background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border-default)' };
}
