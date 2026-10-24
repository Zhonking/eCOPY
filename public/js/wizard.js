// Three-step offload wizard: sources → targets/template → review & start.
import { h, icon, clear, formatBytes, eta, toast, openModal, protocolLabel, matchPhysicalForVolume } from './lib.js?v=39';
import { api } from './api.js?v=39';
import { openPathBrowser } from './browser.js?v=39';
import { t } from './i18n.js?v=39';

let state = null;
let starting = false;

// Rough single-reader throughput used for the copy-time estimate.
const EST_BPS = 220 * 1024 * 1024;
// Palette for the type-distribution bar (accent blue → green → amber → purple).
const TYPE_COLORS = ['#3b82f6', '#2fe07f', '#ffb020', '#a78bfa', '#5f6f88'];

export function resetWizard() {
  state = null;
}

export function renderWizard(mount, appState) {
  if (!state) {
    state = {
      step: 1,
      sources: [],
      targets: [],
      project: '',
      operator: appState.settings.operator,
      algorithm: appState.settings.algorithm,
      template: appState.settings.template,
      conflictPolicy: appState.settings.conflictPolicy,
      _lastScan: null
    };
  }
  draw(mount, appState);
}

// Totals across every selected source, honoring per-source date selection.
function grandTotals() {
  let fileCount = 0;
  let totalBytes = 0;
  for (const s of state.sources) {
    const tot = selectedTotals(s);
    fileCount += tot.fileCount;
    totalBytes += tot.totalBytes;
  }
  return { fileCount, totalBytes };
}

function draw(mount, appState) {
  clear(mount);

  // Headline: title + stepper + read-only badge share one row to save height.
  mount.appendChild(
    h('div', { class: 'wiz-headline' }, [
      h('h1', {}, t('wiz.title')),
      stepperEl(mount, appState),
      h('span', { class: 'ro-badge', title: t('wiz.sub') }, [
        icon('shield', 13),
        t('wiz.readonly')
      ])
    ])
  );

  if (state.step === 1) mount.appendChild(stepOne(mount, appState));
  if (state.step === 2) mount.appendChild(stepTwo());
  if (state.step === 3) mount.appendChild(stepThree());

  mount.appendChild(actionsRow(mount, appState));
}

// Stepper with live summaries on hover; completed steps click back.
function stepperEl(mount, appState) {
  const tot = grandTotals();
  const titles = [
    null,
    state.targets.length
      ? `${t('wiz.sumTargets')}: ${state.targets.length} · ${state.template}`
      : t('wiz.pickTargetFirst'),
    state.sources.length
      ? `${tot.fileCount} ${t('job.files')} · ${formatBytes(tot.totalBytes)}`
      : t('wiz.pickSourceFirst')
  ];
  const steps = [t('wiz.step1'), t('wiz.step2'), t('wiz.step3')];
  const stepper = h('div', { class: 'stepper' });
  steps.forEach((label, i) => {
    const done = state.step > i + 1;
    const active = state.step === i + 1;
    const props = { class: `step${done ? ' done' : ''}${active ? ' active' : ''}` };
    if (titles[i]) props.title = titles[i];
    if (done) {
      props.onClick = () => { state.step = i + 1; draw(mount, appState); };
    }
    stepper.appendChild(
      h('div', props, [
        h('div', { class: 'num' }, done ? '✓' : String(i + 1)),
        h('div', { class: 'txt' }, label)
      ])
    );
    if (i < steps.length - 1) stepper.appendChild(h('div', { class: 'step-line' }));
  });
  return stepper;
}

// ---------- step 1: sources ----------

// Totals honoring the per-source shooting-date selection.
function selectedTotals(src) {
  if (!src._dateSel) return { fileCount: src.fileCount, totalBytes: src.totalBytes };
  let count = 0;
  let bytes = 0;
  for (const f of src.files || []) {
    if (f.shootDate == null || src._dateSel.has(f.shootDate)) {
      count += 1;
      bytes += f.size;
    }
  }
  return { fileCount: count, totalBytes: bytes };
}

function toggleDate(src, date, appState) {
  if (!src._dateSel) src._dateSel = new Set(src.dates.map((g) => g.date));
  const sel = src._dateSel;
  if (sel.has(date)) {
    if (sel.size > 1) sel.delete(date); // never allow an empty selection
  } else {
    sel.add(date);
    // Picking a date previews the first & last photo of that day.
    const rangeFiles = (src.files || []).filter((f) => f.shootDate === date);
    showRangePreview(src.path, `${src.volume || ''} · ${date}`, rangeFiles);
  }
  renderWizard(document.getElementById('content'), appState);
}

