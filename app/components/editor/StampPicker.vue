<script setup lang="ts">
import {defineComponent, h, type PropType} from 'vue'
import {toast} from 'vue-sonner'
import {debounce} from '~/helper/utils'
import {layers2MapNumbers} from '~/helper/canvas'
import {tileImageUrl} from '~/helper/tilemap'
import type {Terrain} from '~/helper/autotile'
import {
  gatheredSet, isGathered, isLocalSet, parseTileset, patchOf, randomBrushes, stripOf, terrainFace, terrainPieces,
  ANY_ID, type Brush, type BrushGroup, type BrushSet,
} from '~/helper/tileBrush'
import {flipPixels, loadSheet, sheets, tilePixels, type TilePixels} from '~/helper/tileSheet'

// The art brush is one thing: a strip of brushes -- one artwork, a few
// gathered one by one, or a whole tileset -- and how they land: free, or on
// the grid (square or iso), flipped, or erasing. A tileset brings two more
// kinds of brush, as in the tilemap editor: its terrains, which auto-tile,
// and its random groups, which scatter. The mobile editor has the same.

const {t} = useI18n()
const store = useEditor()
const auth = useAuthStore()
const localTs = useLocalTilesets()
const apiBase = useRuntimeConfig().public.api as string

const set = computed(() => store.tileBrush?.set || null)
const strip = computed(() => set.value ? stripOf(set.value, store.brushRecents) : [])
const busy = ref(false)

// ── Pictures of tiles ────────────────────────────────────────────────
// From the tileset's sheet when the server has one: one picture for the
// whole set, each tile a window on it. Otherwise a picture per tile.

function slugOf(s: BrushSet, id: number) {
  return s.tiles.find(x => x.id === id)?.id_string || ''
}

function localTile(s: BrushSet, id: number) {
  if (!isLocalSet(s)) return null
  return localTs.get(s.id_string.slice(6))?.tiles.find(x => x.tid === id) || null
}

function sheetStyle(s: BrushSet, id: number): Record<string, string> | null {
  if (!s.id_string || isLocalSet(s)) return null
  const info = sheets.get(s.id_string)
  const r = info?.rects[String(id)]
  if (!info || !r) return null
  const [x, y, w, h] = r
  return {
    backgroundImage: `url(${info.url})`,
    backgroundSize: `${info.w / w * 100}% ${info.h / h * 100}%`,
    backgroundPosition: `${info.w === w ? 0 : x / (info.w - w) * 100}% ${info.h === h ? 0 : y / (info.h - h) * 100}%`,
    aspectRatio: `${w} / ${h}`,
    [w >= h ? 'width' : 'height']: '100%',
  }
}

const TileImg = defineComponent({
  props: {set: {type: Object as PropType<BrushSet>, required: true}, id: {type: Number, required: true}},
  setup(p) {
    return () => {
      const style = sheetStyle(p.set, p.id)
      if (style) return h('span', {class: 'stp-sheet', style})
      const local = localTile(p.set, p.id)
      const src = local ? local.thumb : tileImageUrl(apiBase, slugOf(p.set, p.id))
      return h('img', {src, alt: '', loading: 'lazy', decoding: 'async'})
    }
  },
})

const patches = new WeakMap<Terrain, (number | null)[]>()
function patch(tr: Terrain) {
  let p = patches.get(tr)
  if (!p) patches.set(tr, p = patchOf(tr))
  return p
}

// ── Taking a brush up ────────────────────────────────────────────────

function edPixels(ed: any): TilePixels | null {
  const w = Number(ed?.width) || 0, hh = Number(ed?.height) || 0
  if (!w || !hh) return null
  const colors: string[] = Array.isArray(ed.colors) ? ed.colors.map(String) : []
  const grid = layers2MapNumbers(ed)
  const cells: (string | null)[][] = Array.from({length: hh}, () => Array(w).fill(null))
  for (const k in grid) {
    const hex = colors[grid[k]!]
    const [x, y] = k.split('_').map(Number) as [number, number]
    if (hex && x >= 0 && x < w && y >= 0 && y < hh) cells[y]![x] = hex
  }
  return {w, h: hh, cells}
}

