# Design: Add Photo to "Get to Know Me" Section

**Date:** 2026-06-05

## Summary

Add a personal photo (`assets/me.png`) to the "Get to Know Me" section of `index.html`.

## Design Decision

**Layout:** Option C — a full-width banner card containing the photo and intro text side-by-side, placed above the existing 2-column grid (Apple Music embed + Strava widget).

**Shape:** Rounded square (`border-radius: 16px`), approximately 96×96px, with a subtle purple border matching the site's accent color (`rgba(167,139,250,0.35)`).

## Implementation

In `index.html`, inside `<section id="get-to-know-me">`:

1. Remove the existing standalone `<p>` description text.
2. Add a `glass-card` banner div above the grid containing:
   - `<img src="assets/me.png">` — 96×96px, `rounded-2xl`, purple border
   - The existing description text next to it
3. The 2-col grid below remains unchanged.

## Files Changed

- `index.html` — Get to Know Me section only (lines ~502–528)
