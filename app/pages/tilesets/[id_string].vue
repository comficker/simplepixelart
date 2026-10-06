<script setup lang="ts">
const localePath = useLocalePath()
import {toast} from 'vue-sonner'
import TilemapShowcase from '~/components/tilemap/TilemapShowcase.vue'
import {normalizeTilemap, computeGeometry, tileImageUrl} from '~/helper/tilemap'

const route = useRoute()
const config = useRuntimeConfig()
const auth = useAuthStore()
const apiBase = config.public.api as string

const {data, error} = await useAuthFetch<any>(`/coloring/tilesets/${route.params.id_string}/`)

if (error.value && import.meta.server) {
  setResponseStatus(useRequestEvent()!, 404)
}

const title = computed(() => data.value?.name || 'Untitled tileset')
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
      name: String(g?.name || (terrain ? 'Terrain' : 'Group')),
      terrain,
      tiles: unique.map(id => ({id, src: tileSrc(reg[String(id)]!)})),
    }
  }).filter((g: any) => g.tiles.length)
  const rest = tiles.value.filter(t => !seen.has(t.id))
  if (rest.length) out.push({id: '__rest', name: 'Other', terrain: false, tiles: rest.map(t => ({id: t.id, src: tileSrc(t.id_string)}))})
  return out
})
const terrainCount = computed(() => groups.value.filter((g: any) => g.terrain).length)

// Big groups open on demand: a tileset can hold thousands of tiles.
const PEEK = 12
const openGroups = ref(new Set<string>())
function toggleGroup(id: string) {
  const s = new Set(openGroups.value)
  s.has(id) ? s.delete(id) : s.add(id)
  openGroups.value = s
}

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
    return new Date(d).toLocaleDateString('en-US', {year: 'numeric', month: 'short', day: 'numeric'})
  } catch {
    return null
  }
})

const cloning = ref(false)
const loginModal = useLoginModal()
async function cloneTileset() {
  if (!auth.isLogged) {
    loginModal.show(cloneTileset)
    return
  }
  if (cloning.value) return
  cloning.value = true
  // Everything the editor reads, minus the preview world — worlds aren't cloned.
  const {preview, ...cloneMeta} = meta.value
  try {
    const t = await useNativeFetch<any>('/coloring/tilesets/', {
      method: 'POST',
      body: {
        name: `${title.value} (copy)`,
        meta: cloneMeta,
      },
    })
    navigateTo(localePath(`/tilesets/editor?id=${t.id_string}`))
  } catch {
    toast.error('Could not clone tileset')
  } finally {
    cloning.value = false
  }
}
</script>