function toStamp(s: BrushSet, id: number, px: TilePixels, fh: boolean, fv: boolean) {
  return {key: `tile:${s.id_string}:${id}:${fh ? 1 : 0}${fv ? 1 : 0}`, name: slugOf(s, id), ...flipPixels(px, fh, fv)}
}

/** Loads what a brush needs and puts it in hand: the tile it shows, the
 *  tiles a random brush scatters, and -- for a terrain brush, or erasing
 *  next to one -- every terrain piece. */
async function select(s: BrushSet, o: { ids: number[]; shows: number; random?: string; terrain?: string }) {
  const pieces = (o.terrain || store.brushErase) && s.terrains.length ? [...terrainPieces(s)] : []
  const want = [...new Set([o.shows, ...o.ids, ...pieces])]
  busy.value = true
  try {
    const local = isLocalSet(s) ? (id: number) => edPixels(localTile(s, id)?.ed) : undefined
    const got = await Promise.all(want.map(id => tilePixels(s, id, apiBase, local)))
    const px = new Map<number, TilePixels>()
    want.forEach((id, i) => { if (got[i]) px.set(id, got[i]!) })
    const shown = px.get(o.shows)
    if (!shown) {
      toast.error(t('c_StampPicker.couldNotLoadArt'))
      return
    }
    // A terrain's pieces are drawn to fit each other as they are: no flips.
    const fh = !o.terrain && store.brushFlipH, fv = !o.terrain && store.brushFlipV
    store.setTileBrush({
      set: s,
      tileId: o.shows,
      randomId: o.random ?? null,
      terrainId: o.terrain ?? null,
      variants: o.random ? o.ids.filter(id => px.has(id)).map(id => toStamp(s, id, px.get(id)!, fh, fv)) : [],
      pieces: new Map(pieces.filter(id => px.has(id)).map(id => [id, toStamp(s, id, px.get(id)!, false, false)])),
    }, toStamp(s, o.shows, shown, fh, fv))
  } finally {
    busy.value = false
  }
}

const selectTile = (s: BrushSet, id: number) => select(s, {ids: [id], shows: id})
const selectRandom = (s: BrushSet, g: BrushGroup) => select(s, {ids: g.tiles, shows: g.tiles[0]!, random: g.id})

/** Terrains are drawn for the square grid, so that is where the brush goes. */
function selectTerrain(s: BrushSet, tr: Terrain) {
  const face = terrainFace(tr)
  if (face == null) return
  store.brushSnap = true
  store.brushIso = false
  return select(s, {ids: [], shows: face, terrain: tr.id})
}

/** The brush in hand again, after how it lands changed: rebuilt to match. */
function reselect() {
  const tb = store.tileBrush
  if (!tb) return
  const tr = tb.terrainId ? tb.set.terrains.find(x => x.id === tb.terrainId) : null
  if (tr) return selectTerrain(tb.set, tr)
  const g = tb.randomId ? randomBrushes(tb.set).find(x => x.id === tb.randomId) : null
  if (g) return selectRandom(tb.set, g)
  return selectTile(tb.set, tb.tileId)
}

/** Picking a brush means painting with it, so the eraser goes down. */
function pick(b: Brush) {
  const s = set.value
  if (!s || busy.value) return
  store.brushErase = false
  if (b.kind === 'terrain') return selectTerrain(s, b.terrain)
  if (b.kind === 'random') return selectRandom(s, b.group)
  return selectTile(s, b.tile)
}

function held(b: Brush): boolean {
  const tb = store.tileBrush
  if (!tb) return false
  if (b.kind === 'terrain') return tb.terrainId === b.terrain.id
  if (b.kind === 'random') return tb.randomId === b.group.id
  return !tb.terrainId && !tb.randomId && tb.tileId === b.tile
}

