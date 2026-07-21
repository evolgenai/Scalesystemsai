/**
 * /api/admin/vault — index for Database Snapshot Vault engine.
 * Operational endpoints:
 *   POST /api/admin/vault/backup
 *   GET  /api/admin/vault/backups
 */

import { apiSuccess } from "@/lib/http/apiResponse";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return apiSuccess({
    data: {
      engine: "database-snapshot-vault",
      version: 1,
      endpoints: {
        backup: { method: "POST", path: "/api/admin/vault/backup" },
        backups: { method: "GET", path: "/api/admin/vault/backups" },
      },
      auth: ["SUPER_ADMIN", "x-workspace-key"],
    },
  });
}
