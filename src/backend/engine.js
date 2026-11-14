// Copy engine — the heart of eCOPY.
// Read each source once, fan out to multiple targets concurrently; verify every
// target by independent re-read; resume/incremental via persisted per-file state.
import { EventEmitter } from 'node:events';
import { open, mkdir, unlink, access, rename as fsRename, stat as fsStat } from 'node:fs/promises';
import path from 'node:path';
import { createHasher } from './checksum.js';
import { scanSource } from './cameras.js';
import { statPath } from './disks.js';
import { saveJob, getSettings, getJob } from './store.js';
import { generateReports } from './reports.js';
import { notifyEvent } from './notify.js';
import {
  uid,
  isoLocal,
  renderTemplate,
  renderTemplateVars,
  basename,
  dateStamp,
  clone
} from '../shared/util.js';

const CHUNK = 4 * 1024 * 1024;
const LEG_FILE_INIT = { status: 'pending' };

class AbortError extends Error {}

class Engine extends EventEmitter {
  constructor() {
    super();
    this.cache = new Map(); // jobId -> live job object
    this.controllers = new Map(); // jobId -> AbortController
  }

  log(job, level, msg) {
    job.logs.push({ t: isoLocal(), level, msg });
    if (job.logs.length > 2000) job.logs.shift();
    this.emit('log', job.id, { level, msg });
  }

  snapshot(id) {
    return this.cache.get(id) || null;
  }

  // ---------------- create ----------------

  async createJob(input) {
    const settings = await getSettings();
    const operator = input.operator || settings.operator;
    const algorithm = input.algorithm || settings.algorithm;
    const template = input.template || settings.template;
    const project = input.project || 'Untitled';

    if (!input.sourcePaths?.length && !input.sources?.length) {
      throw new Error('At least one source is required');
    }
    if (!input.targetPaths?.length) throw new Error('At least one target is required');

    // Sources may carry a per-source shooting-date filter:
    //   sources: [{ path, dates: ['2026-09-25', …] }]
    const specs = (
      input.sources?.length
        ? input.sources
        : input.sourcePaths.map((p) => ({ path: p }))
    ).map((s) => (typeof s === 'string' ? { path: s } : s));

    const sources = [];
    for (const spec of specs) {
      const clean = String(spec.path).trim();
      let scanned;
      try {
        scanned = await scanSource(clean);
      } catch (e) {
        throw new Error(`Cannot read source "${clean}": ${e.message}`);
      }
      let keptFiles = scanned.files;
      let keptClips = scanned.clips;
      if (spec.dates?.length) {
        const sel = new Set(spec.dates);
        keptClips = scanned.clips.filter((c) => c.shootDate != null && sel.has(c.shootDate));
        // Sidecars travel with their clip even if their own timestamp differs
        // (copied/generated metadata can carry a later date).
        const keptSidecars = new Set();
        for (const c of keptClips) {
          for (const sb of c.sidecars || []) keptSidecars.add(sb);
        }
        // Structural/metadata files without a shoot date are always kept.
        keptFiles = scanned.files.filter(
          (f) => f.shootDate == null || sel.has(f.shootDate) || keptSidecars.has(f.rel)
        );
      }
      if (!keptFiles.length) throw new Error(`Source "${clean}" is empty`);
      const keptBytes = keptFiles.reduce((a, f) => a + f.size, 0);
      const source = {
        id: uid(),
        path: clean,
        volume: scanned.volume,
        brand: scanned.brand,
        cameraLabel: scanned.cameraLabel,
        model: scanned.model,
        reel: scanned.reel,
        fileCount: keptFiles.length,
        totalBytes: keptBytes,
        clips: keptClips,
        files: keptFiles.map((f) => ({
          rel: f.rel,
          size: f.size,
          sourceHash: null,
          targets: {}
        })),
        legs: {},
        status: 'pending',
        safe: false,
        error: null
      };
      sources.push(source);
    }

    const targets = input.targetPaths.map((tp, i) => ({
      id: uid(),
      path: String(tp).trim(),
      label: input.targetLabels?.[i] || basename(String(tp).replace(/[\\/]+$/, ''))
    }));

    for (const source of sources) {
      for (const t of targets) {
        source.legs[t.id] = {
          targetId: t.id,
          targetLabel: t.label,
          destRootAbs: null,
          status: 'pending',
          bytesCopied: 0,
          totalBytes: source.totalBytes,
          speed: 0,
          samples: [],
          filesCopied: 0,
          filesVerified: 0,
          filesSkipped: 0,
          error: null,
          verifiedAt: null
        };
        for (const f of source.files) f.targets[t.id] = { ...LEG_FILE_INIT };
      }
    }

    const job = {
      id: uid(),
      name: input.name || `${project} · ${dateStamp()}`,
      project,
      operator,
      algorithm,
      template,
      conflictPolicy: input.conflictPolicy || settings.conflictPolicy,
      sources,
      targets,
      status: 'draft',
      createdAt: new Date().toISOString(),
      startedAt: null,
      finishedAt: null,
      reports: [],
      logs: [],
      error: null
    };

    this.cache.set(job.id, job);
    await saveJob(job);
    this.emit('job', job.id);
    this.log(job, 'info', `Job created — ${sources.length} source(s), ${targets.length} target(s), ${algorithm}`);
    return clone(job);
  }