function dateFilterRow(src, appState) {
  if (!src.dates?.length || src.dates.length < 2) return null;
  if (!src._dateSel) src._dateSel = new Set(src.dates.map((g) => g.date));
  const totalMedia = src.dates.reduce((a, g) => a + g.files, 0);
  const pickedMedia = src.dates
    .filter((g) => src._dateSel.has(g.date))
    .reduce((a, g) => a + g.files, 0);
  return h('div', { class: 'date-filter' }, [
    h('div', { class: 'df-head' }, [
      h('span', {}, t('wiz.dateFilter')),
      h('span', { class: 'df-count' }, t('wiz.datesSel', { n: pickedMedia, total: totalMedia }))
    ]),
    h('div', { class: 'df-chips' },
      src.dates.map((g) =>
        h('button', {
          class: 'date-chip' + (src._dateSel.has(g.date) ? ' on' : ''),
          title: g.date,
          onClick: (e) => {
            e.stopPropagation();
            toggleDate(src, g.date, appState);
          }
        }, [
          icon('check', 11),
          h('span', { class: 'dc-date' }, g.date),
          h('span', { class: 'dc-meta' }, `${g.files} · ${formatBytes(g.bytes)}`)
        ])
      )
    )
  ]);
}

function sourceCard(src, appState) {
  const totals = selectedTotals(src);
  return h('div', { class: 'pick-card selected' }, [
    h('div', { class: 'pc-top' }, [
      h('span', { class: 'brand-tag' }, src.cameraLabel),
      h('span', { class: 'pc-name' }, src.volume),
      h('button', {
        class: 'icon-btn', title: t('wiz.remove'),
        onClick: () => {
          state.sources = state.sources.filter((s) => s.path !== src.path);
          renderWizard(document.getElementById('content'), appState);
        }
      }, [icon('x', 15)])
    ]),
    h('div', { class: 'pc-meta' }, [
      h('span', {}, `${t('job.reel')} ${src.reel}`),
      h('span', {}, `${totals.fileCount} ${t('job.files')}`),
      h('span', {}, formatBytes(totals.totalBytes)),
      h('span', { class: 'muted' }, `${t('wiz.estTime')} ${eta(totals.totalBytes / EST_BPS)}`)
    ]),
    dateFilterRow(src, appState),
    h('div', { class: 'pc-path' }, src.path)
  ]);
}

function volumeCard(v, appState) {
  const added = state.sources.some((s) => s.path === v.path);
  const used = Math.max(0, v.size - v.free);
  const pct = v.size ? Math.min(100, Math.round((used / v.size) * 100)) : 0;
  // Capacity-matched physical disk (see lib.js): protocol shows for any
  // whole-disk volume, SMART temp/health stay removable-only.
  const phys = matchPhysicalForVolume(v, appState.physical);
  const healthOk = phys?.health ? /passed|ok/i.test(phys.health) : false;
  const proto = protocolLabel(phys?.protocol);
  return h('button', {
    class: 'pick-card vol-card' + (added ? ' is-sel' : ''),
    onClick: () => (added
      ? removeSource(v.path, appState)
      : addSource(v.path, appState))
  }, [
    h('div', { class: 'pc-top' }, [
      h('span', { class: 'vol-ic' }, [icon('disk', 17)]),
      h('span', { class: 'pc-name' }, `${v.label || t('wiz.volume')} · ${v.mount}`),
      added
        ? h('span', { class: 'vc-check' }, [icon('check', 12), t('wiz.added')])
        : h('span', { class: 'vc-add' }, [icon('plus', 13)])
    ]),
    h('div', { class: 'vol-bar' }, [h('div', { style: { width: pct + '%' } })]),
    h('div', { class: 'pc-meta' }, [
      h('span', {}, `${formatBytes(v.size)} · ${v.fs || '—'}`),
      h('span', {}, `${t('wiz.free')} ${formatBytes(v.free)}`)
    ]),
    h('div', { class: 'vol-tags' }, [
      v.removable ? h('span', { class: 'brand-tag' }, t('wiz.removable')) : null,
      proto ? h('span', { class: 'pill plain accent', title: t('disks.protocol') }, proto) : null,
      v.removable && phys?.tempC != null
        ? h('span', { class: `pill plain ${phys.tempC >= 60 ? 'warn' : 'ok'}` }, `${phys.tempC} °C`)
        : null,
      v.removable && phys?.health
        ? h('span', { class: `pill plain ${healthOk ? 'ok' : 'warn'}` }, `SMART ${healthOk ? 'OK' : phys.health}`)
        : null
    ])
  ]);
}

