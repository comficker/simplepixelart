<script setup lang="ts">
import {toast} from 'vue-sonner'

// PNG export laid out for sharing: a frame size, a background (from the art's
// own palette), a margin, optional pixel shadow / border / caption / site
// credit, with a live preview. Composed on a canvas in the browser, so it works
// for unsaved editor work and guests and costs the server nothing. The art is
// always scaled by a whole number so its pixels stay sharp.
const props = defineProps<{
  // The art at 1× (one canvas pixel per art pixel).
  getArt: () => Promise<HTMLCanvasElement>
  width: number
  height: number
  colors: string[]
  title?: string
  author?: string
  slug?: string
  source: 'editor' | 'art'
}>()
const emit = defineEmits<{ close: []; exported: [] }>()
const {t} = useI18n()

const FRAMES = {
  original: null,
  square: [1080, 1080],
  portrait: [1080, 1350],
  story: [1080, 1920],
  wide: [1200, 630],
} as const
type Frame = keyof typeof FRAMES
const SCALES = [1, 2, 4, 8, 16, 32]

interface Settings {
  frame: Frame
  scale: number
  bg: string          // 'transparent' | 'gradient' | 'checker' | 'grid' | '#rrggbb'
  padding: number     // % of the shorter side
  shadow: boolean
  border: boolean
  caption: boolean
  credit: boolean
}
const STORE_KEY = 'export_studio'
const DEFAULTS: Settings = {
  frame: 'square', scale: 8, bg: 'gradient', padding: 12,
  shadow: false, border: false, caption: true, credit: true,
}
function loadSettings(): Settings {
  try {
    return {...DEFAULTS, ...JSON.parse(localStorage.getItem(STORE_KEY) || '{}')}
  } catch {
    return {...DEFAULTS}
  }
}
const s = reactive<Settings>(loadSettings())
watch(s, v => {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(v)) } catch { /* private mode */ }
}, {deep: true})

// --- colour helpers -------------------------------------------------------
function rgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h.slice(0, 6), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
function luma(hex: string) {
  const [r, g, b] = rgb(hex)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255
}
function mix(a: string, b: string, k: number) {
  const x = rgb(a), y = rgb(b)
  return `rgb(${x.map((v, i) => Math.round(v + (y[i]! - v) * k)).join(',')})`
}

