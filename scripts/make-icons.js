// Generate the eCOPY app icon set with zero dependencies.
// Rasterizes the brand mark (green rounded square + dark check) at 4x,
// downsamples to every needed size, and writes PNGs + a multi-size ICO.
//
//   node scripts/make-icons.js
//
import { deflateSync } from 'node:zlib';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RES = path.join(ROOT, 'resources');

// Brand palette
const GREEN_TOP = [61, 255, 146];
const GREEN_BOT = [34, 201, 109];
const INK = [11, 14, 19];

// Geometry in a 32×32 design space; SHAPE_S leaves a safe margin around the mark.
const SHAPE_S = 0.84;
const RADIUS = 7 * SHAPE_S;
const CHECK_PTS_RAW = [
  [8.6, 16.6],
  [13.4, 21.2],
  [23.6, 9.8]
];
const CHECK_PTS = CHECK_PTS_RAW.map(([x, y]) => [
  16 + (x - 16) * SHAPE_S,
  16 + (y - 16) * SHAPE_S
]);
const CHECK_HALF = 1.75 * SHAPE_S;

// ---------------- rasterization ----------------

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function roundRectSDF(x, y, half, r) {
  // signed distance to a rounded square centred at origin, half-extent `half`
  const qx = Math.abs(x) - half + r;
  const qy = Math.abs(y) - half + r;
  const ax = Math.max(qx, 0);
  const ay = Math.max(qy, 0);
  return Math.hypot(ax, ay) + Math.min(Math.max(qx, qy), 0) - r;
}

function distToSegment(px, py, ax, ay, bx, by) {
  const vx = bx - ax;
  const vy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy)));
  return Math.hypot(px - (ax + vx * t), py - (ay + vy * t));
}

function distToCheck(x, y) {
  let d = Infinity;
  for (let i = 0; i < CHECK_PTS.length - 1; i++) {
    d = Math.min(d, distToSegment(x, y, ...CHECK_PTS[i], ...CHECK_PTS[i + 1]));
  }
  return d;
}

function renderMaster(size, strokeK = 1) {
  // Returns RGBA buffer at `size` (rendered directly with smooth coverage).
  const buf = Buffer.alloc(size * size * 4);
  const scale = 32 / size;
  const edge = scale * 0.9; // ~1 output pixel antialiasing band
  const half = 16 * SHAPE_S;
  const checkHalf = CHECK_HALF * strokeK;

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const x = (px + 0.5) * scale;
      const y = (py + 0.5) * scale;

      // Background rounded square (centred at 16,16)
      const dbg = roundRectSDF(x - 16, y - 16, half, RADIUS);
      const bgA = Math.max(0, Math.min(1, 0.5 - dbg / edge));
      if (bgA <= 0) continue;

      // Vertical gradient (relative to the mark)
      const g = Math.max(0, Math.min(1, (y - (16 - half)) / (2 * half)));
      let r = lerp(GREEN_TOP[0], GREEN_BOT[0], g);
      let gg = lerp(GREEN_TOP[1], GREEN_BOT[1], g);
      let b = lerp(GREEN_TOP[2], GREEN_BOT[2], g);

      // Check mark (round-cap polyline), painted in ink over the green
      const dc = distToCheck(x, y) - checkHalf;
      const cA = Math.max(0, Math.min(1, 0.5 - dc / edge));
      r = lerp(r, INK[0], cA);
      gg = lerp(gg, INK[1], cA);
      b = lerp(b, INK[2], cA);

      const i = (py * size + px) * 4;
      buf[i] = Math.round(r);
      buf[i + 1] = Math.round(gg);
      buf[i + 2] = Math.round(b);
      buf[i + 3] = Math.round(bgA * 255);
    }
  }
  return buf;
}

// ---------------- PNG encoding ----------------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const v of buf) c = CRC_TABLE[(c ^ v) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePNG(rgba, width, height = width) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

// ---------------- ICO packaging ----------------

