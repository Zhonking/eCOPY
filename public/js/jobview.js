// Job detail: per-source Safe gate, per-target legs, reports, logs.
import { h, icon, clear, formatBytes, rate, eta, toast } from './lib.js?v=27';
import { api } from './api.js?v=27';
import { t } from './i18n.js?v=27';
import { createWarp } from './warp.js?v=27';

// Persistent warp stage across SSE redraws: the stage element (and its canvas)
// survive redraws so CSS entry/exit transitions and the canvas animation
// never get interrupted. Only the overlay text is updated in place.
let warp = null; // { inst, canvas, jobId, stage, phaseEl, pctEl, statsEl, exiting, exitTimer }

export function destroyWarp() {
  if (warp) {
    (warp.exitTimers || []).forEach(clearTimeout);
    warp.inst.destroy();
    warp.stage.remove();
    warp = null;
  }
}

export async function renderJob(mount, id, appState) {
  let job;
  try {
    job = await api.jobs.get(id);
  } catch (e) {
    mount.appendChild(h('div', { class: 'empty-state' }, e.message));
    return job;
  }
  // Switching to a different job: drop the old animation instance.
  if (warp && warp.jobId !== id) destroyWarp();
  draw(mount, job, appState);
  return job;
}

function draw(mount, job, appState) {
  clear(mount);

  // Header
  const statusPill = pillFor(job.status);
  const header = h('div', { class: 'job-header' }, [
    h('div', {}, [
      h('h2', {}, [job.name, statusPill]),
      h('div', { class: 'job-sub' }, [
        h('span', {}, [t('job.project') + ': ', h('b', {}, job.project)]),
        h('span', {}, [t('job.operator') + ': ', h('b', {}, job.operator)]),
        h('span', {}, [t('job.checksum') + ': ', h('b', {}, job.algorithm)]),
        h('span', {}, [t('job.created') + ': ', h('b', {}, job.createdAt.slice(0, 16).replace('T', ' '))])
      ])
    ]),
    h('div', { class: 'job-actions' }, headerActions(job, appState))
  ]);
  mount.appendChild(header);

  // Warp stage — the spacetime-jump progress scene.
  // The stage element is persistent; draw() just inserts it after the header
  // and refreshes the overlay text. Entry/exit transitions play via CSS.
  mountWarp(header, job);

  // Sources
  for (const source of job.sources) mount.appendChild(sourceCard(job, source, appState));

  // Reports
  if (job.reports.length) {
    mount.appendChild(h('div', { class: 'section-title' }, t('job.reports')));
    const box = h('div');
    job.reports.forEach((rep, i) => {
      box.appendChild(
        h('a', {
          class: 'report-chip',
          href: api.downloadUrl(job.id, i),
          target: rep.type === 'html' ? '_blank' : '_self'
        }, [
          icon(rep.type === 'mhl' ? 'shield' : 'doc'),
          `${rep.type.toUpperCase()}${rep.type === 'mhl' ? ' · ' + (job.targets.find(t => t.id === rep.target)?.label || '') : ''}`
        ])
      );
    });
    mount.appendChild(box);
  }

  // Logs
  mount.appendChild(h('div', { class: 'section-title' }, t('job.log')));
  const logBox = h('div', { class: 'log-box' });
  for (const l of job.logs) {
    logBox.appendChild(
      h('div', { class: `log-line ${l.level}` }, [
        h('span', { class: 'lt' }, l.t.slice(11)),
        h('span', { class: 'll' }, l.level.toUpperCase().padEnd(5)),
        h('span', {}, l.msg)
      ])
    );
  }
  if (!job.logs.length) logBox.appendChild(h('div', { class: 'faint' }, t('job.noLogs')));
  mount.appendChild(logBox);
  logBox.scrollTop = logBox.scrollHeight;
}

function headerActions(job, appState) {
  const out = [];
  if (job.status === 'running') {
    out.push(
      h('button', {
        class: 'btn danger',
        onClick: async () => {
          await api.jobs.cancel(job.id);
          toast(t('job.cancelToast'), t('job.cancelBody'), 'warn');
        }
      }, [icon('x'), t('job.cancel')])
    );
  }
  if (['failed', 'interrupted', 'canceled'].includes(job.status)) {
    out.push(
      h('button', {
        class: 'btn primary',
        onClick: async () => {
          toast(t('job.retryToast'), t('job.retryBody'), 'info');
          const j = await api.jobs.start(job.id);
          renderJob(document.getElementById('content'), job.id, appState);
        }
      }, [icon('retry'), t('job.retry')])
    );
  }
  out.push(
    h('button', { class: 'btn', onClick: () => window.__go('wizard') }, [icon('plus'), t('nav.wizard')])
  );
  return out;
}

