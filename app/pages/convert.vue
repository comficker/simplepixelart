<script setup lang="ts">
import {onMounted, ref, computed, watch, nextTick} from 'vue'
import {toast} from 'vue-sonner'
import type {EditorData} from '~/types'
import {DEFAULT_EDITOR_DATA} from '~/helper/constants'
import {cloneDeep, generateUUID} from '~/helper/utils'

useCustomSeoMeta({
  title: 'Image to Pixel Art Converter - Free Online Tool',
  description: 'Convert any photo or image into pixel art in seconds. Free online tool with palette control (4–64 colors), pixel cleaner, color swap, and live preview. No signup required.',
  keywords: 'image to pixel art, photo to pixel art converter, pixelate image online, pixel art generator, convert jpg to pixel art, png to pixel art, free pixel art maker, 8-bit converter, 16-bit art generator',
  canonical: 'https://simplepixelart.com/convert',
  script: [
    {
      type: 'application/ld+json',
      innerHTML: JSON.stringify({
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'SoftwareApplication',
            name: 'Image to Pixel Art Converter',
            description: 'Free online tool that converts photos and images into pixel art with customizable palette, size, and cleanup options.',
            url: 'https://simplepixelart.com/convert',
            applicationCategory: 'GraphicsApplication',
            operatingSystem: 'Any (browser-based)',
            offers: {
              '@type': 'Offer',
              price: '0',
              priceCurrency: 'USD',
            },
            featureList: [
              'Drag and drop image upload',
              'Output sizes from 8x8 to 64x64 pixels',
              'Palette reduction 4 to 64 colors via median-cut quantization',
              'Live brightness, contrast, saturation adjustment',
              'Pixel Cleaner to remove orphan pixels',
              'Color Swap and merge palette colors',
              'One-click export to the pixel art editor',
            ],
            publisher: {
              '@type': 'Organization',
              name: 'SimplePixelArt.com',
              url: 'https://simplepixelart.com/',
            },
          },
          {
            '@type': 'HowTo',
            name: 'How to convert an image to pixel art',
            description: 'Turn any photo into pixel art in three steps with our free online converter.',
            totalTime: 'PT30S',
            step: [
              {
                '@type': 'HowToStep',
                name: 'Upload your image',
                text: 'Click the upload area or drag and drop a PNG, JPG, or WebP file.',
              },
              {
                '@type': 'HowToStep',
                name: 'Pick size and palette',
                text: 'Choose output pixel width (8–64) and number of colors (4–64). The preview updates live.',
              },
              {
                '@type': 'HowToStep',
                name: 'Polish and open in editor',
                text: 'Clean orphan pixels, swap colors, then click Open in Editor to keep drawing or export.',
              },
            ],
          },
          {
            '@type': 'FAQPage',
            mainEntity: [
              {
                '@type': 'Question',
                name: 'Is this image to pixel art converter free?',
                acceptedAnswer: {
                  '@type': 'Answer',
                  text: 'Yes. The entire tool runs in your browser and is completely free with no signup required.',
                },
              },
              {
                '@type': 'Question',
                name: 'What image formats can I upload?',
                acceptedAnswer: {
                  '@type': 'Answer',
                  text: 'PNG, JPG, and WebP images are supported. Drag and drop or click to select a file.',
                },
              },
              {
                '@type': 'Question',
                name: 'How does the Pixel Cleaner work?',
                acceptedAnswer: {
                  '@type': 'Answer',
                  text: 'Pixel Cleaner finds isolated pixels with no same-colored neighbors and replaces them with the majority color around them, producing cleaner sprites.',
                },
              },
              {
                '@type': 'Question',
                name: 'Can I edit the result after conversion?',
                acceptedAnswer: {
                  '@type': 'Answer',
                  text: 'Yes. Click Open in Editor to load the converted pixel art into our full-featured online editor for further touch-ups.',
                },
              },
            ],
          },
        ],
      }),
    },
  ],
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

