// Ambient life: lane-following AI traffic that steers to the next intersection and brakes for
// what is ahead, plus sidewalk pedestrians who cross, flee gunfire and get run over. Exports
// spawnTraffic, updateTraffic, placeTrafficCar, spawnPeds, placePed, updatePeds, runOverPeds,
// clearAmbient and spawnAmbient; both populations recycle around the player.

import { COLOURS, TUNING } from './config.js';
import { DIRS, PITCH, angleDelta, lanePoint, nextNode, onGrid, randomRoadPoint } from './roads.js';
import { chance, int, pick, range } from './random.js';
import { carFits, carHitsPoint, createVehicle, randomAiKind, randomBodyColour, removeVehicle } from './vehicles.js';
import { raiseWanted } from './police.js';
import { addBlood } from './combat.js';

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

function turnToward(from, to, k) {
  return from + angleDelta(to, from) * k;
}

function cornerPoint(block, corner) {
  const i = 11;
  if (corner === 0) return { x: block.x + i, y: block.y + i };
  if (corner === 1) return { x: block.x + block.w - i, y: block.y + i };
  if (corner === 2) return { x: block.x + block.w - i, y: block.y + block.h - i };
  return { x: block.x + i, y: block.y + block.h - i };
}

function nextCorner(corner, dir) {
  return (corner + dir + 4) % 4;
}

function blockAt(city, col, row) {
  for (const block of city.blocks) if (block.col === col && block.row === row) return block;
  return null;
}

/** Where a pedestrian crossing one road from this corner lands, or null when it is the wrong edge. */
function crossingTarget(city, block, corner, dx, dy) {
  const target = blockAt(city, block.col + dx, block.row + dy);
  if (target === null) return null;
  if (dy === -1) {
    if (corner === 0) return { block: target, corner: 3 };
    if (corner === 1) return { block: target, corner: 2 };
    return null;
  }
  if (dy === 1) {
    if (corner === 3) return { block: target, corner: 0 };
    if (corner === 2) return { block: target, corner: 1 };
    return null;
  }
  if (dx === -1) {
    if (corner === 0) return { block: target, corner: 1 };
    if (corner === 3) return { block: target, corner: 2 };
    return null;
  }
  if (corner === 1) return { block: target, corner: 0 };
  if (corner === 2) return { block: target, corner: 3 };
  return null;
}

function makePed(world, block, corner, x, y) {
  const ped = {
    x,
    y,
    angle: world.random() * Math.PI * 2,
    targetX: 0,
    targetY: 0,
    speed: 0,
    walk: 0,
    hp: 40,
    alive: true,
    panic: 0,
    threatX: 0,
    threatY: 0,
    shirt: pick(world.random, COLOURS.pedShirts),
    pants: pick(world.random, COLOURS.pedPants),
    skin: pick(world.random, COLOURS.pedSkin),
    hair: pick(world.random, ['#33241e', '#1f1a18', '#6b4a2e', '#8a6a44']),
    phase: world.random() * 6.28,
    block,
    corner,
    dir: chance(world.random, 0.5) ? 1 : -1,
    crossing: false,
    crossBlock: null,
    crossCorner: 0,
    deathTimer: 0,
    wobble: world.random() * 6.28,
  };
  const next = cornerPoint(block, nextCorner(corner, ped.dir));
  ped.targetX = next.x;
  ped.targetY = next.y;
  world.peds.push(ped);
  return ped;
}

/** Spawn `count` pedestrians on sidewalks near the player, avoiding the inside of buildings. */
export function spawnPeds(world, count = TUNING.peds.count) {
  const city = world.city;
  const player = world.player;
  let spawned = 0;
  for (let attempt = 0; attempt < count * 14 && spawned < count; attempt += 1) {
    const block = pick(world.random, city.blocks);
    const cx = block.x + block.w / 2;
    const cy = block.y + block.h / 2;
    const d = Math.hypot(cx - player.x, cy - player.y);
    if (d < 170 || d > 1450) continue;
    const corner = int(world.random, 0, 3);
    const p = cornerPoint(block, corner);
    if (!city.isFreeCircle(p.x, p.y, 6)) continue;
    makePed(world, block, corner, p.x, p.y);
    spawned += 1;
  }
}

