<script setup lang="ts">
import {imageToCells} from '~/helper/pixel/reconstruct'

// English only for now (like /sprite-maker): locale copies point their
// canonical here and links into it are plain NuxtLink.
type Cell = [number, number, number] | null

const SCALES = [1, 2, 3, 4, 5, 6, 8, 10, 12, 16]
// Past this the "pixels" are just a photo; the converter is the right tool.
const MAX_NATIVE = 256

const fileInput = ref<HTMLInputElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
const dragging = ref(false)
const cells = ref<Cell[][]>([])
const detected = ref(1)
const srcSize = ref({w: 0, h: 0})
const fileName = ref('pixel-art')
const scale = ref(8)
const error = ref('')

const w = computed(() => cells.value[0]?.length || 0)
const h = computed(() => cells.value.length)
const out = computed(() => ({w: w.value * scale.value, h: h.value * scale.value}))

function openFileDialog() {
  fileInput.value?.click()
}

function onFileSelect(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (f) loadFile(f)
}

function onDrop(e: DragEvent) {
  dragging.value = false
  const f = e.dataTransfer?.files?.[0]
  if (f && f.type.startsWith('image/')) loadFile(f)
}

/** Every pixel of a small image as a cell -- for art that is already 1x. */
function rawCells(img: HTMLImageElement): Cell[][] {
  const cv = document.createElement('canvas')
  cv.width = img.naturalWidth
  cv.height = img.naturalHeight
  const ctx = cv.getContext('2d', {willReadFrequently: true})!
  ctx.drawImage(img, 0, 0)
  const d = ctx.getImageData(0, 0, cv.width, cv.height).data
  return Array.from({length: cv.height}, (_, y) => Array.from({length: cv.width}, (_, x) => {
    const i = (y * cv.width + x) * 4
    return d[i + 3]! < 128 ? null : [d[i]!, d[i + 1]!, d[i + 2]!] as Cell
  }))
}

function loadFile(file: File) {
  error.value = ''
  fileName.value = file.name.replace(/\.[^.]+$/, '') || 'pixel-art'
  const reader = new FileReader()
  reader.onload = async (e) => {
    const url = e.target?.result as string
    const img = new Image()
    img.onload = async () => {
      srcSize.value = {w: img.naturalWidth, h: img.naturalHeight}
      const nat = await imageToCells(url).catch(() => null)
      if (nat && nat.scale > 1 && nat.cells.length) {
        cells.value = nat.cells
        detected.value = nat.scale
      } else if (Math.max(img.naturalWidth, img.naturalHeight) <= MAX_NATIVE) {
        cells.value = rawCells(img)
        detected.value = 1
      } else {
        cells.value = []
        error.value = 'This image does not look like pixel art — no pixel grid was found. Use the image to pixel art converter to pixelate it first.'
        return
      }
      // Land on a scale that gives a usable size, about 512px across.
      const fit = Math.max(1, Math.floor(512 / Math.max(w.value, h.value)))
      scale.value = SCALES.filter(s => s <= fit).pop() || 1
      draw()
    }
    img.src = url
  }
  reader.readAsDataURL(file)
}

function draw() {
  const cv = canvas.value
  if (!cv || !w.value) return
  cv.width = out.value.w
  cv.height = out.value.h
  const ctx = cv.getContext('2d')!
  ctx.clearRect(0, 0, cv.width, cv.height)
  const s = scale.value
  for (let y = 0; y < h.value; y++) {
    for (let x = 0; x < w.value; x++) {
      const c = cells.value[y]![x]
      if (!c) continue
      ctx.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`
      ctx.fillRect(x * s, y * s, s, s)
    }
  }
}

function download() {
  const cv = canvas.value
  if (!cv) return
  cv.toBlob(blob => {
    if (!blob) return
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${fileName.value}-${out.value.w}x${out.value.h}.png`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }, 'image/png')
}

