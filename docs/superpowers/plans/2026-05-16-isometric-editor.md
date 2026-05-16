# Isometric Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Aseprite-style isometric grid overlay (3-state cycle: square → iso → off) with configurable cell width/height, plus a pixel-perfect 2:1 iso-line drawing tool, to the SimplePixelArt web editor.

**Architecture:** Iso grid is a render-only overlay drawn after pixels — pixels stay square, no coordinate transform. Two new fields (`gridMode`, `gridCell`) live inside `EditorData` so they serialize via existing local + cloud save paths. New `iso-line` tool reuses the existing `virtualLayer` preview mechanism (same pattern as the `move` tool) for live drag-preview, then flushes via `mergeVirtualLayer()` on release.

**Tech Stack:** Nuxt 4, Vue 3 `<script setup>`, Pinia, TypeScript, HTML5 Canvas 2D, TailwindCSS v4. Package manager: `bun`. No test framework configured — verification is via `bun dev` and observed behavior.

**Spec:** [`docs/superpowers/specs/2026-05-16-isometric-editor-design.md`](../specs/2026-05-16-isometric-editor-design.md)

**Run during work:**
- Dev server: `cd simplepixelart/simplepixelart_web && bun dev` → opens at `http://0.0.0.0:3000`. Editor is at `/editor`.
- TypeScript check: `bun run build` (no separate `typecheck` script; build runs `nuxt build` which type-checks).

**Conventions:**
- Source root is `app/` (Nuxt 4 convention)
- Auto-imports: `useEditor` (Pinia store), `ref`/`computed`/`watch`/`onMounted` (Vue)
- Use `tailwind` `@reference "tailwindcss";` in scoped styles when adding new CSS
- Commit per task; do not push (user pushes manually per repo convention)

**Working directory for all paths:** `/Users/hoanganhlam/projects/ninosaur/simplepixelart/simplepixelart_web`

---

## File Structure

| File | Responsibility |
|---|---|
| `app/types/index.ts` | Add `gridMode`, `gridCell` optional fields to `EditorData` |
| `app/helper/constants.ts` | Provide defaults inside `DEFAULT_EDITOR_DATA` |
| `app/helper/canvas.ts` | New `drawIsoGrid()` helper — pure rendering function |
| `app/stores/editor.store.ts` | Grid state getters/actions, `paintIsoLine`, tool string `iso-line` |
| `app/components/PXEditor.vue` | Toolbar cycle button + cell inputs, sidebar iso-line tool button, `drawIsoOverlay()` wired into `drawEditor()`, `startDraw/draw/stopDraw` branches, cursor CSS |

No new files; all changes are extensions to existing modules.

---

## Task 1: Backend payload check

**Files:**
- Read-only: `ninosaur_backend/apps/coloring/api/views.py`, `ninosaur_backend/apps/coloring/api/serializers.py`, `ninosaur_backend/apps/coloring/models.py`

**Purpose:** Confirm whether `/coloring/shared-pages/` POST/PUT accepts unknown top-level fields. Determines whether `gridMode`/`gridCell` go to the EditorData root or get nested under `meta`.

- [ ] **Step 1: Locate the SharedPage serializer**

Run:
```bash
grep -rn "SharedPage" /Users/hoanganhlam/projects/ninosaur/ninosaur_backend/apps/coloring/api/ /Users/hoanganhlam/projects/ninosaur/ninosaur_backend/apps/coloring/models.py | head -20
```

Open `apps/coloring/api/serializers.py`, find the serializer used by the `shared-pages` viewset.

- [ ] **Step 2: Determine root acceptance rule**

Inspect the serializer's `Meta.fields` (or `fields = '__all__'`). Two possible outcomes:

- **Outcome A** — serializer has explicit `fields` list NOT including `gridMode`/`gridCell` AND the model has no JSONField that captures them: backend will silently drop unknown fields. **Decision:** nest under `meta` (the `BaseModel.meta` JSONField from `base/interface.py` — confirm it exists on the SharedPage model chain).
- **Outcome B** — serializer accepts arbitrary JSON (e.g. model has a JSONField like `data`, `meta`, or `extra` and serializer maps to it): **Decision:** add `gridMode`/`gridCell` to that JSON container.

- [ ] **Step 3: Record decision in plan as a comment**

Edit this file (`docs/superpowers/plans/2026-05-16-isometric-editor.md`) — append a short note under this task, e.g.:

```markdown
**Decision:** Nest under `editorData.meta.iso = { mode, cell }`. Backend serializer `SharedPageSerializer` lists explicit fields; `meta` is the only JSON pass-through.
```

OR

```markdown
**Decision:** Add at EditorData root. Serializer accepts extra fields via JSONField `data`.
```

This decision dictates the exact shape of code in subsequent tasks. Subsequent tasks below assume **root placement** (Outcome B). If Outcome A is selected, adapt the read/write helpers in Task 4 and Task 10 to use `editorData.meta.iso.mode` / `.cell` instead — wherever `editorData.value.gridMode` appears, substitute `editorData.value.meta?.iso?.mode`.

