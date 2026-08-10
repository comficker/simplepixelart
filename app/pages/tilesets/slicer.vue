<script setup lang="ts">
import {ref, computed, watch, nextTick, onMounted, onBeforeUnmount} from 'vue'
import {toast} from 'vue-sonner'
import type {EditorData} from '~/types'
import {DEFAULT_EDITOR_DATA} from '~/helper/constants'
import {cloneDeep, generateUUID, debounce, getStorageItem} from '~/helper/utils'
import {layers2MapNumbers} from '~/helper/canvas'
import {saveWorkspaceFull, clearWorkspaceFull} from '~/helper/workspaceSnapshot'
import {createZip} from '~/helper/zip'

const auth = useAuthStore()

useCustomSeoMeta({
  title: 'Tileset Slicer — Cut Sprites from a Spritesheet Online',
  description: 'Free online tileset & spritesheet slicer. Cut sprites by a fixed grid, auto-detect packed sprites, or hand-select each sprite and export them all as PNGs in a ZIP. Open in the pixel editor too. No signup.',
  keywords: 'tileset slicer, spritesheet cutter, sprite extractor, manual sprite select, export sprites zip, auto detect sprites, cut tiles from image, pixel art tileset editor',
  canonical: 'https://simplepixelart.com/tilesets/slicer',
  script: [
    {
      type: 'application/ld+json',
      innerHTML: JSON.stringify({
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'SoftwareApplication',
            name: 'Tileset Slicer',
            description: 'Free browser tool that slices a tileset or spritesheet into individual sprites — by grid, by auto-detection, or by hand-selecting regions and exporting them as a ZIP.',
            url: 'https://simplepixelart.com/tilesets/slicer',
            applicationCategory: 'GraphicsApplication',
            operatingSystem: 'Any (browser-based)',
            offers: {'@type': 'Offer', price: '0', priceCurrency: 'USD'},
            featureList: [
              'Upload PNG/JPG/WebP tile sheets',
              'Grid mode: drag-to-align grid with tile size, spacing and offset',
              'Auto-detect mode: bounding-box detection for packed sprites',
              'Select mode: draw a box around each sprite manually',
              'Export many sprites at once as a ZIP of PNGs',
              'Exact pixel extraction with transparency preserved',
              'Open any sprite in the pixel art editor',
            ],
            publisher: {'@type': 'Organization', name: 'SimplePixelArt.com', url: 'https://simplepixelart.com/'},
          },
          {
            '@type': 'HowTo',
            name: 'How to slice a tileset or spritesheet into individual sprites',
            description: 'Cut a tile sheet into separate sprite PNGs online — by grid, auto-detection, or hand-selection.',
            totalTime: 'PT2M',
            tool: [{'@type': 'HowToTool', name: 'Tileset Slicer (web browser)'}],
            step: [
              {'@type': 'HowToStep', name: 'Upload your tile sheet', text: 'Drag and drop a PNG, JPG or WebP spritesheet onto the tool, or click to browse. Everything runs in your browser — nothing is uploaded.'},
              {'@type': 'HowToStep', name: 'Choose how to cut', text: 'Use Grid for evenly spaced tiles, Auto-detect for packed sprites, or Select to draw a box around each sprite by hand.'},
              {'@type': 'HowToStep', name: 'Export the sprites', text: 'Download every sprite at once as a ZIP of PNGs, or open one in the pixel art editor to keep editing. Transparency is preserved.'},
            ],
          },
          {
            '@type': 'FAQPage',
            mainEntity: [
              {'@type': 'Question', name: 'Is the Tileset Slicer free?', acceptedAnswer: {'@type': 'Answer', text: 'Yes. It is completely free and runs entirely in your browser — no signup, no watermark, and your image is never uploaded to a server.'}},
              {'@type': 'Question', name: 'What image formats can I slice?', acceptedAnswer: {'@type': 'Answer', text: 'PNG, JPG and WebP tile sheets and spritesheets are supported. PNG transparency is preserved in the exported sprites.'}},
              {'@type': 'Question', name: 'How do I cut sprites that are not evenly spaced?', acceptedAnswer: {'@type': 'Answer', text: 'Use Select mode and draw a box around each sprite — free-form, square (1:1) or a fixed size. You can move boxes to fine-tune, then export them all.'}},
              {'@type': 'Question', name: 'Can I export all sprites at once?', acceptedAnswer: {'@type': 'Answer', text: 'Yes. Select or detect the sprites you want and Download all as a ZIP of individual PNG files.'}},
              {'@type': 'Question', name: 'Does it keep transparency?', acceptedAnswer: {'@type': 'Answer', text: 'Yes. Pixels are extracted exactly at 1:1, and the alpha channel is preserved. You can also knock out a background colour to make sprites transparent.'}},
              {'@type': 'Question', name: 'Can I edit a sprite after slicing it?', acceptedAnswer: {'@type': 'Answer', text: 'Yes. Open any sprite straight in the Simple Pixel Art editor to keep drawing with layers, palette and export tools.'}},
            ],
          },
          {
            '@type': 'BreadcrumbList',
            itemListElement: [
              {'@type': 'ListItem', position: 1, name: 'Home', item: 'https://simplepixelart.com/'},
              {'@type': 'ListItem', position: 2, name: 'Tileset Slicer', item: 'https://simplepixelart.com/tilesets/slicer'},
            ],
          },
        ],
      }),
    },
  ],
})

type RGB = [number, number, number]
type Box = { x: number; y: number; w: number; h: number }
type Pt = { x: number; y: number }

// ── Source ─────────────────────────────────────────────────────────
const fileInput = ref<HTMLInputElement | null>(null)
const sourceImage = ref<HTMLImageElement | null>(null)
const imageData = ref('')   // dataURL of the loaded sheet, persisted so F5 keeps the work
const rawImageData = ref('') // the original upload, kept so "editor import" can re-derive
const sourceName = ref('')   // upload's basename — names the animation art
const hasImage = computed(() => !!sourceImage.value)

// Run the same image pipeline the editor uses on import (de-upscale, crop,
// quantize to dominant colours) on the sheet before slicing it.
const editorProcess = ref(false)
const processing = ref(false)

const mode = ref<'grid' | 'auto' | 'select'>('select')

// ── Grid params (source pixels) ────────────────────────────────────
const tileW = ref(16)
const tileH = ref(16)
const spacing = ref(0)
const offsetX = ref(0)
const offsetY = ref(0)
const linkSize = ref(true)
const sizePresets = [8, 16, 24, 32, 48, 64]

const cols = computed(() => {
  const img = sourceImage.value
  if (!img || tileW.value <= 0) return 0
  return Math.max(0, Math.floor((img.width - offsetX.value + spacing.value) / (tileW.value + spacing.value)))
})
const rows = computed(() => {
  const img = sourceImage.value
  if (!img || tileH.value <= 0) return 0
  return Math.max(0, Math.floor((img.height - offsetY.value + spacing.value) / (tileH.value + spacing.value)))
})
const tileCount = computed(() => cols.value * rows.value)

// ── Auto-detect params ─────────────────────────────────────────────
const bg = ref<RGB>([0, 0, 0])
const tolerance = ref(24)
const minSize = ref(14)
const mergeGap = ref(2)
const boxes = ref<Box[]>([])
const detecting = ref(false)

// ── Manual select ──────────────────────────────────────────────────
const regions = ref<Box[]>([])
const selectedRegion = ref(-1)
const dragging = ref(false)
const dragStart = ref<Pt | null>(null)
const draft = ref<Box | null>(null)
// Selection shape: free rectangle, 1:1 square (drag grows both axes equally),
// or fixed size (click drops a fixedW×fixedH box at the click point).
const selectShape = ref<'free' | 'square' | 'fixed'>('free')
const fixedW = ref(16)
const fixedH = ref(16)
const fixedLink = ref(true)
// Drag an existing region to reposition it (grab from inside the box).
const movingRegion = ref(-1)
const hoverRegion = ref(-1)
let moveGrab = {dx: 0, dy: 0}

// ── Cleanup (applied to every extracted sprite) ────────────────────
// Neutral by default: what you slice is exactly what the sheet shows, so the
// "Clean sheet on load" toggle visibly drives preview + output. Per-tile
// cleanup is an explicit opt-in from the settings modal.
const crispFactor = ref<'auto' | number>(1)      // round pixels: de-upscale factor
const mergeTol = ref(0)                           // merge near-identical colours (0 = off)
const cleanInfo = ref('')                         // "16×16 · 8 colors" after processing
const crispOptions: { v: 'auto' | number; l: string }[] = [
  {v: 'auto', l: 'Auto'}, {v: 1, l: '1×'}, {v: 2, l: '2×'}, {v: 3, l: '3×'}, {v: 4, l: '4×'},
]
const removeBg = ref(false)      // knock out the background colour → transparent
const removeBgTol = ref(30)
const picking = ref(false)       // eyedropper: next sheet click sets bg colour
const despeckle = ref(false)     // replace stray/orphan pixels with their majority neighbour
const median = ref(false)        // 3×3 vector-median smoothing (edge-preserving denoise)
const quantize = ref(0)          // reduce to N colours via median-cut (0 = off)
const quantOptions: { v: number; l: string }[] = [
  {v: 0, l: 'Off'}, {v: 4, l: '4'}, {v: 8, l: '8'}, {v: 16, l: '16'}, {v: 32, l: '32'},
]
// Cut method + cleanup live in a modal opened from the toolbar cog.
const showSettings = ref(false)

// ── Tilesets + sync ────────────────────────────────────────────────
// Signed in → the user's cloud tilesets. Guest → local tilesets kept in
// localStorage (they upload to the cloud on sign-in). `local` flags which.
type Ts = { id: number | string; id_string: string; title: string; local?: boolean }
const localTs = useLocalTilesets()
const tilesets = ref<Ts[]>([])
const selectedTilesetId = ref<number | string | null>(null)
const loadingTs = ref(false)
const showNewTs = ref(false)
const newTsName = ref('')
const creatingTs = ref(false)
const pickerRef = ref<{ close: () => void } | null>(null)
const selectedTs = computed(() => tilesets.value.find(c => c.id === selectedTilesetId.value) || null)
const currentTsName = computed(() => selectedTilesetId.value == null ? 'No tileset' : (selectedTs.value?.title || 'Tileset'))
// tileKey → the cloud art it became, so synced tiles show a check across reloads
const syncedTiles = ref<Record<string, { id: number; id_string: string }>>({})
const syncingKey = ref<string | null>(null)

// ── Display / selection ────────────────────────────────────────────
const sheetCanvas = ref<HTMLCanvasElement | null>(null)
const tilePreview = ref<HTMLCanvasElement | null>(null)
const wrapEl = ref<HTMLElement | null>(null)
const wrapSize = ref(0)         // square viewport side, in CSS px
const zoom = ref(1)             // render scale: display px per source px (whole-pixel only)
let resizeObs: ResizeObserver | null = null

function measureWrap() {
  // offsetWidth is independent of content overflow, so a scrollbar appearing
  // at high zoom won't feed back into the fit calculation.
  if (wrapEl.value) {
    wrapSize.value = wrapEl.value.offsetWidth
    drawSheet()
  }
}

// Whole-pixel zoom: the render scale is always an integer (≥1) or a unit
// fraction (1/n), so every source pixel maps to a uniform block — no broken /
// uneven pixels at fractional scales.
function fitScale(): number {
  const img = sourceImage.value
  if (!img || !wrapSize.value) return 1
  return wrapSize.value / Math.max(img.width, img.height)
}

// Largest whole-pixel scale that still fits (snap fit DOWN so it never overflows).
function snapDown(s: number): number {
  return s >= 1 ? Math.max(1, Math.floor(s)) : 1 / Math.ceil(1 / s)
}

function clampScale(s: number): number {
  const longest = sourceImage.value ? Math.max(sourceImage.value.width, sourceImage.value.height) : 1
  if (s >= 1) return Math.min(s, Math.max(1, Math.floor(Math.min(16, 8192 / longest))))
  return Math.max(1 / 16, s)
}

function setZoom(s: number) { zoom.value = clampScale(s) }
function zoomFit() { setZoom(snapDown(fitScale())) }

function zoomIn() {
  const s = zoom.value
  setZoom(s >= 1 ? s + 1 : (Math.round(1 / s) - 1 <= 1 ? 1 : 1 / (Math.round(1 / s) - 1)))
}

function zoomOut() {
  const s = zoom.value
  setZoom(s > 1 ? s - 1 : 1 / (Math.round(1 / s) + 1))
}

function onWheel(e: WheelEvent) {
  if (!e.ctrlKey && !e.metaKey) return  // plain wheel scrolls the viewport
  e.preventDefault()
  if (e.deltaY < 0) zoomIn(); else zoomOut()
}

onMounted(() => {
  if (typeof ResizeObserver !== 'undefined') {
    resizeObs = new ResizeObserver(measureWrap)
  }
  restoreState()
  loadTilesets()
  // Signed in with leftover guest tilesets → upload them, then refresh.
  if (auth.isLogged) localTs.syncToCloud().then(n => { if (n) loadTilesets() })
})

// Auth may resolve after mount (client plugin). On sign-in, push any local
// (guest) tilesets to the cloud, then reload from the cloud.
watch(() => auth.isLogged, async (v) => {
  if (v) {
    await localTs.syncToCloud()
    selectedTilesetId.value = null
  }
  await loadTilesets()
})
onBeforeUnmount(() => {
  resizeObs?.disconnect()
})
const selectedCell = ref<{ c: number; r: number } | null>(null)
const hoverCell = ref<{ c: number; r: number } | null>(null)
const selectedBox = ref(-1)
const hoverBox = ref(-1)
let displayScale = 1

