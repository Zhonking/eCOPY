// Server-side folder browser (drawer). Used for sources & targets.
import { h, icon, openDrawer } from './lib.js?v=29';
import { api } from './api.js?v=29';
import { t } from './i18n.js?v=29';

export async function openPathBrowser({ title = t('br.selectFolder'), onSelect, startDir, volumes = [] }) {
  let curDir = startDir || (volumes[0]?.path) || osHome();
  let highlighted = null;

  function osHome() {
    // Server's idea of home — browse with empty string.
    return '';
  }

  const bodyWrap = h('div');

  // Manual path entry — keyboard-first.
  const pathInput = h('input', {
    class: 'input', style: { marginBottom: '10px', fontFamily: 'var(--mono, monospace)', fontSize: '12.5px' },
    value: '',
    placeholder: t('br.pathPh'),
    onKeyDown: (e) => {
      if (e.key === 'Enter') {
        curDir = e.target.value.trim();
        render();
      }
    }
  });

  async function render() {
    bodyWrap.innerHTML = '';
    bodyWrap.appendChild(pathInput);
    pathInput.value = curDir;
    let result;
    try {
      result = await api.browse(curDir || undefined);
    } catch (e) {
      // Path does not exist yet — targets are created at preflight, so let
      // the user pick a not-yet-existing folder instead of dead-ending.
      bodyWrap.appendChild(h('div', { class: 'path-empty' }, `${t('br.cannotOpen')}: ${e.message}`));
      const wanted = pathInput.value.trim() || curDir;
      if (wanted) {
        bodyWrap.appendChild(
          h('div', { class: 'path-missing' }, [
            h('div', {}, [
              icon('alert', 16),
              h('span', {}, t('br.willCreate'))
            ]),
            h('button', {
              class: 'btn primary',
              onClick: () => choose(wanted)
            }, [icon('check'), t('br.pickThisPath')])
          ])
        );
      }
      return;
    }
    curDir = result.dir;

    // Quick roots
    const roots = volumes.slice(0, 8).map((v) =>
      h('button', {
        class: 'pill plain',
        style: { marginRight: '6px', marginBottom: '8px', cursor: 'pointer' },
        onClick: () => {
          curDir = v.path;
          render();
        }
      }, `${v.mount || v.path}`)
    );
    bodyWrap.appendChild(h('div', { style: { marginBottom: '4px' } }, roots));

    bodyWrap.appendChild(h('div', { class: 'path-crumb' }, curDir));

    // Up
    const upRow = h('div', {
      class: 'path-row',
      onClick: () => {
        const i = Math.max(curDir.lastIndexOf('/'), curDir.lastIndexOf('\\'));
        if (i > 0) {
          curDir = curDir.slice(0, i);
          render();
        }
      }
    }, [icon('chevronUp'), h('span', {}, '…')]);
    bodyWrap.appendChild(upRow);

    if (!result.dirs.length) {
      bodyWrap.appendChild(h('div', { class: 'path-empty' }, t('br.noSubfolders')));
    }

    for (const d of result.dirs) {
      const row = h('div', {
        class: 'path-row',
        onClick: () => {
          highlighted = `${curDir}/${d}`;
          renderHighlight();
        },
        onDblClick: () => {
          curDir = `${curDir}/${d}`;
          render();
        }
      }, [
        icon('folder'),
        h('span', {}, d),
        h('button', {
          class: 'btn ghost pr-select',
          onClick: (e) => {
            e.stopPropagation();
            choose(`${curDir}/${d}`);
          }
        }, t('br.select'))
      ]);
      row.dataset.path = `${curDir}/${d}`;
      bodyWrap.appendChild(row);
    }
    renderHighlight();
  }

  function renderHighlight() {
    bodyWrap.querySelectorAll('.path-row').forEach((r) => {
      r.style.background = r.dataset.path === highlighted ? 'var(--surface-2)' : '';
    });
  }

  const header = [
    h('span', { class: 'dh-title' }, title),
    h('button', {
      class: 'icon-btn',
      onClick: () => close()
    }, [icon('x', 17)])
  ];

  const footer = [
    h('button', { class: 'btn', onClick: () => render() }, t('br.refresh')),
    h('button', {
      class: 'btn primary',
      onClick: () => choose(highlighted || curDir)
    }, [icon('check'), t('br.choose')])
  ];

  const { close } = openDrawer({ header, body: bodyWrap, footer });
  await render();

  function choose(p) {
    if (!p) return;
    close();
    onSelect(p);
  }
}
