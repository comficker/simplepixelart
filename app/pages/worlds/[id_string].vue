<script setup lang="ts">
import TilemapShowcase from '~/components/tilemap/TilemapShowcase.vue'
import {normalizeTilemap, computeGeometry, tileImageUrl, tileOf} from '~/helper/tilemap'
import {downloadBlob} from '~/helper/utils'

const route = useRoute()
const config = useRuntimeConfig()
const auth = useAuthStore()

const {data, error} = await useAuthFetch<any>(`/coloring/worlds/${route.params.id_string}/`)

if (error.value && import.meta.server) {
  setResponseStatus(useRequestEvent()!, 404)
}

const title = computed(() => data.value?.name || 'Untitled world')
const isPublic = computed(() => data.value?.status === 'public')
const isOwner = computed(() =>
    !!auth.logged?.username && data.value?.username === auth.logged.username,
)
const scene = computed(() => data.value?.meta?.config ? normalizeTilemap(data.value.meta.config) : null)

const tileItems = computed(() =>
    Object.entries({...(data.value?.registry || {}), ...(data.value?.meta?.tiles || {})}).map(([id, id_string]) => ({
      id: Number(id), id_string: id_string as string,
    })),
)

// Hiding a layer here only changes this view, never the world.
const hidden = ref(new Set<string>())
function toggleLayer(id: string) {
  const s = new Set(hidden.value)
  s.has(id) ? s.delete(id) : s.add(id)
  hidden.value = s
}
const shownConfig = computed(() => scene.value && {
  ...scene.value,
  layers: scene.value.layers.map(l => hidden.value.has(l.id) ? {...l, visible: false} : l),
})

const layers = computed(() => [...(scene.value?.layers || [])].reverse().map(l => ({
  id: l.id,
  name: l.name,
  icon: l.kind === 'object' ? 'icon-flag' : l.kind === 'sprite' ? 'icon-rhombus' : 'icon-grid',
  count: l.kind === 'object' ? (l.objects || []).length : Object.keys(l.cells).length,
})))
const tileCount = computed(() => (scene.value?.layers || [])
    .filter(l => l.kind !== 'object').reduce((n, l) => n + Object.keys(l.cells).length, 0))
const objectCount = computed(() => (scene.value?.layers || [])
    .reduce((n, l) => n + (l.kind === 'object' ? (l.objects || []).length : 0), 0))

// The tiles this world actually uses, most used first.
const usedTiles = computed(() => {
  const n = new Map<number, number>()
  for (const l of scene.value?.layers || []) {
    if (l.kind === 'object') continue
    for (const v of Object.values(l.cells)) n.set(tileOf(v as number), (n.get(tileOf(v as number)) || 0) + 1)
  }
  const slug = new Map(tileItems.value.map(t => [t.id, t.id_string]))
  return [...n.entries()].sort((a, b) => b[1] - a[1])
      .filter(([id]) => slug.has(id)).slice(0, 18)
      .map(([id]) => ({id, src: tileImageUrl(config.public.api as string, slug.get(id)!)}))
})

const showcase = ref<InstanceType<typeof TilemapShowcase> | null>(null)
const pngScales = [1, 2, 4]
const dlScale = ref<number | null>(null)
const mapPx = computed(() => {
  if (!scene.value) return {w: 0, h: 0}
  const g = computeGeometry(scene.value)
  return {w: Math.round(g.width), h: Math.round(g.height)}
})
async function downloadPng(scale: number) {
  if (!showcase.value || dlScale.value !== null) return
  dlScale.value = scale
  try {
    const blob = await showcase.value.toPng(scale)
    if (!blob) return
    downloadBlob(blob, `${data.value?.id_string || 'world'}${scale > 1 ? `@${scale}x` : ''}.png`)
  } finally {
    dlScale.value = null
  }
}

const canonicalUrl = computed(() => `${config.public.siteUrl}/worlds/${route.params.id_string}`)
const seoDesc = `A pixel art world built tile by tile on SimplePixelArt${data.value?.username ? ` by @${data.value.username}` : ''}. Explore the map or build your own in the free world editor.`