// Selected region in source pixels, whatever the mode.
const activeBox = computed<Box | null>(() => {
  if (mode.value === 'grid') {
    if (!selectedCell.value) return null
    const {c, r} = selectedCell.value
    return {x: offsetX.value + c * (tileW.value + spacing.value), y: offsetY.value + r * (tileH.value + spacing.value), w: tileW.value, h: tileH.value}
  }
  if (mode.value === 'auto') return boxes.value[selectedBox.value] || null
  return regions.value[selectedRegion.value] || null
})

// Source dims (+ processed result) shown as a tooltip on the preview.
const previewInfo = computed(() => {
  const b = activeBox.value
  if (!b) return ''
  return `${b.w}×${b.h}px${cleanInfo.value ? ` → ${cleanInfo.value}` : ''}`
})

// ── Persist state across reloads ───────────────────────────────────
// The sheet (as a dataURL) plus every setting/region is mirrored to
// localStorage so a page refresh restores the work in progress. Auto-detected
// boxes are re-derived on restore (cheap + deterministic) rather than stored.
const STORAGE_KEY = 'tileset_state_v1'
// The source sheet (base64 dataURL, can be MBs) lives under its own key and is
// only rewritten when the image itself changes — not on every settings tweak.
// v1 stored the *displayed* (possibly cleaned) sheet, losing the original —
// after a refresh the toggle could never restore the raw upload. v2 stores the
// RAW upload; the cleaned sheet is re-derived on restore (deterministic, so
// saved regions/selections still line up).
const IMG_KEY = 'tileset_img_v1'
const RAW_KEY = 'tileset_img_v2'
let restoring = false

function snapshotState() {
  return {
    editorProcess: editorProcess.value,
    mode: mode.value,
    grid: {tileW: tileW.value, tileH: tileH.value, spacing: spacing.value, offsetX: offsetX.value, offsetY: offsetY.value, linkSize: linkSize.value},
    auto: {bg: bg.value, tolerance: tolerance.value, minSize: minSize.value, mergeGap: mergeGap.value},
    regions: regions.value,
    shape: {kind: selectShape.value, w: fixedW.value, h: fixedH.value, link: fixedLink.value},
    sel: {region: selectedRegion.value, cell: selectedCell.value, box: selectedBox.value},
    clean: {crispFactor: crispFactor.value, mergeTol: mergeTol.value, removeBg: removeBg.value, removeBgTol: removeBgTol.value, despeckle: despeckle.value, median: median.value, quantize: quantize.value},
    zoom: zoom.value,
    tilesetId: selectedTilesetId.value,
    synced: syncedTiles.value,
  }
}

function saveState() {
  if (restoring || typeof localStorage === 'undefined') return
  try {
    if (!imageData.value) {
      localStorage.removeItem(STORAGE_KEY)
      localStorage.removeItem(IMG_KEY)
      localStorage.removeItem(RAW_KEY)
      return
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshotState()))
  } catch (e) {
    // Quota exceeded (very large sheet) — degrade gracefully, just don't persist.
    console.warn('Tileset: could not save state', e)
  }
}
const debouncedSave = debounce(saveState, 400)

// The heavy part — persisted only when the image actually changes. The raw
// upload is the source of truth; the legacy processed-sheet key is dropped so
// old states can't shadow it.
watch(rawImageData, (v) => {
  if (restoring || typeof localStorage === 'undefined') return
  try {
    if (v) localStorage.setItem(RAW_KEY, v)
    else localStorage.removeItem(RAW_KEY)
    localStorage.removeItem(IMG_KEY)
  } catch (e) {
    console.warn('Tileset: could not save image', e)
  }
})

async function restoreState() {
  if (typeof localStorage === 'undefined') return
  let s: any = null
  try { s = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') } catch { return }
  // RAW_KEY is the raw upload (current format). IMG_KEY / `s.img` are legacy
  // states that only kept the displayed sheet — used as-is, never re-cleaned
  // (double-processing them would shift the saved regions).
  const rawSrc = (s && localStorage.getItem(RAW_KEY)) || ''
  const legacySrc = (s && (localStorage.getItem(IMG_KEY) || s.img)) || ''
  if (!s || (!rawSrc && !legacySrc)) return
  restoring = true
  editorProcess.value = !!s.editorProcess
  mode.value = s.mode ?? mode.value
  if (s.grid) {
    tileW.value = s.grid.tileW; tileH.value = s.grid.tileH; spacing.value = s.grid.spacing
    offsetX.value = s.grid.offsetX; offsetY.value = s.grid.offsetY; linkSize.value = s.grid.linkSize
  }
  if (s.auto) { bg.value = s.auto.bg; tolerance.value = s.auto.tolerance; minSize.value = s.auto.minSize; mergeGap.value = s.auto.mergeGap }
  regions.value = s.regions ?? []
  if (s.shape) {
    selectShape.value = s.shape.kind ?? 'free'
    fixedW.value = s.shape.w ?? 16; fixedH.value = s.shape.h ?? 16; fixedLink.value = s.shape.link ?? true
  }
  if (s.sel) { selectedRegion.value = s.sel.region ?? -1; selectedCell.value = s.sel.cell ?? null; selectedBox.value = s.sel.box ?? -1 }
  if (s.clean) {
    crispFactor.value = s.clean.crispFactor; mergeTol.value = s.clean.mergeTol
    removeBg.value = s.clean.removeBg; removeBgTol.value = s.clean.removeBgTol
    despeckle.value = s.clean.despeckle; median.value = s.clean.median; quantize.value = s.clean.quantize
  }
  if (s.tilesetId != null) selectedTilesetId.value = s.tilesetId
  if (s.synced) syncedTiles.value = s.synced
  // Displayed sheet: the raw upload, re-cleaned when the toggle was on —
  // deterministic, so the regions/selection restored above still line up.
  let display = rawSrc || legacySrc
  if (rawSrc && editorProcess.value) {
    const url = await cleanSheet(rawSrc)
    if (url) display = url
  }
  const img = new Image()
  img.onload = () => {
    sourceImage.value = img
    imageData.value = display
    rawImageData.value = rawSrc || legacySrc
    nextTick(() => {
      measureWrap()
      if (resizeObs && wrapEl.value) { resizeObs.disconnect(); resizeObs.observe(wrapEl.value) }
      if (s.zoom) setZoom(s.zoom); else zoomFit()
      drawSheet()
      if (mode.value === 'auto') detect()
      restoring = false
    })
  }
  img.onerror = () => { restoring = false }
  img.src = display
}

// Mirror any change to storage (debounced). Object/array refs use getters so we
// avoid a deep watcher while still reacting to region edits and bg picks.
watch(
    [
      mode, tileW, tileH, spacing, offsetX, offsetY, linkSize,
      tolerance, minSize, mergeGap, selectedRegion, selectedBox,
      crispFactor, mergeTol, removeBg, removeBgTol, despeckle, median, quantize,
      zoom, imageData, editorProcess, selectedTilesetId, selectShape, fixedW, fixedH, fixedLink,
      () => bg.value.join(','),
      () => JSON.stringify(regions.value),
      () => selectedCell.value ? `${selectedCell.value.c},${selectedCell.value.r}` : '',
      () => JSON.stringify(syncedTiles.value),
    ],
    debouncedSave,
)

// ── Load image ─────────────────────────────────────────────────────
function openFileDialog() {
  fileInput.value?.click()
}

// Discard the loaded sheet and every selection, back to the empty dropzone.
// The imageData/state watchers drop the localStorage snapshot automatically.
function clearImage() {
  sourceImage.value = null
  imageData.value = ''
  rawImageData.value = ''
  selectedCell.value = null
  selectedBox.value = -1
  selectedRegion.value = -1
  boxes.value = []
  regions.value = []
  draft.value = null
  if (fileInput.value) fileInput.value.value = ''
}

function onFileSelect(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (file) loadFile(file)
}

function onDrop(e: DragEvent) {
  e.preventDefault()
  const file = e.dataTransfer?.files?.[0]
  if (file && file.type.startsWith('image/')) loadFile(file)
}

function loadFile(file: File) {
  sourceName.value = file.name.replace(/\.[^.]+$/, '')
  const reader = new FileReader()
  reader.onload = (e) => {
    rawImageData.value = e.target?.result as string
    applySource()
  }
  reader.readAsDataURL(file)
}

// Render the editor pipeline's sample grid back to a 1:1 pixel-art dataURL.
// Cells matching the pipeline's transparent placeholder become transparent.
function gridToDataUrl(grid: RGB[][], transparent: RGB | null): string {
  const h = grid.length
  let w = 0
  for (const row of grid) w = Math.max(w, row?.length || 0)
  if (!w || !h) return ''
  const cv = document.createElement('canvas')
  cv.width = w; cv.height = h
  const ctx = cv.getContext('2d')!
  const out = ctx.createImageData(w, h)
  for (let y = 0; y < h; y++) {
    const row = grid[y] || []
    for (let x = 0; x < w; x++) {
      const px = row[x]
      const i = (y * w + x) * 4
      if (!px) continue // leaves it transparent (alpha 0)
      const [r, g, b] = px
      if (transparent && r === transparent[0] && g === transparent[1] && b === transparent[2]) continue
      out.data[i] = r!; out.data[i + 1] = g!; out.data[i + 2] = b!; out.data[i + 3] = 255
    }
  }
  ctx.putImageData(out, 0, 0)
  return cv.toDataURL('image/png')
}

// The editor's import pipeline (de-upscale, crop, quantize) over a raw data
// URL → a cleaned data URL, or '' when it fails. Shared by the toggle flow
// and the state restore, which must re-derive the same sheet from the raw.
async function cleanSheet(raw: string): Promise<string> {
  processing.value = true
  try {
    const {dataUrlToSamplesGrid} = await import('~/helper/canvas')
    const {rgbSamplesGrid, colorThatRepresentsTransparent} = await dataUrlToSamplesGrid(raw)
    return gridToDataUrl(rgbSamplesGrid, colorThatRepresentsTransparent)
  } catch (err) {
    console.error('Tileset: editor import failed', err)
    return ''
  } finally {
    processing.value = false
  }
}

// Build the working sheet from the raw upload — optionally through the editor's
// import pipeline first — then load it as the source image.
async function applySource() {
  const raw = rawImageData.value
  if (!raw) return
  let dataUrl = raw
  if (editorProcess.value) {
    const url = await cleanSheet(raw)
    if (url) dataUrl = url
    else toast.error('Could not process image — using the original')
  }
  const img = new Image()
  img.onload = () => setSource(img, dataUrl)
  img.src = dataUrl
}

function setSource(img: HTMLImageElement, dataUrl: string) {
  sourceImage.value = img
  imageData.value = dataUrl
  selectedCell.value = null
  selectedBox.value = -1
  selectedRegion.value = -1
  boxes.value = []
  regions.value = []
  draft.value = null
  tileW.value = tileH.value = guessTileSize(img.width, img.height)
  bg.value = pickCornerColor(img)
  nextTick(() => {
    measureWrap()
    if (resizeObs && wrapEl.value) { resizeObs.disconnect(); resizeObs.observe(wrapEl.value) }
    zoomFit()
    drawSheet()
    if (mode.value === 'auto') detect()
  })
}

function guessTileSize(w: number, h: number): number {
  for (const s of [64, 48, 32, 24, 16, 8]) {
    if (w % s === 0 && h % s === 0 && (w / s) * (h / s) > 1) return s
  }
  return 16
}

function pickCornerColor(img: HTMLImageElement): RGB {
  const cv = document.createElement('canvas')
  cv.width = 1; cv.height = 1
  const ctx = cv.getContext('2d')!
  ctx.drawImage(img, 0, 0, 1, 1, 0, 0, 1, 1)
  const d = ctx.getImageData(0, 0, 1, 1).data
  return [d[0]!, d[1]!, d[2]!]
}

// ── Auto-detect: connected-component bounding boxes ────────────────
function detect() {
  if (!sourceImage.value) return
  detecting.value = true
  setTimeout(() => {
    try {
      runDetect(sourceImage.value!)
    } catch (err) {
      console.error(err); toast.error('Detection failed')
    } finally {
      detecting.value = false; drawSheet()
    }
  }, 0)
}

function runDetect(img: HTMLImageElement) {
  const w = img.width, h = img.height
  const cv = document.createElement('canvas')
  cv.width = w; cv.height = h
  const ctx = cv.getContext('2d', {willReadFrequently: true})!
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(img, 0, 0)
  const data = ctx.getImageData(0, 0, w, h).data
  const N = w * h

  const [br, bgr, bb] = bg.value
  const thr = (tolerance.value * 2) ** 2
  const fg = new Uint8Array(N)
  for (let i = 0; i < N; i++) {
    if (data[i * 4 + 3]! < 16) continue
    const dr = data[i * 4]! - br, dg = data[i * 4 + 1]! - bgr, db = data[i * 4 + 2]! - bb
    if (dr * dr + dg * dg + db * db > thr) fg[i] = 1
  }

  let mask = fg
  const g = mergeGap.value
  if (g > 0) {
    const tmp = new Uint8Array(N)
    for (let y = 0; y < h; y++) {
      const row = y * w
      for (let x = 0; x < w; x++) {
        for (let k = -g; k <= g; k++) {
          const xx = x + k
          if (xx >= 0 && xx < w && fg[row + xx]) { tmp[row + x] = 1; break }
        }
      }
    }
    const dil = new Uint8Array(N)
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < h; y++) {
        for (let k = -g; k <= g; k++) {
          const yy = y + k
          if (yy >= 0 && yy < h && tmp[yy * w + x]) { dil[y * w + x] = 1; break }
        }
      }
    }
    mask = dil
  }

  const labels = new Int32Array(N)
  const stack = new Int32Array(N)
  let cur = 0
  for (let i = 0; i < N; i++) {
    if (!mask[i] || labels[i]) continue
    cur++
    let sp = 0
    stack[sp++] = i
    labels[i] = cur
    while (sp > 0) {
      const p = stack[--sp]
      const px = p % w, py = (p / w) | 0
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue
          const nx = px + dx, ny = py + dy
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
          const np = ny * w + nx
          if (mask[np] && !labels[np]) { labels[np] = cur; stack[sp++] = np }
        }
      }
    }
  }

  const minX = new Int32Array(cur + 1).fill(1e9)
  const minY = new Int32Array(cur + 1).fill(1e9)
  const maxX = new Int32Array(cur + 1).fill(-1)
  const maxY = new Int32Array(cur + 1).fill(-1)
  for (let i = 0; i < N; i++) {
    if (!fg[i]) continue
    const l = labels[i]
    if (!l) continue
    const x = i % w, y = (i / w) | 0
    if (x < minX[l]!) minX[l] = x
    if (x > maxX[l]!) maxX[l] = x
    if (y < minY[l]!) minY[l] = y
    if (y > maxY[l]!) maxY[l] = y
  }

  const ms = minSize.value
  const out: Box[] = []
  for (let l = 1; l <= cur; l++) {
    if (maxX[l]! < 0) continue
    const x = minX[l]!, y = minY[l]!
    const bw = maxX[l]! - x + 1, bh = maxY[l]! - y + 1
    if (Math.min(bw, bh) < ms) continue
    if (bw >= w * 0.98 && bh >= h * 0.98) continue
    out.push({x, y, w: bw, h: bh})
  }
  out.sort((a, b) => (a.y - b.y) || (a.x - b.x))
  boxes.value = out
  selectedBox.value = -1
  hoverBox.value = -1
}

