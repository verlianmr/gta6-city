// Optional paid side content: two street races, a timed delivery run, a rampage against the
// Coral Kings and twelve hidden packages. This module owns their state, rewards and markers
// and draws nothing. Exports createActivities, resetActivities, updateActivities,
// activeCheckpoint, activityMarkers, activitySummary and activityShake.

import { TUNING } from './config.js';
import { lanePoint } from './roads.js';
import { placeOfficer } from './police.js';
import { notify, shakeScreen } from './notify.js';
import { autosave } from './save.js';

/** Race routes as intersections of the road grid; the lane point of each is the checkpoint. */
const RACE_DEFS = [
  {
    id: 'palm-circuit',
    name: 'PALM CIRCUIT',
    start: 'street',
    payout: 1800,
    timeLimit: 105,
    route: [
      [1, 1],
      [6, 1],
      [6, 5],
      [2, 5],
      [2, 2],
    ],
  },
  {
    id: 'shore-run',
    name: 'SHORE RUN',
    start: 'north',
    payout: 2400,
    timeLimit: 118,
    route: [
      [2, 1],
      [8, 2],
      [7, 6],
      [3, 6],
      [1, 3],
    ],
  },
];

const PACKAGE_COUNT = 12;

function openSpot(city, x, y, radius = 10) {
  for (let ring = 0; ring < 30; ring += 1) {
    const steps = ring === 0 ? 1 : 8 + ring * 2;
    for (let i = 0; i < steps; i += 1) {
      const angle = (i / steps) * Math.PI * 2;
      const px = x + Math.cos(angle) * ring * 12;
      const py = y + Math.sin(angle) * ring * 12;
      if (city.isFreeCircle(px, py, radius)) return { x: px, y: py };
    }
  }
  return { x, y };
}

/** Twelve hiding places spread over the map, each nudged into open ground. */
function buildPackages(world) {
  const city = world.city;
  const blocks = city.blocks;
  const packs = [];
  for (let i = 0; i < PACKAGE_COUNT; i += 1) {
    const block = blocks[Math.floor(((i + 0.5) / PACKAGE_COUNT) * blocks.length) % blocks.length];
    const corner = i % 4;
    const cx = corner === 0 || corner === 3 ? block.x + 15 : block.x + block.w - 15;
    const cy = corner < 2 ? block.y + 15 : block.y + block.h - 15;
    const spot = openSpot(city, cx, cy, 9);
    packs.push({ id: `package-${i + 1}`, x: spot.x, y: spot.y, taken: false, phase: i * 0.7 });
  }
  // One on the sand and one in the park, so the collection spans the whole map.
  const sand = openSpot(city, city.spots.beach.x + 90, city.spots.beach.y - 30, 9);
  packs.push({ id: `package-${PACKAGE_COUNT + 1}`, x: sand.x, y: sand.y, taken: false, phase: 4.2 });
  const park = openSpot(city, city.spots.park.x - 60, city.spots.park.y + 70, 9);
  packs.push({ id: `package-${PACKAGE_COUNT + 2}`, x: park.x, y: park.y, taken: false, phase: 5.1 });
  return packs;
}

export function createActivities(world) {
  const city = world.city;
  const races = RACE_DEFS.map((def) => {
    const spot = city.spots[def.start] ?? city.spawn;
    return {
      id: def.id,
      name: def.name,
      payout: def.payout,
      timeLimit: def.timeLimit,
      x: spot.x,
      y: spot.y,
      checkpoints: def.route.map(([i, j]) => {
        const p = lanePoint(i, j, 0);
        return { x: p.x, y: p.y };
      }),
      best: 0,
      cooldown: 0,
    };
  });

  const lot = city.spots.lot ?? city.spawn;
  const pier = city.spots.pier ?? city.spawn;
  const park = city.spots.park ?? city.spawn;

  return {
    races,
    race: null,
    delivery: {
      x: lot.x,
      y: lot.y,
      dropX: pier.x,
      dropY: pier.y,
      active: false,
      timer: 0,
      timeLimit: 88,
      payout: 1100,
      cooldown: 0,
    },
    rampage: {
      x: park.x,
      y: park.y,
      active: false,
      timer: 0,
      timeLimit: TUNING.activities.rampageTime,
      thugs: [],
      needed: 5,
      payout: 1500,
      cooldown: 0,
    },
    packages: buildPackages(world),
  };
}

/** Reset every activity for a new run, keeping nothing from the last one. */
export function resetActivities(world) {
  const fresh = createActivities(world);
  const current = world.activities;
  if (current === undefined) {
    world.activities = fresh;
    return;
  }
  current.race = null;
  current.races = fresh.races;
  current.delivery = fresh.delivery;
  current.rampage = fresh.rampage;
  current.packages = fresh.packages;
}