useCustomSeoMeta({
  untranslated: true,
  title: `${title.value} — Pixel Art World`,
  description: seoDesc,
  canonical: canonicalUrl.value,
  robots: isPublic.value ? 'index, follow' : 'noindex, follow',
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
</script>

<template>
  <div v-if="error || !data" class="page empty-state">
    <span class="empty-state-icon icon icon-grid" aria-hidden="true"/>
    <div class="empty-state-title">{{ $t('p_worlds_id_string.worldNotFound') }}</div>
    <p class="empty-state-body" v-html="$t('p_worlds_id_string.thisWorldMayBePrivateOr')"/>
    <NuxtLinkLocale to="/tilemaps/editor" class="btn primary empty-state-action">{{ $t('p_worlds_id_string.openTheWorldEditor') }}</NuxtLinkLocale>
  </div>

  <ToolLayout v-else :title="title" title-tag="h1">
    <template #head>
      <SocialSharing :meta="shareMeta" position="right"/>
    </template>

    <div class="flat-editor art-editor">
      <div class="tm-stage art-stage wd-stage" :style="{'--wd-ratio': `${mapPx.w} / ${mapPx.h}`}">
        <ClientOnly>
          <TilemapShowcase v-if="shownConfig" ref="showcase" flush :config="shownConfig" :items="tileItems as any"/>
          <template #fallback>
            <p class="wd-ph">{{ $t('p_worlds_id_string.renderingWorld') }}</p>
          </template>
        </ClientOnly>
      </div>
    </div>

    <template #status>
      <p v-if="scene" class="editor-foot-hint text-xs text-muted">
        {{ scene.cols }}×{{ scene.rows }} · {{ scene.cellW }}×{{ scene.cellH }}px cells · {{ tileCount }} tiles
      </p>
      <p v-if="formattedDate" class="text-xs text-muted">{{ formattedDate }}</p>
    </template>

    <template #aside>
      <Widget>
        <div class="art-actions">
          <NuxtLinkLocale v-if="isOwner" :to="`/tilemaps/editor?world=${data.id_string}`" class="btn primary">
            <span class="icon icon-pen"/>
            <span>{{ $t('p_worlds_id_string.editWorld') }}</span>
          </NuxtLinkLocale>
          <NuxtLinkLocale v-else to="/tilemaps/editor" class="btn">
            <span class="icon icon-grid"/>
            <span>{{ $t('p_worlds_id_string.buildYourOwnWorld') }}</span>
          </NuxtLinkLocale>
        </div>
      </Widget>

      <Widget v-if="scene" :title="$t('common.download')">
        <div class="wd-dl">
          <button
              v-for="s in pngScales"
              :key="s"
              type="button"
              class="wd-dl-item"
              :disabled="dlScale !== null"
              @click="downloadPng(s)"
          >
            <span>PNG · {{ s }}×</span>
            <span class="text-muted">{{ dlScale === s ? '…' : `${mapPx.w * s}×${mapPx.h * s}` }}</span>
          </button>
        </div>
        <p v-if="isOwner" class="wd-note">{{ $t('p_worlds_id_string.gameExportHint') }}</p>
      </Widget>

      <Widget :title="$t('p_art_id_string.meta')">
        <dl class="art-meta-side">
          <div v-if="data.username" class="art-meta-row">
            <dt>{{ $t('p_art_id_string.creator') }}</dt>
            <dd><NuxtLinkLocale :to="`/creator/${data.username}`" class="art-meta-link">@{{ data.username }}</NuxtLinkLocale></dd>
          </div>
          <div v-if="data.tileset_id_string" class="art-meta-row">
            <dt>{{ $t('common.tileset') }}</dt>
            <dd><NuxtLinkLocale :to="`/tilesets/${data.tileset_id_string}`" class="art-meta-link">{{ data.tileset_name || data.tileset_id_string }}</NuxtLinkLocale></dd>
          </div>
          <div v-if="scene" class="art-meta-row">
            <dt>{{ $t('common.size') }}</dt>
            <dd>{{ scene.cols }}×{{ scene.rows }}</dd>
          </div>
          <div v-if="scene" class="art-meta-row">
            <dt>{{ $t('common.cellSize') }}</dt>
            <dd>{{ scene.cellW }}×{{ scene.cellH }}px</dd>
          </div>
          <div class="art-meta-row">
            <dt>{{ $t('common.tiles') }}</dt>
            <dd>{{ tileCount }}</dd>
          </div>
          <div v-if="objectCount" class="art-meta-row">
            <dt>{{ $t('p_tilemaps_editor.objects') }}</dt>
            <dd>{{ objectCount }}</dd>
          </div>
          <div v-if="!isPublic" class="art-meta-row">
            <dt>{{ $t('p_worlds_id_string.visibility') }}</dt>
            <dd>{{ $t('common.private') }}</dd>
          </div>
          <div v-if="formattedDate" class="art-meta-row">
            <dt>{{ $t('p_art_id_string.updated') }}</dt>
            <dd>{{ formattedDate }}</dd>
          </div>
        </dl>
      </Widget>

      <Widget v-if="layers.length > 1" :title="$t('common.layers')">
        <ul class="wd-layers">
          <li v-for="l in layers" :key="l.id" class="wd-layer" :class="{'is-hidden': hidden.has(l.id)}">
            <button
                type="button"
                class="widget-ctl-btn"
                :title="hidden.has(l.id) ? $t('p_tilemaps_editor.showLayer') : $t('p_tilemaps_editor.hideLayer')"
                :aria-pressed="!hidden.has(l.id)"
                @click="toggleLayer(l.id)"
            >
              <span class="icon" :class="hidden.has(l.id) ? 'icon-eye-cross' : 'icon-eye'"/>
            </button>
            <span class="icon wd-layer-kind" :class="l.icon" aria-hidden="true"/>
            <span class="wd-layer-name">{{ l.name }}</span>
            <span class="text-muted">{{ l.count }}</span>
          </li>
        </ul>
      </Widget>

      <Widget v-if="usedTiles.length" :title="$t('common.tiles')">
        <template v-if="data.tileset_id_string" #ctl>
          <NuxtLinkLocale :to="`/tilesets/${data.tileset_id_string}`" class="widget-ctl-btn">
            <span class="widget-ctl-name">{{ $t('common.tileset') }}</span><span class="icon icon-angle-right"/>
          </NuxtLinkLocale>
        </template>
        <div class="wd-tiles">
          <img v-for="t in usedTiles" :key="t.id" :src="t.src" alt="" loading="lazy" class="wd-tile">
        </div>
      </Widget>
    </template>
  </ToolLayout>
</template>

<style scoped>
.wd-stage {
  padding: 0;
}

@media (max-width: 767px) {
  .wd-stage { aspect-ratio: var(--wd-ratio, 1); }
}

.wd-ph {
  margin: auto;
  color: var(--muted);
  font-size: var(--text-sm);
}

.wd-dl {
  display: flex;
  flex-direction: column;
}

.wd-dl-item {
  display: flex;
  justify-content: space-between;
  gap: var(--space-2);
  padding: var(--space-1) 0;
  font-size: var(--text-xs);
  text-align: left;
  background: transparent;
  border: 0;
  cursor: pointer;
}

.wd-dl-item .text-muted {
  font-size: var(--text-2xs);
  font-variant-numeric: tabular-nums;
}

@media (hover: hover) and (pointer: fine) {
  .wd-dl-item:not(:disabled):hover { color: var(--primary); }
}

.wd-note {
  margin-top: var(--space-2);
  color: var(--muted);
  font-size: var(--text-2xs);
}

.wd-layers {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
}

.wd-layer {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-xs);
}

.wd-layer.is-hidden .wd-layer-name,
.wd-layer.is-hidden .wd-layer-kind {
  opacity: 0.45;
}

.wd-layer-kind {
  color: var(--muted);
}

.wd-layer-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.wd-layer .text-muted {
  font-size: var(--text-2xs);
  font-variant-numeric: tabular-nums;
}

.wd-tiles {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: var(--space-1);
}

.wd-tile {
  width: 100%;
  aspect-ratio: 1;
  object-fit: contain;
  image-rendering: pixelated;
  background: var(--surface-2);
  border-radius: var(--radius-sm);
}
</style>
