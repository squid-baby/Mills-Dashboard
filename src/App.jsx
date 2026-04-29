import { useState, useMemo, useEffect, useCallback } from 'react';
import { GC, PRIO, SORT_OPTS, SEED_UNITS, parseDate, fmtMonth, daysUntil } from './data/units';
import StatusBadge from './components/StatusBadge';
import Tile from './components/Tile';
import DetailPanel from './components/DetailPanel';
import SummaryBar from './components/SummaryBar';
import GroupHeader from './components/GroupHeader';
import CalendarView from './components/calendar/CalendarView';
import WorklistView from './components/WorklistView';

const POLL_INTERVAL = 30 * 60 * 1000; // 30 minutes
const CACHE_KEY = 'mills_units_cache';

function loadCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function formatSyncAgo(date) {
  if (!date) return null;
  const mins = Math.round((Date.now() - date.getTime()) / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

async function exportTurnoverData(units, inspectionConditions) {
  // Filter to units with a future move-in date
  const now = new Date();
  const turnoverUnits = units.filter(u => {
    if (!u.moveInDate) return false;
    const parts = u.moveInDate.split('/').map(Number);
    const moveIn = new Date(2000 + (parts[2] < 100 ? parts[2] : parts[2] - 2000), parts[0] - 1, parts[1]);
    return moveIn >= now;
  });

  if (turnoverUnits.length === 0) {
    alert('No turnover units with future move-in dates to export.');
    return;
  }

  // Fetch dashboard notes and full inspections for all turnover units in parallel
  const [notesPerUnit, inspectionsPerUnit] = await Promise.all([
    Promise.all(
      turnoverUnits.map(u =>
        fetch(`/api/get-notes?address=${encodeURIComponent(u.address)}`)
          .then(r => r.json())
          .then(data => data.notes || [])
          .catch(() => [])
      )
    ),
    Promise.all(
      turnoverUnits.map(u =>
        fetch(`/api/get-inspection?address=${encodeURIComponent(u.address)}`)
          .then(r => r.json())
          .then(data => data.inspection || null)
          .catch(() => null)
      )
    ),
  ]);

  const conditionLabel = (c) =>
    c === 'up_to_date' ? 'Up to date' :
    c === 'needs_love' ? 'Needs love' :
    c === 'at_risk' ? 'At risk' : '';

  const escCSV = (v) => {
    const s = (v ?? '').toString();
    return s.includes(',') || s.includes('"') || s.includes('\n') ? '"' + s.replace(/"/g, '""') + '"' : s;
  };

  const daysSince = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr + (dateStr.length === 10 ? 'T00:00:00' : ''));
    if (isNaN(d)) return '';
    return Math.floor((Date.now() - d.getTime()) / 864e5);
  };

  const headers = [
    'Address', 'Beds', 'Lease End', 'Move Out', 'Move In', 'Turn Window (days)',
    'Current Tenants', 'Next Tenants',
    'Last Inspected', 'Days Ago', 'Inspector', 'Status',
    'Overall Condition',
    'Gather Pending', 'Gather Done',
    'Tasks Pending', 'Tasks Done', '% Complete',
    'Inspection Notes', 'Resident Notes', 'Dashboard Notes',
  ];
  const rows = turnoverUnits.map((u, idx) => {
    let windowDays = '';
    if (u.moveOutDate && u.moveInDate) {
      const pOut = u.moveOutDate.split('/').map(Number);
      const pIn = u.moveInDate.split('/').map(Number);
      const out = new Date(2000 + (pOut[2] < 100 ? pOut[2] : pOut[2] - 2000), pOut[0] - 1, pOut[1]);
      const inn = new Date(2000 + (pIn[2] < 100 ? pIn[2] : pIn[2] - 2000), pIn[0] - 1, pIn[1]);
      windowDays = Math.ceil((inn - out) / 864e5);
    }
    const dashboardNotes = notesPerUnit[idx].map(n => n.body).join('; ');
    const insp = inspectionsPerUnit[idx];
    const itemRows = Array.isArray(insp?.rows) ? insp.rows.filter(r => r.needs_this) : [];
    const gather = itemRows.filter(r => r.item_type === 'purchase');
    const tasks  = itemRows.filter(r => r.item_type === 'work');
    const gatherDone = gather.filter(r => r.done_at).length;
    const tasksDone  = tasks.filter(r => r.done_at).length;
    const total = itemRows.length;
    const totalDone = gatherDone + tasksDone;
    const pctComplete = total === 0 ? '' : Math.round((totalDone / total) * 100) + '%';

    return [
      u.address,
      u.beds,
      u.leaseEnd,
      u.moveOutDate,
      u.moveInDate,
      windowDays,
      u.residents.map(r => r.name).join('; '),
      u.nextResidents.map(r => r.name).join('; '),
      insp?.date || '',
      daysSince(insp?.date),
      insp?.inspector || '',
      insp?.status || '',
      conditionLabel(inspectionConditions[u.address] || ''),
      gather.length - gatherDone,
      gatherDone,
      tasks.length - tasksDone,
      tasksDone,
      pctComplete,
      insp?.overallNotes || '',
      u.notes,
      dashboardNotes,
    ].map(escCSV).join(',');
  });

  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `mills-turnovers-${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function App() {
  const [theme, setTheme] = useState(
    () => document.documentElement.getAttribute('data-theme') || 'dark'
  );

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('mills_theme', theme);
  }, [theme]);

  const [view, setView] = useState('dashboard'); // 'dashboard' | 'calendar' | 'worklist'
  const [worklistInitialAddress, setWorklistInitialAddress] = useState('');
  const [units, setUnits] = useState(() => loadCache()?.units ?? SEED_UNITS);
  const [dataSource, setDataSource] = useState(() => loadCache() ? 'cached' : 'local');
  const [lastSynced, setLastSynced] = useState(() => {
    const c = loadCache();
    return c?.fetchedAt ? new Date(c.fetchedAt) : null;
  });
  const [fetchError, setFetchError] = useState(null);

  const [sortBy, setSortBy] = useState('date');
  const [filterGroup, setFilterGroup] = useState(null);
  const [filterArea, setFilterArea] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [searchText, setSearchText] = useState('');
  const [exporting, setExporting] = useState(false);
  const [syncing, setSyncing] = useState(null); // null | 'pending' | 'ok' | 'error'
  const [inspectionConditions, setInspectionConditions] = useState({});

  // Poll Google Sheets via Netlify Function
  useEffect(() => {
    async function fetchUnits() {
      try {
        const res = await fetch('/api/get-units');
        if (!res.ok) throw new Error(res.statusText);
        const data = await res.json();
        if (data.units && data.units.length > 0) {
          const fetchedAt = new Date().toISOString();
          try { localStorage.setItem(CACHE_KEY, JSON.stringify({ units: data.units, fetchedAt })); } catch {}
          setUnits(data.units);
          setDataSource('live');
          setLastSynced(new Date(fetchedAt));
          setFetchError(null);
        } else if (data.source === 'none') {
          setFetchError('Missing Supabase credentials on Netlify');
        } else if (data.source === 'error') {
          setFetchError(data.error || 'Supabase query failed');
        }
      } catch (err) {
        setFetchError(err.message || 'Network error');
      }
    }
    fetchUnits();
    const interval = setInterval(fetchUnits, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, []);

  // Fetch inspection conditions
  useEffect(() => {
    fetch('/api/get-all-inspections')
      .then(r => r.json())
      .then(data => {
        if (data.inspections) setInspectionConditions(data.inspections);
      })
      .catch(() => { /* ignore */ });
  }, [units]); // re-fetch when units refresh

  // Enrich units with inspection conditions
  const enriched = useMemo(() =>
    units.map(u => ({
      ...u,
      _inspectionCondition: inspectionConditions[u.address] || null,
    })),
    [units, inspectionConditions]
  );

  // Filter
  const filtered = useMemo(() => {
    let list = enriched;
    if (filterGroup) list = list.filter(u => u.group === filterGroup);
    if (filterArea) list = list.filter(u => u.area === filterArea);
    if (searchText) {
      const q = searchText.toLowerCase();
      list = list.filter(u =>
        u.address.toLowerCase().includes(q) ||
        u.residents.some(r => r.name.toLowerCase().includes(q)) ||
        u.owner.toLowerCase().includes(q)
      );
    }
    return list;
  }, [enriched, filterGroup, filterArea, searchText]);

  // Sort & group
  const grouped = useMemo(() => {
    const sorted = [...filtered].sort((a, b) => {
      if (sortBy === 'date') {
        const dateDiff = parseDate(a.leaseEnd) - parseDate(b.leaseEnd);
        if (dateDiff !== 0) return dateDiff;
        return PRIO.indexOf(a.group) - PRIO.indexOf(b.group);
      }
      if (sortBy === 'priority') return PRIO.indexOf(a.group) - PRIO.indexOf(b.group);
      if (sortBy === 'area') return (a.area || 'ZZZ').localeCompare(b.area || 'ZZZ');
      if (sortBy === 'owner') return (a.owner || 'ZZZ').localeCompare(b.owner || 'ZZZ');
      if (sortBy === 'status') return (a.group || '').localeCompare(b.group || '');
      return 0;
    });

    const groups = {};
    sorted.forEach(u => {
      let key;
      if (sortBy === 'date') key = fmtMonth(u.leaseEnd);
      else if (sortBy === 'area') key = u.area || 'Unknown';
      else if (sortBy === 'owner') key = u.owner || 'Unknown';
      else if (sortBy === 'status') key = GC[u.group]?.label || u.group;
      else if (sortBy === 'priority') key = GC[u.group]?.label || u.group;
      else key = 'All';
      if (!groups[key]) groups[key] = [];
      groups[key].push(u);
    });
    return groups;
  }, [filtered, sortBy]);

  const selectedUnit = enriched.find(u => u.id === selectedId);
  const areas = useMemo(() =>
    [...new Set(units.map(u => u.area).filter(Boolean))].sort(),
    [units]
  );


  // Time since last sync
  const syncAgo = formatSyncAgo(lastSynced);

  const hasFilters = filterGroup || filterArea || searchText;

  const themeButton = (
    <button
      onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')}
      aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
      aria-pressed={theme === 'light'}
      style={{
        flexShrink: 0,
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-md)',
        width: 44, height: 34,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer',
        fontSize: 16,
        transition: 'all var(--duration-fast) ease',
        color: 'var(--text-secondary)',
      }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
      onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-elevated)'}
    >
      {theme === 'light' ? '☾' : '☀'}
    </button>
  );

  // ── Calendar view ─────────────────────────────────────────────────────────
  if (view === 'calendar') {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg-root)', color: 'var(--text-primary)' }}>
        <CalendarView
          units={enriched}
          theme={theme}
          themeButton={themeButton}
          onBack={() => setView('dashboard')}
          onViewUnit={(address) => {
            const u = enriched.find(u => u.address === address);
            if (u) { setSelectedId(u.id); setView('dashboard'); }
          }}
        />
      </div>
    );
  }

  // ── Worklist view ─────────────────────────────────────────────────────────
  if (view === 'worklist') {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg-root)', color: 'var(--text-primary)' }}>
        <WorklistView
          initialAddress={worklistInitialAddress}
          themeButton={themeButton}
          onBack={() => { setWorklistInitialAddress(''); setView('dashboard'); }}
        />
      </div>
    );
  }

  // ── Dashboard view ────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-root)', color: 'var(--text-primary)' }}>
      {/* Overlay */}
      {selectedId && (
        <div
          onClick={() => setSelectedId(null)}
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0, 0, 0, 0.6)',
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
            zIndex: 50,
            animation: 'fadeIn 200ms ease',
          }}
        />
      )}

      {/* Detail panel */}
      {selectedUnit && (
        <DetailPanel
          unit={selectedUnit}
          onClose={() => setSelectedId(null)}
          theme={theme}
          onOpenWorklist={(address) => {
            setSelectedId(null);
            setWorklistInitialAddress(address || '');
            setView('worklist');
          }}
        />
      )}

      {/* Header — Dashboard mode */}
      <header style={{
        padding: '0 24px',
        borderBottom: '1px solid var(--border-subtle)',
        position: 'sticky', top: 0,
        background: 'var(--header-glass)',
        backdropFilter: 'blur(16px) saturate(180%)',
        WebkitBackdropFilter: 'blur(16px) saturate(180%)',
        zIndex: 40,
      }}>
        {/* Top row: Brand + search + calendar button */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '16px 0 12px', gap: 16,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h1 style={{
              fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em',
              color: 'var(--text-primary)',
            }}>
              Mills Rentals
            </h1>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              {dataSource === 'live' && syncAgo && (
                <span style={{
                  fontSize: 11, fontWeight: 500,
                  color: '#34d399',
                  display: 'flex', alignItems: 'center', gap: 4,
                }}>
                  <span style={{
                    width: 6, height: 6, borderRadius: '50%',
                    background: '#34d399',
                    display: 'inline-block',
                    boxShadow: '0 0 8px rgba(52, 211, 153, 0.4)',
                  }} />
                  Synced {syncAgo}
                </span>
              )}
              {dataSource === 'cached' && syncAgo && (
                <span
                  title={fetchError ? `Live fetch failed: ${fetchError}` : 'Showing cached data from last successful sync'}
                  style={{
                    fontSize: 11, fontWeight: 500, color: '#fbbf24',
                    display: 'flex', alignItems: 'center', gap: 4,
                    cursor: 'help',
                  }}
                >
                  <span style={{
                    width: 6, height: 6, borderRadius: '50%',
                    background: '#fbbf24',
                    display: 'inline-block',
                  }} />
                  Synced {syncAgo} (stale)
                </span>
              )}
              {dataSource === 'local' && (
                <span
                  title={fetchError || undefined}
                  style={{
                    fontSize: 11, fontWeight: 500, color: '#fb923c',
                    display: 'flex', alignItems: 'center', gap: 4,
                    cursor: fetchError ? 'help' : 'default',
                  }}
                >
                  <span style={{
                    width: 6, height: 6, borderRadius: '50%',
                    background: '#fb923c',
                    display: 'inline-block',
                  }} />
                  Local data{fetchError ? ' ⚠' : ''}
                </span>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ position: 'relative', maxWidth: 280, flex: '0 1 280px' }}>
              <svg style={{
                position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
                width: 14, height: 14, color: 'var(--text-muted)',
              }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
              </svg>
              <input
                type="text" value={searchText}
                onChange={e => setSearchText(e.target.value)}
                placeholder="Search..."
                style={{
                  width: '100%',
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-md)',
                  padding: '7px 12px 7px 32px',
                  color: 'var(--text-primary)',
                  fontSize: 13,
                  outline: 'none',
                  transition: 'border-color var(--duration-fast) ease, box-shadow var(--duration-fast) ease',
                }}
                onFocus={e => {
                  e.target.style.borderColor = 'rgba(99, 102, 241, 0.5)';
                  e.target.style.boxShadow = '0 0 0 3px rgba(99, 102, 241, 0.1)';
                }}
                onBlur={e => {
                  e.target.style.borderColor = 'var(--border-default)';
                  e.target.style.boxShadow = 'none';
                }}
              />
            </div>

            <button
              onClick={() => setView('worklist')}
              style={{
                background: 'transparent',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-sm)',
                padding: '6px 14px',
                fontSize: 12, fontWeight: 700,
                cursor: 'pointer',
                transition: 'all var(--duration-fast) ease',
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-elevated)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              Worklist
            </button>

            <button
              onClick={() => setView('calendar')}
              style={{
                background: 'var(--accent)',
                color: '#fff',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                padding: '6px 14px',
                fontSize: 12, fontWeight: 700,
                cursor: 'pointer',
                transition: 'all var(--duration-fast) ease',
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--accent-hover)'}
              onMouseLeave={e => e.currentTarget.style.background = 'var(--accent)'}
            >
              Calendar
            </button>

            {themeButton}
          </div>
        </div>

        {/* Toolbar: Sort + Filter */}
        <div style={{
          display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap',
          paddingBottom: 12,
        }}>
          <div style={{
            display: 'flex', alignItems: 'center',
            background: 'var(--bg-elevated)',
            borderRadius: 'var(--radius-md)',
            padding: 3,
            border: '1px solid var(--border-subtle)',
          }}>
            {SORT_OPTS.map(o => (
              <button
                key={o.key}
                onClick={() => setSortBy(o.key)}
                style={{
                  background: sortBy === o.key ? 'var(--text-primary)' : 'transparent',
                  color: sortBy === o.key ? 'var(--bg-root)' : 'var(--text-muted)',
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  padding: '5px 12px',
                  fontSize: 12, fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all var(--duration-fast) var(--ease)',
                  whiteSpace: 'nowrap',
                }}
              >
                {o.label}
              </button>
            ))}
          </div>

          <div style={{ width: 1, height: 24, background: 'var(--border-subtle)', margin: '0 4px' }} />

          <select
            value={filterGroup || ''}
            onChange={e => setFilterGroup(e.target.value || null)}
            style={{
              background: 'var(--bg-elevated)',
              color: filterGroup ? 'var(--text-primary)' : 'var(--text-muted)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-sm)',
              padding: '5px 10px',
              fontSize: 12, fontWeight: 500,
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            <option value="">All Statuses</option>
            {Object.keys(GC).map(k => (
              <option key={k} value={k}>{GC[k].icon} {GC[k].label}</option>
            ))}
          </select>

          <select
            value={filterArea || ''}
            onChange={e => setFilterArea(e.target.value || null)}
            style={{
              background: 'var(--bg-elevated)',
              color: filterArea ? 'var(--text-primary)' : 'var(--text-muted)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-sm)',
              padding: '5px 10px',
              fontSize: 12, fontWeight: 500,
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            <option value="">All Areas</option>
            {areas.map(a => <option key={a} value={a}>{a}</option>)}
          </select>

          {hasFilters && (
            <button
              onClick={() => { setFilterGroup(null); setFilterArea(null); setSearchText(''); }}
              style={{
                background: 'rgba(239, 68, 68, 0.12)',
                color: '#f87171',
                border: '1px solid rgba(239, 68, 68, 0.2)',
                borderRadius: 'var(--radius-sm)',
                padding: '5px 10px',
                fontSize: 11, fontWeight: 600,
                cursor: 'pointer',
                transition: 'all var(--duration-fast) ease',
              }}
            >
              Clear filters
            </button>
          )}

          <div style={{ flex: 1 }} />

          <button
            disabled={syncing === 'pending'}
            onClick={async () => {
              setSyncing('pending');
              try {
                const res = await fetch('/api/trigger-sync', { method: 'POST' });
                const data = await res.json();
                setSyncing(data.ok ? 'ok' : 'error');
              } catch {
                setSyncing('error');
              } finally {
                setTimeout(() => setSyncing(null), 3000);
              }
            }}
            style={{
              background: 'var(--bg-elevated)',
              color: syncing === 'ok' ? '#34d399' : syncing === 'error' ? '#f87171' : 'var(--text-muted)',
              border: `1px solid ${syncing === 'ok' ? '#34d399' : syncing === 'error' ? '#f87171' : 'var(--border-default)'}`,
              borderRadius: 'var(--radius-sm)',
              padding: '5px 10px',
              fontSize: 11, fontWeight: 600,
              cursor: syncing === 'pending' ? 'wait' : 'pointer',
              opacity: syncing === 'pending' ? 0.5 : 1,
              transition: 'all var(--duration-fast) ease',
              whiteSpace: 'nowrap',
            }}
          >
            {syncing === 'pending' ? 'Syncing\u2026' : syncing === 'ok' ? '\u2713 Triggered' : syncing === 'error' ? '\u2717 Failed' : '\u21BB Sync'}
          </button>

          <button
            disabled={exporting}
            onClick={async () => {
              setExporting(true);
              try { await exportTurnoverData(filtered, inspectionConditions); }
              finally { setExporting(false); }
            }}
            style={{
              background: 'var(--bg-elevated)',
              color: 'var(--text-muted)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-sm)',
              padding: '5px 10px',
              fontSize: 11, fontWeight: 600,
              cursor: exporting ? 'wait' : 'pointer',
              opacity: exporting ? 0.5 : 1,
              transition: 'all var(--duration-fast) ease',
              whiteSpace: 'nowrap',
            }}
          >
            {exporting ? 'Exporting...' : 'Export Turnovers'}
          </button>

          <span style={{
            fontSize: 12, color: 'var(--text-muted)', fontWeight: 500,
            fontVariantNumeric: 'tabular-nums',
          }}>
            {filtered.length} unit{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>

        <SummaryBar units={filtered} theme={theme} />
      </header>

      {/* Grid */}
      <main style={{ padding: '20px 24px 60px' }}>
        {Object.keys(grouped).map((groupLabel, gi) => {
          const groupUnits = grouped[groupLabel];
          return (
            <div key={groupLabel} style={{
              marginBottom: 28,
              animation: `slideUp ${300 + gi * 50}ms var(--ease) both`,
            }}>
              <GroupHeader label={groupLabel} units={groupUnits} />
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                gap: 10,
              }}>
                {groupUnits.map((u, i) => (
                  <Tile key={u.id} unit={u} onClick={() => setSelectedId(u.id)} index={i} theme={theme} />
                ))}
              </div>
            </div>
          );
        })}
        {Object.keys(grouped).length === 0 && (
          <div style={{
            textAlign: 'center', padding: 80,
            color: 'var(--text-muted)', fontSize: 14,
          }}>
            No units match your filters.
          </div>
        )}
      </main>
    </div>
  );
}