async function rescan(mount, appState) {
  try {
    const s = await api.state();
    appState.volumes = s.volumes;
    appState.physical = s.physical;
    state._lastScan = new Date();
    draw(mount, appState);
  } catch (e) {
    toast(t('srv.offline'), e.message, 'bad');
  }
}

function fmtClock(d) {
  return d.toTimeString().slice(0, 8);
}

// Line-art memory card → drive, for the empty states.
function cardIllustration() {
  return h('div', {
    html: `<svg viewBox="0 0 132 72" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M14 22v34a6 6 0 0 0 6 6h32a6 6 0 0 0 6-6V14L46 6H20a6 6 0 0 0-6 6Z"/>
      <path d="M30 6v9h8V8"/>
      <rect x="24" y="38" width="20" height="13" rx="2"/>
      <path d="M68 36h14m-5-5 5 5-5 5"/>
      <rect x="92" y="16" width="34" height="40" rx="5"/>
      <circle cx="109" cy="36" r="7"/>
      <path d="m109 31v4l3 2"/>
    </svg>`
  });
}

function stepOne(mount, appState) {
  const wrap = h('div', {
    class: 'grid',
    style: { gridTemplateColumns: 'minmax(0, 1fr) 330px', gap: '16px', alignItems: 'start' }
  });

  const left = h('div');

  // --- detected drives: selectable cards + rescan + last-scan time ---
  left.appendChild(
    h('div', { class: 'detected-head' }, [
      h('div', { class: 'section-title', style: { margin: '0' } }, t('wiz.detected')),
      state._lastScan
        ? h('span', { class: 'last-scan' }, t('wiz.lastScan', { time: fmtClock(state._lastScan) }))
        : null,
      h('button', {
        class: 'btn rescan-btn',
        onClick: () => rescan(mount, appState)
      }, [icon('retry', 13), t('wiz.refresh')])
    ])
  );

  const vols = [...appState.volumes].sort((a, b) =>
    Number(b.removable) - Number(a.removable) || a.mount.localeCompare(b.mount)
  );
  if (vols.length) {
    const volGrid = h('div', { class: 'pick-grid' });
    for (const v of vols) volGrid.appendChild(volumeCard(v, appState));
    left.appendChild(volGrid);
  } else {
    left.appendChild(
      h('div', { class: 'card empty-mini' }, [cardIllustration(), t('wiz.detectedEmpty')])
    );
  }

  // --- selected sources: cards + drag-and-drop add tile ---
  left.appendChild(h('div', { class: 'section-title' }, t('wiz.sources')));
  const grid = h('div', { class: 'pick-grid' });
  for (const s of state.sources) grid.appendChild(sourceCard(s, appState));
  grid.appendChild(
    h('button', {
      class: 'add-tile dropzone',
      onClick: () =>
        openPathBrowser({
          title: t('br.addSourceTitle'),
          volumes: appState.volumes,
          onSelect: (p) => addSource(p, appState)
        }),
      onDragover: (e) => {
        e.preventDefault();
        e.currentTarget.classList.add('drag');
      },
      onDragleave: (e) => e.currentTarget.classList.remove('drag'),
      onDrop: (e) => {
        e.preventDefault();
        e.currentTarget.classList.remove('drag');
        handleDrop(e, appState);
      }
    }, [icon('plus', 22), t('wiz.addSourceDrop')])
  );
  left.appendChild(grid);
  wrap.appendChild(left);

  // --- right: live summary panel ---
  wrap.appendChild(summaryPanel(appState));
  return wrap;
}

async function handleDrop(e, appState) {
  const dt = e.dataTransfer;
  const paths = [];
  if (window.ecopy?.pathsForFiles && dt.files?.length) {
    try { paths.push(...window.ecopy.pathsForFiles(Array.from(dt.files))); } catch { /* fall through */ }
  }
  if (!paths.length) {
    for (const f of dt.files || []) if (f.path) paths.push(f.path);
  }
  if (!paths.length) {
    toast(t('wiz.sourceFail'), t('wiz.dropNoPath'), 'warn');
    return;
  }
  for (const p of paths) await addSource(p, appState);
}