function label(b: Brush): string {
  if (b.kind === 'terrain') return b.terrain.name || t('c_StampPicker.terrain')
  if (b.kind === 'random') return b.group.id === ANY_ID || !b.group.name ? t('c_StampPicker.randomBrush') : b.group.name
  return set.value ? slugOf(set.value, b.tile).replace(/[-_]+/g, ' ') : ''
}

/** Back to how a new brush lands: no flips, nothing erased, no favourites. */
function resetBrush(snap: boolean, iso = false) {
  store.brushFlipH = false
  store.brushFlipV = false
  store.brushSnap = snap
  store.brushIso = iso
  store.brushErase = false
  store.brushRecents = []
}

// ── How it lands ─────────────────────────────────────────────────────

const terrainHeld = computed(() => !!store.tileBrush?.terrainId)
const isoH = computed(() => set.value ? Math.max(1, Math.round(set.value.cellW * set.value.isoRatio)) : 0)
const placeIcon = computed(() => !store.brushSnap ? 'icon-grid-off' : store.brushIso ? 'icon-rhombus' : 'icon-grid')

function place(snap: boolean, iso: boolean) {
  store.brushSnap = snap
  store.brushIso = iso
}

function setFlip(axis: 'h' | 'v', on: boolean) {
  if (axis === 'h') store.brushFlipH = on
  else store.brushFlipV = on
  reselect()
}

function toggleErase() {
  store.brushErase = !store.brushErase
  // Erasing next to a terrain re-picks its edges: its pieces must be at hand.
  const tb = store.tileBrush
  if (store.brushErase && tb?.set.terrains.length && !tb.pieces.size) reselect()
}

// ── One artwork ──────────────────────────────────────────────────────

interface ArtRow { id: number; slug: string; name: string; w: number; h: number }

const showArt = ref(false)
const artSource = ref<'mine' | 'explore'>('explore')
const artQuery = ref('')
const arts = ref<ArtRow[]>([])
const artsLoading = ref(false)
let artRun = 0

async function loadArts() {
  const run = ++artRun
  artsLoading.value = true
  try {
    const mine = artSource.value === 'mine'
    const res = await useNativeFetch<{ results: any[] }>('/coloring/shared-pages/', {
      params: mine
          ? {user: auth.logged?.username, page_size: 48, ordering: '-updated', search: artQuery.value.trim() || undefined}
          : {status: 'public', has_pages: 1, page_size: 48, search: artQuery.value.trim() || undefined},
    })
    if (run !== artRun) return
    arts.value = (res.results || []).filter(r => r?.id && r?.id_string).map(r => ({
      id: Number(r.id), slug: r.id_string, name: r.name || r.id_string, w: Number(r.width) || 0, h: Number(r.height) || 0,
    }))
  } catch {
    if (run === artRun) arts.value = []
  } finally {
    if (run === artRun) artsLoading.value = false
  }
}

const debouncedArts = debounce(loadArts, 350)
watch(artQuery, () => { if (showArt.value) debouncedArts() })
watch(artSource, () => { if (showArt.value) loadArts() })

function openArt() {
  artSource.value = auth.isLogged ? 'mine' : 'explore'
  artQuery.value = ''
  showArt.value = true
  loadArts()
}

/** The first artwork starts a strip, free to land anywhere; later ones join
 *  it, on the grid the first one set. */
async function addArt(a: ArtRow) {
  if (!a.w || !a.h) { toast.error(t('c_StampPicker.noPixelsToBrush')); return }
  const cur = set.value
  const tile = {id: a.id, id_string: a.slug}
  const grows = !!cur && isGathered(cur)
  const next = grows
      ? (cur!.tiles.some(x => x.id === a.id) ? cur! : {...cur!, tiles: [...cur!.tiles, tile]})
      : gatheredSet(t('c_StampPicker.artBrush'), a.w, a.h, [tile])
  if (!grows) resetBrush(false)
  showArt.value = false
  await selectTile(next, a.id)
}

// ── A tileset ────────────────────────────────────────────────────────

interface TsRow { key: string; name: string; count: number; face: string; user?: string; local?: boolean }

