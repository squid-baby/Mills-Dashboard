import { GC } from '../data/units';

export default function SummaryBar({ units }) {
  const counts = {};
  units.forEach(u => { counts[u.group] = (counts[u.group] || 0) + 1; });

  return (
    <div style={{
      display: 'flex', gap: 4, flexWrap: 'wrap',
      paddingBottom: 12,
    }}>
      {Object.keys(GC).map(key => {
        const cfg = GC[key];
        const count = counts[key] || 0;
        return (
          <div key={key} style={{
            display: 'flex', alignItems: 'center', gap: 5,
            background: count > 0 ? cfg.color + '0c' : 'transparent',
            borderRadius: 'var(--radius-sm)',
            padding: '3px 8px',
            transition: 'all var(--duration-fast) ease',
            opacity: count > 0 ? 1 : 0.4,
          }}>
            <span style={{
              fontSize: 13, fontWeight: 700,
              color: cfg.color,
              fontVariantNumeric: 'tabular-nums',
            }}>
              {count}
            </span>
            <span style={{
              fontSize: 11, color: 'var(--text-muted)',
              fontWeight: 500,
            }}>
              {cfg.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
