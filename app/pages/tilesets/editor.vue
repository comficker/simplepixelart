<script setup lang="ts">
import {toast} from 'vue-sonner'
import type {EditorData, SharedPage} from '~/types'
import {tileImageUrl} from '~/helper/tilemap'
import {type Terrain, type TerrainRelations, type TerrainType, slotSides, terrainMask} from '~/helper/autotile'
import {type SheetSource, buildSheet, layoutGroup, sheetColumns, terrainGridNOf, terrainSlotsOf, tileCells as cellsOf} from '~/helper/sheet-layout'
import {type EngineSheet, buildGodotTileSet, buildTiledTileset} from '~/helper/engine-export'
import {createZip} from '~/helper/zip'
import {cloneDeep, debounce, generateUUID, pruneStorageKeys} from '~/helper/utils'
import {layers2MapNumbers} from '~/helper/canvas'
import {DEFAULT_EDITOR_DATA} from '~/helper/constants'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const apiBase = useRuntimeConfig().public.api as string

useCustomSeoMeta({
  title: 'Tileset Editor — Build Tilesets & Auto-Tile Terrains Online',
  description: 'Free online tileset builder. Curate pixel-art tiles into groups, auto-generate Wang 16 and blob 47 terrain sets from one base tile, define terrain relations and weighted variants, then export a Godot 4 TileSet, a Tiled tileset or PNG + JSON.',
  keywords: 'tileset editor, tileset maker, autotile generator, wang tiles, blob tileset, terrain tileset, pixel art tileset builder, godot tileset export, tiled tsx export, tileset png export, 2d game tileset tool, auto tiling',
  canonical: 'https://simplepixelart.com/tilesets/editor',
  // The bare tool is the landing page we want indexed. Per-tileset views
  // (?id=…) target private data, so they're noindex; the canonical
  // consolidates every variant back to /tilesets/editor.
  robots: () => route.query.id ? 'noindex, follow' : 'index, follow',
  script: [
    {
      type: 'application/ld+json',
      innerHTML: JSON.stringify({
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'SoftwareApplication',
            name: 'Tileset Editor',
            description: 'Free browser tool to build pixel-art tilesets: curate tiles into groups, auto-generate Wang 16 / blob 47 terrain sets, and export a ready-to-use Godot 4 TileSet or Tiled tileset.',
            url: 'https://simplepixelart.com/tilesets/editor',
            applicationCategory: 'GraphicsApplication',
            operatingSystem: 'Any (browser-based)',
            offers: {'@type': 'Offer', price: '0', priceCurrency: 'USD'},
            featureList: [
              'Curate any public pixel art or your own drawings into a tileset',
              'Groups for characters, props and decor on a free infinite board',
              'Wang 16 and blob 47 auto-tile terrains',
              'Build Borders: generate every edge and corner variant from one base tile',
              'Terrain relations — seamless merges, transitions and priorities',
              'Random variant groups with per-tile weights',
              'Export a Godot 4 TileSet (.tres) with the terrain sets already wired up',
              'Export a Tiled tileset (.tsx) with terrains as Wang sets',
              'Export as packed PNG sheet + JSON for any other engine',
              'Paint worlds with your tileset in the tilemap editor',
            ],
            publisher: {'@type': 'Organization', name: 'SimplePixelArt.com', url: 'https://simplepixelart.com/'},
          },
          {
            '@type': 'HowTo',
            name: 'How to build a pixel-art tileset with auto-tile terrains',
            description: 'Assemble a game-ready tileset online in three steps — no install needed.',
            totalTime: 'PT5M',
            tool: [{'@type': 'HowToTool', name: 'Tileset Editor (web browser)'}],
            step: [
              {'@type': 'HowToStep', name: 'Collect tiles', text: 'Add tiles from your own pixel art or search any public art on SimplePixelArt, set the base cell size, and arrange tiles into groups on the board.'},
              {'@type': 'HowToStep', name: 'Generate terrains', text: 'Add a terrain, drop a base tile on the center slot or open Build Borders — the editor composes all 16 (or 47) edge and corner variants automatically.'},
              {'@type': 'HowToStep', name: 'Save and use it', text: 'Save the tileset, download it as a PNG sheet + JSON, or open the tilemap editor and paint worlds with terrain-aware brushes.'},
            ],
          },
          {
            '@type': 'FAQPage',
            mainEntity: [
              {'@type': 'Question', name: 'Is the Tileset Editor free?', acceptedAnswer: {'@type': 'Answer', text: 'Yes. It is completely free and runs in your browser. You can start building right away; sign in only when you want to save the tileset to your account.'}},
              {'@type': 'Question', name: 'What is auto-tiling (Wang 16 / blob 47)?', acceptedAnswer: {'@type': 'Answer', text: 'Auto-tiling picks the right edge or corner tile for you while painting. Wang 16 covers the 16 edge combinations and suits top-down maps; blob 47 adds corner awareness for the 47 canonical shapes, ideal for platformers.'}},
              {'@type': 'Question', name: 'Do I have to draw all 47 border tiles myself?', acceptedAnswer: {'@type': 'Answer', text: 'No. Build Borders generates every variant from a single base tile — either auto-shaded, or composed from your own edge and corner art, with optional per-side overrides and variations.'}},
              {'@type': 'Question', name: 'How do terrains connect to each other?', acceptedAnswer: {'@type': 'Answer', text: 'Each terrain can declare which terrains it connects to and a priority. Connected terrains at equal priority merge seamlessly; a higher-priority terrain draws its transition edge over the lower one; unrelated terrains keep a hard boundary.'}},
              {'@type': 'Question', name: 'Can I export the tileset to my game engine?', acceptedAnswer: {'@type': 'Answer', text: 'Yes. Export a Godot 4 TileSet (.tres) with the atlas and terrain sets already filled in, or a Tiled tileset (.tsx) with each terrain as a Wang set — both ship with the packed PNG, ready to drop into your project. A plain PNG + JSON export covers Unity, Phaser and custom engines.'}},
              {'@type': 'Question', name: 'Where do the tiles come from?', acceptedAnswer: {'@type': 'Answer', text: 'From any public pixel art on SimplePixelArt or your own drawings made in the pixel art editor. Each tile stays a live link to its art — edit the art and the tileset updates.'}},
            ],
          },
          {
            '@type': 'BreadcrumbList',
            itemListElement: [
              {'@type': 'ListItem', position: 1, name: 'Home', item: 'https://simplepixelart.com/'},
              {'@type': 'ListItem', position: 2, name: 'Tileset Editor', item: 'https://simplepixelart.com/tilesets/editor'},
            ],
          },
        ],
      }),
    },
  ],
})

// ── Current tileset ─────────────────────────────────────────────────
// Tiles live in the flat registry (id -> id_string); groups arrange them in
// the workspace (character / decor / ...). A terrain is a special group:
// instead of a free tile list it has the 16 auto-tile connection slots.
interface TileGroup {
  id: string
  name: string
  kind: 'group' | 'terrain'
  tiles: number[]                    // plain groups: member tile ids
  // Free per-tile position inside the group (native px, cell-snapped).
  // Tiles without an entry auto-pack; dragging a tile pins it here.
  pos?: Record<string, { x: number; y: number }>
  // Plain groups: painting with this group in the tilemap picks a random tile.
  random?: boolean
  // Optional per-tile weights for the random pick (default 1).
  weights?: Record<string, number>
  map?: Record<string, number>       // terrain groups: mask -> tile id
  type?: TerrainType                 // terrain groups: wang16 (default) | blob47
  builder?: any                      // terrain groups: Build-borders recipe
  // Terrain groups: which other terrains this one merges with / runs under,
  // and its priority at boundaries (see TerrainRelations in autotile.ts).
  relations?: TerrainRelations
  x?: number                         // free position on the board (native px)
  y?: number
}

function terrainSlots(g: TileGroup) {
  return terrainSlotsOf(g.type)
}

function terrainGridN(g: TileGroup) {
  return terrainGridNOf(g.type)
}

interface TilesetRow {
  id: number
  id_string: string
  name: string
  status: string
  registry: Record<string, string>
  groups: TileGroup[]
  cell: { w: number; h: number }
  iso: boolean          // tiles are isometric diamonds → tilemap opens in iso mode
  worlds: { id_string: string; name: string; status: string }[]
  // Set when this is a guest local-library tileset (edits + save stay local).
  localId?: string
}

function cleanMap(raw: any, registry: Record<string, string>): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [m, id] of Object.entries(raw && typeof raw === 'object' ? raw : {})) {
    if (registry[String(id)]) out[m] = Number(id)
  }
  return out
}

// Normalize stored groups against the registry: drop unknown/duplicate ids,
// lift legacy meta.terrains into terrain groups, sweep unassigned tiles into
// the first plain group, always keep at least one plain group.
function normGroups(rawGroups: any, rawTerrains: any, registry: Record<string, string>): TileGroup[] {
  const seen = new Set<number>()
  const groups: TileGroup[] = (Array.isArray(rawGroups) ? rawGroups : []).map((g: any, i: number) => {
    const kind = g?.kind === 'terrain' ? 'terrain' as const : 'group' as const
    return {
      id: String(g?.id || `g${i}`),
      name: String(g?.name || (kind === 'terrain' ? 'Terrain' : 'Group')),
      kind,
      tiles: kind === 'group'
          ? (Array.isArray(g?.tiles) ? g.tiles : [])
              .map(Number)
              .filter((id: number) => registry[String(id)] && !seen.has(id) && (seen.add(id), true))
          : [],
      ...(kind === 'terrain'
          ? {
            map: cleanMap(g?.map, registry),
            type: (g?.type === 'blob47' ? 'blob47' : 'wang16') as TerrainType,
            ...(g?.builder ? {builder: g.builder} : {}),
            ...(g?.relations && (Array.isArray(g.relations.connects) || g.relations.priority)
                ? {
                  relations: {
                    connects: (Array.isArray(g.relations.connects) ? g.relations.connects : []).map(String),
                    priority: Number(g.relations.priority) || 0,
                  },
                }
                : {}),
          }
          : {}),
      ...(kind === 'group' && g?.random ? {random: true} : {}),
      ...(kind === 'group' && g?.weights && typeof g.weights === 'object'
          ? {
            weights: Object.fromEntries(Object.entries(g.weights)
                .filter(([id, w]: [string, any]) => registry[id] && Number(w) > 1)
                .map(([id, w]: [string, any]) => [id, Math.min(9, Math.round(Number(w)))])),
          }
          : {}),
      ...(g?.pos && typeof g.pos === 'object'
          ? {
            pos: Object.fromEntries(Object.entries(g.pos)
                .filter(([id, p]: [string, any]) => registry[id] && Number.isFinite(+p?.x) && Number.isFinite(+p?.y))
                .map(([id, p]: [string, any]) => [id, {x: +p.x, y: +p.y}])),
          }
          : {}),
      ...(Number.isFinite(+g?.x) && Number.isFinite(+g?.y) ? {x: +g.x, y: +g.y} : {}),
    }
  })
  for (const tr of (Array.isArray(rawTerrains) ? rawTerrains : [])) {
    if (tr?.id && !groups.some(g => g.id === String(tr.id))) {
      groups.push({id: String(tr.id), name: String(tr.name || 'Terrain'), kind: 'terrain', tiles: [], map: cleanMap(tr.map, registry)})
    }
  }
  if (!groups.some(g => g.kind === 'group')) {
    groups.unshift({id: 'g0', name: 'Tiles', kind: 'group', tiles: []})
  }
  // Sweep unassigned tiles into the first plain group — except tiles that
  // only live in terrain slots (e.g. generated border pieces).
  const inTerrain = new Set<number>()
  for (const g of groups) {
    if (g.kind === 'terrain') for (const id of Object.values(g.map || {})) inTerrain.add(Number(id))
  }
  const first = groups.find(g => g.kind === 'group')!
  first.tiles.push(...Object.keys(registry).map(Number).filter(id => !seen.has(id) && !inTerrain.has(id)))
  // Relations may reference terrains that no longer exist — prune them.
  const terrainIds = new Set(groups.filter(g => g.kind === 'terrain').map(g => g.id))
  for (const g of groups) {
    if (!g.relations) continue
    g.relations.connects = g.relations.connects.filter(id => terrainIds.has(id) && id !== g.id)
    if (!g.relations.connects.length && !g.relations.priority) delete g.relations
  }
  return groups
}

const CELL_CHOICES = [8, 16, 24, 32, 48, 64]

// Starts as a local blank draft so the FULL editor chrome server-renders
// (only the canvas is client-only); onMounted swaps in ?id / the user's
// latest tileset. blankTileset() is hoisted — declared further down.
const tileset = ref<TilesetRow | null>(blankTileset())
const myTilesets = ref<any[]>([])
const saving = ref(false)
const dirty = ref(false)
const showSettings = ref(false)

// ── Board display: background + grid, mirroring the art editor's Canvas
// settings. View prefs persisted in tileset.meta.board so they travel with it.
const BOARD_PRESETS = [
  {name: 'Charcoal', color: '#1b1b1f'},
  {name: 'Slate', color: '#26272b'},
  {name: 'Paper', color: '#f5f5f4'},
  {name: 'White', color: '#ffffff'},
]
const BOARD_GRID_STEPS = [1, 2, 4]              // grid line every N base cells
const boardBg = ref('#1b1b1f')
const boardGrid = ref(true)
const boardGridStep = ref(1)
const boardGridStyle = ref<'solid' | 'dashed' | 'dots'>('solid')
// Group headers (name + count) drawn above each group on the canvas — a view
// preference from Settings; persisted separately, loaded in onMounted.
const showBoardChrome = ref(true)
function toggleBoardChrome() {
  showBoardChrome.value = !showBoardChrome.value
  try { localStorage.setItem('tsx_board_chrome', showBoardChrome.value ? '1' : '0') } catch { /* quota */ }
  scheduleDraw()
}
const showCanvasModal = ref(false)

// Grid line/dot color that stays visible against the chosen background.
function boardIsLight(): boolean {
  const h = boardBg.value.replace('#', '')
  if (h.length < 6) return false
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16)
  return (0.299 * r + 0.587 * g + 0.114 * b) > 140
}

function applyBoardMeta(board: any) {
  boardBg.value = typeof board?.bg === 'string' ? board.bg : '#1b1b1f'
  boardGrid.value = board?.grid !== false
  boardGridStep.value = BOARD_GRID_STEPS.includes(board?.gridStep) ? board.gridStep : 1
  boardGridStyle.value = ['solid', 'dashed', 'dots'].includes(board?.gridStyle) ? board.gridStyle : 'solid'
}

// A board display change is a view pref: mark dirty (so Save keeps it) + repaint.
function onBoardChange() {
  dirty.value = true
  scheduleDraw()
}

// ── Local view state: zoom + camera + board display persist per tileset so a
// reload (F5) restores the exact view — even before the tileset is saved to
// the backend (which is the only thing meta.board captures).
const viewKey = () => `tsx_view:${tileset.value?.id_string || 'draft'}`

function saveViewState() {
  if (import.meta.server) return
  try {
    localStorage.setItem(viewKey(), JSON.stringify({
      t: Date.now(),
      zoom: zoom.value,
      cam: {x: cam.value.x, y: cam.value.y},
      board: {bg: boardBg.value, grid: boardGrid.value, gridStep: boardGridStep.value, gridStyle: boardGridStyle.value},
    }))
  } catch { /* storage unavailable / quota — ignore */ }
}
const saveViewSoon = debounce(saveViewState, 400)

// Apply a saved view over the just-loaded defaults. Returns true when zoom/cam
// were restored, so the caller skips its default zoom + fit-to-view.
function restoreViewState(): boolean {
  if (import.meta.server) return false
  try {
    const raw = localStorage.getItem(viewKey())
    if (!raw) return false
    const v = JSON.parse(raw)
    if (v?.board) applyBoardMeta(v.board)
    let ok = false
    if (typeof v?.zoom === 'number') { zoom.value = Math.max(ZMIN, Math.min(ZMAX, v.zoom)); ok = true }
    if (v?.cam && typeof v.cam.x === 'number' && typeof v.cam.y === 'number') { cam.value = {x: v.cam.x, y: v.cam.y}; ok = true }
    return ok
  } catch { return false }
}

const tiles = computed(() =>
    tileset.value
        ? Object.entries(tileset.value.registry).map(([id, id_string]) => ({id: Number(id), id_string}))
        : [],
)

// Guest local-library tiles have no cloud slug — the editor renders them from
// their stored thumbnails, keyed by the tile's ed.id (used as the "slug").
const localTs = useLocalTilesets()
const localThumbs = new Map<string, string>()
// Bumped by "Refresh" to cache-bust tile PNGs after art is edited elsewhere.
const refreshToken = ref(0)

function tileSrc(idString: string) {
  const local = localThumbs.get(idString)
  if (local) return local
  const url = tileImageUrl(apiBase, idString)
  return refreshToken.value ? `${url}${url.includes('?') ? '&' : '?'}v=${refreshToken.value}` : url
}

// Reload all tile art (e.g. after editing it in the pixel editor in another tab).
function refreshArt() {
  refreshToken.value++
  // Guest tileset: tiles render from stored dataURLs, so cache-busting a URL
  // does nothing — re-read the (possibly edited, possibly cross-tab) thumbnails
  // from the local library instead.
  const lid = tileset.value?.localId
  if (lid) {
    localTs.reload()
    const m = localTs.editorModel(lid)
    if (m) {
      localThumbs.clear()
      for (const [slug, thumb] of Object.entries(m.thumbs)) localThumbs.set(slug, thumb)
    }
  }
  imgCache.clear()
  scheduleDraw()
  syncBuilders()
  toast.success('Tiles refreshed')
}

async function fetchMyTilesets() {
  if (!auth.isLogged) return
  try {
    const res = await useNativeFetch<any>('/coloring/tilesets/', {params: {page_size: 100}})
    myTilesets.value = Array.isArray(res?.results) ? res.results : []
  } catch {
    myTilesets.value = []
  }
}

// Open a guest local-library tileset (from /work). Tiles render from their
// stored thumbnails; edits + Save write back to the local library, not cloud.
function loadLocalLibTileset(id: string): boolean {
  const m = localTs.editorModel(id)
  if (!m) return false
  localThumbs.clear()
  for (const [slug, thumb] of Object.entries(m.thumbs)) localThumbs.set(slug, thumb)
  imgCache.clear()   // re-render tiles from the fresh local thumbnails
  tileset.value = {
    id: 0, id_string: id, name: m.name, status: 'draft',
    registry: {...m.registry},
    cell: {w: Number(m.cell?.w) || 16, h: Number(m.cell?.h) || 16},
    iso: !!m.iso,
    groups: normGroups(m.groups, [], m.registry),
    worlds: [],
    localId: id,
  }
  applyBoardMeta(m.board)
  selectedTileId.value = null
  selectedGroupId.value = null
  pendingBuilds.clear()
  // Restore unsaved border-build previews (composed variants → canvases).
  for (const [gid, p] of Object.entries<any>(m.pends || {})) {
    const variants = new Map<number, { colors: string[]; map: Record<string, number> }>(
        Object.entries(p.variants || {}).map(([mk, v]) => [Number(mk), v as any]))
    const canvases = new Map<number, HTMLCanvasElement>()
    for (const [mask, composed] of variants) canvases.set(mask, renderComposedCanvas(composed))
    pendingBuilds.set(gid, {recipe: p.recipe, variants, canvases})
  }
  tsUndo.length = 0
  tsRedo.length = 0
  syncHistory()
  const restored = restoreViewState()
  if (!restored) zoom.value = autoZoom(tileset.value.cell.w)
  if (tileset.value.groups.some(g => g.x == null || g.y == null)) autoArrange(false)
  dirty.value = false
  if (!restored) nextTick(fitView)
  router.replace({query: {id}})
  return true
}

async function loadTileset(slug: string) {
  // Guest local-library tilesets are addressed by their 'local:<uuid>' id.
  if (slug.startsWith('local:')) {
    if (!loadLocalLibTileset(slug)) { toast.error('Could not open that tileset'); openBlank() }
    return
  }
  try {
    const t = await useNativeFetch<any>(`/coloring/tilesets/${slug}/`)
    const meta = t.meta || {}
    tileset.value = {
      id: t.id, id_string: t.id_string, name: t.name || 'Untitled',
      status: t.status,
      registry: {...(meta.registry || {})},
      cell: {
        w: Number(meta.cell?.w) || 32,
        h: Number(meta.cell?.h) || Number(meta.cell?.w) || 32,
      },
      iso: !!meta.iso,
      groups: normGroups(meta.groups, meta.terrains, meta.registry || {}),
      worlds: Array.isArray(t.worlds) ? t.worlds : [],
    }
    applyBoardMeta(meta.board)
    selectedTileId.value = null
    selectedGroupId.value = null
    pendingBuilds.clear()   // unsaved previews don't survive a switch
    tsUndo.length = 0
    tsRedo.length = 0
    syncHistory()
    // Restore the last local view (zoom/cam/grid) for this tileset; fall back to
    // a sensible default zoom + fit when there's nothing saved.
    const restored = restoreViewState()
    if (!restored) zoom.value = autoZoom(tileset.value.cell.w)
    // Legacy tilesets have no board positions yet — lay them out once.
    if (tileset.value.groups.some(g => g.x == null || g.y == null)) autoArrange(false)
    dirty.value = false
    if (!restored) nextTick(fitView)
    // Fire-and-forget: regenerate terrains whose base art changed since build.
    syncBuilders()
    router.replace({query: {id: t.id_string}})
  } catch {
    toast.error('Could not load that tileset')
  }
}

async function onTilesetSelect(v: string) {
  if (v === '__new__') {
    await createTileset()
    showSettings.value = true
  } else if (v && v !== tileset.value?.id_string) {
    loadTileset(v)
  }
}

// ── Load-tileset browser modal ──────────────────────────────────────
// Signed in → the account's cloud tilesets; guest → the local library.
const showLoad = ref(false)
const browseTilesets = computed(() => {
  if (auth.isLogged) {
    return myTilesets.value.map((t: any) => ({
      id: t.id_string, name: t.name || 'Untitled', status: t.status, updated: t.updated,
      previewImgs: Object.values(t.meta?.registry || {}).slice(0, 4).map(s => tileImageUrl(apiBase, s as string)),
    }))
  }
  return localTs.list.value.map(t => ({
    id: t.id, name: t.name || 'Untitled', status: 'draft', updated: new Date(t.created || 0).toISOString(),
    previewImgs: t.tiles.slice(0, 4).map(x => x.thumb),
  }))
})

function openLoad() {
  if (auth.isLogged) fetchMyTilesets()
  showLoad.value = true
}

