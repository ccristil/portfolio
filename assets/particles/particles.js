// Particle morph engine, inspired by tigris.lorolabs.ai.
//
// One point cloud. Every shape is a list of `count` target positions, so
// particle i in shape A flies to particle i in shape B. Only two shapes are on
// the GPU at a time (aPosA / aPosB); setState() swaps them in when the pair
// changes, so a story can use any number of shapes, in any order, repeating.
//
// Shapes come from shapes.js. Optional per-shape settings:
//   fit      number (default 1) to shrink it, or "cover" to fill the viewport
//   opacity  0–1 (default 1)
//   spin     radians per second around the vertical axis (default 0)
//   loose    how far its particles wander at rest (default 1; 0 = still)
//   flyTo    shape-space z the camera flies to; makes it a fly-through shape
//            that setState's `travel` (0–1) slides toward the camera
//
// Throws if WebGL is unavailable. Callers should catch and fall back.

import * as THREE from "three";

// The flow-field noise every particle drifts through. Exported so extra
// point layers (orcas.js) drift through the same field.
export const noiseChunk = /* glsl */ `
  // 3D simplex noise: Ian McEwan & Stefan Gustavson (Ashima Arts), MIT.
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
  float snoise(vec3 v) {
    const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute(permute(permute(
      i.z + vec4(0.0, i1.z, i2.z, 1.0)) +
      i.y + vec4(0.0, i1.y, i2.y, 1.0)) +
      i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
  }

  // A slowly churning flow field. Nearby particles get similar pushes, so the
  // cloud swirls like smoke instead of each dot jittering on its own.
  vec3 drift(vec3 p) {
    return vec3(
      snoise(p),
      snoise(p + vec3(31.4, -17.2, 8.9)),
      snoise(p + vec3(-12.7, 44.1, -23.5))
    );
  }
`;

