# Editor UI — Tool Rail + Slimmer Sidebar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the editor's 10-tool Control widget out of the right sidebar into a 44-px vertical rail left of the canvas, then shrink the right sidebar (Preview + Layers only) — reclaiming canvas area without altering store, rendering, or component decomposition.

**Architecture:** CSS + template restructure only. The outer `<div class="flex md:flex-row">` becomes 3-column (rail | canvas-col | sidebar). The Control widget gets a new wrapper class `tool-rail`, its inner `<div class="tools">` gets `.tools-rail` for rail-specific layout, and the Draw / Edit groups get a separator div. The legacy `.adv-top-row` two-up grid (Control + Preview) is deleted. Mobile (<768px) flips the rail to a horizontal scrollable strip.

**Tech Stack:** Nuxt 4, Vue 3 `<script setup>`, TailwindCSS v4 via `@apply`, plain CSS in `app/assets/css/main.css`. Package manager: `bun`. No test framework — verification by `bun dev` + observed behavior.

**Spec:** [`docs/superpowers/specs/2026-05-17-editor-ui-tool-rail-design.md`](../specs/2026-05-17-editor-ui-tool-rail-design.md)

**Run during work:**
- Dev server: `cd simplepixelart/simplepixelart_web && bun dev` → opens at `http://0.0.0.0:3000`. Editor is at `/editor`.
- Build / type-check: `bun run build` (runs `nuxt build` which type-checks).

**Conventions:**
- Source root: `app/`
- CSS lives in `app/assets/css/main.css` (no PostCSS; Tailwind v4 via `@apply` directives inside plain CSS rules)
- Commit per task. Do not push (user pushes manually per repo convention)

**Working directory for all paths:** `/Users/hoanganhlam/projects/ninosaur/simplepixelart/simplepixelart_web`

---

## File Structure

| File | Responsibility |
|---|---|
| `app/assets/css/main.css` | Add `.tool-rail`, `.tools-rail`, `.tools-sep` rules; shrink `.editor-sidebar`; remove `.adv-top-row` rules; scope legacy `.tools` if cascade conflict |
| `app/components/PXEditor.vue` | Template restructure: 3-column flex; extract tools into rail; remove `adv-top-row` wrapper; sidebar now holds only Preview + Layers |

No new files. No component splits. No store changes.

---

## Task 1: CSS additions (rail + separator), pre-template

**Files:**
- Modify: `app/assets/css/main.css` — add new rules at the end of the existing tool/sidebar block (currently around line 614, just before `/* --- Tool grid (advanced mode) --- */`)

This task adds the rail-related CSS first. The rules are inert until Task 2 wires the template. After this task, dev server still renders the old layout.

- [ ] **Step 1: Append new CSS rules**

Open `app/assets/css/main.css`. Find the existing `/* --- Advanced top row: Control + Preview --- */` block (around line 614). Immediately **before** it, insert:

```css
/* --- Tool rail (vertical on desktop, horizontal strip on mobile) --- */
.tool-rail {
    flex: none;
}

.tool-rail .widget-head {
    display: none;
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

(The 11 columns on mobile = 10 tools + 1 separator cell.)

- [ ] **Step 2: Build to confirm no CSS syntax errors**

Run:
```bash
cd /Users/hoanganhlam/projects/ninosaur/simplepixelart/simplepixelart_web && bun run build
```

Expected: clean build (`✨ Build complete!`). Tailwind v4 `@apply` inside `@media` is not used here — only plain CSS — so no Tailwind-related errors are possible.

- [ ] **Step 3: Boot dev server, confirm editor still renders normally**

```bash
cd /Users/hoanganhlam/projects/ninosaur/simplepixelart/simplepixelart_web && (bun dev 2>&1 & PID=$!; sleep 8; kill $PID 2>/dev/null; wait 2>/dev/null) | tail -20
```

Expected: Nuxt boots, Vite client + server built, no compile errors. The new rules apply to nothing (no DOM element has `.tool-rail` / `.tools-rail` / `.tools-sep` yet).

- [ ] **Step 4: Commit**

```bash
cd /Users/hoanganhlam/projects/ninosaur/simplepixelart/simplepixelart_web
git add app/assets/css/main.css
git commit -m "style(editor): add tool-rail / tools-rail / tools-sep rules

