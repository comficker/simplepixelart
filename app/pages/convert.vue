<script setup lang="ts">
import {onMounted, ref, computed, watch} from 'vue'
import {toast} from 'vue-sonner'
import type {EditorData} from '~/types'
import {DEFAULT_EDITOR_DATA} from '~/helper/constants'
import {cloneDeep, generateUUID} from '~/helper/utils'

useCustomSeoMeta({
  title: 'Image to Pixel Art Converter - Free Online Tool',
  description: 'Convert any photo or image into pixel art in seconds. Adjust size, palette, clean orphan pixels, swap colors, then open in the editor.',
  keywords: 'image to pixel art, photo to pixel art, pixel converter, pixelate image, pixel art generator',
  canonical: 'https://simplepixelart.com/convert',
})

type RGB = [number, number, number]

const fileInput = ref<HTMLInputElement | null>(null)
const previewCanvas = ref<HTMLCanvasElement | null>(null)
const sourceImage = ref<HTMLImageElement | null>(null)
const sourceUrl = ref<string>('')

const outputSize = ref(32)
const maxColors = ref(16)
const brightness = ref(0)
const contrast = ref(0)
const saturation = ref(0)

const pixels = ref<number[][]>([])
const palette = ref<RGB[]>([])
const selectedColorIndex = ref<number>(-1)

const hasImage = computed(() => !!sourceImage.value)

const sizeOptions = [8, 12, 16, 20, 24, 32, 48, 64]
const colorOptions = [4, 8, 16, 32, 64]

// ================================================================
// Image load
// ================================================================
function openFileDialog() {
  fileInput.value?.click()
}

function onFileSelect(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  loadFile(file)
}

function loadFile(file: File) {
  const reader = new FileReader()
  reader.onload = (e) => {
    const url = e.target?.result as string
    sourceUrl.value = url
    const img = new Image()
    img.onload = () => {
      sourceImage.value = img
      convert()
    }
    img.src = url
  }
  reader.readAsDataURL(file)
}

function onDrop(e: DragEvent) {
  e.preventDefault()
  const file = e.dataTransfer?.files?.[0]
  if (file && file.type.startsWith('image/')) loadFile(file)
}

// ================================================================
// Conversion pipeline
// ================================================================
function applyAdjustments(r: number, g: number, b: number): RGB {
  // Brightness
  r += brightness.value
  g += brightness.value
  b += brightness.value
  // Contrast
  const c = (contrast.value + 100) / 100
  r = (r - 128) * c + 128
  g = (g - 128) * c + 128
  b = (b - 128) * c + 128
  // Saturation
  const sat = (saturation.value + 100) / 100
  const gray = 0.299 * r + 0.587 * g + 0.114 * b
  r = gray + (r - gray) * sat
  g = gray + (g - gray) * sat
  b = gray + (b - gray) * sat
  return [
    Math.max(0, Math.min(255, Math.round(r))),
    Math.max(0, Math.min(255, Math.round(g))),
    Math.max(0, Math.min(255, Math.round(b))),
  ]
}

function sampleImage(img: HTMLImageElement, w: number, h: number): RGB[][] {
  const tmp = document.createElement('canvas')
  tmp.width = w
  tmp.height = h
  const ctx = tmp.getContext('2d')!
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  // Fit image into target keeping aspect
  const ir = img.width / img.height
  const tr = w / h
  let dw = w, dh = h, dx = 0, dy = 0
  if (ir > tr) {
    dh = w / ir
    dy = (h - dh) / 2
  } else {
    dw = h * ir
    dx = (w - dw) / 2
  }
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(img, dx, dy, dw, dh)
  const data = ctx.getImageData(0, 0, w, h).data
  const grid: RGB[][] = []
  for (let y = 0; y < h; y++) {
    const row: RGB[] = []
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      row.push(applyAdjustments(data[i]!, data[i + 1]!, data[i + 2]!))
    }
    grid.push(row)
  }
  return grid
}