// ── Draw sheet + overlay ───────────────────────────────────────────
function drawSheet() {
  const cv = sheetCanvas.value
  const img = sourceImage.value
  if (!cv || !img) return
  // Resolution-match the canvas to the zoomed on-screen size so overlay lines
  // stay a crisp 1px at any zoom (1 bitmap px == 1 CSS px, no CSS upscaling).
  const longest = Math.max(img.width, img.height)
  displayScale = Math.min(zoom.value, 8192 / longest)
  const cw = Math.max(1, Math.round(img.width * displayScale))
  const ch = Math.max(1, Math.round(img.height * displayScale))
  displayScale = cw / img.width  // exact rendered scale → overlay aligns with bitmap
  cv.width = cw; cv.height = ch
  const ctx = cv.getContext('2d')!
  ctx.imageSmoothingEnabled = false
  ctx.clearRect(0, 0, cw, ch)
  ctx.drawImage(img, 0, 0, cw, ch)
  if (mode.value === 'grid') drawGrid(ctx)
  else if (mode.value === 'auto') drawBoxes(ctx)
  else drawRegions(ctx)
}

function fillRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fill: string, stroke: string | null) {
  const sx = x * displayScale, sy = y * displayScale, sw = w * displayScale, sh = h * displayScale
  ctx.fillStyle = fill
  ctx.fillRect(sx, sy, sw, sh)
  if (stroke) {
    ctx.lineWidth = 2; ctx.strokeStyle = stroke
    ctx.strokeRect(Math.round(sx) + 1, Math.round(sy) + 1, Math.round(sw) - 2, Math.round(sh) - 2)
  }
}

function drawGrid(ctx: CanvasRenderingContext2D) {
  if (tileW.value <= 0 || tileH.value <= 0) return
  const spanX = (tileW.value + spacing.value) * displayScale
  const spanY = (tileH.value + spacing.value) * displayScale
  const tw = tileW.value * displayScale, th = tileH.value * displayScale
  const mx = offsetX.value * displayScale, my = offsetY.value * displayScale
  ctx.lineWidth = 1
  const cw = ctx.canvas.width, ch = ctx.canvas.height
  if (spacing.value === 0) {
    // No spacing (the normal case): full-canvas line families, one long stroke
    // per boundary — same grid style as the tilemap/pixel editors' world grid.
    // The modulo start extends lines across offset margins and partial edge
    // cells, so the lattice fills the whole sheet. Black + white pass keeps it
    // readable on any image.
    for (const [color, shift] of [['rgba(0,0,0,0.55)', 0], ['rgba(255,255,255,0.35)', 1]] as const) {
      ctx.strokeStyle = color
      ctx.beginPath()
      for (let x = ((mx % spanX) + spanX) % spanX; x <= cw + 1; x += spanX) {
        // A 1px line is centered on its coordinate: at the right/bottom edge
        // the +0.5 crisping offset pushes it outside the bitmap — clamp the
        // black/white pair back inside.
        let px = Math.round(x) + 0.5 + shift
        if (px > cw - 0.5) px = cw - 0.5 - shift
        ctx.moveTo(px, 0)
        ctx.lineTo(px, ch)
      }
      for (let y = ((my % spanY) + spanY) % spanY; y <= ch + 1; y += spanY) {
        let py = Math.round(y) + 0.5 + shift
        if (py > ch - 0.5) py = ch - 0.5 - shift
        ctx.moveTo(0, py)
        ctx.lineTo(cw, py)
      }
      ctx.stroke()
    }
  } else {
    // With spacing, cells are separated by gaps a continuous lattice can't
    // express — outline each cell, clamping edge cells inside the bitmap.
    const maxX = cw - 0.5, maxY = ch - 0.5
    for (const [color, inset] of [['rgba(0,0,0,0.55)', 0], ['rgba(255,255,255,0.35)', 1]] as const) {
      ctx.strokeStyle = color
      for (let r = 0; r < rows.value; r++) {
        for (let c = 0; c < cols.value; c++) {
          const x = Math.round(mx + c * spanX) + 0.5 + inset
          const y = Math.round(my + r * spanY) + 0.5 + inset
          const w = Math.min(Math.round(tw) - inset * 2, maxX - inset - x)
          const h = Math.min(Math.round(th) - inset * 2, maxY - inset - y)
          ctx.strokeRect(x, y, w, h)
        }
      }
    }
  }
  if (hoverCell.value && (!selectedCell.value || hoverCell.value.c !== selectedCell.value.c || hoverCell.value.r !== selectedCell.value.r)) {
    fillRect(ctx, offsetX.value + hoverCell.value.c * (tileW.value + spacing.value), offsetY.value + hoverCell.value.r * (tileH.value + spacing.value), tileW.value, tileH.value, 'rgba(255,255,255,0.12)', null)
  }
  if (selectedCell.value) {
    fillRect(ctx, offsetX.value + selectedCell.value.c * (tileW.value + spacing.value), offsetY.value + selectedCell.value.r * (tileH.value + spacing.value), tileW.value, tileH.value, 'rgba(99,102,241,0.18)', '#6366f1')
  }
}

function drawBoxes(ctx: CanvasRenderingContext2D) {
  ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(99,102,241,0.85)'
  for (const b of boxes.value) {
    ctx.strokeRect(Math.round(b.x * displayScale) + 0.5, Math.round(b.y * displayScale) + 0.5, Math.round(b.w * displayScale), Math.round(b.h * displayScale))
  }
  if (hoverBox.value >= 0 && hoverBox.value !== selectedBox.value) {
    const b = boxes.value[hoverBox.value]!; fillRect(ctx, b.x, b.y, b.w, b.h, 'rgba(255,255,255,0.12)', null)
  }
  if (selectedBox.value >= 0) {
    const b = boxes.value[selectedBox.value]!; fillRect(ctx, b.x, b.y, b.w, b.h, 'rgba(99,102,241,0.22)', '#6366f1')
  }
}

function drawRegions(ctx: CanvasRenderingContext2D) {
  ctx.font = 'bold 11px ui-sans-serif, system-ui, sans-serif'
  ctx.textBaseline = 'top'
  for (let i = 0; i < regions.value.length; i++) {
    const b = regions.value[i]!
    const x = b.x * displayScale, y = b.y * displayScale, w = b.w * displayScale, h = b.h * displayScale
    if (i === selectedRegion.value) { ctx.fillStyle = 'rgba(99,102,241,0.20)'; ctx.fillRect(x, y, w, h) }
    ctx.lineWidth = i === selectedRegion.value ? 2 : 1
    ctx.strokeStyle = i === selectedRegion.value ? '#6366f1' : 'rgba(99,102,241,0.85)'
    ctx.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, Math.round(w), Math.round(h))
    ctx.fillStyle = '#6366f1'; ctx.fillRect(x, y, 15, 14)
    ctx.fillStyle = '#fff'; ctx.fillText(String(i + 1), x + 4, y + 2)
  }
  if (draft.value) {
    const b = draft.value
    ctx.setLineDash([4, 3]); ctx.lineWidth = 1; ctx.strokeStyle = '#6366f1'
    ctx.strokeRect(b.x * displayScale + 0.5, b.y * displayScale + 0.5, b.w * displayScale, b.h * displayScale)
    ctx.setLineDash([])
  }
}

// ── Pointer helpers ────────────────────────────────────────────────
function eventToSource(e: MouseEvent): Pt | null {
  const cv = sheetCanvas.value
  const img = sourceImage.value
  if (!cv || !img) return null
  const rect = cv.getBoundingClientRect()
  if (!rect.width || !rect.height) return null
  // Map the displayed canvas box straight to source pixels. The canvas always
  // shows the whole image, so this is exact at any zoom (no displayScale, no
  // rounding drift).
  return {
    x: (e.clientX - rect.left) * (img.width / rect.width),
    y: (e.clientY - rect.top) * (img.height / rect.height),
  }
}

function clampPt(p: Pt): Pt {
  const img = sourceImage.value!
  return {x: Math.max(0, Math.min(img.width, p.x)), y: Math.max(0, Math.min(img.height, p.y))}
}

function rectFrom(a: Pt, b: Pt): Box {
  return {
    x: Math.round(Math.min(a.x, b.x)),
    y: Math.round(Math.min(a.y, b.y)),
    w: Math.round(Math.abs(a.x - b.x)),
    h: Math.round(Math.abs(a.y - b.y)),
  }
}

// Keep a box inside the image bounds.
function clampBox(b: Box): Box {
  const img = sourceImage.value!
  let {x, y, w, h} = b
  if (x < 0) { w += x; x = 0 }
  if (y < 0) { h += y; y = 0 }
  w = Math.max(0, Math.min(w, img.width - x))
  h = Math.max(0, Math.min(h, img.height - y))
  return {x, y, w, h}
}

// Build the draft box for the active selection shape.
function shapeBox(start: Pt, cur: Pt): Box {
  if (selectShape.value === 'fixed') {
    return clampBox({x: Math.round(start.x), y: Math.round(start.y), w: fixedW.value, h: fixedH.value})
  }
  if (selectShape.value === 'square') {
    const dx = cur.x - start.x, dy = cur.y - start.y
    const side = Math.round(Math.max(Math.abs(dx), Math.abs(dy)))
    const x = dx < 0 ? Math.round(start.x) - side : Math.round(start.x)
    const y = dy < 0 ? Math.round(start.y) - side : Math.round(start.y)
    return clampBox({x, y, w: side, h: side})
  }
  return rectFrom(start, cur)
}

function cellAt(sx: number, sy: number): { c: number; r: number } | null {
  const spanX = tileW.value + spacing.value, spanY = tileH.value + spacing.value
  const c = Math.floor((sx - offsetX.value) / spanX), r = Math.floor((sy - offsetY.value) / spanY)
  if (c < 0 || r < 0 || c >= cols.value || r >= rows.value) return null
  if (sx - offsetX.value - c * spanX > tileW.value || sy - offsetY.value - r * spanY > tileH.value) return null
  return {c, r}
}

function smallestBoxAt(list: Box[], sx: number, sy: number): number {
  let best = -1, bestArea = Infinity
  for (let i = 0; i < list.length; i++) {
    const b = list[i]!
    if (sx >= b.x && sy >= b.y && sx < b.x + b.w && sy < b.y + b.h && b.w * b.h < bestArea) {
      bestArea = b.w * b.h; best = i
    }
  }
  return best
}

// ── Pointer handlers ───────────────────────────────────────────────
let gridStartOffset = {x: 0, y: 0}
let dragMoved = false

function onDown(e: MouseEvent) {
  if (picking.value) return  // eyedropper handled on click (onUp)
  const p = eventToSource(e)
  if (!p) return
  if (mode.value === 'select') {
    dragging.value = true
    dragStart.value = clampPt(p)
    dragMoved = false
    // Grabbing inside an existing region moves it; otherwise draw/drop a new box.
    const hit = smallestBoxAt(regions.value, p.x, p.y)
    if (hit >= 0) {
      movingRegion.value = hit
      selectedRegion.value = hit
      const r = regions.value[hit]!
      moveGrab = {dx: p.x - r.x, dy: p.y - r.y}
      draft.value = null
      drawSheet()
      nextTick(drawTilePreview)
      return
    }
    // Fixed size: a plain click is enough — seed the draft so onUp commits it.
    draft.value = selectShape.value === 'fixed' ? shapeBox(dragStart.value, dragStart.value) : null
    if (draft.value) drawSheet()
  } else if (mode.value === 'grid') {
    // Grab the grid to pan it; a click without movement selects a tile.
    dragging.value = true
    dragStart.value = p
    gridStartOffset = {x: offsetX.value, y: offsetY.value}
    dragMoved = false
  }
}

