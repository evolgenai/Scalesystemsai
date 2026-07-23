/**
 * Spatial Universe domain barrel — procedural world, PIN, vehicle, telemetry.
 */

export {
  GRID_SIZE,
  DEFAULT_NODE_COUNT,
  MIN_NODE_COUNT,
  MAX_NODE_COUNT,
  DEFAULT_WORLD_SEED,
  SpatialAccessLevelSchema,
  SpatialObjectTypeSchema,
  SPECIAL_NODE_TYPES,
  NodeTelemetrySchema,
  ProceduralNodeSchema,
  ProceduralWorldMetaSchema,
  ProceduralWorldSchema,
  mulberry32,
  hashSeed,
  generateProceduralWorld,
  findProceduralNode,
  type SpatialAccessLevel,
  type SpatialObjectType,
  type SpecialNodeType,
  type NodeTelemetry,
  type ProceduralNode,
  type ProceduralWorldMeta,
  type ProceduralWorld,
  type GenerateProceduralWorldOptions,
} from "@/lib/spatial/proceduralWorld";

export {
  DEFAULT_ADMIN_PIN,
  DEFAULT_SUPERADMIN_PIN,
  authStateFromProfile,
  verifyPin,
  verifySuperadminPin,
  requiredLaneForAccess,
  canBypassPin,
  authenticateWorkstationAccess,
  getPinUnlock,
  grantPinUnlock,
  revokePinUnlock,
  resolveConfiguredPin,
  type PinLane,
  type PinAuthState,
  type PinVerifyResult,
} from "@/lib/spatial/workstationPin";

export {
  WorldObjectClassSchema,
  WorldObjectAccessSchema,
  WorldObjectSchema,
  WorldObjectsMatrixSchema,
  SpatialRegistryNodeSchema,
  InteractivePayloadSchema,
  REQUIRED_INTERACTIVE_TYPES,
  UNIQUE_INTERACTIVE_CATALOG,
  INTERACTIVE_RATIO,
  DECORATOR_RATIO,
  PIN_RATIO_OF_INTERACTIVE,
  generateWorldObjectsMatrix,
  findWorldObject,
  findWorldObjectByType,
  type WorldObjectClass,
  type WorldObjectAccess,
  type WorldObject,
  type WorldObjectsMatrix,
  type SpatialRegistryNode,
  type InteractivePayload,
  type GenerateWorldObjectsOptions,
  type RequiredInteractiveType,
} from "@/lib/spatial/worldObjects";

export { BIO_METALLIC_TOKENS, type BioMetallicTokens } from "@/lib/spatial/bioMetallicTokens";

export {
  generateTorMask,
  getTorMaskSession,
  type TorMaskResult,
} from "@/lib/spatial/torMask";

export {
  fetchSanitizedSentryErrors,
  sanitizeTelemetryText,
  resolveSentryApiConfig,
  type SanitizedSentryIssue,
  type SentryLiveTelemetry,
} from "@/lib/spatial/sentryLiveLogs";

export {
  VEHICLE_DRIVE_SPEED_MULTIPLIER,
  VEHICLE_WALK_SPEED_MULTIPLIER,
  AvatarModeSchema,
  VehicleStateSchema,
  getVehicleState,
  mountVehicle,
  dismountVehicle,
  tickVehicleMovement,
  listVehicleTelemetryLogs,
  speedMultiplierForMode,
  vehicleSpeedStatus,
  type AvatarMode,
  type VehicleState,
  type VehicleTelemetryLog,
} from "@/lib/spatial/vehicleState";

export {
  applySpatialSentryTags,
  captureSpatialInteraction,
  withSpatialTelemetry,
  captureSpatialError,
  SENTRY_TAG_SPATIAL_OBJECT,
  SENTRY_TAG_SPATIAL_ACCESS,
  SENTRY_TAG_SPATIAL_AUTH,
  SENTRY_TAG_SPATIAL_SPEED,
  SENTRY_TAG_SPATIAL_COORDS,
  type SpatialInteractionTags,
  type SpatialTelemetryContext,
} from "@/lib/spatial/spatialTelemetry";
