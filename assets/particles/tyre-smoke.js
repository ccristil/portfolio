// Tyre smoke for the Mustang: a point layer drawn over the particle field
// (as orcas.js draws the orcas), so the car keeps all of its own points.
//
// It's made of the same kind of dots as everything else, sized and coloured
// like the field's points, gathered into puffs. Each puff is a cluster of
// dots around a centre: the centre is pushed back off the tyre, slows in
// the air and rises slowly as it's warm, while the cluster swells from tight
// at the tyre to a metre or more across and turns slowly on itself, so it
// curls. Its dots wobble and fade, the edges first. A run of overlapping
// puffs reads as billowing smoke rather than specks flying in straight lines.
// Puffs come off the rear tyres' contact patches, more of them the harder
// the tyres spin over the ground.
//
//   const smoke = createTyreSmoke({ field, max, unit });
//   each frame: smoke.emit(source, dt); smoke.step(dt, toScene);
//
// Smoke lives in the car's frame (shape units, where the rig moves the car);
// toScene(x, y, z) maps a point from there to the field's scene, the same
// way the page and the shader move the car's points.

import * as THREE from "three";
import { fragmentShader } from "./particles.js";

const PUFFS = 14; // puffs per second per tyre at full wheelspin
const FULL_SLIP = 6; // m/s of wheelspin that counts as full
const DOTS = 70; // dots per puff
const LIFE = [2.4, 3.6]; // s
const SIZE = { start: 0.1, end: [0.45, 0.95] }; // m, a puff's radius
const THROW = [0.3, 1.1]; // m/s, the puff's push back off the tyre
const DRIFT = 0.3; // m/s sideways, at random
const DRAG = 0.9; // 1/s
const RISE = 0.5; // m/s², as it's warm
const CURL = [0.4, 1.4]; // rad/s, a puff turning on itself
const WOBBLE = 0.08; // m, each dot's own drift within its puff
const BRIGHT = 1.5; // a dot's brightness at the puff's heart (the field's points are 1)

const vertexShader = /* glsl */ `
  attribute float aLum;
  attribute float aFade;
  uniform float uSize;
  uniform float uPixelRatio;
  varying float vLum;
  varying float vSpark;
  varying float vFade;
  varying float vExposure;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    vLum = aLum;
    vSpark = 0.0;
    vFade = aFade;
    vExposure = 1.0;
    gl_PointSize = aFade > 0.0 ? uSize * uPixelRatio * (0.55 + aLum * 0.8) * (6.0 / max(0.6, -mv.z)) : 0.0;
  }
`;

