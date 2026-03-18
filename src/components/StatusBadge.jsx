import { GC } from '../data/units';

export default function StatusBadge({ group }) {
  const c = GC[group] || GC.unknown;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
      background: c.color + '22', color: c.color, letterSpacing: 0.3,
    }}>
      <span style={{ fontSize: 13 }}>{c.icon}</span> {c.label}
    </span>
  );
}