  // ---------------- preflight ----------------

  async preflight(job) {
    const norm = (p) => path.resolve(p).toLowerCase();
    // 1. source/target overlap
    const srcPaths = job.sources.map((s) => norm(s.path));
    const tgtPaths = job.targets.map((t) => norm(t.path));
    if (new Set(srcPaths).size !== srcPaths.length) {
      throw new Error('Duplicate source path: each card may only be added once');
    }
    if (new Set(tgtPaths).size !== tgtPaths.length) {
      throw new Error('Duplicate target path: each destination must be unique');
    }
    for (const s of srcPaths) {
      for (const t of tgtPaths) {
        if (s === t || s.startsWith(t + path.sep) || t.startsWith(s + path.sep)) {
          throw new Error(`Source and target overlap: ${s} ↔ ${t}`);
        }
      }
    }
    // 2. space + writability per target (conservative: count full source bytes)
    const need = {};
    for (const t of job.targets) need[t.id] = 0;
    for (const s of job.sources) for (const t of job.targets) need[t.id] += s.totalBytes;
    for (const t of job.targets) {
      await mkdir(t.path, { recursive: true });
      const st = await statPath(t.path);
      if (!st) throw new Error(`Target not accessible: ${t.path}`);
      if (st.free < need[t.id]) {
        throw new Error(
          `Not enough space on ${t.label}: needs ${(need[t.id] / 1e9).toFixed(1)} GB, ${(st.free / 1e9).toFixed(1)} GB free`
        );
      }
      const probe = path.join(t.path, `.ecopy-probe-${process.pid}`);
      try {
        await mkdir(t.path, { recursive: true });
        const fh = await open(probe, 'w');
        await fh.close();
        await unlink(probe);
      } catch {
        throw new Error(`Target is not writable: ${t.path}`);
      }
      this.log(job, 'info', `Target ${t.label}: ${(st.free / 1e9).toFixed(1)} GB free OK`);
    }
  }

  // ---------------- run ----------------