function sourceCard(job, source, appState) {
  const card = h('div', { class: 'card source-card' });

  card.appendChild(
    h('div', { class: 'source-head' }, [
      h('div', { class: 'source-id' }, [
        h('div', { class: 's-name' }, [
          h('span', { class: 'brand-tag' }, source.cameraLabel),
          source.volume
        ]),
        h('div', { class: 's-meta' }, [
          h('span', {}, `${t('job.reel')} ${source.reel}`),
          h('span', {}, `${source.fileCount} ${t('job.files')}`),
          h('span', {}, formatBytes(source.totalBytes)),
          source.model ? h('span', {}, source.model) : null
        ])
      ])
    ])
  );

  card.appendChild(safeBanner(job, source, appState));

  const legs = h('div', { class: 'leg-block' });
  for (const leg of Object.values(source.legs)) legs.appendChild(legRow(source, leg));
  card.appendChild(legs);
  return card;
}

function bannerKind(status) {
  if (status === 'safe') return ['safe', t('banner.safe'), t('banner.safeSub')];
  if (status === 'error') return ['error', t('banner.error'), t('banner.errorSub')];
  if (status === 'verifying') return ['verify', t('banner.verify'), t('banner.verifySub')];
  if (['interrupted', 'canceled'].includes(status))
    return ['error', t(`status.${status}`), t('banner.stopped')];
  return ['working', t('banner.working'), t('banner.workingSub')];
}

let ejectArmed = {};

function safeBanner(job, source, appState) {
  const [kind, title, sub] = bannerKind(source.status);
  const banner = h('div', { class: `safe-banner ${kind}` }, [
    icon('shield', 28),
    h('div', {}, [
      h('div', {}, title),
      h('div', { class: 's-sub' }, sub)
    ])
  ]);
  if (source.safe) {
    const key = source.id;
    banner.appendChild(
      h('div', { class: 'banner-actions' }, [
        h('button', {
          class: 'btn',
          onClick: async () => {
            await api.jobs.eject(job.id, source.id).catch(() => {});
            toast(t('job.ejected'), source.volume, 'ok');
          }
        }, [icon('eject'), t('job.eject')]),
        h('button', {
          class: 'btn success',
          onClick: async () => {
            if (!ejectArmed[key]) {
              ejectArmed[key] = true;
              const btn = document.activeElement;
              if (btn) btn.textContent = t('job.formatConfirm');
              setTimeout(() => {
                ejectArmed[key] = false;
              }, 4000);
              return;
            }
            ejectArmed[key] = false;
            toast(t('job.formatReady'), t('job.formatBody'), 'ok', 7000);
          }
        }, t('job.format'))
      ])
    );
  }
  return banner;
}

function legRow(source, leg) {
  const row = h('div', { class: 'leg-row' });
  const pctNow = Math.min(100, (leg.bytesCopied / leg.totalBytes) * 100);
  const remain = Math.max(0, (leg.totalBytes - leg.bytesCopied) / Math.max(1, leg.speed));
  const barCls =
    leg.status === 'verified' ? 'ok' : leg.status === 'error' ? 'bad' : leg.status === 'verifying' ? 'warn' : '';

  row.appendChild(
    h('div', { class: 'leg-top' }, [
      h('span', { class: 'leg-name' }, leg.targetLabel),
      h('span', { class: 'pill ' + legPill(leg.status) }, t(`leg.${leg.status}`)),
      h('span', { class: 'leg-stats' }, [
        h('span', {}, rate(leg.speed)),
        h('span', {}, eta(leg.status === 'copying' ? remain : null)),
        h('span', {}, `${pctNow.toFixed(0)}%`)
      ])
    ])
  );
  row.appendChild(
    h('div', { class: `progress ${barCls}` }, [h('div', { style: { width: `${pctNow}%` } })])
  );
  if (leg.status === 'verifying') {
    row.appendChild(h('div', { class: 'current-file' }, `${t('job.verifiedOf')} ${leg.filesVerified}/${source.fileCount}`));
  }
  if (leg.error) row.appendChild(h('div', { class: 'leg-error' }, leg.error));
  return row;
}

function legPill(s) {
  return { verified: 'ok', error: 'bad', verifying: 'warn', interrupted: 'warn' }[s] || 'accent';
}

function pillFor(status) {
  const map = {
    completed: ['ok', t('status.completed')],
    running: ['accent', t('status.running')],
    failed: ['bad', t('status.failed')],
    interrupted: ['warn', t('status.interrupted')],
    canceled: ['warn', t('status.canceled')],
    draft: ['', t('status.draft')]
  };
  const [cls, label] = map[status] || ['', status];
  return h('span', { class: `pill ${cls}` }, label);
}

// ---------------- warp stage ----------------

// The warp stage deserves a real moment on screen. Fast local copies (NVMe
// to NVMe) can finish in under a second — without this floor the stage is
// still expanding when the exit handoff collapses it, so the user never
// sees the animation at all.
const MIN_STAGE_MS = 2600;

