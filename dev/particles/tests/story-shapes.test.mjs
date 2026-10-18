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
  for (const [x, y] of bright) assert.ok(Math.hypot(x - cx, y - cy) < 0.07);
  const dim = Array.from(s.lum).filter((l) => l < 0.85);
  assert.ok(dim.every((l) => l < 0.45));
});
