<script setup lang="ts">
import type {APIResponse, ResponseSharedPage, SharedPage} from '~/types'

const {t} = useI18n()
const route = useRoute()
const artImage = useArtImage()

interface CollectionRow {
  id: number
  id_string: string
  name: string
  desc?: string
  items?: number[]
}

const currentPage = computed(() => route.query.page ? Number.parseInt(route.query.page.toString()) : 1)

const {data} = await useAuthFetch<APIResponse<CollectionRow>>('/coloring/collections/', {
  query: computed(() => ({page: currentPage.value, page_size: 24})),
  key: computed(() => `collections|${currentPage.value}`),
})

const collections = computed(() => data.value?.results || [])

/* Covers, the way the creator page does it: the list sends `items` as bare
   row ids, so the first one is resolved into an image in a single request
   for the whole page rather than one per tile. */
const covers = ref<Record<number, string>>({})
const coverFailed = reactive<Record<number, boolean>>({})

function firstItem(c: CollectionRow) {
  return (Array.isArray(c.items) ? c.items : []).find((i): i is number => typeof i === 'number')
}

async function loadCovers() {
  // Reset alongside the covers: a one-off 404 used to pin a tile to its
  // placeholder for the rest of the session.
  for (const k of Object.keys(coverFailed)) delete coverFailed[k as unknown as number]
  const wanted = collections.value.map(firstItem).filter((i): i is number => typeof i === 'number')
  if (!wanted.length) return
  try {
    const ids = [...new Set(wanted)]
    const res = await useNativeFetch<ResponseSharedPage>('/coloring/shared-pages/', {
      params: {ids: ids.join(','), page_size: ids.length},
    })
    const byId = new Map((res.results || []).map(a => [a.id, a]))
    const next: Record<number, string> = {}
    for (const c of collections.value) {
      const first = firstItem(c)
      const art = first != null ? byId.get(first) : undefined
      if (art) next[c.id] = artImage(art as SharedPage)
    }
    covers.value = next
  } catch {
    // A cover is decoration; the tile falls back to its placeholder.
  }
}

/* Immediate rather than onMounted as well: on a client-side navigation the
   fetch can resolve after mount, and both would have fired. */
watch(collections, loadCovers, {immediate: true})

const {page, prevTo, nextTo} = usePageLinks(data)

const canonicalUrl = computed(() => {
  const base = 'https://simplepixelart.com/collections'
  return currentPage.value > 1 ? `${base}?page=${currentPage.value}` : base
})

useCustomSeoMeta({
  title: computed(() => currentPage.value > 1
      ? `${t('seo.collections.title')} — ${currentPage.value}`
      : t('seo.collections.title')),
  description: () => t('seo.collections.description'),
  keywords: () => t('seo.collections.keywords'),
  canonical: canonicalUrl,
  robots: () => currentPage.value > 1 ? 'noindex, follow' : 'index, follow',
})
</script>

<template>
  <div class="page">
    <BrowseLayout
        :title="$t('p_collections.pixelArtCollections')"
        :desc="$t('p_collections.setsOfPixelArtPutTogether')"
    >
      <div v-if="collections.length" class="results">
        <div v-for="c in collections" :key="c.id" class="cl-tile">
          <NuxtLinkLocale class="card" :to="`/collections/${c.id_string}`" :title="c.name || $t('common.untitled')">
            <div class="square">
              <div class="inside card-pad">
                <img
                    v-if="covers[c.id] && !coverFailed[c.id]"
                    :src="covers[c.id]"
                    :alt="c.name || 'Collection'"
                    class="size-full"
                    loading="lazy"
                    decoding="async"
                    @error="coverFailed[c.id] = true"
                >
                <div v-else class="card-empty"><span class="icon icon-rhombus"/></div>
              </div>
            </div>
          </NuxtLinkLocale>
          <NuxtLinkLocale class="cl-tile-name" :to="`/collections/${c.id_string}`">
            {{ c.name || $t('common.untitled') }}
          </NuxtLinkLocale>
          <span class="cl-tile-n">
            {{ $t('p_collections.pieceCount', (c.items || []).length, {count: (c.items || []).length}) }}
          </span>
        </div>
      </div>

      <div v-else class="empty-state">
        <span class="empty-state-icon icon icon-rhombus" aria-hidden="true"/>
        <div class="empty-state-title">{{ $t('p_collections.noCollectionsYet') }}</div>
        <p class="empty-state-body">{{ $t('p_collections.nobodyHasPublishedASetYet') }}</p>
        <div class="empty-state-actions">
          <NuxtLinkLocale to="/arts" class="btn primary">{{ $t('common.browseGallery') }}</NuxtLinkLocale>
        </div>
      </div>

      <template v-if="collections.length" #foot>
        <span class="browse-foot-start">
          {{ $t('p_collections.collectionCount', data?.count || collections.length, {count: data?.count || collections.length}) }}
        </span>
        <span class="browse-foot-end">
          <Paginator
              :page="page"
              :pages="data?.num_pages || 1"
              :prev-to="prevTo"
              :next-to="nextTo"
          />
        </span>
      </template>
    </BrowseLayout>
  </div>
</template>

<style scoped>
.cl-tile {
  min-width: 0;
}

.cl-tile-name {
  display: block;
  margin-top: var(--space-1);
  font-size: var(--text-xs);
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cl-tile-n {
  display: block;
  font-size: var(--text-2xs);
  color: var(--muted);
}

@media (hover: hover) and (pointer: fine) {
  .cl-tile-name:hover {
    color: var(--primary);
  }
}
</style>
