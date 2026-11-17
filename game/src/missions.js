// The eight-job story chain: the MISSION_CHAIN data, the runtime step machine (goto, steal,
// deliver, survive, wreck, escape), start markers, payouts and checkpoint retry. Exports
// MISSION_CHAIN, createMissionState, createMissionRecord, setMission, retryMission,
// updateMissions, stageMission and MISSION_COLOUR, and draws nothing.

import { COLOURS, TUNING } from './config.js';
import { createVehicle, exitCar, removeVehicle } from './vehicles.js';
import { raiseWanted, placeOfficer } from './police.js';
import { placeTrafficCar } from './traffic.js';
import { nearestLanePoint } from './roads.js';
import { notify } from './notify.js';
import { autosave } from './save.js';

/**
 * The chain. `start` is the spot the giver waits on; walking into that marker begins the job.
 * Each step is one objective kind:
 *   goto    reach a spot (optionally before `time` runs out)
 *   steal   get into the specific car spawned at a spot
 *   deliver reach a spot, in a car when `inCar`, before `time`
 *   survive stay alive for `time` seconds while `thugs` ambushers hunt you
 *   wreck   chase a fleeing car and destroy it before `time`
 *   escape  reach `stars` wanted and then lose every star
 */
export const MISSION_CHAIN = [
  {
    id: 'first-light',
    title: 'FIRST LIGHT',
    giver: 'ROSA DELGADO',
    start: 'downtown',
    // Rosa waits by her cafe, a few steps off the plaza spawn, so a new game does not snap
    // straight into the job before the player has looked around.
    startShift: [118, 34],
    intro: 'Rosa keeps the coffee coming and the questions short. "You look like a man who can drive."',
    outro: 'Rosa slides a folded bill across the counter. "Tuck is on the sand. He has a car for you."',
    reward: 500,
    steps: [{ kind: 'goto', spot: 'beach', objective: 'Walk down to the sand and find Tuck Malone.' }],
  },
  {
    id: 'borrowed-time',
    title: 'BORROWED TIME',
    giver: 'TUCK MALONE',
    start: 'beach',
    intro: 'Tuck grins at the surf. "Coral coupe in the lot. It belongs to a man who does not deserve it."',
    outro: '"Not a scratch. You are a natural." Tuck pays in cash and a phone number written on a napkin.',
    reward: 900,
    steps: [
      { kind: 'steal', spot: 'lot', carKind: 'sports', colour: '#c9503f', objective: 'Steal the coral sports car from the parking lot.' },
      { kind: 'deliver', spot: 'garage', inCar: true, time: 95, objective: 'Run the coupe to the garage on the boulevard, in one piece.' },
    ],
  },
  {
    id: 'the-handoff',
    title: 'THE HANDOFF',
    giver: 'ROSA DELGADO',
    start: 'downtown',
    intro: 'A briefcase sits behind the cafe counter. "Do not open it. Do not stop for anyone."',
    outro: 'The buyer counts the money twice and never looks up. Rosa is already texting the next job.',
    reward: 1200,
    steps: [
      { kind: 'goto', spot: 'street', objective: 'Collect the briefcase from the boulevard.' },
      { kind: 'deliver', spot: 'pier', time: 70, objective: 'Get the case to the pier before the buyer leaves.' },
    ],
  },
  {
    id: 'sunset-ambush',
    title: 'SUNSET AMBUSH',
    giver: 'TUCK MALONE',
    start: 'street',
    intro: '"Buyer wants the lot after dark. Cash only, no phone." Tuck is already backing away.',
    outro: 'Four of them, none of them standing. Tuck is gone, but the money is in the glovebox.',
    reward: 1600,
    steps: [
      { kind: 'goto', spot: 'lot', objective: 'Meet the buyer in the parking lot.' },
      { kind: 'survive', spot: 'lot', time: 24, thugs: 4, objective: 'It is a setup — survive the ambush.' },
    ],
  },
  {
    id: 'coral-courier',
    title: 'CORAL COURIER',
    giver: 'ROSA DELGADO',
    start: 'downtown',
    intro: '"The Kings are moving our shipment in a green coupe. Take the car out of the picture."',
    outro: 'The coupe is a smear on the asphalt. Rosa calls it a message and pays for the trouble.',
    reward: 2200,
    steps: [
      { kind: 'wreck', spot: 'north', carKind: 'sports', colour: '#4f7f6f', time: 115, objective: 'Chase down and wreck the Coral Kings courier.' },
      { kind: 'goto', spot: 'garage', objective: 'Get off the street before the cops sort it out.' },
    ],
  },
  {
    id: 'heat',
    title: 'HEAT',
    giver: 'DET. IVY SATO',
    start: 'north',
    intro: 'Detective Sato does not arrest you. "I need the Kings scared. Make some noise, then vanish."',
    outro: '"Three stars and not one arrest." Sato almost smiles. "Maybe you are useful after all."',
    reward: 2800,
    steps: [
      { kind: 'escape', stars: 3, objective: 'Pull three stars, then shake the whole tail.' },
      { kind: 'goto', spot: 'park', objective: 'Lay low under the palms in the park.' },
    ],
  },
  {
    id: 'low-tide',
    title: 'LOW TIDE',
    giver: 'ROSA DELGADO',
    start: 'garage',
    intro: '"Shipment is on the clock. Cops already have your plate. Drive like the tide is coming in."',
    outro: 'The boat takes the crates and leaves you on the pier with salt in your teeth and cash in your pocket.',
    reward: 3600,
    steps: [
      {
        kind: 'deliver',
        spot: 'pier',
        time: 78,
        wanted: 2,
        inCar: true,
        objective: 'Run the shipment to the pier before the tide turns.',
      },
    ],
  },
  {
    id: 'last-call',
    title: 'LAST CALL',
    giver: 'ROSA DELGADO',
    start: 'downtown',
    intro: '"Vince Marrow is coming to the pier himself. Bring the crew. Bring the gun."',
    outro: 'The Coral Kings are done and the sun is going down gold over the water. Rosa raises a glass. The city is yours.',
    reward: 10000,
    steps: [
      { kind: 'goto', spot: 'pier', objective: 'Meet Rosa and the crew at the pier.' },
      { kind: 'survive', spot: 'pier', time: 30, thugs: 6, objective: 'The Kings came for the crew — survive the pier.' },
      { kind: 'goto', spot: 'garage', objective: 'Get clear before the sirens close the block.' },
    ],
  },
];