function collectPackages(world) {
  const acts = world.activities;
  const player = world.player;
  if (player.hp <= 0) return;
  for (const pack of acts.packages) {
    if (pack.taken) continue;
    if (Math.hypot(pack.x - player.x, pack.y - player.y) > TUNING.activities.packageReach) continue;
    pack.taken = true;
    player.money += TUNING.activities.packageReward;
    world.stats.packages = acts.packages.filter((p) => p.taken).length;
    const found = world.stats.packages;
    notify(world, `HIDDEN PACKAGE ${found}/${acts.packages.length}`, `+$${TUNING.activities.packageReward}`, 'money', 3);
    world.audio?.blip(920);
    autosave(world);
  }
}

function startRace(world, race) {
  const acts = world.activities;
  acts.race = { race, next: 0, elapsed: 0, timeLeft: race.timeLimit };
  notify(world, `RACE START — ${race.name}`, `${race.checkpoints.length} checkpoints. Go.`, 'mission', 3.2);
  world.audio?.blip(880);
}

function finishRace(world, failed) {
  const acts = world.activities;
  const run = acts.race;
  if (run === null) return;
  const race = run.race;
  acts.race = null;
  race.cooldown = 6;
  if (failed) {
    notify(world, 'RACE FAILED', 'The clock beat you. Try again from the flag.', 'fail', 3.2);
    world.audio?.blip(220);
    return;
  }
  const payout = race.payout;
  world.player.money += payout;
  const best = race.best === 0 || run.elapsed < race.best;
  if (best) race.best = run.elapsed;
  notify(
    world,
    `${race.name} WON`,
    `+$${payout.toLocaleString('en-US')}  ·  ${run.elapsed.toFixed(1)}s${best ? '  ·  NEW BEST' : ''}`,
    'money',
    5,
  );
  world.audio?.mission();
  autosave(world);
}

function updateRace(world, dt) {
  const acts = world.activities;
  const player = world.player;
  for (const race of acts.races) {
    if (race.cooldown > 0) race.cooldown -= dt;
  }
  const run = acts.race;
  if (run === null) {
    // No side jobs while a story job is on the clock: the markers overlap on purpose.
    if (player.mode !== 'car' || player.hp <= 0 || world.missions.active !== null) return;
    for (const race of acts.races) {
      if (race.cooldown > 0) continue;
      if (Math.hypot(race.x - player.x, race.y - player.y) < 96) {
        startRace(world, race);
        return;
      }
    }
    return;
  }
  run.elapsed += dt;
  run.timeLeft -= dt;
  if (run.timeLeft <= 0) {
    finishRace(world, true);
    return;
  }
  const checkpoint = run.race.checkpoints[run.next];
  if (checkpoint === undefined) {
    finishRace(world, false);
    return;
  }
  if (Math.hypot(checkpoint.x - player.x, checkpoint.y - player.y) < TUNING.activities.raceReach) {
    run.next += 1;
    world.audio?.blip(980);
    if (run.next >= run.race.checkpoints.length) finishRace(world, false);
  }
}

function updateDelivery(world, dt) {
  const acts = world.activities;
  const job = acts.delivery;
  const player = world.player;
  if (job.cooldown > 0) job.cooldown -= dt;
  if (!job.active) {
    if (job.cooldown > 0 || player.mode !== 'car' || player.hp <= 0 || world.missions.active !== null) return;
    if (Math.hypot(job.x - player.x, job.y - player.y) < 96) {
      job.active = true;
      job.timer = job.timeLimit;
      notify(world, 'DELIVERY PICKED UP', 'Get the crate to the pier before the clock runs out.', 'mission', 3.4);
      world.audio?.blip(760);
    }
    return;
  }
  job.timer -= dt;
  if (job.timer <= 0) {
    job.active = false;
    job.cooldown = 5;
    notify(world, 'DELIVERY LOST', 'Too slow. The crate went back in the van.', 'fail', 3.2);
    return;
  }
  if (Math.hypot(job.dropX - player.x, job.dropY - player.y) < 100 && player.mode === 'car') {
    const bonus = Math.round(job.timer * 10);
    job.active = false;
    job.cooldown = 8;
    world.player.money += job.payout + bonus;
    notify(world, 'DELIVERY DONE', `+$${(job.payout + bonus).toLocaleString('en-US')}  ·  ${bonus} time bonus`, 'money', 4.6);
    world.audio?.mission();
    autosave(world);
  }
}

