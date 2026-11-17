// The world's state and its rules, with no drawing in it: the player on foot, the camera, the
// clock and the phase (title, play, pause, over). update(world, dt, input) advances one frame;
// the renderer and the HUD read the same object.

import { TUNING, VIEW } from './config.js';
import { createCamera, snapCamera, updateCamera } from './camera.js';
import { createCity } from './city.js';

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
  };
}

export function createWorld(seed) {
  const city = createCity(seed);
  const player = makePlayer(city);
  const camera = createCamera(city);
  snapCamera(camera, player);
  return {
    seed,
    city,
    player,
    camera,
    clock: TUNING.clock.startMinute,
    time: 0,
    phase: 'title',
    blips: [],
    message: '',
  };
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
  world.clock = TUNING.clock.startMinute;
  world.time = 0;
  world.phase = 'title';
  world.message = '';
  world.blips.length = 0;
  world.camera.zoom = 1;
  snapCamera(world.camera, player);
}

/** Leave the title screen: a clean run from the plaza spawn. */
export function startGame(world) {
  reset(world);
  world.phase = 'play';
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
    if (city.isFreeCircle(player.x + stepX, player.y, player.radius)) player.x += stepX;
    else player.vx = 0;
  }
  const stepY = player.vy * dt;
  if (stepY !== 0) {
    if (city.isFreeCircle(player.x, player.y + stepY, player.radius)) player.y += stepY;
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

export function update(world, dt, input) {
  world.time += dt;
  if (world.phase === 'play') {
    movePlayer(world, dt, input);
    advanceClock(world, dt);
    if (world.player.hp <= 0) world.phase = 'over';
  } else if (world.phase === 'title') {
    // Idle breathing on the title screen; the city behind still gets its water animation.
    world.player.walkPhase += dt * 0.7;
    advanceClock(world, dt);
  }

  const player = world.player;
  cameraTarget.x = player.x + player.vx * TUNING.camera.lookAhead;
  cameraTarget.y = player.y + player.vy * TUNING.camera.lookAhead;
  updateCamera(world.camera, cameraTarget, dt);
}

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
