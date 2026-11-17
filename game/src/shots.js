// Deterministic screenshot scenes behind ?shot=cover|foot|drive|mission. Each one resets the
// world, drops the player at a fixed landmark, fills the wallet and the clock with attractive
// values, populates the street from the seeded random function, then places the exact cars,
// people, police, story marker, collectibles and tracers the frame needs. Nothing here runs a
// simulation step, so the same seed always renders the same frame.

import { snapCamera } from './camera.js';
import { populateAround, reset } from './world.js';
import { stageMission } from './missions.js';
import { notify } from './notify.js';
import { createVehicle } from './vehicles.js';
import { placePed, placeTrafficCar } from './traffic.js';
import { placeOfficer, placePoliceUnit } from './police.js';
import { addBlood, muzzleFlash, spawnBullet } from './combat.js';

const SCENES = {
  cover: { money: 2480, hp: 100, minute: 18 * 60 + 42, zoom: 1.4, wanted: 3 },
  foot: { money: 6120, hp: 92, minute: 19 * 60 + 5, zoom: 1.4, wanted: 1 },
  drive: { money: 18950, hp: 100, minute: 21 * 60 + 14, zoom: 1.4, wanted: 2 },
  mission: { money: 7450, hp: 68, minute: 20 * 60 + 8, zoom: 1.5, wanted: 4 },
};

function clearCarsNear(world, x, y, radius) {
  for (let i = world.vehicles.length - 1; i >= 0; i -= 1) {
    const car = world.vehicles[i];
    if (car.driver === 'player') continue;
    if (Math.hypot(car.x - x, car.y - y) < radius) world.vehicles.splice(i, 1);
  }
}

function clearParkedNear(world, x, y, radius) {
  for (let i = world.vehicles.length - 1; i >= 0; i -= 1) {
    const car = world.vehicles[i];
    if (!car.parked) continue;
    if (Math.hypot(car.x - x, car.y - y) < radius) world.vehicles.splice(i, 1);
  }
}

function seatPlayer(world, car) {
  const player = world.player;
  player.mode = 'car';
  player.onFoot = false;
  player.car = car;
  player.x = car.x;
  player.y = car.y;
  player.angle = car.angle;
  player.vx = car.vx;
  player.vy = car.vy;
  player.speed = Math.abs(car.speed);
  world.playerCar = car;
}

function placePlayerCar(world, x, y, angle, speed, kind, colour) {
  const car = createVehicle(world, {
    kind,
    x,
    y,
    angle,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    driver: 'player',
    colour,
  });
  car.parked = false;
  seatPlayer(world, car);
  return car;
}

function bloodSpot(world, x, y, radius = 11) {
  world.decals.push({ type: 'blood', x, y, r: radius, life: 30, max: 30, angle: 0.4 });
}

function tracer(world, x, y, angle, owner = 'police', speed = 940) {
  spawnBullet(world, x, y, angle, owner, 8, speed);
  muzzleFlash(world, x, y, angle);
}

/** Put the first few collectibles where the frame can see them, still uncollected. */
function placePackagesNear(world, x, y, offsets) {
  const packs = world.activities.packages;
  for (let i = 0; i < offsets.length && i < packs.length; i += 1) {
    packs[i].x = x + offsets[i][0];
    packs[i].y = y + offsets[i][1];
    packs[i].taken = false;
  }
}

/** A mission record staged for the HUD, with the chain position the header shows. */
function stageStory(world, index, step, overrides = {}) {
  const m = stageMission(world, index, step);
  if (m === null) return null;
  if (overrides.target !== undefined) {
    m.target = overrides.target;
    world.mission.target = overrides.target;
    world.mission.distance = Math.hypot(world.player.x - overrides.target.x, world.player.y - overrides.target.y);
  }
  if (overrides.timer !== undefined) {
    m.timer = overrides.timer;
    world.mission.timer = overrides.timer;
    world.mission.timeLimit = m.timeLimit;
  }
  if (overrides.distance !== undefined) world.mission.distance = overrides.distance;
  return m;
}

