<script setup lang="ts">
import {toast} from 'vue-sonner'
import {tileImageUrl} from '~/helper/tilemap'

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

const tiles = computed(() =>
    Object.entries(data.value?.meta?.registry || {}).map(([id, id_string]) => ({
      id: Number(id), id_string: id_string as string,
    })),
)
const publicWorlds = computed(() =>
    (data.value?.worlds || []).filter((w: any) => isOwner.value || w.status === 'public'),
)

function tileSrc(idString: string) {
  return tileImageUrl(apiBase, idString)
}

const tilesetUrl = `${config.public.siteUrl}/tilesets/${route.params.id_string}`
useCustomSeoMeta({
  title: `${title.value} — Pixel Art Tileset`,
  description: `A pixel art tileset with ${tiles.value.length} tiles on SimplePixelArt${data.value?.username ? ` by @${data.value.username}` : ''}. Clone it and paint your own worlds in the free tilemap editor.`,
  canonical: tilesetUrl,
  robots: isPublic.value ? 'index, follow' : 'noindex, follow',
  // Structured data only for public tilesets (private ones are noindex anyway).
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

// Non-owners clone the tileset into their own account, then edit the copy.
const cloning = ref(false)
async function cloneTileset() {
  if (!auth.isLogged) {
    toast.error('Sign in to clone tilesets')
    return
  }
  cloning.value = true
  try {
    const t = await useNativeFetch<any>('/coloring/tilesets/', {
      method: 'POST',
      body: {
        name: `${title.value} (copy)`,
        meta: {registry: data.value?.meta?.registry || {}},
      },
    })
    navigateTo(`/tilesets/editor?id=${t.id_string}`)
  } catch {
    toast.error('Could not clone tileset')
  } finally {
    cloning.value = false
  }
}
</script>

<template>
  <div class="page">
    <div v-if="error || !data" class="empty-state">
      <span class="empty-state-icon icon icon-grid" aria-hidden="true"/>
      <div class="empty-state-title">Tileset not found</div>
      <p class="empty-state-body">This tileset may be private or no longer exists.</p>
      <nuxt-link to="/tilesets/editor" class="btn primary empty-state-action">Build your own</nuxt-link>
    </div>

    <template v-else>
      <section class="tsd-hero">
        <div class="tsd-head">
          <span class="tsd-eyebrow">Tileset</span>
          <h1 class="page-title">{{ title }}</h1>
          <div class="tsd-meta">
            <span class="tsd-pill">{{ tiles.length }} {{ tiles.length === 1 ? 'tile' : 'tiles' }}</span>
            <span v-if="data.username" class="tsd-pill">by @{{ data.username }}</span>
            <span v-if="!isPublic" class="tsd-pill tsd-pill-private">Private</span>
          </div>
        </div>
        <div class="tsd-actions">
          <nuxt-link v-if="isOwner" :to="`/tilesets/editor?id=${data.id_string}`" class="btn primary">
            <span class="icon icon-pen"/>
            <span>Edit tileset</span>
          </nuxt-link>
          <button v-else class="btn primary" :disabled="cloning" @click="cloneTileset">
            <span class="icon icon-plus"/>
            <span>{{ cloning ? 'Cloning…' : 'Use this tileset' }}</span>
          </button>
        </div>
      </section>

      <section v-if="tiles.length" class="tsd-tiles" aria-label="Tiles">
        <nuxt-link
            v-for="t in tiles"
            :key="t.id"
            :to="`/art/${t.id_string}`"
            class="tsd-tile"
            :title="t.id_string"
        >
          <img :src="tileSrc(t.id_string)" :alt="t.id_string" loading="lazy">
        </nuxt-link>
      </section>

      <section v-if="publicWorlds.length" class="tsd-worlds" aria-label="Worlds using this tileset">
        <span class="tsd-label">Worlds built with this tileset</span>
        <div class="tsd-world-chips">
          <nuxt-link
              v-for="w in publicWorlds"
              :key="w.id_string"
              :to="`/worlds/${w.id_string}`"
              class="tsd-world-chip"
          >{{ w.name || 'Untitled' }}</nuxt-link>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.tsd-hero {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-5);
  flex-wrap: wrap;
}

.tsd-head {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  min-width: 0;
}

.tsd-eyebrow {
  font-size: var(--text-2xs);
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--primary);
}

.tsd-meta {
  display: flex;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.tsd-pill {
  display: inline-flex;
  align-items: center;
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

.tsd-pill-private {
  background: color-mix(in oklab, var(--primary) 14%, var(--surface));
  color: var(--primary);
  border-color: color-mix(in oklab, var(--primary) 40%, transparent);
}

.tsd-actions {
  display: flex;
  gap: var(--space-3);
  flex-shrink: 0;
}

.tsd-tiles {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(72px, 1fr));
  gap: var(--space-2);
}

.tsd-tile {
  aspect-ratio: 1;
  padding: var(--space-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background:
      repeating-conic-gradient(var(--surface-2) 0 25%, transparent 0 50%)
      0 0 / 12px 12px;
  transition: border-color var(--transition);
}

.tsd-tile img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  image-rendering: pixelated;
}

.tsd-worlds {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.tsd-label {
  font-size: var(--text-2xs);
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--muted);
}

.tsd-world-chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.tsd-world-chip {
  padding: 5px 12px;
  background: color-mix(in oklab, var(--surface-2) 60%, transparent);
  border: 1px solid color-mix(in oklab, var(--border) 70%, transparent);
  border-radius: var(--radius-sm);
  color: var(--foreground);
  font-size: var(--text-xs);
  font-weight: 600;
  transition: border-color var(--transition);
}

</style>