function encodeICO(images) {
  // images: [{ size, png }]
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type icon
  header.writeUInt16LE(images.length, 4);

  const dir = Buffer.alloc(16 * images.length);
  let offset = 6 + dir.length;
  images.forEach((im, i) => {
    const d = i * 16;
    dir[d] = im.size >= 256 ? 0 : im.size;
    dir[d + 1] = im.size >= 256 ? 0 : im.size;
    dir[d + 2] = 0; // palette
    dir[d + 3] = 0; // reserved
    dir.writeUInt16LE(1, d + 4); // colour planes
    dir.writeUInt16LE(32, d + 6); // bpp
    dir.writeUInt32LE(im.png.length, d + 8);
    dir.writeUInt32LE(offset, d + 12);
    offset += im.png.length;
  });

  return Buffer.concat([header, dir, ...images.map((i) => i.png)]);
}

// ---------------- main ----------------

const SIZES = [16, 24, 32, 48, 64, 128, 256];

// Small icons get slightly thicker strokes so the check stays legible.
const STROKE_K = { 16: 1.38, 24: 1.24, 32: 1.15, 48: 1.08, 64: 1.04, 128: 1, 256: 1 };

const rgbaBySize = new Map();
const pngs = new Map();
for (const s of SIZES) {
  const rgba = renderMaster(s, STROKE_K[s]);
  rgbaBySize.set(s, rgba);
  pngs.set(s, encodePNG(rgba, s));
}

await mkdir(RES, { recursive: true });
await mkdir(path.join(ROOT, 'build'), { recursive: true });

// PNG set (used in-app if needed)
for (const s of SIZES) {
  await writeFile(path.join(RES, `icon-${s}.png`), pngs.get(s));
}

// Multi-size ICO for Windows (exe + taskbar)
const ico = encodeICO(
  [16, 24, 32, 48, 64, 256].map((s) => ({ size: s, png: pngs.get(s) }))
);
await writeFile(path.join(RES, 'icon.ico'), ico);
await writeFile(path.join(ROOT, 'build', 'icon.ico'), ico); // electron-builder convention

// Contact sheet: small sizes nearest-neighbour enlarged, so true pixels are visible.
function nearestEnlarge(src, srcSize, mult) {
  const d = srcSize * mult;
  const out = Buffer.alloc(d * d * 4);
  for (let y = 0; y < d; y++) {
    for (let x = 0; x < d; x++) {
      const si = ((y / mult) | 0) * srcSize + ((x / mult) | 0);
      out[(y * d + x) * 4] = src[si * 4];
      out[(y * d + x) * 4 + 1] = src[si * 4 + 1];
      out[(y * d + x) * 4 + 2] = src[si * 4 + 2];
      out[(y * d + x) * 4 + 3] = src[si * 4 + 3];
    }
  }
  return { rgba: out, size: d };
}

const tiles = [
  nearestEnlarge(rgbaBySize.get(16), 16, 8), // 128
  nearestEnlarge(rgbaBySize.get(32), 32, 6), // 192
  nearestEnlarge(rgbaBySize.get(48), 48, 4) // 192
];
const PAD = 28;
const SHEET_W = PAD + tiles.reduce((a, t) => a + t.size, 0) + PAD * tiles.length;
const SHEET_H = PAD + 192 + PAD;
const sheet = Buffer.alloc(SHEET_W * SHEET_H * 4);
sheet.fill(255); // white, opaque
let cx = PAD;
for (const tile of tiles) {
  for (let y = 0; y < tile.size; y++) {
    tile.rgba.copy(
      sheet,
      ((PAD + y) * SHEET_W + cx) * 4,
      y * tile.size * 4,
      (y + 1) * tile.size * 4
    );
  }
  cx += tile.size + PAD;
}
await writeFile(path.join(ROOT, 'build', 'icon-preview.png'), encodePNG(sheet, SHEET_W, SHEET_H));

console.log(`Icons written: ${SIZES.join('/')} PNG + icon.ico (${(ico.length / 1024).toFixed(1)} KB)`);
