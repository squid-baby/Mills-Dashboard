// Recording status endpoint — backs the public /recording.html page.
//
// GET   → public, returns { recording, since, updatedAt }
// POST  → gated by RECORDING_SECRET env var; body { recording: bool }
//          Used by scripts/meeting-capture/record-meeting.sh on the Mac.
//
// State lives in a Netlify Blob so it persists across function invocations
// without needing a SQL migration.

import { getStore } from '@netlify/blobs';

const STORE_NAME = 'recording-status';
const KEY = 'state';

const DEFAULT_STATE = { recording: false, since: null, updatedAt: null };

function jsonResponse(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  };
}

export async function handler(event) {
  const store = getStore(STORE_NAME);

  if (event.httpMethod === 'GET') {
    const state = (await store.get(KEY, { type: 'json' })) || DEFAULT_STATE;
    return jsonResponse(200, state);
  }

  if (event.httpMethod === 'POST') {
    const expected = process.env.RECORDING_SECRET;
    if (!expected) {
      return jsonResponse(500, { ok: false, message: 'RECORDING_SECRET not configured on the server' });
    }

    const provided =
      event.headers['x-recording-secret'] ||
      event.headers['X-Recording-Secret'] ||
      event.headers['X-RECORDING-SECRET'];

    if (provided !== expected) {
      return jsonResponse(401, { ok: false, message: 'unauthorized' });
    }

    let body = {};
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return jsonResponse(400, { ok: false, message: 'invalid JSON body' });
    }

    const recording = !!body.recording;
    const now = new Date().toISOString();
    const state = {
      recording,
      since: recording ? now : null,
      updatedAt: now,
    };

    await store.setJSON(KEY, state);
    return jsonResponse(200, { ok: true, ...state });
  }

  return jsonResponse(405, { ok: false, message: 'method not allowed' });
}