export function createTyreSmoke({ field, max = 3000, unit, reducedMotion = false }) {
  // Per dot: its puff's centre and that centre's velocity (every dot of a
  // puff starts with the same, so they move as one), its place within the
  // puff (a direction scaled 0–1), how fast the puff curls, how big it grows,
  // and its age and life.
  const centre = new Float32Array(max * 3), vel = new Float32Array(max * 3), place = new Float32Array(max * 3);
  const curl = new Float32Array(max), grow = new Float32Array(max), seed = new Float32Array(max);
  const ground = new Float32Array(max);
  const age = new Float32Array(max).fill(Infinity), life = new Float32Array(max);
  const geometry = new THREE.BufferGeometry();
  const scenePos = new THREE.BufferAttribute(new Float32Array(max * 3), 3);
  const lum = new THREE.BufferAttribute(new Float32Array(max), 1);
  const fade = new THREE.BufferAttribute(new Float32Array(max), 1);
  geometry.setAttribute("position", scenePos);
  geometry.setAttribute("aLum", lum);
  geometry.setAttribute("aFade", fade);
  const shared = field.uniforms;
  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    // Shared with the field, so the dots are the same size and colours.
    uniforms: {
      uSize: shared.uSize,
      uPixelRatio: shared.uPixelRatio,
      uColorLo: shared.uColorLo,
      uColorHi: shared.uColorHi,
      uOpacity: shared.uOpacity,
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
    blendSrcAlpha: THREE.OneFactor,
    blendDstAlpha: THREE.OneFactor,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  field.scene.add(points);

  let next = 0, owed = 0;
  const rand = (lo, hi) => lo + Math.random() * (hi - lo);

  function puff(p, back) {
    const thrown = rand(...THROW), side = rand(-DRIFT, DRIFT);
    const v = [(back[0] * thrown - back[1] * side) / unit, rand(0.1, 0.35) / unit, (back[1] * thrown + back[0] * side) / unit];
    const turn = rand(...CURL) * (Math.random() < 0.5 ? -1 : 1), size = rand(...SIZE.end), span = rand(...LIFE);
    for (let n = 0; n < DOTS; n++) {
      const i = next;
      next = (next + 1) % max;
      centre[i * 3] = p.x, centre[i * 3 + 1] = p.y, centre[i * 3 + 2] = p.z;
      for (let a = 0; a < 3; a++) vel[i * 3 + a] = v[a];
      // A point in a ball, a little flattened, filled evenly.
      let x, y, z;
      do (x = rand(-1, 1)), (y = rand(-1, 1)), (z = rand(-1, 1));
      while (x * x + y * y + z * z > 1);
      place[i * 3] = x, place[i * 3 + 1] = y * 0.7, place[i * 3 + 2] = z;
      curl[i] = turn;
      grow[i] = size;
      seed[i] = Math.random() * 100;
      ground[i] = p.y;
      age[i] = 0;
      life[i] = span * rand(0.8, 1.1);
      lum.array[i] = 0.45 + 0.55 * (1 - Math.hypot(x, y, z)); // brighter at the heart
    }
  }

  return {
    // source: { slip (m/s), patches: [{ x, y, z }], back: [x, z] } or null.
    // back is the way the tyres throw it (behind the car), as a unit vector.
    emit(source, dt) {
      if (!source || reducedMotion) return;
      owed += PUFFS * Math.min(1, source.slip / FULL_SLIP) * dt * source.patches.length;
      while (owed >= 1) {
        owed -= 1;
        puff(source.patches[(Math.random() * source.patches.length) | 0], source.back);
      }
    },
    step(dt, toScene) {
      const keep = Math.exp(-DRAG * dt), S = scenePos.array, F = fade.array;
      for (let i = 0; i < max; i++) {
        if (age[i] >= life[i]) {
          F[i] = 0;
          continue;
        }
        if (dt > 0) {
          age[i] += dt;
          for (let a = 0; a < 3; a++) vel[i * 3 + a] *= keep;
          vel[i * 3 + 1] += (RISE / unit) * dt;
          for (let a = 0; a < 3; a++) centre[i * 3 + a] += vel[i * 3 + a] * dt;
        }
        const t = age[i] / life[i];
        const radius = (SIZE.start + (grow[i] - SIZE.start) * (1 - Math.exp(-age[i] * 1.3))) / unit;
        // Keep the puff off the ground while it's still low and fat.
        const cy = Math.max(centre[i * 3 + 1], ground[i] + radius * 0.45);
        const a = curl[i] * age[i], c = Math.cos(a), sn = Math.sin(a);
        const px = place[i * 3], pz = place[i * 3 + 2], w = WOBBLE / unit, k = seed[i] + age[i] * 0.9;
        const ox = (c * px + sn * pz) * radius + Math.sin(k) * w;
        const oy = place[i * 3 + 1] * radius + Math.sin(k * 1.3 + 2) * w;
        const oz = (-sn * px + c * pz) * radius + Math.cos(k * 0.8 + 1) * w;
        [S[i * 3], S[i * 3 + 1], S[i * 3 + 2]] = toScene(centre[i * 3] + ox, cy + oy, centre[i * 3 + 2] + oz);
        // Fades in fast, out slowly; the puff's edges go first.
        const edge = Math.hypot(place[i * 3], place[i * 3 + 1] / 0.7, place[i * 3 + 2]);
        F[i] = BRIGHT * Math.min(1, age[i] / 0.15) * Math.max(0, 1 - t * (0.7 + 0.6 * edge)) ** 1.3;
      }
      scenePos.needsUpdate = fade.needsUpdate = lum.needsUpdate = true;
    },
    // Clears the air (for a replay).
    clear() {
      age.fill(Infinity);
      owed = 0;
    },
  };
}
