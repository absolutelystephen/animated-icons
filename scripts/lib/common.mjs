// Shared helpers for the build scripts in scripts/.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { startServer } from './server.mjs';

/** Repo root (the folder that holds app/, icons/ and scripts/). */
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
/** Working folder for build output. Never committed (see .gitignore). */
export const BUILD = path.join(ROOT, 'build');

export const PRERENDER_SIZES = ['1080p', '4k'];
export const PRERENDER_RATES = ['23976', '2997'];

/** The exact ProRes settings from house-rules.md section 5. Shared by the app (render-core.js) and the native encoder. */
export const PRORES_ARGS = ['-c:v', 'prores_ks', '-profile:v', '4444', '-pix_fmt', 'yuva444p10le', '-alpha_bits', '16', '-vendor', 'apl0'];

export const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');
export const sha256 = (data) => crypto.createHash('sha256').update(data).digest('hex');
export const readJson = (file, fallback = null) => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : fallback);
export function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
}

/**
 * Every master SVG: icons/<icon>/<anything>.svg (not inside source/).
 * Returns repo-relative paths, sorted.
 */
export function findMasters() {
  const iconsDir = path.join(ROOT, 'icons');
  if (!fs.existsSync(iconsDir)) return [];
  const out = [];
  for (const icon of fs.readdirSync(iconsDir, { withFileTypes: true })) {
    if (!icon.isDirectory()) continue;
    for (const f of fs.readdirSync(path.join(iconsDir, icon.name), { withFileTypes: true })) {
      if (f.isFile() && f.name.toLowerCase().endsWith('.svg')) out.push(`icons/${icon.name}/${f.name}`);
    }
  }
  return out.sort();
}

/** Fingerprint of everything that affects a rendered frame, apart from the master itself. */
export function rendererHash() {
  const core = fs.readFileSync(path.join(ROOT, 'app/lib/render-core.js'));
  return sha256(Buffer.concat([core, Buffer.from(PRORES_ARGS.join(' '))])).slice(0, 16);
}

/** Append Markdown to the workflow run's summary page (or print it when run locally). */
export function summary(markdown) {
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown + '\n');
  else console.log('\n' + markdown);
}

/** Set a step output for later workflow steps. */
export function setOutput(name, value) {
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
}

/**
 * Start headless Chromium on a local http server over the repo root, with a
 * blank harness page that has render-core.js loaded as window.R.
 * Returns { browser, page, url, close() }.
 */
export async function openHarness() {
  const harness = `<!doctype html><meta charset="utf-8"><body><script type="module">
    import * as R from '/app/lib/render-core.js';
    window.R = R; window.ready = true;
  </script></body>`;
  const { server, url } = await startServer(ROOT, { extra: { '/__harness.html': { type: 'text/html', body: harness } } });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
  page.on('pageerror', (e) => console.error('[browser]', e.message));
  await page.goto(url + '/__harness.html');
  await page.waitForFunction('window.ready === true');
  return {
    browser, page, url,
    async close() { await browser.close(); server.close(); },
  };
}
