<script setup lang="ts">
const {t} = useI18n()
import {ref, shallowRef, computed, reactive, watch, onMounted, onBeforeUnmount, nextTick} from 'vue'
import {toast} from 'vue-sonner'
import type {SharedPage} from '~/types'
import {debounce, downloadBlob, pruneStorageKeys} from '~/helper/utils'
import {
  type TilemapConfig, type TilemapLayer, type TilemapMode, type LayerKind, normalizeTilemap,
  CELL_PRESETS, MIN_CELL, MAX_CELL, ISO_RATIOS, MIN_DIM, MAX_DIM, MAX_LAYERS, makeLayer, placedIds,
  computeGeometry, cellAt, cellCenter, tileImageUrl, drawPlacedTiles, drawGround, cellRoll,
  FLIP_D, FLIP_H, FLIP_V, flagsOf, rotateFlags, tileOf,
} from '~/helper/tilemap'
import {type Terrain, eraseCornerTerrain, reflowTerrain} from '~/helper/autotile'
import {type TileAnim, animFrame, cellPhase} from '~/helper/tile-anim'
import {buildTiledMap} from '~/helper/tilemap-export'
import {buildGodotMap, buildTiledMapShared, packSprites} from '~/helper/map-export'
import {buildGodotTileSet, buildTiledTileset} from '~/helper/engine-export'
import {canvasBytes, packTileset} from '~/helper/tileset-pack'
import type {SheetGroup} from '~/helper/sheet-layout'
import {createZip} from '~/helper/zip'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const apiBase = useRuntimeConfig().public.api as string
const localTs = useLocalTilesets()
const {confirm} = useConfirm()
const confirmDiscard = (isMap = false) => confirm({
  title: t('p_tilemaps_editor.discardTitle'),
  message: isMap ? t('p_tilemaps_editor.discardMapMsg') : t('p_tilemaps_editor.discardWorldMsg'),
  confirmText: t('p_tilemaps_editor.discard'),
  danger: true,
})

useCustomSeoMeta({
  title: () => t('p_tilemaps_editor.seoTitle'),
  description: () => t('p_tilemaps_editor.seoDescription'),
  keywords: 'tilemap editor, tilemap maker, pixel art map maker, isometric tilemap creator, free online tilemap tool, grid map maker, 2d game map editor, tile map builder, sprite map maker, isometric pixel art',
  canonical: 'https://simplepixelart.com/tilemaps/editor',
  robots: () => route.query.world ? 'noindex, follow' : 'index, follow',
  script: [
    {
      type: 'application/ld+json',
      innerHTML: JSON.stringify({
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'SoftwareApplication',
            name: 'Tilemap Editor',
            description: 'Free browser tool to paint pixel-art tilemaps on a grid or isometric grid, with named layers of ground tiles and sprites built from your own art or any artwork in the gallery.',
            url: 'https://simplepixelart.com/tilemaps/editor',
            applicationCategory: 'GraphicsApplication',
            operatingSystem: 'Any (browser-based)',
            offers: {'@type': 'Offer', price: '0', priceCurrency: 'USD'},
            featureList: [
              'Grid and isometric (2:1) map modes',
              'Multiple named layers with reorder, hide and delete',
              'Ground tiles that tessellate and sprites that stand on top',
              'Paint with your own tilesets or search any public pixel art',
              'Adjustable cell size and map dimensions',
              'Pixel-perfect zoom with crisp grid lines',
              'Save worlds to your account or in your browser',
            ],
            publisher: {'@type': 'Organization', name: 'SimplePixelArt.com', url: 'https://simplepixelart.com/'},
          },
          {
            '@type': 'HowTo',
            name: 'How to make a pixel-art tilemap',
            description: 'Build a 2D or isometric pixel-art map online in three steps — no install or signup.',
            totalTime: 'PT3M',
            tool: [{'@type': 'HowToTool', name: 'Tilemap Editor (web browser)'}],
            step: [
              {'@type': 'HowToStep', name: 'Pick your tiles', text: 'Choose one of your tilesets as the tile palette, or stay in Free style and search any public pixel art to paint with.'},
              {'@type': 'HowToStep', name: 'Set up the map', text: 'Switch between Grid and Isometric, set the cell size and the number of columns and rows, and choose a background.'},
              {'@type': 'HowToStep', name: 'Paint your layers', text: 'Add layers, mark each as a ground or sprite layer, then click and drag to lay tiles. Save the world to your account or your browser.'},
            ],
          },
          {
            '@type': 'FAQPage',
            mainEntity: [
              {'@type': 'Question', name: 'Is the Tilemap Editor free?', acceptedAnswer: {'@type': 'Answer', text: 'Yes. It is completely free and runs entirely in your browser — no signup needed to start, and no watermark.'}},
              {'@type': 'Question', name: 'Do I need an account to use it?', acceptedAnswer: {'@type': 'Answer', text: 'No. Free style mode works without logging in and saves your map in this browser. Sign in only if you want to use your own tilesets and save worlds to your account.'}},
              {'@type': 'Question', name: 'What is the difference between grid and isometric mode?', acceptedAnswer: {'@type': 'Answer', text: 'Grid mode lays tiles out in a flat square grid, ideal for top-down maps. Isometric mode uses 2:1 diamond cells so tiles read as a 3/4 view, with taller sprites overlapping the cells behind them.'}},
              {'@type': 'Question', name: 'Where do the tiles come from?', acceptedAnswer: {'@type': 'Answer', text: 'From your own tilesets, or — in Free style — from any public pixel art on SimplePixelArt. You can search the gallery and paint with any piece.'}},
              {'@type': 'Question', name: 'What are ground and sprite layers?', acceptedAnswer: {'@type': 'Answer', text: 'A ground layer fills each cell edge-to-edge so floor tiles tessellate. A sprite layer draws art at its real size, anchored to the cell base, so taller objects rise above and overlap nearer cells. Each layer can be reordered, hidden or deleted.'}},
              {'@type': 'Question', name: 'Can I use my own pixel art as tiles?', acceptedAnswer: {'@type': 'Answer', text: 'Yes. Draw tiles in the pixel art editor, add them to a tileset in the Tileset Editor, then pick that tileset here to paint with them.'}},
            ],
          },
        ],
      }),
    },
  ],
})

type Coll = { id: number; id_string: string; title: string; count: number }

const loadingList = ref(true)
const sizeOpen = ref(false)
const BG_PRESETS = ['#FFFFFF', '#000000', '#1B1B2E', '#0F380F', '#2A0D4D', '#FFE4B5', '#B0E0E6', '#F5F5F5']
const freeStyle = computed(() => !world.value)

const loadingDetail = ref(false)
const items = ref<SharedPage[]>([])
const config = reactive<TilemapConfig>(normalizeTilemap(null))
const activeLayerId = ref('')
const activeLayer = computed(() =>
    config.layers.find(l => l.id === activeLayerId.value) || config.layers[config.layers.length - 1] || null)
const brush = ref<number | 'erase' | 'stamp' | `terrain:${string}` | `random:${string}`>('erase')
// A block of tiles lifted off the sheet in one drag — a roof, a tower, a
// fence run — laid down as one. `cells` is keyed "dc_dr" from the block's
// top-left; a tile taller than a cell is keyed by its bottom row, which is
// the cell the board anchors it to. `src` is the block on the sheet, so the
// sheet can show what the brush holds.
interface Stamp {
  w: number
  h: number
  cells: Record<string, number>
  src: { x: number; y: number; w: number; h: number }
  groupId: string
}
const stamp = ref<Stamp | null>(null)

// How the tile brush is turned: X / Y flip, Z turns right, Shift+Z left — the
// keys Tiled uses. A new tile starts upright; the eyedropper sets both at once.
const brushFlags = ref(0)
watch(brush, () => { brushFlags.value = 0 }, {flush: 'sync'})

function orientBrush(op: 'h' | 'v' | 'right' | 'left') {
  if (typeof brush.value !== 'number') {
    toast.info(t('p_tilemaps_editor.pickSingleTileToTurn'))
    return
  }
  if (op === 'right' || op === 'left') {
    // A 2x1 tile turned would no longer fit the cells it covers.
    const img = tileImages.get(brush.value)
    if (img?.naturalWidth && Math.round(img.naturalWidth / config.cellW) !== Math.round(img.naturalHeight / config.cellH)) {
      toast.info(t('p_tilemaps_editor.onlySquareTilesTurn'))
      return
    }
    brushFlags.value = rotateFlags(brushFlags.value, op === 'right' ? 1 : -1)
  } else {
    brushFlags.value ^= op === 'h' ? FLIP_H : FLIP_V
  }
  scheduleDraw()
}
let prevBrush: typeof brush.value | null = null
watch(brush, (_, old) => { if (old !== 'erase') prevBrush = old })
function toggleEraser() {
  if (brush.value !== 'erase') {
    brush.value = 'erase'
  } else if (prevBrush != null && brushStillValid(prevBrush)) {
    brush.value = prevBrush
  } else if (items.value.length) {
    brush.value = items.value[0]!.id as number
  }
  tool.value = 'paint'
}
function brushStillValid(b: typeof brush.value): boolean {
  if (typeof b === 'number') return !!knownTiles[b]
  if (b === 'stamp') return !!stamp.value && Object.values(stamp.value.cells).every(id => !!knownTiles[id])
  if (b.startsWith('terrain:')) return terrains.value.some(t => t.id === b.slice('terrain:'.length))
  if (b.startsWith('random:')) return variantGroups.value.some(v => v.id === b.slice('random:'.length))
  return false
}
const variantGroups = ref<{ id: string; name: string; tiles: number[]; weights: Record<string, number> }[]>([])

// The tileset's own groups, so a pack of two thousand tiles is browsed the
// way its author laid it out instead of ten tiles a page. A group whose every
// tile has a pinned position (`pos` — a sliced sheet, say) is shown as that
// sheet, where a tile is found by where it sits, not by scrolling past it.
interface TileBrowseGroup {
  id: string
  name: string
  tiles: number[]
  pos: Record<string, { x: number; y: number }> | null
}
const tileGroups = ref<TileBrowseGroup[]>([])
const tileGroupId = ref('')

function readTileGroups(raw: any, registry: Record<string, string>): TileBrowseGroup[] {
  if (!Array.isArray(raw)) return []
  return raw
      .filter((g: any) => g?.kind === 'group' && Array.isArray(g.tiles))
      .map((g: any) => {
        const tiles: number[] = g.tiles.map(Number).filter((id: number) => registry[String(id)])
        const pinned = g.pos && typeof g.pos === 'object' && tiles.length > 0
            && tiles.every(id => g.pos[String(id)])
        return {id: String(g.id), name: String(g.name || t('common.tiles')), tiles, pos: pinned ? g.pos : null}
      })
      .filter((g: TileBrowseGroup) => g.tiles.length)
}

// The tileset's own meta (groups, terrains, solid tiles) — what an export
// rebuilds the tileset from, so the map ships with the tileset it was made of.
const tilesetMeta = shallowRef<any>(null)

function setTileGroups(groups: TileBrowseGroup[], meta: any = null) {
  tilesetMeta.value = meta
  tileGroups.value = groups
  tileGroupId.value = groups[0]?.id || ''
  // A stamp lifted from another tileset holds tiles this one does not have.
  stamp.value = null
}

const activeTileGroup = computed(() =>
    paletteMode.value === 'tiles' ? tileGroups.value.find(g => g.id === tileGroupId.value) || null : null)
const sheetGroup = computed(() => activeTileGroup.value?.pos ? activeTileGroup.value : null)
const tool = ref<'paint' | 'select' | 'fill' | 'line' | 'rect' | 'pick'>('paint')
const brushSize = ref(1)
const dirty = ref(false)
const saving = ref(false)

const PALETTE_PER = 48
const searchQuery = ref('')
const searchResults = ref<SharedPage[]>([])
const searchCount = ref(0)
const searching = ref(false)
const palettePage = ref(1)
const knownTiles = reactive<Record<number, string>>({})

const canvas = ref<HTMLCanvasElement | null>(null)
const hover = ref<{ col: number; row: number } | null>(null)
const tileImages = new Map<number, HTMLImageElement>()
const pendingImages = ref(0)
const tilesLoading = computed(() => pendingImages.value > 0)
let painting = false
let eraseStroke = false
const pointers = new Map<number, { x: number; y: number }>()
let gesture: { dist: number; midX: number; midY: number; sl: number; st: number } | null = null
// `origin` is where the stroke began: a stamp repeats from there, a whole
// stamp at a time, so a dragged fence lays its pieces end to end.
let stroke: { undo: Map<string, number | undefined>; origin?: { col: number; row: number } } | null = null

const geom = computed(() => computeGeometry(config))
const layersTopFirst = computed(() => [...config.layers].slice().reverse())
const topLayerId = computed(() => config.layers[config.layers.length - 1]?.id || '')
const bottomLayerId = computed(() => config.layers[0]?.id || '')

const paletteTab = ref<'tiles' | 'search'>('tiles')
const guestTileset = ref<{ id: string; name: string } | null>(null)
const hasTilesSource = computed(() => !!world.value || !!guestTileset.value)
const hasSeg = computed(() => myTilesets.value.length > 0 || !!world.value)
const paletteMode = computed<'tiles' | 'search'>(() =>
    hasSeg.value ? paletteTab.value : 'search',
)

const paletteItems = computed(() => {
  if (paletteMode.value === 'search') return searchResults.value
  // A group is shown whole: it is already a handful, or it is a sheet
  // (drawn on its own canvas, so no buttons here).
  const g = activeTileGroup.value
  if (g) return g.pos ? [] : g.tiles.map(id => ({id, id_string: knownTiles[id], name: knownTiles[id]}) as any)
  return items.value.slice((palettePage.value - 1) * PALETTE_PER, palettePage.value * PALETTE_PER)
})
const totalPages = computed(() => {
  if (activeTileGroup.value) return 1
  const total = paletteMode.value === 'search' ? searchCount.value : items.value.length
  return Math.max(1, Math.ceil(total / PALETTE_PER))
})
const paletteLoading = computed(() => paletteMode.value === 'search' ? searching.value : loadingDetail.value)
const ready = computed(() => !loadingDetail.value)

const ZMIN = 0.25, ZMAX = 4
const zoom = ref(1)
const stageEl = ref<HTMLElement | null>(null)
const dispW = computed(() => Math.max(1, Math.round(geom.value.width * zoom.value)))
const dispH = computed(() => Math.max(1, Math.round(geom.value.height * zoom.value)))
function snapScale(s: number): number {
  return s >= 1 ? Math.max(1, Math.round(s)) : 1 / Math.max(1, Math.round(1 / s))
}
function setZoom(z: number) { zoom.value = Math.max(ZMIN, Math.min(ZMAX, snapScale(z))) }
function zoomIn() {
  const s = zoom.value
  setZoom(s >= 1 ? s + 1 : 1 / Math.max(1, Math.round(1 / s) - 1))
}
function zoomOut() {
  const s = zoom.value
  setZoom(s > 1 ? s - 1 : 1 / (Math.round(1 / s) + 1))
}
function fitZoom() {
  const el = stageEl.value
  const g = geom.value
  if (!el || !g.width || !g.height) { setZoom(1); return }
  const aw = el.clientWidth - 32, ah = el.clientHeight - 32
  if (aw <= 0 || ah <= 0) return
  const fit = Math.min(aw / g.width, ah / g.height)
  zoom.value = Math.max(ZMIN, Math.min(ZMAX, fit >= 1 ? Math.floor(fit) : 1 / Math.ceil(1 / fit)))
}

const layersOpen = ref(true)

const viewKey = () => `tm_view:${world.value?.id_string || 'freestyle'}`
function saveViewState() {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(viewKey(), JSON.stringify({
      t: Date.now(),
      zoom: zoom.value,
      layersOpen: layersOpen.value,
      tool: tool.value,
      brushSize: brushSize.value,
      sl: stageEl.value?.scrollLeft || 0,
      st: stageEl.value?.scrollTop || 0,
    }))
  } catch {  }
}
const debouncedViewSave = debounce(saveViewState, 400)
function restoreViewState(): boolean {
  if (typeof localStorage === 'undefined') return false
  let v: any = null
  try { v = JSON.parse(localStorage.getItem(viewKey()) || 'null') } catch {  }
  if (!v) return false
  if (typeof v.zoom === 'number') zoom.value = Math.max(ZMIN, Math.min(ZMAX, v.zoom))
  if (typeof v.layersOpen === 'boolean') layersOpen.value = v.layersOpen
  if (['paint', 'select', 'fill', 'line', 'rect', 'pick'].includes(v.tool)) {
    tool.value = (v.tool === 'select' && config.mode !== 'grid') ? 'paint' : v.tool
  }
  if ([1, 2, 3, 4].includes(v.brushSize)) brushSize.value = v.brushSize
  nextTick(() => {
    if (!stageEl.value) return
    stageEl.value.scrollLeft = v.sl || 0
    stageEl.value.scrollTop = v.st || 0
  })
  return true
}
watch([zoom, layersOpen, tool, brushSize], () => debouncedViewSave())

const localThumbs = reactive<Record<string, string>>({})
const tileRev = ref(0)
function refreshLocalThumbs() {
  for (const ts of localTs.list.value) {
    for (const t of ts.tiles) if (t?.ed?.id && t.thumb) localThumbs[t.ed.id] = t.thumb
  }
}
function srcFor(slug: string) {
  const local = slug && localThumbs[slug]
  if (local) return local
  const url = tileImageUrl(apiBase, slug)
  return tileRev.value ? `${url}${url.includes('?') ? '&' : '?'}v=${tileRev.value}` : url
}

function tileSrc(it: SharedPage) { return srcFor(it.id_string) }

function registerTiles(arts: { id: number; id_string: string }[]) {
  for (const a of arts) if (a && a.id && a.id_string) knownTiles[a.id] = a.id_string
}

function ensureImage(id: number) {
  if (tileImages.has(id) || !knownTiles[id]) return
  const img = new Image()


  img.crossOrigin = 'anonymous'
  pendingImages.value++
  const done = () => { pendingImages.value = Math.max(0, pendingImages.value - 1); scheduleDraw() }
  img.onload = done
  img.onerror = done
  img.src = srcFor(knownTiles[id])
  tileImages.set(id, img)
}
function loadImages() {
  for (const it of paletteItems.value) ensureImage(it.id as number)
  for (const id of placedIds(config)) ensureImage(id)
  draw()
}

// ── sheet view: a pinned group drawn where its tiles sit ──────────────
// A sheet is big (the Sunnyside one is 1,712 tiles, 2048x1600 on screen), so
// it is drawn once and then only added to: each tile is painted when its own
// image arrives, and nothing is cleared or re-allocated until the group, or
// the sheet's size, changes. Hover, the picked tile and the drag box are
// three positioned boxes moved by style, not repaints — moving the pointer
// used to redraw every tile, re-allocating the whole canvas each time.
const sheetEl = ref<HTMLCanvasElement | null>(null)
const sheetHoverEl = ref<HTMLDivElement | null>(null)
const sheetPickEl = ref<HTMLDivElement | null>(null)
const sheetDragEl = ref<HTMLDivElement | null>(null)
// 16px tiles at 1:1 are too small to aim at; about 32px a cell is, so that
// is where the zoom starts. Whole steps only, so with `image-rendering:
// pixelated` every pixel stays square. A viewer's own choice is kept.
const TILE_ZOOM_MAX = 6
const TILE_ZOOM_KEY = 'spa_tilemap_tile_zoom'
const tileZoomPref = ref<number | null>(null)
const tileZoom = computed(() => tileZoomPref.value
    ?? Math.min(TILE_ZOOM_MAX, Math.max(1, Math.round(32 / Math.max(1, config.cellW)))))
