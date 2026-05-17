# Editor Speed Optimize — Hot-Path Wins

**Date:** 2026-05-17
**Scope:** SimplePixelArt web editor (`simplepixelart/simplepixelart_web`)
**Goal:** Make canvas drawing / pan / zoom smooth (~60fps target) at canvas sizes up to 128×128 by removing redundant per-frame computation and over-eager paint scheduling — no data-structure changes, no rendering rewrite.

## Problem

User reports lag with canvas ≥32×32. At 128×128 the existing hot path collapses:

- `drawPixels` calls `layers2MapNumbers(editorData)` every frame — O(N × layers) full recomputation.
- `drawMiniMap` calls `layers2MapNumbers` again the same frame → 2× the work.
- `drawEditor()` runs synchronously on every `mousemove` / `touchmove` / `scroll` event — 100-200 Hz on fast pointers.
- `drawIsoOverlay` (when iso grid is on) rebuilds the iso lattice from scratch per frame: 128² with cell 2×1 ≈ 8192 diamonds × 4 vertices = 32K ops/frame.
- `bucketFill` recurses with one stack frame per pixel; 128² uniform region risks stack overflow (~16K frames > Chrome's ~10-15K limit).

## Out of scope

- ImageData / `putImageData` fast paint path
- `pixels: {[k]: v}` → `Uint16Array` data-structure overhaul (breaks save format)
- Off-screen culling
- WebGL renderer
- Worker offload

## Approach

Five surgical wins, all in existing files. Cache aggressively, batch via RAF, replace recursion with a queue.

## Decisions (from brainstorm)

| Topic | Decision |
|---|---|
| Pain point being solved | Lag at canvas ≥32, target 128×128 smooth |
| Optimization scope | Hot-path only — no data structure change, no ImageData rewrite |
| Target max canvas | 128×128 smooth at ~60fps during brush drag |

## Win 1 — Memoize `layers2MapNumbers` (per-frame cache)

`PXEditor.vue` adds a closure-scoped cache keyed by `store.drawTurn`:

```typescript
let pixelMapCache: Record<string, number> | null = null;
let pixelMapCacheTurn = -1;

function getPixelMap(): Record<string, number> {
  if (pixelMapCacheTurn === store.drawTurn && pixelMapCache) {
    return pixelMapCache;
  }
  pixelMapCache = layers2MapNumbers(editorData.value);
  pixelMapCacheTurn = store.drawTurn;
  return pixelMapCache;
}
```

Replace the two `layers2MapNumbers(editorData.value)` call sites in `drawPixels` and `drawMiniMap` with `getPixelMap()`. Two compositions per frame → one.

**Cache invalidation:** `store.drawTurn` is the single source of truth. To make this work for mid-stroke writes (where today `paint()` does NOT increment `drawTurn`), update `setPixelByIndex` in `editor.store.ts` to bump `drawTurn.value++` at the end. Mid-stroke now naturally invalidates the cache. RAF batching (Win 2) coalesces the per-pixel increments into a single repaint per frame, so the cost of the increment is amortized.

Risk: Vue's reactivity tracks `drawTurn`; per-pixel `++` in a 128² bucket fill = 16K updates. Vue's scheduler batches sync writes into a single microtask flush, so the watcher fires once. If profiling shows hot, fallback: bump `drawTurn` once at the end of `paint` / `bucketFill` / `paintIsoLine` / `mergeVirtualLayer` instead of inside `setPixelByIndex` — but the first-pass implementation uses `setPixelByIndex` for simplicity and audit-completeness.

## Win 2 — RAF batch `drawEditor` + `drawMiniMap`

`PXEditor.vue` adds:

```typescript
let drawRafId: number | null = null;
function scheduleDraw() {
  if (drawRafId !== null) return;
  drawRafId = requestAnimationFrame(() => {
    drawRafId = null;
    drawEditor();
  });
}

let miniMapRafId: number | null = null;
function scheduleMiniMap() {
  if (miniMapRafId !== null) return;
  miniMapRafId = requestAnimationFrame(() => {
    miniMapRafId = null;
    drawMiniMap();
  });
}

onUnmounted(() => {
  if (drawRafId !== null) cancelAnimationFrame(drawRafId);
  if (miniMapRafId !== null) cancelAnimationFrame(miniMapRafId);
});
```

**Call-site replacements** in `PXEditor.vue`:

| Site | Current | New |
|---|---|---|
| `setZoom` (line ~222) | `drawEditor()` | `scheduleDraw()` |
| `startDraw` (line ~270, end of fn) | `drawEditor()` | `scheduleDraw()` |
| `draw` (line ~301) | `drawEditor()` | `scheduleDraw()` |
| `stopDraw` (line ~355, end of fn) | `drawEditor()` | **keep as `drawEditor()` (sync final commit)** — cancel pending RAF first to avoid double-paint |
| `setupCanvas` (line ~617) | `drawEditor()` | **keep sync** (initial paint) |
| `watch(store.drawTurn)` (line ~720) | `drawEditor()` | `scheduleDraw()` |
| `importReferenceImage` callback | `drawEditor()` | `scheduleDraw()` |
| `clearReference` / `toggleReference` | `drawEditor()` | `scheduleDraw()` |
| `drawBackground/showGrid` toggle (in toolbar template line ~796) | `drawEditor()` (currently no longer present after iso changes) | n/a |
| `pan` (line ~340) calls `drawMiniMap()` | `drawMiniMap()` | `scheduleMiniMap()` |
| `@scroll="drawMiniMap"` (template ~line 933) | `drawMiniMap` | `scheduleMiniMap` |

`stopDraw` sync rule: at the top of `stopDraw`, if `drawRafId !== null`, `cancelAnimationFrame(drawRafId); drawRafId = null;`. Then call `drawEditor()` directly so the final committed state lands before the user can interact again.

Expected win: 100-200 Hz mousemove → 60 Hz paint cap. 40-60% reduction in paint work during fast drag.

## Win 3 — Iterative `bucketFill`

`editor.store.ts:550`. Replace recursion with an explicit stack:

```typescript
function bucketFill(x: number, y: number, rootColorIndex: number): void {
    const target = currentColorIndex.value;
    if (target === rootColorIndex) return;
    const W = editorData.value.width;
    const H = editorData.value.height;
    const pixels = editorData.value.layers[currentLayerIndex.value]!.pixels;
    const stack: Array<[number, number]> = [[x, y]];
    while (stack.length) {
        const [cx, cy] = stack.pop()!;
        if (cx < 0 || cx >= W || cy < 0 || cy >= H) continue;
        if (!checkKeyInSelection(`${cx}_${cy}`)) continue;
        const cur = pixels[`${cx}_${cy}`] ?? -1;
        if (cur !== rootColorIndex) continue;
        setPixelByIndex(cx, cy, target);
        stack.push([cx + 1, cy]);
        stack.push([cx - 1, cy]);
        stack.push([cx, cy + 1]);
        stack.push([cx, cy - 1]);
    }
}
```

The previous early-return on `target === rootColorIndex` matches the existing function's behavior. The iterative version:

- Removes the stack overflow risk entirely (stack is heap-allocated).
- Same algorithmic complexity, similar runtime; slightly lower constant due to absence of recursive call overhead.
- Preserves selection bounds and per-pixel checks identically.

## Win 4 — Iso lattice path cache

Today `drawIsoGrid` (`helper/canvas.ts`) builds the entire iso lattice path inline every call. Refactor so the path can be cached.

### Helper split

Split `drawIsoGrid` in `helper/canvas.ts` into two exports:

```typescript
/** Builds the diamond lattice into `path`. Path coordinates are in canvas px,
 *  relative to (0, 0) — caller is responsible for `ctx.translate` to artOffset. */
export function buildIsoPath(
    path: Path2D,
    zoom: number,
    artW: number,
    artH: number,
    cellW: number,
    cellH: number,
): void {
    if (cellW < 1 || cellH < 1) return;
    if (artW < cellW || artH < cellH) return;

    const halfW = cellW * zoom / 2;
    const halfH = cellH * zoom / 2;
    const stepX = cellW * zoom;
    const stepY = cellH * zoom / 2;
    const artPxW = artW * zoom;
    const artPxH = artH * zoom;

    const cols = Math.ceil(artPxW / stepX) + 2;
    const rows = Math.ceil(artPxH / stepY) + 2;

    for (let j = -1; j < rows; j++) {
        for (let i = -1; i < cols; i++) {
            const cx = i * stepX + (j % 2 === 0 ? 0 : halfW);
            const cy = j * stepY;

            const top   = { x: Math.round(cx + halfW) + 0.5, y: Math.round(cy) + 0.5 };
            const right = { x: Math.round(cx + stepX) + 0.5, y: Math.round(cy + halfH) + 0.5 };
            const bot   = { x: Math.round(cx + halfW) + 0.5, y: Math.round(cy + cellH * zoom) + 0.5 };
            const left  = { x: Math.round(cx) + 0.5,          y: Math.round(cy + halfH) + 0.5 };

            path.moveTo(top.x, top.y);
            path.lineTo(right.x, right.y);
            path.lineTo(bot.x, bot.y);
            path.lineTo(left.x, left.y);
            path.closePath();
        }
    }
}

/** Strokes the iso grid directly. Kept for callers that don't cache. */
export function drawIsoGrid(
    ctx: CanvasRenderingContext2D,
    ox: number, oy: number,
    zoom: number,
    artW: number, artH: number,
    cellW: number, cellH: number,
    color: string,
): void {
    if (cellW < 1 || cellH < 1) return;
    if (artW < cellW || artH < cellH) return;

    ctx.save();
    ctx.beginPath();
    ctx.rect(ox, oy, artW * zoom, artH * zoom);
    ctx.clip();
    ctx.translate(ox, oy);

    const path = new Path2D();
    buildIsoPath(path, zoom, artW, artH, cellW, cellH);

    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.stroke(path);
    ctx.restore();
}
```

### Cache in PXEditor

```typescript
let isoPathCache: Path2D | null = null;
let isoCacheKey = '';

function getIsoPath(): Path2D | null {
  const iso = editorData.value.meta?.iso;
  if (!iso || iso.mode !== 'iso') return null;
  const w = editorData.value.width;
  const h = editorData.value.height;
  const key = `${iso.cell.width}_${iso.cell.height}_${zoom.value}_${w}_${h}`;
  if (isoCacheKey === key && isoPathCache) return isoPathCache;
  const path = new Path2D();
  buildIsoPath(path, zoom.value, w, h, iso.cell.width, iso.cell.height);
  isoPathCache = path;
  isoCacheKey = key;
  return path;
}
```

`drawIsoOverlay` becomes:

```typescript
function drawIsoOverlay(): void {
  if (!ctx) return;
  const path = getIsoPath();
  if (!path) return;
  const w = editorData.value.width;
  const h = editorData.value.height;
  ctx.save();
  ctx.beginPath();
  ctx.rect(artOffset.value.x, artOffset.value.y, w * zoom.value, h * zoom.value);
  ctx.clip();
  ctx.translate(artOffset.value.x, artOffset.value.y);
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
  ctx.lineWidth = 1;
  ctx.stroke(path);
  ctx.restore();
}
```

Cache invalidates only when zoom, art size, or iso cell W/H changes — none of which happen mid-stroke. Steady-state: 0 lattice ops per frame.

Need to import `buildIsoPath` alongside `drawIsoGrid` in `PXEditor.vue`.

## Win 5 — Audit `drawTurn` invalidation paths

To guarantee the pixel-map cache (Win 1) cannot serve stale data, every pixel mutation must bump `drawTurn`. After Win 1 puts the bump inside `setPixelByIndex`, audit every direct mutation of `layers[*].pixels` or `virtualLayer.pixels` in `editor.store.ts`:

| Mutator | Goes through `setPixelByIndex`? | Action |
|---|---|---|
| `paint` | yes | OK |
| `bucketFill` | yes | OK |
| `paintIsoLine` → `writeVirtualPixel` | NO — direct `.pixels[...] = ` | Bump `drawTurn` at end of `paintIsoLine`, or have `writeVirtualPixel` bump too |
| `mergeVirtualLayer` | NO — direct merge writes | Bump at end of fn |
| `move` | NO — sets `virtualLayer.x/.y` (no pixel writes) | OK (no cache change) |
| `immigrateVirtualLayer` → calls `clearCurrentLayer` | yes (via cleared map) | bump at end of `clearCurrentLayer` |
| `clearCurrentLayer` | NO — bulk delete via `getContentInBound(isClear=true)` | Bump at end of `saveState` (already called by `clearCurrentLayer`) — `saveState` bumps `drawTurn`; OK |
| `flipSelectionHorizontal` / `Vertical` | NO — rebuilds whole pixels map | Bump at end of fn (already calls `saveState` → OK) |
| `removeColor` / `cleanupUnusedColors` | NO — direct manipulation | `saveState` is called → OK |
| `deletePixelsByColor` | NO — `delete pixels[key]` | Calls `saveState` only if hasChange → OK |
| `loadFromFile` | NO — direct assignment | bumps `drawTurn` (line 182 of store) — OK |
| Import JSON in `importImage` | NO — direct replace of editorData | `saveState` called → OK |

The audit:
- Add `drawTurn.value++` at end of `paintIsoLine` (covers `writeVirtualPixel` paths).
- Add `drawTurn.value++` at end of `mergeVirtualLayer`.

Everything else either goes through `setPixelByIndex` or already calls `saveState` (which bumps `drawTurn`).

## Testing plan

No test framework — manual on `bun dev`. Verify:

1. **Baseline regression**: 16×16 + brush drag = smooth (matches today).
2. **64×64 + brush drag** = smooth, no perceptible lag.
3. **128×128 + brush drag** ≥ 50fps in DevTools Performance recording. Script-time per frame < 8ms.
4. **128×128 + bucket fill whole canvas** = no freeze, no console errors, no stack overflow.
5. **Iso mode + 128×128 + brush drag** = smooth; iso overlay does not flicker; cell W/H change rebuilds overlay correctly.
6. **Iso-line tool**, long drag across canvas = preview keeps up.
7. **Undo 50× then redo 50×** = no growing lag.
8. **Pan + scroll** = mini-map updates smoothly without jank.
9. **DevTools Performance recording** of a 5-second brush drag on 128² canvas — compare script time vs `main` branch. Expect ≥ 40% reduction.

## File touchpoints

| File | Change |
|---|---|
| `app/helper/canvas.ts` | Add `buildIsoPath` export; refactor `drawIsoGrid` to delegate to it |
| `app/stores/editor.store.ts` | `setPixelByIndex` bumps `drawTurn`; iterative `bucketFill`; bump `drawTurn` at end of `paintIsoLine` + `mergeVirtualLayer` |
| `app/components/PXEditor.vue` | Add `getPixelMap` cache, `scheduleDraw`/`scheduleMiniMap` + RAF lifecycle, `getIsoPath` cache; replace ~12 `drawEditor()` / `drawMiniMap()` call sites |

Approx LOC: +180 / -60.

## Risks

1. **Per-pixel `drawTurn` bump** triggers Vue reactivity. Vue's scheduler batches sync writes, but in the unlikely event of measurable overhead, fallback: move the bump out of `setPixelByIndex` and into the calling action (one bump per tool stroke).
2. **`Path2D` browser support**: Chrome 36+, Safari 11+, Firefox 31+. Project requires modern browsers (Nuxt 4, ES modules). No fallback path.
3. **RAF / `stopDraw` race**: `stopDraw` cancels pending RAF and paints sync. If a `mousedown` fires during the cancel + sync paint, ordering guaranteed correct because mousedown handler triggers another `scheduleDraw` AFTER the sync paint completes.
4. **`setPixelByIndex` semantics**: callers expect a void return. Bumping `drawTurn` does not change the function signature.
5. **Iso cache invalidation completeness**: cache key includes zoom, art W, art H, cell W, cell H. Anything else that affects the lattice? The lattice depends only on those five — confirmed by reading `drawIsoGrid` algorithm.
