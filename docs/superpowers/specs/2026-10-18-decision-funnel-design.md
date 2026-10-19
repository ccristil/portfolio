# Decision Funnel — Design

**Date:** 2026-10-18
**Status:** Approved design, pending implementation plan

## Goal

Replace interlude 2's particle shape ("decide what's worth building,") with a funnel you fly *through*, the way the "Inside the ruby." scene on tigris.lorolabs.ai puts you inside the stone. The current shape is a flat field of dim dots with one bright cluster. The new one keeps the same idea, many options narrowing to one choice, but you travel down it as you scroll.

## The experience

1. **Entering** (from the dust at the end of Portfolio): the dust gathers into a ring that frames the screen. You're looking down the mouth of a funnel.
2. **Flying in** (while the caption stays stuck near the bottom of the screen): you move forward. Faint ring bands on the walls stream past the edges of the screen, which gives the sense of speed. Dim "option" dots float inside the funnel. They're dense near the mouth and thin out with depth, so options drop away as you go. The walls narrow.
3. **Arriving:** the bright cluster at the tip fills the middle of the screen. That's the choice.
4. **Leaving** (start of Skills): the funnel breaks back into dust through the usual morph.

The caption, the sentence dock and the other interludes don't change.

## Approach

The flight is built into the existing engine as a per-shape **travel** setting. The camera stays still. While the funnel is held on screen, scroll progress slides the shape toward the camera, so its walls pass you. We rejected two alternatives:

- **Moving the camera:** it looks the same, but every shape's sizing (`computeScales`) assumes the camera is fixed at `z = 6`.
- **A separate pinned Three.js scene with bloom (the Tigris approach):** it adds a second WebGL context, a handoff between canvases, and roughly twice the code for one interlude.

## Changes

### `assets/particles/story-shapes.js`: `decision()` becomes a funnel

- **Geometry:** a cone along −z. The mouth (wide, near the camera) sits at the front and the tip (narrow) at the back, at `z = −L`. Dots are allocated about like this:
  - **Walls (~55%):** points on the cone surface. Some are gathered into evenly spaced ring bands that are slightly brighter, and those bands carry the sense of speed. Brightness rises gently toward the tip.
  - **Options (~30%):** dim points scattered inside the cone's volume. They're denser near the mouth and thin out with depth.
  - **Choice (~1 in 7, about 14%):** a tight, bright cluster at the tip, like the current `focus` cluster.
- **Settings:** `flyTo` (the shape-space depth of the tip, where the flight ends) and `fit: "cover"` so the mouth frames the viewport at travel 0. The engine works out the slide distance from `flyTo`, so the tip cluster ends centered and large, not passed, at any screen size.
- The function name `decision` and its place in `SHAPES` stay the same, so the stops table only changes positions.

### `assets/particles/particles.js`: travel support

- New per-shape option `flyTo`. Having it makes a shape a fly-through shape. `setState(from, to, t, travel = 0)` gains a `travel` argument from 0 to 1. Each loaded fly-through shape is slid toward the camera by `(camera z − 2.5 − flyTo × scale) × travel` world units, through uniforms `uFlyA`/`uFlyB`. Shapes without `flyTo` are unaffected.
- The vertex shader adds the slide to `z` after scaling, so the shape moves toward the camera.
- **Passing the camera:** dots fade out as `−mv.z` drops below about 1.5 units, and anything at or behind the camera is hidden (zero size). Without this, the point size (`∝ 1 / −mv.z`) would blow up into huge blobs.
- **Calmer motion on this shape:** the slow xz sway and the cursor push are scaled down while a travel shape is on screen. Otherwise the sway rotates a long tunnel around the origin and swings its far end across the screen.

### `assets/particles/timeline.js`: partway stops

- `stopY` accepts a number from 0 to 1 for `at` (a fraction of the element's height) in addition to `"start" | "center" | "end"`. `stateAt` doesn't change.

### `assets/particles/story.js`: stops and travel wiring

- The interlude-2 stops become two funnel stops partway through the section, for example:
  ```
  ["#portfolio", "end", "dust"],
  ["#interlude-decide", 0.25, "decision"],  // morph in: dust → funnel mouth
  ["#interlude-decide", 0.75, "decision"],  // hold: flight
  ["#skills", "start", "dust"],             // morph out
  ```
  The exact fractions get tuned visually.
- Travel each frame comes from the fly-through shape's two stops: 0 before the first (during the morph in), progress between them during the flight, and 1 after the second (during the morph out, so the funnel leaves from the tip view and doesn't snap back to the mouth).
- The stop validation accepts numeric `at` values in [0, 1].

### `index.html`: interlude height

- `#interlude-decide` grows from `180vh` to `280vh` (with an `svh` twin, as now) so the flight has room. Only this interlude changes, through a modifier class (`interlude--decide`), matching the existing `interlude--properly` pattern. The extra height applies only under `html.has-particles`, so without particles the section stays the same as today.

## Reduced motion

There's no flight: travel stays fixed at a still view looking down the funnel (about 0.3). The existing crossfade handles the morphs in and out.

## Fallbacks

There's no new failure path. Any throw still drops to the plain hero through the existing `story.js` handling. Without particles, the interlude keeps its current height.

## Out of scope

- Bloom or post-processing.
- Pointer-steered light (the Tigris ruby's interaction).
- Any change to the other shapes, captions, the sentence dock, or `llms.txt` (the copy doesn't change).

## Verification

- Serve the site locally, then take headless Chrome screenshots at `?stage=` values across the morph in, the flight (several points) and the morph out, desktop and phone widths. Block PostHog and GA URLs before loading. The CDP harness `shoot.mjs` can be restored from commit `0b5d55b`.
- Check that no blobs appear when dots pass the camera, that the tip cluster ends centered, that scrolling back up reverses cleanly, and that `?stage=` jumps land correctly.
- Check reduced motion (the still funnel view) and the phone particle count (18k).
- Per CLAUDE.md: show diffs before applying, no commits.
