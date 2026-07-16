# Scale Systems — Agentic Infrastructure Architecture

> Trajectory note (2026-07): paradigm shift from monolithic request handlers toward a **decentralized Agent Host** mesh — Edge gate → Token Vault → MCP connectors → optional Vercel Sandbox (Firecracker microVMs).

## Ops (this iteration)

```bash
npx prisma db push          # additive AgentTokenVault + McpHost + AppErrorLog (no wipe)
npm run db:seed:mcp         # idempotent mock McpHost rows
node --env-file=.env scripts/test-edge-mcp-auth.mjs
```

| Route | Auth | Behavior |
| --- | --- | --- |
| `POST/GET /api/telemetry/errors` | **Public** (not in Edge matcher) | Ingest / list unresolved `AppErrorLog` |
| `POST /api/agents/heal` | Edge Bearer required | Multi-agent supervisor→writer→validator + `toolCalls` |
| `POST/GET /api/workspaces` | Edge Bearer required | Create/list tenant workspaces (`apiKey` once on create) |
| `GET /api/mcp` | Edge Bearer / sealed token | List registered hosts (no secrets) |
| `POST /api/mcp` | Edge verified | Connect + `listTools` (`url` or `hostId`) |
| `GET/POST /api/mcp/hosts` | Edge verified | List / create hosts |
| `GET/PATCH /api/mcp/hosts/[id]` | Edge verified | Read / edit host |
| `POST /api/agent*` | Deferred (body `clientApiKey`) | Not Edge-blocked by default |

## Current stack

| Layer | Role |
| --- | --- |
| Next.js Edge Middleware (`middleware.ts`) | Ultra-fast agent routing, sealed-token decrypt (Web Crypto AES-GCM), unauthorized blocks before Node |
| Token Vault (`AgentTokenVault` + `src/lib/mcp/tokenVault.ts`) | Issue `ss_live_*` keys; persist prefix + SHA-256 hash + sealed claims only |
| MCP controller (`POST /api/mcp`) | `@ai-sdk/mcp` `createMCPClient` over streamable HTTP (preferred) or SSE; dynamic `listTools` |
| Neon Postgres + Prisma | Existing User / Org / Swarm / Plugin models; additive vault + MCP host tables (no breaking renames) |
| Agent sandboxes | Today: sealed `node:vm` / local Python. Target: **Vercel Sandbox** Firecracker microVMs per run |

## Request path

```
Client
  │  Authorization: Bearer ss_live_…  |  x-agent-token: ss:iv:tag:cipher
  ▼
Edge Middleware
  │  verify / decrypt → x-agent-auth: verified
  │  optional x-agent-host → x-scale-agent-host (Agent Host routing hint)
  ▼
API Routes (Node)
  ├─ /api/mcp          → createScaleMcpClient → listTools → close()
  ├─ /api/agents/*     → swarm / sandbox / stream (session or deferred auth)
  └─ /api/agent        → legacy clientApiKey body auth (unchanged)
```

## Token Vault pattern

1. `issueVaultToken()` returns raw key **once** + `sealedClaims` envelope.
2. Persist `keyPrefix`, `keyHash`, `sealedPayload` in `AgentTokenVault`.
3. Edge decrypts sealed envelopes with `TOKEN_VAULT_KEY` (falls back to `PLUGINS_ENCRYPTION_KEY`).
4. Opaque live keys may optionally be constrained via `AGENT_TOKEN_ALLOWLIST_HASH` (SHA-256 of full key).

## MCP hosts

- Register remote hosts in `McpHost` (`HTTP` | `SSE`).
- Encrypt outbound host credentials with existing `encryptSecret()` (`ss:…` envelope).
- `POST /api/mcp` accepts `{ url, transport? }` or `{ hostId }` (vault lookup + decrypt at Node runtime).
- Outbound URLs pass `assertPublicHttpUrl` (SSRF guard); redirects rejected (`redirect: "error"`).

## Agent Host / Sandbox trajectory

| Phase | Execution target |
| --- | --- |
| Now | In-process sandbox (`src/lib/agents/codeSandbox.ts`) |
| Next | Route `x-agent-host` to dedicated **Vercel Sandbox** Firecracker microVMs; vault scopes gate `sandbox:run` |
| Later | Per-tenant Agent Hosts + MCP tool meshes; compound checkpoints (DB snapshot + secrets + deploy metadata) |

## Env additions

```bash
# Edge Token Vault AES key (64 hex chars). Falls back to PLUGINS_ENCRYPTION_KEY.
TOKEN_VAULT_KEY=

# Optional: SHA-256 hex of a single allowed ss_live_* key (Edge allowlist).
AGENT_TOKEN_ALLOWLIST_HASH=

# Force Bearer/x-agent-token on all matched agent routes (incl. workforce).
AGENT_MIDDLEWARE_STRICT=0
```

## Non-goals (this iteration)

- No replacement of Prisma datasource / connection pooling.
- No deletion of WorkspacePlugin crypto or existing agent routes.
- MCP **server** hosting (inbound tools) deferred — this iteration is the **client** connector + controller.
