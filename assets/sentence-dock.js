// Sentence dock: as each interlude caption scrolls away, its words fly into a
// dock under the nav, so the positioning line builds up as you scroll. At the
// closing stop they gather back into one sentence above the particle name.
// Wider screens dock a right-aligned stack; phones dock one wrapped line.
// Layout lives in the .sentence-* rules in index.html.

(function () {
  const sections = [
    ...document.querySelectorAll("#interlude-need, #interlude-decide, #interlude-build, #interlude-properly"),
  ];
  const captions = sections.map((s) => s.querySelector(".interlude__caption"));
  const closing = document.getElementById("interlude-closing");
  if (sections.length !== 4 || captions.some((c) => !c)) return;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const el = (tag, cls) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    return e;
  };
  // Fill `parent` with one span per word; returns the spans.
  const words = (parent, text) => {
    text.split(/\s+/).forEach((w, j) => {
      if (j) parent.append(" ");
      const s = el("span");
      s.textContent = w;
      parent.append(s);
    });
    return [...parent.children];
  };

  // Hidden copies of the sentence in its docked and closing layouts tell
  // each flying word where to land.
  const layer = el("div", "sentence-layer");
  layer.setAttribute("aria-hidden", "true");
  const dock = el("div", "sentence-dock");
  const finale = el("div", "sentence-finale");
  layer.append(dock, finale);
  document.body.append(layer);

  const flights = captions.map((cap) => {
    const text = cap.textContent.trim();
    cap.textContent = "";
    const capWords = words(cap, text);
    const dockLine = el("span");
    dock.append(dockLine, " ");
    const finLine = el("span");
    finale.append(finLine);
    const dockWords = words(dockLine, text);
    const finWords = words(finLine, text);
    const fly = capWords.map((w) => {
      const f = el("div", "sentence-word");
      f.textContent = w.textContent;
      layer.append(f);
      return f;
    });
    return { cap, capWords, dockWords, finWords, fly, paths: [] };
  });
  const lastLine = flights.length - 1;

  // Start, docked and closing spot for every word. None of them depend on
  // scroll position, so they're only recomputed on resize and font load.
  let dirty = true;
  function measure() {
    const H = innerHeight;
    flights.forEach((f) => {
      const cs = getComputedStyle(f.cap);
      const size = parseFloat(cs.fontSize);
      const capR = f.cap.getBoundingClientRect();
      // While pinned, the caption sits 14vh above the bottom (.interlude__caption).
      const pinTop = H * 0.86 - capR.height;
      const dockScale = parseFloat(getComputedStyle(f.dockWords[0]).fontSize) / size;
      const finScale = parseFloat(getComputedStyle(f.finWords[0]).fontSize) / size;
      f.paths = f.capWords.map((w, j) => {
        const p = f.fly[j];
        p.style.fontSize = cs.fontSize;
        p.style.fontStyle = cs.fontStyle;
        const h = p.offsetHeight;
        const at = (r, s) => [r.left, r.top + (r.height - h * s) / 2, s];
        const r = w.getBoundingClientRect();
        return {
          from: [r.left, r.top - capR.top + pinTop + (r.height - h) / 2, 1],
          dock: at(f.dockWords[j].getBoundingClientRect(), dockScale),
          fin: at(f.finWords[j].getBoundingClientRect(), finScale),
        };
      });
    });
    dirty = true;
  }

  let lastY = null;
  function frame() {
    requestAnimationFrame(frame);
    if (!dirty && scrollY === lastY) return;
    dirty = false;
    lastY = scrollY;
    const H = innerHeight;

    // finale: 0 → 1 as the closing stop arrives; out: 0 → 1 as it leaves.
    // Without particles the closing stop is hidden and the sentence stays docked.
    let fin = 0;
    let out = 0;
    const r = closing && closing.getBoundingClientRect();
    if (r && r.height > 0) {
      fin = clamp((H * 0.9 - r.top) / (H * 0.9));
      out = clamp((H * 0.7 - r.bottom) / (H * 0.4));
    }

    let docked = false;
    flights.forEach((f, i) => {
      // 0 while the caption is pinned, 1 once it's 35vh past unpinning.
      const passed = clamp((H - sections[i].getBoundingClientRect().bottom) / (H * 0.35));
      const q = ease(clamp(passed / 0.85));
      const k = ease(clamp(fin / 0.7 - i * 0.08));
      // The words take over the moment the caption unpins; they start exactly
      // where the caption's words are, so the swap is invisible.
      const live = passed > 0;
      docked ||= live;
      f.cap.style.opacity = live ? 0 : "";
      const color = i === lastLine && k > 0 ? `rgb(${lerp(255, 216, k)},${lerp(255, 180, k)},${lerp(255, 254, k)})` : "";
      f.paths.forEach((p, j) => {
        const pt = (n) => lerp(lerp(p.from[n], p.dock[n], q), p.fin[n], k);
        const w = f.fly[j];
        w.style.transform = `translate(${pt(0)}px, ${pt(1)}px) scale(${pt(2)})`;
        w.style.opacity = live ? 1 - out : 0;
        w.style.color = color;
      });
    });
    // Phones put a scrim behind the docked line (CSS); drop it for the finale.
    layer.classList.toggle("is-docked", docked && fin < 0.3);
  }

  measure();
  document.fonts.ready.then(measure);
  addEventListener("resize", measure);
  requestAnimationFrame(frame);
})();
