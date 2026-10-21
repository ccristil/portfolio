// Mustang rig: moves the car's points the way the real parts move. The hood
// swings on its hinge, the body rides on its springs, an engine comes down
// on a hoist and lands on its mounts, and whatever is under the hood hides
// behind it until the hood is out of the way.
//
// Everything here is in the car's own frame: shape space before any yaw
// (x across, y up, z towards the nose; see dev/mustang-data/tools/export.py).
// Physics runs in metres and seconds and is converted with metresPerUnit.
//
//   const rig = createMustangRig({ positions, normals, parts, meta });
//   rig.openHood(); rig.closeHood(); rig.installEngine(); rig.removeEngine();
//   For the build: rig.stageEngine(height) hangs it in mid-air with no chain,
//   rig.setEngineShape(points) poses it from another shape (the exploded
//   build) until you pass null, rig.wrapChain() brings the hook down and
//   hooks it on, then rig.installEngine() drops it from there.
//   rig.startCar() cranks and fires it and drives off; rig.resetCar() parks
//   it back where it was.
//   each frame: rig.step(dt); rig.pose(cameraInCarFrame);
//   then read rig.positions / rig.normals.

const WHEELS = 2, ENGINE = 5, HOOD = 8, BAY = 9, CHAIN = 10;
const G = 9.81;
const DEG = Math.PI / 180;

// Hood. The latch pops it up a few degrees, a hand lifts it most of the way,
// then the gas struts carry it the rest and settle with a small bob. Closing,
// the hand lowers it to a few degrees off the latch and lets go; it falls,
// slams, bounces once and the latch catches.
const POP_DEG = 3;
const POP = { w: 28, zeta: 0.25 }; // latch spring, rad/s
const POP_HOLD = 0.6; // s before the hand lifts
const HAND = { w: 14, zeta: 0.9 }; // how stiffly the hood follows the hand
// The hand heads for LIFT_SHARE of the way up over LIFT_S, but lets go at
// HANDOFF of that time, while it's still moving, and the struts carry on.
const LIFT_S = 1.2, LIFT_SHARE = 0.75, HANDOFF = 0.7;
const STRUT = { w: 4.5, zeta: 0.62 };
const LOWER_S = 1.5, DROP_DEG = 13, DROP_HOLD = 0.15;
const HOOD_LENGTH = 1.35; // m, hinge to front edge; sets how fast it falls
const RESTITUTION = 0.2;
// For an engine install a hand pushes the hood past the struts to stand
// just past straight up (its nose curves down, so at 90° the lip still juts
// forward), holds it there, then lets it back down onto the struts.
const PROP_DEG = 95, PROP_S = 0.8, UNPROP_S = 0.9;
// Even upright, the hood's thickness reaches a few cm forward of its hinge,
// and the bottom of a long engine's back (the rear plate) sits nearly that
// far forward too. So, as in a real install, the engine hangs a little
// forward of its mounts on the way down and is pulled back under the cowl
// once the low parts are past: the rig works out how far forward it has to
// be at each height to stay PROP_CLEAR off the hood (sway included).
const PROP_CLEAR = 0.04; // m
const LATCH_SPEED = 0.35; // rad/s; slower than this and the latch just catches

// Body on its springs: one per axle, ~1.35 Hz empty, a little underdamped so
// it settles in a bounce and a half like a real car. Masses are what each
// axle carries; added weight slows the bounce and sinks the car.
const SPRING = { w: 2 * Math.PI * 1.35, zeta: 0.3 };
const FRONT_KG = 900, REAR_KG = 800;
const SLAM_KICK = 0.05; // m/s of front axle per rad/s of hood at impact
const PITCH_SHARE = 0.12; // the rear lifts by this share of a front kick
// Real travel is a few mm, about a pixel at this size, so the bounce is
// shown bigger. Only the bounce: where the car settles is shown true.
const HEFT = 2.5;

// Engine on a shop crane. The hoist runs it down at a steady speed, then
// the operator inches it in, slowing to a crawl just above the mounts. It
// swings a little on the chain and bobs on the chain's stretch; a hand
// steadies it near the bottom. Then the hoist lets the last few centimetres
// go and it lands on the mounts: the car squats, bounces and settles lower,
// and the engine shakes on its rubber mounts. The chain unhooks and lifts
// away. Removing it runs the other way.
const ENGINE_KG = 200;
// It starts just out of frame (the page sets how high that is with
// setEntryHeight) so it's on screen almost as soon as it moves.
const HOIST_V = 1.7, HOIST_A = 2.6, INCH_D = 0.7, INCH_MIN = 0.1; // m/s, m/s², m
const HOVER = 0.025; // m above the mounts where the hoist lets go
const STEADY_S = 0.25;
const CHAIN_L = 1.1; // m, hook to engine; sets the swing period
const STRETCH = { w: 2 * Math.PI * 2.1, zeta: 0.12 }; // the chain bobbing
const MOUNT = { w: 2 * Math.PI * 9, zeta: 0.18 }; // engine on rubber mounts
const ROLL = { w: 2 * Math.PI * 6, zeta: 0.15 };
const TRANSFER_S = 1.0; // taking the weight back off the car
const UNHOOK_S = 0.5, RETRACT_S = 1.6, HOOKUP_S = 2;
// The chain coming for a freshly built engine: the hook drops into place,
// the legs pay out down to the lifting eyes, then the hoist takes up the
// slack and lifts it a touch, setting it swinging.
const WRAP_DROP = 3, WRAP_HOOK_S = 1.0, WRAP_LEGS_S = 0.6, TAUT_S = 0.3, TAUT_LIFT = 0.02; // m, s, s, s, m

// Driving off. The starter cranks it (a fast shake), it fires (the engine's
// torque rocks the body on its springs), it idles a moment, then pulls away:
// a gentle launch with the weight shifting back (the rear squats, the nose
// lifts), the front wheels easing into a turn, the body leaning out of it,
// and the wheels rolling at the speed the car moves.
const CRANK_S = 0.8, IDLE_S = 1.0;
const LAUNCH_A = 2.6, LAUNCH_RAMP = 0.7, TOP_V = 13; // m/s², s, m/s
// The wheel winds in after a moment, holds until the car has turned
// TURN_DEG, then unwinds so it drives off straight (no donut).
const STEER_DEG = -16, STEER_IN = 0.3, STEER_RATE = 14, TURN_DEG = 55; // °, s, °/s, °; negative turns away from the default view
const CAR_KG = 1700, CG_H = 0.55; // m; for the weight shift
const BODY_ROLL = { w: 2 * Math.PI * 1.5, zeta: 0.35 }, ROLL_PER_G = 0.06; // rad of lean per g sideways
const FIRE_ROLL = 0.22; // rad/s kick when it catches (the torque twist)
const ROLL_SHOW = 1.4; // the lean is shown a little bigger than real, like the springs

// The donut. The car is a bicycle model whose rear axle can slide sideways:
// slide = 0 is full grip (it turns about the rear axle), slide = 1 puts the
// pivot on the front axle, and a little past 1 puts it just ahead of it, so
// the front wheels, which always point the way they're actually travelling,
// end up countersteering. The rear tyres spin faster than the ground moves
// under them (wheelspin) while it slides.
// Beats: pull away and turn in; power on, the rear steps out; hold it round
// for a turn or so; catch it, then drive round and park back where it was
// (RETURN), still running.
const DONUT = {
  dir: -1, // turn away from the default view, so it circles where it sits
  // Short and tight, so the circle lands about where the car was sitting.
  turnIn: { s: 1.0, v: 2.4, steerDeg: 30 },
  breakS: 0.7,
  hold: { yawRate: 1.9, v: 1.1, slide: 1.1 }, // rad/s, m/s
  catchS: 1.1,
  wheelspin: 2.2, // rear tyre speed over ground speed while sliding
  throttleSquat: 2.5, // m/s² of weight shift while it's on the power
};

// Coming back after the donut: one lap, then park. The lap is a circle
// through the parking spot, running the way the car parks, so the donut lets
// go pointing that way, the car drives once round and the lap brings it
// back onto its spot, where it brakes to a stop, still running. The circle
// sits on the side away from the default view's camera, and its radius is
// well over the car's tightest turn, so it can drive it. It's followed by
// pure pursuit: steer for a point a little way along the path, as a driver
// does, so it drives it like a car would.
const RETURN = {
  radius: 5.5, // m; the car's tightest is about 4.4 m at full lock
  side: -1, // the circle's centre is on the car's -x side (left and away in the default view)
  minTurns: 1.2, // the donut goes round at least this much before it lets go
  cruise: 7, // m/s
  latG: 0.5, // it slows for corners to keep under this
  accel: 2.4, brake: 3.2, // m/s²
  lookahead: 3.5, // m
  steerRate: 70, // °/s, how fast the wheel can be turned
  preview: 8, // m ahead it looks for the next bend, to slow in time
  settleS: 0.6, // easing the last few mm onto the spot once stopped
};

