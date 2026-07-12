import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import {
  decryptCredential,
  encryptCredential,
} from "@/lib/credentials";
import {
  executeAgent,
  estimateAgentTokens,
  type AgentType,
} from "@/lib/agentRuntime";
import { checkAgentAccess, recordAgentRun } from "@/lib/quotaGuard";
import { getPrisma } from "@/lib/prisma";

const E2E_USER_EMAIL = "e2e-harness@scalesystems.local";
const MOCK_OPENAI_KEY = "sk-e2e-mock-openai-key-for-structural-test";
const AGENT_TYPE: AgentType = "support-specialist";

type GateResult = {
  gate: string;
  passed: boolean;
  code: string;
  detail?: string;
};

type E2EResponse = {
  success: boolean;
  gates: GateResult[];
  testUserId?: string;
  agentType: AgentType;
  summary: string;
};

function gate(
  name: string,
  passed: boolean,
  code: string,
  detail?: string
): GateResult {
  return { gate: name, passed, code, detail };
}

function isDevHarnessAllowed(): boolean {
  return process.env.NODE_ENV === "development";
}

async function ensureTestUser(): Promise<string> {
  const prisma = getPrisma();
  const existing = await prisma.user.findUnique({
    where: { email: E2E_USER_EMAIL },
    select: { id: true },
  });

  if (existing) return existing.id;

  const created = await prisma.user.create({
    data: {
      email: E2E_USER_EMAIL,
      password: await bcrypt.hash("e2e-harness-password", 10),
      name: "E2E Harness",
      plan: "FREE",
    },
    select: { id: true },
  });

  return created.id;
}

async function cleanupTestArtifacts(userId: string): Promise<void> {
  const prisma = getPrisma();
  await prisma.userIntegrationKey.deleteMany({
    where: { userId, provider: "openai" },
  });
}

