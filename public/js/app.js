// eCOPY app bootstrap: splash, onboarding, i18n, routing, SSE, palette, notifications.
import { h, icon, clear, toast, getToastHistory, markAllRead, openModal, openDrawer } from './lib.js?v=29';
import { api } from './api.js?v=29';
import { renderWizard, resetWizard } from './wizard.js?v=29';
import { renderJobs } from './joblist.js?v=29';
import { renderJob, destroyWarp } from './jobview.js?v=29';
import { renderDisks } from './disksview.js?v=29';
import { renderSettings } from './settingsview.js?v=29';
import { t, setLang, LANG_OPTIONS } from './i18n.js?v=29';

const appState = { settings: {}, volumes: [], physical: [], jobs: [] };
window.__appState = appState;

let lastRender = 0;
const content = document.getElementById('content');

// ---------------- static i18n ----------------

function applyStaticI18n() {
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
}

// ---------------- splash (airport self-service terminal style) ----------------

const bootAt = performance.now();
let bootReady = false; // set true after the first real state refresh

// Boot phases: progress threshold → localized main line + fixed EN sub-line.
// English sub-lines stay in English on purpose, like the bilingual labels
// printed on Japanese airport kiosks. Thresholds are tuned against the
// smootherstep ramp below so each line gets an even, readable dwell.
const BOOT_STEPS = [
  { at: 0.0, key: 'splash.s1', en: 'SYSTEM INITIALIZATION' },
  { at: 0.16, key: 'splash.s2', en: 'DETECTING STORAGE' },
  { at: 0.48, key: 'splash.s3', en: 'CHECKSUM ENGINE' },
  { at: 0.86, key: 'splash.s4', en: 'READY' }
];

// Ken Perlin smootherstep: eases in AND out with a steady middle — no front
// loading, no tail crawl. Feels like a real terminal filling its rule.
function smootherstep(x) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  return x * x * x * (x * (x * 6 - 15) + 10);
}

function startSplash() {
  const el = document.getElementById('splash');
  if (!el) return;
  const mainEl = document.getElementById('spMain');
  const subEl = document.getElementById('spSub');
  const pctEl = document.getElementById('spPct');
  const fillEl = document.getElementById('spFill');
  const statusEl = document.getElementById('spStatus');
  const RAMP_START = 620;  // wait for the footer to fade in before the rule moves
  const RAMP_MS = 2200;    // smootherstep ramp duration
  const MIN_MS = 2860;     // minimum time the splash stays on screen
  const MAX_MS = 6500;     // safety: never trap the user if the API hangs
  const HOLD_MS = 320;     // brief hold at 100% before the exit transition
  const SWAP_MS = 120;     // status line crossfade half-duration
  let phase = 'run';
  let holdStart = 0;
  let stepIdx = -1;
  let pctShown = -1;
  let swapAt = 0;
  let pendingStep = -1;

  function showStep(idx) {
    mainEl.textContent = t(BOOT_STEPS[idx].key);
    subEl.textContent = BOOT_STEPS[idx].en;
  }

  function finish() {
    clearInterval(timer);
    el.classList.add('out');
    setTimeout(() => el.remove(), 600);
  }

  function tick() {
    const nowMs = performance.now();
    const ms = nowMs - bootAt;
    // Deterministic smootherstep ramp, starting only once the footer is on screen.
    const k = smootherstep((ms - RAMP_START) / RAMP_MS);
    // Until the real backend state arrives, the rule pauses just before "ready".
    let p = bootReady ? k : Math.min(k, 0.84);
    if (ms > MAX_MS) p = 1;

    let idx = 0;
    for (let i = 0; i < BOOT_STEPS.length; i++) if (p >= BOOT_STEPS[i].at) idx = i;
    if (idx !== stepIdx && idx !== pendingStep) {
      if (stepIdx === -1) {
        // First line: no crossfade needed.
        stepIdx = idx;
        showStep(idx);
      } else {
        // Fade the old line out, swap text at midpoint, fade back in.
        pendingStep = idx;
        swapAt = nowMs;
        statusEl.classList.add('swap');
      }
    }
    if (pendingStep !== -1 && nowMs - swapAt >= SWAP_MS) {
      stepIdx = pendingStep;
      pendingStep = -1;
      showStep(stepIdx);
      statusEl.classList.remove('swap');
    }

    const shown = Math.round(p * 100);
    if (shown !== pctShown) {
      pctShown = shown;
      pctEl.textContent = `${shown}%`;
    }
    fillEl.style.width = `${(p * 100).toFixed(2)}%`;

    if (phase === 'run' && p >= 1 && ms >= MIN_MS) {
      phase = 'hold';
      holdStart = nowMs;
    } else if (phase === 'hold' && nowMs - holdStart >= HOLD_MS) {
      finish();
    }
  }

  // setInterval instead of rAF: keeps perfect time even if the window is
  // occluded at launch (rAF can be throttled to zero in that state).
  const timer = setInterval(tick, 40);
  tick();
}

