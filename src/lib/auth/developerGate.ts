/**
 * Developer tier gatekeeper — blocks USER_ACCOUNT / unauthenticated callers
 * from script compilation, sandbox telemetry, and advanced developer layouts.
 */

import type {
  AccountProfileKind,
  WorkspaceAuthLevel,
} from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import { resolveRequestUser } from "@/lib/auth/requestUser";

export type DeveloperCapability =
  | "sandbox"
  | "script_compilation"
  | "advanced_flags"
  | "container_orchestration";

export type DeveloperGateOk = {
  ok: true;
  userId: string;
  accountKind: AccountProfileKind;
  developerAccountId: string;
  sandboxEnabled: boolean;
  orchestrationEnabled: boolean;
  isSuperAdmin: boolean;
};

export type DeveloperGateDenied = {
  ok: false;
  code: "UNAUTHORIZED_TIER";
  message: string;
  status: 403;
  required: AccountProfileKind;
  actual: AccountProfileKind | "ANONYMOUS";
  capability: DeveloperCapability;
};

export type DeveloperGateResult = DeveloperGateOk | DeveloperGateDenied;

export class DeveloperTierError extends Error {
  readonly code: DeveloperGateDenied["code"];
  readonly status: DeveloperGateDenied["status"];
  readonly denied: DeveloperGateDenied;

  constructor(denied: DeveloperGateDenied) {
    super(denied.message);
    this.name = "DeveloperTierError";
    this.code = denied.code;
    this.status = denied.status;
    this.denied = denied;
  }
}

const AUTH_LEVEL_RANK: Record<WorkspaceAuthLevel, number> = {
  BASIC: 0,
  ADVANCED_TOOLS: 1,
  CONTAINER_ORCHESTRATION: 2,
};

const CAPABILITY_MIN_LEVEL: Record<DeveloperCapability, WorkspaceAuthLevel> = {
  advanced_flags: "ADVANCED_TOOLS",
  sandbox: "ADVANCED_TOOLS",
  script_compilation: "ADVANCED_TOOLS",
  container_orchestration: "CONTAINER_ORCHESTRATION",
};

function denied(
  actual: AccountProfileKind | "ANONYMOUS",
  capability: DeveloperCapability
): DeveloperGateDenied {
  return {
    ok: false,
    code: "UNAUTHORIZED_TIER",
    message: "403 Unauthorized Tier — verified DeveloperAccount required.",
    status: 403,
    required: "DEVELOPER_ACCOUNT",
    actual,
    capability,
  };
}

/**
 * Resolve and enforce developer profile tier for deep tooling endpoints.
 * SUPER_ADMIN bypasses tier checks but still receives a synthetic gate context
 * when a DeveloperAccount row exists; otherwise creates an ephemeral ok using
 * the admin user id without requiring sandbox flags.
 */
export async function resolveDeveloperGate(
  request: Request,
  capability: DeveloperCapability = "sandbox"
): Promise<DeveloperGateResult> {
  const profile = await resolveRequestUser(request);

  if (!profile.id) {
    return denied("ANONYMOUS", capability);
  }

  if (profile.isSuperAdmin || profile.role === "SUPER_ADMIN") {
    const adminDev = await getPrisma().developerAccount.findUnique({
      where: { userId: profile.id },
      select: {
        id: true,
        sandboxEnabled: true,
        orchestrationEnabled: true,
        verifiedAt: true,
        user: { select: { accountKind: true } },
      },
    });

    return {
      ok: true,
      userId: profile.id,
      accountKind: adminDev?.user.accountKind ?? "DEVELOPER_ACCOUNT",
      developerAccountId: adminDev?.id ?? `superadmin:${profile.id}`,
      sandboxEnabled: adminDev?.sandboxEnabled ?? true,
      orchestrationEnabled: adminDev?.orchestrationEnabled ?? true,
      isSuperAdmin: true,
    };
  }

  if (profile.accountKind !== "DEVELOPER_ACCOUNT") {
    return denied(profile.accountKind, capability);
  }

  const developer = await getPrisma().developerAccount.findUnique({
    where: { userId: profile.id },
    select: {
      id: true,
      sandboxEnabled: true,
      orchestrationEnabled: true,
      verifiedAt: true,
    },
  });

  if (!developer || !developer.verifiedAt) {
    return denied("USER_ACCOUNT", capability);
  }

  if (
    (capability === "sandbox" || capability === "script_compilation") &&
    !developer.sandboxEnabled
  ) {
    return denied("USER_ACCOUNT", capability);
  }

  if (
    capability === "container_orchestration" &&
    !developer.orchestrationEnabled
  ) {
    return denied(profile.accountKind, capability);
  }

  return {
    ok: true,
    userId: profile.id,
    accountKind: "DEVELOPER_ACCOUNT",
    developerAccountId: developer.id,
    sandboxEnabled: developer.sandboxEnabled,
    orchestrationEnabled: developer.orchestrationEnabled,
    isSuperAdmin: false,
  };
}

/**
 * Enforce workspace.requiredAuthLevel against an already-resolved developer gate.
 */
export function assertWorkspaceAuthLevel(
  gate: DeveloperGateOk,
  requiredAuthLevel: WorkspaceAuthLevel,
  capability: DeveloperCapability = "sandbox"
): DeveloperGateResult {
  if (gate.isSuperAdmin) return gate;

  const needed = AUTH_LEVEL_RANK[requiredAuthLevel];
  const capabilityFloor =
    AUTH_LEVEL_RANK[CAPABILITY_MIN_LEVEL[capability]];
  const floor = Math.max(needed, capabilityFloor);

  if (floor <= AUTH_LEVEL_RANK.BASIC) return gate;

  if (floor <= AUTH_LEVEL_RANK.ADVANCED_TOOLS) {
    if (!gate.sandboxEnabled) {
      return denied(gate.accountKind, capability);
    }
    return gate;
  }

  if (!gate.orchestrationEnabled) {
    return denied(gate.accountKind, "container_orchestration");
  }

  return gate;
}

export function throwIfDeveloperDenied(
  result: DeveloperGateResult
): DeveloperGateOk {
  if (!result.ok) throw new DeveloperTierError(result);
  return result;
}

export function developerGateJson(denied: DeveloperGateDenied) {
  return {
    success: false as const,
    error: denied.message,
    code: denied.code,
    required: denied.required,
    actual: denied.actual,
    capability: denied.capability,
  };
}
