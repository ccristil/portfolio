# Orca Pod: Design

**Date:** 2026-10-19
**Status:** Built. Prototype in `dev/orcas.html`; wired into the live story via `story.js` on 2026-10-19 (uncommitted).

## Goal

A pod of four orcas swims past the iceberg in interlude 1 ("I find out what people actually need,"). The scene starts empty, the pod enters from the left, passes in front of the berg, leaves, comes back from the right passing behind the berg (seen dimly through the ice), and leaves again. The frame is sometimes empty.

## The experience

| Pod clock | What's on screen |
|---|---|
| 0–3 s | Empty |
| 3–15 s | Pass 1: left → right, **in front** of the berg (nearer the camera, slightly larger) |
| 15–18 s | Empty |
| 18–30 s | Pass 2: right → left, **behind** the berg (farther, smaller, dimmed where it crosses the berg) |
| 30 s | Repeat from 0 |

- The pod clock only runs while the berg is fully formed (its morph is inside the engine's 8% hold). Scrolling part-way off pauses it. Once the berg is completely gone, the clock resets, so coming back always starts empty.
- The orca layer's brightness follows the berg's presence, so it fades out with the berg.
- Pass start and end points are worked out from the current viewport, so the pod always starts and ends fully off-screen at any width.
- All timings are constants at the top of the module.

## The orcas

Built in code, faceted like the iceberg: a stack of 8-sided rings joined by flat faces, with dots on the faces and a few more on the edges. The body points along +x (nose forward). Units are the iceberg's raw units (waterline at y = 0).

- **Body:** ~10 rings. Widest about a third of the way back, then a sharp taper to a thin tail stalk. Deep-bodied (rings a little taller than wide). Short, blunt head.
- **Dorsal fin:** ~40% back. The bull's is a tall, straight triangle (~20% of L). The females' are shorter (~14% of L) and swept back. The fin rims are bright, so the shapes read against the dark.
- **Pectoral fins:** rounded paddles low on each side, ~25% back.
- **Flukes:** horizontal, ~25% of L across, notched in the middle.
- **Markings (as brightness):**
  - body mid-dim (~0.3–0.45)
  - **eye patch** bright (~0.85)
  - **belly and the flank sweep behind the dorsal fin** bright (~0.75)
  - **saddle patch** grey (~0.58)
  - any point above the waterline gets the berg-tip brightness
- **Dot density follows brightness** (like `sampleCanvas`): the white markings come out dense and the black body a sparse silhouette.
- **Pod:** a bull (L ≈ 0.62), two females (L ≈ 0.5), and a calf (L ≈ 0.3) riding just under its mother. About 3,000 points on desktop and 1,400 on mobile, split by size. The berg keeps all of its points.

## Motion

- **The path meanders.** The lead's line drifts gently up and down and weaves in and out in depth, and it is always bowed away from the berg, never toward it. Each pass meanders differently.
- **Follow the leader.** The bull leads. One female follows with the calf under her, and the second female trails behind them. They follow the lead's path a little way behind, not as a rigid block, so the pod snakes along the same curves. Their spacing drifts slowly, so the pod loosens and tightens.
- **The spine follows the path:** each orca's body is placed along its own stretch of the path, on 9 points from nose to tail. It bends through turns and climbs, the head leads, and the tail traces the line the head swam. Each orca also leans into turns (about 6° typically, 11° at most).
- **Speed:** one crossing takes about 12 s, with the surges described below.
- **Bank:** the camera sits level with the pod, which would show the horizontal flukes edge-on. Each orca banks slightly (~16°) with its belly toward the camera, which shows the flukes and the white belly.
- **Swim stroke:** an up-and-down body wave that runs back along the body. The head rocks only slightly, the motion is smallest just behind the head and builds toward the flukes. The flukes trail the tail stalk by a quarter beat: tips up on the downstroke, down on the upstroke.
- **The tail drives the swimming:** the beat is tied to distance swum, so the body wave always runs back 1.4× faster than the orca moves forward. Against the water, the wave travels backward, so the tail reads as pushing. Faster swimming and smaller bodies beat faster: on desktop about 1.4 s per beat for the bull, ~1.1 s for the females and ~0.7 s for the calf.
- **Cause and effect:** the lead surges and eases by about ±15%. Strokes are hardest while it speeds up. Each orca coasts in a short glide as it slows, about 13% of the time, at staggered moments.
- **Pectoral fins** paddle gently with the stroke and dip into turns.
- **Drift:** orca points drift through the same flow field as the berg's particles, at about 40% of the berg's drift, and a few sparkle the way the berg's do. Reduced motion turns both off.
- **Depth:** the pod cruises just under the surface (y ≈ −0.3). Once per pass the bull rises for ~2.4 s and its fin tip breaks the waterline:
  - pass 1: near the berg, in front of it
  - pass 2: between the berg and the screen edge, so the fin isn't hidden behind the berg's tip
- The orcas don't spin with the berg, and the mouse doesn't push them.
- The pass depth is worked out from the berg's own outline, so no orca ever swims through the ice.

## Passing behind the berg

When the layer is created, it measures the berg's widest radius from the turning axis at each of 16 heights. It uses the berg's actual points, so the outline covers every angle the berg spins through. The shader projects each orca point back to the berg's centre plane, with perspective. If the point is behind the centre and inside the outline at that height, it drops to ~55% brightness, with a soft edge. The berg's own glow sits on top, so pass 2 reads as orcas seen through the ice.

## Architecture

- **`assets/particles/orca-pod.js`** (new, pure, runs in Node):
  - `POD`: the four orcas and their formation
  - `orca(spec, count)`: the model builder
  - `podAt(seconds, view)`: the schedule and per-orca pose
  - `bergProfile(shape)`: the outline radii
  - `presenceOf(state, index)`: how much a shape is showing
- **`assets/particles/orcas.js`** (new, browser): `createOrcaLayer(field, { shapeIndex, shape, count, reducedMotion })` adds a separate `THREE.Points` to the field's scene. Its vertex shader bends and places each orca from per-orca uniforms, and it reuses the engine's fragment shader. API:
  - `update(presence)`, called once a frame; it measures its own time step and caps it at 0.05 s
  - `setSpeed(x)`
  - `uniforms`, exposed for tuning pages
  - `setClock(seconds, frozen)`
  - `info()`
  - `dispose()`
- **`assets/particles/particles.js`** (additive): exports `fragmentShader` and `noiseChunk` (the flow-field GLSL, which the berg's shader now includes from there; its text is unchanged). It also returns `scene`, `camera` and `shapeScale(i)`. Existing behaviour doesn't change.
- **`assets/particles/shapes.js`** (additive): `fromFunction` shapes also carry `frame: { cx, cy, s }`, the centring and scale used to normalise them. Raw shape coordinates map to shape space as `((x − cx)·s, (y − cy)·s, z·s)`.
- **`story.js`:** about 15 lines to create the layer, feed it `presenceOf(stateAt(...))`, and dispose of it with the field.

## Fallbacks

- If the orca layer throws, the console logs a warning and the story carries on without orcas.
- **Reduced motion:** the pod is held still partway through pass 1, with no tail beat. It fades with the berg.
- **Mobile:** ~1,400 points, same schedule.
- **Background tab:** the layer caps its frame step at 0.05 s, so the pod doesn't jump.

## Checks

No test files are added to the repo.

- `node -e` checks on `podAt`:
  - empty at 1 s
  - the bull's nose at the left edge at 3 s
  - every tail off-screen at the end of each pass
  - empty at 1 s and 16.5 s
  - wraps at 30 s
  - only the bull's fin ever breaks the surface
  - no orca enters the berg's lane
- `node -e` checks on `orca()`:
  - exact point count
  - brightness in range
  - the bull's fin taller than a female's
  - the calf the smallest
- Headless Chrome screenshots of `dev/orcas.html?orcas=T&freeze=1` at T = 1, 9.5, 22 and 26:
  - desktop
  - mobile at 390 px
  - reduced motion

## Prototype page

`dev/orcas.html` shows the iceberg (and dust, for testing the scroll away and back) with the orca layer, the interlude caption, and a small control panel:

- the current time and pass
- Restart
- Skip to pass 2
- Scroll away / back
- 3× speed

URL options:
- `?orcas=T` sets the clock
- `freeze=1` stops it
- `hud=0` hides the panel
- `reduced=1` previews reduced motion
- `inspect=1` hides the berg and lines the four orcas up close; `yaw=` turns them
