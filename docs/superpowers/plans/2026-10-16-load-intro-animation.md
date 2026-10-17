# Load Intro Animation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On first load in a session, a cursor blinks 3× at screen center, stretches into a white bar that wipes away to reveal "Cristian Cruz" and the tagline, then the text glides up into the hero while the rest of the page fades in.

**Architecture:** A tiny inline gate script in `<head>` adds `html.intro` before first paint (once per session, never for reduced motion). All intro CSS is scoped under `html.intro`, so pages without it are unchanged. A script at the end of `<body>` measures the real hero text, injects two white bar elements, and steps through the timeline by adding classes to `<html>`; `finish()` cleans up and fires an `intro:done` event that starts the existing typewriter. Built first in `dev/index_v4.html`, then promoted to `index.html` after review.

**Tech Stack:** Vanilla HTML/CSS/JS (no build), Tailwind CDN (existing), headless Google Chrome for screenshot verification.

**Spec:** `docs/superpowers/specs/2026-10-16-load-intro-animation-design.md`

**Repo rules (CLAUDE.md):** Never commit or push — the user handles git, so tasks end with a "stop and report" step instead of a commit. Show a diff and get approval before changing `index.html`.

---

## File Map

- Create: `dev/index_v4.html` — staging copy of `index.html` with the intro (asset paths rewritten to `../`).
- Create (scratchpad, not in repo): `intro-shots.sh` — headless Chrome screenshot helper.
- Modify (Task 6 only, after approval): `index.html` — same changes as `dev/index_v4.html`.

All code changes live in one HTML file, which matches the existing pattern (styles + scripts inline in `index.html`).

---

### Task 1: Staging copy + screenshot harness

**Files:**
- Create: `dev/index_v4.html`
- Create: `$SCRATCH/intro-shots.sh` where `$SCRATCH` is the session scratchpad directory

- [ ] **Step 1: Create the staging copy with `../` asset paths**

`index.html` references `assets/…`, `index.js` and `llms.txt` relatively. `dev/index_v3.html` uses `../assets/…`, so follow that.

```bash
cd /Users/cristiancruz/WebstormProjects/portfolio
sed -e 's#"assets/#"../assets/#g' \
    -e 's#src="index.js"#src="../index.js"#' \
    -e 's#href="llms.txt"#href="../llms.txt"#' \
    index.html > dev/index_v4.html
grep -c '\.\./assets/\|\.\./index.js\|\.\./llms.txt' dev/index_v4.html
```

Expected: `6` (me.png, mountains_bg.jpg, resume.pdf ×2 — href + pdfjs `getDocument` — index.js, llms.txt). If the count differs, `grep -n 'assets/' dev/index_v4.html` and fix any path still missing `../`.

- [ ] **Step 2: Start a local server (background)**

```bash
cd /Users/cristiancruz/WebstormProjects/portfolio && python3 -m http.server 8765
```

Run with `run_in_background: true`. The page is at `http://localhost:8765/dev/index_v4.html`.

- [ ] **Step 3: Write the screenshot helper**

Write `$SCRATCH/intro-shots.sh`:

```bash
#!/bin/bash
# Usage: intro-shots.sh <url> <WxH> <out-prefix> [extra chrome flags...]
# Takes screenshots at several points of the intro timeline. Each Chrome run
# uses a fresh profile, so sessionStorage is empty and the intro plays.
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
URL=$1; SIZE=$2; OUT=$3; shift 3
for t in 1000 2300 2700 3500 6000; do
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --window-size="$SIZE" \
    --virtual-time-budget=$t --screenshot="$OUT-$t.png" "$@" "$URL" 2>/dev/null
done
ls "$OUT"-*.png
```

```bash
chmod +x "$SCRATCH/intro-shots.sh"
```

- [ ] **Step 4: Baseline screenshot**

```bash
"$SCRATCH/intro-shots.sh" http://localhost:8765/dev/index_v4.html 1440,900 "$SCRATCH/base"
```

Read `$SCRATCH/base-6000.png`. Expected: identical to the live site — mountains, navbar, "Cristian Cruz", tagline, Resume button. This proves the copy and paths are good before any intro code exists.

