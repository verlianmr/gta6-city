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

  // A quiet gold pool marks the player in a busy plaza without an arrow over his head.
  ctx.fillStyle = 'rgba(255, 210, 122, 0.13)';
  ctx.beginPath();
  ctx.ellipse(player.x, player.y, 21, 21, 0, 0, Math.PI * 2);
  ctx.fill();

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

// ---------------------------------------------------------------- the street layer

function policeGlow(ctx, car, time) {
  const flash = Math.sin(time * 11 + car.sirenPhase);
  const redOn = flash > 0;
  const rgb = redOn ? '255, 56, 40' : '40, 110, 255';
  const w = car.width;
  ctx.save();
  const glow = ctx.createRadialGradient(0, 0, 3, 0, 0, 58);
  glow.addColorStop(0, `rgba(${rgb}, 0.52)`);
  glow.addColorStop(0.45, `rgba(${rgb}, 0.20)`);
  glow.addColorStop(1, `rgba(${rgb}, 0)`);
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, 58, 0, Math.PI * 2);
  ctx.fill();
  for (const side of [-1, 1]) {
    const isRed = side < 0;
    const on = isRed === redOn;
    const lamp = isRed ? '255, 56, 40' : '40, 110, 255';
    const bloom = ctx.createRadialGradient(-2, side * w * 0.24, 1, -2, side * w * 0.24, 20);
    bloom.addColorStop(0, `rgba(${lamp}, ${on ? 0.98 : 0.14})`);
    bloom.addColorStop(0.4, `rgba(${lamp}, ${on ? 0.5 : 0.06})`);
    bloom.addColorStop(1, `rgba(${lamp}, 0)`);
    ctx.fillStyle = bloom;
    ctx.beginPath();
    ctx.arc(-2, side * w * 0.24, 20, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawVehicle(ctx, car, time) {
  const l = car.length;
  const w = car.width;

  // A soft gold pool marks the car the player is driving, so it reads instantly in a chase.
  if (car.driver === 'player' && !car.dead) {
    ctx.fillStyle = 'rgba(255, 210, 122, 0.16)';
    ctx.beginPath();
    ctx.ellipse(car.x, car.y, l * 0.75, w * 0.95, car.angle, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.save();
  ctx.translate(car.x + 7, car.y + 5);
  ctx.rotate(car.angle);
  ctx.fillStyle = 'rgba(48, 28, 22, 0.30)';
  ctx.beginPath();
  ctx.roundRect(-l / 2, -w / 2, l, w, 7);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);

  // Tyres first, so the body sits on top of them.
  ctx.fillStyle = COLOURS.tyre;
  ctx.fillRect(-l * 0.34, -w / 2 - 1.5, 9, 4);
  ctx.fillRect(-l * 0.34, w / 2 - 2.5, 9, 4);
  ctx.fillRect(l * 0.24, -w / 2 - 1.5, 9, 4);
  ctx.fillRect(l * 0.24, w / 2 - 2.5, 9, 4);

  // Body, with a darker sill and a highlight along the sunward edge.
  ctx.fillStyle = car.dead ? '#3b3531' : car.colour;
  ctx.beginPath();
  ctx.roundRect(-l / 2, -w / 2, l, w, 6);
  ctx.fill();
  ctx.strokeStyle = car.dead ? 'rgba(20, 16, 14, 0.6)' : 'rgba(32, 22, 20, 0.45)';
  ctx.lineWidth = 1.6;
  ctx.stroke();
  if (car.driver === 'player' && !car.dead) {
    ctx.strokeStyle = 'rgba(255, 210, 122, 0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(-l / 2 - 1.5, -w / 2 - 1.5, l + 3, w + 3, 7);
    ctx.stroke();
  }
  if (!car.dead) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.beginPath();
    ctx.roundRect(-l / 2 + 4, -w / 2 + 2, l - 8, 3, 2);
    ctx.fill();
  }

  // Cabin: roof panel with windscreen and rear glass, then the side windows.
  ctx.fillStyle = car.dead ? '#2b2725' : car.roof;
  ctx.beginPath();
  ctx.roundRect(-l * 0.2, -w * 0.34, l * 0.44, w * 0.68, 4);
  ctx.fill();
  ctx.fillStyle = car.dead ? '#33383a' : COLOURS.carGlassDark;
  ctx.fillRect(l * 0.19, -w * 0.3, l * 0.1, w * 0.6);
  ctx.fillRect(-l * 0.33, -w * 0.28, l * 0.09, w * 0.56);
  ctx.fillStyle = car.dead ? 'rgba(40, 44, 46, 0.8)' : 'rgba(170, 214, 224, 0.55)';
  ctx.fillRect(-l * 0.08, -w * 0.38, l * 0.2, 2);
  ctx.fillRect(-l * 0.08, w * 0.38 - 2, l * 0.2, 2);

  // Taxi sign and police livery: the two cars you can name from across the street.
  if (car.kind === 'taxi' && !car.dead) {
    ctx.fillStyle = '#2b2a28';
    ctx.beginPath();
    ctx.roundRect(-l * 0.06, -w * 0.16, l * 0.14, w * 0.32, 2);
    ctx.fill();
    ctx.fillStyle = '#ffd25a';
    ctx.beginPath();
    ctx.roundRect(-l * 0.05, -w * 0.12, l * 0.12, w * 0.24, 2);
    ctx.fill();
  }
  if (car.police && !car.dead) {
    ctx.fillStyle = COLOURS.policeStripe;
    ctx.fillRect(-l * 0.14, -w / 2 + 1, l * 0.28, w * 0.16);
    ctx.fillRect(-l * 0.14, w / 2 - w * 0.16 - 1, l * 0.28, w * 0.16);
  }

  // Lights: warm at the nose, red at the tail.
  ctx.fillStyle = car.dead ? '#5a4a3e' : COLOURS.headlight;
  ctx.fillRect(l / 2 - 3, -w * 0.36, 3, 4.5);
  ctx.fillRect(l / 2 - 3, w * 0.36 - 4.5, 3, 4.5);
  ctx.fillStyle = car.dead ? '#5c2f2a' : COLOURS.taillight;
  ctx.fillRect(-l / 2, -w * 0.36, 2.6, 4.5);
  ctx.fillRect(-l / 2, w * 0.36 - 4.5, 2.6, 4.5);
  if (!car.dead) {
    ctx.fillStyle = 'rgba(255, 234, 181, 0.10)';
    ctx.beginPath();
    ctx.moveTo(l / 2, -w * 0.34);
    ctx.lineTo(l / 2 + 18, -w * 0.78);
    ctx.lineTo(l / 2 + 18, w * 0.78);
    ctx.lineTo(l / 2, w * 0.34);
    ctx.closePath();
    ctx.fill();
  }

  // The light bar: a white bridge with a red and a blue lamp, flashing in opposition.
  if (car.police && !car.dead) {
    const flash = Math.sin(time * 11 + car.sirenPhase);
    const redOn = flash > 0;
    policeGlow(ctx, car, time);
    ctx.fillStyle = '#1d2026';
    ctx.beginPath();
    ctx.roundRect(-l * 0.08, -w * 0.56, l * 0.22, w * 1.12, 2);
    ctx.fill();
    ctx.fillStyle = redOn ? '#ff4a36' : '#6b2f2b';
    ctx.beginPath();
    ctx.roundRect(-l * 0.07, -w * 0.5, l * 0.19, w * 0.46, 1.5);
    ctx.fill();
    ctx.fillStyle = redOn ? '#28447c' : '#3f8bff';
    ctx.beginPath();
    ctx.roundRect(-l * 0.07, w * 0.04, l * 0.19, w * 0.46, 1.5);
    ctx.fill();
    ctx.fillStyle = '#fff8ec';
    ctx.beginPath();
    ctx.arc(-l * 0.02, redOn ? -w * 0.27 : w * 0.27, 2.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(-l * 0.08, -w * 0.56, l * 0.22, w * 1.12, 2);
    ctx.stroke();
  }

  // Battle damage: a few dark scuffs once the paint has been traded away.
  if (car.hp < car.maxHp * 0.55) {
    ctx.fillStyle = 'rgba(30, 24, 22, 0.45)';
    ctx.beginPath();
    ctx.roundRect(-l * 0.1, -w * 0.28, l * 0.16, w * 0.2, 2);
    ctx.roundRect(l * 0.06, w * 0.06, l * 0.12, w * 0.18, 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawPed(ctx, ped) {
  const size = 1;
  if (!ped.alive) {
    ctx.save();
    ctx.translate(ped.x, ped.y);
    ctx.rotate(ped.angle + 0.9);
    ctx.fillStyle = 'rgba(48, 28, 22, 0.25)';
    ctx.beginPath();
    ctx.ellipse(5, 4, 16, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = ped.pants;
    ctx.beginPath();
    ctx.roundRect(-12, -5, 20, 10, 4);
    ctx.fill();
    ctx.fillStyle = ped.shirt;
    ctx.beginPath();
    ctx.roundRect(-3, -6, 14, 12, 5);
    ctx.fill();
    ctx.fillStyle = ped.skin;
    ctx.beginPath();
    ctx.arc(12, 0, 4.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }
  const swing = Math.sin(ped.phase) * 3;
  ctx.fillStyle = 'rgba(48, 28, 22, 0.24)';
  ctx.beginPath();
  ctx.ellipse(ped.x + 5, ped.y + 4, 10, 5.5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(ped.x, ped.y);
  ctx.rotate(ped.angle);
  ctx.scale(size, size);

  ctx.fillStyle = ped.pants;
  ctx.beginPath();
  ctx.roundRect(-10 + swing * 0.6, -5.5, 9, 4.5, 2);
  ctx.roundRect(-10 - swing * 0.6, 1, 9, 4.5, 2);
  ctx.fill();

  ctx.fillStyle = ped.shirt;
  ctx.beginPath();
  ctx.roundRect(-6, -6.5, 14, 13, 5);
  ctx.fill();
  ctx.strokeStyle = 'rgba(40, 24, 20, 0.3)';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = ped.skin;
  ctx.beginPath();
  if (ped.panic > 0) {
    ctx.arc(0, -8.5, 2.6, 0, Math.PI * 2);
    ctx.arc(0, 8.5, 2.6, 0, Math.PI * 2);
  } else {
    ctx.arc(0.5 - swing * 0.3, -7.4, 2.5, 0, Math.PI * 2);
    ctx.arc(0.5 + swing * 0.3, 7.4, 2.5, 0, Math.PI * 2);
  }
  ctx.fill();

  ctx.fillStyle = ped.skin;
  ctx.beginPath();
  ctx.arc(4.2, 0, 4.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = ped.hair;
  ctx.beginPath();
  ctx.arc(2.6, 0, 3.8, Math.PI * 0.5, Math.PI * 1.5);
  ctx.fill();
  ctx.restore();
}

function drawOfficer(ctx, officer) {
  if (officer.down || officer.hp <= 0) {
    ctx.save();
    ctx.translate(officer.x, officer.y);
    ctx.rotate(officer.angle + 0.8);
    ctx.fillStyle = 'rgba(48, 28, 22, 0.25)';
    ctx.beginPath();
    ctx.ellipse(5, 4, 15, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#24324a';
    ctx.beginPath();
    ctx.roundRect(-12, -5, 22, 10, 4);
    ctx.fill();
    ctx.fillStyle = '#c98b63';
    ctx.beginPath();
    ctx.arc(13, 0, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }
  const swing = Math.sin(officer.walk) * 2.6;
  ctx.fillStyle = 'rgba(48, 28, 22, 0.26)';
  ctx.beginPath();
  ctx.ellipse(officer.x + 5, officer.y + 4, 11, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.translate(officer.x, officer.y);
  ctx.rotate(officer.angle);
  ctx.fillStyle = '#26344c';
  ctx.beginPath();
  ctx.roundRect(-10 + swing * 0.6, -6, 9, 4.8, 2);
  ctx.roundRect(-10 - swing * 0.6, 1.2, 9, 4.8, 2);
  ctx.fill();
  ctx.fillStyle = '#2c3f5e';
  ctx.beginPath();
  ctx.roundRect(-6, -7, 15, 14, 5);
  ctx.fill();
  ctx.strokeStyle = 'rgba(16, 22, 34, 0.5)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = '#8fb6ff';
  ctx.fillRect(-2, -6, 3, 12);
  ctx.fillStyle = '#c98b63';
  ctx.beginPath();
  ctx.arc(0.5 - swing * 0.3, -7.8, 2.4, 0, Math.PI * 2);
  ctx.arc(0.5 + swing * 0.3, 7.8, 2.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#c98b63';
  ctx.beginPath();
  ctx.arc(4.4, 0, 4.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1b2230';
  ctx.beginPath();
  ctx.arc(3.4, 0, 4.6, Math.PI * 0.55, Math.PI * 1.45);
  ctx.fill();
  ctx.fillStyle = '#15181e';
  ctx.fillRect(9, -1.4, 8, 2.8);
  ctx.restore();
}

function drawMissionMarker(ctx, mission, time) {
  if (mission === null || !mission.active) return;
  const pulse = 0.5 + 0.5 * Math.sin(time * 3.2);
  const x = mission.target.x;
  const y = mission.target.y;
  ctx.save();
  const glow = ctx.createRadialGradient(x, y, 4, x, y, 62);
  glow.addColorStop(0, 'rgba(255, 211, 77, 0.35)');
  glow.addColorStop(1, 'rgba(255, 211, 77, 0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, 62, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = `rgba(255, 211, 77, ${0.55 + pulse * 0.35})`;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(x, y, 28 + pulse * 7, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255, 244, 210, 0.7)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x, y, 17, 0, Math.PI * 2);
  ctx.stroke();

  ctx.translate(x, y - 4 - pulse * 3);
  ctx.rotate(Math.PI / 4);
  ctx.fillStyle = COLOURS.mission;
  ctx.beginPath();
  ctx.roundRect(-7, -7, 14, 14, 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(40, 28, 16, 0.7)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}

function drawDecals(ctx, world) {
  for (const decal of world.decals) {
    if (!inView(view, decal.x - 40, decal.y - 40, 80, 80)) continue;
    const alpha = Math.min(1, decal.life / 4);
    if (decal.type === 'blood') {
      ctx.fillStyle = `rgba(104, 28, 32, ${0.55 * alpha})`;
      ctx.beginPath();
      ctx.ellipse(decal.x, decal.y, decal.r * 1.25, decal.r * 0.85, decal.angle, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(66, 16, 22, ${0.45 * alpha})`;
      ctx.beginPath();
      ctx.ellipse(decal.x + 3, decal.y + 2, decal.r * 0.7, decal.r * 0.45, decal.angle + 0.4, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = `rgba(30, 26, 24, ${0.5 * alpha})`;
      ctx.beginPath();
      ctx.arc(decal.x, decal.y, decal.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawBullets(ctx, world) {
  for (const bullet of world.bullets) {
    if (!inView(view, bullet.x - 20, bullet.y - 20, 40, 40)) continue;
    const len = 0.016;
    ctx.strokeStyle = 'rgba(255, 226, 150, 0.35)';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(bullet.x - bullet.vx * len, bullet.y - bullet.vy * len);
    ctx.lineTo(bullet.x, bullet.y);
    ctx.stroke();
    ctx.strokeStyle = '#fff4c8';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

function drawEffects(ctx, world) {
  for (const item of world.effects) {
    if (!inView(view, item.x - 50, item.y - 50, 100, 100)) continue;
    const t = Math.max(0, Math.min(1, item.life / item.max));
    if (item.type === 'spark') {
      ctx.globalAlpha = t;
      ctx.strokeStyle = item.colour;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(item.x, item.y);
      ctx.lineTo(item.x - item.vx * 0.018, item.y - item.vy * 0.018);
      ctx.stroke();
      ctx.globalAlpha = 1;
    } else if (item.type === 'flash') {
      ctx.save();
      ctx.translate(item.x, item.y);
      ctx.rotate(item.angle);
      const glow = ctx.createRadialGradient(0, 0, 1, 0, 0, 26);
      glow.addColorStop(0, 'rgba(255, 246, 207, 0.9)');
      glow.addColorStop(0.4, 'rgba(255, 196, 90, 0.5)');
      glow.addColorStop(1, 'rgba(255, 170, 60, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(0, 0, 26, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fffbe8';
      ctx.beginPath();
      ctx.moveTo(13, 0);
      ctx.lineTo(2, 4);
      ctx.lineTo(4, 0);
      ctx.lineTo(2, -4);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    } else if (item.type === 'blood') {
      ctx.globalAlpha = t;
      ctx.fillStyle = COLOURS.blood;
      ctx.beginPath();
      ctx.arc(item.x, item.y, item.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    } else if (item.type === 'smoke') {
      const grow = 1 + (1 - t) * 2.4;
      ctx.globalAlpha = 0.32 * t;
      ctx.fillStyle = COLOURS.smoke;
      ctx.beginPath();
      ctx.arc(item.x, item.y, item.r * grow, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    } else if (item.type === 'boom') {
      const grow = 1 + (1 - t) * 3;
      ctx.globalAlpha = t;
      ctx.strokeStyle = '#ffd08a';
      ctx.lineWidth = 5 * t;
      ctx.beginPath();
      ctx.arc(item.x, item.y, item.r * grow, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255, 154, 60, 0.55)';
      ctx.beginPath();
      ctx.arc(item.x, item.y, item.r * grow * 0.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
}

function drawStreetEntities(ctx, world, time) {
  const cars = world.vehicles;
  for (let i = 0; i < cars.length; i += 1) {
    const car = cars[i];
    if (!inView(view, car.x - 60, car.y - 60, 120, 120)) continue;
    drawVehicle(ctx, car, time);
  }
  const peds = world.peds;
  for (let i = 0; i < peds.length; i += 1) {
    const ped = peds[i];
    if (!inView(view, ped.x - 30, ped.y - 30, 60, 60)) continue;
    drawPed(ctx, ped);
  }
  for (let i = 0; i < world.officers.length; i += 1) {
    const officer = world.officers[i];
    if (!inView(view, officer.x - 30, officer.y - 30, 60, 60)) continue;
    drawOfficer(ctx, officer);
  }
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
  drawDecals(ctx, world);
  drawMissionMarker(ctx, world.mission, world.time);
  drawStreetEntities(ctx, world, world.time);
  drawBullets(ctx, world);
  drawEffects(ctx, world);
  if (world.player.mode !== 'car') drawPlayer(ctx, world.player);

  ctx.restore();
  drawAtmosphere(ctx, W, H, world);
}
