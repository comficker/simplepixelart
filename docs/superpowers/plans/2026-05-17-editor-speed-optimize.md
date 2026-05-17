# Editor Speed Optimize Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make pixel-art editor smooth (~60fps target) up to 128×128 canvas by memoizing pixel-map composition, batching paints to RAF, caching the iso lattice path, and replacing recursive flood-fill with an iterative stack.

**Architecture:** Five surgical wins, all hot-path. No data-structure changes, no rendering rewrite. Cache `layers2MapNumbers` per-frame via a `drawTurn`-keyed memo; route every `drawEditor()` / `drawMiniMap()` call through `requestAnimationFrame`; cache the iso lattice as a `Path2D` keyed by `(cellW, cellH, zoom, artW, artH)`; rewrite `bucketFill` as a queue-based iterative fill.

**Tech Stack:** Nuxt 4, Vue 3 `<script setup>`, Pinia, TypeScript, HTML5 Canvas 2D + `Path2D`. Package manager: `bun`. No test framework — verification via `bun dev` + DevTools Performance recording.

**Spec:** [`docs/superpowers/specs/2026-05-17-editor-speed-optimize-design.md`](../specs/2026-05-17-editor-speed-optimize-design.md)

**Run during work:**
- Dev server: `cd simplepixelart/simplepixelart_web && bun dev` → `/editor`
- Build: `bun run build`

**Working directory for all paths:** `/Users/hoanganhlam/projects/ninosaur/simplepixelart/simplepixelart_web`

**Conventions:**
- Source root: `app/` (Nuxt 4)
- No new files needed
- Commit per task; do not push (per repo convention)

---

## File Structure

| File | Change |
|---|---|
| `app/helper/canvas.ts` | Add `buildIsoPath` export; refactor `drawIsoGrid` to delegate to it |
| `app/stores/editor.store.ts` | `setPixelByIndex` bumps `drawTurn`; iterative `bucketFill`; bump `drawTurn` at end of `paintIsoLine` and `mergeVirtualLayer` |
| `app/components/PXEditor.vue` | RAF batch helpers + lifecycle cleanup; replace ~13 `drawEditor`/`drawMiniMap` call sites; `getPixelMap` cache; `getIsoPath` cache; `drawIsoOverlay` refactored to use cache |

No new files.

---

## Task 1: `helper/canvas.ts` — extract `buildIsoPath`

**Files:**
- Modify: `app/helper/canvas.ts` (end of file — the existing `drawIsoGrid` export)

This task makes the iso lattice path-buildable into an external `Path2D`. The signature is the prerequisite for Task 6's cache.

- [ ] **Step 1: Read the current `drawIsoGrid`**

Open `app/helper/canvas.ts`. Locate the existing `export function drawIsoGrid(...)` at the bottom of the file. Note its signature:

```typescript
export function drawIsoGrid(
    ctx: CanvasRenderingContext2D,
    ox: number, oy: number,
    zoom: number,
    artW: number, artH: number,
    cellW: number, cellH: number,
    color: string,
): void
```

The function clips to the art rect, then builds + strokes the diamond lattice inline.

- [ ] **Step 2: Replace `drawIsoGrid` with the split form**

Replace the entire existing `drawIsoGrid` function block with these TWO exports:

