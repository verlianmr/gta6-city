// Smooth follow camera in world pixels: it trails the player, leads slightly along travel and
// clamps to the city bounds. Exports createCamera, setCameraView, clampCamera, updateCamera,
// snapCamera, zoomCamera and screenToWorld; `zoom` is world pixels per logical pixel.

import { TUNING, VIEW } from './config.js';

export function createCamera(city) {
  return {
    x: city.width / 2,
    y: city.height / 2,
    zoom: 1,
    viewWidth: VIEW.width,
    viewHeight: VIEW.height,
    bounds: { width: city.width, height: city.height },
  };
}

/** The logical frame the camera covers; main.js calls this on boot and on resize. */
export function setCameraView(camera, width, height) {
  camera.viewWidth = width;
  camera.viewHeight = height;
}

/** Keep the visible rectangle inside the city, centring an axis the city is too small to fill. */
export function clampCamera(camera) {
  const halfWidth = camera.viewWidth / (2 * camera.zoom);
  const halfHeight = camera.viewHeight / (2 * camera.zoom);
  const maxX = camera.bounds.width - halfWidth;
  const maxY = camera.bounds.height - halfHeight;
  camera.x = maxX < halfWidth ? camera.bounds.width / 2 : Math.min(maxX, Math.max(halfWidth, camera.x));
  camera.y = maxY < halfHeight ? camera.bounds.height / 2 : Math.min(maxY, Math.max(halfHeight, camera.y));
  return camera;
}

/** Ease toward the target; frame-rate independent, so a slow frame still feels smooth. */
export function updateCamera(camera, target, dt) {
  const k = 1 - Math.exp(-TUNING.camera.follow * dt);
  camera.x += (target.x - camera.x) * k;
  camera.y += (target.y - camera.y) * k;
  return clampCamera(camera);
}

/** Put the camera exactly on the target, for boot and for deterministic screenshot frames. */
export function snapCamera(camera, target) {
  camera.x = target.x;
  camera.y = target.y;
  return clampCamera(camera);
}

/** Wheel zoom, clamped to the playable range. */
export function zoomCamera(camera, wheelDelta) {
  camera.zoom = Math.min(
    TUNING.camera.maxZoom,
    Math.max(TUNING.camera.minZoom, camera.zoom - wheelDelta * TUNING.camera.wheelStep),
  );
  return clampCamera(camera);
}

/** Normalised canvas coordinates (0..1) to world coordinates. */
export function screenToWorld(camera, nx, ny) {
  return {
    x: camera.x + (nx * VIEW.width - VIEW.width / 2) / camera.zoom,
    y: camera.y + (ny * VIEW.height - VIEW.height / 2) / camera.zoom,
  };
}
