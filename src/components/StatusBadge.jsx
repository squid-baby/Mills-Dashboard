import { GC } from '../data/units';

export default function StatusBadge({ group }) {
  const c = GC[group] || GC.unknown;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 10px', borderRadius: 'var(--radius-sm)',
      fontSize: 12, fontWeight: 600,
      background: c.color + '15',
      color: c.color,
      border: `1px solid ${c.color}20`,
      letterSpacing: '0.01em',
    }}>
      <span style={{ fontSize: 12 }}>{c.icon}</span>
      {c.label}
    </span>
  );
}
