// eCOPY app bootstrap: splash, onboarding, i18n, routing, SSE, palette, notifications.
import { h, icon, clear, toast, getToastHistory, markAllRead, openModal, openDrawer } from './lib.js?v=46';
import { api } from './api.js?v=46';
import { renderWizard, resetWizard } from './wizard.js?v=46';
import { renderJobs } from './joblist.js?v=46';
import { renderJob, destroyWarp } from './jobview.js?v=46';
import { renderDisks } from './disksview.js?v=46';
import { renderSettings } from './settingsview.js?v=46';
import { t, setLang, LANG_OPTIONS } from './i18n.js?v=46';

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
  const RAMP_START = 240;  // wait for the footer before the bar moves
  const RAMP_MS = 1000;    // boot bar ramp duration
  const MIN_MS = 1500;     // minimum time the splash stays on screen
  const MAX_MS = 4000;     // safety: never trap the user if the API hangs
  const HOLD_MS = 200;     // brief hold at 100% before the exit transition
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
    ['sd', 'onb.f1t'],
    ['fanout', 'onb.f2t'],
    ['hash', 'onb.f3t']
  ];
  let picked = appState.settings.language || 'zh';

  // Language as quiet text links: 中文 · 日本語 · English (current = accent underline)
  const langNodes = [h('span', { class: 'ol-label' }, t('onb.lang'))];
  LANG_OPTIONS.forEach(([code, label], idx) => {
    if (idx > 0) langNodes.push(h('span', { class: 'ol-sep' }, '·'));
    langNodes.push(h('button', {
      class: 'ob-lang-link' + (code === picked ? ' sel' : ''),
      onClick: async (e) => {
        picked = code;
        langRow.querySelectorAll('button').forEach((b) => b.classList.remove('sel'));
        e.target.classList.add('sel');
        await api.settings.save({ language: code }).catch(() => {});
        setLang(code);
        applyStaticI18n();
        rebuild();
      }
    }, label));
  });
  const langRow = h('div', { class: 'ob-langs' }, langNodes);

  let card;
  function rebuild() {
    const next = buildCard();
    card.replaceWith(next);
    card = next;
  }

  function buildCard() {
    // Left column: mark → thin wordmark → slogan → CTA → language links.
    // Right column: a thin-line copy-flow figure (card → xxHash → two targets).
    const left = h('div', { class: 'ob-left' }, [
      h('svg', { class: 'onboard-logo', width: '52', height: '52', viewBox: '0 0 32 32', html: "<rect x='2.5' y='2.5' width='27' height='27' rx='8' fill='none' stroke='#6FA093' stroke-width='2.2'/><path d='M10 16.5l4.3 4.3L22.5 11' stroke='#6FA093' stroke-width='2.6' fill='none' stroke-linecap='round' stroke-linejoin='round'/>" }),
      h('div', { class: 'onboard-brand' }, 'eCOPY'),
      h('div', { class: 'onboard-tagline' }, t('onb.tagline')),
      h('button', {
        class: 'onboard-start',
        onClick: async () => {
          await api.settings.save({ onboarded: true, language: picked }).catch(() => {});
          appState.settings.onboarded = true;
          overlay.classList.add('out');
          setTimeout(() => overlay.remove(), 550);
          route();
        }
      }, t('onb.start')),
      langRow
    ]);
    const right = h('div', { class: 'ob-right' }, [
      h('div', {
        class: 'ob-figure',
        html: `<svg viewBox="0 0 340 220" fill="none" stroke-linecap="round" stroke-linejoin="round">
          <!-- memory card -->
          <rect x="18" y="56" width="66" height="108" rx="10" stroke="#93A29D" stroke-width="1.5"/>
          <path d="M32 66v10M44 66v10M56 66v10" stroke="#93A29D" stroke-width="1.5"/>
          <!-- card → checksum -->
          <path d="M84 110h48" stroke="#6FA093" stroke-width="1.5"/>
          <path d="M140 110l-11-6v12z" fill="#6FA093" stroke="none"/>
          <!-- xxHash digest, monospace -->
          <text x="170" y="92" font-family="Consolas, 'Cascadia Code', monospace" font-size="11" fill="#6FA093" text-anchor="middle">xxh64</text>
          <text x="170" y="112" font-family="Consolas, 'Cascadia Code', monospace" font-size="12.5" fill="#4E7A6A" text-anchor="middle">7f3a 9c2e</text>
          <text x="170" y="130" font-family="Consolas, 'Cascadia Code', monospace" font-size="12.5" fill="#4E7A6A" text-anchor="middle">b84d d15f</text>
          <!-- checksum → two targets -->
          <path d="M208 104l36 22" stroke="#6FA093" stroke-width="1.5"/>
          <path d="M250 130l-12 1 4-12z" fill="#6FA093" stroke="none"/>
          <path d="M208 96l36-22" stroke="#6FA093" stroke-width="1.5"/>
          <path d="M250 70l-8 10 12 2z" fill="#6FA093" stroke="none"/>
          <!-- two target drives -->
          <rect x="252" y="56" width="70" height="44" rx="8" stroke="#93A29D" stroke-width="1.5"/>
          <circle cx="266" cy="78" r="3" fill="#6FA093" stroke="none"/>
          <path d="M280 78h30" stroke="#93A29D" stroke-width="1.5"/>
          <rect x="252" y="120" width="70" height="44" rx="8" stroke="#93A29D" stroke-width="1.5"/>
          <circle cx="266" cy="142" r="3" fill="#6FA093" stroke="none"/>
          <path d="M280 142h30" stroke="#93A29D" stroke-width="1.5"/>
        </svg>`
      })
    ]);
    return h('div', { class: 'onboard-card' }, [
      h('div', { class: 'ob-split' }, [left, right]),
      h('div', { class: 'ob-features' }, feats.map(([ic, tk]) =>
        h('div', { class: 'ob-feat' }, [icon(ic, 18), h('span', {}, t(tk))])
      ))
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
