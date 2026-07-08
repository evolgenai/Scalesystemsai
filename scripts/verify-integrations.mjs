import { config } from "dotenv";

config();

function ok(label, value) {
  const valid =
    Boolean(value) &&
    !value.includes("placeholder") &&
    !value.includes("[user]") &&
    !value.includes("your_");
  console.log(`${valid ? "OK" : "MISSING"}  ${label}`);
  return valid;
}

const checks = [
  ok("DATABASE_URL", process.env.DATABASE_URL ?? ""),
  ok("STRIPE_SECRET_KEY", process.env.STRIPE_SECRET_KEY ?? ""),
  ok("STRIPE_WEBHOOK_SECRET", process.env.STRIPE_WEBHOOK_SECRET ?? ""),
  ok("STRIPE_PREMIUM_PRICE_ID", process.env.STRIPE_PREMIUM_PRICE_ID ?? ""),
  ok("BVNK_HAWK_AUTH_ID", process.env.BVNK_HAWK_AUTH_ID ?? process.env.BVNK_API_KEY ?? ""),
  ok("BVNK_HAWK_AUTH_KEY", process.env.BVNK_HAWK_AUTH_KEY ?? process.env.BVNK_API_SECRET ?? ""),
  ok("BVNK_WALLET_ID", process.env.BVNK_WALLET_ID ?? ""),
  ok("BVNK_WEBHOOK_SECRET", process.env.BVNK_WEBHOOK_SECRET ?? ""),
];

if (checks.includes(false)) {
  console.log("\n[Integrations] One or more required values are missing.");
  process.exit(1);
}

console.log("\n[Integrations] Environment looks ready for local test loop.");