function pickLoad(idString: string) {
  showLoad.value = false
  onTilesetSelect(idString)
}

// A local, unsaved draft — the editor always opens with SOMETHING to edit.
// It becomes a real backend row on first Save (or first create when logged in).
function blankTileset(): TilesetRow {
  return {
    id: 0,
    id_string: '',
    name: 'My tileset',
    status: 'draft',
    registry: {},
    groups: [{id: 'g0', name: 'Tiles', kind: 'group', tiles: []}],
    cell: {w: 32, h: 32},
    iso: false,
    worlds: [],
  }
}

function openBlank() {
  tileset.value = blankTileset()
  applyBoardMeta(null)
  selectedTileIds.value = []
  selectedGroupId.value = null
  pendingBuilds.clear()
  tsUndo.length = 0
  tsRedo.length = 0
  syncHistory()
  const restored = restoreViewState()
  if (!restored) zoom.value = autoZoom(32)
  dirty.value = false
  if (!restored) nextTick(fitView)
  router.replace({query: {}})
}

// ── Guest tilesets ──────────────────────────────────────────────────
// Signed out, a tileset lives in the SHARED local library (sp_local_tilesets)
// — the same store /work, the slicer and the editor strip use — so every
// tileset is managed together. No separate one-off draft.
function serializePends(): Record<string, any> {
  const pends: Record<string, any> = {}
  for (const [gid, p] of pendingBuilds) {
    pends[gid] = {recipe: p.recipe, variants: Object.fromEntries([...p.variants].map(([m, v]) => [String(m), v]))}
  }
  return pends
}

// Persist the whole editor state to the guest's library entry. A blank tileset
// materialises only once it has tiles, so /work never fills with empties.
function saveLibState() {
  if (!tileset.value) return
  let id = tileset.value.localId
  if (!id) {
    if (!Object.keys(tileset.value.registry).length) return
    const entry = localTs.create(tileset.value.name || 'Untitled')
    id = entry.id
    tileset.value.localId = id
    tileset.value.id_string = id
    router.replace({query: {id}})
  }
  localTs.saveEditorModel(id, {
    name: tileset.value.name,
    registry: tileset.value.registry,
    groups: tileset.value.groups,
    cell: tileset.value.cell,
    iso: tileset.value.iso,
    board: {bg: boardBg.value, grid: boardGrid.value, gridStep: boardGridStep.value, gridStyle: boardGridStyle.value},
    pends: serializePends(),
  })
}
const debouncedLibSave = debounce(saveLibState, 600)
function autosaveLocal() { debouncedLibSave() }

// One-time migration: fold the legacy single draft into a library entry.
function migrateLegacyDraft(): string | null {
  if (typeof localStorage === 'undefined') return null
  let saved: any = null
  try { saved = JSON.parse(localStorage.getItem('spa_tileset_draft_v1') || 'null') } catch { /* ignore */ }
  try { localStorage.removeItem('spa_tileset_draft_v1') } catch { /* ignore */ }
  const reg = saved?.tileset?.registry
  if (!reg || !Object.keys(reg).length) return null
  const entry = localTs.create(saved.tileset.name || 'My tileset')
  localTs.saveEditorModel(entry.id, {
    registry: reg,
    groups: Array.isArray(saved.tileset.groups) ? saved.tileset.groups : undefined,
    cell: saved.tileset.cell,
    board: saved.board,
    pends: saved.pends,
  })
  return entry.id
}

// Guest open: migrate any legacy draft, then open the newest library tileset,
// else a fresh blank (which becomes a library entry once it has tiles).
function openGuestTileset() {
  const migrated = migrateLegacyDraft()
  if (migrated) { loadLocalLibTileset(migrated); return }
  if (localTs.list.value.length) { loadLocalLibTileset(localTs.list.value[0]!.id); return }
  openBlank()
}

// Guest edits autosave to the draft (mirrors the tilemap's free style).
// Signed in, the source short-circuits to '' so the whole-tileset
// JSON.stringify never runs — it only pays off for guests.
watch(() => (!auth.isLogged && tileset.value) ? JSON.stringify(tileset.value) : '', () => {
  if (!auth.isLogged && dirty.value) autosaveLocal()
})

async function createTileset() {
  // Signed out → a new entry in the local library (so it shows in /work).
  if (!auth.isLogged) {
    const entry = localTs.create('My tileset')
    loadLocalLibTileset(entry.id)
    return
  }
  try {
    const t = await useNativeFetch<any>('/coloring/tilesets/', {
      method: 'POST',
      body: {name: 'My tileset', meta: {registry: {}, groups: [{id: 'g0', name: 'Tiles', kind: 'group', tiles: []}]}},
    })
    await loadTileset(t.id_string)
    fetchMyTilesets()
  } catch {
    toast.error('Could not create tileset')
  }
}

// ── Undo/redo: whole-tileset snapshots, pushed before each mutation ──
const tsUndo: string[] = []
const tsRedo: string[] = []
const canUndo = ref(false)
const canRedo = ref(false)

function syncHistory() {
  canUndo.value = tsUndo.length > 0
  canRedo.value = tsRedo.length > 0
}

// Call BEFORE mutating the tileset.
function commit() {
  if (!tileset.value) return
  tsUndo.push(JSON.stringify(tileset.value))
  if (tsUndo.length > 60) tsUndo.shift()
  tsRedo.length = 0
  syncHistory()
}

function applyHistoryState(s: string) {
  tileset.value = JSON.parse(s)
  pendingBuilds.clear()
  if (selectedTileId.value != null && !tileset.value!.registry[String(selectedTileId.value)]) selectedTileId.value = null
  if (selectedGroupId.value && !tileset.value!.groups.some(g => g.id === selectedGroupId.value)) selectedGroupId.value = null
  dirty.value = true
  scheduleDraw()
}

function undoTs() {
  if (!tsUndo.length || !tileset.value) return
  tsRedo.push(JSON.stringify(tileset.value))
  applyHistoryState(tsUndo.pop()!)
  syncHistory()
}

function redoTs() {
  if (!tsRedo.length || !tileset.value) return
  tsUndo.push(JSON.stringify(tileset.value))
  applyHistoryState(tsRedo.pop()!)
  syncHistory()
}

async function save() {
  if (!tileset.value || saving.value) return
  // Guest (or a local-library tileset) → the shared local library (shows in /work).
  if (tileset.value.localId || !auth.isLogged) {
    await materializePendingBuilds()   // Build-Borders previews → real local tiles
    saveLibState()
    dirty.value = false
    toast.success('Saved in this browser')
    return
  }
  saving.value = true
  try {
    // A local draft becomes a real row on its first save.
    if (!tileset.value.id_string) {
      const t = await useNativeFetch<any>('/coloring/tilesets/', {
        method: 'POST',
        body: {name: tileset.value.name, meta: {registry: {}, groups: []}},
      })
      tileset.value.id = t.id
      tileset.value.id_string = t.id_string
      router.replace({query: {id: t.id_string}})
      fetchMyTilesets()
    }
    // Pending Build-borders previews become real SharedPages only now.
    await materializePendingBuilds()
    await useNativeFetch(`/coloring/tilesets/${tileset.value.id_string}/`, {
      method: 'PATCH',
      body: {
        name: tileset.value.name,
        status: tileset.value.status,
        meta: {
          registry: tileset.value.registry,
          cell: tileset.value.cell,
          iso: tileset.value.iso,
          groups: tileset.value.groups,
          // Derived view consumed by the tilemap editor / world pages.
          terrains: terrains.value,
          // Board display prefs (background + grid).
          board: {
            bg: boardBg.value,
            grid: boardGrid.value,
            gridStep: boardGridStep.value,
            gridStyle: boardGridStyle.value,
          },
        },
      },
    })
    dirty.value = false
    toast.success('Tileset saved')
  } catch {
    toast.error('Could not save tileset')
  } finally {
    saving.value = false
  }
}

// ── Canvas zoom: tiles render at true tile size × an integer zoom ───
// Whole-pixel steps above 1× (2, 3, …), unit fractions below (1/2, 1/3, 1/4)
// so you can zoom out for an overview of a large board.
const ZMIN = 0.25
const ZMAX = 8

function stepZoom(z: number, dir: 1 | -1) {
  if (dir > 0) return z >= 1 ? Math.floor(z) + 1 : 1 / (Math.round(1 / z) - 1)
  return z > 1 ? Math.ceil(z) - 1 : 1 / (Math.round(1 / z) + 1)
}
const zoom = ref(2)

// Sensible default once the tileset (and its cell size) is known.
function autoZoom(w: number) {
  return w <= 12 ? 4 : w <= 20 ? 3 : w <= 36 ? 2 : 1
}

function stageCenter() {
  const el = stageEl.value
  return el ? {x: el.clientWidth / 2, y: el.clientHeight / 2} : {x: 0, y: 0}
}

function zoomIn() {
  const c = stageCenter()
  setZoomAnchored(stepZoom(zoom.value, 1), c.x, c.y)
}

function zoomOut() {
  const c = stageCenter()
  setZoomAnchored(stepZoom(zoom.value, -1), c.x, c.y)
}

// Content bounding box in native units.
function contentBBox() {
  const ts = tileset.value
  if (!ts?.groups.length) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const g of ts.groups) {
    const s = groupSizeNative(g)
    minX = Math.min(minX, g.x ?? 0)
    minY = Math.min(minY, g.y ?? 0)
    maxX = Math.max(maxX, (g.x ?? 0) + s.w)
    maxY = Math.max(maxY, (g.y ?? 0) + s.h)
  }
  return {minX, minY, maxX, maxY}
}

// Reset zoom and center the content in the stage.
function fitZoom() {
  zoom.value = autoZoom(tileset.value?.cell.w || 32)
  fitView()
}

function fitView() {
  const el = stageEl.value
  if (!el) return
  const box = contentBBox()
  if (!box) {
    cam.value = {x: 48, y: 56}
    return
  }
  const z = zoom.value
  cam.value = {
    x: Math.round(el.clientWidth / 2 - ((box.minX + box.maxX) / 2) * z),
    y: Math.round(el.clientHeight / 2 - ((box.minY + box.maxY) / 2) * z),
  }
}

// Fit all content in view — pick a zoom that frames the whole board, then
// center it (matches the art editor's FIT button). The zoom/cam watcher repaints.
function fitAll() {
  const el = stageEl.value
  const box = contentBBox()
  if (!el || !box) { fitView(); return }
  const wWorld = box.maxX - box.minX
  const hWorld = box.maxY - box.minY
  const pad = 64
  let z = Math.min((el.clientWidth - pad) / wWorld, (el.clientHeight - pad) / hWorld)
  z = z >= 1 ? Math.floor(z) : z
  z = Math.max(ZMIN, Math.min(ZMAX, z))
  if (!isFinite(z) || z <= 0) z = 1
  zoom.value = z
  const cx = (box.minX + box.maxX) / 2
  const cy = (box.minY + box.maxY) / 2
  cam.value = {
    x: Math.round(el.clientWidth / 2 - cx * z),
    y: Math.round(el.clientHeight / 2 - cy * z),
  }
}

// ── Stage: drag to pan, ctrl/cmd+wheel (or trackpad pinch) to zoom ──
const stageEl = ref<HTMLElement | null>(null)
let pan: { x: number; y: number; sl: number; st: number; id: number } | null = null
const panned = ref(false)

// Camera: the canvas always fills the stage; pan/zoom move the camera, so
// the board is effectively infinite and never resizes with content.
const cam = ref({x: 48, y: 56})

function stageDown(e: PointerEvent) {
  if (e.pointerType === 'mouse' && e.button !== 0) return
  // The board canvas stops propagation when it owns the press (tile/slot/
  // header); anything reaching here on a control is still off-limits.
  if ((e.target as HTMLElement).closest('button, a, input, select')) return
  const el = stageEl.value
  if (!el) return
  pan = {x: e.clientX, y: e.clientY, sl: cam.value.x, st: cam.value.y, id: e.pointerId}
  panned.value = false
}

function stageMove(e: PointerEvent) {
  const el = stageEl.value
  if (!pan || !el) return
  const dx = e.clientX - pan.x
  const dy = e.clientY - pan.y
  if (!panned.value && Math.hypot(dx, dy) > 4) {
    panned.value = true
    el.setPointerCapture?.(pan.id)
  }
  if (panned.value) {
    cam.value = {x: pan.sl + dx, y: pan.st + dy}
  }
}

function stageUp() {
  pan = null
}

// A drag that panned must not fall through as a tile click.
function stageClickCapture(e: MouseEvent) {
  if (!panned.value) return
  e.stopPropagation()
  e.preventDefault()
  panned.value = false
}

// Zoom stepping anchored to a stage point (cursor or stage center).
function setZoomAnchored(nz: number, ax: number, ay: number) {
  nz = Math.max(ZMIN, Math.min(ZMAX, nz))
  if (nz === zoom.value) return
  const f = nz / zoom.value
  cam.value = {x: ax - (ax - cam.value.x) * f, y: ay - (ay - cam.value.y) * f}
  zoom.value = nz
}

// Trackpad pinch arrives as ctrl+wheel with small deltas — accumulate.
// A plain wheel/two-finger scroll pans the board.
let wheelAcc = 0
function onStageWheel(e: WheelEvent) {
  const el = stageEl.value
  if (!el) return
  e.preventDefault()
  if (e.ctrlKey || e.metaKey) {
    wheelAcc += e.deltaY
    if (Math.abs(wheelAcc) < 24) return
    const dir = wheelAcc < 0 ? 1 : -1
    wheelAcc = 0
    const rect = el.getBoundingClientRect()
    setZoomAnchored(stepZoom(zoom.value, dir as 1 | -1), e.clientX - rect.left, e.clientY - rect.top)
  } else {
    cam.value = {x: cam.value.x - e.deltaX, y: cam.value.y - e.deltaY}
  }
}

const cellPx = computed(() => ({
  w: (tileset.value?.cell.w || 32) * zoom.value,
  h: (tileset.value?.cell.h || 32) * zoom.value,
}))

// Terrain slots track the zoomed cell size but stay clickable when tiny.
const slotPx = computed(() => Math.max(32, cellPx.value.w))

// Sheet layout: tiles pack edge-to-edge, near-square column count — the
// on-screen arrangement IS the exported tileset PNG.
// ── Groups: derived views + shared column count ─────────────────────
const plainGroups = computed(() => tileset.value?.groups.filter(g => g.kind === 'group') ?? [])
const terrainGroups = computed(() => tileset.value?.groups.filter(g => g.kind === 'terrain') ?? [])

// The tilemap editor / world pages consume terrains in the legacy shape.
const terrains = computed<Terrain[]>(() =>
    terrainGroups.value.map(g => ({
      id: g.id, name: g.name, type: g.type || 'wang16', map: {...(g.map || {})},
      ...(g.relations ? {relations: {connects: [...g.relations.connects], priority: g.relations.priority}} : {}),
    })),
)

// One shared column count so every group packs to the same sheet width —
// the workspace arrangement IS the exported tileset PNG.
const sheetCols = computed(() => sheetColumns(plainGroups.value))

// Layout reads art sizes from the loaded <img> cache; sizes are unknown until
// an image arrives (helper then assumes 1×1) and the board relayouts after.
const sheetSource = computed<SheetSource>(() => ({
  cell: tileset.value?.cell || {w: 32, h: 32},
  slugOf: (id: number) => tileset.value?.registry[String(id)] || null,
  sizeOf: (slug: string | null) => {
    const img = slug ? imgCache.get(slug) : null
    return img ? {w: img.naturalWidth, h: img.naturalHeight} : null
  },
}))

function layoutGroupTiles(g: TileGroup) {
  return layoutGroup(g, sheetCols.value, sheetSource.value)
}

const exporting = ref(false)

// Export scope: the selected group only, or the whole set.
const exportGroups = computed(() => {
  const ts = tileset.value
  if (!ts) return []
  return activeGroup.value ? [activeGroup.value] : ts.groups
})

const exportSuffix = computed(() =>
    activeGroup.value ? `_${activeGroup.value.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || activeGroup.value.id}` : '',
)

function downloadBlob(blob: Blob, name: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.click()
  URL.revokeObjectURL(a.href)
}

// Preload images (their natural sizes drive layout), then lay the chosen
// groups out. Shared by every export.
async function buildExport(groups: TileGroup[]) {
  const ts = tileset.value!
  const slugs = [...new Set(Object.values(ts.registry))]
  await Promise.all(slugs.map(s => new Promise<void>((resolve) => {
    if (imgCache.get(s)) return resolve()
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      imgCache.set(s, img)
      resolve()
    }
    img.onerror = () => resolve()
    img.src = tileSrc(s)
  })))
  return buildSheet(groups, sheetSource.value)
}

// Draw the laid-out blocks into the packed sheet PNG.
async function renderSheet(L: Awaited<ReturnType<typeof buildExport>>) {
  const cv = document.createElement('canvas')
  cv.width = L.w
  cv.height = L.h
  const ctx = cv.getContext('2d')!
  ctx.imageSmoothingEnabled = false
  for (const b of L.blocks) {
    const img = b.slug ? imgCache.get(b.slug) : null
    if (!img) continue
    // 1:1 pixels, centered; scale down only if the art exceeds its block.
    const scale = Math.min(b.w / img.naturalWidth, b.h / img.naturalHeight, 1)
    const dw = Math.max(1, Math.round(img.naturalWidth * scale))
    const dh = Math.max(1, Math.round(img.naturalHeight * scale))
    ctx.drawImage(img, b.x + Math.floor((b.w - dw) / 2), b.y + Math.floor((b.h - dh) / 2), dw, dh)
  }
  return await new Promise<Blob | null>(r => cv.toBlob(r, 'image/png'))
}

async function exportPNG() {
  const ts = tileset.value
  if (!ts || !tiles.value.length || exporting.value) return
  exporting.value = true
  try {
    const {w, h} = ts.cell
    const L = await buildExport(exportGroups.value)
    if (!L.blocks.length) {
      toast.error('Nothing to export in this group')
      return
    }
    const blob = await renderSheet(L)
    if (!blob) throw new Error('no blob')
    downloadBlob(blob, `${ts.id_string}${exportSuffix.value}_tileset_${w}x${h}.png`)
  } catch {
    toast.error('Could not export — some tiles failed to load')
  } finally {
    exporting.value = false
  }
}

// JSON sidecar: everything an engine importer needs to slice the PNG.
async function exportJSON() {
  const ts = tileset.value
  if (!ts || !tiles.value.length || exporting.value) return
  exporting.value = true
  try {
    const {w, h} = ts.cell
    const groups = exportGroups.value
    const L = await buildExport(groups)
    const sidecar = {
      name: ts.name,
      id_string: ts.id_string,
      scope: activeGroup.value ? activeGroup.value.name : 'all',
      image: `${ts.id_string}${exportSuffix.value}_tileset_${w}x${h}.png`,
      cell: {w, h},
      size: {w: L.w, h: L.h},
      groups: groups.map(g => ({
        id: g.id, name: g.name, kind: g.kind,
        ...(g.kind === 'group' && g.random ? {random: true} : {}),
        ...(g.kind === 'terrain' ? {type: g.type || 'wang16'} : {}),
      })),
      tiles: L.tiles,
      terrains: L.terrains,
    }
    downloadBlob(
        new Blob([JSON.stringify(sidecar, null, 2)], {type: 'application/json'}),
        `${ts.id_string}${exportSuffix.value}_tileset.json`,
    )
  } catch {
    toast.error('Could not export')
  } finally {
    exporting.value = false
  }
}

function engineReadme(kind: 'godot' | 'tiled', name: string, base: string, image: string) {
  const head = `${name} — tileset for ${kind === 'godot' ? 'Godot 4' : 'Tiled'}\nMade with SimplePixelArt — https://simplepixelart.com/tilesets/editor\n`
  return kind === 'godot'
      ? `${head}
1. Copy ${base}.tres and ${image} into your Godot 4 project, in the same folder.
2. Open ${base}.tres — the atlas and the terrain sets are already filled in.
3. Add a TileMapLayer node, assign this TileSet, then paint from the Terrains tab.

Terrains built as "wang16" use Match Sides; "blob47" ones use Match Corners and Sides.
Move the files apart and Godot will ask you to re-point the texture.
`
      : `${head}
1. Keep ${base}.tsx and ${image} in the same folder.
2. In Tiled: Map > Add External Tileset… and pick ${base}.tsx
3. Each terrain is a Wang set — paint with the Terrain Brush (U).
`
}

// One zip per engine: the packed PNG + a sidecar the engine reads natively.
async function exportEngine(kind: 'godot' | 'tiled') {
  const ts = tileset.value
  if (!ts || !tiles.value.length || exporting.value) return
  exporting.value = true
  try {
    const {w, h} = ts.cell
    const L = await buildExport(exportGroups.value)
    if (!L.blocks.length) {
      toast.error('Nothing to export in this group')
      return
    }
    const blob = await renderSheet(L)
    if (!blob) throw new Error('no blob')
    const base = `${ts.id_string}${exportSuffix.value}_tileset`
    const image = `${base}_${w}x${h}.png`
    const sheet: EngineSheet = {
      name: ts.name,
      image,
      cell: {w, h},
      size: {w: L.w, h: L.h},
      tiles: L.tiles.map(t => ({x: t.x, y: t.y, w: t.w, h: t.h, ...(t.prob ? {prob: t.prob} : {})})),
      terrains: L.terrains.map(t => ({
        name: t.name,
        type: t.type,
        slots: Object.entries(t.slots).map(([mask, s]) => ({mask: Number(mask), x: s.x, y: s.y})),
      })),
    }
    const enc = new TextEncoder()
    const files = [{name: image, data: new Uint8Array(await blob.arrayBuffer())}]
    let skipped = 0
    if (kind === 'godot') {
      const out = buildGodotTileSet(sheet)
      skipped = out.skipped
      files.push({name: `${base}.tres`, data: enc.encode(out.text)})
    } else {
      files.push({name: `${base}.tsx`, data: enc.encode(buildTiledTileset(sheet))})
    }
    files.push({name: 'README.txt', data: enc.encode(engineReadme(kind, ts.name, base, image))})
    downloadBlob(createZip(files), `${base}_${kind}.zip`)
    // An atlas cell holds one tile — overlapping free-positioned art can't be one.
    if (skipped) toast.warning(`${skipped} overlapping tile${skipped > 1 ? 's' : ''} left out of the atlas`)
  } catch {
    toast.error('Could not export')
  } finally {
    exporting.value = false
  }
}

