// Sunset Palms is generated, not authored: a deterministic grid of blocks between asphalt
// roads, a downtown plaza, two parks, a beach and the ocean. Everything here is data plus a
// few collision queries — no drawing. createCity(seed) always returns the same city for a seed,
// so the screenshot scenes and the minimap stay stable.

import { CITY, COLOURS } from './config.js';
import { chance, int, makeRandom, pick, range } from './random.js';

const PITCH = CITY.blockSize + CITY.roadWidth;
const CELL = 240;

const WALLS = [
  COLOURS.wallCream,
  COLOURS.wallSand,
  COLOURS.wallCoral,
  COLOURS.wallRose,
  COLOURS.wallTeal,
  COLOURS.wallWhite,
  COLOURS.wallOchre,
];
const ROOFS = [
  COLOURS.roofTerracotta,
  COLOURS.roofGrey,
  COLOURS.roofTeal,
  COLOURS.roofCoral,
  COLOURS.roofSand,
];
const CAR_COLOURS = ['#e8d8ba', '#bd5a4a', '#557c8b', '#d8a443', '#6c707b', '#a44f60', '#4f7f6f', '#eee7d8', '#8a5a45'];
const UMBRELLA_COLOURS = ['#e07a5f', '#5fa8a0', '#f0b45c', '#c86b7a'];
const AWNING_COLOURS = ['#d95f4c', '#4f9d96', '#e0a23e', '#b85f76', '#6d8f57'];

function rect(x, y, w, h) {
  return { x, y, w, h };
}

/** The visible sand-to-water boundary: a gentle two-wave curve along the coast. */
function shoreAt(x, gridHeight, beachDepth) {
  return gridHeight + beachDepth + Math.sin(x * 0.0023) * 16 + Math.sin(x * 0.0091 + 1.7) * 7;
}

function circleHitsRect(x, y, r, s) {
  const nearestX = x < s.x ? s.x : x > s.x + s.w ? s.x + s.w : x;
  const nearestY = y < s.y ? s.y : y > s.y + s.h ? s.y + s.h : y;
  const dx = x - nearestX;
  const dy = y - nearestY;
  return dx * dx + dy * dy < r * r;
}

function cellKey(cx, cy) {
  return cy * 512 + cx;
}

function addSolid(city, solid) {
  city.solids.push(solid);
}

function splitPair(random, r, vertical) {
  const gap = 11 + random() * 14;
  const t = 0.4 + random() * 0.2;
  if (vertical) {
    const w = (r.w - gap) * t;
    return [rect(r.x, r.y, w, r.h), rect(r.x + w + gap, r.y, r.w - w - gap, r.h)];
  }
  const h = (r.h - gap) * t;
  return [rect(r.x, r.y, r.w, h), rect(r.x, r.y + h + gap, r.w, r.h - h - gap)];
}

function splitQuad(random, r) {
  const halves = splitPair(random, r, random() < 0.5);
  const out = [];
  for (const half of halves) out.push(...splitPair(random, half, random() < 0.5));
  return out;
}

function splitRow(random, r, count) {
  const vertical = r.w >= r.h;
  const gap = 10 + random() * 10;
  const total = vertical ? r.w : r.h;
  const slice = (total - gap * (count - 1)) / count;
  const out = [];
  for (let i = 0; i < count; i += 1) {
    if (vertical) out.push(rect(r.x + i * (slice + gap), r.y, slice, r.h));
    else out.push(rect(r.x, r.y + i * (slice + gap), r.w, slice));
  }
  return out;
}

