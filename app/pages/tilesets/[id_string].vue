<script setup lang="ts">
const localePath = useLocalePath()
const {t, locale} = useI18n()
import {toast} from 'vue-sonner'
import TilemapShowcase from '~/components/tilemap/TilemapShowcase.vue'
import {normalizeTilemap, computeGeometry, tileImageUrl} from '~/helper/tilemap'
import {loadSheet, sheetWindowStyle, sheets} from '~/helper/tileSheet'

const route = useRoute()
const config = useRuntimeConfig()
const auth = useAuthStore()
const apiBase = config.public.api as string

import {defineComponent, h} from 'vue'

const {data, error} = await useAuthFetch<any>(`/coloring/tilesets/${route.params.id_string}/`, {key: `detail:/coloring/tilesets/${route.params.id_string}/`})

if (error.value && import.meta.server) {
  setResponseStatus(useRequestEvent()!, 404)
}

const title = computed(() => data.value?.name || 'Untitled tileset')
useCrumbTitle(() => data.value ? title.value : '')
const isPublic = computed(() => data.value?.status === 'public')
const isOwner = computed(() =>
    !!auth.logged?.username && data.value?.username === auth.logged.username,
)
const meta = computed(() => data.value?.meta || {})
const registry = computed<Record<string, string>>(() => meta.value.registry || {})

const tiles = computed(() =>
    Object.entries(registry.value).map(([id, id_string]) => ({
      id: Number(id), id_string: id_string as string,
    })),
)
const visibleWorlds = computed(() =>
    (data.value?.worlds || []).filter((w: any) => isOwner.value || w.status === 'public'),
)

function tileSrc(idString: string) {
  return tileImageUrl(apiBase, idString)
}

// Tiles the way the editor arranges them: its groups and terrains, then
// whatever no group holds.
const groups = computed(() => {
  const reg = registry.value
  const seen = new Set<number>()
  const out = (Array.isArray(meta.value.groups) ? meta.value.groups : []).map((g: any, i: number) => {
    const terrain = g?.kind === 'terrain'
    const ids: number[] = (terrain ? Object.values(g?.map || {}) : (g?.tiles || [])).map(Number)
    const unique = [...new Set(ids)].filter(id => reg[String(id)])
    unique.forEach(id => seen.add(id))
    return {
      id: String(g?.id || `g${i}`),
      name: String(g?.name || (terrain ? t('p_tilesets_id_string.terrain') : t('p_tilesets_editor.group'))),
      terrain,
      tiles: unique.map(id => ({id, slug: reg[String(id)]!})),
    }
  }).filter((g: any) => g.tiles.length)
  // Biggest groups first: they are what the set is mostly made of. Tiles in
  // no group stay last, whatever their count.
  out.sort((a: any, b: any) => b.tiles.length - a.tiles.length)
  const rest = tiles.value.filter(t => !seen.has(t.id))
  if (rest.length) out.push({id: '__rest', name: t('p_tilesets_id_string.other'), terrain: false, tiles: rest.map(t => ({id: t.id, slug: t.id_string}))})
  return out
})
const terrainCount = computed(() => groups.value.filter((g: any) => g.terrain).length)

// Big groups open on demand: a tileset can hold thousands of tiles, and a
// group shows its first rows until asked for the rest.
const PEEK = 48
const openGroups = ref(new Set<string>())
function toggleGroup(id: string) {
  const s = new Set(openGroups.value)
  s.has(id) ? s.delete(id) : s.add(id)
  openGroups.value = s
}
function shownTiles(g: any) {
  return openGroups.value.has(g.id) ? g.tiles : g.tiles.slice(0, PEEK)
}

