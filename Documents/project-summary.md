# Project summary: animating the decision icon

This document records how the first animated Huron icon was made, what was delivered and what we learned along the way. The lessons here became the [house rules](house-rules.md).

## The brief

- **Icon:** `decision_1.svg` from the Huron icon library. A person in the middle, a circle with an X on the left, a circle with a check on the right.
- **Goal:** an animate-in (no loop for now) that is smooth and professional.
- **Hard constraint:** the icon is not redrawn or changed in any way. Motion only.
- **Ask:** three strong concepts, including a refined version of the original idea (pop in the person, then the X circle, then the check circle), plus one standout "wildcard" concept.

## Step 1: Understanding the source file

The source SVG is small and simple:

- `viewBox="0 0 69.197 43.523"`
- One color, Aubergine 700 (`#5D013A`).
- The whole icon is **one single compound path**: every shape lives in one `<path>` element.

One path can only move as one piece, so the X circle can't pop in separately. The way around this without touching the drawing came from how the path is written. A compound path is a list of closed shapes (subpaths), each starting with an `M` (move to) command. This file has nine:

| Subpaths | Piece |
|---|---|
| 1, 2 | Head (outer and inner edge of the ring) |
| 3, 4 | Right ring |
| 5 | Check mark |
| 6, 7 | Left ring |
| 8 | Body |
| 9 | X mark |

We split the path at those existing `M` commands into **six pieces**: head, body, left ring, X, right ring, check. Rings stayed as pairs, because a ring is an outer edge plus an inner edge and only fills correctly when both are in the same path. No coordinate was changed. Joining the six pieces back together gives the original path data exactly, character for character.

**Verification:** we rendered the original file and the split version at 1384 px wide and compared every pixel. The largest difference was 8 out of 255, on a few edge pixels, from edge smoothing being calculated per piece instead of once for the whole icon. Visually identical.

## Step 2: Four concepts

All four use only movement, scaling, fading and reveal masks on the six original pieces. All are CSS keyframe animations.

### Concept 1: Sequential pop (the original idea, refined)

The person pops in, then the X option, then the check option. Each has a slight overshoot and settles, so it reads as confident rather than bouncy. Left-to-right order lands the check last, which reads as the answer.

- Length 1.3 s. Easing: back out, `cubic-bezier(.34, 1.56, .64, 1)`.
- Order: person at 0 s, X group at 0.45 s, check group at 0.75 s.

### Concept 2: Branch out

The person rises into place, then both options slide out from behind the person to their positions. The choices visibly come from the person.

- Length 1.5 s. Person: 3-unit rise with fade, quint out. Options: start at the person's center at 45% scale, travel out with expo out, `cubic-bezier(.16, 1, .3, 1)`.
- Order: person at 0 s, X at 0.4 s, check at 0.52 s.

### Concept 3: Drawn on

The icon appears as if sketched. Body rises from its baseline, head and rings sweep around like a pen (mirrored: X ring counter-clockwise, check ring clockwise), the X grows from its center and the check is written left to right.

- Length 2.0 s. Pen sweeps use cubic in-out; reveals use quint out.
- Built entirely with **reveal masks**: the artwork itself never moves or scales.

### Concept 4: Weigh the options (the wildcard, and the one chosen)

The person becomes the pivot of a balance scale. Empty rings appear. The X side dips as the X pops in, then the check side dips as the check is written. The scale settles level with a damped sway while the head glances toward each side.

| Time | What happens |
|---|---|
| 0 to 0.6 s | Person rises 3 units into place and fades in |
| 0.35 to 0.9 s | Both empty rings scale up from 70% and fade in |
| 0.95 s | Balance starts. Left side dips 2.2 units, right side rises 2.2 units, head glances 0.6 units left |
| 1.22 s | X pops in (back out) |
| 1.8 to 2.3 s | Balance swings: right side dips, head glances right |
| 1.95 s | Check is written left to right (mask wipe) |
| 2.3 to 3.25 s | Damped settle: 1.0, then 0.45, then 0.15 units, then level. Head returns to center |

- Sway easing: `cubic-bezier(.45, 0, .55, 1)`.
- The pans move straight up and down rather than rotating, like real hanging scale pans, so the X and check stay upright.

## Step 3: Review page

We built a branded review page showing all four concepts side by side:

