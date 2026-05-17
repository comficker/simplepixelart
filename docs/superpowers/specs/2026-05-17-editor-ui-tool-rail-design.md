# Editor UI — Tool Rail + Slimmer Sidebar

**Date:** 2026-05-17
**Scope:** SimplePixelArt web editor (`simplepixelart/simplepixelart_web`)
**Goal:** Reclaim canvas area in `PXEditor.vue` by moving the Control tool grid out of the right sidebar into a narrow vertical rail left of the canvas, then shrinking the right sidebar to fit only Preview + Layers.

## Problem

Right sidebar currently consumes 36% / max 260px of viewport for three widgets: Control (10-tool grid, 3-col), Preview (mini-map), Layers. Tools occupy >50% of sidebar height. Canvas + palette column gets the rest. After moving tools out, sidebar can shrink and canvas gains ~70px wide on a 1280px viewport — meaningful zoom step uplift (16-px art: zoom 46 → 50).

## Out of scope

- Renderer / store / speed optimization (separate spec)
- Refactor PXEditor.vue into subcomponents
- Component-level rewrites (`Widget`, `Square`)
- Window-resize refit of canvas zoom (existing bug, not introduced here)
- Marketing intro section / site header / footer changes

## Approach

CSS shuffle + small template restructure. No new files, no Pinia changes, no component decomposition. The single user-visible behavior change is layout.

## Decisions (from brainstorm)

| Question | Decision |
|---|---|
| Where does the tool grid live? | Vertical 44-px rail, left of canvas column (desktop ≥768px) |
| Which tools in the rail? | All 10. Two groups with separator: **Draw** (brush, iso-line, bucket, eraser) → sep → **Edit** (move, select, mirror-h, mirror-v, flip-h, flip-v) |
| Palette position? | Unchanged — below canvas |
| Right sidebar contents? | Preview + Layers only |
| Right sidebar width? | 24% / max-width 190px |
| Mobile (<768px) | Rail becomes horizontal scrollable strip immediately under canvas/palette block (existing sidebar-collapse behavior preserved) |

## Template restructure (`app/components/PXEditor.vue`)

Current layout:

```vue
<div class="flex flex-col md:flex-row gap-3">
  <!-- canvas + palette column -->
  <div class="flex-1 space-y-2">
    <Widget><Square>… canvas …</Square></Widget>
    <Widget title="Palette"><editor-palette/></Widget>
  </div>

  <!-- right sidebar -->
  <div class="editor-sidebar">
    <div class="adv-top-row">
      <Widget title="Control">
        <div class="tools"> … 10 Square buttons … </div>
      </Widget>
      <Widget title="Preview">…</Widget>
    </div>
    <Widget title="Layers">…</Widget>
  </div>
</div>
```

Becomes:

