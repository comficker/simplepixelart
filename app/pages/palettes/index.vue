<script setup lang="ts">
import type {ResponsePalette} from "~/types";
import {debounce} from "~/helper/utils";

// Tags actually used by public palettes (empty tags excluded), with counts.
const {data: tagData} = await useAuthFetch<{ name: string; id_string: string; count: number }[]>(
    `/coloring/palettes/tags/`, {key: 'palette-tag-counts'})
const browseTags = computed(() => tagData.value || [])

const route = useRoute()
const router = useRouter()

const search = ref((route.query.q as string) || '')

const SORTS = [
  {key: '-score', label: 'Popular'},
  {key: '-usage_count', label: 'Most used'},
  {key: '-created', label: 'Newest'},
] as const

const COUNTS = [
  {key: '', label: 'Any size', gte: undefined, lte: undefined},
  {key: '1-8', label: '≤ 8', gte: 1, lte: 8},
  {key: '9-16', label: '9–16', gte: 9, lte: 16},
  {key: '17-32', label: '17–32', gte: 17, lte: 32},
  {key: '33+', label: '33+', gte: 33, lte: undefined},
] as const

const sort = computed(() => (route.query.sort as string) || '-score')
const countKey = computed(() => (route.query.size as string) || '')
const activeCount = computed(() => COUNTS.find(c => c.key === countKey.value) || COUNTS[0])
const activeSort = computed(() => SORTS.find(s => s.key === sort.value) || SORTS[0])

const params = computed(() => ({
  page: route.query.page ? Number.parseInt(route.query.page.toString()) : 1,
  page_size: 24,
  search: search.value || undefined,
  ordering: sort.value,
  color_count__gte: activeCount.value.gte,
  color_count__lte: activeCount.value.lte,
}))

const {data, pending} = await useAuthFetch<ResponsePalette>(`/coloring/palettes/`, {
  query: params,
  key: computed(() => `palettes|${JSON.stringify(params.value)}`),
})

const results = computed(() => data.value?.results || [])
const isLoading = computed(() => pending.value && !results.value.length)
const isEmpty = computed(() => !pending.value && data.value && results.value.length === 0)
const hasFilters = computed(() => !!search.value || !!countKey.value)

function pushQuery(patch: Record<string, any>) {
  const q: Record<string, any> = {...route.query, ...patch}
  delete q.page
  Object.keys(q).forEach(k => { if (q[k] === undefined || q[k] === '') delete q[k] })
  router.push({query: q})
}

const handleInput = debounce((e: { target: { value: string } }) => {
  search.value = e.target.value
  pushQuery({q: e.target.value || undefined})
}, 600)

function setSort(key: string) { pushQuery({sort: key === '-score' ? undefined : key}) }
function setCount(key: string) { pushQuery({size: key || undefined}) }
function clearFilters() { search.value = ''; router.push({query: {}}) }

const pagination = computed(() => {
  const page = route.query.page ? Number.parseInt(route.query.page.toString()) : 1
  const prevPage = page - 1
  const base = (p: number) => {
    const q: Record<string, any> = {...route.query, page: p}
    if (p <= 1) delete q.page
    const s = new URLSearchParams(q as any).toString()
    return s ? `${route.path}?${s}` : route.path
  }
  return {
    n: data.value?.links?.next ? base(page + 1) : null,
    p: data.value?.links?.previous ? base(prevPage) : null,
  }
})

const currentPage = computed(() => route.query.page ? Number.parseInt(route.query.page.toString()) : 1)

const hasFilterQuery = computed(() => !!(route.query.q || route.query.size || route.query.sort))

const canonicalUrl = computed(() => {
  const base = 'https://simplepixelart.com/palettes'
  if (hasFilterQuery.value) return base
  return currentPage.value > 1 ? `${base}?page=${currentPage.value}` : base
})

const seoTitle = computed(() =>
    currentPage.value > 1
        ? `Pixel Art Color Palettes — Page ${currentPage.value} | SimplePixelArt`
        : "Pixel Art Color Palettes — Browse & Download",
)

useCustomSeoMeta({
  title: seoTitle,
  description: "Browse a library of pixel art color palettes. Filter by size, sort by popularity, and apply any palette to your art in one click.",
  keywords: "pixel art palette, color palette, lospec palette, pixel colors, palette library",
  canonical: canonicalUrl,
  robots: () => (currentPage.value > 1 || hasFilterQuery.value) ? 'noindex, follow' : 'index, follow',
})
</script>

