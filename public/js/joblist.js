// Jobs list view — history management (open, delete single, clear finished).
import { h, icon, clear, formatBytes, toast, openModal } from './lib.js?v=29';
import { api } from './api.js?v=29';
import { t } from './i18n.js?v=29';

const DELETABLE = (s) => s !== 'running' && s !== 'canceling';

export async function renderJobs(mount, appState) {
  clear(mount);
  mount.appendChild(
    h('div', { class: 'page-head' }, [
      h('h1', {}, t('jobs.title')),
      h('p', {}, t('jobs.sub'))
    ])
  );

  let jobs;
  try {
    jobs = await api.jobs.list();
  } catch (e) {
    mount.appendChild(h('div', { class: 'empty-state' }, e.message));
    return;
  }

  if (!jobs.length) {
    mount.appendChild(
      h('div', { class: 'empty-state' }, [
        icon('list', 46),
        h('div', { class: 'es-title' }, t('jobs.empty')),
        h('div', { class: 'es-body' }, t('jobs.emptyBody')),
        h('button', { class: 'btn primary', onClick: () => window.__go('wizard') }, [icon('plus'), t('nav.wizard')])
      ])
    );
    return;
  }

  // History toolbar: clear every finished/interrupted/draft job at once.
  const clearable = jobs.filter((j) => DELETABLE(j.status)).length;
  if (clearable > 0) {
    mount.appendChild(
      h('div', { class: 'jobs-toolbar' }, [
        h('button', {
          class: 'btn ghost',
          onClick: () => confirmClear(mount, clearable)
        }, [icon('trash', 15), t('jobs.clearFinished')])
      ])
    );
  }

  for (const job of jobs) mount.appendChild(jobCard(job, () => renderJobs(mount, appState)));
}

function confirmClear(mount, count) {
  const close = openModal({
    width: 460,
    content: h('div', { class: 'confirm-modal' }, [
      h('div', { class: 'cm-icon' }, [icon('alert', 22)]),
      h('h3', {}, t('jobs.clearTitle')),
      h('p', {}, t('jobs.delBody')),
      h('div', { class: 'cm-actions' }, [
        h('button', { class: 'btn', onClick: () => close() }, t('common.cancel')),
        h('button', {
          class: 'btn danger',
          onClick: async () => {
            close();
            try {
              const r = await api.jobs.removeFinished();
              toast(t('jobs.cleared'), t('jobs.clearedBody').replace('{n}', r.removed), 'ok');
            } catch (e) {
              toast(t('jobs.delFailed'), e.message, 'bad');
            }
            renderJobs(mount, null);
          }
        }, t('jobs.clearFinished'))
      ])
    ])
  });
}

function confirmDelete(job, done) {
  const close = openModal({
    width: 460,
    content: h('div', { class: 'confirm-modal' }, [
      h('div', { class: 'cm-icon' }, [icon('alert', 22)]),
      h('h3', {}, t('jobs.delTitle')),
      h('p', { class: 'cm-name' }, job.name),
      h('p', {}, t('jobs.delBody')),
      h('div', { class: 'cm-actions' }, [
        h('button', { class: 'btn', onClick: () => close() }, t('common.cancel')),
        h('button', {
          class: 'btn danger',
          onClick: async () => {
            close();
            try {
              await api.jobs.remove(job.id);
              toast(t('jobs.deleted'), job.name, 'ok');
            } catch (e) {
              toast(t('jobs.delFailed'), e.message, 'bad');
            }
            done();
          }
        }, t('jobs.delete'))
      ])
    ])
  });
}

function jobCard(job, onChange) {
  const safeCount = job.sources.filter((s) => s.safe).length;
  const statusKind = {
    completed: 'ok',
    running: 'accent',
    failed: 'bad',
    interrupted: 'warn',
    canceled: 'warn'
  }[job.status] || '';

  const totalSize = job.sources.reduce((a, s) => a + (s.totalBytes || 0), 0);

  return h('div', {
    class: 'card job-card',
    onClick: () => window.__go('job', job.id)
  }, [
    h('div', { class: 'jc-top' }, [
      h('span', { class: 'jc-name' }, job.name),
      h('span', { class: `pill ${statusKind}` }, t(`status.${job.status}`)),
      DELETABLE(job.status)
        ? h('button', {
            class: 'btn ghost jc-del',
            title: t('jobs.delete'),
            'aria-label': t('jobs.delete'),
            onClick: (e) => {
              e.stopPropagation();
              confirmDelete(job, onChange);
            }
          }, [icon('trash', 15)])
        : null
    ]),
    h('div', { class: 'jc-meta' }, [
      h('span', {}, `${job.sources.length} ${t('jobs.cards')}`),
      h('span', {}, `${safeCount}/${job.sources.length} ${t('jobs.safe')}`),
      h('span', {}, `${job.targets.length} ${t('jobs.targetsN')}`),
      h('span', {}, formatBytes(totalSize)),
      h('span', {}, job.project),
      h('span', { class: 'faint' }, job.createdAt.slice(0, 16).replace('T', ' '))
    ])
  ]);
}
