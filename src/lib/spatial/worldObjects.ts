/**
 * Unique Spatial Node Registry — 100+ nodes on a 500×500 grid.
 *
 * Rules:
 * - ~80% unique interactive IT/gadget nodes (no duplicated interactive types)
 * - ~20% visual decorators (bio-flora / cosmic / metallic — types may repeat)
 * - Exactly 30% of interactive nodes flagged `requires_pin: true`
 * - Each interactive node: distinct id, type, title, payload + keyboard binding
 */

import { z } from "zod";
import {
  GRID_SIZE,
  DEFAULT_NODE_COUNT,
  MIN_NODE_COUNT,
  MAX_NODE_COUNT,
  DEFAULT_WORLD_SEED,
  hashSeed,
  mulberry32,
} from "@/lib/spatial/proceduralWorld";

export const INTERACTIVE_RATIO = 0.8 as const;
export const DECORATOR_RATIO = 0.2 as const;
export const PIN_RATIO_OF_INTERACTIVE = 0.3 as const;

export const DecoratorKindSchema = z.enum([
  "bio_flora",
  "cosmic_terrain",
  "metallic_structure",
]);
export type DecoratorKind = z.infer<typeof DecoratorKindSchema>;

/** Required unique interactive types (must always appear when count ≥ 100). */
export const REQUIRED_INTERACTIVE_TYPES = [
  "tor_node",
  "network_diagnostic",
  "cyber_rover",
  "sentry_terminal",
  "meta_sre_autofix",
  "quantum_vault",
  "db_shard_monitor",
  "sse_stream_analyzer",
  "mcp_registry_hub",
  "sandbox_executor_node",
] as const;

export type RequiredInteractiveType =
  (typeof REQUIRED_INTERACTIVE_TYPES)[number];

export const NodeCategorySchema = z.enum(["interactive", "decorator"]);
export type NodeCategory = z.infer<typeof NodeCategorySchema>;

export const InteractivePayloadSchema = z.object({
  action: z.string(),
  endpoint: z.string().nullable(),
  keyboard: z.object({
    /** Physical key code for KeyboardEvent.code listeners (e.g. KeyE). */
    code: z.string(),
    label: z.string(),
    hold: z.boolean(),
  }),
  effect: z.string().nullable(),
  data: z.record(z.string(), z.unknown()),
});
export type InteractivePayload = z.infer<typeof InteractivePayloadSchema>;

export const SpatialRegistryNodeSchema = z.object({
  id: z.string().min(1),
  index: z.number().int().min(0),
  type: z.string().min(1),
  title: z.string().min(1),
  category: NodeCategorySchema,
  requires_pin: z.boolean(),
  accessLevel: z.enum(["Public", "Admin", "Superadmin"]),
  coordinates: z.object({
    x: z.number(),
    y: z.number(),
    z: z.number(),
  }),
  rotationY: z.number(),
  scale: z.number().positive(),
  interactive: z.boolean(),
  payload: InteractivePayloadSchema.nullable(),
  telemetry: z.object({
    cpuLoad: z.number().min(0).max(1),
    latencyMs: z.number().min(0),
    status: z.enum(["online", "degraded", "locked", "idle", "decorative"]),
  }),
});
export type SpatialRegistryNode = z.infer<typeof SpatialRegistryNodeSchema>;

export const WorldObjectsMatrixSchema = z.object({
  seed: z.string(),
  gridSize: z.literal(GRID_SIZE),
  count: z.number().int().min(MIN_NODE_COUNT),
  generatedAt: z.string().datetime(),
  ratios: z.object({
    interactive: z.number(),
    decorator: z.number(),
    pinOfInteractive: z.number(),
  }),
  stats: z.object({
    interactiveCount: z.number().int(),
    decoratorCount: z.number().int(),
    pinProtectedCount: z.number().int(),
    uniqueInteractiveTypes: z.number().int(),
    duplicatedInteractiveTypes: z.number().int(),
    interactionRate: z.number(),
  }),
  typeCounts: z.record(z.string(), z.number().int()),
  objects: z.array(SpatialRegistryNodeSchema).min(MIN_NODE_COUNT),
  pinProtectedIds: z.array(z.string()),
  requiredNodeIds: z.record(z.string(), z.string()),
});
export type WorldObjectsMatrix = z.infer<typeof WorldObjectsMatrixSchema>;

