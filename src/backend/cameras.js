// Camera-card detection & metadata extraction.
// Supports ARRI (AVF/MXF + ARRIMEDIA/.ari), RED (.RDC/.R3D),
// Sony (XAVC M4ROOT, XDCAM PRO/, Venice PRIVATE/SONY),
// Blackmagic (.braw / reel folders), Canon (.crm / CONTENTS / DCIM), generic DCF.
import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, dirname, normalizeRel } from '../shared/util.js';

const MEDIA_EXTS = new Set([
  '.r3d', '.braw', '.crm', '.ari', '.mxf', '.mp4', '.mov', '.mts', '.m2ts', '.m4v', '.avi'
]);
const SIDECAR_EXTS = new Set(['.xml', '.rmd', '.sidecar', '.smi', '.cxml', '.mif']);

export const CAMERA_INFO = {
  ARRI: { label: 'ARRI', color: '#e10022' },
  RED: { label: 'RED', color: '#e60012' },
  SONY: { label: 'Sony', color: '#c8c9cc' },
  BLACKMAGIC: { label: 'Blackmagic', color: '#ec6699' },
  CANON: { label: 'Canon', color: '#cc0000' },
  PANASONIC: { label: 'Panasonic', color: '#0a6ebd' },
  GENERIC: { label: 'Generic / DCF', color: '#8b93a7' }
};

async function walk(root) {
  const out = [];
  async function rec(dir, rel) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const relPath = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        await rec(`${dir}/${e.name}`, relPath);
      } else if (e.isFile()) {
        out.push(relPath);
      }
    }
  }
  await rec(root, '');
  return out.map(normalizeRel);
}

// Shallow walk (files AND directories), depth-capped — used to quickly
// recognise a camera card without hashing or reading whole volumes.
async function walkShallow(root, maxDepth = 3) {
  const out = [];
  async function rec(dir, rel, depth) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const relPath = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        out.push(relPath);
        if (depth < maxDepth) await rec(`${dir}/${e.name}`, relPath, depth + 1);
      } else if (e.isFile()) {
        out.push(relPath);
      }
    }
  }
  await rec(root, '', 1);
  return out.map(normalizeRel);
}

// Fast, non-blocking camera-card probe for a freshly mounted volume.
// Never throws and self-times-out so a slow/spinning-up reader can't
// stall volume watching.
export async function probeCard(rootPath, timeoutMs = 4000) {
  const fail = {
    path: rootPath,
    isCard: false,
    brand: 'GENERIC',
    structure: 'UNKNOWN',
    cameraLabel: CAMERA_INFO.GENERIC.label,
    color: CAMERA_INFO.GENERIC.color
  };
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(null), timeoutMs);
  });
  const work = (async () => {
    const paths = await walkShallow(rootPath.replace(/[\\/]+$/, ''), 3);
    const det = detectCamera(paths);
    const info = CAMERA_INFO[det.brand] || CAMERA_INFO.GENERIC;
    return {
      path: rootPath,
      isCard: det.structure !== 'UNKNOWN',
      brand: det.brand,
      structure: det.structure,
      cameraLabel: info.label,
      color: info.color
    };
  })();
  const result = await Promise.race([work, timeout]);
  clearTimeout(timer);
  return result || fail;
}

function lowerSet(paths) {
  return paths.map((p) => p.toLowerCase());
}

