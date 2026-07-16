import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const entropy = randomBytes(32).toString("hex");
const key = `ss_live_${entropy.slice(0, 8)}_${entropy.slice(8, 24)}_${entropy.slice(24)}`;

let env = readFileSync(".env", "utf8");
const line = `MASTER_AGENT_TOKEN="${key}"`;

if (/^MASTER_AGENT_TOKEN=/m.test(env)) {
  env = env.replace(/^MASTER_AGENT_TOKEN=.*$/m, line);
} else {
  env =
    env.trimEnd() +
    "\n\n# Master agent Bearer for /api/workspaces and /api/agents/heal\n" +
    line +
    "\n";
}

writeFileSync(".env", env);
process.stdout.write(key);