async function convert() {
  if (!sourceImage.value) return
  const img = sourceImage.value
  const ratio = img.width / img.height
  const w = outputSize.value
  const h = Math.round(w / ratio) || w
  const grid = sampleImage(img, w, h)
  const {palette: p, indexed} = quantize(grid, maxColors.value)
  palette.value = p
  pixels.value = indexed
  await nextTick()
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
      <h1>Image to Pixel Art Converter</h1>
      <p class="hero-sub">Turn any photo into pixel art in seconds. Free, no signup, runs in your browser.</p>
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
      <p class="text-xs text-muted mt-1">PNG, JPG, or WebP</p>
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
          <button class="btn primary block" @click="sendToEditor">
            <span class="icon icon-brush"/>
            <span>Open in Editor</span>
          </button>
          <button class="btn block" @click="cleanOrphans">
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

    <!-- SEO content -->
    <section class="seo-section">
      <h2 class="seo-heading">How this converter works</h2>
      <p>Our free image to pixel art converter runs entirely in your browser. Upload any PNG, JPG, or WebP, pick an output size, and the tool resamples your image and reduces its palette using a <strong>median-cut quantization algorithm</strong> — the same technique used in retro game tools to pick the most representative colors. Every change updates the preview live.</p>
    </section>

    <section class="seo-section">
      <h2 class="seo-heading">Features</h2>
      <ul class="seo-list feature-list">
        <li>
          <span class="icon icon-plus feature-bullet" aria-hidden="true"/>
          <span><strong>Flexible output size.</strong> Convert to 8×8, 16×16, 32×32, 48×48, or up to 64×64 pixels. Aspect ratio preserved automatically.</span>
        </li>
        <li>
          <span class="icon icon-plus feature-bullet" aria-hidden="true"/>
          <span><strong>Palette control.</strong> Limit to 4, 8, 16, 32, or 64 colors. Smaller palettes produce that crisp retro look; larger palettes keep more detail.</span>
        </li>
        <li>
          <span class="icon icon-plus feature-bullet" aria-hidden="true"/>
          <span><strong>Live image adjustments.</strong> Brightness, contrast, and saturation sliders re-run the conversion on every change.</span>
        </li>
        <li>
          <span class="icon icon-plus feature-bullet" aria-hidden="true"/>
          <span><strong>Pixel Cleaner.</strong> Removes orphan pixels — isolated single dots with no matching neighbor — replacing them with the majority color around them. Great for cleaning sprites after quantization.</span>
        </li>
        <li>
          <span class="icon icon-plus feature-bullet" aria-hidden="true"/>
          <span><strong>Color Swap & Merge.</strong> Click any palette swatch to pick a replacement color, or merge two palette colors into one to simplify your output further.</span>
        </li>
        <li>
          <span class="icon icon-plus feature-bullet" aria-hidden="true"/>
          <span><strong>One-click editor handoff.</strong> Open the result in our full pixel art editor for touch-ups, layers, export to PNG/SVG/JSON, and sharing.</span>
        </li>
      </ul>
    </section>

    <section class="seo-section">
      <h2 class="seo-heading">Screenshot</h2>
      <figure class="screenshot">
        <img
            src="/screenshot/Image-to-Pixel-Art-Converter.png"
            alt="Image to Pixel Art Converter interface showing live preview, size and color palette controls, brightness contrast saturation sliders, and generated pixel art output"
            title="Image to Pixel Art Converter — live preview with palette and adjustment controls"
            loading="lazy"
            decoding="async"
        />
        <figcaption class="text-xs">Live preview, palette control, and image adjustments in one view.</figcaption>
      </figure>
    </section>

    <section class="seo-section">
      <h2 class="seo-heading">Frequently asked questions</h2>
      <div class="qa-list">
        <details class="qa-item">
          <summary class="qa-q">
            <span class="qa-q-text">Is this tool really free?</span>
            <span class="qa-chevron" aria-hidden="true"/>
          </summary>
          <div class="qa-a">
            <p>Yes. The entire converter runs in your browser. No account, no watermark, no upload to any server.</p>
          </div>
        </details>
        <details class="qa-item">
          <summary class="qa-q">
            <span class="qa-q-text">What image formats are supported?</span>
            <span class="qa-chevron" aria-hidden="true"/>
          </summary>
          <div class="qa-a">
            <p>PNG, JPG, and WebP. Drag and drop a file onto the upload area or click to browse.</p>
          </div>
        </details>
        <details class="qa-item">
          <summary class="qa-q">
            <span class="qa-q-text">How does the Pixel Cleaner work?</span>
            <span class="qa-chevron" aria-hidden="true"/>
          </summary>
          <div class="qa-a">
            <p>It scans the output for pixels that have no same-colored neighbors (orphans) and replaces each one with the majority color of its four-direction neighbors. This smooths out speckle that quantization often produces from photos.</p>
          </div>
        </details>
        <details class="qa-item">
          <summary class="qa-q">
            <span class="qa-q-text">Can I edit the result after conversion?</span>
            <span class="qa-chevron" aria-hidden="true"/>
          </summary>
          <div class="qa-a">
            <p>Yes. Click <strong>Open in Editor</strong> to load the converted pixel art into our full online editor with brush, fill, layers, undo/redo, and export options.</p>
          </div>
        </details>
        <details class="qa-item">
          <summary class="qa-q">
            <span class="qa-q-text">What's the difference between this and other pixel art converters?</span>
            <span class="qa-chevron" aria-hidden="true"/>
          </summary>
          <div class="qa-a">
            <p>Live preview on every setting change, preserved aspect ratio, color merge for manual palette cleanup, orphan-pixel cleaner for noise-free sprites, and a direct handoff to a full editor. No downloads, no signup.</p>
          </div>
        </details>
      </div>
    </section>
  </div>
</template>

<style scoped>
.hero {
  padding-top: 1rem;
  padding-bottom: 1rem;
}

@media (min-width: 768px) {
  .hero {
    padding-top: 1.5rem;
    padding-bottom: 1.5rem;
  }
}

.hero h1 {
  font-size: var(--text-2xl);
  line-height: 1.1;
  font-weight: 700;
  letter-spacing: -0.015em;
}

@media (min-width: 768px) {
  .hero h1 {
    font-size: var(--text-4xl);
  }
}

.hero-sub {
  margin-top: 0.5rem;
  color: var(--muted);
  font-size: var(--text-sm);
  line-height: 1.55;
}

@media (min-width: 768px) {
  .hero-sub {
    font-size: var(--text-base);
  }
}

.upload-zone {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  cursor: pointer;
  padding-top: 2rem;
  padding-bottom: 2rem;
  border: 2px dashed var(--border);
  background: var(--surface);
  border-radius: var(--radius);
  transition: border-color var(--transition), background var(--transition);
}

@media (hover: hover) and (pointer: fine) {
  .upload-zone:hover {
    border-color: var(--primary);
    background: var(--surface-2);
  }
}

.upload-icon {
  font-size: 48px;
  color: var(--primary);
}

.convert-grid {
  display: grid;
  gap: 0.75rem;
  grid-template-columns: 1fr;
}

@media (min-width: 768px) {
  .convert-grid {
    grid-template-columns: 1fr 280px;
  }
}

.convert-preview {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.preview-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  aspect-ratio: 1 / 1;
  background: var(--background);
}

.pixel-preview {
  image-rendering: pixelated;
  max-width: 100%;
  max-height: 400px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}

.convert-actions {
  display: flex;
  gap: 0.5rem;
}

.convert-settings {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.settings-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}

.pill {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--text-xs);
  line-height: var(--text-xs-lh);
  padding: 0.25rem 0.5rem;
  cursor: pointer;
  min-width: 36px;
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--foreground);
  border-radius: var(--radius-sm);
  transition: background var(--transition), color var(--transition), border-color var(--transition);
}