function makeDetails(random, b, floors) {
  const details = [];
  const target = Math.max(5, Math.min(16, Math.floor((b.w * b.h) / 3400)));
  const weighted = ['ac', 'ac', 'ac', 'vent', 'vent', 'stair', 'solar', 'solar', 'garden', 'tank', 'pool'];
  if (floors >= 9 && b.w > 108 && b.h > 108) weighted.push('helipad');
  for (let attempt = 0; attempt < target * 6 && details.length < target; attempt += 1) {
    const maxW = Math.min(42, b.w * 0.34);
    const maxH = Math.min(34, b.h * 0.32);
    const w = 11 + random() * Math.max(6, maxW - 11);
    const h = 9 + random() * Math.max(6, maxH - 9);
    if (b.w < w + 24 || b.h < h + 24) continue;
    const x = b.x + 10 + random() * (b.w - 20 - w);
    const y = b.y + 10 + random() * (b.h - 20 - h);
    let overlaps = false;
    for (let i = 0; i < details.length; i += 1) {
      const d = details[i];
      if (x < d.x + d.w + 5 && x + w + 5 > d.x && y < d.y + d.h + 5 && y + h + 5 > d.y) {
        overlaps = true;
        break;
      }
    }
    if (overlaps) continue;
    let type = pick(random, weighted);
    if (type === 'pool' && (b.w < 94 || b.h < 94)) type = 'garden';
    if (type === 'helipad' && (w < 34 || h < 34)) type = 'stair';
    details.push({ type, x, y, w, h });
  }
  return details;
}

function addBuilding(city, random, part) {
  const margin = 3 + random() * 6;
  const x = part.x + margin;
  const y = part.y + margin;
  const w = part.w - margin * 2;
  const h = part.h - margin * 2;
  if (w < 34 || h < 34) return;

  const dx = (x + w / 2 - city.gridWidth / 2) / (city.gridWidth / 2);
  const dy = (y + h / 2 - city.gridHeight / 2) / (city.gridHeight / 2);
  const downtown = Math.max(0, 1 - Math.hypot(dx, dy) * 1.15);
  let floors = CITY.minFloors + Math.floor(Math.pow(random(), 1.65) * (CITY.maxFloors - CITY.minFloors + 1));
  floors = Math.min(CITY.maxFloors, floors + Math.round(downtown * 4));

  const glass = floors >= 9 && chance(random, 0.38);
  const wall = glass ? COLOURS.wallTeal : pick(random, WALLS);
  const roof = glass ? COLOURS.glass : pick(random, ROOFS);
  const trim = glass ? COLOURS.glassDark : COLOURS.roofGrey;
  const building = {
    x,
    y,
    w,
    h,
    floors,
    wall,
    roof,
    trim,
    glass,
    roofStyle: glass ? 'glass' : chance(random, 0.62) ? 'tile' : 'concrete',
    tier: floors >= 6 && w > 100 && h > 100 && chance(random, 0.52) ? 12 + random() * 14 : 0,
    awning: floors <= 6 && w > 58 && chance(random, 0.55) ? pick(random, AWNING_COLOURS) : null,
    details: makeDetails(random, { x, y, w, h }, floors),
    shadowX: 9 + floors * 4.4,
    shadowY: 4 + floors * 2.0,
  };
  city.buildings.push(building);
  addSolid(city, rect(x, y, w, h));
}

function generateBuildings(city, block, random) {
  if (block.kind === 'park' || block.kind === 'plaza') return;
  const inset = CITY.sidewalk + 8;
  const lot = rect(block.x + inset, block.y + inset, block.w - inset * 2, block.h - inset * 2);

  if (block.kind === 'lot') {
    block.lotRect = lot;
    return;
  }

  const roll = random();
  let parts;
  if (roll < 0.08) parts = [lot];
  else if (roll < 0.38) parts = splitPair(random, lot, random() < 0.5);
  else if (roll < 0.8) parts = splitQuad(random, lot);
  else parts = splitRow(random, lot, 3);

  for (let i = 0; i < parts.length; i += 1) {
    if (i > 0 && !chance(random, CITY.buildingDensity)) continue;
    addBuilding(city, random, parts[i]);
  }
}

function addLamp(city, x, y) {
  city.props.push({ type: 'lamp', x, y, size: 7, angle: 0 });
}