function sceneCover(world, scene) {
  const plaza = world.city.blocks.find((b) => b.kind === 'plaza');
  const eastLane = plaza.y + plaza.h + 81;
  const westLane = plaza.y + plaza.h + 27;
  const px = plaza.x + 140;
  world.player.x = px;
  world.player.y = eastLane;
  world.player.angle = 0;
  populateAround(world, 10, 16);

  clearParkedNear(world, px, eastLane, 460);
  clearCarsNear(world, px, eastLane, 170);
  placePlayerCar(world, px, eastLane, 0, 420, 'sports', '#e9e2cf');

  clearCarsNear(world, px - 170, eastLane, 110);
  placePoliceUnit(world, px - 170, eastLane, 0, 470);
  clearCarsNear(world, px + 420, westLane, 110);
  placePoliceUnit(world, px + 420, westLane, Math.PI, 300);

  placeTrafficCar(world, px + 240, eastLane, 0, 235, 'sedan', '#557c8b');
  placeTrafficCar(world, px + 470, eastLane, 0, 215, 'taxi');
  placeTrafficCar(world, px + 40, westLane, 2, 230, 'van', '#6c707b');
  placeTrafficCar(world, px + 300, westLane, 2, 245, 'sports', '#bd5a4a');

  const sidewalk = plaza.y + plaza.h - 10;
  placePed(world, plaza.x + 60, sidewalk, 0, { shirt: '#e07a5f' });
  placePed(world, plaza.x + 250, sidewalk, Math.PI, { shirt: '#5fa8a0' });
  placePed(world, plaza.x + 470, sidewalk, 0, { shirt: '#f0b45c' });
  const farSidewalk = plaza.y + plaza.h + 118;
  placePed(world, plaza.x + 100, farSidewalk, Math.PI, { shirt: '#6d8f57' });
  placePed(world, plaza.x + 330, farSidewalk, 0, { shirt: '#c86b7a' });
  placePed(world, plaza.x + 560, farSidewalk, Math.PI, { shirt: '#5f7fa8' });

  const shooter = { x: px - 170 + 26, y: eastLane, angle: 0 };
  tracer(world, shooter.x, shooter.y, 0);
  tracer(world, px - 120, eastLane, 0);
  tracer(world, px - 60, eastLane, 0);
  const blockerAngle = Math.atan2(eastLane - westLane, px - (px + 420));
  tracer(world, px + 396, westLane, blockerAngle);
  tracer(world, px + 330, westLane + 6, blockerAngle);

  placePackagesNear(world, plaza.x + 120, plaza.y + plaza.h + 130, [
    [40, 4],
    [310, 2],
    [520, -22],
  ]);

  // The handoff job is live: a timed delivery, with the drop marker just up the street.
  stageStory(world, 2, 1, { target: { x: px + 300, y: eastLane - 10 }, timer: 52 });
  notify(world, 'ROSA DELGADO', 'Do not open it. Do not stop for anyone.', 'story', 6);
  notify(world, 'HIDDEN PACKAGE 4 / 14', '+$250', 'money', 5);

  world.police.wanted = scene.wanted;
  world.police.siren = 0.9;
  snapCamera(world.camera, { x: px + 160, y: eastLane - 23 });
}

function sceneDrive(world, scene) {
  const plaza = world.city.blocks.find((b) => b.kind === 'plaza');
  const northLane = plaza.x - 27;
  const southLane = plaza.x - 81;
  const py = plaza.y + plaza.h + 528;
  world.player.x = northLane;
  world.player.y = py;
  world.player.angle = -Math.PI / 2;
  populateAround(world, 12, 18);

  clearParkedNear(world, northLane, py, 420);
  clearCarsNear(world, northLane, py, 180);
  placePlayerCar(world, northLane, py, -Math.PI / 2, 385, 'sports', '#c9503f');

  clearCarsNear(world, northLane, py + 110, 120);
  placePoliceUnit(world, northLane, py + 110, -Math.PI / 2, 455);

  placeTrafficCar(world, northLane, py - 200, 3, 225, 'sedan', '#557c8b');
  placeTrafficCar(world, northLane, py - 340, 3, 205, 'taxi');
  placeTrafficCar(world, southLane, py - 280, 1, 235, 'van', '#8a5a45');
  placeTrafficCar(world, southLane, py + 40, 1, 220, 'sedan', '#557c8b');
  clearCarsNear(world, southLane, py - 120, 110);
  placePoliceUnit(world, southLane, py - 120, Math.PI / 2, 300);

  const westWalk = plaza.x - 118;
  const eastWalk = plaza.x + 10;
  placePed(world, westWalk, py - 110, Math.PI / 2, { shirt: '#e07a5f' });
  placePed(world, westWalk, py - 270, -Math.PI / 2, { shirt: '#6d8f57' });
  placePed(world, eastWalk, py - 40, Math.PI / 2, { shirt: '#5fa8a0' });
  placePed(world, eastWalk, py + 30, -Math.PI / 2, { shirt: '#f0b45c' });
  placePed(world, eastWalk, py - 220, Math.PI / 2, { shirt: '#c86b7a' });

  tracer(world, northLane, py + 170, -Math.PI / 2);
  tracer(world, northLane, py + 120, -Math.PI / 2);

  placePackagesNear(world, northLane, py - 240, [
    [46, 0],
    [-52, -120],
    [90, 60],
  ]);

  stageStory(world, 6, 0, { target: { x: northLane, y: py - 200 }, timer: 61 });
  notify(world, 'ROSA DELGADO', 'Run the shipment to the pier before the tide turns.', 'story', 6);
  notify(world, 'WANTED LEVEL 2', 'Two cruisers are on the plate.', 'fail', 4);

  world.police.wanted = scene.wanted;
  world.police.siren = 0.95;
  snapCamera(world.camera, { x: northLane + 6, y: py - 80 });
}

