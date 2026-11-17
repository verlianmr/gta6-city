// The 0-5 star wanted level and the response: crimes raise it, hiding lowers it, and each star
// buys more cruisers that spawn off screen, ram the player and drop officers who shoot. Exports
// createPoliceState, raiseWanted, updatePolice, placePoliceUnit, placeOfficer, policeSparks and
// officerBlood; state lives on world.police, world.officers and ordinary vehicle entries.

import { COLOURS, TUNING } from './config.js';
import { DIRS, angleDelta, randomRoadPoint } from './roads.js';
import { range } from './random.js';
import { createVehicle, removeVehicle } from './vehicles.js';
import { addBlood, addSpark, muzzleFlash, spawnBullet } from './combat.js';

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

export function createPoliceState() {
  return {
    wanted: 0,
    cooldown: 0,
    spawnTimer: 1.4,
    units: [],
    siren: 0,
    lastCrime: -99,
    lastShot: -99,
    lastCarShot: -99,
  };
}

/** Raise the wanted level and reset the cool-down; the HUD flashes the new count. */
export function raiseWanted(world, amount, x, y) {
  const police = world.police;
  const before = police.wanted;
  police.wanted = Math.min(5, police.wanted + amount);
  police.cooldown = 0;
  police.lastCrime = world.time;
  if (police.wanted !== before) {
    world.message = police.wanted >= 5 ? 'WANTED: ALL UNITS' : `WANTED LEVEL ${police.wanted}`;
    world.messageTimer = 2.4;
    world.audio?.blip(police.wanted >= 3 ? 320 : 520);
  }
}

function nearestUnit(world) {
  let best = Infinity;
  for (const unit of world.police.units) {
    const d = Math.hypot(unit.x - world.player.x, unit.y - world.player.y);
    if (d < best) best = d;
  }
  return best;
}

function spawnPoliceUnit(world) {
  const player = world.player;
  const wanted = world.police.wanted;
  const min = Math.max(520, TUNING.police.spawnMin - wanted * 45);
  const spot = randomRoadPoint(world.random, player.x, player.y, min, TUNING.police.spawnMax);
  if (spot === null) return;
  const angle = DIRS[spot.dir].angle;
  const car = createVehicle(world, {
    kind: 'police',
    x: spot.x,
    y: spot.y,
    angle,
    vx: Math.cos(angle) * 210,
    vy: Math.sin(angle) * 210,
    driver: 'police',
    police: true,
    hp: TUNING.police.carHp,
  });
  car.ai = { mode: 'chase', leaveX: 0, leaveY: 0, leaveTimer: 0, stuck: 0 };
  world.police.units.push(car);
  world.audio?.blip(760);
}

function controlPoliceUnit(world, unit, dt) {
  const ai = unit.ai;
  const player = world.player;
  if (ai.mode === 'leave') {
    ai.leaveTimer += dt;
    const dx = ai.leaveX - unit.x;
    const dy = ai.leaveY - unit.y;
    const dist = Math.hypot(dx, dy);
    const diff = angleDelta(Math.atan2(dy, dx), unit.angle);
    unit.steer = clamp(diff * 2.2, -1, 1);
    unit.throttle = clamp((unit.topSpeed * 0.8 - unit.speed) / 100, -1, 1);
    unit.handbrake = false;
    if (dist < 120 || ai.leaveTimer > 9) ai.done = true;
    return;
  }

  const target = player.mode === 'car' && player.car !== null ? player.car : player;
  const tx = target.x + (target.vx ?? 0) * 0.28;
  const ty = target.y + (target.vy ?? 0) * 0.28;
  const dist = Math.hypot(tx - unit.x, ty - unit.y);
  const diff = angleDelta(Math.atan2(ty - unit.y, tx - unit.x), unit.angle);
  unit.steer = clamp(diff * 2.3, -1, 1);

  let targetSpeed = unit.topSpeed * 0.96;
  if (dist < 260) targetSpeed = 330;
  if (dist < 150) targetSpeed = 220;
  if (dist < 82) targetSpeed = 120;
  if (Math.abs(diff) > 0.9) targetSpeed = Math.min(targetSpeed, 190);
  unit.throttle = clamp((targetSpeed - unit.speed) / 110, -1, 1);
  unit.handbrake = dist < 105 && unit.speed > 270;

  if (Math.abs(unit.speed) < 12) ai.stuck += dt;
  else ai.stuck = 0;
  if (ai.stuck > 2.8) {
    ai.stuck = 0;
    const spot = randomRoadPoint(world.random, player.x, player.y, 800, 1400);
    if (spot !== null) {
      unit.x = spot.x;
      unit.y = spot.y;
      unit.angle = DIRS[spot.dir].angle;
      unit.vx = Math.cos(unit.angle) * 200;
      unit.vy = Math.sin(unit.angle) * 200;
    }
  }

  unit.deployTimer -= dt;
  if (dist < 210 && Math.abs(unit.speed) < 150 && unit.deployTimer <= 0 && player.mode === 'foot' && world.police.wanted > 0) {
    unit.deployTimer = 9;
    spawnOfficer(world, unit, 1);
    spawnOfficer(world, unit, -1);
  }
}

