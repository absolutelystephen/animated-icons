/**
 * exporter.js
 * Renders a .mov in the browser with render-core.js and ffmpeg.wasm.
 *
 * ffmpeg.wasm (about 32 MB) is only downloaded the first time someone renders,
 * never on page load. It's served from this site's vendor/ folder, which the
 * build copies from the npm packages pinned in package.json:
 *   @ffmpeg/ffmpeg 0.12.15 and @ffmpeg/core 0.12.10 (single-thread build,
 *   which needs no special server headers, so it works on GitHub Pages).
 */
import { mountMaster, exportMov, frameTimes } from './render-core.js';

const FFMPEG_URL = new URL('../vendor/ffmpeg/dist/esm/index.js', import.meta.url).href;
const CORE_URL = new URL('../vendor/core/ffmpeg-core.js', import.meta.url).href;
const WASM_URL = new URL('../vendor/core/ffmpeg-core.wasm', import.meta.url).href;

let loaded = null; // a ready FFmpeg instance, kept between renders

const cancelled = () => new DOMException('The render was cancelled.', 'AbortError');

/**
 * Render a master to a ProRes 4444 .mov Blob.
 *   text        the master SVG text
 *   options     { color: '#RRGGBB', size: '1080p' | '4k', rate: '23976' | ... }
 *   signal      an AbortSignal: aborting stops the render straight away
 *   onProgress  called with { stage: 'load' | 'render' | 'encode', done, total }
 */
export async function renderMov(text, options, { signal, onProgress = () => {} }) {
  onProgress({ stage: 'load', done: 0, total: 1 });
  let ff = loaded;
  // Stopping ffmpeg is the only way to interrupt it. After that it has to be
  // loaded again, which is quick because the browser has cached the files.
  const stop = () => { ff?.terminate(); if (loaded === ff) loaded = null; };
  signal.addEventListener('abort', stop, { once: true });
  let mounted = null;
  try {
    if (!ff) {
      const { FFmpeg } = await import(FFMPEG_URL);
      if (signal.aborted) throw cancelled();
      ff = new FFmpeg();
      await ff.load({ coreURL: CORE_URL, wasmURL: WASM_URL });
      loaded = ff;
    }
    if (signal.aborted) throw cancelled();

    mounted = await mountMaster(text);
    const total = frameTimes(mounted.meta, options.rate).length;

    // ffmpeg's own progress estimate can be patchy for image sequences, so
    // also count the frames it reports in its log.
    const onLog = ({ message }) => {
      const m = /frame=\s*(\d+)/.exec(message);
      if (m) onProgress({ stage: 'encode', done: Number(m[1]), total });
    };
    ff.on('log', onLog);
    try {
      return await exportMov(mounted, ff, options, (p) => {
        // Throwing here stops the frame loop. Only safe while rendering frames;
        // during encoding, cancelling stops ffmpeg instead.
        if (signal.aborted && p.stage === 'render') throw cancelled();
        onProgress(p);
      });
    } finally {
      ff.off('log', onLog);
    }
  } catch (err) {
    if (signal.aborted) throw cancelled();
    stop(); // start fresh next time: a failed run can leave frames in ffmpeg's memory
    throw err;
  } finally {
    signal.removeEventListener('abort', stop);
    mounted?.dispose();
  }
}
