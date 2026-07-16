/**
 * Idempotent mock McpHost seed for local/dev.
 * Usage: node --env-file=.env scripts/seed-mcp-hosts.mjs
 * Does not delete or overwrite existing rows with the same url.
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const MOCK_HOSTS = [
  {
    name: "Dev Filesystem MCP",
    url: "http://127.0.0.1:3100/mcp",
    transport: "HTTP",
  },
  {
    name: "Public Example MCP",
    url: "https://mcp.example.com/mcp",
    transport: "HTTP",
  },
  {
    name: "Legacy SSE Probe",
    url: "https://mcp.example.com/sse",
    transport: "SSE",
  },
];

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required.");
  }

  const pool = new Pool({ connectionString });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    let created = 0;
    let skipped = 0;

    for (const host of MOCK_HOSTS) {
      const existing = await prisma.mcpHost.findFirst({
        where: { url: host.url },
        select: { id: true },
      });
      if (existing) {
        skipped += 1;
        console.log(`skip  ${host.url} (${existing.id})`);
        continue;
      }

      const row = await prisma.mcpHost.create({
        data: {
          name: host.name,
          url: host.url,
          transport: host.transport,
          isActive: true,
          authTokenCipher: null,
        },
      });
      created += 1;
      console.log(`create ${row.id} ${host.url}`);
    }

    console.log(`done created=${created} skipped=${skipped}`);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
