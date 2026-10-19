// The orca pod that swims past the iceberg (interlude 1). Pure maths, so it
// also runs in Node: the orca model, the swim schedule and the berg's outline.
// orcas.js turns it into a point layer on the particle field.
//
// Units are the iceberg's raw units: the waterline is y = 0, the berg turns
// around x = cx (about 0), z = 0, and +z points toward the camera.

// --- schedule -------------------------------------------------------------------
export const LEAD_IN = 3; // empty seconds before each pass
export const CROSSING = 12; // seconds a pass takes, first nose in to last tail out
export const CYCLE = 2 * (LEAD_IN + CROSSING);
const CRUISE_Y = -0.3; // the bull's body line, under the surface
const RISE_Y = -0.14; // where the bull rises to, so its fin breaks the surface
const RISE_SECONDS = 2.4;
const SURGE = 0.15; // the lead speeds up and eases off by about this much
const DRIFT = 0.055; // how far the path wanders up and down
const BOW = 0.15; // how far the path bows away from the berg mid-pass…
const WEAVE = 0.12; // …and weaves in and out around that
const LEAN = 0.2; // the most an orca leans into a turn, in radians
const STRAGGLE = 0.07; // how much each follower's spacing drifts
const BOB = 0.012; // each orca's own gentle up-and-down
export const SPINE = 9; // points along each body that the shader bends it through
// The swim stroke is a wave running back along the body, WAVE radians per
// body length. It runs back SLIP times faster than the orca swims, so it
// pushes water backward and the tail reads as what moves the orca forward.
// Tying it to distance swum also means faster swimming, and smaller orcas,
// beat faster.
export const WAVE = 4.5;
const SLIP = 1.4;
// The camera sits level with the pod, which would show the flukes edge-on.
// A slight bank, belly toward the camera, shows them and the white belly.
export const BANK = 0.28;
// Each pass meanders its own way: phases for the two up-and-down waves and
// the in-and-out weave.
const MEANDER = [
  [0.4, 1.7, 2.2],
  [2.5, 0.3, 4.0],
];

// The pod, lead first. L: body length. fin: dorsal fin height (fraction of L).
// back: how far behind the lead it swims, along the path. out: how much
// further from the berg than the pod's lane. dy: height offset. glide: where
// in each surge it coasts (radians), so the pod doesn't rest in unison.
export const POD = [
  { kind: "bull", L: 0.62, fin: 0.2, back: 0, out: 0.15, dy: 0, glide: 0 },
  { kind: "female", L: 0.5, fin: 0.14, back: 0.8, out: 0.4, dy: -0.13, glide: 0.5 },
  { kind: "calf", L: 0.3, fin: 0.12, back: 0.86, out: 0.5, dy: -0.27, glide: 1.1 },
  { kind: "female", L: 0.5, fin: 0.14, back: 1.45, out: 0, dy: 0, glide: 0.8 },
];