const STATE_ACTIVE = 'active';

/** A fresh, unplayed chain. Save data overwrites `index` and `completed` on Continue. */
export function createMissionState() {
  return {
    chain: MISSION_CHAIN,
    total: MISSION_CHAIN.length,
    index: 0,
    completed: [],
    active: null,
    retry: null,
    start: null,
    story: [],
    cooldown: 0,
    finished: false,
  };
}

function spotOf(world, name) {
  const spot = world.city.spots[name] ?? world.city.spawn;
  return { x: spot.x, y: spot.y };
}

function distanceTo(player, point) {
  return Math.hypot(player.x - point.x, player.y - point.y);
}

/** The small record the renderer (marker), the HUD and the minimap all read. */
export function createMissionRecord() {
  return {
    title: 'SUNSET PALMS',
    objective: '',
    giver: '',
    target: null,
    reward: 0,
    active: false,
    distance: 0,
    timer: 0,
    timeLimit: 0,
    step: 0,
    steps: 0,
    kind: '',
  };
}

/** Point the yellow marker at a landmark and write the objective line the HUD shows. */
export function setMission(world, title, objective, x, y, reward = 2500) {
  const mission = world.mission;
  mission.title = title;
  mission.objective = objective;
  mission.target = { x, y };
  mission.reward = reward;
  mission.active = true;
  mission.distance = Math.hypot(world.player.x - x, world.player.y - y);
  return mission;
}

/** Begin the job at the chain's current index: notify the brief and enter step zero. */
function beginMission(world, def) {
  const state = world.missions;
  const m = {
    def,
    step: 0,
    timer: 0,
    timeLimit: 0,
    target: null,
    objective: '',
    car: null,
    thugs: [],
    checkpoint: { x: world.player.x, y: world.player.y },
    state: STATE_ACTIVE,
  };
  state.active = m;
  state.retry = null;
  state.start = null;
  world.missionStart = null;
  notify(world, def.title, `${def.giver}: ${def.intro}`, 'mission', 5.2);
  world.audio?.blip(760);
  enterStep(world, m);
}

