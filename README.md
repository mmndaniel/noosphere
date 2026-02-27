# Noosphere

**Working memory of your context for AI tools.**

Your thinking is scattered across threads, tools, and devices. Each conversation is a silo — what you figured out in one doesn't exist in the next. Noosphere is the working memory layer that connects them. Think out loud on your phone, build at your desk, refine in a different tool. They all share the same context.

You spend an hour refining an approach with Claude, then open Cursor and have to explain it all over again. You brainstorm on your phone, then sit down at your desk and it's gone. The thinking lives in context windows and people's heads — and both get cleared.

Code lives in git. Tasks live in Linear. Docs live in Notion. But the layer underneath — the brainstorm that hasn't become a decision yet, the decision that hasn't become code yet, the *why* behind every *what* — has nowhere to go. It's too raw for any system of record but too valuable to lose.

Noosphere is that layer. Connect your tools and they share the same working memory. Think out loud in one, pick up where you left off in another.

Read the full origin story and use cases in [STORY.md](STORY.md).

---

## How it works

Noosphere is an [MCP server](https://modelcontextprotocol.io). Any AI tool that supports MCP can connect to it — Claude, ChatGPT, Cursor, or anything else. They all share the same memory.

It stores two things per project:

- **Project state** — a living document that's always current: decisions, what's in progress, next steps.
- **Entry log** — an append-only history of sessions, brainstorms, and decisions you can search and read.

The AI discovers Noosphere automatically and uses it behind the scenes. You don't need to learn any commands — just talk naturally:

> "What were we working on?"
> "Remember this decision"
> "Save where we are"

---

## Connect your tools

Noosphere is hosted at `usenoosphere.ai`. Connect as many tools as you want — they all share the same memory.

```
https://usenoosphere.ai/mcp
```

### [Claude.ai](https://claude.ai)

Customize → Integrations → Add → paste the URL above.

### [ChatGPT](https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt-beta)

Settings → Apps → Create → paste the URL above. Requires Pro, Team, or Enterprise with Developer Mode enabled.

### [Claude Code](https://code.claude.com/docs/en/mcp)

```bash
claude mcp add noosphere --transport http --scope user https://usenoosphere.ai/mcp
```

### [Cursor](https://docs.cursor.com/context/model-context-protocol)

Add to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "noosphere": {
      "url": "https://usenoosphere.ai/mcp"
    }
  }
}
```

### [Codex](https://developers.openai.com/codex/mcp)

Add to `~/.codex/config.toml`:

```toml
[mcp_servers.noosphere]
url = "https://usenoosphere.ai/mcp"
```

### [Windsurf](https://docs.windsurf.com/windsurf/cascade/mcp)

Add to `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "noosphere": {
      "serverUrl": "https://usenoosphere.ai/mcp"
    }
  }
}
```

### Any other MCP tool

Point it at `https://usenoosphere.ai/mcp`. OAuth will prompt you to log in.

---

## Using it

### Projects

A project is just a name — `"my-novel"`, `"home-automation"`, `"learning-rust"`, whatever you're working on. No setup needed. The AI creates projects automatically the first time it saves something.

For git projects, the AI typically picks up the project name from the remote URL. Any tool using the same project name shares the same memory.

### The rhythm

1. **Start** — the AI loads your current state and picks up where you left off
2. **Work** — the AI saves context at natural checkpoints: decisions made, milestones reached, direction changes
3. **Stop** — say "save where we are" so the next session (in any tool, on any device) knows what comes next

---

## Self-hosting

You can run your own instance instead of using `usenoosphere.ai`:

```bash
git clone https://github.com/mmndaniel/noosphere.git
cd noosphere
npm install
npm run build
./start.sh
```

The server runs on port 3456 by default. Point your MCP client at `http://localhost:3456/mcp`. To stop: `./stop.sh`

Without auth configuration, the server runs in open mode (single `local` user — fine for personal use). For bearer token auth, set `NOOSPHERE_TOKEN`. For full OAuth, configure Auth0 env vars — see `.env.example`.