/** @deprecated Prefer SpatialRegistryNode — kept for barrel compatibility. */
export type WorldObject = SpatialRegistryNode;
export type WorldObjectClass = string;
export type WorldObjectAccess = "Public" | "Admin" | "Superadmin";
export const WorldObjectClassSchema = z.string();
export const WorldObjectAccessSchema = z.enum([
  "Public",
  "Admin",
  "Superadmin",
]);
export const WorldObjectSchema = SpatialRegistryNodeSchema;

type CatalogEntry = {
  type: string;
  title: string;
  accessLevel: WorldObjectAccess;
  /** Prefer PIN when selecting the 30% pin tier. */
  pinPreferred: boolean;
  action: string;
  endpoint: string | null;
  effect: string | null;
  keyboardCode: string;
  keyboardLabel: string;
  buildData: (rand: () => number, index: number) => Record<string, unknown>;
};

const KEY_CODES = [
  "KeyE",
  "KeyF",
  "KeyR",
  "KeyT",
  "KeyG",
  "KeyH",
  "KeyV",
  "KeyB",
  "KeyN",
  "KeyM",
  "Digit1",
  "Digit2",
  "Digit3",
  "Digit4",
  "KeyQ",
  "KeyC",
  "KeyX",
  "KeyZ",
] as const;

function keyFor(i: number): (typeof KEY_CODES)[number] {
  return KEY_CODES[i % KEY_CODES.length]!;
}

function ip(rand: () => number): string {
  return `10.${Math.floor(rand() * 256)}.${Math.floor(rand() * 256)}.${
    2 + Math.floor(rand() * 252)
  }`;
}

function metric(rand: () => number, min: number, max: number, digits = 2): number {
  return Number((min + rand() * (max - min)).toFixed(digits));
}

/**
 * Full unique interactive catalog (≥100 types). Required types listed first.
 * Interactive types are never duplicated in a generated world.
 */
