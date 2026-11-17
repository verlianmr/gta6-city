// Every screen outside play: title, pause, controls sheet, full city map and the death results,
// driven by both arrow keys/Enter and the mouse. Exports menuItems, moveMenu, setMenuHover,
// menuChoice, drawMenu, menuRects and MENU_MAP; layout is cached so clicks match the drawing.

import { CITY, COLOURS, FONT } from './config.js';
import { activityMarkers, activitySummary } from './activities.js';
import { saveSummary } from './save.js';

const MAP = { w: 980, h: 496 };
const ROW = { w: 470, h: 54, gap: 12 };

let mapCache = { city: null, canvas: null, scale: 1, ox: 0, oy: 0 };
let rowRects = [];

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

function text(ctx, value, x, y, size, colour, weight = '600', align = 'left') {
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

function wrap(ctx, value, x, y, maxWidth, lineHeight, maxLines, size, colour, weight = '600') {
  ctx.font = font(size, weight);
  ctx.fillStyle = colour;
  ctx.textAlign = 'left';
  const words = value.split(' ');
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

/** The rows of the current screen, in draw order. */
export function menuItems(world) {
  const save = world.menu?.save ?? null;
  switch (world.phase) {
    case 'title': {
      const items = [];
      if (save !== null) items.push({ id: 'continue', label: 'CONTINUE', hint: saveSummary(save) });
      items.push({ id: 'new', label: 'NEW GAME', hint: save === null ? 'Start the story in Sunset Palms.' : 'Wipe the save and start the story again.' });
      items.push({ id: 'controls', label: 'CONTROLS', hint: 'Keys, mouse and what they do.' });
      return items;
    }
    case 'pause':
      return [
        { id: 'resume', label: 'RESUME', hint: 'Back to the street.' },
        { id: 'restart', label: 'RESTART RUN', hint: 'Reset the story, the money and the city.' },
        { id: 'mute', label: world.audio?.muted ? 'SOUND: OFF' : 'SOUND: ON', hint: 'Toggle the synth audio (M).' },
        { id: 'controls', label: 'CONTROLS', hint: 'Keys, mouse and what they do.' },
        { id: 'map', label: 'CITY MAP', hint: 'Blips, the mission marker and the collectibles.' },
        { id: 'quit', label: 'QUIT TO TITLE', hint: 'Save and go back to the title screen.' },
      ];
    case 'map':
      return [{ id: 'close', label: 'BACK TO THE STREET', hint: 'Tab or Escape also closes the map.' }];
    case 'controls':
      return [{ id: 'back', label: 'BACK', hint: 'Escape also goes back.' }];
    case 'over': {
      const active = world.missions?.active ?? null;
      return [
        {
          id: 'retry',
          label: active === null ? 'RESPAWN AT THE PLAZA' : 'RETRY FROM CHECKPOINT',
          hint: active === null ? 'The city does not care. Get up.' : active.def.title,
        },
        { id: 'title', label: 'QUIT TO TITLE', hint: 'Keep the money you have already banked.' },
      ];
    }
    default:
      return [];
  }
}

/** Keyboard selection, wrapping at both ends. */
export function moveMenu(world, delta) {
  const items = menuItems(world);
  if (items.length === 0) return;
  world.menu.index = (world.menu.index + delta + items.length) % items.length;
  world.menu.hover = -1;
}

/** Highlight whatever row the pointer is over; returns the row index or -1. */
export function setMenuHover(world, nx, ny) {
  const x = nx * 1280;
  const y = ny * 720;
  world.menu.hover = -1;
  for (let i = 0; i < rowRects.length; i += 1) {
    const r = rowRects[i];
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
      world.menu.hover = i;
      return i;
    }
  }
  return -1;
}

/** Which row a confirm press means: the hovered row when the pointer is on one, else the selection. */
export function menuChoice(world) {
  const items = menuItems(world);
  if (items.length === 0) return null;
  const index = world.menu.hover >= 0 && world.menu.hover < items.length ? world.menu.hover : world.menu.index;
  world.menu.index = index;
  return items[index].id;
}

function drawRows(ctx, W, H, world, items, top) {
  rowRects = [];
  const x = W / 2 - ROW.w / 2;
  for (let i = 0; i < items.length; i += 1) {
    const y = top + i * (ROW.h + ROW.gap);
    const active = i === world.menu.index || i === world.menu.hover;
    rowRects.push({ x, y, w: ROW.w, h: ROW.h });
    panel(ctx, x, y, ROW.w, ROW.h, 12, active ? 'rgba(64, 50, 34, 0.94)' : 'rgba(22, 19, 26, 0.82)');
    ctx.fillStyle = active ? COLOURS.gold : 'rgba(255, 210, 122, 0.35)';
    ctx.beginPath();
    ctx.roundRect(x, y, 4, ROW.h, [12, 0, 0, 12]);
    ctx.fill();
    text(ctx, items[i].label, x + 22, y + 24, 16, active ? COLOURS.text : COLOURS.muted, '800');
    text(ctx, items[i].hint, x + 22, y + 42, 10, active ? COLOURS.gold : 'rgba(195, 180, 155, 0.72)', '600');
    text(ctx, '›', x + ROW.w - 20, y + 34, 20, active ? COLOURS.gold : 'rgba(255, 244, 223, 0.18)', '900', 'right');
  }
}

function drawBackdrop(ctx, W, H, alpha = 0.72) {
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, `rgba(14, 11, 18, ${alpha})`);
  grad.addColorStop(0.55, `rgba(20, 15, 24, ${alpha * 0.72})`);
  grad.addColorStop(1, `rgba(14, 11, 18, ${alpha})`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
}

function drawTitle(ctx, W, H, world) {
  drawBackdrop(ctx, W, H, 0.66);

  // A low sun behind the wordmark.
  const glow = ctx.createRadialGradient(W / 2, 250, 20, W / 2, 250, 330);
  glow.addColorStop(0, 'rgba(255, 190, 96, 0.30)');
  glow.addColorStop(0.55, 'rgba(233, 120, 74, 0.12)');
  glow.addColorStop(1, 'rgba(233, 120, 74, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  text(ctx, 'A   S U N - S O A K E N   C R I M E   S T O R Y', W / 2, 150, 13, COLOURS.gold, '800', 'center');
  ctx.textAlign = 'center';
  ctx.font = font(76, '900');
  ctx.fillStyle = 'rgba(30, 16, 18, 0.62)';
  ctx.fillText('SUNSET PALMS', W / 2 + 4, 240);
  ctx.fillStyle = COLOURS.text;
  ctx.fillText('SUNSET PALMS', W / 2, 236);
  ctx.fillStyle = COLOURS.goldDeep;
  ctx.fillRect(W / 2 - 176, 258, 352, 3);
  text(ctx, 'Nico Vela came for the sun. The city had other plans.', W / 2, 288, 16, COLOURS.muted, '600', 'center');

  const items = menuItems(world);
  drawRows(ctx, W, H, world, items, 322);

  const last = 322 + items.length * (ROW.h + ROW.gap);
  text(ctx, 'UP / DOWN CHOOSE   ·   ENTER OR CLICK SELECT   ·   TAB MAP   ·   M MUTE', W / 2, Math.min(H - 34, last + 26), 11, 'rgba(195, 180, 155, 0.85)', '700', 'center');
  if (world.menu?.save !== null && world.menu?.save !== undefined) {
    text(ctx, `SAVED RUN · ${saveSummary(world.menu.save)}`, W / 2, H - 22, 10, 'rgba(255, 210, 122, 0.6)', '700', 'center');
  }
}

function drawPause(ctx, W, H, world) {
  drawBackdrop(ctx, W, H, 0.62);
  text(ctx, 'PAUSED', W / 2, 150, 58, COLOURS.text, '900', 'center');
  text(ctx, 'SUNSET PALMS · PALM COUNTY', W / 2, 178, 11, COLOURS.gold, '800', 'center');
  drawRows(ctx, W, H, world, menuItems(world), 214);
  text(ctx, 'P / ESC RESUME   ·   UP / DOWN CHOOSE   ·   ENTER SELECT', W / 2, H - 30, 11, COLOURS.muted, '700', 'center');
}

const CONTROL_ROWS = [
  ['W A S D  /  ARROWS', 'Move on foot, drive a car'],
  ['SHIFT', 'Sprint'],
  ['E', 'Get into a car / step out'],
  ['MOUSE', 'Aim, and steer the camera'],
  ['LEFT CLICK / SPACE', 'Fire the pistol on foot'],
  ['SPACE (IN A CAR)', 'Handbrake and drift'],
  ['TAB', 'Open and close the city map'],
  ['P / ESC', 'Pause menu'],
  ['M', 'Mute the audio'],
  ['MOUSE WHEEL', 'Zoom the camera'],
  ['ENTER / CLICK', 'Confirm a menu row'],
];

function drawControls(ctx, W, H, world) {
  drawBackdrop(ctx, W, H, 0.82);
  text(ctx, 'CONTROLS', W / 2, 112, 40, COLOURS.text, '900', 'center');
  text(ctx, 'KEYBOARD AND MOUSE', W / 2, 138, 11, COLOURS.gold, '800', 'center');

  const x = W / 2 - 420;
  const top = 176;
  panel(ctx, x - 22, top - 34, 884, CONTROL_ROWS.length * 34 + 40, 16, 'rgba(20, 17, 25, 0.9)');
  for (let i = 0; i < CONTROL_ROWS.length; i += 1) {
    const y = top + i * 34;
    if (i % 2 === 0) {
      ctx.fillStyle = 'rgba(255, 244, 223, 0.035)';
      ctx.fillRect(x - 12, y - 20, 864, 30);
    }
    text(ctx, CONTROL_ROWS[i][0], x, y, 13, COLOURS.gold, '800');
    text(ctx, CONTROL_ROWS[i][1], x + 330, y, 13, COLOURS.text, '600');
  }
  drawRows(ctx, W, H, world, menuItems(world), top + CONTROL_ROWS.length * 34 + 18);
}

function buildMap(city) {
  if (mapCache.city === city) return mapCache;
  const scale = 2;
  const canvas = document.createElement('canvas');
  canvas.width = MAP.w * scale;
  canvas.height = MAP.h * scale;
  const g = canvas.getContext('2d');
  g.scale(scale, scale);

  const worldHeight = city.gridHeight + CITY.beachDepth + 90;
  const fit = Math.min(MAP.w / city.width, MAP.h / worldHeight);
  const ox = (MAP.w - city.width * fit) / 2;
  const oy = (MAP.h - worldHeight * fit) / 2;

  // Ocean: a depth gradient, then swell lines and a chart label under the land.
  const water = g.createLinearGradient(0, oy, 0, oy + worldHeight * fit);
  water.addColorStop(0, COLOURS.waterMid);
  water.addColorStop(1, COLOURS.waterDeep);
  g.fillStyle = water;
  g.fillRect(0, 0, MAP.w, MAP.h);

  g.strokeStyle = 'rgba(255, 255, 255, 0.09)';
  g.lineWidth = 1.4;
  for (let row = 0; row < 15; row += 1) {
    const y = 24 + row * 34;
    g.beginPath();
    for (let x = 16; x < MAP.w - 16; x += 26) {
      const yy = y + Math.sin(x * 0.05 + row) * 2.2;
      if (x === 16) g.moveTo(x, yy);
      else g.lineTo(x, yy);
    }
    g.stroke();
  }
  g.save();
  g.translate(MAP.w * 0.075, MAP.h * 0.52);
  g.rotate(-Math.PI / 2);
  g.fillStyle = 'rgba(230, 250, 250, 0.26)';
  g.font = font(15, '800');
  g.textAlign = 'center';
  g.fillText('P A C I F I C   O C E A N', 0, 0);
  g.restore();

  // Sand along the shore.
  g.beginPath();
  g.moveTo(ox, oy + city.gridHeight * fit);
  for (let x = 0; x <= city.width; x += 60) g.lineTo(ox + x * fit, oy + city.shoreY(x) * fit);
  g.lineTo(ox + city.width * fit, oy + city.gridHeight * fit);
  g.closePath();
  g.fillStyle = COLOURS.sand;
  g.fill();

  // Asphalt, then the blocks and their buildings.
  g.fillStyle = '#3a363e';
  g.fillRect(ox, oy, city.gridWidth * fit, city.gridHeight * fit);
  for (const block of city.blocks) {
    if (block.kind === 'park') g.fillStyle = '#5d8a4a';
    else if (block.kind === 'plaza') g.fillStyle = '#d3bd95';
    else if (block.kind === 'lot') g.fillStyle = '#4f4a54';
    else g.fillStyle = COLOURS.minimapBlock;
    g.fillRect(ox + block.x * fit, oy + block.y * fit, block.w * fit, block.h * fit);
  }
  g.fillStyle = 'rgba(64, 48, 40, 0.62)';
  for (const b of city.buildings) {
    g.fillRect(ox + b.x * fit, oy + b.y * fit, Math.max(1, b.w * fit), Math.max(1, b.h * fit));
  }

  // The promenade seam and the city frame.
  g.fillStyle = COLOURS.sidewalk;
  g.fillRect(ox, oy + city.gridHeight * fit, city.gridWidth * fit, Math.max(2, 34 * fit));
  g.strokeStyle = 'rgba(255, 214, 150, 0.35)';
  g.lineWidth = 2;
  g.strokeRect(ox + 0.5, oy + 0.5, city.gridWidth * fit, city.gridHeight * fit);

  // District labels, placed on the block grid rather than on buildings.
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = font(11, '800');
  const label = (name, bx, by) => {
    g.fillStyle = 'rgba(24, 18, 24, 0.55)';
    g.fillText(name, ox + bx * fit + 1, oy + by * fit + 1);
    g.fillStyle = 'rgba(255, 240, 214, 0.9)';
    g.fillText(name, ox + bx * fit, oy + by * fit);
  };
  const plaza = city.landmarks?.plaza;
  const park = city.landmarks?.park;
  if (plaza) label('PALM PLAZA', plaza.x + plaza.w / 2, plaza.y + plaza.h / 2);
  if (park) label('PALM PARK', park.x + park.w / 2, park.y + park.h / 2);
  label('THE STRIP', city.gridWidth * 0.18, city.gridHeight * 0.16);
  label('CORAL HEIGHTS', city.gridWidth * 0.78, city.gridHeight * 0.2);
  label('MARINA', city.gridWidth * 0.82, city.gridHeight + 46);
  label('PACIFIC', city.gridWidth * 0.5, city.gridHeight + 168);

  // A compass rose in the corner of the chart.
  const cx = MAP.w - 46;
  const cy = 46;
  g.strokeStyle = 'rgba(255, 244, 223, 0.4)';
  g.lineWidth = 1.2;
  g.beginPath();
  g.arc(cx, cy, 19, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = 'rgba(255, 211, 77, 0.85)';
  g.beginPath();
  g.moveTo(cx, cy - 15);
  g.lineTo(cx + 6, cy + 3);
  g.lineTo(cx, cy);
  g.lineTo(cx - 6, cy + 3);
  g.closePath();
  g.fill();
  g.fillStyle = 'rgba(255, 244, 223, 0.8)';
  g.font = font(9, '800');
  g.textAlign = 'center';
  g.fillText('N', cx, cy - 21);

  mapCache = { city, canvas, scale: fit, ox, oy };
  return mapCache;
}



function blip(ctx, x, y, radius, fill, stroke = 'rgba(16, 12, 18, 0.9)') {
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1.2;
  ctx.stroke();
}

function drawDiamond(ctx, x, y, size, fill) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.PI / 4);
  ctx.fillStyle = fill;
  ctx.fillRect(-size / 2, -size / 2, size, size);
  ctx.strokeStyle = 'rgba(30, 20, 12, 0.9)';
  ctx.lineWidth = 1.2;
  ctx.strokeRect(-size / 2, -size / 2, size, size);
  ctx.restore();
}

function drawMapScreen(ctx, W, H, world) {
  drawBackdrop(ctx, W, H, 0.9);
  text(ctx, 'CITY MAP', W / 2, 74, 34, COLOURS.text, '900', 'center');
  text(ctx, 'SUNSET PALMS · PALM COUNTY', W / 2, 96, 10, COLOURS.gold, '800', 'center');

  const map = buildMap(world.city);
  const mx = W / 2 - MAP.w / 2;
  const my = 112;
  panel(ctx, mx - 12, my - 12, MAP.w + 24, MAP.h + 24, 16, 'rgba(18, 15, 22, 0.92)');
  ctx.drawImage(map.canvas, mx, my, MAP.w, MAP.h);

  const px = mx + map.ox + world.player.x * map.scale;
  const py = my + map.oy + world.player.y * map.scale;

  // Collectibles still out there.
  for (const pack of world.activities.packages) {
    if (pack.taken) continue;
    const bx = mx + map.ox + pack.x * map.scale;
    const by = my + map.oy + pack.y * map.scale;
    blip(ctx, bx, by, 3, 'rgba(255, 224, 138, 0.95)');
  }

  // Side activities: races, delivery, rampage.
  for (const marker of activityMarkers(world)) {
    const bx = mx + map.ox + marker.x * map.scale;
    const by = my + map.oy + marker.y * map.scale;
    const colour = marker.kind === 'race' ? COLOURS.race : marker.kind === 'delivery' ? COLOURS.green : COLOURS.thug;
    blip(ctx, bx, by, 5, colour);
    text(ctx, marker.kind === 'race' ? 'R' : marker.kind === 'delivery' ? 'D' : 'K', bx, by + 3.5, 8, '#1a1420', '900', 'center');
  }

  // Police, then the mission marker, then the player on top.
  const pulse = 0.5 + 0.5 * Math.sin((world.time ?? 0) * 7);
  for (const unit of world.police.units) {
    const bx = mx + map.ox + unit.x * map.scale;
    const by = my + map.oy + unit.y * map.scale;
    blip(ctx, bx, by, 4 + pulse * 1.6, `rgba(255, 90, 77, ${0.7 + pulse * 0.3})`);
  }

  const target = world.mission.active ? world.mission.target : world.missionStart;
  if (target !== null && target !== undefined) {
    const bx = mx + map.ox + target.x * map.scale;
    const by = my + map.oy + target.y * map.scale;
    const halo = 10 + pulse * 4;
    ctx.strokeStyle = `rgba(255, 211, 77, ${0.35 + pulse * 0.3})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(bx, by, halo, 0, Math.PI * 2);
    ctx.stroke();
    drawDiamond(ctx, bx, by, 11, COLOURS.mission);
  }

  if (world.activities.race !== null) {
    const cp = world.activities.race.race.checkpoints[world.activities.race.next];
    if (cp !== undefined) {
      const bx = mx + map.ox + cp.x * map.scale;
      const by = my + map.oy + cp.y * map.scale;
      ctx.strokeStyle = COLOURS.race;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(bx, by, 6, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // The player sits on top of every other blip, in cream on a dark halo so the gold story
  // diamond can never swallow it.
  ctx.save();
  ctx.translate(px, py);
  ctx.fillStyle = 'rgba(18, 14, 22, 0.85)';
  ctx.beginPath();
  ctx.arc(0, 0, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 244, 223, 0.55)';
  ctx.lineWidth = 1.4;
  ctx.stroke();
  ctx.rotate(world.player.angle);
  ctx.fillStyle = '#fff4df';
  ctx.strokeStyle = 'rgba(28, 18, 12, 0.95)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(11, 0);
  ctx.lineTo(-7, 7);
  ctx.lineTo(-3.4, 0);
  ctx.lineTo(-7, -7);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  // Legend.
  const legendY = my + MAP.h + 16;
  let lx = W / 2 - 330;
  const legend = [
    ['mission', 'MISSION'],
    ['police', 'POLICE'],
    ['race', 'RACE'],
    ['package', 'PACKAGE'],
    ['rampage', 'RAMPAGE'],
  ];
  for (const [kind, name] of legend) {
    const colour =
      kind === 'mission' ? COLOURS.mission : kind === 'police' ? COLOURS.red : kind === 'race' ? COLOURS.race : kind === 'package' ? COLOURS.package : COLOURS.thug;
    if (kind === 'mission') drawDiamond(ctx, lx, legendY - 4, 9, colour);
    else blip(ctx, lx, legendY - 4, 4.5, colour);
    text(ctx, name, lx + 12, legendY, 10, COLOURS.muted, '700');
    lx += 130;
  }

  drawRows(ctx, W, H, world, menuItems(world), H - 60);
}

function drawResults(ctx, W, H, world) {
  const state = world.missions;
  const summary = activitySummary(world);
  const done = state === undefined ? 0 : state.completed.length;
  const total = state === undefined ? 0 : state.total;
  const storyDone = state !== undefined && state.index >= state.total;

  drawBackdrop(ctx, W, H, 0.84);
  ctx.fillStyle = storyDone ? 'rgba(60, 40, 16, 0.5)' : 'rgba(72, 14, 16, 0.55)';
  ctx.fillRect(0, 0, W, H);

  text(ctx, storyDone ? 'THE CITY IS YOURS' : 'WASTED', W / 2, 132, 62, storyDone ? COLOURS.gold : COLOURS.fail, '900', 'center');
  text(
    ctx,
    storyDone ? 'Every job in Sunset Palms is finished.' : 'The paramedics took their time. The city kept the rest.',
    W / 2,
    164,
    13,
    COLOURS.muted,
    '600',
    'center',
  );

  const stats = [
    ['CASH', `$${Math.round(world.player.money).toLocaleString('en-US')}`],
    ['MISSIONS', `${done} / ${total}`],
    ['PACKAGES', `${summary.packages} / ${summary.total}`],
    ['CARS TAKEN', String(world.stats.carsStolen)],
    ['TAKEDOWNS', String(world.stats.kills)],
    ['BEST RACE', summary.best > 0 ? `${summary.best.toFixed(1)}s` : '—'],
  ];
  const boxW = 760;
  const boxX = W / 2 - boxW / 2;
  panel(ctx, boxX, 190, boxW, 196, 16, 'rgba(20, 16, 24, 0.9)');
  for (let i = 0; i < stats.length; i += 1) {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = boxX + 34 + col * 248;
    const y = 232 + row * 82;
    text(ctx, stats[i][0], x, y, 10, COLOURS.muted, '700');
    text(ctx, stats[i][1], x, y + 30, 24, COLOURS.text, '800');
  }

  const items = menuItems(world);
  drawRows(ctx, W, H, world, items, 414);
}

/** Paint whichever full-screen menu the world's phase asks for. */
export function drawMenu(ctx, W, H, world) {
  ctx.save();
  ctx.textBaseline = 'alphabetic';
  if (world.menu === undefined) {
    ctx.restore();
    return;
  }
  if (world.phase === 'title') drawTitle(ctx, W, H, world);
  else if (world.phase === 'pause') drawPause(ctx, W, H, world);
  else if (world.phase === 'controls') drawControls(ctx, W, H, world);
  else if (world.phase === 'map') drawMapScreen(ctx, W, H, world);
  else if (world.phase === 'over') drawResults(ctx, W, H, world);
  ctx.restore();
}

/** The layout of the last drawn row set, for tests and for a pointer click that lands early. */
export function menuRects() {
  return rowRects;
}

export const MENU_MAP = MAP;
