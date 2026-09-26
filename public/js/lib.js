// Tiny DOM helper library + formatters + toast system.

export function h(tag, props = {}, children = []) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') {
      el.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (k === 'dataset') {
      Object.assign(el.dataset, v);
    } else if (k === 'style' && typeof v === 'object') {
      Object.assign(el.style, v);
    } else if (typeof v === 'boolean') {
      if (v) el.setAttribute(k, '');
      else el.removeAttribute(k);
    } else {
      el.setAttribute(k, v);
    }
  }
  for (const c of [].concat(children)) {
    if (c == null || c === false) continue;
    el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(c) : c);
  }
  return el;
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

// Icons: 16/18px stroke icons keyed by name.
const ICON_PATHS = {
  plus: 'M12 5v14M5 12h14',
  folder: 'M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z',
  check: 'M5 13l4 4L19 7',
  shield: 'M12 3l8 3v6c0 5-3.5 7.5-8 9-4.5-1.5-8-4-8-9V6z',
  x: 'M6 6l12 12M18 6L6 18',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13a1 1 0 0 0 1 .9h8a1 1 0 0 0 1-.9L18 7M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2',
  chevronRight: 'M9 6l6 6-6 6',
  chevronUp: 'M6 15l6-6 6 6',
  eject: 'M5 17h14M12 4l7 9H5z',
  alert: 'M12 3l9 16H3z M12 10v4M12 17v.5',
  doc: 'M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z M14 3v5h5',
  arrowUp: 'M12 19V5M5 12l7-7 7 7',
  play: 'M6 4l14 8-14 8z',
  retry: 'M21 12a9 9 0 11-3-6.7L21 8M21 3v5h-5',
  bell: 'M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0',
  disk: 'M4 6a8 3 0 1016 0 8 3 0 10-16 0M4 6v12a8 3 0 0016 0V6',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z',
  bolt: 'M13 2L4 14h6l-1 8 9-12h-6z'
};

export function icon(name, size = 16, fill = false) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('viewBox', '0 0 24 24');
  if (!fill) {
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
  }
  const d = ICON_PATHS[name] || '';
  for (const piece of d.split('M').filter(Boolean)) {
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', 'M' + piece.trim());
    svg.appendChild(p);
  }
  return svg;
}

// ---------- formatters ----------
export function formatBytes(bytes, d = 1) {
  if (!bytes) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(u.length - 1, Math.floor(Math.log(Math.abs(bytes)) / Math.log(1024)));
  return `${(bytes / 1024 ** i).toFixed(i ? d : 0)} ${u[i]}`;
}
export function rate(bps) {
  return bps > 0 ? `${formatBytes(bps)}/s` : '—';
}
export function eta(sec) {
  if (!isFinite(sec) || sec < 0) return '—';
  const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = Math.floor(sec % 60);
  return h ? `${h}h ${String(m).padStart(2,'0')}m` : m ? `${m}m ${String(s).padStart(2,'0')}s` : `${s}s`;
}

// ---------- toasts ----------
let toastHistory = [];
export function toast(title, body = '', kind = 'info', timeout = 5000) {
  const stack = document.getElementById('toastStack');
  const node = h('div', { class: `toast ${kind === 'info' ? '' : kind}` }, [
    h('div', { class: 't-icon' }, [icon(kind === 'ok' ? 'check' : kind === 'bad' ? 'x' : 'alert', 17)]),
    h('div', {}, [
      h('div', { class: 't-title' }, title),
      body ? h('div', { class: 't-body' }, body) : null
    ])
  ]);
  stack.appendChild(node);
  const item = { title, body, kind, at: new Date().toISOString(), read: false };
  toastHistory.unshift(item);
  if (toastHistory.length > 60) toastHistory.pop();
  updateBell();
  setTimeout(() => {
    node.classList.add('out');
    setTimeout(() => node.remove(), 260);
  }, timeout);
  return item;
}

export function getToastHistory() {
  return toastHistory;
}

export function markAllRead() {
  for (const t of toastHistory) t.read = true;
  updateBell();
}

function updateBell() {
  const dot = document.getElementById('bellDot');
  if (dot) dot.hidden = toastHistory.every((t) => t.read);
}

// ---------- overlays ----------
export function openModal({ content, width = 560, top = '11vh', cls = 'modal' }) {
  const root = document.getElementById('overlayRoot');
  const backdrop = h('div', { class: 'backdrop' });
  const box = h('div', { class: cls, style: { width: `${width}px`, marginTop: top } }, [content]);
  backdrop.appendChild(box);
  root.appendChild(backdrop);
  const close = () => backdrop.remove();
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });
  return close;
}

export function openDrawer({ header, body, footer }) {
  const root = document.getElementById('overlayRoot');
  const bd = h('div', { class: 'drawer-backdrop' });
  const drawer = h('div', { class: 'drawer' }, [
    h('div', { class: 'drawer-head' }, header),
    h('div', { class: 'drawer-body drawer-body' }, body),
    footer ? h('div', { class: 'drawer-foot' }, footer) : null
  ]);
  bd.appendChild(drawer);
  root.appendChild(bd);
  const close = () => bd.remove();
  bd.addEventListener('click', (e) => {
    if (e.target === bd) close();
  });
  return { close, body, drawer };
}
