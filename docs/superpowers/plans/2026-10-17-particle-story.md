# Particle Story Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the portfolio into a whole-page scroll story. A cloud of purple particles forms a shape at each of four interludes, and the captions spell out "I find out what people actually need, decide what's worth building, and then I build it. Properly."

**Architecture:** One fixed, full-screen Three.js `Points` cloud sits behind the page. The particle engine (`particles.js`) only ever holds two shapes on the GPU and blends between them. A pure timeline module (`timeline.js`) turns the scroll position into `{from, to, t}` using "stops" anchored to page elements. Shapes are built in code (`shapes.js` holds the generic makers, `story-shapes.js` the story's shapes), so there are no new image assets. Everything is built first as a staging copy (`dev/index_v5.html`) and promoted to production only after Cristian approves.

**Tech Stack:** Vanilla HTML/CSS/JS, no build step. Three.js 0.160.0 loaded as an ES module from jsDelivr through an import map. Tailwind (CDN) as already on the page. Tests use Node's built-in runner (`node --test`, Node 24). Visual checks use headless Chrome screenshots.

**Spec:** `docs/superpowers/specs/2026-10-17-particle-story-design.md`

## Project rules that override the default workflow (from CLAUDE.md)

- **Never commit or push.** Where a plan would normally say "commit", this plan says **Checkpoint**: run `git status --short`, tell Cristian what changed, and let him commit.
- **Show a diff before changing published content** (`index.html`, `llms.txt`, `CLAUDE.md`). Tasks 11–12 are gated on his explicit approval.
- **Delete nothing without asking.**

## File map

| File | Status | Responsibility |
|---|---|---|
| `dev/particles/shoot.sh` | create | Headless Chrome screenshot harness for any page with `?stage=` |
| `dev/particles/timeline.js` | create | Pure: scroll position → `{from, to, t}`; stop measuring; `?stage` → scroll y |
| `dev/particles/shapes.js` | create | Generic shape makers, moved out of `particles.js` (`sampleCanvas`, `fromEmoji`, `fromText`, `fromImage`, `fromFunction`, `makeCanvas`) |
| `dev/particles/particles.js` | rewrite | Engine only: `setState(from, to, t)`, per-shape `opacity`, `spin` and `fit: "cover"`, reduced-motion crossfade |
| `dev/particles/story-shapes.js` | create | The story's shapes: `globe`, `dust`, `decision`, `people`, `appWindow`, `saturnV` |
| `dev/particles/story-preview.html` | create | Bare page that cycles through the story shapes, for tuning them outside the portfolio |
| `dev/particles/story.js` | create | Wires the story into the portfolio page: shapes, stops, scroll loop, intro hand-off, fallbacks |
| `dev/particles/index.html` | modify | Tiger template: import shape makers from `shapes.js` |
| `dev/particles/tests/*.test.mjs` | create | Node tests for `timeline.js`, `shapes.js`, `story-shapes.js` |
| `dev/index_v5.html` | create | Staging copy of `index.html` with the canvas, interludes and new hero |
| `index.html`, `assets/particles/*` | Task 11 (gated) | Production promotion |
| `llms.txt`, `CLAUDE.md` | Task 12 (gated) | New positioning |

**Local server for all browser checks** (start once and leave it running in the background):

```bash
cd /Users/cristiancruz/WebstormProjects/portfolio && python3 -m http.server 8765 --bind 127.0.0.1
```

---

### Task 1: Screenshot harness

**Files:**
- Create: `dev/particles/shoot.sh`

- [ ] **Step 1: Write the script**

```bash
#!/usr/bin/env bash
# Screenshots a page at one or more ?stage= values with headless Chrome.
# Needs the dev server: python3 -m http.server 8765 --bind 127.0.0.1 (repo root).
#
# Usage: dev/particles/shoot.sh <page path> <out dir> <WxH> <stage> [<stage> ...]
# Example: dev/particles/shoot.sh dev/index_v5.html /tmp/shots 1280,800 0 1 4
# Headless Chrome won't go narrower than ~500px, so use 500,900 for "mobile".
# Extra Chrome flags can be passed via CHROME_FLAGS, e.g.
#   CHROME_FLAGS=--force-prefers-reduced-motion dev/particles/shoot.sh ...
set -euo pipefail
page=$1
out="$2/$(date +%s)"
size=$3
shift 3
chrome="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
mkdir -p "$out"
for st in "$@"; do
  file="$out/stage-$st.png"
  # shellcheck disable=SC2086
  "$chrome" --headless=new --use-angle=swiftshader --enable-unsafe-swiftshader \
    --user-data-dir="$(mktemp -d)" --window-size="$size" --virtual-time-budget=9000 \
    ${CHROME_FLAGS:-} --screenshot="$file" \
    "http://127.0.0.1:8765/$page?birth=0&stage=$st" >/dev/null 2>&1 &
  pid=$!
  # Chrome sometimes keeps running after writing the file; don't wait on it.
  for _ in $(seq 1 60); do
    [ -s "$file" ] && break
    perl -e 'select(undef, undef, undef, 0.5)'
  done
  kill "$pid" 2>/dev/null || true
  echo "$file"
done
```

- [ ] **Step 2: Make it executable and run it against the existing tiger template**

```bash
chmod +x dev/particles/shoot.sh
dev/particles/shoot.sh dev/particles/index.html /private/tmp/claude-shots 1280,800 0 3
```

Expected: two PNG paths are printed. Open them: stage 0 is the gold tiger and stage 3 is "CRISTIAN CRUZ".

- [ ] **Step 3: Checkpoint.** Run `git status --short`. Expect `?? dev/particles/` (the whole folder is still untracked).

---

### Task 2: Timeline module (TDD)

**Files:**
- Create: `dev/particles/timeline.js`
- Test: `dev/particles/tests/timeline.test.mjs`

- [ ] **Step 1: Write the failing tests**

```js
// dev/particles/tests/timeline.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { stateAt, stopY, yForStage } from "../timeline.js";

const stops = [
  { y: 0, shape: 0 },
  { y: 100, shape: 1 },
  { y: 200, shape: 1 },
  { y: 300, shape: 2 },
];

test("before the first stop rests on the first shape", () => {
  assert.deepEqual(stateAt(stops, -50), { from: 0, to: 0, t: 0 });
});

test("between two different shapes morphs linearly", () => {
  assert.deepEqual(stateAt(stops, 25), { from: 0, to: 1, t: 0.25 });
});

test("between two stops with the same shape holds it", () => {
  assert.deepEqual(stateAt(stops, 150), { from: 1, to: 1, t: 0 });
});

test("exactly on a stop starts the next segment", () => {
  assert.deepEqual(stateAt(stops, 200), { from: 1, to: 2, t: 0 });
});

test("past the last stop rests on the last shape", () => {
  assert.deepEqual(stateAt(stops, 999), { from: 2, to: 2, t: 0 });
});

test("stopY measures where part of an element meets the viewport center", () => {
  const rect = { top: 500, height: 200 }; // page already scrolled 100px
  assert.equal(stopY(rect, 100, 800, "start"), 200);
  assert.equal(stopY(rect, 100, 800, "center"), 300);
  assert.equal(stopY(rect, 100, 800, "end"), 400);
});

test("yForStage interpolates between stop positions and clamps", () => {
  assert.equal(yForStage(stops, 0), 0);
  assert.equal(yForStage(stops, 2.5), 250);
  assert.equal(yForStage(stops, 9), 300);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test "dev/particles/tests/*.test.mjs"`
Expected: FAIL with `Cannot find module '.../dev/particles/timeline.js'`.

- [ ] **Step 3: Implement**

```js
// dev/particles/timeline.js
// Scroll timeline: maps a scroll position to which two shapes are on screen
// and how far the morph between them has got.
//
// A stop is { y, shape }: y is a scrollY value, shape an index into the
// engine's shape list. Between two stops the morph runs linearly; two
// neighbouring stops with the same shape hold it (that's how a long section
// keeps the dust on screen while you read it).

// The scrollY at which part of an element sits in the middle of the viewport.
// rect is a getBoundingClientRect() taken at the current scrollY.
export function stopY(rect, scrollY, viewportH, at = "center") {
  const offset = at === "start" ? 0 : at === "end" ? rect.height : rect.height / 2;
  return rect.top + scrollY + offset - viewportH / 2;
}

// stops must be sorted by y (document order does this for us).
export function stateAt(stops, y) {
  const first = stops[0];
  const last = stops[stops.length - 1];
  if (y <= first.y) return { from: first.shape, to: first.shape, t: 0 };
  if (y >= last.y) return { from: last.shape, to: last.shape, t: 0 };
  let i = 0;
  while (stops[i + 1].y <= y) i++;
  const a = stops[i];
  const b = stops[i + 1];
  if (a.shape === b.shape) return { from: a.shape, to: a.shape, t: 0 };
  return { from: a.shape, to: b.shape, t: (y - a.y) / (b.y - a.y) };
}

// Scroll position for a fractional stop index: ?stage=2.5 is halfway
// between stop 2 and stop 3. Used for screenshots and tuning.
export function yForStage(stops, stage) {
  const i = Math.max(0, Math.min(stops.length - 1, Math.floor(stage)));
  const j = Math.min(stops.length - 1, i + 1);
  const f = Math.min(1, Math.max(0, stage - i));
  return stops[i].y + (stops[j].y - stops[i].y) * f;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test "dev/particles/tests/*.test.mjs"`
Expected: `# pass 7`, `# fail 0`.

- [ ] **Step 5: Checkpoint.** Run `git status --short` and report the new files.

---

### Task 3: Move shape makers into `shapes.js` (TDD)

**Files:**
- Create: `dev/particles/shapes.js`
- Modify: `dev/particles/index.html` (the import line only)
- Test: `dev/particles/tests/shapes.test.mjs`

`particles.js` keeps its own copies until Task 4 rewrites it, so the template works throughout.

- [ ] **Step 1: Write the failing test**

```js
// dev/particles/tests/shapes.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { fromFunction } from "../shapes.js";

test("fromFunction centers the shape and scales its larger side to 1", () => {
  const corners = [[0, 0, 0], [4, 0, 0], [0, 2, 0], [4, 2, 1]];
  const s = fromFunction(4, (i) => [...corners[i], 0.5]);
  assert.deepEqual(s.aspect, { w: 1, h: 0.5 });
  assert.deepEqual(
    Array.from(s.positions),
    [-0.5, -0.25, 0, 0.5, -0.25, 0, -0.5, 0.25, 0, 0.5, 0.25, 0.25]
  );
  assert.deepEqual(Array.from(s.lum), [0.5, 0.5, 0.5, 0.5]);
  assert.equal(s.fill, 0.6);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test "dev/particles/tests/*.test.mjs"`
Expected: FAIL with `Cannot find module '.../dev/particles/shapes.js'`.

- [ ] **Step 3: Create `shapes.js`**

```js
// dev/particles/shapes.js
// Shape makers. Every maker returns the same format:
//   { positions: Float32Array(count * 3), lum: Float32Array(count),
//     aspect: { w, h }, fill }
// positions are centered and normalized so the larger of width/height is 1.
// fill is how much of its bounding box the shape covers; the engine uses it
// to dim shapes that crowd many particles into a small area.
// Optional settings the engine reads (set them on the returned object):
//   fit (number or "cover"), opacity (0–1), spin (radians/second).

// Centers a shape on the origin and scales it so max(width, height) = 1.
function normalize(positions) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    minX = Math.min(minX, positions[i]);
    maxX = Math.max(maxX, positions[i]);
    minY = Math.min(minY, positions[i + 1]);
    maxY = Math.max(maxY, positions[i + 1]);
  }
  const w = maxX - minX || 1;
  const h = maxY - minY || 1;
  const s = 1 / Math.max(w, h);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  for (let i = 0; i < positions.length; i += 3) {
    positions[i] = (positions[i] - cx) * s;
    positions[i + 1] = (positions[i + 1] - cy) * s;
    positions[i + 2] *= s;
  }
  return { w: w * s, h: h * s };
}

export function makeCanvas(w, h) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  return canvas;
}

// Turns the opaque pixels of a canvas into `count` particles.
// Bright pixels are picked more often and sit closer to the camera, so dark
// detail (a tiger's stripes) reads as gaps in the cloud.
export function sampleCanvas(canvas, count, { depth = 0.25, minWeight = 0.08 } = {}) {
  const { width: w, height: h } = canvas;
  const data = canvas.getContext("2d").getImageData(0, 0, w, h).data;
  const xs = [], ys = [], lums = [];
  let minX = w, maxX = 0, minY = h, maxY = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (data[i + 3] < 128) continue;
      xs.push(x);
      ys.push(y);
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      lums.push((0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255);
    }
  }
  if (!xs.length) return null;

  const positions = new Float32Array(count * 3);
  const lum = new Float32Array(count);
  let n = 0;
  for (let tries = 0; n < count && tries < count * 200; tries++) {
    const k = (Math.random() * xs.length) | 0;
    if (Math.random() > minWeight + lums[k]) continue;
    positions[n * 3] = (xs[k] + Math.random()) / w;
    positions[n * 3 + 1] = -(ys[k] + Math.random()) / h * (h / w);
    positions[n * 3 + 2] = (lums[k] - 0.5) * depth + (Math.random() - 0.5) * 0.02;
    lum[n] = lums[k];
    n++;
  }
  const fill = xs.length / ((maxX - minX + 1) * (maxY - minY + 1));
  return { positions, lum, aspect: normalize(positions), fill };
}

// Draws an emoji large and samples it. Handy stand-in art for prototyping.
export function fromEmoji(emoji, count, opts) {
  const size = 420;
  const canvas = makeCanvas(size, size);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.font = `${size * 0.82}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(emoji, size / 2, size / 2 + size * 0.04);
  return sampleCanvas(canvas, count, { depth: 0.35, ...opts });
}

