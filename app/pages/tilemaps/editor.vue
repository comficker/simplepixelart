<script setup lang="ts">
import {ref, computed, reactive, watch, onMounted, onBeforeUnmount, nextTick} from 'vue'
import {toast} from 'vue-sonner'
import type {SharedPage} from '~/types'
import {debounce, pruneStorageKeys} from '~/helper/utils'
import {
  type TilemapConfig, type TilemapMode, type LayerKind, normalizeTilemap,
  CELL_PRESETS, MIN_CELL, MAX_CELL, ISO_RATIOS, MIN_DIM, MAX_DIM, MAX_LAYERS, makeLayer, placedIds,
  computeGeometry, cellAt, cellCenter, tileImageUrl, drawPlacedTiles, cellRoll,
} from '~/helper/tilemap'
import {type Terrain, reflowTerrain} from '~/helper/autotile'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const apiBase = useRuntimeConfig().public.api as string
const localTs = useLocalTilesets()

useCustomSeoMeta({
  title: 'Tilemap Editor — Make Pixel Art Maps Online (Grid & Isometric)',
  description: 'Free online tilemap maker. Paint pixel-art maps on a grid or isometric grid with stacked layers of ground tiles and sprites — using your own art or any piece from the gallery. No signup, runs in your browser.',
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
          {
            '@type': 'BreadcrumbList',
            itemListElement: [
              {'@type': 'ListItem', position: 1, name: 'Home', item: 'https://simplepixelart.com/'},
              {'@type': 'ListItem', position: 2, name: 'Tilemap Editor', item: 'https://simplepixelart.com/tilemaps/editor'},
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
const brush = ref<number | 'erase' | `terrain:${string}` | `random:${string}`>('erase')
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
  if (b.startsWith('terrain:')) return terrains.value.some(t => t.id === b.slice('terrain:'.length))
  if (b.startsWith('random:')) return variantGroups.value.some(v => v.id === b.slice('random:'.length))
  return false
}
const variantGroups = ref<{ id: string; name: string; tiles: number[]; weights: Record<string, number> }[]>([])
const tool = ref<'paint' | 'select' | 'fill' | 'line' | 'rect' | 'pick'>('paint')
const brushSize = ref(1)
const dirty = ref(false)
const saving = ref(false)

const PALETTE_PER = 24
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
let stroke: { undo: Map<string, number | undefined> } | null = null

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

const paletteItems = computed(() => paletteMode.value === 'search'
    ? searchResults.value
    : items.value.slice((palettePage.value - 1) * PALETTE_PER, palettePage.value * PALETTE_PER))
const totalPages = computed(() => {
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
  } catch { /* quota — ignore */ }
}
const debouncedViewSave = debounce(saveViewState, 400)
function restoreViewState(): boolean {
  if (typeof localStorage === 'undefined') return false
  let v: any = null
  try { v = JSON.parse(localStorage.getItem(viewKey()) || 'null') } catch { /* corrupt — ignore */ }
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

const LS_KEY = 'spa_tilemap_freestyle_v1'

function restoreFreeStyle(): string | null {
  let saved: any = null
  try { saved = JSON.parse(localStorage.getItem(LS_KEY) || 'null') } catch { /* ignore */ }
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
  } catch { /* quota — ignore */ }
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
    worldSiblings.value = res.results.map(w => ({id_string: w.id_string, name: w.name || 'Untitled'}))
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
      id: w.id, id_string: w.id_string, name: w.name || 'Untitled',
      status: w.status, tileset_id_string: w.tileset_id_string,
      tileset_name: w.tileset_name || 'Tileset',
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
              name: String(g.name || 'Variants'),
              tiles: g.tiles.map(Number).filter((id: number) => (w.registry || {})[id]),
              weights: (g.weights && typeof g.weights === 'object') ? g.weights : {},
            }))
            .filter((g: any) => g.tiles.length)
        : []
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
    toast.error('Could not load that world')
    return false
  } finally {
    loadingDetail.value = false
    await nextTick()
    if (!restoreViewState()) fitZoom()
    draw()
  }
}

const myTilesets = ref<{ id_string: string; name: string; count: number; worlds: { id_string: string }[]; local?: boolean }[]>([])

async function fetchMyTilesets() {
  if (!auth.isLogged) {
    refreshLocalThumbs()
    myTilesets.value = localTs.list.value.map(t => ({
      id_string: t.id, name: t.name || 'Untitled',
      count: t.tiles.length, worlds: [], local: true,
    }))
    return
  }
  try {
    const res = await useNativeFetch<{ results: any[] }>('/coloring/tilesets/', {params: {page_size: 100}})
    myTilesets.value = (res.results || []).map(t => ({
      id_string: t.id_string, name: t.name || 'Untitled',
      count: Object.keys(t.meta?.registry || {}).length,
      worlds: Array.isArray(t.worlds) ? t.worlds : [],
    }))
  } catch { myTilesets.value = [] }
}

async function onSourceSelect(v: string, el: HTMLSelectElement) {
  if (v === '__manage__') {
    el.value = world.value?.tileset_id_string || ''
    router.push(world.value ? `/tilesets/editor?id=${world.value.tileset_id_string}` : '/tilesets/editor')
    return
  }
  if (!v) selectSource(null)
  else await selectTileset(v)
  el.value = world.value?.tileset_id_string || guestTileset.value?.id || ''
}

