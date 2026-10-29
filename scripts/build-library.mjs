// build-library.mjs
// Writes build/library.json: everything the app needs to list the icons.
// It comes from the masters' data- settings (via build/validation.json) plus
// the pre-rendered download links (build/prerenders.json, if pre-rendering ran).
// Masters that failed validation are left out.

import path from 'node:path';
import { BUILD, readJson, writeJson } from './lib/common.mjs';

const validation = readJson(path.join(BUILD, 'validation.json'));
if (!validation) throw new Error('Run scripts/validate.mjs first.');
const prerenders = readJson(path.join(BUILD, 'prerenders.json'), { items: {} });

// The icon's name in the app: data-icon-title if the master has one, otherwise
// made from the folder name in sentence case, with 1 and 2 letter words in
// capitals: "decision-1" -> "Decision 1", "ai-1" -> "AI 1".
const titleFromId = (id) => id.split('-')
  .map((w, i) => (/^[a-z]{1,2}$/.test(w) ? w.toUpperCase() : i === 0 ? w[0].toUpperCase() + w.slice(1) : w))
  .join(' ');

const icons = new Map();
for (const m of validation.masters.filter((x) => x.ok)) {
  const { meta } = m;
  if (!icons.has(meta.icon)) icons.set(meta.icon, { id: meta.icon, title: meta.iconTitle || titleFromId(meta.icon), animations: [] });
  const pre = prerenders.items[`${meta.icon}_${meta.animation}`];
  icons.get(meta.icon).animations.push({
    id: meta.animation,
    title: meta.title,
    description: meta.description,
    file: m.file,
    version: meta.version,
    duration: meta.duration,
    hold: meta.hold,
    overscan: meta.overscan,
    defaultColor: meta.defaultColor,
    // Instant downloads: one entry per pre-rendered color, size and frame rate.
    prerenders: (pre?.files || []).map((f) => ({ color: f.color, size: f.size, rate: f.rate, name: f.name, bytes: f.bytes, url: f.url })),
  });
}

const library = {
  generated: new Date().toISOString(),
  // Used for the help link to the README. Empty when built locally.
  repo: process.env.GITHUB_REPOSITORY || '',
  icons: [...icons.values()]
    .sort((a, b) => a.title.localeCompare(b.title, 'en', { numeric: true }))
    .map((i) => ({ ...i, animations: i.animations.sort((a, b) => a.title.localeCompare(b.title)) })),
};

writeJson(path.join(BUILD, 'library.json'), library);
const count = library.icons.reduce((n, i) => n + i.animations.length, 0);
console.log(`library.json: ${library.icons.length} icon(s), ${count} master(s)`);
for (const i of library.icons) console.log(`  ${i.title}: ${i.animations.map((a) => a.title).join(', ')}`);
