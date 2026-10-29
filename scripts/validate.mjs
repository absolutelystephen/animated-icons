// validate.mjs
// Checks every master in icons/ against docs/house-rules.md section 7.
// A port of reference/validate-masters.py, extended to the full checklist.
//
// Output:
//   build/validation.json   which masters passed, with their settings, and what's wrong with the rest
//   workflow summary        a plain-English report (printed to the console when run locally)
//   step output `invalid`   how many masters failed (the workflow marks the run failed if > 0)
//
// It never exits with an error just because a master is invalid: valid icons
// still get deployed. Run locally with: node scripts/validate.mjs

import fs from 'node:fs';
import path from 'node:path';
import { ROOT, BUILD, findMasters, openHarness, sha256, writeJson, summary, setOutput } from './lib/common.mjs';

const RULES_LINK = 'docs/house-rules.md';

// ---------------------------------------------------------------------------
// Checks that only need the file's text. Run inside the browser for its XML parser.
// Returns { problems: [...], meta } where meta holds the data- settings.
function staticChecks({ text, sources, folder, base }) {
  const NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/; // lowercase letters, numbers and hyphens
  const P = [];
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    const msg = parseError.textContent.replace(/This page contains the following errors:/i, '').replace(/Below is a rendering[\s\S]*$/i, '').trim().replace(/^error/, 'Error');
    return { problems: [`The file isn't valid SVG, so nothing else could be checked. ${msg}`.trim()], meta: null };
  }
  const svg = doc.documentElement;
  if (svg.localName !== 'svg') return { problems: ['The file doesn\'t start with an <svg> element.'], meta: null };

  // File name and folder: icons/<icon>/<icon>_<animation>.svg
  const m = base.match(/^(.+)_(.+)\.svg$/);
  const expectIcon = folder;
  const expectAnim = m && m[1] === folder ? m[2] : null;
  if (!NAME.test(folder)) P.push(`The folder name "${folder}" should use only lowercase letters, numbers and hyphens.`);
  if (!expectAnim || !NAME.test(expectAnim)) {
    P.push(`The file name should be "${folder}_<animation-name>.svg" (the folder name, an underscore, then the animation name in lowercase letters, numbers and hyphens).`);
  }

  // Root settings
  const attr = (n) => svg.getAttribute(n);
  const classes = (attr('class') || '').split(/\s+/);
  if (!classes.includes('icon') || !classes.includes('play')) P.push('The root <svg> needs class="icon play".');
  if (attr('overflow') !== 'visible') P.push('The root <svg> needs overflow="visible" so motion outside the box isn\'t cut off.');
  const required = ['viewBox', 'color', 'data-icon', 'data-animation', 'data-version', 'data-title', 'data-duration', 'data-hold', 'data-overscan', 'data-default-color'];
  const missing = required.filter((n) => !attr(n));
  if (missing.length) P.push(`The root <svg> is missing: ${missing.join(', ')}.`);
  const num = (n) => Number(attr(n));
  if (attr('data-duration') && !(num('data-duration') > 0)) P.push('data-duration must be a number of seconds above 0.');
  if (attr('data-hold') && !(num('data-hold') >= 0)) P.push('data-hold must be a number of seconds (0 or more).');
  if (attr('data-overscan') && !(num('data-overscan') >= 0)) P.push('data-overscan must be a number (0 or more).');
  for (const n of ['color', 'data-default-color']) {
    if (attr(n) && !/^#[0-9a-fA-F]{6}$/.test(attr(n))) P.push(`${n} must be a 6-digit hex color such as #5D013A.`);
  }
  if (attr('data-icon') && attr('data-icon') !== expectIcon) P.push(`data-icon is "${attr('data-icon')}" but the file is in the "${folder}" folder. They must match.`);
  if (expectAnim && attr('data-animation') && attr('data-animation') !== expectAnim) P.push(`data-animation is "${attr('data-animation')}" but the file name says "${expectAnim}". They must match.`);
  const anim = attr('data-animation') || expectAnim || '';

  // Things that are never allowed
  const banned = [...svg.querySelectorAll('script, animate, animateTransform, animateMotion, set, foreignObject, image, iframe')];
  if (banned.length) P.push(`Only CSS keyframes may animate. Remove the <${[...new Set(banned.map((e) => e.localName))].join('>, <')}> element(s).`);
  const all = [svg, ...svg.querySelectorAll('*')];
  if (all.some((el) => [...el.attributes].some((a) => /^on/i.test(a.name)))) P.push('Remove the event handler attributes (onload, onclick and so on). Masters can\'t contain scripts.');
  const hrefs = all.flatMap((el) => [...el.attributes].filter((a) => a.localName === 'href' && !a.value.startsWith('#')));
  if (hrefs.length) P.push('The file links to something outside itself. Masters must be self-contained.');
  const css = [...svg.querySelectorAll('style')].map((s) => s.textContent).join('\n');
  if (/\binfinite\b/.test(css)) P.push('An animation repeats forever ("infinite"). Every animation must end.');
  if (/@import/.test(css) || /url\(\s*['"]?(?!#)/.test(css + all.map((el) => el.getAttribute('style') || '').join(';'))) {
    P.push('The CSS loads something from outside the file. Masters must be self-contained.');
  }
  if (/(^|[;{\s])(fill|stroke|color|filter)\s*:/m.test(css)) P.push('The <style> block sets fill, stroke, color or filter. Color comes only from the color attribute on the root, and filters aren\'t allowed.');

  // Name prefixes: keyframes and mask ids start with the animation name (or its first word or words, such as "weigh" for weigh-the-options).
  const words = anim.split('-');
  const prefixes = words.map((_, i) => words.slice(0, i + 1).join('-'));
  const okPrefix = (name, extra) => prefixes.some((p) => name.startsWith(p + extra));
  const keyframes = [...css.matchAll(/@keyframes\s+([\w-]+)/g)].map((x) => x[1]);
  const badKf = keyframes.filter((k) => !okPrefix(k, '-'));
  if (badKf.length) P.push(`Keyframe names must start with the animation name ("${anim}-"): ${badKf.join(', ')}.`);
  const masks = [...svg.querySelectorAll('mask')];
  const badMask = masks.map((mk) => mk.id).filter((id) => !okPrefix(id, '-mask-'));
  if (badMask.length) P.push(`Mask ids must start with "${anim}-mask-": ${badMask.join(', ') || '(a mask has no id)'}.`);

  // Masks: shapes inside are pure white and never currentColor
  const isWhite = (v) => /^(#fff|#ffffff|white)$/i.test(v || '');
  for (const mk of masks) {
    for (const el of mk.querySelectorAll('*')) {
      const fill = el.getAttribute('fill');
      const stroke = el.getAttribute('stroke');
      const style = el.getAttribute('style') || '';
      const shape = ['path', 'rect', 'circle', 'ellipse', 'polygon', 'polyline', 'line'].includes(el.localName);
      const bad = (fill && fill !== 'none' && !isWhite(fill)) || (stroke && stroke !== 'none' && !isWhite(stroke)) || /(fill|stroke|color)\s*:/.test(style)
        || (shape && !isWhite(fill) && !isWhite(stroke));
      if (bad) { P.push(`Shapes inside mask "${mk.id}" must be pure white (#fff), set with fill or stroke.`); break; }
    }
  }

  // Artwork: only part- paths are drawn, and every one is fill="currentColor"
  const inMask = (el) => !!el.closest('mask');
  const shapes = [...svg.querySelectorAll('path, rect, circle, ellipse, polygon, polyline, line, text, use')].filter((el) => !inMask(el));
  const partClass = (el) => (el.getAttribute('class') || '').split(/\s+/).find((c) => c.startsWith('part-'));
  const extra = shapes.filter((el) => !partClass(el));
  if (extra.length) P.push(`Found ${extra.length} shape(s) that aren't part- pieces of the original artwork (for example a <${extra[0].localName}>). Nothing may be added to the artwork.`);
  const parts = shapes.filter((el) => partClass(el));
  const notPath = parts.filter((el) => el.localName !== 'path');
  if (notPath.length) P.push('Every part- element must be a <path>.');
  const badFill = parts.filter((el) => el.getAttribute('fill') !== 'currentColor' || (el.getAttribute('stroke') && el.getAttribute('stroke') !== 'none') || /(fill|stroke)\s*:/.test(el.getAttribute('style') || ''));
  if (badFill.length) P.push(`Every artwork path needs fill="currentColor" and no stroke or hex color. Check: ${badFill.map(partClass).join(', ')}.`);

  // Source artwork: present, one file, same viewBox, and the parts join back into its path data exactly
  if (!sources.length) {
    P.push(`There's no original SVG in icons/${folder}/source/. Add the untouched file from the brand hub.`);
  } else if (sources.length > 1) {
    P.push(`icons/${folder}/source/ should hold exactly one SVG (found ${sources.length}).`);
  } else {
    const src = new DOMParser().parseFromString(sources[0].text, 'image/svg+xml');
    if (src.querySelector('parsererror')) {
      P.push(`The source file ${sources[0].name} isn't valid SVG.`);
    } else {
      const s = src.documentElement;
      const norm = (v) => (v || '').trim().split(/[\s,]+/).map(Number).join(' ');
      if (norm(s.getAttribute('viewBox')) !== norm(attr('viewBox'))) P.push(`The viewBox (${attr('viewBox')}) must be copied unchanged from the source (${s.getAttribute('viewBox')}).`);
      const srcOther = [...s.querySelectorAll('rect, circle, ellipse, polygon, polyline, line')].filter((el) => !el.closest('defs, clipPath, mask'));
      if (srcOther.length) P.push('The source contains shapes other than paths. The checks only support icons drawn as paths, so this icon needs a rules update first.');
      const srcD = [...s.querySelectorAll('path')].filter((el) => !el.closest('defs, clipPath, mask')).map((el) => el.getAttribute('d') || '').join('');
      const pieces = parts.map((el) => el.getAttribute('d') || '');
      // Find an order of the pieces that rebuilds the source exactly (depth-first search).
      const used = new Array(pieces.length).fill(false);
      const fit = (pos) => {
        if (pos === srcD.length) return used.every(Boolean);
        for (let i = 0; i < pieces.length; i++) {
          if (!used[i] && pieces[i] && srcD.startsWith(pieces[i], pos)) {
            used[i] = true;
            if (fit(pos + pieces[i].length)) return true;
            used[i] = false;
          }
        }
        return false;
      };
      if (!srcD) P.push('The source file has no path data.');
      else if (!fit(0)) P.push('The part- paths joined together don\'t match the source artwork exactly. Split the source only at its existing subpaths (each "M") and don\'t change any numbers.');
    }
  }

  const meta = missing.length ? null : {
    icon: attr('data-icon'), animation: attr('data-animation'), version: attr('data-version'),
    title: attr('data-title'), description: attr('data-description') || '', iconTitle: attr('data-icon-title') || '',
    duration: num('data-duration'), hold: num('data-hold'), overscan: num('data-overscan'),
    defaultColor: (attr('data-default-color') || '').toUpperCase(), viewBox: attr('viewBox'),
  };
  return { problems: P, meta };
}

// ---------------------------------------------------------------------------
// Checks that need the animation running. Run in a page that has the master
// open on its own (like the original validator), so its CSS is isolated.
function motionChecks() {
  const P = [];
  const svg = document.documentElement;
  const an = document.getAnimations();
  const dur = +svg.dataset.duration;
  const declared = +svg.dataset.overscan;

  // Only allowed properties, on allowed elements
  const allowed = { transform: ['move-', 'mask-'], opacity: ['move-'], 'stroke-dasharray': ['mask-'], 'stroke-dashoffset': ['mask-'] };
  const kebab = (p) => p.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());
  const SKIP = ['offset', 'computedOffset', 'easing', 'composite'];
  const props = new Map();
  const badProps = new Set();
  for (const a of an) {
    const el = a.effect.target;
    const cls = (el.getAttribute('class') || '').split(/\s+/);
    if (!props.has(el)) props.set(el, new Set());
    for (const k of a.effect.getKeyframes()) {
      for (const p of Object.keys(k)) {
        if (SKIP.includes(p)) continue;
        const prop = kebab(p);
        props.get(el).add(prop);
        const ok = allowed[prop] && cls.some((c) => allowed[prop].some((pre) => c.startsWith(pre)));
        if (!ok) badProps.add(`${prop} on ${el.getAttribute('class') || '<' + el.localName + '>'}`);
      }
    }
  }
  if (badProps.size) P.push(`Only transform and opacity on move- groups, and transform or stroke-dasharray on mask- shapes, may animate. Found: ${[...badProps].join('; ')}.`);

  // data-duration equals the latest end time
  const ends = an.map((a) => { const t = a.effect.getComputedTiming(); return (t.delay + t.activeDuration) / 1000; });
  if (ends.some((e) => !isFinite(e))) P.push('An animation never ends. Every animation must be finite.');
  const maxEnd = ends.length ? Math.max(...ends.filter(isFinite)) : 0;
  if (!an.length) P.push('Nothing animates. Check the root has class "play" and the CSS uses .play selectors.');
  else if (Math.abs(maxEnd - dur) > 0.001) P.push(`data-duration is ${dur} s but the last movement ends at ${+maxEnd.toFixed(3)} s. Set data-duration="${+maxEnd.toFixed(3)}".`);

  // Overscan: how far any part travels outside the viewBox, sampled at 120 fps
  const vb = svg.viewBox.baseVal;
  const inv = svg.getScreenCTM().inverse();
  const toVB = (x, y) => { const p = new DOMPoint(x, y).matrixTransform(inv); return [p.x, p.y]; };
  const parts = [...svg.querySelectorAll('[class^="part-"], [class*=" part-"]')];
  let over = 0;
  for (let t = 0; t <= dur * 1000 + 0.5; t += 1000 / 120) {
    an.forEach((a) => { a.pause(); a.currentTime = t; });
    for (const el of parts) {
      const r = el.getBoundingClientRect();
      const [x0, y0] = toVB(r.left, r.top);
      const [x1, y1] = toVB(r.right, r.bottom);
      over = Math.max(over, vb.x - x0, vb.y - y0, x1 - (vb.x + vb.width), y1 - (vb.y + vb.height));
    }
  }
  if (over > declared + 0.05) P.push(`Motion goes ${over.toFixed(2)} units outside the viewBox but data-overscan says ${declared}. Set data-overscan="${Math.ceil(over * 10) / 10}" or more.`);

  // At data-duration every animated value equals the static (no play) value
  an.forEach((a) => { a.currentTime = dur * 1000; });
  const atEnd = [];
  props.forEach((set, el) => set.forEach((p) => atEnd.push([el, p, getComputedStyle(el).getPropertyValue(p)])));
  svg.classList.remove('play');
  const norm = (v) => (v === 'matrix(1, 0, 0, 1, 0, 0)' ? 'none' : v);
  const bad = atEnd.filter(([el, p, v]) => norm(getComputedStyle(el).getPropertyValue(p)) !== norm(v)).map(([el, p, v]) => `${el.getAttribute('class')} ${p} is ${v}`);
  svg.classList.add('play');
  if (bad.length) P.push(`At the end of the animation, some pieces aren't back in their original place: ${bad.join('; ')}. Every animation must end at transform: none, opacity: 1 and stroke-dasharray: none.`);

  return { problems: P, overscanMeasured: +over.toFixed(2), maxEnd };
}

// ---------------------------------------------------------------------------
// The static icon (no play) must match the source artwork: no pixel more than
// 8 of 255 apart after edge smoothing. Compares coverage (alpha) so the check
// doesn't depend on color.
async function pixelCheck({ text, sourceText }) {
  const W = 1200;
  const prep = (t, removePlay) => {
    const d = new DOMParser().parseFromString(t, 'image/svg+xml');
    const s = d.documentElement;
    const [, , w, h] = s.getAttribute('viewBox').trim().split(/[\s,]+/).map(Number);
    if (removePlay) s.classList.remove('play');
    s.setAttribute('width', W);
    s.setAttribute('height', Math.round((W * h) / w));
    return { svg: new XMLSerializer().serializeToString(d), H: Math.round((W * h) / w) };
  };
  const draw = async ({ svg, H }) => {
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const img = new Image();
    img.src = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    await img.decode();
    c.getContext('2d').drawImage(img, 0, 0, W, H);
    return c.getContext('2d').getImageData(0, 0, W, H).data;
  };
  const pa = prep(text, true);
  const a = await draw(pa);
  const b = await draw(prep(sourceText, false));
  // Pieces drawn as separate paths are edge-smoothed separately, so single
  // edge pixels can differ by 10 to 40 even when the artwork is identical.
  // Averaging each pixel with its 8 neighbors removes that noise but keeps
  // real differences: a piece 0.03 units out of place scores about 70.
  const H = pa.H;
  const smooth = (d) => {
    const o = new Float32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let sum = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < W && yy < H) { sum += d[(yy * W + xx) * 4 + 3]; n++; }
      }
      o[y * W + x] = sum / n;
    }
    return o;
  };
  const sa = smooth(a), sb = smooth(b);
  let worst = 0;
  for (let i = 0; i < sa.length; i++) worst = Math.max(worst, Math.abs(sa[i] - sb[i]));
  worst = Math.round(worst);
  // The static icon must also fit the 16:9 export frame with its overscan.
  let fits = true;
  try {
    const meta = window.R.readMeta(new DOMParser().parseFromString(text, 'image/svg+xml').documentElement);
    window.R.frameViewBox(meta, 1920, 1080);
  } catch { fits = false; }
  return { worst, fits };
}

