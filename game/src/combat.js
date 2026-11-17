// Gunplay and its debris: bullets stepped against walls, cars, pedestrians, officers and the
// player, plus sparks, blood, decals and the pistol that fires toward the mouse on foot.
// Exports createCombatState, spawnBullet, updateCombat, updatePlayerWeapon, damagePlayer,
// commitCrime, addSpark, addBlood and muzzleFlash.

import { COLOURS, TUNING, VIEW } from './config.js';
import { carHitsPoint, damageCar, witnessNear } from './vehicles.js';

export function createCombatState() {
  return { bullets: [], effects: [], decals: [], fireTimer: 0, gunPulse: null };
}

function addEffect(world, item) {
  if (world.effects.length > 200) world.effects.shift();
  world.effects.push(item);
}

/** A short burst of golden sparks, for walls, car panels and bullet impacts. */
export function addSpark(world, x, y, angle, count = 5) {
  const rnd = world.fxRandom ?? Math.random;
  for (let i = 0; i < count; i += 1) {
    const a = angle + (rnd() - 0.5) * 2.4;
    const speed = 70 + rnd() * 190;
    addEffect(world, {
      type: 'spark',
      x,
      y,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed,
      life: 0.16 + rnd() * 0.22,
      max: 0.38,
      colour: i % 4 === 0 ? '#fff6d6' : COLOURS.spark,
    });
  }
}

/** A dark pool and a few droplets: the city's least favourite decoration. */
export function addBlood(world, x, y, size = 10) {
  const rnd = world.fxRandom ?? Math.random;
  if (world.decals.length > 90) world.decals.shift();
  world.decals.push({ type: 'blood', x, y, r: size, life: 34, max: 34, angle: rnd() * 6.28 });
  for (let i = 0; i < 4; i += 1) {
    const a = rnd() * Math.PI * 2;
    const speed = 20 + rnd() * 70;
    addEffect(world, {
      type: 'blood',
      x,
      y,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed,
      r: 1.6 + rnd() * 2.2,
      life: 0.35 + rnd() * 0.4,
      max: 0.75,
    });
  }
}

export function muzzleFlash(world, x, y, angle) {
  addEffect(world, { type: 'flash', x, y, angle, life: 0.09, max: 0.09 });
  addSpark(world, x, y, angle, 3);
}

export function spawnBullet(world, x, y, angle, owner, damage, speed = TUNING.combat.bulletSpeed) {
  if (world.bullets.length > 110) world.bullets.shift();
  world.bullets.push({
    x,
    y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    angle,
    life: 0.85,
    owner,
    damage,
  });
}

/** A crime the player committed: stars go up, the cool-down resets, the HUD gets a line. */
export function commitCrime(world, amount) {
  const police = world.police;
  if (police === undefined) return;
  const before = police.wanted;
  police.wanted = Math.min(5, police.wanted + amount);
  police.cooldown = 0;
  police.lastCrime = world.time;
  if (police.wanted !== before) {
    world.message = police.wanted >= 5 ? 'WANTED: ALL UNITS' : `WANTED LEVEL ${police.wanted}`;
    world.messageTimer = 2.4;
    world.audio?.blip(police.wanted >= 3 ? 320 : 520);
  }
}

export function damagePlayer(world, amount) {
  const player = world.player;
  if (player.hp <= 0) return;
  player.hp = Math.max(0, player.hp - amount);
  player.lastHurt = world.time;
  world.audio?.hurt();
}

function hitPed(world, ped, bullet) {
  if (!ped.alive) return false;
  if (Math.hypot(ped.x - bullet.x, ped.y - bullet.y) > 9) return false;
  ped.hp -= bullet.damage;
  if (ped.hp <= 0) {
    ped.alive = false;
    ped.deathTimer = 0;
    ped.panic = 0;
    addBlood(world, ped.x, ped.y, 12);
    if (bullet.owner === 'player') {
      world.stats.kills += 1;
      commitCrime(world, 1);
    }
  } else {
    ped.panic = 3;
    ped.threatX = bullet.x;
    ped.threatY = bullet.y;
    addBlood(world, ped.x, ped.y, 4);
  }
  return true;
}

function hitOfficer(world, officer, bullet) {
  if (officer.hp <= 0) return false;
  if (Math.hypot(officer.x - bullet.x, officer.y - bullet.y) > 10) return false;
  officer.hp -= bullet.damage;
  if (officer.hp <= 0) {
    officer.hp = 0;
    officer.down = true;
    addBlood(world, officer.x, officer.y, 13);
    if (bullet.owner === 'player') {
      world.stats.kills += 1;
      // Crew killed in a back alley are nobody's police report; an officer is two stars.
      if (officer.thug !== true) commitCrime(world, 2);
    }
  } else {
    addBlood(world, officer.x, officer.y, 4);
  }
  return true;
}