```typescript
/**
 * Builds the iso diamond lattice into the given `Path2D`. Path coordinates
 * are in canvas pixels relative to (0, 0) — callers translate to artOffset
 * before stroking. Caller is responsible for any clipping.
 *
 * Guards: returns without writing if cellW<1, cellH<1, or art smaller than cell.
 */
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

    const artPxW = artW * zoom;
    const artPxH = artH * zoom;

    const halfW = cellW * zoom / 2;
    const halfH = cellH * zoom / 2;
    const stepX = cellW * zoom;
    const stepY = cellH * zoom / 2;

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

/**
 * Renders the iso diamond grid by building a fresh Path2D each call. Kept
 * for callers that don't cache. PXEditor uses a cached path instead.
 */
export function drawIsoGrid(
    ctx: CanvasRenderingContext2D,
    ox: number,
    oy: number,
    zoom: number,
    artW: number,
    artH: number,
    cellW: number,
    cellH: number,
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

Key changes vs old `drawIsoGrid`:

- Added `ctx.translate(ox, oy)` before stroking. The path is now (0,0)-relative.
- All lattice math moved to `buildIsoPath`.
- Stroke path style + width applied AFTER `translate` (was on `ctx` before).

The visual output stays identical.

- [ ] **Step 3: Build**

```bash
cd /Users/hoanganhlam/projects/ninosaur/simplepixelart/simplepixelart_web && bun run build
```

Expected: `✨ Build complete!`. Any TS error means a typo in the new signatures.

- [ ] **Step 4: Dev boot sanity**

```bash
cd /Users/hoanganhlam/projects/ninosaur/simplepixelart/simplepixelart_web && (bun dev 2>&1 & PID=$!; sleep 8; kill $PID 2>/dev/null; wait 2>/dev/null) | tail -15
```

Expected: clean boot.

- [ ] **Step 5: Commit**

```bash
cd /Users/hoanganhlam/projects/ninosaur/simplepixelart/simplepixelart_web
git add app/helper/canvas.ts
git commit -m "refactor(canvas): split drawIsoGrid into buildIsoPath + thin wrapper

Path builder is now reusable by callers that cache the iso lattice.
drawIsoGrid keeps its same signature and renders identical output."
```

---

## Task 2: Store — `setPixelByIndex` bumps `drawTurn` + audit gaps

**Files:**
- Modify: `app/stores/editor.store.ts:381-387` (`setPixelByIndex`), `paintIsoLine` end (~line 603), `mergeVirtualLayer` end (~line 733)

Goal: every pixel mutation increments `drawTurn` so a downstream pixel-map memo (Task 5) cannot serve stale data.

- [ ] **Step 1: Bump `drawTurn` inside `setPixelByIndex`**

Find `setPixelByIndex` at line 381. Current body:

```typescript
function setPixelByIndex(x: number, y: number, paletteIndex: number): void {
    if (paletteIndex === -1) {
        delete editorData.value.layers[currentLayerIndex.value]!.pixels[`${x}_${y}`]
    } else {
        editorData.value.layers[currentLayerIndex.value]!.pixels[`${x}_${y}`] = paletteIndex;
    }
}
```

Replace with:

```typescript
function setPixelByIndex(x: number, y: number, paletteIndex: number): void {
    if (paletteIndex === -1) {
        delete editorData.value.layers[currentLayerIndex.value]!.pixels[`${x}_${y}`]
    } else {
        editorData.value.layers[currentLayerIndex.value]!.pixels[`${x}_${y}`] = paletteIndex;
    }
    drawTurn.value++;
}
```

This covers `paint`, `bucketFill`, and any other call that goes through `setPixelByIndex`.

- [ ] **Step 2: Bump `drawTurn` at end of `paintIsoLine`**

Find `paintIsoLine` (around line 560). Locate its closing `}` (the function body ends around line 603 — after the inner `for (let r = 0; r < cellH - 1; r++)` loop and its surrounding `for (let c = 1; c <= k; c++)` loop close).

Before the function's final closing `}`, add:

```typescript
        drawTurn.value++;
```

The complete tail of the function should read:

```typescript
            for (let r = 0; r < cellH - 1; r++) {
                writeVirtualPixel(prevTreadEndX, riserStartY + sy * r, colorIndex);
            }
        }
        drawTurn.value++;
    }