/** Set the heat a step asks for (an escape step, or a delivery that starts hot). */
function applyHeat(world, step) {
  const stars = step.kind === 'escape' ? step.stars ?? 3 : step.wanted ?? 0;
  if (stars <= 0) return;
  raiseWanted(world, stars, world.player.x, world.player.y);
  world.police.wanted = Math.max(world.police.wanted, stars);
  world.police.spawnTimer = 0;
  world.police.cooldown = 0;
}

/** Spawn the car a steal step is about, parked where the step says. */
function spawnMissionCar(world, m, step) {
  const spot = spotOf(world, step.spot);
  const car = createVehicle(world, {
    kind: step.carKind ?? 'sports',
    x: spot.x,
    y: spot.y,
    angle: step.angle ?? Math.PI / 2,
    driver: null,
    parked: true,
    colour: step.colour ?? '#c9503f',
  });
  car.missionTarget = true;
  car.owned = false;
  m.car = car;
  return car;
}

/** Spawn the courier a wreck step is about: an AI car already moving fast down a lane. */
function spawnFleeingCar(world, m, step) {
  const spot = spotOf(world, step.spot);
  const lane = nearestLanePoint(spot.x, spot.y);
  const car = placeTrafficCar(world, lane.x, lane.y, lane.dir, 430, step.carKind ?? 'sports', step.colour ?? '#4f7f6f');
  car.ai.cruise = 500;
  car.hp = car.maxHp = 170;
  car.missionTarget = true;
  m.car = car;
  return car;
}

/** A ring of armed crew around a point, flagged so combat, police and the renderer treat them right. */
function spawnAmbush(world, m, step) {
  const spot = spotOf(world, step.spot);
  const count = step.thugs ?? 4;
  for (let i = 0; i < count; i += 1) {
    const angle = (i / count) * Math.PI * 2 + 0.4;
    const radius = 190 + (i % 3) * 46;
    let x = spot.x + Math.cos(angle) * radius;
    let y = spot.y + Math.sin(angle) * radius;
    if (!world.city.isFreeCircle(x, y, 8)) {
      x = spot.x + Math.cos(angle) * 120;
      y = spot.y + Math.sin(angle) * 120;
    }
    const thug = placeOfficer(world, x, y, Math.atan2(spot.y - y, spot.x - x), {
      thug: true,
      hp: 72,
      fireTimer: 0.9 + i * 0.18,
    });
    thug.missionThug = true;
    m.thugs.push(thug);
  }
  notify(world, 'AMBUSH', 'They were waiting for you. Stay alive.', 'fail', 3.2);
  world.audio?.blip(300);
}

/** Drop the cars and crew a step created, without touching the player's ride. */
function cleanupStep(world, m) {
  if (m.car !== null) {
    m.car.missionTarget = false;
    if (m.car !== world.playerCar && world.vehicles.indexOf(m.car) !== -1) removeVehicle(world, m.car);
    m.car = null;
  }
  for (let i = 0; i < m.thugs.length; i += 1) {
    m.thugs[i].gone = true;
    m.thugs[i].missionThug = false;
  }
  m.thugs.length = 0;
}

/** Enter (or re-enter, after a retry) the mission's current step. */
function enterStep(world, m) {
  const step = m.def.steps[m.step];
  const player = world.player;
  m.stepKind = step.kind;
  m.objective = step.objective;
  m.timeLimit = step.time ?? 0;
  m.timer = m.timeLimit;
  m.target = null;
  m.car = null;
  m.thugs = [];
  m.checkpoint = { x: player.x, y: player.y };
  m.spawned = true;

  if (step.kind === 'steal') spawnMissionCar(world, m, step);
  else if (step.kind === 'wreck') spawnFleeingCar(world, m, step);
  else if (step.kind === 'survive') spawnAmbush(world, m, step);

  applyHeat(world, step);
  m.target = targetOf(world, m, step);
}

/** Where the objective currently is: a fixed spot, or a moving car. Null hides the waypoint. */
function targetOf(world, m, step) {
  if (step.kind === 'steal' || step.kind === 'wreck') {
    return m.car === null || m.car.dead ? null : { x: m.car.x, y: m.car.y };
  }
  if (step.kind === 'escape') return null;
  return spotOf(world, step.spot);
}

