# Home Page Compact + Browse Widget

**Date:** 2026-05-17
**Scope:** `app/pages/index.vue` only (Home page of SimplePixelArt web)
**Goal:** Tighten the Home page UI — collapse SEO long-copy by default, trim feature-grid descriptions, merge Tags + Sizes into one `Browse` widget with horizontal chip strips — without losing SEO value (visible HTML, internal links, JSON-LD schemas all preserved).

## Problem

Home page renders as a long marketing scroll: hero → 4 feature buttons (each with 2-line copy) → templates → New artworks → ad → Tags widget (wrapping multi-row chips) → Sizes widget (wrapping) → 6 long `<details>` SEO sections, the first one open-by-default. For a web-app utility, the scroll is heavy. User wants tighter UI while keeping the SEO benefits (keywords in HTML, crawlable tag/size internal links, schema.org).

## Out of scope

- Splitting long copy into a dedicated `/about` page
- Tooltip / drag-indicator polish for chip strips
- I18n / localization changes
- ItemCard / Widget component refactors
- Mobile-specific tap targets beyond the existing strip behavior
- Visual companion / animation polish

## Approach

Four scoped edits inside `app/pages/index.vue`:

1. **Feature grid trim** — drop the descriptive `<span>` from each `feature-btn`, keep icon + `<strong>` title. CSS adjusts to a 1-row inline layout.
2. **Browse widget** — replace the two separate `Tags:` and `Sizes:` widgets with one `<Widget title="Browse">` containing two horizontal-scroll chip strips (Tags row, Sizes row). Internal links preserved as `<nuxt-link>` `<a href>`.
3. **SEO details — close all** — remove the `open` attribute on the first `<details>` ("Why Simple Pixel Art?"). All six sections now collapsed by default. Content stays in the HTML (Googlebot reads collapsed content). The "Why" first paragraph is slightly shortened.
4. **Scoped CSS** — add `.browse-row`, `.browse-label`, `.chip-strip`, `.chip` rules in the existing `<style scoped>` block. Update `.feature-btn` rules to match the trimmed inline layout.

## Decisions (from brainstorm)

| Topic | Decision |
|---|---|
| Tag + Size UI | One `Browse` widget, two horizontal chip strips |
| SEO long copy | Keep all 6 `<details>`, but all default-closed (no `open`) |
| Feature grid | Drop the `<span>` descriptions |
| Hero sub copy | Unchanged |
| `/about` split | Out of scope — keep content on Home, collapsed |
| FAQ duplication | Keep visible FAQ section + JSON-LD `FAQPage` schema (Google-recommended pattern) |

## SEO preservation checklist

| Element | Status after change |
|---|---|
| H1 `Simple Pixel Art` | Unchanged |
| Hero sub keyword copy | Unchanged |
| Feature button names (Create / Convert / Discover / Your work) in `<strong>` | Unchanged |
| Tag links `/arts/${id_string}` | Preserved as `<a href>` via `<nuxt-link>` |
| Size links `/arts/size-${size}` | Preserved as `<a href>` |
| 6 `<details>` content | Preserved in DOM (collapsed, but Googlebot reads collapsed content) |
| JSON-LD WebSite / WebApplication / FAQPage schemas | Unchanged |
| Meta title / description / keywords / canonical | Unchanged |

No keywords lost. No link removed. UI density reduced.

## Template changes (`app/pages/index.vue`)

### Feature grid — lines 111–140 (current) → trimmed

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

### Browse widget — lines 159–172 (current) → replaced

Replace both the `<Widget title="Tags:">` block AND the `<Widget title="Sizes:">` block with a single Widget:

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

`.no-scrollbar` is a project-wide utility already used by `canvas-container`.

### SEO details — line 174

Change:

```vue
<details class="info-section" open>
```

to:

```vue
<details class="info-section">
```

The other 5 `<details>` already lack `open` — leave untouched.

### "Why Simple Pixel Art?" paragraph — line 176

Replace the first `<p>` inside the "Why" `<details>`:

```html
<p>Simple Pixel Art is built on one idea: <strong>anyone should be able to make pixel art in seconds</strong>. No installation, no account, no learning curve. Open the site, pick a template, remix it — or convert any photo into pixel art with one click. If you want to go deeper, the advanced editor has layers, mirror drawing, selections, and a full palette manager.</p>
```

with:

```html
<p>Anyone should be able to make pixel art in seconds. No installation, no account, no learning curve. Pick a template, remix it — or convert any photo into pixel art with one click. For deeper work, the advanced editor has layers, mirror drawing, selections, and a full palette manager.</p>
```

Keywords preserved: "pixel art", "template", "editor", "layers", "mirror drawing", "selections", "palette manager".

The second `<p>` stays as-is.

## Style changes (`<style scoped>` in `app/pages/index.vue`)

### Modify `.feature-btn` rules (current lines 278–315)

Replace the existing `.feature-btn`, `.feature-btn .icon`, `.feature-btn > div`, `.feature-btn strong`, `.feature-btn span` rules with:

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

(The `.feature-btn > div` rule is removed entirely. The `.feature-btn span` rule is removed because there's no `<span>` description anymore — the icon is also a `<span>` but doesn't need extra rules beyond the `.icon` selector.)

### Add Browse widget styles

Append at the end of the `<style scoped>` block:

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

## File touchpoints

| File | Change |
|---|---|
| `app/pages/index.vue` | Template: feature grid trim, Browse widget replace, remove `open` attr, shorten "Why" paragraph. Style: rewrite `.feature-btn` rules, add `.browse-row`/`.browse-label`/`.chip-strip`/`.chip` rules |

No new files. No store/composable changes. No CSS changes outside the scoped block.

Approx LOC: +50 / -55 (net slightly smaller).

## Risks

1. **Tags API returns empty array** — `v-if="data?.results?.length"` guard hides the Tags row but keeps the Sizes row + Widget title visible. Acceptable degradation.
2. **Very long tag name** — `whitespace-nowrap` + `overflow-x-auto` keep the chip on one line; the strip scrolls. No layout break.
3. **Mobile horizontal scroll discoverability** — chip strips on narrow viewports require horizontal swipe. Accepted UX cost; the row label sits on the left so users see the strip start.
4. **Removing feature-btn descriptions reduces dwell text** — accepted per brainstorm (icon + label suffice; the routes themselves are self-explanatory).
5. **`Browse` title is generic** — alternatives considered ("Explore", "Find art"). `Browse` chosen because the row labels (`Tags`, `Sizes`) provide the specifics; a generic container title keeps the widget header short.
6. **Collapsed FAQ + Google FAQ rich result** — Google's FAQ schema continues to accept content even when visually collapsed in HTML; this is the recommended pattern per Google Search Central docs. No SEO loss expected.

## Testing plan

No automated tests. Manual on `bun dev`:

1. Open `/`. Hero + sub render unchanged.
2. Feature grid: four buttons in 2-col (mobile) / 4-col (desktop), each with one icon + one uppercase word. No descriptive sub-line.
3. Template picker + New widget render unchanged.
4. Browse widget: title `Browse`, two rows. Row 1: label `TAGS`, chip strip with `#name` chips, scrollable horizontally. Row 2: label `SIZES`, chip strip with size chips, scrollable.
5. Click a tag chip → navigates to `/arts/<id_string>`.
6. Click a size chip → navigates to `/arts/size-<size>`.
7. Bottom of page: all six `<details>` sections render closed by default. Click any summary → expands. Reload page → all closed again (no `open` attr).
8. "Why Simple Pixel Art?" first paragraph shows the trimmed wording when expanded; second paragraph unchanged.
9. `curl http://localhost:3000/ | grep -c 'href="/arts/'` — count is >= number of tags + sizes (i.e., links are SSR'd into the HTML).
10. `curl http://localhost:3000/ | grep 'application/ld+json'` — JSON-LD `<script>` blocks remain.
11. View `<meta>` head tags — title, description, keywords, canonical unchanged.
12. Cozy theme: chips rounded peach hover (existing cozy override).
13. Retro theme (gameboy / arcade): chips pixel-y, hover swaps to primary color.
14. Resize to 320px: Browse rows still single-line per row, scroll works.
