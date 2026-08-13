<script setup lang="ts">
import {toRaw} from "vue";
import {drawThumbnail} from "~/helper/canvas";
import type {AnimationFrame, AnimationTag} from "~/types";

const store = useEditor()

// When the art is still static, show a single implicit frame (the current art)
// plus an "add" affordance so the feature is discoverable.
const displayFrames = computed<AnimationFrame[]>(() =>
    store.frames.length
        ? (store.frames as AnimationFrame[])
        : [{id: '_static', layers: store.editorData.layers}]
)

// ===== Cel grid shape (Aseprite timeline: rows = layers, columns = frames) =====
// Frames each own an independent layer stack; rows align stacks BY INDEX (the
// same convention all-frames drawing uses), so "layer 2 of every frame" reads
// as one row and can be animated on its own. Row order and numbering mirror
// the Layers panel (index 0 on top, numbered N..1 — highest index paints on top).
const maxLayers = computed(() => displayFrames.value.reduce((m, f) => Math.max(m, f.layers.length), 0))
const rowIndexes = computed(() => Array.from({length: maxLayers.value}, (_, i) => i))

function rowName(li: number) {
  const active = store.frames[store.currentFrameIndex]?.layers[li]
  if (active?.name) return active.name
  for (const f of displayFrames.value) {
    const n = f.layers[li]?.name
    if (n) return n
  }
  return `Layer`
}

function rowNum(li: number) {
  return maxLayers.value - li
}

// Column geometry, shared with the tag lane so spans stay aligned.
const CEL = 34
const GAP = 2

// ===== Cel thumbnails =====
// One tiny canvas per (frame, layer) intersection, registered in a plain Map
// (never reactive — canvases are render targets, not state).
const celEls = new Map<string, HTMLCanvasElement>()

function setCelEl(el: any, j: number, li: number) {
  const key = `${j}_${li}`
  if (el) celEls.set(key, el as HTMLCanvasElement)
  else celEls.delete(key)
}

function renderCel(j: number, li: number) {
  const canvas = celEls.get(`${j}_${li}`)
  const layer = displayFrames.value[j]?.layers[li]
  if (!canvas || !layer) return
  const w = store.editorData.width
  const h = store.editorData.height
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w
    canvas.height = h
  }
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, w, h)
  // Single-layer thumbnail (raw data to skip proxy overhead).
  drawThumbnail(canvas, {
    width: w,
    height: h,
    colors: toRaw(store.editorData.colors),
    layers: [toRaw(layer)],
  } as any, 1)
}

const bgThumbEl = ref<HTMLCanvasElement | null>(null)

function renderBgThumb() {
  const canvas = bgThumbEl.value
  if (!canvas) return
  const w = store.editorData.width
  const h = store.editorData.height
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w
    canvas.height = h
  }
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, w, h)
  drawThumbnail(canvas, {
    width: w,
    height: h,
    colors: toRaw(store.editorData.colors),
    layers: toRaw(store.sharedLayers),
  } as any, 1)
}

function renderFrameCels(j: number) {
  displayFrames.value[j]?.layers.forEach((_, li) => renderCel(j, li))
}

function renderAllThumbs() {
  displayFrames.value.forEach((_, j) => renderFrameCels(j))
  if (store.isAnimated) renderBgThumb()
}

onMounted(renderAllThumbs)

// drawTurn bumps on EVERY brush move — recomposing every cel each move froze
// big animated art. Mid-stroke only the ACTIVE frame's cels can change, so
// repaint just that column, trailing-debounced. A palette recolor touches
// every cel's look without changing anything structural — the cheap
// fingerprint catches it.
let thumbTimer: ReturnType<typeof setTimeout> | null = null
let lastPalette = ''
watch(() => store.drawTurn, () => {
  if (thumbTimer) clearTimeout(thumbTimer)
  thumbTimer = setTimeout(() => {
    thumbTimer = null
    const palette = (store.editorData.colors || []).join(',')
    if (palette !== lastPalette) {
      lastPalette = palette
      renderAllThumbs()
      return
    }
    if (store.isAnimated && store.currentFrameIndex === -1) {
      renderBgThumb()
      return
    }
    renderFrameCels(Math.max(0, store.currentFrameIndex))
  }, 120)
})
// Structural changes (frame/layer ops, undo/redo via sharedRev, palette size)
// are rare — those still repaint everything.
watch(() => [store.frameCount, maxLayers.value, store.editorData.colors.length, store.sharedRev], () => {
  nextTick(renderAllThumbs)
})
onBeforeUnmount(() => { if (thumbTimer) clearTimeout(thumbTimer) })