/** Put one pedestrian at an exact spot, for the shot scenes. */
export function placePed(world, x, y, angle, opts = {}) {
  const ped = {
    x,
    y,
    angle,
    targetX: x + Math.cos(angle) * 120,
    targetY: y + Math.sin(angle) * 120,
    speed: 0,
    walk: 0,
    hp: 40,
    alive: opts.alive ?? true,
    panic: opts.panic ?? 0,
    threatX: opts.threatX ?? 0,
    threatY: opts.threatY ?? 0,
    shirt: opts.shirt ?? pick(world.random, COLOURS.pedShirts),
    pants: opts.pants ?? pick(world.random, COLOURS.pedPants),
    skin: opts.skin ?? pick(world.random, COLOURS.pedSkin),
    hair: opts.hair ?? '#33241e',
    phase: opts.phase ?? world.random() * 6.28,
    block: null,
    corner: 0,
    dir: 1,
    crossing: false,
    crossBlock: null,
    crossCorner: 0,
    deathTimer: opts.deathTimer ?? 0,
    wobble: world.random() * 6.28,
  };
  world.peds.push(ped);
  return ped;
}

/** The nearest car body in front of `car`, within `range`: traffic brakes for it. */
function carAhead(world, car, range) {
  const cos = Math.cos(car.angle);
  const sin = Math.sin(car.angle);
  for (const other of world.vehicles) {
    if (other === car) continue;
    const dx = other.x - car.x;
    const dy = other.y - car.y;
    if (dx * dx + dy * dy > (range + other.length) * (range + other.length)) continue;
    const lx = dx * cos + dy * sin;
    const ly = -dx * sin + dy * cos;
    if (lx > 18 && lx < range && Math.abs(ly) < 34) return other;
  }
  return null;
}

function pedAhead(world, car, range) {
  const cos = Math.cos(car.angle);
  const sin = Math.sin(car.angle);
  for (const ped of world.peds) {
    if (!ped.alive) continue;
    const dx = ped.x - car.x;
    const dy = ped.y - car.y;
    if (dx * dx + dy * dy > range * range) continue;
    const lx = dx * cos + dy * sin;
    const ly = -dx * sin + dy * cos;
    if (lx > 14 && lx < range && Math.abs(ly) < 42) return ped;
  }
  return null;
}

function advanceTraffic(world, car) {
  const ai = car.ai;
  const roll = world.random();
  let dir = ai.dir;
  if (roll < 0.56) dir = ai.dir;
  else if (roll < 0.79) dir = (ai.dir + 1) % 4;
  else if (roll < 0.96) dir = (ai.dir + 3) % 4;
  else dir = (ai.dir + 2) % 4;

  const options = [dir, ai.dir, (ai.dir + 1) % 4, (ai.dir + 3) % 4, (ai.dir + 2) % 4];
  for (const d of options) {
    const node = nextNode(ai.i, ai.j, d);
    if (!onGrid(node.i, node.j)) continue;
    ai.dir = d;
    ai.i = node.i;
    ai.j = node.j;
    const p = lanePoint(node.i, node.j, d);
    ai.tx = p.x;
    ai.ty = p.y;
    return;
  }
  ai.dir = (ai.dir + 2) % 4;
}

function controlTraffic(world, car, dt) {
  const ai = car.ai;
  if (ai.stun > 0) {
    ai.stun -= dt;
    car.throttle = 0;
    car.steer = 0;
    car.handbrake = false;
    return;
  }
  const dx = ai.tx - car.x;
  const dy = ai.ty - car.y;
  const dist = Math.hypot(dx, dy);
  const diff = angleDelta(Math.atan2(dy, dx), car.angle);
  car.steer = clamp(diff * 1.9, -1, 1);

  let target = ai.cruise;
  if (Math.abs(diff) > 0.85) target = 90;
  else if (Math.abs(diff) > 0.4) target = 150;
  if (pedAhead(world, car, 86) !== null) target = 0;
  else if (carAhead(world, car, 92) !== null) target = 0;
  car.throttle = clamp((target - car.speed) / 70, -1, 1);
  car.handbrake = false;

  if (dist < 52) advanceTraffic(world, car);

  if (Math.abs(car.speed) < 14) ai.stuck += dt;
  else ai.stuck = 0;
  if (ai.stuck > 3.2) {
    ai.stuck = 0;
    respawnTraffic(world, car);
  }
}

function respawnTraffic(world, car) {
  const spot = randomRoadPoint(world.random, world.player.x, world.player.y, 500, TUNING.traffic.spawnRadius);
  if (spot === null) return;
  const back = 40 + world.random() * 180;
  const x = spot.x - DIRS[spot.dir].dx * back;
  const y = spot.y - DIRS[spot.dir].dy * back;
  const angle = DIRS[spot.dir].angle;
  if (!carFits(world.city, x, y, angle, car.length, car.width)) return;
  car.x = x;
  car.y = y;
  car.angle = angle;
  car.vx = Math.cos(angle) * 180;
  car.vy = Math.sin(angle) * 180;
  car.speed = 180;
  car.ai = { i: spot.i, j: spot.j, dir: spot.dir, tx: spot.x, ty: spot.y, cruise: range(world.random, TUNING.traffic.cruiseMin, TUNING.traffic.cruiseMax), stuck: 0, stun: 0 };
}

