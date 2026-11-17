// The world's state and its rules, with no drawing in it: the city, the player (on foot or in a
// car), traffic, pedestrians, the wanted level, bullets and the camera. update(world, dt, input)
// advances one fixed step; render.js, hud.js and menu.js read the same object. Populations are
// spawned from the world's seeded random function, so a reset rebuilds the same street. The story
// chain (missions.js) and the side jobs (activities.js) are stepped from here, in this order.

import { TUNING, VIEW } from './config.js';
import { createCamera, snapCamera, updateCamera } from './camera.js';
import { createCity } from './city.js';
import { makeRandom } from './random.js';
import {
  adoptParkedCars,
  blocksFoot,
  exitCar,
  integrateVehicles,
  removeVehicle,
  resetVehicles,
  resolveVehicleCollisions,
  runOverPlayer,
  updatePlayerCar,
} from './vehicles.js';
import { clearAmbient, runOverPeds, spawnAmbient, spawnPeds, spawnTraffic, updatePeds, updateTraffic } from './traffic.js';
import { createPoliceState, updatePolice } from './police.js';
import { createCombatState, updateCombat, updatePlayerWeapon } from './combat.js';
import { createMissionRecord, createMissionState, updateMissions } from './missions.js';
import { createActivities, resetActivities, updateActivities } from './activities.js';
import { clearNotifications, updateNotifications, updateShake } from './notify.js';
import { applySave } from './save.js';

const cameraTarget = { x: 0, y: 0 };

/** Shortest-way angle interpolation, so a turn across -PI never spins the long way round. */
function turnToward(from, to, k) {
  let delta = (to - from) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return from + delta * k;
}

function makePlayer(city) {
  return {
    x: city.spawn.x,
    y: city.spawn.y,
    vx: 0,
    vy: 0,
    angle: -Math.PI / 2,
    hp: TUNING.player.hpMax,
    maxHp: TUNING.player.hpMax,
    money: 0,
    speed: 0,
    walkPhase: 0,
    radius: TUNING.player.radius,
    onFoot: true,
    mode: 'foot',
    car: null,
    lastHurt: -99,
  };
}

/** Clear every moving thing and rebuild the street from the seed: parked cars, traffic, people. */
function resetSystems(world) {
  world.random = makeRandom((world.seed ^ 0x51ed270b) >>> 0);
  world.fxRandom = makeRandom((world.seed ^ 0x7f4a7c15) >>> 0);
  world.vehicles.length = 0;
  world.playerCar = null;
  world.peds.length = 0;
  world.officers.length = 0;
  world.bullets.length = 0;
  world.effects.length = 0;
  world.decals.length = 0;
  world.police = createPoliceState();
  const combat = createCombatState();
  world.bullets = combat.bullets;
  world.effects = combat.effects;
  world.decals = combat.decals;
  world.fireTimer = 0;
  world.gunPulse = null;
  world.trafficTimer = 0;
  world.pedTimer = 0;
  world.message = '';
  world.messageTimer = 0;
  world.stats = { kills: 0, crimes: 0, carsStolen: 0, missions: 0, packages: 0 };
  resetVehicles(world);
  spawnTraffic(world, TUNING.traffic.cars);
  spawnPeds(world, TUNING.peds.count);
}

export function createWorld(seed) {
  const city = createCity(seed);
  const player = makePlayer(city);
  const camera = createCamera(city);
  snapCamera(camera, player);
  const world = {
    seed,
    city,
    player,
    camera,
    clock: TUNING.clock.startMinute,
    time: 0,
    phase: 'title',
    blips: [],
    message: '',
    messageTimer: 0,
    random: makeRandom((seed ^ 0x51ed270b) >>> 0),
    fxRandom: makeRandom((seed ^ 0x7f4a7c15) >>> 0),
    vehicles: [],
    parkedCars: [],
    peds: [],
    officers: [],
    bullets: [],
    effects: [],
    decals: [],
    police: createPoliceState(),
    playerCar: null,
    mission: createMissionRecord(),
    missionStart: null,
    missions: createMissionState(),
    activities: null,
    notifications: [],
    shake: { amount: 0, time: 0 },
    menu: { index: 0, hover: -1, save: null, time: 0 },
    audio: null,
    stats: { kills: 0, crimes: 0, carsStolen: 0, missions: 0, packages: 0 },
    trafficTimer: 0,
    pedTimer: 0,
    fireTimer: 0,
    gunPulse: null,
    hud: { flash: 0 },
  };
  world.activities = createActivities(world);
  adoptParkedCars(world);
  resetSystems(world);
  return world;
}

