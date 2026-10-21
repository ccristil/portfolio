// The Mustang scene for "and then I build it.": an engine comes together in
// mid-air, a hoist chain takes it, the view pulls back to the car, the hood
// is propped and the engine dropped in, the hood shut; then the car starts,
// does a donut in its own tyre smoke, drives a lap and parks back on its
// spot, still running.
//
// It's one shape in a particle field whose points move every frame: the rig
// (mustang-rig.js) poses the car, and this file adds a camera of its own on
// top of the field's (zoom and focus, baked into the points), runs the
// sequence, and draws the smoke. Used by the portfolio's story (story.js)
// and by dev/mustang.html, which adds controls.
//
//   const scene = await loadMustangScene({ count, data, engine });
//   createParticleField({ shapes: [..., scene.shape, ...] });
//   scene.attach(field, index);
//   each frame, after field.setState(from, to, t):
//     scene.autoplay({ from, to, t });  // story: play it when it's on screen
//     scene.frame(dt, { from, to, t });
//
// data: where mustang.bin and mustang.json are, relative to the page.
// engine: an async loader for the engine to drop in, ({ engineCount,
// chainCount, meta }) → { build, extra }, as dev/coyote-engine.js gives;
// without one, the rig's stand-in V8 is lowered in (no build beat).

import { createMustangRig, placeholderEngine } from "./mustang-rig.js";
import { createTyreSmoke } from "./tyre-smoke.js";

const DEG = Math.PI / 180;
// The view: front three-quarter, low. The engine builds and hooks up seen
// from higher (BUILD_TILT, as on dev/engine.html), easing down to the car's
// tilt as the view pulls back.
const YAW = -37 * DEG, CAR_TILT = 7 * DEG, BUILD_TILT = 28 * DEG;
// Beats (s): the build, a hold on the built engine, the pull back to the car.
const BUILD_S = 2.5, BUILD_HOLD = 0.3, PULL_S = 2.2;
// The screen band the car is kept in, as shares of the frame's height: clear
// of the caption at the bottom.
const TOP_GAP = 0.06, BOTTOM_GAP = 0.28;
const SAFE = { x0: -0.82, x1: 0.82, y0: -0.4, y1: 0.85 }; // the same, in screen units (−1 … 1)
const LIGHTS = 3; // the rig's part id for the lamps

const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