function spawnOfficer(world, unit, side) {
  const angle = unit.angle + Math.PI / 2;
  const x = unit.x + Math.cos(angle) * (unit.width * 0.5 + 16) * side;
  const y = unit.y + Math.sin(angle) * (unit.width * 0.5 + 16) * side;
  if (!world.city.isFreeCircle(x, y, 8)) return;
  world.officers.push({
    x,
    y,
    angle: unit.angle,
    hp: TUNING.police.officerHp,
    maxHp: TUNING.police.officerHp,
    phase: world.random() * 6.28,
    walk: 0,
    fireTimer: 0.7 + world.random() * 0.7,
    down: false,
    wobble: world.random() * 6.28,
  });
  world.audio?.blip(420);
}

function updateOfficer(world, officer, dt) {
  if (officer.down) {
    officer.downTimer = (officer.downTimer ?? 0) + dt;
    return;
  }
  const thug = officer.thug === true;
  const player = world.player;
  const target = player.mode === 'car' && player.car !== null ? player.car : player;
  const dx = target.x - officer.x;
  const dy = target.y - officer.y;
  const dist = Math.hypot(dx, dy);
  if (dist > TUNING.police.officerRange * 2.4 || (!thug && world.police.wanted === 0)) {
    officer.gone = true;
    return;
  }

  officer.angle += angleDelta(Math.atan2(dy, dx), officer.angle) * (1 - Math.exp(-8 * dt));
  let move = 0;
  const hold = thug ? 165 : 210;
  const back = thug ? 110 : 130;
  if (dist > hold) move = 1;
  else if (dist < back) move = -0.7;
  if (move !== 0) {
    const speed = thug ? 158 : 142;
    const stepX = Math.cos(officer.angle) * speed * move * dt;
    const stepY = Math.sin(officer.angle) * speed * move * dt;
    if (world.city.isFreeCircle(officer.x + stepX, officer.y, 7)) officer.x += stepX;
    if (world.city.isFreeCircle(officer.x, officer.y + stepY, 7)) officer.y += stepY;
    officer.walk += dt * 9;
  }

  officer.fireTimer -= dt;
  const range = thug ? 400 : TUNING.police.shootRange;
  if (dist < range && officer.fireTimer <= 0 && player.hp > 0) {
    const aim = Math.atan2(dy, dx) + (world.random() - 0.5) * 0.14;
    const mx = officer.x + Math.cos(aim) * 16;
    const my = officer.y + Math.sin(aim) * 16;
    spawnBullet(world, mx, my, aim, thug ? 'thug' : 'police', TUNING.combat.officerDamage, 880);
    muzzleFlash(world, mx, my, aim);
    world.audio?.gunshot();
    officer.fireTimer = (thug ? 0.85 : 1.05) + world.random() * 0.95;
  }
}

