<script setup lang="ts">
import CustomLink from "~/components/CustomLink.vue";
import {debounce} from "~/helper/utils";
import {looksLikeProtectedIP} from "~/helper/ip-denylist";

const {limit, showFilter, status, hideIp, ordering, hidePaginator} = defineProps({
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
  fetch: listFetch, isNewView, sizeSlugMatch, currentSize, isoActive,
} = useArtListFetch({limit, status, ordering, hideIp, search})

const isDetailView = computed(() => route.path.startsWith('/art/'))

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
  return items.filter(it => !looksLikeProtectedIP(it.name)).slice(0, limit)
})

const isLoading = computed(() => pending.value && !data.value?.results?.length)
const isEmpty = computed(() => !pending.value && data.value && visibleResults.value.length === 0)

const pagination = computed(() => {
  const page = route.query.page ? Number.parseInt(route.query.page.toString()) : 1
  const buildLink = (p: number) => {
    const q = new URLSearchParams()
    for (const [k, v] of Object.entries(route.query)) {
      if (k === 'page' || v == null) continue
      q.set(k, v.toString())
    }
    if (p > 1) q.set('page', String(p))
    const qs = q.toString()
    return qs ? `${route.path}?${qs}` : route.path
  }
  return {
    n: data.value?.links?.next ? buildLink(page + 1) : null,
    p: data.value?.links?.previous ? buildLink(page - 1) : null
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

function setIso(on: boolean) {
  const q: Record<string, any> = {...route.query}
  delete q.page
  if (on) q.is_iso = '1'
  else delete q.is_iso
  router.push({query: q})
}

const sortLabel = computed(() => isNewView.value ? 'Newest' : 'Popular')
const viewLabel = computed(() => isoActive.value ? 'Isometric' : 'All views')

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

        <ui-dropdown-menu>
          <button type="button" class="list-filter-btn" :class="{active: isoActive}" title="Filter by view">
            <span class="icon icon-rhombus"/>
            <span class="list-filter-label">{{ viewLabel }}</span>
          </button>
          <template #menu>
            <div class="list-filter-menu">
              <button class="drop-item" :class="{active: !isoActive}" @click="setIso(false)">
                <span>All views</span>
                <span v-if="!isoActive" class="icon icon-check"/>
              </button>
              <button class="drop-item" :class="{active: isoActive}" @click="setIso(true)">
                <span>Isometric</span>
                <span v-if="isoActive" class="icon icon-check"/>
              </button>
            </div>
          </template>
        </ui-dropdown-menu>

        <ui-dropdown-menu>
          <button type="button" class="list-filter-btn" title="Sort">
            <span class="icon icon-rocket"/>
            <span class="list-filter-label">{{ sortLabel }}</span>
          </button>
          <template #menu>
            <div class="list-filter-menu">
              <nuxt-link to="/arts" class="drop-item" :class="{active: !isNewView}">
                <span>Popular</span>
                <span v-if="!isNewView" class="icon icon-check"/>
              </nuxt-link>
              <nuxt-link to="/arts/new" class="drop-item" :class="{active: isNewView}">
                <span>Newest</span>
                <span v-if="isNewView" class="icon icon-check"/>
              </nuxt-link>
            </div>
          </template>
        </ui-dropdown-menu>

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
      <ItemCard v-for="(item, i) in visibleResults" :key="item.id" :value="item" :priority="i < 3"/>
    </div>
    <Paginator
        v-if="!hidePaginator && limit > 6 && data?.results.length"
        :page="Number(route.query.page) || 1"
        :pages="data.num_pages"
        :prev-to="pagination.p"
        :next-to="pagination.n"
    />
  </div>
</template>

<style scoped>
.list-toolbar {
  --ctl-h: 36px;
  display: flex;
  flex-wrap: wrap;
  align-items: stretch;
  gap: var(--space-2);
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
  gap: var(--space-2);
  height: var(--ctl-h);
  padding: 0 0.75rem;
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--foreground);
  border-radius: var(--radius-sm);
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

.list-filter-menu {
  display: flex;
  flex-direction: column;
  min-width: 160px;
  padding: var(--space-1);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-hover);
}

.list-filter-menu .drop-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
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
  gap: var(--space-3);
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