async function runHarness(): Promise<E2EResponse> {
  const gates: GateResult[] = [];
  let testUserId: string | undefined;

  const encryptionKey = process.env.INTEGRATION_ENCRYPTION_KEY?.trim() ?? "";
  gates.push(
    gate(
      "ENCRYPTION_ENV",
      encryptionKey.length >= 32,
      encryptionKey.length >= 32 ? "ENV_OK" : "ENV_MISSING",
      encryptionKey.length >= 32
        ? "INTEGRATION_ENCRYPTION_KEY is configured."
        : "INTEGRATION_ENCRYPTION_KEY must be at least 32 characters."
    )
  );

  if (!gates[gates.length - 1].passed) {
    return {
      success: false,
      gates,
      agentType: AGENT_TYPE,
      summary: "Harness aborted: encryption environment not configured.",
    };
  }

  try {
    const encrypted = encryptCredential(MOCK_OPENAI_KEY);
    const decrypted = decryptCredential(encrypted);
    gates.push(
      gate(
        "CRYPTO_ROUNDTRIP",
        decrypted === MOCK_OPENAI_KEY,
        decrypted === MOCK_OPENAI_KEY ? "CRYPTO_OK" : "CRYPTO_MISMATCH",
        "encryptCredential/decryptCredential round-trip verified."
      )
    );
  } catch (error) {
    gates.push(
      gate(
        "CRYPTO_ROUNDTRIP",
        false,
        "CRYPTO_ERROR",
        error instanceof Error ? error.message : "Encryption round-trip failed."
      )
    );
  }

  try {
    testUserId = await ensureTestUser();
    gates.push(
      gate(
        "SESSION_CONTEXT",
        true,
        "SESSION_MOCK_OK",
        `Test user resolved as authenticated subject (${testUserId}).`
      )
    );
  } catch (error) {
    gates.push(
      gate(
        "SESSION_CONTEXT",
        false,
        "SESSION_MOCK_FAILED",
        error instanceof Error ? error.message : "Failed to resolve test user."
      )
    );
    return {
      success: false,
      gates,
      agentType: AGENT_TYPE,
      summary: "Harness aborted: could not establish mock session context.",
    };
  }

  await cleanupTestArtifacts(testUserId);

  try {
    const prisma = getPrisma();
    const ciphertext = encryptCredential(MOCK_OPENAI_KEY);
    await prisma.userIntegrationKey.upsert({
      where: {
        userId_provider: { userId: testUserId, provider: "openai" },
      },
      create: {
        userId: testUserId,
        provider: "openai",
        encryptedValue: ciphertext,
      },
      update: { encryptedValue: ciphertext },
    });

    const stored = await prisma.userIntegrationKey.findUnique({
      where: {
        userId_provider: { userId: testUserId, provider: "openai" },
      },
      select: { encryptedValue: true },
    });

    const fromDb = stored
      ? decryptCredential(stored.encryptedValue)
      : "";

    gates.push(
      gate(
        "DB_ENCRYPT_PERSIST",
        fromDb === MOCK_OPENAI_KEY,
        fromDb === MOCK_OPENAI_KEY ? "DB_CRYPTO_OK" : "DB_CRYPTO_MISMATCH",
        "OpenAI credential encrypted at rest and decrypted from Neon."
      )
    );
  } catch (error) {
    gates.push(
      gate(
        "DB_ENCRYPT_PERSIST",
        false,
        "DB_CRYPTO_ERROR",
        error instanceof Error ? error.message : "Database persistence failed."
      )
    );
  }

  try {
    const tokensRequired = estimateAgentTokens(AGENT_TYPE);
    const quota = await checkAgentAccess(testUserId, {
      agentType: AGENT_TYPE,
      tokensRequired,
    });

    gates.push(
      gate(
        "QUOTA_GUARD",
        quota.allowed,
        quota.allowed ? "QUOTA_OK" : quota.code,
        quota.allowed
          ? `Plan allows ${AGENT_TYPE} execution (${tokensRequired} est. tokens).`
          : quota.error
      )
    );
  } catch (error) {
    gates.push(
      gate(
        "QUOTA_GUARD",
        false,
        "QUOTA_ERROR",
        error instanceof Error ? error.message : "Quota guard check failed."
      )
    );
  }

  try {
    const dispatch = await executeAgent(testUserId, AGENT_TYPE);
    const passed = !("error" in dispatch);
    gates.push(
      gate(
        "AGENT_DISPATCH",
        passed,
        passed ? "DISPATCH_OK" : dispatch.code,
        passed
          ? dispatch.workflow.summary
          : dispatch.error
      )
    );

    if (passed) {
      const quotaReplay = await checkAgentAccess(testUserId, {
        agentType: AGENT_TYPE,
        tokensRequired: dispatch.computeTokensSpent,
      });

      if (quotaReplay.allowed) {
        await recordAgentRun(
          testUserId,
          AGENT_TYPE,
          dispatch.computeTokensSpent
        );
      }

      gates.push(
        gate(
          "AGENT_ROUTE_FLOW",
          quotaReplay.allowed,
          quotaReplay.allowed ? "ROUTE_FLOW_OK" : quotaReplay.code,
          quotaReplay.allowed
            ? "Mirrored /api/agent pipeline: quota → dispatch → record."
            : quotaReplay.error
        )
      );
    } else {
      gates.push(
        gate(
          "AGENT_ROUTE_FLOW",
          false,
          "DISPATCH_BLOCKED",
          "Skipped route replay because dispatch did not pass credential validation."
        )
      );
    }
  } catch (error) {
    gates.push(
      gate(
        "AGENT_DISPATCH",
        false,
        "DISPATCH_ERROR",
        error instanceof Error ? error.message : "Agent dispatch failed."
      )
    );
    gates.push(
      gate(
        "AGENT_ROUTE_FLOW",
        false,
        "ROUTE_FLOW_ERROR",
        "Route replay aborted due to dispatch failure."
      )
    );
  }

  const success = gates.every((g) => g.passed);
  const failed = gates.filter((g) => !g.passed).map((g) => g.gate);

  return {
    success,
    gates,
    testUserId,
    agentType: AGENT_TYPE,
    summary: success
      ? "All E2E gates passed: Auth context → encryption → quota → support-specialist dispatch."
      : `Failed gate(s): ${failed.join(", ")}.`,
  };
}

export async function GET(): Promise<NextResponse<E2EResponse | { success: false; error: string; code: string }>> {
  if (!isDevHarnessAllowed()) {
    return NextResponse.json(
      {
        success: false,
        error: "E2E harness is only available in development.",
        code: "E2E_DISABLED",
      },
      { status: 403 }
    );
  }

  try {
    const result = await runHarness();
    return NextResponse.json(result, { status: result.success ? 200 : 422 });
  } catch (error) {
    console.error("[E2E Harness] Unhandled error:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "E2E harness failed unexpectedly.",
        code: "E2E_INTERNAL_ERROR",
      },
      { status: 500 }
    );
  }
}
