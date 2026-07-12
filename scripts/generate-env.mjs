#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const envPath = path.join(process.cwd(), ".env");

const DEFAULTS = {
  AUTH_SECRET: null,
  NEXTAUTH_URL: "http://localhost:3000",
  STRIPE_SECRET_KEY: "sk_test_placeholder",
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_test_placeholder",
  STRIPE_WEBHOOK_SECRET: "whsec_placeholder",
  STRIPE_PREMIUM_PRICE_ID: "price_placeholder",
  NEXT_PUBLIC_STRIPE_PREMIUM_PRICE_ID: "price_placeholder",
  BVNK_HAWK_AUTH_ID: "bvnk_hawk_auth_id_placeholder",
  BVNK_HAWK_AUTH_KEY: "bvnk_hawk_auth_key_placeholder",
  BVNK_API_KEY: "bvnk_hawk_auth_id_placeholder",
  BVNK_API_SECRET: "bvnk_hawk_auth_key_placeholder",
  BVNK_MERCHANT_ID: "bvnk_merchant_id_placeholder",
  BVNK_WALLET_ID: "bvnk_wallet_id_placeholder",
  BVNK_WEBHOOK_SECRET: "bvnk_webhook_secret_placeholder",
  BVNK_API_BASE_URL: "https://api.sandbox.bvnk.com",
};

function parseEnvFile(content) {
  const map = new Map();

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    map.set(key, value);
  }

  return map;
}

function serializeEnv(map) {
  if (!map.has("AUTH_SECRET")) {
    map.set("AUTH_SECRET", crypto.randomBytes(32).toString("base64"));
  }

  for (const [key, defaultValue] of Object.entries(DEFAULTS)) {
    if (key === "AUTH_SECRET") continue;
    if (!map.has(key)) {
      map.set(key, defaultValue);
    }
  }

  const lines = [
    "# ScaleSystems environment configuration",
    "# IMPORTANT: Set DATABASE_URL to your Neon connection string first.",
    "# Example: postgresql://user:password@ep-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require",
    `DATABASE_URL="${map.get("DATABASE_URL") ?? "postgresql://user:password@localhost:5432/scalesystems"}"`,
    "",
  ];

  for (const key of Object.keys(DEFAULTS)) {
    lines.push(`${key}="${map.get(key)}"`);
  }

  return `${lines.join("\n")}\n`;
}

const existingContent = fs.existsSync(envPath)
  ? fs.readFileSync(envPath, "utf8")
  : "";

const envMap = parseEnvFile(existingContent);

if (!envMap.has("DATABASE_URL")) {
  console.warn(
    "Warning: DATABASE_URL is missing. Add your Neon URL before running prisma db push."
  );
}

if (envMap.get("DATABASE_URL")?.includes("localhost:5432")) {
  console.warn(
    "Warning: DATABASE_URL points to localhost. Replace it with your Neon connection string to fix Prisma P1001 errors."
  );
}

fs.writeFileSync(envPath, serializeEnv(envMap), { encoding: "utf8" });
console.log(`Updated ${envPath} while preserving existing DATABASE_URL and secrets.`);
