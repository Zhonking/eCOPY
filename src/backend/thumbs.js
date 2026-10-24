// Thumbnail extraction: JPGs are served as-is; RAW files yield their
// embedded JPEG preview. Every RAW flavour (NEF/CR2/CR3/ARW/RAF/ORF/RW2/
// PEF/DNG/X3F/INSP) carries a full-size JPEG preview inside the file, and
// the largest FFD8FF…FFD9 span IS that preview — false marker hits inside
// compressed image data only ever produce smaller spans and lose to the
// real one, so no per-vendor container parsing is needed.
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

export const JPG_EXTS = new Set(['.jpg', '.jpeg']);
export const RAW_EXTS = new Set([
  '.nef', '.nrw', '.arw', '.cr2', '.cr3', '.raf', '.orf',
  '.rw2', '.pef', '.dng', '.x3f', '.insp'
]);

// Refuse absurdly large RAWs (medium-format sweeps) rather than slurp them.
const MAX_RAW_BYTES = 256 * 1024 * 1024;

// Small in-memory cache keyed by path|size|mtime — popup re-opens and the
// two boundary images are served from RAM instead of re-scanning the RAW.
const cache = new Map();
const CACHE_CAP = 48;

function cachePut(key, buf) {
  if (cache.size >= CACHE_CAP) cache.delete(cache.keys().next().value);
  cache.set(key, buf);
}

const SOI = Buffer.from([0xff, 0xd8, 0xff]); // SOI + start of the first marker
const EOI = Buffer.from([0xff, 0xd9]);

export function extractJpegFromRaw(buf) {
  let best = null;
  let i = buf.indexOf(SOI);
  while (i !== -1) {
    const e = buf.indexOf(EOI, i + 3);
    if (e === -1) break; // unterminated preview — nothing usable beyond
    const end = e + 2;
    if (!best || end - i > best.end - best.start) best = { start: i, end };
    i = buf.indexOf(SOI, end);
  }
  return best;
}

// Real JPEGs run to at least a few hundred bytes; marker artifacts found
// inside compressed pixel data are tiny. 300 bytes separates them without
// rejecting genuinely small embedded thumbnails.
const MIN_PREVIEW_BYTES = 300;

// Returns { buf, mime } for a preview image, or null when none exists.
// Throws only when the file cannot be read/stat'ed (caller → 404).
export async function readThumb(absPath) {
  const ext = path.extname(absPath).toLowerCase();
  const s = await stat(absPath);
  if (!s.isFile()) return null;
  const key = `${absPath}|${s.size}|${Math.floor(s.mtimeMs)}`;
  const hit = cache.get(key);
  if (hit) return { buf: hit, mime: 'image/jpeg' };

  if (JPG_EXTS.has(ext)) {
    const buf = await readFile(absPath);
    cachePut(key, buf);
    return { buf, mime: 'image/jpeg' };
  }
  if (!RAW_EXTS.has(ext) || s.size > MAX_RAW_BYTES) return null;

  const buf = await readFile(absPath);
  const best = extractJpegFromRaw(buf);
  if (!best || best.end - best.start < MIN_PREVIEW_BYTES) return null;
  // Copy out of the (potentially huge) RAW buffer: a subarray view would
  // pin the whole 50MB+ file in memory for as long as the cache holds it.
  const jpg = Buffer.from(buf.subarray(best.start, best.end));
  cachePut(key, jpg);
  return { buf: jpg, mime: 'image/jpeg' };
}
