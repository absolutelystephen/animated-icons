/**
 * preview.js
 * Shows a master in the app without ever changing the master file.
 *
 * Playing: an <img> of a recolored copy of the master. An <img> is its own
 * isolated document, so keyframe names from different icons can't clash.
 * Stepping frame by frame: render-core.js freezes the animation at an exact
 * time (the same code the export uses), and that snapshot is shown in the <img>.
 *
 * The preview uses the full 16:9 export frame as its viewBox, so it shows the
 * icon exactly where it will sit in the exported video, with room for overscan.
 */
import { mountMaster, frameViewBox, frameTimes, snapshot } from './render-core.js';

/**
 * A display copy of a master's SVG text. Sets the color and viewBox, and
 * removes the `play` class for a still of the finished icon.
 */
export function displayCopy(text, { color, viewBox, play = true } = {}) {
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  const svg = doc.documentElement;
  svg.querySelector('metadata')?.remove(); // provenance data, not needed for display
  if (color) svg.setAttribute('color', color);
  if (viewBox) svg.setAttribute('viewBox', viewBox);
  if (!play) svg.classList.remove('play');
  return new XMLSerializer().serializeToString(doc);
}

/** A blob: URL for SVG text, for use as an <img> src. Revoke it when done. */
export const svgUrl = (text) => URL.createObjectURL(new Blob([text], { type: 'image/svg+xml' }));

/** The master's own viewBox, widened by data-overscan on every side (for thumbnails). */
export function overscanViewBox(meta) {
  const { x, y, w, h } = meta.viewBox;
  const o = meta.overscan;
  return `${x - o} ${y - o} ${w + 2 * o} ${h + 2 * o}`;
}

/**
 * The large preview. Owns one <img>, the frame slider and the frame label.
 * onChange(state) is called with 'playing', 'paused' or 'ended'.
 */
export class Player {
  constructor({ img, scrub, label, onChange = () => {} }) {
    Object.assign(this, { img, scrub, label, onChange });
    this.mounted = null;
    this.color = null;
    this.rate = '23976';
    this.frame = 0;
    this.raf = 0;
    this.url = null;
    this.state = 'paused';
    this.drawRaf = 0; // a frame draw waiting for the next animation frame
    scrub.addEventListener('input', () => this.showFrame(Number(scrub.value)));
  }

  /** Load a new master (SVG text). Disposes the previous one. */
  async load(text) {
    this.stop();
    const mounted = await mountMaster(text);
    this.mounted?.dispose();
    this.mounted = mounted;
    this.text = text;
    this.meta = mounted.meta;
    this.hasPlayed = false;
    this.viewBox = frameViewBox(this.meta, 1920, 1080); // 4K has the same layout
    this.retime();
  }

  get count() { return this.times.length; }

  /** Recompute frame times for the current rate, keeping the position in time. */
  retime() {
    const t = this.times ? this.times[this.frame] || 0 : 0;
    this.times = frameTimes(this.meta, this.rate);
    this.scrub.max = String(this.count - 1);
    this.frame = Math.min(this.count - 1, Math.round(t * this.count / (this.meta.duration + this.meta.hold)));
    this.updateLabel();
  }

  setRate(rate) {
    this.rate = rate;
    if (!this.meta) return;
    this.retime();
    if (this.state !== 'playing') this.showFrame(this.frame);
  }

  setColor(color) {
    this.color = color;
    if (!this.meta) return;
    if (this.state === 'playing') this.play(); // a playing <img> can't change color, so restart it
    else this.showFrame(this.frame);
  }

  /** Play from the start, as a live animation in the <img>. */
  play() {
    if (!this.meta) return;
    this.stop();
    const url = svgUrl(displayCopy(this.text, { color: this.color, viewBox: this.viewBox, play: true }));
    this.img.onload = () => {
      if (this.img.src !== url) return;
      const start = performance.now();
      const total = this.meta.duration + this.meta.hold;
      const tick = (now) => {
        const t = (now - start) / 1000;
        this.frame = Math.min(this.count - 1, Math.floor(t * this.count / total));
        this.scrub.value = String(this.frame);
        this.updateLabel();
        if (t >= total) { this.raf = 0; this.setState('ended'); return; }
        this.raf = requestAnimationFrame(tick);
      };
      this.raf = requestAnimationFrame(tick);
    };
    this.hasPlayed = true;
    this.swap(url);
    this.setState('playing');
  }

  /** Stop playback where it is. */
  stop() {
    if (this.raf) cancelAnimationFrame(this.raf);
    if (this.drawRaf) cancelAnimationFrame(this.drawRaf);
    this.raf = this.drawRaf = 0;
    if (this.img) this.img.onload = null;
    if (this.state === 'playing') this.setState('paused');
  }

  /** Show one exact frame, as the exporter would render it. */
  showFrame(index) {
    if (!this.meta) return;
    this.stop();
    this.frame = Math.max(0, Math.min(this.count - 1, index));
    this.scrub.value = String(this.frame);
    this.updateLabel();
    this.setState(this.frame === this.count - 1 ? 'ended' : 'paused');
    // Draw at most one frame per animation frame while someone drags the slider.
    const i = this.frame;
    this.drawRaf = requestAnimationFrame(() => {
      this.drawRaf = 0;
      const t = this.times[i];
      const opts = { color: this.color, viewBox: this.viewBox };
      const text = t >= this.meta.duration ? snapshot(this.mounted, null, opts) : snapshot(this.mounted, t, opts);
      this.swap(svgUrl(text));
    });
  }

  /** Show the finished icon (the last frame). */
  showEnd() { if (this.meta) this.showFrame(this.count - 1); }

  swap(url) {
    const old = this.url;
    this.url = url;
    this.img.src = url;
    if (old) setTimeout(() => URL.revokeObjectURL(old), 1000);
  }

  setState(s) {
    this.state = s;
    this.onChange(s);
  }

  updateLabel() {
    this.label.textContent = `Frame ${this.frame + 1} of ${this.count}`;
  }
}
