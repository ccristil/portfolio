// The portfolio's particle story: which shape shows where on the page.
// Loaded by the page with import(); any throw here falls back to the plain hero.

import { createParticleField } from "./particles.js";
import { globe, dust, iceberg, decision, appWindow, saturnV, socials } from "./story-shapes.js";
import { stateAt, stopY, yForStage } from "./timeline.js";
import { createOrcaLayer } from "./orcas.js";
import { presenceOf } from "./orca-pod.js";

const root = document.documentElement;
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const mobile = matchMedia("(max-width: 640px)").matches;
const COUNT = mobile ? 18000 : 40000;
const params = new URLSearchParams(location.search);

if (!root.classList.contains("has-particles")) throw new Error("WebGL unavailable");

await document.fonts.load('400 160px "Instrument Serif"');
const SHAPES = {
  globe: globe(COUNT),
  dust: dust(COUNT),
  iceberg: iceberg(COUNT),
  decision: decision(COUNT),
  app: appWindow(COUNT),
  rocket: saturnV(COUNT),
  socials: socials(COUNT),
};
const NAMES = Object.keys(SHAPES);

// The story, top to bottom: [element, which part meets mid-screen, shape].
// The part is "start", "center", "end" or a 0–1 fraction of the element.
// Two stops in a row with the same shape hold it across that stretch.
// Stops must be in page order.
const STOPS = [
  ["#hero", "center", "globe"],
  ["#interlude-need", "center", "iceberg"],
  ["#portfolio", "start", "dust"],
  ["#portfolio", "end", "dust"],
  // The funnel forms 28% of the way in, then you fly down it until 72%
  // (see travelAt). The morphs either side match the other interludes'.
  ["#interlude-decide", 0.28, "decision"],
  ["#interlude-decide", 0.72, "decision"],
  ["#skills", "start", "dust"],
  ["#skills", "end", "dust"],
  ["#interlude-build", "center", "app"],
  ["#experience", "start", "dust"],
  ["#education", "end", "dust"],
  ["#interlude-properly", "center", "rocket"],
  ["#get-to-know-me", "start", "dust"],
  ["#get-to-know-me", "end", "dust"],
  ["#interlude-closing", "center", "socials"],
];

// Fail loudly (and fall back to the plain hero) on a typo rather than
// silently showing the wrong thing.
for (const [sel, at, shape] of STOPS) {
  if (!document.querySelector(sel)) throw new Error(`story stop: no element matches "${sel}"`);
  if (!(shape in SHAPES)) throw new Error(`story stop: unknown shape "${shape}"`);
  const fraction = typeof at === "number" && at >= 0 && at <= 1;
  if (!fraction && !["start", "center", "end"].includes(at)) throw new Error(`story stop: bad position "${at}"`);
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
  // The orca pod that swims past the iceberg. It's an extra: if it fails,
  // the story carries on without it.
  const ICEBERG = NAMES.indexOf("iceberg");
  let orcas = null;
  try {
    orcas = createOrcaLayer(field, { shapeIndex: ICEBERG, shape: SHAPES.iceberg, count: mobile ? 1400 : 3000, reducedMotion });
  } catch (err) {
    console.warn("orcas unavailable:", err);
  }

  let stops = [];
  let flySpan = null; // [startY, endY] of the scroll span you fly through the funnel
  function measure() {
    stops = STOPS.map(([sel, at, shape]) => ({
      y: stopY(document.querySelector(sel).getBoundingClientRect(), scrollY, innerHeight, at),
      shape: NAMES.indexOf(shape),
    }));
    // The first fly-through shape's two neighbouring stops bound its flight.
    const k = stops.findIndex(
      (s, i) => i > 0 && s.shape === stops[i - 1].shape && SHAPES[NAMES[s.shape]].flyTo != null
    );
    flySpan = k > 0 ? [stops[k - 1].y, stops[k].y] : null;
  }
  // 0 before the flight and 1 after it, so the funnel morphs in at its mouth
  // and leaves from its tip. Reduced motion skips the flight: a still view down it.
  function travelAt(y) {
    if (!flySpan) return 0;
    if (reducedMotion) return 0.1;
    return Math.min(1, Math.max(0, (y - flySpan[0]) / (flySpan[1] - flySpan[0] || 1)));
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
      orcas?.dispose();
      field.dispose();
      root.classList.remove("has-particles");
    }, 3000);
  });
  canvas.addEventListener("webglcontextrestored", () => clearTimeout(lossTimer));

  // ?stage=N jumps to stop N for screenshots; the scroll also skips the intro.
  if (params.has("stage")) {
    scrollTo({ top: yForStage(stops, parseFloat(params.get("stage"))), behavior: "instant" });
  }

  // Real links sit over the GitHub and LinkedIn particles at the closing stop.
  // They're sized to the shape, and only live once the marks have formed.
  const links = document.getElementById("closing-links");
  const SOCIALS = NAMES.indexOf("socials");
  let overLink = false;
  function sizeLinks() {
    const { w, h } = field.screenBox(SOCIALS);
    links.style.width = `${w}px`;
    links.style.height = `${h}px`;
  }
  if (links) {
    sizeLinks();
    addEventListener("resize", sizeLinks);
    links.addEventListener("pointerover", (e) => (overLink = !!e.target.closest("a")));
    links.addEventListener("pointerleave", () => (overLink = false));
  }

  let y = scrollY;
  (function loop() {
    if (stopped) return;
    y += (scrollY - y) * (reducedMotion ? 1 : 0.025);
    const { from, to, t } = stateAt(stops, y);
    field.setState(from, to, t, travelAt(y));
    if (orcas) {
      try {
        orcas.update(presenceOf({ from, to, t }, ICEBERG));
      } catch (err) {
        console.warn("orcas stopped:", err);
        orcas.dispose();
        orcas = null;
      }
    }
    if (links) {
      links.classList.toggle("is-live", to === SOCIALS && (from === to || t > 0.9));
      // The cursor parts the particles, which would make a link flinch away.
      const radius = field.uniforms.uMouseRadius;
      radius.value += ((overLink ? 0.08 : 0.7) - radius.value) * 0.15;
    }
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