.pill input {
  display: none;
}

.pill.active {
  background: var(--primary);
  color: var(--primary-foreground);
  border-color: var(--primary);
}

.slider-row {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding-top: 0.25rem;
  padding-bottom: 0.25rem;
}

.slider-row label {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: var(--text-xs);
  line-height: var(--text-xs-lh);
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
  display: grid;
  grid-template-columns: repeat(8, minmax(0, 1fr));
  gap: 0.25rem;
}

.palette-swatch {
  position: relative;
  cursor: pointer;
  aspect-ratio: 1;
  border: 2px solid transparent;
  border-radius: var(--radius-sm);
  overflow: hidden;
}

.palette-swatch.active {
  border-color: var(--primary);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--primary) 35%, transparent);
}

.swatch-color {
  position: absolute;
  inset: 0;
}

.palette-swatch input[type=color] {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
  width: 100%;
  height: 100%;
}

.palette-swatch.mergeable {
  border: 1px solid var(--border);
}

@media (hover: hover) and (pointer: fine) {
  .palette-swatch.mergeable:hover {
    border-color: var(--primary);
    transform: scale(1.1);
  }
}

.merge-hint {
  margin-top: 0.75rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--border);
}

.seo-section {
  padding-top: 0.75rem;
  padding-bottom: 0.75rem;
  border-top: 1px solid var(--border);
}

.seo-section > * + * {
  margin-top: 0.5rem;
}

.seo-heading {
  font-size: var(--text-2xl);
  line-height: var(--text-2xl-lh);
  font-weight: 700;
  color: var(--foreground);
}

.seo-section p {
  line-height: 1.625;
  color: var(--foreground);
}

.seo-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.seo-list li {
  font-size: var(--text-sm);
  line-height: 1.625;
  color: var(--foreground);
}

.feature-list li {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
}

.feature-list .feature-bullet {
  flex-shrink: 0;
  color: var(--primary);
  width: 1em;
  height: 1em;
  margin-top: 0.35em;
}

.screenshot {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  margin: 0;
}

.screenshot img {
  width: 100%;
  max-width: 48rem;
  border: 1px solid var(--border);
  box-shadow: var(--shadow);
  border-radius: var(--radius);
  image-rendering: auto;
}

.screenshot figcaption {
  color: var(--muted);
  text-align: center;
}
</style>
