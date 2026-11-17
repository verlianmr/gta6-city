// The overlay: mission title and objective with a live distance, wallet, clock, health, wanted
// stars, a minimap with every blip the city has (mission, police, packages, side jobs, the race
// checkpoint), a waypoint arrow that points off screen, and the toast column. Everything is drawn
// in the fixed 1280x720 frame with generous type, so the frame still reads at thumbnail size. The
// full-screen menus are menu.js's job; this file only hands off to it.

import { CITY, COLOURS, FONT } from './config.js';
import { activityMarkers } from './activities.js';
import { drawMenu } from './menu.js';

const MINI = { width: 244, height: 196, x: 10, y: 30, w: 224, h: 156, supersample: 2 };
const MINI_PAD = 24;

let minimapCache = { city: null, canvas: null, scale: 1, ox: 0, oy: 0 };
let moneyCache = { value: -1, text: '$0' };
let clockCache = { minute: -1, text: '00:00' };

const fontCache = new Map();

function font(size, weight) {
  const key = `${weight}:${size}`;
  let value = fontCache.get(key);
  if (value === undefined) {
    value = `${weight} ${size}px ${FONT}`;
    fontCache.set(key, value);
  }
  return value;
}

function label(ctx, value, x, y, size, colour, weight = '600', align = 'left') {
  ctx.font = font(size, weight);
  ctx.fillStyle = colour;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(value, x, y);
}

function panel(ctx, x, y, w, h, radius = 12, fill = COLOURS.hudPanel) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = COLOURS.hudEdge;
  ctx.lineWidth = 1;
  ctx.stroke();
}

function formatMoney(value) {
  if (value !== moneyCache.value) {
    moneyCache.value = value;
    moneyCache.text = `$${Math.max(0, Math.round(value)).toLocaleString('en-US')}`;
  }
  return moneyCache.text;
}

function formatClock(minute) {
  const whole = Math.floor(minute) % (24 * 60);
  if (whole !== clockCache.minute) {
    clockCache.minute = whole;
    const hours = Math.floor(whole / 60);
    const minutes = whole % 60;
    clockCache.text = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }
  return clockCache.text;
}

function dayPhase(minute) {
  const hour = (minute / 60) % 24;
  if (hour < 6) return 'NIGHT';
  if (hour < 8.5) return 'DAWN';
  if (hour < 16.5) return 'DAYLIGHT';
  if (hour < 19.5) return 'GOLDEN HOUR';
  if (hour < 21) return 'SUNSET';
  return 'NIGHT';
}

