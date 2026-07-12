const baseUrl = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const url = `${baseUrl}/api/test-e2e`;

try {
  const response = await fetch(url);
  const payload = await response.json();

  console.log(JSON.stringify(payload, null, 2));

  if (!response.ok || !payload.success) {
    process.exit(1);
  }
} catch (error) {
  console.error(
    `E2E harness unreachable at ${url}. Start the dev server: npm run dev`
  );
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
