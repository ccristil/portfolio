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
