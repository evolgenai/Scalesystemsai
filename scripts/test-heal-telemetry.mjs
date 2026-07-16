const base = process.env.TEST_BASE_URL || "http://127.0.0.1:3001";
const live =
  "ss_live_aabbccdd_1122334455667788_99aabbccddeeff00112233445566778899aa";

async function main() {
  const post = await fetch(`${base}/api/telemetry/errors`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      route: "/api/demo",
      errorMessage: "TypeError: x is not a function",
      stackTrace: "at src/app/api/demo/route.ts:12",
    }),
  });
  console.log("POST telemetry", post.status, await post.json());

  const list = await fetch(`${base}/api/telemetry/errors`);
  console.log("GET telemetry", list.status, await list.json());

  const denied = await fetch(`${base}/api/agents/heal`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  console.log("POST heal noauth", denied.status, await denied.json());

  const heal = await fetch(`${base}/api/agents/heal`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${live}`,
    },
    body: JSON.stringify({ sync: true }),
  });
  console.log("POST heal sync", heal.status, await heal.json());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
