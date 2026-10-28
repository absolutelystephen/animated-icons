// prerender.mjs
// Pre-renders each valid master in its default color (Aubergine 700) at
// 1080p and 4K, 23.976 and 29.97, so the app can offer them as instant downloads.
//
// Frames come from app/lib/render-core.js in headless Chromium (the same code
// the app runs). They're encoded with native ffmpeg using the exact ProRes
// settings from render-core.js.
//
// Files are stored as assets on a GitHub release tagged `prerenders`, never in
// the repo. A small manifest.json on the same release records which version of
// each master was rendered, so only changed masters are rendered again, and
// files for deleted or invalid masters are removed.
//
// Output: build/prerenders.json, read by build-library.mjs.
//
// On GitHub Actions it talks to the release with the `gh` command (needs GH_TOKEN
// and GITHUB_REPOSITORY). Run locally, it keeps the "release" in build/local-release/
// instead, so you can test everything without touching GitHub.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { ROOT, BUILD, PRERENDER_SIZES, PRERENDER_RATES, PRORES_ARGS, openHarness, readJson, writeJson, rendererHash, sha256, summary, setOutput } from './lib/common.mjs';
import { describeColor } from '../app/lib/colors.js';
import { FRAME_RATES } from '../app/lib/render-core.js';

const TAG = 'prerenders';
const MANIFEST = 'manifest.json';

// ---------------------------------------------------------------------------
// Where the files live. Both stores have the same small interface.

/** The real thing: assets on a GitHub release, via the gh command line tool. */
class GitHubReleaseStore {
  constructor(repo) {
    this.repo = repo;
    this.server = process.env.GITHUB_SERVER_URL || 'https://github.com';
  }
  gh(args, opts = {}) {
    return execFileSync('gh', [...args, '--repo', this.repo], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts });
  }
  async open() {
    try {
      this.assets = JSON.parse(this.gh(['release', 'view', TAG, '--json', 'assets'])).assets;
    } catch (e) {
      if (!/not found/i.test(String(e.stderr || e.message))) throw e;
      console.log(`Creating the "${TAG}" release`);
      this.gh(['release', 'create', TAG, '--title', 'Pre-rendered exports',
        '--notes', 'Created and updated automatically by the Build and deploy workflow. Please don\'t edit or delete these files by hand.',
        '--latest=false']);
      this.assets = [];
    }
  }
  has(name) { return this.assets.some((a) => a.name === name); }
  bytes(name) { return (this.assets.find((a) => a.name === name) || {}).size || 0; }
  list() { return this.assets.map((a) => a.name); }
  url(name) { return `${this.server}/${this.repo}/releases/download/${TAG}/${encodeURIComponent(name)}`; }
  async read(name) {
    if (!this.has(name)) return null;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'manifest-'));
    this.gh(['release', 'download', TAG, '--pattern', name, '--dir', dir, '--clobber']);
    return fs.readFileSync(path.join(dir, name), 'utf8');
  }
  async upload(file) {
    this.gh(['release', 'upload', TAG, file, '--clobber']);
    const name = path.basename(file);
    this.assets = this.assets.filter((a) => a.name !== name).concat({ name, size: fs.statSync(file).size });
  }
  async remove(name) {
    this.gh(['release', 'delete-asset', TAG, name, '--yes']);
    this.assets = this.assets.filter((a) => a.name !== name);
  }
}

/** For local testing: a folder stands in for the release. Links are relative so the local site can serve them. */
class LocalStore {
  constructor(dir) { this.dir = dir; }
  async open() { fs.mkdirSync(this.dir, { recursive: true }); }
  has(name) { return fs.existsSync(path.join(this.dir, name)); }
  bytes(name) { return this.has(name) ? fs.statSync(path.join(this.dir, name)).size : 0; }
  list() { return fs.readdirSync(this.dir); }
  url(name) { return `prerenders/${encodeURIComponent(name)}`; }
  async read(name) { return this.has(name) ? fs.readFileSync(path.join(this.dir, name), 'utf8') : null; }
  async upload(file) { fs.copyFileSync(file, path.join(this.dir, path.basename(file))); }
  async remove(name) { fs.rmSync(path.join(this.dir, name), { force: true }); }
}

// ---------------------------------------------------------------------------
// Rendering

/** Check an encoded file with ffprobe: ProRes 4444, alpha, frame count. Throws if wrong. */
function probe(file, expectFrames) {
  const out = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-count_frames',
    '-show_entries', 'stream=codec_tag_string,pix_fmt,nb_read_frames,width,height', '-of', 'json', file], { encoding: 'utf8' });
  const s = JSON.parse(out).streams[0];
  if (s.codec_tag_string !== 'ap4h' || !s.pix_fmt.startsWith('yuva') || Number(s.nb_read_frames) !== expectFrames) {
    throw new Error(`Encoded file looks wrong: ${JSON.stringify(s)} (expected ap4h, yuva, ${expectFrames} frames)`);
  }
  return s;
}

// ---------------------------------------------------------------------------

const validation = readJson(path.join(BUILD, 'validation.json'));
if (!validation) throw new Error('Run scripts/validate.mjs first.');
const valid = validation.masters.filter((m) => m.ok);

