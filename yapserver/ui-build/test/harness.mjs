// Test harness for Yap UI: serves yapserver/web with the production
// Content-Security-Policy, drives headless Chrome over the DevTools protocol,
// and runs axe-core accessibility audits. Used by run.mjs.

import { createServer } from 'node:http';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
export const WEB_ROOT = join(here, '..', '..', 'web');
const require = createRequire(import.meta.url);

// Same policy yapserver sends (server.go, without LiveKit origins).
export const CSP = "default-src 'self'; connect-src 'self' ws: wss:; img-src 'self' data:; media-src 'self' blob:; frame-ancestors 'none'";

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };

export function serve(port) {
  const server = createServer(async (req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
    const file = join(WEB_ROOT, path.endsWith('/') ? path + 'index.html' : path);
    if (!file.startsWith(WEB_ROOT)) { res.writeHead(403).end(); return; }
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Content-Security-Policy': CSP, 'X-Content-Type-Options': 'nosniff' });
      res.end(body);
    } catch {
      res.writeHead(404).end('not found');
    }
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function launch(debugPort) {
  const profile = await mkdtemp(join(tmpdir(), 'yui-chrome-'));
  const proc = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--window-size=1280,900', 'about:blank'], { stdio: 'ignore' });
  let tabs;
  for (let i = 0; i < 50; i++) {
    try { tabs = await (await fetch(`http://127.0.0.1:${debugPort}/json`)).json(); if (tabs.some((t) => t.type === 'page')) break; } catch {}
    await sleep(200);
  }
  if (!tabs) throw new Error('Chrome did not start');
  const page = tabs.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); });
  const browser = new Page(ws);
  browser.close = async () => { ws.close(); proc.kill(); await sleep(200); await rm(profile, { recursive: true, force: true }); };
  await browser.init();
  return browser;
}

class Page {
  constructor(ws) {
    this.ws = ws;
    this.id = 1;
    this.pending = new Map();
    this.problems = []; // page errors, console errors and CSP violations
    ws.addEventListener('message', (e) => {
      const msg = JSON.parse(e.data);
      if (msg.id && this.pending.has(msg.id)) { this.pending.get(msg.id)(msg); this.pending.delete(msg.id); return; }
      if (msg.method === 'Runtime.exceptionThrown') this.problems.push('exception: ' + (msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text));
      if (msg.method === 'Runtime.consoleAPICalled' && (msg.params.type === 'error' || msg.params.type === 'warning')) this.problems.push(`console.${msg.params.type}: ` + msg.params.args.map((a) => a.value ?? a.description).join(' '));
      if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') this.problems.push('log: ' + msg.params.entry.text);
      if (msg.method === 'Page.javascriptDialogOpening') this.send('Page.handleJavaScriptDialog', { accept: true });
    });
  }