// Median-cut color quantization
function quantize(grid: RGB[][], k: number): { palette: RGB[], indexed: number[][] } {
  const all: RGB[] = []
  for (const row of grid) for (const p of row) all.push(p)

  function medianCut(bucket: RGB[], depth: number): RGB[] {
    if (depth === 0 || bucket.length === 0) {
      if (bucket.length === 0) return []
      let r = 0, g = 0, b = 0
      for (const p of bucket) {
        r += p[0]; g += p[1]; b += p[2]
      }
      return [[Math.round(r / bucket.length), Math.round(g / bucket.length), Math.round(b / bucket.length)]]
    }
    // Find channel with largest range
    let rMin = 255, rMax = 0, gMin = 255, gMax = 0, bMin = 255, bMax = 0
    for (const p of bucket) {
      if (p[0] < rMin) rMin = p[0]; if (p[0] > rMax) rMax = p[0]
      if (p[1] < gMin) gMin = p[1]; if (p[1] > gMax) gMax = p[1]
      if (p[2] < bMin) bMin = p[2]; if (p[2] > bMax) bMax = p[2]
    }
    const rRange = rMax - rMin, gRange = gMax - gMin, bRange = bMax - bMin
    const ch = rRange >= gRange && rRange >= bRange ? 0 : (gRange >= bRange ? 1 : 2)
    bucket.sort((a, b) => a[ch] - b[ch])
    const mid = Math.floor(bucket.length / 2)
    return [...medianCut(bucket.slice(0, mid), depth - 1), ...medianCut(bucket.slice(mid), depth - 1)]
  }

  const depth = Math.ceil(Math.log2(k))
  let paletteOut = medianCut(all, depth).slice(0, k)
  if (paletteOut.length === 0) paletteOut = [[0, 0, 0]]

  // Map each pixel to nearest palette color
  const indexed: number[][] = []
  for (const row of grid) {
    const indexedRow: number[] = []
    for (const p of row) {
      let best = 0, bestD = Infinity
      for (let i = 0; i < paletteOut.length; i++) {
        const c = paletteOut[i]!
        const d = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2
        if (d < bestD) {
          bestD = d
          best = i
        }
      }
      indexedRow.push(best)
    }
    indexed.push(indexedRow)
  }
  return {palette: paletteOut, indexed}
}

function convert() {
  if (!sourceImage.value) return
  const img = sourceImage.value
  const ratio = img.width / img.height
  const w = outputSize.value
  const h = Math.round(w / ratio) || w
  const grid = sampleImage(img, w, h)
  const {palette: p, indexed} = quantize(grid, maxColors.value)
  palette.value = p
  pixels.value = indexed
  drawPreview()
}

function cleanOrphans() {
  if (!pixels.value.length) return
  const h = pixels.value.length
  const w = pixels.value[0]!.length
  const cleaned = pixels.value.map(r => [...r])
  let changed = 0
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = pixels.value[y]![x]!
      // Count same neighbors in 4-dir
      let same = 0
      if (y > 0 && pixels.value[y - 1]![x] === c) same++
      if (y < h - 1 && pixels.value[y + 1]![x] === c) same++
      if (x > 0 && pixels.value[y]![x - 1] === c) same++
      if (x < w - 1 && pixels.value[y]![x + 1] === c) same++
      if (same === 0) {
        // Replace with majority neighbor
        const neighbors: number[] = []
        if (y > 0) neighbors.push(pixels.value[y - 1]![x]!)
        if (y < h - 1) neighbors.push(pixels.value[y + 1]![x]!)
        if (x > 0) neighbors.push(pixels.value[y]![x - 1]!)
        if (x < w - 1) neighbors.push(pixels.value[y]![x + 1]!)
        const counts = new Map<number, number>()
        for (const n of neighbors) counts.set(n, (counts.get(n) || 0) + 1)
        let majority = c, best = 0
        counts.forEach((v, k) => {
          if (v > best) {
            best = v
            majority = k
          }
        })
        cleaned[y]![x] = majority
        changed++
      }
    }
  }
  pixels.value = cleaned
  drawPreview()
  toast.success(`Cleaned ${changed} orphan pixel${changed !== 1 ? 's' : ''}`)
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('').toUpperCase()
}