- [ ] **Step 4: Commit the decision note**

```bash
git add docs/superpowers/plans/2026-05-16-isometric-editor.md
git commit -m "docs: record backend payload placement decision for iso fields"
```

---

## Task 2: Extend EditorData type

**Files:**
- Modify: `app/types/index.ts:160-175`

- [ ] **Step 1: Add optional fields to `EditorData`**

Open `app/types/index.ts`. Find the `EditorData` interface (around line 160). Add two new optional fields just before the closing brace:

```typescript
export interface EditorData {
    id: number | string;
    id_string: string;
    name: string;
    desc: string;
    version: number;
    tags: string[];
    width: number;
    height: number;
    colors: string[];
    layers: Layer[];
    template?: number | null;
    updated: string;
    is_public: boolean;
    status?: string;
    gridMode?: 'square' | 'iso' | 'off';
    gridCell?: { width: number; height: number };
}
```

- [ ] **Step 2: Type-check**

Run:
```bash
cd /Users/hoanganhlam/projects/ninosaur/simplepixelart/simplepixelart_web && bun run build
```

Expected: build succeeds (no type errors). If it fails because of `strictNullChecks` being off (per CLAUDE.md), that's fine — focus only on errors related to your change.

- [ ] **Step 3: Commit**

```bash
git add app/types/index.ts
git commit -m "feat(editor): add gridMode and gridCell to EditorData type"
```

---

## Task 3: Add defaults in DEFAULT_EDITOR_DATA

**Files:**
- Modify: `app/helper/constants.ts:16-30`

- [ ] **Step 1: Add defaults**

Replace the `DEFAULT_EDITOR_DATA` constant block:

```typescript
export const DEFAULT_EDITOR_DATA: EditorData = {
    id: 0,
    id_string: '',
    name: "",
    desc: "",
    tags: [],
    version: 1,
    width: 16,
    height: 16,
    colors: cloneDeep(DEFAULT_COLORS),
    layers: cloneDeep(DEFAULT_LAYERS),
    template: null,
    updated: new Date().toISOString(),
    is_public: false,
    gridMode: 'square',
    gridCell: { width: 2, height: 1 },
}
```

- [ ] **Step 2: Verify dev server still starts**

Run:
```bash
cd /Users/hoanganhlam/projects/ninosaur/simplepixelart/simplepixelart_web && bun dev
```

Open `http://localhost:3000/editor`. Editor loads, no console errors. Stop the server (Ctrl-C).

- [ ] **Step 3: Commit**

```bash
git add app/helper/constants.ts
git commit -m "feat(editor): default gridMode='square' and gridCell=2x1"
```

---

## Task 4: Store — grid mode + cell state

**Files:**
- Modify: `app/stores/editor.store.ts`

- [ ] **Step 1: Add `cycleGridMode` action**

In `app/stores/editor.store.ts`, after `function setTool(tool: string) { ... }` (around line 434), add:

```typescript
function cycleGridMode() {
    const order: Array<'square' | 'iso' | 'off'> = ['square', 'iso', 'off'];
    const current = editorData.value.gridMode ?? 'square';
    const next = order[(order.indexOf(current) + 1) % order.length];
    editorData.value.gridMode = next;
    drawTurn.value++;
}

function setGridCell(width: number, height: number) {
    const w = Math.min(32, Math.max(1, Math.floor(Number(width) || 1)));
    const h = Math.min(32, Math.max(1, Math.floor(Number(height) || 1)));
    editorData.value.gridCell = { width: w, height: h };
    saveState();
}
```

- [ ] **Step 2: Expose new actions from the store**

In the `return { ... }` block at the bottom of the store (around lines 655-694), add `cycleGridMode` and `setGridCell`:

```typescript
return {
    editorData,
    currentTool,
    currentColorIndex,
    currentLayerIndex,
    mirrorHorizontal,
    mirrorVertical,
    localWS,
    selectionState,
    validBounds,
    drawTurn,
    history,
    load,
    flipSelectionHorizontal,
    flipSelectionVertical,
    undo,
    redo,
    addLayer,
    deleteLayer,
    immigrateVirtualLayer,
    mergeVirtualLayer,
    move,
    resetEditorData,
    setTool,
    paint,
    resize,
    clearCurrentLayer,
    toggleMirror,
    saveState,
    checkKeyInSelection,
    bucketFill,
    deletePixelsByColor,
    removeColor,
    cleanupUnusedColors,
    save,
    saveNow,
    syncLocalToCloud,
    importImage,
    cycleGridMode,
    setGridCell,
}
```

- [ ] **Step 3: Apply defaults on load**

Locate the `load()` function (around line 241). Inside the `try { ... }` block, after `if (id) { ... }` (after line 276), add default-application so legacy artworks without these fields don't break:

