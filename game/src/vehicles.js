// Cars as entities: parked city cars adopted into the simulation, AI traffic and police cruisers,
// and the one the player drives. Arcade top-down handling: a forward velocity along the body, a
// lateral velocity that grip eats away (less when the handbrake is down, which is the slide),
// steering that scales with speed, and axis-separated collision against building footprints.
// No drawing here; render.js reads the same fields.

import { COLOURS, TUNING } from './config.js';
import { rebuildSolidHash } from './city.js';
import { pick } from './random.js';

export const CAR_TYPES = {
  sedan: { length: 46, width: 22, top: 520, accel: 345, hp: 115, roof: '#2f343b' },
  sports: { length: 48, width: 20, top: 665, accel: 440, hp: 100, roof: '#252a31' },
  van: { length: 54, width: 24, top: 430, accel: 285, hp: 145, roof: '#3b3f44' },
  taxi: { length: 46, width: 22, top: 500, accel: 330, hp: 108, roof: '#e8b93f' },
  police: { length: 50, width: 22, top: 625, accel: 410, hp: TUNING.police.carHp, roof: '#20252c' },
};

const BODY_COLOURS = ['#e8d8ba', '#bd5a4a', '#557c8b', '#d8a443', '#6c707b', '#a44f60', '#4f7f6f', '#eee7d8', '#8a5a45', '#3f4b5c', '#c9753f'];
const AI_KINDS = ['sedan', 'sedan', 'sedan', 'taxi', 'sports', 'van'];
const PLAYER_COLOURS = ['#e9e2cf', '#c9503f', '#4d8c8a', '#e0a63f'];

let nextId = 1;

/** A fresh car. `opts` may set kind, position, angle, colour, driver, parked, police and velocity. */
export function createVehicle(world, opts = {}) {
  const kind = CAR_TYPES[opts.kind] === undefined ? 'sedan' : opts.kind;
  const type = CAR_TYPES[kind];
  const angle = opts.angle ?? 0;
  const vx = opts.vx ?? 0;
  const vy = opts.vy ?? 0;
  const car = {
    id: nextId++,
    kind,
    x: opts.x ?? world.city.spawn.x,
    y: opts.y ?? world.city.spawn.y,
    angle,
    vx,
    vy,
    speed: vx * Math.cos(angle) + vy * Math.sin(angle),
    length: type.length,
    width: type.width,
    topSpeed: type.top,
    accel: type.accel,
    hp: opts.hp ?? type.hp,
    maxHp: opts.hp ?? type.hp,
    colour: opts.colour ?? (kind === 'police' ? COLOURS.policeBody : kind === 'taxi' ? '#e5b23c' : pick(world.random ?? Math.random, BODY_COLOURS)),
    roof: opts.roof ?? type.roof,
    driver: opts.driver ?? null,
    parked: opts.parked ?? false,
    police: opts.police ?? false,
    owned: false,
    ai: opts.ai ?? null,
    throttle: 0,
    steer: 0,
    handbrake: false,
    dead: false,
    crashTimer: 0,
    smokeTimer: 0,
    sirenPhase: (nextId * 1.73) % 6.28,
    deployTimer: 0,
  };
  world.vehicles.push(car);
  return car;
}

/**
 * Turn the city's decorative parked cars into real vehicles: remove their footprints from the
 * collision set, drop the props, and keep a template per car so a reset can put them back.
 */
export function adoptParkedCars(world) {
  const city = world.city;
  const kept = [];
  const templates = [];
  for (const prop of city.props) {
    if (prop.type !== 'car') {
      kept.push(prop);
      continue;
    }
    templates.push({
      kind: 'sedan',
      x: prop.x,
      y: prop.y,
      angle: prop.angle,
      colour: prop.colour,
      roof: prop.roof,
    });
  }
  if (templates.length === 0) return;
  city.props = kept;
  city.solids = city.solids.filter((solid) => solid.kind !== 'car');
  rebuildSolidHash(city);
  world.parkedCars = templates;
}

