#!/usr/bin/env node
"use strict";

async function captureSystemSnapshot() {
  try {
    require("dotenv").config();

    const { execSync } = require("child_process");
    const { PrismaClient } = require("@prisma/client");
    const { PrismaPg } = require("@prisma/adapter-pg");
    const { Pool } = require("pg");

    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      return;
    }

    const branch = execSync("git rev-parse --abbrev-ref HEAD", {
      encoding: "utf8",
    }).trim();

    const lastCommit = execSync("git log -1 --pretty=%B", {
      encoding: "utf8",
    }).trim();

    const pool = new Pool({ connectionString });
    const adapter = new PrismaPg(pool);
    const prisma = new PrismaClient({ adapter });

    const activeAgentsCount = await prisma.agent.count();

    await prisma.systemSnapshot.create({
      data: {
        branch,
        lastCommit,
        activeAgentsCount,
      },
    });

    await prisma.$disconnect();
    await pool.end();
  } catch {
    // Fail silently — snapshot must not disrupt workspace operations.
  }
}

void captureSystemSnapshot();
