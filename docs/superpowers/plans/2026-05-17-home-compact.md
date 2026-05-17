# Home Page Compact + Browse Widget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compact the Home page in `app/pages/index.vue` — trim feature-grid descriptions, merge `Tags` + `Sizes` widgets into one `Browse` widget with horizontal chip strips, collapse the first SEO `<details>` section by default, slightly shorten the "Why" paragraph — without losing SEO content or internal links.

**Architecture:** All changes in one file (`app/pages/index.vue`) — template edits + scoped CSS rewrite of `.feature-btn` rules and addition of `.browse-row` / `.chip` rules. No new files, no component or composable changes.

**Tech Stack:** Nuxt 4, Vue 3 `<script setup>`, TailwindCSS v4 (`@apply` in scoped CSS). Package manager: `bun`. No test framework — verification via `bun dev` + manual visual check + `curl` for SEO crawl content.

**Spec:** [`docs/superpowers/specs/2026-05-17-home-compact-design.md`](../specs/2026-05-17-home-compact-design.md)

**Run during work:**
- Dev server: `cd simplepixelart/simplepixelart_web && bun dev` → opens at `http://0.0.0.0:3000`
- Build / type-check: `bun run build`

**Working directory for all paths:** `/Users/hoanganhlam/projects/ninosaur/simplepixelart/simplepixelart_web`

**Conventions:**
- Source root: `app/`
- Commit per task; do not push

---

## File Structure

| File | Change |
|---|---|
| `app/pages/index.vue` | Template: feature grid trim, Browse widget replaces Tags+Sizes, remove `open` attr on first details, shorten "Why" paragraph. Style: rewrite `.feature-btn` rules + delete `.feature-btn > div` / `.feature-btn span` rules; add `.browse-row` / `.browse-label` / `.chip-strip` / `.chip` rules |

No new files.

---

## Task 1: Feature grid trim

**Files:**
- Modify: `app/pages/index.vue:111-140` (template), `app/pages/index.vue:278-315` (scoped CSS)

This task replaces the 4 feature buttons' two-line content (icon + strong + span) with a one-line layout (icon + strong only), then updates the matching CSS.

- [ ] **Step 1: Replace the feature-grid template block**

In `app/pages/index.vue`, find the `<div class="feature-grid">` block (around lines 111–140). Replace it entirely with:

```vue
    <div class="feature-grid">
      <nuxt-link to="/editor?new=true" class="feature-btn">
        <span class="icon icon-brush"/>
        <strong>Create</strong>
      </nuxt-link>
      <nuxt-link to="/convert" class="feature-btn">
        <span class="icon icon-adjust"/>
        <strong>Convert</strong>
      </nuxt-link>
      <nuxt-link to="/arts" class="feature-btn">
        <span class="icon icon-discovery"/>
        <strong>Discover</strong>
      </nuxt-link>
      <nuxt-link to="/work" class="feature-btn">
        <span class="icon icon-grid"/>
        <strong>Your work</strong>
      </nuxt-link>
    </div>
```

Each `feature-btn` is now icon + `<strong>` title only — no `<div>` wrapper, no descriptive `<span>`.

- [ ] **Step 2: Rewrite `.feature-btn` CSS rules**

In the same file's `<style scoped>` block, find the existing `.feature-btn` rules (around lines 278–315). Replace these 5 rule groups:

```css
.feature-btn {
  @apply flex items-start gap-3 p-3;
  background: var(--surface);
  border: 2px solid var(--shadow-px);
  box-shadow: 3px 3px 0 0 var(--shadow-px);
  transition: transform 80ms steps(2), box-shadow 80ms steps(2);
  color: var(--foreground);
}

@media (hover: hover) and (pointer: fine) {
  .feature-btn:hover {
    transform: translate(-2px, -2px);
    box-shadow: 5px 5px 0 0 var(--shadow-px);
    border-color: var(--primary);
    color: var(--primary);
  }
}

.feature-btn .icon {
  flex-shrink: 0;
  font-size: 24px;
  color: var(--primary);
  margin-top: 2px;
}

.feature-btn > div {
  @apply flex flex-col flex-1;
}

.feature-btn strong {
  @apply text-sm uppercase;
  letter-spacing: 0.06em;
}

.feature-btn span {
  @apply text-xs mt-0.5;
  color: var(--muted);
}
```