const palette = computed(() => {
  const seen = new Set<string>()
  return (props.colors || [])
      .map(c => (c || '').toUpperCase())
      .filter(c => /^#[0-9A-F]{6}$/.test(c) && !seen.has(c) && seen.add(c))
      .sort((a, b) => luma(b) - luma(a))
})
const lightest = computed(() => palette.value[0] || '#FFFFFF')
const darkest = computed(() => palette.value[palette.value.length - 1] || '#111111')
// A mid tone of the art, to tint the gradient with its own colour rather than
// fading to grey.
const midTone = computed(() => palette.value[Math.floor(palette.value.length / 2)] || darkest.value)
// Background choices: the art's own colours first, so the frame matches it.
const swatches = computed(() => {
  const list = [...palette.value.slice(0, 6)]
  for (const c of ['#FFFFFF', '#111111']) if (!list.includes(c)) list.push(c)
  return list
})
const BG_STYLES = ['transparent', 'gradient', 'checker', 'grid'] as const

// --- composition ----------------------------------------------------------
let art: HTMLCanvasElement | null = null
const ready = ref(false)
const out = shallowRef<HTMLCanvasElement | null>(null)
const preview = ref<HTMLCanvasElement | null>(null)

function bgTone() {
  if (s.bg.startsWith('#')) return s.bg
  if (s.bg === 'gradient') return lightest.value
  if (s.bg === 'transparent') return null
  return '#F4F4F4'
}

function compose(): HTMLCanvasElement {
  const aw = props.width, ah = props.height
  const font = getComputedStyle(document.body).fontFamily || 'sans-serif'
  const hasText = s.caption || s.credit
  let W: number, H: number, scale: number, pad: number, bottom: number, fs: number
  const frame = FRAMES[s.frame]
  if (frame) {
    [W, H] = frame
    const short = Math.min(W, H)
    pad = Math.round(short * s.padding / 100)
    fs = Math.max(14, Math.round(short * 0.03))
    bottom = hasText ? Math.max(pad, Math.round(fs * 2.6)) : pad
    scale = Math.max(1, Math.floor(Math.min((W - pad * 2) / aw, (H - pad - bottom) / ah)))
  } else {
    scale = s.scale
    pad = Math.round(Math.max(aw, ah) * scale * s.padding / 100)
    fs = Math.max(12, Math.round(Math.max(aw, ah) * scale * 0.04))
    bottom = hasText ? Math.max(pad, Math.round(fs * 2.6)) : pad
    W = aw * scale + pad * 2
    H = ah * scale + pad + bottom
  }
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const ctx = c.getContext('2d')!
  ctx.imageSmoothingEnabled = false

  // art, centred in the area above the caption band
  const dw = aw * scale, dh = ah * scale
  const x = Math.round((W - dw) / 2)
  const y = Math.round(pad + (H - pad - bottom - dh) / 2)

  // background. Checker and grid cells are whole art pixels and start from the
  // art's corner, so the paper lines up with the pixels drawn on it.
  const cell = scale * Math.ceil(4 / scale)
  const ox = x % cell - cell, oy = y % cell - cell
  if (s.bg === 'gradient') {
    const g = ctx.createLinearGradient(0, 0, W, H)
    g.addColorStop(0, lightest.value)
    g.addColorStop(1, mix(lightest.value, midTone.value, 0.45))
    ctx.fillStyle = g
    ctx.fillRect(0, 0, W, H)
  } else if (s.bg === 'checker') {
    ctx.fillStyle = '#F2F2F2'
    ctx.fillRect(0, 0, W, H)
    ctx.fillStyle = '#E2E2E2'
    for (let r = 0, cy = oy; cy < H; r++, cy += cell) {
      for (let cx = ox + (r % 2) * cell; cx < W; cx += cell * 2) ctx.fillRect(cx, cy, cell, cell)
    }
  } else if (s.bg === 'grid') {
    ctx.fillStyle = '#FBFBF8'
    ctx.fillRect(0, 0, W, H)
    ctx.fillStyle = 'rgba(0,0,0,0.07)'
    for (let gx = ox; gx <= W; gx += cell) ctx.fillRect(gx, 0, 1, H)
    for (let gy = oy; gy <= H; gy += cell) ctx.fillRect(0, gy, W, 1)
  } else if (s.bg.startsWith('#')) {
    ctx.fillStyle = s.bg
    ctx.fillRect(0, 0, W, H)
  }

  if (art) {
    if (s.shadow) {
      const sh = document.createElement('canvas')
      sh.width = dw
      sh.height = dh
      const sx = sh.getContext('2d')!
      sx.imageSmoothingEnabled = false
      sx.drawImage(art, 0, 0, dw, dh)
      sx.globalCompositeOperation = 'source-in'
      sx.fillStyle = 'rgba(0,0,0,0.28)'
      sx.fillRect(0, 0, dw, dh)
      const d = Math.max(2, Math.round(scale * 0.75))
      ctx.drawImage(sh, x + d, y + d)
    }
    ctx.drawImage(art, x, y, dw, dh)
  }

  if (s.border) {
    const b = Math.max(2, Math.round(Math.min(W, H) * 0.012))
    ctx.fillStyle = darkest.value
    ctx.fillRect(0, 0, W, b)
    ctx.fillRect(0, H - b, W, b)
    ctx.fillRect(0, 0, b, H)
    ctx.fillRect(W - b, 0, b, H)
  }

  if (hasText) {
    const tone = bgTone()
    const ink = tone === null ? '#666666' : luma(tone) > 0.55 ? 'rgba(0,0,0,0.72)' : 'rgba(255,255,255,0.85)'
    const base = H - Math.round((bottom - fs) / 2) - Math.round(fs * 0.2)
    const side = Math.max(Math.round(fs * 1.2), pad)
    ctx.fillStyle = ink
    ctx.textBaseline = 'alphabetic'
    if (s.caption) {
      const name = props.title || t('c_ExportStudio.untitled')
      ctx.font = `600 ${fs}px ${font}`
      ctx.textAlign = 'left'
      const by = props.author ? ` · @${props.author}` : ''
      ctx.fillText(name + by, side, base, W - side * 2 - (s.credit ? fs * 9 : 0))
    }
    if (s.credit) {
      ctx.font = `500 ${Math.round(fs * 0.85)}px ${font}`
      ctx.textAlign = 'right'
      ctx.globalAlpha = 0.8
      ctx.fillText('simplepixelart.com', W - side, base)
      ctx.globalAlpha = 1
    }
  }
  return c
}

let raf = 0
function redraw() {
  if (!ready.value) return
  cancelAnimationFrame(raf)
  raf = requestAnimationFrame(() => {
    out.value = compose()
    const p = preview.value
    if (!p || !out.value) return
    p.width = out.value.width
    p.height = out.value.height
    const ctx = p.getContext('2d')!
    ctx.clearRect(0, 0, p.width, p.height)
    ctx.drawImage(out.value, 0, 0)
  })
}
watch(s, redraw, {deep: true})

onMounted(async () => {
  try {
    art = await props.getArt()
    ready.value = true
    await nextTick()
    redraw()
  } catch (e) {
    console.error(e)
    track('export_failed', {format: 'png', source: props.source, reason: failReason(e)})
    toast.error(t('c_PXEditor.exportFailed'))
    emit('close')
  }
})
onBeforeUnmount(() => cancelAnimationFrame(raf))

const dims = computed(() => out.value ? `${out.value.width}×${out.value.height}px` : '')

function blob(): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const c = out.value || compose()
    c.toBlob(b => b ? resolve(b) : reject({name: 'canvas_too_large'}), 'image/png')
  })
}
const fileName = computed(() => `${props.slug || 'simplepixelart'}-${s.frame === 'original' ? `${s.scale}x` : s.frame}.png`)