```vue
<div class="editor-body flex flex-col md:flex-row gap-2">
  <!-- Tool rail (left on desktop, horizontal strip on mobile) -->
  <Widget class="tool-rail">
    <div class="tools tools-rail">
      <Square @click="store.setTool('brush')" :class="{ active: store.currentTool === 'brush' }">
        <span class="icon icon-brush"/>
      </Square>
      <Square @click="store.setTool('iso-line')" :class="{ active: store.currentTool === 'iso-line' }">
        <span class="icon icon-brush iso-rotated"/>
      </Square>
      <Square @click="store.setTool('bucket')" :class="{ active: store.currentTool === 'bucket' }">
        <span class="icon icon-bucket"/>
      </Square>
      <Square @click="store.setTool('eraser')" :class="{ active: store.currentTool === 'eraser' }">
        <span class="icon icon-eraser"/>
      </Square>

      <div class="tools-sep"/>

      <Square @click="store.setTool('move')" :class="{ active: store.currentTool === 'move' }">
        <span class="icon icon-move"/>
      </Square>
      <Square @click="toggleSelect()" :class="{ active: store.currentTool === 'select' }">
        <span class="icon icon-select"/>
      </Square>
      <Square @click="store.toggleMirror('horizontal')" :class="{ active: store.mirrorHorizontal }">
        <span class="icon icon-reflect-horizontal"/>
      </Square>
      <Square @click="store.toggleMirror('vertical')" :class="{ active: store.mirrorVertical }">
        <span class="icon icon-reflect-vertical"/>
      </Square>
      <Square @click="store.flipSelectionHorizontal">
        <span class="icon icon-flip-h"/>
      </Square>
      <Square @click="store.flipSelectionVertical">
        <span class="icon icon-flip-v"/>
      </Square>
    </div>
  </Widget>

  <!-- Canvas + palette column -->
  <div class="canvas-col flex-1 space-y-2">
    <Widget><Square>… canvas …</Square></Widget>
    <Widget title="Palette"><editor-palette/></Widget>
  </div>

  <!-- Right sidebar (Preview + Layers only) -->
  <div class="editor-sidebar">
    <Widget title="Preview">
      <template #ctl>
        <a v-if="editorData.id_string" target="_blank" :href="`/art/${editorData.id_string}`">
          <span class="icon icon-link"/>
        </a>
      </template>
      <Square class="inside">
        <canvas ref="miniMap" class="mini-map"/>
      </Square>
    </Widget>

    <Widget title="Layers" class="layers">
      <template #ctl>
        <button @click="store.addLayer">+</button>
      </template>
      <ul>… layer list …</ul>
    </Widget>
  </div>
</div>
```

Key changes:

1. Outer wrapper `flex flex-col md:flex-row gap-3` → `editor-body flex flex-col md:flex-row gap-2`. Gap reduced to 2 (8px) to recover a few pixels.
2. New first child: `<Widget class="tool-rail">` carrying the tools (no `title` prop → Widget renders an empty `<div class="widget-head">` — see CSS to hide).
3. Tools markup wrapped in `<div class="tools tools-rail">` — the additional `tools-rail` class drives rail-specific layout. Existing `.tools` rules keep applying for the `Square.active` styling, `inside` interactions etc.
4. New `<div class="tools-sep"/>` between the Draw group and the Edit group.
5. The `editor-sidebar` div no longer wraps a `<div class="adv-top-row">`. Preview and Layers are direct children with sidebar flex flow.

## CSS changes (`app/assets/css/main.css`)

### Add (around current line 615, replacing the `.adv-top-row` rules):

```css
/* --- Tool rail (vertical on desktop, horizontal on mobile) --- */
.tool-rail {
  flex: none;
}

.tool-rail .widget-head {
  display: none; /* compact rail has no header */
}

.tool-rail .widget-body {
  padding: 4px;
}

.tools-rail {
  display: grid;
  gap: 2px;
}

.tools-sep {
  background: var(--border);
}

@media (min-width: 768px) {
  .tool-rail {
    width: 44px;
  }
  .tools-rail {
    grid-template-columns: 1fr;
    font-size: 1.25rem;
  }
  .tools-sep {
    height: 1px;
    margin: 4px 2px;
  }
}

@media (max-width: 767px) {
  .tool-rail {
    width: 100%;
  }
  .tools-rail {
    grid-template-columns: repeat(11, minmax(36px, 1fr));
    grid-auto-flow: column;
    overflow-x: auto;
    font-size: 1.25rem;
  }
  .tools-sep {
    width: 1px;
    height: auto;
    margin: 2px 2px;
  }
}
```

Note: 11 columns on mobile = 10 tools + 1 separator cell.

### Update `.editor-sidebar` (current line 582):

```css
@media (min-width: 768px) {
  .editor-sidebar {
    width: 24%;
    max-width: 190px;
  }
}
```

(Was `36% / max 260px`.)

### Remove obsolete:

The `.adv-top-row` rules (current lines 615–633) become dead — delete them all. The matching `<div class="adv-top-row">` in the template is also gone, so no stale reference remains.

