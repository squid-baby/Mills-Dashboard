import { GC } from '../data/units';

export default function SummaryBar({ units }) {
  const counts = {};
  units.forEach(u => { counts[u.group] = (counts[u.group] || 0) + 1; });

  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '8px 0' }}>
      {Object.keys(GC).map(key => {
        const cfg = GC[key];
        return (
          <div key={key} style={{
            display: 'flex', alignItems: 'center', gap: 5,
            background: cfg.color + '15', border: '1px solid ' + cfg.color + '33',
            borderRadius: 6, padding: '4px 10px',
          }}>
            <span style={{ color: cfg.color, fontSize: 14 }}>{cfg.icon}</span>
            <span style={{ color: cfg.color, fontSize: 12, fontWeight: 700 }}>{counts[key] || 0}</span>
            <span style={{ color: '#a1a1aa', fontSize: 11 }}>{cfg.label}</span>
          </div>
        );
      })}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 5,
        background: '#ffffff08', borderRadius: 6, padding: '4px 10px',
      }}>
        <span style={{ color: '#f4f4f5', fontSize: 12, fontWeight: 700 }}>{units.length}</span>
        <span style={{ color: '#a1a1aa', fontSize: 11 }}>total units</span>
      </div>
    </div>
  );
}
