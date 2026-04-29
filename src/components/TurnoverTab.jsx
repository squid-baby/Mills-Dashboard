import { useState, useEffect } from 'react';

// ─── Condition assessment categories ─────────────────────────────────────────
const CONDITION_GROUPS = [
  { section: 'Walls & ceilings', items: ['Ceilings', 'Trim & baseboards'] },
  { section: 'Flooring', items: ['Hardwood / LVP', 'Tile', 'Carpet', 'Thresholds & transitions'] },
  { section: 'Doors', items: ['Interior doors', 'Exterior doors', 'Closet doors & tracks', 'Door weatherstripping', 'Sliding door & track'] },
  { section: 'Door & cabinet hardware', items: ['Interior door knobs / levers', 'Deadbolts & exterior locks', 'Cabinet doors & hinges', 'Cabinet knobs & pulls', 'Drawer slides'] },
  { section: 'Kitchen', items: ['Cabinets (boxes & finish)', 'Countertops', 'Sink & faucet', 'Stove / range', 'Range hood & filter', 'Microwave', 'Refrigerator', 'Dishwasher'] },
  { section: 'Bathroom(s)', items: ['Vanity & cabinet', 'Sink & faucet', 'Toilet', 'Tub / shower surround', 'Shower door / rod', 'Exhaust fan', 'Caulk & grout'] },
  { section: 'Lighting & electrical', items: ['Ceiling fixtures', 'Ceiling fan(s)', 'Recessed lights', 'Under-cabinet lights', 'GFCI outlets (kitchen / bath)'] },
  { section: 'HVAC & utilities', items: ['Thermostat', 'HVAC unit / air handler', 'Supply & return vents', 'Water heater', 'Washer hookup', 'Dryer hookup / vent'] },
  { section: 'Windows', items: ['Window sashes & glass', 'Window screens', 'Window locks & hardware'] },
  { section: 'Exterior / common', items: ['Exterior sconces / porch light', 'Mailbox', 'Hose bib', 'Exterior outlets (GFCI)', 'Deck / porch / patio', 'Steps & railing', 'Parking area / carport', 'Shed / storage'] },
];

// ─── Dropdown options (from Nathan's HTML form) ──────────────────────────────
const BLIND_WIDTHS = ['23"', '24"', '27"', '29"', '30"', '31"', '34"', '35"', '36"', '46"', '48"', '58"', '60"', '64"', 'Custom'];
const BLIND_DROPS = ['36"', '42"', '48"', '54"', '60"', '64"', '72"', '84"'];
const BULB_TYPES = ['A19 E26 (standard)', 'A15 E26 (appliance)', 'B11 E12 (candelabra)', 'BR30 (flood)', 'PAR38 (outdoor)', 'GU10 (track)', 'T8 fluorescent', 'Other'];
const BULB_TEMPS = ['2700K (warm)', '3000K', '4000K (cool)', '5000K (daylight)'];
const STOVE_TYPES = ['Drip pan — 6" small', 'Drip pan — 8" large', 'Cast iron grate', 'Burner coil — small', 'Burner coil — large'];
const BOWL_SHAPES = ['Round', 'Elongated'];
const OUTLET_TYPES = ['Single outlet', 'Duplex outlet', 'GFCI outlet', 'Single switch', 'Double switch', 'Triple switch', 'Decora outlet', 'Decora switch', 'USB outlet', 'Blank plate'];
const OUTLET_COLORS = ['White', 'Ivory', 'Almond', 'Light almond', 'Gray'];
const OUTLET_GANGS = ['1-gang', '2-gang', '3-gang', '4-gang'];
const DETECTOR_TYPES = ['Smoke only', 'CO only', 'Combo'];
const KEY_TYPES = ['Door key', 'Mailbox key', 'Fob', 'Garage clicker', 'Storage key'];
const PAINT_LOCATIONS = ['Living room', 'Dining room', 'Kitchen', 'Primary bedroom', 'Bedroom 2', 'Bedroom 3', 'Bathroom', 'Hallway', 'Stairwell', 'Laundry room', 'Entryway / foyer', 'All rooms', 'Other'];
const PAINT_COLORS = ['White', 'Asiago', 'Other'];
const PAINT_FINISHES = ['Semi-gloss', 'Eggshell', 'Matte'];

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

