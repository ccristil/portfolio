// The portfolio story's shapes. All are built in code, so no image assets.
// Procedural ones (globe, dust, iceberg, decision, saturnV) also run in Node
// for tests; canvas-drawn ones (appWindow, socials) need a browser.

import { fromFunction, makeCanvas, sampleCanvas } from "./shapes.js";

// Standard normal sample, clamped so outliers don't stretch a shape's bounds.
function gauss() {
  let u = 0;
  while (!u) u = Math.random();
  const g = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random());
  return Math.max(-2.5, Math.min(2.5, g));
}

// Hero: a slowly turning globe of points, lit from above. Shading depends on y
// only, so it stays put while the globe spins.
export function globe(count) {
  const shape = fromFunction(count, () => {
    const z = Math.random() * 2 - 1;
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(1 - z * z);
    const x = r * Math.cos(a);
    const y = r * Math.sin(a);
    return [x, y, z, 0.2 + (0.7 * (y + 1)) / 2];
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

// "I find out what people actually need": an iceberg. The bright, crisp tip
// above the waterline is what people ask for; the much larger, dimmer mass
// below is what they actually need. Stylised and faceted: each part is a stack
// of polygon rings joined by flat faces, like cut ice. Brightness depends on y
// only, so the lighting stays put while it turns.
const ICE_BOTTOM = -1.55; // the keel; the waterline is y = 0 and the peak 0.62
const ICE_WATER = 1.35; // radius of the water surface around the berg
const ICE_STRATA = [-0.42, -0.78, -1.12]; // faint layers inside the mass

export function iceberg(count) {
  // Seeded so the berg keeps the same silhouette on every load.
  let seed = 7;
  const rand = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const TAU = Math.PI * 2;

  // One faceted part: rings of n points at each level, joined by flat faces.
  // Levels run bottom to top (inside() relies on it); r = 0 makes an apex.
  function part(n, levels) {
    const base = Array.from({ length: n }, (_, k) => ((k + (rand() - 0.5) * 0.7) / n) * TAU);
    const rings = levels.map(({ y, r, cx = 0, cz = 0, flat }) =>
      base.map((a0) => {
        const a = a0 + ((rand() - 0.5) * 0.3 * TAU) / n;
        const rr = r * (0.78 + rand() * 0.44);
        const yy = flat ? y : y + (rand() - 0.5) * 0.08;
        return [cx + rr * Math.cos(a), yy, cz + rr * Math.sin(a)];
      })
    );
    const tris = [];
    const edges = [];
    // Underwater apexes, where many edges meet. Their points get thinned out,
    // or they pile up and blow out to white.
    const sunk = (L) => levels[L].r === 0 && levels[L].y < 0;
    for (let L = 0; L < rings.length - 1; L++) {
      for (let k = 0; k < n; k++) {
        const a = rings[L][k], b = rings[L][(k + 1) % n];
        const c = rings[L + 1][(k + 1) % n], d = rings[L + 1][k];
        tris.push([a, b, c], [a, c, d]);
        const tip = sunk(L) ? 0 : sunk(L + 1) ? 1 : null;
        edges.push(Object.assign([a, d], { tip }), Object.assign([a, c], { tip }));
        if (L > 0) edges.push([a, b]);
      }
    }
    const ys = rings.map((ring) => ring.reduce((s, p) => s + p[1], 0) / n);
    return { tris, edges, rings, ys };
  }

  const main = part(9, [
    { y: ICE_BOTTOM, r: 0, cx: 0.12 },
    { y: -1.36, r: 0.36, cx: 0.1 },
    { y: -0.98, r: 0.8, cx: 0.04 },
    { y: -0.55, r: 0.9 },
    { y: -0.2, r: 0.72 },
    { y: 0, r: 0.58, flat: true },
    { y: 0.17, r: 0.44, cx: -0.05 },
    { y: 0.4, r: 0.2, cx: -0.15 },
    { y: 0.62, r: 0, cx: -0.17 },
  ]);
  const peak = part(7, [
    { y: 0, r: 0.3, cx: 0.3, flat: true },
    { y: 0.19, r: 0.16, cx: 0.33 },
    { y: 0.36, r: 0, cx: 0.37 },
  ]);
  // An underwater shelf that reaches out past the tip.
  const shelf = part(7, [
    { y: -1.26, r: 0, cx: 0.36 },
    { y: -1.02, r: 0.34, cx: 0.48 },
    { y: -0.6, r: 0.5, cx: 0.62 },
    { y: -0.24, r: 0, cx: 0.5 },
  ]);
  const parts = [main, peak, shelf];

  // Is (x, y, z) inside a part? Interpolates its cross-section at y.
  function inside({ rings, ys }, x, y, z) {
    if (y < ys[0] || y > ys[ys.length - 1]) return false;
    let L = 0;
    while (L < ys.length - 2 && y > ys[L + 1]) L++;
    const f = (y - ys[L]) / (ys[L + 1] - ys[L] || 1);
    const poly = rings[L].map((p, k) => {
      const q = rings[L + 1][k];
      return [p[0] + (q[0] - p[0]) * f, p[2] + (q[2] - p[2]) * f];
    });
    let hit = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, zi] = poly[i], [xj, zj] = poly[j];
      if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) hit = !hit;
    }
    return hit;
  }
  const insideOther = (self, x, y, z) => parts.some((p) => p !== self && inside(p, x, y, z));
  const insideAny = (x, y, z) => parts.some((p) => inside(p, x, y, z));

  // Weighted picking of triangles (by area) and edges (by length).
  function picker(items, weight) {
    const cum = [];
    let total = 0;
    for (const it of items) cum.push((total += weight(it)));
    return () => {
      const t = Math.random() * total;
      let a = 0, b = cum.length - 1;
      while (a < b) {
        const m = (a + b) >> 1;
        cum[m] < t ? (a = m + 1) : (b = m);
      }
      return items[a];
    };
  }
  const sub = (p, q) => [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
  const area = ([a, b, c]) => {
    const u = sub(b, a), v = sub(c, a);
    return Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]);
  };
  const len = ([a, b]) => Math.hypot(...sub(b, a));
  const tagged = (key, keep) => parts.flatMap((p) => p[key].filter(keep).map((item) => ({ item, part: p })));
  const midY = (pts) => pts.reduce((s, p) => s + p[1], 0) / pts.length;
  const above = (pts) => midY(pts) > 0.001;
  const below = (pts) => midY(pts) < -0.001;
  const pickTriUp = picker(tagged("tris", above), (t) => area(t.item));
  const pickTriDown = picker(tagged("tris", below), (t) => area(t.item));
  const pickEdgeUp = picker(tagged("edges", above), (e) => len(e.item));
  const pickEdgeDown = picker(tagged("edges", below), (e) => len(e.item));

  // Bright above the water, fading the deeper you go; edges a step brighter.
  const lumAt = (y, edge) => {
    if (y > 0) return Math.min(1, (edge ? 0.92 : 0.66) + 0.12 * (y / 0.62) + Math.random() * 0.08);
    const d = Math.min(1, y / ICE_BOTTOM); // the keel's jitter dips just below ICE_BOTTOM
    return (edge ? 0.42 : 0.24) + 0.32 * (1 - d) ** 1.1 + Math.random() * 0.06;
  };

  // Points where parts overlap are skipped, so each face shows only outside.
  function onTri(pick) {
    for (;;) {
      const { item: [a, b, c], part: p } = pick();
      let u = Math.random(), v = Math.random();
      if (u + v > 1) (u = 1 - u), (v = 1 - v);
      const pt = [0, 1, 2].map((i) => a[i] + (b[i] - a[i]) * u + (c[i] - a[i]) * v);
      if (!insideOther(p, ...pt)) return pt;
    }
  }
  function onEdge(pick) {
    for (;;) {
      const { item, part: p } = pick();
      const [a, b] = item;
      const t = Math.random();
      if (item.tip != null) {
        const dist = (item.tip === 0 ? t : 1 - t) * len(item);
        if (Math.random() > dist / 0.3) continue;
      }
      const pt = [0, 1, 2].map((i) => a[i] + (b[i] - a[i]) * t + (Math.random() - 0.5) * 0.006);
      if (!insideOther(p, ...pt)) return pt;
    }
  }
  function inVolume(yMin, yMax) {
    for (;;) {
      const x = -1 + Math.random() * 2.3, z = -1.1 + Math.random() * 2.2;
      const y = yMin + Math.random() * (yMax - yMin);
      if (insideAny(x, y, z)) return [x, y, z];
    }
  }

  const waterRing = [main.rings[5], peak.rings[0]];
  const shape = fromFunction(count, () => {
    const k = Math.random();
    if (k < 0.2) {
      const p = onTri(pickTriUp); // tip faces
      return [...p, lumAt(p[1], false)];
    }
    if (k < 0.29) {
      const p = onEdge(pickEdgeUp); // tip edges
      return [...p, lumAt(p[1], true)];
    }
    if (k < 0.52) {
      const p = onTri(pickTriDown); // underwater faces
      return [...p, lumAt(p[1], false)];
    }
    if (k < 0.6) {
      const p = onEdge(pickEdgeDown); // underwater edges
      return [...p, lumAt(p[1], true)];
    }
    if (k < 0.71) {
      const p = inVolume(ICE_BOTTOM, -0.02); // the mass itself, faint
      return [...p, 0.12 + Math.random() * 0.1];
    }
    if (k < 0.76) {
      const y = ICE_STRATA[(Math.random() * ICE_STRATA.length) | 0] + (Math.random() - 0.5) * 0.01;
      const p = inVolume(y, y);
      return [...p, 0.3 + Math.random() * 0.1];
    }
    if (k < 0.8) {
      // Where the ice meets the water: a bright line around the berg.
      for (;;) {
        const ring = waterRing[Math.random() < 0.75 ? 0 : 1];
        const i = (Math.random() * ring.length) | 0;
        const a = ring[i], b = ring[(i + 1) % ring.length], t = Math.random();
        const x = a[0] + (b[0] - a[0]) * t, z = a[2] + (b[2] - a[2]) * t;
        if (ring === waterRing[1] && inside(main, x, 0, z)) continue;
        return [x, (Math.random() - 0.5) * 0.008, z, 0.85 + Math.random() * 0.15];
      }
    }
    // The water surface: a disc of dust, densest near the berg.
    for (;;) {
      const r = ICE_WATER * Math.sqrt(Math.random());
      const a = Math.random() * TAU;
      const x = r * Math.cos(a), z = r * Math.sin(a);
      if (insideAny(x, 0, z) || Math.random() > 1.15 - r / ICE_WATER) continue;
      return [x, (Math.random() - 0.5) * 0.01, z, 0.12 + 0.3 * (1 - r / ICE_WATER) ** 2 + Math.random() * 0.05];
    }
  });
  shape.fill = 0.45;
  shape.spin = 0.1;
  shape.fit = 0.9;
  shape.loose = 0.5;
  return shape;
}