function onMove(e: MouseEvent) {
  const p = eventToSource(e)
  if (!p) return
  if (mode.value === 'select') {
    if (movingRegion.value >= 0) {
      const r = regions.value[movingRegion.value]
      if (r) {
        const img = sourceImage.value!
        const nx = Math.round(Math.max(0, Math.min(img.width - r.w, p.x - moveGrab.dx)))
        const ny = Math.round(Math.max(0, Math.min(img.height - r.h, p.y - moveGrab.dy)))
        if (nx !== r.x || ny !== r.y) { r.x = nx; r.y = ny; dragMoved = true; drawSheet() }
      }
      return
    }
    if (dragging.value && dragStart.value) {
      draft.value = shapeBox(dragStart.value, clampPt(p))
      drawSheet()
      return
    }
    // Idle hover: show a move cursor when over an existing region.
    const h = smallestBoxAt(regions.value, p.x, p.y)
    if (h !== hoverRegion.value) hoverRegion.value = h
    return
  }
  if (mode.value === 'grid') {
    if (dragging.value && dragStart.value) {
      const img = sourceImage.value!
      const dx = p.x - dragStart.value.x, dy = p.y - dragStart.value.y
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) dragMoved = true
      offsetX.value = Math.max(0, Math.min(img.width, Math.round(gridStartOffset.x + dx)))
      offsetY.value = Math.max(0, Math.min(img.height, Math.round(gridStartOffset.y + dy)))
      drawSheet()
    } else {
      const c = cellAt(p.x, p.y)
      if ((c?.c !== hoverCell.value?.c) || (c?.r !== hoverCell.value?.r)) { hoverCell.value = c; drawSheet() }
    }
    return
  }
  const i = smallestBoxAt(boxes.value, p.x, p.y)
  if (i !== hoverBox.value) { hoverBox.value = i; drawSheet() }
}

function onUp(e: MouseEvent) {
  const p = eventToSource(e)
  if (!p) return
  if (picking.value) {
    pickBgAt(clampPt(p))
    picking.value = false
    drawSheet()
    if (mode.value === 'auto') detect()
    else if (activeBox.value) nextTick(drawTilePreview)
    return
  }
  if (mode.value === 'grid') {
    dragging.value = false
    if (!dragMoved) {
      const c = cellAt(p.x, p.y)
      if (c) { selectedCell.value = c; nextTick(drawTilePreview) }
    }
    drawSheet()
    return
  }
  if (mode.value === 'auto') {
    const i = smallestBoxAt(boxes.value, p.x, p.y)
    if (i >= 0) { selectedBox.value = i; nextTick(drawTilePreview) }
    drawSheet()
    return
  }
  // select: finalize a move, a drawn box, or treat a non-drag as a click-select
  dragging.value = false
  if (movingRegion.value >= 0) {
    selectedRegion.value = movingRegion.value
    movingRegion.value = -1
    drawSheet()
    nextTick(drawTilePreview)
    return
  }
  const d = draft.value
  if (d && d.w >= 2 && d.h >= 2) {
    regions.value.push(d)
    selectedRegion.value = regions.value.length - 1
  } else {
    selectedRegion.value = smallestBoxAt(regions.value, p.x, p.y)
  }
  draft.value = null
  drawSheet()
  nextTick(drawTilePreview)
}

function onLeave() {
  if (dragging.value) {
    if (mode.value === 'select') {
      if (movingRegion.value >= 0) {
        // Keep the region at its current position; just end the move.
        movingRegion.value = -1
        nextTick(drawTilePreview)
      } else {
        const d = draft.value
        if (d && d.w >= 2 && d.h >= 2) {
          regions.value.push(d)
          selectedRegion.value = regions.value.length - 1
          nextTick(drawTilePreview)
        }
        draft.value = null
      }
    }
    dragging.value = false
    drawSheet()
    return
  }
  let changed = false
  if (hoverCell.value) { hoverCell.value = null; changed = true }
  if (hoverBox.value >= 0) { hoverBox.value = -1; changed = true }
  if (hoverRegion.value >= 0) { hoverRegion.value = -1 }
  if (changed) drawSheet()
}

// ── Region list actions ────────────────────────────────────────────
function selectRegion(i: number) {
  selectedRegion.value = i
  drawSheet()
  nextTick(drawTilePreview)
}

function deleteRegion(i: number) {
  regions.value.splice(i, 1)
  if (selectedRegion.value === i) selectedRegion.value = -1
  else if (selectedRegion.value > i) selectedRegion.value--
  drawSheet()
}

function clearRegions() {
  regions.value = []
  selectedRegion.value = -1
  drawSheet()
}

// Unified list of extractable tiles for the current mode.
const tiles = computed<Box[]>(() => {
  if (mode.value === 'select') return regions.value
  if (mode.value === 'auto') return boxes.value
  const out: Box[] = []
  const sx = tileW.value + spacing.value
  const sy = tileH.value + spacing.value
  for (let r = 0; r < rows.value; r++) {
    for (let c = 0; c < cols.value; c++) {
      out.push({x: offsetX.value + c * sx, y: offsetY.value + r * sy, w: tileW.value, h: tileH.value})
    }
  }
  return out
})

function tileKey(b: Box): string {
  return `${b.x}_${b.y}_${b.w}_${b.h}`
}

function selectBox(i: number) {
  selectedBox.value = i
  drawSheet()
  nextTick(drawTilePreview)
}

function selectTile(i: number) {
  if (mode.value === 'select') selectRegion(i)
  else if (mode.value === 'auto') selectBox(i)
  else {
    selectedCell.value = {c: i % cols.value, r: Math.floor(i / cols.value)}
    drawSheet()
    nextTick(drawTilePreview)
  }
}

function isActiveTile(i: number): boolean {
  if (mode.value === 'select') return i === selectedRegion.value
  if (mode.value === 'auto') return i === selectedBox.value
  const cell = selectedCell.value
  return !!cell && i === cell.r * cols.value + cell.c
}

// ── Crop + extract ─────────────────────────────────────────────────
function cropBox(b: Box): HTMLCanvasElement | null {
  const img = sourceImage.value
  if (!img || b.w <= 0 || b.h <= 0) return null
  const cv = document.createElement('canvas')
  cv.width = b.w; cv.height = b.h
  const ctx = cv.getContext('2d', {willReadFrequently: true})!
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(img, b.x, b.y, b.w, b.h, 0, 0, b.w, b.h)
  return cv
}

function cropActive(): HTMLCanvasElement | null {
  return activeBox.value ? cropBox(activeBox.value) : null
}

// ── Cleanup: round pixels (de-upscale) + merge similar colours ─────
// How uniform are f×f blocks? High uniformity ⇒ the art is upscaled by f.
function blockUniformity(data: Uint8ClampedArray, w: number, h: number, f: number): number {
  const tol = 22 * 22 * 3
  let uni = 0, total = 0
  for (let by = 0; by + f <= h; by += f) {
    for (let bx = 0; bx + f <= w; bx += f) {
      total++
      const ri = (by * w + bx) * 4
      let ok = true
      for (let y = 0; y < f && ok; y++) {
        for (let x = 0; x < f; x++) {
          const i = ((by + y) * w + (bx + x)) * 4
          const dr = data[i]! - data[ri]!, dg = data[i + 1]! - data[ri + 1]!, db = data[i + 2]! - data[ri + 2]!
          if (dr * dr + dg * dg + db * db > tol || Math.abs(data[i + 3]! - data[ri + 3]!) > 40) { ok = false; break }
        }
      }
      if (ok) uni++
    }
  }
  return total ? uni / total : 0
}

function detectScale(data: Uint8ClampedArray, w: number, h: number): number {
  for (let f = 8; f >= 2; f--) {
    if (w < f * 2 || h < f * 2) continue
    if (blockUniformity(data, w, h, f) >= 0.82) return f
  }
  return 1
}

// Downsample by f using the most common colour per block (kills AA blur cleanly).
function downscaleMode(data: Uint8ClampedArray, w: number, h: number, f: number) {
  const w2 = Math.max(1, Math.round(w / f)), h2 = Math.max(1, Math.round(h / f))
  const out = new Uint8ClampedArray(w2 * h2 * 4)
  for (let oy = 0; oy < h2; oy++) {
    for (let ox = 0; ox < w2; ox++) {
      const counts = new Map<number, number>()
      let transparent = 0, total = 0
      for (let y = 0; y < f; y++) {
        for (let x = 0; x < f; x++) {
          const sx = ox * f + x, sy = oy * f + y
          if (sx >= w || sy >= h) continue
          total++
          const i = (sy * w + sx) * 4
          if (data[i + 3]! < 16) { transparent++; continue }
          const k = (data[i]! << 16) | (data[i + 1]! << 8) | data[i + 2]!
          counts.set(k, (counts.get(k) || 0) + 1)
        }
      }
      const oi = (oy * w2 + ox) * 4
      if (counts.size === 0 || transparent * 2 > total) { out[oi + 3] = 0; continue }
      let bestK = 0, best = -1
      counts.forEach((v, k) => { if (v > best) { best = v; bestK = k } })
      out[oi] = (bestK >> 16) & 255; out[oi + 1] = (bestK >> 8) & 255; out[oi + 2] = bestK & 255; out[oi + 3] = 255
    }
  }
  return {data: out, w: w2, h: h2}
}

// Cluster similar colours, seeding from the most frequent ones so each cluster's
// representative is the dominant (clean) colour rather than a noisy outlier.
function mergeSimilar(data: Uint8ClampedArray, w: number, h: number, tol: number): Uint8ClampedArray {
  const t2 = tol * tol
  const N = w * h
  const freq = new Map<number, number>()
  for (let i = 0; i < N; i++) {
    const o = i * 4
    if (data[o + 3]! < 16) continue
    const k = (data[o]! << 16) | (data[o + 1]! << 8) | data[o + 2]!
    freq.set(k, (freq.get(k) || 0) + 1)
  }
  const colors = [...freq.keys()].sort((a, b) => freq.get(b)! - freq.get(a)!)
  const reps: number[] = []
  const map = new Map<number, number>()
  for (const c of colors) {
    const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255
    let rep = -1
    for (const rk of reps) {
      const dr = r - ((rk >> 16) & 255), dg = g - ((rk >> 8) & 255), db = b - (rk & 255)
      if (dr * dr + dg * dg + db * db <= t2) { rep = rk; break }
    }
    if (rep < 0) { reps.push(c); map.set(c, c) } else map.set(c, rep)
  }
  const out = new Uint8ClampedArray(data.length)
  for (let i = 0; i < N; i++) {
    const o = i * 4
    if (data[o + 3]! < 16) { out[o + 3] = 0; continue }
    const rk = map.get((data[o]! << 16) | (data[o + 1]! << 8) | data[o + 2]!)!
    out[o] = (rk >> 16) & 255; out[o + 1] = (rk >> 8) & 255; out[o + 2] = rk & 255; out[o + 3] = 255
  }
  return out
}

// Remove orphan pixels: a pixel sharing no colour with its 4 neighbours is
// replaced by the majority neighbour colour (kills scattered artefacts).
function despeckleImg(data: Uint8ClampedArray, w: number, h: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(data)
  const key = (o: number) => (data[o]! << 16) | (data[o + 1]! << 8) | data[o + 2]!
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4
      if (data[o + 3]! < 16) continue
      const k = key(o)
      const counts = new Map<number, number>()
      let same = 0, total = 0
      const look = (nx: number, ny: number) => {
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) return
        const no = (ny * w + nx) * 4
        if (data[no + 3]! < 16) return
        total++
        const nk = key(no)
        counts.set(nk, (counts.get(nk) || 0) + 1)
        if (nk === k) same++
      }
      look(x - 1, y); look(x + 1, y); look(x, y - 1); look(x, y + 1)
      if (same === 0 && total > 0) {
        let best = k, bestN = 0
        counts.forEach((v, nk) => { if (v > bestN) { bestN = v; best = nk } })
        out[o] = (best >> 16) & 255; out[o + 1] = (best >> 8) & 255; out[o + 2] = best & 255
      }
    }
  }
  return out
}

// Remove the background by flood-filling from the edges: only background-coloured
// pixels CONNECTED to the border are cleared, so interior areas that happen to
// match the background colour (windows, shadows) are preserved.
function knockoutBg(data: Uint8ClampedArray, w: number, h: number, c: RGB, tol: number) {
  const t2 = (tol * 2) ** 2
  const N = w * h
  const bgLike = new Uint8Array(N)  // background colour or already transparent
  for (let i = 0; i < N; i++) {
    const o = i * 4
    if (data[o + 3]! < 16) { bgLike[i] = 1; continue }
    const dr = data[o]! - c[0], dg = data[o + 1]! - c[1], db = data[o + 2]! - c[2]
    if (dr * dr + dg * dg + db * db <= t2) bgLike[i] = 1
  }
  const visited = new Uint8Array(N)
  const stack = new Int32Array(N)
  let sp = 0
  const seed = (i: number) => { if (bgLike[i] && !visited[i]) { visited[i] = 1; stack[sp++] = i } }
  for (let x = 0; x < w; x++) { seed(x); seed((h - 1) * w + x) }
  for (let y = 0; y < h; y++) { seed(y * w); seed(y * w + w - 1) }
  while (sp > 0) {
    const i = stack[--sp]!
    data[i * 4 + 3] = 0
    const x = i % w, y = (i / w) | 0
    if (x > 0) seed(i - 1)
    if (x < w - 1) seed(i + 1)
    if (y > 0) seed(i - w)
    if (y < h - 1) seed(i + w)
  }
}