/** One frame of law enforcement: spawning, chasing, officers, and losing the tail. */
export function updatePolice(world, dt) {
  const police = world.police;
  const player = world.player;
  police.spawnTimer -= dt;

  // Recycle wrecks, strays and units that have given up.
  for (let i = police.units.length - 1; i >= 0; i -= 1) {
    const unit = police.units[i];
    const d = Math.hypot(unit.x - player.x, unit.y - player.y);
    if (unit.dead || unit.ai === null || unit.ai.done || d > 3000) {
      police.units.splice(i, 1);
      removeVehicle(world, unit);
    } else {
      controlPoliceUnit(world, unit, dt);
    }
  }

  if (police.wanted > 0) {
    const desired = Math.min(TUNING.police.maxUnits, 1 + Math.ceil(police.wanted * 0.9));
    if (police.units.length < desired && police.spawnTimer <= 0) {
      spawnPoliceUnit(world);
      police.spawnTimer = Math.max(0.85, 2.7 - police.wanted * 0.28);
    }
  }

  for (const officer of world.officers) updateOfficer(world, officer, dt);
  for (let i = world.officers.length - 1; i >= 0; i -= 1) {
    const officer = world.officers[i];
    if (officer.gone || (officer.down && officer.downTimer > 26)) world.officers.splice(i, 1);
  }

  // Siren mix: the closest cruiser decides how loud the two-tone is.
  let nearest = Infinity;
  for (const unit of police.units) {
    const d = Math.hypot(unit.x - player.x, unit.y - player.y);
    if (d < nearest) nearest = d;
  }
  police.siren = police.wanted > 0 ? Math.max(0, 1 - nearest / 1300) : 0;

  // Out of sight, the heat comes off.
  if (police.wanted > 0) {
    police.cooldown += dt;
    const unseen = nearest > 700;
    if (police.cooldown > TUNING.police.coolDown && unseen && world.time - police.lastCrime > TUNING.police.coolDown) {
      police.wanted -= 1;
      police.cooldown = 0;
      world.message = police.wanted > 0 ? `WANTED LEVEL ${police.wanted}` : 'YOU LOST THE COPS';
      world.messageTimer = 2.6;
      world.audio?.blip(680);
      if (police.wanted === 0) {
        for (const unit of police.units) {
          if (unit.ai === null || unit.ai.mode === 'leave') continue;
          const spot = randomRoadPoint(world.random, player.x, player.y, 900, 1800);
          unit.ai.mode = 'leave';
          unit.ai.leaveX = spot === null ? unit.x + 900 : spot.x;
          unit.ai.leaveY = spot === null ? unit.y : spot.y;
          unit.ai.leaveTimer = 0;
        }
      }
    }
  } else {
    police.cooldown = 0;
  }
}

/** A police car placed exactly by a shot scene, already chasing. */
export function placePoliceUnit(world, x, y, angle, speed = 0) {
  const car = createVehicle(world, {
    kind: 'police',
    x,
    y,
    angle,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    driver: 'police',
    police: true,
    hp: TUNING.police.carHp,
  });
  car.ai = { mode: 'chase', leaveX: 0, leaveY: 0, leaveTimer: 0, stuck: 0 };
  world.police.units.push(car);
  return car;
}

/** An officer at an exact spot, for the mission frame. A `thug` is crew, not law. */
export function placeOfficer(world, x, y, angle, opts = {}) {
  const officer = {
    x,
    y,
    angle,
    hp: opts.hp ?? TUNING.police.officerHp,
    maxHp: opts.hp ?? TUNING.police.officerHp,
    phase: world.random() * 6.28,
    walk: 0,
    fireTimer: opts.fireTimer ?? 1.2,
    down: opts.down ?? false,
    thug: opts.thug ?? false,
    wobble: world.random() * 6.28,
  };
  world.officers.push(officer);
  return officer;
}

/** Small spark helper for police car impacts, kept local so police does not need vehicles' internals. */
export function policeSparks(world, x, y, angle) {
  addSpark(world, x, y, angle, 4);
}

/** A blood pool where an officer fell. */
export function officerBlood(world, x, y) {
  addBlood(world, x, y, 10);
}
