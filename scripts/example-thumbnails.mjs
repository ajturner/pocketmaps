#!/usr/bin/env node
/**
 * Regenerate public/examples/*.jpg by running every example through the real app.
 *
 *   npm run dev                       # in another terminal
 *   npm run thumbnails                # or: BASE=http://localhost:4173 npm run thumbnails
 *
 * Uses your installed Google Chrome (playwright-core, channel "chrome").
 * Set CHROME=/path/to/chrome to use another Chromium build.
 */
import { chromium } from 'playwright-core';
import { mkdir } from 'node:fs/promises';
import { EXAMPLES, exampleHref } from '../src/examples.js';

const BASE = (process.env.BASE || 'http://localhost:5173').replace(/\/$/, '');
const OUT = new URL('../public/examples/', import.meta.url);
const only = process.argv.slice(2);
const HERO = 'smokies-waterfalls';

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({
  ...(process.env.CHROME ? { executablePath: process.env.CHROME } : { channel: 'chrome' }),
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

let failures = 0;
for (const ex of EXAMPLES.filter((e) => !only.length || only.includes(e.id))) {
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 }, deviceScaleFactor: 2 });
  const t0 = Date.now();
  try {
    await page.goto(`${BASE}/${exampleHref(ex)}`);
    await page.waitForFunction(() => /places on|Could not/.test(document.getElementById('status')?.textContent || ''), null, { timeout: 180000 });
    const status = await page.textContent('#status');
    if (/Could not/.test(status)) throw new Error(status);

    await page.check('input[name="view"][value="pages"]');
    // Page coordinates of the first page, so the clip works wherever the proof sits on the page.
    const first = await page.locator('#proof .page').first().evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.left + scrollX, y: r.top + scrollY, height: r.height };
    });
    const clip = { x: first.x, y: first.y, width: Math.round(first.height * 1.6), height: first.height };
    await page.screenshot({ path: new URL(`${ex.id}.jpg`, OUT).pathname, type: 'jpeg', quality: 78, fullPage: true, clip });

    if (ex.id === HERO) {
      await page.locator('#proof .page-title').screenshot({ path: new URL('hero-cover.jpg', OUT).pathname, type: 'jpeg', quality: 82 });
      await page.check('input[name="view"][value="sheets"]');
      await page.locator('#sheets-view .sheet').first().screenshot({ path: new URL('hero-sheet.jpg', OUT).pathname, type: 'jpeg', quality: 80 });
    }
    console.log(`ok   ${ex.id.padEnd(22)} ${((Date.now() - t0) / 1000).toFixed(1)}s  ${status}`);
  } catch (err) {
    failures++;
    console.log(`FAIL ${ex.id.padEnd(22)} ${err.message.split('\n')[0]}`);
  } finally {
    await page.close();
  }
}
await browser.close();
process.exit(failures ? 1 : 0);