// ── Selection (Tilesetter-style: pick a tile, then place it) ────────
// Ordered multi-selection; the LAST picked tile is the primary one (used by
// slot placement, fill, weights). Shift/⌘-click toggles membership.
const selectedTileIds = ref<number[]>([])

// Writable single-tile view over the multi-selection, so every consumer of
// "the selected tile" keeps working unchanged.
const selectedTileId = computed<number | null>({
  get: () => selectedTileIds.value.length ? selectedTileIds.value[selectedTileIds.value.length - 1]! : null,
  set: (v) => { selectedTileIds.value = v == null ? [] : [v] },
})

const selectedTile = computed(() =>
    selectedTileId.value != null
        ? tiles.value.find(t => t.id === selectedTileId.value) || null
        : null,
)

function isTileSelected(id: number) {
  return selectedTileIds.value.includes(id)
}

// Tile and group selection coexist: pick a terrain group (its tools appear
// in the toolbar), then pick a tile to fill slots with.
function selectTile(id: number, additive = false) {
  if (additive) {
    selectedTileIds.value = isTileSelected(id)
        ? selectedTileIds.value.filter(x => x !== id)
        : [...selectedTileIds.value, id]
    return
  }
  selectedTileIds.value = (selectedTileIds.value.length === 1 && selectedTileIds.value[0] === id) ? [] : [id]
}

function deleteSelectedTiles() {
  if (!selectedTileIds.value.length) return
  commit()
  const n = selectedTileIds.value.length
  for (const id of [...selectedTileIds.value]) removeTileById(id)
  selectedTileIds.value = []
  dirty.value = true
  toast.success(`Removed ${n} tile${n > 1 ? 's' : ''}`)
}

function onKeydown(e: KeyboardEvent) {
  const t = e.target as HTMLElement
  const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
    if (typing) return
    e.preventDefault()
    e.shiftKey ? redoTs() : undoTs()
    return
  }
  if ((e.key === 'Delete' || e.key === 'Backspace') && !typing && !showAdd.value && !showBuild.value && !showSettings.value && !showRelations.value) {
    if (selectedTileIds.value.length) {
      e.preventDefault()
      deleteSelectedTiles()
    }
    return
  }
  if (e.key !== 'Escape') return
  if (showRelations.value) showRelations.value = false
  else if (showBuild.value) showBuild.value = false
  else if (showAdd.value) showAdd.value = false
  else {
    selectedTileIds.value = []
    selectedGroupId.value = null
  }
}

let resizeObs: ResizeObserver | null = null
onMounted(() => {
  document.addEventListener('keydown', onKeydown)
  // The canvas mirrors the stage size — repaint whenever the stage resizes.
  resizeObs = new ResizeObserver(() => scheduleDraw())
  watch(stageEl, (el, _old, onCleanup) => {
    if (el) resizeObs?.observe(el)
    onCleanup(() => { if (el) resizeObs?.unobserve(el) })
  }, {immediate: true})
})
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown)
  resizeObs?.disconnect()
})

// ── Tiles: add / remove ─────────────────────────────────────────────

// Drop a tile from the registry, its group, and dangling terrain slots.
function removeTileById(id: number) {
  if (!tileset.value) return
  delete tileset.value.registry[String(id)]
  for (const g of tileset.value.groups) {
    if (g.kind === 'group') {
      g.tiles = g.tiles.filter(t => t !== id)
      delete g.pos?.[String(id)]
    } else if (g.map) {
      for (const [m, tid] of Object.entries(g.map)) {
        if (tid === id) delete g.map[m]
      }
    }
  }
  if (selectedTileId.value === id) selectedTileId.value = null
}

function inTileset(id: number) {
  return !!tileset.value?.registry[String(id)]
}

// ── Tile size ───────────────────────────────────────────────────────
function setCell(px: number) {
  if (!tileset.value) return
  commit()
  tileset.value.cell = {w: px, h: px}
  dirty.value = true
}

function setCellDim(field: 'w' | 'h', v: number) {
  if (!tileset.value) return
  commit()
  const n = Math.max(4, Math.min(256, Math.round(v) || 32))
  tileset.value.cell = {...tileset.value.cell, [field]: n}
  dirty.value = true
}

// ── Groups: add / remove ────────────────────────────────────────────
function addGroup(kind: 'group' | 'terrain') {
  const ts = tileset.value
  if (!ts) return
  commit()
  const id = `${kind === 'terrain' ? 't' : 'g'}${Date.now().toString(36)}`
  const n = ts.groups.filter(g => g.kind === kind).length + 1
  // Place the new group below everything currently on the board.
  const bottom = ts.groups.length
      ? Math.max(...ts.groups.map(g => (g.y ?? 0) + groupSizeNative(g).h))
      : 0
  const pos = {x: 0, y: ts.groups.length ? bottom + GAP_N + Math.ceil(HEAD_H / zoom.value) : 0}
  ts.groups.push(kind === 'terrain'
      ? {id, name: `Terrain ${n}`, kind, tiles: [], map: {}, ...pos}
      : {id, name: `Group ${n}`, kind, tiles: [], ...pos})
  selectedGroupId.value = id
  selectedTileId.value = null
  dirty.value = true
}

// Deleting a plain group keeps its tiles (they move to another plain group);
// the last plain group can't be deleted.
function removeGroup(gid: string) {
  const ts = tileset.value
  if (!ts) return
  const g = ts.groups.find(x => x.id === gid)
  if (!g) return
  commit()
  if (g.kind === 'group') {
    const other = ts.groups.find(x => x.kind === 'group' && x.id !== gid)
    if (!other) return
    other.tiles.push(...g.tiles)
  }
  ts.groups = ts.groups.filter(x => x.id !== gid)
  // A deleted terrain also leaves every other terrain's connects list.
  for (const x of ts.groups) {
    if (x.relations?.connects.includes(gid)) {
      x.relations.connects = x.relations.connects.filter(id => id !== gid)
      tidyRelations(x)
    }
  }
  if (selectedGroupId.value === gid) selectedGroupId.value = null
  dirty.value = true
}

// wang16 masks are a subset of blob masks, so switching keeps assignments.
function toggleTerrainType(g: TileGroup) {
  if (g.kind !== 'terrain') return
  commit()
  g.type = g.type === 'blob47' ? 'wang16' : 'blob47'
  if (g.type === 'wang16' && g.map) {
    // Drop corner-mask assignments that wang16 can't address.
    for (const m of Object.keys(g.map)) {
      if (Number(m) > 15) delete g.map[m]
    }
  }
  dirty.value = true
}

function toggleRandom(g: TileGroup) {
  if (g.kind !== 'group') return
  commit()
  g.random = !g.random
  dirty.value = true
}

// Weight of the selected tile inside a random group (1–9, default 1).
const selectedWeight = computed(() => {
  const g = activeGroup.value
  const id = selectedTileId.value
  if (!g || g.kind !== 'group' || id == null) return 1
  return Math.max(1, Number(g.weights?.[String(id)]) || 1)
})

function bumpWeight(delta: number) {
  const g = activeGroup.value
  const id = selectedTileId.value
  if (!g || g.kind !== 'group' || id == null) return
  const next = Math.max(1, Math.min(9, selectedWeight.value + delta))
  if (next === selectedWeight.value) return
  commit()
  const w = g.weights || (g.weights = {})
  if (next <= 1) delete w[String(id)]
  else w[String(id)] = next
  dirty.value = true
  scheduleDraw()
}

// ── Terrain relations: connects list + boundary priority ────────────
// Stored on the terrain group, consumed by the tilemap through the derived
// terrains view. Rule lives in autotile.ts (TerrainRelations).
const showRelations = ref(false)

const otherTerrains = computed(() =>
    terrainGroups.value.filter(g => g.id !== activeGroup.value?.id))

function isConnected(g: TileGroup, otherId: string) {
  return !!g.relations?.connects.includes(otherId)
}

// Drop the relations object entirely when it's back to the default.
function tidyRelations(g: TileGroup) {
  if (g.relations && !g.relations.connects.length && !g.relations.priority) delete g.relations
}

function toggleConnect(g: TileGroup, otherId: string) {
  if (g.kind !== 'terrain') return
  commit()
  const rel = g.relations || (g.relations = {connects: [], priority: 0})
  const i = rel.connects.indexOf(otherId)
  if (i >= 0) rel.connects.splice(i, 1)
  else rel.connects.push(otherId)
  tidyRelations(g)
  dirty.value = true
}

const groupPriority = (g: TileGroup) => Number(g.relations?.priority) || 0

function bumpPriority(g: TileGroup, delta: number) {
  if (g.kind !== 'terrain') return
  const next = Math.max(0, Math.min(9, groupPriority(g) + delta))
  if (next === groupPriority(g)) return
  commit()
  const rel = g.relations || (g.relations = {connects: [], priority: 0})
  rel.priority = next
  tidyRelations(g)
  dirty.value = true
}

// Tilesetter-style quick start: stamp the selected tile into every empty
// slot so the terrain paints immediately; replace slots with real art later.
function fillTerrainFromSelected(g: TileGroup) {
  if (g.kind !== 'terrain' || selectedTileId.value == null) return
  commit()
  const map = g.map || (g.map = {})
  let n = 0
  for (const mask of terrainSlots(g)) {
    if (!map[String(mask)]) {
      map[String(mask)] = selectedTileId.value
      n++
    }
  }
  if (n) {
    dirty.value = true
    toast.success(`Filled ${n} empty slot${n > 1 ? 's' : ''}`)
  }
}

// ── Build borders (auto mode): 1 base tile → a full terrain set ─────
// Composes every mask variant in palette-index space (each result is a real
// SharedPage the user can open in the pixel editor), assigns the slots, and
// stores the recipe on the group so Generate can update in place later.
const showBuild = ref(false)
const building = ref(false)
const buildProgress = ref('')
// 'fill' = reuse the base for every mask (iso 3D blocks — the walls are the
// border); 'auto' = algorithmic shading (grid, or flat iso diamond floors);
// 'edge' = overlay hand-drawn edge art (grid only).
const buildStyle = ref<'auto' | 'edge' | 'fill'>('auto')
// Collapse advanced styles behind a "More" link — the default (Fill for iso,
// Auto shade for grid) is all most builds need.
const buildAdvanced = ref(false)
const defaultBuildStyle = () => (tileset.value?.iso ? 'fill' : 'auto')
function toggleBuildAdvanced() {
  buildAdvanced.value = !buildAdvanced.value
  if (!buildAdvanced.value) buildStyle.value = defaultBuildStyle()   // collapsing = back to the simple default
}
const buildDepth = ref(2)
const buildMode = ref<'darken' | 'lighten'>('darken')
const buildRounded = ref(true)
const buildDither = ref(true)
// Picked source arts (tile ids from the registry).
const buildBaseId = ref<number | null>(null)
const buildEdgeId = ref<number | null>(null)
const buildCornerId = ref<number | null>(null)
// Transition underlay: another terrain's base drawn beneath open sides so
// the border blends into it (grass fading into water).
const buildUnderId = ref<number | null>(null)
// blob47 inner-corner art (authored top-left) for edge style.
const buildInnerId = ref<number | null>(null)
// Edge cutoff: only the top N rows of the edge art apply (0 = whole art).
const buildCut = ref(0)
// Per-side edge overrides (all edge art is authored for the NORTH side and
// auto-rotated; an override replaces the shared edge on that side only).
const BUILD_SIDES = ['n', 'e', 's', 'w'] as const
type BuildSide = typeof BUILD_SIDES[number]
const buildSideIds = reactive<Record<BuildSide, number | null>>({n: null, e: null, s: null, w: null})
// Edge variations: extra edge arts mixed with the main one, picked
// deterministically per mask+side so rebuilds never churn.
const buildVarIds = ref<number[]>([])

interface ArtData { colors: string[]; grid: Record<string, number>; w: number; h: number; updated?: string }

const buildBase = ref<ArtData | null>(null)
const buildEdge = ref<ArtData | null>(null)
const buildCorner = ref<ArtData | null>(null)
const buildUnder = ref<ArtData | null>(null)
const buildInner = ref<ArtData | null>(null)
const buildSideArts = reactive<Record<BuildSide, ArtData | null>>({n: null, e: null, s: null, w: null})
const buildVarArts = ref<ArtData[]>([])

// Which source the next grid click assigns.
const buildTarget = ref<'base' | 'edge' | 'corner' | 'under' | 'inner' | 'vars' | `side-${BuildSide}`>('base')
// Search beyond the tileset: any public art can be a source. id -> slug for
// picks that aren't in the registry yet (added on Generate).
const buildSlugs = reactive<Record<number, string>>({})
const buildQuery = ref('')
const buildResults = ref<SharedPage[]>([])
const buildSearching = ref(false)
const buildPage = ref(1)
const buildPages = ref(1)

function slugOf(id: number | null | undefined): string | null {
  if (id == null) return null
  return tileset.value?.registry[String(id)] || buildSlugs[id] || null
}

async function buildSearch(page = 1) {
  buildSearching.value = true
  try {
    const res = await useNativeFetch<any>('/coloring/shared-pages/', {
      params: {status: 'public', has_pages: 1, page_size: 18, page, search: buildQuery.value.trim() || undefined},
    })
    buildResults.value = Array.isArray(res.results) ? res.results.filter((r: any) => r?.id_string) : []
    buildPage.value = page
    buildPages.value = Math.max(1, Number(res.num_pages) || 1)
    for (const r of buildResults.value) buildSlugs[Number(r.id)] = r.id_string
  } catch {
    buildResults.value = []
  } finally {
    buildSearching.value = false
  }
}
const debouncedBuildSearch = debounce(() => buildSearch(1), 350)

// One grid: the set's own tiles first, then public art — searchable and
// pageable so any art can become a source.
const buildGridItems = computed(() => {
  const pub = buildResults.value.map(r => ({id: Number(r.id), id_string: r.id_string}))
  if (buildQuery.value.trim() || buildPage.value > 1) return pub
  const seen = new Set(tiles.value.map(t => t.id))
  return [...tiles.value, ...pub.filter(p => !seen.has(p.id))]
})

const BUILD_TARGET_REFS = {
  base: buildBaseId, edge: buildEdgeId, corner: buildCornerId,
  under: buildUnderId, inner: buildInnerId,
} as const

// Uniform slot cards for the Sources section — one shape for every source
// keeps the grid aligned no matter the style/terrain type.
const buildSlotDefs = computed(() => {
  const defs: { key: string; label: string; id: number | null; title: string }[] = [
    {key: 'base', label: 'Base', id: buildBaseId.value, title: 'Fill texture — the middle of the terrain (required)'},
  ]
  if (buildStyle.value === 'fill') return defs   // Fill only reuses the base
  defs.push({key: 'under', label: 'Under', id: buildUnderId.value, title: 'Transition underlay — the terrain this one blends into (optional)'})
  if (buildStyle.value === 'edge') {
    defs.push(
        {key: 'edge', label: 'Edge', id: buildEdgeId.value, title: 'Top fringe, auto-rotated to the other sides (required)'},
        {key: 'corner', label: 'Corner', id: buildCornerId.value, title: 'Top-left outer corner (optional) — click a picked tile again to clear'},
    )
    if (activeGroup.value?.type === 'blob47') {
      defs.push({key: 'inner', label: 'Inner', id: buildInnerId.value, title: 'Inner corner, top-left (optional) — for blob47 concave joins'})
    }
  }
  return defs
})

const buildSideDefs = computed(() => BUILD_SIDES.map(sd => ({
  key: `side-${sd}`,
  label: sd.toUpperCase(),
  id: buildSideIds[sd],
  title: `${({n: 'North', e: 'East', s: 'South', w: 'West'})[sd]} edge override (optional) — authored like the top edge, auto-rotated. Click a picked tile again to clear.`,
})))

// Where a library click lands — echoed next to the "Art library" heading.
const buildTargetLabel = computed(() => {
  const t = buildTarget.value
  if (t === 'vars') return 'Variations'
  if (t.startsWith('side-')) return `${t.slice(5).toUpperCase()} edge`
  return t.charAt(0).toUpperCase() + t.slice(1)
})

function assignBuildPick(id: number) {
  const t = buildTarget.value
  if (t === 'vars') {
    // Variations multi-pick: click toggles membership.
    const i = buildVarIds.value.indexOf(id)
    if (i >= 0) buildVarIds.value.splice(i, 1)
    else buildVarIds.value.push(id)
    return
  }
  if (t.startsWith('side-')) {
    const side = t.slice(5) as BuildSide
    buildSideIds[side] = buildSideIds[side] === id ? null : id
    return
  }
  const r = BUILD_TARGET_REFS[t as keyof typeof BUILD_TARGET_REFS]
  // Optional sources toggle off when re-picked.
  r.value = (t !== 'base' && t !== 'edge' && r.value === id) ? null : id
}

function buildPickActive(id: number) {
  const t = buildTarget.value
  if (t === 'vars') return buildVarIds.value.includes(id)
  if (t.startsWith('side-')) return buildSideIds[t.slice(5) as BuildSide] === id
  return BUILD_TARGET_REFS[t as keyof typeof BUILD_TARGET_REFS].value === id
}

// Seed every modal param from a stored recipe (or defaults when absent) —
// shared by the modal and quickBuild so the two paths can't drift.
function seedBuildParams(r: any) {
  // Iso defaults to Fill (3D blocks self-border via their walls); Auto shade
  // (flat floors) and Edge art (composited pieces) are opt-in.
  buildStyle.value = tileset.value?.iso
      ? (r?.style === 'auto' ? 'auto' : r?.style === 'edge' ? 'edge' : 'fill')
      : (r?.style === 'edge' ? 'edge' : 'auto')
  buildDepth.value = Number(r?.depth) || Math.max(1, Math.round((tileset.value?.cell.w || 16) / 8))
  buildMode.value = r?.mode === 'lighten' ? 'lighten' : 'darken'
  buildRounded.value = r?.rounded !== false
  buildDither.value = r?.dither !== false
  buildCut.value = Math.max(0, Number(r?.cut) || 0)
  buildEdgeId.value = r?.edge && slugOf(Number(r.edge)) ? Number(r.edge) : null
  buildCornerId.value = r?.corner && slugOf(Number(r.corner)) ? Number(r.corner) : null
  buildUnderId.value = r?.under && slugOf(Number(r.under)) ? Number(r.under) : null
  buildInnerId.value = r?.inner && slugOf(Number(r.inner)) ? Number(r.inner) : null
  for (const sd of BUILD_SIDES) {
    const id = Number(r?.sides?.[sd]) || 0
    buildSideIds[sd] = id && slugOf(id) ? id : null
  }
  buildVarIds.value = Array.isArray(r?.vars)
      ? r.vars.map(Number).filter((id: number) => !!slugOf(id))
      : []
}

function openBuild() {
  const g = activeGroup.value
  if (!g || g.kind !== 'terrain') return
  const r: any = g.builder
  seedBuildParams(r)
  buildAdvanced.value = buildStyle.value !== defaultBuildStyle()   // reveal styles only if the saved build isn't the default
  buildBaseId.value = (r?.base && slugOf(Number(r.base)) ? Number(r.base) : null)
      ?? selectedTileId.value
      ?? (tiles.value[0]?.id ?? null)
  buildTarget.value = 'base'
  buildQuery.value = ''
  buildSearch(1)   // browse mode: newest public art fills the grid tail
  showBuild.value = true
}

async function fetchBaseData(idString: string): Promise<ArtData | null> {
  // Guest / local-first tiles live only in the local library, never on the
  // cloud — resolve their pixels from there before hitting the API (a cloud
  // fetch for a local UUID just 404s, which is why guests saw no base source).
  const localEd = localTs.findTileEd(idString)
  if (localEd) {
    return {
      colors: Array.isArray(localEd.colors) ? localEd.colors.map(String) : [],
      grid: layers2MapNumbers(localEd),
      w: Number(localEd.width) || tileset.value?.cell.w || 16,
      h: Number(localEd.height) || tileset.value?.cell.h || 16,
      updated: String(localEd.updated || ''),
    }
  }
  try {
    const p = await useNativeFetch<any>(`/coloring/shared-pages/${idString}/`)
    const grid = (p.map_numbers && typeof p.map_numbers === 'object') ? p.map_numbers : {}
    return {
      colors: Array.isArray(p.colors) ? p.colors.map(String) : [],
      grid: grid as Record<string, number>,
      w: Number(p.width) || tileset.value?.cell.w || 16,
      h: Number(p.height) || tileset.value?.cell.h || 16,
      updated: String(p.updated || ''),
    }
  } catch {
    return null
  }
}

function shadeHex(hex: string, f: number): string {
  const m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(hex.trim())
  if (!m) return hex
  const n = parseInt(m[1]!, 16)
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * f)))
  const out = (c(n >> 16) << 16) | (c((n >> 8) & 255) << 8) | c(n & 255)
  return `#${out.toString(16).padStart(6, '0')}${m[2] || ''}`
}

// Screen (x,y) → source coords for an art authored for the NORTH side,
// rotated to face a given side/corner (square-cell assumption).
function rotCoord(x: number, y: number, W: number, H: number, rot: 0 | 90 | 180 | 270): [number, number] {
  if (rot === 90) return [y, W - 1 - x]
  if (rot === 180) return [W - 1 - x, H - 1 - y]
  if (rot === 270) return [H - 1 - y, x]
  return [x, y]
}

