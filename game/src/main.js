// Boot and the one loop. ?shot=cover|foot|drive|mission stages a deterministic frame and paints
// it twice for the screenshot; otherwise the requestAnimationFrame loop reads input, advances the
// world in fixed 1/60 s steps, renders the city and lays the HUD on top. Title, play, pause and
// over are handled here; the world owns only its own state.

import { SHOT_MODE, SHOT_SEED, STEP, VIEW } from './config.js';
import { createInput, ACTION_CONFIRM, ACTION_INTERACT, ACTION_MUTE, ACTION_PAUSE } from './input.js';
import { zoomCamera } from './camera.js';
import { createWorld, startGame, update } from './world.js';
import { render } from './render.js';
import { drawHud } from './hud.js';
import { stageShot } from './shots.js';
import { createAudio } from './audio.js';
import { toggleVehicle } from './vehicles.js';

const MAX_FRAME = 0.12;
const MAX_STEPS = 6;

const params = new URLSearchParams(window.location.search);
const shot = params.has('shot') ? params.get('shot') || SHOT_MODE : null;
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : shot ? SHOT_SEED : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const ctx = canvas.getContext('2d', { alpha: false });
const world = createWorld(seed);
const view = { scale: 1, x: 0, y: 0 };
let activeInput = null;

function resize() {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.round(rect.width * dpr));
  const height = Math.max(1, Math.round(rect.height * dpr));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  view.scale = Math.min(width / VIEW.width, height / VIEW.height);
  view.x = (width - VIEW.width * view.scale) / 2;
  view.y = (height - VIEW.height * view.scale) / 2;

  if (activeInput) {
    const cssScale = Math.min(rect.width / VIEW.width, rect.height / VIEW.height);
    activeInput.setViewport(
      (rect.width - VIEW.width * cssScale) / 2,
      (rect.height - VIEW.height * cssScale) / 2,
      VIEW.width * cssScale,
      VIEW.height * cssScale,
    );
  }
}

function paint() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#171420';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
  render(ctx, VIEW.width, VIEW.height, world);
  drawHud(ctx, VIEW.width, VIEW.height, world);
}

function runShot(name) {
  stageShot(name, world);
  resize();
  let painted = 0;
  function paintShot() {
    resize();
    paint();
    painted += 1;
    if (painted < 2) requestAnimationFrame(paintShot);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paintShot);
}

function runGame() {
  const input = createInput(canvas);
  activeInput = input;
  const audio = createAudio();
  world.audio = audio;
  let accumulator = 0;
  let last = performance.now();

  function announce(message) {
    status.textContent = message;
  }

  // Browsers only allow an AudioContext to start inside a gesture; the first key or click unlocks it.
  const unlock = () => audio.unlock();
  window.addEventListener('keydown', unlock);
  window.addEventListener('pointerdown', unlock);

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_CONFIRM) {
      if (world.phase === 'title') {
        audio.unlock();
        startGame(world);
        accumulator = 0;
        announce('Playing. On foot in Sunset Palms.');
      } else if (world.phase === 'over') {
        startGame(world);
        accumulator = 0;
        announce('Playing again. Respawned at the plaza.');
      } else if (world.phase === 'pause') {
        world.phase = 'play';
        announce('Playing.');
      }
    }
    if (actions & ACTION_INTERACT) {
      if (world.phase === 'play') {
        const wasCar = world.player.mode === 'car';
        const changed = toggleVehicle(world);
        if (!changed) announce(wasCar ? 'Slow down before stepping out.' : 'No car within reach.');
        else announce(wasCar ? 'On foot.' : 'Driving.');
      }
    }
    if (actions & ACTION_MUTE) {
      const muted = audio.toggleMute();
      announce(muted ? 'Sound muted.' : 'Sound on.');
    }
    if (actions & ACTION_PAUSE) {
      if (world.phase === 'play') {
        world.phase = 'pause';
        audio.engine(0, 0, false);
        audio.siren(false, 0);
        announce('Paused.');
      } else if (world.phase === 'pause') {
        world.phase = 'play';
        announce('Playing.');
      }
    }
    const wheel = input.takeWheel();
    if (wheel !== 0) zoomCamera(world.camera, wheel);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(MAX_FRAME, Math.max(0, (now - last) / 1000));
    last = now;
    handleActions();

    if (world.phase === 'play' || world.phase === 'title') {
      accumulator += dt;
      let steps = 0;
      while (accumulator >= STEP && steps < MAX_STEPS) {
        update(world, STEP, input);
        accumulator -= STEP;
        steps += 1;
      }
      if (steps === MAX_STEPS) accumulator = 0;
    } else {
      accumulator = 0;
    }
    paint();
  }

  // Leaving the tab pauses a running game rather than letting the city move unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && world.phase === 'play') {
      world.phase = 'pause';
      announce('Paused.');
    }
  });

  resize();
  window.addEventListener('resize', resize);
  announce('Sunset Palms. Press Space or click to begin.');
  requestAnimationFrame(frame);
}

window.__game = world;
if (shot) runShot(shot);
else runGame();