const sheetZoom = tileZoom
function setTileZoom(z: number) {
  tileZoomPref.value = Math.min(TILE_ZOOM_MAX, Math.max(1, z))
  try { localStorage.setItem(TILE_ZOOM_KEY, String(tileZoomPref.value)) } catch { /* private mode */ }
}
onMounted(() => {
  try {
    const z = Number(localStorage.getItem(TILE_ZOOM_KEY))
    if (z >= 1 && z <= TILE_ZOOM_MAX) tileZoomPref.value = z
  } catch { /* private mode */ }
})
watch(tileZoom, () => {
  sheet = null
  nextTick(scheduleSheet)
})
// A tile button shows one cell at the chosen zoom, plus its padding.
const tileBtnPx = computed(() => Math.min(128, Math.max(36, config.cellW * tileZoom.value + 8)))

interface SheetRect { id: number; x: number; y: number; w: number; h: number }
let sheet: {
  group: TileBrowseGroup
  rects: SheetRect[]
  w: number
  h: number
  drawn: Set<number>
} | null = null
let sheetHover: number | null = null
let sheetDrag: { x0: number; y0: number; x1: number; y1: number } | null = null

function readyImg(id: number) {
  const img = tileImages.get(id)
  return img?.complete && img.naturalWidth ? img : null
}

/** Size of a tile on the sheet: its image once loaded, one cell until then. */
function sheetSize(id: number) {
  const img = readyImg(id)
  return img ? {w: img.naturalWidth, h: img.naturalHeight} : {w: config.cellW, h: config.cellH}
}

function buildSheet(g: TileBrowseGroup) {
  const rects = g.tiles.map((id) => {
    const p = g.pos![String(id)]!
    return {id, x: p.x, y: p.y, ...sheetSize(id)}
  })
  let w = config.cellW, h = config.cellH
  for (const r of rects) {
    w = Math.max(w, r.x + r.w)
    h = Math.max(h, r.y + r.h)
  }
  sheet = {group: g, rects, w, h, drawn: new Set()}
  const cv = sheetEl.value
  if (!cv) return
  const z = sheetZoom.value
  // Device pixels are not multiplied in: at a whole-number zoom the browser's
  // pixelated upscale is already exact, and the canvas is a quarter the size.
  cv.width = Math.round(w * z)
  cv.height = Math.round(h * z)
  cv.style.width = `${cv.width}px`
  cv.style.height = `${cv.height}px`
}

/** Paint the tiles whose images have arrived since the last call. */
function paintSheet() {
  const cv = sheetEl.value
  const g = sheetGroup.value
  if (!cv || !g) return
  if (!sheet || sheet.group !== g) buildSheet(g)
  const s = sheet!
  const ctx = cv.getContext('2d')
  if (!ctx) return
  const z = sheetZoom.value
  ctx.imageSmoothingEnabled = false
  let grew = false
  for (const r of s.rects) {
    if (s.drawn.has(r.id)) continue
    const img = readyImg(r.id)
    if (!img) continue
    r.w = img.naturalWidth
    r.h = img.naturalHeight
    if (r.x + r.w > s.w || r.y + r.h > s.h) grew = true
    ctx.drawImage(img, r.x * z, r.y * z, r.w * z, r.h * z)
    s.drawn.add(r.id)
  }
  // A tile bigger than the cell it was laid out with reached past the edge:
  // size the canvas again and repaint, once.
  if (grew) {
    sheet = null
    paintSheet()
    return
  }
  placeSheetMarks()
}

let sheetReq = 0
function scheduleSheet() {
  if (sheetReq || typeof requestAnimationFrame === 'undefined') return
  sheetReq = requestAnimationFrame(() => { sheetReq = 0; paintSheet() })
}

function placeBox(el: HTMLDivElement | null, box: { x: number; y: number; w: number; h: number } | null) {
  if (!el) return
  if (!box) {
    el.style.display = 'none'
    return
  }
  const z = sheetZoom.value
  el.style.display = 'block'
  el.style.transform = `translate(${box.x * z}px, ${box.y * z}px)`
  el.style.width = `${box.w * z}px`
  el.style.height = `${box.h * z}px`
}

function rectOf(id: number | null) {
  return id == null || !sheet ? null : sheet.rects.find(r => r.id === id) || null
}

function placeSheetMarks() {
  placeBox(sheetHoverEl.value, sheetDrag ? null : rectOf(sheetHover))
  const st = stamp.value
  placeBox(sheetPickEl.value, brush.value === 'stamp' && st
      ? (st.groupId === sheet?.group.id ? st.src : null)
      : rectOf(typeof brush.value === 'number' ? brush.value : null))
  if (sheetDrag) {
    const {c0, c1, r0, r1} = dragCells(sheetDrag)
    placeBox(sheetDragEl.value, {
      x: c0 * config.cellW, y: r0 * config.cellH,
      w: (c1 - c0 + 1) * config.cellW, h: (r1 - r0 + 1) * config.cellH,
    })
  } else {
    placeBox(sheetDragEl.value, null)
  }
}

function sheetPoint(e: MouseEvent) {
  const z = sheetZoom.value
  return {x: e.offsetX / z, y: e.offsetY / z}
}

function sheetTileAt(e: MouseEvent): number | null {
  if (!sheet) return null
  const {x, y} = sheetPoint(e)
  for (let i = sheet.rects.length - 1; i >= 0; i--) {
    const r = sheet.rects[i]!
    if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) return r.id
  }
  return null
}

// Drag on the sheet to lift a block of tiles as a stamp; a click picks one.
// Cells are the board's cells, so a block lines up with what it paints.
function dragCells(d: { x0: number; y0: number; x1: number; y1: number }) {
  const cw = config.cellW, ch = config.cellH
  return {
    c0: Math.floor(Math.min(d.x0, d.x1) / cw), c1: Math.floor(Math.max(d.x0, d.x1) / cw),
    r0: Math.floor(Math.min(d.y0, d.y1) / ch), r1: Math.floor(Math.max(d.y0, d.y1) / ch),
  }
}

function onSheetDown(e: PointerEvent) {
  if (e.button !== 0) return
  const p = sheetPoint(e)
  sheetDrag = {x0: p.x, y0: p.y, x1: p.x, y1: p.y}
  // A finger drag scrolls the sheet; only a mouse or pen lifts a block.
  if (e.pointerType !== 'touch') sheetEl.value?.setPointerCapture?.(e.pointerId)
  placeSheetMarks()
}

function onSheetMove(e: PointerEvent) {
  if (sheetDrag && e.pointerType !== 'touch') {
    const p = sheetPoint(e)
    sheetDrag = {...sheetDrag, x1: p.x, y1: p.y}
    placeSheetMarks()
    return
  }
  const id = sheetTileAt(e)
  if (id === sheetHover) return
  sheetHover = id
  placeSheetMarks()
}

function onSheetLeave() {
  sheetHover = null
  placeSheetMarks()
}

function onSheetCancel() {
  sheetDrag = null
  placeSheetMarks()
}

function pickBrush(b: typeof brush.value) {
  brush.value = b
}

/** The terrain's solid middle tile — the one it fills an area with. */
function terrainThumb(t: Terrain): string | null {
  const masks = Object.keys(t.map).map(Number)
  if (!masks.length) return null
  const slug = knownTiles[t.map[String(Math.max(...masks))]!]
  return slug ? srcFor(slug) : null
}

const currentBrush = computed<{ name: string; kind: string; src?: string | null; icon?: string }>(() => {
  const b = brush.value
  if (typeof b === 'number') {
    const slug = knownTiles[b]
    return {name: slug ? slug.replace(/[-_]+/g, ' ') : `#${b}`, kind: t('p_tilemaps_editor.brushTile'), src: slug ? srcFor(slug) : null}
  }
  if (b === 'stamp' && stamp.value) {
    return {name: t('p_tilemaps_editor.stampWH', {w: stamp.value.w, h: stamp.value.h}), kind: t('p_tilemaps_editor.brushStamp'), icon: 'icon-stamp'}
  }
  if (typeof b === 'string' && b.startsWith('terrain:')) {
    const tr = terrains.value.find(x => x.id === b.slice(8))
    return {name: tr?.name || '', kind: t('p_tilemaps_editor.brushTerrain'), src: tr ? terrainThumb(tr) : null, icon: 'icon-auto-fix'}
  }
  if (typeof b === 'string' && b.startsWith('random:')) {
    const vg = variantGroups.value.find(x => x.id === b.slice(7))
    const slug = vg && knownTiles[vg.tiles[0]!]
    return {name: vg?.name || '', kind: t('p_tilemaps_editor.brushRandom'), src: slug ? srcFor(slug) : null, icon: 'icon-swap'}
  }
  return {name: t('p_tilemaps_editor.brushEraser'), kind: t('p_tilemaps_editor.brushEraserHint'), icon: 'icon-eraser'}
})

function onSheetUp(e: PointerEvent) {
  const d = sheetDrag
  sheetDrag = null
  placeSheetMarks()
  const g = sheetGroup.value
  if (!d || !g || !sheet) return
  const {c0, c1, r0, r1} = dragCells(d)
  if (c0 === c1 && r0 === r1) {
    const id = sheetTileAt(e)
    if (id != null) pickBrush(id)
    return
  }
  const cw = config.cellW, ch = config.cellH
  const cells: Record<string, number> = {}
  let h = r1 - r0 + 1
  for (const r of sheet.rects) {
    const tc = Math.floor(r.x / cw), tr = Math.floor(r.y / ch)
    if (tc < c0 || tc > c1 || tr < r0 || tr > r1) continue
    // The board anchors a tall tile by its bottom row.
    const dr = tr - r0 + Math.max(1, Math.round(r.h / ch)) - 1
    cells[`${tc - c0}_${dr}`] = r.id
    h = Math.max(h, dr + 1)
  }
  const ids = Object.values(cells)
  if (!ids.length) return
  if (ids.length === 1) {
    pickBrush(ids[0]!)
    return
  }
  stamp.value = {
    w: c1 - c0 + 1, h, cells, groupId: g.id,
    src: {x: c0 * cw, y: r0 * ch, w: (c1 - c0 + 1) * cw, h: (r1 - r0 + 1) * ch},
  }
  pickBrush('stamp')
}

const LS_KEY = 'spa_tilemap_freestyle_v1'

function restoreFreeStyle(): string | null {
  let saved: any = null
  try { saved = JSON.parse(localStorage.getItem(LS_KEY) || 'null') } catch {  }
  Object.assign(config, normalizeTilemap(saved?.config))
  activeLayerId.value = config.layers[config.layers.length - 1]?.id || ''
  if (saved?.registry && typeof saved.registry === 'object') {
    for (const [id, ids] of Object.entries(saved.registry)) {
      if (typeof ids === 'string') knownTiles[Number(id)] = ids
    }
  }
  pruneCells()
  return typeof saved?.tileset === 'string' ? saved.tileset : null
}

function snapshot(): TilemapConfig {
  return {
    mode: config.mode, cols: config.cols, rows: config.rows,
    cellW: config.cellW, cellH: config.cellH, isoRatio: config.isoRatio, bg: config.bg, seed: config.seed,
    layers: config.layers.map(l => ({...l, cells: {...l.cells}, terrain: {...(l.terrain || {})}})),
  }
}

function saveFreeStyle() {
  if (typeof localStorage === 'undefined') return
  const registry: Record<number, string> = {}
  for (const id of placedIds(config)) if (knownTiles[id]) registry[id] = knownTiles[id]
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({config: snapshot(), registry, tileset: guestTileset.value?.id || null}))
  } catch {  }
  dirty.value = false
}
const debouncedFreeStyleSave = debounce(saveFreeStyle, 600)

function touch() {
  dirty.value = true
  scheduleDraw()
  if (freeStyle.value && !world.value) debouncedFreeStyleSave()
}

interface WorldRow { id: number; id_string: string; name: string; status: string; tileset_id_string: string; tileset_name: string }

const world = ref<WorldRow | null>(null)
const terrains = ref<Terrain[]>([])
const worldSiblings = ref<{ id_string: string; name: string }[]>([])

function buildRegistry(): Record<string, string> {
  const registry: Record<string, string> = {}
  for (const id of placedIds(config)) if (knownTiles[id]) registry[String(id)] = knownTiles[id]!
  return registry
}

const tilesetRegistry = ref<Record<string, string>>({})

function extraTiles(): Record<string, string> {
  const extra: Record<string, string> = {}
  for (const id of placedIds(config)) {
    if (knownTiles[id] && !tilesetRegistry.value[String(id)]) extra[String(id)] = knownTiles[id]!
  }
  return extra
}

async function fetchWorldSiblings() {
  if (!world.value || !auth.isLogged) { worldSiblings.value = []; return }
  try {
    const res = await useNativeFetch<{ results: any[] }>('/coloring/worlds/', {
      params: {mine: 1, tileset: world.value.tileset_id_string, page_size: 50, ordering: 'id'},
    })
    worldSiblings.value = res.results.map(w => ({id_string: w.id_string, name: w.name || t('common.untitled')}))
  } catch { worldSiblings.value = [] }
}

async function loadWorld(slug: string): Promise<boolean> {
  loadingDetail.value = true
  tileImages.clear()
  pendingImages.value = 0
  palettePage.value = 1
  try {
    const w = await useNativeFetch<any>(`/coloring/worlds/${slug}/`)
    world.value = {
      id: w.id, id_string: w.id_string, name: w.name || t('common.untitled'),
      status: w.status, tileset_id_string: w.tileset_id_string,
      tileset_name: w.tileset_name || t('common.tileset'),
    }
    tilesetRegistry.value = {...(w.registry || {})}
    for (const [id, ids] of Object.entries(w.registry || {})) {
      if (typeof ids === 'string') knownTiles[Number(id)] = ids
    }
    for (const [id, ids] of Object.entries(w.meta?.tiles || {})) {
      if (typeof ids === 'string') knownTiles[Number(id)] = ids
    }
    const tsMeta = w.tileset_meta || {}
    terrains.value = Array.isArray(tsMeta.terrains) ? tsMeta.terrains : []
    variantGroups.value = Array.isArray(tsMeta.groups)
        ? tsMeta.groups
            .filter((g: any) => g?.kind === 'group' && g?.random && Array.isArray(g.tiles) && g.tiles.length)
            .map((g: any) => ({
              id: String(g.id),
              name: String(g.name || t('p_tilemaps_editor.variants')),
              tiles: g.tiles.map(Number).filter((id: number) => (w.registry || {})[id]),
              weights: (g.weights && typeof g.weights === 'object') ? g.weights : {},
            }))
            .filter((g: any) => g.tiles.length)
        : []
    setTileGroups(readTileGroups(tsMeta.groups, w.registry || {}), tsMeta)
    for (const t of terrains.value) {
      for (const id of Object.values(t.map || {})) ensureImage(Number(id))
    }
    for (const vg of variantGroups.value) {
      for (const id of vg.tiles) ensureImage(id)
    }
    const rawCfg = w.meta?.config
    Object.assign(config, normalizeTilemap(rawCfg))
    if ((!rawCfg || !rawCfg.cellW) && tsMeta.cell?.w) {
      config.cellW = Math.max(MIN_CELL, Math.min(MAX_CELL, Number(tsMeta.cell.w) || config.cellW))
      config.cellH = Math.max(MIN_CELL, Math.min(MAX_CELL, Number(tsMeta.cell.h) || config.cellW))
    }
    if (!rawCfg && tsMeta.iso) {
      config.mode = 'iso'
      if (tsMeta.cell?.w && tsMeta.cell?.h) config.isoRatio = Math.max(0.25, Math.min(1, Number(tsMeta.cell.h) / Number(tsMeta.cell.w)))
    }
    activeLayerId.value = config.layers[config.layers.length - 1]?.id || ''
    pruneCells()
    dirty.value = false
    resetHistory()
    selRect.value = null
    paletteTab.value = 'tiles'
    items.value = Object.entries(w.registry || {}).map(([id, ids]) => ({
      id: Number(id), id_string: ids as string, name: ids as string,
    })) as any
    registerTiles(items.value as any)
    brush.value = items.value.length ? (items.value[0]!.id as number) : 'erase'
    if (!items.value.length) paletteTab.value = 'search'
    loadImages()
    fetchWorldSiblings()
    return true
  } catch {
    toast.error(t('p_tilemaps_editor.couldNotLoadWorld'))
    return false
  } finally {
    loadingDetail.value = false
    await nextTick()
    if (!restoreViewState()) fitZoom()
    draw()
  }
}

const myTilesets = ref<{ id_string: string; name: string; count: number; worlds: { id_string: string }[]; local?: boolean }[]>([])

// Registered here, not with the sheet code: a watch reads its source at once,
// and sheetGroup depends on paletteMode, which needs myTilesets above.
watch(sheetGroup, (g) => {
  sheetHover = null
  sheet = null
  if (!g) return
  for (const id of g.tiles) ensureImage(id)
  nextTick(scheduleSheet)
})
// Images arriving add their tiles; nothing else repaints the sheet.
watch(pendingImages, scheduleSheet)
watch([brush, stamp], placeSheetMarks)
// The canvas only mounts once the tileset has loaded — draw it when it does.
watch(sheetEl, (el) => {
  sheet = null
  if (el) scheduleSheet()
})


// ── animated tiles ────────────────────────────────────────────────────
// Tiles that animate (a cow, windmill sails) play on the board, so a scene
// reads alive while you build it. Exports stay on the first frame.
const {load: loadTileAnims} = useTileAnims()
const tileAnims = shallowRef(new Map<number, TileAnim>())
const playAnims = ref(true)
const PLAY_KEY = 'spa_tilemap_play_anims'
let animNow = 0

const placedKey = computed(() => [...new Set(placedIds(config))].sort((a, b) => a - b).join(','))
async function refreshAnims() {
  const ids = placedKey.value ? placedKey.value.split(',').map(Number) : []
  tileAnims.value = ids.length ? await loadTileAnims(ids) : new Map()
}
// A new tile on the board might animate; ask once the stroke has settled.
watch(placedKey, debounce(refreshAnims, 400))

function frameOf(id: number, col: number, row: number) {
  if (!playAnims.value) return null
  const a = tileAnims.value.get(id)
  return a ? animFrame(a, animNow, cellPhase(col, row)) : null
}

// About 20 redraws a second: smooth for pixel art, and the board is a full
// redraw, so running it at the screen's 60 would only cost.
const ANIM_STEP = 50
let animReq = 0
let animLast = 0
function animLoop(t: number) {
  animReq = 0
  if (!playAnims.value || !tileAnims.value.size) return
  if (t - animLast >= ANIM_STEP) {
    animLast = t
    scheduleDraw()
  }
  animReq = requestAnimationFrame(animLoop)
}
watch([playAnims, tileAnims], () => {
  if (!animReq && playAnims.value && tileAnims.value.size && typeof requestAnimationFrame !== 'undefined') {
    animReq = requestAnimationFrame(animLoop)
  }
  scheduleDraw()
})
onMounted(() => {
  // Someone who asked their system for less motion starts paused.
  let saved: string | null = null
  try { saved = localStorage.getItem(PLAY_KEY) } catch { /* private mode */ }
  const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
  playAnims.value = saved != null ? saved === '1' : !reduce
})
watch(playAnims, (v) => {
  try { localStorage.setItem(PLAY_KEY, v ? '1' : '0') } catch { /* quota */ }
})
onBeforeUnmount(() => { if (animReq) cancelAnimationFrame(animReq) })