function pickBgAt(p: Pt) {
  const img = sourceImage.value
  if (!img) return
  const cv = document.createElement('canvas')
  cv.width = 1; cv.height = 1
  const ctx = cv.getContext('2d', {willReadFrequently: true})!
  ctx.drawImage(img, Math.floor(p.x), Math.floor(p.y), 1, 1, 0, 0, 1, 1)
  const d = ctx.getImageData(0, 0, 1, 1).data
  bg.value = [d[0]!, d[1]!, d[2]!]
}

// 3×3 vector-median filter: replace each pixel with the neighbourhood colour
// closest to all the others. Removes salt-and-pepper noise, preserves edges,
// and never invents a new colour.
function medianFilter(data: Uint8ClampedArray, w: number, h: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(data)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4
      if (data[o + 3]! < 16) continue
      const cols: number[][] = []
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
          const no = (ny * w + nx) * 4
          if (data[no + 3]! < 16) continue
          cols.push([data[no]!, data[no + 1]!, data[no + 2]!])
        }
      }
      if (cols.length < 3) continue
      let best = 0, bestSum = Infinity
      for (let i = 0; i < cols.length; i++) {
        let s = 0
        for (let j = 0; j < cols.length; j++) {
          if (i === j) continue
          const dr = cols[i]![0]! - cols[j]![0]!, dg = cols[i]![1]! - cols[j]![1]!, db = cols[i]![2]! - cols[j]![2]!
          s += dr * dr + dg * dg + db * db
        }
        if (s < bestSum) { bestSum = s; best = i }
      }
      const c = cols[best]!
      out[o] = c[0]!; out[o + 1] = c[1]!; out[o + 2] = c[2]!
    }
  }
  return out
}

// Reduce to k colours via median-cut, then map every pixel to the nearest.
function quantizeColors(data: Uint8ClampedArray, w: number, h: number, k: number): Uint8ClampedArray {
  const pts: number[][] = []
  for (let i = 0; i < w * h; i++) {
    const o = i * 4
    if (data[o + 3]! < 16) continue
    pts.push([data[o]!, data[o + 1]!, data[o + 2]!])
  }
  if (!pts.length) return new Uint8ClampedArray(data)

  const cut = (bucket: number[][], d: number): number[][] => {
    if (d === 0 || bucket.length === 0) {
      if (!bucket.length) return []
      let r = 0, g = 0, b = 0
      for (const p of bucket) { r += p[0]!; g += p[1]!; b += p[2]! }
      return [[Math.round(r / bucket.length), Math.round(g / bucket.length), Math.round(b / bucket.length)]]
    }
    let rMin = 255, rMax = 0, gMin = 255, gMax = 0, bMin = 255, bMax = 0
    for (const p of bucket) {
      if (p[0]! < rMin) rMin = p[0]!; if (p[0]! > rMax) rMax = p[0]!
      if (p[1]! < gMin) gMin = p[1]!; if (p[1]! > gMax) gMax = p[1]!
      if (p[2]! < bMin) bMin = p[2]!; if (p[2]! > bMax) bMax = p[2]!
    }
    const rR = rMax - rMin, gR = gMax - gMin, bR = bMax - bMin
    const ch = rR >= gR && rR >= bR ? 0 : (gR >= bR ? 1 : 2)
    bucket.sort((a, b) => a[ch]! - b[ch]!)
    const mid = bucket.length >> 1
    return [...cut(bucket.slice(0, mid), d - 1), ...cut(bucket.slice(mid), d - 1)]
  }

  const palette = cut(pts, Math.ceil(Math.log2(k))).slice(0, k)
  if (!palette.length) return new Uint8ClampedArray(data)

  const out = new Uint8ClampedArray(data)
  for (let i = 0; i < w * h; i++) {
    const o = i * 4
    if (data[o + 3]! < 16) continue
    let best = 0, bestD = Infinity
    for (let p = 0; p < palette.length; p++) {
      const c = palette[p]!
      const dr = data[o]! - c[0]!, dg = data[o + 1]! - c[1]!, db = data[o + 2]! - c[2]!
      const dd = dr * dr + dg * dg + db * db
      if (dd < bestD) { bestD = dd; best = p }
    }
    const c = palette[best]!
    out[o] = c[0]!; out[o + 1] = c[1]!; out[o + 2] = c[2]!
  }
  return out
}

function processCanvas(src: HTMLCanvasElement): HTMLCanvasElement {
  const idata = src.getContext('2d', {willReadFrequently: true})!.getImageData(0, 0, src.width, src.height)
  let dat: Uint8ClampedArray = idata.data
  let w = idata.width, h = idata.height
  if (removeBg.value) knockoutBg(dat, w, h, bg.value, removeBgTol.value)  // before downscale
  const f = crispFactor.value === 'auto' ? detectScale(dat, w, h) : (crispFactor.value as number)
  if (f > 1) { const d = downscaleMode(dat, w, h, f); dat = d.data; w = d.w; h = d.h }
  if (median.value) dat = medianFilter(dat, w, h)
  if (mergeTol.value > 0) dat = mergeSimilar(dat, w, h, mergeTol.value)
  if (quantize.value > 0) dat = quantizeColors(dat, w, h, quantize.value)
  if (despeckle.value) dat = despeckleImg(dat, w, h)
  const cv = document.createElement('canvas')
  cv.width = w; cv.height = h
  cv.getContext('2d')!.putImageData(new ImageData(dat, w, h), 0, 0)
  return cv
}

function processActive(): HTMLCanvasElement | null {
  const raw = cropActive()
  return raw ? processCanvas(raw) : null
}

function countColors(cv: HTMLCanvasElement): number {
  const d = cv.getContext('2d', {willReadFrequently: true})!.getImageData(0, 0, cv.width, cv.height).data
  const set = new Set<number>()
  for (let i = 0; i < cv.width * cv.height; i++) {
    const o = i * 4
    if (d[o + 3]! >= 16) set.add((d[o]! << 16) | (d[o + 1]! << 8) | d[o + 2]!)
  }
  return set.size
}

function drawTilePreview() {
  const cv = tilePreview.value
  const proc = processActive()
  if (!cv || !proc) { cleanInfo.value = ''; return }
  cleanInfo.value = `${proc.width}×${proc.height} · ${countColors(proc)} colors`
  const scale = Math.max(1, Math.floor(Math.min(256 / proc.width, 256 / proc.height)))
  cv.width = proc.width * scale; cv.height = proc.height * scale
  const ctx = cv.getContext('2d')!
  ctx.imageSmoothingEnabled = false
  ctx.clearRect(0, 0, cv.width, cv.height)
  ctx.drawImage(proc, 0, 0, cv.width, cv.height)
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('').toUpperCase()
}

// Convert a processed tile canvas → EditorData (pixel map + palette).
function canvasToEditorData(crop: HTMLCanvasElement, name = 'Tile'): EditorData | null {
  const w = crop.width, h = crop.height
  const data = crop.getContext('2d')!.getImageData(0, 0, w, h).data
  const colors: string[] = []
  const colorIndex = new Map<string, number>()
  const pixels: { [key: string]: number } = {}
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      if (data[i + 3]! < 16) continue
      const hex = rgbToHex(data[i]!, data[i + 1]!, data[i + 2]!)
      let idx = colorIndex.get(hex)
      if (idx === undefined) { idx = colors.length; colors.push(hex); colorIndex.set(hex, idx) }
      pixels[`${x}_${y}`] = idx
    }
  }
  if (!colors.length) return null
  return {
    ...cloneDeep(DEFAULT_EDITOR_DATA),
    id: generateUUID(), name, width: w, height: h, colors,
    layers: [{name: 'Layer 1', pixels, x: 0, y: 0}],
    updated: new Date().toISOString(),
  }
}

async function openInEditor() {
  const crop = processActive()
  if (!crop) return
  const editorData = canvasToEditorData(crop)
  if (!editorData) { toast.error('That selection is empty'); return }
  const ws = getStorageItem('workspaces')
  ws[editorData.id] = editorData
  localStorage.setItem('workspaces', JSON.stringify(ws))
  localStorage.setItem('workspace_current', editorData.id)
  await clearWorkspaceFull()   // single art → no multi-board snapshot
  navigateTo(`/editor?id=${editorData.id}`)
}

// Open EVERY cut tile in the pixel editor at once — one board per tile, laid out
// on a grid. The editor rebuilds a multi-board workspace from `workspace_full`.
async function openAllInEditor() {
  const boxes = tiles.value
  if (!boxes.length) { toast.error('No tiles to open'); return }
  const eds: EditorData[] = []
  boxes.forEach((b, i) => {
    const raw = cropBox(b)
    if (!raw) return
    const ed = canvasToEditorData(processCanvas(raw), `Tile ${i + 1}`)
    if (ed) eds.push(ed)
  })
  if (!eds.length) { toast.error('Those tiles are empty'); return }
  const ws = getStorageItem('workspaces')
  ws[eds[0]!.id] = eds[0]
  localStorage.setItem('workspace_current', eds[0]!.id)

  if (eds.length === 1) {
    localStorage.setItem('workspaces', JSON.stringify(ws))
    await clearWorkspaceFull()
    navigateTo(`/editor?id=${eds[0]!.id}`)
    return
  }
  // Grid layout in native (unzoomed) pixels; the editor fits the view on load.
  const cols = Math.ceil(Math.sqrt(eds.length))
  const cellW = Math.max(...eds.map(e => e.width))
  const cellH = Math.max(...eds.map(e => e.height))
  const padX = Math.max(2, Math.round(cellW * 0.25))
  const padY = Math.max(2, Math.round(cellH * 0.25))
  const boards = eds.map((data, i) => ({
    x: (i % cols) * (cellW + padX),
    y: Math.floor(i / cols) * (cellH + padY),
    data,
  }))
  localStorage.setItem('workspaces', JSON.stringify(ws))
  await saveWorkspaceFull({boards, activeIndex: 0})
  navigateTo('/editor')
}

// Group every cut tile into ONE animated art: each tile becomes a frame with a
// shared palette (the editor's colors array is artwork-global), then the piece
// opens in the editor with its timeline ready. Same meta.animation shape the
// editor's own loadAnimationFrames builds.
const MAX_ANIM_FRAMES = 64  // editor's MAX_FRAMES cap
// "Open editor" shape toggle: boards per tile (off) vs one animated art (on).
const openAsAnim = ref(false)
async function openAsAnimation() {
  const boxes = tiles.value
  if (boxes.length < 2) { toast.error('Cut at least 2 tiles to animate'); return }
  const colors: string[] = []
  const colorIndex = new Map<string, number>()
  const frames: { id: string; layers: any[]; duration: number }[] = []
  let fw = 0, fh = 0
  for (const b of boxes) {
    if (frames.length >= MAX_ANIM_FRAMES) break
    const raw = cropBox(b)
    if (!raw) continue
    const cv = processCanvas(raw)
    const {data} = cv.getContext('2d')!.getImageData(0, 0, cv.width, cv.height)
    const pixels: { [key: string]: number } = {}
    for (let y = 0; y < cv.height; y++) {
      for (let x = 0; x < cv.width; x++) {
        const i = (y * cv.width + x) * 4
        if (data[i + 3]! < 16) continue
        const hex = rgbToHex(data[i]!, data[i + 1]!, data[i + 2]!)
        let idx = colorIndex.get(hex)
        if (idx === undefined) { idx = colors.length; colors.push(hex); colorIndex.set(hex, idx) }
        pixels[`${x}_${y}`] = idx
      }
    }
    // Empty cells (grid margins, blank sheet areas) would become blank frames —
    // drop them, same as openAllInEditor drops empty tiles.
    if (!Object.keys(pixels).length) continue
    fw = Math.max(fw, cv.width); fh = Math.max(fh, cv.height)
    frames.push({id: generateUUID(), layers: [{name: 'Layer 1', pixels, x: 0, y: 0}], duration: 100})
  }
  if (frames.length < 2) { toast.error('Need at least 2 non-empty tiles to animate'); return }
  if (boxes.length > MAX_ANIM_FRAMES) toast.info(`Using the first ${MAX_ANIM_FRAMES} tiles (frame limit)`)
  const ed = {
    ...cloneDeep(DEFAULT_EDITOR_DATA),
    id: generateUUID(),
    name: sourceName.value || 'Animation',
    width: fw, height: fh, colors,
    layers: frames[0]!.layers,
    updated: new Date().toISOString(),
  }
  ed.meta = {...(ed.meta || {}), animation: {fps: 10, loop: true, frames, shared: []}}
  const ws = getStorageItem('workspaces')
  ws[ed.id] = ed
  localStorage.setItem('workspaces', JSON.stringify(ws))
  localStorage.setItem('workspace_current', ed.id)
  await clearWorkspaceFull()   // single (animated) art → no multi-board snapshot
  navigateTo(`/editor?id=${ed.id}`)
}