export async function loadMustangScene({ count, mobile = false, reducedMotion = false, data = "assets/particles/data/", engine = null }) {
  const meta = await fetch(`${data}mustang.json`).then((r) => r.json());
  // The engine and the hoist chain share the car's particles.
  const CHAIN_N = mobile ? 400 : 700;
  let ENGINE_N = mobile ? 4000 : 9000, build = null, extra = null;
  if (engine) {
    try {
      ({ build, extra } = await engine({ engineCount: ENGINE_N, chainCount: CHAIN_N, meta }));
    } catch (err) {
      console.info("Mustang: engine unavailable, using the stand-in.", err);
    }
  }
  if (!extra) {
    ENGINE_N = mobile ? 1800 : 3500;
    build = null;
    extra = placeholderEngine({ engineCount: ENGINE_N, chainCount: CHAIN_N, meta });
  }
  const CAR_N = count - ENGINE_N - CHAIN_N;

  // Layout: dev/mustang-data/tools/export.py. Points are shuffled, so a
  // prefix is a fair sample.
  const buf = await fetch(`${data}mustang.bin`).then((r) => r.arrayBuffer());
  const n = new DataView(buf).getUint32(0, true);
  const pos = new Int16Array(buf, 4, n * 3), nrm = new Int8Array(buf, 4 + n * 6, n * 3);
  const lum8 = new Uint8Array(buf, 4 + n * 9, n), part8 = new Uint8Array(buf, 4 + n * 10, n);
  const positions = new Float32Array(count * 3), normals = new Float32Array(count * 3);
  const lum = new Float32Array(count), parts = new Uint8Array(count);
  for (let i = 0; i < CAR_N; i++) {
    const k = i % n;
    for (let a = 0; a < 3; a++) {
      positions[i * 3 + a] = pos[k * 3 + a] / 32767;
      normals[i * 3 + a] = nrm[k * 3 + a] / 127;
    }
    lum[i] = lum8[k] / 255;
    parts[i] = part8[k];
  }
  positions.set(extra.positions, CAR_N * 3);
  normals.set(extra.normals, CAR_N * 3);
  lum.set(extra.lum, CAR_N);
  parts.set(extra.parts, CAR_N);

  // The rig keeps the car as sampled and poses a copy; this bakes the view
  // into that and hands it to the field every frame. still: no slow sway (the
  // cursor still parts it). back 0: what's behind the hood or the car's far
  // side is hidden outright.
  const rig = createMustangRig({ positions: positions.slice(), normals: normals.slice(), parts, meta, reducedMotion });
  const realNormals = normals;
  const shape = { positions, normals, lum, parts, aspect: { w: 1, h: 1 }, fill: 1.1, spin: 0, tilt: CAR_TILT, fit: 0.7, loose: 0.3, still: true, back: 0 };

  let field = null, index = -1, smoke = null, baseSize = 2.4;
  let yaw = YAW, carTilt = CAR_TILT;
  const unit = meta.metresPerUnit;

  // The car's top and bottom, and how far it reaches round the engine.
  let roof = -Infinity, floor = Infinity, reach = 0;
  {
    const mid = rig.engineCentre(); // seated, as nothing has moved yet
    for (let i = 0; i < CAR_N; i++) {
      roof = Math.max(roof, positions[i * 3 + 1]);
      floor = Math.min(floor, positions[i * 3 + 1]);
      reach = Math.max(reach, Math.hypot(positions[i * 3] - mid.x, positions[i * 3 + 2] - mid.z));
    }
  }

  // The car is long, so the width it's fitted to is its widest over a full
  // turn, and the height is measured with the tilt applied and the hood
  // open, so nothing leaves the frame as it swings. The engine and chain are
  // left out; they come in from above the frame.
  function measure() {
    const ct = Math.cos(carTilt), st = Math.sin(carTilt);
    let r = 0, h = 0;
    for (const angle of [0, rig.openAngle]) {
      rig.pose(null, 0, angle);
      const P = rig.positions;
      for (let i = 0; i < CAR_N * 3; i += 3) {
        const rad = Math.hypot(P[i], P[i + 2]);
        r = Math.max(r, rad);
        h = Math.max(h, Math.abs(ct * P[i + 1]) + Math.abs(st) * rad);
      }
    }
    shape.aspect = { w: 2 * r, h: 2 * h };
    if (field) field.refit(), setEntryHeight();
  }
  measure();

  // --- the view: a camera of our own on top of the field's ---------------------
  // It zooms (in or out) by scaling the points about a focus, in the car's
  // frame: the field's camera can't simply move in, as points close to it
  // fade out. hideCar hides the car while the view is in close on the
  // engine (its near end would loom into the frame); its points wait off
  // frame and fly in as the view pulls back.
  const view = { focus: { x: 0, y: 0, z: 0 }, zoom: 1, hideCar: 0 };
  const yawed = (p) => {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    return { x: c * p.x + s * p.z, y: p.y, z: -s * p.x + c * p.z };
  };
  const frameH = () => {
    const camera = field.camera;
    return (2 * camera.position.z * Math.tan((camera.fov * Math.PI) / 360)) / field.shapeScale(index);
  };

  // Where the camera is in the car's own frame: undo, in reverse, what the
  // vertex shader does to a point (sway, scale, tilt, spin), then our zoom
  // and the yaw.
  function cameraInCar() {
    const u = field.uniforms, amb = u.uAmbient.value, time = u.uTime.value;
    const sway = shape.still ? 0 : Math.sin(time * 0.25) * 0.22 * amb;
    let x = 6 * Math.sin(sway), y = 0, z = 6 * Math.cos(sway);
    const k = field.shapeScale(index);
    (x /= k), (y /= k), (z /= k);
    const ct = Math.cos(shape.tilt), st = Math.sin(shape.tilt);
    [y, z] = [ct * y + st * z, -st * y + ct * z];
    let c = Math.cos(time * shape.spin * amb), s = Math.sin(time * shape.spin * amb);
    [x, z] = [c * x - s * z, s * x + c * z];
    const f = yawed(view.focus);
    (x = x / view.zoom + f.x), (y = y / view.zoom + f.y), (z = z / view.zoom + f.z);
    (c = Math.cos(yaw)), (s = Math.sin(yaw));
    [x, z] = [c * x - s * z, s * x + c * z];
    return { x, y, z };
  }
  // A point from the car's frame to the field's scene: our yaw and zoom, then
  // what the vertex shader does (spin, tilt, scale, sway).
  function toScene(x, y, z) {
    const u = field.uniforms, amb = u.uAmbient.value, time = u.uTime.value;
    const f = yawed(view.focus), Z = view.zoom;
    let c = Math.cos(yaw), s = Math.sin(yaw);
    let px = (c * x + s * z - f.x) * Z, py = (y - f.y) * Z, pz = (-s * x + c * z - f.z) * Z;
    (c = Math.cos(time * shape.spin * amb)), (s = Math.sin(time * shape.spin * amb));
    [px, pz] = [c * px + s * pz, -s * px + c * pz];
    (c = Math.cos(shape.tilt)), (s = Math.sin(shape.tilt));
    [py, pz] = [c * py - s * pz, s * py + c * pz];
    const k = field.shapeScale(index);
    (px *= k), (py *= k), (pz *= k);
    const sway = shape.still ? 0 : Math.sin(time * 0.25) * 0.22 * amb;
    (c = Math.cos(sway)), (s = Math.sin(sway));
    return [c * px - s * pz, py, s * px + c * pz];
  }

  // Where hidden car points wait: in a ring round the view's focus, in the
  // screen's plane (so none of them projects back into the picture), just
  // beyond the frame's corners; they fly in from all round.
  const scatter = new Float32Array(CAR_N * 2);
  for (let i = 0; i < CAR_N; i++) {
    const a = Math.random() * 2 * Math.PI, r = 1.15 + Math.random() * 0.8;
    (scatter[i * 2] = Math.cos(a) * r), (scatter[i * 2 + 1] = Math.sin(a) * r);
  }
  const hideAt = new Float32Array(positions.length);
  function placeHidden() {
    const visH = frameH(), R = (visH * 0.5 * Math.hypot(1, field.camera.aspect)) / view.zoom;
    const f = yawed(view.focus), c = Math.cos(yaw), s = Math.sin(yaw);
    for (let i = 0; i < CAR_N; i++) {
      // Across and up in the yawed frame, then back to the car's.
      const x = f.x + scatter[i * 2] * R * field.camera.aspect / Math.hypot(1, field.camera.aspect) * 2;
      const y = f.y + scatter[i * 2 + 1] * R / Math.hypot(1, field.camera.aspect) * 2;
      hideAt[i * 3] = c * x - s * f.z;
      hideAt[i * 3 + 1] = y;
      hideAt[i * 3 + 2] = s * x + c * f.z;
    }
  }

  // Pose the car, bake the view in, and hand it to the field.
  function writePose(dt) {
    if (view.hideCar > 0) placeHidden();
    rig.pose(cameraInCar(), dt, undefined, view.hideCar, view.hideCar > 0 ? hideAt : null);
    const c = Math.cos(yaw), s = Math.sin(yaw), f = yawed(view.focus), Z = view.zoom;
    const P = rig.positions, N = rig.normals, dst = positions, dn = realNormals;
    for (let i = 0; i < P.length; i += 3) {
      dst[i] = (c * P[i] + s * P[i + 2] - f.x) * Z;
      dst[i + 1] = (P[i + 1] - f.y) * Z;
      dst[i + 2] = (-s * P[i] + c * P[i + 2] - f.z) * Z;
      dn[i] = c * N[i] + s * N[i + 2];
      dn[i + 1] = N[i + 1];
      dn[i + 2] = -s * N[i] + c * N[i + 2];
    }
    field.refreshShape(index, shape.normals ? ["positions", "normals"] : ["positions"]);
  }

  // The engine waits just above the top of the frame.
  function setEntryHeight() {
    const top = frameH() / 2;
    rig.setEntryHeight((top * 1.7 - meta.engineBox.min[1]) * unit + 0.8);
  }

  // --- framing ------------------------------------------------------------------
  // How far to zoom so the built engine fills a good share of the frame.
  function engineZoom() {
    const visH = frameH(), visW = visH * field.camera.aspect;
    return Math.min((0.42 * visH) / 0.17, (0.55 * visW) / 0.25);
  }
  // The engine is built hanging high enough that the car is out of frame
  // below, even while the parts are spread out and the view is at its widest.
  const engineFrom = CAR_N, engineLum = lum.slice(engineFrom, engineFrom + ENGINE_N);
  const buildOut = build && { positions: new Float32Array(ENGINE_N * 3), lum: new Float32Array(ENGINE_N) };
  function buildHeight() {
    const widest = engineZoom() * build.apply(0, buildOut);
    const clear = roof + (frameH() / (2 * widest)) * 1.6 + Math.sin(BUILD_TILT) * reach;
    rig.stageEngine(0);
    return Math.max(2.6, (clear - rig.engineCentre().y) * unit);
  }
  // The usual view of the car, pulled back and raised just enough to keep the
  // engine in frame while it hangs above, inside the band clear of the caption.
  function framingView() {
    const visH = frameH();
    const span = visH * (1 - TOP_GAP - BOTTOM_GAP), lift = (visH * (BOTTOM_GAP - TOP_GAP)) / 2;
    // The tilt drops the car's near end below its lowest point.
    const top = Math.max(roof, rig.engineCentre().y + 0.11), bottom = floor - Math.sin(Math.abs(shape.tilt)) * 0.5;
    if (top - bottom > span) {
      const zoom = span / (top - bottom);
      return { zoom, focus: { x: 0, y: (top + bottom) / 2 - lift / zoom, z: 0 } };
    }
    return { zoom: 1, focus: { x: 0, y: Math.max(0, top - (visH / 2 - visH * TOP_GAP)), z: 0 } };
  }
  // A donut swings the tail round a circle bigger than the frame, close
  // enough to the camera to loom, so while it slides the view eases back
  // (same angle), centred on the point it turns about, until the sweep fits.
  function frameDonut(dt) {
    const circle = rig.donutCircle;
    if (!circle) {
      if (rig.carBeat === "return" || rig.carBeat === "parked") keepCarInFrame(dt);
      return;
    }
    const camera = field.camera, k = field.shapeScale(index);
    const visW = frameH() * camera.aspect;
    const zoom = Math.min(1, (0.42 * visW) / circle.radius, (0.5 * camera.position.z) / k / circle.radius);
    const lift = (0.06 * visW) / camera.aspect / zoom; // swinging near, the tail sits low
    const ease = 1 - Math.exp(-dt * 1.6);
    view.zoom += (zoom - view.zoom) * ease;
    view.focus = {
      x: view.focus.x + (circle.x - view.focus.x) * ease,
      y: view.focus.y + (-lift - view.focus.y) * ease,
      z: view.focus.z + (circle.z - view.focus.z) * ease,
    };
  }
  // Where the car is on screen: the bounds of a sample of its points in
  // screen units (−1 … 1), and their mean depth.
  const SAMPLE = Array.from({ length: 400 }, (_, k) => Math.floor((k * CAR_N) / 400));
  function carOnScreen() {
    const camera = field.camera, tan = Math.tan((camera.fov * Math.PI) / 360), P = rig.positions;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, depth = 0;
    for (const i of SAMPLE) {
      const [x, y, z] = toScene(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
      const d = Math.max(0.5, camera.position.z - z);
      const sx = x / d / tan / camera.aspect, sy = y / d / tan;
      (x0 = Math.min(x0, sx)), (x1 = Math.max(x1, sx)), (y0 = Math.min(y0, sy)), (y1 = Math.max(y1, sy));
      depth += d / SAMPLE.length;
    }
    return { x0, x1, y0, y1, depth };
  }
  // The lap: keep the car inside the safe area by where its points land on
  // screen, easing the view across, out, and back when it comes near (it
  // passes close to the camera), never turning it; once parked, drift back
  // to the usual view.
  let parkedDepth = 5;
  function keepCarInFrame(dt) {
    if (rig.carBeat === "parked") {
      const to = framingView(), back = 1 - Math.exp(-dt * 1.5);
      view.zoom += (to.zoom - view.zoom) * back;
      for (const a of ["x", "y", "z"]) view.focus = { ...view.focus, [a]: view.focus[a] + (to.focus[a] - view.focus[a]) * back };
      return;
    }
    const b = carOnScreen(), camera = field.camera, k = field.shapeScale(index);
    const tan = Math.tan((camera.fov * Math.PI) / 360);
    const fit = Math.min((SAFE.x1 - SAFE.x0) / (b.x1 - b.x0), (SAFE.y1 - SAFE.y0) / (b.y1 - b.y0));
    const zoom = Math.min(1, Math.max(0.45, view.zoom * Math.min(1.2, fit)));
    const offX = ((b.x0 + b.x1) / 2 - (SAFE.x0 + SAFE.x1) / 2) * b.depth * tan * camera.aspect;
    const offY = ((b.y0 + b.y1) / 2 - (SAFE.y0 + SAFE.y1) / 2) * b.depth * tan;
    const ease = 1 - Math.exp(-dt * 4);
    view.zoom += (zoom - view.zoom) * ease;
    const fy = yawed(view.focus);
    fy.x += (offX / (view.zoom * k)) * ease;
    fy.y += (offY / (view.zoom * k)) * ease;
    if (b.depth < parkedDepth) fy.z += ((parkedDepth - b.depth) / (view.zoom * k)) * ease;
    const c = Math.cos(yaw), sn = Math.sin(yaw);
    view.focus = { x: c * fy.x - sn * fy.z, y: fy.y, z: sn * fy.x + c * fy.z };
  }

  // --- the sequence ------------------------------------------------------------
  let seq = null; // { phase, t, full, ... } while it plays
  let driveMode = "donut";
  let finished = false;
  function setEngineLum(l) {
    lum.set(l, engineFrom);
    field.refreshShape(index, ["lum"]);
  }
  function playBuild(full = false) {
    finished = false;
    if (!build || reducedMotion) {
      rig.installEngine();
      if (full) seq = { phase: "follow", t: 0, full: true };
      return;
    }
    shape.tilt = BUILD_TILT;
    rig.stageEngine(buildHeight());
    view.hideCar = 1;
    seq = { phase: "build", t: 0, full };
    runSequence(0);
  }
  // The whole thing, start to finish, from an empty car.
  function playAll() {
    rig.resetCar();
    smoke?.clear();
    Object.assign(view, { focus: { x: 0, y: 0, z: 0 }, zoom: 1, hideCar: 0 });
    shape.tilt = carTilt;
    if (build) setEngineLum(engineLum);
    playBuild(true);
  }
  function runSequence(dt) {
    if (!seq || seq.paused) return;
    seq.t += dt;
    if (seq.phase === "build") {
      const scale = build.apply(Math.min(1, seq.t / BUILD_S), buildOut);
      rig.setEngineShape(buildOut.positions);
      setEngineLum(buildOut.lum);
      // Pulled back while the parts are out, so they stay in frame.
      Object.assign(view, { focus: rig.engineCentre(), zoom: engineZoom() * scale });
      if (seq.t > BUILD_S + BUILD_HOLD) {
        rig.setEngineShape(null);
        setEngineLum(engineLum);
        rig.wrapChain();
        seq = { phase: "wrap", t: 0, focus: view.focus, full: seq.full };
      }
    } else if (seq.phase === "wrap") {
      if (rig.engineHooked) {
        rig.installEngine(); // opens and props the hood, then lowers it
        seq = { phase: "pull", t: 0, focus: seq.focus, zoom: view.zoom, full: seq.full };
      }
    } else if (seq.phase === "pull") {
      // From the engine close-up out to the car with the engine above it; the
      // car's points fly in over the second half.
      const e = easeInOut(Math.min(1, seq.t / PULL_S)), to = framingView();
      view.zoom = seq.zoom ** (1 - e) * to.zoom ** e;
      const mix = (a, b) => a + (b - a) * e;
      view.focus = { x: mix(seq.focus.x, to.focus.x), y: mix(seq.focus.y, to.focus.y), z: mix(seq.focus.z, to.focus.z) };
      shape.tilt = mix(BUILD_TILT, carTilt);
      const r = Math.min(1, Math.max(0, (e - 0.6) / 0.4));
      view.hideCar = 1 - r * r * (3 - 2 * r);
      if (e >= 1) (seq = { phase: "follow", t: 0, full: seq.full }), (shape.tilt = carTilt), (view.hideCar = 0);
    } else if (seq.phase === "follow") {
      Object.assign(view, framingView());
      if (rig.enginePhase === "seated") seq = seq.full ? { phase: "settle", t: 0, full: true } : null;
    } else if (seq.phase === "settle") {
      // Chain gone and the hood back on its struts: shut it.
      Object.assign(view, framingView());
      if (rig.engineBusy) seq.t = 0;
      else if (seq.t > 0.3) (rig.closeHood(), (seq = { phase: "close", t: 0, full: true }));
    } else if (seq.phase === "close") {
      if (!rig.hoodShut) seq.t = 0;
      else if (seq.t > 0.6) {
        parkedDepth = carOnScreen().depth;
        rig.startCar(driveMode);
        seq = { phase: "drive", t: 0, full: true };
      }
    } else if (seq.phase === "drive") {
      frameDonut(dt);
      const home = framingView(), f = view.focus;
      const settled = Math.abs(view.zoom - home.zoom) < 0.005 && Math.hypot(f.x - home.focus.x, f.y - home.focus.y, f.z - home.focus.z) < 0.003;
      if (rig.driven > 40 || (rig.carPhase === "running" && settled)) (seq = null), (finished = true);
    }
  }

  // The headlights dip while the starter cranks, as a real car's do.
  const lightIdx = [];
  for (let i = 0; i < CAR_N; i++) if (parts[i] === LIGHTS) lightIdx.push(i);
  const lightLum = lightIdx.map((i) => lum[i]);
  let lightsDim = 1;
  function lights(dt) {
    const want = rig.carPhase === "crank" ? 0.5 : 1;
    if (Math.abs(want - lightsDim) < 0.002) return;
    lightsDim += (want - lightsDim) * (1 - Math.exp(-dt * (want < lightsDim ? 30 : 6)));
    lightIdx.forEach((i, k) => (lum[i] = lightLum[k] * lightsDim));
    field.refreshShape(index, ["lum"]);
  }
  // Zoomed in, the dots would read sparse: grow them a little and lift the
  // exposure the field set for the car's size, for this shape's slot (and
  // the size in step with how much of the screen is this shape).
  function zoomLook({ from, to, t }) {
    const z = Math.max(1, view.zoom);
    const share = from === index && to === index ? 1 : to === index ? t : from === index ? 1 - t : 0;
    field.uniforms.uSize.value = baseSize * (1 + (z ** 0.3 - 1) * share);
    if (from === index) field.uniforms.uExposureA.value = Math.min(1, field.uniforms.uExposureA.value * z ** 0.6);
    if (to === index) field.uniforms.uExposureB.value = Math.min(1, field.uniforms.uExposureB.value * z ** 0.6);
  }

  // Story playback: it's cued at the build's first frame and plays once
  // it's on screen. Left before the end, it starts over next time; played
  // through, it stays parked and running.
  // The field takes a shape's points when it starts showing it, so the cued
  // frame is drawn straight away: dust gathers into it as it scrolls in.
  let cued = false;
  function cue() {
    if (reducedMotion) {
      rig.resetCar();
      rig.snapEngine(true);
      finished = true;
    } else {
      playAll();
      if (seq) seq.paused = true;
    }
    cued = true;
    writePose(0);
  }

  return {
    shape,
    rig,
    view,
    meta,
    hasBuild: !!build,
    counts: { car: CAR_N, engine: ENGINE_N, chain: CHAIN_N },
    get playing() {
      return !!seq && !seq.paused;
    },
    get finished() {
      return finished;
    },
    get driveMode() {
      return driveMode;
    },
    set driveMode(mode) {
      driveMode = mode;
    },
    attach(f, i) {
      (field = f), (index = i);
      baseSize = field.uniforms.uSize.value;
      smoke = createTyreSmoke({ field, max: mobile ? 2500 : 7000, unit, reducedMotion });
      measure();
      addEventListener("resize", () => field.shapeScale(index) && setEntryHeight());
    },
    // The story's hook: call each frame with the field's state.
    autoplay({ from, to, t }) {
      const showing = to === index && (from === index || t > 0.6);
      const away = from !== index && to !== index;
      if (!cued && away) cue();
      if (showing && seq?.paused) seq.paused = false;
      if (away && seq && !seq.paused) cue(); // left mid-way: start over next time
    },
    frame(dt, state, { hold = false } = {}) {
      if (state.from !== index && state.to !== index) return; // not on the GPU: nothing to do
      if (!hold) runSequence(dt), rig.step(dt);
      smoke.emit(hold ? null : rig.tyreSmoke, dt);
      smoke.step(hold ? 0 : dt, toScene);
      zoomLook(state);
      lights(dt);
      writePose(dt);
    },
    playAll,
    playBuild,
    // A single drive ("plain" or "donut") from parked with the engine in.
    drive(mode) {
      rig.startCar(mode);
      parkedDepth = carOnScreen().depth;
      seq = { phase: "drive", t: 0 };
    },
    // Plays the whole thing to `seconds` at once (to look at one beat).
    holdAt(seconds) {
      playAll();
      for (let t = 0; t < seconds; t += 1 / 60) {
        runSequence(1 / 60), rig.step(1 / 60);
        smoke.emit(rig.tyreSmoke, 1 / 60);
        smoke.step(1 / 60, toScene);
        // The lap's framing reads where the car was last drawn, so pose it
        // as playback would (only while driving; posing is the slow part).
        if (rig.carPhase !== "parked") writePose(1 / 60);
      }
    },
    setYaw(radians) {
      yaw = radians;
      measure();
    },
    setTilt(radians) {
      carTilt = shape.tilt = radians;
      measure();
    },
    setSpin(on) {
      shape.spin = on ? 0.1 : 0;
    },
    setNormals(on) {
      shape.normals = on ? realNormals : undefined;
      field.refreshShape(index, ["normals"]);
    },
    // One line on what it's doing, for checking from a headless browser.
    describe() {
      const f = view.focus;
      return `${seq?.phase ?? (finished ? "done" : "idle")} engine ${rig.enginePhase} hood ${Math.round(rig.hoodAngle / DEG)} car ${rig.carPhase} ${rig.carBeat} ${rig.driven.toFixed(1)}m zoom ${view.zoom.toFixed(2)} focus ${[f.x, f.y, f.z].map((v) => v.toFixed(2))}`;
    },
  };
}