Pre-stage CSS for upcoming template restructure. Rules are inert
until PXEditor.vue references the classes in the next task."
```

---

## Task 2: Template restructure — move Control out of sidebar

**Files:**
- Modify: `app/components/PXEditor.vue:926-1031` (the layout body — outer flex row, sidebar div, adv-top-row wrapper)

This task moves the Control widget out of `.editor-sidebar > .adv-top-row` into a new sibling column placed BEFORE the canvas column. The sidebar's right placement and content (Preview + Layers) is preserved. The `.adv-top-row` wrapper is removed.

- [ ] **Step 1: Replace the layout body**

Open `app/components/PXEditor.vue`. Find lines 926–1032 — the entire `<div class="flex flex-col md:flex-row gap-3"> … </div>` block (it ends with the `<!-- Publish modal -->` comment around line 1033).

The existing block currently reads:

```vue
    <div class="flex flex-col md:flex-row gap-3">
      <!-- Left: canvas + palette -->
      <div class="flex-1 space-y-2">
        <Widget>
          <Square>
            <div
                class="canvas-container no-scrollbar m-auto"
                @scroll="drawMiniMap"
                @mousedown="startPan"
                @touchstart="startPan"
                @mousemove="pan"
                @touchmove="pan"
                @mouseup="stopPan"
                @mouseleave="stopPan"
                @touchend="stopPan"
            >
              <canvas
                  ref="canvas"
                  :class="store.currentTool"
                  @mousedown="startDraw"
                  @mousemove="draw"
                  @mouseup="stopDraw"
                  @mouseleave="stopDraw"
                  @touchstart="handleTouchStart"
                  @touchmove="handleTouchMove"
                  @touchend="handleTouchEnd"
              />
            </div>
          </Square>
        </Widget>

        <Widget title="Palette">
          <editor-palette/>
        </Widget>
      </div>

      <!-- Right sidebar -->
      <div class="editor-sidebar">
        <div class="adv-top-row">
          <Widget title="Control">
            <div class="tools">
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
          <!-- Preview: always rendered, single ref -->
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
        </div>

        <Widget title="Layers" class="layers">
          <template #ctl>
            <button @click="store.addLayer">+</button>
          </template>
          <ul>
            <li
                v-for="(_, index) in editorData.layers"
                :key="index"
                :class="{ active: index === store.currentLayerIndex }"
                @click="store.currentLayerIndex = index"
            >
              <EditableText v-model="editorData.layers[index]!.name" placeholder="Name" @changed="store.saveState()"/>
              <button v-if="editorData.layers.length > 1" @click.stop="store.deleteLayer(index)" class="layer-del">
                <span class="icon icon-trash"/>
              </button>
            </li>
          </ul>
        </Widget>

      </div>
    </div>
```

Replace it entirely with:

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
        <Widget>
          <Square>
            <div
                class="canvas-container no-scrollbar m-auto"
                @scroll="drawMiniMap"
                @mousedown="startPan"
                @touchstart="startPan"
                @mousemove="pan"
                @touchmove="pan"
                @mouseup="stopPan"
                @mouseleave="stopPan"
                @touchend="stopPan"
            >
              <canvas
                  ref="canvas"
                  :class="store.currentTool"
                  @mousedown="startDraw"
                  @mousemove="draw"
                  @mouseup="stopDraw"
                  @mouseleave="stopDraw"
                  @touchstart="handleTouchStart"
                  @touchmove="handleTouchMove"
                  @touchend="handleTouchEnd"
              />
            </div>
          </Square>
        </Widget>

        <Widget title="Palette">
          <editor-palette/>
        </Widget>
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
          <ul>
            <li
                v-for="(_, index) in editorData.layers"
                :key="index"
                :class="{ active: index === store.currentLayerIndex }"
                @click="store.currentLayerIndex = index"
            >
              <EditableText v-model="editorData.layers[index]!.name" placeholder="Name" @changed="store.saveState()"/>
              <button v-if="editorData.layers.length > 1" @click.stop="store.deleteLayer(index)" class="layer-del">
                <span class="icon icon-trash"/>
              </button>
            </li>
          </ul>
        </Widget>
      </div>
    </div>
```

Notes on the diff:

- Outer wrapper class changed: `flex flex-col md:flex-row gap-3` → `editor-body flex flex-col md:flex-row gap-2`. The `editor-body` class is purely a marker for future styling — no CSS rule today.
- Gap reduced from `gap-3` (12px) → `gap-2` (8px).
- The `<Widget class="tool-rail">` element has NO `title` prop. `Widget.vue` always renders an empty `<div class="widget-head">` in that case; Task 1's `.tool-rail .widget-head { display: none }` rule hides it.
- The 10 `Square` tool buttons are split into two groups separated by `<div class="tools-sep"/>`. Order preserved from old layout: brush, iso-line, bucket, eraser, sep, move, select, mirror-h, mirror-v, flip-h, flip-v.
- The `<div class="adv-top-row">` wrapper around Control+Preview is gone. Preview is now a direct child of `.editor-sidebar`.

- [ ] **Step 2: Build**

```bash
cd /Users/hoanganhlam/projects/ninosaur/simplepixelart/simplepixelart_web && bun run build
```

Expected: clean build.

- [ ] **Step 3: Cascade conflict check (Tailwind utilities on `.tools`)**