function advanceStep(world, m) {
  cleanupStep(world, m);
  m.step += 1;
  if (m.step >= m.def.steps.length) {
    completeMission(world, m);
    return;
  }
  enterStep(world, m);
  notify(world, m.def.title, m.def.steps[m.step].objective, 'mission', 3.4);
  world.audio?.blip(660);
}

function completeMission(world, m) {
  const state = world.missions;
  const player = world.player;
  const def = m.def;
  cleanupStep(world, m);
  player.money += def.reward;
  player.hp = Math.min(player.maxHp, player.hp + 25);
  if (state.completed.indexOf(def.id) === -1) state.completed.push(def.id);
  state.story.push(def.outro);
  state.index = Math.min(state.total, state.index + 1);
  state.active = null;
  state.retry = null;
  state.cooldown = 1.6;
  state.finished = state.index >= state.total;
  world.mission.active = false;
  world.mission.target = null;
  world.mission.timer = 0;
  world.mission.timeLimit = 0;
  world.stats.missions = state.completed.length;
  notify(world, 'MISSION COMPLETE', `+$${def.reward.toLocaleString('en-US')}  ·  ${def.outro}`, 'money', 6.4);
  world.audio?.mission();
  autosave(world);
  if (state.finished) {
    notify(world, 'STORY COMPLETE', 'Every job in Sunset Palms is done. The city belongs to you.', 'story', 8);
  }
}

function failMission(world, m, reason) {
  const state = world.missions;
  cleanupStep(world, m);
  notify(world, 'MISSION FAILED', `${reason} — back to the checkpoint.`, 'fail', 4.2);
  world.audio?.blip(180);
  state.retry = m;
  retryMission(world);
}

/**
 * Put the player back on the step's checkpoint with full health, a cold police radio and the
 * step freshly spawned. Called by a mission failure and by the death screen's retry button.
 */
export function retryMission(world) {
  const state = world.missions;
  const m = state.active ?? state.retry;
  if (m === null || m === undefined) return false;
  const player = world.player;
  const checkpoint = m.checkpoint ?? { x: world.city.spawn.x, y: world.city.spawn.y };
  if (world.playerCar !== null) exitCar(world, true);
  for (const officer of world.officers) {
    if (officer.missionThug) officer.gone = true;
  }
  const units = world.police.units.slice();
  for (const unit of units) removeVehicle(world, unit);
  world.police.units.length = 0;
  world.police.wanted = 0;
  world.police.cooldown = 0;
  player.mode = 'foot';
  player.onFoot = true;
  player.car = null;
  player.vx = 0;
  player.vy = 0;
  player.hp = player.maxHp;
  player.lastHurt = -99;
  if (world.city.isFreeCircle(checkpoint.x, checkpoint.y, player.radius)) {
    player.x = checkpoint.x;
    player.y = checkpoint.y;
  } else {
    player.x = world.city.spawn.x;
    player.y = world.city.spawn.y;
  }
  state.active = m;
  state.retry = null;
  enterStep(world, m);
  m.checkpoint = checkpoint;
  notify(world, 'CHECKPOINT', `${m.def.title} — ${m.def.steps[m.step].objective}`, 'mission', 3.8);
  return true;
}

/** The step machine: one fixed step of the active job. */
function progressStep(world, m, dt) {
  const step = m.def.steps[m.step];
  const player = world.player;
  const target = targetOf(world, m, step);
  m.target = target;
  let done = false;

  switch (step.kind) {
    case 'goto':
    case 'deliver': {
      const spot = spotOf(world, step.spot);
      const near = distanceTo(player, spot) < (step.radius ?? TUNING.missions.checkpointRadius);
      const inCar = step.inCar !== true || player.car !== null;
      if (near && inCar) done = true;
      if (step.inCar === true && m.car !== null && m.car.dead) {
        failMission(world, m, 'THE CARGO IS WRECKED');
        return;
      }
      break;
    }
    case 'steal': {
      if (m.car === null || m.car.dead) {
        failMission(world, m, 'THE CAR IS WRECKED');
        return;
      }
      if (player.car === m.car) done = true;
      break;
    }
    case 'wreck': {
      if (m.car === null) break;
      if (m.car.dead) done = true;
      else if (world.vehicles.indexOf(m.car) === -1) {
        failMission(world, m, 'THE COURIER GOT AWAY');
        return;
      }
      break;
    }
    case 'survive': {
      m.timer -= dt;
      if (m.timer <= 0) done = true;
      break;
    }
    case 'escape': {
      if (world.police.wanted === 0) done = true;
      break;
    }
    default:
      break;
  }

  if (!done && m.timeLimit > 0 && step.kind !== 'survive') {
    m.timer -= dt;
    if (m.timer <= 0) {
      failMission(world, m, 'OUT OF TIME');
      return;
    }
  }

  if (done) advanceStep(world, m);
}

