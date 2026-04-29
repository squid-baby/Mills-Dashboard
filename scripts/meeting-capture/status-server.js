#!/usr/bin/env node
// Local recording status server — zero npm dependencies
// Watches /tmp/meetings/recording.pid to reflect record-meeting.sh state
//
// Usage: node scripts/meeting-capture/status-server.js
// Then open http://localhost:2626 in a browser

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = 2626;
const PID_FILE = '/tmp/meetings/recording.pid';
const RECORD_SCRIPT = path.join(__dirname, 'record-meeting.sh');
const HTML_FILE = path.join(__dirname, 'status.html');

function isRecording() {
  try {
    return fs.existsSync(PID_FILE);
  } catch {
    return false;
  }
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (req.method === 'GET' && url.pathname === '/') {
    try {
      const html = fs.readFileSync(HTML_FILE, 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    } catch (err) {
      res.writeHead(500);
      res.end(`Could not read status.html: ${err.message}`);
    }
    return;
  }

  if (req.method === 'GET' && url.pathname === '/status') {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    });
    res.end(JSON.stringify({ recording: isRecording() }));
    return;
  }

  if (req.method === 'POST' && url.pathname === '/toggle') {
    // Spawn record-meeting.sh detached so it outlives this request
    const proc = spawn('bash', [RECORD_SCRIPT], {
      detached: true,
      stdio: 'ignore',
    });
    proc.unref();

    // Give the script ~600ms to write/remove the PID file
    setTimeout(() => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ recording: isRecording() }));
    }, 600);
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`\nRecording status page → http://localhost:${PORT}\n`);
});