- Huron Brand 2026 colors and embedded brand fonts (Bricolage Grotesque, Roboto), Huron wordmark, light and dark mode.
- Each concept plays when scrolled into view, with a Replay button, a Play all button and a slow-motion toggle (2.5× slower) for studying the easing.
- Each card lists length, easing curves and order so the team can rebuild a concept in After Effects if needed.

We also exported each concept as a standalone animated SVG that plays once when loaded in a browser.

**Final-frame check:** we confirmed that the last frame of every concept lands exactly on the original artwork.

## Step 4: Export for Premiere Pro

Concept 4 was exported as a video with a transparent background.

**How it was made:**

1. The animated icon was placed on a 1920 × 1080 transparent page, centered, with the artwork 1200 px wide.
2. Headless Chrome loaded the page, started the animation, and immediately paused it.
3. For each frame, the animation clock was set to that frame's exact time and a PNG was captured with a transparent background.
4. ffmpeg combined the PNGs into ProRes 4444 with alpha.

**What was delivered:** `decision-icon-weigh-the-options-1080p-alpha.mov`

| | |
|---|---|
| Codec | Apple ProRes 4444 (`ap4h`) with alpha |
| Size | 1920 × 1080 |
| Frame rate | 29.97 fps (needs re-exporting at the new 23.976 default) |
| Length | 4.0 s: 3.25 s of animation plus a 0.75 s hold, 120 frames |
| File size | About 50 MB |

## Step 5: The black background report

After downloading the `.mov`, the background looked black instead of transparent. We checked the file:

- Codec tag `ap4h` (ProRes 4444) and pixel format `yuva444p12le`. The `a` means the file stores an alpha (transparency) channel.
- The QuickTime header's depth field is 32, which is how apps like Premiere know to look for alpha.
- We extracted the alpha channel of the last frame: 93% of pixels are fully transparent and only the icon's pixels are solid.

**Conclusion:** the file is transparent. The black comes from the preview app. QuickTime Player, Finder's Quick Look, VLC and the Windows media players all display transparency as black. In Premiere, place the clip above other footage or turn on the Program Monitor's Transparency Grid to see it. If it still shows black over footage, check **Modify > Interpret Footage** and make sure **Ignore Alpha** is off.

## What we learned

**Artwork**

- Brand icons arrive as one compound path, but they're already made of separate closed shapes. Splitting at the existing `M` commands gives animatable pieces with zero changes to the drawing.
- Rings must stay as outer-plus-inner pairs in one path, or they fill in solid.
- Drawing pieces separately changes edge smoothing very slightly (up to 8/255 on edge pixels). That's the only acceptable difference.

**Motion**

- Overshoots and sways travel outside the icon's original box. The SVG needs `overflow="visible"`, and the video canvas needs room around the icon, or motion gets clipped.
- Scale pans that move vertically read better than a rotating beam, because the marks stay upright.
- The pen-sweep mask left a hairline seam where the sweep started and ended. Fixed by switching the mask stroke to a solid (no dashes) at the very end of the sweep.
- Driving everything through one CSS speed variable made slow-motion review trivial.

**Rendering and export**

- CSS keyframe animations can be paused and stepped to any exact time, which makes frame-perfect, repeatable exports possible. JavaScript-driven or SMIL animation would not be as reliable.
- Chrome draws moving pieces on their own layers and may place them up to about a quarter pixel off from the static artwork. That's invisible in motion, but held frames should be rendered from the static icon so they match the artwork exactly. (The delivered `.mov` holds on a frame with this tiny offset; the next export will use the fix.)
- ProRes 4444 is the reliable transparent format for Premiere. Most preview apps show its transparency as black, which is easy to mistake for a broken file.
- Exact fractional frame rates matter: 23.976 is really 24000/1001 and should be used that way.

**Tooling**

- The Huron brand skill covers decks, documents and web pages but not motion. These house rules fill that gap for animated icons.

## What comes next

1. Convert the decision icon masters to the house-rules format: `currentColor` fills, color on the root, `data-` settings, `part-` and `move-` naming. The four standalone SVGs from this round predate the rules and hard-code the color on each path.
2. Build the small app: brand color picker plus custom hex, 1080p or 4K, frame rate (23.976 default), transparent ProRes 4444 export.
3. Re-export concept 4 at 23.976 fps, plus a white version for dark footage.
