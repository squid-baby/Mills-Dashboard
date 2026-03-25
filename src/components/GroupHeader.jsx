import { useState, useCallback } from 'react';

export default function GroupHeader({ label, units }) {
  const [copiedCurrent, setCopiedCurrent] = useState(false);
  const [copiedFuture, setCopiedFuture] = useState(false);

  const currentEmails = [...new Set(
    units.flatMap(u => u.residents.map(r => r.email).filter(Boolean))
  )].join(', ');

  const futureEmails = [...new Set(
    units.flatMap(u => u.nextResidents.map(r => r.email).filter(Boolean))
  )].join(', ');

  const copyToClipboard = useCallback(async (text, setCopied) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }, []);

  const CopyBtn = ({ active, onClick, children }) => (
    <button
      onClick={e => { e.stopPropagation(); onClick(); }}
      style={{
        background: active ? 'rgba(52, 211, 153, 0.12)' : 'transparent',
        color: active ? '#34d399' : 'var(--text-dim)',
        border: '1px solid ' + (active ? 'rgba(52, 211, 153, 0.2)' : 'transparent'),
        borderRadius: 'var(--radius-sm)',
        padding: '2px 8px',
        fontSize: 11, fontWeight: 500,
        cursor: 'pointer',
        transition: 'all var(--duration-fast) ease',
        whiteSpace: 'nowrap',
      }}
      onMouseEnter={e => {
        if (!active) {
          e.target.style.color = 'var(--text-secondary)';
          e.target.style.borderColor = 'var(--border-default)';
        }
      }}
      onMouseLeave={e => {
        if (!active) {
          e.target.style.color = 'var(--text-dim)';
          e.target.style.borderColor = 'transparent';
        }
      }}
    >
      {children}
    </button>
  );

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      marginBottom: 12, paddingBottom: 8,
      borderBottom: '1px solid var(--border-subtle)',
    }}>
      <h2 style={{
        margin: 0, fontSize: 15, fontWeight: 700,
        color: 'var(--text-primary)',
        letterSpacing: '-0.01em',
      }}>
        {label}
      </h2>
      <span style={{
        fontSize: 12, color: 'var(--text-muted)',
        fontWeight: 500,
        fontVariantNumeric: 'tabular-nums',
      }}>
        {units.length}
      </span>

      <div style={{ flex: 1 }} />

      {currentEmails && (
        <CopyBtn active={copiedCurrent} onClick={() => copyToClipboard(currentEmails, setCopiedCurrent)}>
          {copiedCurrent ? 'Copied!' : 'Copy emails'}
        </CopyBtn>
      )}

      {futureEmails && (
        <CopyBtn active={copiedFuture} onClick={() => copyToClipboard(futureEmails, setCopiedFuture)}>
          {copiedFuture ? 'Copied!' : 'Copy future emails'}
        </CopyBtn>
      )}
    </div>
  );
}
