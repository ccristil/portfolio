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

// "decide what's worth building": a wide, dim field of options, with one in
// seven points gathered into a single bright choice.
export function decision(count) {
  const focus = [0.35, 0.1];
  const shape = fromFunction(count, (i) => {
    if (i % 7 === 0) {
      const r = 0.04 * Math.hypot(gauss(), gauss());
      const a = Math.random() * Math.PI * 2;
      return [focus[0] + r * Math.cos(a), focus[1] + r * Math.sin(a), gauss() * 0.02, 0.85 + Math.random() * 0.15];
    }
    return [gauss() * 0.55, gauss() * 0.35, gauss() * 0.15, 0.12 + Math.random() * 0.3];
  });
  shape.fit = 0.85;
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