function syncRecord(world, m) {
  const record = world.mission;
  const step = m.def.steps[m.step];
  record.title = m.def.title;
  record.objective = step.objective;
  record.giver = m.def.giver;
  record.reward = m.def.reward;
  record.active = true;
  record.step = m.step + 1;
  record.steps = m.def.steps.length;
  record.kind = step.kind;
  record.timer = Math.max(0, m.timer);
  record.timeLimit = m.timeLimit;
  record.target = m.target;
  record.distance = m.target === null ? 0 : distanceTo(world.player, m.target);
}

/** The idle state: offer the next start marker, or the epilogue once the chain is done. */
function updateIdle(world, dt) {
  const state = world.missions;
  const record = world.mission;
  const player = world.player;
  state.retry = null;
  if (state.cooldown > 0) state.cooldown -= dt;
  const def = state.chain[state.index];
  if (def === undefined) {
    state.start = null;
    world.missionStart = null;
    record.active = false;
    record.target = null;
    record.title = 'SUNSET PALMS';
    record.objective = 'The story is done. Races, packages and the city are yours.';
    record.giver = '';
    record.step = 0;
    record.steps = 0;
    record.timer = 0;
    record.timeLimit = 0;
    record.distance = 0;
    return;
  }
  const spot = spotOf(world, def.start);
  if (def.startShift !== undefined) {
    spot.x += def.startShift[0];
    spot.y += def.startShift[1];
  }
  state.start = { x: spot.x, y: spot.y, title: def.title, giver: def.giver, index: state.index };
  world.missionStart = state.start;
  record.active = false;
  record.target = state.start;
  record.title = def.title;
  record.giver = def.giver;
  record.objective = `Meet ${def.giver}.`;
  record.reward = def.reward;
  record.step = 0;
  record.steps = def.steps.length;
  record.timer = 0;
  record.timeLimit = 0;
  record.distance = distanceTo(player, state.start);
  if (state.cooldown <= 0 && record.distance < TUNING.missions.markerRadius) beginMission(world, def);
}

/** One fixed step of the story: start marker, active step, checkpoint failures. */
export function updateMissions(world, dt) {
  const state = world.missions;
  if (state === undefined) return;
  if (state.active === null) {
    updateIdle(world, dt);
    return;
  }
  world.missionStart = null;
  const m = state.active;
  progressStep(world, m, dt);
  if (state.active === m) syncRecord(world, m);
}

/** A deterministic active mission for the screenshot scenes, without running the sim. */
export function stageMission(world, index, stepIndex = 0) {
  const state = world.missions;
  const def = state.chain[index];
  if (def === undefined) return null;
  state.index = index;
  const m = {
    def,
    step: Math.min(stepIndex, def.steps.length - 1),
    timer: 0,
    timeLimit: 0,
    target: null,
    objective: '',
    car: null,
    thugs: [],
    checkpoint: { x: world.player.x, y: world.player.y },
    state: STATE_ACTIVE,
  };
  state.active = m;
  const step = def.steps[m.step];
  m.stepKind = step.kind;
  m.objective = step.objective;
  m.timeLimit = step.time ?? 0;
  m.timer = m.timeLimit;
  m.target = targetOf(world, m, step);
  syncRecord(world, m);
  world.mission.active = true;
  return m;
}

/** Colour a mission record uses for its HUD accent. */
export const MISSION_COLOUR = COLOURS.mission;
