<script setup lang="ts">
import type {EditorData} from '~/types'
import {DEFAULT_EDITOR_DATA} from '~/helper/constants'
import {toast} from 'vue-sonner'
import {cloneDeep, generateUUID, getStorageItem, setWorkspaces} from '~/helper/utils'
import {convertImageToGrid} from '~/helper/pixel'

// English only for now (like /sprite-maker): locale copies point their
// canonical here and links into it are plain NuxtLink.
type RGB = [number, number, number]
interface Block { name: string; hex: string; rgb: RGB }

const hex2rgb = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]
const set = (kind: string, list: [string, string][]): Block[] =>
    list.map(([n, h]) => ({name: `${n} ${kind}`, hex: h, rgb: hex2rgb(h)}))
// The sixteen dye colours, as each block's texture averages out.
const DYES = ['White', 'Orange', 'Magenta', 'Light Blue', 'Yellow', 'Lime', 'Pink', 'Gray',
  'Light Gray', 'Cyan', 'Purple', 'Blue', 'Brown', 'Green', 'Red', 'Black']
const PALETTES: Record<'concrete' | 'wool', Block[]> = {
  concrete: set('Concrete', DYES.map((d, i) => [d, ['#CFD5D6', '#E06100', '#A9309F', '#2389C6', '#F1AF15', '#5EA818', '#D5658E', '#36393D',
    '#7D7D73', '#157788', '#64209C', '#2C2E8F', '#603B1F', '#495B24', '#8E2020', '#080A0F'][i]!])),
  wool: set('Wool', DYES.map((d, i) => [d, ['#E9ECEC', '#F07613', '#BD44B3', '#3AAFD9', '#F8C627', '#70B919', '#ED8DAC', '#3E4447',
    '#8E8E86', '#158991', '#792AAC', '#35399D', '#724728', '#546D1B', '#A12722', '#141519'][i]!])),
}
const WIDTHS = [16, 24, 32, 48, 64, 96, 128]

const fileInput = ref<HTMLInputElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
const source = ref<HTMLImageElement | null>(null)
const dragging = ref(false)
const width = ref(32)
const kind = ref<'concrete' | 'wool'>('concrete')
const bgCut = ref(true)
const grid = ref<number[][]>([])   // block index per cell, -1 = air

const blocks = computed(() => PALETTES[kind.value])
const h = computed(() => grid.value.length)
const w = computed(() => grid.value[0]?.length || 0)
const counts = computed(() => {
  const n = new Array(blocks.value.length).fill(0)
  for (const row of grid.value) for (const b of row) if (b >= 0) n[b]++
  return blocks.value.map((b, i) => ({...b, count: n[i] as number})).filter(b => b.count).sort((a, b) => b.count - a.count)
})
const total = computed(() => counts.value.reduce((s, b) => s + b.count, 0))
const stacks = (n: number) => {
  const s = Math.floor(n / 64), r = n % 64
  return s ? `${s} stack${s > 1 ? 's' : ''}${r ? ` + ${r}` : ''}` : `${r}`
}

/** "Redmean" distance: plain RGB distance with the eye's weighting, so a
 *  skin tone lands on pink or orange rather than on gray. */