/** Clear every car and put the city's parked cars back exactly where they were. */
export function resetVehicles(world) {
  world.vehicles.length = 0;
  world.playerCar = null;
  for (const template of world.parkedCars) {
    createVehicle(world, { ...template, parked: true, driver: null });
  }
}

export function removeVehicle(world, car) {
  const index = world.vehicles.indexOf(car);
  if (index !== -1) world.vehicles.splice(index, 1);
  if (world.playerCar === car) world.playerCar = null;
}

/** Whether a car's body fits here: three circles down its centreline against the building set. */
export function carFits(city, x, y, angle, length, width) {
  const radius = width * 0.56;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const reach = length * 0.31;
  return (
    city.isFreeCircle(x + cos * reach, y + sin * reach, radius) &&
    city.isFreeCircle(x, y, radius) &&
    city.isFreeCircle(x - cos * reach, y - sin * reach, radius)
  );
}

/** Whether a world point lies inside a car's oriented body, plus `pad`. */
export function carHitsPoint(car, x, y, pad = 0) {
  const cos = Math.cos(car.angle);
  const sin = Math.sin(car.angle);
  const dx = x - car.x;
  const dy = y - car.y;
  const lx = dx * cos + dy * sin;
  const ly = -dx * sin + dy * cos;
  return Math.abs(lx) < car.length / 2 + pad && Math.abs(ly) < car.width / 2 + pad;
}

/** Whether a walking body would overlap any car: the player cannot stroll through a parked sedan. */
export function blocksFoot(world, x, y, radius) {
  const cars = world.vehicles;
  for (let i = 0; i < cars.length; i += 1) {
    const car = cars[i];
    if (Math.abs(car.x - x) > 48 || Math.abs(car.y - y) > 48) continue;
    if (carHitsPoint(car, x, y, radius)) return true;
  }
  return false;
}

function effect(world, item) {
  if (world.effects.length > 180) world.effects.shift();
  world.effects.push(item);
}

function sparks(world, x, y, angle, count = 6) {
  const rnd = world.fxRandom ?? Math.random;
  for (let i = 0; i < count; i += 1) {
    const a = angle + (rnd() - 0.5) * 2.1;
    const speed = 60 + rnd() * 170;
    effect(world, {
      type: 'spark',
      x,
      y,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed,
      life: 0.18 + rnd() * 0.2,
      max: 0.38,
      colour: i % 3 === 0 ? '#fff0bd' : COLOURS.spark,
    });
  }
}

function hurtPlayer(world, amount) {
  const player = world.player;
  player.hp = Math.max(0, player.hp - amount);
  player.lastHurt = world.time;
  world.audio?.hurt();
}

/** Damage a car; a wrecked car explodes once, goes dark and stops driving. */
export function damageCar(world, car, amount, hitX = car.x, hitY = car.y) {
  if (car.dead) return;
  car.hp -= amount;
  if (amount > 2) sparks(world, hitX, hitY, car.angle + Math.PI, 3);
  if (car.hp > 0) return;
  car.hp = 0;
  car.dead = true;
  car.wrecked = true;
  car.driver = null;
  car.parked = true;
  car.throttle = 0;
  car.steer = 0;
  car.vx *= 0.2;
  car.vy *= 0.2;
  effect(world, { type: 'boom', x: car.x, y: car.y, r: 18, life: 0.55, max: 0.55 });
  const rnd = world.fxRandom ?? Math.random;
  for (let i = 0; i < 10; i += 1) {
    const a = rnd() * Math.PI * 2;
    effect(world, {
      type: 'spark',
      x: car.x,
      y: car.y,
      vx: Math.cos(a) * (80 + rnd() * 260),
      vy: Math.sin(a) * (80 + rnd() * 260),
      life: 0.3 + rnd() * 0.4,
      max: 0.7,
      colour: i % 2 === 0 ? '#ffb347' : '#ffe9b0',
    });
  }
  if (world.decals.length < 80) world.decals.push({ type: 'scorch', x: car.x, y: car.y, r: 24, life: 40, max: 40 });
  world.audio?.crash(1.4);
  if (world.shake !== undefined) {
    world.shake.amount = Math.min(18, world.shake.amount + 9);
    world.shake.time = 0.42;
  }
  if (world.playerCar === car) {
    exitCar(world, true);
    hurtPlayer(world, 16);
  }
  if (world.player.mode === 'foot' && Math.hypot(world.player.x - car.x, world.player.y - car.y) < 95) {
    hurtPlayer(world, 10);
  }
}