function addPalm(city, random, x, y, size) {
  city.props.push({
    type: 'palm',
    x,
    y,
    size: size ?? range(random, 15, 25),
    lean: range(random, 0, Math.PI * 2),
  });
}

function addTree(city, random, x, y, size) {
  city.props.push({ type: 'tree', x, y, size: size ?? range(random, 15, 24) });
}

function addBench(city, x, y, angle) {
  city.props.push({ type: 'bench', x, y, angle: angle ?? 0, size: 12 });
}

function addPlanter(city, random, x, y, size) {
  city.props.push({ type: 'planter', x, y, size: size ?? range(random, 13, 18) });
}

function addCafe(city, x, y, colour) {
  city.props.push({ type: 'cafe', x, y, size: 15, colour });
}

function addCar(city, random, x, y, angle) {
  const length = 46;
  const width = 22;
  const horizontal = Math.abs(Math.cos(angle)) > 0.5;
  const solid = horizontal ? rect(x - length / 2, y - width / 2, length, width) : rect(x - width / 2, y - length / 2, width, length);
  city.props.push({
    type: 'car',
    x,
    y,
    angle,
    length,
    width,
    colour: pick(random, CAR_COLOURS),
    roof: '#2f343b',
  });
  addSolid(city, { ...solid, kind: 'car' });
}

function addCarIfClear(city, random, x, y, angle) {
  const length = 46;
  const width = 22;
  const horizontal = Math.abs(Math.cos(angle)) > 0.5;
  const box = horizontal ? rect(x - length / 2, y - width / 2, length, width) : rect(x - width / 2, y - length / 2, width, length);
  for (let i = 0; i < city.solids.length; i += 1) {
    const s = city.solids[i];
    if (box.x < s.x + s.w + 6 && box.x + box.w + 6 > s.x && box.y < s.y + s.h + 6 && box.y + box.h + 6 > s.y) return;
  }
  addCar(city, random, x, y, angle);
}

/** Parked cars placed deliberately around the plaza and the cover street, so the shots read as a city. */
function placeLandmarkCars(city, random) {
  const plaza = city.blocks.find((b) => b.kind === 'plaza');
  if (plaza) {
    addCarIfClear(city, random, plaza.x - 20, plaza.y + 96, Math.PI / 2);
    addCarIfClear(city, random, plaza.x - 20, plaza.y + 188, Math.PI / 2);
    addCarIfClear(city, random, plaza.x - 20, plaza.y + 282, Math.PI / 2);
    addCarIfClear(city, random, plaza.x + plaza.w + 20, plaza.y + 118, Math.PI / 2);
    addCarIfClear(city, random, plaza.x + plaza.w + 20, plaza.y + 226, Math.PI / 2);
    addCarIfClear(city, random, plaza.x + 112, plaza.y - 20, 0);
    addCarIfClear(city, random, plaza.x + 244, plaza.y - 20, 0);
    addCarIfClear(city, random, plaza.x + 158, plaza.y + plaza.h + 20, 0);
  }
  const street = city.blocks.find((b) => b.col === CITY.plazaBlock[0] + 1 && b.row === CITY.plazaBlock[1]);
  if (street) {
    addCarIfClear(city, random, street.x - 20, street.y + 118, Math.PI / 2);
    addCarIfClear(city, random, street.x - 20, street.y + 214, Math.PI / 2);
    addCarIfClear(city, random, street.x - 20, street.y + 310, Math.PI / 2);
    addCarIfClear(city, random, street.x + street.w + 20, street.y + 166, Math.PI / 2);
  }
}

