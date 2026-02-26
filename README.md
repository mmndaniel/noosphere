# Noosphere

**The shared mind for your AI tools.**

A local MCP server that gives any AI tool persistent memory. Build in Claude Code, ask about it in Claude web, pick up where you left off in Cursor — every tool shares the same brain.

---

## How it works

Noosphere stores two things per project:

- **Project state** — a living document that's always current: architecture, decisions, what's in progress, continuation hints.
- **Entry log** — an append-only history of sessions and decisions you can search and read.

Any AI tool with MCP support can read from and write to it using four tools: `browse`, `search`, `read`, `push`.

---

## Setup (one time)

### 1. Start the server

```bash
cd /home/daniel-vm/noosphere
./start.sh
```

The server runs on port 3456. To stop it: `./stop.sh`.

To start it automatically whenever you open a terminal, add this to your `~/.bashrc` or `~/.zshrc`:

```bash
/home/daniel-vm/noosphere/start.sh &>/dev/null
```

### 2. Connect Claude Code

The MCP config is already in `~/.claude/settings.json`. Just restart Claude Code and run `/mcp` to confirm `noosphere` appears with 4 tools.

### 3. Add Noosphere to a project

Run this from inside your project directory:

```bash
/home/daniel-vm/noosphere/init-project.sh .
```

This detects your git remote URL, uses it as the `project_id`, and appends Noosphere instructions to your `CLAUDE.md`. That's the file Claude Code reads at session start — so from now on, Claude will automatically load your project's memory and save to it.

**No git repo?** Pass a name manually:

```bash
/home/daniel-vm/noosphere/init-project.sh . "my-project-name"
```

---

## Daily usage

### Starting a session

Just open Claude Code in your project. It reads `CLAUDE.md`, sees the Noosphere instructions, and calls `browse` automatically to load your project context and continuation hints.

You'll see something like:

```
## Current State
- auth: complete
- billing: in progress

## Continuation Hints
- latest: Was writing the webhook handler, next step is idempotency check
```

Claude picks up from there.

### During work

Claude will push summaries at natural checkpoints. You can also ask explicitly:

> "Push a summary to Noosphere"
> "Save this decision to Noosphere"
> "Update the project state — auth is now complete"

### Ending a session

Before closing, say:

> "Push a session summary to Noosphere with continuation hints"

This saves what you did and what comes next — so the next session (or another tool) picks up exactly where you left off.

---

## The four tools

| Tool | What it does |
|------|-------------|
| `browse` | Returns all projects, or the full current state for a specific project |
| `search` | Full-text search across all entries for a project |
| `read` | Read a full entry or a specific section of an entry |
| `push` | Save a work summary, decision, or project state update |

You rarely call these manually — Claude handles them. But you can:

```
browse my noosphere projects
search noosphere for ["auth", "jwt", "login"] in github.com/user/myapp
read entry e_20260225_171631_0h8d
push to noosphere: we just finished the auth system, next up is billing
```

---

## Project identity

A `project_id` is just a string. It doesn't require git or code.

- **Git project**: `init-project.sh` auto-detects it from your remote URL → `github.com/user/myapp`
- **Non-git project**: Pass any name → `"my-novel"`, `"home-automation"`, `"learning-rust"`

Any AI tool using the same `project_id` shares the same memory — across tools, devices, and sessions.

---

## Todo lists + Noosphere

Claude Code's built-in todo list tracks tasks within a single session. Noosphere makes that persist across sessions:

1. Session starts → `browse` loads context → Claude builds a todo list from continuation hints
2. Work happens, todo list tracks in-session progress
3. Session ends → Claude pushes remaining todo items as the new continuation hint
4. Next session → picks up the todo list automatically

Add this to your `CLAUDE.md` to make it explicit:

```markdown
### At session start:
- Call `browse`, then build a todo list from the continuation hints.

### At session end:
- Push remaining todo items as the Continuation Hint.
```

---

## Connecting other tools

Any MCP-compatible tool can use the same server. Point it at:

```
http://localhost:3456/mcp
```

For Claude web or remote access, you'll need to expose the server publicly (e.g. via a VPS or tunnel). Set the `NOOSPHERE_TOKEN` env var to enable auth.

---

## Files

```
noosphere/
├── start.sh          — start the server (idempotent)
├── stop.sh           — stop the server
├── init-project.sh   — add Noosphere to a project's CLAUDE.md
├── src/              — server source code
└── data/
    ├── noosphere.db  — SQLite database (all your memory lives here)
    └── server.log    — server logs
```

Back up `data/noosphere.db` if you care about your memory persisting through a reinstall.