export const UNIQUE_INTERACTIVE_CATALOG: readonly CatalogEntry[] = [
  {
    type: "tor_node",
    title: "Tor Onion Router",
    accessLevel: "Public",
    pinPreferred: false,
    action: "tor_mask",
    endpoint: "/api/spatial/tor-mask",
    effect: "ip_masking_matrix",
    keyboardCode: "KeyT",
    keyboardLabel: "[T] Mask IP",
    buildData: (rand) => ({
      circuitHops: 3,
      exitCountryHint: ["se", "nl", "de", "ch"][Math.floor(rand() * 4)],
      sessionProxyRoute: null,
    }),
  },
  {
    type: "network_diagnostic",
    title: "Network Diagnostic Server",
    accessLevel: "Admin",
    pinPreferred: false,
    action: "network_probe",
    endpoint: "/api/spatial/network-diagnostic",
    effect: "ip_probe_overlay",
    keyboardCode: "KeyN",
    keyboardLabel: "[N] Probe Net",
    buildData: (rand) => ({
      virtualIp: ip(rand),
      gateway: `10.0.${Math.floor(rand() * 8)}.1`,
      rttMs: metric(rand, 2, 90),
    }),
  },
  {
    type: "cyber_rover",
    title: "CyberRover Automobile",
    accessLevel: "Public",
    pinPreferred: false,
    action: "vehicle_mount",
    endpoint: "/api/spatial/vehicle-status",
    effect: "mount_vehicle_2x",
    keyboardCode: "KeyF",
    keyboardLabel: "[F] Mount Rover",
    buildData: () => ({
      speedMultiplier: 2.0,
      is_driving: false,
      vehicleClass: "bio_metallic_rover",
    }),
  },
  {
    type: "sentry_terminal",
    title: "Sentry Error Workstation",
    accessLevel: "Superadmin",
    pinPreferred: true,
    action: "sentry_logs",
    endpoint: "/api/spatial/verify-pin",
    effect: "sentry_error_feed",
    keyboardCode: "KeyE",
    keyboardLabel: "[E] Unlock Sentry",
    buildData: () => ({
      feed: "live_issues",
      includeTraceIds: true,
    }),
  },
  {
    type: "meta_sre_autofix",
    title: "Meta-SRE Autofix Console",
    accessLevel: "Superadmin",
    pinPreferred: true,
    action: "autofix_patches",
    endpoint: "/api/spatial/verify-pin",
    effect: "remediation_panel",
    keyboardCode: "KeyR",
    keyboardLabel: "[R] Autofix",
    buildData: (rand) => ({
      openPatches: Math.floor(rand() * 6) + 1,
      platformHealth: metric(rand, 0.7, 0.99, 3),
    }),
  },
  {
    type: "quantum_vault",
    title: "Quantum Encryption Vault",
    accessLevel: "Superadmin",
    pinPreferred: true,
    action: "vault_unlock",
    endpoint: "/api/spatial/verify-pin",
    effect: "vault_token_reveal",
    keyboardCode: "KeyV",
    keyboardLabel: "[V] Vault",
    buildData: (rand) => ({
      keySlots: Math.floor(8 + rand() * 24),
      rotationDays: 90,
    }),
  },
  {
    type: "db_shard_monitor",
    title: "Database Shard Monitor",
    accessLevel: "Admin",
    pinPreferred: false,
    action: "db_pool_telemetry",
    endpoint: "/api/health",
    effect: "pool_hud",
    keyboardCode: "KeyD",
    keyboardLabel: "[D] DB Pool",
    buildData: (rand) => ({
      activeConnections: Math.floor(rand() * 40),
      idleConnections: Math.floor(rand() * 20),
      poolLatencyMs: metric(rand, 1, 45),
    }),
  },
  {
    type: "sse_stream_analyzer",
    title: "SSE Stream Analyzer",
    accessLevel: "Admin",
    pinPreferred: false,
    action: "sse_metrics",
    endpoint: "/api/telemetry/stream",
    effect: "sse_throughput_overlay",
    keyboardCode: "KeyS",
    keyboardLabel: "[S] SSE Stats",
    buildData: (rand) => ({
      eventsPerSec: metric(rand, 2, 120, 1),
      dropRate: metric(rand, 0, 0.04, 4),
      openStreams: Math.floor(rand() * 12) + 1,
    }),
  },
  {
    type: "mcp_registry_hub",
    title: "MCP Registry Hub",
    accessLevel: "Admin",
    pinPreferred: false,
    action: "mcp_status",
    endpoint: "/api/mcp",
    effect: "mcp_status_board",
    keyboardCode: "KeyM",
    keyboardLabel: "[M] MCP Hub",
    buildData: (rand) => ({
      servers: [
        { name: "Sentry", status: rand() > 0.1 ? "online" : "degraded" },
        { name: "GitHub", status: rand() > 0.15 ? "online" : "offline" },
        { name: "Database", status: rand() > 0.08 ? "online" : "degraded" },
      ],
    }),
  },
  {
    type: "sandbox_executor_node",
    title: "Sandbox Executor Node",
    accessLevel: "Admin",
    pinPreferred: false,
    action: "sandbox_status",
    endpoint: "/api/sandbox/persistent",
    effect: "sandbox_live_board",
    keyboardCode: "KeyX",
    keyboardLabel: "[X] Sandboxes",
    buildData: (rand) => ({
      nodeJsActive: Math.floor(rand() * 5),
      pythonActive: Math.floor(rand() * 4),
      idleSlots: Math.floor(rand() * 8),
    }),
  },
  // —— Additional unique interactive gadgets (fill to 100+) ——
  ...buildExtendedCatalog(),
];

