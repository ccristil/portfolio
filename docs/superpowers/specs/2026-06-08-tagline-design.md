# Tagline Addition — Design Spec

**Date:** 2026-06-08

## Summary

Replace the "data enthusiast" subtitle in the hero banner with a professional positioning tagline.

## Change

**File:** `index.html`, line 247

**Before:**
```html
<p class="text-base md:text-xl font-mono text-gray-300 mt-3">data enthusiast</p>
```

**After:**
```html
<p class="text-sm md:text-base font-mono text-gray-300 mt-3">Data informs decisions. People make them. I love working with both.</p>
```

## Rationale

- **Placement:** Hero banner, directly under the name — highest-attention moment on the page, read before any scrolling
- **Audience:** Hiring managers at data/tech companies
- **Goal:** Professional positioning — signals that Cristian bridges data and people/decisions, a differentiator on a data portfolio
- **Font size reduction:** One step smaller (`text-base md:text-xl` → `text-sm md:text-base`) to account for the longer line without overwhelming the name
- **Everything else unchanged:** Font family (mono), color (gray-300), margin (mt-3) — fits naturally into existing banner hierarchy
