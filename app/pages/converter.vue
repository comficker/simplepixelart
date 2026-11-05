<script setup lang="ts">
const localePath = useLocalePath()
const {t} = useI18n()
import {toast} from 'vue-sonner'
import type {EditorData} from '~/types'
import {DEFAULT_EDITOR_DATA} from '~/helper/constants'
import {cloneDeep, debounce, generateUUID, getStorageItem} from '~/helper/utils'
import {cleanOrphanCells, convertImageToGrid} from '~/helper/pixel'
import {hexToRgb, rgbToHex} from '~/helper/color'

// Everything in the JSON-LD is read from the same strings the page shows,
// in the page's own language, so the structured data never says something
// the reader can't see.
const plain = (html: string) => html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
const STEP_KEYS = ['strongUploadAnImageStrongDrag', 'strongPickSizePaletteStrongKeep', 'strongCleanUpExportStrongRun']
const FEATURE_KEYS = [
  'strongFlexibleOutputSizeStrongConv', 'strongPaletteControlStrongLimitTo', 'strongLiveImageAdjustmentsStrongBr',
  'strongPixelCleanerStrongRemovesOrp', 'strongAutoSizeStrongPixelArt', 'strongTransparentBackgroundStrongC',
  'strongDitheringStrongOrderedBayerD', 'strongColorSwapMergeStrongClick', 'strongOneClickEditorHandoffStrong',
]
const faq = computed(() => [0, 1, 2, 3, 4, 5, 6].map(i => ({q: t(`p_converter.faq${i}q`), a: t(`p_converter.faq${i}a`)})))

const {locale, defaultLocale} = useI18n()
const pageUrl = computed(() => `https://simplepixelart.com${locale.value === defaultLocale ? '' : `/${locale.value}`}/converter`)
const jsonLd = computed(() => {
  const name = t('p_converter.imageToPixelArtConverter')
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebApplication',
        name,
        description: t('seo.converter.description'),
        url: pageUrl.value,
        inLanguage: locale.value,
        applicationCategory: 'GraphicsApplication',
        operatingSystem: 'Any (browser-based)',
        offers: {'@type': 'Offer', price: '0', priceCurrency: 'USD'},
        featureList: FEATURE_KEYS.map(k => plain(t(`p_converter.${k}`))),
        publisher: {'@type': 'Organization', name: 'SimplePixelArt.com', url: 'https://simplepixelart.com/'},
      },
      {
        '@type': 'HowTo',
        name,
        inLanguage: locale.value,
        step: STEP_KEYS.map(k => {
          const html = t(`p_converter.${k}`)
          const head = html.match(/<strong>(.*?)<\/strong>/)?.[1] || ''
          return {'@type': 'HowToStep', name: plain(head), text: plain(html)}
        }),
      },
      {
        '@type': 'FAQPage',
        inLanguage: locale.value,
        mainEntity: faq.value.map(f => ({'@type': 'Question', name: f.q, acceptedAnswer: {'@type': 'Answer', text: plain(f.a)}})),
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          {'@type': 'ListItem', position: 1, name: t('nav.home'), item: 'https://simplepixelart.com/'},
          {'@type': 'ListItem', position: 2, name, item: pageUrl.value},
        ],
      },
    ],
  })
})