// Isometric variant: the tile is a diamond inscribed in the W×H cell, so a
// border runs along the diamond's four slanted edges — not the cell's rectangle
// sides — and everything outside the diamond stays transparent. Grid directions
// map to diamond edges via the tilemap's projection (cellCenter():
// E→down-right, W→up-left, N→up-right, S→down-left):
//   N → top-right edge   E → bottom-right edge
//   S → bottom-left edge W → top-left edge
// Two styles: 'auto' shades the diamond edges algorithmically (flat floors);
// 'edge' composites hand-drawn edge pieces onto them (Tilesetter-style).
function composeMaskIso(base: NonNullable<typeof buildBase.value>, mask: number) {
  const cell = tileset.value!.cell
  const W = cell.w
  const H = cell.h
  const s = slotSides(mask)
  const colors = [...base.colors]
  const map: Record<string, number> = {}

  const byHex = new Map<string, number>()
  colors.forEach((c, i) => { if (!byHex.has(c)) byHex.set(c, i) })
  const merge = (hex: string) => {
    if (!byHex.has(hex)) { byHex.set(hex, colors.length); colors.push(hex) }
    return byHex.get(hex)!
  }
  const f = buildMode.value === 'lighten' ? 1.3 : 0.68
  const shaded = new Map<number, number>()
  const shade = (ci: number) => {
    if (!shaded.has(ci)) { shaded.set(ci, colors.length); colors.push(shadeHex(colors[ci] ?? '#000000', f)) }
    return shaded.get(ci)!
  }
  const under = buildUnder.value
  const underAt = (x: number, y: number): number | null => {
    if (!under) return null
    const ci = under.grid[`${x % under.w}_${y % under.h}`]
    const hex = ci != null && ci !== -1 ? under.colors[ci] : null
    return hex ? merge(hex) : null
  }

  // ── Edge-art overlay (Tilesetter-style compositing) ──────────────────────
  // Keep the base sprite intact (no diamond clip → 3D blocks keep their walls)
  // and stamp a hand-drawn edge piece onto every OPEN diamond edge. The default
  // piece is authored for the N (top-right) edge and MIRRORED to the other three
  // (iso edges are reflections, not 90° rotations like the grid). A per-side slot
  // (buildSideArts) overrides one edge and is used exactly as authored.
  if (buildStyle.value === 'edge' && buildEdge.value) {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const bi = base.grid[`${x % base.w}_${y % base.h}`]
      if (bi != null && bi !== -1) map[`${x}_${y}`] = bi
    }
    // dir picks the reflection of the N-authored piece: W flips X, E flips Y,
    // S flips both; N is identity (also used for per-side art authored in place).
    const stamp = (art: ArtData, dir: BuildSide) => {
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const u = (dir === 'w' || dir === 's') ? W - 1 - x : x
        const v = (dir === 'e' || dir === 's') ? H - 1 - y : y
        const ci = art.grid[`${u % art.w}_${v % art.h}`]
        if (ci == null || ci === -1) continue
        map[`${x}_${y}`] = merge(art.colors[ci] ?? '#000000')
      }
    }
    const edge = buildEdge.value
    const sideStamp = (dir: BuildSide) => {
      const o = buildSideArts[dir]
      if (o) stamp(o, 'n')      // per-side art is drawn for its own edge → no mirror
      else stamp(edge, dir)     // default piece mirrored onto this edge
    }
    if (!s.n) sideStamp('n')
    if (!s.e) sideStamp('e')
    if (!s.s) sideStamp('s')
    if (!s.w) sideStamp('w')
    return {colors, map}
  }

  const a = W / 2, b = H / 2               // diamond half-extents
  const d = Math.max(1, Math.min(Math.floor(Math.min(W, H) / 2), buildDepth.value))
  const band = Math.min(0.9, d / ((a + b) / 2))   // shell thickness (fraction of the diamond)

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      // Diamond coords: |dx| + |dy| <= 1 is inside; = 1 is the edge.
      const dx = (x + 0.5 - a) / a
      const dy = (y + 0.5 - b) / b
      const u = Math.abs(dx) + Math.abs(dy)
      if (u > 1) continue                  // outside the diamond → transparent
      const bi = base.grid[`${x % base.w}_${y % base.h}`]
      const ci = (bi != null && bi !== -1) ? bi : underAt(x, y)
      if (ci == null) continue             // base has a hole and no underlay → leave clear
      const k = `${x}_${y}`
      map[k] = ci

      // The diamond quadrant this pixel sits in faces one grid direction; shade
      // only when that neighbour is open (a border there).
      const open =
          (dx >= 0 && dy < 0 && !s.n) ||   // top-right edge  → N
          (dx >= 0 && dy >= 0 && !s.e) ||  // bottom-right    → E
          (dx < 0 && dy >= 0 && !s.s) ||   // bottom-left     → S
          (dx < 0 && dy < 0 && !s.w)       // top-left        → W
      if (!open || u < 1 - band) continue

      // Rounded: bevel a diamond corner point where its two edges are both open.
      if (buildRounded.value) {
        const roundCorner =
            (!s.n && !s.e && dx > 0 && Math.abs(dy) < band) ||   // right corner
            (!s.e && !s.s && dy > 0 && Math.abs(dx) < band) ||   // bottom corner
            (!s.s && !s.w && dx < 0 && Math.abs(dy) < band) ||   // left corner
            (!s.w && !s.n && dy < 0 && Math.abs(dx) < band)      // top corner
        if (roundCorner) {
          const uu = underAt(x, y)
          if (uu != null) map[k] = uu
          else delete map[k]
          continue
        }
      }
      // Transition: the outer half of the band recedes into the underlay.
      if (under && u >= 1 - band / 2) {
        const uu = underAt(x, y)
        if (uu != null) { map[k] = uu; continue }
      }
      map[k] = shade(ci)
    }
  }
  return {colors, map}
}

// Compose one mask variant.
// auto: base fill + shaded band along open sides, triangle-cut outer corners,
//       shaded inner corners (blob47), dithered seam.
// edge: base fill + edge art overlaid on every open side (rotated), optional
//       corner art stamped where two open sides meet.
function composeMask(base: NonNullable<typeof buildBase.value>, mask: number, type: TerrainType) {
  // Fill: every mask is just the base sprite, untouched — for 3D iso blocks where
  // the tile's own walls read as the border (no per-edge variation needed).
  if (buildStyle.value === 'fill') return {colors: [...base.colors], map: {...base.grid}}
  if (tileset.value?.iso) return composeMaskIso(base, mask)
  const cell = tileset.value!.cell
  const W = cell.w
  const H = cell.h
  const d = Math.max(1, Math.min(Math.floor(Math.min(W, H) / 2), buildDepth.value))
  const f = buildMode.value === 'lighten' ? 1.3 : 0.68
  const s = slotSides(mask)
  const colors = [...base.colors]
  const map: Record<string, number> = {}

  // Merge palettes by hex so overlays/underlays dedupe into one palette.
  const byHex = new Map<string, number>()
  colors.forEach((c, i) => { if (!byHex.has(c)) byHex.set(c, i) })
  const merge = (hex: string) => {
    if (!byHex.has(hex)) {
      byHex.set(hex, colors.length)
      colors.push(hex)
    }
    return byHex.get(hex)!
  }

  // Transition underlay first: the other terrain shows wherever this one recedes.
  const under = buildUnder.value
  const underAt = (x: number, y: number): number | null => {
    if (!under) return null
    const ci = under.grid[`${x % under.w}_${y % under.h}`]
    const hex = ci != null && ci !== -1 ? under.colors[ci] : null
    return hex ? merge(hex) : null
  }
  if (under) {
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const u = underAt(x, y)
        if (u != null) map[`${x}_${y}`] = u
      }
    }
  }

  // Base fill (small textures repeat across the cell).
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const ci = base.grid[`${x % base.w}_${y % base.h}`]
      if (ci != null && ci !== -1) map[`${x}_${y}`] = ci
    }
  }

  if (buildStyle.value === 'edge' && buildEdge.value) {
    const cut = Math.max(0, Math.min(H, buildCut.value))
    const overlay = (art: ArtData, rot: 0 | 90 | 180 | 270) => {
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const [u, v] = rotCoord(x, y, W, H, rot)
          if (cut > 0 && v >= cut) continue      // cutoff: top rows only
          const ci = art.grid[`${u % art.w}_${v % art.h}`]
          if (ci == null || ci === -1) continue
          const hex = art.colors[ci]
          if (hex) map[`${x}_${y}`] = merge(hex)
        }
      }
    }
    const edge = buildEdge.value
    // Per-side override wins; otherwise variations rotate through the pool
    // deterministically per mask+side (stable across rebuilds).
    const edgeVariants = [edge, ...buildVarArts.value]
    const edgeFor = (side: BuildSide, rotIdx: number) =>
        buildSideArts[side]
        ?? (edgeVariants.length > 1 ? edgeVariants[(mask * 7 + rotIdx * 13) % edgeVariants.length]! : edge)
    if (!s.n) overlay(edgeFor('n', 0), 0)
    if (!s.e) overlay(edgeFor('e', 1), 90)
    if (!s.s) overlay(edgeFor('s', 2), 180)
    if (!s.w) overlay(edgeFor('w', 3), 270)
    // Outer corners: dedicated art wins over the two overlapping edges.
    const corner = buildCorner.value
    if (corner) {
      if (!s.n && !s.w) overlay(corner, 0)
      if (!s.n && !s.e) overlay(corner, 90)
      if (!s.s && !s.e) overlay(corner, 180)
      if (!s.s && !s.w) overlay(corner, 270)
    }
    // blob47 inner corners: edges connect but the diagonal doesn't.
    const inner = buildInner.value
    if (inner && type === 'blob47') {
      if (s.n && s.w && !s.nw) overlay(inner, 0)
      if (s.n && s.e && !s.ne) overlay(inner, 90)
      if (s.s && s.e && !s.se) overlay(inner, 180)
      if (s.s && s.w && !s.sw) overlay(inner, 270)
    }
    return {colors, map}
  }

  // Auto mode: algorithmic shading.
  const shaded = new Map<number, number>()
  const shade = (ci: number) => {
    if (!shaded.has(ci)) {
      shaded.set(ci, colors.length)
      colors.push(shadeHex(colors[ci] ?? '#000000', f))
    }
    return shaded.get(ci)!
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const k = `${x}_${y}`
      const ci = map[k]
      if (ci == null) continue
      const dn = y
      const ds = H - 1 - y
      const dw = x
      const de = W - 1 - x
      // Rounded outer corners: cut a d-sized triangle where two open sides
      // meet — the underlay terrain shows through when one is set.
      if (buildRounded.value) {
        if ((!s.n && !s.w && dn + dw < d) || (!s.n && !s.e && dn + de < d)
            || (!s.s && !s.w && ds + dw < d) || (!s.s && !s.e && ds + de < d)) {
          const u = underAt(x, y)
          if (u != null) map[k] = u
          else delete map[k]
          continue
        }
      }
      // Transition: the outer half of the band recedes into the underlay.
      if (under) {
        const distOpen = Math.min(!s.n ? dn : 99, !s.s ? ds : 99, !s.w ? dw : 99, !s.e ? de : 99)
        if (distOpen < Math.ceil(d / 2)) {
          const u = underAt(x, y)
          if (u != null) {
            map[k] = u
            continue
          }
        }
      }
      let band = (!s.n && dn < d) || (!s.s && ds < d) || (!s.w && dw < d) || (!s.e && de < d)
      // blob47 inner corners: edges connect but the diagonal doesn't.
      if (!band && type === 'blob47') {
        band = (s.n && s.e && !s.ne && dn < d && de < d)
            || (s.s && s.e && !s.se && ds < d && de < d)
            || (s.s && s.w && !s.sw && ds < d && dw < d)
            || (s.n && s.w && !s.nw && dn < d && dw < d)
      }
      if (band) {
        map[k] = shade(ci)
        continue
      }
      // Dither seam: checker pattern on the row just inside the band.
      if (buildDither.value && (x + y) % 2 === 0) {
        const seam = (!s.n && dn === d) || (!s.s && ds === d) || (!s.w && dw === d) || (!s.e && de === d)
        if (seam) map[k] = shade(ci)
      }
    }
  }
  return {colors, map}
}

// Live preview, two canvases:
//  - demo: a small painted scene resolved through the real auto-tile logic —
//    this is what the terrain will look like on a map.
//  - variants: every composed slot, for inspection.
const buildDemoEl = ref<HTMLCanvasElement | null>(null)
const buildPreviewEl = ref<HTMLCanvasElement | null>(null)

// Covers center, edges, corners, a lone strip and an isolated cell.
const DEMO_PATTERN = ['XXXX.X', 'XXXX..', 'XXXX.X', '......', 'XX.X..']

function paintComposed(ctx: CanvasRenderingContext2D, composed: { colors: string[]; map: Record<string, number> }, ox: number, oy: number, pz: number) {
  for (const [k, ci] of Object.entries(composed.map)) {
    const [x, y] = k.split('_').map(Number)
    ctx.fillStyle = composed.colors[ci] || '#000'
    ctx.fillRect(ox + x! * pz, oy + y! * pz, pz, pz)
  }
}

function drawBuildPreview() {
  const g = activeGroup.value
  const base = buildBase.value
  const ts = tileset.value
  if (!g || g.kind !== 'terrain' || !ts) return
  const type = g.type || 'wang16'
  const {w: W, h: H} = ts.cell
  const composedCache = new Map<number, { colors: string[]; map: Record<string, number> }>()
  const composedFor = (mask: number) => {
    if (!composedCache.has(mask)) composedCache.set(mask, composeMask(base!, mask, type))
    return composedCache.get(mask)!
  }

  // Painted demo scene — a staggered diamond layout for iso, a flat grid
  // otherwise, so the preview reads the way the terrain will on a real map.
  const demo = buildDemoEl.value
  if (demo) {
    const ctx = demo.getContext('2d')
    if (ctx) {
      const cols = DEMO_PATTERN[0]!.length
      const rows = DEMO_PATTERN.length
      const marks: Record<string, string> = {}
      DEMO_PATTERN.forEach((row, r) => row.split('').forEach((ch, c) => {
        if (ch === 'X') marks[`${c}_${r}`] = 't'
      }))
      const cells = Object.keys(marks).map(k => k.split('_').map(Number) as [number, number])
      if (ts.iso) {
        const hw = W / 2, hh = H / 2
        const pz = Math.max(1, Math.floor(220 / ((cols + rows) * hw)))
        const originX = rows * hw
        demo.width = Math.ceil(((cols + rows) * hw + hw) * pz)
        demo.height = Math.ceil(((cols + rows) * hh + H) * pz)
        ctx.clearRect(0, 0, demo.width, demo.height)
        if (base) {
          // Painter's order: back rows (smaller c+r) first so front tiles overlap.
          cells.sort((p, q) => (p[0] + p[1]) - (q[0] + q[1])).forEach(([c, r]) => {
            const mask = terrainMask(marks, c, r, 't', type)
            const cx = originX + (c - r) * hw
            const cy = (c + r) * hh + hh   // + hh top pad
            paintComposed(ctx, composedFor(mask), Math.round((cx - hw) * pz), Math.round((cy - hh) * pz), pz)
          })
        }
      } else {
        const pz = Math.max(2, Math.floor(220 / (cols * W)))
        demo.width = cols * W * pz
        demo.height = rows * H * pz
        ctx.clearRect(0, 0, demo.width, demo.height)
        if (base) {
          for (const [c, r] of cells) {
            const mask = terrainMask(marks, c, r, 't', type)
            paintComposed(ctx, composedFor(mask), c * W * pz, r * H * pz, pz)
          }
        }
      }
    }
  }

  // Variant grid.
  const cv = buildPreviewEl.value
  if (cv) {
    const ctx = cv.getContext('2d')
    if (ctx) {
      const n = terrainGridN(g)
      const pz = Math.max(1, Math.floor(48 / Math.max(W, H)))
      const gap = 2
      cv.width = n * (W * pz + gap) - gap
      cv.height = n * (H * pz + gap) - gap
      ctx.clearRect(0, 0, cv.width, cv.height)
      if (base) {
        terrainSlots(g).forEach((mask, i) => {
          paintComposed(ctx, composedFor(mask), (i % n) * (W * pz + gap), Math.floor(i / n) * (H * pz + gap), pz)
        })
      }
    }
  }
}

// Refetch the source arts + redraw whenever the modal inputs change.
async function fetchInto(target: typeof buildBase, id: number | null) {
  const slug = slugOf(id)
  target.value = slug ? await fetchBaseData(slug) : null
}

async function fetchBuildSources() {
  await Promise.all([
    fetchInto(buildBase, buildBaseId.value),
    fetchInto(buildEdge, buildEdgeId.value),
    fetchInto(buildCorner, buildCornerId.value),
    fetchInto(buildUnder, buildUnderId.value),
    fetchInto(buildInner, buildInnerId.value),
    ...BUILD_SIDES.map(async sd => {
      const slug = slugOf(buildSideIds[sd])
      buildSideArts[sd] = slug ? await fetchBaseData(slug) : null
    }),
    (async () => {
      const arts = await Promise.all(buildVarIds.value.map(id => {
        const slug = slugOf(id)
        return slug ? fetchBaseData(slug) : null
      }))
      buildVarArts.value = arts.filter(Boolean) as ArtData[]
    })(),
  ])
}

watch(
    () => showBuild.value
        ? [buildBaseId.value, buildEdgeId.value, buildCornerId.value, buildUnderId.value, buildInnerId.value,
          ...BUILD_SIDES.map(sd => buildSideIds[sd]), ...buildVarIds.value].join('|')
        : '',
    async () => {
      if (!showBuild.value) return
      await fetchBuildSources()
      nextTick(drawBuildPreview)
    },
    {immediate: true},
)
watch([buildStyle, buildDepth, buildMode, buildRounded, buildDither, buildCut, buildBase], () => nextTick(drawBuildPreview))

// ── Local-first generation ──────────────────────────────────────────
// Generate only COMPOSES locally: the variants render on the board as a
// pending preview. Nothing touches the backend until the tileset is saved —
// materializePendingBuilds() then creates/updates the real SharedPages.
interface PendingBuild {
  recipe: any
  variants: Map<number, { colors: string[]; map: Record<string, number> }>
  canvases: Map<number, HTMLCanvasElement>
}

const pendingBuilds = new Map<string, PendingBuild>()

function renderComposedCanvas(composed: { colors: string[]; map: Record<string, number> }) {
  const cell = tileset.value?.cell || {w: 16, h: 16}
  const cv = document.createElement('canvas')
  cv.width = cell.w
  cv.height = cell.h
  const ctx = cv.getContext('2d')!
  for (const [k, ci] of Object.entries(composed.map)) {
    const [x, y] = k.split('_').map(Number)
    ctx.fillStyle = composed.colors[ci] || '#000'
    ctx.fillRect(x!, y!, 1, 1)
  }
  return cv
}

function generateBorders(gArg?: TileGroup, silent = false) {
  // Guard: a bare template binding would pass the click event here.
  const g = (gArg && typeof (gArg as any).kind === 'string') ? gArg : activeGroup.value
  const ts = tileset.value
  const base = buildBase.value
  if (!g || g.kind !== 'terrain' || !ts || !base || building.value) return
  if (buildStyle.value === 'edge' && !buildEdge.value) return
  building.value = true
  try {
    commit()
    // Sources picked from Search join the tileset (locally; saved with it).
    const ensureInSet = (id: number | null) => {
      if (id == null || ts.registry[String(id)]) return
      const slug = buildSlugs[id]
      if (!slug) return
      ts.registry[String(id)] = slug
      ts.groups.find(x => x.kind === 'group')?.tiles.push(id)
    }
    ensureInSet(buildBaseId.value)
    ensureInSet(buildUnderId.value)
    if (buildStyle.value === 'edge') {
      ensureInSet(buildEdgeId.value)
      ensureInSet(buildCornerId.value)
      ensureInSet(buildInnerId.value)
      for (const sd of BUILD_SIDES) ensureInSet(buildSideIds[sd])
      for (const id of buildVarIds.value) ensureInSet(id)
    }
    // Fill: no art generated — just point every mask at the base tile. The 3D
    // block borders itself, and no duplicate tiles are created.
    if (buildStyle.value === 'fill') {
      const fillMap = g.map || (g.map = {})
      const fillMasks = terrainSlots(g)
      for (const mask of fillMasks) fillMap[String(mask)] = buildBaseId.value!
      ;(g as any).builder = {style: 'fill', base: buildBaseId.value}
      pendingBuilds.delete(g.id)
      dirty.value = true
      showBuild.value = false
      if (!auth.isLogged) autosaveLocal()
      if (!silent) toast.success(`Filled ${fillMasks.length} tiles with the base`)
      scheduleDraw()
      return
    }
    const masks = terrainSlots(g)
    const variants = new Map<number, { colors: string[]; map: Record<string, number> }>()
    const canvases = new Map<number, HTMLCanvasElement>()
    for (const mask of masks) {
      const composed = composeMask(base, mask, g.type || 'wang16')
      variants.set(mask, composed)
      canvases.set(mask, renderComposedCanvas(composed))
    }
    pendingBuilds.set(g.id, {
      recipe: {
        style: buildStyle.value, base: buildBaseId.value,
        edge: buildEdgeId.value, corner: buildCornerId.value,
        under: buildUnderId.value, inner: buildInnerId.value,
        sides: Object.fromEntries(BUILD_SIDES.filter(sd => buildSideIds[sd] != null).map(sd => [sd, buildSideIds[sd]])),
        vars: [...buildVarIds.value],
        cut: buildCut.value,
        depth: buildDepth.value, mode: buildMode.value,
        rounded: buildRounded.value, dither: buildDither.value,
        baseUpdated: base.updated || '',
      },
      variants, canvases,
    })
    dirty.value = true
    showBuild.value = false
    // pendingBuilds isn't reactive — the JSON autosave watch can't see it.
    if (!auth.isLogged) autosaveLocal()
    if (!silent) toast.success(`Borders composed — Save to create ${masks.length} tiles`)
    scheduleDraw()
  } catch {
    toast.error('Could not compose borders')
  } finally {
    building.value = false
  }
}

// On Save: turn every pending build into real SharedPages (create new slots,
// update ones generated before), then the tileset meta is persisted.
async function materializePendingBuilds() {
  const ts = tileset.value
  if (!ts || !pendingBuilds.size) return
  // Guests have no cloud → each variant becomes a local-library tile (pixel data
  // inline). Signed-in → a real SharedPage per variant. Both paths carry the
  // tileset's cell size, so isometric tilesets (e.g. 32×16) generate the right
  // shape and the tilemap opens them in iso mode via the iso flag.
  const guest = !!ts.localId || !auth.isLogged
  const lid = guest ? ensureLocalTilesetId() : null
  for (const [gid, pend] of [...pendingBuilds]) {
    const g = ts.groups.find(x => x.id === gid)
    if (!g || g.kind !== 'terrain') {
      pendingBuilds.delete(gid)
      continue
    }
    const pages: Record<string, any> = {...((g.builder as any)?.pages || {})}
    const map = g.map || (g.map = {})
    const entries = [...pend.variants]
    for (let i = 0; i < entries.length; i++) {
      const [mask, composed] = entries[i]!
      buildProgress.value = `${i + 1}/${entries.length}`

      if (guest && lid) {
        // Reuse the stored ed.id on regenerate so the tile updates in place
        // (addTile is idempotent by ed.id) — worlds/maps using it stay linked.
        const prev = pages[String(mask)]
        const ed = {
          ...cloneDeep(DEFAULT_EDITOR_DATA),
          id: (typeof prev === 'string' && prev) ? prev : generateUUID(),
          name: `${g.name} ${mask}`,
          width: ts.cell.w, height: ts.cell.h,
          colors: composed.colors,
          layers: [{name: 'Layer 1', x: 0, y: 0, pixels: composed.map}],
          updated: new Date().toISOString(),
        } as any
        const tile = localTs.addTile(lid, {name: ed.name, ed})
        if (tile) {
          pages[String(mask)] = ed.id
          ts.registry[String(tile.tid)] = ed.id
          localThumbs.set(ed.id, tile.thumb)     // render on the board immediately
          map[String(mask)] = tile.tid
        }
        continue
      }

      const body = {
        name: `${g.name} ${mask}`,
        desc: '',
        tags: [],
        width: ts.cell.w,
        height: ts.cell.h,
        colors: composed.colors,
        layers: [{name: 'Layer 1', x: 0, y: 0, pixels: composed.map}],
        map_numbers: composed.map,
        is_public: false,
        // Generated terrain tile — flagged so it's kept out of public feeds
        // (belongs only to the terrain / tileset / tilemap). is_tile is read-only
        // server-side, so regenerating (PUT) leaves it set.
        is_tile: true,
      }
      const existing = pages[String(mask)]
      if (existing && ts.registry[String(existing)]) {
        // Regenerate in place — worlds already painted with it update too.
        await useNativeFetch(`/coloring/shared-pages/${existing}/`, {method: 'PUT', body})
      } else {
        const res = await useNativeFetch<any>('/coloring/shared-pages/', {method: 'POST', body: {...body, id_string: ''}})
        pages[String(mask)] = res.id
        ts.registry[String(res.id)] = res.id_string
      }
      map[String(mask)] = pages[String(mask)]!
    }
    ;(g as any).builder = {...pend.recipe, pages}
    pendingBuilds.delete(gid)
  }
  imgCache.clear()          // regenerated art must re-render on the board
  buildProgress.value = ''
  scheduleDraw()
}

