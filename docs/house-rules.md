# Animated icon house rules

These rules describe how every animated Huron icon in this repo is built. They exist for two reasons:

1. **Brand safety.** The icon artwork is never redrawn or altered. Motion is added on top of the original file.
2. **Easy editing and export.** A small app should be able to open any animated icon, change its color, and export a transparent `.mov` at any supported size and frame rate without understanding the animation itself.

If an icon follows every rule below, the app only ever needs to change one value (the color) and read a few labels in the file (name, length, hold). Everything else is fixed.

---

## 1. The source artwork is never changed

- Always start from the official SVG from the [Huron brand hub](https://brandhub.huronconsultinggroup.com/design-system/brand-overview). Keep an untouched copy in `icons/<icon-name>/source/`.
- Never edit coordinates, redraw, simplify, outline, expand, add or remove shapes.
- Keep the source `viewBox` exactly as it is.
- To animate parts on their own, split the path **only at its existing subpath boundaries** (each `M` command starts a new subpath). Do not cut a shape anywhere else.
- Keep shapes that belong together in one path. A ring is drawn as an outer edge plus an inner edge; both must stay in the same `<path>`, or the ring fills in solid.
- After splitting, the pieces joined back together must equal the original path data character for character. The build step checks this.
- Nothing is added to the artwork, not even briefly: no glows, shadows, halos, sparkles or extra lines. Movement comes only from the icon's own pieces.
- **The final frame must match the source icon.** This is the most important test (see section 7).

## 2. One master file per animation

Each animation is a single, self-contained SVG file: the **master**. It holds the artwork, the motion and the settings the app needs. No external CSS, JavaScript, fonts or images.

### File name

```
icons/<icon-name>/<icon-name>_<animation-name>.svg
```

Example: `icons/decision-1/decision-1_weigh-the-options.svg`

Use lowercase letters, numbers and hyphens only.

### Required structure

```xml
<svg xmlns="http://www.w3.org/2000/svg"
     viewBox="0 0 69.197 43.523"            <!-- copied from the source, unchanged -->
     overflow="visible"
     class="icon play"
     color="#5D013A"                       <!-- THE ONLY VALUE THE APP EDITS -->
     data-icon="decision-1"
     data-animation="weigh-the-options"
     data-version="1"
     data-title="Weigh the options"         <!-- shown in the app library -->
     data-description="The person becomes the pivot of a balance."   <!-- optional, one sentence -->
     data-duration="3.25"                  <!-- seconds until the last movement ends -->
     data-hold="0.75"                      <!-- seconds to hold the final frame -->
     data-overscan="3"                     <!-- max distance motion travels outside the viewBox, in viewBox units -->
     data-default-color="#5D013A">
  <style>
    /* all keyframes and animation rules live here */
  </style>
  <defs>
    <!-- masks only, if the animation uses reveals -->
  </defs>
  <g class="move-person">
    <path class="part-body" fill="currentColor" d="..."/>
    <g class="move-head"><path class="part-head" fill="currentColor" d="..."/></g>
  </g>
  <!-- more parts -->
</svg>
```

### Naming inside the file

| Prefix | Used for | Example |
|---|---|---|
| `part-` | A piece of the original artwork. Only these carry path data from the source. | `part-ring-left`, `part-mark-check` |
| `move-` | A wrapper group that exists only to be animated. | `move-pan-left`, `move-glance` |
| `mask-` | Shapes inside a `<mask>` (the white shapes that do the revealing). | `mask-sweep`, `mask-write` |
| `<animation>-mask-` | Mask ids. Start with the animation name (or its first word or words, such as `weigh` for `weigh-the-options`) so ids never collide. | `weigh-mask-check` |
| `<animation>-` | Keyframe names. Start with the animation name (or its first word or words) for the same reason. | `@keyframes weigh-pan-left` |

Parts never carry animations themselves. Animate the `move-` wrappers. This keeps the artwork layer clean and lets several motions stack (for example, a pan that sways while the mark inside it pops).

## 3. Color

- Every artwork path uses `fill="currentColor"`. No hex values on paths, ever.
- The color is set once, on the root `<svg>`, with the `color` attribute. Changing that one attribute recolors the whole icon. The app edits nothing else.
- Mask contents are always pure white (`#fff`) and never use `currentColor`. Masks control visibility, not color, so they must not change when the icon is recolored.
- `data-default-color` records the brand default so the app can offer "reset".
- Icons are single color. If a future icon needs two colors, stop and agree an extension to these rules before building it.

### Color options for the app

Hex values come from the Huron Brand 2026 palette (May 2026).

| Name | Hex | Notes |
|---|---|---|
| Aubergine 700 | `#5D013A` | **Default.** Brand primary. Light backgrounds. |
| Aubergine 800 | `#370022` | Light backgrounds. |
| Aubergine 500 | `#850253` | Light backgrounds. |
| White | `#FFFFFF` | Dark footage and Aubergine backgrounds. |
| Ecru 50 | `#F7F6F4` | Dark backgrounds. |
| Ecru 100 | `#EBE9E4` | Dark backgrounds. |
| Ecru 200 | `#E3E1D4` | Dark backgrounds, including Aubergine. |
| Mint 300 | `#BCFFEC` | **Dark backgrounds only.** Never on light. |
| Mint 500 | `#70CDB3` | Either. |
| Mint 700 | `#22887D` | Light backgrounds. |
| Butterscotch 500 | `#F8B808` | Dark backgrounds. Emphasis. |
| Butterscotch 600 | `#E79913` | Either. |
| Butterscotch 700 | `#9F7C2A` | Light backgrounds. |
| Guava 600 | `#D62440` | Use sparingly. Guava is the brand's action color. |
| Guava 500 | `#FF3D5A` | Use sparingly. |
| Guava 700 | `#A01B30` | Use sparingly. |
| Stone 900 | `#2B2623` | Light backgrounds. |
| Stone 600 | `#5D5652` | Light backgrounds. |
| Stone 400 | `#9E9995` | Either. Low contrast. |

**Custom color:** accept a 6-digit hex value (`#RRGGBB`, with or without the `#`, any letter case). Reject anything else. Store and display it in uppercase.

## 4. Motion

### What drives the animation

- **CSS `@keyframes` only**, inside the file's `<style>` block.
- Not allowed: JavaScript, SMIL (`<animate>`, `<animateTransform>`), `requestAnimationFrame`, random values, Lottie, GIFs, video.
- Why: the exporter freezes the browser's animation clock and steps it frame by frame (`document.getAnimations()`). Only CSS animations can be stepped this way reliably, so every export is identical every time.

### How animations start and end

- Animations only run while the root has the class `play`. Without `play`, the icon shows its finished state. Selectors look like `.play .move-head { ... }`.
- Every animation uses `animation-fill-mode: both`, so each piece is hidden or in its start pose before its delay, and stays in its final pose after.
- Every animation is finite. No `infinite`. Looping is out of scope for now.
- `data-duration` must equal the latest end time of any animation (delay plus duration). The build step checks this.
- At time 0 the frame should be empty (fully transparent) unless the animation is designed to start with something visible.
- Every piece must end at exactly its original position, scale, rotation and opacity: `transform: none`, `opacity: 1`.

### What may animate

| Allowed | Notes |
|---|---|
| `transform` on `move-` groups | translate, scale, rotate |
| `opacity` on `move-` groups | |
| `transform` on shapes inside masks | wipes, grows |
| `stroke-dasharray` / `stroke-dashoffset` on shapes inside masks | pen-style sweeps |

Not allowed: filters, blurs, color changes during the animation, path morphing (changing `d`), strokes added to the artwork, anything that changes the artwork's shape.

### Units and pivots

- Write all times in seconds, multiplied by the speed variable: `calc(0.55s * var(--s, 1))`. The app always exports at `--s: 1`; the variable exists for slow-motion previews.
- Inside an SVG, `px` in a transform means viewBox units, not screen pixels. `translateY(2.2px)` moves 2.2 units of the icon's own coordinate system.
- For pivots relative to a piece itself, use `transform-box: fill-box` with a percentage `transform-origin` (`50% 50%` is the piece's center).
- For a pivot at a fixed point in the icon, use `transform-box: view-box` with a `transform-origin` in px (viewBox units).

### Staying inside the frame

- Motion may go outside the viewBox (an overshoot, a sway), but never further than `data-overscan` in any direction.
- Root `<svg>` always has `overflow="visible"` so nothing gets clipped mid-move.

### Standard easing curves

Reuse these so the whole icon family feels consistent.

| Name | Curve | Use for |
|---|---|---|
| Back out | `cubic-bezier(.34, 1.56, .64, 1)` | Pops with a small overshoot |
| Expo out | `cubic-bezier(.16, 1, .3, 1)` | Long travel that arrives softly |
| Quint out | `cubic-bezier(.22, 1, .36, 1)` | Rises, fades, wipes |
| Cubic in-out | `cubic-bezier(.65, 0, .35, 1)` | Pen sweeps |
| Sway | `cubic-bezier(.45, 0, .55, 1)` | Back-and-forth motion, settling |

### Length

- Short moments (slides, UI, lower thirds): 1 to 2 seconds.
- Hero moments: up to about 3.5 seconds.
- Default hold after the motion ends: 0.75 seconds.

### Known techniques and their fixes

- **Pen sweep reveal.** Put a circle in a mask with a stroke wide enough to cover the ring, set `pathLength="100"`, and animate `stroke-dasharray` from `0 100` to `100 0`, then to `none` at the very end. Without that final switch to `none`, a hairline seam stays visible where the sweep started and finished. Start the sweep with a rotate transform on the mask circle, and mirror it with `scale(-1 1)` for a counter-clockwise sweep.
- **Left-to-right "written" reveal.** A white rectangle in a mask, `transform-origin: 0 50%`, scaled on X from 0 to 1.
- **Grow from center.** A white circle in a mask, scaled from 0 to 1 around its own center.

## 5. Export

### Canvas and placement

| Option | Pixels | Notes |
|---|---|---|
| 1080p | 1920 × 1080 | Default |
| 4K | 3840 × 2160 | UHD. Rendered at 2× pixel density with the same layout, so 4K is an exact sharper copy of 1080p. |

- The canvas is always full 16:9 frame with a transparent background, so the clip drops onto a Premiere timeline with no repositioning.
- The icon is centered. Its artwork is scaled to fit inside a centered box 62.5% of the frame wide and 70% of the frame tall (1200 × 756 at 1080p), keeping its proportions.
- The exporter must confirm that the artwork plus `data-overscan` still fits inside the frame. If it doesn't, the export stops with an error. Do not shrink the icon automatically.

### Frame rates

| Option | Exact rate | ffmpeg value |
|---|---|---|
| **23.976** | 24000/1001 | `24000/1001` (**default**) |
| 24 | 24 | `24` |
| 25 | 25 | `25` |
| 29.97 | 30000/1001 | `30000/1001` |
| 30 | 30 | `30` |

- Always use the exact fraction, never a rounded decimal such as 23.98.
- Frame `n` is captured at time `n ÷ rate`.
- Total frames = `ceil((data-duration + data-hold) × rate)`. The last frame is always the finished icon.

### Rendering

The reference renderer is `app/lib/render-core.js`. It runs in the browser (the export app) and in headless Chrome (automated pre-renders), so both produce identical frames.

1. Load the master SVG into a hidden iframe so its styles are isolated.
2. Pause every animation. For each frame before `data-duration`, set every animation's `currentTime` to that frame's time.
3. Read the animated values (transform, opacity, stroke-dasharray) with `getComputedStyle` and copy them as inline styles onto a clone of the SVG with `play` removed. The clone is a frozen snapshot of that moment.
4. Set the chosen color on the clone, widen its viewBox to the full 16:9 frame (placement rule above), and draw it onto a transparent canvas. The master file itself is never changed.
5. For every frame at or after `data-duration` (the hold), draw the static icon instead, so held frames are the exact artwork.
6. Encode the PNG frames to ProRes 4444.

This is why section 4 only allows CSS keyframes on a short list of properties: the renderer must be able to read every animated value back.

### Encoding

ProRes 4444 with alpha, in a QuickTime `.mov`:

```bash
ffmpeg -framerate 24000/1001 -i frames/f%04d.png \
  -c:v prores_ks -profile:v 4444 -pix_fmt yuva444p10le -alpha_bits 16 -vendor apl0 \
  output.mov
```

Approximate size for a 4-second clip: 20 to 60 MB at 1080p and 50 to 200 MB at 4K, depending on color and motion.

### File naming

```
<icon-name>_<animation-name>_<color>_<size>_<rate>.mov
```

- `<color>`: the palette name in lowercase with hyphens (`aubergine-700`, `white`), or `custom-RRGGBB` for typed colors (`custom-1A2B3C`).
- `<size>`: `1080p` or `4k`.
- `<rate>`: digits only: `23976`, `24`, `25`, `2997`, `30`.

Example: `decision-1_weigh-the-options_white_4k_23976.mov`

## 6. Previewing transparency

Most preview apps cannot show transparency and fill it with black: QuickTime Player, macOS Finder preview (Quick Look), VLC and the Windows media players. **A black background in those apps does not mean the file is broken.** To see transparency:

- In Premiere Pro, place the clip on a track above other footage, or turn on **Transparency Grid** from the Program Monitor's settings (wrench) menu.
- If the clip still shows black over footage, right-click it in the Project panel, choose **Modify > Interpret Footage**, and make sure **Ignore Alpha** is not checked.

## 7. Checks before anything is merged

The **Build and deploy** workflow runs these automatically on every push (`scripts/validate.mjs`) and leaves out any master that fails, with an explanation on the run's Summary page. Anyone building an icon by hand runs them too.

**Master SVG**

- [ ] Source file is present in `source/` and unmodified.
- [ ] Joining all `part-` path data in order reproduces the source path data exactly.
- [ ] Every artwork path uses `fill="currentColor"`; there are no hex values on paths.
- [ ] Mask contents are white only.
- [ ] Root has `class="icon play"`, `overflow="visible"`, `color` and every required `data-` attribute (`data-icon`, `data-animation`, `data-version`, `data-title`, `data-duration`, `data-hold`, `data-overscan`, `data-default-color`).
- [ ] The file is `icons/<icon-name>/<icon-name>_<animation-name>.svg`, and `data-icon` and `data-animation` match the folder and file name.
- [ ] Keyframe names and mask ids start with the animation name, or with its first word or words (`weigh-` for `weigh-the-options`).
- [ ] Only CSS keyframes are used. No scripts, no SMIL, no `infinite`.
- [ ] `data-duration` equals the latest animation end time.
- [ ] At `data-duration`, every `move-` group has an identity transform and full opacity, and every mask shape is fully revealing (identity transform, `stroke-dasharray: none`). Read these with `getComputedStyle`. This proves the motion lands exactly on the artwork.
- [ ] The static icon (rendered without `play`) matches the source icon. Allow edge-smoothing differences only: no pixel more than 8 out of 255 apart once each pixel is averaged with its eight neighbors. (Pieces drawn as separate paths are edge-smoothed separately, so single edge pixels can differ by 10 to 40 even when the artwork is identical. Averaging removes that noise; a piece just 0.03 units out of place still scores around 70. The build compares at 1200 px wide.)
- [ ] Motion stays within `data-overscan` at every frame.

**Exported `.mov`**

- [ ] Codec tag is `ap4h` (ProRes 4444) and pixel format starts with `yuva` (has alpha). Check with `ffprobe -v error -show_streams -select_streams v file.mov`.
- [ ] Frame count, size and rate match what was requested.
- [ ] First frame is fully transparent (unless designed otherwise).
- [ ] Last frame is the static icon in the chosen color and matches the source.
