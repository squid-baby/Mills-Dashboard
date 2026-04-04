/**
 * cleanup-duplicate-units.mjs
 *
 * One-time script: removes unit rows from Supabase that exist ONLY because
 * sync-from-numbers.mjs created them from Amanda's Numbers file — i.e. units
 * that have NO property info (beds is null/0 AND baths is null/empty) AND
 * whose address does NOT match any row in the Property Info Google Sheet.
 *
 * Safe to run multiple times. Prints a dry-run report first, then asks you
 * to pass --confirm to actually delete.
 *
 * Usage:
 *   node --env-file=.env scripts/cleanup-duplicate-units.mjs
 *   node --env-file=.env scripts/cleanup-duplicate-units.mjs --confirm
 *
 * Required env vars: SUPABASE_URL, SUPABASE_SERVICE_KEY,
 *                    GOOGLE_SERVICE_ACCOUNT_JSON, SHEET_ID_PROPERTY_INFO
 */

import { google } from 'googleapis';
import { createClient } from '@supabase/supabase-js';

const CONFIRM = process.argv.includes('--confirm');

const { SUPABASE_URL, SUPABASE_SERVICE_KEY, GOOGLE_SERVICE_ACCOUNT_JSON, SHEET_ID_PROPERTY_INFO } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !GOOGLE_SERVICE_ACCOUNT_JSON || !SHEET_ID_PROPERTY_INFO) {
  console.error('Missing required env vars.');
  process.exit(1);
}

function normalizeAddr(addr) {
  return (addr || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

// ── Fetch Property Info sheet addresses (canonical source of truth) ──────────
const credentials = JSON.parse(GOOGLE_SERVICE_ACCOUNT_JSON);
const auth = new google.auth.GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] });
const sheets = google.sheets({ version: 'v4', auth });

const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID_PROPERTY_INFO, range: 'property info!A:A' });
const sheetRows = res.data.values || [];
const sheetAddresses = new Set(
  sheetRows.slice(1).map(r => normalizeAddr(r[0])).filter(Boolean)
);
console.log(`Property Info sheet: ${sheetAddresses.size} addresses`);

// ── Fetch all units from Supabase ─────────────────────────────────────────────
const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const { data: units, error } = await sb.from('units').select('id, address, beds, baths');
if (error) { console.error('fetch failed:', error.message); process.exit(1); }
console.log(`Supabase units: ${units.length}`);

// ── Find orphans: address not in Property Info sheet ─────────────────────────
const orphans = units.filter(u => !sheetAddresses.has(normalizeAddr(u.address)));

if (orphans.length === 0) {
  console.log('\n✓ No orphan units found — nothing to clean up.');
  process.exit(0);
}

console.log(`\nOrphan units (${orphans.length}) — in Supabase but not in Property Info sheet:`);
orphans.forEach(u => console.log(`  [${u.id}] "${u.address}"  beds=${u.beds ?? 'null'}  baths=${u.baths ?? 'null'}`));

if (!CONFIRM) {
  console.log('\nDry run. Pass --confirm to delete these rows (residents/next_residents cascade deleted too).');
  process.exit(0);
}

// ── Delete orphans (residents/next_residents cascade via FK) ─────────────────
const ids = orphans.map(u => u.id);
const { error: delErr } = await sb.from('units').delete().in('id', ids);
if (delErr) { console.error('delete failed:', delErr.message); process.exit(1); }
console.log(`\n✓ Deleted ${ids.length} orphan unit rows.`);
