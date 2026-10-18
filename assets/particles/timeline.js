// Scroll timeline: maps a scroll position to which two shapes are on screen
// and how far the morph between them has got.
//
// A stop is { y, shape }: y is a scrollY value, shape an index into the
// engine's shape list. Between two stops the morph runs linearly; two
// neighbouring stops with the same shape hold it (that's how a long section
// keeps the dust on screen while you read it). Two stops with equal y make a
// hard cut (a zero-length morph).

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
  if (!Number.isFinite(stage)) stage = 0;
  const i = Math.max(0, Math.min(stops.length - 1, Math.floor(stage)));
  const j = Math.min(stops.length - 1, i + 1);
  const f = Math.min(1, Math.max(0, stage - i));
  return stops[i].y + (stops[j].y - stops[i].y) * f;
}