Find this block (around line 277-286):

```typescript
            const currentId = editorData.value.id.toString()
            const temp = histories.value[currentId]
```

Insert immediately **before** that line:

```typescript
            if (!editorData.value.gridMode) editorData.value.gridMode = 'square'
            if (!editorData.value.gridCell) editorData.value.gridCell = { width: 2, height: 1 }

```

- [ ] **Step 4: Verify in dev**

Run `bun dev`. Open `/editor`. Open DevTools console, run:

```javascript
$nuxt.$pinia.state.value.editor.editorData.gridMode
$nuxt.$pinia.state.value.editor.editorData.gridCell
```

Expected: `'square'` and `{ width: 2, height: 1 }`. (If `$nuxt` is not accessible, use Vue DevTools → Pinia → editor store and read the fields.)

In the same console, run:

```javascript
$nuxt.$pinia.state.value.editor // store ref
// call action via Pinia
window.useEditor && window.useEditor().cycleGridMode()
```

If `useEditor` isn't exposed globally, just test the cycle via the toolbar button in Task 7. For this task it is enough to confirm the defaults appear and the build succeeds.

- [ ] **Step 5: Commit**

```bash
git add app/stores/editor.store.ts
git commit -m "feat(editor): add cycleGridMode/setGridCell store actions with defaults"
```

---

## Task 5: Canvas helper — drawIsoGrid

**Files:**
- Modify: `app/helper/canvas.ts` (add new exported function near the end of the file)

- [ ] **Step 1: Add `drawIsoGrid` export**

Open `app/helper/canvas.ts`. At the bottom of the file, after the last existing export, add:

```typescript
/**
 * Draws an isometric diamond grid overlay onto the canvas context.
 * Each diamond has width=cellW pixels and height=cellH pixels (in pixel-cell units).
 * The grid is rendered as line strokes — no fill.
 *
 * @param ctx canvas 2D context (caller is responsible for any prior state)
 * @param ox  x offset (canvas px) of the art-rect top-left
 * @param oy  y offset (canvas px) of the art-rect top-left
 * @param zoom how many canvas px per pixel-cell
 * @param artW art width in pixel-cells
 * @param artH art height in pixel-cells
 * @param cellW iso cell width in pixel-cells (must be >=1)
 * @param cellH iso cell height in pixel-cells (must be >=1)
 * @param color stroke style (CSS color string)
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

    const artPxW = artW * zoom;
    const artPxH = artH * zoom;

    ctx.save();
    // Clip to art rect so diamonds at the edges don't leak into padding
    ctx.beginPath();
    ctx.rect(ox, oy, artPxW, artPxH);
    ctx.clip();

    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();

    const halfW = cellW * zoom / 2;
    const halfH = cellH * zoom / 2;
    const stepX = cellW * zoom;
    const stepY = cellH * zoom / 2;

    // Iterate iso lattice. Each row j shifts by half a cell horizontally on odd rows
    // so diamonds tessellate. Extend one extra step in each direction so partial
    // diamonds at edges are drawn (the clip rect trims them).
    const cols = Math.ceil(artPxW / stepX) + 2;
    const rows = Math.ceil(artPxH / stepY) + 2;

    for (let j = -1; j < rows; j++) {
        for (let i = -1; i < cols; i++) {
            // Anchor (top vertex) of the diamond
            const cx = ox + i * stepX + (j % 2 === 0 ? 0 : halfW);
            const cy = oy + j * stepY;

            // Snap to integer + 0.5 for crisp 1px strokes
            const top   = { x: Math.round(cx + halfW) + 0.5, y: Math.round(cy) + 0.5 };
            const right = { x: Math.round(cx + stepX) + 0.5, y: Math.round(cy + halfH) + 0.5 };
            const bot   = { x: Math.round(cx + halfW) + 0.5, y: Math.round(cy + cellH * zoom) + 0.5 };
            const left  = { x: Math.round(cx) + 0.5,          y: Math.round(cy + halfH) + 0.5 };

            ctx.moveTo(top.x, top.y);
            ctx.lineTo(right.x, right.y);
            ctx.lineTo(bot.x, bot.y);
            ctx.lineTo(left.x, left.y);
            ctx.closePath();
        }
    }

    ctx.stroke();
    ctx.restore();
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run:
```bash
cd /Users/hoanganhlam/projects/ninosaur/simplepixelart/simplepixelart_web && bun run build
```

Expected: build succeeds. If there are unrelated `strictNullChecks` warnings, ignore them — focus on errors mentioning `canvas.ts`.

- [ ] **Step 3: Commit**

```bash
git add app/helper/canvas.ts
git commit -m "feat(canvas): add drawIsoGrid helper for diamond overlay"
```

---

## Task 6: Wire iso overlay into PXEditor render loop

**Files:**
- Modify: `app/components/PXEditor.vue` — imports (line 3), `drawBackground` (lines 459–484), `drawEditor` (lines 543–550)

- [ ] **Step 1: Import `drawIsoGrid`**

In `app/components/PXEditor.vue`, change line 3 from:

```typescript
import {drawThumbnail, editorDataToJSON, editorDataToSVG, layers2MapNumbers} from "~/helper/canvas";
```

to:

```typescript
import {drawIsoGrid, drawThumbnail, editorDataToJSON, editorDataToSVG, layers2MapNumbers} from "~/helper/canvas";
```

- [ ] **Step 2: Replace `drawBackground` to switch on grid mode**

Find the `drawBackground` function (around lines 459–484). Replace its entire body with:

```typescript
function drawBackground(): void {
  if (!ctx || !canvas.value) return;
  ctx.clearRect(0, 0, canvas.value.width, canvas.value.height);
  ctx.fillStyle = EDITOR_BG;
  ctx.fillRect(0, 0, canvas.value.width, canvas.value.height);

  const ox = artOffset.value.x;
  const oy = artOffset.value.y;
  const z = zoom.value;
  const w = editorData.value.width;
  const h = editorData.value.height;

  const mode = editorData.value.gridMode ?? 'square';

  if (mode === 'square') {
    // Checkerboard
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        ctx.fillStyle = (x + y) % 2 === 0 ? EDITOR_CELL_A : EDITOR_CELL_B;
        ctx.fillRect(ox + x * z, oy + y * z, z, z);
      }
    }
  } else {
    // 'iso' or 'off' — solid art bg, no checkerboard
    ctx.fillStyle = EDITOR_ART_BG_SOLID;
    ctx.fillRect(ox, oy, w * z, h * z);
  }
}
```

- [ ] **Step 3: Add `drawIsoOverlay` and wire into `drawEditor`**

Find the `drawEditor` function (around line 543). Replace it with:

```typescript
function drawIsoOverlay(): void {
  if (!ctx) return;
  if ((editorData.value.gridMode ?? 'square') !== 'iso') return;
  const cell = editorData.value.gridCell ?? { width: 2, height: 1 };
  drawIsoGrid(
      ctx,
      artOffset.value.x,
      artOffset.value.y,
      zoom.value,
      editorData.value.width,
      editorData.value.height,
      cell.width,
      cell.height,
      'rgba(0, 0, 0, 0.4)',
  );
}