/** Back to the opening state: spawn, full health, the starting wallet and the title screen. */
export function reset(world) {
  const player = world.player;
  player.x = world.city.spawn.x;
  player.y = world.city.spawn.y;
  player.vx = 0;
  player.vy = 0;
  player.angle = -Math.PI / 2;
  player.hp = player.maxHp;
  player.money = 1250;
  player.speed = 0;
  player.walkPhase = 0;
  player.onFoot = true;
  player.mode = 'foot';
  player.car = null;
  player.lastHurt = -99;
  world.clock = TUNING.clock.startMinute;
  world.time = 0;
  world.phase = 'title';
  world.message = '';
  world.messageTimer = 0;
  world.blips.length = 0;
  world.camera.zoom = 1.1;
  world.camera.zoomHold = 0;
  world.mission = createMissionRecord();
  world.missionStart = null;
  world.missions = createMissionState();
  world.shake = { amount: 0, time: 0 };
  clearNotifications(world);
  resetSystems(world);
  resetActivities(world);
  world.menu.index = 0;
  world.menu.hover = -1;
  snapCamera(world.camera, player);
}

/**
 * Leave the title screen. `save` is the record read from localStorage on Continue: it is applied
 * after the reset, so the money, the chain position and the packages come back with it.
 */
export function startGame(world, save = null) {
  reset(world);
  if (save !== null) applySave(world, save);
  world.phase = 'play';
  world.menu.index = 0;
  world.menu.hover = -1;
  world.message = save === null ? 'Sunset Palms. E to take a car.' : 'Welcome back to Sunset Palms.';
  world.messageTimer = 3;
  return world;
}

/** Respawn after a death with no job on the clock. */
export function respawn(world) {
  const player = world.player;
  if (world.playerCar !== null) exitCar(world, true);
  player.mode = 'foot';
  player.onFoot = true;
  player.car = null;
  player.vx = 0;
  player.vy = 0;
  player.hp = player.maxHp;
  player.lastHurt = -99;
  const spot = world.city.spawn;
  player.x = spot.x;
  player.y = spot.y;
  world.police.wanted = 0;
  for (const unit of world.police.units.slice()) removeVehicle(world, unit);
  world.police.units.length = 0;
  world.phase = 'play';
  world.message = 'Back on the plaza. The city forgets nothing.';
  world.messageTimer = 3;
  return world;
}


function movePlayer(world, dt, input) {
  const player = world.player;
  const city = world.city;
  const axisX = input.axisX();
  const axisY = input.axisY();
  const length = Math.hypot(axisX, axisY);
  const running = input.isRunning();
  const topSpeed = running ? TUNING.player.runSpeed : TUNING.player.walkSpeed;
  let targetX = 0;
  let targetY = 0;
  if (length > 0) {
    targetX = (axisX / length) * topSpeed;
    targetY = (axisY / length) * topSpeed;
  }
  const response = length > 0 ? TUNING.player.accel : TUNING.player.brake;
  const k = 1 - Math.exp(-response * dt);
  player.vx += (targetX - player.vx) * k;
  player.vy += (targetY - player.vy) * k;

  const stepX = player.vx * dt;
  if (stepX !== 0) {
    if (city.isFreeCircle(player.x + stepX, player.y, player.radius) && !blocksFoot(world, player.x + stepX, player.y, player.radius)) player.x += stepX;
    else player.vx = 0;
  }
  const stepY = player.vy * dt;
  if (stepY !== 0) {
    if (city.isFreeCircle(player.x, player.y + stepY, player.radius) && !blocksFoot(world, player.x, player.y + stepY, player.radius)) player.y += stepY;
    else player.vy = 0;
  }

  player.speed = Math.hypot(player.vx, player.vy);
  if (player.speed > 6) player.walkPhase += dt * player.speed * 0.055;

  // Mouse aim wins while the pointer is over the canvas; otherwise the character faces travel.
  let desired = player.angle;
  if (input.mouse.moved && input.mouse.inside) {
    const camera = world.camera;
    const aimX = camera.x + (input.mouse.nx * VIEW.width - VIEW.width / 2) / camera.zoom;
    const aimY = camera.y + (input.mouse.ny * VIEW.height - VIEW.height / 2) / camera.zoom;
    desired = Math.atan2(aimY - player.y, aimX - player.x);
  } else if (player.speed > 14) {
    desired = Math.atan2(player.vy, player.vx);
  }
  player.angle = turnToward(player.angle, desired, 1 - Math.exp(-TUNING.player.turnRate * dt));
}

