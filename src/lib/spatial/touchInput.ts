/**
 * Shared mobile touch / virtual-pad state for SpatialUniverse RobotAvatar.
 * Written by HUD overlays; read each frame by the avatar controller.
 */

export type SpatialTouchAxes = {
  forward: number;
  strafe: number;
  lookYaw: number;
  lookPitch: number;
};

const axes: SpatialTouchAxes = {
  forward: 0,
  strafe: 0,
  lookYaw: 0,
  lookPitch: 0,
};

/** Mutable focus target — avatar smoothly yaws camera toward this point. */
export type SpatialCameraFocus = {
  x: number;
  y: number;
  z: number;
  /** Consume after applied so we don't keep re-targeting. */
  pending: boolean;
};

const cameraFocus: SpatialCameraFocus = {
  x: 0,
  y: 0,
  z: 0,
  pending: false,
};

export function getTouchAxes(): SpatialTouchAxes {
  return axes;
}

export function setTouchMove(forward: number, strafe: number) {
  axes.forward = Math.max(-1, Math.min(1, forward));
  axes.strafe = Math.max(-1, Math.min(1, strafe));
}

export function clearTouchMove() {
  axes.forward = 0;
  axes.strafe = 0;
}

/** Queue look delta (radians); consumed once per frame by avatar. */
export function addTouchLook(yawDelta: number, pitchDelta: number) {
  axes.lookYaw += yawDelta;
  axes.lookPitch += pitchDelta;
}

export function consumeTouchLook(): { yaw: number; pitch: number } {
  const yaw = axes.lookYaw;
  const pitch = axes.lookPitch;
  axes.lookYaw = 0;
  axes.lookPitch = 0;
  return { yaw, pitch };
}

export function requestCameraFocus(x: number, y: number, z: number) {
  cameraFocus.x = x;
  cameraFocus.y = y;
  cameraFocus.z = z;
  cameraFocus.pending = true;
}

export function consumeCameraFocus(): SpatialCameraFocus | null {
  if (!cameraFocus.pending) return null;
  cameraFocus.pending = false;
  return { ...cameraFocus, pending: false };
}