function buildExtendedCatalog(): CatalogEntry[] {
  const extras: Array<{
    type: string;
    title: string;
    action: string;
    pinPreferred?: boolean;
    accessLevel?: WorldObjectAccess;
    effect?: string;
  }> = [
    { type: "edge_cdn_probe", title: "Edge CDN Probe", action: "cdn_latency" },
    { type: "dns_resolver_grid", title: "DNS Resolver Grid", action: "dns_lookup" },
    { type: "tls_cert_scanner", title: "TLS Cert Scanner", action: "tls_scan", pinPreferred: true, accessLevel: "Admin" },
    { type: "waf_rule_console", title: "WAF Rule Console", action: "waf_rules", pinPreferred: true, accessLevel: "Admin" },
    { type: "redis_cache_lens", title: "Redis Cache Lens", action: "cache_hit_rate" },
    { type: "kafka_partition_map", title: "Kafka Partition Map", action: "kafka_lag" },
    { type: "graphql_schema_forge", title: "GraphQL Schema Forge", action: "schema_diff" },
    { type: "openapi_contract_desk", title: "OpenAPI Contract Desk", action: "contract_check" },
    { type: "webhook_relay_pad", title: "Webhook Relay Pad", action: "webhook_replay" },
    { type: "cron_scheduler_core", title: "Cron Scheduler Core", action: "cron_status" },
    { type: "feature_flag_tower", title: "Feature Flag Tower", action: "flag_toggle", pinPreferred: true },
    { type: "ab_experiment_lab", title: "A/B Experiment Lab", action: "experiment_stats" },
    { type: "log_tail_console", title: "Log Tail Console", action: "tail_logs" },
    { type: "trace_flamegraph_desk", title: "Trace Flamegraph Desk", action: "flamegraph" },
    { type: "otel_collector_node", title: "OTel Collector Node", action: "otel_metrics" },
    { type: "prometheus_scrape_pad", title: "Prometheus Scrape Pad", action: "prom_scrape" },
    { type: "grafana_lens_panel", title: "Grafana Lens Panel", action: "dashboard_snapshot" },
    { type: "chaos_monkey_switch", title: "Chaos Monkey Switch", action: "chaos_toggle", pinPreferred: true, accessLevel: "Superadmin" },
    { type: "circuit_breaker_board", title: "Circuit Breaker Board", action: "breaker_state" },
    { type: "rate_limit_governor", title: "Rate Limit Governor", action: "rate_budget", pinPreferred: true },
    { type: "jwt_inspector_pad", title: "JWT Inspector Pad", action: "jwt_decode", pinPreferred: true },
    { type: "oauth_flow_simulator", title: "OAuth Flow Simulator", action: "oauth_sim" },
    { type: "session_store_mirror", title: "Session Store Mirror", action: "session_peek", pinPreferred: true },
    { type: "csrf_shield_node", title: "CSRF Shield Node", action: "csrf_status" },
    { type: "cors_policy_desk", title: "CORS Policy Desk", action: "cors_rules" },
    { type: "api_key_rotator", title: "API Key Rotator", action: "rotate_key", pinPreferred: true, accessLevel: "Superadmin" },
    { type: "secret_scanner_bay", title: "Secret Scanner Bay", action: "secret_scan", pinPreferred: true, accessLevel: "Superadmin" },
    { type: "dependency_audit_rack", title: "Dependency Audit Rack", action: "dep_audit" },
    { type: "sbom_manifest_desk", title: "SBOM Manifest Desk", action: "sbom_view" },
    { type: "container_runtime_pad", title: "Container Runtime Pad", action: "container_ps" },
    { type: "k8s_pod_inspector", title: "K8s Pod Inspector", action: "pod_status" },
    { type: "helm_release_board", title: "Helm Release Board", action: "helm_list" },
    { type: "terraform_state_vault", title: "Terraform State Vault", action: "tf_state", pinPreferred: true, accessLevel: "Admin" },
    { type: "pulumi_stack_lens", title: "Pulumi Stack Lens", action: "pulumi_stack" },
    { type: "neon_branch_console", title: "Neon Branch Console", action: "neon_branches" },
    { type: "prisma_migrate_desk", title: "Prisma Migrate Desk", action: "migrate_status", pinPreferred: true },
    { type: "vector_index_probe", title: "Vector Index Probe", action: "vector_stats" },
    { type: "embedding_pipeline_pad", title: "Embedding Pipeline Pad", action: "embed_queue" },
    { type: "llm_router_hub", title: "LLM Router Hub", action: "llm_route" },
    { type: "prompt_cache_node", title: "Prompt Cache Node", action: "prompt_cache" },
    { type: "agent_fleet_radar", title: "Agent Fleet Radar", action: "fleet_status" },
    { type: "swarm_consensus_pad", title: "Swarm Consensus Pad", action: "consensus_vote" },
    { type: "hitl_approval_gate", title: "HITL Approval Gate", action: "hitl_queue", pinPreferred: true },
    { type: "gas_meter_console", title: "Gas Meter Console", action: "gas_balance" },
    { type: "billing_ledger_desk", title: "Billing Ledger Desk", action: "billing_ledger", pinPreferred: true, accessLevel: "Admin" },
    { type: "stripe_webhook_pad", title: "Stripe Webhook Pad", action: "stripe_events" },
    { type: "paypal_capture_node", title: "PayPal Capture Node", action: "paypal_status" },
    { type: "lightning_invoice_bay", title: "Lightning Invoice Bay", action: "ln_invoice" },
    { type: "affiliate_tracker_pad", title: "Affiliate Tracker Pad", action: "affiliate_stats" },
    { type: "catalog_seed_forge", title: "Catalog Seed Forge", action: "catalog_sync" },
    { type: "marketplace_agent_bay", title: "Marketplace Agent Bay", action: "market_list" },
    { type: "plugin_install_dock", title: "Plugin Install Dock", action: "plugin_install" },
    { type: "skill_registry_node", title: "Skill Registry Node", action: "skill_list" },
    { type: "workflow_orchestrator", title: "Workflow Orchestrator", action: "workflow_run", pinPreferred: true },
    { type: "remediation_pr_forge", title: "Remediation PR Forge", action: "heal_pr", pinPreferred: true, accessLevel: "Admin" },
    { type: "git_ops_terminal", title: "GitOps Terminal", action: "git_status" },
    { type: "github_actions_lens", title: "GitHub Actions Lens", action: "gha_runs" },
    { type: "ci_artifact_vault", title: "CI Artifact Vault", action: "artifact_list", pinPreferred: true },
    { type: "e2b_sandbox_bridge", title: "E2B Sandbox Bridge", action: "e2b_stream" },
    { type: "python_script_runner", title: "Python Script Runner", action: "py_run" },
    { type: "scraper_extract_bay", title: "Scraper Extract Bay", action: "scrape_extract" },
    { type: "domain_dns_manager", title: "Domain DNS Manager", action: "domain_map" },
    { type: "workspace_rbac_desk", title: "Workspace RBAC Desk", action: "rbac_matrix", pinPreferred: true, accessLevel: "Admin" },
    { type: "org_presence_radar", title: "Org Presence Radar", action: "presence_map" },
    { type: "team_invite_pad", title: "Team Invite Pad", action: "invite_member" },
    { type: "memory_store_lens", title: "Org Memory Store Lens", action: "memory_query" },
    { type: "analytics_funnel_desk", title: "Analytics Funnel Desk", action: "funnel_stats" },
    { type: "usage_meter_board", title: "Usage Meter Board", action: "usage_meter" },
    { type: "sre_health_monitor", title: "SRE Health Monitor", action: "sre_health" },
    { type: "discord_dispatch_pad", title: "Discord Dispatch Pad", action: "discord_ping", pinPreferred: true },
    { type: "alert_routing_hub", title: "Alert Routing Hub", action: "alert_route" },
    { type: "incident_timeline_desk", title: "Incident Timeline Desk", action: "incident_tl" },
    { type: "postmortem_forge", title: "Postmortem Forge", action: "postmortem_draft", pinPreferred: true },
    { type: "backup_snapshot_bay", title: "Backup Snapshot Bay", action: "vault_backup", pinPreferred: true, accessLevel: "Superadmin" },
    { type: "object_storage_lens", title: "Object Storage Lens", action: "storage_list" },
    { type: "presigned_url_pad", title: "Presigned URL Pad", action: "presign", pinPreferred: true },
    { type: "image_cdn_optimizer", title: "Image CDN Optimizer", action: "img_opt" },
    { type: "webgl_capability_probe", title: "WebGL Capability Probe", action: "webgl_caps" },
    { type: "spatial_morph_forge", title: "Spatial Morph Forge", action: "object_morph", pinPreferred: true },
    { type: "instanced_mesh_profiler", title: "Instanced Mesh Profiler", action: "draw_calls" },
    { type: "avatar_kinematic_pad", title: "Avatar Kinematic Pad", action: "avatar_state" },
    { type: "proximity_interact_ring", title: "Proximity Interact Ring", action: "proximity_scan" },
    { type: "bio_metallic_palette", title: "Bio-Metallic Palette Desk", action: "design_tokens" },
    { type: "keyboard_bind_mapper", title: "Keyboard Bind Mapper", action: "keybind_map" },
    { type: "haptic_feedback_node", title: "Haptic Feedback Node", action: "haptic_pulse" },
    { type: "audio_spatializer_pad", title: "Audio Spatializer Pad", action: "audio_bus" },
    { type: "particle_fx_console", title: "Particle FX Console", action: "fx_toggle" },
    { type: "fog_of_war_projector", title: "Fog-of-War Projector", action: "fog_mask" },
    { type: "minimap_telemetry_pad", title: "Minimap Telemetry Pad", action: "minimap_sync" },
    { type: "waypoint_beacon_array", title: "Waypoint Beacon Array", action: "waypoint_set" },
    { type: "loot_cache_scanner", title: "Loot Cache Scanner", action: "loot_scan" },
    { type: "quest_pipeline_desk", title: "Quest Pipeline Desk", action: "quest_status" },
    { type: "npc_dialog_router", title: "NPC Dialog Router", action: "dialog_tree" },
    { type: "economy_sim_node", title: "Economy Sim Node", action: "economy_tick" },
    { type: "latency_heatmapper", title: "Latency Heatmapper", action: "latency_heat" },
    { type: "packet_capture_bay", title: "Packet Capture Bay", action: "pcap_sample", pinPreferred: true, accessLevel: "Admin" },
    { type: "bgp_peer_console", title: "BGP Peer Console", action: "bgp_peers" },
    { type: "anycast_edge_pad", title: "Anycast Edge Pad", action: "anycast_health" },
    { type: "quic_handshake_desk", title: "QUIC Handshake Desk", action: "quic_probe" },
    { type: "http3_probe_node", title: "HTTP/3 Probe Node", action: "http3_check" },
    { type: "websocket_bus_monitor", title: "WebSocket Bus Monitor", action: "ws_metrics" },
    { type: "service_mesh_lens", title: "Service Mesh Lens", action: "mesh_topo" },
    { type: "istio_sidecar_pad", title: "Istio Sidecar Pad", action: "sidecar_stats" },
    { type: "envoy_filter_desk", title: "Envoy Filter Desk", action: "envoy_filters", pinPreferred: true },
    { type: "mtls_identity_bay", title: "mTLS Identity Bay", action: "mtls_status", pinPreferred: true, accessLevel: "Admin" },
    { type: "zero_trust_gate", title: "Zero-Trust Gate", action: "zt_eval", pinPreferred: true, accessLevel: "Superadmin" },
    { type: "device_posture_scanner", title: "Device Posture Scanner", action: "posture_scan" },
    { type: "firmware_attestation_pad", title: "Firmware Attestation Pad", action: "attest", pinPreferred: true },
    { type: "iot_mcp_bridge", title: "IoT MCP Bridge", action: "iot_devices" },
    { type: "host_inventory_radar", title: "Host Inventory Radar", action: "host_list" },
    { type: "cli_key_mint_desk", title: "CLI Key Mint Desk", action: "cli_mint", pinPreferred: true, accessLevel: "Superadmin" },
    { type: "deploy_pipeline_pad", title: "Deploy Pipeline Pad", action: "cli_deploy", pinPreferred: true },
    { type: "canary_release_board", title: "Canary Release Board", action: "canary_status" },
    { type: "blue_green_switch", title: "Blue/Green Switch", action: "bg_flip", pinPreferred: true, accessLevel: "Admin" },
    { type: "rollback_safety_bay", title: "Rollback Safety Bay", action: "rollback_plan", pinPreferred: true },
    { type: "config_drift_detector", title: "Config Drift Detector", action: "drift_scan" },
    { type: "policy_as_code_desk", title: "Policy-as-Code Desk", action: "policy_eval", pinPreferred: true },
    { type: "compliance_audit_rack", title: "Compliance Audit Rack", action: "compliance", pinPreferred: true, accessLevel: "Admin" },
    { type: "pii_redaction_forge", title: "PII Redaction Forge", action: "pii_scrub", pinPreferred: true },
    { type: "gdpr_erase_console", title: "GDPR Erase Console", action: "gdpr_erase", pinPreferred: true, accessLevel: "Superadmin" },
  ];

  return extras.map((e, i) => ({
    type: e.type,
    title: e.title,
    accessLevel: e.accessLevel ?? "Public",
    pinPreferred: Boolean(e.pinPreferred),
    action: e.action,
    endpoint: `/api/spatial/interact/${e.type}`,
    effect: e.effect ?? `${e.action}_fx`,
    keyboardCode: keyFor(i + 10),
    keyboardLabel: `[${keyFor(i + 10).replace(/^Key|^Digit/, "")}] ${e.title.split(" ")[0]}`,
    buildData: (rand, index) => ({
      nodeIndex: index,
      entropy: metric(rand, 0, 1, 4),
      useful: true,
    }),
  }));
}