function advanceClock(world, dt) {
  world.clock += dt * TUNING.clock.minutesPerSecond;
  if (world.clock >= 24 * 60) world.clock -= 24 * 60;
}

function updateAudio(world, dt) {
  const audio = world.audio;
  if (audio === null) return;
  const player = world.player;
  if (player.mode === 'car' && world.playerCar !== null) {
    audio.engine(world.playerCar.speed, world.playerCar.throttle, true);
  } else {
    audio.engine(0, 0, false);
  }
  audio.siren(world.police.wanted > 0 && world.police.siren > 0.02, world.police.siren);
}

/** The camera widens as the car goes faster, unless the player has just chosen a zoom. */
function updateCameraFeel(world, dt) {
  const camera = world.camera;
  const driving = world.player.mode === 'car' && world.playerCar !== null;
  const speed = driving ? Math.abs(world.playerCar.speed) : 0;
  if (camera.zoomHold !== undefined && camera.zoomHold > 0) {
    camera.zoomHold -= dt;
  } else {
    const desired = driving ? 1.34 - Math.min(0.2, speed / 2600) : 1.34;
    camera.zoom += (desired - camera.zoom) * (1 - Math.exp(-1.8 * dt));
  }
}

function stepPlay(world, dt, input) {
  const player = world.player;

  updatePlayerWeapon(world, dt, input);

  const beforePhase = player.walkPhase;
  if (player.mode === 'car') {
    updatePlayerCar(world, dt, input);
  } else {
    movePlayer(world, dt, input);
    if (player.walkPhase - beforePhase > 0 && Math.floor(beforePhase / Math.PI) !== Math.floor(player.walkPhase / Math.PI) && player.speed > 60) {
      world.audio?.footstep();
    }
  }

  updateTraffic(world, dt);
  updatePolice(world, dt);
  integrateVehicles(world, dt);
  resolveVehicleCollisions(world);
  runOverPeds(world);
  runOverPlayer(world);
  updatePeds(world, dt);
  updateCombat(world, dt);
  updateMissions(world, dt);
  updateActivities(world, dt);
  updateNotifications(world, dt);
  updateShake(world, dt);
  advanceClock(world, dt);
  updateAudio(world, dt);

  if (world.messageTimer > 0) world.messageTimer -= dt;
  if (world.hud.flash > 0) world.hud.flash -= dt * 1.6;

  if (player.hp <= 0) {
    if (world.playerCar !== null) exitCar(world, true);
    player.hp = 0;
    world.phase = 'over';
    world.menu.index = 0;
    world.menu.hover = -1;
    world.message = '';
    world.audio?.engine(0, 0, false);
    world.audio?.siren(false, 0);
  }
}

export function update(world, dt, input) {
  world.time += dt;
  if (world.phase === 'play') {
    stepPlay(world, dt, input);
  } else if (world.phase === 'title') {
    // Idle breathing on the title screen; the street behind still moves.
    world.player.walkPhase += dt * 0.7;
    advanceClock(world, dt);
    updateTraffic(world, dt);
    integrateVehicles(world, dt);
    updatePeds(world, dt);
    resolveVehicleCollisions(world);
    updateNotifications(world, dt);
    if (world.messageTimer > 0) world.messageTimer -= dt;
  }

  const focus = world.player.mode === 'car' && world.player.car !== null ? world.player.car : world.player;
  const lead = world.player.mode === 'car' ? 0.3 : TUNING.camera.lookAhead;
  cameraTarget.x = focus.x + focus.vx * lead;
  cameraTarget.y = focus.y + focus.vy * lead;
  updateCamera(world.camera, cameraTarget, dt);
  updateCameraFeel(world, dt);
}

/** Empty the street and refill it around wherever the camera has been put, for the shot scenes. */
export function populateAround(world, cars = 16, peds = 26) {
  clearAmbient(world);
  world.random = makeRandom((world.seed ^ 0x2f7a1b3d) >>> 0);
  spawnAmbient(world, cars, peds);
  world.police = createPoliceState();
}

export { setMission } from './missions.js';

/** The visible world rectangle, used by the renderer and the minimap. */
export function viewBounds(camera) {
  const halfWidth = VIEW.width / (2 * camera.zoom);
  const halfHeight = VIEW.height / (2 * camera.zoom);
  return {
    x0: camera.x - halfWidth,
    y0: camera.y - halfHeight,
    x1: camera.x + halfWidth,
    y1: camera.y + halfHeight,
  };
}
