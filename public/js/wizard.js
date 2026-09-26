// Three-step offload wizard: sources → targets/template → review & start.
import { h, icon, clear, formatBytes, toast } from './lib.js?v=26';
import { api } from './api.js?v=26';
import { openPathBrowser } from './browser.js?v=26';
import { t } from './i18n.js?v=26';

let state = null;
let starting = false;

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
      conflictPolicy: appState.settings.conflictPolicy
    };
  }
  draw(mount, appState);
}

function draw(mount, appState) {
  clear(mount);
  mount.appendChild(
    h('div', { class: 'page-head' }, [
      h('h1', {}, t('wiz.title')),
      h('p', {}, t('wiz.sub'))
    ])
  );

  // Stepper
  const steps = [['1', t('wiz.step1')], ['2', t('wiz.step2')], ['3', t('wiz.step3')]];
  const stepper = h('div', { class: 'stepper' });
  steps.forEach(([n, label], i) => {
    const cls =
      state.step > i + 1 ? 'step done' : state.step === i + 1 ? 'step active' : 'step';
    stepper.appendChild(
      h('div', { class: cls }, [
        h('div', { class: 'num' }, state.step > i + 1 ? '✓' : n),
        h('div', { class: 'txt' }, label)
      ])
    );
    if (i < steps.length - 1) stepper.appendChild(h('div', { class: 'step-line' }));
  });
  mount.appendChild(stepper);

  if (state.step === 1) mount.appendChild(stepOne(appState));
  if (state.step === 2) mount.appendChild(stepTwo());
  if (state.step === 3) mount.appendChild(stepThree());

  // Actions
  const actions = h('div', { class: 'wizard-actions' });
  if (state.step > 1) {
    actions.appendChild(
      h('button', { class: 'btn', onClick: () => { state.step--; draw(mount, appState); } }, t('wiz.back'))
    );
  } else actions.appendChild(h('div'));
  if (state.step < 3) {
    actions.appendChild(
      h('button', {
        class: 'btn primary',
        disabled: state.step === 1 ? !state.sources.length : !state.targets.length,
        onClick: () => { state.step++; draw(mount, appState); }
      }, t('wiz.next'))
    );
  }
  mount.appendChild(actions);
}

// ---------- step 1: sources ----------

function sourceCard(src, appState) {
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
      h('span', {}, `${src.fileCount} ${t('job.files')}`),
      h('span', {}, formatBytes(src.totalBytes))
    ]),
    h('div', { class: 'pc-path' }, src.path)
  ]);
}

function stepOne(appState) {
  const wrap = h('div');

  // Removable volumes quick-pick
  const vols = appState.volumes.filter(
    (v) => !state.sources.some((s) => s.path === v.path)
  );
  if (vols.length) {
    wrap.appendChild(h('div', { class: 'section-title' }, t('wiz.detected')));
    const chips = h('div', { style: { marginBottom: '6px' } });
    for (const v of vols) {
      chips.appendChild(
        h('button', {
          class: 'report-chip',
          onClick: () => addSource(v.path, appState)
        }, [icon('disk'), `${v.label || v.mount} · ${v.mount}`])
      );
    }
    wrap.appendChild(chips);
  }

  wrap.appendChild(h('div', { class: 'section-title' }, t('wiz.sources')));
  const grid = h('div', { class: 'pick-grid' });
  for (const s of state.sources) grid.appendChild(sourceCard(s, appState));
  grid.appendChild(
    h('button', {
      class: 'add-tile',
      onClick: () =>
        openPathBrowser({
          title: t('br.addSourceTitle'),
          volumes: appState.volumes,
          onSelect: (p) => addSource(p, appState)
        })
    }, [icon('plus', 22), t('wiz.addSource')])
  );
  wrap.appendChild(grid);
  return wrap;
}

async function addSource(p, appState) {
  if (state.sources.some((s) => s.path === p)) return;
  try {
    const scan = await api.scan(p);
    state.sources.push(scan);
    toast(t('wiz.sourceAdded'), `${scan.volume} · ${scan.fileCount} ${t('job.files')}`, 'ok', 3500);
    renderWizard(document.getElementById('content'), appState);
  } catch (e) {
    toast(t('wiz.sourceFail'), e.message, 'bad');
  }
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
  const totalBytes = state.sources.reduce((a, s) => a + s.totalBytes, 0);
  const totalFiles = state.sources.reduce((a, s) => a + s.fileCount, 0);

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
      sourcePaths: state.sources.map((s) => s.path),
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