// ---------------------------------------------------------------------------
const masters = findMasters();
const h = await openHarness();
const motionPage = await h.browser.newPage({ viewport: { width: 1000, height: 700 } });
const results = [];

for (const file of masters) {
  const [, folder, base] = file.split('/');
  const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const srcDir = path.join(ROOT, 'icons', folder, 'source');
  const sources = fs.existsSync(srcDir)
    ? fs.readdirSync(srcDir).filter((n) => n.toLowerCase().endsWith('.svg')).map((n) => ({ name: n, text: fs.readFileSync(path.join(srcDir, n), 'utf8') }))
    : [];

  let problems = [];
  let meta = null;
  let measured = null;
  try {
    const s = await h.page.evaluate(staticChecks, { text, sources, folder, base });
    problems.push(...s.problems);
    meta = s.meta;
    // Only run the motion and pixel checks on files that parsed and have their settings.
    if (meta) {
      await motionPage.goto(`${h.url}/${file}`);
      await motionPage.waitForTimeout(50);
      const mo = await motionPage.evaluate(motionChecks);
      problems.push(...mo.problems);
      measured = mo.overscanMeasured;
      if (sources.length === 1) {
        const px = await h.page.evaluate(pixelCheck, { text, sourceText: sources[0].text });
        if (px.worst > 8) problems.push(`The finished icon doesn't match the source artwork (pixels differ by up to ${px.worst} of 255; the limit is 8). Check that every piece ends exactly where it started and nothing is hidden.`);
        if (!px.fits) problems.push('With its data-overscan, the icon doesn\'t fit inside the 16:9 export frame. Reduce the motion that leaves the box.');
      }
    }
  } catch (e) {
    problems.push(`The checks couldn't finish: ${e.message.split('\n')[0]}`);
  }
  problems = [...new Set(problems)];
  results.push({ file, ok: problems.length === 0, problems, meta, overscanMeasured: measured, hash: sha256(text) });
  console.log(`${problems.length ? 'FAIL' : 'ok  '} ${file}${problems.map((p) => '\n       - ' + p).join('')}`);
}
await h.close();