  async start(id) {
    let job = this.cache.get(id);
    if (!job) {
      const loaded = await this.#load(id);
      if (!loaded) throw new Error('Job not found');
      job = loaded;
    }
    if (job.status === 'running' || this.controllers.has(id)) return clone(job);

    // Preflight runs inline so config errors (no space, unwritable target…)
    // surface to the caller before the job goes live.
    await this.preflight(job);
    const controller = new AbortController();
    this.controllers.set(id, controller);

    job.status = 'running';
    job.startedAt = job.startedAt || new Date().toISOString();
    job.error = null;
    await saveJob(job);
    this.log(job, 'info', 'Job started');

    // Reset interrupted/error legs for a fresh (re)try; verified state is kept.
    for (const s of job.sources) {
      for (const leg of Object.values(s.legs)) {
        if (leg.status !== 'verified') {
          leg.status = 'pending';
          leg.error = null;
        }
      }
      if (s.status !== 'safe') {
        s.status = 'pending';
        s.error = null;
      }
    }

    // The copy/verify pipeline runs in the background; start() returns
    // immediately so the UI can jump to the live job page right away.
    this.#run(job, controller).catch((e) => {
      this.log(job, 'error', `Fatal: ${e.message}`);
      this.controllers.delete(id);
    });
    this.emit('progress', id);
    this.emit('job', id);
    return clone(job);
  }

  async #run(job, controller) {
    const id = job.id;
    const settings = await getSettings();
    const progressTimer = setInterval(() => this.emit('progress', id), 250);

    try {
      const sem = semaphore(settings.sourceConcurrency || 2);
      await Promise.all(
        job.sources.map((source) => sem.with(() => this.#runSource(job, source, controller.signal)))
      );
    } catch (e) {
      if (!(e instanceof AbortError)) this.log(job, 'error', `Fatal: ${e.message}`);
    } finally {
      clearInterval(progressTimer);
    }

    const allSafe = job.sources.every((s) => s.safe);
    if (controller.signal.aborted) {
      job.status = 'canceled';
      for (const s of job.sources) if (!s.safe && s.status !== 'error') s.status = 'canceled';
      this.log(job, 'warn', 'Job canceled by user');
    } else if (allSafe) {
      job.status = 'running';
      try {
        await generateReports(job, (msg) => this.log(job, 'info', msg));
        job.status = 'completed';
        job.finishedAt = new Date().toISOString();
        this.log(job, 'info', 'ALL SOURCES SAFE — reports generated');
        notifyEvent(job, 'completed').catch(() => {});
      } catch (e) {
        job.status = 'failed';
        job.error = `Report generation failed: ${e.message}`;
        this.log(job, 'error', job.error);
      }
    } else {
      job.status = 'failed';
      const failed = job.sources
        .filter((s) => !s.safe)
        .map((s) => `${s.volume}: ${s.error || 'one or more targets failed verification'}`)
        .join('; ');
      job.error = failed;
      this.log(job, 'error', `Job failed — ${failed}`);
      notifyEvent(job, 'failed').catch(() => {});
    }

    this.controllers.delete(id);
    await saveJob(job);
    this.emit('progress', id);
    this.emit('job', id);
  }

  async cancel(id) {
    const c = this.controllers.get(id);
    if (c) c.abort();
    return true;
  }

  async #load(id) {
    const job = await getJob(id);
    if (job) this.cache.set(id, job);
    return job;
  }

  // ---------------- per source ----------------

  async #runSource(job, source, signal) {
    if (source.safe) return;
    const vars = renderTemplateVars(job, source);
    const rendered = renderTemplate(job.template, vars);
    // One reusable buffer per source avoids a 4 MiB allocation for every file.
    // Sources still run independently according to sourceConcurrency.
    const ioBuffer = Buffer.allocUnsafe(CHUNK);

    // Resolve & create destination roots. A bad target must not prevent the
    // remaining targets from receiving and verifying their copies.
    for (const leg of Object.values(source.legs)) {
      if (leg.status === 'verified') {
        leg.bytesCopied = source.totalBytes;
        leg.speed = 0;
        continue;
      }

      // Rebuild counters from durable per-file state. Partial .part files and
      // interrupted writes are deliberately excluded on a retry.
      leg.bytesCopied = 0;
      leg.filesCopied = 0;
      leg.filesVerified = 0;
      leg.filesSkipped = 0;
      leg.samples = [];
      leg.speed = 0;
      for (const f of source.files) {
        const st = f.targets[leg.targetId];
        if (st.status === 'copied' || st.status === 'verified') {
          leg.bytesCopied += f.size;
          if (!st.preExisting) leg.filesCopied++;
        }
        if (st.status === 'verified') {
          leg.filesVerified++;
          if (st.preExisting || st.destRel) leg.filesSkipped++;
        }
      }

      try {
        const target = job.targets.find((t) => t.id === leg.targetId);
        if (!target) throw new Error('Target no longer exists in job configuration');
        leg.destRootAbs = path.join(target.path, rendered);
        await mkdir(leg.destRootAbs, { recursive: true });
        leg.status = 'copying';
      } catch (e) {
        leg.status = 'error';
        leg.error = `Destination setup failed: ${e.message}`;
        this.log(job, 'error', `${leg.targetLabel}: ${leg.error}`);
      }
    }
    source.status = 'copying';
    this.emit('progress', job.id);

    for (const f of source.files) {
      if (signal.aborted) throw new AbortError('canceled');
      // Failed legs stay out of this run and are retried explicitly. Other
      // targets continue, and already verified files are never read again.
      const activeLegs = Object.values(source.legs).filter(
        (l) => !['verified', 'error', 'canceled'].includes(l.status) &&
          f.targets[l.targetId].status !== 'verified'
      );
      if (!activeLegs.length) continue;

      try {
        await this.#processFile(job, source, f, activeLegs, signal, ioBuffer);
      } catch (e) {
        if (e instanceof AbortError) throw e;
        for (const leg of activeLegs) {
          if (leg.status !== 'error') {
            leg.status = 'error';
            leg.error = e.message;
            f.targets[leg.targetId].status = 'error';
          }
        }
        this.log(job, 'error', `${f.rel}: ${e.message}`);
      }
    }

    // Independent verification per leg.
    for (const leg of Object.values(source.legs)) {
      if (leg.status === 'verified') continue;
      if (leg.status === 'error' || leg.status === 'canceled') continue;
      await this.#verifyLeg(job, source, leg, signal, ioBuffer);
    }

    this.#evaluate(source);
    if (source.safe) {
      this.log(job, 'info', `${source.volume} — Safe to Format (${source.files.length} files verified on every target)`);
      notifyEvent(job, 'safe', source).catch(() => {});
    } else {
      source.status = 'error';
      source.error =
        Object.values(source.legs)
          .filter((l) => l.status === 'error')
          .map((l) => `${l.targetLabel}: ${l.error}`)
          .join('; ') || 'verification incomplete';
      this.log(job, 'error', `${source.volume} — NOT safe: ${source.error}`);
    }
    await saveJob(job);
    this.emit('progress', job.id);
  }

  async #processFile(job, source, f, legs, signal, buf) {
    const copyingLegs = [];
    const sourcePath = path.join(source.path, f.rel);

    for (const leg of legs) {
      const fileState = f.targets[leg.targetId];
      // Reuse an alternate name allocated by an earlier keep-both attempt;
      // otherwise every retry would create another duplicate.
      leg._altPath = fileState.destRel || null;
      const targetRel = leg._altPath || f.rel;
      const finalPath = path.join(leg.destRootAbs, targetRel);
      try {
        let targetStat = null;
        try {
          targetStat = await fsStat(finalPath);
        } catch (e) {
          if (e.code !== 'ENOENT') throw e;
        }

        if (targetStat && !targetStat.isFile()) {
          throw new Error(`Target path is not a file (${targetRel})`);
        }
        if (targetStat?.size === f.size) {
          const alreadyCounted = fileState.status === 'copied' || fileState.status === 'verified';
          fileState.preExisting = true;
          fileState.status = 'copied';
          // Same-size files still require checksum verification, but their
          // bytes count toward copy progress exactly once.
          if (!alreadyCounted) leg.bytesCopied += f.size;
        } else {
          // A previously copied file may have been removed or replaced while
          // the job was offline. Discard its stale contribution before retry.
          if (fileState.status === 'copied') {
            leg.bytesCopied = Math.max(0, leg.bytesCopied - f.size);
            if (!fileState.preExisting) leg.filesCopied = Math.max(0, leg.filesCopied - 1);
            fileState.status = 'pending';
          }
          if (targetStat) {
            if (job.conflictPolicy !== 'keep-both') {
              throw new Error(`Target file exists with different size (${targetRel}) — refusing to overwrite`);
            }
            leg._altPath = await this.#altName(leg.destRootAbs, targetRel);
          }
          fileState.preExisting = false;
          copyingLegs.push(leg);
        }
      } catch (e) {
        leg.status = 'error';
        leg.error = e.message;
        fileState.status = 'error';
        this.log(job, 'error', `${leg.targetLabel}: ${leg.error}`);
      }
    }

    // If every remaining target rejected the file, no source read is needed.
    if (!legs.some((leg) => leg.status !== 'error')) return;

    const sourceHasher = createHasher(job.algorithm);
    const handles = [];
    let srcFh = null;
    let totalRead = 0;
    let hashComplete = false;

    try {
      srcFh = await open(sourcePath, 'r');
      if (copyingLegs.length) {
        for (const leg of copyingLegs) {
          const destRel = leg._altPath || f.rel;
          const partPath = path.join(leg.destRootAbs, `${destRel}.part`);
          try {
            await mkdir(path.dirname(partPath), { recursive: true });
            try {
              await unlink(partPath);
            } catch (e) {
              if (e.code !== 'ENOENT') throw e;
            }
            const fh = await open(partPath, 'w');
            handles.push({ leg, fh, partPath, finalRel: destRel, dead: false });
            leg.status = 'copying';
          } catch (e) {
            leg.status = 'error';
            leg.error = `Destination file setup failed: ${e.message}`;
            f.targets[leg.targetId].status = 'error';
            this.log(job, 'error', `${leg.targetLabel}: ${leg.error}`);
          }
        }
        if (!handles.length && !legs.some((leg) => leg.status !== 'error')) {
          this.log(job, 'error', `${f.rel}: every target failed before copying`);
          return;
        }
      }

      // Single source read → tee to every healthy target, hashing as we go.
      // With no copying left this same loop hashes the source for verification.
      while (true) {
        if (signal.aborted) throw new AbortError('canceled');
        const { bytesRead } = await srcFh.read(buf);
        if (bytesRead === 0) break;
        totalRead += bytesRead;
        sourceHasher.update(buf.subarray(0, bytesRead));

        const writeResults = await Promise.allSettled(
          handles.map((h) => writeAll(h.fh, buf.subarray(0, bytesRead)))
        );
        const now = Date.now();
        for (let i = 0; i < writeResults.length; i++) {
          const h = handles[i];
          if (writeResults[i].status === 'fulfilled') {
            this.#bumpLeg(h.leg, bytesRead, now);
          } else {
            // Drop only the failed target; all other writes continue.
            h.leg.status = 'error';
            h.leg.error = writeResults[i].reason?.message || 'write failed';
            f.targets[h.leg.targetId].status = 'error';
            this.log(job, 'error', `${h.leg.targetLabel} write failed: ${h.leg.error}`);
            h.dead = true;
            await h.fh.close().catch(() => {});
            await unlink(h.partPath).catch(() => {});
          }
        }
        for (let i = handles.length - 1; i >= 0; i--) if (handles[i].dead) handles.splice(i, 1);
        if (copyingLegs.length && !handles.length && !legs.some((leg) => leg.status !== 'error')) {
          this.log(job, 'error', `${f.rel}: every target failed — aborting file`);
          return;
        }
      }

      if (totalRead !== f.size) {
        throw new Error(`Source file size changed during copy (${f.rel}): expected ${f.size}, read ${totalRead}`);
      }
      f.sourceHash = sourceHasher.digest();
      hashComplete = true;
    } finally {
      for (const h of handles) {
        if (hashComplete && !h.dead) {
          try {
            await h.fh.sync();
          } catch (e) {
            h.dead = true;
            h.leg.status = 'error';
            h.leg.error = `Flush failed: ${e.message}`;
            f.targets[h.leg.targetId].status = 'error';
            this.log(job, 'error', `${h.leg.targetLabel}: ${h.leg.error}`);
          }
        }
        try {
          await h.fh.close();
        } catch (e) {
          if (hashComplete && !h.dead) {
            h.dead = true;
            h.leg.status = 'error';
            h.leg.error = `Close failed: ${e.message}`;
            f.targets[h.leg.targetId].status = 'error';
            this.log(job, 'error', `${h.leg.targetLabel}: ${h.leg.error}`);
          }
        }
        if (!hashComplete || h.dead) await unlink(h.partPath).catch(() => {});
      }
      if (srcFh) await srcFh.close();
    }

    // Rename only complete, flushed copies. Other targets remain independent.
    for (const h of handles) {
      if (h.dead) continue;
      try {
        await fsRename(h.partPath, path.join(h.leg.destRootAbs, h.finalRel));
        h.leg.filesCopied++;
        f.targets[h.leg.targetId].status = 'copied';
        if (h.finalRel !== f.rel) f.targets[h.leg.targetId].destRel = h.finalRel;
      } catch (e) {
        h.leg.status = 'error';
        h.leg.error = `Finalize failed: ${e.message}`;
        f.targets[h.leg.targetId].status = 'error';
        this.log(job, 'error', `${h.leg.targetLabel}: ${h.leg.error}`);
        await unlink(h.partPath).catch(() => {});
      }
    }
  }

  async #verifyLeg(job, source, leg, signal, buf) {
    leg.status = 'verifying';
    this.emit('progress', job.id);
    for (const f of source.files) {
      if (signal.aborted) throw new AbortError('canceled');
      const st = f.targets[leg.targetId];
      if (st.status === 'verified') continue;
      if (st.status === 'error' || leg.status === 'error') continue;
      const targetRel = st.destRel || f.rel;
      const finalPath = path.join(leg.destRootAbs, targetRel);
      try {
        const hasher = createHasher(job.algorithm);
        const fh = await open(finalPath, 'r');
        try {
          while (true) {
            if (signal.aborted) throw new AbortError('canceled');
            const { bytesRead } = await fh.read(buf);
            if (bytesRead === 0) break;
            hasher.update(buf.subarray(0, bytesRead));
          }
        } finally {
          await fh.close();
        }
        const destHash = hasher.digest();
        if (!f.sourceHash) throw new Error('Source checksum missing');
        if (destHash !== f.sourceHash) {
          throw new Error(`Checksum mismatch for ${targetRel}: source ${f.sourceHash} vs target ${destHash}`);
        }
        st.status = 'verified';
        st.hash = destHash;
        leg.filesVerified++;
        if (st.preExisting || st.destRel) leg.filesSkipped++;
        this.#bumpLeg(leg, f.size, Date.now(), false);
      } catch (e) {
        if (e instanceof AbortError) throw e;
        st.status = 'error';
        leg.status = 'error';
        leg.error = e.message;
        this.log(job, 'error', `${leg.targetLabel}: ${e.message}`);
        return;
      }
    }
    if (leg.status !== 'error') {
      leg.status = 'verified';
      leg.verifiedAt = new Date().toISOString();
      leg.bytesCopied = source.totalBytes;
      leg.speed = 0;
    }
  }

  #bumpLeg(leg, bytes, now, addCopied = true) {
    // During verify, #bumpLeg only feeds the speed samples — bytes were
    // already counted during copy, otherwise progress doubles to 200%.
    if (addCopied) leg.bytesCopied += bytes;
    leg.samples.push({ t: now, b: bytes });
    const cutoff = now - 4000;
    while (leg.samples.length > 2 && leg.samples[0].t < cutoff) leg.samples.shift();
    const first = leg.samples[0];
    const span = Math.max(0.5, (now - first.t) / 1000);
    const total = leg.samples.reduce((a, s) => a + s.b, 0);
    leg.speed = total / span;
  }

  #evaluate(source) {
    const tids = Object.keys(source.legs);
    const legsOk = tids.every((t) => source.legs[t].status === 'verified');
    const filesOk = source.files.every((f) =>
      tids.every((t) => f.targets[t] && f.targets[t].status === 'verified')
    );
    source.safe = legsOk && filesOk && source.files.length > 0;
    if (source.safe) source.status = 'safe';
  }

  async #altName(destRoot, rel) {
    const dot = rel.lastIndexOf('.');
    const base = dot < 0 ? rel : rel.slice(0, dot);
    const ext = dot < 0 ? '' : rel.slice(dot);
    for (let i = 1; i < 1000; i++) {
      const candidate = `${base}_${i}${ext}`;
      try {
        await access(path.join(destRoot, candidate));
      } catch {
        return candidate;
      }
    }
    throw new Error('Could not allocate non-conflicting name');
  }

  // ---------------- aggregate progress (floating window) ----------------

  // Aggregate progress across every job currently live in the cache.
  // Returns totals so the floating window can show overall copy progress.
  getAggregate() {
    let totalBytes = 0;
    let copiedBytes = 0;
    let speedBps = 0;
    let running = 0;
    let copying = 0;
    let verifying = 0;
    const jobs = [];

    for (const job of this.cache.values()) {
      if (job.status !== 'running') continue;
      running++;
      let jTotal = 0;
      let jDone = 0;
      for (const source of job.sources) {
        const legCount = Object.keys(source.legs).length || 1;
        jTotal += source.totalBytes * legCount;
        for (const leg of Object.values(source.legs)) {
          jDone += Math.min(leg.bytesCopied || 0, source.totalBytes);
          speedBps += leg.speed || 0;
          if (leg.status === 'copying') copying++;
          if (leg.status === 'verifying') verifying++;
        }
      }
      totalBytes += jTotal;
      copiedBytes += jDone;
      jobs.push({
        id: job.id,
        name: job.name,
        totalBytes: jTotal,
        copiedBytes: jDone,
        status: job.status
      });
    }

    const pct = totalBytes ? Math.min(100, (copiedBytes / totalBytes) * 100) : 0;
    const remain = speedBps > 0 ? (totalBytes - copiedBytes) / speedBps : null;

    return {
      running,
      totalBytes,
      copiedBytes,
      pct,
      speedBps,
      remain,
      copying,
      verifying,
      jobs
    };
  }

  hasRunningJobs() {
    for (const job of this.cache.values()) {
      if (job.status === 'running') return true;
    }
    return false;
  }
}

// ---------- helpers ----------

// FileHandle.write() is allowed to write fewer bytes than requested. Keep
// writing until the whole chunk reaches this target before counting progress.
async function writeAll(fh, buf) {
  let offset = 0;
  while (offset < buf.length) {
    const { bytesWritten } = await fh.write(buf, offset, buf.length - offset);
    if (!bytesWritten) throw new Error('Target write made no progress');
    offset += bytesWritten;
  }
}

function semaphore(size) {
  let active = 0;
  const queue = [];
  const next = () => {
    if (active < size && queue.length) {
      active++;
      const { task, resolve, reject } = queue.shift();
      Promise.resolve().then(task).then(resolve, reject).finally(() => {
        active--;
        next();
      });
    }
  };
  return {
    with(task) {
      return new Promise((resolve, reject) => {
        queue.push({ task, resolve, reject });
        next();
      });
    }
  };
}

export const engine = new Engine();