with:

```css
.feature-btn {
  @apply flex items-center gap-2 p-2;
  background: var(--surface);
  border: 2px solid var(--shadow-px);
  box-shadow: 3px 3px 0 0 var(--shadow-px);
  transition: transform 80ms steps(2), box-shadow 80ms steps(2);
  color: var(--foreground);
}

@media (hover: hover) and (pointer: fine) {
  .feature-btn:hover {
    transform: translate(-2px, -2px);
    box-shadow: 5px 5px 0 0 var(--shadow-px);
    border-color: var(--primary);
    color: var(--primary);
  }
}

.feature-btn .icon {
  flex-shrink: 0;
  font-size: 20px;
  color: var(--primary);
}

.feature-btn strong {
  @apply text-sm uppercase;
  letter-spacing: 0.06em;
}
```

Differences:
- `items-start` → `items-center` (vertical center icon + title)
- `gap-3` → `gap-2`, `p-3` → `p-2` (less padding)
- Icon `font-size: 24px` → `20px`, dropped `margin-top: 2px`
- Deleted `.feature-btn > div` rule entirely (no div in new template)
- Deleted `.feature-btn span` rule entirely (no descriptive span)
- Hover rules unchanged

- [ ] **Step 3: Build**

```bash
cd /Users/hoanganhlam/projects/ninosaur/simplepixelart/simplepixelart_web && bun run build
```

Expected: clean build.

- [ ] **Step 4: Dev boot**

```bash
cd /Users/hoanganhlam/projects/ninosaur/simplepixelart/simplepixelart_web && (bun dev 2>&1 & PID=$!; sleep 8; kill $PID 2>/dev/null; wait 2>/dev/null) | tail -15
```

Expected: clean boot.

- [ ] **Step 5: Commit**

```bash
cd /Users/hoanganhlam/projects/ninosaur/simplepixelart/simplepixelart_web
git add app/pages/index.vue
git commit -m "style(home): trim feature-grid to icon + label only

Drops the descriptive sub-line under each Create/Convert/Discover/
Your work button. Layout shifts from two-line to one-line; matching
CSS simplified."
```

---

## Task 2: Browse widget (merge Tags + Sizes)

**Files:**
- Modify: `app/pages/index.vue:159-172` (template), append rules to scoped CSS

- [ ] **Step 1: Replace the two widgets with one Browse widget**

In `app/pages/index.vue`, find this block (around lines 159–172):

```vue
    <Widget title="Tags:">
      <div class="tags">
        <div class="item" v-for="item in data?.results" :key="item.id">
          <nuxt-link :to="`/arts/${item.id_string}`">{{ item.title }}</nuxt-link>
        </div>
      </div>
    </Widget>
    <Widget title="Sizes:">
      <div class="tags">
        <div class="item" v-for="item in sizes" :key="item">
          <nuxt-link :to="`/arts/size-${item}`">{{ item }}</nuxt-link>
        </div>
      </div>
    </Widget>
```

Replace with:

```vue
    <Widget title="Browse">
      <div class="browse-row" v-if="data?.results?.length">
        <span class="browse-label">Tags</span>
        <div class="chip-strip no-scrollbar">
          <nuxt-link
              v-for="item in data.results"
              :key="item.id"
              :to="`/arts/${item.id_string}`"
              class="chip"
          >#{{ item.title }}</nuxt-link>
        </div>
      </div>
      <div class="browse-row">
        <span class="browse-label">Sizes</span>
        <div class="chip-strip no-scrollbar">
          <nuxt-link
              v-for="item in sizes"
              :key="item"
              :to="`/arts/size-${item}`"
              class="chip"
          >{{ item }}</nuxt-link>
        </div>
      </div>
    </Widget>
```

Note: `<nuxt-link>` renders `<a href="...">` — Googlebot still crawls all tag/size internal links from server-rendered HTML.