// Every tile comes from the tileset's sheet: one PNG for the whole set,
// each tile a window on it. A picture per tile was a request per tile -- a
// big set flooded the server and painted in with holes. Fetched in the
// browser only (the sheet is a blob URL); a tile the sheet lacks, or a set
// with no sheet, falls back to its own lazy picture.
const sheetState = ref<'loading' | 'ready' | 'none'>('loading')
onMounted(async () => {
  const id = data.value?.id_string
  if (!id) return
  const info = await loadSheet(id)
  sheetState.value = info ? 'ready' : 'none'
})
const sheet = computed(() => data.value?.id_string ? sheets.get(data.value.id_string) : null)

const TileThumb = defineComponent({
  props: {id: {type: Number, required: true}, slug: {type: String, required: true}},
  setup(p) {
    return () => {
      if (sheetState.value === 'loading') return h('span', {class: 'tsd-tile-img is-pending'})
      const style = sheetWindowStyle(sheet.value, p.id)
      if (style) return h('span', {class: 'tsd-tile-img', style})
      return h('img', {class: 'tsd-tile-img', src: tileSrc(p.slug), alt: '', loading: 'lazy', decoding: 'async'})
    }
  },
})

// The page shows the tileset in use: the world its owner picked in the
// editor, or the latest one this visitor can see.
const previewId = computed(() => {
  const ids = visibleWorlds.value.map((w: any) => w.id_string)
  return ids.includes(meta.value.preview) ? meta.value.preview : ids[0] || ''
})
const {data: world} = previewId.value
    ? await useAuthFetch<any>(`/coloring/worlds/${previewId.value}/`)
    : {data: ref<any>(null)}
const worldRatio = computed(() => {
  if (!world.value?.meta?.config) return null
  const g = computeGeometry(normalizeTilemap(world.value.meta.config))
  return `${Math.round(g.width)} / ${Math.round(g.height)}`
})
const worldItems = computed(() =>
    Object.entries({...(world.value?.registry || {}), ...(world.value?.meta?.tiles || {})}).map(([id, id_string]) => ({
      id: Number(id), id_string: id_string as string,
    })),
)

const tilesetUrl = `${config.public.siteUrl}/tilesets/${route.params.id_string}`
const seoDesc = `A pixel art tileset with ${tiles.value.length} tiles on SimplePixelArt${data.value?.username ? ` by @${data.value.username}` : ''}. Clone it and paint your own worlds in the free tilemap editor.`
useCustomSeoMeta({
  untranslated: true,
  title: `${title.value} — Pixel Art Tileset`,
  description: seoDesc,
  canonical: tilesetUrl,
  robots: isPublic.value ? 'index, follow' : 'noindex, follow',
  script: isPublic.value ? [{
    type: 'application/ld+json',
    innerHTML: JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'CreativeWork',
      name: title.value,
      description: `A pixel art tileset with ${tiles.value.length} ${tiles.value.length === 1 ? 'tile' : 'tiles'} on SimplePixelArt — free to clone and paint worlds with in the tilemap editor.`,
      url: tilesetUrl,
      genre: 'Pixel art tileset',
      keywords: 'pixel art tileset, auto-tile, wang tiles, terrain tileset, 2d game tileset',
      isAccessibleForFree: true,
      inLanguage: 'en',
      ...(data.value?.updated ? {dateModified: data.value.updated} : {}),
      ...(data.value?.created ? {dateCreated: data.value.created} : {}),
      ...(data.value?.username ? {creator: {'@type': 'Person', name: `@${data.value.username}`, url: `${config.public.siteUrl}/creator/${data.value.username}`}} : {}),
      publisher: {'@type': 'Organization', name: 'SimplePixelArt.com', url: `${config.public.siteUrl}/`},
      ...(tiles.value.length ? {associatedMedia: tiles.value.slice(0, 12).map(t => ({'@type': 'ImageObject', contentUrl: tileSrc(t.id_string), name: t.id_string}))} : {}),
    }),
  }] : [],
})

const shareMeta = computed(() => ({title: title.value, desc: seoDesc}))

const formattedDate = computed(() => {
  const d = data.value?.updated
  if (!d) return null
  try {
    return new Date(d).toLocaleDateString(locale.value, {year: 'numeric', month: 'short', day: 'numeric'})
  } catch {
    return null
  }
})