function editShared() {
  store.isPlaying = false
  store.editShared()
}

// ===== Playback =====
// PXEditor owns the actual loop (pre-rendered frame buffers blitted to the main
// canvas). Here we just flip the shared `store.isPlaying` flag.
const playing = computed(() => store.isPlaying)

function togglePlay() {
  if (!store.isAnimated) return
  store.isPlaying = !store.isPlaying
}

// ===== Selection =====
function selectFrame(j: number) {
  store.isPlaying = false
  store.setActiveFrame(j)
}

// Clicking a cel jumps to that frame AND activates that layer — the core
// Aseprite gesture for animating components independently.
function selectCel(j: number, li: number) {
  selectFrame(j)
  if (store.frames[j]?.layers[li] || (!store.isAnimated && store.editorData.layers[li])) {
    store.activateLayer(li)
  }
}

function selectRow(li: number) {
  selectCel(Math.max(0, store.currentFrameIndex), li)
}

// ===== Frame ops (act on the current frame; stop playback first) =====
function addFrame() {
  store.isPlaying = false
  store.addFrame(true)
}

function onDuplicate() {
  store.isPlaying = false
  store.duplicateFrame(store.currentFrameIndex)
}

function onDelete() {
  store.isPlaying = false
  store.deleteFrame(store.currentFrameIndex)
}

function moveCur(dir: -1 | 1) {
  store.isPlaying = false
  store.moveFrame(store.currentFrameIndex, store.currentFrameIndex + dir)
}

// Transport stepping (same as the , / . keys).
function step(dir: -1 | 1) {
  store.isPlaying = false
  store.setActiveFrame(Math.max(0, store.currentFrameIndex) + dir)
}

// Live draft for the duration slider/input. We commit (which saveStates) only
// on release/change, not on every drag tick — otherwise dragging the slider
// would flood history + autosave.
const durationDraft = ref(100)
watch(
    () => store.frames[store.currentFrameIndex]?.duration ?? Math.round(1000 / store.fps),
    v => { durationDraft.value = v },
    {immediate: true},
)

function commitDuration() {
  store.setFrameDuration(store.currentFrameIndex, Number(durationDraft.value))
}

// Same live-draft pattern for the global speed (fps) slider.
const fpsDraft = ref(10)
watch(() => store.fps, v => { fpsDraft.value = v }, {immediate: true})

function commitFps() {
  store.setFps(Number(fpsDraft.value))
}

// ===== Tags (named frame ranges) =====
// The tag lane sits above the frame headers inside the same scroll container,
// so spans stay aligned while scrolling. Span geometry mirrors the columns.
function tagStyle(t: AnimationTag) {
  const len = t.to - t.from + 1
  return {
    left: `${t.from * (CEL + GAP)}px`,
    width: `${len * CEL + (len - 1) * GAP}px`,
    background: t.color,
  }
}

const DIR_GLYPHS: Record<AnimationTag['direction'], string> = {forward: '→', reverse: '←', pingpong: '⇄'}

function selectTag(t: AnimationTag) {
  store.isPlaying = false
  if (store.activeTagId === t.id) {
    store.activeTagId = null      // click again → back to whole-timeline playback
    return
  }
  store.activeTagId = t.id
  store.setActiveFrame(t.from)
}

function onAddTag() {
  store.isPlaying = false
  store.addTag()
}

function patchTag(patch: Partial<AnimationTag>) {
  if (store.activeTagId) store.updateTag(store.activeTagId, patch)
}

function onDeleteTag() {
  if (store.activeTagId) store.deleteTag(store.activeTagId)
}

// Header cells inside the selected tag's range pick up its color as a hint.
function colheadStyle(j: number) {
  const t = store.activeTag
  if (!t || j < t.from || j > t.to || j === store.currentFrameIndex) return undefined
  return {boxShadow: `inset 0 2px 0 0 ${t.color}`}
}

function frameMs(f: AnimationFrame) {
  return f.duration ?? Math.round(1000 / store.fps)
}

onUnmounted(() => { store.isPlaying = false })
</script>