The existing `.tools` rules (current lines 636–667) stay in place — they continue styling button look + active state. The `@media (min-width: 768px) .tools { grid-cols-3 }` and the base `.tools { grid-cols-6 text-xl gap-0.5 }` rules will be **overridden** by `.tools-rail` since both classes apply but `.tools-rail` is more recent in cascade. Verify in implementation that the rail does not inherit a 3-col or 6-col grid from `.tools` — if it does, the `.tools-rail` rule needs `grid-template-columns` declared with higher specificity or the legacy `.tools` `grid-cols-*` should be moved into a non-rail selector (e.g. `.tools:not(.tools-rail)`).

## Canvas sizing

`setupCanvas()` reads `canvas.value.parentElement.parentElement.offsetWidth` — that's `canvas-col` (no name change required; the existing logic walks two levels up from the canvas through `Square` → `Widget` → the column div). After the restructure that column is wider, so zoom auto-increases. No change required to the function.

The single existing limitation: `setupCanvas` only runs onMounted and when `width+height` change. It does NOT re-fit on viewport resize. That gap is **out of scope** — same behavior as today.

## Edge cases

- **Widget header**: `Widget.vue` always renders `<div class="widget-head">` regardless of whether `title` prop is set. The element is non-empty when a `ctl` slot is passed, so `display: none` on `.tool-rail .widget-head` is safe (no rail has a `ctl` slot today). If a future rail adds a `ctl` slot, this rule must change.
- **`Square` component**: `<div class="square"><div class="inside"><slot/></div></div>`. No min-width. In a 44px-wide column with 4px parent padding, each Square renders at 36px square — fine.
- **Onboarding / publish / login modals**: full-screen `Teleport` overlays. Untouched.
- **Iso cell W/H inputs**: render inline in the top toolbar's `toolbar-group`, not in the rail. Untouched.
- **`.canvas-container` width binding** (CSS `width: var(--editor-width, 464px)`): bound to the `--editor-width` style var set by `setupCanvas` → `EDITOR_SIZE.value`. Recomputed from `wrapperWidth`. Still works.

## Testing plan

No test framework. Manual on `bun dev`:

1. Desktop ≥768px: rail visible left, 44px wide, 10 tools in 1 column, separator after 4th button (after eraser, before move).
2. Desktop: sidebar right is narrower; only Preview + Layers visible; max-width 190px.
3. Desktop: canvas area visibly wider than before (compare with branch `main` if needed).
4. Click each of 10 tools → tool becomes active (highlighted), draw/move/select still work.
5. Mirror buttons toggle correctly; flip buttons run; iso-line tool draws correctly.
6. Resize viewport across the 768px breakpoint: rail flips orientation; mobile sidebar collapses below canvas (existing behavior).
7. Mobile <360px: rail strip scrolls horizontally without breaking layout.
8. Onboarding modal still appears on first load; publish modal still opens.
9. Iso mode cell W/H inputs in top toolbar still render.
10. No console errors / no Vue warnings.

## File touchpoints

| File | Change |
|---|---|
| [`app/components/PXEditor.vue`](../../../app/components/PXEditor.vue) | Template restructure: 3-column flex; tool rail extracted; sidebar slimmed; `adv-top-row` wrapper removed |
| [`app/assets/css/main.css`](../../../app/assets/css/main.css) | Add `.tool-rail`/`.tools-rail`/`.tools-sep` rules; shrink `.editor-sidebar` width; remove `.adv-top-row` rules; scope legacy `.tools` rules to `:not(.tools-rail)` if cascade conflicts |

Approx LOC: +70 / -25.

## Risks

1. **`.tools` cascade override**: legacy `grid-cols-6` / `grid-cols-3` Tailwind classes apply through both `.tools` and `.tools-rail`. **Mitigation:** during implementation, run the dev server and inspect computed `grid-template-columns` on `.tools.tools-rail`. If Tailwind utility wins, scope the legacy rule with `:not(.tools-rail)` or move the layout rule into the `.tools-rail` class.
2. **Widget head visibility**: if a future change adds a `ctl` slot to the rail, the empty-head hiding breaks. Low priority today.
3. **Mobile rail height growth**: 10 buttons + sep on a 36px height each = manageable strip. Smaller screens hide via `overflow-x: auto`.
