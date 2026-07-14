/**
 * Remove stale Next.js / Turbopack caches that cause Windows ENOENT
 * manifest crashes after interrupted builds.
 */
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const targets = [".next", "node_modules/.cache"];

for (const relative of targets) {
  const full = path.join(root, relative);
  if (!fs.existsSync(full)) {
    console.log(`[clean] skip (missing): ${relative}`);
    continue;
  }
  fs.rmSync(full, { recursive: true, force: true });
  console.log(`[clean] removed: ${relative}`);
}

console.log("[clean] done");