---

### Task 2: Head gate + hidden state + hero hooks

**Files:**
- Modify: `dev/index_v4.html` — `<head>` (after the viewport `<meta>`), end of the main `<style>` block, the hero `<section>` and its text `<div>`

- [ ] **Step 1: Add the gate script right after `<meta name="viewport" …/>`**

Find:

```html
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
```

Insert immediately after it:

```html
    <!-- Load intro gate: runs before first paint so nothing flashes.
         Plays once per tab session; skipped for reduced motion. -->
    <script>
      (function () {
        var root = document.documentElement;
        try {
          if (
            sessionStorage.getItem("introSeen") ||
            window.matchMedia("(prefers-reduced-motion: reduce)").matches
          )
            return;
          sessionStorage.setItem("introSeen", "1");
        } catch (e) {
          return;
        }
        root.classList.add("intro");
        // Safety net: never leave the page hidden if the intro script fails.
        window.introFallback = setTimeout(function () {
          root.className = root.className.replace(/\bintro(-\w+)?\b/g, "");
          root.classList.add("intro-done");
          document.dispatchEvent(new Event("intro:done"));
        }, 7000);
      })();
    </script>
```

- [ ] **Step 2: Add hooks to the hero markup**

Find:

```html
    <section
      class="relative w-full h-[600px] overflow-hidden flex items-center justify-center"
    >
```

Replace with:

```html
    <section
      id="hero"
      class="relative w-full h-[600px] overflow-hidden flex items-center justify-center"
    >
```

Find (inside that section):

```html
      <div class="relative z-10 text-center px-4">
```

Replace with:

```html
      <div class="hero-text relative z-10 text-center px-4">
```

Verify both are unique: `grep -c 'id="hero"\|class="hero-text' dev/index_v4.html` → `2`.

- [ ] **Step 3: Add the hidden-state CSS at the end of the main `<style>` block**

Find the end of the reduced-motion caret rule followed by `</style>`:

```css
      @media (prefers-reduced-motion: reduce) {
        .hero-caret {
          animation: none;
        }
      }
    </style>
```

Insert before `    </style>`:

```css
      /* ===== Load intro (cursor → white bar → name) =====
         Everything here is scoped to html.intro, which the gate script in
         <head> adds on the first load of a session. The timeline lives in the
         intro script at the end of <body>. */
      html.intro header,
      html.intro main,
      html.intro footer,
      html.intro #hero > :not(.hero-text),
      html.intro .hero-btn {
        opacity: 0;
      }
      html.intro.intro-out header,
      html.intro.intro-out main,
      html.intro.intro-out footer,
      html.intro.intro-out #hero > :not(.hero-text),
      html.intro.intro-out .hero-btn {
        opacity: 1;
        transition: opacity 0.9s ease;
      }
      /* The old fade-up entrance would fight the intro, and would replay
         when .intro is removed — keep it off for the rest of the visit. */
      html.intro .hero-name,
      html.intro .hero-tagline,
      html.intro .hero-btn,
      html.intro-done .hero-name,
      html.intro-done .hero-tagline,
      html.intro-done .hero-btn {
        animation: none;
      }
      /* Text starts at true viewport centre (JS sets --intro-dy), then glides
         home. Overflow is opened so tall screens don't clip it. */
      html.intro #hero {
        overflow: visible;
      }
      html.intro .hero-text {
        transform: translateY(var(--intro-dy, 0px));
      }
      html.intro.intro-out .hero-text {
        transform: none;
        transition: transform 0.8s cubic-bezier(0.65, 0, 0.35, 1);
      }
      html.intro:not(.intro-s3) .hero-name,
      html.intro:not(.intro-s5) .hero-tagline {
        color: transparent;
      }
```

- [ ] **Step 4: Verify the hidden state and the fallback**

There is no intro script yet, so the page should stay black until the 7s fallback un-hides it.

