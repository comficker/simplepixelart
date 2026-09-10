<script setup lang="ts">
import BrowseLayout from "~/components/BrowseLayout.vue";
import {looksLikeProtectedIP} from "~/helper/ip-denylist";

const {limit, showFilter, status, hideIp, ordering, hidePaginator, title, desc} = defineProps({
  title: {
    type: String,
    default: ''
  },
  desc: {
    type: String,
    default: ''
  },
  limit: {
    type: Number,
    default: 20
  },
  showFilter: {
    type: Boolean,
    default: false
  },
  hidePaginator: {
    type: Boolean,
    default: false
  },
  status: {
    type: String,
    default: 'public'
  },
  hideIp: {
    type: Boolean,
    default: false
  },
  ordering: {
    type: String,
    default: ''
  }
});

const route = useRoute()
const router = useRouter()

const search = ref('')

const {
  fetch: listFetch, isNewView, sizeSlugMatch, currentSize, isoActive, effectiveLimit,
} = useArtListFetch({limit, status, ordering, hideIp, search})

const SIZE_PRESETS = [
  {width: 8, height: 8},
  {width: 16, height: 16},
  {width: 24, height: 24},
  {width: 32, height: 32},
  {width: 48, height: 48},
  {width: 64, height: 64},
] as const

const hasActiveFilters = computed(() =>
    !!currentSize.value || isoActive.value || !!search.value,
)

const {data, pending} = await listFetch

const visibleResults = computed(() => {
  const items = data.value?.results || []
  if (!hideIp) return items
  return items.filter(it => !looksLikeProtectedIP(it.name)).slice(0, effectiveLimit.value)
})

const isLoading = computed(() => pending.value && !data.value?.results?.length)
const isEmpty = computed(() => !pending.value && data.value && visibleResults.value.length === 0)

const {page, prevTo, nextTo} = usePageLinks(data)

function setSize(preset: {width: number, height: number} | null) {
  if (sizeSlugMatch.value) {
    router.push(preset
        ? `/arts/size-${preset.width}x${preset.height}`
        : '/arts',
    )
    return
  }
  const q: Record<string, any> = {...route.query}
  delete q.page
  if (preset) {
    q.width = preset.width.toString()
    q.height = preset.height.toString()
  } else {
    delete q.width
    delete q.height
  }
  router.push({query: q})
}

function setIso(on: boolean) {
  const q: Record<string, any> = {...route.query}
  delete q.page
  if (on) q.is_iso = '1'
  else delete q.is_iso
  router.push({query: q})
}

const sortLabel = computed(() => isNewView.value ? 'Newest' : 'Popular')

function clearFilters() {
  search.value = ''
  if (sizeSlugMatch.value) {
    router.push('/arts')
    return
  }
  const q: Record<string, any> = {...route.query}
  delete q.page
  delete q.width
  delete q.height
  delete q.is_iso
  router.push({query: q})
}

const sizeLabel = computed(() => {
  if (!currentSize.value) return null
  return `${currentSize.value.width}×${currentSize.value.height}`
})

function isCurrentPreset(p: {width: number, height: number}): boolean {
  return !!currentSize.value
      && currentSize.value.width === p.width
      && currentSize.value.height === p.height
}
</script>

<template>
  <component :is="showFilter ? BrowseLayout : 'div'" v-bind="showFilter ? {title, desc} : {}" :class="showFilter ? undefined : 'page'">
    <template v-if="showFilter" #filters>
      <BrowseSearch v-model="search" placeholder="Search pixel art..." :delay="800"/>

      <BrowseFilter label="Size" icon="icon-square" :value="sizeLabel || 'Any'" :active="!!sizeLabel">
        <BrowseOpt :active="!currentSize" @click="setSize(null)">Any size</BrowseOpt>
        <BrowseOpt
            v-for="p in SIZE_PRESETS"
            :key="`${p.width}x${p.height}`"
            :active="isCurrentPreset(p)"
            @click="setSize(p)"
        >
          {{ p.width }}×{{ p.height }}
        </BrowseOpt>
      </BrowseFilter>

      <BrowseFilter label="View" icon="icon-rhombus" :value="isoActive ? 'Isometric' : 'All'" :active="isoActive">
        <BrowseOpt :active="!isoActive" @click="setIso(false)">All views</BrowseOpt>
        <BrowseOpt :active="isoActive" @click="setIso(true)">Isometric</BrowseOpt>
      </BrowseFilter>

      <BrowseFilter label="Sort" icon="icon-rocket" :value="sortLabel">
        <BrowseOpt to="/arts" :active="!isNewView">Popular</BrowseOpt>
        <BrowseOpt to="/arts/new" :active="isNewView">Newest</BrowseOpt>
      </BrowseFilter>

      <slot name="filters-extra"/>
    </template>

    <div v-if="isLoading" class="skeleton-grid">
      <div v-for="i in effectiveLimit" :key="`sk-${i}`" class="skeleton skeleton-square"/>
    </div>
    <div v-else-if="isEmpty" class="empty-state">
      <span class="empty-state-icon icon icon-search" aria-hidden="true"/>
      <div class="empty-state-title">No pixel art found</div>
      <p class="empty-state-body">
        <template v-if="search">
          Nothing matches "{{ search }}". Try a different keyword.
        </template>
        <template v-else-if="hasActiveFilters">
          No pixel art matches the current filters.
        </template>
        <template v-else>
          The gallery is empty here for now. Be the first to publish something.
        </template>
      </p>
      <div class="empty-state-actions">
        <button v-if="hasActiveFilters" class="btn" @click="clearFilters">Clear filters</button>
        <nuxt-link to="/editor" class="btn primary">Start creating</nuxt-link>
      </div>
    </div>
    <div v-else-if="data" class="results">
      <ItemCard v-for="(item, i) in visibleResults" :key="item.id" :value="item" :priority="i < 3"/>
    </div>
    <Paginator
        v-if="!showFilter && !hidePaginator && limit > 6 && data?.results.length"
        :page="page"
        :pages="data.num_pages"
        :prev-to="prevTo"
        :next-to="nextTo"
    />
    <template v-if="showFilter && !hidePaginator && data?.results.length" #foot>
      <span class="browse-foot-start">{{ data.count }} {{ data.count === 1 ? 'item' : 'items' }}</span>
      <span class="browse-foot-end">
        <Paginator
            :page="page"
            :pages="data.num_pages"
            :prev-to="prevTo"
            :next-to="nextTo"
        />
      </span>
    </template>
  </component>
</template>