// Where every orca is at `seconds` on the pod clock.
// view: { cx, clear, halfWidth(z) }. clear is the pod's lane: its distance
// from the berg's axis (see laneClearance). halfWidth(z) is how far the
// screen reaches either side of cx at depth z.
// Returns { pass, active, orcas }. pass is 0 (left to right, in front) or 1
// (right to left, behind). Each orca is
// { x, y, z, spine, roll, lean, phase, stroke }: its middle, SPINE points
// along its body from nose to tail, its roll and its lean into the current
// turn (radians), its tail-beat phase and how hard it's stroking (0 = gliding).
//
// The lead swims a meandering path, and the others follow the same path a
// little way behind, so the pod snakes along it rather than moving as one
// block. Each orca's body bends along its own stretch of the path.
export function podAt(seconds, view, { still = false } = {}) {
  const c = ((seconds % CYCLE) + CYCLE) % CYCLE;
  const pass = c < LEAD_IN + CROSSING ? 0 : 1;
  const local = c - pass * (LEAD_IN + CROSSING) - LEAD_IN;
  if (local < 0) return { pass, active: false, orcas: [] };

  const f = local / CROSSING;
  const dir = pass === 0 ? 1 : -1; // +1: left to right
  const side = pass === 0 ? 1 : -1; // +1: in front of the berg
  const [p1, p2, p3] = MEANDER[pass];

  // The pass starts with the bull's nose at the screen edge and ends once
  // the last tail has left the other one. Behind the berg, the weave can
  // carry an orca further back, where the screen reaches wider.
  const reach = (o) => view.halfWidth(side * (view.clear + o.out + (side < 0 ? BOW + WEAVE : 0)));
  const bull = POD[0];
  const start = view.halfWidth(side * (view.clear + bull.out)) + bull.L / 2;
  const end = Math.max(...POD.map((o) => reach(o) + o.back * (1 + STRAGGLE) + o.L / 2));
  const span = start + end;

  // The path, by distance s travelled along it.
  const xAt = (s) => view.cx + dir * (s - start);
  const env = (s) => Math.sin(Math.PI * Math.min(1, Math.max(0, s / span)));
  // Out from the lane only, never toward the berg.
  const outAt = (s) => env(s) * (BOW + WEAVE * Math.sin((2 * Math.PI * s) / 3.1 + p3));
  // The bull rises once a pass: in front of the berg on the way out, and on
  // the way back between the berg and the screen edge, where the fin isn't
  // hidden behind the berg's tip.
  const riseX = pass === 0
    ? view.cx + 0.25
    : view.cx - (view.clear + view.halfWidth(side * (view.clear + bull.out))) / 2;
  const riseW = (span / CROSSING) * (RISE_SECONDS / 2);
  function yAt(i, s) {
    let y = CRUISE_Y + POD[i].dy
      + DRIFT * Math.sin((2 * Math.PI * s) / 2.4 + p1)
      + 0.35 * DRIFT * Math.sin((2 * Math.PI * s) / 1.7 + p2);
    if (i === 0) {
      const u = (xAt(s) - riseX) / riseW;
      if (Math.abs(u) < 1) y += (RISE_Y - y) * 0.5 * (1 + Math.cos(Math.PI * u));
    }
    return y;
  }
  const zAt = (i, s) => side * (view.clear + POD[i].out + outAt(s));
  const point = (i, s) => [xAt(s), yAt(i, s), zAt(i, s)];
  const facing = (i, s, h) => {
    const a = point(i, s - h), b = point(i, s + h);
    const dx = b[0] - a[0], dz = b[2] - a[2];
    const n = Math.hypot(dx, dz);
    return { hx: dx / n, hz: dz / n };
  };

  // The lead surges and eases instead of gliding at one speed.
  const sLead = span * (f + (SURGE * Math.sin(4 * Math.PI * f)) / (4 * Math.PI));
  const H = 0.02;
  const orcas = POD.map((o, i) => {
    const gap = o.back * (1 + (still ? 0 : STRAGGLE * Math.sin(seconds * 0.37 + i * 2.1)));
    const s = sLead - gap;
    const bob = still ? 0 : BOB * Math.sin(seconds * 0.6 + i * 1.9);
    // The spine: points along this orca's own stretch of path, nose first,
    // so the body bends through turns and climbs and the tail follows the
    // line the head swam.
    const spine = Array.from({ length: SPINE }, (_, k) => {
      const [x, y, z] = point(i, s + o.L * (0.5 - k / (SPINE - 1)));
      return [x, y + bob, z];
    });
    const [x, y, z] = point(i, s);
    // Lean into turns: positive roll tips the back toward the orca's right.
    const { hx, hz } = facing(i, s, H);
    const ahead = facing(i, s + H, H), behind = facing(i, s - H, H);
    const turn = ((ahead.hx - behind.hx) * -hz + (ahead.hz - behind.hz) * hx) / (2 * H);
    const lean = Math.max(-LEAN, Math.min(LEAN, 0.4 * turn));
    // Cause and effect: strokes are hardest while the pod speeds up, then
    // each orca coasts in a short glide as it slows, until the next push.
    const surge = 4 * Math.PI * (s / span);
    const glide = Math.max(0, Math.sin(surge - 0.3 + o.glide)) ** 6;
    return {
      x,
      y: y + bob,
      z,
      spine,
      roll: -BANK * dir + lean,
      lean,
      phase: still ? 0 : (SLIP * WAVE * s) / o.L + i * 1.3,
      stroke: still ? 0 : (1 - 0.4 * Math.sin(surge)) * (1 - 0.85 * glide),
    };
  });
  return { pass, active: true, orcas };
}