function report(action: string) {
  track('export', {
    format: 'png', source: props.source, frame: s.frame, bg: s.bg.startsWith('#') ? 'color' : s.bg,
    padding: s.padding, caption: s.caption, credit: s.credit, action,
  })
  emit('exported')
}

async function download() {
  try {
    const url = URL.createObjectURL(await blob())
    const a = document.createElement('a')
    a.href = url
    a.download = fileName.value
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    report('download')
    emit('close')
  } catch (e) {
    track('export_failed', {format: 'png', source: props.source, reason: failReason(e)})
    toast.error(t('c_PXEditor.exportFailed'))
  }
}

const canCopy = typeof window !== 'undefined' && !!navigator.clipboard && 'ClipboardItem' in window
async function copy() {
  try {
    await navigator.clipboard.write([new ClipboardItem({'image/png': blob()})])
    toast.success(t('c_ExportStudio.copied'))
    report('copy')
  } catch (e) {
    track('export_failed', {format: 'png', source: props.source, reason: failReason(e)})
    toast.error(t('c_PXEditor.exportFailed'))
  }
}

const canShare = typeof navigator !== 'undefined' && !!navigator.canShare
    && navigator.canShare({files: [new File([''], 'a.png', {type: 'image/png'})]})
async function share() {
  try {
    const file = new File([await blob()], fileName.value, {type: 'image/png'})
    await navigator.share({files: [file], title: props.title || 'SimplePixelArt'})
    report('share')
  } catch (e: any) {
    if (e?.name === 'AbortError') return
    track('export_failed', {format: 'png', source: props.source, reason: failReason(e)})
    toast.error(t('c_PXEditor.exportFailed'))
  }
}
</script>