// ── Tilesets ───────────────────────────────────────────────────────
async function loadTilesets() {
  if (!auth.isLogged) {
    // Guest: mirror the local tileset library.
    tilesets.value = localTs.list.value.map(t => ({id: t.id, id_string: t.id, title: t.name, local: true}))
    return
  }
  loadingTs.value = true
  try {
    // Tileset list is owner-only server-side, so no ?mine needed.
    const res = await useNativeFetch<{ results: any[] }>('/coloring/tilesets/', {
      params: {page_size: 100, ordering: '-updated'},
    })
    tilesets.value = res.results.map(c => ({id: c.id, id_string: c.id_string, title: c.name || 'Untitled'}))
  } catch {
    /* non-fatal */
  } finally {
    loadingTs.value = false
  }
}

async function createTileset() {
  const title = newTsName.value.trim()
  if (!title || creatingTs.value) return
  creatingTs.value = true
  try {
    if (auth.isLogged) {
      const c = await useNativeFetch<any>('/coloring/tilesets/', {
        method: 'POST',
        body: {name: title, meta: {registry: {}, groups: [{id: 'g0', name: 'Tiles', kind: 'group', tiles: []}]}},
      })
      tilesets.value.unshift({id: c.id, id_string: c.id_string, title: c.name || title})
      selectedTilesetId.value = c.id
    } else {
      const t = localTs.create(title)
      tilesets.value.unshift({id: t.id, id_string: t.id, title: t.name, local: true})
      selectedTilesetId.value = t.id
    }
    showNewTs.value = false
    newTsName.value = ''
    pickerRef.value?.close()
    toast.success('Tileset created')
  } catch {
    toast.error('Could not create tileset')
  } finally {
    creatingTs.value = false
  }
}

function chooseTs(id: number | string | null) {
  selectedTilesetId.value = id
  showNewTs.value = false
  pickerRef.value?.close()
}

// ── Add a tile to a tileset (cloud when signed in, local for guests) ──
async function syncTile(box: Box, index: number) {
  const key = tileKey(box)
  if (syncedTiles.value[key] || syncingKey.value) return
  const raw = cropBox(box)
  if (!raw) return
  const canvas = processCanvas(raw)
  const ed = canvasToEditorData(canvas, `Tile ${index + 1}`)
  if (!ed) { toast.error('That tile is empty'); return }
  const sel = selectedTs.value

  // Guest: with a tileset selected the tile goes into it; without one it still
  // syncs — into the local workspace as a draft (parity with the signed-in
  // flow, which creates the cloud art regardless of tileset).
  if (!auth.isLogged) {
    syncingKey.value = key
    try {
      if (sel?.local) {
        localTs.addTile(String(sel.id), {name: ed.name, ed, thumb: canvas.toDataURL('image/png')})
        toast.success('Added to tileset')
      } else {
        const ws = getStorageItem('workspaces')
        ws[ed.id] = ed
        localStorage.setItem('workspaces', JSON.stringify(ws))
        toast.success('Synced to workspace')
      }
      syncedTiles.value = {...syncedTiles.value, [key]: {id: 0, id_string: ed.id}}
    } finally {
      syncingKey.value = null
    }
    return
  }

  // Signed in: create the cloud art, then add it to the chosen cloud tileset.
  syncingKey.value = key
  try {
    const page = await useNativeFetch<{ id: number; id_string: string }>('/coloring/shared-pages/', {
      method: 'POST',
      body: {
        name: ed.name, desc: '', tags: [],
        width: ed.width, height: ed.height,
        colors: ed.colors, layers: ed.layers,
        map_numbers: layers2MapNumbers(ed),
        is_template: true, is_public: false, is_tile: true, meta: {},
      },
    })
    const slug = sel && !sel.local ? sel.id_string : null
    if (slug) {
      try {
        await useNativeFetch(`/coloring/tilesets/${slug}/add-tile/`, {
          method: 'POST', body: {page_id: page.id},
        })
      } catch {
        toast.error('Synced, but adding to tileset failed')
      }
    }
    syncedTiles.value = {...syncedTiles.value, [key]: {id: page.id, id_string: page.id_string}}
    toast.success(slug ? 'Synced to workspace + tileset' : 'Synced to workspace')
  } catch {
    toast.error('Sync failed')
  } finally {
    syncingKey.value = null
  }
}

function downloadTile() {
  const crop = processActive()
  const b = activeBox.value
  if (!crop || !b) return
  const a = document.createElement('a')
  a.href = crop.toDataURL('image/png')
  a.download = `sprite_${b.x}_${b.y}.png`
  a.click()
  toast.success('Sprite downloaded')
}

function canvasHasPixels(cv: HTMLCanvasElement): boolean {
  const {data} = cv.getContext('2d')!.getImageData(0, 0, cv.width, cv.height)
  for (let i = 3; i < data.length; i += 4) if (data[i]! >= 16) return true
  return false
}

function canvasToPngBytes(cv: HTMLCanvasElement): Promise<Uint8Array | null> {
  return new Promise((resolve) => {
    cv.toBlob(async (blob) => {
      if (!blob) return resolve(null)
      resolve(new Uint8Array(await blob.arrayBuffer()))
    }, 'image/png')
  })
}

const exporting = ref(false)

// ZIP every cut tile — all three modes (grid cells, auto boxes, regions).
// Fully-transparent cells (grid margins, blank sheet areas) are skipped so the
// archive only contains real sprites.
async function downloadAllZip() {
  const boxes = tiles.value
  if (!boxes.length || exporting.value) return
  if (boxes.length > 2000) { toast.error('Too many tiles to ZIP — increase the tile size'); return }
  exporting.value = true
  try {
    const files: { name: string; data: Uint8Array }[] = []
    let skipped = 0
    for (const b of boxes) {
      const raw = cropBox(b)
      if (!raw) { skipped++; continue }
      const cv = processCanvas(raw)
      if (!canvasHasPixels(cv)) { skipped++; continue }
      const data = await canvasToPngBytes(cv)
      if (data) files.push({name: `tile_${files.length + 1}.png`, data})
    }
    if (!files.length) { toast.error('Nothing to export — all tiles are empty'); return }
    const blob = createZip(files)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'tiles.zip'; a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    toast.success(skipped ? `Exported ${files.length} tiles · ${skipped} empty skipped` : `Exported ${files.length} tiles`)
  } finally {
    exporting.value = false
  }
}

// ── Watchers ───────────────────────────────────────────────────────
const debouncedDetect = debounce(detect, 250)

watch(mode, () => {
  selectedCell.value = null
  selectedBox.value = -1
  selectedRegion.value = -1
  hoverCell.value = null
  hoverBox.value = -1
  hoverRegion.value = -1
  movingRegion.value = -1
  draft.value = null
  dragging.value = false
  drawSheet()
  if (mode.value === 'auto' && hasImage.value && !boxes.value.length) detect()
})

watch(linkSize, (v) => { if (v) tileH.value = tileW.value })
watch(tileW, (v) => { if (linkSize.value) tileH.value = v })

watch(fixedLink, (v) => { if (v) fixedH.value = fixedW.value })
watch(fixedW, (v) => { if (fixedLink.value) fixedH.value = v })

watch([tileW, tileH, spacing, offsetX, offsetY], () => {
  if (!sourceImage.value || mode.value !== 'grid') return
  if (selectedCell.value && (selectedCell.value.c >= cols.value || selectedCell.value.r >= rows.value)) selectedCell.value = null
  drawSheet()
  if (selectedCell.value) nextTick(drawTilePreview)
})

watch([tolerance, minSize, mergeGap], () => {
  if (sourceImage.value && mode.value === 'auto') debouncedDetect()
})

watch([crispFactor, mergeTol, removeBg, removeBgTol, despeckle, median, quantize], () => {
  if (activeBox.value) nextTick(drawTilePreview)
})

watch(zoom, () => { if (sourceImage.value) drawSheet() })

// Toggling "editor import" re-derives the sheet from the original upload.
watch(editorProcess, () => { if (!restoring && rawImageData.value) applySource() })

const faq = [
  {q: 'Is the Tileset Slicer free?', a: `<p>Yes — completely free and running entirely in your browser. No signup, no watermark, and your image is never uploaded to a server.</p>`},
  {q: 'What image formats can I slice?', a: `<p>PNG, JPG and WebP tile sheets and spritesheets. PNG transparency is preserved in the exported sprites.</p>`},
  {q: "How do I cut sprites that aren't evenly spaced?", a: `<p>Use <strong>Select</strong> mode and draw a box around each sprite — free-form, square (1:1) or a fixed size. Move boxes to fine-tune, then export them all.</p>`},
  {q: 'Can I export all sprites at once?', a: `<p>Yes. Select or auto-detect the sprites you want and <strong>Download all</strong> as a ZIP of individual PNG files.</p>`},
  {q: 'Does it keep transparency?', a: `<p>Yes. Pixels are extracted exactly at 1:1 with the alpha channel intact. You can also remove a background colour to make sprites transparent.</p>`},
  {q: 'Can I edit a sprite after slicing it?', a: `<p>Yes. Open any sprite straight in the <a href="/editor">pixel art editor</a> to keep drawing with layers, palette and export tools.</p>`},
]
</script>

