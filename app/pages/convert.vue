<script setup lang="ts">
import {ref, computed, watch, nextTick} from 'vue'
import {toast} from 'vue-sonner'
import type {EditorData} from '~/types'
import {DEFAULT_EDITOR_DATA} from '~/helper/constants'
import {cloneDeep, debounce, generateUUID, getStorageItem} from '~/helper/utils'
import {cleanOrphanCells, convertImageToGrid} from '~/helper/pixel'

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
              'Auto size: detects the native pixel grid of upscaled pixel art',
              'Output sizes from 8x8 to 64x64 pixels',
              'Palette reduction 4 to 64 colors via median-cut quantization',
              'Transparent background removal',
              'Ordered (Bayer) dithering for photo gradients',
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

const outputSize = ref<number | 'auto'>('auto')
const maxColors = ref(16)
const brightness = ref(0)
const contrast = ref(0)
const saturation = ref(0)
const bgCut = ref(false)
const dither = ref(false)

const pixels = ref<number[][]>([])
const isNative = ref(false)
const palette = ref<RGB[]>([])
const selectedColorIndex = ref<number>(-1)

const hasImage = computed(() => !!sourceImage.value)

const sizeOptions: (number | 'auto')[] = ['auto', 8, 12, 16, 20, 24, 32, 48, 64]
const colorOptions = [4, 8, 16, 32, 64]

function openFileDialog() {
  fileInput.value?.click()
}

function onFileSelect(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  loadFile(file)
}

const sourceUrl = ref('')