```bash
"$SCRATCH/intro-shots.sh" http://localhost:8765/dev/index_v4.html 1440,900 "$SCRATCH/t2"
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --hide-scrollbars \
  --window-size=1440,900 --virtual-time-budget=8000 --screenshot="$SCRATCH/t2-8000.png" \
  http://localhost:8765/dev/index_v4.html 2>/dev/null
```

Read `$SCRATCH/t2-3500.png` → expected: solid near-black (`#030712`) page, no nav, no image, no text.
Read `$SCRATCH/t2-8000.png` → expected: normal full page (fallback fired), name not doing a second fade-up.

- [ ] **Step 5: Stop and report** — no commit (user handles git).

---

### Task 3: Bar styles + intro timeline script

**Files:**
- Modify: `dev/index_v4.html` — append to the intro CSS from Task 2; add a script block after the typewriter IIFE

- [ ] **Step 1: Append the bar CSS directly after the `color: transparent` rule from Task 2 (still before `</style>`)**

```css
      .intro-bar {
        position: absolute;
        background: #fff;
        pointer-events: none;
        transform-origin: 50% 50%;
      }
      /* Name bar starts as a 2px cursor (--intro-s0 = 2 / bar width), blinks
         3x, stretches to full width, then retracts to the right. */
      .intro-bar--name {
        opacity: 0;
        transform: scaleX(var(--intro-s0, 0));
        transition: transform 0.55s cubic-bezier(0.7, 0, 0.2, 1);
      }
      html.intro-s1 .intro-bar--name {
        animation: introBlink 0.5s step-end 3;
      }
      html.intro-s2 .intro-bar--name {
        animation: none;
        opacity: 1;
        transform: scaleX(1);
      }
      html.intro-s3 .intro-bar--name {
        transform-origin: 100% 50%;
        transform: scaleX(0);
        transition-duration: 0.5s;
      }
      /* Tagline bar grows left → right, then retracts to the right. */
      .intro-bar--tagline {
        transform: scaleX(0);
        transform-origin: 0 50%;
        transition: transform 0.4s cubic-bezier(0.7, 0, 0.2, 1);
      }
      html.intro-s4 .intro-bar--tagline {
        transform: scaleX(1);
      }
      html.intro-s5 .intro-bar--tagline {
        transform-origin: 100% 50%;
        transform: scaleX(0);
      }
      @keyframes introBlink {
        0%,
        49.9% {
          opacity: 1;
        }
        50%,
        100% {
          opacity: 0;
        }
      }
```

- [ ] **Step 2: Add the intro script right after the typewriter IIFE**

Find the end of the typewriter IIFE followed by `</script>` (the typewriter ends with `}, PERIOD_MS);` then `})();`):

```js
          erase();
          i = next;
        }, PERIOD_MS);
      })();
    </script>
```

Insert between `      })();` and `    </script>`:

```js

      /* Load intro — cursor blinks, stretches into a white bar, wipes to
         reveal the name and tagline, then everything glides/fades into place.
         Only runs when the <head> gate added .intro to <html>. */
      (() => {
        const root = document.documentElement;
        if (!root.classList.contains("intro")) return;

        const heroText = document.querySelector("#hero .hero-text");
        const name = heroText.querySelector(".hero-name");
        const line = heroText.querySelector(".hero-line-inner");
        const STEPS = [
          [300, "intro-s1"], // cursor blinks 3x
          [1900, "intro-s2"], // cursor stretches into a bar
          [2550, "intro-s3"], // name shown, bar wipes right
          [2950, "intro-s4"], // tagline bar grows
          [3350, "intro-s5"], // tagline shown, bar wipes right
          [3800, "intro-out"], // glide home + page fades in
        ];
        const DONE_MS = 4700;
        const SKIP_EVENTS = ["pointerdown", "keydown", "wheel", "touchstart", "scroll"];
        const BAR_PAD = 4;
        const timers = [];
        const bars = [];
        let done = false;

        // Box around the rendered glyphs, not the (full-width) block element.
        const textRect = (el) => {
          const range = document.createRange();
          range.selectNodeContents(el);
          return range.getBoundingClientRect();
        };
        const addBar = (rect, cls, box) => {
          const bar = document.createElement("span");
          bar.className = "intro-bar " + cls;
          bar.setAttribute("aria-hidden", "true");
          const width = rect.width + BAR_PAD * 2;
          Object.assign(bar.style, {
            left: rect.left - box.left - BAR_PAD + "px",
            top: rect.top - box.top + "px",
            width: width + "px",
            height: rect.height + "px",
          });
          bar.style.setProperty("--intro-s0", (2 / width).toFixed(4));
          heroText.appendChild(bar);
          bars.push(bar);
        };

        const finish = () => {
          if (done) return;
          done = true;
          timers.forEach(clearTimeout);
          clearTimeout(window.introFallback);
          SKIP_EVENTS.forEach((ev) => window.removeEventListener(ev, finish));
          bars.forEach((bar) => bar.remove());
          root.classList.remove("intro", ...STEPS.map(([, cls]) => cls));
          root.classList.add("intro-done");
          heroText.style.removeProperty("--intro-dy");
          document.dispatchEvent(new Event("intro:done"));
        };
        SKIP_EVENTS.forEach((ev) =>
          window.addEventListener(ev, finish, { passive: true })
        );

        // Wait for Inter so the bars match the real text width.
        document.fonts.ready.then(() => {
          if (done) return;
          const box = heroText.getBoundingClientRect();
          const nameRect = textRect(name);
          const lineRect = textRect(line);
          const mid = (nameRect.top + lineRect.bottom) / 2;
          heroText.style.setProperty(
            "--intro-dy",
            window.innerHeight / 2 - mid + "px"
          );
          addBar(nameRect, "intro-bar--name", box);
          addBar(lineRect, "intro-bar--tagline", box);
          STEPS.forEach(([ms, cls]) =>
            timers.push(setTimeout(() => root.classList.add(cls), ms))
          );
          timers.push(setTimeout(finish, DONE_MS));
        });
      })();
```

Note: `"intro-out"` is in `STEPS`, so `finish()` removes it along with `intro-s1`…`intro-s5`.

- [ ] **Step 3: Verify the timeline on desktop**

```bash
"$SCRATCH/intro-shots.sh" http://localhost:8765/dev/index_v4.html 1440,900 "$SCRATCH/t3"
```

Read each and check:
- `t3-1000.png` — black page, thin white vertical cursor at exact screen centre (x≈720, y≈450).
- `t3-2300.png` — white bar mid-stretch at screen centre, roughly name-height tall.
- `t3-2700.png` — "Cristian Cruz" partly uncovered on the left, white bar on the right; centred vertically on screen.
- `t3-3500.png` — full name visible; tagline bar mid-wipe beneath it.
- `t3-6000.png` — finished page identical to `base-6000.png` (name/tagline back at hero position, nav + mountains + Resume visible, no leftover bars).

If bars don't line up with the text, check `textRect` output in a headed browser before changing CSS.

- [ ] **Step 4: Stop and report** — no commit.

---

### Task 4: Hold the typewriter until the intro finishes

**Files:**
- Modify: `dev/index_v4.html` — typewriter IIFE (`/* Hero tagline word rotator — typewriter */`)

Without this, the word cycles behind the transparent text during the intro and may be mid-word when revealed.

- [ ] **Step 1: Turn the interval into a start function**

Find:

```js
        let i = 0;
        text.textContent = words[0];

        setInterval(() => {
```

Replace with:

```js
        let i = 0;
        text.textContent = words[0];

        const startCycling = () => setInterval(() => {
```

Find:

```js
          erase();
          i = next;
        }, PERIOD_MS);
      })();
```

Replace with:

```js
          erase();
          i = next;
        }, PERIOD_MS);

        // Hold on the first word until the load intro has finished.
        if (document.documentElement.classList.contains("intro"))
          document.addEventListener("intro:done", startCycling, { once: true });
        else startCycling();
      })();
```

(The Task 3 intro script was inserted *after* this `})();`, so this find string still matches exactly once — confirm with grep before editing.)

- [ ] **Step 2: Verify**

```bash
"$SCRATCH/intro-shots.sh" http://localhost:8765/dev/index_v4.html 1440,900 "$SCRATCH/t4"
```

