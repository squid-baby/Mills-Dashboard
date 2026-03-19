import { useState, useMemo, useCallback, useEffect } from 'react';
import { GC, PRIO, SORT_OPTS, SEED_UNITS, parseDate, fmtMonth } from './data/units';
import StatusBadge from './components/StatusBadge';
import Tile from './components/Tile';
import DetailPanel from './components/DetailPanel';
import SummaryBar from './components/SummaryBar';
import GroupHeader from './components/GroupHeader';

const POLL_INTERVAL = 30 * 60 * 1000; // 30 minutes

export default function App() {
  const [units, setUnits] = useState(SEED_UNITS);
  const [dataSource, setDataSource] = useState('local'); // 'local' | 'live'
  const [lastUpdated, setLastUpdated] = useState(null);

  const [sortBy, setSortBy] = useState('date');
  const [filterGroup, setFilterGroup] = useState(null);
  const [filterArea, setFilterArea] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [searchText, setSearchText] = useState('');
  const [userNotes, setUserNotes] = useState(() => {
    try { return JSON.parse(localStorage.getItem('mills_notes') || '{}'); } catch { return {}; }
  });

  // Persist notes to localStorage
  useEffect(() => {
    try { localStorage.setItem('mills_notes', JSON.stringify(userNotes)); } catch { /* ignore */ }
  }, [userNotes]);

  // Poll Google Sheets via Netlify Function
  useEffect(() => {
    async function fetchUnits() {
      try {
        const res = await fetch('/api/get-units');
        if (!res.ok) throw new Error(res.statusText);
        const data = await res.json();
        if (data.units && data.units.length > 0) {
          // Only mark "Last updated" when data actually changes
          const fingerprint = data.units.map(u =>
            `${u.address}|${u.group}|${u.leaseEnd}|${u.beds}`
          ).join(',');
          setUnits(prev => {
            const prevFingerprint = prev.map(u =>
              `${u.address}|${u.group}|${u.leaseEnd}|${u.beds}`
            ).join(',');
            if (fingerprint !== prevFingerprint) setLastUpdated(new Date());
            return data.units;
          });
          setDataSource('live');
        }
      } catch {
        // Silently fall back to seed/current data
      }
    }
    fetchUnits();
    const interval = setInterval(fetchUnits, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, []);

  // Enrich units with user notes
  const enriched = useMemo(() =>
    units.map(u => ({ ...u, _userNotes: userNotes[u.id] || [] })),
    [units, userNotes]
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
        // Secondary sort by status priority within same month
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

  const handleAddNote = useCallback((unitId, notes) => {
    setUserNotes(prev => ({ ...prev, [unitId]: notes }));
  }, []);

  // Time since last data change
  const updatedAgo = lastUpdated
    ? Math.round((Date.now() - lastUpdated.getTime()) / 60000) + 'm ago'
    : null;

  return (
    <div style={{ minHeight: '100vh', background: '#09090b', color: '#f4f4f5' }}>
      {/* Overlay */}
      {selectedId && (
        <div
          onClick={() => setSelectedId(null)}
          style={{ position: 'fixed', inset: 0, background: '#00000066', zIndex: 50 }}
        />
      )}

      {/* Detail panel */}
      {selectedUnit && (
        <DetailPanel unit={selectedUnit} onClose={() => setSelectedId(null)} onAddNote={handleAddNote} />
      )}

      {/* Header */}
      <div style={{
        padding: '16px 20px 0', borderBottom: '1px solid #27272a',
        position: 'sticky', top: 0, background: '#09090b', zIndex: 40,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <h1 style={{
              margin: 0, fontSize: 22, fontWeight: 900, letterSpacing: -1,
              background: 'linear-gradient(135deg, #f4f4f5, #a1a1aa)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}>
              MILLS RENTALS
            </h1>
            <span style={{ fontSize: 12, color: '#52525b', fontWeight: 500 }}>DASHBOARD v2.0</span>
            {dataSource === 'live' && updatedAgo && (
              <span style={{ fontSize: 10, color: '#22c55e', fontWeight: 500 }}>
                Last updated {updatedAgo}
              </span>
            )}
            {dataSource === 'local' && (
              <span style={{ fontSize: 10, color: '#f97316', fontWeight: 500 }}>
                Using local data
              </span>
            )}
          </div>
          <input
            type="text" value={searchText}
            onChange={e => setSearchText(e.target.value)}
            placeholder="Search address, tenant, owner..."
            style={{
              background: '#18181b', border: '1px solid #27272a', borderRadius: 6,
              padding: '6px 12px', color: '#e4e4e7', fontSize: 12, width: 240,
              outline: 'none', fontFamily: 'inherit',
            }}
          />
        </div>

        {/* Toolbar */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', padding: '10px 0' }}>
          <span style={{ fontSize: 10, color: '#52525b', textTransform: 'uppercase', letterSpacing: 1, marginRight: 4 }}>
            Sort:
          </span>
          {SORT_OPTS.map(o => (
            <button
              key={o.key}
              onClick={() => setSortBy(o.key)}
              style={{
                background: sortBy === o.key ? '#f4f4f5' : '#27272a',
                color: sortBy === o.key ? '#09090b' : '#a1a1aa',
                border: 'none', borderRadius: 4, padding: '4px 10px',
                fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              {o.label}
            </button>
          ))}

          <span style={{ width: 1, height: 16, background: '#27272a', margin: '0 4px' }} />

          <span style={{ fontSize: 10, color: '#52525b', textTransform: 'uppercase', letterSpacing: 1, marginRight: 4 }}>
            Filter:
          </span>
          <select
            value={filterGroup || ''}
            onChange={e => setFilterGroup(e.target.value || null)}
            style={{
              background: '#27272a', color: '#a1a1aa', border: '1px solid #3f3f46',
              borderRadius: 4, padding: '3px 8px', fontSize: 11, fontFamily: 'inherit', cursor: 'pointer',
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
              background: '#27272a', color: '#a1a1aa', border: '1px solid #3f3f46',
              borderRadius: 4, padding: '3px 8px', fontSize: 11, fontFamily: 'inherit', cursor: 'pointer',
            }}
          >
            <option value="">All Areas</option>
            {areas.map(a => <option key={a} value={a}>{a}</option>)}
          </select>

          {(filterGroup || filterArea || searchText) && (
            <button
              onClick={() => { setFilterGroup(null); setFilterArea(null); setSearchText(''); }}
              style={{
                background: '#ef4444', color: '#fff', border: 'none',
                borderRadius: 4, padding: '3px 8px', fontSize: 10, fontWeight: 700, cursor: 'pointer',
              }}
            >
              Clear
            </button>
          )}
        </div>

        <SummaryBar units={filtered} />
      </div>

      {/* Grid */}
      <div style={{ padding: '16px 20px 40px' }}>
        {Object.keys(grouped).map(groupLabel => {
          const groupUnits = grouped[groupLabel];
          return (
            <div key={groupLabel} style={{ marginBottom: 24 }}>
              <GroupHeader label={groupLabel} units={groupUnits} />
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                gap: 8,
              }}>
                {groupUnits.map(u => (
                  <Tile key={u.id} unit={u} onClick={() => setSelectedId(u.id)} />
                ))}
              </div>
            </div>
          );
        })}
        {Object.keys(grouped).length === 0 && (
          <div style={{ textAlign: 'center', padding: 60, color: '#52525b' }}>
            No units match your filters.
          </div>
        )}
      </div>
    </div>
  );
}