async function fetchMyTilesets() {
  if (!auth.isLogged) {
    refreshLocalThumbs()
    myTilesets.value = localTs.list.value.map(ts => ({
      id_string: ts.id, name: ts.name || t('common.untitled'),
      count: ts.tiles.length, worlds: [], local: true,
    }))
    return
  }
  try {
    const res = await useNativeFetch<{ results: any[] }>('/coloring/tilesets/', {params: {page_size: 100}})
    myTilesets.value = (res.results || []).map(ts => ({
      id_string: ts.id_string, name: ts.name || t('common.untitled'),
      count: Object.keys(ts.meta?.registry || {}).length,
      worlds: Array.isArray(ts.worlds) ? ts.worlds : [],
    }))
  } catch { myTilesets.value = [] }
}

async function onSourceSelect(v: string, el: HTMLSelectElement) {
  if (v === '__manage__') {
    el.value = world.value?.tileset_id_string || ''
    // Unsaved world edits are confirmed by the onBeforeRouteLeave guard below.
    router.push(localePath(world.value ? `/tilesets/editor?id=${world.value.tileset_id_string}` : '/tilesets/editor'))
    return
  }
  if (!v) await selectSource(null)
  else await selectTileset(v)
  el.value = world.value?.tileset_id_string || guestTileset.value?.id || ''
}

async function selectSource(id: null) {
  if (guestTileset.value && !world.value) {
    guestTileset.value = null
    items.value = []
    terrains.value = []
    variantGroups.value = []
    setTileGroups([])
    paletteTab.value = 'search'
    brush.value = 'erase'
    touch()
    runSearch(1)
    return
  }
  if (!world.value) return
  if (dirty.value && !(await confirmDiscard())) return
  enterFreeStyle()
}

async function selectTileset(slug: string) {
  if (slug.startsWith('local:')) { loadLocalTilesetPalette(slug); return }
  if (world.value?.tileset_id_string === slug) return
  if (dirty.value && !(await confirmDiscard())) return
  const mt = myTilesets.value.find(x => x.id_string === slug)
  const newest = mt?.worlds?.[0]
  if (newest) {
    router.replace({query: {world: newest.id_string}})
    await loadWorld(newest.id_string)
    return
  }
  try {
    const w = await useNativeFetch<any>('/coloring/worlds/', {
      method: 'POST',
      body: {tileset: slug, name: t('p_tilemaps_editor.worldN', {n: 1}), meta: {config: null}},
    })
    router.replace({query: {world: w.id_string}})
    await loadWorld(w.id_string)
  } catch {
    toast.error(t('p_tilemaps_editor.couldNotOpenTileset'))
  }
}

function loadLocalTilesetPalette(localId: string) {
  const m = localTs.editorModel(localId)
  if (!m) { toast.error(t('p_tilemaps_editor.tilesetNoLongerAvailable')); return }
  refreshLocalThumbs()
  const reg: Record<string, string> = m.registry || {}
  tilesetRegistry.value = {...reg}
  for (const [id, slug] of Object.entries(reg)) knownTiles[Number(id)] = slug
  terrains.value = Array.isArray(m.groups)
      ? m.groups
          .filter((g: any) => g?.kind === 'terrain' && g?.map && Object.keys(g.map).length)
          .map((g: any) => ({
            id: String(g.id),
            name: String(g.name || t('p_tilemaps_editor.terrain')),
            type: g.type === 'blob47' || g.type === 'corner16' ? g.type : 'wang16',
            map: Object.fromEntries(Object.entries(g.map).map(([k, v]) => [k, Number(v)])),
            ...(g.relations ? {relations: g.relations} : {}),
          }))
      : []
  variantGroups.value = Array.isArray(m.groups)
      ? m.groups
          .filter((g: any) => g?.kind === 'group' && g?.random && Array.isArray(g.tiles) && g.tiles.length)
          .map((g: any) => ({
            id: String(g.id), name: String(g.name || t('p_tilemaps_editor.variants')),
            tiles: g.tiles.map(Number).filter((id: number) => reg[String(id)]),
            weights: (g.weights && typeof g.weights === 'object') ? g.weights : {},
          }))
          .filter((g: any) => g.tiles.length)
      : []
  setTileGroups(readTileGroups(m.groups, reg), m)
  for (const t of terrains.value) for (const id of Object.values(t.map || {})) ensureImage(Number(id))
  for (const vg of variantGroups.value) for (const id of vg.tiles) ensureImage(id)
  items.value = Object.entries(reg).map(([id, slug]) => ({
    id: Number(id), id_string: slug, name: slug,
  })) as any
  guestTileset.value = {id: localId, name: m.name || t('common.tileset')}
  if (placedIds(config).length === 0) {
    if (m.cell?.w) {
      config.cellW = Math.max(MIN_CELL, Math.min(MAX_CELL, Number(m.cell.w) || config.cellW))
      config.cellH = Math.max(MIN_CELL, Math.min(MAX_CELL, Number(m.cell.h) || config.cellH))
    }
    if (m.iso) {
      config.mode = 'iso'
      if (m.cell?.w && m.cell?.h) config.isoRatio = Math.max(0.25, Math.min(1, Number(m.cell.h) / Number(m.cell.w)))
    }
  }
  paletteTab.value = items.value.length ? 'tiles' : 'search'
  palettePage.value = 1
  brush.value = items.value.length ? (items.value[0]!.id as number) : 'erase'
  loadImages()
  scheduleDraw()
  if (!auth.isLogged) debouncedFreeStyleSave()
}

const editTilesetUrl = computed(() => {
  const id = world.value?.tileset_id_string || guestTileset.value?.id
  return id ? `/tilesets/editor?id=${id}` : null
})

function refreshTiles() {
  tileRev.value++
  if (!auth.isLogged) { localTs.reload(); refreshLocalThumbs() }
  tileImages.clear()
  pendingImages.value = 0
  loadImages()
  // The sheet keeps what it has painted; fresh art means painting it again.
  sheet = null
  if (sheetGroup.value) for (const id of sheetGroup.value.tiles) ensureImage(id)
  scheduleSheet()
  draw()
  toast.success(t('p_tilemaps_editor.tilesRefreshed'))
}

async function switchWorld(slug: string) {
  if (!slug || slug === world.value?.id_string) return
  if (dirty.value && !(await confirmDiscard())) return
  router.replace({query: {world: slug}})
  loadWorld(slug)
}

async function newWorld() {
  if (!world.value) return
  if (dirty.value && !(await confirmDiscard())) return
  try {
    const w = await useNativeFetch<any>('/coloring/worlds/', {
      method: 'POST',
      body: {
        tileset: world.value.tileset_id_string,
        name: t('p_tilemaps_editor.worldN', {n: worldSiblings.value.length + 1}),
        meta: {config: normalizeTilemap(null)},
      },
    })
    router.replace({query: {world: w.id_string}})
    await loadWorld(w.id_string)
  } catch {
    toast.error(t('p_tilemaps_editor.couldNotCreateWorld'))
  }
}

async function newMap() {
  if (world.value) { newWorld(); return }
  if (dirty.value && !(await confirmDiscard(true))) return
  enterFreeStyle({fresh: true})
}

function onWorldSelect(v: string) {
  if (v === '__new__') newWorld()
  else switchWorld(v)
}

const showLoadTm = ref(false)
const myWorlds = ref<any[]>([])

async function fetchMyWorlds() {
  if (!auth.isLogged) { myWorlds.value = []; return }
  try {
    const res = await useNativeFetch<any>('/coloring/worlds/', {params: {mine: 1, page_size: 100, ordering: '-updated'}})
    myWorlds.value = Array.isArray(res?.results) ? res.results : []
  } catch { myWorlds.value = [] }
}

const browseTilemaps = computed(() => {
  if (auth.isLogged) {
    return myWorlds.value.map((w: any) => ({
      id: w.id_string, name: w.name || t('common.untitled'), status: w.status, updated: w.updated,
      previewImgs: Object.values(w.registry || {}).slice(0, 4).map((s: any) => tileImageUrl(apiBase, s)),
    }))
  }
  const reg: Record<number, string> = {}
  for (const id of placedIds(config)) if (knownTiles[id]) reg[id] = knownTiles[id]
  if (!Object.keys(reg).length) return []
  return [{
    id: 'freestyle', name: t('p_tilemaps_editor.freeStyleMap'), status: 'draft',
    previewImgs: Object.values(reg).slice(0, 4).map(s => tileImageUrl(apiBase, s)),
  }]
})

function openLoadTilemap() {
  if (auth.isLogged) fetchMyWorlds()
  showLoadTm.value = true
}

function pickTilemap(id: string) {
  showLoadTm.value = false
  if (id === '__new__') { newMap(); return }
  if (id === 'freestyle') return
  onWorldSelect(id)
}

function exportName() {
  return (world.value?.name || 'tilemap').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'tilemap'
}

function exportPNG() {
  const g = computeGeometry(config)
  const cv = document.createElement('canvas')
  cv.width = g.width
  cv.height = g.height
  const ctx = cv.getContext('2d')
  if (!ctx) return
  if (config.bg) {
    ctx.fillStyle = config.bg
    ctx.fillRect(0, 0, cv.width, cv.height)
  }
  drawPlacedTiles(ctx, config, g, tileImages, 1)
  cv.toBlob(b => { if (b) downloadBlob(b, `${exportName()}.png`) })
}

