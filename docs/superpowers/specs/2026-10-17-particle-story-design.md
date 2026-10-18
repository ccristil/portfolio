# Particle Story — Design

**Date:** 2026-10-17
**Branch:** `particles-prototype`
**Status:** Approved design, pending implementation plan

## Goal

Turn the portfolio into a whole-page scroll story, inspired by tigris.lorolabs.ai. One cloud of glowing purple particles sits behind the page. At four "interludes" between sections, the cloud forms a shape and a caption appears. Together the captions spell out Cristian's new positioning as a Product Engineer.

## Positioning

> I find out what people actually need, decide what's worth building, and then I build it. Properly.

This replaces "Data informs decisions. People make them. I love working with both." The career thread behind it: as a web developer (×2), technical consultant and now Product Engineer, Cristian has always helped decide *what* gets built and then built it. Data skills stay visible as what informs the decision (interlude 2). They are no longer the headline.

## The story

| Moment | Placement | Particle shape | Caption |
|---|---|---|---|
| Hero | Top of page | Slowly rotating globe of points | HTML name + tagline **Product Engineer** |
| Interlude 1 | Between Hero and Portfolio | Two pictogram people facing each other, with a speech bubble | *I find out what people actually need,* |
| Interlude 2 | Between Portfolio and Skills | Wide random scatter that narrows to one bright point | *decide what's worth building,* |
| Interlude 3 | Between Skills and Experience | Rectangular blocks that assemble into an app/browser window wireframe | *and then I build it.* |
| Interlude 4 | Between Education and Get to Know Me | Saturn V silhouette, lifting upward | ***Properly.*** |
| Closing | Footer | Text "CRISTIAN CRUZ" | none |
| Between moments | Over every content section | **Dust**: sparse points spread across the viewport at low opacity | none |

Each interlude is a full-viewport (`100vh`) section with only the caption. The caption follows the existing design language (Inter, white/gray, `section-heading` scale). The shape is the visual.

## Hero

- The existing load intro (cursor blinks, white bar wipes to reveal name and tagline, page fades in) is kept unchanged.
- The hero grows from `600px` to full viewport height (`h-screen`, min `600px`), so the globe is centered behind the name.
- The mountain background image and its overlays are removed when WebGL is available.
- The hero tagline becomes the static text **Product Engineer**. The rotating "I build things that are ___" typewriter is removed, because the interludes now carry the sentence.
- After the intro finishes, particles converge (the "birth" animation) into the globe behind the hero text. The birth starts when the intro's final class is applied (`intro-done`). If the intro is skipped (reduced motion or already shown), birth is instant.

## Visual style

- Particle color ramps from deep violet `#4c1d95` (low luminance) to lavender `#d8b4fe` (high), with ~1.5% of particles twinkling toward white.
- The page background stays the site's current dark (`bg-gray-950`), and the canvas is transparent over it.
- Dust and interlude shapes differ by per-shape opacity: dust ≈ 0.25, interludes and hero 1.0.

## Engine changes (`dev/particles/particles.js`, promoted with the page)

1. **Scroll anchors.** Replace "progress = scrollY / innerHeight" with a list of stops: `{ el, shape }`. Each stop's scroll position is the point where the element's center meets the viewport center. Progress is linear between stops. Two consecutive stops with the same shape hold that shape, which is how dust spans a long section (one stop at section top, one at bottom). Positions are recomputed on resize and when fonts or images change layout (`ResizeObserver` on `document.body`).
2. **Per-shape opacity.** `shape.opacity` (default 1) is mixed with the existing per-shape exposure in the shader.
3. **New shape makers**, all procedural (`fromFunction` or canvas-drawn and then `sampleCanvas`). No new image assets:
   - `globe`: points on a sphere surface, lit from the upper left, rotated slowly via the existing sway plus a Y-spin uniform while it's the active shape.
   - `people`: two pictogram figures (circle head and rounded-rect body) plus a speech bubble, drawn on a canvas.
   - `decision`: about 85% of points in a wide Gaussian scatter at low luminance and about 15% in a tight, bright cluster at one point. The morph from interlude 1 reads as "many options → one".
   - `appWindow`: a browser frame (title bar with three dots, sidebar, content blocks), drawn on a canvas.
   - `saturnV`: a rocket silhouette (stacked stages, escape tower, fins), drawn on a canvas and taller than it is wide.
   - `dust`: a uniform scatter across a box sized to the viewport aspect, low luminance, `opacity: 0.25`.
   - `name`: the existing `fromText("CRISTIAN CRUZ")`.
4. **Colors** are passed to `createParticleField` (the purple values above).

## Page structure (`dev/index_v5.html`, a staging copy of `index.html`)

- A fixed full-screen `<canvas>` sits behind everything. Content sections get `position: relative; z-index: 1`. Cards keep their existing backgrounds, so dust never competes with text.
- Four new interlude `<section>`s are inserted at the placements above. Each caption is real text, so the sentence is readable without WebGL and by screen readers. The closing stop is an empty `aria-hidden` block that is shown only when particles run.
- Asset paths use `../assets/...` like the existing `dev/index_v*.html` files.

## Fallbacks and performance

- **No WebGL** (renderer creation throws): keep the mountain hero image, hide the canvas. Interludes still show their captions on the dark background.
- **`prefers-reduced-motion`:** no birth, no ambient sway, `uScatter = 0`. Shapes cross-fade on scroll with no bloom and no globe spin.
- **Particle count:** 40k on desktop, 18k at `max-width: 640px`. Pixel ratio capped at 1.5.
- The render loop runs on `requestAnimationFrame`, which pauses automatically in hidden tabs.

## Rollout (per CLAUDE.md)

1. Build in `dev/index_v5.html`. Production `index.html` is untouched.
2. Cristian reviews it in the browser.
3. On approval, show a diff for `index.html` and apply it. The particle modules are copied to `assets/particles/`, and `dev/particles/` stays as the template.
4. Show a diff, then update `llms.txt`: replace the blockquote tagline with the new positioning line and re-frame it toward Product Engineering.
5. Show a diff, then update the CLAUDE.md "Positioning & Voice" section to the new line, so future sessions keep it.
6. No commits by Claude.

## Testing

- Headless Chrome screenshots with `?stage=N&birth=0` for every stop, at 1280×800 and 500×900. With anchors, `stage` maps to a stop index.
- Manual browser check by Cristian for the birth animation, mouse push, scroll smoothness and frame rate on real hardware.
- Check that the reduced-motion and no-WebGL paths render readable captions.

## Out of scope

- Content changes to project cards, Experience entries or Skills.
- Blog (stays hidden per CLAUDE.md).
- Sound, a custom cursor, or other Tigris extras.