/** One car's step of the handling model. AI controllers fill throttle/steer/handbrake first. */
export function integrateCar(world, car, dt) {
  if (car.crashTimer > 0) car.crashTimer -= dt;
  if (car.parked && car.driver === null) {
    car.speed = 0;
    car.vx = 0;
    car.vy = 0;
    return;
  }
  if (car.dead) {
    car.throttle = 0;
    car.steer = 0;
  }

  const cos = Math.cos(car.angle);
  const sin = Math.sin(car.angle);
  let vf = car.vx * cos + car.vy * sin;
  let vl = -car.vx * sin + car.vy * cos;
  const top = car.topSpeed;
  const throttle = car.dead ? 0 : car.throttle;

  if (throttle > 0) {
    const head = Math.max(0.05, 1 - Math.max(0, vf) / top);
    vf += car.accel * throttle * head * dt;
  } else if (throttle < 0) {
    if (vf > 8) vf -= TUNING.vehicle.brake * -throttle * dt;
    else {
      const head = Math.max(0.05, 1 + vf / TUNING.vehicle.reverseTop);
      vf += car.accel * 0.55 * throttle * head * dt;
    }
  }

  // Rolling resistance, then the handbrake's extra drag.
  vf *= Math.exp(-0.5 * dt);
  if (car.handbrake) vf -= Math.sign(vf) * Math.min(Math.abs(vf), 300 * dt);
  if (Math.abs(vf) < 3 && throttle === 0) vf = 0;
  if (vf > top) vf = top;
  if (vf < -TUNING.vehicle.reverseTop) vf = -TUNING.vehicle.reverseTop;

  // Steering: no authority when stopped, a little less at top speed, reversed in reverse.
  const speedAbs = Math.abs(vf);
  const authority = Math.min(1, speedAbs / 135) * (1 - 0.32 * Math.min(1, speedAbs / top));
  car.angle += car.steer * TUNING.vehicle.steerRate * authority * dt * (vf < -4 ? -1 : 1);

  // Lateral grip: high grip snaps the velocity to the new heading; the handbrake lets it drift.
  const grip = car.handbrake ? TUNING.vehicle.driftGrip : TUNING.vehicle.lateralGrip;
  vl *= Math.exp(-grip * dt);

  // Recompose in the old frame so the velocity lags the body: that lag is the slide.
  car.vx = cos * vf - sin * vl;
  car.vy = sin * vf + cos * vl;

  const city = world.city;
  const stepX = car.vx * dt;
  if (stepX !== 0) {
    if (carFits(city, car.x + stepX, car.y, car.angle, car.length, car.width)) car.x += stepX;
    else {
      wallHit(world, car, Math.abs(car.vx));
      car.vx *= -TUNING.vehicle.wallBounce;
    }
  }
  const stepY = car.vy * dt;
  if (stepY !== 0) {
    if (carFits(city, car.x, car.y + stepY, car.angle, car.length, car.width)) car.y += stepY;
    else {
      wallHit(world, car, Math.abs(car.vy));
      car.vy *= -TUNING.vehicle.wallBounce;
    }
  }

  car.speed = car.vx * Math.cos(car.angle) + car.vy * Math.sin(car.angle);

  // Damaged cars smoke; the renderer draws the puff from this list.
  if (!car.dead && car.hp < car.maxHp * 0.42) {
    car.smokeTimer -= dt;
    if (car.smokeTimer <= 0) {
      const rnd = world.fxRandom ?? Math.random;
      car.smokeTimer = 0.16 + rnd() * 0.2;
      effect(world, {
        type: 'smoke',
        x: car.x - Math.cos(car.angle) * 12 + (rnd() - 0.5) * 8,
        y: car.y - Math.sin(car.angle) * 12 + (rnd() - 0.5) * 8,
        vx: (rnd() - 0.5) * 16,
        vy: -8 - rnd() * 14,
        r: 6 + rnd() * 5,
        life: 0.8 + rnd() * 0.6,
        max: 1.4,
      });
    }
  }
}

