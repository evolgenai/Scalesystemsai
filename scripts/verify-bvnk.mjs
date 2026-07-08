import { config } from "dotenv";
import Hawk from "hawk";

config();

const baseUrl =
  process.env.BVNK_API_BASE_URL?.replace(/\/$/, "") ??
  "https://api.sandbox.bvnk.com";

const hawkId =
  process.env.BVNK_HAWK_AUTH_ID?.trim() ||
  process.env.BVNK_API_KEY?.trim() ||
  "";
const hawkKey =
  process.env.BVNK_HAWK_AUTH_KEY?.trim() ||
  process.env.BVNK_API_SECRET?.trim() ||
  "";
const walletId = process.env.BVNK_WALLET_ID?.trim() ?? "";
const webhookSecret = process.env.BVNK_WEBHOOK_SECRET?.trim() ?? "";

function missing(label, value) {
  return !value || value.includes("placeholder");
}

async function main() {
  const gaps = [];
  if (missing("BVNK_HAWK_AUTH_ID", hawkId)) gaps.push("BVNK_HAWK_AUTH_ID");
  if (missing("BVNK_HAWK_AUTH_KEY", hawkKey)) gaps.push("BVNK_HAWK_AUTH_KEY");
  if (missing("BVNK_WALLET_ID", walletId)) gaps.push("BVNK_WALLET_ID");
  if (missing("BVNK_WEBHOOK_SECRET", webhookSecret)) {
    gaps.push("BVNK_WEBHOOK_SECRET");
  }

  if (gaps.length > 0) {
    console.error("[BVNK Verify] Missing env values:", gaps.join(", "));
    console.error("Run: npm run bvnk:configure");
    process.exit(1);
  }

  const endpoint = `${baseUrl}/api/v1/merchant`;
  const { header } = Hawk.client.header(endpoint, "GET", {
    credentials: {
      id: hawkId,
      key: hawkKey,
      algorithm: "sha256",
    },
  });

  const response = await fetch(endpoint, {
    method: "GET",
    headers: {
      Authorization: header,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const body = await response.text();
    console.error("[BVNK Verify] Hawk auth failed:", response.status, body);
    process.exit(1);
  }

  console.log("[BVNK Verify] Hawk authentication OK.");
  console.log("[BVNK Verify] Wallet ID configured:", walletId);
  console.log("[BVNK Verify] Webhook secret configured.");
  console.log("[BVNK Verify] Checkout endpoint:", `${baseUrl}/api/v1/pay/summary`);
}

main().catch((error) => {
  console.error("[BVNK Verify] Failed:", error);
  process.exit(1);
});
