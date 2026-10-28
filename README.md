# Huron animated icons

Animated versions of Huron brand icons, built for video. Every animation uses the original brand artwork without redrawing it, and exports as a transparent ProRes 4444 `.mov` that drops straight onto a Premiere Pro timeline.

This repo holds:

- the **icons**: the untouched brand source files and their animated masters
- the **house rules** for building new animated icons
- the **export app** (coming soon) for changing an icon's color and exporting `.mov` files at the size and frame rate you need

## Repo layout

```
.
├── README.md
├── docs/
│   ├── house-rules.md          How every animated icon must be built
│   └── project-summary.md      How the first icon was made, and what we learned
├── icons/
│   └── decision-1/
│       ├── source/
│       │   └── decision_1.svg  Original from the brand hub. Never edited.
│       ├── decision-1_sequential-pop.svg      Animated masters, one per animation
│       ├── decision-1_branch-out.svg
│       ├── decision-1_drawn-on.svg
│       └── decision-1_weigh-the-options.svg
└── app/                        The export app (runs in the browser on GitHub Pages)
    ├── lib/render-core.js      Shared renderer: frames and ProRes export
    └── assets/                 Huron logo and brand fonts
```

Each icon gets its own folder under `icons/`. One icon can have several animations; each is a separate master SVG. Pre-rendered `.mov` files are stored as GitHub Release assets, never in the repo.

## Exporting an icon

> The export app is not built yet. Until it is, ask the maintainers for exports.

When it's ready, the app will let you:

1. Pick an icon and animation.
2. Pick a color: any Huron brand color, or type your own hex value.
3. Pick a size: **1080p** (1920 × 1080) or **4K** (3840 × 2160).
4. Pick a frame rate: **23.976** (default), 24, 25, 29.97 or 30.
5. Download a transparent `.mov`.

Exports are named:

```
<icon>_<animation>_<color>_<size>_<rate>.mov
decision-1_weigh-the-options_white_4k_23976.mov
```

## Using an export in Premiere Pro

1. Import the `.mov`.
2. Place it on a track **above** your footage or background.
3. Scale and position it like any other clip. The icon is centered in a full 16:9 frame, so it lines up with no adjustment.
4. To keep the finished icon on screen longer, right-click the last frame and choose **Add Frame Hold**.

### "The background is black"

The file is almost certainly fine. QuickTime Player, Finder's Quick Look, VLC and the Windows media players can't show transparency, so they display it as black.

- In Premiere, put the clip over other footage, or turn on **Transparency Grid** in the Program Monitor's settings (wrench) menu.
- Still black over footage? Right-click the clip in the Project panel, choose **Modify > Interpret Footage**, and make sure **Ignore Alpha** is not checked.
- To confirm the file has transparency, run:

  ```bash
  ffprobe -v error -select_streams v -show_entries stream=codec_tag_string,pix_fmt file.mov
  ```

  You should see `codec_tag_string=ap4h` and a `pix_fmt` that starts with `yuva`. The `a` means alpha.

## Export specs

| | |
|---|---|
| Format | QuickTime `.mov`, Apple ProRes 4444 with alpha |
| Background | Transparent |
| Sizes | 1080p (1920 × 1080), 4K UHD (3840 × 2160) |
| Frame rates | 23.976 (default), 24, 25, 29.97, 30 |
| Length | Animation length plus a 0.75 s hold on the finished icon |
| Placement | Centered. Artwork fits within 62.5% of frame width and 70% of frame height |
| File size | Roughly 20 to 60 MB per 4 seconds at 1080p; 50 to 200 MB at 4K |

## Brand colors

The app offers the Huron Brand 2026 palette, with **Aubergine 700 (`#5D013A`)** as the default. Use White, Ecru or Mint 300 over dark footage, and Aubergine, Stone or Mint 700 over light footage. Mint 300 is never used on light backgrounds. The full list with hex values is in the [house rules](docs/house-rules.md#color-options-for-the-app).

## Adding a new animated icon

1. Read the [house rules](docs/house-rules.md). They're short, and the export app depends on them.
2. Create `icons/<icon-name>/source/` and add the original SVG from the [Huron brand hub](https://brandhub.huronconsultinggroup.com/design-system/brand-overview), unedited.
3. Build the animated master in `icons/<icon-name>/`, following the rules: split only at existing subpaths, `fill="currentColor"` on every artwork path, CSS keyframes only, required `data-` settings on the root.
4. Run through the checklist in [section 7 of the house rules](docs/house-rules.md#7-checks-before-anything-is-merged).
5. Open a pull request with a short screen recording or exported `.mov` link so reviewers can see the motion.

## Large files

ProRes files are big. Don't commit `.mov` exports to this repo. The `exports/` folder is for local use and should be listed in `.gitignore`:

```
exports/
*.mov
```

If finished exports need to be shared, store them in the team's shared drive, or set up [Git LFS](https://git-lfs.com) for this repo first.

## Background

The first icon, `decision-1` with the "weigh the options" animation, is documented step by step in the [project summary](docs/project-summary.md), including how it was built, how it was checked against the original artwork, and why exported files can look black in some players.
