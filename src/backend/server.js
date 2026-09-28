// Zero-dependency HTTP server: REST API + Server-Sent Events + static frontend.
import http from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { engine } from './engine.js';
import { scanSource, probeCard } from './cameras.js';
import {
  listVolumes,
  listPhysical,
  watchVolumes,
  statPath,
  ejectVolume
} from './disks.js';
import {
  getSettings,
  saveSettings,
  recoverInterrupted,
  listJobs,
  getJob,
  deleteJob,
  DATA_DIR
} from './store.js';
import { isoLocal } from '../shared/util.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, '../../public');
const PORT = Number(process.env.PORT) || 5218;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

// ---------------- SSE ----------------

const sseClients = new Set();
function sseSend(data) {
  const line = `data: ${JSON.stringify(data)}\n\n`;
  for (const res of sseClients) res.write(line);
}
engine.on('progress', (id) => sseSend({ kind: 'progress', id }));
engine.on('job', (id) => sseSend({ kind: 'job', id }));
engine.on('log', (id, entry) => sseSend({ kind: 'log', id, entry }));

watchVolumes(async (vols, added) => {
  sseSend({ kind: 'volumes' });
  // Only volumes that look like camera cards raise a card-inserted event,
  // enriched with the detected camera brand.
  for (const a of added) {
    try {
      let info = await probeCard(a.path);
      // Readers can take a moment to spin up; one delayed retry prevents a
      // slow first readdir from permanently missing the card event.
      if (!info.isCard) {
        await new Promise((r) => setTimeout(r, 1500));
        info = await probeCard(a.path);
      }
      if (info.isCard) {
        sseSend({
          kind: 'card-inserted',
          mount: a.mount,
          label: a.label,
          free: a.free,
          brand: info.brand,
          cameraLabel: info.cameraLabel
        });
      }
    } catch {
      /* probing is best-effort */
    }
  }
});

// ---------------- helpers ----------------

function sendJSON(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > 4 * 1024 * 1024) {
        reject(new Error('Body too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

async function browseDir(dir) {
  const abs = path.resolve(dir);
  const entries = await readdir(abs, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b));
}

async function serveDownload(res, absPath, job) {
  const resolved = path.resolve(absPath);
  const ext = path.extname(resolved).toLowerCase();
  if (!['.mhl', '.csv', '.html'].includes(ext)) return sendJSON(res, 403, { error: 'Not allowed' });
  const allowedRoots = [DATA_DIR];
  for (const t of job.targets) allowedRoots.push(path.resolve(t.path));
  if (!allowedRoots.some((root) => resolved === root || resolved.startsWith(root + path.sep))) {
    return sendJSON(res, 403, { error: 'Path outside allowed roots' });
  }
  const data = await readFile(resolved);
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Content-Disposition': `inline; filename="${path.basename(resolved)}"`
  });
  res.end(data);
}

// ---------------- routes ----------------

