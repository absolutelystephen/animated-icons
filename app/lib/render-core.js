/**
 * render-core.js
 * Reference renderer for Huron animated icons (see docs/house-rules.md).
 *
 * Turns a house-rules master SVG into transparent PNG frames in the browser,
 * then encodes them to ProRes 4444 with alpha using ffmpeg.wasm.
 *
 * How it works:
 *  1. The master is loaded into a hidden same-origin iframe, so its CSS and
 *     keyframe names can never clash with the app or with other icons.
 *  2. For each frame, every CSS animation is paused and set to that frame's
 *     exact time. The animated properties (transform, opacity, stroke-dasharray,
 *     and so on) are read with getComputedStyle and written as inline styles
 *     onto a clone of the SVG. The clone has its `play` class removed, so it is
 *     a frozen, static snapshot of that moment.
 *  3. The clone's viewBox is widened to the full 16:9 frame (the master file
 *     is never changed), and it is drawn onto a transparent canvas.
 *  4. Frames at or after data-duration are drawn from the static icon, so the
 *     held frames match the artwork exactly.
 */

export const SIZES = {
  '1080p': { width: 1920, height: 1080 },
  '4k': { width: 3840, height: 2160 },
};

// Exact rational frame rates. Never use rounded decimals.
export const FRAME_RATES = {
  '23976': { num: 24000, den: 1001, label: '23.976' },
  '24': { num: 24, den: 1, label: '24' },
  '25': { num: 25, den: 1, label: '25' },
  '2997': { num: 30000, den: 1001, label: '29.97' },
  '30': { num: 30, den: 1, label: '30' },
};

// Placement rule: artwork fits a centered box 62.5% of frame width x 70% of frame height.
const BOX_W = 0.625;
const BOX_H = 0.70;

/** Read the house-rules settings from a master's root <svg>. */
export function readMeta(svg) {
  const num = (name) => parseFloat(svg.getAttribute(name));
  const [x, y, w, h] = svg.getAttribute('viewBox').trim().split(/[\s,]+/).map(Number);
  return {
    icon: svg.getAttribute('data-icon'),
    animation: svg.getAttribute('data-animation'),
    title: svg.getAttribute('data-title') || svg.getAttribute('data-animation'),
    description: svg.getAttribute('data-description') || '',
    duration: num('data-duration'),
    hold: num('data-hold'),
    overscan: num('data-overscan') || 0,
    defaultColor: svg.getAttribute('data-default-color'),
    viewBox: { x, y, w, h },
  };
}

/** Load a master SVG (as text) into a hidden iframe. Call dispose() when done. */
export async function mountMaster(svgText) {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = 'position:fixed;left:-10000px;top:0;width:800px;height:600px;border:0;visibility:hidden';
  const url = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml' }));
  await new Promise((resolve, reject) => {
    iframe.onload = resolve;
    iframe.onerror = reject;
    iframe.src = url;
    document.body.appendChild(iframe);
  });
  const doc = iframe.contentDocument;
  const svg = doc.documentElement;
  return {
    doc,
    svg,
    meta: readMeta(svg),
    dispose() { iframe.remove(); URL.revokeObjectURL(url); },
  };
}

/** Frame count and per-frame times for a rate key such as '23976'. */
export function frameTimes(meta, rateKey) {
  const { num, den } = FRAME_RATES[rateKey];
  const total = meta.duration + meta.hold;
  const count = Math.ceil(total * num / den - 1e-9);
  return Array.from({ length: count }, (_, n) => (n * den) / num);
}

/** Viewbox that maps the artwork into the full frame per the placement rule. Throws if overscan won't fit. */
export function frameViewBox(meta, width, height) {
  const { x, y, w, h } = meta.viewBox;
  const scale = Math.min((width * BOX_W) / w, (height * BOX_H) / h);
  const fw = width / scale;
  const fh = height / scale;
  const padX = (fw - w) / 2;
  const padY = (fh - h) / 2;
  if (padX < meta.overscan || padY < meta.overscan) {
    throw new Error(`Motion would leave the frame: overscan ${meta.overscan} needs more room than the frame allows.`);
  }
  return `${x - padX} ${y - padY} ${fw} ${fh}`;
}

const SKIP = new Set(['offset', 'computedOffset', 'easing', 'composite']);
const kebab = (p) => p.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());

