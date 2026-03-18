import { useState } from 'react';
import { GC, daysUntil } from '../data/units';

export default function Tile({ unit, onClick }) {
  const [hovered, setHovered] = useState(false);
  const c = GC[unit.group] || GC.unknown;
  const days = daysUntil(unit.leaseEnd);
  const urgent = days <= 30 && !['renewed', 'turnover_rented', 'month_to_month'].includes(unit.group);

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: c.bg,
        border: `1.5px solid ${urgent ? '#ef4444' : c.color + '44'}`,
        borderRadius: 8, padding: '10px 12px', cursor: 'pointer',
        transition: 'all 0.15s ease', position: 'relative', overflow: 'hidden',
        minHeight: 72,
        boxShadow: hovered ? '0 4px 16px #00000044' : urgent ? '0 0 12px #ef444433' : 'none',
        transform: hovered ? 'translateY(-1px)' : 'none',
      }}
    >
      {urgent && (
        <div style={{
          position: 'absolute', top: 0, right: 0, background: '#ef4444', color: '#fff',
          fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: '0 0 0 6px', letterSpacing: 0.5,
        }}>
          {days <= 0 ? 'OVERDUE' : days + 'd'}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#f4f4f5', lineHeight: 1.2, marginBottom: 3 }}>
            {unit.address}
          </div>
          <div style={{ fontSize: 11, color: '#a1a1aa', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <span>{unit.beds} BR</span>
            <span style={{ color: '#71717a' }}>&middot;</span>
            <span>{unit.leaseEnd}</span>
            {unit.area && <><span style={{ color: '#71717a' }}>&middot;</span><span>{unit.area}</span></>}
          </div>
        </div>
        <div style={{ flexShrink: 0 }}>
          <span style={{
            display: 'inline-block', width: 24, height: 24, borderRadius: 6,
            background: c.color, textAlign: 'center', lineHeight: '24px',
            fontSize: 14, color: '#000', fontWeight: 700,
          }}>
            {c.icon}
          </span>
        </div>
      </div>

      {unit.notes && (
        <div style={{
          marginTop: 6, fontSize: 10, color: '#a1a1aa', fontStyle: 'italic',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {"💬 " + unit.notes}
        </div>
      )}

      {unit._userNotes && unit._userNotes.length > 0 && (
        <div style={{ marginTop: 4, fontSize: 10, color: '#fbbf24' }}>
          {"📝 " + unit._userNotes.length + " note" + (unit._userNotes.length > 1 ? 's' : '')}
        </div>
      )}
    </div>
  );
}