```

`writeVirtualPixel` directly mutates `virtualLayer.pixels` without going through `setPixelByIndex`, so this bump is the invalidation point for virtual-layer writes during iso-line preview.

- [ ] **Step 3: Bump `drawTurn` at end of `mergeVirtualLayer`**

Find `mergeVirtualLayer` (around line 733). Locate its closing `}`. Current end:

```typescript
function mergeVirtualLayer() {
    Object.keys(virtualLayer.value.pixels).forEach((key) => {
        const {x, y} = key2Point(key)
        const newKey = `${x + virtualLayer.value.x}_${y + virtualLayer.value.y}`;
        editorData.value.layers[currentLayerIndex.value]!.pixels[newKey] = virtualLayer.value.pixels[key] ?? -1;
    })
    editorData.value.layers.splice(currentLayerIndex.value + 1, 1);
    virtualLayer.value.pixels = {}
    virtualLayer.value.x = 0
    virtualLayer.value.y = 0
}
```

Add `drawTurn.value++;` as the last line before the closing brace:

```typescript
function mergeVirtualLayer() {
    Object.keys(virtualLayer.value.pixels).forEach((key) => {
        const {x, y} = key2Point(key)
        const newKey = `${x + virtualLayer.value.x}_${y + virtualLayer.value.y}`;
        editorData.value.layers[currentLayerIndex.value]!.pixels[newKey] = virtualLayer.value.pixels[key] ?? -1;
    })
    editorData.value.layers.splice(currentLayerIndex.value + 1, 1);
    virtualLayer.value.pixels = {}
    virtualLayer.value.x = 0
    virtualLayer.value.y = 0
    drawTurn.value++;
}
```

`mergeVirtualLayer` direct-writes the destination pixels map (bypassing `setPixelByIndex`), so the bump is needed.

- [ ] **Step 4: Build to typecheck**

```bash
cd /Users/hoanganhlam/projects/ninosaur/simplepixelart/simplepixelart_web && bun run build
```

Expected: clean.

- [ ] **Step 5: Dev boot sanity**

```bash
cd /Users/hoanganhlam/projects/ninosaur/simplepixelart/simplepixelart_web && (bun dev 2>&1 & PID=$!; sleep 8; kill $PID 2>/dev/null; wait 2>/dev/null) | tail -15
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
cd /Users/hoanganhlam/projects/ninosaur/simplepixelart/simplepixelart_web
git add app/stores/editor.store.ts
git commit -m "perf(editor): bump drawTurn on every pixel mutation

setPixelByIndex now bumps drawTurn, covering paint/bucketFill paths.
paintIsoLine and mergeVirtualLayer bump explicitly because they
mutate pixels directly (via writeVirtualPixel / direct merge writes).

Enables a drawTurn-keyed pixel-map memo in the renderer (next task)."
```

---

## Task 3: Store — iterative `bucketFill`

**Files:**
- Modify: `app/stores/editor.store.ts:605-614` (`bucketFill`)

- [ ] **Step 1: Replace `bucketFill` body**

Find `bucketFill` at line 605. Current body:

```typescript
function bucketFill(x: number, y: number, rootColorIndex: number): void {
    if (!checkKeyInSelection(`${x}_${y}`)) return;
    const positionColorIndex = editorData.value.layers[currentLayerIndex.value]!.pixels[`${x}_${y}`] ?? -1;
    if (positionColorIndex === currentColorIndex.value || rootColorIndex !== positionColorIndex) return;
    setPixelByIndex(x, y, currentColorIndex.value);
    bucketFill(x + 1, y, rootColorIndex);
    bucketFill(x - 1, y, rootColorIndex);
    bucketFill(x, y + 1, rootColorIndex);
    bucketFill(x, y - 1, rootColorIndex);
}
```

Replace entire function with:

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

Behavior parity notes:

- Empty selection → `checkKeyInSelection` returns true (current behavior); fill spreads everywhere within canvas bounds.
- Same target color as start → early `return` (parity with old `positionColorIndex === currentColorIndex.value` guard for the first cell, generalized).
- Each filled cell now checks `(cur !== rootColorIndex)` after popping — same logic as the old recursive guard, but evaluated iteratively.
- Bounds check (`cx < 0 || cx >= W ...`) is new but harmless: the old recursion silently grew off-canvas before the `checkKeyInSelection` short-circuit; both terminate, the new code is faster.

The bump to `drawTurn` happens inside `setPixelByIndex` (Task 2), so the cache invalidates after each filled pixel — RAF batching (Task 4) coalesces.

- [ ] **Step 2: Build**

```bash
cd /Users/hoanganhlam/projects/ninosaur/simplepixelart/simplepixelart_web && bun run build
```

Expected: clean.

- [ ] **Step 3: Dev boot sanity**

```bash
cd /Users/hoanganhlam/projects/ninosaur/simplepixelart/simplepixelart_web && (bun dev 2>&1 & PID=$!; sleep 8; kill $PID 2>/dev/null; wait 2>/dev/null) | tail -15
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
cd /Users/hoanganhlam/projects/ninosaur/simplepixelart/simplepixelart_web
git add app/stores/editor.store.ts
git commit -m "perf(editor): iterative bucketFill — remove stack overflow risk

