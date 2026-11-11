import { createRequire } from 'node:module';
const { chromium } = createRequire(new URL('../../../apps/omher/package.json', import.meta.url))('@playwright/test');
import { writeFile } from 'node:fs/promises';
const label = process.argv[2] ?? 'baseline';
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 820 }, reducedMotion: 'no-preference' });
const page = await context.newPage();
await page.addInitScript(() => {
  localStorage.setItem('omher.onboarded', '1');
  window.__profileHidden = false;
  window.__profileIntervals = 0;
  Object.defineProperty(document, 'visibilityState', { get: () => window.__profileHidden ? 'hidden' : 'visible' });
  const interval = window.setInterval.bind(window);
  window.setInterval = (fn, ms, ...args) => interval(() => { window.__profileIntervals++; fn(...args); }, ms);
});
const cdp = await context.newCDPSession(page);
await cdp.send('Performance.enable');
await page.goto('http://127.0.0.1:5577');
await page.getByTestId('sidebar').waitFor();
await page.waitForTimeout(2500);
const metric = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));
const result = [];
for (const hidden of [false, true, false, true, false, true]) {
  await page.evaluate(hidden => { window.__profileHidden = hidden; document.dispatchEvent(new Event('visibilitychange')); }, hidden);
  await page.waitForTimeout(500);
  const initial = await metric();
  const ticks = await page.evaluate(() => window.__profileIntervals);
  await page.waitForTimeout(5000);
  const final = await metric();
  result.push({ hidden, wallSeconds: final.Timestamp-initial.Timestamp, taskSeconds: final.TaskDuration-initial.TaskDuration, scriptSeconds: final.ScriptDuration-initial.ScriptDuration, layoutSeconds: final.LayoutDuration-initial.LayoutDuration, styleSeconds: final.RecalcStyleDuration-initial.RecalcStyleDuration, intervalCallbacks: await page.evaluate(() => window.__profileIntervals) - ticks, orb: await page.locator('.brand .orb-mark img').getAttribute('src') });
}
await writeFile(`/tmp/awaken-visual-${label}.json`, JSON.stringify({ label, fixture: 'Chromium headless, full mock workspace, no chat sent; document visibility override models native hidden WebView that keeps rendering; 6 alternating 5-second windows after 0.5-second settles', result }, null, 2));
console.log(JSON.stringify({ label, result }));
await browser.close();
