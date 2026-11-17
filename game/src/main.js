// Boot and the one loop. ?shot=cover|foot|drive|mission stages a deterministic frame and paints
// it twice for the screenshot; otherwise the requestAnimationFrame loop reads input, advances the
// world in fixed 1/60 s steps, renders the city and lays the overlay on top. This file owns the
// flow between screens — title, play, pause, controls, map, over — and the save file behind the
// title's Continue row; the world owns everything inside a step and menu.js owns the drawing.

import { SHOT_MODE, SHOT_SEED, STEP, VIEW } from './config.js';
import { createInput, ACTION_CONFIRM, ACTION_INTERACT, ACTION_MAP, ACTION_MENU_DOWN, ACTION_MENU_UP, ACTION_MUTE, ACTION_PAUSE } from './input.js';
import { zoomCamera } from './camera.js';
import { createWorld, respawn, startGame, update } from './world.js';
import { drawHud } from './hud.js';
import { stageShot } from './shots.js';
import { createAudio } from './audio.js';
import { toggleVehicle } from './vehicles.js';
import { retryMission } from './missions.js';
import { clearSave, readSave, writeSave } from './save.js';
import { menuChoice, moveMenu, setMenuHover } from './menu.js';
import { render } from './render.js';

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
  world.menu.save = readSave();
  let accumulator = 0;
  let last = performance.now();

  function announce(message) {
    status.textContent = message;
  }

  // Browsers only allow an AudioContext to start inside a gesture; the first key or click unlocks it.
  const unlock = () => audio.unlock();
  window.addEventListener('keydown', unlock);
  window.addEventListener('pointerdown', unlock);

  function toTitle() {
    writeSave(world);
    world.menu.save = readSave();
    world.phase = 'title';
    world.menu.index = 0;
    world.menu.hover = -1;
    audio.engine(0, 0, false);
    audio.siren(false, 0);
    announce('Sunset Palms. Choose a row to begin.');
  }

  function start(save) {
    startGame(world, save);
    world.menu.save = readSave();
    world.menu.index = 0;
    world.menu.hover = -1;
    accumulator = 0;
    announce(save === null ? 'Playing. On foot in Sunset Palms.' : 'Continuing your saved run.');
  }

  /** One menu row was chosen, by Enter or by a click. */
  function activate(id) {
    if (id === null || id === undefined) return;
    switch (id) {
      case 'continue':
        audio.unlock();
        start(world.menu.save);
        break;
      case 'new':
        audio.unlock();
        clearSave();
        start(null);
        break;
      case 'controls':
        world.menu.back = world.phase;
        world.phase = 'controls';
        world.menu.index = 0;
        world.menu.hover = -1;
        announce('Controls.');
        break;
      case 'back':
        world.phase = world.menu.back === 'pause' ? 'pause' : 'title';
        world.menu.index = 0;
        world.menu.hover = -1;
        break;
      case 'resume':
        world.phase = 'play';
        world.menu.index = 0;
        world.menu.hover = -1;
        announce('Playing.');
        break;
      case 'restart':
        clearSave();
        start(null);
        break;
      case 'mute': {
        const muted = audio.toggleMute();
        announce(muted ? 'Sound muted.' : 'Sound on.');
        break;
      }
      case 'map':
        world.phase = 'map';
        world.menu.index = 0;
        world.menu.hover = -1;
        announce('City map.');
        break;
      case 'close':
        world.phase = 'play';
        world.menu.index = 0;
        world.menu.hover = -1;
        announce('Playing.');
        break;
      case 'quit':
        toTitle();
        break;
      case 'retry':
        if (world.missions.active !== null) {
          retryMission(world);
          world.phase = 'play';
          announce('Back on the checkpoint.');
        } else {
          respawn(world);
          announce('Respawned on the plaza.');
        }
        accumulator = 0;
        break;
      case 'title':
        toTitle();
        break;
      default:
        break;
    }
  }

  function openPause() {
    world.phase = 'pause';
    world.menu.index = 0;
    world.menu.hover = -1;
    audio.engine(0, 0, false);
    audio.siren(false, 0);
    announce('Paused.');
  }

  function handleActions() {
    const actions = input.takeActions();
    const phase = world.phase;

    if (actions & ACTION_MUTE) {
      const muted = audio.toggleMute();
      announce(muted ? 'Sound muted.' : 'Sound on.');
    }

    if (phase === 'play') {
      if (actions & ACTION_INTERACT) {
        const wasCar = world.player.mode === 'car';
        const changed = toggleVehicle(world);
        if (!changed) announce(wasCar ? 'Slow down before stepping out.' : 'No car within reach.');
        else announce(wasCar ? 'On foot.' : 'Driving.');
      }
      if (actions & ACTION_PAUSE) openPause();
      if (actions & ACTION_MAP) {
        world.phase = 'map';
        world.menu.index = 0;
        world.menu.hover = -1;
        announce('City map.');
      }
      const wheel = input.takeWheel();
      if (wheel !== 0) {
        zoomCamera(world.camera, wheel);
        world.camera.zoomHold = 3;
      }
      return;
    }

    // Every other screen is a menu: arrows move, Enter or a click chooses.
    if (input.mouse.inside) setMenuHover(world, input.mouse.nx, input.mouse.ny);
    if (actions & ACTION_MENU_UP) moveMenu(world, -1);
    if (actions & ACTION_MENU_DOWN) moveMenu(world, 1);
    if (actions & ACTION_CONFIRM) activate(menuChoice(world));

    if (actions & ACTION_PAUSE) {
      if (phase === 'pause') {
        world.phase = 'play';
        world.menu.index = 0;
        announce('Playing.');
      } else if (phase === 'map') {
        world.phase = 'play';
        world.menu.index = 0;
      } else if (phase === 'controls') {
        world.phase = world.menu.back === 'pause' ? 'pause' : 'title';
        world.menu.index = 0;
      } else if (phase === 'over') {
        toTitle();
      }
    }
    if (phase === 'map' && actions & ACTION_MAP) {
      world.phase = 'play';
      world.menu.index = 0;
    }
    if (phase === 'controls' && actions & ACTION_MAP) {
      world.phase = world.menu.back === 'pause' ? 'pause' : 'title';
      world.menu.index = 0;
    }
    input.takeWheel();
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
    if (document.hidden && world.phase === 'play') openPause();
  });

  resize();
  window.addEventListener('resize', resize);
  announce('Sunset Palms. Choose a row to begin.');
  requestAnimationFrame(frame);
}

window.__game = world;
if (shot) runShot(shot);
else runGame();