// Renders text in white and samples it, the same trick Tigris uses for its wordmark.
export function fromText(text, count, { font = '700 160px "Inter", sans-serif', ...opts } = {}) {
  const probe = makeCanvas(1, 1).getContext("2d");
  probe.font = font;
  const m = probe.measureText(text);
  const pad = 20;
  const w = Math.ceil(m.width) + pad * 2;
  const h = Math.ceil(m.actualBoundingBoxAscent + m.actualBoundingBoxDescent) + pad * 2;
  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.font = font;
  ctx.fillStyle = "#fff";
  ctx.fillText(text, pad, pad + m.actualBoundingBoxAscent);
  // White text has uniform brightness; give it a little depth noise instead.
  return sampleCanvas(canvas, count, { depth: 0.04, ...opts });
}

// Loads any image (same origin, or a CORS-enabled host) and samples it.
export async function fromImage(url, count, { maxSize = 420, ...opts } = {}) {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = url;
  await img.decode();
  const s = Math.min(1, maxSize / Math.max(img.width, img.height));
  const canvas = makeCanvas(Math.round(img.width * s), Math.round(img.height * s));
  canvas.getContext("2d", { willReadFrequently: true }).drawImage(img, 0, 0, canvas.width, canvas.height);
  return sampleCanvas(canvas, count, opts);
}

