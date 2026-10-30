# Huron animated icons

A simple app for exporting Huron's animated icons as video files for Premiere Pro.

Each icon has one approved animation, built from the original brand artwork without redrawing it. The app lets you choose the color, size and frame rate, and exports a transparent `.mov` that drops straight onto a timeline.

Use the app in **Chrome or Edge**.

## How to use it

1. **Icon.** Choose an icon from the list on the left. Its animation plays in the preview.
2. **Color.** Click a brand color, or type a 6-digit hex value under **Custom hex**. Colors marked with a moon work best on dark footage; choosing one switches the preview to a dark background.
3. **Output.** Choose **1080p** or **4K**, and a frame rate. 23.976 and 29.97 are shown; 24, 25 and 30 are under **Other frame rates**.
4. **Export.** Click the red button.
   - **Download** means the file is ready and downloads straight away.
   - **Render and download** means your browser makes the file. It shows how long it should take, a progress bar and a Cancel button. Keep the tab open until it finishes. The file downloads automatically, and **Download again** stays available.

Use **Light**, **Dark** and **Transparent** above the preview to check the icon on different backgrounds, and drag the slider under the preview to step through it frame by frame. The preview shows the icon exactly where it sits in the exported frame.

The app remembers your last color, size and frame rate.

## File names

Exports are named:

```
<icon>_<animation>_<color>_<size>_<rate>.mov
```

For example:

```
decision-1_weigh-the-options_white_4k_23976.mov
decision-1_weigh-the-options_custom-1A2B3C_1080p_2997.mov
```

## Using an export in Premiere Pro

1. Import the `.mov`.
2. Place it on a track **above** your footage or background.
3. Scale and position it like any other clip. The icon is centered in a full 16:9 frame, so it lines up with no adjustment.
4. To keep the finished icon on screen longer, right-click the last frame and choose **Add Frame Hold**.

## Looks black in QuickTime?

That's normal. The file is transparent. QuickTime Player, Finder's Quick Look, VLC and the Windows media players can't show transparency, so they display it as black.

- In Premiere, put the clip over other footage, or turn on **Transparency Grid** in the Program Monitor's settings (wrench) menu.
- Still black over footage? Right-click the clip in the Project panel, choose **Modify > Interpret Footage**, and make sure **Ignore Alpha** is not checked.

## Choosing a color

The app offers the Huron Brand 2026 palette, with **Aubergine 700 (`#5D013A`)** as the default.

- Over **dark footage**, use White, Ecru or Mint 300. Butterscotch 500 works for emphasis.
- Over **light footage**, use Aubergine, Stone, Mint 700 or Butterscotch 700.
- **Mint 300** is never used on light backgrounds.
- **Guava** is the brand's action color, so use it sparingly.

## Export specs

| | |
|---|---|
| Format | QuickTime `.mov`, Apple ProRes 4444 with transparency |
| Sizes | 1080p (1920 × 1080), 4K UHD (3840 × 2160) |
| Frame rates | 23.976 (default), 24, 25, 29.97, 30 |
| Length | The animation plus a 0.75 s hold on the finished icon |
| Placement | Centered in a full 16:9 frame |
| File size | Roughly 20 to 60 MB at 1080p and 45 to 120 MB at 4K |

## If something goes wrong

- **"Your browser ran out of memory."** Close other tabs and try again. If 4K keeps failing, export 1080p.
- **A render is slow.** In-browser renders take from tens of seconds (1080p) to a few minutes (4K). Keep the tab in front if you can.
- **A notice says the app is built for Chrome and Edge.** Open the app in one of those browsers.
- **A Download button opens a sign-in or "not found" page.** Sign in to GitHub with an account that has access, then try again.
