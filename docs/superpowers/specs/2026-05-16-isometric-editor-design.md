# Isometric Editor Upgrade — Design

**Date:** 2026-05-16
**Scope:** SimplePixelArt web editor (`simplepixelart/simplepixelart_web`)
**Goal:** Add Aseprite-style isometric drawing support: diamond grid overlay + pixel-perfect 2:1 iso line tool.

## Problem

Current editor draws pixel art on square grid only. Users creating isometric art (game tiles, iso scenes) must eyeball 2:1 slopes — error-prone, slow. Aseprite users expect:

1. Isometric grid overlay (configurable cell W×H)
2. Tool that draws clean stair-step lines along iso axes

## Out of scope

- Iso brush stamping
- Iso rectangle / parallelogram tool
- Cursor axis guides
- Iso tilemap mode
- Snap-to-iso for non-line tools

These remain future increments.

## Approach

Add iso grid as overlay (not coordinate transform — pixels stay square). Add new `iso-line` tool that paints pixel-perfect lines along the configured iso slope. Minimal data-model change; reuse existing `virtualLayer`, mirror, selection, undo/redo plumbing.

## Data model

`EditorData` (in [`app/types/index.ts`](../../../app/types/index.ts)) gains two optional fields:

```ts
gridMode?: 'square' | 'iso' | 'off'           // default 'square'
gridCell?: { width: number; height: number }  // default { width: 2, height: 1 }
```

Both nested under existing `meta` JSON if backend strips unknown root fields — verify against `/coloring/shared-pages/` PUT/POST schema before implementation; fallback path: store under `editorData.meta.iso = { mode, cell }`. Choice of root vs. `meta` placement decided during implementation after a 5-min backend check.

Defaults applied in `load()` after fetch / local read: `data.gridMode ??= 'square'`, `data.gridCell ??= { width: 2, height: 1 }`.

## Store changes (`app/stores/editor.store.ts`)

Add state (refs are top-level, exposed via return):

- `gridMode` — getter/setter mirroring `editorData.value.gridMode`
- `gridCell` — getter/setter mirroring `editorData.value.gridCell`

Add actions:

- `cycleGridMode()` — `square → iso → off → square`. Calls `drawTurn.value++`. Does **not** push history (UI preference, no undo for mode cycle).
- `setGridCell(width, height)` — clamps `width >= 1`, `height >= 1`, `width <= 32`, `height <= 32`. Calls `saveState()` (history + sync).
- `paintIsoLine(start, end, cellW, cellH, colorIndex)` — generates stair-step pixels along the iso axis closest to `(end - start)`. Writes to `virtualLayer` (caller flushes via `mergeVirtualLayer()` on `stopDraw`).

`paintIsoLine` algorithm:

1. Compute `dx = end.x - start.x`, `dy = end.y - start.y`
2. Pick the iso axis closest to `(dx, dy)` (four axes: NE, SE, SW, NW with slope `±cellH/cellW`)
3. Step along the axis: for each block of `cellW` pixels horizontally, advance `cellH` vertically; emit `cellW` horizontal pixels at each row before stepping down
4. Apply mirror flags (`mirrorHorizontal`, `mirrorVertical`) per emitted pixel — reuse existing mirror reflection math
5. Skip pixels outside selection bounds (if `selectionState.bounds.active`)
6. Skip pixels outside canvas (`0 <= x < width`, `0 <= y < height`)

Tool flow integration (handled in `PXEditor.vue` `startDraw`/`draw`/`stopDraw` — add `case "iso-line":` branch alongside existing `select`/`move`/`bucket` branches, **before** the `default` brush/eraser case):

- `startDraw` `case 'iso-line'` → call `store.immigrateVirtualLayer()` to allocate a clean virtual layer above the current one, record `isoLineStart = pixelPos`, set a local `isIsoLining` flag (parallel to `isDrawing`), `needSave = true`
- `draw` while `isIsoLining` → clear `virtualLayer.pixels`, call `store.paintIsoLine(isoLineStart, currentPixelPos, gridCell.width, gridCell.height, currentColorIndex)` which writes into the virtual layer; `drawEditor()` shows live preview
- `stopDraw` → `store.mergeVirtualLayer()` flushes virtual into current layer, `saveState()`, clear `isoLineStart` and `isIsoLining`

Rationale: virtual-layer preview reuses the same machinery the `move` tool already exercises — no new history concept needed, and `mergeVirtualLayer()` already handles flush + selection bound is enforced inside `paintIsoLine` before emit.

## Rendering changes (`app/helper/canvas.ts` + `PXEditor.vue`)

New helper:

```ts
drawIsoGrid(
  ctx: CanvasRenderingContext2D,
  ox: number, oy: number,           // art offset in canvas px
  zoom: number,
  artW: number, artH: number,        // art size in pixel cells
  cellW: number, cellH: number,      // iso cell size in pixel cells
  color: string                      // stroke color (rgba)
): void
```

Algorithm:

1. Half-cell stride: `hx = cellW/2`, `hy = cellH/2`
2. For iso lattice index `(i, j)` covering art rect:
   - Anchor in pixel-cell coords: `cx = i * cellW + (j % 2) * hx`, `cy = j * hy`
   - Convert to canvas coords: multiply by `zoom`, add `ox`/`oy`
   - Draw diamond: `moveTo(cx + hx*zoom, cy)` → `lineTo(cx + cellW*zoom, cy + hy*zoom)` → `lineTo(cx + hx*zoom, cy + cellH*zoom)` → `lineTo(cx, cy + hy*zoom)` → `closePath`
