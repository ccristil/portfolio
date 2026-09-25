# Add Photo to Get to Know Me Section — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `assets/me.png` to the "Get to Know Me" section as a rounded-square photo inside a banner card above the existing Music/Strava grid.

**Architecture:** Single HTML edit — replace the standalone `<p>` description in `index.html` with a `glass-card` banner div that holds the photo (left) and the description text (right). The 2-col grid below is untouched.

**Tech Stack:** Vanilla HTML, Tailwind CSS (CDN)

---

### Task 1: Add the photo banner card

**Files:**
- Modify: `index.html` lines ~502–529 (Get to Know Me section)

- [ ] **Step 1: Locate the section**

Open `index.html` and find the `<!-- ===== GET TO KNOW ME ===== -->` comment (around line 501). The current structure looks like:

```html
<section id="get-to-know-me" class="py-20">
    <h2 class="section-heading text-3xl font-bold mb-4">Get to Know Me</h2>
    <p class="text-gray-400 text-base mb-10">Outside of work, I'm someone who loves running...</p>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <!-- Apple Music card -->
        <!-- Strava card -->
    </div>
</section>
```

- [ ] **Step 2: Replace the standalone `<p>` with the banner card**

Replace this:
```html
<p class="text-gray-400 text-base mb-10">Outside of work, I'm someone who loves running, fishing, and spending time with my wife and kiddos. Below are a few more details about me, feel free to connect on Strava if you love to run as well!</p>
```

With this:
```html
<div class="glass-card rounded-2xl p-6 flex items-center gap-6 mb-10">
    <img src="assets/me.png" alt="Cristian Cruz" class="w-24 h-24 rounded-2xl object-cover flex-shrink-0 border-2 border-purple-400/30">
    <p class="text-gray-400 text-base">Outside of work, I'm someone who loves running, fishing, and spending time with my wife and kiddos. Below are a few more details about me, feel free to connect on Strava if you love to run as well!</p>
</div>
```

- [ ] **Step 3: Verify in browser**

Open `index.html` directly in a browser (no build step needed). Scroll to the "Get to Know Me" section and confirm:
- Photo appears to the left of the text, ~96×96px, rounded corners
- Text sits to the right in the same card
- The Apple Music and Strava cards appear below, unchanged
- On mobile (narrow the window), flex wraps and the photo stacks above the text — acceptable default behavior

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "add photo to get to know me section"
```