function sceneMission(world, scene) {
  const plaza = world.city.blocks.find((b) => b.kind === 'plaza');
  const player = world.player;
  player.x = plaza.x + 130;
  player.y = plaza.y + 330;
  player.angle = -0.8;
  player.walkPhase = 2.4;
  populateAround(world, 8, 16);
  clearCarsNear(world, plaza.x + 80, plaza.y + plaza.h + 81, 130);

  placePoliceUnit(world, plaza.x + 80, plaza.y + plaza.h + 81, 0, 0);
  placePoliceUnit(world, plaza.x + 480, plaza.y + plaza.h + 27, Math.PI, 0);

  // The Coral Kings crew, not the police: same body, different jacket.
  placeOfficer(world, plaza.x + 40, plaza.y + 400, -0.9, { thug: true, hp: 72 });
  placeOfficer(world, plaza.x + 330, plaza.y + 380, 2.9, { thug: true, hp: 72 });
  placeOfficer(world, plaza.x + 60, plaza.y + 280, 0.6, { down: true, hp: 0, thug: true });
  placeOfficer(world, plaza.x + 388, plaza.y + 300, -2.2, { thug: true, hp: 72 });
  bloodSpot(world, plaza.x + 60, plaza.y + 280, 13);
  bloodSpot(world, plaza.x + 320, plaza.y + 366, 9);

  placePed(world, plaza.x + 300, plaza.y + 250, -2.2, { panic: 3, threatX: player.x, threatY: player.y, shirt: '#e07a5f' });
  placePed(world, plaza.x + 120, plaza.y + 180, 2.4, { panic: 3, threatX: player.x, threatY: player.y, shirt: '#5fa8a0' });
  placePed(world, plaza.x + 360, plaza.y + 330, -1.4, { panic: 3, threatX: player.x, threatY: player.y, shirt: '#f0b45c' });
  placePed(world, plaza.x + 260, plaza.y + 350, 1.2, { alive: false, shirt: '#6d8f57' });
  bloodSpot(world, plaza.x + 260, plaza.y + 350, 12);

  const aim1 = Math.atan2(player.y - (plaza.y + 400), player.x - (plaza.x + 40));
  const aim2 = Math.atan2(player.y - (plaza.y + 380), player.x - (plaza.x + 330));
  tracer(world, plaza.x + 40 + Math.cos(aim1) * 16, plaza.y + 400 + Math.sin(aim1) * 16, aim1, 'thug');
  tracer(world, plaza.x + 70 + Math.cos(aim1) * 16, plaza.y + 390 + Math.sin(aim1) * 16, aim1, 'thug');
  tracer(world, plaza.x + 330 + Math.cos(aim2) * 16, plaza.y + 380 + Math.sin(aim2) * 16, aim2, 'thug');
  tracer(world, plaza.x + 290 + Math.cos(aim2) * 16, plaza.y + 386 + Math.sin(aim2) * 16, aim2, 'thug');

  const playerAim = Math.atan2(plaza.y + 400 - player.y, plaza.x + 40 - player.x);
  player.angle = playerAim;
  muzzleFlash(world, player.x + Math.cos(playerAim) * 18, player.y + Math.sin(playerAim) * 18, playerAim);
  spawnBullet(world, player.x + Math.cos(playerAim) * 22, player.y + Math.sin(playerAim) * 22, playerAim, 'player', 34);

  placePackagesNear(world, plaza.x + 110, plaza.y + 130, [
    [0, 0],
    [170, 10],
    [40, 150],
  ]);

  stageStory(world, 3, 1, { timer: 17, target: { x: plaza.x + plaza.w / 2, y: plaza.y + plaza.h / 2 } });
  notify(world, 'THE CORAL KINGS', 'They were waiting for you. Stay alive.', 'fail', 5);

  world.police.wanted = scene.wanted;
  world.police.siren = 0.7;
  snapCamera(world.camera, { x: plaza.x + 196, y: plaza.y + 300 });
}

