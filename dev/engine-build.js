// Stage 2 of the Coyote sequence: the engine assembling from an exploded view.
// Prototype for dev/engine.html; it rewrites the engine shape's points on the
// CPU each frame. Not used by the live page.
//
// Each CAD part moves as one rigid piece along its assembly direction, in the
// order a builder would fit it, and glows briefly as it seats. Points on faces
// the finished engine hides (the heads under the cam covers, the block under
// everything) sit on those faces while the part is out, then slide onto a
// visible point of the same part as the engine closes up, so the assembled
// engine is as dense as the static one.

// Where each part waits in the exploded view, as [x, y, z] in CAD millimetres
// (x runs front to back, y driver to passenger, z up), the step at which it
// goes in, and an optional extra delay (share of the build) so a set of parts
// can ripple in. Heads, covers and pistons move along their bank (the V is
// 90°). Ids from 37 are the modelled internals (internals.py).
const B = Math.SQRT1_2;
const bank = (side, d) => [0, side * d * B, d * B]; // side: -1 driver, +1 passenger
export const EXPLODE = {
  // 0: the crank comes up into the block from below
  37: [[0, 0, -420], 0], // crankshaft (modelled)
  18: [[320, 0, 0], 0], // rear engine plate
  0: [[200, 0, 0], 0], // rear crank seal retainer
  1: [[260, 0, 0], 0],
  // 1: pistons and rods drop into their bores, one after another
  ...Object.fromEntries([38, 39, 40, 41].map((id, k) => [id, [bank(1, 300), 1, k * 0.012]])), // passenger, 1–4
  ...Object.fromEntries([42, 43, 44, 45].map((id, k) => [id, [bank(-1, 300), 1, k * 0.012 + 0.006]])), // driver, 5–8
  // 2: sump, and the flexplate on the back of the crank
  3: [[0, 0, -700], 2],
  57: [[480, 0, 0], 2], // flexplate (modelled)
  // 3: cylinder heads
  9: [bank(-1, 440), 3],
  10: [bank(1, 440), 3],
  // 4: camshafts drop into the heads (modelled)
  46: [bank(1, 560), 4], // passenger intake
  47: [bank(1, 560), 4, 0.008], // passenger exhaust
  48: [bank(-1, 560), 4, 0.004], // driver intake
  49: [bank(-1, 560), 4, 0.012], // driver exhaust
  // 5: timing chains (modelled)
  50: [[-220, 0, 0], 5],
  51: [[-220, 0, 0], 5, 0.008],
  // 6: timing cover
  28: [[-340, 0, 0], 6],
  // 7: cam covers
  32: [bank(-1, 680), 7],
  33: [bank(1, 680), 7],
  // 8: coils and plugs drop through the cam covers (modelled)
  55: [bank(1, 900), 8],
  56: [bank(-1, 900), 8, 0.008],
  // 9: exhaust headers
  34: [[0, -360, -40], 9],
  35: [[0, 360, -40], 9],
  // 10: cooling and oil filter
  15: [[-420, 0, 0], 10], // water pump
  13: [[-470, -160, 0], 10], // water inlet
  14: [[-450, -120, 30], 10], // thermostat
  12: [[-420, -40, 160], 10], // heater tube
  36: [[0, -200, -120], 10], // filter adapter
  27: [[0, -300, -220], 10], // oil filter
  // 11: fuel rails and injectors (modelled)
  52: [[0, 60, 340], 11],
  53: [[0, -60, 340], 11, 0.008],
  // 12: intake manifold, its rear shell, throttle body
  54: [[0, 0, 520], 12], // intake manifold (modelled)
  58: [[0, 0, 520], 12], // its runner tops and trumpets, seen through the cover (modelled)
  31: [[120, 0, 560], 12],
  8: [[-320, 0, 260], 12],
  // 13: alternator, AC compressor
  26: [[-300, -300, 0], 13],
  24: [[-300, 300, 0], 13],
  25: [[-380, 340, 0], 13],
  // 14: damper and pulleys
  29: [[-520, 0, 0], 14],
  11: [[-560, 0, 0], 14],
  30: [[-600, 0, 0], 14],
  // 15: belts
  17: [[-720, 0, 0], 15],
  16: [[-680, 0, 0], 15],
  // 16: coil covers
  20: [bank(-1, 1080), 16],
  21: [bank(1, 1080), 16],
  // 17: hoses and small fittings
  4: [[-200, 0, 640], 17],
  5: [[-200, 160, 620], 17],
  6: [[-200, 180, 630], 17],
  7: [[-200, 120, 610], 17],
  22: [[-260, 0, 600], 17],
  23: [[-200, -160, 620], 17],
  // 18: the engine cover goes on last
  19: [[0, 0, 840], 18],
};
const STEPS = 19;
const DURATION = 0.25; // of the whole build, per part; steps overlap

