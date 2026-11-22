'use strict';

// editor.js: Yap's rich text and message box.
//
// Messages are stored as a small Markdown dialect so they stay readable as
// plain text (notifications, other clients): **bold**, _italic_, ~~strike~~,
// `code`, [links](https://…), "- " and "1. " lists, "> " quotes and ``` code
// blocks. Rendering builds DOM nodes directly and never parses HTML, so a
// message can't inject markup.

const isMac = /Mac|iPhone|iPad/.test(navigator.platform);

// ---- icons ----

const svg = (body) => `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

const icons = {
  bold: svg('<path d="M7 5h5.5a3.5 3.5 0 0 1 0 7H7zM7 12h6.5a3.5 3.5 0 0 1 0 7H7z" stroke-width="2.4"/>'),
  italic: svg('<path d="M10 5h8M6 19h8M14 5l-4 14"/>'),
  strike: svg('<path d="M5 12h14M16 7.5C15.4 6 13.9 5 12 5c-2.5 0-4 1.3-4 3 0 1 .4 1.8 1.3 2.4M8 16.5c.6 1.5 2.1 2.5 4 2.5 2.5 0 4-1.3 4-3 0-.6-.2-1.2-.5-1.6"/>'),
  code: svg('<path d="M8.5 8 4.5 12l4 4M15.5 8l4 4-4 4"/>'),
  link: svg('<path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1"/>'),
  bullets: svg('<path d="M10 7h10M10 12h10M10 17h10"/><circle cx="5" cy="7" r="1.2" fill="currentColor"/><circle cx="5" cy="12" r="1.2" fill="currentColor"/><circle cx="5" cy="17" r="1.2" fill="currentColor"/>'),
  numbers: svg('<path d="M11 7h9M11 12h9M11 17h9M4.5 5.5 6 5v4.5M4.3 14a1.3 1.3 0 1 1 2.2 1L4.3 18h2.6" stroke-width="1.7"/>'),
  quote: svg('<path d="M5 5v14" stroke-width="3"/><path d="M10 8h10M10 12h10M10 16h6"/>'),
  codeblock: svg('<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="m10 10-2 2 2 2M14 10l2 2-2 2"/>'),
  format: svg('<path d="m3 18 5-12 5 12M5 14h6"/><circle cx="18" cy="15.5" r="2.5"/><path d="M20.5 12.5V18"/>'),
  paperclip: svg('<path d="m20 11.5-8.2 8.2a5.3 5.3 0 0 1-7.5-7.5L12.8 3.7a3.5 3.5 0 0 1 5 5l-8.5 8.5a1.8 1.8 0 0 1-2.5-2.5l7.8-7.8"/>'),
  send: svg('<path d="M4 12 20 4l-6 16-2.5-6.5zM11.5 13.5 20 4"/>'),
  image: svg('<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="15.5" cy="9.5" r="1.5"/><path d="m3.5 16 5-5 4.5 4.5 2-2 5.5 5.5"/>'),
  file: svg('<path d="M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M14 3v5h5"/>'),
  camera: svg('<path d="M4 8h3l2-2.5h6L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.5"/>'),
  close: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
  alert: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5v.01"/>'),
};

function iconButton(icon, label, extraClass) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'icon-btn' + (extraClass ? ' ' + extraClass : '');
  b.innerHTML = icons[icon]; // static markup from this file
  b.setAttribute('aria-label', label);
  b.dataset.tip = label;
  return b;
}

function shortcutLabel(sc) {
  if (!sc) return '';
  const key = sc.key.toUpperCase();
  return isMac ? `⌘${sc.shift ? '⇧' : ''}${key}` : `Ctrl+${sc.shift ? 'Shift+' : ''}${key}`;
}

// ---- tooltips ----
// Shown after a short delay on hover, and at once on keyboard focus, so they
// work without a mouse. Every icon button gets one.

const tooltip = (() => {
  const el = document.createElement('div');
  el.className = 'tooltip';
  el.setAttribute('role', 'tooltip');
  el.hidden = true;
  document.addEventListener('DOMContentLoaded', () => document.body.append(el));
  let timer = null;
  let target = null;

  function show(t) {
    target = t;
    el.textContent = t.dataset.tip;
    el.hidden = false;
    const r = t.getBoundingClientRect();
    const w = el.offsetWidth, h = el.offsetHeight;
    const left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2));
    const above = r.top - h - 8;
    el.style.left = left + 'px';
    el.style.top = (above > 4 ? above : r.bottom + 8) + 'px';
  }
  function hide() {
    clearTimeout(timer);
    timer = null;
    target = null;
    el.hidden = true;
  }
  document.addEventListener('pointerover', (e) => {
    const t = e.target.closest?.('[data-tip]');
    if (t === target) return;
    hide();
    if (t && e.pointerType === 'mouse') timer = setTimeout(() => show(t), 300);
  });
  document.addEventListener('pointerdown', hide);
  document.addEventListener('focusin', (e) => {
    const t = e.target.closest?.('[data-tip]');
    hide();
    if (t && t.matches(':focus-visible')) show(t);
  });
  document.addEventListener('focusout', hide);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !el.hidden) hide(); }, true);
  window.addEventListener('scroll', hide, true);
  return { hide, refresh: (t) => { if (target === t) show(t); } };
})();

// ---- Markdown ----

const md = (() => {
  const ESCAPABLE = '\\`*_~[]()>#+-.!|';

  function safeURL(raw) {
    try {
      const u = new URL(raw);
      return ['http:', 'https:', 'mailto:'].includes(u.protocol) ? u.href : null;
    } catch {
      return null;
    }
  }

  // Bare links. Trailing punctuation is left out, so "see https://x.com." works.
  const urlRe = /^https?:\/\/[^\s<>"]*[^\s<>".,:;'!?)\]*_~]/;

  function link(href) {
    const a = document.createElement('a');
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer nofollow';
    return a;
  }

  const isWord = (c) => !!c && /[\p{L}\p{N}_]/u.test(c);

  // closing finds the end of a span that opened just before from. Spans can't
  // be empty or start or end with a space.
  function closing(s, mark, from, wordBound) {
    if (from >= s.length || /\s/.test(s[from])) return -1;
    let j = from;
    while ((j = s.indexOf(mark, j + 1)) > 0) {
      if (s[j - 1] === '\\' || /\s/.test(s[j - 1])) continue;
      if (wordBound && isWord(s[j + mark.length])) continue;
      return j;
    }
    return -1;
  }

  function inline(s, parent) {
    let buf = '';
    const flush = () => { if (buf) { parent.append(buf); buf = ''; } };
    const wrap = (tag, inner) => { flush(); const el = document.createElement(tag); inline(inner, el); parent.append(el); };
    let i = 0;
    while (i < s.length) {
      const c = s[i];
      if (c === '\\' && i + 1 < s.length && ESCAPABLE.includes(s[i + 1])) {
        buf += s[i + 1];
        i += 2;
        continue;
      }
      if (c === '`') {
        const j = s.indexOf('`', i + 1);
        if (j > i + 1) {
          flush();
          const code = document.createElement('code');
          code.textContent = s.slice(i + 1, j);
          parent.append(code);
          i = j + 1;
          continue;
        }
      }
      const pair = s.startsWith('**', i) ? '**' : s.startsWith('~~', i) ? '~~' : null;
      if (pair) {
        const j = closing(s, pair, i + 2, false);
        if (j > 0) { wrap(pair === '**' ? 'strong' : 's', s.slice(i + 2, j)); i = j + 2; continue; }
      }
      if ((c === '_' && !isWord(s[i - 1])) || (c === '*' && !pair)) {
        const j = closing(s, c, i + 1, c === '_');
        if (j > 0) { wrap('em', s.slice(i + 1, j)); i = j + 1; continue; }
      }
      if (c === '[') {
        const m = /^\[((?:\\.|[^\]\\])+)\]\(([^()\s]+)\)/.exec(s.slice(i));
        const href = m && safeURL(m[2]);
        if (href) {
          flush();
          const a = link(href);
          inline(m[1], a);
          parent.append(a);
          i += m[0].length;
          continue;
        }
      }
      if (c === 'h' && !isWord(s[i - 1])) {
        const m = urlRe.exec(s.slice(i));
        const href = m && safeURL(m[0]);
        if (href) {
          flush();
          const a = link(href);
          a.textContent = m[0];
          parent.append(a);
          i += m[0].length;
          continue;
        }
      }
      buf += c;
      i++;
    }
    flush();
  }

  function listItem(line) {
    let m = /^[-*] (.*)$/.exec(line);
    if (m) return { ordered: false, text: m[1] };
    m = /^(\d{1,9})\. (.*)$/.exec(line);
    if (m) return { ordered: true, start: Number(m[1]), text: m[2] };
    return null;
  }

  // render turns Markdown into DOM nodes: one <div> per line, plus lists,
  // quotes and code blocks. The editor uses the same structure.
  function render(text) {
    const frag = document.createDocumentFragment();
    const lines = text.split('\n');
    for (let i = 0; i < lines.length;) {
      const line = lines[i];
      if (/^```/.test(line)) {
        const body = [];
        i++;
        while (i < lines.length && !/^```\s*$/.test(lines[i])) body.push(lines[i++]);
        i++;
        const pre = document.createElement('pre');
        pre.textContent = body.join('\n');
        frag.append(pre);
        continue;
      }
      if (/^>( |$)/.test(line)) {
        const body = [];
        while (i < lines.length && /^>( |$)/.test(lines[i])) body.push(lines[i++].replace(/^> ?/, ''));
        const q = document.createElement('blockquote');
        q.append(render(body.join('\n')));
        frag.append(q);
        continue;
      }
      const first = listItem(line);
      if (first) {
        const list = document.createElement(first.ordered ? 'ol' : 'ul');
        if (first.ordered && first.start !== 1) list.start = first.start;
        let item;
        while (i < lines.length && (item = listItem(lines[i])) && item.ordered === first.ordered) {
          const li = document.createElement('li');
          if (item.text) inline(item.text, li); else li.append(document.createElement('br'));
          list.append(li);
          i++;
        }
        frag.append(list);
        continue;
      }
      const div = document.createElement('div');
      if (line === '') div.append(document.createElement('br')); else inline(line, div);
      frag.append(div);
      i++;
    }
    return frag;
  }

  // plain is a message as text, for notifications.
  function plain(text) {
    const d = document.createElement('div');
    d.append(render(text));
    return [...d.childNodes].map((n) => (n.tagName === 'UL' || n.tagName === 'OL')
      ? [...n.children].map((li) => '• ' + li.textContent).join('\n')
      : n.textContent).join('\n');
  }

  // ---- DOM to Markdown, for the editor and pasted HTML ----

  const BLOCK = new Set(['ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'DD', 'DIV', 'DL', 'DT', 'FIGURE', 'FOOTER',
    'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HEADER', 'HR', 'LI', 'MAIN', 'NAV', 'OL', 'P', 'PRE', 'SECTION', 'TABLE',
    'TBODY', 'THEAD', 'TFOOT', 'TR', 'UL']);
  const SKIP = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'HEAD', 'TITLE', 'META', 'LINK', 'NOSCRIPT', 'IFRAME', 'OBJECT', 'SVG', 'IMG', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA']);

  // Escape Markdown characters in typed text, but leave links intact.
  function escapeText(t) {
    return t.split(/(https?:\/\/[^\s<>"]+)/).map((part, i) =>
      i % 2 ? part : part.replace(/[\\`*_~[\]]/g, '\\$&')).join('');
  }

  function escapeLineStart(line) {
    return line.replace(/^>/, '\\>').replace(/^([-+]) /, '\\$1 ').replace(/^(\d+)\. /, '$1\\. ').replace(/^#/, '\\#');
  }

  function wrapMark(mark, inner) {
    const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(inner);
    return m[2] ? m[1] + mark + m[2] + mark + m[3] : inner;
  }

  // styleOf reads the style attribute itself: documents from DOMParser
  // don't fill in element.style.
  function styleOf(el) {
    const css = {};
    for (const decl of (el.getAttribute('style') || '').split(';')) {
      const i = decl.indexOf(':');
      if (i > 0) css[decl.slice(0, i).trim().toLowerCase()] = decl.slice(i + 1).trim().toLowerCase();
    }
    const weight = css['font-weight'] || '';
    const deco = (css['text-decoration'] || '') + ' ' + (css['text-decoration-line'] || '');
    return {
      bold: weight === 'bold' || weight === 'bolder' || Number(weight) >= 600,
      notBold: weight === 'normal' || (weight !== '' && Number(weight) < 600),
      italic: (css['font-style'] || '').startsWith('italic') || (css['font-style'] || '').startsWith('oblique'),
      strike: deco.includes('line-through'),
    };
  }

  function inlineMd(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      // Whitespace between pasted blocks is source formatting, not content.
      if (/^\s*\n\s*$/.test(node.data)) return '';
      return escapeText(node.data.replace(/[\n\t]/g, ' ').replace(/\u00a0/g, ' ').replace(/\u200b/g, ''));
    }
    if (node.nodeType !== Node.ELEMENT_NODE || SKIP.has(node.tagName)) return '';
    const tag = node.tagName;
    if (tag === 'BR') return '\n';
    if (tag === 'CODE' || tag === 'KBD' || tag === 'SAMP') {
      const t = node.textContent.replace(/`/g, '').replace(/\u200b/g, '').replace(/\n/g, ' ');
      return t ? '`' + t + '`' : '';
    }
    let inner = [...node.childNodes].map(inlineMd).join('');
    if (tag === 'A') {
      const href = safeURL(node.getAttribute('href') || '');
      if (!href || !inner.trim()) return inner;
      const text = node.textContent.trim();
      return text === href || text === node.getAttribute('href') ? href : `[${inner.trim()}](${href.replace(/[()]/g, encodeURIComponent)})`;
    }
    const st = styleOf(node);
    const bold = (tag === 'B' || tag === 'STRONG') ? !st.notBold : st.bold;
    if (tag === 'S' || tag === 'STRIKE' || tag === 'DEL' || st.strike) inner = wrapMark('~~', inner);
    if (tag === 'I' || tag === 'EM' || st.italic) inner = wrapMark('_', inner);
    if (bold) inner = wrapMark('**', inner);
    return inner;
  }

  // preText is a code block's text, with <br> and nested blocks as newlines.
  function preText(node) {
    let out = '';
    for (const c of node.childNodes) {
      if (c.nodeType === Node.TEXT_NODE) out += c.data;
      else if (c.tagName === 'BR') out += '\n';
      else if (c.nodeType === Node.ELEMENT_NODE) {
        if (BLOCK.has(c.tagName) && out && !out.endsWith('\n')) out += '\n';
        out += preText(c);
      }
    }
    return out.replace(/\u200b/g, '');
  }

  function blocks(node, lines) {
    let cur = null;
    const flush = () => {
      if (cur === null) return;
      for (const l of cur.split('\n')) lines.push(escapeLineStart(l));
      cur = null;
    };
    for (const child of node.childNodes) {
      const tag = child.nodeType === Node.ELEMENT_NODE ? child.tagName : null;
      if (tag && SKIP.has(tag)) continue;
      if (tag === 'BR') {
        // A <br> ends the line; a last one only holds an empty line open.
        lines.push(escapeLineStart(cur ?? ''));
        cur = null;
        continue;
      }
      if (!tag || !BLOCK.has(tag)) {
        cur = (cur ?? '') + inlineMd(child);
        continue;
      }
      flush();
      if (tag === 'UL' || tag === 'OL') {
        let n = tag === 'OL' ? (Number(child.getAttribute('start')) || 1) : 0;
        for (const li of child.children) {
          const sub = [];
          blocks(li, sub);
          const text = sub.filter((l) => l.trim()).map((l) => l.trim()).join(' ');
          lines.push((tag === 'OL' ? `${n++}. ` : '- ') + text);
        }
      } else if (tag === 'BLOCKQUOTE') {
        const sub = [];
        blocks(child, sub);
        while (sub.length && !sub[sub.length - 1].trim()) sub.pop();
        for (const l of sub.length ? sub : ['']) lines.push('> ' + l);
      } else if (tag === 'PRE') {
        lines.push('```', ...preText(child).replace(/\n$/, '').split('\n'), '```');
      } else if (tag === 'HR') {
        lines.push('');
      } else {
        blocks(child, lines);
      }
    }
    flush();
  }

  function serialize(root) {
    const lines = [];
    blocks(root, lines);
    while (lines.length && !lines[0].trim()) lines.shift();
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
    return lines.map((l) => l.replace(/\s+$/, '')).join('\n');
  }

  function escapePlain(text) {
    return text.split('\n').map((l) => escapeLineStart(escapeText(l))).join('\n');
  }

  return { render, plain, serialize, escapePlain, safeURL };
})();

// ---- menus ----
// An overlay menu of actions opened from a button. Arrow keys, Home and End
// move between items, Enter or Space picks one, a letter jumps to the item
// starting with it, and Escape or Tab closes it.

function createMenu(toggle, { label, items, note }) {
  const pop = document.createElement('div');
  pop.className = 'menu-pop';
  pop.hidden = true;
  const ul = document.createElement('ul');
  ul.setAttribute('role', 'menu');
  ul.setAttribute('aria-label', label);
  ul.id = 'menu-' + Math.random().toString(36).slice(2);
  pop.append(ul);
  if (note) {
    const p = document.createElement('p');
    p.className = 'menu-note';
    p.textContent = note;
    pop.append(p);
  }
  toggle.setAttribute('aria-haspopup', 'menu');
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-controls', ul.id);
  document.addEventListener('DOMContentLoaded', () => document.body.append(pop));
  if (document.readyState !== 'loading') document.body.append(pop);

  let buttons = [];

  function build() {
    ul.replaceChildren();
    buttons = [];
    for (const item of items()) {
      if (item.hidden) continue;
      const li = document.createElement('li');
      li.setAttribute('role', 'none');
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('role', 'menuitem');
      b.tabIndex = -1;
      if (item.disabled) b.setAttribute('aria-disabled', 'true');
      const ic = document.createElement('span');
      ic.className = 'menu-icon';
      ic.innerHTML = icons[item.icon]; // static markup from this file
      const text = document.createElement('span');
      text.className = 'menu-text';
      const l = document.createElement('span');
      l.className = 'menu-label';
      l.textContent = item.label;
      const d = document.createElement('span');
      d.className = 'menu-desc';
      d.textContent = item.disabled || item.description;
      text.append(l, d);
      b.append(ic, text);
      b.addEventListener('click', () => {
        if (item.disabled) return;
        close(false);
        item.action();
      });
      li.append(b);
      ul.append(li);
      buttons.push(b);
    }
  }

  function open(focusFirst = true) {
    build();
    pop.hidden = false;
    toggle.setAttribute('aria-expanded', 'true');
    tooltip.hide();
    const r = toggle.getBoundingClientRect();
    const w = pop.offsetWidth, h = pop.offsetHeight;
    pop.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left)) + 'px';
    // Opens upward, since the message box is at the bottom of the screen.
    pop.style.top = (r.top - h - 8 > 8 ? r.top - h - 8 : r.bottom + 8) + 'px';
    if (focusFirst && buttons[0]) buttons[0].focus();
  }

  function close(refocus = true) {
    if (pop.hidden) return;
    pop.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
    if (refocus) toggle.focus();
  }

  toggle.addEventListener('click', () => (pop.hidden ? open() : close()));
  toggle.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); open(); }
  });
  ul.addEventListener('keydown', (e) => {
    const i = buttons.indexOf(document.activeElement);
    const go = (n) => { e.preventDefault(); buttons[(n + buttons.length) % buttons.length]?.focus(); };
    if (e.key === 'ArrowDown') go(i + 1);
    else if (e.key === 'ArrowUp') go(i - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(buttons.length - 1);
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === 'Tab') close(false);
    else if (e.key.length === 1 && /\S/.test(e.key)) {
      const k = e.key.toLowerCase();
      const order = [...buttons.slice(i + 1), ...buttons.slice(0, i + 1)];
      const hit = order.find((b) => b.querySelector('.menu-label').textContent.toLowerCase().startsWith(k));
      if (hit) { e.preventDefault(); hit.focus(); }
    }
  });
  document.addEventListener('pointerdown', (e) => {
    if (!pop.hidden && !pop.contains(e.target) && !toggle.contains(e.target)) close(false);
  }, true);
  window.addEventListener('resize', () => close(false));

  return { open, close };
}