const DECORATOR_TITLES: Record<DecoratorKind, string[]> = {
  bio_flora: [
    "Bioluminescent Fern",
    "Neon Mycelium Patch",
    "Chlorophyll Spire",
    "Plasma Moss Cluster",
    "Emerald Vine Lattice",
  ],
  cosmic_terrain: [
    "Cosmic Crater Shelf",
    "Stellar Dust Ridge",
    "Nebula Rock Outcrop",
    "Orbit Debris Pillar",
    "Gravity Well Marker",
  ],
  metallic_structure: [
    "Gunmetal Archway",
    "Charcoal Lattice Frame",
    "Bio-Steel Pylon",
    "Chrome Rib Scaffold",
    "Alloy Resonance Plate",
  ],
};

const DECORATOR_KINDS: DecoratorKind[] = [
  "bio_flora",
  "cosmic_terrain",
  "metallic_structure",
];

function jitter(rand: () => number, cell: number, cells: number): number {
  const cellSize = GRID_SIZE / cells;
  const origin = -GRID_SIZE / 2;
  const base = origin + (cell + 0.5) * cellSize;
  return Number((base + (rand() - 0.5) * cellSize * 0.68).toFixed(3));
}

function shuffleInPlace<T>(arr: T[], rand: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
  return arr;
}

