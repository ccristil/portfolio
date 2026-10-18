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
  assert.equal(yForStage(stops, NaN), 0);
});

test("a single stop rests on its shape at any y", () => {
  const one = [{ y: 0, shape: 5 }];
  for (const y of [-1, 0, 1]) {
    assert.deepEqual(stateAt(one, y), { from: 5, to: 5, t: 0 });
  }
});

test("exactly on the first or last stop rests on that shape", () => {
  assert.deepEqual(stateAt(stops, 0), { from: 0, to: 0, t: 0 });
  assert.deepEqual(stateAt(stops, 300), { from: 2, to: 2, t: 0 });
});