/** Spawn `count` traffic cars on lanes around the player. */
export function spawnTraffic(world, count = TUNING.traffic.cars) {
  const city = world.city;
  const player = world.player;
  let spawned = 0;
  for (let attempt = 0; attempt < count * 18 && spawned < count; attempt += 1) {
    const spot = randomRoadPoint(world.random, player.x, player.y, 280, TUNING.traffic.spawnRadius);
    if (spot === null) continue;
    const back = 40 + world.random() * 220;
    const x = spot.x - DIRS[spot.dir].dx * back;
    const y = spot.y - DIRS[spot.dir].dy * back;
    const angle = DIRS[spot.dir].angle;
    const kind = randomAiKind(world.random);
    const type = { sedan: 46, sports: 48, van: 54, taxi: 46 }[kind] ?? 46;
    const width = kind === 'van' ? 24 : kind === 'sports' ? 20 : 22;
    if (!carFits(city, x, y, angle, type, width)) continue;
    if (Math.hypot(x - player.x, y - player.y) < 150) continue;
    let clear = true;
    for (const other of world.vehicles) {
      if (Math.hypot(other.x - x, other.y - y) < 68) {
        clear = false;
        break;
      }
    }
    if (!clear) continue;
    const cruise = range(world.random, TUNING.traffic.cruiseMin, TUNING.traffic.cruiseMax);
    const car = createVehicle(world, {
      kind,
      x,
      y,
      angle,
      vx: Math.cos(angle) * cruise,
      vy: Math.sin(angle) * cruise,
      driver: 'ai',
      colour: randomBodyColour(world.random),
    });
    car.ai = { i: spot.i, j: spot.j, dir: spot.dir, tx: spot.x, ty: spot.y, cruise, stuck: 0, stun: 0 };
    spawned += 1;
  }
}

/** One frame of traffic: control, integrate, then recycle cars the player has left behind. */
export function updateTraffic(world, dt) {
  const player = world.player;
  for (let i = world.vehicles.length - 1; i >= 0; i -= 1) {
    const car = world.vehicles[i];
    if (car.driver !== 'ai' || car.ai === null) continue;
    controlTraffic(world, car, dt);
    const d = Math.hypot(car.x - player.x, car.y - player.y);
    if (d > TUNING.traffic.despawnRadius || car.dead) removeVehicle(world, car);
  }

  world.trafficTimer -= dt;
  if (world.trafficTimer > 0) return;
  world.trafficTimer = 0.55;
  let live = 0;
  for (const car of world.vehicles) if (car.driver === 'ai') live += 1;
  if (live < TUNING.traffic.cars) spawnTraffic(world, Math.min(3, TUNING.traffic.cars - live));
}

/** Cars at speed kill pedestrians; the player pays for it with stars. */
export function runOverPeds(world) {
  for (const car of world.vehicles) {
    if (car.parked || Math.abs(car.speed) < 70) continue;
    for (const ped of world.peds) {
      if (!ped.alive) continue;
      if (!carHitsPoint(car, ped.x, ped.y, 2)) continue;
      ped.alive = false;
      ped.deathTimer = 0;
      ped.hp = 0;
      ped.panic = 0;
      addBlood(world, ped.x, ped.y, 11);
      car.vx *= 0.9;
      car.vy *= 0.9;
      car.speed *= 0.9;
      world.audio?.crash(0.7);
      if (car.driver === 'player') {
        world.stats.kills += 1;
        raiseWanted(world, 1, car.x, car.y);
      }
      break;
    }
  }
}

function findThreat(world, ped) {
  for (const car of world.vehicles) {
    if (car.parked || Math.abs(car.speed) < 80) continue;
    const dx = car.x - ped.x;
    const dy = car.y - ped.y;
    if (dx * dx + dy * dy < TUNING.peds.panicRange * TUNING.peds.panicRange) {
      return { x: car.x, y: car.y };
    }
  }
  const shot = world.gunPulse;
  if (shot !== null && world.time - shot.time < 0.5) {
    const dx = shot.x - ped.x;
    const dy = shot.y - ped.y;
    if (dx * dx + dy * dy < 540 * 540) return { x: shot.x, y: shot.y };
  }
  return null;
}