watch(scale, () => nextTick(draw))

const faq = [
  {q: 'How do I upscale pixel art without blur?', a: 'Scale by a whole number with nearest-neighbor sampling, so every pixel becomes a clean square block. Upload the image here, pick 2× to 16× and download the PNG. Smooth resizing in photo editors averages neighboring pixels, which is what makes pixel art blurry.'},
  {q: 'Can I shrink an upscaled image back to its real size?', a: 'Yes. When you upload pixel art that was already enlarged — a screenshot, an 8× export, even a JPEG with grid lines — the resizer finds the original pixel grid and reads it back cell for cell. Choose 1× to download it at its true resolution.'},
  {q: 'Why only whole-number scales?', a: 'At 1.5× some pixels would have to become one screen pixel and others two, so the art looks uneven. Whole numbers keep every pixel the same size, which is how pixel art is meant to be shown.'},
  {q: 'What is the largest size I can make?', a: 'Up to 16× the pixel art’s own size. A 32×32 sprite becomes 512×512 at 16×; a 128×128 piece becomes 2048×2048.'},
  {q: 'Does it keep transparency?', a: 'Yes. Transparent pixels stay transparent in the PNG you download, so sprites keep working on any background.'},
  {q: 'Is my image uploaded anywhere?', a: 'No. Detection and resizing run in your browser; the image never leaves your device.'},
]

useCustomSeoMeta({
  untranslated: true,
  title: 'Pixel Art Resizer — Upscale Without Blur',
  description: 'Free pixel art resizer: upscale pixel art 2× to 16× with nearest-neighbor scaling, or shrink an enlarged image back to its real pixels. PNG out, nothing uploaded.',
  keywords: 'pixel art resizer, upscale pixel art, resize pixel art without blur, pixel art scaler, nearest neighbor resize, pixel art upscaler',
  canonical: 'https://simplepixelart.com/pixel-art-resizer',
  script: [{
    type: 'application/ld+json',
    innerHTML: JSON.stringify({
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'WebApplication',
          name: 'Pixel Art Resizer',
          url: 'https://simplepixelart.com/pixel-art-resizer',
          applicationCategory: 'GraphicsApplication',
          operatingSystem: 'Any (browser-based)',
          offers: {'@type': 'Offer', price: '0', priceCurrency: 'USD'},
        },
        {
          '@type': 'FAQPage',
          mainEntity: faq.map(f => ({'@type': 'Question', name: f.q, acceptedAnswer: {'@type': 'Answer', text: f.a}})),
        },
      ],
    }),
  }],
})
</script>

