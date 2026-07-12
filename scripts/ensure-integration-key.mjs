import { randomBytes } from "crypto";
import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

const envPath = resolve(process.cwd(), ".env");
let content = readFileSync(envPath, "utf8");

if (/^INTEGRATION_ENCRYPTION_KEY=/m.test(content)) {
  console.log("INTEGRATION_ENCRYPTION_KEY already present in .env");
  process.exit(0);
}

const key = randomBytes(32).toString("base64");

if (!content.endsWith("\n")) {
  content += "\n";
}

content += `\n# ─── Integration Credentials (auto-generated) ────────────────────────────────\nINTEGRATION_ENCRYPTION_KEY="${key}"\n`;
writeFileSync(envPath, content, "utf8");
console.log("INTEGRATION_ENCRYPTION_KEY appended to .env");
