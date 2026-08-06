<script setup lang="ts">
import {ref, computed, watch, onMounted, onBeforeUnmount} from 'vue'
import type {SharedPage} from '~/types'
import {
  type TilemapConfig, normalizeTilemap, computeGeometry, renderTilemap, tileImageUrl, placedIds,
} from '~/helper/tilemap'

const props = defineProps<{
  config: any
  items: SharedPage[]
}>()

const apiBase = useRuntimeConfig().public.api as string
const canvas = ref<HTMLCanvasElement | null>(null)
const viewport = ref<HTMLDivElement | null>(null)
const tileImages = new Map<number, HTMLImageElement>()

const cfg = computed<TilemapConfig>(() => normalizeTilemap(props.config))

// Only items actually placed on the map need loading.
const usedIds = computed(() => new Set<number>(placedIds(cfg.value)))

// --- Zoom: 1 = fit-to-frame; zoom in up to 8x, pan via native scroll. ---
const ZOOM_MIN = 1
const ZOOM_MAX = 8
const ZOOM_STEP = 1.25
const zoom = ref(1)
const baseW = ref(0) // canvas display width (px) at zoom 1 (fitted)

const canvasStyle = computed(() =>
    baseW.value > 0 ? {width: `${Math.round(baseW.value * zoom.value)}px`} : undefined,
)

function zoomIn() { zoom.value = Math.min(ZOOM_MAX, zoom.value * ZOOM_STEP) }
function zoomOut() { zoom.value = Math.max(ZOOM_MIN, zoom.value / ZOOM_STEP) }
function zoomReset() { zoom.value = 1 }

// Fit = shrink-to-frame, never upscale past intrinsic pixels (same as the old
// max-width/max-height behaviour).
function measure() {
  const el = viewport.value
  const cv = canvas.value
  if (!el || !cv || !cv.width) return
  const cs = getComputedStyle(el)
  const availW = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
  const availH = el.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)
  if (availW <= 0 || availH <= 0) return
  const s = Math.min(availW / cv.width, availH / cv.height, 1)
  baseW.value = Math.max(1, cv.width * s)
}

let ro: ResizeObserver | null = null

function draw() {
  const cv = canvas.value
  if (!cv) return
  const g = computeGeometry(cfg.value)
  cv.width = Math.max(1, Math.round(g.width))
  cv.height = Math.max(1, Math.round(g.height))
  const ctx = cv.getContext('2d')
  if (!ctx) return
  renderTilemap(ctx, cfg.value, g, tileImages)
  measure()
}

function loadImages() {
  const byId = new Map<number, SharedPage>()
  for (const it of props.items || []) if (it && it.id != null) byId.set(it.id as number, it)
  for (const id of usedIds.value) {
    if (tileImages.has(id)) continue
    const page = byId.get(id)
    if (!page?.id_string) continue
    const img = new Image()
    img.onload = draw
    img.src = tileImageUrl(apiBase, page.id_string)
    tileImages.set(id, img)
  }
  draw()
}

onMounted(() => {
  loadImages()
  if (viewport.value) {
    ro = new ResizeObserver(measure)
    ro.observe(viewport.value)
  }
})
onBeforeUnmount(() => { ro?.disconnect() })
watch([cfg, () => props.items], loadImages, {deep: true})
</script>

<template>
  <div class="tm-showcase" :class="`tm-${cfg.mode}`">
    <div ref="viewport" class="tm-viewport">
      <canvas ref="canvas" class="tm-showcase-canvas" :style="canvasStyle"/>
    </div>
    <div class="tm-zoom" role="group" aria-label="Zoom world map">
      <button type="button" class="tm-zoom-btn" :disabled="zoom <= ZOOM_MIN" aria-label="Zoom out" @click="zoomOut">−</button>
      <button type="button" class="tm-zoom-pct" title="Reset zoom" @click="zoomReset">{{ Math.round(zoom * 100) }}%</button>
      <button type="button" class="tm-zoom-btn" :disabled="zoom >= ZOOM_MAX" aria-label="Zoom in" @click="zoomIn">+</button>
    </div>
  </div>
</template>

<style scoped>
.tm-showcase {
  position: relative;
  aspect-ratio: 16 / 9;
  background:
      repeating-conic-gradient(var(--surface-2) 0 25%, transparent 0 50%)
      0 0 / 24px 24px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  overflow: hidden;
}

.tm-viewport {
  display: flex;
  width: 100%;
  height: 100%;
  padding: var(--space-5);
  overflow: auto;
}

.tm-showcase-canvas {
  display: block;
  margin: auto; /* centers when smaller than the frame, scrolls cleanly when zoomed */
  max-width: 100%;
  max-height: 100%;
  image-rendering: pixelated;
}

/* Once measured, the inline width takes over — lift the fit constraints. */
.tm-showcase-canvas[style] {
  max-width: none;
  max-height: none;
}

.tm-zoom {
  position: absolute;
  right: var(--space-3);
  bottom: var(--space-3);
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 2px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-modal);
}

.tm-zoom-btn,
.tm-zoom-pct {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 24px;
  border: 0;
  background: transparent;
  border-radius: calc(var(--radius-sm) - 2px);
  color: var(--muted);
  cursor: pointer;
  transition: background var(--transition), color var(--transition);
}

.tm-zoom-btn {
  width: 24px;
  font-size: var(--text-sm);
  line-height: 1;
}

.tm-zoom-pct {
  min-width: 42px;
  padding: 0 var(--space-1);
  font-size: var(--text-2xs);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.tm-zoom-btn:hover:not(:disabled),
.tm-zoom-pct:hover {
  background: var(--surface-2);
  color: var(--foreground);
}

.tm-zoom-btn:disabled {
  opacity: 0.35;
  cursor: default;
}
</style>