// Using a tileset is painting with it. A map needs a world on a tileset of
// one's own, so a visitor's map goes on a copy of this one (made for them);
// the owner's opens their latest world, or a first one. Drawing with the
// tiles needs nothing: the pixel editor's art brush reads any public set.
const opening = ref(false)
const loginModal = useLoginModal()

async function cloneForMe(): Promise<string> {
  // Everything the editor reads, minus the preview world: worlds aren't cloned.
  const {preview, ...cloneMeta} = meta.value
  const created = await useNativeFetch<any>('/coloring/tilesets/', {
    method: 'POST',
    body: {name: t('p_tilesets_id_string.copyName', {name: title.value}), meta: cloneMeta},
  })
  track('tileset_clone')
  return created.id_string
}

async function paintMap() {
  if (!auth.isLogged) {
    loginModal.show(paintMap)
    return
  }
  if (opening.value) return
  opening.value = true
  try {
    let worldId = isOwner.value ? (data.value?.worlds || [])[0]?.id_string : ''
    if (!worldId) {
      const tileset = isOwner.value ? data.value.id_string : await cloneForMe()
      const w = await useNativeFetch<any>('/coloring/worlds/', {
        method: 'POST',
        body: {tileset, name: t('p_tilemaps_editor.worldN', {n: 1}), meta: {config: null}},
      })
      worldId = w.id_string
    }
    track('tileset_use', {to: 'tilemap'})
    await navigateTo(localePath(`/tilemaps/editor?world=${worldId}`))
  } catch {
    toast.error(t('p_tilesets_id_string.couldNotClone'))
  } finally {
    opening.value = false
  }
}

// A new canvas four cells by four, so there is room to lay a few tiles
// down at once (a 16x16 default holds not even one 64x32 tile).
function drawWithTiles() {
  const c = meta.value.cell || {}
  const w = Math.min(256, (Number(c.w) || 16) * 4)
  const h = Math.min(256, (Number(c.h || c.w) || 16) * 4)
  track('tileset_use', {to: 'editor'})
  navigateTo(localePath(`/editor?new=true&w=${w}&h=${h}&stamp=${data.value.id_string}`))
}
</script>

