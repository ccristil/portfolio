// Shape makers. Every maker returns the same format:
//   { positions: Float32Array(count * 3), lum: Float32Array(count),
//     aspect: { w, h }, fill }
// positions are centered and normalized so the larger of width/height is 1.
// fill is how much of its bounding box the shape covers; the engine uses it
// to dim shapes that crowd many particles into a small area.
// sampleCanvas (and therefore fromEmoji, fromText and fromImage) returns null
// if nothing opaque was drawn, so callers should handle null (e.g. `?? fallback`).
// fromFunction's fill of 0.6 is a default guess; procedural shapes should set
// `.fill` themselves when that's wrong.
// Optional settings the engine reads (set them on the returned object):
//   fit (number or "cover"), opacity (0–1), spin (radians/second),
//   loose (how far particles wander at rest; default 1),
//   flyTo (shape-space z the camera flies to; see particles.js).

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
