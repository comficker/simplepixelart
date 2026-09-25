<script setup lang="ts">
const localePath = useLocalePath()
const {t} = useI18n()
import {ref, computed, watch, nextTick} from 'vue'
import {toast} from 'vue-sonner'
import type {EditorData} from '~/types'
import {DEFAULT_EDITOR_DATA} from '~/helper/constants'
import {cloneDeep, debounce, generateUUID, getStorageItem} from '~/helper/utils'
import {cleanOrphanCells, convertImageToGrid} from '~/helper/pixel'

useCustomSeoMeta({
  title: () => t('seo.converter.title'),
  description: () => t('seo.converter.description'),
  keywords: () => t('seo.converter.keywords'),
  canonical: 'https://simplepixelart.com/converter',
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
            url: 'https://simplepixelart.com/converter',
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
  navigateTo(localePath(`/editor?id=${id}`))
}

const debouncedConvert = debounce(() => { if (sourceImage.value) convert() }, 150)
watch([outputSize, maxColors, brightness, contrast, saturation, bgCut, dither], () => debouncedConvert())

const faq = computed(() => [
  {q: t('p_converter.faq0q'), a: t('p_converter.faq0a')},
  {q: t('p_converter.faq1q'), a: t('p_converter.faq1a')},
  {q: t('p_converter.faq2q'), a: t('p_converter.faq2a')},
  {q: t('p_converter.faq3q'), a: t('p_converter.faq3a')},
  {q: t('p_converter.faq4q'), a: t('p_converter.faq4a')},
])
</script>

<template>
  <ToolLayout :title="$t('p_converter.converter')">

    <div class="editor-body flat-editor">

      <div class="canvas-col">
        <Widget :title="$t('p_converter.pixelPreview')">
          <template #ctl>
            <button v-if="hasImage" class="widget-ctl-btn" @click="openFileDialog">
              <span class="icon icon-image"/>
              <span>{{ $t('p_converter.changeImage') }}</span>
            </button>
          </template>
          <div class="preview-wrapper">
            <canvas v-show="hasImage" ref="previewCanvas" class="pixel-preview" :class="{checker: bgCut}"/>
            <div
                v-if="!hasImage"
                class="dropzone"
                @click="openFileDialog"
                @drop="onDrop"
                @dragover.prevent
            >
              <span class="icon icon-upload dropzone-icon"/>
              <p class="dropzone-title">{{ $t('p_converter.clickOrDropAnImageHere') }}</p>
              <p class="dropzone-hint">{{ $t('common.pngJpgOrWebp') }}</p>
              <button class="btn primary" @click.stop="openFileDialog">{{ $t('p_converter.chooseFile') }}</button>
            </div>
          </div>
        </Widget>

        <div v-if="hasImage" class="convert-actions">
          <button class="btn primary block" @click="sendToEditor">
            <span class="icon icon-pen"/>
            <span>{{ $t('common.openInEditor2') }}</span>
          </button>
          <button class="btn block" @click="cleanOrphans">
            <span class="icon icon-broom"/>
            <span>{{ $t('p_converter.cleanOrphans') }}</span>
          </button>
        </div>
      </div>

      <div class="editor-sidebar">
        <Widget :title="$t('common.size')">
          <div class="settings-row" :title="$t('p_converter.autoReadsTheImageSOwn')">
            <label v-for="s in sizeOptions" :key="s" class="pill" :class="{active: outputSize === s}">
              <input type="radio" :value="s" v-model="outputSize">
              <span>{{ s === 'auto' ? 'Auto' : s }}</span>
            </label>
          </div>
          <p v-if="outputSize === 'auto' && pixels.length" class="tool-note">
            Auto → {{ pixels[0]!.length }}×{{ pixels.length }}{{ isNative ? ' — native grid detected' : '' }}
          </p>
        </Widget>

        <Widget :title="$t('common.colors')">
          <div class="settings-row">
            <label v-for="c in colorOptions" :key="c" class="pill" :class="{active: maxColors === c}">
              <input type="radio" :value="c" v-model="maxColors">
              <span>{{ c }}</span>
            </label>
          </div>
          <label class="editor-check" :title="$t('p_converter.cutAUniformBackdropToTransparency')">
            <input v-model="bgCut" type="checkbox">
            <span class="text-xs">{{ $t('p_converter.transparentBackground') }}</span>
          </label>
          <label class="editor-check" :title="$t('p_converter.orderedBayerDitheringFakesGradient')">
            <input v-model="dither" type="checkbox">
            <span class="text-xs">{{ $t('p_converter.dithering') }}</span>
          </label>
        </Widget>

        <Widget :title="$t('p_converter.adjust')">
          <div class="slider-row">
            <label>{{ $t('p_converter.brightness') }} <span>{{ brightness }}</span></label>
            <input type="range" v-model.number="brightness" min="-100" max="100" step="5">
          </div>
          <div class="slider-row">
            <label>{{ $t('p_converter.contrast') }} <span>{{ contrast }}</span></label>
            <input type="range" v-model.number="contrast" min="-100" max="100" step="5">
          </div>
          <div class="slider-row">
            <label>{{ $t('p_converter.saturation') }} <span>{{ saturation }}</span></label>
            <input type="range" v-model.number="saturation" min="-100" max="100" step="5">
          </div>
        </Widget>

        <Widget :title="$t('common.palette')">
          <template #ctl>
            <span class="text-xs">{{ $t('common.nColors', {count: palette.length}) }}</span>
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
            <p class="text-xs">{{ $t('p_converter.mergeWithAnotherColor') }}</p>
            <div class="palette-grid mt-2">
              <div
                  v-for="(rgb, i) in palette" :key="i"
                  v-show="i !== selectedColorIndex"
                  class="palette-swatch mergeable"
                  :style="{background: `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`}"
                  :title="$t('p_converter.mergeIntoColorN', {n: i + 1})"
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


    <template #status>
      <p class="editor-foot-hint text-xs text-muted">
        <template v-if="hasImage">
          {{ sourceImage?.naturalWidth }}×{{ sourceImage?.naturalHeight }}px →
          {{ pixels[0]?.length || 0 }}×{{ pixels.length }}px ·
          {{ palette.length }} colors<template v-if="isNative"> {{ $t('p_converter.nativeGrid') }}</template>
        </template>
        <template v-else>{{ $t('p_converter.noImageYetDropOneTo') }}</template>
      </p>
    </template>

    <template #doc>
      <h1>{{ $t('p_converter.imageToPixelArtConverter') }}</h1>
      <p v-html="$t('p_converter.turnAnyPhotoIntoPixelArt')"/>

      <h2>{{ $t('common.howToUseIt') }}</h2>
      <ol>
        <li v-html="$t('p_converter.strongUploadAnImageStrongDrag')"/>
        <li v-html="$t('p_converter.strongPickSizePaletteStrongKeep')"/>
        <li v-html="$t('p_converter.strongCleanUpExportStrongRun')"/>
      </ol>

      <h2>{{ $t('p_converter.howThisConverterWorks') }}</h2>
      <p v-html="$t('p_converter.ourFreeImageToPixelArt')"/>

      <h2>{{ $t('common.features') }}</h2>
      <ul>
        <li v-html="$t('p_converter.strongFlexibleOutputSizeStrongConv')"/>
        <li v-html="$t('p_converter.strongPaletteControlStrongLimitTo')"/>
        <li v-html="$t('p_converter.strongLiveImageAdjustmentsStrongBr')"/>
        <li v-html="$t('p_converter.strongPixelCleanerStrongRemovesOrp')"/>
        <li v-html="$t('p_converter.strongAutoSizeStrongPixelArt')"/>
        <li v-html="$t('p_converter.strongTransparentBackgroundStrongC')"/>
        <li v-html="$t('p_converter.strongDitheringStrongOrderedBayerD')"/>
        <li v-html="$t('p_converter.strongColorSwapMergeStrongClick')"/>
        <li v-html="$t('p_converter.strongOneClickEditorHandoffStrong')"/>
      </ul>

      <h2>{{ $t('p_converter.screenshot') }}</h2>
      <figure>
        <img
            src="/screenshot/Image-to-Pixel-Art-Converter.png"
            :alt="$t('p_converter.imageToPixelArtConverterInterface')"
            :title="$t('p_converter.imageToPixelArtConverterLive')"
            loading="lazy"
            decoding="async"
        />
        <figcaption>{{ $t('p_converter.livePreviewPaletteControlAnd') }}</figcaption>
      </figure>

      <QnA :items="faq"/>
    </template>
  </ToolLayout>
</template>

<style scoped>


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


.pixel-preview.checker {
  background:
      repeating-conic-gradient(color-mix(in oklab, var(--muted) 18%, transparent) 0% 25%, transparent 0% 50%)
      0 0 / 16px 16px;
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
