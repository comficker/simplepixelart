<script setup lang="ts">
import {ref, shallowRef, computed, watch, onMounted, onBeforeUnmount} from 'vue'
import type {SharedPage} from '~/types'
import {
  type TilemapConfig, normalizeTilemap, computeGeometry, renderTilemap, tileImageUrl, placedIds,
} from '~/helper/tilemap'
import {type TileAnim, animFrame, cellPhase} from '~/helper/tile-anim'

const props = defineProps<{
  config: any
  items: SharedPage[]
  // Fill a detail page's stage edge to edge, instead of a framed 16:9 card.
  flush?: boolean
}>()

const apiBase = useRuntimeConfig().public.api as string
const canvas = ref<HTMLCanvasElement | null>(null)
const viewport = ref<HTMLDivElement | null>(null)
const tileImages = new Map<number, HTMLImageElement>()

const cfg = computed<TilemapConfig>(() => normalizeTilemap(props.config))

const usedIds = computed(() => new Set<number>(placedIds(cfg.value)))

const ZOOM_MIN = 1
const ZOOM_MAX = 8
const ZOOM_STEP = 1.25
const zoom = ref(1)
const baseW = ref(0)

const canvasStyle = computed(() =>
    baseW.value > 0 ? {width: `${Math.round(baseW.value * zoom.value)}px`} : undefined,
)

function zoomIn() { zoom.value = Math.min(ZOOM_MAX, zoom.value * ZOOM_STEP) }
function zoomOut() { zoom.value = Math.max(ZOOM_MIN, zoom.value / ZOOM_STEP) }
function zoomReset() { zoom.value = 1 }

function measure() {
  const el = viewport.value
  const cv = canvas.value
  if (!el || !cv || !cv.width) return
  const cs = getComputedStyle(el)
  const availW = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
  const availH = el.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)
  if (availW <= 0 || availH <= 0) return
  const fit = Math.min(availW / cv.width, availH / cv.height)
  // A detail page's stage has room to spare: grow by whole steps, so every
  // pixel stays the same size.
  const s = props.flush && fit >= 2 ? Math.floor(fit) : Math.min(fit, 1)
  baseW.value = Math.max(1, cv.width * s)
}

let ro: ResizeObserver | null = null

// Animated tiles play here too — this is the map as visitors see it. A tile
// whose frames cannot be read (a draft of someone else's) stays still.
const {load: loadTileAnims} = useTileAnims()
const tileAnims = shallowRef(new Map<number, TileAnim>())
let animNow = 0
function frameOf(id: number, col: number, row: number) {
  const a = tileAnims.value.get(id)
  return a ? animFrame(a, animNow, cellPhase(col, row)) : null
}

function draw() {
  const cv = canvas.value
  if (!cv) return
  const g = computeGeometry(cfg.value)
  const w = Math.max(1, Math.round(g.width)), h = Math.max(1, Math.round(g.height))
  // Resizing a canvas reallocates it; an animation frame only repaints.
  const resized = cv.width !== w || cv.height !== h
  if (resized) {
    cv.width = w
    cv.height = h
  }
  const ctx = cv.getContext('2d')
  if (!ctx) return
  animNow = performance.now()
  renderTilemap(ctx, cfg.value, g, tileImages, 1, frameOf)
  if (resized) measure()
}

// ~20 repaints a second is plenty for pixel art. Nothing moves for someone
// who asked their system for less motion.
let animReq = 0
let animLast = 0
function animLoop(t: number) {
  animReq = 0
  if (!tileAnims.value.size) return
  if (t - animLast >= 50) {
    animLast = t
    draw()
  }
  animReq = requestAnimationFrame(animLoop)
}
async function refreshAnims() {
  if (typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches) return
  tileAnims.value = await loadTileAnims([...usedIds.value])
  if (tileAnims.value.size && !animReq) animReq = requestAnimationFrame(animLoop)
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
    img.crossOrigin = 'anonymous'
    img.src = tileImageUrl(apiBase, page.id_string)
    tileImages.set(id, img)
  }
  draw()
}

/** The map as a PNG at `scale`, from the tiles already loaded here — still
 * frames, as an export is. */
function toPng(scale = 1): Promise<Blob | null> {
  const g = computeGeometry(cfg.value)
  const cv = document.createElement('canvas')
  cv.width = Math.max(1, Math.round(g.width * scale))
  cv.height = Math.max(1, Math.round(g.height * scale))
  const ctx = cv.getContext('2d')
  if (!ctx) return Promise.resolve(null)
  renderTilemap(ctx, cfg.value, g, tileImages, scale)
  return new Promise(resolve => cv.toBlob(resolve, 'image/png'))
}
defineExpose({toPng})

onMounted(() => {
  loadImages()
  refreshAnims()
  if (viewport.value) {
    ro = new ResizeObserver(measure)
    ro.observe(viewport.value)
  }
})
onBeforeUnmount(() => {
  ro?.disconnect()
  if (animReq) cancelAnimationFrame(animReq)
})
watch([cfg, () => props.items], () => { loadImages(); refreshAnims() }, {deep: true})
</script>

<template>
  <div class="tm-showcase" :class="[`tm-${cfg.mode}`, {'is-flush': flush}]">
    <div ref="viewport" class="tm-viewport">
      <canvas ref="canvas" class="tm-showcase-canvas" :style="canvasStyle"/>
    </div>
    <div class="tm-zoom" role="group" :aria-label="$t('c_TilemapShowcase.zoomWorldMap')">
      <button type="button" class="tm-zoom-btn" :disabled="zoom <= ZOOM_MIN" :aria-label="$t('common.zoomOut')" @click="zoomOut">−</button>
      <button type="button" class="tm-zoom-pct" :title="$t('c_TilemapShowcase.resetZoom')" @click="zoomReset">{{ Math.round(zoom * 100) }}%</button>
      <button type="button" class="tm-zoom-btn" :disabled="zoom >= ZOOM_MAX" :aria-label="$t('common.zoomIn')" @click="zoomIn">+</button>
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

.tm-showcase.is-flush {
  aspect-ratio: auto;
  width: 100%;
  height: 100%;
  border: 0;
  border-radius: 0;
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
  margin: auto; 
  max-width: 100%;
  max-height: 100%;
  image-rendering: pixelated;
}

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
