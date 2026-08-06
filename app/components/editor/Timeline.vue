<script setup lang="ts">
import {toRaw} from "vue";
import {drawThumbnail} from "~/helper/canvas";
import type {AnimationFrame} from "~/types";

const store = useEditor()

// When the art is still static, show a single implicit frame (the current art)
// plus an "add" affordance so the feature is discoverable.
const displayFrames = computed<AnimationFrame[]>(() =>
    store.frames.length
        ? (store.frames as AnimationFrame[])
        : [{id: '_static', layers: store.editorData.layers}]
)

// ===== Thumbnails =====
const thumbEls = ref<(HTMLCanvasElement | null)[]>([])

function setThumbEl(el: any, i: number) {
  thumbEls.value[i] = (el as HTMLCanvasElement) || null
}

function renderThumb(canvas: HTMLCanvasElement | null, frame: AnimationFrame) {
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
  // Composite the frame's layers (raw data to skip proxy overhead).
  drawThumbnail(canvas, {
    width: w,
    height: h,
    colors: toRaw(store.editorData.colors),
    layers: toRaw(frame.layers),
  } as any, 1)
}

const bgThumbEl = ref<HTMLCanvasElement | null>(null)

function renderAllThumbs() {
  displayFrames.value.forEach((f, i) => renderThumb(thumbEls.value[i] || null, f))
  if (store.isAnimated && bgThumbEl.value) {
    renderThumb(bgThumbEl.value, {id: '_bg', layers: store.sharedLayers as any})
  }
}

onMounted(renderAllThumbs)
// Re-render thumbs whenever content (drawTurn), frame set, palette or shared bg changes.
watch(() => [store.drawTurn, store.frameCount, store.editorData.colors.length, store.sharedRev], () => {
  nextTick(renderAllThumbs)
})

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

// ===== Frame ops (stop playback first to avoid races) =====
function selectFrame(i: number) {
  store.isPlaying = false
  store.setActiveFrame(i)
}

function addFrame() {
  store.isPlaying = false
  store.addFrame(true)
}

function onDuplicate(i: number) {
  store.isPlaying = false
  store.duplicateFrame(i)
}

function onDelete(i: number) {
  store.isPlaying = false
  store.deleteFrame(i)
}

function move(i: number, dir: -1 | 1) {
  store.isPlaying = false
  store.moveFrame(i, i + dir)
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

onUnmounted(() => { store.isPlaying = false })
</script>

<template>
  <Widget title="Animation frames" class="timeline">
    <div class="tl-bar">
      <!-- Playback controls (only meaningful once animated) -->
      <div class="tl-controls" v-if="store.isAnimated">
        <!-- Play + position -->
        <div class="tl-group">
          <button class="tl-play" :title="playing ? 'Pause' : 'Play'" @click="togglePlay">
            <svg v-if="!playing" viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
              <path d="M7 5v14l12-7z" fill="currentColor"/>
            </svg>
            <svg v-else viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
              <path d="M7 5h4v14H7zM13 5h4v14h-4z" fill="currentColor"/>
            </svg>
          </button>
          <span class="tl-counter" title="Current frame / total">
            {{ store.currentFrameIndex + 1 }}<i>/</i>{{ store.frameCount }}
          </span>
        </div>

        <span class="tl-divider"/>

        <!-- Global speed -->
        <div class="tl-knob" title="Playback speed — frames shown per second">
          <span class="tl-knob-label">Speed</span>
          <input class="tl-slider" type="range" min="1" max="30" v-model.number="fpsDraft" @change="commitFps">
          <span class="tl-knob-val">{{ fpsDraft }} fps</span>
        </div>

        <span class="tl-divider"/>

        <!-- Selected frame duration -->
        <div class="tl-knob" title="How long the selected frame stays on screen">
          <span class="tl-knob-label">This frame</span>
          <input class="tl-slider" type="range" min="16" max="1000" step="2" v-model.number="durationDraft" @change="commitDuration">
          <input class="tl-knob-num" type="number" min="10" max="10000" step="10" v-model.number="durationDraft" @change="commitDuration">
          <span class="tl-knob-unit">ms</span>
        </div>

        <span class="tl-divider"/>

        <!-- View toggles -->
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
        </div>
      </div>

      <!-- Frames strip -->
      <div class="tl-frames no-scrollbar">
        <!-- Shared static background (renders beneath every frame) -->
        <div
            v-if="store.isAnimated"
            class="tl-frame tl-frame-bg"
            :class="{active: store.editingShared}"
            title="Static background — drawn behind every frame"
            @click="editShared"
        >
          <span class="tl-frame-num">BG</span>
          <canvas ref="bgThumbEl" class="tl-thumb"/>
        </div>

        <div
            v-for="(f, i) in displayFrames"
            :key="f.id"
            class="tl-frame"
            :class="{active: i === store.currentFrameIndex}"
            @click="selectFrame(i)"
        >
          <span class="tl-frame-num">{{ i + 1 }}</span>
          <canvas :ref="el => setThumbEl(el, i)" class="tl-thumb"/>

          <div v-if="store.isAnimated" class="tl-frame-actions">
            <button class="tl-fa" title="Move left" :disabled="i === 0" @click.stop="move(i, -1)">
              <span class="icon icon-angle-left"/>
            </button>
            <button class="tl-fa" title="Duplicate" @click.stop="onDuplicate(i)">
              <span class="icon icon-plus"/>
            </button>
            <button class="tl-fa" title="Move right" :disabled="i === displayFrames.length - 1" @click.stop="move(i, 1)">
              <span class="icon icon-angle-right"/>
            </button>
            <button class="tl-fa tl-fa-del" title="Delete frame" :disabled="store.frameCount <= 1" @click.stop="onDelete(i)">
              <span class="icon icon-trash"/>
            </button>
          </div>
        </div>

        <!-- Add frame -->
        <button class="tl-add" title="Add frame (duplicate current)" @click="addFrame">
          <span class="icon icon-plus"/>
          <span>Frame</span>
        </button>
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

/* Labeled slider group: [Label] [====slider====] [value] */
.tl-knob {
  display: inline-flex;
  align-items: center;
  gap: var(--space-3);
}

.tl-knob-label {
  font-size: var(--text-2xs);
  font-weight: 700;
  color: var(--foreground);
  white-space: nowrap;
}

.tl-slider {
  width: 110px;
  height: 4px;
  accent-color: var(--primary);
  cursor: pointer;
}

.tl-knob-val {
  font-size: 12px;
  font-weight: 600;
  color: var(--muted);
  min-width: 42px;
  font-variant-numeric: tabular-nums;
}

.tl-knob-num {
  width: 60px;
  padding: 4px 6px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--background);
  color: var(--foreground);
  font-size: 12px;
  text-align: center;
}

