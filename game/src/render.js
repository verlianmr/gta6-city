// Drawing only: world state in, pixels out. The camera transform is applied here, every visible
// thing is culled against the view rectangle, and a warm sunset grade is laid over the frame
// before the HUD draws on top. Gradients and palette lookups are cached, so a frame allocates
// almost nothing in its hot loops.

import { COLOURS, VIEW } from './config.js';

const view = { x0: 0, y0: 0, x1: 0, y1: 0 };
const WAVE_STYLES = [];
for (let row = 0; row < 8; row += 1) WAVE_STYLES.push(`rgba(255, 250, 235, ${(0.1 + row * 0.012).toFixed(3)})`);
const SPARKLE_STYLES = [];
for (let i = 0; i < 12; i += 1) SPARKLE_STYLES.push(`rgba(255, 246, 218, ${(0.22 + (i / 11) * 0.28).toFixed(3)})`);

let cache = {
  city: null,
  water: null,
  sand: null,
  tint: null,
  tintBucket: -1,
  tintW: 0,
  tintH: 0,
  vignette: null,
  vignetteBucket: -1,
  vignetteW: 0,
  vignetteH: 0,
};

function inView(view, x, y, w, h) {
  return x < view.x1 && x + w > view.x0 && y < view.y1 && y + h > view.y0;
}

function ensureGradients(ctx, city) {
  if (cache.city === city) return;
  const water = ctx.createLinearGradient(0, city.gridHeight, 0, city.height);
  water.addColorStop(0, COLOURS.waterShallow);
  water.addColorStop(0.28, COLOURS.waterMid);
  water.addColorStop(1, COLOURS.waterDeep);
  const sand = ctx.createLinearGradient(0, city.gridHeight, 0, city.gridHeight + 270);
  sand.addColorStop(0, COLOURS.sandDark);
  sand.addColorStop(0.35, COLOURS.sand);
  sand.addColorStop(1, '#f6e4b4');
  cache = { ...cache, city, water, sand, tint: null, tintBucket: -1, vignette: null, vignetteBucket: -1 };
}

function shoreLine(ctx, city, x0, x1) {
  ctx.beginPath();
  ctx.moveTo(x0, city.shoreY(x0));
  const step = 64;
  for (let x = x0 + step; x < x1; x += step) ctx.lineTo(x, city.shoreY(x));
  ctx.lineTo(x1, city.shoreY(x1));
}

