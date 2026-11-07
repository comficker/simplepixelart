<script setup lang="ts">
// Public tilesets, the way /collections lists collections: one card each,
// covered with its first tiles. The breadcrumb under /tilesets/<slug> leads
// here.
import type {APIResponse} from '~/types'
import {tileImageUrl} from '~/helper/tilemap'

const {t} = useI18n()
const route = useRoute()
const config = useRuntimeConfig()
const apiBase = config.public.api as string

interface TilesetRow {
  id: number | string
  id_string: string
  name?: string
  username?: string
  meta?: { registry?: Record<string, string>, iso?: boolean }
}

const currentPage = computed(() => route.query.page ? Number.parseInt(route.query.page.toString()) : 1)

const {data} = await useAuthFetch<APIResponse<TilesetRow>>('/coloring/tilesets/', {
  query: computed(() => ({public: 1, page: currentPage.value, page_size: 24})),
  key: computed(() => `tilesets|${currentPage.value}`),
})

const tilesets = computed(() => data.value?.results || [])
const {page, prevTo, nextTo} = usePageLinks(data)

const tilesOf = (ts: TilesetRow) => Object.values(ts.meta?.registry || {})
const coverOf = (ts: TilesetRow) => tilesOf(ts).slice(0, 4).map(s => tileImageUrl(apiBase, s))

const canonicalUrl = computed(() => {
  const base = 'https://simplepixelart.com/tilesets'
  return currentPage.value > 1 ? `${base}?page=${currentPage.value}` : base
})

useCustomSeoMeta({
  title: computed(() => currentPage.value > 1 ? `${t('p_tilesets.title')} — ${currentPage.value}` : t('p_tilesets.title')),
  description: () => t('p_tilesets.desc'),
  canonical: canonicalUrl,
  // A page with only a couple of tilesets is too thin to index yet.
  robots: () => currentPage.value > 1 || (data.value?.count || 0) < 8 ? 'noindex, follow' : 'index, follow',
})
</script>

<template>
  <div class="page">
    <BrowseLayout :title="$t('p_tilesets.title')" :desc="$t('p_tilesets.desc')">
      <template #actions>
        <NuxtLinkLocale to="/tilesets/editor" class="btn primary">
          <span class="icon icon-plus"/><span>{{ $t('p_tilesets.newTileset') }}</span>
        </NuxtLinkLocale>
      </template>

      <div v-if="tilesets.length" class="results">
        <NuxtLinkLocale v-for="ts in tilesets" :key="ts.id" :to="`/tilesets/${ts.id_string}`" class="ts-card" :title="ts.name">
          <div class="ts-cover">
            <div v-if="coverOf(ts).length" class="ts-mosaic" :class="{one: coverOf(ts).length < 4}">
              <img v-for="(src, i) in coverOf(ts).slice(0, coverOf(ts).length < 4 ? 1 : 4)" :key="i" :src="src" alt="" loading="lazy" decoding="async">
            </div>
            <div v-else class="card-empty"><span class="icon icon-grid"/></div>
          </div>
          <div class="ts-head">
            <p class="ts-name">{{ ts.name || $t('common.untitled') }}</p>
            <p class="ts-meta">
              {{ $t('p_tilesets_id_string.tileCount', {count: tilesOf(ts).length}, tilesOf(ts).length) }}
              <template v-if="ts.username"> · @{{ ts.username }}</template>
            </p>
          </div>
        </NuxtLinkLocale>
      </div>

      <div v-else class="empty-state">
        <span class="empty-state-icon icon icon-grid" aria-hidden="true"/>
        <div class="empty-state-title">{{ $t('p_tilesets.empty') }}</div>
        <div class="empty-state-actions">
          <NuxtLinkLocale to="/tilesets/editor" class="btn primary">{{ $t('p_tilesets.newTileset') }}</NuxtLinkLocale>
        </div>
      </div>

      <template v-if="tilesets.length" #foot>
        <span class="browse-foot-start">{{ $t('p_tilesets.count', {count: data?.count || tilesets.length}, data?.count || tilesets.length) }}</span>
        <span class="browse-foot-end">
          <Paginator :page="page" :pages="data?.num_pages || 1" :prev-to="prevTo" :next-to="nextTo"/>
        </span>
      </template>
    </BrowseLayout>
  </div>
</template>

<style scoped>
.ts-card {
  display: block;
  min-width: 0;
  border: 1px solid var(--border);
  background: var(--surface);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow);
  overflow: hidden;
}
.ts-cover { position: relative; aspect-ratio: 1 / 1; background: var(--surface-2); }
.ts-mosaic {
  position: absolute; inset: 0; display: grid; gap: 1px; background: var(--border);
  grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr;
}
.ts-mosaic.one { grid-template-columns: 1fr; grid-template-rows: 1fr; }
.ts-mosaic img {
  width: 100%; height: 100%; min-height: 0; object-fit: contain; padding: var(--space-2);
  background: var(--surface-2); image-rendering: pixelated;
}
.ts-head { padding: var(--space-2) 0.625rem; border-top: 1px solid var(--border); }
.ts-name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: var(--text-sm); font-weight: 600; }
.ts-meta { margin-top: 0.125rem; font-size: var(--text-2xs); color: var(--muted); font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
@media (hover: hover) and (pointer: fine) { .ts-card:hover { border-color: var(--primary); } }
</style>
