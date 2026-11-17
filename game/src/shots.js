// Deterministic screenshot scenes behind ?shot=cover|foot|drive|mission. Each one resets the
// world, drops the player at a fixed landmark, fills the wallet and the clock with attractive
// values and snaps the camera, so the same seed always renders the same frame. 'drive' and
// 'mission' fall back to on-foot scenes until vehicles and missions exist.

import { snapCamera } from './camera.js';
import { reset } from './world.js';

const SCENES = {
  cover: {
    spot: 'downtown',
    money: 2480,
    hp: 100,
    minute: 18 * 60 + 42,
    zoom: 1.0,
    angle: -Math.PI / 2,
    walkPhase: 1.2,
  },
  foot: {
    spot: 'street',
    money: 6120,
    hp: 86,
    minute: 19 * 60 + 5,
    zoom: 1.04,
    angle: 0.18,
    walkPhase: 2.5,
  },
  drive: {
    spot: 'street',
    money: 18950,
    hp: 100,
    minute: 19 * 60 + 22,
    zoom: 1.0,
    angle: -1.35,
    walkPhase: 0.4,
  },
  mission: {
    spot: 'park',
    money: 7450,
    hp: 72,
    minute: 20 * 60 + 8,
    zoom: 1.0,
    angle: 0.45,
    walkPhase: 3.1,
  },
};

/**
 * Reset `world` and set the named scene (any unknown name becomes 'cover'). Returns the scene
 * key that was used. The frame is complete on return: camera, player, wallet and clock.
 */
export function stageShot(name, world) {
  const key = Object.prototype.hasOwnProperty.call(SCENES, name) ? name : 'cover';
  const scene = SCENES[key];
  reset(world);

  const spot = world.city.spots[scene.spot] ?? world.city.spots.downtown;
  const player = world.player;
  player.x = spot.x;
  player.y = spot.y;
  player.vx = 0;
  player.vy = 0;
  player.angle = scene.angle;
  player.hp = scene.hp;
  player.money = scene.money;
  player.walkPhase = scene.walkPhase;
  player.speed = 0;
  player.onFoot = true;

  world.clock = scene.minute;
  world.camera.zoom = scene.zoom;
  world.phase = 'play';
  world.message = '';
  world.blips.length = 0;
  snapCamera(world.camera, player);
  return key;
}