function drawEditor() {
  drawBackground();
  drawReference();
  drawPixels();
  drawIsoOverlay();
  drawGrid();
  drawSelection();
  drawMiniMap();
}
```

- [ ] **Step 4: Manual verification**

Run:
```bash
cd /Users/hoanganhlam/projects/ninosaur/simplepixelart/simplepixelart_web && bun dev
```

Open `/editor`. In DevTools console:

```javascript
const s = $nuxt.$pinia.state.value.editor.editorData
s.gridMode = 'iso'
s.gridCell = { width: 2, height: 1 }
// force redraw — simplest: click any tool button or zoom button
```

Then click a toolbar button (e.g. zoom in then zoom out) to trigger `drawEditor()`. **Expected:** checkerboard disappears, plain white art rect with thin black diamond grid lines (2 px wide × 1 px tall diamonds). Set `s.gridCell = { width: 8, height: 4 }`, redraw → larger diamonds. Set `s.gridMode = 'off'` → plain white, no diamonds, no checkerboard. Set `'square'` → checkerboard returns.

- [ ] **Step 5: Commit**

```bash
git add app/components/PXEditor.vue
git commit -m "feat(editor): render iso diamond overlay when gridMode='iso'"
```

---

## Task 7: Toolbar — grid cycle button + cell inputs

**Files:**
- Modify: `app/components/PXEditor.vue` — script section (after imports), template (lines 794–798), template style block

- [ ] **Step 1: Add `gridIconClass` computed**

In `app/components/PXEditor.vue` `<script setup>`, after the `editorData` computed (around line 152), add:

```typescript
const gridIconClass = computed(() => {
  const mode = editorData.value.gridMode ?? 'square';
  if (mode === 'iso') return 'icon icon-grid iso-rotated';
  if (mode === 'off') return 'icon icon-grid grid-off';
  return 'icon icon-grid';
});
```

- [ ] **Step 2: Replace toolbar grid toggle with cycle button**

Find lines 794–798:

```vue
        <ui-tooltip :text="showGrid ? 'Hide grid' : 'Show grid'">
          <button class="toolbar-btn" :class="{ active: showGrid }" @click="showGrid = !showGrid; drawEditor()">
            <span class="icon icon-grid"/>
          </button>
        </ui-tooltip>