function removeSource(path, appState) {
  state.sources = state.sources.filter((s) => s.path !== path);
  renderWizard(document.getElementById('content'), appState);
}

async function addSource(p, appState) {
  if (state.sources.some((s) => s.path === p)) return;
  try {
    const scan = await api.scan(p);
    state.sources.push(scan);
    state._lastScan = state._lastScan || new Date();
    toast(t('wiz.sourceAdded'), `${scan.volume} · ${scan.fileCount} ${t('job.files')}`, 'ok', 3500);
    renderWizard(document.getElementById('content'), appState);
    // Adding a folder previews the first & last photo of the whole card.
    showRangePreview(scan.path, `${scan.cameraLabel} · ${scan.volume}`, scan.files || []);
  } catch (e) {
    toast(t('wiz.sourceFail'), e.message, 'bad');
  }
}

// ---------- boundary-photo preview popup ----------

const IMG_RE = /\.(jpe?g|dng|nef|nrw|arw|cr2|cr3|raf|orf|rw2|pef|x3f|insp)$/i;
const natCmp = (a, b) => a.localeCompare(b, undefined, { numeric: true });

// Decide what the <img> should load for a boundary file: the file itself
// when it is a JPG, a stem-matched JPG sibling (RAW+JPG shooting pairs),
// or the RAW itself — the backend serves its embedded JPEG preview.
function previewSourceFor(file, imgs) {
  if (/\.jpe?g$/i.test(file.rel)) return file.rel;
  const stem = file.rel.replace(/\.[^.]+$/, '');
  const sibling = imgs.find((f) => f.rel === `${stem}.jpg` || f.rel === `${stem}.jpeg`);
  return sibling ? sibling.rel : file.rel;
}

function showRangePreview(rootPath, title, files) {
  const imgs = files.filter((f) => IMG_RE.test(f.rel)).sort((a, b) => natCmp(a.rel, b.rel));
  if (!imgs.length) return;
  const root = rootPath.replace(/[\\/]+$/, '');
  const urlOf = (rel) => `/api/thumb?path=${encodeURIComponent(`${root}/${rel}`)}`;

  // A pane tries its boundary file first, then falls back to neighbouring
  // images in the range when a preview cannot be produced (corrupt RAW,
  // tiny/absent embedded thumbnail…) so one bad file never blanks the pane.
  const pane = (slotLabel, file, fallbacks) => {
    const candidates = [...new Set(
      [previewSourceFor(file, imgs), ...fallbacks.map((f) => previewSourceFor(f, imgs))]
    )];
    const img = h('img', {
      src: urlOf(candidates[0]),
      alt: file.rel,
      onError: (e) => {
        candidates.shift(); // drop the candidate that just failed
        if (candidates.length) {
          e.target.src = urlOf(candidates[0]);
        } else {
          const box = e.target.parentElement;
          e.target.remove();
          box.appendChild(h('span', { class: 'faint', style: { fontSize: '12px' } }, t('wiz.noPreview')));
        }
      }
    });
    return h('div', { class: 'rp-pane' }, [
      h('div', { class: 'rp-slot' }, slotLabel),
      h('div', { class: 'rp-img' }, [img]),
      h('div', { class: 'rp-name mono' }, file.rel.split('/').pop()),
      h('div', { class: 'rp-meta' }, file.mtime ? file.mtime.slice(0, 16).replace('T', ' ') : '')
    ]);
  };

  let close;
  const closeBtn = h('button', {
    class: 'icon-btn', title: t('wiz.remove'),
    onClick: () => close && close()
  }, [icon('x', 16)]);

  const content = h('div', { class: 'range-pop' }, [
    h('div', { class: 'rp-head' }, [
      h('div', { style: { flex: '1', minWidth: '0' } }, [
        h('div', { class: 'rp-title' }, title),
        h('div', { class: 'rp-sub' }, `${imgs.length} ${t('job.files')}`)
      ]),
      closeBtn
    ]),
    h('div', { class: 'rp-panes' }, [
      pane(t('wiz.firstShot'), imgs[0], imgs.slice(1, 4)),
      pane(t('wiz.lastShot'), imgs[imgs.length - 1], imgs.slice(-4, -1).reverse())
    ])
  ]);
  close = openModal({ content, width: 620, top: '14vh' });
}

