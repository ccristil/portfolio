# Design: Cursor-to-Name Load Intro

**Date:** 2026-10-16

## Summary

A first-load intro inspired by roomandpillar.com. On a dark screen a cursor blinks 3× where the name sits in the hero. It stretches into a solid white bar that wipes away to reveal "Cristian Cruz", and a smaller bar does the same for the subtitle. The name and subtitle stay where they are while the rest of the page fades in around them. The goal is for visitors to know right away that this portfolio is different.

## Design Decisions

- **Reveal style:** Option A, "Wipe" (picked from live prototypes). The bar covers the text, then retracts toward the right edge (`transform-origin: right`, `scaleX(1 → 0)`) to uncover it.
- **Position:** The reveal happens exactly where the hero text normally sits, and nothing moves afterwards. (Revised 2026-10-16: an earlier version started at viewport center and glided up, but the user found the slide awkward.)
- **Frequency:** Once per browser-tab session (`sessionStorage`). Later loads in the same tab show the page immediately.
- **Skippable:** Any `pointerdown`, `keydown`, `wheel`, `touchstart` or `scroll` jumps straight to the finished page.
- **Approach:** Animate the real hero `<h1>` and tagline. No duplicate overlay copy, so the DOM, SEO and screen-reader content stay the same.

## Timeline (~4.5s)

| t (ms) | Step |
|---|---|
| 0 | Page dark: background image, nav, Resume button and `<main>` hidden. Hero text is in its normal position and invisible. |
| 300 | Cursor (2px wide, height of the name) blinks 3× (0.5s period). |
| 1900 | Cursor stretches horizontally into a white bar the width of the name (~550ms, ease-in-out). |
| 2550 | Name shown, bar retracts to the right (~500ms), uncovering it. |
| 2950 | Smaller subtitle bar grows left → right (~400ms). |
| 3350 | Subtitle shown, subtitle bar retracts to the right. |
| 3800 | Background image, nav, Resume button and `<main>` fade in. |
| ~4600 | Intro classes removed, typewriter starts cycling. |

On mobile the timing stays the same and the bar widths come from the rendered text.

## Implementation

All in `index.html`:

1. **`<head>` gate script** (inline, before first paint). If `sessionStorage` has no `introSeen` flag and `prefers-reduced-motion` is not `reduce`, add class `intro` to `<html>` and set the flag. Wrap storage access in try/catch; if storage fails, skip the intro. It also sets a 7s fallback timer that un-hides the page if the intro script never runs.
2. **CSS block** in the existing `<style>`. Every rule is scoped under `html.intro`:
   - Hide the hero `<img>`, its overlays, `<header>`, `.hero-btn` and `<main>` (opacity 0) and turn off the `heroFadeUp` animations.
   - Bar elements (white, absolutely positioned over the name and tagline) plus a blink keyframe and step classes (`intro-s1`…`intro-s5`, then `intro-out`) that drive the transitions.
   - After the intro, `html.intro-done` keeps the old `heroFadeUp` animations off so they don't replay.
3. **Intro script** (next to the typewriter code):
   - Exit early if `html.intro` is absent.
   - Measure the text widths, inject the bars, and add the step classes on timers.
   - A `finish()` function clears the timers, fades in the page, removes the `intro` classes and the bars, and starts the typewriter. It runs at the end of the timeline, on any skip event, and from a ~6s safety timeout.
   - The typewriter IIFE becomes a function the intro can start. Without the intro it starts immediately, as it does today.

## Rollout

1. Build first in `dev/index_v4.html` (a copy of the current `index.html` plus the intro) so it can be tested locally.
2. After the user approves, show the diff and apply the same changes to `index.html`.
3. No commits by Claude. The user handles git.

## Out of Scope

- Name turning into a nav logo.
- Animation libraries.
- Changes to `llms.txt` (no content changes).

## Testing

- Headless Chrome screenshots at ~1000 / 2300 / 2700 / 3500 / 5000 ms, at 1440×900 and 390×844 (mobile).
- With reduced motion emulated, the page shows normally with no intro.
- On the second load in the same session the page shows immediately.
- A click during the intro gives the finished page right away, and the typewriter still runs.
- No JS errors in the console, and no flash of page content before the intro starts.
