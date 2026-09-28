// Settings view — saved inline, no modal dialogs.
import { h, icon, clear, toast } from './lib.js?v=27';
import { api } from './api.js?v=27';
import { t, LANG_OPTIONS } from './i18n.js?v=27';

export function renderSettings(mount, appState) {
  clear(mount);
  const s = appState.settings;

  mount.appendChild(
    h('div', { class: 'page-head' }, [
      h('h1', {}, t('set.title')),
      h('p', {}, t('set.sub'))
    ])
  );

  const card = h('div', { class: 'card settings-grid' });

  card.appendChild(
    field(t('set.language'),
      h('select', {
        class: 'input',
        dataset: { key: 'language' },
        onChange: (e) => {
          markDirty();
          api.settings.save({ language: e.target.value }).then(() => location.reload());
        }
      }, LANG_OPTIONS.map(([v, label]) => h('option', { value: v, selected: v === s.language }, label))))
  );
  card.appendChild(textField(t('set.operator'), 'operator', s.operator));
  card.appendChild(
    field(t('set.algorithm'),
      selectField('algorithm', s.algorithm, [
        ['xxh64', t('wiz.algoXxh64')],
        ['md5', 'MD5'],
        ['sha1', 'SHA-1'],
        ['sha256', 'SHA-256']
      ]))
  );
  card.appendChild(textField(t('set.template'), 'template', s.template, true));
  card.appendChild(
    field(t('set.concurrency'),
      h('input', {
        class: 'input', type: 'number', min: '1', max: '8', value: s.sourceConcurrency,
        dataset: { key: 'sourceConcurrency' },
        onInput: markDirty
      }))
  );
  card.appendChild(
    field(t('set.conflict'),
      selectField('conflictPolicy', s.conflictPolicy, [
        ['fail', t('wiz.conflictFail')],
        ['keep-both', t('wiz.conflictKeep')]
      ]))
  );
  card.appendChild(
    field(t('set.theme'),
      selectField('theme', s.theme, [
        ['dark', t('set.themeDark')],
        ['light', t('set.themeLight')],
        ['high-contrast', t('set.themeHC')]
      ]))
  );

  // Notifications (full width)
  const n = s.notifications;
  const notifBox = h('div', { class: 'full' }, [
    h('div', { style: { fontWeight: '600', marginBottom: '8px' } }, t('set.notifications')),
    h('div', { class: 'field' }, [
      h('label', {}, t('set.webhook')),
      h('input', {
        class: 'input', value: n.webhookUrl, placeholder: 'https://hooks.slack.com/services/…',
        dataset: { nested: 'notifications.webhookUrl' },
        onInput: markDirty
      })
    ]),
    h('div', { style: { marginTop: '10px' } }, [
      checkBox(t('set.slackLike'), 'notifications.slackLike', n.slackLike),
      h('div', { style: { marginTop: '8px' } }, [
        checkBox(t('set.evSafe'), 'notifications.events.safe', n.events.includes('safe')),
        checkBox(t('set.evCompleted'), 'notifications.events.completed', n.events.includes('completed')),
        checkBox(t('set.evFailed'), 'notifications.events.failed', n.events.includes('failed'))
      ])
    ])
  ]);
  card.appendChild(notifBox);

  mount.appendChild(card);
  mount.appendChild(
    h('div', { style: { marginTop: '16px', display: 'flex', gap: '10px', alignItems: 'center' } }, [
      h('button', {
        class: 'btn primary',
        onClick: async () => {
          const data = collect();
          try {
            const next = await api.settings.save(data);
            appState.settings = next;
            document.documentElement.dataset.theme = next.theme;
            toast(t('set.saved'), t('set.savedBody'), 'ok', 2500);
          } catch (e) {
            toast(t('set.saveFail'), e.message, 'bad');
          }
        }
      }, [icon('check'), t('set.save')])
    ])
  );

  let dirty = false;
  function markDirty() { dirty = true; }

  function collect() {
    const out = {};
    card.querySelectorAll('[data-key]').forEach((el) => {
      out[el.dataset.key] = el.type === 'number' ? Number(el.value) : el.value;
    });
    card.querySelectorAll('[data-nested]').forEach((el) => {
      const path = el.dataset.nested.split('.');
      let o = out;
      for (let i = 0; i < path.length - 1; i++) o = o[path[i]] = o[path[i]] || {};
      o[path.at(-1)] = el.type === 'checkbox' ? el.checked : el.value;
    });
    // Event checkboxes
    const events = [];
    card.querySelectorAll('[data-event]').forEach((el) => { if (el.checked) events.push(el.dataset.event); });
    out.notifications = out.notifications || {};
    out.notifications.events = events;
    return out;
  }

  function field(label, control) {
    return h('div', { class: 'field' }, [h('label', {}, label), control]);
  }
  function textField(label, key, val, mono) {
    return field(label, h('input', {
      class: `input ${mono ? 'mono' : ''}`, value: val,
      dataset: { key },
      onInput: markDirty
    }));
  }
  function selectField(key, val, opts) {
    return h('select', {
      class: 'input', dataset: { key }, onChange: markDirty
    }, opts.map(([v, label]) => h('option', { value: v, selected: v === val }, label)));
  }
  function checkBox(label, key, checked) {
    return h('label', { class: 'check-row' }, [
      h('input', {
        type: 'checkbox', checked,
        dataset: key.startsWith('notifications.events')
          ? { event: key.split('.').pop() }
          : { nested: key },
        onChange: markDirty
      }),
      label
    ]);
  }
}
