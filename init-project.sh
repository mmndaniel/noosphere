#!/bin/bash
# Usage: ./init-project.sh /path/to/project [project_id]
# Adds Noosphere instructions to the project's CLAUDE.md.

set -e

PROJECT_PATH="${1:-.}"
CLAUDE_MD="$PROJECT_PATH/CLAUDE.md"

# Derive project_id from git remote, fall back to provided arg or directory name
if [ -n "$2" ]; then
  PROJECT_ID="$2"
elif git -C "$PROJECT_PATH" remote get-url origin &>/dev/null; then
  RAW=$(git -C "$PROJECT_PATH" remote get-url origin)
  # Strip protocol, auth tokens, .git suffix
  PROJECT_ID=$(echo "$RAW" | sed 's|https\?://||; s|git@||; s|:|/|; s|\.git$||; s|.*@||')
else
  PROJECT_ID=$(basename "$(cd "$PROJECT_PATH" && pwd)")
fi

# Check if already added
if [ -f "$CLAUDE_MD" ] && grep -q "Noosphere" "$CLAUDE_MD"; then
  echo "Noosphere instructions already present in $CLAUDE_MD"
  exit 0
fi

cat >> "$CLAUDE_MD" << EOF

## Noosphere — Project Memory

This project uses Noosphere for cross-tool context sharing.
Project ID: $PROJECT_ID

You have access to these MCP tools: browse, search, read, push.

### At session start:
- Call \`browse\` with this project's ID to load current context
  and continuation hints. Build a todo list from those hints.

### During work:
- Push immediately after any of these:
  - A task is verified working (e.g. a connection test passes)
  - A key decision is made
  - A feature or fix is complete
- Update \`state_deltas\` to reflect the new reality (don't leave stale state).

### At session end:
- Always \`push\` a final summary. Include remaining todo items
  as the Continuation Hint so the next session picks up where you left off.
EOF

echo "Added Noosphere instructions to $CLAUDE_MD"
echo "Project ID: $PROJECT_ID"

# Install git hook if target is a git repo
if [ -d "$PROJECT_PATH/.git" ]; then
  HOOK_SRC="$(cd "$(dirname "$0")" && pwd)/hooks/post-commit"
  HOOK_DST="$PROJECT_PATH/.git/hooks/post-commit"
  if [ -f "$HOOK_SRC" ]; then
    cp "$HOOK_SRC" "$HOOK_DST"
    chmod +x "$HOOK_DST"
    echo "Installed post-commit hook to $HOOK_DST"
  else
    echo "Warning: hooks/post-commit not found at $HOOK_SRC, skipping hook install"
  fi
else
  echo "Not a git repo — skipping hook install"
fi