const vertexShader = /* glsl */ `
  attribute vec3 aPosA;
  attribute vec3 aPosB;
  attribute float aLumA;
  attribute float aLumB;
  attribute vec4 aRand;

  uniform float uMorph;
  uniform float uScaleA;
  uniform float uScaleB;
  uniform float uExposureA;
  uniform float uExposureB;
  uniform float uOpacityA;
  uniform float uOpacityB;
  uniform float uSpinA;
  uniform float uSpinB;
  uniform float uLoose;
  uniform float uLooseA;
  uniform float uLooseB;
  uniform float uFlyA;
  uniform float uFlyB;
  uniform float uCalmA;
  uniform float uCalmB;
  uniform float uCrossfade;
  uniform float uScatter;
  uniform float uBirth;
  uniform float uTime;
  uniform float uAmbient;
  uniform vec3 uMouse;
  uniform float uMouseStrength;
  uniform float uMouseRadius;
  uniform float uSize;
  uniform float uPixelRatio;

  varying float vLum;
  varying float vSpark;
  varying float vFade;
  varying float vExposure;
${noiseChunk}
  vec3 spinY(vec3 p, float a) {
    float c = cos(a), s = sin(a);
    return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);
  }

  void main() {
    // Each particle leaves on its own schedule, so shapes dissolve and
    // re-form instead of sliding as one rigid block.
    float t = clamp((uMorph - aRand.w * 0.35) / 0.65, 0.0, 1.0);
    t = t * t * (3.0 - 2.0 * t);
    // Reduced motion: no flight. Positions swap at the midpoint, hidden by a fade.
    float tp = mix(t, step(0.5, uMorph), uCrossfade);
    float flight = sin(3.14159 * t) * (1.0 - uCrossfade);

    vec3 a = spinY(aPosA, uTime * uSpinA * uAmbient) * uScaleA;
    vec3 b = spinY(aPosB, uTime * uSpinB * uAmbient) * uScaleB;
    // Fly-through shapes slide toward the camera as you scroll through them.
    a.z += uFlyA;
    b.z += uFlyB;
    vec3 p = mix(a, b, tp);
    // Fly-through shapes are long along z, so they skip the sway and the
    // cursor push; the sway would swing their far end across the screen.
    float calm = mix(uCalmA, uCalmB, tp);

    // Mid-flight, particles bloom outward and fall back in.
    vec3 dir = normalize(aRand.xyz - 0.5 + 0.0001);
    p += dir * flight * uScatter * (0.4 + aRand.y);

    // Ambient churn: particles wander through the flow field. About one in ten
    // strays further, which keeps the edges fuzzy and alive.
    float stray = aRand.x > 0.9 ? 2.5 : 1.0;
    float wander = 0.035 * uLoose * mix(uLooseA, uLooseB, tp) * (0.5 + aRand.y) * stray;
    p += uAmbient * wander * drift(p * 1.2 + vec3(0.0, 0.0, uTime * 0.15) + aRand.xyz * 0.35);
    // A slow sway that shows off the depth.
    float ang = sin(uTime * 0.25) * 0.22 * uAmbient * (1.0 - calm);
    float c = cos(ang), s = sin(ang);
    p.xz = mat2(c, s, -s, c) * p.xz;

    // Birth: particles converge from a wide shell on page load.
    float born = clamp((uBirth - aRand.z * 0.45) / 0.55, 0.0, 1.0);
    born = 1.0 - pow(1.0 - born, 3.0);
    p = mix(dir * (5.0 + aRand.x * 6.0), p, born);

    // Cursor pushes particles aside.
    vec2 d = p.xy - uMouse.xy;
    float push = uMouseStrength * (1.0 - calm) * (1.0 - smoothstep(0.0, uMouseRadius, length(d)));
    p.xy += normalize(d + 0.0001) * push * 0.35;
    p.z += push * 0.3;

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    // Points fade out as they near the camera and are dropped (sent past the
    // far plane) once faded; otherwise the size falloff below would blow them
    // up into huge blobs.
    float nearFade = smoothstep(0.6, 1.8, -mv.z);

    vLum = mix(aLumA, aLumB, tp);
    vSpark = step(0.985, aRand.y) * (0.5 + 0.5 * sin(uTime * 3.0 * uAmbient + aRand.x * 40.0));
    vFade = born;
    float dip = mix(1.0, abs(1.0 - 2.0 * uMorph), uCrossfade);
    // Exposure lifts toward 1 mid-flight, when the cloud is spread out.
    vExposure = mix(mix(uExposureA, uExposureB, tp), 1.0, flight * 0.6)
      * mix(uOpacityA, uOpacityB, tp) * dip * nearFade;
    gl_PointSize = uSize * uPixelRatio * (0.55 + vLum * 0.8 + vSpark * 1.6) * (6.0 / -mv.z);
    if (nearFade <= 0.0) {
      gl_PointSize = 0.0;
      gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
    }
  }
`;

// Exported so extra point layers (orcas.js) glow the same way.
export const fragmentShader = /* glsl */ `
  uniform vec3 uColorLo;
  uniform vec3 uColorHi;
  uniform float uOpacity;

  varying float vLum;
  varying float vSpark;
  varying float vFade;
  varying float vExposure;

  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    float glow = pow(1.0 - d * 2.0, 1.6);
    vec3 col = mix(uColorLo, uColorHi, vLum);
    col = mix(col, vec3(1.0), vSpark * 0.6);
    vec3 rgb = col * glow * (0.3 + vLum * 0.7) * uOpacity * vFade * vExposure;
    gl_FragColor = vec4(rgb, max(rgb.r, max(rgb.g, rgb.b)));
  }
`;