function wallHit(world, car, impact) {
  if (impact < TUNING.vehicle.crashSpeed) return;
  if (car.crashTimer > 0) return;
  car.crashTimer = 0.3;
  world.audio?.crash(Math.min(1.6, impact / 420));
  if (car === world.playerCar && world.shake !== undefined) {
    world.shake.amount = Math.min(16, world.shake.amount + Math.min(9, impact / 90));
    world.shake.time = 0.34;
  }
  damageCar(world, car, (impact - TUNING.vehicle.crashSpeed) * 0.07, car.x, car.y);
  sparks(world, car.x + Math.cos(car.angle) * car.length * 0.4, car.y + Math.sin(car.angle) * car.length * 0.4, car.angle, 4);
}

/** Player driving: read W/S/A/D and Space, integrate, and keep the on-foot avatar in the seat. */
export function updatePlayerCar(world, dt, input) {
  const car = world.playerCar;
  const player = world.player;
  if (car === null) {
    player.mode = 'foot';
    return;
  }
  car.throttle = -input.axisY();
  car.steer = input.axisX();
  car.handbrake = input.isDown('Space');
  integrateCar(world, car, dt);

  player.x = car.x;
  player.y = car.y;
  player.angle = car.angle;
  player.vx = car.vx;
  player.vy = car.vy;
  player.speed = Math.abs(car.speed);
  player.walkPhase += dt * Math.abs(car.speed) * 0.02;

  if (car.dead && world.playerCar === car) {
    exitCar(world, true);
    hurtPlayer(world, 12);
  }
}

/** Push cars apart and trade damage; parked cars are immovable but still get hit. */
export function resolveVehicleCollisions(world) {
  const cars = world.vehicles;
  for (let i = 0; i < cars.length; i += 1) {
    const a = cars[i];
    for (let j = i + 1; j < cars.length; j += 1) {
      const b = cars[j];
      if (a.parked && b.parked) continue;
      const reach = a.length * 0.52 + b.length * 0.52;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      if (dx * dx + dy * dy > reach * reach) continue;

      const ac = Math.cos(a.angle);
      const as = Math.sin(a.angle);
      const bc = Math.cos(b.angle);
      const bs = Math.sin(b.angle);
      const ar = a.width * 0.62;
      const br = b.width * 0.62;
      let deepest = 0;
      let nx = 0;
      let ny = 0;
      let ax = 0;
      let ay = 0;
      let bx = 0;
      let by = 0;
      for (const oa of [-a.length * 0.26, a.length * 0.26]) {
        ax = a.x + ac * oa;
        ay = a.y + as * oa;
        for (const ob of [-b.length * 0.26, b.length * 0.26]) {
          bx = b.x + bc * ob;
          by = b.y + bs * ob;
          const ddx = bx - ax;
          const ddy = by - ay;
          const d = Math.hypot(ddx, ddy);
          const overlap = ar + br - d;
          if (overlap > deepest && d > 0.001) {
            deepest = overlap;
            nx = ddx / d;
            ny = ddy / d;
          }
        }
      }
      if (deepest <= 0) continue;

      const push = Math.min(deepest, 7) * 0.5;
      if (!a.parked) {
        const nax = a.x - nx * push;
        const nay = a.y - ny * push;
        if (carFits(world.city, nax, nay, a.angle, a.length, a.width)) {
          a.x = nax;
          a.y = nay;
        }
      }
      if (!b.parked) {
        const nbx = b.x + nx * push;
        const nby = b.y + ny * push;
        if (carFits(world.city, nbx, nby, b.angle, b.length, b.width)) {
          b.x = nbx;
          b.y = nby;
        }
      }

      const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (rel < 0) {
        const impulse = -rel * 0.55;
        if (!a.parked) {
          a.vx -= nx * impulse;
          a.vy -= ny * impulse;
        }
        if (!b.parked) {
          b.vx += nx * impulse;
          b.vy += ny * impulse;
        }
        const impact = Math.abs(rel);
        if (impact > 70) {
          sparks(world, (ax + bx) / 2, (ay + by) / 2, Math.atan2(ny, nx), 5);
          damageCar(world, a, impact * 0.035, (ax + bx) / 2, (ay + by) / 2);
          damageCar(world, b, impact * 0.035, (ax + bx) / 2, (ay + by) / 2);
          if (a.crashTimer <= 0 && b.crashTimer <= 0) world.audio?.crash(Math.min(1.4, impact / 380));
          if ((a === world.playerCar || b === world.playerCar) && world.shake !== undefined) {
            world.shake.amount = Math.min(14, world.shake.amount + Math.min(8, impact / 110));
            world.shake.time = 0.32;
          }
          a.crashTimer = 0.25;
          b.crashTimer = 0.25;
        }
      }
    }
  }
}