<template>
  <ToolLayout>
    <div class="editor-body flat-editor">
      <div class="canvas-col">
        <Widget label title="Pixel art resizer">
          <template #ctl>
            <button v-if="w" class="widget-ctl-btn" @click="openFileDialog">
              <span class="icon icon-image"/>
              <span>Change image</span>
            </button>
          </template>
          <div
              class="rs-stage"
              :class="{'is-dragging': dragging}"
              @dragover.prevent="dragging = true"
              @dragleave.self="dragging = false"
              @drop.prevent="onDrop"
          >
            <canvas v-show="w" ref="canvas" class="rs-canvas"/>
            <div v-if="!w" class="dropzone" @click="openFileDialog">
              <span class="icon icon-upload dropzone-icon"/>
              <p class="dropzone-title">Click or drop pixel art here</p>
              <p class="dropzone-hint">{{ error || 'PNG, GIF, JPG or WebP' }}</p>
              <button class="btn primary" @click.stop="openFileDialog">Choose file</button>
            </div>
          </div>
        </Widget>
        <div v-if="w" class="tool-actions">
          <button class="btn primary block" @click="download">
            <span class="icon icon-download"/>
            <span>Download {{ out.w }}×{{ out.h }} PNG</span>
          </button>
        </div>
      </div>

      <div class="editor-sidebar">
        <Widget label title="Scale">
          <div class="settings-row">
            <label v-for="s in SCALES" :key="s" class="pill" :class="{active: scale === s}">
              <input v-model="scale" type="radio" :value="s">
              <span>{{ s }}×</span>
            </label>
          </div>
          <p v-if="w" class="tool-note">
            {{ w }}×{{ h }} pixel art → {{ out.w }}×{{ out.h }}px
          </p>
        </Widget>
        <Widget v-if="w" label title="Source">
          <p class="tool-note">
            {{ srcSize.w }}×{{ srcSize.h }}px image<template v-if="detected > 1">, already enlarged {{ detected }}× — read back to its {{ w }}×{{ h }} pixels</template>.
          </p>
        </Widget>
      </div>
    </div>

    <input ref="fileInput" type="file" accept="image/*" class="hidden" @change="onFileSelect">

    <template #status>
      <p class="editor-foot-hint text-xs text-muted">
        {{ w ? `${w}×${h} → ${out.w}×${out.h}px at ${scale}×` : 'No image yet — drop one to resize' }}
      </p>
    </template>

    <template #doc>
      <h1>Pixel Art Resizer — Upscale Pixel Art Without Blur</h1>
      <p>Resize pixel art the way it is meant to be scaled: every pixel turns into a clean square, with no blur and no smudged edges. Upload a sprite, pick 2× to 16× and download a crisp PNG. Already-enlarged pixel art is read back to its real pixels first, so you can also shrink a screenshot to 1×.</p>

      <h2>How to resize pixel art</h2>
      <ol>
        <li><strong>Upload the image</strong> — drag in a PNG, GIF, JPG or WebP, or click to browse.</li>
        <li><strong>Pick a scale</strong> — 1× gives the true pixel size, 2× to 16× enlarge it. The preview shows the exact output.</li>
        <li><strong>Download</strong> — save the PNG, transparency included.</li>
      </ol>

      <h2>Why pixel art goes blurry</h2>
      <p>Photo editors and most websites resize with bilinear or bicubic filtering, which blends each pixel with its neighbors. That is right for photos and wrong for pixel art, where the hard edge between two colors is the whole point. Nearest-neighbor scaling copies each pixel into an N×N block instead, so a 16×16 sprite at 8× is a perfect 128×128 image.</p>

      <h2>Reading back enlarged pixel art</h2>
      <p>Pixel art often travels already enlarged: an 8× export, a screenshot, a JPEG with faint grid lines. The resizer measures the pixel grid in the image and samples one color per cell, so you get the original art back before scaling it again. If an image has no pixel grid at all, it is a photo — turn it into pixel art with the <NuxtLink to="/converter">image to pixel art converter</NuxtLink> first.</p>

      <QnA :items="faq"/>

      <h2>More pixel art tools</h2>
      <ul>
        <li><NuxtLink to="/converter">Image to pixel art converter</NuxtLink></li>
        <li><NuxtLink to="/editor">Pixel art editor</NuxtLink></li>
        <li><NuxtLink to="/minecraft-pixel-art-generator">Minecraft pixel art generator</NuxtLink></li>
        <li><NuxtLink to="/tilesets/slicer">Sprite sheet slicer</NuxtLink></li>
      </ul>
    </template>
  </ToolLayout>
</template>

<style scoped>
.rs-stage {
  display: flex;
  align-items: center;
  justify-content: center;
  aspect-ratio: 1 / 1;
  overflow: auto;
  background: var(--background);
}

.rs-stage.is-dragging {
  outline: 2px dashed var(--primary);
  outline-offset: -4px;
}

.rs-canvas {
  max-width: 100%;
  max-height: 100%;
  image-rendering: pixelated;
  background-image: conic-gradient(var(--border) 25%, transparent 0 50%, var(--border) 0 75%, transparent 0);
  background-size: 16px 16px;
}
</style>