export function detectCamera(paths) {
  const p = lowerSet(paths);
  const has = (pred) => p.some(pred);
  const hasDir = (dir) => p.some((x) => x === dir || x.startsWith(dir + '/'));

  if (has((x) => x.endsWith('.r3d'))) return { brand: 'RED', structure: 'RED_R3D' };
  // RED card layout: DCIM/101RED01/<clip>.RDC directory (may appear before .R3D in a shallow walk).
  if (has((x) => /\.rdc$/.test(x))) return { brand: 'RED', structure: 'RED_RDC' };
  if (has((x) => x.endsWith('.braw'))) return { brand: 'BLACKMAGIC', structure: 'BMD_BRAW' };
  if (has((x) => x.endsWith('.crm'))) return { brand: 'CANON', structure: 'CANON_CRM' };
  if (hasDir('avf') || hasDir('arrimedia') || has((x) => x.endsWith('.ari'))) {
    return { brand: 'ARRI', structure: hasDir('arrimedia') || has((x) => x.endsWith('.ari')) ? 'ARRI_ARRIRAW' : 'ARRI_MXF' };
  }
  if (hasDir('private/m4root')) return { brand: 'SONY', structure: 'SONY_XAVC' };
  if (p.some((x) => x.startsWith('private/sony/'))) return { brand: 'SONY', structure: 'SONY_VENICE' };
  if (hasDir('pro/clip')) return { brand: 'SONY', structure: 'SONY_XDCAM' };
  if (hasDir('contents') && has((x) => x.endsWith('.mxf'))) return { brand: 'CANON', structure: 'CANON_XF' };
  if (hasDir('private/pana_grp') || has((x) => x.endsWith('.rdf'))) return { brand: 'PANASONIC', structure: 'PANA_P2' };
  // BMD reel folders at root: A001/...braw/mov
  if (has((x) => /^[a-z]\d{3}\//.test(x) && /\.(mov|braw)$/.test(x))) {
    return { brand: 'BLACKMAGIC', structure: 'BMD_REEL' };
  }
  if (hasDir('dcim')) {
    if (has((x) => /dcim\/\d*canon/.test(x))) return { brand: 'CANON', structure: 'CANON_DCF' };
    if (has((x) => /dcim\/\d*pana/.test(x))) return { brand: 'PANASONIC', structure: 'PANA_DCF' };
    return { brand: 'GENERIC', structure: 'DCF' };
  }
  return { brand: 'GENERIC', structure: 'UNKNOWN' };
}

// ---------- metadata extraction ----------

function grab(text, patterns) {
  for (const re of patterns) {
    const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
    let m;
    while ((m = g.exec(text))) {
      if (m[1] != null && String(m[1]).trim() !== '') return String(m[1]).trim();
    }
  }
  return null;
}

function extractMetadata(text) {
  const meta = {};
  meta.reel = grab(text, [
    /<Reel(?:Name)?[^>]*>([^<]+)</i,
    /<Tape(?:Name)?[^>]*>([^<]+)</i,
    /\breel[:=]\s*([A-Za-z0-9_-]+)/i
  ]);
  meta.scene = grab(text, [
    /<Scene(?:Name)?[^>]*>([^<]+)</i,
    /<SB_MARKER_SCENE[^>]*>([^<]+)</i,
    /\bscene[:=]\s*([A-Za-z0-9_.-]+)/i
  ]);
  meta.take = grab(text, [
    /<Take(?:Name|Number)?[^>]*>(\d+)</i,
    /<SB_MARKER_TAKE[^>]*>([^<]+)</i,
    /\btake[:=]\s*(\d+)/i
  ]);
  meta.tcStart = grab(text, [
    /<LTC[^>]*startDate="([^"]+)"/i,
    /<TcStart[^>]*>([^<]+)</i,
    /<Start(?:Timecode)?[^>]*>([^<]+)</i,
    /<Timecode(?:Start)?[^>]*>([^<]+)</i,
    /start[ _]timecode[:=\s]+([\d:.]+)/i
  ]);
  meta.fps = grab(text, [
    /<FrameRate[^>]*>([0-9.]+)</i,
    /videoFrame="(\d+(?:\.\d+)?)(?:p|i)?"/i,
    /frame[ _]rate[:=\s]+([0-9.]+)/i
  ]);
  meta.model = grab(text, [
    /<Parameter[^>]*name="Camera"[^>]*value="([^"]+)"/i,
    /<Camera(?:Model)?[^>]*>([^<]+)</i,
    /<Model(?:Name)?[^>]*>([^<]+)</i,
    /modelName="([^"]+)"/i
  ]);
  meta.serial = grab(text, [/serialNo="([^"]+)"/i, /<Serial(?:Number)?[^>]*>([^<]+)</i]);
  meta.colorSpace = grab(text, [
    /<Color(?:Space|Processing)[^>]*>([^<]+)</i,
    /colorSpace="([^"]+)"/i,
    /colou?r[ _]space[:=\s]+(.+)/i
  ]);
  meta.codec = grab(text, [
    /<(?:Video)?Codec[^>]*>([^<]+)</i,
    /<VideoFormat[^>]*>([^<]+)</i,
    /codec[:=\s]+([A-Za-z0-9._/-]+)/i
  ]);
  meta.audioChannels = grab(text, [
    /<AudioFormat[^>]*numTrack="(\d+)"/i,
    /<AudioChannels?[^>]*>(\d+)</i,
    /channels="(\d+)"/i
  ]);
  meta.lut = grab(text, [/<LUT[^>]*>([^<]+)</i, /<LutName[^>]*>([^<]+)</i]);
  // Drop empties
  for (const k of Object.keys(meta)) if (meta[k] == null || meta[k] === '') delete meta[k];
  return meta;
}

