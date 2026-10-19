# Decision Funnel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace interlude 2's flat "decision" particle field with a funnel the viewer flies through while scrolling ("decide what's worth building,").

**Architecture:** The funnel is a normal procedural shape, long along −z, with a new `flyTo` setting. The engine (`particles.js`) gets a `travel` argument on `setState` that slides fly-through shapes toward the fixed camera, fades points as they pass it, and calms the sway and cursor push for these shapes. `story.js` drives travel from the funnel's two scroll stops, which now sit partway through the interlude (numeric `at` in `timeline.js`).

**Tech Stack:** Vanilla JS ES modules, Three.js 0.160 (import map, no build step), GLSL vertex shader, Node 24 for quick module checks, headless Chrome over CDP for screenshots.

**Spec:** `docs/superpowers/specs/2026-10-18-decision-funnel-design.md`

**House rules (CLAUDE.md):** never commit or push; the user does all git. Each task ends with "show the diff" instead of a commit. No test files are added to the repo (the user deleted the old node tests); checks are one-off `node -e` commands and screenshots.

**Paths used below:**
- Repo root: `/Users/cristiancruz/WebstormProjects/portfolio` (run every command from here)
- `SCRATCH=/private/tmp/claude-501/-Users-cristiancruz-WebstormProjects-portfolio/b22946c9-c223-4168-a881-8ed16e19b540/scratchpad` (this session's scratch dir; for the screenshot harness and output, never inside the repo)

---

## File map

| File | Change |
|---|---|
| `assets/particles/timeline.js` | `stopY` accepts a 0–1 number for `at` |
| `assets/particles/story-shapes.js` | `decision()` rewritten as a funnel with `flyTo` |
| `assets/particles/particles.js` | `flyTo` option, `travel` arg on `setState`, `uFly*`/`uCalm*` uniforms, near-camera fade |
| `assets/particles/story.js` | numeric-`at` validation, funnel stops, `travelAt()` wiring |
| `index.html` | `interlude--decide` class and taller height under `html.has-particles` |

---

### Task 1: Numeric `at` in `stopY`

**Files:**
- Modify: `assets/particles/timeline.js:11-16`

- [ ] **Step 1: Run the check and confirm it fails**

```bash
node --input-type=module -e 'import { stopY } from "./assets/particles/timeline.js"; const r = { top: 100, height: 400 }; console.log(stopY(r, 0, 200, 0.25), stopY(r, 0, 200, "start"), stopY(r, 0, 200, "center"), stopY(r, 0, 200, "end"));'
```

Expected now: `200 0 200 400` (0.25 falls through to "center").
Expected after the fix: `100 0 200 400`.

- [ ] **Step 2: Implement**

Replace the `stopY` comment and function in `assets/particles/timeline.js`:

```js
// The scrollY at which part of an element sits in the middle of the viewport.
// rect is a getBoundingClientRect() taken at the current scrollY.
// at is "start", "center", "end", or a 0–1 fraction of the element's height.
export function stopY(rect, scrollY, viewportH, at = "center") {
  const offset =
    typeof at === "number" ? rect.height * at
    : at === "start" ? 0
    : at === "end" ? rect.height
    : rect.height / 2;
  return rect.top + scrollY + offset - viewportH / 2;
}
```

- [ ] **Step 3: Run the check and confirm it passes**

Run the Step 1 command again. Expected: `100 0 200 400`.

- [ ] **Step 4: Show the diff**

```bash
git diff assets/particles/timeline.js
```

---

### Task 2: The funnel shape

**Files:**
- Modify: `assets/particles/story-shapes.js:45-59` (the `decision` function and its comment)

Geometry, before `normalize()`: mouth radius 1 at z = 0, tip at z = −6 with radius 0.08. `fromFunction` normalizes so max(width, height) = 1, which halves everything (mouth diameter 2 → 1), so the tip lands at z = −3 and `flyTo = −FUNNEL_LENGTH / 2`. One dot in 7 is the bright choice, two in 7 are dim options, four in 7 are wall points (40% of those snapped to ring bands).

- [ ] **Step 1: Run the check and confirm it fails**

```bash
node --input-type=module -e '
import { decision } from "./assets/particles/story-shapes.js";
const s = decision(40000);
let minZ = Infinity, maxZ = -Infinity, maxR = 0;
for (let i = 0; i < s.positions.length; i += 3) {
  const z = s.positions[i + 2];
  minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
  maxR = Math.max(maxR, Math.hypot(s.positions[i], s.positions[i + 1]));
}
console.log({ flyTo: s.flyTo, fit: s.fit, minZ: +minZ.toFixed(2), maxZ: +maxZ.toFixed(2), maxR: +maxR.toFixed(2), w: +s.aspect.w.toFixed(2), h: +s.aspect.h.toFixed(2) });'
```

Expected now: `flyTo: undefined`, `fit: 0.85`.
Expected after: `flyTo: -3`, `fit: 'cover'`, `minZ` about `-3.1`, `maxZ` about `0` (≤ 0.01), `maxR` about `0.5`, `w` and `h` both about `1`.

- [ ] **Step 2: Implement**

Replace the existing `decision` comment and function (from `// "decide what's worth building": a wide, dim field…` through the closing `}` of `decision`) with:

```js
// "decide what's worth building": a funnel you fly down. Dim options crowd
// its wide mouth and thin out with depth; the walls narrow to one bright
// choice at the tip. It's long along z, and story.js slides it toward the
// camera as you scroll (see `flyTo` in particles.js), so you travel through it.
const FUNNEL_LENGTH = 6; // the mouth's radius is 1
const FUNNEL_TIP = 0.08; // radius at the tip
const FUNNEL_RINGS = 14;
const funnelRadius = (u) => FUNNEL_TIP + (1 - FUNNEL_TIP) * (1 - u) ** 1.5; // u: 0 mouth … 1 tip

export function decision(count) {
  const shape = fromFunction(count, (i) => {
    const kind = i % 7;
    const a = Math.random() * Math.PI * 2;
    if (kind === 0) {
      // The choice: a tight, bright cluster at the tip.
      const r = 0.05 * Math.hypot(gauss(), gauss());
      return [r * Math.cos(a), r * Math.sin(a), -FUNNEL_LENGTH + gauss() * 0.05, 0.85 + Math.random() * 0.15];
    }
    if (kind <= 2) {
      // Options: dim points inside, crowded at the mouth, thinning with depth.
      const u = Math.random() ** 2.5;
      const r = funnelRadius(u) * 0.85 * Math.sqrt(Math.random());
      return [r * Math.cos(a), r * Math.sin(a), -u * FUNNEL_LENGTH, 0.1 + Math.random() * 0.25];
    }
    // Walls. Some gather into ring bands, which stream past as you fly.
    const ring = Math.random() < 0.4;
    const u = ring
      ? (Math.floor(Math.random() * FUNNEL_RINGS) + 0.5) / FUNNEL_RINGS + gauss() * 0.003
      : Math.random();
    const r = funnelRadius(u);
    const lum = (ring ? 0.5 : 0.15) + Math.random() * 0.25 + 0.2 * u;
    return [r * Math.cos(a), r * Math.sin(a), -u * FUNNEL_LENGTH, Math.min(1, lum)];
  });
  // normalize() scales the mouth's diameter (2) to 1, so the tip sits at -LENGTH / 2.
  shape.flyTo = -FUNNEL_LENGTH / 2;
  shape.fit = "cover";
  shape.loose = 0.6;
  shape.opacity = 0.8;
  return shape;
}
```

`gauss()` already exists at the top of the file. Leave it there.

- [ ] **Step 3: Run the check and confirm it passes**

Run the Step 1 command again. Expected: `flyTo: -3`, `fit: 'cover'`, `minZ` ≈ `-3.1`, `maxZ` ≈ `0`, `maxR` ≈ `0.5`, `w` ≈ `1`, `h` ≈ `1`.

- [ ] **Step 4: Show the diff**

```bash
git diff assets/particles/story-shapes.js
```

---

### Task 3: Fly-through support in the engine

**Files:**
- Modify: `assets/particles/particles.js` (header comment, vertex shader, uniforms, `setState`)

How it works: for a shape with `flyTo`, `setState(from, to, t, travel)` sets `uFlyA`/`uFlyB` to `(camera.z − FLY_STOP − flyTo × scale) × travel` world units, so at `travel = 1` the tip sits `FLY_STOP` (2.5) units in front of the camera. `uCalmA`/`uCalmB` are 1 for fly-through shapes and turn off the sway and cursor push. A near-camera fade hides points as they pass the camera. That fade also applies to every shape, but only points within 1.8 units of the camera are affected. Today that means only part of the birth shell, which starts 5–11 units out and used to draw oversized or garbage points near and behind the camera.

- [ ] **Step 1: Header comment.** In the options list at the top of the file, after the `loose` line, add:

```js
//   flyTo    shape-space z the camera flies to; makes it a fly-through shape
//            that setState's `travel` (0–1) slides toward the camera
```

- [ ] **Step 2: Shader uniforms.** In `vertexShader`, after `uniform float uLooseB;`, add:

```glsl
  uniform float uFlyA;
  uniform float uFlyB;
  uniform float uCalmA;
  uniform float uCalmB;
```

- [ ] **Step 3: Slide and calm.** In the shader's `main()`, replace:

```glsl
    vec3 a = spinY(aPosA, uTime * uSpinA * uAmbient) * uScaleA;
    vec3 b = spinY(aPosB, uTime * uSpinB * uAmbient) * uScaleB;
    vec3 p = mix(a, b, tp);
```

with:

```glsl
    vec3 a = spinY(aPosA, uTime * uSpinA * uAmbient) * uScaleA;
    vec3 b = spinY(aPosB, uTime * uSpinB * uAmbient) * uScaleB;
    // Fly-through shapes slide toward the camera as you scroll through them.
    a.z += uFlyA;
    b.z += uFlyB;
    vec3 p = mix(a, b, tp);
    // Fly-through shapes are long along z, so they skip the sway and the
    // cursor push; the sway would swing their far end across the screen.
    float calm = mix(uCalmA, uCalmB, tp);
```

- [ ] **Step 4: Calm the sway.** Replace:

```glsl
    float ang = sin(uTime * 0.25) * 0.22 * uAmbient;
```

with:

```glsl
    float ang = sin(uTime * 0.25) * 0.22 * uAmbient * (1.0 - calm);
```

- [ ] **Step 5: Calm the cursor push.** Replace:

```glsl
    float push = uMouseStrength * (1.0 - smoothstep(0.0, uMouseRadius, length(d)));
```

with:

```glsl
    float push = uMouseStrength * (1.0 - calm) * (1.0 - smoothstep(0.0, uMouseRadius, length(d)));
```

- [ ] **Step 6: Near-camera fade.** Replace:

```glsl
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
```

with:

```glsl
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    // Points fade out as they near the camera and vanish once they pass it;
    // otherwise the size falloff below would blow them up into huge blobs.
    float nearFade = smoothstep(0.6, 1.8, -mv.z);
```

Then replace:

```glsl
    vExposure = mix(mix(uExposureA, uExposureB, tp), 1.0, flight * 0.6)
      * mix(uOpacityA, uOpacityB, tp) * dip;
    gl_PointSize = uSize * uPixelRatio * (0.55 + vLum * 0.8 + vSpark * 1.6) * (6.0 / -mv.z);
```

with:

```glsl
    vExposure = mix(mix(uExposureA, uExposureB, tp), 1.0, flight * 0.6)
      * mix(uOpacityA, uOpacityB, tp) * dip * nearFade;
    gl_PointSize = uSize * uPixelRatio * (0.55 + vLum * 0.8 + vSpark * 1.6) * (6.0 / -mv.z);
    if (mv.z > -0.1) gl_PointSize = 0.0;
```

- [ ] **Step 7: JS uniforms.** In the `uniforms` object, after `uLooseB: { value: 1 },`, add:

```js
    uFlyA: { value: 0 },
    uFlyB: { value: 0 },
    uCalmA: { value: 0 },
    uCalmB: { value: 0 },
```

- [ ] **Step 8: `setState` with travel.** Replace the `setState` comment and function:

```js
  // Show the morph from shape `from` to shape `to`, t in 0…1.
  // Each shape is held still for the first and last 8% of t.
  function setState(from, to, t) {
```

with the following (the existing body lines stay; add the four `uFly`/`uCalm` lines at the end of the body, after the `uLooseB` line):

```js
  // A fly-through shape's flight ends with its `flyTo` depth this far in
  // front of the camera.
  const FLY_STOP = 2.5;
  function flyOffset(i, travel) {
    const { flyTo } = shapes[i];
    if (flyTo == null) return 0;
    return (camera.position.z - FLY_STOP - flyTo * shapeScales[i]) * travel;
  }

  // Show the morph from shape `from` to shape `to`, t in 0…1.
  // Each shape is held still for the first and last 8% of t.
  // travel (0…1) is how far through any fly-through shape the camera has flown.
  function setState(from, to, t, travel = 0) {
```

and, as the last lines inside `setState`:

```js
    uniforms.uFlyA.value = flyOffset(from, travel);
    uniforms.uFlyB.value = flyOffset(to, travel);
    uniforms.uCalmA.value = shapes[from].flyTo == null ? 0 : 1;
    uniforms.uCalmB.value = shapes[to].flyTo == null ? 0 : 1;
```

`setProgress` calls `setState(i, j, f)`, so travel defaults to 0 there. That's fine; nothing calls `setProgress` with a fly-through shape.

- [ ] **Step 9: Syntax check**

```bash
node --check assets/particles/particles.js && echo OK
```

Expected: `OK`. (The GLSL is checked by the browser in Task 5; a shader compile error shows up in the screenshot console log as a THREE.WebGLProgram error.)

- [ ] **Step 10: Show the diff**

```bash
git diff assets/particles/particles.js
```

---

### Task 4: Wire the story and the interlude height

**Files:**
- Modify: `assets/particles/story.js` (STOPS, validation, `measure`, loop)
- Modify: `index.html:643-647` (CSS) and `index.html:1203` (section class)

- [ ] **Step 1: Stops.** In `STOPS`, replace:

```js
  ["#interlude-decide", "center", "decision"],
```

with:

```js
  // The funnel forms a quarter of the way in, then you fly down it until
  // three quarters of the way (see travelAt).
  ["#interlude-decide", 0.25, "decision"],
  ["#interlude-decide", 0.75, "decision"],
```

Also update the comment above `STOPS` from `// The story, top to bottom: [element, which part meets mid-screen, shape].` to:

```js
// The story, top to bottom: [element, which part meets mid-screen, shape].
// The part is "start", "center", "end" or a 0–1 fraction of the element.
```

- [ ] **Step 2: Validation.** Replace:

```js
  if (!["start", "center", "end"].includes(at)) throw new Error(`story stop: bad position "${at}"`);
```

with:

```js
  const fraction = typeof at === "number" && at >= 0 && at <= 1;
  if (!fraction && !["start", "center", "end"].includes(at)) throw new Error(`story stop: bad position "${at}"`);
```

- [ ] **Step 3: Flight span.** Replace:

```js
  let stops = [];
  function measure() {
    stops = STOPS.map(([sel, at, shape]) => ({
      y: stopY(document.querySelector(sel).getBoundingClientRect(), scrollY, innerHeight, at),
      shape: NAMES.indexOf(shape),
    }));
  }
```

with:

```js
  let stops = [];
  let flight = null; // [startY, endY] of the scroll span you fly through the funnel
  function measure() {
    stops = STOPS.map(([sel, at, shape]) => ({
      y: stopY(document.querySelector(sel).getBoundingClientRect(), scrollY, innerHeight, at),
      shape: NAMES.indexOf(shape),
    }));
    // A fly-through shape's two neighbouring stops bound its flight.
    const k = stops.findIndex(
      (s, i) => i > 0 && s.shape === stops[i - 1].shape && SHAPES[NAMES[s.shape]].flyTo != null
    );
    flight = k > 0 ? [stops[k - 1].y, stops[k].y] : null;
  }
  // 0 before the flight and 1 after it, so the funnel morphs in at its mouth
  // and leaves from its tip. Reduced motion skips the flight: a still view down it.
  function travelAt(y) {
    if (!flight) return 0;
    if (reducedMotion) return 0.3;
    return Math.min(1, Math.max(0, (y - flight[0]) / (flight[1] - flight[0] || 1)));
  }
```

- [ ] **Step 4: Loop.** Replace:

```js
    field.setState(from, to, t);
```

with:

```js
    field.setState(from, to, t, travelAt(y));
```

- [ ] **Step 5: CSS.** In `index.html`, right after the `.interlude--properly .interlude__caption { … }` rule (ends around line 646), add:

```css
      /* The decide interlude is a funnel you fly down, so it needs a longer
         stretch of scroll. Without particles it stays like the others. */
      html.has-particles .interlude--decide {
        min-height: 280vh;
        min-height: 280svh;
      }
```

- [ ] **Step 6: Section class.** Replace:

```html
      <section id="interlude-decide" class="interlude">
```

with:

```html
      <section id="interlude-decide" class="interlude interlude--decide">
```

- [ ] **Step 7: Syntax check**

```bash
node --check assets/particles/story.js 2>&1 | head -5
```

`story.js` uses top-level `await` and the bare `three` import, so `--check` may complain only about those. Any other syntax error must be fixed. The real test is Task 5.

- [ ] **Step 8: Show the diff**

```bash
git diff assets/particles/story.js index.html
```

---

### Task 5: Screenshot check and tuning

**Files:**
- Create (scratch only): `$SCRATCH/shoot.mjs` restored from git history
- Possibly tune: `assets/particles/story-shapes.js` (funnel constants, `opacity`), `assets/particles/story.js` (0.25 / 0.75)

Stop indices after Task 4: 3 = `#portfolio` end (dust), **4 = funnel forms (travel 0)**, **5 = flight ends (travel 1)**, 6 = `#skills` start (dust). `?stage=4.5` is halfway down the funnel.

- [ ] **Step 1: Restore the harness into scratch**

```bash
SCRATCH=/private/tmp/claude-501/-Users-cristiancruz-WebstormProjects-portfolio/b22946c9-c223-4168-a881-8ed16e19b540/scratchpad
git show 0b5d55b:dev/particles/shoot.mjs > "$SCRATCH/shoot.mjs"
```

It blocks PostHog and Google Analytics requests. Don't screenshot the site without it.

- [ ] **Step 2: Start the dev server (background)**

```bash
python3 -m http.server 8765 --bind 127.0.0.1
```

Run it with `run_in_background`. Stop it at the end of the task.

- [ ] **Step 3: Desktop shots**

```bash
node "$SCRATCH/shoot.mjs" index.html "$SCRATCH/shots" 1280,800 3 3.5 4 4.25 4.5 4.75 5 5.5 6
```

Expected: nine PNG paths printed, no `exception:` and no `THREE.WebGLProgram` lines in the console output. Open each PNG with Read and check:
- 3.5: dust mid-morph into the funnel.
- 4: looking down the funnel. The walls converge to a small, distant tip, and option dots are visible.
- 4.25 to 4.75: the walls and ring bands are larger and spreading toward the edges, the options thin out, and there are **no large blobs**.
- 5: the bright tip cluster is centered and large but not clipped away. A narrow wall ring may surround it.
- 5.5: the funnel breaks into dust from the tip view (no snap back to the mouth).
- 6: dust.
- The caption "decide what's worth building," is readable at the bottom in 4 through 5.
- Scrolling back up needs no separate shot. The state is a pure function of scroll position (`stateAt` plus `travelAt`), so it reverses the same frames.

- [ ] **Step 4: Phone shots**

```bash
node "$SCRATCH/shoot.mjs" index.html "$SCRATCH/shots" 390,844 4 4.5 5
```

Check the same points. The narrow aspect makes the "cover" scale smaller, so the funnel is shallower. The tip should still end centered.

- [ ] **Step 5: Reduced motion**

```bash
CHROME_FLAGS=--force-prefers-reduced-motion node "$SCRATCH/shoot.mjs" index.html "$SCRATCH/shots" 1280,800 4 4.5 5
```

Expected: all three show the same still view down the funnel (travel 0.3).

- [ ] **Step 6: Tune if needed.** Change only these, one at a time, and reshoot the affected stages:
- Too bright or blown out in the middle at stage 4: lower `shape.opacity` (0.8 → 0.6).
- The walls don't read as a tunnel: raise the ring share (`0.4` → `0.55`) or the ring lum (`0.5` → `0.6`).
- The tip cluster is too small or too big at stage 5: change the choice radius `0.05`, or `FLY_STOP` in `particles.js` (2.5 → 3 makes it smaller).
- The flight feels rushed or the morphs are too short: move the stop fractions (0.25 / 0.75) or the 280vh height.

- [ ] **Step 7: Share the key frames.** Send the stage 4, 4.5 and 5 desktop PNGs to the user, along with what was tuned.

- [ ] **Step 8: Stop the dev server.**

---

### Task 6: Hand-off

- [ ] **Step 1: Full diff for the user**

```bash
git status --short && git diff --stat && git diff
```

- [ ] **Step 2: Remind the user** that nothing is committed, and that `llms.txt` doesn't change (the copy is the same). The user commits.