// "decide what's worth building": a funnel you fly down. Dim options crowd
// its wide mouth and thin out with depth; the walls narrow to one bright
// choice at the tip. It's long along z, and story.js slides it toward the
// camera as you scroll (see `flyTo` in particles.js), so you travel through it.
const FUNNEL_LENGTH = 6; // the mouth's radius is 1
const FUNNEL_TIP = 0.08; // radius at the tip
const FUNNEL_RINGS = 14;
const FUNNEL_ARMS = 5; // spiral arms winding down the walls
const FUNNEL_TURNS = 3; // turns each arm makes from mouth to tip
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
    // Walls. Some gather into ring bands and some into spiral arms; as you fly
    // the rings stream past and the arms seem to turn, like a vortex.
    const pick = Math.random();
    if (pick < 0.45) {
      const u = Math.random();
      const arm = Math.floor(Math.random() * FUNNEL_ARMS);
      const t = (arm / FUNNEL_ARMS + u * FUNNEL_TURNS) * Math.PI * 2 + gauss() * 0.02;
      const r = funnelRadius(u);
      const lum = 0.55 + Math.random() * 0.25 + 0.2 * u;
      return [r * Math.cos(t), r * Math.sin(t), -u * FUNNEL_LENGTH, Math.min(1, lum)];
    }
    const ring = pick < 0.75;
    const u = ring
      ? (Math.floor(Math.random() * FUNNEL_RINGS) + 0.5) / FUNNEL_RINGS + gauss() * 0.003
      : Math.random();
    const r = funnelRadius(u);
    const lum = (ring ? 0.6 : 0.15) + Math.random() * 0.25 + 0.2 * u;
    return [r * Math.cos(a), r * Math.sin(a), -u * FUNNEL_LENGTH, Math.min(1, lum)];
  });
  // Fly to where the tip cluster (every 7th point) landed after normalize().
  let tipZ = 0;
  for (let i = 0; i < count; i += 7) tipZ += shape.positions[i * 3 + 2];
  shape.flyTo = tipZ / Math.ceil(count / 7);
  shape.fit = "cover";
  shape.loose = 0.6;
  shape.opacity = 0.8;
  return shape;
}