// Procedural shapes: fn(i, count) returns [x, y, z, lum].
export function fromFunction(count, fn) {
  const positions = new Float32Array(count * 3);
  const lum = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const [x, y, z, l] = fn(i, count);
    positions.set([x, y, z], i * 3);
    lum[i] = l;
  }
  return { positions, lum, aspect: normalize(positions), fill: 0.6 };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test "dev/particles/tests/*.test.mjs"`
Expected: `# pass 8`, `# fail 0`.

- [ ] **Step 5: Point the tiger template at `shapes.js`**

In `dev/particles/index.html`, replace:

```js
      import { createParticleField, fromEmoji, fromText, fromFunction } from "./particles.js";
```

with:

```js
      import { createParticleField } from "./particles.js";
      import { fromEmoji, fromText, fromFunction } from "./shapes.js";
```

- [ ] **Step 6: Verify the template still renders**

Run: `dev/particles/shoot.sh dev/particles/index.html /private/tmp/claude-shots 1280,800 0 3`
Expected: the tiger and the name, identical to Task 1.

- [ ] **Step 7: Checkpoint.** Run `git status --short`.

---

### Task 4: Engine rewrite (`setState`, opacity, spin, cover, crossfade)

**Files:**
- Rewrite: `dev/particles/particles.js`

The engine needs WebGL, so it is checked visually, not with Node tests.

- [ ] **Step 1: Replace the whole file with**

```js
// dev/particles/particles.js
// Particle morph engine, inspired by tigris.lorolabs.ai.
//
// One point cloud. Every shape is a list of `count` target positions, so
// particle i in shape A flies to particle i in shape B. Only two shapes are on
// the GPU at a time (aPosA / aPosB); setState() swaps them in when the pair
// changes, so a story can use any number of shapes, in any order, repeating.
//
// Shapes come from shapes.js. Optional per-shape settings:
//   fit      number (default 1) to shrink it, or "cover" to fill the viewport
//   opacity  0–1 (default 1)
//   spin     radians per second around the vertical axis (default 0)
//
// Throws if WebGL is unavailable. Callers should catch and fall back.

import * as THREE from "three";

const vertexShader = /* glsl */ `
  attribute vec3 aPosA;
  attribute vec3 aPosB;
  attribute float aLumA;
  attribute float aLumB;
  attribute vec4 aRand;

  uniform float uMorph;
  uniform float uScaleA;
  uniform float uScaleB;
  uniform float uExposureA;
  uniform float uExposureB;
  uniform float uOpacityA;
  uniform float uOpacityB;
  uniform float uSpinA;
  uniform float uSpinB;
  uniform float uCrossfade;
  uniform float uScatter;
  uniform float uBirth;
  uniform float uTime;
  uniform float uAmbient;
  uniform vec3 uMouse;
  uniform float uMouseStrength;
  uniform float uMouseRadius;
  uniform float uSize;
  uniform float uPixelRatio;

  varying float vLum;
  varying float vSpark;
  varying float vFade;
  varying float vExposure;

  vec3 spinY(vec3 p, float a) {
    float c = cos(a), s = sin(a);
    return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);
  }

  void main() {
    // Each particle leaves on its own schedule, so shapes dissolve and
    // re-form instead of sliding as one rigid block.
    float t = clamp((uMorph - aRand.w * 0.35) / 0.65, 0.0, 1.0);
    t = t * t * (3.0 - 2.0 * t);
    // Reduced motion: no flight. Positions swap at the midpoint, hidden by a fade.
    float tp = mix(t, step(0.5, uMorph), uCrossfade);
    float flight = sin(3.14159 * t) * (1.0 - uCrossfade);

    vec3 a = spinY(aPosA, uTime * uSpinA * uAmbient) * uScaleA;
    vec3 b = spinY(aPosB, uTime * uSpinB * uAmbient) * uScaleB;
    vec3 p = mix(a, b, tp);

    // Mid-flight, particles bloom outward and fall back in.
    vec3 dir = normalize(aRand.xyz - 0.5 + 0.0001);
    p += dir * flight * uScatter * (0.4 + aRand.y);

    // Ambient breathing and a slow sway that shows off the depth.
    p += uAmbient * 0.02 * vec3(
      sin(uTime * 0.7 + aRand.x * 6.283),
      cos(uTime * 0.6 + aRand.y * 6.283),
      sin(uTime * 0.5 + aRand.z * 6.283)
    );
    float ang = sin(uTime * 0.25) * 0.22 * uAmbient;
    float c = cos(ang), s = sin(ang);
    p.xz = mat2(c, s, -s, c) * p.xz;

    // Birth: particles converge from a wide shell on page load.
    float born = clamp((uBirth - aRand.z * 0.45) / 0.55, 0.0, 1.0);
    born = 1.0 - pow(1.0 - born, 3.0);
    p = mix(dir * (5.0 + aRand.x * 6.0), p, born);

    // Cursor pushes particles aside.
    vec2 d = p.xy - uMouse.xy;
    float push = uMouseStrength * (1.0 - smoothstep(0.0, uMouseRadius, length(d)));
    p.xy += normalize(d + 0.0001) * push * 0.35;
    p.z += push * 0.3;

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;

    vLum = mix(aLumA, aLumB, tp);
    vSpark = step(0.985, aRand.y) * (0.5 + 0.5 * sin(uTime * 3.0 + aRand.x * 40.0));
    vFade = born;
    float dip = mix(1.0, abs(1.0 - 2.0 * uMorph), uCrossfade);
    // Exposure lifts toward 1 mid-flight, when the cloud is spread out.
    vExposure = mix(mix(uExposureA, uExposureB, tp), 1.0, flight * 0.6)
      * mix(uOpacityA, uOpacityB, tp) * dip;
    gl_PointSize = uSize * uPixelRatio * (0.55 + vLum * 0.8 + vSpark * 1.6) * (6.0 / -mv.z);
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uColorLo;
  uniform vec3 uColorHi;
  uniform float uOpacity;

  varying float vLum;
  varying float vSpark;
  varying float vFade;
  varying float vExposure;

  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    float glow = pow(1.0 - d * 2.0, 1.6);
    vec3 col = mix(uColorLo, uColorHi, vLum);
    col = mix(col, vec3(1.0), vSpark * 0.6);
    gl_FragColor = vec4(col * glow * (0.3 + vLum * 0.7) * uOpacity * vFade * vExposure, 1.0);
  }