// Extension-size histogram across every selected source (date-filter aware).
function typeDistribution() {
  const byExt = new Map();
  for (const s of state.sources) {
    const keep = (f) => !s._dateSel || f.shootDate == null || s._dateSel.has(f.shootDate);
    for (const f of s.files || []) {
      if (!keep(f)) continue;
      // Files carry a relative path in `rel` (extension included).
      const base = String(f.rel || f.name || '').split(/[\\/]/).pop();
      const m = /\.([a-z0-9]{1,6})$/i.exec(base);
      const ext = m ? `.${m[1].toLowerCase()}` : t('wiz.typeOther');
      byExt.set(ext, (byExt.get(ext) || 0) + f.size);
    }
  }
  const rows = [...byExt.entries()].sort((a, b) => b[1] - a[1]);
  const top = rows.slice(0, 4);
  const restBytes = rows.slice(4).reduce((a, [, b]) => a + b, 0);
  if (restBytes > 0) top.push([t('wiz.typeOther'), restBytes]);
  return top;
}

function summaryPanel(appState) {
  const card = h('div', { class: 'card wiz-summary' });
  if (!state.sources.length) {
    card.appendChild(
      h('div', { class: 'empty-mini', style: { padding: '34px 10px' } }, [
        cardIllustration(),
        t('wiz.noSelection')
      ])
    );
    return card;
  }

  const tot = grandTotals();
  card.appendChild(h('div', { class: 'wiz-sum-head' }, [
    h('div', { class: 'section-title' }, t('wiz.selectedSummary')),
    h('span', { class: 'wiz-count-pill', title: t('wiz.sumSources') }, String(state.sources.length))
  ]));

  // Removable chips — quick overview + quick removal.
  const chips = h('div', { class: 'src-chips' });
  for (const s of state.sources) {
    chips.appendChild(h('span', { class: 'src-chip' }, [
      h('span', { class: 'sc-name', title: s.path }, s.volume),
      h('button', {
        title: t('wiz.remove'),
        onClick: () => removeSource(s.path, appState)
      }, [icon('x', 11)])
    ]));
  }
  card.appendChild(chips);

  card.appendChild(h('div', { class: 'wiz-sumrows' }, [
    sumRow(t('wiz.sumSources'), `${state.sources.length}`),
    sumRow(t('wiz.sumFiles'), `${tot.fileCount}`),
    sumRow(t('wiz.sumSize'), formatBytes(tot.totalBytes)),
    sumRow(t('wiz.estTime'), eta(tot.totalBytes / EST_BPS))
  ]));

  // Type distribution: stacked bar + legend.
  const dist = typeDistribution();
  if (dist.length > 1 && tot.totalBytes > 0) {
    const bar = h('div', { class: 'type-bar' },
      dist.map(([ext, bytes], i) =>
        h('div', {
          title: `${ext} · ${formatBytes(bytes)}`,
          style: { width: `${(bytes / tot.totalBytes) * 100}%`, background: TYPE_COLORS[i % TYPE_COLORS.length] }
        })
      )
    );
    const legend = h('div', { class: 'type-legend' },
      dist.map(([ext, bytes], i) =>
        h('div', { class: 'type-row' }, [
          h('span', {
            class: 'type-dot',
            style: { background: TYPE_COLORS[i % TYPE_COLORS.length] }
          }),
          h('span', { class: 'mono', style: { flex: '1' } }, ext),
          h('span', { class: 'muted' }, formatBytes(bytes)),
          h('span', { class: 'faint' }, `${Math.round((bytes / tot.totalBytes) * 100)}%`)
        ])
      )
    );
    card.appendChild(h('div', {}, [h('div', { class: 'section-title', style: { margin: '14px 0 8px' } }, t('wiz.typeDist')), bar, legend]));
  }
  return card;
}

// ---------- step 2: targets + template ----------

function targetCard(tgt, appState) {
  return h('div', { class: 'pick-card selected' }, [
    h('div', { class: 'pc-top' }, [
      h('span', { class: 'brand-tag' }, t('wiz.targetTag')),
      h('span', { class: 'pc-name' }, String(tgt).split(/[\\/]/).filter(Boolean).pop()),
      h('button', {
        class: 'icon-btn', title: t('wiz.remove'),
        onClick: () => {
          state.targets = state.targets.filter((x) => x !== tgt);
          renderWizard(document.getElementById('content'), appState);
        }
      }, [icon('x', 15)])
    ]),
    h('div', { class: 'pc-path' }, tgt)
  ]);
}