- [ ] **Step 2: Add Browse styles**

In the `<style scoped>` block, append at the end (after the last existing rule):

```css
.browse-row {
  @apply flex items-center gap-2 py-1;
}

.browse-row + .browse-row {
  border-top: 1px solid var(--border);
}

.browse-label {
  @apply text-xs uppercase;
  letter-spacing: 0.08em;
  color: var(--muted);
  width: 48px;
  flex-shrink: 0;
}

.chip-strip {
  @apply flex gap-1 overflow-x-auto;
  flex: 1;
  min-width: 0;
}

.chip {
  @apply text-xs px-2 py-1 whitespace-nowrap;
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--foreground);
  transition: background 80ms steps(2), color 80ms steps(2);
}

@media (hover: hover) and (pointer: fine) {
  .chip:hover {
    background: var(--primary);
    color: var(--primary-foreground);
    border-color: var(--primary);
  }
}
```

- [ ] **Step 3: Build**

```bash
cd /Users/hoanganhlam/projects/ninosaur/simplepixelart/simplepixelart_web && bun run build
```

Expected: clean.

- [ ] **Step 4: Dev boot + crawl-check**

```bash
cd /Users/hoanganhlam/projects/ninosaur/simplepixelart/simplepixelart_web && (bun dev 2>&1 & PID=$!; sleep 8; kill $PID 2>/dev/null; wait 2>/dev/null) | tail -10
```

In a separate shell while dev server is running (or as a quick `curl` check after boot stabilizes), grep the rendered HTML:

```bash
curl -s http://localhost:3000/ 2>/dev/null | grep -oE 'href="/arts/[^"]+"' | head -20
```

Expected: at least 10 size links (`/arts/size-8x8`, `/arts/size-9x9`, ...) and 0 or more tag links (depending on API response). Both link types present in SSR HTML.

(If no time for the `curl` check in this task, do it during Task 5 final smoke.)

- [ ] **Step 5: Commit**

```bash
cd /Users/hoanganhlam/projects/ninosaur/simplepixelart/simplepixelart_web
git add app/pages/index.vue
git commit -m "feat(home): merge Tags+Sizes into Browse widget with chip strips

One Widget instead of two. Horizontal scroll chip rows preserve all
tag + size internal links for SEO while reducing vertical space."
```

---

## Task 3: Close SEO details + shorten "Why" copy

**Files:**
- Modify: `app/pages/index.vue:174` (remove `open` attr), `app/pages/index.vue:176` (replace first `<p>` text)

- [ ] **Step 1: Remove `open` attribute from first details section**

Find line 174:

```vue
    <details class="info-section" open>
      <summary class="info-heading">Why Simple Pixel Art?</summary>
```

Change to:

```vue
    <details class="info-section">
      <summary class="info-heading">Why Simple Pixel Art?</summary>
```

The other five `<details>` already lack `open` — do not touch them.

- [ ] **Step 2: Shorten the "Why" first paragraph**

Find line 176 (inside the same `<details>`):

```html
      <p>Simple Pixel Art is built on one idea: <strong>anyone should be able to make pixel art in seconds</strong>. No installation, no account, no learning curve. Open the site, pick a template, remix it — or convert any photo into pixel art with one click. If you want to go deeper, the advanced editor has layers, mirror drawing, selections, and a full palette manager.</p>
```

Replace with:

```html
      <p>Anyone should be able to make pixel art in seconds. No installation, no account, no learning curve. Pick a template, remix it — or convert any photo into pixel art with one click. For deeper work, the advanced editor has layers, mirror drawing, selections, and a full palette manager.</p>
```

The second `<p>` in this `<details>` (line 177) stays unchanged.

Keywords retained: "pixel art" (×3), "template", "remix", "convert", "photo", "editor", "layers", "mirror drawing", "selections", "palette manager".

- [ ] **Step 3: Build**

```bash
cd /Users/hoanganhlam/projects/ninosaur/simplepixelart/simplepixelart_web && bun run build
```

Expected: clean.

- [ ] **Step 4: Dev boot sanity**