// Tilesetter-style instant build: dropping a tile on the fully-connected
// (center) slot of an EMPTY terrain builds the whole set from it, no modal.
function centerMask(g: TileGroup) {
  return g.type === 'blob47' ? 255 : 15
}

async function quickBuild(g: TileGroup, baseId: number, silent = false) {
  if (building.value) return
  const slug = slugOf(baseId)
  if (!slug) return
  // Recipe params if the group has one, defaults otherwise.
  seedBuildParams(g.builder)
  buildBaseId.value = baseId
  if (!silent) toast.info?.(`Building borders from ${slug}…`)
  await fetchBuildSources()
  if (buildStyle.value === 'edge' && !buildEdge.value) buildStyle.value = 'auto'
  await generateBorders(g, silent)
}

// After the base art is edited in the pixel editor, regenerate every terrain
// that was built from it. One batched list call (?ids=) checks timestamps;
// legacy recipes without a stamp are stamped quietly instead of rebuilt.
async function syncBuilders() {
  const ts = tileset.value
  if (!ts) return
  const targets = ts.groups.filter(g =>
      g.kind === 'terrain' && (g.builder as any)?.base && (g.builder as any)?.pages && ts.registry[String((g.builder as any).base)])
  if (!targets.length) return
  const ids = [...new Set(targets.map(g => Number((g.builder as any).base)))]
  const updatedAt: Record<number, string> = {}
  try {
    const res = await useNativeFetch<any>('/coloring/shared-pages/', {
      params: {ids: ids.join(','), page_size: ids.length},
    })
    for (const p of res?.results || []) updatedAt[Number(p.id)] = String(p.updated || '')
  } catch {
    return
  }
  for (const g of targets) {
    const r: any = g.builder
    const fresh = updatedAt[Number(r.base)]
    if (!fresh) continue
    if (!r.baseUpdated) {
      r.baseUpdated = fresh
      continue
    }
    if (fresh === r.baseUpdated) continue
    await quickBuild(g, Number(r.base), true)
    toast.success(`"${g.name}" borders re-composed from the edited base — Save to apply`)
  }
}

// Click a slot: with a tile selected → place it (selection sticks, so you can
// fill several slots in a row). Without a selection → clear the slot.
// Placing onto the center slot of an EMPTY terrain auto-builds the whole set.
function slotClick(g: TileGroup, mask: number) {
  const map = g.map || (g.map = {})
  if (selectedTileId.value != null) {
    if (mask === centerMask(g) && !Object.keys(map).length) {
      quickBuild(g, selectedTileId.value)
      return
    }
    commit()
    map[String(mask)] = selectedTileId.value
    dirty.value = true
  } else if (map[String(mask)]) {
    commit()
    delete map[String(mask)]
    dirty.value = true
  }
}

function slotTile(g: TileGroup, mask: number): string | null {
  const id = g.map?.[String(mask)]
  return id != null ? (tileset.value?.registry[String(id)] || null) : null
}

// ── Board canvas: the workspace is drawn, not DOM ───────────────────
// Layout → draw → hit-test; pointer drag moves tiles between groups, fills
// terrain slots, and reorders groups.
const boardEl = ref<HTMLCanvasElement | null>(null)

const HEAD_H = 22          // group header band (screen px, zoom-independent)
const GAP_N = 14           // native-px gap used by auto-arrange
const SLOT_GAP_N = 0       // terrain slots sit flush; the per-slot grid line distinguishes them

interface HitRect {
  kind: 'tile' | 'slot' | 'head' | 'body'
  group: string
  index: number            // tile position / slot mask; 0 for head/body
  x: number; y: number; w: number; h: number
}

let layoutRects: HitRect[] = []

// Group content size in native (unzoomed) pixels.
function groupSizeNative(g: TileGroup) {
  const cell = tileset.value?.cell || {w: 32, h: 32}
  if (g.kind === 'terrain') {
    const n = terrainGridN(g)
    return {w: n * cell.w + (n - 1) * SLOT_GAP_N, h: n * cell.h + (n - 1) * SLOT_GAP_N}
  }
  const L = layoutGroupTiles(g)
  return {w: L.w, h: L.h}
}

function computeLayout() {
  const ts = tileset.value
  const rects: HitRect[] = []
  if (!ts) return rects
  const z = zoom.value
  for (const g of ts.groups) {
    const size = groupSizeNative(g)
    // Whole-pixel group origins keep pixel art and frames crisp while panning.
    const sx = Math.round(cam.value.x + (g.x ?? 0) * z)
    const sy = Math.round(cam.value.y + (g.y ?? 0) * z)
    const bw = size.w * z
    const bh = size.h * z
    if (g.kind === 'group') {
      const L = layoutGroupTiles(g)
      const bx = sx + L.minX * z
      const by = sy + L.minY * z
      rects.push({kind: 'head', group: g.id, index: 0, x: bx, y: by - HEAD_H, w: Math.max(120, bw), h: HEAD_H})
      rects.push({kind: 'body', group: g.id, index: 0, x: bx, y: by, w: bw, h: bh})
      g.tiles.forEach((_, i) => {
        const r = L.rects[i]!
        rects.push({
          kind: 'tile', group: g.id, index: i,
          x: sx + r.x * z, y: sy + r.y * z, w: r.w * z, h: r.h * z,
        })
      })
    } else {
      rects.push({kind: 'head', group: g.id, index: 0, x: sx, y: sy - HEAD_H, w: Math.max(120, bw), h: HEAD_H})
      rects.push({kind: 'body', group: g.id, index: 0, x: sx, y: sy, w: bw, h: bh})
      const n = terrainGridN(g)
      const sw = (size.w * z - (n - 1) * SLOT_GAP_N * z) / n
      terrainSlots(g).forEach((mask, i) => {
        rects.push({
          kind: 'slot', group: g.id, index: mask,
          x: sx + (i % n) * (sw + SLOT_GAP_N * z), y: sy + Math.floor(i / n) * (sw + SLOT_GAP_N * z), w: sw, h: sw,
        })
      })
    }
  }
  return rects
}

// Shelf-pack all groups tightly; array order follows the visual arrangement
// (top→bottom, left→right) so the exported sheet matches what you see.
function autoArrange(markDirty = true) {
  const ts = tileset.value
  if (!ts || !ts.groups.length) return
  if (markDirty) commit()
  // Unpin every tile so groups repack their contents tightly too.
  for (const g of ts.groups) delete g.pos
  const items = ts.groups.map(g => ({g, ...groupSizeNative(g)}))
  items.sort((a, b) => ((a.g.y ?? 0) - (b.g.y ?? 0)) || ((a.g.x ?? 0) - (b.g.x ?? 0)))
  ts.groups = items.map(i => i.g)
  const vGap = GAP_N + Math.ceil(HEAD_H / zoom.value)
  const area = items.reduce((s, i) => s + (i.w + GAP_N) * (i.h + vGap), 0)
  const target = Math.max(...items.map(i => i.w), Math.ceil(Math.sqrt(area)))
  let x = 0
  let y = 0
  let rowH = 0
  for (const it of items) {
    if (x > 0 && x + it.w > target) {
      x = 0
      y += rowH + vGap
      rowH = 0
    }
    it.g.x = x
    it.g.y = y
    x += it.w + GAP_N
    rowH = Math.max(rowH, it.h)
  }
  if (markDirty) dirty.value = true
  nextTick(fitView)
  scheduleDraw()
}

// Tile images load lazily; each arrival repaints.
const imgCache = new Map<string, HTMLImageElement | null>()
function boardImg(slug: string): HTMLImageElement | null {
  if (!imgCache.has(slug)) {
    imgCache.set(slug, null)
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      imgCache.set(slug, img)
      scheduleDraw()
    }
    img.src = tileSrc(slug)
  }
  return imgCache.get(slug) || null
}

function cssVar(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888'
}

let checkerPattern: CanvasPattern | null = null
function makeChecker(ctx: CanvasRenderingContext2D) {
  if (checkerPattern) return checkerPattern
  const c = document.createElement('canvas')
  c.width = c.height = 16
  const x = c.getContext('2d')!
  x.fillStyle = 'rgba(127, 127, 127, 0.12)'
  x.fillRect(0, 0, 8, 8)
  x.fillRect(8, 8, 8, 8)
  checkerPattern = ctx.createPattern(c, 'repeat')
  return checkerPattern
}

function drawTileImage(ctx: CanvasRenderingContext2D, slug: string | null, x: number, y: number, w: number, h: number) {
  const img = slug ? boardImg(slug) : null
  if (!img) return
  const scale = Math.min(w / img.naturalWidth, h / img.naturalHeight)
  const dw = Math.max(1, Math.round(img.naturalWidth * scale))
  const dh = Math.max(1, Math.round(img.naturalHeight * scale))
  ctx.drawImage(img, x + Math.floor((w - dw) / 2), y + Math.floor((h - dh) / 2), dw, dh)
}

// Drag state (pointer-driven, drawn on the canvas).
let press: { x: number; y: number; hit: HitRect; pid: number; add: boolean } | null = null
const boardDrag = ref<{
  kind: 'tile' | 'head'
  group: string
  index: number
  id: number
  px: number
  py: number
  ox: number
  oy: number
  // Multi-drag: the other selected tiles ride along at these native offsets.
  others?: { id: number; group: string; odx: number; ody: number }[]
} | null>(null)
let dropSpot: HitRect | null = null

// Selection: a tile or a whole group (mutually exclusive).
const selectedGroupId = ref<string | null>(null)

function selectGroup(gid: string) {
  selectedGroupId.value = selectedGroupId.value === gid ? null : gid
}

const activeGroup = computed(() =>
    tileset.value?.groups.find(g => g.id === selectedGroupId.value) || null,
)

function draw() {
  const cv = boardEl.value
  const ts = tileset.value
  const host = stageEl.value
  if (!cv || !ts || !host) return
  layoutRects = computeLayout()
  // The canvas always fills the stage — content position comes from the camera.
  // Render at the device pixel ratio so lines and pixel art stay crisp on
  // hi-dpi screens; all drawing below stays in CSS-pixel coordinates.
  const dpr = window.devicePixelRatio || 1
  const W = host.clientWidth
  const H = host.clientHeight
  const pw = Math.round(W * dpr)
  const ph = Math.round(H * dpr)
  if (cv.width !== pw) cv.width = pw
  if (cv.height !== ph) cv.height = ph
  cv.style.width = `${W}px`
  cv.style.height = `${H}px`
  const ctx = cv.getContext('2d')
  if (!ctx) return
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.imageSmoothingEnabled = false
  ctx.clearRect(0, 0, W, H)

  // Board background (chosen in the Canvas settings — was the CSS stage bg).
  ctx.fillStyle = boardBg.value || '#1b1b1f'
  ctx.fillRect(0, 0, W, H)

  const muted = cssVar('--muted')
  const border = cssVar('--border')
  const primary = cssVar('--primary')
  const checker = makeChecker(ctx)
  const d = boardDrag.value

  // Base-cell grid across the whole board, aligned to the world origin.
  // Step spans `boardGridStep` base cells; style/on-off come from Canvas
  // settings. Hairlines snap to a device pixel and stroke exactly one.
  const gz = zoom.value
  const factor = Math.max(1, boardGridStep.value)
  const stepX = ts.cell.w * factor * gz
  const stepY = ts.cell.h * factor * gz
  if (boardGrid.value && stepX >= 6 && stepY >= 6) {
    const gcolor = boardIsLight() ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.14)'
    const ox = ((cam.value.x % stepX) + stepX) % stepX
    const oy = ((cam.value.y % stepY) + stepY) % stepY
    if (boardGridStyle.value === 'dots') {
      ctx.fillStyle = gcolor
      for (let gx = ox; gx <= W; gx += stepX)
        for (let gy = oy; gy <= H; gy += stepY)
          ctx.fillRect(Math.round(gx) - 0.5, Math.round(gy) - 0.5, 1.5, 1.5)
    } else {
      const snap = (v: number) => Math.round(v * dpr) / dpr + 0.5 / dpr
      ctx.strokeStyle = gcolor
      ctx.lineWidth = 1 / dpr
      ctx.setLineDash(boardGridStyle.value === 'dashed' ? [3, 4] : [])
      ctx.beginPath()
      for (let gx = ox; gx <= W; gx += stepX) {
        ctx.moveTo(snap(gx), 0)
        ctx.lineTo(snap(gx), H)
      }
      for (let gy = oy; gy <= H; gy += stepY) {
        ctx.moveTo(0, snap(gy))
        ctx.lineTo(W, snap(gy))
      }
      ctx.stroke()
      ctx.setLineDash([])
    }
  }

  for (const g of ts.groups) {
    const head = layoutRects.find(r => r.kind === 'head' && r.group === g.id)!
    const body = layoutRects.find(r => r.kind === 'body' && r.group === g.id)!
    const active = selectedGroupId.value === g.id || (d?.kind === 'head' && d.group === g.id)

    // Header: NAME  count (a canvas chrome toggle can hide it)
    if (showBoardChrome.value) {
      ctx.font = '700 10px sans-serif'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = active ? primary : muted
      const label = g.name.toUpperCase()
      ctx.fillText(label, head.x, head.y + HEAD_H / 2 - 2)
      const lw = ctx.measureText(label).width
      ctx.font = '600 10px sans-serif'
      ctx.fillStyle = muted
      ctx.globalAlpha = 0.6
      ctx.fillText(
          g.kind === 'terrain'
              ? `${pendingBuilds.has(g.id) ? `${pendingBuilds.get(g.id)!.variants.size} pending` : Object.keys(g.map || {}).length}/${terrainSlots(g).length}`
              : String(g.tiles.length),
          head.x + lw + 8, head.y + HEAD_H / 2 - 2,
      )
      ctx.globalAlpha = 1
    }

    if (g.kind === 'group') {
      // Sheet checker + frame — the frame just recolors to primary when the
      // group is active (matches the art editor's selection cue; no outer ring).
      if (checker) {
        ctx.fillStyle = checker
        ctx.fillRect(body.x, body.y, body.w, body.h)
      }
      ctx.strokeStyle = active ? primary : border
      ctx.strokeRect(body.x + 0.5, body.y + 0.5, body.w - 1, body.h - 1)
      if (!g.tiles.length) {
        ctx.fillStyle = muted
        ctx.font = '600 10px sans-serif'
        ctx.globalAlpha = 0.7
        ctx.fillText('drag tiles here', body.x + 8, body.y + body.h / 2)
        ctx.globalAlpha = 1
      }
      for (const r of layoutRects) {
        if (r.kind !== 'tile' || r.group !== g.id) continue
        const id = g.tiles[r.index]!
        const img = boardImg(ts.registry[String(id)] || '')
        if (d?.kind === 'tile' && (d.id === id || d.others?.some(o => o.id === id))) ctx.globalAlpha = 0.3
        if (img) {
          // 1:1 pixels × zoom, centered in the tile's cell block — big art
          // simply spans more cells.
          const z = zoom.value
          const dw = img.naturalWidth * z
          const dh = img.naturalHeight * z
          ctx.drawImage(img, r.x + Math.floor((r.w - dw) / 2), r.y + Math.floor((r.h - dh) / 2), dw, dh)
        }
        ctx.globalAlpha = 1
        if (isTileSelected(id)) {
          ctx.strokeStyle = primary
          ctx.lineWidth = 2
          ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2)
          ctx.lineWidth = 1
        }
        // Weight badge on random-variant groups (×2..×9).
        const wgt = g.random ? Number(g.weights?.[String(id)]) || 1 : 1
        if (wgt > 1 && r.w >= 24) {
          ctx.font = '700 9px sans-serif'
          ctx.fillStyle = primary
          ctx.globalAlpha = 0.9
          ctx.fillText(`×${wgt}`, r.x + 2, r.y + r.h - 6)
          ctx.globalAlpha = 1
        }
      }
    } else {
      // Terrain: 16 connection slots with N/E/S/W glyphs. Slots sit flush, so
      // the grid is collected into one path and stroked ONCE after the tiles —
      // shared neighbour edges then paint as a single crisp line (no doubling).
      const gridPath = new Path2D()
      const gsnap = (v: number) => Math.round(v * dpr) / dpr + 0.5 / dpr
      for (const r of layoutRects) {
        if (r.kind !== 'slot' || r.group !== g.id) continue
        const slug = slotTile(g, r.index)
        const pendCv = !slug ? pendingBuilds.get(g.id)?.canvases.get(r.index) : null
        // Slots sit flush so the terrain reads as one continuous surface; the
        // tile fills its whole cell and the grid line is stroked on top.
        if (checker && slug) {
          ctx.fillStyle = checker
          ctx.fillRect(r.x, r.y, r.w, r.h)
        }
        if (slug) {
          drawTileImage(ctx, slug, r.x, r.y, r.w, r.h)
        } else if (pendCv) {
          // Unsaved Build-borders preview — drawn straight from local pixels.
          ctx.drawImage(pendCv, r.x, r.y, r.w, r.h)
        }
        // Collect this cell's outline; stroked as one path after the loop.
        gridPath.rect(gsnap(r.x), gsnap(r.y), gsnap(r.x + r.w) - gsnap(r.x), gsnap(r.y + r.h) - gsnap(r.y))
        // Empty terrain: spotlight the center slot — dropping a base tile
        // there auto-builds the entire set (Tilesetter-style).
        if (!Object.keys(g.map || {}).length && !pendingBuilds.has(g.id) && r.index === centerMask(g)) {
          ctx.strokeStyle = primary
          ctx.lineWidth = 2
          ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2)
          ctx.lineWidth = 1
          ctx.fillStyle = primary
          ctx.globalAlpha = 0.85
          ctx.font = `700 ${Math.max(8, Math.min(11, Math.floor(r.w / 4)))}px sans-serif`
          ctx.textAlign = 'center'
          ctx.fillText('BASE', r.x + r.w / 2, r.y + r.h / 2)
          ctx.textAlign = 'left'
          ctx.globalAlpha = 1
        }
        // Connection glyph (corner when filled, centered when empty).
        // Skipped on the spotlighted BASE slot so the label stays readable.
        if (pendCv) continue
        if (!Object.keys(g.map || {}).length && !pendingBuilds.has(g.id) && r.index === centerMask(g)) continue
        const sides = slotSides(r.index)
        const gs = slug ? 3 : Math.max(4, Math.round(r.w / 9))
        const gap = slug ? 1 : 2
        const cx = slug ? r.x + 4 + gs : r.x + r.w / 2
        const cy = slug ? r.y + r.h - 4 - gs : r.y + r.h / 2
        const dot = (dx: number, dy: number, on: boolean) => {
          ctx.fillStyle = on ? primary : muted
          ctx.globalAlpha = on ? 0.9 : 0.25
          ctx.fillRect(Math.round(cx + dx * (gs + gap) - gs / 2), Math.round(cy + dy * (gs + gap) - gs / 2), gs, gs)
          ctx.globalAlpha = 1
        }
        dot(0, 0, true)
        dot(0, -1, sides.n)
        dot(1, 0, sides.e)
        dot(0, 1, sides.s)
        dot(-1, 0, sides.w)
        if (g.type === 'blob47') {
          dot(1, -1, sides.ne)
          dot(1, 1, sides.se)
          dot(-1, 1, sides.sw)
          dot(-1, -1, sides.nw)
        }
      }
      // Grid over all cells in one stroke — coincident interior edges paint once.
      ctx.strokeStyle = (selectedTileId.value != null || d?.kind === 'tile') ? primary : border
      ctx.globalAlpha = (selectedTileId.value != null || d?.kind === 'tile') ? 0.6 : 1
      ctx.lineWidth = 1 / dpr
      ctx.stroke(gridPath)
      ctx.globalAlpha = 1
      ctx.lineWidth = 1
      // Active terrain → recolor a body frame primary (no outer ring), matching
      // the plain-group selection cue.
      if (active) {
        ctx.strokeStyle = primary
        ctx.lineWidth = 1
        ctx.strokeRect(body.x + 0.5, body.y + 0.5, body.w - 1, body.h - 1)
      }
    }
  }

  // Drop indicator — terrain slots only (tiles place freely).
  if (d?.kind === 'tile' && dropSpot?.kind === 'slot') {
    ctx.strokeStyle = primary
    ctx.lineWidth = 2
    ctx.strokeRect(dropSpot.x + 1, dropSpot.y + 1, dropSpot.w - 2, dropSpot.h - 2)
    ctx.lineWidth = 1
  }
  // Drag ghost (+ multi-drag companions at their offsets)
  if (d?.kind === 'tile') {
    const gz2 = zoom.value
    ctx.globalAlpha = 0.8
    drawTileImage(ctx, ts.registry[String(d.id)] || null, d.px - cellPx.value.w / 2, d.py - cellPx.value.h / 2, cellPx.value.w, cellPx.value.h)
    for (const o of d.others || []) {
      drawTileImage(ctx, ts.registry[String(o.id)] || null, d.px - cellPx.value.w / 2 + o.odx * gz2, d.py - cellPx.value.h / 2 + o.ody * gz2, cellPx.value.w, cellPx.value.h)
    }
    ctx.globalAlpha = 1
  }
}