// How much of shape `index` is on screen, 0–1, for a { from, to, t } from
// timeline.js's stateAt. Matches the engine: each shape is held for the first
// and last 8% of a morph, so 1 means fully formed.
export function presenceOf({ from, to, t }, index) {
  const m = from === to ? 0 : smoothstep(0.08, 0.92, t);
  return (from === index ? 1 - m : 0) + (to === index ? m : 0);
}

// --- the berg's outline ------------------------------------------------------------
// The berg's widest reach from its turning axis at evenly spaced heights,
// measured from its actual points, so it covers every angle the berg turns
// through. The water surface (y ≈ 0) is left out, or it would swallow the
// waterline. Returns { y0, y1, radii }.
export function bergProfile({ positions, frame: { cx, cy, s } }, bands = 16) {
  let y0 = Infinity, y1 = -Infinity;
  for (let i = 1; i < positions.length; i += 3) {
    const y = positions[i] / s + cy;
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  }
  const radii = new Float32Array(bands);
  for (let i = 0; i < positions.length; i += 3) {
    const y = positions[i + 1] / s + cy;
    if (Math.abs(y) < 0.012) continue;
    const j = Math.round(((y - y0) / (y1 - y0)) * (bands - 1));
    const r = Math.hypot(positions[i] / s, positions[i + 2] / s); // x - cx, z
    if (r > radii[j]) radii[j] = r;
  }
  return { y0, y1, radii };
}

export function radiusAt({ y0, y1, radii }, y) {
  const f = ((y - y0) / (y1 - y0)) * (radii.length - 1);
  if (f < 0 || f > radii.length - 1) return 0;
  const i = Math.min(Math.floor(f), radii.length - 2);
  return radii[i] + (radii[i + 1] - radii[i]) * (f - i);
}

// The pod's lane: far enough from the axis that no orca touches the berg at
// the heights the pod swims through.
export function laneClearance(profile, margin = 0.1) {
  const low = CRUISE_Y + Math.min(...POD.map((o) => o.dy)) - 0.1;
  let r = 0;
  for (let y = low; y <= CRUISE_Y + 0.2; y += 0.02) r = Math.max(r, radiusAt(profile, y));
  return r + margin;
}

// --- the model ---------------------------------------------------------------------
// The body, nose (u = 0) to tail stalk: [u, radius as a fraction of L].
const BODY = [
  [0, 0], [0.02, 0.04], [0.07, 0.072], [0.16, 0.098], [0.3, 0.11], [0.45, 0.104],
  [0.6, 0.084], [0.72, 0.058], [0.82, 0.034], [0.9, 0.016],
];
const SIDES = 8;
const TALL = 1.06; // rings are a little taller than wide…
const WIDE = 0.88; // …because orcas are deep-bodied