function exportJSON() {
  const tiles: Record<string, string> = {}
  for (const id of placedIds(config)) {
    if (knownTiles[id]) tiles[String(id)] = tileImageUrl(apiBase, knownTiles[id]!)
  }
  const data = {
    format: 'simplepixelart.tilemap',
    version: 1,
    name: world.value?.name || 'Untitled',
    mode: config.mode,
    cols: config.cols,
    rows: config.rows,
    cellW: config.cellW,
    cellH: config.cellH,
    isoRatio: config.isoRatio,
    seed: config.seed,
    bg: config.bg,
    layers: config.layers.map(l => ({
      id: l.id, name: l.name, kind: l.kind, visible: l.visible, ySort: l.ySort,
      cells: l.cells, terrain: l.terrain,
    })),
    tiles,
  }
  downloadBlob(new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'}), `${exportName()}.json`)
}

function tiledReadme(base: string): string {
  if (config.mode === 'iso') {
    return [
      `${world.value?.name || 'Tilemap'} — Tiled map export from https://simplepixelart.com`,
      '',
      `Files: ${base}.tmj (Tiled 1.10 JSON map) + one tileset PNG per tile size.`,
      'Tiled: File > Open and pick the .tmj — keep the PNGs next to it.',
      '',
    ].join('\n')
  }
  const ts = world.value?.tileset_id_string ? `${world.value.tileset_id_string}_tileset` : `${base}_tileset`
  return [
    `${world.value?.name || 'Tilemap'} — Tiled map export from https://simplepixelart.com`,
    '',
    `${base}.tmj       the map (Tiled 1.10 JSON). Its tileset is embedded: the same`,
    `                  atlas, terrains (Wang sets) and collision as ${ts}.tsx.`,
    `${ts}.tsx  that tileset on its own, for other Tiled maps.`,
    `${base}_sprites.png  sprite layers' art, at its own size; sprite layers are`,
    '                  object layers of tile objects. Object layers are named points.',
    '',
    'Tiled: File > Open and pick the .tmj — keep the PNGs next to it.',
    '',
    'Phaser 3:',
    '  preload() {',
    `    this.load.tilemapTiledJSON('map', '${base}.tmj')`,
    `    this.load.image('tiles', '${ts}_${config.cellW}x${config.cellH}.png')`,
    '  }',
    '  create() {',
    "    const map = this.make.tilemap({key: 'map'})",
    `    const tiles = map.addTilesetImage(map.tilesets[0].name, 'tiles')`,
    `    map.createLayer('${config.layers.find(l => l.kind === 'ground')?.name || 'Layer 1'}', tiles)`,
    '  }',
    '',
    'Godot 4: use the Godot export instead — it is a ready scene.',
    'Unity: import with SuperTiled2Unity.',
    '',
  ].join('\n')
}

/** Wait until these tiles' images are in (or have failed). */
async function awaitImages(ids: number[]) {
  for (const id of ids) ensureImage(id)
  await Promise.all(ids.map(id => new Promise<void>((resolve) => {
    const img = tileImages.get(id)
    if (!img || img.complete) return resolve()
    img.addEventListener('load', () => resolve(), {once: true})
    img.addEventListener('error', () => resolve(), {once: true})
  })))
}

/** Everything both engine exports share: the tileset rebuilt from its own
 * meta (plus any tile the map uses that the tileset does not list), its
 * animations, and the map's sprites in an atlas of their own. */
async function prepareGameExport() {
  const meta = tilesetMeta.value || {}
  const known = (id: number) => !!knownTiles[id]
  const groups: SheetGroup[] = (Array.isArray(meta.groups) ? meta.groups : [])
      .filter((g: any) => g && (g.kind === 'group' || g.kind === 'terrain'))
      .map((g: any) => ({
        id: String(g.id), name: String(g.name || 'Tiles'), kind: g.kind,
        tiles: (Array.isArray(g.tiles) ? g.tiles : []).map(Number).filter(known),
        ...(g.pos ? {pos: g.pos} : {}),
        ...(g.random ? {random: true, weights: g.weights || {}} : {}),
        ...(g.kind === 'terrain' ? {
          type: g.type,
          map: Object.fromEntries(Object.entries(g.map || {}).map(([k, v]) => [k, Number(v)]).filter(([, v]) => known(v as number))),
        } : {}),
      }))
  const inTileset = new Set<number>()
  for (const g of groups) {
    for (const id of g.tiles) inTileset.add(id)
    for (const id of Object.values(g.map || {})) inTileset.add(id)
  }
  const placed = [...new Set(placedIds(config))].filter(known)
  const loose = placed.filter(id => !inTileset.has(id))
  if (loose.length) groups.push({id: 'map-loose', name: 'Map tiles', kind: 'group', tiles: loose})
  const all = [...new Set([...inTileset, ...loose])]
  await awaitImages(all)

  const bySlug = new Map<string, HTMLImageElement>()
  for (const id of all) {
    const img = tileImages.get(id)
    if (img?.naturalWidth && knownTiles[id]) bySlug.set(knownTiles[id]!, img)
  }
  const anims = await loadTileAnims(all)
  const base = exportName()
  const tilesetBase = world.value?.tileset_id_string ? `${world.value.tileset_id_string}_tileset` : `${base}_tileset`
  const cell = {w: config.cellW, h: config.cellH}
  const tilesetImage = `${tilesetBase}_${cell.w}x${cell.h}.png`
  const solid = new Set<number>((Array.isArray(meta.solid) ? meta.solid : []).map(Number))
  const pack = packTileset({
    name: meta.name || world.value?.tileset_name || base, image: tilesetImage, animImage: `${tilesetBase}_anim.png`,
    groups,
    src: {
      cell,
      slugOf: id => knownTiles[id] || null,
      sizeOf: slug => {
        const img = slug ? bySlug.get(slug) : null
        return img ? {w: img.naturalWidth, h: img.naturalHeight} : null
      },
    },
    imageOf: slug => bySlug.get(slug) || null,
    solid, anims,
  })
  const spriteIds = config.layers.filter(l => l.kind === 'sprite').flatMap(l => Object.values(l.cells).map(tileOf))
  const sprites = packSprites(spriteIds, tileImages, anims)
  return {
    base, tilesetBase, tilesetImage, pack, sprites, solid,
    input: {
      config, name: world.value?.name || base, spritesImage: `${base}_sprites.png`,
      tilesetBase, tilesetImage, pack, sprites, solid, animated: new Set(pack.animOf.keys()),
    },
  }
}

async function exportTiled() {
  const base = exportName()
  if (!placedIds(config).length && !config.layers.some(l => l.objects?.length)) {
    toast.error(t('p_tilemaps_editor.placeSomeTilesFirst'))
    return
  }
  const enc = new TextEncoder()
  if (config.mode === 'iso') {
    // Isometric maps keep the per-size export until the shared one draws them.
    const {tmj, images, missing} = buildTiledMap(config, tileImages, base)
    const files: { name: string; data: Uint8Array }[] = [{name: `${base}.tmj`, data: enc.encode(tmj)}]
    for (const im of images) files.push({name: im.name, data: await canvasBytes(im.canvas)})
    files.push({name: 'README.txt', data: enc.encode(tiledReadme(base))})
    downloadBlob(createZip(files), `${base}_tiled.zip`)
    if (missing) toast.warning(t('p_tilemaps_editor.tileImagesNotLoaded', {count: missing}, missing))
    return
  }
  try {
    const x = await prepareGameExport()
    const {tmj, missing} = buildTiledMapShared(x.input)
    const files = [
      {name: `${base}.tmj`, data: enc.encode(tmj)},
      {name: `${x.tilesetBase}.tsx`, data: enc.encode(buildTiledTileset(x.pack.engine))},
      {name: x.tilesetImage, data: await canvasBytes(x.pack.canvas)},
      {name: `${base}_sprites.png`, data: await canvasBytes(x.sprites.canvas)},
      {name: 'README.txt', data: enc.encode(tiledReadme(base))},
    ]
    downloadBlob(createZip(files), `${base}_tiled.zip`)
    if (missing) toast.warning(t('p_tilemaps_editor.tilesNotExported', {count: missing}, missing))
    else toast.success(t('p_tilemaps_editor.exportedForTiled'))
  } catch {
    toast.error(t('p_tilemaps_editor.couldNotExportTilesFailed'))
  }
}

async function exportGodot() {
  if (config.mode === 'iso') {
    toast.info(t('p_tilemaps_editor.godotGridOnly'))
    return
  }
  if (!placedIds(config).length && !config.layers.some(l => l.objects?.length)) {
    toast.error(t('p_tilemaps_editor.placeSomeTilesFirst'))
    return
  }
  try {
    const x = await prepareGameExport()
    const {tscn, missing} = buildGodotMap({...x.input, slugOf: id => knownTiles[id] || `tile_${id}`})
    const enc = new TextEncoder()
    const files = [
      {name: `${x.base}.tscn`, data: enc.encode(tscn)},
      {name: `${x.tilesetBase}.tres`, data: enc.encode(buildGodotTileSet(x.pack.engine).text)},
      {name: x.tilesetImage, data: await canvasBytes(x.pack.canvas)},
      ...(x.pack.animCanvas ? [{name: `${x.tilesetBase}_anim.png`, data: await canvasBytes(x.pack.animCanvas)}] : []),
      {name: `${x.base}_sprites.png`, data: await canvasBytes(x.sprites.canvas)},
      {name: 'README.txt', data: enc.encode(godotReadme(x.base, x.tilesetBase))},
    ]
    downloadBlob(createZip(files), `${x.base}_godot.zip`)
    if (missing) toast.warning(t('p_tilemaps_editor.tilesNotExported', {count: missing}, missing))
    else toast.success(t('p_tilemaps_editor.exportedGodot'))
  } catch {
    toast.error(t('p_tilemaps_editor.couldNotExportTilesFailed'))
  }
}

function godotReadme(base: string, tilesetBase: string): string {
  return [
    `${world.value?.name || 'Tilemap'} — Godot 4 scene from https://simplepixelart.com`,
    '',
    `1. Copy every file into one folder of your Godot 4 project (4.3 or newer).`,
    `2. Open ${base}.tscn. Ground layers are TileMapLayers on ${tilesetBase}.tres —`,
    '   keep painting them, terrains included, from the TileMap panel.',
    '3. Sprite layers are Sprite2D / AnimatedSprite2D nodes, y-sorted where the map was.',
    '   Object layers are Marker2D nodes named as on the map.',
    '',
    'Solid tiles collide on physics layer 1. For crisp pixels set',
    'Project Settings > Rendering > Textures > Default Texture Filter to Nearest.',
    '',
  ].join('\n')
}

async function runSearch(page = 1) {
  palettePage.value = page
  searching.value = true
  try {
    const q = searchQuery.value.trim()
    const res = await useNativeFetch<{ results: SharedPage[]; count: number }>('/coloring/shared-pages/', {
      params: {
        status: 'public', has_pages: 1, page_size: PALETTE_PER, page,
        search: q || undefined, ordering: q ? undefined : '-updated',
      },
    })
    searchResults.value = Array.isArray(res.results) ? res.results.filter(r => r && r.id_string) : []
    searchCount.value = Number(res.count) || searchResults.value.length
    registerTiles(searchResults.value as any)
    loadImages()
  } catch {
    searchResults.value = []
    searchCount.value = 0
  } finally {
    searching.value = false
  }
}
const debouncedSearch = debounce(() => runSearch(1), 350)
function onSearchInput() { debouncedSearch() }

function goPage(p: number) {
  const next = Math.max(1, Math.min(totalPages.value, p))
  if (next === palettePage.value) return
  if (paletteMode.value === 'search') { runSearch(next); return }
  palettePage.value = next
  loadImages()
}

function enterFreeStyle(opts?: {fresh?: boolean}) {
  resetHistory()
  selRect.value = null
  world.value = null
  worldSiblings.value = []
  guestTileset.value = null
  terrains.value = []
  variantGroups.value = []
  setTileGroups([])
  items.value = []
  tileImages.clear()
  pendingImages.value = 0
  let savedTs: string | null = null
  if (opts?.fresh) {
    Object.assign(config, normalizeTilemap(null))
    activeLayerId.value = config.layers[config.layers.length - 1]?.id || ''
  } else {
    savedTs = restoreFreeStyle()
  }
  brush.value = 'erase'
  dirty.value = false
  searchQuery.value = ''
  router.replace({query: {}})
  if (savedTs && !auth.isLogged && localTs.get(savedTs)) {
    loadLocalTilesetPalette(savedTs)
  } else {
    paletteTab.value = hasSeg.value ? 'tiles' : 'search'
    runSearch(1)
  }
  loadImages()
  nextTick(() => { if (!restoreViewState()) fitZoom() })
}

function onHotkey(e: KeyboardEvent) {
  const t = e.target as HTMLElement
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return
  const kk = e.key.toLowerCase()
  if (e.metaKey || e.ctrlKey) {
    if (kk === 'z') {
      e.preventDefault()
      e.shiftKey ? redo() : undo()
      draw()
    } else if (kk === 'c' && selRect.value) {
      e.preventDefault()
      copySelection()
    } else if (kk === 'v' && clipboard) {
      e.preventDefault()
      pasteClipboard()
    }
    return
  }
  if (e.altKey) return
  if (kk === 'x') {
    orientBrush('h')
  } else if (kk === 'y') {
    orientBrush('v')
  } else if (kk === 'z') {
    orientBrush(e.shiftKey ? 'left' : 'right')
  } else if (kk === 'e') {
    brush.value = 'erase'
  } else if (kk === 'p' || kk === 'b') {
    tool.value = 'paint'
  } else if (kk === 'g') {
    tool.value = 'fill'
  } else if (kk === 'l') {
    tool.value = 'line'
  } else if (kk === 'r') {
    tool.value = 'rect'
  } else if (kk === 'i') {
    tool.value = 'pick'
  } else if (kk === 'm' && config.mode === 'grid') {
    tool.value = 'select'
  } else if ((kk === 'delete' || kk === 'backspace') && tool.value === 'select' && selRect.value) {
    e.preventDefault()
    deleteSelection()
  } else if (kk === 'escape') {
    if (sizeOpen.value) {
      sizeOpen.value = false
      return
    }
    selRect.value = null
    draw()
  } else if (kk === 'w' || kk === 's') {
    const idx = config.layers.findIndex(l => l.id === activeLayerId.value)
    if (idx < 0) return
    const next = kk === 'w' ? Math.min(config.layers.length - 1, idx + 1) : Math.max(0, idx - 1)
    activeLayerId.value = config.layers[next]!.id
  }
}

onMounted(async () => {
  document.addEventListener('keydown', onHotkey)
  pruneStorageKeys('tm_view:')
  await fetchMyTilesets()
  loadingList.value = false
  const qWorld = String(route.query.world || '')
  if (route.query.new == null && qWorld) {
    const ok = await loadWorld(qWorld)
    if (ok) return
  }
  enterFreeStyle({fresh: route.query.new != null})
})
watch(() => auth.isLogged, () => { fetchMyTilesets() })
watch(paletteTab, (t) => {
  palettePage.value = 1
  if (t === 'search' && !searchResults.value.length) runSearch(1)
})
onBeforeUnmount(() => {
  if (typeof document !== 'undefined') document.removeEventListener('keydown', onHotkey)
  if (drawReq && typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(drawReq)
  if (sheetReq && typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(sheetReq)
})

// Leaving the editor (in-app link or tab close) while the world has unsaved edits.
function onBeforeUnload(e: BeforeUnloadEvent) {
  if (dirty.value) e.preventDefault()
}
onMounted(() => window.addEventListener('beforeunload', onBeforeUnload))
onBeforeUnmount(() => window.removeEventListener('beforeunload', onBeforeUnload))
onBeforeRouteLeave(async () => {
  if (dirty.value && !(await confirmDiscard())) return false
})

function key(col: number, row: number) { return `${col}_${row}` }

function pruneCells() {
  for (const layer of config.layers) {
    for (const k of Object.keys(layer.cells)) {
      const [c, r] = k.split('_').map(Number)
      if (c! < 0 || r! < 0 || c! >= config.cols || r! >= config.rows) delete layer.cells[k]
    }
    for (const k of Object.keys(layer.terrain || {})) {
      const [c, r] = k.split('_').map(Number)
      if (c! < 0 || r! < 0 || c! >= config.cols || r! >= config.rows) delete layer.terrain[k]
    }
  }
}

function tileSpan(id: number, layer: {kind?: string} | null) {
  if (config.mode !== 'grid' || layer?.kind === 'sprite') return {cols: 1, rows: 1}
  const img = tileImages.get(id)
  if (!img?.naturalWidth) return {cols: 1, rows: 1}
  return {
    cols: Math.max(1, Math.ceil(img.naturalWidth / Math.max(1, config.cellW))),
    rows: Math.max(1, Math.ceil(img.naturalHeight / Math.max(1, config.cellH))),
  }
}

const MAX_SPAN = 8

// `tileId` places that tile whatever the brush is — how a stamp lays its cells.
function paintCell(col: number, row: number, erase: boolean, tileId?: number) {
  const layer = activeLayer.value
  if (!layer) return
  if (layer.kind === 'object') {
    paintObject(layer, col, row, erase || brush.value === 'erase')
    return
  }
  if (!layer.terrain) layer.terrain = {}
  const map = layer.cells
  const k = key(col, row)
  const remember = (ck = k) => { if (stroke && !stroke.undo.has(ck)) stroke.undo.set(ck, map[ck]) }
  const isTerrainBrush = typeof brush.value === 'string' && brush.value.startsWith('terrain:')
  const isRandomBrush = typeof brush.value === 'string' && brush.value.startsWith('random:')

  if (erase || brush.value === 'erase') {
    if (eraseCornerTerrain(layer, terrains.value, col, row, config)) {
      touch()
      return
    }
    if (k in map || k in layer.terrain) {
      remember()
      delete map[k]
      const hadTerrain = k in layer.terrain
      delete layer.terrain[k]
      if (hadTerrain) reflowTerrain(layer, terrains.value, col, row, config)
      touch()
      return
    }
    // A tile wider or taller than a cell hangs up and to the right of the
    // cell it is anchored to (drawGround), so the tile covering this cell is
    // anchored to the left of it and below it.
    for (let dr = 0; dr < MAX_SPAN; dr++) {
      for (let dc = 0; dc < MAX_SPAN; dc++) {
        if (!dc && !dr) continue
        const ak = key(col - dc, row + dr)
        const id = map[ak]
        if (id == null) continue
        const span = tileSpan(tileOf(id), layer)
        if (dc < span.cols && dr < span.rows) {
          remember(ak)
          delete map[ak]
          touch()
          return
        }
      }
    }
    return
  }

  if (tileId == null && isTerrainBrush) {
    const tid = (brush.value as string).slice('terrain:'.length)
    if (layer.terrain[k] === tid) return
    remember()
    layer.terrain[k] = tid
    reflowTerrain(layer, terrains.value, col, row, config)
    touch()
    return
  }

  const chosen = tileId != null
  if (!chosen && brush.value === 'stamp') {
    // Rect and fill lay a stamp as a pattern, aligned to the map's origin.
    const st = stamp.value
    if (!st) return
    const id = st.cells[`${((col % st.w) + st.w) % st.w}_${((row % st.h) + st.h) % st.h}`]
    if (id == null) return
    tileId = id
  }
  if (tileId == null && !isRandomBrush) tileId = brush.value as number
  if (!chosen && isRandomBrush) {
    if (stroke?.undo.has(k)) return
    const vg = variantGroups.value.find(v => v.id === (brush.value as string).slice('random:'.length))
    if (!vg?.tiles.length) return
    const wOf = (id: number) => Math.max(1, Number(vg.weights[String(id)]) || 1)
    const rnd = config.seed ? cellRoll(config.seed, col, row) : Math.random()
    let roll = rnd * vg.tiles.reduce((s, id) => s + wOf(id), 0)
    tileId = vg.tiles[0]!
    for (const id of vg.tiles) {
      roll -= wOf(id)
      if (roll <= 0) {
        tileId = id
        break
      }
    }
  }
  if (tileId == null) return
  // A stamp's cells carry their own orientation; a brushed tile takes the brush's.
  const value = chosen ? tileId : (tileId | brushFlags.value)

  if (map[k] !== value) {
    remember()
    map[k] = value
    if (k in layer.terrain) {
      delete layer.terrain[k]
      reflowTerrain(layer, terrains.value, col, row, config)
      map[k] = value
    }
    const span = tileSpan(tileOf(value), layer)
    for (let dr = 0; dr < span.rows; dr++) {
      for (let dc = 0; dc < span.cols; dc++) {
        if (!dc && !dr) continue
        const c2 = col + dc
        const r2 = row - dr
        if (c2 >= config.cols || r2 < 0) continue
        const ck = key(c2, r2)
        if (ck in map || ck in layer.terrain) {
          remember(ck)
          delete map[ck]
          const hadT = ck in layer.terrain
          delete layer.terrain[ck]
          if (hadT) reflowTerrain(layer, terrains.value, c2, r2, config)
        }
      }
    }
    touch()
  }
}

const cellLabel = computed(() => config.mode === 'iso'
    ? `${config.cellW}×${Math.round(config.cellW * config.isoRatio)}`
    : `${config.cellW}×${config.cellH}`)
function isoRatioActive(v: number) { return Math.abs(config.isoRatio - v) < 0.01 }
function setIsoRatio(v: number) {
  if (isoRatioActive(v)) return
  config.isoRatio = v
  touch()
  redraw()
}

function setMode(m: TilemapMode) {
  if (config.mode === m) return
  config.mode = m
  if (m === 'iso') {
    tool.value = 'paint'
    selRect.value = null
  }
  touch()
  redraw()
}
function setCell(px: number) { config.cellW = px; config.cellH = px; touch(); redraw() }
function setCellDim(field: 'cellW' | 'cellH', value: number) {
  const next = Math.max(MIN_CELL, Math.min(MAX_CELL, Math.round(Number(value) || 0)))
  if (next === config[field]) return
  config[field] = next
  touch()
  redraw()
}
function setBg(v: string) { config.bg = v; touch(); redraw() }

function setSeed(v: number) {
  config.seed = Math.max(0, Math.min(999999, Math.round(Number(v) || 0)))
  touch()
}

function changeDim(field: 'cols' | 'rows', delta: number) {
  const next = Math.max(MIN_DIM, Math.min(MAX_DIM, config[field] + delta))
  if (next === config[field]) return
  config[field] = next
  pruneCells()
  touch()
  redraw()
}

function clearLayer() {
  const layer = activeLayer.value
  if (!layer || !Object.keys(layer.cells).length) return
  layer.cells = {}
  touch()
  redraw()
}

function newLayerId() {
  return `l-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`
}
function addLayer() {
  if (config.layers.length >= MAX_LAYERS) return
  pushHistory()
  const layer = makeLayer(t('p_tilemaps_editor.layerN', {n: config.layers.length + 1}), newLayerId(), 'sprite')
  config.layers.push(layer)
  activeLayerId.value = layer.id
  touch()
  redraw()
}
function setLayerKind(id: string, kind: LayerKind) {
  const l = config.layers.find(x => x.id === id)
  // Object layers hold points, tile layers hold tiles: switching between the
  // two would hide one or the other, so only ground and sprite swap.
  if (l && l.kind !== kind && l.kind !== 'object' && kind !== 'object') { l.kind = kind; touch(); redraw() }
}

// ── object layers: named points for the game — spawns, doors, triggers ──
function addObjectLayer() {
  if (config.layers.length >= MAX_LAYERS) return
  pushHistory()
  const layer = makeLayer(t('p_tilemaps_editor.objects'), newLayerId(), 'object')
  layer.objects = []
  config.layers.push(layer)
  activeLayerId.value = layer.id
  tool.value = 'paint'
  if (brush.value === 'erase') brush.value = items.value.length ? (items.value[0]!.id as number) : 'erase'
  touch()
  redraw()
}

function paintObject(layer: TilemapLayer, col: number, row: number, erase: boolean) {
  // Points are placed and removed one at a time; fill, line and rect would
  // scatter them over every cell they touch.
  if (tool.value !== 'paint') return
  const list = layer.objects || (layer.objects = [])
  const at = list.findIndex(o => o.col === col && o.row === row)
  if (erase) {
    if (at >= 0) { list.splice(at, 1); touch() }
    return
  }
  // One point per click: a drag across the map should not drop a trail.
  const o = stroke?.origin
  if (at >= 0 || (o && (o.col !== col || o.row !== row))) return
  const name = list.some(x => x.name === 'spawn') ? `point ${list.length + 1}` : 'spawn'
  list.push({id: `obj-${Date.now().toString(36)}-${list.length}`, name, col, row})
  touch()
}

function removeObject(layer: TilemapLayer, id: string) {
  pushHistory()
  layer.objects = (layer.objects || []).filter(o => o.id !== id)
  touch()
  redraw()
}

function drawObjects(ctx: CanvasRenderingContext2D) {
  const g = geom.value, z = zoom.value
  for (const layer of config.layers) {
    if (layer.kind !== 'object' || !layer.visible) continue
    const mine = layer.id === activeLayerId.value
    for (const o of layer.objects || []) {
      const {x, y} = cellCenter(config, g, o.col, o.row)
      const px = x * z, py = y * z
      const r = Math.max(3, Math.min(7, g.tileW * z / 4))
      ctx.fillStyle = mine ? 'rgb(99,102,241)' : 'rgba(99,102,241,0.55)'
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.arc(px, py, r, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      ctx.font = '600 11px sans-serif'
      ctx.textAlign = 'center'
      ctx.lineWidth = 3
      ctx.strokeStyle = 'rgba(0,0,0,0.6)'
      ctx.strokeText(o.name, px, py - r - 4)
      ctx.fillStyle = '#fff'
      ctx.fillText(o.name, px, py - r - 4)
      ctx.textAlign = 'left'
    }
  }
}

function toggleYSort(id: string) {
  const l = config.layers.find(x => x.id === id)
  if (l) { l.ySort = !l.ySort; touch(); redraw() }
}

const editingLayerId = ref('')
const renameInput = ref<HTMLInputElement | null>(null)
function startRename(id: string) {
  editingLayerId.value = id
  nextTick(() => renameInput.value?.select())
}
function finishRename() {
  const l = config.layers.find(x => x.id === editingLayerId.value)
  if (l) { l.name = (l.name || '').trim() || t('p_tilemaps_editor.layer'); touch() }
  editingLayerId.value = ''
}
function removeLayer(id: string) {
  if (config.layers.length <= 1) return
  const i = config.layers.findIndex(l => l.id === id)
  if (i < 0) return
  pushHistory()
  config.layers.splice(i, 1)
  if (activeLayerId.value === id) activeLayerId.value = config.layers[config.layers.length - 1]?.id || ''
  touch()
  redraw()
}
function toggleLayer(id: string) {
  const l = config.layers.find(x => x.id === id)
  if (l) { l.visible = !l.visible; touch(); redraw() }
}
function moveLayer(id: string, dir: number) {
  const i = config.layers.findIndex(l => l.id === id)
  const j = i + dir
  if (i < 0 || j < 0 || j >= config.layers.length) return
  pushHistory()
  const [l] = config.layers.splice(i, 1)
  config.layers.splice(j, 0, l)
  touch()
  redraw()
}

function drawGridOverlay(ctx: CanvasRenderingContext2D) {
  const g = geom.value, z = zoom.value
  const W = g.width * z, H = g.height * z
  ctx.lineWidth = 1
  ctx.strokeStyle = 'rgba(120,120,140,0.32)'
  if (config.mode === 'grid') {
    for (let c = 0; c <= config.cols; c++) {
      const x = Math.round(c * g.tileW * z) + 0.5
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke()
    }
    for (let r = 0; r <= config.rows; r++) {
      const y = Math.round(r * g.tileH * z) + 0.5
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke()
    }
  } else {
    const hw = g.tileW / 2 * z, hh = g.tileH / 2 * z
    const ox = g.originX * z, oy = g.originY * z - hh
    ctx.beginPath()
    for (let r = 0; r <= config.rows; r++) {
      ctx.moveTo(ox - r * hw, oy + r * hh)
      ctx.lineTo(ox + (config.cols - r) * hw, oy + (config.cols + r) * hh)
    }
    for (let c = 0; c <= config.cols; c++) {
      ctx.moveTo(ox + c * hw, oy + c * hh)
      ctx.lineTo(ox + (c - config.rows) * hw, oy + (c + config.rows) * hh)
    }
    ctx.stroke()
  }
}

function drawHover(ctx: CanvasRenderingContext2D) {
  if (!hover.value) return
  const g = geom.value, z = zoom.value
  const {col, row} = hover.value
  const st = stamp.value
  if (brush.value === 'stamp' && st && config.mode === 'grid') {
    // The whole block, faded, where it would land — a stamp is placed by its
    // top-left, which a one-cell highlight would not tell you.
    ctx.save()
    ctx.globalAlpha = 0.6
    ctx.imageSmoothingEnabled = false
    for (const [k, v] of Object.entries(st.cells)) {
      const img = tileImages.get(tileOf(v))
      const [dc, dr] = k.split('_').map(Number)
      if (img?.complete && img.naturalWidth) drawGround(ctx, img, config, g, col + dc!, row + dr!, z, img, flagsOf(v))
    }
    ctx.restore()
    ctx.strokeStyle = 'rgba(99,102,241,0.9)'
    ctx.lineWidth = 1
    ctx.strokeRect(col * g.tileW * z + 0.5, row * g.tileH * z + 0.5, st.w * g.tileW * z - 1, st.h * g.tileH * z - 1)
    return
  }
  if (typeof brush.value === 'number' && brushFlags.value && config.mode === 'grid') {
    // Turned or flipped, the tile itself is the only honest preview.
    const img = tileImages.get(brush.value)
    if (img?.complete && img.naturalWidth) {
      ctx.save()
      ctx.globalAlpha = 0.7
      ctx.imageSmoothingEnabled = false
      drawGround(ctx, img, config, g, col, row, z, img, brushFlags.value)
      ctx.restore()
    }
  }
  const {x, y} = cellCenter(config, g, col, row)
  ctx.fillStyle = brush.value === 'erase'
      ? 'rgba(239,68,68,0.28)' : 'rgba(99,102,241,0.28)'
  if (config.mode === 'grid') {
    ctx.fillRect(col * g.tileW * z, row * g.tileH * z, g.tileW * z, g.tileH * z)
  } else {
    const cx = x * z, cy = y * z, hw = g.tileW / 2 * z, hh = g.tileH / 2 * z
    ctx.beginPath()
    ctx.moveTo(cx, cy - hh); ctx.lineTo(cx + hw, cy)
    ctx.lineTo(cx, cy + hh); ctx.lineTo(cx - hw, cy)
    ctx.closePath(); ctx.fill()
  }
}

function drawShapePreview(ctx: CanvasRenderingContext2D) {
  if (!shape) return
  const g = geom.value, z = zoom.value
  ctx.fillStyle = eraseStroke || brush.value === 'erase'
      ? 'rgba(239,68,68,0.28)' : 'rgba(99,102,241,0.28)'
  for (const [c, r] of shapeCells()) {
    if (config.mode === 'grid') {
      ctx.fillRect(c * g.tileW * z, r * g.tileH * z, g.tileW * z, g.tileH * z)
    } else {
      const {x, y} = cellCenter(config, g, c, r)
      const cx = x * z, cy = y * z, hw = g.tileW / 2 * z, hh = g.tileH / 2 * z
      ctx.beginPath()
      ctx.moveTo(cx, cy - hh); ctx.lineTo(cx + hw, cy)
      ctx.lineTo(cx, cy + hh); ctx.lineTo(cx - hw, cy)
      ctx.closePath(); ctx.fill()
    }
  }
}

function drawSelection(ctx: CanvasRenderingContext2D) {
  if (tool.value !== 'select' || !selRect.value || config.mode !== 'grid') return
  const g = geom.value, z = zoom.value
  const s = selRect.value
  if (selAction?.mode === 'move' && selAction.grabbed) {
    ctx.globalAlpha = 0.75
    ctx.imageSmoothingEnabled = false
    for (const [k, v] of Object.entries(selAction.grabbed.cells)) {
      const [c, r] = k.split('_').map(Number)
      const img = tileImages.get(tileOf(v))
      if (!img?.complete || !img.naturalWidth) continue
      drawGround(ctx, img, config, g, c! + selAction.dc, r! + selAction.dr, z, img, flagsOf(v))
    }
    ctx.globalAlpha = 1
  }
  const x = s.c0 * g.tileW * z
  const y = s.r0 * g.tileH * z
  const w = (s.c1 - s.c0 + 1) * g.tileW * z
  const h = (s.r1 - s.r0 + 1) * g.tileH * z
  ctx.fillStyle = 'rgba(99,102,241,0.08)'
  ctx.fillRect(x, y, w, h)
  ctx.strokeStyle = 'rgba(99,102,241,0.9)'
  ctx.setLineDash([4, 3])
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1)
  ctx.setLineDash([])
}

function draw() {
  const cv = canvas.value
  if (!cv) return
  const g = geom.value, z = zoom.value
  const dpr = window.devicePixelRatio || 1
  const pw = Math.max(1, Math.round(g.width * z * dpr))
  const ph = Math.max(1, Math.round(g.height * z * dpr))
  // Assigning a canvas its size re-allocates it, even to the same value — and
  // with tiles animating this runs twenty times a second. Resize only when
  // the size changed; otherwise just clear.
  const resized = cv.width !== pw || cv.height !== ph
  if (resized) {
    cv.width = pw
    cv.height = ph
  }
  const ctx = cv.getContext('2d')
  if (!ctx) return
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  if (!resized) ctx.clearRect(0, 0, g.width * z, g.height * z)
  if (config.bg) { ctx.fillStyle = config.bg; ctx.fillRect(0, 0, g.width * z, g.height * z) }
  drawGridOverlay(ctx)
  animNow = performance.now()
  drawPlacedTiles(ctx, config, g, tileImages, z, frameOf)
  drawObjects(ctx)
  if (tool.value !== 'select' && !shape) drawHover(ctx)
  drawShapePreview(ctx)
  drawSelection(ctx)
}

let drawReq = 0
function scheduleDraw() {
  if (drawReq || typeof requestAnimationFrame === 'undefined') return
  drawReq = requestAnimationFrame(() => { drawReq = 0; draw() })
}
function redraw() { scheduleDraw() }
watch(zoom, () => scheduleDraw())

function eventCell(e: PointerEvent) {
  const cv = canvas.value
  if (!cv) return null
  const rect = cv.getBoundingClientRect()
  if (!rect.width || !rect.height) return null
  const g = geom.value
  const x = (e.clientX - rect.left) * (g.width / rect.width)
  const y = (e.clientY - rect.top) * (g.height / rect.height)
  return cellAt(config, g, x, y)
}

function gPts() { return [...pointers.values()] }
function gMid() { const [a, b] = gPts(); return {x: (a.x + b.x) / 2, y: (a.y + b.y) / 2} }
function gDist() { const [a, b] = gPts(); return Math.hypot(a.x - b.x, a.y - b.y) }
function baseGesture() {
  const el = stageEl.value, m = gMid()
  gesture = {dist: gDist(), midX: m.x, midY: m.y, sl: el?.scrollLeft || 0, st: el?.scrollTop || 0}
}
function zoomAround(sx: number, sy: number, dir: number) {
  const el = stageEl.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  const ox = sx - rect.left, oy = sy - rect.top
  const px = el.scrollLeft + ox, py = el.scrollTop + oy
  const before = zoom.value
  dir > 0 ? zoomIn() : zoomOut()
  const f = zoom.value / before
  gesture = null
  nextTick(() => {
    if (f !== 1) { el.scrollLeft = px * f - ox; el.scrollTop = py * f - oy }
    if (pointers.size >= 2) baseGesture()
  })
}
function runGesture() {
  const el = stageEl.value
  if (!el || !gesture || pointers.size < 2) return
  const m = gMid(), d = gDist()
  el.scrollLeft = gesture.sl - (m.x - gesture.midX)
  el.scrollTop = gesture.st - (m.y - gesture.midY)
  if (gesture.dist > 0) {
    const r = d / gesture.dist
    if (r > 1.35 || r < 0.74) zoomAround(m.x, m.y, r > 1 ? 1 : -1)
  }
}
function cancelStroke() {
  if (stroke) {
    const layer = activeLayer.value
    if (layer) for (const [k, prev] of stroke.undo) {
      if (prev === undefined) delete layer.cells[k]; else layer.cells[k] = prev
    }
    stroke = null
  }
  painting = false
  shape = null
}

let shape: { start: { col: number; row: number }; end: { col: number; row: number } } | null = null

function shapeCells(): [number, number][] {
  if (!shape) return []
  const {start, end} = shape
  const out: [number, number][] = []
  if (tool.value === 'rect') {
    const c0 = Math.min(start.col, end.col), c1 = Math.max(start.col, end.col)
    const r0 = Math.min(start.row, end.row), r1 = Math.max(start.row, end.row)
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) out.push([c, r])
    return out
  }
  let x0 = start.col, y0 = start.row
  const x1 = end.col, y1 = end.row
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0)
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1
  let err = dx + dy
  for (; ;) {
    out.push([x0, y0])
    if (x0 === x1 && y0 === y1) break
    const e2 = 2 * err
    if (e2 >= dy) { err += dy; x0 += sx }
    if (e2 <= dx) { err += dx; y0 += sy }
  }
  return out
}

function commitShape() {
  const cells = shapeCells()
  const origin = shape?.start
  shape = null
  if (!cells.length) return
  pushHistory()
  stroke = {undo: new Map(), origin}
  for (const [c, r] of cells) {
    if (tool.value === 'line') paintBrush(c, r, eraseStroke)
    else paintCell(c, r, eraseStroke)
  }
  stroke = null
}

function floodFill(cell: { col: number; row: number }, erase: boolean) {
  const layer = activeLayer.value
  if (!layer) return
  const valAt = (c: number, r: number) => {
    const k = key(c, r)
    return layer.terrain?.[k] ?? layer.cells[k] ?? null
  }
  const target = valAt(cell.col, cell.row)
  pushHistory()
  stroke = {undo: new Map()}
  const seen = new Set<string>([key(cell.col, cell.row)])
  const queue: [number, number][] = [[cell.col, cell.row]]
  while (queue.length) {
    const [c, r] = queue.pop()!
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nc = c + dc, nr = r + dr
      if (nc < 0 || nr < 0 || nc >= config.cols || nr >= config.rows) continue
      const nk = key(nc, nr)
      if (seen.has(nk) || valAt(nc, nr) !== target) continue
      seen.add(nk)
      queue.push([nc, nr])
    }
    paintCell(c, r, erase)
  }
  stroke = null
}