function generateCars(city, block, random) {
  if (block.kind === 'park' || block.kind === 'plaza') return;
  const sides = [];
  // Curb parking in the road lane beside the block, clear of the intersections at each end.
  if (block.x - 18 > 24) sides.push({ x: block.x - 18, y: block.y, angle: Math.PI / 2 });
  if (block.x + block.w + 18 < city.gridWidth - 24) sides.push({ x: block.x + block.w + 18, y: block.y, angle: Math.PI / 2 });
  if (block.y - 18 > 24) sides.push({ x: block.x, y: block.y - 18, angle: 0 });
  if (block.y + block.h + 18 < city.gridHeight - 24) sides.push({ x: block.x, y: block.y + block.h + 18, angle: 0 });

  if (sides.length === 0 || !chance(random, 0.84)) return;
  const side = pick(random, sides);
  const count = int(random, 1, 3);
  for (let i = 0; i < count; i += 1) {
    const along = block.w * (0.22 + (i + 0.5) / (count + 0.6) * 0.56) + range(random, -8, 8);
    if (side.angle === 0) addCar(city, random, side.x + along, side.y, side.angle);
    else addCar(city, random, side.x, side.y + along, side.angle);
  }
}

function generatePark(city, block, random) {
  block.pond = {
    x: block.x + block.w * 0.62,
    y: block.y + block.h * 0.6,
    rx: 64,
    ry: 40,
  };
  addSolid(city, rect(block.pond.x - 44, block.pond.y - 27, 88, 54));
  for (let i = 0; i < 5; i += 1) {
    const x = block.x + range(random, 55, block.w - 55);
    const y = block.y + range(random, 55, block.h - 55);
    addPalm(city, random, x, y, range(random, 18, 27));
  }
  for (let i = 0; i < 13; i += 1) {
    const x = block.x + range(random, 40, block.w - 40);
    const y = block.y + range(random, 40, block.h - 40);
    if (Math.hypot(x - block.pond.x, y - block.pond.y) < 105) continue;
    addTree(city, random, x, y, range(random, 14, 26));
  }
  addBench(city, block.x + block.w * 0.3, block.y + block.h * 0.44, 0);
  addBench(city, block.x + block.w * 0.44, block.y + block.h * 0.72, Math.PI / 2);
  addPalm(city, random, block.x + 46, block.y + block.h - 48, 24);
  addPalm(city, random, block.x + block.w - 48, block.y + 46, 22);
}

function generatePlaza(city, block, random) {
  const cx = block.x + block.w / 2;
  const cy = block.y + block.h / 2;
  city.props.push({ type: 'fountain', x: cx, y: cy, size: 46 });
  addSolid(city, rect(cx - 36, cy - 36, 72, 72));
  for (const [sx, sy] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ]) {
    addPalm(city, random, cx + sx * 128, cy + sy * 122, range(random, 20, 26));
  }
  addBench(city, cx - 88, cy + 74, 0);
  addBench(city, cx + 88, cy + 74, 0);
  addBench(city, cx - 88, cy - 74, Math.PI);
  addBench(city, cx + 88, cy - 74, Math.PI);
  addPlanter(city, random, cx - 74, cy, 17);
  addPlanter(city, random, cx + 74, cy, 17);
  addPlanter(city, random, cx, cy - 74, 17);
  addPlanter(city, random, cx, cy + 74, 17);
  addCafe(city, cx - 126, cy + 26, '#e07a5f');
  addCafe(city, cx + 126, cy + 26, '#5fa8a0');
  addCafe(city, cx - 126, cy - 34, '#f0b45c');
  addCafe(city, cx + 126, cy - 34, '#c86b7a');
}