Replaces recursive 4-way flood fill with an explicit array-based
stack. Identical fill semantics; safe up to 128×128 uniform regions
which would previously exceed JS recursion limits."
```

---

## Task 4: PXEditor — `scheduleDraw` + `scheduleMiniMap` RAF batch

**Files:**
- Modify: `app/components/PXEditor.vue` — script section (add refs + helpers + onUnmounted), call-site replacements (`drawEditor()` / `drawMiniMap()`)

This task coalesces multiple paints per frame into one RAF tick. It does NOT change rendering output.

- [ ] **Step 1: Add RAF state refs and helpers**

Open `app/components/PXEditor.vue`. After the `editorData` computed (around line 152), add:

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

function cancelScheduledDraw() {
  if (drawRafId !== null) {
    cancelAnimationFrame(drawRafId);
    drawRafId = null;
  }
}
```

Note: `drawEditor` and `drawMiniMap` are function declarations defined later in the same `<script setup>` block. JavaScript hoists function declarations, so referencing them from the RAF callback is fine even though the helpers appear earlier in the source.

- [ ] **Step 2: Wire onUnmounted cleanup**

Find the existing `onUnmounted` block (around line 770). Currently it reads:

```typescript
onUnmounted(() => {
  store.resetEditorData()
  clearListeners()
})
```

Change to:

```typescript
onUnmounted(() => {
  if (drawRafId !== null) cancelAnimationFrame(drawRafId);
  if (miniMapRafId !== null) cancelAnimationFrame(miniMapRafId);
  store.resetEditorData()
  clearListeners()
})
```

- [ ] **Step 3: Replace `drawEditor()` call sites**

Audit and replace these specific lines (search for `drawEditor()` to confirm — line numbers may shift between commits but the call-site contexts are unique):