async function handleApi(req, res, url) {
  const { method } = req;
  const p = url.pathname;
  const q = url.searchParams;

  if (p === '/api/state' && method === 'GET') {
    const [settings, volumes, physical, jobs] = await Promise.all([
      getSettings(),
      listVolumes(),
      listPhysical(),
      listJobs()
    ]);
    // Strip bulky file lists for the overview.
    const slimJobs = jobs.map((j) => ({
      ...j,
      sources: j.sources.map((s) => ({
        ...s,
        files: undefined,
        clips: undefined
      }))
    }));
    return sendJSON(res, 200, { settings, volumes, physical, jobs: slimJobs });
  }

  if (p === '/api/browse' && method === 'GET') {
    const dir = q.get('dir') || os.homedir();
    try {
      const dirs = await browseDir(dir);
      return sendJSON(res, 200, { dir: path.resolve(dir), dirs });
    } catch (e) {
      return sendJSON(res, 400, { error: e.message });
    }
  }

  if (p === '/api/path-space' && method === 'GET') {
    const st = await statPath(q.get('path') || '.');
    return sendJSON(res, 200, st || { error: 'unavailable' });
  }

  if (p === '/api/settings') {
    if (method === 'GET') return sendJSON(res, 200, await getSettings());
    if (method === 'PUT' || method === 'POST') {
      const body = await readBody(req);
      return sendJSON(res, 200, await saveSettings(body));
    }
  }

  if (p === '/api/scan' && method === 'POST') {
    const body = await readBody(req);
    try {
      return sendJSON(res, 200, await scanSource(body.path));
    } catch (e) {
      return sendJSON(res, 400, { error: e.message });
    }
  }

  if (p === '/api/jobs' && method === 'POST') {
    const body = await readBody(req);
    try {
      const job = await engine.createJob(body);
      return sendJSON(res, 200, job);
    } catch (e) {
      return sendJSON(res, 400, { error: e.message });
    }
  }

  if (p === '/api/jobs' && method === 'GET') {
    return sendJSON(res, 200, await listJobs());
  }

  // Clear history: delete every job that is not currently running.
  if (p === '/api/jobs' && method === 'DELETE') {
    const jobs = await listJobs();
    let removed = 0;
    for (const j of jobs) {
      if (j.status === 'running' || j.status === 'canceling') continue;
      await deleteJob(j.id);
      removed++;
    }
    return sendJSON(res, 200, { ok: true, removed });
  }

  let m = p.match(/^\/api\/jobs\/([^/]+)$/);
  if (m && method === 'GET') {
    let job = engine.snapshot(m[1]);
    if (!job) job = await getJob(m[1]);
    if (!job) return sendJSON(res, 404, { error: 'not found' });
    return sendJSON(res, 200, job);
  }

  m = p.match(/^\/api\/jobs\/([^/]+)$/);
  if (m && method === 'DELETE') {
    const id = m[1];
    if (!/^[a-f0-9]{6,32}$/i.test(id)) return sendJSON(res, 400, { error: 'bad id' });
    const job = engine.snapshot(id) || (await getJob(id));
    if (!job) return sendJSON(res, 404, { error: 'not found' });
    if (job.status === 'running' || job.status === 'canceling') {
      return sendJSON(res, 409, { error: 'job is running' });
    }
    await deleteJob(id);
    return sendJSON(res, 200, { ok: true });
  }

  m = p.match(/^\/api\/jobs\/([^/]+)\/eject$/);
  if (m && method === 'POST') {
    const body = await readBody(req);
    const job = await getJob(m[1]);
    if (!job) return sendJSON(res, 404, { error: 'job not found' });
    const source = job.sources.find((s) => s.id === body.sourceId);
    if (!source) return sendJSON(res, 404, { error: 'source not found' });
    const letter = source.path.match(/^([A-Za-z]):/);
    if (!letter) return sendJSON(res, 200, { ok: true, virtual: true });
    const result = await ejectVolume(letter[1]);
    return sendJSON(res, result.ok ? 200 : 400, result);
  }

  m = p.match(/^\/api\/jobs\/([^/]+)\/(start|cancel|retry)$/);
  if (m && method === 'POST') {
    const [, id, action] = m;
    try {
      if (action === 'cancel') {
        await engine.cancel(id);
        return sendJSON(res, 200, { ok: true });
      }
      const job = await engine.start(id);
      return sendJSON(res, 200, job);
    } catch (e) {
      return sendJSON(res, 400, { error: e.message });
    }
  }

  m = p.match(/^\/api\/download\/([^/]+)$/);
  if (m && method === 'GET') {
    const job = await getJob(m[1]);
    if (!job) return sendJSON(res, 404, { error: 'job not found' });
    const idx = Number(q.get('i'));
    const entry = Number.isInteger(idx) ? job.reports[idx] : null;
    if (!entry) return sendJSON(res, 404, { error: 'no such report' });
    try {
      return await serveDownload(res, entry.absPath, job);
    } catch (e) {
      return sendJSON(res, 400, { error: e.message });
    }
  }

  return sendJSON(res, 404, { error: 'unknown endpoint' });
}

// ---------------- static ----------------

async function serveStatic(req, res, url) {
  let rel = url.pathname === '/' ? '/index.html' : url.pathname;
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end();
  }
  try {
    const data = await readFile(file);
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname.startsWith('/api/')) {
      if (url.pathname === '/api/events') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive'
        });
        res.write(`: connected ${isoLocal()}\n\n`);
        sseClients.add(res);
        req.on('close', () => sseClients.delete(res));
        return;
      }
      return await handleApi(req, res, url);
    }
    return await serveStatic(req, res, url);
  } catch (e) {
    sendJSON(res, 500, { error: e.message });
  }
});

async function boot() {
  const interrupted = await recoverInterrupted();
  server.listen(PORT, '127.0.0.1', () => {
    console.log(`\n  eCOPY running → http://localhost:${PORT}\n`);
    if (interrupted.length) {
      console.log(`  ${interrupted.length} interrupted job(s) recovered — open the app to resume.`);
    }
  });
}

boot();
