/**
 * Edge middleware smoke checks (no DB).
 * Usage: node --env-file=.env scripts/test-edge-mcp-auth.mjs
 * Requires: npm run dev on :3000
 */
const BASE = process.env.TEST_BASE_URL || "http://127.0.0.1:3001";

async function hit(path, init = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text.slice(0, 200);
  }
  return { status: res.status, gate: res.headers.get("x-agent-gate"), body };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  console.log(`base=${BASE}`);

  // 1) /api/mcp without token → blocked
  const blocked = await hit("/api/mcp");
  assert(blocked.status === 401, `expected 401 without token, got ${blocked.status}`);
  assert(
    blocked.body?.code === "AGENT_UNAUTHORIZED" ||
      blocked.body?.code === "MCP_UNAUTHORIZED",
    `unexpected code: ${JSON.stringify(blocked.body)}`
  );
  console.log("ok  GET /api/mcp no token → 401");

  // 2) malformed bearer → blocked
  const bad = await hit("/api/mcp", {
    headers: { authorization: "Bearer not-a-valid-key" },
  });
  assert(bad.status === 401, `expected 401 bad token, got ${bad.status}`);
  console.log("ok  GET /api/mcp bad bearer → 401");

  // 3) valid live key shape (matches generateAPIKey: 8_16_40 hex)
  const live =
    "ss_live_aabbccdd_1122334455667788_99aabbccddeeff00112233445566778899aa";
  const ok = await hit("/api/mcp", {
    headers: { authorization: `Bearer ${live}` },
  });
  assert(ok.status !== 401, `live key should pass Edge, got ${ok.status} ${JSON.stringify(ok.body)}`);
  assert(ok.body?.success === true, `expected success list, got ${JSON.stringify(ok.body)}`);
  console.log(`ok  GET /api/mcp live key → ${ok.status} count=${ok.body.count}`);

  // 3b) x-agent-token header also accepted
  const viaX = await hit("/api/mcp", {
    headers: { "x-agent-token": live },
  });
  assert(viaX.status !== 401, `x-agent-token should pass, got ${viaX.status}`);
  console.log(`ok  GET /api/mcp x-agent-token → ${viaX.status}`);

  // 4) /api/agent without Edge token should NOT 401 from middleware (deferred)
  const agent = await hit("/api/agent", {
    method: "POST",
    body: JSON.stringify({}),
  });
  assert(
    agent.status !== 401 || agent.body?.code === "UNAUTHORIZED",
    `agent should not Edge-block; got ${agent.status} ${JSON.stringify(agent.body)}`
  );
  console.log(`ok  POST /api/agent no edge token → ${agent.status} (handler auth)`);

  // 5) SSRF: localhost blocked in production simulation via POST connect
  // (createClient uses NODE_ENV of the Next server — expect connect fail or URL blocked)
  const ssrf = await hit("/api/mcp", {
    method: "POST",
    headers: { authorization: `Bearer ${live}` },
    body: JSON.stringify({ url: "http://127.0.0.1:9/mcp" }),
  });
  // In development loopback is allowed → may 502 connect failed; in prod would 502 with blocked message.
  assert(ssrf.status !== 401, `SSRF probe should be past auth, got ${ssrf.status}`);
  console.log(`ok  POST /api/mcp loopback probe → ${ssrf.status} ${ssrf.body?.code || ""}`);

  console.log("all edge auth checks passed");
}

main().catch((err) => {
  console.error("FAIL", err.message);
  process.exit(1);
});
