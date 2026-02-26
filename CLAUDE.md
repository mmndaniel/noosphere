
## Noosphere — Dev Conventions

This is the Noosphere codebase. Noosphere is an MCP server for persistent
AI memory across tools. Project ID: `noosphere`

### Two MCP servers — know the difference

| Server | Purpose | When to use |
|--------|---------|-------------|
| `noosphere` (prod) | Real project memory at usenoosphere.ai | Browse/push project context, session summaries, decisions |
| `noosphere-dev` (local) | Dev instance at localhost:3456 | Testing server code changes only |

**Default to prod (`noosphere`) for all project memory operations.**
Only use `noosphere-dev` when actively testing changes to the MCP server itself.

### Testing: use the MCP tools, not direct HTTP
- **Always prefer `noosphere-dev` MCP tools** (browse, push, search, read) over
  curl, fetch, or direct DB queries when interacting with the local server.
- This is the product surface — using it is dogfooding. Bypassing it hides bugs.
- Only go direct HTTP when debugging HTTP-level behavior (status codes, headers,
  auth rejection responses) that the MCP abstraction hides.

### Build
- `npm run build` (esbuild) — do NOT use `tsc`, it hangs/OOMs
- Deploy: `~/.fly/bin/flyctl deploy`