const showSets = ref(false)
const mineSets = ref<TsRow[]>([])
const publicSets = ref<TsRow[]>([])
const localSets = computed<TsRow[]>(() => localTs.list.value
    .filter(x => x.tiles.length)
    .map(x => ({key: `local:${x.id}`, name: x.name, count: x.tiles.length, face: x.tiles[0]?.thumb || '', local: true})))
const setsLoading = ref(false)

function rowOf(j: any): TsRow | null {
  const s = parseTileset(j)
  if (!s.tiles.length) return null
  // A terrain's inside piece says more about a set than whatever tile was
  // registered first (often a blank).
  const faceId = s.terrains.length ? terrainFace(s.terrains[0]!) : null
  const slug = (faceId != null && slugOf(s, faceId)) || s.tiles[0]!.id_string
  return {key: s.id_string, name: s.name || t('common.untitled'), count: s.tiles.length, face: tileImageUrl(apiBase, slug), user: j?.username}
}

async function openSets() {
  showSets.value = true
  setsLoading.value = true
  // Either list can fail alone (a guest has none of their own) without
  // hiding the other.
  const list = (params: any) => useNativeFetch<{ results: any[] }>('/coloring/tilesets/', {params})
      .then(r => (r.results || []).map(rowOf).filter(Boolean) as TsRow[])
      .catch(() => [] as TsRow[])
  const [mine, pub] = await Promise.all([
    auth.isLogged ? list({page_size: 100, ordering: '-updated'}) : Promise.resolve([] as TsRow[]),
    list({public: 1, page_size: 100, ordering: '-updated'}),
  ])
  const own = new Set(mine.map(r => r.key))
  mineSets.value = mine
  publicSets.value = pub.filter(r => !own.has(r.key))
  setsLoading.value = false
}

/** A tileset fills the brush, snapped to its grid -- what it is drawn for.
 *  One with terrains starts on its first one: most of its tiles are that. */
async function pickSet(row: TsRow) {
  if (busy.value) return
  let s: BrushSet | null = null
  busy.value = true
  try {
    if (row.local) {
      const lt = localTs.get(row.key.slice(6))
      if (lt) {
        const registry = Object.fromEntries(lt.tiles.map(x => [String(x.tid), x.key]))
        s = parseTileset({name: lt.name, meta: {...(lt.meta || {}), registry}}, row.key)
      }
    } else {
      const j = await useNativeFetch<any>(`/coloring/tilesets/${row.key}/`)
      s = parseTileset(j)
      // Every tile in one picture, before the strip asks for any of them.
      await loadSheet(s.id_string)
    }
  } catch {
    s = null
  } finally {
    busy.value = false
  }
  if (!s || !s.tiles.length) {
    toast.error(s ? t('c_StampPicker.tilesetEmpty') : t('c_StampPicker.couldNotLoadTileset'))
    return
  }
  showSets.value = false
  resetBrush(true, s.iso)
  const tr = s.iso ? null : s.terrains[0]
  if (tr) return selectTerrain(s, tr)
  const pieces = terrainPieces(s)
  return selectTile(s, (s.tiles.find(x => !pieces.has(x.id)) || s.tiles[0]!).id)
}

// ── Browsing the whole set ───────────────────────────────────────────

const showBrowse = ref(false)
const browseGroup = ref('')
const browseBrushes = computed(() => strip.value.filter(b => b.kind !== 'tile'))
const browseGroups = computed(() => (set.value?.groups || []).filter(g => g.tiles.length))
const browseTiles = computed(() => {
  const s = set.value
  if (!s) return []
  const g = browseGroups.value.find(x => x.id === browseGroup.value)
  return g ? g.tiles : s.tiles.map(x => x.id)
})

function openBrowse() {
  browseGroup.value = ''
  showBrowse.value = true
}

/** A tile fetched from deep in the set stays at hand, up front in the strip. */
async function pickFromBrowse(b: Brush) {
  showBrowse.value = false
  if (b.kind === 'tile') store.brushRecents = [b.tile, ...store.brushRecents.filter(id => id !== b.tile)].slice(0, 8)
  await pick(b)
}