`;

const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function createParticleField({
  canvas,
  count,
  shapes,
  colors = { lo: "#6b3a14", hi: "#ffdc96" },
  fit = { w: 0.8, h: 0.72 }, // share of the viewport a shape may fill
  reducedMotion = false,
}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true });
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
  renderer.setPixelRatio(pixelRatio);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.z = 6;

  const geometry = new THREE.BufferGeometry();
  const posA = new THREE.BufferAttribute(new Float32Array(count * 3), 3);
  const posB = new THREE.BufferAttribute(new Float32Array(count * 3), 3);
  const lumA = new THREE.BufferAttribute(new Float32Array(count), 1);
  const lumB = new THREE.BufferAttribute(new Float32Array(count), 1);
  const rand = new Float32Array(count * 4).map(Math.random);
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  geometry.setAttribute("aPosA", posA);
  geometry.setAttribute("aPosB", posB);
  geometry.setAttribute("aLumA", lumA);
  geometry.setAttribute("aLumB", lumB);
  geometry.setAttribute("aRand", new THREE.BufferAttribute(rand, 4));

  const uniforms = {
    uMorph: { value: 0 },
    uScaleA: { value: 1 },
    uScaleB: { value: 1 },
    uExposureA: { value: 1 },
    uExposureB: { value: 1 },
    uOpacityA: { value: 1 },
    uOpacityB: { value: 1 },
    uSpinA: { value: 0 },
    uSpinB: { value: 0 },
    uCrossfade: { value: reducedMotion ? 1 : 0 },
    uScatter: { value: reducedMotion ? 0 : 0.55 },
    uBirth: { value: reducedMotion ? 1 : 0 },
    uTime: { value: 0 },
    uAmbient: { value: reducedMotion ? 0 : 1 },
    uMouse: { value: new THREE.Vector3(999, 999, 0) },
    uMouseStrength: { value: 0 },
    uMouseRadius: { value: 0.7 },
    uSize: { value: 2.4 },
    uPixelRatio: { value: pixelRatio },
    uColorLo: { value: new THREE.Color(colors.lo) },
    uColorHi: { value: new THREE.Color(colors.hi) },
    uOpacity: { value: 1 },
  };

  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  scene.add(points);

  // --- sizing -----------------------------------------------------------------
  let shapeScales = [];
  let shapeExposures = [];

  function computeScales() {
    const visH = 2 * camera.position.z * Math.tan((camera.fov * Math.PI) / 360);
    const visW = visH * camera.aspect;
    const pxPerUnit = innerHeight / visH;
    shapeScales = shapes.map(({ aspect, fit: k = 1 }) =>
      k === "cover"
        ? 1.1 * Math.max(visW / aspect.w, visH / aspect.h)
        : k * Math.min((visW * fit.w) / aspect.w, (visH * fit.h) / aspect.h)
    );
    // Small shapes pack the same dots into fewer pixels and blow out to white,
    // so dim them in proportion to how crowded they are on screen.
    shapeExposures = shapes.map(({ aspect, fill = 0.6 }, i) => {
      const areaPx = aspect.w * aspect.h * fill * (shapeScales[i] * pxPerUnit) ** 2;
      return Math.min(1, Math.max(0.15, 0.25 / (count / areaPx)));
    });
  }

  // --- which two shapes are on the GPU ------------------------------------------
  let loaded = null;

  function load(from, to) {
    posA.array.set(shapes[from].positions);
    posB.array.set(shapes[to].positions);
    lumA.array.set(shapes[from].lum);
    lumB.array.set(shapes[to].lum);
    posA.needsUpdate = posB.needsUpdate = lumA.needsUpdate = lumB.needsUpdate = true;
    loaded = `${from}>${to}`;
  }

  // Show the morph from shape `from` to shape `to`, t in 0…1.
  // Each shape is held still for the first and last 20% of t.
  function setState(from, to, t) {
    if (loaded !== `${from}>${to}`) load(from, to);
    uniforms.uMorph.value = from === to ? 0 : smoothstep(0.2, 0.8, t);
    uniforms.uScaleA.value = shapeScales[from];
    uniforms.uScaleB.value = shapeScales[to];
    uniforms.uExposureA.value = shapeExposures[from];
    uniforms.uExposureB.value = shapeExposures[to];
    uniforms.uOpacityA.value = shapes[from].opacity ?? 1;
    uniforms.uOpacityB.value = shapes[to].opacity ?? 1;
    uniforms.uSpinA.value = shapes[from].spin ?? 0;
    uniforms.uSpinB.value = shapes[to].spin ?? 0;
  }

  // Convenience for linear stories: f runs 0 … shapes.length - 1.
  function setProgress(f) {
    const max = shapes.length - 1;
    f = Math.min(max, Math.max(0, f));
    const i = Math.min(Math.max(0, max - 1), Math.floor(f));
    setState(i, Math.min(i + 1, max), f - i);
  }

  // --- input ----------------------------------------------------------------------
  const mouseTarget = new THREE.Vector3(999, 999, 0);
  const raycaster = new THREE.Raycaster();
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const ndc = new THREE.Vector2();
  let lastMove = -Infinity;

  function onPointerMove(e) {
    if (e.pointerType === "touch") return;
    ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    raycaster.ray.intersectPlane(plane, mouseTarget);
    if (uniforms.uMouse.value.x === 999) uniforms.uMouse.value.copy(mouseTarget);
    lastMove = performance.now();
  }
  window.addEventListener("pointermove", onPointerMove);

  function resize() {
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    computeScales();
  }
  window.addEventListener("resize", resize);
  resize();
  setState(0, 0, 0);

  // --- loop -----------------------------------------------------------------------
  const clock = new THREE.Clock();
  let raf;
  function frame() {
    const dt = Math.min(clock.getDelta(), 0.05);
    uniforms.uTime.value += dt;
    uniforms.uMouse.value.lerp(mouseTarget, 1 - Math.exp(-dt * 10));
    const active = !reducedMotion && performance.now() - lastMove < 1200 ? 1 : 0;
    uniforms.uMouseStrength.value += (active - uniforms.uMouseStrength.value) * (1 - Math.exp(-dt * 4));
    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  }
  frame();

  return {
    setState,
    setProgress,
    uniforms,
    // Plays the load-in. Resolves when particles have landed.
    birth(duration = 2.6) {
      if (reducedMotion) return Promise.resolve();
      return new Promise((resolve) => {
        const start = performance.now();
        const tick = () => {
          const t = Math.min(1, (performance.now() - start) / (duration * 1000));
          uniforms.uBirth.value = t;
          t < 1 ? requestAnimationFrame(tick) : resolve();
        };
        tick();
      });
    },
    dispose() {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("resize", resize);
      geometry.dispose();
      material.dispose();
      renderer.dispose();
    },
  };
}
```

- [ ] **Step 2: Verify the template still renders, including a mid-morph frame**

Run: `dev/particles/shoot.sh dev/particles/index.html /private/tmp/claude-shots 1280,800 0 0.5 1 2 3`
Expected: tiger, bloom cloud, ring, bar chart and name, matching the pre-rewrite screenshots.

- [ ] **Step 3: Check the reduced-motion path**

Run: `CHROME_FLAGS=--force-prefers-reduced-motion dev/particles/shoot.sh dev/particles/index.html /private/tmp/claude-shots 1280,800 0.4 0.6`
Expected: 0.4 shows a dimmed tiger and 0.6 a dimmed ring. Neither shows the bloom cloud: shapes swap behind a fade.

