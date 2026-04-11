import { useState, useEffect } from 'react';
import { getGC, getAlerts, parseDate, daysUntil } from '../data/units';
import StatusBadge from './StatusBadge';
import PropertyInfoTab from './PropertyInfoTab';
import TurnoverTab from './TurnoverTab';

export default function DetailPanel({ unit, onClose, theme = 'dark' }) {
  const [noteText, setNoteText] = useState('');
  const [localNotes, setLocalNotes] = useState([]);
  const [notesLoading, setNotesLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('tenant');
  const palette = getGC(theme);
  const c = palette[unit.group] || palette.unknown;

  useEffect(() => {
    setNoteText('');
    setActiveTab('tenant');
    setNotesLoading(true);
    fetch(`/api/get-notes?unit_id=${unit.id}`)
      .then(r => r.json())
      .then(data => setLocalNotes(data.notes || []))
      .catch(() => setLocalNotes([]))
      .finally(() => setNotesLoading(false));
  }, [unit.id]);

  function handleAdd() {
    if (!noteText.trim() || saving) return;
    setSaving(true);
    fetch('/api/save-note', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ unit_id: unit.id, text: noteText.trim(), created_by: 'Team' }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.note) setLocalNotes(prev => [data.note, ...prev]);
      })
      .catch(() => { /* silent */ })
      .finally(() => setSaving(false));
    setNoteText('');
  }

  const isTurnover = ['full_turnover', 'partial_turn', 'turnover_rented', 'partial_turn_leased'].includes(unit.group);
  const alerts = getAlerts(unit);

  // Calculate turn window
  let turnWindowDays = null;
  let turnWindowColor = 'var(--text-primary)';
  if (isTurnover && unit.moveOutDate && unit.moveInDate) {
    const out = parseDate(unit.moveOutDate);
    const inn = parseDate(unit.moveInDate);
    turnWindowDays = Math.ceil((inn - out) / 864e5);
    if (turnWindowDays <= 7) turnWindowColor = '#f87171';
    else if (turnWindowDays <= 14) turnWindowColor = '#fbbf24';
    else turnWindowColor = '#34d399';
  }

  const factPairs = [
    ['Bedrooms', unit.beds + ' BR'],
    ['Lease End', unit.leaseEnd],
    ['Owner', unit.owner],
    ['Area', unit.area],
    ['Lease Signed', unit.allSigned ? 'Yes' : 'No'],
    ['Deposit Paid', unit.allDeposit ? 'Yes' : 'No'],
  ];
  if (unit.utilities) {
    factPairs.push(['Utilities', unit.utilities]);
  }
  if (isTurnover && unit.moveOutDate) {
    factPairs.push(['Move Out', unit.moveOutDate]);
  }
  if (isTurnover && unit.moveInDate) {
    factPairs.push(['Move In', unit.moveInDate]);
  }
  if (turnWindowDays !== null) {
    factPairs.push(['Turn Window', turnWindowDays + ' days']);
  }

  return (
    <div style={{
      position: 'fixed', top: 0, right: 0, bottom: 0,
      width: 'min(460px, 94vw)',
      background: 'var(--bg-surface)',
      borderLeft: '1px solid var(--border-default)',
      zIndex: 100,
      overflowY: 'auto',
      boxShadow: '-16px 0 60px rgba(0, 0, 0, 0.5)',
      animation: 'slideInPanel 300ms var(--ease)',
    }}>
      <div style={{ padding: '20px 24px' }}>
        {/* Header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
          marginBottom: 20,
        }}>
          <div>
            <h2 style={{
              margin: 0, fontSize: 20, fontWeight: 800,
              color: 'var(--text-primary)',
              letterSpacing: '-0.02em', lineHeight: 1.2,
              fontFamily: "'JetBrains Mono', monospace",
            }}>
              {unit.address}
            </h2>
            <div style={{ marginTop: 8 }}><StatusBadge group={unit.group} theme={theme} /></div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-default)',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              width: 32, height: 32,
              borderRadius: 'var(--radius-sm)',
              fontSize: 16, lineHeight: '30px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all var(--duration-fast) ease',
            }}
            onMouseEnter={e => {
              e.target.style.background = 'var(--bg-hover)';
              e.target.style.color = 'var(--text-primary)';
            }}
            onMouseLeave={e => {
              e.target.style.background = 'var(--bg-elevated)';
              e.target.style.color = 'var(--text-muted)';
            }}
          >
            x
          </button>
        </div>

        {/* Tab bar */}
        <div style={{
          display: 'flex',
          background: 'var(--bg-elevated)',
          borderRadius: 'var(--radius-md)',
          padding: 3,
          marginBottom: 20,
          border: '1px solid var(--border-subtle)',
        }}>
          {[
            { key: 'tenant', label: 'Tenant Info' },
            { key: 'property', label: 'Property Info' },
            ...(isTurnover ? [{ key: 'turnover', label: 'Turnover' }] : []),
          ].map(tab => (
            <button
              key={tab.key}
              style={{
                flex: 1, padding: '8px 0',
                background: activeTab === tab.key ? 'var(--bg-hover)' : 'transparent',
                border: 'none',
                borderRadius: 'calc(var(--radius-md) - 3px)',
                color: activeTab === tab.key ? 'var(--text-primary)' : 'var(--text-muted)',
                fontSize: 12, fontWeight: 600,
                cursor: 'pointer',
                transition: 'all var(--duration-fast) var(--ease)',
                letterSpacing: '0.02em',
              }}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'tenant' && (
          <div style={{ animation: 'fadeIn 200ms ease' }}>
            {/* Substate banner */}
            <div style={{
              background: theme === 'light' ? c.bg : c.color + '0c',
              border: `1px solid ${c.color}${theme === 'light' ? '50' : '20'}`,
              borderRadius: 'var(--radius-md)',
              padding: '10px 14px',
              marginBottom: alerts.length > 0 ? 10 : 20,
              fontSize: 13, fontWeight: 500,
              color: c.text,
            }}>
              {unit.substate}
            </div>

            {/* Active alerts */}
            {alerts.length > 0 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20 }}>
                {alerts.map((a, i) => (
                  <span key={i} style={{
                    fontSize: 11, fontWeight: 700, letterSpacing: '0.03em',
                    padding: '3px 10px',
                    borderRadius: 'var(--radius-sm)',
                    background: a.severity === 'critical' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(251, 191, 36, 0.15)',
                    color: a.severity === 'critical' ? '#f87171' : '#fbbf24',
                    border: `1px solid ${a.severity === 'critical' ? 'rgba(239, 68, 68, 0.25)' : 'rgba(251, 191, 36, 0.25)'}`,
                  }}>
                    {a.label}
                  </span>
                ))}
              </div>
            )}

            {/* Facts grid */}
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8,
              marginBottom: 24,
            }}>
              {factPairs.map(([label, value]) => (
                <div key={label} style={{
                  background: 'var(--bg-elevated)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '8px 12px',
                  border: '1px solid var(--border-subtle)',
                }}>
                  <div style={{
                    fontSize: 10, color: 'var(--text-muted)',
                    textTransform: 'uppercase', letterSpacing: '0.06em',
                    fontWeight: 600, marginBottom: 2,
                  }}>
                    {label}
                  </div>
                  <div style={{
                    fontSize: 14, fontWeight: 600,
                    color: label === 'Turn Window' ? turnWindowColor
                      : value === 'Yes' ? '#34d399'
                      : value === 'No' ? '#f87171'
                      : 'var(--text-primary)',
                  }}>
                    {value}
                  </div>
                </div>
              ))}
            </div>

            {/* Current Residents */}
            <Section title={`Current Residents (${unit.residents.length})`}>
              {unit.residents.map((r, i) => (
                <div key={i} style={{
                  padding: '10px 0',
                  borderBottom: i < unit.residents.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 600 }}>{r.name}</div>
                    <span style={{
                      fontSize: 11, padding: '2px 8px',
                      borderRadius: 'var(--radius-sm)',
                      fontWeight: 600,
                      background: r.status === 'renewing' ? 'rgba(52, 211, 153, 0.1)' : r.status === 'leaving' ? 'rgba(251, 146, 60, 0.1)' : 'rgba(161, 161, 170, 0.1)',
                      color: r.status === 'renewing' ? '#34d399' : r.status === 'leaving' ? '#fb923c' : 'var(--text-muted)',
                      border: `1px solid ${r.status === 'renewing' ? 'rgba(52, 211, 153, 0.15)' : r.status === 'leaving' ? 'rgba(251, 146, 60, 0.15)' : 'rgba(161, 161, 170, 0.1)'}`,
                    }}>
                      {r.status}
                    </span>
                  </div>
                  {r.email && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{r.email}</span>
                      <CopyButton text={r.email} />
                    </div>
                  )}
                  {r.phone && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{r.phone}</span>
                      <CopyButton text={r.phone} />
                    </div>
                  )}
                </div>
              ))}
            </Section>

            {/* Next Year Residents */}
            {unit.nextResidents.length > 0 && (
              <Section title={`Next Year Residents (${unit.nextResidents.length})`}>
                {unit.nextResidents.map((r, i) => (
                  <div key={i} style={{
                    padding: '10px 0',
                    borderBottom: i < unit.nextResidents.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                  }}>
                    <div style={{ fontSize: 13, color: '#a78bfa', fontWeight: 600 }}>{r.name}</div>
                    {r.email && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{r.email}</span>
                        <CopyButton text={r.email} />
                      </div>
                    )}
                    {r.phone && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{r.phone}</span>
                        <CopyButton text={r.phone} />
                      </div>
                    )}
                  </div>
                ))}
              </Section>
            )}

            {/* Spreadsheet Notes */}
            {(unit.notes || unit.turnoverNotes) && (
              <Section title="Spreadsheet Notes">
                <div style={{
                  background: 'var(--bg-elevated)',
                  borderRadius: 'var(--radius-sm)',
                  padding: 12,
                  border: '1px solid var(--border-subtle)',
                }}>
                  {unit.notes && (
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{unit.notes}</div>
                  )}
                  {unit.turnoverNotes && (
                    <div style={{
                      fontSize: 13, color: '#fbbf24', marginTop: unit.notes ? 8 : 0,
                      paddingTop: unit.notes ? 8 : 0,
                      borderTop: unit.notes ? '1px solid var(--border-subtle)' : 'none',
                      lineHeight: 1.5,
                    }}>
                      Turnover: {unit.turnoverNotes}
                    </div>
                  )}
                </div>
              </Section>
            )}

            {/* Quick Notes */}
            <Section title="Quick Notes">
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <input
                  type="text" value={noteText}
                  onChange={e => setNoteText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
                  placeholder="Add a note..."
                  style={{
                    flex: 1,
                    background: 'var(--bg-input)',
                    border: '1px solid var(--border-default)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '9px 12px',
                    color: 'var(--text-primary)',
                    fontSize: 13, outline: 'none',
                    transition: 'border-color var(--duration-fast) ease',
                  }}
                  onFocus={e => e.target.style.borderColor = 'rgba(99, 102, 241, 0.5)'}
                  onBlur={e => e.target.style.borderColor = 'var(--border-default)'}
                />
                <button
                  onClick={handleAdd}
                  disabled={saving}
                  style={{
                    background: c.color,
                    border: 'none',
                    borderRadius: 'var(--radius-sm)',
                    padding: '0 16px',
                    color: '#000', fontWeight: 700, fontSize: 16,
                    cursor: saving ? 'wait' : 'pointer',
                    opacity: saving ? 0.5 : 1,
                    transition: 'opacity var(--duration-fast) ease',
                  }}
                >
                  +
                </button>
              </div>
              {notesLoading ? (
                <div style={{ fontSize: 13, color: 'var(--text-dim)', fontStyle: 'italic' }}>
                  Loading notes...
                </div>
              ) : (
                <>
                  {localNotes.map((n, i) => (
                    <div key={n.id || i} style={{
                      padding: '8px 12px',
                      background: 'var(--bg-elevated)',
                      borderRadius: 'var(--radius-sm)',
                      marginBottom: 6,
                      borderLeft: `3px solid ${c.color}`,
                      animation: i === 0 && localNotes.length > 1 ? 'slideUp 200ms var(--ease)' : 'none',
                    }}>
                      <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.4 }}>{n.text}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>
                        {n.created_by} / {new Date(n.created_at).toLocaleString()}
                      </div>
                    </div>
                  ))}
                  {localNotes.length === 0 && (
                    <div style={{ fontSize: 13, color: 'var(--text-dim)', fontStyle: 'italic' }}>
                      No notes yet.
                    </div>
                  )}
                </>
              )}
            </Section>
          </div>
        )}

        {activeTab === 'property' && (
          <div style={{ animation: 'fadeIn 200ms ease' }}>
            <PropertyInfoTab unit={unit} accentColor={c.color} />
          </div>
        )}

        {activeTab === 'turnover' && (
          <div style={{ animation: 'fadeIn 200ms ease' }}>
            <TurnoverTab unit={unit} accentColor={c.color} />
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <h3 style={{
        margin: '0 0 10px', fontSize: 11, fontWeight: 700,
        color: 'var(--text-muted)',
        textTransform: 'uppercase', letterSpacing: '0.08em',
      }}>
        {title}
      </h3>
      {children}
    </div>
  );
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  if (!text) return null;
  return (
    <button
      onClick={e => {
        e.stopPropagation();
        navigator.clipboard.writeText(text).catch(() => {
          const ta = document.createElement('textarea');
          ta.value = text;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
        });
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      style={{
        background: copied ? 'rgba(52, 211, 153, 0.15)' : 'var(--bg-elevated)',
        border: `1px solid ${copied ? 'rgba(52, 211, 153, 0.3)' : 'var(--border-subtle)'}`,
        borderRadius: 'var(--radius-sm)',
        padding: '1px 6px',
        fontSize: 10, fontWeight: 600,
        color: copied ? '#34d399' : 'var(--text-muted)',
        cursor: 'pointer',
        transition: 'all 150ms ease',
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}
    >
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}
