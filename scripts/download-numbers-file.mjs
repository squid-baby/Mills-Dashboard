/**
 * download-numbers-file.mjs
 * Downloads the .numbers file from Google Drive to /tmp/mills_export/.
 * Used by the GitHub Actions workflow — not needed for local sync.
 *
 * Expects env vars: GOOGLE_SERVICE_ACCOUNT_JSON, NUMBERS_FILE_ID
 */

import { google } from 'googleapis';
import { createWriteStream, mkdirSync } from 'fs';
import { pipeline } from 'stream/promises';

const saJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
const fileId = process.env.NUMBERS_FILE_ID;

if (!saJson || !fileId) {
  console.error('Error: GOOGLE_SERVICE_ACCOUNT_JSON and NUMBERS_FILE_ID must be set');
  process.exit(1);
}

const sa = JSON.parse(saJson);
const auth = new google.auth.GoogleAuth({
  credentials: sa,
  scopes: ['https://www.googleapis.com/auth/drive.readonly'],
});
const drive = google.drive({ version: 'v3', auth });

const outDir = '/tmp/mills_export';
const outPath = `${outDir}/2025-2026 Renewals_Dashboard.numbers`;

mkdirSync(outDir, { recursive: true });

console.log(`Downloading Numbers file (${fileId})...`);
const res = await drive.files.get(
  { fileId, alt: 'media', supportsAllDrives: true },
  { responseType: 'stream' }
);
await pipeline(res.data, createWriteStream(outPath));
console.log(`  ✓ Saved to ${outPath}`);