<template>
  <Widget title="Animation frames" class="timeline">
    <div class="tl-bar">
      <!-- Playback + settings (only meaningful once animated).
           Transport first, then the two timing numbers, then view toggles;
           the rarer per-frame edits live in the ⋯ menu so the row stays one
           line. -->
      <div class="tl-controls" v-if="store.isAnimated">
        <!-- Transport -->
        <div class="tl-group">
          <button class="tl-op" title="Previous frame (,)" :disabled="store.currentFrameIndex <= 0" @click="step(-1)">
            <span class="icon icon-angle-left"/>
          </button>
          <button class="tl-play" :title="playing ? 'Pause' : 'Play'" @click="togglePlay">
            <svg v-if="!playing" viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
              <path d="M7 5v14l12-7z" fill="currentColor"/>
            </svg>
            <svg v-else viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
              <path d="M7 5h4v14H7zM13 5h4v14h-4z" fill="currentColor"/>
            </svg>
          </button>
          <button class="tl-op" title="Next frame (.)" :disabled="store.currentFrameIndex >= store.frameCount - 1" @click="step(1)">
            <span class="icon icon-angle-right"/>
          </button>
          <span class="tl-counter" title="Current frame / total">
            {{ store.currentFrameIndex + 1 }}<i>/</i>{{ store.frameCount }}
          </span>
        </div>

        <span class="tl-divider"/>

        <!-- Timing: global speed + the selected frame's own duration -->
        <div class="tl-group">
          <label class="tl-field" title="Playback speed — frames without their own duration use this">
            <span>Speed</span>
            <input type="number" min="1" max="60" v-model.number="fpsDraft" @change="commitFps">
            <em>fps</em>
          </label>
          <label class="tl-field" title="How long the selected frame stays on screen">
            <span>Frame</span>
            <input type="number" min="10" max="10000" step="10" v-model.number="durationDraft" @change="commitDuration">
            <em>ms</em>
          </label>
        </div>

        <span class="tl-divider"/>

        <!-- View toggles + tagging -->
        <div class="tl-group">
          <button
              class="tl-toggle"
              :class="{active: store.loopAnimation}"
              title="Repeat the animation"
              @click="store.toggleLoop()"
          >
            <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
              <path d="M7 7h8v3l4-4-4-4v3H5v6h2zM17 17H9v-3l-4 4 4 4v-3h10v-6h-2z" fill="currentColor"/>
            </svg>
            <span>Loop</span>
          </button>
          <button
              class="tl-toggle"
              :class="{active: store.onionSkin}"
              title="Show faded previous/next frames while drawing"
              @click="store.onionSkin = !store.onionSkin"
          >
            <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
              <circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" stroke-width="2"/>
              <circle cx="9" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.6"/>
            </svg>
            <span>Onion</span>
          </button>
          <button
              class="tl-toggle"
              title="Tag a frame range (idle, walk, …) — exported for game engines"
              @click="onAddTag"
          >
            <span class="icon icon-plus"/>
            <span>Tag</span>
          </button>
        </div>

        <!-- Per-frame edits: labelled menu instead of four mystery icons.
             `bottom` opens it upward — the timeline sits at the screen edge. -->
        <ui-dropdown-menu class="tl-more" position="bottom" label="Frame actions">
          <button class="tl-op" title="Frame actions" aria-label="Frame actions">
            <span class="icon icon-dots"/>
          </button>
          <template #menu>
            <div class="file-menu">
              <button class="file-menu-item" @click="onDuplicate">
                <span class="icon icon-content-copy"/><span>Duplicate frame</span>
              </button>
              <button class="file-menu-item" :disabled="store.currentFrameIndex <= 0" @click="moveCur(-1)">
                <span class="icon icon-angle-left"/><span>Move frame left</span>
              </button>
              <button
                  class="file-menu-item"
                  :disabled="store.currentFrameIndex >= store.frameCount - 1"
                  @click="moveCur(1)"
              >
                <span class="icon icon-angle-right"/><span>Move frame right</span>
              </button>
              <div class="file-menu-sep"/>
              <button class="file-menu-item tl-del" :disabled="store.frameCount <= 1" @click="onDelete">
                <span class="icon icon-trash"/><span>Delete frame</span>
              </button>
            </div>
          </template>
        </ui-dropdown-menu>
      </div>

      <!-- Selected-tag editor: name, 1-based range, direction, delete -->
      <div v-if="store.activeTag" class="tl-tagedit">
        <span class="tl-tag-dot" :style="{background: store.activeTag.color}"/>
        <input
            class="tl-tagname"
            :value="store.activeTag.name"
            maxlength="24"
            title="Tag name — becomes the animation name in game engines"
            @change="patchTag({name: ($event.target as HTMLInputElement).value})"
        >
        <label class="tl-tagrange">
          <span>From</span>
          <input type="number" min="1" :max="store.frameCount" :value="store.activeTag.from + 1"
                 @change="patchTag({from: Number(($event.target as HTMLInputElement).value) - 1})">
        </label>
        <label class="tl-tagrange">
          <span>To</span>
          <input type="number" min="1" :max="store.frameCount" :value="store.activeTag.to + 1"
                 @change="patchTag({to: Number(($event.target as HTMLInputElement).value) - 1})">
        </label>
        <div class="tl-dirs" title="Playback direction">
          <button
              v-for="d in (['forward', 'reverse', 'pingpong'] as const)"
              :key="d"
              class="tl-dir"
              :class="{active: store.activeTag.direction === d}"
              :title="d"
              @click="patchTag({direction: d})"
          >{{ DIR_GLYPHS[d] }}</button>
        </div>
        <button class="tl-tagdel" title="Delete tag" @click="onDeleteTag">
          <span class="icon icon-trash"/>
        </button>
      </div>

      <!-- Cel grid: rows = layers, columns = frames (Aseprite timeline) -->
      <div class="tl-grid no-scrollbar">
        <!-- Tag lane: colored spans over their frame ranges -->
        <div v-if="store.isAnimated && store.tags.length" class="tl-tags">
          <button
              v-for="t in store.tags"
              :key="t.id"
              class="tl-tag"
              :class="{active: t.id === store.activeTagId}"
              :style="tagStyle(t)"
              :title="`${t.name} — frames ${t.from + 1}–${t.to + 1} (${t.direction}). Click to play just this range.`"
              @click="selectTag(t)"
          >{{ t.name }} <i>{{ DIR_GLYPHS[t.direction] }}</i></button>
        </div>

        <!-- Frame-number header row -->
        <div class="tl-hrow">
          <div class="tl-corner">Layers</div>
          <button
              v-for="(f, j) in displayFrames"
              :key="`h${f.id}`"
              class="tl-colhead"
              :class="{active: j === store.currentFrameIndex}"
              :style="colheadStyle(j)"
              :title="store.isAnimated ? `Frame ${j + 1} — ${frameMs(f)}ms` : 'Frame 1'"
              @click="selectFrame(j)"
          >
            <b>{{ j + 1 }}</b>
            <i v-if="store.isAnimated">{{ frameMs(f) }}</i>
          </button>
          <button class="tl-addcol" title="Add frame (duplicate current)" @click="addFrame">
            <span class="icon icon-plus"/>
          </button>
        </div>

        <!-- Layer rows -->
        <div
            v-for="li in rowIndexes"
            :key="`r${li}`"
            class="tl-lrow"
            :class="{'row-active': li === store.currentLayerIndex && !store.editingShared}"
        >
          <button class="tl-rowname" :title="rowName(li)" @click="selectRow(li)">
            <b>{{ rowNum(li) }}</b>
            <span>{{ rowName(li) }}</span>
          </button>
          <button
              v-for="(f, j) in displayFrames"
              :key="`c${f.id}_${li}`"
              class="tl-cel"
              :class="{
                active: j === store.currentFrameIndex && li === store.currentLayerIndex && !store.editingShared,
                col: j === store.currentFrameIndex,
                empty: !f.layers[li],
              }"
              @click="selectCel(j, li)"
          >
            <canvas v-if="f.layers[li]" :ref="el => setCelEl(el, j, li)"/>
          </button>
        </div>

        <!-- Shared background row (drawn beneath every frame) -->
        <div v-if="store.isAnimated" class="tl-lrow tl-bgrow" :class="{'row-active': store.editingShared}">
          <button class="tl-rowname" title="Static background — drawn behind every frame" @click="editShared">
            <b>BG</b>
            <span>Background</span>
          </button>
          <button
              class="tl-cel tl-bgcel"
              :class="{active: store.editingShared}"
              :style="{width: `${store.frameCount * CEL + (store.frameCount - 1) * GAP}px`}"
              title="Shared across all frames — click to edit"
              @click="editShared"
          >
            <canvas ref="bgThumbEl"/>
            <em>shared across all frames</em>
          </button>
        </div>
      </div>
    </div>
  </Widget>