writeJson(path.join(BUILD, 'validation.json'), { generated: new Date().toISOString(), masters: results });

// ---------------------------------------------------------------------------
// Report
const bad = results.filter((r) => !r.ok);
const good = results.length - bad.length;
let md = '## Icon check\n\n';
if (!results.length) md += 'No animated masters were found in `icons/`.\n';
else if (!bad.length) md += `All ${results.length} animations passed the house-rules checks and are in the app.\n`;
else {
  md += `${good} of ${results.length} animations passed and are in the app. **${bad.length} ${bad.length === 1 ? 'was' : 'were'} left out** until fixed:\n\n`;
  for (const r of bad) {
    // Escape < so the Summary page shows names like <path> instead of hiding them.
    md += `### ${r.file}\n\n${r.problems.map((p) => `- ${p.replace(/</g, '&lt;')}`).join('\n')}\n\n`;
    for (const p of r.problems) console.log(`::error file=${r.file}::${p.replace(/\n/g, ' ')}`);
  }
  const repoUrl = process.env.GITHUB_REPOSITORY ? `${process.env.GITHUB_SERVER_URL || 'https://github.com'}/${process.env.GITHUB_REPOSITORY}/blob/HEAD/` : '';
  md += `Fix the file on github.com (or upload a corrected copy) and the app updates on the next run. The rules are in [${RULES_LINK}](${repoUrl}${RULES_LINK}#7-checks-before-anything-is-merged).\n`;
}
summary(md);
setOutput('invalid', bad.length);
