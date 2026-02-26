#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG="$SCRIPT_DIR/data/server.log"
PID_FILE="$SCRIPT_DIR/data/server.pid"
PORT="${PORT:-3456}"

mkdir -p "$SCRIPT_DIR/data"

# Check if something is already listening on the port (covers stale PID files)
if lsof -ti:"$PORT" &>/dev/null; then
  EXISTING_PID=$(lsof -ti:"$PORT")
  echo "Noosphere is already running (PID $EXISTING_PID) on port $PORT"
  echo "$EXISTING_PID" > "$PID_FILE"
  exit 0
fi

echo "Starting Noosphere on port $PORT..."
PORT=$PORT node --max-old-space-size=512 "$SCRIPT_DIR/node_modules/.bin/tsx" \
  "$SCRIPT_DIR/src/index.ts" >> "$LOG" 2>&1 &

echo $! > "$PID_FILE"
sleep 1

if lsof -ti:"$PORT" &>/dev/null; then
  echo "Started (PID $(cat "$PID_FILE"))"
  echo "Endpoint: http://localhost:$PORT/mcp"
  echo "Logs: $LOG"
else
  echo "Failed to start. Check logs: $LOG"
  tail -20 "$LOG"
  exit 1
fi