</template>

<style scoped>
.timeline :deep(.widget-body) {
  padding: var(--space-2);
}

.tl-bar {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  min-width: 0;
}

.tl-controls {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-3);
}

.tl-play {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--primary);
  color: var(--primary-foreground, #fff);
  cursor: pointer;
}

.tl-play:hover { opacity: 0.9; }

.tl-group {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
}

.tl-divider {
  width: 1px;
  align-self: stretch;
  min-height: 22px;
  background: var(--border);
}

.tl-counter {
  font-size: 13px;
  font-weight: 700;
  color: var(--foreground);
  font-variant-numeric: tabular-nums;
}

.tl-counter i {
  color: var(--muted);
  font-style: normal;
  margin: 0 1px;
}

/* Current-frame operation buttons */
.tl-op {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--muted);
  cursor: pointer;
}

.tl-op .icon { font-size: 12px; }
.tl-op:hover:not(:disabled) { color: var(--foreground); }
.tl-op:disabled { opacity: 0.35; cursor: not-allowed; }

/* Compact numeric setting: [Label] [input] [unit]. Replaces the two range
   sliders — they ate ~380px of the row for values users type once. */
.tl-field {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  cursor: text;
}

.tl-field > span {
  font-size: var(--text-2xs);
  font-weight: 700;
  color: var(--foreground);
  white-space: nowrap;
}

