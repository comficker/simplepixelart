<script setup lang="ts">
import type {ResponseSharedPage} from "~/types";
import CustomLink from "~/components/CustomLink.vue";
import {debounce} from "~/helper/utils";

const {limit, showFilter, status} = defineProps({
  limit: {
    type: Number,
    default: 20
  },
  showFilter: {
    type: Boolean,
    default: false
  },
  status: {
    type: String,
    default: 'public'
  }
});

const route = useRoute()
const router = useRouter()

const search = ref('')

const SIZE_PRESETS = [
  {width: 8, height: 8},
  {width: 16, height: 16},
  {width: 24, height: 24},
  {width: 32, height: 32},
  {width: 48, height: 48},
  {width: 64, height: 64},
] as const

const isNewView = computed(() => route.path === '/arts/new')
const isCreatorView = computed(() => route.path.startsWith('/creator/'))
const isDetailView = computed(() => route.path.startsWith('/art/'))
const showPending = computed(() => isNewView.value || isCreatorView.value)
const relatedId = computed(() => isDetailView.value ? route.params.id_string?.toString() : undefined)

const sizeSlugMatch = computed(() => route.path.match(/^\/arts\/size-(\d+)x(\d+)$/i))

const currentSize = computed(() => {
  if (sizeSlugMatch.value) {
    return {width: parseInt(sizeSlugMatch.value[1]!), height: parseInt(sizeSlugMatch.value[2]!)}
  }
  const w = route.query.width
  const h = route.query.height
  if (w && h) {
    const wn = parseInt(w.toString())
    const hn = parseInt(h.toString())
    if (!Number.isNaN(wn) && !Number.isNaN(hn)) return {width: wn, height: hn}
  }
  return null
})

const isoActive = computed(() =>
    route.query.is_iso === '1' || route.query.is_iso === 'true',
)

const hasActiveFilters = computed(() =>
    !!currentSize.value || isoActive.value || !!search.value,
)

const params = computed(() => ({
  status: showPending.value ? 'public,pending' : status,
  slug: isNewView.value ? '/arts' : route.path,
  page: route.query.page ? Number.parseInt(route.query.page.toString()) : 1,
  page_size: limit,
  search: search.value,
  ordering: showPending.value ? '-updated' : undefined,
  related: relatedId.value,
  width: !sizeSlugMatch.value && route.query.width ? route.query.width : undefined,
  height: !sizeSlugMatch.value && route.query.height ? route.query.height : undefined,
  is_iso: isoActive.value ? '1' : undefined,
}));

const {data, pending} = await useAuthFetch<ResponseSharedPage>(`/coloring/shared-pages/`, {
  query: params,
  key: route.fullPath,
})

const isLoading = computed(() => pending.value && !data.value?.results?.length)
const isEmpty = computed(() => !pending.value && data.value && data.value.results.length === 0)

const pagination = computed(() => {
  const page = route.query.page ? Number.parseInt(route.query.page.toString()) : 1
  const prevPage = page - 1
  return {
    n: data.value?.links?.next ? `${route.path}?page=${page + 1}` : null,
    p: data.value?.links?.previous
        ? (prevPage <= 1 ? route.path : `${route.path}?page=${prevPage}`)
        : null
  }
})

const handleInput = debounce((event: { target: { value: string; }; }) => {
  search.value = event.target.value
}, 800)

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

function toggleIso() {
  const q: Record<string, any> = {...route.query}
  delete q.page
  if (isoActive.value) delete q.is_iso
  else q.is_iso = '1'
  router.push({query: q})
}

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
  <div class="page">
    <template v-if="showFilter">
      <div class="list-toolbar">
        <div class="list-search-wrap">
          <span class="icon icon-search list-search-icon" aria-hidden="true"/>
          <input
              type="text"
              :value="search"
              class="list-search"
              placeholder="Search pixel art..."
              aria-label="Search pixel art"
              @input="handleInput"
          />
        </div>

        <ui-dropdown-menu>
          <button
              type="button"
              class="list-filter-btn"
              :class="{active: !!sizeLabel}"
              :title="sizeLabel ? `Size: ${sizeLabel}` : 'Filter by size'"
          >
            <span class="icon icon-square"/>
            <span class="list-filter-label">{{ sizeLabel || 'Any size' }}</span>
          </button>
          <template #menu>
            <div class="list-filter-menu">
              <button class="drop-item" :class="{active: !currentSize}" @click="setSize(null)">
                <span>Any size</span>
                <span v-if="!currentSize" class="icon icon-check"/>
              </button>
              <div class="list-filter-sep"/>
              <button
                  v-for="p in SIZE_PRESETS"
                  :key="`${p.width}x${p.height}`"
                  class="drop-item"
                  :class="{active: isCurrentPreset(p)}"
                  @click="setSize(p)"
              >
                <span>{{ p.width }}×{{ p.height }}</span>
                <span v-if="isCurrentPreset(p)" class="icon icon-check"/>
              </button>
            </div>
          </template>
        </ui-dropdown-menu>

        <button
            type="button"
            class="list-filter-btn"
            :class="{active: isoActive}"
            :title="isoActive ? 'Showing isometric only' : 'Show isometric only'"
            @click="toggleIso"
        >
          <span class="icon icon-rhombus"/>
          <span class="list-filter-label">Isometric</span>
        </button>
      </div>

      <div v-if="!!currentSize || isoActive" class="list-selected">
        <span class="list-selected-label">Filtered by</span>
        <span v-if="currentSize" class="list-selected-chip">
          <span class="icon icon-square"/>
          <span>{{ sizeLabel }}</span>
          <button
              type="button"
              class="list-selected-x"
              @click="setSize(null)"
              :aria-label="`Remove size ${sizeLabel}`"
          >
            <span class="icon icon-x"/>
          </button>
        </span>
        <span v-if="isoActive" class="list-selected-chip">
          <span class="icon icon-rhombus"/>
          <span>Isometric</span>
          <button
              type="button"
              class="list-selected-x"
              @click="toggleIso"
              aria-label="Remove isometric filter"
          >
            <span class="icon icon-x"/>
          </button>
        </span>
        <button
            type="button"
            class="list-filter-clear"
            @click="clearFilters"
            title="Clear all filters"
        >
          <span class="icon icon-x"/>
          <span>Clear all</span>
        </button>
      </div>
    </template>

    <div v-if="isLoading" class="skeleton-grid">
      <div v-for="i in limit" :key="`sk-${i}`" class="skeleton skeleton-square"/>
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
      <ItemCard v-for="(item, i) in data.results" :key="item.id" :value="item" :priority="i < 3"/>
    </div>
    <div v-if="limit > 6 && data?.results.length" class="paginator">
      <CustomLink :to="pagination.p">
        <span class="icon icon-angle-left"/>
        <span>Previous</span>
      </CustomLink>
      <div>{{ route.query.page?.toString() || 1 }}/{{ data.num_pages }}</div>
      <CustomLink :to="pagination.n">
        <span>Next</span>
        <span class="icon icon-angle-right"/>
      </CustomLink>
    </div>
  </div>