function stepTwo() {
  const wrap = h('div');

  wrap.appendChild(h('div', { class: 'section-title' }, t('wiz.targets')));
  const grid = h('div', { class: 'pick-grid' });
  for (const tgt of state.targets) grid.appendChild(targetCard(tgt, window.__appState));
  grid.appendChild(
    h('button', {
      class: 'add-tile',
      onClick: () =>
        openPathBrowser({
          title: t('br.addTargetTitle'),
          volumes: window.__appState.volumes,
          onSelect: (p) => {
            if (!state.targets.includes(p)) state.targets.push(p);
            renderWizard(document.getElementById('content'), window.__appState);
          }
        })
    }, [icon('plus', 22), t('wiz.addTarget')])
  );
  wrap.appendChild(grid);

  // Template
  const sample = state.sources[0];
  const vars = {
    project: state.project || 'Project',
    date: new Date().toISOString().slice(0, 10),
    camera: sample?.cameraLabel || 'ARRI',
    reel: sample?.reel || 'A001',
    operator: state.operator,
    volume: sample?.volume || 'CARD'
  };
  const preview = (state.template.replace(/\{(\w+)\}/g, (m, k) => vars[k] || ''))
    .replace(/\/+/g, '/');

  wrap.appendChild(h('div', { class: 'section-title' }, t('wiz.template')));
  wrap.appendChild(
    h('div', { class: 'card' }, [
      h('div', { class: 'field full' }, [
        h('label', {}, t('wiz.templateLabel')),
        h('input', {
          class: 'input mono', value: state.template,
          onInput: (e) => {
            state.template = e.target.value;
            const pv = document.getElementById('tplPreview');
            if (pv) pv.textContent = e.target.value.replace(/\{(\w+)\}/g, (m, k) => vars[k] || '').replace(/\/+/g, '/');
          }
        }),
        h('div', { class: 'hint' }, t('wiz.templateHint')),
        h('div', { id: 'tplPreview', class: 'path-crumb', style: { marginTop: '10px' } }, preview)
      ])
    ])
  );
  return wrap;
}

// ---------- step 3: review ----------

function stepThree() {
  const selTotals = state.sources.map(selectedTotals);
  const totalBytes = selTotals.reduce((a, t0) => a + t0.totalBytes, 0);
  const totalFiles = selTotals.reduce((a, t0) => a + t0.fileCount, 0);

  const wrap = h('div', { class: 'grid', style: { gridTemplateColumns: '1fr 340px' } });

  wrap.appendChild(
    h('div', { class: 'card' }, [
      h('div', { class: 'settings-grid', style: { maxWidth: 'none' } }, [
        h('div', { class: 'field' }, [
          h('label', {}, t('wiz.project')),
          h('input', {
            class: 'input', value: state.project, placeholder: t('wiz.projectPh'),
            onInput: (e) => (state.project = e.target.value)
          })
        ]),
        h('div', { class: 'field' }, [
          h('label', {}, t('wiz.operator')),
          h('input', {
            class: 'input', value: state.operator,
            onInput: (e) => (state.operator = e.target.value)
          })
        ]),
        h('div', { class: 'field' }, [
          h('label', {}, t('wiz.algorithm')),
          h(
            'select',
            { class: 'input', onChange: (e) => (state.algorithm = e.target.value) },
            [
              h('option', { value: 'xxh64', selected: state.algorithm === 'xxh64' }, t('wiz.algoXxh64')),
              h('option', { value: 'md5', selected: state.algorithm === 'md5' }, 'MD5'),
              h('option', { value: 'sha1', selected: state.algorithm === 'sha1' }, 'SHA-1'),
              h('option', { value: 'sha256', selected: state.algorithm === 'sha256' }, 'SHA-256')
            ]
          )
        ]),
        h('div', { class: 'field' }, [
          h('label', {}, t('wiz.conflict')),
          h(
            'select',
            { class: 'input', onChange: (e) => (state.conflictPolicy = e.target.value) },
            [
              h('option', { value: 'fail', selected: state.conflictPolicy === 'fail' }, t('wiz.conflictFail')),
              h('option', { value: 'keep-both', selected: state.conflictPolicy === 'keep-both' }, t('wiz.conflictKeep'))
            ]
          )
        ])
      ])
    ])
  );

  wrap.appendChild(
    h('div', { class: 'card' }, [
      h('div', { class: 'section-title', style: { marginTop: '0' } }, t('wiz.summary')),
      h('div', { class: 'grid', style: { gap: '10px' } }, [
        sumRow(t('wiz.sumSources'), `${state.sources.length}`),
        sumRow(t('wiz.sumTargets'), `${state.targets.length}`),
        sumRow(t('wiz.sumFiles'), `${totalFiles}`),
        sumRow(t('wiz.sumSize'), formatBytes(totalBytes)),
        sumRow(t('wiz.sumAlgo'), state.algorithm)
      ]),
      h('div', { style: { marginTop: '16px' } }, [
        h('button', {
          class: 'btn success lg', style: { width: '100%', justifyContent: 'center' },
          onClick: () => startJob()
        }, [icon('shield', 18), t('wiz.start')])
      ])
    ])
  );

  return wrap;
}

