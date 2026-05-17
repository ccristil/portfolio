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
[Add your actual structure here, e.g.:
- `/src` - React/Vue components (if applicable)
- `/public` - Static assets
- `/blog` - Blog feature (beta, hidden)
- `/styles` - CSS or styling
  ]

## Technology Stack
[Add your stack, e.g.:
- Framework: Next.js / React / HTML+CSS
- Styling: Tailwind / CSS modules / etc.
- Hosting: Vercel / GitHub Pages / etc.
- Blog tech: Markdown / Headless CMS / etc.
  ]

---

**Default response to any unclear request**: "I can do that, but want to show you the diff first. Should I proceed?"