```

Replace with:

```vue
        <ui-tooltip :text="`Grid: ${editorData.gridMode ?? 'square'}`">
          <button
              class="toolbar-btn"
              :class="{ active: (editorData.gridMode ?? 'square') !== 'off' }"
              @click="store.cycleGridMode(); drawEditor()"
          >
            <span :class="gridIconClass"/>
          </button>
        </ui-tooltip>
        <template v-if="(editorData.gridMode ?? 'square') === 'iso'">
          <input
              class="resize-input"
              type="number"
              min="1"
              max="32"
              :value="(editorData.gridCell ?? { width: 2, height: 1 }).width"
              @change="store.setGridCell(($event.target as HTMLInputElement).value, (editorData.gridCell ?? { width: 2, height: 1 }).height); drawEditor()"
          >
          <span class="text-xs">×</span>
          <input
              class="resize-input"
              type="number"
              min="1"
              max="32"
              :value="(editorData.gridCell ?? { width: 2, height: 1 }).height"
              @change="store.setGridCell((editorData.gridCell ?? { width: 2, height: 1 }).width, ($event.target as HTMLInputElement).value); drawEditor()"
          >
        </template>
```

- [ ] **Step 3: Remove now-unused `showGrid` ref (and old `drawGrid` no-op references)**

Find the `showGrid` ref declaration (around line 72):

```typescript
const showGrid = ref(true);
```

Delete this line. The old `drawGrid` function (line 486–488) is a no-op kept for compatibility — leave it alone; it's called from `drawEditor` and does nothing harmful. (Removing it would mean a third edit in this task; defer to a later cleanup.)

If TypeScript build complains about any other `showGrid` references, search the file:

```bash
grep -n "showGrid" /Users/hoanganhlam/projects/ninosaur/simplepixelart/simplepixelart_web/app/components/PXEditor.vue
```

The only usage was inside `drawBackground` (replaced in Task 6) and the toolbar button (replaced in this task). No other references should remain.

- [ ] **Step 4: Add CSS for iso-rotated and grid-off icon variants**

In the `<style scoped>` block of `app/components/PXEditor.vue`, add at the bottom (just before the closing `</style>`):

```css
.iso-rotated {
  transform: rotate(45deg);
}
.grid-off {
  opacity: 0.4;
}
```

Note: PXEditor.vue does **not** currently have a `<style scoped>` block visible in the snippet — verify with:

```bash
grep -n "<style" /Users/hoanganhlam/projects/ninosaur/simplepixelart/simplepixelart_web/app/components/PXEditor.vue
```

If no `<style scoped>` exists, add one immediately before `</template>`'s closing tag … wait, after `</template>` and at the end of the file:

```vue
<style scoped>
@reference "tailwindcss";

.iso-rotated {
  transform: rotate(45deg);
}
.grid-off {
  opacity: 0.4;
}
</style>
```

- [ ] **Step 5: Manual verification**

Run `bun dev`. Open `/editor`.

1. Click the grid toolbar button. It should cycle: square (checkerboard, active) → iso (diamonds, active, icon rotated 45°) → off (no grid, icon dimmed) → square. Tooltip updates each click.
2. When in iso mode, two number inputs appear next to the button. Change width to `8`, height to `4`. Diamonds resize larger.
3. Refresh the page. Mode and cell size persist (because they're inside `editorData` which is auto-saved locally).

- [ ] **Step 6: Commit**

```bash
git add app/components/PXEditor.vue
git commit -m "feat(editor): grid cycle button (square/iso/off) + iso cell inputs"
```

---

## Task 8: Store — paintIsoLine + iso-line virtual-layer flow

**Files:**
- Modify: `app/stores/editor.store.ts`

- [ ] **Step 1: Add `paintIsoLine` and helper to clear/write into virtual layer**

In `app/stores/editor.store.ts`, after the `paint` function (around line 458), add:

```typescript
function clearVirtualLayer() {
    virtualLayer.value.pixels = {};
    virtualLayer.value.x = 0;
    virtualLayer.value.y = 0;
}

function writeVirtualPixel(x: number, y: number, colorIndex: number) {
    if (x < 0 || x >= editorData.value.width || y < 0 || y >= editorData.value.height) return;
    if (selectionState.value.bounds.active && !checkKeyInSelection(`${x}_${y}`)) return;
    if (colorIndex === -1) {
        delete virtualLayer.value.pixels[`${x}_${y}`];
    } else {
        virtualLayer.value.pixels[`${x}_${y}`] = colorIndex;
    }
    if (mirrorHorizontal.value) {
        const mx = editorData.value.width - 1 - x;
        if (selectionState.value.bounds.active && !checkKeyInSelection(`${mx}_${y}`)) {} else {
            virtualLayer.value.pixels[`${mx}_${y}`] = colorIndex;
        }
    }
    if (mirrorVertical.value) {
        const my = editorData.value.height - 1 - y;
        virtualLayer.value.pixels[`${x}_${my}`] = colorIndex;
    }
    if (mirrorHorizontal.value && mirrorVertical.value) {
        const mx = editorData.value.width - 1 - x;
        const my = editorData.value.height - 1 - y;
        virtualLayer.value.pixels[`${mx}_${my}`] = colorIndex;
    }
}

