import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

const envPath = resolve(process.cwd(), ".env");
let content = readFileSync(envPath, "utf8");

if (!/^DISCORD_SUPPORT_WEBHOOK_URL=/m.test(content)) {
  const legacyWebhook =
    "https://discord.com/api/webhooks/1522089547452645507/jrvkzwpSZJjxZZR2OgXF4j-S83wRZaZfjQi6WmG8T9TJAQYVbcpmPJlLA0ANs6nclEsp";
  if (!content.endsWith("\n")) content += "\n";
  content += `\nDISCORD_SUPPORT_WEBHOOK_URL="${legacyWebhook}"\n`;
  console.log("DISCORD_SUPPORT_WEBHOOK_URL migrated from legacy contact route.");
}

const starterMatch = content.match(/^STRIPE_STARTER_PRICE_ID="([^"]*)"/m);
const premiumMatch = content.match(/^STRIPE_PREMIUM_PRICE_ID="([^"]*)"/m);

if (!starterMatch && premiumMatch?.[1] && !premiumMatch[1].includes("placeholder")) {
  if (!content.endsWith("\n")) content += "\n";
  content += `STRIPE_STARTER_PRICE_ID="${premiumMatch[1]}"\n`;
  content += `NEXT_PUBLIC_STRIPE_STARTER_PRICE_ID="${premiumMatch[1]}"\n`;
  console.log(
    "STRIPE_STARTER_PRICE_ID seeded from legacy STRIPE_PREMIUM_PRICE_ID ($49 tier)."
  );
  console.log("Run npm run stripe:setup-premium to provision the $149 Premium price.");
}

writeFileSync(envPath, content, "utf8");