let rafId = 0
function scheduleDraw() {
  if (import.meta.server || rafId) return
  rafId = requestAnimationFrame(() => {
    rafId = 0
    draw()
  })
}

watch(
    () => {
      const ts = tileset.value
      return ts ? JSON.stringify([ts.groups, Object.keys(ts.registry), ts.cell]) + `|${zoom.value}|${cam.value.x},${cam.value.y}|${selectedTileId.value}|${selectedGroupId.value}` : ''
    },
    () => nextTick(scheduleDraw),
    {immediate: true},
)

// Persist the view (zoom / camera / board display) locally on any change so a
// reload (F5) restores it. Debounced — pans and zooms fire rapidly.
watch(
    () => `${zoom.value}|${cam.value.x},${cam.value.y}|${boardBg.value}|${boardGrid.value}|${boardGridStep.value}|${boardGridStyle.value}`,
    () => saveViewSoon(),
)

// ── Board pointer interactions ──────────────────────────────────────
function boardPoint(e: PointerEvent) {
  const cv = boardEl.value!
  const rect = cv.getBoundingClientRect()
  return {x: e.clientX - rect.left, y: e.clientY - rect.top}
}

// Topmost interactive rect wins: tiles/slots first, then head/body of the
// group drawn last (groups may overlap on a free canvas).
function hitAt(x: number, y: number): HitRect | null {
  let fallback: HitRect | null = null
  for (let i = layoutRects.length - 1; i >= 0; i--) {
    const r = layoutRects[i]!
    if (x < r.x || y < r.y || x > r.x + r.w || y > r.y + r.h) continue
    if (r.kind === 'tile' || r.kind === 'slot') return r
    if (!fallback) fallback = r
  }
  return fallback
}

function groupById(gid: string) {
  return tileset.value?.groups.find(g => g.id === gid) || null
}

function boardDown(e: PointerEvent) {
  if (e.button !== 0) return
  const {x, y} = boardPoint(e)
  const hit = hitAt(x, y)
  if (!hit) return           // empty board space → bubbles up to stage pan
  e.stopPropagation()
  boardEl.value?.setPointerCapture?.(e.pointerId)
  press = {x, y, hit, pid: e.pointerId, add: e.shiftKey || e.metaKey || e.ctrlKey}
}

function boardMove(e: PointerEvent) {
  const cv = boardEl.value
  if (!cv) return
  const {x, y} = boardPoint(e)
  if (press && !boardDrag.value && Math.hypot(x - press.x, y - press.y) > 4) {
    const h = press.hit
    const g = groupById(h.group)
    if (h.kind === 'tile' && g?.kind === 'group') {
      commit()
      const dragId = g.tiles[h.index]!
      // Dragging a tile that's part of a multi-selection moves the whole set.
      let others: { id: number; group: string; odx: number; ody: number }[] | undefined
      if (isTileSelected(dragId) && selectedTileIds.value.length > 1) {
        const z = zoom.value
        others = []
        for (const sid of selectedTileIds.value) {
          if (sid === dragId) continue
          const sr = layoutRects.find(r2 => {
            if (r2.kind !== 'tile') return false
            const sg = groupById(r2.group)
            return sg?.kind === 'group' && sg.tiles[r2.index] === sid
          })
          if (sr) others.push({id: sid, group: sr.group, odx: (sr.x - h.x) / z, ody: (sr.y - h.y) / z})
        }
      }
      boardDrag.value = {kind: 'tile', group: h.group, index: h.index, id: dragId, px: x, py: y, ox: 0, oy: 0, others}
    } else if (h.kind === 'head' || h.kind === 'body') {
      // Grab the whole group; offset from its content origin keeps the grip.
      const body = layoutRects.find(r => r.kind === 'body' && r.group === h.group)!
      commit()
      boardDrag.value = {kind: 'head', group: h.group, index: 0, id: 0, px: x, py: y, ox: press.x - body.x, oy: press.y - body.y}
    }
  }
  const d = boardDrag.value
  if (d) {
    d.px = x
    d.py = y
    if (d.kind === 'tile') {
      // Tiles place freely; only terrain slots need a drop highlight.
      const hit = hitAt(x, y)
      dropSpot = hit && hit.kind === 'slot' ? hit : null
    } else {
      // Free move: anywhere, no bounds — coords are camera-relative.
      const g = groupById(d.group)
      if (g) {
        const z = zoom.value
        g.x = (x - d.ox - cam.value.x) / z
        g.y = (y - d.oy - cam.value.y) / z
      }
    }
    cv.style.cursor = 'grabbing'
    scheduleDraw()
    return
  }
  const hover = hitAt(x, y)
  cv.style.cursor = hover
      ? (hover.kind === 'head' || hover.kind === 'body' ? 'grab' : 'pointer')
      : ''
}

function boardUp(e: PointerEvent) {
  const cv = boardEl.value
  const ts = tileset.value
  const d = boardDrag.value
  if (d && ts) {
    // Apply the drop
    if (d.kind === 'tile') {
      const from = groupById(d.group)
      const hit = hitAt(d.px, d.py)
      if (hit?.kind === 'slot' && groupById(hit.group)?.kind === 'terrain') {
        // Onto a terrain slot → assign (copies; the tile stays where it was).
        // Center slot of an empty terrain → build the entire set from it.
        const to = groupById(hit.group)!
        if (hit.index === centerMask(to) && !Object.keys(to.map || {}).length) {
          quickBuild(to, d.id)
        } else {
          ;(to.map || (to.map = {}))[String(hit.index)] = d.id
          dirty.value = true
        }
      } else if (from?.kind === 'group') {
        // Free placement: land in whichever plain group is under the cursor,
        // otherwise stay in the current group; position snaps to the cell grid.
        let to = from
        if (hit) {
          const under = groupById(hit.group)
          if (under?.kind === 'group') to = under
        }
        if (to !== from) {
          const i = from.tiles.indexOf(d.id)
          if (i >= 0) from.tiles.splice(i, 1)
          delete from.pos?.[String(d.id)]
          to.tiles.push(d.id)
        }
        const cell = ts.cell
        const z = zoom.value
        const c = cellsOf(d.id, sheetSource.value)
        const gx = cam.value.x + (to.x ?? 0) * z
        const gy = cam.value.y + (to.y ?? 0) * z
        const nx = Math.round((d.px - (c.cols * cell.w * z) / 2 - gx) / z / cell.w) * cell.w
        const ny = Math.round((d.py - (c.rows * cell.h * z) / 2 - gy) / z / cell.h) * cell.h
        ;(to.pos || (to.pos = {}))[String(d.id)] = {x: nx, y: ny}
        // Companions of a multi-drag keep their relative offsets.
        for (const o of d.others || []) {
          const src = groupById(o.group)
          if (src?.kind === 'group' && src !== to) {
            const i = src.tiles.indexOf(o.id)
            if (i >= 0) src.tiles.splice(i, 1)
            delete src.pos?.[String(o.id)]
            to.tiles.push(o.id)
          }
          ;(to.pos || (to.pos = {}))[String(o.id)] = {
            x: Math.round((nx + o.odx) / cell.w) * cell.w,
            y: Math.round((ny + o.ody) / cell.h) * cell.h,
          }
        }
        dirty.value = true
      }
    } else if (d.kind === 'head') {
      // Group was moved freely — snap its landing spot to the base-cell grid
      // so tiles inside stay aligned with the board grid.
      const g = groupById(d.group)
      if (g) {
        g.x = Math.round((g.x ?? 0) / ts.cell.w) * ts.cell.w
        g.y = Math.round((g.y ?? 0) / ts.cell.h) * ts.cell.h
      }
      dirty.value = true
    }
  } else if (press && ts) {
    // A press that never travelled → click
    const h = press.hit
    const g = groupById(h.group)
    if ((h.kind === 'head' || h.kind === 'body') && g) {
      selectGroup(g.id)
    } else if (h.kind === 'tile' && g?.kind === 'group') {
      const id = g.tiles[h.index]
      if (id != null) selectTile(id, press.add)
    } else if (h.kind === 'slot' && g?.kind === 'terrain') {
      slotClick(g, h.index)
    }
  }
  press = null
  boardDrag.value = null
  dropSpot = null
  if (cv) {
    cv.releasePointerCapture?.(e.pointerId)
    cv.style.cursor = ''
  }
  scheduleDraw()
}

// ── Manage tiles modal: search/collection as source, batch add + remove ──
const showAdd = ref(false)
const searchQuery = ref('')
const searchResults = ref<SharedPage[]>([])
const searching = ref(false)
const collectionSel = ref('')
// id -> id_string of tiles picked to add; id -> true marked for removal.
// Both are committed together on "Apply".
const picked = ref<Record<number, string>>({})
const toRemove = ref<Record<number, boolean>>({})

const pickedCount = computed(() => Object.keys(picked.value).length)
const removeCount = computed(() => Object.keys(toRemove.value).length)

// The "In tileset" section already shows owned tiles — keep results to new art.
const freshResults = computed(() => searchResults.value.filter(a => !inTileset(Number(a.id))))

const applyLabel = computed(() => {
  const parts: string[] = []
  if (pickedCount.value) parts.push(`Add ${pickedCount.value}`)
  if (removeCount.value) parts.push(`Remove ${removeCount.value}`)
  return parts.length ? parts.join(' · ') : 'Apply'
})

async function runSearch() {
  searching.value = true
  try {
    const q = searchQuery.value.trim()
    const res = await useNativeFetch<{ results: SharedPage[] }>('/coloring/shared-pages/', {
      params: {
        status: 'public', has_pages: 1, page_size: 24, page: 1,
        search: q || undefined, ordering: q ? undefined : '-updated',
      },
    })
    searchResults.value = Array.isArray(res.results) ? res.results.filter(r => r && r.id_string) : []
  } catch {
    searchResults.value = []
  } finally {
    searching.value = false
  }
}
const debouncedSearch = debounce(() => {
  collectionSel.value = ''
  runSearch()
}, 350)

const collections = ref<any[]>([])
async function fetchCollections() {
  if (!auth.isLogged) return
  try {
    const res = await useNativeFetch<any>('/coloring/collections/', {
      params: {mine: 1, page_size: 100, ordering: '-updated'},
    })
    collections.value = Array.isArray(res?.results) ? res.results : []
  } catch { collections.value = [] }
}

// A collection is just another source: load its items into the grid so the
// user still hand-picks which ones become tiles.
async function loadCollection(id: string) {
  if (!id) {
    runSearch()
    return
  }
  searching.value = true
  try {
    const detail = await useNativeFetch<any>(`/coloring/collections/${id}/`)
    const arts = Array.isArray(detail.items) ? detail.items.filter((it: any) => it?.id_string) : []
    searchQuery.value = ''
    searchResults.value = arts
  } catch {
    toast.error('Could not load that collection')
  } finally {
    searching.value = false
  }
}

function openAdd() {
  picked.value = {}
  toRemove.value = {}
  showAdd.value = true
  if (!searchResults.value.length) runSearch()
}

function togglePick(a: SharedPage) {
  const id = Number(a.id)
  if (inTileset(id)) return
  if (picked.value[id]) delete picked.value[id]
  else picked.value[id] = a.id_string
}

function toggleRemove(id: number) {
  if (toRemove.value[id]) delete toRemove.value[id]
  else toRemove.value[id] = true
}

function pickAll() {
  for (const a of freshResults.value) {
    picked.value[Number(a.id)] = a.id_string
  }
}

function applyChanges() {
  if (!tileset.value || (!pickedCount.value && !removeCount.value)) return
  commit()
  const added = pickedCount.value
  const removed = removeCount.value
  const home = tileset.value.groups.find(g => g.kind === 'group')
  for (const [id, idString] of Object.entries(picked.value)) {
    tileset.value.registry[id] = idString
    home?.tiles.push(Number(id))
  }
  for (const id of Object.keys(toRemove.value)) {
    removeTileById(Number(id))
  }
  dirty.value = true
  toast.success([added && `Added ${added}`, removed && `Removed ${removed}`].filter(Boolean).join(' · '))
  picked.value = {}
  toRemove.value = {}
  showAdd.value = false
}

// ── Import PNG files as tiles ──────────────────────────────────────────────
// Each selected image becomes ONE tile art (type "tile": meta.tile = true, so
// it's hidden from general art listings and belongs only to this tileset).
// Signed in → a cloud SharedPage per file; guest → the local library.
const pngInput = ref<HTMLInputElement | null>(null)
const importingPng = ref(false)
const PNG_TILE_MAX = 256   // safety cap per side (matches the cell-size max)

function openPngImport() {
  pngInput.value?.click()
}

function rgbHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('').toUpperCase()
}

// Decode one image file → an EditorData tile (+ a PNG thumbnail dataURL).
async function pngToTile(file: File): Promise<{ ed: EditorData; thumb: string } | null> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image()
      i.onload = () => res(i)
      i.onerror = () => rej(new Error('decode failed'))
      i.src = url
    })
    const sw = img.naturalWidth || img.width
    const sh = img.naturalHeight || img.height
    if (!sw || !sh) return null
    // Cap oversized images (keeps pixel maps + localStorage sane), nearest-neighbour.
    const scale = Math.min(1, PNG_TILE_MAX / Math.max(sw, sh))
    const w = Math.max(1, Math.round(sw * scale))
    const h = Math.max(1, Math.round(sh * scale))
    const cv = document.createElement('canvas')
    cv.width = w
    cv.height = h
    const ctx = cv.getContext('2d', {willReadFrequently: true})!
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(img, 0, 0, w, h)
    const data = ctx.getImageData(0, 0, w, h).data
    const colors: string[] = []
    const cidx = new Map<string, number>()
    const pixels: Record<string, number> = {}
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4
        if (data[i + 3]! < 16) continue   // near-transparent → empty
        const hex = rgbHex(data[i]!, data[i + 1]!, data[i + 2]!)
        let idx = cidx.get(hex)
        if (idx === undefined) { idx = colors.length; colors.push(hex); cidx.set(hex, idx) }
        pixels[`${x}_${y}`] = idx
      }
    }
    if (!colors.length) return null   // fully transparent → skip
    const name = (file.name.replace(/\.[^.]+$/, '') || 'Tile').slice(0, 60)
    const ed: EditorData = {
      ...cloneDeep(DEFAULT_EDITOR_DATA),
      id: generateUUID(), name, width: w, height: h, colors,
      layers: [{name: 'Layer 1', pixels, x: 0, y: 0}],
      updated: new Date().toISOString(),
    }
    return {ed, thumb: cv.toDataURL('image/png')}
  } catch {
    return null
  } finally {
    URL.revokeObjectURL(url)
  }
}

// Guest tilesets materialise lazily — make sure one exists before adding tiles.
function ensureLocalTilesetId(): string | null {
  if (!tileset.value) return null
  if (tileset.value.localId) return tileset.value.localId
  const entry = localTs.create(tileset.value.name || 'Untitled')
  tileset.value.localId = entry.id
  tileset.value.id_string = entry.id
  router.replace({query: {id: entry.id}})
  return entry.id
}

async function onPngFiles(e: Event) {
  const input = e.target as HTMLInputElement
  const files = Array.from(input.files || [])
  input.value = ''   // let the same files be re-selected later
  if (!files.length || !tileset.value || importingPng.value) return
  const home = tileset.value.groups.find(g => g.kind === 'group')
  if (!home) { toast.error('No tile group to add to'); return }

  importingPng.value = true
  commit()
  let added = 0, skipped = 0
  try {
    for (const file of files) {
      const tile = await pngToTile(file)
      if (!tile) { skipped++; continue }
      const {ed, thumb} = tile
      if (auth.isLogged) {
        try {
          const res = await useNativeFetch<{ id: number; id_string: string }>('/coloring/shared-pages/', {
            method: 'POST',
            body: {
              name: ed.name, desc: '', tags: [],
              width: ed.width, height: ed.height,
              colors: ed.colors, layers: ed.layers,
              map_numbers: layers2MapNumbers(ed),
              is_public: false, is_tile: true,
            },
          })
          tileset.value.registry[String(res.id)] = res.id_string
          home.tiles.push(res.id)
          localThumbs.set(res.id_string, thumb)   // instant preview until the server renders
          added++
        } catch { skipped++ }
      } else {
        const lid = ensureLocalTilesetId()
        const t = lid ? localTs.addTile(lid, {name: ed.name, ed, thumb}) : null
        if (t) {
          tileset.value.registry[String(t.tid)] = t.ed.id
          home.tiles.push(t.tid)
          localThumbs.set(t.ed.id, t.thumb)
          added++
        } else { skipped++ }
      }
    }
    if (added) {
      dirty.value = true
      imgCache.clear()
      scheduleDraw()
      if (!auth.isLogged) autosaveLocal()
    }
    const msg = [added && `Imported ${added} tile${added > 1 ? 's' : ''}`, skipped && `${skipped} skipped`].filter(Boolean).join(' · ')
    added ? toast.success(msg) : toast.error(msg || 'No tiles imported')
  } finally {
    importingPng.value = false
  }
}

onMounted(async () => {
  pruneStorageKeys('tsx_view:')
  try { showBoardChrome.value = localStorage.getItem('tsx_board_chrome') !== '0' } catch { /* ignore */ }
  await fetchMyTilesets()
  fetchCollections()
  runSearch()
  const q = String(route.query.id || '')
  // The editor always opens: ?new → a fresh blank; an explicit ?id; else the
  // user's most recent tileset; else (guest) the newest local one or a blank.
  if (route.query.new != null) openBlank()
  else if (q) loadTileset(q)
  else if (myTilesets.value.length) loadTileset(myTilesets.value[0].id_string)
  else if (auth.isLogged) openBlank()
  else openGuestTileset()
})
watch(() => auth.isLogged, async (v) => {
  if (!v) return
  // On sign-in, upload the guest's local tilesets, then open the newest cloud one.
  await localTs.syncToCloud()
  await fetchMyTilesets()
  fetchCollections()
  if ((tileset.value?.localId || !tileset.value?.id_string) && !dirty.value && myTilesets.value.length) {
    loadTileset(myTilesets.value[0].id_string)
  }
})

const faq = [
  {q: 'Do I have to draw all the border tiles myself?', a: `<p>No. <strong>Build Borders</strong> generates all 16 (or 47) variants from one base tile — auto-shaded, or composed from your own edge and corner art with per-side overrides and variations. Edit the base art later and the whole set regenerates.</p>`},
  {q: 'Wang 16 or blob 47 — which should I pick?', a: `<p><strong>Wang 16</strong> tracks the four edges and puts borders mid-tile — great for top-down maps. <strong>Blob 47</strong> also tracks corners for the 47 canonical shapes, so concave joins look right — the usual choice for platformers. You can switch a terrain between the two at any time.</p>`},
  {q: 'How do two terrains blend into each other?', a: `<p>Give a terrain an <strong>Under</strong> art in Build Borders to bake the transition, then set <strong>relations</strong>: connected terrains at equal priority merge seamlessly, a higher-priority terrain draws its transition edge over the lower one, and unrelated terrains keep a hard boundary.</p>`},
  {q: 'Can I use the tileset in my game engine?', a: `<p>Yes. Download a packed <strong>PNG sheet</strong> plus a <strong>JSON</strong> file with tiles, groups and terrain masks — per group or for the whole set — and import it into Godot, Unity, Phaser or your own engine.</p>`},
  {q: 'Do I need an account?', a: `<p>You can open the editor and build right away. Sign in when you want to save the tileset to your account, sync generated tiles, or paint worlds with it in the <a href="/tilemaps/editor">tilemap editor</a>.</p>`},
]
</script>

