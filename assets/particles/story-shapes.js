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

// "I find out what people actually need": two people talking.
export function people(count) {
  const shape = drawn(640, 420, count, (ctx) => {
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
  shape.fit = 0.58;
  return shape;
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
  const shape = drawn(300, 1020, count, (ctx) => {
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
    ctx.fillStyle = "#444";
    ctx.fillRect(95, 456, 110, 14); // roll-pattern bands
    ctx.fillRect(95, 610, 110, 14);
    ctx.fillRect(95, 700, 110, 14);
    poly([[95, 690], [58, 785], [95, 785]], "#fff"); // fins
    poly([[205, 690], [242, 785], [205, 785]], "#fff");
    for (const x of [112, 131, 150, 169, 188]) poly([[x - 7, 760], [x + 7, 760], [x + 11, 795], [x - 11, 795]], "#e0e0e0");
    const plume = ctx.createLinearGradient(0, 810, 0, 1020);
    plume.addColorStop(0, "#fff");
    plume.addColorStop(1, "#555");
    ctx.fillStyle = plume;
    ctx.beginPath();
    ctx.moveTo(92, 810);
    ctx.quadraticCurveTo(60, 930, 150, 1020);
    ctx.quadraticCurveTo(240, 930, 208, 810);
    ctx.closePath();
    ctx.fill();
  }, { depth: 0.15 });
  shape.fit = 0.8;
  return shape;
}