function spawnRampageCrew(world, job) {
  job.thugs.length = 0;
  const player = world.player;
  for (let i = 0; i < job.needed; i += 1) {
    const angle = (i / job.needed) * Math.PI * 2 + 0.6;
    let x = player.x + Math.cos(angle) * (230 + (i % 2) * 70);
    let y = player.y + Math.sin(angle) * (230 + (i % 2) * 70);
    if (!world.city.isFreeCircle(x, y, 8)) {
      x = player.x + Math.cos(angle) * 150;
      y = player.y + Math.sin(angle) * 150;
    }
    const thug = placeOfficer(world, x, y, Math.atan2(player.y - y, player.x - x), {
      thug: true,
      hp: 66,
      fireTimer: 0.8 + i * 0.14,
    });
    thug.rampageThug = true;
    job.thugs.push(thug);
  }
}

function clearRampage(world, job) {
  for (const thug of job.thugs) {
    thug.gone = true;
    thug.rampageThug = false;
  }
  job.thugs.length = 0;
}

function updateRampage(world, dt) {
  const acts = world.activities;
  const job = acts.rampage;
  const player = world.player;
  if (job.cooldown > 0) job.cooldown -= dt;
  if (!job.active) {
    if (job.cooldown > 0 || player.mode !== 'foot' || player.hp <= 0 || world.missions.active !== null) return;
    if (Math.hypot(job.x - player.x, job.y - player.y) < 84) {
      job.active = true;
      job.timer = job.timeLimit;
      job.kills = 0;
      spawnRampageCrew(world, job);
      notify(world, 'RAMPAGE', `Put down ${job.needed} of Marrow's crew before the clock dies.`, 'fail', 3.6);
      world.audio?.blip(320);
    }
    return;
  }
  job.timer -= dt;
  let down = 0;
  for (const thug of job.thugs) if (thug.down || thug.gone || thug.hp <= 0) down += 1;
  job.kills = down;
  if (down >= job.needed) {
    job.active = false;
    job.cooldown = 10;
    clearRampage(world, job);
    world.player.money += job.payout;
    notify(world, 'RAMPAGE CLEARED', `+$${job.payout.toLocaleString('en-US')}  ·  The crew is gone.`, 'money', 5);
    world.audio?.mission();
    autosave(world);
    return;
  }
  if (job.timer <= 0) {
    job.active = false;
    job.cooldown = 6;
    clearRampage(world, job);
    notify(world, 'RAMPAGE OVER', 'The crew scattered. Try again when you are ready.', 'fail', 3.2);
  }
}

/** One fixed step of every side activity. */
export function updateActivities(world, dt) {
  const acts = world.activities;
  if (acts === undefined || world.player.hp <= 0) return;
  collectPackages(world);
  updateRace(world, dt);
  updateDelivery(world, dt);
  updateRampage(world, dt);
}

/** The marker the current race is pointing at, for the HUD and the minimap. */
export function activeCheckpoint(world) {
  const acts = world.activities;
  if (acts === undefined || acts.race === null) return null;
  return acts.race.race.checkpoints[acts.race.next] ?? null;
}

/** Every standing activity marker, for the minimap and the full map screen. */
export function activityMarkers(world) {
  const acts = world.activities;
  if (acts === undefined) return [];
  const out = [];
  if (acts.race === null) {
    for (const race of acts.races) {
      if (race.cooldown > 0) continue;
      out.push({ x: race.x, y: race.y, kind: 'race', label: race.name });
    }
  }
  if (!acts.delivery.active && acts.delivery.cooldown <= 0) {
    out.push({ x: acts.delivery.x, y: acts.delivery.y, kind: 'delivery', label: 'DELIVERY' });
  }
  if (!acts.rampage.active && acts.rampage.cooldown <= 0) {
    out.push({ x: acts.rampage.x, y: acts.rampage.y, kind: 'rampage', label: 'RAMPAGE' });
  }
  return out;
}

/** A short summary for the map legend and the results screen. */
export function activitySummary(world) {
  const acts = world.activities;
  if (acts === undefined) return { packages: 0, total: 0, best: 0, races: 0 };
  let best = 0;
  for (const race of acts.races) if (race.best > 0 && (best === 0 || race.best < best)) best = race.best;
  return {
    packages: acts.packages.filter((p) => p.taken).length,
    total: acts.packages.length,
    best,
    races: acts.races.filter((r) => r.best > 0).length,
  };
}

/** A little impact feedback the rampage and race completions use. */
export function activityShake(world, amount) {
  shakeScreen(world, amount);
}
