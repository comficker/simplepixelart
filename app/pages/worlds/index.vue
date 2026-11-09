<script setup lang="ts">
// Public tilemaps (worlds), the way /tilesets lists tilesets: one card each,
// its picture drawn by the server (/worlds/<slug>/thumb/), so a page of maps
// is a page of images and not every tile of every map. The breadcrumb under
// /worlds/<slug> leads here.
import type {APIResponse} from '~/types'

const {t} = useI18n()
const route = useRoute()
const config = useRuntimeConfig()
const apiBase = config.public.api as string

interface WorldCard {
  id: number
  id_string: string
  name?: string
  username?: string
  tileset_name?: string
  updated?: string
  size?: { mode: 'grid' | 'iso', cols?: number, rows?: number }
}

const currentPage = computed(() => route.query.page ? Number.parseInt(route.query.page.toString()) : 1)

const {data} = await useAuthFetch<APIResponse<WorldCard>>('/coloring/worlds/', {
  query: computed(() => ({public: 1, page: currentPage.value, page_size: 24})),
  key: computed(() => `worlds|${currentPage.value}`),
})

const worlds = computed(() => data.value?.results || [])
const {page, prevTo, nextTo} = usePageLinks(data)

// The updated time busts the picture's cache when the map changes.
const thumbOf = (w: WorldCard) => `${apiBase}/coloring/worlds/${w.id_string}/thumb/${w.updated ? `?v=${encodeURIComponent(w.updated)}` : ''}`

const canonicalUrl = computed(() => {
  const base = 'https://simplepixelart.com/worlds'
  return currentPage.value > 1 ? `${base}?page=${currentPage.value}` : base
})

useCustomSeoMeta({
  title: computed(() => currentPage.value > 1 ? `${t('p_worlds.title')} — ${currentPage.value}` : t('p_worlds.title')),
  description: () => t('p_worlds.desc'),
  canonical: canonicalUrl,
  // A page with only a couple of maps is too thin to index yet.
  robots: () => currentPage.value > 1 || (data.value?.count || 0) < 8 ? 'noindex, follow' : 'index, follow',
})
</script>

<template>
  <div class="page">
    <BrowseLayout :title="$t('p_worlds.title')" :desc="$t('p_worlds.desc')">
      <template #actions>
        <NuxtLinkLocale to="/tilemaps/editor" class="btn primary">
          <span class="icon icon-plus"/><span>{{ $t('p_worlds.newTilemap') }}</span>
        </NuxtLinkLocale>
      </template>

      <div v-if="worlds.length" class="results wl-results">
        <NuxtLinkLocale v-for="w in worlds" :key="w.id" :to="`/worlds/${w.id_string}`" class="wl-card" :title="w.name">
          <div class="wl-cover">
            <img :src="thumbOf(w)" :alt="w.name || $t('common.untitled')" loading="lazy" decoding="async">
          </div>
          <div class="wl-head">
            <p class="wl-name">{{ w.name || $t('common.untitled') }}</p>
            <p class="wl-meta">
              <template v-if="w.size?.cols">{{ w.size.cols }}×{{ w.size.rows }}<template v-if="w.size.mode === 'iso'"> · {{ $t('common.isometric') }}</template></template>
              <template v-if="w.username"> · @{{ w.username }}</template>
            </p>
            <p v-if="w.tileset_name" class="wl-meta wl-ts"><span class="icon icon-grid"/>{{ w.tileset_name }}</p>
          </div>
        </NuxtLinkLocale>
      </div>

      <div v-else class="empty-state">
        <span class="empty-state-icon icon icon-grid" aria-hidden="true"/>
        <div class="empty-state-title">{{ $t('p_worlds.empty') }}</div>
        <div class="empty-state-actions">
          <NuxtLinkLocale to="/tilemaps/editor" class="btn primary">{{ $t('p_worlds.newTilemap') }}</NuxtLinkLocale>
        </div>
      </div>

      <template v-if="worlds.length" #foot>
        <span class="browse-foot-start">{{ $t('p_worlds.count', {count: data?.count || worlds.length}, data?.count || worlds.length) }}</span>
        <span class="browse-foot-end">
          <Paginator :page="page" :pages="data?.num_pages || 1" :prev-to="prevTo" :next-to="nextTo"/>
        </span>
      </template>
    </BrowseLayout>
  </div>
</template>

<style scoped>
/* Maps are wide: two to a row on phones, then as many as fit. */
.wl-results {
  grid-template-columns: repeat(auto-fill, minmax(calc(var(--space-6) * 16), 1fr));
}

.wl-card {
  display: block;
  min-width: 0;
  border: 1px solid var(--border);
  background: var(--surface);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow);
  overflow: hidden;
}

.wl-cover {
  aspect-ratio: 4 / 3;
  background: repeating-conic-gradient(var(--surface-2) 0 25%, var(--surface) 0 50%) 0 0 / var(--space-4) var(--space-4);
}

.wl-cover img {
  width: 100%;
  height: 100%;
  padding: var(--space-2);
  object-fit: contain;
  image-rendering: pixelated;
}

.wl-head { padding: var(--space-2) 0.625rem; border-top: 1px solid var(--border); }
.wl-name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: var(--text-sm); font-weight: 600; }
.wl-meta { margin-top: 0.125rem; font-size: var(--text-2xs); color: var(--muted); font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.wl-ts { display: flex; align-items: center; gap: var(--space-1); }
.wl-ts .icon { width: var(--icon-sm); height: var(--icon-sm); flex-shrink: 0; }
@media (hover: hover) and (pointer: fine) { .wl-card:hover { border-color: var(--primary); } }

@media (max-width: 767px) {
  .wl-results { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>
