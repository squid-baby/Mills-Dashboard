import { useState } from 'react';
import { getGC, getAlerts } from '../data/units';

function formatInspectionAge(isoDate) {
  if (!isoDate) return '';
  const d = new Date(isoDate.length === 10 ? isoDate + 'T00:00:00' : isoDate);
  if (isNaN(d)) return '';
  const days = Math.floor((Date.now() - d.getTime()) / 864e5);
  if (days < 0) return '';                       // future-dated, treat as no age
  if (days === 0) return 'today';
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

export default function Tile({ unit, onClick, index = 0, theme = 'dark' }) {
  const [hovered, setHovered] = useState(false);
  const palette = getGC(theme);
  const c = palette[unit.group] || palette.unknown;
  const alerts = getAlerts(unit);
  const urgent = alerts.length > 0;
  const topAlert = alerts[0]; // worst alert for badge display

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: 'var(--bg-surface)',
        border: `1px solid ${urgent ? 'rgba(239, 68, 68, 0.3)' : 'var(--border-subtle)'}`,
        borderRadius: 'var(--radius-md)',
        padding: '14px 16px',
        cursor: 'pointer',
        transition: 'all var(--duration-normal) var(--ease)',
        position: 'relative',
        overflow: 'hidden',
        minHeight: 80,
        boxShadow: hovered
          ? `var(--shadow-md), 0 0 0 1px ${c.color}22`
          : urgent
            ? `inset 0 0 0 0 transparent, 0 0 20px rgba(239, 68, 68, 0.06)`
            : 'var(--shadow-sm)',
        transform: hovered ? 'translateY(-2px)' : 'none',
      }}
    >
      {/* Status accent bar (left edge) */}
      <div style={{
        position: 'absolute', left: 0, top: 0, bottom: 0, width: 3,
        background: c.color,
        opacity: hovered ? 1 : 0.5,
        transition: 'opacity var(--duration-fast) ease',
        borderRadius: '10px 0 0 10px',
      }} />

      {/* Alert badge */}
      {topAlert && (
        <div style={{
          position: 'absolute', top: 8, right: 8,
          background: 'rgba(239, 68, 68, 0.15)',
          color: '#f87171',
          fontSize: 10, fontWeight: 700, letterSpacing: '0.03em',
          padding: '2px 7px',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid rgba(239, 68, 68, 0.2)',
        }}>
          {topAlert.label}
        </div>
      )}

      {/* Inspection condition flag + age label */}
      {unit._inspectionCondition && (() => {
        const flagColor =
          unit._inspectionCondition === 'up_to_date' ? '#34d399' :
          unit._inspectionCondition === 'needs_love' ? '#fbbf24' :
          '#f87171';
        const condText =
          unit._inspectionCondition === 'up_to_date' ? 'Up to date' :
          unit._inspectionCondition === 'needs_love' ? 'Needs love' :
          'At risk';
        const isDraft = unit._inspectionStatus === 'draft';
        const ageLabel = formatInspectionAge(unit._inspectionDate);
        const fullTitle = `Inspection: ${condText}${isDraft ? ' (in progress)' : ''}${ageLabel ? ` · ${ageLabel}` : ''}`;
        return (
          <>
            {ageLabel && (
              <div
                title={fullTitle}
                style={{
                  position: 'absolute', bottom: 4, right: 6,
                  fontSize: 10, fontWeight: 600,
                  color: 'var(--text-dim)',
                  fontVariantNumeric: 'tabular-nums',
                  pointerEvents: 'none',
                }}
              >
                {ageLabel}
              </div>
            )}
            <div
              title={fullTitle}
              style={{
                position: 'absolute',
                bottom: 0,
                right: 0,
                overflow: 'hidden',
                borderBottomRightRadius: 'var(--radius-md)',
              }}
            >
              {isDraft ? (
                /* Draft: hollow outline triangle to signal "in progress" */
                <svg width="22" height="22" viewBox="0 0 22 22">
                  <polygon points="22,0 22,22 0,22" fill="none" stroke={flagColor} strokeWidth="2" strokeDasharray="3 2" opacity="0.85" />
                </svg>
              ) : (
                <svg width="22" height="22" viewBox="0 0 22 22">
                  <polygon points="22,0 22,22 0,22" fill={flagColor} opacity="0.85" />
                </svg>
              )}
            </div>
          </>
        );
      })()}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{
            fontSize: 13, fontWeight: 700,
            color: 'var(--text-primary)',
            lineHeight: 1.3, marginBottom: 6,
            fontFamily: "'JetBrains Mono', monospace",
            letterSpacing: '-0.01em',
          }}>
            {unit.address}
          </div>
          <div style={{
            fontSize: 12, color: 'var(--text-secondary)',
            display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap',
          }}>
            <span style={{
              fontWeight: 600, color: 'var(--text-primary)',
              fontSize: 11,
            }}>
              {unit.beds} BR
            </span>
            <span style={{ color: 'var(--text-dim)' }}>/</span>
            <span className="mono" style={{ fontSize: 11, fontVariantNumeric: 'tabular-nums' }}>
              {unit.leaseEnd}
            </span>
            {unit.area && (
              <>
                <span style={{ color: 'var(--text-dim)' }}>/</span>
                <span style={{ fontSize: 11 }}>{unit.area}</span>
              </>
            )}
          </div>
        </div>

        {/* Status icon */}
        <div style={{
          flexShrink: 0, marginTop: 2,
          width: 28, height: 28,
          borderRadius: 'var(--radius-sm)',
          background: c.color + '18',
          border: `1px solid ${c.color}30`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14,
          transition: 'all var(--duration-fast) ease',
          transform: hovered ? 'scale(1.1)' : 'scale(1)',
        }}>
          <span style={{ color: c.color }}>{c.icon}</span>
        </div>
      </div>

      {/* Notes preview */}
      {unit.notes && (
        <div style={{
          marginTop: 8, fontSize: 11,
          color: 'var(--text-muted)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          paddingTop: 8,
          borderTop: '1px solid var(--border-subtle)',
        }}>
          {unit.notes}
        </div>
      )}

      {unit._userNotes && unit._userNotes.length > 0 && (
        <div style={{
          marginTop: unit.notes ? 4 : 8,
          paddingTop: unit.notes ? 0 : 8,
          borderTop: unit.notes ? 'none' : '1px solid var(--border-subtle)',
          fontSize: 11, color: '#fbbf24', fontWeight: 500,
        }}>
          {unit._userNotes.length} note{unit._userNotes.length > 1 ? 's' : ''}
        </div>
      )}
    </div>
  );
}
