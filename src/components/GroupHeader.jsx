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
      // Fallback for non-HTTPS / no clipboard API
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

  const btnStyle = (active) => ({
    background: active ? '#22c55e33' : '#27272a',
    color: active ? '#4ade80' : '#71717a',
    border: '1px solid ' + (active ? '#22c55e55' : '#3f3f46'),
    borderRadius: 4, padding: '2px 8px', fontSize: 10, fontWeight: 600,
    cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s ease',
    whiteSpace: 'nowrap',
  });

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      marginBottom: 10, paddingBottom: 6, borderBottom: '1px solid #1a1a1e',
      flexWrap: 'wrap',
    }}>
      <h2 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: '#e4e4e7', letterSpacing: -0.3 }}>
        {label}
      </h2>
      <span style={{
        fontSize: 11, color: '#52525b', background: '#18181b',
        padding: '1px 6px', borderRadius: 3,
      }}>
        {units.length}{units.length === 1 ? ' unit' : ' units'}
      </span>

      {currentEmails && (
        <button
          onClick={(e) => { e.stopPropagation(); copyToClipboard(currentEmails, setCopiedCurrent); }}
          style={btnStyle(copiedCurrent)}
        >
          {copiedCurrent ? 'Copied!' : 'Copy Current Emails'}
        </button>
      )}

      {futureEmails && (
        <button
          onClick={(e) => { e.stopPropagation(); copyToClipboard(futureEmails, setCopiedFuture); }}
          style={btnStyle(copiedFuture)}
        >
          {copiedFuture ? 'Copied!' : 'Copy Future Emails'}
        </button>
      )}
    </div>
  );
}