The existing `.tools` rule (around line 636 of `main.css`) uses `@apply grid grid-cols-6 text-xl gap-0.5` and `@media (min-width: 768px) { .tools { @apply grid-cols-3 } }`. Both selectors will still match our element (the element has both `.tools` and `.tools-rail`).

The new `.tools-rail` rule in Task 1 explicitly declares `grid-template-columns` inside `@media` blocks. Two CSS rules at the same specificity level (`.tools` and `.tools-rail` are both 1-class selectors) → tie-breaker is order in the file. The new rules are inserted **before** the `.tools` block (we put them before the `/* --- Advanced top row --- */` comment, which sits before `/* --- Tool grid (advanced mode) --- */`). That means the LATER `.tools` rule wins by source order — bad.

Two options to resolve cleanly:

**Option A (preferred, no logic change):** at the bottom of `main.css`, append a small override block that re-declares `.tools-rail`'s `grid-template-columns` AFTER the `.tools` block. Since Task 1's rules already exist higher up, we add narrow override rules at the very end of the file (after the `.tools` block). Open `main.css` and find the END of the `.tools` rules (the `.tools .square.active .inside` rule, around line 663-667). Just after that closing brace, append:

```css
/* Override .tools default grid for the rail variant (must follow .tools rules) */
.tools.tools-rail {
    grid-template-columns: repeat(11, minmax(36px, 1fr));
    grid-auto-flow: column;
}

@media (min-width: 768px) {
    .tools.tools-rail {
        grid-template-columns: 1fr;
        grid-auto-flow: row;
    }
}
```

This uses a 2-class selector (`.tools.tools-rail`, specificity 0,2,0) which beats the single-class `.tools` rule regardless of source order. Add this even if you previously declared the same rules in Task 1 — Task 1's `.tools-rail` rule still applies for `display: grid`, `gap`, etc., but the `grid-template-columns` declaration migrates to the higher-specificity selector here.

**Option B (skip — restructure existing CSS, breaks Task 1 boundary):** rewrite `.tools` to `.tools:not(.tools-rail)`. Don't do this in a single-task commit; it disturbs the existing layout for other potential `.tools` users (there are none today, but the file is shared).

Pick Option A. Run the dev server and verify in DevTools: the computed `grid-template-columns` on the `<div class="tools tools-rail">` element is `1fr` (desktop) or `repeat(11, minmax(36px, 1fr))` (mobile). If still `repeat(6, ...)` from the legacy `.tools` rule, the override is misplaced — move it later in the file.

- [ ] **Step 4: Smoke (dev server)**

```bash
cd /Users/hoanganhlam/projects/ninosaur/simplepixelart/simplepixelart_web && (bun dev 2>&1 & PID=$!; sleep 8; kill $PID 2>/dev/null; wait 2>/dev/null) | tail -20
```

