// The portfolio's particle story: which shape shows where on the page.
// Loaded by the page with import(); any throw here falls back to the plain hero.

import { createParticleField } from "./particles.js";
import { fromText } from "./shapes.js";
import { globe, dust, people, decision, appWindow, saturnV } from "./story-shapes.js";
import { stateAt, stopY, yForStage } from "./timeline.js";

const root = document.documentElement;
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const COUNT = matchMedia("(max-width: 640px)").matches ? 18000 : 40000;
const params = new URLSearchParams(location.search);

if (!root.classList.contains("has-particles")) throw new Error("WebGL unavailable");

await document.fonts.load('700 160px "Inter"');
const SHAPES = {
  globe: globe(COUNT),
  dust: dust(COUNT),
  people: people(COUNT),
  decision: decision(COUNT),
  app: appWindow(COUNT),
  rocket: saturnV(COUNT),
  name: fromText("CRISTIAN CRUZ", COUNT),
};
// Letters need to stay readable, so the name wanders less than the rest.
SHAPES.name.loose = 0.4;
const NAMES = Object.keys(SHAPES);

// The story, top to bottom: [element, which part meets mid-screen, shape].
// Two stops in a row with the same shape hold it across that stretch.
// Stops must be in page order.
const STOPS = [
  ["#hero", "center", "globe"],
  ["#interlude-need", "center", "people"],
  ["#portfolio", "start", "dust"],
  ["#portfolio", "end", "dust"],
  ["#interlude-decide", "center", "decision"],
  ["#skills", "start", "dust"],
  ["#skills", "end", "dust"],
  ["#interlude-build", "center", "app"],
  ["#experience", "start", "dust"],
  ["#education", "end", "dust"],
  ["#interlude-properly", "center", "rocket"],
  ["#get-to-know-me", "start", "dust"],
  ["#get-to-know-me", "end", "dust"],
  ["#interlude-closing", "center", "name"],
];

// Fail loudly (and fall back to the plain hero) on a typo rather than
// silently showing the wrong thing.
for (const [sel, at, shape] of STOPS) {
  if (!document.querySelector(sel)) throw new Error(`story stop: no element matches "${sel}"`);
  if (!(shape in SHAPES)) throw new Error(`story stop: unknown shape "${shape}"`);
  if (!["start", "center", "end"].includes(at)) throw new Error(`story stop: bad position "${at}"`);
}

const canvas = document.getElementById("particles");
let field;
try {
  field = createParticleField({
    canvas,
    count: COUNT,
    shapes: NAMES.map((n) => SHAPES[n]),
    colors: { lo: "#4c1d95", hi: "#d8b4fe" },
    reducedMotion,
  });
} catch (err) {
  root.classList.remove("has-particles");
  throw err;
}

try {
  let stops = [];
  function measure() {
    stops = STOPS.map(([sel, at, shape]) => ({
      y: stopY(document.querySelector(sel).getBoundingClientRect(), scrollY, innerHeight, at),
      shape: NAMES.indexOf(shape),
    }));
  }
  measure();
  if (stops.some((s, i) => i > 0 && s.y < stops[i - 1].y)) {
    throw new Error("story stops are not in page order");
  }
  // Content height changes (fonts, images, "show more projects") move the stops.
  new ResizeObserver(measure).observe(document.body);
  addEventListener("resize", measure);

  // A lost WebGL context leaves a frozen or blank canvas. If it doesn't come
  // back quickly, drop to the plain hero and stop all particle work.
  let lossTimer;
  let stopped = false;
  canvas.addEventListener("webglcontextlost", () => {
    lossTimer = setTimeout(() => {
      stopped = true;
      field.dispose();
      root.classList.remove("has-particles");
    }, 3000);
  });
  canvas.addEventListener("webglcontextrestored", () => clearTimeout(lossTimer));

  // ?stage=N jumps to stop N for screenshots; the scroll also skips the intro.
  if (params.has("stage")) {
    scrollTo({ top: yForStage(stops, parseFloat(params.get("stage"))), behavior: "instant" });
  }

  let y = scrollY;
  (function loop() {
    if (stopped) return;
    y += (scrollY - y) * (reducedMotion ? 1 : 0.1);
    const { from, to, t } = stateAt(stops, y);
    field.setState(from, to, t);
    requestAnimationFrame(loop);
  })();

  // Particles gather only after the load intro has revealed the name.
  const startBirth = () => {
    if (params.get("birth") === "0") field.uniforms.uBirth.value = 1;
    else field.birth();
  };
  if (root.classList.contains("intro")) {
    document.addEventListener("intro:done", startBirth, { once: true });
  } else {
    startBirth();
  }
} catch (err) {
  field.dispose();
  root.classList.remove("has-particles");
  throw err;
}