function pickAt(cell: { col: number; row: number }) {
  const layer = activeLayer.value
  if (!layer) return
  const k = key(cell.col, cell.row)
  const tid = layer.terrain?.[k]
  if (tid && terrains.value.some(t => t.id === tid)) {
    brush.value = `terrain:${tid}`
    tool.value = 'paint'
    return
  }
  let id: number | undefined = layer.cells[k]
  if (id == null) {
    outer: for (let dr = 0; dr < MAX_SPAN; dr++) {
      for (let dc = 0; dc < MAX_SPAN; dc++) {
        if (!dc && !dr) continue
        const aid = layer.cells[key(cell.col - dc, cell.row + dr)]
        if (aid == null) continue
        const span = tileSpan(tileOf(aid), layer)
        if (dc < span.cols && dr < span.rows) { id = aid; break outer }
      }
    }
  }
  if (id == null) return
  brush.value = tileOf(id)
  brushFlags.value = flagsOf(id)
  tool.value = 'paint'
}

function paintBrush(col: number, row: number, erase: boolean) {
  const st = stamp.value
  if (!erase && brush.value === 'stamp' && st) {
    // Lay the stamp where the stroke began, then again each time the pointer
    // is a whole stamp away from there — pieces end to end, never stacked.
    const o = stroke?.origin ?? {col, row}
    if ((col - o.col) % st.w || (row - o.row) % st.h) return
    for (const [k, id] of Object.entries(st.cells)) {
      const [dc, dr] = k.split('_').map(Number)
      const c = col + dc!, r = row + dr!
      if (c < 0 || r < 0 || c >= config.cols || r >= config.rows) continue
      paintCell(c, r, false, id)
    }
    return
  }
  const n = Math.max(1, Math.min(4, brushSize.value))
  const off = Math.floor((n - 1) / 2)
  for (let dr = 0; dr < n; dr++) {
    for (let dc = 0; dc < n; dc++) {
      const c = col + dc - off
      const r = row + dr - off
      if (c < 0 || r < 0 || c >= config.cols || r >= config.rows) continue
      paintCell(c, r, erase)
    }
  }
}

function onDown(e: PointerEvent) {
  const cv = canvas.value
  if (!cv) return
  cv.setPointerCapture?.(e.pointerId)
  pointers.set(e.pointerId, {x: e.clientX, y: e.clientY})
  if (pointers.size >= 2) { cancelStroke(); baseGesture(); draw(); return }
  const cell = eventCell(e)
  if (!cell) return
  e.preventDefault()
  if (tool.value === 'select' && config.mode === 'grid') {
    selDown(cell)
    draw()
    return
  }
  if (tool.value === 'pick' || (e.altKey && tool.value === 'paint')) {
    pickAt(cell)
    draw()
    return
  }
  eraseStroke = e.button === 2 || e.ctrlKey || e.metaKey
  if (tool.value === 'fill') {
    floodFill(cell, eraseStroke)
    draw()
    return
  }
  if (tool.value === 'line' || tool.value === 'rect') {
    shape = {start: cell, end: cell}
    scheduleDraw()
    return
  }
  pushHistory()
  painting = true
  stroke = {undo: new Map(), origin: cell}
  paintBrush(cell.col, cell.row, eraseStroke)
  scheduleDraw()
}

function onMove(e: PointerEvent) {
  if (pointers.has(e.pointerId)) pointers.set(e.pointerId, {x: e.clientX, y: e.clientY})
  if (pointers.size >= 2) { if (gesture) runGesture(); return }
  const cell = eventCell(e)
  const changed = (cell?.col !== hover.value?.col) || (cell?.row !== hover.value?.row)
  hover.value = cell
  if (selAction && cell) {
    selMove(cell)
    scheduleDraw()
    return
  }
  if (shape && cell) {
    shape.end = cell
    scheduleDraw()
    return
  }
  if (painting && cell) paintBrush(cell.col, cell.row, eraseStroke)
  if (painting || changed) scheduleDraw()
}

function onUp(e: PointerEvent) {
  pointers.delete(e.pointerId)
  if (pointers.size < 2) gesture = null
  if (selAction) {
    selUp()
    scheduleDraw()
  }
  if (shape) {
    commitShape()
    scheduleDraw()
  }
  if (pointers.size === 0) { painting = false; stroke = null }
}
function onLeave() { hover.value = null; scheduleDraw() }

const undoStack: string[] = []
const redoStack: string[] = []
const canUndo = ref(false)
const canRedo = ref(false)

function syncHistory() {
  canUndo.value = undoStack.length > 0
  canRedo.value = redoStack.length > 0
}

function pushHistory() {
  undoStack.push(JSON.stringify(config))
  if (undoStack.length > 60) undoStack.shift()
  redoStack.length = 0
  syncHistory()
}

function resetHistory() {
  undoStack.length = 0
  redoStack.length = 0
  syncHistory()
}

function applyHistory(s: string) {
  Object.assign(config, normalizeTilemap(JSON.parse(s)))
  if (!config.layers.find(l => l.id === activeLayerId.value)) {
    activeLayerId.value = config.layers[config.layers.length - 1]?.id || ''
  }
  selRect.value = null
  touch()
  loadImages()
}

function undo() {
  if (!undoStack.length) return
  redoStack.push(JSON.stringify(config))
  applyHistory(undoStack.pop()!)
  syncHistory()
}

function redo() {
  if (!redoStack.length) return
  undoStack.push(JSON.stringify(config))
  applyHistory(redoStack.pop()!)
  syncHistory()
}

const selRect = ref<{ c0: number; r0: number; c1: number; r1: number } | null>(null)
let selAction: {
  mode: 'select' | 'move'
  startC: number
  startR: number
  base: { c0: number; r0: number; c1: number; r1: number } | null
  grabbed: { cells: Record<string, number>; terrain: Record<string, string> } | null
  dc: number
  dr: number
} | null = null
let clipboard: { w: number; h: number; cells: Record<string, number>; terrain: Record<string, string> } | null = null

function inSelRect(col: number, row: number) {
  const s = selRect.value
  return !!s && col >= s.c0 && col <= s.c1 && row >= s.r0 && row <= s.r1
}

function selDown(cell: { col: number; row: number }) {
  const layer = activeLayer.value
  if (!layer) return
  if (!layer.terrain) layer.terrain = {}
  if (inSelRect(cell.col, cell.row)) {
    pushHistory()
    const s = selRect.value!
    const cells: Record<string, number> = {}
    const terr: Record<string, string> = {}
    for (let r = s.r0; r <= s.r1; r++) {
      for (let c = s.c0; c <= s.c1; c++) {
        const k = key(c, r)
        if (layer.cells[k] != null) {
          cells[k] = layer.cells[k]!
          delete layer.cells[k]
        }
        if (layer.terrain[k]) {
          terr[k] = layer.terrain[k]!
          delete layer.terrain[k]
        }
      }
    }
    selAction = {mode: 'move', startC: cell.col, startR: cell.row, base: {...s}, grabbed: {cells, terrain: terr}, dc: 0, dr: 0}
  } else {
    selAction = {mode: 'select', startC: cell.col, startR: cell.row, base: null, grabbed: null, dc: 0, dr: 0}
    selRect.value = {c0: cell.col, r0: cell.row, c1: cell.col, r1: cell.row}
  }
}

function selMove(cell: { col: number; row: number }) {
  if (!selAction) return
  if (selAction.mode === 'select') {
    selRect.value = {
      c0: Math.min(selAction.startC, cell.col), r0: Math.min(selAction.startR, cell.row),
      c1: Math.max(selAction.startC, cell.col), r1: Math.max(selAction.startR, cell.row),
    }
  } else {
    selAction.dc = cell.col - selAction.startC
    selAction.dr = cell.row - selAction.startR
    const b = selAction.base!
    selRect.value = {c0: b.c0 + selAction.dc, r0: b.r0 + selAction.dr, c1: b.c1 + selAction.dc, r1: b.r1 + selAction.dr}
  }
}

function selUp() {
  if (selAction?.mode === 'move' && selAction.grabbed) {
    const layer = activeLayer.value
    if (layer) {
      if (!layer.terrain) layer.terrain = {}
      const reflowAt: [number, number][] = []
      for (const [k, id] of Object.entries(selAction.grabbed.cells)) {
        const [c, r] = k.split('_').map(Number)
        const nc = c! + selAction.dc
        const nr = r! + selAction.dr
        if (nc < 0 || nr < 0 || nc >= config.cols || nr >= config.rows) continue
        layer.cells[key(nc, nr)] = id
      }
      for (const [k, tid] of Object.entries(selAction.grabbed.terrain)) {
        const [c, r] = k.split('_').map(Number)
        const nc = c! + selAction.dc
        const nr = r! + selAction.dr
        if (nc < 0 || nr < 0 || nc >= config.cols || nr >= config.rows) continue
        layer.terrain[key(nc, nr)] = tid
        reflowAt.push([nc, nr])
      }
      for (const [c, r] of reflowAt) reflowTerrain(layer, terrains.value, c, r, config)
      touch()
    }
  }
  selAction = null
}

function copySelection() {
  const s = selRect.value
  const layer = activeLayer.value
  if (!s || !layer) return
  const cells: Record<string, number> = {}
  const terr: Record<string, string> = {}
  for (let r = s.r0; r <= s.r1; r++) {
    for (let c = s.c0; c <= s.c1; c++) {
      const k = key(c, r)
      if (layer.cells[k] != null) cells[`${c - s.c0}_${r - s.r0}`] = layer.cells[k]!
      if (layer.terrain?.[k]) terr[`${c - s.c0}_${r - s.r0}`] = layer.terrain[k]!
    }
  }
  clipboard = {w: s.c1 - s.c0 + 1, h: s.r1 - s.r0 + 1, cells, terrain: terr}
  toast.success(t('p_tilemaps_editor.regionCopied'))
}

