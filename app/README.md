# Export app: developer guide

A static site with no framework and no build step: plain HTML, CSS and JavaScript modules. GitHub Actions assembles it with the icons, `library.json` and ffmpeg.wasm, and publishes it to GitHub Pages. For setup and day-to-day use, see the [main README](../README.md).

## Files

### The app (`app/`)

| File | What it does |
|---|---|
| `index.html` | The one page: icon list (1), preview, color (2), output (3), export (4). The list shows one card per master in `icons/`; each icon folder holds only its chosen animation (unused concepts live in `archive/`, which the build ignores). |
| `styles.css` | Brand fonts, color tokens and layout. Huron Brand 2026: Bricolage Grotesque and Roboto, Regular and Bold only; radius 8 / 12 / 16 px; Guava 600 only on the export button. |
| `app.js` | Wires the page together: loads `library.json`, keeps the current choices, remembers them in `localStorage`, picks instant download or in-browser render, shows progress and errors. |
| `lib/colors.js` | The brand palette (name, hex, footage hint) and hex helpers. **Shared with the build scripts**, so pre-render file names match the app. |
| `lib/preview.js` | The large preview and the thumbnails. Plays a recolored copy of the master in an `<img>`, and draws exact frames for the slider using `render-core.js`. |
| `lib/exporter.js` | Loads ffmpeg.wasm on the first render (never on page load), runs `exportMov`, and supports Cancel. |
| `lib/render-core.js` | The tested reference renderer, unchanged. Used by the app and by the pre-render script, so both make identical frames. |
| `assets/` | Huron wordmark, favicon and self-hosted fonts. |

### The build (`scripts/`, run by `.github/workflows/build-and-deploy.yml`)

| Script | What it does | Writes |
|---|---|---|
| `validate.mjs` | Runs every check in house rules section 7 on every master, in headless Chromium. A port of `validate-masters.py`, extended to the full checklist. | `build/validation.json`, the run's Summary page |
| `prerender.mjs` | Renders each valid master's default color at 1080p and 4K, 23.976 and 29.97, with `render-core.js`; encodes with native ffmpeg using the same ProRes settings; checks each file with `ffprobe`; syncs the `prerenders` release. | `build/prerenders.json`, release assets |
| `build-library.mjs` | Combines the masters' `data-` settings with the pre-render links. | `build/library.json` |
| `assemble-site.mjs` | Copies the app, valid masters, `library.json` and the ffmpeg.wasm files into `_site/`. | `_site/` |
| `serve.mjs` | A small local web server for testing. | |
| `lib/common.mjs`, `lib/server.mjs` | Shared helpers: paths, hashing, the headless browser harness, the server. | |

## How the pieces fit

```
icons/*/<icon>_<animation>.svg
        │
        ▼
validate.mjs ──► build/validation.json ──► prerender.mjs ──► "prerenders" release
        │                                         │              (.mov files + manifest.json)
        └──────────────► build-library.mjs ◄──────┘
                                 │
                                 ▼
                        build/library.json ──► assemble-site.mjs ──► _site/ ──► GitHub Pages
```

`library.json` looks like this:

```json
{
  "repo": "owner/repo",
  "icons": [{
    "id": "decision-1", "title": "Decision 1",
    "animations": [{
      "id": "weigh-the-options", "title": "Weigh the options", "description": "...",
      "file": "icons/decision-1/decision-1_weigh-the-options.svg",
      "duration": 3.25, "hold": 0.75, "overscan": 3, "defaultColor": "#5D013A",
      "prerenders": [{ "color": "#5D013A", "size": "1080p", "rate": "23976", "name": "...mov", "bytes": 40880701, "url": "https://github.com/..." }]
    }]
  }]
}
```

**Change detection.** `manifest.json` on the release records a hash of each master plus a hash of `render-core.js` and the ProRes settings. A master is rendered again when either changes. Assets no current master needs are deleted.

**Previews and isolation.** Keyframe names are global inside a page, so a master is never inlined into the app. The live preview is an `<img>` of a recolored copy (an image is its own document). Exact frames come from `render-core.js`, which loads the master in a hidden iframe. The preview uses the full 16:9 export frame as its viewBox, so it shows the icon exactly where it sits in the video, with room for overscan. Thumbnails widen the master's own viewBox by `data-overscan`.

**Cancel.** During frame rendering, the progress callback throws to stop the loop. During encoding, `ffmpeg.terminate()` stops the worker, and the next render loads it again (fast, the files are cached).

## Running it locally

Needs Node.js 22 and ffmpeg on your computer.

```bash
npm ci
npx playwright install chromium
npm run build      # validate, pre-render, library, assemble (pre-renders go to build/local-release/)
npm run serve      # then open http://127.0.0.1:8000
```

Without `GH_TOKEN` and `GITHUB_REPOSITORY` set, `prerender.mjs` keeps its "release" in `build/local-release/` and the local site serves those files, so instant downloads work locally too. Pre-rendering is slow on a laptop; to skip it, run `validate`, `library` and `site` only.

## Common changes

### Change the color list

Edit `PALETTE` in `lib/colors.js`. Each color needs an `id` (lowercase, hyphens: used in file names), a `name`, an uppercase `hex`, and `footage` (`light`, `dark` or `either`). Colors with `footage: 'dark'` show the moon mark and switch the preview to dark. Add an optional `note` for a hint shown when it's selected. Keep `docs/house-rules.md` section 3 in step.

To change the default color, change `DEFAULT_COLOR_ID`. Pre-renders use each master's `data-default-color`, so update the masters too or the default won't be instant.

### Add a frame rate

1. Add it to `FRAME_RATES` in `lib/render-core.js` (key is digits only, used in file names; give the exact fraction).
2. Add a radio button in `index.html`, inside `#more-rates` (or next to 23.976 and 29.97 to show it up front).
3. To pre-render it too, add the key to `PRERENDER_RATES` in `scripts/lib/common.mjs`. Every master then renders again on the next run.
4. Update house rules section 5.

### Change what's pre-rendered

`PRERENDER_SIZES` and `PRERENDER_RATES` in `scripts/lib/common.mjs`. Each extra combination adds one file per animation to the release.

### Update ffmpeg.wasm

The versions are pinned in `package.json` (`@ffmpeg/ffmpeg` 0.12.15, `@ffmpeg/core` 0.12.10, single-thread build). To change them:

1. Edit both versions in `package.json` and run `npm install` to refresh `package-lock.json`. On github.com you can't run `npm install`, so do this on a computer with Node.js, or ask a developer.
2. Run a full in-browser export locally and check it with `ffprobe` (ProRes 4444 `ap4h`, `yuva` pixel format, right frame count).
3. Don't switch to the multi-thread core: it needs cross-origin isolation headers that GitHub Pages can't send.

The app loads ffmpeg from `vendor/` on the same site (`lib/exporter.js`). If the package's folder layout changes, update the paths in `assemble-site.mjs` and `lib/exporter.js`.

### Update the GitHub Actions versions

The workflow uses `actions/checkout@v7`, `actions/setup-node@v7`, `actions/configure-pages@v6`, `actions/upload-pages-artifact@v5` and `actions/deploy-pages@v5`. When GitHub releases new major versions, bump them in `.github/workflows/build-and-deploy.yml` and check a run.

## Browser support

Chrome and Edge (desktop). Other browsers get a notice; previews may work but exporting isn't tested there.
