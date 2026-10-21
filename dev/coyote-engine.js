// The Coyote for the Mustang rig: a drop-in for placeholderEngine() in
// assets/particles/mustang-rig.js, with the same arguments and the same
// arrays back, so the rig hoists, lands and shakes it exactly as it does the
// stand-in. Not used by the live page.
//
// The engine is the assembled one from dev/engine.html: points the finished
// engine hides sit on the visible point export.py paired them with. Both
// clouds use the same frame (x right, y up, z towards the nose), so it only
// needs scaling from millimetres and placing:
//   - across: centred on the box the car model's own engine filled
//     (meta.engineBox);
//   - height: its top at that box's top. The car model only has the top of
//     its engine, so the box is 440 mm tall to the Coyote's 750; lining up
//     the tops keeps the cover under the hood and puts the sump down between
//     the frame rails, where it really sits. The rig's hoist chain is sized
//     to that same top;
//   - along: its front (the pulleys) at the box's front, about 26 cm ahead
//     of the front axle, with the rest of it behind (front-mid, as in the
//     real car).

import { placeholderEngine } from "../assets/particles/mustang-rig.js";
import { createBuild } from "./engine-build.js";

const ENGINE = 5; // the rig's part id for engine points

async function load(base) {
  const [buf, emeta] = await Promise.all([
    fetch(`${base}coyote.bin`).then((r) => r.arrayBuffer()),
    fetch(`${base}coyote.json`).then((r) => r.json()),
  ]);
  // Layout: dev/engine-data/tools/export.py.
  const n = new DataView(buf).getUint32(0, true);
  return {
    n,
    emeta,
    pos: new Int16Array(buf, 4, n * 3),
    nrm: new Int8Array(buf, 4 + n * 6, n * 3),
    lum8: new Uint8Array(buf, 4 + n * 9, n),
    part8: new Uint8Array(buf, 4 + n * 10, n),
    partner: new Uint16Array(buf, 4 + n * 11, n),
  };
}

// base: where coyote.bin and coyote.json are, relative to the page.
// build: a coyoteEngineBuild() to take the finished engine from; pass the one
// the page animates so the hand-over from the build to the hoist is exact.
export async function coyoteEngine({ engineCount, chainCount, meta, base = "engine-data/", build }) {
  build ??= await coyoteEngineBuild({ engineCount, meta, base });
  const count = engineCount + chainCount;
  const positions = new Float32Array(count * 3), normals = new Float32Array(count * 3);
  const lum = new Float32Array(count), parts = new Uint8Array(count);
  positions.set(build.finished.positions);
  normals.set(build.normals);
  lum.set(build.finished.lum);
  parts.fill(ENGINE, 0, engineCount);

  // The hoist chain is the stand-in's.
  const chain = placeholderEngine({ engineCount: 0, chainCount, meta });
  positions.set(chain.positions, engineCount * 3);
  normals.set(chain.normals, engineCount * 3);
  lum.set(chain.lum, engineCount);
  parts.set(chain.parts, engineCount);
  return { positions, normals, lum, parts };
}

// The engine coming together, in the car's frame: the stage-2 build from
// dev/engine.html, placed exactly where coyoteEngine() puts the finished
// engine, so the last frame of the build is the engine the rig hoists.
//
//   const build = await coyoteEngineBuild({ engineCount, meta });
//   const engine = await coyoteEngine({ engineCount, chainCount, meta, build });
//   each frame: const scale = build.apply(u, out);  // u: 0 exploded … 1 built
//
// out is { positions, lum } with room for engineCount points, in the same
// order as coyoteEngine()'s first engineCount points; build.finished is the
// last frame (u = 1), which is what coyoteEngine() hands the rig. The parts
// spread out round the engine's own centre, and nothing is scaled down
// while they're out: scale (≤ 1) is how much the engine page would shrink
// it to keep everything in frame, so a camera can pull back by 1 / scale.
// spread (default 0.7) is how far apart the parts sit, as on the engine page.
export async function coyoteEngineBuild({ engineCount, meta, base = "engine-data/", spread = 0.7 }) {
  const { n, emeta, pos, nrm, lum8, part8, partner: partner16 } = await load(base);
  const source = {
    positions: new Float32Array(engineCount * 3),
    normals: new Float32Array(engineCount * 3),
    lum: new Float32Array(engineCount),
    parts: new Uint8Array(engineCount),
    hidden: new Uint8Array(engineCount),
    partner: new Int32Array(engineCount).fill(-1),
  };
  for (let i = 0; i < engineCount; i++) {
    const k = i % n;
    for (let a = 0; a < 3; a++) {
      source.positions[i * 3 + a] = pos[k * 3 + a] / 32767;
      source.normals[i * 3 + a] = nrm[k * 3 + a] / 127;
    }
    source.lum[i] = lum8[k] / 255;
    source.parts[i] = part8[k] & 127;
    source.hidden[i] = part8[k] >> 7;
    // A partner past the prefix is dropped; the build picks one of the same part.
    if (partner16[k] !== 65535 && partner16[k] < engineCount && k === i) source.partner[i] = partner16[k];
  }
  const apply = createBuild(source, emeta.mmToUnit, (x, y, z) => [x, y, z], { zoom: false });

  // Same scale and placement as coyoteEngine(): from the finished engine.
  const k = 1 / emeta.mmToUnit / 1000 / meta.metresPerUnit;
  const done = { positions: new Float32Array(engineCount * 3), lum: new Float32Array(engineCount) };
  apply(1, spread, done);
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < engineCount; i++)
    for (let a = 0; a < 3; a++) {
      lo[a] = Math.min(lo[a], done.positions[i * 3 + a] * k);
      hi[a] = Math.max(hi[a], done.positions[i * 3 + a] * k);
    }
  const { min, max } = meta.engineBox;
  const shift = [(min[0] + max[0]) / 2 - (lo[0] + hi[0]) / 2, max[1] - hi[1], max[2] - hi[2]];

  const place = (out) => {
    for (let i = 0; i < engineCount; i++)
      for (let a = 0; a < 3; a++) out.positions[i * 3 + a] = out.positions[i * 3 + a] * k + shift[a];
  };
  place(done);
  return {
    finished: done,
    normals: source.normals,
    apply(u, out) {
      const scale = apply(u, spread, out);
      place(out);
      return scale;
    },
  };
}
