// The orca pod as a point layer on the particle field. orca-pod.js holds the
// model and the schedule; this draws them in the field's scene, lined up with
// the iceberg, bending each orca along its spine on the GPU.
//
// createOrcaLayer(field, { shapeIndex, shape, count, reducedMotion })
//   shapeIndex  the iceberg's index in the field's shape list
//   shape       the iceberg itself (for its frame and its outline)
// Returns { update(presence), setClock(seconds, frozen), setSpeed(x), info(),
// uniforms, dispose() }. uniforms is exposed for tuning pages (dev/orcas.html).
// Call update() once a frame with how much of the berg is on screen (0–1,
// see presenceOf). The pod clock only runs while the berg is fully formed
// and resets once it's gone, so the scene always opens empty.

import * as THREE from "three";
import { fragmentShader, noiseChunk } from "./particles.js";
import { POD, SPINE, WAVE, LEAD_IN, CROSSING, orca, podAt, bergProfile, laneClearance } from "./orca-pod.js";

const BANDS = 16;
const EXPOSURE = 0.75;
const BEHIND_DIM = 0.45; // how much of an orca's glow the berg hides
const WANDER = 0.007; // how far orca points drift (the berg's are ~2.5× this)
// Reduced motion holds the pod here: partway through pass 1, in front.
const STILL_AT = LEAD_IN + CROSSING * 0.3;

const K = SPINE;
const vertexShader = /* glsl */ `
  attribute float aLum;
  attribute float aAlong;
  attribute float aOrca;
  attribute float aPart; // index into PARTS: 0 body, 1 dorsal fin, 2 pectoral, 3 fluke
  attribute vec4 aRand;

  uniform vec3 uSpine[${4 * K}]; // each orca's spine, nose to tail
  uniform vec4 uMotion[4]; // tail-beat phase, stroke strength, roll, lean
  uniform float uLen[4];
  uniform vec3 uFrame; // the berg's cx, cy and raw-to-world scale
  uniform float uCamZ;
  uniform float uProfile[${BANDS}];
  uniform vec2 uProfileY;
  uniform float uVisible;
  uniform float uExposure;
  uniform float uSize;
  uniform float uPixelRatio;
  uniform float uTime;
  uniform float uAmbient;

  varying float vLum;
  varying float vSpark;
  varying float vFade;
  varying float vExposure;
${noiseChunk}
  float bergRadius(float y) {
    float f = (y - uProfileY.x) / (uProfileY.y - uProfileY.x) * ${BANDS - 1}.0;
    if (f < 0.0 || f > ${BANDS - 1}.0) return 0.0;
    int i = int(min(floor(f), ${BANDS - 2}.0));
    return mix(uProfile[i], uProfile[i + 1], f - float(i));
  }

  // Which way the spine runs at node k, toward the nose.
  vec3 spineDir(int o, int k) {
    return uSpine[o * ${K} + max(k - 1, 0)] - uSpine[o * ${K} + min(k + 1, ${K - 1})];
  }

  void main() {
    int o = int(aOrca + 0.5);
    float L = uLen[o];
    vec4 m = uMotion[o];
    float u = clamp(aAlong, 0.0, 1.0);

    // Where this slice of the body sits on the spine, and which way the
    // spine runs there. The body bends with the path: the head turns first
    // and the tail follows the line it swam.
    float f = u * ${K - 1}.0;
    int k = int(min(floor(f), ${K - 2}.0));
    float t = f - float(k);
    vec3 P = mix(uSpine[o * ${K} + k], uSpine[o * ${K} + k + 1], t);
    vec3 T = normalize(mix(spineDir(o, k), spineDir(o, k + 1), t));
    vec3 U = normalize(vec3(0.0, 1.0, 0.0) - T * T.y);
    vec3 R = cross(T, U); // the orca's right
    // Bank and lean: positive roll tips the back toward the right.
    float cr = cos(m.z), sr = sin(m.z);
    vec3 up = U * cr + R * sr;
    vec3 right = R * cr - U * sr;

    vec3 l = position;
    l.x -= (0.5 - u) * L; // what's left is the point's jitter along the body
    // The stroke: an up-and-down wave that runs back along the body, faster
    // than the orca swims (see WAVE in orca-pod.js). The head rocks only a
    // little, the motion is smallest just behind it and builds toward the
    // flukes. The flukes trail the tail stalk by a quarter beat, tips up on
    // the downstroke and down on the upstroke, pushing water back.
    float wave = m.x - ${WAVE.toFixed(2)} * u;
    float reach = 0.01 - 0.06 * u + 0.135 * u * u;
    l.y += m.y * L * reach * sin(wave);
    l.y -= m.y * L * 0.9 * max(0.0, u - 0.86) * cos(m.x - ${WAVE.toFixed(2)} * 0.86);
    // Pectoral fins paddle gently with the stroke and dip into turns.
    if (aPart > 1.5 && aPart < 2.5) {
      float side = sign(l.z);
      float ext = max(0.0, abs(l.z) - 0.08 * L);
      l.y += ext * (0.3 * m.y * sin(m.x * 0.5 + side) - 1.5 * m.w * side);
    }
    vec3 p = P + T * l.x + up * l.y + right * l.z;

    // Above the waterline, the fin catches the light like the berg's tip.
    float lum = p.y > 0.0 ? max(aLum, 0.88) : aLum;

    // Behind the berg: trace back toward the camera to the berg's centre
    // plane, and dim whatever falls inside its outline there.
    float zc = uCamZ / uFrame.z;
    float persp = zc / (zc - p.z);
    float qx = (p.x - uFrame.x) * persp;
    float qy = uFrame.y + (p.y - uFrame.y) * persp;
    float r = bergRadius(qy);
    float inside = r > 0.0 ? 1.0 - smoothstep(r - 0.06, r + 0.04, abs(qx)) : 0.0;
    float behind = smoothstep(-0.1, -0.4, p.z);
    float dim = 1.0 - ${BEHIND_DIM} * inside * behind;

    vec3 world = vec3((p.x - uFrame.x) * uFrame.z, (p.y - uFrame.y) * uFrame.z, p.z * uFrame.z);
    // The same churn the berg's particles drift through, gentler, so the
    // orcas look made of the same stuff rather than stamped on top.
    float stray = aRand.x > 0.9 ? 2.0 : 1.0;
    world += uAmbient * ${WANDER} * (0.5 + aRand.y) * stray
      * drift(world * 1.2 + vec3(0.0, 0.0, uTime * 0.15) + aRand.xyz * 0.35);

    vec4 mv = modelViewMatrix * vec4(world, 1.0);
    gl_Position = projectionMatrix * mv;
    vLum = lum;
    vSpark = step(0.985, aRand.y) * (0.5 + 0.5 * sin(uTime * 3.0 * uAmbient + aRand.x * 40.0));
    vFade = 1.0;
    vExposure = uExposure * uVisible * dim;
    gl_PointSize = uSize * uPixelRatio * (0.55 + vLum * 0.8 + vSpark * 1.6) * (6.0 / -mv.z);
  }
`;