| Function / context | Current line approx. | Replace `drawEditor()` with |
|---|---|---|
| `centerView` body (line ~192 within `setZoom` or related) | as found | `scheduleDraw()` |
| `setZoom` body (line ~230) | end of fn | `scheduleDraw()` |
| `startDraw` body (line ~294) | near end | `scheduleDraw()` |
| `draw` body (line ~335) | near end | `scheduleDraw()` |
| `stopDraw` body (line ~361) | end of fn | **keep sync** `drawEditor()` AND add `cancelScheduledDraw()` BEFORE it (so any pending RAF doesn't double-paint after the sync final paint) |
| `importReferenceImage` callback (line ~690) | inside img.onload | `scheduleDraw()` |
| `toggleReference` body (line ~701) | end of fn | `scheduleDraw()` |
| `clearReference` body (line ~706) | end of fn | `scheduleDraw()` |
| `watch(() => store.drawTurn)` callback (line ~777) | body | `scheduleDraw()` |
| Template: `@click="store.cycleGridMode(); drawEditor()"` (toolbar grid cycle, line ~854) | inline | `@click="store.cycleGridMode(); scheduleDraw()"` |
| Template: `@change=" ... drawEditor()"` cell width input (line ~866) | inline | `... scheduleDraw()` |
| Template: `@change=" ... drawEditor()"` cell height input (line ~875) | inline | `... scheduleDraw()` |

**Do NOT replace** `drawEditor()` at line 672 (inside `setupCanvas` — the initial paint must be synchronous so users see the canvas before any reactive updates fire).

For `stopDraw` specifically, the modification looks like (showing only the final block of the function):

```typescript
  if (needSave.value) store.saveState();
  needSave.value = false;
  cancelScheduledDraw();
  drawEditor();
  isStarted.value = false;
}
```

(Previously `drawEditor()` was the only call; now `cancelScheduledDraw()` runs first.)

- [ ] **Step 4: Replace `drawMiniMap()` / `@scroll` call sites**

Two changes:

1. Find `function pan(e: any)` (around line 374). It contains `drawMiniMap();` near line 384. Change to `scheduleMiniMap();`.

2. In the template (around line 933 — the `canvas-container` div), find `@scroll="drawMiniMap"` and change to `@scroll="scheduleMiniMap"`.

**Do NOT replace** `drawMiniMap()` inside `drawEditor` (line ~605) — that call sits inside the already-batched paint path, so further batching is redundant and harmless but wasteful.

- [ ] **Step 5: Build**

```bash
cd /Users/hoanganhlam/projects/ninosaur/simplepixelart/simplepixelart_web && bun run build
```

Expected: clean. TS errors here usually mean a missing call-site replacement (e.g., `scheduleDraw` referenced where you typed it but `drawEditor` still around the same area).

- [ ] **Step 6: Dev boot sanity**

```bash
cd /Users/hoanganhlam/projects/ninosaur/simplepixelart/simplepixelart_web && (bun dev 2>&1 & PID=$!; sleep 8; kill $PID 2>/dev/null; wait 2>/dev/null) | tail -15
```

Expected: clean.

- [ ] **Step 7: Commit**

```bash
cd /Users/hoanganhlam/projects/ninosaur/simplepixelart/simplepixelart_web
git add app/components/PXEditor.vue
git commit -m "perf(editor): RAF-batch drawEditor and drawMiniMap

Mouse / touch / scroll events fire 100-200Hz; cap paint at 60Hz via
scheduleDraw / scheduleMiniMap. stopDraw cancels pending RAF and
paints sync so final stroke commits immediately. Initial canvas
setup paint stays sync."
```

---

## Task 5: PXEditor — `getPixelMap` cache

**Files:**
- Modify: `app/components/PXEditor.vue` — add `getPixelMap` closure and replace 2 call sites in `drawPixels` + `drawMiniMap`

- [ ] **Step 1: Add the pixel-map cache helpers**

In `PXEditor.vue`'s `<script setup>` block, immediately after the RAF state refs (added in Task 4 step 1, around line 154), add:

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

The cache lives in closure scope (per `PXEditor` instance), invalidates when `store.drawTurn` advances. Task 2's drawTurn-bumps guarantee correctness.

- [ ] **Step 2: Replace `layers2MapNumbers(...)` call in `drawPixels`**

Find `drawPixels` (around line 528). Current body:

```typescript
function drawPixels(): void {
  if (!ctx) return;
  const ox = artOffset.value.x;
  const oy = artOffset.value.y;
  const results = layers2MapNumbers(editorData.value);
  for (const [key, pixelIndex] of Object.entries(results)) {
    const [x = 0, y = 0] = key.split('_').map(Number);
    ctx.fillStyle = editorData.value.colors[pixelIndex] ?? '#000000';
    ctx.fillRect(ox + x * zoom.value, oy + y * zoom.value, zoom.value, zoom.value);
  }
}
```

Change one line — replace `const results = layers2MapNumbers(editorData.value);` with:

```typescript
  const results = getPixelMap();
```

Full body now reads:

```typescript
function drawPixels(): void {
  if (!ctx) return;
  const ox = artOffset.value.x;
  const oy = artOffset.value.y;
  const results = getPixelMap();
  for (const [key, pixelIndex] of Object.entries(results)) {
    const [x = 0, y = 0] = key.split('_').map(Number);
    ctx.fillStyle = editorData.value.colors[pixelIndex] ?? '#000000';
    ctx.fillRect(ox + x * zoom.value, oy + y * zoom.value, zoom.value, zoom.value);
  }
}
```

- [ ] **Step 3: Replace `layers2MapNumbers(...)` call in `drawMiniMap`**

Find `drawMiniMap` (around line 608). Inside its body there is a `const results = layers2MapNumbers(editorData.value);` line. Replace with:

```typescript
  const results = getPixelMap();
```

(`drawMiniMap` is long, but only this one line changes — keep the rest of the function intact.)

- [ ] **Step 4: Build**

```bash
cd /Users/hoanganhlam/projects/ninosaur/simplepixelart/simplepixelart_web && bun run build
```

Expected: clean.

- [ ] **Step 5: Dev boot + manual smoke**

```bash
cd /Users/hoanganhlam/projects/ninosaur/simplepixelart/simplepixelart_web && (bun dev 2>&1 & PID=$!; sleep 8; kill $PID 2>/dev/null; wait 2>/dev/null) | tail -15
```

Expected: clean. If you open `/editor` in a browser:
- Brush draw → pixels appear as before (memo correctly invalidates).
- Mini-map mirrors brush in real time.
- Undo / redo → state visually reverts.

If pixels don't appear or get "stuck", the memo is over-caching — `drawTurn` isn't being bumped on some mutation path; cross-reference Task 2's audit.

- [ ] **Step 6: Commit**

```bash
cd /Users/hoanganhlam/projects/ninosaur/simplepixelart/simplepixelart_web
git add app/components/PXEditor.vue
git commit -m "perf(editor): memoize layers2MapNumbers per frame via drawTurn key

drawPixels and drawMiniMap now share one composition per drawTurn
instead of re-composing layers twice per frame. Cache invalidates
when any pixel mutation bumps drawTurn (Task 2 audit guarantees)."
```

---

## Task 6: PXEditor — `getIsoPath` cache + `drawIsoOverlay` refactor

**Files:**
- Modify: `app/components/PXEditor.vue` — import `buildIsoPath` (was just `drawIsoGrid`), add `getIsoPath` cache, refactor `drawIsoOverlay`

- [ ] **Step 1: Update the canvas import**

Find the import at line 3 (currently):

```typescript
import {drawIsoGrid, drawThumbnail, editorDataToJSON, editorDataToSVG, layers2MapNumbers} from "~/helper/canvas";
```

Change to:

```typescript
import {buildIsoPath, drawThumbnail, editorDataToJSON, editorDataToSVG, layers2MapNumbers} from "~/helper/canvas";
```

The cached path approach in `PXEditor.vue` no longer needs `drawIsoGrid` — it builds a `Path2D` directly via `buildIsoPath`. The `drawIsoGrid` export still exists in `canvas.ts` for other potential callers.

- [ ] **Step 2: Add the iso path cache**

In `<script setup>`, immediately after the pixel-map cache helpers from Task 5 (around line 165), add:

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

The key encodes every input to `buildIsoPath`. Steady-state during brush drag: zoom + W + H + cell unchanged → 0 cache rebuilds.

- [ ] **Step 3: Refactor `drawIsoOverlay` to use the cache**

Find `drawIsoOverlay` (around line 581). Current body:

```typescript
function drawIsoOverlay(): void {
  if (!ctx) return;
  const iso = editorData.value.meta?.iso;
  if (!iso || iso.mode !== 'iso') return;
  drawIsoGrid(
      ctx,
      artOffset.value.x,
      artOffset.value.y,
      zoom.value,
      editorData.value.width,
      editorData.value.height,
      iso.cell.width,
      iso.cell.height,
      'rgba(0, 0, 0, 0.4)',
  );
}
```

Replace with:

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

Visual output unchanged: path coordinates are (0,0)-relative, the `ctx.translate` shifts to `artOffset` before stroking — same final pixel positions as the un-cached version produced via `drawIsoGrid(ctx, ox, oy, ...)`.

- [ ] **Step 4: Build**

```bash
cd /Users/hoanganhlam/projects/ninosaur/simplepixelart/simplepixelart_web && bun run build
```

Expected: clean. If TS complains that `drawIsoGrid` is no longer imported but is referenced somewhere — find the stray reference (there shouldn't be one; the only consumer was `drawIsoOverlay` which we just refactored). Either remove the stray ref or re-add `drawIsoGrid` to the import.

- [ ] **Step 5: Dev boot + visual smoke**

```bash
cd /Users/hoanganhlam/projects/ninosaur/simplepixelart/simplepixelart_web && (bun dev 2>&1 & PID=$!; sleep 8; kill $PID 2>/dev/null; wait 2>/dev/null) | tail -15
```

Expected: clean boot. In a browser:
- Cycle grid to `iso` → diamond overlay visible.
- Change cell W/H in toolbar → overlay rebuilds correctly (cache invalidates).
- Zoom in/out → overlay rescales (cache key includes zoom).
- Resize canvas via top-toolbar → overlay rebuilds.

- [ ] **Step 6: Commit**

```bash
cd /Users/hoanganhlam/projects/ninosaur/simplepixelart/simplepixelart_web
git add app/components/PXEditor.vue
git commit -m "perf(editor): cache iso lattice as Path2D keyed by zoom+art+cell

Iso grid no longer rebuilds the 8k-32k diamond lattice every frame
during paint. Cache key invalidates only on zoom / art size / cell
change — none of which happen mid-stroke."
```

---

## Task 7: Manual smoke + perf measurement

**Files:** verification only.

- [ ] **Step 1: Build clean**

```bash
cd /Users/hoanganhlam/projects/ninosaur/simplepixelart/simplepixelart_web && bun run build 2>&1 | tail -8
```

Expected: `✨ Build complete!`

- [ ] **Step 2: Full manual smoke**

Boot `bun dev`. Open `http://localhost:3000/editor`. Walk through the spec's testing plan:

1. 16×16 brush drag → smooth (regression check).
2. 64×64 brush drag → smooth.
3. 128×128 brush drag → smooth.
4. 128×128 bucket fill whole canvas → no freeze, no stack overflow.
5. Iso mode + 128² + brush → no flicker; cell W/H change rebuilds overlay.
6. Iso-line long drag → preview smooth.
7. Undo 50× then redo 50× → no growing lag.
8. Pan + scroll → mini-map updates smoothly.
9. DevTools Performance: record 5 seconds of brush drag at 128². Inspect "Scripting" time. Compare to a baseline recording from `main`. Expect ≥40% reduction.

- [ ] **Step 3: Address any deviation**

Common failure modes if a step fails:
- Pixels not updating mid-stroke → `setPixelByIndex` drawTurn bump missing or `getPixelMap` cache key check broken.
- Iso overlay missing after cell change → cache key not including the changed dimension.
- Mini-map blank → `drawMiniMap` cache call wrong.
- Stack overflow in bucket fill → iterative version regressed; re-check Task 3.

Fix as `fix(editor): ...` commits.

- [ ] **Step 4: Final commit (only if Step 3 produced fixes)**

```bash
cd /Users/hoanganhlam/projects/ninosaur/simplepixelart/simplepixelart_web
git add -A
git commit -m "fix(editor): address speed-optimize smoke-test findings"
```

If no fixes needed, this task ends without a commit.

---

## Self-Review Notes

- **Spec coverage** — Win 1 (Task 5), Win 2 (Task 4), Win 3 (Task 3), Win 4 (Tasks 1 + 6), Win 5 audit (Task 2 + per-task audit). All wins covered.
- **Placeholder scan** — every step has concrete code or grep target. The cascade ordering for cache invalidation is spelled out in Task 2's audit table.
- **Type consistency** — function names align across plan and spec: `buildIsoPath`, `drawIsoGrid`, `getPixelMap`, `getIsoPath`, `scheduleDraw`, `scheduleMiniMap`, `cancelScheduledDraw`. `setPixelByIndex` retains its signature.
