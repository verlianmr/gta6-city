// LocalStorage persistence for progress: money, mission position, completed jobs, found
// packages, best race times and lifetime stats under one versioned key. Exports readSave,
// hasSave, clearSave, snapshot, writeSave, autosave, applySave and saveSummary; refused storage
// is handled silently, so the game just plays without a save.

const KEY = 'sunset-palms.save.v1';
const VERSION = 1;

function storage() {
  try {
    const store = window.localStorage;
    if (store === undefined || store === null) return null;
    return store;
  } catch {
    return null;
  }
}

/** The raw saved object, or null when there is none or it is from another version. */
export function readSave() {
  const store = storage();
  if (store === null) return null;
  let raw = null;
  try {
    raw = store.getItem(KEY);
  } catch {
    return null;
  }
  if (raw === null || raw === '') return null;
  try {
    const data = JSON.parse(raw);
    if (data === null || typeof data !== 'object' || data.version !== VERSION) return null;
    return data;
  } catch {
    return null;
  }
}

export function hasSave() {
  return readSave() !== null;
}

export function clearSave() {
  const store = storage();
  if (store === null) return;
  try {
    store.removeItem(KEY);
  } catch {
    // Storage refused the write; nothing to clear.
  }
}

/** The compact progress record written on a mission or activity completion. */
export function snapshot(world) {
  const missions = world.missions;
  const activities = world.activities;
  const bestTimes = {};
  if (activities !== undefined) {
    for (const race of activities.races) if (race.best > 0) bestTimes[race.id] = race.best;
  }
  return {
    version: VERSION,
    savedAt: new Date().toISOString(),
    money: Math.round(world.player.money),
    missionIndex: missions === undefined ? 0 : missions.index,
    completed: missions === undefined ? [] : missions.completed.slice(),
    packages: activities === undefined ? [] : activities.packages.filter((p) => p.taken).map((p) => p.id),
    bestTimes,
    stats: {
      kills: world.stats.kills,
      crimes: world.stats.crimes,
      carsStolen: world.stats.carsStolen,
      missions: missions === undefined ? 0 : missions.completed.length,
      packages: activities === undefined ? 0 : activities.packages.filter((p) => p.taken).length,
    },
    clock: world.clock,
  };
}

export function writeSave(world) {
  const store = storage();
  if (store === null) return false;
  try {
    store.setItem(KEY, JSON.stringify(snapshot(world)));
    return true;
  } catch {
    return false;
  }
}

/** Auto-save: called on a mission payout, a package and a finished race. */
export function autosave(world) {
  return writeSave(world);
}

/**
 * Put a saved run back on a freshly reset world. The city is rebuilt from the seed each boot, so
 * only progress travels: money, which missions are done, which packages are gone, best times.
 */
export function applySave(world, data) {
  if (data === null || typeof data !== 'object') return false;
  world.player.money = Number.isFinite(data.money) ? data.money : world.player.money;
  const missions = world.missions;
  if (missions !== undefined) {
    const completed = Array.isArray(data.completed) ? data.completed : [];
    missions.completed = completed.slice();
    const index = Number.isInteger(data.missionIndex) ? data.missionIndex : completed.length;
    missions.index = Math.max(0, Math.min(missions.chain.length, index));
  }
  const activities = world.activities;
  if (activities !== undefined) {
    const taken = new Set(Array.isArray(data.packages) ? data.packages : []);
    for (const pack of activities.packages) pack.taken = taken.has(pack.id);
    if (data.bestTimes !== null && typeof data.bestTimes === 'object') {
      for (const race of activities.races) {
        const best = data.bestTimes[race.id];
        if (Number.isFinite(best) && best > 0) race.best = best;
      }
    }
  }
  if (data.stats !== null && typeof data.stats === 'object') {
    world.stats.kills = Number.isFinite(data.stats.kills) ? data.stats.kills : 0;
    world.stats.crimes = Number.isFinite(data.stats.crimes) ? data.stats.crimes : 0;
    world.stats.carsStolen = Number.isFinite(data.stats.carsStolen) ? data.stats.carsStolen : 0;
  }
  if (Number.isFinite(data.clock)) world.clock = data.clock;
  return true;
}

/** A short line for the title screen's Continue entry. */
export function saveSummary(data) {
  if (data === null) return '';
  const money = Math.round(data.money ?? 0).toLocaleString('en-US');
  const done = Array.isArray(data.completed) ? data.completed.length : 0;
  return `$${money}  ·  ${done} MISSION${done === 1 ? '' : 'S'} DONE`;
}
