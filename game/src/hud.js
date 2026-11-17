// The overlay: wallet, clock, health, control hint and a cached minimap that stays legible when
// the whole frame is shrunk to a thumbnail. The minimap base is painted once per city into an
// offscreen canvas; each frame only the player arrow and any blips are drawn on top of it.

import { CITY, COLOURS, FONT } from './config.js';

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

  g.fillStyle = 'rgba(70, 54, 44, 0.55)';
  for (let i = 0; i < city.buildings.length; i += 1) {
    const b = city.buildings[i];
    g.fillRect(ox + b.x * scale, oy + b.y * scale, Math.max(1, b.w * scale), Math.max(1, b.h * scale));
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

  // The camera's view cone, then the player's arrow.
  const player = world.player;
  const px = Math.max(x + MINI.x + 4, Math.min(x + MINI.x + MINI.w - 4, x + map.ox + player.x * map.scale));
  const py = Math.max(y + MINI.y + 4, Math.min(y + MINI.y + MINI.h - 4, y + map.oy + player.y * map.scale));

  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(player.angle);
  ctx.fillStyle = 'rgba(255, 210, 122, 0.12)';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 0, 20, -0.42, 0.42);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = COLOURS.gold;
  ctx.strokeStyle = 'rgba(40, 28, 20, 0.9)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(8, 0);
  ctx.lineTo(-5, 5);
  ctx.lineTo(-2.4, 0);
  ctx.lineTo(-5, -5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  if (world.blips.length > 0) {
    for (let i = 0; i < world.blips.length; i += 1) {
      const blip = world.blips[i];
      const bx = x + map.ox + blip.x * map.scale;
      const by = y + map.oy + blip.y * map.scale;
      if (bx < x + MINI.x || bx > x + MINI.x + MINI.w || by < y + MINI.y || by > y + MINI.y + MINI.h) continue;
      ctx.fillStyle = blip.colour ?? COLOURS.police;
      ctx.beginPath();
      ctx.arc(bx, by, 2.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(20, 16, 20, 0.8)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  // A compass tick in the map corner.
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
  label(ctx, 'ON FOOT', x + 16, y + 64, 9, COLOURS.muted, '700');
}

function drawHint(ctx, W, H) {
  const w = 386;
  const x = W - MINI_PAD - w;
  const y = H - 50;
  panel(ctx, x, y, w, 30, 10, 'rgba(22, 19, 26, 0.70)');
  label(ctx, 'WASD MOVE   ·   SHIFT RUN   ·   MOUSE AIM   ·   P PAUSE', x + w / 2, y + 19, 10, COLOURS.muted, '700', 'center');
}

function drawTitle(ctx, W, H) {
  const overlay = ctx.createLinearGradient(0, 0, 0, H);
  overlay.addColorStop(0, 'rgba(18, 14, 22, 0.62)');
  overlay.addColorStop(0.55, 'rgba(18, 14, 22, 0.32)');
  overlay.addColorStop(1, 'rgba(18, 14, 22, 0.70)');
  ctx.fillStyle = overlay;
  ctx.fillRect(0, 0, W, H);

  const centre = W / 2;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  ctx.font = font(15, '800');
  ctx.fillStyle = COLOURS.gold;
  ctx.fillText('A N   O P E N - C O A S T   C R I M E   S T O R Y', centre, 214);

  ctx.font = font(82, '900');
  ctx.fillStyle = 'rgba(28, 18, 20, 0.65)';
  ctx.fillText('SUNSET PALMS', centre + 4, 300);
  ctx.fillStyle = COLOURS.text;
  ctx.fillText('SUNSET PALMS', centre, 296);

  ctx.fillStyle = COLOURS.goldDeep;
  ctx.fillRect(centre - 150, 318, 300, 3);

  ctx.font = font(17, '600');
  ctx.fillStyle = COLOURS.muted;
  ctx.fillText('Palm trees, long shadows and a city with a price on everything.', centre, 352);

  const pulse = 0.9 + 0.1 * Math.sin(performance.now() * 0.0035);
  ctx.globalAlpha = pulse;
  panel(ctx, centre - 190, 402, 380, 52, 14, 'rgba(28, 23, 32, 0.85)');
  label(ctx, 'PRESS SPACE OR CLICK TO BEGIN', centre, 435, 15, COLOURS.gold, '800', 'center');
  ctx.globalAlpha = 1;

  label(ctx, 'WASD / ARROWS  MOVE      SHIFT  RUN      MOUSE  AIM      P  PAUSE', centre, 494, 11, COLOURS.muted, '700', 'center');
}

function drawPaused(ctx, W, H) {
  ctx.fillStyle = 'rgba(16, 12, 20, 0.58)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.font = font(64, '900');
  ctx.fillStyle = COLOURS.text;
  ctx.fillText('PAUSED', W / 2, H / 2 - 10);
  ctx.font = font(13, '700');
  ctx.fillStyle = COLOURS.gold;
  ctx.fillText('PRESS P OR ESC TO RESUME', W / 2, H / 2 + 34);
}

function drawOver(ctx, W, H, world) {
  ctx.fillStyle = 'rgba(28, 10, 12, 0.62)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.font = font(68, '900');
  ctx.fillStyle = COLOURS.red;
  ctx.fillText('FLATLINE', W / 2, H / 2 - 18);
  ctx.font = font(15, '700');
  ctx.fillStyle = COLOURS.text;
  ctx.fillText(`THE CITY KEPT $${Math.round(world.player.money).toLocaleString('en-US')}`, W / 2, H / 2 + 24);
  ctx.fillStyle = COLOURS.gold;
  ctx.fillText('PRESS SPACE TO GET UP AGAIN', W / 2, H / 2 + 58);
}

/** Paint the whole overlay for the world's current phase. */
export function drawHud(ctx, W, H, world) {
  ctx.save();
  ctx.textBaseline = 'alphabetic';
  if (world.phase === 'title') {
    drawTitle(ctx, W, H);
    ctx.restore();
    return;
  }

  drawMoney(ctx, world);
  drawClock(ctx, W, world);
  drawMinimap(ctx, W, world);
  drawHealth(ctx, H, world);
  drawHint(ctx, W, H);

  if (world.phase === 'pause' || world.phase === 'paused') drawPaused(ctx, W, H);
  else if (world.phase === 'over') drawOver(ctx, W, H, world);
  ctx.restore();
}