function aggregateJob(job) {
  // Weighted progress across every write/verify leg of every source.
  let total = 0;
  let done = 0;
  let speedAll = 0;
  let copying = 0;
  let verifying = 0;
  let verifiedFiles = 0;
  let totalFiles = 0;

  for (const source of job.sources) {
    const legCount = Object.keys(source.legs).length || 1;
    total += source.totalBytes * legCount;
    totalFiles += source.fileCount * legCount;
    for (const leg of Object.values(source.legs)) {
      done += Math.min(leg.bytesCopied || 0, source.totalBytes);
      speedAll += leg.speed || 0;
      if (leg.status === 'copying') copying++;
      if (leg.status === 'verifying') verifying++;
      verifiedFiles += leg.filesVerified || 0;
    }
  }

  const byteProgress = total ? done / total : 0;
  const verifyProgress = totalFiles ? verifiedFiles / totalFiles : 0;
  // Copy maps to 0–92 %, verify readback to 92–100 %. Reaching 100 % only
  // when every leg is fully verified fires the "jump arrived" flash.
  let progress;
  let phase;
  let remain;
  if (copying) {
    progress = 0.92 * byteProgress;
    phase = 'copying';
    remain = speedAll > 0 ? (total - done) / speedAll : null;
  } else if (verifying) {
    progress = 0.92 + 0.08 * verifyProgress;
    phase = 'verifying';
    remain = null;
  } else {
    progress = 0;
    phase = 'preparing';
    remain = null;
  }
  return { progress, speedAll, phase, remain, verifiedFiles, totalFiles };
}

function ensureWarp(job) {
  if (warp) return warp;
  const canvas = h('canvas', { class: 'warp-canvas' });
  const inst = createWarp(canvas);
  const phaseEl = h('div', { class: 'warp-phase' });
  const pctEl = h('div', { class: 'warp-pct' });
  const statsEl = h('div', { class: 'warp-stats' });
  const stage = h('div', { class: 'warp-stage warp-entering' }, [
    canvas,
    h('div', { class: 'warp-overlay' }, [
      phaseEl,
      h('div', { class: 'warp-data' }, [pctEl, statsEl])
    ])
  ]);
  warp = { inst, canvas, jobId: job.id, stage, phaseEl, pctEl, statsEl, exiting: false, exitTimers: [], shownAt: performance.now() };
  // Drop the entering class on the next frame so the CSS transition plays.
  requestAnimationFrame(() => { if (warp) warp.stage.classList.remove('warp-entering'); });
  return warp;
}

// Insert the persistent warp stage after `header` and refresh its HUD.
// Handles running (live) and finished (exit transition) states.
function mountWarp(header, job) {
  if (job.status === 'running') {
    const w = ensureWarp(job);
    if (w.exiting) {
      // Job was restarted? Cancel any in-flight exit.
      (w.exitTimers || []).forEach(clearTimeout);
      w.exitTimers = [];
      w.exiting = false;
      w.shownAt = performance.now();
      w.stage.classList.remove('warp-exiting');
    }
    const agg = aggregateJob(job);
    w.phaseEl.replaceChildren(icon('bolt', 16), t(`warp.${agg.phase}`));
    w.inst.update({ active: true, progress: agg.progress, speedBps: agg.speedAll });
    w.pctEl.textContent = `${(w.inst.displayProgress() * 100).toFixed(1)}%`;
    const stats = [h('span', {}, rate(agg.speedAll)), h('span', {}, eta(agg.remain))];
    if (agg.phase === 'verifying') stats.push(h('span', {}, `${agg.verifiedFiles}/${agg.totalFiles}`));
    w.statsEl.replaceChildren(...stats);
    header.after(w.stage);
    return;
  }

  // Finished state: keep the scene alive at 100% so the displayed progress
  // lands and the arrival flash blooms (setting active:false immediately
  // would kill the flash). Fast local copies can finish before the stage
  // even finished expanding, so hold it on screen for MIN_STAGE_MS first.
  if (warp) {
    const w = warp;
    header.after(w.stage);
    if (!w.exiting) {
      w.exiting = true;
      const shownFor = performance.now() - (w.shownAt || performance.now());
      const hold = Math.max(0, MIN_STAGE_MS - shownFor);
      w.inst.update({ active: true, progress: 1, speedBps: 0 });
      // Keep the HUD percentage in sync while the internal progress lands.
      // update() must keep being called here — the value only advances
      // inside update(), so a read-only poll would freeze at the last
      // running value and the arrival flash would never bloom.
      const pctSync = setInterval(() => {
        w.inst.update({ active: true, progress: 1, speedBps: 0 });
        const dp = w.inst.displayProgress();
        w.pctEl.textContent = `${(dp * 100).toFixed(1)}%`;
        if (dp >= 0.9995) clearInterval(pctSync);
      }, 80);
      w.exitTimers.push(pctSync);
      // Progress lands + flash blooms (~1.7s), then collapse and remove.
      w.exitTimers.push(setTimeout(() => {
        w.inst.update({ active: false, progress: 1, speedBps: 0 });
        w.stage.classList.add('warp-exiting');
      }, hold + 1800));
      w.exitTimers.push(setTimeout(() => {
        if (warp === w) destroyWarp();
      }, hold + 2600));
    }
  }
}
