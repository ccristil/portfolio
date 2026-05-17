# Claude Code Guidelines for Portfolio Website

## Overview
This is a personal portfolio website. Claude should make targeted, minimal changes only when explicitly requested. No drastic rewrites, no automatic commits.

## Core Rules

### What Claude CAN Do
- **Code reviews & suggestions** - Point out issues, propose improvements
- **Bug fixes** - Fix broken functionality with your approval first
- **Feature additions** - Add small, isolated features (new blog post styling, minor UI tweaks)
- **Testing & debugging** - Run tests, diagnose issues, explain problems
- **Documentation** - Update comments, READMEs, or inline docs
- **Minor refactoring** - Clean up code, improve readability (show diff first)

### What Claude CANNOT Do
- **Commit or push changes** - Ever. You handle all git operations
- **Major refactors** - No sweeping architectural changes without discussion
- **Framework upgrades** - No dependency updates or version bumps without approval
- **Deploy to production** - No deployments, builds to staging only
- **Delete files** - Ask first, always

## Feature Status

### Blog Feature (Beta - Hidden)
- **Status**: In development, not yet publicly accessible
- **Rules**:
    - Claude can work on blog code, styling, data structures
    - Do NOT enable blog routes or navigation links
    - Keep blog files organized in `/blog` or similar isolated directory
    - Do NOT make blog discoverable via sitemap, nav, or public routes
    - Changes to blog code are fine; changes to make it live require explicit approval

### Live Portfolio Content
- **Status**: Production
- **Rules**:
    - No breaking changes
    - Styling tweaks OK if they match current design language
    - New sections OK only if integrated thoughtfully
    - Always show diffs before changing published content

## Workflow

1. **Ask first** - For anything uncertain, ask before acting
2. **Show diffs** - Display changes in a diff format before applying
3. **One thing at a time** - Handle one request per session if possible
4. **Explain impact** - Clarify what breaks, what improves, what risks exist

## File Structure Context
- `/assets` - Static assets (images, `site.css`)
- `/blog` - Blog feature (beta, hidden)
- `/dev` - Development/staging versions of pages
- `index.html` - Main production portfolio page
- `blog.html` - Blog page (beta, hidden)
- `modals.html` - Modal components

## Technology Stack
- **Framework**: Vanilla HTML + CSS + JavaScript (no build step)
- **Styling**: Tailwind CSS (via CDN), inline `<style>` blocks
- **UI Icons**: Font Awesome (via CDN kit)
- **Fonts**: Google Fonts — Inter
- **Analytics**: PostHog, Google Analytics (gtag.js)
- **Hosting**: GitHub Pages
- **Blog tech**: In development (files in `/blog`, not yet live)

---

**Default response to any unclear request**: "I can do that, but want to show you the diff first. Should I proceed?"