<template>
  <div v-if="error || !data" class="page empty-state">
    <span class="empty-state-icon icon icon-grid" aria-hidden="true"/>
    <div class="empty-state-title">{{ $t('p_tilesets_id_string.tilesetNotFound') }}</div>
    <p class="empty-state-body" v-html="$t('p_tilesets_id_string.thisTilesetMayBePrivateOr')"/>
    <NuxtLinkLocale to="/tilesets/editor" class="btn primary empty-state-action">{{ $t('p_tilesets_id_string.buildYourOwn') }}</NuxtLinkLocale>
  </div>

  <ToolLayout v-else :title="data.name || $t('p_tilesets_id_string.untitledTileset')" title-tag="h1">
    <template #head>
      <SocialSharing :meta="shareMeta" position="right"/>
    </template>

    <div class="screen">
      <Widget class="tsd-actions-main">
        <div class="tsd-actions">
          <button type="button" class="btn primary" :disabled="opening" @click="paintMap">
            <span class="icon icon-grid"/>
            <span>{{ opening ? $t('p_tilesets_id_string.opening') : $t('p_tilesets_id_string.paintMap') }}</span>
          </button>
          <button type="button" class="btn" @click="drawWithTiles">
            <span class="icon icon-pen"/>
            <span>{{ $t('p_tilesets_id_string.drawWithTiles') }}</span>
          </button>
          <NuxtLinkLocale v-if="isOwner" :to="`/tilesets/editor?id=${data.id_string}`" class="btn">
            <span class="icon icon-pencil"/>
            <span>{{ $t('common.editTileset') }}</span>
          </NuxtLinkLocale>
        </div>
      </Widget>

      <Widget v-if="world?.meta?.config" class="tsd-preview">
        <div class="tsd-stage" :style="worldRatio ? {'--tsd-ratio': worldRatio} : undefined">
          <ClientOnly>
            <TilemapShowcase flush :config="world.meta.config" :items="worldItems as any"/>
          </ClientOnly>
        </div>
      </Widget>

      <!-- The tiles, once, the way the editor groups them. -->
      <Widget v-for="g in groups" :key="g.id" :title="g.name">
        <template #ctl>
          <span class="tsd-count">
            <span class="icon" :class="g.terrain ? 'icon-rhombus' : 'icon-grid'" aria-hidden="true"/>{{ g.tiles.length }}
          </span>
        </template>
        <div class="tsd-tiles">
          <span v-for="tl in shownTiles(g)" :key="tl.id" class="tsd-tile">
            <TileThumb :id="tl.id" :slug="tl.slug"/>
          </span>
        </div>
        <button v-if="g.tiles.length > PEEK" type="button" class="btn tsd-more" @click="toggleGroup(g.id)">
          <span class="icon" :class="openGroups.has(g.id) ? 'icon-expand-up' : 'icon-expand-down'" aria-hidden="true"/>
          <span>{{ openGroups.has(g.id) ? $t('p_tilesets_id_string.showFewer') : $t('p_tilesets_id_string.showAllN', {n: g.tiles.length}) }}</span>
        </button>
      </Widget>
    </div>

    <template #status>
      <p class="editor-foot-hint text-xs text-muted">
        <template v-if="world?.meta?.config">
          <NuxtLinkLocale :to="`/worlds/${world.id_string}`">{{ world.name || $t('common.untitled') }}</NuxtLinkLocale> ·
        </template>
        {{ $t('p_tilesets_id_string.tileCount', {count: tiles.length}, tiles.length) }} · {{ $t('p_tilesets_id_string.groupCount', {count: groups.length}, groups.length) }}
      </p>
      <p v-if="formattedDate" class="text-xs text-muted">{{ formattedDate }}</p>
    </template>

    <template #aside>
      <Widget class="tsd-actions-rail">
        <div class="tsd-actions">
          <button type="button" class="btn primary" :disabled="opening" @click="paintMap">
            <span class="icon icon-grid"/>
            <span>{{ opening ? $t('p_tilesets_id_string.opening') : $t('p_tilesets_id_string.paintMap') }}</span>
          </button>
          <button type="button" class="btn" @click="drawWithTiles">
            <span class="icon icon-pen"/>
            <span>{{ $t('p_tilesets_id_string.drawWithTiles') }}</span>
          </button>
          <NuxtLinkLocale v-if="isOwner" :to="`/tilesets/editor?id=${data.id_string}`" class="btn">
            <span class="icon icon-pencil"/>
            <span>{{ $t('common.editTileset') }}</span>
          </NuxtLinkLocale>
        </div>
      </Widget>

      <Widget :title="$t('p_art_id_string.meta')">
        <dl class="art-meta-side">
          <div v-if="data.username" class="art-meta-row">
            <dt>{{ $t('p_art_id_string.creator') }}</dt>
            <dd><NuxtLinkLocale :to="`/creator/${data.username}`" class="art-meta-link">@{{ data.username }}</NuxtLinkLocale></dd>
          </div>
          <div class="art-meta-row">
            <dt>{{ $t('common.tiles') }}</dt>
            <dd>{{ tiles.length }}</dd>
          </div>
          <div v-if="terrainCount" class="art-meta-row">
            <dt>{{ $t('p_tilesets_id_string.terrains') }}</dt>
            <dd>{{ terrainCount }}</dd>
          </div>
          <div v-if="meta.cell" class="art-meta-row">
            <dt>{{ $t('common.cellSize') }}</dt>
            <dd>{{ meta.cell.w }}×{{ meta.cell.h || meta.cell.w }}px</dd>
          </div>
          <div class="art-meta-row">
            <dt>{{ $t('p_tilesets_editor.tileShape') }}</dt>
            <dd>{{ meta.iso ? $t('common.isometric') : $t('common.grid') }}</dd>
          </div>
          <div v-if="!isPublic" class="art-meta-row">
            <dt>{{ $t('p_tilesets_editor.visibility') }}</dt>
            <dd>{{ $t('common.private') }}</dd>
          </div>
          <div v-if="formattedDate" class="art-meta-row">
            <dt>{{ $t('p_art_id_string.updated') }}</dt>
            <dd>{{ formattedDate }}</dd>
          </div>
        </dl>
      </Widget>

      <Widget v-if="visibleWorlds.length" :title="$t('p_tilesets_id_string.worldsBuiltWithThisTileset')">
        <ul class="tsd-worlds">
          <li v-for="w in visibleWorlds" :key="w.id_string">
            <NuxtLinkLocale :to="`/worlds/${w.id_string}`" class="art-meta-link">{{ w.name || $t('common.untitled') }}</NuxtLinkLocale>
            <span v-if="w.id_string === previewId" class="text-muted">{{ $t('p_tilesets_id_string.shownAbove') }}</span>
            <span v-else-if="w.status !== 'public'" class="text-muted">{{ $t('common.private') }}</span>
          </li>
        </ul>
      </Widget>
    </template>
  </ToolLayout>