function addFrom(kind: 'art' | 'tileset') {
  showBrowse.value = false
  if (kind === 'art') openArt()
  else openSets()
}
</script>

<template>
  <Widget class="stp" :title="$t('c_StampPicker.artBrush')">
    <template v-if="set" #ctl>
      <span class="stp-ctl">
      <button type="button" class="widget-ctl-btn" :title="$t('c_StampPicker.browseTiles')" :aria-label="$t('c_StampPicker.browseTiles')" @click="openBrowse">
        <span class="icon icon-apps"/>
      </button>
      <ui-dropdown-menu>
        <button type="button" class="widget-ctl-btn" :title="$t('c_StampPicker.placement')">
          <span class="icon" :class="placeIcon"/>
          <span class="icon icon-chevron-down"/>
        </button>
        <template #menu>
          <div class="file-menu">
            <button class="file-menu-item" :disabled="terrainHeld" @click="place(false, false)">
              <span class="icon icon-grid-off"/>
              <span class="file-menu-label"><span>{{ $t('c_StampPicker.placeFree') }}</span><span v-if="!store.brushSnap" class="icon icon-check"/></span>
            </button>
            <button class="file-menu-item" @click="place(true, false)">
              <span class="icon icon-grid"/>
              <span class="file-menu-label">
                <span>{{ $t('c_StampPicker.placeGrid') }} <em class="stp-dim">{{ set.cellW }}×{{ set.cellH }}</em></span>
                <span v-if="store.brushSnap && !store.brushIso" class="icon icon-check"/>
              </span>
            </button>
            <button class="file-menu-item" :disabled="terrainHeld" @click="place(true, true)">
              <span class="icon icon-rhombus"/>
              <span class="file-menu-label">
                <span>{{ $t('common.isometric') }} <em class="stp-dim">{{ set.cellW }}×{{ isoH }}</em></span>
                <span v-if="store.brushSnap && store.brushIso" class="icon icon-check"/>
              </span>
            </button>
            <p v-if="terrainHeld" class="stp-note">{{ $t('c_StampPicker.terrainGridNote') }}</p>
            <template v-else>
              <div class="file-menu-sep"/>
              <label class="file-menu-item" data-keep-open>
                <span class="icon icon-flip-h"/>
                <span class="file-menu-label">
                  <span>{{ $t('c_StampPicker.flipHorizontal') }}</span>
                  <ui-switch :model-value="store.brushFlipH" @update:model-value="setFlip('h', $event)"/>
                </span>
              </label>
              <label class="file-menu-item" data-keep-open>
                <span class="icon icon-flip-v"/>
                <span class="file-menu-label">
                  <span>{{ $t('c_StampPicker.flipVertical') }}</span>
                  <ui-switch :model-value="store.brushFlipV" @update:model-value="setFlip('v', $event)"/>
                </span>
              </label>
            </template>
          </div>
        </template>
      </ui-dropdown-menu>
      <button
          type="button"
          class="widget-ctl-btn"
          :class="{active: store.brushErase}"
          :aria-pressed="store.brushErase"
          :title="$t('c_StampPicker.eraseTiles')"
          :aria-label="$t('c_StampPicker.eraseTiles')"
          @click="toggleErase"
      >
        <span class="icon icon-eraser"/>
      </button>
      </span>
    </template>

    <div class="stp-body" :aria-busy="busy">
      <div v-if="!set" class="file-menu stp-start">
        <button class="file-menu-item" @click="openArt">
          <span class="icon icon-image"/>
          <span class="stp-opt"><span>{{ $t('c_StampPicker.oneArtwork') }}</span><span class="stp-dim">{{ $t('c_StampPicker.oneArtworkNote') }}</span></span>
        </button>
        <button class="file-menu-item" @click="openSets">
          <span class="icon icon-grid"/>
          <span class="stp-opt"><span>{{ $t('c_StampPicker.aTileset') }}</span><span class="stp-dim">{{ $t('c_StampPicker.aTilesetNote') }}</span></span>
        </button>
      </div>

      <div v-else class="stp-thumbs no-scrollbar">
        <button
            v-for="b in strip"
            :key="b.key"
            type="button"
            class="stp-thumb"
            :class="{active: held(b)}"
            :title="label(b)"
            @click="pick(b)"
        >
          <span v-if="b.kind === 'terrain'" class="stp-patch">
            <span v-for="(id, i) in patch(b.terrain)" :key="i" class="stp-patch-cell">
              <TileImg v-if="id != null" :set="set" :id="id"/>
            </span>
          </span>
          <template v-else-if="b.kind === 'random'">
            <TileImg :set="set" :id="b.group.tiles[0]!"/>
            <span class="stp-badge"><span class="icon icon-swap"/></span>
          </template>
          <TileImg v-else :set="set" :id="b.tile"/>
        </button>
        <ui-dropdown-menu class="stp-add-dd">
          <button type="button" class="stp-thumb stp-add" :title="$t('c_StampPicker.addToBrush')" :aria-label="$t('c_StampPicker.addToBrush')">
            <span class="icon icon-plus"/>
          </button>
          <template #menu>
            <div class="file-menu">
              <button class="file-menu-item" @click="openArt"><span class="icon icon-image"/><span>{{ $t('c_StampPicker.oneArtwork') }}</span></button>
              <button class="file-menu-item" @click="openSets"><span class="icon icon-grid"/><span>{{ $t('c_StampPicker.aTileset') }}</span></button>
            </div>
          </template>
        </ui-dropdown-menu>
      </div>
    </div>
  </Widget>

  <UiModal v-if="showArt" :title="$t('c_StampPicker.oneArtwork')" :sub="$t('c_StampPicker.oneArtworkNote')" width="34rem" @close="showArt = false">
    <div class="stp-modal">
      <div class="stp-row">
        <div v-if="auth.isLogged" class="tm-seg">
          <button :class="{active: artSource === 'mine'}" @click="artSource = 'mine'">{{ $t('c_StampPicker.myArts') }}</button>
          <button :class="{active: artSource === 'explore'}" @click="artSource = 'explore'">{{ $t('c_StampPicker.explore') }}</button>
        </div>
        <label class="stp-search">
          <span class="icon icon-search"/>
          <input v-model="artQuery" type="search" :placeholder="$t('common.search')">
        </label>
      </div>
      <div v-if="artsLoading && !arts.length" class="stp-grid">
        <div v-for="i in 12" :key="i" class="stp-thumb skeleton"/>
      </div>
      <div v-else-if="arts.length" class="stp-grid">
        <button v-for="a in arts" :key="a.id" type="button" class="stp-thumb" :title="a.name" @click="addArt(a)">
          <img :src="tileImageUrl(apiBase, a.slug)" alt="" loading="lazy" decoding="async">
        </button>
      </div>
      <p v-else class="stp-empty">{{ artQuery ? $t('common.nothingMatchesQ', {q: artQuery}) : $t('common.nothingHereYet') }}</p>
    </div>
  </UiModal>

  <UiModal v-if="showSets" :title="$t('c_StampPicker.tilesets')" :sub="$t('c_StampPicker.aTilesetNote')" width="30rem" @close="showSets = false">
    <div class="stp-modal">
      <div v-if="setsLoading" class="stp-empty">{{ $t('common.loading') }}</div>
      <template v-else>
        <template v-for="sec in [
          {key: 'mine', title: $t('c_StampPicker.yourTilesets'), rows: mineSets},
          {key: 'local', title: $t('c_StampPicker.inThisBrowser'), rows: localSets},
          {key: 'public', title: $t('c_StampPicker.publicTilesets'), rows: publicSets},
        ]" :key="sec.key">
          <template v-if="sec.rows.length">
            <span class="tm-label">{{ sec.title }}</span>
            <div class="file-menu stp-sets">
              <button v-for="r in sec.rows" :key="r.key" class="file-menu-item" :disabled="busy" @click="pickSet(r)">
                <span class="stp-set-face"><img v-if="r.face" :src="r.face" alt="" loading="lazy"></span>
                <span class="stp-opt">
                  <span>{{ r.name }}</span>
                  <span class="stp-dim">{{ $t('c_StampPicker.nTiles', {count: r.count}, r.count) }}<template v-if="r.user"> · {{ $t('c_StampPicker.byX', {x: `@${r.user}`}) }}</template></span>
                </span>
              </button>
            </div>
          </template>
        </template>
        <div v-if="!mineSets.length && !localSets.length && !publicSets.length" class="stp-empty">
          <p>{{ $t('c_StampPicker.noTilesets') }}</p>
          <NuxtLinkLocale to="/tilesets/editor" class="btn" @click="showSets = false">
            <span class="icon icon-grid"/><span>{{ $t('c_StampPicker.makeATileset') }}</span>
          </NuxtLinkLocale>
        </div>
      </template>
    </div>
  </UiModal>

  <UiModal v-if="showBrowse && set" :title="set.name || $t('c_StampPicker.artBrush')" :sub="$t('c_StampPicker.nTiles', {count: set.tiles.length}, set.tiles.length)" width="40rem" @close="showBrowse = false">
    <div class="stp-modal">
      <template v-if="browseBrushes.length">
        <span class="tm-label">{{ $t('c_StampPicker.brushes') }}</span>
        <div class="stp-brushes">
          <button v-for="b in browseBrushes" :key="b.key" type="button" class="stp-brush" :class="{active: held(b)}" @click="pickFromBrowse(b)">
            <span class="stp-thumb">
              <span v-if="b.kind === 'terrain'" class="stp-patch">
                <span v-for="(id, i) in patch(b.terrain)" :key="i" class="stp-patch-cell">
                  <TileImg v-if="id != null" :set="set" :id="id"/>
                </span>
              </span>
              <template v-else-if="b.kind === 'random'">
                <TileImg :set="set" :id="b.group.tiles[0]!"/>
                <span class="stp-badge"><span class="icon icon-swap"/></span>
              </template>
            </span>
            <span class="stp-brush-name">{{ label(b) }}</span>
          </button>
        </div>
      </template>
      <div class="stp-row">
        <span class="tm-label">{{ $t('common.tiles') }}</span>
        <ui-dropdown-menu>
          <button type="button" class="widget-ctl-btn" :title="$t('c_StampPicker.addToBrush')"><span class="icon icon-plus"/></button>
          <template #menu>
            <div class="file-menu">
              <button class="file-menu-item" @click="addFrom('art')"><span class="icon icon-image"/><span>{{ $t('c_StampPicker.oneArtwork') }}</span></button>
              <button class="file-menu-item" @click="addFrom('tileset')"><span class="icon icon-grid"/><span>{{ $t('c_StampPicker.aTileset') }}</span></button>
            </div>
          </template>
        </ui-dropdown-menu>
      </div>
      <div v-if="browseGroups.length > 1" class="onb-chips">
        <button class="onb-chip" :class="{active: !browseGroup}" @click="browseGroup = ''">{{ $t('c_StampPicker.all') }}</button>
        <button v-for="g in browseGroups" :key="g.id" class="onb-chip" :class="{active: browseGroup === g.id}" @click="browseGroup = g.id">{{ g.name }}</button>
      </div>
      <div class="stp-grid stp-grid-dense">
        <button
            v-for="id in browseTiles"
            :key="id"
            type="button"
            class="stp-thumb"
            :class="{active: !store.tileBrush?.terrainId && !store.tileBrush?.randomId && store.tileBrush?.tileId === id}"
            :title="slugOf(set, id)"
            @click="pickFromBrowse({kind: 'tile', tile: id, key: `tile:${id}`})"
        >
          <TileImg :set="set" :id="id"/>
        </button>
      </div>
    </div>
  </UiModal>
