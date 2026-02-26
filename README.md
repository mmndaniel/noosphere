# Noosphere

**The shared mind for your AI tools.**

An MCP server that gives any AI tool persistent memory. Build in Claude Code, ask about it in Claude web, pick up where you left off in Cursor — every tool shares the same brain.

---

## How it works

Noosphere stores two things per project:

- **Project state** — a living document that's always current: architecture, decisions, what's in progress, continuation hints.
- **Entry log** — an append-only history of sessions and decisions you can search and read.

Any AI tool with MCP support can read from and write to it using four tools: `browse`, `search`, `read`, `push`. No config files required — the tools are self-describing. The AI learns how to use them from the tool descriptions and the protocol hints embedded in browse output.

---

## Setup

### Option A: Claude.ai web (recommended)

Configure Noosphere once in Claude.ai's web UI. It automatically becomes available in Claude Code too (if you're logged into the same account).

1. Go to [claude.ai/settings](https://claude.ai/settings) → Integrations / MCP Servers
2. Add a new server with URL: `https://usenoosphere.ai/mcp`
3. Complete the OAuth login

That's it. Both Claude.ai web and Claude Code now have access to Noosphere.

### Option B: Claude Code only (direct OAuth)

If you don't use Claude.ai web, or want to configure Claude Code independently:

```bash
claude mcp add noosphere --transport http --scope user https://usenoosphere.ai/mcp
```

Then restart Claude Code and run `/mcp` — you'll be prompted to complete OAuth in your browser.

### Either way

No project setup is needed. A `project_id` is just a string — the first `push` creates the project automatically. The AI infers it from directory name, git remote, or conversation topic.

---

## Daily usage

### Starting a session

Ask the AI to browse your project, or just start working — it'll discover the tools on its own. You'll see something like:

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

A `project_id` is just a string. It doesn't require git or code — you can use `"my-novel"`, `"home-automation"`, `"learning-rust"`, etc.

For git projects, the AI typically derives the project_id from the remote URL (e.g. `github.com/user/myapp`). Any AI tool using the same `project_id` shares the same memory — across tools, devices, and sessions.

---

## Optional: Add CLAUDE.md instructions to a project

If you want Claude Code to automatically browse Noosphere at session start and push at session end, you can add instructions to a project's `CLAUDE.md`:

```bash
./init-project.sh /path/to/project
```

This appends Noosphere workflow instructions to `CLAUDE.md` and installs a post-commit git hook that flushes the buffer on each commit.

You can also add the instructions manually — see `init-project.sh` for what gets appended.

---

## Todo lists + Noosphere

Claude Code's built-in todo list tracks tasks within a single session. Noosphere makes that persist across sessions:

1. Session starts → `browse` loads context → Claude builds a todo list from continuation hints
2. Work happens, todo list tracks in-session progress
3. Session ends → Claude pushes remaining todo items as the new continuation hint
4. Next session → picks up the todo list automatically

---

## Connecting other tools

Any MCP-compatible tool can connect to:

```
https://usenoosphere.ai/mcp
```

Authentication is via OAuth. The tool will prompt you to log in on first connection.

---

## Self-hosting

Noosphere is hosted at `usenoosphere.ai`, but you can also run your own instance:

```bash
git clone https://github.com/mmndaniel/noosphere.git
cd noosphere
npm install
npm run build
./start.sh
```

The server runs on port 3456 by default. Point your MCP client at `http://localhost:3456/mcp`.

To stop it: `./stop.sh`

### Auth options for self-hosted

Without any auth configuration, the server runs in open mode — all data is stored under a single `local` user. This is fine for personal, single-user use.

For bearer token auth, set `NOOSPHERE_TOKEN` in your environment:

```bash
NOOSPHERE_TOKEN=your-secret-token ./start.sh
```

For full OAuth with multi-user support, configure Auth0 env vars — see `.env.example`.
