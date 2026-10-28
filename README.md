# Huron animated icons

Animated versions of Huron brand icons, built for video. Every animation uses the original brand artwork without redrawing it, and exports as a transparent ProRes 4444 `.mov` that drops straight onto a Premiere Pro timeline.

This repo holds:

- the **export app**: pick an icon, pick a color, size and frame rate, and download a transparent `.mov`
- the **icons**: the untouched brand source files and their animated masters
- the **house rules** for building new animated icons

**First time here and setting up the repo?** Go to [First-time setup on GitHub](#first-time-setup-on-github).

## Using the app

The app lives at:

```
https://<account>.github.io/<repo>/
```

For example, if the repo is `github.com/huron-video/animated-icons`, the app is at `https://huron-video.github.io/animated-icons/`. Use **Chrome or Edge**.

1. **Animation.** Pick one from the list on the left. It plays in the preview.
2. **Color.** Click a brand color, or type a 6-digit hex value under **Custom hex**. Colors marked with a moon work best on dark footage; choosing one switches the preview to a dark background. Use **Light**, **Dark** and **Transparent** above the preview to check it on different backgrounds, and drag the slider under the preview to step through it frame by frame.
3. **Output.** Choose **1080p** or **4K**, and a frame rate. 23.976 and 29.97 are shown; 24, 25 and 30 are under **Other frame rates**.
4. **Export.** Click the red button.
   - **Download** means the file is pre-rendered and downloads straight away.
   - **Render and download** means your browser makes the file. It shows an estimate, a progress bar and a Cancel button. Keep the tab open until it finishes. The file downloads automatically, and **Download again** stays available.

The app remembers your last color, size and frame rate.

Exports are named:

```
<icon>_<animation>_<color>_<size>_<rate>.mov
decision-1_weigh-the-options_white_4k_23976.mov
decision-1_weigh-the-options_custom-1A2B3C_1080p_2997.mov
```

## Using an export in Premiere Pro

1. Import the `.mov`.
2. Place it on a track **above** your footage or background.
3. Scale and position it like any other clip. The icon is centered in a full 16:9 frame, so it lines up with no adjustment.
4. To keep the finished icon on screen longer, right-click the last frame and choose **Add Frame Hold**.

### Looks black in QuickTime?

That's normal. The file is transparent. QuickTime Player, Finder's Quick Look, VLC and the Windows media players can't show transparency, so they display it as black.

- In Premiere, put the clip over other footage, or turn on **Transparency Grid** in the Program Monitor's settings (wrench) menu.
- Still black over footage? Right-click the clip in the Project panel, choose **Modify > Interpret Footage**, and make sure **Ignore Alpha** is not checked.
- To confirm the file has transparency, run:

  ```bash
  ffprobe -v error -select_streams v -show_entries stream=codec_tag_string,pix_fmt file.mov
  ```

  You should see `codec_tag_string=ap4h` and a `pix_fmt` that starts with `yuva`. The `a` means alpha.

## Adding a new animated icon

You only need github.com. No code changes.

1. Build the master by following the [house rules](docs/house-rules.md). They're short, and the app depends on them.
2. On the repo's page on github.com, open the `icons` folder.
3. For a **new icon**: click **Add file > Upload files** and drag in a folder named after the icon (for example `growth-1`) containing:
   - `source/growth_1.svg`: the original from the [Huron brand hub](https://brandhub.huronconsultinggroup.com/design-system/brand-overview), unedited
   - `growth-1_<animation-name>.svg`: one master per animation

   For a **new animation of an existing icon**: open that icon's folder and upload just the master.
4. Type a short note in the **Commit changes** box (for example "Add growth-1 rise animation") and click **Commit changes**.
5. Wait a few minutes. The **Actions** tab shows the run. When it has a green tick, refresh the app and the animation is in the list.

If the run shows a red cross, the master didn't pass the checks. Click the run, then **Summary**: it lists, in plain English, what to fix in which file. Valid icons are still published; only the broken master is left out until it's fixed. To fix it, open the file on github.com, click the pencil to edit, or upload a corrected copy with the same name.

To **remove** an animation, open the file on github.com, click the **...** menu and choose **Delete file**, then commit. It disappears from the app on the next run, and its pre-rendered files are deleted too.

## How pre-renders work

The most common exports download instantly because they're made in advance: every animation in its default color (Aubergine 700) at 1080p and 4K, at 23.976 and 29.97. That's four files per animation.

- Every time something is pushed to the `main` branch, the **Build and deploy** workflow renders them with the same renderer the app uses, in a headless Chrome browser, and encodes them with ffmpeg using exactly the same ProRes settings.
- Only new or changed masters are rendered again, so most runs take a couple of minutes. A run that renders new icons takes longer (roughly a minute or two per animation).
- The files are stored as assets on a release called **Pre-rendered exports** (tag `prerenders`), not in the repo, because the 4K files are around 50 MB each. You'll see it under **Releases** on the repo's main page. Please don't edit or delete its files by hand. If you do, the next run puts things right.
- Files for deleted or broken masters are removed automatically.
- Any other color, size or frame rate renders in the browser on demand.

## Troubleshooting

**A new icon doesn't appear in the app.** Open the **Actions** tab. If the latest run is still going, wait for it. If it has a red cross, open it and read the **Summary**. If it has a green tick, refresh the app with Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac).

**The run failed with "Resource not accessible by integration" or the summary says it couldn't open the release.** Go to **Settings > Actions > General > Workflow permissions**, choose **Read and write permissions**, click **Save**, then go to **Actions**, open the failed run and click **Re-run all jobs**.

**The run failed at "Set up GitHub Pages" or "Publish" ("Get Pages site failed", "Not Found").** Pages isn't switched on yet. Go to **Settings > Pages** and set **Source** to **GitHub Actions** (step 3 of the setup below), then re-run.

**The app's address shows a 404 page.** The first deployment can take a few minutes after the run finishes. Check the address in **Settings > Pages**.

**An instant download opens a GitHub 404 page.** The repo is private and you're not signed in to GitHub, or your account doesn't have access to the repo. Sign in and try again.

**"Your browser ran out of memory."** Close other tabs and try again. 4K renders of long animations need the most memory; if 4K keeps failing, render 1080p, or ask for the color to be pre-rendered.

**A render is very slow.** In-browser renders take from tens of seconds (1080p) to a few minutes (4K). Keep the tab in front if you can; some computers slow down background tabs.

**The page says it's built for Chrome and Edge.** Rendering is only tested in Chrome and Edge. Open the same address in one of those.

**The button says "Render and download" for Aubergine 700.** The pre-render for that animation isn't ready yet (the run may still be going) or it failed. Check the latest run's summary. You can still render it in the browser.

## First-time setup on GitHub

You'll do this once. It takes about 15 minutes plus waiting time. Use Chrome or Edge on a computer.

### 1. Create the repo

1. Sign in to [github.com](https://github.com). If your team uses an organization account, switch to it.
2. Click **+** (top right) > **New repository**.
3. **Repository name:** for example `animated-icons`. This becomes part of the app's address.
4. Choose **Public** or **Private**:
   - **Public** works on any GitHub plan. Anyone with the link can see the app, the icons and the pre-rendered files.
   - **Private** needs a paid GitHub plan for Pages (Pro, Team or Enterprise). Instant downloads then only work for people signed in to GitHub with access to the repo. On GitHub Enterprise Cloud, your admin can also make the site itself visible only to your organization.
5. Leave **Add a README** unticked. Click **Create repository**.

### 2. Upload the files

The zip you were given contains the whole repo. Unzip it first.

1. On the new repo's page, click the **uploading an existing file** link (or **Add file > Upload files**).
2. Open the unzipped folder, select **everything inside it** (not the folder itself), and drag it onto the upload page. Folders upload with their contents.
3. **Important: check the `.github` folder is included.** Its name starts with a dot, so your computer may hide it:
   - **Mac:** in Finder, press **Cmd+Shift+.** (period) to show hidden files, then select everything again.
   - **Windows:** it's usually visible. If not, in File Explorer choose **View > Show > Hidden items**.
4. In **Commit changes**, type "Initial upload" and click **Commit changes**. Wait for the upload to finish.
5. Check the repo's main page shows these folders: `.github`, `app`, `docs`, `icons`, `scripts`, plus `README.md`, `package.json` and `package-lock.json`.

If the `.github` folder still didn't upload, create the file by hand: click **Add file > Create new file**, type `.github/workflows/build-and-deploy.yml` as the name (the slashes create the folders), paste in the contents of that file from the zip (open it with a text editor), and click **Commit changes**.

### 3. Switch on GitHub Pages

1. Click **Settings** (on the repo, not your account), then **Pages** in the left menu.
2. Under **Build and deployment > Source**, choose **GitHub Actions**. There's nothing to save; it applies straight away.

### 4. Check the Actions permissions

1. In **Settings**, open **Actions > General**.
2. Under **Actions permissions**, make sure Actions are allowed. If your organization restricts actions, ask an admin to allow GitHub's own actions (`actions/*`).
3. Under **Workflow permissions**, choose **Read and write permissions** and click **Save**. (The workflow asks for what it needs, but some organizations limit it here.)

### 5. Run it for the first time

1. Click the **Actions** tab. If GitHub asks you to enable workflows, click the green button.
2. Click **Build and deploy** on the left, then **Run workflow > Run workflow**. (Uploads to `main` start it automatically from now on.)
3. The first run takes longer, around 15 to 25 minutes, because it pre-renders every animation. Later runs only render what changed.
4. A green tick means it worked. A red cross: click the run and read the **Summary**, then see [Troubleshooting](#troubleshooting).

### 6. Open the app

- **Settings > Pages** shows "Your site is live at ..." with the address, or
- open the finished run and click the link under **Publish to GitHub Pages**.

Bookmark it and share it with the team.

### Where to see results later

- **Actions** tab: every run, newest first. Click a run, then **Summary** for the icon check and pre-render report.
- **Releases** (right side of the repo's main page): the **Pre-rendered exports** release with the instant-download files.

## Repo layout

```
.
├── README.md                       This file
├── package.json, package-lock.json Pinned tools for the workflow (don't edit by hand)
├── .github/workflows/
│   └── build-and-deploy.yml        Checks, pre-renders and publishes on every push to main
├── app/                            The export app (see app/README.md)
├── scripts/                        The workflow's steps (see app/README.md)
├── docs/
│   ├── house-rules.md              How every animated icon must be built
│   └── project-summary.md          How the first icon was made, and what we learned
└── icons/
    └── decision-1/
        ├── source/decision_1.svg   Original from the brand hub. Never edited.
        └── decision-1_*.svg        Animated masters, one per animation
```

## Export specs

| | |
|---|---|
| Format | QuickTime `.mov`, Apple ProRes 4444 with alpha |
| Background | Transparent |
| Sizes | 1080p (1920 × 1080), 4K UHD (3840 × 2160) |
| Frame rates | 23.976 (default), 24, 25, 29.97, 30 |
| Length | Animation length plus a 0.75 s hold on the finished icon |
| Placement | Centered. Artwork fits within 62.5% of frame width and 70% of frame height |
| File size | Roughly 20 to 60 MB at 1080p and 45 to 120 MB at 4K, depending on length, color and motion |

## Brand colors

The app offers the Huron Brand 2026 palette, with **Aubergine 700 (`#5D013A`)** as the default. Use White, Ecru or Mint 300 over dark footage, and Aubergine, Stone or Mint 700 over light footage. Mint 300 is never used on light backgrounds. The full list with hex values is in the [house rules](docs/house-rules.md#color-options-for-the-app); the app's copy of the list is `app/lib/colors.js`.

## Large files

ProRes files are big. Don't commit `.mov` exports to this repo. Pre-renders live on the `prerenders` release, and `.gitignore` keeps local exports out:

```
exports/
*.mov
```

## Background

The first icon, `decision-1` with the "weigh the options" animation, is documented step by step in the [project summary](docs/project-summary.md), including how it was built, how it was checked against the original artwork, and why exported files can look black in some players.