function generateStreetFurniture(city, random) {
  for (const block of city.blocks) {
    const corners = [
      [block.x + 12, block.y + 12],
      [block.x + block.w - 12, block.y + block.h - 12],
    ];
    for (const [x, y] of corners) addLamp(city, x, y);
    if (chance(random, 0.3)) addPalm(city, random, block.x + 13, block.y + block.h - 13, range(random, 16, 22));
    if (chance(random, 0.42)) addPalm(city, random, block.x + block.w * 0.5, block.y + 9, range(random, 15, 21));
    if (chance(random, 0.42)) addPalm(city, random, block.x + 9, block.y + block.h * 0.5, range(random, 15, 21));
    if (chance(random, 0.5)) addPlanter(city, random, block.x + block.w - 12, block.y + 12, range(random, 10, 14));
    if (chance(random, 0.16)) city.props.push({ type: 'hydrant', x: block.x + block.w - 14, y: block.y + 14, size: 5 });
  }

  // The promenade: lamps, palms and benches looking out over the sand.
  for (let x = 120; x < city.gridWidth - 80; x += 158) {
    addLamp(city, x, city.gridHeight + 16);
    addPalm(city, random, x + 74, city.gridHeight + 17, range(random, 18, 26));
    if (chance(random, 0.35)) addBench(city, x + 30, city.gridHeight + 22, 0);
  }

  // Beach dressing: umbrellas, towels and a couple of lifeguard towers.
  for (let x = 210; x < city.gridWidth - 160; x += 238) {
    const shore = city.shoreY(x);
    const y = range(random, city.gridHeight + 62, shore - 58);
    city.props.push({
      type: 'umbrella',
      x,
      y,
      size: range(random, 20, 27),
      colour: pick(random, UMBRELLA_COLOURS),
      towel: chance(random, 0.7),
      angle: range(random, 0, Math.PI),
    });
  }
  for (const x of [city.gridWidth * 0.22, city.gridWidth * 0.68]) {
    city.props.push({ type: 'lifeguard', x, y: city.gridHeight + 118, size: 20 });
  }

  // A small parking lot block, so the city is not all towers.
  for (const block of city.blocks) {
    if (block.kind !== 'lot') continue;
    const lot = block.lotRect;
    for (let i = 0; i < 5; i += 1) {
      const x = lot.x + 38 + (i % 3) * 96;
      const y = lot.y + 60 + Math.floor(i / 3) * 110;
      addCar(city, random, x, y, Math.PI / 2);
    }
  }
}

function buildSolidHash(city) {
  const hash = new Map();
  for (const solid of city.solids) {
    const cx0 = Math.floor(solid.x / CELL);
    const cx1 = Math.floor((solid.x + solid.w) / CELL);
    const cy0 = Math.floor(solid.y / CELL);
    const cy1 = Math.floor((solid.y + solid.h) / CELL);
    for (let cy = cy0; cy <= cy1; cy += 1) {
      for (let cx = cx0; cx <= cx1; cx += 1) {
        const key = cellKey(cx, cy);
        let bucket = hash.get(key);
        if (bucket === undefined) {
          bucket = [];
          hash.set(key, bucket);
        }
        bucket.push(solid);
      }
    }
  }
  city.solidHash = hash;
}

/** Rebuild the collision index after a caller has removed solids (parked cars becoming vehicles). */
export function rebuildSolidHash(city) {
  buildSolidHash(city);
}

function querySolids(city, x, y, r, out) {
  out.length = 0;
  const cx0 = Math.floor((x - r) / CELL);
  const cx1 = Math.floor((x + r) / CELL);
  const cy0 = Math.floor((y - r) / CELL);
  const cy1 = Math.floor((y + r) / CELL);
  for (let cy = cy0; cy <= cy1; cy += 1) {
    for (let cx = cx0; cx <= cx1; cx += 1) {
      const bucket = city.solidHash.get(cellKey(cx, cy));
      if (bucket === undefined) continue;
      for (let i = 0; i < bucket.length; i += 1) out.push(bucket[i]);
    }
  }
  return out;
}

function pointInSolid(city, x, y) {
  const list = querySolids(city, x, y, 0, city.scratch);
  for (let i = 0; i < list.length; i += 1) {
    const s = list[i];
    if (x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h) return true;
  }
  return false;
}

