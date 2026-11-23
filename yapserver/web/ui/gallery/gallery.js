'use strict';

// The gallery: one section per component, in light or dark. Component files
// add sections with YapUI.gallery.section(...); they render in script order.
(() => {
  const { h } = YapUI;
  const main = () => document.querySelector('.gallery-main');
  const nav = () => document.querySelector('.gallery-nav');

  // section(id, title, intro, build): build(container) fills the section.
  // Use example(title, ...nodes) inside it for labelled demos.
  function section(id, title, intro, build) {
    const body = h('div', { class: 'gallery-section__body' });
    const sec = h('section', { class: 'gallery-section', id, aria: { labelledby: id + '-title' } },
      h('h2', { id: id + '-title', class: 'gallery-section__title', text: title }),
      intro && h('p', { class: 'gallery-section__intro', text: intro }),
      body);
    main().append(sec);
    nav().append(h('a', { href: '#' + id, text: title }));
    build(body);
    return sec;
  }

  function example(title, ...nodes) {
    return h('div', { class: 'gallery-example' },
      h('h3', { class: 'gallery-example__title', text: title }),
      h('div', { class: 'gallery-example__demo' }, ...nodes));
  }

  // A one-line log of what a demo did, so tests and people can see events.
  function log(label = 'Last event') {
    const out = h('output', { class: 'gallery-log', aria: { live: 'polite' } }, '—');
    const wrap = h('p', { class: 'gallery-log-row' }, label + ': ', out);
    wrap.set = (text) => { out.textContent = text; };
    return wrap;
  }

  YapUI.gallery = { section, example, log };

  document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(location.search);
    const forced = params.get('theme');
    if (forced) YapUI.theme.apply(forced); else YapUI.theme.follow();
    const group = document.querySelector('.gallery-theme');
    for (const name of ['light', 'dark']) {
      const b = h('button', { type: 'button', class: 'gallery-theme__btn', aria: { pressed: String(YapUI.theme.current() === name) }, text: name === 'light' ? 'Light' : 'Dark' });
      b.addEventListener('click', () => {
        YapUI.theme.apply(name);
        for (const x of group.children) x.setAttribute('aria-pressed', String(x === b));
      });
      group.append(b);
    }
  });
})();
