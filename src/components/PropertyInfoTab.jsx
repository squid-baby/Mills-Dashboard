import { useState, useEffect, useCallback } from 'react';
import { PROPERTY_INFO_FIELDS } from '../config/propertyOptions';

function fieldLabel(key) {
  return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function fmtBool(val) {
  if (val === true) return 'Yes';
  if (val === false) return 'No';
  return val || '';
}

function getFieldDef(field) {
  if (typeof field === 'string') {
    return { key: field, label: fieldLabel(field), source: 'gsheet' };
  }
  return field;
}

function resolveValue(fieldDef, sheetData, gsheetData) {
  if (fieldDef.source === 'sheet') {
    return fmtBool(sheetData[fieldDef.key]);
  }
  return gsheetData[fieldDef.key] || '';
}

export default function PropertyInfoTab({ unit, accentColor }) {
  const [view, setView] = useState('overview');
  const [gsheetData, setGsheetData] = useState({});
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(() => {
    const init = {};
    PROPERTY_INFO_FIELDS.forEach(cat => { init[cat.id] = cat.pinned; });
    return init;
  });
  const [editing, setEditing] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [historyField, setHistoryField] = useState(null);
  const [quickNote, setQuickNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  const sheetData = unit.propertyInfo || {};

  const fetchData = useCallback(() => {
    setLoading(true);
    fetch(`/api/get-property-info?address=${encodeURIComponent(unit.address)}`)
      .then(r => r.json())
      .then(res => {
        setGsheetData(res.data || {});
        setHistory(res.history || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [unit.address]);

  useEffect(() => { fetchData(); }, [fetchData]);

  function toggleCategory(id) {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
  }

  function startEdit(fieldDef) {
    setEditing({ key: fieldDef.key });
    setEditValue(gsheetData[fieldDef.key] || '');
  }

  function cancelEdit() {
    setEditing(null);
    setEditValue('');
  }

  async function saveQuickNote() {
    if (!quickNote.trim()) return;
    setSavingNote(true);
    const timestamp = new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    const newEntry = `[${timestamp}] ${quickNote.trim()}`;
    const existing = gsheetData['unit_notes'] || '';
    const combined = existing ? `${existing}\n${newEntry}` : newEntry;
    try {
      const res = await fetch('/api/update-property-info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: unit.address, field: 'unit_notes', oldValue: existing, value: combined, by: 'Dashboard' }),
      });
      const result = await res.json();
      if (result.success) {
        setGsheetData(prev => ({ ...prev, unit_notes: combined }));
        setQuickNote('');
      }
    } catch { /* silent */ }
    setSavingNote(false);
  }

  async function saveEdit(fieldDef) {
    setSaving(true);
    const oldValue = gsheetData[fieldDef.key] || '';
    try {
      const res = await fetch('/api/update-property-info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: unit.address, field: fieldDef.key,
          oldValue, value: editValue, by: 'Dashboard',
        }),
      });
      const result = await res.json();
      if (result.success) {
        setGsheetData(prev => ({ ...prev, [fieldDef.key]: editValue }));
        setHistory(prev => [{
          timestamp: new Date().toISOString(),
          address: unit.address, field: fieldDef.key,
          oldValue, newValue: editValue, changedBy: 'Dashboard',
        }, ...prev]);
        if (result.notify) {
          setToast(`${fieldDef.label || fieldLabel(fieldDef.key)} updated`);
          setTimeout(() => setToast(null), 4000);
        }
      }
    } catch {}
    setSaving(false);
    setEditing(null);
    setEditValue('');
  }

  function fieldHasHistory(key) {
    return history.some(h => h.field === key);
  }

  function getFieldHistory(key) {
    return history.filter(h => h.field === key).slice(0, 10);
  }

  if (loading) {
    return (
      <div style={{
        textAlign: 'center', padding: 40,
        color: 'var(--text-dim)', fontSize: 13,
      }}>
        <div style={{
          width: 20, height: 20,
          border: '2px solid var(--border-default)',
          borderTopColor: accentColor,
          borderRadius: '50%',
          animation: 'spin 600ms linear infinite',
          margin: '0 auto 12px',
        }} />
        Loading...
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  const isEdit = view === 'edit';
  const notes = gsheetData['unit_notes'] || '';

  return (
    <div>
      {/* Toast */}
      {toast && (
        <div style={{
          background: `${accentColor}15`,
          border: `1px solid ${accentColor}25`,
          borderRadius: 'var(--radius-sm)',
          padding: '8px 14px', marginBottom: 16,
          fontSize: 12, color: 'var(--text-primary)',
          fontWeight: 500,
          animation: 'slideUp 200ms var(--ease)',
        }}>
          {toast}
        </div>
      )}

      {/* Header with view toggle */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 16,
      }}>
        <h3 style={{
          margin: 0, fontSize: 11, fontWeight: 700,
          color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em',
        }}>
          Property Info {isEdit && <span style={{ color: accentColor, marginLeft: 6 }}>· Editing</span>}
        </h3>
        <button
          onClick={() => setView(isEdit ? 'overview' : 'edit')}
          title={isEdit ? 'Done editing' : 'Edit'}
          style={{
            background: isEdit ? accentColor : 'transparent',
            border: `1px solid ${isEdit ? accentColor : 'var(--border-default)'}`,
            borderRadius: 'var(--radius-sm)',
            padding: '5px 10px', cursor: 'pointer',
            color: isEdit ? '#000' : 'var(--text-muted)',
            fontSize: 11, fontWeight: 600,
            display: 'flex', alignItems: 'center', gap: 5,
            transition: 'all var(--duration-fast) ease',
          }}
        >
          {isEdit ? (
            <>
              <svg style={{ width: 11, height: 11 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Done
            </>
          ) : (
            <>
              <svg style={{ width: 11, height: 11 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                <path d="m15 5 4 4" />
              </svg>
              Edit
            </>
          )}
        </button>
      </div>

      {/* Quick Note — input only in edit; notes display in both views */}
      <div style={{ marginBottom: 24 }}>
        {isEdit && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <input
              type="text" value={quickNote}
              onChange={e => setQuickNote(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveQuickNote(); }}
              placeholder="Add a note..."
              style={{
                flex: 1, background: 'var(--bg-input)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-sm)',
                padding: '9px 12px', color: 'var(--text-primary)',
                fontSize: 13, outline: 'none',
                transition: 'border-color var(--duration-fast) ease',
              }}
              onFocus={e => e.target.style.borderColor = 'rgba(99, 102, 241, 0.5)'}
              onBlur={e => e.target.style.borderColor = 'var(--border-default)'}
            />
            <button
              onClick={saveQuickNote}
              disabled={savingNote}
              style={{
                background: accentColor, border: 'none',
                borderRadius: 'var(--radius-sm)',
                padding: '0 16px', color: '#000', fontWeight: 700, fontSize: 16,
                cursor: 'pointer', opacity: savingNote ? 0.5 : 1,
                transition: 'opacity var(--duration-fast) ease',
              }}
            >
              {savingNote ? '...' : '+'}
            </button>
          </div>
        )}
        {notes ? (
          notes.split('\n').map((line, i) => (
            <div key={i} style={{
              padding: '8px 12px', background: 'var(--bg-elevated)',
              borderRadius: 'var(--radius-sm)', marginBottom: 4,
              borderLeft: `3px solid ${accentColor}`,
            }}>
              <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.4 }}>{line}</div>
            </div>
          ))
        ) : (
          isEdit && <div style={{ fontSize: 13, color: 'var(--text-dim)', fontStyle: 'italic' }}>No notes yet.</div>
        )}
      </div>

      {isEdit
        ? <EditCategories
            sheetData={sheetData}
            gsheetData={gsheetData}
            expanded={expanded}
            toggleCategory={toggleCategory}
            editing={editing}
            editValue={editValue}
            setEditValue={setEditValue}
            saving={saving}
            startEdit={startEdit}
            saveEdit={saveEdit}
            cancelEdit={cancelEdit}
            historyField={historyField}
            setHistoryField={setHistoryField}
            fieldHasHistory={fieldHasHistory}
            getFieldHistory={getFieldHistory}
            accentColor={accentColor}
          />
        : <Overview sheetData={sheetData} gsheetData={gsheetData} />
      }
    </div>
  );
}

// ─── Overview (read-only) ───────────────────────────────────────────────────

function Overview({ sheetData, gsheetData }) {
  const populated = PROPERTY_INFO_FIELDS
    .map(category => {
      const fields = category.fields.map(getFieldDef);
      const visible = fields
        .map(f => ({ field: f, value: resolveValue(f, sheetData, gsheetData) }))
        .filter(({ value }) => value !== '' && value != null);
      return { category, visible };
    })
    .filter(({ visible }) => visible.length > 0);

  if (populated.length === 0) {
    return (
      <div style={{
        padding: 24, textAlign: 'center',
        color: 'var(--text-dim)', fontSize: 13, fontStyle: 'italic',
      }}>
        No property info recorded yet. Tap Edit to add details.
      </div>
    );
  }

  return (
    <div>
      {populated.map(({ category, visible }) => (
        <div key={category.id} style={{ marginBottom: 18 }}>
          <div style={{
            fontSize: 10, fontWeight: 700,
            color: 'var(--text-muted)',
            textTransform: 'uppercase', letterSpacing: '0.08em',
            marginBottom: 8, paddingBottom: 5,
            borderBottom: '1px solid var(--border-subtle)',
          }}>
            {category.label}
          </div>
          {visible.map(({ field, value }) => (
            <div key={field.key} style={{
              display: 'flex', justifyContent: 'space-between',
              alignItems: 'baseline', gap: 12,
              padding: '5px 2px',
            }}>
              <span style={{
                fontSize: 12, color: 'var(--text-muted)',
              }}>
                {field.label}
              </span>
              <span style={{
                fontSize: 13, fontWeight: 500, color: 'var(--text-primary)',
                textAlign: 'right',
                whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              }}>
                {value}
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ─── Edit (existing accordion-with-inline-edit form) ────────────────────────

function EditCategories({
  sheetData, gsheetData, expanded, toggleCategory,
  editing, editValue, setEditValue, saving,
  startEdit, saveEdit, cancelEdit,
  historyField, setHistoryField,
  fieldHasHistory, getFieldHistory,
  accentColor,
}) {
  return (
    <>
      {PROPERTY_INFO_FIELDS.map(category => {
        const isOpen = expanded[category.id];
        const fields = category.fields.map(f => getFieldDef(f));

        return (
          <div key={category.id} style={{ marginBottom: 6 }}>
            <button
              onClick={() => toggleCategory(category.id)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                width: '100%',
                background: isOpen ? 'var(--bg-elevated)' : 'transparent',
                border: '1px solid ' + (isOpen ? 'var(--border-default)' : 'transparent'),
                borderRadius: 'var(--radius-sm)',
                padding: '9px 14px', cursor: 'pointer',
                color: 'var(--text-primary)',
                transition: 'all var(--duration-fast) ease',
              }}
              onMouseEnter={e => {
                if (!isOpen) e.currentTarget.style.background = 'var(--bg-elevated)';
              }}
              onMouseLeave={e => {
                if (!isOpen) e.currentTarget.style.background = 'transparent';
              }}
            >
              <span style={{
                fontSize: 12, fontWeight: 600, letterSpacing: '0.02em',
              }}>
                {category.label}
              </span>
              <svg
                style={{
                  width: 14, height: 14, color: 'var(--text-dim)',
                  transition: 'transform var(--duration-fast) var(--ease)',
                  transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                }}
                viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>

            {isOpen && (
              <div style={{
                padding: '6px 0',
                animation: 'fadeIn 150ms ease',
              }}>
                {fields.map(fieldDef => {
                  const value = resolveValue(fieldDef, sheetData, gsheetData);
                  const isEditable = fieldDef.source === 'gsheet';
                  const isEditing = editing && editing.key === fieldDef.key;
                  const hasHist = fieldHasHistory(fieldDef.key);
                  const showingHistory = historyField === fieldDef.key;

                  return (
                    <div key={fieldDef.key} style={{
                      padding: '6px 14px',
                      borderRadius: 'var(--radius-sm)',
                      transition: 'background var(--duration-fast) ease',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        minHeight: 30,
                      }}>
                        <div style={{
                          display: 'flex', alignItems: 'center', gap: 6,
                          flex: 1, minWidth: 0,
                        }}>
                          {!isEditable && (
                            <svg style={{ width: 10, height: 10, color: 'var(--text-dim)', flexShrink: 0 }}
                              viewBox="0 0 24 24" fill="currentColor">
                              <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM12 17c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zM15.1 8H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z" />
                            </svg>
                          )}
                          <span style={{
                            fontSize: 12, color: 'var(--text-muted)',
                            whiteSpace: 'nowrap',
                          }}>
                            {fieldDef.label}
                          </span>
                        </div>

                        {isEditing ? (
                          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                            {fieldDef.options ? (
                              <select
                                value={editValue}
                                onChange={e => setEditValue(e.target.value)}
                                style={{
                                  background: 'var(--bg-elevated)',
                                  border: '1px solid var(--border-strong)',
                                  borderRadius: 'var(--radius-sm)',
                                  color: 'var(--text-primary)',
                                  fontSize: 12, padding: '3px 8px', outline: 'none',
                                }}
                              >
                                <option value="">--</option>
                                {fieldDef.options.map(opt => (
                                  <option key={opt} value={opt}>{opt}</option>
                                ))}
                              </select>
                            ) : (
                              <input
                                type={fieldDef.type === 'date' ? 'date' : 'text'}
                                value={editValue}
                                onChange={e => setEditValue(e.target.value)}
                                autoFocus
                                onKeyDown={e => {
                                  if (e.key === 'Enter') saveEdit(fieldDef);
                                  if (e.key === 'Escape') cancelEdit();
                                }}
                                style={{
                                  background: 'var(--bg-elevated)',
                                  border: '1px solid var(--border-strong)',
                                  borderRadius: 'var(--radius-sm)',
                                  color: 'var(--text-primary)',
                                  fontSize: 12, padding: '3px 8px', width: 120, outline: 'none',
                                }}
                              />
                            )}
                            <button
                              onClick={() => saveEdit(fieldDef)}
                              disabled={saving}
                              style={{
                                background: accentColor, border: 'none',
                                borderRadius: 'var(--radius-sm)',
                                color: '#000', fontSize: 11, fontWeight: 700,
                                padding: '3px 10px', cursor: 'pointer',
                                opacity: saving ? 0.5 : 1,
                              }}
                            >
                              {saving ? '...' : 'Save'}
                            </button>
                            <button
                              onClick={cancelEdit}
                              style={{
                                background: 'none', border: 'none',
                                color: 'var(--text-dim)',
                                fontSize: 11, cursor: 'pointer', padding: '3px 6px',
                              }}
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{
                              fontSize: 13, fontWeight: 500,
                              color: value ? 'var(--text-primary)' : 'var(--text-dim)',
                            }}>
                              {value || '--'}
                            </span>
                            {hasHist && (
                              <button
                                onClick={() => setHistoryField(showingHistory ? null : fieldDef.key)}
                                title="View history"
                                style={{
                                  background: 'none', border: 'none', cursor: 'pointer',
                                  padding: '0 2px', display: 'flex',
                                }}
                              >
                                <svg style={{
                                  width: 12, height: 12,
                                  color: showingHistory ? accentColor : 'var(--text-dim)',
                                  transition: 'color var(--duration-fast) ease',
                                }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                                </svg>
                              </button>
                            )}
                            {isEditable && (
                              <button
                                onClick={() => startEdit(fieldDef)}
                                title="Edit"
                                style={{
                                  background: 'none', border: 'none', cursor: 'pointer',
                                  padding: '0 2px', opacity: 0.3, display: 'flex',
                                  transition: 'opacity var(--duration-fast) ease',
                                }}
                                onMouseEnter={e => e.currentTarget.style.opacity = 1}
                                onMouseLeave={e => e.currentTarget.style.opacity = 0.3}
                              >
                                <svg style={{ width: 12, height: 12, color: 'var(--text-muted)' }}
                                  viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                                  <path d="m15 5 4 4" />
                                </svg>
                              </button>
                            )}
                          </div>
                        )}
                      </div>

                      {/* History drawer */}
                      {showingHistory && (
                        <div style={{
                          marginTop: 4, marginBottom: 8, marginLeft: 16,
                          borderLeft: `2px solid ${accentColor}30`,
                          paddingLeft: 10,
                          animation: 'fadeIn 150ms ease',
                        }}>
                          {getFieldHistory(fieldDef.key).map((h, i) => (
                            <div key={i} style={{
                              fontSize: 11, color: 'var(--text-muted)', marginBottom: 6,
                              display: 'flex', gap: 8, alignItems: 'baseline',
                            }}>
                              <span style={{ color: 'var(--text-secondary)', fontWeight: 500, whiteSpace: 'nowrap' }}>
                                {new Date(h.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                              </span>
                              <span>
                                <span style={{ color: 'var(--text-dim)' }}>{h.oldValue || '(empty)'}</span>
                                <span style={{ color: 'var(--text-dim)', margin: '0 4px' }}>&rarr;</span>
                                <span style={{ color: 'var(--text-primary)' }}>{h.newValue || '(empty)'}</span>
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