<template>
  <div class="page tsx-page">
    <div class="editor">
    <!-- Toolbar — the art editor's .editor-toolbar chrome -->
    <div v-if="tileset" class="editor-toolbar">
      <!-- Kept outside the File dropdown so it stays mounted after the menu closes. -->
      <input ref="pngInput" type="file" accept="image/png,image/*" multiple hidden @change="onPngFiles">
      <div class="toolbar-start">
        <ui-dropdown-menu>
          <ui-tooltip text="Tilesets">
            <button class="toolbar-btn"><span class="icon icon-file"/></button>
          </ui-tooltip>
          <template #menu>
            <div class="file-menu">
              <button class="file-menu-item" @click="openLoad">
                <span class="icon icon-grid"/><span>Load tileset…</span>
              </button>
              <button class="file-menu-item" @click="onTilesetSelect('__new__')">
                <span class="icon icon-plus"/><span>New tileset</span>
              </button>
              <button class="file-menu-item" :disabled="importingPng" @click="openPngImport">
                <span class="icon icon-image"/><span>{{ importingPng ? 'Importing…' : 'Load PNG files…' }}</span>
              </button>
              <div class="file-menu-sep"/>
              <button class="file-menu-item" :disabled="!tiles.length || exporting" @click="exportPNG">
                <span class="icon icon-image"/><span>Download PNG</span>
              </button>
              <button class="file-menu-item" :disabled="!tiles.length || exporting" @click="exportJSON">
                <span class="icon icon-download"/><span>Export JSON</span>
              </button>
              <button class="file-menu-item" :disabled="!tiles.length || exporting" @click="exportEngine('godot')">
                <span class="icon icon-download"/><span>Export for Godot 4</span>
              </button>
              <button class="file-menu-item" :disabled="!tiles.length || exporting" @click="exportEngine('tiled')">
                <span class="icon icon-download"/><span>Export for Tiled</span>
              </button>
            </div>
          </template>
        </ui-dropdown-menu>
        <ui-dropdown-menu>
          <button class="toolbar-btn" title="Settings"><span class="icon icon-cog"/></button>
          <template #menu>
            <div class="file-menu">
              <button class="file-menu-item" @click="showSettings = true">
                <span class="icon icon-cog"/><span>Tileset settings</span>
              </button>
              <button class="file-menu-item" @click="openAdd">
                <span class="icon icon-plus"/><span>Manage tiles</span>
              </button>
              <button class="file-menu-item" @click="showCanvasModal = true">
                <span class="icon icon-grid"/><span>Grid settings</span>
              </button>
              <button class="file-menu-item" @click="toggleBoardChrome">
                <span class="icon" :class="showBoardChrome ? 'icon-eye-cross' : 'icon-eye'"/>
                <span>{{ showBoardChrome ? 'Hide group labels' : 'Show group labels' }}</span>
              </button>
            </div>
          </template>
        </ui-dropdown-menu>
      </div>
      <div class="toolbar-main no-scrollbar">
        <div class="toolbar-group">
          <ui-tooltip text="Undo (⌘Z)">
            <button class="toolbar-btn" :disabled="!canUndo" @click="undoTs"><span class="icon icon-undo"/></button>
          </ui-tooltip>
          <ui-tooltip text="Redo (⇧⌘Z)">
            <button class="toolbar-btn" :disabled="!canRedo" @click="redoTs"><span class="icon icon-redo"/></button>
          </ui-tooltip>
        </div>
        <div class="toolbar-sep"/>
        <div class="toolbar-group">
          <ui-tooltip text="Zoom out">
            <button class="toolbar-btn" :disabled="zoom <= ZMIN" @click="zoomOut"><span class="icon icon-zoom-out"/></button>
          </ui-tooltip>
          <ui-tooltip text="Zoom in">
            <button class="toolbar-btn" :disabled="zoom >= ZMAX" @click="zoomIn"><span class="icon icon-zoom-in"/></button>
          </ui-tooltip>
          <ui-tooltip text="Fit all in view">
            <button class="toolbar-btn" @click="fitAll"><span class="fit-label">FIT</span></button>
          </ui-tooltip>
        </div>
        <div class="toolbar-sep"/>
        <div class="toolbar-group">
          <ui-tooltip text="Auto arrange — pack groups tightly">
            <button class="toolbar-btn" :disabled="!tileset.groups.length" @click="autoArrange()">
              <span class="icon icon-arrange"/>
            </button>
          </ui-tooltip>
        </div>
        <!-- Contextual tools for the selected group -->
        <template v-if="activeGroup">
          <div class="toolbar-sep"/>
          <div class="toolbar-group">
            <ui-tooltip
                v-if="activeGroup.kind === 'terrain'"
                :text="activeGroup.type === 'blob47'
                  ? 'Blob set — 47 tiles with corners (side-scrollers). Switch to Wang 16.'
                  : 'Wang set — 16 tiles, borders mid-tile (top-down). Switch to Blob 47.'"
            >
              <button class="toolbar-btn tsx-tb-type" @click="toggleTerrainType(activeGroup)">
                {{ activeGroup.type === 'blob47' ? '47' : '16' }}
              </button>
            </ui-tooltip>
            <ui-tooltip v-if="activeGroup.kind === 'terrain'" text="Build borders — generate every variant from a base tile">
              <button class="toolbar-btn" @click="openBuild">
                <span class="icon icon-auto-fix"/>
              </button>
            </ui-tooltip>
            <ui-tooltip v-if="activeGroup.kind === 'terrain'" text="Fill empty slots with the selected tile">
              <button class="toolbar-btn" :disabled="selectedTileId == null" @click="fillTerrainFromSelected(activeGroup)">
                <span class="icon icon-bucket"/>
              </button>
            </ui-tooltip>
            <ui-tooltip v-if="activeGroup.kind === 'terrain'" text="Relations — which terrains this one connects to, and its boundary priority">
              <button class="toolbar-btn" :class="{active: !!activeGroup.relations}" @click="showRelations = true">
                <span class="icon icon-relation"/>
              </button>
            </ui-tooltip>
            <ui-tooltip v-if="activeGroup.kind === 'group'" text="Random variants — painting with this group in the tilemap picks a random tile">
              <button class="toolbar-btn" :class="{active: activeGroup.random}" @click="toggleRandom(activeGroup)">
                <span class="icon icon-swap"/>
              </button>
            </ui-tooltip>
            <template v-if="activeGroup.kind === 'group' && activeGroup.random && selectedTileId != null && activeGroup.tiles.includes(selectedTileId)">
              <ui-tooltip text="Less likely">
                <button class="toolbar-btn" :disabled="selectedWeight <= 1" @click="bumpWeight(-1)"><span class="icon icon-minus"/></button>
              </ui-tooltip>
              <span class="tsx-weight-val" title="Weight of the selected tile in the random pick">×{{ selectedWeight }}</span>
              <ui-tooltip text="More likely">
                <button class="toolbar-btn" :disabled="selectedWeight >= 9" @click="bumpWeight(1)"><span class="icon icon-plus"/></button>
              </ui-tooltip>
            </template>
            <ui-tooltip :text="activeGroup.kind === 'group' ? 'Delete group — its tiles move to another group' : 'Delete terrain'">
              <button
                  class="toolbar-btn"
                  :disabled="activeGroup.kind === 'group' && plainGroups.length < 2"
                  @click="removeGroup(activeGroup.id)"
              >
                <span class="icon icon-trash"/>
              </button>
            </ui-tooltip>
          </div>
        </template>
      </div>
      <div class="toolbar-end">
        <ui-tooltip text="Edit tiles in the pixel editor (new tab)">
          <a
              v-if="tileset.id_string"
              :href="`/editor?tileset=${tileset.id_string}`"
              target="_blank"
              rel="noopener"
              class="toolbar-btn"
              aria-label="Edit tiles in the pixel editor"
          ><span class="icon icon-pen"/></a>
          <button v-else class="toolbar-btn" disabled aria-label="Edit tiles in the pixel editor"><span class="icon icon-pen"/></button>
        </ui-tooltip>
        <ui-tooltip text="Refresh tiles — reload art after editing it">
          <button class="toolbar-btn" :disabled="!tiles.length" @click="refreshArt"><span class="icon icon-sync"/></button>
        </ui-tooltip>
        <ui-tooltip :text="saving ? 'Saving…' : 'Save'">
          <button class="publish-toolbar-btn tm-save" :class="{dirty}" :disabled="saving || !dirty" :aria-label="saving ? 'Saving…' : 'Save'" @click="save">
            <span class="icon icon-save"/>
          </button>
        </ui-tooltip>
      </div>
    </div>

    <!-- Workspace — always open: ?id, the user's latest tileset, or a draft.
         .editor-body row: dock (editor-sidebar, ordered left) + desk. -->
    <div v-if="tileset" class="editor-body tsx-shell">
      <!-- Desk: the sheet document -->
      <section class="tsx-main">

        <div class="tsx-deskwrap">
        <div
            ref="stageEl"
            class="tm-stage no-scrollbar tsx-desk"
            :class="{panning: panned}"
            @pointerdown="stageDown"
            @pointermove="stageMove"
            @pointerup="stageUp"
            @pointercancel="stageUp"
            @click.capture="stageClickCapture"
            @wheel="onStageWheel"
        >
          <div v-if="!tiles.length" class="tsx-desk-empty">
            <p>No tiles yet.</p>
            <button class="btn" @click="openAdd">
              <span class="icon icon-plus"/>
              <span>Add tiles</span>
            </button>
          </div>
          <div v-else class="tsx-boardwrap">
            <ClientOnly>
              <canvas
                  ref="boardEl"
                  class="tsx-board"
                  @pointerdown="boardDown"
                  @pointermove="boardMove"
                  @pointerup="boardUp"
                  @pointercancel="boardUp"
                  @contextmenu.prevent
              />
            </ClientOnly>
          </div>

          <!-- Selection bar — floats over the desk, never disturbs layout -->
          <Transition name="tsx-pop">
            <div v-if="selectedTile" class="tsx-selbar">
              <img :src="tileSrc(selectedTile.id_string)" alt="" class="tsx-selbar-thumb">
              <span class="tsx-selbar-name">{{ selectedTileIds.length > 1 ? `${selectedTileIds.length} tiles` : selectedTile.id_string }}</span>
              <span class="tsx-selbar-hint">{{ selectedTileIds.length > 1 ? 'drag moves them together' : 'click a terrain slot to place' }}</span>
              <ui-tooltip text="Remove selected (Del)">
                <button class="tsx-selbar-btn danger" @click="deleteSelectedTiles">
                  <span class="icon icon-trash"/>
                </button>
              </ui-tooltip>
              <ui-tooltip text="Deselect (Esc)">
                <button class="tsx-selbar-btn" @click="selectedTileIds = []">
                  <span class="icon icon-x"/>
                </button>
              </ui-tooltip>
            </div>
          </Transition>
        </div>

        <div v-if="tileset.id_string" class="tm-stage-fab">
          <ui-tooltip text="Open public page" position="left">
            <nuxt-link :to="`/tilesets/${tileset.id_string}`" class="tm-stage-fab-btn" aria-label="Open public page">
              <span class="icon icon-link"/>
            </nuxt-link>
          </ui-tooltip>
        </div>
        </div>

      </section>

      <!-- Dock: group settings -->
      <aside class="tm-panel tsx-dock editor-sidebar">
        <section class="tm-group">
          <span class="tm-label">
            <span>Groups <em>{{ tileset.groups.length }}</em></span>
            <span class="tsx-label-actions">
              <ui-tooltip text="Add group">
                <button class="tsx-mini-btn" @click="addGroup('group')">
                  <span class="icon icon-plus"/>
                </button>
              </ui-tooltip>
              <ui-tooltip text="Add terrain — auto-tile group with connection slots">
                <button class="tsx-mini-btn" @click="addGroup('terrain')">
                  <span class="icon icon-rhombus"/>
                </button>
              </ui-tooltip>
            </span>
          </span>
          <div
              v-for="g in tileset.groups"
              :key="g.id"
              class="tsx-group-row"
              :class="{active: selectedGroupId === g.id}"
              @click="selectedGroupId === g.id || selectGroup(g.id)"
          >
            <span v-if="g.kind === 'terrain'" class="icon icon-rhombus tsx-kind-ic" title="Terrain (auto-tile)"/>
            <span v-else class="icon icon-grid tsx-kind-ic" title="Group"/>
            <input v-model="g.name" type="text" class="tsx-terrain-name" @input="dirty = true">
            <em class="tsx-group-count">{{ g.kind === 'terrain' ? Object.keys(g.map || {}).length : g.tiles.length }}</em>
          </div>
        </section>
      </aside>
    </div>
    </div>

    <!-- SEO: related tools, README, FAQ (indexable on the bare URL) -->
    <Widget title="More tools" class="tool-more">
      <ToolPaths exclude="tileset"/>
    </Widget>

    <ToolReadme>
      <h1>Tileset Editor</h1>
      <p>
        Turn pixel art into a game-ready tileset. Group tiles on an infinite board, auto-generate
        Wang 16 / blob 47 terrain borders from a single base tile, then export straight to
        Godot 4 or Tiled — or paint worlds here. Free, runs in your browser.
      </p>

      <h2>Build auto-tile terrains without drawing 47 tiles</h2>
      <p>
        The <strong>Tileset Editor</strong> curates pixel art into tilesets. Add tiles from your own
        drawings or any public art in the <nuxt-link to="/arts">gallery</nuxt-link>, set a base cell
        size, and arrange groups for terrain, props and characters. Add a <strong>terrain</strong> and
        drop one base tile on it — <strong>Build Borders</strong> composes every edge, corner and
        inner-corner variant for you, as a <strong>Wang 16</strong> set for top-down maps or a
        <strong>blob 47</strong> set for platformers.
      </p>
      <p>
        Terrains are data-driven: declare which terrains <strong>connect</strong>, give them a
        <strong>priority</strong>, and boundaries resolve themselves — seamless merges, layered
        transitions, or hard edges. Random groups pick <strong>weighted variants</strong> while you
        paint, so large areas never look repetitive. When it's ready, export a
        <strong>Godot 4 TileSet (.tres)</strong> with the terrain sets already wired up, a
        <strong>Tiled tileset (.tsx)</strong> whose terrains land as Wang sets, or the packed
        <strong>PNG + JSON</strong> for Unity, Phaser and custom engines — or open the
        <nuxt-link to="/tilemaps/editor">tilemap editor</nuxt-link> and paint worlds with terrain-aware brushes.
      </p>

      <QnA :items="faq"/>
    </ToolReadme>

    <!-- Settings modal -->
    <UiModal v-if="showCanvasModal" class="canvas-modal" @close="showCanvasModal = false">
      <h3 class="publish-heading">Canvas</h3>
      <p class="publish-sub">Background &amp; grid of the board your tiles sit on.</p>

      <div class="cv-fields">
        <div class="cv-field">
          <label class="cv-label">Background</label>
          <div class="cv-color-row">
            <input
                type="color"
                class="cv-color"
                :value="boardBg"
                @input="boardBg = ($event.target as HTMLInputElement).value; onBoardChange()"
            >
            <span class="cv-hex">{{ boardBg }}</span>
          </div>
          <div class="cv-opts cols-4">
            <button
                v-for="p in BOARD_PRESETS"
                :key="p.color"
                class="cv-opt"
                :class="{ active: boardBg.toLowerCase() === p.color.toLowerCase() }"
                @click="boardBg = p.color; onBoardChange()"
            >
              <span class="desk-sw" :style="{ background: p.color }"/>
              <span>{{ p.name }}</span>
            </button>
          </div>
        </div>

        <div class="cv-field">
          <label class="cv-label">Grid</label>
          <div class="cv-opts cols-2">
            <button class="cv-opt" :class="{ active: !boardGrid }" @click="boardGrid = false; onBoardChange()">Off</button>
            <button class="cv-opt" :class="{ active: boardGrid }" @click="boardGrid = true; onBoardChange()">On</button>
          </div>
        </div>

        <template v-if="boardGrid">
          <div class="cv-field">
            <label class="cv-label">Grid size</label>
            <div class="cv-opts cols-3">
              <button
                  v-for="s in BOARD_GRID_STEPS"
                  :key="s"
                  class="cv-opt"
                  :class="{ active: boardGridStep === s }"
                  @click="boardGridStep = s; onBoardChange()"
              >{{ s === 1 ? '1 cell' : `${s} cells` }}</button>
            </div>
          </div>
          <div class="cv-field">
            <label class="cv-label">Line style</label>
            <div class="cv-opts cols-3">
              <button
                  v-for="st in (['solid','dashed','dots'] as const)"
                  :key="st"
                  class="cv-opt cv-cap"
                  :class="{ active: boardGridStyle === st }"
                  @click="boardGridStyle = st; onBoardChange()"
              >{{ st }}</button>
            </div>
          </div>
        </template>
      </div>

      <button class="btn primary wide" @click="showCanvasModal = false">Done</button>
    </UiModal>

    <UiModal v-if="showSettings && tileset" @close="showSettings = false">
          <h3 class="publish-heading">Tileset settings</h3>
          <div class="publish-form">
            <div>
              <label class="publish-label">Name</label>
              <input v-model="tileset.name" type="text" class="publish-input" @input="dirty = true">
            </div>
            <div>
              <label class="publish-label">Base tile size</label>
              <div class="tsx-chips">
                <button
                    v-for="pz in CELL_CHOICES"
                    :key="pz"
                    :class="{active: tileset.cell.w === pz && tileset.cell.h === pz}"
                    @click="setCell(pz)"
                >{{ pz }}</button>
              </div>
              <div class="tsx-cell-dims tsx-modal-dims">
                <label>W <input type="number" min="4" max="256" :value="tileset.cell.w"
                                @change="setCellDim('w', Number(($event.target as HTMLInputElement).value))"></label>
                <label>H <input type="number" min="4" max="256" :value="tileset.cell.h"
                                @change="setCellDim('h', Number(($event.target as HTMLInputElement).value))"></label>
                <span class="text-xs text-muted">px — base cell for the tilemap grid; larger art simply spans several cells</span>
              </div>
            </div>
            <div>
              <label class="publish-label">Tile shape</label>
              <div class="h-center gap-2">
                <ui-switch
                    :model-value="tileset.iso"
                    @update:model-value="tileset.iso = $event; dirty = true"
                />
                <span class="text-xs">Isometric</span>
                <span class="text-xs text-muted">{{ tileset.iso ? '— diamond tiles; the tilemap opens in isometric mode' : '— top-down square tiles (grid)' }}</span>
              </div>
            </div>
            <div>
              <label class="publish-label">Visibility</label>
              <div class="h-center gap-2">
                <ui-switch
                    :model-value="tileset.status === 'public'"
                    @update:model-value="tileset.status = $event ? 'public' : 'private'; dirty = true"
                />
                <span class="text-xs">Public</span>
                <span class="text-xs text-muted">{{ tileset.status === 'public' ? '— anyone can view and clone it' : '— only you can see it' }}</span>
              </div>
            </div>
          </div>
          <div class="publish-actions">
            <button class="btn block" @click="showSettings = false">Close</button>
            <button class="btn primary block" :disabled="saving || !dirty" @click="save(); showSettings = false">
              {{ saving ? 'Saving…' : 'Save' }}
            </button>
          </div>
      </UiModal>

    <!-- Terrain relations modal -->
    <UiModal v-if="showRelations && activeGroup?.kind === 'terrain'" @close="showRelations = false">
          <h3 class="publish-heading">{{ activeGroup.name }} — relations</h3>
          <div class="publish-form">
            <div>
              <label class="publish-label">Priority</label>
              <div class="h-center gap-2">
                <ui-tooltip text="Lower priority">
                  <button class="btn tm-iconbtn" :disabled="groupPriority(activeGroup) <= 0" @click="bumpPriority(activeGroup, -1)">
                    <span class="icon icon-minus"/>
                  </button>
                </ui-tooltip>
                <span class="tsx-weight-val">{{ groupPriority(activeGroup) }}</span>
                <ui-tooltip text="Higher priority">
                  <button class="btn tm-iconbtn" :disabled="groupPriority(activeGroup) >= 9" @click="bumpPriority(activeGroup, 1)">
                    <span class="icon icon-plus"/>
                  </button>
                </ui-tooltip>
                <span class="text-xs text-muted">higher paints its transition edge over lower terrains</span>
              </div>
            </div>
            <div>
              <label class="publish-label">Connects to</label>
              <p v-if="!otherTerrains.length" class="text-xs text-muted">
                Add another terrain to this tileset to define relations.
              </p>
              <div v-for="t in otherTerrains" :key="t.id" class="tsx-rel-row">
                <ui-switch
                    :model-value="isConnected(activeGroup, t.id)"
                    @update:model-value="toggleConnect(activeGroup, t.id)"
                />
                <span class="tsx-rel-name">{{ t.name }}</span>
                <span class="text-xs text-muted">priority {{ groupPriority(t) }}</span>
              </div>
              <p class="text-xs text-muted tsx-rel-help">
                Connected terrains merge seamlessly at equal priority. Against a higher-priority
                connected terrain this one runs underneath its transition edge. Terrains not
                listed keep a hard boundary (each draws its own border).
              </p>
            </div>
          </div>
          <div class="publish-actions">
            <button class="btn primary block" @click="showRelations = false">Done</button>
          </div>
      </UiModal>

    <!-- Build borders modal -->
    <UiModal v-if="showBuild && activeGroup?.kind === 'terrain'" class="tsx-build-modal" @close="showBuild = false">
          <h3 class="publish-heading">Build borders — {{ activeGroup.name }}</h3>
          <div class="tsx-build-cols">
            <div class="tsx-build-left">
              <!-- Style decides which sources apply -->
              <div class="tsx-build-sec">
                <span>Style</span>
                <button type="button" class="tsx-build-morelink" @click="toggleBuildAdvanced">{{ buildAdvanced ? 'Less' : 'More' }}</button>
              </div>
              <div class="tsx-chips tsx-build-style">
                <template v-if="tileset.iso">
                  <ui-tooltip text="Reuse the base tile for every slot — best for 3D blocks (the tile's own walls read as the border)" position="bottom">
                    <button :class="{active: buildStyle === 'fill'}" @click="buildStyle = 'fill'">Fill</button>
                  </ui-tooltip>
                  <template v-if="buildAdvanced">
                    <ui-tooltip text="Shade the diamond edges — only for flat floor tiles, not 3D blocks" position="bottom">
                      <button :class="{active: buildStyle === 'auto'}" @click="buildStyle = 'auto'">Auto shade</button>
                    </ui-tooltip>
                    <ui-tooltip text="Composite a hand-drawn edge piece onto each open diamond edge (mirrored to all 4)" position="bottom">
                      <button :class="{active: buildStyle === 'edge'}" @click="buildStyle = 'edge'">Edge art</button>
                    </ui-tooltip>
                  </template>
                </template>
                <template v-else>
                  <ui-tooltip text="Shade the base tile automatically — no extra art needed" position="bottom">
                    <button :class="{active: buildStyle === 'auto'}" @click="buildStyle = 'auto'">Auto shade</button>
                  </ui-tooltip>
                  <ui-tooltip v-if="buildAdvanced" text="Overlay hand-drawn edge and corner art" position="bottom">
                    <button :class="{active: buildStyle === 'edge'}" @click="buildStyle = 'edge'">Edge art</button>
                  </ui-tooltip>
                </template>
              </div>

              <!-- Sources: click a card, then assign art from the library -->
              <div class="tsx-build-sec">Sources</div>
              <div class="tsx-build-slotgrid">
                <ui-tooltip v-for="s in buildSlotDefs" :key="s.key" :text="s.title" position="bottom">
                  <button
                      class="tsx-build-slot"
                      :class="{active: buildTarget === s.key}"
                      @click="buildTarget = s.key as any"
                  >
                    <span class="tsx-build-slot-thumb" :class="{empty: !slugOf(s.id)}">
                      <img v-if="slugOf(s.id)" :src="tileSrc(slugOf(s.id)!)" alt="">
                    </span>
                    <span>{{ s.label }}</span>
                  </button>
                </ui-tooltip>
              </div>
              <div v-if="buildStyle === 'edge'" class="tsx-build-slotgrid tsx-build-slotgrid-sub">
                <ui-tooltip v-for="s in buildSideDefs" :key="s.key" :text="s.title" position="bottom">
                  <button
                      class="tsx-build-slot"
                      :class="{active: buildTarget === s.key}"
                      @click="buildTarget = s.key as any"
                  >
                    <span class="tsx-build-slot-thumb" :class="{empty: !slugOf(s.id)}">
                      <img v-if="slugOf(s.id)" :src="tileSrc(slugOf(s.id)!)" alt="">
                    </span>
                    <span>{{ s.label }}</span>
                  </button>
                </ui-tooltip>
                <ui-tooltip text="Edge variations — pick several extra edge arts; they mix in deterministically to break repetition (optional)" position="bottom">
                  <button
                      class="tsx-build-slot"
                      :class="{active: buildTarget === 'vars'}"
                      @click="buildTarget = 'vars'"
                  >
                    <span class="tsx-build-slot-thumb" :class="{empty: !buildVarIds.length}">
                      <span v-if="buildVarIds.length" class="tsx-build-varcount">+{{ buildVarIds.length }}</span>
                    </span>
                    <span>Vars</span>
                  </button>
                </ui-tooltip>
              </div>

              <div v-if="buildStyle === 'auto' || (buildStyle === 'edge' && !tileset.iso)" class="tsx-build-sec">Options</div>
              <div v-if="buildStyle === 'auto' || (buildStyle === 'edge' && !tileset.iso)" class="tsx-build-controls">
                <template v-if="buildStyle === 'auto'">
                  <ui-tooltip text="Border band thickness in pixels" position="bottom">
                    <label class="tsx-build-field">
                      <span>Depth</span>
                      <input type="number" min="1" max="8" :value="buildDepth"
                             @change="buildDepth = Math.max(1, Math.min(8, Number(($event.target as HTMLInputElement).value) || 2))">
                    </label>
                  </ui-tooltip>
                  <div class="tsx-chips">
                    <ui-tooltip text="Border band darker than the base" position="bottom">
                      <button :class="{active: buildMode === 'darken'}" @click="buildMode = 'darken'">Darken</button>
                    </ui-tooltip>
                    <ui-tooltip text="Border band lighter than the base" position="bottom">
                      <button :class="{active: buildMode === 'lighten'}" @click="buildMode = 'lighten'">Lighten</button>
                    </ui-tooltip>
                  </div>
                  <ui-tooltip text="Cut outer corners at 45° for a rounded look" position="bottom">
                    <label class="tsx-build-switch">
                      <ui-switch :model-value="buildRounded" @update:model-value="buildRounded = $event"/>
                      <span>Rounded</span>
                    </label>
                  </ui-tooltip>
                  <ui-tooltip text="Checker-dither the seam between band and base" position="bottom">
                    <label class="tsx-build-switch">
                      <ui-switch :model-value="buildDither" @update:model-value="buildDither = $event"/>
                      <span>Dither</span>
                    </label>
                  </ui-tooltip>
                </template>
                <ui-tooltip v-else-if="buildStyle === 'edge'" text="Only the top N rows of the edge art apply (0 = whole art)" position="bottom">
                  <label class="tsx-build-field">
                    <span>Cutoff</span>
                    <input type="number" min="0" max="64" :value="buildCut"
                           @change="buildCut = Math.max(0, Math.min(64, Number(($event.target as HTMLInputElement).value) || 0))">
                  </label>
                </ui-tooltip>
              </div>

              <!-- One library for every source: tileset tiles, or public search -->
              <div class="tsx-build-sec">Art library <em>→ {{ buildTargetLabel }}</em></div>
              <div class="tm-search">
                <span class="icon icon-search"/>
                <input v-model="buildQuery" type="search" placeholder="Search public art…" @input="debouncedBuildSearch()">
              </div>
              <div class="tsx-add-grid tsx-build-grid no-scrollbar">
                <button
                    v-for="t in buildGridItems"
                    :key="t.id"
                    class="tsx-result"
                    :class="{picked: buildPickActive(t.id as number)}"
                    :title="t.id_string"
                    @click="assignBuildPick(t.id as number)"
                >
                  <img :src="tileSrc(t.id_string)" :alt="t.id_string" loading="lazy">
                  <span v-if="buildPickActive(t.id as number)" class="tsx-result-badge icon icon-check"/>
                </button>
              </div>
              <div v-if="buildPages > 1" class="tsx-build-pager">
                <ui-tooltip text="Previous page">
                  <button class="btn tm-iconbtn" :disabled="buildPage <= 1 || buildSearching" aria-label="Previous page" @click="buildSearch(buildPage - 1)">‹</button>
                </ui-tooltip>
                <span>{{ buildPage }} / {{ buildPages }}</span>
                <ui-tooltip text="Next page">
                  <button class="btn tm-iconbtn" :disabled="buildPage >= buildPages || buildSearching" aria-label="Next page" @click="buildSearch(buildPage + 1)">›</button>
                </ui-tooltip>
              </div>
            </div>

            <div class="tsx-build-right">
              <div class="tsx-build-sec">Preview</div>
              <div class="tsx-build-body">
                <canvas ref="buildDemoEl" class="tsx-build-preview"/>
              </div>
              <div class="tsx-build-sec">All {{ activeGroup.type === 'blob47' ? 47 : 16 }} tiles</div>
              <div class="tsx-build-body tsx-build-varbody no-scrollbar">
                <canvas ref="buildPreviewEl" class="tsx-build-preview"/>
              </div>
            </div>
          </div>
          <p v-if="!buildBase" class="tsx-build-hint">Pick a tile for the Base slot to generate.</p>
          <p v-else-if="buildStyle === 'edge' && !buildEdge" class="tsx-build-hint">Edge art needs a tile in the Edge slot — pick one from the grid.</p>
          <div class="publish-actions">
            <button class="btn block" @click="showBuild = false">Cancel</button>
            <button
                class="btn primary block"
                :disabled="building || !buildBase || (buildStyle === 'edge' && !buildEdge)"
                @click="generateBorders()"
            >
              {{ building ? `Generating ${buildProgress}…` : `${buildStyle === 'fill' ? 'Fill' : 'Generate'} ${activeGroup.type === 'blob47' ? 47 : 16} tiles` }}
            </button>
          </div>
      </UiModal>

    <!-- Add tiles modal -->
    <UiModal v-if="showAdd && tileset" class="tsx-add-modal" @close="showAdd = false">
          <h3 class="publish-heading">Manage tiles</h3>
          <div class="tsx-add-src">
            <div class="tm-search tm-grow">
              <span class="icon icon-search"/>
              <input
                  v-model="searchQuery"
                  type="search"
                  placeholder="Search public pixel art…"
                  @input="debouncedSearch()"
              >
            </div>
            <select v-model="collectionSel" class="tsx-import tsx-add-coll" @change="loadCollection(collectionSel)">
              <option value="">From collection…</option>
              <option v-for="c in collections" :key="c.id" :value="c.id">{{ c.title || c.name || 'Untitled' }}</option>
            </select>
          </div>
          <div class="tsx-add-body no-scrollbar">
            <template v-if="tiles.length">
              <span class="tm-label">
                <span>In tileset <em>{{ tiles.length }}</em></span>
                <span class="text-xs text-muted">click to remove</span>
              </span>
              <div class="tsx-add-grid">
                <button
                    v-for="t in tiles"
                    :key="t.id"
                    class="tsx-result added"
                    :class="{removing: toRemove[t.id]}"
                    :title="toRemove[t.id] ? 'Will be removed — click to keep' : 'Click to remove from tileset'"
                    @click="toggleRemove(t.id)"
                >
                  <img :src="tileSrc(t.id_string)" :alt="t.id_string" loading="lazy">
                  <span class="tsx-result-badge icon" :class="toRemove[t.id] ? 'icon-minus' : 'icon-check'"/>
                </button>
              </div>
            </template>
            <span class="tm-label">
              <span>Public art</span>
              <button class="tsx-add-all" @click="pickAll">Select all</button>
            </span>
            <div v-if="searching" class="text-xs text-muted tsx-add-status">Searching…</div>
            <p v-else-if="!freshResults.length" class="text-xs text-muted tsx-add-status">Nothing found.</p>
            <div v-else class="tsx-add-grid">
              <button
                  v-for="a in freshResults"
                  :key="a.id"
                  class="tsx-result"
                  :class="{picked: !!picked[a.id as number]}"
                  :title="a.name || a.id_string"
                  @click="togglePick(a)"
              >
                <img :src="tileSrc(a.id_string)" :alt="a.name || a.id_string" loading="lazy">
                <span v-if="picked[a.id as number]" class="tsx-result-badge icon icon-check"/>
              </button>
            </div>
          </div>
          <div class="publish-actions">
            <button class="btn block" @click="showAdd = false">Cancel</button>
            <button class="btn primary block" :disabled="!pickedCount && !removeCount" @click="applyChanges">
              {{ applyLabel }}
            </button>
          </div>
      </UiModal>

    <!-- Load tileset: browse the account's tilesets (or the local library) -->
    <EditorLoadBrowser
        v-if="showLoad"
        title="Load tileset"
        :items="browseTilesets"
        filterable
        folder
        empty-icon="icon-select"
        new-label="New tileset"
        empty-text="No tilesets yet — create one to get started."
        @select="pickLoad"
        @create="pickLoad('__new__')"
        @close="showLoad = false"
    />
  </div>