// ---- the editor ----

const formatCommands = [
  { id: 'bold', label: 'Bold', icon: 'bold', key: 'b', inline: true },
  { id: 'italic', label: 'Italic', icon: 'italic', key: 'i', inline: true },
  { id: 'strike', label: 'Strikethrough', icon: 'strike', key: 'x', shift: true, inline: true },
  { id: 'code', label: 'Code', icon: 'code', key: 'e', inline: true },
  { group: true },
  { id: 'link', label: 'Link', icon: 'link', key: 'k', inline: true },
  { group: true },
  { id: 'bullets', label: 'Bulleted list', icon: 'bullets', key: '8', shift: true },
  { id: 'numbers', label: 'Numbered list', icon: 'numbers', key: '7', shift: true },
  { group: true },
  { id: 'quote', label: 'Quote', icon: 'quote', key: '9', shift: true },
  { id: 'codeblock', label: 'Code block', icon: 'codeblock', key: 'e', shift: true },
];

function escapeHTML(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// createEditor makes a WYSIWYG box: a formatting toolbar over an editable
// area. onSubmit runs on Enter (Shift+Enter adds a line; in lists and code
// blocks Enter adds a line and Cmd/Ctrl+Enter sends).
function createEditor({ placeholder, onSubmit, onCancel, onFiles, onChange }) {
  const el = document.createElement('div');
  el.className = 'editor';
  el.contentEditable = 'true';
  el.setAttribute('role', 'textbox');
  el.setAttribute('aria-multiline', 'true');
  el.spellcheck = true;

  const toolbar = document.createElement('div');
  toolbar.className = 'format-bar';
  toolbar.setAttribute('role', 'toolbar');
  toolbar.setAttribute('aria-label', 'Formatting');
  const buttons = new Map();
  for (const c of formatCommands) {
    if (c.group) {
      const sep = document.createElement('span');
      sep.className = 'sep';
      sep.setAttribute('role', 'separator');
      toolbar.append(sep);
      continue;
    }
    const b = iconButton(c.icon, c.label, 'fmt');
    b.dataset.tip = `${c.label}  ${shortcutLabel(c)}`;
    b.setAttribute('aria-keyshortcuts', `${isMac ? 'Meta' : 'Control'}+${c.shift ? 'Shift+' : ''}${c.key.toUpperCase()}`);
    b.setAttribute('aria-pressed', 'false');
    b.tabIndex = buttons.size === 0 ? 0 : -1;
    // Keep the selection in the editor when a button is clicked.
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', () => {
      if (b.getAttribute('aria-disabled') === 'true') return;
      if (!el.contains(document.getSelection().anchorNode)) placeCaretAtEnd();
      run(c.id);
    });
    buttons.set(c.id, b);
    toolbar.append(b);
  }
  // One tab stop for the toolbar; arrow keys move within it.
  toolbar.addEventListener('keydown', (e) => {
    const list = [...buttons.values()];
    const i = list.indexOf(document.activeElement);
    if (i < 0) return;
    let n = null;
    if (e.key === 'ArrowRight') n = (i + 1) % list.length;
    else if (e.key === 'ArrowLeft') n = (i - 1 + list.length) % list.length;
    else if (e.key === 'Home') n = 0;
    else if (e.key === 'End') n = list.length - 1;
    if (n === null) return;
    e.preventDefault();
    list[i].tabIndex = -1;
    list[n].tabIndex = 0;
    list[n].focus();
  });

  document.execCommand('defaultParagraphSeparator', false, 'div');

  function sel() { return document.getSelection(); }
  function inEditor() { const s = sel(); return s.rangeCount && el.contains(s.anchorNode); }
  function closest(tag) {
    const s = sel();
    if (!s.rangeCount) return null;
    let n = s.anchorNode;
    if (n && n.nodeType === Node.TEXT_NODE) n = n.parentNode;
    const found = n && n.closest ? n.closest(tag) : null;
    return found && el.contains(found) ? found : null;
  }
  function placeCaretAtEnd() {
    el.focus();
    const r = document.createRange();
    r.selectNodeContents(el);
    r.collapse(false);
    sel().removeAllRanges();
    sel().addRange(r);
  }
  function exec(cmd, value = null) {
    document.execCommand('styleWithCSS', false, false);
    document.execCommand(cmd, false, value);
  }

  function toggleCode() {
    const code = closest('code');
    if (code) {
      const r = document.createRange();
      r.selectNode(code);
      sel().removeAllRanges();
      sel().addRange(r);
      exec('insertHTML', escapeHTML(code.textContent.replace(/\u200b/g, '')));
      return;
    }
    const text = sel().toString();
    if (text) {
      exec('insertHTML', `<code>${escapeHTML(text.replace(/\n/g, ' '))}</code>`);
    } else {
      // Nothing selected: start a code span and put the caret in it.
      exec('insertHTML', '<code id="yap-new-code">\u200b</code>');
      const c = document.getElementById('yap-new-code');
      if (c) {
        c.removeAttribute('id');
        const r = document.createRange();
        r.setStart(c.firstChild, 1);
        r.collapse(true);
        sel().removeAllRanges();
        sel().addRange(r);
      }
    }
  }

  function unwrap(block) {
    const frag = document.createDocumentFragment();
    if (block.tagName === 'PRE') {
      for (const line of block.textContent.replace(/\n$/, '').split('\n')) {
        const d = document.createElement('div');
        if (line) d.textContent = line; else d.append(document.createElement('br'));
        frag.append(d);
      }
    } else {
      frag.append(...block.childNodes);
    }
    const first = frag.firstChild;
    block.replaceWith(frag);
    if (first) {
      const r = document.createRange();
      r.selectNodeContents(first);
      r.collapse(false);
      sel().removeAllRanges();
      sel().addRange(r);
    }
    changed();
  }

  function run(id) {
    el.focus();
    switch (id) {
      case 'bold': exec('bold'); break;
      case 'italic': exec('italic'); break;
      case 'strike': exec('strikeThrough'); break;
      case 'code': toggleCode(); break;
      case 'link': openLinkEditor(); return;
      case 'bullets': exec('insertUnorderedList'); break;
      case 'numbers': exec('insertOrderedList'); break;
      case 'quote': { const q = closest('blockquote'); if (q) unwrap(q); else exec('formatBlock', '<blockquote>'); break; }
      case 'codeblock': { const p = closest('pre'); if (p) unwrap(p); else exec('formatBlock', '<pre>'); break; }
    }
    changed();
  }

  // ---- links ----

  const linkPop = document.createElement('form');
  linkPop.className = 'link-pop';
  linkPop.hidden = true;
  linkPop.innerHTML = `
    <label>Text <input name="text" autocomplete="off"></label>
    <label>Link <input name="url" type="text" inputmode="url" placeholder="https://example.com" autocomplete="off" required></label>
    <p class="error" role="alert"></p>
    <div class="link-actions">
      <button type="button" class="link remove-link">Remove link</button>
      <span></span>
      <button type="button" class="link cancel">Cancel</button>
      <button type="submit">Save</button>
    </div>`; // static markup
  let savedRange = null;
  let editingLink = null;

  function openLinkEditor() {
    const s = sel();
    savedRange = s.rangeCount ? s.getRangeAt(0).cloneRange() : null;
    editingLink = closest('a');
    if (editingLink) {
      savedRange = document.createRange();
      savedRange.selectNodeContents(editingLink);
    }
    linkPop.elements.text.value = editingLink ? editingLink.textContent : s.toString();
    linkPop.elements.url.value = editingLink ? editingLink.getAttribute('href') : '';
    linkPop.querySelector('.remove-link').hidden = !editingLink;
    linkPop.querySelector('.error').textContent = '';
    linkPop.hidden = false;
    (linkPop.elements.text.value ? linkPop.elements.url : linkPop.elements.text).focus();
  }

  function closeLinkEditor() {
    linkPop.hidden = true;
    restore();
  }

  function restore() {
    el.focus();
    if (savedRange) {
      sel().removeAllRanges();
      sel().addRange(savedRange);
    }
  }

  linkPop.querySelector('.cancel').addEventListener('click', closeLinkEditor);
  linkPop.querySelector('.remove-link').addEventListener('click', () => {
    linkPop.hidden = true;
    restore();
    exec('unlink');
    changed();
  });
  linkPop.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeLinkEditor(); }
  });
  linkPop.addEventListener('submit', (e) => {
    e.preventDefault();
    let raw = linkPop.elements.url.value.trim();
    if (raw && !/^[a-z][a-z0-9+.-]*:/i.test(raw)) raw = (raw.includes('@') && !raw.includes('/') ? 'mailto:' : 'https://') + raw;
    const href = md.safeURL(raw);
    if (!href) {
      linkPop.querySelector('.error').textContent = 'Enter a web address, like example.com.';
      return;
    }
    const text = linkPop.elements.text.value.trim() || href;
    linkPop.hidden = true;
    restore();
    exec('insertHTML', `<a href="${escapeHTML(href)}">${escapeHTML(text)}</a>`);
    changed();
  });

  // ---- typing, shortcuts and paste ----

  el.addEventListener('keydown', (e) => {
    const mod = isMac ? e.metaKey : e.ctrlKey;
    if (mod && !e.altKey) {
      const key = e.code.startsWith('Key') ? e.code.slice(3).toLowerCase() : e.code.startsWith('Digit') ? e.code.slice(5) : '';
      const c = formatCommands.find((x) => x.key === key && !!x.shift === e.shiftKey);
      if (c) {
        e.preventDefault();
        if (buttons.get(c.id).getAttribute('aria-disabled') !== 'true') run(c.id);
        return;
      }
    }
    if (e.key === 'Enter' && !e.isComposing) {
      const inBlock = closest('li') || closest('pre');
      if (mod || (!e.shiftKey && !inBlock)) {
        e.preventDefault();
        onSubmit?.();
      }
      return;
    }
    if (e.key === 'Escape' && onCancel) { e.preventDefault(); e.stopPropagation(); onCancel(); }
  });

  el.addEventListener('paste', (e) => {
    const files = [...(e.clipboardData?.files || [])];
    if (files.length && onFiles) {
      e.preventDefault();
      onFiles(files);
      return;
    }
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    if (closest('pre') || closest('code')) {
      exec('insertText', text);
      return;
    }
    const html = e.clipboardData.getData('text/html');
    // Pasted HTML is parsed inertly, converted to Markdown and rendered back,
    // so only formatting Yap supports survives.
    const markdown = html ? md.serialize(new DOMParser().parseFromString(html, 'text/html').body) : md.escapePlain(text);
    if (!markdown) return;
    const box = document.createElement('div');
    box.append(md.render(markdown));
    const only = box.childNodes.length === 1 && box.firstChild.tagName === 'DIV' ? box.firstChild : box;
    exec('insertHTML', only.innerHTML);
    changed();
  });

  // Dropping text into the box works like pasting it.
  el.addEventListener('drop', (e) => {
    if (e.dataTransfer.files.length) return; // handled by the composer
    e.preventDefault();
    const text = e.dataTransfer.getData('text/plain');
    if (text) exec('insertText', text);
  });

  function changed() {
    const empty = isEmpty();
    el.classList.toggle('is-empty', empty);
    updateState();
    onChange?.(empty);
  }
  el.addEventListener('input', changed);

  // Show which formats are on where the caret is. Inline formats don't apply
  // inside code, so they're grayed out there.
  function updateState() {
    if (!inEditor()) return;
    const inPre = !!closest('pre');
    const inCode = !!closest('code');
    const state = {
      bold: document.queryCommandState('bold'),
      italic: document.queryCommandState('italic'),
      strike: document.queryCommandState('strikeThrough'),
      code: inCode,
      link: !!closest('a'),
      bullets: !!closest('ul'),
      numbers: !!closest('ol'),
      quote: !!closest('blockquote'),
      codeblock: inPre,
    };
    for (const c of formatCommands) {
      if (c.group) continue;
      const b = buttons.get(c.id);
      b.setAttribute('aria-pressed', String(!!state[c.id]));
      const off = (inPre && c.id !== 'codeblock') || (inCode && c.inline && c.id !== 'code');
      if (off) {
        b.setAttribute('aria-disabled', 'true');
        b.dataset.tip = `${c.label} isn't available in ${inPre ? 'a code block' : 'code'}`;
      } else {
        b.removeAttribute('aria-disabled');
        b.dataset.tip = `${c.label}  ${shortcutLabel(c)}`;
      }
      tooltip.refresh(b);
    }
  }
  document.addEventListener('selectionchange', updateState);

  function isEmpty() {
    return !el.textContent.replace(/\u200b/g, '').trim() && !el.querySelector('li, pre, blockquote');
  }

  function setMarkdown(text) {
    el.replaceChildren(md.render(text));
    changed();
  }

  return {
    el,
    toolbar,
    linkPop,
    focus() { placeCaretAtEnd(); },
    getMarkdown() { return md.serialize(el); },
    setMarkdown,
    clear() { el.replaceChildren(); changed(); },
    isEmpty,
    setPlaceholder(text) { el.dataset.placeholder = text; el.setAttribute('aria-label', text); },
    init() { this.setPlaceholder(placeholder); changed(); },
  };
}

