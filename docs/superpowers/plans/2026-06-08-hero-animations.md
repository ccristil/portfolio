# Hero Banner Animations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add page-load animations to the hero banner — name fades up, tagline types out with a blinking cursor, Resume button fades up after.

**Architecture:** Pure CSS keyframes and classes added to the existing `<style>` block in `index.html`. Three helper classes (`hero-name`, `hero-tagline`, `hero-btn`) are added to the hero elements. A media query swaps the typewriter for a simple fade-up on mobile to avoid overflow issues with `white-space: nowrap`.

**Tech Stack:** Vanilla HTML, CSS animations (`@keyframes`), Tailwind CDN (existing)

---

### Task 1: Add animation keyframes to the style block

**Files:**
- Modify: `index.html:176` (just before the closing `</style>` tag)

- [ ] **Step 1: Add keyframes inside the `<style>` block**

Find the closing `</style>` tag (currently line 176) and insert the following immediately before it:

```css
        /* Hero banner animations */
        @keyframes heroFadeUp {
            from { opacity: 0; transform: translateY(16px); }
            to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes heroTyping {
            from { width: 0; }
            to   { width: 100%; }
        }
        @keyframes heroCursor {
            0%, 49%   { border-right-color: #9ca3af; }
            50%, 100% { border-right-color: transparent; }
        }

        /* Hero element animation classes */
        .hero-name {
            animation: heroFadeUp 0.5s ease both 0.1s;
        }
        .hero-tagline {
            overflow: hidden;
            white-space: nowrap;
            border-right: 2px solid transparent;
            animation: heroTyping 2s steps(67) 0.5s forwards,
                       heroCursor 0.6s step-end 0.5s 4;
        }
        .hero-btn {
            animation: heroFadeUp 0.5s ease both 2.6s;
        }

        /* Mobile: swap typewriter for simple fade-up */
        @media (max-width: 767px) {
            .hero-tagline {
                overflow: visible;
                white-space: normal;
                border-right: none;
                animation: heroFadeUp 0.5s ease both 0.35s;
            }
        }
```

- [ ] **Step 2: Verify the style block closes correctly**

The `</style>` tag should still be on its own line immediately after the new CSS. The file should have no duplicate `</style>` tags.

---

### Task 2: Add animation classes to hero HTML elements

**Files:**
- Modify: `index.html:246-254`

- [ ] **Step 1: Add `hero-name` to the h1**

Find line 246 and replace:

```html
            <h1 class="text-4xl md:text-6xl font-bold text-white tracking-tight">Cristian Cruz</h1>
```

with:

```html
            <h1 class="hero-name text-4xl md:text-6xl font-bold text-white tracking-tight">Cristian Cruz</h1>
```

- [ ] **Step 2: Add `hero-tagline` to the tagline `<p>`**

Find line 247 and replace:

```html
            <p class="text-sm md:text-base font-mono text-gray-300 mt-3"><b>Data</b> informs decisions. <b>People</b> make them. I love working with <b>both.</b></p>
```

with:

```html
            <p class="hero-tagline text-sm md:text-base font-mono text-gray-300 mt-3"><b>Data</b> informs decisions. <b>People</b> make them. I love working with <b>both.</b></p>
```

- [ ] **Step 3: Add `hero-btn` to the button wrapper div**

Find line 248 and replace:

```html
            <div class="mt-6">
```

with:

```html
            <div class="hero-btn mt-6">
```

---

### Task 3: Verify in browser

- [ ] **Step 1: Open `index.html` in a browser (hard refresh)**

Use Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows) to bypass cache.

Expected sequence:
1. "Cristian Cruz" fades up from slightly below — completes by ~0.6s
2. Tagline starts typing out character by character with a blinking grey cursor — completes by ~2.5s
3. Cursor disappears after typing finishes
4. Resume button fades up — appears around 2.6s

- [ ] **Step 2: Check mobile behavior**

Resize browser to 375px wide (or use DevTools device emulator).

Expected: tagline fades up normally (no typing, no overflow, no horizontal scrollbar).

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "add page-load animations to hero banner"
```
