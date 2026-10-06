// Disks & volumes view with space bars and physical health.
import { h, icon, clear, formatBytes, toast } from './lib.js?v=29';
import { api } from './api.js?v=29';
import { t } from './i18n.js?v=29';

export function renderDisks(mount, appState) {
  clear(mount);
  mount.appendChild(
    h('div', { class: 'page-head' }, [
      h('h1', {}, t('disks.title')),
      h('p', {}, t('disks.sub'))
    ])
  );

  // Volumes
  mount.appendChild(h('div', { class: 'card', style: { marginBottom: '18px' } }, [
    h('div', { class: 'section-title', style: { marginTop: '0' } }, t('disks.volumes')),
    ...(appState.volumes.length
      ? appState.volumes.map(volumeRow)
      : [h('div', { class: 'faint' }, t('disks.noVolumes'))])
  ]));

  // Physical
  const physicalCard = h('div', { class: 'card' }, [
    h('div', { class: 'section-title', style: { marginTop: '0' } }, t('disks.physical')),
    appState.physical.length
      ? physicalTable(appState.physical)
      : h('div', { class: 'faint' }, t('disks.noPhysical'))
  ]);
  mount.appendChild(physicalCard);

  // Temperature needs elevation on Windows — explain inline, no modal.
  const needAdmin = appState.physical.some(
    (r) => r.tempC == null && r.tempError && /not available|denied|CIM|admin|privilege/i.test(r.tempError)
  );
  if (needAdmin) mount.appendChild(tempAdminNotice());
}

function tempAdminNotice() {
  const canElevate = typeof window !== 'undefined' && window.ecopy && window.ecopy.relaunchElevated;
  return h('div', { class: 'inline-notice' }, [
    icon('alert', 18),
    h('div', { class: 'notice-body' }, [
      h('div', { class: 'notice-title' }, t('disks.tempUnavailable')),
      h('div', { class: 'faint' }, t('disks.tempAdmin'))
    ]),
    canElevate
      ? h('button', {
          class: 'btn primary',
          onClick: () => {
            toast(t('disks.restarting'), t('disks.restartBody'), 'info');
            window.ecopy.relaunchElevated();
          }
        }, [icon('shield'), t('disks.adminRestart')])
      : null
  ]);
}

function volumeRow(v) {
  const usedPct = v.size ? ((v.size - v.free) / v.size) * 100 : 0;
  const barCls = usedPct > 92 ? 'full' : usedPct > 78 ? 'high' : '';
  return h('div', { class: 'disk-row' }, [
    h('div', { class: 'disk-letter' }, v.mount.replace(':', '')),
    h('div', { class: 'disk-info' }, [
      h('div', { class: 'dn' }, [
        h('b', {}, v.label || t('disks.noLabel')),
        v.removable ? h('span', { class: 'pill accent plain' }, t('disks.removable')) : null,
        h('span', { class: 'pill plain' }, v.fs)
      ]),
      h('div', { class: `disk-bar ${barCls}` }, [h('div', { style: { width: `${usedPct}%` } })])
    ]),
    h('div', { class: 'disk-size' }, [
      h('div', {}, `${formatBytes(v.free)} ${t('disks.free')}`),
      h('div', { class: 'faint' }, `${t('disks.of')} ${formatBytes(v.size)}`)
    ])
  ]);
}

function tempCell(r) {
  if (r.tempC == null) return h('span', { class: 'faint' }, '—');
  const cls = r.tempC >= 65 ? 'bad' : r.tempC >= 50 ? 'warn' : 'ok';
  return h('span', { class: `pill ${cls}` }, `${r.tempC} °C`);
}

function physicalTable(rows) {
  return h('table', { class: 'data-table' }, [
    h('thead', {}, h('tr', {}, [
      h('th', {}, t('disks.drive')), h('th', {}, t('disks.type')), h('th', {}, t('disks.health')),
      h('th', {}, t('disks.status')), h('th', {}, t('disks.temp')), h('th', {}, t('disks.size'))
    ])),
    h('tbody', {}, rows.map((r) =>
      h('tr', {}, [
        h('td', {}, r.name),
        h('td', {}, r.mediaType),
        h('td', {}, h('span', {
          class: 'pill ' + (/healthy/i.test(r.health) ? 'ok' : r.health ? 'warn' : 'plain')
        }, r.health || '—')),
        h('td', {}, r.status),
        h('td', {}, tempCell(r)),
        h('td', {}, formatBytes(r.size))
      ])
    ))
  ]);
}
