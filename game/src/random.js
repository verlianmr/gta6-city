// A small seeded random number generator (mulberry32): the same seed always produces the same
// city, the same parked cars and the same screenshot frame.

export function makeRandom(seed) {
  let a = (seed | 0) || 0x9e3779b9;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A float in [min, max). */
export function range(random, min, max) {
  return min + random() * (max - min);
}

/** An integer in [min, max], both ends included. */
export function int(random, min, max) {
  return min + Math.floor(random() * (max - min + 1));
}

/** One element of a non-empty array. */
export function pick(random, list) {
  return list[Math.floor(random() * list.length)];
}

/** True with probability p. */
export function chance(random, p) {
  return random() < p;
}