const repo = process.env.GITHUB_REPOSITORY;
const onGitHub = !!(repo && (process.env.GH_TOKEN || process.env.GITHUB_TOKEN));
const store = onGitHub ? new GitHubReleaseStore(repo) : new LocalStore(path.join(BUILD, 'local-release'));
try {
  await store.open();
} catch (e) {
  const detail = String(e.stderr || e.message).split('\n')[0];
  summary(`## Pre-rendered downloads\n\n**The workflow couldn't open the "${TAG}" release**, so nothing was pre-rendered. The app still works; every download renders in the browser.\n\nThe usual cause is permissions. On github.com go to **Settings > Actions > General > Workflow permissions**, choose **Read and write permissions**, save, then re-run this workflow.\n\nDetails: ${detail}\n`);
  throw e;
}

const oldManifest = JSON.parse((await store.read(MANIFEST)) || '{"items":{}}');
const renderer = rendererHash();
const manifest = { renderer, items: {} };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'prerender-'));
const report = { rendered: [], reused: [], removed: [], failed: [] };

let harness = null;
let currentFrameDir = null;
const getHarness = async () => {
  if (harness) return harness;
  harness = await openHarness();
  await harness.page.exposeFunction('saveFrame', (i, b64) => {
    fs.writeFileSync(path.join(currentFrameDir, `f${String(i).padStart(4, '0')}.png`), Buffer.from(b64, 'base64'));
  });
  return harness;
};

for (const m of valid) {
  const key = `${m.meta.icon}_${m.meta.animation}`;
  const color = describeColor(m.meta.defaultColor);
  const hash = sha256(m.hash + renderer);
  const files = [];
  for (const size of PRERENDER_SIZES) {
    for (const rate of PRERENDER_RATES) {
      files.push({ name: `${key}_${color.id}_${size}_${rate}.mov`, size, rate });
    }
  }
  const old = oldManifest.items?.[key];
  const upToDate = old && old.hash === hash && files.every((f) => store.has(f.name));
  try {
    if (upToDate) {
      report.reused.push(key);
    } else {
      const h = await getHarness();
      for (const f of files) {
        const out = path.join(tmp, f.name);
        const started = Date.now();
        // saveFrame (below) writes each PNG the page sends into this folder.
        currentFrameDir = fs.mkdtempSync(path.join(os.tmpdir(), 'frames-'));
        const count = await h.page.evaluate(async ({ file, color, size, rate }) => {
          const R = window.R;
          const text = await (await fetch('/' + file)).text();
          const mounted = await R.mountMaster(text);
          try {
            return await R.renderFrames(mounted, { color, size, rate }, async (i, n, png) => {
              // Hand each PNG to Node as base64.
              let bin = '';
              for (let k = 0; k < png.length; k += 0x8000) bin += String.fromCharCode.apply(null, png.subarray(k, k + 0x8000));
              await window.saveFrame(i, btoa(bin));
            });
          } finally { mounted.dispose(); }
        }, { file: m.file, color: color.hex, size: f.size, rate: f.rate });
        const { num, den } = FRAME_RATES[f.rate];
        try {
          execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y',
            '-framerate', `${num}/${den}`, '-i', path.join(currentFrameDir, 'f%04d.png'), ...PRORES_ARGS, out], { stdio: 'inherit' });
        } catch {
          throw new Error(`ffmpeg couldn't encode ${f.name} (see the log above).`);
        } finally {
          fs.rmSync(currentFrameDir, { recursive: true, force: true });
        }
        probe(out, count);
        await store.upload(out);
        fs.rmSync(out);
        console.log(`rendered ${f.name}: ${count} frames, ${(store.bytes(f.name) / 1e6).toFixed(1)} MB, ${((Date.now() - started) / 1000).toFixed(1)} s`);
      }
      report.rendered.push(key);
    }
    manifest.items[key] = {
      hash,
      files: files.map((f) => ({ ...f, color: color.hex, colorId: color.id, bytes: store.bytes(f.name), url: store.url(f.name) })),
    };
  } catch (e) {
    console.error(`::error file=${m.file}::Pre-render failed: ${e.message.split('\n')[0]}`);
    report.failed.push(`${key}: ${e.message.split('\n')[0]}`);
  }
}
if (harness) await harness.close();

// Remove files that no current master needs (deleted or invalid masters, renamed colors).
const keep = new Set([MANIFEST, ...Object.values(manifest.items).flatMap((i) => i.files.map((f) => f.name))]);
for (const name of store.list()) {
  if (!keep.has(name)) {
    await store.remove(name);
    report.removed.push(name);
  }
}

const manifestFile = path.join(tmp, MANIFEST);
writeJson(manifestFile, manifest);
await store.upload(manifestFile);
writeJson(path.join(BUILD, 'prerenders.json'), manifest);
fs.rmSync(tmp, { recursive: true, force: true });

// ---------------------------------------------------------------------------
const list = (items) => items.map((x) => `- ${x}`).join('\n');
let md = '## Pre-rendered downloads\n\n';
md += `Rendered ${report.rendered.length}, unchanged ${report.reused.length}, files removed ${report.removed.length}.\n\n`;
if (report.rendered.length) md += `Rendered again because they're new or changed:\n\n${list(report.rendered)}\n\n`;
if (report.removed.length) md += `Removed because their master was deleted, renamed or changed, or failed the checks:\n\n${list(report.removed)}\n\n`;
if (report.failed.length) md += `**These couldn't be pre-rendered.** They're still in the app, but render in the browser instead of downloading instantly:\n\n${list(report.failed)}\n\n`;
summary(md);
setOutput('failed', report.failed.length);
