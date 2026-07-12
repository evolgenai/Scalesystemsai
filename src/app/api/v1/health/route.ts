import { NextRequest, NextResponse } from "next/server";

type DependencyCheck = {
  name: string;
  status: string;
};

type HealthPayload = {
  status: "OPERATIONAL";
  timestamp: string;
  uptime: number;
  dependencies: DependencyCheck[];
};

const NO_CACHE_HEADERS = {
  "Cache-Control": "private, no-cache, no-store, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

const MOCK_DEPENDENCIES: DependencyCheck[] = [
  { name: "database", status: "HEALTHY" },
  { name: "orchestrationEngine", status: "HEALTHY" },
  { name: "edgeGatewayLatency", status: "14ms" },
];

export async function GET(_request: NextRequest) {
  const payload: HealthPayload = {
    status: "OPERATIONAL",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    dependencies: MOCK_DEPENDENCIES,
  };

  return NextResponse.json(payload, {
    status: 200,
    headers: NO_CACHE_HEADERS,
  });
}