Expected: Nuxt boots without compile errors. Open `http://localhost:3000/editor` in a browser (manual — outside this plan's scope, but recommended). Should see:
- Rail visible left of canvas, 44px wide, 10 buttons stacked, separator between eraser and move.
- Right sidebar still 36%/260px (we haven't shrunk it yet — that's Task 3).
- Canvas/palette column in the middle.

If the rail renders as a wide block (multi-column inheriting `.tools` legacy grid), Step 3's override didn't take effect — fix before committing.

- [ ] **Step 5: Commit**

```bash
cd /Users/hoanganhlam/projects/ninosaur/simplepixelart/simplepixelart_web
git add app/components/PXEditor.vue app/assets/css/main.css
git commit -m "feat(editor): extract tool grid into vertical rail left of canvas

Layout becomes 3-column on desktop: tool rail | canvas+palette |
sidebar. Mobile keeps single column with rail as horizontal strip.
Two groups (Draw / Edit) separated by a visual divider.

Sidebar width unchanged in this commit — slimmed in next."
```

---

## Task 3: Shrink sidebar + remove obsolete `.adv-top-row` rules

**Files:**
- Modify: `app/assets/css/main.css` — replace `.editor-sidebar` media-query block (current line 582-587) and delete the `.adv-top-row` rules (current line 615-633)

This task completes the visual win: sidebar shrinks from 36% / 260px max → 24% / 190px max, and the dead `.adv-top-row` rules are removed.

- [ ] **Step 1: Replace `.editor-sidebar` desktop media-query**

In `app/assets/css/main.css`, find:

```css
@media (min-width: 768px) {
    .editor-sidebar {
        width: 36%;
        max-width: 260px;
    }
}
```

Replace with:

```css
@media (min-width: 768px) {
    .editor-sidebar {
        width: 24%;
        max-width: 190px;
    }
}
```

- [ ] **Step 2: Delete the `.adv-top-row` block**

Find:

```css
/* --- Advanced top row: Control + Preview --- */
.adv-top-row {
    @apply flex flex-col gap-2;
}

@media (min-width: 768px) {
    .adv-top-row {
        @apply grid grid-cols-2;
        align-items: stretch;
    }

    .adv-top-row > .widget {
        display: flex;
        flex-direction: column;
    }

    .adv-top-row > .widget > .widget-body {
        flex: 1;
    }
}
```

Delete the entire block (including the comment header).

- [ ] **Step 3: Build**

```bash
cd /Users/hoanganhlam/projects/ninosaur/simplepixelart/simplepixelart_web && bun run build
```

Expected: clean build. No `.adv-top-row` selector exists in any template now (Task 2 removed the wrapper), so deleting the rules is safe.

- [ ] **Step 4: Smoke (dev server)**

```bash
cd /Users/hoanganhlam/projects/ninosaur/simplepixelart/simplepixelart_web && (bun dev 2>&1 & PID=$!; sleep 8; kill $PID 2>/dev/null; wait 2>/dev/null) | tail -20
```

Expected: Nuxt boots. In browser at `/editor`:
- Rail 44px left.
- Canvas-col wider than before (you may need to compare against `main`; visually the canvas-container `Square` should be ~70px wider).
- Right sidebar visibly narrower (~190px max), containing only Preview + Layers stacked.

- [ ] **Step 5: Commit**

```bash
cd /Users/hoanganhlam/projects/ninosaur/simplepixelart/simplepixelart_web
git add app/assets/css/main.css
git commit -m "style(editor): shrink right sidebar to 24%/190px, drop adv-top-row

Sidebar now holds Preview + Layers only — Control moved to rail in
the prior commit. The two-up adv-top-row grid no longer has any
template consumers."
```

---

## Task 4: Full manual smoke + final commit (if any cleanup)

**Files:** verification only.

- [ ] **Step 1: Build clean**

```bash
cd /Users/hoanganhlam/projects/ninosaur/simplepixelart/simplepixelart_web && bun run build 2>&1 | tail -8
```

Expected: `✨ Build complete!`

- [ ] **Step 2: Manual walkthrough**

Boot dev server and open `http://localhost:3000/editor`. Run through each spec checklist item:

1. Desktop ≥768px: rail visible left, 44px wide, 10 tools in 1 column, separator after 4th button (after eraser, before move).
2. Desktop: sidebar right is narrower; only Preview + Layers visible; max-width ~190px.
3. Desktop: canvas area visibly wider than before.
4. Click each of the 10 tools → active highlight + canvas cursor changes appropriately + each tool actually works (brush draws, iso-line draws stair-step, bucket fills, eraser erases, move drags, select draws marquee, mirror toggles, flip flips).
5. Resize viewport across 768px breakpoint: rail flips orientation; on mobile the rail becomes a horizontal scrollable strip above the canvas, and the sidebar (Preview+Layers) collapses below canvas as before.
6. Mobile <360px: rail strip scrolls horizontally without breaking the layout.
7. Onboarding modal still appears on first load (clear localStorage to trigger); publish modal still opens.
8. Iso mode (cycle the grid button to `iso`): cell W/H inputs in top toolbar still render and update the iso grid.
9. No console errors / no Vue warnings.

- [ ] **Step 3: Address any deviation**

If any verification step fails, create a follow-up commit fixing it. Common failure modes:
- Rail still rendering as multi-column → the `.tools.tools-rail` override from Task 2 Step 3 isn't taking effect; move it to the very bottom of `main.css`.
- Tool buttons too tall on mobile → reduce `minmax(36px, 1fr)` in the mobile `.tools-rail` rule.
- Sidebar overlaps with canvas at certain widths → re-check that the `editor-body` wrapper still has `flex md:flex-row` and that no widget is stretching beyond its column.

If a fix is needed, commit it under a `fix(editor): …` message.

- [ ] **Step 4: Final commit (only if Step 3 produced changes)**

```bash
cd /Users/hoanganhlam/projects/ninosaur/simplepixelart/simplepixelart_web
git add -A
git commit -m "fix(editor): address tool-rail smoke-test findings"
```

If Step 3 found nothing, this task ends with no extra commit.

---

## Self-Review Notes

- **Spec coverage** — every spec section maps to a task: CSS additions (Task 1), template restructure + cascade fix (Task 2), sidebar shrink + dead-rule deletion (Task 3), manual verification (Task 4). No spec section is unimplemented.
- **Placeholder scan** — every code/CSS step contains the full content. The cascade-conflict mitigation in Task 2 Step 3 includes the exact CSS override block, not a "handle later" note.
- **Type consistency** — class names align across spec and plan: `.tool-rail`, `.tools-rail`, `.tools-sep`, `.editor-body`, `.canvas-col`, `.editor-sidebar`. The plan uses the same set throughout.
