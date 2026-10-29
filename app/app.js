/**
 * app.js
 * Wires the page together: library (1), preview, color (2), output (3) and export (4).
 *
 *   library.json        written by the build (scripts/build-library.mjs): icons, their masters, pre-render links
 *   lib/colors.js       the brand palette and hex helpers
 *   lib/preview.js      the large preview and thumbnails
 *   lib/exporter.js     in-browser rendering with ffmpeg.wasm
 *   lib/render-core.js  the shared renderer (also used by the build)
 */
import { PALETTE, DEFAULT_COLOR_ID, ALL_COLORS, parseHex, describeColor, relativeLuminance } from './lib/colors.js';
import { FRAME_RATES, SIZES, frameTimes, exportFileName, readMeta } from './lib/render-core.js';
import { Player, displayCopy, svgUrl, overscanViewBox } from './lib/preview.js';
import { renderMov } from './lib/exporter.js';

const $ = (id) => document.getElementById(id);
const PREFS_KEY = 'huron-animated-icons:prefs';
const SPEED_KEY = 'huron-animated-icons:speed';
const README_ANCHOR = 'looks-black-in-quicktime';
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

// Rough seconds per frame for a first render, before we've timed this computer.
// From the test run (single CPU), shaded a little faster for a typical laptop.
const DEFAULT_SPEED = { '1080p': 0.35, '4k': 1.4 };

const state = {
  library: null,
  anims: [],          // every animation, flattened, each with .icon
  current: null,      // the selected animation
  texts: new Map(),   // master file -> SVG text
  color: null,        // from describeColor()
  size: '1080p',
  rate: '23976',
  bg: 'light',
  busy: false,
  resultUrl: null,
};

const player = new Player({
  img: $('preview'),
  scrub: $('scrub'),
  label: $('time'),
  onChange: (s) => {
    const btn = $('play');
    // "Replay" once it has played; "Play" before that (for example with reduced motion).
    const replay = player.hasPlayed && s !== 'paused';
    btn.classList.toggle('is-replay', replay);
    btn.setAttribute('aria-label', replay ? 'Replay' : 'Play');
  },
});

// ---------------------------------------------------------------------------
// Saved choices (color, size, frame rate, last animation)