// ---- the message box ----

const maxUploadBytes = 10 * 1024 * 1024;
const maxFiles = 10;
const imageTypes = 'image/png,image/jpeg,image/gif,image/webp';
const touchDevice = window.matchMedia('(pointer: coarse)').matches;

function uploadWithProgress(file, onProgress) {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open('POST', '/api/uploads?name=' + encodeURIComponent(file.name || 'pasted-image.png'));
    x.setRequestHeader('Content-Type', 'application/octet-stream');
    x.setRequestHeader('X-Yap-Upload', '1');
    x.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
    x.onload = () => {
      let data = {};
      try { data = JSON.parse(x.responseText); } catch {}
      if (x.status >= 200 && x.status < 300) return resolve(data);
      const err = new Error(
        x.status === 413 ? 'Too big. Files can be up to 10 MB.'
          : x.status === 429 ? 'Too many uploads at once. Wait a moment, then retry.'
            : x.status === 401 ? 'You\'ve been signed out. Sign in again to upload.'
              : (data.error ? data.error[0].toUpperCase() + data.error.slice(1) + '.' : 'Upload failed. Try again.'));
      err.retry = x.status !== 413 && x.status !== 401;
      reject(err);
    };
    x.onerror = () => {
      const err = new Error('Couldn\'t upload. Check your connection, then retry.');
      err.retry = true;
      reject(err);
    };
    x.send(file);
  });
}