/**
 * Return serialized SVG text for the icon frozen at time t (seconds).
 * Pass t = null for the static, finished icon.
 */
export function snapshot(mounted, t, { color, viewBox, width, height } = {}) {
  const { doc, svg } = mounted;
  const clone = svg.cloneNode(true);

  if (t !== null) {
    svg.classList.add('play');
    const anims = doc.getAnimations();
    const originals = [svg, ...svg.querySelectorAll('*')];
    const copies = [clone, ...clone.querySelectorAll('*')];
    const props = new Map();
    for (const a of anims) {
      a.pause();
      a.currentTime = t * 1000;
      const el = a.effect.target;
      if (!props.has(el)) props.set(el, new Set());
      for (const kf of a.effect.getKeyframes()) {
        for (const p of Object.keys(kf)) if (!SKIP.has(p)) props.get(el).add(kebab(p));
      }
    }
    for (const [el, set] of props) {
      const copy = copies[originals.indexOf(el)];
      const cs = doc.defaultView.getComputedStyle(el);
      for (const p of set) copy.style.setProperty(p, cs.getPropertyValue(p));
    }
  }

  clone.classList.remove('play');
  if (color) clone.setAttribute('color', color);
  if (viewBox) clone.setAttribute('viewBox', viewBox);
  if (width) clone.setAttribute('width', width);
  if (height) clone.setAttribute('height', height);
  return new XMLSerializer().serializeToString(clone);
}

async function drawSvg(ctx, svgText, width, height) {
  const url = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Render every frame as a PNG (Uint8Array). Calls onFrame(index, total, pngBytes).
 * options: { color, size: '1080p' | '4k', rate: '23976' | ... }
 */
export async function renderFrames(mounted, { color, size, rate }, onFrame) {
  const { width, height } = SIZES[size];
  const meta = mounted.meta;
  const viewBox = frameViewBox(meta, width, height);
  const times = frameTimes(meta, rate);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  let staticSvg = null;
  for (let i = 0; i < times.length; i++) {
    const t = times[i];
    let svgText;
    if (t >= meta.duration) {
      staticSvg = staticSvg || snapshot(mounted, null, { color, viewBox, width, height });
      svgText = staticSvg;
    } else {
      svgText = snapshot(mounted, t, { color, viewBox, width, height });
    }
    await drawSvg(ctx, svgText, width, height);
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
    await onFrame(i, times.length, new Uint8Array(await blob.arrayBuffer()));
  }
  return times.length;
}

/**
 * Full export: render frames into ffmpeg.wasm and encode ProRes 4444 with alpha.
 * `ffmpeg` is a loaded FFmpeg instance from @ffmpeg/ffmpeg 0.12.x.
 * onProgress({ stage: 'render' | 'encode', done, total })
 */
export async function exportMov(mounted, ffmpeg, { color, size, rate }, onProgress = () => {}) {
  const { num, den } = FRAME_RATES[rate];
  const written = [];
  const total = await renderFrames(mounted, { color, size, rate }, async (i, n, png) => {
    const name = `f${String(i).padStart(4, '0')}.png`;
    await ffmpeg.writeFile(name, png);
    written.push(name);
    onProgress({ stage: 'render', done: i + 1, total: n });
  });
  const onFfProgress = ({ progress }) => onProgress({ stage: 'encode', done: Math.round(progress * total), total });
  ffmpeg.on('progress', onFfProgress);
  try {
    const code = await ffmpeg.exec([
      '-framerate', `${num}/${den}`, '-i', 'f%04d.png',
      '-c:v', 'prores_ks', '-profile:v', '4444', '-pix_fmt', 'yuva444p10le',
      '-alpha_bits', '16', '-vendor', 'apl0', 'out.mov',
    ]);
    if (code !== 0) throw new Error(`ffmpeg exited with code ${code}`);
    const data = await ffmpeg.readFile('out.mov');
    return new Blob([data.buffer], { type: 'video/quicktime' });
  } finally {
    ffmpeg.off('progress', onFfProgress);
    for (const name of written) await ffmpeg.deleteFile(name).catch(() => {});
    await ffmpeg.deleteFile('out.mov').catch(() => {});
  }
}

/** File name per the house rules: <icon>_<animation>_<color>_<size>_<rate>.mov */
export function exportFileName(meta, colorSlug, size, rate) {
  return `${meta.icon}_${meta.animation}_${colorSlug}_${size}_${rate}.mov`;
}