.tl-field input {
  width: 52px;
  padding: 4px 4px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--background);
  color: var(--foreground);
  font-size: 12px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.tl-field input:focus {
  outline: none;
  border-color: var(--primary);
}

.tl-field em {
  font-style: normal;
  font-size: var(--text-2xs);
  font-weight: 600;
  color: var(--muted);
}

/* The ⋯ menu is pushed to the end of the row. */
.tl-more {
  margin-left: auto;
}

.tl-del:not(:disabled) {
  color: var(--danger);
}

.tl-toggle {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 28px;
  padding: 0 9px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--muted);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.tl-toggle.active {
  border-color: var(--primary);
  color: var(--primary);
  background: color-mix(in oklab, var(--primary) 10%, var(--surface));
}

/* ===== Selected-tag editor row ===== */
.tl-tagedit {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.tl-tag-dot {
  flex: none;
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.tl-tagname {
  width: 130px;
  padding: 4px 6px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--background);
  color: var(--foreground);
  font-size: 12px;
  font-weight: 600;
}

.tl-tagname:focus { outline: none; border-color: var(--primary); }

.tl-tagrange {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: var(--text-2xs);
  font-weight: 700;
  color: var(--muted);
}

.tl-tagrange input {
  width: 48px;
  padding: 4px 4px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--background);
  color: var(--foreground);
  font-size: 12px;
  text-align: center;
}

.tl-tagrange input:focus { outline: none; border-color: var(--primary); }

.tl-dirs { display: inline-flex; }

.tl-dir {
  width: 26px;
  height: 26px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--muted);
  font-size: 13px;
  cursor: pointer;
}

.tl-dir + .tl-dir { border-left: 0; }
.tl-dir:first-child { border-radius: var(--radius-sm) 0 0 var(--radius-sm); }
.tl-dir:last-child { border-radius: 0 var(--radius-sm) var(--radius-sm) 0; }

.tl-dir.active {
  border-color: var(--primary);
  color: var(--primary);
  background: color-mix(in oklab, var(--primary) 10%, var(--surface));
}

.tl-tagdel {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--muted);
  cursor: pointer;
}

.tl-tagdel:hover { border-color: var(--danger); color: var(--danger); }

/* ===== Cel grid ===== */
/* Column advance = 34px cel + 2px gap; the name column is 96px + 2px. Tag
   spans and the BG strip compute against the same numbers (CEL/GAP consts). */
.tl-grid {
  overflow: auto;
  max-height: 240px;
  padding: 2px;
  width: 100%;
  min-width: 0;
  position: relative;
}

/* Tag lane rides the same horizontal scroll, offset past the name column. */
.tl-tags {
  position: relative;
  height: 18px;
  margin-bottom: 2px;
  margin-left: 98px;
  width: max-content;
  min-width: calc(100% - 98px);
}

.tl-tag {
  position: absolute;
  top: 0;
  height: 16px;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 0 6px;
  border: 0;
  border-radius: 3px;
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  line-height: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
  opacity: 0.75;
  transition: opacity 120ms ease, box-shadow 120ms ease;
}