function selectSource(id: null) {
  if (guestTileset.value && !world.value) {
    guestTileset.value = null
    items.value = []
    terrains.value = []
    variantGroups.value = []
    paletteTab.value = 'search'
    brush.value = 'erase'
    touch()
    runSearch(1)
    return
  }
  if (!world.value) return
  if (dirty.value && !confirm('Discard unsaved changes to the current world?')) return
  enterFreeStyle()
}

async function selectTileset(slug: string) {
  if (slug.startsWith('local:')) { loadLocalTilesetPalette(slug); return }
  if (world.value?.tileset_id_string === slug) return
  if (dirty.value && !confirm('Discard unsaved changes to the current world?')) return
  const t = myTilesets.value.find(x => x.id_string === slug)
  const newest = t?.worlds?.[0]
  if (newest) {
    router.replace({query: {world: newest.id_string}})
    await loadWorld(newest.id_string)
    return
  }
  try {
    const w = await useNativeFetch<any>('/coloring/worlds/', {
      method: 'POST',
      body: {tileset: slug, name: 'World 1', meta: {config: null}},
    })
    router.replace({query: {world: w.id_string}})
    await loadWorld(w.id_string)
  } catch {
    toast.error('Could not open that tileset')
  }
}

function loadLocalTilesetPalette(localId: string) {
  const m = localTs.editorModel(localId)
  if (!m) { toast.error('That tileset is no longer available'); return }
  refreshLocalThumbs()
  const reg: Record<string, string> = m.registry || {}
  tilesetRegistry.value = {...reg}
  for (const [id, slug] of Object.entries(reg)) knownTiles[Number(id)] = slug
  terrains.value = Array.isArray(m.groups)
      ? m.groups
          .filter((g: any) => g?.kind === 'terrain' && g?.map && Object.keys(g.map).length)
          .map((g: any) => ({
            id: String(g.id),
            name: String(g.name || 'Terrain'),
            type: g.type === 'blob47' ? 'blob47' : 'wang16',
            map: Object.fromEntries(Object.entries(g.map).map(([k, v]) => [k, Number(v)])),
            ...(g.relations ? {relations: g.relations} : {}),
          }))
      : []
  variantGroups.value = Array.isArray(m.groups)
      ? m.groups
          .filter((g: any) => g?.kind === 'group' && g?.random && Array.isArray(g.tiles) && g.tiles.length)
          .map((g: any) => ({
            id: String(g.id), name: String(g.name || 'Variants'),
            tiles: g.tiles.map(Number).filter((id: number) => reg[String(id)]),
            weights: (g.weights && typeof g.weights === 'object') ? g.weights : {},
          }))
          .filter((g: any) => g.tiles.length)
      : []
  for (const t of terrains.value) for (const id of Object.values(t.map || {})) ensureImage(Number(id))
  for (const vg of variantGroups.value) for (const id of vg.tiles) ensureImage(id)
  items.value = Object.entries(reg).map(([id, slug]) => ({
    id: Number(id), id_string: slug, name: slug,
  })) as any
  guestTileset.value = {id: localId, name: m.name || 'Tileset'}
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
  draw()
  toast.success('Tiles refreshed')
}

function switchWorld(slug: string) {
  if (!slug || slug === world.value?.id_string) return
  if (dirty.value && !confirm('Discard unsaved changes to the current world?')) return
  router.replace({query: {world: slug}})
  loadWorld(slug)
}

async function newWorld() {
  if (!world.value) return
  if (dirty.value && !confirm('Discard unsaved changes to the current world?')) return
  try {
    const w = await useNativeFetch<any>('/coloring/worlds/', {
      method: 'POST',
      body: {
        tileset: world.value.tileset_id_string,
        name: `World ${worldSiblings.value.length + 1}`,
        meta: {config: normalizeTilemap(null)},
      },
    })
    router.replace({query: {world: w.id_string}})
    await loadWorld(w.id_string)
  } catch {
    toast.error('Could not create world')
  }
}

