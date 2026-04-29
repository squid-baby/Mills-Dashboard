import { useState, useEffect } from 'react';
import {
  BLIND_WIDTHS, BLIND_DROPS,
  BULB_TYPES, BULB_TEMPS,
  STOVE_TYPES, BOWL_SHAPES,
  OUTLET_TYPES, OUTLET_COLORS, OUTLET_GANGS,
  DETECTOR_TYPES, KEY_TYPES,
  PAINT_LOCATIONS, PAINT_COLORS, PAINT_FINISHES,
  CONDITION_GROUPS, OVERALL_CONDITIONS,
  sectionForConditionItem,
} from '../config/turnoverOptions';

// ─── Styles ──────────────────────────────────────────────────────────────────
const sectionTitleStyle = {
  fontSize: 11, fontWeight: 700, color: 'var(--text-muted)',
  textTransform: 'uppercase', letterSpacing: '0.08em',
  marginBottom: 12, paddingBottom: 6,
  borderBottom: '1px solid var(--border-subtle)',
};

const itemBlockStyle = {
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-md)',
  padding: '12px 14px',
  marginBottom: 8,
};

const fieldLabelStyle = {
  fontSize: 10, color: 'var(--text-muted)',
  textTransform: 'uppercase', letterSpacing: '0.05em',
  fontWeight: 600, marginBottom: 4,
};

const inputStyle = {
  width: '100%', padding: '7px 10px', fontSize: 13,
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-sm)',
  background: 'var(--bg-input, var(--bg-elevated))',
  color: 'var(--text-primary)',
  fontFamily: 'inherit', outline: 'none',
};

const selectStyle = { ...inputStyle, cursor: 'pointer' };

const qtyStyle = { ...inputStyle, width: 60, textAlign: 'center' };

const addBtnStyle = {
  fontSize: 12, color: 'var(--text-muted)',
  background: 'none',
  border: '1px dashed var(--border-default)',
  borderRadius: 'var(--radius-sm)',
  padding: '5px 12px',
  cursor: 'pointer', width: '100%', marginTop: 6,
};

const condBtnBase = {
  padding: '7px 6px', fontSize: 11, fontWeight: 600,
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-sm)',
  background: 'var(--bg-surface)',
  color: 'var(--text-muted)',
  cursor: 'pointer', textAlign: 'center',
  transition: 'all 100ms ease',
};

const condColors = {
  good: { bg: '#EAF3DE', color: '#3B6D11', border: '#639922' },
  next: { bg: '#FAEEDA', color: '#854F0B', border: '#BA7517' },
  now:  { bg: '#FCEBEB', color: '#A32D2D', border: '#E24B4A' },
};

const notesFieldStyle = {
  ...inputStyle,
  fontSize: 12,
  background: 'var(--bg-surface)',
  resize: 'none',
  minHeight: 32,
};

const dividerStyle = {
  height: 1,
  background: 'var(--border-subtle)',
  margin: '20px 0',
};

const toggleBaseStyle = {
  padding: '6px 10px', fontSize: 11, fontWeight: 600,
  borderRadius: 'var(--radius-sm)', cursor: 'pointer',
  whiteSpace: 'nowrap', transition: 'all 100ms ease',
  display: 'inline-flex', alignItems: 'center', gap: 4,
};