/** Advance every car that is not the player's: AI traffic and police cruisers. */
export function integrateVehicles(world, dt) {
  for (const car of world.vehicles) {
    if (car === world.playerCar) continue;
    integrateCar(world, car, dt);
  }
}

/** The nearest car the player can get into: close, alive, and not already theirs. */
export function nearestEnterableCar(world) {
  const player = world.player;
  let best = null;
  let bestDist = TUNING.vehicle.enterRange;
  for (const car of world.vehicles) {
    if (car.dead || car === world.playerCar) continue;
    const d = Math.hypot(car.x - player.x, car.y - player.y);
    if (d < bestDist) {
      bestDist = d;
      best = car;
    }
  }
  return best;
}

function bailOut(world, car) {
  // An AI driver gets out and runs: a pedestrian with somewhere better to be.
  const side = car.angle + Math.PI / 2;
  let x = car.x + Math.cos(side) * (car.width * 0.5 + 16);
  let y = car.y + Math.sin(side) * (car.width * 0.5 + 16);
  if (!world.city.isFreeCircle(x, y, 6)) {
    x = car.x - Math.cos(side) * (car.width * 0.5 + 16);
    y = car.y - Math.sin(side) * (car.width * 0.5 + 16);
  }
  if (!world.city.isFreeCircle(x, y, 6)) {
    x = car.x;
    y = car.y;
  }
  world.peds.push({
    x,
    y,
    angle: side,
    targetX: x + Math.cos(side) * 180,
    targetY: y + Math.sin(side) * 180,
    speed: 0,
    walk: 0,
    hp: 40,
    alive: true,
    panic: 4,
    threatX: car.x,
    threatY: car.y,
    shirt: pick(world.random, COLOURS.pedShirts),
    pants: pick(world.random, COLOURS.pedPants),
    skin: pick(world.random, COLOURS.pedSkin),
    hair: '#33241e',
    phase: world.random() * 6.28,
    block: null,
    corner: 0,
    dir: 1,
    crossing: false,
    deathTimer: 0,
  });
}

/** Get into `car` (or the nearest one): the avatar's mode becomes 'car'. */
export function enterCar(world, car) {
  const player = world.player;
  if (player.mode === 'car' || car === null || car.dead) return false;
  if (Math.abs(car.speed) > 140) return false;
  const theft = !car.owned;
  const wasPoliceUnit = world.police.units.indexOf(car) !== -1;
  if (car.driver === 'ai') bailOut(world, car);
  if (wasPoliceUnit) world.police.units.splice(world.police.units.indexOf(car), 1);
  car.driver = 'player';
  car.parked = false;
  car.ai = null;
  car.throttle = 0;
  car.steer = 0;
  car.owned = true;
  player.mode = 'car';
  player.onFoot = false;
  player.car = car;
  world.playerCar = car;
  player.x = car.x;
  player.y = car.y;
  player.angle = car.angle;
  player.vx = car.vx;
  player.vy = car.vy;
  if (theft) {
    world.stats.carsStolen += 1;
    world.message = car.police ? 'POLICE CRUISER STOLEN' : 'CAR JACKED';
    world.messageTimer = 2.2;
    if (car.police) {
      world.police.wanted = Math.min(5, world.police.wanted + 2);
      world.police.cooldown = 0;
    } else if (witnessNear(world, car.x, car.y, 460)) {
      world.police.wanted = Math.min(5, world.police.wanted + 1);
      world.police.cooldown = 0;
    }
    world.audio?.blip(360);
  }
  return true;
}