// ARRI/RED/BMD style: A001_C001_.. / A001C002_.. — reel MUST be followed by C or separator.
function parseClipName(name) {
  const m = name.match(/^([A-Z]\d{3})(?:[_\s-]*C|[\s_-])0*(\d{1,3})/i);
  if (m) return { reel: m[1].toUpperCase(), take: String(parseInt(m[2], 10)) };
  return null;
}

// Sony-style clip names: C0001 → take number.
function parseSonyClip(name) {
  const m = name.match(/^[A-Z]?0*(\d{2,4})$/i);
  return m ? { take: String(parseInt(m[1], 10)) } : null;
}

// Determine the shooting date (YYYY-MM-DD) of a file.
// Prefer the date encoded in the clip name:
//   ARRI:   A001C001_21090101_C001.mxf  → YYMMDD (+ camera-id tail)
//           A001C001_20210901_C001      → YYYYMMDD (ALEXA 35+ timestamp)
//   BMD:    A001_C001_0912M0.braw       → MMDD (year from mtime)
//   Canon:  A001_C001_0912KX.CRM        → MMDD (year from mtime)
//   RED:    A001_C001_0501X23.R3D       → MMDD (year from mtime)
// Fall back to the file modification date; null only when neither exists.
export function shootDateOf(relPath, mtimeISO) {
  const name = basename(relPath);
  // ARRI extended timestamp (ALEXA 35+): ..._20210901_... — YYYYMMDD
  let m = name.match(
    /[_\-]((?:19|20|21)\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])(?=[_\-.]|$)/
  );
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  // ARRI classic: ..._21090101_C001 / ..._210421_RN9O — first 6 digits are
  // YYMMDD, followed by an optional camera-id tail, bounded by _ - . or end.
  m = name.match(
    /[_\-](\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\d*(?=[_\-.]|$)/
  );
  if (m) return `20${m[1]}-${m[2]}-${m[3]}`;
  // BMD/Canon: ..._0912M0.braw — MMDD + letter code. RED: ..._0501X23.R3D.
  m = name.match(/[_\-](\d{2})(\d{2})[A-Z]\d*\./i);
  if (m) {
    const year = mtimeISO ? mtimeISO.slice(0, 4) : String(new Date().getFullYear());
    return `${year}-${m[1]}-${m[2]}`;
  }
  return mtimeISO ? mtimeISO.slice(0, 10) : null;
}

function isMedia(relPath) {
  const dot = relPath.lastIndexOf('.');
  return dot >= 0 && MEDIA_EXTS.has(relPath.slice(dot).toLowerCase());
}

async function safeRead(path) {
  try {
    const buf = await readFile(path);
    return buf.toString('utf8');
  } catch {
    return null;
  }
}