<template>
  <div class="page">
    <div class="ts-slicer flat-editor">
      <!-- Top toolbar — File · Slice settings · zoom (spans both columns) -->
      <div class="editor-toolbar">
        <div class="toolbar-start">
          <ui-dropdown-menu>
            <ui-tooltip text="File">
              <button class="toolbar-btn"><span class="icon icon-file"/></button>
            </ui-tooltip>
            <template #menu>
              <div class="file-menu">
                <button class="file-menu-item" @click="openFileDialog">
                  <span class="icon icon-upload"/><span>Open image…</span>
                </button>
                <button class="file-menu-item" @click="openFileDialog">
                  <span class="icon icon-swap"/><span>Change sheet</span>
                </button>
                <div class="file-menu-sep"/>
                <button class="file-menu-item" @click="clearImage">
                  <span class="icon icon-broom"/><span>Clear current image</span>
                </button>
              </div>
            </template>
          </ui-dropdown-menu>
          <ui-tooltip text="Slice settings">
            <button class="toolbar-btn" title="Slice settings" @click="showSettings = true"><span class="icon icon-cog"/></button>
          </ui-tooltip>
        </div>
        <div class="toolbar-main no-scrollbar">
          <div class="toolbar-group">
            <ui-tooltip text="Zoom out">
              <button class="toolbar-btn" @click="zoomOut"><span class="icon icon-zoom-out"/></button>
            </ui-tooltip>
            <ui-tooltip text="Reset to fit">
              <button class="toolbar-btn zoom-pct" @click="zoomFit">{{ Math.round(zoom * 100) }}%</button>
            </ui-tooltip>
            <ui-tooltip text="Zoom in">
              <button class="toolbar-btn" @click="zoomIn"><span class="icon icon-zoom-in"/></button>
            </ui-tooltip>
            <ui-tooltip text="Fit to view">
              <button class="toolbar-btn" @click="zoomFit"><span class="fit-label">FIT</span></button>
            </ui-tooltip>
          </div>
          <div class="toolbar-sep"/>
          <div class="toolbar-group">
            <ui-tooltip text="Open selected tile in editor">
              <button class="toolbar-btn" :disabled="!activeBox" @click="openInEditor"><span class="icon icon-pen"/></button>
            </ui-tooltip>
            <ui-tooltip text="Download selected tile as PNG">
              <button class="toolbar-btn" :disabled="!activeBox" @click="downloadTile"><span class="icon icon-download"/></button>
            </ui-tooltip>
          </div>
        </div>
      </div>

      <!-- Body: canvas stage + control rail — editor-style flex row -->
      <div class="ts-body">
      <!-- Stage: 1:1 canvas (or the drop target until a sheet loads), then a divided status foot -->
      <div class="ts-stage">
        <Widget>
          <div class="ts-stage-inner">
            <div v-if="hasImage" ref="wrapEl" class="ts-canvas-wrap no-scrollbar">
              <canvas
                  ref="sheetCanvas"
                  class="ts-canvas pixelated"
                  :class="{drawing: mode === 'select', moving: mode === 'select' && !picking && (movingRegion >= 0 || hoverRegion >= 0), grabbable: mode === 'grid', grabbing: mode === 'grid' && dragging, picking}"
                  @mousedown="onDown"
                  @mousemove="onMove"
                  @mouseup="onUp"
                  @mouseleave="onLeave"
                  @wheel="onWheel"
                  @dblclick="zoomFit"
              />
            </div>
            <div v-else class="ts-dropzone" @click="openFileDialog" @drop="onDrop" @dragover.prevent>
              <span class="icon icon-upload ts-dropzone-icon"/>
              <p class="ts-dropzone-title">Drop a tileset or spritesheet here</p>
              <button class="btn primary" @click.stop="openFileDialog">Choose image</button>
              <p class="text-xs text-muted">PNG, JPG, or WebP</p>
            </div>
          </div>
        </Widget>
        <div class="ts-stage-foot">
          <p class="ts-hint text-xs text-muted">
            <template v-if="mode === 'grid'">{{ tileCount }} cells · {{ cols }}×{{ rows }} · {{ tileW }}×{{ tileH }}px</template>
            <template v-else-if="mode === 'auto'">{{ detecting ? 'Detecting…' : `${boxes.length} sprites — click one` }}</template>
            <template v-else>{{ regions.length }} region{{ regions.length === 1 ? '' : 's' }} — {{ selectShape === 'fixed' ? 'click to drop a box' : (selectShape === 'square' ? 'drag a square' : 'drag to add a box') }}</template>
          </p>
          <span v-if="processing" class="text-xs text-muted">Processing…</span>
        </div>
      </div>

      <!-- Control rail: selected · tiles · cleanup -->
      <div class="ts-side">
        <!-- The sprite under the cursor -->
        <Widget title="Selected">
          <ui-tooltip v-if="activeBox" :text="previewInfo" position="bottom" class="ts-preview-tip">
            <div class="ts-preview-box">
              <canvas ref="tilePreview" class="pixelated"/>
            </div>
          </ui-tooltip>
          <div v-else class="ts-preview-box">
            <div class="ts-preview-empty">
              <span class="icon icon-image"/>
              <span>{{ mode === 'select' ? 'Draw a box' : 'Click a tile' }}</span>
            </div>
          </div>
        </Widget>

        <!-- 3 · Every cut tile — review, sync and export -->
        <Widget title="Tiles" class="ts-tiles-widget">
          <template #ctl>
            <button v-if="mode === 'select' && regions.length" class="ts-clear-btn" @click="clearRegions">Clear all</button>
          </template>
          <div v-if="tiles.length" class="ts-region-list">
            <ul class="ts-region-scroll no-scrollbar">
            <li
                v-for="(t, i) in tiles"
                :key="tileKey(t)"
                class="ts-region"
                :class="{active: isActiveTile(i)}"
                @click="selectTile(i)"
            >
              <span class="ts-region-num">{{ i + 1 }}</span>
              <!-- Grid cells are all the same size — the row/col position is the
                   useful identifier; free boxes keep their (varied) dimensions. -->
              <span class="ts-region-dim">{{ mode === 'grid' ? `R${Math.floor(i / Math.max(1, cols)) + 1} · C${(i % Math.max(1, cols)) + 1}` : `${t.w}×${t.h}` }}</span>
              <button
                  class="ts-sync"
                  :class="{synced: !!syncedTiles[tileKey(t)]}"
                  :disabled="syncingKey === tileKey(t)"
                  :title="syncedTiles[tileKey(t)] ? 'Added' : 'Sync to workspace / tileset'"
                  @click.stop="syncTile(t, i)"
              >
                <span class="icon" :class="syncedTiles[tileKey(t)] ? 'icon-check' : (syncingKey === tileKey(t) ? 'icon-undo spin' : 'icon-upload')"/>
              </button>
              <button v-if="mode === 'select'" class="ts-region-del" title="Remove" @click.stop="deleteRegion(i)"><span class="icon icon-x"/></button>
            </li>
            </ul>
          </div>
          <p v-else class="ts-empty text-xs text-muted">
            <template v-if="mode === 'select'">Box a sprite to add it here.</template>
            <template v-else-if="mode === 'auto'">Adjust detection to find sprites.</template>
            <template v-else>Set a tile size to slice the grid.</template>
          </p>

          <!-- Tile actions: pick a tileset to sync to + open all in the editor. -->
          <div class="ts-tiles-foot">
            <!-- One action, two shapes: boards per tile, or (toggled) one
                 animated art where every tile becomes a frame. The toggle sits
                 first — as an animation the tiles bypass tilesets entirely, so
                 the picker below hides. -->
            <ui-switch
                v-model="openAsAnim"
                size="sm"
                class="ts-anim-toggle"
                title="Group all cut tiles into one animated art — each tile becomes a frame"
            >
              <span class="text-xs">As animation</span>
            </ui-switch>
            <ui-dropdown-menu v-if="!openAsAnim" ref="pickerRef" position="bottom" class="ts-pick" label="Choose tileset to sync to">
              <button type="button" class="btn ts-pick-trigger">
                <span class="ts-pick-name" :class="{placeholder: selectedTilesetId == null}">{{ currentTsName }}</span>
                <span class="icon icon-chevron-down"/>
              </button>
              <template #menu>
                <div class="file-menu">
                  <div class="file-menu-item file-menu-heading">Sync tiles to</div>
                  <button class="file-menu-item" @click="chooseTs(null)">
                    <span class="file-menu-label"><span>No tileset</span></span>
                    <span v-if="selectedTilesetId == null" class="icon icon-check"/>
                  </button>
                  <button v-for="c in tilesets" :key="c.id" class="file-menu-item" @click="chooseTs(c.id)">
                    <span class="file-menu-label"><span class="ts-pick-name">{{ c.title }}</span></span>
                    <span v-if="selectedTilesetId === c.id" class="icon icon-check"/>
                  </button>
                  <div class="file-menu-sep"/>
                  <div v-if="showNewTs" class="ts-pick-new">
                    <input
                        v-model="newTsName"
                        class="ts-pick-input"
                        placeholder="Tileset name"
                        maxlength="120"
                        @keydown.enter="createTileset"
                        @keydown.esc="showNewTs = false"
                    >
                    <button class="btn primary" :disabled="!newTsName.trim() || creatingTs" @click="createTileset">
                      {{ creatingTs ? '…' : 'Add' }}
                    </button>
                  </div>
                  <button v-else class="file-menu-item" @click.stop="showNewTs = true">
                    <span class="icon icon-plus"/><span>Create tileset</span>
                  </button>
                </div>
              </template>
            </ui-dropdown-menu>

            <button
                class="btn ts-open-btn"
                :disabled="openAsAnim ? tiles.length < 2 : !tiles.length"
                @click="openAsAnim ? openAsAnimation() : openAllInEditor()"
            >
              <span class="icon icon-pen"/><span>Open editor</span>
            </button>
          </div>
        </Widget>

        <!-- Export bar: pinned to the rail bottom, aligned with the canvas foot -->
        <div class="ts-zip-bar">
          <button class="btn primary wide ts-zip-btn" :disabled="!tiles.length || exporting" @click="downloadAllZip">
            <span class="icon icon-download"/>
            <span>{{ exporting ? 'Exporting…' : `ZIP (${tiles.length})` }}</span>
          </button>
        </div>
      </div>
      </div>
    </div>
    <Widget title="More tools" class="tool-more">
      <ToolPaths exclude="slicer"/>
    </Widget>
    <ToolReadme>
      <h1>Tileset Slicer</h1>
      <p>Cut sprites out of a tileset or spritesheet. Draw a box around each one, auto-detect them, or
        use a fixed grid — then open in the editor or export all as a ZIP. Free, runs in your browser.</p>
      <h2>Slice any tileset or spritesheet, free in your browser</h2>
      <p>
        The <strong>Tileset Slicer</strong> cuts a tile sheet or sprite sheet into individual sprites — with no install,
        no signup, and nothing uploaded to a server. Load a PNG, JPG or WebP, choose how to split it, then download every
        sprite as a ZIP of PNGs or send one straight to the
        <nuxt-link to="/editor">pixel art editor</nuxt-link>. Pixels are extracted exactly at 1:1 and transparency is kept,
        so your sprites come out clean and game-ready.
      </p>

      <h2>Three ways to cut sprites</h2>
      <ol>
        <li><strong>Grid</strong> — for evenly spaced tiles. Set tile size, spacing and offset — or just drag the grid to line it up — and every cell becomes a sprite.</li>
        <li><strong>Auto-detect</strong> — for packed sheets. Pick the background colour and the slicer finds each sprite's bounding box automatically, merging small gaps.</li>
        <li><strong>Select</strong> — for uneven sheets. Draw a box around each sprite by hand — free-form, square (1:1) or a fixed size — and drag boxes to fine-tune.</li>
      </ol>

      <h2>What you can do with it</h2>
      <ul>
        <li>Extract game sprites, tiles, icons and UI elements from a single sheet.</li>
        <li>Clean up photo-converted pixel art with round-pixel, colour-merge and despeckle.</li>
        <li>Knock out a background colour to get fully transparent sprites.</li>
        <li>Export every sprite at once as a ZIP, or <nuxt-link to="/editor">open one in the editor</nuxt-link> to keep drawing.</li>
        <li>Drop the sprites you cut into the <nuxt-link to="/tilemaps/editor">tilemap editor</nuxt-link> to build a grid or isometric game map.</li>
        <li>Turn a photo into pixels first with the <nuxt-link to="/convert">image-to-pixel-art converter</nuxt-link>, then slice it.</li>
      </ul>

      <QnA :items="faq"/>
    </ToolReadme>

    <input ref="fileInput" type="file" accept="image/*" class="hidden" @change="onFileSelect">

    <!-- Slice settings modal: how to cut (left) · cleanup (right) -->
    <UiModal v-if="showSettings" class="ts-set-modal" title="Slice settings" width="34rem" @close="showSettings = false">
      <div class="ts-set">
        <div class="ts-set-col">
          <label class="ts-set-label">Cut method</label>
          <div class="tm-seg">
            <button :class="{active: mode === 'select'}" @click="mode = 'select'">Select</button>
            <button :class="{active: mode === 'auto'}" @click="mode = 'auto'">Auto</button>
            <button :class="{active: mode === 'grid'}" @click="mode = 'grid'">Grid</button>
          </div>

          <div class="ts-params">
            <!-- Grid -->
            <template v-if="mode === 'grid'">
              <label class="ts-sub">Tile size</label>
              <div class="settings-row">
                <label v-for="s in sizePresets" :key="s" class="ts-pill" :class="{active: tileW === s && tileH === s}">
                  <input type="radio" :value="s" :checked="tileW === s && tileH === s" @change="() => { tileW = s; tileH = s }">
                  <span>{{ s }}</span>
                </label>
              </div>
              <div class="ts-dims">
                <label class="ts-field"><span>W</span><input type="number" min="1" v-model.number="tileW"></label>
                <button class="ts-link" :class="{active: linkSize}" @click="linkSize = !linkSize" title="Link width & height"><span class="icon icon-link"/></button>
                <label class="ts-field"><span>H</span><input type="number" min="1" v-model.number="tileH" :disabled="linkSize"></label>
              </div>
              <label class="ts-sub">Spacing &amp; offset</label>
              <div class="slider-row">
                <label>Spacing <span>{{ spacing }}px</span></label>
                <input type="range" v-model.number="spacing" min="0" max="16" step="1">
              </div>
              <div class="ts-dims">
                <label class="ts-field"><span>X</span><input type="number" min="0" v-model.number="offsetX"></label>
                <label class="ts-field"><span>Y</span><input type="number" min="0" v-model.number="offsetY"></label>
              </div>
            </template>

            <!-- Auto-detect -->
            <template v-else-if="mode === 'auto'">
              <div class="ts-bg-row">
                <span class="ts-bg-swatch" :style="{background: `rgb(${bg[0]},${bg[1]},${bg[2]})`}"/>
                <span class="text-xs text-muted">Background</span>
                <button class="ts-inline-btn" @click="detect" :disabled="detecting">{{ detecting ? '…' : 'Re-detect' }}</button>
              </div>
              <div class="slider-row">
                <label>Tolerance <span>{{ tolerance }}</span></label>
                <input type="range" v-model.number="tolerance" min="0" max="100" step="2">
              </div>
              <div class="slider-row">
                <label>Min sprite size <span>{{ minSize }}px</span></label>
                <input type="range" v-model.number="minSize" min="4" max="64" step="1">
              </div>
              <div class="slider-row">
                <label>Merge gap <span>{{ mergeGap }}px</span></label>
                <input type="range" v-model.number="mergeGap" min="0" max="6" step="1">
              </div>
            </template>

            <!-- Select by hand -->
            <template v-else>
              <label class="ts-sub">Selection shape</label>
              <div class="tm-seg">
                <button :class="{active: selectShape === 'free'}" @click="selectShape = 'free'">Rectangle</button>
                <button :class="{active: selectShape === 'square'}" @click="selectShape = 'square'">Square</button>
                <button :class="{active: selectShape === 'fixed'}" @click="selectShape = 'fixed'">Fixed</button>
              </div>
              <div v-if="selectShape === 'fixed'" class="ts-dims">
                <label class="ts-field"><span>W</span><input type="number" min="1" v-model.number="fixedW"></label>
                <button class="ts-link" :class="{active: fixedLink}" @click="fixedLink = !fixedLink" title="Link width & height"><span class="icon icon-link"/></button>
                <label class="ts-field"><span>H</span><input type="number" min="1" v-model.number="fixedH" :disabled="fixedLink"></label>
              </div>
            </template>
          </div>
        </div>

        <div class="ts-set-col">
          <label class="ts-set-label">Cleanup</label>
          <ui-switch
              v-model="editorProcess"
              :disabled="processing"
              size="sm"
              title="Runs the editor's import pipeline (de-upscale, crop, quantize) on the whole sheet — the preview and every export slice from the result."
          >
            <span class="text-xs">{{ processing ? 'Processing…' : 'Clean sheet on load' }}</span>
          </ui-switch>
          <ui-switch v-model="removeBg" size="sm" class="ts-set-toggle"><span class="text-xs">Remove background</span></ui-switch>
          <div v-if="removeBg" class="ts-bg-block">
            <div class="ts-bg-row">
              <span class="ts-bg-swatch" :style="{background: `rgb(${bg[0]},${bg[1]},${bg[2]})`}"/>
              <button class="ts-pickbtn" :class="{active: picking}" @click="picking = !picking">
                {{ picking ? 'Click a pixel…' : 'Pick color' }}
              </button>
            </div>
            <div class="slider-row" style="margin-top: 0.5rem">
              <label>Bg tolerance <span>{{ removeBgTol }}</span></label>
              <input type="range" v-model.number="removeBgTol" min="0" max="100" step="2">
            </div>
          </div>

          <label class="ts-sub">Round pixels</label>
          <div class="settings-row">
            <button
                v-for="opt in crispOptions"
                :key="opt.l"
                class="ts-pill"
                :class="{active: crispFactor === opt.v}"
                @click="crispFactor = opt.v"
            >{{ opt.l }}</button>
          </div>
          <ui-switch v-model="median" size="sm" class="ts-set-toggle"><span class="text-xs">Smooth</span></ui-switch>
          <div class="slider-row" style="margin-top: 0.75rem">
            <label>Merge similar colors <span>{{ mergeTol }}</span></label>
            <input type="range" v-model.number="mergeTol" min="0" max="60" step="2">
          </div>
          <label class="ts-sub">Reduce to colors</label>
          <div class="settings-row">
            <button
                v-for="opt in quantOptions"
                :key="opt.l"
                class="ts-pill"
                :class="{active: quantize === opt.v}"
                @click="quantize = opt.v"
            >{{ opt.l }}</button>
          </div>
          <ui-switch v-model="despeckle" size="sm" class="ts-set-toggle"><span class="text-xs">Despeckle</span></ui-switch>
        </div>
      </div>

      <button class="btn primary wide ts-set-done" @click="showSettings = false">Done</button>
    </UiModal>
  </div>