const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// data: { positions, lum, parts, hidden } in shape space (positions already
// turned to the view), mmToUnit, and turn(x, y, z) → [x, y, z], the same turn
// the positions had, for the offsets. apply() writes into `out` ({ positions,
// lum }) and returns the framing scale (≤ 1, smaller while parts are out).
// With zoom: false it leaves the scale to the caller (a scene with its own
// camera can pull back by 1 / scale instead).
export function createBuild({ positions, lum, parts, hidden, partner: given }, mmToUnit, turn, { zoom: useZoom = true } = {}) {
  const n = lum.length;
  const offsets = new Map();
  for (const [part, [[x, y, z], step, delay = 0]] of Object.entries(EXPLODE)) {
    // CAD → shape space: x right = -y, y up = z, z towards the camera = -x.
    const start = (step / (STEPS - 1)) * (1 - DURATION - 0.03) + delay;
    offsets.set(+part, { off: turn(-y * mmToUnit, z * mmToUnit, -x * mmToUnit), start });
  }

  // Each hidden point's partner: the nearby visible point export.py chose, or
  // failing that a random visible point of the same part; nudged a little so
  // the pair doesn't stack into one bright dot.
  const byPart = new Map();
  for (let i = 0; i < n; i++) {
    if (hidden[i]) continue;
    if (!byPart.has(parts[i])) byPart.set(parts[i], []);
    byPart.get(parts[i]).push(i);
  }
  const partner = new Int32Array(n).fill(-1);
  const jitter = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    if (!hidden[i]) continue;
    const pool = byPart.get(parts[i]);
    if (given?.[i] >= 0) partner[i] = given[i];
    else if (pool) partner[i] = pool[(Math.random() * pool.length) | 0];
    else continue;
    for (let a = 0; a < 3; a++) jitter[i * 3 + a] = (Math.random() - 0.5) * 0.0025;
  }

  // How far out the bulk of the points sit (a high percentile, so one far
  // part doesn't set the size), across and up.
  const extent = (p) => {
    const r = new Float32Array(n), h = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      r[i] = Math.hypot(p[i * 3], p[i * 3 + 2]);
      h[i] = Math.abs(p[i * 3 + 1]);
    }
    const at = (a) => a.sort()[Math.floor(n * 0.97)];
    return [at(r), at(h)];
  };
  // While parts are out the engine is drawn smaller, just enough that the
  // bulk of it stays inside MARGIN × the finished size, so the view eases in
  // (like a slow dolly) as it comes together. Measured at ZOOM_STEPS points
  // along the build ahead of time and interpolated, which keeps it smooth.
  const MARGIN = 1.25, ZOOM_STEPS = 48;
  const [r0, h0] = extent(positions);
  let zoomFor = null, zoom = null;

  // u: 0 fully exploded … 1 assembled. spread scales the exploded distances.
  return function apply(u, spread, out) {
    if (zoomFor !== spread) {
      zoom = new Float32Array(ZOOM_STEPS + 1);
      for (let k = 0; k <= ZOOM_STEPS; k++) {
        place(k / ZOOM_STEPS, spread, out);
        const [r, h] = extent(out.positions);
        zoom[k] = Math.min(1, (MARGIN * r0) / r, (MARGIN * h0) / h);
      }
      zoomFor = spread;
    }
    place(u, spread, out);
    const f = Math.min(1, Math.max(0, u)) * ZOOM_STEPS, k0 = Math.min(ZOOM_STEPS - 1, Math.floor(f));
    const k = zoom[k0] + (zoom[k0 + 1] - zoom[k0]) * (f - k0);
    if (useZoom) for (let i = 0; i < n * 3; i++) out.positions[i] *= k;
    return k;
  };

  function place(u, spread, out) {
    const state = new Map();
    for (const [part, { off, start }] of offsets) {
      const p = (u - start) / DURATION;
      const away = 1 - easeInOut(Math.min(1, Math.max(0, p)));
      // A short glow as the part seats (p just past 1).
      const glow = Math.exp(-((((p - 1) * DURATION) / 0.025) ** 2));
      state.set(part, { dx: off[0] * away * spread, dy: off[1] * away * spread, dz: off[2] * away * spread, glow });
    }
    const close = smoothstep(0.82, 1, u); // hidden points move onto visible faces
    const still = { dx: 0, dy: 0, dz: 0, glow: 0 };
    for (let i = 0; i < n; i++) {
      const s = state.get(parts[i]) ?? still;
      let x = positions[i * 3], y = positions[i * 3 + 1], z = positions[i * 3 + 2], l = lum[i];
      const j = partner[i];
      if (j >= 0 && close > 0) {
        x += (positions[j * 3] + jitter[i * 3] - x) * close;
        y += (positions[j * 3 + 1] + jitter[i * 3 + 1] - y) * close;
        z += (positions[j * 3 + 2] + jitter[i * 3 + 2] - z) * close;
        l += (lum[j] - l) * close;
      }
      out.positions[i * 3] = x + s.dx;
      out.positions[i * 3 + 1] = y + s.dy;
      out.positions[i * 3 + 2] = z + s.dz;
      out.lum[i] = Math.min(1, l * (1 + 0.8 * s.glow));
    }
  }
}