// createComposer fills a <form> with the message box: formatting toolbar,
// editor, files waiting to be sent, and the attach, formatting and send
// buttons, all inside one bordered box. send(markdown, attachmentIDs) posts it.
function createComposer(form, { placeholder, dropZone, send, attachments = true, submitLabel = 'Send' }) {
  form.replaceChildren();
  form.classList.add('composer');
  const box = document.createElement('div');
  box.className = 'box';

  const pending = []; // { file, att, progress, error, retry }
  const tray = document.createElement('ul');
  tray.className = 'pending';
  tray.setAttribute('aria-label', 'Attachments');
  tray.hidden = true;

  const editor = createEditor({
    placeholder,
    onSubmit: () => form.requestSubmit(),
    onFiles: attachments ? addFiles : null,
    onChange: () => updateSend(),
  });

  const foot = document.createElement('div');
  foot.className = 'box-foot';

  let attachBtn = null;
  if (attachments) {
    attachBtn = iconButton('paperclip', 'Attach', 'attach');
    attachBtn.dataset.tip = 'Attach files';
    const imageInput = Object.assign(document.createElement('input'), { type: 'file', multiple: true, accept: imageTypes, hidden: true });
    const fileInput = Object.assign(document.createElement('input'), { type: 'file', multiple: true, hidden: true });
    const cameraInput = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/*', hidden: true });
    cameraInput.setAttribute('capture', 'environment');
    for (const input of [imageInput, fileInput, cameraInput]) {
      input.addEventListener('change', () => { addFiles([...input.files]); input.value = ''; });
      foot.append(input);
    }
    const full = () => pending.length >= maxFiles ? `You can attach up to ${maxFiles} files to a message` : null;
    createMenu(attachBtn, {
      label: 'Attach',
      note: 'You can also drag files into the message box or paste them.',
      items: () => [
        { icon: 'image', label: 'Upload image or GIF', description: 'PNG, JPEG, GIF or WebP, up to 10 MB. Shown in the message.', disabled: full(), action: () => imageInput.click() },
        { icon: 'file', label: 'Upload file', description: 'Any type, up to 10 MB. Others can download it.', disabled: full(), action: () => fileInput.click() },
        { icon: 'camera', label: 'Take photo', description: 'Use your camera.', disabled: full(), hidden: !touchDevice, action: () => cameraInput.click() },
      ],
    });
    foot.append(attachBtn);
  }

  // Formatting can be hidden to save space; phones start with it hidden.
  const fmtBtn = iconButton('format', 'Formatting', 'fmt-toggle');
  let showFormatting = !window.matchMedia('(max-width: 640px)').matches;
  try { const v = localStorage.getItem('yap.formatting'); if (v) showFormatting = v === 'on'; } catch {}
  function applyFormatting() {
    editor.toolbar.hidden = !showFormatting;
    fmtBtn.setAttribute('aria-pressed', String(showFormatting));
    fmtBtn.dataset.tip = showFormatting ? 'Hide formatting' : 'Show formatting';
    tooltip.refresh(fmtBtn);
  }
  fmtBtn.addEventListener('mousedown', (e) => e.preventDefault());
  fmtBtn.addEventListener('click', () => {
    showFormatting = !showFormatting;
    try { localStorage.setItem('yap.formatting', showFormatting ? 'on' : 'off'); } catch {}
    applyFormatting();
  });
  foot.append(fmtBtn);

  const spacer = document.createElement('span');
  spacer.className = 'spacer';
  const sendBtn = iconButton('send', submitLabel, 'send');
  sendBtn.type = 'submit';
  foot.append(spacer, sendBtn);

  box.append(editor.toolbar, editor.el, tray, foot);
  form.append(box, editor.linkPop);
  editor.init();
  applyFormatting();

  function uploading() { return pending.some((p) => !p.att && !p.error); }
  function ready() { return pending.some((p) => p.att) || !editor.isEmpty(); }

  // The send button stays focusable when it can't be used, and its tooltip
  // says why.
  function updateSend() {
    const why = uploading() ? 'Wait for files to finish uploading'
      : !ready() ? (attachments ? 'Type a message or attach a file' : 'Type a message') : null;
    if (why) sendBtn.setAttribute('aria-disabled', 'true'); else sendBtn.removeAttribute('aria-disabled');
    sendBtn.dataset.tip = why || `${submitLabel}  (Enter)`;
    tooltip.refresh(sendBtn);
  }

  function renderTray() {
    tray.hidden = pending.length === 0;
    tray.replaceChildren(...pending.map(chip));
    updateSend();
  }

  function chip(p) {
    const li = document.createElement('li');
    li.className = 'chip ' + (p.error ? 'failed' : p.att ? 'done' : 'uploading');
    const lead = document.createElement('span');
    lead.className = 'chip-lead';
    if (p.error) lead.innerHTML = icons.alert;
    else if (p.att && p.att.content_type.startsWith('image/')) {
      const img = document.createElement('img');
      img.src = p.att.url;
      img.alt = '';
      lead.append(img);
    } else lead.innerHTML = icons.file;
    const body = document.createElement('span');
    body.className = 'chip-body';
    const name = document.createElement('span');
    name.className = 'chip-name';
    name.textContent = p.file.name || 'Pasted image';
    const status = document.createElement('span');
    status.className = 'chip-status';
    if (p.error) {
      status.textContent = p.error;
      status.setAttribute('role', 'alert');
    } else if (p.att) {
      status.textContent = formatBytes(p.att.size);
    } else {
      const pct = Math.round((p.progress || 0) * 100);
      status.textContent = `Uploading… ${pct}%`;
      const bar = document.createElement('span');
      bar.className = 'chip-bar';
      bar.style.setProperty('--p', pct + '%');
      bar.setAttribute('role', 'progressbar');
      bar.setAttribute('aria-valuenow', String(pct));
      bar.setAttribute('aria-valuemin', '0');
      bar.setAttribute('aria-valuemax', '100');
      bar.setAttribute('aria-label', `Uploading ${p.file.name}`);
      li.append(bar);
    }
    body.append(name, status);
    li.append(lead, body);
    if (p.error && p.retry) {
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'link';
      retry.textContent = 'Retry';
      retry.addEventListener('click', () => start(p));
      li.append(retry);
    }
    const remove = iconButton('close', `Remove ${p.file.name || 'attachment'}`, 'chip-remove');
    remove.addEventListener('click', () => {
      pending.splice(pending.indexOf(p), 1);
      p.cancelled = true;
      if (p.att) fetch(`/api/uploads/${p.att.id}`, {
        method: 'DELETE', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: '{}',
      }).catch(() => {});
      renderTray();
      editor.focus();
    });
    li.append(remove);
    return li;
  }

  function start(p) {
    p.error = null;
    p.progress = 0;
    renderTray();
    let last = 0;
    uploadWithProgress(p.file, (f) => {
      p.progress = f;
      if (Date.now() - last > 100) { last = Date.now(); renderTray(); }
    }).then((att) => {
      if (p.cancelled) {
        fetch(`/api/uploads/${att.id}`, { method: 'DELETE', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => {});
        return;
      }
      p.att = att;
    }, (err) => {
      p.error = err.message;
      p.retry = err.retry;
    }).finally(renderTray);
  }

  function addFiles(files) {
    if (!attachments) return;
    for (const file of files) {
      if (pending.length >= maxFiles) {
        alert(`You can attach up to ${maxFiles} files to a message.`);
        break;
      }
      const p = { file, att: null, error: null, progress: 0 };
      pending.push(p);
      if (file.size > maxUploadBytes) {
        p.error = `Too big (${formatBytes(file.size)}). Files can be up to 10 MB.`;
        p.retry = false;
      } else if (file.size === 0) {
        p.error = 'This file is empty.';
        p.retry = false;
      } else {
        start(p);
      }
    }
    renderTray();
    editor.focus();
  }

  // Drag and drop: the box lights up while files are over the drop zone.
  if (attachments && dropZone) {
    let depth = 0;
    const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
    dropZone.addEventListener('dragenter', (e) => {
      if (!hasFiles(e) || form.hidden) return;
      depth++;
      box.classList.add('dropping');
      dropZone.classList.add('dropping');
    });
    dropZone.addEventListener('dragleave', () => {
      if (--depth <= 0) { depth = 0; box.classList.remove('dropping'); dropZone.classList.remove('dropping'); }
    });
    dropZone.addEventListener('dragover', (e) => { if (hasFiles(e) && !form.hidden) e.preventDefault(); });
    dropZone.addEventListener('drop', (e) => {
      depth = 0;
      box.classList.remove('dropping');
      dropZone.classList.remove('dropping');
      if (!e.dataTransfer.files.length || form.hidden) return;
      e.preventDefault();
      addFiles([...e.dataTransfer.files]);
    });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (sendBtn.getAttribute('aria-disabled') === 'true') return;
    const markdown = editor.getMarkdown();
    if ([...markdown].length > 4000) {
      alert('Messages can be up to 4,000 characters, including formatting.');
      return;
    }
    const sent = pending.filter((p) => p.att);
    const failed = pending.filter((p) => !p.att);
    pending.splice(0, pending.length, ...failed);
    editor.clear();
    renderTray();
    try {
      await send(markdown, sent.map((p) => p.att.id));
    } catch (err) {
      editor.setMarkdown(markdown);
      pending.unshift(...sent);
      renderTray();
      alert(err.message);
    }
    editor.focus();
  });

  updateSend();
  return {
    form,
    editor,
    focus: () => editor.focus(),
    setPlaceholder: (t) => editor.setPlaceholder(t),
    addFiles,
  };
}

function formatBytes(n) {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return Math.round(n / 1024) + ' KB';
  return (n / 1024 / 1024).toFixed(1) + ' MB';
}