Read `t4-3500.png` → tagline reads "I build things that are **beautiful**" (first word, not mid-typing).
Read `t4-6000.png` → page finished; tagline word may have changed once (cycling started at ~4.7s + 2.5s period → first change at ~7.2s, so expected still "beautiful").

- [ ] **Step 3: Stop and report** — no commit.

---

### Task 5: Edge cases — mobile, reduced motion, console errors, manual checks

**Files:** none modified unless a check fails.

- [ ] **Step 1: Mobile width**

```bash
"$SCRATCH/intro-shots.sh" http://localhost:8765/dev/index_v4.html 390,844 "$SCRATCH/m"
```

Read `m-1000`, `m-2700`, `m-3500`, `m-6000`. Expected: same sequence, centred at x≈195, name on one line, tagline bar no wider than the screen, final page matches the live mobile layout.

- [ ] **Step 2: Tall screen (overflow check)**

```bash
"$SCRATCH/intro-shots.sh" http://localhost:8765/dev/index_v4.html 1440,1400 "$SCRATCH/tall"
```

Read `tall-2700.png` → name visible at y≈700 (not clipped at the hero's 600px bottom edge).

- [ ] **Step 3: Reduced motion skips the intro**

```bash
"$SCRATCH/intro-shots.sh" http://localhost:8765/dev/index_v4.html 1440,900 "$SCRATCH/rm" --force-prefers-reduced-motion
```

Read `rm-1000.png` → full page already visible, no black screen, no bar.

- [ ] **Step 4: No console errors**

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu \
  --enable-logging=stderr --v=0 --virtual-time-budget=6000 --dump-dom \
  http://localhost:8765/dev/index_v4.html 2>&1 >/dev/null | grep -i "uncaught\|error" | grep -iv "gpu\|dbus\|fontconfig"
```

Expected: no `Uncaught` lines from the page. (Third-party analytics noise unrelated to the intro can be ignored — note it in the report.)

- [ ] **Step 5: Hand the user the manual checks** (can't be automated without new dependencies)

Ask the user to open `http://localhost:8765/dev/index_v4.html` in a fresh tab and confirm:
1. Intro plays; overall feel and timing.
2. Click during the intro → page appears instantly, typewriter starts cycling.
3. Reload (Cmd+R) → no intro, page shows immediately.
4. New tab, same URL → intro plays again (new session).

Collect timing tweaks (e.g., "blinks too slow") and adjust the `STEPS` ms values / CSS durations in `dev/index_v4.html`, re-running Task 3 Step 3 after each change.

- [ ] **Step 6: Stop and report** — no commit.

---

### Task 6: Promote to `index.html` (only after the user approves the staging version)

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Build the production version from staging and show the diff**

```bash
cd /Users/cristiancruz/WebstormProjects/portfolio
sed -e 's#"\.\./assets/#"assets/#g' \
    -e 's#src="\.\./index.js"#src="index.js"#' \
    -e 's#href="\.\./llms.txt"#href="llms.txt"#' \
    dev/index_v4.html > "$SCRATCH/index.promoted.html"
diff -u index.html "$SCRATCH/index.promoted.html"
```

Expected: the diff contains only the intro changes from Tasks 2–4 (gate script, `id="hero"`, `hero-text` class, intro CSS, typewriter hold, intro script) — no path changes. Show it to the user.

- [ ] **Step 2: Apply only after explicit user approval**

```bash
cp "$SCRATCH/index.promoted.html" index.html
git diff --stat
```

Expected: `index.html | N +++…` only.

- [ ] **Step 3: Verify production file**

```bash
"$SCRATCH/intro-shots.sh" http://localhost:8765/index.html 1440,900 "$SCRATCH/prod"
```

Read `prod-1000.png` (cursor) and `prod-6000.png` (finished page with mountains — confirms asset paths).

- [ ] **Step 4: Clean up and report**

Stop the `http.server` background task. Report to the user: files changed, that `llms.txt` needs no update (no content change), and that `dev/index_v4.html` can be kept or deleted at their discretion (do not delete it). No commit — the user handles git.