// Fins as outlines. Dorsal: [u, height as a fraction of the fin's height].
const DORSAL_STRAIGHT = [[0.35, 0], [0.4, 0.5], [0.43, 1], [0.46, 0.55], [0.5, 0]];
const DORSAL_CURVED = [[0.37, 0], [0.42, 0.55], [0.47, 0.9], [0.53, 1], [0.5, 0.6], [0.49, 0.25], [0.5, 0]];
// Pectoral paddle: [du, dy, dz] from where it joins the body, in L.
const PECTORAL = [[0, 0, 0], [0.03, -0.02, 0.03], [0.08, -0.05, 0.08], [0.12, -0.06, 0.1], [0.135, -0.045, 0.09], [0.1, -0.02, 0.05], [0.05, 0, 0.01]];
// One fluke: [u, z in L], flat at the body line. Mirrored for the other.
const FLUKE = [[0.86, 0], [0.9, 0.035], [0.95, 0.095], [0.99, 0.13], [1, 0.115], [0.985, 0.06], [0.965, 0]];

// Seeded, so each orca keeps the same look on every load.
function seeded(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function radiusOf(u) {
  if (u <= 0 || u >= BODY[BODY.length - 1][0]) return u <= 0 ? 0 : BODY[BODY.length - 1][1];
  let i = 0;
  while (BODY[i + 1][0] < u) i++;
  const [u0, r0] = BODY[i], [u1, r1] = BODY[i + 1];
  return r0 + ((r1 - r0) * (u - u0)) / (u1 - u0);
}

// One orca as `count` points in its own frame: nose toward +x, middle at the
// origin, y up. Returns { positions, lum, along, part }. along is each
// point's u (0 nose … 1 fluke tips), which the shader uses to place it on the
// spine. part is PARTS' index for the point (so the shader can move fins).
export const PARTS = ["body", "fin", "pectoral", "fluke"];
export function orca({ L, fin }, count, seed = 1) {
  const rand = seeded(seed);
  const X = (u) => (0.5 - u) * L;
  // Points are [x, y, z, u]; each triangle and edge also carries its part.
  const tris = [];
  const edges = [];

  const rings = BODY.map(([u, r]) =>
    Array.from({ length: SIDES }, (_, k) => {
      const a = ((k + 0.5) / SIDES) * Math.PI * 2;
      return [X(u), r * L * TALL * Math.sin(a), r * L * WIDE * Math.cos(a), u];
    })
  );
  for (let j = 0; j < rings.length - 1; j++) {
    for (let k = 0; k < SIDES; k++) {
      const a = rings[j][k], b = rings[j][(k + 1) % SIDES];
      const c = rings[j + 1][(k + 1) % SIDES], d = rings[j + 1][k];
      tris.push({ pts: [a, b, c], part: "body" }, { pts: [a, c, d], part: "body" });
      edges.push({ pts: [a, d], part: "body" });
      if (j > 0) edges.push({ pts: [a, b], part: "body" });
    }
  }

  // A fin from its outline: a fan from the middle, plus its rim as edges.
  function addFin(outline, part = "fin") {
    const m = [0, 1, 2, 3].map((i) => outline.reduce((s, p) => s + p[i], 0) / outline.length);
    for (let i = 0; i < outline.length; i++) {
      const p = outline[i], q = outline[(i + 1) % outline.length];
      tris.push({ pts: [m, p, q], part, weight: 2.5 });
      edges.push({ pts: [p, q], part });
    }
  }
  const topAt = (u) => radiusOf(u) * L * TALL;
  const dorsal = fin >= 0.15 ? DORSAL_STRAIGHT : DORSAL_CURVED;
  addFin(dorsal.map(([u, h]) => [X(u), topAt(u) - 0.01 * L + h * fin * L, 0, u]));
  for (const side of [1, -1]) {
    const u0 = 0.22, r0 = radiusOf(u0) * L;
    const root = [X(u0), -0.55 * r0 * TALL, side * 0.85 * r0 * WIDE];
    addFin(PECTORAL.map(([du, dy, dz]) => [root[0] - du * L, root[1] + dy * L, root[2] + side * dz * L, u0 + du]), "pectoral");
    addFin(FLUKE.map(([u, z]) => [X(u), 0, side * z * L, u]), "fluke");
  }

  const sub = (p, q) => [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
  const area = ([a, b, c]) => {
    const v = sub(b, a), w = sub(c, a);
    return Math.hypot(v[1] * w[2] - v[2] * w[1], v[2] * w[0] - v[0] * w[2], v[0] * w[1] - v[1] * w[0]) / 2;
  };
  const len = ([a, b]) => Math.hypot(...sub(b, a));
  function picker(items, weight) {
    const cum = [];
    let total = 0;
    for (const it of items) cum.push((total += weight(it)));
    return () => {
      const t = rand() * total;
      let a = 0, b = cum.length - 1;
      while (a < b) {
        const m = (a + b) >> 1;
        cum[m] < t ? (a = m + 1) : (b = m);
      }
      return items[a];
    };
  }
  const pickTri = picker(tris, (t) => area(t.pts) * (t.weight ?? 1));
  const pickEdge = picker(edges, (e) => len(e.pts));

  // The markings, as brightness. yr and zr are the point's height and side
  // relative to the body's radius there (-1…1).
  function lumAt(x, y, z, u, part, edge) {
    const lift = edge ? 0.14 : 0;
    if (part === "body") {
      const r = Math.max(radiusOf(u) * L, 1e-6);
      const yr = y / (r * TALL), zr = z / (r * WIDE);
      // The eye patch: a bright oval above and behind the eye.
      if (Math.abs(zr) > 0.3 && ((u - 0.185) / 0.065) ** 2 + ((yr - 0.3) / 0.24) ** 2 < 1) {
        return 0.85 + rand() * 0.1;
      }
      // White chin and belly, sweeping up the flank behind the dorsal fin.
      const sweep = Math.max(0, 1 - Math.abs(u - 0.62) / 0.12);
      if (u > 0.03 && u < 0.74 && yr < -0.35 + 0.5 * sweep) {
        return 0.72 + rand() * 0.08 + lift;
      }
      // The grey saddle patch just behind the dorsal fin.
      if (yr > 0.6 && u > 0.47 && u < 0.6) return 0.55 + rand() * 0.06;
    }
    // Fins are black too, but their rims stay bright so the shapes read.
    // The flukes' white undersides show through the bank.
    if (part === "fin" || part === "pectoral") return edge ? 0.75 + rand() * 0.1 : 0.38 + rand() * 0.08;
    if (part === "fluke") return 0.5 + rand() * 0.1 + lift;
    return 0.27 + rand() * 0.08 + lift;
  }

  const positions = new Float32Array(count * 3);
  const lum = new Float32Array(count);
  const along = new Float32Array(count);
  const parts = new Float32Array(count);
  const jitter = () => (rand() - 0.5) * 0.008 * L;
  // Bright points are kept more often (like sampleCanvas), so the white
  // markings come out dense and the black body stays a sparse silhouette.
  for (let n = 0; n < count; ) {
    let p, part, edge = false;
    if (rand() < 0.85) {
      const t = pickTri();
      let a = rand(), b = rand();
      if (a + b > 1) (a = 1 - a), (b = 1 - b);
      const [A, B, C] = t.pts;
      p = [0, 1, 2, 3].map((i) => A[i] + (B[i] - A[i]) * a + (C[i] - A[i]) * b);
      part = t.part;
    } else {
      const e = pickEdge();
      const t = rand();
      const [A, B] = e.pts;
      p = [0, 1, 2, 3].map((i) => A[i] + (B[i] - A[i]) * t);
      part = e.part;
      edge = true;
    }
    const [x, y, z, u] = p;
    const l = Math.min(1, lumAt(x, y, z, u, part, edge));
    if (rand() > 0.2 + l ** 1.5) continue;
    positions.set([x + jitter(), y + jitter(), z + jitter()], n * 3);
    lum[n] = l;
    along[n] = u;
    parts[n] = PARTS.indexOf(part);
    n++;
  }
  return { positions, lum, along, part: parts };
}

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