// ─── Top-level component ─────────────────────────────────────────────────────
export default function TurnoverTab({ unit, accentColor }) {
  const [view, setView] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [notes, setNotes] = useState([]);

  const [inspectionId, setInspectionId] = useState(null);
  const [rows, setRows] = useState([]);

  const [inspectorName, setInspectorName] = useState('');
  const [inspectionDate, setInspectionDate] = useState(new Date().toISOString().split('T')[0]);

  const [blinds, setBlinds] = useState([]);
  const [bulbs, setBulbs] = useState([]);
  const [stoveParts, setStoveParts] = useState([]);
  const [toiletSeats, setToiletSeats] = useState([]);
  const [outlets, setOutlets] = useState([]);
  const [detectors, setDetectors] = useState([]);
  const [keys, setKeys] = useState([]);
  const [customItems, setCustomItems] = useState([]);
  const [paintRows, setPaintRows] = useState([]);

  // Snapshot of the most recent saved blinds — used to pre-fill `+ add window`.
  const [blindDefault, setBlindDefault] = useState({ width: BLIND_WIDTHS[0], drop: BLIND_DROPS[0] });

  const [conditions, setConditions] = useState(() => {
    const init = {};
    CONDITION_GROUPS.forEach(g => g.items.forEach(item => {
      init[item] = { condition: null, notes: '', needs_this: false };
    }));
    return init;
  });

  const [overallCondition, setOverallCondition] = useState(null);
  const [overallNotes, setOverallNotes] = useState('');

  // Load existing inspection
  useEffect(() => {
    setLoading(true);
    fetch(`/api/get-inspection?address=${encodeURIComponent(unit.address)}`)
      .then(r => r.json())
      .then(data => {
        if (data.inspection) {
          const d = data.inspection;
          setInspectionId(d.id || null);
          setRows(Array.isArray(d.rows) ? d.rows : []);
          setInspectorName(d.inspector || '');
          setInspectionDate(d.date || new Date().toISOString().split('T')[0]);
          setOverallCondition(d.overallCondition || null);
          setOverallNotes(d.overallNotes || '');
          if (d.items) {
            if (d.items.blinds?.length) {
              setBlinds(d.items.blinds);
              const first = d.items.blinds[0] || {};
              setBlindDefault({ width: first.width || BLIND_WIDTHS[0], drop: first.drop || BLIND_DROPS[0] });
            }
            if (d.items.bulbs?.length) setBulbs(d.items.bulbs);
            if (d.items.stoveParts?.length) setStoveParts(d.items.stoveParts);
            if (d.items.toiletSeats?.length) setToiletSeats(d.items.toiletSeats);
            if (d.items.outlets?.length) setOutlets(d.items.outlets);
            if (Array.isArray(d.items.detectors)) {
              if (d.items.detectors.length) setDetectors(d.items.detectors);
            } else if (d.items.detectors && typeof d.items.detectors === 'object' && Number(d.items.detectors.qty) > 0) {
              setDetectors([d.items.detectors]); // legacy: single object pre-array conversion
            }
            if (d.items.keys?.length) setKeys(d.items.keys);
            if (d.items.customItems?.length) setCustomItems(d.items.customItems);
            if (d.items.paintRows?.length) setPaintRows(d.items.paintRows);
            if (d.items.conditions) {
              setConditions(prev => {
                const merged = { ...prev };
                for (const [k, v] of Object.entries(d.items.conditions)) {
                  merged[k] = { condition: null, notes: '', needs_this: false, ...v };
                }
                return merged;
              });
            }
          }
        }
      })
      .catch(() => { /* no existing inspection — that's fine */ })
      .finally(() => setLoading(false));
  }, [unit.address]);

  // Load notes (latest 2-3 surface above the form in Edit)
  useEffect(() => {
    if (!unit.address) return;
    fetch(`/api/get-notes?address=${encodeURIComponent(unit.address)}`)
      .then(r => r.json())
      .then(data => setNotes(Array.isArray(data.notes) ? data.notes.slice(0, 3) : []))
      .catch(() => setNotes([]));
  }, [unit.address]);

  async function handleSave() {
    setSaving(true);
    try {
      const inspection = {
        inspector: inspectorName,
        date: inspectionDate,
        overallCondition,
        overallNotes,
        items: {
          blinds, bulbs, stoveParts, toiletSeats, outlets,
          detectors, keys, customItems, paintRows, conditions,
        },
      };
      const res = await fetch('/api/save-inspection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: unit.address, inspection }),
      });
      if (res.ok) {
        const j = await res.json();
        if (j.inspection_id) setInspectionId(j.inspection_id);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
        // Refetch rows so Overview reflects post-save state including new ids.
        try {
          const r2 = await fetch(`/api/get-inspection?address=${encodeURIComponent(unit.address)}`);
          const j2 = await r2.json();
          if (j2.inspection?.rows) setRows(j2.inspection.rows);
        } catch { /* keep existing rows */ }
      }
    } catch (err) {
      console.error('Save inspection failed:', err);
    } finally {
      setSaving(false);
    }
  }

  // Optimistic per-item state toggle for the Overview checklist.
  async function toggleRowField(rowId, field, value) {
    const ts = value ? new Date().toISOString() : null;
    const prev = rows;
    setRows(rs => rs.map(r => r.id === rowId ? { ...r, [field]: ts, ...(field === 'done_at' ? { done_by: value ? 'Team' : null } : {}) } : r));
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

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Loading inspection data...</div>;
  }

  const isEdit = view === 'edit';

  return (
    <div>
      {/* Header with view toggle */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Turnover {isEdit && <span style={{ color: accentColor, marginLeft: 6 }}>· Editing</span>}
        </h3>
        <button
          onClick={() => setView(isEdit ? 'overview' : 'edit')}
          title={isEdit ? 'Done editing' : 'Edit'}
          style={{
            background: isEdit ? accentColor : 'transparent',
            border: `1px solid ${isEdit ? accentColor : 'var(--border-default)'}`,
            borderRadius: 'var(--radius-sm)',
            padding: '5px 10px', cursor: 'pointer',
            color: isEdit ? '#000' : 'var(--text-muted)',
            fontSize: 11, fontWeight: 600,
            display: 'flex', alignItems: 'center', gap: 5,
            transition: 'all var(--duration-fast) ease',
          }}
        >
          {isEdit ? (
            <>
              <svg style={{ width: 11, height: 11 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Done
            </>
          ) : (
            <>
              <svg style={{ width: 11, height: 11 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                <path d="m15 5 4 4" />
              </svg>
              Edit
            </>
          )}
        </button>
      </div>

      {isEdit ? (
        <TurnoverEdit
          unit={unit}
          accentColor={accentColor}
          notes={notes}
          inspectorName={inspectorName} setInspectorName={setInspectorName}
          inspectionDate={inspectionDate} setInspectionDate={setInspectionDate}
          blinds={blinds} setBlinds={setBlinds}
          bulbs={bulbs} setBulbs={setBulbs}
          stoveParts={stoveParts} setStoveParts={setStoveParts}
          toiletSeats={toiletSeats} setToiletSeats={setToiletSeats}
          outlets={outlets} setOutlets={setOutlets}
          detectors={detectors} setDetectors={setDetectors}
          keys={keys} setKeys={setKeys}
          customItems={customItems} setCustomItems={setCustomItems}
          paintRows={paintRows} setPaintRows={setPaintRows}
          conditions={conditions} setConditions={setConditions}
          overallCondition={overallCondition} setOverallCondition={setOverallCondition}
          overallNotes={overallNotes} setOverallNotes={setOverallNotes}
          blindDefault={blindDefault}
          onSave={handleSave}
          saving={saving} saved={saved}
        />
      ) : (
        <TurnoverOverview
          rows={rows}
          inspectionId={inspectionId}
          inspectionDate={inspectionDate}
          inspector={inspectorName}
          overallCondition={overallCondition}
          onToggle={toggleRowField}
          onEditClick={() => setView('edit')}
        />
      )}
    </div>
  );
}

// ─── Overview (read-only Gather + Tasks) ─────────────────────────────────────

const CATEGORY_LABELS = {
  blinds: 'Blinds',
  bulbs: 'Bulbs',
  stove_parts: 'Stove parts',
  toilet_seats: 'Toilet seats',
  outlets: 'Outlets / switches',
  detectors: 'Smoke / CO',
  keys: 'Keys / fobs',
  custom: 'Other',
  paint: 'Paint',
  condition: 'Inspection',
};

function summarizeRow(row) {
  const p = row.payload || {};
  switch (row.category) {
    case 'blinds':       return `${p.qty || 1}× Blinds ${p.width || ''} × ${p.drop || ''}`;
    case 'bulbs':        return `${p.qty || 1}× ${p.type || 'Bulb'}${p.temp ? ` — ${p.temp}` : ''}`;
    case 'stove_parts':  return `${p.qty || 1}× ${p.type || 'Stove part'}${p.brand ? ` (${p.brand})` : ''}`;
    case 'toilet_seats': return `${p.qty || 1}× Toilet seat — ${p.shape || ''}`;
    case 'outlets':      return `${p.qty || 1}× ${p.type || ''}${p.color ? ` ${p.color}` : ''}${p.gang ? ` ${p.gang}` : ''}`;
    case 'detectors':    return `${p.qty || 1}× ${p.type || 'Detector'}`;
    case 'keys':         return `${p.type || 'Key'} — returned ${p.returned ?? 0}, missing ${p.missing ?? 0}`;
    case 'custom':       return `${p.qty || 1}× ${p.name || '(unnamed)'}${p.spec ? ` — ${p.spec}` : ''}`;
    case 'paint': {
      const color = p.color === 'Other' ? (p.customColor || 'Other') : (p.color || '');
      return `${p.location || ''}${color ? ` — ${color}` : ''}${p.finish ? ` (${p.finish})` : ''}`;
    }
    case 'condition':    return `${p.item || ''}${p.condition ? ` — ${p.condition}` : ''}`;
    default:             return JSON.stringify(p);
  }
}

function TurnoverOverview({ rows, inspectionId, inspectionDate, inspector, overallCondition, onToggle, onEditClick }) {
  if (!inspectionId) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-dim)', fontSize: 13, fontStyle: 'italic' }}>
        No inspection saved yet. Tap Edit to record one.
      </div>
    );
  }

  const needsRows = rows.filter(r => r.needs_this);
  const gatherRows = needsRows.filter(r => r.item_type === 'purchase');
  const taskRows = needsRows.filter(r => r.item_type === 'work');

  // Group gather rows by category for readability
  const gatherByCategory = {};
  for (const r of gatherRows) {
    const k = r.category;
    if (!gatherByCategory[k]) gatherByCategory[k] = [];
    gatherByCategory[k].push(r);
  }

  // Group task rows: condition rows by inspection section, paint as 'Paint', custom as 'Other tasks'
  const tasksBySection = {};
  for (const r of taskRows) {
    let key;
    if (r.category === 'condition')   key = sectionForConditionItem(r.payload?.item);
    else if (r.category === 'paint')  key = 'Paint';
    else                              key = 'Other tasks';
    if (!tasksBySection[key]) tasksBySection[key] = [];
    tasksBySection[key].push(r);
  }

  const overall = OVERALL_CONDITIONS.find(o => o.key === overallCondition);

  return (
    <div>
      {/* Summary line */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 12,
        fontSize: 12, color: 'var(--text-muted)',
        marginBottom: 18, paddingBottom: 12,
        borderBottom: '1px solid var(--border-subtle)',
      }}>
        {inspectionDate && <span>Inspected {new Date(inspectionDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>}
        {inspector && <span>by {inspector}</span>}
        {overall && (
          <span style={{
            padding: '1px 8px', borderRadius: 'var(--radius-sm)',
            background: overall.bg, color: overall.color, border: `1px solid ${overall.border}`,
            fontWeight: 600,
          }}>
            {overall.label}
          </span>
        )}
      </div>

      {/* Gather */}
      <div style={sectionTitleStyle}>Gather — to bring on-site</div>
      {gatherRows.length === 0 ? (
        <div style={{ ...itemBlockStyle, fontSize: 12, color: 'var(--text-dim)', fontStyle: 'italic' }}>
          Nothing flagged to gather. Open Edit and toggle <em>Need</em> on items the worker should bring.
        </div>
      ) : (
        Object.entries(gatherByCategory).map(([cat, list]) => (
          <div key={cat} style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
              {CATEGORY_LABELS[cat] || cat}
            </div>
            {list.map(row => <GatherRow key={row.id} row={row} onToggle={onToggle} />)}
          </div>
        ))
      )}

      <div style={dividerStyle} />

      {/* Tasks */}
      <div style={sectionTitleStyle}>Tasks — work on-site</div>
      {taskRows.length === 0 ? (
        <div style={{ ...itemBlockStyle, fontSize: 12, color: 'var(--text-dim)', fontStyle: 'italic' }}>
          No tasks flagged. Toggle <em>Need</em> on a condition item, paint area, or custom task to add it here.
        </div>
      ) : (
        Object.entries(tasksBySection).map(([section, list]) => (
          <div key={section} style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
              {section}
            </div>
            {list.map(row => <TaskRow key={row.id} row={row} onToggle={onToggle} />)}
          </div>
        ))
      )}

      <div style={{ marginTop: 24, textAlign: 'center' }}>
        <button onClick={onEditClick} style={{ ...addBtnStyle, width: 'auto', padding: '6px 16px' }}>
          Edit inspection
        </button>
      </div>
    </div>
  );
}

function GatherRow({ row, onToggle }) {
  const gathered = !!row.gathered_at;
  const done = !!row.done_at;
  return (
    <div style={{
      ...itemBlockStyle,
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '10px 12px', marginBottom: 6,
      opacity: done ? 0.55 : 1,
    }}>
      <div style={{
        flex: 1, fontSize: 13,
        color: done ? 'var(--text-muted)' : 'var(--text-primary)',
        textDecoration: done ? 'line-through' : 'none',
      }}>
        {summarizeRow(row)}
        {row.done_by && done && <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-dim)' }}>· {row.done_by}</span>}
      </div>
      <Checkbox label="Gathered" checked={gathered} onChange={v => onToggle(row.id, 'gathered_at', v)} />
      <Checkbox label="Done"     checked={done}     onChange={v => onToggle(row.id, 'done_at', v)} />
    </div>
  );
}

function TaskRow({ row, onToggle }) {
  const done = !!row.done_at;
  return (
    <div style={{
      ...itemBlockStyle,
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '10px 12px', marginBottom: 6,
      opacity: done ? 0.55 : 1,
    }}>
      <div style={{
        flex: 1, fontSize: 13,
        color: done ? 'var(--text-muted)' : 'var(--text-primary)',
        textDecoration: done ? 'line-through' : 'none',
      }}>
        {summarizeRow(row)}
        {row.payload?.notes && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3, fontStyle: 'italic' }}>{row.payload.notes}</div>}
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

// ─── Edit (form) ─────────────────────────────────────────────────────────────

function TurnoverEdit(props) {
  const {
    unit, accentColor, notes,
    inspectorName, setInspectorName, inspectionDate, setInspectionDate,
    blinds, setBlinds, bulbs, setBulbs, stoveParts, setStoveParts,
    toiletSeats, setToiletSeats, outlets, setOutlets, detectors, setDetectors,
    keys, setKeys, customItems, setCustomItems, paintRows, setPaintRows,
    conditions, setConditions, overallCondition, setOverallCondition,
    overallNotes, setOverallNotes, blindDefault,
    onSave, saving, saved,
  } = props;

  const outletDefaultColor = unit.outlet_standard_color || OUTLET_COLORS[0];

  function setNeed(setter, i, value) {
    setter(prev => prev.map((item, idx) => idx === i ? { ...item, needs_this: value } : item));
  }

  function setCustomBuy(i, value) {
    setCustomItems(prev => prev.map((item, idx) => idx === i ? { ...item, purchaseNeeded: value } : item));
  }

  return (
    <div>
      {/* Resident notes header (latest 2-3) */}
      {notes.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
            Recent resident notes
          </div>
          {notes.map(n => (
            <div key={n.id} style={{
              padding: '8px 12px', background: 'var(--bg-elevated)',
              borderRadius: 'var(--radius-sm)', marginBottom: 4,
              borderLeft: `3px solid ${accentColor}`,
            }}>
              <div style={{ fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.4 }}>{n.body}</div>
              {n.created_at && (
                <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 3 }}>
                  {new Date(n.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  {n.created_by ? ` · ${n.created_by}` : ''}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div style={{ ...sectionTitleStyle, marginTop: 0 }}>Move-Out Inspection</div>

      {/* Meta */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
        <Field label="Inspector">
          <input style={inputStyle} value={inspectorName} onChange={e => setInspectorName(e.target.value)} placeholder="Name" />
        </Field>
        <Field label="Date">
          <input type="date" style={inputStyle} value={inspectionDate} onChange={e => setInspectionDate(e.target.value)} />
        </Field>
      </div>

      <div style={dividerStyle} />

      <div style={sectionTitleStyle}>Replacement Items — To Order</div>

      {/* Blinds */}
      <ReplacementBlock title="Blinds">
        {blinds.map((b, i) => (
          <RowGrid key={i}>
            <Field label="Width"><Select value={b.width} options={BLIND_WIDTHS} onChange={v => updateList(setBlinds, i, 'width', v)} /></Field>
            <Field label="Drop"><Select value={b.drop} options={BLIND_DROPS} onChange={v => updateList(setBlinds, i, 'drop', v)} /></Field>
            <Field label="Qty"><input type="number" min="1" style={qtyStyle} value={b.qty} onChange={e => updateList(setBlinds, i, 'qty', +e.target.value)} /></Field>
            <NeedToggle value={!!b.needs_this} onChange={v => setNeed(setBlinds, i, v)} />
          </RowGrid>
        ))}
        <button style={addBtnStyle} onClick={() => setBlinds(p => [...p, { width: blindDefault.width, drop: blindDefault.drop, qty: 1, needs_this: false }])}>+ add window</button>
      </ReplacementBlock>

      {/* Light bulbs */}
      <ReplacementBlock title="Light bulbs">
        {bulbs.map((b, i) => (
          <RowGrid key={i}>
            <Field label="Type"><Select value={b.type} options={BULB_TYPES} onChange={v => updateList(setBulbs, i, 'type', v)} /></Field>
            <Field label="Temp"><Select value={b.temp} options={BULB_TEMPS} onChange={v => updateList(setBulbs, i, 'temp', v)} /></Field>
            <Field label="Qty"><input type="number" min="1" style={qtyStyle} value={b.qty} onChange={e => updateList(setBulbs, i, 'qty', +e.target.value)} /></Field>
            <NeedToggle value={!!b.needs_this} onChange={v => setNeed(setBulbs, i, v)} />
          </RowGrid>
        ))}
        <button style={addBtnStyle} onClick={() => setBulbs(p => [...p, { type: BULB_TYPES[0], temp: BULB_TEMPS[0], qty: 1, needs_this: false }])}>+ add type</button>
      </ReplacementBlock>

      {/* Stove parts */}
      <ReplacementBlock title="Stove drip pans / grates">
        {stoveParts.map((s, i) => (
          <RowGrid key={i}>
            <Field label="Type"><Select value={s.type} options={STOVE_TYPES} onChange={v => updateList(setStoveParts, i, 'type', v)} /></Field>
            <Field label="Brand"><input style={inputStyle} value={s.brand} onChange={e => updateList(setStoveParts, i, 'brand', e.target.value)} placeholder="GE, Whirlpool..." /></Field>
            <Field label="Qty"><input type="number" min="1" style={qtyStyle} value={s.qty} onChange={e => updateList(setStoveParts, i, 'qty', +e.target.value)} /></Field>
            <NeedToggle value={!!s.needs_this} onChange={v => setNeed(setStoveParts, i, v)} />
          </RowGrid>
        ))}
        <button style={addBtnStyle} onClick={() => setStoveParts(p => [...p, { type: STOVE_TYPES[0], brand: '', qty: 1, needs_this: false }])}>+ add item</button>
      </ReplacementBlock>

      {/* Toilet seats */}
      <ReplacementBlock title="Toilet seats">
        {toiletSeats.map((t, i) => (
          <RowGrid key={i} columns="1fr auto auto">
            <Field label="Bowl shape"><Select value={t.shape} options={BOWL_SHAPES} onChange={v => updateList(setToiletSeats, i, 'shape', v)} /></Field>
            <Field label="Qty"><input type="number" min="1" style={qtyStyle} value={t.qty} onChange={e => updateList(setToiletSeats, i, 'qty', +e.target.value)} /></Field>
            <NeedToggle value={!!t.needs_this} onChange={v => setNeed(setToiletSeats, i, v)} />
          </RowGrid>
        ))}
        <button style={addBtnStyle} onClick={() => setToiletSeats(p => [...p, { shape: 'Round', qty: 1, needs_this: false }])}>+ add</button>
      </ReplacementBlock>

      {/* Outlet covers */}
      <ReplacementBlock title="Outlet & switch covers">
        {outlets.map((o, i) => (
          <RowGrid key={i} columns="1fr 1fr 1fr auto auto">
            <Field label="Type"><Select value={o.type} options={OUTLET_TYPES} onChange={v => updateList(setOutlets, i, 'type', v)} /></Field>
            <Field label="Color"><Select value={o.color} options={OUTLET_COLORS} onChange={v => updateList(setOutlets, i, 'color', v)} /></Field>
            <Field label="Gang"><Select value={o.gang} options={OUTLET_GANGS} onChange={v => updateList(setOutlets, i, 'gang', v)} /></Field>
            <Field label="Qty"><input type="number" min="1" style={qtyStyle} value={o.qty} onChange={e => updateList(setOutlets, i, 'qty', +e.target.value)} /></Field>
            <NeedToggle value={!!o.needs_this} onChange={v => setNeed(setOutlets, i, v)} />
          </RowGrid>
        ))}
        <button style={addBtnStyle} onClick={() => setOutlets(p => [...p, { type: OUTLET_TYPES[0], color: outletDefaultColor, gang: '1-gang', qty: 1, needs_this: false }])}>+ add type</button>
      </ReplacementBlock>

      {/* Smoke / CO detectors */}
      <ReplacementBlock title="Smoke / CO detectors">
        {detectors.map((d, i) => (
          <RowGrid key={i} columns="1fr auto auto">
            <Field label="Type"><Select value={d.type} options={DETECTOR_TYPES} onChange={v => updateList(setDetectors, i, 'type', v)} /></Field>
            <Field label="Qty"><input type="number" min="1" style={qtyStyle} value={d.qty} onChange={e => updateList(setDetectors, i, 'qty', +e.target.value)} /></Field>
            <NeedToggle value={!!d.needs_this} onChange={v => setNeed(setDetectors, i, v)} />
          </RowGrid>
        ))}
        <button style={addBtnStyle} onClick={() => setDetectors(p => [...p, { type: DETECTOR_TYPES[0], qty: 1, needs_this: false }])}>+ add type</button>
      </ReplacementBlock>

      {/* Keys / fobs */}
      <ReplacementBlock title="Keys / fobs">
        {keys.map((k, i) => (
          <RowGrid key={i} columns="1fr auto auto auto">
            <Field label="Type"><Select value={k.type} options={KEY_TYPES} onChange={v => updateList(setKeys, i, 'type', v)} /></Field>
            <Field label="Returned"><input type="number" min="0" style={qtyStyle} value={k.returned} onChange={e => updateList(setKeys, i, 'returned', +e.target.value)} /></Field>
            <Field label="Missing"><input type="number" min="0" style={qtyStyle} value={k.missing} onChange={e => updateList(setKeys, i, 'missing', +e.target.value)} /></Field>
            <NeedToggle value={!!k.needs_this} onChange={v => setNeed(setKeys, i, v)} />
          </RowGrid>
        ))}
        <button style={addBtnStyle} onClick={() => setKeys(p => [...p, { type: 'Door key', returned: 0, missing: 0, needs_this: false }])}>+ add type</button>
      </ReplacementBlock>

      {/* Other replacements */}
      <ReplacementBlock title="Other items">
        {customItems.map((c, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
            <RowGrid columns="1fr 1fr auto auto">
              <Field label="Item"><input style={inputStyle} value={c.name} onChange={e => updateList(setCustomItems, i, 'name', e.target.value)} placeholder="Name" /></Field>
              <Field label="Spec / size"><input style={inputStyle} value={c.spec} onChange={e => updateList(setCustomItems, i, 'spec', e.target.value)} placeholder="Detail" /></Field>
              <Field label="Qty"><input type="number" min="1" style={qtyStyle} value={c.qty} onChange={e => updateList(setCustomItems, i, 'qty', +e.target.value)} /></Field>
              <NeedToggle value={!!c.needs_this} onChange={v => setNeed(setCustomItems, i, v)} />
            </RowGrid>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 11, color: 'var(--text-dim)' }}>
              <span>Goes under:</span>
              <button
                onClick={() => setCustomBuy(i, true)}
                style={{ ...toggleBaseStyle, background: c.purchaseNeeded !== false ? '#EAF3DE' : 'var(--bg-surface)', border: `1px solid ${c.purchaseNeeded !== false ? '#639922' : 'var(--border-default)'}`, color: c.purchaseNeeded !== false ? '#3B6D11' : 'var(--text-muted)' }}
              >Gather</button>
              <button
                onClick={() => setCustomBuy(i, false)}
                style={{ ...toggleBaseStyle, background: c.purchaseNeeded === false ? '#EAF3DE' : 'var(--bg-surface)', border: `1px solid ${c.purchaseNeeded === false ? '#639922' : 'var(--border-default)'}`, color: c.purchaseNeeded === false ? '#3B6D11' : 'var(--text-muted)' }}
              >Tasks</button>
            </div>
          </div>
        ))}
        <button style={addBtnStyle} onClick={() => setCustomItems(p => [...p, { name: '', spec: '', qty: 1, needs_this: false, purchaseNeeded: true }])}>+ add item</button>
      </ReplacementBlock>

      <div style={dividerStyle} />

      {/* Paint */}
      <div style={sectionTitleStyle}>Paint</div>
      {paintRows.map((p, i) => (
        <div key={i} style={itemBlockStyle}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 8 }}>
            <Field label="Location"><Select value={p.location} options={PAINT_LOCATIONS} onChange={v => updateList(setPaintRows, i, 'location', v)} /></Field>
            <Field label="Color"><Select value={p.color} options={PAINT_COLORS} onChange={v => updateList(setPaintRows, i, 'color', v)} /></Field>
            <Field label="Finish"><Select value={p.finish} options={PAINT_FINISHES} onChange={v => updateList(setPaintRows, i, 'finish', v)} /></Field>
          </div>
          {p.color === 'Other' && (
            <div style={{ marginBottom: 8 }}>
              <Field label="Color name / code">
                <input style={inputStyle} value={p.customColor || ''} onChange={e => updateList(setPaintRows, i, 'customColor', e.target.value)} placeholder="e.g. SW 7015 Repose Gray" />
              </Field>
            </div>
          )}
          <ConditionButtons value={p.condition} onChange={v => updateList(setPaintRows, i, 'condition', v)} />
          <textarea style={notesFieldStyle} rows="1" value={p.notes || ''} onChange={e => updateList(setPaintRows, i, 'notes', e.target.value)} placeholder="Notes..." />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
            <NeedToggle value={!!p.needs_this} onChange={v => setNeed(setPaintRows, i, v)} />
          </div>
        </div>
      ))}
      <button style={addBtnStyle} onClick={() => setPaintRows(p => [...p, { location: 'Living room', color: 'White', finish: 'Semi-gloss', condition: null, notes: '', customColor: '', needs_this: false }])}>+ add area</button>

      <div style={dividerStyle} />

      {/* Condition assessment */}
      <div style={sectionTitleStyle}>Condition Assessment</div>
      <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 16 }}>Good / update next turn / update now. Toggle <em>Need</em> to add to the worker checklist.</div>

      {CONDITION_GROUPS.map(group => (
        <div key={group.section} style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
            {group.section}
          </div>
          {group.items.map(item => {
            const c = conditions[item] || { condition: null, notes: '', needs_this: false };
            return (
              <div key={item} style={{ ...itemBlockStyle, marginBottom: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{item}</div>
                  <NeedToggle
                    value={!!c.needs_this}
                    onChange={v => setConditions(prev => ({ ...prev, [item]: { ...c, needs_this: v } }))}
                  />
                </div>
                <ConditionButtons
                  value={c.condition}
                  onChange={v => setConditions(prev => ({ ...prev, [item]: { ...c, condition: v } }))}
                />
                <textarea
                  style={notesFieldStyle} rows="1"
                  value={c.notes || ''}
                  onChange={e => setConditions(prev => ({ ...prev, [item]: { ...c, notes: e.target.value } }))}
                  placeholder="Notes..."
                />
              </div>
            );
          })}
        </div>
      ))}

      <div style={dividerStyle} />

      {/* Overall */}
      <div style={sectionTitleStyle}>Unit Overall Condition</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
        {OVERALL_CONDITIONS.map(q => (
          <button
            key={q.key}
            onClick={() => setOverallCondition(q.key)}
            style={{
              padding: '12px 8px', textAlign: 'center',
              border: `1px solid ${overallCondition === q.key ? q.border : 'var(--border-default)'}`,
              borderRadius: 'var(--radius-md)',
              cursor: 'pointer',
              background: overallCondition === q.key ? q.bg : 'var(--bg-surface)',
              transition: 'all 100ms ease',
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 600, color: overallCondition === q.key ? q.color : 'var(--text-primary)', marginBottom: 2 }}>{q.label}</div>
            <div style={{ fontSize: 10, color: overallCondition === q.key ? q.color : 'var(--text-muted)' }}>{q.desc}</div>
          </button>
        ))}
      </div>

      <Field label="Overall Notes">
        <textarea style={{ ...notesFieldStyle, minHeight: 80 }} rows="4" value={overallNotes} onChange={e => setOverallNotes(e.target.value)} placeholder="Tenant damage, unusual wear, items to photograph, work priority..." />
      </Field>

      <button
        onClick={onSave}
        disabled={saving}
        style={{
          width: '100%', padding: '12px 0',
          marginTop: 20, marginBottom: 20,
          background: saved ? '#34d399' : accentColor,
          border: 'none',
          borderRadius: 'var(--radius-md)',
          color: '#000', fontWeight: 700, fontSize: 14,
          cursor: saving ? 'wait' : 'pointer',
          opacity: saving ? 0.6 : 1,
          transition: 'all 200ms ease',
        }}
      >
        {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Inspection'}
      </button>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function Field({ label, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <label style={fieldLabelStyle}>{label}</label>
      {children}
    </div>
  );
}

function Select({ value, options, onChange }) {
  return (
    <select style={selectStyle} value={value} onChange={e => onChange(e.target.value)}>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

function ReplacementBlock({ title, children }) {
  return (
    <div style={{ ...itemBlockStyle, marginBottom: 10 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  );
}

function RowGrid({ columns = '1fr 1fr auto auto', children }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: columns, gap: 6, marginBottom: 6, alignItems: 'end' }}>
      {children}
    </div>
  );
}

function ConditionButtons({ value, onChange }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 6 }}>
      {[
        { key: 'good', label: 'Good' },
        { key: 'next', label: 'Next turn' },
        { key: 'now', label: 'Update now' },
      ].map(btn => {
        const active = value === btn.key;
        const c = condColors[btn.key];
        return (
          <button
            key={btn.key}
            onClick={() => onChange(value === btn.key ? null : btn.key)}
            style={{
              ...condBtnBase,
              background: active ? c.bg : condBtnBase.background,
              color: active ? c.color : condBtnBase.color,
              borderColor: active ? c.border : condBtnBase.border,
            }}
          >
            {btn.label}
          </button>
        );
      })}
    </div>
  );
}

function NeedToggle({ value, onChange }) {
  return (
    <button
      onClick={() => onChange(!value)}
      title={value ? 'Marked: bring this / do this' : 'Click to mark for the worker checklist'}
      style={{
        ...toggleBaseStyle,
        background: value ? '#EAF3DE' : 'var(--bg-surface)',
        border: `1px solid ${value ? '#639922' : 'var(--border-default)'}`,
        color: value ? '#3B6D11' : 'var(--text-muted)',
      }}
    >
      {value ? '✓ Need' : 'Need?'}
    </button>
  );
}

function updateList(setter, index, key, value) {
  setter(prev => prev.map((item, i) => i === index ? { ...item, [key]: value } : item));
}
