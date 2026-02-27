# Noosphere

**Working memory for your AI tools.**

Every AI conversation starts from zero. Your thinking — the brainstorms, the decisions, the context — evaporates when you close the tab. Noosphere is the working memory layer that makes it persist. Think out loud on your phone, build at your desk, refine in a different tool. Every session picks up where the last one left off.

Code lives in git. Tasks live in Linear. Docs live in Notion. Noosphere holds the layer underneath — the brainstorm that hasn't become a decision yet, the decision that hasn't become code yet, the *why* behind every *what*. The stuff that's too raw for any system of record but too valuable to lose.

Read the full origin story and use cases in [STORY.md](STORY.md).

---

## How it works

Noosphere is an [MCP server](https://modelcontextprotocol.io) that any AI tool can connect to. It stores two things per project:

- **Project state** — a living document that's always current: decisions, what's in progress, continuation hints.
- **Entry log** — an append-only history of sessions, brainstorms, and decisions you can search and read.

Four tools: `browse`, `search`, `read`, `push`. No config files required — the tools are self-describing. The AI learns how to use them on its own.

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

Ask the AI to browse your project, or just start working — it'll discover the tools on its own. It loads your current state and picks up where you left off.

### During work

The AI pushes summaries at natural checkpoints — decisions made, milestones reached, direction changes. You can also ask explicitly:

> "Push this to Noosphere"
> "Save this decision"
> "Update the state — auth is complete"

### Ending a session

Before closing:

> "Push a session summary with continuation hints"

This saves what you did and what comes next — so the next session (in any tool, on any device) picks up exactly where you left off.

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