startSplash();

// ---------------- onboarding (first run) ----------------

function showOnboarding() {
  const feats = [
    ['shield', 'onb.f1t', 'onb.f1b'],
    ['play', 'onb.f2t', 'onb.f2b'],
    ['doc', 'onb.f3t', 'onb.f3b']
  ];
  let picked = appState.settings.language || 'zh';

  const langRow = h('div', { class: 'onboard-lang' }, [
    h('span', { class: 'ol-label' }, t('onb.lang')),
    ...LANG_OPTIONS.map(([code, label]) =>
      h('button', {
        class: code === picked ? 'sel' : '',
        onClick: async (e) => {
          picked = code;
          langRow.querySelectorAll('button').forEach((b) => b.classList.remove('sel'));
          e.target.classList.add('sel');
          await api.settings.save({ language: code }).catch(() => {});
          setLang(code);
          applyStaticI18n();
          rebuild();
        }
      }, label)
    )
  ]);

  let card;
  function rebuild() {
    const next = buildCard();
    card.replaceWith(next);
    card = next;
  }

  function buildCard() {
    return h('div', { class: 'onboard-card' }, [
      h('svg', { class: 'onboard-logo', width: '64', height: '64', viewBox: '0 0 32 32', html: "<rect width='32' height='32' rx='7' fill='#2fe07f'/><path d='M9 16l5 5 9-11' stroke='#0b0e13' stroke-width='3.4' fill='none' stroke-linecap='round' stroke-linejoin='round'/>" }),
      h('div', { class: 'onboard-welcome' }, t('onb.welcome')),
      h('div', { class: 'onboard-brand' }, 'eCOPY'),
      h('div', { class: 'onboard-co' }, 'XUEZHIZHONG · 薛智中'),
      h('div', { class: 'onboard-tagline' }, t('onb.tagline')),
      h('div', { class: 'onboard-feats' }, feats.map(([ic, tk, bk]) =>
        h('div', { class: 'onboard-feat' }, [
          icon(ic, 22),
          h('div', { class: 'of-t' }, t(tk)),
          h('div', { class: 'of-b' }, t(bk))
        ])
      )),
      langRow,
      h('button', {
        class: 'onboard-start',
        onClick: async () => {
          await api.settings.save({ onboarded: true, language: picked }).catch(() => {});
          appState.settings.onboarded = true;
          overlay.classList.add('out');
          setTimeout(() => overlay.remove(), 550);
          route();
        }
      }, t('onb.start'))
    ]);
  }

  card = buildCard();
  const overlay = h('div', { class: 'onboard' }, [card]);
  document.body.appendChild(overlay);
  requestAnimationFrame(() => requestAnimationFrame(() => overlay.classList.add('in')));
}

// ---------------- routing ----------------

