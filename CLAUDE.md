
## Noosphere — Project Memory

This project uses Noosphere for cross-tool context sharing.
Project ID: noosphere

You have access to these MCP tools: browse, search, read, push.

### At session start:
- Call `browse` with this project's ID to load current context
  and continuation hints. Build a todo list from those hints.

### During work:
- Push immediately after any of these:
  - A task is verified working (e.g. a connection test passes)
  - A key decision is made
  - A feature or fix is complete
- Update `state_deltas` to reflect the new reality (don't leave stale state).

### At session end:
- Always `push` a final summary. Include remaining todo items
  as the Continuation Hint so the next session picks up where you left off.
