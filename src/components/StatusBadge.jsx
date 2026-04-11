import { getGC } from '../data/units';

export default function StatusBadge({ group, theme = 'dark' }) {
  const palette = getGC(theme);
  const c = palette[group] || palette.unknown;
  const bg = theme === 'light' ? c.bg : c.color + '15';
  const textColor = theme === 'light' ? c.text : c.color;
  const borderColor = theme === 'light' ? c.color + '50' : c.color + '20';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 10px', borderRadius: 'var(--radius-sm)',
      fontSize: 12, fontWeight: 600,
      background: bg,
      color: textColor,
      border: `1px solid ${borderColor}`,
      letterSpacing: '0.01em',
    }}>
      <span style={{ fontSize: 12 }}>{c.icon}</span>
      {c.label}
    </span>
  );
}
