/**
 * download-numbers-file.mjs
 * Downloads the Numbers file from Google Drive to /tmp/mills_export/
 * Used by GitHub Actions before running sync-from-numbers.mjs
 *
 * Requires env vars:
 *   GOOGLE_SERVICE_ACCOUNT_JSON — service account credentials (full JSON string)
 *   NUMBERS_FILE_ID             — Google Drive file ID
 */

import { google } from 'googleapis';
import { createWriteStream, mkdirSync } from 'fs';
import { pipeline } from 'stream/promises';

const sa = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
const auth = new google.auth.GoogleAuth({
  credentials: sa,
  scopes: ['https://www.googleapis.com/auth/drive.readonly'],
});
const drive = google.drive({ version: 'v3', auth });

const fileId = process.env.NUMBERS_FILE_ID;
if (!fileId) {
  console.error('Error: NUMBERS_FILE_ID env var is required');
  process.exit(1);
}

const outDir = '/tmp/mills_export';
const outPath = `${outDir}/2025-2026 Renewals_Dashboard.numbers`;

mkdirSync(outDir, { recursive: true });

console.log(`Downloading Numbers file (${fileId}) from Google Drive...`);
const res = await drive.files.get(
  { fileId, alt: 'media', supportsAllDrives: true },
  { responseType: 'stream' }
);
await pipeline(res.data, createWriteStream(outPath));
console.log(`  ✓ Saved to ${outPath}`);
