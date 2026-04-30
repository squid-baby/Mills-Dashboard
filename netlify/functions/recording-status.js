// Recording status endpoint — backs the inline REC pill in the dashboard.
//
// GET   → public, returns { recording, since, updatedAt }
// POST  → gated by RECORDING_SECRET env var; body { recording: bool }
//          Used by scripts/meeting-capture/record-meeting.sh on the Mac.
//
// Uses the Netlify Functions v2 signature so Blobs context is auto-injected.
// (The v1 `handler(event)` form throws MissingBlobsEnvironmentError because
// Blobs context isn't bound to legacy handlers.)

import { getStore } from '@netlify/blobs';

const STORE_NAME = 'recording-status';
const KEY = 'state';
const DEFAULT_STATE = { recording: false, since: null, updatedAt: null };

function jsonResponse(body, statusCode = 200) {
  return new Response(JSON.stringify(body), {
    status: statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

export default async (req) => {
  const store = getStore(STORE_NAME);

  if (req.method === 'GET') {
    const state = (await store.get(KEY, { type: 'json' })) || DEFAULT_STATE;
    return jsonResponse(state);
  }

  if (req.method === 'POST') {
    const expected = process.env.RECORDING_SECRET;
    if (!expected) {
      return jsonResponse(
        { ok: false, message: 'RECORDING_SECRET not configured on the server' },
        500,
      );
    }

    const provided = req.headers.get('x-recording-secret');
    if (provided !== expected) {
      return jsonResponse({ ok: false, message: 'unauthorized' }, 401);
    }

    let body = {};
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ ok: false, message: 'invalid JSON body' }, 400);
    }

    const recording = !!body.recording;
    const now = new Date().toISOString();
    const state = {
      recording,
      since: recording ? now : null,
      updatedAt: now,
    };

    await store.setJSON(KEY, state);
    return jsonResponse({ ok: true, ...state });
  }

  return jsonResponse({ ok: false, message: 'method not allowed' }, 405);
};