// ─── Component ───────────────────────────────────────────────────────────────
export default function TurnoverTab({ unit, accentColor }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [inspectorName, setInspectorName] = useState('');
  const [inspectionDate, setInspectionDate] = useState(new Date().toISOString().split('T')[0]);

  // Replacement items state — start empty; inspector clicks "+ add" to record actual items.
  const [blinds, setBlinds] = useState([]);
  const [bulbs, setBulbs] = useState([]);
  const [stoveParts, setStoveParts] = useState([]);
  const [toiletSeats, setToiletSeats] = useState([]);
  const [outlets, setOutlets] = useState([]);
  const [detectors, setDetectors] = useState([]);
  const [keys, setKeys] = useState([]);
  const [customItems, setCustomItems] = useState([]);

  // Paint state
  const [paintRows, setPaintRows] = useState([]);

  // Condition state: { 'item name': { condition: 'good'|'next'|'now'|null, notes: '' } }
  const [conditions, setConditions] = useState(() => {
    const init = {};
    CONDITION_GROUPS.forEach(g => g.items.forEach(item => {
      init[item] = { condition: null, notes: '' };
    }));
    return init;
  });

  // Overall
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
          setInspectorName(d.inspector || '');
          setInspectionDate(d.date || new Date().toISOString().split('T')[0]);
          setOverallCondition(d.overallCondition || null);
          setOverallNotes(d.overallNotes || '');
          if (d.items) {
            if (d.items.blinds?.length) setBlinds(d.items.blinds);
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
            if (d.items.conditions) setConditions(prev => ({ ...prev, ...d.items.conditions }));
          }
        }
      })
      .catch(() => { /* no existing inspection — that's fine */ })
      .finally(() => setLoading(false));
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
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } catch (err) {
      console.error('Save inspection failed:', err);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Loading inspection data...</div>;
  }

  return (
    <div>
      {/* Header */}
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

      {/* ─── REPLACEMENT ITEMS ──────────────────────────────────────────── */}
      <div style={sectionTitleStyle}>Replacement Items — To Order</div>

      {/* Blinds */}
      <ReplacementBlock title="Blinds">
        {blinds.map((b, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 6, marginBottom: 6 }}>
            <Field label="Width"><Select value={b.width} options={BLIND_WIDTHS} onChange={v => updateList(setBlinds, i, 'width', v)} /></Field>
            <Field label="Drop"><Select value={b.drop} options={BLIND_DROPS} onChange={v => updateList(setBlinds, i, 'drop', v)} /></Field>
            <Field label="Qty"><input type="number" min="1" style={qtyStyle} value={b.qty} onChange={e => updateList(setBlinds, i, 'qty', +e.target.value)} /></Field>
          </div>
        ))}
        <button style={addBtnStyle} onClick={() => setBlinds(p => [...p, { width: '23"', drop: '36"', qty: 1 }])}>+ add window</button>
      </ReplacementBlock>

      {/* Light bulbs */}
      <ReplacementBlock title="Light bulbs">
        {bulbs.map((b, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 6, marginBottom: 6 }}>
            <Field label="Type"><Select value={b.type} options={BULB_TYPES} onChange={v => updateList(setBulbs, i, 'type', v)} /></Field>
            <Field label="Temp"><Select value={b.temp} options={BULB_TEMPS} onChange={v => updateList(setBulbs, i, 'temp', v)} /></Field>
            <Field label="Qty"><input type="number" min="1" style={qtyStyle} value={b.qty} onChange={e => updateList(setBulbs, i, 'qty', +e.target.value)} /></Field>
          </div>
        ))}
        <button style={addBtnStyle} onClick={() => setBulbs(p => [...p, { type: BULB_TYPES[0], temp: BULB_TEMPS[0], qty: 1 }])}>+ add type</button>
      </ReplacementBlock>

      {/* Stove parts */}
      <ReplacementBlock title="Stove drip pans / grates">
        {stoveParts.map((s, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 6, marginBottom: 6 }}>
            <Field label="Type"><Select value={s.type} options={STOVE_TYPES} onChange={v => updateList(setStoveParts, i, 'type', v)} /></Field>
            <Field label="Brand"><input style={inputStyle} value={s.brand} onChange={e => updateList(setStoveParts, i, 'brand', e.target.value)} placeholder="GE, Whirlpool..." /></Field>
            <Field label="Qty"><input type="number" min="1" style={qtyStyle} value={s.qty} onChange={e => updateList(setStoveParts, i, 'qty', +e.target.value)} /></Field>
          </div>
        ))}
        <button style={addBtnStyle} onClick={() => setStoveParts(p => [...p, { type: STOVE_TYPES[0], brand: '', qty: 1 }])}>+ add item</button>
      </ReplacementBlock>

      {/* Toilet seats */}
      <ReplacementBlock title="Toilet seats">
        {toiletSeats.map((t, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 6, marginBottom: 6 }}>
            <Field label="Bowl shape"><Select value={t.shape} options={BOWL_SHAPES} onChange={v => updateList(setToiletSeats, i, 'shape', v)} /></Field>
            <Field label="Qty"><input type="number" min="1" style={qtyStyle} value={t.qty} onChange={e => updateList(setToiletSeats, i, 'qty', +e.target.value)} /></Field>
          </div>
        ))}
        <button style={addBtnStyle} onClick={() => setToiletSeats(p => [...p, { shape: 'Round', qty: 1 }])}>+ add</button>
      </ReplacementBlock>

      {/* Outlet covers */}
      <ReplacementBlock title="Outlet & switch covers">
        {outlets.map((o, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 6, marginBottom: 6 }}>
            <Field label="Type"><Select value={o.type} options={OUTLET_TYPES} onChange={v => updateList(setOutlets, i, 'type', v)} /></Field>
            <Field label="Color"><Select value={o.color} options={OUTLET_COLORS} onChange={v => updateList(setOutlets, i, 'color', v)} /></Field>
            <Field label="Gang"><Select value={o.gang} options={OUTLET_GANGS} onChange={v => updateList(setOutlets, i, 'gang', v)} /></Field>
            <Field label="Qty"><input type="number" min="1" style={qtyStyle} value={o.qty} onChange={e => updateList(setOutlets, i, 'qty', +e.target.value)} /></Field>
          </div>
        ))}
        <button style={addBtnStyle} onClick={() => setOutlets(p => [...p, { type: OUTLET_TYPES[0], color: 'White', gang: '1-gang', qty: 1 }])}>+ add type</button>
      </ReplacementBlock>

      {/* Smoke / CO detectors */}
      <ReplacementBlock title="Smoke / CO detectors">
        {detectors.map((d, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 6, marginBottom: 6 }}>
            <Field label="Type"><Select value={d.type} options={DETECTOR_TYPES} onChange={v => updateList(setDetectors, i, 'type', v)} /></Field>
            <Field label="Qty"><input type="number" min="1" style={qtyStyle} value={d.qty} onChange={e => updateList(setDetectors, i, 'qty', +e.target.value)} /></Field>
          </div>
        ))}
        <button style={addBtnStyle} onClick={() => setDetectors(p => [...p, { type: DETECTOR_TYPES[0], qty: 1 }])}>+ add type</button>
      </ReplacementBlock>

      {/* Keys / fobs */}
      <ReplacementBlock title="Keys / fobs">
        {keys.map((k, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 6, marginBottom: 6 }}>
            <Field label="Type"><Select value={k.type} options={KEY_TYPES} onChange={v => updateList(setKeys, i, 'type', v)} /></Field>
            <Field label="Returned"><input type="number" min="0" style={qtyStyle} value={k.returned} onChange={e => updateList(setKeys, i, 'returned', +e.target.value)} /></Field>
            <Field label="Missing"><input type="number" min="0" style={qtyStyle} value={k.missing} onChange={e => updateList(setKeys, i, 'missing', +e.target.value)} /></Field>
          </div>
        ))}
        <button style={addBtnStyle} onClick={() => setKeys(p => [...p, { type: 'Door key', returned: 0, missing: 0 }])}>+ add type</button>
      </ReplacementBlock>

      {/* Other replacements */}
      <ReplacementBlock title="Other replacements">
        {customItems.map((c, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 6, marginBottom: 6 }}>
            <Field label="Item"><input style={inputStyle} value={c.name} onChange={e => updateList(setCustomItems, i, 'name', e.target.value)} placeholder="Name" /></Field>
            <Field label="Spec / size"><input style={inputStyle} value={c.spec} onChange={e => updateList(setCustomItems, i, 'spec', e.target.value)} placeholder="Detail" /></Field>
            <Field label="Qty"><input type="number" min="1" style={qtyStyle} value={c.qty} onChange={e => updateList(setCustomItems, i, 'qty', +e.target.value)} /></Field>
          </div>
        ))}
        <button style={addBtnStyle} onClick={() => setCustomItems(p => [...p, { name: '', spec: '', qty: 1 }])}>+ add item</button>
      </ReplacementBlock>

      <div style={dividerStyle} />

      {/* ─── PAINT ──────────────────────────────────────────────────────── */}
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
        </div>
      ))}
      <button style={addBtnStyle} onClick={() => setPaintRows(p => [...p, { location: 'Living room', color: 'White', finish: 'Semi-gloss', condition: null, notes: '', customColor: '' }])}>+ add area</button>

      <div style={dividerStyle} />

      {/* ─── CONDITION ASSESSMENT ────────────────────────────────────────── */}
      <div style={sectionTitleStyle}>Condition Assessment</div>
      <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 16 }}>Good / update next turn / update now</div>

      {CONDITION_GROUPS.map(group => (
        <div key={group.section} style={{ marginBottom: 20 }}>
          <div style={{
            fontSize: 10, fontWeight: 700, color: 'var(--text-muted)',
            textTransform: 'uppercase', letterSpacing: '0.06em',
            marginBottom: 8,
          }}>
            {group.section}
          </div>
          {group.items.map(item => (
            <div key={item} style={{ ...itemBlockStyle, marginBottom: 6 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>{item}</div>
              <ConditionButtons
                value={conditions[item]?.condition}
                onChange={v => setConditions(prev => ({ ...prev, [item]: { ...prev[item], condition: v } }))}
              />
              <textarea
                style={notesFieldStyle} rows="1"
                value={conditions[item]?.notes || ''}
                onChange={e => setConditions(prev => ({ ...prev, [item]: { ...prev[item], notes: e.target.value } }))}
                placeholder="Notes..."
              />
            </div>
          ))}
        </div>
      ))}

      <div style={dividerStyle} />

      {/* ─── OVERALL CONDITION ───────────────────────────────────────────── */}
      <div style={sectionTitleStyle}>Unit Overall Condition</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
        {[
          { key: 'up_to_date', label: 'Up to date', desc: 'Move-in ready', bg: '#EAF3DE', border: '#639922', color: '#3B6D11' },
          { key: 'needs_love', label: 'Needs love', desc: 'Work list exists', bg: '#FAEEDA', border: '#BA7517', color: '#854F0B' },
          { key: 'at_risk', label: 'At risk', desc: 'Deferred piling up', bg: '#FCEBEB', border: '#E24B4A', color: '#A32D2D' },
        ].map(q => (
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

      {/* Save button */}
      <button
        onClick={handleSave}
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

// ─── Helper components ───────────────────────────────────────────────────────

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

function updateList(setter, index, key, value) {
  setter(prev => prev.map((item, i) => i === index ? { ...item, [key]: value } : item));
}