<template>
  <UiModal class="export-studio" width="calc(var(--space-6, 1.5rem) * 20)" :title="$t('common.downloadPng')" @close="emit('close')">
    <figure class="export-figure">
      <div class="export-preview">
        <canvas ref="preview" :aria-label="$t('c_ExportStudio.preview')"/>
      </div>
      <figcaption class="export-dims">{{ $t('c_PXEditor.output') }} <strong>{{ dims || '—' }}</strong></figcaption>
    </figure>

    <div class="publish-form">
      <div class="onb-field">
        <span class="onb-label">{{ $t('c_ExportStudio.frame') }}</span>
        <div class="onb-chips">
          <button
              v-for="(size, f) in FRAMES" :key="f" type="button"
              class="onb-chip" :class="{active: s.frame === f}" :aria-pressed="s.frame === f"
              @click="s.frame = f as Frame"
          >{{ $t(`c_ExportStudio.frame_${f}`) }}<template v-if="size"> · {{ size[0] }}×{{ size[1] }}</template></button>
        </div>
      </div>

      <!-- Always rendered (disabled outside Original) so the form keeps its height. -->
      <div class="onb-field">
        <span class="onb-label">{{ $t('c_PXEditor.scale') }}</span>
        <div class="onb-chips">
          <button
              v-for="n in SCALES" :key="n" type="button" class="onb-chip"
              :class="{active: s.frame === 'original' && s.scale === n}" :disabled="s.frame !== 'original'"
              @click="s.scale = n"
          >{{ n }}×</button>
        </div>
      </div>

      <div class="onb-field">
        <span class="onb-label">{{ $t('c_ExportStudio.background') }}</span>
        <div class="onb-chips">
          <button
              v-for="c in swatches" :key="c" type="button"
              class="onb-chip export-swatch-chip" :class="{active: s.bg === c}" :aria-pressed="s.bg === c" :title="c"
              @click="s.bg = c"
          ><span class="onb-swatch" :style="{background: c}"/></button>
          <button
              v-for="b in BG_STYLES" :key="b" type="button"
              class="onb-chip" :class="{active: s.bg === b}" :aria-pressed="s.bg === b"
              @click="s.bg = b"
          >{{ $t(`c_ExportStudio.bg_${b}`) }}</button>
        </div>
      </div>

      <div class="slider-row">
        <label for="export-padding"><span>{{ $t('c_ExportStudio.padding') }}</span><span>{{ s.padding }}%</span></label>
        <input id="export-padding" v-model.number="s.padding" type="range" min="0" max="30" step="1">
      </div>

      <div class="onb-field">
        <span class="onb-label">{{ $t('c_ExportStudio.extras') }}</span>
        <div class="onb-chips">
          <button
              v-for="k in (['shadow', 'border', 'caption', 'credit'] as const)" :key="k" type="button"
              class="onb-chip" :class="{active: s[k]}" :aria-pressed="s[k]"
              @click="s[k] = !s[k]"
          >{{ $t(`c_ExportStudio.${k}`) }}</button>
        </div>
      </div>
    </div>

    <div class="publish-actions">
      <button class="btn primary block" :disabled="!ready" @click="download">
        <span class="icon icon-download"/><span>{{ $t('common.downloadPng') }}</span>
      </button>
      <button v-if="canCopy" class="btn block" :disabled="!ready" @click="copy">{{ $t('c_ExportStudio.copy') }}</button>
      <button v-if="canShare" class="btn block" :disabled="!ready" @click="share">{{ $t('c_ExportStudio.share') }}</button>
    </div>
  </UiModal>
</template>

<style>
/* Teleported with UiModal, so tokens keep fallbacks. Taller than a phone
   screen, so it scrolls inside itself rather than losing its top. */
.export-studio > * {
  flex-shrink: 0;
}

.export-studio {
  max-height: calc(100dvh - var(--space-6, 1.5rem));
  overflow-y: auto;
}

/* Fixed box: switching frames reshapes the image, never the dialog. */
.export-preview {
  flex: none;
  height: 28vh;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: var(--space-2, 0.5rem);
  border-radius: var(--radius-sm, 4px);
  background: repeating-conic-gradient(var(--surface-2, #eae7e0) 0% 25%, transparent 0% 50%) 0 0 / var(--space-4, 1rem) var(--space-4, 1rem);
}

.export-preview canvas {
  display: block;
  max-width: 100%;
  max-height: 100%;
  image-rendering: pixelated;
}

/* The actions stay in reach while the settings scroll under them. */
.share-modal.export-studio .publish-actions {
  position: sticky;
  bottom: calc(var(--space-4, 1rem) * -1);
  margin-bottom: calc(var(--space-4, 1rem) * -1);
  padding: var(--space-3, 0.75rem) 0 var(--space-4, 1rem);
  background: var(--surface, #fff);
  border-top: 1px solid var(--border, rgba(0, 0, 0, .12));
}

.export-studio .publish-actions {
  flex-wrap: wrap;
}

.export-studio .publish-actions .btn {
  flex: 1 1 0;
  min-width: 0;
}

.export-studio .publish-actions .btn.primary {
  flex-basis: 100%;
}

.export-studio .onb-chip:disabled {
  opacity: 0.4;
  cursor: default;
  background: transparent;
}

.export-studio .onb-field {
  gap: var(--space-2, 0.5rem);
}

.export-figure {
  flex: none;
  display: flex;
  flex-direction: column;
  gap: var(--space-2, 0.5rem);
}

.export-dims {
  text-align: center;
  font-size: var(--text-xs, 0.75rem);
  color: var(--muted, #888);
}

.export-dims strong {
  color: var(--foreground, inherit);
  font-variant-numeric: tabular-nums;
}

.export-swatch-chip {
  display: inline-flex;
  align-items: center;
  padding: var(--space-1, 0.25rem) var(--space-2, 0.5rem);
}
</style>
