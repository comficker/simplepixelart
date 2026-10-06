<script setup lang="ts">
const {t} = useI18n()
const localePath = useLocalePath()
import BrowseLayout from "~/components/BrowseLayout.vue";

const {limit, showFilter, status, exactLimit, ordering, hidePaginator, title, desc} = defineProps({
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
  exactLimit: {
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

// Seeded from ?search= so /arts?search=x (the sitelinks search box) arrives
// filtered, and followed when a link changes it.
const search = ref(route.query.search?.toString() || '')
watch(() => route.query.search, v => { search.value = v?.toString() || '' })

const {
  fetch: listFetch, isNewView, sizeSlugMatch, currentSize, isoActive, openLicense, animOnly, sort, effectiveLimit,
} = useArtListFetch({limit, status, ordering, exact: exactLimit, search})

const SIZE_PRESETS = [
  {width: 8, height: 8},
  {width: 16, height: 16},
  {width: 24, height: 24},
  {width: 32, height: 32},
  {width: 48, height: 48},
  {width: 64, height: 64},
] as const

const hasActiveFilters = computed(() =>
    !!currentSize.value || isoActive.value || openLicense.value || animOnly.value || !!search.value,
)

const {data, pending} = await listFetch

const visibleResults = computed(() => data.value?.results || [])

const isLoading = computed(() => pending.value && !data.value?.results?.length)
const isEmpty = computed(() => !pending.value && data.value && visibleResults.value.length === 0)

const {page, prevTo, nextTo} = usePageLinks(data)

function setSize(preset: {width: number, height: number} | null) {
  if (sizeSlugMatch.value) {
    router.push(localePath(preset
        ? `/arts/size-${preset.width}x${preset.height}`
        : '/arts',
    ))
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

function setLicense(open: boolean) {
  const q: Record<string, any> = {...route.query}
  delete q.page
  if (open) q.license = 'open'
  else delete q.license
  router.push({query: q})
}

function setView(v: 'all' | 'iso' | 'anim') {
  const q: Record<string, any> = {...route.query}
  delete q.page
  delete q.is_iso
  delete q.is_anim
  if (v === 'iso') q.is_iso = '1'
  if (v === 'anim') q.is_anim = '1'
  router.push({query: q})
}

const auth = useAuthStore()
const SORT_LABEL = {
  popular: 'c_List.popular', trending: 'c_List.trending', following: 'c_List.following',
  liked: 'c_List.liked', new: 'c_List.newest',
} as const
const sortLabel = computed(() => t(SORT_LABEL[sort.value]))
const viewLabel = computed(() => isoActive.value ? t('common.isometric') : animOnly.value ? t('c_List.animated') : t('common.all'))

function clearFilters() {
  search.value = ''
  if (sizeSlugMatch.value) {
    router.push(localePath('/arts'))
    return
  }
  const q: Record<string, any> = {...route.query}
  delete q.page
  delete q.width
  delete q.height
  delete q.is_iso
  delete q.is_anim
  delete q.license
  delete q.search
  router.push({query: q})
}

// Sort links stay on the page they are on (a tag or size) with its other
// filters; only Newest has a path of its own. BrowseOpt adds the locale.
const pathNoLocale = useRoutePathNoLocale()
function sortTo(s?: 'trending' | 'following' | 'liked') {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(route.query)) {
    if (k === 'page' || k === 'sort' || v == null) continue
    q.set(k, v.toString())
  }
  if (s) q.set('sort', s)
  const base = isNewView.value ? '/arts' : pathNoLocale.value
  const qs = q.toString()
  return qs ? `${base}?${qs}` : base
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
      <BrowseSearch v-model="search" :placeholder="$t('c_List.searchPixelArt')" :delay="800"/>

      <BrowseFilter :label="$t('common.size')" icon="icon-square" :value="sizeLabel || $t('c_List.any')" :active="!!sizeLabel">
        <BrowseOpt :active="!currentSize" @click="setSize(null)">{{ $t('c_List.anySize') }}</BrowseOpt>
        <BrowseOpt
            v-for="p in SIZE_PRESETS"
            :key="`${p.width}x${p.height}`"
            :active="isCurrentPreset(p)"
            @click="setSize(p)"
        >
          {{ p.width }}×{{ p.height }}
        </BrowseOpt>
      </BrowseFilter>

      <BrowseFilter :label="$t('common.view')" icon="icon-rhombus" :value="viewLabel" :active="isoActive || animOnly">
        <BrowseOpt :active="!isoActive && !animOnly" @click="setView('all')">{{ $t('c_List.allViews') }}</BrowseOpt>
        <BrowseOpt :active="isoActive" @click="setView('iso')">{{ $t('common.isometric') }}</BrowseOpt>
        <BrowseOpt :active="animOnly" @click="setView('anim')">{{ $t('c_List.animated') }}</BrowseOpt>
      </BrowseFilter>

      <BrowseFilter :label="$t('p_upload.license')" icon="icon-check" :value="openLicense ? $t('c_List.freeToUse') : $t('common.all')" :active="openLicense">
        <BrowseOpt :active="!openLicense" @click="setLicense(false)">{{ $t('c_List.anyLicense') }}</BrowseOpt>
        <BrowseOpt :active="openLicense" @click="setLicense(true)">{{ $t('c_List.freeToUse') }}</BrowseOpt>
      </BrowseFilter>

      <BrowseFilter :label="$t('common.sort')" icon="icon-rocket" :value="sortLabel">
        <BrowseOpt :to="sortTo()" :active="sort === 'popular'">{{ $t('common.popular') }}</BrowseOpt>
        <BrowseOpt :to="sortTo('trending')" :active="sort === 'trending'">{{ $t('c_List.trending') }}</BrowseOpt>
        <BrowseOpt to="/arts/new" :active="sort === 'new'">{{ $t('c_List.newest') }}</BrowseOpt>
        <BrowseOpt v-if="auth.isLogged" :to="sortTo('following')" :active="sort === 'following'">{{ $t('c_List.following') }}</BrowseOpt>
        <BrowseOpt v-if="auth.isLogged" :to="sortTo('liked')" :active="sort === 'liked'">{{ $t('c_List.liked') }}</BrowseOpt>
      </BrowseFilter>

      <slot name="filters-extra"/>
    </template>

    <template v-if="showFilter && $slots.head" #head><slot name="head"/></template>
    <template v-if="showFilter && $slots.actions" #actions><slot name="actions"/></template>

    <slot name="before"/>

    <div v-if="isLoading" class="skeleton-grid">
      <div v-for="i in effectiveLimit" :key="`sk-${i}`" class="skeleton skeleton-square"/>
    </div>
    <div v-else-if="isEmpty" class="empty-state">
      <span class="empty-state-icon icon icon-search" aria-hidden="true"/>
      <div class="empty-state-title">{{ $t('c_List.noPixelArtFound') }}</div>
      <p class="empty-state-body">
        <template v-if="search">
          Nothing matches "{{ search }}". Try a different keyword.
        </template>
        <template v-else-if="hasActiveFilters"> {{ $t('c_List.noPixelArtMatchesTheCurrent') }} </template>
        <template v-else> {{ $t('c_List.theGalleryIsEmptyHereFor') }} </template>
      </p>
      <div class="empty-state-actions">
        <button v-if="hasActiveFilters" class="btn" @click="clearFilters">{{ $t('common.clearFilters') }}</button>
        <NuxtLinkLocale to="/editor" class="btn primary">{{ $t('c_List.startCreating') }}</NuxtLinkLocale>
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
      <span class="browse-foot-start">{{ $t('c_List.itemCount', data.count, {count: data.count}) }}</span>
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
