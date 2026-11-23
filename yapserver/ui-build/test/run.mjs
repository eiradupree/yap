// Runs Yap UI browser tests.
//
//   node test/run.mjs                # every test/*.test.mjs
//   node test/run.mjs buttons forms  # just these
//   PORT=9200 node test/run.mjs …    # pick ports when several runs share a machine
//
// Each test file exports `default async function (t)`. t.page is the browser
// (see harness.mjs), t.url is the gallery URL, and t.check(ok, what, detail)
// records a result. A run fails on any failed check, page error, console
// error or warning, or CSP violation, and on axe violations reported through
// t.axe(selector).

import { readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve, launch } from './harness.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const base = Number(process.env.PORT || 9300);
const names = process.argv.slice(2).length
  ? process.argv.slice(2)
  : (await readdir(here)).filter((f) => f.endsWith('.test.mjs')).map((f) => f.replace('.test.mjs', ''));

const server = await serve(base);
const page = await launch(base + 1);
const shots = process.env.SHOTS || join(here, '..', 'shots');
let failed = 0;

for (const name of names) {
  const results = [];
  const t = {
    page,
    url: `http://127.0.0.1:${base}/ui/gallery.html`,
    shots,
    check(ok, what, detail) { results.push({ ok: !!ok, what, detail }); },
    async axe(selector, what = selector) {
      const v = await page.axe(selector);
      results.push({ ok: v.length === 0, what: `axe: ${what}`, detail: v });
    },
  };
  page.problems.length = 0;
  console.log(`\n== ${name}`);
  try {
    const mod = await import(join(here, `${name}.test.mjs`));
    await mod.default(t);
  } catch (err) {
    results.push({ ok: false, what: 'test threw', detail: String(err.stack || err) });
  }
  if (page.problems.length) results.push({ ok: false, what: 'no page errors, console errors or CSP violations', detail: [...page.problems] });
  for (const r of results) {
    console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.what}${!r.ok && r.detail !== undefined ? '\n     ' + (Array.isArray(r.detail) ? r.detail.join('\n     ') : JSON.stringify(r.detail)) : ''}`);
    if (!r.ok) failed++;
  }
}

await page.close();
server.close();
console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
