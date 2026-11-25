// Browser smoke test: loads every tab, plays hands, and fails on any console error.
// Usage: npm run test:ui   (needs Playwright + Chromium installed)
import { createRequire } from 'node:module';
import { startServer } from './serve.js';

// require() honours NODE_PATH / global installs, which ESM import does not
const { chromium } = createRequire(import.meta.url)('playwright');
const server = await startServer(8099);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.stack || e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const shots = process.env.SHOTS;
const shot = async (name) => shots && (await page.screenshot({ path: `${shots}/${name}.png`, fullPage: true }));
// Fail on leaked placeholder values in visible text
const checkText = async (where) => {
  const text = await page.evaluate(() => document.querySelector('main').innerText);
  const bad = text.match(/\b(null(?! hypothesis)|undefined|NaN)\b/g);
  if (bad) errors.push(`${where}: visible text contains ${[...new Set(bad)].join(', ')}`);
};

await page.goto('http://localhost:8099/#play');
await page.waitForSelector('.seat');
// speed up bots
await page.selectOption('#play-settings select >> nth=5', '0').catch(() => {});
// play 6 hands: call/check whenever it's our turn
for (let hand = 0; hand < 6; hand++) {
  for (let step = 0; step < 40; step++) {
    const next = await page.$('#next-hand');
    if (next) break;
    const btn = (await page.$('#act-check')) || (await page.$('#act-call'));
    if (btn) await btn.click();
    else await page.waitForTimeout(150);
  }
  if (hand === 2) await shot('play-hand');
  const next = await page.$('#next-hand');
  if (next) await next.click();
  await page.waitForTimeout(100);
}
// wait for hero decision and screenshot the HUD
await page.waitForSelector('#act-check, #act-call', { timeout: 15000 });
await shot('play-hud');
for (const sub of ['session', 'opponents', 'history', 'hand']) {
  await page.click(`.subtab[data-sub=${sub}]`);
  await page.waitForTimeout(100);
  await checkText(`play/${sub}`);
}
// fast-forward 300 hands with a bot in our seat, then check session stats
await page.click('details.settings summary');
await page.selectOption('.ff-row select >> nth=0', '100');
await page.click('#ff-btn');
await page.waitForFunction(() => document.querySelector('#ff-progress')?.textContent.includes('done'), null, { timeout: 60000 });
await checkText('play/fast-forward');
await shot('play-session');
await page.click('.subtab[data-sub=opponents]');
await shot('play-opponents');
await checkText('play/opponents');
for (const tab of ['equity', 'odds', 'probability', 'ranges', 'variance', 'learn']) {
  await page.click(`.tab[data-tab=${tab}]`);
  await page.waitForTimeout(tab === 'probability' ? 2500 : 600);
  if (tab === 'equity') {
    await page.click('#eq-run');
    await page.waitForTimeout(2500);
  }
  if (tab === 'variance') {
    await page.click('text=Generate 3,000 hands');
    await page.waitForTimeout(6000);
  }
  await shot(tab);
  await checkText(tab);
}
// dark theme + phone width
await page.evaluate(() => (document.documentElement.dataset.theme = 'dark'));
await page.click('.tab[data-tab=play]');
await page.waitForTimeout(300);
await shot('play-dark');
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(300);
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
if (overflow > 2) errors.push(`horizontal overflow of ${overflow}px at phone width`);
await shot('play-mobile');
await browser.close();
server.close();
if (errors.length) {
  console.error('UI errors:\n' + errors.join('\n'));
  process.exit(1);
}
console.log('UI smoke test passed: all tabs rendered with no console errors.');