/** Leave the car, but only at walking pace (or when forced out of a wreck). */
export function exitCar(world, force = false) {
  const car = world.playerCar;
  const player = world.player;
  if (car === null) return false;
  if (!force && Math.abs(car.speed) > TUNING.vehicle.exitSpeed) return false;

  const side = car.angle + Math.PI / 2;
  const distance = car.width * 0.5 + 18;
  let x = car.x + Math.cos(side) * distance;
  let y = car.y + Math.sin(side) * distance;
  if (!world.city.isFreeCircle(x, y, player.radius) || blocksFoot(world, x, y, player.radius)) {
    x = car.x - Math.cos(side) * distance;
    y = car.y - Math.sin(side) * distance;
  }
  if (!world.city.isFreeCircle(x, y, player.radius) || blocksFoot(world, x, y, player.radius)) {
    x = car.x + Math.cos(car.angle) * (car.length * 0.5 + 20);
    y = car.y + Math.sin(car.angle) * (car.length * 0.5 + 20);
  }
  player.x = x;
  player.y = y;
  player.vx = 0;
  player.vy = 0;
  player.angle = car.angle;
  player.speed = 0;
  player.mode = 'foot';
  player.onFoot = true;
  player.car = null;
  car.driver = null;
  car.parked = true;
  car.throttle = 0;
  car.steer = 0;
  car.vx *= 0.25;
  car.vy *= 0.25;
  car.speed *= 0.25;
  world.playerCar = null;
  return true;
}

/** E: get into the nearest car, or step out of the one being driven. */
export function toggleVehicle(world) {
  if (world.phase !== 'play') return false;
  if (world.player.mode === 'car') return exitCar(world);
  const car = nearestEnterableCar(world);
  if (car === null) {
    world.message = 'NO CAR WITHIN REACH';
    world.messageTimer = 1.4;
    return false;
  }
  return enterCar(world, car);
}

/** A witness for a crime: a living pedestrian or a police officer close enough to see it. */
export function witnessNear(world, x, y, range) {
  for (const ped of world.peds) {
    if (ped.alive && Math.hypot(ped.x - x, ped.y - y) < range) return true;
  }
  for (const officer of world.officers) {
    if (officer.hp > 0 && Math.hypot(officer.x - x, officer.y - y) < range + 140) return true;
  }
  for (const unit of world.police.units) {
    if (Math.hypot(unit.x - x, unit.y - y) < range + 160) return true;
  }
  return false;
}

/** Cars at speed hurt the player on foot; the same body test as pedestrians, with a knock-back. */
export function runOverPlayer(world) {
  const player = world.player;
  if (player.mode !== 'foot' || player.hp <= 0) return;
  for (const car of world.vehicles) {
    if (car === world.playerCar || car.parked) continue;
    if (Math.abs(car.speed) < 55) continue;
    if (!carHitsPoint(car, player.x, player.y, player.radius * 0.6)) continue;
    hurtPlayer(world, 22 + Math.min(26, Math.abs(car.speed) * 0.05));
    const away = Math.atan2(player.y - car.y, player.x - car.x);
    player.vx = Math.cos(away) * 260;
    player.vy = Math.sin(away) * 260;
    car.vx *= 0.86;
    car.vy *= 0.86;
    world.audio?.crash(0.8);
    break;
  }
}

/** The colour of a random traffic car, for the renderer's taxi roof signs and variety. */
export function randomBodyColour(random) {
  return pick(random, BODY_COLOURS);
}

export function randomAiKind(random) {
  return pick(random, AI_KINDS);
}

export function randomPlayerColour(random) {
  return pick(random, PLAYER_COLOURS);
}
