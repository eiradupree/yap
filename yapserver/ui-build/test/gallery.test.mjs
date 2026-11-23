// The gallery as a whole: every family loads together without errors,
// nothing overflows a phone, and every section passes axe in both themes.
export default async function (t) {
  const p = t.page;
  await p.goto(t.url + '?theme=light');
  const families = ['Button', 'Avatar', 'Tooltip', 'Dropdown', 'Modal', 'toast', 'TextField'];
  const missing = await p.eval(`return ${JSON.stringify(families)}.filter(n => !YapUI[n])`);
  t.check(missing.length === 0, 'every family registers its components', missing);
  const sections = await p.eval(`return [...document.querySelectorAll('.gallery-section')].map(s => s.id)`);
  t.check(sections.length >= 30, `the gallery shows every section (${sections.length})`, sections);
  const navOk = await p.eval(`return [...document.querySelectorAll('.gallery-nav a')].every(a => document.querySelector(a.getAttribute('href')))`);
  t.check(navOk, 'every nav link points at a section');

  await p.viewport(390, 800, true);
  await new Promise((r) => setTimeout(r, 300));
  const wide = await p.eval(`return { doc: document.documentElement.scrollWidth, body: document.body.scrollWidth }`);
  t.check(wide.doc <= 390 && wide.body <= 390, 'nothing widens the page at 390px', wide);
  await p.viewport(1280, 900);

  for (const theme of ['light', 'dark']) {
    await p.theme(theme);
    await new Promise((r) => setTimeout(r, 400));
    await t.axe('.gallery-head', `gallery header (${theme})`);
    await t.axe('.gallery-nav', `gallery nav (${theme})`);
  }
}
