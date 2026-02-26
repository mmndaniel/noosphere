#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_FILE="$SCRIPT_DIR/data/server.pid"

if [ ! -f "$PID_FILE" ]; then
  echo "Noosphere is not running (no PID file)"
  exit 0
fi

PID=$(cat "$PID_FILE")
if kill -0 "$PID" 2>/dev/null; then
  kill "$PID"
  rm "$PID_FILE"
  echo "Stopped (PID $PID)"
else
  rm "$PID_FILE"
  echo "Not running (stale PID file cleaned up)"
fi