function pasteClipboard() {
  const layer = activeLayer.value
  if (!clipboard || !layer) return
  pushHistory()
  if (!layer.terrain) layer.terrain = {}
  const at = hover.value || {col: selRect.value?.c0 ?? 0, row: selRect.value?.r0 ?? 0}
  const reflowAt: [number, number][] = []
  for (const [k, id] of Object.entries(clipboard.cells)) {
    const [dc, dr] = k.split('_').map(Number)
    const nc = at.col + dc!
    const nr = at.row + dr!
    if (nc < 0 || nr < 0 || nc >= config.cols || nr >= config.rows) continue
    layer.cells[key(nc, nr)] = id
  }
  for (const [k, tid] of Object.entries(clipboard.terrain)) {
    const [dc, dr] = k.split('_').map(Number)
    const nc = at.col + dc!
    const nr = at.row + dr!
    if (nc < 0 || nr < 0 || nc >= config.cols || nr >= config.rows) continue
    layer.terrain[key(nc, nr)] = tid
    reflowAt.push([nc, nr])
  }
  for (const [c, r] of reflowAt) reflowTerrain(layer, terrains.value, c, r, config)
  tool.value = 'select'
  selRect.value = {
    c0: at.col, r0: at.row,
    c1: Math.min(at.col + clipboard.w - 1, config.cols - 1),
    r1: Math.min(at.row + clipboard.h - 1, config.rows - 1),
  }
  touch()
  draw()
}

function deleteSelection() {
  const s = selRect.value
  const layer = activeLayer.value
  if (!s || !layer) return
  pushHistory()
  if (!layer.terrain) layer.terrain = {}
  const reflowAt: [number, number][] = []
  for (let r = s.r0; r <= s.r1; r++) {
    for (let c = s.c0; c <= s.c1; c++) {
      const k = key(c, r)
      delete layer.cells[k]
      if (layer.terrain[k]) {
        delete layer.terrain[k]
        reflowAt.push([c, r])
      }
    }
  }
  for (const [c, r] of reflowAt) reflowTerrain(layer, terrains.value, c, r, config)
  touch()
  draw()
}

const firstSaveTileset = ref<any>(null)
async function save() {
  if (saving.value) return
  if (world.value) {
    saving.value = true
    try {
      await useNativeFetch(`/coloring/worlds/${world.value.id_string}/`, {
        method: 'PATCH',
        body: {meta: {config: snapshot(), tiles: extraTiles()}},
      })
      dirty.value = false
      toast.success(t('p_tilemaps_editor.worldSaved'))
    } catch {
      toast.error(t('p_tilemaps_editor.couldNotSaveWorld'))
    } finally {
      saving.value = false
    }
    return
  }
  if (auth.isLogged) {
    saving.value = true
    try {
      const name = t('p_tilemaps_editor.myWorld')
      // A retry after the world POST failed reuses the tileset it already made.
      let tm = firstSaveTileset.value
      if (tm) {
        await useNativeFetch(`/coloring/tilesets/${tm.id_string}/`, {
          method: 'PATCH',
          body: {meta: {registry: buildRegistry()}},
        })
      } else {
        tm = firstSaveTileset.value = await useNativeFetch<any>('/coloring/tilesets/', {
          method: 'POST',
          body: {name, meta: {registry: buildRegistry()}},
        })
      }
      const w = await useNativeFetch<any>('/coloring/worlds/', {
        method: 'POST',
        body: {tileset: tm.id_string, name, meta: {config: snapshot()}},
      })
      firstSaveTileset.value = null
      world.value = {
        id: w.id, id_string: w.id_string, name: w.name || name,
        status: w.status, tileset_id_string: tm.id_string,
        tileset_name: tm.name || name,
      }
      router.replace({query: {world: w.id_string}})
      dirty.value = false
      fetchWorldSiblings()
      toast.success(t('p_tilemaps_editor.worldSaved'))
    } catch {
      toast.error(t('p_tilemaps_editor.couldNotSaveWorld'))
    } finally {
      saving.value = false
    }
    return
  }
  saveFreeStyle()
  toast.success(t('p_tilemaps_editor.savedInBrowser'))
}

const faq = computed(() => [
  {q: t('p_tilemaps_editor.faq0q'), a: t('p_tilemaps_editor.faq0a')},
  {q: t('p_tilemaps_editor.faq1q'), a: t('p_tilemaps_editor.faq1a')},
  {q: t('p_tilemaps_editor.faq2q'), a: t('p_tilemaps_editor.faq2a')},
  {q: t('p_tilemaps_editor.faq3q'), a: t('p_tilemaps_editor.faq3a')},
])
</script>

