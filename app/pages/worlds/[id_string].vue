<script setup lang="ts">
import TilemapShowcase from '~/components/tilemap/TilemapShowcase.vue'

const route = useRoute()
const config = useRuntimeConfig()
const auth = useAuthStore()

const {data, error} = await useAuthFetch<any>(`/coloring/worlds/${route.params.id_string}/`)

// Private or missing worlds 404 for crawlers, not soft-200.
if (error.value && import.meta.server) {
  setResponseStatus(useRequestEvent()!, 404)
}

const title = computed(() => data.value?.name || 'Untitled world')
const isPublic = computed(() => data.value?.status === 'public')
const isOwner = computed(() =>
    !!auth.logged?.username && data.value?.username === auth.logged.username,
)
const sceneConfig = computed(() => data.value?.meta?.config || null)

// Tile id → art id_string is all the showcase needs to resolve images:
// the tileset registry plus the world's own extra tiles (meta.tiles).
const tileItems = computed(() =>
    Object.entries({...(data.value?.registry || {}), ...(data.value?.meta?.tiles || {})}).map(([id, id_string]) => ({
      id: Number(id), id_string: id_string as string,
    })),
)

const canonicalUrl = computed(() => `${config.public.siteUrl}/worlds/${route.params.id_string}`)

useCustomSeoMeta({
  title: `${title.value} — Pixel Art World`,
  description: `A pixel art world built tile by tile on SimplePixelArt${data.value?.username ? ` by @${data.value.username}` : ''}. Explore the map or build your own in the free world editor.`,
  canonical: canonicalUrl.value,
  robots: isPublic.value ? 'index, follow' : 'noindex, follow',
})

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
  <div class="page">
    <div v-if="error || !data" class="empty-state">
      <span class="empty-state-icon icon icon-grid" aria-hidden="true"/>
      <div class="empty-state-title">World not found</div>
      <p class="empty-state-body">This world may be private or no longer exists.</p>
      <nuxt-link to="/tilemaps/editor" class="btn primary empty-state-action">Open the world editor</nuxt-link>
    </div>

    <template v-else>
      <section class="wd-hero">
        <div class="wd-head">
          <span class="wd-eyebrow">World</span>
          <h1 class="page-title">{{ title }}</h1>
          <div class="wd-meta">
            <span v-if="data.username" class="wd-pill">by @{{ data.username }}</span>
            <span v-if="formattedDate" class="wd-pill">Updated {{ formattedDate }}</span>
            <span v-if="!isPublic" class="wd-pill wd-pill-private">Private</span>
          </div>
        </div>
        <div class="wd-actions">
          <nuxt-link v-if="isOwner" :to="`/tilemaps/editor?world=${data.id_string}`" class="btn primary">
            <span class="icon icon-pen"/>
            <span>Edit world</span>
          </nuxt-link>
          <nuxt-link v-if="data.tileset_id_string" :to="`/tilesets/${data.tileset_id_string}`" class="btn">
            <span class="icon icon-grid"/>
            <span>Tileset</span>
          </nuxt-link>
        </div>
      </section>

      <ClientOnly>
        <TilemapShowcase v-if="sceneConfig" :config="sceneConfig" :items="tileItems as any"/>
        <template #fallback>
          <div class="wd-ph">Rendering world…</div>
        </template>
      </ClientOnly>

      <nav class="wd-more" aria-label="Explore more">
        <nuxt-link to="/tilemaps/editor" class="btn">
          <span class="icon icon-grid"/>
          <span>Build your own world</span>
        </nuxt-link>
        <nuxt-link to="/arts" class="btn">
          <span class="icon icon-search"/>
          <span>Browse pixel art</span>
        </nuxt-link>
      </nav>
    </template>
  </div>
</template>

<style scoped>
.wd-hero {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-5);
  flex-wrap: wrap;
}

.wd-head {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  min-width: 0;
}

.wd-eyebrow {
  font-size: var(--text-2xs);
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--primary);
}

.wd-meta {
  display: flex;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.wd-pill {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: 2px var(--space-3);
  font-size: var(--text-2xs);
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--muted);
  border: 1px solid var(--border);
}

.wd-pill-private {
  background: color-mix(in oklab, var(--primary) 14%, var(--surface));
  color: var(--primary);
  border-color: color-mix(in oklab, var(--primary) 40%, transparent);
}

.wd-actions {
  display: flex;
  gap: var(--space-3);
  align-items: center;
  flex-shrink: 0;
}

.wd-ph {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 240px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--muted);
  font-size: var(--text-sm);
}

.wd-more {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  justify-content: center;
  margin-top: var(--space-6);
  padding-top: var(--space-6);
  border-top: 1px solid color-mix(in oklab, var(--border) 60%, transparent);
}
</style>
