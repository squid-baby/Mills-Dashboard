# Cloud Sync via GitHub Actions

Moves the Numbers → Supabase sync off the local machine and into GitHub Actions. Runs on a schedule and can be triggered manually from the GitHub mobile app.

## How It Works

1. GitHub Actions workflow runs on a cron schedule (or manual dispatch)
2. Downloads `2025-2026 Renewals_Dashboard.numbers` from Google Drive using the existing service account
3. Runs `numbers-parser` (Python) to export CSV to `/tmp/`
4. Runs `sync-from-numbers.mjs` to upsert residents into Supabase
5. No local machine or mounted drive required

## Files Changed

| File | Change |
|------|--------|
| `.github/workflows/sync-numbers.yml` | **New** — GitHub Actions workflow |
| `scripts/sync-from-numbers.mjs` | Replace hardcoded `/Volumes/...` path with `NUMBERS_FILE` env var |
| `scripts/download-numbers-file.mjs` | **New** — downloads the `.numbers` file from Drive to `/tmp/` |

## GitHub Secrets Required

Add these in **GitHub → repo → Settings → Secrets and variables → Actions**:

| Secret | Value |
|--------|-------|
| `SUPABASE_URL` | Same as your local `.env` |
| `SUPABASE_SERVICE_KEY` | Same as your local `.env` |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Same as your local `.env` (full JSON string) |
| `NUMBERS_FILE_ID` | `1MnLVtMdRBruXrzopPBTzco2g2WmavRk3` |

## Workflow File (`.github/workflows/sync-numbers.yml`)

```yaml
name: Sync Numbers → Supabase

on:
  schedule:
    - cron: '0 * * * *'   # every hour
  workflow_dispatch:        # manual trigger from GitHub mobile app

jobs:
  sync:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'

      - name: Install Node deps
        run: npm ci

      - name: Install numbers-parser
        run: pip install numbers-parser

      - name: Download .numbers file from Drive
        env:
          GOOGLE_SERVICE_ACCOUNT_JSON: ${{ secrets.GOOGLE_SERVICE_ACCOUNT_JSON }}
          NUMBERS_FILE_ID: ${{ secrets.NUMBERS_FILE_ID }}
        run: node scripts/download-numbers-file.mjs

      - name: Sync to Supabase
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_KEY: ${{ secrets.SUPABASE_SERVICE_KEY }}
          NUMBERS_FILE: /tmp/mills_export/2025-2026 Renewals_Dashboard.numbers
        run: node scripts/sync-from-numbers.mjs
```

## New Script (`scripts/download-numbers-file.mjs`)

```js
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
```

## Change to `sync-from-numbers.mjs`

Replace the hardcoded file path (line ~96):

```js
// Before
const NUMBERS_FILE = '/Volumes/One Touch/The_Team_Google_Drive Sync/2025-2026 Renewals_Dashboard.numbers';

// After
const NUMBERS_FILE = process.env.NUMBERS_FILE
  || '/Volumes/One Touch/The_Team_Google_Drive Sync/2025-2026 Renewals_Dashboard.numbers';
```

The local fallback means the script still works on the local machine unchanged.

## Triggering from Your Phone

1. Open **GitHub mobile app**
2. Navigate to this repo → **Actions**
3. Select **"Sync Numbers → Supabase"**
4. Tap **"Run workflow"**

## Keeping Local Sync

The local scheduled task can stay active as a backup — the env var fallback means it still reads from `/Volumes/One Touch/...` when run locally. Both paths upsert to the same Supabase tables, so running both is safe (idempotent).