</template>

<style scoped>

/* Empty state — the stage itself is the drop target until a sheet loads. */
.ts-dropzone {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  aspect-ratio: 1;
  width: 100%;
  padding: 2rem 1.5rem;
  text-align: center;
  color: var(--muted);
  cursor: pointer;
  transition: background var(--transition);
}

@media (hover: hover) and (pointer: fine) {
  .ts-dropzone:hover {
    background: color-mix(in oklab, var(--surface) 55%, transparent);
  }
}

.ts-dropzone-icon {
  font-size: 32px;
  color: var(--primary);
}

.ts-dropzone-title {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--foreground);
}

/* Flat editor: toolbar + body sit flush inside one frame (see .flat-editor in
   main.css), mirroring the pixel editor's column layout. Every Widget divides
   from its neighbour with a 1px rule. */
.ts-slicer {
  display: flex;
  flex-direction: column;
  gap: 0;
}

/* Body row: canvas stage + control rail — matches .editor-body. */
.ts-body {
  display: flex;
  flex-direction: column;
  gap: 0;
}

@media (min-width: 768px) {
  .ts-body {
    flex-direction: row;
  }
}

.ts-stage :deep(.widget + .widget),
.ts-side :deep(.widget + .widget) {
  border-top: 1px solid var(--border);
}

/* Canvas fills the stage flush (editor-style): drop the widget-body padding so
   the 1:1 viewport meets the section edges, no inner card. */
.ts-stage :deep(.widget-body) {
  padding: 0;
}

.ts-canvas-wrap {
  aspect-ratio: 1;
  width: 100%;
  overflow: auto;
  /* Center the sheet on both axes. flex + margin:auto (not place-items) so a
     zoomed-in canvas larger than the viewport stays fully scrollable — auto
     margins collapse to 0 on overflow instead of clipping the top/left. */
  display: flex;
  background:
      repeating-conic-gradient(color-mix(in oklab, var(--foreground) 8%, transparent) 0% 25%, transparent 0% 50%)
      50% / 16px 16px;
}

.ts-canvas {
  display: block;
  margin: auto;
  max-width: none;
  cursor: crosshair;
}

.ts-canvas.drawing {
  cursor: crosshair;
  user-select: none;
}

.ts-canvas.moving {
  cursor: move;
}

.ts-canvas.grabbable {
  cursor: grab;
  user-select: none;
}

.ts-canvas.grabbing {
  cursor: grabbing;
}

/* Status foot: its own section below the canvas, divided by a 1px rule above
   (like a widget divider) — contextual hint left, sheet-clean toggle right. */
.ts-stage-foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2) var(--space-3);
  padding: var(--space-2);
  border-top: 1px solid var(--border);
}

.ts-hint {
  flex: 1 1 auto;
  min-width: 0;
  font-variant-numeric: tabular-nums;
}

/* Tiles list widget grows to fill the rail between the fixed sections; its list
   fills and scrolls (desktop) so the export bar stays pinned at the bottom. */
.ts-tiles-widget {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.ts-tiles-widget :deep(.widget-body) {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

/* Small "Clear all" text button in the widget header (like the Layers ctl). */
.ts-clear-btn {
  font-size: var(--text-2xs);
  font-weight: 600;
  color: var(--muted);
  transition: color var(--transition);
}

@media (hover: hover) and (pointer: fine) {
  .ts-clear-btn:hover {
    color: var(--primary);
  }
}

/* Tile actions inside the Tiles widget (picker + open editor), pinned below the
   scrolling list. Reuses .btn + .file-menu; stacked to fit the narrow rail. */
.ts-tiles-foot {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin-top: var(--space-2);
  padding-top: var(--space-2);
  border-top: 1px solid var(--border);
}

.ts-open-btn {
  width: 100%;
  gap: var(--space-2);
}

/* Export bar (download): full-bleed button pinned to the rail bottom, the same
   height as the canvas foot so the two bottom bars line up across the columns. */
.ts-zip-bar {
  margin-top: auto;
  display: flex;
  align-items: stretch;
  box-sizing: border-box;
  height: 39.5px;
  padding: 2px;
  border-top: 1px solid var(--border);
}

.ts-zip-btn {
  flex: 1;
  min-height: 0;
  height: auto;
  padding-top: 0;
  padding-bottom: 0;
  border-radius: 0;
}

/* Picker trigger reuses .btn; laid out like a select (name + caret). */
.ts-pick,
.ts-pick :deep(.dropdown-trigger-wrap) {
  display: block;
  width: 100%;
}

.ts-pick-trigger {
  width: 100%;
  justify-content: space-between;
  gap: var(--space-2);
}

.ts-pick-trigger .icon {
  flex-shrink: 0;
  color: var(--muted);
}

.ts-pick-name {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.ts-pick-name.placeholder {
  color: var(--muted);
  font-weight: 400;
}

/* The picker lives inside the Tiles widget (overflow:hidden), so the menu must
   not exceed the widget width — override the global 13rem min so it can't spill
   past the rail and get clipped. */
.ts-pick :deep(.dropdown-menu) {
  min-width: 0;
  width: 100%;
  max-height: 260px;
  overflow-y: auto;
}

/* "Create tileset" form: input over a full-width button so nothing overflows
   the narrow menu. */
.ts-pick-new {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-2) 0.75rem;
}

.ts-pick-new .btn {
  width: 100%;
  justify-content: center;
}

/* Match .btn's box model so the input and the Add button are the same height. */
.ts-pick-input {
  width: 100%;
  box-sizing: border-box;
  padding: 0.5rem 0.75rem;
  font-size: var(--text-xs);
  line-height: var(--text-xs-lh);
  color: var(--foreground);
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}

.ts-pick-input:focus {
  border-color: var(--primary);
  outline: none;
}

/* Preview tooltip wrapper stays full-width so the 1:1 box keeps its size. */
.ts-preview-tip {
  display: block;
}

/* Slice-settings modal: how to cut (left) · cleanup (right). Single column on
   narrow screens, two divided columns once there's room. */
.ts-set {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--space-4);
}

@media (min-width: 560px) {
  .ts-set {
    grid-template-columns: 1fr 1fr;
    gap: 0;
  }

  .ts-set-col + .ts-set-col {
    padding-left: var(--space-5);
    border-left: 1px solid var(--border);
  }

  .ts-set-col:first-child {
    padding-right: var(--space-5);
  }
}

/* Section eyebrow, matching the flush Widget label. */
.ts-set-label {
  display: block;
  margin-bottom: var(--space-3);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
}

/* Inside the modal the params hug their section heading. */
.ts-set-col .ts-params {
  margin-top: var(--space-3);
}

.ts-set-done {
  margin-top: var(--space-5);
}

.ts-stage-inner {
  position: relative;
}

/* Canvas column — mirrors .canvas-col: grows to fill, divider to the rail. */
.ts-stage {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0;
  min-width: 0;
  border-bottom: 1px solid var(--border);
}

@media (min-width: 768px) {
  .ts-stage {
    border-bottom: 0;
    border-right: 1px solid var(--border);
  }
}

/* Control rail — mirrors .editor-sidebar: full width stacked, 24%/190px beside. */
.ts-side {
  display: flex;
  flex-direction: column;
  gap: 0;
  width: 100%;
  min-height: 0;
}

@media (min-width: 768px) {
  .ts-side {
    width: 24%;
    max-width: 190px;
  }
}

.ts-preview-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  text-align: center;
  color: var(--muted);
  font-size: var(--text-xs);
}

.ts-preview-empty .icon {
  font-size: 26px;
  opacity: 0.7;
}

.ts-sub {
  display: block;
  margin: var(--space-3) 0 var(--space-2);
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--muted);
}

.ts-params > .ts-sub:first-child {
  margin-top: 0;
}

/* Small text button that rides at the end of a control row (e.g. Re-detect). */
.ts-inline-btn {
  margin-left: auto;
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--primary);
  transition: opacity var(--transition);
}

.ts-inline-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.ts-set-toggle {
  margin-top: 0.75rem;
}

.ts-bg-block {
  margin-top: 0.625rem;
}

.ts-pickbtn {
  padding: 4px 10px;
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--foreground);
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  transition: color var(--transition), background var(--transition), border-color var(--transition);
}

.ts-pickbtn.active {
  color: var(--primary-foreground);
  background: var(--primary);
  border-color: var(--primary);
}

.ts-canvas.picking {
  cursor: crosshair;
}

.ts-pill {
  position: relative;
  padding: 5px 12px;
  font-size: var(--text-xs);
  font-weight: 600;
  border: 1px solid var(--border);
  border-radius: var(--radius-pill);
  cursor: pointer;
  color: var(--foreground);
  transition: background var(--transition), border-color var(--transition), color var(--transition);
}

.ts-pill input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.ts-pill.active {
  background: var(--primary);
  border-color: var(--primary);
  color: var(--primary-foreground);
}

.ts-dims {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin-top: 0.625rem;
}

.ts-field {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex: 1;
  font-size: var(--text-xs);
  font-weight: 700;
  color: var(--muted);
}

.ts-field input {
  width: 100%;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.ts-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--muted);
  transition: color var(--transition), border-color var(--transition), background var(--transition);
}

.ts-link.active {
  color: var(--primary-foreground);
  background: var(--primary);
  border-color: var(--primary);
}

.ts-bg-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin-bottom: 0.625rem;
}

.ts-bg-swatch {
  width: 22px;
  height: 22px;
  flex-shrink: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}

/* Region list — fills the rail; an absolutely-positioned inner box does the
   scrolling (desktop) so the flex height is honoured without a max-height cap.
   On mobile it flows normally and the page scrolls. */
.ts-region-list {
  display: flex;
  flex-direction: column;
}

.ts-region-scroll {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

/* Mobile: hundreds of grid cells must not swallow the page — cap the list and
   scroll inside it, and keep the selected-tile preview from claiming the whole
   first screen. */
@media (max-width: 767px) {
  .ts-region-scroll {
    max-height: 40vh;
    overflow-y: auto;
  }

  .ts-preview-box {
    max-width: 240px;
    margin-inline: auto;
  }
}

@media (min-width: 768px) {
  .ts-region-list {
    position: relative;
    flex: 1;
    min-height: 0;
  }

  .ts-region-scroll {
    position: absolute;
    inset: 0;
    overflow-y: auto;
  }
}

.ts-region {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: 5px 6px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: border-color var(--transition), background var(--transition);
}

.ts-region.active {
  border-color: var(--primary);
  background: color-mix(in oklab, var(--primary) 12%, transparent);
}

.ts-region-num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  font-size: 10px;
  font-weight: 700;
  color: var(--primary-foreground);
  background: var(--primary);
  border-radius: 3px;
}

.ts-region-dim {
  flex: 1;
  font-size: var(--text-xs);
  font-variant-numeric: tabular-nums;
  color: var(--foreground);
}

.ts-region-del {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  color: var(--muted);
  border-radius: var(--radius-sm);
  transition: color var(--transition), background var(--transition);
}

.ts-region-del .icon {
  width: 0.85em;
  height: 0.85em;
}

@media (hover: hover) and (pointer: fine) {
  .ts-region-del:hover {
    color: #fff;
    background: #ef4444;
  }
}

.ts-sync {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  color: var(--muted);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  transition: color var(--transition), background var(--transition), border-color var(--transition);
}

.ts-sync .icon {
  width: 0.8em;
  height: 0.8em;
}

.ts-sync:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.ts-sync.synced {
  color: var(--primary-foreground);
  background: var(--primary);
  border-color: var(--primary);
}

@media (hover: hover) and (pointer: fine) {
  .ts-sync:not(:disabled):not(.synced):hover {
    color: var(--primary);
  }
}

.ts-sync .spin {
  animation: ts-spin 0.8s linear infinite;
}

@keyframes ts-spin {
  to { transform: rotate(360deg); }
}

.ts-preview-box {
  display: flex;
  align-items: center;
  justify-content: center;
  aspect-ratio: 1;
  padding: var(--space-4);
  background:
      repeating-conic-gradient(color-mix(in oklab, var(--foreground) 8%, transparent) 0% 25%, transparent 0% 50%)
      50% / 14px 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}

.ts-preview-box canvas {
  max-width: 100%;
  max-height: 100%;
  width: auto;
  height: auto;
}

.ts-empty {
  padding: 0.5rem 0;
}
</style>