/** Search outward from a preferred point for a spot the player's circle fits in. */
function findOpenSpot(city, x, y, radius) {
  for (let ring = 0; ring < 34; ring += 1) {
    const steps = ring === 0 ? 1 : 8 + ring * 2;
    for (let i = 0; i < steps; i += 1) {
      const angle = (i / steps) * Math.PI * 2;
      const px = x + Math.cos(angle) * ring * 14;
      const py = y + Math.sin(angle) * ring * 14;
      if (city.isFreeCircle(px, py, radius)) return { x: px, y: py };
    }
  }
  return { x, y };
}

function defineQueries(city) {
  city.isRoad = function isRoad(x, y) {
    if (x < 0 || y < 0 || x >= city.gridWidth || y >= city.gridHeight) return false;
    const mx = x % PITCH;
    const my = y % PITCH;
    return mx < CITY.roadWidth || my < CITY.roadWidth;
  };

  city.isWater = function isWater(x, y) {
    return x >= 0 && x <= city.width && y > city.shoreY(x);
  };

  city.solidsNear = function solidsNear(x, y, r, out) {
    return querySolids(city, x, y, r, out ?? city.scratch);
  };

  city.isWalkable = function isWalkable(x, y) {
    if (x < 0 || y < 0 || x > city.width || y > city.height) return false;
    if (city.isWater(x, y)) return false;
    return !pointInSolid(city, x, y);
  };

  city.isFreeCircle = function isFreeCircle(x, y, radius) {
    if (x - radius < 0 || y - radius < 0 || x + radius > city.width || y + radius > city.height) return false;
    if (y + radius > city.shoreY(x)) return false;
    const list = querySolids(city, x, y, radius, city.scratch);
    for (let i = 0; i < list.length; i += 1) if (circleHitsRect(x, y, radius, list[i])) return false;
    return true;
  };
}

