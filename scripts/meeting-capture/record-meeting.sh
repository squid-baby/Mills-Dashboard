#!/usr/bin/env bash
# record-meeting.sh — Flic button toggle for meeting recording
#
# First press:  start recording from Anker mic
# Second press: stop recording, launch processing pipeline
#
# Usage: bash scripts/meeting-capture/record-meeting.sh
# Wire to Flic button: single press → F13 → macOS Shortcut → Run Shell Script

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/meeting-capture.env"

# Load env vars (so ANKER_DEVICE is available)
if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck source=/dev/null
  source "$ENV_FILE"
  set +a
fi

PID_FILE="/tmp/meetings/recording.pid"
WAV_PATH_FILE="/tmp/meetings/recording.wav_path"
LOG_FILE="/tmp/meetings/meeting-pipeline.log"
DEVICE="${ANKER_DEVICE:-PowerConf S3}"

mkdir -p /tmp/meetings

if [ -f "$PID_FILE" ]; then
  # ── Second press: stop recording and launch pipeline ────────────────────────
  say "What a lovely gathering of the minds — meeting adjourned"

  WAV_FILE=$(cat "$WAV_PATH_FILE" 2>/dev/null)
  kill "$(cat "$PID_FILE")" 2>/dev/null
  rm -f "$PID_FILE"

  echo "[$(date)] Recording stopped. Launching pipeline for: $WAV_FILE" >> "$LOG_FILE"

  /opt/homebrew/Cellar/node@22/22.22.0/bin/node "$SCRIPT_DIR/process-meeting.mjs" "$WAV_FILE" >> "$LOG_FILE" 2>&1 &

else
  # ── First press: start recording ────────────────────────────────────────────
  say "Let the meeting commence, wise ones"

  TIMESTAMP=$(date +%Y%m%d-%H%M%S)
  OUTPUT_FILE="/tmp/meetings/meeting-${TIMESTAMP}.wav"
  echo "$OUTPUT_FILE" > "$WAV_PATH_FILE"

  # Record mono 16kHz WAV from Anker mic
  # Note: -y overwrites if file exists; SIGTERM finalizes the WAV header cleanly
  ffmpeg -f avfoundation -i ":${DEVICE}" -ar 16000 -ac 1 -y "$OUTPUT_FILE" \
    >> "$LOG_FILE" 2>&1 &

  echo $! > "$PID_FILE"
  echo "[$(date)] Recording started: $OUTPUT_FILE (ffmpeg PID $!)" >> "$LOG_FILE"
fi