const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function createParticleField({
  canvas,
  count,
  shapes,
  colors = { lo: "#6b3a14", hi: "#ffdc96" },
  fit = { w: 0.8, h: 0.72 }, // share of the viewport a shape may fill
  reducedMotion = false,
  looseness = 1, // global multiplier on every shape's `loose`
}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true });
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
  renderer.setPixelRatio(pixelRatio);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.z = 6;

  const geometry = new THREE.BufferGeometry();
  const posA = new THREE.BufferAttribute(new Float32Array(count * 3), 3);
  const posB = new THREE.BufferAttribute(new Float32Array(count * 3), 3);
  const lumA = new THREE.BufferAttribute(new Float32Array(count), 1);
  const lumB = new THREE.BufferAttribute(new Float32Array(count), 1);
  const rand = new Float32Array(count * 4).map(Math.random);
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  geometry.setAttribute("aPosA", posA);
  geometry.setAttribute("aPosB", posB);
  geometry.setAttribute("aLumA", lumA);
  geometry.setAttribute("aLumB", lumB);
  geometry.setAttribute("aRand", new THREE.BufferAttribute(rand, 4));

  const uniforms = {
    uMorph: { value: 0 },
    uScaleA: { value: 1 },
    uScaleB: { value: 1 },
    uExposureA: { value: 1 },
    uExposureB: { value: 1 },
    uOpacityA: { value: 1 },
    uOpacityB: { value: 1 },
    uSpinA: { value: 0 },
    uSpinB: { value: 0 },
    uLoose: { value: looseness },
    uLooseA: { value: 1 },
    uLooseB: { value: 1 },
    uFlyA: { value: 0 },
    uFlyB: { value: 0 },
    uCalmA: { value: 0 },
    uCalmB: { value: 0 },
    uCrossfade: { value: reducedMotion ? 1 : 0 },
    uScatter: { value: reducedMotion ? 0 : 0.55 },
    uBirth: { value: reducedMotion ? 1 : 0 },
    uTime: { value: 0 },
    uAmbient: { value: reducedMotion ? 0 : 1 },
    uMouse: { value: new THREE.Vector3(999, 999, 0) },
    uMouseStrength: { value: 0 },
    uMouseRadius: { value: 0.7 },
    uSize: { value: 2.4 },
    uPixelRatio: { value: pixelRatio },
    uColorLo: { value: new THREE.Color(colors.lo) },
    uColorHi: { value: new THREE.Color(colors.hi) },
    uOpacity: { value: 1 },
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
  scene.add(points);

  // --- sizing -----------------------------------------------------------------
  let shapeScales = [];
  let shapeExposures = [];

  function computeScales() {
    const visH = 2 * camera.position.z * Math.tan((camera.fov * Math.PI) / 360);
    const visW = visH * camera.aspect;
    const pxPerUnit = innerHeight / visH;
    shapeScales = shapes.map(({ aspect, fit: k = 1 }) =>
      k === "cover"
        ? 1.1 * Math.max(visW / aspect.w, visH / aspect.h)
        : k * Math.min((visW * fit.w) / aspect.w, (visH * fit.h) / aspect.h)
    );
    // Small shapes pack the same dots into fewer pixels and blow out to white,
    // so dim them in proportion to how crowded they are on screen.
    shapeExposures = shapes.map(({ aspect, fill = 0.6 }, i) => {
      const areaPx = aspect.w * aspect.h * fill * (shapeScales[i] * pxPerUnit) ** 2;
      return Math.min(1, Math.max(0.15, 0.25 / (count / areaPx)));
    });
  }

  // --- which two shapes are on the GPU ------------------------------------------
  let loaded = null;

  function load(from, to) {
    posA.array.set(shapes[from].positions);
    posB.array.set(shapes[to].positions);
    lumA.array.set(shapes[from].lum);
    lumB.array.set(shapes[to].lum);
    posA.needsUpdate = posB.needsUpdate = lumA.needsUpdate = lumB.needsUpdate = true;
    loaded = `${from}>${to}`;
  }

  // A fly-through shape's flight ends with its `flyTo` depth this far in
  // front of the camera.
  const FLY_STOP = 3;
  function flyOffset(i, travel) {
    const { flyTo } = shapes[i];
    if (flyTo == null) return 0;
    return (camera.position.z - FLY_STOP - flyTo * shapeScales[i]) * travel;
  }

  // Show the morph from shape `from` to shape `to`, t in 0…1.
  // Each shape is held still for the first and last 8% of t.
  // travel (0…1) is how far through any fly-through shape the camera has flown.
  function setState(from, to, t, travel = 0) {
    if (loaded !== `${from}>${to}`) load(from, to);
    uniforms.uMorph.value = from === to ? 0 : smoothstep(0.08, 0.92, t);
    uniforms.uScaleA.value = shapeScales[from];
    uniforms.uScaleB.value = shapeScales[to];
    uniforms.uExposureA.value = shapeExposures[from];
    uniforms.uExposureB.value = shapeExposures[to];
    uniforms.uOpacityA.value = shapes[from].opacity ?? 1;
    uniforms.uOpacityB.value = shapes[to].opacity ?? 1;
    uniforms.uSpinA.value = shapes[from].spin ?? 0;
    uniforms.uSpinB.value = shapes[to].spin ?? 0;
    uniforms.uLooseA.value = shapes[from].loose ?? 1;
    uniforms.uLooseB.value = shapes[to].loose ?? 1;
    uniforms.uFlyA.value = flyOffset(from, travel);
    uniforms.uFlyB.value = flyOffset(to, travel);
    uniforms.uCalmA.value = shapes[from].flyTo == null ? 0 : 1;
    uniforms.uCalmB.value = shapes[to].flyTo == null ? 0 : 1;
  }

  // How big shape i is on screen at rest, in CSS px. It sits centered on the
  // viewport, so this is enough to lay a link over it.
  function screenBox(i) {
    const visH = 2 * camera.position.z * Math.tan((camera.fov * Math.PI) / 360);
    const pxPerUnit = (shapeScales[i] * innerHeight) / visH;
    return { w: shapes[i].aspect.w * pxPerUnit, h: shapes[i].aspect.h * pxPerUnit };
  }

  // Convenience for linear stories: f runs 0 … shapes.length - 1.
  function setProgress(f) {
    if (!Number.isFinite(f)) f = 0;
    const max = shapes.length - 1;
    f = Math.min(max, Math.max(0, f));
    const i = Math.min(Math.max(0, max - 1), Math.floor(f));
    setState(i, Math.min(i + 1, max), f - i);
  }

  // --- input ----------------------------------------------------------------------
  const mouseTarget = new THREE.Vector3(999, 999, 0);
  const raycaster = new THREE.Raycaster();
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const ndc = new THREE.Vector2();
  let lastMove = -Infinity;

  function onPointerMove(e) {
    if (e.pointerType === "touch") return;
    ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    raycaster.ray.intersectPlane(plane, mouseTarget);
    if (uniforms.uMouse.value.x === 999) uniforms.uMouse.value.copy(mouseTarget);
    lastMove = performance.now();
  }
  window.addEventListener("pointermove", onPointerMove);

  function resize() {
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    computeScales();
  }
  window.addEventListener("resize", resize);
  resize();
  setState(0, 0, 0);

  // --- loop -----------------------------------------------------------------------
  const clock = new THREE.Clock();
  let raf;
  let disposed = false;
  function frame() {
    const dt = Math.min(clock.getDelta(), 0.05);
    uniforms.uTime.value += dt;
    uniforms.uMouse.value.lerp(mouseTarget, 1 - Math.exp(-dt * 10));
    const active = !reducedMotion && performance.now() - lastMove < 1200 ? 1 : 0;
    uniforms.uMouseStrength.value += (active - uniforms.uMouseStrength.value) * (1 - Math.exp(-dt * 4));
    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  }
  frame();

  return {
    setState,
    setProgress,
    screenBox,
    uniforms,
    // For extra layers drawn in the same scene (orcas.js).
    scene,
    camera,
    shapeScale: (i) => shapeScales[i],
    // Plays the load-in. Resolves when particles have landed.
    birth(duration = 2.6) {
      if (reducedMotion) return Promise.resolve();
      const ms = Math.max(1, duration * 1000);
      return new Promise((resolve) => {
        const start = performance.now();
        const tick = () => {
          if (disposed) {
            resolve();
            return;
          }
          const t = Math.min(1, (performance.now() - start) / ms);
          uniforms.uBirth.value = t;
          t < 1 ? requestAnimationFrame(tick) : resolve();
        };
        tick();
      });
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("resize", resize);
      geometry.dispose();
      material.dispose();
      renderer.dispose();
    },
  };
}