</template>

<style scoped>
.stp-body {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.stp-start { padding: 0; }

/* The three controls stay together, beside the title. */
.stp-ctl {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
}

.stp-opt {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  text-align: left;
}

.stp-dim {
  font-style: normal;
  font-size: var(--text-2xs);
  color: var(--muted);
}

.stp-note {
  margin: 0;
  padding: var(--space-1) var(--space-3) var(--space-2);
  font-size: var(--text-2xs);
  color: var(--muted);
}

.stp-thumbs {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: var(--space-1);
  max-height: calc(var(--space-6) * 7);
  overflow-y: auto;
}

.stp-thumb {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  aspect-ratio: 1;
  padding: 2px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  overflow: hidden;
  background: var(--surface-2);
  image-rendering: pixelated;
  cursor: pointer;
  transition: border-color var(--transition);
}

.stp-thumb.active {
  border-color: var(--primary);
  box-shadow: 0 0 0 1px var(--primary);
}

.stp-thumb :deep(img) {
  width: 100%;
  height: 100%;
  object-fit: contain;
  image-rendering: pixelated;
}

/* A tile cut from the set's sheet: the sheet as its background, scaled so
   this tile fills the box. */
.stp-thumb :deep(.stp-sheet) {
  display: block;
  max-width: 100%;
  max-height: 100%;
  background-repeat: no-repeat;
  image-rendering: pixelated;
}

.stp-add {
  color: var(--muted);
}

/* The "+" sits in the strip's grid like the brushes beside it. */
.stp-add-dd,
.stp-add-dd :deep(.dropdown-trigger-wrap) {
  width: 100%;
}

.stp-add .icon {
  width: var(--icon-md);
  height: var(--icon-md);
}

.stp-patch {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  width: 100%;
  height: 100%;
}

.stp-patch-cell {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.stp-badge {
  position: absolute;
  right: 0;
  bottom: 0;
  display: inline-flex;
  padding: 1px;
  border-top-left-radius: var(--radius-sm);
  background: color-mix(in oklab, var(--surface) 80%, transparent);
  color: var(--foreground);
}

.stp-badge .icon {
  width: var(--icon-sm);
  height: var(--icon-sm);
}

.stp-modal {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.stp-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.stp-search {
  display: flex;
  flex: 1;
  align-items: center;
  gap: var(--space-2);
  height: calc(var(--space-6) + var(--space-2));
  padding: 0 var(--space-2);
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--muted);
}

.stp-search:focus-within { border-color: var(--primary); }

.stp-search .icon {
  width: var(--icon-sm);
  height: var(--icon-sm);
  flex-shrink: 0;
}

.stp-search input {
  flex: 1;
  min-width: 0;
  background: none;
  border: 0;
  outline: none;
  font-size: var(--text-xs);
  color: var(--foreground);
}

.stp-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(calc(var(--space-6) * 3), 1fr));
  gap: var(--space-2);
  max-height: 55vh;
  overflow-y: auto;
}

.stp-grid-dense {
  grid-template-columns: repeat(auto-fill, minmax(calc(var(--space-6) * 2), 1fr));
  gap: var(--space-1);
}

.stp-brushes {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(calc(var(--space-6) * 3), 1fr));
  gap: var(--space-2);
}

.stp-brush {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding: 0;
  border: 0;
  background: none;
  color: var(--foreground);
  cursor: pointer;
}

.stp-brush.active .stp-thumb {
  border-color: var(--primary);
  box-shadow: 0 0 0 1px var(--primary);
}

.stp-brush-name {
  overflow: hidden;
  font-size: var(--text-2xs);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.stp-sets { padding: 0; }

.stp-set-face {
  display: inline-flex;
  flex: none;
  width: var(--space-6);
  height: var(--space-6);
  overflow: hidden;
  border-radius: var(--radius-sm);
  background: var(--surface-2);
}

.stp-set-face img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  image-rendering: pixelated;
}

.stp-empty {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-2);
  margin: 0;
  font-size: var(--text-xs);
  color: var(--muted);
}

.stp-empty p { margin: 0; }
</style>