function nearest(c: RGB): number {
  let best = 0, bd = Infinity
  blocks.value.forEach((b, i) => {
    const rm = (c[0] + b.rgb[0]) / 2
    const dr = c[0] - b.rgb[0], dg = c[1] - b.rgb[1], db = c[2] - b.rgb[2]
    const d = (2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db
    if (d < bd) { bd = d; best = i }
  })
  return best
}

async function convert() {
  if (!source.value) return
  // No dataUrl: that path reads an image's own pixel grid, and a flat cartoon
  // read as coarse "pixel art" lost its eyes. A build is always resampled to
  // the width asked for.
  const r = await convertImageToGrid(source.value, {
    size: width.value, maxColors: 64, cutBackground: bgCut.value,
  })
  if (!r) return
  const map = r.palette.map(p => nearest([p[0]!, p[1]!, p[2]!]))
  grid.value = r.indexed.map(row => row.map(i => (i < 0 ? -1 : map[i]!)))
  nextTick(draw)
}

function draw() {
  const cv = canvas.value
  if (!cv || !w.value) return
  const s = Math.max(2, Math.floor(512 / Math.max(w.value, h.value)))
  cv.width = w.value * s
  cv.height = h.value * s
  const ctx = cv.getContext('2d')!
  ctx.clearRect(0, 0, cv.width, cv.height)
  for (let y = 0; y < h.value; y++) {
    for (let x = 0; x < w.value; x++) {
      const b = grid.value[y]![x]!
      if (b < 0) continue
      ctx.fillStyle = blocks.value[b]!.hex
      ctx.fillRect(x * s, y * s, s, s)
    }
  }
  // Block seams, faint, once each block is big enough to see them.
  if (s >= 6) {
    ctx.strokeStyle = 'rgba(0,0,0,0.12)'
    ctx.lineWidth = 1
    ctx.beginPath()
    for (let x = 1; x < w.value; x++) { ctx.moveTo(x * s + 0.5, 0); ctx.lineTo(x * s + 0.5, cv.height) }
    for (let y = 1; y < h.value; y++) { ctx.moveTo(0, y * s + 0.5); ctx.lineTo(cv.width, y * s + 0.5) }
    ctx.stroke()
  }
}

function loadFile(file: File) {
  const reader = new FileReader()
  reader.onload = (e) => {
    const url = e.target?.result as string
    const img = new Image()
    img.onload = () => {
      source.value = img
      convert()
    }
    img.src = url
  }
  reader.readAsDataURL(file)
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

function download() {
  canvas.value?.toBlob(blob => {
    if (!blob) return
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `minecraft-pixel-art-${w.value}x${h.value}.png`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }, 'image/png')
}

const localePath = useLocalePath()
function openInEditor() {
  if (!w.value) return
  const id = generateUUID()
  const pixels: Record<string, number> = {}
  grid.value.forEach((row, y) => row.forEach((b, x) => { if (b >= 0) pixels[`${x}_${y}`] = b }))
  const data: EditorData = {
    ...cloneDeep(DEFAULT_EDITOR_DATA),
    id, width: w.value, height: h.value,
    colors: blocks.value.map(b => b.hex),
    layers: [{name: 'Layer 1', pixels, x: 0, y: 0}],
    updated: new Date().toISOString(),
  }
  const ws = getStorageItem('workspaces')
  ws[id] = data
  if (!setWorkspaces(ws, id)) { toast.error(useNuxtApp().$i18n.t('c_PXEditor.storageFull'), {duration: 15000}); return }
  localStorage.setItem('workspace_current', id)
  navigateTo(localePath(`/editor?id=${id}`))
}

watch([width, bgCut], () => convert())
watch(kind, () => convert())

const faq = [
  {q: 'How do I turn an image into Minecraft pixel art?', a: 'Upload the image, choose how many blocks wide the build should be and whether to use concrete or wool. The generator maps every pixel to the closest of the 16 block colors and lists how many of each block you need. Build it row by row from the preview.'},
  {q: 'Concrete or wool?', a: 'Concrete has flat, solid colors that match the preview closely and does not burn. Wool has a soft texture and is cheap early in a survival world. Switch between them to see which reads better for your image.'},
  {q: 'What size should my Minecraft pixel art be?', a: '32 blocks wide is a good first build — big enough for a face or character, small enough to finish in an evening. 64 to 128 suits murals; 128×128 is exactly one map item if you want map art.'},
  {q: 'How many blocks will I need?', a: 'The block list counts every block and converts it to stacks of 64. A full 32×32 build is up to 1,024 blocks; transparent background pixels are left as air and not counted.'},
  {q: 'Can I edit the design before building?', a: 'Yes. Open it in the editor to fix stray blocks, redraw small details by hand or try other colors, then come back to the counts.'},
  {q: 'What images work best?', a: 'Simple subjects with bold colors: characters, logos, emoji and pixel art sprites. Photos with soft gradients lose detail with only 16 colors — crop tightly and try a larger width.'},
]

useCustomSeoMeta({
  untranslated: true,
  title: 'Minecraft Pixel Art Generator — Image to Blocks',
  description: 'Free Minecraft pixel art generator: turn any image into a concrete or wool block design, see the build preview and get the exact block count in stacks.',
  keywords: 'minecraft pixel art generator, minecraft pixel art, image to minecraft blocks, minecraft map art, minecraft pixel art maker, minecraft block art',
  canonical: 'https://simplepixelart.com/minecraft-pixel-art-generator',
  script: [{
    type: 'application/ld+json',
    innerHTML: JSON.stringify({
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'WebApplication',
          name: 'Minecraft Pixel Art Generator',
          url: 'https://simplepixelart.com/minecraft-pixel-art-generator',
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
        <Widget label title="Minecraft pixel art generator">
          <template #ctl>
            <button v-if="w" class="widget-ctl-btn" @click="fileInput?.click()">
              <span class="icon icon-image"/>
              <span>Change image</span>
            </button>
          </template>
          <div
              class="mc-stage"
              :class="{'is-dragging': dragging}"
              @dragover.prevent="dragging = true"
              @dragleave.self="dragging = false"
              @drop.prevent="onDrop"
          >
            <canvas v-show="w" ref="canvas" class="mc-canvas"/>
            <div v-if="!w" class="dropzone" @click="fileInput?.click()">
              <span class="icon icon-upload dropzone-icon"/>
              <p class="dropzone-title">Click or drop an image here</p>
              <p class="dropzone-hint">PNG, JPG or WebP</p>
              <button class="btn primary" @click.stop="fileInput?.click()">Choose file</button>
            </div>
          </div>
        </Widget>
        <div v-if="w" class="tool-actions">
          <button class="btn primary block" @click="openInEditor">
            <span class="icon icon-pen"/>
            <span>Open in editor</span>
          </button>
          <button class="btn block" @click="download">
            <span class="icon icon-download"/>
            <span>Download preview</span>
          </button>
        </div>
      </div>

      <div class="editor-sidebar">
        <Widget label title="Width in blocks">
          <div class="settings-row">
            <label v-for="n in WIDTHS" :key="n" class="pill" :class="{active: width === n}">
              <input v-model="width" type="radio" :value="n">
              <span>{{ n }}</span>
            </label>
          </div>
        </Widget>
        <Widget label title="Blocks">
          <div class="settings-row">
            <label class="pill" :class="{active: kind === 'concrete'}">
              <input v-model="kind" type="radio" value="concrete"><span>Concrete</span>
            </label>
            <label class="pill" :class="{active: kind === 'wool'}">
              <input v-model="kind" type="radio" value="wool"><span>Wool</span>
            </label>
          </div>
          <label class="editor-check">
            <input v-model="bgCut" type="checkbox">
            <span>Leave a plain background as air</span>
          </label>
        </Widget>
        <Widget v-if="w" label :title="`Block list · ${total.toLocaleString()} blocks`">
          <ul class="mc-list">
            <li v-for="b in counts" :key="b.hex">
              <span class="mc-swatch" :style="{background: b.hex}"/>
              <span class="mc-name">{{ b.name }}<small class="text-muted">{{ stacks(b.count) }}</small></span>
              <span class="mc-count">{{ b.count.toLocaleString() }}</span>
            </li>
          </ul>
        </Widget>
      </div>
    </div>

    <input ref="fileInput" type="file" accept="image/*" class="hidden" @change="onFileSelect">

    <template #status>
      <p class="editor-foot-hint text-xs text-muted">
        {{ w ? `${w}×${h} blocks · ${total.toLocaleString()} to place · ${counts.length} block types` : 'No image yet — drop one to generate a build' }}
      </p>
    </template>

    <template #doc>
      <h1>Minecraft Pixel Art Generator — Turn Any Image into Blocks</h1>
      <p>Upload a picture and get a Minecraft pixel art design you can build block by block. The generator picks the closest concrete or wool color for every pixel, shows the finished build and counts exactly how many blocks of each color you need — in stacks of 64. Free, in your browser, no sign-up.</p>

      <h2>How to make Minecraft pixel art from an image</h2>
      <ol>
        <li><strong>Upload an image</strong> — a character, logo or emoji with bold colors works best.</li>
        <li><strong>Choose the width</strong> — 16 to 128 blocks. The height follows the image’s shape.</li>
        <li><strong>Pick concrete or wool</strong> — and leave a plain background as air so you do not build it.</li>
        <li><strong>Gather the blocks</strong> — the block list gives the count and the stacks for every color.</li>
        <li><strong>Build it</strong> — work from the bottom row up, using the preview as your blueprint.</li>
      </ol>

      <h2>Tips for a clean build</h2>
      <h3>Start small</h3>
      <p>A 32-block-wide piece is up to 1,024 blocks and reads clearly from a distance. Go to 64 or 128 for murals once you know the workflow.</p>
      <h3>Build flat, then stand it up</h3>
      <p>Lay the design on the ground first if you are unsure, or build a wall from a scaffold, placing one row at a time from the bottom.</p>
      <h3>Map art is 128×128</h3>
      <p>One map item shows a 128×128 area. Choose 128 blocks wide and build on flat ground to turn the design into map art.</p>
      <h3>Fix details before you build</h3>
      <p>Open the design in the <NuxtLink to="/editor">pixel art editor</NuxtLink> to clean up eyes, outlines and stray blocks — changing a pixel there is faster than breaking blocks later.</p>

      <QnA :items="faq"/>

      <p class="text-xs text-muted">Not an official Minecraft product. Not approved by or associated with Mojang or Microsoft.</p>

      <h2>More pixel art tools</h2>
      <ul>
        <li><NuxtLink to="/converter">Image to pixel art converter</NuxtLink></li>
        <li><NuxtLink to="/pixel-art-resizer">Pixel art resizer</NuxtLink></li>
        <li><NuxtLink to="/arts/minecraft">Minecraft pixel art gallery</NuxtLink></li>
        <li><NuxtLink to="/editor">Pixel art editor</NuxtLink></li>
      </ul>
    </template>
  </ToolLayout>
</template>

<style scoped>
.mc-stage {
  display: flex;
  align-items: center;
  justify-content: center;
  aspect-ratio: 1 / 1;
  background: var(--background);
}

.mc-stage.is-dragging {
  outline: 2px dashed var(--primary);
  outline-offset: -4px;
}

.mc-canvas {
  max-width: 100%;
  max-height: 100%;
  image-rendering: pixelated;
}

.mc-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  font-size: var(--text-xs);
}

.mc-list li {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: var(--space-2);
}

.mc-swatch {
  width: var(--space-3);
  height: var(--space-3);
  border: 1px solid var(--border);
  border-radius: 2px;
}

.mc-name {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.mc-count {
  font-variant-numeric: tabular-nums;
}
</style>