function parseHash() {
  const h0 = location.hash.replace(/^#\/?/, '');
  const [view, param] = h0.split('/');
  return { view: view || 'wizard', param };
}

window.__go = (view, param) => {
  location.hash = `#/${view}${param ? `/${param}` : ''}`;
};

async function route() {
  const { view, param } = parseHash();

  // Leaving the job detail: release its warp animation loop.
  if (view !== 'job') destroyWarp();

  document.querySelectorAll('.nav-item').forEach((b) => {
    b.classList.toggle('active', b.dataset.view === view || (view === 'job' && b.dataset.view === 'jobs'));
  });

  if (view === 'wizard') renderWizard(content, appState);
  else if (view === 'jobs') renderJobs(content, appState);
  else if (view === 'job' && param) renderJob(content, param, appState);
  else if (view === 'disks') renderDisks(content, appState);
  else if (view === 'settings') renderSettings(content, appState);
  else window.__go('wizard');
}

window.addEventListener('hashchange', () => route());

// ---------------- state refresh ----------------

async function refreshState() {
  try {
    const s = await api.state();
    appState.settings = s.settings;
    appState.volumes = s.volumes;
    appState.physical = s.physical;
    appState.jobs = s.jobs;
    document.documentElement.dataset.theme = s.settings.theme || 'dark';
    setLang(s.settings.language);
    setServerStatus(true);
  } catch {
    setServerStatus(false);
  }
}

function setServerStatus(ok) {
  const dot = document.getElementById('srvDot');
  const txt = document.getElementById('srvText');
  if (dot) dot.className = `dot ${ok ? 'ok' : 'bad'}`;
  if (txt) txt.textContent = ok ? t('srv.connected') : t('srv.offline');
}

// ---------------- live job updates ----------------

const refreshOpenJob = debounceLazy(async () => {
  const { view, param } = parseHash();
  if (view !== 'job' || !param) return;
  if (Date.now() - lastRender < 350) {
    setTimeout(() => refreshOpenJob(), 200);
    return;
  }
  lastRender = Date.now();
  await renderJob(content, param, appState);
}, 300);

function debounceLazy(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

// ---------------- SSE ----------------

function connectSSE() {
  const es = new EventSource('/api/events');
  es.onmessage = async (e) => {
    let msg;
    try {
      msg = JSON.parse(e.data);
    } catch {
      return;
    }
    if (msg.kind === 'progress' || msg.kind === 'job') {
      refreshOpenJob();
    } else if (msg.kind === 'volumes') {
      await refreshState();
      const { view } = parseHash();
      if (['disks', 'wizard'].includes(view)) route();
    } else if (msg.kind === 'card-inserted') {
      await refreshState();
      const label = msg.label || msg.mount;
      const brandPart = msg.cameraLabel ? `${msg.cameraLabel} · ` : '';
      toast(t('notify.cardInserted'), `${brandPart}${label} — ${t('notify.cardInsertedBody')}`, 'info', 6000);
      systemNotify(t('notify.cardInserted'), label);
      if (parseHash().view === 'wizard') route();
    } else if (msg.kind === 'log') {
      if (msg.entry.level === 'error' && parseHash().view === 'job') refreshOpenJob();
    }
  };
  es.onerror = () => {
    es.close();
    setTimeout(connectSSE, 2500);
  };
}

// ---------------- system notifications ----------------

let notifPermission = 'default';
async function systemNotify(title, body) {
  if (!('Notification' in window)) return;
  if (notifPermission === 'default') {
    try {
      notifPermission = await Notification.requestPermission();
    } catch {
      return;
    }
  }
  if (notifPermission === 'granted') new Notification(title, { body });
}

let lastJobStatus = new Map();
setInterval(async () => {
  const { view, param } = parseHash();
  if (view === 'job' && param) {
    try {
      const j = await api.jobs.get(param);
      const prev = lastJobStatus.get(param);
      if (prev && prev !== j.status) {
        if (j.status === 'completed') {
          toast(t('notify.jobDone'), t('notify.jobDoneBody'), 'ok', 7000);
          systemNotify(t('sys.jobDone'), t('sys.jobDoneBody'));
        } else if (j.status === 'failed') {
          toast(t('notify.jobFailed'), t('notify.jobFailedBody'), 'bad', 9000);
          systemNotify(t('sys.jobFailed'), t('sys.jobFailedBody'));
        }
      }
      lastJobStatus.set(param, j.status);
    } catch {}
  }
}, 2000);

// ---------------- command palette ----------------

const PALETTE_ACTIONS = () => [
  { label: t('cmd.new'), icon: 'plus', run: () => { resetWizard(); window.__go('wizard'); } },
  { label: t('cmd.gotoJobs'), icon: 'list', run: () => window.__go('jobs') },
  { label: t('cmd.gotoDisks'), icon: 'disk', run: () => window.__go('disks') },
  { label: t('cmd.gotoSettings'), icon: 'shield', run: () => window.__go('settings') },
  ...appState.jobs
    .filter((j) => j.status === 'interrupted')
    .map((j) => ({
      label: `${t('cmd.resume')}: ${j.name}`,
      icon: 'retry',
      run: () => window.__go('job', j.id)
    }))
];

function openPalette() {
  let sel = 0;
  let query = '';
  const actions = PALETTE_ACTIONS();

  const list = h('div', { class: 'palette-list' });
  const input = h('input', {
    class: 'palette-input', placeholder: t('cmd.placeholder'), autofocus: true
  });

  function matches() {
    const q = query.toLowerCase();
    if (!q) return actions;
    return actions.filter((a) => a.label.toLowerCase().includes(q));
  }

  function renderList() {
    clear(list);
    const items = matches();
    if (!items.length) {
      list.appendChild(h('div', { class: 'palette-empty' }, t('cmd.empty')));
      return;
    }
    sel = Math.min(sel, items.length - 1);
    items.forEach((a, i) => {
      list.appendChild(
        h('div', {
          class: `palette-item ${i === sel ? 'sel' : ''}`,
          onMouseEnter: () => { sel = i; renderList(); },
          onClick: () => { close(); a.run(); }
        }, [icon(a.icon), h('span', {}, a.label)])
      );
    });
  }

  input.addEventListener('input', () => { query = input.value; sel = 0; renderList(); });
  input.addEventListener('keydown', (e) => {
    const n = matches().length;
    if (e.key === 'ArrowDown') { e.preventDefault(); sel = (sel + 1) % n; renderList(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = (sel - 1 + n) % n; renderList(); }
    else if (e.key === 'Enter') { e.preventDefault(); const a = matches()[sel]; if (a) { close(); a.run(); } }
    else if (e.key === 'Escape') close();
  });

  const modal = h('div', { class: 'palette-modal' }, [input, list]);
  const close = openModal({ content: modal, width: 600, top: '12vh', cls: '' });
  renderList();
  setTimeout(() => input.focus(), 0);
}

document.getElementById('cmdTrigger').addEventListener('click', openPalette);

// Sidebar navigation — wire view buttons to the hash router.
document.querySelectorAll('.nav-item').forEach((b) => {
  b.addEventListener('click', () => window.__go(b.dataset.view));
});

// ---------------- notification center ----------------

document.getElementById('bgBtn').addEventListener('click', async () => {
  const n = window.ecopy && (await window.ecopy.runningCount());
  if (n > 0) {
    toast(t('notify.bgMode'), t('notify.bgModeBody'), 'info', 4000);
  }
  if (window.ecopy) window.ecopy.backgroundMode();
});

document.getElementById('bellBtn').addEventListener('click', () => {
  const body = h('div');
  const items = getToastHistory();
  if (!items.length) {
    body.appendChild(h('div', { class: 'notif-empty' }, t('notif.empty')));
  }
  for (const n of items) {
    n.read = true;
    body.appendChild(
      h('div', { class: 'notif-item' }, [
        h('div', { class: 'ni-top' }, [
          h('span', {
            style: {
              width: '8px', height: '8px', borderRadius: '50%', flexShrink: '0',
              background:
                n.kind === 'ok' ? 'var(--ok)' : n.kind === 'bad' ? 'var(--bad)'
                : n.kind === 'warn' ? 'var(--warn)' : 'var(--accent)'
            }
          }),
          h('span', { class: 'ni-title' }, n.title),
          h('span', { class: 'ni-time' }, n.at.slice(11, 19))
        ]),
        n.body ? h('div', { class: 'ni-body' }, n.body) : null
      ])
    );
  }

  let drawerClose = null;
  drawerClose = openDrawer({
    header: [
      h('span', { class: 'dh-title' }, t('notif.title')),
      h('button', { class: 'icon-btn', onClick: () => drawerClose?.() }, [icon('x', 17)])
    ],
    body,
    footer: [
      h('span', { class: 'faint' }, `${items.length} ${t('notif.entries')}`),
      h('button', { class: 'btn', onClick: () => markAllRead() }, t('notif.markAll'))
    ]
  }).close;
  markAllRead();
});

// ---------------- global keyboard ----------------

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    openPalette();
  }
});

// ---------------- boot ----------------

(async function boot() {
  await refreshState();
  bootReady = true;
  applyStaticI18n();
  connectSSE();
  if (!location.hash) location.hash = '#/wizard';
  route();
  if (appState.settings.onboarded !== true) showOnboarding();
})();