function drawOcean(ctx, city, view, time) {
  if (view.y1 < city.gridHeight) return;
  const x0 = Math.max(-40, view.x0 - 40);
  const x1 = Math.min(city.width + 40, view.x1 + 40);
  if (x1 <= x0) return;

  ctx.beginPath();
  ctx.moveTo(x0, view.y1 + 40);
  ctx.lineTo(x0, city.shoreY(x0));
  const step = 64;
  for (let x = x0 + step; x < x1; x += step) ctx.lineTo(x, city.shoreY(x));
  ctx.lineTo(x1, city.shoreY(x1));
  ctx.lineTo(x1, view.y1 + 40);
  ctx.closePath();
  ctx.fillStyle = cache.water;
  ctx.fill();

  // Slow bands of swell, then a bright foam edge where the sand meets the water.
  const middle = (x0 + x1) / 2;
  const shore = city.shoreY(middle);
  ctx.lineWidth = 2;
  for (let row = 0; row < 8; row += 1) {
    const base = shore + 24 + row * 58;
    if (base > view.y1 + 30) break;
    if (base < view.y0 - 20) continue;
    ctx.strokeStyle = WAVE_STYLES[row];
    ctx.beginPath();
    for (let x = x0; x <= x1; x += 44) {
      const y = base + Math.sin(x * 0.011 + time * 0.65 + row * 1.4) * 5;
      if (x === x0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  for (let i = 0; i < city.sparkles.length; i += 1) {
    const s = city.sparkles[i];
    if (s.x < view.x0 - 8 || s.x > view.x1 + 8 || s.y < view.y0 - 8 || s.y > view.y1 + 8) continue;
    const twinkle = 0.22 + 0.28 * (0.5 + 0.5 * Math.sin(time * 1.5 + s.phase));
    ctx.fillStyle = SPARKLE_STYLES[Math.min(11, Math.floor(twinkle * 17))];
    ctx.fillRect(s.x, s.y, s.size, s.size * 0.55);
  }

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
  ctx.lineWidth = 14;
  shoreLine(ctx, city, x0, x1);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255, 249, 235, 0.55)';
  ctx.lineWidth = 5;
  shoreLine(ctx, city, x0, x1);
  ctx.stroke();
}

function drawBeach(ctx, city, view, time) {
  if (view.y1 < city.gridHeight || view.y0 > city.height) return;
  const x0 = Math.max(-40, view.x0 - 40);
  const x1 = Math.min(city.width + 40, view.x1 + 40);
  if (x1 <= x0) return;

  // Dry sand between the promenade and the surf.
  ctx.beginPath();
  ctx.moveTo(x0, city.gridHeight - 2);
  ctx.lineTo(x0, city.shoreY(x0));
  const step = 64;
  for (let x = x0 + step; x < x1; x += step) ctx.lineTo(x, city.shoreY(x));
  ctx.lineTo(x1, city.shoreY(x1));
  ctx.lineTo(x1, city.gridHeight - 2);
  ctx.closePath();
  ctx.fillStyle = cache.sand;
  ctx.fill();

  for (let i = 0; i < city.sandMarks.length; i += 1) {
    const mark = city.sandMarks[i];
    if (mark.x < view.x0 - 20 || mark.x > view.x1 + 20 || mark.y < view.y0 - 20 || mark.y > view.y1 + 20) continue;
    ctx.fillStyle = mark.style;
    ctx.fillRect(mark.x, mark.y, mark.w, 1.6);
  }

  // A wet-sand ribbon, then the promenade edge.
  ctx.beginPath();
  ctx.moveTo(x0, city.shoreY(x0) - 18);
  for (let x = x0 + step; x < x1; x += step) ctx.lineTo(x, city.shoreY(x) - 18);
  ctx.lineTo(x1, city.shoreY(x1) - 18);
  ctx.lineTo(x1, city.shoreY(x1));
  for (let x = x1; x > x0; x -= step) ctx.lineTo(x, city.shoreY(x));
  ctx.closePath();
  ctx.fillStyle = 'rgba(180, 139, 88, 0.16)';
  ctx.fill();

  // Promenade paving, with seams and a low sea wall.
  ctx.fillStyle = COLOURS.sidewalk;
  ctx.fillRect(0, city.gridHeight, city.gridWidth, 36);
  ctx.fillStyle = COLOURS.sidewalkEdge;
  ctx.fillRect(0, city.gridHeight, city.gridWidth, 3);
  ctx.fillRect(0, city.gridHeight + 34, city.gridWidth, 3);
  ctx.strokeStyle = 'rgba(120, 98, 70, 0.20)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = Math.max(0, Math.floor(view.x0 / 76) * 76); x < view.x1; x += 76) {
    ctx.moveTo(x, city.gridHeight + 4);
    ctx.lineTo(x, city.gridHeight + 33);
  }
  ctx.stroke();

  // A small time-driven shimmer just off the shore.
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let x = x0; x <= x1; x += 70) {
    const y = city.shoreY(x) + 10 + Math.sin(x * 0.02 + time * 1.2) * 4;
    if (x === x0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

function drawAsphalt(ctx, city, view) {
  if (view.x1 < 0 || view.y1 < 0 || view.x0 > city.gridWidth || view.y0 > city.gridHeight) return;
  ctx.fillStyle = COLOURS.asphalt;
  ctx.fillRect(0, 0, city.gridWidth, city.gridHeight);

  // A faint cross-hatch of older repairs, deterministic and cheap.
  ctx.fillStyle = 'rgba(0, 0, 0, 0.045)';
  for (let i = 0; i < city.roads.length; i += 1) {
    const road = city.roads[i];
    if (!road.vertical) continue;
    if (!inView(view, road.x, 0, road.w, city.gridHeight)) continue;
    for (let y = 80; y < city.gridHeight; y += 410) ctx.fillRect(road.x + 22, y, road.w - 44, 26);
  }
}

function drawLaneMarkings(ctx, city, view) {
  if (view.x1 < 0 || view.y1 < 0 || view.x0 > city.gridWidth || view.y0 > city.gridHeight) return;
  const road = city.roadWidth;
  const pitch = city.blockSize + road;
  const dash = 30;
  const gap = 28;
  const period = dash + gap;

  ctx.fillStyle = COLOURS.lane;
  for (let i = 0; i <= city.cols; i += 1) {
    const x = i * pitch + road / 2 - 1.6;
    if (x + 4 < view.x0 || x > view.x1) continue;
    const start = Math.max(0, Math.floor(view.y0 / period) * period);
    for (let y = start; y < Math.min(city.gridHeight, view.y1); y += period) {
      if (y % pitch < road) continue;
      ctx.fillRect(x, y, 3.2, dash);
    }
  }
  for (let j = 0; j <= city.rows; j += 1) {
    const y = j * pitch + road / 2 - 1.6;
    if (y + 4 < view.y0 || y > view.y1) continue;
    const start = Math.max(0, Math.floor(view.x0 / period) * period);
    for (let x = start; x < Math.min(city.gridWidth, view.x1); x += period) {
      if (x % pitch < road) continue;
      ctx.fillRect(x, y, dash, 3.2);
    }
  }

  // Curb-side lines.
  ctx.fillStyle = 'rgba(238, 232, 214, 0.24)';
  for (let i = 0; i <= city.cols; i += 1) {
    const x = i * pitch;
    if (x + road < view.x0 || x > view.x1) continue;
    ctx.fillRect(x + 7, 0, 2, city.gridHeight);
    ctx.fillRect(x + road - 9, 0, 2, city.gridHeight);
  }
  for (let j = 0; j <= city.rows; j += 1) {
    const y = j * pitch;
    if (y + road < view.y0 || y > view.y1) continue;
    ctx.fillRect(0, y + 7, city.gridWidth, 2);
    ctx.fillRect(0, y + road - 9, city.gridWidth, 2);
  }

  // Zebra crossings on all four approaches of every visible intersection.
  ctx.fillStyle = 'rgba(232, 222, 200, 0.78)';
  for (let i = 0; i <= city.cols; i += 1) {
    for (let j = 0; j <= city.rows; j += 1) {
      const ix = i * pitch;
      const iy = j * pitch;
      if (!inView(view, ix - 32, iy - 32, road + 64, road + 64)) continue;
      for (let s = 0; s < 6; s += 1) {
        const t = 10 + (s * (road - 20)) / 6;
        const w = (road - 20) / 6 - 5;
        ctx.fillRect(ix + t, iy + road + 5, w, 22);
        ctx.fillRect(ix + t, iy - 27, w, 22);
        ctx.fillRect(ix - 27, iy + t, 22, w);
        ctx.fillRect(ix + road + 5, iy + t, 22, w);
      }
    }
  }
}

function drawBlockGround(ctx, city, block) {
  ctx.fillStyle = COLOURS.sidewalk;
  ctx.fillRect(block.x, block.y, block.w, block.h);
  ctx.fillStyle = COLOURS.sidewalkEdge;
  ctx.fillRect(block.x, block.y + block.h - 3, block.w, 3);
  ctx.fillRect(block.x + block.w - 3, block.y, 3, block.h);
  ctx.strokeStyle = 'rgba(255, 245, 220, 0.35)';
  ctx.lineWidth = 1;
  ctx.strokeRect(block.x + 0.5, block.y + 0.5, block.w - 1, block.h - 1);

  const lotX = block.x + 20;
  const lotY = block.y + 20;
  const lotW = block.w - 40;
  const lotH = block.h - 40;

  if (block.kind === 'park') {
    ctx.fillStyle = COLOURS.grass;
    ctx.fillRect(lotX, lotY, lotW, lotH);
    ctx.fillStyle = 'rgba(58, 92, 40, 0.18)';
    ctx.fillRect(lotX, lotY + lotH - 8, lotW, 8);

    // Crossing paths.
    ctx.fillStyle = COLOURS.path;
    ctx.fillRect(lotX, lotY + lotH / 2 - 13, lotW, 26);
    ctx.fillRect(lotX + lotW / 2 - 13, lotY, 26, lotH);

    if (block.pond) {
      const pond = block.pond;
      ctx.fillStyle = COLOURS.waterMid;
      ctx.beginPath();
      ctx.ellipse(pond.x, pond.y, pond.rx, pond.ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(120, 200, 198, 0.55)';
      ctx.beginPath();
      ctx.ellipse(pond.x - 8, pond.y - 6, pond.rx * 0.62, pond.ry * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(pond.x, pond.y, pond.rx - 2, pond.ry - 2, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    return;
  }

  if (block.kind === 'plaza') {
    ctx.fillStyle = '#d8c6a5';
    ctx.fillRect(lotX, lotY, lotW, lotH);
    ctx.strokeStyle = 'rgba(120, 98, 68, 0.18)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = lotX + 34; x < lotX + lotW; x += 42) {
      ctx.moveTo(x, lotY);
      ctx.lineTo(x, lotY + lotH);
    }
    for (let y = lotY + 34; y < lotY + lotH; y += 42) {
      ctx.moveTo(lotX, y);
      ctx.lineTo(lotX + lotW, y);
    }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(160, 128, 82, 0.35)';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(block.x + block.w / 2, block.y + block.h / 2, 88, 0, Math.PI * 2);
    ctx.stroke();

    // A sun mosaic around the fountain: sixteen alternating wedges between two rings.
    const cx = block.x + block.w / 2;
    const cy = block.y + block.h / 2;
    for (let i = 0; i < 16; i += 1) {
      const a0 = (i / 16) * Math.PI * 2;
      const a1 = ((i + 1) / 16) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(cx, cy, 148, a0, a1);
      ctx.arc(cx, cy, 98, a1, a0, true);
      ctx.closePath();
      ctx.fillStyle = i % 2 === 0 ? 'rgba(255, 246, 222, 0.22)' : 'rgba(168, 130, 80, 0.12)';
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(160, 128, 82, 0.28)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, 148, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, 98, 0, Math.PI * 2);
    ctx.stroke();
    return;
  }

  if (block.kind === 'lot') {
    ctx.fillStyle = COLOURS.asphaltDark;
    ctx.fillRect(lotX, lotY, lotW, lotH);
    ctx.fillStyle = 'rgba(238, 230, 208, 0.45)';
    for (let x = lotX + 30; x < lotX + lotW - 10; x += 48) ctx.fillRect(x, lotY + 8, 2, lotH - 16);
    return;
  }

  // Ordinary block: a paved lot with a warm concrete tone.
  ctx.fillStyle = COLOURS.lot;
  ctx.fillRect(lotX, lotY, lotW, lotH);
  ctx.fillStyle = 'rgba(255, 246, 222, 0.16)';
  ctx.fillRect(lotX, lotY, lotW, 4);
  ctx.strokeStyle = 'rgba(120, 96, 68, 0.16)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let y = lotY + 40; y < lotY + lotH; y += 64) {
    ctx.moveTo(lotX, y);
    ctx.lineTo(lotX + lotW, y);
  }
  ctx.stroke();
}

function drawBlocks(ctx, city, view) {
  for (let i = 0; i < city.blocks.length; i += 1) {
    const block = city.blocks[i];
    if (!inView(view, block.x, block.y, block.w, block.h)) continue;
    drawBlockGround(ctx, city, block);
  }
}

function drawBuildingShadows(ctx, city, view) {
  for (let i = 0; i < city.buildings.length; i += 1) {
    const b = city.buildings[i];
    if (!inView(view, b.x + b.shadowX, b.y + b.shadowY, b.w, b.h)) continue;
    ctx.fillStyle = COLOURS.shadowSoft;
    ctx.fillRect(b.x + b.shadowX + 6, b.y + b.shadowY + 4, b.w, b.h);
    ctx.fillStyle = COLOURS.shadow;
    ctx.fillRect(b.x + b.shadowX, b.y + b.shadowY, b.w, b.h);
  }
}

function drawPropShadow(ctx, prop) {
  const size = prop.size ?? 12;
  ctx.fillStyle = COLOURS.shadowSoft;
  if (prop.type === 'car') {
    ctx.save();
    ctx.translate(prop.x + 9, prop.y + 5);
    ctx.rotate(prop.angle);
    ctx.fillRect(-prop.length / 2, -prop.width / 2, prop.length, prop.width);
    ctx.restore();
    return;
  }
  if (prop.type === 'bench') {
    ctx.save();
    ctx.translate(prop.x + 7, prop.y + 4);
    ctx.rotate(prop.angle);
    ctx.fillRect(-16, -5, 32, 10);
    ctx.restore();
    return;
  }
  if (prop.type === 'umbrella') {
    ctx.beginPath();
    ctx.ellipse(prop.x + 8, prop.y + 4, size, size * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  const radius = prop.type === 'lamp' ? 6 : size * 0.9;
  ctx.beginPath();
  ctx.ellipse(prop.x + size * 0.55, prop.y + size * 0.25, radius, radius * 0.55, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawPalm(ctx, prop) {
  const size = prop.size;
  ctx.save();
  ctx.translate(prop.x, prop.y);
  ctx.fillStyle = COLOURS.trunk;
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.18 + 1.5, 0, Math.PI * 2);
  ctx.fill();
  for (let i = 0; i < 8; i += 1) {
    const angle = prop.lean + (i / 8) * Math.PI * 2;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const px = -sin;
    const py = cos;
    const length = size * (i % 2 === 0 ? 1 : 0.82);
    ctx.fillStyle = i % 2 === 0 ? COLOURS.palm : COLOURS.palmDark;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(cos * length * 0.55 + px * length * 0.17, sin * length * 0.55 + py * length * 0.17, cos * length, sin * length);
    ctx.quadraticCurveTo(cos * length * 0.55 - px * length * 0.17, sin * length * 0.55 - py * length * 0.17, 0, 0);
    ctx.fill();
  }
  ctx.fillStyle = COLOURS.palmLight;
  ctx.beginPath();
  ctx.arc(-1, -2, size * 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawTree(ctx, prop) {
  const size = prop.size;
  ctx.fillStyle = COLOURS.palmDark;
  ctx.beginPath();
  ctx.arc(prop.x, prop.y, size * 0.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = COLOURS.grassDark;
  ctx.beginPath();
  ctx.arc(prop.x - size * 0.16, prop.y - size * 0.18, size * 0.62, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = COLOURS.palmLight;
  ctx.beginPath();
  ctx.arc(prop.x - size * 0.26, prop.y - size * 0.28, size * 0.3, 0, Math.PI * 2);
  ctx.fill();
}

function drawCar(ctx, prop) {
  ctx.save();
  ctx.translate(prop.x, prop.y);
  ctx.rotate(prop.angle);
  const l = prop.length;
  const w = prop.width;
  ctx.fillStyle = prop.colour;
  ctx.beginPath();
  ctx.roundRect(-l / 2, -w / 2, l, w, 6);
  ctx.fill();
  ctx.strokeStyle = 'rgba(30, 22, 20, 0.35)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
  ctx.beginPath();
  ctx.roundRect(-l / 2 + 4, -w / 2 + 3, l - 8, 3, 2);
  ctx.fill();

  ctx.fillStyle = prop.roof;
  ctx.beginPath();
  ctx.roundRect(-l * 0.17, -w * 0.33, l * 0.4, w * 0.66, 4);
  ctx.fill();

  ctx.fillStyle = 'rgba(170, 214, 224, 0.75)';
  ctx.fillRect(l * 0.19, -w * 0.3, l * 0.1, w * 0.6);
  ctx.fillRect(-l * 0.32, -w * 0.28, l * 0.1, w * 0.56);

  ctx.fillStyle = '#20242a';
  ctx.fillRect(-l / 2 + 5, -w / 2 - 1, 8, 3);
  ctx.fillRect(-l / 2 + 5, w / 2 - 2, 8, 3);
  ctx.fillRect(l / 2 - 13, -w / 2 - 1, 8, 3);
  ctx.fillRect(l / 2 - 13, w / 2 - 2, 8, 3);

  ctx.fillStyle = '#ffe7b0';
  ctx.fillRect(l / 2 - 3, -w * 0.3, 2.5, 4);
  ctx.fillRect(l / 2 - 3, w * 0.3 - 4, 2.5, 4);
  ctx.restore();
}

function drawBench(ctx, prop) {
  ctx.save();
  ctx.translate(prop.x, prop.y);
  ctx.rotate(prop.angle);
  ctx.fillStyle = COLOURS.wood;
  for (let i = -1; i <= 1; i += 1) ctx.fillRect(-16, i * 4 - 1.5, 32, 3);
  ctx.fillStyle = COLOURS.woodDark;
  ctx.fillRect(-14, -6, 3, 12);
  ctx.fillRect(11, -6, 3, 12);
  ctx.restore();
}

function drawUmbrella(ctx, prop, time) {
  const size = prop.size;
  ctx.save();
  ctx.translate(prop.x, prop.y);
  if (prop.towel) {
    ctx.fillStyle = 'rgba(245, 235, 210, 0.85)';
    ctx.fillRect(12, 6, 26, 17);
    ctx.fillStyle = 'rgba(226, 96, 79, 0.55)';
    ctx.fillRect(12, 6, 26, 4);
  }
  ctx.rotate(Math.sin(time * 0.4 + prop.x) * 0.02);
  ctx.fillStyle = prop.colour;
  ctx.beginPath();
  ctx.arc(0, 0, size, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255, 250, 238, 0.7)';
  for (let i = 0; i < 8; i += 2) {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, size, (i / 8) * Math.PI * 2, ((i + 1) / 8) * Math.PI * 2);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = COLOURS.woodDark;
  ctx.beginPath();
  ctx.arc(0, 0, 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawFountain(ctx, prop, time) {
  const r = prop.size;
  ctx.fillStyle = '#c9b38d';
  ctx.beginPath();
  ctx.arc(prop.x, prop.y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = COLOURS.waterMid;
  ctx.beginPath();
  ctx.arc(prop.x, prop.y, r * 0.78, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 3; i += 1) {
    const pulse = (time * 0.5 + i / 3) % 1;
    ctx.globalAlpha = 0.5 * (1 - pulse);
    ctx.beginPath();
    ctx.arc(prop.x, prop.y, r * 0.2 + pulse * r * 0.55, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#e9f7f4';
  ctx.beginPath();
  ctx.arc(prop.x, prop.y, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.fillRect(prop.x - 1.5, prop.y - 16, 3, 12);
}

function drawLifeguard(ctx, prop) {
  ctx.save();
  ctx.translate(prop.x, prop.y);
  ctx.fillStyle = '#f2e9d6';
  ctx.fillRect(-18, -14, 36, 28);
  ctx.fillStyle = '#d95f4c';
  ctx.fillRect(-18, -14, 36, 5);
  ctx.fillRect(-18, 9, 36, 5);
  ctx.fillStyle = '#7b5b3e';
  ctx.fillRect(-12, 14, 4, 14);
  ctx.fillRect(8, 14, 4, 14);
  ctx.restore();
}

function drawCafe(ctx, prop) {
  const size = prop.size;
  ctx.save();
  ctx.translate(prop.x, prop.y);
  ctx.fillStyle = 'rgba(255, 250, 238, 0.85)';
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.42, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = prop.colour;
  ctx.beginPath();
  ctx.arc(0, 0, size, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255, 250, 238, 0.72)';
  for (let i = 0; i < 8; i += 2) {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, size, (i / 8) * Math.PI * 2, ((i + 1) / 8) * Math.PI * 2);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = COLOURS.woodDark;
  ctx.beginPath();
  ctx.arc(0, 0, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawPlanter(ctx, prop) {
  const size = prop.size;
  ctx.fillStyle = '#a98f6c';
  ctx.beginPath();
  ctx.roundRect(prop.x - size, prop.y - size, size * 2, size * 2, 4);
  ctx.fill();
  ctx.fillStyle = '#7d6648';
  ctx.beginPath();
  ctx.roundRect(prop.x - size + 3, prop.y - size + 3, size * 2 - 6, size * 2 - 6, 3);
  ctx.fill();
  ctx.fillStyle = COLOURS.grassDark;
  ctx.beginPath();
  ctx.arc(prop.x, prop.y, size * 0.78, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = COLOURS.palmLight;
  ctx.beginPath();
  ctx.arc(prop.x - size * 0.22, prop.y - size * 0.25, size * 0.42, 0, Math.PI * 2);
  ctx.arc(prop.x + size * 0.3, prop.y + size * 0.12, size * 0.3, 0, Math.PI * 2);
  ctx.fill();
}

function drawProps(ctx, city, view, time) {
  for (let i = 0; i < city.props.length; i += 1) {
    const prop = city.props[i];
    const size = prop.size ?? 12;
    if (!inView(view, prop.x - size - 30, prop.y - size - 30, size * 2 + 60, size * 2 + 60)) continue;
    switch (prop.type) {
      case 'palm':
        drawPalm(ctx, prop);
        break;
      case 'tree':
        drawTree(ctx, prop);
        break;
      case 'car':
        drawCar(ctx, prop);
        break;
      case 'bench':
        drawBench(ctx, prop);
        break;
      case 'umbrella':
        drawUmbrella(ctx, prop, time);
        break;
      case 'cafe':
        drawCafe(ctx, prop);
        break;
      case 'planter':
        drawPlanter(ctx, prop);
        break;
      case 'fountain':
        drawFountain(ctx, prop, time);
        break;
      case 'lifeguard':
        drawLifeguard(ctx, prop);
        break;
      case 'hydrant':
        ctx.fillStyle = '#c94f3f';
        ctx.beginPath();
        ctx.arc(prop.x, prop.y, 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#e9d9b8';
        ctx.fillRect(prop.x - 1, prop.y - 7, 2, 3);
        break;
      case 'lamp': {
        ctx.fillStyle = 'rgba(255, 205, 128, 0.10)';
        ctx.beginPath();
        ctx.arc(prop.x, prop.y, 24, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#4b4038';
        ctx.beginPath();
        ctx.arc(prop.x, prop.y, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = COLOURS.lamp;
        ctx.beginPath();
        ctx.arc(prop.x, prop.y, 3.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#2f2824';
        ctx.fillRect(prop.x - 1, prop.y + 3, 2, 7);
        break;
      }
      default:
        break;
    }
  }
}

function drawBuildings(ctx, city, view) {
  for (let i = 0; i < city.buildings.length; i += 1) {
    const b = city.buildings[i];
    if (!inView(view, b.x, b.y, b.w, b.h)) continue;

    ctx.fillStyle = b.wall;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = 'rgba(40, 26, 22, 0.16)';
    ctx.fillRect(b.x + b.w - 7, b.y, 7, b.h);
    ctx.fillRect(b.x, b.y + b.h - 5, b.w, 5);

    ctx.fillStyle = b.roof;
    ctx.fillRect(b.x + 7, b.y + 7, b.w - 14, b.h - 14);
    if (b.roofStyle === 'tile') {
      ctx.strokeStyle = 'rgba(62, 34, 24, 0.13)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let y = b.y + 15; y < b.y + b.h - 10; y += 7) {
        ctx.moveTo(b.x + 8, y);
        ctx.lineTo(b.x + b.w - 8, y);
      }
      ctx.stroke();
    } else if (b.roofStyle === 'concrete') {
      ctx.strokeStyle = 'rgba(52, 42, 36, 0.12)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(b.x + 10, b.y + b.h * 0.42);
      ctx.lineTo(b.x + b.w - 10, b.y + b.h * 0.42);
      ctx.moveTo(b.x + b.w * 0.55, b.y + 10);
      ctx.lineTo(b.x + b.w * 0.55, b.y + b.h - 10);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(35, 24, 22, 0.30)';
    ctx.lineWidth = 2;
    ctx.strokeRect(b.x + 7, b.y + 7, b.w - 14, b.h - 14);
    ctx.strokeStyle = 'rgba(255, 248, 226, 0.30)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(b.x + 9, b.y + b.h - 9);
    ctx.lineTo(b.x + 9, b.y + 9);
    ctx.lineTo(b.x + b.w - 9, b.y + 9);
    ctx.stroke();

    if (b.tier > 0) {
      const t = b.tier;
      ctx.fillStyle = 'rgba(255, 248, 228, 0.15)';
      ctx.fillRect(b.x + t, b.y + t, b.w - t * 2, b.h - t * 2);
      ctx.strokeStyle = 'rgba(40, 26, 22, 0.18)';
      ctx.lineWidth = 2;
      ctx.strokeRect(b.x + t, b.y + t, b.w - t * 2, b.h - t * 2);
      ctx.strokeStyle = 'rgba(255, 250, 232, 0.26)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(b.x + t + 1, b.y + b.h - t - 1);
      ctx.lineTo(b.x + t + 1, b.y + t + 1);
      ctx.lineTo(b.x + b.w - t - 1, b.y + t + 1);
      ctx.stroke();
    }

    if (b.glass) {
      ctx.strokeStyle = 'rgba(220, 245, 250, 0.28)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = b.x + 18; x < b.x + b.w - 10; x += 18) {
        ctx.moveTo(x, b.y + 7);
        ctx.lineTo(x, b.y + b.h - 7);
      }
      for (let y = b.y + 18; y < b.y + b.h - 10; y += 18) {
        ctx.moveTo(b.x + 7, y);
        ctx.lineTo(b.x + b.w - 7, y);
      }
      ctx.stroke();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.beginPath();
      ctx.moveTo(b.x + 8, b.y + b.h - 8);
      ctx.lineTo(b.x + b.w * 0.55, b.y + 8);
      ctx.lineTo(b.x + b.w * 0.7, b.y + 8);
      ctx.lineTo(b.x + 8, b.y + b.h * 0.7);
      ctx.closePath();
      ctx.fill();
    }

    for (let d = 0; d < b.details.length; d += 1) {
      const detail = b.details[d];
      if (detail.type === 'ac') {
        ctx.fillStyle = '#a8a49a';
        ctx.fillRect(detail.x, detail.y, detail.w, detail.h);
        ctx.fillStyle = 'rgba(50, 44, 40, 0.5)';
        ctx.fillRect(detail.x + 2, detail.y + 2, detail.w - 4, detail.h - 4);
        ctx.strokeStyle = 'rgba(230, 226, 214, 0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(detail.x + detail.w / 2, detail.y + detail.h / 2, Math.min(detail.w, detail.h) * 0.28, 0, Math.PI * 2);
        ctx.stroke();
      } else if (detail.type === 'vent') {
        ctx.fillStyle = '#8f8b80';
        ctx.beginPath();
        ctx.arc(detail.x + detail.w / 2, detail.y + detail.h / 2, Math.min(detail.w, detail.h) * 0.45, 0, Math.PI * 2);
        ctx.fill();
      } else if (detail.type === 'stair') {
        ctx.fillStyle = 'rgba(60, 46, 40, 0.32)';
        ctx.fillRect(detail.x, detail.y, detail.w, detail.h);
        ctx.fillStyle = 'rgba(245, 232, 206, 0.28)';
        ctx.fillRect(detail.x + 2, detail.y + 2, detail.w - 4, 3);
      } else if (detail.type === 'solar') {
        ctx.fillStyle = '#39566b';
        ctx.fillRect(detail.x, detail.y, detail.w, detail.h);
        ctx.strokeStyle = 'rgba(170, 214, 226, 0.45)';
        ctx.lineWidth = 1;
        ctx.strokeRect(detail.x + 1, detail.y + 1, detail.w - 2, detail.h - 2);
        ctx.beginPath();
        ctx.moveTo(detail.x + detail.w / 2, detail.y + 1);
        ctx.lineTo(detail.x + detail.w / 2, detail.y + detail.h - 1);
        ctx.moveTo(detail.x + 1, detail.y + detail.h / 2);
        ctx.lineTo(detail.x + detail.w - 1, detail.y + detail.h / 2);
        ctx.stroke();
      } else if (detail.type === 'garden') {
        ctx.fillStyle = COLOURS.grassDark;
        ctx.fillRect(detail.x, detail.y, detail.w, detail.h);
        ctx.fillStyle = COLOURS.palmLight;
        ctx.beginPath();
        ctx.arc(detail.x + detail.w * 0.35, detail.y + detail.h * 0.45, Math.min(detail.w, detail.h) * 0.25, 0, Math.PI * 2);
        ctx.arc(detail.x + detail.w * 0.68, detail.y + detail.h * 0.6, Math.min(detail.w, detail.h) * 0.2, 0, Math.PI * 2);
        ctx.fill();
      } else if (detail.type === 'pool') {
        ctx.fillStyle = '#4fa7b0';
        ctx.fillRect(detail.x, detail.y, detail.w, detail.h);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.lineWidth = 2;
        ctx.strokeRect(detail.x + 1, detail.y + 1, detail.w - 2, detail.h - 2);
        ctx.strokeStyle = 'rgba(210, 245, 245, 0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(detail.x + 4, detail.y + detail.h * 0.4);
        ctx.lineTo(detail.x + detail.w - 4, detail.y + detail.h * 0.4);
        ctx.moveTo(detail.x + 4, detail.y + detail.h * 0.65);
        ctx.lineTo(detail.x + detail.w - 4, detail.y + detail.h * 0.65);
        ctx.stroke();
      } else if (detail.type === 'tank') {
        const radius = Math.min(detail.w, detail.h) * 0.5;
        ctx.fillStyle = '#8a7f6d';
        ctx.beginPath();
        ctx.arc(detail.x + detail.w / 2, detail.y + detail.h / 2, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 246, 222, 0.5)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(detail.x + detail.w / 2, detail.y + detail.h / 2, radius * 0.72, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = 'rgba(40, 30, 24, 0.35)';
        ctx.beginPath();
        ctx.arc(detail.x + detail.w / 2 - radius * 0.25, detail.y + detail.h / 2 - radius * 0.25, radius * 0.18, 0, Math.PI * 2);
        ctx.fill();
      } else if (detail.type === 'helipad') {
        const cx = detail.x + detail.w / 2;
        const cy = detail.y + detail.h / 2;
        const radius = Math.min(detail.w, detail.h) * 0.5;
        ctx.fillStyle = '#5b5a58';
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 248, 226, 0.8)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, radius * 0.82, 0, Math.PI * 2);
        ctx.stroke();
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(cx - radius * 0.3, cy - radius * 0.32);
        ctx.lineTo(cx - radius * 0.3, cy + radius * 0.32);
        ctx.moveTo(cx + radius * 0.3, cy - radius * 0.32);
        ctx.lineTo(cx + radius * 0.3, cy + radius * 0.32);
        ctx.moveTo(cx - radius * 0.3, cy);
        ctx.lineTo(cx + radius * 0.3, cy);
        ctx.stroke();
      }
    }

    // A slim height cue along the sunward edge.
    ctx.fillStyle = 'rgba(255, 236, 194, 0.20)';
    ctx.fillRect(b.x, b.y, b.w, 2);

    if (b.awning !== null) {
      ctx.fillStyle = b.awning;
      ctx.fillRect(b.x + 8, b.y + b.h, b.w - 16, 8);
      ctx.fillStyle = 'rgba(255, 250, 238, 0.55)';
      for (let x = b.x + 8; x < b.x + b.w - 16; x += 13) ctx.fillRect(x, b.y + b.h, 6, 8);
      ctx.fillStyle = 'rgba(48, 30, 24, 0.20)';
      ctx.fillRect(b.x + 8, b.y + b.h + 8, b.w - 16, 2);
    }
  }
}

function drawPlayer(ctx, player) {
  const bob = Math.sin(player.walkPhase) * 1.6;
  const swing = Math.sin(player.walkPhase) * 3.4;

  ctx.fillStyle = 'rgba(48, 28, 22, 0.28)';
  ctx.beginPath();
  ctx.ellipse(player.x + 11, player.y + 7, 15, 8.5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(player.x, player.y + bob * 0.25);
  ctx.rotate(player.angle);
  ctx.scale(1.15, 1.15);

  // Legs, then the torso and shoulders, then the head: a readable top-down silhouette.
  ctx.fillStyle = COLOURS.playerJeans;
  ctx.beginPath();
  ctx.roundRect(-15 + swing * 0.5, -7, 11, 5.5, 2.5);
  ctx.roundRect(-15 - swing * 0.5, 1.5, 11, 5.5, 2.5);
  ctx.fill();

  ctx.fillStyle = '#2d3a49';
  ctx.beginPath();
  ctx.ellipse(-15 + swing * 0.5, -4.2, 3, 2.6, 0, 0, Math.PI * 2);
  ctx.ellipse(-15 - swing * 0.5, 4.2, 3, 2.6, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = COLOURS.playerJacket;
  ctx.beginPath();
  ctx.roundRect(-9, -8.5, 19, 17, 7);
  ctx.fill();
  ctx.strokeStyle = 'rgba(60, 36, 24, 0.42)';
  ctx.lineWidth = 1.4;
  ctx.stroke();

  ctx.fillStyle = 'rgba(255, 248, 226, 0.28)';
  ctx.beginPath();
  ctx.roundRect(-6, -7, 9, 4, 2);
  ctx.fill();

  // Arms swing opposite the legs.
  ctx.fillStyle = COLOURS.playerSkin;
  ctx.beginPath();
  ctx.arc(1 - swing * 0.35, -9.2, 3.2, 0, Math.PI * 2);
  ctx.arc(1 + swing * 0.35, 9.2, 3.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = COLOURS.playerSkin;
  ctx.beginPath();
  ctx.arc(5.5, 0, 5.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = COLOURS.playerHair;
  ctx.beginPath();
  ctx.arc(3.4, 0, 4.7, Math.PI * 0.55, Math.PI * 1.45);
  ctx.fill();
  ctx.fillStyle = 'rgba(70, 40, 30, 0.5)';
  ctx.beginPath();
  ctx.arc(9.3, 0, 1.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawAtmosphere(ctx, W, H, world) {
  const hour = world.clock / 60;
  const warmth = Math.max(0, 1 - Math.abs(hour - 18.4) / 3.4);
  const bucket = Math.round(warmth * 12);
  if (cache.tint === null || cache.tintBucket !== bucket || cache.tintW !== W || cache.tintH !== H) {
    const tint = ctx.createLinearGradient(0, 0, W, H);
    const a = (0.1 + warmth * 0.24).toFixed(3);
    tint.addColorStop(0, `rgba(255, 174, 92, ${a})`);
    tint.addColorStop(0.5, `rgba(255, 138, 82, ${(a * 0.55).toFixed(3)})`);
    tint.addColorStop(1, `rgba(58, 48, 104, ${(0.08 + (1 - warmth) * 0.12).toFixed(3)})`);
    cache.tint = tint;
    cache.tintBucket = bucket;
    cache.tintW = W;
    cache.tintH = H;
  }
  ctx.save();
  ctx.globalCompositeOperation = 'overlay';
  ctx.fillStyle = cache.tint;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();

  // A warm wash that unifies the palette without washing out the teal water.
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = 'rgba(255, 221, 178, 0.12)';
  ctx.fillRect(0, 0, W, H);
  ctx.restore();

  if (cache.vignette === null || cache.vignetteBucket !== bucket || cache.vignetteW !== W || cache.vignetteH !== H) {
    const vignette = ctx.createRadialGradient(W / 2, H / 2, H * 0.22, W / 2, H / 2, H * 0.78);
    vignette.addColorStop(0, 'rgba(24, 16, 24, 0)');
    vignette.addColorStop(1, 'rgba(24, 16, 24, 0.38)');
    cache.vignette = vignette;
    cache.vignetteBucket = bucket;
    cache.vignetteW = W;
    cache.vignetteH = H;
  }
  ctx.fillStyle = cache.vignette;
  ctx.fillRect(0, 0, W, H);
}

export function render(ctx, W, H, world) {
  const city = world.city;
  const camera = world.camera;
  const halfWidth = VIEW.width / (2 * camera.zoom);
  const halfHeight = VIEW.height / (2 * camera.zoom);
  view.x0 = camera.x - halfWidth;
  view.y0 = camera.y - halfHeight;
  view.x1 = camera.x + halfWidth;
  view.y1 = camera.y + halfHeight;
  ensureGradients(ctx, city);

  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.scale(camera.zoom, camera.zoom);
  ctx.translate(-camera.x, -camera.y);

  drawOcean(ctx, city, view, world.time);
  drawBeach(ctx, city, view, world.time);
  drawAsphalt(ctx, city, view);
  drawLaneMarkings(ctx, city, view);
  drawBlocks(ctx, city, view);
  drawBuildingShadows(ctx, city, view);

  for (let i = 0; i < city.props.length; i += 1) {
    const prop = city.props[i];
    const size = prop.size ?? 12;
    if (!inView(view, prop.x - size - 30, prop.y - size - 30, size * 2 + 60, size * 2 + 60)) continue;
    drawPropShadow(ctx, prop);
  }

  drawProps(ctx, city, view, world.time);
  drawBuildings(ctx, city, view);
  drawPlayer(ctx, world.player);

  ctx.restore();
  drawAtmosphere(ctx, W, H, world);
}
