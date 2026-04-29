import { useEffect, useMemo, useState } from 'react';
import {
  CATEGORY_LABELS, summarizeRow, sectionForConditionItem, shoppingKey,
} from '../config/turnoverOptions';

const sectionTitleStyle = {
  fontSize: 11, fontWeight: 700, color: 'var(--text-muted)',
  textTransform: 'uppercase', letterSpacing: '0.08em',
  marginBottom: 12, paddingBottom: 6,
  borderBottom: '1px solid var(--border-subtle)',
};

const groupTitleStyle = {
  fontSize: 10, fontWeight: 700, color: 'var(--text-muted)',
  textTransform: 'uppercase', letterSpacing: '0.06em',
  marginBottom: 8,
};

const rowStyle = {
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-md)',
  padding: '10px 12px',
  marginBottom: 6,
  display: 'flex', alignItems: 'center', gap: 10,
};

const toggleBaseStyle = {
  padding: '6px 10px', fontSize: 11, fontWeight: 600,
  borderRadius: 'var(--radius-sm)', cursor: 'pointer',
  whiteSpace: 'nowrap',
  display: 'inline-flex', alignItems: 'center', gap: 4,
};

export default function WorklistView({ initialAddress, onBack, themeButton }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterAddress, setFilterAddress] = useState(initialAddress || '');
  const [error, setError] = useState(null);

  useEffect(() => { fetchRows(); }, []);

  async function fetchRows() {
    setLoading(true);
    try {
      const res = await fetch('/api/get-worklist-items');
      const data = await res.json();
      setRows(Array.isArray(data.rows) ? data.rows : []);
      setError(data.error || null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const allAddresses = useMemo(
    () => Array.from(new Set(rows.map(r => r.unit_address))).filter(Boolean).sort(),
    [rows],
  );

  const filtered = filterAddress ? rows.filter(r => r.unit_address === filterAddress) : rows;
  const gather = filtered.filter(r => r.item_type === 'purchase');
  const tasks  = filtered.filter(r => r.item_type === 'work');

  async function toggleRowField(rowId, field, value) {
    const ts = value ? new Date().toISOString() : null;
    const prev = rows;
    setRows(rs => rs.map(r => r.id === rowId
      ? { ...r, [field]: ts, ...(field === 'done_at' ? { done_by: value ? 'Team' : null } : {}) }
      : r,
    ));
    try {
      const res = await fetch('/api/save-inspection-item-state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: rowId, field, value: ts, done_by: 'Team' }),
      });
      if (!res.ok) throw new Error('Save failed');
    } catch (err) {
      console.error('toggleRowField failed:', err);
      setRows(prev);
    }
  }

  function exportCsv() {
    const header = ['Address', 'Type', 'Category', 'Item', 'Gathered', 'Done', 'Done by'];
    const lines = filtered.map(r => [
      r.unit_address || '',
      r.item_type === 'purchase' ? 'Gather' : 'Task',
      CATEGORY_LABELS[r.category] || r.category,
      summarizeRow(r),
      r.gathered_at ? new Date(r.gathered_at).toISOString().slice(0, 10) : '',
      r.done_at ? new Date(r.done_at).toISOString().slice(0, 10) : '',
      r.done_by || '',
    ]);
    const csv = [header, ...lines].map(row => row.map(csvCell).join(',')).join('\n');
    downloadFile(csv, suffixedName('worklist'), 'text/csv');
  }

  function exportShoppingList() {
    const totals = new Map();
    for (const r of gather) {
      const key = shoppingKey(r);
      const qty = Number(r.payload?.qty) || 1;
      const summary = summarizeRow({ ...r, payload: { ...r.payload, qty: 1 } })
        .replace(/^\d+×\s*/, ''); // strip leading "1× " so we can prepend the rolled-up total
      const cur = totals.get(key);
      if (cur) cur.qty += qty;
      else totals.set(key, { summary, qty, category: r.category });
    }
    const header = ['Category', 'Qty', 'Item'];
    const lines = Array.from(totals.values())
      .sort((a, b) => (a.category < b.category ? -1 : 1))
      .map(t => [CATEGORY_LABELS[t.category] || t.category, t.qty, t.summary]);
    const csv = [header, ...lines].map(row => row.map(csvCell).join(',')).join('\n');
    downloadFile(csv, suffixedName('shopping-list'), 'text/csv');
  }

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
        Loading worklist…
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 980, margin: '0 auto', padding: '24px 28px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={onBack}
            style={{ background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)', padding: '5px 12px', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 12, fontWeight: 600 }}
          >
            ← Dashboard
          </button>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>Worklist</h1>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            value={filterAddress}
            onChange={e => setFilterAddress(e.target.value)}
            style={{ padding: '6px 10px', fontSize: 12, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-default)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', cursor: 'pointer' }}
          >
            <option value="">All properties ({allAddresses.length})</option>
            {allAddresses.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <button onClick={exportCsv}          style={exportBtnStyle}>Export CSV</button>
          <button onClick={exportShoppingList} style={exportBtnStyle}>Shopping List</button>
          {filterAddress && (
            <button onClick={() => window.print()} style={exportBtnStyle}>Print</button>
          )}
          {themeButton}
        </div>
      </div>

      {error && (
        <div style={{ padding: 12, background: 'rgba(255, 99, 99, 0.08)', border: '1px solid rgba(255, 99, 99, 0.2)', borderRadius: 'var(--radius-sm)', color: '#f87171', fontSize: 12, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* Summary chip */}
      <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--text-muted)', marginBottom: 18 }}>
        <span><strong style={{ color: 'var(--text-primary)' }}>{gather.length}</strong> Gather</span>
        <span><strong style={{ color: 'var(--text-primary)' }}>{tasks.length}</strong> Tasks</span>
        <span><strong style={{ color: 'var(--text-primary)' }}>{gather.filter(r => r.done_at).length + tasks.filter(r => r.done_at).length}</strong> Done</span>
      </div>

      {/* Gather */}
      <div style={sectionTitleStyle}>Gather — to bring on-site</div>
      {gather.length === 0 ? (
        <EmptyHint>Nothing flagged to gather. Toggle <em>Need</em> on a row in any property's Turnover Edit form.</EmptyHint>
      ) : (
        renderGather(gather, filterAddress, toggleRowField)
      )}

      <div style={{ height: 24 }} />

      {/* Tasks */}
      <div style={sectionTitleStyle}>Tasks — work on-site</div>
      {tasks.length === 0 ? (
        <EmptyHint>No tasks flagged.</EmptyHint>
      ) : (
        renderTasks(tasks, filterAddress, toggleRowField)
      )}
    </div>
  );
}

function renderGather(gather, filterAddress, toggleRowField) {
  // Group by category. Within each category, sort by address for predictable rendering.
  const byCategory = {};
  for (const r of gather) {
    if (!byCategory[r.category]) byCategory[r.category] = [];
    byCategory[r.category].push(r);
  }
  const cats = Object.keys(byCategory).sort();
  return cats.map(cat => (
    <div key={cat} style={{ marginBottom: 16 }}>
      <div style={groupTitleStyle}>{CATEGORY_LABELS[cat] || cat}</div>
      {byCategory[cat]
        .slice()
        .sort((a, b) => (a.unit_address || '').localeCompare(b.unit_address || ''))
        .map(row => <GatherRow key={row.id} row={row} showAddress={!filterAddress} onToggle={toggleRowField} />)}
    </div>
  ));
}

function renderTasks(tasks, filterAddress, toggleRowField) {
  // Group by section, then by unit_address inside each section
  const bySection = {};
  for (const r of tasks) {
    let key;
    if (r.category === 'condition')   key = sectionForConditionItem(r.payload?.item);
    else if (r.category === 'paint')  key = 'Paint';
    else                              key = 'Other tasks';
    if (!bySection[key]) bySection[key] = [];
    bySection[key].push(r);
  }
  return Object.entries(bySection).map(([section, list]) => {
    const byUnit = {};
    for (const r of list) {
      const k = r.unit_address || '(no address)';
      if (!byUnit[k]) byUnit[k] = [];
      byUnit[k].push(r);
    }
    return (
      <div key={section} style={{ marginBottom: 18 }}>
        <div style={groupTitleStyle}>{section}</div>
        {Object.entries(byUnit)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([address, rs]) => (
            <div key={address} style={{ marginBottom: 10 }}>
              {!filterAddress && (
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4, fontWeight: 600 }}>{address}</div>
              )}
              {rs.map(row => <TaskRow key={row.id} row={row} onToggle={toggleRowField} />)}
            </div>
          ))}
      </div>
    );
  });
}

function GatherRow({ row, showAddress, onToggle }) {
  const gathered = !!row.gathered_at;
  const done = !!row.done_at;
  return (
    <div style={{ ...rowStyle, opacity: done ? 0.55 : 1 }}>
      <div style={{
        flex: 1, fontSize: 13,
        color: done ? 'var(--text-muted)' : 'var(--text-primary)',
        textDecoration: done ? 'line-through' : 'none',
      }}>
        {summarizeRow(row)}
        {showAddress && (
          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>{row.unit_address}</div>
        )}
      </div>
      <Checkbox label="Gathered" checked={gathered} onChange={v => onToggle(row.id, 'gathered_at', v)} />
      <Checkbox label="Done"     checked={done}     onChange={v => onToggle(row.id, 'done_at', v)} />
    </div>
  );
}

function TaskRow({ row, onToggle }) {
  const done = !!row.done_at;
  return (
    <div style={{ ...rowStyle, opacity: done ? 0.55 : 1 }}>
      <div style={{
        flex: 1, fontSize: 13,
        color: done ? 'var(--text-muted)' : 'var(--text-primary)',
        textDecoration: done ? 'line-through' : 'none',
      }}>
        {summarizeRow(row)}
        {row.payload?.notes && (
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3, fontStyle: 'italic' }}>{row.payload.notes}</div>
        )}
      </div>
      <Checkbox label="Done" checked={done} onChange={v => onToggle(row.id, 'done_at', v)} />
    </div>
  );
}

function Checkbox({ label, checked, onChange }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      style={{
        ...toggleBaseStyle,
        background: checked ? '#EAF3DE' : 'var(--bg-surface)',
        border: `1px solid ${checked ? '#639922' : 'var(--border-default)'}`,
        color: checked ? '#3B6D11' : 'var(--text-muted)',
      }}
    >
      <span style={{ display: 'inline-block', width: 10, height: 10, lineHeight: '10px', textAlign: 'center', fontWeight: 800 }}>
        {checked ? '✓' : ''}
      </span>
      {label}
    </button>
  );
}

function EmptyHint({ children }) {
  return (
    <div style={{ ...rowStyle, fontSize: 12, color: 'var(--text-dim)', fontStyle: 'italic' }}>
      {children}
    </div>
  );
}

const exportBtnStyle = {
  background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-sm)', padding: '6px 12px',
  color: 'var(--text-primary)', fontSize: 12, fontWeight: 600,
  cursor: 'pointer', whiteSpace: 'nowrap',
};

function csvCell(val) {
  const s = String(val ?? '');
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function suffixedName(base) {
  const d = new Date().toISOString().slice(0, 10);
  return `${base}-${d}.csv`;
}

function downloadFile(content, filename, mime) {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