export type GenerateWorldObjectsOptions = {
  seed?: string;
  count?: number;
  now?: Date;
};

/**
 * Deterministic unique registry. Interactive types never repeat.
 * Same seed + count ⇒ identical layout.
 */
export function generateWorldObjectsMatrix(
  options: GenerateWorldObjectsOptions = {}
): WorldObjectsMatrix {
  const seed = (options.seed?.trim() || DEFAULT_WORLD_SEED).slice(0, 128);
  const count = Math.min(
    MAX_NODE_COUNT,
    Math.max(MIN_NODE_COUNT, options.count ?? DEFAULT_NODE_COUNT)
  );
  const nowIso = (options.now ?? new Date()).toISOString();
  const rand = mulberry32(hashSeed(`unique-registry::${seed}::${count}`));

  const interactiveCount = Math.ceil(count * INTERACTIVE_RATIO);
  const decoratorCount = count - interactiveCount;
  const pinProtectedCount = Math.round(
    interactiveCount * PIN_RATIO_OF_INTERACTIVE
  );

  if (UNIQUE_INTERACTIVE_CATALOG.length < interactiveCount) {
    throw new Error(
      `Catalog too small: need ${interactiveCount} unique interactive types, have ${UNIQUE_INTERACTIVE_CATALOG.length}.`
    );
  }

  // Required types first, then fill remaining unique types from catalog.
  const required = UNIQUE_INTERACTIVE_CATALOG.filter((c) =>
    (REQUIRED_INTERACTIVE_TYPES as readonly string[]).includes(c.type)
  );
  const rest = UNIQUE_INTERACTIVE_CATALOG.filter(
    (c) => !(REQUIRED_INTERACTIVE_TYPES as readonly string[]).includes(c.type)
  );
  const pickedRest = shuffleInPlace([...rest], rand).slice(
    0,
    interactiveCount - required.length
  );
  const interactiveEntries = shuffleInPlace(
    [...required, ...pickedRest],
    rand
  );

  // Exactly 30% PIN: prefer pinPreferred, then fill.
  const pinFlags = new Array<boolean>(interactiveCount).fill(false);
  const preferredIdx = interactiveEntries
    .map((e, i) => (e.pinPreferred ? i : -1))
    .filter((i) => i >= 0);
  shuffleInPlace(preferredIdx, rand);
  let pinned = 0;
  for (const i of preferredIdx) {
    if (pinned >= pinProtectedCount) break;
    pinFlags[i] = true;
    pinned++;
  }
  if (pinned < pinProtectedCount) {
    const remaining = interactiveEntries
      .map((_, i) => i)
      .filter((i) => !pinFlags[i]);
    shuffleInPlace(remaining, rand);
    for (const i of remaining) {
      if (pinned >= pinProtectedCount) break;
      pinFlags[i] = true;
      pinned++;
    }
  }

  const cells = Math.ceil(Math.sqrt(count));
  const slotOrder = shuffleInPlace(
    Array.from({ length: count }, (_, i) => i),
    rand
  );

  const objects: SpatialRegistryNode[] = new Array(count);
  const typeCounts: Record<string, number> = {};
  const pinProtectedIds: string[] = [];
  const requiredNodeIds: Record<string, string> = {};
  const usedInteractiveTypes = new Set<string>();

  let interactiveCursor = 0;
  let decoratorCursor = 0;

  for (let slot = 0; slot < count; slot++) {
    const index = slotOrder[slot]!;
    const cellX = index % cells;
    const cellZ = Math.floor(index / cells) % cells;
    const coords = {
      x: jitter(rand, cellX, cells),
      y: 0,
      z: jitter(rand, cellZ, cells),
    };
    const rotationY = Number((rand() * Math.PI * 2).toFixed(4));
    const scale = Number((0.8 + rand() * 0.5).toFixed(3));

    const placeInteractive = interactiveCursor < interactiveCount;
    // Interleave: first interactiveCount slots in shuffled order get gadgets.
    if (placeInteractive && slot < interactiveCount) {
      const entry = interactiveEntries[interactiveCursor]!;
      const requires_pin = pinFlags[interactiveCursor]!;
      interactiveCursor++;

      if (usedInteractiveTypes.has(entry.type)) {
        throw new Error(`Duplicate interactive type: ${entry.type}`);
      }
      usedInteractiveTypes.add(entry.type);

      const id = `node-${entry.type}-${seed.slice(0, 6)}-${String(index).padStart(3, "0")}`;
      const accessLevel: WorldObjectAccess = requires_pin
        ? entry.accessLevel === "Public"
          ? "Admin"
          : entry.accessLevel
        : entry.accessLevel;

      const node: SpatialRegistryNode = {
        id,
        index,
        type: entry.type,
        title: entry.title,
        category: "interactive",
        requires_pin,
        accessLevel,
        coordinates: coords,
        rotationY,
        scale,
        interactive: true,
        payload: {
          action: entry.action,
          endpoint: entry.endpoint,
          keyboard: {
            code: entry.keyboardCode,
            label: entry.keyboardLabel,
            hold: false,
          },
          effect: entry.effect,
          data: {
            ...entry.buildData(rand, index),
            requires_pin,
          },
        },
        telemetry: {
          cpuLoad: metric(rand, 0.05, 0.95, 3),
          latencyMs: metric(rand, 1, 120),
          status: requires_pin ? "locked" : "online",
        },
      };

      objects[index] = node;
      typeCounts[entry.type] = (typeCounts[entry.type] ?? 0) + 1;
      if (requires_pin) pinProtectedIds.push(id);
      if (
        (REQUIRED_INTERACTIVE_TYPES as readonly string[]).includes(entry.type)
      ) {
        requiredNodeIds[entry.type] = id;
      }
    } else {
      const kind = DECORATOR_KINDS[decoratorCursor % DECORATOR_KINDS.length]!;
      decoratorCursor++;
      const titles = DECORATOR_TITLES[kind];
      const title = titles[Math.floor(rand() * titles.length)]!;
      const id = `deco-${kind}-${seed.slice(0, 6)}-${String(index).padStart(3, "0")}`;

      const node: SpatialRegistryNode = {
        id,
        index,
        type: kind,
        title,
        category: "decorator",
        requires_pin: false,
        accessLevel: "Public",
        coordinates: coords,
        rotationY,
        scale: Number((0.6 + rand() * 0.9).toFixed(3)),
        interactive: false,
        payload: null,
        telemetry: {
          cpuLoad: 0,
          latencyMs: 0,
          status: "decorative",
        },
      };

      objects[index] = node;
      typeCounts[kind] = (typeCounts[kind] ?? 0) + 1;
    }
  }

  // Compact any holes (shouldn't exist).
  const compact = objects.filter(Boolean);
  if (compact.length !== count) {
    throw new Error(`Registry size mismatch: ${compact.length} !== ${count}`);
  }

  const interactiveNodes = compact.filter((n) => n.category === "interactive");
  const interactiveTypeSet = new Set(interactiveNodes.map((n) => n.type));
  const duplicatedInteractiveTypes =
    interactiveNodes.length - interactiveTypeSet.size;

  if (duplicatedInteractiveTypes !== 0) {
    throw new Error(
      `Interactive type duplication detected: ${duplicatedInteractiveTypes}`
    );
  }

  return {
    seed,
    gridSize: GRID_SIZE,
    count: compact.length,
    generatedAt: nowIso,
    ratios: {
      interactive: INTERACTIVE_RATIO,
      decorator: DECORATOR_RATIO,
      pinOfInteractive: PIN_RATIO_OF_INTERACTIVE,
    },
    stats: {
      interactiveCount: interactiveNodes.length,
      decoratorCount: compact.length - interactiveNodes.length,
      pinProtectedCount: pinProtectedIds.length,
      uniqueInteractiveTypes: interactiveTypeSet.size,
      duplicatedInteractiveTypes,
      interactionRate: Number(
        (interactiveNodes.length / compact.length).toFixed(4)
      ),
    },
    typeCounts,
    objects: compact,
    pinProtectedIds,
    requiredNodeIds,
  };
}

export function findWorldObject(
  matrix: WorldObjectsMatrix,
  objectId: string
): SpatialRegistryNode | null {
  return matrix.objects.find((n) => n.id === objectId) ?? null;
}

export function findWorldObjectByType(
  matrix: WorldObjectsMatrix,
  type: string
): SpatialRegistryNode | null {
  return matrix.objects.find((n) => n.type === type) ?? null;
}