</template>

<style scoped>
.list-toolbar {
  --ctl-h: 36px;
  display: flex;
  flex-wrap: wrap;
  align-items: stretch;
  gap: 0.375rem;
}

.list-search-wrap {
  position: relative;
  flex: 1 1 220px;
  min-width: 180px;
  height: var(--ctl-h);
}

.list-search-icon {
  position: absolute;
  left: 0.625rem;
  top: 50%;
  transform: translateY(-50%);
  color: var(--muted);
  font-size: 14px;
  pointer-events: none;
}

.list-search {
  width: 100%;
  height: 100%;
  padding: 0 0.75rem 0 2rem !important;
  font-size: var(--text-xs);
  line-height: 1;
}

.list-filter-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  height: var(--ctl-h);
  padding: 0 0.75rem;
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--foreground);
  border-radius: var(--radius);
  cursor: pointer;
  font-size: var(--text-xs);
  line-height: 1;
  font-weight: 600;
  transition: border-color var(--transition), color var(--transition), background var(--transition);
  white-space: nowrap;
}

.list-filter-btn .icon {
  font-size: 13px;
  color: var(--muted);
}

@media (hover: hover) and (pointer: fine) {
  .list-filter-btn:hover {
    border-color: var(--primary);
    color: var(--primary);
  }

  .list-filter-btn:hover .icon {
    color: var(--primary);
  }
}

.list-filter-btn.active {
  background: color-mix(in oklab, var(--primary) 12%, var(--surface));
  border-color: var(--primary);
  color: var(--primary);
}

.list-filter-btn.active .icon {
  color: var(--primary);
}

.list-selected {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.375rem;
  margin-top: 0.5rem;
}

.list-selected-label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
  margin-right: 0.125rem;
}

.list-selected-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  height: 26px;
  padding: 0 0.25rem 0 0.625rem;
  background: color-mix(in oklab, var(--primary) 14%, var(--surface));
  border: 1px solid color-mix(in oklab, var(--primary) 40%, transparent);
  color: var(--primary);
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  line-height: 1;
}

.list-selected-chip .icon {
  font-size: 11px;
}

.list-selected-x {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: transparent;
  cursor: pointer;
  color: inherit;
}

.list-selected-x:hover {
  background: color-mix(in oklab, var(--primary) 22%, transparent);
}

.list-selected-x .icon {
  font-size: 10px;
}

.list-filter-clear {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  height: 26px;
  padding: 0 0.5rem;
  background: transparent;
  border: 1px solid transparent;
  color: var(--muted);
  cursor: pointer;
  font-size: 12px;
  line-height: 1;
  font-weight: 600;
  border-radius: 999px;
  margin-left: auto;
}

.list-filter-clear:hover {
  color: #ff4444;
  background: color-mix(in oklab, #ff4444 10%, transparent);
}

.list-filter-clear .icon {
  font-size: 10px;
}

.list-filter-clear:hover {
  color: #ff4444;
}

.list-filter-clear .icon {
  font-size: 11px;
}

.list-filter-menu {
  display: flex;
  flex-direction: column;
  min-width: 160px;
  padding: 0.25rem;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow-hover);
}

.list-filter-menu .drop-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  width: 100%;
  padding: 0.375rem 0.625rem;
  border: 0;
  background: transparent;
  cursor: pointer;
  text-align: left;
  font-size: var(--text-xs);
  line-height: var(--text-xs-lh);
  font-weight: 600;
  color: var(--foreground);
  border-radius: var(--radius-sm);
}

.list-filter-menu .drop-item:hover {
  background: var(--surface-2);
  color: var(--primary);
}

.list-filter-menu .drop-item.active {
  color: var(--primary);
}

.list-filter-menu .drop-item .icon {
  font-size: 12px;
}

.list-filter-sep {
  height: 1px;
  background: var(--border);
  margin: 0.25rem 0;
}

.empty-state-actions {
  display: flex;
  justify-content: center;
  gap: 0.5rem;
  margin-top: 0.75rem;
}

@media (max-width: 480px) {
  .list-filter-label {
    display: none;
  }

  .list-filter-btn {
    padding: 0 0.625rem;
  }

  .list-filter-btn .icon {
    font-size: 14px;
  }
}
</style>