function formatTime(seconds) {
  const whole = Math.max(0, seconds);
  const mins = Math.floor(whole / 60);
  const secs = Math.floor(whole % 60);
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

function buildMinimap(city) {
  if (minimapCache.city === city) return minimapCache;
  const canvas = document.createElement('canvas');
  canvas.width = MINI.width * MINI.supersample;
  canvas.height = MINI.height * MINI.supersample;
  const g = canvas.getContext('2d');
  g.scale(MINI.supersample, MINI.supersample);
  g.clearRect(0, 0, MINI.width, MINI.height);

  const mapX = MINI.x;
  const mapY = MINI.y;
  const mapW = MINI.w;
  const mapH = MINI.h;
  const worldHeight = city.gridHeight + CITY.beachDepth + 120;
  const scale = Math.min(mapW / city.width, mapH / worldHeight);
  const ox = mapX + (mapW - city.width * scale) / 2;
  const oy = mapY + (mapH - worldHeight * scale) / 2;

  // Ocean, then the sand ribbon.
  g.fillStyle = COLOURS.waterDeep;
  g.fillRect(mapX, mapY, mapW, mapH);
  g.beginPath();
  g.moveTo(ox, oy + city.gridHeight * scale);
  for (let x = 0; x <= city.width; x += 90) g.lineTo(ox + x * scale, oy + city.shoreY(x) * scale);
  g.lineTo(ox + city.width * scale, oy + city.gridHeight * scale);
  g.closePath();
  g.fillStyle = COLOURS.sand;
  g.fill();

  // Asphalt grid, then each block and its buildings.
  g.fillStyle = COLOURS.minimapRoad;
  g.fillRect(ox, oy, city.gridWidth * scale, city.gridHeight * scale);

  for (let i = 0; i < city.blocks.length; i += 1) {
    const block = city.blocks[i];
    const bx = ox + block.x * scale;
    const by = oy + block.y * scale;
    const bw = Math.max(1, block.w * scale);
    const bh = Math.max(1, block.h * scale);
    if (block.kind === 'park') g.fillStyle = '#5f8c4b';
    else if (block.kind === 'plaza') g.fillStyle = '#d5c19c';
    else if (block.kind === 'lot') g.fillStyle = '#5a555e';
    else g.fillStyle = COLOURS.minimapBlock;
    g.fillRect(bx, by, bw, bh);
  }

  g.fillStyle = 'rgba(72, 56, 46, 0.36)';
  for (let i = 0; i < city.buildings.length; i += 1) {
    const b = city.buildings[i];
    g.fillRect(ox + b.x * scale + 0.6, oy + b.y * scale + 0.6, Math.max(1, b.w * scale - 1.2), Math.max(1, b.h * scale - 1.2));
  }

  // Promenade seam and the map border.
  g.fillStyle = COLOURS.sidewalk;
  g.fillRect(ox, oy + city.gridHeight * scale, city.gridWidth * scale, Math.max(1.5, 36 * scale));
  g.strokeStyle = 'rgba(255, 219, 160, 0.35)';
  g.lineWidth = 1;
  g.strokeRect(mapX + 0.5, mapY + 0.5, mapW - 1, mapH - 1);

  minimapCache = { city, canvas, scale, ox, oy };
  return minimapCache;
}

function drawMinimap(ctx, W, world) {
  const map = buildMinimap(world.city);
  const x = W - MINI_PAD - MINI.width;
  const y = 22;

  panel(ctx, x, y, MINI.width, MINI.height, 14, 'rgba(22, 19, 26, 0.86)');
  ctx.drawImage(map.canvas, x, y, MINI.width, MINI.height);

  label(ctx, 'SUNSET PALMS', x + 14, y + 20, 11, COLOURS.gold, '800');
  label(ctx, 'PALM COUNTY', x + MINI.width - 14, y + 20, 9, COLOURS.muted, '600', 'right');

  const px = (bx) => x + map.ox + bx * map.scale;
  const py = (by) => y + map.oy + by * map.scale;
  const insideMap = (bx, by) => bx >= x + MINI.x + 4 && bx <= x + MINI.x + MINI.w - 4 && by >= y + MINI.y + 4 && by <= y + MINI.y + MINI.h - 4;

  // Packages: the collectibles, small and gold so they read against the blocks.
  const packs = world.activities?.packages ?? [];
  for (let i = 0; i < packs.length; i += 1) {
    if (packs[i].taken) continue;
    const bx = px(packs[i].x);
    const by = py(packs[i].y);
    if (!insideMap(bx, by)) continue;
    ctx.fillStyle = COLOURS.package;
    ctx.beginPath();
    ctx.arc(bx, by, 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(60, 42, 18, 0.8)';
    ctx.lineWidth = 0.8;
    ctx.stroke();
  }

  // Side jobs: race flags, the delivery crate, the rampage.
  const markers = activityMarkers(world);
  for (let i = 0; i < markers.length; i += 1) {
    const marker = markers[i];
    const bx = px(marker.x);
    const by = py(marker.y);
    if (!insideMap(bx, by)) continue;
    const colour = marker.kind === 'race' ? COLOURS.race : marker.kind === 'delivery' ? COLOURS.green : COLOURS.thug;
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.arc(bx, by, 3.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(18, 14, 20, 0.85)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // The live race checkpoint.
  const run = world.activities?.race ?? null;
  if (run !== null) {
    const cp = run.race.checkpoints[run.next];
    if (cp !== undefined) {
      const bx = px(cp.x);
      const by = py(cp.y);
      if (insideMap(bx, by)) {
        ctx.strokeStyle = COLOURS.race;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(bx, by, 4.5, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  // Mission target, or the giver waiting on the next job.
  const target = world.mission.active ? world.mission.target : world.missionStart;
  if (target !== null && target !== undefined) {
    const bx = px(target.x);
    const by = py(target.y);
    if (insideMap(bx, by)) {
      const pulse = 0.75 + 0.25 * Math.sin(world.time * 4);
      ctx.save();
      ctx.translate(bx, by);
      ctx.rotate(Math.PI / 4);
      ctx.globalAlpha = pulse;
      ctx.fillStyle = COLOURS.mission;
      ctx.fillRect(-4, -4, 8, 8);
      ctx.strokeStyle = 'rgba(32, 24, 14, 0.9)';
      ctx.lineWidth = 1.2;
      ctx.strokeRect(-4, -4, 8, 8);
      ctx.restore();
      ctx.globalAlpha = 1;
    }
  }

  // Police cruisers: pulsing red dots with a pale ring, the loudest thing on the map.
  const pulse = 0.5 + 0.5 * Math.sin(world.time * 9);
  for (let i = 0; i < world.police.units.length; i += 1) {
    const unit = world.police.units[i];
    const bx = px(unit.x);
    const by = py(unit.y);
    if (!insideMap(bx, by)) continue;
    ctx.fillStyle = `rgba(255, 90, 77, ${0.65 + pulse * 0.35})`;
    ctx.beginPath();
    ctx.arc(bx, by, 4 + pulse * 1.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 236, 220, 0.9)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }
  for (let i = 0; i < world.officers.length; i += 1) {
    const officer = world.officers[i];
    if (officer.down || officer.hp <= 0) continue;
    const bx = px(officer.x);
    const by = py(officer.y);
    if (!insideMap(bx, by)) continue;
    ctx.fillStyle = officer.thug ? 'rgba(226, 104, 80, 0.9)' : 'rgba(255, 122, 104, 0.9)';
    ctx.beginPath();
    ctx.arc(bx, by, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  // The player: an arrow on foot, a car when driving, with a view cone.
  const player = world.player;
  const bx = Math.max(x + MINI.x + 5, Math.min(x + MINI.x + MINI.w - 5, px(player.x)));
  const by = Math.max(y + MINI.y + 5, Math.min(y + MINI.y + MINI.h - 5, py(player.y)));
  ctx.save();
  ctx.translate(bx, by);
  ctx.rotate(player.angle);
  ctx.fillStyle = 'rgba(255, 210, 122, 0.14)';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 0, 22, -0.42, 0.42);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = COLOURS.gold;
  ctx.strokeStyle = 'rgba(40, 28, 20, 0.9)';
  ctx.lineWidth = 1.3;
  if (player.mode === 'car' && player.car !== null) {
    ctx.beginPath();
    ctx.roundRect(-4.5, -2.6, 9, 5.2, 1.5);
    ctx.fill();
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(8, 0);
    ctx.lineTo(-5, 5);
    ctx.lineTo(-2.4, 0);
    ctx.lineTo(-5, -5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();

  label(ctx, 'N', x + MINI.x + MINI.w - 8, y + MINI.y + 12, 9, 'rgba(255, 244, 223, 0.55)', '700', 'center');
}

function drawMoney(ctx, world) {
  panel(ctx, 24, 22, 244, 66, 14);
  ctx.fillStyle = COLOURS.goldDeep;
  ctx.beginPath();
  ctx.roundRect(24, 22, 5, 66, [14, 0, 0, 14]);
  ctx.fill();
  label(ctx, 'CASH ON HAND', 42, 43, 10, COLOURS.muted, '700');
  label(ctx, formatMoney(world.player.money), 42, 76, 30, COLOURS.text, '800');
}

function drawClock(ctx, W, world) {
  const x = W / 2 - 78;
  const y = 22;
  panel(ctx, x, y, 156, 52, 14);
  ctx.fillStyle = COLOURS.gold;
  ctx.beginPath();
  ctx.arc(x + 24, y + 27, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255, 236, 186, 0.28)';
  ctx.beginPath();
  ctx.arc(x + 24, y + 27, 14, 0, Math.PI * 2);
  ctx.fill();
  label(ctx, formatClock(world.clock), x + 42, y + 30, 20, COLOURS.text, '800');
  label(ctx, dayPhase(world.clock), x + 42, y + 44, 9, COLOURS.muted, '700');
}

/** A five-point star, used for the wanted level. */
function starPath(ctx, cx, cy, r, inner = 0.44) {
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    const radius = i % 2 === 0 ? r : r * inner;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function drawWanted(ctx, W, world) {
  const wanted = world.police.wanted;
  const w = 206;
  const h = 46;
  const x = W - MINI_PAD - w;
  const y = 226;
  panel(ctx, x, y, w, h, 12, 'rgba(22, 19, 26, 0.86)');

  ctx.fillStyle = wanted > 0 ? COLOURS.red : 'rgba(255, 255, 255, 0.10)';
  ctx.beginPath();
  ctx.roundRect(x, y, 4, h, [12, 0, 0, 12]);
  ctx.fill();

  label(ctx, 'WANTED', x + 14, y + 19, 9, wanted > 0 ? COLOURS.gold : COLOURS.muted, '800');
  const cy = y + 26;
  for (let i = 0; i < 5; i += 1) {
    const cx = x + 78 + i * 25;
    const active = i < wanted;
    if (active) {
      const glow = 0.18 + 0.12 * Math.sin(world.time * 6 + i * 1.2);
      ctx.fillStyle = `rgba(255, 90, 77, ${glow.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(cx, cy, 15, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = COLOURS.gold;
      starPath(ctx, cx, cy, 10.5);
      ctx.fill();
      ctx.strokeStyle = 'rgba(180, 84, 40, 0.9)';
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
      starPath(ctx, cx - 1, cy - 1.5, 4.6);
      ctx.fill();
    } else {
      ctx.fillStyle = 'rgba(255, 244, 223, 0.10)';
      starPath(ctx, cx, cy, 10.5);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 244, 223, 0.22)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
  }
}

function wrapLabel(ctx, text, x, y, maxWidth, lineHeight, maxLines, size, colour, weight) {
  ctx.font = font(size, weight);
  ctx.fillStyle = colour;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const words = text.split(' ');
  let line = '';
  let drawn = 0;
  for (let i = 0; i < words.length; i += 1) {
    const test = line === '' ? words[i] : `${line} ${words[i]}`;
    if (ctx.measureText(test).width > maxWidth && line !== '') {
      ctx.fillText(line, x, y + drawn * lineHeight);
      drawn += 1;
      line = words[i];
      if (drawn >= maxLines) return;
    } else {
      line = test;
    }
  }
  if (line !== '' && drawn < maxLines) ctx.fillText(line, x, y + drawn * lineHeight);
}

function drawMission(ctx, world) {
  const mission = world.mission;
  const x = 24;
  const y = 100;
  const w = 336;
  const h = mission.timeLimit > 0 ? 112 : 96;
  panel(ctx, x, y, w, h, 14);
  ctx.fillStyle = mission.active ? COLOURS.mission : COLOURS.missionDeep;
  ctx.beginPath();
  ctx.roundRect(x, y, 5, h, [14, 0, 0, 14]);
  ctx.fill();

  const jobNo = Math.min((world.missions?.index ?? 0) + 1, world.missions?.chain?.length ?? 1);
  const jobTotal = world.missions?.chain?.length ?? 1;
  const header = mission.active
    ? mission.steps > 1
      ? `MISSION ${jobNo} / ${jobTotal}  ·  STEP ${mission.step} / ${mission.steps}`
      : `MISSION ${jobNo} / ${jobTotal}`
    : mission.giver === ''
      ? 'STORY COMPLETE'
      : 'NEXT JOB';
  label(ctx, header, x + 16, y + 21, 9, COLOURS.mission, '800');
  const dist = mission.target === null || mission.target === undefined ? '' : `${Math.max(0, Math.round(mission.distance / 10))} m`;
  label(ctx, dist, x + w - 14, y + 21, 11, COLOURS.gold, '800', 'right');
  label(ctx, mission.title, x + 16, y + 41, 16, COLOURS.text, '800');
  if (mission.giver !== '') label(ctx, mission.giver, x + w - 14, y + 41, 9, COLOURS.muted, '700', 'right');
  wrapLabel(ctx, mission.objective, x + 16, y + 60, w - 32, 13, 2, 10, COLOURS.muted, '600');

  if (mission.timeLimit > 0) {
    const fraction = Math.max(0, Math.min(1, mission.timer / mission.timeLimit));
    ctx.fillStyle = 'rgba(255, 255, 255, 0.10)';
    ctx.beginPath();
    ctx.roundRect(x + 16, y + 88, w - 32, 8, 4);
    ctx.fill();
    ctx.fillStyle = fraction < 0.25 ? COLOURS.red : COLOURS.mission;
    ctx.beginPath();
    ctx.roundRect(x + 16, y + 88, Math.max(4, (w - 32) * fraction), 8, 4);
    ctx.fill();
    label(ctx, formatTime(mission.timer), x + w - 16, y + 108, 10, fraction < 0.25 ? COLOURS.red : COLOURS.gold, '800', 'right');
    label(ctx, 'TIME LEFT', x + 16, y + 108, 9, COLOURS.muted, '700');
  }

  // Step pips: how far through the job this objective is.
  if (mission.active && mission.steps > 1 && mission.timeLimit <= 0) {
    for (let i = 0; i < mission.steps; i += 1) {
      const px = x + 20 + i * 14;
      ctx.fillStyle = i < mission.step ? COLOURS.mission : 'rgba(255, 244, 223, 0.18)';
      ctx.beginPath();
      ctx.arc(px, y + h - 10, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/** The side job strip: race progress, delivery clock or rampage kill count. */
function drawActivity(ctx, H, world) {
  const acts = world.activities;
  if (acts === undefined) return;
  let title = '';
  let line = '';
  let fraction = -1;
  if (acts.race !== null) {
    const run = acts.race;
    title = `RACE · ${run.race.name}`;
    line = `CHECKPOINT ${Math.min(run.next + 1, run.race.checkpoints.length)} / ${run.race.checkpoints.length}   ·   ${formatTime(run.timeLeft)}`;
    fraction = run.timeLeft / run.race.timeLimit;
  } else if (acts.delivery.active) {
    title = 'DELIVERY RUN';
    line = `GET THE CRATE TO THE PIER   ·   ${formatTime(acts.delivery.timer)}`;
    fraction = acts.delivery.timer / acts.delivery.timeLimit;
  } else if (acts.rampage.active) {
    title = 'RAMPAGE';
    line = `CREW DOWN ${acts.rampage.kills} / ${acts.rampage.needed}   ·   ${formatTime(acts.rampage.timer)}`;
    fraction = acts.rampage.timer / acts.rampage.timeLimit;
  }
  if (title === '') return;

  const x = 24;
  const y = H - 206;
  const w = 300;
  const h = 74;
  panel(ctx, x, y, w, h, 14, 'rgba(22, 19, 26, 0.9)');
  ctx.fillStyle = acts.rampage.active ? COLOURS.thug : acts.race !== null ? COLOURS.race : COLOURS.green;
  ctx.beginPath();
  ctx.roundRect(x, y, 4, h, [14, 0, 0, 14]);
  ctx.fill();
  label(ctx, title, x + 16, y + 22, 10, COLOURS.gold, '800');
  label(ctx, line, x + 16, y + 42, 11, COLOURS.text, '700');
  if (fraction >= 0) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.10)';
    ctx.beginPath();
    ctx.roundRect(x + 16, y + 54, w - 32, 6, 3);
    ctx.fill();
    ctx.fillStyle = fraction < 0.22 ? COLOURS.red : COLOURS.mission;
    ctx.beginPath();
    ctx.roundRect(x + 16, y + 54, Math.max(4, (w - 32) * Math.max(0, Math.min(1, fraction))), 6, 3);
    ctx.fill();
  }
}

function drawSpeedometer(ctx, W, H, world) {
  const player = world.player;
  if (player.mode !== 'car' || player.car === null) return;
  const car = player.car;
  const w = 244;
  const h = 86;
  const x = W - MINI_PAD - w;
  const y = H - 152;
  panel(ctx, x, y, w, h, 14);

  label(ctx, `DRIVING · ${car.kind.toUpperCase()}`, x + 16, y + 21, 9, COLOURS.muted, '800');
  const kmh = Math.round(Math.abs(car.speed) * 0.19);
  label(ctx, String(kmh), x + 16, y + 66, 38, COLOURS.text, '900');
  label(ctx, 'KM/H', x + 112, y + 64, 11, COLOURS.muted, '800');

  const fraction = Math.min(1, kmh / 130);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.10)';
  ctx.beginPath();
  ctx.roundRect(x + 16, y + 72, w - 32, 6, 3);
  ctx.fill();
  ctx.fillStyle = fraction > 0.72 ? COLOURS.red : fraction > 0.45 ? COLOURS.goldDeep : COLOURS.green;
  ctx.beginPath();
  ctx.roundRect(x + 16, y + 72, Math.max(4, (w - 32) * fraction), 6, 3);
  ctx.fill();

  const gear = car.speed < -6 ? 'R' : Math.abs(car.speed) > 4 ? 'D' : 'N';
  ctx.fillStyle = 'rgba(255, 210, 122, 0.16)';
  ctx.beginPath();
  ctx.roundRect(x + w - 48, y + 28, 32, 32, 8);
  ctx.fill();
  ctx.strokeStyle = COLOURS.hudEdge;
  ctx.lineWidth = 1;
  ctx.stroke();
  label(ctx, gear, x + w - 32, y + 51, 18, COLOURS.gold, '900', 'center');
}

function drawHealth(ctx, H, world) {
  const x = 24;
  const y = H - 96;
  const w = 276;
  const h = 72;
  panel(ctx, x, y, w, h, 14);
  const player = world.player;
  const fraction = Math.max(0, Math.min(1, player.hp / player.maxHp));
  label(ctx, 'HEALTH', x + 16, y + 24, 10, COLOURS.muted, '700');
  label(ctx, `${Math.round(player.hp)}`, x + w - 16, y + 24, 14, fraction < 0.3 ? COLOURS.red : COLOURS.text, '800', 'right');

  ctx.fillStyle = 'rgba(255, 255, 255, 0.10)';
  ctx.beginPath();
  ctx.roundRect(x + 16, y + 36, w - 32, 14, 7);
  ctx.fill();
  ctx.fillStyle = fraction > 0.55 ? COLOURS.green : fraction > 0.28 ? COLOURS.goldDeep : COLOURS.red;
  ctx.beginPath();
  ctx.roundRect(x + 16, y + 36, Math.max(4, (w - 32) * fraction), 14, 7);
  ctx.fill();
  ctx.strokeStyle = 'rgba(24, 18, 22, 0.45)';
  ctx.lineWidth = 1;
  for (let i = 1; i < 5; i += 1) {
    const tick = x + 16 + ((w - 32) * i) / 5;
    ctx.beginPath();
    ctx.moveTo(tick, y + 37);
    ctx.lineTo(tick, y + 49);
    ctx.stroke();
  }
  const mode = player.mode === 'car' && player.car !== null
    ? `VEHICLE ${Math.max(0, Math.round((player.car.hp / player.car.maxHp) * 100))}%`
    : 'ON FOOT';
  label(ctx, mode, x + 16, y + 64, 9, COLOURS.muted, '700');
}

function drawHint(ctx, W, H, world) {
  const driving = world.player.mode === 'car';
  const text = driving
    ? 'WASD DRIVE  ·  SPACE HANDBRAKE  ·  E EXIT  ·  TAB MAP  ·  P PAUSE'
    : 'WASD MOVE  ·  SHIFT RUN  ·  MOUSE FIRE  ·  E CAR  ·  TAB MAP  ·  P PAUSE';
  const w = driving ? 486 : 496;
  const x = W - MINI_PAD - w;
  const y = H - 50;
  panel(ctx, x, y, w, 30, 10, 'rgba(22, 19, 26, 0.72)');
  const muted = world.audio !== null && world.audio !== undefined && world.audio.muted;
  label(ctx, muted ? `${text}  ·  MUTED` : text, x + w / 2, y + 19, 10, muted ? COLOURS.gold : COLOURS.muted, '700', 'center');
}

function drawMessage(ctx, W, H, world) {
  if (world.messageTimer <= 0 || world.message === '') return;
  const alpha = Math.min(1, world.messageTimer);
  ctx.globalAlpha = alpha;
  const w = Math.min(520, 40 + world.message.length * 9);
  panel(ctx, W / 2 - w / 2, H - 118, w, 34, 12, 'rgba(22, 19, 26, 0.86)');
  label(ctx, world.message, W / 2, H - 96, 13, COLOURS.gold, '800', 'center');
  ctx.globalAlpha = 1;
}

/** The toast column: mission updates, payouts, packages and failures, down the left edge. */
function drawToasts(ctx, W, H, world) {
  const list = world.notifications;
  if (list === undefined || list.length === 0) return;
  let y = 224;
  for (let i = 0; i < list.length; i += 1) {
    const item = list[i];
    const alpha = Math.min(1, item.timer * 3.2);
    const w = Math.min(440, 128 + Math.max(item.text.length, Math.min(item.sub.length, 58)) * 5.4);
    const h = item.sub === '' ? 44 : item.sub.length > 56 ? 68 : 58;
    ctx.globalAlpha = Math.max(0.05, alpha);
    panel(ctx, 24, y, w, h, 12, COLOURS.toastBg);
    const accent = item.kind === 'money' ? COLOURS.green : item.kind === 'fail' ? COLOURS.fail : item.kind === 'mission' ? COLOURS.mission : COLOURS.gold;
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.roundRect(24, y, 4, h, [12, 0, 0, 12]);
    ctx.fill();
    label(ctx, item.text, 42, y + 24, 13, accent, '800');
    if (item.sub !== '') wrapLabel(ctx, item.sub, 42, y + 41, w - 36, 13, 2, 10, COLOURS.muted, '600');
    y += h + 8;
  }
  ctx.globalAlpha = 1;
}

/** A gold chevron at the frame edge pointing at the objective, plus its distance. */
function drawWaypoint(ctx, W, H, world) {
  const mission = world.mission;
  const target = mission.active ? mission.target : world.missionStart;
  if (target === null || target === undefined) return;
  const camera = world.camera;
  const sx = W / 2 + (target.x - camera.x) * camera.zoom;
  const sy = H / 2 + (target.y - camera.y) * camera.zoom;
  const metres = Math.max(0, Math.round(mission.distance / 10));
  const marginX = 84;
  const top = 96;
  const bottom = H - 208;
  const inside = sx > marginX && sx < W - marginX && sy > top && sy < bottom;

  if (inside) {
    if (metres > 26) {
      ctx.globalAlpha = 0.92;
      label(ctx, `${metres} m`, sx, sy - 44, 10, COLOURS.mission, '800', 'center');
      ctx.globalAlpha = 1;
    }
    return;
  }

  const cx = Math.max(marginX, Math.min(W - marginX, sx));
  const cy = Math.max(top, Math.min(bottom, sy));
  const angle = Math.atan2(sy - H / 2, sx - W / 2);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.fillStyle = 'rgba(20, 16, 22, 0.72)';
  ctx.beginPath();
  ctx.arc(0, 0, 21, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 211, 77, 0.55)';
  ctx.lineWidth = 1.4;
  ctx.stroke();
  ctx.fillStyle = COLOURS.mission;
  ctx.beginPath();
  ctx.moveTo(13, 0);
  ctx.lineTo(-4, 8);
  ctx.lineTo(0, 0);
  ctx.lineTo(-4, -8);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  label(ctx, `${metres} m`, cx, cy + 34, 10, COLOURS.mission, '800', 'center');
}

/** Paint the whole overlay for the world's current phase. */
export function drawHud(ctx, W, H, world) {
  ctx.save();
  ctx.textBaseline = 'alphabetic';

  if (world.phase === 'title' || world.phase === 'over' || world.phase === 'map' || world.phase === 'controls') {
    drawMenu(ctx, W, H, world);
    ctx.restore();
    return;
  }

  drawMoney(ctx, world);
  drawClock(ctx, W, world);
  drawMinimap(ctx, W, world);
  drawWanted(ctx, W, world);
  drawMission(ctx, world);
  drawActivity(ctx, H, world);
  drawHealth(ctx, H, world);
  drawSpeedometer(ctx, W, H, world);
  drawWaypoint(ctx, W, H, world);
  if (world.phase === 'play') {
    drawHint(ctx, W, H, world);
    drawMessage(ctx, W, H, world);
  }
  drawToasts(ctx, W, H, world);

  if (world.phase === 'pause') drawMenu(ctx, W, H, world);
  ctx.restore();
}