.tl-knob-num:focus {
  outline: none;
  border-color: var(--primary);
}

.tl-knob-unit {
  font-size: var(--text-2xs);
  font-weight: 600;
  color: var(--muted);
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

.tl-frames {
  display: flex;
  align-items: stretch;
  gap: var(--space-2);
  overflow-x: auto;
  padding: 2px;
  width: 100%;
  min-width: 0;
}

.tl-frame {
  position: relative;
  flex-shrink: 0;
  width: 60px;
  height: 60px;
  border: 2px solid var(--border);
  border-radius: var(--radius-sm);
  background:
      linear-gradient(45deg, #e5e7eb 25%, transparent 25%),
      linear-gradient(-45deg, #e5e7eb 25%, transparent 25%),
      linear-gradient(45deg, transparent 75%, #e5e7eb 75%),
      linear-gradient(-45deg, transparent 75%, #e5e7eb 75%),
      #fff;
  background-size: 10px 10px;
  background-position: 0 0, 0 5px, 5px -5px, -5px 0;
  cursor: pointer;
  overflow: hidden;
  transition: border-color 120ms ease;
}

.tl-frame.active {
  border-color: var(--primary);
  box-shadow: 0 0 0 2px color-mix(in oklab, var(--primary) 30%, transparent);
}

/* Shared background tile — dashed accent to read as "applies to all frames" */
.tl-frame-bg {
  border-style: dashed;
  margin-right: 4px;
}

.tl-frame-bg .tl-frame-num {
  background: var(--primary);
  color: var(--primary-foreground, #fff);
}

.tl-thumb {
  width: 100%;
  height: 100%;
  object-fit: contain;
  image-rendering: pixelated;
  display: block;
}

.tl-frame-num {
  position: absolute;
  top: 2px;
  left: 3px;
  font-size: 9px;
  font-weight: 800;
  color: #fff;
  background: rgba(0, 0, 0, 0.55);
  padding: 0 4px;
  border-radius: 3px;
  z-index: 2;
  pointer-events: none;
}

.tl-frame-actions {
  position: absolute;
  inset: auto 0 0 0;
  display: flex;
  justify-content: center;
  gap: 1px;
  padding: 2px;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.6), transparent);
  opacity: 0;
  transition: opacity 120ms ease;
}

.tl-frame:hover .tl-frame-actions,
.tl-frame.active .tl-frame-actions { opacity: 1; }

.tl-fa {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  padding: 0;
  border: 0;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.85);
  color: #222;
  cursor: pointer;
}

.tl-fa .icon { font-size: 10px; }
.tl-fa:hover { background: #fff; }
.tl-fa:disabled { opacity: 0.35; cursor: not-allowed; }
.tl-fa-del:hover { background: var(--danger); color: #fff; }

.tl-add {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  flex-shrink: 0;
  width: 60px;
  height: 60px;
  border: 2px dashed var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--muted);
  font-size: 10px;
  font-weight: 600;
  cursor: pointer;
}

.tl-add .icon { font-size: 16px; }
.tl-add:hover { color: var(--primary); }
</style>