- [ ] **Step 4: Checkpoint.** Run `git status --short`.

---

### Task 5: Procedural story shapes (`globe`, `dust`, `decision`), TDD

**Files:**
- Create: `dev/particles/story-shapes.js`
- Test: `dev/particles/tests/story-shapes.test.mjs`

- [ ] **Step 1: Write the failing tests**

```js
// dev/particles/tests/story-shapes.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { globe, dust, decision } from "../story-shapes.js";

const points = (s) =>
  Array.from({ length: s.positions.length / 3 }, (_, i) => s.positions.subarray(i * 3, i * 3 + 3));

test("globe puts every point on a sphere and spins", () => {
  const s = globe(5000);
  for (const [x, y, z] of points(s)) assert.ok(Math.abs(Math.hypot(x, y, z) - 0.5) < 0.03);
  assert.ok(s.spin > 0);
});

test("dust covers the screen, faintly, with shallow depth", () => {
  const s = dust(2000);
  assert.equal(s.fit, "cover");
  assert.equal(s.opacity, 0.25);
  for (const [, , z] of points(s)) assert.ok(Math.abs(z) <= 0.16);
});

test("decision gathers 1 in 7 points into one bright cluster", () => {
  const s = decision(7000);
  const bright = points(s).filter((_, i) => s.lum[i] >= 0.85);
  assert.equal(bright.length, 1000);
  const cx = bright.reduce((sum, p) => sum + p[0], 0) / bright.length;
  const cy = bright.reduce((sum, p) => sum + p[1], 0) / bright.length;
  for (const [x, y] of bright) assert.ok(Math.hypot(x - cx, y - cy) < 0.05);
  const dim = Array.from(s.lum).filter((l) => l < 0.85);
  assert.ok(dim.every((l) => l < 0.45));
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test "dev/particles/tests/*.test.mjs"`
Expected: FAIL with `Cannot find module '.../dev/particles/story-shapes.js'`.

- [ ] **Step 3: Implement the three procedural shapes**

```js
// dev/particles/story-shapes.js
// The portfolio story's shapes. All are built in code, so no image assets.
// Procedural ones (globe, dust, decision) also run in Node for tests;
// canvas-drawn ones (people, appWindow, saturnV) need a browser.

import { fromFunction, makeCanvas, sampleCanvas } from "./shapes.js";

// Standard normal sample, clamped so outliers don't stretch a shape's bounds.
function gauss() {
  let u = 0;
  while (!u) u = Math.random();
  const g = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random());
  return Math.max(-2.5, Math.min(2.5, g));
}

// Hero: a slowly turning globe of points, lit from the upper left.
export function globe(count) {
  const shape = fromFunction(count, () => {
    const z = Math.random() * 2 - 1;
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(1 - z * z);
    const x = r * Math.cos(a);
    const y = r * Math.sin(a);
    const light = Math.max(0, -0.45 * x + 0.55 * y + 0.7 * z);
    return [x, y, z, 0.2 + 0.8 * light];
  });
  shape.spin = 0.12;
  shape.fit = 0.8;
  return shape;
}

// Between interludes: sparse, faint points spread across the whole screen.
export function dust(count) {
  const shape = fromFunction(count, () => [
    Math.random() * 2 - 1,
    Math.random() * 2 - 1,
    (Math.random() * 2 - 1) * 0.3,
    0.15 + Math.random() * 0.35,
  ]);
  shape.fit = "cover";
  shape.opacity = 0.25;
  shape.fill = 1;
  return shape;
}

// "decide what's worth building": a wide, dim field of options, with one in
// seven points gathered into a single bright choice.
export function decision(count) {
  const focus = [0.35, 0.1];
  const shape = fromFunction(count, (i) => {
    if (i % 7 === 0) {
      const r = Math.abs(gauss()) * 0.04;
      const a = Math.random() * Math.PI * 2;
      return [focus[0] + r * Math.cos(a), focus[1] + r * Math.sin(a), gauss() * 0.02, 0.85 + Math.random() * 0.15];
    }
    return [gauss() * 0.55, gauss() * 0.35, gauss() * 0.15, 0.12 + Math.random() * 0.3];
  });
  shape.fit = 0.85;
  return shape;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test "dev/particles/tests/*.test.mjs"`
Expected: `# pass 11`, `# fail 0`.

- [ ] **Step 5: Checkpoint.** Run `git status --short`.

---

### Task 6: Canvas-drawn story shapes and a preview page

**Files:**
- Modify: `dev/particles/story-shapes.js` (append)
- Create: `dev/particles/story-preview.html`

- [ ] **Step 1: Append the drawn shapes to `story-shapes.js`**

```js
// Draws on a 2D canvas, then turns the drawing into particles.
// Use white for bright parts and grays for dimmer, sparser parts.
function drawn(w, h, count, draw, opts) {
  const canvas = makeCanvas(w, h);
  draw(canvas.getContext("2d", { willReadFrequently: true }));
  return sampleCanvas(canvas, count, opts);
}

// "I find out what people actually need": two people talking.
export function people(count) {
  return drawn(640, 420, count, (ctx) => {
    for (const cx of [170, 470]) {
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(cx, 180, 42, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#cfcfcf";
      ctx.beginPath();
      ctx.roundRect(cx - 62, 236, 124, 184, [62, 62, 0, 0]);
      ctx.fill();
    }
    // Speech bubble from the left person, with "..." inside.
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.roundRect(240, 30, 160, 96, 30);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(280, 126);
    ctx.lineTo(250, 160);
    ctx.lineTo(310, 126);
    ctx.stroke();
    ctx.fillStyle = "#fff";
    for (const x of [285, 320, 355]) {
      ctx.beginPath();
      ctx.arc(x, 78, 9, 0, Math.PI * 2);
      ctx.fill();
    }
  }, { depth: 0.2 });
}

// "and then I build it": an app window wireframe.
export function appWindow(count) {
  return drawn(720, 480, count, (ctx) => {
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.roundRect(8, 8, 704, 464, 24);
    ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.fillRect(8, 60, 704, 6);
    for (const x of [44, 74, 104]) {
      ctx.beginPath();
      ctx.arc(x, 34, 9, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#8a8a8a";
    ctx.fillRect(36, 94, 150, 350); // sidebar
    ctx.fillStyle = "#f0f0f0";
    ctx.fillRect(214, 94, 470, 120); // header block
    ctx.fillStyle = "#b5b5b5";
    ctx.fillRect(214, 238, 224, 206);
    ctx.fillRect(460, 238, 224, 96);
    ctx.fillRect(460, 348, 224, 96);
  }, { depth: 0.12 });
}

// "Properly.": a Saturn V lifting off, exhaust plume included.
export function saturnV(count) {
  const shape = drawn(300, 900, count, (ctx) => {
    const poly = (pts, fill) => {
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.moveTo(...pts[0]);
      for (const p of pts.slice(1)) ctx.lineTo(...p);
      ctx.closePath();
      ctx.fill();
    };
    ctx.fillStyle = "#fff";
    ctx.fillRect(147, 20, 6, 70); // escape tower
    poly([[150, 90], [178, 140], [122, 140]], "#fff"); // command module
    poly([[122, 140], [178, 140], [192, 230], [108, 230]], "#e6e6e6"); // service module + adapter
    ctx.fillStyle = "#fff";
    ctx.fillRect(108, 230, 84, 130); // third stage
    poly([[108, 360], [192, 360], [205, 400], [95, 400]], "#d9d9d9"); // interstage
    ctx.fillRect(95, 400, 110, 160); // second stage
    ctx.fillRect(95, 560, 110, 200); // first stage
    ctx.fillStyle = "#333";
    ctx.fillRect(95, 460, 110, 18); // roll-pattern bands
    ctx.fillRect(150, 600, 55, 60);
    ctx.fillRect(95, 660, 55, 60);
    poly([[95, 700], [70, 770], [95, 770]], "#fff"); // fins
    poly([[205, 700], [230, 770], [205, 770]], "#fff");
    for (const x of [110, 130, 150, 170, 190]) poly([[x - 6, 760], [x + 6, 760], [x + 10, 790], [x - 10, 790]], "#cfcfcf");
    const plume = ctx.createLinearGradient(0, 790, 0, 900);
    plume.addColorStop(0, "#fff");
    plume.addColorStop(1, "#3a3a3a");
    ctx.fillStyle = plume;
    ctx.beginPath();
    ctx.ellipse(150, 845, 62, 55, 0, 0, Math.PI * 2);
    ctx.fill();
  }, { depth: 0.15 });
  shape.fit = 0.9;
  return shape;
}
```

