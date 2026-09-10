<script setup lang="ts">
import type {ResponsePalette} from "~/types";

const {title, desc} = defineProps({
  title: {
    type: String,
    default: ''
  },
  desc: {
    type: String,
    default: ''
  }
});

const route = useRoute()
const router = useRouter()

const tag = computed(() => (route.params.tag?.toString() || '').toLowerCase())

const {data: tagData} = await useAuthFetch<{ name: string; id_string: string; count: number }[]>(
    `/coloring/palettes/tags/`, {key: 'palette-tag-counts'})
const browseTags = computed(() => tagData.value || [])
const activeTag = computed(() => browseTags.value.find(t => t.id_string === tag.value))
const tagLabel = computed(() => tag.value
    ? (activeTag.value?.name || tag.value)
    : String(browseTags.value.length))

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
  taxonomies__id_string: tag.value || undefined,
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

function setSearch(value: string) {
  search.value = value
  pushQuery({q: value || undefined})
}

function setSort(key: string) { pushQuery({sort: key === '-score' ? undefined : key}) }
function setCount(key: string) { pushQuery({size: key || undefined}) }
function clearFilters() { search.value = ''; router.push({query: {}}) }

const {page: currentPage, prevTo, nextTo} = usePageLinks(data)
</script>

<template>
  <BrowseLayout :title="title" :desc="desc">
    <template #actions>
      <nuxt-link to="/palettes/color-palette-from-image" class="btn">
        <span class="icon icon-image"/><span>From image</span>
      </nuxt-link>
      <nuxt-link to="/palettes/color-palette-from-color" class="btn">
        <span class="icon icon-swap"/><span>From a color</span>
      </nuxt-link>
    </template>

    <template #filters>
      <BrowseSearch :model-value="search" placeholder="Search palettes..." @update:model-value="setSearch"/>

      <BrowseFilter label="Sort" icon="icon-rocket" :value="activeSort.label">
        <BrowseOpt v-for="s in SORTS" :key="s.key" :active="sort === s.key" @click="setSort(s.key)">
          {{ s.label }}
        </BrowseOpt>
      </BrowseFilter>

      <BrowseFilter label="Colors" icon="icon-palette" :value="activeCount.label" :active="!!countKey">
        <BrowseOpt v-for="c in COUNTS" :key="c.key" :active="countKey === c.key" @click="setCount(c.key)">
          {{ c.label }}
        </BrowseOpt>
      </BrowseFilter>

      <BrowseFilter v-if="browseTags.length" label="Tags" icon="icon-flag" :value="tagLabel" :active="!!tag">
        <BrowseOpt to="/palettes" :active="!tag">All palettes</BrowseOpt>
        <BrowseOpt
            v-for="t in browseTags"
            :key="t.id_string"
            :to="`/palettes/tag/${t.id_string}`"
            :active="tag === t.id_string"
            :count="t.count"
        >
          {{ t.name }}
        </BrowseOpt>
      </BrowseFilter>
    </template>

    <div v-if="isLoading" class="pal-grid">
      <div v-for="i in 12" :key="`sk-${i}`" class="skeleton pal-skeleton"/>
    </div>
    <div v-else-if="isEmpty" class="empty-state">
      <span class="empty-state-icon icon icon-search" aria-hidden="true"/>
      <div class="empty-state-title">No palettes found</div>
      <p class="empty-state-body">
        <template v-if="hasFilters">Nothing matches the current filters.</template>
        <template v-else-if="tag">Nothing is tagged “{{ tagLabel }}” yet.</template>
        <template v-else>The library is empty here for now.</template>
      </p>
      <div class="empty-state-actions">
        <button v-if="hasFilters" class="btn" @click="clearFilters">Clear filters</button>
        <nuxt-link v-else-if="tag" to="/palettes" class="btn">All palettes</nuxt-link>
        <nuxt-link to="/palettes/color-palette-from-image" class="btn primary">Create from image</nuxt-link>
      </div>
    </div>
    <div v-else class="pal-grid">
      <ItemPaletteCard v-for="p in results" :key="p.id" :value="p"/>
    </div>

    <template v-if="results.length" #foot>
      <span class="browse-foot-start">
        {{ data?.count || results.length }} {{ (data?.count || results.length) === 1 ? 'palette' : 'palettes' }}
      </span>
      <span class="browse-foot-end">
        <Paginator
            :page="currentPage"
            :pages="data?.num_pages || 1"
            :prev-to="prevTo"
            :next-to="nextTo"
        />
      </span>
    </template>
  </BrowseLayout>
</template>