function sceneFoot(world, scene) {
  const plaza = world.city.blocks.find((b) => b.kind === 'plaza');
  const player = world.player;
  player.x = plaza.x + 215;
  player.y = plaza.y + plaza.h + 118;
  player.angle = -Math.PI / 2;
  player.walkPhase = 1.1;
  populateAround(world, 12, 20);

  const eastLane = plaza.y + plaza.h + 81;
  const westLane = plaza.y + plaza.h + 27;
  clearCarsNear(world, plaza.x + 150, eastLane, 120);
  placeTrafficCar(world, plaza.x + 150, eastLane, 0, 220, 'sedan', '#557c8b');
  placeTrafficCar(world, plaza.x + 430, eastLane, 0, 200, 'taxi');
  clearCarsNear(world, plaza.x + 260, westLane, 130);
  placePoliceUnit(world, plaza.x + 260, westLane, Math.PI, 210);
  placeTrafficCar(world, plaza.x - 120, westLane, 2, 225, 'van', '#8a5a45');

  placePed(world, plaza.x + 80, plaza.y + plaza.h + 118, 0, { shirt: '#e07a5f' });
  placePed(world, plaza.x + 340, plaza.y + plaza.h + 118, Math.PI, { shirt: '#5fa8a0' });
  placePed(world, plaza.x + 160, plaza.y + plaza.h - 10, 0, { shirt: '#6d8f57' });
  placePed(world, plaza.x + 400, plaza.y + plaza.h - 10, Math.PI, { shirt: '#f0b45c' });

  // Collectibles in the frame and on the minimap, plus a race flag and the crate job.
  placePackagesNear(world, plaza.x + 215, plaza.y + plaza.h + 40, [
    [64, -46],
    [-70, -70],
    [150, -18],
    [-10, 30],
  ]);
  const races = world.activities.races;
  if (races.length > 0) {
    races[0].x = plaza.x + 430;
    races[0].y = plaza.y + plaza.h + 30;
  }
  world.activities.delivery.x = plaza.x + 60;
  world.activities.delivery.y = plaza.y + plaza.h - 12;

  // Between jobs: the next giver is the gold marker on the plaza.
  world.missions.index = 0;
  world.missions.active = null;
  world.missionStart = { x: plaza.x + 215, y: plaza.y + 328, title: 'FIRST LIGHT', giver: 'ROSA DELGADO', index: 0 };
  world.mission.active = false;
  world.mission.title = 'FIRST LIGHT';
  world.mission.giver = 'ROSA DELGADO';
  world.mission.objective = 'Meet Rosa Delgado by the fountain on the plaza.';
  world.mission.target = world.missionStart;
  world.mission.distance = Math.hypot(player.x - world.missionStart.x, player.y - world.missionStart.y);
  world.mission.reward = 500;
  world.mission.step = 0;
  world.mission.steps = 1;
  world.mission.timer = 0;
  world.mission.timeLimit = 0;

  notify(world, 'HIDDEN PACKAGE 3 / 14', '+$250', 'money', 5);
  notify(world, 'NEW JOB', 'ROSA DELGADO is waiting on the plaza.', 'mission', 5.6);

  world.police.wanted = scene.wanted;
  world.police.siren = 0.4;
  snapCamera(world.camera, { x: plaza.x + 215, y: plaza.y + 458 });
}

const BUILDERS = {
  cover: sceneCover,
  drive: sceneDrive,
  mission: sceneMission,
  foot: sceneFoot,
};

/**
 * Reset `world` and set the named scene (any unknown name becomes 'cover'). Returns the scene
 * key that was used. The frame is complete on return: camera, player, wallet, clock, cars,
 * people, police, wanted level, mission marker, collectibles, toasts and effects.
 */
export function stageShot(name, world) {
  const key = Object.prototype.hasOwnProperty.call(SCENES, name) ? name : 'cover';
  const scene = SCENES[key];
  reset(world);

  world.clock = scene.minute;
  world.time = 4.2;
  world.phase = 'play';
  world.message = '';
  world.messageTimer = 0;
  world.blips.length = 0;
  world.camera.zoom = scene.zoom;
  world.camera.zoomHold = 99;
  world.player.hp = scene.hp;
  world.player.money = scene.money;
  world.player.lastHurt = -99;
  world.player.mode = 'foot';
  world.player.onFoot = true;
  world.player.car = null;
  world.playerCar = null;
  world.stats = { kills: 3, crimes: 5, carsStolen: 2, missions: 2, packages: 4 };
  world.shake = { amount: 0, time: 0 };

  BUILDERS[key](world, scene);
  return key;
}