- [ ] **Step 2: Create the preview page**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="robots" content="noindex" />
    <title>Story Shapes</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@700&display=swap" rel="stylesheet" />
    <script type="importmap">
      { "imports": { "three": "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js" } }
    </script>
    <style>
      html, body { margin: 0; background: #030712; }
      canvas { position: fixed; inset: 0; width: 100%; height: 100%; }
      .track { height: 700vh; }
    </style>
  </head>
  <body>
    <!-- Scroll (or pass ?stage=N) to step through the story shapes in order. -->
    <canvas id="webgl"></canvas>
    <div class="track"></div>
    <script type="module">
      import { createParticleField } from "./particles.js";
      import { fromText } from "./shapes.js";
      import { globe, dust, people, decision, appWindow, saturnV } from "./story-shapes.js";

      await document.fonts.load('700 160px "Inter"');
      const COUNT = matchMedia("(max-width: 640px)").matches ? 18000 : 40000;
      const shapes = [
        globe(COUNT), people(COUNT), decision(COUNT), appWindow(COUNT),
        saturnV(COUNT), dust(COUNT), fromText("CRISTIAN CRUZ", COUNT),
      ];
      const field = createParticleField({
        canvas: document.getElementById("webgl"),
        count: COUNT,
        shapes,
        colors: { lo: "#4c1d95", hi: "#d8b4fe" },
      });
      field.uniforms.uBirth.value = 1;
      const stage = new URLSearchParams(location.search).get("stage");
      (function loop() {
        field.setProgress(stage !== null ? parseFloat(stage) : scrollY / innerHeight);
        requestAnimationFrame(loop);
      })();
    </script>
  </body>
</html>
```

- [ ] **Step 3: Screenshot every shape at both sizes**

```bash
dev/particles/shoot.sh dev/particles/story-preview.html /private/tmp/claude-shots 1280,800 0 1 2 3 4 5 6
dev/particles/shoot.sh dev/particles/story-preview.html /private/tmp/claude-shots 500,900 0 1 2 3 4 5 6
```

Expected, in purple: 0 globe, 1 two people with a bubble, 2 a dim field with one bright dot cluster, 3 an app window, 4 an upright rocket with a plume, 5 faint dust edge to edge, 6 the name. Each shape must sit fully inside the frame. If one doesn't read clearly, adjust its drawing coordinates or `fit` here, before integrating. That's what this page is for.

- [ ] **Step 4: Run the Node tests again**, since the appended code must not break the Node imports.

Run: `node --test "dev/particles/tests/*.test.mjs"`
Expected: `# pass 11`, `# fail 0`.

- [ ] **Step 5: Checkpoint.** Run `git status --short`, and show Cristian the screenshots for a gut check on the shapes.

---

### Task 7: Staging page `dev/index_v5.html`

**Files:**
- Create: `dev/index_v5.html` (copy of `index.html` with paths rewritten, then edited)

- [ ] **Step 1: Copy with asset paths rewritten for `/dev`**

```bash
sed -e 's#"assets/#"../assets/#g' -e 's#"index.js"#"../index.js"#' -e 's#"llms.txt"#"../llms.txt"#' index.html > dev/index_v5.html
grep -c '"\.\./assets/' dev/index_v5.html
```

Expected: `4` (mountains_bg.jpg, me.png and resume.pdf twice: link plus pdf.js). If it differs, inspect with `grep -n 'assets/' dev/index_v5.html`.

- [ ] **Step 2: Import map and early WebGL check in `<head>`**

`particles.js` imports the bare specifier `"three"`, which only resolves through an import map. The map must come before any module script.

Replace:

```html
    <title>Cristian Cruz | Portfolio</title>
```

with:

```html
    <title>Cristian Cruz | Portfolio</title>
    <script type="importmap">
      { "imports": { "three": "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js" } }
    </script>
    <!-- Particle story: decide before first paint whether the canvas replaces
         the hero photo. story.js removes the class again if setup fails. -->
    <script>
      try {
        var probe = document.createElement("canvas");
        if (probe.getContext("webgl2") || probe.getContext("webgl"))
          document.documentElement.classList.add("has-particles");
      } catch (e) {}
    </script>
```

- [ ] **Step 3: Styles.** Replace the closing of the main `<style>` block:

```html
    </style>
  </head>
```

with:

```html
      /* ===== Particle story ===== */
      #particles {
        position: fixed;
        inset: 0;
        width: 100%;
        height: 100%;
        z-index: 0;
        pointer-events: none;
        display: none;
      }
      html.has-particles #particles {
        display: block;
      }
      html.has-particles #hero .hero-photo {
        display: none;
      }
      #hero,
      main,
      footer {
        position: relative;
        z-index: 1;
      }
      .interlude {
        min-height: 100vh;
        display: flex;
        align-items: flex-end;
        justify-content: center;
        padding-bottom: 14vh;
        text-align: center;
      }
      .interlude__caption {
        max-width: 22ch;
        font-size: clamp(1.75rem, 4vw, 3rem);
        font-weight: 700;
        letter-spacing: -0.02em;
        line-height: 1.15;
        color: #fff;
        text-shadow: 0 2px 24px rgba(3, 7, 18, 0.9);
      }
      .interlude--properly .interlude__caption {
        font-size: clamp(2.5rem, 7vw, 5rem);
        font-style: italic;
      }
      /* The closing stop is empty space for the particle name; without
         particles it would just be a blank screen. */
      .interlude--closing {
        display: none;
      }
      html.has-particles .interlude--closing {
        display: block;
      }
    </style>
  </head>
```

- [ ] **Step 4: Canvas element.** Replace:

```html
  <body class="bg-gray-950 text-gray-100 font-sans overflow-x-hidden">
```

with:

```html
  <body class="bg-gray-950 text-gray-100 font-sans overflow-x-hidden">
    <canvas id="particles" aria-hidden="true"></canvas>
```

- [ ] **Step 5: Hero: full height, tag the photo layers, new tagline.** Replace this block:

```html
    <section
      id="hero"
      class="relative w-full h-[600px] overflow-hidden flex items-center justify-center"
    >
      <img
        src="../assets/mountains_bg.jpg"
        alt="Mountain background"
        class="absolute inset-0 w-full h-full object-cover"
      />
      <div class="absolute inset-0 bg-black/40"></div>
      <div
        class="absolute inset-0 bg-gradient-to-t from-gray-950 via-transparent to-transparent"
      ></div>
```

with:

```html
    <section
      id="hero"
      class="relative w-full h-screen min-h-[600px] overflow-hidden flex items-center justify-center"
    >
      <img
        src="../assets/mountains_bg.jpg"
        alt="Mountain background"
        class="hero-photo absolute inset-0 w-full h-full object-cover"
      />
      <div class="hero-photo absolute inset-0 bg-black/40"></div>
      <div
        class="hero-photo absolute inset-0 bg-gradient-to-t from-gray-950 via-transparent to-transparent"
      ></div>
```

Then replace the tagline:

```html
          <span class="sr-only"
            >I build things that are beautiful and useful</span
          >
          <span aria-hidden="true" class="hero-line"
            ><span class="hero-line-inner"
              >I build things that are
              <b id="hero-word" class="hero-word">beautiful and useful</b></span
            ></span
          >
```

with the following. Keep both class names: the load intro measures `.hero-line-inner` for its wipe bar.

```html
          <span class="hero-line"
            ><span class="hero-line-inner">Product Engineer</span></span
          >
```

- [ ] **Step 6: Remove the typewriter script**, which is dead now that `#hero-word` is gone:

```bash
perl -0pi -e 's{\n\s*/\* Hero tagline word rotator — typewriter \*/.*?\}\)\(\);\n}{\n}s' dev/index_v5.html
grep -c 'word rotator' dev/index_v5.html; grep -c 'Load intro — cursor blinks' dev/index_v5.html
```

Expected: `0` then `1` (typewriter gone, load intro intact).

- [ ] **Step 7: Insert the interludes.** Each one is a find/replace:

Replace `      <!-- ===== PORTFOLIO ===== -->` with:

```html
      <section id="interlude-need" class="interlude">
        <p class="interlude__caption">I find out what people actually need,</p>
      </section>

      <!-- ===== PORTFOLIO ===== -->
```

Replace `      <!-- ===== SKILLS ===== -->` with:

```html
      <section id="interlude-decide" class="interlude">
        <p class="interlude__caption">decide what's worth building,</p>
      </section>

      <!-- ===== SKILLS ===== -->
```

Replace `      <!-- ===== EXPERIENCE ===== -->` with:

```html
      <section id="interlude-build" class="interlude">
        <p class="interlude__caption">and then I build it.</p>
      </section>

      <!-- ===== EXPERIENCE ===== -->
```

Replace `      <!-- ===== GET TO KNOW ME ===== -->` with:

```html
      <section id="interlude-properly" class="interlude interlude--properly">
        <p class="interlude__caption">Properly.</p>
      </section>

      <!-- ===== GET TO KNOW ME ===== -->
```

Replace:

```html
    </main>

    <!-- ===== FOOTER ===== -->
```

with:

```html
      <div id="interlude-closing" class="interlude interlude--closing" aria-hidden="true"></div>
    </main>

    <!-- ===== FOOTER ===== -->
```

- [ ] **Step 8: Load the story.** Replace:

```html
    <script src="../index.js" defer></script>
```

with the following. A dynamic import catches a failed Three.js download as well as setup errors.

```html
    <script src="../index.js" defer></script>
    <script type="module">
      import("./particles/story.js").catch((err) => {
        console.warn("Particle story disabled:", err);
        document.documentElement.classList.remove("has-particles");
      });
    </script>
```

- [ ] **Step 9: Sanity-check the page before `story.js` exists**

Run: `dev/particles/shoot.sh dev/index_v5.html /private/tmp/claude-shots 1280,800 0`
Expected: the import fails (`story.js` is missing yet) and `has-particles` is removed, so you get the mountain hero with "Cristian Cruz / Product Engineer". This proves the fallback.

- [ ] **Step 10: Checkpoint.** Run `git status --short`.

---

### Task 8: Story wiring (`story.js`)

**Files:**
- Create: `dev/particles/story.js`

- [ ] **Step 1: Write it**

```js
// dev/particles/story.js
// The portfolio's particle story: which shape shows where on the page.
// Loaded by the page with import(); any throw here falls back to the plain hero.

import { createParticleField } from "./particles.js";
import { fromText } from "./shapes.js";
import { globe, dust, people, decision, appWindow, saturnV } from "./story-shapes.js";
import { stateAt, stopY, yForStage } from "./timeline.js";

const root = document.documentElement;
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const COUNT = matchMedia("(max-width: 640px)").matches ? 18000 : 40000;
const params = new URLSearchParams(location.search);

if (!root.classList.contains("has-particles")) throw new Error("WebGL unavailable");

await document.fonts.load('700 160px "Inter"');
const SHAPES = {
  globe: globe(COUNT),
  dust: dust(COUNT),
  people: people(COUNT),
  decision: decision(COUNT),
  app: appWindow(COUNT),
  rocket: saturnV(COUNT),
  name: fromText("CRISTIAN CRUZ", COUNT),
};
const NAMES = Object.keys(SHAPES);

// The story, top to bottom: [element, which part meets mid-screen, shape].
// Two stops in a row with the same shape hold it across that stretch.
const STOPS = [
  ["#hero", "center", "globe"],
  ["#interlude-need", "center", "people"],
  ["#portfolio", "start", "dust"],
  ["#portfolio", "end", "dust"],
  ["#interlude-decide", "center", "decision"],
  ["#skills", "start", "dust"],
  ["#skills", "end", "dust"],
  ["#interlude-build", "center", "app"],
  ["#experience", "start", "dust"],
  ["#education", "end", "dust"],
  ["#interlude-properly", "center", "rocket"],
  ["#get-to-know-me", "start", "dust"],
  ["#get-to-know-me", "end", "dust"],
  ["#interlude-closing", "center", "name"],
];

let field;
try {
  field = createParticleField({
    canvas: document.getElementById("particles"),
    count: COUNT,
    shapes: NAMES.map((n) => SHAPES[n]),
    colors: { lo: "#4c1d95", hi: "#d8b4fe" },
    reducedMotion,
  });
} catch (err) {
  root.classList.remove("has-particles");
  throw err;
}

let stops = [];
function measure() {
  stops = STOPS.map(([sel, at, shape]) => ({
    y: stopY(document.querySelector(sel).getBoundingClientRect(), scrollY, innerHeight, at),
    shape: NAMES.indexOf(shape),
  }));
}
measure();
// Content height changes (fonts, images, "show more projects") move the stops.
new ResizeObserver(measure).observe(document.body);
addEventListener("resize", measure);

// ?stage=N jumps to stop N for screenshots; the scroll also skips the intro.
if (params.has("stage")) {
  scrollTo({ top: yForStage(stops, parseFloat(params.get("stage"))), behavior: "instant" });
}

let y = scrollY;
(function loop() {
  y += (scrollY - y) * (reducedMotion ? 1 : 0.1);
  const { from, to, t } = stateAt(stops, y);
  field.setState(from, to, t);
  requestAnimationFrame(loop);
})();

// Particles gather only after the load intro has revealed the name.
const startBirth = () => {
  if (params.get("birth") === "0") field.uniforms.uBirth.value = 1;
  else field.birth();
};
if (root.classList.contains("intro")) {
  document.addEventListener("intro:done", startBirth, { once: true });
} else {
  startBirth();
}
```

- [ ] **Step 2: Screenshot every stop on desktop**

Run: `dev/particles/shoot.sh dev/index_v5.html /private/tmp/claude-shots 1280,800 0 1 2 3 4 5 7 9 10 12 13`
Expected:

| Stage | Expected |
|---|---|
| 0 | Purple globe behind "Cristian Cruz / Product Engineer", no mountain photo |
| 1 | Two people; caption "I find out what people actually need," |
| 2, 3 | Faint dust behind the Portfolio cards, cards fully readable |
| 4 | Decision cluster; "decide what's worth building," |
| 5 | Dust behind Skills |
| 7 | App window; "and then I build it." |
| 9 | Dust at the end of Education |
| 10 | Rocket; large italic "Properly." |
| 12 | Dust behind Get to Know Me |
| 13 | "CRISTIAN CRUZ" in particles above the footer |

- [ ] **Step 3: Screenshot the interludes on mobile**

Run: `dev/particles/shoot.sh dev/index_v5.html /private/tmp/claude-shots 500,900 0 1 4 7 10 13`
Expected: every shape stays inside the frame. Captions don't run into the shapes. If they do, lower that shape's `fit` in `story-shapes.js` or raise `.interlude` `padding-bottom`.

- [ ] **Step 4: Checkpoint.** Run `git status --short`.

---

### Task 9: Fallback and accessibility checks

**Files:** none changed unless a check fails.

- [ ] **Step 1: Reduced motion**

Run: `CHROME_FLAGS=--force-prefers-reduced-motion dev/particles/shoot.sh dev/index_v5.html /private/tmp/claude-shots 1280,800 0 1 1.5`
Expected: globe and people render. Stage 1.5 is a dimmed, plain swap, not a bloom. The load intro is skipped (its gate checks reduced motion), and the hero shows the name immediately.

- [ ] **Step 2: No WebGL**

Run: `CHROME_FLAGS="--disable-webgl --disable-3d-apis" dev/particles/shoot.sh dev/index_v5.html /private/tmp/claude-shots 1280,800 0 1`
Expected: stage 0 shows the mountain hero. Stage 1 shows the caption "I find out what people actually need," on the plain dark background. No blank closing screen.

- [ ] **Step 3: Captions are real text.** Run:

```bash
grep -o 'interlude__caption">[^<]*' dev/index_v5.html
```

Expected: the four caption lines, in order.

- [ ] **Step 4: Production untouched.** Run `git diff --stat`.
Expected: no output, because tracked files are unchanged. All work is in untracked `dev/` and `docs/` files.

---

### Task 10: Review with Cristian (STOP)

- [ ] **Step 1:** Tell Cristian the staging page is ready at `http://127.0.0.1:8765/dev/index_v5.html`. Ask him to check what screenshots can't show:
  - The birth after the wipe intro (open in a fresh tab or private window so the intro plays).
  - Scroll feel through all four interludes.
  - The mouse push.
  - Smoothness on his machine and phone.
- [ ] **Step 2:** Apply his tuning notes. Typical knobs:
  - `fit`, `spin` and `opacity` on shapes in `story-shapes.js`.
  - `uScatter` and `uSize` in `particles.js`.
  - Stop placement in `story.js`.
  - `.interlude` padding.
  - Re-run the Task 8 screenshots after each change.
- [ ] **Step 3:** Get an explicit "ship it" before Task 11.

---

### Task 11: Promote to production (GATED, needs Cristian's approval of the diff)

**Files:**
- Create: `assets/particles/{particles,shapes,story-shapes,timeline,story}.js` (copies; `dev/particles/` stays as the template)
- Modify: `index.html`

- [ ] **Step 1: Copy the modules**

```bash
mkdir -p assets/particles
cp dev/particles/particles.js dev/particles/shapes.js dev/particles/story-shapes.js dev/particles/timeline.js dev/particles/story.js assets/particles/
```

- [ ] **Step 2: Build the candidate `index.html` and show the diff**

```bash
sed -e 's#"\.\./assets/#"assets/#g' -e 's#"\.\./index.js"#"index.js"#' -e 's#"\.\./llms.txt"#"llms.txt"#' -e 's#"\./particles/story.js"#"./assets/particles/story.js"#' dev/index_v5.html > /private/tmp/index.next.html
diff -u index.html /private/tmp/index.next.html
```

Show Cristian the diff. It should contain only:
- The import map and the head WebGL check.
- The particle CSS.
- The canvas element.
- The hero changes.
- The four interludes and the closing stop.
- The removed typewriter.
- The story loader.

- [ ] **Step 3: On approval only, apply it**

```bash
cp /private/tmp/index.next.html index.html
```

- [ ] **Step 4: Verify production**

Run: `dev/particles/shoot.sh index.html /private/tmp/claude-shots 1280,800 0 1 4 7 10 13`
Expected: same results as Task 8, Step 2.

- [ ] **Step 5: Checkpoint.** Run `git status --short` and `git diff --stat`, then hand off to Cristian to commit.

---

### Task 12: Positioning in `llms.txt` and `CLAUDE.md` (GATED, show each diff first)

**Files:**
- Modify: `llms.txt:3`
- Modify: `CLAUDE.md` ("Positioning & Voice" and "File Structure Context")

- [ ] **Step 1: `llms.txt`.** Replace line 3:

```
> Data informs decisions. People make them. I love working with both. Portfolio spanning data engineering, ML pipelines, consulting tooling, and applied research.
```

with:

```
> I find out what people actually need, decide what's worth building, and then I build it. Properly. Product Engineer whose work spans web development, data engineering, consulting tooling, and applied research.
```

- [ ] **Step 2: `CLAUDE.md`, Positioning & Voice.** Replace the two bullets:

```
- **Tagline**: "Data informs decisions. People make them. I love working with both." — this is the professional positioning line in the hero banner. Do not revert to "data enthusiast".
- **Core message**: Cristian bridges data and people. Project descriptions should reinforce this angle — not just technical skills, but impact on stakeholders and decisions.
```

with:

```
- **Positioning line**: "I find out what people actually need, decide what's worth building, and then I build it. Properly." — told across the four particle-story interludes on the homepage. The hero tagline is "Product Engineer". Do not revert to "Data informs decisions…" or "data enthusiast".
- **Core message**: Cristian is a Product Engineer: he decides what gets built and then builds it. Every role (web developer ×2, technical consultant, product engineer) combined both. Data skills support the decisions; they are not the headline. Project descriptions should show the need he found, the call he made, and what he shipped.
```

- [ ] **Step 3: `CLAUDE.md`, File Structure Context.** After the line ``- `/assets` - Static assets (images, `site.css`)`` add:

```
- `/assets/particles` - Particle story engine and story config (Three.js via import map; template and tests live in `/dev/particles`)
```

- [ ] **Step 4: Checkpoint.** Run `git diff --stat` and hand off to Cristian to commit.
