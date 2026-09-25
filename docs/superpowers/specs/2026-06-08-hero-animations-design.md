# Hero Banner Animations — Design Spec

**Date:** 2026-06-08

## Summary

Add page-load animations to the hero banner text in `index.html`. Scope is limited to the hero only — no scroll-triggered animations on other sections.

## Animation Sequence

All three elements animate on page load in sequence:

| Element | Animation | Delay | Duration |
|---|---|---|---|
| `h1` "Cristian Cruz" | Fade up (translateY 16px → 0, opacity 0 → 1) | 0.1s | 0.5s |
| `p` tagline | Typewriter (width 0 → 100%, steps(66)) | 0.5s | 1.8s |
| Resume `button` | Fade up | 2.4s | 0.5s |

The tagline also gets a blinking cursor (`border-right: 2px solid #9ca3af`) that blinks while typing and stops after the animation ends.

## Mobile Handling

The typewriter requires `white-space: nowrap`, which would overflow on small screens. On mobile (`max-width: 767px`), the tagline falls back to a simple fade-up (same as the name) instead of the typewriter effect.

## Implementation

- **File:** `index.html` — add keyframes and animation classes to the existing `<style>` block
- **Approach:** Pure CSS `@keyframes`, no JS or libraries
- **Keyframes needed:**
  - `fadeUp` — shared by name and button
  - `typing` — width 0 to 100% with steps(66)
  - `blink` — border-right color toggles for cursor effect
- **Element changes:** Add `animation` properties directly to the existing inline styles on `h1`, `p.tagline`, and the Resume `button` in the hero

## Constraints

- No JS required
- No new dependencies
- Must not affect elements outside the hero banner section
- Cursor blink stops after typing completes (finite iteration count)
