'use strict';

// Gallery section for toast.
(() => {
  const { h, gallery } = YapUI;
  const toast = YapUI.toast;

  gallery.section('toast', 'Toast',
    'Passive notifications in a corner of the screen. They never take focus: press Alt+T (Option+T on Mac) or F6 to reach them, Escape to go back. Errors the person must act on belong inline or in a dialog.',
    (body) => {
      const log = gallery.log();
      const btn = (id, label, onPress, variant = 'secondary') =>
        h('button', { type: 'button', id: 'toast-demo-' + id, class: `button button--sm button--${variant}`, text: label, on: { click: onPress } });
      const track = (name) => ({ onClose: (reason) => log.set(`closed: ${name} (${reason})`) });
      const shown = (name) => log.set('shown: ' + name);

      body.append(
        gallery.example('Variants',
          btn('default', 'Default', () => { toast('Link copied.', track('default')); shown('default'); }),
          btn('accent', 'Accent', () => { toast.accent({ title: 'New version available', description: 'Reload to get the latest Yap.', ...track('accent') }); shown('accent'); }),
          btn('success', 'Success', () => { toast.success({ title: 'Message sent.', ...track('success') }); shown('success'); }),
          btn('warning', 'Warning', () => { toast.warning({ title: 'You can attach up to 10 files to a message.', ...track('warning') }); shown('warning'); }),
          btn('danger', 'Danger', () => { toast.danger({ title: 'Message not sent.', description: 'You’re offline. Yap will keep your draft.', ...track('danger') }); shown('danger'); })),

        gallery.example('Action and lifetime',
          btn('action', 'With “Undo”', () => {
            toast({ title: 'Message deleted.', action: { label: 'Undo', onPress: () => log.set('action: Undo') }, ...track('action') });
            shown('action');
          }),
          btn('persistent', 'Persistent', () => { toast({ title: 'Recording in progress.', description: 'Stays until you close it.', timeout: 0, ...track('persistent') }); shown('persistent'); }),
          btn('long', 'Long description', () => {
            toast.accent({
              title: 'Channel archived.',
              description: 'Members can still read #design-reviews, but nobody can post to it. You can unarchive it from the channel settings at any time, and its history, pins and files stay exactly as they were.',
              ...track('long'),
            });
            shown('long');
          })),

        gallery.example('Promise',
          btn('promise-ok', 'Upload (resolves)', () => {
            const p = new Promise((resolve) => setTimeout(() => resolve('report.pdf'), 1500));
            toast.promise(p, { loading: 'Uploading report.pdf…', success: (name) => `${name} uploaded.`, error: 'Upload failed.' });
            p.then(() => log.set('promise: resolved'));
            shown('promise');
          }),
          btn('promise-fail', 'Upload (rejects)', () => {
            const p = new Promise((_, reject) => setTimeout(() => reject(new Error('The file is larger than 100 MB.')), 1500));
            toast.promise(p, { loading: 'Uploading video.mov…', success: 'Uploaded.', error: (err) => ({ title: 'Upload failed.', description: err.message }) });
            p.catch(() => log.set('promise: rejected'));
            shown('promise');
          })),

        gallery.example('Stacking',
          btn('burst', 'Burst of 6', () => {
            for (let i = 1; i <= 6; i++) toast({ title: `Notification ${i} of 6`, description: i % 2 ? 'Odd one.' : undefined, ...track('burst ' + i) });
            shown('burst of 6');
          }),
          btn('clear', 'Clear all', () => { toast.clear(); log.set('cleared'); }, 'tertiary')),

        gallery.example('Placement',
          ...['top start', 'top', 'top end', 'bottom start', 'bottom', 'bottom end'].map((p) => {
            const cls = (on) => `button button--sm ${on ? 'button--secondary' : 'button--outline'} yui-toast-demo-placement`;
            const b = h('button', { type: 'button', class: cls(p === 'bottom end'), aria: { pressed: String(p === 'bottom end') }, text: p, data: { placement: p } });
            b.addEventListener('click', () => {
              toast.configure({ placement: p });
              for (const x of body.querySelectorAll('.yui-toast-demo-placement')) { x.setAttribute('aria-pressed', String(x === b)); x.className = cls(x === b); }
              toast({ title: `Placement: ${p}.` });
              log.set('placement: ' + p);
            });
            return b;
          })),

        log);
    });
})();