3. `ctx.strokeStyle = color`, `ctx.lineWidth = 1`, single `stroke()` for whole grid (one `beginPath` per call)
4. Snap to integer + 0.5 offset to avoid AA blur
5. Clip iso lines to art rect with `ctx.save() / ctx.clip() / ctx.restore()`

Color: fixed `rgba(0, 0, 0, 0.4)` (overlay on light bg). Theming deferred.

Edge cases:

- `artW < cellW || artH < cellH` → skip drawing (overlay would be meaningless)
- `cellW <= 0 || cellH <= 0` → guarded by setter clamps; helper additionally bails

`PXEditor.vue` changes:

- `drawBackground()` switches on `store.gridMode`:
  - `'square'` → existing checkerboard
  - `'iso'` → solid `EDITOR_ART_BG_SOLID` fill (no checkerboard)
  - `'off'` → same solid fill
- New `drawIsoOverlay()` called inside `drawEditor()` **after** `drawPixels()` and **before** `drawSelection()` — only when `store.gridMode === 'iso'`
- `drawMiniMap()` unchanged (no iso overlay on minimap)
- Cursor class: `.iso-line` → `crosshair`

## UI changes (`PXEditor.vue`)

**Toolbar** — replace existing grid toggle (line 794–798) with cycle button:

```vue
<ui-tooltip :text="`Grid: ${store.gridMode}`">
  <button
    class="toolbar-btn"
    :class="{ active: store.gridMode !== 'off' }"
    @click="store.cycleGridMode(); drawEditor()"
  >
    <span :class="gridIconClass" />
  </button>
</ui-tooltip>
```

`gridIconClass` computed:

- `square` → `'icon icon-grid'`
- `iso` → `'icon icon-grid iso-rotated'` (CSS `transform: rotate(45deg)`) — fallback if no `icon-grid-iso` available; verify icon set during implementation
- `off` → `'icon icon-grid opacity-50'`

**Cell size inline editor** — shown adjacent to grid button only when `store.gridMode === 'iso'`:

```vue
<template v-if="store.gridMode === 'iso'">
  <input class="resize-input" type="number" min="1" max="32"
         :value="store.gridCell.width"
         @change="store.setGridCell($event.target.value, store.gridCell.height); drawEditor()" />
  <span class="text-xs">×</span>
  <input class="resize-input" type="number" min="1" max="32"
         :value="store.gridCell.height"
         @change="store.setGridCell(store.gridCell.width, $event.target.value); drawEditor()" />
</template>
```

Reuses existing `.resize-input` class.

**Sidebar tool button** — add to `Control` widget (after `brush`, before `bucket`, line 888):

```vue
<Square @click="store.setTool('iso-line')" :class="{ active: store.currentTool === 'iso-line' }">
  <span class="icon icon-line" />  <!-- fallback to icon-brush if icon-line missing -->
</Square>
```

**Onboarding**: no change.

**Keyboard shortcuts**: none added in this scope.

## Persistence

- `save2Local` → workspaces blob already serializes entire `editorData` → automatic
- `save2Cloud` → `/coloring/shared-pages/` POST/PUT payload built in `saveNow()` (lines 301–313). Add `gridMode` and `gridCell` (or wrap in `meta` per backend verification step above)
- `load()` applies defaults when fields absent (back-compat with old pages)
- Undo/redo: cell size changes pushed via `saveState()`; mode cycle does not (intentional)

## Testing plan

No test framework. Manual verification on `bun dev`:

1. Fresh canvas — cycle grid: square → iso → off → square (checkerboard / diamond / plain)
2. Set cell 4×2, 8×4 → diamonds resize correctly
3. Set cell 1×1 → degenerate-but-valid grid renders
4. Draw iso-line in each of 4 directions → stair-step pattern matches slope
5. Mirror horizontal + iso-line → mirror works
6. Selection bound + iso-line → pixels outside bound dropped
7. Undo iso-line → reverts; redo restores
8. Save → reload page → grid mode + cell + iso pixels persist (local)
9. Resize canvas → iso overlay redraws, art unchanged
10. Old saved art (no `gridMode`) → loads as `square` mode

UI/feature correctness verified in browser, not by type check alone.

## File touchpoints

| File | Change |
|---|---|
| [`app/types/index.ts`](../../../app/types/index.ts) | Add `gridMode`, `gridCell` to `EditorData` |
| [`app/helper/constants.ts`](../../../app/helper/constants.ts) | Defaults in `DEFAULT_EDITOR_DATA` |
| [`app/helper/canvas.ts`](../../../app/helper/canvas.ts) | Add `drawIsoGrid` helper |
| [`app/stores/editor.store.ts`](../../../app/stores/editor.store.ts) | Add grid state, `cycleGridMode`, `setGridCell`, `paintIsoLine`; wire iso-line into `paint`/tool flow |
| [`app/components/PXEditor.vue`](../../../app/components/PXEditor.vue) | Toolbar cycle button, cell inputs, sidebar iso-line button, `drawIsoOverlay()` call, cursor CSS |

Approx LOC: +180 / -20.

## Risks

1. **Backend payload schema** — if `/coloring/shared-pages/` rejects unknown fields, must use `meta` path. **Mitigation:** check API behavior in first implementation step before deep work.
2. **Icon availability** — `icon-grid-iso` / `icon-line` may not exist in the custom icon set. **Mitigation:** CSS rotate fallback, brush icon fallback.
3. **Mini-map clarity** — explicitly not drawing iso overlay on minimap keeps it readable.