function sumRow(k, v) {
  return h('div', {
    style: { display: 'flex', justifyContent: 'space-between', fontSize: '13px' }
  }, [h('span', { class: 'muted' }, k), h('b', {}, v)]);
}

// ---------- footer action bar ----------

function footSummary() {
  const tot = grandTotals();
  if (state.step === 1) {
    return state.sources.length
      ? `${state.sources.length} ${t('wiz.sumSources')} · ${tot.fileCount} ${t('job.files')} · ${formatBytes(tot.totalBytes)}`
      : '';
  }
  if (state.step === 2) {
    return `${state.sources.length} ${t('wiz.sumSources')} · ${state.targets.length} ${t('wiz.sumTargets')}`;
  }
  return `${state.sources.length} ${t('wiz.sumSources')} → ${state.targets.length} ${t('wiz.sumTargets')} · ${formatBytes(tot.totalBytes)}`;
}

function actionsRow(mount, appState) {
  const actions = h('div', { class: 'wizard-actions' });

  const left = h('div', { style: { display: 'flex', gap: '8px' } });
  if (state.step > 1) {
    left.appendChild(
      h('button', { class: 'btn', onClick: () => { state.step--; draw(mount, appState); } }, t('wiz.back'))
    );
  }
  left.appendChild(
    h('button', {
      class: 'btn ghost', title: t('wiz.reset'),
      onClick: () => {
        state = null;
        renderWizard(mount, appState);
        toast(t('wiz.resetDone'), '', 'ok', 2000);
      }
    }, t('wiz.reset'))
  );
  actions.appendChild(left);

  actions.appendChild(h('div', { class: 'wiz-foot-sum' }, footSummary()));

  if (state.step < 3) {
    const disabled = state.step === 1 ? !state.sources.length : !state.targets.length;
    const tip = state.step === 1 ? t('wiz.pickSourceFirst') : t('wiz.pickTargetFirst');
    const btn = h('button', {
      class: 'btn primary',
      disabled,
      onClick: () => { state.step++; draw(mount, appState); }
    }, t('wiz.next'));
    // Disabled buttons swallow hover events in Chromium — the wrapper carries
    // the explanatory tooltip instead.
    actions.appendChild(disabled ? h('span', { class: 'next-wrap', title: tip }, btn) : btn);
  }
  return actions;
}

async function startJob() {
  if (starting) return;
  if (!state.targets.length) {
    toast(t('wiz.startFail'), t('wiz.targets'), 'bad');
    return;
  }
  starting = true;
  const btn = document.activeElement;
  if (btn) btn.setAttribute('disabled', 'true');
  try {
    const job = await api.jobs.create({
      project: state.project || 'Untitled',
      operator: state.operator,
      algorithm: state.algorithm,
      template: state.template,
      conflictPolicy: state.conflictPolicy,
      sources: state.sources.map((s) => {
        // Omit dates entirely when everything is selected.
        if (!s._dateSel || s._dateSel.size === s.dates.length) return { path: s.path };
        return { path: s.path, dates: [...s._dateSel] };
      }),
      targetPaths: state.targets
    });
    toast(t('wiz.jobCreated'), t('wiz.starting'), 'info', 3000);
    const fresh = await api.jobs.start(job.id);
    state = null;
    window.__go('job', fresh.id);
  } catch (e) {
    starting = false;
    toast(t('wiz.startFail'), e.message, 'bad', 8000);
  }
}
