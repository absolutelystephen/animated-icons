// assemble-site.mjs
// Builds the folder that GitHub Pages publishes (_site/):
//
//   _site/index.html, app.js, styles.css, lib/, assets/   the app (from app/)
//   _site/icons/<icon>/<master>.svg                       valid masters only
//   _site/library.json                                    from build-library.mjs
//   _site/vendor/ffmpeg/...  _site/vendor/core/...        ffmpeg.wasm, from node_modules
//
// ffmpeg.wasm is copied from the npm packages pinned in package.json. It is
// never committed: ffmpeg-core.wasm is about 32 MB, too big for github.com's uploader.

import fs from 'node:fs';
import path from 'node:path';
import { ROOT, BUILD, readJson } from './lib/common.mjs';

const SITE = path.join(ROOT, '_site');
const library = readJson(path.join(BUILD, 'library.json'));
if (!library) throw new Error('Run scripts/build-library.mjs first.');

fs.rmSync(SITE, { recursive: true, force: true });
fs.mkdirSync(SITE, { recursive: true });

// The app, minus its developer notes.
fs.cpSync(path.join(ROOT, 'app'), SITE, { recursive: true, filter: (src) => path.basename(src) !== 'README.md' });

// Valid masters only, so the site never serves a file the app doesn't list.
for (const icon of library.icons) {
  for (const a of icon.animations) {
    fs.mkdirSync(path.join(SITE, path.dirname(a.file)), { recursive: true });
    fs.copyFileSync(path.join(ROOT, a.file), path.join(SITE, a.file));
  }
}
fs.copyFileSync(path.join(BUILD, 'library.json'), path.join(SITE, 'library.json'));

// ffmpeg.wasm (single-thread build), served from the same site as the app.
const ffmpegDir = path.join(ROOT, 'node_modules/@ffmpeg/ffmpeg/dist/esm');
const coreDir = path.join(ROOT, 'node_modules/@ffmpeg/core/dist/esm');
if (!fs.existsSync(ffmpegDir) || !fs.existsSync(coreDir)) throw new Error('ffmpeg.wasm packages are missing. Run npm ci first.');
fs.cpSync(ffmpegDir, path.join(SITE, 'vendor/ffmpeg/dist/esm'), { recursive: true, filter: (src) => !src.endsWith('.d.ts') && !src.endsWith('.d.mts') });
fs.mkdirSync(path.join(SITE, 'vendor/core'), { recursive: true });
for (const f of ['ffmpeg-core.js', 'ffmpeg-core.wasm']) fs.copyFileSync(path.join(coreDir, f), path.join(SITE, 'vendor/core', f));

// Local builds only: pre-renders kept in build/local-release are served from the site itself.
const local = path.join(BUILD, 'local-release');
if (!process.env.GITHUB_ACTIONS && fs.existsSync(local)) {
  fs.cpSync(local, path.join(SITE, 'prerenders'), { recursive: true, filter: (src) => !src.endsWith('manifest.json') });
}

const size = (dir) => fs.readdirSync(dir, { withFileTypes: true }).reduce((n, e) => n + (e.isDirectory() ? size(path.join(dir, e.name)) : fs.statSync(path.join(dir, e.name)).size), 0);
console.log(`Site assembled in _site/ (${(size(SITE) / 1e6).toFixed(1)} MB)`);