<template>
  <ToolLayout :title="$t('p_tilemaps_editor.tilemap')" class="tm-page" :panel-label="$t('common.tiles')" panel-icon="icon-grid">

    <div
        v-if="loadingList"
        class="tm-skeleton tm-editor flat-editor"
        aria-busy="true"
        :aria-label="$t('p_tilemaps_editor.loading')"
    >
      <div class="editor-toolbar">
        <div class="skeleton skel-btn"/>
        <div class="skeleton skel-btn"/>
        <div class="skeleton skel-btn"/>
        <div class="skeleton skel-title"/>
      </div>
      <div class="tm-layout tm-layout-rail">
        <div class="skel-rail">
          <div v-for="n in 5" :key="n" class="skeleton skel-rail-btn"/>
        </div>
        <div class="tm-stage"><div class="skeleton skel-board"/></div>
      </div>
    </div>

    <template v-else>
        <div class="tm-editor flat-editor">

        <div class="editor-toolbar">
          <div class="toolbar-start">
            <ui-dropdown-menu>
              <ui-tooltip :text="$t('p_tilemaps_editor.fileWorldsExport')">
                <button class="toolbar-btn"><span class="icon icon-file"/></button>
              </ui-tooltip>
              <template #menu>
                <div class="file-menu">
                  <button class="file-menu-item" @click="openLoadTilemap">
                    <span class="icon icon-grid"/><span>{{ $t('p_tilemaps_editor.loadTilemap') }}</span>
                  </button>
                  <button class="file-menu-item" @click="newMap()">
                    <span class="icon icon-plus"/><span>{{ world ? $t('p_tilemaps_editor.newWorld') : $t('p_tilemaps_editor.newMap') }}</span>
                  </button>
                  <div class="file-menu-sep"/>
                  <button class="file-menu-item" @click="exportPNG">
                    <span class="icon icon-image"/><span>{{ $t('common.downloadPng') }}</span>
                  </button>
                  <button class="file-menu-item" @click="exportGodot" :title="$t('p_tilemaps_editor.exportForGodotHint')">
                    <span class="icon icon-rocket"/><span>{{ $t('p_tilemaps_editor.exportForGodot') }}</span>
                  </button>
                  <button class="file-menu-item" @click="exportTiled" :title="$t('p_tilemaps_editor.tiledTmjTilesetPngsLoadsIn')">
                    <span class="icon icon-rocket"/><span>{{ $t('p_tilemaps_editor.exportForTiled') }}</span>
                  </button>
                  <button class="file-menu-item" @click="exportJSON">
                    <span class="icon icon-download"/><span>{{ $t('common.exportJson') }}</span>
                  </button>
                </div>
              </template>
            </ui-dropdown-menu>
          </div>

          <div class="toolbar-main no-scrollbar">
            <div class="toolbar-group">
              <ui-tooltip :text="$t('p_tilemaps_editor.mapSettingsGridTypeCellMap')">
                <button class="toolbar-btn" @click="sizeOpen = true">
                  <span class="icon icon-cog"/>
                </button>
              </ui-tooltip>
            </div>
            <div class="toolbar-sep"/>
            <div class="toolbar-group">
              <ui-tooltip :text="$t('p_tilemaps_editor.undoZ')">
                <button class="toolbar-btn" :disabled="!canUndo" @click="undo(); draw()">
                  <span class="icon icon-undo"/>
                </button>
              </ui-tooltip>
              <ui-tooltip :text="$t('p_tilemaps_editor.redoZ')">
                <button class="toolbar-btn" :disabled="!canRedo" @click="redo(); draw()">
                  <span class="icon icon-redo"/>
                </button>
              </ui-tooltip>
            </div>
            <div class="toolbar-sep"/>
            <div class="toolbar-group">
              <ui-tooltip :text="$t('p_tilemaps_editor.zoomOut')">
                <button class="toolbar-btn" :disabled="zoom <= ZMIN" :aria-label="$t('common.zoomOut')" @click="zoomOut">
                  <span class="icon icon-zoom-out"/>
                </button>
              </ui-tooltip>
              <ui-tooltip :text="$t('p_tilemaps_editor.zoomIn')">
                <button class="toolbar-btn" :disabled="zoom >= ZMAX" :aria-label="$t('common.zoomIn')" @click="zoomIn">
                  <span class="icon icon-zoom-in"/>
                </button>
              </ui-tooltip>
              <template v-if="typeof brush === 'number'">
                <ui-tooltip :text="$t('p_tilemaps_editor.flipTileH')">
                  <button class="toolbar-btn" :class="{active: brushFlags & FLIP_H}" :aria-label="$t('p_tilemaps_editor.flipTileH')" @click="orientBrush('h')">
                    <span class="icon icon-flip-h"/>
                  </button>
                </ui-tooltip>
                <ui-tooltip :text="$t('p_tilemaps_editor.flipTileV')">
                  <button class="toolbar-btn" :class="{active: brushFlags & FLIP_V}" :aria-label="$t('p_tilemaps_editor.flipTileV')" @click="orientBrush('v')">
                    <span class="icon icon-flip-v"/>
                  </button>
                </ui-tooltip>
                <ui-tooltip :text="$t('p_tilemaps_editor.turnTileRight')">
                  <button class="toolbar-btn" :class="{active: brushFlags & FLIP_D}" :aria-label="$t('p_tilemaps_editor.turnTileRight')" @click="orientBrush('right')">
                    <span class="icon icon-rotate-right"/>
                  </button>
                </ui-tooltip>
              </template>
              <ui-tooltip v-if="tileAnims.size" :text="playAnims ? $t('p_tilemaps_editor.pauseAnimations') : $t('p_tilemaps_editor.playAnimations')">
                <button
                    class="toolbar-btn"
                    :aria-pressed="playAnims"
                    :aria-label="playAnims ? $t('p_tilemaps_editor.pauseAnimations') : $t('p_tilemaps_editor.playAnimations')"
                    @click="playAnims = !playAnims"
                >
                  <span class="icon" :class="playAnims ? 'icon-pause' : 'icon-play'"/>
                </button>
              </ui-tooltip>
            </div>
          </div>

          <div class="toolbar-end">
            <ui-tooltip :text="$t('p_tilemaps_editor.clearXRemoveEveryTile', {x: activeLayer?.name || $t('common.scope_layer')})">
              <button
                  class="toolbar-btn"
                  :disabled="!ready || !activeLayer || !Object.keys(activeLayer.cells).length"
                  @click="clearLayer"
              >
                <span class="icon icon-broom"/>
              </button>
            </ui-tooltip>
            <ui-tooltip :text="saving ? $t('common.saving') : $t('common.save')">
              <button
                  class="publish-toolbar-btn tm-save"
                  :class="{dirty}"
                  :disabled="saving || (!dirty && world !== null)"
                  :aria-label="saving ? $t('common.saving') : $t('common.save')"
                  @click="save"
              >
                <span class="icon icon-save"/>
              </button>
            </ui-tooltip>
          </div>
        </div>

        <div class="tm-layout tm-layout-rail">

          <Widget class="tool-rail">
            <div class="tools tools-rail no-scrollbar">
              <ui-tooltip :text="$t('p_tilemaps_editor.paintPAltClickPicksA')" position="right">
                <Square :class="{active: tool === 'paint'}" @click="tool = 'paint'">
                  <span class="icon icon-pen"/>
                </Square>
              </ui-tooltip>
              <ui-tooltip :text="$t('p_tilemaps_editor.fillGRepaintTheTouchingRegion')" position="right">
                <Square :class="{active: tool === 'fill'}" @click="tool = 'fill'">
                  <span class="icon icon-bucket"/>
                </Square>
              </ui-tooltip>
              <ui-tooltip :text="$t('p_tilemaps_editor.lineL')" position="right">
                <Square :class="{active: tool === 'line'}" @click="tool = 'line'">
                  <span class="icon icon-line"/>
                </Square>
              </ui-tooltip>
              <ui-tooltip :text="$t('p_tilemaps_editor.rectangleR')" position="right">
                <Square :class="{active: tool === 'rect'}" @click="tool = 'rect'">
                  <span class="icon icon-square"/>
                </Square>
              </ui-tooltip>
              <ui-tooltip :text="$t('p_tilemaps_editor.eraserEOrRightClickDrag')" position="right">
                <Square :class="{active: brush === 'erase'}" @click="toggleEraser">
                  <span class="icon icon-eraser"/>
                </Square>
              </ui-tooltip>

              <div
                  v-if="tool === 'paint' || tool === 'line'"
                  class="brush-sizes"
                  role="group"
                  :aria-label="$t('common.brushSize')"
              >
                <ui-tooltip v-for="n in [1, 2, 3, 4]" :key="n" :text="$t('p_tilemaps_editor.brushSizeNCells', {n})" position="right">
                  <button
                      type="button"
                      class="brush-size"
                      :class="{active: brushSize === n}"
                      :aria-label="$t('common.brushSizeN', {n})"
                      :aria-pressed="brushSize === n"
                      @click="brushSize = n"
                  >
                    <span
                        class="brush-size-dot"
                        :style="{width: `${Math.min(14, 2 + n * 2)}px`, height: `${Math.min(14, 2 + n * 2)}px`}"
                    />
                  </button>
                </ui-tooltip>
              </div>

              <div class="tools-sep"/>

              <ui-tooltip :text="$t('p_tilemaps_editor.eyedropperIPickAPlacedTile')" position="right">
                <Square :class="{active: tool === 'pick'}" @click="tool = 'pick'">
                  <span class="icon icon-eyedropper"/>
                </Square>
              </ui-tooltip>
              <ui-tooltip v-if="config.mode === 'grid'" :text="$t('p_tilemaps_editor.selectMMoveCopyOrDelete')" position="right">
                <Square :class="{active: tool === 'select'}" @click="tool = 'select'">
                  <span class="icon icon-select"/>
                </Square>
              </ui-tooltip>
            </div>
          </Widget>

          <div class="tm-stage-wrap">
          <div class="tm-island" :class="{open: layersOpen}">
            <div
                class="tm-island-head"
                role="button"
                tabindex="0"
                :title="layersOpen ? $t('p_tilemaps_editor.collapseLayers') : $t('p_tilemaps_editor.expandLayers')"
                @click="layersOpen = !layersOpen"
                @keydown.enter.prevent="layersOpen = !layersOpen"
            >
              <span class="tm-island-title">{{ $t('common.layers') }} <em>{{ config.layers.length }}</em></span>
              <button v-if="layersOpen" class="tm-layer-add" :disabled="config.layers.length >= 12" :title="$t('p_tilemaps_editor.addLayer')" @click.stop="addLayer">
                <span class="icon icon-plus"/> {{ $t('p_tilemaps_editor.layer') }}
              </button>
              <button v-if="layersOpen" class="tm-layer-add" :disabled="config.layers.length >= 12" :title="$t('p_tilemaps_editor.addObjectLayerHint')" @click.stop="addObjectLayer">
                <span class="icon icon-flag"/> {{ $t('p_tilemaps_editor.objects') }}
              </button>
              <span class="icon tm-island-caret" :class="layersOpen ? 'icon-expand-up' : 'icon-expand-down'" aria-hidden="true"/>
            </div>
            <div v-show="layersOpen" class="tm-layers no-scrollbar">
              <div
                  v-for="l in layersTopFirst"
                  :key="l.id"
                  class="tm-layer"
                  :class="{active: l.id === activeLayerId, hidden: !l.visible}"
                  @click="activeLayerId = l.id"
              >
                <button
                    class="tm-layer-eye"
                    :title="l.visible ? $t('p_tilemaps_editor.hideLayer') : $t('p_tilemaps_editor.showLayer')"
                    @click.stop="toggleLayer(l.id)"
                >
                  <span class="icon" :class="l.visible ? 'icon-eye' : 'icon-eye-cross'"/>
                </button>
                <span v-if="l.kind === 'object'" class="tm-layer-kind" :title="$t('p_tilemaps_editor.objectLayerHint')">
                  <span class="icon icon-flag"/>
                </span>
                <button
                    v-else
                    class="tm-layer-kind"
                    :title="l.kind === 'sprite' ? $t('p_tilemaps_editor.spriteLayerHint') : $t('p_tilemaps_editor.groundLayerHint')"
                    @click.stop="setLayerKind(l.id, l.kind === 'ground' ? 'sprite' : 'ground')"
                >
                  <span class="icon" :class="l.kind === 'sprite' ? 'icon-rhombus' : 'icon-grid'"/>
                </button>
                <button
                    v-if="l.kind !== 'object'"
                    class="tm-layer-kind tm-layer-ysort"
                    :class="{'tm-layer-ysort-on': l.ySort}"
                    :title="l.ySort ? $t('p_tilemaps_editor.ySortOnHint') : $t('p_tilemaps_editor.ySortOffHint')"
                    @click.stop="toggleYSort(l.id)"
                >
                  <span class="icon icon-arrange"/>
                </button>
                <input
                    v-if="editingLayerId === l.id"
                    ref="renameInput"
                    v-model="l.name"
                    class="tm-layer-input"
                    maxlength="40"
                    @click.stop
                    @keydown.enter.prevent="finishRename"
                    @keydown.esc="finishRename"
                    @blur="finishRename"
                />
                <span v-else class="tm-layer-name" :title="$t('p_tilemaps_editor.xDoubleClickToRename', {x: l.name})" @dblclick.stop="startRename(l.id)">{{ l.name }}</span>
                <span class="tm-layer-count">{{ l.kind === 'object' ? (l.objects || []).length : Object.keys(l.cells).length }}</span>
                <div class="tm-layer-actions">
                  <button class="tm-la-btn" :disabled="l.id === topLayerId" :title="$t('p_tilemaps_editor.moveUp')" @click.stop="moveLayer(l.id, 1)"><span class="icon icon-expand-up"/></button>
                  <button class="tm-la-btn" :disabled="l.id === bottomLayerId" :title="$t('p_tilemaps_editor.moveDown')" @click.stop="moveLayer(l.id, -1)"><span class="icon icon-expand-down"/></button>
                  <button class="tm-la-btn danger" :disabled="config.layers.length < 2" :title="$t('common.deleteLayer')" @click.stop="removeLayer(l.id)"><span class="icon icon-trash"/></button>
                </div>
              </div>
            </div>
            <div v-if="layersOpen && activeLayer?.kind === 'object'" class="tm-layers tm-objects no-scrollbar">
              <p v-if="!(activeLayer.objects || []).length" class="tm-hint tm-objects-empty">{{ $t('p_tilemaps_editor.clickTheMapToPlaceAPoint') }}</p>
              <div v-for="o in activeLayer.objects" :key="o.id" class="tm-layer">
                <span class="tm-layer-kind"><span class="icon icon-flag"/></span>
                <input v-model="o.name" class="tm-layer-input" maxlength="40" :aria-label="$t('p_tilemaps_editor.pointName')" @click.stop @input="touch(); scheduleDraw()">
                <span class="tm-layer-count">{{ o.col }},{{ o.row }}</span>
                <button class="tm-la-btn danger" :title="$t('p_tilemaps_editor.removePoint')" @click.stop="removeObject(activeLayer, o.id)"><span class="icon icon-trash"/></button>
              </div>
            </div>
          </div>

          <div ref="stageEl" class="tm-stage no-scrollbar" @scroll.passive="debouncedViewSave()">
          <div v-if="loadingDetail" class="skeleton skel-board"/>

          <template v-else>
            <div class="tm-board" :class="{'tm-board-bg': !config.bg}" :style="{width: dispW + 'px', height: dispH + 'px'}">
              <canvas
                  ref="canvas"
                  class="tm-canvas"
                  :style="{width: dispW + 'px', height: dispH + 'px'}"
                  @pointerdown="onDown"
                  @pointermove="onMove"
                  @pointerup="onUp"
                  @pointercancel="onUp"
                  @pointerleave="onLeave"
                  @contextmenu.prevent
              />
            </div>
            <transition name="tm-fade">
              <div v-if="tilesLoading" class="tm-rendering">
                <span class="tm-spinner" aria-hidden="true"/>
                <span>{{ $t('p_tilemaps_editor.loadingTiles') }}</span>
              </div>
            </transition>
            <div v-if="world" class="tm-stage-fab">
              <ui-tooltip :text="$t('p_tilemaps_editor.openThisWorldSPublicPage')" position="left">
                <NuxtLinkLocale :to="`/worlds/${world.id_string}`" class="tm-stage-fab-btn" :aria-label="$t('common.openPublicPage')">
                  <span class="icon icon-link"/>
                </NuxtLinkLocale>
              </ui-tooltip>
            </div>
          </template>
          </div>
          </div>
        </div>

        </div>
    </template>

    <template #status>
      <p class="editor-foot-hint text-xs text-muted">
        {{ config.mode === 'iso' ? $t('common.isometric') : $t('common.grid') }} {{ config.cols }}×{{ config.rows }} ·
        {{ $t('p_tilemaps_editor.cellWH', {w: config.cellW, h: config.cellH}) }} ·
        {{ $t('p_tilemaps_editor.layerCount', {count: config.layers.length}, config.layers.length) }} ·
        {{ $t('p_tilemaps_editor.tilesPlaced', {count: placedIds(config).length}, placedIds(config).length) }}
      </p>
    </template>

    <template #panel>
      <div class="tm-tilesbar" :style="{'--tm-tile': `${tileBtnPx}px`}">
        <div class="tm-tp-head">
          <div v-if="hasSeg" class="tm-seg tm-palette-seg">
            <button :class="{active: paletteTab === 'tiles'}" @click="paletteTab = 'tiles'">
              <span class="icon icon-grid"/> {{ $t('common.tiles') }}
            </button>
            <button :class="{active: paletteTab === 'search'}" :title="$t('p_tilemaps_editor.paintWithAnyPublicPixelArt')" @click="paletteTab = 'search'">
              <span class="icon icon-search"/> {{ $t('p_tilemaps_editor.search') }}
            </button>
          </div>
          <div v-if="hasSeg && paletteTab === 'tiles'" class="tm-tp-row">
            <select
                class="tm-world-select tm-src-select"
                :value="world?.tileset_id_string || guestTileset?.id || ''"
                :title="$t('p_tilemaps_editor.tileSourcePickATileset')"
                @change="onSourceSelect(($event.target as HTMLSelectElement).value, $event.target as HTMLSelectElement)"
            >
              <option value="">{{ $t('p_tilemaps_editor.freeStyleSearchAnyArt') }}</option>
              <option v-for="t in myTilesets" :key="t.id_string" :value="t.id_string">
                {{ $t('p_tilemaps_editor.tilesetOption', {name: t.name, count: t.count}, t.count) }}
              </option>
              <option value="__manage__">{{ $t('p_tilemaps_editor.manageTilesets') }}</option>
            </select>
            <a
                v-if="editTilesetUrl"
                :href="editTilesetUrl"
                target="_blank"
                rel="noopener"
                class="tm-pager-btn"
                :title="$t('p_tilemaps_editor.editThisTilesetOpensInA')"
                :aria-label="$t('common.editTileset')"
            ><span class="icon icon-pen"/></a>
          </div>
          <div v-if="paletteMode === 'search'" class="tm-search">
            <span class="icon icon-search"/>
            <input
                v-model="searchQuery"
                type="search"
                :placeholder="$t('p_tilemaps_editor.searchPixelArt')"
                @input="onSearchInput"
                @keydown.enter.prevent="runSearch(1)"
            />
          </div>
          <div class="tm-tp-current" :aria-label="$t('p_tilemaps_editor.currentBrush')">
            <span class="tm-tp-current-thumb">
              <img v-if="currentBrush.src" :src="currentBrush.src" alt="">
              <span v-else class="icon" :class="currentBrush.icon"/>
            </span>
            <span class="tm-tp-current-text">
              <span class="tm-tp-current-name">{{ currentBrush.name }}</span>
              <span class="tm-tp-current-kind">{{ currentBrush.kind }}</span>
            </span>
          </div>
        </div>

        <section v-if="paletteMode === 'tiles' && (terrains.length || variantGroups.length || stamp)" class="tm-tp-sec">
          <span class="tm-label">{{ $t('p_tilemaps_editor.brushes') }}</span>
          <div class="tm-brushes">
            <button
                v-for="t in terrains"
                :key="t.id"
                class="tm-brush"
                :class="{active: brush === `terrain:${t.id}`}"
                :title="$t('p_tilemaps_editor.terrainBrushX', {x: t.name})"
                @click="pickBrush(`terrain:${t.id}`)"
            >
              <img v-if="terrainThumb(t)" :src="terrainThumb(t)!" alt="">
              <span v-else class="icon icon-auto-fix"/>
              <span class="tm-brush-name">{{ t.name }}</span>
            </button>
            <button
                v-for="vg in variantGroups"
                :key="vg.id"
                class="tm-brush"
                :class="{active: brush === `random:${vg.id}`}"
                :title="$t('p_tilemaps_editor.randomBrushX', {x: vg.name})"
                @click="pickBrush(`random:${vg.id}`)"
            >
              <img v-if="knownTiles[vg.tiles[0]!]" :src="srcFor(knownTiles[vg.tiles[0]!]!)" alt="">
              <span v-else class="icon icon-swap"/>
              <span class="tm-brush-name">{{ vg.name }}</span>
            </button>
            <button
                v-if="stamp"
                class="tm-brush"
                :class="{active: brush === 'stamp'}"
                :title="$t('p_tilemaps_editor.stampBrushHint')"
                @click="pickBrush('stamp')"
            >
              <span class="icon icon-stamp"/>
              <span class="tm-brush-name">{{ $t('p_tilemaps_editor.stampWH', {w: stamp.w, h: stamp.h}) }}</span>
            </button>
          </div>
        </section>

        <section class="tm-tp-sec">
          <div class="tm-tp-row">
            <span class="tm-label">{{ $t('common.tiles') }}</span>
            <div class="tm-tp-zoom" role="group" :aria-label="$t('p_tilemaps_editor.tileZoom')">
              <button class="tm-pager-btn" :disabled="tileZoom <= 1" :aria-label="$t('common.zoomOut')" @click="setTileZoom(tileZoom - 1)">−</button>
              <span class="tm-tp-zoom-val">{{ tileZoom }}×</span>
              <button class="tm-pager-btn" :disabled="tileZoom >= TILE_ZOOM_MAX" :aria-label="$t('common.zoomIn')" @click="setTileZoom(tileZoom + 1)">+</button>
            </div>
            <button
                v-if="hasTilesSource && paletteMode === 'tiles'"
                class="tm-pager-btn"
                :title="$t('p_tilemaps_editor.refreshTilesReloadTheArtAfter')"
                :aria-label="$t('p_tilemaps_editor.refreshTiles')"
                @click="refreshTiles"
            ><span class="icon icon-sync"/></button>
          </div>
          <select
              v-if="paletteMode === 'tiles' && tileGroups.length > 1"
              v-model="tileGroupId"
              class="tm-world-select tm-src-select tm-tp-group"
              :title="$t('p_tilemaps_editor.tileGroup')"
          >
            <option v-for="g in tileGroups" :key="g.id" :value="g.id">{{ g.name }} ({{ g.tiles.length }})</option>
            <option value="">{{ $t('p_tilemaps_editor.allTilesN', {count: items.length}) }}</option>
          </select>
          <p v-if="sheetGroup && !paletteLoading" class="tm-hint">{{ $t('p_tilemaps_editor.sheetHint') }}</p>

          <div v-if="paletteLoading" class="tm-tiles-grid">
            <div v-for="n in 12" :key="n" class="skeleton tm-tile-skel"/>
          </div>
          <p v-else-if="!paletteItems.length && !sheetGroup" class="tm-hint tm-tiles-empty">
            <template v-if="paletteMode === 'search'">{{ $t('p_tilemaps_editor.noArtFoundTryAnotherSearch') }}</template>
            <template v-else-if="!hasTilesSource">{{ $t('p_tilemaps_editor.pickATilesetFromTheMenu') }}</template>
            <template v-else>{{ $t('p_tilemaps_editor.thisTilesetHasNoTilesYet') }} <NuxtLinkLocale v-if="world || guestTileset" :to="`/tilesets/editor?id=${world?.tileset_id_string || guestTileset?.id}`" class="underline">{{ $t('p_tilemaps_editor.tilesetEditor') }}</NuxtLinkLocale>{{ $t('p_tilemaps_editor.orUseSearchAbove') }}</template>
          </p>
          <div v-else-if="paletteItems.length" class="tm-tiles-grid">
            <button
                v-for="it in paletteItems"
                :key="it.id"
                class="tm-tile"
                :class="{active: brush === it.id}"
                :title="it.name || $t('p_tilemaps_editor.brushTile')"
                @click="pickBrush(it.id as number)"
            >
              <img :src="tileSrc(it)" :alt="it.name || $t('p_tilemaps_editor.brushTile')" loading="lazy"/>
            </button>
          </div>
          <div v-if="sheetGroup && !paletteLoading" class="tm-sheet-wrap">
            <canvas
                ref="sheetEl"
                class="tm-sheet"
                :aria-label="sheetGroup.name"
                @pointerdown="onSheetDown"
                @pointermove="onSheetMove"
                @pointerup="onSheetUp"
                @pointercancel="onSheetCancel"
                @pointerleave="onSheetLeave"
            />
            <div ref="sheetHoverEl" class="tm-sheet-mark is-hover"/>
            <div ref="sheetPickEl" class="tm-sheet-mark is-pick"/>
            <div ref="sheetDragEl" class="tm-sheet-mark is-drag"/>
          </div>
          <div v-if="!paletteLoading && totalPages > 1" class="tm-pager">
            <button class="tm-pager-btn" :disabled="palettePage <= 1" :title="$t('common.previousPageOf', {page: palettePage, pages: totalPages})" :aria-label="$t('common.previousPage')" @click="goPage(palettePage - 1)"><span class="icon icon-angle-left"/></button>
            <span class="tm-tp-zoom-val">{{ palettePage }} / {{ totalPages }}</span>
            <button class="tm-pager-btn" :disabled="palettePage >= totalPages" :title="$t('common.nextPageOf', {page: palettePage, pages: totalPages})" :aria-label="$t('common.nextPage')" @click="goPage(palettePage + 1)"><span class="icon icon-angle-right"/></button>
          </div>
        </section>
      </div>
    </template>

    <template #doc>
      <h1>{{ $t('p_tilemaps_editor.tilemapEditor') }}</h1>
      <p v-html="$t('p_tilemaps_editor.paintPixelArtMapsOnA')"/>

      <h2>{{ $t('p_tilemaps_editor.buildPixelArtTilemapsFree') }}</h2>
      <p>
        {{ $t('common.the') }} <strong>{{ $t('p_tilemaps_editor.tilemapEditor') }}</strong> {{ $t('p_tilemaps_editor.turnsPixelArtIntoMapsLay') }} <strong>{{ $t('p_tilemaps_editor.grid') }}</strong> {{ $t('p_tilemaps_editor.forTopDownScenesOrAn') }} <strong>{{ $t('p_tilemaps_editor.isometric') }}</strong> {{ $t('p_tilemaps_editor.gridForA34View') }} <strong>{{ $t('p_tilemaps_editor.layers') }}</strong> {{ $t('p_tilemaps_editor.asYouNeedAndPaintWith') }} <NuxtLinkLocale to="/work?tab=collections">{{ $t('p_tilemaps_editor.collection') }}</NuxtLinkLocale> {{ $t('p_tilemaps_editor.orAnyPieceFromThe') }} <NuxtLinkLocale to="/arts">{{ $t('p_tilemaps_editor.gallery') }}</NuxtLinkLocale>{{ $t('p_tilemaps_editor.noInstallAndNoSignupTo') }} </p>

      <h2>{{ $t('common.howItWorks') }}</h2>
      <ol>
        <li v-html="$t('p_tilemaps_editor.strongPickYourTilesStrongChoose')"/>
        <li v-html="$t('p_tilemaps_editor.strongSetUpTheMapStrong')"/>
        <li v-html="$t('p_tilemaps_editor.strongPaintYourLayersStrongAdd')"/>
      </ol>
      <QnA :items="faq"/>
    </template>
    <template #extra>

    <UiModal v-if="sizeOpen" class="tm-settings-modal" @close="sizeOpen = false">
          <h3 class="publish-heading">{{ $t('p_tilemaps_editor.mapSettings') }}</h3>
          <div class="tm-settings-body">
            <div class="tm-group">
              <span class="tm-label">{{ $t('common.gridType') }}</span>
              <div class="tm-seg">
                <button :class="{active: config.mode === 'grid'}" @click="setMode('grid')"><span class="icon icon-grid"/> {{ $t('common.grid') }}</button>
                <button :class="{active: config.mode === 'iso'}" @click="setMode('iso')"><span class="icon icon-rhombus"/> {{ $t('p_tilemaps_editor.iso') }}</button>
              </div>
              <div v-if="config.mode === 'iso'" class="tm-num tm-iso-ratio">
                <span class="tm-num-cap">{{ $t('p_tilemaps_editor.viewRatio') }} <em>(W:H)</em></span>
                <div class="tm-chips tm-chips-ratio">
                  <button
                      v-for="r in ISO_RATIOS"
                      :key="r.label"
                      :class="{active: isoRatioActive(r.value)}"
                      @click="setIsoRatio(r.value)"
                  >{{ r.label }}</button>
                </div>
              </div>
            </div>
            <div class="tm-group">
              <span class="tm-label">{{ $t('common.cellSize') }} <em>{{ cellLabel }}px</em></span>
              <div class="tm-chips">
                <button v-for="p in CELL_PRESETS" :key="p" :class="{active: config.cellW === p && (config.mode === 'iso' || config.cellH === p)}" @click="setCell(p)">{{ p }}</button>
              </div>
              <div class="tm-dims" :class="{'tm-dims-one': config.mode === 'iso'}">
                <div class="tm-num">
                  <span class="tm-num-cap">{{ config.mode === 'iso' ? $t('p_tilemaps_editor.tileWidth') : $t('p_tilemaps_editor.width') }}</span>
                  <input
                      type="number" class="tm-cell-input" inputmode="numeric"
                      :min="MIN_CELL" :max="MAX_CELL" :value="config.cellW"
                      :aria-label="$t('p_tilemaps_editor.cellWidthPx')"
                      @change="setCellDim('cellW', ($event.target as HTMLInputElement).valueAsNumber)"
                  >
                </div>
                <div v-if="config.mode === 'grid'" class="tm-num">
                  <span class="tm-num-cap">{{ $t('common.height') }}</span>
                  <input
                      type="number" class="tm-cell-input" inputmode="numeric"
                      :min="MIN_CELL" :max="MAX_CELL" :value="config.cellH"
                      :aria-label="$t('p_tilemaps_editor.cellHeightPx')"
                      @change="setCellDim('cellH', ($event.target as HTMLInputElement).valueAsNumber)"
                  >
                </div>
              </div>
            </div>
            <div class="tm-group">
              <span class="tm-label">{{ $t('p_tilemaps_editor.mapSize') }}</span>
              <div class="tm-dims">
                <div class="tm-num">
                  <span class="tm-num-cap">{{ $t('common.cols') }}</span>
                  <div class="tm-num-ctl">
                    <button :aria-label="$t('p_tilemaps_editor.fewerColumns')" @click="changeDim('cols', -1)">−</button>
                    <span>{{ config.cols }}</span>
                    <button :aria-label="$t('p_tilemaps_editor.moreColumns')" @click="changeDim('cols', 1)">+</button>
                  </div>
                </div>
                <div class="tm-num">
                  <span class="tm-num-cap">{{ $t('common.rows') }}</span>
                  <div class="tm-num-ctl">
                    <button :aria-label="$t('p_tilemaps_editor.fewerRows')" @click="changeDim('rows', -1)">−</button>
                    <span>{{ config.rows }}</span>
                    <button :aria-label="$t('p_tilemaps_editor.moreRows')" @click="changeDim('rows', 1)">+</button>
                  </div>
                </div>
              </div>
            </div>
            <div class="tm-group">
              <span class="tm-label">{{ $t('p_tilemaps_editor.variantSeed') }} <em>{{ config.seed ? config.seed : $t('p_tilemaps_editor.random') }}</em></span>
              <div class="tm-dims tm-dims-one">
                <div class="tm-num">
                  <input
                      type="number" class="tm-cell-input" inputmode="numeric"
                      min="0" max="999999" :value="config.seed"
                      :aria-label="$t('p_tilemaps_editor.variantSeed0Random')"
                      @change="setSeed(($event.target as HTMLInputElement).valueAsNumber)"
                  >
                </div>
              </div>
              <p class="tm-hint">{{ $t('p_tilemaps_editor.0TrueRandomASeedMakes') }}</p>
            </div>
            <div class="tm-group">
              <span class="tm-label">{{ $t('common.background') }}</span>
              <div class="tm-bg-opts">
                <button class="tm-bg-opt" :class="{active: !config.bg}" @click="setBg('')">
                  <span class="tm-bg-sw checker"/>
                  <span>{{ $t('common.transparent') }}</span>
                </button>
                <label class="tm-bg-row2">
                  <input
                      type="color"
                      class="tm-bg-color-input"
                      :value="config.bg || '#1b1b2e'"
                      @input="setBg(($event.target as HTMLInputElement).value)"
                  />
                  <span class="tm-bg-hex">{{ config.bg ? config.bg.toUpperCase() : $t('p_tilemaps_editor.none') }}</span>
                </label>
                <div class="tm-bg-presets">
                  <button
                      v-for="c in BG_PRESETS"
                      :key="c"
                      class="tm-bg-preset"
                      :class="{active: (config.bg || '').toUpperCase() === c.toUpperCase()}"
                      :style="{background: c}"
                      :title="c"
                      @click="setBg(c)"
                  />
                </div>
              </div>
            </div>
          </div>
          <div class="publish-actions">
            <button class="btn primary block" @click="sizeOpen = false">{{ $t('common.done') }}</button>
          </div>
      </UiModal>

    <EditorLoadBrowser
        v-if="showLoadTm"
        :title="$t('p_tilemaps_editor.loadTilemap2')"
        :items="browseTilemaps"
        filterable
        folder
        empty-icon="icon-grid"
        :new-label="world ? t('p_tilemaps_editor.newWorld') : t('p_tilemaps_editor.newMap')"
        :empty-text="$t('p_tilemaps_editor.noTilemapsYet')"
        @select="pickTilemap"
        @create="pickTilemap('__new__')"
        @close="showLoadTm = false"
    />
    </template>
  </ToolLayout>