export function createCity(seed) {
  const random = makeRandom(seed);
  const gridWidth = CITY.cols * CITY.blockSize + (CITY.cols + 1) * CITY.roadWidth;
  const gridHeight = CITY.rows * CITY.blockSize + (CITY.rows + 1) * CITY.roadWidth;
  const height = gridHeight + CITY.beachDepth + CITY.oceanDepth;

  const city = {
    seed,
    width: gridWidth,
    height,
    gridWidth,
    gridHeight,
    roadWidth: CITY.roadWidth,
    blockSize: CITY.blockSize,
    cols: CITY.cols,
    rows: CITY.rows,
    roads: [],
    blocks: [],
    buildings: [],
    props: [],
    solids: [],
    scratch: [],
    sparkles: [],
    sandMarks: [],
    spawn: { x: gridWidth / 2, y: gridHeight / 2 },
    spots: {},
  };

  city.shoreY = (x) => shoreAt(x, gridHeight, CITY.beachDepth);

  // Roads: vertical strips and horizontal strips, each spanning the whole grid.
  for (let i = 0; i <= CITY.cols; i += 1) {
    city.roads.push({ x: i * PITCH, y: 0, w: CITY.roadWidth, h: gridHeight, vertical: true });
  }
  for (let j = 0; j <= CITY.rows; j += 1) {
    city.roads.push({ x: 0, y: j * PITCH, w: gridWidth, h: CITY.roadWidth, vertical: false });
  }

  // Blocks: interior squares between the roads, each with a job.
  const parkSet = new Set(CITY.parkBlocks.map(([i, j]) => `${i},${j}`));
  for (let j = 0; j < CITY.rows; j += 1) {
    for (let i = 0; i < CITY.cols; i += 1) {
      const x = CITY.roadWidth + i * PITCH;
      const y = CITY.roadWidth + j * PITCH;
      let kind = 'urban';
      if (parkSet.has(`${i},${j}`)) kind = 'park';
      else if (i === CITY.plazaBlock[0] && j === CITY.plazaBlock[1]) kind = 'plaza';
      else if ((i !== CITY.plazaBlock[0] + 1 || j !== CITY.plazaBlock[1]) && chance(random, 0.045)) kind = 'lot';
      const block = { x, y, w: CITY.blockSize, h: CITY.blockSize, col: i, row: j, kind };
      city.blocks.push(block);
    }
  }

  for (const block of city.blocks) {
    if (block.kind === 'park') generatePark(city, block, random);
    else if (block.kind === 'plaza') generatePlaza(city, block, random);
    else generateBuildings(city, block, random);
  }

  for (const block of city.blocks) generateCars(city, block, random);
  placeLandmarkCars(city, random);
  generateStreetFurniture(city, random);

  // Water sparkles and dry sand flecks are generated once and only drawn when visible.
  for (let i = 0; i < 260; i += 1) {
    const x = random() * gridWidth;
    const shore = city.shoreY(x);
    city.sparkles.push({
      x,
      y: shore + 14 + random() * (height - shore - 20),
      size: 1 + random() * 2.6,
      phase: random() * Math.PI * 2,
    });
  }
  for (let i = 0; i < 140; i += 1) {
    const x = random() * gridWidth;
    const shore = city.shoreY(x);
    const a = 0.08 + random() * 0.1;
    city.sandMarks.push({
      x,
      y: gridHeight + 40 + random() * (shore - gridHeight - 52),
      w: 4 + random() * 11,
      style: `rgba(142, 108, 64, ${a.toFixed(3)})`,
    });
  }

  city.buildings.sort((a, b) => a.y + a.h - (b.y + b.h));
  city.props.sort((a, b) => a.y - b.y);

  buildSolidHash(city);
  defineQueries(city);
  city.blockAABBs = city.buildings.map((b) => rect(b.x, b.y, b.w, b.h));

  // Landmarks the screenshots and the opening camera use.
  const plaza = city.blocks.find((b) => b.kind === 'plaza') ?? city.blocks[Math.floor(city.blocks.length / 2)];
  const park = city.blocks.find((b) => b.kind === 'park') ?? city.blocks[0];
  const street = city.blocks.find((b) => b.col === CITY.plazaBlock[0] + 1 && b.row === CITY.plazaBlock[1]) ?? plaza;

  const downtownPreferred = { x: plaza.x + plaza.w / 2, y: plaza.y + plaza.h / 2 + 112 };
  const streetPreferred = { x: street.x + 13, y: street.y + street.h * 0.48 };
  const parkPreferred = { x: park.x + park.w * 0.38, y: park.y + park.h * 0.46 };
  const beachPreferred = { x: gridWidth * 0.55, y: gridHeight + CITY.beachDepth * 0.56 };

  const downtown = findOpenSpot(city, downtownPreferred.x, downtownPreferred.y, 12);
  const streetSpot = findOpenSpot(city, streetPreferred.x, streetPreferred.y, 12);
  const parkSpot = findOpenSpot(city, parkPreferred.x, parkPreferred.y, 12);
  const beachSpot = findOpenSpot(city, beachPreferred.x, beachPreferred.y, 12);

  city.spots = {
    downtown: { x: downtown.x, y: downtown.y, angle: -Math.PI / 2, zoom: 1.0 },
    street: { x: streetSpot.x, y: streetSpot.y, angle: 0.12, zoom: 1.04 },
    park: { x: parkSpot.x, y: parkSpot.y, angle: 0.3, zoom: 1.0 },
    beach: { x: beachSpot.x, y: beachSpot.y, angle: -1.2, zoom: 1.0 },
  };
  city.spawn = { x: downtown.x, y: downtown.y };

  return city;
}

/** Standalone collision queries, for callers that do not want the city methods. */
export function isRoad(city, x, y) {
  return city.isRoad(x, y);
}

export function isWalkable(city, x, y) {
  return city.isWalkable(x, y);
}

/** The AABBs of every building footprint: the list the player cannot walk through. */
export function blockAABBs(city) {
  return city.blockAABBs;
}
