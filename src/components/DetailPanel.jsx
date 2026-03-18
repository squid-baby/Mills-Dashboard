import { useState, useEffect } from 'react';
import { GC } from '../data/units';
import StatusBadge from './StatusBadge';

export default function DetailPanel({ unit, onClose, onAddNote }) {
  const [noteText, setNoteText] = useState('');
  const [localNotes, setLocalNotes] = useState(unit._userNotes || []);
  const c = GC[unit.group] || GC.unknown;

  useEffect(() => {
    setLocalNotes(unit._userNotes || []);
    setNoteText('');
  }, [unit.id]);

  function handleAdd() {
    if (!noteText.trim()) return;
    const n = { text: noteText.trim(), time: new Date().toLocaleString(), by: 'Andrea' };
    const updated = [n, ...localNotes];
    setLocalNotes(updated);
    onAddNote(unit.id, updated);
    setNoteText('');
  }

  const factPairs = [
    ['Bedrooms', unit.beds + ' BR'],
    ['Lease End', unit.leaseEnd],
    ['Owner', unit.owner],
    ['Area', unit.area],
    ['Lease Signed', unit.allSigned ? '✅ Yes' : '❌ No'],
    ['Deposit Paid', unit.allDeposit ? '✅ Yes' : '❌ No'],
  ];
  if (unit.utilities) {
    factPairs.push(['Utilities Included', unit.utilities]);
  }

  return (
    <div style={{
      position: 'fixed', top: 0, right: 0, bottom: 0,
      width: 'min(440px, 92vw)', background: '#18181b',
      borderLeft: '2px solid ' + c.color + '44', zIndex: 100,
      overflowY: 'auto', boxShadow: '-8px 0 40px #00000088',
    }}>
      <div style={{ padding: 20 }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#f4f4f5', letterSpacing: -0.5 }}>
              {unit.address}
            </h2>
            <div style={{ marginTop: 6 }}><StatusBadge group={unit.group} /></div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: '#27272a', border: 'none', color: '#a1a1aa', cursor: 'pointer',
              width: 32, height: 32, borderRadius: 6, fontSize: 18, lineHeight: '32px',
            }}
          >
            ×
          </button>
        </div>

        {/* Substate */}
        <div style={{
          background: c.color + '11', border: '1px solid ' + c.color + '33',
          borderRadius: 6, padding: '8px 12px', marginBottom: 16, fontSize: 13, color: c.text,
        }}>
          {unit.substate}
        </div>

        {/* Facts grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
          {factPairs.map(([label, value]) => (
            <div key={label} style={{ background: '#27272a', borderRadius: 6, padding: '6px 10px' }}>
              <div style={{ fontSize: 10, color: '#71717a', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
              <div style={{ fontSize: 13, color: '#e4e4e7', fontWeight: 600 }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Current Residents */}
        <div style={{ marginBottom: 16 }}>
          <h3 style={{ margin: '0 0 8px', fontSize: 12, color: '#71717a', textTransform: 'uppercase', letterSpacing: 1 }}>
            Current Residents ({unit.residents.length})
          </h3>
          {unit.residents.map((r, i) => (
            <div key={i} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '6px 0', borderBottom: '1px solid #27272a',
            }}>
              <div>
                <div style={{ fontSize: 13, color: '#e4e4e7', fontWeight: 500 }}>{r.name}</div>
                <div style={{ fontSize: 11, color: '#71717a' }}>{r.email}</div>
              </div>
              <span style={{
                fontSize: 10, padding: '2px 6px', borderRadius: 3, fontWeight: 600,
                background: r.status === 'renewing' ? '#22c55e22' : r.status === 'leaving' ? '#f9731622' : '#a1a1aa22',
                color: r.status === 'renewing' ? '#4ade80' : r.status === 'leaving' ? '#fb923c' : '#a1a1aa',
              }}>
                {r.status}
              </span>
            </div>
          ))}
        </div>

        {/* Next Year Residents */}
        {unit.nextResidents.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <h3 style={{ margin: '0 0 8px', fontSize: 12, color: '#71717a', textTransform: 'uppercase', letterSpacing: 1 }}>
              Next Year Residents ({unit.nextResidents.length})
            </h3>
            {unit.nextResidents.map((r, i) => (
              <div key={i} style={{ padding: '6px 0', borderBottom: '1px solid #27272a' }}>
                <div style={{ fontSize: 13, color: '#a78bfa', fontWeight: 500 }}>{r.name}</div>
                <div style={{ fontSize: 11, color: '#71717a' }}>
                  {r.email}{r.phone ? ' · ' + r.phone : ''}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Spreadsheet Notes */}
        {(unit.notes || unit.turnoverNotes) && (
          <div style={{ marginBottom: 16, background: '#27272a', borderRadius: 6, padding: 10 }}>
            <h3 style={{ margin: '0 0 6px', fontSize: 12, color: '#71717a', textTransform: 'uppercase', letterSpacing: 1 }}>
              Spreadsheet Notes
            </h3>
            {unit.notes && <div style={{ fontSize: 12, color: '#d4d4d8', marginBottom: 4 }}>{unit.notes}</div>}
            {unit.turnoverNotes && (
              <div style={{ fontSize: 12, color: '#fbbf24', marginTop: 4 }}>
                {"🔧 Turnover: " + unit.turnoverNotes}
              </div>
            )}
          </div>
        )}

        {/* Quick Notes */}
        <div style={{ marginBottom: 16 }}>
          <h3 style={{ margin: '0 0 8px', fontSize: 12, color: '#71717a', textTransform: 'uppercase', letterSpacing: 1 }}>
            Quick Notes
          </h3>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            <input
              type="text" value={noteText}
              onChange={e => setNoteText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
              placeholder="Type a note and press Enter..."
              style={{
                flex: 1, background: '#27272a', border: '1px solid #3f3f46',
                borderRadius: 6, padding: '8px 10px', color: '#e4e4e7', fontSize: 13, outline: 'none',
              }}
            />
            <button
              onClick={handleAdd}
              style={{
                background: c.color, border: 'none', borderRadius: 6,
                padding: '0 14px', color: '#000', fontWeight: 700, fontSize: 13, cursor: 'pointer',
              }}
            >
              +
            </button>
          </div>
          {localNotes.map((n, i) => (
            <div key={i} style={{
              padding: '6px 8px', background: '#27272a', borderRadius: 4,
              marginBottom: 4, borderLeft: '3px solid ' + c.color,
            }}>
              <div style={{ fontSize: 12, color: '#e4e4e7' }}>{n.text}</div>
              <div style={{ fontSize: 10, color: '#71717a', marginTop: 2 }}>{n.by} · {n.time}</div>
            </div>
          ))}
          {localNotes.length === 0 && (
            <div style={{ fontSize: 12, color: '#52525b', fontStyle: 'italic' }}>
              No notes yet. Tap here and type.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