function hexToRgb(hex: string): RGB {
  const h = hex.replace('#', '')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

function editColor(index: number, hex: string) {
  palette.value[index] = hexToRgb(hex)
  drawPreview()
}

function mergeColor(fromIdx: number, toIdx: number) {
  if (fromIdx === toIdx) return
  pixels.value = pixels.value.map(row => row.map(v => v === fromIdx ? toIdx : (v > fromIdx ? v - 1 : v)))
  palette.value = palette.value.filter((_, i) => i !== fromIdx)
  selectedColorIndex.value = -1
  drawPreview()
  toast.success('Colors merged')
}

// ================================================================
// Preview
// ================================================================
function drawPreview() {
  if (!previewCanvas.value || !pixels.value.length) return
  const cv = previewCanvas.value
  const h = pixels.value.length
  const w = pixels.value[0]!.length
  const scale = Math.min(400 / w, 400 / h)
  const cw = Math.max(1, Math.round(w * scale))
  const ch = Math.max(1, Math.round(h * scale))
  cv.width = cw
  cv.height = ch
  const ctx = cv.getContext('2d')!
  ctx.imageSmoothingEnabled = false
  const cellW = cw / w
  const cellH = ch / h
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = pixels.value[y]![x]!
      const rgb = palette.value[idx]!
      ctx.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`
      ctx.fillRect(x * cellW, y * cellH, Math.ceil(cellW), Math.ceil(cellH))
    }
  }
}

// ================================================================
// Send to editor
// ================================================================
function sendToEditor() {
  if (!pixels.value.length) return
  const h = pixels.value.length
  const w = pixels.value[0]!.length
  const id = generateUUID()
  const layerPixels: {[key: string]: number} = {}
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      layerPixels[`${x}_${y}`] = pixels.value[y]![x]!
    }
  }
  const data: EditorData = {
    ...cloneDeep(DEFAULT_EDITOR_DATA),
    id,
    width: w,
    height: h,
    colors: palette.value.map(p => rgbToHex(p[0]!, p[1]!, p[2]!)),
    layers: [{
      name: 'Layer 1',
      pixels: layerPixels,
      x: 0,
      y: 0,
    }],
    updated: new Date().toISOString(),
  }
  // Write to localStorage workspaces so editor picks it up
  const raw = localStorage.getItem('workspaces') || '{}'
  const ws = JSON.parse(raw)
  ws[id] = data
  localStorage.setItem('workspaces', JSON.stringify(ws))
  localStorage.setItem('workspace_current', id)
  navigateTo(`/editor?id=${id}`)
}

// ================================================================
// Watch settings → re-convert
// ================================================================
watch([outputSize, maxColors, brightness, contrast, saturation], () => {
  if (sourceImage.value) convert()
})

onMounted(() => {
  // Redraw when canvas becomes available
})
</script>

<template>
  <div class="page">
    <section class="hero">
      <h1>Image → Pixel Art</h1>
      <p class="text-xs">Drop a photo, get pixel art. Clean it up, swap colors, open in editor.</p>
    </section>

    <!-- Upload zone (no image yet) -->
    <div
        v-if="!hasImage"
        class="upload-zone"
        @click="openFileDialog"
        @drop="onDrop"
        @dragover.prevent
    >
      <span class="icon icon-upload upload-icon"/>
      <p class="text-sm">Click or drop an image here</p>
      <p class="text-xs text-gray-500 mt-1">PNG, JPG, or WebP</p>
    </div>

    <!-- Main UI -->
    <div v-else class="convert-grid">
      <!-- Preview -->
      <div class="convert-preview">
        <Widget title="Pixel Preview">
          <template #ctl>
            <button class="text-xs" @click="openFileDialog">Change image</button>
          </template>
          <div class="preview-wrapper">
            <canvas ref="previewCanvas" class="pixel-preview"/>
          </div>
        </Widget>

        <!-- Actions -->
        <div class="convert-actions">
          <button class="btn primary flex-1 justify-center" @click="sendToEditor">
            <span class="icon icon-brush"/>
            <span>Open in Editor</span>
          </button>
          <button class="btn flex-1 justify-center" @click="cleanOrphans">
            <span class="icon icon-broom"/>
            <span>Clean Orphans</span>
          </button>
        </div>
      </div>

      <!-- Settings -->
      <div class="convert-settings">
        <Widget title="Size">
          <div class="settings-row">
            <label v-for="s in sizeOptions" :key="s" class="pill" :class="{active: outputSize === s}">
              <input type="radio" :value="s" v-model="outputSize">
              <span>{{ s }}</span>
            </label>
          </div>
        </Widget>

        <Widget title="Colors">
          <div class="settings-row">
            <label v-for="c in colorOptions" :key="c" class="pill" :class="{active: maxColors === c}">
              <input type="radio" :value="c" v-model="maxColors">
              <span>{{ c }}</span>
            </label>
          </div>
        </Widget>

        <Widget title="Adjust">
          <div class="slider-row">
            <label>Brightness <span>{{ brightness }}</span></label>
            <input type="range" v-model.number="brightness" min="-100" max="100" step="5">
          </div>
          <div class="slider-row">
            <label>Contrast <span>{{ contrast }}</span></label>
            <input type="range" v-model.number="contrast" min="-100" max="100" step="5">
          </div>
          <div class="slider-row">
            <label>Saturation <span>{{ saturation }}</span></label>
            <input type="range" v-model.number="saturation" min="-100" max="100" step="5">
          </div>
        </Widget>

        <Widget title="Palette">
          <template #ctl>
            <span class="text-xs">{{ palette.length }} colors</span>
          </template>
          <div class="palette-grid">
            <div
                v-for="(rgb, i) in palette" :key="i"
                class="palette-swatch"
                :class="{active: selectedColorIndex === i}"
                @click="selectedColorIndex = selectedColorIndex === i ? -1 : i"
            >
              <div class="swatch-color" :style="{background: `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`}"/>
              <input
                  type="color"
                  :value="rgbToHex(rgb[0], rgb[1], rgb[2])"
                  @input="(e) => editColor(i, (e.target as HTMLInputElement).value)"
                  @click.stop
              />
            </div>
          </div>
          <div v-if="selectedColorIndex >= 0" class="merge-hint">
            <p class="text-xs">Merge with another color:</p>
            <div class="palette-grid mt-2">
              <div
                  v-for="(rgb, i) in palette" :key="i"
                  v-show="i !== selectedColorIndex"
                  class="palette-swatch mergeable"
                  :style="{background: `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`}"
                  :title="`Merge into color #${i + 1}`"
                  @click="mergeColor(selectedColorIndex, i)"
              />
            </div>
          </div>
        </Widget>
      </div>
    </div>

    <input
        ref="fileInput"
        type="file"
        accept="image/*"
        class="hidden"
        @change="onFileSelect"
    />
  </div>
</template>

<style scoped>
@reference "tailwindcss";

.hero {
  @apply text-center py-4;
}

.hero h1 {
  @apply text-lg md:text-2xl;
}

.hero p {
  @apply mt-1;
  color: var(--muted);
}

.upload-zone {
  @apply flex flex-col items-center justify-center gap-2 cursor-pointer;
  min-height: 300px;
  border: 2px dashed var(--border);
  background: var(--surface);
  transition: border-color 60ms steps(2), background 60ms steps(2);
}

.upload-zone:hover {
  border-color: var(--primary);
  background: var(--surface-2);
}

.upload-icon {
  font-size: 48px;
  color: var(--primary);
}

.convert-grid {
  @apply grid gap-3;
  grid-template-columns: 1fr;
}

@media (min-width: 768px) {
  .convert-grid {
    grid-template-columns: 1fr 280px;
  }
}

.convert-preview {
  @apply flex flex-col gap-2;
}

.preview-wrapper {
  @apply flex items-center justify-center;
  min-height: 300px;
  background: var(--background);
}

.pixel-preview {
  image-rendering: pixelated;
  max-width: 100%;
  max-height: 400px;
  border: 1px solid var(--border);
}

.convert-actions {
  @apply flex gap-2;
}

.convert-settings {
  @apply flex flex-col gap-2;
}

.settings-row {
  @apply flex flex-wrap gap-1;
}

.pill {
  @apply flex items-center justify-center text-xs px-2 py-1 cursor-pointer;
  min-width: 36px;
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--foreground);
}

.pill input {
  display: none;
}

.pill.active {
  background: var(--primary);
  color: var(--primary-foreground);
  border-color: var(--shadow-px);
}

.slider-row {
  @apply flex flex-col gap-1 py-1;
}

.slider-row label {
  @apply flex justify-between items-center text-xs;
  color: var(--muted);
}

.slider-row label span {
  color: var(--primary);
}

.slider-row input[type=range] {
  width: 100%;
  accent-color: var(--primary);
}

.palette-grid {
  @apply grid grid-cols-8 gap-1;
}

.palette-swatch {
  @apply relative cursor-pointer;
  aspect-ratio: 1;
  border: 2px solid transparent;
}

.palette-swatch.active {
  border-color: var(--primary);
  outline: 1px solid var(--shadow-px);
}

.swatch-color {
  @apply absolute inset-0;
}

.palette-swatch input[type=color] {
  @apply absolute inset-0 opacity-0 cursor-pointer w-full h-full;
}

.palette-swatch.mergeable {
  border: 1px solid var(--border);
}

.palette-swatch.mergeable:hover {
  border-color: var(--primary);
  transform: scale(1.1);
}

.merge-hint {
  @apply mt-3 pt-3;
  border-top: 1px solid var(--border);
}

.hidden {
  display: none;
}
</style>