</template>

<style scoped>
/* Control scale: the toolbar is the art editor's .editor-toolbar chrome
 * (36px .toolbar-btn); --ctl-sm sizes the dock's micro controls. */
.tsx-page {
  --ctl: 34px;
  --ctl-sm: 26px;
}

.tsx-page .toolbar-btn:disabled { opacity: 0.4; cursor: default; }
.tsx-page .publish-toolbar-btn:disabled { opacity: 0.55; cursor: default; }
.tsx-page .toolbar-end { gap: var(--space-1); }

/* ===== Shell: desk + dock (dock matches the editor's widget column:
 * 24% capped at 190px) ===== */
/* Shell reuses the art editor's .editor-body row (gap --space-3);
 * the dock reuses .editor-sidebar (24% capped at 190px) but sits LEFT —
 * order flips it without moving the DOM, so mobile keeps desk-first. */
@media (min-width: 768px) {
  /* align-items:start is a ROW concern (top-align desk + dock). On mobile the
   * shell is a column; keep the default stretch so the desk and dock fill the
   * width — otherwise both collapse to their content width and the desk (a
   * square) shrinks to the tiny "No tiles yet" placeholder. */
  .tsx-shell { align-items: start; }
  /* Stretch the dock to the row height so its right divider runs full-height. */
  .tsx-shell .tsx-dock { order: -1; flex-shrink: 0; align-self: stretch; }
}

.tsx-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  min-width: 0;
}

/* Positioning context so the floating zoom pill doesn't scroll with the desk. */
.tsx-deskwrap { position: relative; }

/* The desk rides on .tm-stage (square); the camera pans inside it, so no
 * scrolling or padding — the canvas covers the whole surface. */
.tsx-desk {
  padding: 0;
  overflow: hidden;
  touch-action: none;
  cursor: grab;
  background-image: none;   /* the canvas draws its own base-cell grid */
}

.tsx-desk.panning { cursor: grabbing; }
.tsx-desk.panning .tsx-board { pointer-events: none; }

.tsx-desk-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  color: var(--muted);
  font-size: var(--text-sm);
  text-align: center;
}

/* The board: everything (groups, tiles, slots) is drawn on one canvas that
 * fills the stage; the camera makes it effectively infinite. */
.tsx-boardwrap {
  position: absolute;
  inset: 0;
}

.tsx-board {
  position: absolute;
  inset: 0;
  display: block;
  image-rendering: pixelated;
}

.tsx-group-count {
  font-style: normal;
  font-size: var(--text-2xs);
  color: color-mix(in oklab, var(--muted) 70%, transparent);
  font-variant-numeric: tabular-nums;
}

/* Selection bar — floats at the bottom of the desk. */
.tsx-selbar {
  position: absolute;
  bottom: var(--space-3);
  left: 50%;
  translate: -50% 0;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  max-width: 100%;
  padding: var(--space-1) var(--space-2);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  box-shadow: 0 8px 24px -12px rgba(0, 0, 0, 0.25);
}

.tsx-selbar-thumb {
  width: 22px;
  height: 22px;
  object-fit: contain;
  image-rendering: pixelated;
  flex-shrink: 0;
}

.tsx-selbar-name {
  font-size: var(--text-2xs);
  font-weight: 700;
  color: var(--foreground);
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tsx-selbar-hint {
  font-size: var(--text-2xs);
  color: var(--muted);
  white-space: nowrap;
}

.tsx-selbar-btn {
  width: var(--ctl-sm, 26px);
  height: var(--ctl-sm, 26px);
  display: flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--muted);
  cursor: pointer;
}

.tsx-selbar-btn:hover { background: var(--surface-2); color: var(--foreground); }
.tsx-selbar-btn.danger:hover { color: var(--danger); }
.tsx-selbar-btn .icon { width: 13px; height: 13px; }

.tsx-pop-enter-active, .tsx-pop-leave-active { transition: opacity 140ms ease, transform 140ms ease; }
.tsx-pop-enter-from, .tsx-pop-leave-to { opacity: 0; transform: translateY(6px); }

/* ===== Dock: one flat column, hairline-separated sections ===== */
.tsx-dock {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.tsx-mini-btn {
  width: var(--ctl-sm, 26px);
  height: var(--ctl-sm, 26px);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--muted);
  cursor: pointer;
}

.tsx-mini-btn:hover { color: var(--foreground); }
.tsx-mini-btn .icon { width: 12px; height: 12px; }

/* Add tiles modal */

.tsx-add-src {
  display: flex;
  gap: var(--space-2);
}

.tsx-add-src .tm-search { margin-bottom: 0; }

.tsx-import {
  text-transform: none;
  letter-spacing: 0;
  height: var(--ctl-sm, 26px);
  max-width: 150px;
  padding: 0 var(--space-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--muted);
  font-size: var(--text-2xs);
  font-weight: 600;
  cursor: pointer;
}

.tsx-add-coll {
  height: var(--ctl, 34px);
  max-width: 40%;
  flex-shrink: 0;
}

.tsx-add-all {
  flex-shrink: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--primary);
  font-size: var(--text-2xs);
  font-weight: 700;
  cursor: pointer;
}

.tsx-add-all:hover { text-decoration: underline; }

/* Fixed-height body: the modal never resizes while searching/filtering. */
.tsx-add-body {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  height: min(46vh, 380px);
  overflow: auto;
}

.tsx-add-status {
  padding: var(--space-5) 0;
  text-align: center;
}

.tsx-add-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: var(--space-1);
  align-content: start;
}

.tsx-result {
  position: relative;
  aspect-ratio: 1;
  padding: 3px;
  border: 1px solid color-mix(in oklab, var(--border) 60%, transparent);
  border-radius: var(--radius-sm);
  background: transparent;
  cursor: pointer;
}

.tsx-result.picked {
  border-color: var(--primary);
  box-shadow: 0 0 0 1px var(--primary);
}

/* Already in the tileset: click marks it for removal. */
.tsx-result.added {
  border-color: color-mix(in oklab, var(--primary) 40%, var(--border));
}

.tsx-result.removing {
  border-color: var(--danger);
  box-shadow: 0 0 0 1px var(--danger);
  opacity: 0.6;
}

.tsx-result.removing .tsx-result-badge { color: var(--danger); }

.tsx-result img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  image-rendering: pixelated;
}

.tsx-result-badge {
  position: absolute;
  right: 1px;
  bottom: 1px;
  width: 11px;
  height: 11px;
  color: var(--primary);
  background: var(--surface);
  border-radius: var(--radius-sm);
}

/* Dock: group settings rows */
.tsx-label-actions {
  display: flex;
  gap: var(--space-1);
}

.tsx-group-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin: 0 calc(-1 * var(--space-2));
  padding: 0 var(--space-2);
  border-radius: var(--radius-sm);
  cursor: pointer;
}

.tsx-group-row.active {
  background: color-mix(in oklab, var(--primary) 8%, transparent);
  box-shadow: inset 2px 0 0 0 var(--primary);
}

.tsx-kind-ic {
  width: 12px;
  height: 12px;
  flex-shrink: 0;
  color: var(--muted);
}

.tsx-page .file-menu-item,
.tsx-page .file-menu-item span { white-space: nowrap; }

/* Build borders modal */

.tsx-build-cols {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-5);
  align-items: start;
}

@media (max-width: 640px) {
  .tsx-build-cols { grid-template-columns: 1fr; }
}

.tsx-build-left,
.tsx-build-right {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  min-width: 0;
}

.tsx-build-grid {
  max-height: 128px;
  overflow: auto;
  align-content: start;
}

/* ui-tooltip wrappers stay layout-transparent in page containers. */
.tsx-selbar .tooltip-wrapper,
.tsx-label-actions .tooltip-wrapper,
.tsx-build-pager .tooltip-wrapper,
.tsx-build-controls .tooltip-wrapper,
.tsx-build-style .tooltip-wrapper { display: inline-flex; }

.tsx-build-style .tooltip-wrapper { flex: 1; min-width: 0; }

.tsx-build-style .tooltip-wrapper > button { flex: 1; width: 100%; }

.tsx-build-slotgrid .tooltip-wrapper { display: flex; min-width: 0; }

.tsx-build-slotgrid .tooltip-wrapper > .tsx-build-slot { flex: 1; width: 100%; }

/* Section labels give both columns one consistent rhythm. */
.tsx-build-sec {
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted, #888);
  margin-top: var(--space-2, 8px);
}

.tsx-build-sec:first-child { margin-top: 0; }

.tsx-build-sec em {
  font-style: normal;
  color: var(--primary, #6366f1);
  text-transform: none;
  letter-spacing: 0;
}

/* Section header with a trailing "More/Less" toggle (Style). */
.tsx-build-sec:has(.tsx-build-morelink) {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.tsx-build-morelink {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: none;
  color: var(--primary, #6366f1);
  background: none;
  border: 0;
  padding: 2px 4px;
  cursor: pointer;
}

.tsx-build-morelink:hover { text-decoration: underline; }

/* Style: a proper full-width segmented control, not two floating chips. */
.tsx-build-modal .tsx-build-style { display: flex; width: 100%; }

.tsx-build-modal .tsx-build-style button { flex: 1; min-width: 0; }

/* Sources: uniform vertical cards on a fixed 5-column grid — every card the
 * same size, main row and override row align column-for-column. */
.tsx-build-slotgrid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: var(--space-2, 8px);
}

.tsx-build-slot {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: var(--space-2, 8px) 2px var(--space-1, 4px);
  border: 1px solid var(--border, #ddd);
  border-radius: var(--radius-sm, 6px);
  background: var(--surface, #fff);
  color: var(--muted, #888);
  font-size: 10px;
  font-weight: 700;
  cursor: pointer;
}

.tsx-build-slot.active {
  border-color: var(--primary, #6366f1);
  color: var(--primary, #6366f1);
  box-shadow: 0 0 0 1px var(--primary, #6366f1);
}

.tsx-build-slotgrid-sub .tsx-build-slot:not(.active) { opacity: 0.75; }

.tsx-build-slot-thumb {
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  background:
      repeating-conic-gradient(color-mix(in oklab, var(--muted, #888) 14%, transparent) 0 25%, transparent 0 50%)
      0 0 / 8px 8px;
  border-radius: 2px;
}

/* Unassigned slot: quiet dashed placeholder instead of a fake texture. */
.tsx-build-slot-thumb.empty {
  background: none;
  border: 1px dashed var(--border, #ccc);
}

.tsx-build-slot-thumb img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  image-rendering: pixelated;
}

.tsx-build-varcount {
  font-size: 10px;
  font-weight: 800;
  color: var(--primary, #6366f1);
  font-variant-numeric: tabular-nums;
}

/* Why Generate is disabled — one quiet line above the actions. */
.tsx-build-hint {
  margin: 0;
  font-size: 11px;
  color: var(--muted, #888);
  text-align: right;
}

.tsx-build-pager {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-3);
  font-size: var(--text-xs);
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}

/* Roomier controls inside the Build modal — the compact dock sizes are too
 * small for a working dialog. */
.tsx-build-modal .tsx-chips button {
  height: var(--ctl, 34px);
  min-width: 48px;
  padding: 0 var(--space-3);
  font-size: var(--text-xs);
}

.tsx-build-modal .tsx-build-field input {
  height: var(--ctl, 34px);
  width: 64px;
  font-size: var(--text-xs);
}

.tsx-build-modal .tsx-build-field,
.tsx-build-modal .tsx-build-switch { font-size: var(--text-xs); }

.tsx-build-modal .tsx-build-grid {
  grid-template-columns: repeat(5, minmax(0, 1fr));
  max-height: 180px;
}

.tsx-build-controls {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  flex-wrap: wrap;
}

.tsx-build-field {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-2xs);
  font-weight: 700;
  color: var(--muted);
}

.tsx-build-field input {
  width: 52px;
  height: var(--ctl-sm, 26px);
  padding: 0 var(--space-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--foreground);
  font-size: var(--text-2xs);
}

.tsx-build-switch {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-2xs);
  font-weight: 700;
  color: var(--muted);
  cursor: pointer;
}

.tsx-build-body {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: var(--space-3);
  background:
      repeating-conic-gradient(color-mix(in oklab, var(--muted) 12%, transparent) 0 25%, transparent 0 50%)
      0 0 / 12px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}

.tsx-build-varbody { max-height: 170px; overflow: auto; }

.tsx-build-preview {
  image-rendering: pixelated;
  max-width: 100%;
}

.tsx-weight-val {
  align-self: center;
  min-width: 26px;
  text-align: center;
  font-size: var(--text-2xs);
  font-weight: 800;
  color: var(--primary);
  font-variant-numeric: tabular-nums;
}

/* Relations modal rows — modal is Teleported, so no page-scoped vars here. */
.tsx-rel-row {
  display: flex;
  align-items: center;
  gap: var(--space-2, 8px);
  padding: var(--space-1, 4px) 0;
}

.tsx-rel-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--text-sm, 13px);
  font-weight: 600;
}

.tsx-rel-help {
  margin-top: var(--space-2, 8px);
  line-height: 1.5;
}

/* 16/47 terrain-type toggle in the toolbar. */
.tsx-tb-type {
  font-size: var(--text-2xs);
  font-weight: 800;
  letter-spacing: 0.02em;
}

.tsx-terrain-name {
  flex: 1;
  min-width: 0;
  height: var(--ctl-sm, 26px);
  padding: 0 var(--space-2);
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--foreground);
  font-size: var(--text-xs);
  font-weight: 700;
}

.tsx-terrain-name:hover,
.tsx-terrain-name:focus {
  background: var(--surface);
  outline: none;
}

/* Tile size */
.tsx-chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
}

.tsx-chips button {
  min-width: 34px;
  height: var(--ctl-sm, 26px);
  padding: 0 var(--space-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--muted);
  font-size: var(--text-2xs);
  font-weight: 700;
  cursor: pointer;
}

.tsx-chips button.active { border-color: var(--primary); color: var(--primary); }

.tsx-modal-dims { margin-top: var(--space-2); }

.tsx-cell-dims {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  font-size: var(--text-2xs);
  color: var(--muted);
  flex-wrap: wrap;
}

.tsx-cell-dims label {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  font-weight: 700;
}

.tsx-cell-dims input {
  width: 56px;
  height: var(--ctl-sm, 26px);
  padding: 0 var(--space-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--foreground);
  font-size: var(--text-2xs);
}
</style>

<style>
/* Modal variant sizing — unscoped: these classes land on UiModal's
   inner div (rendered by the shared component, outside this scope). */
.tsx-add-modal {
  max-width: 520px;
  width: calc(100vw - 2rem);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.tsx-build-modal {
  max-width: 680px;
  width: calc(100vw - 2rem);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
</style>