const minJerk = (t) => t * t * t * (10 - 15 * t + 6 * t * t);
const smooth = (t) => t * t * (3 - 2 * t);

export function createMustangRig({ positions, normals, parts, meta, reducedMotion = false }) {
  const n = parts.length;
  const unit = meta.metresPerUnit;
  const hingeY = meta.hinge.y, hingeZ = meta.hinge.z;
  const openAngle = meta.openDeg * DEG;
  const out = { positions: new Float32Array(positions), normals: new Float32Array(normals) };

  const hoodIdx = [], bayIdx = [], bodyIdx = [], engineIdx = [], chainIdx = [];
  for (let i = 0; i < n; i++) {
    const p = parts[i];
    if (p === HOOD) hoodIdx.push(i);
    else if (p === BAY) bayIdx.push(i);
    else if (p === ENGINE) engineIdx.push(i);
    else if (p === CHAIN) chainIdx.push(i);
    if (p !== WHEELS && p !== ENGINE && p !== CHAIN) bodyIdx.push(i);
  }
  const hiddenIdx = bayIdx.concat(engineIdx); // what the hood can hide
  const carIdx = [];
  for (let i = 0; i < n; i++) if (parts[i] !== ENGINE && parts[i] !== CHAIN) carIdx.push(i);
  // Each car point's turn to appear when the car dissolves in (pose's hideCar).
  const dissolve = Float32Array.from({ length: n }, Math.random);

  // The four wheels, each turning about its own hub (the middle of its box).
  const wheels = [];
  {
    const groups = new Map();
    for (let i = 0; i < n; i++) {
      if (parts[i] !== WHEELS) continue;
      const key = `${positions[i * 3] > 0}${positions[i * 3 + 2] > 0}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(i);
    }
    for (const idx of groups.values()) {
      const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
      for (const i of idx) for (let a = 0; a < 3; a++) (lo[a] = Math.min(lo[a], positions[i * 3 + a])), (hi[a] = Math.max(hi[a], positions[i * 3 + a]));
      const hub = lo.map((v, a) => (v + hi[a]) / 2);
      wheels.push({ idx, hub, front: hub[2] > 0, radius: ((hi[1] - lo[1]) / 2) * unit });
    }
  }
  const wheelRadius = wheels.length ? wheels.reduce((r, w) => r + w.radius, 0) / wheels.length : 0.34;
  const rearHub = wheels.filter((w) => !w.front)[0]?.hub ?? [0, 0, meta.axles.rear];
  const wheelbase = (meta.axles.front - meta.axles.rear) * unit;
  const rollY = rearHub[1]; // the body leans about a line at hub height
  // The lap in the car's frame (metres from the rear axle's parked spot;
  // the car parks facing +z): a circle from the spot back to it, and the
  // heading it leaves the donut on (the way the lap runs from the spot).
  // returnBend is each point's curvature (1/m), for slowing ahead of bends.
  const returnPath = [], returnBend = [];
  {
    let x = 0, z = 0, h = 0;
    const curve = RETURN.side / RETURN.radius, step = 0.25, laps = (2 * Math.PI * RETURN.radius) / step;
    for (let k = 0; k < laps; k++) {
      returnPath.push([x, z]);
      returnBend.push(Math.abs(curve));
      h += curve * step;
      x += Math.sin(h) * step;
      z += Math.cos(h) * step;
    }
    returnPath.push([0, 0]);
    returnBend.push(0);
    // On past the spot, so the driver keeps aiming down the line while
    // braking to stop on it (the stop is at [0, 0], not the path's end).
    returnPath.push([0, RETURN.lookahead + 1]);
    returnBend.push(0);
  }
  const exitHeading = 0;
  // The car's footprint around the rear hub, for the donut's sweep.
  const corners = [];
  {
    let xl = Infinity, xh = -Infinity, zl = Infinity, zh = -Infinity;
    for (const i of carIdx) {
      xl = Math.min(xl, positions[i * 3]), xh = Math.max(xh, positions[i * 3]);
      zl = Math.min(zl, positions[i * 3 + 2]), zh = Math.max(zh, positions[i * 3 + 2]);
    }
    for (const x of [xl, xh]) for (const z of [zl, zh]) corners.push([x - rearHub[0], z - rearHub[2]]);
  }
  const shown = new Float32Array(n).fill(1); // eased 0 (hidden) … 1
  // Another shape to pose the engine from (the exploded build), in engineIdx order.
  let engineShape = null;

  // Where the engine sits, and how its weight splits between the axles.
  const seat = engineSeat(meta);
  const zf = meta.axles.front, zr = meta.axles.rear;
  const frontShare = (seat.z - zr) / (zf - zr);
  const share = { front: frontShare, rear: 1 - frontShare };
  const centreY = seat.y + 0.2 / unit; // what it rolls and twists about
  const engineMid = [0, 0, 0];
  for (const i of engineIdx) for (let a = 0; a < 3; a++) engineMid[a] += positions[i * 3 + a] / engineIdx.length;

  // The chain: the line up to the crane runs straight up from the hook; the
  // legs run from the hook down to the lifting eyes. legT is how far up its
  // leg a point is (0 at the eye, 1 at the hook), or -1 on the line.
  let hookY = Infinity;
  const legT = new Float32Array(n).fill(-1);
  // (Float32 points against a float64 seat, so not exactly equal.)
  const onLine = (i) => Math.abs(positions[i * 3] - seat.x) < 1e-5 && Math.abs(positions[i * 3 + 2] - seat.z) < 1e-5;
  for (const i of chainIdx) if (onLine(i)) hookY = Math.min(hookY, positions[i * 3 + 1]);
  let eyeY = Infinity;
  for (const i of chainIdx) if (!onLine(i)) eyeY = Math.min(eyeY, positions[i * 3 + 1]);
  for (const i of chainIdx) if (!onLine(i)) legT[i] = (positions[i * 3 + 1] - eyeY) / (hookY - eyeY);

  // --- the hood as a height field, for the line-of-sight test ------------------
  // The highest hood point per cell of a grid over its footprint, shut.
  const GRID = 28;
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, yLo = Infinity, yHi = -Infinity;
  for (const i of hoodIdx) {
    const x = positions[i * 3], y = positions[i * 3 + 1], z = positions[i * 3 + 2];
    x0 = Math.min(x0, x); x1 = Math.max(x1, x);
    z0 = Math.min(z0, z); z1 = Math.max(z1, z);
    yLo = Math.min(yLo, y); yHi = Math.max(yHi, y);
  }
  const height = new Float32Array(GRID * GRID).fill(-Infinity);
  const cell = (x, z) => {
    const u = Math.floor(((x - x0) / (x1 - x0)) * GRID), v = Math.floor(((z - z0) / (z1 - z0)) * GRID);
    return u < 0 || v < 0 || u >= GRID || v >= GRID ? -1 : u * GRID + v;
  };
  for (const i of hoodIdx) {
    const c = cell(positions[i * 3], positions[i * 3 + 2]);
    height[c] = Math.max(height[c], positions[i * 3 + 1]);
  }
  // Vents and sparse spots leave holes; fill each from its neighbours, but
  // only where it's hemmed in, so the outline stays put.
  for (let pass = 0; pass < 2; pass++) {
    const src = height.slice();
    for (let u = 0; u < GRID; u++)
      for (let v = 0; v < GRID; v++) {
        if (src[u * GRID + v] > -Infinity) continue;
        let sum = 0, k = 0;
        for (const [du, dv] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const h = src[(u + du) * GRID + v + dv];
          if (u + du >= 0 && u + du < GRID && v + dv >= 0 && v + dv < GRID && h > -Infinity) (sum += h), k++;
        }
        if (k >= 3) height[u * GRID + v] = sum / k;
      }
  }
  // Then close any gap still enclosed along a row or a column (a sparse
  // patch must not read as an opening), interpolating across it.
  for (const along of [(a, b) => a * GRID + b, (a, b) => b * GRID + a])
    for (let a = 0; a < GRID; a++) {
      let last = -1;
      for (let b = 0; b < GRID; b++) {
        if (height[along(a, b)] === -Infinity) continue;
        if (last >= 0 && b - last > 1) {
          const h0 = height[along(a, last)], h1 = height[along(a, b)];
          for (let k = last + 1; k < b; k++) height[along(a, k)] = h0 + ((h1 - h0) * (k - last)) / (b - last);
        }
        last = b;
      }
    }

  const propAngle = PROP_DEG * DEG;

  // How far forward (m) the engine must hang at each height above its mounts
  // (1 cm steps) to clear the propped hood: compare, band by band of height,
  // the hood's frontmost point with the engine's rearmost.
  const BAND = 0.01 / unit;
  const hoodBands = new Map(), engineBands = new Map();
  {
    const c = Math.cos(propAngle), s = Math.sin(propAngle);
    for (const i of hoodIdx) {
      const dy = positions[i * 3 + 1] - hingeY, dz = positions[i * 3 + 2] - hingeZ;
      const b = Math.floor((hingeY + c * dy + s * dz) / BAND), z = hingeZ - s * dy + c * dz;
      hoodBands.set(b, Math.max(hoodBands.get(b) ?? -Infinity, z));
    }
    for (const i of engineIdx) {
      const b = Math.floor(positions[i * 3 + 1] / BAND), z = positions[i * 3 + 2];
      engineBands.set(b, Math.min(engineBands.get(b) ?? Infinity, z));
    }
  }
  const MAX_H = 8; // m; no hood up there
  const need = new Float32Array(MAX_H * 100 + 1);
  for (let h = 0; h < need.length; h++) {
    let worst = 0;
    for (const [b, back] of engineBands)
      for (const near of [-1, 0, 1]) {
        const front = hoodBands.get(b + h + near);
        if (front !== undefined) worst = Math.max(worst, (front - back) * unit + PROP_CLEAR);
      }
    need[h] = worst;
  }
  // Smoothed so the trolley eases forward and back, but never under what's
  // needed: the widest need within ±W, then averaged over ±W/2.
  const W = 40; // cm
  const widest = need.map((_, h) => Math.max(...need.slice(Math.max(0, h - W), h + W + 1)));
  const aheadAt = widest.map((_, h) => {
    const lo = Math.max(0, h - W / 2), hi = Math.min(widest.length - 1, h + W / 2);
    let sum = 0;
    for (let k = lo; k <= hi; k++) sum += widest[k];
    return sum / (hi - lo + 1);
  });
  const ahead = (m) => aheadAt[Math.max(0, Math.min(aheadAt.length - 1, Math.round(m * 100)))];

  // Is the hood, swung to `angle`, between point i and the camera?
  const STEPS = 20;
  function blocked(P, i, cam, c, s) {
    // Work in the hood's shut frame: swing both ends back by -angle.
    const unswing = (y, z) => {
      const dy = y - hingeY, dz = z - hingeZ;
      return [hingeY + c * dy - s * dz, hingeZ + s * dy + c * dz];
    };
    const px = P[i * 3];
    const [py, pz] = unswing(P[i * 3 + 1], P[i * 3 + 2]);
    const [cy, cz] = unswing(cam.y, cam.z);
    const dx = cam.x - px, dy = cy - py, dz = cz - pz;
    // Only march the stretch of the sight line over the hood's footprint.
    let t0 = 0, t1 = 1;
    for (const [p, d, lo, hi] of [[px, dx, x0, x1], [pz, dz, z0, z1], [py, dy, yLo - 0.02, yHi + 0.01]]) {
      if (Math.abs(d) < 1e-9) {
        if (p < lo || p > hi) return false;
        continue;
      }
      let a = (lo - p) / d, b = (hi - p) / d;
      if (a > b) [a, b] = [b, a];
      t0 = Math.max(t0, a);
      t1 = Math.min(t1, b);
    }
    if (t0 >= t1) return false;
    let below = false;
    for (let k = 0; k <= STEPS; k++) {
      const t = t0 + ((t1 - t0) * k) / STEPS;
      const c2 = cell(px + dx * t, pz + dz * t);
      const h = c2 < 0 ? -Infinity : height[c2];
      if (h === -Infinity) continue;
      const y = py + dy * t;
      if (y < h) below = true;
      else if (below) return true; // came up through the hood
    }
    return false;
  }

  // Inside the bay (under the shut hood's skin, within its outline), a point
  // can only be seen through the hood opening: its sight line has to come
  // up through the opening before it leaves the hood's outline. Otherwise
  // it's behind a fender, the grille or the firewall.
  function inBay(P, i) {
    const c = cell(P[i * 3], P[i * 3 + 2]);
    return c >= 0 && height[c] > -Infinity && P[i * 3 + 1] < height[c];
  }
  function throughOpening(P, i, cam) {
    const px = P[i * 3], py = P[i * 3 + 1], pz = P[i * 3 + 2];
    const dx = cam.x - px, dy = cam.y - py, dz = cam.z - pz;
    // March until the sight line leaves the footprint in x or z.
    let t1 = 1;
    for (const [p, d, lo, hi] of [[px, dx, x0, x1], [pz, dz, z0, z1]])
      if (Math.abs(d) > 1e-9) t1 = Math.min(t1, Math.max((lo - p) / d, (hi - p) / d));
    for (let k = 1; k <= STEPS; k++) {
      const t = (t1 * k) / STEPS;
      const c2 = cell(px + dx * t, pz + dz * t);
      if (c2 < 0 || height[c2] === -Infinity) return false; // out the side
      if (py + dy * t >= height[c2]) return true;
    }
    return false;
  }

  // --- state ------------------------------------------------------------------
  const hood = { angle: 0, vel: 0, phase: "shut", t: 0, from: 0, to: 0, wanted: false };
  // Axles: y is metres from where they sit empty (negative = squashed).
  const front = { y: 0, v: 0, kg: FRONT_KG, k: FRONT_KG * SPRING.w ** 2 };
  const rear = { y: 0, v: 0, kg: REAR_KG, k: REAR_KG * SPRING.w ** 2 };
  for (const a of [front, rear]) (a.c = 2 * SPRING.zeta * Math.sqrt(a.k * a.kg)), (a.ref = 0);
  // Engine: y is metres above the mounts while it hangs; sway and twist are
  // its swing on the chain; mount and roll its shake once it's in. load is
  // how much of its weight the car carries (0–1). chain is metres the chain
  // has lifted off it.
  let startH = 4; // m above the mounts where it hangs out of frame
  const eng = {
    phase: "out", t: 0, hoist: startH, speed: 0, y: startH, v: 0,
    sx: 0, svx: 0, sz: 0, svz: 0, tw: 0, twv: 0,
    mount: 0, mountV: 0, roll: 0, rollV: 0, load: 0, chain: 0, legs: 1,
  };

  // The car on the road: where it is (shape units, from where it was
  // built), which way it points, how fast it goes, the front wheels' steer,
  // how far the wheels have turned, and the body's lean.
  // spin and spinRear are how far the front and rear wheels have turned (the
  // rears can spin faster in a slide); u, w and yawRate are the donut's
  // forward and sideways speed at the rear axle, and its turn rate.
  const drive = {
    phase: "parked", mode: "plain", t: 0, x: 0, z: 0, heading: 0, v: 0, a: 0, steer: 0, spin: 0, spinRear: 0,
    roll: 0, rollV: 0, shake: 0, beat: "", bt: 0, u: 0, w: 0, yawRate: 0, slide: 0,
  };

  function spring(state, target, { w, zeta }, dt) {
    state.vel += (w * w * (target - state.angle) - 2 * zeta * w * state.vel) * dt;
    state.angle += state.vel * dt;
  }
  // carried: extra kg on the axle; push: extra force (N, up is positive).
  function axleSpring(a, carried, dt, push = 0) {
    const kg = a.kg + carried;
    a.v += ((-a.k * a.y - a.c * a.v - carried * G + push) / kg) * dt;
    a.y += a.v * dt;
    a.ref += ((-carried * G) / a.k - a.ref) * (1 - Math.exp(-dt / 0.5));
  }
  function osc(x, v, { w, zeta }, dt) {
    v += (-w * w * x - 2 * zeta * w * v) * dt;
    return [x + v * dt, v];
  }
  // How an axle is shown: true to where it settles under what it carries,
  // with the bounce around that scaled up. The settling point eases in
  // (ref), or a sudden load would jump the car the wrong way.
  const shownY = (a) => a.ref + (a.y - a.ref) * HEFT;
  // How far the body has moved at the engine's mounts, metres.
  const atSeat = () => rear.y + (front.y - rear.y) * frontShare;
  function go(phase, to) {
    Object.assign(hood, { phase, t: 0, from: hood.angle, to });
  }

  function tick(dt) {
    hood.t += dt;
    switch (hood.phase) {
      case "pop":
        spring(hood, POP_DEG * DEG, POP, dt);
        if (hood.t > POP_HOLD) go("lift", openAngle * LIFT_SHARE);
        break;
      case "lift":
      case "lower":
      case "prop":
      case "unprop": {
        const dur = { lift: LIFT_S, lower: LOWER_S, prop: PROP_S, unprop: UNPROP_S }[hood.phase];
        const hand = hood.from + (hood.to - hood.from) * minJerk(Math.min(1, hood.t / dur));
        spring(hood, hand, HAND, dt);
        if (hood.phase === "lift" && hood.t > dur * HANDOFF) go("strut", openAngle);
        else if (hood.t > dur) go({ lift: "strut", lower: "hold", prop: "propped", unprop: "strut" }[hood.phase], hood.to);
        break;
      }
      case "propped": // held straight up while the engine goes in or out
        spring(hood, hood.to, HAND, dt);
        break;
      case "strut":
        spring(hood, openAngle, STRUT, dt);
        break;
      case "hold":
        spring(hood, hood.to, HAND, dt);
        if (hood.t > DROP_HOLD) go("fall", 0);
        break;
      case "fall":
        // A uniform panel swinging on its hinge.
        hood.vel -= ((3 * G) / (2 * HOOD_LENGTH)) * Math.cos(hood.angle) * dt;
        hood.angle += hood.vel * dt;
        if (hood.angle <= 0) {
          const hit = -hood.vel;
          front.v -= SLAM_KICK * hit;
          rear.v += SLAM_KICK * hit * PITCH_SHARE;
          hood.angle = 0;
          if (hit > LATCH_SPEED) {
            hood.vel = hit * RESTITUTION;
          } else {
            go("shut", 0);
            hood.vel = 0;
          }
        }
        break;
    }
    tickEngine(dt);
    tickDrive(dt);
    // Accelerating shifts weight off the front axle onto the rear.
    const shift = (CAR_KG * drive.a * CG_H) / wheelbase;
    axleSpring(front, eng.load * share.front * ENGINE_KG, dt, shift);
    axleSpring(rear, eng.load * share.rear * ENGINE_KG, dt, -shift);
  }

  // Where the route is `s` metres along it.
  function routeAt(s) {
    const { route, routeLen } = drive;
    let k = 1;
    while (k < route.length - 1 && routeLen[k] < s) k++;
    const t = Math.min(1, Math.max(0, (s - routeLen[k - 1]) / (routeLen[k] - routeLen[k - 1] || 1)));
    return [route[k - 1][0] + (route[k][0] - route[k - 1][0]) * t, route[k - 1][1] + (route[k][1] - route[k - 1][1]) * t];
  }
  // One step of driving back (see RETURN): pure pursuit on the route, with
  // speed held to what the corner and the stop ahead allow.
  function returnStep(dt) {
    const d = drive, L = wheelbase, R = RETURN;
    const at = [d.x * unit, d.z * unit];
    // How far along it is: the nearest point a little ahead of last time,
    // but no further than it can have driven, as the loop's neck passes
    // close to a later stretch of the route.
    let best = d.along, bestD = Infinity;
    for (let s = d.along; s <= d.along + d.u * dt * 1.5 + 0.02; s += 0.01) {
      const p = routeAt(s), dd = Math.hypot(p[0] - at[0], p[1] - at[1]);
      if (dd < bestD) (bestD = dd), (best = s);
    }
    d.along = best;
    const stopAt = d.routeLen[d.routeLen.length - 2], left = Math.max(0, stopAt - d.along);
    // Steer for a point a lookahead along.
    const ahead = R.lookahead;
    const goal = routeAt(d.along + ahead);
    const alpha = Math.atan2(goal[0] - at[0], goal[1] - at[1]) - d.heading;
    const wrapped = Math.atan2(Math.sin(alpha), Math.cos(alpha));
    const want = Math.atan2(2 * L * Math.sin(wrapped), Math.max(ahead, 0.6));
    const turn = R.steerRate * DEG * dt;
    d.steer += Math.max(-turn, Math.min(turn, Math.max(-32 * DEG, Math.min(32 * DEG, want)) - d.steer));
    // Speed: cruise, slower for the tightest bend coming up (and the one
    // it's in), and a steady brake to stop on the spot.
    let bend = Math.abs(Math.tan(d.steer)) / L;
    for (let k = 0; k < d.route.length; k++)
      if (d.routeLen[k] >= d.along && d.routeLen[k] <= d.along + R.preview) bend = Math.max(bend, d.bend[k]);
    const corner = Math.sqrt((R.latG * G) / Math.max(1e-3, bend));
    const stop = Math.sqrt(2 * R.brake * left);
    const target = Math.min(R.cruise, corner, stop);
    const u0 = d.u;
    d.u = target > d.u ? Math.min(target, d.u + R.accel * dt) : Math.max(target, d.u - R.brake * 1.3 * dt);
    d.a = (d.u - u0) / dt;
    d.w = 0;
    d.slide = 0;
    d.yawRate = (d.u / L) * Math.tan(d.steer);
    const sn = Math.sin(d.heading), cs = Math.cos(d.heading);
    d.x += (d.u * sn * dt) / unit;
    d.z += (d.u * cs * dt) / unit;
    d.heading += d.yawRate * dt;
    d.v = d.u;
    d.spin += (d.u / wheelRadius) * dt;
    d.spinRear += (d.u / wheelRadius) * dt;
    d.rollV += BODY_ROLL.w ** 2 * ROLL_PER_G * ((d.yawRate * d.u) / G) * dt;
    // Stopped on the spot: park, still running.
    if (left < 0.05 || (left < 0.4 && d.u < 0.05)) {
      Object.assign(d, { beat: "parked", bt: 0, u: 0, v: 0, a: 0, yawRate: 0 });
      d.phase = "running";
    }
  }

  // One step of the donut (see DONUT). Each beat eases its targets in from
  // wherever the last beat left off, so nothing jumps.
  function donutStep(dt) {
    const d = drive, D = DONUT, L = wheelbase;
    d.bt += dt;
    const ease = (from, to, t) => from + (to - from) * smooth(Math.min(1, Math.max(0, t)));
    if (!d.beat) Object.assign(d, { beat: "turnin", bt: 0, from: { u: 0, steer: 0 } });
    const u0 = d.u;
    if (d.beat === "turnin") {
      // Grip: the plain bicycle model, pulling away into the turn.
      d.u = Math.min(D.turnIn.v, d.u + LAUNCH_A * smooth(Math.min(1, d.bt / LAUNCH_RAMP)) * dt);
      d.steer = ease(0, D.dir * D.turnIn.steerDeg * DEG, d.bt / D.turnIn.s);
      d.yawRate = (d.u / L) * Math.tan(d.steer);
      d.slide = 0;
      if (d.bt > D.turnIn.s) Object.assign(d, { beat: "break", bt: 0, from: { u: d.u, yawRate: d.yawRate } });
    } else if (d.beat === "break" || d.beat === "hold") {
      if (d.h0 === undefined) {
        // Where it lets go: the first heading pointing back along the line
        // that's at least minTurns round from here, the way it's turning.
        let hf = exitHeading + Math.round((d.heading - exitHeading) / (2 * Math.PI)) * 2 * Math.PI;
        while ((hf - d.heading) * D.dir < RETURN.minTurns * 2 * Math.PI) hf += D.dir * 2 * Math.PI;
        Object.assign(d, { h0: d.heading, hf });
      }
      // Power on: the rear steps out and the pivot moves up to the front.
      const k = d.beat === "break" ? d.bt / D.breakS : 1;
      d.u = ease(d.from.u, D.hold.v, k);
      d.yawRate = ease(d.from.yawRate, D.dir * D.hold.yawRate, k);
      d.slide = ease(0, D.hold.slide, k);
      if (d.beat === "break" && d.bt > D.breakS) Object.assign(d, { beat: "hold", bt: 0 });
      // Catch it early enough that the turn dying away (about half the turn
      // rate over the catch) lands it on the exit heading.
      const lead = Math.abs(d.yawRate) * D.catchS * 0.5;
      if (d.beat === "hold" && (d.hf - d.heading) * D.dir < lead)
        Object.assign(d, { beat: "catch", bt: 0, from: { u: d.u, yawRate: d.yawRate, slide: d.slide } });
    } else if (d.beat === "catch") {
      // Off the power and straighten: grip comes back, the turn dies away.
      const k = d.bt / D.catchS;
      d.u = ease(d.from.u, 6, k);
      d.slide = ease(d.from.slide, 0, k);
      d.yawRate = ease(d.from.yawRate, 0, k);
      if (d.bt > D.catchS) {
        // From here, round once and back: join the lap where it's nearest
        // (in its first stretch, so there's a full lap to drive).
        const here = [d.x * unit, d.z * unit];
        let join = 0, best = Infinity;
        for (let k = 0; k < returnPath.length * 0.3; k++) {
          const p = returnPath[k], dd = Math.hypot(p[0] - here[0], p[1] - here[1]);
          if (dd < best) (best = dd), (join = k);
        }
        d.route = [here, ...returnPath.slice(join + 1)];
        d.bend = [0, ...returnBend.slice(join + 1)];
        d.routeLen = [0];
        for (let k = 1; k < d.route.length; k++)
          d.routeLen.push(d.routeLen[k - 1] + Math.hypot(d.route[k][0] - d.route[k - 1][0], d.route[k][1] - d.route[k - 1][1]));
        Object.assign(d, { beat: "return", bt: 0, along: 0 });
      }
    } else if (d.beat === "return") {
      returnStep(dt);
      return;
    } else if (d.beat === "parked") {
      // Stopped: ease the last few millimetres onto the spot, and idle.
      const k = 1 - Math.exp(-dt / (RETURN.settleS / 4));
      d.x += (0 - d.x) * k, d.z += (0 - d.z) * k;
      d.heading += (Math.round(d.heading / (2 * Math.PI)) * 2 * Math.PI - d.heading) * k;
      d.steer += (0 - d.steer) * k;
      Object.assign(d, { u: 0, w: 0, v: 0, a: 0, yawRate: 0 });
      return;
    }
    // The rear slides out by the slide share of what pivoting on the front
    // axle would take; the fronts point along their own path.
    d.w = -d.slide * d.yawRate * L;
    if (d.beat !== "turnin") d.steer = Math.atan2(d.w + d.yawRate * L, Math.max(0.3, d.u));
    d.steer = Math.max(-35 * DEG, Math.min(35 * DEG, d.steer));
    // Move: forward u and sideways w at the rear axle, turning at yawRate.
    const sn = Math.sin(d.heading), cs = Math.cos(d.heading);
    d.x += ((d.u * sn + d.w * cs) * dt) / unit;
    d.z += ((d.u * cs - d.w * sn) * dt) / unit;
    d.heading += d.yawRate * dt;
    d.v = Math.hypot(d.u, d.w);
    // Fronts roll at their own ground speed; the rears spin up in the slide.
    d.spin += (Math.hypot(d.u, d.w + d.yawRate * L) / wheelRadius) * dt;
    d.spinRear += ((d.u + d.slide * D.wheelspin * Math.abs(d.yawRate) * L) / wheelRadius) * dt;
    // Weight shift: from speeding up, plus the rear driving hard in the slide.
    d.a = (d.u - u0) / dt + d.slide * D.throttleSquat;
    // Lean out of the turn, from the sideways pull at the middle of the car.
    const vMid = Math.hypot(d.u, d.w + (d.yawRate * L) / 2);
    d.rollV += BODY_ROLL.w ** 2 * ROLL_PER_G * ((d.yawRate * vMid) / G) * dt;
  }

  function tickDrive(dt) {
    const d = drive;
    d.t += dt;
    if (d.phase === "crank") {
      // The starter: a fast shudder through the body.
      d.shake = 0.0025 * Math.sin(d.t * 2 * Math.PI * 9) * smooth(Math.min(1, d.t / 0.15));
      if (d.t > CRANK_S) {
        // It catches: the torque twists the body over on its springs, and
        // the engine rocks on its mounts.
        d.rollV += FIRE_ROLL;
        eng.rollV += 1.2;
        front.v += 0.04, rear.v -= 0.03;
        Object.assign(d, { phase: "idle", t: 0, shake: 0 });
      }
    } else if (d.phase === "idle") {
      d.shake = 0.0006 * Math.sin(d.t * 2 * Math.PI * 7.5);
      if (d.t > IDLE_S) Object.assign(d, { phase: "go", t: 0 });
    } else if (d.phase === "go" && d.mode === "donut") {
      d.shake = 0;
      donutStep(dt);
    } else if (d.phase === "running") {
      // Parked with the engine running: the idle's light shake.
      d.shake = 0.0006 * Math.sin(d.t * 2 * Math.PI * 7.5);
      donutStep(dt);
    } else if (d.phase === "go") {
      d.shake = 0;
      d.a = d.v < TOP_V ? LAUNCH_A * smooth(Math.min(1, d.t / LAUNCH_RAMP)) : 0;
      d.v = Math.min(TOP_V, d.v + d.a * dt);
      const want = d.t > STEER_IN && Math.abs(d.heading) < TURN_DEG * DEG ? STEER_DEG * DEG : 0;
      const turn = STEER_RATE * DEG * dt;
      d.steer += Math.max(-turn, Math.min(turn, want - d.steer));
      // Bicycle model about the rear axle.
      const yawRate = (d.v / wheelbase) * Math.tan(d.steer);
      d.heading += yawRate * dt;
      d.x += (d.v * Math.sin(d.heading) * dt) / unit;
      d.z += (d.v * Math.cos(d.heading) * dt) / unit;
      d.spin += (d.v / wheelRadius) * dt;
      d.spinRear = d.spin;
      // Leaning out of the turn: turning towards +x, the top goes towards -x,
      // which is a positive roll about z.
      const lean = ROLL_PER_G * ((d.v * yawRate) / G);
      d.rollV += BODY_ROLL.w ** 2 * lean * dt;
    }
    [d.roll, d.rollV] = osc(d.roll, d.rollV, BODY_ROLL, dt);
    if (eng.phase === "seated" && d.phase !== "parked") [eng.roll, eng.rollV] = osc(eng.roll, eng.rollV, ROLL, dt);
  }

  function engineGo(phase) {
    eng.phase = phase;
    eng.t = 0;
  }
  function swing(dt, zeta) {
    const w = Math.sqrt(G / CHAIN_L);
    [eng.sx, eng.svx] = osc(eng.sx, eng.svx, { w, zeta }, dt);
    [eng.sz, eng.svz] = osc(eng.sz, eng.svz, { w, zeta }, dt);
    [eng.tw, eng.twv] = osc(eng.tw, eng.twv, { w: 1.6, zeta }, dt);
  }
  // The engine hangs off the hoist on a slightly stretchy chain.
  function hang(dt) {
    const [y, v] = osc(eng.y - eng.hoist, eng.v, STRETCH, dt);
    eng.y = eng.hoist + y;
    eng.v = v;
  }

  function tickEngine(dt) {
    eng.t += dt;
    switch (eng.phase) {
      case "hung": // on the chain (or not yet), waiting to go
        if (eng.legs >= 1) hang(dt), swing(dt, 0.04);
        break;
      case "wrap":
        if (eng.t < WRAP_HOOK_S) {
          eng.chain = WRAP_DROP * (1 - minJerk(eng.t / WRAP_HOOK_S));
          eng.legs = 0;
        } else if (eng.t < WRAP_HOOK_S + WRAP_LEGS_S) {
          eng.chain = 0;
          eng.legs = smooth((eng.t - WRAP_HOOK_S) / WRAP_LEGS_S);
        } else {
          // Taking up the slack lifts it a touch and sets it swinging.
          if (eng.legs < 1) Object.assign(eng, { legs: 1, svx: 0.02, svz: -0.03, twv: 0.03 });
          eng.hoist = eng.base + TAUT_LIFT * smooth(Math.min(1, (eng.t - WRAP_HOOK_S - WRAP_LEGS_S) / TAUT_S));
          hang(dt);
          swing(dt, 0.04);
          if (eng.t > WRAP_HOOK_S + WRAP_LEGS_S + TAUT_S) engineGo("hung");
        }
        break;
      case "wait": // for the hood to be up, then propped straight up
        if (eng.next === "lower") hang(dt), swing(dt, 0.04);
        if (hood.phase === "strut" && hood.angle > openAngle * 0.92) go("prop", propAngle);
        if (hood.phase === "propped" && hood.t > 0.2) {
          engineGo(eng.next);
          // Off the hoist from out of frame it starts with a swing; off the
          // build it already has one.
          if (eng.next === "lower" && eng.from === "out") Object.assign(eng, { speed: 0, sx: 0.035, svx: 0, sz: 0, svz: 0.06, tw: 0.05, twv: 0 });
          if (eng.next === "lower") eng.speed = 0;
        }
        break;
      case "lower": {
        // Steady run down, then inching: speed falls off near the mounts.
        const left = eng.hoist - HOVER;
        const want = left > INCH_D ? HOIST_V : Math.max(INCH_MIN, HOIST_V * (left / INCH_D) ** 0.6);
        eng.speed = Math.min(want, eng.speed + HOIST_A * dt);
        eng.hoist = Math.max(HOVER, eng.hoist - eng.speed * dt);
        hang(dt);
        // A hand steadies it over the last stretch.
        swing(dt, left < INCH_D ? 0.5 : 0.03);
        if (eng.hoist <= HOVER) engineGo("steady");
        break;
      }
      case "steady":
        hang(dt);
        swing(dt, 0.9);
        if (eng.t > STEADY_S) engineGo("drop");
        break;
      case "drop": {
        // The hoist lets go of the last few centimetres.
        eng.v -= G * dt;
        eng.y += eng.v * dt;
        swing(dt, 0.9);
        const seatY = atSeat();
        if (eng.y <= seatY) {
          // It lands: the car and engine move on together (momentum kept).
          for (const [a, sh] of [[front, share.front], [rear, share.rear]]) {
            const m = sh * ENGINE_KG;
            a.v = (a.kg * a.v + m * eng.v) / (a.kg + m);
          }
          Object.assign(eng, { load: 1, mount: 0, mountV: (eng.v - front.v) * 0.35, rollV: 0.22 });
          engineGo("seated");
        }
        break;
      }
      case "seated":
        // It sits on the body now; only the mounts and the chain move.
        [eng.mount, eng.mountV] = osc(eng.mount, eng.mountV, MOUNT, dt);
        [eng.roll, eng.rollV] = osc(eng.roll, eng.rollV, ROLL, dt);
        eng.sx *= Math.exp(-dt * 20), eng.sz *= Math.exp(-dt * 20), eng.tw *= Math.exp(-dt * 20);
        // The chain goes slack, unhooks, and the hook lifts away.
        if (eng.t < UNHOOK_S) eng.chain = -0.05 * smooth(eng.t / UNHOOK_S);
        else eng.chain = -0.05 + (startH + 0.05) * minJerk(Math.min(1, (eng.t - UNHOOK_S) / RETRACT_S));
        // Chain gone: the hood goes back down onto its struts.
        if (eng.t > UNHOOK_S + RETRACT_S && hood.phase === "propped") go("unprop", openAngle);
        break;
      case "hookup": // the hook comes back down for it
        eng.chain = startH * (1 - minJerk(Math.min(1, eng.t / HOOKUP_S)));
        [eng.mount, eng.mountV] = osc(eng.mount, eng.mountV, MOUNT, dt);
        if (eng.t > HOOKUP_S) engineGo("transfer");
        break;
      case "transfer": // the hoist takes the weight back off the car
        eng.chain = 0;
        eng.load = 1 - smooth(Math.min(1, eng.t / TRANSFER_S));
        if (eng.t > TRANSFER_S) {
          Object.assign(eng, { load: 0, y: atSeat(), v: 0, hoist: atSeat(), speed: 0, svx: 0.012, svz: -0.01 });
          engineGo("raise");
        }
        break;
      case "raise":
        eng.speed = Math.min(HOIST_V, eng.speed + HOIST_A * 0.6 * dt);
        eng.hoist += eng.speed * dt;
        hang(dt);
        swing(dt, 0.03);
        if (eng.hoist >= startH) {
          Object.assign(eng, { hoist: startH, y: startH, v: 0, sx: 0, svx: 0, sz: 0, svz: 0, tw: 0, twv: 0 });
          engineGo("out");
          if (hood.phase === "propped") go("unprop", openAngle);
        }
        break;
    }
  }

  // Where the engine and chain are, for the pose: offsets in shape units and
  // the engine's twist and roll.
  function engineOffset() {
    const seated = ["seated", "hookup", "transfer"].includes(eng.phase) || (eng.phase === "wait" && eng.next === "hookup");
    const fy = shownY(front), ry = shownY(rear);
    const dy = seated ? (ry + (fy - ry) * frontShare + eng.mount * HEFT) / unit : eng.y / unit;
    // Hung forward of the mounts while it passes the propped hood.
    const fwd = seated || !["prop", "propped", "unprop"].includes(hood.phase) ? 0 : ahead(eng.y);
    return { dx: eng.sx / unit, dy, dz: (eng.sz + fwd) / unit, tw: eng.tw, roll: seated ? eng.roll : 0, chain: eng.chain / unit, legs: eng.legs };
  }

  return {
    positions: out.positions,
    normals: out.normals,
    hoodIndices: hoodIdx,
    get hoodAngle() {
      return hood.angle;
    },
    // Whether the hood is up or on its way up (what a toggle should undo).
    get hoodOpen() {
      return hood.wanted;
    },
    openHood() {
      hood.wanted = true;
      if (reducedMotion) return Object.assign(hood, { phase: "strut", angle: openAngle, vel: 0 });
      if (hood.phase === "shut" || hood.phase === "fall") go("pop");
      else go("lift", openAngle * LIFT_SHARE);
    },
    closeHood() {
      if (this.engineBusy) return;
      hood.wanted = false;
      if (reducedMotion) return Object.assign(hood, { phase: "shut", angle: 0, vel: 0 });
      if (hood.phase !== "shut" && hood.phase !== "fall") go("lower", DROP_DEG * DEG);
    },
    // Puts the hood straight at `angle` (radians), at rest. Anything above
    // shut is held there by the struts.
    snapHood(angle) {
      Object.assign(hood, { phase: angle > 0 ? "hold" : "shut", angle, to: angle, vel: 0, t: -Infinity, wanted: angle > 0 });
    },
    get hoodShut() {
      return hood.phase === "shut";
    },
    // Whether the engine is in (or on its way in).
    get engineIn() {
      return ["hung", "wrap", "lower", "steady", "drop", "seated"].includes(eng.phase) || (eng.phase === "wait" && eng.next === "lower");
    },
    // While the engine or chain is moving, or the hood is propped for it,
    // the hood has to stay up.
    get engineBusy() {
      const settled = eng.phase === "out" || (eng.phase === "seated" && eng.t > UNHOOK_S + RETRACT_S);
      return !settled || ["prop", "propped", "unprop"].includes(hood.phase);
    },
    installEngine() {
      const fromHook = eng.phase === "hung" && eng.legs >= 1;
      if (!fromHook && (eng.phase !== "out" || this.engineBusy)) return;
      if (reducedMotion) return this.snapEngine(true);
      if (!hood.wanted) this.openHood();
      eng.from = eng.phase;
      eng.next = "lower";
      engineGo("wait");
    },
    // Hangs the engine `height` m above the mounts, still, with the chain
    // up out of the way: where the build happens.
    stageEngine(height) {
      Object.assign(eng, { hoist: height, base: height, y: height, v: 0, speed: 0, sx: 0, svx: 0, sz: 0, svz: 0,
        tw: 0, twv: 0, load: 0, chain: WRAP_DROP, legs: 0 });
      engineGo("hung");
    },
    // The hook comes down onto the staged engine and the chain takes it.
    wrapChain() {
      if (eng.phase !== "hung" || eng.legs >= 1) return;
      if (reducedMotion) return Object.assign(eng, { chain: 0, legs: 1 });
      engineGo("wrap");
    },
    // What the engine is doing ("out", "hung", "wrap", "lower", "seated", …).
    get enginePhase() {
      return eng.phase;
    },
    get engineHooked() {
      return eng.phase === "hung" && eng.legs >= 1;
    },
    // Poses the engine from `points` (engineIdx order, same frame as the
    // finished engine) instead of its own shape; null goes back.
    setEngineShape(points) {
      engineShape = points;
    },
    // The middle of the engine where it is now, in the car's frame.
    engineCentre() {
      const o = engineOffset();
      return { x: engineMid[0] + o.dx, y: engineMid[1] + o.dy, z: engineMid[2] + o.dz };
    },
    removeEngine() {
      if (this.engineBusy || eng.phase !== "seated") return;
      if (reducedMotion) return this.snapEngine(false);
      if (!hood.wanted) this.openHood();
      eng.next = "hookup";
      engineGo("wait");
    },
    // Puts the engine straight in (settled, chain gone) or out.
    snapEngine(on) {
      Object.assign(eng, { phase: on ? "seated" : "out", t: on ? Infinity : 0, load: on ? 1 : 0,
        hoist: startH, y: startH, v: 0, mount: 0, mountV: 0, roll: 0, rollV: 0, chain: on ? startH : 0 });
      for (const [a, sh] of [[front, share.front], [rear, share.rear]]) {
        a.y = a.ref = on ? (-sh * ENGINE_KG * G) / a.k : 0;
        a.v = 0;
      }
    },
    // How high (m above the mounts) the engine waits so it starts out of
    // frame. Takes effect the next time it sets off.
    setEntryHeight(m) {
      startH = m;
      if (eng.phase === "out") Object.assign(eng, { hoist: m, y: m });
    },
    // Cranks it, fires it and drives off. Needs the engine in and the hood shut.
    // mode "plain" pulls away and drives off; "donut" does a donut first.
    startCar(mode = "plain") {
      if (drive.phase !== "parked" || eng.phase !== "seated" || hood.phase !== "shut") return;
      Object.assign(drive, { phase: reducedMotion ? "go" : "crank", t: 0, mode: reducedMotion ? "plain" : mode, beat: "", h0: undefined });
    },
    // While the donut slides: the point it's turning about (car frame, as
    // the view's focus is) and how far its far corner swings from it. null
    // otherwise.
    // From the turn-in it's predicted from how the donut will settle, so a
    // view can start easing out before the tail swings wide.
    get donutCircle() {
      const d = drive;
      if (d.mode !== "donut" || !["turnin", "break", "hold", "catch"].includes(d.beat)) return null;
      const settling = d.beat === "turnin" || d.beat === "break";
      const H = DONUT.hold, r = settling ? DONUT.dir * H.yawRate : d.yawRate;
      if (Math.abs(r) < 0.3) return null;
      const u = settling ? H.v : d.u, w = settling ? -H.slide * r * wheelbase : d.w;
      const sn = Math.sin(d.heading), cs = Math.cos(d.heading);
      const vx = u * sn + w * cs, vz = u * cs - w * sn; // rear axle, m/s
      const rx = rearHub[0] + d.x, rz = rearHub[2] + d.z;
      const x = rx + vz / r / unit, z = rz - vx / r / unit;
      let radius = 0;
      for (const [cx, cz] of corners)
        radius = Math.max(radius, Math.hypot(rx + cs * cx + sn * cz - x, rz - sn * cx + cs * cz - z));
      return { x, z, radius };
    },
    // For the tyre smoke: how much faster the rear tyres spin than the
    // ground moves under them (m/s), where they touch the ground (car frame,
    // where the car has driven to), and which way they throw it. null when
    // they aren't spinning up.
    get tyreSmoke() {
      const d = drive;
      if (d.mode !== "donut" || d.slide <= 0) return null;
      const slip = d.slide * DONUT.wheelspin * Math.abs(d.yawRate) * wheelbase;
      if (slip < 0.5) return null;
      const dc = Math.cos(d.heading), ds = Math.sin(d.heading);
      const patches = wheels.filter((w) => !w.front).map(({ hub, radius }) => {
        const x = hub[0] - rearHub[0], z = hub[2] - rearHub[2];
        return { x: rearHub[0] + dc * x + ds * z + d.x, y: hub[1] - radius / unit, z: rearHub[2] - ds * x + dc * z + d.z };
      });
      return { slip, patches, back: [-ds, -dc] };
    },
    // A copy of the drive state, for checking the motion from outside.
    get driveState() {
      return { ...drive, xm: drive.x * unit, zm: drive.z * unit };
    },
    // The donut's beat ("turnin", "break", "hold", "catch", "return", "parked").
    get carBeat() {
      return drive.mode === "donut" ? drive.beat : "";
    },
    get carPhase() {
      return drive.phase;
    },
    // How far it has driven (m).
    get driven() {
      return Math.hypot(drive.x, drive.z) * unit;
    },
    // Back where it was built: parked, engine out, hood shut, springs still.
    resetCar() {
      Object.assign(drive, { phase: "parked", mode: "plain", t: 0, x: 0, z: 0, heading: 0, v: 0, a: 0, steer: 0, spin: 0,
        spinRear: 0, roll: 0, rollV: 0, shake: 0, beat: "", bt: 0, u: 0, w: 0, yawRate: 0, slide: 0, h0: undefined });
      this.snapEngine(false);
      this.snapHood(0);
    },
    // Velocity kicks to the axles in m/s (negative pushes down). The engine
    // landing in the bay will use this.
    jolt(frontV, rearV = 0) {
      if (reducedMotion) return;
      front.v += frontV;
      rear.v += rearV;
    },
    step(dt) {
      // Small fixed steps keep the stiff latch spring stable.
      const STEP = 1 / 240;
      for (let left = Math.min(dt, 0.1); left > 1e-6; left -= STEP) tick(Math.min(STEP, left));
    },
    // Writes the posed car into rig.positions / rig.normals. cam is the
    // camera in the car's frame, for hiding the bay behind the hood. dt eases
    // bay points in and out so the reveal doesn't flicker. hideCar (0–1)
    // hides the car's points (not the engine or chain): each at its own
    // turn, so lowering it brings the car in point by point. With hideAt
    // (positions, n * 3, car frame), a hidden point waits there and flies in
    // to its place as its turn comes; without, it's parked far below.
    pose(cam, dt = 1 / 60, angle = hood.angle, hideCar = 0, hideAt = null) {
      const P = out.positions, N = out.normals;
      P.set(positions);
      N.set(normals);
      // Where it's driven to: everything below is worked out in the car's
      // own frame, so bring the camera into it, and move the car at the end.
      const moved = drive.x || drive.z || drive.heading;
      const dc = Math.cos(drive.heading), ds = Math.sin(drive.heading);
      if (cam && moved) {
        const x = cam.x - drive.x - rearHub[0], z = cam.z - drive.z - rearHub[2];
        cam = { x: rearHub[0] + dc * x - ds * z, y: cam.y, z: rearHub[2] + ds * x + dc * z };
      }
      // Engine: roll about its crank, twist on the chain, then hang where it is.
      const o = engineOffset();
      const cr = Math.cos(o.roll), sr = Math.sin(o.roll), ct = Math.cos(o.tw), st = Math.sin(o.tw);
      const src = engineShape;
      for (let k = 0; k < engineIdx.length; k++) {
        const i = engineIdx[k];
        let x, y, z;
        if (src) (x = src[k * 3] - seat.x), (y = src[k * 3 + 1] - centreY), (z = src[k * 3 + 2] - seat.z);
        else (x = positions[i * 3] - seat.x), (y = positions[i * 3 + 1] - centreY), (z = positions[i * 3 + 2] - seat.z);
        [x, y] = [cr * x - sr * y, sr * x + cr * y];
        [x, z] = [ct * x + st * z, -st * x + ct * z];
        P[i * 3] = seat.x + x + o.dx;
        P[i * 3 + 1] = centreY + y + o.dy;
        P[i * 3 + 2] = seat.z + z + o.dz;
        let nx = normals[i * 3], ny = normals[i * 3 + 1], nz = normals[i * 3 + 2];
        [nx, ny] = [cr * nx - sr * ny, sr * nx + cr * ny];
        [nx, nz] = [ct * nx + st * nz, -st * nx + ct * nz];
        N[i * 3] = nx, N[i * 3 + 1] = ny, N[i * 3 + 2] = nz;
      }
      // Chain: hangs off the engine, or lifts off it. Legs not yet paid out
      // bunch up at the end that's coming down.
      const reach = 1 - o.legs;
      for (const i of chainIdx) {
        let x = positions[i * 3] - seat.x, y = positions[i * 3 + 1], z = positions[i * 3 + 2] - seat.z;
        const t = legT[i];
        if (t >= 0 && t < reach) {
          const k = (1 - reach) / (1 - t);
          x *= k, z *= k;
          y = hookY + (y - hookY) * k;
        }
        [x, z] = [ct * x + st * z, -st * x + ct * z];
        P[i * 3] = seat.x + x + o.dx;
        P[i * 3 + 1] = y + o.dy + o.chain;
        P[i * 3 + 2] = seat.z + z + o.dz;
      }
      const c = Math.cos(angle), s = Math.sin(angle);
      for (const i of hoodIdx) {
        const dy = positions[i * 3 + 1] - hingeY, dz = positions[i * 3 + 2] - hingeZ;
        P[i * 3 + 1] = hingeY + c * dy + s * dz;
        P[i * 3 + 2] = hingeZ - s * dy + c * dz;
        const ny = normals[i * 3 + 1], nz = normals[i * 3 + 2];
        N[i * 3 + 1] = c * ny + s * nz;
        N[i * 3 + 2] = -s * ny + c * nz;
      }
      // Bay and engine points behind the hood get a normal facing straight
      // away from the camera, which the shader's back-face dimming turns
      // down to uBack.
      const ease = 1 - Math.exp(-dt * 25);
      for (const i of hiddenIdx) {
        const want = !cam || (!blocked(P, i, cam, c, s) && (!inBay(P, i) || throughOpening(P, i, cam))) ? 1 : 0;
        shown[i] += (want - shown[i]) * ease;
        if (shown[i] > 0.98) continue;
        let ax = P[i * 3] - (cam?.x ?? 0), ay = P[i * 3 + 1] - (cam?.y ?? 0), az = P[i * 3 + 2] - (cam?.z ?? 1);
        const len = Math.hypot(ax, ay, az) || 1;
        const k = shown[i] * shown[i];
        let nx = (ax / len) * (1 - k) + N[i * 3] * k;
        let ny = (ay / len) * (1 - k) + N[i * 3 + 1] * k;
        let nz = (az / len) * (1 - k) + N[i * 3 + 2] * k;
        const l2 = Math.hypot(nx, ny, nz) || 1;
        N[i * 3] = nx / l2;
        N[i * 3 + 1] = ny / l2;
        N[i * 3 + 2] = nz / l2;
      }
      // Once it has lifted clear for good, the chain is parked out of any
      // frame too (a wide view would otherwise catch it waiting up there).
      if (eng.phase === "seated" && eng.t > UNHOOK_S + RETRACT_S) for (const i of chainIdx) P[i * 3 + 1] = 1000;
      // The body rides on its springs; the wheels stay planted. Between the
      // axles it's a straight line, so a front dip pitches the car. It also
      // leans (about a line along the car at hub height), and shudders while
      // the starter turns.
      if (front.y !== 0 || rear.y !== 0) {
        const yf = shownY(front) / unit, yr = shownY(rear) / unit;
        for (const i of bodyIdx) {
          const k = (P[i * 3 + 2] - zr) / (zf - zr);
          P[i * 3 + 1] += yr + (yf - yr) * k;
        }
      }
      const lean = drive.roll * ROLL_SHOW;
      if (lean || drive.shake) {
        const lc = Math.cos(lean), ls = Math.sin(lean), shake = (drive.shake * HEFT) / unit;
        for (const idx of [bodyIdx, engineIdx])
          for (const i of idx) {
            const x = P[i * 3], y = P[i * 3 + 1] - rollY;
            P[i * 3] = lc * x - ls * y;
            P[i * 3 + 1] = rollY + ls * x + lc * y + shake;
            const nx = N[i * 3], ny = N[i * 3 + 1];
            N[i * 3] = lc * nx - ls * ny, N[i * 3 + 1] = ls * nx + lc * ny;
          }
      }
      // The wheels roll about their hubs; the front ones steer.
      if (drive.spin || drive.spinRear || drive.steer) {
        for (const w of wheels) {
          const turned = w.front ? drive.spin : drive.spinRear;
          const rc = Math.cos(turned), rs = Math.sin(turned);
          const sa = w.front ? drive.steer : 0, sc = Math.cos(sa), ss = Math.sin(sa);
          for (const i of w.idx) {
            let x = P[i * 3] - w.hub[0], y = P[i * 3 + 1] - w.hub[1], z = P[i * 3 + 2] - w.hub[2];
            [y, z] = [rc * y - rs * z, rs * y + rc * z];
            [x, z] = [sc * x + ss * z, -ss * x + sc * z];
            P[i * 3] = w.hub[0] + x, P[i * 3 + 1] = w.hub[1] + y, P[i * 3 + 2] = w.hub[2] + z;
            let nx = N[i * 3], ny = N[i * 3 + 1], nz = N[i * 3 + 2];
            [ny, nz] = [rc * ny - rs * nz, rs * ny + rc * nz];
            [nx, nz] = [sc * nx + ss * nz, -ss * nx + sc * nz];
            N[i * 3] = nx, N[i * 3 + 1] = ny, N[i * 3 + 2] = nz;
          }
        }
      }
      // Off down the road: turn about the rear axle, then move.
      if (moved)
        for (let i = 0; i < n; i++) {
          const x = P[i * 3] - rearHub[0], z = P[i * 3 + 2] - rearHub[2];
          P[i * 3] = rearHub[0] + dc * x + ds * z + drive.x;
          P[i * 3 + 2] = rearHub[2] - ds * x + dc * z + drive.z;
          const nx = N[i * 3], nz = N[i * 3 + 2];
          N[i * 3] = dc * nx + ds * nz, N[i * 3 + 2] = -ds * nx + dc * nz;
        }
      // Hidden car points: waiting at hideAt and flying in on their turn, or
      // parked far below, out of any frame.
      if (hideCar > 0)
        for (const i of carIdx) {
          if (!hideAt) {
            if (dissolve[i] < hideCar) P[i * 3 + 1] = -1000;
            continue;
          }
          const k = smooth(Math.min(1, Math.max(0, (1 - hideCar - dissolve[i] * 0.7) / 0.3)));
          if (k >= 1) continue;
          for (let a = 0; a < 3; a++) P[i * 3 + a] = hideAt[i * 3 + a] + (P[i * 3 + a] - hideAt[i * 3 + a]) * k;
        }
    },
    openAngle,
    propAngle,
    // Furthest forward (m) the engine hangs on its way past the hood.
    maxAhead: Math.max(...aheadAt),
  };
}

// Where the engine sits on its mounts in shape space: the middle of the
// stock engine's box, at its bottom.
function engineSeat({ engineBox: { min, max } }) {
  return { x: (min[0] + max[0]) / 2, y: min[1], z: (min[2] + max[2]) / 2 };
}

// A stand-in V8 until the Coyote cloud is ready: block, two heads in a V,
// intake and front cover, plus the hoist chain above it (two legs to each
// side to a hook, and the line up to the crane). Built sitting on its
// mounts; the rig moves it from there. Returns arrays to append to the car's.
export function placeholderEngine({ engineCount, chainCount, meta }) {
  const unit = meta.metresPerUnit;
  const seat = engineSeat(meta);
  const count = engineCount + chainCount;
  const positions = new Float32Array(count * 3), normals = new Float32Array(count * 3);
  const lum = new Float32Array(count), parts = new Uint8Array(count);
  // Metres, from the middle of the engine's bottom. rz leans a head outwards.
  // Its top sits ~0.36 m up, under the shut hood's underside.
  const BOXES = [
    { c: [0, 0.13, 0], s: [0.42, 0.26, 0.6] }, // block
    { c: [-0.17, 0.27, 0], s: [0.2, 0.1, 0.58], rz: 0.62 }, // heads
    { c: [0.17, 0.27, 0], s: [0.2, 0.1, 0.58], rz: -0.62 },
    { c: [0, 0.31, -0.02], s: [0.22, 0.09, 0.46] }, // intake
    { c: [0, 0.19, 0.32], s: [0.34, 0.3, 0.04] }, // front cover
  ];
  const faceArea = (b, a) => b.s[(a + 1) % 3] * b.s[(a + 2) % 3];
  const boxArea = BOXES.map((b) => 2 * (faceArea(b, 0) + faceArea(b, 1) + faceArea(b, 2)));
  const boxEdge = BOXES.map((b) => 4 * (b.s[0] + b.s[1] + b.s[2]));
  const pick = (weights) => {
    let r = Math.random() * weights.reduce((a, b) => a + b, 0);
    return weights.findIndex((w) => (r -= w) < 0);
  };
  const put = (i, b, local, nrm, l) => {
    const c = Math.cos(b.rz ?? 0), s = Math.sin(b.rz ?? 0);
    const x = local[0] * b.s[0], y = local[1] * b.s[1], z = local[2] * b.s[2];
    positions[i * 3] = seat.x + (b.c[0] + c * x - s * y) / unit;
    positions[i * 3 + 1] = seat.y + (b.c[1] + s * x + c * y) / unit;
    positions[i * 3 + 2] = seat.z + (b.c[2] + z) / unit;
    const n = [c * nrm[0] - s * nrm[1], s * nrm[0] + c * nrm[1], nrm[2]];
    const len = Math.hypot(...n) || 1;
    for (let a = 0; a < 3; a++) normals[i * 3 + a] = n[a] / len;
    lum[i] = l;
    parts[i] = ENGINE;
  };
  const EDGE_SHARE = 0.35;
  for (let i = 0; i < engineCount; i++) {
    const r = () => Math.random() - 0.5;
    if (i < engineCount * EDGE_SHARE) {
      // Along an edge: two coordinates pinned to corners, one free.
      const b = BOXES[pick(boxEdge)];
      const free = pick(b.s);
      const local = [0, 1, 2].map((a) => (a === free ? r() : Math.random() < 0.5 ? -0.5 : 0.5));
      const nrm = local.map((v, a) => (a === free ? 0 : Math.sign(v)));
      put(i, b, local, nrm, 0.95);
    } else {
      const b = BOXES[pick(boxArea)];
      const axis = pick([faceArea(b, 0), faceArea(b, 1), faceArea(b, 2)]);
      const side = Math.random() < 0.5 ? -0.5 : 0.5;
      const local = [r(), r(), r()];
      local[axis] = side;
      const nrm = [0, 0, 0];
      nrm[axis] = Math.sign(side);
      put(i, b, local, nrm, 0.45 + 0.35 * Math.max(0, nrm[1]) + Math.random() * 0.1);
    }
  }
  // Chain: four legs from lifting points on the heads to a hook, then the
  // line up to the crane, well out of frame.
  // The eyes sit just under the top of the box the engine fills (the
  // Coyote's top lines up with it; the stand-in is a little lower).
  const eye = (meta.engineBox.max[1] - meta.engineBox.min[1]) * unit - 0.04;
  const hook = [0, eye + 0.95, 0], TOP = 14;
  const legs = [[-0.18, eye, 0.22], [0.18, eye, 0.22], [-0.18, eye, -0.22], [0.18, eye, -0.22]];
  const legLen = Math.hypot(0.18, 0.95, 0.22);
  for (let i = engineCount; i < count; i++) {
    const k = i - engineCount;
    let p;
    // Same spacing on the legs and the line, so it reads as one chain.
    const onLegs = k < chainCount * ((4 * legLen) / (4 * legLen + 3));
    if (onLegs) {
      const a = legs[k % 4], t = Math.random();
      p = a.map((v, j) => v + (hook[j] - v) * t);
    } else {
      p = [0, hook[1] + Math.random() * 3 + (Math.random() < 0.3 ? Math.random() * TOP : 0), 0];
    }
    positions[i * 3] = seat.x + p[0] / unit;
    positions[i * 3 + 1] = seat.y + p[1] / unit;
    positions[i * 3 + 2] = seat.z + p[2] / unit;
    lum[i] = 0.6;
    parts[i] = CHAIN;
  }
  return { positions, normals, lum, parts };
}