function loadPrefs() {
  try { return JSON.parse(localStorage.getItem(PREFS_KEY)) || {}; } catch { return {}; }
}
function savePrefs() {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({
      color: state.color?.hex, size: state.size, rate: state.rate, animation: state.current?.file,
    }));
  } catch { /* private mode: nothing to do */ }
}
function loadSpeed() {
  try { return { ...DEFAULT_SPEED, ...JSON.parse(localStorage.getItem(SPEED_KEY)) }; } catch { return { ...DEFAULT_SPEED }; }
}
function saveSpeed(size, secondsPerFrame) {
  const s = loadSpeed();
  s[size] = secondsPerFrame;
  try { localStorage.setItem(SPEED_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
// Small formatting helpers

const mb = (bytes) => `${Math.max(1, Math.round(bytes / 1e6))} MB`;
const secs = (n) => `${+n.toFixed(2)} s`;
function roughTime(seconds) {
  if (seconds < 50) return `${Math.max(10, Math.round(seconds / 10) * 10)} seconds`;
  const min = Math.round(seconds / 30) / 2; // nearest half minute
  return min <= 1 ? '1 minute' : `${min} minutes`;
}
const footageText = { light: 'Best on light footage.', dark: 'Best on dark footage.', either: 'Works on light or dark footage.' };

// ---------------------------------------------------------------------------
// 2. Color

function buildPalette() {
  const root = $('palette');
  const moon = '<svg class="moon" viewBox="0 0 16 16" aria-hidden="true"><path d="M10.6 1.5A6.5 6.5 0 1 0 14.5 11a5.5 5.5 0 0 1-3.9-9.5Z"/></svg>';
  const check = '<svg class="check" viewBox="0 0 16 16" aria-hidden="true"><path d="M6.2 11.6 2.9 8.3l1.2-1.2 2.1 2.1 5.7-5.7 1.2 1.2z"/></svg>';
  for (const fam of PALETTE) {
    const col = document.createElement('div');
    col.className = 'family';
    col.innerHTML = `<p class="family-name" aria-hidden="true">${fam.family}</p>`;
    for (const c of fam.colors) {
      // Inside the chip: the tone number ("700"), or the name when there isn't one ("White").
      const short = c.name.replace(/^(Aubergine|Ecru|Mint|Butterscotch|Guava|Stone) /, '');
      // Label text in white or Stone 900, whichever contrasts more with the chip.
      const L = relativeLuminance(c.hex);
      const dark = 1.05 / (L + 0.05) > (L + 0.05) / 0.0698;
      const label = document.createElement('label');
      label.className = 'swatch';
      label.title = `${c.name} ${c.hex}`;
      label.innerHTML = `
        <input type="radio" name="color" value="${c.id}" aria-label="${c.name}, ${footageText[c.footage].replace('.', '')}">
        <span class="chip ${dark ? 'on-dark' : 'on-light'}" style="background:${c.hex}">
          <span>${short}</span>${c.footage === 'dark' ? moon : ''}${check}
        </span>`;
      label.querySelector('input').addEventListener('change', () => setColor(describeColor(c.hex), { auto: true }));
      col.append(label);
    }
    root.append(col);
  }
}
/** Choose a color. auto: switch the preview background to suit it. */
function setColor(color, { auto = false, fromHex = false } = {}) {
  state.color = color;
  for (const input of document.querySelectorAll('input[name="color"]')) input.checked = input.value === color.id;
  $('hex-field').classList.toggle('is-active', color.custom);
  if (color.custom) $('hex').value = color.hex.slice(1);
  else if (!fromHex) { $('hex').value = ''; $('hex-msg').textContent = ''; }
  $('hex-swatch').style.background = color.custom || fromHex ? color.hex : '';

  const note = color.note ? ` ${color.note}` : '';
  $('color-summary').innerHTML = `<b>${color.custom ? 'Custom' : color.name}</b> ${color.hex}. ${footageText[color.footage]}${note}`;

  if (auto) {
    // Light colors are hard to see on a light preview: show them on dark.
    if (color.footage === 'dark') setBackground('dark');
    else if (color.footage === 'light' && state.bg === 'dark') setBackground('light');
  }
  player.setColor(color.hex);
  savePrefs();
  updateExport();
}

function wireCustomHex() {
  const input = $('hex');
  const msg = $('hex-msg');
  const field = $('hex-field');
  const say = (text, error = false) => {
    msg.textContent = text;
    msg.classList.toggle('is-error', error);
    field.classList.toggle('is-invalid', error);
    input.setAttribute('aria-invalid', String(error));
  };
  const check = (final) => {
    const raw = input.value.trim().replace(/^#/, '');
    const hex = parseHex(raw);
    if (!raw) { say(''); $('hex-swatch').style.background = ''; return; }
    if (hex) {
      $('hex-swatch').style.background = hex;
      const c = describeColor(hex);
      say(c.custom ? '' : `That’s ${c.name}, so it’s selected above.`);
      if (state.color?.hex !== hex) setColor(c, { auto: true, fromHex: true });
      return;
    }
    $('hex-swatch').style.background = '';
    if (/[^0-9a-f]/i.test(raw)) say('Use only the numbers 0 to 9 and the letters A to F.', true);
    else if (final && raw.length === 3) say(`Use all 6 characters. For example, ${raw.split('').map((ch) => ch + ch).join('').toUpperCase()}.`, true);
    else if (final) say('A hex color has 6 characters, for example 1A2B3C.', true);
    else say('');
  };
  input.addEventListener('input', () => check(false));
  input.addEventListener('blur', () => check(true));
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') check(true); });
  // Paste "#1a2b3c" or "1A2B3C": both are fine.
  input.addEventListener('paste', (e) => {
    const text = (e.clipboardData?.getData('text') || '').trim();
    if (parseHex(text)) { e.preventDefault(); input.value = parseHex(text).slice(1); check(true); }
  });
}

// ---------------------------------------------------------------------------
// Preview background

function setBackground(bg) {
  state.bg = bg;
  $('stage').className = `stage bg-${bg}`;
  for (const input of document.querySelectorAll('input[name="bg"]')) input.checked = input.value === bg;
}

// ---------------------------------------------------------------------------
// 1. Library

async function getText(file) {
  if (!state.texts.has(file)) {
    const res = await fetch(file);
    if (!res.ok) throw new Error(`Couldn’t load ${file}`);
    state.texts.set(file, await res.text());
  }
  return state.texts.get(file);
}

function buildLibrary() {
  const list = $('library');
  list.innerHTML = '';
  if (!state.anims.length) {
    list.innerHTML = '<p class="muted">No icons yet. Upload a master SVG to <code>icons/&lt;icon-name&gt;/</code> on GitHub and it appears here a few minutes later.</p>';
    return;
  }
  // One card per icon: its thumbnail and name, with the chosen animation underneath.
  for (const a of state.anims) {
    const label = document.createElement('label');
    label.className = 'anim';
    label.dataset.search = `${a.icon.title} ${a.icon.id} ${a.title} ${a.id}`.toLowerCase();
    label.innerHTML = `
      <input type="radio" name="animation" value="${a.file}">
      <span class="anim-thumb"><img alt="" loading="lazy"></span>
      <span><span class="anim-name">${a.icon.title}</span><span class="anim-len">${a.title}, ${secs(a.duration + a.hold)}</span></span>`;
    label.querySelector('input').addEventListener('change', () => selectAnimation(a));
    list.append(label);
    // Thumbnail: the finished icon in its default color.
    getText(a.file).then((text) => {
      const meta = readMeta(new DOMParser().parseFromString(text, 'image/svg+xml').documentElement);
      label.querySelector('img').src = svgUrl(displayCopy(text, { color: a.defaultColor, viewBox: overscanViewBox(meta), play: false }));
    }).catch(() => {});
  }
  // Search appears once the library is big enough to need it.
  if (state.anims.length > 10) {
    $('search-wrap').hidden = false;
    $('search').addEventListener('input', (e) => {
      const q = e.target.value.trim().toLowerCase();
      for (const el of list.querySelectorAll('.anim')) el.hidden = q && !el.dataset.search.includes(q);
    });
  }
}

async function selectAnimation(anim) {
  state.current = anim;
  for (const input of document.querySelectorAll('input[name="animation"]')) input.checked = input.value === anim.file;
  $('anim-title').textContent = anim.icon.title;
  $('anim-desc').textContent = [anim.title, anim.description].filter(Boolean).join('. ');
  $('preview').alt = `${anim.icon.title} icon, ${anim.title} animation`;
  savePrefs();
  updateExport();
  try {
    player.rate = state.rate;
    player.color = state.color.hex;
    await player.load(await getText(anim.file));
    if (state.current !== anim) return; // someone clicked another one meanwhile
    if (reducedMotion.matches) player.showEnd(); // wait for a play click
    else player.play();
  } catch (err) {
    showAlert('This animation didn’t load.', 'Refresh the page to try again.');
    console.error(err);
  }
}

// ---------------------------------------------------------------------------
// 3. Output and 4. Export

function prerenderFor() {
  const a = state.current;
  if (!a) return null;
  return a.prerenders.find((p) => p.color === state.color.hex && p.size === state.size && p.rate === state.rate) || null;
}

function fileName() {
  const a = state.current;
  return exportFileName({ icon: a.icon.id, animation: a.id }, state.color.id, state.size, state.rate);
}

function updateExport() {
  const { width, height } = SIZES[state.size];
  $('stage-size').textContent = `${width} × ${height}`;
  $('stage-rate').textContent = `${FRAME_RATES[state.rate].label} fps`;
  const go = $('go');
  if (!state.current || !state.color) { go.disabled = true; return; }
  go.disabled = state.busy;
  const pre = prerenderFor();
  const frames = frameTimes({ duration: state.current.duration, hold: state.current.hold }, state.rate).length;
  if (pre) {
    $('go-main').textContent = 'Download';
    $('go-sub').textContent = `Ready now, ${mb(pre.bytes)}`;
  } else {
    const estimate = frames * loadSpeed()[state.size] + 3;
    $('go-main').textContent = 'Render and download';
    $('go-sub').textContent = `About ${roughTime(estimate)} in your browser`;
  }
  // Let the long name wrap after underscores, not at hyphens.
  $('file-name').innerHTML = fileName().split('_').join('_<wbr>');
}

function download(href, name) {
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
}

function showResult(href, name) {
  $('result-name').textContent = name;
  $('again').href = href;
  $('again').download = name;
  $('result').hidden = false;
}

function showAlert(title, body) {
  $('alert-title').textContent = title;
  $('alert-body').textContent = body;
  $('alert').hidden = false;
}

function explain(err) {
  const msg = String(err?.message || err || '');
  if (err instanceof RangeError || /memory|out of bounds|allocation|OOM|Aborted\(/i.test(msg)) {
    return ['Your browser ran out of memory.', state.size === '4k'
      ? 'Close other tabs and try again, or try 1080p.'
      : 'Close other tabs and try again.'];
  }
  if (/fetch|import|network|failed to load|wasm/i.test(msg)) {
    return ['The video encoder didn’t load.', 'Check your connection, refresh the page and try again.'];
  }
  if (/leave the frame/i.test(msg)) {
    return ['This animation doesn’t fit the frame.', 'Its motion goes further than the 16:9 frame allows. Let the person who made the icon know.'];
  }
  return ['The render didn’t finish.', `Try again, or try 1080p. If it keeps happening, send this to the team: ${msg}`];
}

let controller = null;
const warnBeforeLeaving = (e) => { e.preventDefault(); e.returnValue = ''; };

function setBusy(busy) {
  state.busy = busy;
  document.body.classList.toggle('is-busy', busy);
  // Lock everything that could change what's being rendered.
  for (const el of document.querySelectorAll('.library, .stage-area, .side-block:first-child')) el.inert = busy;
  $('ready').hidden = busy;
  $('progress').hidden = !busy;
  if (busy) window.addEventListener('beforeunload', warnBeforeLeaving);
  else window.removeEventListener('beforeunload', warnBeforeLeaving);
  updateExport();
}

function setProgress(fraction, stage, detail) {
  const pct = Math.round(Math.max(0, Math.min(1, fraction)) * 100);
  $('bar-fill').style.width = pct + '%';
  $('bar').setAttribute('aria-valuenow', String(pct));
  if (stage) $('progress-stage').textContent = stage;
  $('progress-detail').textContent = detail ?? `${pct}%`;
}

async function startRender() {
  const anim = state.current;
  const name = fileName();
  const opts = { color: state.color.hex, size: state.size, rate: state.rate };
  $('alert').hidden = true;
  $('result').hidden = true;
  player.stop();
  setBusy(true);
  setProgress(0, 'Starting the encoder', 'This can take a few seconds the first time.');
  controller = new AbortController();
  const started = performance.now();
  let encodeShown = 0;
  try {
    const text = await getText(anim.file);
    const blob = await renderMov(text, opts, {
      signal: controller.signal,
      onProgress: ({ stage, done, total }) => {
        // Weights from the test run: frames are quick, encoding is most of the time.
        if (stage === 'render') setProgress(0.03 + 0.17 * (done / total), `Rendering frame ${done} of ${total}`);
        if (stage === 'encode') {
          encodeShown = Math.max(encodeShown, Math.min(1, done / total)); // never step backwards
          setProgress(0.2 + 0.8 * encodeShown, 'Encoding video');
        }
      },
    });
    const frames = frameTimes({ duration: anim.duration, hold: anim.hold }, opts.rate).length;
    saveSpeed(opts.size, (performance.now() - started) / 1000 / frames);
    setProgress(1, 'Done');
    if (state.resultUrl) URL.revokeObjectURL(state.resultUrl);
    state.resultUrl = URL.createObjectURL(blob);
    download(state.resultUrl, name);
    showResult(state.resultUrl, `${name} (${mb(blob.size)})`);
  } catch (err) {
    if (err?.name !== 'AbortError') {
      console.error(err);
      showAlert(...explain(err));
    }
  } finally {
    controller = null;
    setBusy(false);
  }
}

function onGo() {
  if (state.busy || !state.current) return;
  const pre = prerenderFor();
  if (pre) {
    $('alert').hidden = true;
    download(pre.url, pre.name);
    showResult(pre.url, `${pre.name} (${mb(pre.bytes)})`);
  } else {
    startRender();
  }
}

// ---------------------------------------------------------------------------
// Start up

function browserNotice() {
  const brands = (navigator.userAgentData?.brands || []).map((b) => b.brand).join(' ');
  if (!/Chrome|Chromium|Edge/.test(brands)) $('browser-notice').hidden = false;
}

function wireControls() {
  for (const input of document.querySelectorAll('input[name="size"]')) {
    input.addEventListener('change', () => { state.size = input.value; savePrefs(); updateExport(); });
  }
  for (const input of document.querySelectorAll('input[name="rate"]')) {
    input.addEventListener('change', () => { state.rate = input.value; player.setRate(state.rate); savePrefs(); updateExport(); });
  }
  for (const input of document.querySelectorAll('input[name="bg"]')) {
    input.addEventListener('change', () => setBackground(input.value));
  }
  $('play').addEventListener('click', () => player.play());
  $('go').addEventListener('click', onGo);
  $('cancel').addEventListener('click', () => {
    $('progress-stage').textContent = 'Cancelling';
    controller?.abort();
  });
}

function applyPrefs(prefs) {
  if (SIZES[prefs.size]) state.size = prefs.size;
  if (FRAME_RATES[prefs.rate]) state.rate = prefs.rate;
  for (const input of document.querySelectorAll('input[name="size"]')) input.checked = input.value === state.size;
  for (const input of document.querySelectorAll('input[name="rate"]')) input.checked = input.value === state.rate;
  if (!['23976', '2997'].includes(state.rate)) $('more-rates').open = true;
  player.setRate(state.rate);
  const fallback = ALL_COLORS.find((c) => c.id === DEFAULT_COLOR_ID).hex;
  setColor(describeColor(parseHex(prefs.color) || fallback), { auto: true });
}

async function init() {
  browserNotice();
  buildPalette();
  wireCustomHex();
  wireControls();
  const prefs = loadPrefs();
  applyPrefs(prefs);

  try {
    const res = await fetch('library.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(res.statusText);
    state.library = await res.json();
  } catch (err) {
    $('library').innerHTML = '<p class="muted">The icon list didn’t load. Refresh the page to try again.</p>';
    console.error(err);
    return;
  }
  const repo = state.library.repo;
  if (repo) {
    $('help-link').href = `https://github.com/${repo}#readme`;
    $('black-link').href = `https://github.com/${repo}#${README_ANCHOR}`;
  } else {
    $('help-link').hidden = true;
    $('black-link').hidden = true;
  }
  state.anims = state.library.icons.flatMap((icon) => icon.animations.map((a) => Object.assign(a, { icon })));
  buildLibrary();
  const first = state.anims.find((a) => a.file === prefs.animation) || state.anims[0];
  if (first) selectAnimation(first);
  else { $('anim-title').textContent = 'No icons yet'; updateExport(); }
}

init();