function newMap() {
  if (world.value) { newWorld(); return }
  if (dirty.value && !confirm('Discard unsaved changes to this map?')) return
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
      id: w.id_string, name: w.name || 'Untitled', status: w.status, updated: w.updated,
      previewImgs: Object.values(w.registry || {}).slice(0, 4).map((s: any) => tileImageUrl(apiBase, s)),
    }))
  }
  const reg: Record<number, string> = {}
  for (const id of placedIds(config)) if (knownTiles[id]) reg[id] = knownTiles[id]
  if (!Object.keys(reg).length) return []
  return [{
    id: 'freestyle', name: 'Free-style map', status: 'draft',
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

function downloadBlob(name: string, blob: Blob) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.click()
  URL.revokeObjectURL(a.href)
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
  cv.toBlob(b => { if (b) downloadBlob(`${exportName()}.png`, b) })
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
  downloadBlob(`${exportName()}.json`, new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'}))
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
  if (kk === 'e') {
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

function paintCell(col: number, row: number, erase: boolean) {
  const layer = activeLayer.value
  if (!layer) return
  if (!layer.terrain) layer.terrain = {}
  const map = layer.cells
  const k = key(col, row)
  const remember = (ck = k) => { if (stroke && !stroke.undo.has(ck)) stroke.undo.set(ck, map[ck]) }
  const isTerrainBrush = typeof brush.value === 'string' && brush.value.startsWith('terrain:')
  const isRandomBrush = typeof brush.value === 'string' && brush.value.startsWith('random:')

  if (erase || brush.value === 'erase') {
    if (k in map || k in layer.terrain) {
      remember()
      delete map[k]
      const hadTerrain = k in layer.terrain
      delete layer.terrain[k]
      if (hadTerrain) reflowTerrain(layer, terrains.value, col, row)
      touch()
      return
    }
    for (let dr = 0; dr < MAX_SPAN; dr++) {
      for (let dc = 0; dc < MAX_SPAN; dc++) {
        if (!dc && !dr) continue
        const ak = key(col - dc, row - dr)
        const id = map[ak]
        if (id == null) continue
        const span = tileSpan(id, layer)
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

  if (isTerrainBrush) {
    const tid = (brush.value as string).slice('terrain:'.length)
    if (layer.terrain[k] === tid) return
    remember()
    layer.terrain[k] = tid
    reflowTerrain(layer, terrains.value, col, row)
    touch()
    return
  }

  let tileId = brush.value as number
  if (isRandomBrush) {
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

  if (map[k] !== tileId) {
    remember()
    map[k] = tileId
    if (k in layer.terrain) {
      delete layer.terrain[k]
      reflowTerrain(layer, terrains.value, col, row)
      map[k] = tileId
    }
    const span = tileSpan(tileId, layer)
    for (let dr = 0; dr < span.rows; dr++) {
      for (let dc = 0; dc < span.cols; dc++) {
        if (!dc && !dr) continue
        const c2 = col + dc
        const r2 = row + dr
        if (c2 >= config.cols || r2 >= config.rows) continue
        const ck = key(c2, r2)
        if (ck in map || ck in layer.terrain) {
          remember(ck)
          delete map[ck]
          const hadT = ck in layer.terrain
          delete layer.terrain[ck]
          if (hadT) reflowTerrain(layer, terrains.value, c2, r2)
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
  const layer = makeLayer(`Layer ${config.layers.length + 1}`, newLayerId(), 'sprite')
  config.layers.push(layer)
  activeLayerId.value = layer.id
  touch()
  redraw()
}
function setLayerKind(id: string, kind: LayerKind) {
  const l = config.layers.find(x => x.id === id)
  if (l && l.kind !== kind) { l.kind = kind; touch(); redraw() }
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
  if (l) { l.name = (l.name || '').trim() || 'Layer'; touch() }
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
    for (const [k, id] of Object.entries(selAction.grabbed.cells)) {
      const [c, r] = k.split('_').map(Number)
      const img = tileImages.get(id)
      if (!img?.complete || !img.naturalWidth) continue
      ctx.drawImage(
          img,
          Math.round((c! + selAction.dc) * g.tileW * z),
          Math.round((r! + selAction.dr) * g.tileH * z),
          Math.round(img.naturalWidth * z), Math.round(img.naturalHeight * z),
      )
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
  cv.width = Math.max(1, Math.round(g.width * z * dpr))
  cv.height = Math.max(1, Math.round(g.height * z * dpr))
  const ctx = cv.getContext('2d')
  if (!ctx) return
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  if (config.bg) { ctx.fillStyle = config.bg; ctx.fillRect(0, 0, g.width * z, g.height * z) }
  drawGridOverlay(ctx)
  drawPlacedTiles(ctx, config, g, tileImages, z)
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
  if (gesture.dist > 0) {                              // pinch → stepped zoom
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
  shape = null
  if (!cells.length) return
  pushHistory()
  stroke = {undo: new Map()}
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
        const aid = layer.cells[key(cell.col - dc, cell.row - dr)]
        if (aid == null) continue
        const span = tileSpan(aid, layer)
        if (dc < span.cols && dr < span.rows) { id = aid; break outer }
      }
    }
  }
  if (id == null) return
  brush.value = id
  tool.value = 'paint'
}

function paintBrush(col: number, row: number, erase: boolean) {
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
  stroke = {undo: new Map()}
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
      for (const [c, r] of reflowAt) reflowTerrain(layer, terrains.value, c, r)
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
  toast.success('Region copied')
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
  for (const [c, r] of reflowAt) reflowTerrain(layer, terrains.value, c, r)
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
  for (const [c, r] of reflowAt) reflowTerrain(layer, terrains.value, c, r)
  touch()
  draw()
}

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
      toast.success('World saved')
    } catch {
      toast.error('Could not save world')
    } finally {
      saving.value = false
    }
    return
  }
  if (auth.isLogged) {
    saving.value = true
    try {
      const name = 'My world'
      const tm = await useNativeFetch<any>('/coloring/tilesets/', {
        method: 'POST',
        body: {name, meta: {registry: buildRegistry()}},
      })
      const w = await useNativeFetch<any>('/coloring/worlds/', {
        method: 'POST',
        body: {tileset: tm.id_string, name, meta: {config: snapshot()}},
      })
      world.value = {
        id: w.id, id_string: w.id_string, name: w.name || name,
        status: w.status, tileset_id_string: tm.id_string,
        tileset_name: tm.name || name,
      }
      router.replace({query: {world: w.id_string}})
      dirty.value = false
      fetchWorldSiblings()
      toast.success('World saved')
    } catch {
      toast.error('Could not save world')
    } finally {
      saving.value = false
    }
    return
  }
  saveFreeStyle()
  toast.success('Saved in this browser')
}

const faq = [
  {q: 'Is the Tilemap Editor free?', a: `<p>Yes — completely free and running in your browser. No signup to start and no watermark.</p>`},
  {q: 'Do I need an account?', a: `<p><strong>Free style</strong> works with no login and saves your map in this browser. Sign in only to paint from your own collections and save maps to them.</p>`},
  {q: "What's the difference between grid and isometric?", a: `<p>Grid mode lays tiles in a flat square grid for top-down maps. Isometric mode uses 2:1 diamond cells for a 3/4 view, where taller sprites rise above and overlap the cells behind them.</p>`},
  {q: 'What are ground and sprite layers?', a: `<p>A <strong>ground</strong> layer fills each cell so floor tiles tessellate. A <strong>sprite</strong> layer draws art at its real size, anchored to the cell's base so objects stand on the floor. Layers can be reordered, hidden or deleted.</p>`},
  {q: 'Can I use my own pixel art as tiles?', a: `<p>Yes. Draw tiles in the <a href="/editor">pixel art editor</a>, add them to a collection, then pick that collection here to paint with them.</p>`},
]
</script>

<template>
  <div class="page tm-page">

    <div v-if="loadingList" class="tm-skeleton" aria-busy="true" aria-label="Loading">
      <div class="skel skel-controls"/>
      <div class="tm-layout">
        <div class="tm-stage"><div class="skel skel-board"/></div>
      </div>
    </div>

    <template v-else>
        <div class="tm-editor flat-editor">

        <div class="editor-toolbar">
          <div class="toolbar-start">
            <ui-dropdown-menu>
              <ui-tooltip text="File — worlds & export">
                <button class="toolbar-btn"><span class="icon icon-file"/></button>
              </ui-tooltip>
              <template #menu>
                <div class="file-menu">
                  <button class="file-menu-item" @click="openLoadTilemap">
                    <span class="icon icon-grid"/><span>Load tilemap…</span>
                  </button>
                  <button class="file-menu-item" @click="newMap()">
                    <span class="icon icon-plus"/><span>{{ world ? 'New world' : 'New map' }}</span>
                  </button>
                  <div class="file-menu-sep"/>
                  <button class="file-menu-item" @click="exportPNG">
                    <span class="icon icon-image"/><span>Download PNG</span>
                  </button>
                  <button class="file-menu-item" @click="exportJSON">
                    <span class="icon icon-download"/><span>Export JSON</span>
                  </button>
                </div>
              </template>
            </ui-dropdown-menu>
          </div>

          <div class="toolbar-main no-scrollbar">
            <div class="toolbar-group">
              <ui-tooltip text="Map settings — grid type, cell & map size, seed, background">
                <button class="toolbar-btn" @click="sizeOpen = true">
                  <span class="icon icon-cog"/>
                </button>
              </ui-tooltip>
            </div>
            <div class="toolbar-sep"/>
            <div class="toolbar-group">
              <ui-tooltip text="Undo (⌘Z)">
                <button class="toolbar-btn" :disabled="!canUndo" @click="undo(); draw()">
                  <span class="icon icon-undo"/>
                </button>
              </ui-tooltip>
              <ui-tooltip text="Redo (⇧⌘Z)">
                <button class="toolbar-btn" :disabled="!canRedo" @click="redo(); draw()">
                  <span class="icon icon-redo"/>
                </button>
              </ui-tooltip>
            </div>
            <div class="toolbar-sep"/>
            <div class="toolbar-group">
              <ui-tooltip text="Zoom out">
                <button class="toolbar-btn" :disabled="zoom <= ZMIN" aria-label="Zoom out" @click="zoomOut">
                  <span class="icon icon-zoom-out"/>
                </button>
              </ui-tooltip>
              <ui-tooltip text="Zoom in">
                <button class="toolbar-btn" :disabled="zoom >= ZMAX" aria-label="Zoom in" @click="zoomIn">
                  <span class="icon icon-zoom-in"/>
                </button>
              </ui-tooltip>
            </div>
          </div>

          <div class="toolbar-end">
            <ui-tooltip :text="`Clear ${activeLayer?.name || 'layer'} — remove every tile on this layer`">
              <button
                  class="toolbar-btn"
                  :disabled="!ready || !activeLayer || !Object.keys(activeLayer.cells).length"
                  @click="clearLayer"
              >
                <span class="icon icon-broom"/>
              </button>
            </ui-tooltip>
            <ui-tooltip :text="saving ? 'Saving…' : 'Save'">
              <button
                  class="publish-toolbar-btn tm-save"
                  :class="{dirty}"
                  :disabled="saving || (!dirty && world !== null)"
                  :aria-label="saving ? 'Saving…' : 'Save'"
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
              <ui-tooltip text="Paint (P) — Alt-click picks a tile" position="right">
                <Square :class="{active: tool === 'paint'}" @click="tool = 'paint'">
                  <span class="icon icon-pen"/>
                </Square>
              </ui-tooltip>
              <ui-tooltip text="Fill (G) — repaint the touching region" position="right">
                <Square :class="{active: tool === 'fill'}" @click="tool = 'fill'">
                  <span class="icon icon-bucket"/>
                </Square>
              </ui-tooltip>
              <ui-tooltip text="Line (L)" position="right">
                <Square :class="{active: tool === 'line'}" @click="tool = 'line'">
                  <span class="icon icon-line"/>
                </Square>
              </ui-tooltip>
              <ui-tooltip text="Rectangle (R)" position="right">
                <Square :class="{active: tool === 'rect'}" @click="tool = 'rect'">
                  <span class="icon icon-square"/>
                </Square>
              </ui-tooltip>
              <ui-tooltip text="Eraser (E) — or right-click / ⌘-drag" position="right">
                <Square :class="{active: brush === 'erase'}" @click="toggleEraser">
                  <span class="icon icon-eraser"/>
                </Square>
              </ui-tooltip>

              <div
                  v-if="tool === 'paint' || tool === 'line'"
                  class="brush-sizes"
                  role="group"
                  aria-label="Brush size"
              >
                <ui-tooltip v-for="n in [1, 2, 3, 4]" :key="n" :text="`Brush size ${n}×${n} cells`" position="right">
                  <button
                      type="button"
                      class="brush-size"
                      :class="{active: brushSize === n}"
                      :aria-label="`Brush size ${n}`"
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

              <ui-tooltip text="Eyedropper (I) — pick a placed tile or terrain" position="right">
                <Square :class="{active: tool === 'pick'}" @click="tool = 'pick'">
                  <span class="icon icon-eyedropper"/>
                </Square>
              </ui-tooltip>
              <ui-tooltip v-if="config.mode === 'grid'" text="Select (M) — move, copy or delete a region" position="right">
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
                :title="layersOpen ? 'Collapse layers' : 'Expand layers'"
                @click="layersOpen = !layersOpen"
                @keydown.enter.prevent="layersOpen = !layersOpen"
            >
              <span class="tm-island-title">Layers <em>{{ config.layers.length }}</em></span>
              <button v-if="layersOpen" class="tm-layer-add" :disabled="config.layers.length >= 12" title="Add layer" @click.stop="addLayer">
                <span class="icon icon-plus"/> Layer
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
                    :title="l.visible ? 'Hide layer' : 'Show layer'"
                    @click.stop="toggleLayer(l.id)"
                >
                  <span class="icon" :class="l.visible ? 'icon-eye' : 'icon-eye-cross'"/>
                </button>
                <button
                    class="tm-layer-kind"
                    :title="l.kind === 'sprite' ? 'Sprite layer (sits on top) — click for Ground' : 'Ground layer (fills cells) — click for Sprite'"
                    @click.stop="setLayerKind(l.id, l.kind === 'ground' ? 'sprite' : 'ground')"
                >
                  <span class="icon" :class="l.kind === 'sprite' ? 'icon-rhombus' : 'icon-grid'"/>
                </button>
                <button
                    class="tm-layer-kind tm-layer-ysort"
                    :class="{'tm-layer-ysort-on': l.ySort}"
                    :title="l.ySort ? 'Y-sort on — tiles overlap by depth (lower on top); click to turn off' : 'Y-sort off — flat top-to-bottom order; click to sort by depth'"
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
                <span v-else class="tm-layer-name" :title="`${l.name} — double-click to rename`" @dblclick.stop="startRename(l.id)">{{ l.name }}</span>
                <span class="tm-layer-count">{{ Object.keys(l.cells).length }}</span>
                <div class="tm-layer-actions">
                  <button class="tm-la-btn" :disabled="l.id === topLayerId" title="Move up" @click.stop="moveLayer(l.id, 1)"><span class="icon icon-expand-up"/></button>
                  <button class="tm-la-btn" :disabled="l.id === bottomLayerId" title="Move down" @click.stop="moveLayer(l.id, -1)"><span class="icon icon-expand-down"/></button>
                  <button class="tm-la-btn danger" :disabled="config.layers.length < 2" title="Delete layer" @click.stop="removeLayer(l.id)"><span class="icon icon-trash"/></button>
                </div>
              </div>
            </div>
          </div>

          <div ref="stageEl" class="tm-stage no-scrollbar" @scroll.passive="debouncedViewSave()">
          <div v-if="loadingDetail" class="skel skel-board"/>

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
                <span>Loading tiles…</span>
              </div>
            </transition>
            <div v-if="world" class="tm-stage-fab">
              <ui-tooltip text="Open this world's public page" position="left">
                <nuxt-link :to="`/worlds/${world.id_string}`" class="tm-stage-fab-btn" aria-label="Open public page">
                  <span class="icon icon-link"/>
                </nuxt-link>
              </ui-tooltip>
            </div>
          </template>
          </div>
          </div>
        </div>

        <div class="tm-tilesbar">
          <div class="tm-tilesbar-ctl">
            <div v-if="hasSeg" class="tm-seg tm-palette-seg">
              <button :class="{active: paletteTab === 'tiles'}" @click="paletteTab = 'tiles'">
                <span class="icon icon-grid"/> Tiles
              </button>
              <button :class="{active: paletteTab === 'search'}" title="Paint with any public pixel art" @click="paletteTab = 'search'">
                <span class="icon icon-search"/> Search
              </button>
            </div>
            <select
                v-if="hasSeg && paletteTab === 'tiles'"
                class="tm-world-select tm-src-select"
                :value="world?.tileset_id_string || guestTileset?.id || ''"
                title="Tile source — pick a tileset"
                @change="onSourceSelect(($event.target as HTMLSelectElement).value, $event.target as HTMLSelectElement)"
            >
              <option value="">Free style — search any art</option>
              <option v-for="t in myTilesets" :key="t.id_string" :value="t.id_string">
                {{ t.name }} ({{ t.count }} tiles)
              </option>
              <option value="__manage__">✎ Manage tilesets…</option>
            </select>
            <template v-if="hasTilesSource && paletteTab === 'tiles'">
              <a
                  v-if="editTilesetUrl"
                  :href="editTilesetUrl"
                  target="_blank"
                  rel="noopener"
                  class="tm-pager-btn"
                  title="Edit this tileset (opens in a new tab)"
                  aria-label="Edit tileset"
              ><span class="icon icon-pen"/></a>
              <button
                  class="tm-pager-btn"
                  title="Refresh tiles — reload the art after editing it"
                  aria-label="Refresh tiles"
                  @click="refreshTiles"
              ><span class="icon icon-sync"/></button>
            </template>
            <div v-if="paletteMode === 'search'" class="tm-search">
              <span class="icon icon-search"/>
              <input
                  v-model="searchQuery"
                  type="search"
                  placeholder="Search pixel art…"
                  @input="onSearchInput"
                  @keydown.enter.prevent="runSearch(1)"
              />
            </div>
            <div v-if="!paletteLoading && totalPages > 1" class="tm-pager">
              <button class="tm-pager-btn" :disabled="palettePage <= 1" :title="`Previous page (${palettePage} / ${totalPages})`" aria-label="Previous page" @click="goPage(palettePage - 1)"><span class="icon icon-angle-left"/></button>
              <button class="tm-pager-btn" :disabled="palettePage >= totalPages" :title="`Next page (${palettePage} / ${totalPages})`" aria-label="Next page" @click="goPage(palettePage + 1)"><span class="icon icon-angle-right"/></button>
            </div>
          </div>
          <div class="tm-tiles no-scrollbar">
            <div class="tm-tiles-grid">
              <template v-if="paletteLoading">
                <div v-for="n in 12" :key="n" class="skel tm-tile-skel"/>
              </template>
              <p v-else-if="!paletteItems.length" class="tm-hint tm-tiles-empty">
                <template v-if="paletteMode === 'search'">No art found — try another search.</template>
                <template v-else-if="!hasTilesSource">Pick a tileset from the menu, or switch to Search.</template>
                <template v-else>This tileset has no tiles yet — add some in the
                  <nuxt-link v-if="world || guestTileset" :to="`/tilesets/editor?id=${world?.tileset_id_string || guestTileset?.id}`" class="underline">tileset editor</nuxt-link>,
                  or use Search above.</template>
              </p>
              <template v-else>
                <button
                    v-for="t in (paletteMode === 'tiles' ? terrains : [])"
                    :key="t.id"
                    class="tm-tile tm-terrain"
                    :class="{active: brush === `terrain:${t.id}`}"
                    :title="`Terrain brush: ${t.name} — auto-picks edge and corner tiles as you paint`"
                    @click="brush = `terrain:${t.id}`"
                >
                  <span class="icon icon-auto-fix"/>
                  <span class="tm-terrain-label">{{ t.name }}</span>
                </button>
                <button
                    v-for="vg in (paletteMode === 'tiles' ? variantGroups : [])"
                    :key="vg.id"
                    class="tm-tile tm-terrain"
                    :class="{active: brush === `random:${vg.id}`}"
                    :title="`Random brush: ${vg.name} — each stroke places a random tile from this group`"
                    @click="brush = `random:${vg.id}`"
                >
                  <span class="icon icon-swap"/>
                  <span class="tm-terrain-label">{{ vg.name }}</span>
                </button>
                <button
                    v-for="it in paletteItems"
                    :key="it.id"
                    class="tm-tile"
                    :class="{active: brush === it.id}"
                    :title="it.name || 'Tile'"
                    @click="brush = it.id as number"
                >
                  <img :src="tileSrc(it)" :alt="it.name || 'Tile'" loading="lazy"/>
                </button>
              </template>
            </div>
          </div>
        </div>
        </div>
    </template>
    <Widget title="More tools" class="tool-more">
      <ToolPaths exclude="tilemap"/>
    </Widget>

    <ToolReadme>
      <h1>Tilemap Editor</h1>
      <p>
        Paint pixel-art maps on a grid or isometric grid. Stack layers of ground tiles and sprites
        from your own collection — or any artwork in the gallery — then save your map.
        Free, runs in your browser.
      </p>

      <h2>Build pixel-art tilemaps, free in your browser</h2>
      <p>
        The <strong>Tilemap Editor</strong> turns pixel art into maps. Lay tiles on a flat
        <strong>grid</strong> for top-down scenes or an <strong>isometric</strong> grid for a 3/4 view,
        stack as many <strong>layers</strong> as you need, and paint with your own
        <nuxt-link to="/work?tab=collections">collection</nuxt-link> or any piece from the
        <nuxt-link to="/arts">gallery</nuxt-link>. No install and no signup to start — your map saves to a
        collection or right in your browser.
      </p>

      <h2>How it works</h2>
      <ol>
        <li><strong>Pick your tiles</strong> — choose a collection as your palette, or stay in Free style and search any public pixel art to paint with.</li>
        <li><strong>Set up the map</strong> — switch between grid and isometric, set the cell size and the number of columns and rows, and pick a background.</li>
        <li><strong>Paint your layers</strong> — add ground and sprite layers, then click and drag to lay tiles. Reorder, hide or clear any layer anytime.</li>
      </ol>
      <QnA :items="faq"/>
    </ToolReadme>

    <UiModal v-if="sizeOpen" class="tm-settings-modal" @close="sizeOpen = false">
          <h3 class="publish-heading">Map settings</h3>
          <div class="tm-settings-body">
            <div class="tm-group">
              <span class="tm-label">Grid type</span>
              <div class="tm-seg">
                <button :class="{active: config.mode === 'grid'}" @click="setMode('grid')"><span class="icon icon-grid"/> Grid</button>
                <button :class="{active: config.mode === 'iso'}" @click="setMode('iso')"><span class="icon icon-rhombus"/> Iso</button>
              </div>
              <div v-if="config.mode === 'iso'" class="tm-num tm-iso-ratio">
                <span class="tm-num-cap">View ratio <em>(W:H)</em></span>
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
              <span class="tm-label">Cell size <em>{{ cellLabel }}px</em></span>
              <div class="tm-chips">
                <button v-for="p in CELL_PRESETS" :key="p" :class="{active: config.cellW === p && (config.mode === 'iso' || config.cellH === p)}" @click="setCell(p)">{{ p }}</button>
              </div>
              <div class="tm-dims" :class="{'tm-dims-one': config.mode === 'iso'}">
                <div class="tm-num">
                  <span class="tm-num-cap">{{ config.mode === 'iso' ? 'Tile width' : 'Width' }}</span>
                  <input
                      type="number" class="tm-cell-input" inputmode="numeric"
                      :min="MIN_CELL" :max="MAX_CELL" :value="config.cellW"
                      aria-label="Cell width (px)"
                      @change="setCellDim('cellW', ($event.target as HTMLInputElement).valueAsNumber)"
                  >
                </div>
                <div v-if="config.mode === 'grid'" class="tm-num">
                  <span class="tm-num-cap">Height</span>
                  <input
                      type="number" class="tm-cell-input" inputmode="numeric"
                      :min="MIN_CELL" :max="MAX_CELL" :value="config.cellH"
                      aria-label="Cell height (px)"
                      @change="setCellDim('cellH', ($event.target as HTMLInputElement).valueAsNumber)"
                  >
                </div>
              </div>
            </div>
            <div class="tm-group">
              <span class="tm-label">Map size</span>
              <div class="tm-dims">
                <div class="tm-num">
                  <span class="tm-num-cap">Cols</span>
                  <div class="tm-num-ctl">
                    <button aria-label="Fewer columns" @click="changeDim('cols', -1)">−</button>
                    <span>{{ config.cols }}</span>
                    <button aria-label="More columns" @click="changeDim('cols', 1)">+</button>
                  </div>
                </div>
                <div class="tm-num">
                  <span class="tm-num-cap">Rows</span>
                  <div class="tm-num-ctl">
                    <button aria-label="Fewer rows" @click="changeDim('rows', -1)">−</button>
                    <span>{{ config.rows }}</span>
                    <button aria-label="More rows" @click="changeDim('rows', 1)">+</button>
                  </div>
                </div>
              </div>
            </div>
            <div class="tm-group">
              <span class="tm-label">Variant seed <em>{{ config.seed ? config.seed : 'random' }}</em></span>
              <div class="tm-dims tm-dims-one">
                <div class="tm-num">
                  <span class="tm-num-cap">0 = true random; a seed makes variant picks repeatable per cell</span>
                  <input
                      type="number" class="tm-cell-input" inputmode="numeric"
                      min="0" max="999999" :value="config.seed"
                      aria-label="Variant seed (0 = random)"
                      @change="setSeed(($event.target as HTMLInputElement).valueAsNumber)"
                  >
                </div>
              </div>
            </div>
            <div class="tm-group">
              <span class="tm-label">Background</span>
              <div class="tm-bg-opts">
                <button class="tm-bg-opt" :class="{active: !config.bg}" @click="setBg('')">
                  <span class="tm-bg-sw checker"/>
                  <span>Transparent</span>
                </button>
                <label class="tm-bg-row2">
                  <input
                      type="color"
                      class="tm-bg-color-input"
                      :value="config.bg || '#1b1b2e'"
                      @input="setBg(($event.target as HTMLInputElement).value)"
                  />
                  <span class="tm-bg-hex">{{ config.bg ? config.bg.toUpperCase() : 'None' }}</span>
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
            <button class="btn primary block" @click="sizeOpen = false">Done</button>
          </div>
      </UiModal>

    <EditorLoadBrowser
        v-if="showLoadTm"
        title="Load tilemap"
        :items="browseTilemaps"
        filterable
        folder
        empty-icon="icon-grid"
        :new-label="world ? 'New world' : 'New map'"
        empty-text="No tilemaps yet — paint one to get started."
        @select="pickTilemap"
        @create="pickTilemap('__new__')"
        @close="showLoadTm = false"
    />
  </div>
</template>

<style scoped>
.tm-page { display: flex; flex-direction: column; gap: var(--space-3); }

.tm-page > .tool-more { margin-top: calc(var(--space-3) * -1 - 1px); }

.tm-editor, .tm-skeleton { touch-action: pan-x pan-y; }

.tm-editor { display: flex; flex-direction: column; gap: 0; }

.tm-palette-seg button { flex: 1; }

.tm-terrain {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
}

.tm-terrain .icon { width: 14px; height: 14px; color: var(--primary); }

.tm-terrain-label {
  font-size: 8px;
  font-weight: 700;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--muted);
}

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
.tm-island-head {
  display: flex; align-items: center; gap: var(--space-2);
  padding: 0.1rem 0.2rem; cursor: pointer; user-select: none;
  font-size: var(--text-2xs); font-weight: 700; letter-spacing: 0.06em;
  text-transform: uppercase; color: var(--muted);
}
.tm-island-title { white-space: nowrap; }
.tm-island-title em { font-style: normal; color: var(--foreground); font-weight: 600; letter-spacing: 0; }
.tm-island-head .tm-layer-add { margin-left: auto; }
.tm-island-caret { width: 12px; height: 12px; flex: none; margin-left: var(--space-1); }
.tm-island:not(.open) .tm-island-caret { margin-left: var(--space-2); }
.tm-island .tm-layers { background: var(--surface); }

.tm-chips { display: grid; grid-template-columns: repeat(5, 1fr); gap: 0.3rem; }
.tm-chips button {
  height: var(--tm-ctl); padding: 0; border: 1px solid var(--border);
  background: transparent; border-radius: var(--radius-sm); cursor: pointer;
  font-size: var(--text-xs); font-weight: 600; color: var(--foreground);
  transition: border-color var(--transition), color var(--transition), background var(--transition);
}

.tm-chips button.active { border-color: transparent; color: var(--primary); background: color-mix(in oklab, var(--primary) 14%, var(--surface)); }

.tm-cell-input {
  width: 100%; height: var(--tm-ctl); padding: 0 0.5rem; box-sizing: border-box;
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
.tm-num-cap { font-size: 10px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); }
.tm-num-ctl {
  display: grid; grid-template-columns: var(--tm-ctl) 1fr var(--tm-ctl); align-items: center;
  height: var(--tm-ctl); border: 1px solid var(--border); border-radius: var(--radius-sm);
  overflow: hidden; background: transparent;
}
.tm-num-ctl button {
  height: 100%; border: 0; background: transparent; cursor: pointer; font-size: 1rem; color: var(--muted);
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
  display: flex; align-items: center; gap: var(--space-3); width: 100%; padding: 0.4rem 0.5rem;
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

.tm-hint { font-size: var(--text-xs); line-height: 1.5; color: var(--muted); margin: 0; }

.tm-layers {
  display: flex; flex-direction: column; gap: 2px;

  max-height: 106px; overflow-y: auto;
  border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 3px;
}
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
  flex: 1; min-width: 0; height: 22px; padding: 0 4px;
  border: 1px solid var(--primary); border-radius: var(--radius-sm); background: var(--surface);
  font-weight: 600; font-size: var(--text-xs); color: var(--foreground); outline: none;
}
.tm-layer-count { font-size: 10px; color: var(--muted); flex: none; }

.tm-layer-add {
  display: inline-flex; align-items: center; gap: 0.2rem; height: 22px; padding: 0 0.55rem;
  border: 1px solid var(--border); background: transparent; border-radius: var(--radius-pill);
  cursor: pointer; font-size: 10px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase;
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
.tm-la-btn .icon { width: 12px; height: 12px; }
.tm-la-btn:hover:not(:disabled) { background: var(--surface-2); color: var(--foreground); }
.tm-la-btn:disabled { opacity: 0.3; cursor: default; }
.tm-la-btn.danger:hover:not(:disabled) { color: #ef4444; }

.tm-tilesbar {
  --tm-ctl: 34px;
  display: flex; flex-direction: column; gap: 0.5rem;
  padding: 0.625rem 0.875rem 0.875rem;
  border-top: 1px solid var(--border);
}
.tm-tilesbar-ctl { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; }
.tm-tilesbar-ctl .tm-search { flex: 1; min-width: 160px; margin-bottom: 0; }

.tm-tiles { max-height: 138px; min-height: 0; overflow-y: auto; }
.tm-tiles-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(48px, 1fr));
  gap: var(--space-2); align-content: start; padding: 2px;
}
.tm-tiles-empty { grid-column: 1 / -1; }

.tm-pager { display: flex; align-items: center; gap: var(--space-1); flex: none; margin-left: auto; }
.tm-pager-btn {
  width: var(--tm-ctl, 34px); height: var(--tm-ctl, 34px);
  display: inline-flex; align-items: center; justify-content: center;
  border: 1px solid var(--border); background: transparent; border-radius: var(--radius-sm);
  cursor: pointer; color: var(--foreground);
}
.tm-pager-btn .icon { width: 12px; height: 12px; }
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

  .tm-cell-input, .tm-search input, .tm-layer-input { font-size: 16px; }
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

.tm-skeleton { display: flex; flex-direction: column; gap: var(--space-3); }
.skel {
  background: linear-gradient(90deg,
      var(--surface-2) 25%,
      color-mix(in oklab, var(--surface-2) 45%, var(--surface)) 37%,
      var(--surface-2) 63%);
  background-size: 400% 100%;
  animation: tm-shimmer 1.4s ease infinite;
  border-radius: var(--radius-sm);
}
@keyframes tm-shimmer { 0% { background-position: 100% 0; } 100% { background-position: 0 0; } }
.skel-controls { width: 100%; height: 48px; }
.skel-board { width: min(520px, 100%); aspect-ratio: 1; border-radius: var(--radius-sm); }
</style>

<style>

.tm-settings-modal { --tm-ctl: 34px; }
</style>