// Draws on a 2D canvas, then turns the drawing into particles.
// Use white for bright parts and grays for dimmer, sparser parts.
function drawn(w, h, count, draw, opts) {
  const canvas = makeCanvas(w, h);
  draw(canvas.getContext("2d", { willReadFrequently: true }));
  return sampleCanvas(canvas, count, opts);
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

// "Properly.": a Saturn V lifting off, built in 3D. The body is a surface of
// revolution (SATURN_BODY), plus fins, engine fairings, five F-1 bells, the
// launch escape tower and an exhaust plume. It spins around its long axis, and
// the black-and-white roll pattern is what makes the turn visible (NASA
// painted it for the same reason). Units are metres, roughly to scale, except
// it's drawn SATURN_GIRTH times wider: true proportions read as a thin line.
const SATURN_GIRTH = 1.6;
// Body profile, bottom to top: [y, radius].
const SATURN_BODY = [
  [0, 5.05], // S-IC base
  [42, 5.05], // S-IC / S-II
  [66, 5.05], // top of S-II
  [72.5, 3.3], // interstage taper
  [88, 3.3], // S-IVB + instrument unit
  [96, 1.95], // spacecraft adapter
  [100, 1.95], // service module
  [103.5, 0.35], // command module
];
const SATURN_TOP = 103.5;
const SATURN_SEAMS = [0.15, 42, 47.5, 66, 72.5, 88, 96, 100]; // stage joints: bright rings
const SATURN_ENGINE_EXIT = -5.5; // y of the F-1 bell exits
const SATURN_PLUME_END = -34;

export function saturnV(count) {
  const TAU = Math.PI * 2;
  const outer = [0, 1, 2, 3].map((k) => TAU / 8 + (k * TAU) / 4); // fins, fairings, outer engines

  function radiusAt(y) {
    for (let i = 0; i < SATURN_BODY.length - 1; i++) {
      const [y0, r0] = SATURN_BODY[i], [y1, r1] = SATURN_BODY[i + 1];
      if (y <= y1) return r0 + ((r1 - r0) * (y - y0)) / (y1 - y0);
    }
    return SATURN_BODY[SATURN_BODY.length - 1][1];
  }

  // The roll pattern. Dark panels get few, dim points, so they read as gaps.
  function paint(y, a) {
    a = ((a % TAU) + TAU) % TAU;
    const s8 = Math.floor(a / (TAU / 8));
    const s4 = Math.floor(a / (TAU / 4));
    let dark = false;
    if (y > 1 && y < 22) dark = s8 % 2 === 0; // S-IC lower stripes
    else if (y > 26 && y < 31) dark = s8 % 2 === 1; // intertank, offset
    else if (y > 38.5 && y < 42) dark = true; // forward skirt band
    else if (y > 72.5 && y < 78) dark = s4 % 2 === 0; // S-IVB aft quadrants
    if (dark) return 0.06 + Math.random() * 0.06;
    return 0.78 + 0.15 * (y / SATURN_TOP) + Math.random() * 0.07;
  }

  // Body segments weighted by their side area, so the surface is evenly dotted.
  const segments = SATURN_BODY.slice(0, -1).map(([y0, r0], i) => {
    const [y1, r1] = SATURN_BODY[i + 1];
    return { y0, r0, y1, r1, area: Math.PI * (r0 + r1) * Math.hypot(y1 - y0, r1 - r0) };
  });
  const bodyArea = segments.reduce((s, g) => s + g.area, 0);

  function body() {
    for (;;) {
      let t = Math.random() * bodyArea;
      const g = segments.find((s) => (t -= s.area) <= 0) ?? segments[segments.length - 1];
      const f = Math.random();
      const r = g.r0 + (g.r1 - g.r0) * f;
      if (Math.random() > r / Math.max(g.r0, g.r1)) continue; // even density on cones
      const y = g.y0 + (g.y1 - g.y0) * f;
      const a = Math.random() * TAU;
      const lum = paint(y, a);
      if (Math.random() > 0.15 + lum) continue; // dark panels stay sparse
      return [r * Math.cos(a), y, r * Math.sin(a), lum];
    }
  }

  function seam() {
    const y = SATURN_SEAMS[(Math.random() * SATURN_SEAMS.length) | 0] + gauss() * 0.08;
    const r = radiusAt(y) * 1.01;
    const a = Math.random() * TAU;
    return [r * Math.cos(a), y, r * Math.sin(a), 0.9 + Math.random() * 0.1];
  }

  // A fin: a flat trapezoid sticking out from the base, root 5 m to tip 9.2 m.
  function fin() {
    const a = outer[(Math.random() * 4) | 0];
    for (;;) {
      const t = Math.random();
      const top = 10 + (3 - 10) * t;
      if (Math.random() > (top + 0.5) / 10.5) continue;
      const edge = Math.random() < 0.3;
      const y = edge ? (Math.random() < 0.5 ? top : -0.5) : -0.5 + Math.random() * (top + 0.5);
      const rr = 5.05 + 4.15 * t;
      const off = gauss() * 0.08; // thickness
      return [
        rr * Math.cos(a) - off * Math.sin(a),
        y,
        rr * Math.sin(a) + off * Math.cos(a),
        edge ? 0.92 + Math.random() * 0.08 : 0.6 + Math.random() * 0.15,
      ];
    }
  }

  // Engine fairings: cone-shaped shrouds on the body over each outer engine.
  function fairing() {
    const a0 = outer[(Math.random() * 4) | 0];
    const cx = 4.4 * Math.cos(a0), cz = 4.4 * Math.sin(a0);
    for (;;) {
      const u = Math.random();
      const r = 2.1 * (1 - u);
      const a = Math.random() * TAU;
      const x = cx + r * Math.cos(a), z = cz + r * Math.sin(a);
      if (Math.hypot(x, z) < 5.0) continue; // hidden inside the body
      return [x, -0.5 + u * 11, z, 0.55 + Math.random() * 0.15];
    }
  }

  // The five F-1 bells: one in the middle, four at the corners.
  function engine() {
    const k = (Math.random() * 5) | 0;
    const cx = k === 4 ? 0 : 3.6 * Math.cos(outer[k]);
    const cz = k === 4 ? 0 : 3.6 * Math.sin(outer[k]);
    const rim = Math.random() < 0.3;
    const u = rim ? 1 : Math.random() ** 0.7; // 0 at the throat, 1 at the exit
    const r = 0.75 + 1.1 * u ** 1.6;
    const a = Math.random() * TAU;
    return [cx + r * Math.cos(a), SATURN_ENGINE_EXIT * u, cz + r * Math.sin(a), rim ? 1 : 0.4 + 0.3 * u];
  }

  // Launch escape tower: a four-legged truss, the motor and its nose spike.
  function tower() {
    const k = Math.random();
    if (k < 0.45) {
      const a = outer[(Math.random() * 4) | 0];
      const t = Math.random();
      const r = 0.9 + (0.35 - 0.9) * t;
      return [r * Math.cos(a), SATURN_TOP + 4 * t, r * Math.sin(a), 0.8 + Math.random() * 0.1];
    }
    if (k < 0.9) {
      const y = SATURN_TOP + 4 + Math.random() * 5.5;
      const r = y < SATURN_TOP + 8 ? 0.38 : 0.38 * (1 - (y - SATURN_TOP - 8) / 1.5) + 0.05;
      const a = Math.random() * TAU;
      return [r * Math.cos(a), y, r * Math.sin(a), 0.85 + Math.random() * 0.1];
    }
    return [gauss() * 0.03, SATURN_TOP + 9.5 + Math.random() * 1.2, gauss() * 0.03, 0.95];
  }

  // Exhaust: a bright column that widens and fades as it falls away. Points
  // crowd the core and the top, so it glows hottest right under the engines.
  function plume() {
    const u = Math.random() ** 1.8;
    const y = SATURN_ENGINE_EXIT + u * (SATURN_PLUME_END - SATURN_ENGINE_EXIT);
    const R = 5.2 + 3 * u ** 0.8;
    const f = Math.min(1, Math.abs(gauss()) / 2.2);
    const a = Math.random() * TAU;
    const lum = (1 - 0.7 * u) * (1 - 0.4 * f) + Math.random() * 0.05;
    return [R * f * Math.cos(a), y + gauss() * 0.4, R * f * Math.sin(a), lum];
  }

  // [share of points, maker]. Shares are normalized, so they needn't sum to 1.
  const parts = [
    [0.52, body],
    [0.06, seam],
    [0.07, fin],
    [0.04, fairing],
    [0.07, engine],
    [0.03, tower],
    [0.24, plume],
  ];
  const total = parts.reduce((s, [w]) => s + w, 0);
  const shape = fromFunction(count, () => {
    let t = Math.random() * total;
    const [, make] = parts.find(([w]) => (t -= w) <= 0) ?? parts[parts.length - 1];
    const [x, y, z, lum] = make();
    return [x * SATURN_GIRTH, y, z * SATURN_GIRTH, Math.min(1, lum)];
  });
  shape.fill = 0.8; // higher than the true coverage, to lift the engine's dimming
  shape.fit = 0.8;
  shape.spin = 0.15;
  shape.loose = 0.3;
  return shape;
}

// The closing stop: the GitHub and LinkedIn marks, side by side. They are only
// the picture; real links sit over them (see #closing-links in index.html,
// which assumes GitHub fills the left 40% of the width and LinkedIn the right
// 40%). LinkedIn's tile is dim and its "in" bright, so the letters float in
// front of the tile.
const GITHUB_MARK =
  "M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z";
const LINKEDIN_MARK =
  "M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z";

export function socials(count) {
  const shape = drawn(1000, 400, count, (ctx) => {
    ctx.save();
    ctx.scale(25, 25);
    ctx.fillStyle = "#d0d0d0";
    ctx.fill(new Path2D(GITHUB_MARK));
    ctx.restore();

    const mark = new Path2D(LINKEDIN_MARK);
    // The "in" is the holes in LinkedIn's path: cut the path out of a white
    // square (inset so the corners stay inside the tile) to keep just the holes.
    const letters = makeCanvas(400, 400);
    const lctx = letters.getContext("2d");
    lctx.scale(400 / 24, 400 / 24);
    lctx.fillStyle = "#fff";
    lctx.fillRect(2, 2, 20, 20); // inside the tile's rounded corners
    lctx.globalCompositeOperation = "destination-out";
    lctx.fill(mark);

    ctx.save();
    ctx.translate(600, 0);
    ctx.scale(400 / 24, 400 / 24);
    ctx.fillStyle = "#9a9a9a";
    ctx.fill(mark);
    ctx.restore();
    ctx.drawImage(letters, 600, 0);
  }, { depth: 0.2 });
  shape.fit = matchMedia("(max-width: 640px)").matches ? 1 : 0.5; // phones need bigger tap targets
  shape.loose = 0.4; // keep the marks readable
  return shape;
}
