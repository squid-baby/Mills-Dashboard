/**
 * sync-from-neo.mjs — single-pass Neo Google Sheet → Supabase sync.
 *
 * Reads two tabs of the Neo sheet in one batch:
 *   • "property-info-clean"  → upserts units (all property attributes)
 *   • "Tenant Info"          → deletes + reinserts residents and next_residents
 *
 * Address authority:
 *   property-info-clean is the unit list (rows may exist without a Tenant row
 *   during onboarding). Tenant Info's Property column wins on spelling — if a
 *   unit appears in both, units.address is rewritten to match Tenant.
 *
 * Owner / Area:
 *   Sourced from property-info-clean only. Tenant tab's Owner / Area are
 *   advisory display columns for Amanda and are NOT synced.
 *
 * Fail-loud rules — to never silently corrupt resident data:
 *   1. Required headers missing in either tab → exit non-zero before any write.
 *   2. Any Tenant Info Property fails to resolve to a unit → exit non-zero
 *      before any delete on residents/next_residents.
 *
 * Run:
 *   node --env-file=.env scripts/sync-from-neo.mjs            # live
 *   node --env-file=.env scripts/sync-from-neo.mjs --dry-run  # preview only
 *
 * Required env vars:
 *   SUPABASE_URL, SUPABASE_SERVICE_KEY,
 *   GOOGLE_SERVICE_ACCOUNT_JSON, SHEET_ID_PROPERTY_INFO
 *
 * Optional env vars (change-summary email):
 *   GMAIL_USER, GMAIL_APP_PASSWORD, MEETING_EMAIL_TO
 */

import { createClient } from '@supabase/supabase-js';
import { google } from 'googleapis';
import { HEADER_TO_FIELD, SHEET_TABS } from '../src/config/columns.js';
import { TENANT_FIELD_SPECS, buildHeaderIndex, normalizeHeader } from '../src/config/tenantInfoColumns.js';

// ─── Env + flags ─────────────────────────────────────────────────────────────
const {
  SUPABASE_URL, SUPABASE_SERVICE_KEY,
  GOOGLE_SERVICE_ACCOUNT_JSON, SHEET_ID_PROPERTY_INFO,
  GMAIL_USER, GMAIL_APP_PASSWORD, MEETING_EMAIL_TO,
} = process.env;
const DRY_RUN = process.argv.includes('--dry-run');

for (const [k, v] of Object.entries({ SUPABASE_URL, SUPABASE_SERVICE_KEY, GOOGLE_SERVICE_ACCOUNT_JSON, SHEET_ID_PROPERTY_INFO })) {
  if (!v) { console.error(`Error: ${k} must be set in .env`); process.exit(1); }
}
if (DRY_RUN) console.log('🔎 DRY RUN — no Supabase writes will occur\n');