<template>
  <div class="page">
    <div class="page-hero">
      <h1>Color Palettes</h1>
      <p>Browse, filter, and apply ready-made palettes — or create your own.</p>
      <div class="pal-create-row">
        <nuxt-link to="/palettes/color-palette-from-image" class="btn">
          <span class="icon icon-image"/><span>From image</span>
        </nuxt-link>
        <nuxt-link to="/palettes/color-palette-from-color" class="btn">
          <span class="icon icon-swap"/><span>From a color</span>
        </nuxt-link>
      </div>
    </div>

    <div class="pal-toolbar">
      <div class="pal-search-wrap">
        <span class="icon icon-search pal-search-icon" aria-hidden="true"/>
        <input
            type="text"
            :value="search"
            class="pal-search"
            placeholder="Search palettes..."
            aria-label="Search palettes"
            @input="handleInput"
        />
      </div>

      <div class="pal-toolbar-end">
        <ui-dropdown-menu position="right">
          <button class="pal-filter-btn">
            <span class="pal-filter-cap">Sort</span>
            <span>{{ activeSort.label }}</span>
            <span class="icon icon-expand-down"/>
          </button>
          <template #menu>
            <div class="file-menu">
              <button v-for="s in SORTS" :key="s.key" class="file-menu-item" @click="setSort(s.key)">
                <span class="file-menu-label">
                  <span>{{ s.label }}</span>
                  <span v-if="sort === s.key" class="icon icon-check"/>
                </span>
              </button>
            </div>
          </template>
        </ui-dropdown-menu>

        <ui-dropdown-menu position="right">
          <button class="pal-filter-btn">
            <span class="pal-filter-cap">Colors</span>
            <span>{{ activeCount.label }}</span>
            <span class="icon icon-expand-down"/>
          </button>
          <template #menu>
            <div class="file-menu">
              <button v-for="c in COUNTS" :key="c.key" class="file-menu-item" @click="setCount(c.key)">
                <span class="file-menu-label">
                  <span>{{ c.label }}</span>
                  <span v-if="countKey === c.key" class="icon icon-check"/>
                </span>
              </button>
            </div>
          </template>
        </ui-dropdown-menu>
      </div>
    </div>

    <div v-if="isLoading" class="pal-grid">
      <div v-for="i in 12" :key="`sk-${i}`" class="skeleton" style="height: 132px; border-radius: var(--radius-sm);"/>
    </div>
    <div v-else-if="isEmpty" class="empty-state">
      <span class="empty-state-icon icon icon-search" aria-hidden="true"/>
      <div class="empty-state-title">No palettes found</div>
      <p class="empty-state-body">
        <template v-if="hasFilters">Nothing matches the current filters.</template>
        <template v-else>The library is empty here for now.</template>
      </p>
      <div class="empty-state-actions">
        <button v-if="hasFilters" class="btn" @click="clearFilters">Clear filters</button>
        <nuxt-link to="/palettes/color-palette-from-image" class="btn primary">Create from image</nuxt-link>
      </div>
    </div>
    <div v-else class="pal-grid">
      <ItemPaletteCard v-for="p in results" :key="p.id" :value="p"/>
    </div>

    <Paginator
        v-if="results.length"
        :page="Number(route.query.page) || 1"
        :pages="data?.num_pages || 1"
        :prev-to="pagination.p"
        :next-to="pagination.n"
    />

    <section v-if="browseTags.length" class="pal-tagrow">
      <h2 class="pal-tagrow-title">Browse by tag</h2>
      <TagList :items="browseTags.map(t => ({ label: t.name, to: `/palettes/tag/${t.id_string}`, count: t.count }))"/>
    </section>
  </div>
</template>

<style scoped>
/* App-icon tile cards, same language as home .studio-paths. */
.pal-create-row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-top: 0.25rem;
}

.pal-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  align-items: stretch;
}

.pal-search-wrap {
  position: relative;
  flex: 1 1 240px;
  min-width: 200px;
  height: 38px;
}

.pal-search-icon {
  position: absolute;
  left: 0.625rem;
  top: 50%;
  transform: translateY(-50%);
  color: var(--muted);
  font-size: 14px;
  pointer-events: none;
}

.pal-search {
  width: 100%;
  height: 100%;
  padding: 0 0.75rem 0 2rem !important;
  font-size: var(--text-xs);
}

/* Sort + Colors dropdowns, pushed to the toolbar's right edge. */
.pal-toolbar-end {
  display: flex;
  gap: var(--space-2);
  margin-left: auto;
}

.pal-filter-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  height: 38px;
  padding: 0 0.75rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--foreground);
  font-size: var(--text-xs);
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  transition: border-color var(--transition), color var(--transition);
}

.pal-filter-cap {
  color: var(--muted);
  font-weight: 600;
}

.pal-filter-btn .icon-expand-down {
  font-size: 13px;
  color: var(--muted);
}

.pal-tagrow {
}

.pal-tagrow-title {
  font-size: var(--text-sm);
  line-height: var(--text-sm-lh);
  font-weight: 700;
  color: var(--muted);
  margin-bottom: 0.625rem;
}

.pal-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: var(--space-4);
  margin-top: 1rem;
}

@media (max-width: 520px) {
  .pal-grid { grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); }
}
</style>