</template>

<style scoped>
.tm-page { display: flex; flex-direction: column; gap: var(--space-3); }


.tm-editor, .tm-skeleton { touch-action: pan-x pan-y; }

.tm-palette-seg button { flex: 1; }

.tm-src-select {
  max-width: 100%;
}

.tm-settings-body {
  display: flex;
  flex-direction: column;
  gap: 0.875rem;
  max-height: min(60vh, 520px);
  overflow-y: auto;
}

.tm-layout {
  display: grid; gap: 0; grid-template-columns: 1fr;
}
@media (min-width: 768px) {

  .tm-layout { align-items: stretch; }
  .tm-layout-rail { grid-template-columns: 48px minmax(0, 1fr); }
}

.tm-stage-wrap { position: relative; min-width: 0; }
.tm-stage-wrap .tm-stage { width: 100%; }

.tm-stage { aspect-ratio: 4 / 3; }

.tm-island {
  position: absolute; top: 0.75rem; left: 0.75rem; z-index: 6;
  max-width: calc(100% - 1.5rem);
  display: flex; flex-direction: column; gap: 0.4rem;
  padding: 0.4rem;
  border: 1px solid var(--border); border-radius: var(--radius-sm);
  background: color-mix(in oklab, var(--surface) 94%, transparent);
  -webkit-backdrop-filter: blur(4px); backdrop-filter: blur(4px);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
}
.tm-island.open { width: 232px; }

@media (pointer: coarse) and (max-width: 1023px) {
  .tm-island.open { width: calc(100% - 1.5rem); }
}
.tm-island-head {
  display: flex; align-items: center; gap: var(--space-2);
  padding: 0.1rem 0.2rem; cursor: pointer; user-select: none;
  font-size: var(--text-2xs); font-weight: 700; letter-spacing: 0.06em;
  text-transform: uppercase; color: var(--muted);
}
.tm-island-title { white-space: nowrap; }
.tm-island-title em { font-style: normal; color: var(--foreground); font-weight: 600; letter-spacing: 0; }
.tm-island-head .tm-layer-add { margin-left: auto; }
.tm-island-caret { flex: none; margin-left: var(--space-1); }
.tm-island:not(.open) .tm-island-caret { margin-left: var(--space-2); }
.tm-island .tm-layers { background: var(--surface); }

.tm-chips { display: grid; grid-template-columns: repeat(6, 1fr); gap: var(--space-1); }
.tm-chips button {
  height: var(--tm-ctl); padding: 0; border: 1px solid var(--border);
  background: transparent; border-radius: var(--radius-sm); cursor: pointer;
  font-size: var(--text-xs); font-weight: 600; color: var(--foreground);
  transition: border-color var(--transition), color var(--transition), background var(--transition);
}

.tm-chips button.active { border-color: transparent; color: var(--primary); background: color-mix(in oklab, var(--primary) 14%, var(--surface)); }

.tm-cell-input {
  width: 100%; height: var(--tm-ctl); padding: 0 var(--space-2); box-sizing: border-box;
  border: 1px solid var(--border); border-radius: var(--radius-sm);
  background: transparent; color: var(--foreground);
  font-size: var(--text-sm); font-weight: 700; text-align: center;
  -moz-appearance: textfield;
}
.tm-cell-input:focus { outline: none; border-color: var(--primary); }
.tm-cell-input::-webkit-outer-spin-button,
.tm-cell-input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }

.tm-dims { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3); }
.tm-dims-one { grid-template-columns: 1fr; }
.tm-iso-ratio .tm-num-cap em { font-style: normal; text-transform: none; opacity: 0.7; }
.tm-chips-ratio { grid-template-columns: repeat(3, 1fr); }
.tm-num { display: flex; flex-direction: column; gap: 0.3rem; }
.tm-num-cap { font-size: var(--text-2xs); font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); }
.tm-num-ctl {
  display: grid; grid-template-columns: var(--tm-ctl) 1fr var(--tm-ctl); align-items: center;
  height: var(--tm-ctl); border: 1px solid var(--border); border-radius: var(--radius-sm);
  overflow: hidden; background: transparent;
}
.tm-num-ctl button {
  height: 100%; border: 0; background: transparent; cursor: pointer; font-size: var(--text-base); color: var(--muted);
  transition: background var(--transition), color var(--transition);
}
.tm-num-ctl button:hover { background: var(--surface-2); color: var(--foreground); }
.tm-num-ctl span { text-align: center; font-weight: 700; font-size: var(--text-sm); }

.tm-bg-opts { display: flex; flex-direction: column; gap: var(--space-3); }
.tm-bg-sw {
  width: 20px; height: 20px; flex: none; border-radius: var(--radius-sm);
  box-shadow: inset 0 0 0 1px var(--border);
}
.tm-bg-sw.checker {
  background: repeating-conic-gradient(#cfcfd6 0% 25%, #ffffff 0% 50%) 0 0 / 10px 10px;
}
.tm-bg-opt {
  display: flex; align-items: center; gap: var(--space-3); width: 100%; padding: 0.4rem var(--space-2);
  border: 1px solid var(--border); background: transparent; border-radius: var(--radius-sm);
  cursor: pointer; font-size: var(--text-xs); font-weight: 600; color: var(--foreground);
}
.tm-bg-opt.active { border-color: transparent; color: var(--primary); background: color-mix(in oklab, var(--primary) 14%, var(--surface)); }
.tm-bg-row2 { display: flex; align-items: center; gap: var(--space-3); }
.tm-bg-color-input { width: 36px; height: 30px; padding: 0; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--surface); cursor: pointer; flex: none; }
.tm-bg-hex { font-size: var(--text-2xs); font-weight: 700; color: var(--muted); letter-spacing: 0.02em; }
.tm-bg-presets { display: grid; grid-template-columns: repeat(8, 1fr); gap: var(--space-1); }
.tm-bg-preset {
  aspect-ratio: 1; border: 0; border-radius: var(--radius-sm); cursor: pointer; padding: 0;
  box-shadow: inset 0 0 0 1px var(--border);
}
.tm-bg-preset.active { outline: 2px solid var(--primary); outline-offset: 1px; }

.tm-hint { font-size: var(--text-xs); color: var(--muted); margin: 0; }

.tm-layers {
  display: flex; flex-direction: column; gap: 2px;

  max-height: 106px; overflow-y: auto;
  border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 3px;
}
.tm-objects .tm-layer-input { flex: 1; min-width: 0; }
.tm-objects-empty { margin: 0; padding: var(--space-1) var(--space-2); }
.tm-layer {
  display: flex; align-items: center; gap: 0.4rem;
  padding: 0.3rem 0.4rem; border-radius: calc(var(--radius-sm) - 2px);
  cursor: pointer; font-size: var(--text-xs); color: var(--foreground);
}
.tm-layer:hover { background: var(--surface-2); }
.tm-layer.active { background: color-mix(in oklab, var(--primary) 12%, var(--surface)); }
.tm-layer.hidden .tm-layer-name, .tm-layer.hidden .tm-layer-count { opacity: 0.45; }
.tm-layer-eye {
  width: 22px; height: 22px; flex: none; display: inline-flex; align-items: center; justify-content: center;
  border: 0; background: transparent; cursor: pointer; color: var(--muted); border-radius: var(--radius-sm);
}
.tm-layer-eye:hover { color: var(--foreground); background: var(--surface-2); }
.tm-layer-kind {
  width: 20px; height: 20px; flex: none; display: inline-flex; align-items: center; justify-content: center;
  border: 0; background: transparent; cursor: pointer; color: var(--muted); border-radius: var(--radius-sm); font-size: 0.82em;
}
.tm-layer-kind:hover { color: var(--foreground); background: var(--surface-2); }
.tm-layer.active .tm-layer-kind { color: var(--primary); }

.tm-layer-ysort { color: var(--muted); }
.tm-layer-ysort.tm-layer-ysort-on,
.tm-layer.active .tm-layer-ysort.tm-layer-ysort-on { color: var(--primary); }
.tm-layer.active .tm-layer-ysort:not(.tm-layer-ysort-on) { color: var(--muted); }
.tm-layer-name { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 600; }
.tm-layer-input {
  flex: 1; min-width: 0; height: 22px; padding: 0 var(--space-1);
  border: 1px solid var(--primary); border-radius: var(--radius-sm); background: var(--surface);
  font-weight: 600; font-size: var(--text-xs); color: var(--foreground); outline: none;
}
.tm-layer-count { font-size: var(--text-2xs); color: var(--muted); flex: none; }

.tm-layer-add {
  display: inline-flex; align-items: center; gap: 0.2rem; height: 22px; padding: 0 0.55rem;
  border: 1px solid var(--border); background: transparent; border-radius: var(--radius-pill);
  cursor: pointer; font-size: var(--text-2xs); font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase;
  color: var(--foreground);
}
.tm-layer-add:hover:not(:disabled) { color: var(--primary); }
.tm-layer-add:disabled { opacity: 0.4; cursor: default; }

.tm-layer-actions { display: none; align-items: center; gap: 2px; flex: none; }
.tm-layer:hover .tm-layer-actions, .tm-layer.active .tm-layer-actions { display: flex; }
.tm-layer:hover .tm-layer-count, .tm-layer.active .tm-layer-count { display: none; }
.tm-la-btn {
  width: 20px; height: 20px; flex: none; display: inline-flex; align-items: center; justify-content: center;
  border: 0; background: transparent; border-radius: var(--radius-sm); cursor: pointer; color: var(--muted);
}
.tm-la-btn:hover:not(:disabled) { background: var(--surface-2); color: var(--foreground); }
.tm-la-btn:disabled { opacity: 0.3; cursor: default; }
.tm-la-btn.danger:hover:not(:disabled) { color: #ef4444; }

.tm-tilesbar {
  --tm-ctl: 34px;
  display: flex; flex-direction: column; gap: var(--space-3);
  padding: var(--space-3);
}
/* The source, the search and the brush in hand stay put while a long list
   of tiles scrolls under them. */
.tm-tp-head {
  position: sticky; top: calc(var(--space-3) * -1); z-index: 1;
  display: flex; flex-direction: column; gap: var(--space-2);
  margin: calc(var(--space-3) * -1) calc(var(--space-3) * -1) 0;
  padding: var(--space-3);
  background: var(--surface);
  border-bottom: 1px solid var(--border);
}
.tm-tp-head .tm-search { margin-bottom: 0; }
.tm-tp-row { display: flex; align-items: center; gap: var(--space-2); }
.tm-tp-row > .tm-src-select { flex: 1 1 0; min-width: 0; max-width: none; }
.tm-tp-row > .tm-label { margin-right: auto; }
.tm-tp-group { width: 100%; max-width: none; }

/* The brush in hand: what a click on the map will place. */
.tm-tp-current {
  display: flex; align-items: center; gap: var(--space-3);
  padding: var(--space-2);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
}
.tm-tp-current-thumb {
  display: inline-flex; align-items: center; justify-content: center; flex: none;
  width: calc(var(--space-6) + var(--space-4)); height: calc(var(--space-6) + var(--space-4));
  border-radius: var(--radius-sm);
  background: var(--surface);
  box-shadow: inset 0 0 0 1px var(--border);
  color: var(--primary);
}
.tm-tp-current-thumb img { width: 100%; height: 100%; padding: var(--space-1); object-fit: contain; image-rendering: pixelated; }
.tm-tp-current-text { display: flex; flex-direction: column; min-width: 0; }
.tm-tp-current-name {
  font-size: var(--text-sm); font-weight: 600; color: var(--foreground);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.tm-tp-current-kind { font-size: var(--text-2xs); color: var(--muted); }

.tm-tp-sec { display: flex; flex-direction: column; gap: var(--space-2); }
.tm-tp-sec + .tm-tp-sec { padding-top: var(--space-3); border-top: 1px solid var(--border); }

/* Brushes carry their names: the auto-tile and random ones are picked by
   what they paint, and an 8px caption under an icon could not be read. */
.tm-brushes { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-2); }
.tm-brush {
  display: flex; align-items: center; gap: var(--space-2); min-width: 0;
  height: var(--tm-ctl, 34px); padding: 0 var(--space-2);
  border: 0; border-radius: var(--radius-sm);
  background: var(--surface-2); color: var(--foreground);
  box-shadow: inset 0 0 0 1px var(--border);
  font-size: var(--text-xs); font-weight: 600; text-align: left; cursor: pointer;
  transition: box-shadow var(--transition);
}
.tm-brush img { width: var(--icon-lg); height: var(--icon-lg); flex: none; object-fit: contain; image-rendering: pixelated; }
.tm-brush .icon { color: var(--primary); }
.tm-brush-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tm-brush.active { box-shadow: inset 0 0 0 2px var(--primary); color: var(--primary); }
@media (hover: hover) and (pointer: fine) {
  .tm-brush:not(.active):hover { box-shadow: inset 0 0 0 1px var(--muted); }
}

.tm-tp-zoom { display: flex; align-items: center; gap: var(--space-1); }
.tm-tp-zoom-val {
  min-width: var(--space-6); text-align: center;
  font-size: var(--text-xs); font-weight: 600; font-variant-numeric: tabular-nums; color: var(--muted);
}
.tm-tiles-grid {
  display: grid; gap: var(--space-2); padding: 2px;
  grid-template-columns: repeat(auto-fill, minmax(var(--tm-tile, calc(var(--space-6) * 2)), 1fr));
}
.tm-tiles-grid:empty { display: none; }
/* A pinned group: the sheet as its author drew it. Wider than the rail, it
   scrolls sideways here; down, the panel itself scrolls. */
.tm-sheet-wrap {
  position: relative; overflow-x: auto;
  border-radius: var(--radius-sm); background: var(--surface-2);
  box-shadow: inset 0 0 0 1px var(--border);
}
/* Stacked under the map, the picker must not push it out of reach. */
@media (max-width: 1279px) {
  .tm-tp-head { position: static; }
  :is(.tm-sheet-wrap, .tm-tiles-grid) { overflow-y: auto; max-height: 60vh; }
}
/* max-width: none — main.css caps every canvas at 100% of its parent, which
   squeezed a 2048px-wide sheet into the panel while its height stayed put. */
.tm-sheet { display: block; max-width: none; image-rendering: pixelated; cursor: pointer; }
/* Same indigo as the board's own hover, so the two read as one tool. Moved
   by transform from script; never in the way of the pointer. */
.tm-sheet-mark {
  display: none; position: absolute; top: 0; left: 0; pointer-events: none;
  box-shadow: inset 0 0 0 2px rgba(99, 102, 241, 0.6);
  background: rgba(99, 102, 241, 0.18);
}
.tm-sheet-mark.is-pick { box-shadow: inset 0 0 0 2px rgb(99, 102, 241); background: rgba(99, 102, 241, 0.12); }
.tm-sheet-mark.is-drag { box-shadow: inset 0 0 0 2px rgba(99, 102, 241, 0.9); }
.tm-tiles-empty { grid-column: 1 / -1; margin: 0; }

.tm-pager { display: flex; align-items: center; justify-content: center; gap: var(--space-2); }
.tm-pager-btn {
  width: var(--tm-ctl, 34px); height: var(--tm-ctl, 34px);
  display: inline-flex; align-items: center; justify-content: center;
  border: 1px solid var(--border); background: transparent; border-radius: var(--radius-sm);
  cursor: pointer; color: var(--foreground);
}
.tm-pager-btn:disabled { opacity: 0.4; cursor: default; }

.tm-tile {
  aspect-ratio: 1; display: flex; align-items: center; justify-content: center;
  padding: var(--space-1); border: 0; border-radius: var(--radius-sm);
  background: var(--surface-2); cursor: pointer; overflow: hidden; color: var(--muted);
  box-shadow: inset 0 0 0 1px var(--border);
  transition: box-shadow var(--transition);
}
.tm-tile:hover { box-shadow: inset 0 0 0 1px var(--muted); }
.tm-tile img { width: 100%; height: 100%; object-fit: contain; image-rendering: pixelated; }
.tm-tile.active { box-shadow: inset 0 0 0 2px var(--primary); }
.tm-tile-skel { aspect-ratio: 1; border-radius: var(--radius-sm); }

@media (max-width: 767px) {

  .tm-stage-wrap { order: -1; }
  .tm-stage { width: 100%; }
  .tm-tile { padding: 2px; }

  .tm-cell-input, .tm-search input, .tm-layer-input { font-size: var(--text-base); }
}
.tm-board {
  flex: none; font-size: 0; overflow: hidden; border-radius: 3px;
  box-shadow:
      0 0 0 1px var(--border),
      0 1px 2px rgba(0, 0, 0, 0.05),
      0 12px 30px -10px rgba(0, 0, 0, 0.22);
}
.tm-board-bg { background: repeating-conic-gradient(#ebebf1 0% 25%, #ffffff 0% 50%) 0 0 / 16px 16px; }
.tm-canvas {
  display: block;
  image-rendering: pixelated; touch-action: none; cursor: crosshair;
}

.tm-rendering {
  position: absolute; top: 0.75rem; right: 0.75rem;
  display: inline-flex; align-items: center; gap: 0.4rem;
  padding: 0.3rem 0.65rem; border-radius: var(--radius-pill);
  background: color-mix(in oklab, var(--surface) 90%, transparent);
  -webkit-backdrop-filter: blur(4px); backdrop-filter: blur(4px);
  border: 1px solid var(--border);
  font-size: var(--text-2xs); font-weight: 600; color: var(--muted);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
}
.tm-spinner {
  width: 12px; height: 12px; border-radius: 50%;
  border: 2px solid color-mix(in oklab, var(--primary) 28%, transparent);
  border-top-color: var(--primary);
  animation: tm-spin 0.7s linear infinite;
}
@keyframes tm-spin { to { transform: rotate(360deg); } }
.tm-fade-enter-active, .tm-fade-leave-active { transition: opacity 0.2s ease; }
.tm-fade-enter-from, .tm-fade-leave-to { opacity: 0; }

/* The loading view is the editor's own frame with its contents greyed out,
   so nothing moves when the real one arrives. Shapes only -- the shimmer and
   the reduced-motion handling come from .skeleton in main.css. */
.skel-btn { width: calc(var(--bar-h) - var(--space-2)); }
.skel-title { flex: 0 1 25%; margin-left: var(--space-2); }
/* The rail runs across the top on phones and down the side from 768, the
   same way the real one does. */
.skel-rail { display: flex; gap: var(--space-1); padding: var(--space-1); }
.skel-rail-btn { flex: 0 0 auto; height: calc(var(--bar-h) - var(--space-2)); aspect-ratio: 1; }
@media (min-width: 768px) {
  .skel-rail { flex-direction: column; }
  .skel-rail-btn { width: 100%; height: auto; }
}
.skel-board { width: 100%; height: 100%; }
</style>

<style>

.tm-settings-modal { --tm-ctl: 34px; }
</style>