// ─── Helpers ─────────────────────────────────────────────────────────────────
function normalizeAddr(addr) {
  return (addr || '').toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ').trim();
}
const STREET_SUFFIXES = /\s+(dr|st|rd|ave|blvd|ct|ln|cir|way|pl)\.?$/i;
function stripSuffix(addr) {
  return normalizeAddr(addr).replace(STREET_SUFFIXES, '');
}
function clean(val) {
  if (val == null) return '';
  const s = val.toString().trim();
  return /^[—–-]+$/.test(s) ? '' : s;
}
function yn(val) {
  return (val ?? '').toString().trim().toLowerCase() === 'yes';
}
function parseDate(val) {
  const s = clean(val);
  if (!s) return null;
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  const [m, d, y] = s.split('/').map(Number);
  if (!m || !d || !y) return null;
  const year = y < 100 ? 2000 + y : y;
  return `${year}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}

// ─── Fetch both tabs in one batch ────────────────────────────────────────────
console.log('Reading Neo sheet (Tenant Info + property-info-clean)...');
const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(GOOGLE_SERVICE_ACCOUNT_JSON),
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
});
const sheets = google.sheets({ version: 'v4', auth });

const batch = await sheets.spreadsheets.values.batchGet({
  spreadsheetId: SHEET_ID_PROPERTY_INFO,
  ranges: [`'${SHEET_TABS.TENANT_INFO}'`, `'${SHEET_TABS.PROPERTY_INFO}'`],
  valueRenderOption: 'UNFORMATTED_VALUE',
  dateTimeRenderOption: 'FORMATTED_STRING',
});

const tenantValues   = batch.data.valueRanges?.[0]?.values || [];
const propertyValues = batch.data.valueRanges?.[1]?.values || [];
if (tenantValues.length === 0)   { console.error(`Error: "${SHEET_TABS.TENANT_INFO}" tab is empty`);   process.exit(1); }
if (propertyValues.length === 0) { console.error(`Error: "${SHEET_TABS.PROPERTY_INFO}" tab is empty`); process.exit(1); }

const [tenantHeaders,  ...tenantRows]   = tenantValues;
const [propertyHeaders, ...propertyRows] = propertyValues;
console.log(`  ✓ Tenant Info:          ${tenantRows.length} rows × ${tenantHeaders.length} cols`);
console.log(`  ✓ property-info-clean:  ${propertyRows.length} rows × ${propertyHeaders.length} cols`);

// ─── Validate required headers BEFORE any destructive write ─────────────────
const { indices: tenantIdx, missing: tenantMissing } = buildHeaderIndex(tenantHeaders);
if (tenantMissing.length > 0) {
  console.error(`\n✗ Missing required Tenant Info headers: ${tenantMissing.join(', ')}`);
  console.error('  Headers found:', tenantHeaders.map((h, i) => `${i}:${JSON.stringify(h)}`).join('  '));
  console.error('  Fix: add header alias in src/config/tenantInfoColumns.js, or fix the sheet.');
  process.exit(1);
}
const propAddrIdx = propertyHeaders.findIndex(h => normalizeHeader(h) === normalizeHeader('Property'));
if (propAddrIdx === -1) {
  console.error(`\n✗ Missing required header "Property" in property-info-clean tab`);
  process.exit(1);
}

const tenantFound = TENANT_FIELD_SPECS
  .filter(s => tenantIdx[s.key] != null)
  .map(s => `${s.key}=col${tenantIdx[s.key]}`);
console.log(`  ✓ Tenant header map:    ${tenantFound.length}/${TENANT_FIELD_SPECS.length} fields matched`);

// Build property-info field map: header → field key, restricted to known fields
const propIdx = {};
propertyHeaders.forEach((h, i) => {
  const norm = normalizeHeader(h);
  for (const [hdr, field] of Object.entries(HEADER_TO_FIELD)) {
    if (normalizeHeader(hdr) === norm && propIdx[field] == null) propIdx[field] = i;
  }
});
console.log(`  ✓ Property header map:  ${Object.keys(propIdx).length} fields recognized (out of ${propertyHeaders.length} columns)`);

// ─── Build canonical address map from Tenant Info ───────────────────────────
// normalized tenant address → canonical Tenant spelling
const tenantCanonical = new Map();
const tenantAddresses = [];
for (const row of tenantRows) {
  const addr = clean(row[tenantIdx.address]);
  if (!addr) continue;
  if (!tenantCanonical.has(normalizeAddr(addr))) {
    tenantCanonical.set(normalizeAddr(addr), addr);
    tenantAddresses.push(addr);
  }
}

// ─── Parse property-info rows into upsert candidates ────────────────────────
const BOOLEAN_FIELDS = new Set(['washer', 'dryer', 'dishwasher', 'gas', 'freeze_warning', 'sump_pump']);
// Integer-typed columns in Supabase. `parseInt` extracts the leading integer
// from messy values like "1925, 1995 renov." → 1925 (sheet has free-text notes
// in a few year_built cells).
const INT_FIELDS     = new Set(['sq_ft', 'year_built']);

function coerce(field, raw) {
  if (BOOLEAN_FIELDS.has(field)) return yn(raw);
  if (INT_FIELDS.has(field)) {
    const n = parseInt(raw.toString().replace(/,/g, ''), 10);
    return Number.isFinite(n) ? n : null;
  }
  return raw;
}

const unitUpserts = [];
for (const row of propertyRows) {
  const sheetAddr = clean(row[propAddrIdx]);
  if (!sheetAddr) continue;
  // If Tenant has this property (by normalized match), use Tenant's spelling.
  const canonical = tenantCanonical.get(normalizeAddr(sheetAddr)) || sheetAddr;
  const unit = { address: canonical };
  for (const [field, colI] of Object.entries(propIdx)) {
    if (field === 'address') continue;
    const raw = clean(row[colI]);
    if (!raw) continue;
    const v = coerce(field, raw);
    if (v !== null && v !== undefined && v !== '') unit[field] = v;
  }
  unitUpserts.push(unit);
}
console.log(`\nUnits to upsert: ${unitUpserts.length}`);

// ─── Connect to Supabase, fetch existing units for resolution ───────────────
const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const { data: existingUnits, error: fetchErr } = await sb.from('units').select('id, address');
if (fetchErr) { console.error('fetch units failed:', fetchErr.message); process.exit(1); }

// ─── Group Tenant rows by canonical address ─────────────────────────────────
const tenantGroups = new Map(); // canonical addr → [row, row...]
for (const row of tenantRows) {
  const addr = clean(row[tenantIdx.address]);
  if (!addr) continue;
  if (clean(row[tenantIdx.residentName]).toLowerCase() === 'airbnb') continue;
  const canonical = tenantCanonical.get(normalizeAddr(addr)) || addr;
  if (!tenantGroups.has(canonical)) tenantGroups.set(canonical, []);
  tenantGroups.get(canonical).push(row);
}
console.log(`Tenant Info units (after airbnb skip): ${tenantGroups.size}`);

// ─── Resolve Tenant addresses to expected unit IDs ──────────────────────────
// We resolve against the union of (existing units in Supabase) ∪ (units we're
// about to upsert) — because a Tenant row might point at a property that exists
// only in property-info-clean (not yet in Supabase) but will be after upsert.
const projectedAddresses = new Set([
  ...existingUnits.map(u => u.address),
  ...unitUpserts.map(u => u.address),
]);
function resolveProjected(addr) {
  if (projectedAddresses.has(addr)) return addr;
  const norm = normalizeAddr(addr);
  for (const a of projectedAddresses) if (normalizeAddr(a) === norm) return a;
  const stripped = stripSuffix(addr);
  for (const a of projectedAddresses) if (stripSuffix(a) === stripped) return a;
  return null;
}

const tenantUnresolved = [];
for (const addr of tenantGroups.keys()) {
  if (!resolveProjected(addr)) tenantUnresolved.push(addr);
}
if (tenantUnresolved.length > 0) {
  console.error(`\n✗ ${tenantUnresolved.length} Tenant Info address(es) do not resolve to any unit (existing or to-be-upserted):`);
  tenantUnresolved.forEach(a => console.error(`   "${a}"`));
  console.error('\n  Add these properties to "property-info-clean" or correct the spelling in "Tenant Info".');
  console.error('  No residents were touched.');
  process.exit(1);
}
console.log(`✓ All ${tenantGroups.size} Tenant Info addresses resolve to a unit`);

// ─── Helpers used by both dry-run summary and live execution ────────────────
function buildResidentRows(idMap) {
  const residentRows = [];
  const nextResidentRows = [];
  for (const [address, rows] of tenantGroups) {
    const unitId = idMap.get(address);
    if (!unitId) continue;
    const seen = new Set();
    for (const row of rows) {
      const name = clean(row[tenantIdx.residentName]);
      if (!name) continue;
      residentRows.push({
        unit_id: unitId,
        name,
        email: clean(row[tenantIdx.residentEmail]),
        phone: clean(row[tenantIdx.residentPhone]),
        status: clean(row[tenantIdx.status]).toLowerCase() || 'unknown',
        lease_end: parseDate(row[tenantIdx.leaseEnd]),
        move_out_date: parseDate(row[tenantIdx.moveOut]),
        lease_signed: yn(row[tenantIdx.leaseSigned]),
        deposit_paid: yn(row[tenantIdx.depositPaid]),
        notes: clean(row[tenantIdx.notes]),
      });
      const nextName = clean(row[tenantIdx.nextResident]);
      const nextEmail = clean(row[tenantIdx.nextEmail]);
      if (nextName) {
        const key = nextEmail || nextName;
        if (!seen.has(key)) {
          seen.add(key);
          nextResidentRows.push({
            unit_id: unitId,
            name: nextName,
            email: nextEmail,
            phone: clean(row[tenantIdx.nextPhone]),
            move_in_date: parseDate(row[tenantIdx.nextMoveIn]),
          });
        }
      }
    }
  }
  return { residentRows, nextResidentRows };
}

function diffResidents(prev, after) {
  const changes = [];
  const prevMap  = Object.fromEntries((prev || []).map(r => [`${r.unit_id}:${r.name}`, r]));
  const afterMap = Object.fromEntries((after || []).map(r => [`${r.unit_id}:${r.name}`, r]));
  for (const [k, r] of Object.entries(afterMap)) if (!prevMap[k]) changes.push(`+ Added resident: ${r.name}`);
  for (const [k, r] of Object.entries(prevMap)) if (!afterMap[k]) changes.push(`- Removed resident: ${r.name}`);
  for (const [k, after] of Object.entries(afterMap)) {
    const before = prevMap[k];
    if (!before) continue;
    if (before.status !== after.status)             changes.push(`~ ${after.name}: status ${before.status} → ${after.status}`);
    if (before.lease_signed !== after.lease_signed) changes.push(`~ ${after.name}: lease_signed → ${after.lease_signed}`);
    if (before.deposit_paid !== after.deposit_paid) changes.push(`~ ${after.name}: deposit_paid → ${after.deposit_paid}`);
  }
  return changes;
}
function diffNextResidents(prev, after) {
  const changes = [];
  const prevMap  = Object.fromEntries((prev || []).map(r => [`${r.unit_id}:${r.name}`, r]));
  const afterMap = Object.fromEntries((after || []).map(r => [`${r.unit_id}:${r.name}`, r]));
  for (const [k, r] of Object.entries(afterMap)) if (!prevMap[k]) changes.push(`+ Added next resident: ${r.name}`);
  for (const [k, r] of Object.entries(prevMap)) if (!afterMap[k]) changes.push(`- Removed next resident: ${r.name}`);
  for (const [k, after] of Object.entries(afterMap)) {
    const before = prevMap[k];
    if (!before) continue;
    if (before.move_in_date !== after.move_in_date)
      changes.push(`~ ${after.name}: move_in_date ${before.move_in_date} → ${after.move_in_date}`);
  }
  return changes;
}

// ─── DRY RUN: project counts, exit 0 ────────────────────────────────────────
if (DRY_RUN) {
  // Projected ID map = existing IDs (live) for addresses that already exist.
  // Brand-new addresses in unitUpserts won't have IDs yet — synthesize null
  // and report them as "would-create".
  const existingIdByAddr = new Map(existingUnits.map(u => [u.address, u.id]));
  const idMap = new Map();
  for (const addr of tenantGroups.keys()) {
    const resolved = resolveProjected(addr);
    if (existingIdByAddr.has(resolved)) idMap.set(addr, existingIdByAddr.get(resolved));
  }

  const { residentRows, nextResidentRows } = buildResidentRows(idMap);
  const syncedUnitIds = [...idMap.values()];
  const [{ data: snapshotResidents }, { data: snapshotNextResidents }] = syncedUnitIds.length > 0
    ? await Promise.all([
        sb.from('residents').select('unit_id, name, status, lease_signed, deposit_paid').in('unit_id', syncedUnitIds),
        sb.from('next_residents').select('unit_id, name, email, phone, move_in_date').in('unit_id', syncedUnitIds),
      ])
    : [{ data: [] }, { data: [] }];
  const previewRes  = diffResidents(snapshotResidents, residentRows);
  const previewNext = diffNextResidents(snapshotNextResidents, nextResidentRows);

  const newAddresses = unitUpserts.filter(u => !existingIdByAddr.has(u.address)).map(u => u.address);
  const sampleUnit = unitUpserts.slice(0, 3);

  console.log('\n──── Dry-run summary ────');
  console.log(`Tenant addresses resolved:        ${tenantGroups.size}/${tenantGroups.size}`);
  console.log(`Tenant addresses unresolved:      0  (would have failed loud above)`);
  console.log(`\nUnits — would upsert:             ${unitUpserts.length}`);
  console.log(`Units — new addresses (insert):   ${newAddresses.length}`);
  if (newAddresses.length > 0 && newAddresses.length <= 10) newAddresses.forEach(a => console.log(`   + "${a}"`));
  console.log(`\nResidents — would delete:         ${(snapshotResidents || []).length}`);
  console.log(`Residents — would insert:         ${residentRows.length}`);
  console.log(`Next residents — would delete:    ${(snapshotNextResidents || []).length}`);
  console.log(`Next residents — would insert:    ${nextResidentRows.length}`);
  console.log(`\nResident-level diff: ${previewRes.length} change(s)`);
  previewRes.slice(0, 20).forEach(c => console.log(`   ${c}`));
  if (previewRes.length > 20) console.log(`   … ${previewRes.length - 20} more`);
  console.log(`\nNext-resident-level diff: ${previewNext.length} change(s)`);
  previewNext.slice(0, 20).forEach(c => console.log(`   ${c}`));
  if (previewNext.length > 20) console.log(`   … ${previewNext.length - 20} more`);

  console.log('\nSample units (first 3):');
  for (const u of sampleUnit) {
    const fields = Object.entries(u).filter(([k]) => k !== 'address').map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(', ');
    console.log(`   ${u.address} → ${fields || '(no fields)'}`);
  }

  console.log('\n✓ Dry run complete — no Supabase writes performed.');
  process.exit(0);
}

// ─── LIVE: upsert units, then delete + reinsert residents ───────────────────
const t0 = Date.now();
const BATCH = 50;
let upserted = 0;
for (let i = 0; i < unitUpserts.length; i += BATCH) {
  const slice = unitUpserts.slice(i, i + BATCH);
  const { error } = await sb.from('units').upsert(slice, { onConflict: 'address' });
  if (error) {
    console.error(`\n✗ Unit upsert batch ${Math.floor(i / BATCH) + 1} failed:`, error.message);
    if (error.message.includes('column') && error.message.includes('does not exist')) {
      console.error('  → Looks like the SQL migration db/migrations/2026-04-28-expand-units-for-neo.sql has not been applied. Run it in Supabase SQL editor and re-run this script.');
    }
    process.exit(1);
  }
  upserted += slice.length;
  process.stdout.write(`\r  Upserted ${upserted}/${unitUpserts.length} units...`);
}
console.log(`\n  ✓ ${upserted} units upserted`);

// Re-fetch units for fresh ID map (covers new inserts).
const { data: unitsAfter, error: refetchErr } = await sb.from('units').select('id, address');
if (refetchErr) { console.error('refetch units failed:', refetchErr.message); process.exit(1); }
const idMap = new Map();
const idByAddr = new Map(unitsAfter.map(u => [u.address, u.id]));
for (const addr of tenantGroups.keys()) {
  // Direct hit first (Tenant spelling is canonical and we already upserted with it),
  // then normalized / suffix-stripped fallback for legacy property-info-only rows.
  const id = idByAddr.get(addr)
    ?? unitsAfter.find(u => normalizeAddr(u.address) === normalizeAddr(addr))?.id
    ?? unitsAfter.find(u => stripSuffix(u.address) === stripSuffix(addr))?.id;
  if (id) idMap.set(addr, id);
}
if (idMap.size !== tenantGroups.size) {
  // Should be impossible — we already validated above and upsert just ran.
  console.error(`\n✗ Post-upsert resolution mismatch: ${idMap.size}/${tenantGroups.size} resolved. Aborting before residents touched.`);
  process.exit(1);
}

const syncedUnitIds = [...idMap.values()];
const [{ data: snapshotResidents }, { data: snapshotNextResidents }] = await Promise.all([
  sb.from('residents').select('unit_id, name, status, lease_signed, deposit_paid').in('unit_id', syncedUnitIds),
  sb.from('next_residents').select('unit_id, name, email, phone, move_in_date').in('unit_id', syncedUnitIds),
]);

const { residentRows, nextResidentRows } = buildResidentRows(idMap);

await sb.from('residents').delete().in('unit_id', syncedUnitIds);
await sb.from('next_residents').delete().in('unit_id', syncedUnitIds);

if (residentRows.length > 0) {
  const { error } = await sb.from('residents').insert(residentRows);
  if (error) { console.error('residents insert failed:', error.message); process.exit(1); }
}
if (nextResidentRows.length > 0) {
  const { error } = await sb.from('next_residents').insert(nextResidentRows);
  if (error) { console.error('next_residents insert failed:', error.message); process.exit(1); }
}

console.log(`\n✓ Sync complete in ${Date.now() - t0}ms`);
console.log(`  ${unitUpserts.length} units · ${residentRows.length} residents · ${nextResidentRows.length} next residents`);

// ─── Change-detection email (optional) ──────────────────────────────────────
if (GMAIL_USER && GMAIL_APP_PASSWORD && MEETING_EMAIL_TO) {
  const [{ data: newResidents }, { data: newNextResidents }] = await Promise.all([
    sb.from('residents').select('unit_id, name, status, lease_signed, deposit_paid').in('unit_id', syncedUnitIds),
    sb.from('next_residents').select('unit_id, name, email, phone, move_in_date').in('unit_id', syncedUnitIds),
  ]);
  const changes = [
    ...diffResidents(snapshotResidents, newResidents),
    ...diffNextResidents(snapshotNextResidents, newNextResidents),
  ];
  if (changes.length > 0) {
    const { createTransport } = await import('nodemailer');
    const transporter = createTransport({ service: 'gmail', auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD } });
    await transporter.sendMail({
      from: GMAIL_USER,
      to: MEETING_EMAIL_TO,
      subject: `Mills Sync — ${changes.length} change${changes.length !== 1 ? 's' : ''} (${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})`,
      text: [
        `Neo sync ran at ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })} ET`,
        '',
        ...changes,
        '',
        `${unitUpserts.length} units · ${residentRows.length} residents · ${nextResidentRows.length} next residents`,
      ].join('\n'),
    });
    console.log(`  ✉ Change email sent (${changes.length} changes)`);
  } else {
    console.log('  ✉ No changes — skipping email');
  }
}