function hitCar(world, car, bullet) {
  if (!carHitsPoint(car, bullet.x, bullet.y, 1)) return false;
  damageCar(world, car, bullet.damage * 0.24, bullet.x, bullet.y);
  addSpark(world, bullet.x, bullet.y, bullet.angle + Math.PI, 4);
  if (bullet.owner === 'player' && car.police && world.time - (world.police.lastCarShot ?? -9) > 1.6) {
    world.police.lastCarShot = world.time;
    commitCrime(world, 1);
  }
  return true;
}

/** Move every bullet, then age effects and decals and slowly give the player their health back. */
export function updateCombat(world, dt) {
  const city = world.city;
  const player = world.player;

  for (let i = world.bullets.length - 1; i >= 0; i -= 1) {
    const bullet = world.bullets[i];
    bullet.life -= dt;
    let dead = bullet.life <= 0;
    if (!dead) {
      const speed = Math.hypot(bullet.vx, bullet.vy);
      const steps = Math.max(1, Math.ceil((speed * dt) / 12));
      const sx = (bullet.vx * dt) / steps;
      const sy = (bullet.vy * dt) / steps;
      for (let s = 0; s < steps && !dead; s += 1) {
        bullet.x += sx;
        bullet.y += sy;

        if (bullet.owner !== 'player' && player.mode === 'foot' && Math.hypot(player.x - bullet.x, player.y - bullet.y) < 10) {
          damagePlayer(world, bullet.damage);
          addBlood(world, player.x, player.y, 5);
          dead = true;
          break;
        }
        let hit = false;
        for (const ped of world.peds) {
          if (hitPed(world, ped, bullet)) {
            hit = true;
            break;
          }
        }
        if (hit) {
          dead = true;
          break;
        }
        for (const officer of world.officers) {
          if (hitOfficer(world, officer, bullet)) {
            hit = true;
            break;
          }
        }
        if (hit) {
          dead = true;
          break;
        }
        for (const car of world.vehicles) {
          if (hitCar(world, car, bullet)) {
            hit = true;
            break;
          }
        }
        if (hit) {
          dead = true;
          break;
        }
        if (!city.isWalkable(bullet.x, bullet.y)) {
          addSpark(world, bullet.x, bullet.y, bullet.angle + Math.PI, 5);
          dead = true;
        }
      }
    }
    if (dead) world.bullets.splice(i, 1);
  }

  for (let i = world.effects.length - 1; i >= 0; i -= 1) {
    const item = world.effects[i];
    item.life -= dt;
    if (item.vx !== undefined) {
      item.x += item.vx * dt;
      item.y += item.vy * dt;
      item.vx *= 0.9;
      item.vy *= 0.9;
    }
    if (item.life <= 0) world.effects.splice(i, 1);
  }
  for (let i = world.decals.length - 1; i >= 0; i -= 1) {
    const item = world.decals[i];
    item.life -= dt;
    if (item.life <= 0) world.decals.splice(i, 1);
  }

  if (world.fireTimer > 0) world.fireTimer -= dt;
  if (player.hp > 0 && player.hp < player.maxHp && world.time - player.lastHurt > TUNING.combat.regenDelay) {
    player.hp = Math.min(player.maxHp, player.hp + TUNING.combat.regenRate * dt);
  }
}

/** The pistol: left mouse or Space on foot, aimed at the pointer, with a little spread. */
export function updatePlayerWeapon(world, dt, input) {
  if (world.player.mode !== 'foot' || world.player.hp <= 0) return;
  const wants = input.isFiring() || input.isDown('Space');
  if (!wants || world.fireTimer > 0) return;
  const player = world.player;
  let angle = player.angle;
  if (input.mouse.moved && input.mouse.inside) {
    const camera = world.camera;
    const wx = camera.x + (input.mouse.nx * VIEW.width - VIEW.width / 2) / camera.zoom;
    const wy = camera.y + (input.mouse.ny * VIEW.height - VIEW.height / 2) / camera.zoom;
    angle = Math.atan2(wy - player.y, wx - player.x);
    player.angle = angle;
  }
  const spread = ((world.fxRandom?.() ?? Math.random()) - 0.5) * 0.05;
  const muzzleX = player.x + Math.cos(angle) * 18;
  const muzzleY = player.y + Math.sin(angle) * 18;
  spawnBullet(world, muzzleX, muzzleY, angle + spread, 'player', TUNING.combat.damage);
  muzzleFlash(world, muzzleX, muzzleY, angle);
  world.fireTimer = TUNING.combat.fireRate;
  world.gunPulse = { x: player.x, y: player.y, time: world.time };
  world.audio?.gunshot();
  if (world.time - (world.police.lastShot ?? -9) > 2.4) {
    // A gunshot in the street is a crime even before anyone is hit; after that, witnesses matter.
    if (witnessNear(world, player.x, player.y, 520) || world.police.wanted === 0) {
      world.police.lastShot = world.time;
      commitCrime(world, 1);
    }
  }
}