useCustomSeoMeta({
  title: () => t('seo.converter.title'),
  description: () => t('seo.converter.description'),
  keywords: () => t('seo.converter.keywords'),
  canonical: 'https://simplepixelart.com/converter',
  script: [{type: 'application/ld+json', innerHTML: jsonLd}],
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
const dragging = ref(false)

const sizeOptions: (number | 'auto')[] = ['auto', 8, 12, 16, 20, 24, 32, 48, 64]
const colorOptions = [4, 8, 16, 32, 64]

function openFileDialog() {
  fileInput.value?.click()
}

function onFileSelect(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
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
  dragging.value = false
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
  toast.success(t('p_converter.cleanedOrphans', {count: changed}, changed))
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
  toast.success(t('p_converter.colorsMerged'))
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
    colors: palette.value.map(p => rgbToHex(p[0]!, p[1]!, p[2]!).toUpperCase()),
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

</script>

<template>
  <ToolLayout>

    <div class="editor-body flat-editor">

      <div class="canvas-col">
        <Widget :title="$t('p_converter.imageToPixelConverter')">
          <template #ctl>
            <button v-if="hasImage" class="widget-ctl-btn" @click="openFileDialog">
              <span class="icon icon-image"/>
              <span>{{ $t('p_converter.changeImage') }}</span>
            </button>
          </template>
          <!-- Drops land anywhere on the stage, before or after an image is loaded. -->
          <div
              class="preview-wrapper"
              :class="{'is-dragging': dragging}"
              @dragover.prevent="dragging = true"
              @dragleave.self="dragging = false"
              @drop.prevent="onDrop"
          >
            <canvas v-show="hasImage" ref="previewCanvas" class="pixel-preview" :class="{checker: bgCut}"/>
            <div
                v-if="!hasImage"
                class="dropzone"
                @click="openFileDialog"
            >
              <span class="icon icon-upload dropzone-icon"/>
              <p class="dropzone-title">{{ $t('p_converter.clickOrDropAnImageHere') }}</p>
              <p class="dropzone-hint">{{ $t('common.pngJpgOrWebp') }}</p>
              <button class="btn primary" @click.stop="openFileDialog">{{ $t('p_converter.chooseFile') }}</button>
            </div>
          </div>
        </Widget>

        <div v-if="hasImage" class="tool-actions">
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
              <span>{{ s === 'auto' ? $t('common.auto') : s }}</span>
            </label>
          </div>
          <p v-if="outputSize === 'auto' && pixels.length" class="tool-note">
            {{ $t('p_converter.autoResult', {w: pixels[0]!.length, h: pixels.length}) }}{{ isNative ? $t('p_converter.nativeGridDetected') : '' }}
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
            </div>
          </div>
          <div v-if="selectedColorIndex >= 0" class="merge-hint">
            <label class="edit-color text-xs">
              <input
                  type="color"
                  :value="rgbToHex(palette[selectedColorIndex][0], palette[selectedColorIndex][1], palette[selectedColorIndex][2])"
                  @input="(e) => editColor(selectedColorIndex, (e.target as HTMLInputElement).value)"
              />
              {{ $t('common.edit') }}
            </label>
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
          {{ $t('common.nColors', {count: palette.length}) }}<template v-if="isNative"> {{ $t('p_converter.nativeGrid') }}</template>
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

      <h2>{{ $t('p_converter.moreTools') }}</h2>
      <ul>
        <li><NuxtLinkLocale to="/palettes/color-palette-from-image">{{ $t('p_converter.lPalette') }}</NuxtLinkLocale></li>
        <li><NuxtLinkLocale to="/editor">{{ $t('p_converter.lEditor') }}</NuxtLinkLocale></li>
        <!-- These two are written in English only, so every locale links to the one page. -->
        <li><NuxtLink to="/sprite-maker">{{ $t('p_converter.lSprite') }}</NuxtLink></li>
        <li><NuxtLink to="/color-by-number">{{ $t('p_converter.lCbn') }}</NuxtLink></li>
        <li><NuxtLinkLocale to="/easy-pixel-art">{{ $t('p_converter.lEasy') }}</NuxtLinkLocale></li>
      </ul>
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

.preview-wrapper.is-dragging {
  box-shadow: inset 0 0 0 calc(var(--space-1) / 2) var(--primary);
}

.pixel-preview {
  image-rendering: pixelated;
  max-width: 100%;
  max-height: 400px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
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

.edit-color {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-2);
  cursor: pointer;
}

.edit-color input[type=color] {
  width: var(--icon-lg);
  height: var(--icon-lg);
  padding: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  cursor: pointer;
}

.palette-swatch.mergeable {
  border: 1px solid var(--border);
}

.merge-hint {
  margin-top: var(--space-3);
}
</style>