.tl-tag i {
  font-style: normal;
  opacity: 0.8;
}

.tl-tag:hover { opacity: 1; }

.tl-tag.active {
  opacity: 1;
  box-shadow: 0 0 0 2px color-mix(in oklab, var(--foreground) 60%, transparent);
}

/* Header row: frame numbers + durations */
.tl-hrow,
.tl-lrow {
  display: flex;
  align-items: stretch;
  gap: 2px;
  width: max-content;
  min-width: 100%;
}

.tl-hrow { margin-bottom: 2px; }
.tl-lrow + .tl-lrow { margin-top: 2px; }
.tl-lrow { margin-top: 2px; }

.tl-corner,
.tl-rowname {
  flex: none;
  width: 96px;
  position: sticky;
  left: 0;
  z-index: 3;
  background: var(--background);
}

.tl-corner {
  display: flex;
  align-items: center;
  padding: 0 6px;
  font-size: var(--text-2xs);
  font-weight: 700;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.tl-colhead {
  flex: none;
  width: 34px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2px 0;
  border: 1px solid var(--border);
  border-radius: 3px;
  background: var(--surface);
  color: var(--muted);
  cursor: pointer;
  line-height: 1.1;
}

.tl-colhead b {
  font-size: 11px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}

.tl-colhead i {
  font-style: normal;
  font-size: 8px;
  font-variant-numeric: tabular-nums;
  opacity: 0.8;
}

.tl-colhead.active {
  border-color: var(--primary);
  background: color-mix(in oklab, var(--primary) 12%, var(--surface));
  color: var(--primary);
}

.tl-addcol {
  flex: none;
  width: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px dashed var(--border);
  border-radius: 3px;
  background: var(--surface);
  color: var(--muted);
  cursor: pointer;
}

.tl-addcol .icon { font-size: 12px; }
.tl-addcol:hover { color: var(--primary); border-color: var(--primary); }

/* Layer rows */
.tl-rowname {
  display: flex;
  align-items: center;
  gap: 5px;
  height: 34px;
  padding: 0 6px;
  border: 1px solid var(--border);
  border-radius: 3px;
  color: var(--muted);
  font-size: 11px;
  cursor: pointer;
  text-align: left;
  overflow: hidden;
}

.tl-rowname b {
  flex: none;
  min-width: 14px;
  height: 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 3px;
  background: var(--surface);
  border: 1px solid var(--border);
  font-size: 9px;
  font-weight: 800;
}

.tl-rowname span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
}

.row-active .tl-rowname {
  border-color: var(--primary);
  color: var(--primary);
}

.row-active .tl-rowname b {
  border-color: var(--primary);
  background: var(--primary);
  color: var(--primary-foreground, #fff);
}

/* Cels */
.tl-cel {
  flex: none;
  width: 34px;
  height: 34px;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 3px;
  background:
      linear-gradient(45deg, #e5e7eb 25%, transparent 25%),
      linear-gradient(-45deg, #e5e7eb 25%, transparent 25%),
      linear-gradient(45deg, transparent 75%, #e5e7eb 75%),
      linear-gradient(-45deg, transparent 75%, #e5e7eb 75%),
      #fff;
  background-size: 8px 8px;
  background-position: 0 0, 0 4px, 4px -4px, -4px 0;
  cursor: pointer;
  overflow: hidden;
}

.tl-cel canvas {
  width: 100%;
  height: 100%;
  object-fit: contain;
  image-rendering: pixelated;
  display: block;
}

/* Column of the current frame reads as one unit down the grid. */
.tl-cel.col {
  border-color: color-mix(in oklab, var(--primary) 45%, var(--border));
}

.tl-cel.active {
  border-color: var(--primary);
  box-shadow: 0 0 0 2px color-mix(in oklab, var(--primary) 30%, transparent);
}

.tl-cel.empty {
  background: var(--surface);
  cursor: default;
}

/* Shared background row */
.tl-bgrow .tl-rowname { border-style: dashed; }

.tl-bgcel {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  justify-content: flex-start;
  padding: 0;
  border-style: dashed;
}

.tl-bgcel canvas {
  flex: none;
  width: 32px;
  height: 32px;
}

.tl-bgcel em {
  font-style: normal;
  font-size: 9px;
  font-weight: 600;
  color: var(--muted);
  white-space: nowrap;
}
</style>