<template>
  <div v-if="error || !data" class="page empty-state">
    <span class="empty-state-icon icon icon-grid" aria-hidden="true"/>
    <div class="empty-state-title">{{ $t('p_tilesets_id_string.tilesetNotFound') }}</div>
    <p class="empty-state-body" v-html="$t('p_tilesets_id_string.thisTilesetMayBePrivateOr')"/>
    <NuxtLinkLocale to="/tilesets/editor" class="btn primary empty-state-action">{{ $t('p_tilesets_id_string.buildYourOwn') }}</NuxtLinkLocale>
  </div>

  <ToolLayout v-else :title="title" title-tag="h1">
    <template #head>
      <SocialSharing :meta="shareMeta" position="right"/>
    </template>

    <div class="flat-editor art-editor">
      <div class="tm-stage art-stage tsd-stage" :class="{'is-world': worldRatio}" :style="worldRatio ? {'--tsd-ratio': worldRatio} : undefined">
        <ClientOnly v-if="world?.meta?.config">
          <TilemapShowcase flush :config="world.meta.config" :items="worldItems as any"/>
        </ClientOnly>
        <div v-else class="tsd-sheet">
          <img v-for="t in tiles.slice(0, 120)" :key="t.id" :src="tileSrc(t.id_string)" :alt="t.id_string" loading="lazy">
        </div>
      </div>
    </div>

    <template #status>
      <p class="editor-foot-hint text-xs text-muted">
        <template v-if="world?.meta?.config">
          <NuxtLinkLocale :to="`/worlds/${world.id_string}`">{{ world.name || 'Untitled' }}</NuxtLinkLocale> ·
        </template>
        {{ tiles.length }} tiles · {{ groups.length }} groups
      </p>
      <p v-if="formattedDate" class="text-xs text-muted">{{ formattedDate }}</p>
    </template>

    <template #aside>
      <Widget>
        <div class="art-actions">
          <NuxtLinkLocale v-if="isOwner" :to="`/tilesets/editor?id=${data.id_string}`" class="btn primary">
            <span class="icon icon-pen"/>
            <span>{{ $t('common.editTileset') }}</span>
          </NuxtLinkLocale>
          <button v-else type="button" class="btn primary" :disabled="cloning" @click="cloneTileset">
            <span class="icon icon-plus"/>
            <span>{{ cloning ? 'Cloning…' : 'Use this tileset' }}</span>
          </button>
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

      <Widget v-if="groups.length" :title="$t('p_tilesets_id_string.groups')">
        <div class="tsd-groups">
          <section v-for="g in groups" :key="g.id" class="tsd-group">
            <button
                type="button"
                class="tsd-group-head"
                :aria-expanded="openGroups.has(g.id)"
                :disabled="g.tiles.length <= PEEK"
                @click="toggleGroup(g.id)"
            >
              <span class="icon" :class="g.terrain ? 'icon-rhombus' : 'icon-grid'" aria-hidden="true"/>
              <span class="tsd-group-name">{{ g.name }}</span>
              <span class="text-muted">{{ g.tiles.length }}</span>
              <span v-if="g.tiles.length > PEEK" class="icon" :class="openGroups.has(g.id) ? 'icon-expand-up' : 'icon-expand-down'" aria-hidden="true"/>
            </button>
            <div class="tsd-tiles">
              <img
                  v-for="t in openGroups.has(g.id) ? g.tiles : g.tiles.slice(0, PEEK)"
                  :key="t.id"
                  :src="t.src"
                  alt=""
                  loading="lazy"
                  class="tsd-tile"
              >
            </div>
          </section>
        </div>
      </Widget>

      <Widget v-if="visibleWorlds.length" :title="$t('p_tilesets_id_string.worldsBuiltWithThisTileset')">
        <ul class="tsd-worlds">
          <li v-for="w in visibleWorlds" :key="w.id_string">
            <NuxtLinkLocale :to="`/worlds/${w.id_string}`" class="art-meta-link">{{ w.name || 'Untitled' }}</NuxtLinkLocale>
            <span v-if="w.id_string === previewId" class="text-muted">{{ $t('p_tilesets_id_string.shownAbove') }}</span>
            <span v-else-if="w.status !== 'public'" class="text-muted">{{ $t('common.private') }}</span>
          </li>
        </ul>
      </Widget>
    </template>
  </ToolLayout>
</template>

<style scoped>
.tsd-stage.is-world {
  padding: 0;
}

@media (max-width: 767px) {
  .tsd-stage.is-world { aspect-ratio: var(--tsd-ratio); }
}

.tsd-sheet {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(calc(var(--space-6) * 2), 1fr));
  gap: var(--space-2);
  align-self: flex-start;
  width: 100%;
}

.tsd-sheet img {
  width: 100%;
  aspect-ratio: 1;
  object-fit: contain;
  image-rendering: pixelated;
}

.tsd-groups {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.tsd-group-head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  margin-bottom: var(--space-1);
  padding: 0;
  font-size: var(--text-xs);
  text-align: left;
  color: var(--foreground);
  background: transparent;
  border: 0;
  cursor: pointer;
}

.tsd-group-head:disabled {
  cursor: default;
}

.tsd-group-head .icon {
  color: var(--muted);
}

.tsd-group-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
}

.tsd-group-head .text-muted {
  font-size: var(--text-2xs);
  font-variant-numeric: tabular-nums;
}

.tsd-tiles {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: var(--space-1);
}

.tsd-tile {
  width: 100%;
  aspect-ratio: 1;
  object-fit: contain;
  image-rendering: pixelated;
  background: var(--surface-2);
  border-radius: var(--radius-sm);
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