  // Every DevTools call fails after 30 s instead of waiting forever, so a stuck
  // page (a promise that never settles in eval, a hung navigation) fails the run
  // and names the call rather than hanging it.
  send(method, params = {}, timeout = 30000) {
    return new Promise((resolve, reject) => {
      const id = this.id++;
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`DevTools ${method} got no answer in ${timeout / 1000} s` + (params.expression ? ': ' + params.expression.slice(0, 120) : ''))); }, timeout);
      this.pending.set(id, (msg) => { clearTimeout(timer); resolve(msg); });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async init() {
    await this.send('Runtime.enable');
    await this.send('Page.enable');
    await this.send('Log.enable');
    await this.send('DOM.enable');
    await this.send('Emulation.setFocusEmulationEnabled', { enabled: true });
    await this.viewport(1280, 900);
  }

  async viewport(width, height, mobile = false) {
    await this.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
  }

  async goto(url) {
    await this.send('Page.navigate', { url });
    await this.waitFor('document.readyState === "complete" && window.YapUI', 'page load');
  }

  // evaluate runs an async function body in the page and returns its result.
  async eval(body) {
    const res = await this.send('Runtime.evaluate', { expression: `(async () => { ${body} })()`, awaitPromise: true, returnByValue: true, userGesture: true });
    if (res.result.exceptionDetails) throw new Error('eval failed: ' + (res.result.exceptionDetails.exception?.description || res.result.exceptionDetails.text) + '\n  in: ' + body.slice(0, 200));
    return res.result.result.value;
  }

  async waitFor(expr, what, timeout = 5000) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      try { if (await this.eval(`return !!(${expr})`)) return; } catch {}
      await sleep(50);
    }
    throw new Error('timed out waiting for ' + (what || expr));
  }

  async center(selector) {
    const r = await this.eval(`const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null; el.scrollIntoView({block: 'center', inline: 'center'}); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };`);
    if (!r) throw new Error('no element ' + selector);
    return r;
  }

  // Real mouse input, so :hover, focus and pointer events behave as for users.
  async hover(selector) { const { x, y } = await this.center(selector); await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }); }
  async mouseAway() { await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1, y: 1 }); }
  async click(selector) {
    const { x, y } = await this.center(selector);
    await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
    await sleep(40);
  }
  async clickAt(x, y) {
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
    await sleep(40);
  }

  // Real keyboard input. key('Tab'), key('Enter'), key('ArrowDown'),
  // key('Tab', {shift: true}), key('a', {meta: true}).
  async key(key, { shift = false, meta = false, ctrl = false, alt = false } = {}) {
    const codes = { Enter: 13, Tab: 9, Escape: 27, ' ': 32, ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, Home: 36, End: 35, Backspace: 8, Delete: 46, PageUp: 33, PageDown: 34 };
    const modifiers = (alt ? 1 : 0) | (ctrl ? 2 : 0) | (meta ? 4 : 0) | (shift ? 8 : 0);
    const vk = codes[key] ?? key.toUpperCase().charCodeAt(0);
    const code = key === ' ' ? 'Space' : key.length === 1 ? (/[a-z]/i.test(key) ? 'Key' + key.toUpperCase() : /\d/.test(key) ? 'Digit' + key : key) : key;
    const text = key === 'Enter' ? '\r' : key === ' ' ? ' ' : key.length === 1 && !meta && !ctrl ? key : undefined;
    await this.send('Input.dispatchKeyEvent', { type: text ? 'keyDown' : 'rawKeyDown', key, code, modifiers, windowsVirtualKeyCode: vk, text });
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, modifiers, windowsVirtualKeyCode: vk });
    await sleep(30);
  }

  async type(text) { await this.send('Input.insertText', { text }); await sleep(20); }

  // The focused element as a short description: tag#id.class "text".
  async focused() {
    return this.eval(`const el = document.activeElement; if (!el || el === document.body) return 'body'; return el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\\s+/).join('.') : '') + ' "' + (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 40) + '"';`);
  }

  async theme(name) { await this.eval(`YapUI.theme.apply(${JSON.stringify(name)})`); }

  async screenshot(path) {
    const { result } = await this.send('Page.captureScreenshot', { format: 'png' });
    const { writeFile } = await import('node:fs/promises');
    await writeFile(path, Buffer.from(result.data, 'base64'));
  }

  // axe runs an axe-core audit (WCAG 2.1 A/AA) on the selector and returns
  // violations as short strings.
  async axe(selector = 'body') {
    if (!(await this.eval('return !!window.axe'))) {
      const src = await readFile(require.resolve('axe-core/axe.min.js'), 'utf8');
      await this.send('Runtime.evaluate', { expression: src });
    }
    return this.eval(`
      const r = await axe.run(document.querySelector(${JSON.stringify(selector)}), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] }, rules: { region: { enabled: false } } });
      return r.violations.map(v => v.id + ' (' + v.impact + '): ' + v.help + ' → ' + v.nodes.slice(0, 3).map(n => n.target.join(' ')).join(', '));`);
  }
}