export function createOrcaLayer(field, { shapeIndex, shape, count, reducedMotion = false }) {
  const profile = bergProfile(shape, BANDS);
  const clear = laneClearance(profile);

  // Points per orca, split by size.
  const sizes = POD.map((o) => o.L ** 2);
  const total = sizes.reduce((a, b) => a + b, 0);
  const counts = sizes.map((s) => Math.round((count * s) / total));
  counts[0] += count - counts.reduce((a, b) => a + b, 0);

  const position = new Float32Array(count * 3);
  const lum = new Float32Array(count);
  const along = new Float32Array(count);
  const part = new Float32Array(count);
  const which = new Float32Array(count);
  let n = 0;
  POD.forEach((spec, i) => {
    const m = orca(spec, counts[i], i + 1);
    position.set(m.positions, n * 3);
    lum.set(m.lum, n);
    along.set(m.along, n);
    part.set(m.part, n);
    which.fill(i, n, n + counts[i]);
    n += counts[i];
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(position, 3));
  geometry.setAttribute("aLum", new THREE.BufferAttribute(lum, 1));
  geometry.setAttribute("aAlong", new THREE.BufferAttribute(along, 1));
  geometry.setAttribute("aOrca", new THREE.BufferAttribute(which, 1));
  geometry.setAttribute("aPart", new THREE.BufferAttribute(part, 1));
  geometry.setAttribute("aRand", new THREE.BufferAttribute(new Float32Array(count * 4).map(Math.random), 4));

  const shared = field.uniforms;
  const uniforms = {
    // Each spine starts as a short straight line out of sight.
    uSpine: { value: Array.from({ length: 4 * K }, (_, j) => new THREE.Vector3(-(j % K) * 0.05, 0, -99)) },
    uMotion: { value: POD.map(() => new THREE.Vector4(0, 0, 0, 0)) },
    uLen: { value: POD.map((o) => o.L) },
    uFrame: { value: new THREE.Vector3(shape.frame.cx, shape.frame.cy, 1) },
    uCamZ: { value: field.camera.position.z },
    uProfile: { value: Array.from(profile.radii) },
    uProfileY: { value: new THREE.Vector2(profile.y0, profile.y1) },
    uVisible: { value: 0 },
    uExposure: { value: EXPOSURE },
    // Shared with the field, so size and colour always match the berg.
    uSize: shared.uSize,
    uPixelRatio: shared.uPixelRatio,
    uColorLo: shared.uColorLo,
    uColorHi: shared.uColorHi,
    uOpacity: shared.uOpacity,
    uTime: shared.uTime,
    uAmbient: shared.uAmbient,
  };
  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms,
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

  // The screen's reach either side of the berg's axis at raw depth z.
  function view() {
    const { cx, cy, s } = shape.frame;
    const k = s * field.shapeScale(shapeIndex);
    const cam = field.camera;
    const tan = Math.tan((cam.fov * Math.PI) / 360);
    return { cx, cy, k, clear, halfWidth: (z) => ((cam.position.z - z * k) * tan * cam.aspect) / k };
  }

  let clock = 0;
  let frozen = false;
  let speed = 1;
  let last = performance.now();
  let pose = { pass: 0, active: false, orcas: [] };

  function update(presence) {
    const now = performance.now();
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    if (presence <= 0) clock = 0;
    else if (presence >= 0.999 && !frozen) clock += dt * speed;

    const v = view();
    pose = reducedMotion ? podAt(STILL_AT, v, { still: true }) : podAt(clock, v);
    uniforms.uFrame.value.set(v.cx, v.cy, v.k);
    uniforms.uCamZ.value = field.camera.position.z;
    uniforms.uVisible.value = pose.active ? presence : 0;
    pose.orcas.forEach((o, i) => {
      o.spine.forEach(([x, y, z], k) => uniforms.uSpine.value[i * K + k].set(x, y, z));
      uniforms.uMotion.value[i].set(o.phase, o.stroke, o.roll, o.lean);
    });
  }

  return {
    update,
    setClock(seconds, freeze = frozen) {
      clock = seconds;
      frozen = freeze;
    },
    setSpeed(x) {
      speed = x;
    },
    info: () => ({ clock, pass: pose.pass, active: pose.active, frozen, speed }),
    uniforms,
    dispose() {
      field.scene.remove(points);
      geometry.dispose();
      material.dispose();
    },
  };
}