function advancePed(world, ped) {
  const city = world.city;
  if (ped.crossing && ped.crossBlock !== null) {
    ped.block = ped.crossBlock;
    ped.corner = ped.crossCorner;
    ped.crossing = false;
    ped.crossBlock = null;
  } else if (ped.block !== null) {
    ped.corner = nextCorner(ped.corner, ped.dir);
    if (chance(world.random, 0.16)) {
      const choices = [];
      for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
        const target = crossingTarget(city, ped.block, ped.corner, dx, dy);
        if (target !== null) choices.push(target);
      }
      if (choices.length > 0) {
        const target = pick(world.random, choices);
        ped.crossBlock = target.block;
        ped.crossCorner = target.corner;
        ped.crossing = true;
        const p = cornerPoint(target.block, target.corner);
        ped.targetX = p.x;
        ped.targetY = p.y;
        return;
      }
    }
  }
  if (ped.block !== null) {
    const p = cornerPoint(ped.block, nextCorner(ped.corner, ped.dir));
    ped.targetX = p.x;
    ped.targetY = p.y;
  }
}

/** One frame of pedestrians: walk, cross, panic, and recycle far-away people. */
export function updatePeds(world, dt) {
  const city = world.city;
  const player = world.player;
  for (const ped of world.peds) {
    if (!ped.alive) {
      ped.deathTimer += dt;
      continue;
    }
    const threat = findThreat(world, ped);
    if (threat !== null) {
      ped.panic = Math.max(ped.panic, 1.6);
      ped.threatX = threat.x;
      ped.threatY = threat.y;
    }
    ped.panic = Math.max(0, ped.panic - dt);

    let desired;
    let top;
    if (ped.panic > 0) {
      desired = Math.atan2(ped.y - ped.threatY, ped.x - ped.threatX) + Math.sin(ped.wobble + world.time * 2.2) * 0.25;
      top = TUNING.peds.flee;
    } else {
      const dx = ped.targetX - ped.x;
      const dy = ped.targetY - ped.y;
      if (dx * dx + dy * dy < 64) advancePed(world, ped);
      desired = Math.atan2(ped.targetY - ped.y, ped.targetX - ped.x);
      top = TUNING.peds.walk;
    }

    ped.angle = turnToward(ped.angle, desired, 1 - Math.exp(-9 * dt));
    ped.speed += (top - ped.speed) * (1 - Math.exp(-7 * dt));
    ped.phase += dt * ped.speed * 0.075;

    const stepX = Math.cos(ped.angle) * ped.speed * dt;
    const stepY = Math.sin(ped.angle) * ped.speed * dt;
    if (stepX !== 0 && city.isFreeCircle(ped.x + stepX, ped.y, 5)) ped.x += stepX;
    if (stepY !== 0 && city.isFreeCircle(ped.x, ped.y + stepY, 5)) ped.y += stepY;

    const away = Math.hypot(ped.x - player.x, ped.y - player.y);
    if (away > TUNING.peds.despawnRadius || (!ped.alive && ped.deathTimer > 24)) {
      ped.dead = true;
    }
  }

  // Remove recycled bodies and top the sidewalk up again.
  for (let i = world.peds.length - 1; i >= 0; i -= 1) {
    const ped = world.peds[i];
    if (ped.dead || (!ped.alive && ped.deathTimer > 26)) world.peds.splice(i, 1);
  }
  world.pedTimer -= dt;
  if (world.pedTimer > 0) return;
  world.pedTimer = 1.1;
  let alive = 0;
  for (const ped of world.peds) if (ped.alive) alive += 1;
  if (alive < TUNING.peds.count) spawnPeds(world, Math.min(4, TUNING.peds.count - alive));
}

/** Put a car exactly where a scene wants it, with its AI pointed down the lane. */
export function placeTrafficCar(world, x, y, dir, speed, kind = 'sedan', colour = null) {
  const angle = DIRS[dir].angle;
  const car = createVehicle(world, {
    kind,
    x,
    y,
    angle,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    driver: 'ai',
    colour: colour ?? randomBodyColour(world.random),
  });
  const node = nextNode(Math.round(x / PITCH), Math.round(y / PITCH), dir);
  const p = onGrid(node.i, node.j) ? lanePoint(node.i, node.j, dir) : { x: x + DIRS[dir].dx * 240, y: y + DIRS[dir].dy * 240 };
  car.ai = {
    i: node.i,
    j: node.j,
    dir,
    tx: p.x,
    ty: p.y,
    cruise: speed,
    stuck: 0,
    stun: 0,
  };
  return car;
}

/** Empty the road and the sidewalks of ambient life, keeping parked cars and the player's ride. */
export function clearAmbient(world) {
  for (let i = world.vehicles.length - 1; i >= 0; i -= 1) {
    const car = world.vehicles[i];
    if (!car.parked && car.driver !== 'player') world.vehicles.splice(i, 1);
  }
  world.peds.length = 0;
  world.officers.length = 0;
  world.police.units.length = 0;
}

/** A deterministic top-up used by the shot scenes after the camera has moved. */
export function spawnAmbient(world, cars = TUNING.traffic.cars, peds = TUNING.peds.count) {
  spawnTraffic(world, cars);
  spawnPeds(world, peds);
}