function loadFile(file: File) {
  const reader = new FileReader()
  reader.onload = (e) => {
    const url = e.target?.result as string
    const img = new Image()
    img.onload = () => {
      sourceImage.value = img
      sourceUrl.value = url
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

let convertRun = 0

async function convert() {
  if (!sourceImage.value) return
  const run = ++convertRun
  const res = await convertImageToGrid(sourceImage.value, {
    size: outputSize.value,
    maxColors: maxColors.value,
    brightness: brightness.value,
    contrast: contrast.value,
    saturation: saturation.value,
    dataUrl: sourceUrl.value,
    cutBackground: bgCut.value,
    dither: dither.value,
  })
  if (!res || run !== convertRun) return
  isNative.value = !!res.native
  palette.value = res.palette
  pixels.value = res.indexed
  await nextTick()
  drawPreview()
}

function cleanOrphans() {
  if (!pixels.value.length) return
  const {grid, changed} = cleanOrphanCells(pixels.value)
  pixels.value = grid
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
      if (idx < 0) continue
      const rgb = palette.value[idx]!
      ctx.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`
      ctx.fillRect(x * cellW, y * cellH, Math.ceil(cellW), Math.ceil(cellH))
    }
  }
}

function sendToEditor() {
  if (!pixels.value.length) return
  const h = pixels.value.length
  const w = pixels.value[0]!.length
  const id = generateUUID()
  const layerPixels: {[key: string]: number} = {}
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = pixels.value[y]![x]!
      if (idx < 0) continue
      layerPixels[`${x}_${y}`] = idx
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
  const ws = getStorageItem('workspaces')
  ws[id] = data
  localStorage.setItem('workspaces', JSON.stringify(ws))
  localStorage.setItem('workspace_current', id)
  navigateTo(`/editor?id=${id}`)
}

const debouncedConvert = debounce(() => { if (sourceImage.value) convert() }, 150)
watch([outputSize, maxColors, brightness, contrast, saturation, bgCut, dither], () => debouncedConvert())

const faq = [
  {q: 'Is this tool really free?', a: `<p>Yes. The entire converter runs in your browser. No account, no watermark, no upload to any server.</p>`},
  {q: 'What image formats are supported?', a: `<p>PNG, JPG, and WebP. Drag and drop a file onto the upload area or click to browse.</p>`},
  {q: 'How does the Pixel Cleaner work?', a: `<p>It scans the output for pixels that have no same-colored neighbors (orphans) and replaces each one with the majority color of its four-direction neighbors. This smooths out speckle that quantization often produces from photos.</p>`},
  {q: 'Can I edit the result after conversion?', a: `<p>Yes. Click <strong>Open in Editor</strong> to load the converted pixel art into our full online editor with brush, fill, layers, undo/redo, and export options.</p>`},
  {q: "What's the difference between this and other pixel art converters?", a: `<p>Auto size that reads real pixel art back at its native resolution (most converters blindly resample it), transparent background removal, Bayer dithering, live preview on every setting change, color merge, an orphan-pixel cleaner, and a direct handoff to a full editor. No downloads, no signup.</p>`},
  {q: 'What does the Auto size do?', a: `<p>If your image is pixel art that was upscaled, screenshotted, JPEG-compressed, or captured with grid lines, Auto detects the original cell size and reads the art back cell for cell — no detail lost, no blur. For photos it estimates a sensible output size instead.</p>`},
]
</script>

<template>
  <div class="page">

    <div class="convert-grid flat-editor">

      <div class="convert-preview">
        <Widget title="Pixel Preview">
          <template #ctl>
            <button v-if="hasImage" class="text-xs" @click="openFileDialog">Change image</button>
          </template>
          <div class="preview-wrapper">
            <canvas v-show="hasImage" ref="previewCanvas" class="pixel-preview" :class="{checker: bgCut}"/>
            <div
                v-if="!hasImage"
                class="upload-zone"
                @click="openFileDialog"
                @drop="onDrop"
                @dragover.prevent
            >
              <span class="icon icon-upload upload-icon"/>
              <p class="text-sm">Click or drop an image here</p>
              <p class="text-xs text-muted">PNG, JPG, or WebP</p>
              <button class="btn primary" @click.stop="openFileDialog">Choose file</button>
            </div>
          </div>
        </Widget>

        <div v-if="hasImage" class="convert-actions">
          <button class="btn primary block" @click="sendToEditor">
            <span class="icon icon-pen"/>
            <span>Open in Editor</span>
          </button>
          <button class="btn block" @click="cleanOrphans">
            <span class="icon icon-broom"/>
            <span>Clean Orphans</span>
          </button>
        </div>
      </div>

      <div class="convert-settings">
        <Widget title="Size">
          <div class="settings-row" title="Auto reads the image's own pixel grid when it has one">
            <label v-for="s in sizeOptions" :key="s" class="pill" :class="{active: outputSize === s}">
              <input type="radio" :value="s" v-model="outputSize">
              <span>{{ s === 'auto' ? 'Auto' : s }}</span>
            </label>
          </div>
          <p v-if="outputSize === 'auto' && pixels.length" class="tool-note">
            Auto → {{ pixels[0]!.length }}×{{ pixels.length }}{{ isNative ? ' — native grid detected' : '' }}
          </p>
        </Widget>

        <Widget title="Colors">
          <div class="settings-row">
            <label v-for="c in colorOptions" :key="c" class="pill" :class="{active: maxColors === c}">
              <input type="radio" :value="c" v-model="maxColors">
              <span>{{ c }}</span>
            </label>
          </div>
          <label class="cv-check" title="Cut a uniform backdrop to transparency — the sprite lands in the editor with nothing behind it">
            <input v-model="bgCut" type="checkbox">
            <span class="text-xs">Transparent background</span>
          </label>
          <label class="cv-check" title="Ordered (Bayer) dithering — fakes gradients a small palette can't hold; best on photos">
            <input v-model="dither" type="checkbox">
            <span class="text-xs">Dithering</span>
          </label>
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

    <Widget title="More tools" class="tool-more">
      <ToolPaths exclude="convert"/>
    </Widget>

    <ToolReadme>
      <h1>Image to Pixel Art Converter</h1>
      <p>Turn any photo into pixel art in seconds — free, no signup, and everything runs in your browser.</p>

      <h2>How to use it</h2>
      <ol>
        <li><strong>Upload an image</strong> — drag and drop a PNG, JPG or WebP, or click to browse. Nothing is uploaded — it all runs in your browser.</li>
        <li><strong>Pick size &amp; palette</strong> — keep <strong>Auto</strong> (it reads the image's own pixel grid when there is one — even from an upscaled, JPEG-compressed or grid-lined screenshot) or choose a size from <code>8×8</code> to <code>64×64</code>; pick a color count (4–64) or lock the output to a community palette, then tune brightness, contrast and saturation live.</li>
        <li><strong>Clean up &amp; export</strong> — run the Pixel Cleaner, merge colors, then open the result in the editor or save your pixel art.</li>
      </ol>

      <h2>How this converter works</h2>
      <p>Our free image to pixel art converter runs entirely in your browser. Upload any PNG, JPG, or WebP, pick an output size, and the tool resamples your image and reduces its palette using a <strong>median-cut quantization algorithm</strong> — the same technique used in retro game tools to pick the most representative colors. Every change updates the preview live.</p>

      <h2>Features</h2>
      <ul>
        <li><strong>Flexible output size</strong> — convert to 8×8, 16×16, 32×32, 48×48, or up to 64×64 pixels. Aspect ratio preserved automatically.</li>
        <li><strong>Palette control</strong> — limit to 4, 8, 16, 32, or 64 colors. Smaller palettes produce that crisp retro look; larger palettes keep more detail.</li>
        <li><strong>Live image adjustments</strong> — brightness, contrast, and saturation sliders re-run the conversion on every change.</li>
        <li><strong>Pixel Cleaner</strong> — removes orphan pixels (isolated single dots with no matching neighbor), replacing them with the majority color around them.</li>
        <li><strong>Auto size</strong> — pixel art that was exported at 8× or screenshotted with grid lines is read back at its true resolution, cell for cell, instead of being blindly resampled.</li>
        <li><strong>Transparent background</strong> — cut a uniform backdrop to real transparency; the sprite lands in the editor with nothing behind it.</li>
        <li><strong>Dithering</strong> — ordered (Bayer) dithering fakes the gradients a small palette can't hold; best on photos.</li>
        <li><strong>Color Swap &amp; Merge</strong> — click any palette swatch to pick a replacement color, or merge two palette colors into one to simplify your output.</li>
        <li><strong>One-click editor handoff</strong> — open the result in the full pixel art editor for touch-ups, layers, export to PNG/SVG/JSON, and sharing.</li>
      </ul>

      <h2>Screenshot</h2>
      <figure>
        <img
            src="/screenshot/Image-to-Pixel-Art-Converter.png"
            alt="Image to Pixel Art Converter interface showing live preview, size and color palette controls, brightness contrast saturation sliders, and generated pixel art output"
            title="Image to Pixel Art Converter — live preview with palette and adjustment controls"
            loading="lazy"
            decoding="async"
        />
        <figcaption>Live preview, palette control, and image adjustments in one view.</figcaption>
      </figure>

      <QnA :items="faq"/>
    </ToolReadme>
  </div>
</template>

<style scoped>

.upload-zone {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-3);
  flex: 1;
  align-self: stretch;
  width: 100%;
  cursor: pointer;
  padding: var(--space-4);
  border: 2px dashed var(--border);
  background: var(--surface);
  border-radius: var(--radius-sm);
  transition: border-color var(--transition), background var(--transition);
}

@media (hover: hover) and (pointer: fine) {
  .upload-zone:hover {
    background: var(--surface-2);
  }
}

.upload-icon {
  font-size: 48px;
  color: var(--primary);
}

.convert-grid {
  display: grid;
  gap: 0;
  grid-template-columns: 1fr;
  align-items: stretch;
}

@media (min-width: 768px) {
  .convert-grid {
    grid-template-columns: 1fr 190px;
  }
}

.convert-preview {
  display: flex;
  flex-direction: column;
  gap: 0;
  border-bottom: 1px solid var(--border);
}

@media (min-width: 768px) {
  .convert-preview {
    border-bottom: 0;
    border-right: 1px solid var(--border);
  }
}

.convert-settings :deep(.widget + .widget) {
  border-top: 1px solid var(--border);
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
  gap: var(--space-2);
  padding: var(--space-3);
  border-top: 1px solid var(--border);
}

.convert-settings {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.cv-check {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-top: var(--space-2);
  cursor: pointer;
}

.pixel-preview.checker {
  background:
      repeating-conic-gradient(color-mix(in oklab, var(--muted) 18%, transparent) 0% 25%, transparent 0% 50%)
      0 0 / 16px 16px;
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

.palette-grid {
  display: grid;
  grid-template-columns: repeat(8, minmax(0, 1fr));
  gap: var(--space-1);
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

.merge-hint {
  margin-top: 0.75rem;
}
</style>