```bash
cd /Users/hoanganhlam/projects/ninosaur/simplepixelart/simplepixelart_web && (bun dev 2>&1 & PID=$!; sleep 8; kill $PID 2>/dev/null; wait 2>/dev/null) | tail -10
```

Expected: clean.

- [ ] **Step 5: Commit**

```bash
cd /Users/hoanganhlam/projects/ninosaur/simplepixelart/simplepixelart_web
git add app/pages/index.vue
git commit -m "style(home): close all SEO details by default; shorten Why intro

Removes the auto-open on the first info-section so the page lands
compact. Keywords preserved (pixel art, template, editor, layers,
mirror drawing, palette). Googlebot reads collapsed content — no
SEO loss."
```

---

## Task 4: Full smoke + SEO crawl verification

**Files:** verification only.

- [ ] **Step 1: Build clean**

```bash
cd /Users/hoanganhlam/projects/ninosaur/simplepixelart/simplepixelart_web && bun run build 2>&1 | tail -8
```

Expected: `✨ Build complete!`.

- [ ] **Step 2: Manual UI walkthrough**

Boot `bun dev`. Open `http://localhost:3000/` in a browser:

1. Hero + sub render unchanged.
2. Feature grid: 4 buttons, each one icon + one uppercase label. No descriptive sub-line.
3. Template picker + New widget unchanged.
4. Browse widget: title "Browse". Row 1 label "TAGS" with chip strip of `#name` links scrolling horizontally. Row 2 label "SIZES" with size chips scrolling.
5. Click a tag chip → `/arts/<id_string>`. Click a size chip → `/arts/size-<size>`.
6. Bottom: 6 `<details>` sections all closed at page load.
7. Click "Why Simple Pixel Art?" → expands; first paragraph shows trimmed copy.
8. Reload page → all details closed again.
9. Cozy theme: chips rounded with peach hover.
10. Retro theme (gameboy): chips pixel-y with green hover.
11. Resize to 320px viewport: Browse strips still scroll horizontally; page does not horizontally overflow.

- [ ] **Step 3: SEO crawl verification**

While `bun dev` is running:

```bash
curl -s http://localhost:3000/ > /tmp/home.html
echo "--- Tag/size links count ---"
grep -oE 'href="/arts/[^"]+"' /tmp/home.html | sort -u | wc -l
echo "--- JSON-LD blocks ---"
grep -c 'application/ld+json' /tmp/home.html
echo "--- Long-form keywords ---"
grep -oE 'pixel art|template|editor|layers|mirror drawing' /tmp/home.html | sort | uniq -c
echo "--- Details sections in DOM ---"
grep -c '<details class="info-section"' /tmp/home.html
```

Expected:
- `Tag/size links count`: ≥ 10 (10 sizes + however many tags)
- `JSON-LD blocks`: ≥ 1
- Long-form keywords: each keyword appears multiple times
- `Details sections in DOM`: 6 (content is present in HTML, just collapsed)

- [ ] **Step 4: Address any deviation**

Common failure modes:
- Chips don't scroll → `.chip-strip` overflow-x missing or parent has fixed width.
- Tag links empty → check `data?.results` is populated from `/coloring/tags/` endpoint.
- "Why" paragraph shows old wording → grep file to confirm Task 3 edit landed.

Fix as `fix(home): ...` commits.

- [ ] **Step 5: Final commit (only if Step 4 produced fixes)**

```bash
cd /Users/hoanganhlam/projects/ninosaur/simplepixelart/simplepixelart_web
git add -A
git commit -m "fix(home): address compact-pass smoke findings"
```

If no fixes needed, this task ends without a commit.

---

## Self-Review Notes

- **Spec coverage** — Feature grid trim (Task 1), Browse widget (Task 2), close all details + shorten Why (Task 3), full smoke (Task 4). All spec sections covered.
- **Placeholder scan** — every step has complete code or exact command. No "TODO" / "fix as needed" without specifics.
- **Type consistency** — CSS class names (`.feature-btn`, `.browse-row`, `.browse-label`, `.chip-strip`, `.chip`, `.no-scrollbar`, `.info-section`) consistent across plan and spec.
