// Lane arithmetic for the road grid, shared by traffic, police and the screenshot staging so
// every car sits in the same believable lane. Exports the grid constants PITCH, ROAD, HALF,
// COLS, ROWS and DIRS plus lanePoint, nextNode, onGrid, nearestNode, angleDelta,
// randomRoadPoint and nearestLanePoint. No state, no drawing.

import { CITY } from './config.js';

/** One block plus one road: the pitch of the grid. */
export const PITCH = CITY.blockSize + CITY.roadWidth;
export const ROAD = CITY.roadWidth;
export const HALF = ROAD / 2;
export const COLS = CITY.cols;
export const ROWS = CITY.rows;

/** 0 east, 1 south, 2 west, 3 north: clockwise on screen, the right-hand-traffic order. */
export const DIRS = [
  { dx: 1, dy: 0, angle: 0 },
  { dx: 0, dy: 1, angle: Math.PI / 2 },
  { dx: -1, dy: 0, angle: Math.PI },
  { dx: 0, dy: -1, angle: -Math.PI / 2 },
];

/** The point where a car travelling in `dir` crosses the middle of intersection (i, j). */
export function lanePoint(i, j, dir) {
  const x = i * PITCH;
  const y = j * PITCH;
  if (dir === 0) return { x: x + HALF, y: y + ROAD * 0.75 };
  if (dir === 1) return { x: x + ROAD * 0.25, y: y + HALF };
  if (dir === 2) return { x: x + HALF, y: y + ROAD * 0.25 };
  return { x: x + ROAD * 0.75, y: y + HALF };
}

/** The intersection one step along `dir` from (i, j). */
export function nextNode(i, j, dir) {
  return { i: i + DIRS[dir].dx, j: j + DIRS[dir].dy };
}

/** Whether an intersection index is on the grid. */
export function onGrid(i, j) {
  return i >= 0 && j >= 0 && i <= COLS && j <= ROWS;
}

/** The nearest intersection index pair to a world point. */
export function nearestNode(x, y) {
  return {
    i: Math.max(0, Math.min(COLS, Math.round(x / PITCH))),
    j: Math.max(0, Math.min(ROWS, Math.round(y / PITCH))),
  };
}

/** Shortest signed angle from `from` to `to`, in (-PI, PI]. */
export function angleDelta(to, from) {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/**
 * A lane point in the ring between minDist and maxDist from (cx, cy), or null when 48 tries find
 * none. Deterministic for a given random function: used for spawning traffic and police.
 */
export function randomRoadPoint(random, cx, cy, minDist, maxDist) {
  for (let attempt = 0; attempt < 48; attempt += 1) {
    const i = Math.floor(random() * (COLS + 1));
    const j = Math.floor(random() * (ROWS + 1));
    const dir = Math.floor(random() * 4);
    const p = lanePoint(i, j, dir);
    const d = Math.hypot(p.x - cx, p.y - cy);
    if (d >= minDist && d <= maxDist) return { x: p.x, y: p.y, i, j, dir };
  }
  return null;
}

/** The lane point nearest a world point, for parking the camera or a shot car. */
export function nearestLanePoint(x, y) {
  const { i, j } = nearestNode(x, y);
  let best = null;
  let bestDist = Infinity;
  for (let dir = 0; dir < 4; dir += 1) {
    const p = lanePoint(i, j, dir);
    const d = Math.hypot(p.x - x, p.y - y);
    if (d < bestDist) {
      bestDist = d;
      best = { ...p, i, j, dir };
    }
  }
  return best;
}