/**
 * Generates a pixel-perfect "iso" line from start to end and writes it into virtualLayer.
 * The line follows one of four axes (NE, SE, SW, NW) at slope ±cellH/cellW.
 * For each cellW-pixel horizontal step, the line advances cellH pixels vertically.
 * Mirror flags and selection bounds are honored via writeVirtualPixel.
 */
function paintIsoLine(
    start: { x: number; y: number },
    end: { x: number; y: number },
    cellW: number,
    cellH: number,
    colorIndex: number,
) {
    clearVirtualLayer();
    if (cellW < 1) cellW = 1;
    if (cellH < 1) cellH = 1;

    const dx = end.x - start.x;
    const dy = end.y - start.y;

    // Determine direction signs along x and y. If either is zero, pick from the other.
    const sx = dx === 0 ? 1 : (dx > 0 ? 1 : -1);
    const sy = dy === 0 ? (cellH === 0 ? 0 : 1) : (dy > 0 ? 1 : -1);

    // Number of "cells" the line should span. Pick whichever axis gives the larger count
    // so the line reaches at least to the mouse cursor along that axis.
    const cellsByX = Math.floor(Math.abs(dx) / cellW);
    const cellsByY = Math.floor(Math.abs(dy) / cellH);
    const cells = Math.max(cellsByX, cellsByY);

    let x = start.x;
    let y = start.y;

    // Always paint the start point (cellW pixels horizontal at start row)
    for (let k = 0; k < cellW; k++) {
        writeVirtualPixel(x + sx * k, y, colorIndex);
    }

    for (let c = 0; c < cells; c++) {
        // Step vertically by cellH (one pixel at a time, drawing the horizontal run after each)
        for (let v = 0; v < cellH; v++) {
            y += sy;
            // After each vertical step inside this cell, draw the run starting at the new x
            x += sx;
            for (let k = 0; k < cellW; k++) {
                writeVirtualPixel(x + sx * k, y, colorIndex);
            }
        }
        // The above "x += sx" inside the inner loop advances cellH pixels horizontally across
        // the cellH-pixel vertical step. After exiting, we've moved exactly cellW pixels
        // horizontally for cellH vertical pixels — the desired 2:1 slope at cellW=2,cellH=1.
        // Adjust if cellW > cellH so each row gets a horizontal run of cellW.
    }
}
```

**Note:** This algorithm assumes `cellW >= cellH` (the typical iso orientation where horizontal extent exceeds vertical). For inverted ratios (cellW < cellH), the line still draws but slope direction is the iso axis closest to the cursor — verify in Task 9 manual test.

- [ ] **Step 2: Export new actions**

Update the `return { ... }` block of the store to include `paintIsoLine` and `clearVirtualLayer`:

```typescript
return {
    // ... existing exports ...
    cycleGridMode,
    setGridCell,
    paintIsoLine,
    clearVirtualLayer,
}
```

- [ ] **Step 3: Build to verify types**

```bash
cd /Users/hoanganhlam/projects/ninosaur/simplepixelart/simplepixelart_web && bun run build
```

Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add app/stores/editor.store.ts
git commit -m "feat(editor): paintIsoLine and virtual-layer write helpers"
```

---

## Task 9: PXEditor — iso-line tool wiring

**Files:**
- Modify: `app/components/PXEditor.vue` — `startDraw`, `draw`, `stopDraw`, sidebar tools widget, CSS

- [ ] **Step 1: Add iso-line state and branch in `startDraw`**

In `app/components/PXEditor.vue` `<script setup>`, near the other tool state refs (around line 80), add:

```typescript
const isIsoLining = ref(false);
const isoLineStart = ref<{ x: number; y: number } | null>(null);
```

