# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start          # Start server on localhost:3000, auto-opens browser
npm install        # Install dependencies (rss-parser only)
```

No build step, no lint, no tests. It's a zero-build native JS project.

## Architecture

```
server.mjs              # Node HTTP server — static files + JSON API
data/
  feeds.json            # RSS source config (user-editable)
  articles.json         # Article cache, auto-maintained, 7-day retention
  bookmarks.json        # User bookmarks with tags and notes
public/
  index.html            # SPA shell — 3 hash-routed pages
  css/newspaper.css     # Single CSS file, ~500 lines
  js/
    app.js              # Hash router — maps #feeds/#bookmarks/#report to pages
    api.js              # fetch() wrapper for all /api/* endpoints
    feeds.js, bookmarks.js, report.js  # Page controllers (render + bindEvents pattern)
    utils.js            # formatTime, formatChineseDate, escapeHTML, debounce, TAG_LABELS
```

**Server API** (`server.mjs`):

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/feeds` | RSS source list from feeds.json |
| POST | `/api/refresh` | Fetch all RSS sources (Promise.allSettled), merge+dedup by MD5 hash of link, return new count |
| GET | `/api/articles?date=YYYY-MM-DD` | Articles filtered by publish date, auto-triggers refresh if cache empty |
| GET/POST | `/api/bookmarks` | List all / create bookmark |
| PATCH/DELETE | `/api/bookmarks/:id` | Update tags+note / delete |

**Data flow**: Browser SPA → `fetch()` → local Node server → read/write JSON files on disk. No external APIs except RSS fetching. Zero database.

**Key patterns**:
- Article dedup: `md5(link)` as ID, upsert into articles.json
- Atomic writes: `.tmp` file → `fs.rename` to prevent corruption
- RSS fetch timeout: 15s per source; individual failures don't block others
- Auto-cleanup: articles older than 7 days pruned on each refresh
- Each page controller has `render(container)` → returns HTML string, then `bindEvents()` attaches listeners

## Design System

Current theme is **BMW M dark motorsport** — black canvas (`#000`), white type, Inter font at 700/300 weight pair, zero border-radius, uppercase display, M tricolor stripe (#0066b1 → #1c69d4 → #e22718) as brand accent on report masthead and section headers.

CSS tokens are at `:root` in `newspaper.css`. Spacing is 4px-grid based (`--space-xs` through `--space-section: 96px`).

## RSS Source Config

`data/feeds.json` is a JSON array. Each entry: `{ "id": "kebab-id", "name": "Display Name", "url": "https://...", "lang": "zh|en" }`. Users edit this directly — no code changes needed.

## Agent Routing Rules

When a task spans code exploration, code review, security audit, or design work, delegate to the right agent. Do NOT delegate simple single-file edits or direct tool calls.

### When to delegate

| Scenario | Agent / Skill | Why |
|----------|--------------|-----|
| Open-ended codebase exploration (>3 tool calls) | `Explore` agent | Saves context; reads fragments without flooding the window |
| Code review (diff or full file audit) | `/code-review` or Agent with `code-reviewer` | Structured findings with severity ratings |
| Security audit | `/security-review` or dedicated Agent with security focus | Requires adversarial thinking; best done independently |
| Independent second opinion | Two agents in parallel | Each starts cold — no bias from the first agent's findings |
| UI/UX design, styling, layout planning | `/ui-ux-pro-max` skill | Has 50+ styles, 161 palettes, 57 font pairings, stack-specific guidelines |
| Implementation planning (multi-file, architectural) | `/plan` mode (Plan agent) | Designs approach before writing code; user approves the plan |
| Research requiring web lookups | `general-purpose` agent with WebSearch/WebFetch | Keeps search noise out of the main conversation |
| Banner/social media asset design | `/banner-design` skill | Specialized for creative assets |

### When NOT to delegate

- **Known file path, single edit** — just use Read + Edit directly
- **Known symbol/string grep** — use Grep directly (faster than spawning an agent)
- **Trivial tasks** (rename a variable, fix a typo, add a console.log) — one tool call, no agent needed
- **The user explicitly asks you to do it yourself** — respect that
- **Tasks that need conversation context** — agents start cold; don't make them guess what was discussed

### Judgment Principles

1. **3-query threshold**: If exploring something needs more than 3 Grep/Glob/Read calls, spawn an Explore agent instead
2. **Independence matters**: For review/audit tasks, the agent's value is its fresh perspective — never feed it your own conclusions first
3. **Parallel when independent**: Two reviews of different concerns (e.g., security + UX) run concurrently, not sequentially
4. **Brief the agent like a colleague**: Include file paths, what to look for, what NOT to do, and the expected output format
5. **Verify agent output**: An agent's summary describes intent, not what actually happened. Check edits before reporting success

## Session History

- 2026-06-21 08:22:04 — session completed with file changes