</template>

<style scoped>
/* The world it was painted into, at that world's shape. */
.tsd-preview :deep(.widget-body) {
  padding: 0;
}

/* The whole column wide, as tall as the map's shape asks up to most of the
   screen; the map then fits inside it. Left to its aspect ratio alone, a
   capped height narrowed the stage too and left bare strips either side. */
.tsd-stage {
  position: relative;
  width: 100%;
  aspect-ratio: var(--tsd-ratio, 16 / 9);
  max-height: 70vh;
  overflow: hidden;
}

.tsd-count {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  font-size: var(--text-2xs);
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}

.tsd-count .icon {
  width: var(--icon-sm);
  height: var(--icon-sm);
}

/* One square box per tile, the tile centred in it at its own shape: an
   iso set's walls are taller than its floors, so a box in the cell's shape
   cut them down to slivers. */
.tsd-tiles {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(calc(var(--space-6) * 4), 1fr));
  gap: var(--space-1);
}

.tsd-tile {
  display: flex;
  align-items: center;
  justify-content: center;
  aspect-ratio: 1;
  padding: var(--space-1);
  overflow: hidden;
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  content-visibility: auto;
  contain-intrinsic-size: auto calc(var(--space-6) * 4);
}

.tsd-tile-img {
  display: block;
  max-width: 100%;
  max-height: 100%;
  image-rendering: pixelated;
  object-fit: contain;
}

img.tsd-tile-img {
  width: 100%;
  height: 100%;
}

.tsd-tile-img.is-pending {
  width: 100%;
  height: 100%;
}

.tsd-more {
  width: 100%;
  justify-content: center;
  margin-top: var(--space-2);
}

.tsd-actions {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.tsd-actions .btn {
  justify-content: center;
}

/* The Paint / Draw buttons live in the rail; stacked (below 1280) the rail
   falls under every tile, so the main column carries its own copy on top
   and the rail's is hidden. */
.tsd-actions-main {
  display: none;
}

/* Hidden, it is still the screen's first child: the widget after it took
   the rule a screen draws between widgets, doubling the head's own line. */
.screen > .tsd-actions-main + .widget {
  border-top: 0;
}

@media (max-width: 1279px) {
  .tsd-actions-main {
    display: block;
  }

  .screen > .tsd-actions-main + .widget {
    border-top: 1px solid var(--border);
  }

  .tsd-actions-rail {
    display: none;
  }
}

.tsd-worlds {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: var(--text-xs);
}

.tsd-worlds li {
  display: flex;
  justify-content: space-between;
  gap: var(--space-2);
}

.tsd-worlds .text-muted {
  font-size: var(--text-2xs);
}
</style>