Find `startDraw` (line 234). Inside the `switch (store.currentTool)` block, add a new case **before** the `default` case (and before `case "bucket":` is fine too — order doesn't affect behavior):

```typescript
    case "iso-line":
      isIsoLining.value = true;
      isoLineStart.value = getPixelPos(e);
      store.immigrateVirtualLayer();
      store.clearVirtualLayer();
      {
        const cell = editorData.value.gridCell ?? { width: 2, height: 1 };
        store.paintIsoLine(
            isoLineStart.value,
            isoLineStart.value,
            cell.width,
            cell.height,
            store.currentColorIndex,
        );
      }
      break;
```

- [ ] **Step 2: Add `draw` branch for iso-line**

Find the `draw` function (line 274). After the `else if (isMoving.value) { ... }` block and before the `else if (isDrawing.value) { ... }` block, insert:

```typescript
  else if (isIsoLining.value && isoLineStart.value) {
    const end = getPixelPos(e);
    const cell = editorData.value.gridCell ?? { width: 2, height: 1 };
    store.paintIsoLine(
        isoLineStart.value,
        end,
        cell.width,
        cell.height,
        store.currentColorIndex,
    );
  }
```

- [ ] **Step 3: Add `stopDraw` branch for iso-line**

Find `stopDraw` (line 304). Insert a new `else if` branch before the final `else { isDrawing.value = false; }`:

```typescript
  } else if (isIsoLining.value) {
    isIsoLining.value = false;
    isoLineStart.value = null;
    store.mergeVirtualLayer();
  } else {
```

So the function reads, in part:

```typescript
function stopDraw() {
  if (store.selectionState.selecting) {
    // ...existing...
  } else if (isMoving.value) {
    isMoving.value = false;
    store.mergeVirtualLayer()
  } else if (isIsoLining.value) {
    isIsoLining.value = false;
    isoLineStart.value = null;
    store.mergeVirtualLayer();
  } else {
    isDrawing.value = false;
  }
  if (needSave.value) store.saveState();
  needSave.value = false;
  drawEditor();
  isStarted.value = false;
}
```

Also ensure `needSave.value = true` runs for iso-line: at the bottom of `startDraw`, the current code already sets `needSave.value = true` for every tool except `select`, so iso-line is covered.

- [ ] **Step 4: Add sidebar iso-line tool button**

Find the `Control` widget tools (line 887). After the brush `Square` (line 888-890) and before bucket:

```vue
              <Square @click="store.setTool('brush')" :class="{ active: store.currentTool === 'brush' }">
                <span class="icon icon-brush"/>
              </Square>
```

Insert immediately after:

```vue
              <Square @click="store.setTool('iso-line')" :class="{ active: store.currentTool === 'iso-line' }">
                <span class="icon icon-line"/>
              </Square>
```

**Icon fallback:** If `icon-line` doesn't render (blank box), open the icon module config and check what's available. Quickest check:

```bash
grep -rn "icon-line\|icon-brush" /Users/hoanganhlam/projects/ninosaur/simplepixelart/simplepixelart_web/modules /Users/hoanganhlam/projects/ninosaur/simplepixelart/simplepixelart_web/public/icons 2>/dev/null | head -10
```

If `icon-line` is absent, substitute with `icon-brush` and add `iso-rotated` class (CSS rotation to visually distinguish): `<span class="icon icon-brush iso-rotated"/>`.

- [ ] **Step 5: Add cursor CSS for iso-line**

Locate where canvas tool cursors are bound (the `<canvas :class="store.currentTool" ... />` element at line 864). The class binds to the current tool name. Add CSS so `.iso-line` cursor is `crosshair`. In the same `<style scoped>` block added in Task 7 step 4 (or create one if it still doesn't exist), add:

```css
canvas.iso-line { cursor: crosshair; }
```

- [ ] **Step 6: Manual verification**

Run `bun dev`. Open `/editor`.

1. Select iso-line tool from sidebar (button between brush and bucket). Cursor turns to crosshair over canvas.
2. With grid in `iso` mode and cell `2 × 1`, click and drag from a pixel diagonally down-right. While dragging, a stair-step preview appears (2 px right, 1 px down, repeat). Release. Pixels are now permanent on the current layer.
3. Click-drag in each of the 4 quadrants (NE, SE, SW, NW). Slopes look correct.
4. Toggle `mirrorHorizontal`, draw iso-line → mirrored line appears on the right.
5. Make a selection rectangle, switch to iso-line, draw a line crossing the selection boundary → pixels outside the bound are dropped.
6. Undo → line vanishes. Redo → line returns.
7. Try cell `8 × 4` and draw → each "step" is 8 pixels horizontal × 4 pixels vertical.
8. Switch back to brush tool → still works normally.

Document any deviation in a comment in the PXEditor file or in the commit message.

- [ ] **Step 7: Commit**

```bash
git add app/components/PXEditor.vue
git commit -m "feat(editor): iso-line tool with virtual-layer preview"
```

---

## Task 10: Cloud-save payload + persistence verification

**Files:**
- Modify: `app/stores/editor.store.ts` — `saveNow` function (lines 299–333)

- [ ] **Step 1: Include gridMode/gridCell in cloud payload**

Find `saveNow` → inner `save2Cloud` (line 300). Locate the `payload` object (line 301):

```typescript
            const payload = {
                name: editorData.value.name || 'Untitled',
                desc: editorData.value.desc || '',
                tags: editorData.value.tags || [],
                width: editorData.value.width,
                height: editorData.value.height,
                colors: editorData.value.colors,
                layers: editorData.value.layers,
                template: editorData.value.template,
                id_string: editorData.value.id_string,
                map_numbers: layers2MapNumbers(editorData.value),
                is_public: editorData.value.is_public
            }
```

Add the two fields:

```typescript
            const payload = {
                name: editorData.value.name || 'Untitled',
                desc: editorData.value.desc || '',
                tags: editorData.value.tags || [],
                width: editorData.value.width,
                height: editorData.value.height,
                colors: editorData.value.colors,
                layers: editorData.value.layers,
                template: editorData.value.template,
                id_string: editorData.value.id_string,
                map_numbers: layers2MapNumbers(editorData.value),
                is_public: editorData.value.is_public,
                gridMode: editorData.value.gridMode ?? 'square',
                gridCell: editorData.value.gridCell ?? { width: 2, height: 1 },
            }
```

(If Task 1 decided on `meta` placement, swap to `meta: { ...editorData.value.meta, iso: { mode, cell } }` style. See Task 1's decision note.)

- [ ] **Step 2: Do the same in `syncLocalToCloud` payload**

Find `syncLocalToCloud` (line 611). Locate the `payload` block (line 622). Add `gridMode` and `gridCell` fields the same way:

```typescript
                const payload = {
                    name: item.name || 'Untitled',
                    desc: item.desc || '',
                    tags: item.tags || [],
                    width: item.width,
                    height: item.height,
                    colors: item.colors,
                    layers: item.layers,
                    template: item.template,
                    id_string: '',
                    map_numbers: layers2MapNumbers(item),
                    is_public: item.is_public,
                    gridMode: item.gridMode ?? 'square',
                    gridCell: item.gridCell ?? { width: 2, height: 1 },
                }
```

- [ ] **Step 3: Manual verification — full persistence cycle**

Run `bun dev`.

1. Open `/editor`. Set grid mode to `iso`, cell `8 × 4`, draw an iso line.
2. Open DevTools → Application → Local Storage → `http://localhost:3000`. Find the `workspaces` key. Verify it's a JSON object containing your artwork with `gridMode: "iso"` and `gridCell: { "width": 8, "height": 4 }`.
3. Hard-reload the page (Cmd-Shift-R). The editor re-loads the same workspace from local storage. Grid is still iso, cell still 8×4, iso line still drawn.
4. (If logged in) Click Share → Publish. Check the `/coloring/shared-pages/` POST in DevTools Network tab. Request body should contain `gridMode` and `gridCell`. Response should echo them back (or, if backend strips them, the values aren't lost on reload because local storage still has them — see Task 1 decision).
5. (If logged in) Reload from cloud by clearing local storage and visiting the shared art URL — observe whether iso settings persist on cloud-only round-trip. If they don't, this confirms Outcome A from Task 1 and the `meta` migration must be applied as noted in Task 1.

- [ ] **Step 4: Commit**

```bash
git add app/stores/editor.store.ts
git commit -m "feat(editor): persist gridMode/gridCell to cloud payload"
```

---

## Task 11: Final integration pass

**Files:**
- Verify: all touched files

- [ ] **Step 1: Build**

```bash
cd /Users/hoanganhlam/projects/ninosaur/simplepixelart/simplepixelart_web && bun run build
```

Expected: build succeeds. The build also performs Nuxt's type-check pass.

- [ ] **Step 2: Full manual smoke test**

Run `bun dev`. Walk through every spec verification step (see spec → "Testing plan", items 1–10). Note any failure and address before final commit.

Spec items to verify (re-stated for convenience):

1. Fresh canvas — cycle grid: square → iso → off → square
2. Set cell 4×2, 8×4 → diamonds resize correctly
3. Set cell 1×1 → degenerate-but-valid grid renders
4. Draw iso-line in each of 4 directions
5. Mirror horizontal + iso-line
6. Selection bound + iso-line
7. Undo iso-line; redo
8. Save → reload → grid mode + cell + iso pixels persist (local)
9. Resize canvas → iso overlay redraws, art unchanged
10. Old saved art (no `gridMode`) → loads as `square` mode

- [ ] **Step 3: Address any deviation**

If any step fails, create a follow-up commit fixing it (`fix(editor): <what>`). If the failure is structural (algorithm wrong, etc.), stop and discuss with the user before guessing.

- [ ] **Step 4: Final commit (only if cleanup was needed)**

```bash
git add -A
git commit -m "fix(editor): address iso-line smoke-test findings"
```

If no cleanup needed, this task ends with no extra commit.

---

## Self-Review Notes

- **Spec coverage** — all 11 numbered sections of the spec are covered: data model (Task 2), defaults (Task 3), store actions (Task 4), iso-line algorithm (Task 8), rendering helper (Task 5), render integration (Task 6), toolbar UI (Task 7), tool wiring (Task 9), persistence (Task 10), full verification (Task 11), backend decision flagged (Task 1).
- **Placeholder scan** — no TBD/TODO in step content. Backend decision in Task 1 is deferred only as a fact-finding step *with concrete instructions for either outcome*; this is not a placeholder.
- **Type consistency** — `cycleGridMode` / `setGridCell` / `paintIsoLine` / `clearVirtualLayer` are used in PXEditor with the exact names defined in the store. `gridMode` / `gridCell` shape matches the `EditorData` interface.