export async function scanSource(rootPath, volumeLabel = null) {
  const paths = await walk(rootPath.replace(/[\\/]+$/, ''));
  const detection = detectCamera(paths);
  const clips = [];
  let totalBytes = 0;
  const fileStats = [];

  for (const rel of paths) {
    const full = `${rootPath.replace(/[\\/]+$/, '')}/${rel}`;
    let size = 0;
    let mtimeISO = null;
    try {
      const s = await stat(full);
      size = s.size;
      mtimeISO = s.mtime.toISOString();
    } catch {
      /* ignore */
    }
    totalBytes += size;
    fileStats.push({ rel, size, mtime: mtimeISO, shootDate: shootDateOf(rel, mtimeISO) });
    if (isMedia(rel)) clips.push({ rel, size, mtime: mtimeISO });
  }

  // Read sidecars for each clip (same basename or name-contained siblings).
  const pathLower = new Map(paths.map((p) => [p.toLowerCase(), p]));
  for (const clip of clips) {
    const dir = dirname(clip.rel);
    const stem = basename(clip.rel).replace(/\.[^.]+$/, '');
    const candidates = paths.filter((p) => {
      const ext = p.slice(p.lastIndexOf('.')).toLowerCase();
      if (!SIDECAR_EXTS.has(ext)) return false;
      if (dirname(p) !== dir) return false;
      const ps = basename(p).replace(/\.[^.]+$/, '');
      return ps === stem || ps.startsWith(stem) || stem.startsWith(ps);
    });
    let merged = {};
    for (const c of candidates) {
      const txt = await safeRead(`${rootPath.replace(/[\\/]+$/, '')}/${c}`);
      if (txt) Object.assign(merged, extractMetadata(txt), { _has: true });
    }
    delete merged._has;
    const parsed =
      parseClipName(stem) ||
      (detection.brand === 'SONY' ? parseSonyClip(stem) : {}) ||
      {};
    clip.name = stem;
    clip.shootDate = shootDateOf(clip.rel, clip.mtime);
    clip.model = merged.model || null;
    clip.serial = merged.serial || null;
    clip.reel = merged.reel || parsed.reel || null;
    clip.take = merged.take || parsed.take || null;
    clip.scene = merged.scene || null;
    clip.tcStart = merged.tcStart || null;
    clip.fps = merged.fps || null;
    clip.codec = merged.codec || null;
    clip.colorSpace = merged.colorSpace || null;
    clip.audioChannels = merged.audioChannels || null;
    clip.lut = merged.lut || null;
    clip.sidecars = candidates;
  }

  // Card-level reel: most common clip reel, else volume, else folder name.
  const reelCounts = {};
  for (const c of clips) if (c.reel) reelCounts[c.reel] = (reelCounts[c.reel] || 0) + 1;
  const reel =
    Object.keys(reelCounts).sort((a, b) => reelCounts[b] - reelCounts[a])[0] ||
    volumeLabel ||
    basename(rootPath);

  const models = clips.map((c) => c.model).filter(Boolean);
  const detectedAt = new Date().toISOString();

  // Group media clips by shooting date — drives the wizard's date filter.
  const dateMap = new Map();
  for (const c of clips) {
    if (!c.shootDate) continue;
    const g = dateMap.get(c.shootDate) || { date: c.shootDate, files: 0, bytes: 0 };
    g.files += 1;
    g.bytes += c.size;
    dateMap.set(c.shootDate, g);
  }
  const dates = [...dateMap.values()].sort((a, b) => a.date.localeCompare(b.date));

  return {
    path: rootPath,
    volume: volumeLabel || basename(rootPath),
    brand: detection.brand,
    structure: detection.structure,
    cameraLabel: CAMERA_INFO[detection.brand].label,
    model: models[0] || null,
    reel,
    fileCount: paths.length,
    totalBytes,
    clips,
    files: fileStats,
    dates,
    detectedAt
  };
}
